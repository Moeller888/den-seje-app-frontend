// Security: a question instance (assignment + answer key) is created only by the server.
//
// A question_instances row carries the key the answer path grades against
// (question_instances.correct_answer, read by process-event for short text and by
// process_question_attempt for MC / number). While pupils could INSERT that row themselves, they
// could choose their own key and be paid for it. This change is the Edge half of the fix:
// get-next-question writes the instance through a backend admin client, with the verified user.id
// and the server-normalised key of a server-chosen question. The D-110 migration
// 20261015120000_question_instances_server_owned_insert.sql then removes INSERT from anon and
// authenticated (proven in question-instances-server-insert-migration-run.test.mjs).
//
// The privileged logic lives in supabase/functions/get-next-question/instance-insert.ts, which has
// no Deno or network imports, so it is imported and exercised here directly. index.ts itself is a
// Deno entrypoint with URL imports, so its wiring is pinned at source level.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  ADMIN_CLIENT_OPTIONS,
  insertQuestionInstance,
} from "../../supabase/functions/get-next-question/instance-insert.ts";

const INDEX = readFileSync(new URL("../../supabase/functions/get-next-question/index.ts", import.meta.url), "utf8");
const MODULE = readFileSync(new URL("../../supabase/functions/get-next-question/instance-insert.ts", import.meta.url), "utf8");

// Source without comments, so a regex can never be satisfied by an explanation.
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const INDEX_CODE = code(INDEX);
const MODULE_CODE = code(MODULE);

function spyClient(result = { data: [{ id: "i-1" }], error: null }) {
  const calls = [];
  const client = {
    from(table) {
      calls.push({ step: "from", table });
      return {
        insert(values) {
          calls.push({ step: "insert", values });
          return {
            select(columns) {
              calls.push({ step: "select", columns });
              return {
                limit: async (count) => { calls.push({ step: "limit", count }); return result; },
              };
            },
          };
        },
      };
    },
  };
  return { calls, client };
}

const ASSIGNMENT = {
  studentId: "22222222-2222-4222-8222-222222222222",
  questionId: "b88f169a-f959-4d8b-bc9b-846fb36017fb",
  correctAnswer: "Polen",
  nowIso: "2026-10-15T12:00:00.000Z",
};

// ── The privileged module, exercised directly ────────────────────────────────────────────────────
test("the instance is inserted on the admin client with exactly the server-side values", async () => {
  const { calls, client } = spyClient();
  const res = await insertQuestionInstance(() => client, ASSIGNMENT);
  assert.deepEqual(res, { data: [{ id: "i-1" }], error: null });
  assert.deepEqual(calls, [
    { step: "from", table: "question_instances" },
    { step: "insert", values: {
      student_id: ASSIGNMENT.studentId,
      question_id: ASSIGNMENT.questionId,
      answered: false,
      correct_answer: "Polen",
      difficulty_at_time: 1,
      mastery_snapshot: 1,
      next_review_at: ASSIGNMENT.nowIso,
    } },
    { step: "select", columns: "id" },
    { step: "limit", count: 1 },
  ]);
});

test("no verdict, reward or teacher column is ever written by the assignment", async () => {
  const { calls, client } = spyClient();
  await insertQuestionInstance(() => client, ASSIGNMENT);
  const values = calls.find((c) => c.step === "insert").values;
  for (const col of ["was_correct", "is_correct", "user_answer", "answered_at", "xp_awarded", "teacher_score",
    "teacher_feedback", "reviewed_at", "reviewed_by", "repeat_count", "misconception_signal", "id"]) {
    assert.equal(col in values, false, col);
  }
});

test("a database error is returned unchanged, never turned into success", async () => {
  const err = { code: "23505", message: "duplicate key value" };
  const { client } = spyClient({ data: null, error: err });
  const res = await insertQuestionInstance(() => client, ASSIGNMENT);
  assert.deepEqual(res, { data: null, error: err });
});

test("the admin client is built only when an instance is written, and exactly once", async () => {
  let built = 0;
  const { client } = spyClient();
  await insertQuestionInstance(() => { built++; return client; }, ASSIGNMENT);
  assert.equal(built, 1);
});

test("a serviceKey() failure propagates — there is no fallback to any other client", async () => {
  await assert.rejects(
    insertQuestionInstance(() => { throw new Error("No privileged Supabase key available"); }, ASSIGNMENT),
    /No privileged Supabase key available/);
});

test("the admin client options carry no headers and never keep a session", () => {
  assert.deepEqual(ADMIN_CLIENT_OPTIONS, { auth: { persistSession: false, autoRefreshToken: false } });
  assert.equal("global" in ADMIN_CLIENT_OPTIONS, false);
  assert.ok(Object.isFrozen(ADMIN_CLIENT_OPTIONS) && Object.isFrozen(ADMIN_CLIENT_OPTIONS.auth));
});

