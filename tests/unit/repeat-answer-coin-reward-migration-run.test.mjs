// RUNTIME proof for migration 20261026120000_repeat_answer_coin_reward (D-211). The SQL file is
// executed UNMODIFIED against a real PostgreSQL (PGlite, in-process WebAssembly — no Docker, no
// network), on top of the process_question_attempt body that 20261018143726 left live, and the
// tests assert what the function DOES: a correct repeat now earns 1 coin + 2 XP, everything else
// is unchanged.
//
// HONEST LIMITS:
//   - PGlite is PostgreSQL 18.x; production is 17.6.
//   - questions, question_instances and student_progress are minimal stand-ins with only the
//     columns the function reads or writes. Streak and quest helpers are stubs that log calls.
//   - Passing here is not permission to deploy. Applying the migration needs its own owner
//     authorisation (D-110).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => readFileSync(join(ROOT, "supabase", "migrations", f), "utf8");
const MIGRATION = read("20261026120000_repeat_answer_coin_reward.sql");

// The live predecessor: the CREATE OR REPLACE inside 20261018143726's EXECUTE $grading$ block.
const PREVIOUS = (() => {
  const s = read("20261018143726_fix_danish_question_bank_text.sql");
  const a = s.indexOf("CREATE OR REPLACE FUNCTION public.process_question_attempt");
  const b = s.indexOf("$function$", s.indexOf("AS $function$", a) + "AS $function$".length);
  assert.ok(a > 0 && b > a, "predecessor function not found");
  return s.slice(a, b + "$function$".length) + ";";
})();

const PUPIL = "00000000-0000-4000-8000-000000000001";
const Q = "00000000-0000-4000-8000-0000000000a1";
const QI = "00000000-0000-4000-8000-0000000000b1";

const FIXTURE = `
  CREATE ROLE service_role;
  CREATE TABLE public.questions (
    id uuid PRIMARY KEY, answer_format text, content jsonb, metadata jsonb);
  CREATE TABLE public.question_instances (
    id uuid PRIMARY KEY, student_id uuid, question_id uuid, answered boolean NOT NULL DEFAULT false,
    answered_at timestamptz, user_answer text, was_correct boolean, correct_answer text,
    repeat_count integer NOT NULL DEFAULT 0);
  CREATE TABLE public.student_progress (
    student_id uuid PRIMARY KEY, xp integer, coins integer,
    correct_answers integer, total_correct_answers integer);
  CREATE TABLE public.calls (fn text);
  CREATE FUNCTION public.update_streak(uuid) RETURNS void LANGUAGE sql
    AS $$ INSERT INTO public.calls VALUES ('streak') $$;
  CREATE FUNCTION public.update_quest_progress_for_answer(uuid, boolean, integer) RETURNS void
    LANGUAGE sql AS $$ INSERT INTO public.calls VALUES ('quest') $$;
  CREATE FUNCTION public.update_weekly_quest_progress_for_answer(uuid, boolean, integer) RETURNS void
    LANGUAGE sql AS $$ INSERT INTO public.calls VALUES ('weekly') $$;
  INSERT INTO public.questions VALUES ('${Q}', 'mc', '{"correct":"Paris"}', '{}');
  INSERT INTO public.student_progress VALUES ('${PUPIL}', 100, 50, 7, 7);
`;

async function fresh() {
  const db = new PGlite();
  await db.exec(FIXTURE);
  await db.exec(PREVIOUS);
  await db.exec(`
    REVOKE EXECUTE ON FUNCTION public.process_question_attempt(uuid,uuid,text,bigint) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.process_question_attempt(uuid,uuid,text,bigint) TO service_role;`);
  return db;
}

async function migrated() {
  const db = await fresh();
  await db.exec(MIGRATION);
  return db;
}

