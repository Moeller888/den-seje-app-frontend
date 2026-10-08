// process-event: server-owned question_instances writes (long-answer save, misconception signal).
//
// question_instances has no UPDATE policy, so the pupil's client updated 0 rows and PostgREST called
// it success: misconception_signal was never stored (0 rows ever) and a long answer would have been
// lost. These writes now go through the backend admin client after the ownership check, scoped to
// id + student_id, and the touched row count is proven. Pupils get no UPDATE policy.
//
// instance-writes.ts has no Deno or network imports and is exercised directly; index.ts wiring is
// pinned at source level (same arrangement as process-text-answer-admin-client.test.mjs).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { updateOwnInstance, recordMisconceptionSignal } from "../../supabase/functions/process-event/instance-writes.ts";
import { ADMIN_CLIENT_OPTIONS } from "../../supabase/functions/process-event/text-answer-rpc.ts";

const INDEX = readFileSync(new URL("../../supabase/functions/process-event/index.ts", import.meta.url), "utf8");
const MODULE = readFileSync(new URL("../../supabase/functions/process-event/instance-writes.ts", import.meta.url), "utf8");
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const INDEX_CODE = code(INDEX);
const between = (src, from, to) => {
  const a = src.indexOf(from);
  const b = src.indexOf(to, a + from.length);
  assert.ok(a >= 0 && b > a, `markers ${from} … ${to}`);
  return src.slice(a, b);
};
const PATH_LONG = between(INDEX_CODE, 'if (answerType === "long")', 'if (format.includes("text"))');
const PATH_TEXT = between(INDEX_CODE, 'if (format.includes("text"))', 'console.log("FLOW: MC/NUMBER');
const PATH_MC = INDEX_CODE.slice(INDEX_CODE.indexOf('console.log("FLOW: MC/NUMBER'));

const SCOPE = {
  instanceId: "11111111-1111-4111-8111-111111111111",
  studentId: "22222222-2222-4222-8222-222222222222",
};

// A spy admin client that records the full update chain and returns a chosen response.
function spyAdmin(response = { data: [{ id: SCOPE.instanceId }], error: null }) {
  const calls = [];
  return {
    calls,
    from(table) {
      const call = { table, values: null, filters: [], select: null };
      calls.push(call);
      return {
        update(values) {
          call.values = values;
          const chain = {
            eq(column, value) { call.filters.push([column, value]); return chain; },
            select(columns) { call.select = columns; return Promise.resolve(response); },
          };
          return chain;
        },
      };
    },
  };
}
const silent = () => {};

// ── updateOwnInstance: scope and row-count proof ────────────────────────────────────────────────
test("the update is scoped to BOTH the instance id and the verified student id, and returns ids", async () => {
  const admin = spyAdmin();
  const res = await updateOwnInstance(() => admin, SCOPE, { user_answer: "svar" });
  assert.deepEqual(res, { ok: true, rows: 1 });
  assert.deepEqual(admin.calls, [{
    table: "question_instances",
    values: { user_answer: "svar" },
    filters: [["id", SCOPE.instanceId], ["student_id", SCOPE.studentId]],
    select: "id",
  }]);
});

test("exactly one row is success; zero rows, several rows, a DB error or an odd response are failures", async () => {
  const cases = [
    [{ data: [], error: null }, { ok: false, reason: "no_row", rows: 0, code: null }],
    [{ data: [{ id: "a" }, { id: "b" }], error: null }, { ok: false, reason: "multiple_rows", rows: 2, code: null }],
    [{ data: null, error: { code: "42501", message: "permission denied" } }, { ok: false, reason: "db_error", rows: null, code: "42501" }],
    [{ data: null, error: null }, { ok: false, reason: "unexpected_result", rows: null, code: null }],
    [{ data: { id: "a" }, error: null }, { ok: false, reason: "unexpected_result", rows: null, code: null }],
  ];
  for (const [response, expected] of cases) {
    assert.deepEqual(await updateOwnInstance(() => spyAdmin(response), SCOPE, { user_answer: "x" }), expected,
      JSON.stringify(response));
  }
});

test("error === null alone is never taken as success", async () => {
  const res = await updateOwnInstance(() => spyAdmin({ data: [], error: null }), SCOPE, { user_answer: "x" });
  assert.equal(res.ok, false);
});

test("a missing id, student id or value is refused before any client is built", async () => {
  let built = 0;
  const make = () => { built++; return spyAdmin(); };
  for (const [scope, values] of [
    [{ ...SCOPE, instanceId: "" }, { user_answer: "x" }],
    [{ ...SCOPE, studentId: "" }, { user_answer: "x" }],
    [{ ...SCOPE, studentId: undefined }, { user_answer: "x" }],
    [SCOPE, {}],
    [SCOPE, { misconception_signal: undefined }],
  ]) {
    assert.deepEqual(await updateOwnInstance(make, scope, values), { ok: false, reason: "invalid_scope", rows: null, code: null });
  }
  assert.equal(built, 0);
});

