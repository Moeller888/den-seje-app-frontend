// REAL PostgreSQL 17 proof for 20261103100000_question_attempts_history_no_action (D-327, H5 track
// "(b)") on the H5 chain production will have (D-280 part 1 → D-278 → G1 → bootstrap → alignment) plus
// D-316 (applied in production), every file UNMODIFIED:
//
//   1. Deleting a question_instances row that has attempts is refused — SQLSTATE 23503, the constraint
//      question_attempts_instance_fkey named, the "update or delete" form — and both rows stay; an
//      instance without attempts can still be deleted. The migration itself changes no row.
//   2. Authorised account deletion (DELETE FROM auth.users) still removes the pupil's instances and
//      attempts in one statement (NO ACTION is checked at the end of the statement); others untouched.
//   3. Atomic whatever the runner does: wrapped in one transaction or autocommit, a held lock on
//      question_attempts aborts with 55P03 within seconds and leaves CASCADE in place; lock_timeout does
//      not leak into the session.
//   4. Concurrency: a DELETE of an instance racing with _v2 answering it waits; once the attempt is
//      committed the DELETE is refused and the attempt stays. The other order: an instance without
//      attempts deleted first — the late answer finds no round and writes nothing.
//   5. D-316's history guard still closes a forced round 1 with attempts; nothing is lost.
//   6. The documented rollback restores H5's CASCADE exactly.
//
// Runs only when LEVEL_ENGINE_PG_URL points at a disposable PostgreSQL server; otherwise SKIPPED —
// unless LEVEL_ENGINE_PG_REQUIRED=1 (CI), where a missing server FAILS. Synthetic rows only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PROD_ORDER, TOP10_ID, uid, baseSql, migrationSql } from "./helpers/h5-integration-chain.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const URL = process.env.LEVEL_ENGINE_PG_URL ?? "";
const FILE = "20261103100000_question_attempts_history_no_action.sql";
const D316 = "20261102100000_release_open_rounds_on_inactive_questions.sql";
const CASCADE = "FOREIGN KEY (question_instance_id, student_id) REFERENCES question_instances(id, student_id) ON DELETE CASCADE";
const NO_ACTION = "FOREIGN KEY (question_instance_id, student_id) REFERENCES question_instances(id, student_id)";

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

const read = (p) => readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
function rollbackSql() {
  const m = /```sql\n([\s\S]*?)```/.exec(read("docs/operations/question-attempts-history-no-action-rollback.md"));
  assert.ok(m && /ROLLBACK D-327/.test(m[1]));
  return m[1];
}

const created = [];
const opened = [];
async function createDb() {
  const admin = new pg.Client({ connectionString: URL });
  await admin.connect();
  const name = `d327_${Date.now()}_${created.length}`;
  await admin.query(`CREATE DATABASE ${name} ENCODING 'UTF8' TEMPLATE template0`);
  await admin.end();
  created.push(name);
  const u = new globalThis.URL(URL);
  u.pathname = `/${name}`;
  const url = u.toString();
  const su = await connect(url);
  for (const sql of baseSql({ realServer: true })) await su.query(sql);
  for (const f of [...PROD_ORDER, D316]) await su.query(migrationSql(f));
  return { url, su };
}
async function connect(url) {
  const c = new pg.Client({ connectionString: url });
  opened.push(c);
  await c.connect();
  return c;
}
async function teardown() {
  await Promise.all(opened.splice(0).map((c) => c.end().catch(() => {})));
  if (!created.length) return;
  const admin = new pg.Client({ connectionString: URL });
  await admin.connect();
  for (const name of created.splice(0)) await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.end();
}
const failure = async (p) => { try { await p; return null; } catch (e) { return e; } };
const fkDef = async (c) => (await c.query(`SELECT pg_get_constraintdef(oid) AS d, condeferrable AS x FROM pg_constraint
  WHERE conname = 'question_attempts_instance_fkey'`)).rows[0];
