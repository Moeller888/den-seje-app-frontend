// The 5,000 new Danish questions: all 30 migrations run UNMODIFIED, in version order, on top of
// migration A (20261020120000_difficulty_scale_a) against an empty, realistic questions table in a
// real PostgreSQL (PGlite, in-process WebAssembly: no Docker, no network).
//
// HONEST LIMITS: PGlite is PostgreSQL 18.x; production is 17.6. Novelty is checked against every
// other migration in the repository, not against the live bank. The checks prove structure, not that
// the Danish is right. Passing is not permission to apply (D-110), and nothing here activates a question.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { findLengthCue } from "../../tools/question-quality/length-cue.mjs";
import { CONCEPTS, QUOTA, blockedTopicProblems, gradeBandForLevel, roleForLevel, structuralProblems, substanceKey } from "../../tools/questions/danish-5000-quality.mjs";
import { bankTexts, teacherApproved } from "../../tools/questions/check-danish-items.mjs";
import { migrationFiles } from "../../tools/questions/build-danish-5000.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = join(ROOT, "supabase", "migrations");
const FILES = readdirSync(DIR).filter((f) => /_danish_level_batch\d+_[123]\.sql$/.test(f)).sort();
const read = (name) => readFileSync(join(DIR, name), "utf8");

// The production grading normaliser, taken verbatim from the applied D-290 G1 migration.
function normalizerSql() {
  const sql = read("20261101150000_grading_meaningful_characters.sql");
  const start = sql.indexOf("CREATE OR REPLACE FUNCTION public.normalize_choice_answer");
  const endMarker = "$norm_choice$;";
  const end = sql.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, "normalize_choice_answer not found");
  return sql.slice(start, end + endMarker.length);
}

