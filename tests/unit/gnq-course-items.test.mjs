// D-383 in get-next-question: the ordinary quiz (no learning_objective) never serves or resumes a COURSE ITEM
// (questions.metadata has the key learning_step, ./scope.ts isCourseItem); a targeted course request is unchanged.
// Runs the REAL get-next-question/index.ts against the recording stand-in of the parity harness, on every selection
// route (classic, format mix v2, level engine v1). The database half (level candidates, repeats) is proven in
// course-items-out-of-ordinary-quiz-migration-run.test.mjs; the real stack in the introduction lane
// (laerligverse-introduction.isolated.spec.mjs, D-383 test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadHandler, runCase } from "./helpers/gnq-parity-harness.mjs";

const INDEX = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "supabase", "functions", "get-next-question", "index.ts");
const { handler } = await loadHandler(INDEX);

const Q = (id, metadata = {}, extra = {}) => ({
  id, content: { question: "Q " + id, options: ["a", "b"], correct: "a" }, answer_format: "mc", answer_type: "short",
  metadata, difficulty_band: 3, learning_objective: "vikings", ...extra,
});
const COURSE = (id, step = "guided_practice") => Q(id, { learning_step: step });
const CANDIDATE_RPCS = ["get_unserved_questions_for_student", "get_question_candidates_for_student", "get_level_questions_for_student"];
const ROUTES = [
  { name: "classic", mix: undefined, level: undefined },
  { name: "format mix v2", mix: "v2", level: undefined },
  { name: "level engine v1", mix: undefined, level: "v1" },
];

function withCandidates(rows, due = null) {
  return (kind, name, ops, result) => {
    if (kind === "rpc" && CANDIDATE_RPCS.includes(name)) return { data: rows.map((r) => ({ ...r, difficulty_level: 3000 })), error: null };
    if (due !== null && kind === "from" && name === "question_instances" && ops.some((o) => o[0] === "eq" && o[1] === "answered" && o[2] === false)) {
      return { data: due, error: null };
    }
    return result;
  };
}
const inserts = (r) => r.calls.filter((c) => c.kind === "from" && c.name === "question_instances" && c.ops.some((o) => o[0] === "insert"))
  .map((c) => c.ops.find((o) => o[0] === "insert")[1]);
const rpcs = (r) => r.calls.filter((c) => c.kind === "rpc").map((c) => c.name);
async function targeted(opts) {
  globalThis.Deno.env.set("LAERLIGVERSE_OBJECTIVE_TARGETING", "on");
  try {
    return await runCase(handler, { ...opts, extraBody: { learning_objective: "vikings", ...(opts.extraBody ?? {}) } });
  } finally {
    globalThis.Deno.env.delete("LAERLIGVERSE_OBJECTIVE_TARGETING");
  }
}

for (const route of ROUTES) {
  test(`${route.name}: the ordinary quiz skips course items among the candidates and serves the ordinary one`, async () => {
    const r = await runCase(handler, { ...route, subject: "historie", scenario: "new", patch: withCandidates([COURSE("c1"), COURSE("c2", "transfer"), Q("o1")]) });
    assert.equal(r.status, 200, r.body);
    assert.deepEqual(inserts(r).map((i) => i.question_id), ["o1"], "only the ordinary question is inserted");
    assert.equal(r.body.includes("Q c1") || r.body.includes("Q c2"), false);
  });

  test(`${route.name}: only course items left → nothing is inserted; the ordinary repeat step runs (as for an exhausted pool)`, async () => {
    const r = await runCase(handler, { ...route, subject: "historie", scenario: "new", patch: withCandidates([COURSE("c1"), COURSE("c2", "nonsense")]) });
    assert.equal(r.status, 200, r.body);
    assert.deepEqual(inserts(r), []);
    assert.ok(rpcs(r).some((n) => n.startsWith("request_repeat")), "the repeat step is reached");
  });
}

test("the ordinary quiz never resumes an open course round: 200 no_questions 'course_round_open' (a state the app explains), nothing inserted or repeated", async () => {
  const due = [{ id: "due-c", repeat_count: 0, next_review_at: "t", questions: { ...COURSE("dc"), is_active: true } }];
  for (const route of ROUTES) {
    const r = await runCase(handler, { ...route, subject: "historie", scenario: "due", patch: withCandidates([Q("o1")], due) });
    assert.equal(r.status, 200, `${route.name}: ${r.body}`);
    assert.deepEqual(JSON.parse(r.body), { step: "no_questions", reason: "course_round_open" });
    assert.deepEqual(inserts(r), []);
    assert.equal(rpcs(r).some((n) => n.startsWith("request_repeat") || CANDIDATE_RPCS.includes(n)), false, `${route.name}: stops at the open round`);
    assert.equal(r.body.includes("Q dc"), false);
  }
});

