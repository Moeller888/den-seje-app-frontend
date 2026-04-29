import type { AvatarMetadata, RuleResult } from "../types.ts";
import { POLYCOUNT_WARNING_THRESHOLD } from "../constants.ts";
import { hardFail, pass, warn } from "./response.ts";

// RULE-NUM-003: polycount_actual must be non-zero (template default not replaced)
export function checkPolycountActualNonZero(m: AvatarMetadata): RuleResult {
  if (m.technical.polycount_actual <= 0) {
    return hardFail(
      "RULE-NUM-003",
      "technical.polycount_actual",
      "polycount_actual is zero — this field was not filled in from the template",
      "> 0",
      String(m.technical.polycount_actual),
    );
  }
  return pass();
}

// RULE-NUM-004: file_size_kb_actual must be non-zero (template default not replaced)
export function checkFileSizeActualNonZero(m: AvatarMetadata): RuleResult {
  if (m.technical.file_size_kb_actual <= 0) {
    return hardFail(
      "RULE-NUM-004",
      "technical.file_size_kb_actual",
      "file_size_kb_actual is zero — this field was not filled in from the template",
      "> 0",
      String(m.technical.file_size_kb_actual),
    );
  }
  return pass();
}

// RULE-NUM-001: polycount_actual must not exceed polycount_max
export function checkPolycountWithinMax(m: AvatarMetadata): RuleResult {
  if (m.technical.polycount_actual > m.technical.polycount_max) {
    return hardFail(
      "RULE-NUM-001",
      "technical.polycount_actual",
      "polycount_actual exceeds polycount_max — asset must be re-exported with correct geometry before resubmission",
      `<= ${m.technical.polycount_max}`,
      String(m.technical.polycount_actual),
    );
  }
  return pass();
}

// RULE-NUM-002: file_size_kb_actual must not exceed file_size_kb_max
export function checkFileSizeWithinMax(m: AvatarMetadata): RuleResult {
  if (m.technical.file_size_kb_actual > m.technical.file_size_kb_max) {
    return hardFail(
      "RULE-NUM-002",
      "technical.file_size_kb_actual",
      "file_size_kb_actual exceeds file_size_kb_max — asset must be re-exported or re-textured before resubmission",
      `<= ${m.technical.file_size_kb_max}`,
      String(m.technical.file_size_kb_actual),
    );
  }
  return pass();
}

// RULE-NUM-005 [WARNING]: polycount_actual should not be at or below 50% of the asset's declared polycount_max
export function checkPolycountNotUnderDetailed(m: AvatarMetadata): RuleResult {
  const threshold = Math.floor(
    m.technical.polycount_max * POLYCOUNT_WARNING_THRESHOLD,
  );
  if (m.technical.polycount_actual <= threshold) {
    return warn(
      "RULE-NUM-005",
      "technical.polycount_actual",
      "polycount_actual is at or below 50% of polycount_max — asset may be under-detailed for its declared budget",
      `> ${threshold} (50% of polycount_max ${m.technical.polycount_max})`,
      String(m.technical.polycount_actual),
    );
  }
  return pass();
}
