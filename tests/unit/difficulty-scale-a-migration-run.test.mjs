// Sværhedsskala 1-10.000, migration A (20261020120000_difficulty_scale_a), run UNMODIFIED against a
// real PostgreSQL (PGlite, in-process WebAssembly — no Docker, no network).
//
// What is pinned:
//   - the start formula of docs/difficulty-scale-design.md §4.1 for all 35 cells (monotone, 143 …
//     9857) and NULL for every missing or out-of-range argument;
//   - the backfill: questions with grade AND band get the formula's level, every other question
//     stays NULL (its default is an owner decision, design §5.3);
//   - questions.difficulty_level refuses values outside 1-10000;
//   - student_subject_level is server-owned: a pupil reads only their own rows and can neither
//     insert, update nor delete; anon reads nothing; service_role writes.
//
// HONEST LIMITS: PGlite is PostgreSQL 18.x; production is 17.6. The fixture holds only the columns
// this migration touches. Passing is not permission to apply (D-110).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATION = readFileSync(
  join(ROOT, "supabase/migrations/20261020120000_difficulty_scale_a.sql"), "utf8");

const P1 = "00000000-0000-4000-8000-000000000001";   // pupil
const P2 = "00000000-0000-4000-8000-000000000002";   // another pupil

const FIXTURE = `
  CREATE ROLE anon NOBYPASSRLS; CREATE ROLE authenticated NOBYPASSRLS; CREATE ROLE service_role BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text NOT NULL, selected_grade smallint);
  INSERT INTO public.profiles VALUES ('${P1}', 'student', 3), ('${P2}', 'student', 9);
  CREATE TABLE public.questions (id serial PRIMARY KEY, is_active boolean NOT NULL DEFAULT true,
    learning_objective text,
    target_grade smallint CHECK (target_grade IS NULL OR (target_grade >= 3 AND target_grade <= 9)),
    difficulty_band smallint CHECK (difficulty_band IS NULL OR (difficulty_band BETWEEN 1 AND 5)));
  INSERT INTO public.questions (learning_objective, target_grade, difficulty_band, is_active) VALUES
    ('english', 3, 1, true),    -- 1  → 143
    ('english', 5, 4, true),    -- 2  → 3857
    ('vikings', 7, 1, true),    -- 3  → 5857
    ('danish',  9, 5, false),   -- 4  → 9857 (inactive questions are backfilled too)
    ('vikings', NULL, 3, true), -- 5  → NULL (no grade)
    ('english', 4, NULL, true), -- 6  → NULL (no band)
    ('danish',  NULL, NULL, true); -- 7 → NULL
`;

async function db(t) {
  const pg = new PGlite();
  t.after(() => pg.close());
  await pg.exec(FIXTURE);
  await pg.exec(MIGRATION);
  return pg;
}

// One statement as `role` with auth.uid() = uid, in a rolled-back transaction.
// Returns { rows } or { error } — an error is a value here, not an exception.
async function as(pg, role, uid, sql, params = []) {
  await pg.exec("BEGIN");
  try {
    await pg.exec(`SET LOCAL ROLE ${role}`);
    await pg.query("SELECT set_config('test.uid', $1, true)", [uid ?? ""]);
    const r = await pg.query(sql, params);
    return { rows: r.rows };
  } catch (e) {
    return { error: String(e.message) };
  } finally {
    await pg.exec("ROLLBACK");
  }
}

test("the start formula covers all 35 cells, strictly increasing from 143 to 9857", async (t) => {
  const pg = await db(t);
  const { rows } = await pg.query(`
    SELECT g, b, public.difficulty_level_from_grade_band(g, b) AS level
    FROM generate_series(3, 9) g, generate_series(1, 5) b
    ORDER BY g, b`);
  assert.equal(rows.length, 35);
  const levels = rows.map((r) => r.level);
  for (let i = 0; i < 35; i++) {
    assert.equal(levels[i], Math.round((i + 0.5) * 10000 / 35), `cell ${i}`);
    if (i > 0) assert.ok(levels[i] > levels[i - 1], `cell ${i} is not above cell ${i - 1}`);
  }
  assert.equal(levels[0], 143);
  assert.equal(levels[34], 9857);
});

test("the start formula never guesses: NULL or out-of-range arguments give NULL", async (t) => {
  const pg = await db(t);
  for (const [g, b] of [[null, 1], [3, null], [null, null], [2, 1], [10, 1], [3, 0], [3, 6]]) {
    const { rows } = await pg.query(
      "SELECT public.difficulty_level_from_grade_band($1::integer, $2::integer) AS level", [g, b]);
    assert.equal(rows[0].level, null, `grade ${g}, band ${b}`);
  }
});

test("the backfill sets a level only where grade and band both exist", async (t) => {
  const pg = await db(t);
  const { rows } = await pg.query("SELECT id, difficulty_level FROM public.questions ORDER BY id");
  assert.deepEqual(rows.map((r) => r.difficulty_level), [143, 3857, 5857, 9857, null, null, null]);

  // The pre-apply check query from the migration header lists exactly the questions left without a level.
  const check = await pg.query(`
    SELECT learning_objective, count(*)::int AS n FROM public.questions
    WHERE target_grade IS NULL OR difficulty_band IS NULL
    GROUP BY 1 ORDER BY 1`);
  assert.deepEqual(check.rows, [
    { learning_objective: "danish", n: 1 },
    { learning_objective: "english", n: 1 },
    { learning_objective: "vikings", n: 1 },
  ]);
  const unlevelled = await pg.query(
    "SELECT count(*)::int AS n FROM public.questions WHERE difficulty_level IS NULL");
  assert.equal(unlevelled.rows[0].n, 3);
});

