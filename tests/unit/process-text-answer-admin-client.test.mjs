// Security: process_text_answer is called only through process-event's backend admin client.
//
// process_text_answer trusts p_user_id and p_is_correct. While `authenticated` may EXECUTE it, a
// pupil can call it straight through the public REST endpoint with p_is_correct = true. This change
// is the Edge half of the fix: process-event keeps the pupil's client for auth, the instance read
// and every other path, and makes ONLY this RPC through an admin client built from serviceKey().
// The later D-110 migration revokes EXECUTE from PUBLIC, anon and authenticated.
//
// The privileged logic lives in supabase/functions/process-event/text-answer-rpc.ts, which has no
// Deno or network imports, so it is imported and exercised here directly. index.ts itself is a Deno
// entrypoint with URL imports, so its wiring is pinned at source level.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  ADMIN_CLIENT_OPTIONS,
  isInstanceOwner,
  callProcessTextAnswer,
} from "../../supabase/functions/process-event/text-answer-rpc.ts";

const INDEX = readFileSync(new URL("../../supabase/functions/process-event/index.ts", import.meta.url), "utf8");
const RPC_MODULE = readFileSync(new URL("../../supabase/functions/process-event/text-answer-rpc.ts", import.meta.url), "utf8");

// Source without comments, so a regex can never be satisfied by an explanation.
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const INDEX_CODE = code(INDEX);

const between = (src, from, to) => {
  const a = src.indexOf(from);
  const b = src.indexOf(to, a + from.length);
  assert.ok(a >= 0, `marker not found: ${from}`);
  assert.ok(b > a, `marker not found after ${from}: ${to}`);
  return src.slice(a, b);
};
const PATH_LONG = between(INDEX_CODE, 'if (answerType === "long")', 'if (format.includes("text"))');
const PATH_TEXT = between(INDEX_CODE, 'if (format.includes("text"))', 'console.log("FLOW: MC/NUMBER');
const PATH_MC = INDEX_CODE.slice(INDEX_CODE.indexOf('console.log("FLOW: MC/NUMBER'));

function spyClient(result = { data: "rewarded", error: null }) {
  const calls = [];
  return { calls, rpc: async (fn, args) => { calls.push({ fn, args }); return result; } };
}

const AWARD = {
  instanceId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  answer: "blåbær",
  isCorrect: true,
};

// ── The privileged module, exercised directly ────────────────────────────────────────────────────
test("process_text_answer is called on the admin client with exactly the server-side values", async () => {
  const admin = spyClient();
  const res = await callProcessTextAnswer(() => admin, AWARD);
  assert.deepEqual(res, { data: "rewarded", error: null });
  assert.deepEqual(admin.calls, [{
    fn: "process_text_answer",
    args: {
      p_instance_id: AWARD.instanceId,
      p_user_id: AWARD.userId,
      p_user_answer: "blåbær",
      p_is_correct: true,
    },
  }]);
});

test("p_is_correct is true only for the boolean true — a truthy non-boolean never awards", async () => {
  for (const isCorrect of [false, "true", 1, "yes", {}, null, undefined]) {
    const admin = spyClient();
    await callProcessTextAnswer(() => admin, { ...AWARD, isCorrect });
    assert.equal(admin.calls[0].args.p_is_correct, false, `isCorrect=${String(isCorrect)}`);
  }
});

test("the admin client is built only when the RPC is made, and exactly once", async () => {
  let built = 0;
  const admin = spyClient();
  await callProcessTextAnswer(() => { built++; return admin; }, AWARD);
  assert.equal(built, 1);
});

test("a serviceKey() failure propagates — there is no fallback to any other client", async () => {
  const userClient = spyClient();
  await assert.rejects(
    callProcessTextAnswer(() => { throw new Error("No privileged Supabase key available"); }, AWARD),
    /No privileged Supabase key available/,
  );
  assert.equal(userClient.calls.length, 0);
  // The module has no parameter through which a user client could even be supplied.
  assert.equal(callProcessTextAnswer.length, 2);
});

