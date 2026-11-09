// RUNTIME proof for migration 20261108171500_course_progress_rewards (Lærligverse, Arkivskabet), in PGlite
// over the FULL isolated replay of the repository (tests/isolated/schema), with the migration applied on top
// exactly as written (it is NOT_IN_PRODUCTION, so the replay itself skips it). Synthetic pupils only.
// The award pays only once the reward RPCs no longer pay course answers (its double-pay guard), so this file also
// loads the H5/K1-track PROPOSAL docs/laerligverse/forslag-k1-belonning-kursussvar.sql (not a migration) into
// its test database; the combination and the guard are proven in course-progress-rewards-k1-proposal-run.test.mjs.
//
// Course answers are given through production's OWN reward RPC (process_question_attempt), so the history the
// award function reads is the one the live answer path writes. Proven:
//   0. Today's legacy path (unchanged here): a first correct course answer pays 10 XP + 5 coins and +1
//      total_correct_answers like any quiz answer — the coordination point in docs/laerligverse/belonningsmodel.md.
//   1. The file: unique version, not replayed, SECURITY INVOKER with search_path '', EXECUTE service_role only,
//      ledger RLS on with one own-rows SELECT policy, no API write privilege.
//   2. A full sequence pays exactly 61 XP + 26 coins (4 steps, 3 passed checks, the sequence) — and nothing else
//      moves: total_correct_answers, correct_answers, level, mastery_*, streak, subject level, band, fold log,
//      quests, achievements, instances, and the teacher functions get_student_overview / get_concept_states.
//   3. Idempotency: a second call pays 0; a retry after a failure mid-way pays exactly once.
//   4. Eligibility is recomputed from data: partial history pays only what it shows; a wrong check answer pays
//      the step, not the check; the sequence needs revision after a wrong latest practice; untagged, wrongly
//      tagged and other-objective instances earn nothing; unknown / non-course / invalid objectives earn nothing;
//      a teacher earns nothing; another pupil's history never counts.
//   5. Concurrency: the pupil's student_progress row is locked before anything is read or inserted, and a
//      milestone already in the ledger (a concurrent winner) is never credited again. The interleaving with
//      real simultaneous sessions is proven in course-progress-rewards-concurrency.test.mjs.
//   6. Milestones: the third completed sequence pays milestone:sequences:3 once.
//   7. RLS/grants: authenticated/anon cannot insert/update/delete the ledger or execute the award function; a
//      pupil reads only their own rows.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { replaySchema } from "../isolated/schema/replay.mjs";
import { NOT_IN_PRODUCTION, planReplay } from "../isolated/schema/replay-plan.mjs";
import { bootstrapMarkerSql } from "../isolated/seed/seed-guard.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const NAME = "20261108171500_course_progress_rewards.sql";
const FILE = `supabase/migrations/${NAME}`;
const AWARD = "public.award_course_milestones(uuid,text)";
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TEACHER = uid(9001);

let db;
let originalPqa;
before(async () => {
  db = new PGlite();
  await db.exec(read("tests/isolated/schema/pglite-platform.sql"));
  await db.exec(bootstrapMarkerSql("0123456789abcdef0123456789abcdef"));
  const r = await replaySchema({ exec: (s) => db.exec(s), query: async (s) => (await db.query(s)).rows });
  assert.deepEqual(r.failures, []);
  originalPqa = (await db.query("SELECT pg_get_functiondef('public.process_question_attempt(uuid,uuid,text,bigint)'::regprocedure) AS d")).rows[0].d;
  await db.exec(read("docs/laerligverse/forslag-k1-belonning-kursussvar.sql"));
  await db.exec(read(FILE));
  await db.exec(`INSERT INTO auth.users (id, email) VALUES ('${TEACHER}', 'laerer@example.test');
                 INSERT INTO public.profiles (id, role) VALUES ('${TEACHER}', 'teacher');`);
});
after(async () => { await db?.close(); });

const q1 = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;

let nextPupil = 100;
async function addPupil() {
  const id = uid(nextPupil++);
  await db.query("INSERT INTO auth.users (id, email) VALUES ($1, $2)", [id, `elev${nextPupil}@example.test`]);
  await db.query("INSERT INTO public.profiles (id, role, selected_grade, teacher_id) VALUES ($1, 'student', 7, $2)", [id, TEACHER]);
  await db.query(`INSERT INTO public.student_progress (student_id, xp, coins, correct_answers, total_correct_answers,
      current_streak, longest_streak, last_activity_date) VALUES ($1, 100, 50, 7, 7, 2, 3, current_date)
    ON CONFLICT (student_id) DO UPDATE SET xp = 100, coins = 50, correct_answers = 7, total_correct_answers = 7,
      current_streak = 2, longest_streak = 3, last_activity_date = current_date`, [id]);
  return id;
}

