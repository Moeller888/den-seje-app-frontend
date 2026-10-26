// RUNTIME proof for migration 20261025120000_student_rpc_caller_scope (caller scope for
// get_concept_states and evaluate_achievements). The SQL file is executed UNMODIFIED against a real
// PostgreSQL (PGlite, in-process — no Docker, no network) on a fixture whose two RPCs are the
// repository's own public definitions (20260526000100 and 20260518000500) with EXECUTE for PUBLIC, anon,
// authenticated and service_role. Synthetic users only.
//
// How an API call is modelled (as PostgREST does it): the connection's session user is `authenticator`
// (NOINHERIT, member of anon/authenticated/service_role); per request it runs SET ROLE <role> and sets
// request.jwt.claims to the verified JWT payload. auth.uid() is Supabase's own definition (legacy
// request.jwt.claim.sub first, then request.jwt.claims->>'sub'). The internal database context
// (migrations, SQL editor, pg_cron) is the session user postgres without claims.
//
// Cases: before the migration the fixture reproduces the problem; after it:
//   anon · pupil own · pupil → other pupil · teacher own pupil · teacher → foreign pupil · super_admin ·
//   Supabase anonymous sign-in user · authenticated without subject · service_role via the API ·
//   internal back-fill (the DO block of 20260518000500) · NULL / malformed / unknown id ·
//   refused calls change nothing · grants / SECURITY DEFINER / search_path · ladder unchanged.
//
// HONEST LIMITS: PGlite is PostgreSQL 18, production 17.6; PostgREST itself and JWT signature checks are
// not in the loop (the claims are set as PostgREST sets them after verifying the signature). PGlite's
// initial session user is a superuser, so "authenticator cannot switch session user" (a PostgreSQL rule
// for non-superuser logins) is not demonstrable here — the test pins that authenticator is no superuser
// and is not a member of postgres.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIG = (f) => readFileSync(join(ROOT, "supabase", "migrations", f), "utf8").split("\r\n").join("\n");
const FILE = "20261025120000_student_rpc_caller_scope.sql";

// One function statement out of a repository migration, verbatim.
function fnStatement(file, name) {
  const src = MIG(file);
  const start = src.search(new RegExp(String.raw`CREATE OR REPLACE FUNCTION public\.` + name + String.raw`\(`));
  assert.ok(start >= 0, `${name} in ${file}`);
  const tag = /AS\s+(\$[a-z_]*\$)/i.exec(src.slice(start));
  const bodyStart = src.indexOf(tag[1], start) + tag[1].length;
  const bodyEnd = src.indexOf(tag[1], bodyStart);
  return src.slice(start, src.indexOf(";", bodyEnd) + 1);
}

// The achievement back-fill DO block of 20260518000500, verbatim.
function backfillBlock() {
  const src = MIG("20260518000500_hidden_achievements.sql");
  const start = src.indexOf("DO $$");
  assert.ok(start >= 0);
  const end = src.indexOf("$$;", start + 5);
  const block = src.slice(start, end + 3);
  assert.ok(block.includes("PERFORM public.evaluate_achievements(v_student.id);"));
  return block;
}

const P1 = "00000000-0000-4000-8000-0000000000a1"; // pupil of T1
const P2 = "00000000-0000-4000-8000-0000000000a2"; // pupil of T2
const T1 = "00000000-0000-4000-8000-0000000000b1";
const T2 = "00000000-0000-4000-8000-0000000000b2";
const SA = "00000000-0000-4000-8000-0000000000c1"; // super_admin
const AN = "00000000-0000-4000-8000-0000000000e1"; // Supabase anonymous sign-in user (no profile)
const Q1 = "00000000-0000-4000-8000-0000000000d1";
const UNKNOWN = "00000000-0000-4000-8000-00000000ffff";

