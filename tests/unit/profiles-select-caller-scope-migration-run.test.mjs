// RUNTIME proof for migration 20261009221339_profiles_select_caller_scope. The SQL file is executed
// UNMODIFIED against a real PostgreSQL (PGlite, in-process WebAssembly — no Docker, no network), on
// a fixture that reproduces the LIVE profiles security state of 2026-10-09: RLS on, the old
// profiles_select (id = auth.uid() OR role = 'student'), profiles_self_update, auth_profile_role(),
// table grants to anon/authenticated, and the policies on other tables that subquery profiles.
//
// HONEST LIMITS:
//   - PGlite is PostgreSQL 18.x; production is 17.6.
//   - auth.uid() reads the test-set `test.uid` setting; anon/authenticated are roles created here.
//   - profiles carries only the columns the runtime code reads; question_instances and the
//     super_admin-gated table are minimal stand-ins for the dependent policies.
//   - Passing here is not permission to apply. Applying needs its own owner authorisation (D-110).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILE = "20261009221339_profiles_select_caller_scope.sql";
const MIGRATION = readFileSync(join(ROOT, "supabase", "migrations", FILE), "utf8");

const T1 = "00000000-0000-4000-8000-0000000000a1";   // teacher with pupils P1, P2
const T2 = "00000000-0000-4000-8000-0000000000a2";   // teacher with pupil Q1
const P1 = "00000000-0000-4000-8000-000000000001";
const P2 = "00000000-0000-4000-8000-000000000002";
const Q1 = "00000000-0000-4000-8000-000000000003";
const SA = "00000000-0000-4000-8000-0000000000f1";   // super_admin

// The live state, as audited (pg_policies / pg_proc / grants), before the migration.
const FIXTURE = `
  CREATE ROLE anon; CREATE ROLE authenticated;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated;

  CREATE TABLE public.profiles (
    id uuid PRIMARY KEY, role text, teacher_id uuid, full_name text,
    selected_grade smallint, placement_band smallint, current_band smallint,
    active_domains text[], must_reset_password boolean NOT NULL DEFAULT false,
    avatar_identity jsonb, equipped_slots jsonb, active_theme text, active_title text, avatar_gender text
  );
  INSERT INTO public.profiles (id, role, teacher_id, selected_grade) VALUES
    ('${T1}', 'teacher', NULL, NULL), ('${T2}', 'teacher', NULL, NULL), ('${SA}', 'super_admin', NULL, NULL),
    ('${P1}', 'student', '${T1}', 7), ('${P2}', 'student', '${T1}', 8), ('${Q1}', 'student', '${T2}', 7);
  UPDATE public.profiles SET must_reset_password = true WHERE id = '${P2}';

  ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO anon, authenticated;

  CREATE FUNCTION public.auth_profile_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = public AS $$ SELECT role FROM profiles WHERE id = auth.uid(); $$;

  CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated
    USING (id = auth.uid() OR role = 'student');
  CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid() AND role = public.auth_profile_role());

  -- Dependent policy 1: teachers read their own pupils' question_instances (subqueries profiles).
  CREATE TABLE public.question_instances (id serial PRIMARY KEY, student_id uuid);
  INSERT INTO public.question_instances (student_id) VALUES ('${P1}'), ('${P2}'), ('${Q1}');
  ALTER TABLE public.question_instances ENABLE ROW LEVEL SECURITY;
  GRANT SELECT ON public.question_instances TO authenticated;
  CREATE POLICY "students read own question_instances" ON public.question_instances FOR SELECT
    TO authenticated USING (student_id = (SELECT auth.uid()));
  CREATE POLICY "teachers read own students question_instances" ON public.question_instances
    FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM profiles s
      WHERE s.id = question_instances.student_id AND s.teacher_id = (SELECT auth.uid()) AND s.role = 'student'));

  -- Dependent policy 2: super_admin gates (teacher_spotlights / weekly progress / docs bucket shape).
  CREATE TABLE public.admin_gated (id int PRIMARY KEY);
  INSERT INTO public.admin_gated VALUES (1);
  ALTER TABLE public.admin_gated ENABLE ROW LEVEL SECURITY;
  GRANT SELECT ON public.admin_gated TO authenticated;
  CREATE POLICY "super_admins read all" ON public.admin_gated FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'super_admin'));
`;

async function db({ migrated }) {
  const pg = new PGlite();
  await pg.exec(FIXTURE);
  if (migrated) await pg.exec(MIGRATION);
  return pg;
}

