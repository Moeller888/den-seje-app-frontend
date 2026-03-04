export declare const CONTRACT_VERSION = 1;
export { questionSchema } from "./schema/questionSchema.js";
export type { QuestionContract } from "./schema/questionContract.js";
export { validateQuestion, type ValidationResult, type ValidationIssue, type ValidationSeverity } from "./validateQuestion.js";
export { validateWithContext, type ValidationContext, type ContextValidationResult } from "./validateWithContext.js";
export { contentHash } from "./dedupe/contentHash.js";
