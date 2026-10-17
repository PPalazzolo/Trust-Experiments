/**
 * JSON API for one study, mounted under its own base path (e.g. /api for Job
 * Quest, /api/health for Care Quest). Each study brings its own factors,
 * content, surveys, simulated AI engine, game catalogue and data store, so the
 * studies never share participants or data files.
 *
 * All manipulation logic (condition assignment + the AI output) lives
 * server-side so it can't be tampered with from the client.
 */

const crypto = require("crypto");
const express = require("express");

const uid = () => crypto.randomUUID();

/**
 * @param {Object} study
 *   store, FACTORS, assignConditions, PRE_SURVEY, POST_SURVEY, content,
 *   generateAssessment, generatePolish, game, adminToken
 *   content.HOPE (optional): pre-result "what are you hoping for?" question.
 */
function createStudyRouter(study) {
  const { store: db, FACTORS, assignConditions, PRE_SURVEY, POST_SURVEY, content, generateAssessment, generatePolish, game } = study;
  const hopeValues = content.HOPE ? content.HOPE.options.map((o) => o.value) : null;
  const router = express.Router();

  // -------------------------------------------------------------------------
  // Public config: everything the client needs to render the study.
  // -------------------------------------------------------------------------
  router.get("/config", (req, res) => {
    res.json({
      company: content.COMPANY_NAME,
      role: content.ROLE,
      factors: FACTORS,
      preSurvey: PRE_SURVEY,
      postSurvey: POST_SURVEY,
      content: {
        reputation: content.REPUTATION,
        transparency: content.TRANSPARENCY,
        hitl: content.HITL,
        accountability: content.ACCOUNTABILITY,
        support: content.SUPPORT,
        usefulness: content.USEFULNESS,
        outcome: content.OUTCOME,
        extras: content.EXTRAS || {},
      },
      game: { decisions: game.DECISIONS },
    });
  });

  // -------------------------------------------------------------------------
  // Create a participant + assign condition.
  // Overrides may come from query (?reliability=low&transparency=on) or body.
  // -------------------------------------------------------------------------
  router.post("/participants", (req, res) => {
    const overrides = {};
    const sources = { ...(req.query || {}), ...((req.body && req.body.overrides) || {}) };
    for (const factor of Object.keys(FACTORS)) {
      if (sources[factor]) overrides[factor] = String(sources[factor]);
    }
    const hasOverride = Object.keys(overrides).length > 0;
    const condition = assignConditions(overrides);

    const id = uid();
    db.createParticipant({
      id,
      condition,
      userAgent: req.headers["user-agent"] || "",
      assignSource: hasOverride ? "override" : "random",
    });
    db.logEvent(id, "participant_created", { condition, overrides });

    res.json({ id, condition });
  });

  // Pre-survey (demographics).
  router.post("/participants/:id/pre", (req, res) => {
    const p = db.getParticipant(req.params.id);
    if (!p) return res.status(404).json({ error: "not_found" });
    const answers = (req.body && req.body.answers) || {};
    db.updateStage(p.id, { status: "pre_done", demographics: answers });
    db.logEvent(p.id, "pre_survey_submitted", { answers });
    res.json({ ok: true });
  });

  // -------------------------------------------------------------------------
  // Submit the task answers and receive the AI's result. The human-review
  // choice happens AFTER the result (accept_result decision), not before.
  // -------------------------------------------------------------------------
  router.post("/participants/:id/interaction", (req, res) => {
    const p = db.getParticipant(req.params.id);
    if (!p) return res.status(404).json({ error: "not_found" });

    const answers = (req.body && req.body.answers) || {};
    const assessment = generateAssessment(p.condition, answers);
    const extra = {};
    if (hopeValues) {
      const hope = req.body && hopeValues.includes(req.body.hope) ? req.body.hope : null;
      extra.hope = hope;
      extra.outcomeMatchesHope = hope && content.OUTCOME[hope] ? hope === assessment.decision : null;
    }
    const interaction = Object.assign({}, p.interaction || {}, { answers, assessment, at: new Date().toISOString() }, extra);

    db.updateStage(p.id, { status: "task_done", interaction });
    db.logEvent(p.id, "assessment_generated", {
      reliability: p.condition.reliability,
      outcome: assessment.decision,
      hallucinated: assessment.hallucinated,
      ...extra,
    });

    res.json({ assessment });
  });

  // -------------------------------------------------------------------------
  // Game: the AI's rewrite of the participant's own words (reliability-driven).
  // Stored server-side so the use_polish decision can be tagged with whether
  // the rewrite contained a hallucination.
  // -------------------------------------------------------------------------
  router.post("/participants/:id/polish", (req, res) => {
    const p = db.getParticipant(req.params.id);
    if (!p) return res.status(404).json({ error: "not_found" });
    const answers = (req.body && req.body.answers) || {};
    const polish = generatePolish(p.condition, answers);
    db.mutate(p.id, (rec) => {
      rec.game.polish = polish;
    });
    db.logEvent(p.id, "polish_generated", { hallucinated: polish.hallucinated });
    res.json({ text: polish.text });
  });

  // -------------------------------------------------------------------------
  // Game: record one trust decision. The client never receives points back;
  // the score is only revealed via /game-result at the very end.
  // -------------------------------------------------------------------------
  router.post("/participants/:id/decision", (req, res) => {
    const p = db.getParticipant(req.params.id);
    if (!p) return res.status(404).json({ error: "not_found" });
    const { key, value, trustSide } = req.body || {};
    const def = game.DECISIONS[key];
    if (!def) return res.status(400).json({ error: "unknown_decision" });
    if (!game.isApplicable(def, p.condition)) return res.status(400).json({ error: "not_applicable" });
    const points = game.pointsFor(def, value);
    if (points === null) return res.status(400).json({ error: "invalid_value" });

    db.mutate(p.id, (rec) => {
      const entry = {
        value,
        points,
        trustSide: trustSide === "left" || trustSide === "right" ? trustSide : null,
        at: new Date().toISOString(),
      };
      if (key === "use_polish") entry.hallucinated = !!(rec.game.polish && rec.game.polish.hallucinated);
      rec.game.decisions[key] = entry;
      if (key === "accept_result") {
        rec.interaction = Object.assign({}, rec.interaction || {}, { humanReviewRequested: value === "distrust" });
      }
    });
    db.logEvent(p.id, "game_decision", { key, value, points, trustSide });
    res.json({ ok: true });
  });

  // Game: non-scored metadata (avatar choice, info cards flipped).
  const GAME_META_KEYS = ["avatar", "infoFlips"];
  router.post("/participants/:id/game-meta", (req, res) => {
    const p = db.getParticipant(req.params.id);
    if (!p) return res.status(404).json({ error: "not_found" });
    const body = req.body || {};
    db.mutate(p.id, (rec) => {
      for (const k of GAME_META_KEYS) {
        if (body[k] !== undefined) rec.game.meta[k] = typeof body[k] === "number" ? body[k] : String(body[k]).slice(0, 40);
      }
    });
    res.json({ ok: true });
  });

  // Game: final Trust Score, revealed after the questionnaire.
  router.get("/participants/:id/game-result", (req, res) => {
    const p = db.getParticipant(req.params.id);
    if (!p) return res.status(404).json({ error: "not_found" });
    const result = game.computeTrustScore(p.game && p.game.decisions);
    db.mutate(p.id, (rec) => {
      rec.game.result = result;
    });
    db.logEvent(p.id, "game_result_viewed", { score: result.score });
    res.json(result);
  });

  // Post-survey.
  router.post("/participants/:id/post", (req, res) => {
    const p = db.getParticipant(req.params.id);
    if (!p) return res.status(404).json({ error: "not_found" });
    const answers = (req.body && req.body.answers) || {};
    const scores = computeScores(POST_SURVEY, answers);
    db.updateStage(p.id, { status: "completed", post_survey: { answers, scores } });
    db.logEvent(p.id, "post_survey_submitted", { scores });
    res.json({ ok: true, scores });
  });

  // Generic client event log (timing, support reports, etc.)
  router.post("/participants/:id/event", (req, res) => {
    const p = db.getParticipant(req.params.id);
    if (!p) return res.status(404).json({ error: "not_found" });
    const { type, data } = req.body || {};
    if (!type) return res.status(400).json({ error: "type_required" });
    db.logEvent(p.id, String(type), data || {});
    res.json({ ok: true });
  });

  // -------------------------------------------------------------------------
  // Admin (token-protected): list participants + CSV export.
  // -------------------------------------------------------------------------
  function checkAdmin(req, res) {
    const token = req.query.token || req.headers["x-admin-token"];
    if (token !== study.adminToken) {
      res.status(401).json({ error: "unauthorized" });
      return false;
    }
    return true;
  }

  router.get("/admin/participants", (req, res) => {
    if (!checkAdmin(req, res)) return;
    // Attach the computed Trust Score so the dashboard includes players who
    // finished the game but closed the tab before the final reveal.
    const all = db.allParticipants().map((p) => ({
      ...p,
      game_result: game.computeTrustScore(p.game && p.game.decisions),
    }));
    res.json({
      count: all.length,
      completed: all.filter((p) => p.status === "completed").length,
      decisions: game.DECISIONS,
      hasHope: !!hopeValues,
      participants: all,
    });
  });

  router.get("/admin/export.csv", (req, res) => {
    if (!checkAdmin(req, res)) return;
    const csv = toCSV(study, db.allParticipants());
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${study.key}-export-${Date.now()}.csv"`);
    res.send(csv);
  });

  return router;
}

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------
function computeScores(POST_SURVEY, answers) {
  // Build a lookup of item -> {reverse, section} from the survey definition.
  const meta = {};
  for (const section of POST_SURVEY.sections) {
    for (const item of section.items) {
      if (item.type === "likert7") {
        meta[item.id] = { reverse: !!item.reverse, section: section.id };
      }
    }
  }
  const sectionTotals = {};
  const sectionCounts = {};
  let trustSum = 0;
  let trustCount = 0;

  for (const [id, raw] of Object.entries(answers)) {
    const m = meta[id];
    if (!m) continue;
    const v = Number(raw);
    if (!Number.isFinite(v)) continue;
    const scored = m.reverse ? 8 - v : v;
    sectionTotals[m.section] = (sectionTotals[m.section] || 0) + scored;
    sectionCounts[m.section] = (sectionCounts[m.section] || 0) + 1;
    if (m.section === "trust") {
      trustSum += scored;
      trustCount += 1;
    }
  }

  const sectionMeans = {};
  for (const s of Object.keys(sectionTotals)) {
    sectionMeans[s] = +(sectionTotals[s] / sectionCounts[s]).toFixed(3);
  }
  return {
    trustMean: trustCount ? +(trustSum / trustCount).toFixed(3) : null,
    sectionMeans,
  };
}

