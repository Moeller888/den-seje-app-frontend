// RUNTIME proof for migration 20261101170000_achievement_reward_exactly_once (D-292), single session
// (PGlite, in-process). The simultaneous-call proof is achievement-reward-concurrency.test.mjs (real
// PostgreSQL 17 in CI).
//
// Fixture: production's state, read-only catalog 2026-11-01 — achievements, user_achievements (PK
// student_id + achievement_id, reward_claimed NOT NULL DEFAULT false, RLS on, only policy ua_select_own),
// student_progress, user_themes, user_items, user_titles, production's open table grants, and
// production's exact grant_achievement_rewards body with production's EXECUTE grants, installed by
// running the documented ROLLBACK block (its md5(prosrc) is asserted to be production's 63b8347d…).
// Synthetic users and achievements only.
//
// Cases: sequential behaviour is identical before and after (each reward type, response shape, a
// second call pays nothing, unearned and foreign achievements pay nothing, a reward_type NULL achievement
// is ignored, empty input); a caller without a JWT subject is refused with no write, before and after;
// clients cannot create or reset their own user_achievements rows (RLS); after the file anon and PUBLIC
// have no EXECUTE while authenticated and service_role keep it; the guard refuses an unreviewed body and
// accepts its own (re-run); signature / SECURITY DEFINER / search_path / owner unchanged; the rollback
// restores production's exact body and grants.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const FILE = "supabase/migrations/20261101170000_achievement_reward_exactly_once.sql";
const FN = "public.grant_achievement_rewards(text[])";
const PROD_MD5 = "63b8347dd4d72d40ced43e8728b5ab87";
const NEW_MD5 = "fc8d729f8b0166815fe2647805ce2e60";

function rollbackSql() {
  const m = /```sql\n([\s\S]*?)```/.exec(read("docs/operations/achievement-reward-race-rollback.md"));
  assert.ok(m && /ROLLBACK D-292/.test(m[1]), "rollback block");
  return m[1];
}

const P1 = "00000000-0000-4000-8000-0000000000a1";
const P2 = "00000000-0000-4000-8000-0000000000a2";

const FIXTURE = `
  CREATE ROLE anon NOLOGIN NOINHERIT NOBYPASSRLS;
  CREATE ROLE authenticated NOLOGIN NOINHERIT NOBYPASSRLS;
  CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  CREATE TABLE public.profiles (id uuid PRIMARY KEY);
  INSERT INTO public.profiles VALUES ('${P1}'), ('${P2}');
  CREATE TABLE public.student_progress (student_id uuid PRIMARY KEY, coins int);
  ALTER TABLE public.student_progress ENABLE ROW LEVEL SECURITY;
  CREATE POLICY sp_select_own ON public.student_progress FOR SELECT USING (student_id = auth.uid());
  INSERT INTO public.student_progress VALUES ('${P1}', 100), ('${P2}', 100);
  CREATE TABLE public.achievements (id text PRIMARY KEY, reward_type varchar, reward_value text, reward_amount int);
  ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
  CREATE POLICY ach_select_all ON public.achievements FOR SELECT TO authenticated USING (true);
  INSERT INTO public.achievements VALUES
    ('a_coins', 'coins', NULL, 25), ('b_coins', 'coins', NULL, 10), ('c_theme', 'theme', 'night', 0),
    ('d_item', 'item', 'cape', 0), ('e_title', 'title', 'Natugle', 0), ('f_none', NULL, NULL, NULL);
  CREATE TABLE public.user_achievements (
    student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    achievement_id text NOT NULL REFERENCES public.achievements(id),
    unlocked_at timestamptz NOT NULL DEFAULT now(),
    reward_claimed boolean NOT NULL DEFAULT false,
    reward_claimed_at timestamptz,
    PRIMARY KEY (student_id, achievement_id));
  ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
  CREATE POLICY ua_select_own ON public.user_achievements FOR SELECT TO authenticated USING (student_id = auth.uid());
  CREATE TABLE public.user_themes (user_id uuid NOT NULL, theme_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, theme_id));
  CREATE TABLE public.user_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, item_id text, created_at timestamp DEFAULT now(),
    UNIQUE (user_id, item_id));
  CREATE TABLE public.user_titles (user_id uuid NOT NULL, title_id text NOT NULL, earned_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, title_id));
  ALTER TABLE public.user_themes ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.user_items ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.user_titles ENABLE ROW LEVEL SECURITY;
  GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
  -- P1 has earned every achievement; P2 has earned a_coins only.
  INSERT INTO public.user_achievements (student_id, achievement_id) VALUES
    ('${P1}', 'a_coins'), ('${P1}', 'b_coins'), ('${P1}', 'c_theme'), ('${P1}', 'd_item'), ('${P1}', 'e_title'), ('${P1}', 'f_none'),
    ('${P2}', 'a_coins');
`;

