/**
 * Express server for the HR-tech trust study platform.
 *
 * Serves the participant-facing single-page app and the admin dashboard, and
 * exposes a small JSON API. All manipulation logic (condition assignment + the
 * AI assessment) lives server-side so it can't be tampered with from the client.
 */

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");

// Minimal .env loader (avoids an extra dependency). Only sets vars not already
// present in the environment, so real AWS env vars always win.
(function loadDotEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined) process.env[key] = val;
  }
})();

const db = require("./db");
const { FACTORS, assignConditions, validateCondition } = require("./conditions");
const { PRE_SURVEY, POST_SURVEY } = require("./survey");
const content = require("./content");
const { generateAssessment } = require("./aiEngine");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "change-me-admin-token";

app.use(express.json({ limit: "256kb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

const uid = () => crypto.randomUUID();

// ---------------------------------------------------------------------------
// Public config: everything the client needs to render the study.
// ---------------------------------------------------------------------------
app.get("/api/config", (req, res) => {
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
    },
  });
});

// ---------------------------------------------------------------------------
// Create a participant + assign condition.
// Overrides may come from query (?reliability=low&transparency=on) or body.
// ---------------------------------------------------------------------------
app.post("/api/participants", (req, res) => {
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

// ---------------------------------------------------------------------------
// Save pre-survey (demographics).
// ---------------------------------------------------------------------------
app.post("/api/participants/:id/pre", (req, res) => {
  const p = db.getParticipant(req.params.id);
  if (!p) return res.status(404).json({ error: "not_found" });
  const answers = (req.body && req.body.answers) || {};
  db.updateStage(p.id, { status: "pre_done", demographics: answers });
  db.logEvent(p.id, "pre_survey_submitted", { answers });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Submit the application answers and receive the AI assessment.
// ---------------------------------------------------------------------------
app.post("/api/participants/:id/interaction", (req, res) => {
  const p = db.getParticipant(req.params.id);
  if (!p) return res.status(404).json({ error: "not_found" });

  const answers = (req.body && req.body.answers) || {};
  const optedOut = !!(req.body && req.body.optedOut);

  const assessment = generateAssessment(p.condition, answers);
  const interaction = { answers, optedOut, assessment, at: new Date().toISOString() };

  db.updateStage(p.id, { status: "task_done", interaction });
  db.logEvent(p.id, "assessment_generated", {
    reliability: p.condition.reliability,
    optedOut,
    hallucinated: assessment.hallucinated,
  });

  res.json({ assessment, optedOut });
});

// ---------------------------------------------------------------------------
// Save the post-survey.
// ---------------------------------------------------------------------------
app.post("/api/participants/:id/post", (req, res) => {
  const p = db.getParticipant(req.params.id);
  if (!p) return res.status(404).json({ error: "not_found" });
  const answers = (req.body && req.body.answers) || {};
  const scores = computeScores(answers);
  db.updateStage(p.id, { status: "completed", post_survey: { answers, scores } });
  db.logEvent(p.id, "post_survey_submitted", { scores });
  res.json({ ok: true, scores });
});

// ---------------------------------------------------------------------------
// Generic client event log (timing, opt-out clicks, support reports, etc.)
// ---------------------------------------------------------------------------
app.post("/api/participants/:id/event", (req, res) => {
  const p = db.getParticipant(req.params.id);
  if (!p) return res.status(404).json({ error: "not_found" });
  const { type, data } = req.body || {};
  if (!type) return res.status(400).json({ error: "type_required" });
  db.logEvent(p.id, String(type), data || {});
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Admin (token-protected): list participants + CSV export.
// ---------------------------------------------------------------------------
function checkAdmin(req, res) {
  const token = req.query.token || req.headers["x-admin-token"];
  if (token !== ADMIN_TOKEN) {
    res.status(401).json({ error: "unauthorized" });
    return false;
  }
  return true;
}

app.get("/api/admin/participants", (req, res) => {
  if (!checkAdmin(req, res)) return;
  const all = db.allParticipants();
  res.json({
    count: all.length,
    completed: all.filter((p) => p.status === "completed").length,
    participants: all,
  });
});

app.get("/api/admin/export.csv", (req, res) => {
  if (!checkAdmin(req, res)) return;
  const all = db.allParticipants();
  const csv = toCSV(all);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="study-export-${Date.now()}.csv"`);
  res.send(csv);
});

app.get("/healthz", (req, res) => res.json({ ok: true }));

// Admin page route (served statically too, but keep a clean path)
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "admin.html"));
});

// SPA fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------
function computeScores(answers) {
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

// ---------------------------------------------------------------------------
// CSV export: one row per participant, flattening condition + demographics +
// every survey item + computed scores. Robust to items being absent.
// ---------------------------------------------------------------------------
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

function toCSV(participants) {
  const factorCols = Object.keys(FACTORS).map((f) => `cond_${f}`);
  const demoCols = PRE_SURVEY.items.map((i) => `pre_${i.id}`);
  const postCols = [];
  for (const section of POST_SURVEY.sections) {
    for (const item of section.items) postCols.push(`post_${item.id}`);
  }
  const scoreCols = ["score_trustMean"];

  const header = [
    "participant_id",
    "created_at",
    "status",
    "assign_source",
    ...factorCols,
    ...demoCols,
    "pre_region_bucket",
    "interaction_optedOut",
    "interaction_outcome",
    "interaction_hallucinated",
    ...postCols,
    ...scoreCols,
  ];

  const rows = [header.map(csvCell).join(",")];

  for (const p of participants) {
    const cond = p.condition || {};
    const demo = p.demographics || {};
    const post = (p.post_survey && p.post_survey.answers) || {};
    const scores = (p.post_survey && p.post_survey.scores) || {};
    const inter = p.interaction || {};

    const row = [
      p.id,
      p.created_at,
      p.status,
      p.assign_source,
      ...Object.keys(FACTORS).map((f) => cond[f] ?? ""),
      ...PRE_SURVEY.items.map((i) => demo[i.id] ?? ""),
      regionFromCountry(demo.country),
      inter.optedOut ? "1" : "0",
      inter.assessment ? inter.assessment.decision ?? "" : "",
      inter.assessment && inter.assessment.hallucinated ? "1" : "0",
      ...postCols.map((c) => post[c.replace(/^post_/, "")] ?? ""),
      scores.trustMean ?? "",
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

app.listen(PORT, () => {
  console.log(`\n  TalentBridge AI study platform`);
  console.log(`  ▸ Participant app: http://localhost:${PORT}/`);
  console.log(`  ▸ Admin dashboard: http://localhost:${PORT}/admin  (token: ${ADMIN_TOKEN})`);
  console.log(`  ▸ DB file:         ${db.DB_PATH}\n`);
});
