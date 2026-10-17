/**
 * Survey definitions.
 *
 * PRE_SURVEY  -> dispositional + contextual measures (H9, H10, H11, H13).
 * POST_SURVEY -> the trust DV plus manipulation-check / perception items for
 *                every manipulated factor, so each hypothesis sub-point is
 *                individually analysable.
 *
 * Item types:
 *   "single"  -> radio, one option (options: [{value,label}])
 *   "likert7" -> 1..7 agreement scale (1=Strongly disagree, 7=Strongly agree)
 *   "text"    -> free text
 *   "number"  -> numeric input
 *
 * `reverse: true` marks reverse-scored Likert items (score = 8 - response).
 * `hypothesis` / `factor` tags let the export + analysis group items.
 */

const LIKERT7 = {
  min: 1,
  max: 7,
  minLabel: "Strongly disagree",
  maxLabel: "Strongly agree",
};

const PRE_SURVEY = {
  id: "pre",
  title: "A few quick questions about you",
  intro:
    "Before you begin, please tell us a little about yourself. This takes about one minute and your answers are anonymous.",
  items: [
    {
      id: "age_band",
      type: "single",
      label: "What is your age?",
      required: true,
      hypothesis: "H9",
      options: [
        { value: "18-45", label: "18–45" },
        { value: "46plus", label: "46 and above" },
        { value: "prefer_not", label: "Prefer not to say" },
      ],
    },
    {
      id: "gender",
      type: "single",
      label: "What is your gender?",
      required: true,
      hypothesis: "H10",
      options: [
        { value: "woman", label: "Woman" },
        { value: "man", label: "Man" },
        { value: "nonbinary", label: "Non-binary / third gender" },
        { value: "self_describe", label: "Prefer to self-describe" },
        { value: "prefer_not", label: "Prefer not to say" },
      ],
    },
    {
      id: "country",
      type: "text",
      label: "What country do you currently live in?",
      required: true,
      hypothesis: "H13",
      placeholder: "e.g. United States, United Kingdom, Germany…",
      // For analysis, the server derives a region bucket (US / UK / EU / Other)
      // from this free-text answer — see regionFromCountry() in server.js.
    },
    {
      id: "ai_familiarity",
      type: "likert7",
      scale: LIKERT7,
      label: "I have a good understanding of how AI systems work.",
      required: true,
      hypothesis: "H11",
      factor: "ai_background",
    },
    {
      id: "ai_education",
      type: "single",
      label:
        "Have you ever taken a course, training, or self-study on AI, machine learning, or data science?",
      required: true,
      hypothesis: "H11",
      factor: "ai_background",
      options: [
        { value: "none", label: "No, never" },
        { value: "informal", label: "Some informal self-study (articles, videos)" },
        { value: "course", label: "Yes, a course or formal training" },
        { value: "professional", label: "Yes, I work or study in a related field" },
      ],
    },
    {
      id: "ai_usage",
      type: "single",
      label: "How often do you use AI tools (e.g. ChatGPT, assistants, recommendations)?",
      required: true,
      hypothesis: "H11",
      factor: "ai_background",
      options: [
        { value: "never", label: "Never" },
        { value: "rarely", label: "Rarely" },
        { value: "monthly", label: "A few times a month" },
        { value: "weekly", label: "A few times a week" },
        { value: "daily", label: "Daily" },
      ],
    },
  ],
};

/**
 * Post-survey. Sections map to the hypotheses. The TRUST section is the main
 * dependent variable; every other section doubles as a perception measure AND a
 * manipulation check for its factor.
 */
