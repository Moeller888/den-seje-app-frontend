// Section 173: isolated coverage for the STUDENT branch of password help.
//
// Every collaborator is a fake and global fetch is replaced by a throwing counter, so a
// regression that reintroduces a real database, mail provider or DNS call fails loudly instead
// of doing it. Nothing here touches production.
//
// The two properties under test are the ones that made the earlier design unsafe:
//   1. a technical fault (database / auth) never becomes a business outcome;
//   2. no mail is ever sent without an atomic reservation, and one reservation buys one mail.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import {
  runStudentPipeline,
  displayName,
} from "../../supabase/functions/request-password-help/student-pipeline.ts";

// ── Network lockdown ─────────────────────────────────────────────────────────
let fetchCalls = 0;
let realFetch;

before(() => {
  realFetch = globalThis.fetch;
  globalThis.fetch = (...args) => {
    fetchCalls++;
    throw new Error(`network is disabled in this test — fetch() called with ${String(args[0])}`);
  };
});

after(() => {
  globalThis.fetch = realFetch;
});

// ── Fake factory ─────────────────────────────────────────────────────────────
function makeDeps(overrides = {}) {
  const calls = {
    auditNoTeacher: [],
    getTeacherEmail: [],
    auditTeacherNoEmail: [],
    reserve: [],
    sendMail: [],
    finalize: [],
    captureMessage: [],
    captureException: [],
  };

  const deps = {
    async auditNoTeacher(studentId) {
      calls.auditNoTeacher.push(studentId);
    },
    async getTeacherEmail(teacherId) {
      calls.getTeacherEmail.push(teacherId);
      return "teacher@example.test";
    },
    async auditTeacherNoEmail(studentId, teacherId) {
      calls.auditTeacherNoEmail.push({ studentId, teacherId });
    },
    async reserve(studentId, teacherId) {
      calls.reserve.push({ studentId, teacherId });
      return { decision: "reserved", requestId: "req-1" };
    },
    async sendMail(email, name, studentId) {
      calls.sendMail.push({ email, name, studentId });
      return { sent: true, reason: null };
    },
    async finalize(requestId, status, reason) {
      calls.finalize.push({ requestId, status, reason });
    },
    captureMessage(message, level, extra) {
      calls.captureMessage.push({ message, level, extra });
    },
    captureException(error, extra) {
      calls.captureException.push({ message: error?.message ?? String(error), extra });
    },
    ...overrides,
  };

  return { deps, calls };
}

const PROFILE = { teacher_id: "teacher-1", full_name: "Test Elev" };

// ── No teacher ───────────────────────────────────────────────────────────────

test("a student without a teacher is audited and never reaches mail", async () => {
  const { deps, calls } = makeDeps();
  const outcome = await runStudentPipeline("s1", { teacher_id: null, full_name: null }, deps);

  assert.equal(outcome, "no_teacher");
  assert.deepEqual(calls.auditNoTeacher, ["s1"]);
  assert.equal(calls.reserve.length, 0, "no reservation for a student who cannot be helped");
  assert.equal(calls.sendMail.length, 0);
});

test("a failing no_teacher audit is visible, not swallowed", async () => {
  const { deps, calls } = makeDeps({
    async auditNoTeacher() {
      throw new Error("insert exploded");
    },
  });

  await assert.rejects(
    () => runStudentPipeline("s1", { teacher_id: null, full_name: null }, deps),
    /insert exploded/,
  );
  assert.equal(calls.sendMail.length, 0);
});

// ── Teacher lookup ───────────────────────────────────────────────────────────

test("an auth lookup failure sends no mail and is NOT recorded as teacher_no_email", async () => {
  const { deps, calls } = makeDeps({
    async getTeacherEmail() {
      throw new Error("auth transport failure");
    },
  });

  await assert.rejects(() => runStudentPipeline("s1", PROFILE, deps), /auth transport failure/);

  assert.equal(calls.auditTeacherNoEmail.length, 0, "a technical fault must not become a business outcome");
  assert.equal(calls.reserve.length, 0);
  assert.equal(calls.sendMail.length, 0);
});

test("teacher_no_email is recorded only after a SUCCESSFUL lookup that returns no address", async () => {
  const seenLookups = [];
  const { deps, calls } = makeDeps({
    async getTeacherEmail(teacherId) {
      seenLookups.push(teacherId);
      return "";
    },
  });
  calls.getTeacherEmail = seenLookups;

  const outcome = await runStudentPipeline("s1", PROFILE, deps);

  assert.equal(outcome, "teacher_no_email");
  assert.equal(calls.getTeacherEmail.length, 1);
  assert.deepEqual(calls.auditTeacherNoEmail, [{ studentId: "s1", teacherId: "teacher-1" }]);
  assert.equal(calls.reserve.length, 0, "an unhelpable student must not burn a rate-limit slot");
  assert.equal(calls.sendMail.length, 0);
});

// ── Reservation ──────────────────────────────────────────────────────────────

test("a failing reservation fails closed — no mail", async () => {
  const { deps, calls } = makeDeps({
    async reserve() {
      throw new Error("rpc unavailable");
    },
  });

  await assert.rejects(() => runStudentPipeline("s1", PROFILE, deps), /rpc unavailable/);
  assert.equal(calls.sendMail.length, 0);
  assert.equal(calls.finalize.length, 0);
});

