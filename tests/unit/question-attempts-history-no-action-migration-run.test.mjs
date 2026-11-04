// RUNTIME proof for 20261103100000_question_attempts_history_no_action (D-327, H5 track "(b)"), PGlite,
// every file UNMODIFIED, on the H5 chain production will have (helpers/h5-integration-chain.mjs:
// D-280 part 1 → D-278 → G1 → H5 bootstrap → alignment), plus D-316 (applied in production).
//
// What it proves:
//   1. The file is one DO block (atomic whatever the runner does), lock_timeout inside, no data statement.
//   2. Guards: without the H5 table, with a deferrable or otherwise changed instance key, with a second
//      key to question_instances, or with a changed account key — it aborts and changes nothing; a
//      re-run changes nothing.
//   3. After it: deleting an instance that has attempts is refused (23503) and both rows stay; an
//      instance without attempts can still be deleted; deleting the ACCOUNT (auth.users) still removes
//      the pupil's instances and attempts in one statement; no other pupil is touched.
//   4. The migration itself changes no row.
//   5. D-316: the history guard still closes a forced round 1 with attempts; and with the OLD release
//      body (no guard) the DELETE is now refused instead of losing the attempt — defence in depth.
//   6. The documented rollback restores H5's CASCADE exactly.
// Real-server SQLSTATEs, both transaction models, lock_timeout, concurrency: -pg.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { D278, D280_PATHS, G1, BOOTSTRAP, ALIGN, PROD_ORDER, TOP10_ID, uid, baseSql, migrationSql, FINGERPRINT_SQL } from "./helpers/h5-integration-chain.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILE = "20261103100000_question_attempts_history_no_action.sql";
const D316 = "20261102100000_release_open_rounds_on_inactive_questions.sql";
const read = (p) => readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const block = (p, marker) => {
  const m = /```sql\n([\s\S]*?)```/.exec(read(p));
  assert.ok(m && m[1].includes(marker), `${p}: ${marker}`);
  return m[1];
};
const rollbackSql = () => block("docs/operations/question-attempts-history-no-action-rollback.md", "ROLLBACK D-327");
const d316RollbackSql = () => block("docs/operations/release-open-rounds-inactive-rollback.md", "ROLLBACK D-316");
const CASCADE = "FOREIGN KEY (question_instance_id, student_id) REFERENCES question_instances(id, student_id) ON DELETE CASCADE";
const NO_ACTION = "FOREIGN KEY (question_instance_id, student_id) REFERENCES question_instances(id, student_id)";

async function chain(order = [...PROD_ORDER, D316]) {
  const db = new PGlite();
  for (const sql of baseSql()) await db.exec(sql);
  for (const f of order) await db.exec(migrationSql(f));
  return db;
}
const fkDef = async (db) => (await db.query(`SELECT pg_get_constraintdef(oid) AS d, condeferrable AS x FROM pg_constraint
  WHERE conname = 'question_attempts_instance_fkey'`)).rows[0] ?? null;
const fingerprint = async (db) => (await db.query(FINGERPRINT_SQL)).rows[0].f;
const rows = async (db) => (await db.query(`SELECT
  (SELECT json_agg(to_jsonb(i) ORDER BY id) FROM public.question_instances i) AS i,
  (SELECT json_agg(to_jsonb(a) ORDER BY id) FROM public.question_attempts a) AS a`)).rows[0];