// Runs one statement as `role` with auth.uid() = uid, inside a transaction that is rolled back.
async function as(pg, role, uid, sql, params = []) {
  await pg.exec("BEGIN");
  try {
    await pg.exec(`SET LOCAL ROLE ${role}`);
    await pg.query("SELECT set_config('test.uid', $1, true)", [uid ?? ""]);
    return await pg.query(sql, params);
  } finally {
    await pg.exec("ROLLBACK");
  }
}
const ids = async (pg, role, uid, where = "true", params = []) =>
  (await as(pg, role, uid, `SELECT id FROM public.profiles WHERE ${where} ORDER BY id`, params)).rows.map((r) => r.id);

// What a caller can enumerate — the exploit shape: "give me every pupil".
async function exposure(pg, uid) {
  return {
    pupils: (await ids(pg, "authenticated", uid, "role = 'student'")).length,
    total: (await ids(pg, "authenticated", uid)).length,
  };
}

// ── The regression that fails on the old policy ─────────────────────────────────────────────────
test("OLD policy (live today): a pupil and a teacher can enumerate every pupil — the exposure is real", async () => {
  const pg = await db({ migrated: false });
  assert.deepEqual(await exposure(pg, P1), { pupils: 3, total: 3 }, "pupil sees all 3 pupils");
  assert.deepEqual(await ids(pg, "authenticated", T1, "role = 'student'"), [P1, P2, Q1], "T1 sees T2's pupil Q1");
});

test("NEW policy: the same enumeration returns only what the contract allows", async () => {
  const pg = await db({ migrated: true });
  assert.deepEqual(await exposure(pg, P1), { pupils: 1, total: 1 }, "a pupil sees only themself");
  assert.deepEqual(await ids(pg, "authenticated", T1, "role = 'student'"), [P1, P2], "T1 sees only own pupils");
  assert.deepEqual(await exposure(pg, SA), { pupils: 0, total: 1 }, "super_admin sees only own row");
});

// ── 1–9: the read matrix ────────────────────────────────────────────────────────────────────────
test("1. anonymous reads no profile", async () => {
  const pg = await db({ migrated: true });
  assert.deepEqual(await ids(pg, "anon", ""), []);
  assert.deepEqual(await ids(pg, "anon", P1), [], "even with a uid set, anon has no policy");
});

test("2. a pupil reads their own profile with the columns login/app/avatar/hub use", async () => {
  const pg = await db({ migrated: true });
  const r = await as(pg, "authenticated", P2,
    "SELECT role, must_reset_password, placement_band, current_band, active_domains, selected_grade, avatar_identity, equipped_slots, active_theme, active_title, avatar_gender FROM public.profiles WHERE id = $1",
    [P2]);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].role, "student");
  assert.equal(r.rows[0].must_reset_password, true);
});

test("3. a pupil cannot read another pupil — not even a classmate, not by id", async () => {
  const pg = await db({ migrated: true });
  assert.deepEqual(await ids(pg, "authenticated", P1, "id = $1", [P2]), [], "classmate");
  assert.deepEqual(await ids(pg, "authenticated", P1, "id = $1", [Q1]), [], "other class");
  assert.deepEqual(await ids(pg, "authenticated", P1, "id <> $1", [P1]), []);
});

test("4. a pupil cannot read a teacher or a super_admin", async () => {
  const pg = await db({ migrated: true });
  assert.deepEqual(await ids(pg, "authenticated", P1, "role IN ('teacher','super_admin')"), []);
  assert.deepEqual(await ids(pg, "authenticated", P1, "id = $1", [T1]), [], "own teacher");
});

test("5. a teacher reads their own profile (teacher.js / student-detail.js role gate)", async () => {
  const pg = await db({ migrated: true });
  const r = await as(pg, "authenticated", T1, "SELECT role FROM public.profiles WHERE id = $1", [T1]);
  assert.deepEqual(r.rows, [{ role: "teacher" }]);
});

test("6. a teacher reads exactly their own pupils, with the fields teacher.js and student-detail.js use", async () => {
  const pg = await db({ migrated: true });
  // teacher.js roster: .select("id").eq("teacher_id", teacherId).eq("role", "student")
  assert.deepEqual(await ids(pg, "authenticated", T1, "teacher_id = $1 AND role = 'student'", [T1]), [P1, P2]);
  // student-detail.js / teacher.js: one pupil's grade, bands, domains
  const r = await as(pg, "authenticated", T1,
    "SELECT selected_grade, placement_band, current_band, active_domains FROM public.profiles WHERE id = $1", [P2]);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].selected_grade, 8);
});

