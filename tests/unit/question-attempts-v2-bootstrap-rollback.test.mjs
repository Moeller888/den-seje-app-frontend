// PROOF for the H5 bootstrap rollback runbook (docs/operations/question-attempts-v2-bootstrap-rollback.md):
// the SQL block is read from that file verbatim and run on a database built like production — the
// answer chain, D-280 part 1, D-278, G1, D-290 G2 (with its two questions) and D-316 — plus the bootstrap
// (20261101190000) and, where named, the alignment (20261101190100), D-327 and K1. Synthetic pupils only.
//
//   1. after the bootstrap alone, and after bootstrap + alignment: the public schema is EXACTLY the
//      pre-H5 schema again (fingerprint by the server's own deparser) and every row of every public table
//      is unchanged;
//   2. a re-run on the pre-H5 schema changes nothing; bootstrap and alignment then apply again and give
//      the same H5 schema as the first time;
//   3. refused, with nothing changed: an attempt in question_attempts; K1 applied; D-327 applied; an
//      unknown view on question_attempts; an unknown trigger on question_instances; an unknown function
//      that uses H5; a partial H5 schema;
//   4. a failure in the middle of the drops (an event trigger refuses the last statement) rolls the whole
//      block back;
//   5. PostgreSQL only (two sessions): a competing lock on question_instances makes the block stop after
//      lock_timeout (5 s) with 55P03 and change nothing.
//
// Database: in CI the unit job's PostgreSQL 17.6 service (LEVEL_ENGINE_PG_URL, LEVEL_ENGINE_PG_REQUIRED=1:
// the test FAILS there without it), one throwaway database per case, dropped afterwards. Without
// LEVEL_ENGINE_PG_URL (a developer machine) it runs on PGlite and skips case 5 with the reason.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import {
  D280_PATHS, D278, G1, BOOTSTRAP, ALIGN, TOP10_ID, uid, baseSql, migrationSql, FINGERPRINT_SQL,
} from "./helpers/h5-integration-chain.mjs";
import { G2, G2_SEED_SQL } from "./helpers/g2-h5-orders.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const D316 = "20261102100000_release_open_rounds_on_inactive_questions.sql";
const D327 = "20261103100000_question_attempts_history_no_action.sql";
const K1 = "20261103110000_l1_k1_attempt_context.sql";
// Production's applied order up to H5 (G1 06:46, G2 07:18, D-316 12:36 on 2026-11-02).
const PRE_H5 = Object.freeze([D280_PATHS, D278, G1, G2, D316]);

const RUNBOOK = readFileSync(join(ROOT, "docs", "operations", "question-attempts-v2-bootstrap-rollback.md"), "utf8").split("\r\n").join("\n");
const ROLLBACK = (() => {
  const blocks = [...RUNBOOK.matchAll(/```sql\n([\s\S]*?)```/g)].map((m) => m[1]);
  assert.equal(blocks.length, 1, "the runbook holds exactly one SQL block");
  assert.match(blocks[0], /^-- ROLLBACK H5 BOOTSTRAP/);
  return blocks[0];
})();

// ── Which database ──────────────────────────────────────────────────────────────────────────────────
const PG_URL = process.env.LEVEL_ENGINE_PG_URL ?? "";
const REQUIRED = process.env.LEVEL_ENGINE_PG_REQUIRED === "1";
function loadPg() {
  for (const base of [process.env.LEVEL_ENGINE_PG_MODULE_DIR, ROOT].filter(Boolean)) {
    try { return createRequire(join(base, "package.json"))("pg"); } catch { /* next */ }
  }
  return null;
}
const pg = PG_URL ? loadPg() : null;
const ON_PG = Boolean(PG_URL && pg);

test("a real PostgreSQL server is present where it is required (CI)", { skip: !REQUIRED }, () => {
  assert.ok(ON_PG, `LEVEL_ENGINE_PG_REQUIRED=1, but ${PG_URL ? "the pg client cannot be resolved" : "LEVEL_ENGINE_PG_URL is not set"}`);
});

