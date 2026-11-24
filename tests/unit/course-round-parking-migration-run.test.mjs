// RUNTIME proof for D-384 (F8), migration 20261124120000_course_round_parking.sql, executed UNMODIFIED on PGlite — on two
// databases:
//   A. PRODUCTION's answer chain (helpers/answer-chain-schema.mjs pins every md5) + D-280 part 1 + D-316 + D-383: the
//      privileges production has today (anon/authenticated with table-level UPDATE on question_instances);
//   B. the FULL replay of the isolated introduction lane (K1 → L3/L5 → K9 → introductions → D-383 → its follow-up →
//      D-384): every trigger on question_instances that exists anywhere in the repository (K1 snapshot, L5 served mode,
//      K9 presented_at, H5's round guard, the D-316/D-383 bodies), with L5's column-level UPDATE.
// Every id is synthetic. PGlite is ONE connection: the indexes, the CHECK and the trigger hold for every interleaving and
// are proven here; the locks and truly simultaneous requests are proven on real PostgreSQL 17 in
// course-round-parking-concurrency.test.mjs.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { answerChainSql, extractFunction, readMigration } from "./helpers/answer-chain-schema.mjs";
import { NOT_IN_PRODUCTION, TEST_PROFILES } from "../isolated/schema/replay-plan.mjs";
import { replaySchema } from "../isolated/schema/replay.mjs";
import { bootstrapMarkerSql } from "../isolated/seed/seed-guard.mjs";
import { historyFromRows, nextStep } from "../../supabase/functions/_shared/learning-sequence.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILE = "20261124120000_course_round_parking.sql";
const D383 = "20261120150000_course_items_out_of_ordinary_quiz.sql";
const D383_FOLLOW_UP = "20261123100000_course_scope_before_candidate_limit.sql";
const MIGRATION = readMigration(FILE);
const FNS = {
  rqs: "public.request_repeat_question_for_student(uuid,smallint,text[])",
  rqss: "public.request_repeat_question_servable_for_student(uuid,smallint,text[])",
  rql: "public.request_repeat_level_question_for_student(uuid,text[])",
  release: "public.release_open_question_outside(text[])",
};
const BEFORE = { rqs: "c14b90ccd4d05e12473083b072eaefba", rqss: "b23d72a1d167a94246e5b7243c25cdbd", rql: "410d0ab6fb67c329a573cf3f73973921", release: "e52e69fa3374a5838293977f0057b34d" };
const AFTER = { rqs: "f21252b7f5ba341697613beb3ad2302f", rqss: "e69545d93975d3da5b5de0c29e9b522a", rql: "881b68b8cc997205d83dc5532e152bf9", release: "72f2a0f3579b2ce758031ce7f47724e3" };
const HISTORY = "kildekritik_ophav";
const MATH = "brøker_kursus";
const lit = (v) => `'${JSON.stringify(v).replace(/'/g, "''")}'`;
const code = async (fn) => { try { await fn(); return null; } catch (e) { return e.code ?? String(e.message); } };
const message = async (fn) => { try { await fn(); return null; } catch (e) { return String(e.message); } };