let n = 4100;
async function pupil(db) {
  const id = uid(n++);
  await db.exec(`INSERT INTO auth.users VALUES ('${id}');
    INSERT INTO public.profiles (id, role, selected_grade) VALUES ('${id}', 'student', 5);
    INSERT INTO public.student_progress (student_id, xp, coins, correct_answers, total_correct_answers,
      current_streak, longest_streak, last_activity_date) VALUES ('${id}', 100, 50, 7, 7, 1, 1, current_date - 1);`);
  return id;
}
// A served instance answered through H5's _v2 (one attempt).
async function answered(db, p, q = TOP10_ID[0]) {
  const key = (await db.query("SELECT content->>'correct' AS k FROM public.questions WHERE id = $1", [q])).rows[0].k;
  const qi = (await db.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, next_review_at)
    VALUES ($1, $2, $3, now()) RETURNING id`, [p, q, key])).rows[0].id;
  await db.exec("SET ROLE service_role");
  const r = (await db.query("SELECT public.process_question_attempt_v2($1, $2, $3, 1, $4, NULL, NULL) AS r", [p, qi, key, randomUUID()])).rows[0].r;
  await db.exec("RESET ROLE");
  assert.equal(r.outcome, "recorded");
  return qi;
}
const attemptsOf = async (db, p) => (await db.query("SELECT count(*)::int AS n FROM public.question_attempts WHERE student_id = $1", [p])).rows[0].n;
const code = async (p) => { try { await p; return null; } catch (e) { return e.code; } };

test("1. one DO block, lock_timeout inside, header says not applied, no data statement", () => {
  const sql = migrationSql(FILE);
  assert.match(sql, /NOT APPLIED IN PRODUCTION\. Applying it needs a separate owner authorisation/);
  const body = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").trim();
  assert.match(body, /^DO \$h5b\$[\s\S]*\$h5b\$;$/);
  assert.equal(body.match(/\$h5b\$/g).length, 2);
  assert.match(body, /BEGIN\s*PERFORM set_config\('lock_timeout', '5s', true\);/);
  assert.doesNotMatch(body, /^\s*(INSERT|UPDATE|DELETE|TRUNCATE)\b/im);
  assert.match(body, /ON DELETE NO ACTION NOT DEFERRABLE/);
  assert.match(rollbackSql().split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").trim(), /^DO \$rollback_h5b\$[\s\S]*\$rollback_h5b\$;$/);
});

test("2. guards: every unreviewed state aborts and changes nothing; a re-run changes nothing", async () => {
  const noH5 = await chain([D280_PATHS, D278, G1]);
  const before = await fingerprint(noH5);
  await assert.rejects(noH5.exec(migrationSql(FILE)), /D-327: public\.question_attempts does not exist/);
  assert.deepEqual(await fingerprint(noH5), before);

  const cases = [
    ["deferrable instance key", `ALTER TABLE public.question_attempts DROP CONSTRAINT question_attempts_instance_fkey,
       ADD CONSTRAINT question_attempts_instance_fkey FOREIGN KEY (question_instance_id, student_id)
       REFERENCES public.question_instances (id, student_id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;`, /not the reviewed definition/],
    ["ON DELETE RESTRICT instance key (not reviewed)", `ALTER TABLE public.question_attempts DROP CONSTRAINT question_attempts_instance_fkey,
       ADD CONSTRAINT question_attempts_instance_fkey FOREIGN KEY (question_instance_id, student_id)
       REFERENCES public.question_instances (id, student_id) ON DELETE RESTRICT;`, /not the reviewed definition/],
    ["a second key to question_instances", `ALTER TABLE public.question_attempts ADD CONSTRAINT extra_fk FOREIGN KEY (question_instance_id, student_id)
       REFERENCES public.question_instances (id, student_id);`, /expected exactly 1 foreign key/],
    ["a changed account key", `ALTER TABLE public.question_attempts DROP CONSTRAINT question_attempts_student_id_fkey,
       ADD CONSTRAINT question_attempts_student_id_fkey FOREIGN KEY (student_id) REFERENCES auth.users (id);`, /not H5's account key/],
  ];
  for (const [label, tamper, error] of cases) {
    const db = await chain();
    await db.exec(tamper);
    const fp = await fingerprint(db);
    await assert.rejects(db.exec(migrationSql(FILE)), error, label);
    assert.deepEqual(await fingerprint(db), fp, `${label}: nothing changed`);
  }
  const db = await chain();
  await db.exec(migrationSql(FILE));
  const once = await fingerprint(db);
  await db.exec(migrationSql(FILE));
  assert.deepEqual(await fingerprint(db), once, "re-run: no change");
});

test("3+4. after it: deleting an instance with attempts is refused; without attempts allowed; account deletion works; no row changed by the migration", async () => {
  const db = await chain();
  const p1 = await pupil(db);
  const withHistory = await answered(db, p1);
  const p2 = await pupil(db);
  const other = await answered(db, p2, TOP10_ID[1]);
  const p3 = await pupil(db);
  const noHistory = (await db.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, next_review_at)
    VALUES ($1, $2, 'x', now()) RETURNING id`, [p3, TOP10_ID[2]])).rows[0].id;

  assert.deepEqual(await fkDef(db), { d: CASCADE, x: false });
  const before = await rows(db);
  await db.exec(migrationSql(FILE));
  assert.deepEqual(await fkDef(db), { d: NO_ACTION, x: false });
  assert.deepEqual(await rows(db), before, "the migration changes no row");

  assert.equal(await code(db.query("DELETE FROM public.question_instances WHERE id = $1", [withHistory])), "23503");
  assert.equal(await attemptsOf(db, p1), 1, "the attempt stays");
  await db.query("DELETE FROM public.question_instances WHERE id = $1", [noHistory]);
  // Account deletion: one statement, the cascades remove instances and attempts together.
  await db.query("DELETE FROM auth.users WHERE id = $1", [p1]);
  assert.equal(await attemptsOf(db, p1), 0);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM public.question_instances WHERE student_id = $1", [p1])).rows[0].n, 0);
  assert.equal(await attemptsOf(db, p2), 1, "another pupil untouched");
  assert.notEqual((await db.query("SELECT id FROM public.question_instances WHERE id = $1", [other])).rows[0], undefined);
});

