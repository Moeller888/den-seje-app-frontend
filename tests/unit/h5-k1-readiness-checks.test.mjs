// docs/operations/h5-k1-readiness-checks.sql — the read-only readiness checks for the H5/K1 activation
// (docs/operations/h5-k1-activation-runbook.md) — and the runbook's two integrity blocks (§8), run on PGlite
// over the MERGED chain in production's order. The SQL texts run UNMODIFIED. Synthetic pupils only; no
// production data and no production answers anywhere.
//
// What this proves:
//   1. The checks file is one SELECT statement: no writing or DDL keyword outside comments and string
//      literals, and no function outside a small read-only set (the Lærlig guard rejects e.g. query_to_xml
//      for execute_sql). Both runbook integrity blocks are read-only too.
//   2. Before H5 (production's applied order today: D-280 part 1, D-278, G1, G2, D-316): every pre check ok,
//      every H5/K1 check false, GATE-A1 the only open gate — no SQL error although question_attempts is absent.
//   3. After the full chain (bootstrap → alignment → D-327 → K1, ledger as apply_migration writes it): every
//      pre/boot/align/d327/k1 check ok; cutover false; GATE-M2 the only open gate.
//   4. A missing migration (no D-327/K1), a partial chain (bootstrap only) and a broken precondition give
//      exactly the expected false rows and gates — never an SQL error.
//   5. A missing constraint, a missing trigger and a disabled trigger are each detected.
//   6. INT-B and the cutover time T (runbook §8/§9.1):
//      a. a legacy answer before H5 is used: INT-B0 0, INT-B not evaluable (NULL), never a pass;
//      b. a legacy answer between A8 and M2: INT-B0 counts it (information only, NULL);
//      c. after M2 WITH a synthetic registration of T after that answer: block 2 INT-B = 0 (true);
//      d. a legacy answer after the known synthetic T: block 2 INT-B false;
//      e. M2 WITHOUT a registration of T: CUT-02 false (NO-GO).
//   7. Running the checks changes nothing: schema fingerprint and every public table's row count.
//   8. Ledger and gates: schema ahead of the ledger, a wrong migration name, versions in the wrong order and
//      a missing step all make LED-01 false and close every gate; an ok = NULL row is never a pass (a
//      missing pinned function makes PRE-01 NULL and GATE-A1 false); the row count matches runbook §4.
//   9. CUT-01 means the legacy path is EFFECTIVELY closed (runbook §9.2), not only that service_role lost
//      EXECUTE: it turns false on a PUBLIC grant (read from the ACL, PUBLIC is not a role), a direct grant to
//      a runtime role, role inheritance, SET ROLE from a NOINHERIT login role (authenticator → service_role),
//      another non-superuser role holding EXECUTE, a wrapper function, a dependent view, and a DROP/CREATE
//      under production's default privileges — and true again once each path is closed.
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
// The names runbook §3 prescribes for apply_migration.
const LEDGER_NAME = {
  [BOOTSTRAP]: "question_attempts_v2_bootstrap", [ALIGN]: "question_attempts_v2_align_grading",
  [D327]: "question_attempts_history_no_action", [K1]: "l1_k1_attempt_context",
};
// Every Supabase database has the migration ledger; PGlite does not — a stand-in with the same columns.
const LEDGER_SQL = `CREATE SCHEMA IF NOT EXISTS supabase_migrations;
  CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version text PRIMARY KEY, name text, statements text[]);`;
// The cutover registration contract of runbook §9.1 — a SYNTHETIC stand-in for what the M2 PR will create.
const CUTOVER_SQL = `CREATE TABLE public.answer_path_cutovers (cutover text PRIMARY KEY CHECK (cutover IN ('h5_m2')),
  effective_at timestamptz NOT NULL, closed_before timestamptz NOT NULL, migration text NOT NULL,
  CHECK (closed_before <= effective_at));`;