// ── A. production's chain ─────────────────────────────────────────────────────────────────────────────────────────
async function productionDb({ parking = true, d383 = true } = {}) {
  const db = new PGlite();
  for (const sql of answerChainSql()) await db.exec(sql);
  for (const f of ["20261031194600_mc_length_cue_answer_paths.sql", "20261102100000_release_open_rounds_on_inactive_questions.sql"]) await db.exec(readMigration(f));
  if (d383) await db.exec(readMigration(D383));
  if (parking) await db.exec(MIGRATION);
  return db;
}
async function asA(db, role, sql, params = [], uid = "") {
  await db.exec(`SET test.uid = '${uid}'; SET ROLE ${role}`);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("RESET ROLE; RESET test.uid"); }
}
async function pupilA(db) {
  const id = randomUUID();
  await db.exec(`INSERT INTO auth.users VALUES ('${id}'); INSERT INTO public.profiles (id, role, selected_grade) VALUES ('${id}', 'student', 6);
    INSERT INTO public.student_progress (student_id) VALUES ('${id}');`);
  return id;
}
async function questionA(db, { objective, step = null, active = true }) {
  const id = randomUUID();
  await db.exec(`INSERT INTO public.questions (id, type, content, metadata, difficulty, is_active, question_type, learning_objective,
      answer_format, answer_type, target_grade, difficulty_band, difficulty_level)
    VALUES ('${id}', 'mc_single', ${lit({ question: "Q " + id, options: ["a", "b"], correct: "a" })}::jsonb, ${lit(step ? { learning_step: step } : {})}::jsonb, 1, ${active},
      'auto', '${objective}', 'mc', 'short', 5, 1, 1000);`);
  return id;
}
// The server's insert (get-next-question's admin client), as every Edge Function version makes it.
const serve = async (db, p, q) => (await db.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, next_review_at)
  VALUES ($1, $2, 'a', now()) RETURNING id`, [p, q])).rows[0].id;
const park = async (db, p) => (await asA(db, "service_role", "SELECT public.park_open_course_round($1) AS r", [p]))[0].r;
const resume = async (db, p, obj, step) => (await asA(db, "service_role", "SELECT public.resume_parked_course_round($1, $2, $3) AS r", [p, obj, step]))[0].r;
const answerA = (db, p, i, a = "a") => asA(db, "service_role", "SELECT public.process_question_attempt($1, $2, $3, 0) AS r", [p, i, a]);
const inst = async (db, id) => (await db.query(`SELECT answered, repeat_count, user_answer, parked_at IS NOT NULL AS parked, parked_objective,
  next_review_at = 'infinity' AS asleep FROM public.question_instances WHERE id = $1`, [id])).rows[0];
const xp = async (db, p) => (await db.query("SELECT coalesce((SELECT xp FROM public.student_progress WHERE student_id = $1), 0)::int AS xp", [p])).rows[0].xp;
// The due read EVERY get-next-question version makes (index.ts step 1): answered = false AND next_review_at <= now().
const dueRead = async (db, p) => (await db.query(`SELECT id FROM public.question_instances WHERE student_id = $1 AND answered = false
  AND next_review_at <= now() ORDER BY next_review_at`, [p])).rows.map((r) => r.id);
const md5 = async (db, sig) => (await db.query("SELECT md5(prosrc) h FROM pg_proc WHERE oid = to_regprocedure($1)", [sig])).rows[0]?.h ?? null;

test("bookkeeping: NOT_IN_PRODUCTION, replayed only in the introduction lane, after D-383 and its follow-up", () => {
  assert.match(NOT_IN_PRODUCTION[FILE], /not applied in production/);
  assert.ok(TEST_PROFILES.introduction[FILE]);
  assert.ok(FILE > D383 && FILE > D383_FOLLOW_UP);
  assert.equal(Object.keys(TEST_PROFILES.introduction).at(-1), FILE, "the last decision of the lane");
});

test("guard: D-383 first; its bodies before, this file's after (a re-run); anything else refused with no change", async () => {
  const without = await productionDb({ parking: false, d383: false });
  assert.match(String(await message(() => without.exec(MIGRATION))), /COURSE_PARKING/);
  assert.equal((await without.query("SELECT count(*)::int c FROM pg_attribute WHERE attrelid = 'public.question_instances'::regclass AND attname = 'parked_at'")).rows[0].c, 0, "nothing changed");
  const db = await productionDb({ parking: false });
  for (const k of Object.keys(FNS)) assert.equal(await md5(db, FNS[k]), BEFORE[k], `${k}: D-383's body`);
  await db.exec(MIGRATION);
  for (const k of Object.keys(FNS)) assert.equal(await md5(db, FNS[k]), AFTER[k], `${k}: this file's body`);
  await db.exec(MIGRATION); // a re-run is allowed and changes nothing
  for (const k of Object.keys(FNS)) assert.equal(await md5(db, FNS[k]), AFTER[k]);
  const changed = await productionDb({ parking: false });
  await changed.exec(`CREATE OR REPLACE FUNCTION public.request_repeat_level_question_for_student(p_student_id uuid, p_domains text[]) RETURNS uuid
    LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$ SELECT NULL::uuid $$;`);
  assert.match(String(await message(() => changed.exec(MIGRATION))), /COURSE_PARKING: public\.request_repeat_level/);
});

