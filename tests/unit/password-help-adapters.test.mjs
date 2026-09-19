// Section 173: isolated coverage for the database contract validators.
//
// These guard the two silent failure modes of PostgREST:
//   - an UPDATE that matches zero rows returns no error;
//   - an RPC returns whatever it returns, and any string would otherwise be accepted as a
//     rate-limit decision.
//
// Pure functions, fakes only, no network.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  parseReserveResult,
  assertFinalizedExactlyOne,
  ALLOWED_DECISIONS,
  TERMINAL_STATUSES,
  BUDGET_CONSUMING_STATUSES,
} from "../../supabase/functions/request-password-help/adapters.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const RESERVE_SQL = join(
  HERE, "..", "..", "supabase", "migrations", "20260808010000_password_help_reserve_rpc.sql",
);

let fetchCalls = 0;
let realFetch;

before(() => {
  realFetch = globalThis.fetch;
  globalThis.fetch = (...args) => {
    fetchCalls++;
    throw new Error(`network is disabled — fetch() called with ${String(args[0])}`);
  };
});

after(() => {
  globalThis.fetch = realFetch;
});

const ID = "11111111-2222-4333-8444-555555555555";

// ── RPC decision validation ──────────────────────────────────────────────────

test("the three documented decisions are accepted, from an array or a bare row", () => {
  for (const decision of ALLOWED_DECISIONS) {
    assert.deepEqual(parseReserveResult([{ decision, request_id: ID }]), { decision, requestId: ID });
    assert.deepEqual(parseReserveResult({ decision, request_id: ID }), { decision, requestId: ID });
  }
});

test("an unknown decision throws instead of being interpreted", () => {
  for (const decision of ["allowed", "RESERVED", "", "suppressed", "notified"]) {
    assert.throws(
      () => parseReserveResult([{ decision, request_id: ID }]),
      /unknown decision/,
      `"${decision}" must not be accepted`,
    );
  }
});

test("a malformed decision is never downgraded to a suppression", () => {
  // The dangerous reading: treating garbage as "suppressed" would silently stop help; treating
  // it as "reserved" would send mail without a reservation. Both must throw.
  for (const raw of [null, undefined, [], [null], {}, [{ request_id: ID }], "reserved", 42]) {
    assert.throws(() => parseReserveResult(raw), /reserve_password_help/);
  }
});

test("a missing or malformed request id throws", () => {
  for (const request_id of [undefined, null, "", "not-a-uuid", 12345, {}]) {
    assert.throws(
      () => parseReserveResult([{ decision: "reserved", request_id }]),
      /request id/,
    );
  }
});

test("the error message names the decision type, never a caller value", () => {
  try {
    parseReserveResult([{ decision: 42, request_id: ID }]);
    assert.fail("should have thrown");
  } catch (e) {
    assert.match(e.message, /unknown decision: number/);
    assert.ok(!e.message.includes(ID), "no id in the message");
  }
});

// ── Finalisation validation ──────────────────────────────────────────────────

test("a single row with the expected id and status is accepted", () => {
  for (const status of TERMINAL_STATUSES) {
    assert.doesNotThrow(() => assertFinalizedExactlyOne([{ id: ID, status }], ID, status));
  }
});

test("reserved -> notified and reserved -> mail_failed both validate", () => {
  assert.doesNotThrow(() => assertFinalizedExactlyOne([{ id: ID, status: "notified" }], ID, "notified"));
  assert.doesNotThrow(() => assertFinalizedExactlyOne([{ id: ID, status: "mail_failed" }], ID, "mail_failed"));
});

test("zero affected rows is a visible failure", () => {
  assert.throws(
    () => assertFinalizedExactlyOne([], ID, "notified"),
    /affected 0 rows/,
  );
});

test("zero rows names the transition but never the id", () => {
  try {
    assertFinalizedExactlyOne([], ID, "mail_failed");
    assert.fail("should have thrown");
  } catch (e) {
    assert.match(e.message, /mail_failed/);
    assert.ok(!e.message.includes(ID), "the request id must not be logged");
  }
});

