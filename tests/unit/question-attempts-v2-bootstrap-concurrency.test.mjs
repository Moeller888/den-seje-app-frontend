// REAL PostgreSQL 17 proof for the H5 integration (20261101190000 bootstrap + 20261101190100 align)
// — what PGlite (PostgreSQL 18, one connection) cannot show:
//
//   0. On PostgreSQL 17, the repository history and production's history end in the SAME public schema
//      (the fingerprint uses the server's own deparser, so this also covers formatting differences).
//   1. On the final schema with D-280 part 2 applied, eight simultaneous calls with the SAME submission
//      on a three-alias question (the earlier correct text on an instance re-keyed to the new one):
//      one attempt, one payout, seven replays of the identical, correct result.
//   2. Eight simultaneous calls with DIFFERENT submissions for one round: one attempt, one payout,
//      seven round_closed.
//   3. A late round-1 answer racing with D-280's re-keying reopen: never registered (round_closed or
//      stale_round, whichever ran first); the reopen opens round 2 with the current key.
//
// Runs only when LEVEL_ENGINE_PG_URL points at a disposable PostgreSQL server where the user may create
// databases and roles, and the `pg` client can be resolved; otherwise SKIPPED with that reason — unless
// LEVEL_ENGINE_PG_REQUIRED=1 (CI), where a missing server or client FAILS. It creates its own databases
// and drops them afterwards. Same technique as question-attempts-v2-concurrency.test.mjs: a blocker
// session holds the row, every call is started, and the blocker is released only when
// pg_stat_activity shows all of them waiting on a lock.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  withTop10, REPO_ORDER, PROD_ORDER, MC_V2, PQA, MD5, TOP10_BEFORE, TOP10_ID, uid, baseSql, migrationSql, FINGERPRINT_SQL,
} from "./helpers/h5-integration-chain.mjs";

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

const created = [];
const opened = [];
async function createDb(order, { top10 = false } = {}) {
  const admin = new pg.Client({ connectionString: URL });
  await admin.connect();
  const name = `h5_bootstrap_${Date.now()}_${created.length}`;
  await admin.query(`CREATE DATABASE ${name} ENCODING 'UTF8' TEMPLATE template0`);
  await admin.end();
  created.push(name);
  const u = new globalThis.URL(URL);
  u.pathname = `/${name}`;
  const url = u.toString();
  const c = await connect(url, false);
  for (const sql of baseSql({ realServer: true })) await c.query(sql);
  for (const f of top10 ? withTop10(order) : order) await c.query(migrationSql(f));
  return { url, su: c };
}
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

const MC = "SELECT public.process_question_attempt_v2($1, $2, $3, $4, $5, null, null) AS r";
const FLINT = TOP10_BEFORE.findIndex((r) => r.content.correct.startsWith("Flint en hard sten"));
const EARLIER = TOP10_BEFORE[FLINT].content.correct;

