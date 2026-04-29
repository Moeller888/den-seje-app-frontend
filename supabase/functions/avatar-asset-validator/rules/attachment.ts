import type { AvatarMetadata, RuleResult } from "../types.ts";
import {
  SLOT_ATTACHMENT_CONTRACTS,
  VALID_SHOE_ATTACHMENT_BONES,
  RESERVED_BONES_V1,
} from "../constants.ts";
import { hardFail, pass } from "./response.ts";

function checkHatContract(m: AvatarMetadata): RuleResult {
  const contract = SLOT_ATTACHMENT_CONTRACTS.hat;
  const tech = m.technical;

  if (tech.attachment_type !== contract.attachment_type) {
    return hardFail(
      "RULE-ATT-001",
      "technical.attachment_type",
      "Hat slot requires attachment_type: parented",
      contract.attachment_type,
      tech.attachment_type,
    );
  }
  if (tech.attachment_bone !== contract.attachment_bone) {
    return hardFail(
      "RULE-ATT-001",
      "technical.attachment_bone",
      "Hat slot requires attachment_bone: attach_head",
      String(contract.attachment_bone),
      String(tech.attachment_bone),
    );
  }
  if (tech.rig_required !== contract.rig_required) {
    return hardFail(
      "RULE-ATT-001",
      "technical.rig_required",
      "Hat slot requires rig_required: false",
      String(contract.rig_required),
      String(tech.rig_required),
    );
  }
  return pass();
}

function checkShirtContract(m: AvatarMetadata): RuleResult {
  const contract = SLOT_ATTACHMENT_CONTRACTS.shirt;
  const tech = m.technical;

  if (tech.attachment_type !== contract.attachment_type) {
    return hardFail(
      "RULE-ATT-002",
      "technical.attachment_type",
      "Shirt slot requires attachment_type: skinned",
      contract.attachment_type,
      tech.attachment_type,
    );
  }
  if (tech.attachment_bone !== null) {
    return hardFail(
      "RULE-ATT-002",
      "technical.attachment_bone",
      "Shirt slot requires attachment_bone: null — shirt is skinned to the base rig, not parented to a single bone",
      "null",
      String(tech.attachment_bone),
    );
  }
  if (tech.rig_required !== contract.rig_required) {
    return hardFail(
      "RULE-ATT-002",
      "technical.rig_required",
      "Shirt slot requires rig_required: true",
      String(contract.rig_required),
      String(tech.rig_required),
    );
  }
  return pass();
}

function checkShoeContract(m: AvatarMetadata): RuleResult {
  const contract = SLOT_ATTACHMENT_CONTRACTS.shoe;
  const tech = m.technical;

  if (tech.attachment_type !== contract.attachment_type) {
    return hardFail(
      "RULE-ATT-003",
      "technical.attachment_type",
      "Shoe slot requires attachment_type: parented",
      contract.attachment_type,
      tech.attachment_type,
    );
  }

  const bone = tech.attachment_bone;
  const isValidShoeBone =
    bone !== null &&
    (VALID_SHOE_ATTACHMENT_BONES as readonly string[]).includes(bone);

  if (!isValidShoeBone) {
    return hardFail(
      "RULE-ATT-003",
      "technical.attachment_bone",
      "Shoe slot requires attachment_bone to be a valid foot bone",
      VALID_SHOE_ATTACHMENT_BONES.join(" | "),
      String(bone),
    );
  }
  if (tech.rig_required !== contract.rig_required) {
    return hardFail(
      "RULE-ATT-003",
      "technical.rig_required",
      "Shoe slot requires rig_required: false",
      String(contract.rig_required),
      String(tech.rig_required),
    );
  }
  return pass();
}

function checkInventoryContract(m: AvatarMetadata): RuleResult {
  const contract = SLOT_ATTACHMENT_CONTRACTS.inventory;
  const tech = m.technical;

  if (tech.attachment_type !== contract.attachment_type) {
    return hardFail(
      "RULE-ATT-004",
      "technical.attachment_type",
      "Inventory slot requires attachment_type: parented",
      contract.attachment_type,
      tech.attachment_type,
    );
  }
  if (tech.attachment_bone !== contract.attachment_bone) {
    return hardFail(
      "RULE-ATT-004",
      "technical.attachment_bone",
      "Inventory slot requires attachment_bone: attach_hand_R",
      String(contract.attachment_bone),
      String(tech.attachment_bone),
    );
  }
  if (tech.rig_required !== contract.rig_required) {
    return hardFail(
      "RULE-ATT-004",
      "technical.rig_required",
      "Inventory slot requires rig_required: false",
      String(contract.rig_required),
      String(tech.rig_required),
    );
  }
  return pass();
}

// RULE-ATT-005: no reserved v1 bones may be used on any asset
function checkNoReservedBones(m: AvatarMetadata): RuleResult {
  const bone = m.technical.attachment_bone;
  if (bone === null) return pass();

  const isReserved = (RESERVED_BONES_V1 as readonly string[]).includes(bone);
  if (isReserved) {
    return hardFail(
      "RULE-ATT-005",
      "technical.attachment_bone",
      `${bone} is reserved for a future slot that does not exist in v1 — no v1 asset may use it`,
      "A non-reserved v1 attachment bone",
      bone,
    );
  }
  return pass();
}

// Entry point: dispatches to the correct slot contract and appends RULE-ATT-005
export function checkSlotAttachmentContracts(m: AvatarMetadata): RuleResult[] {
  const results: RuleResult[] = [];
  const slot = m.identity.slot;

  switch (slot) {
    case "hat":
      results.push(checkHatContract(m));
      break;
    case "shirt":
      results.push(checkShirtContract(m));
      break;
    case "shoe":
      results.push(checkShoeContract(m));
      break;
    case "inventory":
      results.push(checkInventoryContract(m));
      break;
    default: {
      const exhaustive: never = slot;
      results.push(
        hardFail(
          "RULE-ATT-000",
          "identity.slot",
          "Unknown slot value — cannot validate attachment contract",
          "hat | shirt | shoe | inventory",
          String(exhaustive),
        ),
      );
    }
  }

  results.push(checkNoReservedBones(m));
  return results;
}
