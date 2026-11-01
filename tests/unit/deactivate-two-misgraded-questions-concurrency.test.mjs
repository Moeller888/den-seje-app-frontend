// REAL concurrency proof for D-290 — 20261101140000_deactivate_two_misgraded_questions.sql — on a real
// PostgreSQL server with several simultaneous sessions, what PGlite (one connection) cannot show.
// The schema and the repeat functions are production's (helpers/answer-chain-schema.mjs, then D-280
// part 1, which production runs); the two questions carry production's content and metadata
// (fixtures/d290-two-questions.json), so the migration's md5 guards pass unmodified. Pupil ids synthetic.
//
// Same switch as the other real-server suites: runs only when LEVEL_ENGINE_PG_URL points at a
// disposable PostgreSQL server where the user may create databases and roles; otherwise SKIPPED with
// the reason, unless LEVEL_ENGINE_PG_REQUIRED=1 (CI's PostgreSQL 17 service), where a missing server
// FAILS. Each scenario creates its own database and drops it afterwards.
//
// What this proves (get-next-question and the repeat functions around the migration):
//   1. An insert of an open instance that holds its locks first: the migration WAITS, then counts the
//      open instance and aborts atomically — both questions stay active, no guard function or trigger.
//   2. The migration holding its locks first: a waiting insert of an open instance, and a waiting reopen
//      through each of the three live repeat paths, are REFUSED after the commit (23514).
//   3. A candidate read before the deactivation (get-next-question reads, then inserts) cannot become
//      an open instance on an inactive question; the next candidate is inserted as before.
//   4. No pupil is left with a new stuck instance: no open instance points at an inactive question, and
//      every pupil can open a round on an active question afterwards. With the guard installed, a later
//      deactivation waits for an insert that holds the question row (FOR SHARE).
//   5. The migration changes only questions.is_active of the two approved questions.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { answerChainSql, readMigration } from "./helpers/answer-chain-schema.mjs";

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

const PATHS = readMigration("20261031194600_mc_length_cue_answer_paths.sql");
const MIGRATION = readMigration("20261101140000_deactivate_two_misgraded_questions.sql");
const FIXTURE = JSON.parse(readFileSync(join(ROOT, "tests", "unit", "fixtures", "d290-two-questions.json"), "utf8"));
const [A, B] = FIXTURE.map((q) => q.id);
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const OTHER = [uid(9201), uid(9202), uid(9203)];
const lit = (s) => `'${s.replace(/'/g, "''")}'`;
const COLS = `id, type, content, metadata, difficulty, is_active, question_type, learning_objective, answer_format,
  answer_type, target_grade, difficulty_band, difficulty_level`;
const row = (q) => `('${q.id}', '${q.type}', ${lit(q.content)}::jsonb, ${lit(q.metadata)}::jsonb, ${q.difficulty}, true,
  '${q.question_type}', '${q.learning_objective}', '${q.answer_format}', '${q.answer_type}', ${q.target_grade},
  ${q.difficulty_band}, ${q.difficulty_level})`;
const others = OTHER.map((id, i) => ({ ...FIXTURE[0], id, difficulty_level: 2100 + i,
  content: JSON.stringify({ correct: "is", options: ["is", "are", "be", "am"], question: `She ___ here (${i}).`,
    review_text: "she is", accepted_answers: ["is"] }) }));
const SEED = `INSERT INTO public.questions (${COLS}) VALUES ${[...FIXTURE, ...others].map(row).join(",\n")};`;

