// RUNTIME proof for migration 20261027160000_revoke_truncate_maintain_api_roles (D-237). The SQL file is
// executed UNMODIFIED against a real PostgreSQL (PGlite, in-process — no Docker, no network).
//
// Three different things, kept apart:
//   1. SNAPSHOT_2026_10_27 — the HISTORICAL catalog read this migration was written from.
//   2. SNAPSHOT_2026_11_04 — a later, DATED catalog read (pg_class.relacl and relkind of every table and
//      view in public, read-only, 2026-11-04). It is a record of that day, not a live comparison: no
//      test here reads production. PROD_ACL, the fixture's input, is this snapshot.
//   3. The SYNTHETIC PGlite fixture built from PROD_ACL. The relations are stubs (one column): this
//      migration touches privileges only, so the columns do not matter — and the repository cannot
//      recreate the real tables (D-110). Owner: a non-superuser role standing in for Supabase's postgres.
// Before applying, a fresh read-only preflight must show production still equals the snapshot used
// here (docs/decisions/D-237.md, "Produktion").
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
const SNAPSHOT_2026_10_27 = {
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

// Read-only catalog, 2026-11-04. Compared relation by relation with SNAPSHOT_2026_10_27: 40 of its 41
// relations are identical; these four entries are the whole difference.
const CHANGED_SINCE_2026_10_27 = {
  // Narrowed since: anon and authenticated lost INSERT, UPDATE and DELETE (D-278 reward integrity).
  student_weekly_quest_progress: ["r", "postgres=arwdDxtm/postgres,anon=rDxtm/postgres,authenticated=rDxtm/postgres,service_role=arwdDxtm/postgres"],
};
const ADDED_SINCE_2026_10_27 = {
  progress_corrections: ["r", "postgres=arwdDxtm/postgres"],
  student_level_fold_log: ["r", SVC],
  student_subject_level: ["r", "postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=r/postgres"],
};
const SNAPSHOT_2026_11_04 = Object.fromEntries(Object.entries({
  ...SNAPSHOT_2026_10_27, ...CHANGED_SINCE_2026_10_27, ...ADDED_SINCE_2026_10_27,
}).sort(([a], [b]) => a.localeCompare(b)));

// The fixture's input: the most recent verified snapshot BEFORE D-237. It stays the input after D-237 was
// applied: the tests below prove what the file does to that state, so it must not be replaced by the
// state after the migration.
const PROD_ACL = SNAPSHOT_2026_11_04;

// D-237 was applied in production on 2026-11-04 at 15:50:40 UTC (remote 20261104155040, owner-approved;
// docs/operations/production-actions/2026-11-04T1550Z-d237-applied.md). Two more dated, read-only records:
//   * PREFLIGHT_2026_11_04T1514Z — the catalog right before the application (preflight 15:14 UTC, re-read
//     15:49 UTC with the same fingerprint). It is SNAPSHOT_2026_11_04 plus question_attempts, which the
//     H5 bootstrap created at 09:54 UTC that day (no API role holds anything on it).
//   * AFTER_D237_2026_11_04T1551Z — the catalog after the application (postflight 15:51 UTC; production
//     still had exactly this ACL at 16:10 UTC). 45 relations.
// Neither is a live read: no test here reads production.
const PREFLIGHT_2026_11_04T1514Z = Object.fromEntries(Object.entries({
  ...SNAPSHOT_2026_11_04,
  question_attempts: ["r", "postgres=arwdDxtm/postgres,service_role=r/postgres"],
}).sort(([a], [b]) => a.localeCompare(b)));
const AFTER_D237_2026_11_04T1551Z = {
  achievements: ["r", "postgres=arwdDxtm/postgres,anon=arwdxt/postgres,authenticated=arwdxt/postgres,service_role=arwdDxtm/postgres"],
  analytics_question_attempts: ["v", "postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres"],
  analytics_student_summary: ["v", "postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres"],
  attempt_stats: ["v", "postgres=arwdDxtm/postgres,authenticated=r/postgres,service_role=arwdDxtm/postgres"],
  avatar_asset_review_queue: ["r", "postgres=arwdDxtm/postgres,anon=arwdxt/postgres,authenticated=arwdxt/postgres,service_role=arwdDxtm/postgres"],
  avatar_asset_validation_runs: ["r", "postgres=arwdDxtm/postgres,anon=arwdxt/postgres,authenticated=arwdxt/postgres,service_role=arwdDxtm/postgres"],
  avatar_assets: ["r", "postgres=arwdDxtm/postgres,anon=arwdxt/postgres,authenticated=arwdxt/postgres,service_role=arwdDxtm/postgres"],
  avatar_generation_events: ["r", "postgres=arwdDxtm/postgres,anon=arwdxt/postgres,authenticated=arwdxt/postgres,service_role=arwdDxtm/postgres"],
  avatar_generation_jobs: ["r", "postgres=arwdDxtm/postgres,authenticated=arwdxt/postgres,service_role=arwdDxtm/postgres"],
  avatar_ingestion_artifacts: ["r", "postgres=arwdDxtm/postgres,anon=arwdxt/postgres,authenticated=arwdxt/postgres,service_role=arwdDxtm/postgres"],
  avatar_ingestion_events: ["r", "postgres=arwdDxtm/postgres,anon=arwdxt/postgres,authenticated=arwdxt/postgres,service_role=arwdDxtm/postgres"],
  avatar_ingestion_jobs: ["r", "postgres=arwdDxtm/postgres,anon=arwdxt/postgres,authenticated=arwdxt/postgres,service_role=arwdDxtm/postgres"],
  daily_login_rewards: ["r", "postgres=arwdDxtm/postgres,anon=arwdxt/postgres,authenticated=arwdxt/postgres,service_role=arwdDxtm/postgres"],
  daily_quests: ["r", "postgres=arwdDxtm/postgres,anon=arwdxt/postgres,authenticated=arwdxt/postgres,service_role=arwdDxtm/postgres"],
  password_help_requests: ["r", "postgres=arwdDxtm/postgres,anon=arwdxt/postgres,authenticated=arwdxt/postgres,service_role=arwdDxtm/postgres"],
  placement_sessions: ["r", "postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres"],
  profiles: ["r", "postgres=arwdDxtm/postgres,anon=ardxt/postgres,authenticated=ardxt/postgres,service_role=arwdDxtm/postgres"],
  progress_corrections: ["r", "postgres=arwdDxtm/postgres"],
  question_attempt_audit: ["r", "postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres"],
  question_attempts: ["r", "postgres=arwdDxtm/postgres,service_role=r/postgres"],
  question_diagnostics: ["v", "postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres"],
  question_instances: ["r", "postgres=arwdDxtm/postgres,anon=wdxt/postgres,authenticated=wdxt/postgres,service_role=arwdDxtm/postgres"],
  question_performance: ["v", "postgres=arwdDxtm/postgres,authenticated=r/postgres,service_role=arwdDxtm/postgres"],
  questions: ["r", "postgres=arwdDxtm/postgres,anon=awdxt/postgres,authenticated=arwdxt/postgres,service_role=arwdDxtm/postgres"],
  shop_items: ["r", "postgres=arwdDxtm/postgres,anon=arwdxt/postgres,authenticated=arwdxt/postgres,service_role=arwdDxtm/postgres"],
  stabel_daily_rewards: ["r", "postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres"],
  streak_milestones: ["r", "postgres=arwdDxtm/postgres,anon=arwdxt/postgres,authenticated=arwdxt/postgres,service_role=arwdDxtm/postgres"],
  student_answers: ["r", "postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres"],
  student_band_state: ["r", "postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres"],
  student_events: ["r", "postgres=arwdDxtm/postgres,anon=arwdxt/postgres,authenticated=arwdxt/postgres,service_role=arwdDxtm/postgres"],
  student_level_fold_log: ["r", "postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres"],
  student_progress: ["r", "postgres=arwdDxtm/postgres,anon=arwdxt/postgres,authenticated=arwdxt/postgres,service_role=arwdDxtm/postgres"],
  student_quest_progress: ["r", "postgres=arwdDxtm/postgres,anon=arwdxt/postgres,authenticated=arwdxt/postgres,service_role=arwdDxtm/postgres"],
  student_subject_level: ["r", "postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=r/postgres"],
  student_weekly_quest_progress: ["r", "postgres=arwdDxtm/postgres,anon=rxt/postgres,authenticated=rxt/postgres,service_role=arwdDxtm/postgres"],
  teacher_password_resets: ["r", "postgres=arwdDxtm/postgres,anon=arwdxt/postgres,authenticated=arwdxt/postgres,service_role=arwdDxtm/postgres"],
  teacher_spotlights: ["r", "postgres=arwdDxtm/postgres,anon=arwdxt/postgres,authenticated=arwdxt/postgres,service_role=arwdDxtm/postgres"],
  themes: ["r", "postgres=arwdDxtm/postgres,anon=arwdxt/postgres,authenticated=arwdxt/postgres,service_role=arwdDxtm/postgres"],
  titles: ["r", "postgres=arwdDxtm/postgres,anon=arwdxt/postgres,authenticated=arwdxt/postgres,service_role=arwdDxtm/postgres"],
  user_achievements: ["r", "postgres=arwdDxtm/postgres,anon=arwdxt/postgres,authenticated=arwdxt/postgres,service_role=arwdDxtm/postgres"],
  user_items: ["r", "postgres=arwdDxtm/postgres,anon=arwdxt/postgres,authenticated=arwdxt/postgres,service_role=arwdDxtm/postgres"],
  user_themes: ["r", "postgres=arwdDxtm/postgres,anon=arwdxt/postgres,authenticated=arwdxt/postgres,service_role=arwdDxtm/postgres"],
  user_titles: ["r", "postgres=arwdDxtm/postgres,anon=arwdxt/postgres,authenticated=arwdxt/postgres,service_role=arwdDxtm/postgres"],
  weekly_quests: ["r", "postgres=arwdDxtm/postgres,anon=arwdxt/postgres,authenticated=arwdxt/postgres,service_role=arwdDxtm/postgres"],
  ww2_taxonomy_audit: ["v", "postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres"],
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

async function freshDb(snapshot = PROD_ACL) {
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
  for (const [name, [kind, acl]] of Object.entries(snapshot)) {
    await db.exec(kind === "r"
      ? `CREATE TABLE public.${name} (id int); ALTER TABLE public.${name} ENABLE ROW LEVEL SECURITY;`
      : `CREATE VIEW public.${name} AS SELECT id FROM public._base;`);
    // Makes the owner's ACL explicit, as production's is; PUBLIC holds nothing on these relations.
    await db.exec(`REVOKE ALL ON public.${name} FROM PUBLIC;`);
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

test("fixture = the 2026-11-04 catalog snapshot: every relation carries that snapshot's exact ACL (not a live read)", async () => {
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
  // service_role keeps exactly what the snapshot gives it, relation by relation (progress_corrections,
  // added after 2026-10-27, grants service_role nothing — so not "every relation").
  const svcExpected = Object.entries(PROD_ACL).flatMap(([name, [, acl]]) =>
    [["D", "TRUNCATE"], ["m", "MAINTAIN"]].filter(([l]) => (parse(acl).service_role ?? "").includes(l)).map(([, p]) => `${name}:${p}`)).sort();
  const svcGot = r.rows.filter((x) => x.role === "service_role").map((x) => `${x.relname}:${x.priv}`).sort();
  assert.deepEqual(svcGot, svcExpected);
  assert.equal(svcExpected.length, (Object.keys(PROD_ACL).length - 1) * 2, "all but progress_corrections");
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

test("the 2026-11-04 snapshot changes nothing for D-237: the same relations hold TRUNCATE or MAINTAIN as on 2026-10-27", () => {
  const needing = (snap) => Object.entries(snap).filter(([, [, acl]]) => API.some((r) => /[Dm]/.test(parse(acl)[r] ?? ""))).map(([n]) => n).sort();
  assert.deepEqual(needing(SNAPSHOT_2026_11_04), needing(SNAPSHOT_2026_10_27));
  assert.equal(needing(SNAPSHOT_2026_11_04).length, 32, "30 tables + 2 views");
  for (const name of Object.keys(ADDED_SINCE_2026_10_27)) assert.ok(!needing(SNAPSHOT_2026_11_04).includes(name), name);
});

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

// ── The read-only preflight and the rollback generator (docs/operations/revoke-truncate-maintain-*) ──

const PREFLIGHT = readFileSync(join(ROOT, "docs", "operations", "revoke-truncate-maintain-preflight.sql"), "utf8");
const statementsOf = (sql) => sql.split(/\r?\n/).filter((l) => !l.trim().startsWith("--")).join("\n")
  .split(/;\s*$/m).map((s) => s.trim()).filter(Boolean);
const section = (name) => {
  const m = PREFLIGHT.match(new RegExp(String.raw`-- BEGIN ${name}\r?\n([\s\S]*?)-- END ${name}`));
  assert.ok(m, `section ${name} present`);
  return m[1];
};

async function withLedger(db) {
  // Synthetic stand-in for Supabase's migration ledger: empty, as production's has no D-237 entry.
  await db.exec("CREATE SCHEMA supabase_migrations; CREATE TABLE supabase_migrations.schema_migrations (version text, name text);");
  return db;
}
/** Every statement of the preflight file, run in one READ ONLY transaction (a write would raise). */
async function runPreflight(db) {
  const results = [];
  await db.exec("BEGIN TRANSACTION READ ONLY");
  try {
    for (const s of statementsOf(PREFLIGHT)) results.push((await db.query(s)).rows);
  } finally {
    await db.exec("ROLLBACK");
  }
  return results;
}

test("preflight: the file is read-only SQL and every stop check returns 0 rows on the 2026-11-04 fixture", async () => {
  // Keywords are checked outside string literals (the generator's format() text contains 'GRANT'); every
  // statement must start with SELECT or WITH; and the READ ONLY transaction below would reject a write.
  const code = statementsOf(PREFLIGHT).map((s) => s.replace(/'(?:[^']|'')*'/g, "''"));
  assert.doesNotMatch(code.join("\n"), /\b(INSERT|UPDATE|DELETE|GRANT|REVOKE|CREATE|DROP|ALTER|TRUNCATE|SET|COPY|DO|CALL)\b/i);
  for (const s of code) assert.match(s, /^(SELECT|WITH)\b/i, s.slice(0, 60));
  const db = await withLedger(await freshDb());
  const [ledger, missing, drift, options, members, snapshot, rollback] = await runPreflight(db);
  assert.deepEqual([ledger, missing, drift, options, members], [[], [], [], [], []]);
  // _base is the fixture's own helper table (views select from it); it does not exist in production.
  assert.deepEqual(snapshot.map((r) => r.relname).filter((n) => n !== "_base"), Object.keys(PROD_ACL).sort(),
    "the snapshot covers every relation");
  assert.ok(rollback.length > 0, "the generator emits the rollback statements");
});

test("preflight: its expected list is exactly the migration's list", () => {
  const fromPreflight = [...section("EXPECTED-RELATIONS").matchAll(/\('([a-z_]+)'\)/g)].map((m) => m[1]).sort();
  const fromMigration = [...SQL.replace(/--[^\n]*/g, "").matchAll(/public\.(\w+)/g)].map((m) => m[1]).sort();
  assert.deepEqual(fromPreflight, fromMigration);
});

test("preflight: drift stops it — an extra API TRUNCATE grant, a grant option and an inherited role are each reported", async () => {
  const db = await withLedger(await freshDb());
  await db.exec(`SET ROLE dbowner;
    GRANT TRUNCATE ON public.student_subject_level TO authenticated;
    GRANT MAINTAIN ON public.profiles TO anon WITH GRANT OPTION;
    RESET ROLE;
    CREATE ROLE extra NOLOGIN; GRANT extra TO anon;`);
  const [, , drift, options, members] = await runPreflight(db);
  assert.deepEqual(drift.map((r) => [r.problem, r.relname]), [["holds but not listed", "student_subject_level"]]);
  assert.deepEqual(options.map((r) => [r.relname, r.grantee, r.privilege_type, r.is_grantable]), [["profiles", "anon", "MAINTAIN", true]]);
  assert.equal(members.length, 1);
});

test("rollback: the statements generated before the migration restore every ACL exactly, and change nothing else", async () => {
  const db = await withLedger(await freshDb());
  const before = await acls(db);
  await db.exec("BEGIN TRANSACTION READ ONLY");
  const generated = (await db.query(statementsOf(section("ROLLBACK-GENERATOR"))[0])).rows.map((r) => r.rollback_sql);
  await db.exec("ROLLBACK");
  for (const g of generated) assert.match(g, /^GRANT (TRUNCATE, MAINTAIN|TRUNCATE|MAINTAIN) ON TABLE public\.[a-z_]+ TO (anon|authenticated);$/, g);
  assert.ok(generated.every((g) => !/service_role|PUBLIC|ALL/.test(g)), "only the two API roles, only the two privileges");
  await migrate(db);
  assert.notDeepEqual(await acls(db), before, "the migration changed the ACLs");
  await db.exec("SET ROLE dbowner;");
  for (const g of generated) await db.exec(g);
  await db.exec("RESET ROLE;");
  assert.deepEqual(await acls(db), before, "rollback restores the snapshot's ACL on every relation");
});

test("production after D-237 (2026-11-04 15:51Z): the file applied to the 15:14Z preflight state gives exactly the verified after-state", async () => {
  // The two dated records cover the same 45 relations with the same kinds.
  assert.deepEqual(Object.keys(AFTER_D237_2026_11_04T1551Z).sort(), Object.keys(PREFLIGHT_2026_11_04T1514Z));
  for (const [name, [kind]] of Object.entries(PREFLIGHT_2026_11_04T1514Z)) assert.equal(AFTER_D237_2026_11_04T1551Z[name][0], kind, name);
  // The after-state is the preflight state minus TRUNCATE (D) and MAINTAIN (m) for anon and authenticated —
  // 120 single privileges in 61 role/relation entries — and nothing else.
  let removed = 0, entries = 0;
  for (const [name, [, acl]] of Object.entries(PREFLIGHT_2026_11_04T1514Z)) {
    assert.equal(AFTER_D237_2026_11_04T1551Z[name][1], expected(acl), name);
    for (const r of API) {
      const n = ((parse(acl)[r] ?? "").match(/[Dm]/g) ?? []).length;
      removed += n; if (n > 0) entries += 1;
    }
  }
  assert.equal(removed, 120, "single privileges removed");
  assert.equal(entries, 61, "role/relation entries changed");
  // And the unmodified file, run on that state, produces it.
  const db = await freshDb(PREFLIGHT_2026_11_04T1514Z);
  await migrate(db);
  const got = await acls(db);
  assert.deepEqual(Object.keys(got), Object.keys(AFTER_D237_2026_11_04T1551Z).sort());
  for (const [name, [, acl]] of Object.entries(AFTER_D237_2026_11_04T1551Z)) assert.equal(got[name], acl, name);
});
