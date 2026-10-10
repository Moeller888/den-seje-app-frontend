// RUNTIME proof for migration 20261010102416_profiles_self_update_columns. The SQL file is executed
// UNMODIFIED against a real PostgreSQL (PGlite, in-process WebAssembly — no Docker, no network), on a
// fixture that reproduces the LIVE profiles state of 2026-10-10: RLS on, profiles_select (caller
// scope, applied 2026-10-10), profiles_self_update, auth_profile_role(), table-wide privileges for
// anon/authenticated/service_role, the CHECK constraints, and stand-ins for the SECURITY DEFINER
// RPCs that legitimately write profile columns.
//
// HONEST LIMITS:
//   - PGlite is PostgreSQL 18.x; production is 17.6.
//   - auth.uid() reads `test.uid`; auth.users carries only id, encrypted_password, last_sign_in_at.
//     In production Supabase Auth (GoTrue) performs the auth.users UPDATE; here the test owner does.
//   - The RPC stand-ins reproduce only the auth.uid()-scoped UPDATE of the real functions.
//   - Passing here is not permission to apply. Applying needs its own owner authorisation (D-110).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILE = "20261010102416_profiles_self_update_columns.sql";
const MIGRATION = readFileSync(join(ROOT, "supabase", "migrations", FILE), "utf8");

const T1 = "00000000-0000-4000-8000-0000000000a1";
const T2 = "00000000-0000-4000-8000-0000000000a2";
const P1 = "00000000-0000-4000-8000-000000000001";   // pupil of T1, must_reset_password = true
const P2 = "00000000-0000-4000-8000-000000000002";   // pupil of T1

const FIXTURE = `
  CREATE ROLE anon NOBYPASSRLS; CREATE ROLE authenticated NOBYPASSRLS; CREATE ROLE service_role BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY, encrypted_password text, last_sign_in_at timestamptz);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

  CREATE TABLE public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id), role text CHECK (role IN ('student','teacher','super_admin')),
    full_name text, created_at timestamptz DEFAULT now(), teacher_id uuid REFERENCES auth.users(id),
    active_avatar text, equipped_slots jsonb, active_theme text, active_title text,
    selected_grade smallint CHECK (selected_grade IS NULL OR selected_grade IN (7, 8, 9)),
    placement_band smallint CHECK (placement_band IS NULL OR placement_band BETWEEN 1 AND 4),
    current_band smallint CHECK (current_band IS NULL OR current_band BETWEEN 1 AND 5),
    active_domains text[], must_reset_password boolean NOT NULL DEFAULT false,
    avatar_gender text, avatar_identity jsonb
  );
  -- Stand-in hashes are derived (md5 of the id), never written as literals.
  INSERT INTO auth.users (id, encrypted_password)
    SELECT u, md5(u::text) FROM unnest(ARRAY['${T1}', '${T2}', '${P1}', '${P2}']::uuid[]) AS u;
  INSERT INTO public.profiles (id, role, teacher_id, must_reset_password, selected_grade) VALUES
    ('${T1}', 'teacher', NULL, false, NULL), ('${T2}', 'teacher', NULL, false, NULL),
    ('${P1}', 'student', '${T1}', true, 7), ('${P2}', 'student', '${T1}', false, 8);

  ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
  GRANT ALL ON public.profiles TO anon, authenticated, service_role;

  CREATE FUNCTION public.auth_profile_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = public AS $$ SELECT role FROM profiles WHERE id = auth.uid(); $$;
  CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated USING (
    id = (SELECT auth.uid())
    OR (role = 'student' AND teacher_id = (SELECT auth.uid()) AND (SELECT public.auth_profile_role()) = 'teacher'));
  CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated
    USING (id = auth.uid()) WITH CHECK (id = auth.uid() AND role = public.auth_profile_role());

  -- Stand-ins for the SECURITY DEFINER RPCs that legitimately write profile columns.
  CREATE FUNCTION public.set_student_grade(p_grade smallint) RETURNS void LANGUAGE sql SECURITY DEFINER
    SET search_path = public AS $$ UPDATE public.profiles SET selected_grade = p_grade WHERE id = auth.uid(); $$;
  CREATE FUNCTION public.set_active_theme(p_theme_key text) RETURNS void LANGUAGE sql SECURITY DEFINER
    SET search_path = public AS $$ UPDATE public.profiles SET active_theme = p_theme_key WHERE id = auth.uid(); $$;
  GRANT EXECUTE ON FUNCTION public.set_student_grade(smallint), public.set_active_theme(text) TO authenticated;
`;

