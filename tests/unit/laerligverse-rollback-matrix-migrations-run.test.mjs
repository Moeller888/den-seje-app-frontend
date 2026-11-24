// ROLLBACK MATRIX (fase L, Lærligverset): what happens to PUPILS' DATA AND ACCESS when get-next-question or the database
// is moved to another version — not only whether a version starts. Real code on both sides:
//   * Edge: the REAL get-next-question of three versions — production today (a7450b0f), #739/main (05a4a34f) and this
//     tree (#740; later F8) — loaded through tests/unit/helpers/gnq-db-backend.mjs, which turns each supabase-js call into
//     one SQL statement against
//   * the database: production's answer chain (helpers/answer-chain-schema.mjs) + D-280 + D-316 (= DB0, production) and
//     the migrations UNMODIFIED on top: 20261120150000 (D-383, = DB1), 20261123100000 (#740, = DB2), the down script
//     docs/operations/rollback/20261123100000_course_scope_down.sql (= DB2↓, must equal DB1), and F8 when its migration
//     exists in this tree (= DB3). PGlite locally; the unit job's PostgreSQL 17.6 service in CI (LEVEL_ENGINE_PG_URL).
//   * answers through the real public.process_question_attempt (process-event's RPC), synthetic pupils only.
//
// Why cells and not transitions: an Edge Function holds no state between requests, so after a version switch the ONLY
// thing a version inherits is database rows. Every cell therefore seeds the rows any version could have left (open and
// answered course rounds, wrong answers due for repeat, finished steps) and lets one version act on them. The roll-forward
// test (scenario 4) additionally runs one real transition chain on one database.
//
// Every cell's OBSERVED problems are compared with the EXPECTED ones below. An unsafe combination is therefore a GREEN
// test that names it ("detected"); the test turns red only when behaviour changes — then the matrix and
// docs/operations/laerligverse-rollback-matrix.md must be reviewed (UPDATE_ROLLBACK_MATRIX_DOC=1 rewrites the table).
//
// HONEST LIMITS: PostgREST is a stand-in (call shapes are translated literally; an unmodelled one throws); the client
// (spil.html) is not run; the old Edge versions need their commits (CI checks out shallow: those cells are skipped with
// the reason, or FAIL when ROLLBACK_EDGE_REQUIRED=1 — set only by the proposed rollback job,
// docs/operations/ci-workflow-proposals/rollback-lane.patch).
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { answerChainSql, extractFunction, readMigration } from "./helpers/answer-chain-schema.mjs";
import { PG_REQUIRED, PG_URL, as, haveCommit, loadHandler, makeTemplate, materialise, openDatabase, request } from "./helpers/gnq-db-backend.mjs";
import { historyFromRows, nextStep } from "../../supabase/functions/_shared/learning-sequence.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TREE_INDEX = join(ROOT, "supabase", "functions", "get-next-question", "index.ts");
const DOC = join(ROOT, "docs", "operations", "laerligverse-rollback-matrix.md");
const DOWN = readFileSync(join(ROOT, "docs", "operations", "rollback", "20261123100000_course_scope_down.sql"), "utf8");
const M1 = "20261120150000_course_items_out_of_ordinary_quiz.sql";
const M2 = "20261123100000_course_scope_before_candidate_limit.sql";
// F8 (D-384) is recognised by WHAT it does, not by a file name chosen elsewhere: the migration that adds parked_at.
const F8 = readdirSync(join(ROOT, "supabase", "migrations")).filter((f) => f.endsWith(".sql")).sort()
  .find((f) => /ADD COLUMN (IF NOT EXISTS )?parked_at\b/i.test(readMigration(f))) ?? null;
const EDGE_REQUIRED = process.env.ROLLBACK_EDGE_REQUIRED === "1";

test("a real PostgreSQL server is present where it is required (CI)", { skip: !PG_REQUIRED }, () => {
  assert.ok(PG_URL, "LEVEL_ENGINE_PG_REQUIRED=1 but LEVEL_ENGINE_PG_URL is not set");
});

// ── Edge versions ───────────────────────────────────────────────────────────────────────────────────
// With F8 in the tree: also #740's candidate (f51f39e4), and F8 twice — LAERLIGVERSE_COURSE_PARKING off (= D-383's
// behaviour) and on. "F8, parkering til" with every Lærligverse flag off is the SAFETY VERSION: same code, course off.
const EDGES = [
  { key: "prod", label: "a7450b0f (produktion i dag)", commit: "a7450b0f" },
  { key: "d383", label: "05a4a34f (#739, main)", commit: "05a4a34f" },
  ...(F8 ? [{ key: "c740", label: "f51f39e4 (#740-kandidaten)", commit: "f51f39e4" }] : []),
  { key: "tree", label: F8 ? "dette træ (F8), parkering fra" : "dette træ (#740)", commit: null },
  ...(F8 ? [{ key: "f8on", label: "dette træ (F8), parkering til", commit: null, same: "tree", flags: { LAERLIGVERSE_COURSE_PARKING: "on" } }] : []),
];
const handlers = {};
for (const e of EDGES) {
  if (e.same) { handlers[e.key] = handlers[e.same]; continue; }
  if (e.commit && !haveCommit(e.commit, ROOT)) { handlers[e.key] = null; continue; }
  handlers[e.key] = await loadHandler(e.commit ? materialise(e.commit, ROOT) : TREE_INDEX);
}
const edgeFlags = (e) => e.flags ?? {};
// Does a version know the parked state? Read from its source, not assumed.
const knowsParking = (e) => readFileSync(e.commit ? materialise(e.commit, ROOT) : TREE_INDEX, "utf8").includes("parked_at");
test("old Edge versions are available where the rollback job requires them", { skip: !EDGE_REQUIRED }, () => {
  for (const e of EDGES) assert.ok(handlers[e.key], `${e.label}: the commit is missing (fetch it: the proposed job does)`);
});