const FIXTURE = `
  CREATE ROLE anon NOLOGIN NOINHERIT NOBYPASSRLS;
  CREATE ROLE authenticated NOLOGIN NOINHERIT NOBYPASSRLS;
  CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  CREATE ROLE authenticator LOGIN NOINHERIT NOSUPERUSER;
  GRANT anon, authenticated, service_role TO authenticator;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY);
  -- Supabase's auth.uid().
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;
  INSERT INTO auth.users VALUES ('${P1}'), ('${P2}'), ('${T1}'), ('${T2}'), ('${SA}'), ('${AN}');

  CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text NOT NULL, teacher_id uuid, created_at timestamptz DEFAULT now());
  ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
  INSERT INTO public.profiles (id, role, teacher_id) VALUES
    ('${P1}', 'student', '${T1}'), ('${P2}', 'student', '${T2}'), ('${T1}', 'teacher', NULL), ('${T2}', 'teacher', NULL), ('${SA}', 'super_admin', NULL);

  CREATE TABLE public.questions (id uuid PRIMARY KEY, metadata jsonb);
  CREATE TABLE public.question_instances (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_id uuid, question_id uuid,
    answered boolean, was_correct boolean, misconception_signal text);
  ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.question_instances ENABLE ROW LEVEL SECURITY;
  INSERT INTO public.questions VALUES ('${Q1}', '{"concepts":["vikinger"]}');
  INSERT INTO public.question_instances (student_id, question_id, answered, was_correct) VALUES
    ('${P1}', '${Q1}', true, true), ('${P2}', '${Q1}', true, false);

  CREATE TABLE public.student_progress (student_id uuid PRIMARY KEY, correct_answers int, xp int, longest_streak int,
    night_correct boolean, best_session_streak int);
  INSERT INTO public.student_progress VALUES ('${P1}', 12, 50, 0, false, 0), ('${P2}', 12, 50, 0, false, 0);
  CREATE TABLE public.themes (id text PRIMARY KEY, rarity text);
  CREATE TABLE public.user_themes (user_id uuid, theme_id text);
  CREATE TABLE public.shop_items (id text PRIMARY KEY, rarity text);
  CREATE TABLE public.user_items (user_id uuid, item_id text);
  CREATE TABLE public.user_achievements (student_id uuid, achievement_id text, PRIMARY KEY (student_id, achievement_id));
  ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
`;

async function freshDb() {
  const db = new PGlite();
  await db.exec(FIXTURE);
  await db.exec(fnStatement("20260518000300_achievements.sql", "calculate_level_from_xp"));
  await db.exec(fnStatement("20260603074307_profiles_self_update_policy.sql", "auth_profile_role"));
  await db.exec(fnStatement("20260526000100_concept_state_rpc.sql", "get_concept_states"));
  await db.exec(fnStatement("20260518000500_hidden_achievements.sql", "evaluate_achievements"));
  await db.exec(`GRANT EXECUTE ON FUNCTION public.get_concept_states(uuid), public.evaluate_achievements(uuid) TO PUBLIC, anon, authenticated, service_role;
                 GRANT EXECUTE ON FUNCTION public.auth_profile_role(), public.calculate_level_from_xp(integer) TO PUBLIC;`);
  return db;
}

async function migrated() {
  const db = await freshDb();
  await db.exec(MIG(FILE));
  return db;
}

const q = (s) => s.split("'").join("''");

// One API request as PostgREST runs it: session user authenticator, SET ROLE, verified claims.
// Returns { ok, rows, session } or { ok:false, code, message }.
async function api(db, claims, sql) {
  const role = claims.role;
  try {
    await db.exec(`SET SESSION AUTHORIZATION authenticator;
      SELECT set_config('request.jwt.claims', '${q(JSON.stringify(claims))}', false),
             set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', '', false);
      SET ROLE ${role};`);
    const r = await db.query(sql);
    const s = await db.query("SELECT session_user::text su, current_user::text cu");
    return { ok: true, rows: r.rows, session: s.rows[0] };
  } catch (e) {
    return { ok: false, code: e.code, message: e.message };
  } finally {
    // PGlite does not restore the session user on RESET SESSION AUTHORIZATION; name it explicitly.
    await db.exec(`RESET ROLE; SET SESSION AUTHORIZATION postgres;
      SELECT set_config('request.jwt.claims', '', false), set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', '', false);`);
  }
}
// Internal database context: session user postgres, no claims (migration / SQL editor / pg_cron).
async function internal(db, sql) {
  try { return { ok: true, rows: (await db.query(sql)).rows }; }
  catch (e) { return { ok: false, code: e.code, message: e.message }; }
}

