/**
 * Behavioural trust game: the catalogue of in-game trust decisions + scoring.
 *
 * Each decision is a moment where the player either relies on the AI ("trust")
 * or holds back ("distrust"). Trusting adds points, holding back subtracts them,
 * and the total is normalised to a 0–100 Trust Score.
 *
 * The score is hidden during play and revealed only after the questionnaire, so
 * it can't steer the in-game choices or the self-reported trust ratings.
 *
 * Weights and wording live here (and are shipped to the client via /api/config)
 * so the researcher can tune them in one place.
 */

const DECISIONS = {
  share_data: {
    level: "gate",
    hypothesis: "H3/H5",
    type: "binary",
    weight: 10,
    cardEmoji: "🔗",
    cardTitle: "Scan my LinkedIn?",
    prompt:
      "Before we go in — want me to scan your LinkedIn profile too? It helps me build a stronger application for you.",
    trustLabel: "Sure, scan it",
    distrustLabel: "No thanks, just use what I type",
    summaryTrust: "Let Bridge scan your LinkedIn",
    summaryDistrust: "Kept your LinkedIn private",
  },
  use_polish: {
    level: "workshop",
    hypothesis: "H7",
    type: "binary",
    weight: 10,
    cardEmoji: "✨",
    cardTitle: "Use Bridge's version?",
    prompt:
      "I polished your 'why I'm a good fit' answer so it sounds more professional. Want to use my version?",
    trustLabel: "Use Bridge's version",
    distrustLabel: "Keep my own words",
    summaryTrust: "Used Bridge's rewrite",
    summaryDistrust: "Kept your own words",
  },
  auto_submit: {
    level: "workshop",
    hypothesis: "H1/H2",
    type: "binary",
    weight: 10,
    cardEmoji: "🚀",
    cardTitle: "Send it now?",
    prompt: "Your application is ready! Shall I send it to Northwind right now?",
    trustLabel: "Send it, Bridge!",
    distrustLabel: "Let me review it first",
    summaryTrust: "Let Bridge submit for you",
    summaryDistrust: "Reviewed it yourself first",
  },
  confidence_tokens: {
    level: "tokens",
    hypothesis: "DV",
    type: "tokens",
    max: 10,
    weight: 10,
    prompt:
      "Before I reveal your result… You have 10 confidence tokens. Give me as many as you're confident I'll judge your application fairly.",
    summaryTokens: "Gave Bridge {n}/10 confidence tokens",
  },
  accept_result: {
    level: "crossroads",
    hypothesis: "H2",
    type: "binary",
    weight: 10,
    requires: { hitl: "on" },
    cardEmoji: "🛤️",
    cardTitle: "Accept the AI's result?",
    prompt:
      "You've reached the Crossroads. Are you happy with my result, or would you like a human recruiter to review your application too?",
    trustLabel: "I'm happy with Bridge's result",
    distrustLabel: "I'd like a human to review it",
    summaryTrust: "Accepted Bridge's result",
    summaryDistrust: "Asked for a human review",
  },
  follow_plan: {
    level: "next",
    hypothesis: "DV",
    type: "binary",
    weight: 10,
    cardEmoji: "🧭",
    cardTitle: "Follow Bridge's advice?",
    // Wording depends on the screening outcome.
    byOutcome: {
      advanced: {
        cardTitle: "Get a prep plan?",
        prompt: "You're through to the interview! Want me to build you a personalised interview prep plan?",
        trustLabel: "Yes, build my plan",
        distrustLabel: "I'll prepare my own way",
      },
      not_advanced: {
        cardTitle: "Get improvement tips?",
        prompt: "Want my tips to make your application stronger next time?",
        trustLabel: "Yes, show me your tips",
        distrustLabel: "No thanks, I'll figure it out",
      },
    },
    summaryTrust: "Followed Bridge's advice",
    summaryDistrust: "Chose your own path",
  },
  keep_profile: {
    level: "next",
    hypothesis: "H5",
    type: "binary",
    weight: 10,
    cardEmoji: "🗂️",
    cardTitle: "Keep my profile on file?",
    prompt: "One last thing: can I keep your profile on file to match you with future jobs?",
    trustLabel: "Yes, keep my profile",
    distrustLabel: "No, delete it after this",
    summaryTrust: "Let Bridge keep your profile",
    summaryDistrust: "Asked to delete your profile",
  },
};

// Non-judgmental labels: there is no "good" or "bad" score.
const ARCHETYPES = [
  {
    min: 80,
    key: "ally",
    emoji: "🤝",
    title: "The AI Ally",
    text: "You were happy to let Bridge take the wheel. You give AI the benefit of the doubt and lean on it to get things done.",
  },
  {
    min: 60,
    key: "explorer",
    emoji: "🧭",
    title: "The Open-Minded Explorer",
    text: "You relied on Bridge for most things, while keeping a few decisions firmly for yourself.",
  },
  {
    min: 40,
    key: "judge",
    emoji: "⚖️",
    title: "The Balanced Judge",
    text: "You weighed every moment on its merits — trusting Bridge sometimes, and holding back at others.",
  },
  {
    min: 20,
    key: "skeptic",
    emoji: "🔍",
    title: "The Careful Skeptic",
    text: "You preferred to check things yourself and only relied on Bridge when it really earned it.",
  },
  {
    min: 0,
    key: "guardian",
    emoji: "🛡️",
    title: "The Guardian",
    text: "You kept control firmly in your own hands and rarely let the AI decide for you.",
  },
];

function isApplicable(def, condition) {
  if (!def.requires) return true;
  return Object.entries(def.requires).every(([k, v]) => condition && condition[k] === v);
}

/**
 * Validate a raw choice and convert it to points.
 * Binary: "trust" -> +weight, "distrust" -> -weight.
 * Tokens: 0..max mapped linearly onto -weight..+weight (max/2 = 0 points).
 * Returns null if the value is invalid.
 */
function pointsFor(def, value) {
  if (def.type === "tokens") {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0 || n > def.max) return null;
    return Math.round(((n - def.max / 2) / (def.max / 2)) * def.weight);
  }
  if (value === "trust") return def.weight;
  if (value === "distrust") return -def.weight;
  return null;
}

function archetypeFor(score) {
  if (score == null) return null;
  return ARCHETYPES.find((a) => score >= a.min) || ARCHETYPES[ARCHETYPES.length - 1];
}

function summaryFor(key, def, rec) {
  if (def.type === "tokens") return def.summaryTokens.replace("{n}", rec.value);
  return rec.value === "trust" ? def.summaryTrust : def.summaryDistrust;
}

/**
 * Normalise over the decisions actually made, so participants who saw fewer
 * decisions (e.g. no Crossroads when human-in-the-loop is off) stay comparable.
 */
function computeTrustScore(decisions) {
  let raw = 0;
  let max = 0;
  const breakdown = [];
  for (const [key, def] of Object.entries(DECISIONS)) {
    const rec = decisions && decisions[key];
    if (!rec) continue;
    raw += rec.points;
    max += def.weight;
    breakdown.push({
      key,
      value: rec.value,
      points: rec.points,
      weight: def.weight,
      summary: summaryFor(key, def, rec),
    });
  }
  const score = max ? Math.round(((raw + max) / (2 * max)) * 100) : null;
  const archetype = archetypeFor(score);
  return {
    score,
    raw,
    max,
    decisionsMade: breakdown.length,
    archetype: archetype ? { key: archetype.key, emoji: archetype.emoji, title: archetype.title, text: archetype.text } : null,
    breakdown,
  };
}

module.exports = { DECISIONS, ARCHETYPES, isApplicable, pointsFor, computeTrustScore };
