import type { AvatarMetadata, RuleResult } from "../types.ts";
import {
  APPROVED_STATUSES,
  ALL_FORBIDDEN_REFERENCE_KEYS,
  type ForbiddenReferenceKey,
} from "../constants.ts";
import { hardFail, manualReview, pass } from "./response.ts";

function getFlaggedKeys(
  check: AvatarMetadata["forbidden_reference_check"],
): ForbiddenReferenceKey[] {
  return ALL_FORBIDDEN_REFERENCE_KEYS.filter((key) => check[key] === true);
}

// RULE-FRB-003: a flagged forbidden reference is logically inconsistent with a passed copyright review
export function checkForbiddenReferenceConsistentWithCopyrightReview(
  m: AvatarMetadata,
): RuleResult {
  const flagged = getFlaggedKeys(m.forbidden_reference_check);
  if (flagged.length > 0 && m.validation.copyright_review_passed === true) {
    return hardFail(
      "RULE-FRB-003",
      "validation.copyright_review_passed",
      "copyright_review_passed is true but forbidden references are flagged — one or both values were set incorrectly and must be corrected",
      "If any forbidden_reference_check value is true, copyright_review_passed must be false",
      `flagged references: [${flagged.join(", ")}] — copyright_review_passed: true`,
    );
  }
  return pass();
}

// RULE-FRB-001: any flagged forbidden reference blocks production_enabled
export function checkForbiddenReferencesBlockProduction(m: AvatarMetadata): RuleResult {
  if (!m.deployment.production_enabled) return pass();

  const flagged = getFlaggedKeys(m.forbidden_reference_check);
  if (flagged.length > 0) {
    return hardFail(
      "RULE-FRB-001",
      "forbidden_reference_check",
      "production_enabled is true but one or more forbidden references are flagged — asset must be redesigned and resubmitted from concept stage",
      "All forbidden_reference_check values: false",
      `flagged: [${flagged.join(", ")}]`,
    );
  }
  return pass();
}

// RULE-FRB-002: any flagged forbidden reference blocks approved/production status
export function checkForbiddenReferencesBlockApprovedStatus(m: AvatarMetadata): RuleResult {
  const isApproved = (APPROVED_STATUSES as readonly string[]).includes(
    m.identity.status,
  );
  if (!isApproved) return pass();

  const flagged = getFlaggedKeys(m.forbidden_reference_check);
  if (flagged.length > 0) {
    return hardFail(
      "RULE-FRB-002",
      "forbidden_reference_check",
      `status is "${m.identity.status}" but one or more forbidden references are flagged — an asset with a confirmed forbidden reference cannot hold approved or production status`,
      "All forbidden_reference_check values: false",
      `flagged: [${flagged.join(", ")}]`,
    );
  }
  return pass();
}

// RULE-FRB-004 [MANUAL REVIEW]: any flagged reference requires documented review notes
export function checkForbiddenReferenceRequiresReviewNotes(m: AvatarMetadata): RuleResult {
  const flagged = getFlaggedKeys(m.forbidden_reference_check);
  if (flagged.length === 0) return pass();

  const notes = m.audit.review_notes;
  if (notes === null || notes.trim() === "") {
    return manualReview(
      "RULE-FRB-004",
      "audit.review_notes",
      "A forbidden reference is flagged but audit.review_notes is empty — every identified forbidden reference must be documented with what was found and the redesign decision",
      "Non-null, non-empty string describing the flagged reference and the remediation",
      "null or empty",
    );
  }
  return pass();
}
