import type { QuestionContract } from "../schema/questionContract.js";
import type { ValidationIssue } from "../validateQuestion.js";
export declare function constraintValidator(question: QuestionContract, issues: ValidationIssue[]): void;
