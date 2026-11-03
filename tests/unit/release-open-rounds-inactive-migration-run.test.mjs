// RUNTIME proof for 20261102100000_release_open_rounds_on_inactive_questions (D-316), PGlite, every file
// UNMODIFIED, on production's answer chain (helpers/h5-integration-chain.mjs pins every md5).
//
// What it proves:
//   1. A round-1 open instance on an INACTIVE question inside the chosen subject is released (deleted) —
//      the reproduced block (PR #551); a reopened repeat on an inactive question is CLOSED, repeat_count
//      kept, the row and its earlier answer state kept.
//   2. Nothing else changes: an open round on an ACTIVE question inside the subject, an instance with a
//      saved answer, another pupil's rows, answered history, and student_progress (XP, coins, streaks,
//      counters) stay byte-identical; the subject switch behaves as before; a second call releases 0.
//   3. The guard: an unreviewed body aborts with no change; a re-run changes nothing.
//   4. The documented rollback restores the old body exactly (md5 7b7693b3…) and the old behaviour.
//   5. H5: the bootstrap accepts the old and the new body, so D-316 and H5 apply in either order and end
//      in the same schema; a third body still stops it. On an H5 database, releasing a reopened repeat
//      closes it and leaves every question_attempts row; nothing cascades. With D-290 G2 present, G2's
//      guard still refuses a new open round on the inactive question.
// Real-server SQLSTATEs, both orders and concurrency: release-open-rounds-inactive-pg.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import {
  D278, D280_PATHS, G1, BOOTSTRAP, ALIGN, PROD_ORDER, TOP10_ID, uid, baseSql, migrationSql, FINGERPRINT_SQL,
} from "./helpers/h5-integration-chain.mjs";
import { G2, G2_SEED_SQL } from "./helpers/g2-h5-orders.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIX = "20261102100000_release_open_rounds_on_inactive_questions.sql";
const OLD_MD5 = "7b7693b3bff869a113e8e97e16bb456a";
const NEW_MD5 = "b80c1c7857ecc90bdbd7b6175b65c78f";
const SIG = "public.release_open_question_outside(text[])";
const read = (p) => readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
function rollbackSql() {
  const m = /```sql\n([\s\S]*?)```/.exec(read("docs/operations/release-open-rounds-inactive-rollback.md"));
  assert.ok(m && /ROLLBACK D-316/.test(m[1]));
  return m[1];
}

async function chain(order, { g2Seed = false } = {}) {
  const db = new PGlite();
  for (const sql of baseSql()) await db.exec(sql);
  if (g2Seed) await db.exec(G2_SEED_SQL);
  for (const f of order) await db.exec(migrationSql(f));
  return db;
}
const md5 = async (db) => (await db.query(`SELECT md5(prosrc) AS m FROM pg_proc WHERE oid = to_regprocedure('${SIG}')`)).rows[0]?.m ?? null;
const fingerprint = async (db) => (await db.query(FINGERPRINT_SQL)).rows[0].f;

let nextPupil = 3100;
async function addPupil(db) {
  const id = uid(nextPupil++);
  await db.exec(`INSERT INTO auth.users VALUES ('${id}');
    INSERT INTO public.profiles (id, role, selected_grade) VALUES ('${id}', 'student', 5);
    INSERT INTO public.student_progress (student_id, xp, coins, correct_answers, total_correct_answers,
      current_streak, longest_streak, last_activity_date) VALUES ('${id}', 100, 50, 7, 7, 3, 4, current_date - 1);`);
  return id;
}
const loOf = async (db, q) => (await db.query("SELECT learning_objective AS lo FROM public.questions WHERE id = $1", [q])).rows[0].lo;
const open = async (db, p, q) => (await db.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer,
  repeat_count, answered, next_review_at) VALUES ($1, $2, 'x', 0, false, now()) RETURNING id`, [p, q])).rows[0].id;
// A repeat reopened the way the repeat functions do it: answered true → false, repeat_count + 1, the
// saved answer cleared. Built while the question is still active (G2 refuses it afterwards).
async function reopenedRepeat(db, p, q) {
  const id = (await db.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, repeat_count,
    answered, answered_at, user_answer, was_correct, next_review_at) VALUES ($1, $2, 'x', 0, true, now() - interval '1 day', 'y', false, now())
    RETURNING id`, [p, q])).rows[0].id;
  await db.query("UPDATE public.question_instances SET answered = false, repeat_count = 1, user_answer = NULL WHERE id = $1", [id]);
  return id;
}
const deactivate = (db, q) => db.query("UPDATE public.questions SET is_active = false WHERE id = $1", [q]);
async function release(db, p, domains) {
  await db.exec(`SELECT set_config('test.uid', '${p}', false)`);
  await db.exec("SET ROLE authenticated");
  try { return (await db.query("SELECT public.release_open_question_outside($1) AS n", [domains])).rows[0].n; }
  finally { await db.exec("RESET ROLE"); await db.exec("SELECT set_config('test.uid', '', false)"); }
}
const row = async (db, id) => (await db.query(`SELECT answered, repeat_count, user_answer, was_correct, (answered_at IS NOT NULL) AS at
  FROM public.question_instances WHERE id = $1`, [id])).rows[0] ?? null;
