// Lærligverse (F10-B2): an answer to a course item (questions.metadata has 'learning_step', D-338) never
// moves the pupil's ordinary level (advance_student_level) or band (advance_student_band), and never enters
// the teacher's ordinary mastery figures (get_teacher_visibility, get_student_overview, get_concept_states)
// — owner decision 6 (2026-11-07). The reward path (XP, coins, streak, total_correct_answers) is untouched.
//
// Runs migration 20261107090000_course_items_never_move_level.sql UNMODIFIED on PGlite over the FULL
// isolated replay of the repository (tests/isolated/schema), on top of #623's
// 20261105115000_true_false_mastery_exclusion.sql (the migration's required predecessor).
//
// Databases (built, used and closed ONE AT A TIME — each PGlite is a whole PostgreSQL in WASM):
//   BASE  replay + #623, ordinary answers only                         — the reference figures
//   CTRL  replay + #623, ordinary answers + course answers, NO fix      — negative control: course answers
//         DO move the history level and the band today, so the comparison below is not vacuous
//   FIX   replay + #623 + this migration (+ a re-run), same answers as CTRL — must equal BASE exactly
//   BARE  replay only (production today, #623 NOT applied)              — the guard stops this migration
// Proven:
//   1. GUARD: needs #623's bodies; a re-run is accepted; without #623 it stops before anything changes.
//      Signature, result, SECURITY, volatility, search_path, owner and ACL are unchanged.
//   2. THE ONLY CHANGE is one predicate per function (the bodies are #623's otherwise).
//   3. LEVEL: correct AND wrong first answers to course items, plus repeats, leave the history level, the
//      English level and the fold log exactly as with ordinary answers alone; no course instance is logged.
//   4. BAND: the band fold is likewise unchanged by course answers.
//   5. ORDINARY QUIZ: ordinary history answers still fold exactly as before (BASE = #623's behaviour), and
//      a question with metadata NULL is still ordinary (coalesce).
//   6. INACTIVE and ORDERED: the file is in NOT_IN_PRODUCTION and sorts after #623's migration.
// HONEST LIMITS: PGlite is PostgreSQL 18.x (production 17.6) and runs as superuser, so RLS and EXECUTE
// grants are not exercised (CREATE OR REPLACE keeps them; test 1 compares the ACL). The fold reads
// question_instances, which both answer paths (legacy process_question_attempt and H5 _v2) mark answered;
// this test writes those rows directly and does not run either answer RPC.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { replaySchema } from "../isolated/schema/replay.mjs";
import { NOT_IN_PRODUCTION } from "../isolated/schema/replay-plan.mjs";
import { bootstrapMarkerSql } from "../isolated/seed/seed-guard.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const FILE = "20261107090000_course_items_never_move_level.sql";
const PREDECESSOR = "20261105115000_true_false_mastery_exclusion.sql";
const MIGRATION = read(`supabase/migrations/${FILE}`);
const PREDECESSOR_SQL = read(`supabase/migrations/${PREDECESSOR}`);
const PLATFORM = read("tests/isolated/schema/pglite-platform.sql");

const GUARD = [...MIGRATION.matchAll(/\('(public\.[a-z_]+\([^)]*\))', '([0-9a-f]{32})', '([0-9a-f]{32})'\)/g)]
  .map((m) => ({ sig: m[1], before: m[2], after: m[3] }));
const PRED_GUARD = [...PREDECESSOR_SQL.matchAll(/\('(public\.[a-z_]+\([^)]*\))', '([0-9a-f]{32})', '([0-9a-f]{32})'\)/g)]
  .map((m) => ({ sig: m[1], before: m[2], after: m[3] }));

