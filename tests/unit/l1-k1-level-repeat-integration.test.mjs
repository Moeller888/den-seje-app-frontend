// REAL PostgreSQL 17 proof that migration 20261103110000_l1_k1_attempt_context (L1 K1) works with the
// level engine's repeat path, which is live in production since LEVEL_ENGINE=v1 went global
// (2026-11-04 21:59 UTC). get-next-question reopens an answered round through
// request_repeat_level_question_for_student (SECURITY INVOKER, called as service_role); its reopen UPDATE
// and its separate MC re-key UPDATE fire K1's BEFORE trigger question_instances_served_snapshot. No other
// K1 test calls this function.
//
//   0. The function under test is byte-identical to production's (md5 of the body, read 2026-11-05), on
//      production's real order: G2's open-round guard (applied 2026-11-02) before H5, then D-327, then K1,
//      so all three triggers on question_instances fire as they would in production.
//   1. Reopen of a round answered on today's production path (legacy process_question_attempt, served
//      without a proposal because K1_SERVED_SNAPSHOT is off): the round gets the question's current
//      version as its snapshot, fingerprint and time; XP, coins, counters, level and fold log unchanged.
//   2. A key corrected between the answer and the reopen: the re-key in the same transaction is folded
//      into the snapshot, so snapshot, stored key and question agree.
//   3. The snapshot is immutable for the round: a later question edit, a later write to the row and a
//      direct write to the snapshot columns change nothing; round 2 is graded against the delivered
//      version and its attempt carries that fingerprint.
//   4. No answer key leaks: a pupil cannot read the snapshot, fingerprint or key, cannot call the
//      function or the trigger function, and the function returns only the instance id.
//   5. Existing answer history: every earlier question_attempts row and every other instance is byte for
//      byte unchanged by the reopen; round 2 appends attempt 2.
//   6. Concurrency: (a) two simultaneous level repeats reopen once; (b) an edit that commits while the
//      reopen waits gives a snapshot of the edited version, consistent with the re-key; (c) an edit that
//      starts while the reopen is uncommitted waits, and the round keeps the earlier version; (d) a stale
//      round-1 answer racing the reopen is never registered.
//
// Runs only when LEVEL_ENGINE_PG_URL points at a disposable PostgreSQL server; otherwise SKIPPED with
// the reason — unless LEVEL_ENGINE_PG_REQUIRED=1 (CI's PostgreSQL 17.6 service), where it FAILS. Same
// technique as l1-k1-attempt-context-concurrency.test.mjs. Never run against production.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { TOP10_BEFORE, TOP10_ID, uid, baseSql, migrationSql } from "./helpers/h5-integration-chain.mjs";
import { G2_BEFORE_H5, G2_SEED_SQL, G2_TRIGGER } from "./helpers/g2-h5-orders.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const URL = process.env.LEVEL_ENGINE_PG_URL ?? "";
function loadPg() {
  for (const base of [process.env.LEVEL_ENGINE_PG_MODULE_DIR, ROOT].filter(Boolean)) {
    try { return createRequire(join(base, "package.json"))("pg"); } catch { /* next */ }
  }
  return null;
}
const pg = URL ? loadPg() : null;
const SKIP = !URL ? "LEVEL_ENGINE_PG_URL is not set (needs a disposable real PostgreSQL server)"
  : !pg ? "the `pg` client cannot be resolved (set LEVEL_ENGINE_PG_MODULE_DIR)" : false;
const REQUIRED = process.env.LEVEL_ENGINE_PG_REQUIRED === "1";

test("a real PostgreSQL server is present where it is required (CI)", { skip: !REQUIRED }, () => {
  assert.equal(SKIP, false, `LEVEL_ENGINE_PG_REQUIRED=1, but: ${SKIP}`);
});

const K1 = "20261103110000_l1_k1_attempt_context.sql";
const D327 = "20261103100000_question_attempts_history_no_action.sql";
const LEVEL_REPEAT = "public.request_repeat_level_question_for_student(uuid,text[])";
// Production, read-only 2026-11-05: md5(prosrc), SECURITY INVOKER, EXECUTE only postgres + service_role.
const PROD_LEVEL_REPEAT_MD5 = "db8280ddee20254e876be7fb1fc57e4d";