test("a key/config failure propagates from updateOwnInstance — no fallback client exists", async () => {
  await assert.rejects(
    updateOwnInstance(() => { throw new Error("No privileged Supabase key available"); }, SCOPE, { user_answer: "x" }),
    /No privileged Supabase key available/,
  );
  assert.equal(updateOwnInstance.length, 3, "no parameter through which a user client could be supplied");
});

test("the module has no Deno, env, network or Authorization access of its own", () => {
  assert.equal(/\bDeno\b|\bimport\b|\bfetch\(|Authorization|serviceKey|publishableKey/.test(code(MODULE)), false);
});

test("the admin client options carry no pupil Authorization header", () => {
  assert.equal("global" in ADMIN_CLIENT_OPTIONS, false);
  assert.match(INDEX_CODE, /function makeAdminClient\(\) \{\s*return createClient\(Deno\.env\.get\("SUPABASE_URL"\)!, serviceKey\(\), ADMIN_CLIENT_OPTIONS\)\s*\}/);
});

// ── recordMisconceptionSignal: non-fatal, never silent ──────────────────────────────────────────
test("misconception: one row → success, nothing logged", async () => {
  const logs = [];
  const admin = spyAdmin();
  const res = await recordMisconceptionSignal(() => admin, { ...SCOPE, signal: "causal_inversion" }, (...a) => logs.push(a));
  assert.deepEqual(res, { ok: true, rows: 1 });
  assert.deepEqual(admin.calls[0].values, { misconception_signal: "causal_inversion" });
  assert.deepEqual(admin.calls[0].filters, [["id", SCOPE.instanceId], ["student_id", SCOPE.studentId]]);
  assert.equal(logs.length, 0);
});

for (const [label, response, reason] of [
  ["0 rows", { data: [], error: null }, "no_row"],
  ["a DB error", { data: null, error: { code: "PGRST301", message: "boom" } }, "db_error"],
  ["several rows", { data: [{ id: "a" }, { id: "b" }], error: null }, "multiple_rows"],
]) {
  test(`misconception: ${label} → one structured log line, no throw`, async () => {
    const logs = [];
    const res = await recordMisconceptionSignal(() => spyAdmin(response), { ...SCOPE, signal: "s" }, (...a) => logs.push(a));
    assert.equal(res.ok, false);
    assert.equal(res.reason, reason);
    assert.equal(logs.length, 1);
    assert.equal(logs[0][0], "INSTANCE WRITE FAILED:");
    const detail = JSON.parse(logs[0][1]);
    assert.equal(detail.field, "misconception_signal");
    assert.equal(detail.instance_id, SCOPE.instanceId);
    assert.equal(detail.reason, reason);
    assert.equal(detail.fatal, false);
    assert.equal(JSON.stringify(detail).includes(SCOPE.studentId), false, "no user id in the log");
  });
}

test("misconception: a key/config failure is logged, never thrown, and no other client is tried", async () => {
  const logs = [];
  const res = await recordMisconceptionSignal(() => { throw new Error("No privileged Supabase key available"); },
    { ...SCOPE, signal: "s" }, (...a) => logs.push(a));
  assert.deepEqual(res, { ok: false, reason: "admin_client_error", rows: null, code: null });
  assert.equal(JSON.parse(logs[0][1]).reason, "admin_client_error");
  assert.equal(logs[0][1].includes("No privileged"), false, "no key-resolver text in the log");
});

test("misconception: no retry — one write attempt per call", async () => {
  const admin = spyAdmin({ data: [], error: null });
  await recordMisconceptionSignal(() => admin, { ...SCOPE, signal: "s" }, silent);
  assert.equal(admin.calls.length, 1);
  assert.equal(/retry|setTimeout|while\s*\(/.test(code(MODULE)), false);
});

// ── index.ts wiring ─────────────────────────────────────────────────────────────────────────────
test("the ownership check (403) precedes every admin write", () => {
  const check = INDEX_CODE.indexOf("if (!isInstanceOwner(instanceData.student_id, user.id))");
  assert.ok(check > 0);
  for (const marker of ["await updateOwnInstance(", "await recordMisconceptionSignal("]) {
    const at = INDEX_CODE.indexOf(marker);
    assert.ok(at > check, `${marker} after the ownership check`);
  }
  assert.match(INDEX_CODE.slice(check, INDEX_CODE.indexOf('if (answerType === "long")')), /status: 403/);
});

test("both misconception writes use the admin helper with instance id and user.id", () => {
  const call = /await recordMisconceptionSignal\(makeAdminClient, \{\s*instanceId: question_instance_id,\s*studentId:\s+user\.id,\s*signal:\s+misconceptionType,\s*\}\)/;
  assert.match(PATH_TEXT, call);
  assert.match(PATH_MC, call);
  assert.equal(/\.from\("question_instances"\)\s*\.update\(\{ misconception_signal/.test(INDEX_CODE), false);
});

test("a misconception failure never changes the answer response (no early return around it)", () => {
  const text = between(PATH_TEXT, "await recordMisconceptionSignal(", "return new Response(");
  assert.equal(/status: 500|throw\b/.test(text), false);
  assert.match(PATH_TEXT, /status: isCorrect \? "correct" : "incorrect",\s*correct_answer,\s*review_text: isCorrect \? null : reviewText,\s*misconception_type: isCorrect \? null : misconceptionType,/);
  const mc = between(PATH_MC, "await recordMisconceptionSignal(", "return new Response(");
  assert.equal(/status: 500|throw\b/.test(mc), false);
  assert.match(PATH_MC, /status,\s*correct_answer: rpcData\?\.correct_answer \?\? correct_answer,\s*review_text: status === "incorrect" \? reviewText : null,\s*misconception_type: status === "incorrect" \? misconceptionType : null,/);
});

test("long answer: scoped admin save; a failed or 0-row save is a controlled 500, never 'pending'", () => {
  assert.match(PATH_LONG, /saveResult = await updateOwnInstance\(\s*makeAdminClient,\s*\{ instanceId: question_instance_id, studentId: user\.id \},\s*\{ user_answer: answer \}\s*\)/);
  const failure = between(PATH_LONG, "if (!saveResult.ok) {", 'console.log("FLOW: LONG');
  assert.match(failure, /console\.error\("LONG SAVE ERROR:", JSON\.stringify\(\{\s*instance_id: question_instance_id,\s*reason: saveResult\.reason,/);
  assert.match(failure, /JSON\.stringify\(\{ error: "Could not save answer" \}\)/);
  assert.match(failure, /status: 500/);
  assert.ok(PATH_LONG.indexOf("if (!saveResult.ok)") < PATH_LONG.indexOf('status: "pending"'), "pending only after a proven save");
});

test("long answer: a key/config failure is a controlled 500 with no user-client fallback", () => {
  const handler = between(PATH_LONG, "} catch (keyError: any) {", "if (!saveResult.ok)");
  assert.match(handler, /console\.error\("ADMIN CLIENT ERROR:", keyError\?\.message \?\? keyError\)/);
  assert.match(handler, /JSON\.stringify\(\{ error: "Server configuration error" \}\)/);
  assert.match(handler, /status: 500/);
  assert.equal(/supabase\./.test(handler), false);
});

test("the MC/number and short-text award RPC paths are unchanged", () => {
  assert.match(PATH_MC, /await callProcessQuestionAttempt\(\s*makeAdminClient,\s*\{\s*studentId:\s+user\.id,\s*instanceId:\s+question_instance_id,\s*answer,\s*questionShownAt:\s+question_shown_at \?\? Date\.now\(\),\s*\}\s*\)/);
  assert.match(PATH_TEXT, /await callProcessTextAnswer\(\s*makeAdminClient,\s*\{\s*instanceId: question_instance_id,\s*userId:\s+user\.id,\s*answer,\s*isCorrect,\s*\}\s*\)/);
  // The misconception write comes after the award RPC, never before it.
  assert.ok(PATH_MC.indexOf("await callProcessQuestionAttempt(") < PATH_MC.indexOf("await recordMisconceptionSignal("));
  assert.ok(PATH_TEXT.indexOf("await callProcessTextAnswer(") < PATH_TEXT.indexOf("await recordMisconceptionSignal("));
});

test("no reward, XP, coin, repeat, streak or quest logic is touched by the instance writes", () => {
  const forbidden = /\b(xp\w*|coins?|repeat_count|streak\w*|quests?|quest_\w*|answered|was_correct|correct_answer)\b/i;
  assert.equal(forbidden.test(code(MODULE)), false);
  const writes = [...INDEX_CODE.matchAll(/updateOwnInstance\([\s\S]*?\)\s*\n/g)].map((m) => m[0]).join("");
  assert.ok(writes.includes("user_answer"));
  assert.equal(forbidden.test(writes), false);
});

test("next_review_at is left exactly as it was (separate spaced-repetition decision)", () => {
  assert.match(PATH_MC, /const \{ error: reviewError \} = await supabase\s*\.from\("question_instances"\)\s*\.update\(\{ next_review_at: nextReviewAt\.toISOString\(\) \}\)\s*\.eq\("id", question_instance_id\)\s*\.eq\("student_id", user\.id\)/);
  assert.equal(/next_review_at/.test(code(MODULE)), false);
});
