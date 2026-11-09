// Lærligverse F10-B2: migration 20261109120000_laerligverse_course_progress_read.sql, run UNMODIFIED on
// PGlite over the FULL isolated replay of the repository (tests/isolated/schema).
//
// Two databases:
//   A  replay + this migration — production's shape today: H5's question_attempts WITHOUT K1's mode and
//      hints_used. Course data has no registered mode or help, so evidence is "unknown", never 0.
//   B  replay + L1 K1 (20261103110000, not applied in production) + this migration — the registered
//      mode and hints are read; K1's constant context (quiz_v1, 0) is NOT read as "0 hints".
// Proven:
//   1. FILE: unique version, in NOT_IN_PRODUCTION, skipped by the replay, D-110 header, adds only this
//      function; SECURITY DEFINER, empty search_path, EXECUTE for authenticated only.
//   2. GATE: the pupil's teacher, super_admin and the pupil themself get the result; another teacher,
//      another pupil, a profile-less user, anonymous, an unknown id and a non-pupil target all get NULL.
//   3. SHAPE: exactly the documented keys; course items only (metadata.learning_step), ordinary questions
//      never; no other pupil; no answer key, answer text or question content anywhere in the result.
//   4. FIRST ANSWERS ONLY, NO DOUBLE COUNT: one entry per instance; attempt 1 is the first answer; a
//      repeated legacy instance has no known first answer (NULL, never guessed); attempt_no is the first
//      correct attempt; an instance and its attempts are never two answers.
//   5. K1 OPTIONAL: without K1 mode/hints are NULL and evidence "unknown"; with K1 the registered values
//      are used, and the evidence equals evidence.ts's `independent` state for the same facts.
//   6. NOTHING ELSE CHANGES: get_student_overview / get_teacher_visibility bodies and results are
//      identical before and after; with question_attempts absent the RPC still answers (instance facts).
// HONEST LIMITS: PGlite runs as superuser, so the EXECUTE grants are checked in the catalog
// (has_function_privilege), not by switching roles; auth.uid() is the platform stub (request.jwt.claim.sub).
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { replaySchema } from "../isolated/schema/replay.mjs";
import { NOT_IN_PRODUCTION, planReplay } from "../isolated/schema/replay-plan.mjs";
import { bootstrapMarkerSql } from "../isolated/seed/seed-guard.mjs";
import { assessObjectives } from "../../adventure-engine/packages/learning-bridge/src/evidence.ts";
import { classifyStepEvidence, normalizeCourseProgress } from "../../js/course-progress-view.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const FILE = "20261109120000_laerligverse_course_progress_read.sql";
const K1 = "20261103110000_l1_k1_attempt_context.sql";
const MIGRATION = read(`supabase/migrations/${FILE}`);
const PLATFORM = read("tests/isolated/schema/pglite-platform.sql");
const SIG = "public.get_course_progress(uuid)";

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
const as = async (db, uid) => db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [uid ?? ""]);
async function progress(db, caller, target) {
  await as(db, caller);
  return (await one(db, "SELECT public.get_course_progress($1) AS v", [target])).v;
}

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TEACHER = U(1), OTHER_TEACHER = U(2), ADMIN = U(3), PUPIL = U(10), OTHER_PUPIL = U(11), NO_PROFILE = U(99);
const KEY = "HEMMELIGT-FACIT";
const ANSWER = "ELEVENS-EGET-SVAR";
const QTEXT = "SPØRGSMÅLSTEKST-MÅ-IKKE-UD";