// ── Databases ───────────────────────────────────────────────────────────────────────────────────────
const D280 = "20261031194600_mc_length_cue_answer_paths.sql";
const D316 = "20261102100000_release_open_rounds_on_inactive_questions.sql";
// DB0 is built ONCE (production's answer chain is the expensive part) and every database starts as a copy of it.
let db0Template = null;
after(async () => { if (db0Template) await (await db0Template).dispose(); });
async function buildDb0() {
  const db = await openDatabase(ROOT, "rollback_matrix_db0");
  for (const s of answerChainSql({ realServer: db.onPg })) await db.x(s);
  await db.x(readMigration(D280));
  await db.x(readMigration(D316));
  // The two shared candidate functions as production holds them (20261123100000's guard checks exactly these bodies).
  await db.x(extractFunction("20261016160000_answer_keys_server_side_rpcs.sql", "get_unserved_questions_for_student"));
  await db.x(`REVOKE ALL ON FUNCTION public.get_unserved_questions_for_student(uuid, smallint, text[]) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.get_unserved_questions_for_student(uuid, smallint, text[]) TO service_role;`);
  await db.x(extractFunction("20261019150000_question_format_mix.sql", "get_question_candidates_for_student"));
  await db.x(`REVOKE ALL ON FUNCTION public.get_question_candidates_for_student(uuid, smallint, text[], integer) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.get_question_candidates_for_student(uuid, smallint, text[], integer) TO service_role;`);
  return makeTemplate(db);
}
async function database(stage) {
  db0Template ??= buildDb0();
  const db = await openDatabase(ROOT, "rollback_matrix", { template: await db0Template });
  if (stage === "DB0") return db;
  await db.x(readMigration(M1));
  if (stage === "DB1") return db;
  await db.x(readMigration(M2));
  if (stage === "DB2") return db;
  if (stage === "DB2↓") { await applyDown(db); return db; }
  if (stage === "DB3") { await db.x(readMigration(F8)); return db; }
  throw new Error(stage);
}
async function applyDown(db) {
  await db.x("BEGIN");
  try { await db.x(DOWN); await db.x("COMMIT"); } catch (e) { await db.x("ROLLBACK"); throw e; }
}
const CATALOG = `SELECT p.oid::regprocedure::text AS sig, md5(p.prosrc) AS body, p.prosecdef, p.provolatile, p.proconfig::text AS config,
    p.proacl::text AS acl, obj_description(p.oid, 'pg_proc') AS comment
  FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace ORDER BY 1`;