const ANON = { role: "anon" };
const user = (sub, extra = {}) => ({ role: "authenticated", sub, is_anonymous: false, ...extra });
const ANON_SIGNIN = user(AN, { is_anonymous: true });
const NO_SUB = { role: "authenticated" };
const SERVICE = { role: "service_role" };
const achievements = async (db) => (await db.query("SELECT student_id::text s, achievement_id a FROM public.user_achievements ORDER BY 1, 2")).rows;
const refused = (r, code, re) => { assert.equal(r.ok, false, "expected refusal"); if (code) assert.equal(r.code, code, r.message); if (re) assert.match(r.message, re); };

test("the request model is PostgREST's: session user authenticator, current user the API role", async () => {
  const db = await migrated();
  const r = await api(db, user(P1), "SELECT 1");
  assert.ok(r.ok, r.message);
  assert.deepEqual(r.session, { su: "authenticator", cu: "authenticated" });
  const roles = (await db.query(`SELECT rolsuper, pg_has_role('authenticator', 'postgres', 'MEMBER') m FROM pg_roles WHERE rolname = 'authenticator'`)).rows[0];
  assert.deepEqual([roles.rolsuper, roles.m], [false, false], "authenticator is no superuser and cannot become postgres");
  const sp = await api(db, user(P1), "SET ROLE postgres");
  refused(sp, null, /permission denied/);
});

test("BEFORE the migration the fixture reproduces the problem (anon reads / writes a foreign pupil)", async () => {
  const db = await freshDb();
  const r = await api(db, ANON, `SELECT public.get_concept_states('${P2}') AS s`);
  assert.ok(r.ok, r.message);
  assert.deepEqual(r.rows[0].s, { vikinger: "emerging" });
  const e = await api(db, ANON, `SELECT public.evaluate_achievements('${P2}') AS a`);
  assert.ok(e.ok, e.message);
  assert.ok(e.rows[0].a.includes("correct_10"));
  assert.equal((await achievements(db)).filter((x) => x.s === P2).length, 2);
});

// ── get_concept_states ──────────────────────────────────────────────────────────────────────
test("get_concept_states: anon has no EXECUTE", async () => {
  refused(await api(await migrated(), ANON, `SELECT public.get_concept_states('${P1}')`), "42501", /permission denied/);
});

test("get_concept_states: a pupil reads their own states", async () => {
  const r = await api(await migrated(), user(P1), `SELECT public.get_concept_states('${P1}') AS s`);
  assert.ok(r.ok, r.message);
  assert.deepEqual(r.rows[0].s, { vikinger: "emerging" });
});

test("get_concept_states: a pupil naming another pupil or an unknown id gets the same 'forbidden'", async () => {
  const db = await migrated();
  for (const id of [P2, UNKNOWN, T1]) refused(await api(db, user(P1), `SELECT public.get_concept_states('${id}')`), "42501", /forbidden/);
});

test("get_concept_states: a teacher reads their own pupil, not another teacher's; super_admin reads any", async () => {
  const db = await migrated();
  const own = await api(db, user(T1), `SELECT public.get_concept_states('${P1}') AS s`);
  assert.ok(own.ok, own.message);
  assert.deepEqual(own.rows[0].s, { vikinger: "emerging" });
  refused(await api(db, user(T1), `SELECT public.get_concept_states('${P2}')`), "42501", /forbidden/);
  const sa = await api(db, user(SA), `SELECT public.get_concept_states('${P2}') AS s`);
  assert.ok(sa.ok, sa.message);
  assert.deepEqual(sa.rows[0].s, { vikinger: "emerging" });
});

test("get_concept_states: a former teacher (role no longer 'teacher') loses access to their old pupils", async () => {
  const db = await migrated();
  await db.exec(`UPDATE public.profiles SET role = 'student' WHERE id = '${T1}'`);
  refused(await api(db, user(T1), `SELECT public.get_concept_states('${P1}')`), "42501", /forbidden/);
});

