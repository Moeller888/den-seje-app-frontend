// Section 173: isolated coverage for the completion barrier.
//
// The barrier decides when a backgrounded request is finished. Since the rate-limit RPC writes
// its row BEFORE the outcome is known, "the row exists" is no longer the same as "the work is
// done" — and getting that wrong lets cleanup delete a row while a write is still in flight.
//
// It also decides WHICH rows are the call's own work. The audit table is shared by a serial chain
// of tests, and some of them deliberately leave a 'notified' row behind to hold the student inside
// the cooldown. Those rows are handed over as a BASELINE, identified by primary key, and are never
// judged as outcomes of the call under test.
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

// Row shorthand. Ids are explicit everywhere: identity is what the barrier reasons about, so a
// test that let them be implicit would not be testing the real thing.
const row = (id, status) => ({ id, status });

// The row a previous test seeded to hold the cooldown open. Baseline in almost every case below.
const SEEDED = row("seed-1", "notified");

const OPTS = {
  baselineIds: [],
  expectedNew: 1,
  allowedTerminal: ["suppressed_cooldown"],
  timeoutMs: 5000,
  pollMs: 500,
  label: "test barrier",
};

// ── 1. the baseline is excluded from the judgement ───────────────────────────

test("a seeded 'notified' row does not fail the call that ran after it", async () => {
  // Exactly the production failure this baseline exists to prevent: on 1bcc70f9 and a249de1 the
  // seeded row was judged as the call's outcome and the test failed for a row it never wrote.
  const { deps, state } = makeDeps([[SEEDED, row("new-1", "suppressed_cooldown")]]);

  const rows = await awaitSettled(deps, { ...OPTS, baselineIds: ["seed-1"] });

  assert.equal(rows.length, 2, "the FULL set is returned, so the caller's assertions still hold");
  assert.equal(state.reads, 1);
  assert.deepEqual(state.sleeps, []);
});

test("an existing row with any status at all is irrelevant to the current call", async () => {
  for (const old of ["notified", "mail_failed", "reserved", "no_teacher", "something_unknown"]) {
    const { deps } = makeDeps([[row("old-1", old), row("new-1", "suppressed_cooldown")]]);

    const rows = await awaitSettled(deps, { ...OPTS, baselineIds: ["old-1"] });
    assert.equal(rows.length, 2, `an existing '${old}' row must not be judged`);
  }
});

test("an old 'reserved' row does not hold the barrier open either", async () => {
  // It is someone else's unfinished business: this call's own row is terminal, so it may release.
  const { deps, state } = makeDeps([[row("old-1", "reserved"), row("new-1", "suppressed_cooldown")]]);

  await awaitSettled(deps, { ...OPTS, baselineIds: ["old-1"] });
  assert.equal(state.reads, 1, "it did not wait for a row that is not its own");
});

test("the position of old and new rows makes no difference", async () => {
  const newest = [row("new-1", "suppressed_cooldown"), SEEDED];   // newest-first, as PostgREST returns
  const oldest = [SEEDED, row("new-1", "suppressed_cooldown")];   // the opposite order

  for (const ordering of [newest, oldest]) {
    const { deps } = makeDeps([ordering]);
    const rows = await awaitSettled(deps, { ...OPTS, baselineIds: ["seed-1"] });
    assert.equal(rows.length, 2);
  }
});

// ── 2. new rows ARE judged ───────────────────────────────────────────────────

test("a NEW 'notified' row fails: this call reached the mail path", async () => {
  const { deps } = makeDeps([[SEEDED, row("new-1", "notified")]]);

  await assert.rejects(
    () => awaitSettled(deps, { ...OPTS, baselineIds: ["seed-1"] }),
    /unexpected terminal status \(notified=1\)/,
  );
});

test("every new row is judged, not just the first", async () => {
  const rows = [
    SEEDED,
    row("new-1", "suppressed_cooldown"),
    row("new-2", "suppressed_cooldown"),
    row("new-3", "notified"),
  ];
  const { deps } = makeDeps([rows]);

  await assert.rejects(
    () => awaitSettled(deps, { ...OPTS, baselineIds: ["seed-1"], expectedNew: 3 }),
    /unexpected terminal status \(notified=1, suppressed_cooldown=2\)/,
  );
});

test("several new rows all pass when every one of them is allowed", async () => {
  const rows = [SEEDED, row("new-1", "suppressed_cooldown"), row("new-2", "suppressed_cooldown")];
  const { deps } = makeDeps([rows]);

  const settled = await awaitSettled(deps, { ...OPTS, baselineIds: ["seed-1"], expectedNew: 2 });
  assert.equal(settled.length, 3);
});

// ── 3. 'reserved' on a NEW row still blocks ──────────────────────────────────

test("a new 'reserved' row does not satisfy the barrier", async () => {
  const rows = [SEEDED, row("new-1", "reserved")];
  const { deps, state } = makeDeps([rows]); // never finishes

  await assert.rejects(
    () => awaitSettled(deps, { ...OPTS, baselineIds: ["seed-1"] }),
    /timed out/,
  );
  assert.ok(state.reads > 1, "it kept polling rather than releasing on the count alone");
});

