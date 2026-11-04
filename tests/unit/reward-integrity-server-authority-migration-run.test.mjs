// RUNTIME proof for migration 20261031190000_reward_integrity_server_authority (D-278). The SQL file is
// executed UNMODIFIED against a real PostgreSQL (PGlite, in-process — no Docker, no network) on a fixture
// built from the repository's own definitions:
//   * weekly_quests + student_weekly_quest_progress, their policies and seeds, verbatim from
//     20260524000000_weekly_quests.sql, plus update_weekly_quest_progress_for_answer and
//     claim_weekly_quest_reward from the same file — then 20260925000000_weekly_quest_progress_read_scope.sql
//     verbatim, which replaced the teacher SELECT policy with "super_admins read all weekly quest
//     progress". The resulting four policies are exactly production's (read-only catalog 2026-10-31);
//   * set_night_correct / update_best_session_streak verbatim from 20260518000500_hidden_achievements.sql;
//   * production's open grants (full table privileges and function EXECUTE for PUBLIC, anon,
//     authenticated, service_role — read from the production catalog 2026-10-31).
// Synthetic users only; no production data and no production access.
//
// How an API call is modelled (as PostgREST does it): session user `authenticator`, SET ROLE <role>,
// request.jwt.claims = the verified JWT payload; auth.uid() is Supabase's own definition.
//
// Cases: the fixture reproduces the client-writable state before the migration; after it the pupil
// cannot write weekly progress, the server paths still progress and pay exactly once, the two flags are
// decided by the server from the pupil's own answers (session window, Danish time incl. DST), anon has
// no EXECUTE, ACL / SECURITY DEFINER / search_path, idempotent re-run, client contract unchanged, and the
// documented rollback restores the pre-migration definitions and ACLs exactly.
//
// HONEST LIMITS: PGlite is PostgreSQL 18, production 17.6; PostgREST and JWT signature checks are not in
// the loop. The quest functions are the repository bodies (production's differ only in search_path).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const MIG = (f) => read(join("supabase", "migrations", f));
const FILE = "20261031190000_reward_integrity_server_authority.sql";
const WEEKLY = "20260524000000_weekly_quests.sql";
const HIDDEN = "20260518000500_hidden_achievements.sql";
const READ_SCOPE = "20260925000000_weekly_quest_progress_read_scope.sql";
// Production before the migration (read-only catalog 2026-10-31).
const PROD_POLICIES_BEFORE = [
  { policyname: "super_admins read all weekly quest progress", cmd: "SELECT", roles: "{authenticated}" },
  { policyname: "weekly_progress_insert_own", cmd: "INSERT", roles: "{public}" },
  { policyname: "weekly_progress_select_own", cmd: "SELECT", roles: "{public}" },
  { policyname: "weekly_progress_update_own", cmd: "UPDATE", roles: "{public}" },
];
const PROD_PROSRC_MD5 = { set_night_correct: "fc2cb97c4f147625fa170abe404f9f28",
                          update_best_session_streak: "9b748ad15766feb2b649671ebbaa0aca" };

function fnStatement(file, name) {
  const src = MIG(file);
  const start = src.search(new RegExp(String.raw`CREATE OR REPLACE FUNCTION public\.` + name + String.raw`\(`));
  assert.ok(start >= 0, `${name} in ${file}`);
  const tag = /AS\s+(\$[a-z_]*\$)/i.exec(src.slice(start));
  const bodyStart = src.indexOf(tag[1], start) + tag[1].length;
  const bodyEnd = src.indexOf(tag[1], bodyStart);
  return src.slice(start, src.indexOf(";", bodyEnd) + 1);
}

// Sections 1–3 of the weekly-quests migration (tables, RLS, policies, seeds), verbatim.
function weeklyTablesAndSeeds() {
  const src = MIG(WEEKLY);
  const a = src.indexOf("-- ── 1. weekly_quests table");
  const b = src.indexOf("-- ── 4. update_weekly_quest_progress_for_answer");
  assert.ok(a >= 0 && b > a);
  return src.slice(a, b);
}

