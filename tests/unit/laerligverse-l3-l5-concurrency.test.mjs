// REAL PostgreSQL 17 proof for migration 20261108043500 (Lærligverse L5 + L3) — what PGlite (one connection) cannot
// show: a hint request and an answer for the same round are strictly ordered by the shared row lock, so every
// logged hint is counted in the attempt and no hint can be logged after it.
//
//   1. A hint whose transaction is still open when the answer arrives: the answer WAITS, then counts it.
//   2. An answer whose transaction is still open when a hint arrives: the hint WAITS, then is refused
//      (round_closed); the attempt keeps hints_used = 0 and the log stays empty.
//   3. Eight simultaneous hint requests with the SAME request id: one log row, seven replays; the answer counts 1.
//   4. Four hint requests and four answers released at once, in whatever order the server schedules them: exactly
//      one attempt, and its hints_used equals the number of distinct levels in the log — never logged-but-uncounted.
//
// Built like l1-k1-attempt-context-concurrency.test.mjs: the merged H5 chain in production's order + D-327 + K1, then
// question_instances' API-role privileges set to production's pre-state (the chain's base does not model them; the
// migration's guard requires them), then this file UNMODIFIED. Runs only when LEVEL_ENGINE_PG_URL points at a
// disposable PostgreSQL server; otherwise SKIPPED with the reason — unless LEVEL_ENGINE_PG_REQUIRED=1 (CI's
// PostgreSQL 17.6 service), where it FAILS.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PROD_ORDER, TOP10_BEFORE, TOP10_ID, uid, baseSql, migrationSql } from "./helpers/h5-integration-chain.mjs";

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
const FILE = "20261108043500_laerligverse_served_mode_hint_log.sql";
// Production's pre-state of question_instances for the API roles (see the migration header).
const PROD_PRIVILEGES = `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
END $$;
REVOKE ALL ON public.question_instances FROM PUBLIC, anon, authenticated;
GRANT UPDATE, DELETE, REFERENCES, TRIGGER ON public.question_instances TO anon, authenticated;`;

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
async function teardown() {
  await Promise.all(opened.splice(0).map((c) => c.end().catch(() => {})));
  const admin = new pg.Client({ connectionString: URL });
  await admin.connect();
  for (const name of created.splice(0)) await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.end();
}
async function createDb() {
  const admin = new pg.Client({ connectionString: URL });
  await admin.connect();
  const name = `l3_l5_${Date.now()}_${created.length}`;
  await admin.query(`CREATE DATABASE ${name} ENCODING 'UTF8' TEMPLATE template0`);
  await admin.end();
  created.push(name);
  const u = new globalThis.URL(URL);
  u.pathname = `/${name}`;
  const url = u.toString();
  const su = await connect(url, false);
  for (const sql of baseSql({ realServer: true })) await su.query(sql);
  for (const f of [...PROD_ORDER, D327]) await su.query(migrationSql(f));
  await su.query(`BEGIN;\n${migrationSql(K1)}\nCOMMIT;`);
  await su.query(PROD_PRIVILEGES);
  await su.query(`BEGIN;\n${migrationSql(FILE)}\nCOMMIT;`);
  return { url, su };
}

const Q = 0;
const RIGHT = TOP10_BEFORE[Q].content.correct;
const HINT = "SELECT public.request_question_hint($1, $2, $3, $4, $5) AS r";
const ANSWER = "SELECT public.process_question_attempt_with_context($1, $2, $3, $4, $5, NULL, NULL) AS r";