test("get_concept_states: a Supabase anonymous sign-in user (role authenticated) sees only themself", async () => {
  const db = await migrated();
  for (const id of [P1, P2]) refused(await api(db, ANON_SIGNIN, `SELECT public.get_concept_states('${id}')`), "42501", /forbidden/);
  const self = await api(db, ANON_SIGNIN, `SELECT public.get_concept_states('${AN}') AS s`);
  assert.ok(self.ok, self.message);
  assert.deepEqual(self.rows[0].s, {});
});

test("get_concept_states: role authenticated without a subject is 'not_authenticated', never internal", async () => {
  refused(await api(await migrated(), NO_SUB, `SELECT public.get_concept_states('${P1}')`), "42501", /not_authenticated/);
});

test("get_concept_states: service_role through the API has no EXECUTE", async () => {
  refused(await api(await migrated(), SERVICE, `SELECT public.get_concept_states('${P1}')`), "42501", /permission denied/);
});

test("get_concept_states: NULL and malformed ids are refused in a controlled way", async () => {
  const db = await migrated();
  refused(await api(db, user(P1), `SELECT public.get_concept_states(NULL)`), "22023", /invalid_student/);
  refused(await api(db, user(P1), `SELECT public.get_concept_states('not-a-uuid')`), "22P02", /invalid input syntax for type uuid/);
  refused(await internal(db, `SELECT public.get_concept_states(NULL)`), "22023", /invalid_student/);
});

test("get_concept_states: the internal database context still reads any pupil", async () => {
  const r = await internal(await migrated(), `SELECT public.get_concept_states('${P2}') AS s`);
  assert.ok(r.ok, r.message);
  assert.deepEqual(r.rows[0].s, { vikinger: "emerging" });
});

// ── evaluate_achievements ───────────────────────────────────────────────────────────────────
test("evaluate_achievements: anon and service_role through the API have no EXECUTE", async () => {
  const db = await migrated();
  for (const who of [ANON, SERVICE]) {
    refused(await api(db, who, `SELECT public.evaluate_achievements('${P2}')`), "42501", /permission denied/);
    refused(await api(db, who, `SELECT public.evaluate_achievements()`), "42501", /permission denied/);
  }
});

test("evaluate_achievements: the app's own call (no argument, signed-in pupil) still evaluates the pupil", async () => {
  const db = await migrated();
  const r = await api(db, user(P1), `SELECT public.evaluate_achievements() AS a`);
  assert.ok(r.ok, r.message);
  assert.deepEqual(r.rows[0].a, ["first_correct", "correct_10"]);
  const again = await api(db, user(P1), `SELECT public.evaluate_achievements('${P1}') AS a`);
  assert.ok(again.ok, again.message);
  assert.deepEqual(again.rows[0].a, [], "idempotent; naming oneself is allowed");
});

test("evaluate_achievements: a pupil, a teacher, a super_admin or an anonymous sign-in user naming another pupil is refused", async () => {
  const db = await migrated();
  for (const who of [user(P1), user(T2), user(SA), ANON_SIGNIN]) {
    refused(await api(db, who, `SELECT public.evaluate_achievements('${P2}')`), "42501", /forbidden/);
  }
  const anonSelf = await api(db, ANON_SIGNIN, `SELECT public.evaluate_achievements() AS a`);
  assert.ok(anonSelf.ok, anonSelf.message);
  assert.deepEqual(anonSelf.rows[0].a, [], "no progress row: nothing to award");
});

test("evaluate_achievements: role authenticated without a subject is 'not_authenticated', never internal", async () => {
  const db = await migrated();
  refused(await api(db, NO_SUB, `SELECT public.evaluate_achievements('${P2}')`), "42501", /not_authenticated/);
  refused(await api(db, NO_SUB, `SELECT public.evaluate_achievements()`), "42501", /not_authenticated/);
});

