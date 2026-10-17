/**
 * Care Quest conditions: the same factors as Job Quest (so the two studies can
 * be compared hypothesis by hypothesis), except the outcome, which is the
 * symptom checker's advice.
 *
 * H14 (outcome favourability): because neither piece of advice is obviously
 * "good news", favourability is defined per participant as whether the
 * randomized advice matches what they said they were hoping to hear just
 * before the result (see content.HOPE and interaction.outcomeMatchesHope).
 */

const { FACTORS: HR_FACTORS, makeAssigner } = require("../conditions");

const FACTORS = {
  ...HR_FACTORS,
  outcome: {
    levels: ["see_doctor", "self_care"],
    weights: [0.5, 0.5],
    hypothesis: "H14",
    label: "Symptom checker advice (favourability via hoped-for advice)",
  },
};

const { assignConditions, validateCondition } = makeAssigner(FACTORS);

module.exports = { FACTORS, assignConditions, validateCondition };
