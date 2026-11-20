// LP-13 / K9 prototype in get-next-question: LAERLIGVERSE_INTRODUCTION serves an objective's introduction (a separate
// server round without an answer key) before the first sequence step. REAL index.ts, recording stand-in
// (tests/unit/helpers/gnq-parity-harness.mjs).
//
// Proves: OFF PARITY (unset or anything but exactly "on": identical status, body, calls and logs; an untargeted
// request with the flag on is identical too); ON: one backend call serve_introduction with the VERIFIED pupil and the
// objective — never a body field — and an introduction reply with ONLY the cards; a refresh (resumed) returns the same
// round; once completed (or none exists) the sequence runs exactly as with the flag off plus that one call; a broken
// reply is a 500 that never falls through to a question.
//
// F12-B (the introduction capability, ../../supabase/functions/_shared/introduction.ts): the cases above send
// `introduction_capability: 1`, as a host that shows introductions does. Without it a REQUIRED introduction is answered
// with step "introduction_required" after two READS — no serve_introduction (which would create a round), no task, no
// write; not required (completed, or none active) → the sequence exactly as before. Any other value is a 400 before
// any read. An OPEN task round of the objective is resumed before any introduction, with or without the capability.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadHandler, runCase } from "./helpers/gnq-parity-harness.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const { handler } = await loadHandler(join(ROOT, "supabase", "functions", "get-next-question", "index.ts"));
const FIXTURE = JSON.parse(readFileSync(join(ROOT, "tests", "isolated", "fixtures", "kildekritik-introduction.json"), "utf8"));
const ROUND = "0b6c8f8e-6f1d-4a43-9d4e-2f2a1f6a7b01";
const SHA = "a".repeat(64);
const STEP_Q = (id, step) => ({ id, content: { question: "Q " + id, options: ["a", "b"], correct: "a" }, answer_format: "mc", answer_type: "short", metadata: { learning_step: step }, difficulty_band: 3 });
const CAP = { introduction_capability: 1 };

// rounds/active: the two F12-B reads (introduction_rounds, learning_introductions); history: the pupil's rows in the
// objective; open: the pupil's due/open instance (served first).
function patch(intro, { rounds = [], active = [], history = null, open = null } = {}) {
  return (kind, name, ops, result) => {
    if (kind === "rpc" && name === "serve_introduction") return intro;
    if (kind === "rpc" && name === "get_unserved_questions_for_student") return { data: [STEP_Q("g1", "guided_practice")], error: null };
    if (kind === "from" && name === "introduction_rounds") return rounds;
    if (kind === "from" && name === "learning_introductions") return active;
    if (kind === "from" && name === "question_instances" && ops.some((o) => o[0] === "select" && String(o[1]).includes("questions!inner"))) {
      return history ?? result;
    }
    if (kind === "from" && name === "question_instances" && open !== null && ops.some((o) => o[0] === "eq" && o[1] === "answered" && o[2] === false)) {
      return open;
    }
    return result;
  };
}
const FLAGS = ["LAERLIGVERSE_INTRODUCTION", "LAERLIGVERSE_OBJECTIVE_TARGETING", "LAERLIGVERSE_SEQUENCE"];
async function run({ intro, flag, sequence = true, extraBody = {}, capability = true, reads = {} }) {
  const env = globalThis.Deno.env;
  if (flag === undefined) env.delete("LAERLIGVERSE_INTRODUCTION"); else env.set("LAERLIGVERSE_INTRODUCTION", flag);
  if (sequence) { env.set("LAERLIGVERSE_OBJECTIVE_TARGETING", "on"); env.set("LAERLIGVERSE_SEQUENCE", "on"); }
  const cap = capability ? CAP : {};
  try {
    return await runCase(handler, { subject: "historie", scenario: "new", patch: patch(intro ?? { data: { outcome: "none" }, error: null }, reads),
      extraBody: sequence ? { learning_objective: "vikings", sequence: true, ...cap, ...extraBody } : { ...cap, ...extraBody } });
  } finally {
    for (const k of FLAGS) env.delete(k);
  }
}
const introCalls = (r) => r.calls.filter((c) => c.kind === "rpc" && c.name === "serve_introduction");
const show = (outcome = "served") => ({ data: { outcome, round_id: ROUND, served_at: "2026-11-10T08:00:00Z", content_sha256: SHA, content: FIXTURE.content }, error: null });
const writes = (r) => r.calls.filter((c) => c.ops?.some((o) => ["insert", "update", "upsert", "delete"].includes(o[0])) || (c.kind === "rpc" && c.name === "serve_introduction"));
const touched = (r, table) => r.calls.some((c) => c.kind === "from" && c.name === table);
const ROW = (completed_at) => ({ data: [{ completed_at, learning_introductions: { learning_objective: "vikings" } }], error: null });
const ACTIVE = { data: [{ id: "intro-1" }], error: null };
const NONE = { data: [], error: null };

