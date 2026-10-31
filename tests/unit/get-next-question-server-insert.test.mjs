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

test("the admin client is used only for the instance insert and the server-only key-carrying reads", () => {
  // 20261016160000 (answer keys server-side): besides the insert, the backend client now makes the
  // reads that carry an answer key — the due/repeat instance with its question and the two
  // service-only RPCs — so the key never has to be readable by the pupil. Exactly those, nothing else.
  const uses = INDEX_CODE.match(/makeAdminClient/g) ?? [];
  assert.equal(uses.length, 4,
    "the definition, the accessor's type annotation, the per-request accessor and the insertQuestionInstance call");
  assert.match(INDEX_CODE, /let adminClient: ReturnType<typeof makeAdminClient> \| null = null;/);
  assert.match(INDEX_CODE, /const admin = \(\) => \(adminClient \?\?= makeAdminClient\(\)\);/);
  assert.equal((INDEX_CODE.match(/makeAdminClient\(\)/g) ?? []).length, 2, "built only by the accessor (and defined once)");
  assert.match(INDEX_CODE, /await insertQuestionInstance\(makeAdminClient, \{/);
  const adminUses = [...INDEX_CODE.matchAll(/await admin\(\)\s*\.(from|rpc)\(\s*"([a-z_]+)"/g)].map((m) => `${m[1]}:${m[2]}`);
  assert.deepEqual(adminUses, [
    // Match par only (PR #377): the instance key of a "match" row, read on its own so every other
    // format makes the release-gated reads unchanged (pinned in match-pairs.test.mjs).
    "from:question_instances",
    "from:question_instances",
    "rpc:get_unserved_questions_for_student",
    // QUESTION_MIX_ENGINE "v2" only: the same repeat with exhaustion judged on servable formats
    // (migration 20261019150000; service_role only, same student-scoped guards).
    "rpc:request_repeat_question_servable_for_student",
    "rpc:request_repeat_question_for_student",
    // LEVEL_ENGINE "v1" only: the repeat over the level engine's pool (migration 20261029120000;
    // service_role only, SECURITY INVOKER, same student-scoped guards).
    "rpc:request_repeat_level_question_for_student",
    "from:question_instances",
  ]);
  // The format mix (QUESTION_MIX_ENGINE "v2"/"shadow") hands the same backend client to
  // ./mix-flow.ts, whose three reads (candidate RPC, own history, own placement session — all scoped
  // to the verified student) are pinned in question-format-mix.test.mjs.
  assert.equal((INDEX_CODE.match(/await loadFormatMixPlan\(admin\(\) as unknown as MixReadClient, \{\s*studentId: student_id,/g) ?? []).length, 2,
    "the v2 and the shadow call");
  // The level engine (LEVEL_ENGINE "v1") hands the same backend client to ./level-flow.ts, whose reads
  // (advance_student_level, the candidate RPC, own history — all scoped to the verified student) are
  // pinned in level-flow.test.mjs.
  assert.equal((INDEX_CODE.match(/await loadLevelPlan\(admin\(\) as unknown as LevelReadClient, \{\s*studentId: student_id,/g) ?? []).length, 1,
    "the level engine call");
  assert.equal((INDEX_CODE.match(/\badmin\(\)/g) ?? []).length, 10, "no other admin() use (the 10th is Match par's key read)");
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

test("the insert stays inside the server-chosen candidate loop (get_unserved_questions_for_student)", () => {
  const loop = INDEX_CODE.slice(INDEX_CODE.indexOf("for (const q of sortedQuestions)"),
    INDEX_CODE.indexOf('"request_repeat_question_for_student"'));
  const unserved = INDEX_CODE.indexOf('"get_unserved_questions_for_student"');
  assert.ok(unserved !== -1 && unserved < INDEX_CODE.indexOf("for (const q of sortedQuestions)"));
  assert.match(loop, /await insertQuestionInstance\(makeAdminClient, \{/);
});

test("a row-level insert failure is logged and the next candidate is tried; success needs a returned row", () => {
  const loop = INDEX_CODE.slice(INDEX_CODE.indexOf("for (const q of sortedQuestions)"));
  assert.match(loop, /if \(error\) \{\s*console\.error\("INSTANCE INSERT FAILED:"/);
  assert.match(loop, /if \(!error && Array\.isArray\(data\) && data\.length > 0\) \{\s*inserted = \{ instance: data\[0\], question: q, normalized, pub, format \};\s*break;/);
});

test("a key failure reaches the outer catch as a visible 500 — no user-client fallback", () => {
  assert.match(INDEX_CODE, /console\.error\("EDGE FUNCTION ERROR:", err\);/);
  assert.match(INDEX_CODE, /status: 500,/);
  assert.equal(/catch \(e\) \{[^}]*insertQuestionInstance/.test(INDEX_CODE), false);
});