// ── Synthetic content and pupils ────────────────────────────────────────────────────────────────────
let seq = 0;
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function question(db, domain, metadata = {}) {
  const id = uid(10000 + ++seq);
  await db.q(`INSERT INTO public.questions (id, type, content, metadata, difficulty, is_active, question_type, learning_objective,
      answer_format, answer_type, target_grade, difficulty_band, difficulty_level)
    VALUES ($1, 'mc_single', $2::jsonb, $3::jsonb, 1, true, 'auto', $4, 'mc', 'short', 6, 1, 1000)`,
  [id, JSON.stringify({ question: `Q ${id}`, options: ["a", "b"], correct: "a" }), JSON.stringify(metadata), domain]);
  return id;
}
const COURSE_STEPS = ["guided_practice", "independent_application", "transfer"];
async function content(db, withCourse) {
  const c = { ordinary: [], english: [], course: {}, course2: null };
  for (let i = 0; i < 3; i++) c.ordinary.push(await question(db, "vikings"));
  for (let i = 0; i < 2; i++) c.english.push(await question(db, "english"));
  if (withCourse) for (const s of COURSE_STEPS) c.course[s] = await question(db, "vikings", { learning_step: s });
  // A second course (another learning objective) for "parked rounds in two courses".
  if (withCourse) c.course2 = await question(db, "english", { learning_step: "guided_practice" });
  return c;
}
const park = (db, p) => as(db, "service_role", null, "SELECT public.park_open_course_round($1) AS id", [p]);
async function newPupil(db) {
  const id = uid(50000 + ++seq);
  await db.q("INSERT INTO auth.users VALUES ($1)", [id]);
  await db.q("INSERT INTO public.profiles (id, role, selected_grade, active_domains) VALUES ($1, 'student', 6, $2)", [id, ["vikings"]]);
  await db.q("INSERT INTO public.student_progress (student_id) VALUES ($1)", [id]);
  return id;
}
// A round as a server path would have left it: served (open), or answered `daysAgo` days ago (wrong answers due).
async function round(db, pupil, q, { answered = false, correct = true, daysAgo = 2 } = {}) {
  // An open round is due a minute ago, never at the database's now(): real PostgreSQL's clock can run milliseconds ahead
  // of the Edge clock that get-next-question's due read uses, and the round would then not be due (timing-dependent).
  const r = await db.q(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, created_at, answered, answered_at,
      user_answer, was_correct, is_correct, next_review_at)
    VALUES ($1, $2, 'a', now() - make_interval(days => $3::int), $4::boolean, CASE WHEN $4 THEN now() - make_interval(days => $3::int) END,
      CASE WHEN $4 THEN $5::text END, CASE WHEN $4 THEN $6::boolean END, CASE WHEN $4 THEN $6::boolean END,
      CASE WHEN $4 THEN now() - make_interval(days => $3::int - 1) ELSE now() - interval '1 minute' END) RETURNING id`,
  [pupil, q, daysAgo, answered, correct ? "a" : "b", correct]);
  return r[0].id;
}
// The pupil types (wf-3-rollback-lane.md): each a state a real version could leave behind. `subject` is what the pupil
// asks for next; `canBeServed` says whether ordinary content is available to them (then "no task" means stuck).
const PUPILS = {
  A: { label: "almindelig elev, intet kursus", course: false, subject: "historie", canBeServed: true, seed: async () => {} },
  R: { label: "almindelig, forkert svar til gentagelse, puljen opbrugt", course: false, subject: "historie", canBeServed: true,
    seed: async (db, p, c) => { await round(db, p, c.ordinary[0], { answered: true, correct: false }); for (const q of c.ordinary.slice(1)) await round(db, p, q, { answered: true }); } },
  B: { label: "åben kursusrunde, beder om almindelig historie", course: true, subject: "historie", canBeServed: true,
    seed: async (db, p, c) => { await round(db, p, c.course.guided_practice, { daysAgo: 0 }); } },
  B2: { label: "åben kursusrunde, skifter fag til engelsk", course: true, subject: "engelsk", canBeServed: true,
    seed: async (db, p, c) => { await round(db, p, c.course.guided_practice, { daysAgo: 0 }); } },
  C: { label: "forkert kursussvar til gentagelse, almindelig pulje opbrugt", course: true, subject: "historie", canBeServed: false,
    seed: async (db, p, c) => { await round(db, p, c.course.guided_practice, { answered: true, correct: false }); for (const q of c.ordinary) await round(db, p, q, { answered: true }); } },
  C2: { label: "hele kurset besvaret, ét forkert kursussvar til gentagelse, almindelig pulje opbrugt", course: true, subject: "historie", canBeServed: false,
    seed: async (db, p, c) => {
      await round(db, p, c.course.guided_practice, { answered: true, correct: false, daysAgo: 4 });
      await round(db, p, c.course.independent_application, { answered: true, daysAgo: 3 });
      await round(db, p, c.course.transfer, { answered: true, daysAgo: 2 });
      for (const q of c.ordinary) await round(db, p, q, { answered: true });
    } },
  D: { label: "afsluttet kursustrin, almindelig undervisning", course: true, subject: "historie", canBeServed: true,
    seed: async (db, p, c) => { await round(db, p, c.course.guided_practice, { answered: true, daysAgo: 3 }); await round(db, p, c.course.independent_application, { answered: true }); } },
  F: { label: "åben almindelig runde plus kursushistorik", course: true, subject: "historie", canBeServed: true,
    seed: async (db, p, c) => { await round(db, p, c.course.guided_practice, { answered: true }); await round(db, p, c.ordinary[0], { daysAgo: 0 }); } },
  // F8 (D-384): parked rounds exist only on a database with F8's migration; parked with F8's own RPC.
  P: { label: "parkeret kursusrunde, beder om almindelig historie", course: true, f8: true, subject: "historie", canBeServed: true,
    seed: async (db, p, c) => { await round(db, p, c.course.guided_practice, { daysAgo: 0 }); await park(db, p); } },
  P2: { label: "to parkerede kursusrunder i to kurser, skifter til engelsk", course: true, f8: true, subject: "engelsk", canBeServed: true,
    seed: async (db, p, c) => {
      await round(db, p, c.course.guided_practice, { daysAgo: 0 }); await park(db, p);
      await round(db, p, c.course2, { daysAgo: 0 }); await park(db, p);
    } },
  PO: { label: "parkeret kursusrunde plus åben almindelig runde", course: true, f8: true, subject: "historie", canBeServed: true,
    seed: async (db, p, c) => { await round(db, p, c.course.guided_practice, { daysAgo: 0 }); await park(db, p); await round(db, p, c.ordinary[0], { daysAgo: 0 }); } },
};

// ── Observation ─────────────────────────────────────────────────────────────────────────────────────
const ROWS = `SELECT qi.id, qi.answered, qi.user_answer, qi.was_correct, qi.repeat_count, qi.answered_at::text AS answered_at,
    q.metadata, (q.metadata ? 'learning_step') AS course, (to_jsonb(qi) ->> 'parked_at') IS NOT NULL AS parked
  FROM public.question_instances qi JOIN public.questions q ON q.id = qi.question_id WHERE qi.student_id = $1 ORDER BY qi.id`;
const snapshot = async (db, p) => {
  const rows = await db.q(ROWS, [p]);
  const prog = (await db.q("SELECT xp, coins FROM public.student_progress WHERE student_id = $1", [p]))[0];
  const history = historyFromRows(rows.filter((r) => r.course).map((r) => ({ ...r, questions: { metadata: r.metadata } })));
  return { rows, xp: Number(prog.xp), coins: Number(prog.coins), step: JSON.stringify(nextStep(history, Date.now())) };
};
const answer = (db, p, i) => as(db, "service_role", null, "SELECT public.process_question_attempt($1, $2, 'a', 0) AS r", [p, i]);

/** One pupil under one Edge version and flag set: the problems a pupil or their data would meet. */
async function observe(db, handler, pupilType, c, flags) {
  const t = PUPILS[pupilType];
  const p = await newPupil(db);
  await t.seed(db, p, c);
  const before = await snapshot(db, p);
  const res = await request(handler, db, p, { flags, body: { subject: t.subject } });
  const problems = [];
  if (res.status >= 500) problems.push(`serverfejl ${res.status}`);
  const served = res.body?.question_instance_id ?? null;
  const reason = res.body?.reason ?? res.body?.error ?? null;
  if (served) {
    const row = (await db.q(ROWS, [p])).find((r) => r.id === served);
    if (row?.course) problems.push("kursusopgave i almindelig quiz");
    const mid = await snapshot(db, p);
    try { await answer(db, p, served); } catch (e) { problems.push(`svar afvist (${e.code ?? e.message})`); }
    const once = await snapshot(db, p);
    if (once.xp <= mid.xp) problems.push("ingen belønning for korrekt svar");
    await answer(db, p, served).catch(() => {});
    const twice = await snapshot(db, p);
    if (twice.xp !== once.xp || twice.coins !== once.coins) problems.push("dobbelt belønning");
  } else if (t.canBeServed) {
    problems.push(`fastlåst (${reason ?? res.body?.step ?? res.status})`);
  }
  const after = await snapshot(db, p);
  const byId = new Map(after.rows.map((r) => [r.id, r]));
  for (const r of before.rows) {
    const now = byId.get(r.id);
    if (!now) { problems.push(r.course ? (r.answered ? "kursussvar slettet" : "åben kursusrunde slettet") : "runde slettet"); continue; }
    if (r.course && r.answered && (!now.answered || now.user_answer !== r.user_answer || now.repeat_count !== r.repeat_count)) problems.push("kursussvar genåbnet");
    if (r.parked && (now.answered || !now.parked)) problems.push(now.answered ? "parkeret runde lukket" : "parkeret runde genoptaget uden for kurset");
    if (!r.course && r.answered && now.repeat_count === r.repeat_count && (now.user_answer !== r.user_answer || !now.answered)) problems.push("svar tabt");
  }
  if (t.course && after.step !== before.step) problems.push("kursusforløbet flyttet");
  return { problems: [...new Set(problems)].sort(), status: res.status, reason, logs: res.logs };
}

// ── The matrix: scenario 1 (no course content) and 2 (course content), every Edge × DB state × LEVEL_ENGINE ──────
const STAGES = ["DB0", "DB1", "DB2", "DB2↓", ...(F8 ? ["DB3"] : [])];
const LEVELS = [undefined, "v1"];
const cellKey = (scenario, edge, stage, level) => `${scenario}|${edge}|${stage}|${level ?? "-"}`;
// EXPECTED problems per cell and pupil type (only cells with a problem are listed; every other cell must be clean).
// The reasons are in docs/operations/laerligverse-rollback-matrix.md.
const COURSE_IN_QUIZ = "kursusopgave i almindelig quiz";
const STUCK = "fastlåst (course_round_open)";
const EXPECTED = {};
const expect = (scenario, edges, stages, levels, pupil, problems) => {
  for (const e of edges) for (const s of stages) for (const l of levels) {
    const k = cellKey(scenario, e, s, l);
    EXPECTED[k] ??= {};
    EXPECTED[k][pupil] = [...new Set([...(EXPECTED[k][pupil] ?? []), ...problems])].sort();
  }
};
// Reviewed against the observed behaviour; the reason for each is in docs/operations/laerligverse-rollback-matrix.md.
const S2 = "2-med-kursusindhold";
const PRE_F8 = ["DB0", "DB1", "DB2", "DB2↓"];
const ALL = [...PRE_F8, ...(F8 ? ["DB3"] : [])];
const AFTER_D383 = ["DB1", "DB2", "DB2↓", ...(F8 ? ["DB3"] : [])];
const BOTH = [undefined, "v1"];
// #739, #740's candidate and this tree with parking OFF behave identically in every cell (F8 off = D-383's behaviour).
const NEW_EDGES = ["d383", "c740", "tree"];
const S1 = "1-uden-kursusindhold";
const NO_COLUMN = "fastlåst (column t.activation_no does not exist)";
const E500 = "serverfejl 500";
const MOVED = "kursusforløbet flyttet";
const REOPENED = "kursussvar genåbnet";
const EXPECTED_RULES = [
  // Scenario 1 (no course content): every combination is clean — nothing listed.
  // Production's Edge (a7450b0f) knows no course items: it serves them, and an open course round, to the ordinary quiz;
  // the pupil's answer there moves the course sequence (nextStep counts it).
  [S2, ["prod"], ALL, BOTH, "B", [COURSE_IN_QUIZ, MOVED]],
  [S2, ["prod"], ["DB0"], BOTH, "B2", ["åben kursusrunde slettet"]],          // DB0's subject-switch release deletes it
  [S2, ["prod"], AFTER_D383, BOTH, "B2", [COURSE_IN_QUIZ, MOVED]],          // D-383 keeps it; old Edge then serves it
  [S2, ["prod"], ["DB0"], BOTH, "R", [COURSE_IN_QUIZ]],
  [S2, ["prod"], ["DB0"], BOTH, "C", [COURSE_IN_QUIZ]],
  [S2, ["prod"], ["DB0"], BOTH, "C2", [COURSE_IN_QUIZ, MOVED, REOPENED]],  // DB0's repeat body reopens the course answer
  [S2, ["prod"], AFTER_D383, [undefined], "R", [COURSE_IN_QUIZ]],          // classic route: shared candidates
  [S2, ["prod"], AFTER_D383, [undefined], "C", [COURSE_IN_QUIZ]],          // (LEVEL_ENGINE=v1: D-383's level filter holds)
  // #739 and #740 Edge behave identically in every cell. On a database WITHOUT D-383 (Edge first) data is destroyed:
  [S2, NEW_EDGES, ["DB0"], BOTH, "B2", ["åben kursusrunde slettet"]],
  [S2, NEW_EDGES, ["DB0"], BOTH, "C2", [MOVED, REOPENED]],
  [S2, NEW_EDGES, ["DB0"], BOTH, "R", ["fastlåst (no_questions)"]],        // DB0's repeat sees the unserved course item as pool
  // F8 (open, D-384): an open course round blocks the ordinary quiz in every subject until it is finished in the course.
  [S2, NEW_EDGES, ALL, BOTH, "B", [STUCK]],
  [S2, NEW_EDGES, AFTER_D383, BOTH, "B2", [STUCK]],
  // F8 with LAERLIGVERSE_COURSE_PARKING=on on a database WITHOUT its migration: every request fails loud (the due read
  // names activation_no) — nothing served, nothing changed (B2 on DB0: DB0's own subject-switch release, as above).
  // This is why the flag must follow the migration (deployment gate, D-384). On DB3 every pupil type is clean —
  // including B and B2, which D-383 leaves stuck, and the parked types P, P2, PO.
  ...(F8 ? [
    [S1, ["f8on"], PRE_F8, BOTH, "A", [NO_COLUMN, E500]],
    [S1, ["f8on"], PRE_F8, BOTH, "R", [NO_COLUMN, E500]],
    ...["A", "R", "B", "B2", "D", "F"].map((t) => [S2, ["f8on"], PRE_F8, BOTH, t, [NO_COLUMN, E500]]),
    [S2, ["f8on"], ["DB0"], BOTH, "B2", ["åben kursusrunde slettet"]],
    [S2, ["f8on"], PRE_F8, BOTH, "C", [E500]],
    [S2, ["f8on"], PRE_F8, BOTH, "C2", [E500]],
  ] : []),
  // The parked types P, P2, PO (DB3 only): CLEAN under every version in the ordinary quiz — next_review_at = 'infinity'
  // hides the round from every due loop, the partial index lets a new ordinary round in, release and repeats are F8's
  // database bodies. (What older versions do in the COURSE is scenario 3.)
];
for (const r of EXPECTED_RULES) expect(...r);

const OBSERVED = {};
for (const scenario of ["1-uden-kursusindhold", "2-med-kursusindhold"]) {
  const withCourse = scenario.startsWith("2");
  for (const stage of STAGES) {
    test(`scenario ${scenario}, ${stage}: every Edge version × LEVEL_ENGINE on the pupils' rows`, async () => {
      seq = 0;
      const db = await database(stage);
      try {
        const c = await content(db, withCourse);
        for (const e of EDGES) {
          if (!handlers[e.key]) continue;
          for (const level of LEVELS) {
            const k = cellKey(scenario, e.key, stage, level);
            OBSERVED[k] = {};
            for (const pupilType of Object.keys(PUPILS)) {
              if (PUPILS[pupilType].course && !withCourse) continue;
              if (PUPILS[pupilType].f8 && stage !== "DB3") continue;
              const o = await observe(db, handlers[e.key], pupilType, c, { LEVEL_ENGINE: level, ...edgeFlags(e) });
              if (o.problems.length) OBSERVED[k][pupilType] = o.problems;
            }
          }
        }
      } finally { await db.end(); }
      if (process.env.ROLLBACK_MATRIX_PRINT === "1") console.error("OBSERVED", stage, scenario, JSON.stringify(Object.fromEntries(Object.entries(OBSERVED).filter(([k]) => k.startsWith(scenario) && k.includes(`|${stage}|`)))));
      for (const e of EDGES) {
        if (!handlers[e.key]) continue;
        for (const level of LEVELS) {
          const k = cellKey(scenario, e.key, stage, level);
          assert.deepEqual(OBSERVED[k], EXPECTED[k] ?? {}, `${k}: observed problems differ from the reviewed matrix`);
        }
      }
    });
  }
}

