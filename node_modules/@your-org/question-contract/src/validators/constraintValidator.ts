import type { QuestionContract } from "../schema/questionContract.ts";
import type { ValidationIssue } from "../validateQuestion.ts";

export function constraintValidator(
  question: QuestionContract,
  issues: ValidationIssue[]
): void {
  // Rule 1: number_input min must be less than max (if both defined)
  if (
    question.content.type === "number_input" &&
    question.content.min !== null &&
    question.content.max !== null &&
    question.content.min >= question.content.max
  ) {
    issues.push({
      type: "constraint",
      severity: "error",
      message: "number_input min must be less than max"
    });
  }

  // Rule 2: text_input max_length should match constraints.max_length if both defined
  if (
    question.content.type === "text_input" &&
    question.constraints?.max_length !== undefined &&
    question.constraints.max_length !== null &&
    question.constraints.max_length !== question.content.max_length
  ) {
    issues.push({
      type: "constraint",
      severity: "warning",
      message: "constraints.max_length differs from content.max_length"
    });
  }

  // Rule 3: tolerance must be positive if defined
  if (question.answer.tolerance) {
    const { plus_minus, absolute, relative } = question.answer.tolerance;

    if (
      (plus_minus !== undefined && plus_minus < 0) ||
      (absolute !== undefined && absolute < 0) ||
      (relative !== undefined && relative < 0)
    ) {
      issues.push({
        type: "constraint",
        severity: "error",
        message: "Tolerance values must be non-negative"
      });
    }
  }
}