let cached = null;
async function loadAll() {
  if (cached) return cached;
  const pg = new PGlite();
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
  `);
  await pg.exec(read("20261020120000_difficulty_scale_a.sql"));
  await pg.exec(normalizerSql());
  for (const file of FILES) await pg.exec(read(file));
  const rows = (await pg.query("SELECT * FROM public.questions ORDER BY difficulty_level, content->>'question'")).rows;
  const badGrading = (await pg.query(`
    SELECT content->>'question' AS q
    FROM public.questions
    WHERE (SELECT count(DISTINCT public.normalize_choice_answer(o)) FROM jsonb_array_elements_text(content->'options') o) <> 4
       OR (SELECT count(*) FROM jsonb_array_elements_text(content->'options') o
           WHERE public.normalize_choice_answer(o) = public.normalize_choice_answer(content->>'correct')) <> 1
  `)).rows;
  await pg.close();
  cached = { rows, badGrading };
  return cached;
}

test("thirty migrations insert 5,000 rows, 500 per portion, all inactive", async () => {
  assert.equal(FILES.length, 30);
  const { rows } = await loadAll();
  assert.equal(rows.length, 5000);
  const perBatch = {};
  for (const row of rows) {
    assert.equal(row.is_active, false);
    assert.equal(row.learning_objective, "danish");
    assert.equal(row.metadata.domain, "danish");
    assert.equal(row.answer_format, "mc");
    assert.equal(row.answer_type, "short");
    assert.equal(row.question_type, "auto");
    perBatch[row.metadata.level_batch] = (perBatch[row.metadata.level_batch] ?? 0) + 1;
  }
  assert.deepEqual(Object.keys(perBatch).sort(), Array.from({ length: 10 }, (_, i) => `danish${i + 1}`).sort());
  assert.ok(Object.values(perBatch).every((count) => count === 500));
});

test("no migration activates anything or touches other rows", () => {
  for (const file of FILES) {
    const sql = read(file);
    assert.doesNotMatch(sql.replace(/^--.*$/gm, ""), /\b(UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b(?![^$]*\$\$::jsonb)/);
    assert.equal((sql.match(/INSERT INTO public\.questions/g) ?? []).length, 1);
  }
});

test("level, grade, band, role and concept agree, and the quota holds", async () => {
  const { rows } = await loadAll();
  const counts = {};
  for (const row of rows) {
    const { g, b } = gradeBandForLevel(row.difficulty_level);
    assert.equal(row.target_grade, g);
    assert.equal(row.difficulty_band, b);
    assert.equal(row.difficulty, b);
    assert.deepEqual([row.metadata.challenge_role, row.metadata.insight_type], roleForLevel(row.difficulty_level));
    const key = Object.keys(CONCEPTS).find((k) => CONCEPTS[k].concept === row.metadata.concepts[0]);
    assert.ok(key, `unknown concept ${row.metadata.concepts[0]}`);
    counts[`${g}${key}`] = (counts[`${g}${key}`] ?? 0) + 1;
  }
  for (const [grade, quota] of Object.entries(QUOTA)) {
    for (const [key, want] of Object.entries(quota)) assert.equal(counts[`${grade}${key}`], want, `grade ${grade} ${key}`);
  }
});

test("every portion spans the scale and the answer stands evenly on the four places", async () => {
  const { rows } = await loadAll();
  const levels = {};
  const places = [0, 0, 0, 0];
  const perBatch = {};
  for (const row of rows) {
    const batch = row.metadata.level_batch;
    (levels[batch] ??= []).push(row.difficulty_level);
    const place = row.content.options.indexOf(row.content.correct);
    places[place]++;
    (perBatch[batch] ??= [0, 0, 0, 0])[place]++;
  }
  for (const list of Object.values(levels)) {
    assert.ok(Math.min(...list) < 100 && Math.max(...list) > 9900);
  }
  assert.deepEqual(places, [1250, 1250, 1250, 1250]);
  for (const counts of Object.values(perBatch)) assert.ok(counts.every((n) => n === 125));
});

test("production grading tells the four options apart and accepts exactly the key", async () => {
  const { badGrading } = await loadAll();
  assert.deepEqual(badGrading, []);
});

test("every row passes the structure, length and text rules", async () => {
  const { rows } = await loadAll();
  const bank = bankTexts();
  const texts = new Set();
  const substance = new Set();
  for (const row of rows) {
    const k = Object.keys(CONCEPTS).find((key) => CONCEPTS[key].concept === row.metadata.concepts[0]);
    const item = { q: row.content.question, o: row.content.options, a: row.content.correct, r: row.content.review_text, l: row.difficulty_level, k };
    assert.deepEqual(structuralProblems(item), [], item.q);
    assert.equal(findLengthCue(item.o, item.a), null, item.q);
    assert.deepEqual(row.content.accepted_answers, [item.a]);
    assert.equal(bank.has(item.q), false, `already in the bank: ${item.q}`);
    assert.equal(texts.has(item.q), false, `duplicate: ${item.q}`);
    texts.add(item.q);
    const key = substanceKey(item);
    assert.equal(substance.has(key), false, `same task twice: ${key}`);
    substance.add(key);
  }
});

test("no row is on a blocked topic, except the texts a teacher has passed", async () => {
  const { rows } = await loadAll();
  const approved = teacherApproved();
  assert.equal(approved.size, 7);
  const found = [];
  for (const row of rows) {
    const k = Object.keys(CONCEPTS).find((key) => CONCEPTS[key].concept === row.metadata.concepts[0]);
    found.push(...blockedTopicProblems({ k, q: row.content.question }, approved));
  }
  assert.deepEqual(found, []);
  assert.deepEqual(blockedTopicProblems({ k: "l", q: "Læs: 'Efter begravelsen gik de hjem.' Hvad sker der?" }, approved).length, 1);
  assert.deepEqual(blockedTopicProblems({ k: "l", q: "Læs: 'Da morfar blev syg, flyttede de.' Hvad sker der?" }, approved).length, 1);
  assert.deepEqual(blockedTopicProblems({ k: "s", q: "Sæt ind: 'Stedet, hvor du kommer hen, hvis du er meget syg.'" }, approved), []);
});

test("the migration files are exactly the generator's output", () => {
  const files = migrationFiles();
  assert.deepEqual([...files.keys()].sort(), FILES);
  for (const [name, sql] of files) assert.equal(read(name), sql, name);
});
