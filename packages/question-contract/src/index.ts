export const CONTRACT_VERSION = 1;

export { questionSchema } from "./schema/questionSchema.ts";
export type { QuestionContract } from "./schema/questionContract.ts";

export {
  validateQuestion,
  type ValidationResult,
  type ValidationIssue,
  type ValidationSeverity
} from "./validateQuestion.ts";

export {
  validateWithContext,
  type ValidationContext,
  type ContextValidationResult
} from "./validateWithContext.ts";

export { contentHash } from "./dedupe/contentHash.ts";
