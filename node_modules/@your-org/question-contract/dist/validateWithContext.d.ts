import type { QuestionContract } from "./schema/questionContract.js";
import { type ValidationResult, type ValidationIssue } from "./validateQuestion.js";
export interface ValidationContext {
    allowedLearningObjectives: string[];
    existingLogicalIds: string[];
    existingContentHashes: string[];
    contentHash?: (question: QuestionContract) => string;
}
export interface ContextValidationResult extends ValidationResult {
    contextIssues: ValidationIssue[];
}
export declare function validateWithContext(input: unknown, context: ValidationContext): ContextValidationResult;
