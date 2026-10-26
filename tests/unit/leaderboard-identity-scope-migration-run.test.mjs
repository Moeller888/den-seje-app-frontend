// RUNTIME proof for migration 20261026120000_leaderboard_identity_scope (who may see names and ids on
// the global leaderboard, D-209). The SQL file is executed UNMODIFIED against a real PostgreSQL (PGlite,
// in-process — no Docker, no network) on a fixture whose get_leaderboard is the repository's own public
// definition (20260519000300) with EXECUTE for PUBLIC, anon, authenticated and service_role, and whose
// profiles table carries production's RLS policies and grants. Synthetic users only.
//
// API calls are modelled as PostgREST runs them (see student-rpc-caller-scope-migration-run.test.mjs):
// session user `authenticator` (NOINHERIT), SET ROLE <role>, request.jwt.claims set to the JWT payload.
//
// Fixture: class A (teacher TA, pupils A1, A2), class B (TB, B1, B2), class C (TC, 50 filler pupils),
// a pupil without a teacher (S0), a super_admin, an account without a profile (NP). Every email local
// part is a unique marker (navn-a1, navn-b1, …) so a leak anywhere in a result is found by a text scan.
// Ranks: B1 1 · A2 2 · B2 and F00 tie at 3 · F01..F46 5..50 · F47..F49 51..53 · A1 54 · S0 55.
//
// HONEST LIMITS: PGlite is PostgreSQL 18, production 17.6; PostgREST and JWT signature checks are not in
// the loop. The residual risk of exact xp / title on other classes' rows is documented in D-209 and in the
// migration header; it is deliberately NOT pinned here as a requirement.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIG = (f) => readFileSync(join(ROOT, "supabase", "migrations", f), "utf8").split("\r\n").join("\n");
const FILE = "20261026120000_leaderboard_identity_scope.sql";

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

const id = (n) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const TA = id(0xa0), A1 = id(0xa1), A2 = id(0xa2);
const TB = id(0xb0), B1 = id(0xb1), B2 = id(0xb2);
const TC = id(0xc0);
const S0 = id(0xd0); // pupil without a teacher
const SA = id(0xe0); // super_admin
const NP = id(0xf0); // account without a profile
const F = Array.from({ length: 50 }, (_, i) => id(0x1000 + i)); // class C fillers

const pupils = [
  // [id, teacher, prestige, xp, title, marker]
  [B1, TB, 100, 500, "legend", "navn-b1"],
  [A2, TA, 90, 450, "rare", "navn-a2"],
  [B2, TB, 80, 400, null, "navn-b2"],
  [F[0], TC, 80, 400, null, "navn-f00"],
  ...F.slice(1).map((f, i) => [f, TC, 70 - i, 100, null, `navn-f${String(i + 1).padStart(2, "0")}`]),
  [A1, TA, 0, 10, null, "navn-a1"],
  [S0, null, 0, 5, null, "navn-s0"],
];
const others = [[TA, "teacher", "navn-ta"], [TB, "teacher", "navn-tb"], [TC, "teacher", "navn-tc"], [SA, "super_admin", "navn-sa"]];

