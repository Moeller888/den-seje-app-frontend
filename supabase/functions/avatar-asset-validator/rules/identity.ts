import type { AvatarMetadata, RuleResult } from "../types.ts";
import { SCHEMA_VERSION } from "../constants.ts";
import { hardFail, pass } from "./response.ts";

// RULE-ID-004: schema_version must match active pipeline
export function checkSchemaVersion(m: AvatarMetadata): RuleResult {
  if (m.schema_version !== SCHEMA_VERSION) {
    return hardFail(
      "RULE-ID-004",
      "schema_version",
      "schema_version does not match the active pipeline version — asset was created against a different spec",
      SCHEMA_VERSION,
      String(m.schema_version),
    );
  }
  return pass();
}

// RULE-ID-001: asset_id prefix must exactly match slot
export function checkAssetIdPrefixMatchesSlot(m: AvatarMetadata): RuleResult {
  const firstUnderscore = m.identity.asset_id.indexOf("_");
  const prefix = firstUnderscore === -1
    ? m.identity.asset_id
    : m.identity.asset_id.slice(0, firstUnderscore);

  if (prefix !== m.identity.slot) {
    return hardFail(
      "RULE-ID-001",
      "identity.asset_id",
      "The prefix of asset_id (before first underscore) must exactly match identity.slot",
      `prefix "${m.identity.slot}"`,
      `prefix "${prefix}"`,
    );
  }
  return pass();
}

function isAllDigits(s: string): boolean {
  if (s.length === 0) return false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c < "0" || c > "9") return false;
  }
  return true;
}

// RULE-ID-002: asset_id must not contain a version suffix (_v followed by digits)
export function checkAssetIdHasNoVersionSuffix(m: AvatarMetadata): RuleResult {
  const segments = m.identity.asset_id.split("_");
  const hasVersionSuffix = segments.some(
    (seg) => seg.length > 1 && seg[0] === "v" && isAllDigits(seg.slice(1)),
  );

  if (hasVersionSuffix) {
    return hardFail(
      "RULE-ID-002",
      "identity.asset_id",
      "asset_id must not contain a version suffix — version is tracked in identity.version, not in the ID",
      "No _v{digits} segment in asset_id",
      m.identity.asset_id,
    );
  }
  return pass();
}

// RULE-ID-005: asset_id must be entirely lowercase
export function checkAssetIdIsLowercase(m: AvatarMetadata): RuleResult {
  if (m.identity.asset_id !== m.identity.asset_id.toLowerCase()) {
    return hardFail(
      "RULE-ID-005",
      "identity.asset_id",
      "asset_id must be entirely lowercase — mixed-case IDs cause filesystem and database conflicts",
      "Lowercase characters only",
      m.identity.asset_id,
    );
  }
  return pass();
}

// RULE-ID-003: version major component must be 1 for v1 pipeline assets
export function checkVersionMajorIsOne(m: AvatarMetadata): RuleResult {
  const dotIndex = m.identity.version.indexOf(".");
  const major = dotIndex === -1
    ? m.identity.version
    : m.identity.version.slice(0, dotIndex);

  if (major !== "1") {
    return hardFail(
      "RULE-ID-003",
      "identity.version",
      "Assets submitted through the v1 pipeline must have major version 1",
      "1.x",
      m.identity.version,
    );
  }
  return pass();
}
