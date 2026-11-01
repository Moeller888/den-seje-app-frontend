// REAL PostgreSQL 17 proof for migration 20261101220000_l1_k1_attempt_context (L1 K1) — what PGlite (one
// connection) cannot show: K1 keeps H5's exactly-once guarantees under contention.
//
//   0. On PostgreSQL 17, K1 applies on production's H5 order and the documented rollback restores the
//      exact H5 schema (fingerprint with the server's own deparser).
//   1. Eight simultaneous calls with the SAME submission: one attempt (with the server's mode, hints,
//      first-round interval and content fingerprint), one payout, seven identical replays.
//   2. Eight simultaneous calls with DIFFERENT submissions for one round: one attempt, one payout, seven
//      round_closed — whatever mode the calls carry, only the recorded one is stored.
//   3. A stale round-1 answer racing with a reopen: never registered.
//
// Runs only when LEVEL_ENGINE_PG_URL points at a disposable PostgreSQL server; otherwise SKIPPED with
// the reason — unless LEVEL_ENGINE_PG_REQUIRED=1 (CI's PostgreSQL 17.6 service), where it FAILS. Same
// technique as question-attempts-v2-bootstrap-concurrency.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PROD_ORDER, TOP10_BEFORE, TOP10_ID, uid, baseSql, migrationSql, FINGERPRINT_SQL } from "./helpers/h5-integration-chain.mjs";

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

const K1 = "20261101220000_l1_k1_attempt_context.sql";
function rollbackSql() {
  const m = /```sql\n([\s\S]*?)```/.exec(readFileSync(join(ROOT, "docs/operations/l1-k1-attempt-context-rollback.md"), "utf8").split("\r\n").join("\n"));
  assert.ok(m && /ROLLBACK L1 K1/.test(m[1]));
  return m[1];
}
const created = [];
const opened = [];
async function createDb({ k1 = true } = {}) {
  const admin = new pg.Client({ connectionString: URL });
  await admin.connect();
  const name = `l1_k1_${Date.now()}_${created.length}`;
  await admin.query(`CREATE DATABASE ${name} ENCODING 'UTF8' TEMPLATE template0`);
  await admin.end();
  created.push(name);
  const u = new globalThis.URL(URL);
  u.pathname = `/${name}`;
  const url = u.toString();
  const c = await connect(url, false);
  for (const sql of baseSql({ realServer: true })) await c.query(sql);
  for (const f of PROD_ORDER) await c.query(migrationSql(f));
  if (k1) await c.query(`BEGIN;\n${migrationSql(K1)}\nCOMMIT;`);
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

const MC = "SELECT public.process_question_attempt_v2($1, $2, $3, $4, $5, null, null, $6, $7) AS r";
const Q = 0;
const RIGHT = TOP10_BEFORE[Q].content.correct;

test("real PostgreSQL 17: K1 keeps H5's exactly-once guarantees; rollback restores H5", { skip: SKIP, timeout: 300000 }, async (t) => {
  t.after(teardown);

  await t.test("0. K1 applies on production's H5 order; the rollback restores the exact H5 schema", async () => {
    const h5 = await createDb({ k1: false });
    const k1 = await createDb();
    await k1.su.query(`BEGIN;\n${rollbackSql()}\nCOMMIT;`);
    assert.deepEqual((await k1.su.query(FINGERPRINT_SQL)).rows[0].f, (await h5.su.query(FINGERPRINT_SQL)).rows[0].f);
    await done(h5.su, k1.su);
  });

  const { url, su } = await createDb();
  let n = 900;
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
  const state = async (p) => ({
    progress: (await su.query(`SELECT xp, coins, correct_answers AS c, total_correct_answers AS t FROM public.student_progress
      WHERE student_id = $1`, [p])).rows[0],
    attempts: (await su.query(`SELECT attempt_no, mode, hints_used, server_interval_ms IS NOT NULL AS interval,
      length(question_content_sha256) AS sha FROM public.question_attempts WHERE student_id = $1`, [p])).rows,
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

  await t.test("1. eight simultaneous calls, same submission: one attempt with K1's fields, seven replays", async () => {
    const p = await pupil();
    const qi = await serve(p);
    const sub = randomUUID();
    const results = await contend(qi, Array.from({ length: 8 }, () => async (c) => (await c.query(MC, [p, qi, RIGHT, 1, sub, "quiz_v1", 0])).rows[0].r));
    assert.deepEqual(results.map((r) => r.outcome).sort(), ["recorded", ...Array(7).fill("replay")]);
    for (const r of results) assert.deepEqual({ ...r, outcome: undefined }, { ...results[0], outcome: undefined });
    assert.deepEqual(await state(p), { progress: { xp: 110, coins: 55, c: 8, t: 8 },
      attempts: [{ attempt_no: 1, mode: "quiz_v1", hints_used: 0, interval: true, sha: 64 }] });
  });

  await t.test("2. eight simultaneous calls, different submissions: one attempt, seven round_closed", async () => {
    const p = await pupil();
    const qi = await serve(p);
    const modes = ["quiz_v1", "diagnostic", "practice", "check"];
    const results = await contend(qi, Array.from({ length: 8 }, (_, i) => async (c) =>
      (await c.query(MC, [p, qi, RIGHT, 1, randomUUID(), modes[i % 4], i % 4])).rows[0].r));
    assert.deepEqual(results.map((r) => r.outcome).sort(), ["recorded", ...Array(7).fill("round_closed")]);
    const s = await state(p);
    assert.deepEqual(s.progress, { xp: 110, coins: 55, c: 8, t: 8 });
    assert.equal(s.attempts.length, 1);
  });

  await t.test("3. a stale round-1 answer racing with a reopen is never registered", async () => {
    const p = await pupil();
    const qi = await serve(p);
    await su.query("SET ROLE service_role");
    await su.query(MC, [p, qi, RIGHT, 1, randomUUID(), "quiz_v1", 0]);
    await su.query("RESET ROLE");
    const results = await contend(qi, [
      async (c) => { await c.query("RESET ROLE"); await c.query("UPDATE public.question_instances SET answered = false, repeat_count = 1 WHERE id = $1", [qi]); return { outcome: "reopened" }; },
      async (c) => (await c.query(MC, [p, qi, RIGHT, 1, randomUUID(), "quiz_v1", 0])).rows[0].r,
    ]);
    assert.ok(["round_closed", "stale_round"].includes(results[1].outcome), results[1].outcome);
    assert.equal((await state(p)).attempts.length, 1);
  });
});
