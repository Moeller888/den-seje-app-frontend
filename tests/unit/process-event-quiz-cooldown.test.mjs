// Anti-gætte-pausen i process-event (supabase/functions/process-event/quiz-cooldown.ts): databasens
// afvisning (SQLSTATE LQ429 fra triggeren quiz_cooldown_guard) bliver et kontrolleret 429 på alle fire
// svarveje — aldrig en generisk 500, aldrig et forsøg på en anden vej, og ingen skrivning bagefter.
// Kører den RIGTIGE index.ts gennem tests/unit/helpers/process-event-harness.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadHandler, runCase } from "./helpers/process-event-harness.mjs";
import {
  isQuizCooldownError, cooldownUntilOf, cooldownReply, QUIZ_COOLDOWN_SQLSTATE, QUIZ_COOLDOWN_MESSAGE,
} from "../../supabase/functions/process-event/quiz-cooldown.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const loaded = loadHandler(join(ROOT, "supabase", "functions", "process-event", "index.ts"));
loaded.catch(() => {});

const SUB = "6f1c2a9e-4b7d-4e2a-9c3f-0d8b5e7a1c24";
const UNTIL = "2026-11-05T12:02:00.000Z";
// Det, PostgREST giver videre fra RAISE … USING ERRCODE = 'LQ429', DETAIL = <slut>.
const DB_COOLDOWN = Object.freeze({ code: "LQ429", message: "quiz_cooldown_active", details: UNTIL, hint: null });
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

test("databasens pauseafvisning → 429 quiz_cooldown på alle svarveje; ét RPC-kald, ingen skrivning bagefter", async () => {
  for (const [name, c] of Object.entries(CASES)) {
    const r = await send({ body: c.body, backend: failsWith(DB_COOLDOWN) });
    assert.equal(r.status, 429, name);
    assert.deepEqual(r.json, { outcome: "quiz_cooldown", error: "Quiz cooldown", cooldown_until: "<ts>", server_now: "<ts>" }, name);
    assert.deepEqual(rpcs(r), [c.rpc], `${name}: ingen anden svarvej forsøges`);
    assert.deepEqual(writes(r), [], `${name}: hverken misconception- eller next_review_at-skrivning`);
  }
});

test("svaret afslører hverken tærskel, vindue eller antal fejl", async () => {
  const r = await send({ body: CASES["mc (gammel vej)"].body, backend: failsWith(DB_COOLDOWN) });
  assert.deepEqual(Object.keys(r.json).sort(), ["cooldown_until", "error", "outcome", "server_now"]);
  assert.doesNotMatch(r.body, /\b10\b|\b60\b|forkert|wrong/i);
});

test("andre databasefejl behandles uændret (ikke som pause)", async () => {
  const other = { code: "P0001", message: "Instance not found", details: null, hint: null };
  const legacy = await send({ body: CASES["mc (gammel vej)"].body, backend: failsWith(other) });
  assert.equal(legacy.status, 500);
  assert.deepEqual(legacy.json, { error: "Instance not found" });
  const h5 = await send({ body: CASES["mc (H5)"].body, backend: failsWith(other) });
  assert.equal(h5.status, 500);
  assert.deepEqual(h5.json, { error: "Could not process answer" });
});

test("lange svar rører aldrig pausen (ingen svarfunktion kaldes)", async () => {
  const LONG = Array.from({ length: 25 }, (_, i) => "ord" + i).join(" ");
  const r = await send({ body: { question_instance_id: "long-1", answer: LONG }, backend: failsWith(DB_COOLDOWN) });
  assert.equal(r.status, 200);
  assert.equal(r.json.status, "pending");
  assert.deepEqual(rpcs(r), []);
});

test("quiz-cooldown.ts: genkendelse og sluttidspunkt", () => {
  assert.equal(QUIZ_COOLDOWN_SQLSTATE, "LQ429");
  assert.equal(QUIZ_COOLDOWN_MESSAGE, "quiz_cooldown_active");
  assert.equal(isQuizCooldownError(DB_COOLDOWN), true);
  assert.equal(isQuizCooldownError({ message: "quiz_cooldown_active" }), true);
  assert.equal(isQuizCooldownError({ code: "LQ429" }), true);
  for (const e of [null, undefined, "LQ429", {}, { code: "42501", message: "permission denied" }, { message: "quiz_cooldown_active_x" }]) {
    assert.equal(isQuizCooldownError(e), false, JSON.stringify(e));
  }
  assert.equal(cooldownUntilOf(DB_COOLDOWN), UNTIL);
  assert.equal(cooldownUntilOf({ details: "2026-11-05T12:02:00Z" }), UNTIL);
  for (const details of [null, "", "i morgen", 42]) assert.equal(cooldownUntilOf({ details }), null);
  assert.deepEqual(cooldownReply(DB_COOLDOWN, Date.parse("2026-11-05T12:00:30.000Z")), {
    status: 429,
    body: { outcome: "quiz_cooldown", error: "Quiz cooldown", cooldown_until: UNTIL, server_now: "2026-11-05T12:00:30.000Z" },
  });
});
