// RUNTIME proof for migration 20261105160000_f01_number_questions_history (F-01 talopgaver), PGlite.
//
// Fixture: production's answer chain (helpers/answer-chain-schema.mjs: production-faithful base schema →
// 20261019150000 (#351) → 20261020120000 (A) → 20261029120000 (B) → the live answer functions), with
// process_question_attempt at production's D-280 body and then G1 (20261101150000) applied UNMODIFIED —
// the grading production runs today. The F-01 migration file is executed UNMODIFIED on top.
//
// What this proves:
//   1. SHAPE: 30 rows, all INACTIVE, answer_format 'number' / answer_type 'short', type 'number_input',
//      existing history domains, difficulty_level = difficulty_level_from_grade_band(grade, band), unique
//      texts that state the expected format, an integer key as text, no key in the public payload.
//   2. SERVABLE WHEN ACTIVE: SQL question_is_servable and the TS registry (classifyQuestion) both say
//      "number"; get_level_questions_for_student returns NONE of them while inactive and ALL of them once
//      (hypothetically, in this throwaway database) activated.
//   3. GRADING: the key get-next-question stores (content.correct → question_instances.correct_answer)
//      grades through process_question_attempt + normalize_number_answer: the year is correct, other
//      numbers and non-numbers are incorrect, never an error; the SQL and TS normalisers agree.
//   4. GUARD: a second run fails loudly and changes nothing; the file is data-only and is never replayed
//      in the isolated CI (NOT_IN_PRODUCTION).
//
// HONEST LIMITS: PGlite is PostgreSQL 18.x (production 17.6) and runs as superuser. PostgREST and the Edge
// runtime are not in the loop: the instance key is written the way get-next-question's normalizeContent
// + insertQuestionInstance write it (raw.correct). The H5 path (_v2) uses the same normalize_number_answer
// and is not exercised here. Passing is not permission to apply (D-110).
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { answerChainSql, extractFunction } from "./helpers/answer-chain-schema.mjs";
import { classifyQuestion, isServableKind, INTERACTION_KINDS } from "../../supabase/functions/_shared/interaction-kinds.ts";
import { toPublicQuestion } from "../../supabase/functions/_shared/question-dto.ts";
import { normalizeNumber } from "../../supabase/functions/_shared/answer-normalize.ts";
import { HISTORY_DOMAINS } from "../../supabase/functions/get-next-question/scope.ts";
import { forbiddenMigrationTokens } from "../../.github/ci/classify-changes.mjs";
import { planReplay, NOT_IN_PRODUCTION } from "../isolated/schema/replay-plan.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const FILE_NAME = "20261105160000_f01_number_questions_history.sql";
const FILE = `supabase/migrations/${FILE_NAME}`;
const G1 = "supabase/migrations/20261101150000_grading_meaningful_characters.sql";
const PQA = "public.process_question_attempt(uuid,uuid,text,bigint)";
const G1_MD5 = "2e05e769a102f61ffef0ea4dd550c55b";
const BATCH = "f01_number_history_v1";

async function migrated() {
  const db = new PGlite();
  for (const sql of answerChainSql()) await db.exec(sql);
  await db.exec(extractFunction("20261031194600_mc_length_cue_answer_paths.sql", "process_question_attempt"));
  await db.exec(read(G1));
  await db.exec(`
    INSERT INTO public.daily_quests (quest_key, label, type, target, reward_coins) VALUES
      ('d_answers', 'Svar', 'answer_count', 5, 10), ('d_correct', 'Rigtige', 'correct_count', 5, 10);
    INSERT INTO public.weekly_quests (quest_key, label, type, target, reward_coins) VALUES ('w_answers', 'Svar', 'answer_count', 50, 50);`);
  const h = (await db.query("SELECT md5(prosrc) AS h FROM pg_proc WHERE oid = to_regprocedure($1)", [PQA])).rows[0]?.h;
  assert.equal(h, G1_MD5, "fixture = production's current grading body (G1)");
  await db.exec(read(FILE));
  return db;
}
const rowsOf = async (db) => (await db.query(
  `SELECT * FROM public.questions WHERE metadata ->> 'content_batch' = $1 ORDER BY (content ->> 'correct')::int`, [BATCH])).rows;

// Built ONCE (the unit job has a tight time budget); the tests below never leave a change behind
// except pupils and their answers, and the activation test restores is_active = false.
let db;
before(async () => { db = await migrated(); });

