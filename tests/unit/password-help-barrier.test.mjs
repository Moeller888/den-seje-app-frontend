// Section 173: isolated coverage for the completion barrier.
//
// The barrier decides when a backgrounded request is finished. Since the rate-limit RPC writes
// its row BEFORE the outcome is known, "the row exists" is no longer the same as "the work is
// done" — and getting that wrong lets cleanup delete a row while a write is still in flight.
//
// Fully faked clock, sleep and reader. No network, no database, no timers of consequence.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import {
  awaitSettled,
  isTerminal,
  summarise,
} from "../support/completion-barrier.ts";

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

// A reader that returns a scripted sequence of row-sets, one per poll. Time advances only when
// the barrier sleeps, so the test is deterministic and instant.
function makeDeps(sequence, { startAt = 0 } = {}) {
  let clock = startAt;
  let index = 0;
  const state = { reads: 0, sleeps: [] };

  return {
    state,
    deps: {
      async readRows() {
        state.reads++;
        const step = sequence[Math.min(index, sequence.length - 1)];
        index++;
        if (typeof step === "function") return step();
        return step;
      },
      async sleep(ms) {
        state.sleeps.push(ms);
        clock += ms;
      },
      now: () => clock,
    },
  };
}

const OPTS = {
  expectedCount: 2,
  allowedTerminal: ["suppressed_cooldown"],
  timeoutMs: 5000,
  pollMs: 500,
  label: "test barrier",
};

// ── 1. reserved alone does not complete ──────────────────────────────────────

test("a 'reserved' row does not satisfy the barrier", async () => {
  const rows = [{ status: "notified" }, { status: "reserved" }];
  const { deps, state } = makeDeps([rows]); // the same in-progress state forever

  await assert.rejects(() => awaitSettled(deps, OPTS), /timed out/);
  assert.ok(state.reads > 1, "it kept polling rather than releasing on the count alone");
});

// ── 2. reserved → terminal completes only after the transition ───────────────

test("the barrier releases only once 'reserved' becomes terminal", async () => {
  const inProgress = [{ status: "notified" }, { status: "reserved" }];
  const settled    = [{ status: "notified" }, { status: "suppressed_cooldown" }];

  const { deps, state } = makeDeps([inProgress, inProgress, settled]);

  const result = await awaitSettled(deps, {
    ...OPTS,
    allowedTerminal: ["notified", "suppressed_cooldown"],
  });

  assert.equal(result.length, 2);
  assert.equal(state.reads, 3, "it waited through both in-progress observations");
  assert.deepEqual(state.sleeps, [500, 500]);
});

// ── 3. a suppressed status completes immediately ────────────────────────────

test("an already-terminal row set completes on the first read", async () => {
  const { deps, state } = makeDeps([[{ status: "notified" }, { status: "suppressed_cooldown" }]]);

  const rows = await awaitSettled(deps, { ...OPTS, allowedTerminal: ["notified", "suppressed_cooldown"] });

  assert.equal(rows.length, 2);
  assert.equal(state.reads, 1);
  assert.deepEqual(state.sleeps, [], "no waiting was necessary");
});

// ── 4. a disallowed terminal status fails ────────────────────────────────────

test("a terminal status outside the allowed set is a failure, not a pass", async () => {
  // 'notified' here means a live test somehow reached the mail path — a safety defect.
  const { deps } = makeDeps([[{ status: "suppressed_cooldown" }, { status: "notified" }]]);

  await assert.rejects(
    () => awaitSettled(deps, { ...OPTS, allowedTerminal: ["suppressed_cooldown"] }),
    /unexpected terminal status/,
  );
});

test("a disallowed status is only judged AFTER it stops being in progress", async () => {
  const inProgress = [{ status: "suppressed_cooldown" }, { status: "reserved" }];
  const bad        = [{ status: "suppressed_cooldown" }, { status: "notified" }];
  const { deps, state } = makeDeps([inProgress, bad]);

  await assert.rejects(
    () => awaitSettled(deps, { ...OPTS, allowedTerminal: ["suppressed_cooldown"] }),
    /unexpected terminal status/,
  );
  // It did not begin judging — and therefore did not release the caller to clean up — while the
  // row could still be written to.
  assert.equal(state.reads, 2);
});

// ── 5. too many rows fails immediately ───────────────────────────────────────

test("an extra row fails at once rather than timing out", async () => {
  const { deps, state } = makeDeps([[{ status: "a" }, { status: "b" }, { status: "c" }]]);

  await assert.rejects(() => awaitSettled(deps, OPTS), /saw 3 rows, expected at most 2/);
  assert.equal(state.reads, 1, "no waiting: an overshoot can never resolve itself");
  assert.deepEqual(state.sleeps, []);
});

// ── 6. a read error fails immediately ────────────────────────────────────────

test("a database error during polling propagates at once", async () => {
  const { deps, state } = makeDeps([
    () => { throw new Error("PostgREST exploded"); },
  ]);

  await assert.rejects(() => awaitSettled(deps, OPTS), /PostgREST exploded/);
  assert.deepEqual(state.sleeps, [], "a failed read is never a reason to keep waiting");
});

// ── Helpers ──────────────────────────────────────────────────────────────────

test("isTerminal treats only 'reserved' as in progress", () => {
  assert.equal(isTerminal("reserved"), false);
  assert.equal(isTerminal("notified"), true);
  assert.equal(isTerminal("mail_failed"), true);
  assert.equal(isTerminal("suppressed_cooldown"), true);
  assert.equal(isTerminal("no_teacher"), true);
  assert.equal(isTerminal(undefined), false);
});

test("summarise never leaks anything but statuses", () => {
  const text = summarise([{ status: "notified" }, { status: "reserved" }, { status: "notified" }]);
  assert.equal(text, "notified=2, reserved=1");
});

test("no network call was made by any test in this file", () => {
  assert.equal(fetchCalls, 0);
});