test("DB2↓: the down script restores exactly DB1's catalog (every public function: signature, body, security, ACL, comment)", async () => {
  const db1 = await database("DB1");
  const down = await database("DB2↓");
  try {
    assert.deepEqual(await down.q(CATALOG), await db1.q(CATALOG));
    // …and it refuses to run twice (its guard), changing nothing.
    const before = await down.q(CATALOG);
    await assert.rejects(applyDown(down), /COURSE_SCOPE_DOWN/);
    assert.deepEqual(await down.q(CATALOG), before);
    // Roll forward again: 20261123100000 accepts the restored bodies (its own guard) and DB2 is back.
    await down.x(readMigration(M2));
    const db2 = await database("DB2");
    try { assert.deepEqual(await down.q(CATALOG), await db2.q(CATALOG)); } finally { await db2.end(); }
  } finally { await db1.end(); await down.end(); }
});

test("DB2↓ with this tree: the old signature is met by exactly one fallback per candidate call, logged", async () => {
  const db = await database("DB2↓");
  try {
    const c = await content(db, true);
    const p = await newPupil(db);
    const r = await request(handlers.tree, db, p, {});
    assert.equal(r.status, 200);
    assert.ok(r.logs.some((l) => l.includes("COURSE_SCOPE_FALLBACK")), "the fallback is logged");
    const served = (await db.q(ROWS, [p])).find((x) => x.id === r.body.question_instance_id);
    assert.equal(served.course, false, "even on the old signature the tree serves no course item");
    assert.ok(c.ordinary.length);
  } finally { await db.end(); }
});