async function seedPeople(db) {
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ('${TEACHER}', 't1@example.test'), ('${OTHER_TEACHER}', 't2@example.test'),
      ('${ADMIN}', 'sa@example.test'), ('${PUPIL}', 'p1@example.test'), ('${OTHER_PUPIL}', 'p2@example.test'),
      ('${NO_PROFILE}', 'x@example.test');
    INSERT INTO public.profiles (id, role) VALUES ('${TEACHER}', 'teacher'), ('${OTHER_TEACHER}', 'teacher'), ('${ADMIN}', 'super_admin');
    INSERT INTO public.profiles (id, role, teacher_id, selected_grade) VALUES
      ('${PUPIL}', 'student', '${TEACHER}', 7), ('${OTHER_PUPIL}', 'student', '${OTHER_TEACHER}', 7);
  `);
}
let qn = 0;
async function question(db, objective, metadata) {
  qn++;
  const content = { question: `${QTEXT} ${qn}`, options: [KEY, "B", "C", "D"], correct: KEY, type: "mc" };
  return (await one(db, `INSERT INTO public.questions (type, content, difficulty, difficulty_band, is_active, question_type,
      learning_objective, answer_format, answer_type, metadata, target_grade)
    VALUES ('mc', $1::jsonb, 2, 2::smallint, true, 'auto', $2, 'mc', 'short', $3::jsonb, 7) RETURNING id`,
    [JSON.stringify(content), objective, metadata === undefined ? null : JSON.stringify(metadata)])).id;
}
async function instance(db, pupil, qid, { answered = false, correct = null, at = null, created, repeat = 0 }) {
  return (await one(db, `INSERT INTO public.question_instances (student_id, question_id, correct_answer, difficulty_at_time,
      mastery_snapshot, answered, was_correct, user_answer, answered_at, created_at, repeat_count)
    VALUES ($1, $2, $3, 1, 1, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [pupil, qid, KEY, answered, correct, answered ? ANSWER : null, at, created, repeat])).id;
}
async function attempt(db, pupil, qi, no, correct, at, k1 = null) {
  const base = [qi, pupil, no, correct ? "correct" : "incorrect", correct, ANSWER, no > 1, KEY, at];
  await db.query(`INSERT INTO public.question_attempts (question_instance_id, student_id, attempt_no, submission_id, grading,
      status, was_correct, user_answer, answer_format, answer_type, is_repeat, correct_answer_shown, answered_at,
      xp_awarded, coins_awarded, source${k1 ? ", mode, hints_used" : ""})
    VALUES ($1, $2, $3, gen_random_uuid(), 'auto', $4, $5, $6, 'mc', 'short', $7, $8, $9, 0, 0,
      'process_question_attempt_v2'${k1 ? ", $10, $11" : ""})`, k1 ? [...base, k1.mode, k1.hints] : base);
}
const t = (h) => new Date(Date.UTC(2026, 10, 3, 8, 0, 0) + h * 3_600_000).toISOString();
const OBJ = "kildekritik_ophav";
const OBJ2 = "kildekritik_formaal";

// The course: guided practice (legacy), independent application (H5 log), transfer (wrong, then right at
// attempt 2), revisit (served only); a repeated legacy instance in a second objective; an ordinary question;
// another pupil's course answer.
async function seedCourse(db, { k1 }) {
  const q = {
    gp: await question(db, OBJ, { learning_step: "guided_practice" }),
    ia: await question(db, OBJ, { learning_step: "independent_application" }),
    tr: await question(db, OBJ, { learning_step: "transfer" }),
    rv: await question(db, OBJ, { learning_step: "revisit" }),
    ia2: await question(db, OBJ2, { learning_step: "independent_application" }),
    ordinary: await question(db, "world_war_2", { concepts: ["grundloven"] }),
    plain: await question(db, OBJ, undefined),
  };
  const i = {};
  i.gp = await instance(db, PUPIL, q.gp, { answered: true, correct: false, at: t(0.1), created: t(0) });
  i.ia = await instance(db, PUPIL, q.ia, { answered: true, correct: true, at: t(0.3), created: t(0.2) });
  await attempt(db, PUPIL, i.ia, 1, true, t(0.3), k1 ? { mode: "check", hints: 0 } : null);
  i.tr = await instance(db, PUPIL, q.tr, { answered: true, correct: true, at: t(0.6), created: t(0.4), repeat: 1 });
  await attempt(db, PUPIL, i.tr, 1, false, t(0.5), k1 ? { mode: "application", hints: 1 } : null);
  await attempt(db, PUPIL, i.tr, 2, true, t(0.6), k1 ? { mode: "application", hints: 0 } : null);
  i.rv = await instance(db, PUPIL, q.rv, { created: t(30) });
  i.ia2 = await instance(db, PUPIL, q.ia2, { answered: true, correct: true, at: t(2), created: t(1), repeat: 2 });
  await instance(db, PUPIL, q.ordinary, { answered: true, correct: true, at: t(0.05), created: t(0.01) });
  await instance(db, PUPIL, q.plain, { answered: true, correct: true, at: t(0.07), created: t(0.06) });
  await instance(db, OTHER_PUPIL, q.gp, { answered: true, correct: true, at: t(0.2), created: t(0.1) });
  return { q, i };
}

