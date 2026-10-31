// RUNTIME proof for migration 20261026180000_recalculate_prestige_caller_scope (D-220). The SQL file is
// executed UNMODIFIED against a real PostgreSQL (PGlite, in-process — no Docker, no network) on a fixture
// whose prestige functions are the repository's own definitions from prestige.sql, with EXECUTE for
// PUBLIC, anon, authenticated and service_role as in production. Synthetic users only.
//
// How an API call is modelled (as PostgREST does it): the connection's session user is `authenticator`
// (NOINHERIT, member of anon/authenticated/service_role); per request it runs SET ROLE <role> and sets
// request.jwt.claims to the verified JWT payload. auth.uid() is Supabase's own definition. The internal
// database context (migrations, SQL editor) is the session user postgres without claims.
//
// Cases: before the migration the fixture reproduces the problem; after it:
//   anon · service_role via the API · pupil own id · pupil → other pupil · teacher own id ·
//   authenticated without subject · malformed subject · NULL id · refused calls change nothing ·
//   score identical to the old function · only prestige_score of the caller changes ·
//   grants (incl. implicit PUBLIC) / SECURITY DEFINER / search_path · internal back-fill of prestige.sql ·
//   only recalculate_prestige changes · idempotent · callers pass the session user's own id.
//
// HONEST LIMITS: PGlite is PostgreSQL 18, production 17.6; PostgREST itself and JWT signature checks are
// not in the loop (the claims are set as PostgREST sets them after verifying the signature).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIG = (f) => readFileSync(join(ROOT, "supabase", "migrations", f), "utf8").split("\r\n").join("\n");
const FILE = "20261026180000_recalculate_prestige_caller_scope.sql";

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

// The back-fill DO block of prestige.sql, verbatim.
function backfillBlock() {
  const src = MIG("prestige.sql");
  const start = src.indexOf("DO $$");
  assert.ok(start >= 0);
  const block = src.slice(start, src.indexOf("$$;", start + 5) + 3);
  assert.ok(block.includes("PERFORM public.recalculate_prestige(r.student_id);"));
  return block;
}

