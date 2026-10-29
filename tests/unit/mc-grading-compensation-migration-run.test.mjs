// RUNTIME proof for migration 20261029170000_mc_grading_compensation.sql (D-254): executes the file
// against PGlite (in-process PostgreSQL) on the production-faithful base schema plus the live shape of
// student_progress and the reward tables. Real concurrency is in mc-grading-compensation-concurrency.
//
// Honest limits: PGlite is not the production build (17.6) and runs as a superuser. All ids are
// synthetic: the migration's two SHA-256 fingerprints are swapped for those of synthetic instances
// (withTargets), so the real fingerprints are proven only by shape here — and by the read-only
// production preflight recorded in docs/decisions/D-254.md. Passing is not permission to apply the
// migration (D-110).
import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { PROD_BASE_SQL } from "./helpers/prod-base-schema.mjs";
import {
  SQL, QUESTION, REAL_TARGETS, sha256, withTargets, EXTRA_SQL, SEED_SQL, UNTOUCHED_TABLES, dumpSql, PROGRESS_SQL,
  PUPIL_A, PUPIL_B, PUPIL_C, INST_A, INST_B, INST_C,
} from "./helpers/mc-grading-compensation-fixture.mjs";

async function fixture(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(PROD_BASE_SQL);
  await db.exec(EXTRA_SQL);
  await db.exec(SEED_SQL);
  return db;
}
const progress = async (db) => (await db.query(PROGRESS_SQL)).rows;
const untouched = async (db) => {
  const out = {};
  for (const tbl of UNTOUCHED_TABLES) out[tbl] = (await db.query(dumpSql(tbl))).rows[0].h;
  return out;
};
const corrections = async (db) => (await db.query(
  "SELECT student_id, question_instance_id, question_id, xp_delta, coins_delta, correct_answers_delta, total_correct_answers_delta, reason, source_migration FROM public.progress_corrections ORDER BY student_id")).rows;
const tableExists = async (db) => (await db.query("SELECT to_regclass('public.progress_corrections') IS NOT NULL AS e")).rows[0].e;

test("the committed migration names its two attempts only by SHA-256, and no other id than the question", () => {
  assert.equal(REAL_TARGETS.length, 2);
  for (const fp of REAL_TARGETS) assert.match(fp, /^[0-9a-f]{64}$/);
  assert.notEqual(REAL_TARGETS[0], REAL_TARGETS[1]);
  const uuids = new Set(SQL.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) ?? []);
  assert.deepEqual([...uuids], [QUESTION], "the migration may name the (already public) question id and nothing else");
});

test("compensates each of the two pupils exactly once: +10 xp, +5 coins, +1 and +1 — nothing else changes", async (t) => {
  const db = await fixture(t);
  const before = await progress(db);
  const other = await untouched(db);
  await db.exec(withTargets());
  const after = await progress(db);
  assert.equal(after.length, before.length);
  for (let i = 0; i < before.length; i++) {
    const b = before[i], a = after[i];
    if (b.student_id === PUPIL_A || b.student_id === PUPIL_B) {
      assert.deepEqual(
        { xp: a.xp - b.xp, coins: a.coins - b.coins, ca: a.correct_answers - b.correct_answers, tca: a.total_correct_answers - b.total_correct_answers },
        { xp: 10, coins: 5, ca: 1, tca: 1 }, b.student_id);
      const strip = ({ xp, coins, correct_answers, total_correct_answers, ...rest }) => rest;
      assert.deepEqual(strip(a), strip(b), `${b.student_id}: only the four reward columns may change`);
    } else {
      assert.deepEqual(a, b, `${b.student_id} must be untouched`);
    }
  }
  assert.deepEqual(await untouched(db), other, "question_instances and every reward table stay byte-identical");
  const rows = await corrections(db);
  assert.deepEqual(rows.map((r) => [r.student_id, r.question_instance_id, r.question_id]),
    [[PUPIL_A, INST_A, QUESTION], [PUPIL_B, INST_B, QUESTION]]);
  for (const r of rows) {
    assert.deepEqual([r.xp_delta, r.coins_delta, r.correct_answers_delta, r.total_correct_answers_delta], [10, 5, 1, 1]);
    assert.equal(r.source_migration, "20261029170000_mc_grading_compensation");
    assert.match(r.reason, /^D-254: /);
  }
});

