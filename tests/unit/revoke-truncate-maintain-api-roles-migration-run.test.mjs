// RUNTIME proof for migration 20261027160000_revoke_truncate_maintain_api_roles (D-237). The SQL file is
// executed UNMODIFIED against a real PostgreSQL (PGlite, in-process — no Docker, no network).
//
// Fixture: every table and view in production's public schema, by name and kind, with production's
// exact relacl (read 2026-10-27, catalog only — PROD_ACL below). The relations are stubs (one column):
// this migration touches privileges only, so the columns do not matter — and the repository cannot
// recreate the real tables (D-110). Owner: a non-superuser role standing in for Supabase's postgres.
//
// HONEST LIMITS: PGlite is PostgreSQL 18, production 17.6 (MAINTAIN exists in both). Column-level
// grants are out of scope — this migration issues table-level REVOKEs only, which never touch them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILE = "20261027160000_revoke_truncate_maintain_api_roles.sql";
const SQL = readFileSync(join(ROOT, "supabase", "migrations", FILE), "utf8").split("\r\n").join("\n");

// Production relacl per relation in public, owner postgres (r = table, v = view). Read 2026-10-27.
const ALL4 = "postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres";
const SVC = "postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres";
const PROD_ACL = {
  achievements: ["r", ALL4],
  analytics_question_attempts: ["v", SVC],
  analytics_student_summary: ["v", SVC],
  attempt_stats: ["v", "postgres=arwdDxtm/postgres,authenticated=rm/postgres,service_role=arwdDxtm/postgres"],
  avatar_asset_review_queue: ["r", ALL4],
  avatar_asset_validation_runs: ["r", ALL4],
  avatar_assets: ["r", ALL4],
  avatar_generation_events: ["r", ALL4],
  avatar_generation_jobs: ["r", "postgres=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres"],
  avatar_ingestion_artifacts: ["r", ALL4],
  avatar_ingestion_events: ["r", ALL4],
  avatar_ingestion_jobs: ["r", ALL4],
  daily_login_rewards: ["r", ALL4],
  daily_quests: ["r", ALL4],
  password_help_requests: ["r", ALL4],
  placement_sessions: ["r", SVC],
  profiles: ["r", "postgres=arwdDxtm/postgres,anon=ardDxtm/postgres,authenticated=ardDxtm/postgres,service_role=arwdDxtm/postgres"],
  question_attempt_audit: ["r", SVC],
  question_diagnostics: ["v", SVC],
  question_instances: ["r", "postgres=arwdDxtm/postgres,anon=wdDxtm/postgres,authenticated=wdDxtm/postgres,service_role=arwdDxtm/postgres"],
  question_performance: ["v", "postgres=arwdDxtm/postgres,authenticated=rm/postgres,service_role=arwdDxtm/postgres"],
  questions: ["r", "postgres=arwdDxtm/postgres,anon=awdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres"],
  shop_items: ["r", ALL4],
  stabel_daily_rewards: ["r", SVC],
  streak_milestones: ["r", ALL4],
  student_answers: ["r", SVC],
  student_band_state: ["r", SVC],
  student_events: ["r", ALL4],
  student_progress: ["r", ALL4],
  student_quest_progress: ["r", ALL4],
  student_weekly_quest_progress: ["r", ALL4],
  teacher_password_resets: ["r", ALL4],
  teacher_spotlights: ["r", ALL4],
  themes: ["r", ALL4],
  titles: ["r", ALL4],
  user_achievements: ["r", ALL4],
  user_items: ["r", ALL4],
  user_themes: ["r", ALL4],
  user_titles: ["r", ALL4],
  weekly_quests: ["r", ALL4],
  ww2_taxonomy_audit: ["v", SVC],
};

const LETTER = { a: "INSERT", r: "SELECT", w: "UPDATE", d: "DELETE", D: "TRUNCATE", x: "REFERENCES", t: "TRIGGER", m: "MAINTAIN" };
const API = ["anon", "authenticated"];
const parse = (acl) => Object.fromEntries(acl.split(",").map((e) => { const [who, rest] = e.split("="); return [who, rest.split("/")[0]]; }));
const fmt = (entries) => Object.entries(entries).filter(([, p]) => p !== "").map(([who, p]) => `${who}=${p}/postgres`).join(",");

// The ACL production should have after the migration: TRUNCATE (D) and MAINTAIN (m) gone for the API roles.
function expected(acl) {
  const e = parse(acl);
  for (const r of API) if (e[r] !== undefined) e[r] = e[r].replace(/[Dm]/g, "");
  return fmt(e);
}

