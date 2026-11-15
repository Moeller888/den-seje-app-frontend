// Engelsk 5.000, rettelser: migration 20261113120000_english_review_text_corrections run UNMODIFIED on top
// of migration A, the pilot and portions 2-4 against a real PostgreSQL (PGlite, in-process WebAssembly — no
// Docker, no network). The nine questions get their production ids (looked up by their reviewed question
// text), so the file's content fingerprints are checked against what the repository's INSERT files build.
//
// HONEST LIMITS: PGlite is PostgreSQL 18.x; production is 17.6. The fixture holds only what the
// migrations touch. The old fingerprints were read in production on 2026-11-13; here they prove that the
// repository builds the same content. Passing is not permission to apply (D-110).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { REVIEW_TEXT_CORRECTIONS } from "../../tools/questions/build-english-5000.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (n) => readFileSync(join(ROOT, "supabase", "migrations", n), "utf8");
const MIGRATION_A = read("20261020120000_difficulty_scale_a.sql");
const SOURCES = ["pilot", "batch2", "batch3", "batch4"].flatMap((batch, index) =>
  [1, 2, 3].map((n) => read(`20261020${13 + index}000${n}_english_level_${batch}_${n}.sql`)));
const FIX = read("20261113120000_english_review_text_corrections.sql");
const LIST = JSON.parse(FIX.slice(FIX.indexOf("$j$[") + 3, FIX.indexOf("]$j$") + 1));

