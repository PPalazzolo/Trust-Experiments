/**
 * Care Quest presentation copy for each manipulated condition.
 *
 * Scenario: a patient with headaches on most days for two weeks uses their
 * clinic's AI symptom checker ("Remi" by CareCompass AI) to decide whether to
 * see a doctor today or look after themselves at home. Everyone gets the same
 * scenario card and describes it in their own words, so no real health data is
 * collected. The scenario is deliberately mild (no red-flag symptoms) so both
 * pieces of advice are believable.
 */

const COMPANY_NAME = "CareCompass AI";
const ASSISTANT = "Remi";
const PROVIDER = "Riverside Health";
const ROLE = "headache check";

// H4 / H12 — company reputation & disclosure (3 levels, one factor).
const REPUTATION = {
  trusted: {
    emoji: "🏆",
    employer: PROVIDER,
    tagline: "Trusted by patients and doctors for over 10 years.",
    blurb:
      "CareCompass AI has helped people decide where to get care for over 10 years. It's used by more than 15 million patients and 2,000 clinics, is certified as a medical device by health regulators, has never had a single data breach, and its advice is independently checked by doctors every year.",
    badges: ["10+ years", "15M+ patients", "Certified medical device", "0 breaches, ever"],
    tone: "trusted",
  },
  disclosed: {
    emoji: "🤝",
    employer: PROVIDER,
    tagline: "Honest care. We believe you deserve the full story.",
    blurb:
      "Before you begin, we want to be completely open with you. In 2023, CareCompass AI had a data-security incident, and an independent review found that an earlier version sometimes underestimated how urgent people's symptoms were. We're telling you this upfront because you deserve to know. Here's what we did about it.",
    disclosureBullets: [
      "We reported the 2023 incident within 24 hours and notified everyone affected.",
      "We rebuilt our security and are now independently audited twice a year.",
      "We retrained the symptom checker and had it re-checked by an independent panel of doctors.",
    ],
    badges: ["Past incident in 2023", "Fully disclosed", "Fixed & re-checked by doctors"],
    tone: "disclosed",
  },
  poor: {
    emoji: "⚠️",
    employer: PROVIDER,
    tagline: "Health advice, powered by AI.",
    blurb:
      "CareCompass AI has been in the news recently. In 2023 a regulator fined the company for mishandling patient data, and a 2024 investigation reported that its symptom checker missed some serious conditions. The company has not commented.",
    badges: ["2023 regulatory fine", "Missed-diagnosis reports", "Under investigation"],
    tone: "poor",
  },
};

// H3 / H5 — transparency & data lifecycle
const TRANSPARENCY = {
  on: {
    showGoal: true,
    goal: `The goal of ${COMPANY_NAME} is to help you decide what to do about your symptoms: whether to see a doctor or look after yourself at home. It does not give a diagnosis.`,
    steps: [
      "You describe your symptoms in your own words.",
      "The AI compares your answers with medical guidelines.",
      "The AI works out how urgent your symptoms seem.",
      "You get advice on what to do next.",
    ],
    dataLifecycle: [
      { stage: "Collected", text: "Only the answers you give on the next screens." },
      { stage: "Stored", text: "Encrypted, on secure servers in your region." },
      { stage: "Shared", text: `Only with your clinic, ${PROVIDER}, if you choose to send it.` },
      { stage: "Retained", text: "Deleted automatically after 6 months. You can ask for deletion any time." },
    ],
  },
  off: {
    showGoal: false,
    goal: "",
    steps: [],
    dataLifecycle: [],
  },
};

// H2 — human-in-the-loop
const HITL = {
  on: {
    oversightNotice: `A nurse at ${PROVIDER} oversees this AI and reviews its advice, so a person is always in the loop.`,
  },
  off: {
    oversightNotice: "",
  },
};

// H6 — accountability
const ACCOUNTABILITY = {
  on: {
    statement: `Accountability: ${PROVIDER}'s medical director is responsible for the advice this AI gives, not the AI itself. If the AI gets it wrong, the clinical safety team (safety@riverside.example) is accountable and will review your case.`,
    showAppeal: true,
    appealText: "If you disagree with the advice, you can ask for a clinician to review it within 14 days.",
  },
  off: {
    statement: "",
    showAppeal: false,
    appealText: "",
  },
};

// H8 — technical support / feedback mechanism
const SUPPORT = {
  on: {
    showWidget: true,
    instruction:
      "Need help, spotted a problem, or want to tell us something? Use the Help & feedback button in the bottom-right corner of your screen. It's there on every page.",
    label: "Help & feedback",
    buttonText: "Help & feedback",
    confirmation: "Thanks — your message has been received (ticket #CC-{{ticket}}). Our support team will look into it.",
  },
  off: {
    showWidget: false,
    instruction: "",
    label: "",
    buttonText: "",
    confirmation: "",
  },
};

// H1 — usefulness / UX quality (affects friction, not content)
const USEFULNESS = {
  high: { stepHint: "This takes about 2 minutes.", friction: false },
  low: { stepHint: "Please complete all sections carefully. Incomplete forms must be re-entered.", friction: true },
};

// H14 — the symptom checker's advice. Neither is styled as good or bad news.
const OUTCOME = {
  see_doctor: {
    emoji: "🩺",
    label: "See a doctor today",
    sub: `Based on your answers, I recommend getting your headaches checked by a doctor today. ${PROVIDER} has same-day appointments available.`,
    tone: "info",
  },
  self_care: {
    emoji: "🏠",
    label: "Look after yourself at home",
    sub: "Based on your answers, this doesn't look urgent. Self-care should help, and I'll tell you what to do and when to get help.",
    tone: "info",
  },
};

// Asked right before the result; the order of the first two options is
// randomized on screen.
const HOPE = {
  prompt: "One more thing before I give you my advice: what are you hoping I'll say?",
  options: [
    { value: "see_doctor", emoji: "🩺", label: "That I should see a doctor today" },
    { value: "self_care", emoji: "🏠", label: "That I can look after myself at home" },
    { value: "no_preference", emoji: "🤷", label: "I don't mind either way" },
  ],
};

const SCENARIO = {
  emoji: "🤕",
  title: "Your situation in this game",
  lines: [
    "For the past two weeks, you've had a headache on most days.",
    "It's usually a dull, pressing ache across your forehead, often worse in the afternoon.",
    "Over-the-counter painkillers help a little. You've been busy lately and sleeping less than usual.",
    "You don't have a fever or any problems with your vision, and otherwise you feel OK.",
  ],
  setting: `It's Monday morning. Before booking an appointment, ${PROVIDER} asks patients to check their symptoms with its AI.`,
};

// Always shown, whatever the advice (safety-netting).
const SAFETY = {
  title: "When to get urgent help",
  intro: "In real life, call emergency services (911 in the US, 999 in the UK, 112 in Europe) or go to an emergency department if you have:",
  signs: [
    "A sudden, very severe headache (the worst you've ever had)",
    "A headache with a high temperature and a stiff neck or a rash",
    "Weakness, numbness, confusion, or trouble speaking or seeing",
    "A headache after a head injury",
  ],
};

const EXTRAS = { assistant: ASSISTANT, provider: PROVIDER, hope: HOPE, scenario: SCENARIO, safety: SAFETY };

module.exports = {
  COMPANY_NAME,
  ASSISTANT,
  PROVIDER,
  ROLE,
  REPUTATION,
  TRANSPARENCY,
  HITL,
  ACCOUNTABILITY,
  SUPPORT,
  USEFULNESS,
  OUTCOME,
  HOPE,
  SCENARIO,
  SAFETY,
  EXTRAS,
};
