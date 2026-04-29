import type {
  RuleResult,
  ValidationError,
  ValidationResponse,
  Severity,
} from "../types.ts";

export function pass(): RuleResult {
  return { passed: true, error: null };
}

function makeError(
  rule_id: string,
  severity: Severity,
  field: string,
  message: string,
  expected: string,
  actual: string,
): ValidationError {
  return { rule_id, severity, field, message, expected, actual };
}

export function hardFail(
  rule_id: string,
  field: string,
  message: string,
  expected: string,
  actual: string,
): RuleResult {
  return {
    passed: false,
    error: makeError(rule_id, "HARD_FAIL", field, message, expected, actual),
  };
}

export function warn(
  rule_id: string,
  field: string,
  message: string,
  expected: string,
  actual: string,
): RuleResult {
  return {
    passed: false,
    error: makeError(rule_id, "WARNING", field, message, expected, actual),
  };
}

export function manualReview(
  rule_id: string,
  field: string,
  message: string,
  expected: string,
  actual: string,
): RuleResult {
  return {
    passed: false,
    error: makeError(
      rule_id,
      "MANUAL_REVIEW_REQUIRED",
      field,
      message,
      expected,
      actual,
    ),
  };
}

export function buildSuccessResponse(
  asset_id: string | null,
  warnings: ValidationError[],
  manual_review_flags: ValidationError[],
): ValidationResponse {
  return {
    valid: true,
    asset_id,
    errors: [],
    warnings,
    manual_review_flags,
  };
}

export function buildFailureResponse(
  asset_id: string | null,
  errors: ValidationError[],
  warnings: ValidationError[],
  manual_review_flags: ValidationError[],
): ValidationResponse {
  return {
    valid: false,
    asset_id,
    errors,
    warnings,
    manual_review_flags,
  };
}
