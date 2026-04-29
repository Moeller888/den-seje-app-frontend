import type { AvatarMetadata, RuleResult } from "../types.ts";
import { APPROVED_STATUSES, type ApprovedStatus } from "../constants.ts";
import { hardFail, manualReview, pass } from "./response.ts";

function parseDateMs(dateStr: string): number {
  return new Date(dateStr).getTime();
}

function isValidDateString(dateStr: string): boolean {
  if (typeof dateStr !== "string" || dateStr.trim() === "") return false;
  const ms = new Date(dateStr).getTime();
  return !isNaN(ms);
}

function isApprovedStatus(status: string): status is ApprovedStatus {
  return (APPROVED_STATUSES as readonly string[]).includes(status);
}

// RULE-APR-003: approved_at must not be earlier than created_at
export function checkApprovedAtNotBeforeCreatedAt(m: AvatarMetadata): RuleResult {
  const { approved_at, created_at } = m.identity;
  if (approved_at === null) return pass();

  if (!isValidDateString(approved_at)) {
    return hardFail(
      "RULE-APR-003",
      "identity.approved_at",
      "approved_at is not a valid date string",
      "Valid ISO date string (YYYY-MM-DD)",
      String(approved_at),
    );
  }
  if (!isValidDateString(created_at)) {
    return hardFail(
      "RULE-APR-003",
      "identity.created_at",
      "created_at is not a valid date string",
      "Valid ISO date string (YYYY-MM-DD)",
      String(created_at),
    );
  }

  if (parseDateMs(approved_at) < parseDateMs(created_at)) {
    return hardFail(
      "RULE-APR-003",
      "identity.approved_at",
      "approved_at must not precede created_at — indicates data corruption or manual field manipulation",
      `>= ${created_at}`,
      approved_at,
    );
  }
  return pass();
}

// RULE-APR-005: last_modified_at must not be earlier than created_at
export function checkLastModifiedAtNotBeforeCreatedAt(m: AvatarMetadata): RuleResult {
  const { last_modified_at } = m.audit;
  const { created_at } = m.identity;

  if (!isValidDateString(last_modified_at)) {
    return hardFail(
      "RULE-APR-005",
      "audit.last_modified_at",
      "audit.last_modified_at is not a valid date string",
      "Valid ISO date string (YYYY-MM-DD)",
      String(last_modified_at),
    );
  }
  if (!isValidDateString(created_at)) {
    return hardFail(
      "RULE-APR-005",
      "identity.created_at",
      "identity.created_at is not a valid date string",
      "Valid ISO date string (YYYY-MM-DD)",
      String(created_at),
    );
  }

  if (parseDateMs(last_modified_at) < parseDateMs(created_at)) {
    return hardFail(
      "RULE-APR-005",
      "audit.last_modified_at",
      "audit.last_modified_at must not precede created_at — indicates data corruption",
      `>= ${created_at}`,
      last_modified_at,
    );
  }
  return pass();
}

// RULE-APR-001: approved status requires non-null approved_by
export function checkApprovedByPresent(m: AvatarMetadata): RuleResult {
  if (!isApprovedStatus(m.identity.status)) return pass();

  if (m.identity.approved_by === null || m.identity.approved_by.trim() === "") {
    return hardFail(
      "RULE-APR-001",
      "identity.approved_by",
      `status is "${m.identity.status}" but approved_by is null — no asset may hold approved/production status without a named approver`,
      "Non-null, non-empty string",
      "null",
    );
  }
  return pass();
}

// RULE-APR-002: approved status requires non-null approved_at
export function checkApprovedAtPresent(m: AvatarMetadata): RuleResult {
  if (!isApprovedStatus(m.identity.status)) return pass();

  if (m.identity.approved_at === null) {
    return hardFail(
      "RULE-APR-002",
      "identity.approved_at",
      `status is "${m.identity.status}" but approved_at is null — no asset may hold approved/production status without an approval timestamp`,
      "Non-null date string",
      "null",
    );
  }
  return pass();
}

// RULE-APR-004 [MANUAL REVIEW]: approved_by must not equal created_by
export function checkNoSelfApproval(m: AvatarMetadata): RuleResult {
  if (m.identity.approved_by === null) return pass();

  if (m.identity.approved_by === m.identity.created_by) {
    return manualReview(
      "RULE-APR-004",
      "identity.approved_by",
      "approved_by is the same person as created_by — self-approval bypasses the independent review requirement",
      "A different person from created_by",
      m.identity.approved_by,
    );
  }
  return pass();
}
