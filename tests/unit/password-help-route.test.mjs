// Section 173: isolated coverage for the password-help STAFF route.
//
// This is the replacement for the live integration test that used to exercise the staff branch
// by calling the deployed function with a real teacher's address — which sent a real Supabase
// recovery mail to a real inbox (CI run 31266753389). That test is gone and must not return.
//
// Everything here runs against fakes. There is no Supabase client, no mail provider and no
// network: global fetch is replaced with a throwing stub and asserted never to have been called,
// so a regression that reintroduces a real call fails loudly instead of sending something.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import {
  routeHelpRequest,
  isStaffRole,
  normaliseEmail,
} from "../../supabase/functions/request-password-help/route.ts";

// ── Network lockdown ─────────────────────────────────────────────────────────
let fetchCalls = 0;
let realFetch;

before(() => {
  realFetch = globalThis.fetch;
  globalThis.fetch = (...args) => {
    fetchCalls++;
    throw new Error(`network is disabled in this test — fetch() was called with: ${String(args[0])}`);
  };
});

after(() => {
  globalThis.fetch = realFetch;
});

// ── Fake factory ─────────────────────────────────────────────────────────────
function makeDeps(overrides = {}) {
  const calls = {
    findUserByEmail: [],
    loadProfile: [],
    sendStaffRecovery: [],
    handleStudent: [],
    auditInsert: [],       // proxy for the student audit write, only reachable via handleStudent
    captureMessage: [],
  };

  const deps = {
    async findUserByEmail(email) {
      calls.findUserByEmail.push(email);
      return { id: "user-1", email };
    },
    async loadProfile(userId) {
      calls.loadProfile.push(userId);
      return { role: "teacher", teacher_id: null, full_name: null };
    },
    async sendStaffRecovery(email) {
      calls.sendStaffRecovery.push(email);
      return { error: null };
    },
    async handleStudent(userId, profile) {
      calls.handleStudent.push({ userId, profile });
      calls.auditInsert.push({ userId }); // the student pipeline is the ONLY writer of audit rows
    },
    captureMessage(message, level, extra) {
      calls.captureMessage.push({ message, level, extra });
    },
    ...overrides,
  };

  return { deps, calls };
}

// ── Classification ───────────────────────────────────────────────────────────

test("teacher is classified as staff", async () => {
  const { deps, calls } = makeDeps();
  const outcome = await routeHelpRequest("Teacher@Example.Test", deps);

  assert.equal(outcome, "staff_recovery_sent");
  assert.equal(calls.handleStudent.length, 0, "staff must never reach the student pipeline");
  assert.equal(calls.auditInsert.length, 0, "staff must never write a student audit row");
});

test("super_admin is classified as staff", async () => {
  const { deps, calls } = makeDeps({
    async loadProfile() {
      return { role: "super_admin", teacher_id: null, full_name: null };
    },
  });
  const outcome = await routeHelpRequest("admin@example.test", deps);

  assert.equal(outcome, "staff_recovery_sent");
  assert.equal(calls.handleStudent.length, 0);
  assert.equal(calls.auditInsert.length, 0);
});

test("isStaffRole covers exactly teacher and super_admin", () => {
  assert.equal(isStaffRole("teacher"), true);
  assert.equal(isStaffRole("super_admin"), true);
  assert.equal(isStaffRole("student"), false);
  assert.equal(isStaffRole(null), false);
  assert.equal(isStaffRole("Teacher"), false, "role matching is exact, not case-insensitive");
});

// ── Recovery dispatch ────────────────────────────────────────────────────────

test("recovery is invoked exactly once with the normalised address", async () => {
  const { deps, calls } = makeDeps();
  await routeHelpRequest("   Teacher@Example.Test   ", deps);

  assert.equal(calls.sendStaffRecovery.length, 1, "exactly one recovery call");
  assert.equal(calls.sendStaffRecovery[0], "Teacher@Example.Test", "trimmed, not otherwise altered");
  assert.equal(calls.sendStaffRecovery[0], normaliseEmail("   Teacher@Example.Test   "));
  // The same address the lookup used — a differently-cased variant would be a different account.
  assert.equal(calls.findUserByEmail[0], calls.sendStaffRecovery[0]);
});