// The rollback block of docs/operations/reward-integrity-rollback.md, verbatim.
function rollbackSql() {
  const doc = read("docs/operations/reward-integrity-rollback.md");
  const m = /```sql\n([\s\S]*?)```/.exec(doc);
  assert.ok(m, "rollback sql block");
  assert.match(m[1], /ROLLBACK D-278/);
  return m[1];
}

const P1 = "00000000-0000-4000-8000-0000000000a1";
const P2 = "00000000-0000-4000-8000-0000000000a2";

const FIXTURE = `
  CREATE ROLE anon NOLOGIN NOINHERIT NOBYPASSRLS;
  CREATE ROLE authenticated NOLOGIN NOINHERIT NOBYPASSRLS;
  CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  CREATE ROLE authenticator LOGIN NOINHERIT NOSUPERUSER;
  GRANT anon, authenticated, service_role TO authenticator;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;
  INSERT INTO auth.users VALUES ('${P1}'), ('${P2}');
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

  -- Read by the teacher SELECT policy of student_weekly_quest_progress.
  CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text NOT NULL);
  ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
  CREATE POLICY profiles_select_own ON public.profiles FOR SELECT USING (auth.uid() = id);
  INSERT INTO public.profiles VALUES ('${P1}', 'student'), ('${P2}', 'student');

  CREATE TABLE public.student_progress (
    student_id uuid PRIMARY KEY, coins int NOT NULL DEFAULT 0,
    night_correct boolean NOT NULL DEFAULT false, best_session_streak int NOT NULL DEFAULT 0);
  ALTER TABLE public.student_progress ENABLE ROW LEVEL SECURITY;
  CREATE POLICY sp_select_own ON public.student_progress FOR SELECT USING (auth.uid() = student_id);
  INSERT INTO public.student_progress (student_id, coins) VALUES ('${P1}', 100), ('${P2}', 100);

  CREATE TABLE public.question_instances (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_id uuid NOT NULL,
    answered boolean NOT NULL DEFAULT false, was_correct boolean, answered_at timestamptz);
  ALTER TABLE public.question_instances ENABLE ROW LEVEL SECURITY;
`;

async function freshDb() {
  const db = new PGlite();
  await db.exec(FIXTURE);
  await db.exec(weeklyTablesAndSeeds());
  await db.exec(MIG(READ_SCOPE));
  await db.exec(fnStatement(WEEKLY, "update_weekly_quest_progress_for_answer"));
  await db.exec(fnStatement(WEEKLY, "claim_weekly_quest_reward"));
  await db.exec(fnStatement(HIDDEN, "set_night_correct"));
  await db.exec(fnStatement(HIDDEN, "update_best_session_streak"));
  // Production's open grants (default ACLs) — read from the catalog 2026-10-31.
  await db.exec(`
    GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION public.set_night_correct(), public.update_best_session_streak(integer),
      public.claim_weekly_quest_reward(uuid, text) TO PUBLIC, anon, authenticated, service_role;
    REVOKE EXECUTE ON FUNCTION public.update_weekly_quest_progress_for_answer(uuid, boolean, integer)
      FROM PUBLIC, anon, authenticated;`);
  return db;
}
async function migrated() {
  const db = await freshDb();
  await db.exec(MIG(FILE));
  return db;
}

const q = (s) => s.split("'").join("''");
async function api(db, claims, sql) {
  try {
    await db.exec(`SET SESSION AUTHORIZATION authenticator;
      SELECT set_config('request.jwt.claims', '${q(JSON.stringify(claims))}', false),
             set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', '', false);
      SET ROLE ${claims.role};`);
    const r = await db.query(sql);
    return { ok: true, rows: r.rows, affected: r.affectedRows };
  } catch (e) {
    return { ok: false, code: e.code, message: e.message };
  } finally {
    await db.exec(`RESET ROLE; SET SESSION AUTHORIZATION postgres;
      SELECT set_config('request.jwt.claims', '', false), set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', '', false);`);
  }
}
const ANON = { role: "anon" };
const AS = (sub) => ({ role: "authenticated", sub, aud: "authenticated" });
const NOSUB = { role: "authenticated", aud: "authenticated" };

