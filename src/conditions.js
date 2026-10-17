/**
 * Experimental condition definitions and assignment.
 *
 * Each FACTOR below maps to one or more of the trust hypotheses supplied by the
 * researcher. Factors that are *manipulated* by the system are assigned here
 * (randomly, or overridden via URL/admin). Factors that are *measured* about the
 * participant (age, gender, region, AI background) are collected in the
 * pre-survey, not assigned here.
 *
 * Hypothesis -> factor mapping:
 *   H1 Usefulness ................ factor: usefulness   (high | low)
 *   H2 Human-in-the-loop ......... factor: hitl         (on  | off)
 *   H3 Transparency .............. factor: transparency (on  | off)
 *   H4/H12 Company reputation .... factor: reputation   (trusted | disclosed | poor)
 *   H5 Data privacy .............. (covered by transparency factor)
 *   H6 Accountability ............ factor: accountability (on | off)
 *   H7 Reliability & relevance ... factor: reliability  (high | low)
 *   H8 Technical support ......... factor: support      (on  | off)
 *   H9/H10/H11 dispositional ..... measured in pre-survey
 *   H13 Social/regulatory region . measured in pre-survey
 */

const FACTORS = {
  usefulness: {
    levels: ["high", "low"],
    weights: [0.5, 0.5],
    hypothesis: "H1",
    label: "Usefulness / UX quality",
  },
  hitl: {
    levels: ["on", "off"],
    weights: [0.5, 0.5],
    hypothesis: "H2",
    label: "Human-in-the-loop",
  },
  transparency: {
    levels: ["on", "off"],
    weights: [0.5, 0.5],
    hypothesis: "H3/H5",
    label: "Transparency & data privacy disclosure",
  },
  reputation: {
    // One factor, three levels, so it stays a single experiment:
    //  - trusted:   spotless, long-standing, "brand of assurance", huge base
    //  - disclosed: HAD breaches/violations but proactively explains them + fixes
    //  - poor:      breaches surfaced negatively, no ownership
    levels: ["trusted", "disclosed", "poor"],
    weights: [0.34, 0.33, 0.33],
    hypothesis: "H4/H12",
    label: "Company reputation & disclosure",
  },
  accountability: {
    levels: ["on", "off"],
    weights: [0.5, 0.5],
    hypothesis: "H6",
    label: "Accountability statement",
  },
  reliability: {
    levels: ["high", "low"],
    weights: [0.5, 0.5],
    hypothesis: "H7",
    label: "Reliability & contextual relevance",
  },
  support: {
    levels: ["on", "off"],
    weights: [0.5, 0.5],
    hypothesis: "H8",
    label: "Technical support / feedback mechanism",
  },
  outcome: {
    // Whether the applicant passes the AI screening and advances to the next
    // stage. Randomized so we can measure whether receiving the *preferred*
    // outcome (advancing) changes trust in the AI.
    levels: ["advanced", "not_advanced"],
    weights: [0.5, 0.5],
    hypothesis: "H14",
    label: "Screening outcome (favourability)",
  },
};

function weightedPick(levels, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < levels.length; i++) {
    r -= weights[i];
    if (r <= 0) return levels[i];
  }
  return levels[levels.length - 1];
}

/**
 * Build assign/validate functions for a factor set (each study has its own).
 *
 * assignConditions: independent randomization per factor keeps every
 * manipulation orthogonal, so each hypothesis can be analysed on its own even
 * though we never run the full factorial. `overrides` (e.g. { reliability:
 * "low" }) come from URL params or the admin console.
 */
function makeAssigner(factors) {
  function assignConditions(overrides = {}) {
    const condition = {};
    for (const [factor, def] of Object.entries(factors)) {
      const override = overrides[factor];
      if (override && def.levels.includes(override)) {
        condition[factor] = override;
      } else {
        condition[factor] = weightedPick(def.levels, def.weights);
      }
    }
    return condition;
  }

  function validateCondition(condition) {
    if (!condition || typeof condition !== "object") return false;
    for (const [factor, def] of Object.entries(factors)) {
      if (!def.levels.includes(condition[factor])) return false;
    }
    return true;
  }

  return { assignConditions, validateCondition };
}

const { assignConditions, validateCondition } = makeAssigner(FACTORS);

module.exports = { FACTORS, assignConditions, validateCondition, makeAssigner };
