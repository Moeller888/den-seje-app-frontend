// Security: MC / number answers reach process_question_attempt only through process-event's backend
// admin client (process-event v31) — the Edge half before the D-110 revoke of that RPC.
//
// process_question_attempt evaluates the answer itself and awards XP/coins, streak and quests, but it
// takes p_student_id as a parameter. While anon/authenticated hold EXECUTE, anyone who knows a pupil's
// id and one of their instance ids can answer for them. process-event already checks ownership; this
// moves the RPC onto the admin client so EXECUTE can later be revoked from the API roles.
//
// The RPC wrapper lives in supabase/functions/process-event/text-answer-rpc.ts (no Deno or network
// imports) and is exercised here directly; index.ts wiring is pinned in
// process-text-answer-admin-client.test.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { callProcessQuestionAttempt, callProcessTextAnswer, isInstanceOwner } from "../../supabase/functions/process-event/text-answer-rpc.ts";

const INDEX = readFileSync(new URL("../../supabase/functions/process-event/index.ts", import.meta.url), "utf8");
const INDEX_CODE = INDEX.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

function spyClient(result = { data: { status: "correct", correct_answer: "1945" }, error: null }) {
  const calls = [];
  return { calls, rpc: async (fn, args) => { calls.push({ fn, args }); return result; } };
}

const ATTEMPT = {
  studentId: "22222222-2222-4222-8222-222222222222",
  instanceId: "11111111-1111-4111-8111-111111111111",
  answer: "1945",
  questionShownAt: 1791100000000,
};

test("process_question_attempt is called on the admin client with exactly the server-side values", async () => {
  const admin = spyClient();
  const res = await callProcessQuestionAttempt(() => admin, ATTEMPT);
  assert.deepEqual(res, { data: { status: "correct", correct_answer: "1945" }, error: null });
  assert.deepEqual(admin.calls, [{
    fn: "process_question_attempt",
    args: {
      p_student_id: ATTEMPT.studentId,
      p_question_instance_id: ATTEMPT.instanceId,
      p_answer: "1945",
      p_question_shown_at: 1791100000000,
    },
  }]);
});

test("p_student_id is exactly the studentId given by the caller (index.ts passes the verified user.id)", async () => {
  const admin = spyClient();
  await callProcessQuestionAttempt(() => admin, { ...ATTEMPT, studentId: "33333333-3333-4333-8333-333333333333" });
  assert.equal(admin.calls[0].args.p_student_id, "33333333-3333-4333-8333-333333333333");
  // …and index.ts gives it user.id, never a request field.
  assert.match(INDEX_CODE, /studentId:\s+user\.id,/);
  assert.equal(/body\??\.(student_id|p_student_id|studentId)/.test(INDEX_CODE), false);
});

test("p_answer is passed through untouched — the database function evaluates it", async () => {
  for (const answer of ["1945", " 1945 ", "Østrig-Ungarn", "år", "Karl den Store"]) {
    const admin = spyClient();
    await callProcessQuestionAttempt(() => admin, { ...ATTEMPT, answer });
    assert.equal(admin.calls[0].args.p_answer, answer, JSON.stringify(answer));
  }
});

test("p_question_shown_at is passed through; index.ts falls back to the server's Date.now()", async () => {
  const admin = spyClient();
  await callProcessQuestionAttempt(() => admin, { ...ATTEMPT, questionShownAt: 42 });
  assert.equal(admin.calls[0].args.p_question_shown_at, 42);
  assert.match(INDEX_CODE, /questionShownAt:\s+question_shown_at \?\? Date\.now\(\),/);
});

test("the admin client is built only when the RPC is made, exactly once", async () => {
  let built = 0;
  const admin = spyClient();
  await callProcessQuestionAttempt(() => { built++; return admin; }, ATTEMPT);
  assert.equal(built, 1);
  assert.equal(admin.calls.length, 1);
});

test("a serviceKey() failure propagates — there is no fallback to any other client", async () => {
  await assert.rejects(
    callProcessQuestionAttempt(() => { throw new Error("No privileged Supabase key available"); }, ATTEMPT),
    /No privileged Supabase key available/,
  );
  assert.equal(callProcessQuestionAttempt.length, 2, "no parameter through which a user client could be supplied");
});

test("an RPC error is returned to the caller unchanged (index.ts keeps its RPC ERROR → 500 path)", async () => {
  const err = { message: "Instance not found", code: "P0001" };
  const res = await callProcessQuestionAttempt(() => spyClient({ data: null, error: err }), ATTEMPT);
  assert.deepEqual(res, { data: null, error: err });
});

test("idempotency stays the database function's job: the wrapper adds no state and no retry", async () => {
  // Two submits of the same instance are two RPC calls; whether the second awards anything is decided
  // by process_question_attempt's `answered = false` guard, not here.
  const admin = spyClient({ data: { status: "correct", correct_answer: "1945" }, error: null });
  await callProcessQuestionAttempt(() => admin, ATTEMPT);
  await callProcessQuestionAttempt(() => admin, ATTEMPT);
  assert.equal(admin.calls.length, 2);
  assert.deepEqual(admin.calls[0], admin.calls[1]);
  const src = readFileSync(new URL("../../supabase/functions/process-event/text-answer-rpc.ts", import.meta.url), "utf8")
    .replace(/\/\/.*$/gm, "");
  const body = src.slice(src.indexOf("export async function callProcessQuestionAttempt"));
  assert.equal(/answered|retry|setTimeout|cache|Map\(|Set\(/.test(body), false);
});

test("a foreign instance is rejected with 403 before the admin call", () => {
  assert.equal(isInstanceOwner("33333333-3333-4333-8333-333333333333", ATTEMPT.studentId), false);
  const ownership = INDEX_CODE.indexOf("if (!isInstanceOwner(instanceData.student_id, user.id))");
  const mcCall = INDEX_CODE.indexOf("await callProcessQuestionAttempt(");
  assert.ok(ownership > 0 && mcCall > ownership, "ownership check precedes the MC/number RPC");
  assert.match(INDEX_CODE.slice(ownership, mcCall), /status: 403/);
});

test("the short-text admin path is unchanged", async () => {
  const admin = spyClient({ data: "rewarded", error: null });
  await callProcessTextAnswer(() => admin, { instanceId: ATTEMPT.instanceId, userId: ATTEMPT.studentId, answer: "x", isCorrect: true });
  assert.deepEqual(admin.calls[0], {
    fn: "process_text_answer",
    args: { p_instance_id: ATTEMPT.instanceId, p_user_id: ATTEMPT.studentId, p_user_answer: "x", p_is_correct: true },
  });
});