const P1 = "00000000-0000-4000-8000-0000000000a1"; // pupil of T1
const P2 = "00000000-0000-4000-8000-0000000000a2"; // pupil of T1
const T1 = "00000000-0000-4000-8000-0000000000b1"; // teacher (no student_progress row)
const UNKNOWN = "00000000-0000-4000-8000-00000000ffff";
const EXPECTED = { [P1]: 38, [P2]: 4, [T1]: 1 };

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
  INSERT INTO auth.users VALUES ('${P1}'), ('${P2}'), ('${T1}');

  CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text NOT NULL, teacher_id uuid);
  ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
  INSERT INTO public.profiles VALUES ('${P1}', 'student', '${T1}'), ('${P2}', 'student', '${T1}'), ('${T1}', 'teacher', NULL);

  CREATE TABLE public.student_progress (student_id uuid PRIMARY KEY, xp int, coins int, correct_answers int,
    current_streak int);
  ALTER TABLE public.student_progress ENABLE ROW LEVEL SECURITY;
  INSERT INTO public.student_progress VALUES ('${P1}', 100, 50, 10, 3), ('${P2}', 70, 20, 7, 1);

  CREATE TABLE public.shop_items (id text PRIMARY KEY, rarity text, slot_type text);
  CREATE TABLE public.user_items (user_id uuid, item_id text);
  CREATE TABLE public.themes (id text PRIMARY KEY, rarity text, always_owned boolean);
  CREATE TABLE public.user_themes (user_id uuid, theme_id text);
  CREATE TABLE public.achievements (id text PRIMARY KEY, rarity text);
  CREATE TABLE public.user_achievements (student_id uuid, achievement_id text);
  CREATE TABLE public.titles (id text PRIMARY KEY, name text, rarity text);
  CREATE TABLE public.user_titles (user_id uuid, title_id text);
  ALTER TABLE public.user_items ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.user_themes ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.user_titles ENABLE ROW LEVEL SECURITY;

  INSERT INTO public.shop_items VALUES ('i_c', 'common', 'hat'), ('i_l', 'legendary', 'shirt'),
    ('i_ns', 'rare', NULL), ('i_x', 'mythic', 'aura');
  INSERT INTO public.user_items VALUES ('${P1}', 'i_c'), ('${P1}', 'i_l'), ('${P1}', 'i_ns'), ('${P2}', 'i_c');
  INSERT INTO public.themes VALUES ('th_def', 'common', true), ('th_r', 'rare', false), ('th_u', 'uncommon', false);
  INSERT INTO public.user_themes VALUES ('${P1}', 'th_r'), ('${P2}', 'th_def');
  INSERT INTO public.achievements VALUES ('a1', 'uncommon'), ('a2', 'legendary');
  INSERT INTO public.user_achievements VALUES ('${P1}', 'a1'), ('${P1}', 'a2'), ('${P2}', 'a1');
  INSERT INTO public.titles VALUES ('t1', 'Titel', 'rare');
  INSERT INTO public.user_titles VALUES ('${P1}', 't1');
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
`;

// prestige.sql's column, helper and RPC — the production definitions — with production's open grants.
async function freshDb() {
  const db = new PGlite();
  await db.exec(FIXTURE);
  await db.exec(`ALTER TABLE public.student_progress ADD COLUMN IF NOT EXISTS prestige_score INTEGER NOT NULL DEFAULT 0;
                 UPDATE public.student_progress SET prestige_score = 999;`);
  await db.exec(fnStatement("prestige.sql", "prestige_weight"));
  await db.exec(fnStatement("prestige.sql", "recalculate_prestige"));
  await db.exec(`GRANT EXECUTE ON FUNCTION public.prestige_weight(text), public.recalculate_prestige(uuid)
                 TO PUBLIC, anon, authenticated, service_role;`);
  return db;
}

async function migrated() {
  const db = await freshDb();
  await db.exec(MIG(FILE));
  return db;
}

const q = (s) => s.split("'").join("''");

// One API request as PostgREST runs it: session user authenticator, SET ROLE, verified claims.
async function api(db, claims, sql) {
  try {
    await db.exec(`SET SESSION AUTHORIZATION authenticator;
      SELECT set_config('request.jwt.claims', '${q(JSON.stringify(claims))}', false),
             set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', '', false);
      SET ROLE ${claims.role};`);
    const r = await db.query(sql);
    return { ok: true, rows: r.rows };
  } catch (e) {
    return { ok: false, code: e.code, message: e.message };
  } finally {
    // PGlite does not restore the session user on RESET SESSION AUTHORIZATION; name it explicitly.
    await db.exec(`RESET ROLE; SET SESSION AUTHORIZATION postgres;
      SELECT set_config('request.jwt.claims', '', false), set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', '', false);`);
  }
}
async function internal(db, sql) {
  try { return { ok: true, rows: (await db.query(sql)).rows }; }
  catch (e) { return { ok: false, code: e.code, message: e.message }; }
}

const ANON = { role: "anon" };
const SERVICE = { role: "service_role" };
const AS = (sub) => ({ role: "authenticated", sub, aud: "authenticated" });
const CALL = (id) => `SELECT public.recalculate_prestige(${id === null ? "NULL" : `'${id}'`}) AS score`;

async function snapshot(db) {
  const out = {};
  for (const t of ["student_progress", "profiles", "user_items", "shop_items", "themes", "user_themes",
                   "achievements", "user_achievements", "titles", "user_titles"]) {
    out[t] = (await db.query(`SELECT to_jsonb(x) j FROM public.${t} x ORDER BY 1::text`)).rows.map((r) => JSON.stringify(r.j)).sort();
  }
  out.users = (await db.query("SELECT id FROM auth.users ORDER BY id")).rows;
  return out;
}
async function prestige(db, id) {
  const r = await db.query(`SELECT prestige_score FROM public.student_progress WHERE student_id = '${id}'`);
  return r.rows.length ? r.rows[0].prestige_score : null;
}

