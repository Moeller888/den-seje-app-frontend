// LP-13 / K9 prototype in get-next-question: LAERLIGVERSE_INTRODUCTION serves an objective's introduction (a separate
// server round without an answer key) before the first sequence step. REAL index.ts, recording stand-in
// (tests/unit/helpers/gnq-parity-harness.mjs).
//
// Proves: OFF PARITY (unset or anything but exactly "on": identical status, body, calls and logs; an untargeted
// request with the flag on is identical too); ON: one backend call serve_introduction with the VERIFIED pupil and the
// objective — never a body field — and an introduction reply with ONLY the cards; a refresh (resumed) returns the same
// round; once completed (or none exists) the sequence runs exactly as with the flag off plus that one call; a broken
// reply is a 500 that never falls through to a question.
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

function patch(intro) {
  return (kind, name, ops, result) => {
    if (kind === "rpc" && name === "serve_introduction") return intro;
    if (kind === "rpc" && name === "get_unserved_questions_for_student") return { data: [STEP_Q("g1", "guided_practice")], error: null };
    return result;
  };
}
const FLAGS = ["LAERLIGVERSE_INTRODUCTION", "LAERLIGVERSE_OBJECTIVE_TARGETING", "LAERLIGVERSE_SEQUENCE"];
async function run({ intro, flag, sequence = true, extraBody = {} }) {
  const env = globalThis.Deno.env;
  if (flag === undefined) env.delete("LAERLIGVERSE_INTRODUCTION"); else env.set("LAERLIGVERSE_INTRODUCTION", flag);
  if (sequence) { env.set("LAERLIGVERSE_OBJECTIVE_TARGETING", "on"); env.set("LAERLIGVERSE_SEQUENCE", "on"); }
  try {
    return await runCase(handler, { subject: "historie", scenario: "new", patch: patch(intro ?? { data: { outcome: "none" }, error: null }),
      extraBody: sequence ? { learning_objective: "vikings", sequence: true, ...extraBody } : extraBody });
  } finally {
    for (const k of FLAGS) env.delete(k);
  }
}
const introCalls = (r) => r.calls.filter((c) => c.kind === "rpc" && c.name === "serve_introduction");
const show = (outcome = "served") => ({ data: { outcome, round_id: ROUND, served_at: "2026-11-10T08:00:00Z", content_sha256: SHA, content: FIXTURE.content }, error: null });

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