test("a recovery provider error does not throw, does not reach the student pipeline, and is logged", async () => {
  const { deps, calls } = makeDeps({
    async sendStaffRecovery() {
      return { error: { message: "provider says no" } };
    },
  });

  const outcome = await routeHelpRequest("teacher@example.test", deps);

  assert.equal(outcome, "staff_recovery_failed");
  assert.equal(calls.handleStudent.length, 0);
  assert.equal(calls.captureMessage.length, 1);
  assert.equal(calls.captureMessage[0].message, "staff recovery mail failed");
  // The provider message must not be forwarded — it can echo the address.
  assert.ok(
    !JSON.stringify(calls.captureMessage[0]).includes("provider says no"),
    "provider payload must not be logged",
  );
});

test("a recovery provider that throws is contained — no unhandled rejection", async () => {
  const { deps, calls } = makeDeps({
    async sendStaffRecovery() {
      throw new Error("socket exploded");
    },
  });

  let rejected = false;
  const outcome = await routeHelpRequest("teacher@example.test", deps).catch(() => {
    rejected = true;
    return null;
  });

  assert.equal(rejected, false, "routeHelpRequest must not reject");
  assert.equal(outcome, "staff_recovery_failed");
  assert.equal(calls.captureMessage[0].message, "staff recovery mail threw");
});

test("staff recovery without an anon key is recorded, not silently skipped", async () => {
  const { deps, calls } = makeDeps({ sendStaffRecovery: null });
  const outcome = await routeHelpRequest("teacher@example.test", deps);

  assert.equal(outcome, "staff_recovery_unavailable");
  assert.equal(calls.captureMessage[0].message, "staff recovery skipped: SUPABASE_ANON_KEY unset");
  assert.equal(calls.handleStudent.length, 0);
});

// ── Non-staff paths, for contrast ────────────────────────────────────────────

test("an unknown address does nothing at all", async () => {
  const { deps, calls } = makeDeps({
    async findUserByEmail() {
      return null;
    },
  });

  const outcome = await routeHelpRequest("nobody@example.invalid", deps);

  assert.equal(outcome, "unknown_address");
  assert.equal(calls.loadProfile.length, 0);
  assert.equal(calls.sendStaffRecovery.length, 0);
  assert.equal(calls.handleStudent.length, 0);
  assert.equal(calls.auditInsert.length, 0);
});

test("a student reaches the student pipeline and no recovery mail", async () => {
  const { deps, calls } = makeDeps({
    async loadProfile() {
      return { role: "student", teacher_id: "teacher-9", full_name: "Test Elev" };
    },
  });

  const outcome = await routeHelpRequest("student@example.test", deps);

  assert.equal(outcome, "student_handled");
  assert.equal(calls.sendStaffRecovery.length, 0, "students must never trigger staff recovery");
  assert.equal(calls.handleStudent.length, 1);
  assert.equal(calls.handleStudent[0].profile.teacher_id, "teacher-9");
});

test("a role that is neither staff nor student stops without writing anything", async () => {
  const { deps, calls } = makeDeps({
    async loadProfile() {
      return { role: "parent", teacher_id: null, full_name: null };
    },
  });

  const outcome = await routeHelpRequest("someone@example.test", deps);

  assert.equal(outcome, "not_a_student");
  assert.equal(calls.sendStaffRecovery.length, 0);
  assert.equal(calls.handleStudent.length, 0);
  assert.equal(calls.auditInsert.length, 0);
});

// The outward response contract used to be "documented" here by a regex over index.ts. That
// asserted nothing about what the handler returns, so it is gone. The contract is now tested
// functionally against the real handler factory in password-help-handler.test.mjs, which
// compares actual Response objects byte for byte.

// ── Network proof ────────────────────────────────────────────────────────────

test("no network call was made by any test in this file", () => {
  assert.equal(fetchCalls, 0, "fetch() must never be reached with fully faked dependencies");
});