const one = async (db, sql) => (await db.query(sql)).rows[0];
const progress = (db, id) => one(db, `SELECT coins, night_correct, best_session_streak FROM public.student_progress WHERE student_id = '${id}'`);
const weekRows = async (db) => (await db.query(`SELECT student_id, quest_id, week_key, progress, completed, claimed
  FROM public.student_weekly_quest_progress ORDER BY 1, 2, 3`)).rows;
const quest = (db, key) => one(db, `SELECT id, target, reward_coins FROM public.weekly_quests WHERE quest_key = '${key}'`);
const WEEK = async (db) => (await one(db, "SELECT to_char(current_date, 'IYYY-IW') AS w")).w;

// answers: [{ ok: boolean, ago: '10 minutes' } | { ok, at: '2026-01-15 01:30:00+00' }] for one pupil.
async function answers(db, id, list) {
  for (const a of list) {
    const at = a.at ? `'${a.at}'::timestamptz` : `now() - interval '${a.ago}'`;
    await db.query(`INSERT INTO public.question_instances (student_id, answered, was_correct, answered_at)
      VALUES ('${id}', true, ${a.ok}, ${at})`);
  }
}

// ── Before: the fixture reproduces the client-writable state ────────────────────────────────────────

test("BEFORE: the fixture reproduces the problem — weekly progress and both flags are client-decided", async () => {
  const db = await freshDb();
  const k = await quest(db, "week_correct_10");
  const w = await WEEK(db);
  const ins = await api(db, AS(P1), `INSERT INTO public.student_weekly_quest_progress
    (student_id, quest_id, week_key, progress, completed, claimed) VALUES ('${P1}', '${k.id}', '${w}', 0, true, false)`);
  assert.equal(ins.ok, true, ins.message);
  assert.equal((await api(db, AS(P1), `SELECT public.claim_weekly_quest_reward('${k.id}', '${w}') AS r`)).rows[0].r, "claimed");
  const upd = await api(db, AS(P1), `UPDATE public.student_weekly_quest_progress SET claimed = false WHERE student_id = '${P1}'`);
  assert.equal(upd.ok, true, upd.message);
  assert.equal(upd.affected, 1);
  assert.equal((await api(db, AS(P1), "SELECT public.update_best_session_streak(999)")).ok, true);
  assert.equal((await api(db, AS(P1), "SELECT public.set_night_correct()")).ok, true);
  assert.deepEqual(await progress(db, P1), { coins: 100 + k.reward_coins, night_correct: true, best_session_streak: 999 });
});

// ── 1. Weekly-quest progress ───────────────────────────────────────────────────────────────────────

test("pupil cannot INSERT, UPDATE or DELETE weekly-quest progress (own or other), and nothing changes", async () => {
  const db = await migrated();
  const k = await quest(db, "week_correct_10");
  const w = await WEEK(db);
  await db.query(`SELECT public.update_weekly_quest_progress_for_answer('${P1}', true, 10)`);
  const before = await weekRows(db);
  for (const [who, sql] of [
    [P1, `INSERT INTO public.student_weekly_quest_progress (student_id, quest_id, week_key, progress, completed, claimed)
          VALUES ('${P1}', '${k.id}', '2026-01', 0, true, false)`],
    [P1, `UPDATE public.student_weekly_quest_progress SET completed = true, claimed = false WHERE student_id = '${P1}'`],
    [P1, `DELETE FROM public.student_weekly_quest_progress WHERE student_id = '${P1}'`],
    [P2, `UPDATE public.student_weekly_quest_progress SET progress = 0 WHERE student_id = '${P1}'`],
  ]) {
    const r = await api(db, AS(who), sql);
    assert.equal(r.ok, false, sql);
    assert.equal(r.code, "42501", r.message);
  }
  for (const sql of [`INSERT INTO public.student_weekly_quest_progress (student_id, quest_id, week_key) VALUES ('${P1}', '${k.id}', '${w}')`,
                     "DELETE FROM public.student_weekly_quest_progress"]) {
    const r = await api(db, ANON, sql);
    assert.equal(r.ok, false);
    assert.equal(r.code, "42501", r.message);
  }
  assert.deepEqual(await weekRows(db), before);
});

