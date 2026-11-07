// F-02 Sandt/falsk is a comprehension check, never mastery evidence (owner principle 2026-11-05).
// Runs migration 20261105115000_true_false_mastery_exclusion.sql UNMODIFIED on PGlite over the FULL
// isolated replay of the repository (tests/isolated/schema), whose five target functions are byte-identical
// to production's (md5 checked below against the values the migration's guard holds, which were read from
// production's catalog on 2026-11-05).
//
// Three databases:
//   A  production today (replay only)
//   C  replay + the true_false activation migration, WITHOUT the exclusion — the negative control: shows
//      that without this migration a guessed true_false answer moves level, band and teacher figures
//   B  replay + the exclusion + the activation (the required order)
// Proven:
//   1. GUARD: the five live bodies are the reviewed ones; a re-run is accepted; an unreviewed body stops
//      the migration before anything changes. Signature, result, SECURITY, volatility, search_path, owner
//      and ACL are unchanged.
//   2. EVERY MASTERY PATH: with the same history plus interleaved true_false answers, B gives exactly A's
//      level fold (advance_student_level), band fold (advance_student_band), class view
//      (get_teacher_visibility), pupil overview (get_student_overview) and concept states
//      (get_concept_states); C differs on each, so the comparison is not vacuous. Repeat answers stay
//      outside the folds exactly as before. No true_false instance reaches the fold log.
//   3. PLACEMENT picks multiple choice only, so true_false can never enter it (unchanged).
//   4. ONE RULE: the formats excluded in SQL are exactly MASTERY_EXCLUDED_ANSWER_FORMATS (guessFloor ≥ 0.5)
//      and the browser's COMPREHENSION_CHECK_FORMATS; the browser keeps true_false out of the session
//      wave and the persisted difficulty band, and the teacher's domain view shows it apart.
//   5. INACTIVE and ORDERED: the file is in NOT_IN_PRODUCTION and sorts before the activation migration.
// HONEST LIMITS: PGlite is PostgreSQL 18.x (production 17.6) and runs as superuser, so RLS and EXECUTE
// grants are not exercised here (the functions' grants are unchanged by CREATE OR REPLACE, test 1).
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { replaySchema } from "../isolated/schema/replay.mjs";
import { NOT_IN_PRODUCTION } from "../isolated/schema/replay-plan.mjs";
import { bootstrapMarkerSql } from "../isolated/seed/seed-guard.mjs";
import { INTERACTION_KINDS, KIND_ORDER } from "../../supabase/functions/_shared/interaction-kinds.ts";
import { COMPREHENSION_CHECK_FORMATS, summariseDomainProgress, isComprehensionCheck } from "../../js/progress-evidence.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const FILE = "20261105115000_true_false_mastery_exclusion.sql";
const ACTIVATION = "20261105120000_true_false_activation.sql";
const MIGRATION = read(`supabase/migrations/${FILE}`);
const ACTIVATION_SQL = read(`supabase/migrations/${ACTIVATION}`);
const PLATFORM = read("tests/isolated/schema/pglite-platform.sql");
// The one rule, derived from the registry (not a new export: interaction-kinds.ts is part of
// get-next-question's deploy graph and stays untouched): a kind whose single answer a pure guess gets
// right at least half the time is a comprehension check, never mastery evidence.
const MASTERY_EXCLUDED_ANSWER_FORMATS = KIND_ORDER
  .filter((k) => (INTERACTION_KINDS[k].guessFloor ?? 0) >= 0.5)
  .map((k) => INTERACTION_KINDS[k].wireFormat);

// The guard's (signature, production md5, new md5) rows, read from the migration itself.
const GUARD = [...MIGRATION.matchAll(/\('(public\.[a-z_]+\([^)]*\))', '([0-9a-f]{32})', '([0-9a-f]{32})'\)/g)]
  .map((m) => ({ sig: m[1], before: m[2], after: m[3] }));
const TARGETS = ["advance_student_level", "advance_student_band", "get_teacher_visibility", "get_student_overview", "get_concept_states"];

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
const attrs = async (db, sig) => one(db, `SELECT prosecdef, provolatile, proconfig, proacl::text AS acl, proowner,
  pg_get_function_result(oid) AS result, pg_get_function_identity_arguments(oid) AS args
  FROM pg_proc WHERE oid = to_regprocedure($1)`, [sig]);

