// RUNTIME proof for D-383's migration 20261120150000_course_items_out_of_ordinary_quiz.sql: course items
// (questions.metadata has the key learning_step, D-338) are kept out of the ordinary quiz's level candidates and its
// three backend repeat functions. The file is executed UNMODIFIED on PGlite, on top of production's answer chain
// (helpers/answer-chain-schema.mjs pins every md5) plus D-280 part 1 (20261031194600, applied in production as
// 20261101101401), which is exactly the state production holds. Pupils, questions and every id are synthetic.
//
// What it proves:
//   * the guard: it accepts production's bodies and its own (a re-run), and refuses any other body with zero changes;
//   * the diff: each new body is the old body plus exactly the D-383 lines — no other change;
//   * question_is_course_item is the same rule as get-next-question's scope.ts isCourseItem, value for value;
//   * level candidates: a levelled course item is never a candidate (fast path and fallback); the ordinary candidates
//     and their order are unchanged;
//   * repeats (all three): a course round is never reopened; an unserved course item does not block repeats; an
//     ordinary round is reopened exactly as before (answered → false, repeat_count + 1, lost race → NULL);
//   * EXECUTE on the new helper: service_role only.
//
// HONEST LIMITS: PGlite is PostgreSQL 18.x and runs as superuser; calls run under SET ROLE service_role, as
// get-next-question's admin client does. The production bodies are the repository's (applied in production per
// replay-plan.mjs APPLIED_IN_PRODUCTION; the guard refuses anything else). Passing is not permission to apply:
// production needs its own owner authorisation (D-110, apply_migration only).
import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { answerChainSql, extractFunction, readMigration } from "./helpers/answer-chain-schema.mjs";
import { isCourseItem } from "../../supabase/functions/get-next-question/scope.ts";
import { NOT_IN_PRODUCTION, TEST_PROFILES } from "../isolated/schema/replay-plan.mjs";

const FILE = "20261120150000_course_items_out_of_ordinary_quiz.sql";
const D280 = "20261031194600_mc_length_cue_answer_paths.sql";
const D316 = "20261102100000_release_open_rounds_on_inactive_questions.sql";
const MIGRATION = readMigration(FILE);
const GUARD = JSON.parse(/expected CONSTANT jsonb := '([\s\S]*?)';/.exec(MIGRATION)[1]);

const LEVEL = "public.get_level_questions_for_student(uuid,integer,text[],integer)";
const R1 = "public.request_repeat_question_for_student(uuid,smallint,text[])";
const R2 = "public.request_repeat_question_servable_for_student(uuid,smallint,text[])";
const R3 = "public.request_repeat_level_question_for_student(uuid,text[])";
const REL = "public.release_open_question_outside(text[])";
const ORIGIN = {
  get_level_questions_for_student: "20261029120000_difficulty_scale_b.sql",
  request_repeat_question_for_student: D280,
  request_repeat_question_servable_for_student: D280,
  request_repeat_level_question_for_student: D280,
};

const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const DOMAIN = "vikings";
const lit = (v) => `'${JSON.stringify(v).replace(/'/g, "''")}'`;
const mc = (q) => ({ question: q, options: ["a", "b"], correct: "a" });

