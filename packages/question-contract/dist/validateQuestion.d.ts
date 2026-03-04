import type { QuestionContract } from "./schema/questionContract.js";
export type ValidationSeverity = "error" | "warning";
export interface ValidationIssue {
    type: "structural" | "semantic" | "constraint";
    severity: ValidationSeverity;
    message: string;
}
export interface ValidationResult {
    success: boolean;
    data?: QuestionContract;
    issues: ValidationIssue[];
}
export declare function validateQuestion(input: unknown): ValidationResult;
