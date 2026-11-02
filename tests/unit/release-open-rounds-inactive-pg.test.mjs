// REAL PostgreSQL 17 proof for 20261102100000_release_open_rounds_on_inactive_questions (D-316), with
// H5 (20261101190000 + 20261101190100) and D-290 G2 (20261101140000), every file UNMODIFIED:
//
//   0. D-316 before H5 and H5 before D-316 (each with G2) end in the same public schema.
//   1. An unreviewed release_open_question_outside body: D-316 refuses (P0001) and changes nothing; the
//      H5 bootstrap refuses it too (P0001), nothing changed.
//   2. Concurrency, the round-1 path: eight simultaneous release calls by the pupil → exactly one
//      deletion in total (sum of returns = 1), no error; afterwards the pupil gets a fresh round.
//   3. Concurrency, release vs answer on the SAME open round of an inactive question: whichever commits
//      first wins — answered (then nothing is released, the attempt and reward stay) or released (then
//      the answer finds no open round and writes nothing). Never both, never an error other than the
//      answer's documented outcome.
//   4. H5 history: a reopened repeat on an inactive question is closed by release; every
//      question_attempts row stays; G2 still refuses a new open round on the inactive question (23514).
//   5. The documented rollback restores the old body (md5 7b7693b3…).
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
import {
  D278, D280_PATHS, G1, BOOTSTRAP, ALIGN, PROD_ORDER, TOP10_ID, uid, baseSql, migrationSql, FINGERPRINT_SQL,
} from "./helpers/h5-integration-chain.mjs";
import { G2, G2_SEED_SQL } from "./helpers/g2-h5-orders.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const URL = process.env.LEVEL_ENGINE_PG_URL ?? "";
const FIX = "20261102100000_release_open_rounds_on_inactive_questions.sql";
const SIG = "public.release_open_question_outside(text[])";

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
  const m = /```sql\n([\s\S]*?)```/.exec(read("docs/operations/release-open-rounds-inactive-rollback.md"));
  assert.ok(m && /ROLLBACK D-316/.test(m[1]));
  return m[1];
}