async function replayDb() {
  const db = new PGlite();
  await db.exec(PLATFORM);
  await db.exec(bootstrapMarkerSql("0123456789abcdef0123456789abcdef"));
  const r = await replaySchema({ exec: (s) => db.exec(s), query: async (s) => (await db.query(s)).rows });
  assert.deepEqual(r.failures, [], "the isolated replay builds");
  return db;
}
const rows = async (db, sql, params = []) => (await db.query(sql, params)).rows;
const one = async (db, sql, params = []) => (await rows(db, sql, params))[0];
const md5Of = async (db, sig) => (await one(db, "SELECT md5(prosrc) AS v FROM pg_proc WHERE oid = to_regprocedure($1)", [sig])).v;
const srcOf = async (db, sig) => (await one(db, "SELECT prosrc AS v FROM pg_proc WHERE oid = to_regprocedure($1)", [sig])).v;
const attrs = async (db, sig) => one(db, `SELECT prosecdef, provolatile, proconfig, proacl::text AS acl, proowner,
  pg_get_function_result(oid) AS result, pg_get_function_identity_arguments(oid) AS args
  FROM pg_proc WHERE oid = to_regprocedure($1)`, [sig]);

// ── Fixture ────────────────────────────────────────────────────────────────────────────────────────
const TEACHER = "00000000-0000-4000-8000-0000000000a1";
const PUPIL = "00000000-0000-4000-8000-0000000000b1";
// Ordinary history (MC) and English answers: the pupil's real quiz history.
const HISTORY = [true, true, false, true, true, true, false, true, true, true];
const ENGLISH = [true, false, true, true];
// Course answers (the Arkivskab sequence): mostly CORRECT first answers — without the fix they would push
// the history level up — plus wrong ones and repeats.
const COURSE = [
  { step: "guided_practice", correct: false }, { step: "revision", correct: true },
  { step: "independent_application", correct: true }, { step: "transfer", correct: true },
  { step: "delayed_revisit", correct: true }, { step: "guided_practice", correct: true },
  { step: "revision", correct: true }, { step: "transfer", correct: true },
];

async function seed(db, { withCourse }) {
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ('${TEACHER}', 'laerer@example.test'), ('${PUPIL}', 'elev@example.test');
    INSERT INTO public.profiles (id, role) VALUES ('${TEACHER}', 'teacher');
    INSERT INTO public.profiles (id, role, teacher_id, selected_grade) VALUES ('${PUPIL}', 'student', '${TEACHER}', 8);
  `);
  let qn = 0, t = 0;
  const addQuestion = async (objective, meta, band = 2) => {
    qn++;
    const content = { question: `Spørgsmål ${qn}`, options: ["A", "B", "C", "D"], correct: "A", type: "mc" };
    return (await one(db, `INSERT INTO public.questions (type, content, difficulty, difficulty_band, is_active, question_type,
        learning_objective, answer_format, answer_type, metadata, target_grade)
      VALUES ('mc', $1::jsonb, $2::int, $2::int::smallint, true, 'auto', $3, 'mc', 'short', $4::jsonb, 8) RETURNING id`,
      [JSON.stringify(content), band, objective, meta === null ? null : JSON.stringify(meta)])).id;
  };
  const addAnswer = async (questionId, correct, repeat = 0) => {
    t++;
    const at = new Date(Date.UTC(2026, 10, 1, 8, 0, t)).toISOString();
    await db.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, difficulty_at_time,
        mastery_snapshot, answered, was_correct, answered_at, created_at, repeat_count)
      VALUES ($1, $2, 'A', 1, 1, true, $3, $4, $4, $5)`, [PUPIL, questionId, correct, at, repeat]);
  };
  const course = withCourse ? [...COURSE] : [];
  for (const [i, c] of HISTORY.entries()) {
    // One ordinary question has metadata NULL (production has exactly one): it must stay ordinary.
    await addAnswer(await addQuestion("world_war_2", i === 0 ? null : { concepts: ["grundloven"] }, 1 + (i % 3)), c);
    if (course.length > 0) {
      const k = course.shift();
      const q = await addQuestion("test_kildekritik_ophav", { learning_step: k.step, concepts: ["kildekritik"] });
      await addAnswer(q, k.correct);
      // A repeated course item (one instance per pupil and question; a repeat is an instance with
      // repeat_count > 0): outside the level fold anyway, but the band fold reads repeats too.
      if (i % 3 === 0) {
        await addAnswer(await addQuestion("test_kildekritik_ophav", { learning_step: "revision", concepts: ["kildekritik"] }), true, 1);
      }
    }
  }
  for (const c of ENGLISH) await addAnswer(await addQuestion("english", { concepts: ["grammar"] }), c);
}