test("a row that is no longer 'reserved' cannot be reported as finalised", () => {
  // The UPDATE is scoped to status = 'reserved', so a row that had already moved on simply does
  // not come back — and that is exactly the zero-row case.
  assert.throws(() => assertFinalizedExactlyOne([], ID, "notified"), /not in 'reserved' state/);

  // And if something did come back in the wrong state, that is caught too.
  assert.throws(
    () => assertFinalizedExactlyOne([{ id: ID, status: "reserved" }], ID, "notified"),
    /left the row in status reserved/,
  );
});

test("more than one affected row is a failure", () => {
  assert.throws(
    () => assertFinalizedExactlyOne([{ id: ID, status: "notified" }, { id: ID, status: "notified" }], ID, "notified"),
    /affected 2 rows/,
  );
});

test("a different row than the one reserved is a failure, and neither id is logged", () => {
  const other = "99999999-8888-4777-8666-555555555555";
  try {
    assertFinalizedExactlyOne([{ id: other, status: "notified" }], ID, "notified");
    assert.fail("should have thrown");
  } catch (e) {
    assert.match(e.message, /different row/);
    assert.ok(!e.message.includes(ID) && !e.message.includes(other), "no ids in the message");
  }
});

test("missing or malformed return data is a visible failure", () => {
  for (const raw of [null, undefined, {}, "ok", 1]) {
    assert.throws(() => assertFinalizedExactlyOne(raw, ID, "notified"), /no row set/);
  }
  assert.throws(() => assertFinalizedExactlyOne([null], ID, "notified"), /malformed row/);
});

// ── Rate-limit budget: the SQL and the TypeScript must agree ─────────────────
// This is a CONSISTENCY test between two artifacts, not a claim about runtime behaviour: the
// database is the enforcer and it is not executed here. What it catches is the drift that
// caused this fix — a terminal status existing in the code but missing from the SQL's counted
// set, which would let an ambiguous outcome silently free up a new reservation.

test("every status a reservation can hold consumes the budget", () => {
  assert.deepEqual(
    [...BUDGET_CONSUMING_STATUSES].sort(),
    ["mail_failed", "notified", "reserved", "technical_error"],
  );

  // Nothing a reservation can end in may fall out of the budget.
  for (const terminal of TERMINAL_STATUSES) {
    assert.ok(
      BUDGET_CONSUMING_STATUSES.includes(terminal),
      `${terminal} is a post-reservation outcome and must consume the budget`,
    );
  }
});

test("technical_error still blocks an immediate new reservation", () => {
  // The ambiguous case: sendMail threw, so the provider may or may not have accepted the
  // message. If this status ever leaves the counted set, the next request reserves again and a
  // teacher can receive two mails for one incident.
  assert.ok(BUDGET_CONSUMING_STATUSES.includes("technical_error"));

  const sql = readFileSync(RESERVE_SQL, "utf8");
  const counted = sql.match(/r\.status IN \(([^)]*)\)/);
  assert.ok(counted, "the counted-status list must be findable in the migration");

  const sqlStatuses = [...counted[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(
    sqlStatuses,
    [...BUDGET_CONSUMING_STATUSES].sort(),
    "the migration's counted statuses and BUDGET_CONSUMING_STATUSES must not drift apart",
  );
});

test("statuses written WITHOUT a reservation stay out of the budget", () => {
  // Suppressions and the no-teacher / no-email records are audit facts about requests that
  // never reached the provider. Counting them would let one unhelpable student exhaust their
  // own cap and lock out a later, valid request.
  for (const auditOnly of ["suppressed_cooldown", "suppressed_daily_cap", "no_teacher", "teacher_no_email"]) {
    assert.ok(
      !BUDGET_CONSUMING_STATUSES.includes(auditOnly),
      `${auditOnly} must not consume the budget`,
    );
  }
});

test("no network call was made by any test in this file", () => {
  assert.equal(fetchCalls, 0);
});