const ordinary = async (db) => {
  await as(db, TEACHER);
  return {
    overview: await rows(db, "SELECT email, xp, level, correct_ratio::text, total_correct_answers, total_attempts FROM public.get_student_overview($1)", [PUPIL]),
    visibility: await rows(db, "SELECT student_id, total_attempts, recent_correct_pct, trend, current_band FROM public.get_teacher_visibility($1)", [TEACHER]),
    bodies: await rows(db, `SELECT p.oid::regprocedure::text AS sig, md5(p.prosrc) AS m, p.proacl::text AS acl FROM pg_proc p
      WHERE p.proname IN ('get_student_overview', 'get_teacher_visibility') ORDER BY 1`),
  };
};
const functionSet = async (db) => (await rows(db, `SELECT p.oid::regprocedure::text AS f FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' ORDER BY 1`)).map((r) => r.f);

let A, B, seededA, seededB, beforeA, afterA, fnsBefore, fnsAfter;
before(async () => {
  A = await replayDb();
  await seedPeople(A);
  seededA = await seedCourse(A, { k1: false });
  beforeA = await ordinary(A);
  fnsBefore = await functionSet(A);
  await A.exec(MIGRATION);
  afterA = await ordinary(A);
  fnsAfter = await functionSet(A);

  B = await replayDb();
  await B.exec(read(`supabase/migrations/${K1}`));
  await B.exec(MIGRATION);
  await seedPeople(B);
  seededB = await seedCourse(B, { k1: true });
});

// ── 1. File ───────────────────────────────────────────────────────────────────────────────────────────

test("the file: unique version, not replayed until applied, D-110 header, one function and its grants", async () => {
  const files = readdirSync(join(ROOT, "supabase", "migrations")).filter((f) => /^\d{14}_.+\.sql$/.test(f)).sort();
  assert.equal(files.filter((f) => f.slice(0, 14) === FILE.slice(0, 14)).length, 1, "version unique");
  assert.match(NOT_IN_PRODUCTION[FILE] ?? "", /not applied in production/);
  const readM = (f) => read(`supabase/migrations/${f}`);
  assert.equal(planReplay(files, readM).plan.find((p) => p.file === FILE).action, "skip");
  assert.match(MIGRATION, /NOT APPLIED IN PRODUCTION\. Applying it needs a separate owner authorisation \(D-110\)/);
  const body = MIGRATION.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  assert.equal((body.match(/CREATE (OR REPLACE )?FUNCTION/g) ?? []).length, 1);
  assert.equal(/\b(ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE)\b|CREATE (TABLE|INDEX|POLICY|TRIGGER|VIEW)/i.test(body), false);
  assert.deepEqual(fnsAfter.filter((f) => !fnsBefore.includes(f)), ["get_course_progress(uuid)"]);
  assert.deepEqual(fnsBefore.filter((f) => !fnsAfter.includes(f)), []);
  const attrs = await one(A, `SELECT p.prosecdef, p.provolatile, p.proconfig, pg_get_function_result(p.oid) AS r,
      has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth,
      has_function_privilege('service_role', p.oid, 'EXECUTE') AS svc,
      EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0) AS public_exec
    FROM pg_proc p WHERE p.oid = to_regprocedure($1)`, [SIG]);
  assert.deepEqual(attrs, { prosecdef: true, provolatile: "s", proconfig: ['search_path=""'], r: "jsonb", anon: false, auth: true, svc: false, public_exec: false });
});

// ── 2. Gate ───────────────────────────────────────────────────────────────────────────────────────────

