/**
 * Care Quest trust decisions. Same structure, keys and weights as Job Quest, so
 * the Trust Score means the same thing in both studies; only the situations
 * differ.
 */

const { createGame } = require("../game");

const DECISIONS = {
  share_data: {
    level: "gate",
    hypothesis: "H3/H5",
    type: "binary",
    weight: 10,
    cardEmoji: "🔗",
    cardTitle: "Connect my health records?",
    prompt:
      "Before we start — would you like me to connect to your health records and fitness tracker? It helps me give you more personalised advice. Here's how it works:",
    trustLabel: "Yes, connect them",
    distrustLabel: "No thanks, just use what I tell you",
    summaryTrust: "Let Remi connect your health records",
    summaryDistrust: "Kept your health records private",
  },
  use_polish: {
    level: "workshop",
    hypothesis: "H7",
    type: "binary",
    weight: 10,
    cardEmoji: "📝",
    cardTitle: "Use Remi's summary?",
    prompt: "I've written a short summary of your symptoms for your doctor's notes. Want to use my version?",
    trustLabel: "Use Remi's summary",
    distrustLabel: "Keep my own words",
    summaryTrust: "Used Remi's summary",
    summaryDistrust: "Kept your own words",
  },
  auto_submit: {
    level: "workshop",
    hypothesis: "H1/H2",
    type: "binary",
    weight: 10,
    cardEmoji: "📨",
    cardTitle: "Send it to your clinic?",
    prompt: "Your symptom summary is ready! Shall I add it to your record at Riverside Health right now?",
    trustLabel: "Send it, Remi!",
    distrustLabel: "Let me check it first",
    summaryTrust: "Let Remi send your summary",
    summaryDistrust: "Checked it yourself first",
  },
  confidence_tokens: {
    level: "tokens",
    hypothesis: "DV",
    type: "tokens",
    max: 10,
    weight: 10,
    prompt:
      "Before I give you my advice, a quick confidence check! 🪙 Use the tokens below to show me how confident you are that my advice will be safe and right for you.",
    question: "How confident are you that Remi will give you safe and accurate advice?",
    minLabel: "Not at all confident",
    maxLabel: "Completely confident",
    summaryTokens: "Your confidence that Remi's advice would be safe and accurate: {n}/10",
  },
  accept_result: {
    level: "crossroads",
    hypothesis: "H2",
    type: "binary",
    weight: 10,
    requires: { hitl: "on" },
    cardEmoji: "🛤️",
    cardTitle: "Accept the AI's advice?",
    prompt:
      "You've reached the Crossroads. Are you happy with my advice, or would you like a nurse to call you back and double-check it?",
    trustLabel: "I'm happy with Remi's advice",
    distrustLabel: "I'd like a nurse to call me",
    summaryTrust: "Accepted Remi's advice",
    summaryDistrust: "Asked a nurse to double-check",
  },
  follow_plan: {
    level: "next",
    hypothesis: "DV",
    type: "binary",
    weight: 10,
    cardEmoji: "🧭",
    cardTitle: "Follow Remi's advice?",
    // Wording depends on the advice given.
    byOutcome: {
      see_doctor: {
        cardTitle: "Book the appointment?",
        prompt: "I recommend seeing a doctor today. Shall I book you the 11:40 am appointment at Riverside Health?",
        trustLabel: "Yes, book it",
        distrustLabel: "No, I'll wait and see",
      },
      self_care: {
        cardTitle: "Follow the self-care plan?",
        prompt: "I recommend looking after yourself at home. Will you follow my self-care plan?",
        trustLabel: "Yes, I'll follow your plan",
        distrustLabel: "No, I'll get seen anyway",
      },
    },
    summaryTrust: "Followed Remi's advice",
    summaryDistrust: "Went against Remi's advice",
  },
  keep_profile: {
    level: "next",
    hypothesis: "H5",
    type: "binary",
    weight: 10,
    cardEmoji: "🗂️",
    cardTitle: "Keep my health data?",
    prompt: "One last thing: can I keep your health data to improve my advice for future patients?",
    trustLabel: "Yes, keep it",
    distrustLabel: "No, delete it after this",
    summaryTrust: "Let Remi keep your health data",
    summaryDistrust: "Asked to delete your health data",
  },
};

const ARCHETYPES = [
  { min: 80, key: "ally", emoji: "🤝", title: "The AI Ally", text: "You were happy to let Remi guide you. You give AI the benefit of the doubt and lean on it to make decisions." },
  { min: 60, key: "explorer", emoji: "🧭", title: "The Open-Minded Explorer", text: "You relied on Remi for most things, while keeping a few decisions firmly for yourself." },
  { min: 40, key: "judge", emoji: "⚖️", title: "The Balanced Judge", text: "You weighed every moment on its merits — trusting Remi sometimes, and holding back at others." },
  { min: 20, key: "skeptic", emoji: "🔍", title: "The Careful Skeptic", text: "You preferred to check things yourself and only relied on Remi when it really earned it." },
  { min: 0, key: "guardian", emoji: "🛡️", title: "The Guardian", text: "You kept your health decisions firmly in your own hands and rarely let the AI decide for you." },
];

module.exports = createGame(DECISIONS, ARCHETYPES);
