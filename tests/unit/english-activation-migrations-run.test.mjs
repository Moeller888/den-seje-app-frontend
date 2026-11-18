// Engelsk 5.000, fase 2: the five activation migrations (2a batch3 → 2b pilot → 2c batch2 → 2d grade6_9 →
// 2e batch4; owner decision 2026-11-14, runbook §2.8 C) run UNMODIFIED against a real PostgreSQL (PGlite,
// in-process WebAssembly — no Docker, no network). The bank is built from migration A, the five portions'
// INSERT files and 20261113120000_english_review_text_corrections (with the nine production ids), plus
// older English rows without level_batch and a row of another subject.
//
// Covered: success in the owner's order (only the step's own portion changes), wrong order, deviating
// content (fingerprint, level, metadata, count, active row, used row, a paused batch) and a second run.
// Every refusal leaves the whole bank byte-identical.
//
// HONEST LIMITS: PGlite is PostgreSQL 18.x; production is 17.6. The fingerprints were read in production on
// 2026-11-14; here they prove that the repository builds the same content. Passing is not permission to apply
// (D-110), and nothing here activates anything in production.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { APPLIED_IN_PRODUCTION, NOT_IN_PRODUCTION } from "../isolated/schema/replay-plan.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = join(ROOT, "supabase", "migrations");
const read = (n) => readFileSync(join(DIR, n), "utf8");

const ORDER = [
  { step: "2a", batch: "batch3", size: 500 },
  { step: "2b", batch: "pilot", size: 500 },
  { step: "2c", batch: "batch2", size: 500 },
  { step: "2d", batch: "grade6_9", size: 120 },
  { step: "2e", batch: "batch4", size: 500 },
];
// Steps applied in production, with the ledger version the server gave them (each with its own owner GO and
// production log). Every other step must still be in NOT_IN_PRODUCTION.
const APPLIED_STEPS = { "2a": "20261116163535" };
const FILE_RE = /^\d{14}_english_activate_(2[a-e])_([a-z0-9_]+)\.sql$/;
const FILES = readdirSync(DIR).filter((f) => FILE_RE.test(f)).sort();
const SQL = Object.fromEntries(FILES.map((f) => [f.match(FILE_RE)[1], read(f)]));
const stepsOf = (sql) => JSON.parse(sql.slice(sql.indexOf("$j$[") + 3, sql.indexOf("]$j$") + 1));