test("pupil still SELECTs own weekly progress only; the policy set is exactly the two SELECT policies", async () => {
  const db = await migrated();
  await db.query(`SELECT public.update_weekly_quest_progress_for_answer('${P1}', true, 10)`);
  await db.query(`SELECT public.update_weekly_quest_progress_for_answer('${P2}', true, 10)`);
  const own = await api(db, AS(P1), "SELECT DISTINCT student_id FROM public.student_weekly_quest_progress");
  assert.equal(own.ok, true, own.message);
  assert.deepEqual(own.rows.map((r) => r.student_id), [P1]);
  const pol = (await db.query(`SELECT policyname, cmd FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'student_weekly_quest_progress' ORDER BY 1`)).rows;
  assert.deepEqual(pol, [
    { policyname: "super_admins read all weekly quest progress", cmd: "SELECT" },
    { policyname: "weekly_progress_select_own", cmd: "SELECT" },
  ]);
  for (const role of ["anon", "authenticated"]) {
    for (const priv of ["INSERT", "UPDATE", "DELETE"]) {
      assert.equal((await one(db, `SELECT has_table_privilege('${role}', 'public.student_weekly_quest_progress', '${priv}') AS h`)).h, false, `${role} ${priv}`);
    }
    assert.equal((await one(db, `SELECT has_table_privilege('${role}', 'public.student_weekly_quest_progress', 'SELECT') AS h`)).h, true);
  }
});

test("server path unchanged: answers progress the quest, the pupil claims exactly once, coins once", async () => {
  const db = await migrated();
  const k = await quest(db, "week_correct_10");
  const w = await WEEK(db);
  for (let i = 0; i < k.target; i++) await db.query(`SELECT public.update_weekly_quest_progress_for_answer('${P1}', true, 10)`);
  const row = await one(db, `SELECT progress, completed, claimed FROM public.student_weekly_quest_progress
    WHERE student_id = '${P1}' AND quest_id = '${k.id}'`);
  assert.deepEqual(row, { progress: k.target, completed: true, claimed: false });
  const c1 = await api(db, AS(P1), `SELECT public.claim_weekly_quest_reward('${k.id}', '${w}') AS r`);
  assert.equal(c1.ok, true, c1.message);
  assert.equal(c1.rows[0].r, "claimed");
  const c2 = await api(db, AS(P1), `SELECT public.claim_weekly_quest_reward('${k.id}', '${w}') AS r`);
  assert.equal(c2.rows[0].r, "already_claimed");
  assert.equal((await progress(db, P1)).coins, 100 + k.reward_coins);
  // Another pupil cannot claim P1's row, and an unfinished quest is not paid.
  const k2 = await quest(db, "week_answer_20");
  assert.equal((await api(db, AS(P2), `SELECT public.claim_weekly_quest_reward('${k.id}', '${w}') AS r`)).rows[0].r, "not_found");
  assert.equal((await api(db, AS(P1), `SELECT public.claim_weekly_quest_reward('${k2.id}', '${w}') AS r`)).rows[0].r, "not_completed");
  assert.equal((await progress(db, P2)).coins, 100);
});

// ── 2. update_best_session_streak ─────────────────────────────────────────────────────────────────

test("best_session_streak is counted by the server; p_count is ignored", async () => {
  const db = await migrated();
  await answers(db, P1, [{ ok: true, ago: "30 minutes" }, { ok: true, ago: "20 minutes" }, { ok: true, ago: "10 minutes" }]);
  assert.equal((await api(db, AS(P1), "SELECT public.update_best_session_streak(999)")).ok, true);
  assert.equal((await progress(db, P1)).best_session_streak, 3);
  await answers(db, P1, [{ ok: true, ago: "3 minutes" }, { ok: true, ago: "1 minute" }]);
  await api(db, AS(P1), "SELECT public.update_best_session_streak(0)");
  assert.equal((await progress(db, P1)).best_session_streak, 5);
});

