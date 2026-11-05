// RUNTIME proof for H5 M2 (runbook docs/operations/h5-k1-activation-runbook.md §9, A10a/A10b), PGlite:
//   20261105180000_h5_m2_close_legacy_answer_path.sql  — transaction 1, close
//   20261105180100_h5_m2_register_cutover.sql          — transaction 2, drain + register T
// and the reopen block R1 in docs/operations/h5-m2-rollback.md. All three run UNMODIFIED, on the merged
// H5 chain in production's order (G1 → bootstrap → alignment → D-327 → K1, with G2 and D-316 as
// production has them) and the readiness file of PR #583. Synthetic pupils only.
//
// PGlite has ONE connection: it proves the guards, the end state, the registration and the rollback.
// The drain with several sessions (in-flight calls, idle in transaction, timeout, resumption) is proved
// on real PostgreSQL 17 in h5-m2-cutover-concurrency.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import {
  D278, D280_PATHS, G1, BOOTSTRAP, ALIGN, TOP10_BEFORE, TOP10_ID, uid, baseSql, migrationSql, FINGERPRINT_SQL,
} from "./helpers/h5-integration-chain.mjs";
import { G2, G2_SEED_SQL } from "./helpers/g2-h5-orders.mjs";
import { NOT_IN_PRODUCTION, planReplay } from "../isolated/schema/replay-plan.mjs";
import { isRevokedLegacyRpc } from "../../supabase/functions/process-event/answer-v2.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIG_DIR = join(ROOT, "supabase", "migrations");
const CLOSE = "20261105180000_h5_m2_close_legacy_answer_path.sql";
const REGISTER = "20261105180100_h5_m2_register_cutover.sql";
const D316 = "20261102100000_release_open_rounds_on_inactive_questions.sql";
const D327 = "20261103100000_question_attempts_history_no_action.sql";
const K1 = "20261103110000_l1_k1_attempt_context.sql";
const BEFORE_K1 = [D280_PATHS, D278, G1, G2, D316, BOOTSTRAP, ALIGN, D327];
const FULL = [...BEFORE_K1, K1];
const LEDGER_NAME = {
  [BOOTSTRAP]: "question_attempts_v2_bootstrap", [ALIGN]: "question_attempts_v2_align_grading",
  [D327]: "question_attempts_history_no_action", [K1]: "l1_k1_attempt_context",
  [CLOSE]: "h5_m2_close_legacy_answer_path", [REGISTER]: "h5_m2_register_cutover",
};
const PQA = "public.process_question_attempt(uuid,uuid,text,bigint)";
const PTA = "public.process_text_answer(uuid,uuid,text,boolean)";
const CHECKS_SQL = readFileSync(join(ROOT, "docs", "operations", "h5-k1-readiness-checks.sql"), "utf8");
const RUNBOOK = readFileSync(join(ROOT, "docs", "operations", "h5-k1-activation-runbook.md"), "utf8").split("\r\n").join("\n");
const ROLLBACK_DOC = readFileSync(join(ROOT, "docs", "operations", "h5-m2-rollback.md"), "utf8").split("\r\n").join("\n");
const CLOSE_SQL = () => migrationSql(CLOSE);
const REGISTER_SQL = () => migrationSql(REGISTER);

function sqlBlock(text, marker) {
  const m = new RegExp("```sql\\n(-- " + marker + "[\\s\\S]*?)```").exec(text);
  assert.ok(m, `block ${marker}`);
  return m[1];
}
const R1_SQL = () => sqlBlock(ROLLBACK_DOC, "ROLLBACK H5 M2 R1");
const INTEGRITY_2 = () => sqlBlock(RUNBOOK, "H5-K1 INTEGRITY AFTER M2");

let ledgerVersion = 20261106000000;
async function apply(d, file) {
  await d.exec(migrationSql(file));
  if (LEDGER_NAME[file]) {
    await d.query("INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ($1, $2)", [String(ledgerVersion++), LEDGER_NAME[file]]);
  }
}
async function db(order = FULL) {
  const d = new PGlite();
  for (const sql of baseSql()) await d.exec(sql);
  await d.exec(`CREATE SCHEMA IF NOT EXISTS supabase_migrations;
    CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version text PRIMARY KEY, name text, statements text[]);`);
  await d.exec(G2_SEED_SQL);
  for (const f of order) await apply(d, f);
  return d;
}
const checks = async (d) => Object.fromEntries((await d.query(CHECKS_SQL)).rows.map((r) => [r.check_id, r]));
const integrity2 = async (d) => Object.fromEntries((await d.query(INTEGRITY_2())).rows.map((r) => [r.check_id, r]));
const fingerprint = async (d) => (await d.query(FINGERPRINT_SQL)).rows[0].f;
const errOf = async (p) => { try { await p; return null; } catch (e) { return e; } };
async function as(d, role, sql, params = []) {
  await d.exec(`SET ROLE ${role}`);
  try { return (await d.query(sql, params)).rows; } finally { await d.exec("RESET ROLE"); }
}
// Every answer-history table the test schema has, byte for byte (row order fixed by primary key). Production
// also has student_answers (long answers, teacher review); M2 touches no table at all, which the
// fingerprint proves for the whole schema.
async function history(d) {
  const out = {};
  for (const [t, key] of [["question_instances", "id"], ["question_attempts", "id"], ["student_progress", "student_id"],
    ["student_quest_progress", "id"], ["student_weekly_quest_progress", "id"], ["student_answers", "id"]]) {
    if ((await d.query("SELECT to_regclass($1) AS r", [`public.${t}`])).rows[0].r === null) continue;
    out[t] = (await d.query(`SELECT count(*)::int AS n, coalesce(md5(string_agg(x::text, '|' ORDER BY x::text)), '') AS h FROM public.${t} x`)).rows[0];
  }
  return out;
}

