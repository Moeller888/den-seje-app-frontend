// RUNTIME proof for D-383's follow-up migration 20261123100000_course_scope_before_candidate_limit.sql: the two SHARED
// candidate RPCs filter course items BEFORE their limit (problem 3). The file is executed UNMODIFIED on PGlite on top of
// production's chain (helpers/answer-chain-schema.mjs pins every md5), get_unserved_questions_for_student from
// 20261016160000, D-280 part 1, D-316 and D-383 (20261120150000, which this one requires). Every id is synthetic.
//
// What it proves:
//   * the guard: D-383 first; production's bodies before, its own after (a re-run); anything else refused, no change;
//   * the bodies: production's plus exactly one predicate each; grants, owner, SECURITY, config and comment unchanged;
//   * a call WITHOUT p_course_scope (today's Edge Function) returns exactly what production returns;
//   * 'none': with 0, 49, 50, 51 and 100 course items ahead of the ordinary ones, every ordinary question that fits the
//     limit is returned and no course item — before, 50 or more course items left the ordinary quiz with nothing;
//   * a step id: only course items of that step (invalid tags and other steps never), also behind 100 other items;
//   * the v2 window: the same per group.
//
// HONEST LIMITS: PGlite is PostgreSQL 18.x and runs as superuser; calls run under SET ROLE service_role, as
// get-next-question's admin client does. PostgREST's resolution of named arguments against the new default parameter is
// proven by the isolated stack (introduction lane), not here. Passing is not permission to apply (D-110).
import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { answerChainSql, extractFunction, readMigration } from "./helpers/answer-chain-schema.mjs";
import { NOT_IN_PRODUCTION, TEST_PROFILES } from "../isolated/schema/replay-plan.mjs";
import { STEP_IDS } from "../../supabase/functions/_shared/learning-sequence.ts";

const FILE = "20261123100000_course_scope_before_candidate_limit.sql";
const MIGRATION = readMigration(FILE);
const D383 = "20261120150000_course_items_out_of_ordinary_quiz.sql";
const OLD_U = "public.get_unserved_questions_for_student(uuid,smallint,text[])";
const OLD_C = "public.get_question_candidates_for_student(uuid,smallint,text[],integer)";
const NEW_U = "public.get_unserved_questions_for_student(uuid,smallint,text[],text)";
const NEW_C = "public.get_question_candidates_for_student(uuid,smallint,text[],integer,text)";
const DOMAIN = "vikings";
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const lit = (v) => `'${JSON.stringify(v).replace(/'/g, "''")}'`;

async function productionDb({ withD383 = true } = {}) {
  const db = new PGlite();
  for (const s of answerChainSql()) await db.exec(s);
  await db.exec(extractFunction("20261016160000_answer_keys_server_side_rpcs.sql", "get_unserved_questions_for_student"));
  await db.exec(`REVOKE ALL ON FUNCTION ${OLD_U.replace("(uuid,smallint,text[])", "(uuid, smallint, text[])")} FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.get_unserved_questions_for_student(uuid, smallint, text[]) TO service_role;`);
  for (const f of ["20261031194600_mc_length_cue_answer_paths.sql", "20261102100000_release_open_rounds_on_inactive_questions.sql"]) await db.exec(readMigration(f));
  if (withD383) await db.exec(readMigration(D383));
  return db;
}
const md5Of = async (db, sig) => (await db.query("SELECT md5(prosrc) AS h FROM pg_proc WHERE oid = to_regprocedure($1)", [sig])).rows[0]?.h ?? null;
async function as(db, sql, params = []) {
  await db.exec("SET ROLE service_role");
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("RESET ROLE"); }
}
let q = 20000;
/** Inserts n questions in one statement; their ids sort in insertion order (the limit then sees the first ones first). */
async function addQuestions(db, n, metadata = {}, extra = {}) {
  const ids = [];
  const values = [];
  for (let i = 0; i < n; i++) {
    const id = uid(q++);
    ids.push(id);
    values.push(`('${id}', 'mc_single', ${lit({ question: "Q " + id, options: ["a", "b"], correct: "a" })}::jsonb, ${lit(metadata)}::jsonb, 1, true, 'auto', '${DOMAIN}', 'mc', '${extra.answer_type ?? "short"}', 5, ${extra.band ?? 1}, NULL)`);
  }
  if (n > 0) await db.exec(`INSERT INTO public.questions (id, type, content, metadata, difficulty, is_active, question_type, learning_objective,
      answer_format, answer_type, target_grade, difficulty_band, difficulty_level) VALUES ${values.join(",\n")};`);
  return ids;
}
const PUPIL = uid(1);
async function addPupil(db) {
  await db.exec(`INSERT INTO auth.users VALUES ('${PUPIL}') ON CONFLICT DO NOTHING;
    INSERT INTO public.profiles (id, role, selected_grade) VALUES ('${PUPIL}', 'student', 6) ON CONFLICT DO NOTHING;`);
}
const unserved = async (db, scope) => (await as(db, scope === undefined
  ? "SELECT id FROM public.get_unserved_questions_for_student($1, 6::smallint, $2)"
  : "SELECT id FROM public.get_unserved_questions_for_student($1, 6::smallint, $2, $3)", scope === undefined ? [PUPIL, [DOMAIN]] : [PUPIL, [DOMAIN], scope])).map((r) => r.id);