test("real PostgreSQL 17: a hint and an answer for one round are strictly ordered; every logged hint is counted", { skip: SKIP, timeout: 300000 }, async (t) => {
  t.after(teardown);
  const { url, su } = await createDb();
  // The question offers three hint levels.
  await su.query(`UPDATE public.questions SET content = content || '{"hints":["Én.","To.","Tre."]}'::jsonb WHERE id = $1`, [TOP10_ID[Q]]);
  let n = 1300;
  const pupil = async () => {
    const id = uid(n++);
    await su.query("INSERT INTO auth.users VALUES ($1)", [id]);
    await su.query("INSERT INTO public.profiles (id, role, selected_grade) VALUES ($1, 'student', 5)", [id]);
    await su.query(`INSERT INTO public.student_progress (student_id, xp, coins, correct_answers, total_correct_answers,
      current_streak, longest_streak, last_activity_date) VALUES ($1, 100, 50, 7, 7, 1, 1, current_date - 1)`, [id]);
    return id;
  };
  const serve = async (p) => (await su.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer,
    next_review_at) VALUES ($1, $2, $3, now()) RETURNING id`, [p, TOP10_ID[Q], RIGHT])).rows[0].id;
  const attempts = async (qi) => (await su.query(`SELECT attempt_no, mode, hints_used FROM public.question_attempts
    WHERE question_instance_id = $1 ORDER BY attempt_no`, [qi])).rows;
  const logged = async (qi) => (await su.query(`SELECT count(DISTINCT hint_level)::int AS n, count(*)::int AS rows
    FROM public.question_hint_requests WHERE question_instance_id = $1`, [qi])).rows[0];
  const waitForLockWaiters = async (count) => {
    for (let i = 0; i < 400; i++) {
      const w = (await su.query(`SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'`)).rows[0].n;
      if (w >= count) return;
      await new Promise((r) => setTimeout(r, 25));
    }
    assert.fail(`expected ${count} sessions waiting on a lock`);
  };

  await t.test("1. a hint still open when the answer arrives: the answer waits, then counts it", async () => {
    const p = await pupil();
    const qi = await serve(p);
    const h = await connect(url);
    const a = await connect(url);
    await h.query("BEGIN");
    assert.equal((await h.query(HINT, [p, qi, 1, 1, randomUUID()])).rows[0].r.outcome, "recorded");
    const answering = a.query(ANSWER, [p, qi, RIGHT, 1, randomUUID()]);
    await waitForLockWaiters(1);
    await h.query("COMMIT");
    assert.equal((await answering).rows[0].r.outcome, "recorded");
    assert.deepEqual(await attempts(qi), [{ attempt_no: 1, mode: "quiz_v1", hints_used: 1 }]);
    await done(h, a);
  });

  await t.test("2. an answer still open when a hint arrives: the hint waits, then is refused; nothing changes", async () => {
    const p = await pupil();
    const qi = await serve(p);
    const h = await connect(url);
    const a = await connect(url);
    await a.query("BEGIN");
    assert.equal((await a.query(ANSWER, [p, qi, RIGHT, 1, randomUUID()])).rows[0].r.outcome, "recorded");
    const hinting = h.query(HINT, [p, qi, 1, 1, randomUUID()]);
    await waitForLockWaiters(1);
    await a.query("COMMIT");
    assert.deepEqual((await hinting).rows[0].r, { outcome: "round_closed" });
    assert.deepEqual(await attempts(qi), [{ attempt_no: 1, mode: "quiz_v1", hints_used: 0 }]);
    assert.deepEqual(await logged(qi), { n: 0, rows: 0 });
    await done(h, a);
  });

  const contend = async (qi, calls) => {
    const blocker = await connect(url, false);
    await blocker.query("BEGIN");
    await blocker.query("SELECT 1 FROM public.question_instances WHERE id = $1 FOR UPDATE", [qi]);
    const sessions = await Promise.all(calls.map(() => connect(url)));
    const running = calls.map((call, i) => call(sessions[i]));
    await waitForLockWaiters(calls.length);
    await blocker.query("COMMIT");
    try { return await Promise.all(running); } finally { await done(blocker, ...sessions); }
  };

  await t.test("3. eight simultaneous hint requests with the same request id: one row, seven replays; counted once", async () => {
    const p = await pupil();
    const qi = await serve(p);
    const rid = randomUUID();
    const results = await contend(qi, Array.from({ length: 8 }, () => async (c) => (await c.query(HINT, [p, qi, 1, 1, rid])).rows[0].r));
    assert.deepEqual(results.map((r) => r.outcome).sort(), ["recorded", ...Array(7).fill("replay")]);
    assert.deepEqual(await logged(qi), { n: 1, rows: 1 });
    const a = await connect(url);
    assert.equal((await a.query(ANSWER, [p, qi, RIGHT, 1, randomUUID()])).rows[0].r.outcome, "recorded");
    assert.deepEqual(await attempts(qi), [{ attempt_no: 1, mode: "quiz_v1", hints_used: 1 }]);
    await done(a);
  });

  await t.test("4. hints and answers released at once: one attempt, and every logged level is counted", async () => {
    for (let round = 0; round < 3; round++) {
      const p = await pupil();
      const qi = await serve(p);
      const calls = [
        ...Array.from({ length: 4 }, () => async (c) => ({ kind: "hint", r: (await c.query(HINT, [p, qi, 1, 1, randomUUID()])).rows[0].r })),
        ...Array.from({ length: 4 }, () => async (c) => ({ kind: "answer", r: (await c.query(ANSWER, [p, qi, RIGHT, 1, randomUUID()])).rows[0].r })),
      ];
      const results = await contend(qi, calls);
      const answers = results.filter((x) => x.kind === "answer").map((x) => x.r.outcome).sort();
      assert.deepEqual(answers, ["recorded", "round_closed", "round_closed", "round_closed"]);
      for (const h of results.filter((x) => x.kind === "hint")) {
        assert.ok(["recorded", "already_recorded", "round_closed"].includes(h.r.outcome), JSON.stringify(h.r));
      }
      const a = await attempts(qi);
      assert.equal(a.length, 1);
      assert.equal(a[0].hints_used, (await logged(qi)).n, "logged levels = counted levels");
    }
  });
});