test("the fixture's policies before the migration are exactly production's four", async () => {
  const db = await freshDb();
  const pol = (await db.query(`SELECT policyname, cmd, roles::text AS roles FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'student_weekly_quest_progress' ORDER BY 1`)).rows;
  assert.deepEqual(pol, PROD_POLICIES_BEFORE);
});

test("a wrong answer ends the run, and the best never decreases", async () => {
  const db = await migrated();
  await answers(db, P1, [
    { ok: true, ago: "50 minutes" }, { ok: false, ago: "40 minutes" },                          // run broken here
    { ok: true, ago: "30 minutes" }, { ok: true, ago: "20 minutes" },
  ]);
  await api(db, AS(P1), "SELECT public.update_best_session_streak(50)");
  assert.equal((await progress(db, P1)).best_session_streak, 2);
  await db.query(`UPDATE public.student_progress SET best_session_streak = 7 WHERE student_id = '${P1}'`);
  await api(db, AS(P1), "SELECT public.update_best_session_streak(1)");
  assert.equal((await progress(db, P1)).best_session_streak, 7, "GREATEST keeps the stored best");
  // Unanswered rows are ignored.
  await db.query(`INSERT INTO public.question_instances (student_id, answered) VALUES ('${P1}', false)`);
  await api(db, AS(P1), "SELECT public.update_best_session_streak(1)");
  assert.equal((await progress(db, P1)).best_session_streak, 7);
});

test("session = no pause over 2 hours between answers: a long, steady session is not lost; a long pause ends it", async () => {
  // A slow but continuous session over 7.5 hours (pauses of 1.5 h) keeps its full run of 6 —
  // the client would count 6 as long as the page stayed open.
  const steady = await migrated();
  await answers(steady, P1, ["450", "360", "270", "180", "90", "1"].map((m) => ({ ok: true, ago: `${m} minutes` })));
  await api(steady, AS(P1), "SELECT public.update_best_session_streak(6)");
  assert.equal((await progress(steady, P1)).best_session_streak, 6);
  // A pause of more than 2 hours ends the session: only the 2 answers after it count.
  const paused = await migrated();
  await answers(paused, P1, [
    { ok: true, ago: "5 hours" }, { ok: true, ago: "4 hours" }, { ok: true, ago: "3 hours" },
    { ok: true, ago: "50 minutes" }, { ok: true, ago: "30 minutes" },                           // 2 h 10 min pause before these
  ]);
  await api(paused, AS(P1), "SELECT public.update_best_session_streak(5)");
  assert.equal((await progress(paused, P1)).best_session_streak, 2);
});

test("a page reload inside a session does not lose the run (the server counts answers, not page loads)", async () => {
  // The client counter restarts on reload; 3 answers before and 2 after a reload are one server run.
  const db = await migrated();
  await answers(db, P1, [{ ok: true, ago: "12 minutes" }, { ok: true, ago: "10 minutes" }, { ok: true, ago: "8 minutes" },
                         { ok: true, ago: "3 minutes" }, { ok: true, ago: "1 minute" }]);
  await api(db, AS(P1), "SELECT public.update_best_session_streak(2)");
  assert.equal((await progress(db, P1)).best_session_streak, 5);
});

test("KNOWN LIMIT until question_attempts (D-266): a repeat re-opens the same row, so it counts once", async () => {
  // Pool exhausted → request_repeat_* re-opens the SAME question_instances row and overwrites
  // answered_at. Four distinct questions + a repeat of one of them = 5 client answers, 4 rows.
  const db = await migrated();
  await answers(db, P1, [{ ok: true, ago: "9 minutes" }, { ok: true, ago: "7 minutes" },
                         { ok: true, ago: "5 minutes" }, { ok: true, ago: "3 minutes" }]);
  await db.query(`UPDATE public.question_instances SET answered_at = now() - interval '1 minute', was_correct = true
    WHERE id = (SELECT id FROM public.question_instances WHERE student_id = '${P1}' ORDER BY answered_at LIMIT 1)`);
  await api(db, AS(P1), "SELECT public.update_best_session_streak(5)");
  assert.equal((await progress(db, P1)).best_session_streak, 4, "documented limit; resolved by the append-only log");
});