// The reviewed question text of each row (runbook §2.8 and the production logs).
const OLD_QUESTION = {
  "5a26a219-5e47-493b-871b-dca3ae781da0": "Hvilket ord passer: 'She has a ___ memory. She never forgets anything.'",
  "3cf224e8-b08a-4ab3-b4d8-de4d72f09e6e": "Hvad betyder 'suppose' i 'I suppose you're right'?",
  "bc9fddd1-bfc2-42c1-a25f-edca68d1df90": "Hvilket ord passer: 'Supposing he ___ the truth, what would you do?'",
  "d5ed354d-186e-4ab2-9b8d-f5dd4dfd297a": "Hvad betyder 'unanimous'?",
  "aebc0b79-f77b-4621-a4ac-9ce3fa867522": "Hvad betyder 'Sounds good!'?",
  "6668f28f-7951-4888-b7fa-5b7d274781f3": "Hvilket ord betyder det modsatte af 'maximum'?",
  "15372b8d-039e-4125-9f34-fe7900142433": "Læs: 'My grandfather was only eighteen when the war broke out, and he was twenty-three when it ended.' Hvor længe varede krigen?",
  "214ebebf-2f13-4ec4-b7ff-03be35eb2d8a": "Hvilket ord passer: 'She's a ___ smoker. She smokes forty a day.'",
  "29c46027-0fab-416f-b689-f444782e9a1f": "Hvilket ord passer: 'My grandfather ___ to smoke, but he stopped years ago.'",
};
const IDS = Object.keys(OLD_QUESTION);

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
    CREATE TABLE public.question_instances (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      question_id uuid NOT NULL REFERENCES public.questions(id), answered boolean NOT NULL DEFAULT false);
  `);
  await pg.exec(MIGRATION_A);
  for (const sql of SOURCES) await pg.exec(sql);
  for (const [id, question] of Object.entries(OLD_QUESTION)) {
    const moved = await pg.query("UPDATE public.questions SET id = $1 WHERE content->>'question' = $2", [id, question]);
    assert.equal(moved.affectedRows, 1, `exactly one source row for ${question}`);
  }
  return pg;
}

const snapshot = async (pg) => (await pg.query(`
  SELECT id::text, content, md5(content::text) AS content_md5, md5(metadata::text) AS metadata_md5, is_active,
         answer_format, difficulty_level, target_grade, difficulty_band
  FROM public.questions ORDER BY id`)).rows;

test("the file lists the nine reviewed questions, and the repository builds exactly their production content", async (t) => {
  assert.deepEqual(LIST.map((row) => row.id).sort(), [...IDS].sort());
  const pg = await load(t);
  for (const row of LIST) {
    const found = (await pg.query("SELECT md5(content::text) AS m, metadata->>'level_batch' AS b, is_active FROM public.questions WHERE id = $1", [row.id])).rows;
    assert.equal(found.length, 1);
    assert.equal(found[0].m, row.old_md5, `old fingerprint of ${row.id}`);
    assert.equal(found[0].b, row.level_batch);
    assert.equal(found[0].is_active, false);
  }
});

test("the fix changes only question/review_text of the nine rows and nothing else in the bank", async (t) => {
  const pg = await load(t);
  const before = await snapshot(pg);
  await pg.exec(FIX);
  const after = await snapshot(pg);
  assert.equal(after.length, before.length);
  const byId = new Map(after.map((row) => [row.id, row]));
  let changed = 0;
  for (const old of before) {
    const now = byId.get(old.id);
    const fix = LIST.find((row) => row.id === old.id);
    if (!fix) {
      assert.deepEqual(now, old, `untouched row ${old.id}`);
      continue;
    }
    changed++;
    assert.equal(now.content_md5, fix.new_md5);
    assert.equal(now.content.review_text, fix.review_text);
    assert.equal(now.content.question, fix.question ?? old.content.question);
    for (const key of ["correct", "options", "accepted_answers"]) assert.deepEqual(now.content[key], old.content[key], `${key} of ${old.id}`);
    assert.deepEqual(Object.keys(now.content).sort(), Object.keys(old.content).sort());
    for (const key of ["metadata_md5", "is_active", "answer_format", "difficulty_level", "target_grade", "difficulty_band"]) {
      assert.equal(now[key], old[key], `${key} of ${old.id}`);
    }
    assert.ok(now.content.options.includes(now.content.correct));
  }
  assert.equal(changed, 9);
  for (const id of IDS) {
    const text = byId.get(id).content.question + " " + byId.get(id).content.review_text;
    assert.doesNotMatch(text, /smok|\bwar\b|krig|Flyt til|reel fælde|Gæst|Hypotese om fortiden|strong \(or good\)/i, id);
  }
});

test("a second run finds no reviewed content and changes nothing", async (t) => {
  const pg = await load(t);
  await pg.exec(FIX);
  const before = await snapshot(pg);
  await assert.rejects(pg.exec(FIX), /expected 9 inactive questions with the reviewed content, found 0/);
  assert.deepEqual(await snapshot(pg), before);
});

test("an active, edited or already used question stops the whole fix", async (t) => {
  const cases = [
    ["UPDATE public.questions SET is_active = true WHERE id = '29c46027-0fab-416f-b689-f444782e9a1f'", /found 8/],
    ["UPDATE public.questions SET content = content || '{\"review_text\": \"x\"}' WHERE id = '5a26a219-5e47-493b-871b-dca3ae781da0'", /found 8/],
    ["UPDATE public.questions SET metadata = metadata || '{\"level_batch\": \"batch5\"}' WHERE id = 'aebc0b79-f77b-4621-a4ac-9ce3fa867522'", /found 8/],
    ["INSERT INTO public.question_instances (question_id) VALUES ('15372b8d-039e-4125-9f34-fe7900142433')", /1 question_instances row/],
  ];
  for (const [setup, error] of cases) {
    const pg = await load(t);
    await pg.exec(setup);
    const before = await snapshot(pg);
    await assert.rejects(pg.exec(FIX), error, setup);
    assert.deepEqual(await snapshot(pg), before, setup);
  }
});

test("the generator's correction for the reverse questions is the migration's text", () => {
  const unanimous = LIST.find((row) => row.id === "d5ed354d-186e-4ab2-9b8d-f5dd4dfd297a");
  assert.equal(REVIEW_TEXT_CORRECTIONS[OLD_QUESTION[unanimous.id]].to, unanimous.review_text);
  const batch73 = read("20261020190003_english_level_batch7_3.sql");
  assert.ok(batch73.includes(`"r":${JSON.stringify(unanimous.review_text)}`));
  assert.ok(!batch73.includes("reel fælde"));
});
