// Section 173 / E2E slots: the live password-help spec must never make the deployed function mail a
// teacher. tests/support/mail-guard.ts decides, immediately before every live call with the
// student's address, whether that call could reach the mail path; the spec throws instead of
// calling when it could.
//
// Pinned here:
//   1. the verdict, with fakes and a fixed clock;
//   2. its constants against the real sources (the function's cooldown, the statuses the RPC counts);
//   3. the spec: every live call with the student's address passes the guard first, and no other
//      real address is ever sent to the function.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

import {
  mailGuardVerdict,
  COOLDOWN_MINUTES,
  COOLDOWN_STATUSES,
  SAFETY_MARGIN_MINUTES,
} from "../support/mail-guard.ts";

const read = (p) => readFileSync(new URL("../../" + p, import.meta.url), "utf8").split("\r\n").join("\n");
const NOW = Date.parse("2026-10-22T12:00:00Z");
const ago = (minutes) => new Date(NOW - minutes * 60_000).toISOString();
const TEACHER = "00000000-0000-0000-0000-00000000000t";

// ── 1. The verdict ────────────────────────────────────────────────────────────────────────────
test("no teacher: safe whatever the rows say (the function records no_teacher and mails nobody)", () => {
  assert.equal(mailGuardVerdict({ teacherId: null, rows: [], nowMs: NOW }).safe, true);
  assert.equal(mailGuardVerdict({ teacherId: null, rows: [{ status: "suppressed_cooldown", created_at: ago(60) }], nowMs: NOW }).safe, true);
});

test("a teacher and no rows: UNSAFE — this is the call that would send a real mail", () => {
  const v = mailGuardVerdict({ teacherId: TEACHER, rows: [], nowMs: NOW });
  assert.equal(v.safe, false);
  assert.match(v.reason, /mail that teacher/);
});

test("a fresh counted row holds the cooldown: safe, for every status the RPC counts", () => {
  for (const status of COOLDOWN_STATUSES) {
    assert.equal(mailGuardVerdict({ teacherId: TEACHER, rows: [{ status, created_at: ago(0) }], nowMs: NOW }).safe, true, status);
    assert.equal(mailGuardVerdict({ teacherId: TEACHER, rows: [{ status, created_at: ago(9.9) }], nowMs: NOW }).safe, true, status);
  }
});

test("the safety margin: a counted row older than cooldown minus margin is NOT enough", () => {
  const edge = COOLDOWN_MINUTES - SAFETY_MARGIN_MINUTES;
  assert.equal(edge, 10);
  for (const minutes of [edge, edge + 0.1, 14.9, 15, 16, 60 * 24]) {
    assert.equal(mailGuardVerdict({ teacherId: TEACHER, rows: [{ status: "notified", created_at: ago(minutes) }], nowMs: NOW }).safe, false, String(minutes));
  }
  // A row stamped slightly in the future (database clock ahead of the runner) still holds the
  // cooldown in the database, so it counts.
  assert.equal(mailGuardVerdict({ teacherId: TEACHER, rows: [{ status: "notified", created_at: ago(-2) }], nowMs: NOW }).safe, true);
});

test("rows that do not count towards the cooldown never make a call safe", () => {
  for (const status of ["suppressed_cooldown", "suppressed_daily_cap", "no_teacher", "teacher_no_email", "", "NOTIFIED", null, 1]) {
    assert.equal(mailGuardVerdict({ teacherId: TEACHER, rows: [{ status, created_at: ago(0) }], nowMs: NOW }).safe, false, String(status));
  }
});

test("malformed input fails closed", () => {
  for (const created_at of [undefined, null, "", "not a date", 12345, {}]) {
    assert.equal(mailGuardVerdict({ teacherId: TEACHER, rows: [{ status: "notified", created_at }], nowMs: NOW }).safe, false, String(created_at));
  }
  for (const rows of [undefined, null, "rows", {}, [null], [undefined], [1]]) {
    assert.equal(mailGuardVerdict({ teacherId: TEACHER, rows, nowMs: NOW }).safe, false, JSON.stringify(rows));
  }
  for (const nowMs of [NaN, Infinity, undefined]) {
    assert.equal(mailGuardVerdict({ teacherId: TEACHER, rows: [{ status: "notified", created_at: ago(0) }], nowMs }).safe, false);
  }
  // Any teacher id that is not exactly null is treated as "has a teacher".
  for (const teacherId of [undefined, "", "x"]) {
    assert.equal(mailGuardVerdict({ teacherId, rows: [], nowMs: NOW }).safe, false, JSON.stringify(teacherId));
  }
});

