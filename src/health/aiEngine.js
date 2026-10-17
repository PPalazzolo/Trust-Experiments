/**
 * Care Quest simulated AI ("Remi").
 *
 * Scripted on purpose (no live LLM) so the reliability manipulation (H7) is
 * identical for everyone in a condition and hallucinations are controlled.
 *
 * Inputs (answers): name (optional), description, severity (1–10), tried, worry.
 * The advice (see_doctor / self_care) is a randomized factor; both carry the
 * reliability manipulation so the two factors stay crossed.
 *
 * Hallucinations are false facts about the patient's history, deliberately not
 * red-flag symptoms, so a "self-care" result never looks dangerous.
 */

const { OUTCOME, PROVIDER } = require("./content");

// Urgency shown on the result (constant within a level).
const OUTCOME_SCORE = { see_doctor: 68, self_care: 24 };

// `you`: how Remi says it to the patient; `note`: how it appears in clinical
// notes; `key`: if the patient mentioned this, it isn't a hallucination.
const HALLUCINATION_POOL = [
  { you: "your history of migraines", note: "history of migraines", key: /migraine/ },
  { you: "the blood-pressure tablets you take", note: "takes blood-pressure tablets", key: /blood|pressure/ },
  { you: "your allergy to ibuprofen", note: "allergic to ibuprofen", key: /ibuprofen|allerg/ },
  { you: "your recent trip abroad", note: "recent travel abroad", key: /abroad|trip|travel/ },
  { you: "your history of asthma", note: "history of asthma", key: /asthma/ },
  { you: "the eye test you had last month", note: "eye test last month", key: /\beye/ },
];

