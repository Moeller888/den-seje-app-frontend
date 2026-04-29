import type {
  AvatarMetadata,
  ValidationError,
  ValidationResponse,
  RuleResult,
} from "./types.ts";
import { validateAgainstSchema } from "./schema-loader.ts";
import {
  buildSuccessResponse,
  buildFailureResponse,
} from "./rules/response.ts";
import {
  checkSchemaVersion,
  checkAssetIdPrefixMatchesSlot,
  checkAssetIdHasNoVersionSuffix,
  checkAssetIdIsLowercase,
  checkVersionMajorIsOne,
} from "./rules/identity.ts";
import {
  checkPolycountActualNonZero,
  checkFileSizeActualNonZero,
  checkPolycountWithinMax,
  checkFileSizeWithinMax,
  checkPolycountNotUnderDetailed,
} from "./rules/numerics.ts";
import { checkSlotAttachmentContracts } from "./rules/attachment.ts";
import {
  checkApprovedAtNotBeforeCreatedAt,
  checkLastModifiedAtNotBeforeCreatedAt,
  checkApprovedByPresent,
  checkApprovedAtPresent,
  checkNoSelfApproval,
} from "./rules/approval.ts";
import {
  checkForbiddenReferenceConsistentWithCopyrightReview,
  checkForbiddenReferencesBlockProduction,
  checkForbiddenReferencesBlockApprovedStatus,
  checkForbiddenReferenceRequiresReviewNotes,
} from "./rules/forbidden.ts";
import {
  checkDeprecatedNotProductionEnabled,
  checkProductionEnabledRequiresApprovedStatus,
  checkProductionEnabledRequiresRolloutStage,
  checkReleaseGroupMatchesPipeline,
  checkProductionEnabledRequiresTextureEmbedded,
  checkDraftWithNonNoneRolloutStage,
} from "./rules/release.ts";
import {
  checkSchoolSafeRequiredForProduction,
  checkWhitelistApprovedRequiredForProduction,
  checkSchoolSafeReviewConsistentWithClassification,
  checkAllValidationFlagsForProduction,
  checkQaApprovedForApprovedStatus,
} from "./rules/completeness.ts";

function extractAssetId(input: unknown): string | null {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const root = input as Record<string, unknown>;
  const identity = root["identity"];
  if (identity === null || typeof identity !== "object" || Array.isArray(identity)) {
    return null;
  }
  const id = (identity as Record<string, unknown>)["asset_id"];
  return typeof id === "string" ? id : null;
}