test("the privileged module has no Deno, env or network access of its own", () => {
  assert.equal(/\bDeno\b|process\.env|https?:\/\/|\bimport\b/.test(MODULE_CODE), false);
});

// ── index.ts wiring, pinned at source level ──────────────────────────────────────────────────────
test("index.ts imports the key helpers and the privileged module", () => {
  assert.match(INDEX_CODE, /import \{ publishableKey, serviceKey \} from "\.\.\/_shared\/supabase-keys\.ts";/);
  assert.match(INDEX_CODE, /import \{ ADMIN_CLIENT_OPTIONS, insertQuestionInstance \} from "\.\/instance-insert\.ts";/);
});

test("the admin client is built in one place, from serviceKey(), with no headers", () => {
  const defs = INDEX_CODE.match(/createClient\(/g) ?? [];
  assert.equal(defs.length, 2, "exactly the user client and the admin client");
  assert.match(INDEX_CODE,
    /function makeAdminClient\(\) \{\s*return createClient\(Deno\.env\.get\("SUPABASE_URL"\)!, serviceKey\(\), ADMIN_CLIENT_OPTIONS\);\s*\}/);
  assert.equal((INDEX_CODE.match(/serviceKey\(\)/g) ?? []).length, 1, "serviceKey() is used only by makeAdminClient");
});

test("the user client is unchanged: publishable key + the pupil's Authorization header", () => {
  assert.match(INDEX_CODE,
    /const supabase = createClient\(\s*Deno\.env\.get\("SUPABASE_URL"\)!,\s*publishableKey\(\),\s*\{\s*global: \{\s*headers: \{ Authorization: req\.headers\.get\("Authorization"\)! \},\s*\},\s*\}\s*\);/);
  assert.match(INDEX_CODE, /await supabase\.auth\.getUser\(\);/);
  assert.match(INDEX_CODE, /if \(authError \|\| !user\) throw new Error\("Unauthorized"\);/);
  assert.match(INDEX_CODE, /const student_id = user\.id;/);
});

test("the admin client is used only for the instance insert", () => {
  const uses = INDEX_CODE.match(/makeAdminClient/g) ?? [];
  assert.equal(uses.length, 2, "the definition and the one insertQuestionInstance call");
  assert.match(INDEX_CODE, /await insertQuestionInstance\(makeAdminClient, \{/);
});

test("index.ts never writes question_instances on the user client", () => {
  assert.equal(/supabase\s*\.from\("question_instances"\)\s*\.(insert|upsert|update|delete)\(/.test(INDEX_CODE), false);
});

test("student_id comes only from user.id and the key only from the server-normalised question", () => {
  const call = /await insertQuestionInstance\(makeAdminClient, \{([\s\S]*?)\}\);/.exec(INDEX_CODE);
  assert.ok(call, "insertQuestionInstance call not found");
  assert.match(call[1], /studentId: student_id,/);
  assert.match(call[1], /questionId: q\.id,/);
  assert.match(call[1], /correctAnswer: normalized\.correct,/);
  assert.equal(/\bbody\b/.test(call[1]), false, "nothing from the request body");
});

test("the insert stays inside the server-chosen candidate loop (get_unserved_questions)", () => {
  const loop = INDEX_CODE.slice(INDEX_CODE.indexOf("for (const q of sortedQuestions)"),
    INDEX_CODE.indexOf('"request_repeat_question"'));
  assert.ok(INDEX_CODE.indexOf('"get_unserved_questions"') < INDEX_CODE.indexOf("for (const q of sortedQuestions)"));
  assert.match(loop, /await insertQuestionInstance\(makeAdminClient, \{/);
});

test("a row-level insert failure is logged and the next candidate is tried; success needs a returned row", () => {
  const loop = INDEX_CODE.slice(INDEX_CODE.indexOf("for (const q of sortedQuestions)"));
  assert.match(loop, /if \(error\) \{\s*console\.error\("INSTANCE INSERT FAILED:"/);
  assert.match(loop, /if \(!error && Array\.isArray\(data\) && data\.length > 0\) \{\s*inserted = \{ instance: data\[0\], question: q, normalized, format \};\s*break;/);
});

test("a key failure reaches the outer catch as a visible 500 — no user-client fallback", () => {
  assert.match(INDEX_CODE, /console\.error\("EDGE FUNCTION ERROR:", err\);/);
  assert.match(INDEX_CODE, /status: 500,/);
  assert.equal(/catch \(e\) \{[^}]*insertQuestionInstance/.test(INDEX_CODE), false);
});