const created = [];
const opened = [];
async function connect(url, asService = true) {
  const c = new pg.Client({ connectionString: url });
  opened.push(c);
  await c.connect();
  if (asService) await c.query("SET ROLE service_role");
  return c;
}
async function done(...clients) {
  for (const c of clients) {
    const i = opened.indexOf(c);
    if (i >= 0) opened.splice(i, 1);
    await c.end().catch(() => {});
  }
}
async function createDb() {
  const admin = new pg.Client({ connectionString: URL });
  await admin.connect();
  const name = `l1_k1_level_${Date.now()}_${created.length}`;
  await admin.query(`CREATE DATABASE ${name} ENCODING 'UTF8' TEMPLATE template0`);
  await admin.end();
  created.push(name);
  const u = new globalThis.URL(URL);
  u.pathname = `/${name}`;
  const url = u.toString();
  const su = await connect(url, false);
  for (const sql of baseSql({ realServer: true })) await su.query(sql);
  await su.query(G2_SEED_SQL);
  for (const f of [...G2_BEFORE_H5, D327]) await su.query(migrationSql(f));
  await su.query(`BEGIN;\n${migrationSql(K1)}\nCOMMIT;`);
  return { url, su };
}
async function teardown() {
  await Promise.all(opened.splice(0).map((c) => c.end().catch(() => {})));
  const admin = new pg.Client({ connectionString: URL });
  await admin.connect();
  for (const name of created.splice(0)) await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.end();
}

// TOP10_BEFORE[1] is the only seeded question in its learning objective, so after one answered round
// the level engine has nothing new to serve in that domain and a repeat is due.
const Q = 1;
const QID = TOP10_ID[Q];
const DOMAIN = TOP10_BEFORE[Q].learning_objective;
const A = TOP10_BEFORE[Q].content;
const B = { ...A, correct: `${A.correct} (B)`, options: A.options.map((o) => (o === A.correct ? `${A.correct} (B)` : o)) };
const LEGACY = "SELECT public.process_question_attempt($1, $2, $3, 0) AS r";
const MC = "SELECT public.process_question_attempt_v2($1, $2, $3, $4, $5, null, null, $6, $7) AS r";
const REPEAT = "SELECT public.request_repeat_level_question_for_student($1, $2::text[]) AS id";

