// RUNTIME proof for migration 20261009100000_get_teacher_visibility_caller_scope.
//
// Both the CURRENT production definition and the new migration are executed UNMODIFIED against a
// real PostgreSQL (PGlite, in-process WebAssembly — no Docker, no network, no production call), and
// the tests call the function as the API roles do: SET ROLE anon / authenticated, with auth.uid()
// set per call. The same calls are made BEFORE and AFTER, so the defect and the fix are both shown
// as behaviour, not read off the source.
//
// "Before" is 20260608065035_display_name_from_email.sql. Its function body is byte-identical to
// production's (md5(prosrc) dbbe489e7e3b7e66fe86759a830f711c, measured read-only 2026-10-09), and
// the fixture grants EXECUTE to PUBLIC, anon, authenticated and service_role exactly as the live
// proacl shows.
//
// HONEST LIMITS:
//   - PGlite is PostgreSQL 18.x; production is 17.6.
//   - auth.users, auth.uid(), profiles, questions, question_instances and student_progress are
//     minimal stand-ins with only the columns the function reads. auth.uid() reads the test-set
//     `test.uid` setting.
//   - The API roles are created here, not Supabase's own; PostgREST is not in the loop.
//   - Passing here is not permission to deploy. Applying the migration needs its own owner
//     authorisation (D-110).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");
const FILE = "20261009100000_get_teacher_visibility_caller_scope.sql";
const BEFORE_FILE = "20260608065035_display_name_from_email.sql";
const AFTER = readFileSync(join(MIGRATIONS, FILE), "utf8");
const BEFORE = readFileSync(join(MIGRATIONS, BEFORE_FILE), "utf8");
const LIVE_PROSRC_MD5 = "dbbe489e7e3b7e66fe86759a830f711c";

// Executable SQL only: the header quotes the defect and names what the file must not do.
const CODE = AFTER.replace(/--.*$/gm, "").replace(/\s+/g, " ").trim();

const T_A   = "00000000-0000-4000-8000-0000000000a1"; // teacher A
const T_B   = "00000000-0000-4000-8000-0000000000b1"; // teacher B
const T_NEW = "00000000-0000-4000-8000-0000000000c1"; // teacher with no pupils
const A1    = "00000000-0000-4000-8000-0000000000a2"; // pupils of A
const A2    = "00000000-0000-4000-8000-0000000000a3";
const B1    = "00000000-0000-4000-8000-0000000000b2"; // pupil of B
const FREE  = "00000000-0000-4000-8000-0000000000f1"; // pupil with no teacher
const ADMIN = "00000000-0000-4000-8000-0000000000d1"; // super_admin
const GHOST = "00000000-0000-4000-8000-0000000000e1"; // auth user, no profile row

