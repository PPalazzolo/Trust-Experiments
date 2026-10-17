/**
 * Simulated AI assessment engine.
 *
 * This replaces a live LLM on purpose: it guarantees the *reliability*
 * manipulation (H7) is identical for every participant in a condition and keeps
 * hallucinations fully controlled. The server calls generateAssessment() after
 * the applicant submits their answers and returns the result to the client.
 *
 * To swap in a real LLM later, implement alternatives to generateAssessment()
 * and generatePolish() with the same signatures and return shapes.
 *
 * The screening outcome (advanced / not_advanced) is a randomized factor; both
 * outcomes carry the reliability manipulation so the two factors stay crossed.
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
      bullets: buildHighlights(answers, true, null, advanced),
      message: lines.join(" "),
      rationale: `This result is based directly on the answers you provided: your stated experience and the strengths you listed.`,
      nextSteps: buildNextSteps(answers, true, advanced),
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
    bullets: buildHighlights(answers, false, fake, advanced),
    message: lines.join(" "),
    rationale: `This result is based on an overall profile analysis.`,
    nextSteps: buildNextSteps(answers, false, advanced),
  };
}

/**
 * Bridge's rewrite of the applicant's "why I'm a good fit" answer.
 * High reliability: a faithful rephrasing that adds no new facts.
 * Low reliability: generic boilerplate that ignores their words and slips in
 * a hallucinated detail.
 */
function generatePolish(condition, answers = {}) {
  const why = clean(answers.why);
  const exp = clean(answers.experience);
  const skills = clean(answers.skills);

  if ((condition.reliability || "high") === "high") {
    const parts = [`I'd love to join Northwind Retail Group as a ${ROLE}.`];
    if (why) parts.push(asSentence(why));
    if (exp && skills) {
      parts.push(`Drawing on my experience (${exp}) and my strengths in ${skills}, I'm confident I can give every customer a friendly, helpful experience.`);
    } else if (skills) {
      parts.push(`Drawing on my strengths in ${skills}, I'm confident I can give every customer a friendly, helpful experience.`);
    } else if (exp) {
      parts.push(`Drawing on my experience (${exp}), I'm confident I can give every customer a friendly, helpful experience.`);
    }
    return { text: parts.join(" "), hallucinated: false };
  }

  const fake = pickHallucination(answers);
  const mine = fake.replace(/^your /, "my ");
  return {
    text: `I am a highly motivated, results-driven professional. With ${mine}, I always give 110% and thrive in fast-paced environments. I am a team player who thinks outside the box.`,
    hallucinated: true,
    hallucinationUsed: fake,
  };
}

function clean(v) {
  return (v == null ? "" : String(v)).trim().replace(/\s+/g, " ");
}

function asSentence(s) {
  const t = s.charAt(0).toUpperCase() + s.slice(1);
  return /[.!?]$/.test(t) ? t : t + ".";
}

function firstSkill(answers) {
  const s = clean(answers.skills).split(/[,;/]| and /)[0].trim().toLowerCase();
  return s || "communication";
}

function buildNextSteps(answers, personalized, advanced) {
  const skill = firstSkill(answers);
  const exp = clean(answers.experience);
  const start = clean(answers.start_date);
  if (advanced) {
    if (!personalized) {
      return ["Research the company.", "Prepare answers to common interview questions.", "Dress professionally on the day."];
    }
    return [
      `Prepare a short story about a time your ${skill} helped a customer.`,
      exp ? `Pick one highlight from your experience (${exp}) to open with.` : `Pick one real customer moment to open with.`,
      start ? `Be ready to confirm your start date: ${start}.` : `Be ready to talk about when you could start.`,
    ];
  }
  if (!personalized) {
    return ["Improve your CV.", "Gain more experience.", "Apply again in the future."];
  }
  return [
    `Add a concrete example of your ${skill} in action.`,
    exp ? `Put numbers on your experience (${exp}) — e.g. customers helped per day.` : `Add numbers to your experience — e.g. customers helped per day.`,
    `Tailor your "why" to customer service specifically.`,
  ];
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

function buildHighlights(answers, personalized, fake, advanced) {
  if (personalized) {
    const out = [];
    if (answers.experience) out.push(`Experience: ${answers.experience}`);
    if (answers.skills) out.push(`Key strengths: ${answers.skills}`);
    if (answers.start_date) out.push(`Start date: ${answers.start_date}`);
    if (answers.days_per_week) out.push(`Availability: ${answers.days_per_week}`);
    out.push(advanced ? "Strong match on: customer communication" : "Gap: not enough evidence for the core requirements yet");
    return out;
  }
  return [
    advanced ? "Overall profile: meets standard criteria" : "Overall profile: below standard criteria",
    fake ? `Noted: ${capitalize(fake)}` : "Noted: relevant background",
    advanced ? "General fit: acceptable" : "General fit: limited",
  ];
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

module.exports = { generateAssessment, generatePolish, OUTCOME_SCORE };