// ── Scenario 3 (F8): back in the course after a rollback — parked rounds made by F8's own RPC, every Edge version ──────
// Each version gets the course request (the Lærligverse flags on) of a pupil whose course round is PARKED, and then the
// F8 function (parking on) gets the next request (roll-forward). Observed per version: what is served, what happens to
// the parked round, and whether the course can still be finished with it. EXPECTED_RETURN holds the reviewed outcome.
const LV_FLAGS = { LAERLIGVERSE_OBJECTIVE_TARGETING: "on", LAERLIGVERSE_SEQUENCE: "on", LAERLIGVERSE_SERVED_MODE: "on", LAERLIGVERSE_HINTS: "on" };
const COURSE_BODY = { subject: "historie", learning_objective: "vikings", sequence: true };
// Reviewed 2026-11-24 (docs/operations/laerligverse-rollback-matrix.md, "Tilbage i kurset"):
//   * production's a7450b0f knows no sequence: it serves an ORDINARY task in the course request; the parked round is
//     untouched; F8 then answers 409 open_question_other_step until that ordinary round is answered (it is due in the
//     ordinary quiz) — a temporary block, nothing lost.
//   * #739, #740 and F8 with parking off: the course request finds no candidate (the parked question has an instance)
//     and their lost-race read counts the PARKED row as "open" → 409 open_question_exists: the course is unavailable,
//     nothing changes; F8 (parking on) then resumes the same round.
//   * F8 with parking on: the same round is resumed.
const EXPECTED_RETURN = {
  prod: ["almindelig opgave i kurset", "F8 derefter: open_question_other_step"],
  d383: ["intet serveret (open_question_exists)", "F8 genoptager derefter den parkerede"],
  c740: ["intet serveret (open_question_exists)", "F8 genoptager derefter den parkerede"],
  tree: ["intet serveret (open_question_exists)", "F8 genoptager derefter den parkerede"],
  f8on: ["samme runde genoptaget", "F8 genoptager derefter den parkerede"],
};
test("scenario 3 (after F8): a pupil with a PARKED course round returns to the course — per Edge version, then F8 takes over",
  { skip: !F8 && "F8 (D-384) is not in this tree: activated automatically when a migration adding parked_at lands" }, async () => {
    seq = 0;
    const db = await database("DB3");
    const observed = {};
    try {
      const c = await content(db, true);
      for (const e of EDGES) {
        if (!handlers[e.key]) continue;
        const p = await newPupil(db);
        const parkedId = await round(db, p, c.course.guided_practice, { daysAgo: 0 });
        await park(db, p);
        const before = await snapshot(db, p);
        const r = await request(handlers[e.key], db, p, { flags: { ...LV_FLAGS, ...edgeFlags(e) }, body: COURSE_BODY });
        const mid = await snapshot(db, p);
        const parkedNow = mid.rows.find((x) => x.id === parkedId);
        const servedId = r.body?.question_instance_id ?? null;
        const outcome = [];
        if (r.status >= 500) outcome.push(`serverfejl ${r.status}`);
        if (!parkedNow) outcome.push("parkeret runde slettet");
        else if (parkedNow.answered) outcome.push("parkeret runde lukket");
        if (servedId === parkedId) outcome.push("samme runde genoptaget");
        else if (servedId) outcome.push(mid.rows.find((x) => x.id === servedId)?.course ? "ny kursusrunde ved siden af den parkerede" : "almindelig opgave i kurset");
        else outcome.push(`intet serveret (${r.body?.error ?? r.body?.reason ?? r.body?.step ?? r.status})`);
        if (mid.step !== before.step) outcome.push("kursusforløbet flyttet");
        // Roll-forward: F8 with parking on gets the next course request. Can the pupil finish the course step?
        const fwd = await request(handlers.tree, db, p, { flags: { ...LV_FLAGS, LAERLIGVERSE_COURSE_PARKING: "on" }, body: COURSE_BODY });
        const fwdId = fwd.body?.question_instance_id ?? null;
        if (fwdId === parkedId) outcome.push("F8 genoptager derefter den parkerede");
        else if (fwdId) outcome.push("F8 serverer derefter en anden kursusrunde");
        else outcome.push(`F8 derefter: ${fwd.body?.error ?? fwd.body?.reason ?? fwd.status}`);
        observed[e.key] = outcome;
      }
    } finally { await db.end(); }
    if (process.env.ROLLBACK_MATRIX_PRINT === "1") console.error("OBSERVED_RETURN", JSON.stringify(observed));
    for (const [k, v] of Object.entries(observed)) assert.deepEqual(v, EXPECTED_RETURN[k], `${k}: the return-to-course outcome differs from the reviewed one`);
  });