const everything = async (db) => (await db.query(`SELECT
  (SELECT json_agg(to_jsonb(i) - 'answered_at' ORDER BY id) FROM public.question_instances i) AS instances,
  (SELECT json_agg(to_jsonb(s) ORDER BY student_id) FROM public.student_progress s) AS progress`)).rows[0];

test("the file is D-110 shaped: header says not applied; guard on production's body; no row statement outside the function", () => {
  const sql = migrationSql(FIX);
  assert.match(sql, /NOT APPLIED IN PRODUCTION\. Applying it needs a separate owner authorisation/);
  assert.match(sql, new RegExp(`'${OLD_MD5}', '${NEW_MD5}'`));
  const outside = sql.replace(/\$function\$[\s\S]*?\$function\$/g, "").replace(/--.*$/gm, "");
  assert.doesNotMatch(outside, /\b(INSERT\s+INTO|DELETE\s+FROM|UPDATE\s+public\.|TRUNCATE)\b/i);
});

test("1+2. inactive in-subject: round 1 deleted, repeat closed with repeat_count kept; nothing else changes", async () => {
  const db = await chain(PROD_ORDER.filter((f) => f !== BOOTSTRAP && f !== ALIGN));
  await db.exec(migrationSql(FIX));
  assert.equal(await md5(db), NEW_MD5);
  const [qA, qB, qC, qD, qE] = TOP10_ID;
  const domains = [...new Set(await Promise.all([qA, qB, qC, qD, qE].map((q) => loOf(db, q))))];

  const p1 = await addPupil(db);                       // round 1 on a question deactivated afterwards
  const stale = await open(db, p1, qA);
  const p2 = await addPupil(db);                       // a reopened repeat, question deactivated afterwards
  const repeat = await reopenedRepeat(db, p2, qB);
  const p3 = await addPupil(db);                       // an open round on an ACTIVE question: served as before
  const live = await open(db, p3, qC);
  const p4 = await addPupil(db);                       // a saved answer (e.g. awaiting a teacher): never released
  const saved = await open(db, p4, qD);
  await db.query("UPDATE public.question_instances SET user_answer = 'svar' WHERE id = $1", [saved]);
  const p5 = await addPupil(db);                       // another pupil's stale round is not the caller's
  const other = await open(db, p5, qE);
  for (const q of [qA, qB, qD, qE]) await deactivate(db, q);

  const before = await everything(db);
  assert.equal(await release(db, p1, domains), 1);
  assert.equal(await row(db, stale), null, "round 1 on an inactive question: deleted");
  assert.equal(await release(db, p2, domains), 1);
  assert.deepEqual(await row(db, repeat), { answered: true, repeat_count: 1, user_answer: null, was_correct: false, at: true },
    "the repeat is closed, never reset to a first attempt");
  assert.equal(await release(db, p3, domains), 0, "an open round on an active question inside the subject stays");
  assert.equal(await release(db, p4, domains), 0, "a saved answer is never released");
  assert.deepEqual((await row(db, saved)).user_answer, "svar");
  assert.notEqual(await row(db, other), null, "only the caller's rows");

  const after = await everything(db);
  assert.deepEqual(after.progress, before.progress, "XP, coins, streaks and counters unchanged");
  const changed = new Set([stale, repeat]);
  assert.deepEqual(after.instances.filter((i) => !changed.has(i.id)), before.instances.filter((i) => !changed.has(i.id)),
    "every other instance byte-identical");
  // Idempotent.
  for (const p of [p1, p2, p3, p4]) assert.equal(await release(db, p, domains), 0);
  assert.deepEqual(await everything(db), after);
});