const candidates = async (db, scope) => (await as(db, scope === undefined
  ? "SELECT id FROM public.get_question_candidates_for_student($1, 6::smallint, $2, 20)"
  : "SELECT id FROM public.get_question_candidates_for_student($1, 6::smallint, $2, 20, $3)", scope === undefined ? [PUPIL, [DOMAIN]] : [PUPIL, [DOMAIN], scope])).map((r) => r.id);

test("bookkeeping: NOT_IN_PRODUCTION, replayed only in the introduction lane, after D-383", () => {
  assert.match(NOT_IN_PRODUCTION[FILE], /not applied in production/);
  assert.ok(TEST_PROFILES.introduction[FILE]);
  assert.ok(FILE > D383, "sorts after D-383, which it requires");
  assert.match(MIGRATION, /IKKE anvendt i produktion/);
});

test("the guard: D-383 first; production's bodies, or this migration's on a re-run; anything else refused with no change", async () => {
  const without = await productionDb({ withD383: false });
  await assert.rejects(without.exec(MIGRATION), /COURSE_SCOPE: public\.question_is_course_item mangler/);
  assert.notEqual(await md5Of(without, OLD_U), null, "nothing dropped");

  const db = await productionDb();
  assert.equal(await md5Of(db, OLD_U), "126b901c78d7176ba9255c14cf2906b4");
  assert.equal(await md5Of(db, OLD_C), "97fd2661eec66b41d43da294ffc95408");
  await db.exec(MIGRATION);
  assert.equal(await md5Of(db, OLD_U), null);
  assert.equal(await md5Of(db, OLD_C), null);
  const after = [await md5Of(db, NEW_U), await md5Of(db, NEW_C)];
  await db.exec(MIGRATION);
  assert.deepEqual([await md5Of(db, NEW_U), await md5Of(db, NEW_C)], after, "a re-run changes nothing");

  const drifted = await productionDb();
  await drifted.exec(extractFunction("20261016160000_answer_keys_server_side_rpcs.sql", "get_unserved_questions_for_student").replace("LIMIT 50;", "LIMIT 51;"));
  await assert.rejects(drifted.exec(MIGRATION), /COURSE_SCOPE: get_unserved_questions_for_student er ikke den gennemgåede krop/);
  assert.notEqual(await md5Of(drifted, OLD_C), null, "the other function is untouched too");
  assert.equal(await md5Of(drifted, NEW_U), null);
});

test("each body is production's plus exactly one predicate; grants, SECURITY, config, owner and comment unchanged", async () => {
  const PRED = [
    "AND (p_course_scope IS NULL",
    "OR (p_course_scope = 'none' AND NOT public.question_is_course_item(q.metadata))",
    "OR (p_course_scope <> 'none' AND public.question_is_course_item(q.metadata) AND q.metadata ->> 'learning_step' = p_course_scope))",
  ];
  const bodyOf = (sql) => sql.slice(sql.indexOf("AS $$")).split("\n").map((l) => l.trim()).filter(Boolean);
  for (const [name, origin] of [["get_unserved_questions_for_student", "20261016160000_answer_keys_server_side_rpcs.sql"], ["get_question_candidates_for_student", "20261019150000_question_format_mix.sql"]]) {
    const was = bodyOf(extractFunction(origin, name));
    const now = bodyOf(extractFunction(FILE, name));
    assert.deepEqual(now.filter((l) => !PRED.includes(l)), was, `${name}: no other change in the body`);
    assert.deepEqual(now.filter((l) => PRED.includes(l)), PRED, `${name}: the predicate once`);
  }
  const before = await productionDb();
  const after = await productionDb();
  await after.exec(MIGRATION);
  const facts = async (db, sigs) => (await db.query(`SELECT p.proname, p.prosecdef, p.provolatile, p.proconfig::text AS cfg, pg_get_userbyid(p.proowner) AS owner,
      has_function_privilege('anon', p.oid, 'EXECUTE') AS anon, has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth,
      has_function_privilege('service_role', p.oid, 'EXECUTE') AS svc, obj_description(p.oid, 'pg_proc') AS comment
    FROM pg_proc p WHERE p.oid = ANY (ARRAY[to_regprocedure($1), to_regprocedure($2)]::oid[]) ORDER BY 1`, sigs)).rows;
  assert.deepEqual(await facts(after, [NEW_U, NEW_C]), await facts(before, [OLD_U, OLD_C]));
  const n = (await after.query("SELECT count(*)::int AS n FROM pg_proc WHERE proname IN ('get_unserved_questions_for_student', 'get_question_candidates_for_student')")).rows[0].n;
  assert.equal(n, 2, "one signature each: no ambiguous overload left for PostgREST");
});

