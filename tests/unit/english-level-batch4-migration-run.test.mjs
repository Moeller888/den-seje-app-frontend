// Engelsk niveau-portion 4: migrations 20261020160001..3_english_level_batch4_{1,2,3}, run UNMODIFIED on
// top of migration A (20261020120000_difficulty_scale_a), the pilot and portions 2-3 against a real
// PostgreSQL (PGlite, in-process WebAssembly — no Docker, no network). 500 more MC questions on the
// difficulty scale 1-10000, CEFR A2-C1 (docs/difficulty-scale-design.md §7, owner decision B7). Loading the
// earlier portions first makes the live-like unique_question_text index prove that no text repeats one.
//
// HONEST LIMITS: PGlite is PostgreSQL 18.x; production is 17.6. The fixture holds only what the
// migrations touch. Uniqueness is checked against the repo's migrations, not the live bank. Passing
// is not permission to apply (D-110).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (n) => readFileSync(join(ROOT, "supabase", "migrations", n), "utf8");
const MIGRATION_A = read("20261020120000_difficulty_scale_a.sql");
const PILOT = [1, 2, 3].map((n) => read(`2026102013000${n}_english_level_pilot_${n}.sql`));
const BATCH2 = [1, 2, 3].map((n) => read(`2026102014000${n}_english_level_batch2_${n}.sql`));
const BATCH3 = [1, 2, 3].map((n) => read(`2026102015000${n}_english_level_batch3_${n}.sql`));
const BATCH = [1, 2, 3].map((n) => read(`2026102016000${n}_english_level_batch4_${n}.sql`));

const CEFR = { A2: [3001, 5000], B1: [5001, 7000], B2: [7001, 8500], C1: [8501, 10000] };

async function load(t) {
  const pg = new PGlite();
  t.after(() => pg.close());
  await pg.exec(`
    CREATE ROLE anon NOBYPASSRLS; CREATE ROLE authenticated NOBYPASSRLS; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text NOT NULL);
    CREATE TABLE public.questions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), content jsonb NOT NULL,
      answer_format text NOT NULL, answer_type text DEFAULT 'short', metadata jsonb, type text,
      difficulty integer, question_type text, is_active boolean NOT NULL DEFAULT true,
      learning_objective text, target_grade smallint
        CHECK (target_grade IS NULL OR (target_grade >= 3 AND target_grade <= 9)),
      difficulty_band smallint CHECK (difficulty_band IS NULL OR (difficulty_band BETWEEN 1 AND 5)));
    -- Mirrors live: question text is unique across the whole bank.
    CREATE UNIQUE INDEX unique_question_text ON public.questions ((content ->> 'question'));
    CREATE TABLE public.pilot_ids (id uuid PRIMARY KEY);
  `);
  await pg.exec(MIGRATION_A);
  for (const sql of [...PILOT, ...BATCH2, ...BATCH3]) await pg.exec(sql);
  await pg.exec("INSERT INTO public.pilot_ids SELECT id FROM public.questions");
  for (const sql of BATCH) await pg.exec(sql);
  return pg;
}

test("portion 4 inserts 500 well-formed English MC questions on the level scale", async (t) => {
  const pg = await load(t);
  const rows = (await pg.query(`
    SELECT q.*, public.difficulty_level_from_grade_band(q.target_grade, q.difficulty_band) AS cell_mid
    FROM public.questions q WHERE q.id NOT IN (SELECT id FROM public.pilot_ids)
    ORDER BY q.difficulty_level, q.content->>'question'`)).rows;
  assert.equal(rows.length, 500);

  const perCefr = {};
  for (const q of rows) {
    assert.equal(q.learning_objective, "english");
    assert.equal(q.answer_format, "mc");
    assert.equal(q.question_type, "auto");
    assert.equal(q.type, "mc_single");
    assert.equal(q.is_active, true);
    assert.equal(q.metadata.domain, "english");
    assert.equal(q.difficulty, q.difficulty_band);

    // The level sits inside its CEFR range, and grade/band are the §4.1 cell that contains it.
    const [lo, hi] = CEFR[q.metadata.cefr] ?? [];
    assert.ok(lo, `unknown cefr ${q.metadata.cefr}`);
    assert.ok(q.difficulty_level >= lo && q.difficulty_level <= hi, `${q.difficulty_level} outside ${q.metadata.cefr}`);
    const cell = (q.target_grade - 3) * 5 + (q.difficulty_band - 1);
    assert.ok(q.difficulty_level > cell * 10000 / 35 && q.difficulty_level <= (cell + 1) * 10000 / 35,
      `level ${q.difficulty_level} is not in the cell of grade ${q.target_grade} band ${q.difficulty_band}`);
    assert.ok(Math.abs(q.cell_mid - q.difficulty_level) <= 143);
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
  assert.deepEqual(perCefr, { A2: 70, B1: 160, B2: 140, C1: 130 });
  assert.equal(rows[0].difficulty_level, 3001);
  assert.equal(rows[rows.length - 1].difficulty_level, 10000);

  // The correct answer is spread evenly over the four positions.
  const pos = [0, 0, 0, 0];
  for (const q of rows) pos[q.content.options.indexOf(q.content.correct)]++;
  assert.deepEqual(pos, [125, 125, 125, 125]);
});

test("portion 4's metadata follows the existing English batches, plus cefr", async (t) => {
  const pg = await load(t);
  const rows = (await pg.query(
    "SELECT metadata, difficulty_level FROM public.questions WHERE id NOT IN (SELECT id FROM public.pilot_ids)")).rows;
  assert.equal(rows.length, 500);
  const ROLE = { A2: "reinforcement", B1: "challenge", B2: "challenge", C1: "deep_challenge" };
  for (const { metadata: m } of rows) {
    assert.ok(["ordforråd", "hverdagsudtryk", "grammatik", "læseforståelse"].includes(m.concepts[0]));
    assert.equal(m.challenge_role, ROLE[m.cefr]);
    assert.ok(m.cognitive_skill && m.difficulty_type && m.misconception_type && m.insight_type);
  }
});

test("no portion 4 question text repeats a question anywhere in the repo's migrations, earlier portions included", async () => {
  const { readdirSync } = await import("node:fs");
  const dir = join(ROOT, "supabase", "migrations");
  const others = new Set();
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".sql") || f.includes("english_level_batch4")) continue;
    for (const m of readFileSync(join(dir, f), "utf8").matchAll(/"(?:q|question)":"((?:[^"\\]|\\.)*)"/g)) {
      others.add(JSON.parse(`"${m[1]}"`));
    }
  }
  let n = 0;
  for (const sql of BATCH) {
    const arr = JSON.parse(/jsonb_array_elements\(\$\$(\[.*?\])\$\$/s.exec(sql)[1]);
    for (const e of arr) {
      n++;
      assert.equal(others.has(e.q), false, `already in the bank: ${e.q}`);
    }
  }
  assert.equal(n, 500);
});

test("portion 4 needs migration A and carries the D-110 line", () => {
  for (const sql of BATCH) {
    assert.match(sql, /difficulty_level\)\nSELECT/);
    assert.match(sql, /Kræver migration A \(20261020120000_difficulty_scale_a\)/);
    assert.match(sql, /Må KUN anvendes via apply_migration med særskilt ejer-autorisation \(D-110\)\./);
  }
});