test("the subject switch behaves exactly as before (an active question outside the subject is released)", async () => {
  for (const withFix of [false, true]) {
    const db = await chain([D280_PATHS, D278, G1]);
    if (withFix) await db.exec(migrationSql(FIX));
    const p = await addPupil(db);
    const id = await open(db, p, TOP10_ID[0]);
    assert.equal(await release(db, p, ["et_andet_fag"]), 1, `withFix=${withFix}`);
    assert.equal(await row(db, id), null);
  }
});

test("3. guard: an unreviewed body aborts with no change; a re-run changes nothing", async () => {
  const db = await chain([D280_PATHS, D278, G1]);
  await db.exec(`CREATE OR REPLACE FUNCTION ${SIG.replace("(text[])", "(p_domains text[])")} RETURNS integer LANGUAGE sql
    SECURITY DEFINER SET search_path TO 'public' AS $$ SELECT 0 $$;`);
  const before = await fingerprint(db);
  await assert.rejects(db.exec(migrationSql(FIX)), /D-316: release_open_question_outside has an unreviewed body/);
  assert.deepEqual(await fingerprint(db), before);
  const ok = await chain([D280_PATHS, D278, G1]);
  await ok.exec(migrationSql(FIX));
  const once = await fingerprint(ok);
  await ok.exec(migrationSql(FIX));
  assert.deepEqual(await fingerprint(ok), once);
});

test("4. the documented rollback restores the old body exactly and the old behaviour", async () => {
  const pre = await chain([D280_PATHS, D278, G1]);
  const preFp = await fingerprint(pre);
  const db = await chain([D280_PATHS, D278, G1]);
  await db.exec(migrationSql(FIX));
  await db.exec(rollbackSql());
  assert.equal(await md5(db), OLD_MD5);
  assert.deepEqual(await fingerprint(db), preFp, "the schema is exactly as before D-316");
  const p = await addPupil(db);
  const id = await open(db, p, TOP10_ID[0]);
  await deactivate(db, TOP10_ID[0]);
  assert.equal(await release(db, p, [await loOf(db, TOP10_ID[0])]), 0, "old behaviour: not released inside the subject");
  assert.notEqual(await row(db, id), null);
  await assert.rejects(db.exec(rollbackSql()), /ROLLBACK D-316: release_open_question_outside does not have D-316's body/);
});

test("5. H5: D-316 before or after H5 — the same schema; a third body still stops the bootstrap", async () => {
  const fixFirst = await chain([D280_PATHS, D278, G1, FIX, BOOTSTRAP, ALIGN]);
  const h5First = await chain([...PROD_ORDER, FIX]);
  assert.deepEqual(await fingerprint(fixFirst), await fingerprint(h5First));
  assert.equal(await md5(fixFirst), NEW_MD5);
  // The bootstrap without D-316 is unchanged in effect.
  assert.equal(await md5(await chain(PROD_ORDER)), OLD_MD5);
  // A third body: refused, nothing changed.
  const bad = await chain([D280_PATHS, D278, G1]);
  await bad.exec(`CREATE OR REPLACE FUNCTION ${SIG.replace("(text[])", "(p_domains text[])")} RETURNS integer LANGUAGE plpgsql
    SECURITY DEFINER SET search_path TO 'public' AS $f$ BEGIN RETURN 0; END $f$;`);
  const before = await fingerprint(bad);
  await assert.rejects(bad.exec(migrationSql(BOOTSTRAP)), /release_open_question_outside\(text\[\]\) har ikke den gennemgåede krop/);
  assert.deepEqual(await fingerprint(bad), before);
});

test("5. H5 history: releasing a reopened repeat on an inactive question closes it and keeps every attempt; G2 still guards", async () => {
  const db = await chain([D280_PATHS, D278, G1, G2, BOOTSTRAP, ALIGN, FIX], { g2Seed: true });
  const q = TOP10_ID[1];
  const key = (await db.query("SELECT content->>'correct' AS k FROM public.questions WHERE id = $1", [q])).rows[0].k;
  const p = await addPupil(db);
  const qi = (await db.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, next_review_at)
    VALUES ($1, $2, $3, now()) RETURNING id`, [p, q, key])).rows[0].id;
  await db.exec("SET ROLE service_role");
  const r = (await db.query("SELECT public.process_question_attempt_v2($1, $2, $3, 1, $4, NULL, NULL) AS r", [p, qi, key, randomUUID()])).rows[0].r;
  await db.exec("RESET ROLE");
  assert.equal(r.outcome, "recorded");
  const attempts = async () => (await db.query("SELECT to_jsonb(a)::text AS a FROM public.question_attempts a WHERE student_id = $1 ORDER BY attempt_no", [p])).rows;
  const history = await attempts();
  assert.equal(history.length, 1);
  // Reopen as the repeat functions do (round guard: repeat_count + 1), then deactivate the question.
  await db.query("UPDATE public.question_instances SET answered = false, repeat_count = repeat_count + 1, user_answer = NULL WHERE id = $1", [qi]);
  await deactivate(db, q);
  assert.equal(await release(db, p, [await loOf(db, q)]), 1);
  assert.deepEqual(await row(db, qi), { answered: true, repeat_count: 1, user_answer: null, was_correct: true, at: true });
  assert.deepEqual(await attempts(), history, "every attempt kept; nothing cascades");
  // G2: a new open round on the inactive question is still refused.
  await assert.rejects(open(db, p, q), /open round refused/);
});

// ── History guard: a round-1 instance that carries H5 history is never deleted ─────────────────────
// The H5 invariant makes the state impossible for every API path; it is forced here past the triggers
// (session_replication_role = replica, superuser only) to prove the release function never removes an
// attempt even then. Negative control: the OLD body (restored by the rollback) deletes the row on a
// subject switch, and the attempts' ON DELETE CASCADE removes the history with it.
async function inconsistentRound1WithHistory(db) {
  const q = TOP10_ID[6];
  const key = (await db.query("SELECT content->>'correct' AS k FROM public.questions WHERE id = $1", [q])).rows[0].k;
  const p = await addPupil(db);
  const qi = (await db.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, next_review_at)
    VALUES ($1, $2, $3, now()) RETURNING id`, [p, q, key])).rows[0].id;
  await db.exec("SET ROLE service_role");
  assert.equal((await db.query("SELECT public.process_question_attempt_v2($1, $2, $3, 1, $4, NULL, NULL) AS r", [p, qi, key, randomUUID()])).rows[0].r.outcome, "recorded");
  await db.exec("RESET ROLE");
  await db.exec("SET session_replication_role = replica");
  await db.query("UPDATE public.question_instances SET answered = false, user_answer = NULL WHERE id = $1", [qi]);
  await db.exec("SET session_replication_role = DEFAULT");
  assert.deepEqual(await row(db, qi), { answered: false, repeat_count: 0, user_answer: null, was_correct: true, at: true }, "forced: open round 1 with history");
  return { p, q, qi };
}
const attemptsOf = async (db, p) => (await db.query("SELECT to_jsonb(a)::text AS a FROM public.question_attempts a WHERE student_id = $1 ORDER BY attempt_no", [p])).rows;

