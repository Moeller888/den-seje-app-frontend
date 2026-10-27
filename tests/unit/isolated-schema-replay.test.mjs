// D-110: the isolated E2E database's schema is built from the repository — CI baseline, CI function
// stubs, then the replay plan — and the build is fail-closed. Runs the REAL engine
// (tests/isolated/schema/replay.mjs) on PGlite with a minimal platform stub; the CI job runs the same
// engine on the Supabase local stack (PostgreSQL 17) through psql.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { replaySchema, baselineSql, stubsSql, migrationFiles, readMigration } from "../isolated/schema/replay.mjs";
import { planReplay, SCHEMA_PART, extractSchemaPart, MANUALLY_APPLIED_IN_PRODUCTION, preconditionCheckSql } from "../isolated/schema/replay-plan.mjs";
import { bootstrapMarkerSql } from "../isolated/seed/seed-guard.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PLATFORM = readFileSync(join(ROOT, "tests", "isolated", "schema", "pglite-platform.sql"), "utf8");
const TOKEN = "0123456789abcdef0123456789abcdef";

async function platformDb() {
  const db = new PGlite();
  await db.exec(PLATFORM);
  await db.exec(bootstrapMarkerSql(TOKEN));
  return db;
}
const executor = (db) => ({ exec: (s) => db.exec(s), query: async (s) => (await db.query(s)).rows });
const one = async (db, sql) => (await db.query(sql)).rows[0];

let db, result;
before(async () => {
  db = await platformDb();
  result = await replaySchema(executor(db));
});

test("the full replay succeeds: baseline, stubs and every planned migration apply with no failure", () => {
  assert.deepEqual(result.failures, []);
  const names = result.steps.map((s) => s.name);
  assert.equal(names[0], "(ci-baseline.sql)");
  assert.equal(names[1], "(ci-function-stubs.sql)");
  assert.ok(names.includes("prestige.sql"));
  assert.ok(names.indexOf("prestige.sql") === names.indexOf("20260519000300_leaderboard.sql") - 1, "prestige.sql right before its anchor");
  assert.equal(names.at(-1), "(question-row filter off)");
  const applied = result.plan.filter((p) => p.action === "apply").length;
  assert.equal(result.steps.length, applied + 2 + 1 + result.manual.length + 1);
});

test("the replayed schema has production's key objects", async () => {
  for (const rel of ["profiles", "questions", "question_instances", "student_progress", "avatar_generation_jobs", "titles", "weekly_quests"]) {
    assert.ok((await one(db, `SELECT to_regclass('public.${rel}') IS NOT NULL AS ok`)).ok, rel);
  }
  // 20261027120000 (D-211) replaced process_question_attempt only because the schema part of
  // 20261018143726 left exactly production's body (its md5 guard): the chain is byte-faithful.
  const pqa = await one(db, `SELECT md5(prosrc) m FROM pg_proc WHERE oid = 'public.process_question_attempt(uuid,uuid,text,bigint)'::regprocedure`);
  assert.equal(pqa.m, "8f698c5b45ecfe9a1988215dd8849d67");
  // 20260826000000's schema part: 'cancelled' is a valid job status.
  const chk = await one(db, `SELECT pg_get_constraintdef(oid) d FROM pg_constraint WHERE conname = 'generation_jobs_status_valid'`);
  assert.match(chk.d, /cancelled/);
});

test("no real question row lands: the content filter was on for the whole replay and is gone afterwards", async () => {
  assert.equal((await one(db, "SELECT count(*)::int n FROM public.questions")).n, 0);
  assert.equal((await one(db, "SELECT count(*)::int n FROM pg_trigger WHERE tgname = 'isolated_ci_discard_question_rows'")).n, 0);
});

test("review_answer stubs: production's signatures, EXECUTE for service_role only after the lockdown", async () => {
  for (const sig of ["public.review_answer(uuid,integer,text,uuid)", "public.review_answer(uuid,integer,text)"]) {
    const f = await one(db, `SELECT prosecdef, proconfig::text c FROM pg_proc WHERE oid = '${sig}'::regprocedure`);
    assert.equal(f.prosecdef, true, sig);
    assert.match(f.c, /search_path=public, pg_temp/);
    for (const [role, want] of [["anon", false], ["authenticated", false], ["service_role", true]]) {
      assert.equal((await one(db, `SELECT has_function_privilege('${role}', '${sig}', 'EXECUTE') x`)).x, want, `${sig} ${role}`);
    }
  }
});

// Stub behaviour, on a fresh database each (success AND failure paths).
async function stubDb() {
  const d = await platformDb();
  await d.exec(baselineSql());
  await d.exec(stubsSql());
  await d.exec(`INSERT INTO auth.users (id, email) VALUES
    ('00000000-0000-4000-8000-000000000001', 'pupil@e2e.invalid'),
    ('00000000-0000-4000-8000-000000000002', 'teacher@e2e.invalid');`);
  return d;
}
const P = "00000000-0000-4000-8000-000000000001", T = "00000000-0000-4000-8000-000000000002";

