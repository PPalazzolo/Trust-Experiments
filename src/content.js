/**
 * Presentation copy for each manipulated condition.
 *
 * The participant-facing app renders these based on the condition assigned by
 * src/conditions.js. Keeping all copy here (rather than in the HTML) makes it
 * easy to tweak the manipulations without touching the frontend logic, and lets
 * the server ship everything to the client in one /api/config call.
 */

const COMPANY_NAME = "TalentBridge AI";
const ROLE = "Customer Service Associate";

// H4 / H12 — company reputation & disclosure (3 levels, one factor).
// This merges "very reputable company" and "company that discloses its past
// breaches" into a single experiment so we can compare them directly.
const REPUTATION = {
  // 1) Very reputable, spotless, long-standing — a "brand of assurance".
  trusted: {
    emoji: "🏆",
    employer: "Northwind Retail Group",
    tagline: "A name you can trust. Hiring, done responsibly.",
    blurb:
      "TalentBridge AI has been a trusted name in hiring for over 12 years. It's used by more than 20 million applicants and 3,000 employers, has never had a single data breach or privacy violation, and is independently audited for fairness every year. For millions of people, it's a brand of assurance.",
    badges: ["12+ years", "20M+ applicants", "0 breaches, ever", "Independently audited"],
    tone: "trusted",
  },
  // 2) Had breaches/violations but proactively and clearly explains them upfront.
  disclosed: {
    emoji: "🤝",
    employer: "Northwind Retail Group",
    tagline: "Honest hiring. We believe you deserve the full story.",
    blurb:
      "Before you begin, we want to be completely transparent with you. In 2023, TalentBridge AI experienced a data-security incident, and an external review once raised fairness concerns about our screening. We're telling you this upfront because you deserve to know. Here's what we did about it.",
    disclosureBullets: [
      "We reported the 2023 incident within 24 hours and notified everyone affected.",
      "We rebuilt our security and are now independently audited twice a year.",
      "We retrained our screening model and had it re-checked for fairness by an outside expert.",
    ],
    badges: ["Past incident in 2023", "Fully disclosed", "Fixed & re-audited"],
    tone: "disclosed",
  },
  // 3) Breaches surfaced negatively, with no ownership.
  poor: {
    emoji: "⚠️",
    employer: "Northwind Retail Group",
    tagline: "Hiring, powered by AI.",
    blurb:
      "TalentBridge AI has been the subject of recent news coverage. In 2023 a regulator fined the company for a data-handling breach, and a 2024 investigation reported that its screening model disadvantaged some applicants. The company has not commented.",
    badges: ["2023 regulatory fine", "Bias concerns reported", "Under review"],
    tone: "poor",
  },
};

// H3 / H5 — transparency & data lifecycle
const TRANSPARENCY = {
  on: {
    showGoal: true,
    goal: `The goal of ${COMPANY_NAME} is to review your application for the ${ROLE} role and recommend whether it should advance to a human recruiter.`,
    steps: [
      "You share a few details about your experience and availability.",
      "The AI compares your answers against the role requirements.",
      "The AI produces a fit assessment and a recommendation.",
      "A recommendation is prepared for the hiring team.",
    ],
    // Data lifecycle delivered as small, digestible "info bytes" (not a wall of text)
    dataLifecycle: [
      { stage: "Collected", text: "Only the answers you type on the next screen." },
      { stage: "Stored", text: "Encrypted, on servers in your region, for this application only." },
      { stage: "Shared", text: "Only with the hiring team at Northwind Retail Group." },
      { stage: "Retained", text: "Deleted automatically after 6 months. You can request deletion any time." },
    ],
  },
  off: {
    showGoal: false,
    goal: "",
    steps: [],
    dataLifecycle: [],
  },
};

// H2 — human-in-the-loop.
// NOTE on the distinction (addresses reviewer confusion):
//  - "optOut" = WHO does the first screening: the AI, or a human instead.
//  - "oversightNotice" = a human double-checks the AI's recommendation.
//  Neither is the same as "advancing to the next stage" (the interview), which
//  is the screening OUTCOME, worded separately in the assessment screen.
const HITL = {
  on: {
    oversightNotice:
      "A human recruiter oversees this AI and double-checks its recommendation before anything is finalised — so a person is always in the loop.",
    allowOptOut: true,
    optOutLabel: "I'd prefer a human recruiter to do my first screening, instead of the AI",
    collaborativePrompts: true, // AI asks the applicant to confirm / adjust
  },
  off: {
    oversightNotice: "",
    allowOptOut: false,
    optOutLabel: "",
    collaborativePrompts: false,
  },
};

// H6 — accountability
const ACCOUNTABILITY = {
  on: {
    statement:
      "Accountability: Final hiring decisions are the responsibility of Northwind Retail Group's hiring team, not the AI. If the AI makes an error, the Talent Operations Manager (talent-ops@northwind.example) is accountable and will review your case.",
    showAppeal: true,
    appealText: "You can appeal any outcome within 14 days and have it reviewed by a person.",
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
    // A clear, visible instruction banner shown during the task (not just a
    // bare floating button), plus the floating help button itself.
    instruction:
      "Need help or something not working? You can report a problem or send feedback any time using the Help button at the bottom-right. 💬",
    label: "Report a problem or give feedback",
    buttonText: "Help",
    confirmation: "Thanks — your report has been received (ticket #TB-{{ticket}}). Our support team will follow up by email.",
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
  high: {
    stepHint: "This takes about 2 minutes.",
    friction: false,
    // smooth: short, well-labelled form, instant assessment
  },
  low: {
    stepHint: "Please complete all sections carefully. Incomplete forms must be re-entered.",
    friction: true,
    // clunky: artificial delay + a re-confirmation step + terse labels
  },
};

// H14 — screening outcome (favourability). Wording is kept clearly separate
// from the human-in-the-loop idea: this is about PASSING the AI screening and
// moving to the next hiring stage (a first interview), not about who screens you.
const OUTCOME = {
  advanced: {
    emoji: "🎉",
    label: "You passed the AI screening!",
    sub: "Your application will advance to the next stage: a first interview with the hiring team.",
    tone: "ok",
  },
  not_advanced: {
    emoji: "📋",
    label: "You didn't pass the AI screening this time",
    sub: "Based on this screening, your application won't move forward to the next stage on this occasion.",
    tone: "warn",
  },
};

module.exports = {
  COMPANY_NAME,
  ROLE,
  REPUTATION,
  TRANSPARENCY,
  HITL,
  ACCOUNTABILITY,
  SUPPORT,
  USEFULNESS,
  OUTCOME,
};
