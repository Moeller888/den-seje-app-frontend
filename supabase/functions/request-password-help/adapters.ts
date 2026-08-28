// Section 173: contract validation between the Edge Function and the database.
//
// Pure by construction: no client, no fetch, no env, no imports. index.ts performs the actual
// queries and hands the raw results here; these functions decide whether what came back is
// something we are allowed to act on.
//
// WHY THIS EXISTS
// Two mistakes are easy to make with PostgREST and both are silent:
//
//   1. An UPDATE that matches ZERO rows returns no error. Treating that as success let the code
//      believe a reservation had been finalised while the row was still 'reserved', deleted, or
//      already moved on by something else.
//   2. An RPC returns whatever the function returns. Accepting any string as a rate-limit
//      "decision" means a malformed or unexpected result could be read as a suppression — or,
//      far worse, as permission to send mail.
//
// Nothing in this file ever puts an id, address or provider payload into an error message.

export type ReserveDecision = "reserved" | "suppressed_cooldown" | "suppressed_daily_cap";

// Exactly the decisions 20260808010000_password_help_reserve_rpc.sql can return. Anything else
// is a contract violation, not a value to interpret.
export const ALLOWED_DECISIONS: readonly string[] = [
  "reserved",
  "suppressed_cooldown",
  "suppressed_daily_cap",
];

// The statuses a reservation may legitimately end in.
export type TerminalStatus = "notified" | "mail_failed" | "technical_error";

export const TERMINAL_STATUSES: readonly string[] = ["notified", "mail_failed", "technical_error"];

// Statuses that consume the rate-limit budget: every state a row can hold once a reservation
// exists. All three terminal outcomes are ambiguous about whether the provider accepted the
// message — a rejected request and a lost response look identical from here — so all of them
// count, and so does an unfinished 'reserved'.
//
// THE SQL IS THE ENFORCER. This constant is not consulted at runtime; it exists so a drift
// between it and the `status IN (...)` list in 20260808010000_password_help_reserve_rpc.sql is
// caught by a test rather than by a duplicate mail landing in a teacher's inbox.
export const BUDGET_CONSUMING_STATUSES: readonly string[] = [
  "reserved",
  ...TERMINAL_STATUSES,
];

export interface ReserveResult {
  decision: ReserveDecision;
  requestId: string;
}

function isUuidLike(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

// Validates the RPC payload. PostgREST returns RETURNS TABLE as an array of row objects; a
// single object is accepted too, because that is the other shape the client can produce.
//
// A malformed response is NEVER downgraded to a suppression: it throws. Reading garbage as
// "suppressed" would silently stop notifications; reading it as "reserved" would send mail
// without a reservation. Both are worse than failing closed.
export function parseReserveResult(raw: unknown): ReserveResult {
  const row = Array.isArray(raw) ? raw[0] : raw;

  if (!row || typeof row !== "object") {
    throw new Error("reserve_password_help returned no usable row");
  }

  const candidate = row as Record<string, unknown>;
  const decision = candidate.decision;
  const requestId = candidate.request_id;

  if (typeof decision !== "string" || ALLOWED_DECISIONS.indexOf(decision) === -1) {
    // The value itself is ours, not user data, and is safe to name.
    throw new Error(
      `reserve_password_help returned an unknown decision: ${typeof decision === "string" ? decision : typeof decision}`,
    );
  }

  if (!isUuidLike(requestId)) {
    throw new Error("reserve_password_help returned no usable request id");
  }

  return { decision: decision as ReserveDecision, requestId };
}

// Validates the rows an UPDATE ... RETURNING gave back.
//
// The update itself must be scoped to `id = requestId AND status = 'reserved'`, so a row coming
// back is proof that exactly that reservation made exactly that transition. Zero rows means the
// reservation was not in the state we believed — already finalised, deleted, or never ours —
// and that must be loud.
export function assertFinalizedExactlyOne(
  raw: unknown,
  expectedRequestId: string,
  expectedStatus: TerminalStatus,
): void {
  if (!Array.isArray(raw)) {
    throw new Error("finalize returned no row set");
  }

  if (raw.length === 0) {
    throw new Error(
      `finalize affected 0 rows: the reservation was not in 'reserved' state (expected transition to ${expectedStatus})`,
    );
  }

  if (raw.length > 1) {
    throw new Error(`finalize affected ${raw.length} rows; exactly 1 was expected`);
  }

  const row = raw[0] as Record<string, unknown> | null;
  if (!row || typeof row !== "object") {
    throw new Error("finalize returned a malformed row");
  }

  if (row.id !== expectedRequestId) {
    // Ids are not logged: naming which one differed would put both in the message.
    throw new Error("finalize updated a different row than the one reserved");
  }

  if (row.status !== expectedStatus) {
    throw new Error(`finalize left the row in status ${String(row.status)}; ${expectedStatus} was expected`);
  }
}