test("ensure_student_progress stub: a pupil gets one progress row with table defaults; a teacher gets none", async () => {
  const d = await stubDb();
  await d.exec(`INSERT INTO public.profiles (id, role) VALUES ('${P}', 'student'), ('${T}', 'teacher')`);
  const rows = (await d.query("SELECT student_id, xp, coins, level FROM public.student_progress")).rows;
  assert.deepEqual(rows, [{ student_id: P, xp: 0, coins: 0, level: 1 }]);
  // A second profile insert for the same id fails on the profile's own key, never duplicates progress.
  await assert.rejects(d.exec(`INSERT INTO public.profiles (id, role) VALUES ('${P}', 'student')`), /duplicate key/);
  assert.equal((await one(d, "SELECT count(*)::int n FROM public.student_progress")).n, 1);
});

async function withInstance() {
  const d = await stubDb();
  await d.exec(`INSERT INTO public.profiles (id, role) VALUES ('${P}', 'student');
    INSERT INTO public.questions (id, type, content, difficulty, question_type, answer_format, learning_objective, is_active)
      VALUES ('00000000-0000-4000-8000-0000000000aa', 'open', '{"question":"q","correct":"a","type":"text"}', 1, 'open', 'text', 'x', false);
    INSERT INTO public.question_instances (id, student_id, question_id, correct_answer, difficulty_at_time, mastery_snapshot)
      VALUES ('00000000-0000-4000-8000-0000000000bb', '${P}', '00000000-0000-4000-8000-0000000000aa', 'a', 1, 1);`);
  return d;
}
const I = "00000000-0000-4000-8000-0000000000bb";

test("review_answer(4) stub: records the review; an unknown instance raises (the Edge Function answers 500)", async () => {
  const d = await withInstance();
  await d.exec(`SELECT public.review_answer('${I}', 3, 'godt', '${T}')`);
  const r = await one(d, `SELECT teacher_score, teacher_feedback, reviewed_by, reviewed_at IS NOT NULL AS at FROM public.question_instances WHERE id = '${I}'`);
  assert.deepEqual(r, { teacher_score: 3, teacher_feedback: "godt", reviewed_by: T, at: true });
  await assert.rejects(d.exec(`SELECT public.review_answer('00000000-0000-4000-8000-0000000000cc', 3, 'x', '${T}')`), /Instance not found/);
  // No XP effect inside the stub (documented gap): progress unchanged.
  assert.equal((await one(d, `SELECT xp FROM public.student_progress WHERE student_id = '${P}'`)).xp, 0);
});

test("review_answer(3) stub: no caller → Unauthorized; first review ok; second → already_reviewed, unchanged", async () => {
  const d = await withInstance();
  await assert.rejects(d.exec(`SELECT public.review_answer('${I}', 2, 'x')`), /Unauthorized/);
  await d.exec(`SELECT set_config('request.jwt.claim.sub', '${T}', false)`);
  assert.deepEqual((await one(d, `SELECT public.review_answer('${I}', 2, 'første') r`)).r, { status: "ok" });
  assert.deepEqual((await one(d, `SELECT public.review_answer('${I}', 4, 'anden') r`)).r, { status: "already_reviewed" });
  const r = await one(d, `SELECT teacher_score, teacher_feedback, reviewed_by FROM public.question_instances WHERE id = '${I}'`);
  assert.deepEqual(r, { teacher_score: 2, teacher_feedback: "første", reviewed_by: T });
});

// ── Fail-closed engine ───────────────────────────────────────────────────────────────────────────
const fakeFiles = (extra) => {
  const files = migrationFiles();
  const sql = new Map(files.map((f) => [f, null]));
  for (const [f, s] of Object.entries(extra)) sql.set(f, s);
  return { files: [...sql.keys()], readSql: (f) => (sql.get(f) ?? readMigration(f)) };
};

test("fail-closed: one failing statement in any applied migration fails the replay and names the file", async () => {
  const d = await platformDb();
  const bad = "20991231000000_ci_broken.sql";
  const { files, readSql } = fakeFiles({ [bad]: "ALTER TABLE public.no_such_table ADD COLUMN x int;" });
  const r = await replaySchema({ ...executor(d), files, readSql });
  assert.deepEqual(r.failures.map((f) => f.name), [bad]);
  assert.match(r.failures[0].error, /no_such_table/);
});

test("fail-closed: a broken baseline stops the replay before any migration", async () => {
  const d = await platformDb();
  await d.exec("CREATE TABLE public.questions (id int)"); // the baseline's CREATE TABLE now collides
  const r = await replaySchema(executor(d));
  assert.equal(r.failures.length, 1);
  assert.equal(r.failures[0].name, "(ci-baseline.sql)");
  assert.equal(r.steps.length, 1);
});

test("fail-closed: without the stubs the lockdown's precondition check reports both review_answer overloads missing", async () => {
  const d = await platformDb();
  await d.exec(baselineSql());
  const missing = (await d.query(preconditionCheckSql("20260919000000_review_answer_execute_lockdown.sql"))).rows.map((x) => x.missing);
  assert.deepEqual(missing.sort(), ["public.review_answer(uuid,integer,text)", "public.review_answer(uuid,integer,text,uuid)"]);
  await d.exec(stubsSql());
  assert.deepEqual((await d.query(preconditionCheckSql("20260919000000_review_answer_execute_lockdown.sql"))).rows, []);
});