async function db({ migrated }) {
  const pg = new PGlite();
  await pg.exec(FIXTURE);
  if (migrated) await pg.exec(MIGRATION);
  return pg;
}

// One statement as `role` with auth.uid() = uid, in a rolled-back transaction.
// Returns { rows } or { error } — an error is a value here, not an exception.
async function as(pg, role, uid, sql, params = []) {
  await pg.exec("BEGIN");
  try {
    await pg.exec(`SET LOCAL ROLE ${role}`);
    await pg.query("SELECT set_config('test.uid', $1, true)", [uid ?? ""]);
    const r = await pg.query(sql, params);
    return { rows: r.rows };
  } catch (e) {
    return { error: String(e.message) };
  } finally {
    await pg.exec("ROLLBACK");
  }
}
const profile = async (pg, id) =>
  (await pg.query("SELECT * FROM public.profiles WHERE id = $1", [id])).rows[0];

// A pupil's self-update of one column: returns "denied" or the number of rows changed.
async function selfUpdate(pg, uid, column, value) {
  const r = await as(pg, "authenticated", uid,
    `UPDATE public.profiles SET ${column} = $2 WHERE id = $1 RETURNING id`, [uid, value]);
  if (r.error) return /permission denied/i.test(r.error) ? "denied" : `error: ${r.error}`;
  return r.rows.length;
}

// ── The server-owned columns, before and after ──────────────────────────────────────────────────
const SERVER_OWNED = [
  ["role", "teacher"], ["teacher_id", T2], ["must_reset_password", false], ["selected_grade", 9],
  ["active_domains", "{x}"], ["equipped_slots", "{}"], ["active_theme", "dark"], ["active_title", "t"],
  ["avatar_identity", "{}"], ["active_avatar", "a"], ["avatar_gender", "boy"], ["full_name", "X"],
  ["created_at", "2000-01-01"], ["id", T2],
];

test("OLD state (live today): a pupil can rewrite server-owned columns of their own row", async () => {
  const pg = await db({ migrated: false });
  assert.equal(await selfUpdate(pg, P1, "must_reset_password", false), 1, "skips the forced password change");
  assert.equal(await selfUpdate(pg, P1, "teacher_id", T2), 1, "moves to another teacher");
  assert.equal(await selfUpdate(pg, P1, "teacher_id", null), 1, "drops their teacher");
  assert.equal(await selfUpdate(pg, P1, "selected_grade", 9), 1, "bypasses set_student_grade");
});

test("1–7. after the migration every server-owned column is denied to the pupil", async () => {
  const pg = await db({ migrated: true });
  for (const [column, value] of SERVER_OWNED) {
    assert.equal(await selfUpdate(pg, P1, column, value), "denied", column);
  }
  const p1 = await profile(pg, P1);
  assert.equal(p1.must_reset_password, true);
  assert.equal(p1.teacher_id, T1);
  assert.equal(p1.role, "student");
  assert.equal(p1.selected_grade, 7);
});

test("2. teacher_id: a pupil can neither switch, pick nor drop a teacher", async () => {
  const pg = await db({ migrated: true });
  for (const v of [T2, T1, null]) assert.equal(await selfUpdate(pg, P1, "teacher_id", v), "denied", String(v));
});

test("3. must_reset_password: a pupil cannot clear (or set) the flag directly", async () => {
  const pg = await db({ migrated: true });
  assert.equal(await selfUpdate(pg, P1, "must_reset_password", false), "denied");
  assert.equal(await selfUpdate(pg, P2, "must_reset_password", true), "denied");
  // Not even together with an allowed column.
  const r = await as(pg, "authenticated", P1,
    "UPDATE public.profiles SET current_band = 2, must_reset_password = false WHERE id = $1", [P1]);
  assert.match(r.error ?? "", /permission denied/i);
});