test("one pupil's answers never count for another pupil", async () => {
  const db = await migrated();
  await answers(db, P2, Array.from({ length: 6 }, (_, i) => ({ ok: true, ago: `${10 + i} minutes` })));
  await api(db, AS(P1), "SELECT public.update_best_session_streak(6)");
  await api(db, AS(P1), "SELECT public.set_night_correct()");
  assert.deepEqual(await progress(db, P1), { coins: 100, night_correct: false, best_session_streak: 0 });
});

// ── 3. set_night_correct ──────────────────────────────────────────────────────────────────────────

test("night_correct needs a correct answer between 00:00 and 03:59 Danish time (winter and summer time)", async () => {
  const cases = [
    { at: "2026-01-14 23:00:00+00", ok: true, night: true },   // 00:00 CET
    { at: "2026-01-15 01:30:00+00", ok: true, night: true },   // 02:30 CET
    { at: "2026-01-15 02:59:59+00", ok: true, night: true },   // 03:59:59 CET
    { at: "2026-01-15 03:00:00+00", ok: true, night: false },  // 04:00 CET
    { at: "2026-01-15 03:30:00+00", ok: true, night: false },  // 04:30 CET
    { at: "2026-07-01 00:30:00+00", ok: true, night: true },   // 02:30 CEST
    { at: "2026-07-01 02:30:00+00", ok: true, night: false },  // 04:30 CEST
    { at: "2026-07-01 12:00:00+00", ok: true, night: false },  // 14:00 CEST
    { at: "2026-01-15 01:30:00+00", ok: false, night: false }, // wrong answer at night
  ];
  for (const c of cases) {
    const db = await migrated();
    await answers(db, P1, [{ ok: c.ok, at: c.at }]);
    const r = await api(db, AS(P1), "SELECT public.set_night_correct()");
    assert.equal(r.ok, true, r.message);
    assert.equal((await progress(db, P1)).night_correct, c.night, JSON.stringify(c));
  }
});

test("without any answer the flag stays false; once set it stays set", async () => {
  const db = await migrated();
  await api(db, AS(P1), "SELECT public.set_night_correct()");
  assert.equal((await progress(db, P1)).night_correct, false);
  await answers(db, P1, [{ ok: true, at: "2026-01-15 01:30:00+00" }]);
  await api(db, AS(P1), "SELECT public.set_night_correct()");
  await api(db, AS(P1), "SELECT public.set_night_correct()");
  assert.equal((await progress(db, P1)).night_correct, true);
});

// ── 4. Grants, definer, search_path, unauthenticated calls ─────────────────────────────────────────

test("anon has no EXECUTE; authenticated without a subject is refused; both change nothing", async () => {
  const db = await migrated();
  await answers(db, P1, [{ ok: true, at: "2026-01-15 01:30:00+00" }]);
  for (const sql of ["SELECT public.set_night_correct()", "SELECT public.update_best_session_streak(5)"]) {
    const a = await api(db, ANON, sql);
    assert.equal(a.ok, false);
    assert.equal(a.code, "42501", a.message);
    const n = await api(db, NOSUB, sql);
    assert.equal(n.ok, false);
    assert.match(n.message, /not_authenticated/);
  }
  assert.deepEqual(await progress(db, P1), { coins: 100, night_correct: false, best_session_streak: 0 });
});