const PQA = "public.process_question_attempt(uuid,uuid,text,bigint)";
const PTA = "public.process_text_answer(uuid,uuid,text,boolean)";
const M2_SQL = `REVOKE EXECUTE ON FUNCTION ${PQA} FROM service_role;
  REVOKE EXECUTE ON FUNCTION ${PTA} FROM service_role;`;

function block(marker) {
  const m = new RegExp("```sql\\n(-- " + marker + "[\\s\\S]*?)```").exec(RUNBOOK);
  assert.ok(m, `runbook block ${marker}`);
  return m[1];
}
const INTEGRITY_1 = () => block("H5-K1 INTEGRITY CHECKS");
const INTEGRITY_2 = () => block("H5-K1 INTEGRITY AFTER M2");

// Builds a database; `ledger` records the applied H5/K1 steps as apply_migration would (version order).
async function db(order, { ledger = true } = {}) {
  const d = new PGlite();
  for (const sql of baseSql()) await d.exec(sql);
  await d.exec(LEDGER_SQL);
  await d.exec(G2_SEED_SQL);
  let v = 20261105000000;
  for (const f of order) {
    await d.exec(migrationSql(f));
    if (ledger && LEDGER_NAME[f]) {
      await d.query("INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ($1, $2)", [String(v++), LEDGER_NAME[f]]);
    }
  }
  return d;
}
const rowsOf = async (d, sql) => Object.fromEntries((await d.query(sql)).rows.map((r) => [r.check_id, r]));
const checks = (d) => rowsOf(d, CHECKS_SQL);
function assertPhase(c, prefix, expected) {
  const rows = Object.values(c).filter((r) => r.check_id.startsWith(prefix));
  assert.ok(rows.length > 0, prefix);
  for (const r of rows) assert.equal(r.ok, expected, `${r.check_id}: ${r.expected} — actual: ${r.actual}`);
}
const GATES = ["GATE-A1", "GATE-A2", "GATE-A3", "GATE-A4", "GATE-M2"];
function assertOnlyGate(c, open) {
  for (const g of GATES) assert.equal(c[g].ok, g === open, `${g} (${c[g].actual})`);
}

// One built chain per state, reused (keeps the unit job inside its time budget).
const cache = new Map();
const built = (key, order) => {
  if (!cache.has(key)) cache.set(key, db(order));
  return cache.get(key);
};