test("gate: the pupil's teacher, super_admin and the pupil get it; everyone else gets the same NULL", async () => {
  const teacher = await progress(A, TEACHER, PUPIL);
  assert.ok(teacher && Array.isArray(teacher.objectives) && teacher.objectives.length === 2);
  assert.deepEqual(await progress(A, ADMIN, PUPIL), teacher);
  assert.deepEqual(await progress(A, PUPIL, PUPIL), teacher);
  for (const [caller, target, why] of [
    [OTHER_TEACHER, PUPIL, "another teacher"], [OTHER_PUPIL, PUPIL, "another pupil"], [PUPIL, OTHER_PUPIL, "pupil asks for another"],
    [NO_PROFILE, PUPIL, "no profile"], [null, PUPIL, "anonymous"], [TEACHER, U(12345), "unknown id"],
    [ADMIN, TEACHER, "target is a teacher"], [TEACHER, TEACHER, "teacher asks about themself"], [TEACHER, null, "NULL target"],
  ]) {
    assert.equal(await progress(A, caller, target), null, why);
  }
  // The other teacher's own pupil is theirs, and only theirs.
  const own = await progress(A, OTHER_TEACHER, OTHER_PUPIL);
  assert.equal(own.objectives.length, 1);
  assert.equal(own.objectives[0].steps.length, 1);
});

// ── 3./4. Shape, first answers, no double count ──────────────────────────────────────────────────────

const STEP_KEYS = ["attempt_no", "correct", "evidence", "first_answer_at", "grading", "hints_used", "mode", "sequence", "served_at", "source", "status", "step"];

test("shape: documented keys only, course items only, nothing secret, one entry per instance", async () => {
  const r = await progress(A, TEACHER, PUPIL);
  assert.deepEqual(Object.keys(r).sort(), ["objectives", "rules", "sources", "version"]);
  assert.equal(r.version, 1);
  assert.equal(r.rules, "evidence.ts@3d4a7c1c269c");
  assert.deepEqual(r.sources, { attempt_log: true, mode: false, hints: false });
  assert.deepEqual(r.objectives.map((o) => o.objective_id), [OBJ2, OBJ]);
  const o = r.objectives[1];
  assert.deepEqual(Object.keys(o).sort(), ["objective_id", "started_at", "steps"]);
  assert.equal(Date.parse(o.started_at), Date.parse(t(0)));
  assert.deepEqual(o.steps.map((s) => s.step), ["guided_practice", "independent_application", "transfer", "revisit"]);
  for (const s of [...o.steps, ...r.objectives[0].steps]) {
    assert.deepEqual(Object.keys(s).sort(), STEP_KEYS);
    assert.deepEqual(Object.keys(s.sequence).sort(), ["answered", "answered_at", "was_correct"]);
  }
  const text = JSON.stringify(r);
  for (const secret of [KEY, ANSWER, QTEXT, "world_war_2", "grundloven", OTHER_PUPIL, PUPIL]) {
    assert.equal(text.includes(secret), false, secret);
  }
  // The question without a step tag (same objective) and the ordinary question never appear: 4 + 1 entries.
  assert.equal(r.objectives.reduce((n, x) => n + x.steps.length, 0), 5);
});

test("first answers only: legacy instance, H5 attempt 1, solved at attempt 2, served, repeated legacy", async () => {
  const r = await progress(A, TEACHER, PUPIL);
  const [gp, ia, tr, rv] = r.objectives[1].steps;
  const pick = (s) => ({ status: s.status, correct: s.correct, attempt_no: s.attempt_no, hints_used: s.hints_used, mode: s.mode, evidence: s.evidence, source: s.source });
  assert.deepEqual(pick(gp), { status: "answered", correct: false, attempt_no: null, hints_used: null, mode: null, evidence: "practice", source: "instance" });
  assert.equal(Date.parse(gp.first_answer_at), Date.parse(t(0.1)));
  assert.deepEqual(pick(ia), { status: "answered", correct: true, attempt_no: 1, hints_used: null, mode: null, evidence: "unknown", source: "attempt" });
  // Wrong first, right at attempt 2: the first answer counts — never independent. The instance (now
  // correct) and its two attempts are ONE entry.
  assert.deepEqual(pick(tr), { status: "answered", correct: false, attempt_no: 2, hints_used: null, mode: null, evidence: "not_shown", source: "attempt" });
  assert.equal(Date.parse(tr.first_answer_at), Date.parse(t(0.5)));
  assert.deepEqual(tr.sequence, { answered: true, was_correct: true, answered_at: tr.sequence.answered_at });
  assert.deepEqual(pick(rv), { status: "served", correct: null, attempt_no: null, hints_used: null, mode: null, evidence: "not_shown", source: null });
  assert.equal(rv.first_answer_at, null);
  // A legacy instance repeated twice has no known first answer: NULL, never its current "correct".
  const [ia2] = r.objectives[0].steps;
  assert.deepEqual(pick(ia2), { status: "answered", correct: null, attempt_no: null, hints_used: null, mode: null, evidence: "unknown", source: null });
  assert.equal(ia2.first_answer_at, null);
  // The browser's own rule agrees with every entry, so it shows the server's evidence unchanged.
  const norm = normalizeCourseProgress(r);
  assert.equal(norm.skipped, 0);
  for (const o of norm.objectives) for (const s of o.steps) assert.equal(s.evidence, classifyStepEvidence(s));
});