// ── Fixture: a teacher, one pupil (grade 6, no placement), MC history with a repeat, and — where the
//    database can store them — true_false answers interleaved between the MC answers. ──────────────
const TEACHER = "00000000-0000-4000-8000-0000000000a1";
const PUPIL = "00000000-0000-4000-8000-0000000000b1";
const MC_HISTORY = [true, true, true, false, true, true, true, true, false, true, true, true];
const TF_HISTORY = [true, true, true, true, true, true]; // a lucky streak of guesses

async function seed(db, { withTrueFalse }) {
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ('${TEACHER}', 'laerer@example.test'), ('${PUPIL}', 'elev@example.test');
    INSERT INTO public.profiles (id, role) VALUES ('${TEACHER}', 'teacher');
    INSERT INTO public.profiles (id, role, teacher_id, selected_grade) VALUES ('${PUPIL}', 'student', '${TEACHER}', 6);
  `);
  let qn = 0, t = 0;
  const addQuestion = async (format, band) => {
    qn++;
    const content = format === "true_false"
      ? { question: `Udsagn ${qn}`, correct: "Sandt" }
      : { question: `Spørgsmål ${qn}`, options: ["A", "B", "C", "D"], correct: "A", type: "mc" };
    // true_false gets its own concept, so a guessed streak alone would make it "stable".
    const meta = { concepts: [format === "true_false" ? "valgret" : "grundloven"] };
    return (await one(db, `INSERT INTO public.questions (type, content, difficulty, difficulty_band, is_active, question_type,
        learning_objective, answer_format, answer_type, metadata, target_grade)
      VALUES ($1, $2::jsonb, $3::int, $3::int::smallint, true, 'auto', 'world_war_2', $1, 'short', $4::jsonb, 6) RETURNING id`,
      [format, JSON.stringify(content), band, JSON.stringify(meta)])).id;
  };
  const addAnswer = async (questionId, correct, repeat = 0) => {
    t++;
    const at = new Date(Date.UTC(2026, 10, 1, 8, 0, t)).toISOString();
    await db.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, difficulty_at_time,
        mastery_snapshot, answered, was_correct, answered_at, created_at, repeat_count)
      VALUES ($1, $2, 'A', 1, 1, true, $3, $4, $4, $5)`, [PUPIL, questionId, correct, at, repeat]);
  };
  const tf = withTrueFalse ? [...TF_HISTORY] : [];
  for (const [i, c] of MC_HISTORY.entries()) {
    await addAnswer(await addQuestion("mc", 1 + (i % 3)), c);
    if (tf.length > 0) await addAnswer(await addQuestion("true_false", 3), tf.shift());
  }
  // A repeat of an MC question answered wrong: outside the folds before and after (unchanged rule).
  await addAnswer(await addQuestion("mc", 2), false, 1);
}

async function figures(db) {
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [TEACHER]);
  const level = await one(db, "SELECT * FROM public.advance_student_level($1, 'historie', 6::smallint)", [PUPIL]);
  const band = await one(db, "SELECT * FROM public.advance_student_band($1, 6::smallint)", [PUPIL]);
  const visibility = await rows(db, "SELECT current_band, total_attempts, recent_correct_pct, trend FROM public.get_teacher_visibility($1)", [TEACHER]);
  const overview = await rows(db, "SELECT correct_ratio::text, total_attempts FROM public.get_student_overview($1)", [PUPIL]);
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [PUPIL]);
  const concepts = (await one(db, "SELECT public.get_concept_states($1) AS v", [PUPIL])).v;
  const foldedTf = (await one(db, `SELECT count(*)::int AS n FROM public.student_level_fold_log f
    JOIN public.question_instances qi ON qi.id = f.question_instance_id
    JOIN public.questions q ON q.id = qi.question_id WHERE q.answer_format = 'true_false'`)).n;
  return {
    level: { level: level.level, answered: level.answered, newly_folded: level.newly_folded },
    band: { band: band.band, folded: band.folded },
    visibility, overview, concepts, foldedTf,
  };
}

