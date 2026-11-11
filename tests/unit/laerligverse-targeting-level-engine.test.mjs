// F10-B: objective targeting (D-329) and the server sequence (D-338) together with the level engine.
//
// WHY. LEVEL_ENGINE=v1 is global in production since 2026-11-04. The isolated stack, where targeting was tested,
// does not set LEVEL_ENGINE, so a targeted request there always took the classic route
// (get_unserved_questions_for_student). Under v1 the same request would take the level route:
//   * get_level_questions_for_student serves only questions WITH a difficulty_level. A course objective
//     (Arkivskabet) is not on the difficulty scale, so every targeted request would end in "objective_exhausted"
//     / "step_exhausted" — the course would never start;
//   * advance_student_level would be called for the subject, and it is the level engine's job, not a course's.
// The rule: a targeted request is a course request. It is NEVER routed through the level engine; it uses the
// classic candidate route on the narrowed scope. Untargeted requests are untouched: LEVEL_ENGINE=v1 keeps the
// level route exactly as before (also proven by the release gate's parity matrix).
//
// Runs the REAL get-next-question/index.ts against the recording stand-in of the parity harness.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { B_FUNCTIONS, loadHandler, runCase } from "./helpers/gnq-parity-harness.mjs";

const INDEX = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "supabase", "functions", "get-next-question", "index.ts");
const { handler } = await loadHandler(INDEX);

// The harness's profile has active_domains ["vikings"], so "vikings" is a valid objective inside the scope.
async function run({ targeting, level, scenario = "new", extraBody = {} }) {
  if (targeting) globalThis.Deno.env.set("LAERLIGVERSE_OBJECTIVE_TARGETING", "on");
  else globalThis.Deno.env.delete("LAERLIGVERSE_OBJECTIVE_TARGETING");
  try {
    return await runCase(handler, { level, subject: "historie", scenario, extraBody });
  } finally {
    globalThis.Deno.env.delete("LAERLIGVERSE_OBJECTIVE_TARGETING");
  }
}
const rpcNames = (r) => r.calls.filter((c) => c.kind === "rpc").map((c) => c.name);
const unservedCall = (r) => r.calls.find((c) => c.kind === "rpc" && c.name === "get_unserved_questions_for_student");

test("LEVEL_ENGINE=v1 + a targeted request: the classic route on the objective, never the level engine", async () => {
  const r = await run({ targeting: true, level: "v1", extraBody: { learning_objective: "vikings" } });
  assert.equal(r.status, 200, r.body);
  for (const fn of B_FUNCTIONS) assert.equal(rpcNames(r).includes(fn), false, `${fn} must not be called for a course request`);
  assert.ok(unservedCall(r), "the classic candidate RPC serves the objective");
  assert.equal(JSON.parse(r.body).learning_objective, "vikings");
  assert.ok(JSON.stringify(unservedCall(r)).includes('"p_domains":["vikings"]'), "narrowed to exactly the objective");
});

test("LEVEL_ENGINE=v1 without targeting is unchanged: the level route as before", async () => {
  const r = await run({ targeting: false, level: "v1", extraBody: { learning_objective: "vikings" } });
  assert.equal(r.status, 200, r.body);
  assert.ok(rpcNames(r).includes("advance_student_level"));
  assert.ok(rpcNames(r).includes("get_level_questions_for_student"));
  assert.equal(unservedCall(r), undefined);
  assert.equal(JSON.parse(r.body).learning_objective, undefined, "the field is ignored while the flag is off");
});

test("flag on but no objective in the request: an ordinary request, so v1 keeps the level route", async () => {
  const r = await run({ targeting: true, level: "v1" });
  assert.equal(r.status, 200, r.body);
  assert.ok(rpcNames(r).includes("get_level_questions_for_student"));
  assert.equal(unservedCall(r), undefined);
});

test("a targeted request whose objective is used up says so — it never falls through to a level repeat", async () => {
  const r = await run({ targeting: true, level: "v1", scenario: "none", extraBody: { learning_objective: "vikings" } });
  assert.equal(r.status, 200, r.body);
  assert.deepEqual(JSON.parse(r.body), { step: "no_questions", reason: "objective_exhausted" });
  assert.equal(rpcNames(r).some((n) => n.startsWith("request_repeat")), false);
});
