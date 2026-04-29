import type { AvatarMetadata, RuleResult } from "../types.ts";
import { APPROVED_STATUSES, ACTIVE_PIPELINE_VERSION } from "../constants.ts";
import { hardFail, pass, warn } from "./response.ts";

// RULE-REL-003: deprecated assets cannot be production_enabled
export function checkDeprecatedNotProductionEnabled(m: AvatarMetadata): RuleResult {
  if (m.identity.status === "deprecated" && m.deployment.production_enabled) {
    return hardFail(
      "RULE-REL-003",
      "deployment.production_enabled",
      "Deprecated assets cannot be production_enabled — deprecated assets are removed from the whitelist",
      "false",
      "true",
    );
  }
  return pass();
}

// RULE-REL-001: production_enabled requires approved or production status
export function checkProductionEnabledRequiresApprovedStatus(m: AvatarMetadata): RuleResult {
  if (!m.deployment.production_enabled) return pass();

  const isApproved = (APPROVED_STATUSES as readonly string[]).includes(
    m.identity.status,
  );
  if (!isApproved) {
    return hardFail(
      "RULE-REL-001",
      "identity.status",
      "production_enabled is true but status has not reached approved or production — asset must complete the full approval workflow first",
      "approved | production",
      m.identity.status,
    );
  }
  return pass();
}

// RULE-REL-002: production_enabled requires a non-none rollout_stage
export function checkProductionEnabledRequiresRolloutStage(m: AvatarMetadata): RuleResult {
  if (!m.deployment.production_enabled) return pass();

  if (m.deployment.rollout_stage === "none") {
    return hardFail(
      "RULE-REL-002",
      "deployment.rollout_stage",
      "production_enabled is true but rollout_stage is none — asset has not been assigned to a release wave",
      "staging | canary | production",
      "none",
    );
  }
  return pass();
}

// RULE-REL-005: release_group must match the active pipeline version
export function checkReleaseGroupMatchesPipeline(m: AvatarMetadata): RuleResult {
  if (m.deployment.release_group !== ACTIVE_PIPELINE_VERSION) {
    return hardFail(
      "RULE-REL-005",
      "deployment.release_group",
      "release_group does not match the active pipeline version — assets intended for a different release group must not enter the v1 pipeline",
      ACTIVE_PIPELINE_VERSION,
      m.deployment.release_group,
    );
  }
  return pass();
}

// RULE-REL-006: production_enabled requires texture_embedded
export function checkProductionEnabledRequiresTextureEmbedded(m: AvatarMetadata): RuleResult {
  if (!m.deployment.production_enabled) return pass();

  if (!m.technical.texture_embedded) {
    return hardFail(
      "RULE-REL-006",
      "technical.texture_embedded",
      "production_enabled is true but texture_embedded is false — all textures must be embedded in the .glb file before production release",
      "true",
      "false",
    );
  }
  return pass();
}

// RULE-REL-004 [WARNING]: draft status with a non-none rollout_stage is a sequencing error
export function checkDraftWithNonNoneRolloutStage(m: AvatarMetadata): RuleResult {
  if (m.identity.status === "draft" && m.deployment.rollout_stage !== "none") {
    return warn(
      "RULE-REL-004",
      "deployment.rollout_stage",
      "Draft asset has a non-none rollout_stage — this suggests a pipeline sequencing error and must be corrected before the asset advances to review status",
      "none",
      m.deployment.rollout_stage,
    );
  }
  return pass();
}