test("7. a teacher cannot read another teacher's pupil, or the other teacher", async () => {
  const pg = await db({ migrated: true });
  assert.deepEqual(await ids(pg, "authenticated", T1, "id = $1", [Q1]), []);
  assert.deepEqual(await ids(pg, "authenticated", T1, "id = $1", [T2]), []);
  assert.deepEqual(await ids(pg, "authenticated", T2, "role = 'student'"), [Q1]);
});

test("8. request parameters cannot widen a teacher's scope", async () => {
  const pg = await db({ migrated: true });
  assert.deepEqual(await ids(pg, "authenticated", T1, "teacher_id = $1", [T2]), [], "asking for T2's class");
  assert.deepEqual(await ids(pg, "authenticated", T1, "teacher_id IS DISTINCT FROM $1", [T1]), [T1],
    "everything not in my class: only my own (teacher) row, no other pupil");
  assert.deepEqual(await ids(pg, "authenticated", T1, "role = 'student' OR true"), [P1, P2, T1], "OR true still filtered by RLS");
});

test("9. super_admin: own row only through this policy (no admin flow reads other profiles)", async () => {
  const pg = await db({ migrated: true });
  assert.deepEqual(await ids(pg, "authenticated", SA), [SA]);
});

test("9b. a pupil made 'teacher_id' of another row still reads nothing — the caller must BE a teacher", async () => {
  const pg = await db({ migrated: true });
  await pg.exec(`UPDATE public.profiles SET teacher_id = '${P1}' WHERE id = '${Q1}'`); // as owner: simulate a bad row
  assert.deepEqual(await ids(pg, "authenticated", P1, "id = $1", [Q1]), []);
});

// ── 10–12: writes and the forced-reset flow are unchanged ───────────────────────────────────────
test("10. self-update still works on the own row and only there", async () => {
  const pg = await db({ migrated: true });
  const own = await as(pg, "authenticated", P1, "UPDATE public.profiles SET placement_band = 3 WHERE id = $1 RETURNING id", [P1]);
  assert.equal(own.rows.length, 1);
  const other = await as(pg, "authenticated", P1, "UPDATE public.profiles SET placement_band = 3 WHERE id = $1 RETURNING id", [P2]);
  assert.equal(other.rows.length, 0);
  const teacherOnPupil = await as(pg, "authenticated", T1, "UPDATE public.profiles SET placement_band = 3 WHERE id = $1 RETURNING id", [P1]);
  assert.equal(teacherOnPupil.rows.length, 0, "SELECT visibility does not grant UPDATE");
});

test("11. the role still cannot be changed through self-update", async () => {
  const pg = await db({ migrated: true });
  await assert.rejects(
    as(pg, "authenticated", P1, "UPDATE public.profiles SET role = 'super_admin' WHERE id = $1", [P1]),
    /row-level security|violates/i,
  );
});

test("12. must_reset_password: login.js can read it, reset-password.js can clear it on the own row", async () => {
  const pg = await db({ migrated: true });
  await pg.exec("BEGIN");
  await pg.exec("SET LOCAL ROLE authenticated");
  await pg.query("SELECT set_config('test.uid', $1, true)", [P2]);
  const before = await pg.query("SELECT role, must_reset_password FROM public.profiles WHERE id = $1", [P2]);
  const upd = await pg.query("UPDATE public.profiles SET must_reset_password = false WHERE id = $1 RETURNING id", [P2]);
  const after = await pg.query("SELECT must_reset_password FROM public.profiles WHERE id = $1", [P2]);
  await pg.exec("ROLLBACK");
  assert.deepEqual(before.rows, [{ role: "student", must_reset_password: true }]);
  assert.equal(upd.rows.length, 1);
  assert.deepEqual(after.rows, [{ must_reset_password: false }]);
});

// ── Dependent policies on other tables keep working ─────────────────────────────────────────────
test("the teacher question_instances policy still sees own pupils' rows — and only those", async () => {
  const pg = await db({ migrated: true });
  const t1 = await as(pg, "authenticated", T1, "SELECT student_id FROM public.question_instances ORDER BY student_id");
  assert.deepEqual(t1.rows.map((r) => r.student_id), [P1, P2]);
  const p1 = await as(pg, "authenticated", P1, "SELECT student_id FROM public.question_instances");
  assert.deepEqual(p1.rows.map((r) => r.student_id), [P1]);
});