async function productionDb() {
  const db = new PGlite();
  for (const sql of answerChainSql()) await db.exec(sql);
  await db.exec(readMigration(D280));
  await db.exec(readMigration(D316)); // applied in production as 20261102123618
  return db;
}
const md5Of = async (db, sig) => (await db.query("SELECT md5(prosrc) AS h FROM pg_proc WHERE oid = to_regprocedure($1)", [sig])).rows[0]?.h ?? null;
async function as(db, role, sql, params = []) {
  await db.exec(`SET ROLE ${role}`);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("RESET ROLE"); }
}
let nextPupil = 100;
async function addPupil(db) {
  const id = uid(nextPupil++);
  await db.exec(`INSERT INTO auth.users VALUES ('${id}');
    INSERT INTO public.profiles (id, role, selected_grade) VALUES ('${id}', 'student', 6);`);
  return id;
}
let nextQ = 9000;
async function addQuestion(db, { metadata = {}, level = 1000, active = true } = {}) {
  const id = uid(nextQ++);
  await db.exec(`INSERT INTO public.questions (id, type, content, metadata, difficulty, is_active, question_type, learning_objective,
      answer_format, answer_type, target_grade, difficulty_band, difficulty_level)
    VALUES ('${id}', 'mc_single', ${lit(mc("Q " + id))}::jsonb, ${lit(metadata)}::jsonb, 1, ${active}, 'auto', '${DOMAIN}', 'mc', 'short', 5, 1, ${level === null ? "NULL" : level});`);
  return id;
}
async function instance(db, pupil, question, { answered = true, wasCorrect = false } = {}) {
  return (await db.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, answered,
      answered_at, was_correct, user_answer, repeat_count, next_review_at)
    VALUES ($1, $2, 'a', $3, CASE WHEN $3 THEN now() - interval '1 day' END, $4, CASE WHEN $3 THEN 'b' END, 0, now()) RETURNING id`,
    [pupil, question, answered, answered ? wasCorrect : null])).rows[0].id;
}
const row = async (db, id) => (await db.query("SELECT answered, repeat_count, user_answer FROM public.question_instances WHERE id = $1", [id])).rows[0];
const REPEATS = [
  ["request_repeat_question_for_student", (p) => ["SELECT public.request_repeat_question_for_student($1, 6::smallint, $2) AS id", [p, [DOMAIN]]]],
  ["request_repeat_question_servable_for_student", (p) => ["SELECT public.request_repeat_question_servable_for_student($1, 6::smallint, $2) AS id", [p, [DOMAIN]]]],
  ["request_repeat_level_question_for_student", (p) => ["SELECT public.request_repeat_level_question_for_student($1, $2) AS id", [p, [DOMAIN]]]],
];
const repeat = async (db, call, pupil) => (await as(db, "service_role", ...call(pupil)))[0].id;

test("bookkeeping: NOT_IN_PRODUCTION, replayed only in the introduction lane", () => {
  assert.match(NOT_IN_PRODUCTION[FILE], /D-383, not applied in production/);
  assert.ok(TEST_PROFILES.introduction[FILE], "the introduction lane replays it");
  assert.equal(TEST_PROFILES.k1[FILE], undefined);
  assert.match(MIGRATION, /IKKE anvendt i produktion/);
});

test("the guard names production's bodies [before] and this migration's [after]", async () => {
  const db = await productionDb();
  for (const sig of [LEVEL, R1, R2, R3, REL]) assert.equal(await md5Of(db, sig), GUARD[sig][0], `${sig}: production's body`);
  await db.exec(MIGRATION);
  for (const sig of [LEVEL, R1, R2, R3, REL]) assert.equal(await md5Of(db, sig), GUARD[sig][1], `${sig}: this migration's body`);
  await db.exec(MIGRATION); // a re-run is accepted and changes nothing
  for (const sig of [LEVEL, R1, R2, R3, REL]) assert.equal(await md5Of(db, sig), GUARD[sig][1]);
});

test("the guard refuses a drifted body, and nothing changes", async () => {
  const db = await productionDb();
  const before = {};
  for (const sig of [LEVEL, R1, R2, R3, REL]) before[sig] = await md5Of(db, sig);
  // Drift one of the four (a harmless comment changes prosrc).
  await db.exec(extractFunction(D280, "request_repeat_level_question_for_student").replace("BEGIN\n", "BEGIN\n  -- drift\n"));
  const drifted = await md5Of(db, R3);
  assert.notEqual(drifted, before[R3]);
  await assert.rejects(db.exec(MIGRATION), /COURSE_ITEMS: public\.request_repeat_level_question_for_student\(uuid,text\[\]\) er ændret/);
  for (const sig of [LEVEL, R1, R2]) assert.equal(await md5Of(db, sig), before[sig], `${sig} untouched`);
  assert.equal(await md5Of(db, R3), drifted);
  assert.equal((await db.query("SELECT to_regprocedure('public.question_is_course_item(jsonb)') AS f")).rows[0].f, null, "no helper created");
});

