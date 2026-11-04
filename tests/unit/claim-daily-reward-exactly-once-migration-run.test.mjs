// RUNTIME proof for migration 20261031230000_claim_daily_reward_exactly_once (D-284), single session
// (PGlite, in-process). The simultaneous-call proof is claim-daily-reward-concurrency.test.mjs (real
// PostgreSQL 17 in CI).
//
// Fixture: production's state, read-only catalog 2026-10-31 — daily_login_rewards (PK student_id → profiles,
// last_claimed_date date, total_claims int default 0, RLS on, policy dlr_select_own) and production's exact
// claim_daily_reward body, installed by running the documented ROLLBACK block (its md5(prosrc) is asserted
// to be production's 80273d5d…). The repository body of 20260518000100 (same logic plus five comment lines)
// is used for the guard case. Production's open grants. Synthetic users only.
//
// Cases: sequential behaviour is identical to production's (pay, already_claimed, next day, no progress row,
// response shapes, coin formula and cap, not_authenticated); the guard refuses an unreviewed body and accepts
// production's, the repository's and its own (re-run); signature / SECURITY DEFINER / search_path / ACL
// unchanged; the rollback restores production's exact body.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const FILE = "supabase/migrations/20261031230000_claim_daily_reward_exactly_once.sql";
const RETENTION = "supabase/migrations/20260518000100_retention_loops.sql";
const PROD_MD5 = "80273d5dc396679cd66376fd56ca3ff3";
const REPO_MD5 = "8bc545a027baf8746dcd9f5de93700ba";
const NEW_MD5 = "ea8efbadf880eaf5ac2767716976a537";

function rollbackSql() {
  const m = /```sql\n([\s\S]*?)```/.exec(read("docs/operations/daily-reward-race-rollback.md"));
  assert.ok(m && /ROLLBACK D-284/.test(m[1]), "rollback block");
  return m[1];
}
function repoFunction() {
  const src = read(RETENTION);
  const start = src.indexOf("CREATE OR REPLACE FUNCTION public.claim_daily_reward()");
  assert.ok(start >= 0);
  const a = src.indexOf("$$", start) + 2;
  const b = src.indexOf("$$", a);
  return src.slice(start, src.indexOf(";", b) + 1);
}

const P1 = "00000000-0000-4000-8000-0000000000d1";
const P2 = "00000000-0000-4000-8000-0000000000d2";
const P3 = "00000000-0000-4000-8000-0000000000d3"; // no student_progress row

const FIXTURE = `
  CREATE ROLE anon NOLOGIN NOINHERIT NOBYPASSRLS;
  CREATE ROLE authenticated NOLOGIN NOINHERIT NOBYPASSRLS;
  CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  CREATE ROLE authenticator LOGIN NOINHERIT NOSUPERUSER;
  GRANT anon, authenticated, service_role TO authenticator;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  CREATE TABLE public.profiles (id uuid PRIMARY KEY);
  INSERT INTO public.profiles VALUES ('${P1}'), ('${P2}'), ('${P3}');
  CREATE TABLE public.student_progress (student_id uuid PRIMARY KEY, coins int, current_streak int);
  ALTER TABLE public.student_progress ENABLE ROW LEVEL SECURITY;
  INSERT INTO public.student_progress VALUES ('${P1}', 100, 3), ('${P2}', 0, 20);
  CREATE TABLE public.daily_login_rewards (
    student_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    last_claimed_date date,
    total_claims integer NOT NULL DEFAULT 0);
  ALTER TABLE public.daily_login_rewards ENABLE ROW LEVEL SECURITY;
  CREATE POLICY dlr_select_own ON public.daily_login_rewards FOR SELECT TO authenticated USING (auth.uid() = student_id);
  GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
`;
const GRANTS = "GRANT EXECUTE ON FUNCTION public.claim_daily_reward() TO PUBLIC, anon, authenticated, service_role;";

async function prodDb() {
  const db = new PGlite();
  await db.exec(FIXTURE);
  await db.exec(rollbackSql());
  await db.exec(GRANTS);
  assert.equal(await md5(db), PROD_MD5, "fixture = production's exact body");
  return db;
}
async function migrated() {
  const db = await prodDb();
  await db.exec(read(FILE));
  return db;
}
const md5 = async (db) => (await db.query(`SELECT md5(p.prosrc) AS m FROM pg_proc p JOIN pg_namespace n
  ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'claim_daily_reward'`)).rows[0]?.m;