test("BEFORE: the fixture reproduces the problem — anon recalculates and reads another pupil's score", async () => {
  const db = await freshDb();
  const r = await api(db, ANON, CALL(P2));
  assert.equal(r.ok, true, r.message);
  assert.equal(r.rows[0].score, EXPECTED[P2]);
  assert.equal(await prestige(db, P2), EXPECTED[P2], "the anonymous call wrote student_progress");
  const s = await api(db, SERVICE, CALL(P1));
  assert.equal(s.ok, true, s.message);
});

test("anon through the API is refused (no EXECUTE) and changes nothing", async () => {
  const db = await migrated();
  const before = await snapshot(db);
  for (const id of [P1, P2, UNKNOWN]) {
    const r = await api(db, ANON, CALL(id));
    assert.equal(r.ok, false);
    assert.equal(r.code, "42501", r.message);
    assert.match(r.message, /permission denied for function recalculate_prestige/);
  }
  assert.deepEqual(await snapshot(db), before);
});

test("service_role through the API is refused (no EXECUTE) and changes nothing", async () => {
  const db = await migrated();
  const before = await snapshot(db);
  const r = await api(db, SERVICE, CALL(P1));
  assert.equal(r.ok, false);
  assert.equal(r.code, "42501", r.message);
  assert.deepEqual(await snapshot(db), before);
});

test("a signed-in pupil recalculates their own score; only their prestige_score changes", async () => {
  const db = await migrated();
  const before = await snapshot(db);
  const r = await api(db, AS(P1), CALL(P1));
  assert.equal(r.ok, true, r.message);
  assert.equal(r.rows[0].score, EXPECTED[P1]);
  const after = await snapshot(db);
  assert.equal(await prestige(db, P1), EXPECTED[P1]);
  assert.equal(await prestige(db, P2), 999, "other pupil untouched");
  const strip = (s) => ({ ...s, student_progress: s.student_progress.map((j) => { const o = JSON.parse(j); delete o.prestige_score; return JSON.stringify(o); }) });
  assert.deepEqual(strip(after), strip(before), "no other field or table changes");
});

test("a signed-in teacher may call for their own id (no progress row: score returned, nothing written)", async () => {
  const db = await migrated();
  const before = await snapshot(db);
  const r = await api(db, AS(T1), CALL(T1));
  assert.equal(r.ok, true, r.message);
  assert.equal(r.rows[0].score, EXPECTED[T1]);
  assert.deepEqual(await snapshot(db), before);
});

test("a signed-in user naming another id is refused with 'forbidden' and changes nothing", async () => {
  const db = await migrated();
  const before = await snapshot(db);
  for (const [who, id] of [[P1, P2], [P2, P1], [T1, P1], [P1, UNKNOWN]]) {
    const r = await api(db, AS(who), CALL(id));
    assert.equal(r.ok, false);
    assert.equal(r.code, "42501");
    assert.match(r.message, /forbidden/);
  }
  assert.deepEqual(await snapshot(db), before);
});

test("missing or invalid identity is refused: no subject, malformed subject, NULL id", async () => {
  const db = await migrated();
  const before = await snapshot(db);
  const noSub = await api(db, { role: "authenticated" }, CALL(P1));
  assert.equal(noSub.ok, false);
  assert.equal(noSub.code, "42501");
  assert.match(noSub.message, /not_authenticated/);
  // auth.uid() casts the subject, so an empty one fails before the function body runs.
  const emptySub = await api(db, { role: "authenticated", sub: "" }, CALL(P1));
  assert.equal(emptySub.ok, false);
  assert.equal(emptySub.code, "22P02", emptySub.message);
  const bad = await api(db, AS("not-a-uuid"), CALL(P1));
  assert.equal(bad.ok, false);
  assert.equal(bad.code, "22P02", bad.message);
  const nul = await api(db, AS(P1), CALL(null));
  assert.equal(nul.ok, false);
  assert.equal(nul.code, "22023");
  assert.match(nul.message, /invalid_user/);
  assert.deepEqual(await snapshot(db), before);
});

