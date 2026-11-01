// RUNTIME proof for migration 20261101120000_night_owl_stop_new_awards (D-286), PGlite (in-process).
//
// Fixture: production's state (read-only catalog 2026-11-01) — evaluate_achievements is the EXACT body of
// 20261025120000_student_rpc_caller_scope.sql (md5(prosrc) 9bd9a5d5…, asserted), installed with its
// grants; set_night_correct is D-278's version from 20261031190000 with production's ACL;
// calculate_level_from_xp from 20260518000300. Synthetic users only.
//
// Cases: before, a set flag awards night_owl (negative control); after, it never does, while every
// other achievement is decided exactly as before (same inputs → same awards); earned night_owl rows and
// titles are untouched; set_night_correct has no EXECUTE for authenticated, service_role keeps it;
// the new body is the old one minus exactly the night_owl branch; signature / RETURNS / SECURITY DEFINER
// / search_path / ACL unchanged; the guard refuses an unreviewed body and accepts its own (re-run);
// the documented rollback restores the exact production body and the EXECUTE grant.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const MIG = (f) => read(join("supabase", "migrations", f));
const FILE = "20261101120000_night_owl_stop_new_awards.sql";
const PROD_MD5 = "9bd9a5d5278894da7876cbd6cfd69ddd";
const NEW_MD5 = "7d213773cafcf0480f77539b975fbbec";

function fnStatement(file, name) {
  const src = MIG(file);
  const start = src.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.ok(start >= 0, `${name} in ${file}`);
  const tag = /AS\s+(\$[a-z_]*\$)/i.exec(src.slice(start));
  const bodyStart = src.indexOf(tag[1], start) + tag[1].length;
  const bodyEnd = src.indexOf(tag[1], bodyStart);
  return src.slice(start, src.indexOf(";", bodyEnd) + 1);
}
function rollbackSql() {
  const m = /```sql\n([\s\S]*?)```/.exec(read("docs/operations/night-owl-rollback.md"));
  assert.ok(m && /ROLLBACK D-286/.test(m[1]));
  return m[1];
}

const P = "00000000-0000-4000-8000-0000000000e1";
const FIXTURE = `
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;
  CREATE TABLE public.profiles (id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.student_progress (student_id uuid PRIMARY KEY, correct_answers int, xp int,
    longest_streak int, night_correct boolean NOT NULL DEFAULT false, best_session_streak int NOT NULL DEFAULT 0);
  CREATE TABLE public.question_instances (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_id uuid,
    answered boolean, was_correct boolean, answered_at timestamptz);
  CREATE TABLE public.shop_items (id text PRIMARY KEY, rarity text);
  CREATE TABLE public.themes (id text PRIMARY KEY, rarity text);
  CREATE TABLE public.user_items (user_id uuid, item_id text);
  CREATE TABLE public.user_themes (user_id uuid, theme_id text);
  CREATE TABLE public.user_achievements (student_id uuid, achievement_id text, reward_claimed boolean DEFAULT false,
    PRIMARY KEY (student_id, achievement_id));
  CREATE TABLE public.user_titles (user_id uuid, title_id text);
  INSERT INTO public.shop_items VALUES ('crown', 'legendary'), ('hat', 'common');
  INSERT INTO public.themes VALUES ('gold', 'legendary');
`;

async function prodDb() {
  const db = new PGlite();
  await db.exec(FIXTURE);
  await db.exec(fnStatement("20260518000300_achievements.sql", "calculate_level_from_xp"));
  await db.exec(fnStatement("20261025120000_student_rpc_caller_scope.sql", "evaluate_achievements"));
  await db.exec(`REVOKE ALL ON FUNCTION public.evaluate_achievements(uuid) FROM PUBLIC, anon, service_role;
                 GRANT EXECUTE ON FUNCTION public.evaluate_achievements(uuid) TO authenticated;`);
  await db.exec(fnStatement("20261031190000_reward_integrity_server_authority.sql", "set_night_correct"));
  await db.exec(`REVOKE EXECUTE ON FUNCTION public.set_night_correct() FROM PUBLIC, anon;
                 GRANT EXECUTE ON FUNCTION public.set_night_correct() TO authenticated, service_role;`);
  assert.equal(await md5(db), PROD_MD5, "fixture = production's exact body");
  return db;
}
async function migrated() {
  const db = await prodDb();
  await db.exec(MIG(FILE));
  return db;
}
const md5 = async (db) => (await db.query(`SELECT md5(p.prosrc) AS m FROM pg_proc p JOIN pg_namespace n
  ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'evaluate_achievements'`)).rows[0]?.m;
