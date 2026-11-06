// The 5,000 new English questions (owner decision 2026-11-05): all 31 migrations — grade6_9,
// pilot, batch2-batch6 and batch7-batch10 — run UNMODIFIED, in version order, on top of migration A
// (20261020120000_difficulty_scale_a) against an empty, realistic questions table in a real
// PostgreSQL (PGlite, in-process WebAssembly — no Docker, no network).
//
// HONEST LIMITS: PGlite is PostgreSQL 18.x; production is 17.6. Novelty is checked against every
// other migration in the repository, not against the live bank. Passing is not permission to apply
// (D-110), and nothing here activates a question.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { extractMcQuestions } from "../../tools/question-quality/length-cue.mjs";
import {
  CEFR_ORDER,
  CEFR_RANGES,
  ROLE_BY_CEFR,
  newItemProblems,
  segmentationProblems,
  structuralProblems,
  substanceKey,
} from "../../tools/questions/english-5000-quality.mjs";
import { englishHeadword } from "../../tools/questions/check-english-items.mjs";
import { migrationFiles } from "../../tools/questions/build-english-5000.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = join(ROOT, "supabase", "migrations");
const NEW_FILE = /^20261020(125000_english_grade6_9|1[3-9]000[1-3]_english_level_|2[0-2]000[1-3]_english_level_)/;
const FILES = readdirSync(DIR).filter((f) => NEW_FILE.test(f)).sort();
const read = (name) => readFileSync(join(DIR, name), "utf8");

const BATCH_SIZES = {
  grade6_9: 120, pilot: 500, batch2: 500, batch3: 500, batch4: 500, batch5: 500, batch6: 500,
  batch7: 470, batch8: 470, batch9: 470, batch10: 470,
};
const NEW_BATCHES = ["batch7", "batch8", "batch9", "batch10"];
const CONCEPT_KEY = { "ordforråd": "o", "hverdagsudtryk": "h", "grammatik": "g", "læseforståelse": "l" };

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
  for (const file of FILES) await pg.exec(read(file));
  const rows = (await pg.query("SELECT * FROM public.questions ORDER BY difficulty_level, content->>'question'")).rows;
  await pg.close();
  const items = rows.map((row) => ({
    row,
    batch: row.metadata.level_batch,
    q: row.content.question,
    o: row.content.options,
    a: row.content.correct,
    r: row.content.review_text,
    l: row.difficulty_level,
    cefr: row.metadata.cefr,
    k: CONCEPT_KEY[row.metadata.concepts?.[0]],
  }));
  cached = { rows, items };
  return cached;
}