test("the barrier releases only once the NEW row becomes terminal", async () => {
  const inProgress = [SEEDED, row("new-1", "reserved")];
  const settled    = [SEEDED, row("new-1", "suppressed_cooldown")];

  const { deps, state } = makeDeps([inProgress, inProgress, settled]);

  const result = await awaitSettled(deps, { ...OPTS, baselineIds: ["seed-1"] });

  assert.equal(result.length, 2);
  assert.equal(state.reads, 3, "it waited through both in-progress observations");
  assert.deepEqual(state.sleeps, [500, 500]);
});

test("a disallowed status is only judged AFTER it stops being in progress", async () => {
  const inProgress = [SEEDED, row("new-1", "reserved")];
  const bad        = [SEEDED, row("new-1", "notified")];
  const { deps, state } = makeDeps([inProgress, bad]);

  await assert.rejects(
    () => awaitSettled(deps, { ...OPTS, baselineIds: ["seed-1"] }),
    /unexpected terminal status/,
  );
  // It did not begin judging — and therefore did not release the caller to clean up — while the
  // row could still be written to.
  assert.equal(state.reads, 2);
});

// ── 4. identity must be trustworthy, or the barrier refuses ──────────────────

test("a row without an id fails loudly instead of being guessed at", async () => {
  for (const broken of [{ status: "suppressed_cooldown" }, { id: "", status: "x" }, { id: 7, status: "x" }]) {
    const { deps } = makeDeps([[SEEDED, broken]]);
    await assert.rejects(
      () => awaitSettled(deps, { ...OPTS, baselineIds: ["seed-1"] }),
      /audit row without a usable id/,
    );
  }
});

test("the same id twice in one read is a failure, not a coincidence", async () => {
  const { deps, state } = makeDeps([[row("dup", "suppressed_cooldown"), row("dup", "suppressed_cooldown")]]);

  await assert.rejects(
    () => awaitSettled(deps, OPTS),
    /the same row id appeared twice/,
  );
  assert.deepEqual(state.sleeps, [], "an unreadable table is never a reason to keep waiting");
});

test("a baseline with a duplicate or missing id is rejected before any read", async () => {
  const { deps, state } = makeDeps([[SEEDED]]);
  await assert.rejects(
    () => awaitSettled(deps, { ...OPTS, baselineIds: ["a", "a"] }),
    /the baseline lists the same row id twice/,
  );
  assert.equal(state.reads, 0, "a broken baseline is caught before the table is touched");

  const second = makeDeps([[SEEDED]]);
  await assert.rejects(
    () => awaitSettled(second.deps, { ...OPTS, baselineIds: ["a", ""] }),
    /baseline entry without a usable id/,
  );
  assert.equal(second.state.reads, 0);
});

// ── 5. overshoot and read errors ─────────────────────────────────────────────

test("an extra NEW row fails at once rather than timing out", async () => {
  const rows = [SEEDED, row("new-1", "a"), row("new-2", "b"), row("new-3", "c")];
  const { deps, state } = makeDeps([rows]);

  await assert.rejects(
    () => awaitSettled(deps, { ...OPTS, baselineIds: ["seed-1"], expectedNew: 2 }),
    /saw 3 new rows, expected at most 2/,
  );
  assert.equal(state.reads, 1, "no waiting: an overshoot can never resolve itself");
  assert.deepEqual(state.sleeps, []);
});

test("a database error during polling propagates at once", async () => {
  const { deps, state } = makeDeps([
    () => { throw new Error("PostgREST exploded"); },
  ]);

  await assert.rejects(() => awaitSettled(deps, OPTS), /PostgREST exploded/);
  assert.deepEqual(state.sleeps, [], "a failed read is never a reason to keep waiting");
});

test("the timeout message names the new rows and the whole table", async () => {
  const { deps } = makeDeps([[SEEDED, row("new-1", "reserved")]]);

  await assert.rejects(
    () => awaitSettled(deps, { ...OPTS, baselineIds: ["seed-1"] }),
    /timed out after 5000ms with 1\/1 new rows \(new: reserved=1; all: notified=1, reserved=1\)/,
  );
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
  const text = summarise([row("a", "notified"), row("b", "reserved"), row("c", "notified")]);
  assert.equal(text, "notified=2, reserved=1");
});

test("no error message ever carries a row id", async () => {
  // Ids identify a real student's audit trail. Every failure path must stay status-only.
  const cases = [
    [{ ...OPTS, baselineIds: ["seed-1"] }, [[SEEDED, row("secret-id-1", "notified")]]],
    [{ ...OPTS, baselineIds: ["seed-1"] }, [[SEEDED, row("secret-id-1", "reserved")]]],
    [{ ...OPTS, baselineIds: ["seed-1"], expectedNew: 0 }, [[SEEDED, row("secret-id-1", "notified")]]],
  ];

  for (const [options, sequence] of cases) {
    const { deps } = makeDeps(sequence);
    await assert.rejects(
      () => awaitSettled(deps, options),
      (e) => {
        assert.ok(!e.message.includes("secret-id-1"), `id leaked: ${e.message}`);
        assert.ok(!e.message.includes("seed-1"), `baseline id leaked: ${e.message}`);
        return true;
      },
    );
  }
});

test("no network call was made by any test in this file", () => {
  assert.equal(fetchCalls, 0);
});