let qn = 0;
async function question(objective, metadata) {
  qn++;
  const content = { type: "mc", question: `Kursusspørgsmål ${qn}?`, options: [`Rigtig ${qn}`, `Forkert ${qn}`], correct: `Rigtig ${qn}` };
  const id = (await q1(`INSERT INTO public.questions (type, content, difficulty, difficulty_band, is_active, question_type,
      learning_objective, answer_format, answer_type, target_grade, metadata)
    VALUES ('mc_single', $1::jsonb, 2, 2, true, 'auto', $2, 'mc', 'short', 7, $3::jsonb) RETURNING id`,
    [JSON.stringify(content), objective, metadata === undefined ? null : JSON.stringify(metadata)])).id;
  return { id, right: content.correct };
}
const courseQuestion = (objective, step) => question(objective, { learning_step: step, domain: "kildekritik" });

// One round through production's own reward RPC: open instance → process_question_attempt.
async function answer(pupil, q, correct) {
  const inst = (await q1(`INSERT INTO public.question_instances (student_id, question_id, correct_answer,
      difficulty_at_time, mastery_snapshot, answered, repeat_count) VALUES ($1, $2, $3, 1, 1, false, 0) RETURNING id`,
    [pupil, q.id, q.right])).id;
  const r = (await q1("SELECT public.process_question_attempt($1, $2, $3, $4) AS r",
    [pupil, inst, correct ? q.right : "noget forkert", Date.now()])).r;
  assert.equal(r.status, correct ? "correct" : "incorrect");
  return inst;
}
async function step(pupil, objective, stepId, correct = true) {
  return answer(pupil, await courseQuestion(objective, stepId), correct);
}
async function fullSequence(pupil, objective) {
  await step(pupil, objective, "guided_practice", true);
  await step(pupil, objective, "independent_application", true);
  await step(pupil, objective, "transfer", true);
  await step(pupil, objective, "revisit", true);
}

async function award(pupil, objective) {
  await db.exec("SET ROLE service_role");
  try {
    return (await q1("SELECT public.award_course_milestones($1, $2) AS r", [pupil, objective])).r;
  } finally {
    await db.exec("RESET ROLE");
  }
}
async function as(role, sub, sql, params = []) {
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [sub ?? ""]);
  await db.exec(`SET ROLE ${role}`);
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.exec("RESET ROLE");
    await db.query("SELECT set_config('request.jwt.claim.sub', '', false)");
  }
}
const code = async (p) => { try { await p; return null; } catch (e) { return e.code ?? String(e.message); } };
const money = async (p) => q1("SELECT xp, coins FROM public.student_progress WHERE student_id = $1", [p]);
const ledger = async (p) => (await rows(`SELECT milestone_key, kind, learning_step, xp_awarded, coins_awarded
  FROM public.course_progress_rewards WHERE student_id = $1 ORDER BY id`, [p]));
const keys = (r) => r.awarded.map((a) => a.milestone_key);

// Everything the award must NOT move for one pupil (xp and coins are compared separately).
async function untouched(p) {
  const pick = async (sql) => JSON.stringify(await rows(sql, [p]));
  return {
    progress: await pick(`SELECT level, correct_answers, total_correct_answers, mastery_level, mastery_balance, total_attempts,
      mastery_score, current_streak, longest_streak, last_activity_date, night_correct, best_session_streak, prestige_score
      FROM public.student_progress WHERE student_id = $1`),
    subjectLevel: await pick("SELECT * FROM public.student_subject_level WHERE student_id = $1 ORDER BY subject"),
    band: await pick("SELECT * FROM public.student_band_state WHERE student_id = $1"),
    foldLog: await pick("SELECT * FROM public.student_level_fold_log WHERE student_id = $1 ORDER BY question_instance_id"),
    daily: await pick("SELECT quest_id, quest_date, progress FROM public.student_quest_progress WHERE student_id = $1 ORDER BY 1, 2"),
    weekly: await pick("SELECT quest_id, progress FROM public.student_weekly_quest_progress WHERE student_id = $1 ORDER BY 1"),
    achievements: await pick("SELECT achievement_id FROM public.user_achievements WHERE student_id = $1 ORDER BY 1"),
    instances: await pick(`SELECT id, answered, answered_at, was_correct, user_answer, repeat_count
      FROM public.question_instances WHERE student_id = $1 ORDER BY id`),
    // Every overview column except xp, which the award is meant to raise (compared separately).
    overview: JSON.stringify(await as("authenticated", TEACHER, `SELECT email, level, correct_ratio, total_correct_answers, total_attempts
      FROM public.get_student_overview($1)`, [p])),
    concepts: JSON.stringify(await as("authenticated", TEACHER, "SELECT public.get_concept_states($1) AS c", [p])),
  };
}