test("the calculation is unchanged: same score as the old function for every id", async () => {
  const oldDb = await freshDb();
  const newDb = await migrated();
  for (const id of [P1, P2, T1, UNKNOWN]) {
    const o = await internal(oldDb, CALL(id));
    const n = await internal(newDb, CALL(id));
    assert.equal(o.ok, true, o.message);
    assert.equal(n.ok, true, n.message);
    assert.equal(n.rows[0].score, o.rows[0].score, id);
  }
  assert.equal((await internal(newDb, CALL(P1))).rows[0].score, EXPECTED[P1]);
  // Self-calls through the API give the same numbers as the old function did.
  for (const id of [P1, P2]) {
    const n = await api(newDb, AS(id), CALL(id));
    assert.equal(n.rows[0].score, EXPECTED[id]);
  }
});

test("the calculation text is the old one, only schema-qualified", () => {
  const norm = (s) => s.replace(/--[^\n]*/g, "").replace(/\bpublic\./g, "").replace(/\s+/g, " ").trim();
  const calc = (fn) => {
    const a = fn.indexOf("SELECT COALESCE(SUM(");
    const b = fn.indexOf("RETURN v_score;");
    assert.ok(a > 0 && b > a);
    return norm(fn.slice(a, b));
  };
  const oldFn = fnStatement("prestige.sql", "recalculate_prestige");
  const newFn = fnStatement(FILE, "recalculate_prestige");
  assert.equal(calc(newFn), calc(oldFn));
  // Every relation and function in the new body is schema-qualified.
  for (const name of ["prestige_weight", "user_items", "shop_items", "themes", "user_themes",
                      "user_achievements", "achievements", "user_titles", "titles", "student_progress"]) {
    const unqualified = new RegExp(String.raw`(?<![.\w])` + name + String.raw`\b(?!\s*=)`, "g");
    const body = newFn.slice(newFn.indexOf("AS $$")).replace(/--[^\n]*/g, "");
    const hits = [...body.matchAll(unqualified)].filter((m) => !/\.\s*$/.test(body.slice(Math.max(0, m.index - 1), m.index)));
    assert.equal(hits.length, 0, `${name} unqualified`);
  }
});

test("privileges: EXECUTE only for the owner and authenticated, no PUBLIC; DEFINER; search_path ''", async () => {
  const db = await migrated();
  const f = (await db.query(`SELECT p.oid, p.proacl::text acl, p.prosecdef, p.proconfig, pg_get_userbyid(p.proowner) owner,
      pg_get_function_identity_arguments(p.oid) args, pg_get_function_result(p.oid) res
    FROM pg_proc p WHERE p.proname = 'recalculate_prestige' AND p.pronamespace = 'public'::regnamespace`)).rows;
  assert.equal(f.length, 1, "exactly one recalculate_prestige");
  const [fn] = f;
  assert.equal(fn.acl, `{${fn.owner}=X/${fn.owner},authenticated=X/${fn.owner}}`);
  assert.equal(fn.prosecdef, true);
  assert.deepEqual(fn.proconfig, ['search_path=""']);
  assert.equal(fn.args, "p_user_id uuid");
  assert.equal(fn.res, "integer");
  const pub = await db.query(`SELECT count(*)::int n FROM pg_proc p, aclexplode(p.proacl) a
    WHERE p.oid = ${fn.oid} AND a.grantee = 0`);
  assert.equal(pub.rows[0].n, 0, "no PUBLIC grant");
  for (const [role, want] of [["anon", false], ["service_role", false], ["authenticator", false], ["authenticated", true]]) {
    const r = await db.query(`SELECT has_function_privilege('${role}', ${fn.oid}, 'EXECUTE') x`);
    assert.equal(r.rows[0].x, want, role);
  }
  // A role that is in none of the API roles gets nothing through PUBLIC either.
  await db.exec("CREATE ROLE stranger NOLOGIN");
  assert.equal((await db.query(`SELECT has_function_privilege('stranger', ${fn.oid}, 'EXECUTE') x`)).rows[0].x, false);
});

