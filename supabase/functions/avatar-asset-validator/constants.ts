import type { Slot } from "./types.ts";

export const SCHEMA_VERSION = "1.0" as const;
export const ACTIVE_PIPELINE_VERSION = "v1" as const;
export const POLYCOUNT_WARNING_THRESHOLD = 0.5 as const;

export const APPROVED_STATUSES = ["approved", "production"] as const;
export type ApprovedStatus = typeof APPROVED_STATUSES[number];

export interface SlotContract {
  attachment_type: "parented" | "skinned";
  attachment_bone: string | null;
  rig_required: boolean;
}

export const SLOT_ATTACHMENT_CONTRACTS: Record<Slot, SlotContract> = {
  hat: {
    attachment_type: "parented",
    attachment_bone: "attach_head",
    rig_required: false,
  },
  shirt: {
    attachment_type: "skinned",
    attachment_bone: null,
    rig_required: true,
  },
  shoe: {
    attachment_type: "parented",
    attachment_bone: null,
    rig_required: false,
  },
  inventory: {
    attachment_type: "parented",
    attachment_bone: "attach_hand_R",
    rig_required: false,
  },
};

export const VALID_SHOE_ATTACHMENT_BONES = [
  "attach_foot_L",
  "attach_foot_R",
] as const;
export type ValidShoeBone = typeof VALID_SHOE_ATTACHMENT_BONES[number];

export const RESERVED_BONES_V1 = ["attach_hand_L"] as const;
export type ReservedBone = typeof RESERVED_BONES_V1[number];

export const SLOT_POLYCOUNT_BUDGETS: Record<Slot, number> = {
  hat: 1200,
  shirt: 1800,
  shoe: 2000,
  inventory: 800,
};

export const ALL_VALIDATION_FLAG_KEYS = [
  "copyright_review_passed",
  "school_safe_review_passed",
  "thumbnail_readability_passed",
  "clipping_test_passed",
  "browser_validation_passed",
  "qa_approved",
] as const;
export type ValidationFlagKey = typeof ALL_VALIDATION_FLAG_KEYS[number];

export const ALL_FORBIDDEN_REFERENCE_KEYS = [
  "fortnite",
  "roblox",
  "minecraft",
  "nike",
  "adidas",
  "jordan",
  "marvel",
  "disney",
  "star_wars",
  "political_symbols",
  "nazi_symbols",
] as const;
export type ForbiddenReferenceKey = typeof ALL_FORBIDDEN_REFERENCE_KEYS[number];