// A synthetic pupil and serving/answering helpers (the paths production uses, run in PGlite only).
async function pupil(d, n) {
  const p = uid(n);
  await d.exec(`INSERT INTO auth.users VALUES ('${p}');
    INSERT INTO public.profiles (id, role, selected_grade) VALUES ('${p}', 'student', 5);
    INSERT INTO public.student_progress (student_id, xp, coins, correct_answers, total_correct_answers,
      current_streak, longest_streak, last_activity_date) VALUES ('${p}', 0, 0, 0, 0, 0, 0, current_date - 1);`);
  return p;
}
const serve = async (d, p, i) => (await d.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, next_review_at)
  VALUES ($1, $2, $3, now()) RETURNING id`, [p, TOP10_ID[i], TOP10_BEFORE[i].content.correct])).rows[0].id;
async function asService(d, sql, params) {
  await d.exec("SET ROLE service_role");
  try { return (await d.query(sql, params)).rows; } finally { await d.exec("RESET ROLE"); }
}
const answerV2 = (d, p, qi, i) => asService(d, "SELECT public.process_question_attempt_v2($1,$2,$3,$4,$5,NULL,NULL,$6,$7) AS r",
  [p, qi, TOP10_BEFORE[i].content.correct, 1, randomUUID(), "quiz_v1", 0]);
const answerLegacy = (d, p, qi, i) => asService(d, "SELECT public.process_question_attempt($1,$2,$3,$4) AS r",
  [p, qi, TOP10_BEFORE[i].content.correct, 0]);

test("1. the checks file and both integrity blocks are read-only", () => {
  const strip = (sql) => sql.replace(/--[^\n]*/g, " ").replace(/'(?:[^']|'')*'/g, "''");
  const code = strip(CHECKS_SQL);
  const statements = code.split(";").map((s) => s.trim()).filter(Boolean);
  assert.equal(statements.length, 1, "exactly one statement");
  assert.match(statements[0], /^WITH\b/i);
  const writing = ["INSERT", "UPDATE", "DELETE", "TRUNCATE", "ALTER", "CREATE", "DROP", "GRANT", "REVOKE",
    "COPY", "CALL", "VACUUM", "COMMENT", "LOCK", "REFRESH", "MERGE", "EXECUTE", "INTO", "DO"];
  for (const kw of writing) assert.doesNotMatch(code, new RegExp(`\\b${kw}\\b`, "i"), `${kw} outside comments/literals`);
  const allowed = new Set(["to_regprocedure", "to_regclass", "md5", "max", "bool_and", "bool_or", "count",
    "coalesce", "left", "concat_ws", "string_agg", "array_agg", "unnest", "format_type", "has_table_privilege",
    "has_function_privilege", "has_column_privilege", "pg_get_constraintdef", "pg_stat_get_live_tuples",
    "pg_has_role", "aclexplode", "acldefault"]);
  const keywords = new Set(["values", "select", "from", "and", "or", "not", "when", "then", "else", "case", "filter",
    "over", "on", "where", "in", "exists", "any", "all", "array", "as", "join", "with", "ordinality"]);
  for (const m of code.matchAll(/\b([a-z_][a-z0-9_]*)\s*\(/gi)) {
    const name = m[1].toLowerCase();
    const before = code.slice(0, m.index).trimEnd();
    if (before.endsWith(")") || /\b(as|ordinality)$/i.test(before)) continue;   // alias column lists
    if (keywords.has(name)) continue;
    assert.ok(allowed.has(name), `function ${name}() is not in the read-only set`);
  }
  for (const b of [INTEGRITY_1(), INTEGRITY_2(), block("H5-K1 M2 CALL PATHS")]) {
    const s = strip(b);
    assert.match(s.trim(), /^SELECT\b/i);
    for (const kw of ["INSERT", "UPDATE", "DELETE", "TRUNCATE", "ALTER", "CREATE", "DROP", "GRANT", "REVOKE", "INTO"]) {
      assert.doesNotMatch(s, new RegExp(`\\b${kw}\\b`, "i"), `${kw} in an integrity block`);
    }
  }
});

test("2. before H5 (production today): pre ok, every H5/K1 check false, only GATE-A1 open", async () => {
  const d = await built("pre", PROD_TODAY);
  assert.equal((await d.query("SELECT to_regclass('public.question_attempts') AS t")).rows[0].t, null);
  const c = await checks(d);
  assertPhase(c, "PRE-", true);
  for (const p of ["BOOT-", "ALIGN-", "D327-", "K1-"]) assertPhase(c, p, false);
  assert.equal(c["CUT-01"].ok, false);
  assert.equal(c["CUT-02"].ok, null);
  assert.equal(c["INT-01"].actual, "tabellen findes ikke");
  assert.equal(c["LED-01"].ok, true);
  assert.match(c["LED-01"].actual, /^ledger=ingen; skema-fase=0$/);
  assert.equal(c["LED-02"].ok, true);
  assertOnlyGate(c, "GATE-A1");
});

test("3. after the full chain: pre/boot/align/d327/k1 ok; cutover false; only GATE-M2 open", async () => {
  const c = await checks(await built("full", FULL));
  for (const p of ["PRE-", "BOOT-", "ALIGN-", "D327-", "K1-"]) assertPhase(c, p, true);
  assert.equal(c["CUT-01"].ok, false, "M2 is not part of the chain");
  assert.equal(c["LED-01"].ok, true);
  assert.match(c["LED-01"].actual, /skema-fase=4$/);
  assert.match(c["INT-01"].actual, /\(estimat\)$/);
  assertOnlyGate(c, "GATE-M2");
});

test("4a. a missing migration: bootstrap + alignment without D-327 and K1 — GATE-A3 open", async () => {
  const c = await checks(await built("noD327", [...PROD_TODAY, BOOTSTRAP, ALIGN]));
  for (const p of ["PRE-", "BOOT-", "ALIGN-"]) assertPhase(c, p, true);
  assertPhase(c, "D327-", false);
  assertPhase(c, "K1-", false);
  assert.equal(c["D327-01"].actual, "confdeltype=c");
  assertOnlyGate(c, "GATE-A3");
});

test("4b. a partial chain: bootstrap only — _v2 not callable yet, GATE-A2 open", async () => {
  const c = await checks(await built("bootOnly", [...PROD_TODAY, BOOTSTRAP]));
  assertPhase(c, "PRE-", true);
  assertPhase(c, "BOOT-", true);
  assert.equal(c["ALIGN-01"].ok, false, "pre-alignment body, no service_role EXECUTE");
  assert.equal(c["ALIGN-02"].ok, true, "process_text_answer_v2 keeps service_role (it does not grade)");
  assertPhase(c, "D327-", false);
  assertPhase(c, "K1-", false);
  assertOnlyGate(c, "GATE-A2");
});

test("4c. missing prerequisites give NO-GO: an unreviewed body, or G1 not applied", async () => {
  const d = await db(PROD_TODAY);
  // Same signature, argument names and result type; only the body is unknown (an unreviewed change).
  const sig = (await d.query(`SELECT pg_get_function_arguments(p.oid) AS a, pg_get_function_result(p.oid) AS r
    FROM pg_proc p WHERE p.oid = to_regprocedure('public.request_repeat_question(smallint,text[])')`)).rows[0];
  await d.exec(`CREATE OR REPLACE FUNCTION public.request_repeat_question(${sig.a}) RETURNS ${sig.r}
    LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'unreviewed body'; END $$`);
  let c = await checks(d);
  assert.equal(c["PRE-02"].ok, false);
  assert.equal(c["PRE-01"].ok, true);
  assertOnlyGate(c, null);
  const noG1 = await db([D280_PATHS, D278]);
  c = await checks(noG1);
  assert.equal(c["PRE-01"].ok, false, "D-280 part 1's body, G1 not applied");
  assertOnlyGate(c, null);
});

test("5. a missing constraint, a missing trigger and a disabled trigger are detected", async () => {
  const d = await db(FULL);
  await d.exec("ALTER TABLE public.question_attempts DROP CONSTRAINT question_attempts_submission_key");
  let c = await checks(d);
  assert.equal(c["BOOT-03"].ok, false);
  assert.match(c["BOOT-03"].actual, /10 af 11/);
  assertOnlyGate(c, null);
  await d.exec("DROP TRIGGER question_attempts_append_only ON public.question_attempts");
  c = await checks(d);
  assert.equal(c["BOOT-05"].ok, false);
  await d.exec("ALTER TABLE public.question_instances DISABLE TRIGGER question_instances_served_snapshot");
  c = await checks(d);
  assert.equal(c["K1-03"].ok, false);
  assert.equal(c["K1-01"].ok, true, "bodies unchanged");
});

test("6a. legacy answer before H5 is used: INT-B0 0, INT-B not evaluable (NULL, not a pass)", async () => {
  const d = await db(FULL);
  const p = await pupil(d, 7201);
  await answerLegacy(d, p, await serve(d, p, 0), 0);
  const i = await rowsOf(d, INTEGRITY_1());
  assert.equal(i["INT-A"].actual, "0");
  assert.equal(i["INT-B0"].actual, "0");
  assert.equal(i["INT-B0"].ok, null);
  assert.equal(i["INT-B"].ok, null);
  assert.match(i["INT-B"].actual, /^IKKE EVALUERBAR/);
});

test("6b–d. legacy between A8 and M2, a synthetic T, and a legacy answer after T", async () => {
  const d = await db(FULL);
  const p = await pupil(d, 7202);
  await answerV2(d, p, await serve(d, p, 0), 0);            // A8: the first attempt
  await answerLegacy(d, p, await serve(d, p, 1), 1);        // an outdated client, between A8 and M2
  let i = await rowsOf(d, INTEGRITY_1());
  assert.equal(i["INT-A"].actual, "1");
  assert.equal(i["INT-B0"].actual, "1", "counted, as information");
  assert.equal(i["INT-B0"].ok, null, "INT-B0 is never a criterion");
  assert.equal(i["INT-B"].ok, null, "not evaluable without T");
  for (const id of ["INT-C", "INT-D", "INT-E"]) assert.equal(i[id].ok, true, id);
  // M2 in the order of runbook §9.3, synthetic: transaction 1 closes (T is missing → CUT-02 false),
  // transaction 2 creates the registration table and its row together, only afterwards (the drain itself
  // needs real concurrency: the M2 PR, §9.4)
  await d.exec(`BEGIN; ${M2_SQL} COMMIT;`);
  assert.equal((await checks(d))["CUT-02"].ok, false, "between transaction 1 and 2: NO-GO");
  await d.exec(`BEGIN; ${CUTOVER_SQL}
    INSERT INTO public.answer_path_cutovers (cutover, effective_at, closed_before, migration)
    VALUES ('h5_m2', clock_timestamp(), clock_timestamp(), 'synthetic-m2.sql'); COMMIT;`);
  assert.equal((await checks(d))["CUT-02"].ok, true);
  let j = await rowsOf(d, INTEGRITY_2());
  assert.equal(j["CUT-T"].ok, true);
  assert.equal(j["INT-B"].ok, true, `the legacy answer before T is not counted (${j["INT-B"].actual})`);
  assert.equal(j["INT-B"].actual, "0");
  i = await rowsOf(d, INTEGRITY_1());
  assert.equal(i["INT-B0"].actual, "1", "INT-B0 still counts it — which is why it can never be the criterion");
  // 6d: an answer after T that bypassed the log (what M2 makes impossible through the API)
  const qi = await serve(d, p, 2);
  await d.query(`UPDATE public.question_instances SET answered = true, was_correct = true,
    answered_at = (SELECT effective_at FROM public.answer_path_cutovers WHERE cutover = 'h5_m2') + interval '1 second'
    WHERE id = $1`, [qi]);
  j = await rowsOf(d, INTEGRITY_2());
  assert.equal(j["INT-B"].ok, false);
  assert.equal(j["INT-B"].actual, "1");
});

test("6e. M2 without a registration of T: CUT-02 false (NO-GO)", async () => {
  const d = await db(FULL);
  await d.exec(M2_SQL);
  const c = await checks(d);
  assert.equal(c["CUT-01"].ok, true);
  assert.equal(c["CUT-02"].ok, false);
  assert.match(c["CUT-02"].actual, /registreringen af T findes ikke/);
});

test("7. running the checks changes nothing (schema fingerprint and row counts)", async () => {
  for (const d of [await built("pre", PROD_TODAY), await built("full", FULL)]) {
    const tables = (await d.query(`SELECT relname FROM pg_class
      WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' ORDER BY relname`)).rows.map((r) => r.relname);
    const counts = async () => {
      const out = {};
      for (const t of tables) out[t] = (await d.query(`SELECT count(*)::int AS n FROM public."${t}"`)).rows[0].n;
      out.ledger = (await d.query("SELECT count(*)::int AS n FROM supabase_migrations.schema_migrations")).rows[0].n;
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

test("8a. schema ahead of the ledger: an empty ledger after bootstrap → LED-01 false, every gate closed", async () => {
  const c = await checks(await db([...PROD_TODAY, BOOTSTRAP], { ledger: false }));
  assert.equal(c["LED-01"].ok, false);
  assert.match(c["LED-01"].actual, /^ledger=ingen; skema-fase=1$/);
  assertOnlyGate(c, null);
});

test("8b. a wrong migration name, versions in the wrong order and a missing step make LED-01 false", async () => {
  const d = await db(FULL, { ledger: false });
  const put = (rows) => d.exec(`DELETE FROM supabase_migrations.schema_migrations;
    INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ${rows.map(([v, n]) => `('${v}', '${n}')`).join(", ")};`);
  const n = Object.values(LEDGER_NAME);
  await put([["1", n[0]], ["2", n[1]], ["3", "d327_other_name"], ["4", n[3]]]);         // wrong name
  assert.equal((await checks(d))["LED-01"].ok, false);
  await put([["1", n[0]], ["2", n[1]], ["4", n[2]], ["3", n[3]]]);                      // K1 recorded before D-327
  assert.equal((await checks(d))["LED-01"].ok, false);
  await put([["1", n[0]], ["2", n[1]], ["3", n[3]]]);                                    // D-327 missing
  assert.equal((await checks(d))["LED-01"].ok, false);
  await put([["1", n[0]], ["2", n[1]], ["3", n[2]], ["4", n[3]]]);                      // correct
  const c = await checks(d);
  assert.equal(c["LED-01"].ok, true);
  assertOnlyGate(c, "GATE-M2");
});

test("8c. ok = NULL is never a pass: a missing pinned function makes PRE-01 NULL and closes GATE-A1", async () => {
  const d = await db(PROD_TODAY);
  await d.exec("DROP FUNCTION public.process_question_attempt(uuid,uuid,text,bigint)");
  const c = await checks(d);
  assert.equal(c["PRE-01"].ok, null);
  assert.equal(c["PRE-01"].actual, "mangler");
  assertOnlyGate(c, null);
});

test("8d. the row count matches runbook §4", async () => {
  const m = /Readiness-filen returnerer \*\*(\d+) rækker\*\*: (\d+) kontroller, `CUT-02` og (\d+) gate-rækker/.exec(RUNBOOK);
  assert.ok(m, "runbook §4 states the row count");
  const rows = (await (await built("pre", PROD_TODAY)).query(CHECKS_SQL)).rows;
  assert.equal(rows.length, Number(m[1]));
  assert.equal(rows.filter((r) => r.phase === "gate").length, Number(m[3]));
  assert.equal(rows.length, Number(m[2]) + 1 + Number(m[3]));
  assert.match(CHECKS_SQL, new RegExp(`i alt ${m[1]} rækker`), "the SQL header states the same count");
});

test("9a–f. CUT-01 detects every effective access path to the legacy functions (runbook §9.2)", async () => {
  const d = await db(FULL);
  const cut = async () => (await checks(d))["CUT-01"];
  const closed = async (why) => {
    const c = await cut();
    assert.equal(c.ok, true, `${why}: ${c.actual}`);
    assert.match(c.actual, /^runtime=ingen; PUBLIC=false; øvrige roller=ingen; kaldere=0; afhængige=0; /);
  };
  const open = async (why, ...patterns) => {
    const c = await cut();
    assert.equal(c.ok, false, `${why}: ${c.actual}`);
    for (const p of patterns) assert.match(c.actual, p, why);
  };

  await open("before M2", /runtime=service_role→service_role/, /øvrige roller=service_role/, /authenticator=fraværende/);
  await d.exec(M2_SQL);
  await closed("after M2");

  // 9a. PUBLIC is not a role: the grant is read from the ACL (grantee 0) — and every role inherits it
  await d.exec(`GRANT EXECUTE ON FUNCTION ${PQA} TO PUBLIC`);
  await open("PUBLIC grant", /PUBLIC=true/, /anon→anon/, /authenticated→authenticated/);
  await d.exec(`REVOKE EXECUTE ON FUNCTION ${PQA} FROM PUBLIC`);
  await closed("PUBLIC revoked");

  // 9b. a direct grant to a runtime role
  await d.exec(`GRANT EXECUTE ON FUNCTION ${PTA} TO authenticated`);
  await open("direct grant", /runtime=authenticated→authenticated/);
  await d.exec(`REVOKE EXECUTE ON FUNCTION ${PTA} FROM authenticated`);
  await closed("direct grant revoked");

  // 9c. role inheritance, and another non-superuser role that holds EXECUTE on its own
  await d.exec(`CREATE ROLE legacy_caller NOLOGIN; GRANT EXECUTE ON FUNCTION ${PQA} TO legacy_caller;
    GRANT legacy_caller TO authenticated`);
  await open("inheritance", /authenticated→legacy_caller/, /øvrige roller=.*legacy_caller/);
  await d.exec("REVOKE legacy_caller FROM authenticated");
  await open("a non-runtime role still holds EXECUTE", /runtime=ingen/, /øvrige roller=legacy_caller/);
  await d.exec(`REVOKE EXECUTE ON FUNCTION ${PQA} FROM legacy_caller; DROP ROLE legacy_caller`);
  await closed("inheritance closed");

  // 9d. SET ROLE: a NOINHERIT login role (PostgREST's authenticator) is a MEMBER of service_role —
  //     has_function_privilege('authenticator', …) is false, yet it calls as service_role
  await d.exec("CREATE ROLE authenticator NOINHERIT LOGIN; GRANT service_role TO authenticator");
  await closed("authenticator exists, M2 done");
  assert.match((await cut()).actual, /authenticator=findes/);
  await d.exec(`GRANT EXECUTE ON FUNCTION ${PTA} TO service_role`);
  await open("SET ROLE path", /authenticator→service_role/, /service_role→service_role/);
  await d.exec(`REVOKE EXECUTE ON FUNCTION ${PTA} FROM service_role`);
  await closed("SET ROLE path closed");

  // 9e. indirect call paths: a SECURITY DEFINER wrapper, and a view (a pg_depend dependent)
  await d.exec(`CREATE FUNCTION public.legacy_wrapper() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS
    $f$ BEGIN PERFORM public.process_text_answer(NULL::uuid, NULL::uuid, NULL::text, NULL::boolean); END $f$`);
  await open("wrapper", /kaldere=1/);
  await d.exec("DROP FUNCTION public.legacy_wrapper()");
  await d.exec(`CREATE VIEW public.legacy_view AS
    SELECT public.process_question_attempt(NULL::uuid, NULL::uuid, NULL::text, NULL::bigint) AS r`);
  await open("dependent view", /afhængige=[1-9]/);
  await d.exec("DROP VIEW public.legacy_view");
  await closed("indirect paths removed");

  // 9f. DROP/CREATE under production's default privileges (verified 2026-11-04) gives the access back
  await d.exec("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role");
  const sig = (await d.query(`SELECT pg_get_function_arguments(p.oid) AS a, pg_get_function_result(p.oid) AS r
    FROM pg_proc p WHERE p.oid = '${PTA}'::regprocedure`)).rows[0];
  await d.exec(`DROP FUNCTION ${PTA};
    CREATE FUNCTION public.process_text_answer(${sig.a}) RETURNS ${sig.r} LANGUAGE plpgsql SECURITY DEFINER AS
    $f$ BEGIN RAISE EXCEPTION 'recreated'; END $f$`);
  await open("DROP/CREATE", /PUBLIC=true/, /anon→anon/, /authenticated→authenticated/, /service_role→service_role/);
});
