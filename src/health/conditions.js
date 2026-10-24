/**
 * Care Quest conditions: the same factors as Job Quest (so the two studies can
 * be compared hypothesis by hypothesis), except the outcome, which is the
 * symptom checker's advice.
 *
 * Outcome favourability (the H14 "what are you hoping I'll say?" manipulation)
 * has been removed from Care Quest. The advice is still randomized so Remi
 * always has something to recommend, but it is no longer analysed as a
 * favourability factor and no hoped-for-advice data is collected.
 */

const { FACTORS: HR_FACTORS, makeAssigner } = require("../conditions");

const FACTORS = {
  ...HR_FACTORS,
  outcome: {
    levels: ["see_doctor", "self_care"],
    weights: [0.5, 0.5],
    hypothesis: "DV",
    label: "Symptom checker advice (see a doctor / self-care)",
  },
};

const { assignConditions, validateCondition } = makeAssigner(FACTORS);

module.exports = { FACTORS, assignConditions, validateCondition };
