// docs/operations/h5-k1-readiness-checks.sql — the read-only readiness checks for the H5/K1 activation
// (docs/operations/h5-k1-activation-runbook.md) — and the runbook's exact integrity block (§8), run on
// PGlite over the MERGED chain in production's order. Both SQL texts run UNMODIFIED. Synthetic pupils only.
//
// What this proves:
//   1. The checks file is one SELECT statement: no writing or DDL keyword outside comments and string
//      literals, and no function outside a small read-only set (the Lærlig guard rejects e.g. query_to_xml
//      for execute_sql, so the file must not need it).
//   2. Before H5 (production's applied order today: D-280 part 1, D-278, G1, G2, D-316): every pre check is
//      ok and every H5/K1 check false — without an SQL error although question_attempts does not exist.
//   3. After the full chain (bootstrap → alignment → D-327 → K1): every pre/boot/align/d327/k1 check is ok;
//      cutover (M2, not implemented) is false.
//   4. A missing migration (no D-327, no K1), a partial chain (bootstrap only) and a broken precondition
//      give exactly the expected false rows — never an SQL error.
//   5. A missing constraint, a missing trigger and a disabled trigger are each detected.
//   6. The runbook's integrity block: after a simulated M2 (REVOKE in this test database only) an answered
//      instance without its attempt makes INT-B false; with its attempt every check is ok.
//   7. Running the checks changes nothing: schema fingerprint and every public table's row count are
//      identical before and after.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import {
  D278, D280_PATHS, G1, BOOTSTRAP, ALIGN, TOP10_BEFORE, TOP10_ID, uid, baseSql, migrationSql, FINGERPRINT_SQL,
} from "./helpers/h5-integration-chain.mjs";
import { G2, G2_SEED_SQL } from "./helpers/g2-h5-orders.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CHECKS_SQL = readFileSync(join(ROOT, "docs", "operations", "h5-k1-readiness-checks.sql"), "utf8");
const RUNBOOK = readFileSync(join(ROOT, "docs", "operations", "h5-k1-activation-runbook.md"), "utf8")
  .split("\r\n").join("\n");
const D316 = "20261102100000_release_open_rounds_on_inactive_questions.sql";
const D327 = "20261103100000_question_attempts_history_no_action.sql";
const K1 = "20261103110000_l1_k1_attempt_context.sql";

// Production's applied order today (2026-11-04), then the binding activation order (D-327 / PR #536).
const PROD_TODAY = [D280_PATHS, D278, G1, G2, D316];
const FULL = [...PROD_TODAY, BOOTSTRAP, ALIGN, D327, K1];

// Every Supabase database has the migration ledger; PGlite does not — an empty stand-in.
const LEDGER_SQL = `CREATE SCHEMA IF NOT EXISTS supabase_migrations;
  CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version text PRIMARY KEY, name text, statements text[]);`;

function integritySql() {
  const m = /```sql\n(-- H5-K1 INTEGRITY CHECKS[\s\S]*?)```/.exec(RUNBOOK);
  assert.ok(m, "runbook §8 integrity block");
  return m[1];
}

async function db(order) {
  const d = new PGlite();
  for (const sql of baseSql()) await d.exec(sql);
  await d.exec(LEDGER_SQL);
  await d.exec(G2_SEED_SQL);
  for (const f of order) await d.exec(migrationSql(f));
  return d;
}
async function checks(d) {
  const rows = (await d.query(CHECKS_SQL)).rows;
  return Object.fromEntries(rows.map((r) => [r.check_id, r]));
}
function assertPhase(c, prefix, expected) {
  const rows = Object.values(c).filter((r) => r.check_id.startsWith(prefix));
  assert.ok(rows.length > 0, prefix);
  for (const r of rows) assert.equal(r.ok, expected, `${r.check_id}: ${r.expected} — actual: ${r.actual}`);
}

// One built chain per state, reused (keeps the unit job inside its time budget).
const cache = new Map();
const built = (key, order) => {
  if (!cache.has(key)) cache.set(key, db(order));
  return cache.get(key);
};