const apply = (c, sql) => c.query(`BEGIN;\n${sql}\nCOMMIT;`).catch(async (e) => { await c.query("ROLLBACK").catch(() => {}); throw e; });
let n = 7100;
async function pupil(c) {
  const id = uid(n++);
  await c.query("INSERT INTO auth.users VALUES ($1)", [id]);
  await c.query("INSERT INTO public.profiles (id, role, selected_grade) VALUES ($1, 'student', 5)", [id]);
  await c.query(`INSERT INTO public.student_progress (student_id, xp, coins, correct_answers, total_correct_answers,
    current_streak, longest_streak, last_activity_date) VALUES ($1, 100, 50, 7, 7, 1, 1, current_date - 1)`, [id]);
  return id;
}
async function served(c, p, q) {
  const key = (await c.query("SELECT content->>'correct' AS k FROM public.questions WHERE id = $1", [q])).rows[0].k;
  const qi = (await c.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, next_review_at)
    VALUES ($1, $2, $3, now()) RETURNING id`, [p, q, key])).rows[0].id;
  return { qi, key };
}
const V2 = "SELECT public.process_question_attempt_v2($1, $2, $3, 1, $4, NULL, NULL) AS r";
const attemptsOf = async (c, p) => (await c.query("SELECT count(*)::int AS n FROM public.question_attempts WHERE student_id = $1", [p])).rows[0].n;
const waitForLockWaiters = async (su, count) => {
  for (let i = 0; i < 400; i++) {
    const w = (await su.query(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`)).rows[0].n;
    if (w >= count) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  assert.fail(`expected ${count} sessions waiting on a lock`);
};