test("the admin client options carry no headers and never keep a session", () => {
  assert.deepEqual(ADMIN_CLIENT_OPTIONS, { auth: { persistSession: false, autoRefreshToken: false } });
  assert.equal("global" in ADMIN_CLIENT_OPTIONS, false, "no global headers — the pupil's Authorization must not reach it");
  assert.ok(Object.isFrozen(ADMIN_CLIENT_OPTIONS) && Object.isFrozen(ADMIN_CLIENT_OPTIONS.auth));
});

test("ownership: only the signed-in pupil's own instance passes", () => {
  const me = AWARD.userId;
  assert.equal(isInstanceOwner(me, me), true);
  assert.equal(isInstanceOwner("33333333-3333-4333-8333-333333333333", me), false, "a teacher reading a pupil's instance");
  for (const bad of [null, undefined, "", 42, {}]) {
    assert.equal(isInstanceOwner(bad, me), false, `student_id=${String(bad)}`);
    assert.equal(isInstanceOwner(me, bad), false, `user.id=${String(bad)}`);
  }
  assert.equal(isInstanceOwner("", ""), false);
});

test("the privileged module has no Deno, env or network access of its own", () => {
  const src = code(RPC_MODULE);
  assert.equal(/\bDeno\b|\bimport\b|\bfetch\(|Authorization/.test(src), false);
});

// ── index.ts wiring (source level) ──────────────────────────────────────────────────────────────
test("index.ts imports the key helpers and the privileged module", () => {
  assert.match(INDEX_CODE, /import \{ publishableKey, serviceKey, serviceKeySource \} from "\.\.\/_shared\/supabase-keys\.ts";/);
  assert.match(INDEX_CODE, /import \{ ADMIN_CLIENT_OPTIONS, isInstanceOwner, callProcessTextAnswer \} from "\.\/text-answer-rpc\.ts";/);
});

test("the user client is unchanged: publishable key + the pupil's Authorization header", () => {
  assert.match(INDEX_CODE, /const supabase = createClient\(\s*Deno\.env\.get\("SUPABASE_URL"\)!,\s*publishableKey\(\),\s*\{ global: \{ headers: \{ Authorization: req\.headers\.get\("Authorization"\)! \} \} \}\s*\)/);
});

test("auth and the instance read stay on the user client, and the read includes student_id", () => {
  assert.match(INDEX_CODE, /await supabase\.auth\.getUser\(\)/);
  const read = between(INDEX_CODE, "const { data: instanceData, error: instanceError } = await supabase", ".maybeSingle()");
  assert.match(read, /\.from\("question_instances"\)/);
  assert.match(read, /student_id,/);
});

test("the ownership check returns 403 and runs before every answer path", () => {
  const check = INDEX_CODE.indexOf("if (!isInstanceOwner(instanceData.student_id, user.id))");
  assert.ok(check > INDEX_CODE.indexOf(".maybeSingle()"), "after the instance is read");
  for (const marker of ['if (answerType === "long")', 'if (format.includes("text"))', '"process_question_attempt"']) {
    assert.ok(check < INDEX_CODE.indexOf(marker), `before ${marker}`);
  }
  const block = INDEX_CODE.slice(check, INDEX_CODE.indexOf("}", INDEX_CODE.indexOf("status: 403", check)) + 1);
  assert.match(block, /JSON\.stringify\(\{ error: "Forbidden" \}\)/);
  assert.match(block, /status: 403/);
});

test("the admin client is built only on the short-text path, from serviceKey(), with no headers", () => {
  const adminBuilds = INDEX_CODE.match(/createClient\(Deno\.env\.get\("SUPABASE_URL"\)!, serviceKey\(\), ADMIN_CLIENT_OPTIONS\)/g) ?? [];
  assert.equal(adminBuilds.length, 1);
  assert.ok(PATH_TEXT.includes('createClient(Deno.env.get("SUPABASE_URL")!, serviceKey(), ADMIN_CLIENT_OPTIONS)'));
  assert.equal((INDEX_CODE.match(/serviceKey\(\)/g) ?? []).length, 1, "serviceKey() is resolved in exactly one place");
});

test("process_text_answer is never called on the user client", () => {
  assert.equal(/supabase\s*\.rpc\(\s*["']process_text_answer["']/.test(INDEX_CODE), false);
  assert.match(PATH_TEXT, /await callProcessTextAnswer\(/);
});

test("p_user_id comes only from user.id, p_is_correct only from isTextAnswerCorrect", () => {
  assert.match(PATH_TEXT, /const isCorrect = isTextAnswerCorrect\(answer, correct_answer, questionContent\?\.accepted_answers\)/);
  assert.match(PATH_TEXT, /userId:\s+user\.id,/);
  assert.match(PATH_TEXT, /isCorrect,/);
  // The body yields exactly three fields; nothing identity- or verdict-shaped is read from it.
  assert.match(INDEX_CODE, /const \{ question_instance_id, answer, question_shown_at \} = body/);
  assert.equal(/body\??\.(p_user_id|p_is_correct|is_correct|isCorrect|student_id|user_id)/.test(INDEX_CODE), false);
});

test("a key failure on the short-text path is a visible 500 — no user-client fallback", () => {
  const handler = between(PATH_TEXT, "} catch (keyError: any) {", "if (rpcError)");
  assert.match(handler, /console\.error\("ADMIN CLIENT ERROR:", keyError\?\.message \?\? keyError\)/);
  assert.match(handler, /JSON\.stringify\(\{ error: "Server configuration error" \}\)/);
  assert.match(handler, /status: 500/);
  assert.equal(/supabase\.rpc|\.rpc\(/.test(handler), false);
});

test("the deploy diagnostic logs only serviceKeySource(), never a key", () => {
  assert.match(INDEX_CODE, /console\.log\(`\[process-event\] service-key source=\$\{serviceKeySource\(\)\}`\)/);
  for (const line of INDEX_CODE.split("\n").filter((l) => /console\.(log|error|warn)/.test(l))) {
    assert.equal(/serviceKey\(\)|publishableKey\(\)|SERVICE_ROLE_KEY|SECRET_KEYS|ANON_KEY/.test(line), false, line.trim());
  }
});

test("MC / number still go through process_question_attempt on the user client, unchanged", () => {
  assert.match(PATH_MC, /await supabase\.rpc\(\s*"process_question_attempt",\s*\{\s*p_student_id:\s+user\.id,\s*p_question_instance_id:\s+question_instance_id,\s*p_answer:\s+answer,\s*p_question_shown_at:\s+question_shown_at \?\? Date\.now\(\)\s*\}\s*\)/);
  assert.equal(/callProcessTextAnswer|serviceKey|ADMIN_CLIENT_OPTIONS/.test(PATH_MC), false);
  assert.match(PATH_MC, /\.update\(\{ next_review_at: nextReviewAt\.toISOString\(\) \}\)/);
});

test("the long-answer path is unchanged and never uses the admin client", () => {
  assert.match(PATH_LONG, /if \(words < 20\)/);
  assert.match(PATH_LONG, /await supabase\s*\.from\("question_instances"\)\s*\.update\(\{ user_answer: answer \}\)/);
  assert.match(PATH_LONG, /JSON\.stringify\(\{ status: "pending", correct_answer: null, review_text: null \}\)/);
  assert.equal(/callProcessTextAnswer|serviceKey|ADMIN_CLIENT_OPTIONS/.test(PATH_LONG), false);
  assert.ok(INDEX_CODE.indexOf('if (answerType === "long")') < INDEX_CODE.indexOf('if (format.includes("text"))'),
    "the long check still comes first");
});

test("the short-text response shape is unchanged", () => {
  assert.match(PATH_TEXT, /status: isCorrect \? "correct" : "incorrect",\s*correct_answer,\s*review_text: isCorrect \? null : reviewText,\s*misconception_type: isCorrect \? null : misconceptionType,/);
});