export async function validateAvatarMetadata(
  input: unknown,
): Promise<ValidationResponse> {
  const assetId = extractAssetId(input);
  const hardErrors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const manualReviewFlags: ValidationError[] = [];

  // ── Route a single RuleResult into the correct bucket ────────────────────
  function route(result: RuleResult): void {
    if (result.passed || result.error === null) return;
    switch (result.error.severity) {
      case "HARD_FAIL":
        hardErrors.push(result.error);
        break;
      case "WARNING":
        warnings.push(result.error);
        break;
      case "MANUAL_REVIEW_REQUIRED":
        manualReviewFlags.push(result.error);
        break;
    }
  }

  function hasHardErrors(): boolean {
    return hardErrors.length > 0;
  }

  function fail(): ValidationResponse {
    return buildFailureResponse(assetId, hardErrors, warnings, manualReviewFlags);
  }

  // ── Step 0: JSON Schema validation ────────────────────────────────────────
  // Must pass before any business rules run.
  const schemaResult = await validateAgainstSchema(input);
  if (!schemaResult.valid) {
    const schemaErrors: ValidationError[] = schemaResult.errors.map((e) => ({
      rule_id: "SCHEMA",
      severity: "HARD_FAIL",
      field: e.field,
      message: e.message,
      expected: "Valid structure per metadata.schema.json",
      actual: e.field,
    }));
    return buildFailureResponse(assetId, schemaErrors, [], []);
  }

  // Schema passed — safe to cast.
  const m = input as AvatarMetadata;

  // ── Step 1: RULE-ID-004 ───────────────────────────────────────────────────
  route(checkSchemaVersion(m));
  if (hasHardErrors()) return fail();

  // ── Step 2: RULE-ID-001 ───────────────────────────────────────────────────
  route(checkAssetIdPrefixMatchesSlot(m));
  if (hasHardErrors()) return fail();

  // ── Step 3: RULE-ID-002 ───────────────────────────────────────────────────
  route(checkAssetIdHasNoVersionSuffix(m));
  if (hasHardErrors()) return fail();

  // ── Step 4: RULE-ID-005 ───────────────────────────────────────────────────
  route(checkAssetIdIsLowercase(m));
  if (hasHardErrors()) return fail();

  // ── Step 5: RULE-ID-003 ───────────────────────────────────────────────────
  route(checkVersionMajorIsOne(m));
  if (hasHardErrors()) return fail();

  // ── Step 6: RULE-NUM-003 ─────────────────────────────────────────────────
  route(checkPolycountActualNonZero(m));
  if (hasHardErrors()) return fail();

  // ── Step 7: RULE-NUM-004 ─────────────────────────────────────────────────
  route(checkFileSizeActualNonZero(m));
  if (hasHardErrors()) return fail();

  // ── Step 8: RULE-NUM-001 ─────────────────────────────────────────────────
  route(checkPolycountWithinMax(m));
  if (hasHardErrors()) return fail();

  // ── Step 9: RULE-NUM-002 ─────────────────────────────────────────────────
  route(checkFileSizeWithinMax(m));
  if (hasHardErrors()) return fail();

  // ── Step 10: RULE-ATT-001/002/003/004/005 ────────────────────────────────
  for (const result of checkSlotAttachmentContracts(m)) {
    route(result);
    if (hasHardErrors()) return fail();
  }

  // ── Step 11: RULE-APR-003, RULE-APR-005 ─────────────────────────────────
  route(checkApprovedAtNotBeforeCreatedAt(m));
  route(checkLastModifiedAtNotBeforeCreatedAt(m));
  if (hasHardErrors()) return fail();

  // ── Step 12: RULE-APR-001, RULE-APR-002 ─────────────────────────────────
  route(checkApprovedByPresent(m));
  route(checkApprovedAtPresent(m));
  if (hasHardErrors()) return fail();

  // ── Step 13: RULE-FRB-003, RULE-FRB-001, RULE-FRB-002 ──────────────────
  route(checkForbiddenReferenceConsistentWithCopyrightReview(m));
  route(checkForbiddenReferencesBlockProduction(m));
  route(checkForbiddenReferencesBlockApprovedStatus(m));
  if (hasHardErrors()) return fail();

  // ── Step 14: RULE-REL-003/001/002/005/006 ────────────────────────────────
  route(checkDeprecatedNotProductionEnabled(m));
  route(checkProductionEnabledRequiresApprovedStatus(m));
  route(checkProductionEnabledRequiresRolloutStage(m));
  route(checkReleaseGroupMatchesPipeline(m));
  route(checkProductionEnabledRequiresTextureEmbedded(m));
  if (hasHardErrors()) return fail();

  // ── Step 15: RULE-CMP-004/003/005/001/002 ────────────────────────────────
  route(checkSchoolSafeRequiredForProduction(m));
  route(checkWhitelistApprovedRequiredForProduction(m));
  route(checkSchoolSafeReviewConsistentWithClassification(m));
  route(checkAllValidationFlagsForProduction(m));
  route(checkQaApprovedForApprovedStatus(m));
  if (hasHardErrors()) return fail();

  // ── Step 16: Warnings (always run, never block) ──────────────────────────
  route(checkPolycountNotUnderDetailed(m));
  route(checkDraftWithNonNoneRolloutStage(m));

  // ── Step 17: Manual review flags (always run, never block) ───────────────
  route(checkNoSelfApproval(m));
  route(checkForbiddenReferenceRequiresReviewNotes(m));

  return buildSuccessResponse(assetId, warnings, manualReviewFlags);
}