// ── Scenario 4: roll-forward on ONE database, the real transition chain ───────────────────────────────────
test("scenario 4 (roll-forward): production Edge on DB0 → M1 → M2 → this tree; every pupil keeps answers, rewards and course step",
  { skip: !handlers.prod && "a7450b0f is not in this checkout" }, async () => {
    seq = 0;
    const db = await database("DB0");
    try {
      const c = await content(db, true);
      const pupils = {};
      for (const t of ["A", "D", "F"]) { pupils[t] = await newPupil(db); await PUPILS[t].seed(db, pupils[t], c); }
      // Production acts first: each pupil answers what production serves (whatever it is: that is today's reality).
      for (const p of Object.values(pupils)) {
        const r = await request(handlers.prod, db, p, { flags: { LEVEL_ENGINE: "v1" } });
        if (r.body?.question_instance_id) await answer(db, p, r.body.question_instance_id);
      }
      const mid = {};
      for (const [t, p] of Object.entries(pupils)) mid[t] = await snapshot(db, p);
      await db.x(readMigration(M1));
      await db.x(readMigration(M2));
      for (const [t, p] of Object.entries(pupils)) {
        const r = await request(handlers.tree, db, p, { flags: { LEVEL_ENGINE: "v1" } });
        const after = await snapshot(db, p);
        for (const row of mid[t].rows.filter((x) => x.answered)) {
          const now = after.rows.find((x) => x.id === row.id);
          assert.ok(now?.answered && now.user_answer === row.user_answer, `${t}: an answer given before the roll-forward is kept`);
        }
        assert.equal(after.step, mid[t].step, `${t}: the course step is unchanged by the roll-forward`);
        assert.ok(after.xp >= mid[t].xp && after.coins >= mid[t].coins, `${t}: no reward is lost`);
        if (r.body?.question_instance_id) {
          const served = after.rows.find((x) => x.id === r.body.question_instance_id);
          assert.equal(served?.course ?? false, false, `${t}: after the roll-forward no course item reaches the ordinary quiz`);
        }
      }
    } finally { await db.end(); }
  });

