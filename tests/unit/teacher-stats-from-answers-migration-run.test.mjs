// RUNTIME proof for migration 20261029150000_teacher_stats_from_answers.
//
// The CURRENT definitions (get_teacher_visibility from 20261009100000, get_student_overview from
// 20260927000000 — both byte-identical in behaviour to production on 2026-10-29) and the new
// migration are executed UNMODIFIED against a real PostgreSQL (PGlite, in-process WebAssembly — no
// Docker, no network, no production call). The same calls are made BEFORE and AFTER, so the defect
// (0 % / 0 attempts from dead columns) and the fix are both shown as behaviour.
//
// HONEST LIMITS:
//   - PGlite is PostgreSQL 18.x; production is 17.6.
//   - auth.users, auth.uid(), profiles, questions, question_instances and student_progress are
//     minimal stand-ins with only the columns the functions read. auth.uid() reads `test.uid`.
//   - The API roles are created here, not Supabase's own; PostgREST is not in the loop.
//   - Passing here is not permission to deploy. Applying the migration needs its own owner
//     authorisation (D-110).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");
const FILE = "20261029150000_teacher_stats_from_answers.sql";
const AFTER = readFileSync(join(MIGRATIONS, FILE), "utf8");
const BEFORE_VISIBILITY = readFileSync(join(MIGRATIONS, "20261009100000_get_teacher_visibility_caller_scope.sql"), "utf8");
const BEFORE_OVERVIEW = readFileSync(join(MIGRATIONS, "20260927000000_student_mastery_status_into_rpc.sql"), "utf8");
const CODE = AFTER.replace(/--.*$/gm, "").replace(/\s+/g, " ").trim();

const T_A   = "00000000-0000-4000-8000-0000000000a1"; // teacher A
const T_B   = "00000000-0000-4000-8000-0000000000b1"; // teacher B
const A1    = "00000000-0000-4000-8000-0000000000a2"; // pupil of A with a full history
const A2    = "00000000-0000-4000-8000-0000000000a3"; // pupil of A, no answers
const B1    = "00000000-0000-4000-8000-0000000000b2"; // pupil of B
const ADMIN = "00000000-0000-4000-8000-0000000000d1"; // super_admin
const Q1 = "10000000-0000-4000-8000-000000000001";    // band 2
const Q2 = "10000000-0000-4000-8000-000000000002";    // band 4

