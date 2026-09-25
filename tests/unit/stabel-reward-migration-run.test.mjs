// RUNTIME proof for migration 20260928000000_stabel_reward. The SQL file is executed UNMODIFIED
// against a real PostgreSQL (PGlite, in-process WebAssembly — no Docker, no network), and the
// tests assert what claim_stabel_reward DOES: 1 coin per plate, at most 50 per call and per
// Copenhagen day, students only, and a failed credit rolls the ledger back.
//
// HONEST LIMITS:
//   - PGlite is PostgreSQL 18.x; production is 17.6.
//   - auth.users, auth.uid(), profiles and student_progress are minimal stand-ins with only the
//     columns the function reads or writes. auth.uid() reads the test-set `test.uid` setting.
//   - Grants are exercised on PUBLIC/anon/authenticated roles created here, not Supabase's own.
//   - Passing here is not permission to deploy. Applying the migration needs its own owner
//     authorisation (D-110).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATION = readFileSync(join(ROOT, "supabase", "migrations", "20260928000000_stabel_reward.sql"), "utf8");

const PUPIL = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const TEACHER = "00000000-0000-4000-8000-000000000003";
const NO_PROGRESS = "00000000-0000-4000-8000-000000000004";

const FIXTURE = `
  CREATE ROLE anon; CREATE ROLE authenticated;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
  CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text);
  CREATE TABLE public.student_progress (student_id uuid PRIMARY KEY, coins integer NOT NULL DEFAULT 0);
  INSERT INTO auth.users VALUES ('${PUPIL}'), ('${OTHER}'), ('${TEACHER}'), ('${NO_PROGRESS}');
  INSERT INTO public.profiles VALUES
    ('${PUPIL}', 'student'), ('${OTHER}', 'student'), ('${TEACHER}', 'teacher'), ('${NO_PROGRESS}', 'student');
  INSERT INTO public.student_progress VALUES ('${PUPIL}', 100), ('${OTHER}', 0), ('${TEACHER}', 0);
`;

async function fresh() {
  const db = new PGlite();
  await db.exec(FIXTURE);
  await db.exec(MIGRATION);
  return db;
}

async function claim(db, uid, plates) {
  await db.query("SELECT set_config('test.uid', $1, false)", [uid ?? ""]);
  const res = await db.query("SELECT public.claim_stabel_reward($1) AS r", [plates]);
  const r = res.rows[0].r;
  return typeof r === "string" ? JSON.parse(r) : r;
}

async function coins(db, uid) {
  const res = await db.query("SELECT coins FROM public.student_progress WHERE student_id = $1", [uid]);
  return res.rows.length > 0 ? res.rows[0].coins : null;
}

test("a round pays one coin per plate", async () => {
  const db = await fresh();
  const r = await claim(db, PUPIL, 12);
  assert.deepEqual(r, { status: "ok", coins: 12, today: 12, cap: 50 });
  assert.equal(await coins(db, PUPIL), 112);
});

test("one call never pays more than 50, whatever the client claims", async () => {
  const db = await fresh();
  const r = await claim(db, PUPIL, 99999);
  assert.equal(r.coins, 50);
  assert.equal(await coins(db, PUPIL), 150);
});

test("the day stops paying at 50 in total, and a zero-plate round pays nothing", async () => {
  const db = await fresh();
  assert.equal((await claim(db, PUPIL, 30)).coins, 30);
  const second = await claim(db, PUPIL, 30);
  assert.equal(second.coins, 20);
  assert.equal(second.today, 50);
  assert.equal((await claim(db, PUPIL, 10)).coins, 0);
  assert.equal((await claim(db, PUPIL, 0)).coins, 0);
  assert.equal(await coins(db, PUPIL), 150);
});

test("each pupil has their own daily allowance", async () => {
  const db = await fresh();
  await claim(db, PUPIL, 50);
  assert.equal((await claim(db, OTHER, 7)).coins, 7);
  assert.equal(await coins(db, OTHER), 7);
});

test("a new Copenhagen day resets the allowance", async () => {
  const db = await fresh();
  await claim(db, PUPIL, 50);
  await db.query("UPDATE public.stabel_daily_rewards SET reward_date = reward_date - 1 WHERE student_id = $1", [PUPIL]);
  const r = await claim(db, PUPIL, 5);
  assert.equal(r.coins, 5);
  assert.equal(r.today, 5);
});

test("no session, a teacher and a negative or null score are refused and pay nothing", async () => {
  const db = await fresh();
  await assert.rejects(claim(db, null, 5), /not_authenticated/);
  await assert.rejects(claim(db, TEACHER, 5), /not_a_student/);
  await assert.rejects(claim(db, PUPIL, -3), /invalid_plates/);
  await assert.rejects(claim(db, PUPIL, null), /invalid_plates/);
  assert.equal(await coins(db, TEACHER), 0);
  assert.equal(await coins(db, PUPIL), 100);
});

test("a pupil without a progress row gets an error and the ledger is rolled back", async () => {
  const db = await fresh();
  await assert.rejects(claim(db, NO_PROGRESS, 5), /no_progress_row/);
  const res = await db.query("SELECT count(*)::int AS n FROM public.stabel_daily_rewards WHERE student_id = $1", [NO_PROGRESS]);
  assert.equal(res.rows[0].n, 0);
});

test("only authenticated may execute, and nobody but the function touches the ledger", async () => {
  const db = await fresh();
  const priv = async (role, obj, kind, what) =>
    (await db.query(`SELECT has_${kind}_privilege($1, $2, $3) AS ok`, [role, obj, what])).rows[0].ok;
  const fn = "public.claim_stabel_reward(integer)";
  assert.equal(await priv("authenticated", fn, "function", "EXECUTE"), true);
  assert.equal(await priv("anon", fn, "function", "EXECUTE"), false);
  for (const role of ["anon", "authenticated"]) {
    for (const what of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      assert.equal(await priv(role, "public.stabel_daily_rewards", "table", what), false, `${role} ${what}`);
    }
  }
  const rls = await db.query("SELECT relrowsecurity FROM pg_class WHERE oid = 'public.stabel_daily_rewards'::regclass");
  assert.equal(rls.rows[0].relrowsecurity, true);
});