test("both functions: SECURITY DEFINER, pinned search_path, EXECUTE only for authenticated and service_role", async () => {
  const db = await migrated();
  const rows = (await db.query(`SELECT p.proname, p.prosecdef, p.proconfig, p.proacl::text AS acl
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('set_night_correct', 'update_best_session_streak') ORDER BY 1`)).rows;
  assert.equal(rows.length, 2, "one overload each");
  for (const r of rows) {
    assert.equal(r.prosecdef, true, r.proname);
    assert.deepEqual(r.proconfig, ["search_path=public, pg_temp"], r.proname);
    assert.doesNotMatch(r.acl, /(^\{|,)=X\//, `${r.proname}: no PUBLIC EXECUTE`);
    assert.doesNotMatch(r.acl, /anon=/, `${r.proname}: no anon EXECUTE`);
    assert.match(r.acl, /authenticated=X\//);
    assert.match(r.acl, /service_role=X\//);
  }
  // The signatures the client calls are unchanged.
  const sig = (await db.query(`SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS a
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('set_night_correct', 'update_best_session_streak') ORDER BY 1`)).rows;
  assert.deepEqual(sig, [{ proname: "set_night_correct", a: "" }, { proname: "update_best_session_streak", a: "p_count integer" }]);
});

test("the client still calls the same two RPCs with the same arguments (app.js unchanged)", () => {
  const app = read("app.js");
  assert.match(app, /supabase\.rpc\("update_best_session_streak", \{ p_count: bestSessionStreak \}\)/);
  assert.match(app, /supabase\.rpc\("set_night_correct"\)/);
  assert.equal(/student_weekly_quest_progress"\)\s*\.(insert|update|upsert|delete)/.test(read("hub.html")), false,
    "the hub only reads weekly progress");
});

test("idempotent: applying the file twice gives the same catalog state", async () => {
  const db = await migrated();
  const snap = async () => JSON.stringify((await db.query(`
    SELECT (SELECT json_agg(policyname ORDER BY policyname) FROM pg_policies WHERE tablename = 'student_weekly_quest_progress') AS pol,
           (SELECT relacl::text FROM pg_class WHERE oid = 'public.student_weekly_quest_progress'::regclass) AS tacl,
           (SELECT json_agg(md5(pg_get_functiondef(p.oid)) || p.proacl::text ORDER BY p.proname) FROM pg_proc p
              JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname IN ('set_night_correct', 'update_best_session_streak')) AS fns`)).rows[0]);
  const once = await snap();
  await db.exec(MIG(FILE));
  assert.equal(await snap(), once);
});

// ── 5. Rollback ─────────────────────────────────────────────────────────────────────────────────────

test("the rollback's function bodies are byte-identical to production's (md5 of prosrc, catalog 2026-10-31)", async () => {
  const db = await migrated();
  await db.exec(rollbackSql());
  const rows = (await db.query(`SELECT p.proname, md5(p.prosrc) AS m, l.lanname, p.proconfig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_language l ON l.oid = p.prolang
    WHERE n.nspname = 'public' AND p.proname IN ('set_night_correct', 'update_best_session_streak') ORDER BY 1`)).rows;
  for (const r of rows) {
    assert.equal(r.m, PROD_PROSRC_MD5[r.proname], r.proname);
    assert.equal(r.lanname, "sql", r.proname);
    assert.deepEqual(r.proconfig, ["search_path=public"], r.proname);
  }
  const pol = (await db.query(`SELECT policyname, cmd, roles::text AS roles FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'student_weekly_quest_progress' ORDER BY 1`)).rows;
  assert.deepEqual(pol, PROD_POLICIES_BEFORE, "after rollback: production's four policies");
});

test("the documented rollback restores the pre-migration definitions, policies and ACLs exactly", async () => {
  const state = async (db) => (await db.query(`
    SELECT (SELECT json_agg(json_build_object('n', policyname, 'c', cmd, 'q', qual, 'w', with_check) ORDER BY policyname)
              FROM pg_policies WHERE tablename = 'student_weekly_quest_progress') AS pol,
           (SELECT relacl::text FROM pg_class WHERE oid = 'public.student_weekly_quest_progress'::regclass) AS tacl,
           (SELECT json_agg(json_build_object('f', p.proname, 'd', pg_get_functiondef(p.oid), 'acl', p.proacl::text) ORDER BY p.proname)
              FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname IN ('set_night_correct', 'update_best_session_streak')) AS fns`)).rows[0];
  const norm = (s) => JSON.parse(JSON.stringify(s), (k, v) => (k === "acl" || k === "tacl") && typeof v === "string"
    ? v.replace(/^\{|\}$/g, "").split(",").sort().join(",") : v);
  const before = norm(await state(await freshDb()));
  const db = await migrated();
  assert.notDeepEqual(norm(await state(db)), before, "the migration changed something");
  await db.exec(rollbackSql());
  assert.deepEqual(norm(await state(db)), before);
});