// ── 0. Today's legacy path ──────────────────────────────────────────────────────────────────────────────

test("0. today (production's body): a first correct course answer pays 10 XP + 5 coins and +1 total_correct_answers", async () => {
  const p = await addPupil();
  const before = await q1("SELECT xp, coins, total_correct_answers FROM public.student_progress WHERE student_id = $1", [p]);
  await db.exec("BEGIN");
  try {
    await db.exec(originalPqa); // production's body, inside a transaction that is rolled back
    await step(p, "lv_today", "guided_practice", true);
    const after = await q1("SELECT xp, coins, total_correct_answers FROM public.student_progress WHERE student_id = $1", [p]);
    assert.deepEqual([after.xp - before.xp, after.coins - before.coins, after.total_correct_answers - before.total_correct_answers], [10, 5, 1]);
  } finally {
    await db.exec("ROLLBACK");
  }
});

// ── 1. The file ─────────────────────────────────────────────────────────────────────────────────────────

test("1. the file: unique version, listed NOT_IN_PRODUCTION and skipped by the replay, D-110 header", () => {
  const files = readdirSync(join(ROOT, "supabase", "migrations")).filter((f) => /^\d{14}_/.test(f));
  assert.equal(files.filter((f) => f.startsWith("20261108171500")).length, 1, "the version is unique");
  assert.ok(NOT_IN_PRODUCTION[NAME], "listed with a reason");
  const { plan } = planReplay([NAME], (f) => read(`supabase/migrations/${f}`));
  assert.equal(plan[0].action, "skip");
  const sql = read(FILE);
  assert.match(sql, /IKKE ANVENDT I PRODUKTION/);
  assert.match(sql, /apply_migration med særskilt ejerautorisation \(D-110\)/);
  // It does not redefine any reward RPC or touch the answer path.
  const code = sql.replace(/--.*$/gm, "");
  assert.doesNotMatch(code, /FUNCTION\s+public\.(process_question_attempt|process_text_answer)|question_attempts|total_correct_answers|repeat_count/);
  // The reward functions are only NAMED in the double-pay guard, which reads md5(prosrc) from the catalog.
  assert.equal((code.match(/process_question_attempt|process_text_answer/g) ?? []).length, 5);
});