test("each new body is the old body plus exactly the D-383 lines (code compared without comments)", () => {
  // Comments may be reworded; code may not change except for the added predicate.
  const code = (sql) => sql.replace(/^CREATE\s+(OR\s+REPLACE\s+)?FUNCTION/i, "CREATE OR REPLACE FUNCTION").split("\n")
    .map((l) => l.replace(/\s+--.*$/, "").replace(/^\s*--.*$/, "")).filter((l) => l.trim() !== "");
  const ADDED = "AND NOT public.question_is_course_item(q.metadata)";
  for (const [name, origin] of Object.entries(ORIGIN)) {
    const oldCode = code(extractFunction(origin, name));
    const newCode = code(extractFunction(FILE, name));
    const added = newCode.filter((l) => l.trim() === ADDED);
    assert.equal(added.length, 2, `${name}: the predicate in exactly two places`);
    assert.deepEqual(newCode.filter((l) => l.trim() !== ADDED), oldCode, `${name}: no other code change`);
  }
});

test("question_is_course_item is scope.ts isCourseItem, value for value", async () => {
  const db = await productionDb();
  await db.exec(MIGRATION);
  const cases = [
    [{ learning_step: "guided_practice" }, true], [{ learning_step: "nonsense" }, true], [{ learning_step: null }, true],
    [{ learning_step: 3 }, true], [{ other: 1, learning_step: "transfer" }, true],
    [{}, false], [{ step: "guided_practice" }, false], [{ nested: { learning_step: "x" } }, false],
    [["learning_step"], false], ["learning_step", false], [null, false], [3, false], [true, false],
  ];
  for (const [v, expected] of cases) {
    const r = (await as(db, "service_role", "SELECT public.question_is_course_item($1::jsonb) AS c", [JSON.stringify(v)]))[0].c;
    assert.equal(r, expected, `SQL ${JSON.stringify(v)}`);
    assert.equal(isCourseItem(v), expected, `TS ${JSON.stringify(v)}`);
  }
  assert.equal((await as(db, "service_role", "SELECT public.question_is_course_item(NULL) AS c"))[0].c, false, "SQL NULL");
  assert.equal(isCourseItem(undefined), false);
  assert.equal(isCourseItem(Object.create({ learning_step: "x" })), false, "an inherited key is not the row's");
});

test("EXECUTE on the helper: service_role only", async () => {
  const db = await productionDb();
  await db.exec(MIGRATION);
  const rows = (await db.query(`SELECT r.rolname, has_function_privilege(r.oid, 'public.question_is_course_item(jsonb)', 'EXECUTE') AS x
    FROM pg_roles r WHERE r.rolname IN ('anon', 'authenticated', 'service_role') ORDER BY 1`)).rows;
  assert.deepEqual(rows, [{ rolname: "anon", x: false }, { rolname: "authenticated", x: false }, { rolname: "service_role", x: true }]);
  // The replaced functions keep their EXECUTE, SECURITY, config and owner exactly (CREATE OR REPLACE).
  const before = await productionDb();
  const facts = async (d) => (await d.query(`SELECT p.oid::regprocedure::text AS f, p.prosecdef, p.proconfig::text AS cfg,
      has_function_privilege('anon', p.oid, 'EXECUTE') AS anon, has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth,
      has_function_privilege('service_role', p.oid, 'EXECUTE') AS svc, pg_get_userbyid(p.proowner) AS owner
    FROM pg_proc p WHERE p.oid = ANY (ARRAY[to_regprocedure($1), to_regprocedure($2), to_regprocedure($3), to_regprocedure($4), to_regprocedure($5)]::oid[]) ORDER BY 1`,
    [LEVEL, R1, R2, R3, REL])).rows;
  const was = await facts(before);
  assert.equal(was.length, 5);
  assert.deepEqual(await facts(db), was, "security, config, owner and EXECUTE of all five unchanged");
  assert.equal(was.find((r) => r.f.startsWith("release_open_question_outside")).auth, true, "the pupil's own release stays callable");
});