async function answer(db, { repeatCount, answer }) {
  await db.query("DELETE FROM public.question_instances");
  await db.query("DELETE FROM public.calls");
  await db.query(
    "INSERT INTO public.question_instances (id, student_id, question_id, correct_answer, repeat_count) VALUES ($1,$2,$3,'Paris',$4)",
    [QI, PUPIL, Q, repeatCount]);
  const before = (await db.query("SELECT * FROM public.student_progress")).rows[0];
  const res = await db.query("SELECT public.process_question_attempt($1,$2,$3,0)::text AS r", [PUPIL, QI, answer]);
  const after = (await db.query("SELECT * FROM public.student_progress")).rows[0];
  const calls = (await db.query("SELECT fn FROM public.calls ORDER BY fn")).rows.map((r) => r.fn);
  return {
    result: JSON.parse(res.rows[0].r),
    xp: after.xp - before.xp,
    coins: after.coins - before.coins,
    correct: after.correct_answers - before.correct_answers,
    totalCorrect: after.total_correct_answers - before.total_correct_answers,
    calls,
  };
}

test("the guard accepts the live predecessor body (md5 9da7bf2e…)", async () => {
  const db = await fresh();
  const h = (await db.query(
    "SELECT md5(prosrc) AS h FROM pg_proc WHERE oid = 'public.process_question_attempt(uuid,uuid,text,bigint)'::regprocedure")).rows[0].h;
  assert.equal(h, "9da7bf2e59c2296f0e78164b85908431");
  assert.match(MIGRATION, /IS DISTINCT FROM '9da7bf2e59c2296f0e78164b85908431'/);
});

test("a correct repeat earns 1 coin + 2 XP and nothing else", async () => {
  const r = await answer(await migrated(), { repeatCount: 1, answer: "Paris" });
  assert.equal(r.result.status, "correct");
  assert.deepEqual({ xp: r.xp, coins: r.coins, correct: r.correct, totalCorrect: r.totalCorrect },
    { xp: 2, coins: 1, correct: 0, totalCorrect: 0 });
  assert.deepEqual(r.calls, ["streak"], "repeats must not advance coin-paying quests");
});

test("before the migration a correct repeat earned 0 coins (the behaviour being changed)", async () => {
  const r = await answer(await fresh(), { repeatCount: 1, answer: "Paris" });
  assert.deepEqual({ xp: r.xp, coins: r.coins }, { xp: 2, coins: 0 });
});

test("a first correct answer is unchanged: 10 XP, 5 coins, counters, quests", async () => {
  const r = await answer(await migrated(), { repeatCount: 0, answer: "Paris" });
  assert.deepEqual({ xp: r.xp, coins: r.coins, correct: r.correct, totalCorrect: r.totalCorrect },
    { xp: 10, coins: 5, correct: 1, totalCorrect: 1 });
  assert.deepEqual(r.calls, ["quest", "streak", "weekly"]);
});

test("a wrong repeat earns nothing", async () => {
  const r = await answer(await migrated(), { repeatCount: 2, answer: "Rom" });
  assert.equal(r.result.status, "incorrect");
  assert.deepEqual({ xp: r.xp, coins: r.coins }, { xp: 0, coins: 0 });
});

test("an already answered repeat cannot be scored twice", async () => {
  const db = await migrated();
  await answer(db, { repeatCount: 1, answer: "Paris" });
  const before = (await db.query("SELECT coins FROM public.student_progress")).rows[0].coins;
  await db.query("SELECT public.process_question_attempt($1,$2,'Paris',0)", [PUPIL, QI]);
  const after = (await db.query("SELECT coins FROM public.student_progress")).rows[0].coins;
  assert.equal(after, before);
});

test("EXECUTE grants survive the replace: not PUBLIC, still service_role", async () => {
  const db = await migrated();
  const acl = (await db.query(
    "SELECT proacl::text AS a FROM pg_proc WHERE oid = 'public.process_question_attempt(uuid,uuid,text,bigint)'::regprocedure")).rows[0].a;
  assert.match(acl, /service_role=X/);
  assert.doesNotMatch(acl, /(^|[{,])=X/, "PUBLIC must not regain EXECUTE");
});

test("the migration refuses to run over a function that has drifted", async () => {
  const db = await fresh();
  await db.exec(PREVIOUS.replace("v_xp    := 10;", "v_xp    := 11;"));
  await assert.rejects(db.exec(MIGRATION), /er ændret siden 20261018143726/);
});