// ── 5. K1 optional ────────────────────────────────────────────────────────────────────────────────────

test("with K1: registered mode and hints are used; evidence equals evidence.ts's `independent` state", async () => {
  const r = await progress(B, TEACHER, PUPIL);
  assert.deepEqual(r.sources, { attempt_log: true, mode: true, hints: true });
  const [gp, ia, tr] = r.objectives[1].steps;
  assert.deepEqual([gp.mode, gp.hints_used, gp.evidence], [null, null, "practice"], "legacy instance: still not registered");
  assert.deepEqual([ia.correct, ia.mode, ia.hints_used, ia.evidence], [true, "check", 0, "shown_independently"]);
  assert.deepEqual([tr.correct, tr.attempt_no, tr.mode, tr.hints_used, tr.evidence], [false, 2, "application", 1, "not_shown"]);
  for (const s of [ia, tr]) {
    const [a] = assessObjectives([{ kind: "attempt", source: "server", objective: OBJ, at: s.first_answer_at, instanceId: "i", roundNo: 1,
      submissionId: "x", grading: "auto", wasCorrect: s.correct, isRepeat: false, mode: s.mode, hintsUsed: s.hints_used, situation: null, evidenceValid: null }]);
    assert.equal(s.evidence, { observed: "shown_independently", unknown: "unknown", not_observed: "not_shown" }[a.states.independent.status]);
  }
});

test("with K1's constant context (quiz_v1, 0) the 0 is not a registered fact: hints NULL, evidence unknown", async () => {
  const q = await question(B, "kildekritik_k1", { learning_step: "transfer" });
  const qi = await instance(B, PUPIL, q, { answered: true, correct: true, at: t(5), created: t(4.9) });
  await attempt(B, PUPIL, qi, 1, true, t(5), { mode: "quiz_v1", hints: 0 });
  const r = await progress(B, TEACHER, PUPIL);
  const s = r.objectives.find((o) => o.objective_id === "kildekritik_k1").steps[0];
  assert.deepEqual([s.correct, s.mode, s.hints_used, s.evidence], [true, "quiz_v1", null, "unknown"]);
});

// ── 6. Nothing else changes ───────────────────────────────────────────────────────────────────────────

test("the ordinary teacher figures are byte-identical before and after the migration", () => {
  assert.deepEqual(afterA, beforeA);
  assert.equal(beforeA.overview.length, 1);
  assert.equal(beforeA.bodies.length, 2);
});

test("without question_attempts the RPC still answers from the instances (H5 log optional)", async () => {
  await A.exec("DROP TABLE public.question_attempts CASCADE");
  const r = await progress(A, TEACHER, PUPIL);
  assert.deepEqual(r.sources, { attempt_log: false, mode: false, hints: false });
  const [gp, ia, tr] = r.objectives[1].steps;
  assert.deepEqual([gp.source, gp.correct], ["instance", false]);
  assert.deepEqual([ia.source, ia.correct, ia.attempt_no, ia.evidence], ["instance", true, 1, "unknown"]);
  // Repeated legacy instance: first answer unknown once the log is gone.
  assert.deepEqual([tr.source, tr.correct, tr.attempt_no, tr.evidence], [null, null, null, "unknown"]);
});