test("a safe row anywhere in the list is found; reasons carry no address", () => {
  const rows = [
    { status: "suppressed_cooldown", created_at: ago(0) },
    { status: "notified", created_at: ago(30) },
    { status: "reserved", created_at: ago(1) },
  ];
  const v = mailGuardVerdict({ teacherId: TEACHER, rows, nowMs: NOW });
  assert.equal(v.safe, true);
  for (const r of [v, mailGuardVerdict({ teacherId: TEACHER, rows: [], nowMs: NOW }), mailGuardVerdict({ teacherId: null, rows: [], nowMs: NOW })]) {
    assert.equal(r.reason.includes("@"), false);
  }
});

// ── 2. Constants against the real sources ─────────────────────────────────────────────────────
test("COOLDOWN_MINUTES matches the deployed function's source", () => {
  const fn = read("supabase/functions/request-password-help/index.ts");
  assert.ok(fn.includes(`const COOLDOWN_MINUTES = ${COOLDOWN_MINUTES};`));
});

test("COOLDOWN_STATUSES match the statuses reserve_password_help counts (latest definition)", () => {
  const dir = new URL("../../supabase/migrations/", import.meta.url);
  const defining = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) => readFileSync(new URL(f, dir), "utf8").includes("FUNCTION public.reserve_password_help("));
  assert.ok(defining.length > 0, "a migration defines reserve_password_help");
  const sql = readFileSync(new URL(defining[defining.length - 1], dir), "utf8");
  const expected = "r.status IN (" + COOLDOWN_STATUSES.map((s) => `'${s}'`).join(", ") + ")";
  assert.ok(sql.includes(expected), `${defining[defining.length - 1]} must count exactly ${expected}`);
});

// ── 3. The spec ───────────────────────────────────────────────────────────────────────────────
const SPEC = read("tests/password-help.spec.ts");

test("spec: the guard is imported and throws when the verdict is unsafe", () => {
  assert.ok(SPEC.includes("import { mailGuardVerdict } from './support/mail-guard.ts';"));
  const start = SPEC.indexOf("async function assertMailImpossible(");
  assert.ok(start > 0);
  const body = SPEC.slice(start, SPEC.indexOf("\n}\n", start));
  assert.ok(body.includes("const currentTeacherId = await restoreDeps.readTeacherId(studentId);"));
  assert.ok(body.includes("const rows = await rowsForStudent(studentId);"));
  assert.ok(body.includes("mailGuardVerdict({ teacherId: currentTeacherId, rows, nowMs: Date.now() })"));
  assert.ok(body.includes("if (!verdict.safe) {\n    throw new Error("));
});

test("spec: every live call with the student's address passes the guard first", () => {
  const calls = [];
  for (let i = SPEC.indexOf("callHelp(STUDENT_EMAIL)"); i !== -1; i = SPEC.indexOf("callHelp(STUDENT_EMAIL)", i + 1)) calls.push(i);
  assert.equal(calls.length, 2, "callHelpForStudentAndSettle and the anti-enumeration loop");
  for (const at of calls) {
    // The enclosing function or test: from the nearest preceding `async function ` / `test(`.
    const fnStart = Math.max(SPEC.lastIndexOf("\nasync function ", at), SPEC.lastIndexOf("\ntest(", at));
    const before = SPEC.slice(fnStart, at);
    assert.ok(before.includes("await assertMailImpossible("), "unguarded live call at offset " + at);
  }
});

test("spec: the function is only ever called with the student's address or an .invalid one", () => {
  let n = 0;
  for (let i = SPEC.indexOf("callHelp("); i !== -1; i = SPEC.indexOf("callHelp(", i + 1)) {
    if (SPEC.slice(i - 15, i) === "async function ") continue;      // the definition
    const arg = SPEC.slice(i + "callHelp(".length, i + "callHelp(".length + 40);
    assert.ok(arg.startsWith("STUDENT_EMAIL)") || arg.startsWith("unknownAddress("), "unexpected argument: " + arg);
    n++;
  }
  assert.ok(n >= 4, "the reader saw the calls it guards");
  assert.ok(SPEC.includes("return `no-such-user-${Date.now()}-${tag}@example.invalid`;"));
});
