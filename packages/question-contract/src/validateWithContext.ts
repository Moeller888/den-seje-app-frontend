import type { QuestionContract } from "./schema/questionContract.ts";
import {
  validateQuestion,
  type ValidationResult,
  type ValidationIssue
} from "./validateQuestion.ts";

export interface ValidationContext {
  allowedLearningObjectives: string[];
  existingLogicalIds: string[];
  existingContentHashes: string[];
  contentHash?: (question: QuestionContract) => string;
}

export interface ContextValidationResult extends ValidationResult {
  contextIssues: ValidationIssue[];
}

export function validateWithContext(
  input: unknown,
  context: ValidationContext
): ContextValidationResult {
  const baseResult = validateQuestion(input);

  const contextIssues: ValidationIssue[] = [];

  if (!baseResult.success || !baseResult.data) {
    return {
      ...baseResult,
      contextIssues
    };
  }

  const question = baseResult.data;

  // Rule 1: learning_objective must be allowed
  if (
    !context.allowedLearningObjectives.includes(
      question.pedagogy.learning_objective
    )
  ) {
    contextIssues.push({
      type: "semantic",
      severity: "error",
      message: "learning_objective is not in whitelist"
    });
  }

  // Rule 2: logical_question_id must not already exist
  if (context.existingLogicalIds.includes(question.meta.logical_question_id)) {
    contextIssues.push({
      type: "semantic",
      severity: "error",
      message: "logical_question_id already exists"
    });
  }

  // Rule 3: content hash must not duplicate
  if (context.contentHash) {
    const hash = context.contentHash(question);
    if (context.existingContentHashes.includes(hash)) {
      contextIssues.push({
        type: "semantic",
        severity: "error",
        message: "Duplicate content detected via hash"
      });
    }
  }

  const hasErrors =
    contextIssues.some(i => i.severity === "error") ||
    baseResult.issues.some(i => i.severity === "error");

  return {
    success: !hasErrors,
    data: question,
    issues: baseResult.issues,
    contextIssues
  };
}