const FIXTURE = `
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  CREATE SCHEMA auth;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
  CREATE TABLE public.profiles (
    id uuid PRIMARY KEY, role text NOT NULL, teacher_id uuid,
    selected_grade smallint, placement_band smallint, active_domains text[]);
  CREATE TABLE public.questions (id uuid PRIMARY KEY, difficulty_band smallint);
  CREATE TABLE public.question_instances (
    id serial PRIMARY KEY, student_id uuid, question_id uuid, is_correct boolean,
    answered boolean, answered_at timestamptz, created_at timestamptz DEFAULT now());
  CREATE TABLE public.student_progress (student_id uuid PRIMARY KEY, total_attempts integer);

  INSERT INTO auth.users VALUES
    ('${T_A}', 'laerer.a@skole.test'), ('${T_B}', 'laerer.b@skole.test'), ('${T_NEW}', 'ny@skole.test'),
    ('${A1}', 'anna@skole.test'), ('${A2}', 'bo@skole.test'), ('${B1}', 'cy@skole.test'),
    ('${FREE}', 'fri@skole.test'), ('${ADMIN}', 'admin@skole.test'), ('${GHOST}', 'ghost@skole.test');
  INSERT INTO public.profiles (id, role, teacher_id, selected_grade, placement_band, active_domains) VALUES
    ('${T_A}', 'teacher', NULL, NULL, NULL, NULL),
    ('${T_B}', 'teacher', NULL, NULL, NULL, NULL),
    ('${T_NEW}', 'teacher', NULL, NULL, NULL, NULL),
    ('${A1}', 'student', '${T_A}', 7, 2, ARRAY['vikings']),
    ('${A2}', 'student', '${T_A}', 8, NULL, NULL),
    ('${B1}', 'student', '${T_B}', 9, 4, NULL),
    ('${FREE}', 'student', NULL, 7, NULL, NULL),
    ('${ADMIN}', 'super_admin', NULL, NULL, NULL, NULL);
  INSERT INTO public.questions VALUES
    ('10000000-0000-4000-8000-000000000001', 3), ('10000000-0000-4000-8000-000000000002', 4);
  INSERT INTO public.question_instances (student_id, question_id, is_correct, answered, answered_at) VALUES
    ('${A1}', '10000000-0000-4000-8000-000000000001', true,  true, now() - interval '3 hours'),
    ('${A1}', '10000000-0000-4000-8000-000000000002', true,  true, now() - interval '2 hours'),
    ('${A1}', '10000000-0000-4000-8000-000000000002', false, true, now() - interval '1 hours'),
    ('${B1}', '10000000-0000-4000-8000-000000000002', true,  true, now() - interval '1 hours');
  INSERT INTO public.student_progress VALUES ('${A1}', 3), ('${B1}', 1);
`;

// The production ACL as measured: PUBLIC, anon, authenticated and service_role all hold EXECUTE.
const LIVE_GRANTS = `
  GRANT EXECUTE ON FUNCTION public.get_teacher_visibility(uuid) TO PUBLIC, anon, authenticated, service_role;
`;

async function before() {
  const db = new PGlite();
  await db.exec(FIXTURE);
  await db.exec(BEFORE);
  await db.exec(LIVE_GRANTS);
  return db;
}

async function after() {
  const db = await before();
  await db.exec(AFTER);
  return db;
}

// Calls as an API role. Returns { rows } or { denied: true } when EXECUTE is refused.
async function call(db, role, uid, teacherArg) {
  await db.exec("RESET ROLE");
  await db.query("SELECT set_config('test.uid', $1, false)", [uid ?? ""]);
  await db.exec(`SET ROLE ${role}`);
  try {
    const res = await db.query("SELECT * FROM public.get_teacher_visibility($1::uuid)", [teacherArg]);
    return { rows: res.rows };
  } catch (e) {
    if (/permission denied/i.test(String(e?.message))) return { denied: true };
    throw e;
  } finally {
    await db.exec("RESET ROLE");
  }
}

const ids = (r) => (r.rows ?? []).map((x) => x.student_id).sort();

// ── the "before" state is production's ───────────────────────────────────────────────────────

test("the 'before' body is byte-identical to production's live prosrc", async () => {
  const db = await before();
  const res = await db.query("SELECT prosrc FROM pg_proc WHERE proname = 'get_teacher_visibility'");
  assert.equal(res.rows.length, 1);
  assert.equal(createHash("md5").update(res.rows[0].prosrc).digest("hex"), LIVE_PROSRC_MD5);
});

// ── the defect, reproduced ───────────────────────────────────────────────────────────────────

test("DEFECT (before): anon reads teacher A's class by passing A's id", async () => {
  const db = await before();
  assert.deepEqual(ids(await call(db, "anon", null, T_A)), [A1, A2].sort());
});

test("DEFECT (before): a pupil, and teacher B, read teacher A's class", async () => {
  const db = await before();
  assert.deepEqual(ids(await call(db, "authenticated", B1, T_A)), [A1, A2].sort());
  assert.deepEqual(ids(await call(db, "authenticated", T_B, T_A)), [A1, A2].sort());
});

