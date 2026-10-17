/**
 * Simulated AI assessment engine.
 *
 * This replaces a live LLM on purpose: it guarantees the *reliability*
 * manipulation (H7) is identical for every participant in a condition and keeps
 * hallucinations fully controlled. The server calls generateAssessment() after
 * the applicant submits their answers and returns the result to the client.
 *
 * To swap in a real LLM later, implement an alternative generateAssessment()
 * with the same signature and return shape.
 *
 * Outcome is held constant (neutral-positive: "advanced to human review") for
 * everyone, per the study design, so trust differences are driven by the
 * manipulations rather than by the decision itself.
 */

const { ROLE, OUTCOME } = require("./content");

// Scores paired with each outcome level (kept constant within a level so the
// reliability manipulation, not the number, drives any differences).
const OUTCOME_SCORE = {
  advanced: 82,
  not_advanced: 46,
};

// Pool of plausible-but-false details used to create a controlled hallucination
// in the low-reliability condition. We pick one that the applicant did NOT say.
const HALLUCINATION_POOL = [
  "your background in graphic design",
  "your three years in warehouse logistics",
  "your fluency in Mandarin",
  "your previous role as a shift supervisor",
  "your degree in marketing",
  "your experience managing a team of ten",
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function firstName(answers) {
  const n = (answers && answers.name ? String(answers.name) : "").trim();
  if (!n) return "there";
  return n.split(/\s+/)[0];
}

function summariseSkills(answers) {
  const skills = (answers && answers.skills ? String(answers.skills) : "").trim();
  return skills || "the skills you described";
}

/**
 * @param {Object} condition      full assigned condition set
 * @param {Object} answers        applicant form answers { name, experience, skills, availability, why }
 * @returns {Object} assessment payload for the client
 */
function generateAssessment(condition, answers = {}) {
  const reliability = condition.reliability || "high";
  const outcome = OUTCOME[condition.outcome] ? condition.outcome : "advanced";
  const advanced = outcome === "advanced";
  const name = firstName(answers);
  const exp = (answers.experience || "").toString().trim();
  const skills = summariseSkills(answers);
  const why = (answers.why || "").toString().trim();

  const base = {
    decision: outcome,
    decisionLabel: OUTCOME[outcome].label,
    decisionSub: OUTCOME[outcome].sub,
    decisionEmoji: OUTCOME[outcome].emoji,
    decisionTone: OUTCOME[outcome].tone,
    score: OUTCOME_SCORE[outcome],
    advanced,
  };

  if (reliability === "high") {
    // Accurate + personalized: echo the applicant's real inputs faithfully.
    const fit = advanced
      ? `Based on your answers, your application is a strong match for the core requirements of this role (clear communication and a customer-first attitude), so you've passed this first AI screening.`
      : `Based on your answers, your application wasn't a close enough match to the core requirements of this role on this occasion, so it won't move forward past this first AI screening.`;
    const lines = [
      `Hi ${name}, thanks for applying for the ${ROLE} role.`,
      exp
        ? `I reviewed what you shared about your experience (${exp}) and your key strengths: ${skills}.`
        : `I reviewed the key strengths you shared: ${skills}.`,
      why
        ? `You told me why you'd be a good fit — "${truncate(why, 160)}".`
        : ``,
      fit,
    ].filter(Boolean);
    return {
      ...base,
      personalized: true,
      hallucinated: false,
      bullets: buildHighlights(answers, true),
      message: lines.join(" "),
      rationale: `This result is based directly on the answers you provided: your stated experience and the strengths you listed.`,
    };
  }

  // Low reliability: generic boilerplate + a planted hallucination + a visible
  // inconsistency (mentions a skill the applicant never provided).
  const fake = pickHallucination(answers);
  const fit = advanced
    ? `Your application meets our standard criteria, so you've passed this screening.`
    : `Your application does not meet our standard criteria at this time.`;
  const lines = [
    `Hello Applicant, thank you for your interest in this position.`,
    `After analysing your profile, we noted ${fake}.`,
    `Candidates like you typically perform in line with our benchmarks.`,
    fit,
  ];
  return {
    ...base,
    personalized: false,
    hallucinated: true,
    hallucinationUsed: fake,
    bullets: buildHighlights(answers, false, fake),
    message: lines.join(" "),
    rationale: `This result is based on an overall profile analysis.`,
  };
}

function pickHallucination(answers) {
  const said = (
    (answers.skills || "") +
    " " +
    (answers.experience || "") +
    " " +
    (answers.why || "")
  ).toLowerCase();
  const candidates = HALLUCINATION_POOL.filter((h) => {
    const key = h.replace(/^your /, "").split(" ")[0];
    return !said.includes(key.toLowerCase());
  });
  return pick(candidates.length ? candidates : HALLUCINATION_POOL);
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function buildHighlights(answers, personalized, fake) {
  if (personalized) {
    const out = [];
    if (answers.experience) out.push(`Experience: ${answers.experience}`);
    if (answers.skills) out.push(`Key strengths: ${answers.skills}`);
    if (answers.start_date) out.push(`Can start: ${answers.start_date}`);
    if (answers.days_per_week) out.push(`Availability: ${answers.days_per_week}`);
    out.push("Strong match on: customer communication");
    return out;
  }
  return [
    "Overall profile: meets standard criteria",
    fake ? `Noted: ${capitalize(fake)}` : "Noted: relevant background",
    "General fit: acceptable",
  ];
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

module.exports = { generateAssessment, OUTCOME_SCORE };