test("real PostgreSQL 17: D-327 — instance deletion keeps H5 history, account deletion works, atomic, concurrent, rollback",
  { skip: SKIP, timeout: 300000 }, async (t) => {
    t.after(teardown);

    await t.test("1. an instance with attempts cannot be deleted (23503); one without can; the migration changes no row", async () => {
      const { url, su } = await createDb();
      const svc = await connect(url);
      await svc.query("SET ROLE service_role");
      const p = await pupil(su);
      const a = await served(su, p, TOP10_ID[0]);
      assert.equal((await svc.query(V2, [p, a.qi, a.key, randomUUID()])).rows[0].r.outcome, "recorded");
      const b = await served(su, await pupil(su), TOP10_ID[1]);
      const snapshot = async () => (await su.query(`SELECT (SELECT json_agg(to_jsonb(i) ORDER BY id) FROM public.question_instances i) AS i,
        (SELECT json_agg(to_jsonb(x) ORDER BY id) FROM public.question_attempts x) AS a`)).rows[0];
      const before = await snapshot();
      assert.deepEqual(await fkDef(su), { d: CASCADE, x: false });
      await apply(su, migrationSql(FILE));
      assert.deepEqual(await fkDef(su), { d: NO_ACTION, x: false });
      assert.deepEqual(await snapshot(), before, "no row changed by the migration");
      const e = await failure(su.query("DELETE FROM public.question_instances WHERE id = $1", [a.qi]));
      assert.equal(e?.code, "23503");
      assert.equal(e.constraint, "question_attempts_instance_fkey");
      assert.match(e.message, /^update or delete on table "question_instances" violates foreign key constraint/);
      assert.equal(await attemptsOf(su, p), 1, "the attempt stays");
      await su.query("DELETE FROM public.question_instances WHERE id = $1", [b.qi]);
    });

    await t.test("2. account deletion still removes the pupil's instances and attempts; others untouched", async () => {
      const { url, su } = await createDb();
      await apply(su, migrationSql(FILE));
      const svc = await connect(url);
      await svc.query("SET ROLE service_role");
      const p = await pupil(su);
      const other = await pupil(su);
      for (const [who, q] of [[p, TOP10_ID[0]], [p, TOP10_ID[1]], [other, TOP10_ID[2]]]) {
        const s = await served(su, who, q);
        assert.equal((await svc.query(V2, [who, s.qi, s.key, randomUUID()])).rows[0].r.outcome, "recorded");
      }
      assert.equal(await attemptsOf(su, p), 2);
      await su.query("DELETE FROM auth.users WHERE id = $1", [p]);
      assert.equal(await attemptsOf(su, p), 0);
      assert.equal((await su.query("SELECT count(*)::int AS n FROM public.question_instances WHERE student_id = $1", [p])).rows[0].n, 0);
      assert.equal(await attemptsOf(su, other), 1, "another pupil untouched");
    });

    await t.test("3. atomic in both models: a held lock aborts with 55P03, CASCADE stays, lock_timeout does not leak", async () => {
      for (const [model, run] of [["wrapped", (c, s) => apply(c, s)], ["autocommit", (c, s) => c.query(s)]]) {
        const { url, su } = await createDb();
        const blocker = await connect(url);
        await blocker.query("BEGIN");
        await blocker.query("LOCK TABLE public.question_attempts IN ACCESS SHARE MODE");
        const started = Date.now();
        assert.equal((await failure(run(su, migrationSql(FILE))))?.code, "55P03", model);
        assert.ok(Date.now() - started < 30000, `${model}: aborts within seconds`);
        assert.deepEqual(await fkDef(su), { d: CASCADE, x: false }, `${model}: nothing changed`);
        await blocker.query("ROLLBACK");
        if (model === "autocommit") assert.equal((await su.query("SHOW lock_timeout")).rows[0].lock_timeout, "0");
        await run(su, migrationSql(FILE));
        assert.deepEqual(await fkDef(su), { d: NO_ACTION, x: false }, `${model}: a re-run succeeds`);
      }
    });

    await t.test("4. concurrency: a delete racing with an answer never loses the attempt", async () => {
      const { url, su } = await createDb();
      await apply(su, migrationSql(FILE));
      // Answer first (holds the instance row), delete waits, then is refused.
      const p = await pupil(su);
      const s = await served(su, p, TOP10_ID[0]);
      const answerer = await connect(url);
      await answerer.query("SET ROLE service_role");
      await answerer.query("BEGIN");
      assert.equal((await answerer.query(V2, [p, s.qi, s.key, randomUUID()])).rows[0].r.outcome, "recorded");
      const deleter = await connect(url);
      const deleting = failure(deleter.query("DELETE FROM public.question_instances WHERE id = $1", [s.qi]));
      await waitForLockWaiters(su, 1);
      await answerer.query("COMMIT");
      assert.equal((await deleting)?.code, "23503");
      assert.equal(await attemptsOf(su, p), 1);
      // Delete first (an instance without attempts), the late answer finds no round and writes nothing.
      const p2 = await pupil(su);
      const s2 = await served(su, p2, TOP10_ID[1]);
      await deleter.query("BEGIN");
      await deleter.query("DELETE FROM public.question_instances WHERE id = $1", [s2.qi]);
      const late = answerer.query(V2, [p2, s2.qi, s2.key, randomUUID()]).then((r) => r.rows[0].r);
      await waitForLockWaiters(su, 1);
      await deleter.query("COMMIT");
      assert.notEqual((await late).outcome, "recorded");
      assert.equal(await attemptsOf(su, p2), 0);
    });

    await t.test("5. D-316's history guard still closes a forced round 1 with attempts; nothing lost", async () => {
      const { url, su } = await createDb();
      await apply(su, migrationSql(FILE));
      const svc = await connect(url);
      await svc.query("SET ROLE service_role");
      const p = await pupil(su);
      const s = await served(su, p, TOP10_ID[4]);
      assert.equal((await svc.query(V2, [p, s.qi, s.key, randomUUID()])).rows[0].r.outcome, "recorded");
      await su.query("SET session_replication_role = replica");
      await su.query("UPDATE public.question_instances SET answered = false, user_answer = NULL WHERE id = $1", [s.qi]);
      await su.query("SET session_replication_role = DEFAULT");
      const me = await connect(url);
      await me.query(`SELECT set_config('test.uid', $1, false)`, [p]);
      await me.query("SET ROLE authenticated");
      assert.equal((await me.query("SELECT public.release_open_question_outside(ARRAY['et_andet_fag']) AS n")).rows[0].n, 1);
      assert.equal((await su.query("SELECT answered FROM public.question_instances WHERE id = $1", [s.qi])).rows[0].answered, true);
      assert.equal(await attemptsOf(su, p), 1);
    });

    await t.test("6. the documented rollback restores H5's CASCADE exactly", async () => {
      const { su } = await createDb();
      await apply(su, migrationSql(FILE));
      await apply(su, rollbackSql());
      assert.deepEqual(await fkDef(su), { d: CASCADE, x: false });
    });
  });