test("5–6 / 12. placement_band and current_band stay writable on the own row (app.js adaptive engine)", async () => {
  const pg = await db({ migrated: true });
  assert.equal(await selfUpdate(pg, P1, "placement_band", 3), 1);
  assert.equal(await selfUpdate(pg, P1, "current_band", 4), 1);
  assert.equal(await selfUpdate(pg, P2, "current_band", 2), 1);
  // …only on the own row, and only within the CHECK ranges.
  const other = await as(pg, "authenticated", P1, "UPDATE public.profiles SET current_band = 1 WHERE id = $1 RETURNING id", [P2]);
  assert.deepEqual(other.rows, []);
  const out = await as(pg, "authenticated", P1, "UPDATE public.profiles SET current_band = 9 WHERE id = $1", [P1]);
  assert.match(out.error ?? "", /check constraint/i);
});

test("anon can update nothing; a teacher cannot update a pupil's row", async () => {
  const pg = await db({ migrated: true });
  const anon = await as(pg, "anon", "", "UPDATE public.profiles SET current_band = 1 RETURNING id");
  assert.match(anon.error ?? "", /permission denied/i);
  const t = await as(pg, "authenticated", T1, "UPDATE public.profiles SET current_band = 1 WHERE id = $1 RETURNING id", [P1]);
  assert.deepEqual(t.rows, [], "SELECT visibility of own pupils does not grant UPDATE");
  assert.equal(await selfUpdate(pg, T1, "teacher_id", T2), "denied", "a teacher cannot rewrite own server columns either");
});

test("8. legitimate preference/progression writes through SECURITY DEFINER RPCs keep working", async () => {
  const pg = await db({ migrated: true });
  await pg.exec("BEGIN");
  await pg.exec("SET LOCAL ROLE authenticated");
  await pg.query("SELECT set_config('test.uid', $1, true)", [P2]);
  await pg.query("SELECT public.set_student_grade(9::smallint)");
  await pg.query("SELECT public.set_active_theme('dark')");
  const r = await pg.query("SELECT selected_grade, active_theme FROM public.profiles WHERE id = $1", [P2]);
  await pg.exec("ROLLBACK");
  assert.deepEqual(r.rows, [{ selected_grade: 9, active_theme: "dark" }]);
});

// ── Part 2: the forced-reset flag follows the real password ─────────────────────────────────────
test("9. reset-password flow: changing the password clears must_reset_password", async () => {
  const pg = await db({ migrated: true });
  await pg.query("UPDATE auth.users SET encrypted_password = md5(encrypted_password) WHERE id = $1", [P1]);
  assert.equal((await profile(pg, P1)).must_reset_password, false);
  assert.equal((await profile(pg, P2)).must_reset_password, false, "no other row touched");
});

test("9b. auth.users updates that do not change the password leave the flag alone", async () => {
  const pg = await db({ migrated: true });
  await pg.query("UPDATE auth.users SET last_sign_in_at = now() WHERE id = $1", [P1]);
  await pg.query("UPDATE auth.users SET encrypted_password = encrypted_password WHERE id = $1", [P1]);
  assert.equal((await profile(pg, P1)).must_reset_password, true);
});

test("9c. teacher reset (reset-student-password): new password first, flag set afterwards → flag stays true", async () => {
  const pg = await db({ migrated: true });
  await pg.query("UPDATE auth.users SET encrypted_password = md5(encrypted_password) WHERE id = $1", [P2]);
  await pg.exec("BEGIN");
  await pg.exec("SET LOCAL ROLE service_role");
  await pg.query("UPDATE public.profiles SET must_reset_password = true WHERE id = $1", [P2]);
  await pg.exec("COMMIT");
  assert.equal((await profile(pg, P2)).must_reset_password, true);
});