async function figures(db) {
  const history = await one(db, "SELECT level, answered, newly_folded FROM public.advance_student_level($1, 'historie', 8::smallint)", [PUPIL]);
  const english = await one(db, "SELECT level, answered, newly_folded FROM public.advance_student_level($1, 'engelsk', 8::smallint)", [PUPIL]);
  const band = await one(db, "SELECT band, folded FROM public.advance_student_band($1, 8::smallint)", [PUPIL]);
  const foldedCourse = (await one(db, `SELECT count(*)::int AS n FROM public.student_level_fold_log f
    JOIN public.question_instances qi ON qi.id = f.question_instance_id
    JOIN public.questions q ON q.id = qi.question_id WHERE q.metadata ? 'learning_step'`)).n;
  const logged = (await one(db, "SELECT count(*)::int AS n FROM public.student_level_fold_log")).n;
  const courseAnswers = (await one(db, `SELECT count(*)::int AS n FROM public.question_instances qi
    JOIN public.questions q ON q.id = qi.question_id WHERE q.metadata ? 'learning_step'`)).n;
  // The teacher's ordinary mastery figures (as #623's test reads them): class view, pupil overview
  // (numerator AND denominator), concept states.
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [TEACHER]);
  const visibility = await rows(db, "SELECT current_band, total_attempts, recent_correct_pct, trend FROM public.get_teacher_visibility($1)", [TEACHER]);
  const overview = await rows(db, "SELECT correct_ratio::text, total_attempts FROM public.get_student_overview($1)", [PUPIL]);
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [PUPIL]);
  const concepts = (await one(db, "SELECT public.get_concept_states($1) AS v", [PUPIL])).v;
  return { history, english, band, foldedCourse, logged, courseAnswers, visibility, overview, concepts };
}

// The reward path (XP, coins, streak, total_correct_answers) and placement: never touched by this
// migration — their bodies are compared before/after.
const REWARD_AND_PLACEMENT = ["process_question_attempt", "process_question_attempt_v2", "process_text_answer",
  "process_text_answer_v2", "start_placement", "submit_placement", "evaluate_achievements", "claim_daily_reward"];
const bodiesOf = async (db, names) => Object.fromEntries((await rows(db, `SELECT proname || '(' || pg_get_function_identity_arguments(oid) || ')' AS k,
  md5(prosrc) AS v FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = ANY($1) ORDER BY 1`, [names])).map((r) => [r.k, r.v]));

const R = {};
before(async () => {
  // BARE — production today (#623 not applied): the guard must stop this migration, changing nothing.
  const BARE = await replayDb();
  R.bareBefore = {};
  for (const g of GUARD) R.bareBefore[g.sig] = await md5Of(BARE, g.sig);
  R.bareError = await BARE.exec(MIGRATION).then(() => null, (e) => e.message);
  R.bareAfter = {};
  for (const g of GUARD) R.bareAfter[g.sig] = await md5Of(BARE, g.sig);
  await BARE.close();

  // BASE — #623, ordinary answers only.
  const BASE = await replayDb();
  await BASE.exec(PREDECESSOR_SQL);
  await seed(BASE, { withCourse: false });
  R.base = await figures(BASE);
  await BASE.close();

  // CTRL — #623, ordinary + course answers, NO fix.
  const CTRL = await replayDb();
  await CTRL.exec(PREDECESSOR_SQL);
  R.predSrc = {};
  for (const g of GUARD) R.predSrc[g.sig] = await srcOf(CTRL, g.sig);
  await seed(CTRL, { withCourse: true });
  R.ctrl = await figures(CTRL);
  await CTRL.close();

  // FIX — #623 + this migration + a re-run, same answers as CTRL.
  const FIX = await replayDb();
  await FIX.exec(PREDECESSOR_SQL);
  R.attrsBefore = {}; R.predMd5 = {};
  for (const g of GUARD) { R.attrsBefore[g.sig] = await attrs(FIX, g.sig); R.predMd5[g.sig] = await md5Of(FIX, g.sig); }
  R.rewardBefore = await bodiesOf(FIX, REWARD_AND_PLACEMENT);
  await FIX.exec(MIGRATION);
  R.rewardAfter = await bodiesOf(FIX, REWARD_AND_PLACEMENT);
  R.afterMd5 = {}; R.attrsAfter = {}; R.src = {};
  for (const g of GUARD) {
    R.afterMd5[g.sig] = await md5Of(FIX, g.sig);
    R.attrsAfter[g.sig] = await attrs(FIX, g.sig);
    R.src[g.sig] = await srcOf(FIX, g.sig);
  }
  await FIX.exec(MIGRATION);
  R.rerunMd5 = {};
  for (const g of GUARD) R.rerunMd5[g.sig] = await md5Of(FIX, g.sig);
  await seed(FIX, { withCourse: true });
  R.fix = await figures(FIX);
  R.fixAgain = await figures(FIX); // idempotent: a second call folds nothing new
  await FIX.close();
});