const FIXTURE = `
  CREATE ROLE anon NOLOGIN NOINHERIT NOBYPASSRLS;
  CREATE ROLE authenticated NOLOGIN NOINHERIT NOBYPASSRLS;
  CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  CREATE ROLE authenticator LOGIN NOINHERIT NOSUPERUSER;
  GRANT anon, authenticated, service_role TO authenticator;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
  -- Supabase's auth.uid().
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;

  CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text NOT NULL, teacher_id uuid, active_title text,
    current_band smallint, placement_band smallint);
  CREATE TABLE public.student_progress (student_id uuid PRIMARY KEY, prestige_score int NOT NULL DEFAULT 0, xp int NOT NULL DEFAULT 0);
  CREATE TABLE public.titles (id text PRIMARY KEY, name text, rarity text);
  INSERT INTO public.titles VALUES ('legend', 'Legenden', 'legendary'), ('rare', 'Opdageren', 'rare');
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

  INSERT INTO auth.users VALUES
    ${[...pupils.map((p) => `('${p[0]}', '${p[5]}@skole.example')`), ...others.map((o) => `('${o[0]}', '${o[2]}@skole.example')`),
       `('${NP}', 'navn-np@skole.example')`].join(",\n    ")};
  INSERT INTO public.profiles (id, role, teacher_id, active_title) VALUES
    ${[...pupils.map((p) => `('${p[0]}', 'student', ${p[1] ? `'${p[1]}'` : "NULL"}, ${p[4] ? `'${p[4]}'` : "NULL"})`),
       ...others.map((o) => `('${o[0]}', '${o[1]}', NULL, NULL)`)].join(",\n    ")};
  INSERT INTO public.student_progress VALUES
    ${pupils.map((p) => `('${p[0]}', ${p[2]}, ${p[3]})`).join(",\n    ")};

  -- Production's profiles model (verified read-only 2026-10-26): RLS on; SELECT own row or a teacher's own
  -- pupils; UPDATE own row without changing role, columns current_band/placement_band only; no INSERT or
  -- DELETE policy although the table-level INSERT grant exists.
  ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.student_progress ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.titles ENABLE ROW LEVEL SECURITY;
  GRANT SELECT, INSERT ON public.profiles TO anon, authenticated;
  GRANT UPDATE (current_band, placement_band) ON public.profiles TO authenticated;
  GRANT SELECT ON public.student_progress, public.titles TO anon, authenticated;
  CREATE POLICY student_progress_own ON public.student_progress FOR SELECT USING (student_id = auth.uid());
  CREATE POLICY titles_select_all ON public.titles FOR SELECT TO authenticated, anon USING (true);
`;

async function freshDb() {
  const db = new PGlite();
  await db.exec(FIXTURE);
  await db.exec(fnStatement("20260603074307_profiles_self_update_policy.sql", "auth_profile_role"));
  await db.exec(`GRANT EXECUTE ON FUNCTION public.auth_profile_role() TO PUBLIC;
    CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
      USING (id = (SELECT auth.uid()) OR (role = 'student' AND teacher_id = (SELECT auth.uid())
             AND (SELECT public.auth_profile_role()) = 'teacher'));
    CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE TO authenticated
      USING (id = auth.uid()) WITH CHECK (id = auth.uid() AND role = public.auth_profile_role());`);
  await db.exec(fnStatement("20260519000300_leaderboard.sql", "get_leaderboard"));
  await db.exec(`GRANT EXECUTE ON FUNCTION public.get_leaderboard() TO PUBLIC, anon, authenticated, service_role;`);
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
    return { ok: true, rows: (await db.query(sql)).rows };
  } catch (e) {
    return { ok: false, code: e.code, message: e.message };
  } finally {
    // PGlite does not restore the session user on RESET SESSION AUTHORIZATION; name it explicitly.
    await db.exec(`RESET ROLE; SET SESSION AUTHORIZATION postgres;
      SELECT set_config('request.jwt.claims', '', false), set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', '', false);`);
  }
}

const ANON = { role: "anon" };
const SERVICE = { role: "service_role" };
const NO_SUB = { role: "authenticated" };
const user = (sub) => ({ role: "authenticated", sub, is_anonymous: false });
const refused = (r, code, re) => { assert.equal(r.ok, false, "expected refusal"); if (code) assert.equal(r.code, code, r.message); if (re) assert.match(r.message, re); };
const LB = "SELECT * FROM public.get_leaderboard()";

async function board(db, who) {
  const r = await api(db, user(who), LB);
  assert.ok(r.ok, r.message);
  return r.rows;
}
const markerOf = (pid) => pupils.find((p) => p[0] === pid)[5];
const named = (rows) => rows.filter((r) => r.display_name !== "Elev").map((r) => r.display_name).sort();
const withId = (rows) => rows.filter((r) => r.user_id !== null).map((r) => r.user_id);

// A leak scan over the whole result: no marker and no id of the listed pupils anywhere in it.
function assertNoTrace(rows, pids, label) {
  const text = JSON.stringify(rows);
  for (const pid of pids) {
    assert.ok(!text.includes(markerOf(pid)), `${label}: name of ${markerOf(pid)} leaked`);
    assert.ok(!text.includes(pid), `${label}: id of ${markerOf(pid)} leaked`);
  }
}
const classB = [B1, B2];
const classC = F;

