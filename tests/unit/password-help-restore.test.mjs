// Section 173: isolated coverage for capture/restore of the test student's teacher_id.
//
// These are the paths that decide whether a failing test run leaves a real student's
// teacher_id set to null. They run entirely against fakes — no Supabase, no network.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import {
  createRestoreState,
  captureOriginal,
  markMutationAttempted,
  markMutationConfirmed,
  restoreOriginal,
} from "../support/teacher-id-restore.ts";

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

// A fake row store: reads and writes are recorded so a test can prove a write did NOT happen.
function makeDeps({ initial = "teacher-1", readThrows = null, writeThrows = null, drift = false } = {}) {
  const calls = { reads: 0, writes: [] };
  let current = initial;

  const deps = {
    async readTeacherId() {
      calls.reads++;
      if (readThrows) throw new Error(readThrows);
      return current;
    },
    async writeTeacherId(_studentId, value) {
      calls.writes.push(value);
      if (writeThrows) throw new Error(writeThrows);
      current = drift ? "someone-else" : value;
    },
  };

  return { deps, calls, peek: () => current };
}

// ── 1. student id found, but the original lookup fails ───────────────────────

test("lookup failure leaves the state uncaptured and restore refuses to write", async () => {
  const state = createRestoreState();
  const { deps, calls } = makeDeps({ readThrows: "read exploded" });

  await assert.rejects(() => captureOriginal("s1", deps, state), /read exploded/);
  assert.equal(state.captured, false, "capture must not be claimed after a failed read");

  // The scenario that used to corrupt data: a mutation was attempted, the original is unknown.
  markMutationAttempted(state);
  const problem = await restoreOriginal("s1", deps, state);

  assert.match(problem, /never captured/);
  assert.match(problem, /refusing to write/);
  assert.equal(calls.writes.length, 0, "NO update may be issued when the original is unknown");
});

test("uncaptured state with no mutation attempted is a no-op, not a false alarm", async () => {
  const state = createRestoreState();
  const { deps, calls } = makeDeps();

  const problem = await restoreOriginal("s1", deps, state);

  assert.equal(problem, null, "nothing was changed, so there is nothing to report");
  assert.equal(calls.writes.length, 0);
});

// ── 2. a legitimate original null ────────────────────────────────────────────

test("a legitimately null original is captured and restored as null", async () => {
  const state = createRestoreState();
  const { deps, calls, peek } = makeDeps({ initial: null });

  const captured = await captureOriginal("s1", deps, state);
  assert.equal(captured, null);
  assert.equal(state.captured, true, "null is a value, not an absence");

  markMutationAttempted(state);
  const problem = await restoreOriginal("s1", deps, state);

  assert.equal(problem, null);
  assert.deepEqual(calls.writes, [null], "the original null is written back deliberately");
  assert.equal(peek(), null);
});

// ── 3. mutation succeeds, the test then fails ────────────────────────────────

test("a mutated value is restored even when the test itself failed", async () => {
  const state = createRestoreState();
  const { deps, calls, peek } = makeDeps({ initial: "teacher-1" });

  await captureOriginal("s1", deps, state);
  markMutationAttempted(state);
  await deps.writeTeacherId("s1", null); // the test's own mutation
  markMutationConfirmed(state);
  assert.equal(peek(), null);

  const problem = await restoreOriginal("s1", deps, state);

  assert.equal(problem, null);
  assert.equal(peek(), "teacher-1");
  assert.deepEqual(calls.writes, [null, "teacher-1"]);
  assert.equal(state.mutationConfirmed, true, "the mutation is tracked separately from the restore");
});

// ── 4. restore fails ─────────────────────────────────────────────────────────

test("a failing restore reports a message instead of throwing", async () => {
  const state = createRestoreState();
  const { deps } = makeDeps({ initial: "teacher-1", writeThrows: "update rejected" });

  await captureOriginal("s1", deps, state);
  markMutationAttempted(state);

  const problem = await restoreOriginal("s1", deps, state);

  assert.match(problem, /restore update failed: update rejected/);
});

// ── 5. restore verification fails ────────────────────────────────────────────

test("a restore that does not land is caught by the re-read", async () => {
  const state = createRestoreState();
  const { deps } = makeDeps({ initial: "teacher-1", drift: true });

  await captureOriginal("s1", deps, state);
  markMutationAttempted(state);

  const problem = await restoreOriginal("s1", deps, state);

  assert.match(problem, /verification failed/);
});

test("a failing verification READ is reported distinctly from a mismatch", async () => {
  const state = createRestoreState();
  let reads = 0;
  const deps = {
    async readTeacherId() {
      reads++;
      if (reads === 1) return "teacher-1";
      throw new Error("read exploded");
    },
    async writeTeacherId() {},
  };

  await captureOriginal("s1", deps, state);
  markMutationAttempted(state);

  const problem = await restoreOriginal("s1", deps, state);
  assert.match(problem, /verification read failed: read exploded/);
});

test("no network call was made by any test in this file", () => {
  assert.equal(fetchCalls, 0);
});