test("a call WITHOUT p_course_scope (today's Edge Function) returns exactly what production returns", async () => {
  const before = await productionDb();
  const after = await productionDb();
  await after.exec(MIGRATION);
  for (const db of [before, after]) {
    q = 20000;
    await addPupil(db);
    await addQuestions(db, 30, { learning_step: "guided_practice" });
    await addQuestions(db, 30);
    await addQuestions(db, 5, { learning_step: "nonsense" });
  }
  assert.deepEqual(await unserved(after), await unserved(before));
  assert.deepEqual(await candidates(after), await candidates(before));
});

for (const courseCount of [0, 49, 50, 51, 100]) {
  test(`'none' with ${courseCount} course items ahead: the ordinary quiz still gets every ordinary question that fits the limit (before: ${courseCount >= 50 ? "NONE" : `${50 - courseCount}`})`, async () => {
    const db = await productionDb();
    await db.exec(MIGRATION);
    q = 20000;
    await addPupil(db);
    const course = await addQuestions(db, courseCount, { learning_step: "guided_practice" });
    const ordinary = [...await addQuestions(db, 30), ...await addQuestions(db, 10, { other: "metadata" })];
    const old = (await unserved(db, null)).filter((id) => ordinary.includes(id));
    assert.equal(old.length, Math.max(0, Math.min(ordinary.length, 50 - courseCount)), "the gap: course items take the limit's places");
    const got = await unserved(db, "none");
    assert.deepEqual([...got].sort(), [...ordinary].sort(), "every ordinary question, no course item");
    for (const id of course) assert.equal(got.includes(id), false);
    const window = await candidates(db, "none");
    assert.equal(window.some((id) => course.includes(id)), false, "v2 window: no course item");
    assert.equal(window.length, Math.min(20, ordinary.length), "v2 window: the ordinary group is filled");
  });
}

test("only course items: 'none' is empty (so the ordinary quiz moves on to repeats); invalid tags count as course items", async () => {
  const db = await productionDb();
  await db.exec(MIGRATION);
  q = 20000;
  await addPupil(db);
  await addQuestions(db, 60, { learning_step: "guided_practice" });
  await addQuestions(db, 5, { learning_step: "nonsense" });
  await addQuestions(db, 3, { learning_step: null });
  assert.deepEqual(await unserved(db, "none"), []);
  assert.deepEqual(await candidates(db, "none"), []);
});

test("a step id: only that step's course items — behind 100 items of other steps and 40 ordinary ones; never an invalid tag", async () => {
  const db = await productionDb();
  await db.exec(MIGRATION);
  q = 20000;
  await addPupil(db);
  await addQuestions(db, 100, { learning_step: "guided_practice" });
  await addQuestions(db, 40);
  await addQuestions(db, 5, { learning_step: "nonsense" });
  const transfer = await addQuestions(db, 3, { learning_step: "transfer" });
  assert.deepEqual((await unserved(db, null)).filter((id) => transfer.includes(id)), [], "the gap: the step's items lie beyond the limit");
  assert.deepEqual([...await unserved(db, "transfer")].sort(), [...transfer].sort());
  assert.deepEqual([...await candidates(db, "transfer")].sort(), [...transfer].sort());
  // An invalid tag is a course item ('none' never returns it), and no REAL step returns it. The Edge Function passes only
  // "none" or the server's validated step (scope.ts courseScopeOf(sequence.step)), never a value from the request.
  const invalid = (await db.query("SELECT id FROM public.questions WHERE metadata ->> 'learning_step' = 'nonsense'")).rows.map((r) => r.id);
  assert.equal(invalid.length, 5);
  for (const scope of ["none", ...STEP_IDS]) {
    const got = [...await unserved(db, scope), ...await candidates(db, scope)];
    assert.equal(got.some((id) => invalid.includes(id)), false, `${scope}: no invalid-tag item`);
  }
});

test("already-served questions are still excluded under every scope (the NOT EXISTS is unchanged)", async () => {
  const db = await productionDb();
  await db.exec(MIGRATION);
  q = 20000;
  await addPupil(db);
  const [ordinary] = await addQuestions(db, 1);
  const [step] = await addQuestions(db, 1, { learning_step: "transfer" });
  for (const id of [ordinary, step]) {
    await db.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, answered, answered_at, was_correct, user_answer, repeat_count, next_review_at)
      VALUES ($1, $2, 'a', true, now(), true, 'a', 0, now())`, [PUPIL, id]);
  }
  for (const scope of [undefined, "none", "transfer"]) {
    assert.deepEqual(await unserved(db, scope), [], String(scope));
    assert.deepEqual(await candidates(db, scope), [], String(scope));
  }
});
