// REAL PostgreSQL 17 proof for the D-290 G2 × H5 compatibility (20261101140000 × 20261101190000 /
// 20261101190100) — the PGlite proof (question-attempts-v2-g2-compat.test.mjs) on the server version
// production runs, with the SQLSTATEs a real server returns:
//
//   0. G2 → H5, H5 → G2 and the repository's file order all apply, unmodified, and end in the same
//      public schema (fingerprint by the server's own deparser).
//   1. A re-run of the bootstrap before the alignment changes nothing.
//   2. G2's guard with EXECUTE for authenticated stops the bootstrap (P0001) and changes nothing.
//   3. Both guards at once: G2's guard refuses a new open round on an inactive question (23514,
//      "open round refused"); H5's round guard refuses a reopen that skips the round (23514,
//      question_instances_round_guard); a correct reopen and _v2's answer pass both.
//   4. H5's rollback restores the G2-only schema and the files apply again; G2's guard rollback
//      leaves exactly the H5-only schema.
//
// Runs only when LEVEL_ENGINE_PG_URL points at a disposable PostgreSQL server; otherwise SKIPPED —
// unless LEVEL_ENGINE_PG_REQUIRED=1 (CI), where a missing server FAILS. It creates its own databases
// and drops them afterwards. Synthetic pupils only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  D280_PATHS, D278, G1, BOOTSTRAP, ALIGN, PROD_ORDER, TOP10_ID, uid, baseSql, migrationSql, FINGERPRINT_SQL, ROLLBACK_SQL,
} from "./helpers/h5-integration-chain.mjs";
import {
  G2, G2_FUNCTION, ORDERS, G2_BEFORE_H5, H5_BEFORE_G2, G2_IDS, G2_SEED_SQL, G2_GUARD_ROLLBACK_SQL,
} from "./helpers/g2-h5-orders.mjs";

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
async function createDb(order) {
  const admin = new pg.Client({ connectionString: URL });
  await admin.connect();
  const name = `g2_h5_${Date.now()}_${created.length}`;
  await admin.query(`CREATE DATABASE ${name} ENCODING 'UTF8' TEMPLATE template0`);
  await admin.end();
  created.push(name);
  const u = new globalThis.URL(URL);
  u.pathname = `/${name}`;
  const c = new pg.Client({ connectionString: u.toString() });
  opened.push(c);
  await c.connect();
  for (const sql of baseSql({ realServer: true })) await c.query(sql);
  await c.query(G2_SEED_SQL);
  for (const f of order) await c.query(migrationSql(f));
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

test("real PostgreSQL 17: G2 and H5 apply in either order, the bootstrap accepts only G2's reviewed guard, both guards hold",
  { skip: SKIP, timeout: 300000 }, async (t) => {
    t.after(teardown);

    await t.test("0. every order ends in the same public schema", async () => {
      const prints = [];
      for (const order of Object.values(ORDERS)) prints.push(await fingerprint(await createDb(order)));
      for (const p of prints.slice(1)) assert.deepEqual(p, prints[0]);
    });

    await t.test("1. a re-run of the bootstrap before the alignment changes nothing", async () => {
      const c = await createDb([D280_PATHS, D278, G1, G2, BOOTSTRAP]);
      const before = await fingerprint(c);
      await c.query(migrationSql(BOOTSTRAP));
      assert.deepEqual(await fingerprint(c), before);
    });

    await t.test("2. G2's guard with EXECUTE for authenticated stops the bootstrap (P0001), nothing changed", async () => {
      const c = await createDb([D280_PATHS, D278, G1, G2]);
      await c.query(`GRANT EXECUTE ON FUNCTION ${G2_FUNCTION} TO authenticated`);
      const before = await fingerprint(c);
      const f = await failure(c.query(migrationSql(BOOTSTRAP)));
      assert.equal(f?.code, "P0001");
      assert.match(f.message, /D-290 G2-værnet findes, men ikke præcis som gennemgået/);
      assert.deepEqual(await fingerprint(c), before);
    });

    await t.test("3. both guards at once, in either order", async () => {
      for (const order of [G2_BEFORE_H5, H5_BEFORE_G2]) {
        const c = await createDb(order);
        const p = uid(900 + created.length);
        await c.query("INSERT INTO auth.users VALUES ($1)", [p]);
        await c.query("INSERT INTO public.profiles (id, role, selected_grade) VALUES ($1, 'student', 5)", [p]);
        await c.query(`INSERT INTO public.student_progress (student_id, xp, coins, correct_answers, total_correct_answers,
          current_streak, longest_streak, last_activity_date) VALUES ($1, 100, 50, 7, 7, 1, 1, current_date - 1)`, [p]);
        const insert = (q, answered) => c.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer,
          answered, next_review_at) VALUES ($1, $2, 'x', $3, now()) RETURNING id`, [p, q, answered]);

        const g2Open = await failure(insert(G2_IDS[0], false));
        assert.equal(g2Open?.code, "23514");
        assert.match(g2Open.message, /open round refused/);

        const active = TOP10_ID[0];
        const key = (await c.query("SELECT content->>'correct' AS k FROM public.questions WHERE id = $1", [active])).rows[0].k;
        const qi = (await c.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, answered,
          next_review_at) VALUES ($1, $2, $3, true, now()) RETURNING id`, [p, active, key])).rows[0].id;
        const skip = await failure(c.query("UPDATE public.question_instances SET answered = false WHERE id = $1", [qi]));
        assert.equal(skip?.code, "23514");
        assert.match(skip.message, /question_instances_round_guard/);
        await c.query("UPDATE public.question_instances SET answered = false, repeat_count = 1 WHERE id = $1", [qi]);
        await c.query("SET ROLE service_role");
        const r = (await c.query("SELECT public.process_question_attempt_v2($1, $2, $3, 2, $4, NULL, NULL) AS r",
          [p, qi, key, randomUUID()])).rows[0].r;
        await c.query("RESET ROLE");
        assert.deepEqual([r.outcome, r.status, r.round_no], ["recorded", "correct", 2]);
      }
    });

    await t.test("4. rollbacks: H5's restores the G2-only schema and re-applies; G2's guard rollback leaves the H5-only schema", async () => {
      const g2Only = await fingerprint(await createDb([D280_PATHS, D278, G1, G2]));
      const c = await createDb(G2_BEFORE_H5);
      const full = await fingerprint(c);
      await c.query(ROLLBACK_SQL);
      assert.deepEqual(await fingerprint(c), g2Only);
      await c.query(migrationSql(BOOTSTRAP));
      await c.query(migrationSql(ALIGN));
      assert.deepEqual(await fingerprint(c), full);
      await c.query(G2_GUARD_ROLLBACK_SQL);
      assert.deepEqual(await fingerprint(c), await fingerprint(await createDb(PROD_ORDER)));
    });
  });