const opened = [];
const databases = [];
async function freshDatabase() {
  const admin = new pg.Client({ connectionString: URL });
  await admin.connect();
  const name = `d290_conc_${Date.now()}_${databases.length}`;
  await admin.query(`CREATE DATABASE ${name} ENCODING 'UTF8' TEMPLATE template0`);
  await admin.end();
  databases.push(name);
  const u = new globalThis.URL(URL);
  u.pathname = `/${name}`;
  const dbUrl = u.toString();
  // A statement_timeout turns a wrong expectation into a failure instead of a hung job. The backend
  // pid is read at connect: the client queues queries, so a later pid query would wait behind a block.
  const connect = async (role = null) => {
    const c = new pg.Client({ connectionString: dbUrl });
    opened.push(c);
    await c.connect();
    await c.query("SET statement_timeout = '30s'");
    c.pid = (await c.query("SELECT pg_backend_pid() AS p")).rows[0].p;
    if (role) await c.query(`SET ROLE ${role}`);
    return c;
  };
  const su = await connect();
  for (const sql of answerChainSql({ realServer: true })) await su.query(sql);
  await su.query(PATHS);
  await su.query(SEED);
  let next = 100;
  const pupil = async () => {
    const id = uid(next++);
    await su.query(`INSERT INTO auth.users VALUES ('${id}');
      INSERT INTO public.profiles (id, role, selected_grade) VALUES ('${id}', 'student', 9);
      INSERT INTO public.student_progress (student_id, xp, coins, correct_answers, total_correct_answers,
        current_streak, longest_streak, last_activity_date) VALUES ('${id}', 100, 50, 7, 7, 1, 1, current_date - 1);`);
    return id;
  };
  const answered = async (p, q, wasCorrect) => su.query(`INSERT INTO public.question_instances (student_id, question_id,
      correct_answer, answered, answered_at, was_correct, user_answer, next_review_at)
    VALUES ($1, $2, 'x', true, now() - interval '1 day', $3, 'x', now())`, [p, q, wasCorrect]);
  return { connect, su, pupil, answered };
}
async function teardown() {
  await Promise.all(opened.splice(0).map((c) => c.end().catch(() => {})));
  const admin = new pg.Client({ connectionString: URL });
  await admin.connect();
  for (const name of databases.splice(0)) await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.end();
}
async function waitsOnLock(observer, pid) {
  for (let i = 0; i < 200; i++) {
    const r = (await observer.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1", [pid])).rows[0];
    if (r?.wait_event_type === "Lock") return true;
    await new Promise((res) => setTimeout(res, 50));
  }
  return false;
}
const settle = (promise) => promise.then((r) => r, (e) => e);
const INSERT_OPEN = `INSERT INTO public.question_instances (student_id, question_id, correct_answer, answered, next_review_at)
  VALUES ($1, $2, 'x', false, now()) RETURNING id`;
const refused = (e) => e instanceof Error && e.code === "23514" && /open round refused: question .* is not active/.test(e.message);
const state = async (su) => (await su.query(`SELECT
  (SELECT json_agg(json_build_object('id', id, 'a', is_active) ORDER BY id) FROM public.questions WHERE id = ANY($1::uuid[])) AS active,
  (SELECT count(*)::int FROM pg_proc WHERE proname = 'guard_open_round_requires_active_question') AS fn,
  (SELECT count(*)::int FROM pg_trigger WHERE tgname = 'open_round_requires_active_question') AS tg`, [[A, B]])).rows[0];
// No pupil may hold an open instance on an inactive question (get-next-question never serves it, and it
// blocks every new question through idx_one_open_question).
const stuck = async (su) => (await su.query(`SELECT count(*)::int AS n FROM public.question_instances qi
  JOIN public.questions q ON q.id = qi.question_id WHERE NOT qi.answered AND NOT q.is_active`)).rows[0].n;
const canOpen = async (conn, p, q) => {
  const r = await settle(conn.query(INSERT_OPEN, [p, q]));
  return !(r instanceof Error) && r.rows.length === 1;
};

test("real PostgreSQL: D-290 deactivation under simultaneous pupil activity", { skip: SKIP, timeout: 240000 }, async (t) => {
  t.after(teardown);

  await t.test("1. an insert that locks first: the migration waits, then aborts atomically", async () => {
    const { connect, su, pupil } = await freshDatabase();
    const p = await pupil();
    const gnq = await connect("service_role"), migr = await connect();
    await gnq.query("BEGIN");
    await gnq.query(INSERT_OPEN, [p, A]);
    const running = settle(migr.query(MIGRATION));
    assert.equal(await waitsOnLock(su, migr.pid), true, "the migration must wait for the insert's transaction");
    await gnq.query("COMMIT");
    const outcome = await running;
    assert.ok(outcome instanceof Error && /D-290: 1 open instance\(s\) of these questions; nothing changed/.test(outcome.message), String(outcome));
    assert.deepEqual(await state(su), { active: [{ id: A, a: true }, { id: B, a: true }], fn: 0, tg: 0 },
      "nothing changed: both active, no guard function, no trigger");
    assert.equal(await stuck(su), 0, "the open instance is on an active question, which get-next-question serves");
  });

  await t.test("2a. the migration first: a waiting insert of an open instance is refused after the commit", async () => {
    const { connect, su, pupil } = await freshDatabase();
    const p = await pupil();
    const gnq = await connect("service_role"), migr = await connect();
    await migr.query("BEGIN");
    await migr.query(MIGRATION);
    const inserting = settle(gnq.query(INSERT_OPEN, [p, A]));
    assert.equal(await waitsOnLock(su, gnq.pid), true, "the insert must wait for the migration");
    await migr.query("COMMIT");
    assert.ok(refused(await inserting), "refused: the question is inactive after the wait");
    assert.equal(await stuck(su), 0);
    assert.equal(await canOpen(gnq, p, OTHER[0]), true, "the pupil gets the next candidate");
  });

  const REPEATS = [
    ["request_repeat_question_for_student", "SELECT public.request_repeat_question_for_student($1, 9::smallint, ARRAY['english']) AS id"],
    ["request_repeat_question_servable_for_student", "SELECT public.request_repeat_question_servable_for_student($1, 9::smallint, ARRAY['english']) AS id"],
    ["request_repeat_level_question_for_student", "SELECT public.request_repeat_level_question_for_student($1, ARRAY['english']) AS id"],
  ];
  for (const [name, sql] of REPEATS) {
    await t.test(`2b. ${name}: a reopen waiting on the migration is refused after the commit`, async () => {
      const { connect, su, pupil, answered } = await freshDatabase();
      const p = await pupil();
      // Every English question served; A answered wrong, so the repeat path picks A first.
      await answered(p, A, false);
      for (const q of [B, ...OTHER]) await answered(p, q, true);
      const migr = await connect(), gnq = await connect("service_role");
      await migr.query("BEGIN");
      await migr.query(MIGRATION);
      const reopening = settle(gnq.query(sql, [p]));
      assert.equal(await waitsOnLock(su, gnq.pid), true, "the reopen must wait for the migration");
      await migr.query("COMMIT");
      assert.ok(refused(await reopening), `${name}: refused`);
      assert.equal(await stuck(su), 0);
      // The next request picks an instance of an active question.
      const again = await gnq.query(sql, [p]);
      const id = again.rows[0].id;
      const q = (await su.query(`SELECT q.is_active, qi.answered FROM public.question_instances qi
        JOIN public.questions q ON q.id = qi.question_id WHERE qi.id = $1`, [id])).rows[0];
      assert.deepEqual(q, { is_active: true, answered: false });
    });
  }

  await t.test("3. a candidate read before the deactivation never becomes an open instance on it", async () => {
    const { connect, su, pupil } = await freshDatabase();
    const p1 = await pupil(), p2 = await pupil();
    const gnq = await connect("service_role"), migr = await connect();
    // get-next-question reads its candidates first …
    const candidates = (await gnq.query(`SELECT id FROM public.questions WHERE is_active AND learning_objective = 'english'
      ORDER BY (id = $1) DESC, (id = $2) DESC, id`, [A, B])).rows.map((r) => r.id);
    assert.deepEqual(candidates.slice(0, 2), [A, B]);
    // … the deactivation commits in between …
    const outcome = await settle(migr.query(MIGRATION));
    assert.ok(!(outcome instanceof Error), String(outcome));
    // … and the inserts come afterwards: the stale candidates are refused, the next one is taken.
    for (const p of [p1, p2]) {
      let taken = null;
      for (const q of candidates) {
        const r = await settle(gnq.query(INSERT_OPEN, [p, q]));
        if (r instanceof Error) { assert.ok(refused(r), String(r)); continue; }
        taken = q;
        break;
      }
      assert.equal(taken, OTHER[0]);
      await su.query("UPDATE public.question_instances SET answered = true WHERE student_id = $1", [p]);
    }
    assert.equal(await stuck(su), 0);
  });

  await t.test("4. no pupil is left stuck; a later deactivation waits for an insert holding the row", async () => {
    const { connect, su, pupil } = await freshDatabase();
    const ps = [await pupil(), await pupil(), await pupil()];
    const gnq = [await connect("service_role"), await connect("service_role"), await connect("service_role")];
    const migr = await connect();
    await migr.query("BEGIN");
    await migr.query(MIGRATION);
    const pending = ps.map((p, i) => settle(gnq[i].query(INSERT_OPEN, [p, i === 2 ? OTHER[1] : [A, B][i]])));
    for (const c of gnq) assert.equal(await waitsOnLock(su, c.pid), true);
    await migr.query("COMMIT");
    const [r0, r1, r2] = await Promise.all(pending);
    assert.ok(refused(r0) && refused(r1), "both refused");
    assert.ok(!(r2 instanceof Error), "an active question is unaffected");
    assert.equal(await stuck(su), 0);
    for (const [i, p] of ps.slice(0, 2).entries()) assert.equal(await canOpen(gnq[i], p, OTHER[0 + i * 2]), true, "not stuck");

    // With the guard installed, an insert holds its question row: a later deactivation waits for it,
    // and must then find the open instance itself (as part 2's guard does).
    const p4 = await pupil();
    await gnq[2].query("UPDATE public.question_instances SET answered = true WHERE student_id = $1", [ps[2]]);
    await gnq[2].query("BEGIN");
    await gnq[2].query(INSERT_OPEN, [p4, OTHER[1]]);
    const later = settle(su.query("UPDATE public.questions SET is_active = false WHERE id = $1", [OTHER[1]]));
    const watcher = await connect();
    assert.equal(await waitsOnLock(watcher, su.pid), true, "a deactivation waits for the insert (FOR SHARE)");
    await gnq[2].query("COMMIT");
    assert.ok(!((await later) instanceof Error));
  });

  await t.test("5. the migration changes only questions.is_active of the two approved questions", async () => {
    const { connect, su, pupil, answered } = await freshDatabase();
    const p = await pupil();
    await answered(p, A, true);
    await answered(p, B, false);
    const snap = async () => (await su.query(`SELECT
      (SELECT json_agg(to_jsonb(q) - 'is_active' ORDER BY id) FROM public.questions q) AS q,
      (SELECT json_agg(json_build_object('id', id, 'a', is_active) ORDER BY id) FROM public.questions) AS a,
      (SELECT json_agg(to_jsonb(i) ORDER BY id) FROM public.question_instances i) AS i,
      (SELECT json_agg(to_jsonb(s) ORDER BY student_id) FROM public.student_progress s) AS s`)).rows[0];
    const before = await snap();
    const migr = await connect();
    const outcome = await settle(migr.query(MIGRATION));
    assert.ok(!(outcome instanceof Error), String(outcome));
    const after = await snap();
    assert.deepEqual(after.q, before.q, "every other column of every question unchanged");
    assert.deepEqual(after.i, before.i, "instances and answers unchanged");
    assert.deepEqual(after.s, before.s, "rewards and statistics unchanged");
    const changed = after.a.filter((r, i) => r.a !== before.a[i].a).map((r) => [r.id, r.a]);
    assert.deepEqual(changed, [[A, false], [B, false]]);
    assert.deepEqual(await state(su), { active: [{ id: A, a: false }, { id: B, a: false }], fn: 1, tg: 1 });
  });
});
