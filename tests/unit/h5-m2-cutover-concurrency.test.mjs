// REAL PostgreSQL 17 proof for H5 M2's two transactions (runbook §9.3, §9.4 punkt 5) — what PGlite (one
// connection) cannot show:
//
//   1. IN FLIGHT: a legacy answer runs in an open transaction while transaction 1 commits. A new legacy call
//      after the commit is refused and writes nothing; transaction 2 WAITS for the open one and registers
//      only after it committed: answered_at < closed_before <= effective_at, and INT-B (block 2) = 0.
//   2. SEVERAL: three transactions open at the close (one commits, one rolls back, one is idle without a
//      legacy call); transaction 2 registers only after the last. A session in ANOTHER database is not
//      waited for (the drain is per database). The rolled-back round stays open and is answered via H5.
//   3. NONE: without open transactions transaction 2 registers at once.
//   4. TIMEOUT AND RESUMPTION: a session idle in transaction beyond the limit makes transaction 2 abort —
//      nothing registered, the table does not exist, legacy stays closed, H5 keeps working; the error
//      names pid, role, state and age but never query text. After the session ends, the SAME file runs
//      again and registers. Alternatively R1 (docs/operations/h5-m2-rollback.md) reopens for
//      service_role only.
//   5. NEGATIVE CONTROL: a copy of transaction 2 without pg_stat_clear_snapshot() (built in memory; the real
//      file is unchanged) never sees a commit that happens after its first observation and times out.
//
// SYNCHRONISATION, not timing: transaction 2 runs with its own application_name, and before the test ends an
// open transaction it waits (bounded, waitInDrainLoop) until that backend sleeps in the drain loop — which
// it only does after a read that counted the open transaction. A commit after that point can only be seen by
// a LATER, fresh read; scenario 1, 2 and 5 together prove the reads are fresh.
//
// Runs only when LEVEL_ENGINE_PG_URL points at a disposable PostgreSQL server; otherwise SKIPPED with the
// reason — unless LEVEL_ENGINE_PG_REQUIRED=1 (CI's PostgreSQL 17.6 service), where it FAILS. Same technique
// as l1-k1-attempt-context-concurrency.test.mjs. Synthetic pupils only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PROD_ORDER, TOP10_BEFORE, TOP10_ID, uid, baseSql, migrationSql } from "./helpers/h5-integration-chain.mjs";
import { isRevokedLegacyRpc } from "../../supabase/functions/process-event/answer-v2.ts";

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

const D327 = "20261103100000_question_attempts_history_no_action.sql";
const K1 = "20261103110000_l1_k1_attempt_context.sql";
const CLOSE = "20261105180000_h5_m2_close_legacy_answer_path.sql";
const REGISTER = "20261105180100_h5_m2_register_cutover.sql";
const RUNBOOK = readFileSync(join(ROOT, "docs", "operations", "h5-k1-activation-runbook.md"), "utf8").split("\r\n").join("\n");
const ROLLBACK_DOC = readFileSync(join(ROOT, "docs", "operations", "h5-m2-rollback.md"), "utf8").split("\r\n").join("\n");
function sqlBlock(text, marker) {
  const m = new RegExp("```sql\\n(-- " + marker + "[\\s\\S]*?)```").exec(text);
  assert.ok(m, `block ${marker}`);
  return m[1];
}
const INTEGRITY_2 = () => sqlBlock(RUNBOOK, "H5-K1 INTEGRITY AFTER M2");
const R1_SQL = () => sqlBlock(ROLLBACK_DOC, "ROLLBACK H5 M2 R1");

