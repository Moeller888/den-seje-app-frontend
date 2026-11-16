// REAL PostgreSQL 17 proof for migration 20261110043500 (Lærligverse LP-13/K9 introductions) — what PGlite (one
// connection) cannot show: simultaneous requests for ONE introduction round, as a double click, two tabs or a retry
// after a lost connection produce them, register exactly once.
//
//   1. Eight simultaneous serve_introduction calls for a new pupil: ONE round; every caller gets that round's id.
//   2. Eight simultaneous "shown" reports with the SAME request id: one registration, seven replays, one time.
//   3. Eight simultaneous "shown" reports with DIFFERENT request ids: one recorded, seven already_recorded; the stored
//      request id is the winner's and the time never moves.
//   4. Eight simultaneous "completed" actions, same and different ids mixed: exactly one recorded.
//   5. A report whose transaction is still open when a second one arrives: the second WAITS on the row lock, then
//      answers already_recorded with the first one's time (no lost update, no second write).
//
// The introduction migration depends only on auth.users, so the database is the answer chain's base (roles,
// auth.users) plus this file UNMODIFIED. Runs only when LEVEL_ENGINE_PG_URL points at a disposable PostgreSQL
// server; otherwise SKIPPED with the reason — unless LEVEL_ENGINE_PG_REQUIRED=1 (CI's PostgreSQL 17.6 service),
// where it FAILS.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { baseSql, migrationSql } from "./helpers/h5-integration-chain.mjs";

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

const FILE = "20261110043500_laerligverse_introductions.sql";
const FIXTURE = JSON.parse(readFileSync(join(ROOT, "tests", "isolated", "fixtures", "kildekritik-introduction.json"), "utf8"));
const SERVE = "SELECT public.serve_introduction($1, $2) AS r";
const PRESENT = "SELECT public.mark_introduction_presented($1, $2, $3) AS r";
const COMPLETE = "SELECT public.complete_introduction($1, $2, $3) AS r";

const created = [];
const opened = [];
async function connect(url, asService = true) {
  const c = new pg.Client({ connectionString: url });
  opened.push(c);
  await c.connect();
  if (asService) await c.query("SET ROLE service_role");
  return c;
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
  const name = `intro_${Date.now()}_${created.length}`;
  await admin.query(`CREATE DATABASE ${name} ENCODING 'UTF8' TEMPLATE template0`);
  await admin.end();
  created.push(name);
  const u = new globalThis.URL(URL);
  u.pathname = `/${name}`;
  const url = u.toString();
  const su = await connect(url, false);
  // The answer chain's base creates the cluster-wide roles (anon, authenticated, service_role) only if missing.
  for (const sql of baseSql({ realServer: true })) await su.query(sql);
  await su.query(`BEGIN;\n${migrationSql(FILE)}\nCOMMIT;`);
  await su.query(`INSERT INTO public.learning_introductions (learning_objective, content) VALUES ($1, $2::jsonb)`,
    [FIXTURE.learning_objective, JSON.stringify(FIXTURE.content)]);
  return { url, su };
}
/** Run `n` copies at once on `n` separate sessions, released together. */
async function race(url, n, sql, paramsOf) {
  const clients = [];
  for (let i = 0; i < n; i++) clients.push(await connect(url));
  return (await Promise.all(clients.map((c, i) => c.query(sql, paramsOf(i))))).map((r) => r.rows[0].r);
}
const tally = (rs) => rs.reduce((m, r) => ({ ...m, [r.outcome]: (m[r.outcome] ?? 0) + 1 }), {});

