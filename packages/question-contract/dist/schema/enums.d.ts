export declare const QUESTION_TYPES: readonly ["mc_single", "text_input", "number_input"];
export type QuestionType = typeof QUESTION_TYPES[number];
export declare const COGNITIVE_LEVELS: readonly ["recall", "explain", "apply", "analyze"];
export type CognitiveLevel = typeof COGNITIVE_LEVELS[number];
export declare const QUESTION_STATUS: readonly ["draft", "staged", "active", "deprecated"];
export type QuestionStatus = typeof QUESTION_STATUS[number];