test("the runbook's block is one DO block with lock_timeout, no CASCADE and an explicit pre-H5 branch", () => {
  assert.equal((ROLLBACK.match(/^DO \$h5_rollback\$/gm) ?? []).length, 1);
  assert.match(ROLLBACK, /\$h5_rollback\$;\s*$/);
  // Nothing outside the block: only comment lines before it.
  assert.equal(ROLLBACK.slice(0, ROLLBACK.indexOf("DO $h5_rollback$")).split("\n").filter((l) => l.trim() && !l.startsWith("--")).length, 0);
  assert.match(ROLLBACK, /PERFORM set_config\('lock_timeout', '5s', true\);/);
  assert.equal(/\bCASCADE\b/i.test(ROLLBACK.replace(/--.*$/gm, "").replace(/ON DELETE CASCADE/g, "")), false, "no DROP … CASCADE");
  assert.match(ROLLBACK, /IF v_present = 0 THEN\s*RAISE NOTICE [^;]+;\s*RETURN;/);
  assert.match(RUNBOOK, /Kun før H5-aktivering/);
  assert.match(RUNBOOK, /særskilte godkendelse/);
});

// One database = { q(sql, params) → rows, x(script), end() }.
const created = [];
const opened = [];
async function newDb(order) {
  let db;
  if (ON_PG) {
    const admin = new pg.Client({ connectionString: PG_URL });
    await admin.connect();
    const name = `h5_rb_${Date.now()}_${created.length}`;
    await admin.query(`CREATE DATABASE ${name} ENCODING 'UTF8' TEMPLATE template0`);
    await admin.end();
    created.push(name);
    db = await connectTo(name);
  } else {
    const lite = new PGlite();
    db = { q: async (s, p) => (await lite.query(s, p)).rows, x: async (s) => { await lite.exec(s); }, end: () => lite.close(),
      notices: [] };
    opened.push(db);
  }
  for (const sql of baseSql({ realServer: ON_PG })) await db.x(sql);
  await db.x(G2_SEED_SQL);
  for (const f of order) await db.x(migrationSql(f));
  return db;
}
async function connectTo(name) {
  const u = new globalThis.URL(PG_URL);
  u.pathname = `/${name}`;
  const c = new pg.Client({ connectionString: u.toString() });
  await c.connect();
  const db = { q: async (s, p) => (await c.query(s, p)).rows, x: async (s) => { await c.query(s); }, end: () => c.end().catch(() => {}),
    notices: [], name };
  c.on("notice", (n) => db.notices.push(n.message));
  opened.push(db);
  return db;
}
async function teardown() {
  for (const db of opened.splice(0)) await db.end();
  if (!created.length) return;
  const admin = new pg.Client({ connectionString: PG_URL });
  await admin.connect();
  for (const name of created.splice(0)) await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.end();
}

const fingerprint = async (db) => (await db.q(FINGERPRINT_SQL))[0].f;
// Every row of every table in public, except question_attempts (which the rollback removes, empty).
async function rows(db) {
  const tables = (await db.q(`SELECT c.relname FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
    AND c.relname <> 'question_attempts' ORDER BY 1`)).map((r) => r.relname);
  const out = {};
  for (const t of tables) {
    out[t] = (await db.q(`SELECT count(*)::int AS n, md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) AS h FROM public.${t} x`))[0];
  }
  return out;
}
const state = async (db) => ({ schema: await fingerprint(db), rows: await rows(db) });
const failure = async (p) => { try { await p; return null; } catch (e) { return { code: e.code, message: e.message }; } };

