// REAL concurrency proof for migration 20261105090000_minigame_breaks (D-347) on a real PostgreSQL server
// with several simultaneous sessions — what PGlite (one connection) cannot show.
//
// Runs only when LEVEL_ENGINE_PG_URL points at a disposable PostgreSQL server where the user may create
// databases and roles, and the `pg` client can be resolved. Otherwise every test is SKIPPED with the
// reason — unless LEVEL_ENGINE_PG_REQUIRED=1 (CI's unit job, PostgreSQL 17 service), where a missing
// server FAILS. It creates its own database and drops it afterwards. Same harness as
// claim-daily-reward-concurrency.test.mjs.
//
// How simultaneity is forced: a blocker session holds the pupil's minigame_break_progress row (or the
// insert that creates it); every call is started; the test waits until pg_stat_activity shows all of them
// waiting on a lock; only then is the blocker released.
//
// What this proves:
//   1. 8 simultaneous answers that each reach 20 minutes → exactly ONE offer; every reply names it.
//   2. A pupil's first call (no progress row yet), 8 at once → one row, no error.
//   3. 8 simultaneous "Ja tak" → one transition, all idempotent 'ok'; then 8 simultaneous game starts →
//      exactly one 'ok', seven 'already_used' (one round per offer).
//   4. "Ja tak" and "Nej, ellers tak" racing → exactly one choice wins, every 'ok' reply agrees with it.
//   5. 16 pupils × 4 simultaneous answers → no error, no deadlock, at most one offer each, no cross-talk.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
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

const MIGRATION = "supabase/migrations/20261105090000_minigame_breaks.sql";
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const ROLES = `
  DO $$ BEGIN
    BEGIN CREATE ROLE anon NOLOGIN NOINHERIT; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END;
    BEGIN CREATE ROLE authenticated NOLOGIN NOINHERIT; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END;
    BEGIN CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END;
  END $$;`;
const SCHEMA = `
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text);
  CREATE TABLE public.question_instances (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    answered boolean NOT NULL DEFAULT false,
    answered_at timestamptz,
    user_answer text);
  ALTER TABLE public.question_instances ENABLE ROW LEVEL SECURITY;
`;