test("1. the checks file is a single read-only SELECT using only read-only functions", () => {
  const code = CHECKS_SQL
    .replace(/--[^\n]*/g, " ")             // line comments
    .replace(/'(?:[^']|'')*'/g, "''");     // string literals (labels, regexes)
  const statements = code.split(";").map((s) => s.trim()).filter(Boolean);
  assert.equal(statements.length, 1, "exactly one statement");
  assert.match(statements[0], /^WITH\b/i);
  for (const kw of ["INSERT", "UPDATE", "DELETE", "TRUNCATE", "ALTER", "CREATE", "DROP", "GRANT", "REVOKE",
                    "COPY", "CALL", "VACUUM", "COMMENT", "LOCK", "REFRESH", "MERGE", "EXECUTE", "INTO", "DO"]) {
    assert.doesNotMatch(code, new RegExp(`\\b${kw}\\b`, "i"), `${kw} outside comments/literals`);
  }
  const allowed = new Set(["to_regprocedure", "to_regclass", "md5", "max", "bool_and", "bool_or", "count",
    "coalesce", "left", "concat_ws", "string_agg", "array_agg", "unnest", "format_type", "has_table_privilege",
    "has_function_privilege", "has_column_privilege", "pg_get_constraintdef", "pg_stat_get_live_tuples"]);
  const keywords = new Set(["values", "select", "from", "and", "or", "not", "when", "then", "else", "case", "filter",
    "over", "on", "where", "in", "exists", "any", "all", "array", "as", "join", "with", "ordinality"]);
  for (const m of code.matchAll(/\b([a-z_][a-z0-9_]*)\s*\(/gi)) {
    const name = m[1].toLowerCase();
    const before = code.slice(0, m.index).trimEnd();
    if (before.endsWith(")") || /\b(as|ordinality)$/i.test(before)) continue;   // alias column lists
    if (keywords.has(name)) continue;
    assert.ok(allowed.has(name), `function ${name}() is not in the read-only set`);
  }
  assert.doesNotMatch(code, /\b(query_to_xml|xpath|table_to_xml|cursor_to_xml|set_config|pg_sleep|dblink|lo_\w+)\s*\(/i);
  // the runbook's integrity block is read-only too
  const integrity = integritySql().replace(/--[^\n]*/g, " ").replace(/'(?:[^']|'')*'/g, "''");
  assert.match(integrity.trim(), /^SELECT\b/i);
  for (const kw of ["INSERT", "UPDATE", "DELETE", "TRUNCATE", "ALTER", "CREATE", "DROP", "GRANT", "REVOKE", "INTO"]) {
    assert.doesNotMatch(integrity, new RegExp(`\\b${kw}\\b`, "i"), `${kw} in the integrity block`);
  }
});

test("2. before H5 (production today): pre ok, every H5/K1 check false, no SQL error without question_attempts", async () => {
  const d = await built("pre", PROD_TODAY);
  assert.equal((await d.query("SELECT to_regclass('public.question_attempts') AS t")).rows[0].t, null);
  const c = await checks(d);
  assertPhase(c, "PRE-", true);
  assertPhase(c, "BOOT-", false);
  assertPhase(c, "ALIGN-", false);
  assertPhase(c, "D327-", false);
  assertPhase(c, "K1-", false);
  assert.equal(c["CUT-01"].ok, false);
  assert.equal(c["INT-01"].ok, null);
  assert.equal(c["INT-01"].actual, "tabellen findes ikke");
  assert.equal(c["PRE-06"].actual, "findes ikke");
  assert.equal(c["LED-01"].ok, true);
  assert.equal(c["LED-01"].actual, "ingen");
  assert.equal(c["LED-02"].ok, true);
});

test("3. after the full chain: pre/boot/align/d327/k1 ok; cutover false", async () => {
  const c = await checks(await built("full", FULL));
  for (const p of ["PRE-", "BOOT-", "ALIGN-", "D327-", "K1-"]) assertPhase(c, p, true);
  assert.equal(c["CUT-01"].ok, false, "M2 is not part of the chain");
  assert.match(c["INT-01"].actual, /\(estimat\)$/);
  assert.equal(c["INT-01"].ok, null);
});

test("4a. a missing migration: bootstrap + alignment without D-327 and K1", async () => {
  const c = await checks(await built("noD327", [...PROD_TODAY, BOOTSTRAP, ALIGN]));
  for (const p of ["PRE-", "BOOT-", "ALIGN-"]) assertPhase(c, p, true);
  assertPhase(c, "D327-", false);
  assertPhase(c, "K1-", false);
  assert.equal(c["D327-01"].actual, "confdeltype=c");
});

test("4b. a partial chain: bootstrap only (alignment missing) — _v2 must not be callable yet", async () => {
  const c = await checks(await built("bootOnly", [...PROD_TODAY, BOOTSTRAP]));
  assertPhase(c, "PRE-", true);
  assertPhase(c, "BOOT-", true);
  assert.equal(c["ALIGN-01"].ok, false, "pre-alignment body, no service_role EXECUTE");
  assert.equal(c["ALIGN-02"].ok, true, "process_text_answer_v2 keeps service_role (it does not grade)");
  assertPhase(c, "D327-", false);
  assertPhase(c, "K1-", false);
});