test("evaluate_achievements: the internal back-fill of 20260518000500 still works after the migration", async () => {
  const db = await migrated();
  const r = await internal(db, backfillBlock());
  assert.ok(r.ok, r.message);
  assert.deepEqual(await achievements(db), [
    { s: P1, a: "correct_10" }, { s: P1, a: "first_correct" },
    { s: P2, a: "correct_10" }, { s: P2, a: "first_correct" },
  ]);
  refused(await internal(db, `SELECT public.evaluate_achievements()`), "42501", /not_authenticated/);
});

test("refused calls leave user_achievements exactly as it was", async () => {
  const db = await migrated();
  for (const [who, sql] of [
    [ANON, `SELECT public.evaluate_achievements('${P2}')`],
    [SERVICE, `SELECT public.evaluate_achievements('${P2}')`],
    [user(P1), `SELECT public.evaluate_achievements('${P2}')`],
    [user(T2), `SELECT public.evaluate_achievements('${P2}')`],
    [ANON_SIGNIN, `SELECT public.evaluate_achievements('${P2}')`],
    [NO_SUB, `SELECT public.evaluate_achievements('${P2}')`],
    [ANON, `SELECT public.get_concept_states('${P1}')`],
  ]) assert.equal((await api(db, who, sql)).ok, false, sql);
  assert.deepEqual(await achievements(db), []);
});

// ── Catalogue state ─────────────────────────────────────────────────────────────────────────
test("after the migration: EXECUTE only for authenticated, SECURITY DEFINER, empty search_path, no helper left", async () => {
  const db = await migrated();
  const rows = (await db.query(`SELECT p.proname n, has_function_privilege('anon', p.oid, 'EXECUTE') anon,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') auth, has_function_privilege('service_role', p.oid, 'EXECUTE') svc,
      coalesce(array_to_string(p.proacl, ' '), '') acl, array_to_string(p.proconfig, ';') cfg, p.prosecdef sd
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('get_concept_states', 'evaluate_achievements') ORDER BY 1`)).rows;
  assert.equal(rows.length, 2);
  for (const r of rows) {
    assert.deepEqual([r.anon, r.auth, r.svc, r.sd], [false, true, false, true], r.n);
    assert.ok(!/(^|\s)=X/.test(r.acl), `${r.n}: no PUBLIC grant (${r.acl})`);
    assert.equal(r.cfg, 'search_path=""', r.n);
  }
  const helper = (await db.query(`SELECT count(*)::int c FROM pg_proc WHERE proname = 'request_api_role'`)).rows[0].c;
  assert.equal(helper, 0);
});

test("re-running the file changes nothing (grants and definitions are idempotent)", async () => {
  const db = await migrated();
  const snap = async () => (await db.query(`SELECT proname, prosrc, proacl::text, proconfig::text FROM pg_proc
    WHERE proname IN ('get_concept_states', 'evaluate_achievements') ORDER BY 1`)).rows;
  const before = await snap();
  await db.exec(MIG(FILE));
  assert.deepEqual(await snap(), before);
});

test("the achievement ladder is unchanged from 20260518000500 (only the identity head differs)", () => {
  const ladder = (sql) => sql.slice(sql.indexOf("SELECT correct_answers, xp, longest_streak"), sql.indexOf("RETURN to_jsonb(v_newly_unlocked);"));
  const before = ladder(fnStatement("20260518000500_hidden_achievements.sql", "evaluate_achievements"));
  const after = ladder(fnStatement(FILE, "evaluate_achievements"));
  assert.ok(before.length > 2000);
  assert.equal(after, before);
});

test("the concept-state aggregation is unchanged from 20260526000100 apart from schema-qualified tables", () => {
  const agg = (sql) => sql.slice(sql.indexOf("SELECT jsonb_object_agg"), sql.indexOf("RETURN COALESCE(v_result")).replace(/\s+/g, " ");
  const before = agg(fnStatement("20260526000100_concept_state_rpc.sql", "get_concept_states"))
    .replace("FROM question_instances qi", "FROM public.question_instances qi").replace("JOIN questions q", "JOIN public.questions q");
  const after = agg(fnStatement(FILE, "get_concept_states"));
  assert.ok(before.length > 500);
  assert.equal(after, before);
});