let dbName;
let dbUrl;
const opened = [];
async function setup() {
  const admin = new pg.Client({ connectionString: URL });
  await admin.connect();
  await admin.query(ROLES);
  dbName = `minigame_breaks_conc_${Date.now()}`;
  await admin.query(`CREATE DATABASE ${dbName} ENCODING 'UTF8' TEMPLATE template0`);
  await admin.end();
  const u = new globalThis.URL(URL);
  u.pathname = `/${dbName}`;
  dbUrl = u.toString();
  const c = await connect();
  await c.query(SCHEMA);
  await c.query(read(MIGRATION));
  return c;
}
async function teardown() {
  await Promise.all(opened.splice(0).map((c) => c.end().catch(() => {})));
  if (!dbName) return;
  const admin = new pg.Client({ connectionString: URL });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
}
async function connect() {
  const c = new pg.Client({ connectionString: dbUrl });
  opened.push(c);
  await c.connect();
  return c;
}
async function done(...clients) {
  for (const c of clients) {
    const i = opened.indexOf(c);
    if (i >= 0) opened.splice(i, 1);
    await c.end().catch(() => {});
  }
}
async function pupilSession(id) {
  const c = await connect();
  await c.query("SELECT set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: id, role: "authenticated" })]);
  await c.query("SET ROLE authenticated");
  return c;
}
async function waitForLockWaiters(su, n) {
  const deadline = Date.now() + 20000;
  for (;;) {
    const { rows } = await su.query(`SELECT count(*)::int AS n FROM pg_stat_activity
      WHERE datname = $1 AND wait_event_type = 'Lock'`, [dbName]);
    if (rows[0].n >= n) return;
    if (Date.now() > deadline) throw new Error(`only ${rows[0].n} of ${n} sessions are waiting on a lock`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

test("real PostgreSQL: spillepauser stay exactly-once under simultaneous calls", { skip: SKIP, timeout: 180000 }, async (t) => {
  t.after(teardown);
  const su = await setup();
  let n = 9000;
  const pupil = async ({ seconds = 1199, row = true } = {}) => {
    const id = uid(n++);
    await su.query("INSERT INTO auth.users VALUES ($1)", [id]);
    await su.query("INSERT INTO public.profiles VALUES ($1, 'student')", [id]);
    if (row) {
      await su.query(`INSERT INTO public.minigame_break_progress (student_id, active_seconds, last_credit_at)
        VALUES ($1, $2, now() - interval '600 seconds')`, [id, seconds]);
    }
    return id;
  };
  const answeredInstance = async (id, ago = 0) => (await su.query(`INSERT INTO public.question_instances
      (student_id, created_at, answered, answered_at, user_answer)
    VALUES ($1, now() - interval '100 seconds', true, now() - make_interval(secs => $2), 'x') RETURNING id`, [id, ago])).rows[0].id;
  const offerRows = async (id) => (await su.query(
    "SELECT id, status FROM public.minigame_break_offers WHERE student_id = $1 ORDER BY offered_at", [id])).rows;
  // Holds the pupil's progress row so every call queues behind it.
  const block = async (id) => {
    const b = await connect();
    await b.query("BEGIN");
    await b.query("SELECT 1 FROM public.minigame_break_progress WHERE student_id = $1 FOR UPDATE", [id]);
    return b;
  };

  await t.test("1. 8 simultaneous answers crossing 20 minutes → exactly one offer, the same in every reply", async () => {
    const id = await pupil();
    const instances = [];
    for (let i = 0; i < 8; i++) instances.push(await answeredInstance(id, i));
    const blocker = await block(id);
    const sessions = await Promise.all(instances.map(() => pupilSession(id)));
    const calls = sessions.map((c, i) => c.query("SELECT public.minigame_break_after_answer($1, NULL) AS r", [instances[i]]));
    await waitForLockWaiters(su, 8);
    await blocker.query("COMMIT");
    const results = (await Promise.all(calls)).map((r) => r.rows[0].r);
    const offered = results.filter((r) => r.offer).map((r) => r.offer.id);
    assert.ok(offered.length >= 1);
    assert.equal(new Set(offered).size, 1, "every reply names the one offer");
    assert.deepEqual((await offerRows(id)).map((o) => o.status), ["offered"]);
    await done(blocker, ...sessions);
  });

  await t.test("2. first call ever (no progress row), 8 at once → one row, no error", async () => {
    const id = await pupil({ row: false });
    const inst = await answeredInstance(id);
    const blocker = await connect();
    await blocker.query("BEGIN");
    await blocker.query("INSERT INTO public.minigame_break_progress (student_id) VALUES ($1)", [id]);
    const sessions = await Promise.all(Array.from({ length: 8 }, () => pupilSession(id)));
    const calls = sessions.map((c) => c.query("SELECT public.minigame_break_after_answer($1, NULL) AS r", [inst]));
    await waitForLockWaiters(su, 8);
    await blocker.query("ROLLBACK");                                         // now they race to create it
    const results = (await Promise.all(calls)).map((r) => r.rows[0].r);
    assert.ok(results.every((r) => r.status === "ok"));
    assert.equal(results.filter((r) => r.reason === "counted").length, 1, "the answer is credited once");
    const rows = (await su.query("SELECT count(*)::int AS n FROM public.minigame_break_progress WHERE student_id = $1", [id])).rows[0].n;
    assert.equal(rows, 1);
    await done(blocker, ...sessions);
  });

  await t.test("3. 8 simultaneous 'Ja tak', then 8 simultaneous game starts → one round", async () => {
    const id = await pupil();
    const first = await (await pupilSession(id)).query("SELECT public.minigame_break_after_answer($1, NULL) AS r", [await answeredInstance(id)]);
    const offer = first.rows[0].r.offer;
    assert.ok(offer);

    let blocker = await block(id);
    let sessions = await Promise.all(Array.from({ length: 8 }, () => pupilSession(id)));
    let calls = sessions.map((c) => c.query("SELECT public.minigame_break_respond($1, true) AS r", [offer.id]));
    await waitForLockWaiters(su, 8);
    await blocker.query("COMMIT");
    let results = (await Promise.all(calls)).map((r) => r.rows[0].r);
    assert.ok(results.every((r) => r.status === "ok" && r.offer_status === "accepted"));
    await done(blocker, ...sessions);

    blocker = await block(id);
    sessions = await Promise.all(Array.from({ length: 8 }, () => pupilSession(id)));
    calls = sessions.map((c) => c.query("SELECT public.minigame_break_start($1, $2) AS r", [offer.id, offer.game]));
    await waitForLockWaiters(su, 8);
    await blocker.query("COMMIT");
    results = (await Promise.all(calls)).map((r) => r.rows[0].r);
    assert.equal(results.filter((r) => r.status === "ok").length, 1, "exactly one round");
    assert.deepEqual(results.filter((r) => r.status !== "ok").map((r) => r.reason), Array(7).fill("already_used"));
    assert.deepEqual((await offerRows(id)).map((o) => o.status), ["started"]);
    await done(blocker, ...sessions);
  });

  await t.test("4. 'Ja tak' and 'Nej, ellers tak' racing → exactly one choice wins", async () => {
    const id = await pupil();
    const first = await (await pupilSession(id)).query("SELECT public.minigame_break_after_answer($1, NULL) AS r", [await answeredInstance(id)]);
    const offer = first.rows[0].r.offer;
    const blocker = await block(id);
    const choices = [true, false, true, false, true, false, true, false];
    const sessions = await Promise.all(choices.map(() => pupilSession(id)));
    const calls = sessions.map((c, i) => c.query("SELECT public.minigame_break_respond($1, $2) AS r", [offer.id, choices[i]]));
    await waitForLockWaiters(su, 8);
    await blocker.query("COMMIT");
    const results = (await Promise.all(calls)).map((r) => r.rows[0].r);
    const [{ status: final }] = await offerRows(id);
    assert.ok(final === "accepted" || final === "declined");
    for (const r of results) assert.equal(r.offer_status, final, "every reply reports the one stored choice");
    const okReplies = results.map((r, i) => ({ r, accept: choices[i] })).filter(({ r }) => r.status === "ok");
    assert.ok(okReplies.every(({ accept }) => (accept ? "accepted" : "declined") === final), "only the winning choice is 'ok'");
    assert.ok(results.filter((r) => r.status === "conflict").length >= 1);
    await done(blocker, ...sessions);
  });

  await t.test("5. 16 pupils × 4 simultaneous answers → no error, no deadlock, at most one offer each", async () => {
    const pupils = [];
    for (let i = 0; i < 16; i++) pupils.push(await pupil({ seconds: 1100 }));
    const jobs = [];
    for (const id of pupils) for (let k = 0; k < 4; k++) jobs.push({ id, inst: await answeredInstance(id, k) });
    const sessions = await Promise.all(jobs.map((j) => pupilSession(j.id)));
    const results = await Promise.all(sessions.map((c, i) =>
      c.query("SELECT public.minigame_break_after_answer($1, NULL) AS r", [jobs[i].inst]).then((r) => r.rows[0].r)));
    assert.ok(results.every((r) => r.status === "ok"));
    for (const id of pupils) {
      const rows = await offerRows(id);
      assert.ok(rows.length <= 1, id);
    }
    // No cross-talk: every offer belongs to the pupil whose call created it.
    const owners = (await su.query(`SELECT count(*)::int AS n FROM public.minigame_break_offers o
      WHERE o.student_id = ANY($1::uuid[])`, [pupils])).rows[0].n;
    assert.ok(owners <= 16);
    await done(...sessions);
  });
});