test("internal context: prestige.sql's back-fill DO block still recalculates every pupil", async () => {
  const db = await migrated();
  assert.equal(await prestige(db, P1), 999);
  const r = await internal(db, backfillBlock());
  assert.equal(r.ok, true, r.message);
  assert.equal(await prestige(db, P1), EXPECTED[P1]);
  assert.equal(await prestige(db, P2), EXPECTED[P2]);
  // The internal path needs the session user postgres AND no subject: a non-internal login is refused.
  await db.exec("CREATE ROLE maint LOGIN NOSUPERUSER; GRANT authenticated TO maint;");
  try {
    await db.exec("SET SESSION AUTHORIZATION maint; SET ROLE authenticated;");
    await assert.rejects(db.query(CALL(P1)), /not_authenticated/);
  } finally {
    await db.exec("RESET ROLE; SET SESSION AUTHORIZATION postgres;");
  }
});

test("the migration changes only recalculate_prestige", async () => {
  const sig = async (db) => (await db.query(`SELECT p.proname, md5(p.prosrc) m, p.proacl::text acl, p.proconfig::text c
      FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname <> 'recalculate_prestige' ORDER BY 1`)).rows;
  const cols = async (db) => (await db.query(`SELECT table_name, column_name, data_type FROM information_schema.columns
      WHERE table_schema = 'public' ORDER BY 1, 2`)).rows;
  const a = await freshDb();
  const b = await migrated();
  assert.deepEqual(await sig(b), await sig(a));
  assert.deepEqual(await cols(b), await cols(a));
  assert.deepEqual(await snapshot(b), await snapshot(a));
  const stmts = MIG(FILE).replace(/--[^\n]*/g, "");
  assert.equal((stmts.match(/CREATE OR REPLACE FUNCTION/g) || []).length, 1);
  assert.doesNotMatch(stmts, /\b(ALTER|DROP|TRUNCATE|DELETE|INSERT)\b/i);
  assert.equal((stmts.match(/\bUPDATE\b/g) || []).length, 1, "only the function's own UPDATE");
});

test("the migration grants EXECUTE to authenticated itself, not only by inheriting the old ACL", async () => {
  const db = await freshDb();
  await db.exec("REVOKE ALL ON FUNCTION public.recalculate_prestige(uuid) FROM PUBLIC, anon, authenticated, service_role;");
  await db.exec(MIG(FILE));
  const acl = (await db.query("SELECT proacl::text a FROM pg_proc WHERE proname = 'recalculate_prestige'")).rows[0].a;
  assert.equal(acl, "{postgres=X/postgres,authenticated=X/postgres}");
  const r = await api(db, AS(P1), CALL(P1));
  assert.equal(r.ok, true, r.message);
  assert.equal(r.rows[0].score, EXPECTED[P1]);
});

test("re-running the migration is harmless", async () => {
  const db = await migrated();
  await db.exec(MIG(FILE));
  const acl = (await db.query("SELECT proacl::text a FROM pg_proc WHERE proname = 'recalculate_prestige'")).rows[0].a;
  assert.equal(acl, "{postgres=X/postgres,authenticated=X/postgres}");
  const r = await api(db, AS(P2), CALL(P2));
  assert.equal(r.rows[0].score, EXPECTED[P2]);
});

test("hub.html and collection.html pass the session user's own id", () => {
  for (const page of ["hub.html", "collection.html"]) {
    const src = readFileSync(join(ROOT, page), "utf8");
    const calls = [...src.matchAll(/rpc\(\s*"recalculate_prestige"\s*,\s*\{\s*p_user_id:\s*(\w+)\s*\}\s*\)/g)];
    assert.equal(calls.length, 1, page);
    assert.equal(calls[0][1], "userId");
    assert.match(src, /const userId = sessionData\.session\.user\.id;/, page);
  }
});