// Synthetic pupils with open and answered rounds, so the row proof has something to prove.
async function seedPupils(db) {
  for (let i = 0; i < 3; i++) {
    const p = uid(60000 + i);
    await db.q("INSERT INTO auth.users VALUES ($1)", [p]);
    await db.q("INSERT INTO public.profiles (id, role, selected_grade) VALUES ($1, 'student', 7)", [p]);
    await db.q(`INSERT INTO public.student_progress (student_id, xp, coins, correct_answers, total_correct_answers,
      current_streak, longest_streak, last_activity_date) VALUES ($1, ${10 * i}, ${5 * i}, ${i}, ${i}, 1, 1, current_date - 1)`, [p]);
    await db.q(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, answered, was_correct, answered_at)
      VALUES ($1, $2, 'x', true, false, now() - interval '1 day')`, [p, TOP10_ID[i]]);
    await db.q(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, next_review_at)
      VALUES ($1, $2, 'y', now())`, [p, TOP10_ID[i + 3]]);
  }
}
async function prepared(extra) {
  const db = await newDb(PRE_H5);
  await seedPupils(db);
  const pre = await state(db);
  for (const f of extra) await db.x(migrationSql(f));
  return { db, pre };
}
const presentCount = async (db) => (await db.q(`SELECT (to_regclass('public.question_attempts') IS NOT NULL)::int
  + (to_regprocedure('public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text)') IS NOT NULL)::int
  + (to_regprocedure('public.question_instances_round_guard()') IS NOT NULL)::int AS n`))[0].n;