test("31 migration files: grade6_9, pilot and batch2-batch10 in three parts each", () => {
  assert.equal(FILES.length, 31);
  assert.equal(FILES[0], "20261020125000_english_grade6_9.sql");
  for (const file of FILES) {
    const sql = read(file);
    assert.match(sql, /Må KUN anvendes via apply_migration med særskilt ejer-autorisation \(D-110\)\./, file);
    const code = sql.split("\n").filter((line) => !line.trimStart().startsWith("--")).join("\n");
    assert.doesNotMatch(code, /is_active\s*=\s*true|SET\s+is_active/i, `${file} must not activate anything`);
    // The only UPDATE (grade6_9) adds metadata.cefr to its own rows.
    for (const update of code.match(/^UPDATE\b[\s\S]*?;$/gm) ?? []) {
      assert.match(update, /^UPDATE public\.questions\s+SET metadata = metadata \|\| jsonb_build_object\(/, file);
      assert.match(update, /metadata->>'level_batch' = 'grade6_9';$/, file);
    }
    assert.equal(/Ã|Â|�/.test(sql), false, `mojibake in ${file}`);
  }
  // The migration that wrongly sat before migration A is gone.
  assert.equal(readdirSync(DIR).includes("20261019140000_english_grade6_9.sql"), false);
});

test("exactly 5,000 inactive English MC questions with the agreed batch split", async () => {
  const { rows, items } = await loadAll();
  assert.equal(rows.length, 5000);
  const perBatch = {};
  for (const item of items) perBatch[item.batch] = (perBatch[item.batch] ?? 0) + 1;
  assert.deepEqual(perBatch, BATCH_SIZES);

  for (const { row, q, o, a } of items) {
    assert.equal(row.learning_objective, "english", q);
    assert.equal(row.is_active, false, `inserted inactive: ${q}`);
    assert.equal(row.answer_format, "mc");
    assert.equal(row.type, "mc_single");
    assert.equal(row.question_type, "auto");
    assert.equal(row.metadata.domain, "english");
    assert.ok(Object.hasOwn(BATCH_SIZES, row.metadata.level_batch), `level_batch ${row.metadata.level_batch}`);
    assert.equal(o.length, 4, q);
    assert.equal(new Set(o).size, 4, `four different answers: ${q}`);
    assert.ok(o.includes(a), `correct among the options: ${q}`);
    assert.deepEqual(row.content.accepted_answers, [a], q);
  }
});

test("every question has an explicit level 1-10,000 inside its CEFR range and its §4.1 cell", async () => {
  const { items } = await loadAll();
  for (const { row, q, l, cefr } of items) {
    assert.ok(Number.isInteger(l) && l >= 1 && l <= 10000, `level ${l}: ${q}`);
    const [lo, hi] = CEFR_RANGES[cefr] ?? [];
    assert.ok(lo, `invalid cefr ${cefr}: ${q}`);
    assert.ok(l >= lo && l <= hi, `${l} outside ${cefr}: ${q}`);
    const cell = (row.target_grade - 3) * 5 + (row.difficulty_band - 1);
    assert.ok(l > (cell * 10000) / 35 && l <= ((cell + 1) * 10000) / 35, `level ${l} not in grade/band cell: ${q}`);
    assert.equal(row.difficulty, row.difficulty_band);
    if (row.metadata.level_batch !== "grade6_9") {
      assert.deepEqual([row.metadata.challenge_role, row.metadata.insight_type], ROLE_BY_CEFR[cefr], q);
    }
  }
  const levels = items.map((item) => item.l);
  assert.equal(Math.min(...levels), 1);
  assert.equal(Math.max(...levels), 10000);
});

test("CEFR coverage: every level group is filled, and batch7-batch10 each span all six", async () => {
  const { items } = await loadAll();
  const perCefr = {};
  for (const { cefr } of items) perCefr[cefr] = (perCefr[cefr] ?? 0) + 1;
  // After the E5 review (2026-11-05), which moved 97 reused questions a full CEFR band down.
  assert.deepEqual(perCefr, { "pre-A1": 440, A1: 525, A2: 753, B1: 1183, B2: 1086, C1: 1013 });
  for (const batch of NEW_BATCHES) {
    const own = items.filter((item) => item.batch === batch);
    for (const cefr of CEFR_ORDER) {
      assert.ok(own.filter((item) => item.cefr === cefr).length >= 40, `${batch} has too few ${cefr}`);
    }
    const levels = own.map((item) => item.l);
    assert.ok(Math.min(...levels) <= 100 && Math.max(...levels) >= 9900, `${batch} spans the whole scale`);
  }
});

test("the correct answer is spread over the four positions", async () => {
  const { items } = await loadAll();
  const count = (list) => {
    const pos = [0, 0, 0, 0];
    for (const { o, a } of list) pos[o.indexOf(a)]++;
    return pos;
  };
  for (const batch of NEW_BATCHES) {
    for (const n of count(items.filter((item) => item.batch === batch))) assert.ok(n === 117 || n === 118, `${batch}: ${n}`);
  }
  for (const batch of ["pilot", "batch2", "batch3", "batch4", "batch5", "batch6"]) {
    assert.deepEqual(count(items.filter((item) => item.batch === batch)), [125, 125, 125, 125], batch);
  }
  for (const n of count(items)) assert.ok(n >= 1220 && n <= 1280, `overall position count ${n}`);
});

test("quality: no length cue, plausible structure and correct read-aloud language for all 5,000", async () => {
  const { items } = await loadAll();
  const problems = [];
  for (const item of items) {
    for (const problem of [...structuralProblems(item), ...segmentationProblems(item)]) problems.push(`${item.q}: ${problem}`);
    if (NEW_BATCHES.includes(item.batch)) {
      for (const problem of newItemProblems(item)) problems.push(`${item.q}: ${problem}`);
    }
  }
  assert.deepEqual(problems, []);
});

// Same task = same template and main word/sentence (substanceKey) with an overlapping answer, or the
// same reading text / fill-in sentence. A word asked twice with different meanings ('miss' a train,
// 'miss' a friend) is two tasks.
const norm = (text) => String(text).toLowerCase().replace(/[^a-zæøå ]+/g, " ").replace(/\s+/g, " ").trim();
const parts = (answer) => new Set(String(answer).toLowerCase().split(/[/,;()]| eller /).map(norm).filter(Boolean));
function sameTask(left, right) {
  const key = substanceKey(left.q);
  if (key !== substanceKey(right.q)) return false;
  if (key.startsWith("read:") || key.startsWith("sentence:")) return true;
  for (const part of parts(left.a)) if (parts(right.a).has(part)) return true;
  return false;
}

function otherBank() {
  const bank = new Map();
  for (const file of readdirSync(DIR).filter((f) => f.endsWith(".sql") && !NEW_FILE.test(f))) {
    for (const question of extractMcQuestions(read(file))) {
      if (typeof question.question !== "string") continue;
      const item = { q: question.question, a: question.correct, file };
      const key = substanceKey(item.q);
      if (!bank.has(key)) bank.set(key, []);
      bank.get(key).push(item);
    }
  }
  return bank;
}

test("all 5,000 are new: unique texts, and no task repeats one in another migration or each other", async () => {
  const { items } = await loadAll();
  assert.equal(new Set(items.map((item) => item.q)).size, 5000, "question texts are unique");
  const bank = otherBank();
  const texts = new Set([...bank.values()].flat().map((item) => item.q));
  const problems = [];
  const seen = new Map();
  for (const item of items) {
    if (texts.has(item.q)) problems.push(`text already in the bank: ${item.q}`);
    const key = substanceKey(item.q);
    for (const other of bank.get(key) ?? []) {
      if (sameTask(item, other)) problems.push(`same task as ${other.file}: ${item.q}`);
    }
    for (const other of seen.get(key) ?? []) {
      if (sameTask(item, other)) problems.push(`same task twice: ${item.q} / ${other.q}`);
    }
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key).push(item);
  }
  assert.deepEqual(problems, []);
});

