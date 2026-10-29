// REAL concurrency proof for migration 20261029150000 (D-254) on a real PostgreSQL server with several
// simultaneous connections — what PGlite (one connection) cannot show.
//
// Same switch as the level engine's test: runs only when LEVEL_ENGINE_PG_URL points at a disposable
// PostgreSQL server where the user may create databases and roles; otherwise SKIPPED with the reason,
// unless LEVEL_ENGINE_PG_REQUIRED=1 (CI's PostgreSQL 17 service), where a missing server FAILS. It
// creates and drops its own database. All ids are synthetic (see the fixture).
//
// What this proves:
//   1. A pupil's answer that is mid-transaction on the same student_progress row makes the migration
//      WAIT (seen from a third connection), and both increments survive: no lost update.
//   2. The other order: the migration holds the row, a concurrent answer waits, both survive.
//   3. Two runs of the migration at the same moment compensate exactly once; the loser rolls back
//      completely.
//   4. On a real server, with real roles: anon, authenticated and service_role hold no privilege on
//      the new table, and a pupil connection is refused.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PROD_BASE_SQL } from "./helpers/prod-base-schema.mjs";
import { withTargets, EXTRA_SQL, SEED_SQL, PUPIL_A, PUPIL_B, PUPIL_C } from "./helpers/mc-grading-compensation-fixture.mjs";

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

// Roles are cluster-wide on a real server: create them only if missing.
const BASE = PROD_BASE_SQL.replace(
  "CREATE ROLE anon NOBYPASSRLS; CREATE ROLE authenticated NOBYPASSRLS; CREATE ROLE service_role BYPASSRLS;",
  `DO $r$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOBYPASSRLS; END IF;
     IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOBYPASSRLS; END IF;
     IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
   END $r$;`);

const opened = [];
const databases = [];
async function freshDatabase() {
  const admin = new pg.Client({ connectionString: URL });
  await admin.connect();
  const name = `mc_comp_${Date.now()}_${databases.length}`;
  await admin.query(`CREATE DATABASE ${name} ENCODING 'UTF8' TEMPLATE template0`);
  await admin.end();
  databases.push(name);
  const u = new globalThis.URL(URL);
  u.pathname = `/${name}`;
  const dbUrl = u.toString();
  // Every session gets a statement_timeout, so a wrong expectation fails the test instead of hanging the
  // job. Its backend pid is read at connect time: the pg client queues queries per connection, so a pid
  // asked for while that connection is blocked would only arrive after the block.
  const connect = async () => {
    const c = new pg.Client({ connectionString: dbUrl });
    opened.push(c);
    await c.connect();
    await c.query("SET statement_timeout = '30s'");
    c.pid = (await c.query("SELECT pg_backend_pid() AS p")).rows[0].p;
    return c;
  };
  const setup = await connect();
  await setup.query(BASE);
  await setup.query(EXTRA_SQL);
  await setup.query(SEED_SQL);
  return { connect, setup };
}
async function teardown() {
  await Promise.all(opened.splice(0).map((c) => c.end().catch(() => {})));
  const admin = new pg.Client({ connectionString: URL });
  await admin.connect();
  for (const name of databases.splice(0)) await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.end();
}

// What process_question_attempt does to student_progress for a right first answer.
const ANSWER = `UPDATE public.student_progress SET xp = xp + 10, coins = coins + 5,
  correct_answers = correct_answers + 1, total_correct_answers = total_correct_answers + 1 WHERE student_id = $1`;
const row = async (c, id) => (await c.query(
  "SELECT xp, coins, correct_answers, total_correct_answers FROM public.student_progress WHERE student_id = $1", [id])).rows[0];