const created = [];
const opened = [];
async function connect(url, role = null) {
  const c = new pg.Client({ connectionString: url });
  opened.push(c);
  await c.connect();
  c.on("error", () => {});
  // A wait on a lock is a test bug here, never an expectation: fail loudly instead of hanging the shard.
  await c.query("SET lock_timeout = '10s'");
  if (role) await c.query(`SET ROLE ${role}`);
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
async function newDatabase() {
  const admin = new pg.Client({ connectionString: URL });
  await admin.connect();
  const name = `h5_m2_${Date.now()}_${created.length}`;
  await admin.query(`CREATE DATABASE ${name} ENCODING 'UTF8' TEMPLATE template0`);
  await admin.end();
  created.push(name);
  const u = new globalThis.URL(URL);
  u.pathname = `/${name}`;
  return u.toString();
}

// A K1 database in use: K1 applied in production's order, one H5 attempt written, PostgREST's login role.
async function k1InUse() {
  const url = await newDatabase();
  const su = await connect(url);
  for (const sql of baseSql({ realServer: true })) await su.query(sql);
  for (const f of [...PROD_ORDER, D327]) await su.query(migrationSql(f));
  await su.query(`BEGIN;\n${migrationSql(K1)}\nCOMMIT;`);
  await su.query(`DO $a$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN CREATE ROLE authenticator NOINHERIT LOGIN; END IF;
    END $a$; GRANT anon, authenticated, service_role TO authenticator;`);
  const db = { url, su, pupilOf: new Map(), next: 7000 };
  const qi = await serve(db, 0);
  assert.equal((await h5(db, su, qi, 0)).outcome, "recorded");
  return db;
}
// Each round gets its OWN synthetic pupil: idx_one_open_question allows one open round per pupil, so a second
// round for a pupil whose answer is still in an open transaction would wait for that transaction.
async function serve(db, q) {
  const p = uid(db.next++);
  await db.su.query(`INSERT INTO auth.users VALUES ('${p}');
    INSERT INTO public.profiles (id, role, selected_grade) VALUES ('${p}', 'student', 5);
    INSERT INTO public.student_progress (student_id, xp, coins, correct_answers, total_correct_answers,
      current_streak, longest_streak, last_activity_date) VALUES ('${p}', 0, 0, 0, 0, 0, 0, current_date - 1);`);
  const qi = (await db.su.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, repeat_count, answered, next_review_at)
    VALUES ($1, $2, $3, 0, false, now()) RETURNING id`, [p, TOP10_ID[q], TOP10_BEFORE[q].content.correct])).rows[0].id;
  db.pupilOf.set(qi, p);
  return qi;
}
async function h5(db, client, qi, q) {
  await client.query("SET ROLE service_role");
  try {
    return (await client.query("SELECT public.process_question_attempt_v2($1,$2,$3,1,$4,NULL,NULL,'quiz_v1',0) AS r",
      [db.pupilOf.get(qi), qi, TOP10_BEFORE[q].content.correct, randomUUID()])).rows[0].r;
  } finally { await client.query("RESET ROLE"); }
}
const LEGACY = "SELECT public.process_question_attempt($1,$2,$3,0) AS r";
const legacyArgs = (db, qi, q) => [db.pupilOf.get(qi), qi, TOP10_BEFORE[q].content.correct];
const instance = async (db, qi) => (await db.su.query("SELECT answered, answered_at, user_answer FROM public.question_instances WHERE id = $1", [qi])).rows[0];
const cutover = async (db) => (await db.su.query("SELECT to_regclass('public.answer_path_cutovers') IS NOT NULL AS t")).rows[0].t
  ? (await db.su.query("SELECT * FROM public.answer_path_cutovers")).rows : null;
const integrity2 = async (db) => Object.fromEntries((await db.su.query(INTEGRITY_2())).rows.map((r) => [r.check_id, r]));
const settled = (p) => Promise.race([p.then(() => true, () => true), new Promise((r) => setTimeout(() => r(false), 0))]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Transaction 2 runs on its own connection, named by application_name so the test can follow its REAL state
// in pg_stat_activity. `sql` replaces the file only for the negative control below.
async function register(db, timeoutS = null, { app = null, sql = null } = {}) {
  const c = await connect(db.url);
  if (app) await c.query(`SET application_name = '${app}'`);
  if (timeoutS !== null) await c.query(`SET app.h5_m2_drain_timeout_s = '${timeoutS}'`);
  const started = Date.now();
  try { await c.query(sql ?? migrationSql(REGISTER)); return { ok: true, ms: Date.now() - started }; }
  catch (e) { return { ok: false, ms: Date.now() - started, error: e }; }
  finally { await done(c); }
}
const drainApp = () => `h5_m2_drain_${randomUUID().slice(0, 8)}`;
// Bounded wait until transaction 2 sits in its drain loop: the backend named `app` is active and waits on
// PgSleep. The loop sleeps only AFTER a read that counted at least one open transaction from before the
// close (`EXIT WHEN v_waiting = 0` comes first, migration line "PERFORM pg_sleep(0.1)") — so from here on, every
// transaction the test still holds open has been OBSERVED open at least once. Each poll is its own statement
// on the superuser connection (autocommit), so it reads a fresh view. Fails with what it last saw, never hangs.
async function waitInDrainLoop(db, app, limitMs = 15_000) {
  const deadline = Date.now() + limitMs;
  let last = "no backend yet";
  while (Date.now() < deadline) {
    const { rows } = await db.su.query(
      "SELECT pid, state, wait_event_type, wait_event FROM pg_catalog.pg_stat_activity WHERE application_name = $1", [app]);
    if (rows.length === 1 && rows[0].state === "active" && rows[0].wait_event === "PgSleep") return rows[0].pid;
    if (rows.length) last = JSON.stringify(rows);
    await sleep(20);
  }
  throw new Error(`transaction 2 (${app}) did not reach its drain loop within ${limitMs} ms; last seen: ${last}`);
}
// The session `client` is (still) open in a transaction, read fresh: the drain has something to wait for.
async function openInTransaction(db, client) {
  const pid = (await client.query("SELECT pg_backend_pid() AS p")).rows[0].p;
  const s = (await db.su.query("SELECT state, xact_start IS NOT NULL AS x FROM pg_catalog.pg_stat_activity WHERE pid = $1", [pid])).rows[0];
  assert.ok(s && s.x && s.state === "idle in transaction", `pid ${pid} open in a transaction: ${JSON.stringify(s)}`);
  return pid;
}
async function assertLegacyRefused(db, q) {
  const qi = await serve(db, q);
  const b = await connect(db.url, "authenticator");
  await b.query("SET ROLE service_role");
  const e = await b.query(LEGACY, legacyArgs(db, qi, q)).then(() => null, (x) => x);
  await done(b);
  assert.equal(e?.code, "42501", "a legacy call after the close is refused");
  assert.ok(isRevokedLegacyRpc({ code: e.code, message: e.message }, "process_question_attempt"), e.message);
  assert.equal((await instance(db, qi)).answered, false, "and writes nothing");
  return qi;
}

test("1. an answer in flight at the close: transaction 2 waits for it, registers after it; a new legacy call is refused", { skip: SKIP, timeout: 120_000 }, async (t) => {
  t.after(teardown);
  const db = await k1InUse();
  const qiA = await serve(db, 1);
  const a = await connect(db.url, "authenticator");
  await a.query("SET ROLE service_role");
  await a.query("BEGIN");
  await a.query(LEGACY, legacyArgs(db, qiA, 1));             // passed the permission check, not committed

  await db.su.query(migrationSql(CLOSE));                     // transaction 1 commits without waiting for A
  const refusedQi = await assertLegacyRefused(db, 2);

  await openInTransaction(db, a);
  const app = drainApp();
  const reg = register(db, null, { app });
  await waitInDrainLoop(db, app);                            // it has OBSERVED A open and is in the loop
  await openInTransaction(db, a);                            // A is still open after that observation
  await sleep(1500);
  assert.equal(await settled(reg), false, "transaction 2 waits while A is open");
  assert.equal(await cutover(db), null, "nothing registered yet");
  await a.query("COMMIT");                                   // A ends AFTER the first observation
  const r = await reg;
  assert.ok(r.ok, r.error?.message);                         // a LATER observation saw the commit: fresh reads
  assert.ok(r.ms >= 1400, `waited ${r.ms} ms`);

  const [row] = await cutover(db);
  const ans = await instance(db, qiA);
  assert.equal(ans.answered, true, "A's answer is kept");
  assert.ok(ans.answered_at < row.closed_before, "answered_at < closed_before");
  assert.ok(row.closed_before <= row.effective_at, "closed_before <= effective_at");
  const i2 = await integrity2(db);
  assert.equal(i2["CUT-T"].ok, true);
  assert.equal(i2["INT-B"].ok, true, `INT-B = ${i2["INT-B"].actual}`);
  assert.equal((await h5(db, db.su, refusedQi, 2)).outcome, "recorded", "the refused round is answered via H5");
  assert.equal((await integrity2(db))["INT-B"].ok, true);
  await done(a);
});

test("2. several open transactions: registered only after the last; another database is not waited for", { skip: SKIP, timeout: 120_000 }, async (t) => {
  t.after(teardown);
  const db = await k1InUse();
  const other = await k1InUse();
  const elsewhere = await connect(other.url);
  await elsewhere.query("BEGIN; SELECT 1");                   // idle in transaction in ANOTHER database, all along

  const qi1 = await serve(db, 1);
  const qi2 = await serve(db, 2);
  const a1 = await connect(db.url, "service_role");
  const a2 = await connect(db.url, "service_role");
  const a3 = await connect(db.url, "authenticated");
  await a1.query("BEGIN"); await a1.query(LEGACY, legacyArgs(db, qi1, 1));
  await a2.query("BEGIN"); await a2.query(LEGACY, legacyArgs(db, qi2, 2));
  await a3.query("BEGIN; SELECT 1");                          // open, no legacy call

  await db.su.query(migrationSql(CLOSE));
  const app = drainApp();
  const reg = register(db, null, { app });
  await waitInDrainLoop(db, app);                            // observed all three open, in the loop
  for (const c of [a1, a2, a3]) await openInTransaction(db, c);
  await sleep(500);  await a1.query("COMMIT");
  await sleep(500);  await a2.query("ROLLBACK");
  await sleep(500);
  assert.equal(await settled(reg), false, "still waiting for a3");
  await a3.query("COMMIT");
  const r = await reg;
  assert.ok(r.ok, r.error?.message);
  assert.ok(r.ms >= 1400, `waited ${r.ms} ms`);

  const [row] = await cutover(db);
  const i1 = await instance(db, qi1);
  assert.equal(i1.answered, true);
  assert.ok(i1.answered_at < row.closed_before);
  assert.equal((await instance(db, qi2)).answered, false, "the rolled-back answer left the round open");
  assert.equal((await h5(db, db.su, qi2, 2)).outcome, "recorded", "and it is answered via H5");
  assert.equal((await integrity2(db))["INT-B"].ok, true);
  await done(a1, a2, a3, elsewhere);
});

test("3. no open transaction: transaction 2 registers at once", { skip: SKIP, timeout: 120_000 }, async (t) => {
  t.after(teardown);
  const db = await k1InUse();
  await db.su.query(migrationSql(CLOSE));
  const r = await register(db);
  assert.ok(r.ok, r.error?.message);
  assert.ok(r.ms < 3000, `${r.ms} ms`);
  assert.equal((await cutover(db)).length, 1);
});

test("4. timeout: nothing registered, legacy stays closed, H5 works; the same file then resumes — or R1 reopens for service_role only", { skip: SKIP, timeout: 120_000 }, async (t) => {
  t.after(teardown);
  const db = await k1InUse();
  const stuck = await connect(db.url, "service_role");
  await stuck.query("BEGIN; SELECT 'secret-query-text-must-not-leak'");
  const stuckPid = (await stuck.query("SELECT pg_backend_pid() AS p")).rows[0].p;

  await db.su.query(migrationSql(CLOSE));
  const r = await register(db, 2);
  assert.equal(r.ok, false, "aborted");
  assert.ok(r.ms >= 1900 && r.ms < 10000, `${r.ms} ms`);
  assert.match(r.error.message, /tidsgrænsen på 2 s er overskredet/);
  assert.match(r.error.message, new RegExp(`pid ${stuckPid} \\(postgres, idle in transaction, \\d+ s\\)`));
  assert.doesNotMatch(r.error.message, /secret-query-text/, "never query text");
  assert.equal(await cutover(db), null, "nothing registered; the table does not exist");
  await assertLegacyRefused(db, 3);                          // still closed: the safe direction
  assert.equal((await h5(db, db.su, await serve(db, 4), 4)).outcome, "recorded", "H5 keeps working");

  // Resume: once the session has ended, the same file registers.
  await stuck.query("COMMIT");
  const again = await register(db, 2);
  assert.ok(again.ok, again.error?.message);
  assert.equal((await cutover(db)).length, 1);
  assert.equal((await integrity2(db))["INT-B"].ok, true);
  await done(stuck);

  // Alternative after a timeout: R1 (on a second database in the same state).
  const db2 = await k1InUse();
  const stuck2 = await connect(db2.url);
  await stuck2.query("BEGIN; SELECT 1");
  await db2.su.query(migrationSql(CLOSE));
  assert.equal((await register(db2, 1)).ok, false);
  await db2.su.query(R1_SQL());
  for (const [role, expected] of [["service_role", true], ["anon", false], ["authenticated", false]]) {
    const x = (await db2.su.query("SELECT has_function_privilege($1, 'public.process_question_attempt(uuid,uuid,text,bigint)', 'EXECUTE') AS x", [role])).rows[0].x;
    assert.equal(x, expected, role);
  }
  await done(stuck2);
});

// NEGATIVE CONTROL. A copy of transaction 2 WITHOUT pg_stat_clear_snapshot(), built in memory from the real
// file (which is not changed), run with the SAME synchronisation as scenario 1. PostgreSQL keeps the
// activity snapshot it took at the first read for the rest of the transaction, so the copy keeps counting A
// after A has committed and runs into its limit. This proves that the synchronised scenarios above would
// catch the regression: they pass only because the real file reads a fresh view in every iteration.
test("5. negative control: a copy without pg_stat_clear_snapshot never sees A's commit and times out — the real file then registers", { skip: SKIP, timeout: 120_000 }, async (t) => {
  t.after(teardown);
  const real = migrationSql(REGISTER);
  const CLEAR = "PERFORM pg_stat_clear_snapshot();";
  assert.equal(real.split(CLEAR).length, 2, "the real file clears the snapshot exactly once, inside the drain loop");
  const stale = real.replace(CLEAR, "NULL; -- negative control: snapshot NOT cleared");
  assert.ok(!stale.includes("pg_stat_clear_snapshot"), "the copy has no clear left");

  const db = await k1InUse();
  const qiA = await serve(db, 1);
  const a = await connect(db.url, "authenticator");
  await a.query("SET ROLE service_role");
  await a.query("BEGIN");
  await a.query(LEGACY, legacyArgs(db, qiA, 1));
  const aPid = await openInTransaction(db, a);
  await db.su.query(migrationSql(CLOSE));

  const app = drainApp();
  const reg = register(db, 3, { app, sql: stale });
  await waitInDrainLoop(db, app);                            // first observation done: A seen open
  await openInTransaction(db, a);
  await a.query("COMMIT");                                   // A ends after the first observation
  const fresh = (await db.su.query("SELECT xact_start FROM pg_catalog.pg_stat_activity WHERE pid = $1", [aPid])).rows[0];
  assert.equal(fresh?.xact_start ?? null, null, "a fresh view shows A without a transaction");

  const r = await reg;
  assert.equal(r.ok, false, "the copy without the clear never registers");
  assert.match(r.error.message, /tidsgrænsen på 3 s er overskredet/);
  assert.match(r.error.message, new RegExp(`pid ${aPid} \\(authenticator, idle in transaction, \\d+ s\\)`),
    "it still reports A as open: its view is the stale first snapshot");
  assert.equal(await cutover(db), null, "nothing registered");

  // The real file, same database, same moment: A is gone, so it registers at once.
  const ok = await register(db, 3, { app: drainApp() });
  assert.ok(ok.ok, ok.error?.message);
  assert.equal((await cutover(db)).length, 1);
  assert.equal((await integrity2(db))["INT-B"].ok, true);
  await done(a);
});