test("questions.difficulty_level accepts 1-10000 and refuses anything else", async (t) => {
  const pg = await db(t);
  await pg.query("UPDATE public.questions SET difficulty_level = 1 WHERE id = 5");
  await pg.query("UPDATE public.questions SET difficulty_level = 10000 WHERE id = 6");
  for (const bad of [0, 10001, -5]) {
    await assert.rejects(
      pg.query("UPDATE public.questions SET difficulty_level = $1 WHERE id = 7", [bad]),
      /questions_difficulty_level_check/);
  }
});

test("existing columns are untouched", async (t) => {
  const pg = await db(t);
  const { rows } = await pg.query(
    "SELECT target_grade, difficulty_band FROM public.questions ORDER BY id");
  assert.deepEqual(rows.map((r) => [r.target_grade, r.difficulty_band]),
    [[3, 1], [5, 4], [7, 1], [9, 5], [null, 3], [4, null], [null, null]]);
});

test("student_subject_level: the subject and level ranges are enforced", async (t) => {
  const pg = await db(t);
  await pg.query("INSERT INTO public.student_subject_level (student_id, subject, level) VALUES ($1, 'engelsk', 143)", [P1]);
  await assert.rejects(pg.query(
    "INSERT INTO public.student_subject_level (student_id, subject, level) VALUES ($1, 'matematik', 1)", [P1]));
  await assert.rejects(pg.query(
    "INSERT INTO public.student_subject_level (student_id, subject, level) VALUES ($1, 'historie', 0)", [P1]));
  await assert.rejects(pg.query(
    "INSERT INTO public.student_subject_level (student_id, subject, level) VALUES ($1, 'dansk', 10001)", [P1]));
  await assert.rejects(pg.query(
    "INSERT INTO public.student_subject_level (student_id, subject, level) VALUES ($1, 'engelsk', 200)", [P1]),
    /duplicate key/);
});

test("student_subject_level is server-owned: a pupil reads only their own rows and writes nothing", async (t) => {
  const pg = await db(t);
  await pg.query(`INSERT INTO public.student_subject_level (student_id, subject, level) VALUES
    ('${P1}', 'engelsk', 143), ('${P1}', 'historie', 500), ('${P2}', 'engelsk', 9000)`);

  const own = await as(pg, "authenticated", P1,
    "SELECT subject, level FROM public.student_subject_level ORDER BY subject");
  assert.deepEqual(own.rows, [{ subject: "engelsk", level: 143 }, { subject: "historie", level: 500 }]);

  const insert = await as(pg, "authenticated", P1,
    "INSERT INTO public.student_subject_level (student_id, subject, level) VALUES ($1, 'dansk', 10000)", [P1]);
  assert.match(insert.error ?? "", /permission denied/);

  const update = await as(pg, "authenticated", P1,
    "UPDATE public.student_subject_level SET level = 10000 WHERE student_id = $1", [P1]);
  assert.match(update.error ?? "", /permission denied/);

  const del = await as(pg, "authenticated", P1,
    "DELETE FROM public.student_subject_level WHERE student_id = $1", [P1]);
  assert.match(del.error ?? "", /permission denied/);

  const anon = await as(pg, "anon", null, "SELECT * FROM public.student_subject_level");
  assert.match(anon.error ?? "", /permission denied/);

  const formula = await as(pg, "authenticated", P1,
    "SELECT public.difficulty_level_from_grade_band(3, 1)");
  assert.match(formula.error ?? "", /permission denied/);

  const after = await pg.query("SELECT level FROM public.student_subject_level WHERE student_id = $1 AND subject = 'engelsk'", [P1]);
  assert.equal(after.rows[0].level, 143);
});

test("service_role writes student_subject_level", async (t) => {
  const pg = await db(t);
  const ins = await as(pg, "service_role", null,
    "INSERT INTO public.student_subject_level (student_id, subject, level) VALUES ($1, 'engelsk', 143) RETURNING level", [P1]);
  assert.deepEqual(ins.rows, [{ level: 143 }]);
});

test("deleting a profile removes its levels", async (t) => {
  const pg = await db(t);
  await pg.query("INSERT INTO public.student_subject_level (student_id, subject, level) VALUES ($1, 'engelsk', 143)", [P2]);
  await pg.query("DELETE FROM public.profiles WHERE id = $1", [P2]);
  const { rows } = await pg.query("SELECT count(*)::int AS n FROM public.student_subject_level");
  assert.equal(rows[0].n, 0);
});

test("the migration changes no function and no existing grant", () => {
  assert.equal((MIGRATION.match(/CREATE (OR REPLACE )?FUNCTION/g) ?? []).length, 1);
  assert.match(MIGRATION, /CREATE FUNCTION public\.difficulty_level_from_grade_band\(/);
  assert.doesNotMatch(MIGRATION, /DROP /);
  assert.doesNotMatch(MIGRATION, /question_instances/);
  assert.doesNotMatch(MIGRATION, /ALTER TABLE public\.profiles/);
  assert.match(MIGRATION, /Må KUN anvendes via apply_migration med særskilt ejer-autorisation \(D-110\)\./);
});