test("5. D-316: the history guard still closes a forced round 1 with attempts; without the guard the DELETE is now refused", async () => {
  for (const guard of [true, false]) {
    const db = await chain();
    await db.exec(migrationSql(FILE));
    if (!guard) await db.exec(d316RollbackSql());                      // the old release body: no history guard
    const p = await pupil(db);
    const qi = await answered(db, p, TOP10_ID[3]);
    await db.exec("SET session_replication_role = replica");          // forced past the triggers
    await db.query("UPDATE public.question_instances SET answered = false, user_answer = NULL WHERE id = $1", [qi]);
    await db.exec("SET session_replication_role = DEFAULT");
    await db.exec(`SELECT set_config('test.uid', '${p}', false)`);
    await db.exec("SET ROLE authenticated");
    const release = db.query("SELECT public.release_open_question_outside(ARRAY['et_andet_fag']) AS n");
    if (guard) {
      assert.equal((await release).rows[0].n, 1, "released by closing");
      await db.exec("RESET ROLE");
      assert.equal((await db.query("SELECT answered FROM public.question_instances WHERE id = $1", [qi])).rows[0].answered, true);
    } else {
      assert.equal(await code(release), "23503", "the old body's DELETE is refused instead of cascading");
      await db.exec("RESET ROLE");
      assert.notEqual((await db.query("SELECT id FROM public.question_instances WHERE id = $1", [qi])).rows[0], undefined);
    }
    await db.exec("SELECT set_config('test.uid', '', false)");
    assert.equal(await attemptsOf(db, p), 1, `guard=${guard}: the attempt is never lost`);
  }
});

test("6. the documented rollback restores H5's CASCADE exactly", async () => {
  const pre = await fingerprint(await chain());
  const db = await chain();
  await db.exec(migrationSql(FILE));
  await db.exec(rollbackSql());
  assert.deepEqual(await fkDef(db), { d: CASCADE, x: false });
  assert.deepEqual(await fingerprint(db), pre);
  await assert.rejects(db.exec(rollbackSql()), /ROLLBACK D-327: question_attempts_instance_fkey is not D-327's NO ACTION definition/);
});