test("real PostgreSQL 17: K1 with the level engine's repeat path (LEVEL_ENGINE=v1)", { skip: SKIP, timeout: 300000 }, async (t) => {
  t.after(teardown);
  const { url, su } = await createDb();
  let n = 1200;

  const setQuestion = (content) => su.query("UPDATE public.questions SET content = $2::jsonb WHERE id = $1", [QID, JSON.stringify(content)]);
  const pupil = async () => {
    const id = uid(n++);
    await su.query("INSERT INTO auth.users VALUES ($1)", [id]);
    await su.query("INSERT INTO public.profiles (id, role, selected_grade) VALUES ($1, 'student', 7)", [id]);
    await su.query(`INSERT INTO public.student_progress (student_id, xp, coins, correct_answers, total_correct_answers,
      current_streak, longest_streak, last_activity_date) VALUES ($1, 100, 50, 7, 7, 1, 1, current_date)`, [id]);
    await su.query("INSERT INTO public.student_subject_level (student_id, subject, level, answered) VALUES ($1, 'historie', 5857, 3)", [id]);
    return id;
  };
  // get-next-question's insert: without a proposal (K1_SERVED_SNAPSHOT off, as in production today) or
  // with the row it read (flag on).
  const serve = async (p, { proposal = false } = {}) => {
    const key = (await su.query("SELECT content ->> 'correct' AS k FROM public.questions WHERE id = $1", [QID])).rows[0].k;
    let snap = null;
    if (proposal) {
      const r = (await su.query("SELECT content, metadata, answer_format, answer_type FROM public.questions WHERE id = $1", [QID])).rows[0];
      snap = JSON.stringify({ content: r.content, metadata: r.metadata, answer_format: r.answer_format, answer_type: r.answer_type });
    }
    return (await su.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, next_review_at, served_snapshot)
      VALUES ($1, $2, $3, now(), $4::jsonb) RETURNING id`, [p, QID, key, snap])).rows[0].id;
  };
  const asService = async (sql, params) => {
    await su.query("SET ROLE service_role");
    try { return (await su.query(sql, params)).rows[0]; } finally { await su.query("RESET ROLE"); }
  };
  // What the level engine folded for the answer (get-next-question writes this after an answer).
  const fold = (p, qi) => su.query(`INSERT INTO public.student_level_fold_log (question_instance_id, student_id, subject,
    was_correct, level_before, level_after) VALUES ($1, $2, 'historie', true, 5850, 5857)`, [qi, p]);
  const reward = async (p) => ({
    progress: (await su.query(`SELECT xp, coins, correct_answers, total_correct_answers, current_streak, longest_streak
      FROM public.student_progress WHERE student_id = $1`, [p])).rows[0],
    level: (await su.query("SELECT subject, level, answered, updated_at FROM public.student_subject_level WHERE student_id = $1 ORDER BY subject", [p])).rows,
    folds: (await su.query("SELECT * FROM public.student_level_fold_log WHERE student_id = $1 ORDER BY question_instance_id", [p])).rows,
    quests: (await su.query("SELECT md5(coalesce(string_agg(q::text, '|' ORDER BY q::text), '')) AS h FROM public.student_quest_progress q WHERE student_id = $1", [p])).rows[0].h,
  });
  const row = async (qi) => (await su.query(`SELECT answered, user_answer, was_correct, answered_at, repeat_count, correct_answer,
    served_snapshot, served_content_sha256, served_at,
    encode(sha256(convert_to(served_snapshot::text, 'UTF8')), 'hex') AS recomputed
    FROM public.question_instances WHERE id = $1`, [qi])).rows[0];
  const questionNow = async () => (await su.query("SELECT content, metadata, answer_format, answer_type FROM public.questions WHERE id = $1", [QID])).rows[0];
  const history = async (p) => (await su.query(`SELECT
      (SELECT md5(coalesce(string_agg(a::text, '|' ORDER BY a.attempt_no, a.id), '')) FROM public.question_attempts a WHERE a.student_id = $1) AS attempts,
      (SELECT count(*)::int FROM public.question_attempts a WHERE a.student_id = $1) AS n`, [p])).rows[0];
  const waitForLockWaiters = async (count) => {
    for (let i = 0; i < 400; i++) {
      const w = (await su.query(`SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'`)).rows[0].n;
      if (w >= count) return;
      await new Promise((r) => setTimeout(r, 25));
    }
    assert.fail(`expected ${count} sessions waiting on a lock`);
  };
  // Every subtest starts from question version A.
  const fresh = async () => { await setQuestion(A); };

  await t.test("0. the function under test is production's, and K1 is in place", async () => {
    const f = (await su.query(`SELECT md5(prosrc) AS h, prosecdef, has_function_privilege('authenticated', oid, 'EXECUTE') AS auth,
      has_function_privilege('anon', oid, 'EXECUTE') AS anon, has_function_privilege('service_role', oid, 'EXECUTE') AS svc
      FROM pg_proc WHERE oid = to_regprocedure($1)`, [LEVEL_REPEAT])).rows[0];
    assert.deepEqual(f, { h: PROD_LEVEL_REPEAT_MD5, prosecdef: false, auth: false, anon: false, svc: true });
    const trg = (await su.query(`SELECT count(*)::int AS n FROM pg_trigger WHERE tgname = 'question_instances_served_snapshot'
      AND tgrelid = 'public.question_instances'::regclass AND tgenabled = 'O'`)).rows[0].n;
    assert.equal(trg, 1);
    const g2 = (await su.query("SELECT count(*)::int AS n FROM pg_trigger WHERE tgname = $1 AND tgenabled = 'O'", [G2_TRIGGER])).rows[0].n;
    assert.equal(g2, 1, "G2's open-round guard is active, as in production");
    assert.equal(TOP10_BEFORE.filter((q) => q.learning_objective === DOMAIN).length, 1, "the domain holds exactly one seeded question");
  });

  await t.test("1. reopen of a round answered on today's path: current version snapshotted, rewards and level untouched", async () => {
    await fresh();
    const p = await pupil();
    const qi = await serve(p);
    assert.equal((await row(qi)).served_snapshot, null, "flag off: no snapshot at delivery");
    const r1 = (await asService(LEGACY, [p, qi, A.correct])).r;
    assert.equal(r1.status, "correct");
    await fold(p, qi);
    assert.equal((await asService(REPEAT, [p, ["no_such_domain"]])).id, null, "another domain: nothing to repeat");
    const before = await reward(p);

    const reopened = (await asService(REPEAT, [p, [DOMAIN]])).id;
    assert.equal(reopened, qi);
    const r = await row(qi);
    assert.equal(r.answered, false);
    assert.equal(r.repeat_count, 1);
    assert.equal(r.user_answer, null);
    assert.equal(r.was_correct, null);
    assert.equal(r.correct_answer, A.correct);
    const q = await questionNow();
    assert.deepEqual(r.served_snapshot, { content: q.content, metadata: q.metadata, answer_format: q.answer_format,
      answer_type: q.answer_type, correct_answer: A.correct });
    assert.equal(r.served_content_sha256, r.recomputed);
    assert.match(r.served_content_sha256, /^[0-9a-f]{64}$/);
    assert.ok(r.served_at instanceof Date);
    assert.deepEqual(await reward(p), before, "XP, coins, counters, streak, quests, level and fold log unchanged");
    assert.equal((await asService(REPEAT, [p, [DOMAIN]])).id, null, "an open round is never reopened twice");
  });

  await t.test("2. a key corrected before the reopen: the same-transaction re-key is folded into the snapshot", async () => {
    await fresh();
    const p = await pupil();
    const qi = await serve(p);
    await asService(LEGACY, [p, qi, A.correct]);
    await setQuestion(B);
    const before = await reward(p);
    assert.equal((await asService(REPEAT, [p, [DOMAIN]])).id, qi);
    const r = await row(qi);
    assert.equal(r.correct_answer, B.correct, "MC re-key follows the corrected question");
    assert.deepEqual(r.served_snapshot.content, B);
    assert.equal(r.served_snapshot.correct_answer, B.correct, "snapshot, stored key and question agree");
    assert.equal(r.served_content_sha256, r.recomputed);
    assert.deepEqual(await reward(p), before);
  });

  await t.test("3. the snapshot is immutable for the round and round 2 is graded against it", async () => {
    await fresh();
    const p = await pupil();
    const qi = await serve(p);
    await asService(LEGACY, [p, qi, A.correct]);
    await asService(REPEAT, [p, [DOMAIN]]);
    const delivered = await row(qi);

    await setQuestion(B);
    assert.deepEqual(await row(qi), delivered, "a later question edit does not touch the round");
    await asService("UPDATE public.question_instances SET next_review_at = now() + interval '1 hour' WHERE id = $1 RETURNING id", [qi]);
    await asService(`UPDATE public.question_instances SET served_snapshot = '{"content": {}}'::jsonb,
      served_content_sha256 = repeat('0', 64), served_at = now() - interval '1 day' WHERE id = $1 RETURNING id`, [qi]);
    const after = await row(qi);
    assert.deepEqual([after.served_snapshot, after.served_content_sha256, after.served_at.getTime()],
      [delivered.served_snapshot, delivered.served_content_sha256, delivered.served_at.getTime()], "direct writes are ignored");

    const before = await reward(p);
    const r2 = (await asService(MC, [p, qi, A.correct, 2, randomUUID(), "quiz_v1", 0])).r;
    assert.deepEqual([r2.outcome, r2.status, r2.round_no, r2.correct_answer], ["recorded", "correct", 2, A.correct], "graded against the delivered A");
    const att = (await su.query("SELECT attempt_no, is_repeat, question_content_sha256 AS h FROM public.question_attempts WHERE question_instance_id = $1", [qi])).rows;
    assert.deepEqual(att, [{ attempt_no: 2, is_repeat: true, h: delivered.served_content_sha256 }]);
    const now = await reward(p);
    assert.deepEqual({ xp: now.progress.xp - before.progress.xp, coins: now.progress.coins - before.progress.coins },
      { xp: 2, coins: 1 }, "only the answer to the repeat pays, at the repeat rate (D-211)");
    assert.deepEqual([now.level, now.folds], [before.level, before.folds], "level and fold log are the level engine's, not K1's");
  });

  await t.test("4. no answer key leaks to the pupil", async () => {
    await fresh();
    const p = await pupil();
    const qi = await serve(p);
    await asService(LEGACY, [p, qi, A.correct]);
    const reopened = await asService(REPEAT, [p, [DOMAIN]]);
    assert.deepEqual(Object.keys(reopened), ["id"]);
    assert.match(reopened.id, /^[0-9a-f-]{36}$/, "the function returns only the instance id");

    const pupilSession = await connect(url, false);
    try {
      await pupilSession.query("SET ROLE authenticated");
      await pupilSession.query("SELECT set_config('test.uid', $1, false)", [p]);
      const own = (await pupilSession.query("SELECT id, answered, repeat_count FROM public.question_instances WHERE id = $1", [qi])).rows;
      assert.deepEqual(own, [{ id: qi, answered: false, repeat_count: 1 }], "the pupil still sees their own round");
      for (const col of ["served_snapshot", "served_content_sha256", "served_at", "correct_answer"]) {
        await assert.rejects(pupilSession.query(`SELECT ${col} FROM public.question_instances WHERE id = $1`, [qi]),
          (e) => e.code === "42501", `${col} is not readable by the pupil`);
      }
      await assert.rejects(pupilSession.query(REPEAT, [p, [DOMAIN]]), (e) => e.code === "42501", "the pupil cannot call the level repeat");
      await assert.rejects(pupilSession.query("SELECT * FROM public.question_attempts"), (e) => e.code === "42501");
    } finally {
      await done(pupilSession);
    }
    const tf = (await su.query(`SELECT has_function_privilege('service_role', 'public.question_instances_served_snapshot()', 'EXECUTE') AS s,
      has_function_privilege('authenticated', 'public.question_instances_served_snapshot()', 'EXECUTE') AS a`)).rows[0];
    assert.deepEqual(tf, { s: false, a: false });
  });

  await t.test("5. existing answer history is unchanged by the reopen; round 2 appends", async () => {
    await fresh();
    const p = await pupil();
    // Another round of this pupil, in another domain, answered through H5 (flag on): its row and attempt
    // must survive the reopen byte for byte.
    const otherQ = TOP10_ID[0];
    const otherKey = TOP10_BEFORE[0].content.correct;
    const or = (await su.query("SELECT content, metadata, answer_format, answer_type FROM public.questions WHERE id = $1", [otherQ])).rows[0];
    const other = (await su.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, next_review_at, served_snapshot)
      VALUES ($1, $2, $3, now(), $4::jsonb) RETURNING id`, [p, otherQ, otherKey, JSON.stringify(or)])).rows[0].id;
    assert.equal((await asService(MC, [p, other, otherKey, 1, randomUUID(), "quiz_v1", 0])).r.outcome, "recorded");

    const qi = await serve(p, { proposal: true });
    assert.equal((await asService(MC, [p, qi, `${A.correct} forkert`, 1, randomUUID(), "quiz_v1", 1])).r.status, "incorrect");
    const round1 = (await row(qi)).served_content_sha256;

    const hBefore = await history(p);
    const otherBefore = (await su.query("SELECT q::text AS t FROM public.question_instances q WHERE id = $1", [other])).rows[0].t;
    assert.equal(hBefore.n, 2);
    assert.equal((await asService(REPEAT, [p, [DOMAIN]])).id, qi);
    assert.deepEqual(await history(p), hBefore, "every earlier attempt is byte for byte unchanged");
    assert.equal((await su.query("SELECT q::text AS t FROM public.question_instances q WHERE id = $1", [other])).rows[0].t, otherBefore);
    const r = await row(qi);
    assert.equal(r.served_content_sha256, round1, "same version re-delivered: same fingerprint");

    assert.equal((await asService(MC, [p, qi, A.correct, 2, randomUUID(), "quiz_v1", 0])).r.outcome, "recorded");
    const att = (await su.query(`SELECT attempt_no, status, is_repeat, question_content_sha256 AS h FROM public.question_attempts
      WHERE question_instance_id = $1 ORDER BY attempt_no`, [qi])).rows;
    assert.deepEqual(att, [
      { attempt_no: 1, status: "incorrect", is_repeat: false, h: round1 },
      { attempt_no: 2, status: "correct", is_repeat: true, h: round1 },
    ]);
    await assert.rejects(su.query("UPDATE public.question_attempts SET user_answer = 'x' WHERE question_instance_id = $1", [qi]),
      "H5's history stays append-only with K1 in place");
  });

  await t.test("6a. two simultaneous level repeats for one pupil reopen the round once", async () => {
    await fresh();
    const p = await pupil();
    const qi = await serve(p);
    await asService(LEGACY, [p, qi, A.correct]);
    const before = await reward(p);
    const blocker = await connect(url, false);
    await blocker.query("BEGIN");
    await blocker.query("SELECT 1 FROM public.question_instances WHERE id = $1 FOR UPDATE", [qi]);
    const s = await Promise.all([connect(url), connect(url)]);
    const running = s.map((c) => c.query(REPEAT, [p, [DOMAIN]]).then((r) => r.rows[0].id));
    await waitForLockWaiters(2);
    await blocker.query("COMMIT");
    const ids = await Promise.all(running);
    await done(blocker, ...s);
    assert.deepEqual(ids.slice().sort(), [qi, null].sort(), "one reopens, the other gets nothing");
    const r = await row(qi);
    assert.deepEqual([r.answered, r.repeat_count], [false, 1]);
    assert.equal(r.served_content_sha256, r.recomputed);
    assert.equal((await su.query("SELECT count(*)::int AS n FROM public.question_instances WHERE student_id = $1 AND answered = false", [p])).rows[0].n, 1);
    assert.deepEqual(await reward(p), before);
  });

  await t.test("6b. an edit committed while the reopen waits: snapshot is the edited version, consistent with the re-key", async () => {
    await fresh();
    const p = await pupil();
    const qi = await serve(p);
    await asService(LEGACY, [p, qi, A.correct]);
    const editor = await connect(url, false);
    const server = await connect(url);
    await editor.query("BEGIN");
    await editor.query("UPDATE public.questions SET content = $2::jsonb WHERE id = $1", [QID, JSON.stringify(B)]);
    const reopening = server.query(REPEAT, [p, [DOMAIN]]).then((r) => r.rows[0].id);
    await waitForLockWaiters(1);
    await editor.query("COMMIT");
    assert.equal(await reopening, qi);
    await done(editor, server);
    const r = await row(qi);
    assert.deepEqual(r.served_snapshot.content, B);
    assert.equal(r.served_snapshot.correct_answer, B.correct);
    assert.equal(r.correct_answer, B.correct);
    assert.equal(r.served_content_sha256, r.recomputed);
  });

  await t.test("6c. an edit started while the reopen is uncommitted waits; the round keeps the earlier version", async () => {
    await fresh();
    const p = await pupil();
    const qi = await serve(p);
    await asService(LEGACY, [p, qi, A.correct]);
    const editor = await connect(url, false);
    const server = await connect(url);
    await server.query("BEGIN");
    assert.equal((await server.query(REPEAT, [p, [DOMAIN]])).rows[0].id, qi);
    const editing = editor.query("UPDATE public.questions SET content = $2::jsonb WHERE id = $1", [QID, JSON.stringify(B)]);
    await waitForLockWaiters(1);
    await server.query("COMMIT");
    await editing;
    await done(editor, server);
    const r = await row(qi);
    assert.deepEqual(r.served_snapshot.content, A, "the delivered version is A, not the later B");
    assert.equal(r.served_snapshot.correct_answer, A.correct);
    const g = (await asService(MC, [p, qi, A.correct, 2, randomUUID(), "quiz_v1", 0])).r;
    assert.deepEqual([g.outcome, g.status], ["recorded", "correct"], "graded against the delivered A");
  });

  await t.test("6d. a stale round-1 answer racing the level reopen is never registered", async () => {
    await fresh();
    const p = await pupil();
    const qi = await serve(p, { proposal: true });
    assert.equal((await asService(MC, [p, qi, A.correct, 1, randomUUID(), "quiz_v1", 0])).r.outcome, "recorded");
    const before = await reward(p);
    const blocker = await connect(url, false);
    await blocker.query("BEGIN");
    await blocker.query("SELECT 1 FROM public.question_instances WHERE id = $1 FOR UPDATE", [qi]);
    const [reopener, late] = await Promise.all([connect(url), connect(url)]);
    const reopening = reopener.query(REPEAT, [p, [DOMAIN]]).then((r) => r.rows[0].id);
    const stale = late.query(MC, [p, qi, A.correct, 1, randomUUID(), "quiz_v1", 0]).then((r) => r.rows[0].r.outcome);
    await waitForLockWaiters(2);
    await blocker.query("COMMIT");
    const [id, outcome] = await Promise.all([reopening, stale]);
    await done(blocker, reopener, late);
    assert.equal(id, qi);
    assert.ok(["round_closed", "stale_round"].includes(outcome), outcome);
    assert.equal((await history(p)).n, 1, "only the original round-1 attempt");
    assert.deepEqual(await reward(p), before, "the stale answer paid nothing");
  });
});
