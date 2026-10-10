// RUNTIME proof for migration 20261010120000_profiles_protected_columns (tranche 2-0A).
//
// The SQL file is executed UNMODIFIED against a real PostgreSQL (PGlite, in-process WebAssembly — no
// Docker, no network, no production call), on a fixture that reproduces the LIVE security state of
// public.profiles as audited read-only on 2026-10-10: all 16 columns, RLS on, the caller-scoped
// profiles_select, profiles_self_update, auth_profile_role(), table-level ALL to anon /
// authenticated / service_role, and a SECURITY DEFINER set_student_domains with the live ownership
// check. Every claim below is a real UPDATE run as the API role — the defect is reproduced BEFORE
// and shown closed AFTER.
//
// HONEST LIMITS:
//   - PGlite is PostgreSQL 18.x; production is 17.6. Column privileges and RLS behave the same.
//   - auth.uid() reads the test-set `test.uid` setting; the roles are created here, not Supabase's.
//   - PostgREST is not in the loop; supabase-js .update({…}) issues the same UPDATE … SET <those
//     columns> WHERE … that these tests run.
//   - Passing here is not permission to apply. Applying needs its own owner authorisation (D-110).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILE = "20261010120000_profiles_protected_columns.sql";
const MIGRATION = readFileSync(join(ROOT, "supabase", "migrations", FILE), "utf8");

const CLIENT_WRITABLE = ["placement_band", "current_band", "must_reset_password"];
const PROTECTED = ["teacher_id", "role", "active_domains"];

const T1 = "00000000-0000-4000-8000-0000000000a1"; // teacher of P1, P2
const T2 = "00000000-0000-4000-8000-0000000000a2"; // teacher of Q1
const P1 = "00000000-0000-4000-8000-000000000001";
const P2 = "00000000-0000-4000-8000-000000000002";
const Q1 = "00000000-0000-4000-8000-000000000003";
const NEW = "00000000-0000-4000-8000-000000000009";

const FIXTURE = `
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

  -- All 16 live columns, in live order and type.
  CREATE TABLE public.profiles (
    id uuid PRIMARY KEY, role text NOT NULL, full_name text, created_at timestamptz DEFAULT now(),
    teacher_id uuid, active_avatar text, equipped_slots jsonb NOT NULL DEFAULT '{}'::jsonb,
    active_theme text NOT NULL DEFAULT 'default', active_title text, selected_grade smallint,
    placement_band smallint, current_band smallint, active_domains text[],
    must_reset_password boolean NOT NULL DEFAULT false,
    avatar_gender text NOT NULL DEFAULT 'neutral', avatar_identity jsonb NOT NULL DEFAULT '{}'::jsonb
  );
  INSERT INTO public.profiles (id, role, teacher_id, selected_grade, active_domains, must_reset_password) VALUES
    ('${T1}', 'teacher', NULL, NULL, NULL, false), ('${T2}', 'teacher', NULL, NULL, NULL, false),
    ('${P1}', 'student', '${T1}', 7, ARRAY['vikings'], true),
    ('${P2}', 'student', '${T1}', 8, NULL, false),
    ('${Q1}', 'student', '${T2}', 7, NULL, false);

  -- The live grants: relacl {anon=arwdDxtm, authenticated=arwdDxtm, service_role=arwdDxtm}.
  ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
  GRANT ALL ON public.profiles TO anon, authenticated, service_role;

  CREATE FUNCTION public.auth_profile_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = public AS $$ SELECT role FROM profiles WHERE id = auth.uid(); $$;

  -- The live policies, verbatim in effect.
  CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated
    USING ((id = (SELECT auth.uid())) OR ((role = 'student') AND (teacher_id = (SELECT auth.uid()))
           AND ((SELECT public.auth_profile_role()) = 'teacher')));
  CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK ((id = auth.uid()) AND (role = public.auth_profile_role()));

  -- The live set_student_domains ownership contract (domain validation against questions omitted:
  -- it does not touch privileges). SECURITY DEFINER, owned by the bootstrap superuser like postgres.
  CREATE FUNCTION public.set_student_domains(p_student_id uuid, p_domains text[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_student_id AND teacher_id = auth.uid() AND role = 'student') THEN
      RAISE EXCEPTION 'Not authorized: caller is not the teacher of this student';
    END IF;
    UPDATE profiles SET active_domains = p_domains WHERE id = p_student_id;
  END; $$;
  GRANT EXECUTE ON FUNCTION public.set_student_domains(uuid, text[]) TO authenticated;
`;

