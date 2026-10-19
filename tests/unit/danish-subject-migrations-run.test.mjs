// The Danish subject (dansk, 3.-5. klasse): its two migrations, run UNMODIFIED against a real
// PostgreSQL (PGlite, in-process WebAssembly — no Docker, no network), plus the frontend wiring.
//
//   20261019120000_placement_exclude_danish  start_placement() keeps 'danish' out, as it keeps
//                                            'english' out — ONE line differs from 20261016160000.
//   20261019120001_danish_grade3_5           90 MC questions, learning_objective 'danish'.
//
// HONEST LIMITS: PGlite is PostgreSQL 18.x; production is 17.6. The fixture is the minimum
// start_placement() reads. The live start_placement() must be diffed against 20261016160000 before
// applying (see the migration header). Passing is not permission to apply (D-110).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const BASE = read("supabase/migrations/20261016160000_answer_keys_server_side_rpcs.sql");
const PLACEMENT = read("supabase/migrations/20261019120000_placement_exclude_danish.sql");
const QUESTIONS = read("supabase/migrations/20261019120001_danish_grade3_5.sql");

const fnBody = (sql, head) => {
  const start = sql.indexOf(head);
  assert.ok(start >= 0, `${head} not found`);
  return sql.slice(start, sql.indexOf("\n$$;", start) + 4);
};

test("start_placement differs from 20261016160000 in exactly the one learning_objective line", () => {
  const before = fnBody(BASE, "CREATE FUNCTION public.start_placement()");
  const after = fnBody(PLACEMENT, "CREATE OR REPLACE FUNCTION public.start_placement()");
  const a = before.split("\n");
  const b = after.split("\n");
  assert.equal(a.length, b.length);
  const diff = a.map((line, i) => [line, b[i]]).filter(([x, y]) => x !== y);
  assert.deepEqual(diff, [
    ["CREATE FUNCTION public.start_placement()", "CREATE OR REPLACE FUNCTION public.start_placement()"],
    ["        AND q.learning_objective <> 'english'            -- placement measures history level only",
     "        AND q.learning_objective NOT IN ('english', 'danish')  -- placement measures history level only"],
  ]);
  assert.match(PLACEMENT, /REVOKE ALL ON FUNCTION public\.start_placement\(\) FROM PUBLIC, anon;/);
  assert.match(PLACEMENT, /GRANT EXECUTE ON FUNCTION public\.start_placement\(\) TO authenticated;/);
});

const P1 = "00000000-0000-4000-8000-000000000001";   // pupil, grade 5, unplaced
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

async function fixture(t) {
  const pg = new PGlite();
  t.after(() => pg.close());
  await pg.exec(`
    CREATE ROLE anon NOBYPASSRLS; CREATE ROLE authenticated NOBYPASSRLS; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    INSERT INTO auth.users VALUES ('${P1}');
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text NOT NULL, selected_grade smallint,
      placement_band smallint);
    INSERT INTO public.profiles VALUES ('${P1}', 'student', 5, NULL);
    CREATE TABLE public.questions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), content jsonb NOT NULL,
      answer_format text NOT NULL, answer_type text DEFAULT 'short', metadata jsonb, type text,
      difficulty integer, question_type text, is_active boolean NOT NULL DEFAULT true,
      learning_objective text, target_grade smallint
        CHECK (target_grade IS NULL OR (target_grade >= 3 AND target_grade <= 9)),
      difficulty_band smallint);
    CREATE TABLE public.placement_sessions (
      student_id   uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      question_ids uuid[]      NOT NULL,
      created_at   timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz,
      band         smallint    CHECK (band BETWEEN 1 AND 4)
    );
  `);
  return pg;
}

async function as(pg, role, uid, sql) {
  await pg.exec("BEGIN");
  try {
    await pg.exec(`SET LOCAL ROLE ${role}`);
    await pg.query("SELECT set_config('test.uid', $1, true)", [uid]);
    const r = await pg.query(sql);
    await pg.exec("COMMIT");
    return { rows: r.rows };
  } catch (e) {
    await pg.exec("ROLLBACK");
    return { error: String(e.message) };
  }
}

