export type Slot = "hat" | "shirt" | "shoe" | "inventory";
export type Status = "draft" | "review" | "approved" | "production" | "deprecated";
export type Rarity = "standard" | "uncommon" | "rare" | "legendary";
export type AttachmentType = "parented" | "skinned";
export type RolloutStage = "none" | "staging" | "canary" | "production";
export type Severity = "HARD_FAIL" | "WARNING" | "MANUAL_REVIEW_REQUIRED";

export interface AvatarMetadataIdentity {
  asset_id: string;
  display_name: string;
  slot: Slot;
  version: string;
  status: Status;
  created_by: string;
  created_at: string;
  approved_by: string | null;
  approved_at: string | null;
}

export interface AvatarMetadataClassification {
  rarity: Rarity;
  school_safe: boolean;
  moderation_required: boolean;
  whitelist_approved: boolean;
}

export interface AvatarMetadataVisual {
  primary_color: string;
  secondary_color: string | null;
  accent_color: string | null;
  silhouette_type: string;
  thumbnail_priority: number;
}

export interface AvatarMetadataTechnical {
  polycount_max: number;
  polycount_actual: number;
  texture_resolution: string;
  texture_format: "png";
  texture_embedded: boolean;
  export_format: "glb";
  file_size_kb_max: number;
  file_size_kb_actual: number;
  attachment_type: AttachmentType;
  attachment_bone: string | null;
  rig_required: boolean;
}

export interface AvatarMetadataValidation {
  copyright_review_passed: boolean;
  school_safe_review_passed: boolean;
  thumbnail_readability_passed: boolean;
  clipping_test_passed: boolean;
  browser_validation_passed: boolean;
  qa_approved: boolean;
}

export interface AvatarMetadataForbiddenReferenceCheck {
  fortnite: boolean;
  roblox: boolean;
  minecraft: boolean;
  nike: boolean;
  adidas: boolean;
  jordan: boolean;
  marvel: boolean;
  disney: boolean;
  star_wars: boolean;
  political_symbols: boolean;
  nazi_symbols: boolean;
}

export interface AvatarMetadataDeployment {
  production_enabled: boolean;
  release_group: string;
  rollout_stage: RolloutStage;
}

export interface AvatarMetadataAudit {
  last_modified_by: string;
  last_modified_at: string;
  review_notes: string | null;
}

export interface AvatarMetadata {
  schema_version: string;
  identity: AvatarMetadataIdentity;
  classification: AvatarMetadataClassification;
  visual: AvatarMetadataVisual;
  technical: AvatarMetadataTechnical;
  validation: AvatarMetadataValidation;
  forbidden_reference_check: AvatarMetadataForbiddenReferenceCheck;
  deployment: AvatarMetadataDeployment;
  audit: AvatarMetadataAudit;
}

export interface ValidationError {
  rule_id: string;
  severity: Severity;
  field: string;
  message: string;
  expected: string;
  actual: string;
}

export interface RuleResult {
  passed: boolean;
  error: ValidationError | null;
}

export interface ValidationResponse {
  valid: boolean;
  asset_id: string | null;
  errors: ValidationError[];
  warnings: ValidationError[];
  manual_review_flags: ValidationError[];
}