async function fresh({ migrated }) {
  const db = new PGlite();
  await db.exec(FIXTURE);
  if (migrated) await db.exec(MIGRATION);
  return db;
}

// Runs one statement as an API role with auth.uid() = uid. Returns
//   { rows: <affected rows> }  or  { denied: "privilege" | "rls" , message }.
async function as(db, role, uid, sql, params = []) {
  await db.exec("RESET ROLE");
  await db.query("SELECT set_config('test.uid', $1, false)", [uid ?? ""]);
  await db.exec(`SET ROLE ${role}`);
  try {
    const res = await db.query(sql, params);
    // SELECT reports its rows; UPDATE/INSERT without RETURNING report affectedRows.
    return { rows: res.rows.length > 0 ? res.rows.length : (res.affectedRows ?? 0) };
  } catch (e) {
    const m = String(e?.message ?? e);
    if (/permission denied/i.test(m)) return { denied: "privilege", message: m };
    if (/row-level security/i.test(m)) return { denied: "rls", message: m };
    throw e;
  } finally {
    await db.exec("RESET ROLE");
  }
}

async function col(db, id, column) {
  const r = await db.query(`SELECT ${column} AS v FROM public.profiles WHERE id = $1`, [id]);
  return r.rows[0]?.v ?? null;
}

// ── BEFORE: the defect, reproduced on the live state ─────────────────────────────────────────

test("BEFORE 1. a pupil can move themselves to another teacher", async () => {
  const db = await fresh({ migrated: false });
  assert.deepEqual(await as(db, "authenticated", P1, "UPDATE public.profiles SET teacher_id = $1 WHERE id = $2", [T2, P1]), { rows: 1 });
  assert.equal(await col(db, P1, "teacher_id"), T2);
});

test("BEFORE 2. a pupil can set their own teacher_id to NULL", async () => {
  const db = await fresh({ migrated: false });
  assert.deepEqual(await as(db, "authenticated", P1, "UPDATE public.profiles SET teacher_id = NULL WHERE id = $1", [P1]), { rows: 1 });
  assert.equal(await col(db, P1, "teacher_id"), null);
});

test("BEFORE 3. a pupil can clear the domain focus their teacher set", async () => {
  const db = await fresh({ migrated: false });
  assert.deepEqual(await as(db, "authenticated", P1, "UPDATE public.profiles SET active_domains = NULL WHERE id = $1", [P1]), { rows: 1 });
  assert.equal(await col(db, P1, "active_domains"), null);
});

test("BEFORE 4. baseline: role is already pinned — but only by the policy's WITH CHECK", async () => {
  const db = await fresh({ migrated: false });
  const r = await as(db, "authenticated", P1, "UPDATE public.profiles SET role = 'teacher' WHERE id = $1", [P1]);
  assert.equal(r.denied, "rls");
  assert.equal(await col(db, P1, "role"), "student");
});

// ── AFTER: the three authority columns are closed to API clients ─────────────────────────────

test("AFTER 5/6. a pupil can neither move to another teacher nor clear teacher_id", async () => {
  const db = await fresh({ migrated: true });
  assert.equal((await as(db, "authenticated", P1, "UPDATE public.profiles SET teacher_id = $1 WHERE id = $2", [T2, P1])).denied, "privilege");
  assert.equal((await as(db, "authenticated", P1, "UPDATE public.profiles SET teacher_id = NULL WHERE id = $1", [P1])).denied, "privilege");
  assert.equal(await col(db, P1, "teacher_id"), T1);
});

test("AFTER 7. a pupil cannot change active_domains", async () => {
  const db = await fresh({ migrated: true });
  assert.equal((await as(db, "authenticated", P1, "UPDATE public.profiles SET active_domains = NULL WHERE id = $1", [P1])).denied, "privilege");
  assert.deepEqual(await col(db, P1, "active_domains"), ["vikings"]);
});