// A1's history, newest last. 24 first-attempt scored answers: the 12 older ones all wrong, the 12
// newer ones all right (an improving pupil). Plus, as production has them:
//   - one repeat answered correctly (repeat_count 1, was_correct true) — not a first attempt;
//   - one repeat closed without an answer (answered true, was_correct NULL);
//   - one text answer waiting for the teacher (answered true, was_correct NULL);
//   - one open question (answered false).
// is_correct is the legacy column: set on two old rows only, as in production.
function a1History() {
  const rows = [];
  for (let i = 0; i < 24; i++) {
    const ok = i >= 12;
    const legacy = i < 2 ? String(ok) : "NULL";
    rows.push(`('${A1}', '${i % 2 ? Q2 : Q1}', ${ok}, ${legacy}, true, 0, now() - interval '${100 - i} minutes')`);
  }
  rows.push(`('${A1}', '${Q2}', true,  NULL, true,  1, now() - interval '20 minutes')`);
  rows.push(`('${A1}', '${Q1}', NULL,  NULL, true,  1, now() - interval '15 minutes')`);
  rows.push(`('${A1}', '${Q2}', NULL,  NULL, true,  0, now() - interval '10 minutes')`);
  rows.push(`('${A1}', '${Q1}', NULL,  NULL, false, 0, NULL)`);
  return rows.join(",\n    ");
}

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
    id serial PRIMARY KEY, student_id uuid, question_id uuid, was_correct boolean, is_correct boolean,
    answered boolean, repeat_count integer, answered_at timestamptz, created_at timestamptz DEFAULT now());
  CREATE TABLE public.student_progress (
    student_id uuid PRIMARY KEY, xp integer, level integer,
    total_correct_answers integer, total_attempts integer);

  INSERT INTO auth.users VALUES
    ('${T_A}', 'laerer.a@skole.test'), ('${T_B}', 'laerer.b@skole.test'),
    ('${A1}', 'anna@skole.test'), ('${A2}', 'bo@skole.test'), ('${B1}', 'cy@skole.test'),
    ('${ADMIN}', 'admin@skole.test');
  INSERT INTO public.profiles (id, role, teacher_id, selected_grade, placement_band, active_domains) VALUES
    ('${T_A}', 'teacher', NULL, NULL, NULL, NULL),
    ('${T_B}', 'teacher', NULL, NULL, NULL, NULL),
    ('${A1}', 'student', '${T_A}', 7, 2, ARRAY['vikings']),
    ('${A2}', 'student', '${T_A}', 8, NULL, NULL),
    ('${B1}', 'student', '${T_B}', 9, 4, NULL),
    ('${ADMIN}', 'super_admin', NULL, NULL, NULL, NULL);
  INSERT INTO public.questions VALUES ('${Q1}', 2), ('${Q2}', 4);
  INSERT INTO public.question_instances
    (student_id, question_id, was_correct, is_correct, answered, repeat_count, answered_at) VALUES
    ${a1History()},
    ('${B1}', '${Q2}', true, NULL, true, 0, now() - interval '1 hours');
  -- total_attempts is never maintained in production (0); total_correct_answers is (first-attempt correct).
  INSERT INTO public.student_progress VALUES
    ('${A1}', 120, 1, 12, 0), ('${A2}', 0, 1, 0, 0), ('${B1}', 10, 1, 1, 0);