test("history guard: an open round 1 that carries H5 attempts is closed, never deleted — also on a subject switch", async () => {
  const db = await chain([D280_PATHS, D278, G1, BOOTSTRAP, ALIGN, FIX]);
  for (const how of ["inactive question", "subject switch"]) {
    const { p, q, qi } = await inconsistentRound1WithHistory(db);
    const history = await attemptsOf(db, p);
    assert.equal(history.length, 1);
    let domains = [await loOf(db, q)];
    if (how === "inactive question") await deactivate(db, q); else domains = ["et_andet_fag"];
    assert.equal(await release(db, p, domains), 1, `${how}: the pupil is released`);
    assert.deepEqual(await row(db, qi), { answered: true, repeat_count: 0, user_answer: null, was_correct: true, at: true },
      `${how}: closed, not deleted`);
    assert.deepEqual(await attemptsOf(db, p), history, `${how}: every attempt kept`);
    assert.equal(await release(db, p, domains), 0, `${how}: idempotent`);
  }
});

test("negative control: without the guard (old body) the same state loses its history through the cascade", async () => {
  const db = await chain([D280_PATHS, D278, G1, BOOTSTRAP, ALIGN, FIX]);
  await db.exec(rollbackSql());
  assert.equal(await md5(db), OLD_MD5);
  const { p, qi } = await inconsistentRound1WithHistory(db);
  assert.equal((await attemptsOf(db, p)).length, 1);
  assert.equal(await release(db, p, ["et_andet_fag"]), 1);
  assert.equal(await row(db, qi), null, "the old body deletes the round");
  assert.deepEqual(await attemptsOf(db, p), [], "and the cascade removes the attempt — the risk the guard closes");
});