test("AFTER 8. a pupil cannot change role — now refused by privilege, before the policy is even asked", async () => {
  const db = await fresh({ migrated: true });
  assert.equal((await as(db, "authenticated", P1, "UPDATE public.profiles SET role = 'teacher' WHERE id = $1", [P1])).denied, "privilege");
  assert.equal(await col(db, P1, "role"), "student");
});

test("AFTER 8b. mixing a protected column into an allowed write refuses the whole statement", async () => {
  const db = await fresh({ migrated: true });
  const r = await as(db, "authenticated", P1,
    "UPDATE public.profiles SET placement_band = 3, teacher_id = $1 WHERE id = $2", [T2, P1]);
  assert.equal(r.denied, "privilege");
  assert.equal(await col(db, P1, "placement_band"), null, "nothing of the statement was applied");
});

test("AFTER 9. every column on the client allowlist is still writable to one's own row", async () => {
  const db = await fresh({ migrated: true });
  assert.deepEqual(await as(db, "authenticated", P1, "UPDATE public.profiles SET placement_band = 3 WHERE id = $1", [P1]), { rows: 1 });
  assert.deepEqual(await as(db, "authenticated", P1, "UPDATE public.profiles SET current_band = 4 WHERE id = $1", [P1]), { rows: 1 });
  assert.deepEqual(await as(db, "authenticated", P1, "UPDATE public.profiles SET must_reset_password = false WHERE id = $1", [P1]), { rows: 1 });
  assert.equal(await col(db, P1, "placement_band"), 3);
  assert.equal(await col(db, P1, "current_band"), 4);
  assert.equal(await col(db, P1, "must_reset_password"), false);
});

test("AFTER 9b. no other column is client-writable — the effective privilege set is exactly the allowlist", async () => {
  const db = await fresh({ migrated: true });
  const res = await db.query(`
    SELECT column_name,
           has_column_privilege('authenticated', 'public.profiles', column_name, 'UPDATE') AS auth_upd,
           has_column_privilege('anon',          'public.profiles', column_name, 'UPDATE') AS anon_upd,
           has_column_privilege('service_role',  'public.profiles', column_name, 'UPDATE') AS svc_upd
    FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles'
    ORDER BY ordinal_position`);
  assert.equal(res.rows.length, 16);
  assert.deepEqual(res.rows.filter((r) => r.auth_upd).map((r) => r.column_name).sort(), [...CLIENT_WRITABLE].sort());
  assert.deepEqual(res.rows.filter((r) => r.anon_upd).map((r) => r.column_name), []);
  assert.ok(res.rows.every((r) => r.svc_upd), "service_role keeps UPDATE on every column");
  const tbl = await db.query(`SELECT has_table_privilege('authenticated', 'public.profiles', 'UPDATE') AS a,
                                     has_table_privilege('anon', 'public.profiles', 'UPDATE') AS b`);
  assert.deepEqual(tbl.rows[0], { a: false, b: false }, "no table-level UPDATE remains for the API roles");
});

test("AFTER 10. an allowed column on SOMEONE ELSE's row is still refused by RLS (0 rows)", async () => {
  const db = await fresh({ migrated: true });
  assert.deepEqual(await as(db, "authenticated", P1, "UPDATE public.profiles SET placement_band = 1 WHERE id = $1", [Q1]), { rows: 0 });
  assert.deepEqual(await as(db, "authenticated", T1, "UPDATE public.profiles SET must_reset_password = false WHERE id = $1", [P1]), { rows: 0 },
    "a teacher cannot write a pupil's row directly either");
  assert.equal(await col(db, Q1, "placement_band"), null);
  assert.equal(await col(db, P1, "must_reset_password"), true);
});

test("AFTER 11. a teacher's own session cannot write the protected columns on its own row", async () => {
  const db = await fresh({ migrated: true });
  for (const [sql, params] of [
    ["UPDATE public.profiles SET teacher_id = $1 WHERE id = $2", [T2, T1]],
    ["UPDATE public.profiles SET role = 'super_admin' WHERE id = $1", [T1]],
    ["UPDATE public.profiles SET active_domains = ARRAY['x'] WHERE id = $1", [T1]],
  ]) {
    assert.equal((await as(db, "authenticated", T1, sql, params)).denied, "privilege", sql);
  }
});

