// REAL concurrency proof for migration 20261022120000 (the level engine) on a real PostgreSQL server with
// several simultaneous connections — the one property PGlite (single connection) cannot show.
//
// Runs only when LEVEL_ENGINE_PG_URL points at a disposable PostgreSQL server where the user may create
// databases and roles (superuser), and the `pg` client can be resolved — from the repo, or from the
// directory in LEVEL_ENGINE_PG_MODULE_DIR. Otherwise every test is SKIPPED with that reason (never passed
// silently). It creates its own database, so it never touches anything else on the server.
//
// Order, as in production: production-faithful base schema → #351 → A → B. Every call runs as
// service_role, the only role with EXECUTE.
//
// What this proves, with truly simultaneous sessions (and, first, the real ACLs):
//   0. EXECUTE on B's three functions and A's difficulty_level_from_grade_band: owner + service_role only.
//   1. The same first answer submitted twice at the same moment (two connections each run the answer
//      UPDATE and then advance_student_level): the verdict is written once and the level moves once.
//   2. Eight simultaneous advance_student_level calls for a brand-new pupil (row creation races too):
//      exactly one folds the answer, the other seven fold nothing; one level row, one fold-log row.
//   3. The lock is real: while one session holds the pupil's row, a second session's call WAITS (seen
//      from a third connection in pg_stat_activity) and, once released, folds nothing.
//   4. Two simultaneous get-next-question selections for one pupil (both flags on → same candidate
//      first) can create only ONE instance: the live unique indexes reject the second.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PROD_BASE_SQL, LEVEL_ENGINE_MIGRATIONS } from "./helpers/prod-base-schema.mjs";

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

const mig = (f) => readFileSync(join(ROOT, "supabase", "migrations", f), "utf8");
const uuid = (p, n) => `${p}-0000-4000-8000-${String(n).padStart(12, "0")}`;
// Roles are cluster-wide on a real server: create them only if missing.
const BASE = PROD_BASE_SQL.replace(
  "CREATE ROLE anon NOBYPASSRLS; CREATE ROLE authenticated NOBYPASSRLS; CREATE ROLE service_role BYPASSRLS;",
  `DO $r$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOBYPASSRLS; END IF;
     IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOBYPASSRLS; END IF;
     IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
   END $r$;`);

let dbName;
let dbUrl;
const opened = [];
async function setup() {
  const admin = new pg.Client({ connectionString: URL });
  await admin.connect();
  dbName = `level_conc_${Date.now()}`;
  // UTF8 regardless of the server's default (a Windows initdb defaults to WIN1252; the migrations hold →).
  await admin.query(`CREATE DATABASE ${dbName} ENCODING 'UTF8' TEMPLATE template0`);
  await admin.end();
  const u = new globalThis.URL(URL);
  u.pathname = `/${dbName}`;
  dbUrl = u.toString();
  const c = await connect(false);
  try {
  await c.query(BASE);
  for (const f of LEVEL_ENGINE_MIGRATIONS) await c.query(mig(f));
  const pupils = Array.from({ length: 10 }, (_, i) => uuid("11111111", i));
  await c.query(`INSERT INTO auth.users VALUES ${pupils.map((p) => `('${p}')`).join(",")}`);
  await c.query(`INSERT INTO public.profiles (id, role, selected_grade) VALUES ${pupils.map((p) => `('${p}','student',5)`).join(",")}`);
  const rows = Array.from({ length: 60 }, (_, i) =>
    `('${uuid("22222222", i)}','mc_single','{"question":"Q${i}?","options":["a","b"],"correct":"a"}',1,true,'auto','english','mc','short','{}',3,1,${1000 + i * 10})`);
  await c.query(`INSERT INTO public.questions (id,type,content,difficulty,is_active,question_type,learning_objective,
    answer_format,answer_type,metadata,target_grade,difficulty_band,difficulty_level) VALUES ${rows.join(",")}`);
  } finally {
    await c.end();
  }
}
async function teardown() {
  // Close every session this test opened before the database is dropped.
  await Promise.all(opened.splice(0).map((c) => c.end().catch(() => {})));
  if (!dbName) return;
  const admin = new pg.Client({ connectionString: URL });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
}
// A session of its own, as service_role unless asked otherwise.
async function connect(asService = true) {
  const c = new pg.Client({ connectionString: dbUrl });
  opened.push(c);
  await c.connect();
  if (asService) await c.query("SET ROLE service_role");
  return c;
}
const ADVANCE = "SELECT * FROM public.advance_student_level($1::uuid, 'engelsk', 5::smallint)";
// What process_question_attempt does: the verdict and answered_at = now() in ONE guarded UPDATE.
const ANSWER = `UPDATE public.question_instances SET answered = true, was_correct = $2, user_answer = 'a',
  answered_at = clock_timestamp() WHERE id = $1 AND student_id = $3 AND answered = false`;