test("level candidates: a levelled course item is never a candidate; the ordinary candidates and their order are unchanged", async () => {
  const before = await productionDb();
  const after = await productionDb();
  await after.exec(MIGRATION);
  const ids = { ordinary: [], course: [] };
  for (const db of [before, after]) {
    nextQ = 9000;
    ids.ordinary = [await addQuestion(db, { level: 1000 }), await addQuestion(db, { level: 1010 }), await addQuestion(db, { level: 990 })];
    ids.course = [await addQuestion(db, { level: 1000, metadata: { learning_step: "guided_practice" } }), await addQuestion(db, { level: 1001, metadata: { learning_step: "transfer" } })];
  }
  nextPupil = 100;
  const p1 = await addPupil(before);
  nextPupil = 100;
  const p2 = await addPupil(after);
  assert.equal(p1, p2);
  const candidates = async (db, pupil, limit) =>
    (await as(db, "service_role", `SELECT id FROM public.get_level_questions_for_student($1, 1000, $2, ${limit})`, [pupil, [DOMAIN]])).map((r) => r.id);
  // The definition: production's full search (limit 50 holds everything here) without the course items.
  const full = await candidates(before, p1, 50);
  const expected = full.filter((id) => !ids.course.includes(id));
  assert.equal(expected.length, ids.ordinary.length);
  for (const limit of [50, 2]) { // 50: the fallback (fewer valid than the limit); 2: the fast path fills the limit
    const was = await candidates(before, p1, limit);
    const now = await candidates(after, p2, limit);
    assert.ok(ids.course.some((c) => was.includes(c)), `limit ${limit}: production's body serves a levelled course item (the gap)`);
    for (const c of ids.course) assert.equal(now.includes(c), false, `limit ${limit}: no course item`);
    assert.deepEqual(now, expected.slice(0, limit), `limit ${limit}: exactly the full search's first ordinary candidates, in its order`);
  }
});

for (const [name, call] of REPEATS) {
  test(`${name}: a course round is never reopened; an unserved course item does not block repeats; an ordinary round reopens as before`, async () => {
    // Production's body first: the gap this closes.
    const prod = await productionDb();
    const pp = await addPupil(prod);
    const pc = await addQuestion(prod, { metadata: { learning_step: "guided_practice" } });
    const pci = await instance(prod, pp, pc);
    assert.equal(await repeat(prod, call, pp), pci, "production's body reopens a course round for the ordinary quiz (the gap)");

    const db = await productionDb();
    await db.exec(MIGRATION);
    // 1. Only an answered course round: nothing is reopened, the round is untouched.
    const a = await addPupil(db);
    const course = await addQuestion(db, { metadata: { learning_step: "guided_practice" } });
    const ci = await instance(db, a, course);
    assert.equal(await repeat(db, call, a), null);
    assert.deepEqual(await row(db, ci), { answered: true, repeat_count: 0, user_answer: "b" });
    // 2. An answered ordinary round next to it, plus an UNSERVED course item: the ordinary round is reopened.
    const ordinary = await addQuestion(db);
    const oi = await instance(db, a, ordinary);
    await addQuestion(db, { metadata: { learning_step: "transfer" } }); // unserved course item: must not block
    assert.equal(await repeat(db, call, a), oi);
    assert.deepEqual(await row(db, oi), { answered: false, repeat_count: 1, user_answer: null });
    assert.deepEqual(await row(db, ci), { answered: true, repeat_count: 0, user_answer: "b" }, "the course round is still untouched");
    // 3. The guards are unchanged: an open round → NULL; an unserved ORDINARY question still blocks repeats.
    assert.equal(await repeat(db, call, a), null, "one open round: no new repeat");
    const b = await addPupil(db);
    const bi = await instance(db, b, ordinary);
    await addQuestion(db); // unserved ordinary question in scope
    assert.equal(await repeat(db, call, b), null, "an unserved ordinary question still comes first");
    assert.deepEqual(await row(db, bi), { answered: true, repeat_count: 0, user_answer: "b" });
  });
}

