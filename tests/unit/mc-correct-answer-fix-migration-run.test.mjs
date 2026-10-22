// RUNTIME proof for migration 20261022120000: executes the exact file against PGlite (in-process
// PostgreSQL) seeded with the two production rows as they were on 2026-10-22, and with the newest
// process_question_attempt from 20261018143726, so the before/after grading is the real one.
//
// Honest limits: PGlite is not the production build (PG 17.6), the fixture table carries only the
// columns the migration and the grading function read, and no RLS. Passing here is not permission
// to apply the migration — that needs a separate owner authorisation (D-110).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const SQL = read("supabase/migrations/20261022120000_fix_mc_correct_answer_not_in_options.sql");
const GRADING = read("supabase/migrations/20261018143726_fix_danish_question_bank_text.sql")
  .match(/\$grading\$\n([\s\S]*?)\n  \$grading\$/)[1];
const ROWS = JSON.parse(read("tests/fixtures/mc-correct-answer-fix-before.json"));
const PATCHES = JSON.parse(SQL.match(/\$patches\$([\s\S]*?)\$patches\$/)[1]);

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const PUPIL = id(8000);
const DECOY = id(9001);      // an unrelated mc question
const LOOKALIKE = id(9002);  // a different id carrying the exact broken content

async function fixture(t, rows = ROWS) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE TABLE questions(id uuid PRIMARY KEY, content jsonb, metadata jsonb, learning_objective text,
      target_grade smallint, difficulty_band integer, answer_format text, type text, is_active boolean);
    CREATE TABLE question_instances(id uuid PRIMARY KEY, student_id uuid, question_id uuid REFERENCES questions,
      correct_answer text, answered boolean DEFAULT false, was_correct boolean, repeat_count integer DEFAULT 0,
      answered_at timestamptz, user_answer text);
    CREATE TABLE student_progress(student_id uuid PRIMARY KEY, xp integer DEFAULT 0, coins integer DEFAULT 0,
      correct_answers integer DEFAULT 0, total_correct_answers integer DEFAULT 0);
    CREATE FUNCTION update_streak(uuid) RETURNS void LANGUAGE sql AS $$ SELECT $$;
    CREATE FUNCTION update_quest_progress_for_answer(uuid,boolean,integer) RETURNS void LANGUAGE sql AS $$ SELECT $$;
    CREATE FUNCTION update_weekly_quest_progress_for_answer(uuid,boolean,integer) RETURNS void LANGUAGE sql AS $$ SELECT $$;
    ${GRADING};
  `);
  await db.query(
    "INSERT INTO questions SELECT * FROM jsonb_populate_recordset(NULL::questions, $1::jsonb)",
    [JSON.stringify(rows.map((r) => ({ metadata: { domain: r.learning_objective }, ...r })))],
  );
  await db.query(
    `INSERT INTO questions VALUES
      ($1, $2, '{}', 'english', 5, 1, 'mc', 'mc_single', true),
      ($3, $4, '{}', 'industrialisation', 8, 3, 'mc', 'mc_single', true)`,
    [DECOY, JSON.stringify({ question: "Hvad betyder 'leaf'?", options: ["blad", "liv"], correct: "blad" }),
     LOOKALIKE, JSON.stringify(ROWS[0].content)],
  );
  await db.query("INSERT INTO student_progress(student_id) VALUES ($1)", [PUPIL]);
  return db;
}

const all = async (db) => (await db.query("SELECT * FROM questions ORDER BY id")).rows;
const one = async (db, qid) => (await db.query("SELECT * FROM questions WHERE id = $1", [qid])).rows[0];
const contentHash = async (db, qid) =>
  (await db.query("SELECT md5(content::text) AS h FROM questions WHERE id = $1", [qid])).rows[0].h;

let n = 0;
async function attempt(db, qid) {
  // As get-next-question does: the instance key is content.correct; the pupil clicks option 1.
  const q = await one(db, qid);
  const inst = id(20000 + ++n);
  await db.query(
    "INSERT INTO question_instances(id, student_id, question_id, correct_answer) VALUES ($1, $2, $3, $4)",
    [inst, PUPIL, qid, q.content.correct],
  );
  const r = await db.query("SELECT process_question_attempt($1, $2, $3, 0) AS r", [PUPIL, inst, q.content.options[0]]);
  return r.rows[0].r.status;
}

test("the fixture is byte-identical to production: md5(content::text) equals each patch's before_hash", async (t) => {
  const db = await fixture(t);
  assert.equal(PATCHES.length, 2);
  for (const p of PATCHES) assert.equal(await contentHash(db, p.id), p.before_hash, p.id);
});

test("before the migration, a pupil clicking the right option is scored incorrect", async (t) => {
  const db = await fixture(t);
  for (const p of PATCHES) assert.equal(await attempt(db, p.id), "incorrect", p.id);
});

test("changes only content.correct of the two ids; everything else stays byte-identical", async (t) => {
  const db = await fixture(t);
  const before = await all(db);
  await db.exec(SQL);
  const after = await all(db);
  assert.equal(after.length, before.length);
  for (let i = 0; i < before.length; i++) {
    const b = before[i], a = after[i];
    const patch = PATCHES.find((p) => p.id === b.id);
    if (!patch) {
      assert.deepEqual(a, b, `${b.id} must be untouched`);
      continue;
    }
    assert.deepEqual({ ...a, content: null }, { ...b, content: null }, `${b.id}: only content may change`);
    const { correct: cb, ...restB } = b.content;
    const { correct: ca, ...restA } = a.content;
    assert.deepEqual(restA, restB, `${b.id}: only content.correct may change`);
    assert.equal(cb, patch.before);
    assert.equal(ca, patch.after);
    assert.equal(ca, a.content.options[0]);
    assert.equal(await contentHash(db, b.id), patch.after_hash);
  }
  // The lookalike row has the same broken content under another id: id-specific, so untouched.
  assert.equal((await one(db, LOOKALIKE)).content.correct, ROWS[0].content.correct);
});

test("after the migration, the same click is scored correct", async (t) => {
  const db = await fixture(t);
  await db.exec(SQL);
  for (const p of PATCHES) assert.equal(await attempt(db, p.id), "correct", p.id);
});

test("is idempotent: a second run changes nothing and does not fail", async (t) => {
  const db = await fixture(t);
  await db.exec(SQL);
  const once = await all(db);
  await db.exec(SQL);
  assert.deepEqual(await all(db), once);
});

async function assertAbortsUnchanged(db, pattern) {
  const before = await all(db);
  await assert.rejects(db.exec(SQL), pattern);
  assert.deepEqual(await all(db), before, "a failed run must leave every row unchanged");
}

test("fails loudly, changing nothing, when a target row is missing", async (t) => {
  const db = await fixture(t, [ROWS[0]]);
  await assertAbortsUnchanged(db, /MC_CORRECT_FIX: spørgsmål b66e1947-8217-4942-9893-aef3f256b488 findes ikke/);
});

test("fails loudly, changing nothing, when the content drifted since preflight", async (t) => {
  const drifted = structuredClone(ROWS);
  drifted[1].content.review_text += " ";
  const db = await fixture(t, drifted);
  await assertAbortsUnchanged(db, /MC_CORRECT_FIX: indholdet i b66e1947-8217-4942-9893-aef3f256b488 er ændret/);
});

test("fails loudly, changing nothing, when a target is not an mc question", async (t) => {
  const changed = structuredClone(ROWS);
  changed[0].answer_format = "text";
  const db = await fixture(t, changed);
  await assertAbortsUnchanged(db, /MC_CORRECT_FIX: spørgsmål 57c0e3db-090d-40fd-9a9b-a5609590f09a er ikke mc/);
});

test("the patch values match the fixture: before is the stored key, after is option 1 verbatim", () => {
  for (const p of PATCHES) {
    const row = ROWS.find((r) => r.id === p.id);
    assert.equal(row.content.correct, p.before);
    assert.equal(row.content.options[0], p.after);
  }
});