test("real PostgreSQL: level updates are exactly-once under simultaneous sessions", { skip: SKIP, timeout: 120000 }, async (t) => {
  t.after(teardown);
  await setup();
  const setupConn = await connect();
  const serve = async (p, qn) => (await setupConn.query(
    "INSERT INTO public.question_instances (student_id, question_id) VALUES ($1, $2) RETURNING id", [p, uuid("22222222", qn)])).rows[0].id;
  const stateOf = async (p) => (await setupConn.query(
    `SELECT sl.level, sl.answered, (SELECT count(*)::int FROM public.student_level_fold_log f WHERE f.student_id = $1) AS folds
     FROM public.student_subject_level sl WHERE sl.student_id = $1 AND sl.subject = 'engelsk'`, [p])).rows;

  await t.test("0. EXECUTE on every new function: only the owner and service_role (no PUBLIC, anon, authenticated)", async () => {
    const acl = (await setupConn.query(`SELECT p.oid::regprocedure::text AS fn, p.prosecdef, pg_get_userbyid(p.proowner) AS owner,
        ARRAY(SELECT a.grantee::regrole::text || ':' || a.privilege_type
              FROM aclexplode(p.proacl) a WHERE a.grantee <> 0 ORDER BY 1) AS grants,
        EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0) AS public_execute
      FROM pg_proc p WHERE p.oid IN ('public.advance_student_level(uuid,text,smallint)'::regprocedure,
        'public.get_level_questions_for_student(uuid,integer,text[],integer)'::regprocedure,
        'public.request_repeat_level_question_for_student(uuid,text[])'::regprocedure,
        'public.difficulty_level_from_grade_band(integer,integer)'::regprocedure) ORDER BY 1`)).rows;
    assert.equal(acl.length, 4);
    for (const r of acl) {
      assert.equal(r.prosecdef, false, `${r.fn} must be SECURITY INVOKER`);
      assert.equal(r.public_execute, false, `${r.fn}: EXECUTE for PUBLIC`);
      assert.deepEqual(r.grants.sort(), [`${r.owner}:EXECUTE`, "service_role:EXECUTE"].sort(), r.fn);
    }
  });

  await t.test("1. the same first answer submitted twice at the same moment moves the level once", async () => {
    const p = uuid("11111111", 1);
    const start = (await setupConn.query(ADVANCE, [p])).rows[0].level;
    const inst = await serve(p, 1);
    const [a, b] = [await connect(), await connect()];
    try {
      const submit = async (c) => {
        const u = await c.query(ANSWER, [inst, true, p]);
        const r = (await c.query(ADVANCE, [p])).rows[0];
        return { updated: u.rowCount, folded: r.newly_folded, level: r.level };
      };
      const [ra, rb] = await Promise.all([submit(a), submit(b)]);
      assert.equal(ra.updated + rb.updated, 1, "the guarded answer UPDATE wins once");
      assert.equal(ra.folded + rb.folded, 1, "exactly one fold");
      assert.deepEqual(await stateOf(p), [{ level: start + 150, answered: 1, folds: 1 }]);
    } finally { await a.end(); await b.end(); }
  });

  await t.test("2. eight simultaneous calls for a brand-new pupil: one row, one fold", async () => {
    const p = uuid("11111111", 2);
    const inst = await serve(p, 2);
    await setupConn.query(ANSWER, [inst, false, p]);
    const conns = await Promise.all(Array.from({ length: 8 }, () => connect()));
    try {
      const results = await Promise.all(conns.map((c) => c.query(ADVANCE, [p]).then((r) => r.rows[0])));
      assert.equal(results.reduce((s, r) => s + r.newly_folded, 0), 1, "exactly one of eight folds the answer");
      assert.equal(new Set(results.map((r) => r.level)).size, 1, "every session reports the same final level");
      const rows = await stateOf(p);
      assert.equal(rows.length, 1, "one level row despite eight concurrent creations");
      assert.deepEqual(rows[0], { level: 3000 - 450, answered: 1, folds: 1 }); // grade 5 start 3000, one wrong
    } finally { await Promise.all(conns.map((c) => c.end())); }
  });

  await t.test("3. the row lock is real: a second session waits, then folds nothing", async () => {
    const p = uuid("11111111", 3);
    await setupConn.query(ADVANCE, [p]);
    const inst = await serve(p, 3);
    await setupConn.query(ANSWER, [inst, true, p]);
    const [holder, waiter, observer] = [await connect(), await connect(), await connect(false)];
    try {
      await holder.query("BEGIN");
      const first = (await holder.query(ADVANCE, [p])).rows[0];
      assert.equal(first.newly_folded, 1);
      const waiterPid = (await waiter.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      const pending = waiter.query(ADVANCE, [p]);
      let waiting = false;
      for (let i = 0; i < 50 && !waiting; i++) {
        await new Promise((r) => setTimeout(r, 50));
        const s = (await observer.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1", [waiterPid])).rows[0];
        waiting = s?.wait_event_type === "Lock";
      }
      assert.ok(waiting, "the second session is blocked on the pupil's lock");
      await holder.query("COMMIT");
      const second = (await pending).rows[0];
      assert.deepEqual([second.newly_folded, second.level], [0, first.level]);
      assert.equal((await stateOf(p))[0].folds, 1);
    } finally { await holder.end(); await waiter.end(); await observer.end(); }
  });

  await t.test("4. both flags on, two simultaneous selections of the same first candidate: one instance", async () => {
    const p = uuid("11111111", 4);
    // Both sessions run the selection first (barrier), then insert at the same moment — what two
    // simultaneous get-next-question requests do between the candidate RPC and the insert.
    const choose = async (c) => {
      const lvl = (await c.query(ADVANCE, [p])).rows[0].level;
      return (await c.query("SELECT id FROM public.get_level_questions_for_student($1::uuid, $2, ARRAY['english'], 5)", [p, lvl])).rows[0].id;
    };
    const insert = async (c, candidate) => {
      try {
        const r = await c.query("INSERT INTO public.question_instances (student_id, question_id) VALUES ($1, $2) RETURNING id", [p, candidate]);
        return { inserted: r.rowCount, candidate };
      } catch (e) {
        return { inserted: 0, candidate, code: e.code };
      }
    };
    const [a, b] = [await connect(), await connect()];
    try {
      const [ca, cb] = await Promise.all([choose(a), choose(b)]);
      const [ra, rb] = await Promise.all([insert(a, ca), insert(b, cb)]);
      assert.equal(ra.candidate, rb.candidate, "both sessions chose the same first candidate");
      assert.equal(ra.inserted + rb.inserted, 1, "only one instance is created");
      assert.equal([ra, rb].find((r) => r.inserted === 0).code, "23505", "the loser hits a unique index");
      const n = (await setupConn.query("SELECT count(*)::int n FROM public.question_instances WHERE student_id = $1", [p])).rows[0].n;
      assert.equal(n, 1);
    } finally { await a.end(); await b.end(); }
  });
});