test("off parity: anything but exactly \"on\" → identical to unset; no serve_introduction call", async () => {
  const base = await run({});
  assert.equal(base.status, 200, base.body);
  assert.equal(JSON.parse(base.body).learning_step, "guided_practice");
  assert.deepEqual(introCalls(base), []);
  for (const v of ["", "off", "ON", "true", " on"]) assert.deepEqual(await run({ flag: v, intro: show() }), base, JSON.stringify(v));
  const untargeted = await run({ sequence: false });
  assert.deepEqual(await run({ sequence: false, flag: "on", intro: show() }), untargeted, "no sequence → no introduction");
});

test("on: the introduction comes first — one call with the verified pupil, a reply with ONLY the cards", async () => {
  const r = await run({ flag: "on", intro: show(), extraBody: { student_id: "someone-else", learning_step: "guided_practice", completed: true } });
  assert.equal(r.status, 200, r.body);
  const body = JSON.parse(r.body);
  assert.deepEqual(body, { step: "introduction", learning_objective: "vikings", learning_step: "introduction", introduction_round_id: ROUND, content_sha256: SHA, content: FIXTURE.content });
  const [call] = introCalls(r);
  assert.equal(call.client, "admin");
  assert.deepEqual(call.ops, [["args", { p_student_id: "stu-1", p_learning_objective: "vikings" }]]);
  assert.equal(r.calls.some((c) => c.kind === "from" && c.name === "question_instances" && c.ops.some((o) => o[0] === "insert")), false, "no question instance");
  const resumed = await run({ flag: "on", intro: show("resumed") });
  assert.equal(JSON.parse(resumed.body).introduction_round_id, ROUND, "a refresh returns the same round");
});

test("on: completed (or none) → exactly the flag-off sequence plus the one call", async () => {
  const off = await run({});
  for (const intro of [{ data: { outcome: "completed", round_id: ROUND, completed_at: "2026-11-10T08:05:00Z" }, error: null }, { data: { outcome: "none" }, error: null }]) {
    const on = await run({ flag: "on", intro });
    assert.equal(introCalls(on).length, 1);
    const strip = (x) => ({ ...x, calls: x.calls.filter((c) => !(c.kind === "rpc" && c.name === "serve_introduction")),
      logs: x.logs });
    assert.deepEqual(strip(on), off, JSON.stringify(intro.data));
  }
});

test("on, fail loud: an error or a malformed reply is a 500 — never a question, never the cards of a broken row", async () => {
  for (const intro of [
    { data: null, error: { code: "PGRST202", message: "no function" } },
    { data: { outcome: "served", round_id: "x", content_sha256: SHA, content: FIXTURE.content }, error: null },
    { data: { outcome: "served", round_id: ROUND, content_sha256: SHA, content: { cards: [], correct: "a" } }, error: null },
    { data: { outcome: "weird" }, error: null },
  ]) {
    const r = await run({ flag: "on", intro });
    assert.equal(r.status, 500, JSON.stringify(intro));
    assert.equal(r.calls.some((c) => c.kind === "rpc" && c.name === "get_unserved_questions_for_student"), false);
  }
});

// ── F12-B: the introduction capability ──────────────────────────────────────────────────────────────────────────

test("F12-B: without the capability a REQUIRED introduction is introduction_required — two reads, no round, no task, no write", async () => {
  for (const [why, reads] of [
    ["a new pupil, an active introduction", { rounds: NONE, active: ACTIVE }],
    ["an open (not completed) round", { rounds: ROW(null), active: ACTIVE }],
    ["an open round of an introduction that is no longer active", { rounds: ROW(null), active: NONE }],
  ]) {
    for (const extraBody of [{}, { learning_step: "guided_practice" }, { introduction_capability: undefined }]) {
      const r = await run({ flag: "on", intro: show(), capability: false, reads, extraBody });
      assert.equal(r.status, 200, `${why}: ${r.body}`);
      assert.deepEqual(JSON.parse(r.body), { step: "introduction_required", learning_objective: "vikings" }, why);
      assert.deepEqual(introCalls(r), [], `${why}: serve_introduction (which creates a round) is never called`);
      assert.deepEqual(writes(r), [], `${why}: nothing is written`);
      assert.equal(r.calls.some((c) => c.kind === "rpc" && (c.name === "get_unserved_questions_for_student" || c.name === "release_open_question_outside")), false, `${why}: no task path`);
      const [rounds] = r.calls.filter((c) => c.kind === "from" && c.name === "introduction_rounds");
      assert.equal(rounds.client, "admin");
      assert.ok(rounds.ops.some((o) => o[0] === "eq" && o[1] === "student_id" && o[2] === "stu-1"), `${why}: scoped to the VERIFIED pupil`);
      assert.ok(rounds.ops.some((o) => o[0] === "eq" && o[1] === "learning_introductions.learning_objective" && o[2] === "vikings"));
    }
  }
});

