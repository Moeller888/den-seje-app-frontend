// RUNTIME proof for migration 20261101210000_question_history_restrict (D-298 H2), PGlite.
//
// Fixture: the three tables with production's two foreign keys to questions exactly as the catalog
// showed them on 2026-11-01 (ON DELETE CASCADE, same names). The migration file and the documented
// rollback are executed UNMODIFIED. Synthetic rows only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const FILE = "supabase/migrations/20261101210000_question_history_restrict.sql";
const CASCADE = "FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE";
const RESTRICT = "FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE RESTRICT";

function rollbackSql() {
  const m = /```sql\n([\s\S]*?)```/.exec(read("docs/operations/question-history-restrict-rollback.md"));
  assert.ok(m && /ROLLBACK D-298 H2/.test(m[1]));
  return m[1];
}

const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const Q_HIST = uid(1), Q_ANS = uid(2), Q_FREE = uid(3);

const FIXTURE = `
  CREATE TABLE public.questions (id uuid PRIMARY KEY, is_active boolean NOT NULL DEFAULT true);
  CREATE TABLE public.question_instances (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), question_id uuid,
    answered boolean NOT NULL DEFAULT false,
    CONSTRAINT question_instances_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE CASCADE);
  CREATE TABLE public.student_answers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), question_id uuid,
    CONSTRAINT student_answers_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE CASCADE);
  INSERT INTO public.questions (id) VALUES ('${Q_HIST}'), ('${Q_ANS}'), ('${Q_FREE}');
  INSERT INTO public.question_instances (question_id, answered) VALUES ('${Q_HIST}', true), ('${Q_HIST}', false);
  INSERT INTO public.student_answers (question_id) VALUES ('${Q_ANS}');
`;

async function fresh() {
  const db = new PGlite();
  await db.exec(FIXTURE);
  return db;
}
const defs = async (db) => (await db.query(`SELECT conrelid::regclass::text AS t, conname AS n, pg_get_constraintdef(oid) AS d
  FROM pg_constraint WHERE contype = 'f' AND confrelid = 'public.questions'::regclass ORDER BY 1`)).rows;
const snapshot = async (db) => (await db.query(`SELECT
  (SELECT json_agg(q ORDER BY q.id) FROM public.questions q) AS q,
  (SELECT json_agg(i ORDER BY i.question_id, i.answered) FROM (SELECT question_id, answered FROM public.question_instances) i) AS i,
  (SELECT json_agg(a.question_id) FROM public.student_answers a) AS a`)).rows[0];
const migrated = async () => { const db = await fresh(); await db.exec(read(FILE)); return db; };

test("before: the fixture is production's CASCADE — a delete silently removes answer history", async () => {
  const db = await fresh();
  assert.deepEqual((await defs(db)).map((r) => r.d), [CASCADE, CASCADE]);
  await db.exec(`DELETE FROM public.questions WHERE id = '${Q_HIST}'`);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.question_instances`)).rows[0].n, 0, "history gone");
});

test("after: both keys are RESTRICT with the same names; no row is changed", async () => {
  const db = await fresh();
  const before = await snapshot(db);
  await db.exec(read(FILE));
  assert.deepEqual(await defs(db), [
    { t: "question_instances", n: "question_instances_question_id_fkey", d: RESTRICT },
    { t: "student_answers", n: "student_answers_question_id_fkey", d: RESTRICT },
  ]);
  assert.deepEqual(await snapshot(db), before);
});

test("a question with answer history cannot be deleted (restrict_violation 23001); it is archived instead", async () => {
  const db = await migrated();
  for (const id of [Q_HIST, Q_ANS]) {
    await assert.rejects(db.exec(`DELETE FROM public.questions WHERE id = '${id}'`), (e) => e.code === "23001", id);
  }
  await db.exec(`UPDATE public.questions SET is_active = false WHERE id = '${Q_HIST}'`);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.question_instances WHERE question_id = '${Q_HIST}'`)).rows[0].n, 2);
});

test("a question without history can still be deleted; new rows still need an existing question", async () => {
  const db = await migrated();
  await db.exec(`DELETE FROM public.questions WHERE id = '${Q_FREE}'`);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.questions`)).rows[0].n, 2);
  await assert.rejects(db.exec(`INSERT INTO public.question_instances (question_id) VALUES ('${uid(99)}')`), (e) => e.code === "23503");
});

test("re-run is a no-op; the guard refuses an unreviewed definition or an extra key, changing nothing", async () => {
  const db = await migrated();
  await db.exec(read(FILE));
  assert.deepEqual((await defs(db)).map((r) => r.d), [RESTRICT, RESTRICT]);

  const setNull = await fresh();
  await setNull.exec(`ALTER TABLE public.student_answers DROP CONSTRAINT student_answers_question_id_fkey,
    ADD CONSTRAINT student_answers_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE SET NULL`);
  await assert.rejects(setNull.exec(read(FILE)), /D-298 H2: student_answers\.student_answers_question_id_fkey is/);
  assert.match((await defs(setNull))[0].d, /CASCADE/, "question_instances untouched after the abort");

  const extra = await fresh();
  await extra.exec(`CREATE TABLE public.other (question_id uuid REFERENCES public.questions(id))`);
  await assert.rejects(extra.exec(read(FILE)), /D-298 H2: unreviewed foreign key/);
});

test("the documented rollback restores production's CASCADE exactly, with no row changed", async () => {
  const db = await migrated();
  const before = await snapshot(db);
  await db.exec(rollbackSql());
  assert.deepEqual(await defs(db), [
    { t: "question_instances", n: "question_instances_question_id_fkey", d: CASCADE },
    { t: "student_answers", n: "student_answers_question_id_fkey", d: CASCADE },
  ]);
  assert.deepEqual(await snapshot(db), before);
});

test("the file is D-110 shaped: header says not applied, lock_timeout set, no data statement", () => {
  const sql = read(FILE);
  assert.match(sql, /NOT APPLIED IN PRODUCTION\. Applying it needs a separate owner authorisation/);
  assert.match(sql, /SET LOCAL lock_timeout = '5s';/);
  const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  assert.doesNotMatch(code, /^\s*(INSERT|UPDATE|DELETE|TRUNCATE)\b/im, "no data statement");
});
