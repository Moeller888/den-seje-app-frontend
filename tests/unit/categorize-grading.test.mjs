// Kategorisering (categorize, F-05): grading and rewards by production's OWN process_question_attempt, on
// PGlite over the full isolated replay of the repository (tests/isolated/schema) — no grading code of the
// kind's own, one reward path.
//
// Proven, with the instance key drawn by createCategorizeKey and the answer written by
// canonicalCategorizeAnswer exactly as get-next-question and process-event do:
//   * the right placement is correct: 10 XP + 5 coins, once — a second call for the same instance awards
//     nothing more (no double registration);
//   * EVERY other complete placement of 4 items in 2 categories (15 of 16) is incorrect: 0 XP, 0 coins —
//     all or nothing, so 3 of 4 right earns nothing;
//   * a repeat round answered right earns the repeat amount (2 XP + 1 coin, D-211), as for MC;
//   * the comparison is the MC choice comparison (normalize_choice_answer: since D-290 G1 lower-cased and
//     whitespace-collapsed with punctuation kept, so the canonical answer must equal the key exactly).
// HONEST LIMIT: production's questions constraints accept only mc/number/text today, so this test drops
// questions_answer_format_check and content_valid_check IN ITS OWN DATABASE to store a "categorize" row —
// the stand-in for the reviewed activation migration that does not exist yet. Nothing here is applied
// anywhere else. PGlite is PostgreSQL 18.x (production 17.6) and runs as superuser.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { replaySchema } from "../isolated/schema/replay.mjs";
import { bootstrapMarkerSql } from "../isolated/seed/seed-guard.mjs";
import { createCategorizeKey, canonicalCategorizeAnswer, parseCategorizeContent, parseCategorizeKey } from "../../supabase/functions/_shared/categorize.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PUPIL = "00000000-0000-4000-8000-0000000000c2";
const CONTENT = {
  question: "Før eller efter Grundloven 1849?",
  categories: ["Enevælden", "Efter 1849"],
  items: [
    { text: "Kongen giver love alene", category: "Enevælden" },
    { text: "Kongeloven gælder", category: "Enevælden" },
    { text: "Rigsdagen vedtager love med kongen", category: "Efter 1849" },
    { text: "Domstolene dømmer", category: "Efter 1849" },
  ],
};
const PARSED = parseCategorizeContent(CONTENT);

let db;
before(async () => {
  db = new PGlite();
  await db.exec(readFileSync(join(ROOT, "tests", "isolated", "schema", "pglite-platform.sql"), "utf8"));
  await db.exec(bootstrapMarkerSql("0123456789abcdef0123456789abcdef"));
  const r = await replaySchema({ exec: (s) => db.exec(s), query: async (s) => (await db.query(s)).rows });
  assert.deepEqual(r.failures, []);
  // Test-only stand-in for the future activation migration (see header).
  await db.exec(`ALTER TABLE public.questions DROP CONSTRAINT questions_answer_format_check;
                 ALTER TABLE public.questions DROP CONSTRAINT content_valid_check;`);
  await db.exec(`INSERT INTO auth.users (id, email) VALUES ('${PUPIL}', 'elev@example.test');
                 INSERT INTO public.profiles (id, role, selected_grade) VALUES ('${PUPIL}', 'student', 7);`);
});
after(async () => { await db?.close(); });

// One instance per pupil and question (idx_student_question_instance): every round gets its own question.
let qn = 0;
async function newQuestion() {
  qn++;
  return (await db.query(`INSERT INTO public.questions (type, content, difficulty, difficulty_band, is_active, question_type,
      learning_objective, answer_format, answer_type, target_grade)
    VALUES ('categorize', $1::jsonb, 2, 2, true, 'auto', 'revolutions_democracy', 'categorize', 'short', 7) RETURNING id`,
    [JSON.stringify({ ...CONTENT, question: `${CONTENT.question} (${qn})`, correct: "-" })])).rows[0].id;
}

const progress = async () => (await db.query("SELECT xp, coins FROM public.student_progress WHERE student_id = $1", [PUPIL])).rows[0];

// One open round at a time (idx_one_open_question): each call opens, answers and closes one instance.
async function round(key, placement, { repeat = 0 } = {}) {
  const inst = (await db.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer,
      difficulty_at_time, mastery_snapshot, answered, repeat_count)
    VALUES ($1, $2, $3, 1, 1, false, 0) RETURNING id`, [PUPIL, await newQuestion(), key])).rows[0].id;
  if (repeat > 0) {
    // A repeat round as production makes it: answered once, then reopened (repeat_count + 1).
    await db.query("UPDATE public.question_instances SET answered = true, was_correct = false, answered_at = now() WHERE id = $1", [inst]);
    await db.query("UPDATE public.question_instances SET answered = false, was_correct = NULL, answered_at = NULL, repeat_count = repeat_count + 1 WHERE id = $1", [inst]);
  }
  const answer = canonicalCategorizeAnswer(JSON.stringify(placement), key);
  assert.ok(answer, "a complete placement is a valid answer");
  const call = async () => (await db.query("SELECT public.process_question_attempt($1, $2, $3, $4) AS r",
    [PUPIL, inst, answer, Date.now()])).rows[0].r;
  return { inst, call };
}
const rightPlacement = (key) => parseCategorizeKey(key).map((p) => p.category);

test("the right placement is correct: 10 XP + 5 coins, once — a second call for the same instance awards nothing", async () => {
  const key = createCategorizeKey(PARSED);
  const before = await progress();
  const { call } = await round(key, rightPlacement(key));
  const first = await call();
  assert.equal(first.status, "correct");
  assert.equal(first.correct_answer, key, "the key is revealed only now, after the answer");
  const mid = await progress();
  assert.deepEqual([mid.xp - before.xp, mid.coins - before.coins], [10, 5]);
  const again = await call();
  assert.equal(again.status, "correct", "the same result is reported");
  assert.deepEqual(await progress(), mid, "no second award");
});

test("every other placement of 4 items in 2 categories is incorrect and earns nothing — 3 of 4 right is still wrong", async () => {
  const key = "2:1,0:0,3:1,1:0";
  const right = rightPlacement(key);
  let wrong = 0;
  for (let x = 0; x < 16; x++) {
    const p = [0, 1, 2, 3].map((i) => (x >> i) & 1);
    if (p.join() === right.join()) continue;
    const before = await progress();
    const { call } = await round(key, p);
    assert.equal((await call()).status, "incorrect", p.join());
    assert.deepEqual(await progress(), before, `${p.join()}: no reward`);
    wrong++;
  }
  assert.equal(wrong, 15, "1 right of 2⁴ = 16");
});

test("a repeat round answered right earns the repeat amount (2 XP + 1 coin), as for MC", async () => {
  const key = "1:0,3:1,0:0,2:1";
  const before = await progress();
  const { call } = await round(key, rightPlacement(key), { repeat: 1 });
  assert.equal((await call()).status, "correct");
  const after = await progress();
  assert.deepEqual([after.xp - before.xp, after.coins - before.coins], [2, 1]);
});