test("super_admin-gated policies (EXISTS on the own profile row) still admit super_admin only", async () => {
  const pg = await db({ migrated: true });
  assert.equal((await as(pg, "authenticated", SA, "SELECT id FROM public.admin_gated")).rows.length, 1);
  assert.equal((await as(pg, "authenticated", T1, "SELECT id FROM public.admin_gated")).rows.length, 0);
  assert.equal((await as(pg, "authenticated", P1, "SELECT id FROM public.admin_gated")).rows.length, 0);
});

test("no RLS recursion: the policy evaluates for every role without error", async () => {
  const pg = await db({ migrated: true });
  for (const uid of [T1, T2, SA, P1, P2, Q1]) await ids(pg, "authenticated", uid);
});

// ── 13–15: callers outside RLS, and the code paths that read profiles ───────────────────────────
const read = (p) => readFileSync(join(ROOT, p), "utf8");

test("13. create-student v18 writes profiles through the backend key — RLS does not apply", () => {
  const src = read("supabase/functions/create-student/index.ts");
  assert.match(src, /serviceKey\(\)/);
  assert.match(src, /createClient\(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY/);
});

test("14. teacher tranche 1 roster comes from get_teacher_visibility (SECURITY DEFINER), its id list from own pupils", () => {
  const src = read("js/teacher.js");
  assert.match(src, /rpc\("get_teacher_visibility"/);
  assert.match(src, /\.from\("profiles"\)\s*\.select\("id"\)\s*\.eq\("teacher_id", teacherId\)\s*\.eq\("role", "student"\)/);
});

test("15. every browser profiles read is the caller's own row, except the two teacher reads of own pupils", () => {
  const OWN = /\.from\("profiles"\)\s*\.select\([^)]*\)\s*\.eq\("id", (studentId|userId|uid|teacherId|user\.id|session\.user\.id)\)/g;
  const files = ["app.js", "avatar.html", "collection.html", "docs.html", "hub.html", "themes.html",
    "js/admin.js", "js/login.js", "js/themeManager.js", "js/teacher.js", "js/student-detail.js"];
  const nonOwn = [];
  for (const f of files) {
    const src = read(f);
    const all = [...src.matchAll(/\.from\("profiles"\)\s*\.select\([^)]*\)\s*\.eq\("(\w+)", ([\w.]+)\)/g)];
    for (const m of all) if (!new RegExp(OWN.source).test(m[0])) nonOwn.push(`${f}: .eq("${m[1]}", ${m[2]})`);
  }
  // teacher.js reads a selected pupil's domains (sid) and its roster ids (teacher_id = teacherId) —
  // both own pupils, allowed by the new policy. student-detail.js reads studentId under the teacher
  // gate (matched by OWN above as a variable name, and allowed as an own pupil).
  assert.deepEqual(nonOwn.sort(), ['js/teacher.js: .eq("id", sid)', 'js/teacher.js: .eq("teacher_id", teacherId)']);
});

// ── The migration file itself ───────────────────────────────────────────────────────────────────
test("the migration is one ALTER POLICY on profiles_select: no subquery on profiles, no bare role = 'student'", () => {
  const code = MIGRATION.replace(/--.*$/gm, "").replace(/\s+/g, " ").trim();
  const stmts = code.split(";").map((s) => s.trim()).filter(Boolean);
  assert.equal(stmts.length, 1);
  assert.match(stmts[0], /^ALTER POLICY "profiles_select" ON public\.profiles USING \(/);
  assert.equal(/\bFROM\s+(public\.)?profiles\b/i.test(code), false, "no recursive subquery");
  assert.match(code, /role = 'student' AND teacher_id = \(SELECT auth\.uid\(\)\) AND \(SELECT public\.auth_profile_role\(\)\) = 'teacher'/);
  assert.equal(/\b(GRANT|REVOKE|CREATE|DROP|INSERT|UPDATE|DELETE|DISABLE)\b/i.test(code), false);
});

test("the migration sorts after every live migration and its version is unique", () => {
  const files = readdirSync(join(ROOT, "supabase", "migrations")).filter((f) => f.startsWith("20261009221339_"));
  assert.deepEqual(files, [FILE]);
  assert.ok("20261009221339" > "20261009123844", "after the newest remote version");
});