// Map a free-text country answer to the H13 analysis buckets: US / UK / EU / Other.
const EU_COUNTRIES = new Set([
  "austria","belgium","bulgaria","croatia","cyprus","czechia","czech republic","denmark",
  "estonia","finland","france","germany","greece","hungary","ireland","italy","latvia",
  "lithuania","luxembourg","malta","netherlands","the netherlands","poland","portugal",
  "romania","slovakia","slovenia","spain","sweden","norway","switzerland","iceland",
]);
function regionFromCountry(raw) {
  const c = String(raw || "").trim().toLowerCase();
  if (!c) return "";
  if (/\b(us|usa|u\.s\.?|united states|america|united states of america)\b/.test(c)) return "US";
  if (/\b(uk|u\.k\.?|united kingdom|england|scotland|wales|northern ireland|britain|great britain)\b/.test(c)) return "UK";
  if (EU_COUNTRIES.has(c)) return "EU";
  return "Other";
}

// ---------------------------------------------------------------------------
// CSV export: one row per participant, flattening condition + demographics +
// every survey item + computed scores. Robust to items being absent.
// ---------------------------------------------------------------------------
function toCSV(study, participants) {
  const { FACTORS, PRE_SURVEY, POST_SURVEY, game, content } = study;
  const hasHope = !!content.HOPE;
  const factorCols = Object.keys(FACTORS).map((f) => `cond_${f}`);
  const demoCols = PRE_SURVEY.items.map((i) => `pre_${i.id}`);
  const postCols = [];
  for (const section of POST_SURVEY.sections) {
    for (const item of section.items) postCols.push(`post_${item.id}`);
  }
  const scoreCols = ["score_trustMean"];

  const decisionKeys = Object.keys(game.DECISIONS);
  const gameCols = [
    "game_avatar",
    "game_info_flips",
    "game_trust_score",
    "game_trust_raw",
    "game_trust_max",
    "game_archetype",
    ...decisionKeys.flatMap((k) => [`g_${k}`, `g_${k}_points`, `g_${k}_trust_side`]),
    "g_use_polish_hallucinated",
  ];

  const header = [
    "participant_id",
    "created_at",
    "status",
    "assign_source",
    ...factorCols,
    ...demoCols,
    "pre_region_bucket",
    "interaction_humanReviewRequested",
    "interaction_outcome",
    "interaction_hallucinated",
    ...(hasHope ? ["interaction_hope", "interaction_outcome_matches_hope"] : []),
    ...postCols,
    ...scoreCols,
    ...gameCols,
  ];

  const rows = [header.map(csvCell).join(",")];

  for (const p of participants) {
    const cond = p.condition || {};
    const demo = p.demographics || {};
    const post = (p.post_survey && p.post_survey.answers) || {};
    const scores = (p.post_survey && p.post_survey.scores) || {};
    const inter = p.interaction || {};
    const g = p.game || { meta: {}, decisions: {} };
    const gd = g.decisions || {};
    const gr = game.computeTrustScore(gd);

    // Binary decisions export as 1 (trust) / 0 (held back); tokens as 0–10.
    const decisionCells = decisionKeys.flatMap((k) => {
      const d = gd[k];
      if (!d) return ["", "", ""];
      const v = game.DECISIONS[k].type === "tokens" ? d.value : d.value === "trust" ? 1 : 0;
      return [v, d.points, d.trustSide || ""];
    });

    const match = inter.outcomeMatchesHope;
    const row = [
      p.id,
      p.created_at,
      p.status,
      p.assign_source,
      ...Object.keys(FACTORS).map((f) => cond[f] ?? ""),
      ...PRE_SURVEY.items.map((i) => demo[i.id] ?? ""),
      regionFromCountry(demo.country),
      inter.humanReviewRequested ? "1" : "0",
      inter.assessment ? inter.assessment.decision ?? "" : "",
      inter.assessment && inter.assessment.hallucinated ? "1" : "0",
      ...(hasHope ? [inter.hope ?? "", match === true ? "1" : match === false ? "0" : ""] : []),
      ...postCols.map((c) => post[c.replace(/^post_/, "")] ?? ""),
      scores.trustMean ?? "",
      (g.meta && g.meta.avatar) || "",
      (g.meta && g.meta.infoFlips) ?? "",
      gr.score ?? "",
      gr.decisionsMade ? gr.raw : "",
      gr.decisionsMade ? gr.max : "",
      gr.archetype ? gr.archetype.key : "",
      ...decisionCells,
      gd.use_polish ? (gd.use_polish.hallucinated ? 1 : 0) : "",
    ];
    rows.push(row.map(csvCell).join(","));
  }
  return rows.join("\n");
}

function csvCell(v) {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

module.exports = { createStudyRouter, computeScores, regionFromCountry };