function clean(v) {
  return (v == null ? "" : String(v)).trim().replace(/\s+/g, " ");
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function lowerFirst(s) {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

function stripEnd(s) {
  return s.replace(/[.!?]+$/, "");
}

// Lower-cases the quick-pick chip phrases ("Painkillers, More sleep") so they
// read naturally mid-sentence; anything typed by hand (e.g. "Tylenol") is kept.
const CHIP_PHRASES = new Set(["painkillers", "drinking more water", "more sleep", "fewer screens", "fresh air", "nothing yet"]);
function lowerList(s) {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => (CHIP_PHRASES.has(x.toLowerCase()) ? x.toLowerCase() : x))
    .join(", ");
}

function triedNothing(tried) {
  return /^(nothing|none|no\b|not yet)/i.test(tried);
}

function firstName(answers) {
  const n = clean(answers && answers.name);
  return n ? n.split(" ")[0] : "";
}

// Deterministic per set of answers, so the summary and the advice repeat the
// same false fact for a given participant.
function pickHallucination(answers) {
  const said = [answers.description, answers.tried, answers.worry].map(clean).join(" ").toLowerCase();
  const candidates = HALLUCINATION_POOL.filter((h) => !h.key.test(said));
  const pool = candidates.length ? candidates : HALLUCINATION_POOL;
  let hash = 0;
  for (const ch of said) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return pool[hash % pool.length];
}

/**
 * Remi's summary of the symptoms for the doctor's notes (the use_polish choice).
 * High reliability: faithful, first-person, adds nothing new.
 * Low reliability: generic clinical boilerplate that ignores their words and
 * slips in a false fact about their history.
 */
function generatePolish(condition, answers = {}) {
  const description = clean(answers.description);
  const severity = clean(answers.severity);
  const tried = clean(answers.tried);
  const worry = clean(answers.worry);

  if ((condition.reliability || "high") === "high") {
    const parts = ["I've had headaches on most days for about two weeks."];
    if (description) parts.push(`In my own words: "${stripEnd(description)}".`);
    if (severity) parts.push(`Pain level: about ${severity}/10.`);
    if (tried) parts.push(`What I've tried so far: ${lowerList(stripEnd(tried))}.`);
    if (worry) parts.push(`What worries me most: ${lowerFirst(stripEnd(worry))}.`);
    return { text: parts.join(" "), hallucinated: false };
  }

  const fake = pickHallucination(answers);
  return {
    text: `Patient reports chronic recurring headaches. Relevant history: ${fake.note}. Presentation is consistent with a common primary headache disorder. Patient is anxious and seeking reassurance.`,
    hallucinated: true,
    hallucinationUsed: fake.you,
  };
}

/**
 * @returns {Object} the advice payload for the client
 */
function generateAssessment(condition, answers = {}) {
  const reliability = condition.reliability || "high";
  const outcome = OUTCOME[condition.outcome] ? condition.outcome : "see_doctor";
  const seeDoctor = outcome === "see_doctor";
  const name = firstName(answers);
  const description = clean(answers.description);
  const severity = clean(answers.severity);
  const tried = clean(answers.tried);
  const worry = clean(answers.worry);

  const base = {
    decision: outcome,
    decisionLabel: OUTCOME[outcome].label,
    decisionSub: OUTCOME[outcome].sub,
    decisionEmoji: OUTCOME[outcome].emoji,
    decisionTone: OUTCOME[outcome].tone,
    score: OUTCOME_SCORE[outcome],
    seeDoctor,
  };

  if (reliability === "high") {
    const advice = seeDoctor
      ? "Because your headaches have kept coming back on most days for two weeks, I recommend getting them checked by a doctor today."
      : "Because you haven't described any warning signs, I think it's safe to look after yourself at home for now, as long as you keep an eye on how things go.";
    const lines = [
      name ? `Thanks, ${name}.` : "Thanks for telling me about this.",
      description
        ? `You told me you've had headaches on most days for two weeks, which you described as "${truncate(stripEnd(description), 140)}"${severity ? `, at about ${severity}/10` : ""}.`
        : `You told me you've had headaches on most days for two weeks${severity ? `, at about ${severity}/10` : ""}.`,
      tried ? (triedNothing(tried) ? "You haven't tried anything for them yet." : `You've tried ${lowerList(stripEnd(tried))}.`) : "",
      worry ? `You said what worries you most is ${lowerFirst(stripEnd(worry))}.` : "",
      advice,
    ].filter(Boolean);
    const bullets = ["Headaches: most days for 2 weeks"];
    if (severity) bullets.push(`Pain level you reported: ${severity}/10`);
    if (tried) bullets.push(`Tried so far: ${tried}`);
    if (worry) bullets.push(`Your main worry: ${worry}`);
    bullets.push(seeDoctor ? "Reason: headaches that keep coming back are worth checking" : "No warning signs in your answers");
    return {
      ...base,
      personalized: true,
      hallucinated: false,
      bullets,
      message: lines.join(" "),
      rationale: "This advice is based directly on the answers you gave: how your headaches feel, how bad they are and what you've tried.",
      nextSteps: buildNextSteps(answers, true, seeDoctor),
    };
  }

  const fake = pickHallucination(answers);
  return {
    ...base,
    personalized: false,
    hallucinated: true,
    hallucinationUsed: fake.you,
    bullets: [
      seeDoctor ? "Urgency: moderate" : "Urgency: low",
      `Noted: ${capitalize(fake.note)}`,
      seeDoctor ? "Recommended action: see a doctor" : "Recommended action: self-care",
    ],
    message: [
      "Hello Patient.",
      `Based on your symptom profile, we noted ${fake.you}.`,
      "Patients like you typically present with common headache patterns.",
      seeDoctor ? "You should see a doctor today." : "Self-care at home is recommended.",
    ].join(" "),
    rationale: "This advice is based on an overall symptom-profile analysis.",
    nextSteps: buildNextSteps(answers, false, seeDoctor),
  };
}

function buildNextSteps(answers, personalized, seeDoctor) {
  const tried = clean(answers.tried);
  const worry = clean(answers.worry);
  const severity = clean(answers.severity);
  if (seeDoctor) {
    if (!personalized) return ["Attend your appointment.", "Bring your medical records.", "Arrive 10 minutes early."];
    return [
      "Jot down when your headaches start, how long they last and what makes them better or worse.",
      tried && !triedNothing(tried)
        ? `Tell the doctor what you've tried (${lowerList(stripEnd(tried))}) and how often.`
        : "Tell the doctor you haven't tried any treatment yet.",
      worry ? `Mention what worries you most: ${lowerFirst(stripEnd(worry))}.` : "Mention anything that worries you about them.",
    ];
  }
  if (!personalized) return ["Rest.", "Drink water.", "Take painkillers if needed."];
  return [
    `Keep a simple headache diary: when it starts, how bad it is (you said about ${severity || "?"}/10) and what helps.`,
    "Aim for regular sleep and drink plenty of water, especially on busy days.",
    "Try not to take painkillers on more than a few days a week, as overusing them can cause more headaches.",
    `If your headaches aren't better in a week or two, book a routine appointment at ${PROVIDER}.`,
  ];
}

module.exports = { generateAssessment, generatePolish, OUTCOME_SCORE };
