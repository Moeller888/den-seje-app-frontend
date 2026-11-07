// Lærligverse L5 + L3 in get-next-question: LAERLIGVERSE_SERVED_MODE (served_mode on the inserted instance)
// and LAERLIGVERSE_HINTS (the hint COUNT in a sequence response). Runs the REAL get-next-question/index.ts
// against the recording stand-in of the parity harness (tests/unit/helpers/gnq-parity-harness.mjs).
//
// What this proves:
//   * OFF PARITY: with either secret unset or anything but exactly "on", a sequence request is identical — status,
//     body, every backend call with its arguments, every log line — to the same request with both unset. An
//     untargeted request with both "on" is identical to both unset (no sequence step = nothing recorded or stated).
//   * ON: the insert carries served_mode = the STEPS mode of the step the SERVER chose, and nothing else changes in
//     the insert; the response is unchanged apart from hints_available (LAERLIGVERSE_HINTS) = the count of the
//     served content's hints. Hint TEXT never reaches the response.
//   * The client cannot steer it: body fields mode / served_mode / hints_used / hints_available change nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadHandler, runCase } from "./helpers/gnq-parity-harness.mjs";
import { STEPS } from "../../supabase/functions/_shared/learning-sequence.ts";

const INDEX = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "supabase", "functions", "get-next-question", "index.ts");
const { handler } = await loadHandler(INDEX);

const HINTS = ["Første hjælp.", "Anden hjælp."];
const STEP_Q = (id, step, extra = {}) => ({
  id, content: { question: "Q " + id, options: ["a", "b"], correct: "a", hints: HINTS }, answer_format: "mc", answer_type: "short",
  metadata: { learning_step: step }, difficulty_band: 3, ...extra,
});
// History: the pupil answered guided practice correctly → the server's next step is independent_application.
const HISTORY = [{ answered: true, was_correct: true, answered_at: "2026-11-07T10:00:00Z", questions: { learning_objective: "vikings", metadata: { learning_step: "guided_practice" } } }];
function patch(kind, name, ops, result) {
  if (kind === "from" && name === "question_instances" && ops.some((o) => o[0] === "select" && String(o[1]).startsWith("answered, was_correct"))) {
    return { data: HISTORY, error: null };
  }
  if (kind === "rpc" && name === "get_unserved_questions_for_student") {
    return { data: [STEP_Q("g1", "guided_practice"), STEP_Q("c1", "independent_application")], error: null };
  }
  return result;
}

const FLAGS = ["LAERLIGVERSE_SERVED_MODE", "LAERLIGVERSE_HINTS", "LAERLIGVERSE_OBJECTIVE_TARGETING", "LAERLIGVERSE_SEQUENCE"];
async function run({ servedMode, hints, sequence = true, extraBody = {} }) {
  const env = globalThis.Deno.env;
  const set = (k, v) => (v === undefined ? env.delete(k) : env.set(k, v));
  set("LAERLIGVERSE_SERVED_MODE", servedMode);
  set("LAERLIGVERSE_HINTS", hints);
  set("LAERLIGVERSE_OBJECTIVE_TARGETING", sequence ? "on" : undefined);
  set("LAERLIGVERSE_SEQUENCE", sequence ? "on" : undefined);
  try {
    return await runCase(handler, {
      subject: "historie", scenario: "new", patch,
      extraBody: sequence ? { learning_objective: "vikings", sequence: true, ...extraBody } : extraBody,
    });
  } finally {
    for (const k of FLAGS) env.delete(k);
  }
}
const insertOf = (r) => {
  const c = r.calls.find((x) => x.kind === "from" && x.name === "question_instances" && x.ops.some((o) => o[0] === "insert"));
  return c ? c.ops.find((o) => o[0] === "insert")[1] : null;
};

const OFF = [undefined, "", "off", "ON", "On", "true", "1", " on", "on "];

test("off parity: LAERLIGVERSE_SERVED_MODE / LAERLIGVERSE_HINTS not exactly \"on\" → a sequence request is identical to both unset", async () => {
  const base = await run({});
  assert.equal(base.status, 200, base.body);
  assert.equal(JSON.parse(base.body).learning_step, "independent_application", "the fixture reaches a server step");
  assert.equal("served_mode" in insertOf(base), false);
  assert.equal("hints_available" in JSON.parse(base.body), false);
  for (const v of OFF) {
    assert.deepEqual(await run({ servedMode: v, hints: v }), base, `value ${JSON.stringify(v)}`);
  }
});

test("off parity: an untargeted request with both secrets \"on\" is identical to both unset (no server step, nothing recorded)", async () => {
  const off = await run({ sequence: false });
  const on = await run({ sequence: false, servedMode: "on", hints: "on" });
  assert.equal(off.status, 200, off.body);
  assert.deepEqual(on, off);
  assert.equal("served_mode" in insertOf(on), false);
});

test("LAERLIGVERSE_SERVED_MODE=on: the insert records the STEPS mode of the server's step; nothing else changes", async () => {
  const off = await run({});
  const on = await run({ servedMode: "on" });
  assert.equal(on.status, 200, on.body);
  const step = JSON.parse(on.body).learning_step;
  const expected = STEPS.find((s) => s.id === step).mode;
  assert.equal(expected, "check");
  assert.equal(insertOf(on).served_mode, expected);
  // Remove exactly that field: everything else (calls, body, logs) equals the off run.
  const strip = (r) => JSON.parse(JSON.stringify(r).replace(/,"served_mode":"check"/, ""));
  assert.deepEqual(strip(on), off);
  assert.equal(on.body.includes("served_mode"), false, "the response does not carry the column");
});

test("LAERLIGVERSE_HINTS=on: a sequence response states the hint COUNT of the served content, never the text", async () => {
  const off = await run({});
  const on = await run({ hints: "on" });
  const body = JSON.parse(on.body);
  assert.equal(body.hints_available, HINTS.length);
  for (const h of HINTS) assert.equal(on.body.includes(h), false, "no hint text in the response");
  assert.equal("hints" in body.content, false, "the public DTO drops content.hints");
  delete body.hints_available;
  assert.deepEqual({ ...on, body: JSON.stringify(body) }, off);
});

test("the client cannot steer it: mode / served_mode / hints_used / hints_available in the body change nothing", async () => {
  const forged = { mode: "application", served_mode: "review", hints_used: 0, hints_available: 3 };
  for (const flags of [{}, { servedMode: "on", hints: "on" }]) {
    const clean = await run(flags);
    const withForged = await run({ ...flags, extraBody: forged });
    assert.deepEqual(withForged.calls, clean.calls, JSON.stringify(flags));
    assert.equal(withForged.body, clean.body, JSON.stringify(flags));
  }
});