let nextPupil = 6100;
async function addPupil(d, n = nextPupil++) {
  const id = uid(n);
  await d.exec(`INSERT INTO auth.users VALUES ('${id}');
    INSERT INTO public.profiles (id, role, selected_grade) VALUES ('${id}', 'student', 5);
    INSERT INTO public.student_progress (student_id, xp, coins, correct_answers, total_correct_answers,
      current_streak, longest_streak, last_activity_date) VALUES ('${id}', 100, 50, 7, 7, 1, 1, current_date - 1);`);
  return id;
}
async function serve(d, pupil, q) {
  return (await d.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, repeat_count, answered, next_review_at)
    VALUES ($1, $2, $3, 0, false, now()) RETURNING id`, [pupil, TOP10_ID[q], TOP10_BEFORE[q].content.correct])).rows[0].id;
}
const RIGHT = (q) => TOP10_BEFORE[q].content.correct;
const h5 = async (d, p, qi, a, round, sub = randomUUID()) =>
  (await as(d, "service_role", "SELECT public.process_question_attempt_v2($1,$2,$3,$4,$5,NULL,NULL,'quiz_v1',0) AS r", [p, qi, a, round, sub]))[0].r;
const legacyMc = (d, role, p, qi, a) => as(d, role, "SELECT public.process_question_attempt($1,$2,$3,0) AS r", [p, qi, a]);
const legacyText = (d, role, p, qi, a) => as(d, role, "SELECT public.process_text_answer($1,$2,$3,false) AS r", [p, qi, a]);

// A K1 database in use: one legacy answer from before M2 (history that must survive) and one H5 attempt
// (the new path has been used — transaction 1's floor).
async function inUse(order = FULL) {
  const d = await db(order);
  const p = await addPupil(d, 6000);
  const old = await serve(d, p, 0);
  await legacyMc(d, "service_role", p, old, RIGHT(0));
  const qi = await serve(d, p, 1);
  assert.equal((await h5(d, p, qi, RIGHT(1), 1)).outcome, "recorded");
  return { d, p, old };
}

// ── The files ────────────────────────────────────────────────────────────────────────────────────
test("the files: unique versions after K1, not replayed, one DO block each, D-110 header, no forbidden statements", () => {
  const files = readdirSync(MIG_DIR).filter((f) => /^\d{14}_.+\.sql$/.test(f)).sort();
  for (const f of [CLOSE, REGISTER]) {
    assert.ok(files.includes(f), f);
    assert.equal(files.filter((x) => x.slice(0, 14) === f.slice(0, 14)).length, 1, `${f}: version unique`);
    assert.ok(f > K1, `${f} after K1`);
    assert.match(NOT_IN_PRODUCTION[f] ?? "", /not applied in production \(inactive until B1–B4\)/);
    const read = (x) => readFileSync(join(MIG_DIR, x), "utf8");
    assert.equal(planReplay(files, read).plan.find((x) => x.file === f).action, "skip");
    const sql = migrationSql(f);
    assert.match(sql, /NOT APPLIED IN PRODUCTION\. Applying it needs a separate owner authorisation \(D-110/);
    const body = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").trim();
    const tag = /^DO (\$\w+\$)/.exec(body);
    assert.ok(tag, `${f}: starts with one DO block`);
    assert.ok(body.endsWith(`${tag[1]};`), `${f}: ends with it`);
    assert.equal(body.split(tag[1]).length, 3, `${f}: exactly one DO block`);
    assert.doesNotMatch(body, /pg_terminate_backend|pg_cancel_backend/i, "no session is ever terminated");
    assert.doesNotMatch(body, /DROP\s+FUNCTION|CREATE\s+FUNCTION\s+public\.process_/i, "legacy functions are never dropped or re-created");
    assert.doesNotMatch(body, /GRANT\s+[^;]*\bTO\s+[^;]*\b(PUBLIC|anon|authenticated)\b/i, "nothing granted to PUBLIC, anon or authenticated");
  }
  assert.ok(CLOSE < REGISTER, "close sorts before register");
});

test("no later migration drops, re-creates or re-grants a legacy answer function (runbook §9.2 krav 3)", () => {
  const later = readdirSync(MIG_DIR).filter((f) => /^\d{14}_.+\.sql$/.test(f) && f > CLOSE);
  for (const f of later) {
    const body = readFileSync(join(MIG_DIR, f), "utf8").split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    assert.doesNotMatch(body, /DROP\s+FUNCTION[^;]*\bprocess_(question_attempt|text_answer)\s*\(/i, `${f}: DROP of a legacy function`);
    assert.doesNotMatch(body, /CREATE\s+FUNCTION\s+(public\.)?process_(question_attempt|text_answer)\s*\(/i, `${f}: CREATE of a legacy function`);
    assert.doesNotMatch(body, /GRANT[^;]*\bprocess_(question_attempt|text_answer)\s*\(/i, `${f}: GRANT on a legacy function (only R1 may, by its own GO)`);
  }
});

// ── Every migration, whatever its timestamp: statements that could re-open the legacy path ─────────────
// The filename filter above (f > CLOSE) misses a migration merged LATER in Git with an OLDER timestamp (as
// #612's 20261020… files were, after this PR was opened). This scan reads EVERY migration file and compares
// the hits with an explicit baseline: the known, historical definitions from before M2, each pinned by the
// sha256 of its content (CRLF → LF). A new file, a changed baseline file or a new kind of hit fails.
// What it cannot see: SQL assembled at run time (e.g. EXECUTE 'GRANT … ' || name, format('%I', …)).
// Readiness CUT-01 and the guards of transaction 1 and 2 check the effective state in the database for that.
const RUNTIME_ROLE = String.raw`(anon|authenticated|service_role|authenticator|public)`;
const LEGACY_DDL_RULES = Object.freeze({
  // any signature: CREATE and CREATE OR REPLACE, so a new overload is caught as well
  create: /\bCREATE\s+(OR\s+REPLACE\s+)?(FUNCTION|PROCEDURE)\s+("?public"?\s*\.\s*)?"?process_(question_attempt|text_answer)"?\s*\(/i,
  drop: /\bDROP\s+(FUNCTION|PROCEDURE|ROUTINE)\b[^;]*\bprocess_(question_attempt|text_answer)\b/i,
  // ALTER FUNCTION … OWNER TO / RENAME / SET … on a legacy name
  alter: /\bALTER\s+(FUNCTION|PROCEDURE|ROUTINE)\s+[^;]*\bprocess_(question_attempt|text_answer)\b/i,
  grant_fn: /\bGRANT\b[^;]*\bON\s+(FUNCTION|PROCEDURE|ROUTINE)\b[^;]*\bprocess_(question_attempt|text_answer)\b/i,
  grant_all: /\bGRANT\b[^;]*\bON\s+ALL\s+(FUNCTIONS|PROCEDURES|ROUTINES)\s+IN\s+SCHEMA\b/i,
  default_privileges: /\bALTER\s+DEFAULT\s+PRIVILEGES\b[^;]*\bGRANT\b[^;]*\bON\s+(FUNCTIONS|ROUTINES)\b/i,
  // GRANT <role> TO <runtime role> (no ON: a membership, not a privilege) — e.g. GRANT postgres TO authenticated
  role_membership: new RegExp(String.raw`\bGRANT\s+(?![^;]*\bON\b)[^;]*\bTO\s+[^;]*\b${RUNTIME_ROLE}\b`, "i"),
  runtime_role_alter: new RegExp(String.raw`\bALTER\s+(ROLE|USER|GROUP)\s+"?${RUNTIME_ROLE}"?\b`, "i"),
  create_role_membership: /\bCREATE\s+(ROLE|USER|GROUP)\s+\S+[^;]*\b(IN\s+ROLE|IN\s+GROUP|ROLE|ADMIN|USER|SUPERUSER)\b/i,
  reassign_owned: /\bREASSIGN\s+OWNED\b/i,
});
function legacyDdlHits(sql) {
  const body = sql.split("\r\n").join("\n").replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
  const statements = body.split(";");
  return Object.entries(LEGACY_DDL_RULES).filter(([, re]) => statements.some((s) => re.test(s))).map(([k]) => k);
}
const sha256 = (s) => createHash("sha256").update(s.split("\r\n").join("\n")).digest("hex");
// Known, reviewed definitions from before M2. Each is history: production holds the result (G1's body, the
// D-235/D-236 lockdown ACLs); M2's guards check the live state, not these files. Never extend this list
// without a review of the new statement and an owner GO for re-opening.
const LEGACY_DDL_BASELINE = Object.freeze({
  "20260511000400_idempotent_text_answer.sql": { rules: ["create"], sha256: "b886a1c8af25ac93c6f91065268a5df995e61146d321b82c8afc74808da473ba", why: "original bodies of both legacy functions (May 2026)" },
  "20260518000000_streak_system.sql": { rules: ["create"], sha256: "9e80a678343576d138f1e535f3194316e33360b98f68c57a4878a499e97a7f9c", why: "streaks added to both bodies" },
  "20260518000100_retention_loops.sql": { rules: ["create"], sha256: "6f7b7e232a8b6c50b62b89d73c53db742aaab541273dc17153771f5802071afc", why: "daily quests added to both bodies" },
  "20260518000200_fix_correct_answers_counter.sql": { rules: ["create"], sha256: "9e5d44fe13cb85cf402eea0c8b1e0750ac51d542a72aa9c63401223a1aa52220", why: "counter fix in both bodies" },
  "20260524000000_weekly_quests.sql": { rules: ["create"], sha256: "9e4776cd2fa894176e182b0715ae932dd79d08663de207c5e02eb5356f84d80d", why: "weekly quests added to both bodies" },
  "20261002000000_quiz_repeat_when_pool_exhausted.sql": { rules: ["create"], sha256: "ea9c196134c77ed941a7ec16e058ccc382c4b3cd366429ddbc49aa99b6386e0f", why: "repeat rounds in process_question_attempt" },
  "20261003153220_process_text_answer_execute_lockdown.sql": { rules: ["alter", "grant_fn"], sha256: "1c051dc281d06ab5ad270d74fdaf26f6597b82aba39edd0d65a1fdf4270e5268", why: "security lockdown: EXECUTE to service_role only, search_path set" },
  "20261007182046_process_question_attempt_execute_lockdown.sql": { rules: ["grant_fn"], sha256: "3b5cde2e57011755125123e203f469ed9402758ce737dd66aa21249e8263c501", why: "security lockdown: EXECUTE to service_role only" },
  "20261018143726_fix_danish_question_bank_text.sql": { rules: ["create"], sha256: "efe71e74e53373c77779928ac0bba9044a68c0807e723d76120d422fa276b793", why: "Danish letters in grading (same signature)" },
  "20261027120000_repeat_answer_coin_reward.sql": { rules: ["create"], sha256: "04c53db5e423594a44f04ea956b3cb05d7ddaa88d8a5e2e85b87498040a37300", why: "D-211 repeat coin reward (same signature)" },
  "20261031194600_mc_length_cue_answer_paths.sql": { rules: ["create"], sha256: "f334ae136d9603661b8af6028dbbc43dd715a67ecf54b2a092f74c88551a9a05", why: "D-280 answer paths (same signature)" },
  "20261101150000_grading_meaningful_characters.sql": { rules: ["create"], sha256: "406933134b95fb2f72591eb5a0f99e4a3a9c57a5decceabdca9edaa507e6299f", why: "D-290 G1, the body production runs (same signature)" },
});

// Problems for a set of migration files ({ name, sql }), against the baseline. Order plays no part.
function unreviewedLegacyDdl(files) {
  const problems = [];
  const hitNames = [];
  for (const { name, sql } of files) {
    const rules = legacyDdlHits(sql);
    if (!rules.length) continue;
    hitNames.push(name);
    const base = LEGACY_DDL_BASELINE[name];
    if (!base) problems.push(`${name}: ${rules.join(", ")} — not in the reviewed baseline (a new or re-dated migration that can re-open the legacy path)`);
    else if (rules.join(",") !== base.rules.join(",")) problems.push(`${name}: ${rules.join(", ")} — other statement kinds than reviewed (${base.rules.join(", ")})`);
    else if (sha256(sql) !== base.sha256) problems.push(`${name}: changed since it was reviewed`);
  }
  for (const name of Object.keys(LEGACY_DDL_BASELINE)) {
    if (!hitNames.includes(name)) problems.push(`${name}: baseline file missing or no longer matching — review the baseline`);
  }
  return problems;
}
const repoMigrations = () => readdirSync(MIG_DIR).filter((x) => /^\d{14}_.+\.sql$/.test(x))
  .map((name) => ({ name, sql: readFileSync(join(MIG_DIR, name), "utf8") }));

test("every migration, whatever its timestamp: nothing outside the reviewed baseline can re-open the legacy path (runbook §9.2 krav 3)", () => {
  assert.deepEqual(unreviewedLegacyDdl(repoMigrations()), []);
});

test("the scan fails on each kind of re-opening — also in a file with an OLDER timestamp — and ignores comments and _v2", () => {
  const bad = {
    "CREATE OR REPLACE overload": ["create", `CREATE OR REPLACE FUNCTION public.process_question_attempt(uuid, uuid, text, integer) RETURNS json LANGUAGE sql AS $$ SELECT NULL::json $$;`],
    "CREATE, no schema": ["create", `CREATE FUNCTION process_text_answer(text) RETURNS void LANGUAGE sql AS $$ SELECT $$;`],
    "quoted names": ["create", `CREATE OR REPLACE FUNCTION "public"."process_text_answer"(uuid) RETURNS void LANGUAGE sql AS $$ SELECT $$;`],
    "DROP": ["drop", `DROP FUNCTION IF EXISTS public.process_question_attempt(uuid,uuid,text,bigint);`],
    "ALTER … OWNER TO": ["alter", `ALTER FUNCTION public.process_text_answer(uuid,uuid,text,boolean) OWNER TO authenticated;`],
    "direct GRANT": ["grant_fn", `GRANT EXECUTE ON FUNCTION public.process_question_attempt(uuid,uuid,text,bigint) TO anon;`],
    "GRANT to PUBLIC across lines": ["grant_fn", `GRANT EXECUTE\n  ON FUNCTION public.process_text_answer(uuid, uuid, text, boolean)\n  TO PUBLIC;`],
    "broad GRANT": ["grant_all", `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;`],
    "default privileges": ["default_privileges", `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;`],
    "membership in the owner": ["role_membership", `GRANT postgres TO authenticated;`],
    "membership for SET ROLE": ["role_membership", `GRANT legacy_caller TO authenticator;`],
    "runtime role altered": ["runtime_role_alter", `ALTER ROLE service_role INHERIT;`],
    "new role inside a runtime role": ["create_role_membership", `CREATE ROLE legacy_caller NOLOGIN IN ROLE authenticated;`],
    "ownership moved": ["reassign_owned", `REASSIGN OWNED BY postgres TO legacy_owner;`],
  };
  for (const [name, [rule, sql]] of Object.entries(bad)) {
    assert.ok(legacyDdlHits(sql).includes(rule), `${name}: ${rule} not detected`);
  }
  // A file merged later in Git with an OLDER timestamp is reported like any other: the scan reads every
  // file and the baseline is keyed by name and content, never by order.
  const repo = repoMigrations();
  for (const [name, [, sql]] of Object.entries(bad)) {
    const older = `20260101000000_late_merged_${name.replace(/[^a-z]+/gi, "_").toLowerCase()}.sql`;
    assert.ok(older < CLOSE, older);
    const problems = unreviewedLegacyDdl([...repo, { name: older, sql }]);
    assert.equal(problems.length, 1, `${name}: ${problems.join(" | ")}`);
    assert.match(problems[0], /not in the reviewed baseline/);
  }
  // A reviewed baseline file that is edited afterwards (here: a GRANT to PUBLIC appended) is reported too.
  const edited = repo.map((f) => f.name === "20261007182046_process_question_attempt_execute_lockdown.sql"
    ? { ...f, sql: `${f.sql}\nGRANT EXECUTE ON FUNCTION public.process_question_attempt(uuid,uuid,text,bigint) TO PUBLIC;\n` } : f);
  assert.deepEqual(unreviewedLegacyDdl(edited), ["20261007182046_process_question_attempt_execute_lockdown.sql: changed since it was reviewed"]);
  // Not hits: comments, the _v2 functions, and privileges on other objects.
  for (const ok of [
    `-- GRANT EXECUTE ON FUNCTION public.process_question_attempt(uuid,uuid,text,bigint) TO anon;`,
    `/* DROP FUNCTION public.process_text_answer(uuid,uuid,text,boolean); */ SELECT 1;`,
    `CREATE OR REPLACE FUNCTION public.process_question_attempt_v2(uuid) RETURNS void LANGUAGE sql AS $$ SELECT $$;`,
    `GRANT EXECUTE ON FUNCTION public.process_text_answer_v2(uuid,uuid,text,boolean,integer,uuid,text,text,text,integer) TO service_role;`,
    `GRANT USAGE ON SCHEMA public TO anon;`,
    `GRANT SELECT ON TABLE public.question_attempts TO service_role;`,
  ]) assert.deepEqual(legacyDdlHits(ok), [], ok);
});

// ── Transaction 1: guards ────────────────────────────────────────────────────────────────────────
test("transaction 1 is refused — nothing changed — without K1, without an attempt, with a caller, a dependent view or a runtime role in the owner", async () => {
  const cases = [
    ["K1 missing", async () => db(BEFORE_K1), /K1 er ikke anvendt/],
    ["no attempt yet", async () => db(FULL), /question_attempts er tom/],
    ["a SECURITY DEFINER wrapper calls the legacy function", async () => {
      const { d } = await inUse();
      await d.exec(`CREATE FUNCTION public.answer_wrapper(p uuid, q uuid, a text) RETURNS json LANGUAGE sql SECURITY DEFINER
        AS $w$ SELECT public.process_question_attempt(p, q, a, 0) $w$;
        GRANT EXECUTE ON FUNCTION public.answer_wrapper(uuid,uuid,text) TO authenticated;`);
      return d;
    }, /andre funktioner kalder legacy-funktionerne \((public\.)?answer_wrapper\(uuid,uuid,text\)\)/],
    ["a view depends on it", async () => {
      const { d } = await inUse();
      await d.exec(`CREATE VIEW public.legacy_probe AS SELECT public.process_text_answer(NULL::uuid, NULL::uuid, NULL::text, false) AS r WHERE false;`);
      return d;
    }, /objekter afhænger af legacy-funktionerne/],
    ["authenticated is a member of the owner", async () => {
      const { d } = await inUse();
      await d.exec(`CREATE ROLE legacy_owner NOLOGIN; ALTER FUNCTION ${PQA} OWNER TO legacy_owner; GRANT legacy_owner TO authenticated;`);
      return d;
    }, /runtime-rolle\(r\) er medlem af legacy-funktionernes ejer \(authenticated\)/],
    ["a new overload of a legacy name exists (CREATE OR REPLACE, other signature, no grant)", async () => {
      const { d } = await inUse();
      await d.exec(`CREATE OR REPLACE FUNCTION public.process_text_answer(uuid, uuid, text, integer) RETURNS json
          LANGUAGE plpgsql SECURITY DEFINER AS $o$ BEGIN RETURN NULL; END $o$;
        REVOKE ALL ON FUNCTION public.process_text_answer(uuid, uuid, text, integer) FROM PUBLIC;`);
      return d;
    }, /andre funktioner i public bærer legacy-navnene \((public\.)?process_text_answer\(uuid,uuid,text,integer\)\)/],
  ];
  for (const [name, build, msg] of cases) {
    const d = await build();
    const before = { f: await fingerprint(d), h: await history(d) };
    const e = await errOf(d.exec(CLOSE_SQL()));
    assert.ok(e, `${name}: refused`);
    assert.match(e.message, msg, name);
    assert.match(e.message, /intet ændret/, name);
    assert.deepEqual({ f: await fingerprint(d), h: await history(d) }, before, `${name}: nothing changed`);
    assert.equal((await checks(d))["CUT-01"].ok, false, `${name}: still open`);
    await d.close();
  }
});

// ── Transaction 1: the end state ─────────────────────────────────────────────────────────────────
test("transaction 1 closes EVERY path — direct, PUBLIC, inherited, SET ROLE — changes only the two ACLs, and a re-run changes nothing", async () => {
  const { d, p } = await inUse();
  // Widen the access beyond production's, so the broad revocation is proved, not assumed.
  await d.exec(`
    CREATE ROLE authenticator NOINHERIT LOGIN; GRANT anon, authenticated, service_role TO authenticator;
    CREATE ROLE legacy_caller NOLOGIN; GRANT legacy_caller TO authenticated;
    GRANT EXECUTE ON FUNCTION ${PQA} TO PUBLIC, legacy_caller;
    GRANT EXECUTE ON FUNCTION ${PTA} TO authenticated, authenticator;`);
  const before = await checks(d);
  assert.equal(before["CUT-01"].ok, false);
  assert.match(before["CUT-01"].actual, /PUBLIC=true/);
  assert.match(before["CUT-01"].actual, /authenticated→legacy_caller/);
  assert.match(before["CUT-01"].actual, /authenticator→authenticator/);
  assert.equal(before["GATE-M2"].ok, true, "the schema gate allows M2");

  const fpBefore = await fingerprint(d);
  const hBefore = await history(d);
  await apply(d, CLOSE);
  const after = await checks(d);
  assert.equal(after["CUT-01"].ok, true, after["CUT-01"].actual);
  assert.match(after["CUT-01"].actual, /^runtime=ingen; PUBLIC=false; øvrige roller=ingen; kaldere=0; afhængige=0; andre signaturer=0; authenticator=findes$/);
  assert.equal(after["CUT-02"].ok, false, "closed, T missing: NO-GO");
  assert.match(after["CUT-02"].actual, /registreringen af T findes ikke/);
  assert.deepEqual(await history(d), hBefore, "no answer history touched");

  const fpAfter = await fingerprint(d);
  const changed = Object.keys(fpAfter.functions).filter((k) => JSON.stringify(fpAfter.functions[k]) !== JSON.stringify(fpBefore.functions[k]));
  assert.deepEqual(changed.sort(), [PQA.replace("public.", ""), PTA.replace("public.", "")].sort().map((s) => s), "only the two legacy functions changed");
  for (const k of changed) {
    const [md5a, secA, cfgA, , ownerA] = fpBefore.functions[k];
    const [md5b, secB, cfgB, aclB, ownerB] = fpAfter.functions[k];
    assert.deepEqual([md5b, secB, cfgB, ownerB], [md5a, secA, cfgA, ownerA], `${k}: body, SECURITY DEFINER, settings, owner unchanged`);
    assert.deepEqual(aclB, ["postgres=X/postgres"], `${k}: only the owner keeps EXECUTE`);
  }
  for (const key of Object.keys(fpAfter)) if (key !== "functions") assert.deepEqual(fpAfter[key], fpBefore[key], key);

  await apply(d, CLOSE);
  assert.deepEqual(await fingerprint(d), fpAfter, "a second run changes nothing");
  await d.close();
  void p;
});

test("after transaction 1: every runtime role gets 42501 with exactly the text process-event maps to 426, and nothing is written", async () => {
  const { d, p } = await inUse();
  await d.exec("CREATE ROLE authenticator NOINHERIT LOGIN; GRANT anon, authenticated, service_role TO authenticator;");
  await apply(d, CLOSE);
  const qi = await serve(d, p, 2);
  const h = await history(d);
  for (const role of ["service_role", "anon", "authenticated", "authenticator"]) {
    for (const [fn, call] of [["process_question_attempt", legacyMc], ["process_text_answer", legacyText]]) {
      const e = await errOf(call(d, role, p, qi, RIGHT(2)));
      assert.ok(e, `${role} ${fn}: refused`);
      assert.equal(e.code, "42501", `${role} ${fn}`);
      assert.ok(isRevokedLegacyRpc({ code: e.code, message: e.message }, fn), `${role} ${fn}: "${e.message}" → 426`);
    }
  }
  // authenticator reaches service_role only via SET ROLE (NOINHERIT): the path PostgREST uses.
  await d.exec("SET ROLE authenticator; SET ROLE service_role;");
  const e = await errOf(d.query("SELECT public.process_question_attempt($1,$2,$3,0)", [p, qi, RIGHT(2)]));
  await d.exec("RESET ROLE");
  assert.equal(e?.code, "42501", "authenticator → SET ROLE service_role");
  assert.deepEqual(await history(d), h, "no refused call wrote anything");
  // The unanswered round is then answered through H5 (the reloaded client).
  assert.equal((await h5(d, p, qi, RIGHT(2), 1)).outcome, "recorded");
  await d.close();
});

test("after M2 the H5 path behaves exactly as without M2: first attempt kept, retries idempotent, repeats separate, XP and coins unchanged", async () => {
  async function scenario(d) {
    const p = await addPupil(d, 6500);
    const out = [];
    const qi = await serve(d, p, 3);
    const sub = randomUUID();
    out.push(await h5(d, p, qi, RIGHT(3), 1, sub));
    out.push(await h5(d, p, qi, RIGHT(3), 1, sub));              // the same submission again: replay
    out.push(await h5(d, p, qi, "forkert", 1, randomUUID()));    // another submission, same round: closed
    const first = (await d.query("SELECT * FROM public.question_attempts WHERE question_instance_id = $1", [qi])).rows;
    await d.exec(`UPDATE public.question_instances SET answered = false, repeat_count = 1 WHERE id = '${qi}'`);  // a reopen
    out.push(await h5(d, p, qi, "forkert", 2, randomUUID()));    // the repeat: a second, separate attempt
    const rows = (await d.query(`SELECT attempt_no, status, was_correct, user_answer, xp_awarded, coins_awarded, mode, hints_used
      FROM public.question_attempts WHERE question_instance_id = $1 ORDER BY attempt_no`, [qi])).rows;
    const firstAfter = (await d.query("SELECT * FROM public.question_attempts WHERE question_instance_id = $1 AND attempt_no = 1", [qi])).rows;
    assert.deepEqual(firstAfter, first, "the first attempt is never overwritten");
    const progress = (await d.query("SELECT xp, coins, correct_answers, total_correct_answers, current_streak FROM public.student_progress WHERE student_id = $1", [p])).rows;
    return { outcomes: out.map((r) => ({ outcome: r.outcome, status: r.status, xp: r.xp_awarded, coins: r.coins_awarded, round: r.round_no })), rows, progress };
  }
  const plain = await inUse();
  const m2 = await inUse();
  await apply(m2.d, CLOSE);
  await apply(m2.d, REGISTER);
  const a = await scenario(plain.d);
  const b = await scenario(m2.d);
  assert.deepEqual(b, a, "identical with and without M2");
  assert.deepEqual(a.outcomes.map((o) => o.outcome), ["recorded", "replay", "round_closed", "recorded"]);
  assert.deepEqual(a.rows.map((r) => r.attempt_no), [1, 2], "two rounds, two rows");
  await plain.d.close();
  await m2.d.close();
});

// ── Transaction 2 ────────────────────────────────────────────────────────────────────────────────
test("transaction 2 is refused before transaction 1, and without visibility of other sessions — nothing registered", async () => {
  const { d } = await inUse();
  let e = await errOf(d.exec(REGISTER_SQL()));
  assert.match(e?.message ?? "", /legacy-vejen er ikke lukket .*anvend og commit transaktion 1/);
  assert.equal((await d.query("SELECT to_regclass('public.answer_path_cutovers') AS t")).rows[0].t, null);

  await apply(d, CLOSE);
  await d.exec(`CREATE ROLE m2_runner NOLOGIN; GRANT CREATE ON SCHEMA public TO m2_runner;`);
  const fp = await fingerprint(d);
  await d.exec("SET ROLE m2_runner");
  e = await errOf(d.exec(REGISTER_SQL()));
  await d.exec("RESET ROLE");
  assert.match(e?.message ?? "", /kan ikke se andre sessioners transaktioner \(pg_read_all_stats mangler\); intet registreret/);
  assert.deepEqual(await fingerprint(d), fp);
  assert.equal((await checks(d))["CUT-02"].ok, false);

  // A legacy overload created AFTER transaction 1 reopens a legacy path: transaction 2 refuses to register T.
  await d.exec(`CREATE OR REPLACE FUNCTION public.process_question_attempt(uuid, uuid, text, integer) RETURNS json
      LANGUAGE plpgsql SECURITY DEFINER AS $o$ BEGIN RETURN NULL; END $o$;
    REVOKE ALL ON FUNCTION public.process_question_attempt(uuid, uuid, text, integer) FROM PUBLIC;`);
  assert.equal((await checks(d))["CUT-01"].ok, false, "CUT-01 sees the overload");
  const fp2 = await fingerprint(d);
  e = await errOf(d.exec(REGISTER_SQL()));
  assert.match(e?.message ?? "", /legacy-vejen er ikke lukket \(PUBLIC, anden rolle eller en anden funktion med legacy-navnet\)/);
  assert.deepEqual(await fingerprint(d), fp2);
  assert.equal((await d.query("SELECT to_regclass('public.answer_path_cutovers') AS t")).rows[0].t, null, "nothing registered");
  await d.close();
});

test("transaction 2 registers T once: append-only, private, after closed_before; readiness and integrity block 2 hold; a re-run moves nothing", async () => {
  const { d, p, old } = await inUse();
  await apply(d, CLOSE);
  const h = await history(d);
  await apply(d, REGISTER);
  assert.deepEqual(await history(d), h, "no answer history touched");

  const rows = (await d.query("SELECT cutover, effective_at, closed_before, migration FROM public.answer_path_cutovers")).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].cutover, "h5_m2");
  assert.equal(rows[0].migration, REGISTER);
  assert.ok(rows[0].closed_before <= rows[0].effective_at);
  const oldAt = (await d.query("SELECT answered_at FROM public.question_instances WHERE id = $1", [old])).rows[0].answered_at;
  assert.ok(oldAt < rows[0].closed_before, "the legacy answer from before M2 lies before closed_before");

  const meta = (await d.query(`SELECT c.relrowsecurity AS rls, c.relacl::text[] AS acl,
      (SELECT count(*)::int FROM pg_policy WHERE polrelid = c.oid) AS policies
    FROM pg_class c WHERE c.oid = 'public.answer_path_cutovers'::regclass`)).rows[0];
  assert.equal(meta.rls, true);
  assert.equal(meta.policies, 0);
  assert.deepEqual(meta.acl.filter((x) => !x.startsWith("postgres=")), ["service_role=r/postgres"], "service_role SELECT only");
  for (const role of ["anon", "authenticated"]) {
    assert.equal((await errOf(as(d, role, "SELECT * FROM public.answer_path_cutovers")))?.code, "42501", role);
  }
  assert.equal((await as(d, "service_role", "SELECT count(*)::int AS n FROM public.answer_path_cutovers"))[0].n, 1);
  for (const sql of ["UPDATE public.answer_path_cutovers SET effective_at = now()", "DELETE FROM public.answer_path_cutovers",
    "TRUNCATE public.answer_path_cutovers"]) {
    const e = await errOf(d.exec(sql));
    assert.match(e?.message ?? "", /answer_path_cutovers er append-only/, sql);
  }
  assert.ok(await errOf(d.exec("INSERT INTO public.answer_path_cutovers VALUES ('h5_m2', now(), now(), 'x')")), "no second T");
  assert.ok(await errOf(d.exec("INSERT INTO public.answer_path_cutovers VALUES ('h5_m3', now(), now(), 'x')")), "no other cutover");
  for (const role of ["anon", "authenticated", "service_role"]) {
    assert.equal((await d.query("SELECT has_function_privilege($1, 'public.answer_path_cutovers_append_only()', 'EXECUTE') AS x", [role])).rows[0].x, false, role);
  }

  const c = await checks(d);
  assert.equal(c["CUT-01"].ok, true);
  assert.equal(c["CUT-02"].ok, true, c["CUT-02"].actual);
  // An answer after T through H5: integrity block 2 stays exact (INT-B = 0).
  const qi = await serve(d, p, 4);
  assert.equal((await h5(d, p, qi, RIGHT(4), 1)).outcome, "recorded");
  const i2 = await integrity2(d);
  assert.equal(i2["CUT-T"].ok, true);
  assert.equal(i2["INT-B"].ok, true, `INT-B ${i2["INT-B"].actual}`);

  const fp = await fingerprint(d);
  const t = (await d.query("SELECT effective_at FROM public.answer_path_cutovers")).rows[0].effective_at;
  await apply(d, REGISTER);
  assert.deepEqual(await fingerprint(d), fp, "a second run changes nothing");
  assert.deepEqual((await d.query("SELECT effective_at FROM public.answer_path_cutovers")).rows[0].effective_at, t, "T is never moved");
  await d.close();
});

// ── Rollback R1 and a breach after T ─────────────────────────────────────────────────────────────
test("R1 reopens for service_role ONLY, keeps T and all history; INT-B then counts the legacy answers after T; re-closing restores CUT-01", async () => {
  const { d, p } = await inUse();
  await apply(d, CLOSE);
  await apply(d, REGISTER);
  const t = (await d.query("SELECT * FROM public.answer_path_cutovers")).rows;
  const h = await history(d);

  await d.exec(R1_SQL());
  for (const [role, expected] of [["service_role", true], ["anon", false], ["authenticated", false]]) {
    for (const fn of [PQA, PTA]) {
      assert.equal((await d.query("SELECT has_function_privilege($1, $2, 'EXECUTE') AS x", [role, fn])).rows[0].x, expected, `${role} ${fn}`);
    }
  }
  const pub = (await d.query(`SELECT count(*)::int AS n FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    WHERE p.oid IN (to_regprocedure($1), to_regprocedure($2)) AND a.grantee = 0`, [PQA, PTA])).rows[0].n;
  assert.equal(pub, 0, "never PUBLIC");
  assert.deepEqual(await history(d), h, "R1 writes nothing");
  assert.deepEqual((await d.query("SELECT * FROM public.answer_path_cutovers")).rows, t, "T stays");
  const c = await checks(d);
  assert.equal(c["CUT-01"].ok, false);
  assert.match(c["CUT-01"].actual, /service_role→service_role/);

  // A legacy answer after T (reopened): integrity block 2 reports it — the criterion is exact, not blind.
  const qi = await serve(d, p, 5);
  await legacyMc(d, "service_role", p, qi, RIGHT(5));
  const i2 = await integrity2(d);
  assert.equal(i2["INT-B"].actual, "1");
  assert.equal(i2["INT-B"].ok, false);

  await apply(d, CLOSE);
  assert.equal((await checks(d))["CUT-01"].ok, true, "closed again");
  await apply(d, REGISTER);
  assert.deepEqual((await d.query("SELECT * FROM public.answer_path_cutovers")).rows, t, "no new T without a new contract");
  await d.close();
});