const SOURCES = [
  read("20261020125000_english_grade6_9.sql"),
  ...["pilot", "batch2", "batch3", "batch4"].flatMap((batch, index) =>
    [1, 2, 3].map((n) => read(`20261020${13 + index}000${n}_english_level_${batch}_${n}.sql`))),
];
const CORRECTIONS = read("20261113120000_english_review_text_corrections.sql");
// The nine corrected rows' production ids, by their reviewed question text (as in
// english-review-text-corrections-migration-run.test.mjs).
const CORRECTED = {
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

const FP_SQL = `md5(string_agg(md5(content::text) || '|' || difficulty_level::text || '|' || md5(metadata::text),
                ',' ORDER BY md5(content::text)))`;

let shared = null;
async function bank() {
  if (shared) return shared;
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
    CREATE TABLE public.question_instances (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      question_id uuid NOT NULL REFERENCES public.questions(id), answered boolean NOT NULL DEFAULT false);
  `);
  await pg.exec(read("20261020120000_difficulty_scale_a.sql"));
  for (const sql of SOURCES) await pg.exec(sql);
  for (const [id, question] of Object.entries(CORRECTED)) {
    const moved = await pg.query("UPDATE public.questions SET id = $1 WHERE content->>'question' = $2", [id, question]);
    assert.equal(moved.affectedRows, 1, `exactly one source row for ${question}`);
  }
  await pg.exec(CORRECTIONS);
  // Older English rows (no level_batch, mostly active) and another subject: never touched.
  await pg.exec(`
    INSERT INTO public.questions (content, answer_format, is_active, learning_objective, metadata, difficulty_level) VALUES
      ('{"question":"old english 1","options":["a","b"],"correct":"a"}', 'mc', true, 'english', '{"concepts":["ordforråd"]}', 900),
      ('{"question":"old english 2","options":["a","b"],"correct":"a"}', 'mc', false, 'english', '{}', 1200),
      ('{"question":"historie 1","options":["a","b"],"correct":"a"}', 'mc', true, 'historie', '{"level_batch":"batch3"}', 2000);
  `);
  shared = pg;
  return pg;
}

test.after(async () => { if (shared) await shared.close(); });

const snapshot = async (pg) => (await pg.query(`
  SELECT id::text, md5(content::text) AS content_md5, md5(coalesce(metadata::text, '')) AS metadata_md5, is_active,
         answer_format, difficulty_level, target_grade, difficulty_band, learning_objective
  FROM public.questions ORDER BY id`)).rows;

// Runs fn inside a transaction that is always rolled back, so every case starts from the same bank.
async function scenario(fn) {
  const pg = await bank();
  await pg.exec("BEGIN");
  try {
    return await fn(pg);
  } finally {
    await pg.exec("ROLLBACK");
  }
}

// Applies one file; on error rolls back to before it and returns the error message.
async function attempt(pg, step) {
  await pg.exec("SAVEPOINT a");
  try {
    await pg.exec(SQL[step]);
    await pg.exec("RELEASE SAVEPOINT a");
    return null;
  } catch (error) {
    await pg.exec("ROLLBACK TO SAVEPOINT a");
    return error.message;
  }
}

async function refuses(pg, step, pattern) {
  const before = await snapshot(pg);
  const message = await attempt(pg, step);
  assert.ok(message, `${step} must refuse`);
  assert.match(message, pattern);
  assert.deepEqual(await snapshot(pg), before, `${step}: nothing changed`);
}

const activeOf = async (pg, batch) => (await pg.query(
  "SELECT count(*)::int AS n FROM public.questions WHERE learning_objective = 'english' AND is_active AND metadata->>'level_batch' = $1",
  [batch])).rows[0].n;

test("five files, one per step, each either applied with its pinned ledger version or in NOT_IN_PRODUCTION, in the owner's order and with one shared order list", () => {
  assert.deepEqual(FILES.map((f) => f.match(FILE_RE).slice(1, 3)), ORDER.map((s) => [s.step, s.batch]));
  const lists = FILES.map((f) => stepsOf(read(f)));
  for (const list of lists) {
    assert.deepEqual(list, lists[0]);
    assert.deepEqual(list.map(({ step, batch, size }) => ({ step, batch, size })), ORDER);
  }
  for (const f of FILES) {
    const [, step, batch] = f.match(FILE_RE);
    if (APPLIED_STEPS[step]) {
      assert.equal(APPLIED_IN_PRODUCTION[f], APPLIED_STEPS[step], `${f} is in APPLIED_IN_PRODUCTION`);
      assert.equal(NOT_IN_PRODUCTION[f], undefined, `${f} is not also in NOT_IN_PRODUCTION`);
    } else {
      assert.ok(NOT_IN_PRODUCTION[f], `${f} is in NOT_IN_PRODUCTION`);
      assert.equal(APPLIED_IN_PRODUCTION[f], undefined, `${f} is not in APPLIED_IN_PRODUCTION`);
    }
    const sql = read(f);
    const own = ORDER.find((s) => s.step === step);
    assert.match(sql, new RegExp(`v_own   text    := '${step}';`));
    assert.match(sql, new RegExp(`v_batch text    := '${batch}';`));
    assert.match(sql, new RegExp(`v_size  integer := ${own.size};`));
    assert.match(sql, new RegExp(`v_fp    text    := '${lists[0].find((s) => s.step === step).fp}';`));
    // data-only: one UPDATE of is_active, no schema statement, no DELETE/INSERT, no other batch named.
    assert.equal(sql.match(/\bUPDATE public\.questions\b/g).length, 2, `${f}: the UPDATE and the rollback comment`);
    assert.match(sql, /SET is_active = true\n/);
    assert.doesNotMatch(sql.replace(/^--.*$/gm, ""), /\b(CREATE|ALTER|DROP|GRANT|REVOKE|DELETE|INSERT|TRUNCATE)\b/i, f);
    assert.doesNotMatch(sql, /batch([5-9]|10)'/, f);
  }
});

test("the repository builds exactly the fingerprints the files lock (read in production on 2026-11-14)", async () => {
  await scenario(async (pg) => {
    const fps = stepsOf(SQL["2a"]);
    for (const { batch, size, fp } of fps) {
      const row = (await pg.query(`SELECT count(*)::int AS n, count(*) FILTER (WHERE is_active)::int AS a, ${FP_SQL} AS fp
        FROM public.questions WHERE learning_objective = 'english' AND metadata->>'level_batch' = $1`, [batch])).rows[0];
      assert.deepEqual(row, { n: size, a: 0, fp }, batch);
    }
  });
});

test("success: 2a → 2e in order each activate exactly their own portion and nothing else", async () => {
  await scenario(async (pg) => {
    let before = await snapshot(pg);
    for (const { step, batch, size } of ORDER) {
      assert.equal(await attempt(pg, step), null, step);
      const after = await snapshot(pg);
      const own = new Set((await pg.query(
        "SELECT id::text FROM public.questions WHERE learning_objective = 'english' AND metadata->>'level_batch' = $1", [batch])).rows.map((r) => r.id));
      assert.equal(own.size, size);
      assert.equal(after.length, before.length);
      for (let i = 0; i < before.length; i++) {
        if (own.has(before[i].id)) {
          assert.equal(before[i].is_active, false);
          assert.deepEqual(after[i], { ...before[i], is_active: true }, `${step} ${before[i].id}`);
        } else {
          assert.deepEqual(after[i], before[i], `${step} leaves ${before[i].id}`);
        }
      }
      assert.equal(await activeOf(pg, batch), size);
      before = after;
    }
    const active = (await pg.query(
      "SELECT count(*)::int AS n FROM public.questions WHERE learning_objective = 'english' AND is_active AND metadata ? 'level_batch'")).rows[0].n;
    assert.equal(active, 2120);
  });
});

test("wrong order: a step before its predecessors, or after a later step, refuses and changes nothing", async () => {
  await scenario(async (pg) => {
    for (const step of ["2b", "2c", "2d", "2e"]) await refuses(pg, step, /earlier step 2a \(batch3\) is not fully active \(0 of 500 active/);
    assert.equal(await attempt(pg, "2a"), null);
    await refuses(pg, "2c", /earlier step 2b \(pilot\) is not fully active/);
    await refuses(pg, "2e", /earlier step 2b \(pilot\) is not fully active/);
  });
  await scenario(async (pg) => {
    // A later portion already (partly) active: 2a must not run.
    await pg.exec("UPDATE public.questions SET is_active = true WHERE id = (SELECT id FROM public.questions WHERE metadata->>'level_batch' = 'batch4' ORDER BY id LIMIT 1)");
    await refuses(pg, "2a", /later step 2e \(batch4\) already has 1 active rows/);
  });
  await scenario(async (pg) => {
    // An earlier portion partly rolled back: the next step must not run.
    assert.equal(await attempt(pg, "2a"), null);
    await pg.exec("UPDATE public.questions SET is_active = false WHERE id = (SELECT id FROM public.questions WHERE metadata->>'level_batch' = 'batch3' ORDER BY id LIMIT 1)");
    await refuses(pg, "2b", /earlier step 2a \(batch3\) is not fully active \(499 of 500 active/);
  });
  await scenario(async (pg) => {
    // A paused batch (5–10) with an active row stops every step.
    await pg.exec(`INSERT INTO public.questions (content, answer_format, is_active, learning_objective, metadata, difficulty_level)
      VALUES ('{"question":"paused batch row"}', 'mc', true, 'english', '{"level_batch":"batch7"}', 5000)`);
    await refuses(pg, "2a", /1 active English rows outside the five portions/);
  });
});

test("deviating content: fingerprint, level, metadata, count, an active or used row each refuse and change nothing", async () => {
  const one = "(SELECT id FROM public.questions WHERE metadata->>'level_batch' = 'batch3' ORDER BY id LIMIT 1)";
  const cases = [
    [`UPDATE public.questions SET content = content || '{"review_text":"x"}' WHERE id = ${one}`, /content fingerprint of batch3 is [0-9a-f]{32}, expected c6de3bd6da24bed3cc61801e909ec8da/],
    [`UPDATE public.questions SET difficulty_level = difficulty_level + 1 WHERE id = ${one}`, /content fingerprint of batch3/],
    [`UPDATE public.questions SET metadata = metadata || '{"cefr":"C2"}' WHERE id = ${one}`, /content fingerprint of batch3/],
    [`UPDATE public.questions SET is_active = true WHERE id = ${one}`, /expected 500 inactive batch3 rows, found 500 rows \(1 active\)/],
    [`UPDATE public.questions SET metadata = metadata || '{"level_batch":"batch2"}' WHERE id = ${one}`, /expected 500 inactive batch3 rows, found 499 rows/],
    [`INSERT INTO public.questions (content, answer_format, is_active, learning_objective, metadata, difficulty_level)
      VALUES ('{"question":"extra batch3 row"}', 'mc', false, 'english', '{"level_batch":"batch3"}', 5000)`, /found 501 rows/],
    [`INSERT INTO public.question_instances (question_id) SELECT ${one}`, /1 question_instances row\(s\) on batch3/],
  ];
  for (const [setup, error] of cases) {
    await scenario(async (pg) => {
      await pg.exec(setup);
      await refuses(pg, "2a", error);
    });
  }
  await scenario(async (pg) => {
    // The same guard for the last step, after the four steps before it.
    for (const step of ["2a", "2b", "2c", "2d"]) assert.equal(await attempt(pg, step), null, step);
    await pg.exec("UPDATE public.questions SET content = content || '{\"review_text\":\"y\"}' WHERE id = (SELECT id FROM public.questions WHERE metadata->>'level_batch' = 'batch4' ORDER BY id LIMIT 1)");
    await refuses(pg, "2e", /content fingerprint of batch4 is [0-9a-f]{32}, expected bfe61b1c8268d65028993332dab65a4d/);
  });
});

test("a second run of any step finds its portion active and changes nothing", async () => {
  await scenario(async (pg) => {
    for (const { step, batch, size } of ORDER) {
      assert.equal(await attempt(pg, step), null, step);
      await refuses(pg, step, new RegExp(`expected ${size} inactive ${batch} rows, found ${size} rows \\(${size} active\\)`));
    }
  });
});