// The databases are built, used and closed ONE AT A TIME: each PGlite is a whole PostgreSQL in WASM, and
// several at once exhausted the memory of a busy machine (the run stalled). Everything that needs a
// database runs here; the tests below assert on what was collected.
const tnCount = async (db) => (await one(db, "SELECT count(*)::int AS n FROM public.question_instances qi JOIN public.questions q ON q.id = qi.question_id WHERE q.answer_format = 'true_false'")).n;
const R = {};
before(async () => {
  // A — production today: the guard's "before" bodies, then the MC-only figures, then the tamper check.
  const A = await replayDb();
  R.liveMd5 = {}; R.liveSrc = {};
  for (const g of GUARD) {
    R.liveMd5[g.sig] = await md5Of(A, g.sig);
    R.liveSrc[g.sig] = (await one(A, "SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure($1)", [g.sig])).prosrc;
  }
  await seed(A, { withTrueFalse: false });
  R.tfA = await tnCount(A);
  R.figA = await figures(A);
  await A.exec(`CREATE OR REPLACE FUNCTION public.get_concept_states(p_student_id uuid) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$ SELECT '{}'::jsonb $$`);
  R.tamper = await A.exec(MIGRATION).then(() => null, (e) => e.message);
  const level = GUARD.find((g) => g.sig.startsWith("public.advance_student_level"));
  R.levelAfterTamper = await md5Of(A, level.sig);
  await A.close();

  // C — negative control: true_false storable, NO exclusion.
  const C = await replayDb();
  await C.exec(ACTIVATION_SQL);
  await seed(C, { withTrueFalse: true });
  R.tfC = await tnCount(C);
  R.figC = await figures(C);
  await C.close();

  // B — the exclusion, a re-run, then the activation (the required order), then the same history.
  const B = await replayDb();
  R.attrsBefore = {};
  for (const g of GUARD) R.attrsBefore[g.sig] = await attrs(B, g.sig);
  await B.exec(MIGRATION);
  R.afterMd5 = {}; R.attrsAfter = {}; R.src = {};
  for (const g of GUARD) {
    R.afterMd5[g.sig] = await md5Of(B, g.sig);
    R.attrsAfter[g.sig] = await attrs(B, g.sig);
    R.src[g.sig] = (await one(B, "SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure($1)", [g.sig])).prosrc;
  }
  await B.exec(MIGRATION);
  R.rerunMd5 = {};
  for (const g of GUARD) R.rerunMd5[g.sig] = await md5Of(B, g.sig);
  await B.exec(ACTIVATION_SQL);
  await seed(B, { withTrueFalse: true });
  R.tfB = await tnCount(B);
  R.figB = await figures(B);
  R.placementSrc = (await one(B, "SELECT prosrc FROM pg_proc WHERE proname = 'start_placement' AND pronamespace = 'public'::regnamespace")).prosrc;
  await B.close();
});