test("4c. a precondition broken: an unknown body on a pinned function makes PRE-02 false", async () => {
  const d = await db(PROD_TODAY);
  // Same signature, argument names and result type; only the body is unknown (an unreviewed change).
  const sig = (await d.query(`SELECT pg_get_function_arguments(p.oid) AS a, pg_get_function_result(p.oid) AS r
    FROM pg_proc p WHERE p.oid = to_regprocedure('public.request_repeat_question(smallint,text[])')`)).rows[0];
  await d.exec(`CREATE OR REPLACE FUNCTION public.request_repeat_question(${sig.a}) RETURNS ${sig.r}
    LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'unreviewed body'; END $$`);
  const c = await checks(d);
  assert.equal(c["PRE-02"].ok, false);
  assert.equal(c["PRE-01"].ok, true);
});

test("5. a missing constraint, a missing trigger and a disabled trigger are detected", async () => {
  const d = await db(FULL);
  await d.exec("ALTER TABLE public.question_attempts DROP CONSTRAINT question_attempts_submission_key");
  let c = await checks(d);
  assert.equal(c["BOOT-03"].ok, false);
  assert.match(c["BOOT-03"].actual, /10 af 11/);
  await d.exec("DROP TRIGGER question_attempts_append_only ON public.question_attempts");
  c = await checks(d);
  assert.equal(c["BOOT-05"].ok, false);
  await d.exec("ALTER TABLE public.question_instances DISABLE TRIGGER question_instances_served_snapshot");
  c = await checks(d);
  assert.equal(c["K1-03"].ok, false);
  assert.equal(c["K1-01"].ok, true, "bodies unchanged");
});

test("6. runbook §8 integrity block: after a simulated M2 a bypassed answer is detected", async () => {
  const d = await db(FULL);
  const pupil = uid(7001);
  await d.exec(`INSERT INTO auth.users VALUES ('${pupil}');
    INSERT INTO public.profiles (id, role, selected_grade) VALUES ('${pupil}', 'student', 5);
    INSERT INTO public.student_progress (student_id, xp, coins, correct_answers, total_correct_answers,
      current_streak, longest_streak, last_activity_date) VALUES ('${pupil}', 0, 0, 0, 0, 0, 0, current_date - 1);`);
  const serve = async (i) => (await d.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, next_review_at)
    VALUES ($1, $2, $3, now()) RETURNING id`, [pupil, TOP10_ID[i], TOP10_BEFORE[i].content.correct])).rows[0].id;
  const integrity = async () => Object.fromEntries((await d.query(integritySql())).rows.map((r) => [r.check_id, r]));
  const qi1 = await serve(0);
  await d.exec("SET ROLE service_role");
  try {
    await d.query("SELECT public.process_question_attempt_v2($1,$2,$3,$4,$5,NULL,NULL,$6,$7) AS r",
      [pupil, qi1, TOP10_BEFORE[0].content.correct, 1, randomUUID(), "quiz_v1", 0]);
  } finally { await d.exec("RESET ROLE"); }
  // M2 in THIS test database only (the cutover itself has no migration yet)
  await d.exec(`REVOKE EXECUTE ON FUNCTION public.process_question_attempt(uuid,uuid,text,bigint) FROM service_role;
                REVOKE EXECUTE ON FUNCTION public.process_text_answer(uuid,uuid,text,boolean) FROM service_role;`);
  assert.equal((await checks(d))["CUT-01"].ok, true);
  let i = await integrity();
  assert.equal(i["INT-A"].actual, "1");
  for (const id of ["INT-B", "INT-C", "INT-D", "INT-E"]) assert.equal(i[id].ok, true, `${id}: ${i[id].actual}`);
  // an answer that bypassed the log (what M2 makes impossible through the API)
  const qi2 = await serve(1);
  await d.query("UPDATE public.question_instances SET answered = true, was_correct = true, answered_at = now() WHERE id = $1", [qi2]);
  i = await integrity();
  assert.equal(i["INT-B"].ok, false);
  assert.equal(i["INT-B"].actual, "1");
});

test("7. running the checks changes nothing (schema fingerprint and row counts)", async () => {
  for (const d of [await built("pre", PROD_TODAY), await built("full", FULL)]) {
    const tables = (await d.query(`SELECT relname FROM pg_class
      WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' ORDER BY relname`)).rows.map((r) => r.relname);
    const counts = async () => {
      const out = {};
      for (const t of tables) out[t] = (await d.query(`SELECT count(*)::int AS n FROM public."${t}"`)).rows[0].n;
      return out;
    };
    const beforeF = (await d.query(FINGERPRINT_SQL)).rows[0].f;
    const beforeN = await counts();
    await checks(d);
    await checks(d);
    assert.deepEqual((await d.query(FINGERPRINT_SQL)).rows[0].f, beforeF);
    assert.deepEqual(await counts(), beforeN);
  }
});
