// D-384 i process-event (supabase/functions/process-event/round-activation.ts): et svar fra en TIDLIGERE aktivering af en
// kursusrunde (en gammel fane, efter parkering og genoptagelse) afvises med 409 stale_activation — på alle fire svarveje,
// FØR nogen svarfunktion kaldes. Med LAERLIGVERSE_COURSE_PARKING slukket er alt som før: ingen ny kolonne læses, og et
// activation_no i body'en ændrer intet. Kører den RIGTIGE index.ts gennem tests/unit/helpers/process-event-harness.mjs.
// Databasens halvdel (resume tæller op, eleven kan ikke skrive kolonnen) er bevist i course-round-parking-migration-run;
// hele forløbet med de rigtige Edge Functions mod en rigtig database i course-round-stale-tab-migrations-run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadHandler, runCase, INSTANCES } from "./helpers/process-event-harness.mjs";
import {
  COURSE_PARKING_ENV, activationCheckEnabled, activationVerdict, staleActivationReply,
  ACTIVATION_HEADER, activationClientHeaders, isStaleActivationError,
} from "../../supabase/functions/process-event/round-activation.ts";
import { COURSE_PARKING_ENV as GNQ_ENV } from "../../supabase/functions/get-next-question/course-parking.ts";
import { ACTIVATION_COLUMN, GRADING_COLUMNS } from "../../supabase/functions/process-event/instance-read.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const loaded = loadHandler(join(ROOT, "supabase", "functions", "process-event", "index.ts"));
loaded.catch(() => {});

const SUB = "6f1c2a9e-4b7d-4e2a-9c3f-0d8b5e7a1c24";
const ANSWER_RPCS = ["process_question_attempt", "process_text_answer", "process_question_attempt_v2", "process_text_answer_v2"];
const RECORDED = { outcome: "recorded", status: "correct", correct_answer: "a", review_text: null, misconception_type: null, round_no: 1, xp_awarded: 10, coins_awarded: 5 };
const CASES = {
  "mc (gammel vej)": { body: { question_instance_id: "mc-1", answer: "a" }, rpc: "process_question_attempt" },
  "tal (gammel vej)": { body: { question_instance_id: "num-1", answer: "42" }, rpc: "process_question_attempt" },
  "kort tekst (gammel vej)": { body: { question_instance_id: "txt-1", answer: "Paris" }, rpc: "process_text_answer" },
  "mc (H5)": { body: { question_instance_id: "mc-1", answer: "a", round_no: 1, submission_id: SUB }, rpc: "process_question_attempt_v2" },
  "kort tekst (H5)": { body: { question_instance_id: "txt-1", answer: "Paris", round_no: 1, submission_id: SUB }, rpc: "process_text_answer_v2" },
};

// The instance read answers like a database WITH the migration: the row's activation_no, only when it is selected.
const isRead = (kind, name, ops) => kind === "from" && name === "question_instances" && ops.some((o) => o[0] === "maybeSingle");
const selected = (ops) => String(ops.find((o) => o[0] === "select")?.[1] ?? "");
function db(rowActivation) {
  return (kind, name, ops, _client, base) => {
    if (isRead(kind, name, ops) && base.data) {
      const withCol = selected(ops).split(",")[0].trim() === ACTIVATION_COLUMN;
      if (!withCol) return base;
      return { ...base, data: rowActivation === undefined ? base.data : { ...base.data, activation_no: rowActivation } };
    }
    if (kind === "rpc" && (name === "process_question_attempt_v2" || name === "process_text_answer_v2")) {
      return { data: { ...RECORDED, round_no: ops[0][1].p_round_no }, error: null };
    }
    return base;
  };
}
const ON = { [COURSE_PARKING_ENV]: "on" };
async function send(c) {
  const r = await runCase(await loaded, c);
  return { ...r, json: (() => { try { return JSON.parse(r.body); } catch { return null; } })() };
}
const rpcs = (r) => r.calls.filter((c) => c.kind === "rpc").map((c) => c.name);
const reads = (r) => r.calls.filter((c) => isRead(c.kind, c.name, c.ops)).map((c) => selected(c.ops));

test("the switch is gnq's switch: one Edge secret, only exactly 'on'", () => {
  assert.equal(COURSE_PARKING_ENV, GNQ_ENV);
  assert.equal(activationCheckEnabled("on"), true);
  for (const v of [undefined, null, "", "ON", "true", "1", "off", " on", true]) assert.equal(activationCheckEnabled(v), false, String(v));
});