// ── 1. Guard and attributes ─────────────────────────────────────────────────────────────────────────
test("guard: exactly #623's five targets, each requiring #623's post-migration body", () => {
  assert.deepEqual(GUARD.map((g) => g.sig).sort(), PRED_GUARD.map((g) => g.sig).sort());
  assert.equal(GUARD.length, 5);
  for (const g of GUARD) {
    const pred = PRED_GUARD.find((p) => p.sig === g.sig);
    assert.ok(pred, `${g.sig} is one of #623's targets`);
    assert.equal(g.before, pred.after, `${g.sig}: "before" = #623's "after"`);
    assert.equal(R.predMd5[g.sig], g.before, `${g.sig}: #623 really produces that body`);
  }
});

test("guard: without #623 (production today) the migration stops before anything changes", () => {
  assert.match(R.bareError ?? "", /ureviewet krop/);
  assert.deepEqual(R.bareAfter, R.bareBefore);
});

test("apply: new bodies as reviewed; signature, result, security, volatility, config, owner, ACL unchanged; re-run accepted", () => {
  for (const g of GUARD) {
    assert.equal(R.afterMd5[g.sig], g.after, g.sig);
    assert.deepEqual(R.attrsAfter[g.sig], R.attrsBefore[g.sig], `${g.sig}: attributes unchanged`);
    assert.equal(R.rerunMd5[g.sig], g.after, `${g.sig}: re-run accepted`);
  }
});

// ── 2. The only change ──────────────────────────────────────────────────────────────────────────────
test("the only change to each body is the course-item predicate", () => {
  for (const g of GUARD) {
    const added = R.src[g.sig].split("\n").filter((l) => !R.predSrc[g.sig].split("\n").includes(l));
    const removed = R.predSrc[g.sig].split("\n").filter((l) => !R.src[g.sig].split("\n").includes(l));
    assert.deepEqual(removed, [], `${g.sig}: nothing removed`);
    assert.ok(added.length >= 1 && added.length <= 3, `${g.sig}: one predicate added (${added.length} lines)`);
    assert.ok(added.some((l) => l.includes("coalesce(q.metadata, '{}'::jsonb) ? 'learning_step'")), `${g.sig}: the marker`);
  }
});

// ── 3–5. Behaviour ──────────────────────────────────────────────────────────────────────────────────
test("negative control: WITHOUT the fix, course answers move the history level and the band (the gap is real)", () => {
  assert.ok(R.ctrl.courseAnswers > COURSE.length, "course first answers and repeats exist");
  assert.ok(R.ctrl.foldedCourse > 0, "course answers reach the fold log");
  assert.notDeepEqual(R.ctrl.history, R.base.history, "history level differs");
  assert.notDeepEqual(R.ctrl.band, R.base.band, "band differs");
});