// ── 1. Guard, attributes ────────────────────────────────────────────────────────────────────────
test("guard: the five live bodies are production's reviewed ones (md5 read from production 2026-11-05)", () => {
  assert.deepEqual(GUARD.map((g) => g.sig.replace(/^public\.|\(.*$/g, "")).sort(), [...TARGETS].sort());
  for (const g of GUARD) assert.equal(R.liveMd5[g.sig], g.before, `${g.sig}: replay = production`);
});

test("apply: every body changes to the reviewed new one; signature, result, security, volatility, config, owner and ACL are unchanged; a re-run is accepted", () => {
  for (const g of GUARD) {
    assert.equal(R.afterMd5[g.sig], g.after, g.sig);
    assert.deepEqual(R.attrsAfter[g.sig], R.attrsBefore[g.sig], `${g.sig}: attributes unchanged`);
    for (const f of MASTERY_EXCLUDED_ANSWER_FORMATS) assert.ok(R.src[g.sig].includes(`'${f}'`), `${g.sig} excludes ${f}`);
    assert.equal(R.rerunMd5[g.sig], g.after, `${g.sig}: re-run accepted`);
  }
});

test("each new body is EXACTLY the live body plus the true_false predicate — gate, logic and grants untouched", () => {
  for (const g of GUARD) {
    const live = R.liveSrc[g.sig].split("\n");
    const now = R.src[g.sig].split("\n");
    const added = now.filter((l) => !live.includes(l));
    // Remove the added lines: what remains is the live body, line for line, in order.
    assert.deepEqual(now.filter((l) => !added.includes(l)), live, `${g.sig}: nothing else changed`);
    assert.ok(added.length >= 1 && added.length <= 3, `${g.sig}: one predicate (1-3 lines), got ${added.length}`);
    assert.ok(added.join("\n").includes("'true_false'"), `${g.sig}: the added lines are the predicate`);
  }
  // No privilege statement: CREATE OR REPLACE keeps each function's owner and grants (also asserted above).
  assert.equal(/^\s*(GRANT|REVOKE|ALTER\s+FUNCTION)\b/im.test(MIGRATION.replace(/--[^\n]*/g, "")), false);
});

test("guard: an unreviewed body stops the migration before anything changes", () => {
  assert.match(R.tamper ?? "", /ureviewet krop/);
  const level = GUARD.find((g) => g.sig.startsWith("public.advance_student_level"));
  assert.equal(R.levelAfterTamper, level.before, "nothing was replaced");
});

// ── 2. Every mastery path ───────────────────────────────────────────────────────────────────────
let figA, figB, figC;
test("fixture: A has only multiple choice; B and C the same plus six guessed true_false answers", () => {
  assert.equal(R.tfA, 0);
  assert.equal(R.tfB, TF_HISTORY.length);
  assert.equal(R.tfC, TF_HISTORY.length);
  [figA, figB, figC] = [R.figA, R.figB, R.figC];
});

test("level engine (advance_student_level): true_false answers are not folded — the level is exactly the MC-only level", () => {
  assert.deepEqual(figB.level, figA.level);
  assert.equal(figB.foldedTf, 0, "no true_false instance in the fold log");
  assert.equal(figA.level.answered, MC_HISTORY.length, "first MC answers only; the repeat is not folded (unchanged)");
  assert.notDeepEqual(figC.level, figA.level, "control: without the exclusion the guesses move the level");
  assert.ok(figC.level.level > figA.level.level);
  assert.equal(figC.foldedTf, TF_HISTORY.length);
});

test("band engine (advance_student_band): true_false answers are not folded", () => {
  assert.deepEqual(figB.band, figA.band);
  assert.notDeepEqual(figC.band, figA.band, "control: without the exclusion the band moves");
});

test("teacher class view (get_teacher_visibility): band, attempts, % right and trend ignore true_false", () => {
  assert.equal(figA.visibility.length, 1);
  assert.deepEqual(figB.visibility, figA.visibility);
  assert.notDeepEqual(figC.visibility, figA.visibility, "control");
});

test("teacher pupil overview (get_student_overview): the first-answer ratio and attempts ignore true_false", () => {
  assert.equal(figA.overview.length, 1);
  assert.deepEqual(figB.overview, figA.overview);
  assert.notDeepEqual(figC.overview, figA.overview, "control");
});

test("concept states (get_concept_states): a concept is not 'stable' on guesses", () => {
  assert.deepEqual(figB.concepts, figA.concepts);
  assert.equal(figB.concepts.valgret, undefined, "a concept seen only through true_false has no state");
  assert.equal(figC.concepts.valgret, "stable", "control: without the exclusion six guesses make it 'stable'");
});

// ── 3. Placement ───────────────────────────────────────────────────────────────────────────────
test("placement (start_placement) draws multiple choice only, so true_false can never enter it", () => {
  assert.match(R.placementSrc, /AND q\.answer_format = 'mc'/);
});

// ── 4. One rule, browser included ──────────────────────────────────────────────────────────────
test("one rule: SQL, registry and browser exclude exactly the kinds a guess gets right at least half the time", () => {
  const byFloor = KIND_ORDER.filter((k) => (INTERACTION_KINDS[k].guessFloor ?? 0) >= 0.5).map((k) => INTERACTION_KINDS[k].wireFormat);
  assert.deepEqual([...MASTERY_EXCLUDED_ANSWER_FORMATS], byFloor);
  assert.deepEqual([...MASTERY_EXCLUDED_ANSWER_FORMATS], ["true_false"]);
  assert.deepEqual([...COMPREHENSION_CHECK_FORMATS], [...MASTERY_EXCLUDED_ANSWER_FORMATS]);
  const sqlOnly = MIGRATION.replace(/--[^\n]*/g, "");
  const sqlFormats = [...new Set([...sqlOnly.matchAll(/answer_format (?:IS DISTINCT FROM|=) '([a-z_]+)'/g)].map((m) => m[1]))];
  assert.deepEqual(sqlFormats, [...MASTERY_EXCLUDED_ANSWER_FORMATS]);
});

test("browser: true_false steers neither the session wave nor the persisted difficulty band; rewards untouched", () => {
  const app = read("app.js");
  assert.match(app, /function answerSteersDifficulty\(\) \{\s*return currentRenderer !== ANSWER_RENDERERS\.TRUE_FALSE;\s*\}/);
  assert.match(app, /if \(answerSteersDifficulty\(\)\) \{\s*updateWavePhase\(true\);\s*adjustDifficultyBand\(true\);\s*\}/);
  assert.match(app, /if \(answerSteersDifficulty\(\)\) \{\s*updateWavePhase\(false\);\s*adjustDifficultyBand\(false\);\s*\}/);
  assert.equal((app.match(/updateWavePhase\((true|false)\)/g) ?? []).length, 2, "no other call path");
  assert.equal((app.match(/adjustDifficultyBand\((true|false)\)/g) ?? []).length, 2, "no other call path");
  // Streak, sounds and the coin/level popups stay on the normal path.
  assert.match(app, /sessionCorrectStreak\+\+;/);
});

test("teacher domain view: true_false is counted apart as 'Forståelsestjek', never in the precision", () => {
  const toDomain = (lo) => (lo === "world_war_2" ? "ww2" : lo === "vikings" ? "vikings" : null);
  const q = (lo, f) => ({ learning_objective: lo, answer_format: f });
  const data = [
    { was_correct: true, questions: q("world_war_2", "mc") },
    { was_correct: false, questions: q("world_war_2", "mc") },
    { was_correct: true, questions: q("world_war_2", "true_false") },
    { was_correct: true, questions: q("world_war_2", "true_false") },
    { was_correct: false, questions: q("world_war_2", "true_false") },
    { is_correct: true, questions: q("vikings", "true_false") },
    { was_correct: true, questions: q("unknown", "mc") },
    { was_correct: true, questions: null },
    null,
  ];
  assert.deepEqual(summariseDomainProgress(data, toDomain), [
    { domain: "ww2", total: 2, correct: 1, checkTotal: 3, checkCorrect: 2 },
    { domain: "vikings", total: 0, correct: 0, checkTotal: 1, checkCorrect: 1 },
  ]);
  // Without true_false the rows are what the page computed before (same totals, same order).
  const mcOnly = [
    { was_correct: true, questions: q("vikings", "mc") },
    { was_correct: true, questions: q("world_war_2", "mc") },
    { was_correct: false, questions: q("world_war_2", "mc") },
  ];
  assert.deepEqual(summariseDomainProgress(mcOnly, toDomain).map((r) => [r.domain, r.total, r.correct]),
    [["ww2", 2, 1], ["vikings", 1, 1]]);
  assert.deepEqual(summariseDomainProgress(undefined, toDomain), []);
  assert.equal(isComprehensionCheck("true_false"), true);
  assert.equal(isComprehensionCheck("mc"), false);
  assert.equal(isComprehensionCheck(null), false);
  const page = read("js/student-detail.js");
  assert.match(page, /import \{ summariseDomainProgress \} from "\.\/progress-evidence\.js";/);
  assert.match(page, /questions\(learning_objective, answer_format\)/);
  assert.match(page, /const rows = summariseDomainProgress\(data \?\? \[\], objectiveToDomain\);/);
  assert.match(page, /Forst&#229;elsestjek/);
  // The overview card names what each figure covers: the ratio and attempts come from
  // get_student_overview (true_false excluded), the total from the reward counter (all formats).
  assert.match(page, /Korrekt svarprocent, førstesvar \(uden forståelsestjek\):/);
  assert.match(page, /Førstesvar i alt \(uden forståelsestjek\):/);
  assert.match(page, /Rigtige førstesvar i alt, alle opgavetyper inkl\. forståelsestjek \(tæller til achievements\):/);
});

// ── 5. Inactive and ordered ────────────────────────────────────────────────────────────────────
test("inactive: in NOT_IN_PRODUCTION, and ordered before the activation migration", () => {
  assert.ok(FILE in NOT_IN_PRODUCTION);
  assert.ok(ACTIVATION in NOT_IN_PRODUCTION);
  assert.ok(FILE < ACTIVATION, "sorts (and is to be applied) before the activation");
  assert.match(MIGRATION, /SKAL anvendes FØR 20261105120000_true_false_activation\.sql/);
});