test("real PostgreSQL 17: H5 bootstrap + alignment — same schema on both histories, exactly-once under contention", { skip: SKIP, timeout: 300000 }, async (t) => {
  t.after(teardown);

  await t.test("0. repository and production histories end in the same public schema on PostgreSQL 17", async () => {
    const repo = await createDb(REPO_ORDER);
    const prod = await createDb(PROD_ORDER);
    const fr = (await repo.su.query(FINGERPRINT_SQL)).rows[0].f;
    const fp = (await prod.su.query(FINGERPRINT_SQL)).rows[0].f;
    assert.deepEqual(fp, fr);
    assert.equal(fp.functions[MC_V2.replace("public.", "")][0], MD5.mcV2Aligned);
    assert.equal(fp.functions[PQA.replace("public.", "")][0], MD5.pqaG1);
    await done(repo.su, prod.su);
  });

  const { url, su } = await createDb(PROD_ORDER, { top10: true });
  let n = 800;
  const pupil = async () => {
    const id = uid(n++);
    await su.query("INSERT INTO auth.users VALUES ($1)", [id]);
    await su.query("INSERT INTO public.profiles (id, role, selected_grade) VALUES ($1, 'student', 5)", [id]);
    await su.query(`INSERT INTO public.student_progress (student_id, xp, coins, correct_answers, total_correct_answers,
      current_streak, longest_streak, last_activity_date) VALUES ($1, 100, 50, 7, 7, 1, 1, current_date - 1)`, [id]);
    return id;
  };
  const serve = async (p, key) => (await su.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer,
    next_review_at) VALUES ($1, $2, $3, now()) RETURNING id`, [p, TOP10_ID[FLINT], key])).rows[0].id;
  const state = async (p) => ({
    progress: (await su.query(`SELECT xp, coins, correct_answers AS c, total_correct_answers AS t FROM public.student_progress
      WHERE student_id = $1`, [p])).rows[0],
    attempts: (await su.query("SELECT count(*)::int AS n FROM public.question_attempts WHERE student_id = $1", [p])).rows[0].n,
  });
  const waitForLockWaiters = async (count) => {
    for (let i = 0; i < 400; i++) {
      const w = (await su.query(`SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'`)).rows[0].n;
      if (w >= count) return;
      await new Promise((r) => setTimeout(r, 25));
    }
    assert.fail(`expected ${count} sessions waiting on a lock`);
  };
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

  await t.test("1. eight simultaneous calls, same submission, earlier text on a re-keyed instance: one correct attempt, seven replays", async () => {
    assert.equal((await su.query("SELECT content->>'correct' AS c FROM public.questions WHERE id = $1", [TOP10_ID[FLINT]])).rows[0].c, "Flint");
    const p = await pupil();
    const qi = await serve(p, "Flint");
    const sub = randomUUID();
    const results = await contend(qi, Array.from({ length: 8 }, () => async (c) => (await c.query(MC, [p, qi, EARLIER, 1, sub])).rows[0].r));
    assert.deepEqual(results.map((r) => r.outcome).sort(), ["recorded", ...Array(7).fill("replay")]);
    for (const r of results) {
      assert.equal(r.status, "correct", "the earlier correct text is an alias (three entries, D-280's rule)");
      assert.deepEqual({ ...r, outcome: undefined }, { ...results[0], outcome: undefined });
    }
    assert.deepEqual(await state(p), { progress: { xp: 110, coins: 55, c: 8, t: 8 }, attempts: 1 });
  });

  await t.test("2. eight simultaneous calls, different submissions for one round: one attempt, seven round_closed", async () => {
    const p = await pupil();
    const qi = await serve(p, EARLIER);                                  // an instance keyed before D-280 part 2
    const results = await contend(qi, Array.from({ length: 8 }, (_, i) => async (c) =>
      (await c.query(MC, [p, qi, i % 2 ? EARLIER : "Flint", 1, randomUUID()])).rows[0].r));
    assert.deepEqual(results.map((r) => r.outcome).sort(), ["recorded", ...Array(7).fill("round_closed")]);
    assert.equal(results.find((r) => r.outcome === "recorded").status, "correct", "either text is correct");
    assert.deepEqual(await state(p), { progress: { xp: 110, coins: 55, c: 8, t: 8 }, attempts: 1 });
  });

  await t.test("3. a late round-1 answer racing with D-280's re-keying reopen is never registered", async () => {
    // Only the flint question is active in its subject, so the reopen (a last resort) may choose it.
    await su.query(`UPDATE public.questions SET is_active = false WHERE learning_objective = $1 AND id <> $2`,
      [TOP10_BEFORE[FLINT].learning_objective, TOP10_ID[FLINT]]);
    const p = await pupil();
    const qi = await serve(p, EARLIER);
    const first = await connect(url);
    assert.equal((await first.query(MC, [p, qi, "Flint", 1, randomUUID()])).rows[0].r.outcome, "recorded");
    await done(first);
    const [reopen, late] = await contend(qi, [
      async (c) => (await c.query(`SELECT public.request_repeat_question_servable_for_student($1, 9::smallint, ARRAY[$2]) AS id`,
        [p, TOP10_BEFORE[FLINT].learning_objective])).rows[0].id,
      async (c) => (await c.query(MC, [p, qi, "Flint", 1, randomUUID()])).rows[0].r,
    ]);
    assert.equal(reopen, qi);
    assert.ok(["round_closed", "stale_round"].includes(late.outcome), late.outcome);
    const row = (await su.query("SELECT repeat_count, answered, correct_answer FROM public.question_instances WHERE id = $1", [qi])).rows[0];
    assert.deepEqual(row, { repeat_count: 1, answered: false, correct_answer: "Flint" }, "round 2 open, keyed with the current text");
    assert.equal((await state(p)).attempts, 1);
  });
});
