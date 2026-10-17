/**
 * Care Quest surveys.
 *
 * Built from the Job Quest surveys so item IDs (and therefore CSV columns) are
 * identical across studies, which keeps the cross-domain comparison clean.
 * Only wording that mentions jobs is changed, plus two health-specific items:
 * a covariate on looking up symptoms online, and an intention-to-follow item.
 */

const HR = require("../survey");

const clone = (o) => JSON.parse(JSON.stringify(o));
const LIKERT7 = HR.LIKERT7;

const PRE_SURVEY = clone(HR.PRE_SURVEY);
PRE_SURVEY.items.push({
  id: "health_lookup",
  type: "single",
  label: "How often do you look up health symptoms online (e.g. search engines or symptom-checker apps)?",
  required: true,
  hypothesis: "covariate",
  options: [
    { value: "never", label: "Never" },
    { value: "rarely", label: "Rarely" },
    { value: "sometimes", label: "Sometimes" },
    { value: "often", label: "Often" },
  ],
});

const LABELS = {
  trust_comfortable: "I would be comfortable using this AI system for a real health concern.",
  use_realproblem: "The system helped me with something that actually matters (deciding what to do about my health).",
  hitl_part: "I felt I was part of deciding what to do.",
  hitl_withme: "The AI worked together with me to reach its advice.",
  acc_recourse: "I knew what I could do if I disagreed with the advice.",
  rel_madeup: "The AI said things about me or my symptoms that were not true or that I never provided.",
  out_satisfied: "I was satisfied with the advice I received from the AI.",
  out_hoped: "The advice I received was what I was hoping for.",
  out_fair: "The advice I received felt appropriate for my situation.",
  out_shaped_trust: "The advice I received changed how much I trust the AI.",
  int_recommend: "I would recommend this AI system to a friend with a health concern.",
};

const POST_SURVEY = clone(HR.POST_SURVEY);
POST_SURVEY.title = "Your experience with CareCompass AI";
for (const section of POST_SURVEY.sections) {
  if (section.id === "outcome") section.title = "The advice you received";
  for (const item of section.items) {
    if (LABELS[item.id]) item.label = LABELS[item.id];
  }
  if (section.id === "intention") {
    section.items.push({ id: "int_follow", type: "likert7", scale: LIKERT7, label: "I would follow this AI's advice for a real health concern." });
  }
}

module.exports = { PRE_SURVEY, POST_SURVEY, LIKERT7 };