test("F12-B: without the capability, NOT required (completed, or none active) → exactly the sequence with the capability", async () => {
  const completed = { data: { outcome: "completed", round_id: ROUND, completed_at: "2026-11-10T08:05:00Z" }, error: null };
  const withCap = await run({ flag: "on", intro: completed });
  const strip = (x) => ({ ...x, calls: x.calls.filter((c) => !(c.kind === "rpc" && c.name === "serve_introduction") && !(c.kind === "from" && (c.name === "introduction_rounds" || c.name === "learning_introductions"))) });
  for (const reads of [{ rounds: ROW("2026-11-10T08:05:00Z"), active: ACTIVE }, { rounds: NONE, active: NONE }]) {
    const r = await run({ flag: "on", intro: show(), capability: false, reads });
    assert.equal(JSON.parse(r.body).learning_step, "guided_practice", r.body);
    assert.deepEqual(introCalls(r), []);
    assert.deepEqual(strip(r), strip(withCap), JSON.stringify(reads));
  }
});

test("F12-B: an invalid capability is a 400 before ANY read or write — flag on or off, sequence or not", async () => {
  for (const value of [0, 2, -1, 1.5, "1", "on", true, false, null, [], {}, [1]]) {
    for (const [flag, sequence] of [["on", true], [undefined, true], [undefined, false]]) {
      const r = await run({ flag, sequence, intro: show(), capability: false, extraBody: { introduction_capability: value } });
      assert.equal(r.status, 400, `${JSON.stringify(value)}: ${r.body}`);
      assert.deepEqual(JSON.parse(r.body), { error: "invalid_introduction_capability" });
      assert.deepEqual(r.calls.filter((c) => c.kind === "from" || c.kind === "rpc"), [], `${JSON.stringify(value)}: no read, no write`);
    }
  }
});

test("F12-B: the capability changes nothing where no introduction is involved (flag off, or an untargeted request)", async () => {
  // Flag off, sequence: identical with and without the field.
  assert.deepEqual(await run({ capability: true }), await run({ capability: false }));
  // The ordinary quiz (no sequence): identical with and without the field, flag on or off.
  for (const flag of [undefined, "on"]) {
    assert.deepEqual(await run({ flag, sequence: false, capability: true }), await run({ flag, sequence: false, capability: false }), String(flag));
  }
});

test("F12-B: an OPEN task round of the objective is resumed BEFORE any introduction — with or without the capability; nothing new", async () => {
  const history = { data: [{ answered: false, was_correct: null, answered_at: null, questions: { learning_objective: "vikings", metadata: { learning_step: "guided_practice" } } }], error: null };
  const open = { data: [{ id: "open-1", repeat_count: 0, next_review_at: "t", questions: { ...STEP_Q("o1", "guided_practice"), learning_objective: "vikings", is_active: true } }], error: null };
  for (const capability of [true, false]) {
    const r = await run({ flag: "on", intro: show(), capability, reads: { history, open, rounds: NONE, active: ACTIVE } });
    assert.equal(r.status, 200, r.body);
    const body = JSON.parse(r.body);
    assert.equal(body.question_instance_id, "open-1", `capability=${capability}: the same instance`);
    assert.deepEqual(introCalls(r), [], "no introduction round is created in the middle of a task");
    assert.equal(touched(r, "introduction_rounds") || touched(r, "learning_introductions"), false);
    assert.equal(r.calls.some((c) => c.kind === "from" && c.name === "question_instances" && c.ops.some((o) => o[0] === "insert")), false, "no new instance");
  }
  // Answered rows only: no open round → the introduction comes first again (an answered task is no exemption).
  const answered = { data: [{ answered: true, was_correct: true, answered_at: "2026-11-10T08:00:00Z", questions: { learning_objective: "vikings", metadata: { learning_step: "guided_practice" } } }], error: null };
  const again = await run({ flag: "on", intro: show("resumed"), reads: { history: answered } });
  assert.equal(JSON.parse(again.body).step, "introduction", again.body);
  const without = await run({ flag: "on", intro: show(), capability: false, reads: { history: answered, rounds: ROW(null), active: ACTIVE } });
  assert.equal(JSON.parse(without.body).step, "introduction_required", without.body);
});

test("F12-B: a failed or malformed read is a 500 — never \"not required\", never a task", async () => {
  for (const reads of [
    { rounds: { data: null, error: { message: "boom" } }, active: ACTIVE },
    { rounds: NONE, active: { data: null, error: { message: "boom" } } },
    { rounds: { data: [{ learning_introductions: {} }], error: null }, active: ACTIVE },
    { rounds: { data: [{ completed_at: 5 }], error: null }, active: ACTIVE },
    { rounds: { data: null, error: null }, active: ACTIVE },
  ]) {
    const r = await run({ flag: "on", intro: show(), capability: false, reads });
    assert.equal(r.status, 500, `${JSON.stringify(reads)}: ${r.body}`);
    assert.equal(r.calls.some((c) => c.kind === "rpc" && c.name === "get_unserved_questions_for_student"), false);
    assert.deepEqual(writes(r), []);
  }
});
