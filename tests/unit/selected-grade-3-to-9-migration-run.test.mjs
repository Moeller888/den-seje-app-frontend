// Klassetrin 3.-6.: migration 20261019130000_selected_grade_3_to_9, run UNMODIFIED against a real
// PostgreSQL (PGlite, in-process WebAssembly — no Docker, no network), on a fixture built from
// 20260529000000_grade_difficulty_schema (the constraint and set_student_grade it replaces), plus
// the grade selector in index.html/app.js. The EXECUTE grants are the LIVE ones (read 2026-10-19:
// PUBLIC, anon, authenticated, service_role); CREATE OR REPLACE must leave them exactly as they are.
//
// HONEST LIMITS: PGlite is PostgreSQL 18.x; production is 17.6. auth.uid() reads `test.uid`. The live
// constraint and function must be diffed against 20260529000000 before applying (see the migration
// header). Passing is not permission to apply (D-110).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const BEFORE = read("supabase/migrations/20260529000000_grade_difficulty_schema.sql");
const MIGRATION = read("supabase/migrations/20261019130000_selected_grade_3_to_9.sql");

const P1 = "00000000-0000-4000-8000-000000000001";
const P2 = "00000000-0000-4000-8000-000000000002";   // existing grade-9 pupil

const BEFORE_FN = BEFORE.slice(BEFORE.indexOf("CREATE OR REPLACE FUNCTION public.set_student_grade"),
  BEFORE.indexOf("$$;", BEFORE.indexOf("CREATE OR REPLACE FUNCTION public.set_student_grade")) + 3);

async function fixture(t) {
  const pg = new PGlite();
  t.after(() => pg.close());
  await pg.exec(`
    CREATE ROLE anon NOBYPASSRLS; CREATE ROLE authenticated NOBYPASSRLS; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated;
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text NOT NULL, selected_grade smallint);
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_selected_grade_check
      CHECK (selected_grade IS NULL OR selected_grade IN (7, 8, 9));
    INSERT INTO public.profiles VALUES ('${P1}', 'student', NULL), ('${P2}', 'student', 9);
    ${BEFORE_FN}
    GRANT EXECUTE ON FUNCTION public.set_student_grade(smallint) TO anon, authenticated, service_role;
  `);
  return pg;
}

async function setGrade(pg, uid, grade, role = "authenticated") {
  await pg.exec("BEGIN");
  try {
    await pg.exec(`SET LOCAL ROLE ${role}`);
    await pg.query("SELECT set_config('test.uid', $1, true)", [uid]);
    await pg.query("SELECT public.set_student_grade($1::smallint)", [grade]);
    await pg.exec("COMMIT");
    return null;
  } catch (e) {
    await pg.exec("ROLLBACK");
    return String(e.message);
  }
}
const gradeOf = async (pg, uid) => (await pg.query("SELECT selected_grade FROM public.profiles WHERE id = $1", [uid])).rows[0].selected_grade;

test("before the migration, grade 3-6 is refused (the bug this fixes)", async (t) => {
  const pg = await fixture(t);
  assert.match(await setGrade(pg, P1, 4), /invalid_grade/);
});

test("after the migration, grades 3-9 are accepted and stored; existing rows are kept", async (t) => {
  const pg = await fixture(t);
  await pg.exec(MIGRATION);
  assert.equal(await gradeOf(pg, P2), 9, "existing grade untouched");
  for (const g of [3, 4, 5, 6, 7, 8, 9]) {
    assert.equal(await setGrade(pg, P1, g), null, `grade ${g}`);
    assert.equal(await gradeOf(pg, P1), g);
  }
});

test("out-of-range and NULL grades are still refused, at the RPC and at the column", async (t) => {
  const pg = await fixture(t);
  await pg.exec(MIGRATION);
  for (const g of [0, 1, 2, 10, -3, null]) {
    assert.match(await setGrade(pg, P1, g) ?? "", /invalid_grade/, `grade ${g}`);
  }
  await assert.rejects(pg.query("UPDATE public.profiles SET selected_grade = 2 WHERE id = $1", [P1]), /profiles_selected_grade_check/);
  await assert.rejects(pg.query("UPDATE public.profiles SET selected_grade = 10 WHERE id = $1", [P1]), /profiles_selected_grade_check/);
});

test("set_student_grade keeps its security shape: definer, search_path, grants, auth check", async (t) => {
  const pg = await fixture(t);
  const shape = async () => (await pg.query(`SELECT prosecdef, proconfig, proacl::text AS acl FROM pg_proc
    WHERE oid = 'public.set_student_grade(smallint)'::regprocedure`)).rows[0];
  const before = await shape();
  await pg.exec(MIGRATION);
  const after = await shape();
  assert.deepEqual(after, before, "definer, search_path and grants unchanged");
  assert.equal(after.prosecdef, true);
  assert.deepEqual(after.proconfig, ["search_path=public"]);
  // A caller without a user (anon, or no JWT) still cannot set anything.
  assert.match(await setGrade(pg, "", 5) ?? "", /not_authenticated/);
  assert.match(await setGrade(pg, "", 5, "anon") ?? "", /not_authenticated/);
  assert.equal(await gradeOf(pg, P1), null);
});

test("the selector offers 3.-9. klasse and every grade has a start band", () => {
  const html = read("index.html");
  const grades = [...html.matchAll(/<button class="grade-btn" data-grade="(\d)">(\d)\. klasse<\/button>/g)];
  assert.deepEqual(grades.map((m) => Number(m[1])), [3, 4, 5, 6, 7, 8, 9]);
  for (const m of grades) assert.equal(m[1], m[2]);
  assert.match(read("app.js"), /const GRADE_START_BAND = \{ 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 2, 9: 3 \};/);
});
