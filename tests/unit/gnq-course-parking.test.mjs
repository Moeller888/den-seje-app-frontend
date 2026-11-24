// D-384 (F8) in get-next-question: with LAERLIGVERSE_COURSE_PARKING=on an open COURSE round no longer stops the
// ordinary quiz — it is parked (park_open_course_round) and the quiz goes on; inside the course's server sequence the
// parked round is resumed first (resume_parked_course_round). Off (unset or anything but "on"): exactly D-383.
// Runs the REAL get-next-question/index.ts against the recording stand-in of the parity harness, on every selection
// route. The database half (the RPCs, the indexes, the trigger, concurrency) is proven in
// course-round-parking-migration-run.test.mjs and course-round-parking-concurrency.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadHandler, runCase } from "./helpers/gnq-parity-harness.mjs";
import {
  COURSE_PARKING_ENV, activationOf, courseParkingEnabled, parkResultOf, resumeOutcomeOf, RESUME_OUTCOMES,
} from "../../supabase/functions/get-next-question/course-parking.ts";

const INDEX = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "supabase", "functions", "get-next-question", "index.ts");
const { handler } = await loadHandler(INDEX);
const env = globalThis.Deno.env;

const Q = (id, metadata = {}) => ({
  id, content: { question: "Q " + id, options: ["a", "b"], correct: "a" }, answer_format: "mc", answer_type: "short",
  metadata, difficulty_band: 3, learning_objective: "vikings",
});
const COURSE = (id, step = "guided_practice") => Q(id, { learning_step: step });
const CANDIDATE_RPCS = ["get_unserved_questions_for_student", "get_question_candidates_for_student", "get_level_questions_for_student"];
const ROUTES = [
  { name: "classic", mix: undefined, level: undefined },
  { name: "format mix v2", mix: "v2", level: undefined },
  { name: "level engine v1", mix: undefined, level: "v1" },
];
const DUE_COURSE = [{ id: "due-c", repeat_count: 0, next_review_at: "t", questions: { ...COURSE("dc"), is_active: true } }];

/** Candidates, the due rows, and the two parking RPCs' answers. */
function backend({ candidates = [Q("o1")], due = null, park = { data: "due-c", error: null }, resume = { data: "none", error: null }, history = false } = {}) {
  return (kind, name, ops, result) => {
    if (kind === "rpc" && CANDIDATE_RPCS.includes(name)) return { data: candidates.map((r) => ({ ...r, difficulty_level: 3000 })), error: null };
    if (kind === "rpc" && name === "park_open_course_round") return park;
    if (kind === "rpc" && name === "resume_parked_course_round") return resume;
    if (history && kind === "from" && name === "question_instances" && ops.some((o) => o[0] === "select" && String(o[1]).startsWith("answered, was_correct"))) {
      return { data: [], error: null };
    }
    if (due !== null && kind === "from" && name === "question_instances" && ops.some((o) => o[0] === "eq" && o[1] === "answered" && o[2] === false)) {
      return { data: due, error: null };
    }
    return result;
  };
}
const inserts = (r) => r.calls.filter((c) => c.kind === "from" && c.name === "question_instances" && c.ops.some((o) => o[0] === "insert"))
  .map((c) => c.ops.find((o) => o[0] === "insert")[1]);
const rpcCalls = (r, fn) => r.calls.filter((c) => c.kind === "rpc" && c.name === fn).map((c) => c.ops.find((o) => o[0] === "args")[1]);
async function withEnv(vars, fn) {
  const old = {};
  for (const [k, v] of Object.entries(vars)) { old[k] = env.get(k); if (v === undefined) env.delete(k); else env.set(k, v); }
  try { return await fn(); } finally { for (const [k, v] of Object.entries(old)) { if (v === undefined) env.delete(k); else env.set(k, v); } }
}
const ordinary = (route, b) => runCase(handler, { ...route, subject: "historie", scenario: "due", patch: b });
const sequence = (b, extra = {}) => runCase(handler, {
  subject: "historie", scenario: "due", patch: b, extraBody: { learning_objective: "vikings", sequence: true, ...extra },
});
const SEQ_ENV = { LAERLIGVERSE_OBJECTIVE_TARGETING: "on", LAERLIGVERSE_SEQUENCE: "on" };

test("the switch: only exactly 'on' turns parking on", () => {
  assert.equal(COURSE_PARKING_ENV, "LAERLIGVERSE_COURSE_PARKING");
  assert.equal(courseParkingEnabled("on"), true);
  for (const v of [undefined, null, "", "ON", "true", "1", "off", " on", true]) assert.equal(courseParkingEnabled(v), false, String(v));
});