test("OFF: exactly as before — the read names no new column, and activation_no in the body changes nothing", async () => {
  for (const [name, c] of Object.entries(CASES)) {
    for (const extra of [{}, { activation_no: 0 }, { activation_no: 5 }, { activation_no: "x" }]) {
      const r = await send({ body: { ...c.body, ...extra }, backend: db(3), env: { [COURSE_PARKING_ENV]: undefined } });
      assert.equal(r.status, 200, `${name} ${JSON.stringify(extra)}: ${r.body}`);
      assert.deepEqual(reads(r), [GRADING_COLUMNS], `${name}: the read of today`);
      assert.deepEqual(rpcs(r), [c.rpc], name);
    }
  }
});

test("ON, a round that was never resumed (0): an answer without a number (every client today) or with 0 is processed", async () => {
  for (const [name, c] of Object.entries(CASES)) {
    for (const extra of [{}, { activation_no: 0 }, { activation_no: null }]) {
      const r = await send({ body: { ...c.body, ...extra }, backend: db(0), env: ON });
      assert.equal(r.status, 200, `${name} ${JSON.stringify(extra)}: ${r.body}`);
      assert.deepEqual(reads(r), [`${ACTIVATION_COLUMN},${GRADING_COLUMNS}`], name);
      assert.deepEqual(rpcs(r), [c.rpc], name);
    }
  }
});

test("ON, a resumed round (2): only the CURRENT activation is processed; an older tab (none, 0, 1) or a future number is refused before any answer function", async () => {
  for (const [name, c] of Object.entries(CASES)) {
    const ok = await send({ body: { ...c.body, activation_no: 2 }, backend: db(2), env: ON });
    assert.equal(ok.status, 200, `${name}: ${ok.body}`);
    assert.deepEqual(rpcs(ok), [c.rpc], name);
    for (const extra of [{}, { activation_no: 0 }, { activation_no: 1 }, { activation_no: 3 }]) {
      const r = await send({ body: { ...c.body, ...extra }, backend: db(2), env: ON });
      assert.equal(r.status, 409, `${name} ${JSON.stringify(extra)}`);
      assert.deepEqual(r.json, { outcome: "stale_activation", error: "Stale activation" });
      assert.deepEqual(rpcs(r), [], `${name}: no answer function, nothing recorded or paid`);
      assert.deepEqual(r.calls.filter((x) => x.kind === "from" && x.ops.some((o) => o[0] === "update")), [], `${name}: no write`);
      assert.ok(r.logs.some((l) => l.includes("FLOW: STALE ACTIVATION")), name);
    }
  }
});

test("ON: a malformed number is 400 invalid_request; a row without the column (migration missing) is a loud 500", async () => {
  for (const bad of ["2", 1.5, -1, true, [1], 2147483648]) {
    const r = await send({ body: { ...CASES["mc (gammel vej)"].body, activation_no: bad }, backend: db(0), env: ON });
    assert.equal(r.status, 400, JSON.stringify(bad));
    assert.deepEqual(r.json, { outcome: "invalid_request", reason: "activation_no", error: "Invalid request" });
    assert.deepEqual(rpcs(r), []);
  }
  const missing = await send({ body: CASES["mc (H5)"].body, backend: db(undefined), env: ON });
  assert.equal(missing.status, 500);
  assert.deepEqual(rpcs(missing), []);
});

test("ON: ownership is still checked FIRST — a foreign round is 403 whatever activation_no says", async () => {
  assert.ok(INSTANCES["foreign-1"]);
  const r = await send({ body: { question_instance_id: "foreign-1", answer: "a", activation_no: 9 }, backend: db(0), env: ON });
  assert.equal(r.status, 403);
  assert.deepEqual(rpcs(r), []);
});

// THE ATOMIC HALF (TOCTOU): the answer call carries the activation the read check accepted, and the trigger's LQ410 (the
// round was resumed between the read and the answer function's UPDATE) becomes the same 409 on every path. The database
// half — the trigger compares the header with the LOCKED row — is proven in course-round-stale-tab-migrations-run.
const answerClients = (r) => r.calls.filter((c) => c.createClient === "admin" && c.activation !== undefined).map((c) => c.activation);
const STALE_DB = { code: "LQ410", message: "stale_activation", details: "The answer belongs to an earlier activation of the round." };
const LONG = { question_instance_id: "long-1", answer: Array.from({ length: 25 }, (_, i) => "ord" + i).join(" ") };