test("1. the function: SECURITY INVOKER, search_path '', EXECUTE for service_role only; the ledger: RLS, one own-rows SELECT policy, no API write", async () => {
  const f = await q1(`SELECT p.prosecdef, p.proconfig, p.proacl::text AS acl FROM pg_proc p WHERE p.oid = to_regprocedure($1)`, [AWARD]);
  assert.equal(f.prosecdef, false);
  assert.deepEqual(f.proconfig, ['search_path=""']);
  for (const role of ["anon", "authenticated"]) {
    assert.equal((await q1(`SELECT has_function_privilege($1, $2, 'EXECUTE') AS ok`, [role, AWARD])).ok, false, role);
  }
  assert.equal((await q1(`SELECT has_function_privilege('service_role', $1, 'EXECUTE') AS ok`, [AWARD])).ok, true);
  assert.doesNotMatch(f.acl, /(^|[{,])=X/, "no PUBLIC EXECUTE");
  const t = await q1(`SELECT relrowsecurity FROM pg_class WHERE oid = 'public.course_progress_rewards'::regclass`);
  assert.equal(t.relrowsecurity, true);
  const pol = await rows(`SELECT policyname, cmd, roles::text AS roles FROM pg_policies WHERE tablename = 'course_progress_rewards'`);
  assert.deepEqual(pol, [{ policyname: "course_progress_rewards_select_own", cmd: "SELECT", roles: "{authenticated}" }]);
  for (const role of ["anon", "authenticated", "service_role"]) {
    for (const priv of ["UPDATE", "DELETE", "TRUNCATE"]) {
      assert.equal((await q1(`SELECT has_table_privilege($1, 'public.course_progress_rewards', $2) AS ok`, [role, priv])).ok, false, `${role} ${priv}`);
    }
  }
  for (const [role, ins, sel] of [["anon", false, false], ["authenticated", false, true], ["service_role", true, true]]) {
    assert.equal((await q1(`SELECT has_table_privilege($1, 'public.course_progress_rewards', 'INSERT') AS ok`, [role])).ok, ins, `${role} INSERT`);
    assert.equal((await q1(`SELECT has_table_privilege($1, 'public.course_progress_rewards', 'SELECT') AS ok`, [role])).ok, sel, `${role} SELECT`);
  }
});

// ── 2. A full sequence ──────────────────────────────────────────────────────────────────────────────────

test("2. a full sequence pays exactly 61 XP + 26 coins, and nothing else moves (mastery, level, band, fold log, quests, teacher figures)", async () => {
  const p = await addPupil();
  await fullSequence(p, "lv_full");
  // Seed level/band rows so 'unchanged' is not trivially empty.
  await db.query(`INSERT INTO public.student_subject_level (student_id, subject, level, answered) VALUES ($1, 'historie', 1234, 5)`, [p]);
  await db.query(`INSERT INTO public.student_band_state (student_id, seed, band, correct_run) VALUES ($1, 2, 3, 1)`, [p]);
  const before = await untouched(p);
  const m0 = await money(p);
  const r = await award(p, "lv_full");
  assert.equal(r.outcome, "awarded");
  assert.deepEqual(keys(r), [
    "step:lv_full:guided_practice", "step:lv_full:independent_application", "check:lv_full:independent_application",
    "step:lv_full:transfer", "check:lv_full:transfer", "step:lv_full:revisit", "check:lv_full:revisit", "sequence:lv_full"]);
  assert.deepEqual([r.xp_awarded, r.coins_awarded], [61, 26]);
  const m1 = await money(p);
  assert.deepEqual([m1.xp - m0.xp, m1.coins - m0.coins], [61, 26], "credited exactly what the ledger holds");
  const l = await ledger(p);
  assert.deepEqual([l.reduce((s, x) => s + x.xp_awarded, 0), l.reduce((s, x) => s + x.coins_awarded, 0)], [61, 26]);
  assert.deepEqual(await untouched(p), before);
});

// ── 3. Idempotency and retry ────────────────────────────────────────────────────────────────────────────

test("3. a second call pays 0 and changes nothing", async () => {
  const p = await addPupil();
  await fullSequence(p, "lv_twice");
  await award(p, "lv_twice");
  const m = await money(p);
  const l = await ledger(p);
  const r = await award(p, "lv_twice");
  assert.deepEqual([r.outcome, r.awarded, r.xp_awarded, r.coins_awarded], ["nothing_new", [], 0, 0]);
  assert.deepEqual(await money(p), m);
  assert.deepEqual(await ledger(p), l);
});

test("3. a failure mid-way rolls everything back; the retry pays exactly once", async () => {
  const p = await addPupil();
  await fullSequence(p, "lv_retry");
  const m0 = await money(p);
  // The credit UPDATE fails AFTER the ledger rows were inserted in the same call.
  await db.exec(`CREATE FUNCTION public.zz_fail_credit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'injected failure'; END $$;
    CREATE TRIGGER zz_fail_credit BEFORE UPDATE OF xp ON public.student_progress
      FOR EACH ROW WHEN (NEW.student_id = '${p}'::uuid) EXECUTE FUNCTION public.zz_fail_credit();`);
  try {
    await assert.rejects(award(p, "lv_retry"), /injected failure/);
  } finally {
    await db.exec("DROP TRIGGER zz_fail_credit ON public.student_progress; DROP FUNCTION public.zz_fail_credit();");
  }
  assert.deepEqual(await ledger(p), [], "no ledger row survived the failed call");
  assert.deepEqual(await money(p), m0, "nothing credited");
  const r = await award(p, "lv_retry");
  assert.deepEqual([r.xp_awarded, r.coins_awarded], [61, 26]);
  assert.equal((await award(p, "lv_retry")).xp_awarded, 0);
  const m1 = await money(p);
  assert.deepEqual([m1.xp - m0.xp, m1.coins - m0.coins], [61, 26]);
});

// ── 4. Eligibility from data ────────────────────────────────────────────────────────────────────────────

test("4. partial history pays only what it shows; a wrong check answer pays the step, not the check", async () => {
  const p = await addPupil();
  await step(p, "lv_part", "guided_practice", true);
  let r = await award(p, "lv_part");
  assert.deepEqual(keys(r), ["step:lv_part:guided_practice"]);
  assert.deepEqual([r.xp_awarded, r.coins_awarded], [3, 1]);
  await step(p, "lv_part", "independent_application", false);
  r = await award(p, "lv_part");
  assert.deepEqual(keys(r), ["step:lv_part:independent_application"], "answered but wrong: no check");
  await step(p, "lv_part", "transfer", true);
  r = await award(p, "lv_part");
  assert.deepEqual(keys(r), ["step:lv_part:transfer", "check:lv_part:transfer"]);
  assert.equal((await ledger(p)).some((x) => x.kind === "sequence_completed"), false, "no sequence without the revisit");
});

test("4. after a wrong latest practice the sequence needs the revision; revision itself pays nothing", async () => {
  const p = await addPupil();
  await step(p, "lv_rev", "guided_practice", false);
  await step(p, "lv_rev", "independent_application", true);
  await step(p, "lv_rev", "transfer", true);
  await step(p, "lv_rev", "revisit", true);
  let r = await award(p, "lv_rev");
  assert.equal(keys(r).includes("sequence:lv_rev"), false, "no sequence: revision is due");
  await step(p, "lv_rev", "revision", true);
  r = await award(p, "lv_rev");
  assert.deepEqual(keys(r), ["sequence:lv_rev"], "the revision completes the sequence and pays no step reward of its own");
  assert.deepEqual([r.xp_awarded, r.coins_awarded], [25, 10]);
});

test("4. untagged, wrongly tagged and other-objective instances earn nothing; another pupil's history never counts", async () => {
  const p = await addPupil();
  await courseQuestion("lv_forged", "guided_practice"); // the objective IS a course objective
  await answer(p, await question("lv_forged", { domain: "kildekritik" }), true);                 // untagged
  await answer(p, await question("lv_forged", { learning_step: "bogus_step" }), true);           // unknown step
  await answer(p, await question("lv_forged", { learning_step: ["transfer"] }), true);           // not a string
  await answer(p, await question("lv_forged", null), true);                                       // metadata NULL
  await step(p, "lv_other_objective", "transfer", true);                                          // another objective
  const other = await addPupil();
  await fullSequence(other, "lv_forged");                                                         // another pupil
  const m = await money(p);
  const r = await award(p, "lv_forged");
  assert.deepEqual([r.outcome, r.awarded, r.xp_awarded], ["nothing_new", [], 0]);
  assert.deepEqual(await money(p), m);
  assert.deepEqual(await ledger(p), []);
});

test("4. unknown, non-course and invalid objectives earn nothing; a teacher earns nothing; nothing is written", async () => {
  const p = await addPupil();
  await answer(p, await question("lv_ordinary_quiz", { domain: "historie" }), true); // ordinary quiz objective
  const m = await money(p);
  assert.equal((await award(p, "lv_ordinary_quiz")).outcome, "not_a_course_objective");
  assert.equal((await award(p, "lv_does_not_exist")).outcome, "not_a_course_objective");
  for (const bad of ["", "   ", "x".repeat(201), null]) {
    const r = await award(p, bad);
    assert.deepEqual([r.outcome, r.reason, r.xp_awarded], ["invalid_request", "invalid_objective", 0], JSON.stringify(bad));
  }
  assert.equal((await award(null, "lv_full")).reason, "missing_student");
  assert.equal((await award(TEACHER, "lv_full")).outcome, "not_a_student");
  assert.equal((await award(uid(777777), "lv_full")).outcome, "not_a_student", "unknown id");
  assert.deepEqual(await money(p), m);
  assert.deepEqual(await ledger(p), []);
  assert.deepEqual(await ledger(TEACHER), []);
});

// ── 5. Concurrency ──────────────────────────────────────────────────────────────────────────────────────

test("5. the pupil's progress row is locked FOR UPDATE before any history read or insert", async () => {
  const src = (await q1(`SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure($1)`, [AWARD])).prosrc;
  const lock = src.indexOf("FROM public.student_progress sp WHERE sp.student_id = p_student_id FOR UPDATE");
  assert.ok(lock > 0, "the lock statement is present");
  assert.ok(lock < src.indexOf("FROM public.question_instances"), "before the history read");
  assert.ok(lock < src.indexOf("INSERT INTO public.course_progress_rewards"), "before the first insert");
  assert.equal(src.split("ON CONFLICT (student_id, milestone_key) DO NOTHING").length - 1, 2, "every insert is ON CONFLICT DO NOTHING");
});

test("5. a milestone a concurrent call already inserted is never credited again (credit only for inserted rows)", async () => {
  const p = await addPupil();
  await fullSequence(p, "lv_race");
  // The winner of a race committed these two rows (and its own credit) first.
  await db.query(`INSERT INTO public.course_progress_rewards (student_id, milestone_key, kind, learning_objective, learning_step,
      xp_awarded, coins_awarded, policy, rates_version) VALUES
      ($1, 'sequence:lv_race', 'sequence_completed', 'lv_race', NULL, 25, 10, 'laerligverse-test-policy-v0', 'course-rewards-v0-proposal'),
      ($1, 'check:lv_race:transfer', 'check_passed', 'lv_race', 'transfer', 8, 4, 'laerligverse-test-policy-v0', 'course-rewards-v0-proposal')`, [p]);
  const m0 = await money(p);
  const r = await award(p, "lv_race");
  assert.equal(keys(r).includes("sequence:lv_race") || keys(r).includes("check:lv_race:transfer"), false);
  assert.deepEqual([r.xp_awarded, r.coins_awarded], [61 - 25 - 8, 26 - 10 - 4]);
  const m1 = await money(p);
  assert.deepEqual([m1.xp - m0.xp, m1.coins - m0.coins], [28, 12]);
  assert.equal((await ledger(p)).length, 8, "each milestone exactly once");
});

// ── 6. Milestones ───────────────────────────────────────────────────────────────────────────────────────

test("6. the third completed sequence pays milestone:sequences:3 once (30 XP + 15 coins)", async () => {
  const p = await addPupil();
  for (const o of ["lv_m1", "lv_m2"]) { await fullSequence(p, o); await award(p, o); }
  assert.equal((await ledger(p)).some((x) => x.kind === "course_milestone"), false);
  await fullSequence(p, "lv_m3");
  const r = await award(p, "lv_m3");
  assert.ok(keys(r).includes("milestone:sequences:3"));
  assert.deepEqual([r.xp_awarded, r.coins_awarded], [61 + 30, 26 + 15]);
  assert.equal((await award(p, "lv_m1")).xp_awarded, 0, "no second milestone payout from another objective");
  assert.equal((await ledger(p)).filter((x) => x.milestone_key === "milestone:sequences:3").length, 1);
});

// ── 7. RLS and grants at runtime ────────────────────────────────────────────────────────────────────────

test("7. pupils read only their own rows and cannot write the ledger or call the award; anon gets nothing", async () => {
  const a = await addPupil();
  const b = await addPupil();
  await fullSequence(a, "lv_rls");
  await fullSequence(b, "lv_rls");
  await award(a, "lv_rls");
  await award(b, "lv_rls");
  const seen = await as("authenticated", a, "SELECT DISTINCT student_id FROM public.course_progress_rewards");
  assert.deepEqual(seen.map((r) => r.student_id), [a], "only own rows");
  assert.equal(await code(as("authenticated", a, `INSERT INTO public.course_progress_rewards (student_id, milestone_key, kind,
      xp_awarded, coins_awarded, policy, rates_version) VALUES ($1, 'forged', 'course_milestone', 1000, 1000, 'x', 'x')`, [a])), "42501");
  assert.equal(await code(as("authenticated", a, "UPDATE public.course_progress_rewards SET xp_awarded = 999 WHERE student_id = $1", [a])), "42501");
  assert.equal(await code(as("authenticated", a, "DELETE FROM public.course_progress_rewards WHERE student_id = $1", [a])), "42501");
  assert.equal(await code(as("authenticated", a, "SELECT public.award_course_milestones($1, 'lv_rls')", [a])), "42501");
  assert.equal(await code(as("anon", null, "SELECT public.award_course_milestones($1, 'lv_rls')", [a])), "42501");
  assert.equal(await code(as("anon", null, "SELECT count(*) FROM public.course_progress_rewards")), "42501");
});