test("BEFORE the migration the fixture reproduces the problem (names and ids of other classes, no profile needed)", async () => {
  const db = await freshDb();
  const rows = await board(db, A1);
  assert.ok(rows.some((r) => r.display_name === "navn-b1" && r.user_id === B1), "a pupil of class A sees B1 by name and id");
  const np = await api(db, user(NP), LB);
  assert.ok(np.ok, np.message);
  assert.equal(np.rows.length, 50, "an account without a profile sees the whole list");
});

// ── Refusals ─────────────────────────────────────────────────────────────────────────────────
test("anon and service_role through the API have no EXECUTE", async () => {
  const db = await migrated();
  for (const who of [ANON, SERVICE]) refused(await api(db, who, LB), "42501", /permission denied/);
});

test("role authenticated without a subject is 'not_authenticated'", async () => {
  refused(await api(await migrated(), NO_SUB, LB), "42501", /not_authenticated/);
});

test("an account without a Lærlig profile is 'forbidden'", async () => {
  refused(await api(await migrated(), user(NP), LB), "42501", /forbidden/);
});

// ── Identity per role ────────────────────────────────────────────────────────────────────────
test("a pupil of class A: own name and id, classmates' names, nothing identifying from classes B or C", async () => {
  const rows = await board(await migrated(), A1);
  assert.deepEqual(named(rows), ["navn-a1", "navn-a2"]);
  assert.deepEqual(withId(rows), [A1]);
  const own = rows.find((r) => r.is_current_user);
  assert.deepEqual([own.user_id, own.display_name, Number(own.player_rank)], [A1, "navn-a1", 54]);
  assertNoTrace(rows, [...classB, ...classC], "A1");
});

test("a pupil of class B: own name and classmate, nothing identifying from classes A or C", async () => {
  const rows = await board(await migrated(), B1);
  assert.deepEqual(named(rows), ["navn-b1", "navn-b2"]);
  assert.deepEqual(withId(rows), [B1]);
  assertNoTrace(rows, [A1, A2, ...classC], "B1");
});

test("a pupil without a teacher sees only their own name", async () => {
  const rows = await board(await migrated(), S0);
  assert.deepEqual(named(rows), ["navn-s0"]);
  assert.deepEqual(withId(rows), [S0]);
  assertNoTrace(rows, [A1, A2, ...classB, ...classC], "S0");
});

test("a teacher sees their own pupils' names (no ids) and nothing identifying from other classes", async () => {
  const db = await migrated();
  const ta = await board(db, TA);
  assert.deepEqual(named(ta), ["navn-a2"], "A1 is outside the top 50 and is not the caller");
  assert.deepEqual(withId(ta), []);
  assert.ok(!ta.some((r) => r.is_current_user), "teachers are not ranked");
  assertNoTrace(ta, [...classB, ...classC], "TA");
  const tb = await board(db, TB);
  assert.deepEqual(named(tb), ["navn-b1", "navn-b2"]);
  assertNoTrace(tb, [A1, A2, ...classC], "TB");
});

test("a former teacher (role no longer 'teacher') sees no names of their old pupils", async () => {
  const db = await migrated();
  await db.exec(`UPDATE public.profiles SET role = 'student' WHERE id = '${TA}'`);
  const rows = await board(db, TA);
  assert.deepEqual(named(rows), []);
  assertNoTrace(rows, [A1, A2], "former teacher");
});

test("a super_admin sees the ranking with no names and no ids", async () => {
  const rows = await board(await migrated(), SA);
  assert.equal(rows.length, 50);
  assert.deepEqual(named(rows), []);
  assert.deepEqual(withId(rows), []);
});