const q = (s) => s.split("'").join("''");
async function claim(db, sub) {
  const claims = sub ? { role: "authenticated", sub, aud: "authenticated" } : { role: "authenticated", aud: "authenticated" };
  try {
    await db.exec(`SET SESSION AUTHORIZATION authenticator;
      SELECT set_config('request.jwt.claims', '${q(JSON.stringify(claims))}', false), set_config('request.jwt.claim.sub', '', false);
      SET ROLE authenticated;`);
    return { ok: true, r: (await db.query("SELECT public.claim_daily_reward() AS r")).rows[0].r };
  } catch (e) {
    return { ok: false, message: e.message };
  } finally {
    await db.exec(`RESET ROLE; SET SESSION AUTHORIZATION postgres;
      SELECT set_config('request.jwt.claims', '', false), set_config('request.jwt.claim.sub', '', false);`);
  }
}
const state = async (db, id) => ({
  coins: (await db.query(`SELECT coins FROM public.student_progress WHERE student_id = '${id}'`)).rows[0]?.coins ?? null,
  claim: (await db.query(`SELECT last_claimed_date = current_date AS today, total_claims AS n
    FROM public.daily_login_rewards WHERE student_id = '${id}'`)).rows[0] ?? null,
});

// Sequential behaviour, run on BOTH bodies: it must be identical.
async function sequentialTrace(db) {
  const out = [];
  out.push(await claim(db, P1), await state(db, P1));
  out.push(await claim(db, P1), await state(db, P1));                       // same day
  await db.query(`UPDATE public.daily_login_rewards SET last_claimed_date = current_date - 1 WHERE student_id = '${P1}'`);
  out.push(await claim(db, P1), await state(db, P1));                       // next day
  out.push(await claim(db, P2), await state(db, P2));                       // high streak → cap 150
  out.push(await claim(db, P3), await state(db, P3));                       // no progress row
  out.push(await claim(db, null));                                          // no subject
  return out;
}

test("sequential behaviour is identical to production's: pay once a day, cap, no-progress row, shapes, errors", async () => {
  const before = await sequentialTrace(await prodDb());
  const after = await sequentialTrace(await migrated());
  assert.deepEqual(after, before);
  // And the concrete values are the documented ones.
  assert.deepEqual(after[0], { ok: true, r: { status: "claimed", coins: 70, streak: 3 } });
  assert.deepEqual(after[1], { coins: 170, claim: { today: true, n: 1 } });
  assert.deepEqual(after[2], { ok: true, r: { status: "already_claimed" } });
  assert.deepEqual(after[3], { coins: 170, claim: { today: true, n: 1 } });
  assert.deepEqual(after[4].r, { status: "claimed", coins: 70, streak: 3 });
  assert.deepEqual(after[7], { coins: 150, claim: { today: true, n: 1 } });
  assert.deepEqual(after[8].r, { status: "claimed", coins: 25, streak: 0 });
  assert.deepEqual(after[9], { coins: null, claim: { today: true, n: 1 } });
  assert.equal(after[10].ok, false);
  assert.match(after[10].message, /not_authenticated/);
});

test("signature, RETURNS json, SECURITY DEFINER, search_path and ACL are unchanged", async () => {
  const meta = async (db) => (await db.query(`SELECT pg_get_function_identity_arguments(p.oid) AS a,
    pg_get_function_result(p.oid) AS ret, p.prosecdef, p.proconfig, l.lanname, p.proacl::text AS acl
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_language l ON l.oid = p.prolang
    WHERE n.nspname = 'public' AND p.proname = 'claim_daily_reward'`)).rows;
  const norm = (rows) => rows.map((r) => ({ ...r, acl: r.acl.replace(/^\{|\}$/g, "").split(",").sort().join(",") }));
  const before = norm(await meta(await prodDb()));
  const db = await migrated();
  assert.deepEqual(norm(await meta(db)), before);
  assert.equal(before.length, 1, "one overload");
  assert.equal(await md5(db), NEW_MD5, "the body the post-check expects");
});

test("the guard refuses an unreviewed body and changes nothing", async () => {
  const db = await prodDb();
  await db.exec(`CREATE OR REPLACE FUNCTION public.claim_daily_reward() RETURNS json LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public AS $$ BEGIN RETURN json_build_object('status', 'tampered'); END; $$;`);
  const tampered = await md5(db);
  await assert.rejects(db.exec(read(FILE)), /D-284: claim_daily_reward has an unreviewed body/);
  assert.equal(await md5(db), tampered);
});

test("the guard accepts the repository body (isolated replay) and the file's own body (re-run)", async () => {
  const db = new PGlite();
  await db.exec(FIXTURE);
  await db.exec(repoFunction());
  assert.equal(await md5(db), REPO_MD5);
  await db.exec(read(FILE));
  assert.equal(await md5(db), NEW_MD5);
  await db.exec(read(FILE));                                               // re-run
  assert.equal(await md5(db), NEW_MD5);
});

test("the documented rollback restores production's exact body; old function tolerates the new NULL rows", async () => {
  const db = await migrated();
  await claim(db, P1);
  await db.query(`INSERT INTO public.daily_login_rewards (student_id, last_claimed_date, total_claims) VALUES ('${P3}', NULL, 0)`);
  await db.exec(rollbackSql());
  assert.equal(await md5(db), PROD_MD5);
  const r = await claim(db, P3);
  assert.deepEqual(r.r, { status: "claimed", coins: 25, streak: 0 });
  assert.deepEqual((await state(db, P3)).claim, { today: true, n: 1 });
});
