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

import {
  parseReserveResult,
  assertFinalizedExactlyOne,
  ALLOWED_DECISIONS,
  TERMINAL_STATUSES,
} from "../../supabase/functions/request-password-help/adapters.ts";

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

test("no network call was made by any test in this file", () => {
  assert.equal(fetchCalls, 0);
});