`;

async function db(withFix) {
  const d = new PGlite();
  await d.exec(FIXTURE);
  await d.exec(BEFORE_VISIBILITY);
  await d.exec(BEFORE_OVERVIEW);
  if (withFix) await d.exec(AFTER);
  return d;
}

async function call(d, role, uid, sql, args) {
  await d.exec("RESET ROLE");
  await d.query("SELECT set_config('test.uid', $1, false)", [uid ?? ""]);
  await d.exec(`SET ROLE ${role}`);
  try {
    return { rows: (await d.query(sql, args)).rows };
  } catch (e) {
    if (/permission denied/i.test(String(e?.message))) return { denied: true };
    throw e;
  } finally {
    await d.exec("RESET ROLE");
  }
}
const visibility = (d, role, uid, arg) =>
  call(d, role, uid, "SELECT * FROM public.get_teacher_visibility($1::uuid)", [arg]);
const overview = (d, role, uid, pupil) =>
  call(d, role, uid, "SELECT * FROM public.get_student_overview($1::uuid)", [pupil]);
const row = (r, id) => (r.rows ?? []).find((x) => x.student_id === id);

// ── the defect, reproduced on the current definitions ────────────────────────────────────────

test("DEFECT (before): the class overview shows 0 % correct, 0 questions and a flat trend", async () => {
  const anna = row(await visibility(await db(false), "authenticated", T_A, T_A), A1);
  assert.equal(anna.recent_correct_pct, 0, "is_correct is NULL on the recent answers");
  assert.equal(anna.total_attempts, 0, "student_progress.total_attempts is never maintained");
  assert.equal(anna.trend, "stable", "AVG over NULL is NULL, so the trend never moves");
});

test("DEFECT (before): the pupil page shows 0 % and 0 attempts", async () => {
  const [anna] = (await overview(await db(false), "authenticated", T_A, A1)).rows;
  assert.equal(Number(anna.correct_ratio), 0);
  assert.equal(anna.total_attempts, 0);
  assert.equal(anna.total_correct_answers, 12);
});

// ── the fix ──────────────────────────────────────────────────────────────────────────────────

test("class overview: questions, % correct and trend come from scored answers (was_correct)", async () => {
  const r = await visibility(await db(true), "authenticated", T_A, T_A);
  const anna = row(r, A1);
  // 24 first-attempt answers; the repeat, the closed repeat, the pending text and the open row are not.
  assert.equal(anna.total_attempts, 24);
  // last 20 scored answers: the repeat (correct) + the 12 correct + the 7 newest wrong = 13/20.
  assert.equal(anna.recent_correct_pct, 65);
  // last 10 scored all correct vs the 10 before (3 correct, 7 wrong): improving.
  assert.equal(anna.trend, "improving");
  assert.equal(anna.current_band, 3, "mean band of the last 10 scored answers (2 and 4 alternate)");
  const bo = row(r, A2);
  assert.equal(bo.total_attempts, 0);
  assert.equal(bo.recent_correct_pct, 0);
  assert.equal(bo.trend, "stable");
  assert.equal(bo.current_band, 1, "no answers: the COALESCE default is kept");
});

test("pupil page: attempts and ratio from first-attempt answers; total correct is still the counter", async () => {
  const [anna] = (await overview(await db(true), "authenticated", T_A, A1)).rows;
  assert.equal(anna.total_attempts, 24);
  assert.equal(Number(anna.correct_ratio), 50.0);
  assert.equal(anna.total_correct_answers, 12, "student_progress.total_correct_answers, unchanged");
  assert.equal(anna.xp, 120);
  assert.equal(anna.level, 1);
  const [bo] = (await overview(await db(true), "authenticated", T_A, A2)).rows;
  assert.equal(Number(bo.correct_ratio), 0, "zero-attempt guard: no division by zero");
  assert.equal(bo.total_attempts, 0);
});

test("the two views agree on the attempt count for every pupil", async () => {
  const d = await db(true);
  const v = await visibility(d, "authenticated", T_A, T_A);
  for (const id of [A1, A2]) {
    const [o] = (await overview(d, "authenticated", T_A, id)).rows;
    assert.equal(row(v, id).total_attempts, o.total_attempts, id);
  }
});

// ── access is exactly as before ──────────────────────────────────────────────────────────────

test("access matrix unchanged: anon refused, pupils and other teachers get nothing", async () => {
  for (const withFix of [false, true]) {
    const d = await db(withFix);
    assert.deepEqual(await visibility(d, "anon", null, T_A), { denied: true });
    assert.deepEqual(await visibility(d, "authenticated", A1, T_A), { rows: [] });
    assert.deepEqual(await visibility(d, "authenticated", T_B, T_A), { rows: [] });
    assert.deepEqual(await visibility(d, "authenticated", ADMIN, T_A), { rows: [] });
    assert.deepEqual(await visibility(d, "service_role", null, T_A), { denied: true });
    assert.deepEqual(await overview(d, "anon", null, A1), { denied: true });
    assert.deepEqual(await overview(d, "authenticated", A1, A1), { rows: [] }, "a pupil cannot read the page");
    assert.deepEqual(await overview(d, "authenticated", T_B, A1), { rows: [] }, "another teacher's pupil");
    assert.equal((await overview(d, "authenticated", ADMIN, A1)).rows.length, 1, "super_admin sees any pupil");
    assert.equal((await overview(d, "authenticated", T_A, A1)).rows.length, 1);
  }
});

test("signatures, RETURNS TABLE, SECURITY DEFINER and volatility are unchanged", async () => {
  const shape = async (d) => (await d.query(`
    SELECT proname, pg_get_function_identity_arguments(oid) AS args, pg_get_function_result(oid) AS result,
           prosecdef, provolatile, proconfig::text AS cfg
    FROM pg_proc WHERE proname IN ('get_teacher_visibility', 'get_student_overview') ORDER BY proname`)).rows;
  const b = await shape(await db(false));
  const a = await shape(await db(true));
  assert.equal(a.length, 2, "still exactly one overload each");
  assert.deepEqual(a, b);
});

test("EXECUTE grants after the migration", async () => {
  const d = await db(true);
  const res = await d.query(`
    SELECT f, r, has_function_privilege(r, f, 'EXECUTE') AS x
    FROM unnest(ARRAY['public.get_teacher_visibility(uuid)', 'public.get_student_overview(uuid)']) AS f,
         unnest(ARRAY['anon', 'authenticated']) AS r ORDER BY f, r`);
  assert.deepEqual(res.rows.map((x) => `${x.f} ${x.r} ${x.x}`), [
    "public.get_student_overview(uuid) anon false",
    "public.get_student_overview(uuid) authenticated true",
    "public.get_teacher_visibility(uuid) anon false",
    "public.get_teacher_visibility(uuid) authenticated true",
  ]);
  for (const f of ["get_teacher_visibility", "get_student_overview"]) {
    const acl = (await d.query("SELECT proacl::text AS acl FROM pg_proc WHERE proname = $1", [f])).rows[0].acl;
    assert.ok(!/(^|[{,])=X/.test(acl), `PUBLIC must hold no EXECUTE on ${f}: ${acl}`);
  }
});

test("the migration writes no data and is idempotent", async () => {
  const d = await db(true);
  const snap = async () => (await d.query(`
    SELECT (SELECT md5(string_agg(t::text, '|' ORDER BY id)) FROM public.question_instances t) AS qi,
           (SELECT md5(string_agg(t::text, '|' ORDER BY student_id)) FROM public.student_progress t) AS sp`)).rows[0];
  const before = await snap();
  await d.exec(AFTER);
  assert.deepEqual(await snap(), before);
  assert.equal(row(await visibility(d, "authenticated", T_A, T_A), A1).total_attempts, 24);
});

// ── the file itself ──────────────────────────────────────────────────────────────────────────

test("only CREATE OR REPLACE and privilege statements, no table, policy or data change", () => {
  const stmts = CODE.replace(/\$\$[\s\S]*?\$\$/g, "$$BODY$$").split(";").map((s) => s.trim()).filter(Boolean);
  assert.deepEqual(stmts.map((s) => s.split(" ").slice(0, 3).join(" ")), [
    "CREATE OR REPLACE", "REVOKE EXECUTE ON", "REVOKE EXECUTE ON", "REVOKE EXECUTE ON", "GRANT EXECUTE ON",
    "CREATE OR REPLACE", "REVOKE EXECUTE ON", "REVOKE EXECUTE ON", "GRANT EXECUTE ON",
  ]);
  assert.doesNotMatch(CODE, /\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|POLICY)\b/i);
  assert.doesNotMatch(CODE, /\bis_correct\b/, "the legacy column is no longer read");
  assert.doesNotMatch(CODE, /sp\.total_attempts/, "the dead counter is no longer read");
});

test("the gates are kept: caller from auth.uid(), role from profiles, scoped to own pupils", () => {
  assert.equal((CODE.match(/SECURITY DEFINER SET search_path = public, pg_temp/g) ?? []).length, 2);
  assert.equal((CODE.match(/v_uid uuid := \(SELECT auth\.uid\(\)\)/g) ?? []).length, 2);
  assert.match(CODE, /IF p_teacher_id IS DISTINCT FROM v_uid THEN RETURN; END IF;/);
  assert.match(CODE, /WHERE p\.teacher_id = v_uid AND p\.role = 'student'/);
  assert.match(CODE, /IF v_role IS NULL OR v_role NOT IN \('teacher', 'super_admin'\) THEN RETURN; END IF;/);
  assert.match(CODE, /v_role = 'super_admin' OR s\.teacher_id = v_uid/);
});

test("the version is unique and it is the newest migration touching either function", () => {
  const files = readdirSync(MIGRATIONS).filter((f) => /^\d{14}_.+\.sql$/.test(f)).sort();
  assert.equal(files.filter((f) => f.startsWith("20261029150000_")).length, 1);
  const later = files.filter((f) => f > FILE).filter((f) =>
    /get_teacher_visibility|get_student_overview/i.test(readFileSync(join(MIGRATIONS, f), "utf8").replace(/--.*$/gm, "")));
  assert.deepEqual(later, []);
});