test("with the fix: course answers (correct, wrong, repeats) leave the history level exactly as ordinary answers alone", () => {
  assert.equal(R.fix.courseAnswers, R.ctrl.courseAnswers, "same course answers as the control");
  assert.deepEqual(R.fix.history, R.base.history);
  assert.equal(R.fix.foldedCourse, 0, "no course instance is in the fold log");
  assert.equal(R.fix.logged, R.base.logged, "fold log: exactly the ordinary first answers");
});

test("with the fix: the band fold is unchanged by course answers", () => {
  assert.deepEqual(R.fix.band, R.base.band);
});

test("ordinary quiz: history (incl. a question with metadata NULL) and English fold as before; a second call folds nothing new", () => {
  assert.equal(R.base.history.newly_folded, HISTORY.length, "every ordinary first answer folded, the metadata-NULL one included");
  assert.equal(R.fix.history.newly_folded, HISTORY.length);
  assert.deepEqual(R.fix.english, R.base.english);
  assert.equal(R.fix.english.newly_folded, ENGLISH.length);
  assert.equal(R.fixAgain.history.newly_folded, 0);
  assert.equal(R.fixAgain.history.level, R.fix.history.level);
});

test("teacher figures, negative control: WITHOUT the fix, course answers enter the class view, pupil overview and concept states", () => {
  assert.notDeepEqual(R.ctrl.visibility, R.base.visibility, "class view differs");
  assert.notDeepEqual(R.ctrl.overview, R.base.overview, "pupil overview differs");
  assert.ok(Object.hasOwn(R.ctrl.concepts ?? {}, "kildekritik"), "the course concept appears");
});

test("teacher figures with the fix: class view, pupil overview (numerator AND denominator) and concept states equal ordinary answers alone", () => {
  assert.deepEqual(R.fix.visibility, R.base.visibility);
  assert.deepEqual(R.fix.overview, R.base.overview);
  assert.deepEqual(R.fix.concepts, R.base.concepts);
  assert.ok(!Object.hasOwn(R.fix.concepts ?? {}, "kildekritik"));
});

test("reward path and placement are untouched: XP, coins, streak, total_correct_answers, achievements, placement bodies identical", () => {
  assert.ok(Object.keys(R.rewardBefore).length >= 6, `found ${Object.keys(R.rewardBefore).join(", ")}`);
  assert.deepEqual(R.rewardAfter, R.rewardBefore);
  // The migration (re)defines exactly the five guarded functions and nothing else: no other CREATE,
  // ALTER, UPDATE, INSERT, DELETE, GRANT or REVOKE.
  const sql = MIGRATION.replace(/^--.*$/gm, "");
  const created = [...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z_]+)\(/g)].map((m) => m[1]).sort();
  assert.deepEqual(created, GUARD.map((g) => g.sig.replace(/^public\.|\(.*$/g, "")).sort());
  assert.ok(!/\b(ALTER|GRANT|REVOKE|TRUNCATE|DROP)\b/.test(sql), "no ALTER/GRANT/REVOKE/TRUNCATE/DROP");
  assert.ok(!/^\s*(INSERT|UPDATE|DELETE)\b/m.test(sql.replace(/\$function\$[\s\S]*?\$function\$/g, "")), "no data change outside the function bodies");
});

// ── 6. Inactive and ordered ─────────────────────────────────────────────────────────────────────────
test("inactive and ordered: in NOT_IN_PRODUCTION, after #623's migration", () => {
  assert.ok(NOT_IN_PRODUCTION[FILE], "listed as not applied");
  assert.ok(NOT_IN_PRODUCTION[PREDECESSOR], "its predecessor is not applied either");
  const files = readdirSync(join(ROOT, "supabase/migrations")).filter((f) => /^\d{14}_/.test(f)).sort();
  assert.ok(files.indexOf(PREDECESSOR) >= 0 && files.indexOf(FILE) > files.indexOf(PREDECESSOR), "sorts after #623");
  assert.equal(files.filter((f) => f.startsWith(FILE.slice(0, 14))).length, 1, "the version number is unique");
});