for (const route of ROUTES) {
  test(`${route.name}: parking OFF — exactly D-383: 'course_round_open', no parking call, nothing inserted`, async () => {
    for (const value of [undefined, "off", "true"]) {
      const r = await withEnv({ [COURSE_PARKING_ENV]: value }, () => ordinary(route, backend({ due: DUE_COURSE })));
      assert.equal(r.status, 200, r.body);
      assert.deepEqual(JSON.parse(r.body), { step: "no_questions", reason: "course_round_open" });
      assert.deepEqual(rpcCalls(r, "park_open_course_round"), [], `${value}: no new call`);
      assert.deepEqual(inserts(r), []);
    }
  });

  test(`${route.name}: parking ON — the open course round is parked and the ordinary quiz serves an ordinary task`, async () => {
    const r = await withEnv({ [COURSE_PARKING_ENV]: "on" }, () => ordinary(route, backend({ due: DUE_COURSE })));
    assert.equal(r.status, 200, r.body);
    assert.deepEqual(rpcCalls(r, "park_open_course_round"), [{ p_student_id: "stu-1" }], "parks the VERIFIED pupil's round");
    assert.deepEqual(inserts(r).map((i) => i.question_id), ["o1"]);
    assert.equal(r.body.includes("Q dc"), false, "the course item is never shown to the ordinary quiz");
    assert.ok(r.logs.some((l) => l.includes("COURSE_ROUND_PARKING:") && l.includes("park")));
  });
}

test("parking ON, but the round could not be parked (answered meanwhile, or another round of the course is parked): D-383's answer", async () => {
  for (const park of [{ data: null, error: null }, { data: null, error: { code: "23505", message: "duplicate key" } }, { data: "another-id", error: null }]) {
    const r = await withEnv({ [COURSE_PARKING_ENV]: "on" }, () => ordinary(ROUTES[0], backend({ due: DUE_COURSE, park })));
    assert.equal(r.status, 200, r.body);
    assert.deepEqual(JSON.parse(r.body), { step: "no_questions", reason: "course_round_open" }, JSON.stringify(park));
    assert.deepEqual(inserts(r), []);
  }
});

test("parking ON: any other database error, or an unexpected answer, is a loud 500 — never a guess", async () => {
  for (const park of [{ data: null, error: { code: "42501", message: "permission denied" } }, { data: 42, error: null }]) {
    const r = await withEnv({ [COURSE_PARKING_ENV]: "on" }, () => ordinary(ROUTES[0], backend({ due: DUE_COURSE, park })));
    assert.equal(r.status, 500, `${JSON.stringify(park)}: ${r.body}`);
    assert.deepEqual(inserts(r), []);
  }
});

// A database WITH migration 20261124120000 answers a select naming activation_no with the column (default 0). The
// harness's rows predate the column, so this adds it exactly where a real database would: only when it is selected.
const selectsActivation = (ops) => ops.some((o) => o[0] === "select" && /\bactivation_no\b/.test(String(o[1])));
const withActivationColumn = (inner, n = 0) => (kind, name, ops, result) => {
  const res = inner ? inner(kind, name, ops, result) : result;
  if (kind !== "from" || name !== "question_instances" || !selectsActivation(ops) || !Array.isArray(res?.data)) return res;
  return { ...res, data: res.data.map((row) => ("activation_no" in row ? row : { ...row, activation_no: n })) };
};

test("parking ON: an open ORDINARY round is resumed exactly as before; no parking call; its activation is handed out", async () => {
  const r = await withEnv({ [COURSE_PARKING_ENV]: "on" }, () => runCase(handler, { subject: "historie", scenario: "due", patch: withActivationColumn(null) }));
  assert.equal(r.status, 200, r.body);
  assert.equal(JSON.parse(r.body).question_instance_id, "due-1");
  assert.equal(JSON.parse(r.body).activation_no, 0, "D-384: the round's activation, so process-event can tell an older tab");
  assert.deepEqual(rpcCalls(r, "park_open_course_round"), []);
});

test("parking OFF: the due read names no activation_no and the response carries none (byte-identical to D-383)", async () => {
  for (const scenario of ["due", "repeat", "new"]) {
    const r = await withEnv({ [COURSE_PARKING_ENV]: undefined }, () => runCase(handler, { subject: "historie", scenario }));
    assert.equal(r.status, 200, r.body);
    assert.equal(r.calls.some((c) => c.kind === "from" && selectsActivation(c.ops)), false, `${scenario}: no new column read`);
    assert.equal("activation_no" in JSON.parse(r.body), false, `${scenario}: no new response key`);
  }
});

test("parking ON: a reopened (repeat) round hands out its activation too; a new round hands out none (it is 0 by default)", async () => {
  const rep = await withEnv({ [COURSE_PARKING_ENV]: "on" }, () => runCase(handler, { subject: "historie", scenario: "repeat", patch: withActivationColumn(null, 2) }));
  assert.equal(rep.status, 200, rep.body);
  assert.equal(JSON.parse(rep.body).activation_no, 2, "a once-resumed round keeps its number when it is repeated");
  const fresh = await withEnv({ [COURSE_PARKING_ENV]: "on" }, () => runCase(handler, { subject: "historie", scenario: "new", patch: withActivationColumn(null) }));
  assert.equal(fresh.status, 200, fresh.body);
  assert.equal("activation_no" in JSON.parse(fresh.body), false, "a new row is 0: process-event accepts an answer without a number for it");
});