async function prodDb() {
  const db = new PGlite();
  await db.exec(FIXTURE);
  await db.exec(rollbackSql());
  assert.equal(await md5(db), PROD_MD5, "fixture = production's body");
  return db;
}
async function migrated() {
  const db = await prodDb();
  await db.exec(read(FILE));
  return db;
}
const md5 = async (db) => (await db.query("SELECT md5(prosrc) AS h FROM pg_proc WHERE oid = to_regprocedure($1)", [FN])).rows[0]?.h ?? null;

async function as(db, role, sub, sql, params = []) {
  await db.query("SELECT set_config('request.jwt.claims', $1, false)", [sub ? JSON.stringify({ sub, role }) : ""]);
  await db.exec(`SET ROLE ${role}`);
  try { return await db.query(sql, params); } finally { await db.exec("RESET ROLE"); }
}
const grant = async (db, sub, ids, role = "authenticated") =>
  (await as(db, role, sub, "SELECT public.grant_achievement_rewards($1::text[]) AS r", [ids])).rows[0].r;
const state = async (db) => (await db.query(`SELECT
  (SELECT json_object_agg(student_id, coins ORDER BY student_id) FROM public.student_progress) AS coins,
  (SELECT json_agg(student_id || ':' || achievement_id ORDER BY student_id, achievement_id) FROM public.user_achievements WHERE reward_claimed) AS claimed,
  (SELECT count(*)::int FROM public.user_themes) AS themes,
  (SELECT count(*)::int FROM public.user_items) AS items,
  (SELECT count(*)::int FROM public.user_titles) AS titles`)).rows[0];
const ALL = ["a_coins", "b_coins", "c_theme", "d_item", "e_title", "f_none", "zz_unknown"];
const byId = (r) => [...r].sort((x, y) => x.achievement_id.localeCompare(y.achievement_id));

test("sequential behaviour is identical before and after: each type once, then nothing", async () => {
  for (const make of [prodDb, migrated]) {
    const db = await make();
    const first = await grant(db, P1, ALL);
    assert.deepEqual(byId(first), [
      { achievement_id: "a_coins", reward_type: "coins", reward_value: null, reward_amount: 25 },
      { achievement_id: "b_coins", reward_type: "coins", reward_value: null, reward_amount: 10 },
      { achievement_id: "c_theme", reward_type: "theme", reward_value: "night", reward_amount: 0 },
      { achievement_id: "d_item", reward_type: "item", reward_value: "cape", reward_amount: 0 },
      { achievement_id: "e_title", reward_type: "title", reward_value: "Natugle", reward_amount: 0 },
    ], make.name);
    assert.deepEqual(await grant(db, P1, ALL), [], `${make.name}: a second call pays nothing`);
    const s = await state(db);
    assert.deepEqual(s.coins, { [P1]: 135, [P2]: 100 }, make.name);
    assert.deepEqual(s.claimed, [`${P1}:a_coins`, `${P1}:b_coins`, `${P1}:c_theme`, `${P1}:d_item`, `${P1}:e_title`], make.name);
    assert.deepEqual([s.themes, s.items, s.titles], [1, 1, 1], make.name);
    assert.deepEqual(await grant(db, P1, []), [], `${make.name}: empty input`);
    assert.deepEqual(await grant(db, P1, null), [], `${make.name}: NULL input`);
  }
});

test("unearned and foreign achievements pay nothing, before and after", async () => {
  for (const make of [prodDb, migrated]) {
    const db = await make();
    // P2 has earned only a_coins; asking for P1's other achievements pays nothing and claims nothing.
    const r = await grant(db, P2, ALL);
    assert.deepEqual(r.map((g) => g.achievement_id), ["a_coins"], make.name);
    const s = await state(db);
    assert.deepEqual(s.coins, { [P1]: 100, [P2]: 125 }, make.name);
    assert.deepEqual(s.claimed, [`${P2}:a_coins`], make.name, "P1's rows untouched");
  }
});