test("10. create-student v18 (backend key) still inserts the pupil with must_reset_password = true", async () => {
  const pg = await db({ migrated: true });
  const NEW = "00000000-0000-4000-8000-000000000009";
  await pg.query("INSERT INTO auth.users (id, encrypted_password) VALUES ($1::uuid, md5($1::uuid::text))", [NEW]);
  await pg.exec("BEGIN");
  await pg.exec("SET LOCAL ROLE service_role");
  await pg.query(
    "INSERT INTO public.profiles (id, role, teacher_id, must_reset_password) VALUES ($1, 'student', $2, true) ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, teacher_id = EXCLUDED.teacher_id, must_reset_password = EXCLUDED.must_reset_password",
    [NEW, T1]);
  await pg.exec("COMMIT");
  const p = await profile(pg, NEW);
  assert.deepEqual([p.role, p.teacher_id, p.must_reset_password], ["student", T1, true]);
});

test("the trigger function is SECURITY DEFINER, path-pinned and not executable by API roles", async () => {
  const pg = await db({ migrated: true });
  const r = await pg.query(`SELECT p.prosecdef, p.proconfig,
      has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_x,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_x
    FROM pg_proc p WHERE p.proname = 'clear_must_reset_password_on_password_change'`);
  assert.deepEqual(r.rows, [{ prosecdef: true, proconfig: ["search_path=public, pg_temp"], anon_x: false, auth_x: false }]);
});

// ── 11, 13, 14: reads and the caller-scope policy are unchanged ─────────────────────────────────
test("13. self SELECT (login.js: role + must_reset_password) still works", async () => {
  const pg = await db({ migrated: true });
  const r = await as(pg, "authenticated", P1, "SELECT role, must_reset_password FROM public.profiles WHERE id = $1", [P1]);
  assert.deepEqual(r.rows, [{ role: "student", must_reset_password: true }]);
});

test("11 / 14. teacher reads of own pupils and the caller-scope isolation are unchanged", async () => {
  const pg = await db({ migrated: true });
  const t1 = await as(pg, "authenticated", T1, "SELECT id FROM public.profiles WHERE role = 'student' ORDER BY id");
  assert.deepEqual(t1.rows.map((r) => r.id), [P1, P2]);
  const t2 = await as(pg, "authenticated", T2, "SELECT id FROM public.profiles WHERE role = 'student'");
  assert.deepEqual(t2.rows, []);
  const p1 = await as(pg, "authenticated", P1, "SELECT id FROM public.profiles");
  assert.deepEqual(p1.rows.map((r) => r.id), [P1]);
});

// ── The migration file itself ───────────────────────────────────────────────────────────────────
test("the migration is exactly: revoke UPDATE, grant two columns, one trigger function, one trigger", () => {
  const code = MIGRATION.replace(/\$\$[\s\S]*?\$\$/g, "$$BODY$$").replace(/--.*$/gm, "").replace(/\s+/g, " ").trim();
  const stmts = code.split(";").map((s) => s.trim()).filter(Boolean);
  assert.deepEqual(stmts.map((s) => s.split(" ").slice(0, 3).join(" ")), [
    "REVOKE UPDATE ON", "GRANT UPDATE (placement_band,", "CREATE FUNCTION public.clear_must_reset_password_on_password_change()",
    "REVOKE EXECUTE ON", "CREATE TRIGGER clear_must_reset_password_on_password_change",
  ]);
  assert.equal(stmts[0], "REVOKE UPDATE ON public.profiles FROM anon, authenticated");
  assert.equal(stmts[1], "GRANT UPDATE (placement_band, current_band) ON public.profiles TO authenticated");
  assert.match(stmts[4], /AFTER UPDATE OF encrypted_password ON auth\.users FOR EACH ROW WHEN \(NEW\.encrypted_password IS DISTINCT FROM OLD\.encrypted_password\)/);
  assert.equal(/POLICY|service_role|DELETE|INSERT|DROP|CREATE OR REPLACE/i.test(code), false);
});

test("the migration version is unique and sorts after the newest live migration", () => {
  const files = readdirSync(join(ROOT, "supabase", "migrations")).filter((f) => f.startsWith("20261010102416_"));
  assert.deepEqual(files, [FILE]);
  assert.ok("20261010102416" > "20261010100958");
});