test("ON: every answer call (four answer RPCs and the long save) runs on a client carrying the checked activation; OFF: none does", async () => {
  for (const [name, c] of Object.entries(CASES)) {
    const on = await send({ body: { ...c.body, activation_no: 2 }, backend: db(2), env: ON });
    assert.equal(on.status, 200, `${name}: ${on.body}`);
    assert.deepEqual(answerClients(on), ["2"], `${name}: exactly one client with the header — the answer call's`);
    const idx = on.calls.findIndex((x) => x.activation === "2");
    assert.equal(on.calls.slice(idx + 1).find((x) => x.kind === "rpc")?.name, c.rpc, `${name}: that client makes the answer call`);
    const off = await send({ body: c.body, backend: db(2), env: { [COURSE_PARKING_ENV]: undefined } });
    assert.deepEqual(answerClients(off), [], `${name}: off — no header anywhere`);
  }
  const long = await send({ body: { ...LONG, activation_no: 0 }, backend: db(0), env: ON });
  assert.equal(long.status, 200, long.body);
  assert.deepEqual(answerClients(long), ["0"], "the long save carries it too");
});

test("ON: the trigger's LQ410 (resumed between read check and answer) is 409 stale_activation on all four paths and the long save — never a 500", async () => {
  for (const [name, c] of Object.entries(CASES)) {
    const backend = (kind, n, ops, client, base) => (kind === "rpc" && n === c.rpc ? { data: null, error: STALE_DB } : db(0)(kind, n, ops, client, base));
    const r = await send({ body: { ...c.body, activation_no: 0 }, backend, env: ON });
    assert.equal(r.status, 409, `${name}: ${r.body}`);
    assert.deepEqual(r.json, { outcome: "stale_activation", error: "Stale activation" }, name);
    assert.ok(r.logs.some((l) => l.includes("FLOW: STALE ACTIVATION (atomic)")), name);
    assert.deepEqual(r.calls.filter((x) => x.kind === "from" && x.ops.some((o) => o[0] === "update")), [], `${name}: nothing written after the refusal`);
  }
  const isSave = (kind, n, ops) => kind === "from" && n === "question_instances" && ops.some((o) => o[0] === "update");
  const longBackend = (kind, n, ops, client, base) => (isSave(kind, n, ops) ? { data: null, error: STALE_DB } : db(0)(kind, n, ops, client, base));
  const long = await send({ body: { ...LONG, activation_no: 0 }, backend: longBackend, env: ON });
  assert.equal(long.status, 409, long.body);
  assert.deepEqual(long.json, { outcome: "stale_activation", error: "Stale activation" });
});

test("round-activation.ts: the atomic half's helpers", () => {
  assert.equal(ACTIVATION_HEADER, "x-laerlig-activation-no");
  assert.deepEqual(activationClientHeaders(0), { "x-laerlig-activation-no": "0" });
  assert.deepEqual(activationClientHeaders(7), { "x-laerlig-activation-no": "7" });
  for (const bad of [undefined, null, -1, "1", 1.5]) assert.throws(() => activationClientHeaders(bad), String(bad));
  assert.equal(isStaleActivationError(STALE_DB), true);
  assert.equal(isStaleActivationError({ code: "LQ410" }), true);
  for (const other of [null, undefined, "LQ410", { code: "LQ409", message: "course_round_parked" }, { code: "23505" }]) {
    assert.equal(isStaleActivationError(other), false, JSON.stringify(other));
  }
});

test("round-activation.ts: the verdict, strictly", () => {
  assert.deepEqual(activationVerdict(undefined, 0), { kind: "accept" });
  assert.deepEqual(activationVerdict(null, 0), { kind: "accept" });
  assert.deepEqual(activationVerdict(0, 0), { kind: "accept" });
  assert.deepEqual(activationVerdict(4, 4), { kind: "accept" });
  assert.deepEqual(activationVerdict(undefined, 1), { kind: "stale", expected: 1, given: null });
  assert.deepEqual(activationVerdict(0, 1), { kind: "stale", expected: 1, given: 0 });
  assert.deepEqual(activationVerdict(2, 1), { kind: "stale", expected: 1, given: 2 });
  assert.deepEqual(activationVerdict(1, 0), { kind: "stale", expected: 0, given: 1 });
  for (const row of [undefined, null, -1, "0", 1.5]) assert.deepEqual(activationVerdict(0, row), { kind: "server_fault" }, String(row));
  for (const g of ["1", -1, 1.5, {}, false]) assert.deepEqual(activationVerdict(g, 1), { kind: "invalid" }, JSON.stringify(g));
  assert.deepEqual(staleActivationReply(), { status: 409, body: { outcome: "stale_activation", error: "Stale activation" } });
});