test("is idempotent: a second and third run change nothing and do not fail", async (t) => {
  const db = await fixture(t);
  await db.exec(withTargets());
  const once = { p: await progress(db), c: await corrections(db), u: await untouched(db) };
  await db.exec(withTargets());
  await db.exec(withTargets());
  assert.deepEqual({ p: await progress(db), c: await corrections(db), u: await untouched(db) }, once);
});

async function assertAbortsUnchanged(db, sql, pattern) {
  const before = { p: await progress(db), u: await untouched(db), table: await tableExists(db) };
  await assert.rejects(db.exec(sql), pattern);
  assert.deepEqual({ p: await progress(db), u: await untouched(db), table: await tableExists(db) }, before,
    "a failed run must leave every row — and the schema — unchanged");
}

test("atomic: a failure after the first pupil was written rolls back that pupil, the audit row and the table", async (t) => {
  const db = await fixture(t);
  // A foreign compensation for pupil B on this question already exists: A is processed and written
  // first, then B aborts the run. Nothing of A may survive.
  await db.exec(`CREATE TABLE public.progress_corrections (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid NOT NULL, question_instance_id uuid NOT NULL UNIQUE, question_id uuid NOT NULL,
    xp_delta integer NOT NULL, coins_delta integer NOT NULL, correct_answers_delta integer NOT NULL,
    total_correct_answers_delta integer NOT NULL, reason text NOT NULL, source_migration text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (student_id, question_id))`);
  await db.query(`INSERT INTO public.progress_corrections (student_id, question_instance_id, question_id, xp_delta,
    coins_delta, correct_answers_delta, total_correct_answers_delta, reason, source_migration)
    VALUES ($1, gen_random_uuid(), $2, 1, 0, 0, 0, 'other', 'other')`, [PUPIL_B, QUESTION]);
  const before = { p: await progress(db), c: (await db.query("SELECT * FROM public.progress_corrections")).rows };
  await assert.rejects(db.exec(withTargets()), /MC_GRADING_COMP: der findes allerede en anden kompensation/);
  assert.deepEqual({ p: await progress(db), c: (await db.query("SELECT * FROM public.progress_corrections")).rows }, before);
});

test("fails loudly and changes nothing when an attempt cannot be found", async (t) => {
  const db = await fixture(t);
  await assertAbortsUnchanged(db, withTargets([INST_A, "dddddddd-0000-4000-8000-000000000001"]),
    /MC_GRADING_COMP: forventede præcis én instans/);
});

test("fails loudly and changes nothing when a fingerprint names an instance of another question", async (t) => {
  const db = await fixture(t);
  await db.query("UPDATE public.question_instances SET question_id = (SELECT id FROM public.questions WHERE id <> $1 LIMIT 1) WHERE id = $2", [QUESTION, INST_B]);
  await assertAbortsUnchanged(db, withTargets(), /MC_GRADING_COMP: forventede præcis én instans/);
});

test("fails loudly and changes nothing when the attempt does not belong to a pupil", async (t) => {
  const db = await fixture(t);
  await db.query("UPDATE public.profiles SET role = 'teacher' WHERE id = $1", [PUPIL_B]);
  await assertAbortsUnchanged(db, withTargets(), /MC_GRADING_COMP: instansen .* tilhører ikke en elev/);
});

test("fails loudly and changes nothing when the pupil has no student_progress row", async (t) => {
  const db = await fixture(t);
  await db.query("DELETE FROM public.student_progress WHERE student_id = $1", [PUPIL_B]);
  await assertAbortsUnchanged(db, withTargets(), /MC_GRADING_COMP: eleven bag .* har ingen student_progress/);
});