let n = 700;
const uid = (k) => `00000000-0000-4000-8000-${String(k).padStart(12, "0")}`;
async function pupil(db) {
  const id = uid(n++);
  await db.exec(`INSERT INTO auth.users VALUES ('${id}');
    INSERT INTO public.profiles (id, role, selected_grade) VALUES ('${id}', 'student', 7);
    INSERT INTO public.student_progress (student_id, xp, coins, correct_answers, total_correct_answers,
      current_streak, longest_streak, last_activity_date) VALUES ('${id}', 100, 50, 7, 7, 1, 1, current_date - 1);`);
  return id;
}
// The instance key exactly as get-next-question writes it: normalizeContent returns raw.correct for a
// "number" question, insertQuestionInstance stores it as question_instances.correct_answer.
async function answer(_db, q, given) {
  const p = await pupil(db);
  const key = q.content.correct;
  const qi = (await db.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, next_review_at)
    VALUES ($1, $2, $3, now()) RETURNING id`, [p, q.id, key])).rows[0].id;
  await db.exec("SET ROLE service_role");
  try { return (await db.query(`SELECT public.process_question_attempt($1, $2, $3, 0) AS r`, [p, qi, given])).rows[0].r.status; }
  finally { await db.exec("RESET ROLE"); }
}
// app.js renderOptions (renderer "number") sends String(Number(input.value)) and sends nothing on NaN.
const clientSends = (typed) => (Number.isNaN(Number(typed)) ? null : String(Number(typed)));

test("shape: 30 inactive history number questions on the level scale, with format-stating, unique texts", async () => {
  const rows = await rowsOf(db);
  assert.equal(rows.length, 30);
  const texts = new Set();
  for (const r of rows) {
    const label = r.content.question;
    assert.equal(r.is_active, false, label);
    assert.equal(r.answer_format, "number", label);
    assert.equal(r.answer_type, "short", label);
    assert.equal(r.type, "number_input", label);
    assert.equal(r.question_type, "auto", label);
    assert.ok(HISTORY_DOMAINS.includes(r.learning_objective), label);
    assert.equal(r.metadata.domain, r.learning_objective, label);
    assert.ok(r.target_grade >= 3 && r.target_grade <= 9 && r.difficulty_band >= 1 && r.difficulty_band <= 5, label);
    assert.equal(r.difficulty, r.difficulty_band, label);
    const lvl = (await db.query("SELECT public.difficulty_level_from_grade_band($1, $2) AS l", [r.target_grade, r.difficulty_band])).rows[0].l;
    assert.equal(r.difficulty_level, lvl, label);
    assert.match(r.content.correct, /^[1-9][0-9]*$/, label);
    assert.deepEqual(r.content.accepted_answers, [r.content.correct], label);
    assert.ok(typeof r.content.review_text === "string" && r.content.review_text.includes(r.content.correct), label);
    assert.match(label, /\? Skriv (årstallet|antallet) med (fire )?cifre\.$/, label);
    if (/fire cifre/.test(label)) assert.match(r.content.correct, /^\d{4}$/, label);
    assert.ok(!texts.has(label), `duplicate text ${label}`);
    texts.add(label);
    assert.ok(!/Ã|�/.test(JSON.stringify(r.content)), "no mojibake");
    // The public payload never carries the key.
    const pub = toPublicQuestion(r.content, "number", r.metadata);
    assert.deepEqual(Object.keys(pub.content), ["question"], label);
    assert.ok(!JSON.stringify(pub).includes("review_text") && !("content_batch" in (pub.metadata ?? {})), label);
  }
  assert.ok(/[æøå]/.test([...texts].join(" ")), "Danish letters kept");
  // the reviewed answer set, pinned so a silent edit of a key fails here
  assert.deepEqual(rows.map((r) => r.content.correct), [
    "95", "793", "1066", "1397", "1517", "1536", "1658", "1665", "1788", "1789", "1801", "1807", "1814", "1847",
    "1849", "1864", "1882", "1901", "1914", "1915", "1918", "1920", "1939", "1940", "1943", "1945", "1949",
    "1961", "1973", "1989",
  ]);
});

test("grading: the stored key grades through process_question_attempt + normalize_number_answer (G1)", async () => {
  const rows = await rowsOf(db);
  // Every question: the right integer is correct, the year before it is incorrect.
  for (const r of rows) {
    assert.equal(await answer(db, r, r.content.correct), "correct", r.content.question);
    assert.equal(await answer(db, r, String(Number(r.content.correct) - 1)), "incorrect", r.content.question);
  }
  const q1849 = rows.find((r) => r.content.correct === "1849");
  // G1 semantics, server side (what reaches the RPC):
  for (const g of ["1849", " 1849 ", "01849", "1849,0", "1849.00", "1 849"]) {
    assert.equal(await answer(db, q1849, g), "correct", JSON.stringify(g));
  }
  for (const g of ["1.849", "1848", "1850", "18490", "-1849", "år 1849", "1849!", "", "attenhundrede niogfyrre"]) {
    assert.equal(await answer(db, q1849, g), "incorrect", JSON.stringify(g));
  }
  // What the current client actually sends for typed input (app.js: String(Number(value)); NaN → nothing).
  assert.equal(clientSends(" 1849 "), "1849");
  assert.equal(clientSends("1.849"), "1.849");
  assert.equal(await answer(db, q1849, clientSends("1.849")), "incorrect");
  assert.equal(clientSends("1 849"), null, "client does not submit a space-separated number");
  assert.equal(clientSends("1849,0"), null, "client does not submit a decimal comma");
  assert.equal(clientSends(""), "0", "client submits an empty field as 0 — graded incorrect");
  assert.equal(await answer(db, q1849, clientSends("")), "incorrect");
});

test("SQL normalize_number_answer and TS normalizeNumber agree on every key and variant", async () => {
  const rows = await rowsOf(db);
  const inputs = [...rows.map((r) => r.content.correct), " 1849 ", "01849", "1849,0", "1.849", "1 849", "år 1849", "", "-0"];
  for (const v of inputs) {
    const sql = (await db.query("SELECT public.normalize_number_answer($1) AS v", [v])).rows[0].v;
    assert.equal(sql, normalizeNumber(v), JSON.stringify(v));
  }
  for (const r of rows) assert.equal(normalizeNumber(r.content.correct), r.content.correct, "key is already canonical");
});

test("guard: a second run fails loudly and changes nothing", async () => {
  const before = JSON.stringify(await rowsOf(db));
  await assert.rejects(db.exec(read(FILE)), /F-01: et af spørgsmålene findes allerede/);
  assert.equal(JSON.stringify(await rowsOf(db)), before);
  assert.equal((await db.query("SELECT count(*)::int AS c FROM public.questions")).rows[0].c, 30);
});

test("data-only, accounted as not applied, never replayed in the isolated CI", () => {
  const sql = read(FILE);
  assert.deepEqual(forbiddenMigrationTokens(sql), []);
  assert.ok(Object.hasOwn(NOT_IN_PRODUCTION, FILE_NAME));
  const { plan } = planReplay([FILE_NAME], () => sql);
  assert.equal(plan[0].action, "skip");
});

test("servable when active: SQL twin and TS registry agree on 'number'; the level engine serves them only when active", async () => {
  const rows = await rowsOf(db);
  assert.equal(INTERACTION_KINDS.number.servable, true);
  for (const r of rows) {
    assert.equal(classifyQuestion(r), "number");
    assert.equal(isServableKind("number"), true);
    const s = (await db.query("SELECT public.question_is_servable($1, $2, $3) AS s", [r.answer_format, r.answer_type, r.content])).rows[0].s;
    assert.equal(s, true);
  }
  const p = await pupil(db);
  const domains = `ARRAY[${HISTORY_DOMAINS.map((d) => `'${d}'`).join(",")}]::text[]`;
  const candidates = async (level) => (await db.query(
    `SELECT id, difficulty_level FROM public.get_level_questions_for_student($1, $2, ${domains}, 100)`, [p, level])).rows;
  const ids = new Set(rows.map((r) => r.id));

  // Inactive (as inserted): never a candidate.
  for (const level of [143, 5000, 9857]) assert.equal((await candidates(level)).filter((c) => ids.has(c.id)).length, 0);

  // Hypothetical activation in THIS throwaway database only.
  await db.exec(`UPDATE public.questions SET is_active = true WHERE metadata ->> 'content_batch' = '${BATCH}'`);
  const got = await candidates(5857);
  assert.deepEqual(new Set(got.map((c) => c.id)), ids, "every activated row is a level-engine candidate");
  const dist = got.map((c) => Math.abs(c.difficulty_level - 5857));
  assert.deepEqual(dist, [...dist].sort((a, b) => a - b), "nearest level first");
  await db.exec(`UPDATE public.questions SET is_active = false WHERE metadata ->> 'content_batch' = '${BATCH}'`);
});
