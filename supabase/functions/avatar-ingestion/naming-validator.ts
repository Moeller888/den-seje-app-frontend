import type { NamingValidationError } from "./types.ts";

// Valid slots and their required asset_id prefix.
const SLOT_PREFIXES: Record<string, string> = {
  hat: "hat_",
  shirt: "shirt_",
  shoe: "shoe_",
  inventory: "inventory_",
};

const MAX_ASSET_ID_LENGTH = 64;

// Returns null if the asset_id is valid for the given slot, or a NamingValidationError.
export function validateAssetIdNaming(
  assetId: string,
  slot: string,
): NamingValidationError | null {
  if (assetId.trim().length === 0) {
    return {
      rule_id: "RULE-ING-ID-001",
      field: "asset_id",
      message: "asset_id must not be empty",
    };
  }

  if (assetId.length > MAX_ASSET_ID_LENGTH) {
    return {
      rule_id: "RULE-ING-ID-002",
      field: "asset_id",
      message: `asset_id must not exceed ${MAX_ASSET_ID_LENGTH} characters (got ${assetId.length})`,
    };
  }

  // All characters must be lowercase letters, digits, or underscores.
  // No regex — explicit character-by-character check.
  if (!isValidAssetIdCharacters(assetId)) {
    return {
      rule_id: "RULE-ING-ID-003",
      field: "asset_id",
      message:
        "asset_id must contain only lowercase letters (a-z), digits (0-9), and underscores (_)",
    };
  }

  // Must start with the slot prefix.
  const expectedPrefix = SLOT_PREFIXES[slot];
  if (expectedPrefix === undefined) {
    return {
      rule_id: "RULE-ING-ID-004",
      field: "slot",
      message: `slot "${slot}" is not a recognised slot value`,
    };
  }

  if (!assetId.startsWith(expectedPrefix)) {
    return {
      rule_id: "RULE-ING-ID-005",
      field: "asset_id",
      message: `asset_id for slot "${slot}" must start with "${expectedPrefix}" (got "${assetId}")`,
    };
  }

  // Must not contain a version suffix pattern: _v followed by one or more digits at end.
  // Checked without regex using explicit suffix scanning.
  if (hasVersionSuffix(assetId)) {
    return {
      rule_id: "RULE-ING-ID-006",
      field: "asset_id",
      message:
        'asset_id must not contain a version suffix (e.g. "_v1", "_v2") — use a permanent name',
    };
  }

  return null;
}

// Returns true if the string contains only lowercase a-z, 0-9, and underscore.
function isValidAssetIdCharacters(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const isLower = c >= "a" && c <= "z";
    const isDigit = c >= "0" && c <= "9";
    const isUnderscore = c === "_";
    if (!isLower && !isDigit && !isUnderscore) return false;
  }
  return true;
}

// Returns true if the string ends with _v followed only by digits.
// E.g. "hat_baseball_v1" → true, "hat_baseball" → false.
function hasVersionSuffix(s: string): boolean {
  // Find last occurrence of "_v"
  let idx = -1;
  for (let i = s.length - 2; i >= 0; i--) {
    if (s[i] === "_" && s[i + 1] === "v") {
      idx = i;
      break;
    }
  }
  if (idx === -1) return false;

  // Everything after "_v" must be one or more digits
  const afterV = s.slice(idx + 2);
  if (afterV.length === 0) return false;

  for (let i = 0; i < afterV.length; i++) {
    const c = afterV[i];
    if (c < "0" || c > "9") return false;
  }
  return true;
}

// Returns a NamingValidationError if display_name contains the asset_id as a substring,
// or if display_name contains a version marker. Returns null if clean.
export function validateDisplayNameForForbiddenReferences(
  displayName: string,
  assetId: string,
): NamingValidationError | null {
  if (displayName.trim().length === 0) {
    return {
      rule_id: "RULE-ING-REF-001",
      field: "identity.display_name",
      message: "display_name must not be empty",
    };
  }

  // display_name must not contain the raw asset_id as a substring.
  if (displayName.includes(assetId)) {
    return {
      rule_id: "RULE-ING-REF-002",
      field: "identity.display_name",
      message:
        `display_name must not contain the asset_id ("${assetId}") as a literal substring`,
    };
  }

  // display_name must not contain version markers.
  const versionMarkers = [" v1", " v2", " v3", " v4", " v5", "(v1)", "(v2)", "(test)", "(temp)", "(draft)"];
  for (const marker of versionMarkers) {
    if (displayName.toLowerCase().includes(marker)) {
      return {
        rule_id: "RULE-ING-REF-003",
        field: "identity.display_name",
        message: `display_name must not contain version or temporary markers (found "${marker.trim()}")`,
      };
    }
  }

  return null;
}