// ── Section 4: the subject switch (release_open_question_outside) never releases an active course round ──────────
test("release: the new body is D-316's with exactly the three release conditions extended", () => {
  const old = extractFunction(D316, "release_open_question_outside");
  const cond = /AND  \(q\.is_active IS NOT TRUE\n(\s+)OR q\.learning_objective IS NULL OR NOT \(q\.learning_objective = ANY \((p_domains|\$2)\)\)\)/g;
  let n = 0;
  const expected = old.replace(cond, (m, ind, arg) => {
    n++;
    return `AND  (q.is_active IS NOT TRUE\n${ind}OR ((q.learning_objective IS NULL OR NOT (q.learning_objective = ANY (${arg})))\n${ind}    AND NOT public.question_is_course_item(q.metadata)))`;
  });
  assert.equal(n, 3, "the closing UPDATE, the guarded UPDATE and the DELETE");
  assert.equal(extractFunction(FILE, "release_open_question_outside"), expected);
});

async function release(db, pupil, domains) {
  await db.exec(`SELECT set_config('test.uid', '${pupil}', false)`);
  await db.exec("SET ROLE authenticated");
  try { return (await db.query("SELECT public.release_open_question_outside($1) AS n", [domains])).rows[0].n; }
  finally { await db.exec("RESET ROLE"); await db.exec("SELECT set_config('test.uid', '', false)"); }
}
async function openRound(db, pupil, question, { repeat = 0 } = {}) {
  const id = await instance(db, pupil, question, { answered: false });
  if (repeat > 0) await db.query("UPDATE public.question_instances SET repeat_count = $2 WHERE id = $1", [id, repeat]);
  return id;
}
const exists = async (db, id) => (await db.query("SELECT answered, repeat_count, user_answer FROM public.question_instances WHERE id = $1", [id])).rows[0] ?? null;
const OTHER_SUBJECT = ["english"]; // the pupil switched subject: the course objective lies outside these domains

test("release: an open course round survives a subject switch (first round and reopened repeat); production's body loses it", async () => {
  for (const repeat of [0, 1]) {
    const prod = await productionDb();
    const pp = await addPupil(prod);
    const pq = await addQuestion(prod, { metadata: { learning_step: "guided_practice" } });
    const pid = await openRound(prod, pp, pq, { repeat });
    assert.equal(await release(prod, pp, OTHER_SUBJECT), 1, `production's body releases the course round (repeat ${repeat}) — the gap`);
    assert.notDeepEqual(await exists(prod, pid), { answered: false, repeat_count: repeat, user_answer: null });

    const db = await productionDb();
    await db.exec(MIGRATION);
    const p = await addPupil(db);
    const q = await addQuestion(db, { metadata: { learning_step: "guided_practice" } });
    const id = await openRound(db, p, q, { repeat });
    assert.equal(await release(db, p, OTHER_SUBJECT), 0);
    assert.deepEqual(await exists(db, id), { answered: false, repeat_count: repeat, user_answer: null }, `repeat ${repeat}: same row, still open`);
  }
});

test("release: an ordinary open round is released exactly as before; an INACTIVE course round is still released", async () => {
  const db = await productionDb();
  await db.exec(MIGRATION);
  const a = await addPupil(db);
  const ordinary = await addQuestion(db);
  const oid = await openRound(db, a, ordinary);
  assert.equal(await release(db, a, OTHER_SUBJECT), 1);
  assert.equal(await exists(db, oid), null, "a first ordinary round is deleted, as D-316");
  const b = await addPupil(db);
  const reopened = await openRound(db, b, ordinary, { repeat: 1 });
  assert.equal(await release(db, b, OTHER_SUBJECT), 1);
  assert.deepEqual(await exists(db, reopened), { answered: true, repeat_count: 1, user_answer: null }, "a reopened ordinary repeat is closed, as D-316");
  // An inactive course question can never be served again; its round must not block the pupil forever.
  const c = await addPupil(db);
  const gone = await addQuestion(db, { metadata: { learning_step: "transfer" }, active: false });
  const gid = await openRound(db, c, gone);
  assert.equal(await release(db, c, [DOMAIN]), 1, "released even inside the domains, as D-316");
  assert.equal(await exists(db, gid), null);
  // Inside the subject's domains an active course round is untouched, as before.
  const d = await addPupil(db);
  const course = await addQuestion(db, { metadata: { learning_step: "guided_practice" } });
  const cid = await openRound(db, d, course);
  assert.equal(await release(db, d, [DOMAIN]), 0);
  assert.deepEqual(await exists(db, cid), { answered: false, repeat_count: 0, user_answer: null });
});