test("AFTER 11b. anon has no UPDATE at all", async () => {
  const db = await fresh({ migrated: true });
  assert.equal((await as(db, "anon", null, "UPDATE public.profiles SET placement_band = 1 WHERE id = $1", [P1])).denied, "privilege");
});

test("AFTER 12. backend contracts still work: create-student's upsert and reset-student-password's flag (service_role)", async () => {
  const db = await fresh({ migrated: true });
  // create-student v18: one upsert with role, teacher_id and must_reset_password.
  assert.deepEqual(await as(db, "service_role", null,
    `INSERT INTO public.profiles (id, role, teacher_id, must_reset_password) VALUES ($1, 'student', $2, true)
     ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, teacher_id = EXCLUDED.teacher_id,
       must_reset_password = EXCLUDED.must_reset_password`, [NEW, T1]), { rows: 1 });
  assert.equal(await col(db, NEW, "teacher_id"), T1);
  assert.equal(await col(db, NEW, "must_reset_password"), true);
  // reset-student-password: sets the flag on an existing pupil.
  assert.deepEqual(await as(db, "service_role", null, "UPDATE public.profiles SET must_reset_password = true WHERE id = $1", [P2]), { rows: 1 });
  // An operator/backend can still correct teacher_id.
  assert.deepEqual(await as(db, "service_role", null, "UPDATE public.profiles SET teacher_id = $1 WHERE id = $2", [T2, P2]), { rows: 1 });
});

test("AFTER 12b. set_student_domains (SECURITY DEFINER) still lets the pupil's own teacher set active_domains", async () => {
  const db = await fresh({ migrated: true });
  assert.deepEqual(await as(db, "authenticated", T1, "SELECT public.set_student_domains($1, ARRAY['world_war_2'])", [P1]), { rows: 1 });
  assert.deepEqual(await col(db, P1, "active_domains"), ["world_war_2"]);
  // …and still refuses everyone else — unchanged contract.
  await assert.rejects(as(db, "authenticated", T2, "SELECT public.set_student_domains($1, NULL)", [P1]), /Not authorized/);
  await assert.rejects(as(db, "authenticated", P1, "SELECT public.set_student_domains($1, NULL)", [P1]), /Not authorized/);
  assert.deepEqual(await col(db, P1, "active_domains"), ["world_war_2"]);
});

test("the migration is convergent: applying it twice yields the same effective privileges", async () => {
  const db = await fresh({ migrated: true });
  await db.exec(MIGRATION);
  const res = await db.query(`SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND has_column_privilege('authenticated', 'public.profiles', column_name, 'UPDATE') ORDER BY 1`);
  assert.deepEqual(res.rows.map((r) => r.column_name), [...CLIENT_WRITABLE].sort());
  assert.equal((await as(db, "authenticated", P1, "UPDATE public.profiles SET teacher_id = NULL WHERE id = $1", [P1])).denied, "privilege");
});

test("no SELECT, INSERT or DELETE behaviour changes", async () => {
  const before = await fresh({ migrated: false });
  const after = await fresh({ migrated: true });
  const q = `SELECT has_table_privilege(r, 'public.profiles', 'SELECT') s, has_table_privilege(r, 'public.profiles', 'INSERT') i,
                    has_table_privilege(r, 'public.profiles', 'DELETE') d FROM unnest(ARRAY['anon','authenticated','service_role']) r`;
  assert.deepEqual((await after.query(q)).rows, (await before.query(q)).rows);
  // A pupil still reads their own row; a teacher still reads their pupils.
  assert.deepEqual(await as(after, "authenticated", P1, "SELECT id FROM public.profiles WHERE id = $1", [P1]), { rows: 1 });
  assert.deepEqual(await as(after, "authenticated", T1, "SELECT id FROM public.profiles WHERE teacher_id = $1", [T1]), { rows: 2 });
});