const mc = (n) => JSON.stringify({ question: `Spørgsmål ${n}?`, options: [`Svar${n}`, "A", "B", "C"], correct: `Svar${n}` });

test("placement draws history only: never English, never Danish", async (t) => {
  const pg = await fixture(t);
  await pg.exec(PLACEMENT);
  await pg.exec(QUESTIONS);
  // 12 history MC questions within grade 5 (bands 1×4, 2×4, 3×2, 4×2), plus one English question.
  const bands = [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 4, 4];
  for (const [i, band] of bands.entries()) {
    await pg.query(`INSERT INTO public.questions (id, content, answer_format, learning_objective, target_grade, difficulty_band)
      VALUES ($1, $2, 'mc', 'vikings', 5, $3)`, [id(100 + i), mc(i), band]);
  }
  await pg.query(`INSERT INTO public.questions (id, content, answer_format, learning_objective, target_grade, difficulty_band)
    VALUES ($1, $2, 'mc', 'english', 3, 1)`, [id(200), mc("en")]);

  const r = await as(pg, "authenticated", P1, "SELECT public.start_placement() AS q");
  assert.equal(r.error, undefined);
  const ids = r.rows[0].q.map((x) => x.id);
  assert.equal(ids.length, 10);
  const los = (await pg.query("SELECT DISTINCT learning_objective FROM public.questions WHERE id = ANY($1::uuid[])", [ids])).rows;
  assert.deepEqual(los.map((x) => x.learning_objective), ["vikings"], "only history in placement");
  assert.match((await as(pg, "anon", "", "SELECT public.start_placement()")).error, /permission denied/);
});

test("the Danish migration inserts 90 well-formed MC questions for grades 3-5", async (t) => {
  const pg = await fixture(t);
  await pg.exec(QUESTIONS);
  const rows = (await pg.query("SELECT * FROM public.questions ORDER BY target_grade, difficulty_band")).rows;
  assert.equal(rows.length, 90);
  const perGrade = {};
  for (const q of rows) {
    perGrade[q.target_grade] = (perGrade[q.target_grade] ?? 0) + 1;
    assert.equal(q.learning_objective, "danish");
    assert.equal(q.metadata.domain, "danish");
    assert.equal(q.answer_format, "mc");
    assert.equal(q.question_type, "auto");
    assert.equal(q.is_active, true);
    assert.ok([1, 2, 3, 4].includes(q.difficulty_band));
    assert.equal(q.difficulty, q.difficulty_band);
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
  assert.deepEqual(perGrade, { 3: 30, 4: 30, 5: 30 });
  // Every band is used in every grade, and the correct option is not always in the same place.
  for (const g of [3, 4, 5]) {
    const bandsUsed = new Set(rows.filter((q) => q.target_grade === g).map((q) => q.difficulty_band));
    assert.deepEqual([...bandsUsed].sort(), [1, 2, 3, 4]);
  }
  const positions = new Set(rows.map((q) => q.content.options.indexOf(q.content.correct)));
  assert.deepEqual([...positions].sort(), [0, 1, 2, 3]);
});

test("the frontend offers dansk and sends it as the subject", () => {
  const spil = read("spil.html");
  assert.match(spil, /<a class="spil-card" href="index\.html\?fag=dansk">[\s\S]*?<span class="spil-name">Dansk<\/span>/);
  const app = read("app.js");
  assert.match(app, /fagParam === "dansk" \? "dansk"/);
  assert.match(app, /SUBJECT_LABEL = \{ engelsk: "Engelsk", dansk: "Dansk" \}/);
  assert.match(app, /subject: currentSubject/);
  assert.match(read("js/student-detail.js"), /danish:\s+"Dansk"/);
});