test("an open ORDINARY round is resumed exactly as before (the harness's due scenario)", async () => {
  const r = await runCase(handler, { subject: "historie", scenario: "due" });
  assert.equal(r.status, 200, r.body);
  assert.equal(JSON.parse(r.body).question_instance_id, "due-1");
});

test("a repeat RPC that hands back a course round (only a database without 20261120150000) is not served to the ordinary quiz", async () => {
  const patch = (kind, name, ops, result) => {
    if (kind === "from" && name === "question_instances" && ops.some((o) => o[0] === "eq" && o[1] === "id" && o[2] === "rep-1")) {
      return { data: [{ id: "rep-1", repeat_count: 1, questions: { ...COURSE("rc"), is_active: true } }], error: null };
    }
    return result;
  };
  const r = await runCase(handler, { subject: "historie", scenario: "repeat", patch });
  assert.equal(r.status, 200, r.body);
  assert.deepEqual(JSON.parse(r.body), { step: "no_questions", reason: "course_round_open" });
  assert.ok(r.logs.some((l) => l.startsWith("ERR D383_REPEAT_RETURNED_COURSE_ROUND:")), "logged loudly: the migration must come first");
});

// ── Problem 1: a targeted request WITHOUT the server sequence never gets a course item ─────────────────────────────
test("targeted without the sequence: ordinary items still served; course items withheld → 403 course_requires_sequence, nothing created", async () => {
  const mixed = await targeted({ subject: "historie", scenario: "new", patch: withCandidates([COURSE("c1"), Q("o1")]) });
  assert.equal(mixed.status, 200, mixed.body);
  assert.deepEqual(inserts(mixed).map((i) => i.question_id), ["o1"], "legitimate targeting of ordinary items (D-329) is unchanged");
  for (const extraBody of [{}, { sequence: false }, { sequence: "true" }, { sequence: 1 }, { learning_step: "transfer" }, { learning_step: "revisit", sequence: false }, { introduction_capability: 1 }]) {
    const only = await targeted({ subject: "historie", scenario: "new", patch: withCandidates([COURSE("c1"), COURSE("c2", "transfer")]), extraBody });
    assert.equal(only.status, 403, `${JSON.stringify(extraBody)}: ${only.body}`);
    assert.deepEqual(JSON.parse(only.body), { error: "course_requires_sequence" });
    assert.deepEqual(inserts(only), [], "no instance");
    assert.equal(rpcs(only).some((n) => n.startsWith("request_repeat")), false, "no repeat");
  }
  const due = [{ id: "due-c", repeat_count: 0, next_review_at: "t", questions: { ...COURSE("dc"), is_active: true } }];
  const open = await targeted({ subject: "historie", scenario: "due", patch: withCandidates([], due) });
  assert.equal(open.status, 409, open.body);
  assert.deepEqual(JSON.parse(open.body), { error: "open_question_course" }, "an open course round is not resumed outside the sequence");
});

test("inside the server sequence: the course item of the SERVER's step is served, and its open round resumed", async () => {
  const env = globalThis.Deno.env;
  env.set("LAERLIGVERSE_SEQUENCE", "on");
  try {
    const history = (kind, name, ops, result) =>
      (kind === "from" && name === "question_instances" && ops.some((o) => o[0] === "select" && String(o[1]).startsWith("answered, was_correct")) ? { data: [], error: null } : result);
    const both = (a, b) => (kind, name, ops, result) => b(kind, name, ops, a(kind, name, ops, result));
    const served = await targeted({ subject: "historie", scenario: "new", extraBody: { sequence: true }, patch: both(history, withCandidates([COURSE("t1", "transfer"), Q("o1"), COURSE("g1", "guided_practice")])) });
    assert.equal(served.status, 200, served.body);
    assert.equal(JSON.parse(served.body).learning_step, "guided_practice", "the server's first step");
    assert.deepEqual(inserts(served).map((i) => i.question_id), ["g1"], "only the step's course item; never a later step, never an untagged one");
    const due = [{ id: "due-c", repeat_count: 0, next_review_at: "t", questions: { ...COURSE("dc", "guided_practice"), is_active: true } }];
    const resumed = await targeted({ subject: "historie", scenario: "due", extraBody: { sequence: true }, patch: both(history, withCandidates([], due)) });
    assert.equal(resumed.status, 200, resumed.body);
    assert.equal(JSON.parse(resumed.body).question_instance_id, "due-c");
  } finally {
    env.delete("LAERLIGVERSE_SEQUENCE");
  }
});

test("the request cannot switch it off: body fields named like the tag change nothing", async () => {
  const base = await runCase(handler, { subject: "historie", scenario: "new", patch: withCandidates([COURSE("c1"), Q("o1")]) });
  for (const extraBody of [{ learning_step: "guided_practice" }, { course: true }, { include_course_items: true }, { metadata: { learning_step: "x" } }]) {
    const r = await runCase(handler, { subject: "historie", scenario: "new", patch: withCandidates([COURSE("c1"), Q("o1")]), extraBody });
    assert.deepEqual(inserts(r).map((i) => i.question_id), ["o1"], JSON.stringify(extraBody));
    assert.equal(r.status, base.status);
  }
});