// ── Scenario 5: the Lærligverse flags switched off (temporary deactivation) ─────────────────────────────────
const LV_ON = { LAERLIGVERSE_OBJECTIVE_TARGETING: "on", LAERLIGVERSE_SEQUENCE: "on", LAERLIGVERSE_SERVED_MODE: "on", LAERLIGVERSE_HINTS: "on" };
test("scenario 5 (flags off): with an open course round the ordinary quiz answers course_round_open — STUCK until F8; with the flags ON the pupil can finish the round in the course", async () => {
  seq = 0;
  // With F8 in the tree: on F8's database (its flag needs its migration — see the f8on cells of the matrix).
  const db = await database(F8 ? "DB3" : "DB2");
  try {
    const c = await content(db, true);
    const p = await newPupil(db);
    const open = await round(db, p, c.course.guided_practice, { daysAgo: 0 });
    const before = await snapshot(db, p);
    // Off (every LAERLIGVERSE_* unset): no path serves the course round, and the ordinary quiz refuses → stuck.
    const parkingKnown = readFileSync(TREE_INDEX, "utf8").includes("parked_at");
    // F8: the safety version = parking ON with every Lærligverse flag off. (Parking off is D-383's behaviour: stuck.)
    const safety = parkingKnown ? { LAERLIGVERSE_COURSE_PARKING: "on" } : {};
    const off = await request(handlers.tree, db, p, { flags: safety, body: { subject: "historie" } });
    // The pupil works: answers what was served (with F8 an ordinary task), then switches subject and answers again.
    if (parkingKnown && off.body?.question_instance_id) await answer(db, p, off.body.question_instance_id);
    const offEng = await request(handlers.tree, db, p, { flags: safety, body: { subject: "engelsk" } });
    if (parkingKnown && offEng.body?.question_instance_id) await answer(db, p, offEng.body.question_instance_id);
    if (!parkingKnown) {
      assert.equal(off.body?.reason, "course_round_open", "DETECTED (F8): flags off + open course round = no ordinary task");
      assert.equal(offEng.body?.reason, "course_round_open", "DETECTED (F8): no other subject either");
    } else {
      assert.ok(off.body?.question_instance_id && offEng.body?.question_instance_id, "F8: the ordinary quiz serves while the round is parked");
    }
    // Nothing was lost while blocked: the round is still open and the course step unchanged.
    const mid = await snapshot(db, p);
    assert.ok(mid.rows.some((r) => r.id === open && !r.answered), "the open course round is kept (parked with F8)");
    if (parkingKnown) assert.equal(mid.rows.find((r) => r.id === open).parked, true, "F8: it waits parked, not deleted or closed");
    assert.equal(mid.step, before.step);
    // On: the course request resumes the SAME round in its step.
    const on = await request(handlers.tree, db, p, { flags: { ...LV_ON, ...safety }, body: { subject: "historie", learning_objective: "vikings", sequence: true } });
    assert.equal(on.status, 200, on.text.slice(0, 200));
    assert.equal(on.body?.question_instance_id, open, "the course resumes the same instance");
  } finally { await db.end(); }
});