test("SCHEMA_PART: markers occur exactly once; the applied part is the schema statement, verbatim from the file", () => {
  for (const [file, part] of Object.entries(SCHEMA_PART)) {
    const sql = readMigration(file);
    const got = extractSchemaPart(file, sql);
    assert.ok(sql.includes(got.trim().replace(/;$/, "")), file);
    assert.match(got.replace(/--[^\n]*/g, "").trim(), /^(CREATE OR REPLACE FUNCTION|alter table)/i, file);
    assert.doesNotMatch(got, /\bfrom public\.avatar_generation_jobs\b|_d107_targets/i, `${file}: no data part`);
    assert.throws(() => extractSchemaPart(file, sql + "\n" + part.start), /exactly once/);
  }
});

test("manual files have an anchor that is an applied migration", () => {
  const { plan } = planReplay(migrationFiles(), readMigration);
  for (const [f, m] of Object.entries(MANUALLY_APPLIED_IN_PRODUCTION)) {
    assert.ok(plan.some((p) => p.file === m.before && p.action === "apply"), `${f} → ${m.before}`);
    assert.ok(m.reason.length > 20);
  }
});

test("the public baseline is sanitised: no function body, row data, address, key, token or URL", () => {
  const sql = baselineSql();
  const code = sql.replace(/--[^\n]*/g, "");
  assert.doesNotMatch(code, /CREATE (OR REPLACE )?FUNCTION|\$function\$|\$\$/i, "no function body");
  assert.doesNotMatch(code, /\bINSERT\s+INTO\b|\bCOPY\b|\bUPDATE\s+public\.\w+\s+SET\b/i, "no rows");
  assert.doesNotMatch(sql, /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, "no e-mail address");
  assert.doesNotMatch(sql, /https?:\/\//, "no URL");
  assert.doesNotMatch(sql, /eyJ[A-Za-z0-9_-]{10,}|sb_(publishable|secret)_|service_role_key/i, "no key or token");
  assert.doesNotMatch(sql, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, "no uuid literal");
  assert.doesNotMatch(sql, /tjzbehwfagiwpwodsgwg|lærlig|xn--lrlig/i, "no production identifier");
});

test("the stubs file carries no production body: every stub is short and declares what it does not prove", () => {
  const sql = stubsSql();
  assert.equal((sql.match(/CREATE OR REPLACE FUNCTION/g) || []).length, 3);
  assert.equal((sql.match(/^--\s+NOT:/gm) || []).length, 3, "each stub documents its gap");
  assert.doesNotMatch(sql, /🔥|xp \+ v_xp_gain|coalesce\(coins/i, "not production's text");
});

test("catalog data files write only to catalog tables (plus the one documented profiles UPDATE)", async () => {
  const { CATALOG_DATA, CATALOG_TABLES } = await import("../isolated/schema/replay-plan.mjs");
  for (const f of Object.keys(CATALOG_DATA)) {
    const sql = readMigration(f).replace(/--[^\n]*/g, "");
    const writes = [...sql.matchAll(/\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:public\.)?"?([a-z_]+)"?/gi)].map((m) => m[2].toLowerCase());
    assert.ok(writes.length > 0, `${f} writes something`);
    for (const t of writes) {
      const ok = CATALOG_TABLES.includes(t) || (f === "20260521000001_wings_to_back_slot.sql" && t === "profiles");
      assert.ok(ok, `${f} writes ${t}`);
    }
    assert.doesNotMatch(sql, /\bDELETE\b|\bTRUNCATE\b/i, `${f} deletes nothing`);
  }
});

// The replay CLI runs assertSeedTarget BEFORE the schema exists (public.questions absent).
const GUARD_ENV = Object.freeze({
  ISOLATED_E2E: "1", ISOLATED_BASE_URL: "http://127.0.0.1:8788", ISOLATED_SUPABASE_URL: "http://127.0.0.1:54321",
  ISOLATED_DB_TOKEN: TOKEN,
});

test("target check before the schema: an empty public schema with this run's marker passes", async () => {
  const { assertSeedTarget } = await import("../isolated/seed/seed-guard.mjs");
  const d = await platformDb();
  const r = await assertSeedTarget({ query: async (s) => (await d.query(s)).rows, env: GUARD_ENV });
  assert.deepEqual(r, { ok: true, questions: 0, users: 0 });
});

test("target check before the schema: public with tables but no questions table is refused, nothing executed", async () => {
  const { assertSeedTarget } = await import("../isolated/seed/seed-guard.mjs");
  const d = await platformDb();
  await d.exec("CREATE TABLE public.some_real_table (id int)");
  await assert.rejects(assertSeedTarget({ query: async (s) => (await d.query(s)).rows, env: GUARD_ENV }), /public has tables but no questions table/);
});
