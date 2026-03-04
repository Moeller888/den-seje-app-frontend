import type { QuestionContract } from "../schema/questionContract.ts";
import type { ValidationIssue } from "../validateQuestion.ts";

export function semanticValidator(
  question: QuestionContract,
  issues: ValidationIssue[]
): void {
  // Rule 1: MC content must have mc answer format
  if (
    question.content.type === "mc_single" &&
    question.answer.format !== "mc"
  ) {
    issues.push({
      type: "semantic",
      severity: "error",
      message: "MC question must have answer.format = 'mc'"
    });
  }

  // Rule 2: number_input cannot have mc answer format
  if (
    question.content.type === "number_input" &&
    question.answer.format === "mc"
  ) {
    issues.push({
      type: "semantic",
      severity: "error",
      message: "Number input question cannot have answer.format = 'mc'"
    });
  }

  // Example warning rule (placeholder for future quality logic)
  if (question.pedagogy.difficulty_declared >= 9) {
    issues.push({
      type: "semantic",
      severity: "warning",
      message: "Very high declared difficulty â€” review recommended"
    });
  }
}