const corrections = async (c) => (await c.query("SELECT count(*)::int AS n FROM public.progress_corrections")).rows[0].n;
async function waitsOnLock(observer, pid) {
  for (let i = 0; i < 100; i++) {
    const r = (await observer.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1", [pid])).rows[0];
    if (r?.wait_event_type === "Lock") return true;
    await new Promise((res) => setTimeout(res, 50));
  }
  return false;
}

test("real PostgreSQL: compensation under simultaneous sessions", { skip: SKIP, timeout: 120000 }, async (t) => {
  t.after(teardown);

  await t.test("1. a pupil answer holding the row: the migration waits, and both increments survive", async () => {
    const { connect, setup } = await freshDatabase();
    const base = await row(setup, PUPIL_A);
    const pupil = await connect(), migr = await connect();
    await pupil.query("BEGIN");
    await pupil.query(ANSWER, [PUPIL_A]);
    const running = migr.query(withTargets()).then(() => "ok", (e) => e);
    const waited = await waitsOnLock(setup, migr.pid);
    await pupil.query("COMMIT");
    assert.equal(await running, "ok");
    assert.equal(waited, true, "the migration must wait for the pupil's row");
    assert.deepEqual(await row(setup, PUPIL_A), {
      xp: base.xp + 20, coins: base.coins + 10,
      correct_answers: base.correct_answers + 2, total_correct_answers: base.total_correct_answers + 2,
    });
    assert.equal(await corrections(setup), 2);
  });

  await t.test("2. the migration holding the row: a pupil answer waits, and both increments survive", async () => {
    const { connect, setup } = await freshDatabase();
    const base = await row(setup, PUPIL_B);
    const pupil = await connect(), migr = await connect();
    await migr.query("BEGIN");
    await migr.query(withTargets());
    const answering = pupil.query(ANSWER, [PUPIL_B]).then(() => "ok", (e) => e);
    const waited = await waitsOnLock(setup, pupil.pid);
    await migr.query("COMMIT");
    assert.equal(await answering, "ok");
    assert.equal(waited, true, "the answer must wait for the migration");
    assert.deepEqual(await row(setup, PUPIL_B), {
      xp: base.xp + 20, coins: base.coins + 10,
      correct_answers: base.correct_answers + 2, total_correct_answers: base.total_correct_answers + 2,
    });
  });

  await t.test("3. two runs at the same moment compensate exactly once; the loser rolls back completely", async () => {
    const { connect, setup } = await freshDatabase();
    const before = { a: await row(setup, PUPIL_A), b: await row(setup, PUPIL_B), c: await row(setup, PUPIL_C) };
    const first = await connect(), second = await connect();
    await first.query("BEGIN");
    await first.query(withTargets());
    const racing = second.query(withTargets()).then(() => "ok", (e) => e);
    await new Promise((res) => setTimeout(res, 300));
    await first.query("COMMIT");
    const outcome = await racing;
    // The second run either failed (and rolled back) or found the work done and skipped it.
    if (outcome !== "ok") assert.ok(outcome instanceof Error, String(outcome));
    const plus = (r) => ({ xp: r.xp + 10, coins: r.coins + 5, correct_answers: r.correct_answers + 1, total_correct_answers: r.total_correct_answers + 1 });
    assert.deepEqual(await row(setup, PUPIL_A), plus(before.a));
    assert.deepEqual(await row(setup, PUPIL_B), plus(before.b));
    assert.deepEqual(await row(setup, PUPIL_C), before.c);
    assert.equal(await corrections(setup), 2);
    // And a later, ordinary rerun is a no-op.
    await second.query(withTargets());
    assert.deepEqual(await row(setup, PUPIL_A), plus(before.a));
    assert.equal(await corrections(setup), 2);
  });

  await t.test("4. real roles: no privilege for anon, authenticated or service_role; a pupil is refused", async () => {
    const { connect, setup } = await freshDatabase();
    await setup.query(withTargets());
    for (const role of ["anon", "authenticated", "service_role"]) {
      for (const p of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER", "MAINTAIN"]) {
        const r = (await setup.query("SELECT has_table_privilege($1, 'public.progress_corrections', $2) AS ok", [role, p])).rows[0];
        assert.equal(r.ok, false, `${role} has ${p}`);
      }
    }
    const pupil = await connect();
    await pupil.query(`SET test.uid = '${PUPIL_A}'`);
    await pupil.query("SET ROLE authenticated");
    await assert.rejects(pupil.query("SELECT * FROM public.progress_corrections"), /permission denied/);
    await assert.rejects(pupil.query("DELETE FROM public.progress_corrections"), /permission denied/);
  });
});
