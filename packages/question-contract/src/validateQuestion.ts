import { questionSchema } from "./schema/questionSchema.ts";
import type { QuestionContract } from "./schema/questionContract.ts";
import { semanticValidator } from "./validators/semanticValidator.ts";
import { constraintValidator } from "./validators/constraintValidator.ts";

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

export function validateQuestion(input: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];

  const structural = questionSchema.safeParse(input);

  if (!structural.success) {
    issues.push({
      type: "structural",
      severity: "error",
      message: "Structural validation failed"
    });

    return {
      success: false,
      issues
    };
  }

  const data = structural.data;

  // Semantic validation layer
  semanticValidator(data, issues);

  // Constraint validation layer
  constraintValidator(data, issues);

  const hasErrors = issues.some(i => i.severity === "error");

  return {
    success: !hasErrors,
    data,
    issues
  };
}