test("bodies: D-383's four bodies plus ONLY the marked lines; the indexes and constraints are exactly the model", async () => {
  const strip = (s) => s.split("\n").filter((l) => !/parked_at|parked_objective/.test(l)).join("\n").replace(/answered_at = now\(\),\n/g, "answered_at = now()\n");
  const db = await productionDb({ parking: false });
  const before = {};
  for (const k of Object.keys(FNS)) before[k] = (await db.query("SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure($1)", [FNS[k]])).rows[0].prosrc;
  await db.exec(MIGRATION);
  for (const k of Object.keys(FNS)) {
    const after = (await db.query("SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure($1)", [FNS[k]])).rows[0].prosrc;
    assert.equal(strip(after), before[k], `${k}: nothing else changed`);
  }
  const idx = Object.fromEntries((await db.query(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'question_instances'
    AND indexname IN ('idx_one_open_question', 'idx_one_parked_course_round')`)).rows.map((r) => [r.indexname, r.indexdef]));
  assert.match(idx.idx_one_open_question, /UNIQUE INDEX .* \(student_id\) WHERE \(\(answered = false\) AND \(parked_at IS NULL\)\)/);
  assert.match(idx.idx_one_parked_course_round, /UNIQUE INDEX .* \(student_id, parked_objective\) WHERE \(parked_at IS NOT NULL\)/);
  const fns = (await db.query(`SELECT p.proname, p.prosecdef, p.proconfig FROM pg_proc p WHERE p.proname IN ('park_open_course_round', 'resume_parked_course_round') ORDER BY 1`)).rows;
  assert.deepEqual(fns.map((f) => [f.proname, f.prosecdef, f.proconfig]), [
    ["park_open_course_round", true, ["search_path=public, pg_temp"]],
    ["resume_parked_course_round", true, ["search_path=public, pg_temp"]],
  ]);
});

test("control: WITHOUT D-384 an open course round blocks every other task (idx_one_open_question)", async () => {
  const db = await productionDb({ parking: false });
  const p = await pupilA(db);
  await serve(db, p, await questionA(db, { objective: HISTORY, step: "guided_practice" }));
  assert.equal(await code(async () => serve(db, p, await questionA(db, { objective: "vikings" }))), "23505");
});

test("park: the SAME row stays open (same id, no answer, repeat_count unchanged), it sleeps, and the ordinary quiz serves", async () => {
  const db = await productionDb();
  const p = await pupilA(db);
  const c = await serve(db, p, await questionA(db, { objective: HISTORY, step: "guided_practice" }));
  assert.deepEqual(await dueRead(db, p), [c]);
  assert.equal(await park(db, p), c);
  assert.deepEqual(await inst(db, c), { answered: false, repeat_count: 0, user_answer: null, parked: true, parked_objective: HISTORY, asleep: true });
  assert.deepEqual(await dueRead(db, p), [], "no version of get-next-question sees it as due");
  const o = await serve(db, p, await questionA(db, { objective: "vikings" }));
  assert.ok(o, "an ordinary task is served while the course round is parked");
  assert.equal(await code(async () => serve(db, p, await questionA(db, { objective: "vikings" }))), "23505", "still at most ONE active open task");
});

test("only an active COURSE round is parked: nothing open, an ordinary round, an inactive course round → NULL, nothing changes", async () => {
  const db = await productionDb();
  const p = await pupilA(db);
  assert.equal(await park(db, p), null);
  const o = await serve(db, p, await questionA(db, { objective: "vikings" }));
  assert.equal(await park(db, p), null);
  assert.equal((await inst(db, o)).parked, false);
  const p2 = await pupilA(db);
  const cq = await questionA(db, { objective: HISTORY, step: "guided_practice" });
  const c = await serve(db, p2, cq);
  await db.exec(`UPDATE public.questions SET is_active = false WHERE id = '${cq}'`);
  assert.equal(await park(db, p2), null, "an inactive round is D-316's to release, not to park");
  assert.equal((await inst(db, c)).parked, false);
});

test("an answer to a PARKED round is refused (LQ409) whatever path writes it: no XP, nothing recorded; the CHECK is the floor", async () => {
  const db = await productionDb();
  const p = await pupilA(db);
  const c = await serve(db, p, await questionA(db, { objective: HISTORY, step: "guided_practice" }));
  await park(db, p);
  const before = await xp(db, p);
  assert.equal(await code(() => answerA(db, p, c)), "LQ409");
  assert.equal(await code(() => db.exec(`UPDATE public.question_instances SET answered = true, user_answer = 'a' WHERE id = '${c}'`)), "LQ409", "a direct write too");
  await db.exec("ALTER TABLE public.question_instances DISABLE TRIGGER question_instances_parked_guard");
  assert.equal(await code(() => db.exec(`UPDATE public.question_instances SET answered = true WHERE id = '${c}'`)), "23514", "the CHECK holds without the trigger");
  await db.exec("ALTER TABLE public.question_instances ENABLE TRIGGER question_instances_parked_guard");
  assert.equal(await code(() => db.exec(`UPDATE public.question_instances SET parked_objective = NULL WHERE id = '${c}'`)), "23514", "parked_at and parked_objective go together");
  assert.deepEqual(await inst(db, c), { answered: false, repeat_count: 0, user_answer: null, parked: true, parked_objective: HISTORY, asleep: true });
  assert.equal(await xp(db, p), before);
});

test("resume: none / wrong_step / other_active change nothing; resumed = the same instance, due again, answered once, paid once", async () => {
  const db = await productionDb();
  const p = await pupilA(db);
  const c = await serve(db, p, await questionA(db, { objective: HISTORY, step: "guided_practice" }));
  await park(db, p);
  assert.equal(await resume(db, p, "andet_kursus", "guided_practice"), "none");
  assert.equal(await resume(db, p, HISTORY, "transfer"), "wrong_step", "D-338: resumed only in the server's step");
  const o = await serve(db, p, await questionA(db, { objective: "vikings" }));
  assert.equal(await resume(db, p, HISTORY, "guided_practice"), "other_active", "an active ordinary task is never overrun");
  assert.equal((await inst(db, c)).parked, true);
  await answerA(db, p, o);
  const before = await xp(db, p);
  assert.equal(await resume(db, p, HISTORY, "guided_practice"), "resumed");
  assert.deepEqual(await inst(db, c), { answered: false, repeat_count: 0, user_answer: null, parked: false, parked_objective: null, asleep: false });
  assert.deepEqual(await dueRead(db, p), [c], "served as due again by get-next-question");
  assert.ok((await answerA(db, p, c))[0].r, "answered");
  const after = await xp(db, p);
  assert.ok(after > before, "the course answer is rewarded once");
  await code(() => answerA(db, p, c));
  assert.equal(await xp(db, p), after, "a second answer to the same round pays nothing");
});

test("D2 several courses: history → maths → ordinary → back to history → back to maths; nothing lost, nothing completed", async () => {
  const db = await productionDb();
  const p = await pupilA(db);
  const h = await serve(db, p, await questionA(db, { objective: HISTORY, step: "guided_practice" }));
  // The pupil opens the maths course (sequence): the active history round is parked by the switch itself.
  assert.equal(await resume(db, p, MATH, "guided_practice"), "none");
  assert.deepEqual(await inst(db, h), { answered: false, repeat_count: 0, user_answer: null, parked: true, parked_objective: HISTORY, asleep: true });
  const m = await serve(db, p, await questionA(db, { objective: MATH, step: "guided_practice" }));
  // Ordinary quiz: the maths round is parked as well — two parked rounds, one per course.
  assert.equal(await park(db, p), m);
  const o = await serve(db, p, await questionA(db, { objective: "vikings" }));
  await answerA(db, p, o);
  // Back to history: its round, the same id; maths stays parked.
  assert.equal(await resume(db, p, HISTORY, "guided_practice"), "resumed");
  assert.equal((await inst(db, h)).parked, false);
  assert.equal((await inst(db, m)).parked, true);
  // Straight to maths without answering history: history is parked again (the switch), maths resumed.
  assert.equal(await resume(db, p, MATH, "guided_practice"), "resumed");
  assert.deepEqual([(await inst(db, h)).parked, (await inst(db, m)).parked], [true, false]);
  const rows = (await db.query(`SELECT qi.answered, qi.was_correct, qi.answered_at, json_build_object('learning_objective', q.learning_objective,
    'metadata', q.metadata) AS questions FROM public.question_instances qi JOIN public.questions q ON q.id = qi.question_id
    WHERE qi.student_id = $1 AND q.learning_objective = $2`, [p, HISTORY])).rows;
  assert.equal(nextStep(historyFromRows(rows), Date.now()).step, nextStep([], Date.now()).step, "a parked round moves the sequence nowhere");
  assert.equal((await db.query("SELECT count(*)::int c FROM public.question_instances WHERE student_id = $1 AND answered = false", [p])).rows[0].c, 2,
    "both course rounds still open: nothing completed, nothing deleted");
});

test("at most one parked round per pupil AND course: a second one is refused (23505), nothing changes", async () => {
  const db = await productionDb();
  const p = await pupilA(db);
  const a = await serve(db, p, await questionA(db, { objective: HISTORY, step: "guided_practice" }));
  await park(db, p);
  // Only a function from before D-384 can serve a second round of the same course (it never sees the parked one).
  const b = await serve(db, p, await questionA(db, { objective: HISTORY, step: "guided_practice" }));
  assert.equal(await code(() => park(db, p)), "23505");
  assert.deepEqual([(await inst(db, a)).parked, (await inst(db, b)).parked], [true, false]);
  // The switch to another course leaves it active (no error), and says other_active for the course it opens.
  assert.equal(await resume(db, p, MATH, "guided_practice"), "none");
  assert.equal((await inst(db, b)).parked, false);
});

test("D-316 release: an active parked course round is never touched; an inactive one is released and loses the parking", async () => {
  const db = await productionDb();
  const p = await pupilA(db);
  const cq = await questionA(db, { objective: HISTORY, step: "guided_practice" });
  const c = await serve(db, p, cq);
  await park(db, p);
  assert.equal((await asA(db, "authenticated", "SELECT public.release_open_question_outside($1) AS n", [["matematik"]], p))[0].n, 0);
  assert.equal((await inst(db, c)).parked, true);
  await db.exec(`UPDATE public.questions SET is_active = false WHERE id = '${cq}'`);
  assert.equal((await asA(db, "authenticated", "SELECT public.release_open_question_outside($1) AS n", [["matematik"]], p))[0].n, 1);
  assert.equal((await db.query("SELECT count(*)::int c FROM public.question_instances WHERE id = $1", [c])).rows[0].c, 0, "round 1, no answer: deleted as D-316 does");
  // A reopened (repeat_count > 0) inactive parked round is CLOSED, and the close clears the parking in the same statement.
  const p2 = await pupilA(db);
  const cq2 = await questionA(db, { objective: HISTORY, step: "guided_practice" });
  const c2 = await serve(db, p2, cq2);
  await db.exec(`UPDATE public.question_instances SET repeat_count = 1 WHERE id = '${c2}'`);
  await park(db, p2);
  await db.exec(`UPDATE public.questions SET is_active = false WHERE id = '${cq2}'`);
  assert.equal((await asA(db, "authenticated", "SELECT public.release_open_question_outside($1) AS n", [["matematik"]], p2))[0].n, 1);
  assert.deepEqual(await inst(db, c2), { answered: true, repeat_count: 1, user_answer: null, parked: false, parked_objective: null, asleep: true });
});

test("repeats: a parked course round no longer blocks the ordinary quiz's repeats (D-383 blocked them for good)", async () => {
  for (const parking of [false, true]) {
    const db = await productionDb({ parking });
    const p = await pupilA(db);
    const o = await serve(db, p, await questionA(db, { objective: "vikings" }));
    await answerA(db, p, o, "b");
    await db.exec(`UPDATE public.question_instances SET answered_at = now() - interval '2 days' WHERE id = '${o}'`);
    await serve(db, p, await questionA(db, { objective: HISTORY, step: "guided_practice" }));
    if (parking) await park(db, p);
    const rep = (await asA(db, "service_role", "SELECT public.request_repeat_question_for_student($1, 6::smallint, $2) AS id", [p, ["vikings"]]))[0].id;
    assert.equal(rep, parking ? o : null, parking ? "with D-384: the wrong answer is reopened" : "control: the open course round blocks");
  }
});

test("access (production's privileges): no EXECUTE for pupils; parked_at is not theirs to write, even with table UPDATE before", async () => {
  const before = await productionDb({ parking: false });
  assert.equal((await before.query(`SELECT has_table_privilege('authenticated', 'public.question_instances', 'UPDATE') u`)).rows[0].u, true,
    "control: production grants table-level UPDATE today");
  const db = await productionDb();
  const p = await pupilA(db);
  const c = await serve(db, p, await questionA(db, { objective: HISTORY, step: "guided_practice" }));
  for (const role of ["anon", "authenticated"]) {
    assert.equal(await code(() => asA(db, role, "SELECT public.park_open_course_round($1)", [p], p)), "42501", role);
    assert.equal(await code(() => asA(db, role, "SELECT public.resume_parked_course_round($1, 'x', 'y')", [p], p)), "42501", role);
    for (const col of ["parked_at", "parked_objective", "activation_no"]) {
      assert.equal((await db.query(`SELECT has_column_privilege($1, 'public.question_instances', $2, 'UPDATE') u`, [role, col])).rows[0].u, false, `${role}.${col}`);
    }
    assert.equal(await code(() => asA(db, role, `UPDATE public.question_instances SET parked_at = now(), parked_objective = 'x' WHERE id = '${c}'`, [], p)), "42501",
      `${role}: a direct PostgREST UPDATE of the parking is refused by privilege, not only by RLS`);
    assert.equal(await code(() => asA(db, role, `UPDATE public.question_instances SET activation_no = 7 WHERE id = '${c}'`, [], p)), "42501",
      `${role}: the pupil cannot set the activation the stale-tab check compares against`);
  }
  // Every other column keeps exactly the UPDATE it had (the pupil's effective rights are unchanged; RLS still has no policy).
  const cols = (await db.query(`SELECT attname FROM pg_attribute WHERE attrelid = 'public.question_instances'::regclass AND attnum > 0 AND NOT attisdropped
    AND attname NOT IN ('parked_at', 'parked_objective', 'activation_no') ORDER BY attnum`)).rows.map((r) => r.attname);
  for (const col of cols) assert.equal((await db.query(`SELECT has_column_privilege('authenticated', 'public.question_instances', $1, 'UPDATE') u`, [col])).rows[0].u, true, col);
  assert.equal((await db.query(`SELECT has_table_privilege('service_role', 'public.question_instances', 'UPDATE') u`)).rows[0].u, true);
});

test("a function from BEFORE D-384 (#739's candidate, production's a7450b0f) on a database with parked rounds: never blocked", async () => {
  // Their reads and writes are exactly: the due read (answered = false AND next_review_at <= now()), the insert of a new
  // round, D-383's release and repeats (database functions — D-384's bodies once this file is applied).
  const db = await productionDb();
  const p = await pupilA(db);
  const c = await serve(db, p, await questionA(db, { objective: HISTORY, step: "guided_practice" }));
  await park(db, p);
  assert.deepEqual(await dueRead(db, p), [], "the old due loop does not see the parked round (no course_round_open)");
  const o = await serve(db, p, await questionA(db, { objective: "vikings" }));
  assert.deepEqual(await dueRead(db, p), [o], "the old function serves the ordinary round");
  assert.equal(await code(() => answerA(db, p, c)), "LQ409", "a stale tab's answer to the parked round is still refused");
  assert.ok((await answerA(db, p, o))[0].r, "the ordinary answer is recorded");
  assert.equal((await inst(db, c)).parked, true, "the course round waits, unchanged, for a D-384 function");
});

// ── B. the full introduction-lane replay (K1, L3/L5, K9, introductions, D-383, its follow-up, D-384) ────────────────
let lane;
before(async () => {
  lane = new PGlite();
  await lane.exec(readFileSync(join(ROOT, "tests", "isolated", "schema", "pglite-platform.sql"), "utf8"));
  await lane.exec(bootstrapMarkerSql("0123456789abcdef0123456789abcdef"));
  const replay = await replaySchema({ exec: (s) => lane.exec(s), query: async (s) => (await lane.query(s)).rows, profile: "introduction" });
  assert.deepEqual(replay.failures, [], "the introduction profile replays D-384 without a failure");
});
async function asB(role, sql, params = [], sub = null) {
  await lane.exec(`SET ROLE ${role}`);
  if (sub) await lane.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [sub]);
  try { return (await lane.query(sql, params)).rows; } finally {
    await lane.exec("RESET ROLE");
    await lane.exec(`SELECT set_config('request.jwt.claim.sub', '', false)`);
  }
}
async function pupilB() {
  const id = randomUUID();
  await lane.query(`INSERT INTO auth.users (id) VALUES ($1)`, [id]);
  await lane.query(`INSERT INTO public.profiles (id, role, selected_grade) VALUES ($1, 'student', 7)`, [id]);
  await lane.query(`INSERT INTO public.student_progress (student_id, xp, coins) VALUES ($1, 100, 50) ON CONFLICT (student_id) DO UPDATE SET xp = 100, coins = 50`, [id]);
  return id;
}
async function questionB(objective, step) {
  return (await lane.query(`INSERT INTO public.questions (type, content, difficulty, is_active, question_type, learning_objective,
      answer_format, answer_type, metadata, target_grade) VALUES ('mc', $1::jsonb, 1, true, 'auto', $2, 'mc', 'short', $3::jsonb, 7) RETURNING id`,
  [JSON.stringify({ question: `Kursus ${randomUUID()}`, options: ["a", "b"], correct: "a" }), objective, JSON.stringify(step ? { learning_step: step } : {})])).rows[0].id;
}
const snapshotB = async (id) => (await lane.query(`SELECT served_snapshot, served_content_sha256, served_at, served_mode, presented_at, repeat_count,
  answered FROM public.question_instances WHERE id = $1`, [id])).rows[0];

test("lane: K1's snapshot, L5's served mode and K9's presented_at survive park and resume unchanged; the answer (H5 _v2) is refused while parked", async () => {
  const p = await pupilB();
  const q = await questionB(HISTORY, "guided_practice");
  const proposal = (await lane.query(`SELECT jsonb_build_object('content', content, 'metadata', metadata, 'answer_format', answer_format,
    'answer_type', answer_type, 'correct_answer', 'a') s FROM public.questions WHERE id = $1`, [q])).rows[0].s;
  const c = (await lane.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, difficulty_at_time, mastery_snapshot,
    next_review_at, served_mode, served_snapshot) VALUES ($1, $2, 'a', 1, 1, now(), 'practice', $3) RETURNING id`, [p, q, proposal])).rows[0].id;
  assert.equal((await asB("service_role", "SELECT public.mark_presented($1, $2, 1) AS r", [p, c]))[0].r.outcome, "recorded");
  const served = await snapshotB(c);
  assert.ok(served.served_snapshot && served.presented_at && served.served_mode === "practice");
  assert.equal((await asB("service_role", "SELECT public.park_open_course_round($1) AS r", [p]))[0].r, c);
  assert.deepEqual(await snapshotB(c), served, "parking changes nothing the round was served with");
  const attempt = (sub) => asB("service_role", "SELECT public.process_question_attempt_with_context($1, $2, 'a', 1, $3, NULL, NULL) AS r", [p, c, sub]);
  assert.equal(await code(() => attempt(randomUUID())), "LQ409", "L5's wrapper → _v2: refused, nothing recorded");
  assert.equal((await lane.query("SELECT count(*)::int c FROM public.question_attempts WHERE question_instance_id = $1", [c])).rows[0].c, 0, "no attempt");
  assert.equal((await asB("service_role", "SELECT public.resume_parked_course_round($1, $2, 'guided_practice') AS r", [p, HISTORY]))[0].r, "resumed");
  assert.deepEqual(await snapshotB(c), served, "resuming changes nothing either: the same round, the same delivered version");
  const r = (await attempt(randomUUID()))[0].r;
  assert.equal(r.outcome, "recorded");
  assert.equal(r.round_no, 1, "round 1: parking is not a new round (H5's round_no is unchanged)");
});

test("lane: pupils hold no privilege on the parking columns (L5's column grants never cover a new column)", async () => {
  for (const role of ["anon", "authenticated"]) {
    assert.equal((await lane.query(`SELECT has_table_privilege($1, 'public.question_instances', 'UPDATE') u`, [role])).rows[0].u, false);
    for (const col of ["parked_at", "parked_objective"]) {
      for (const priv of ["SELECT", "INSERT", "UPDATE"]) {
        assert.equal((await lane.query(`SELECT has_column_privilege($1, 'public.question_instances', $2, $3) u`, [role, col, priv])).rows[0].u, false, `${role} ${priv} ${col}`);
      }
    }
  }
  const p = await pupilB();
  assert.equal(await code(() => asB("authenticated", `UPDATE public.question_instances SET parked_at = now() WHERE student_id = '${p}'`, [], p)), "42501");
});