// ── A pupil cannot move into another class ───────────────────────────────────────────────────
test("a pupil cannot change their own teacher_id or role, and an account without a profile cannot create one", async () => {
  const db = await migrated();
  refused(await api(db, user(A1), `UPDATE public.profiles SET teacher_id = '${TB}' WHERE id = '${A1}'`), "42501", /permission denied/);
  refused(await api(db, user(A1), `UPDATE public.profiles SET role = 'teacher' WHERE id = '${A1}'`), "42501", /permission denied/);
  refused(await api(db, user(NP), `INSERT INTO public.profiles (id, role, teacher_id) VALUES ('${NP}', 'student', '${TB}')`),
    "42501", /row-level security/);
  const p = (await db.query(`SELECT role, teacher_id::text t FROM public.profiles WHERE id = '${A1}'`)).rows[0];
  assert.deepEqual([p.role, p.t], ["student", TA]);
  assert.equal((await db.query(`SELECT count(*)::int c FROM public.profiles WHERE id = '${NP}'`)).rows[0].c, 0);
});

// ── Ranking unchanged ────────────────────────────────────────────────────────────────────────
test("rank, order, prestige, xp, title and is_current_user are exactly as before for every role", async () => {
  const before = await freshDb();
  const after = await migrated();
  const shape = (rows) => rows.map((r) => [Number(r.player_rank), r.prestige_score, r.xp, r.active_title, r.title_name, r.title_rarity, r.is_current_user])
    .sort((x, y) => x[0] - y[0] || y[2] - x[2] || String(x[3]).localeCompare(String(y[3])));
  for (const who of [A1, B1, S0, TA, SA]) {
    assert.deepEqual(shape(await board(after, who)), shape(await board(before, who)), who);
  }
  const ranks = (await board(after, A1)).map((r) => Number(r.player_rank));
  assert.equal(ranks.filter((r) => r === 3).length, 2, "ties share a rank");
  assert.equal(ranks.filter((r) => r <= 50).length, 50);
});

// ── Catalogue state ──────────────────────────────────────────────────────────────────────────
test("EXECUTE: anon, authenticated and service_role before; authenticated only after; signature unchanged", async () => {
  const cat = async (db) => (await db.query(`SELECT has_function_privilege('anon', p.oid, 'EXECUTE') anon,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') auth, has_function_privilege('service_role', p.oid, 'EXECUTE') svc,
      coalesce(array_to_string(p.proacl, ' '), '') acl, array_to_string(p.proconfig, ';') cfg, p.prosecdef sd,
      pg_get_function_result(p.oid) res, pg_get_function_identity_arguments(p.oid) args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_leaderboard'`)).rows;
  const b = await cat(await freshDb());
  const a = await cat(await migrated());
  assert.equal(a.length, 1);
  assert.deepEqual([b[0].anon, b[0].auth, b[0].svc], [true, true, true]);
  assert.deepEqual([a[0].anon, a[0].auth, a[0].svc, a[0].sd], [false, true, false, true]);
  assert.ok(!/(^|\s)=X/.test(a[0].acl), `no PUBLIC grant (${a[0].acl})`);
  assert.equal(a[0].cfg, 'search_path=""');
  assert.deepEqual([a[0].res, a[0].args], [b[0].res, b[0].args]);
});

test("re-running the file changes nothing (grants and definition are idempotent)", async () => {
  const db = await migrated();
  const snap = async () => (await db.query(`SELECT prosrc, proacl::text, proconfig::text FROM pg_proc WHERE proname = 'get_leaderboard'`)).rows;
  const before = await snap();
  await db.exec(MIG(FILE));
  assert.deepEqual(await snap(), before);
});

// ── Boundaries ───────────────────────────────────────────────────────────────────────────────
test("the migration touches only get_leaderboard: no D-206 function, no grant to anon", () => {
  const sql = MIG(FILE).split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
  assert.ok(!/get_concept_states|evaluate_achievements/.test(sql));
  assert.deepEqual(sql.match(/CREATE OR REPLACE FUNCTION public\.\w+/g), ["CREATE OR REPLACE FUNCTION public.get_leaderboard"]);
  assert.ok(!/GRANT[^;]*\banon\b/i.test(sql));
});

test("leaderboard.html calls get_leaderboard without arguments and never reads user_id", () => {
  const html = readFileSync(join(ROOT, "leaderboard.html"), "utf8");
  assert.match(html, /supabase\.rpc\("get_leaderboard"\)/);
  assert.ok(!/\buser_id\b/.test(html));
  assert.match(html, /escapeHtml\(entry\.display_name \?\? "—"\)/);
});