// ── D-383 follow-up (20261123100000): the shared candidate RPCs get p_course_scope; an older database falls back ──────
const argsOf = (r, name) => r.calls.filter((c) => c.kind === "rpc" && c.name === name).map((c) => c.ops.find((o) => o[0] === "args")[1]);

test("p_course_scope: 'none' for the ordinary quiz and for a targeted request outside the sequence; the server's step inside it", async () => {
  for (const [route, rpc] of [[ROUTES[0], "get_unserved_questions_for_student"], [ROUTES[1], "get_question_candidates_for_student"]]) {
    const ordinary = await runCase(handler, { ...route, subject: "historie", scenario: "new" });
    assert.deepEqual(argsOf(ordinary, rpc).map((a) => a.p_course_scope), ["none"], `${route.name}: ordinary`);
    const outside = await targeted({ ...route, subject: "historie", scenario: "new" });
    assert.deepEqual(argsOf(outside, rpc).map((a) => a.p_course_scope), ["none"], `${route.name}: targeted, no sequence`);
    const env = globalThis.Deno.env;
    env.set("LAERLIGVERSE_SEQUENCE", "on");
    try {
      const history = (kind, name, ops, result) =>
        (kind === "from" && name === "question_instances" && ops.some((o) => o[0] === "select" && String(o[1]).startsWith("answered, was_correct")) ? { data: [], error: null } : result);
      const inside = await targeted({ ...route, subject: "historie", scenario: "new", extraBody: { sequence: true, learning_step: "guided_practice" }, patch: history });
      assert.deepEqual(argsOf(inside, rpc).map((a) => a.p_course_scope), ["guided_practice"], `${route.name}: the server's step`);
    } finally {
      env.delete("LAERLIGVERSE_SEQUENCE");
    }
  }
  // The level route's candidates are ordinary-only and filtered in SQL (20261120150000); its call is unchanged.
  const level = await runCase(handler, { ...ROUTES[2], subject: "historie", scenario: "new" });
  for (const a of argsOf(level, "get_level_questions_for_student")) assert.equal("p_course_scope" in a, false);
});

test("the client cannot choose the scope: body fields change nothing; only the server's step or 'none' is ever sent", async () => {
  for (const extraBody of [{ p_course_scope: "transfer" }, { course_scope: "transfer" }, { learning_step: "transfer" }]) {
    const r = await runCase(handler, { subject: "historie", scenario: "new", extraBody });
    assert.deepEqual(argsOf(r, "get_unserved_questions_for_student").map((a) => a.p_course_scope), ["none"], JSON.stringify(extraBody));
  }
});

test("a database without the parameter (PGRST202): exactly one fallback call with today's arguments, logged; course items still withheld", async () => {
  for (const [route, rpc] of [[ROUTES[0], "get_unserved_questions_for_student"], [ROUTES[1], "get_question_candidates_for_student"]]) {
    const patch = (kind, name, ops, result) => {
      if (kind !== "rpc" || name !== rpc) return result;
      const args = ops.find((o) => o[0] === "args")[1];
      if ("p_course_scope" in args) return { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
      return { data: [COURSE("c1"), Q("o1")], error: null };
    };
    const r = await runCase(handler, { ...route, subject: "historie", scenario: "new", patch });
    assert.equal(r.status, 200, `${route.name}: ${r.body}`);
    const calls = argsOf(r, rpc);
    assert.equal(calls.length, 2, `${route.name}: the scoped call and one fallback`);
    assert.equal(calls[0].p_course_scope, "none");
    assert.equal("p_course_scope" in calls[1], false);
    assert.deepEqual(Object.keys(calls[1]).sort(), Object.keys(calls[0]).filter((k) => k !== "p_course_scope").sort(), "otherwise the same arguments");
    assert.ok(r.logs.some((l) => l === `ERR COURSE_SCOPE_FALLBACK: {"rpc":"${rpc}"}`), `${route.name}: logged`);
    assert.deepEqual(inserts(r).map((i) => i.question_id), ["o1"], `${route.name}: the TS filter still withholds the course item`);
  }
});

test("any OTHER candidate error is not a fallback: it fails loud (500), with no second call", async () => {
  const patch = (kind, name, ops, result) => (kind === "rpc" && name === "get_unserved_questions_for_student" ? { data: null, error: { code: "42501", message: "permission denied" } } : result);
  const r = await runCase(handler, { subject: "historie", scenario: "new", patch });
  assert.equal(r.status, 500, r.body);
  assert.equal(argsOf(r, "get_unserved_questions_for_student").length, 1);
  assert.equal(r.logs.some((l) => l.includes("COURSE_SCOPE_FALLBACK")), false);
});
