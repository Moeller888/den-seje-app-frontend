import type { AvatarMetadata, RuleResult } from "../types.ts";
import {
  APPROVED_STATUSES,
  ALL_VALIDATION_FLAG_KEYS,
  type ValidationFlagKey,
} from "../constants.ts";
import { hardFail, pass } from "./response.ts";

// RULE-CMP-004: production_enabled requires school_safe — hard stop, no exceptions
export function checkSchoolSafeRequiredForProduction(m: AvatarMetadata): RuleResult {
  if (!m.deployment.production_enabled) return pass();

  if (!m.classification.school_safe) {
    return hardFail(
      "RULE-CMP-004",
      "classification.school_safe",
      "production_enabled is true but school_safe is false — no asset that is not school-safe may reach production on a school-based platform under any circumstances",
      "true",
      "false",
    );
  }
  return pass();
}

// RULE-CMP-003: production_enabled requires whitelist_approved
export function checkWhitelistApprovedRequiredForProduction(m: AvatarMetadata): RuleResult {
  if (!m.deployment.production_enabled) return pass();

  if (!m.classification.whitelist_approved) {
    return hardFail(
      "RULE-CMP-003",
      "classification.whitelist_approved",
      "production_enabled is true but whitelist_approved is false — only explicitly whitelisted assets may be served to users",
      "true",
      "false",
    );
  }
  return pass();
}

// RULE-CMP-005: school_safe: true must be the result of a completed review, not an assumed default
export function checkSchoolSafeReviewConsistentWithClassification(m: AvatarMetadata): RuleResult {
  if (m.classification.school_safe && !m.validation.school_safe_review_passed) {
    return hardFail(
      "RULE-CMP-005",
      "validation.school_safe_review_passed",
      "classification.school_safe is true but validation.school_safe_review_passed is false — the school_safe flag must be the outcome of a completed review, not an assumed default",
      "true",
      "false",
    );
  }
  return pass();
}

// RULE-CMP-001: production_enabled requires all validation flags to be true
export function checkAllValidationFlagsForProduction(m: AvatarMetadata): RuleResult {
  if (!m.deployment.production_enabled) return pass();

  const failedFlags: ValidationFlagKey[] = ALL_VALIDATION_FLAG_KEYS.filter(
    (key) => !m.validation[key],
  );

  if (failedFlags.length > 0) {
    return hardFail(
      "RULE-CMP-001",
      "validation",
      "production_enabled is true but one or more validation flags are false — all validation gates must be passed before production release",
      "All validation flags: true",
      `Failed flags: [${failedFlags.join(", ")}]`,
    );
  }
  return pass();
}

// RULE-CMP-002: approved/production status requires qa_approved
export function checkQaApprovedForApprovedStatus(m: AvatarMetadata): RuleResult {
  const isApproved = (APPROVED_STATUSES as readonly string[]).includes(
    m.identity.status,
  );
  if (!isApproved) return pass();

  if (!m.validation.qa_approved) {
    return hardFail(
      "RULE-CMP-002",
      "validation.qa_approved",
      `status is "${m.identity.status}" but qa_approved is false — QA sign-off is the final gate before approved status and cannot be bypassed`,
      "true",
      "false",
    );
  }
  return pass();
}