// ── the fix: the access matrix ───────────────────────────────────────────────────────────────

// (1) anon cannot call it
test("1. anon is refused EXECUTE", async () => {
  const db = await after();
  assert.deepEqual(await call(db, "anon", null, T_A), { denied: true });
  assert.deepEqual(await call(db, "anon", T_A, T_A), { denied: true },
    "even with a forged uid, anon never reaches the body");
});

// (2) unauthenticated
test("2. a caller with no auth.uid() gets no rows", async () => {
  const db = await after();
  assert.deepEqual(await call(db, "authenticated", null, T_A), { rows: [] });
});

// (3) student
test("3. a pupil gets nothing — not their own class, not another", async () => {
  const db = await after();
  assert.deepEqual(await call(db, "authenticated", A1, T_A), { rows: [] });
  assert.deepEqual(await call(db, "authenticated", A1, A1), { rows: [] });
  assert.deepEqual(await call(db, "authenticated", FREE, T_B), { rows: [] });
});

// (4) teacher, own class
test("4. a teacher gets exactly their own pupils", async () => {
  const db = await after();
  assert.deepEqual(ids(await call(db, "authenticated", T_A, T_A)), [A1, A2].sort());
  assert.deepEqual(ids(await call(db, "authenticated", T_B, T_B)), [B1]);
  assert.deepEqual(await call(db, "authenticated", T_NEW, T_NEW), { rows: [] },
    "a new teacher with no pupils gets an empty list — the first-run state");
});

// (5) + (6) teacher, someone else's id
test("5/6. a teacher passing another teacher's id gets nothing — the argument cannot widen scope", async () => {
  const db = await after();
  assert.deepEqual(await call(db, "authenticated", T_B, T_A), { rows: [] });
  assert.deepEqual(await call(db, "authenticated", T_A, T_B), { rows: [] });
  assert.deepEqual(await call(db, "authenticated", T_A, A1), { rows: [] }, "a pupil id is not a way in");
  assert.deepEqual(await call(db, "authenticated", T_A, null), { rows: [] }, "NULL is not a wildcard");
});

test("refusals are indistinguishable from 'this teacher has no pupils' (no enumeration oracle)", async () => {
  const db = await after();
  const foreign = await call(db, "authenticated", T_B, T_A);
  const unknown = await call(db, "authenticated", T_B, "00000000-0000-4000-8000-00000000ffff");
  const empty   = await call(db, "authenticated", T_NEW, T_NEW);
  assert.deepEqual(foreign, unknown);
  assert.deepEqual(foreign, empty);
});

test("super_admin and a caller without a profile get nothing — no exemption was added", async () => {
  const db = await after();
  assert.deepEqual(await call(db, "authenticated", ADMIN, T_A), { rows: [] });
  assert.deepEqual(await call(db, "authenticated", ADMIN, ADMIN), { rows: [] });
  assert.deepEqual(await call(db, "authenticated", GHOST, GHOST), { rows: [] });
});

test("service_role is refused EXECUTE (no server-side caller exists)", async () => {
  const db = await after();
  assert.deepEqual(await call(db, "service_role", null, T_A), { denied: true });
});

// (8) return shape
test("8. the signature and RETURNS TABLE are unchanged, column for column", async () => {
  const shape = async (db) => (await db.query(`
    SELECT pg_get_function_identity_arguments(oid) AS args, pg_get_function_result(oid) AS result,
           prosecdef, provolatile
    FROM pg_proc WHERE proname = 'get_teacher_visibility'`)).rows;
  const b = await shape(await before());
  const a = await shape(await after());
  assert.equal(a.length, 1, "still exactly one overload");
  assert.equal(a[0].args, b[0].args);
  assert.equal(a[0].result, b[0].result);
  assert.equal(a[0].result,
    "TABLE(student_id uuid, display_name text, selected_grade smallint, placement_band smallint, " +
    "current_band smallint, total_attempts integer, recent_correct_pct integer, trend text, active_domains text[])");
  assert.equal(a[0].prosecdef, true);
  assert.equal(a[0].provolatile, "s");
});