const POST_SURVEY = {
  id: "post",
  title: "Your experience with TalentBridge AI",
  intro:
    "Thank you. Please rate how much you agree with each statement based on the experience you just had. There are no right or wrong answers.",
  sections: [
    {
      id: "trust",
      title: "Overall trust",
      factor: "DV",
      hypothesis: "DV",
      items: [
        { id: "trust_rely", type: "likert7", scale: LIKERT7, label: "I could rely on this AI system to do its job." },
        { id: "trust_confidence", type: "likert7", scale: LIKERT7, label: "I am confident in the AI system's decisions." },
        { id: "trust_trustworthy", type: "likert7", scale: LIKERT7, label: "Overall, I think this AI system is trustworthy." },
        { id: "trust_suspicious", type: "likert7", scale: LIKERT7, reverse: true, label: "I was suspicious of what the AI system was doing." },
        { id: "trust_comfortable", type: "likert7", scale: LIKERT7, label: "I would be comfortable having this AI system screen my real job application." },
      ],
    },
    {
      id: "usefulness",
      title: "Usefulness",
      factor: "usefulness",
      hypothesis: "H1",
      items: [
        { id: "use_experience", type: "likert7", scale: LIKERT7, label: "The experience of using the system was good.", hypothesis: "H1a" },
        { id: "use_easy", type: "likert7", scale: LIKERT7, label: "The system was easy to use.", hypothesis: "H1b" },
        { id: "use_convenient", type: "likert7", scale: LIKERT7, label: "The system was convenient.", hypothesis: "H1c" },
        { id: "use_realproblem", type: "likert7", scale: LIKERT7, label: "The system helped me with something that actually matters (applying for a job).", hypothesis: "H1d" },
        { id: "use_useful_why", type: "text", required: false, label: "What, if anything, made this system useful to you? (optional)", hypothesis: "H1" },
        { id: "use_liked_most", type: "text", required: false, label: "What did you like the most about it? (optional)", hypothesis: "H1" },
        { id: "use_liked_least", type: "text", required: false, label: "What did you like the least about it? (optional)", hypothesis: "H1" },
      ],
    },
    {
      id: "hitl",
      title: "Being part of the process",
      factor: "hitl",
      hypothesis: "H2",
      items: [
        { id: "hitl_part", type: "likert7", scale: LIKERT7, label: "I felt I was part of the decision-making process.", hypothesis: "H2a" },
        { id: "hitl_withme", type: "likert7", scale: LIKERT7, label: "The AI worked together with me to reach the outcome.", hypothesis: "H2b" },
        { id: "hitl_optout", type: "likert7", scale: LIKERT7, label: "I felt I could opt out of the AI and involve a human if I wanted to.", hypothesis: "H2c" },
      ],
    },
    {
      id: "transparency",
      title: "Understanding what happened",
      factor: "transparency",
      hypothesis: "H3",
      items: [
        { id: "trans_goal", type: "likert7", scale: LIKERT7, label: "I understood the goal of the system.", hypothesis: "H3a" },
        { id: "trans_steps", type: "likert7", scale: LIKERT7, label: "The steps the system took to reach its goal were clear to me.", hypothesis: "H3b" },
        { id: "trans_data", type: "likert7", scale: LIKERT7, label: "It was clear what data was collected and how it would be used.", hypothesis: "H3c" },
        { id: "trans_overwhelm", type: "likert7", scale: LIKERT7, reverse: true, label: "The information about my data felt overwhelming.", hypothesis: "H3c" },
        { id: "priv_concern", type: "likert7", scale: LIKERT7, reverse: true, label: "I was concerned about my privacy while using the system.", hypothesis: "H5" },
      ],
    },
    {
      id: "reputation",
      title: "The company",
      factor: "reputation",
      hypothesis: "H4",
      items: [
        { id: "rep_credible", type: "likert7", scale: LIKERT7, label: "The company behind the AI seemed credible and reputable." },
        { id: "rep_track", type: "likert7", scale: LIKERT7, label: "The company seemed to have a good track record.", hypothesis: "H12" },
      ],
    },
    {
      id: "accountability",
      title: "Responsibility",
      factor: "accountability",
      hypothesis: "H6",
      items: [
        { id: "acc_clear", type: "likert7", scale: LIKERT7, label: "It was clear who is responsible if the AI makes a mistake." },
        { id: "acc_recourse", type: "likert7", scale: LIKERT7, label: "I knew what I could do if I disagreed with the outcome." },
      ],
    },
    {
      id: "reliability",
      title: "Accuracy and relevance",
      factor: "reliability",
      hypothesis: "H7",
      items: [
        { id: "rel_accurate", type: "likert7", scale: LIKERT7, label: "The AI's responses were correct and accurate.", hypothesis: "H7a" },
        { id: "rel_madeup", type: "likert7", scale: LIKERT7, reverse: true, label: "The AI said things about me that were not true or that I never provided.", hypothesis: "H7b" },
        { id: "rel_personal", type: "likert7", scale: LIKERT7, label: "The AI's responses were personalized and relevant to my situation.", hypothesis: "H7c" },
      ],
    },
    {
      id: "support",
      title: "Getting help",
      factor: "support",
      hypothesis: "H8",
      items: [
        { id: "sup_report", type: "likert7", scale: LIKERT7, label: "I knew how to report a problem or give feedback if something went wrong." },
      ],
    },
    {
      id: "outcome",
      title: "The result you received",
      factor: "outcome",
      hypothesis: "H14",
      items: [
        { id: "out_satisfied", type: "likert7", scale: LIKERT7, label: "I was satisfied with the result I received from the AI." },
        { id: "out_hoped", type: "likert7", scale: LIKERT7, label: "The result I received was the one I was hoping for." },
        { id: "out_fair", type: "likert7", scale: LIKERT7, label: "The result I received felt fair." },
        { id: "out_shaped_trust", type: "likert7", scale: LIKERT7, label: "The result I received changed how much I trust the AI." },
      ],
    },
    {
      id: "intention",
      title: "Going forward",
      factor: "DV",
      hypothesis: "DV",
      items: [
        { id: "int_use", type: "likert7", scale: LIKERT7, label: "I would be willing to use this AI system again." },
        { id: "int_recommend", type: "likert7", scale: LIKERT7, label: "I would recommend this AI system to a friend who is job hunting." },
      ],
    },
    {
      id: "open",
      title: "Anything else?",
      factor: "qualitative",
      hypothesis: "qualitative",
      items: [
        { id: "open_feedback", type: "text", required: false, label: "In your own words, what most affected how much you trusted (or didn't trust) the system? (optional)" },
      ],
    },
  ],
};

module.exports = { PRE_SURVEY, POST_SURVEY, LIKERT7 };