// ── Scenario 6: emergency stop (course questions deactivated; flags off) ─────────────────────────────────────
test("scenario 6 (emergency stop): deactivating course questions frees an open course round (D-316), keeps every course answer and the step", async () => {
  seq = 0;
  const db = await database("DB2");
  try {
    const c = await content(db, true);
    const results = {};
    for (const t of ["B", "B2", "D"]) {
      const p = await newPupil(db);
      await PUPILS[t].seed(db, p, c);
      results[t] = { p, before: await snapshot(db, p) };
    }
    await db.q("UPDATE public.questions SET is_active = false WHERE metadata ? 'learning_step'");
    for (const e of EDGES) {
      if (!handlers[e.key]) continue;
      for (const [t, { p, before }] of Object.entries(results)) {
        const r = await request(handlers[e.key], db, p, { body: { subject: PUPILS[t].subject } });
        const after = await snapshot(db, p);
        assert.ok(r.body?.question_instance_id, `${e.label} ${t}: an ordinary task is served (${r.text.slice(0, 120)})`);
        const served = after.rows.find((x) => x.id === r.body.question_instance_id);
        assert.equal(served.course, false, `${e.label} ${t}: no course item`);
        for (const row of before.rows.filter((x) => x.answered)) {
          assert.ok(after.rows.some((x) => x.id === row.id && x.answered && x.user_answer === row.user_answer), `${e.label} ${t}: course answers kept`);
        }
        assert.equal(after.step, before.step, `${e.label} ${t}: the course step is unchanged (an unanswered round never counted)`);
        await answer(db, p, served.id);
      }
    }
  } finally { await db.end(); }
});

// ── Scenario 6b (F8): the emergency stop on a database with PARKED rounds — what exactly happens ─────────────────────
// Deactivating the course questions makes D-316's release (F8's body) treat a parked course round as inactive: a
// first-round row (repeat_count 0, the only kind a course round has since D-383) is DELETED — the unanswered round is
// gone with everything stored on it (presentation, served mode, snapshot; hints where L3 is applied). Answered course
// rounds and the course step are kept. So the emergency stop is NOT lossless for unanswered course work.
test("scenario 6b (after F8): emergency stop with parked rounds — every version: the unanswered parked round is DELETED; answers and step kept",
  { skip: !F8 && "F8 (D-384) is not in this tree" }, async () => {
    seq = 0;
    const db = await database("DB3");
    try {
      const c = await content(db, true);
      const pupils = [];
      for (const e of EDGES) {
        if (!handlers[e.key]) continue;
        const p = await newPupil(db);
        await round(db, p, c.course.guided_practice, { answered: true, daysAgo: 2 });
        const parked = await round(db, p, c.course.independent_application, { daysAgo: 0 });
        await park(db, p);
        pupils.push({ e, p, parked, before: await snapshot(db, p) });
      }
      await db.q("UPDATE public.questions SET is_active = false WHERE metadata ? 'learning_step'");
      for (const { e, p, parked, before } of pupils) {
        const r = await request(handlers[e.key], db, p, { flags: edgeFlags(e), body: { subject: "historie" } });
        const after = await snapshot(db, p);
        assert.ok(r.body?.question_instance_id, `${e.label}: an ordinary task is served (${r.text.slice(0, 120)})`);
        assert.equal(after.rows.find((x) => x.id === r.body.question_instance_id)?.course, false, `${e.label}: no course item`);
        assert.equal(after.rows.some((x) => x.id === parked), false, `${e.label}: the unanswered parked round is DELETED (not lossless)`);
        for (const row of before.rows.filter((x) => x.answered)) {
          assert.ok(after.rows.some((x) => x.id === row.id && x.answered && x.user_answer === row.user_answer), `${e.label}: course answers kept`);
        }
        assert.equal(after.step, before.step, `${e.label}: the course step is unchanged (the deleted round never counted)`);
      }
    } finally { await db.end(); }
  });

// ── The document carries the same matrix ───────────────────────────────────────────────────────────────────
test("docs/operations/laerligverse-rollback-matrix.md carries exactly this matrix", () => {
  const complete = EDGES.every((e) => handlers[e.key]);
  if (!complete) return; // a shallow checkout sees only part of the matrix; the full run (locally, or the rollback job) checks the doc
  const lines = [];
  for (const key of Object.keys(OBSERVED).sort()) {
    const [scenario, edge, stage, level] = key.split("|");
    const cell = OBSERVED[key];
    const verdict = Object.keys(cell).length === 0 ? "SIKKER" : "USIKKER: " + Object.entries(cell).map(([p, v]) => `${p}: ${v.join(", ")}`).join("; ");
    lines.push(`| ${scenario} | ${EDGES.find((e) => e.key === edge).label} | ${stage} | ${level} | ${verdict} |`);
  }
  const table = ["| Scenarie | Edge | Database | LEVEL_ENGINE | Udfald (elevtype: problem) |", "|---|---|---|---|---|", ...lines].join("\n");
  const doc = existsSync(DOC) ? readFileSync(DOC, "utf8") : "";
  const re = /(<!-- MATRIX:START -->\n)[\s\S]*?(\n<!-- MATRIX:END -->)/;
  if (process.env.UPDATE_ROLLBACK_MATRIX_DOC === "1") {
    assert.match(doc, re, "the doc has the MATRIX markers");
    writeFileSync(DOC, doc.replace(re, `$1${table}$2`));
    return;
  }
  assert.equal(re.exec(doc)?.[0].split("\n").slice(1, -1).join("\n"), table, "run with UPDATE_ROLLBACK_MATRIX_DOC=1 after reviewing a change");
});