// A pupil who qualifies for MANY achievements at once, including the night flag.
async function richPupil(db, { night = true } = {}) {
  await db.query(`INSERT INTO public.profiles VALUES ('${P}', now() - interval '1 hour')`);
  await db.query(`INSERT INTO public.student_progress VALUES ('${P}', 1000, 99999, 30, ${night}, 7)`);
  await db.query(`INSERT INTO public.user_items VALUES ('${P}', 'crown'), ('${P}', 'hat'), ('${P}', 'hat'), ('${P}', 'hat'), ('${P}', 'hat')`);
  await db.query(`INSERT INTO public.user_themes VALUES ('${P}', 'gold'), ('${P}', 'gold'), ('${P}', 'gold')`);
}
const evaluate = async (db) => (await db.query(`SELECT public.evaluate_achievements('${P}') AS r`)).rows[0].r;
const owned = async (db) => (await db.query(`SELECT achievement_id FROM public.user_achievements WHERE student_id = '${P}'
  ORDER BY 1`)).rows.map((r) => r.achievement_id);

test("BEFORE: production's body awards night_owl when the flag is set (negative control)", async () => {
  const db = await prodDb();
  await richPupil(db);
  assert.ok((await evaluate(db)).includes("night_owl"));
});

test("AFTER: night_owl is never awarded; every other achievement is decided exactly as before", async () => {
  const before = await prodDb();
  await richPupil(before);
  const awardedBefore = (await evaluate(before)).filter((a) => a !== "night_owl").sort();
  const after = await migrated();
  await richPupil(after);
  const awardedAfter = (await evaluate(after)).sort();
  assert.equal(awardedAfter.includes("night_owl"), false);
  assert.deepEqual(awardedAfter, awardedBefore);
  assert.ok(awardedAfter.length >= 10, `the fixture exercises the ladder (${awardedAfter.length})`);
  assert.equal((await owned(after)).includes("night_owl"), false);
});

test("earned night_owl awards and titles are kept; re-evaluating changes nothing about them", async () => {
  const db = await prodDb();
  await richPupil(db);
  await evaluate(db);                                                   // earned under the old rule
  await db.query(`UPDATE public.user_achievements SET reward_claimed = true WHERE achievement_id = 'night_owl'`);
  await db.query(`INSERT INTO public.user_titles VALUES ('${P}', 'natugle')`);
  await db.exec(MIG(FILE));
  assert.deepEqual(await evaluate(db), []);
  assert.ok((await owned(db)).includes("night_owl"));
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.user_titles WHERE title_id = 'natugle'`)).rows[0].n, 1);
  assert.equal((await db.query(`SELECT night_correct FROM public.student_progress WHERE student_id = '${P}'`)).rows[0].night_correct, true);
});

test("the new body is the old one minus exactly the night_owl branch", async () => {
  const src = (db) => db.query(`SELECT p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'evaluate_achievements'`).then((r) => r.rows[0].prosrc);
  const oldBody = await src(await prodDb());
  const db = await migrated();
  const newBody = await src(db);
  assert.equal(await md5(db), NEW_MD5);
  assert.equal(/'night_owl'/.test(newBody), false);
  const strip = (s) => s.replace(/  -- night_owl[\s\S]*?(?=  -- perfect_five)/, "");
  assert.equal(strip(newBody), strip(oldBody));
});

test("set_night_correct: no EXECUTE for authenticated (or PUBLIC/anon); service_role keeps it", async () => {
  const db = await migrated();
  const has = async (r) => (await db.query(`SELECT has_function_privilege('${r}', 'public.set_night_correct()', 'EXECUTE') AS h`)).rows[0].h;
  assert.equal(await has("authenticated"), false);
  assert.equal(await has("anon"), false);
  assert.equal(await has("service_role"), true);
});

test("evaluate_achievements: signature, RETURNS, SECURITY DEFINER, search_path and ACL unchanged", async () => {
  const meta = async (db) => (await db.query(`SELECT pg_get_function_identity_arguments(p.oid) AS a,
    pg_get_function_result(p.oid) AS r, p.prosecdef, p.proconfig, p.proacl::text AS acl
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'evaluate_achievements'`)).rows;
  assert.deepEqual(await meta(await migrated()), await meta(await prodDb()));
});

test("the guard refuses an unreviewed body and accepts its own (re-run)", async () => {
  const db = await prodDb();
  await db.exec(`CREATE OR REPLACE FUNCTION public.evaluate_achievements(p_student_id uuid DEFAULT NULL) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN RETURN '[]'::jsonb; END; $$;`);
  await assert.rejects(db.exec(MIG(FILE)), /D-286: evaluate_achievements has an unreviewed body/);
  const ok = await migrated();
  await ok.exec(MIG(FILE));
  assert.equal(await md5(ok), NEW_MD5);
});

test("the documented rollback restores production's exact body and the EXECUTE grant", async () => {
  const db = await migrated();
  await db.exec(rollbackSql());
  assert.equal(await md5(db), PROD_MD5);
  assert.equal((await db.query(`SELECT has_function_privilege('authenticated', 'public.set_night_correct()', 'EXECUTE') AS h`)).rows[0].h, true);
  await richPupil(db);
  assert.ok((await evaluate(db)).includes("night_owl"));
});