test("questions written from scratch ask about English words the rest of the bank never asks", async () => {
  const { items } = await loadAll();
  const asked = new Set();
  for (const file of readdirSync(DIR).filter((f) => f.endsWith(".sql") && !/^202610202[0-2]|^2026102019/.test(f))) {
    for (const question of extractMcQuestions(read(file))) {
      const headword = typeof question.question === "string" ? englishHeadword(question.question, question.correct) : null;
      if (headword) asked.add(headword);
    }
  }
  const authored = items.filter((item) => item.row.metadata.practice_variant === "authored");
  const reverse = items.filter((item) => item.row.metadata.practice_variant === "reverse_meaning");
  assert.equal(authored.length + reverse.length, 1880);
  for (const item of authored) {
    const headword = englishHeadword(item.q, item.a);
    assert.ok(!headword || !asked.has(headword), `word already asked elsewhere: ${item.q}`);
  }
  // A reverse question asks a word of pilot/batch2-batch6 the other way round (Danish → English).
  for (const item of reverse) assert.match(item.q, /^Hvad hedder '[^']+' på engelsk( i '.+')?\?$/);
});

test("batch7-batch10 are exactly what the generator builds from its inputs", () => {
  const files = migrationFiles();
  assert.equal(Object.keys(files).length, 12);
  for (const [name, sql] of Object.entries(files)) assert.equal(read(name), sql, `${name} is out of date`);
});

test("the E5 sample is deterministic and covers every portion × CEFR cell (10 %, at least 6)", async () => {
  const { e5Sample, allNewQuestions, levelBatch, E5_MIN, E5_RATE } = await import("../../tools/questions/english-5000-sample.mjs");
  const first = e5Sample();
  assert.deepEqual(e5Sample().map((item) => item.q), first.map((item) => item.q));
  const cells = new Map();
  for (const item of allNewQuestions()) {
    const key = `${levelBatch(item.file)}|${item.cefr}`;
    cells.set(key, (cells.get(key) ?? 0) + 1);
  }
  for (const [key, size] of cells) {
    const picked = first.filter((item) => `${item.batch}|${item.cefr}` === key).length;
    assert.equal(picked, Math.min(size, Math.max(E5_MIN, Math.ceil(size * E5_RATE))), key);
  }
});

test("the production precheck only reads, and expects the real portion sizes", async () => {
  const { beforeSql, afterSql, portionSizes, EXPECTED_PER_BATCH } = await import("../../tools/questions/english-5000-precheck.mjs");
  for (const sql of [beforeSql(), afterSql()]) {
    const code = sql.split("\n").filter((line) => !line.startsWith("--")).join("\n");
    assert.doesNotMatch(code, /\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|GRANT|REVOKE|TRUNCATE)\b/i);
    assert.match(code, /SELECT/);
  }
  assert.equal((beforeSql().match(/'[0-9a-f]{32}'/g) ?? []).length, 5000);
  assert.deepEqual(portionSizes(), EXPECTED_PER_BATCH);
  assert.equal(Object.values(EXPECTED_PER_BATCH).reduce((sum, n) => sum + n, 0), 5000);
});
