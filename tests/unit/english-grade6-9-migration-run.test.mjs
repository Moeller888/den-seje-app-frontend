// Engelsk 6.-9. klasse: migration 20261020125000_english_grade6_9, run UNMODIFIED against a real
// PostgreSQL (PGlite, in-process WebAssembly — no Docker, no network). Together with the existing
// 3.-5. migrations, English now has questions on every grade 3-9.
//
// HONEST LIMITS: PGlite is PostgreSQL 18.x; production is 17.6. The fixture is the questions table
// only. Read-aloud segmentation of these questions is covered by read-aloud-lang-segments.test.mjs,
// which reads every *english* migration. Passing is not permission to apply (D-110).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATION = readFileSync(join(ROOT, "supabase", "migrations", "20261020125000_english_grade6_9.sql"), "utf8");

// Levels: originally the §4.1 cell midpoint of each question's grade 6-9 and band 1-4. The E5 review
// (2026-11-05) moved the questions that were a full CEFR band off to a level that fits their content;
// target_grade/difficulty_band follow the level (the §4.1 cell), and metadata.cefr follows the level.
const CEFR = { A1: [1501, 3000], A2: [3001, 5000], B1: [5001, 7000], B2: [7001, 8500], C1: [8501, 10000] };

test("the migration inserts 120 inactive, levelled English MC questions", async (t) => {
  const pg = new PGlite();
  t.after(() => pg.close());
  await pg.exec(`
    CREATE TABLE public.questions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), content jsonb NOT NULL,
      answer_format text NOT NULL, answer_type text DEFAULT 'short', metadata jsonb, type text,
      difficulty integer, difficulty_level integer CHECK (difficulty_level BETWEEN 1 AND 10000),
      question_type text, is_active boolean NOT NULL DEFAULT true,
      learning_objective text, target_grade smallint
        CHECK (target_grade IS NULL OR (target_grade >= 3 AND target_grade <= 9)),
      difficulty_band smallint CHECK (difficulty_band IS NULL OR (difficulty_band BETWEEN 1 AND 5)));
    -- Mirrors live: question text is unique across the whole bank, not per grade.
    CREATE UNIQUE INDEX unique_question_text ON public.questions ((content ->> 'question'));
  `);
  await pg.exec(MIGRATION);
  const rows = (await pg.query("SELECT * FROM public.questions ORDER BY target_grade, difficulty_band")).rows;
  assert.equal(rows.length, 120);

  const perGrade = {};
  const perCefr = {};
  for (const q of rows) {
    perGrade[q.target_grade] = (perGrade[q.target_grade] ?? 0) + 1;
    assert.equal(q.learning_objective, "english");
    assert.equal(q.metadata.domain, "english");
    assert.equal(q.answer_format, "mc");
    assert.equal(q.question_type, "auto");
    assert.equal(q.is_active, false);
    assert.equal(q.metadata.level_batch, "grade6_9");
    const [lo, hi] = CEFR[q.metadata.cefr] ?? [];
    assert.ok(lo, `unknown cefr ${q.metadata.cefr}`);
    assert.ok(q.difficulty_level >= lo && q.difficulty_level <= hi, `${q.difficulty_level} outside ${q.metadata.cefr}`);
    assert.equal(q.difficulty, q.difficulty_band);
    const cell = (q.target_grade - 3) * 5 + (q.difficulty_band - 1);
    assert.ok(q.difficulty_level > cell * 10000 / 35 && q.difficulty_level <= (cell + 1) * 10000 / 35,
      `level ${q.difficulty_level} is not in the cell of grade ${q.target_grade} band ${q.difficulty_band}`);
    perCefr[q.metadata.cefr] = (perCefr[q.metadata.cefr] ?? 0) + 1;
    const { question, options, correct, accepted_answers, review_text } = q.content;
    assert.ok(question && review_text, "question and review_text present");
    assert.equal(options.length, 4);
    assert.equal(new Set(options).size, 4, `duplicate option in: ${question}`);
    assert.ok(options.includes(correct), `correct not among options: ${question}`);
    assert.deepEqual(accepted_answers, [correct]);
    for (const text of [question, review_text, ...options]) {
      assert.equal(/Ã|�/.test(text), false, `mojibake in: ${text}`);
    }
  }
  assert.deepEqual(perCefr, { A1: 5, A2: 28, B1: 42, B2: 25, C1: 20 });
  assert.equal(Object.values(perGrade).reduce((a, b) => a + b, 0), 120);
  // No question text is repeated anywhere (live enforces this with unique_question_text).
  const texts = rows.map((q) => q.content.question);
  assert.equal(new Set(texts).size, texts.length, "duplicate question text");
  const positions = new Set(rows.map((q) => q.content.options.indexOf(q.content.correct)));
  assert.deepEqual([...positions].sort(), [0, 1, 2, 3]);
});