test("H5 bootstrap rollback (runbook block) — exact, data-safe, guarded, atomic", { timeout: 600000 }, async (t) => {
  t.after(teardown);

  for (const [label, extra] of [["bootstrap alone", [BOOTSTRAP]], ["bootstrap + alignment", [BOOTSTRAP, ALIGN]]]) {
    await t.test(`1. after ${label}: exactly the pre-H5 schema, every row unchanged; 2. re-run and re-apply`, async () => {
      const { db, pre } = await prepared(extra);
      const h5 = await fingerprint(db);
      assert.notDeepEqual(h5, pre.schema);
      await db.x(ROLLBACK);
      assert.deepEqual(await state(db), pre, "schema and rows are exactly the pre-H5 state");
      // Re-run: nothing changes (the explicit pre-H5 branch).
      await db.x(ROLLBACK);
      assert.deepEqual(await state(db), pre);
      if (ON_PG) assert.ok(db.notices.some((n) => n.includes("allerede i før-H5-tilstanden")), db.notices.join("\n"));
      // The files apply again, unchanged, and give the same H5 schema.
      for (const f of extra) await db.x(migrationSql(f));
      assert.deepEqual(await fingerprint(db), h5);
      assert.deepEqual((await state(db)).rows, pre.rows);
    });
  }

  // Every refusal: the error names the cause and the database is exactly as before the attempt.
  const refused = async (db, pattern) => {
    const before = await state(db);
    const f = await failure(db.x(ROLLBACK));
    assert.ok(f, "the rollback must refuse");
    assert.match(f.message, pattern);
    assert.deepEqual(await state(db), before, "nothing changed");
  };

  await t.test("3a. an attempt in question_attempts: refused, nothing changed", async () => {
    const { db } = await prepared([BOOTSTRAP, ALIGN]);
    const p = uid(60000);
    const [{ id }] = await db.q("SELECT id FROM public.question_instances WHERE student_id = $1 AND NOT answered", [p]);
    const r = (await db.q("SELECT public.process_question_attempt_v2($1, $2, 'svar', 1, $3, NULL, NULL) AS r", [p, id, uid(61000)]))[0].r;
    assert.equal(r.outcome, "recorded");
    assert.equal((await db.q("SELECT count(*)::int AS n FROM public.question_attempts"))[0].n, 1);
    await refused(db, /question_attempts har 1 række/);
  });

  await t.test("3b. K1 applied: refused until K1 is rolled back", async () => {
    const { db } = await prepared([BOOTSTRAP, ALIGN, D327, K1]);
    await refused(db, /L1 K1 .* rul K1 tilbage først/);
  });

  await t.test("3c. D-327 applied: refused until D-327 is rolled back", async () => {
    const { db } = await prepared([BOOTSTRAP, ALIGN, D327]);
    await refused(db, /D-327 .* rul D-327 tilbage først/);
  });

  await t.test("3d. unknown dependencies and objects: refused, nothing removed implicitly", async () => {
    const { db } = await prepared([BOOTSTRAP, ALIGN]);
    await db.x("CREATE VIEW public.attempts_view AS SELECT id FROM public.question_attempts");
    await refused(db, /ukendt objekt afhænger af H5-skemaet/);
    await db.x("DROP VIEW public.attempts_view");
    await db.x(`CREATE FUNCTION public.read_attempts() RETURNS bigint LANGUAGE sql AS $f$ SELECT count(*) FROM public.question_attempts $f$`);
    await refused(db, /ukendt objekt afhænger af H5-skemaet/);
    await db.x("DROP FUNCTION public.read_attempts()");
    await db.x(`CREATE FUNCTION public.qi_noop() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN RETURN NEW; END $f$;
      CREATE TRIGGER qi_noop BEFORE UPDATE ON public.question_instances FOR EACH ROW EXECUTE FUNCTION public.qi_noop()`);
    await refused(db, /triggerne på question_attempts og question_instances/);
    await db.x("DROP TRIGGER qi_noop ON public.question_instances; DROP FUNCTION public.qi_noop()");
    // A partial H5 schema (one object missing) is an unknown state.
    await db.x("DROP FUNCTION public.process_text_answer_v2(uuid, uuid, text, boolean, integer, uuid, text, text)");
    await refused(db, /findes kun delvist \(8 af 9 objekter\)/);
  });

  await t.test("4. a failure in the middle of the drops rolls the whole block back", async () => {
    const { db } = await prepared([BOOTSTRAP, ALIGN]);
    // The last statement (ALTER TABLE … DROP CONSTRAINT) is refused after six objects were already dropped.
    await db.x(`CREATE SCHEMA rbtest;
      CREATE FUNCTION rbtest.refuse_alter() RETURNS event_trigger LANGUAGE plpgsql AS $f$
        BEGIN IF tg_tag = 'ALTER TABLE' THEN RAISE EXCEPTION 'injected failure in the last statement'; END IF; END $f$;
      CREATE EVENT TRIGGER rbtest_refuse_alter ON ddl_command_start EXECUTE FUNCTION rbtest.refuse_alter()`);
    const before = await state(db);
    const f = await failure(db.x(ROLLBACK));
    assert.ok(f && /injected failure in the last statement/.test(f.message), JSON.stringify(f));
    assert.deepEqual(await state(db), before, "all six earlier drops were rolled back too");
    assert.equal(await presentCount(db), 3);
    await db.x("DROP EVENT TRIGGER rbtest_refuse_alter; DROP SCHEMA rbtest CASCADE");
    await db.x(ROLLBACK);
    assert.equal(await presentCount(db), 0);
  });

  await t.test("5. a competing lock: 55P03 after lock_timeout, nothing changed", { skip: ON_PG ? false : "needs two sessions: PostgreSQL only (CI)" }, async () => {
    const { db } = await prepared([BOOTSTRAP, ALIGN]);
    const holder = await connectTo(db.name);
    await holder.x("BEGIN");
    await holder.q("SELECT count(*) FROM public.question_instances"); // ACCESS SHARE until COMMIT
    const before = await state(db);
    const started = Date.now();
    const f = await failure(db.x(ROLLBACK));
    const waited = Date.now() - started;
    await holder.x("COMMIT");
    assert.ok(f, "the rollback must stop");
    assert.equal(f.code, "55P03", JSON.stringify(f));
    assert.ok(waited >= 4500 && waited < 30000, `waited ${waited} ms`);
    assert.deepEqual(await state(db), before, "nothing changed");
    // Once the lock is gone, the same block succeeds.
    await db.x(ROLLBACK);
    assert.equal(await presentCount(db), 0);
  });
});