test("suppressed_cooldown sends no mail", async () => {
  const { deps, calls } = makeDeps({
    async reserve() {
      return { decision: "suppressed_cooldown", requestId: "req-c" };
    },
  });

  const outcome = await runStudentPipeline("s1", PROFILE, deps);

  assert.equal(outcome, "suppressed_cooldown");
  assert.equal(calls.sendMail.length, 0);
  assert.equal(calls.finalize.length, 0, "the suppression row is already final");
});

test("suppressed_daily_cap sends no mail", async () => {
  const { deps, calls } = makeDeps({
    async reserve() {
      return { decision: "suppressed_daily_cap", requestId: "req-d" };
    },
  });

  const outcome = await runStudentPipeline("s1", PROFILE, deps);

  assert.equal(outcome, "suppressed_daily_cap");
  assert.equal(calls.sendMail.length, 0);
});

// ── Mail and finalisation ────────────────────────────────────────────────────

test("an allowed reservation sends at most one mail and finalises to notified", async () => {
  const { deps, calls } = makeDeps();
  const outcome = await runStudentPipeline("s1", PROFILE, deps);

  assert.equal(outcome, "notified");
  assert.equal(calls.sendMail.length, 1, "exactly one mail per reservation");
  assert.equal(calls.sendMail[0].name, "Test Elev");
  assert.deepEqual(calls.finalize, [{ requestId: "req-1", status: "notified", reason: null }]);
});

test("a provider failure finalises the reserved row to mail_failed", async () => {
  const { deps, calls } = makeDeps({
    async sendMail() {
      return { sent: false, reason: "resend_http_500" };
    },
  });

  const outcome = await runStudentPipeline("s1", PROFILE, deps);

  assert.equal(outcome, "mail_failed");
  assert.deepEqual(calls.finalize, [{ requestId: "req-1", status: "mail_failed", reason: "resend_http_500" }]);
  assert.equal(calls.captureMessage[0].message, "teacher notification not sent");
});

test("a provider that throws is contained and the row is finalised truthfully", async () => {
  const { deps, calls } = makeDeps({
    async sendMail() {
      throw new Error("socket exploded");
    },
  });

  const outcome = await runStudentPipeline("s1", PROFILE, deps);

  assert.equal(outcome, "technical_error");
  assert.equal(calls.finalize[0].status, "technical_error");
  assert.equal(calls.captureException[0].extra.stage, "send_mail");
});

test("a failed finalisation after a SENT mail stays visible", async () => {
  const { deps, calls } = makeDeps({
    async finalize() {
      throw new Error("update rejected");
    },
  });

  await assert.rejects(() => runStudentPipeline("s1", PROFILE, deps), /update rejected/);

  assert.equal(calls.sendMail.length, 1);
  assert.equal(calls.captureException[0].extra.stage, "finalize");
  // The row stays 'reserved', which still counts against cooldown and cap — the rate-limit
  // effect survives an imprecise audit trail.
});

test("a provider failure AND an audit failure are both reported", async () => {
  const { deps, calls } = makeDeps({
    async sendMail() {
      return { sent: false, reason: "resend_http_500" };
    },
    async finalize() {
      throw new Error("update rejected");
    },
  });

  await assert.rejects(() => runStudentPipeline("s1", PROFILE, deps), /update rejected/);

  assert.equal(calls.captureException.length, 1, "the audit failure is captured");
  assert.equal(calls.captureException[0].extra.stage, "finalize");
  assert.equal(calls.captureMessage.length, 1, "the provider failure is captured too");
  assert.equal(calls.captureMessage[0].message, "teacher notification not sent");
  assert.equal(calls.captureMessage[0].extra.reason, "resend_http_500");
});

// ── Display name ─────────────────────────────────────────────────────────────

test("a missing full_name falls back without leaking anything", () => {
  assert.equal(displayName({ teacher_id: "t", full_name: null }), "En elev");
  assert.equal(displayName({ teacher_id: "t", full_name: "   " }), "En elev");
  assert.equal(displayName({ teacher_id: "t", full_name: "  Ada  " }), "Ada");
});

// ── Application-level concurrency contract ───────────────────────────────────
// This supplements — it does not replace — the database guarantee in
// 20260808010000_password_help_reserve_rpc.sql, where pg_advisory_xact_lock serialises the
// decision. Here the fake plays the part of that lock: it hands out exactly one reservation.

test("two concurrent requests: only the reserved one may mail, and mail is called exactly once", async () => {
  let granted = 0;
  const mailed = [];

  const shared = {
    async reserve() {
      // Exactly what the RPC guarantees under the advisory lock: one winner, the rest suppressed.
      granted++;
      return granted === 1
        ? { decision: "reserved", requestId: "req-1" }
        : { decision: "suppressed_cooldown", requestId: `req-sup-${granted}` };
    },
    async sendMail(email, name, studentId) {
      mailed.push(studentId);
      return { sent: true, reason: null };
    },
  };

  const a = makeDeps(shared);
  const b = makeDeps(shared);

  const [outA, outB] = await Promise.all([
    runStudentPipeline("s1", PROFILE, a.deps),
    runStudentPipeline("s1", PROFILE, b.deps),
  ]);

  const outcomes = [outA, outB].sort();
  assert.deepEqual(outcomes, ["notified", "suppressed_cooldown"]);
  assert.equal(mailed.length, 1, "the mail dependency must be reached exactly once in total");
});

// ── Network proof ────────────────────────────────────────────────────────────

test("no network call was made by any test in this file", () => {
  assert.equal(fetchCalls, 0, "fetch() must never be reached with fully faked dependencies");
});
