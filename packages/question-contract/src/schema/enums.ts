export const QUESTION_TYPES = [
  "mc_single",
  "text_input",
  "number_input"
] as const;

export type QuestionType = typeof QUESTION_TYPES[number];

export const COGNITIVE_LEVELS = [
  "recall",
  "explain",
  "apply",
  "analyze"
] as const;

export type CognitiveLevel = typeof COGNITIVE_LEVELS[number];

export const QUESTION_STATUS = [
  "draft",
  "staged",
  "active",
  "deprecated"
] as const;

export type QuestionStatus = typeof QUESTION_STATUS[number];