test("a caller without a JWT subject is refused with no write, before and after", async () => {
  const before = await prodDb();
  for (const role of ["anon", "authenticated"]) {
    await assert.rejects(grant(before, null, ALL, role), /not_authenticated/, `production: ${role} without sub`);
  }
  assert.deepEqual((await state(before)).claimed, null);
  const after = await migrated();
  await assert.rejects(grant(after, null, ALL, "anon"), /permission denied/, "after: anon has no EXECUTE");
  await assert.rejects(grant(after, P1, ALL, "anon"), /permission denied/, "after: anon has no EXECUTE, whatever the claims");
  await assert.rejects(grant(after, null, ALL, "authenticated"), /not_authenticated/);
  const s = await state(after);
  assert.deepEqual([s.claimed, s.coins[P1]], [null, 100]);
});

test("clients cannot create or reset their own user_achievements rows (RLS: SELECT only)", async () => {
  const db = await migrated();
  await assert.rejects(as(db, "authenticated", P2,
    "INSERT INTO public.user_achievements (student_id, achievement_id) VALUES ($1, 'b_coins')", [P2]), /row-level security/);
  await grant(db, P2, ["a_coins"]);
  const upd = await as(db, "authenticated", P2,
    "UPDATE public.user_achievements SET reward_claimed = false WHERE student_id = $1", [P2]);
  assert.equal(upd.affectedRows ?? 0, 0, "no UPDATE policy: zero rows");
  assert.deepEqual(await grant(db, P2, ["a_coins"]), []);
  assert.deepEqual((await state(db)).coins[P2], 125);
});

test("EXECUTE after the file: authenticated and service_role only; metadata unchanged", async () => {
  const meta = async (db) => (await db.query(`SELECT pg_get_function_result(p.oid) AS r, p.prosecdef, p.proconfig,
      pg_get_userbyid(p.proowner) AS owner, p.prolang = (SELECT oid FROM pg_language WHERE lanname = 'plpgsql') AS plpgsql
    FROM pg_proc p WHERE p.oid = to_regprocedure($1)`, [FN])).rows[0];
  const exec = async (db) => {
    const out = {};
    for (const role of ["anon", "authenticated", "service_role"]) {
      out[role] = (await db.query(`SELECT has_function_privilege('${role}', '${FN}', 'EXECUTE') AS h`)).rows[0].h;
    }
    out.PUBLIC = (await db.query(`SELECT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
      WHERE p.oid = to_regprocedure($1) AND a.grantee = 0 AND a.privilege_type = 'EXECUTE') AS h`, [FN])).rows[0].h;
    return out;
  };
  const before = await prodDb();
  const after = await migrated();
  assert.deepEqual(await meta(after), await meta(before));
  assert.deepEqual(await exec(before), { anon: true, authenticated: true, service_role: true, PUBLIC: true });
  assert.deepEqual(await exec(after), { anon: false, authenticated: true, service_role: true, PUBLIC: false });
  assert.equal(await md5(after), NEW_MD5);
});

test("the guard refuses an unreviewed body and accepts its own (re-run)", async () => {
  const db = await prodDb();
  await db.exec(`CREATE OR REPLACE FUNCTION public.grant_achievement_rewards(p_achievement_ids text[])
    RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN RETURN '[]'::jsonb; END; $$;`);
  await assert.rejects(db.exec(read(FILE)), /D-292: grant_achievement_rewards has an unreviewed body/);
  const ok = await migrated();
  await ok.exec(read(FILE));
  assert.equal(await md5(ok), NEW_MD5);
});

test("the documented rollback restores production's exact body and grants", async () => {
  const db = await migrated();
  await db.exec(rollbackSql());
  assert.equal(await md5(db), PROD_MD5);
  assert.equal((await db.query(`SELECT has_function_privilege('anon', '${FN}', 'EXECUTE') AS h`)).rows[0].h, true);
  assert.equal((await grant(db, P1, ["a_coins"])).length, 1, "production's body pays as before");
});