async function freshDb() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE dbowner LOGIN NOSUPERUSER BYPASSRLS;
    CREATE ROLE anon NOLOGIN NOINHERIT NOBYPASSRLS;
    CREATE ROLE authenticated NOLOGIN NOINHERIT NOBYPASSRLS;
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
    CREATE ROLE authenticator LOGIN NOINHERIT NOSUPERUSER;
    GRANT anon, authenticated, service_role TO authenticator;
    GRANT CREATE, USAGE ON SCHEMA public TO dbowner;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    SET ROLE dbowner;
    CREATE TABLE public._base (id int);`);
  for (const [name, [kind, acl]] of Object.entries(PROD_ACL)) {
    await db.exec(kind === "r"
      ? `CREATE TABLE public.${name} (id int); ALTER TABLE public.${name} ENABLE ROW LEVEL SECURITY;`
      : `CREATE VIEW public.${name} AS SELECT id FROM public._base;`);
    for (const [who, letters] of Object.entries(parse(acl))) {
      if (who === "postgres") continue;
      const privs = [...letters].map((l) => LETTER[l]).join(", ");
      await db.exec(`GRANT ${privs} ON public.${name} TO ${who};`);
    }
  }
  await db.exec("INSERT INTO public.profiles VALUES (1), (2); RESET ROLE;");
  return db;
}
async function migrate(db) {
  await db.exec("SET ROLE dbowner;");
  await db.exec(SQL);
  await db.exec("RESET ROLE;");
}
async function acls(db) {
  const r = await db.query(`SELECT relname, relacl::text acl FROM pg_class
    WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r', 'v') AND relname <> '_base' ORDER BY 1`);
  return Object.fromEntries(r.rows.map((x) => [x.relname, x.acl.slice(1, -1).split("dbowner").join("postgres")]));
}
async function as(db, role, sql) {
  try {
    await db.exec(`SET SESSION AUTHORIZATION authenticator; SET ROLE ${role};`);
    return { ok: true, rows: (await db.query(sql)).rows };
  } catch (e) {
    return { ok: false, code: e.code, message: e.message };
  } finally {
    await db.exec("RESET ROLE; SET SESSION AUTHORIZATION postgres;");
  }
}

test("fixture = production: every relation carries production's exact ACL", async () => {
  const db = await freshDb();
  const got = await acls(db);
  assert.deepEqual(Object.keys(got), Object.keys(PROD_ACL).sort());
  for (const [name, [, acl]] of Object.entries(PROD_ACL)) assert.equal(got[name], acl, name);
});

test("BEFORE: a signed-in user can TRUNCATE profiles — and TRUNCATE ignores RLS", async () => {
  const db = await freshDb();
  // RLS is on with no policy, so a plain DELETE as authenticated affects nothing ...
  await as(db, "authenticated", "DELETE FROM public.profiles");
  assert.equal((await db.query("SELECT count(*)::int n FROM public.profiles")).rows[0].n, 2);
  // ... but TRUNCATE empties the table.
  const r = await as(db, "authenticated", "TRUNCATE public.profiles");
  assert.equal(r.ok, true, r.message);
  assert.equal((await db.query("SELECT count(*)::int n FROM public.profiles")).rows[0].n, 0);
});

test("after: every relation's ACL is production's minus TRUNCATE and MAINTAIN for anon and authenticated, nothing else", async () => {
  const db = await freshDb();
  await migrate(db);
  const got = await acls(db);
  for (const [name, [, acl]] of Object.entries(PROD_ACL)) assert.equal(got[name], expected(acl), name);
});

test("after: no API role holds TRUNCATE or MAINTAIN anywhere in public; service_role keeps both", async () => {
  const db = await freshDb();
  await migrate(db);
  const r = await db.query(`SELECT c.relname, x.role, x.priv FROM pg_class c,
      (VALUES ('anon'), ('authenticated'), ('service_role')) x0(role) CROSS JOIN LATERAL
      (SELECT x0.role AS role, p AS priv FROM unnest(ARRAY['TRUNCATE', 'MAINTAIN']) p
        WHERE has_table_privilege(x0.role, c.oid, p)) x
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'v') AND c.relname <> '_base'`);
  assert.deepEqual(r.rows.filter((x) => x.role !== "service_role"), []);
  assert.equal(r.rows.filter((x) => x.role === "service_role").length, Object.keys(PROD_ACL).length * 2);
});

for (const role of API) {
  test(`after: ${role} TRUNCATE is refused (42501) and changes nothing; ${role} privileges otherwise intact`, async () => {
    const db = await freshDb();
    await migrate(db);
    const r = await as(db, role, "TRUNCATE public.profiles");
    assert.equal(r.ok, false);
    assert.equal(r.code, "42501", r.message);
    assert.equal((await db.query("SELECT count(*)::int n FROM public.profiles")).rows[0].n, 2);
    for (const p of ["SELECT", "INSERT", "DELETE"]) {
      assert.equal((await db.query(`SELECT has_table_privilege('${role}', 'public.achievements', '${p}') x`)).rows[0].x, true, p);
    }
  });
}

test("the migration lists exactly the relations that held TRUNCATE or MAINTAIN for an API role", () => {
  const listed = (re) => [...SQL.replace(/--[^\n]*/g, "").matchAll(re)].map((m) => m[1]);
  const truncTables = listed(/^\s+public\.(\w+),?$/gm);
  const needs = Object.entries(PROD_ACL).filter(([, [, acl]]) => API.some((r) => /[Dm]/.test(parse(acl)[r] ?? ""))).map(([n]) => n).sort();
  assert.deepEqual([...truncTables].sort(), needs);
  const noD = Object.entries(PROD_ACL).filter(([, [, acl]]) => API.every((r) => !/D/.test(parse(acl)[r] ?? ""))).map(([n]) => n);
  assert.deepEqual(noD.filter((n) => needs.includes(n)).sort(), ["attempt_stats", "question_performance"]);
});

test("the file only revokes: no GRANT, CREATE, DROP, ALTER, DML or service_role", () => {
  const stmts = SQL.replace(/--[^\n]*/g, "");
  assert.doesNotMatch(stmts, /\b(GRANT|CREATE|DROP|ALTER|INSERT|UPDATE|DELETE|TRUNCATE\s+public|cron)\b/i);
  assert.doesNotMatch(stmts, /service_role|PUBLIC\b/);
  assert.equal((stmts.match(/\bREVOKE\b/g) || []).length, 2);
});

test("re-running the migration is harmless", async () => {
  const db = await freshDb();
  await migrate(db);
  const once = await acls(db);
  await migrate(db);
  assert.deepEqual(await acls(db), once);
});