test("real PostgreSQL 17: simultaneous introduction requests register exactly once", { skip: SKIP, timeout: 300000 }, async (t) => {
  t.after(teardown);
  const { url, su } = await createDb();
  const pupil = async () => {
    const id = randomUUID();
    await su.query("INSERT INTO auth.users (id) VALUES ($1)", [id]);
    return id;
  };
  const row = async (id) => (await su.query(`SELECT presented_at, presented_request_id::text, completed_at, completion_request_id::text
    FROM public.introduction_rounds WHERE id = $1`, [id])).rows[0];
  const roundOf = async (p) => (await (await connect(url)).query(SERVE, [p, FIXTURE.learning_objective])).rows[0].r.round_id;

  await t.test("1. eight simultaneous serves for a new pupil: one round, one id", async () => {
    const p = await pupil();
    const rs = await race(url, 8, SERVE, () => [p, FIXTURE.learning_objective]);
    assert.ok(rs.every((r) => r.outcome === "served" || r.outcome === "resumed"), JSON.stringify(tally(rs)));
    assert.equal(new Set(rs.map((r) => r.round_id)).size, 1, "every caller got the same round");
    assert.equal((await su.query(`SELECT count(*)::int c FROM public.introduction_rounds WHERE student_id = $1`, [p])).rows[0].c, 1);
  });

  await t.test("2. eight simultaneous 'shown' reports with the same request id: one registration", async () => {
    const p = await pupil();
    const round = await roundOf(p);
    const rid = randomUUID();
    const rs = await race(url, 8, PRESENT, () => [p, round, rid]);
    assert.deepEqual(tally(rs), { recorded: 1, replay: 7 });
    assert.equal(new Set(rs.map((r) => String(r.presented_at))).size, 1, "one server time for all");
    assert.equal((await row(round)).presented_request_id, rid);
  });

  await t.test("3. eight simultaneous 'shown' reports with different ids: one recorded, the time never moves", async () => {
    const p = await pupil();
    const round = await roundOf(p);
    const ids = Array.from({ length: 8 }, () => randomUUID());
    const rs = await race(url, 8, PRESENT, (i) => [p, round, ids[i]]);
    assert.deepEqual(tally(rs), { recorded: 1, already_recorded: 7 });
    const winner = ids[rs.findIndex((r) => r.outcome === "recorded")];
    const stored = await row(round);
    assert.equal(stored.presented_request_id, winner);
    assert.ok(rs.every((r) => new Date(r.presented_at).getTime() === stored.presented_at.getTime()));
  });

  await t.test("4. eight simultaneous 'completed' actions (two ids): exactly one recorded", async () => {
    const p = await pupil();
    const round = await roundOf(p);
    const a = randomUUID();
    const b = randomUUID();
    const rs = await race(url, 8, COMPLETE, (i) => [p, round, i % 2 === 0 ? a : b]);
    const counts = tally(rs);
    assert.equal(counts.recorded, 1, JSON.stringify(counts));
    const stored = await row(round);
    assert.ok(stored.completion_request_id === a || stored.completion_request_id === b);
    const sameAsWinner = rs.filter((r) => r.outcome === "replay").length;
    assert.equal(sameAsWinner + (counts.already_completed ?? 0), 7);
    assert.equal(sameAsWinner, 3, "the winner's three other copies are replays");
  });

  await t.test("5. a report still open when a second arrives: the second waits, then answers already_recorded", async () => {
    const p = await pupil();
    const round = await roundOf(p);
    const first = await connect(url);
    const second = await connect(url);
    await first.query("BEGIN");
    const r1 = (await first.query(PRESENT, [p, round, randomUUID()])).rows[0].r;
    assert.equal(r1.outcome, "recorded");
    const pending = second.query(PRESENT, [p, round, randomUUID()]);
    let waited = false;
    for (let i = 0; i < 400 && !waited; i++) {
      waited = (await su.query(`SELECT count(*)::int n FROM pg_stat_activity WHERE datname = current_database()
        AND wait_event_type = 'Lock'`)).rows[0].n >= 1;
      if (!waited) await new Promise((r) => setTimeout(r, 25));
    }
    assert.ok(waited, "the second report waits on the round's row lock");
    await first.query("COMMIT");
    const r2 = (await pending).rows[0].r;
    assert.equal(r2.outcome, "already_recorded");
    assert.equal(new Date(r2.presented_at).getTime(), new Date(r1.presented_at).getTime());
  });
});