test("parking ON on a database WITHOUT the column (migration missing): a loud 500, never a round whose answer would be refused", async () => {
  const r = await withEnv({ [COURSE_PARKING_ENV]: "on" }, () => runCase(handler, { subject: "historie", scenario: "due" }));
  assert.equal(r.status, 500, r.body);
  assert.match(r.body, /Invalid activation_no/);
  for (const bad of [undefined, null, -1, 1.5, "1"]) assert.throws(() => activationOf({ id: "x", activation_no: bad }), String(bad));
  assert.deepEqual(activationOf({ id: "x", activation_no: 3 }), { activation_no: 3 });
});

test("in the server sequence: resume is called for the validated objective and the SERVER's step, then the round is served", async () => {
  const due = [{ id: "due-c", repeat_count: 0, activation_no: 1, next_review_at: "t", questions: { ...COURSE("dc", "guided_practice"), is_active: true } }];
  const r = await withEnv({ ...SEQ_ENV, [COURSE_PARKING_ENV]: "on" }, () => sequence(backend({ due, history: true, resume: { data: "resumed", error: null } })));
  assert.equal(r.status, 200, r.body);
  assert.deepEqual(rpcCalls(r, "resume_parked_course_round"), [{ p_student_id: "stu-1", p_objective: "vikings", p_step: "guided_practice" }]);
  assert.equal(JSON.parse(r.body).question_instance_id, "due-c", "the SAME instance");
  assert.equal(JSON.parse(r.body).activation_no, 1, "the resumed activation is handed out with it");
  assert.deepEqual(rpcCalls(r, "park_open_course_round"), [], "inside the sequence nothing is parked by the due loop");
  // A step named by the client never reaches the RPC: the server's step is used (a stale one is refused before).
  const off = await withEnv({ ...SEQ_ENV, [COURSE_PARKING_ENV]: undefined }, () => sequence(backend({ due, history: true })));
  assert.equal(off.status, 200, off.body);
  assert.deepEqual(rpcCalls(off, "resume_parked_course_round"), [], "parking off: no new call");
});

test("in the server sequence: 'wrong_step' answers as an active round in another step does (409); unknown answers are 500", async () => {
  const r = await withEnv({ ...SEQ_ENV, [COURSE_PARKING_ENV]: "on" }, () => sequence(backend({ due: [], history: true, resume: { data: "wrong_step", error: null } })));
  assert.equal(r.status, 409, r.body);
  assert.deepEqual(JSON.parse(r.body), { error: "open_question_other_step" });
  assert.deepEqual(inserts(r), [], "nothing new in the course while its round waits in another step");
  for (const resume of [{ data: "maybe", error: null }, { data: null, error: { code: "XX000", message: "boom" } }]) {
    const bad = await withEnv({ ...SEQ_ENV, [COURSE_PARKING_ENV]: "on" }, () => sequence(backend({ due: [], history: true, resume })));
    assert.equal(bad.status, 500, JSON.stringify(resume));
  }
});

test("the targeted lost-race check asks for the ACTIVE open round (parked_at IS NULL) only with parking on", async () => {
  const lostRace = (r) => r.calls.filter((c) => c.kind === "from" && c.name === "question_instances"
    && c.ops.some((o) => o[0] === "select" && o[1] === "id") && c.ops.some((o) => o[0] === "eq" && o[1] === "answered"));
  const patch = backend({ candidates: [], due: [] });
  for (const [value, expectIs] of [["on", true], [undefined, false]]) {
    const r = await withEnv({ LAERLIGVERSE_OBJECTIVE_TARGETING: "on", [COURSE_PARKING_ENV]: value },
      () => runCase(handler, { subject: "historie", scenario: "new", patch, extraBody: { learning_objective: "vikings" } }));
    const reads = lostRace(r);
    assert.equal(reads.length, 1, r.body);
    assert.equal(reads[0].ops.some((o) => o[0] === "is" && o[1] === "parked_at" && o[2] === null), expectIs, String(value));
  }
});

test("course-parking.ts: the two answers are read strictly", () => {
  assert.deepEqual(parkResultOf({ data: "id-1", error: null }), { kind: "parked", instanceId: "id-1" });
  assert.deepEqual(parkResultOf({ data: null, error: null }), { kind: "not_parked" });
  assert.deepEqual(parkResultOf({ data: null, error: { code: "23505" } }), { kind: "conflict" });
  for (const bad of [{ data: "", error: null }, { data: 1, error: null }, { data: null, error: { code: "42501" } }]) {
    assert.throws(() => parkResultOf(bad), JSON.stringify(bad));
  }
  assert.deepEqual([...RESUME_OUTCOMES], ["resumed", "none", "other_active", "wrong_step", "inactive"]);
  for (const o of RESUME_OUTCOMES) assert.equal(resumeOutcomeOf({ data: o, error: null }), o);
  for (const bad of [{ data: "RESUMED", error: null }, { data: null, error: null }, { data: "none", error: { code: "XX000" } }]) {
    assert.throws(() => resumeOutcomeOf(bad), JSON.stringify(bad));
  }
});
