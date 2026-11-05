// Rækkefølge (order_items, F-04): grading and rewards by production's OWN process_question_attempt, on
// PGlite over the full isolated replay of the repository (tests/isolated/schema) — no grading code of the
// kind's own, one reward path.
//
// Proven, with the instance key drawn by createOrderKey and the answer written by canonicalOrderAnswer
// exactly as get-next-question and process-event do:
//   * the right order is correct: 10 XP + 5 coins, once — a second call for the same instance awards
//     nothing more (no double registration);
//   * a wrong order (every other permutation of 4 items) is incorrect: 0 XP, 0 coins;
//   * a repeat round answered right earns the repeat amount (2 XP + 1 coin, D-211), as for MC;
//   * the comparison is the MC choice comparison (lower-cased, stripped to [a-z0-9]).
// HONEST LIMIT: production's questions constraints accept only mc/number/text today, so this test drops
// questions_answer_format_check and content_valid_check IN ITS OWN DATABASE to store an "order" row — the
// stand-in for the reviewed activation migration that does not exist yet. Nothing here is applied
// anywhere else. PGlite is PostgreSQL 18.x (production 17.6) and runs as superuser.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { replaySchema } from "../isolated/schema/replay.mjs";
import { bootstrapMarkerSql } from "../isolated/seed/seed-guard.mjs";
import { createOrderKey, canonicalOrderAnswer, parseOrderKey } from "../../supabase/functions/_shared/order-items.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PUPIL = "00000000-0000-4000-8000-0000000000c1";
const ITEMS = ["Grundloven (1849)", "Krigen i 1864", "Kvinders valgret (1915)", "Genforeningen (1920)"];

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

// One instance per pupil and question (idx_student_question_instance): every round gets its own question.
let qn = 0;
async function newQuestion() {
  qn++;
  return (await db.query(`INSERT INTO public.questions (type, content, difficulty, difficulty_band, is_active, question_type,
      learning_objective, answer_format, answer_type, target_grade)
    VALUES ('order', $1::jsonb, 2, 2, true, 'auto', 'revolutions_democracy', 'order', 'short', 7) RETURNING id`,
    [JSON.stringify({ question: `Sæt begivenhederne i rækkefølge (${qn}).`, items: ITEMS, sequence: "chronological", correct: "-" })])).rows[0].id;
}
after(async () => { await db?.close(); });

const progress = async () => (await db.query("SELECT xp, coins FROM public.student_progress WHERE student_id = $1", [PUPIL])).rows[0];

// One open round at a time (idx_one_open_question): each call opens, answers and closes one instance.
async function round(key, answerPositions, { repeat = 0 } = {}) {
  const inst = (await db.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer,
      difficulty_at_time, mastery_snapshot, answered, repeat_count)
    VALUES ($1, $2, $3, 1, 1, false, 0) RETURNING id`, [PUPIL, await newQuestion(), key])).rows[0].id;
  if (repeat > 0) {
    // A repeat round as production makes it: answered once, then reopened (repeat_count + 1).
    await db.query("UPDATE public.question_instances SET answered = true, was_correct = false, answered_at = now() WHERE id = $1", [inst]);
    await db.query("UPDATE public.question_instances SET answered = false, was_correct = NULL, answered_at = NULL, repeat_count = repeat_count + 1 WHERE id = $1", [inst]);
  }
  const answer = canonicalOrderAnswer(JSON.stringify(answerPositions), key);
  assert.ok(answer, "a permutation is a valid answer");
  const call = async () => (await db.query("SELECT public.process_question_attempt($1, $2, $3, $4) AS r",
    [PUPIL, inst, answer, Date.now()])).rows[0].r;
  return { inst, call };
}

test("the right order is correct: 10 XP + 5 coins, once — a second call for the same instance awards nothing", async () => {
  const key = createOrderKey(4);
  const right = parseOrderKey(key, 4); // the display positions in the correct order
  const before = await progress();
  const { call } = await round(key, right);
  const first = await call();
  assert.equal(first.status, "correct");
  const mid = await progress();
  assert.equal(mid.xp - before.xp, 10);
  assert.equal(mid.coins - before.coins, 5);
  const again = await call();
  assert.equal(again.status, "correct", "the same result is reported");
  const end = await progress();
  assert.deepEqual(end, mid, "no second award");
});

test("every wrong order of 4 items is incorrect and earns nothing", async () => {
  const key = "2,0,3,1";
  const right = key.split(",").map(Number);
  const perms = [];
  const permute = (rest, acc) => rest.length === 0 ? perms.push(acc) : rest.forEach((v, i) => permute(rest.filter((_, j) => j !== i), [...acc, v]));
  permute([0, 1, 2, 3], []);
  assert.equal(perms.length, 24, "1 right of 4! = 24 — a random order is right 1 time in 24");
  for (const p of perms.filter((p) => p.join() !== right.join())) {
    const before = await progress();
    const { call } = await round(key, p);
    assert.equal((await call()).status, "incorrect", p.join());
    assert.deepEqual(await progress(), before, `${p.join()}: no reward`);
  }
});

test("a repeat round answered right earns the repeat amount (2 XP + 1 coin), as for MC", async () => {
  const key = "1,3,0,2";
  const before = await progress();
  const { call } = await round(key, key.split(",").map(Number), { repeat: 1 });
  assert.equal((await call()).status, "correct");
  const after = await progress();
  assert.equal(after.xp - before.xp, 2);
  assert.equal(after.coins - before.coins, 1);
});