// (9) the class overview's values are unchanged for the legitimate call
test("9. for a teacher's own call, every value is identical before and after", async () => {
  const b = (await call(await before(), "authenticated", T_A, T_A)).rows;
  const a = (await call(await after(), "authenticated", T_A, T_A)).rows;
  assert.deepEqual(a, b);
  const anna = a.find((r) => r.student_id === A1);
  assert.equal(anna.display_name, "anna");
  assert.equal(anna.selected_grade, 7);
  assert.equal(anna.placement_band, 2);
  assert.equal(anna.total_attempts, 3);
  assert.deepEqual(anna.active_domains, ["vikings"]);
  const bo = a.find((r) => r.student_id === A2);
  assert.equal(bo.current_band, 1, "no answers: COALESCE default kept");
  assert.equal(bo.trend, "stable");
});

// (10) the grants are pinned explicitly
test("10. after the migration only authenticated (and the owner) hold EXECUTE", async () => {
  const db = await after();
  const res = await db.query(`
    SELECT r AS role, has_function_privilege(r, 'public.get_teacher_visibility(uuid)', 'EXECUTE') AS x
    FROM unnest(ARRAY['anon','authenticated','service_role']) AS r`);
  assert.deepEqual(Object.fromEntries(res.rows.map((r) => [r.role, r.x])),
    { anon: false, authenticated: true, service_role: false });
  const acl = (await db.query("SELECT proacl::text AS acl FROM pg_proc WHERE proname = 'get_teacher_visibility'")).rows[0].acl;
  assert.ok(!/(^|[{,])=X/.test(acl), `PUBLIC must hold no EXECUTE: ${acl}`);
  assert.ok(!/anon=/.test(acl), `anon must not appear: ${acl}`);
});

test("10b. the migration is idempotent: applying it twice converges on the same state", async () => {
  const db = await after();
  await db.exec(AFTER);
  assert.deepEqual(ids(await call(db, "authenticated", T_A, T_A)), [A1, A2].sort());
  assert.deepEqual(await call(db, "anon", null, T_A), { denied: true });
});

// ── the file itself ──────────────────────────────────────────────────────────────────────────

test("the migration sorts after the newest live migration and its version is unique", () => {
  const files = readdirSync(MIGRATIONS).filter((f) => /^\d{14}_.+\.sql$/.test(f)).sort();
  assert.ok(files.includes(FILE));
  assert.equal(files.filter((f) => f.startsWith("20261009100000_")).length, 1);
  assert.ok("20261009100000" > "20261007192021", "after the newest remote version (2026-10-09)");
  assert.equal(files[files.length - 1], FILE, "it is the newest migration in the repository");
});

test("exactly one CREATE OR REPLACE, then the four privilege statements, for the one signature", () => {
  const stmts = CODE.replace(/\$\$[\s\S]*?\$\$/g, "$$BODY$$").split(";").map((s) => s.trim()).filter(Boolean);
  assert.equal(stmts.length, 5);
  assert.match(stmts[0], /^CREATE OR REPLACE FUNCTION public\.get_teacher_visibility\(p_teacher_id uuid\)/);
  const SIG = "ON FUNCTION public.get_teacher_visibility(uuid)";
  assert.deepEqual(stmts.slice(1), [
    `REVOKE EXECUTE ${SIG} FROM PUBLIC`,
    `REVOKE EXECUTE ${SIG} FROM anon`,
    `REVOKE EXECUTE ${SIG} FROM service_role`,
    `GRANT EXECUTE ${SIG} TO authenticated`,
  ]);
});

test("SECURITY DEFINER with the pinned search_path; role and caller from auth.uid(), never metadata", () => {
  assert.match(CODE, /SECURITY DEFINER SET search_path = public, pg_temp/);
  assert.match(CODE, /v_uid uuid := \(SELECT auth\.uid\(\)\)/);
  assert.match(CODE, /SELECT p\.role INTO v_role FROM public\.profiles p WHERE p\.id = v_uid/);
  assert.match(CODE, /IF p_teacher_id IS DISTINCT FROM v_uid THEN RETURN; END IF;/);
  assert.match(CODE, /WHERE p\.teacher_id = v_uid AND p\.role = 'student'/,
    "the pupil predicate uses the verified caller, not the argument");
  assert.ok(!/auth\.role\(\)|auth\.jwt\(\)|user_metadata|raw_user_meta_data/i.test(CODE));
});

test("every relation in the body is schema-qualified", () => {
  for (const t of ["public.profiles", "auth.users", "public.question_instances", "public.questions", "public.student_progress"]) {
    assert.ok(CODE.includes(t), t);
  }
  assert.ok(!/\b(FROM|JOIN)\s+(profiles|users|question_instances|questions|student_progress)\b/.test(CODE));
});

test("no table, RLS, policy, data, other function or DROP", () => {
  assert.equal(/\b(ALTER|CREATE|DROP)\s+(TABLE|POLICY|VIEW|INDEX|TRIGGER|SCHEMA)\b/i.test(CODE), false);
  assert.equal(/\b(INSERT INTO|UPDATE\s+public|DELETE FROM|TRUNCATE|ROW LEVEL SECURITY|DEFAULT PRIVILEGES)\b/i.test(CODE), false);
  assert.equal(/DROP\s+FUNCTION/i.test(CODE), false);
  const fns = [...CODE.matchAll(/FUNCTION\s+public\.(\w+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(fns)], ["get_teacher_visibility"]);
});

// ── (7) the existing consumer keeps working ──────────────────────────────────────────────────

test("7. js/teacher.js calls it only with the signed-in teacher's own id", () => {
  const js = readFileSync(join(ROOT, "js", "teacher.js"), "utf8");
  const calls = [...js.matchAll(/\.rpc\("get_teacher_visibility",\s*\{\s*p_teacher_id:\s*(\w+)/g)].map((m) => m[1]);
  assert.ok(calls.length >= 1);
  assert.deepEqual([...new Set(calls)], ["teacherId"]);
  assert.match(js, /const userId = sessionData\.session\.user\.id;/);
  assert.match(js, /const teacherId = await checkAuthAndRole\(\);/);
  assert.match(js, /profile\.role !== "teacher"/, "the page itself is teacher-only");
});

test("no other browser page, Edge Function or test helper calls it", () => {
  const hits = [];
  const walk = (rel) => {
    for (const e of readdirSync(join(ROOT, rel), { withFileTypes: true })) {
      if (["node_modules", ".git", "migrations", "dist-cloudflare", "test-results", "playwright-report"].includes(e.name)) continue;
      const child = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { walk(child); continue; }
      if (!/\.(m?js|ts|html)$/.test(e.name)) continue;
      if (child === "tests/unit/get-teacher-visibility-scope.test.mjs") continue;
      if (/\.rpc\(\s*["'`]get_teacher_visibility["'`]/.test(readFileSync(join(ROOT, child), "utf8"))) hits.push(child);
    }
  };
  for (const d of ["js", "supabase/functions", "tests", "tools", "src", "packages"]) {
    try { walk(d); } catch (e) { if (e.code !== "ENOENT") throw e; }
  }
  for (const f of readdirSync(ROOT).filter((f) => /\.(html|m?js)$/.test(f))) {
    if (/\.rpc\(\s*["'`]get_teacher_visibility["'`]/.test(readFileSync(join(ROOT, f), "utf8"))) hits.push(f);
  }
  assert.deepEqual(hits, ["js/teacher.js"]);
});