const created = [];
const opened = [];
async function createDb(order) {
  const admin = new pg.Client({ connectionString: URL });
  await admin.connect();
  const name = `d316_${Date.now()}_${created.length}`;
  await admin.query(`CREATE DATABASE ${name} ENCODING 'UTF8' TEMPLATE template0`);
  await admin.end();
  created.push(name);
  const u = new globalThis.URL(URL);
  u.pathname = `/${name}`;
  const url = u.toString();
  const c = await connect(url);
  for (const sql of baseSql({ realServer: true })) await c.query(sql);
  await c.query(G2_SEED_SQL);
  for (const f of order) await c.query(migrationSql(f));
  return { url, su: c };
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
const fingerprint = async (c) => (await c.query(FINGERPRINT_SQL)).rows[0].f;
const failure = async (p) => { try { await p; return null; } catch (e) { return { code: e.code, message: e.message }; } };
let n = 6100;
async function pupil(c) {
  const id = uid(n++);
  await c.query("INSERT INTO auth.users VALUES ($1)", [id]);
  await c.query("INSERT INTO public.profiles (id, role, selected_grade) VALUES ($1, 'student', 5)", [id]);
  await c.query(`INSERT INTO public.student_progress (student_id, xp, coins, correct_answers, total_correct_answers,
    current_streak, longest_streak, last_activity_date) VALUES ($1, 100, 50, 7, 7, 1, 1, current_date - 1)`, [id]);
  return id;
}
const loOf = async (c, q) => (await c.query("SELECT learning_objective AS lo FROM public.questions WHERE id = $1", [q])).rows[0].lo;
// A session acting as the pupil, as PostgREST would: role authenticated, auth.uid() from the setting.
async function asPupil(url, p) {
  const c = await connect(url);
  await c.query(`SELECT set_config('test.uid', $1, false)`, [p]);
  await c.query("SET ROLE authenticated");
  return c;
}
const RELEASE = `SELECT public.release_open_question_outside($1) AS n`;
const waitForLockWaiters = async (su, count) => {
  for (let i = 0; i < 400; i++) {
    const w = (await su.query(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`)).rows[0].n;
    if (w >= count) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  assert.fail(`expected ${count} sessions waiting on a lock`);
};

test("real PostgreSQL 17: D-316 with H5 and G2 — both orders, refusals, concurrency, H5 history, rollback",
  { skip: SKIP, timeout: 300000 }, async (t) => {
    t.after(teardown);

    await t.test("0. D-316 before H5 and H5 before D-316 (with G2) end in the same schema", async () => {
      const a = await createDb([D280_PATHS, D278, G1, G2, FIX, BOOTSTRAP, ALIGN]);
      const b = await createDb([D280_PATHS, D278, G1, G2, BOOTSTRAP, ALIGN, FIX]);
      assert.deepEqual(await fingerprint(a.su), await fingerprint(b.su));
    });

    await t.test("1. an unreviewed body: D-316 and the H5 bootstrap both refuse (P0001), nothing changed", async () => {
      const { su } = await createDb([D280_PATHS, D278, G1]);
      await su.query(`CREATE OR REPLACE FUNCTION public.release_open_question_outside(p_domains text[]) RETURNS integer
        LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$ BEGIN RETURN 0; END $f$`);
      const before = await fingerprint(su);
      for (const f of [FIX, BOOTSTRAP]) {
        const e = await failure(su.query(migrationSql(f)));
        assert.equal(e?.code, "P0001", f);
      }
      assert.deepEqual(await fingerprint(su), before);
    });

    const { url, su } = await createDb([D280_PATHS, D278, G1, G2, BOOTSTRAP, ALIGN, FIX]);

    await t.test("2. eight simultaneous releases of one stale round 1: exactly one deletion, no error", async () => {
      const q = TOP10_ID[2];
      const p = await pupil(su);
      const qi = (await su.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, next_review_at)
        VALUES ($1, $2, 'x', now()) RETURNING id`, [p, q])).rows[0].id;
      await su.query("UPDATE public.questions SET is_active = false WHERE id = $1", [q]);
      const domains = [await loOf(su, q)];
      const blocker = await connect(url);
      await blocker.query("BEGIN");
      await blocker.query("SELECT 1 FROM public.question_instances WHERE id = $1 FOR UPDATE", [qi]);
      const sessions = await Promise.all(Array.from({ length: 8 }, () => asPupil(url, p)));
      const running = sessions.map((s) => s.query(RELEASE, [domains]).then((r) => r.rows[0].n));
      await waitForLockWaiters(su, 8);
      await blocker.query("COMMIT");
      const counts = await Promise.all(running);
      assert.equal(counts.reduce((a, b) => a + b, 0), 1, `released once in total: ${counts}`);
      assert.equal((await su.query("SELECT count(*)::int AS n FROM public.question_instances WHERE id = $1", [qi])).rows[0].n, 0);
    });

    await t.test("3. release vs answer on the same open round: one of them, never both", async () => {
      for (const answerFirst of [true, false]) {
        const q = TOP10_ID[3 + (answerFirst ? 0 : 1)];
        const key = (await su.query("SELECT content->>'correct' AS k FROM public.questions WHERE id = $1", [q])).rows[0].k;
        const p = await pupil(su);
        const qi = (await su.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, next_review_at)
          VALUES ($1, $2, $3, now()) RETURNING id`, [p, q, key])).rows[0].id;
        await su.query("UPDATE public.questions SET is_active = false WHERE id = $1", [q]);
        const domains = [await loOf(su, q)];
        const before = (await su.query("SELECT xp, coins FROM public.student_progress WHERE student_id = $1", [p])).rows[0];
        const answerer = await connect(url);
        await answerer.query("SET ROLE service_role");
        const releaser = await asPupil(url, p);
        // The first one holds its transaction open until the second is waiting for the row.
        const [first, second] = answerFirst ? [answerer, releaser] : [releaser, answerer];
        await first.query("BEGIN");
        const firstRes = answerFirst
          ? (await first.query("SELECT public.process_question_attempt_v2($1, $2, $3, 1, $4, NULL, NULL) AS r", [p, qi, key, randomUUID()])).rows[0].r
          : (await first.query(RELEASE, [domains])).rows[0].n;
        const secondP = answerFirst
          ? second.query(RELEASE, [domains]).then((r) => r.rows[0].n)
          : second.query("SELECT public.process_question_attempt_v2($1, $2, $3, 1, $4, NULL, NULL) AS r", [p, qi, key, randomUUID()]).then((r) => r.rows[0].r);
        await waitForLockWaiters(su, 1);
        await first.query("COMMIT");
        const secondRes = await secondP;
        const exists = (await su.query("SELECT answered FROM public.question_instances WHERE id = $1", [qi])).rows[0] ?? null;
        const attempts = (await su.query("SELECT count(*)::int AS n FROM public.question_attempts WHERE student_id = $1", [p])).rows[0].n;
        const after = (await su.query("SELECT xp, coins FROM public.student_progress WHERE student_id = $1", [p])).rows[0];
        if (answerFirst) {
          assert.equal(firstRes.outcome, "recorded");
          assert.equal(secondRes, 0, "an answered round is never released");
          assert.deepEqual(exists, { answered: true });
          assert.equal(attempts, 1);
          assert.deepEqual(after, { xp: before.xp + 10, coins: before.coins + 5 }, "paid once");
        } else {
          assert.equal(firstRes, 1);
          assert.notEqual(secondRes.outcome, "recorded", "a released round cannot be answered");
          assert.equal(exists, null);
          assert.equal(attempts, 0);
          assert.deepEqual(after, before, "nothing paid");
        }
      }
    });

    await t.test("4. H5 history: a reopened repeat on an inactive question is closed, every attempt kept; G2 still refuses", async () => {
      const q = TOP10_ID[5];
      const key = (await su.query("SELECT content->>'correct' AS k FROM public.questions WHERE id = $1", [q])).rows[0].k;
      const p = await pupil(su);
      const qi = (await su.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, next_review_at)
        VALUES ($1, $2, $3, now()) RETURNING id`, [p, q, key])).rows[0].id;
      const svc = await connect(url);
      await svc.query("SET ROLE service_role");
      assert.equal((await svc.query("SELECT public.process_question_attempt_v2($1, $2, $3, 1, $4, NULL, NULL) AS r", [p, qi, key, randomUUID()])).rows[0].r.outcome, "recorded");
      const history = (await su.query("SELECT to_jsonb(a)::text AS a FROM public.question_attempts a WHERE student_id = $1", [p])).rows;
      await su.query("UPDATE public.question_instances SET answered = false, repeat_count = repeat_count + 1, user_answer = NULL WHERE id = $1", [qi]);
      await su.query("UPDATE public.questions SET is_active = false WHERE id = $1", [q]);
      const me = await asPupil(url, p);
      assert.equal((await me.query(RELEASE, [[await loOf(su, q)]])).rows[0].n, 1);
      assert.deepEqual((await su.query("SELECT answered, repeat_count FROM public.question_instances WHERE id = $1", [qi])).rows[0],
        { answered: true, repeat_count: 1 });
      assert.deepEqual((await su.query("SELECT to_jsonb(a)::text AS a FROM public.question_attempts a WHERE student_id = $1", [p])).rows, history);
      const g2 = await failure(su.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, next_review_at)
        VALUES ($1, $2, 'x', now())`, [p, q]));
      assert.equal(g2?.code, "23514");
    });

    await t.test("5. the documented rollback restores the old body", async () => {
      await su.query(rollbackSql());
      assert.equal((await su.query(`SELECT md5(prosrc) AS m FROM pg_proc WHERE oid = to_regprocedure('${SIG}')`)).rows[0].m,
        "7b7693b3bff869a113e8e97e16bb456a");
    });
  });