test("fails loudly and changes nothing when both fingerprints resolve to the same pupil", async (t) => {
  const db = await fixture(t);
  await assertAbortsUnchanged(db, withTargets([INST_A, INST_A]), /MC_GRADING_COMP: forsøgene tilhører ikke 2 forskellige elever/);
});

test("an attempt reopened by a repeat since (answered reset) is still compensated: was_correct is not a condition", async (t) => {
  const db = await fixture(t);
  await db.query("UPDATE public.question_instances SET answered = false, was_correct = NULL, user_answer = NULL, repeat_count = 1 WHERE id = $1", [INST_B]);
  await db.exec(withTargets());
  assert.equal((await corrections(db)).length, 2);
});

test("the fingerprint is SHA-256 of the canonical lower-case uuid text, the same in Node and in SQL", async (t) => {
  const db = await fixture(t);
  const sqlFp = (await db.query("SELECT encode(sha256(convert_to(id::text, 'UTF8')), 'hex') AS h FROM public.question_instances WHERE id = $1", [INST_C])).rows[0].h;
  assert.equal(sqlFp, sha256(INST_C));
});

test("locked down: RLS on, no policy, no privilege at all for anon, authenticated or service_role", async (t) => {
  const db = await fixture(t);
  await db.exec(withTargets());
  const rls = (await db.query("SELECT relrowsecurity FROM pg_class WHERE oid = 'public.progress_corrections'::regclass")).rows[0];
  assert.equal(rls.relrowsecurity, true);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_policies WHERE tablename = 'progress_corrections'")).rows[0].n, 0);
  const privs = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER", "MAINTAIN"];
  for (const role of ["anon", "authenticated", "service_role"]) {
    for (const p of privs) {
      const r = (await db.query(`SELECT has_table_privilege($1, 'public.progress_corrections', $2) AS ok`, [role, p])).rows[0];
      assert.equal(r.ok, false, `${role} has ${p}`);
    }
  }
  const pub = (await db.query("SELECT count(*)::int AS n FROM aclexplode((SELECT relacl FROM pg_class WHERE oid = 'public.progress_corrections'::regclass)) a WHERE a.grantee = 0")).rows[0];
  assert.equal(pub.n, 0, "no PUBLIC grant");
});

test("a pupil (authenticated, own uid) can neither read, create, change nor delete a compensation", async (t) => {
  const db = await fixture(t);
  await db.exec(withTargets());
  const attempts = [
    "SELECT * FROM public.progress_corrections",
    `INSERT INTO public.progress_corrections (student_id, question_instance_id, question_id, xp_delta, coins_delta,
       correct_answers_delta, total_correct_answers_delta, reason, source_migration)
       VALUES ('${PUPIL_C}', '${INST_C}', '${QUESTION}', 1000, 1000, 1, 1, 'x', 'x')`,
    `UPDATE public.progress_corrections SET xp_delta = 1000 WHERE student_id = '${PUPIL_A}'`,
    `DELETE FROM public.progress_corrections WHERE student_id = '${PUPIL_A}'`,
    "TRUNCATE public.progress_corrections",
  ];
  for (const role of ["authenticated", "anon"]) {
    for (const sql of attempts) {
      await db.exec(`SET test.uid = '${PUPIL_A}'; SET ROLE ${role}`);
      await assert.rejects(db.exec(sql), /permission denied/, `${role}: ${sql.slice(0, 30)}`);
      await db.exec("RESET ROLE; RESET test.uid");
    }
  }
  assert.equal((await corrections(db)).length, 2);
});

test("adds no trigger, function, policy or view, and the new table has no trigger", async (t) => {
  const db = await fixture(t);
  const count = async () => (await db.query(`SELECT
    (SELECT count(*)::int FROM pg_trigger WHERE NOT tgisinternal) AS triggers,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname IN ('public','auth')) AS functions,
    (SELECT count(*)::int FROM pg_policies) AS policies,
    (SELECT count(*)::int FROM pg_views WHERE schemaname = 'public') AS views`)).rows[0];
  const before = await count();
  await db.exec(withTargets());
  assert.deepEqual(await count(), before);
});
