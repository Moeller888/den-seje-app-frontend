// D-384 i process-event (supabase/functions/process-event/round-parked.ts): databasens afvisning af et svar på en
// PARKERET kursusrunde (SQLSTATE LQ409 fra triggeren question_instances_parked_guard, migration 20261124160000) bliver
// et kontrolleret 409 round_parked på alle fire svarveje — aldrig en generisk 500, aldrig et forsøg på en anden vej og
// ingen skrivning bagefter. Og browseren (js/answer-submission.js) viser det som en afvisning med dansk tekst.
// Kører den RIGTIGE index.ts gennem tests/unit/helpers/process-event-harness.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadHandler, runCase } from "./helpers/process-event-harness.mjs";
import {
  isRoundParkedError, roundParkedReply, ROUND_PARKED_SQLSTATE, ROUND_PARKED_MESSAGE,
} from "../../supabase/functions/process-event/round-parked.ts";
import { classifyResponse, REFUSAL_STATUS, REFUSAL_TEXT } from "../../js/answer-submission.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const loaded = loadHandler(join(ROOT, "supabase", "functions", "process-event", "index.ts"));
loaded.catch(() => {});

const SUB = "6f1c2a9e-4b7d-4e2a-9c3f-0d8b5e7a1c24";
// Det, PostgREST giver videre fra RAISE 'course_round_parked' USING ERRCODE = 'LQ409'.
const DB_PARKED = Object.freeze({ code: "LQ409", message: "course_round_parked", details: "The course round is parked; it is resumed inside its course. Nothing was recorded.", hint: null });
const ANSWER_RPCS = ["process_question_attempt", "process_text_answer", "process_question_attempt_v2", "process_text_answer_v2"];
const failsWith = (error) => (kind, name, ops, client, base) =>
  kind === "rpc" && ANSWER_RPCS.includes(name) ? { data: null, error } : base;

async function send(c) {
  const r = await runCase(await loaded, c);
  return { ...r, json: JSON.parse(r.body) };
}
const rpcs = (r) => r.calls.filter((c) => c.kind === "rpc").map((c) => c.name);
const writes = (r) => r.calls.filter((c) => c.kind === "from" && c.ops.some((o) => o[0] === "update"));

const CASES = {
  "mc (gammel vej)": { body: { question_instance_id: "mc-1", answer: "b" }, rpc: "process_question_attempt" },
  "tal (gammel vej)": { body: { question_instance_id: "num-1", answer: "7" }, rpc: "process_question_attempt" },
  "kort tekst (gammel vej)": { body: { question_instance_id: "txt-1", answer: "Rom" }, rpc: "process_text_answer" },
  "mc (H5)": { body: { question_instance_id: "mc-1", answer: "b", round_no: 1, submission_id: SUB }, rpc: "process_question_attempt_v2" },
  "kort tekst (H5)": { body: { question_instance_id: "txt-1", answer: "Rom", round_no: 1, submission_id: SUB }, rpc: "process_text_answer_v2" },
};

test("et svar på en parkeret runde → 409 round_parked på alle svarveje; ét RPC-kald, ingen skrivning bagefter", async () => {
  for (const [name, c] of Object.entries(CASES)) {
    const r = await send({ body: c.body, backend: failsWith(DB_PARKED) });
    assert.equal(r.status, 409, name);
    assert.deepEqual(r.json, { outcome: "round_parked", error: "Round parked" }, name);
    assert.deepEqual(rpcs(r), [c.rpc], `${name}: ingen anden svarvej forsøges`);
    assert.deepEqual(writes(r), [], `${name}: hverken misconception- eller next_review_at-skrivning`);
  }
});

test("andre databasefejl behandles uændret (ikke som parkering)", async () => {
  // En almindelig CHECK-fejl (23514) er IKKE en parkering: den forbliver en 500 som før.
  const other = { code: "23514", message: "new row violates check constraint \"x\"", details: null, hint: null };
  const legacy = await send({ body: CASES["mc (gammel vej)"].body, backend: failsWith(other) });
  assert.equal(legacy.status, 500);
  const h5 = await send({ body: CASES["mc (H5)"].body, backend: failsWith(other) });
  assert.equal(h5.status, 500);
  assert.deepEqual(h5.json, { error: "Could not process answer" });
});

test("round-parked.ts: genkendelse og svar", () => {
  assert.equal(ROUND_PARKED_SQLSTATE, "LQ409");
  assert.equal(ROUND_PARKED_MESSAGE, "course_round_parked");
  assert.equal(isRoundParkedError(DB_PARKED), true);
  assert.equal(isRoundParkedError({ code: "LQ409" }), true);
  assert.equal(isRoundParkedError({ message: "course_round_parked" }), true);
  for (const e of [null, undefined, "LQ409", {}, { code: "LQ429", message: "quiz_cooldown_active" }, { code: "23514" }, { message: "course_round_parked_x" }]) {
    assert.equal(isRoundParkedError(e), false, JSON.stringify(e));
  }
  assert.deepEqual(roundParkedReply(), { status: 409, body: { outcome: "round_parked", error: "Round parked" } });
});

test("browseren: 409 round_parked er en afvisning med dansk tekst (ingen 'Send igen', intet rigtigt/forkert)", async () => {
  assert.equal(REFUSAL_STATUS.round_parked, 409);
  assert.match(REFUSAL_TEXT.round_parked, /pause/);
  assert.match(REFUSAL_TEXT.round_parked, /forløbet/);
  const error = { name: "FunctionsHttpError", context: new Response(JSON.stringify({ outcome: "round_parked", error: "Round parked" }), { status: 409 }) };
  const kind = await classifyResponse({ data: null, error }, { submission_id: SUB });
  assert.deepEqual(kind, { kind: "refused", outcome: "round_parked", reason: null });
});
