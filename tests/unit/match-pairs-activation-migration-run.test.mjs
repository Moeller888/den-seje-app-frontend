// F-03 Match par — the activation migration 20261105141500_match_pairs_activation.sql, run UNMODIFIED on
// PGlite over production's answer chain (helpers/answer-chain-schema.mjs: production's questions table
// with its constraints, question_is_servable with the live md5, process_question_attempt with the live
// md5) — once on production as it is today, and once with F-02's activation (20261105120000, PR #607)
// applied first.
//
// What this proves (the file is NOT applied and must not be before production step Q-21 and the
// get-next-question deploy that makes match servable — see its header):
//   1. SERVABLE RULE: after the migration, question_is_servable equals the TS registry
//      (_shared/interaction-kinds.ts, match_pairs servable since this PR) on the whole matrix the
//      format-mix parity test uses — exactly without F-02, and with only true_false flipped with F-02.
//      Only "match" rows change.
//   2. CONSTRAINTS: a contract row (_shared/match-pairs.ts) can be stored; every contract break is refused
//      by the database; whatever the database accepts, parseMatchPairs and get-next-question's payload
//      builder accept too (the database is never more lenient); every row production accepts or refuses
//      today is unchanged; true_false stays refused unless F-02 is applied.
//   3. GRADING + IDEMPOTENCY: a STORED match row (constraints intact, nothing dropped), served with a
//      createMatchKey key, is graded by canonicalMatchAnswer + the live process_question_attempt exactly
//      like MC (10 XP + 5 coins), a second submit of the same instance pays nothing more, a wrong answer
//      pays nothing; under process_question_attempt_v2 (H5) a replay of the same submission is frozen
//      and paid once.
//   4. GUARD: an unreviewed function body or constraint, or a mix of states, stops the migration; a re-run
//      is a no-op; F-02 applied AFTER this file is refused by F-02's own guard.
//   5. PRIVILEGES: question_is_servable stays EXECUTE for service_role only; the content validator is
//      executable by every role that writes questions (a CHECK checks EXECUTE for the writer).
//   6. INACTIVE: the file is in NOT_IN_PRODUCTION, so the isolated replay never applies it ahead of the
//      deploys.
// HONEST LIMITS: PGlite is PostgreSQL 18.x (production 17.6) and its database collation is C (production
// en_US.UTF-8); both fold "Æ" to "æ" with lower(), checked here and read-only on production 2026-11-05.
// The guard's production hashes were confirmed read-only against production's catalog on 2026-11-05.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { answerChainSql, LIVE_PROSRC_MD5, readMigration, ATTEMPTS_MIGRATION_FILE } from "./helpers/answer-chain-schema.mjs";
import { NOT_IN_PRODUCTION } from "../isolated/schema/replay-plan.mjs";
import { INTERACTION_KINDS, classifyQuestion, isServableKind } from "../../supabase/functions/_shared/interaction-kinds.ts";
import { canonicalMatchAnswer, createMatchKey, parseMatchPairs } from "../../supabase/functions/_shared/match-pairs.ts";
import { toPublicQuestion } from "../../supabase/functions/_shared/question-dto.ts";

const FILE = "20261105141500_match_pairs_activation.sql";
const F02_FILE = "20261105120000_true_false_activation.sql";
const MIGRATION = readMigration(FILE);
const F02 = readMigration(F02_FILE);

async function freshDb({ f02 = false } = {}) {
  const db = new PGlite();
  for (const sql of answerChainSql()) await db.exec(sql);
  if (f02) await db.exec(F02);
  return db;
}
const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const md5Fn = async (db) => (await one(db, "SELECT md5(prosrc) AS v FROM pg_proc WHERE oid = to_regprocedure('public.question_is_servable(text,text,jsonb)')")).v;
const constraintDef = async (db, name) => (await one(db, `SELECT pg_get_constraintdef(c.oid) AS v FROM pg_constraint c
  WHERE c.conrelid = 'public.questions'::regclass AND c.conname = $1`, [name])).v;

// unique_question_text: a stored question with visible text gets a unique suffix; anything else is kept.
let n = 0;
async function insert(db, { format = "match", content, type = "short", active = false }) {
  n++;
  const stored = typeof content?.question === "string" && content.question.trim() !== ""
    ? { ...content, question: `${content.question} #${n}` } : content;
  return db.query(
    `INSERT INTO public.questions (type, content, difficulty, is_active, question_type, learning_objective, answer_format, answer_type)
     VALUES ($1, $2::jsonb, 1, $5, 'auto', 'geografi', $3, $4) RETURNING id`,
    [format, JSON.stringify(stored), format, type, active]);
}
const accepted = async (db, row) => { try { await insert(db, row); return true; } catch { return false; } };
// The TS side: parseMatchPairs (contract) + normalizeContent's question check (get-next-question).
const tsAccepts = (content) => {
  try {
    parseMatchPairs(content);
    return typeof content.question === "string" && content.question.trim().length > 0;
  } catch { return false; }
};

const pairs = (k, f = (i) => ({ left: `Land ${i}`, right: `By ${i}` })) => Array.from({ length: k }, (_, i) => f(i));
const VALID = [
  { question: "Forbind landet med hovedstaden", correct: "par", pairs: [{ left: "Danmark", right: "København" }, { left: "Norge", right: "Oslo" }] },
  { question: "Seks par", correct: "par", pairs: pairs(6) },
  { question: "Æ, ø og å", correct: "par", pairs: [{ left: "Æble", right: "Træ" }, { left: "Ø", right: "Hav" }, { left: "Ål", right: "Sø" }] },
  { question: "Grænsen på 80", correct: "par", pairs: [{ left: "x".repeat(80), right: "a" }, { left: "y", right: "😀".repeat(40) }] },
  { question: "Ekstra nøgler ignoreres", correct: "par", pairs: [{ left: "a", right: "b", note: 1 }, { left: "c", right: "d" }], review_text: "ok" },
];
const BREAKS = [
  { question: "Med options", correct: "par", pairs: pairs(2), options: ["a", "b"] },
  { question: "Ingen par", correct: "par" },
  { question: "Par er ikke en liste", correct: "par", pairs: { left: "a", right: "b" } },
  { question: "Ét par", correct: "par", pairs: pairs(1) },
  { question: "Syv par", correct: "par", pairs: pairs(7) },
  { question: "Par er ikke et objekt", correct: "par", pairs: [["a", "b"], ["c", "d"]] },
  { question: "Mangler højre", correct: "par", pairs: [{ left: "a" }, { left: "c", right: "d" }] },
  { question: "Tal som tekst", correct: "par", pairs: [{ left: 1, right: "b" }, { left: "c", right: "d" }] },
  { question: "Tom tekst", correct: "par", pairs: [{ left: "   ", right: "b" }, { left: "c", right: "d" }] },
  { question: "Hårdt mellemrum", correct: "par", pairs: [{ left: " ﻿", right: "b" }, { left: "c", right: "d" }] },
  { question: "81 tegn", correct: "par", pairs: [{ left: "x".repeat(81), right: "b" }, { left: "c", right: "d" }] },
  { question: "81 UTF-16-enheder", correct: "par", pairs: [{ left: "😀".repeat(40) + "x", right: "b" }, { left: "c", right: "d" }] },
  { question: "Dobbelt venstre", correct: "par", pairs: [{ left: "Danmark", right: "b" }, { left: " danmark ", right: "d" }] },
  { question: "Dobbelt højre", correct: "par", pairs: [{ left: "a", right: "Oslo" }, { left: "c", right: "OSLO" }] },
  { question: "Dobbelt Æ", correct: "par", pairs: [{ left: "Æble", right: "b" }, { left: "æble", right: "d" }] },
  { question: "   ", correct: "par", pairs: pairs(2) },
  { question: 7, correct: "par", pairs: pairs(2) },
  { correct: "par", pairs: pairs(2) },
];

// ── 1. Servable rule ─────────────────────────────────────────────────────────────────────────────

// The same matrix as tests/unit/question-format-mix-migration-run.test.mjs.
const FORMATS = ["mc", "mc_single", "number", "numbers", "text", "match", "match_pairs", "true_false", "MC", "Text", " mc",
  "longtext", "mc_number", "drag_drop", "", null];
const TYPES = ["short", "long", "Long", "", null, "medium", " short"];
async function servableMatrix(db) {
  const out = new Map();
  for (const f of FORMATS) for (const t of TYPES) for (const force of [false, true]) {
    const content = force ? { question: "?", force_text: true } : { question: "?" };
    const { ok } = await one(db, "SELECT public.question_is_servable($1::text, $2::text, $3::jsonb) AS ok", [f, t, JSON.stringify(content)]);
    out.set(JSON.stringify([f, t, force]), { ok, row: { answer_format: f, answer_type: t, content } });
  }
  return out;
}

test("the base is production's: question_is_servable and process_question_attempt have the live md5", async () => {
  const db = await freshDb();
  assert.equal(await md5Fn(db), LIVE_PROSRC_MD5["public.question_is_servable(text,text,jsonb)"]);
  const { v } = await one(db, "SELECT md5(prosrc) AS v FROM pg_proc WHERE oid = 'public.process_question_attempt(uuid,uuid,text,bigint)'::regprocedure");
  assert.equal(v, LIVE_PROSRC_MD5["public.process_question_attempt(uuid,uuid,text,bigint)"]);
  assert.equal(INTERACTION_KINDS.match_pairs.servable, true, "this PR makes Match par servable in the registry");
});

for (const f02 of [false, true]) {
  test(`servable rule${f02 ? " (F-02 applied first)" : ""}: after the migration SQL = the TS registry${f02 ? " with true_false flipped" : ""}; only "match" moves`, async () => {
    const db = await freshDb({ f02 });
    const before = await servableMatrix(db);
    await db.exec(MIGRATION);
    const after = await servableMatrix(db);
    let changed = 0;
    for (const [key, { ok, row }] of after) {
      const kind = classifyQuestion(row);
      const ts = f02 && kind === "true_false" ? true : isServableKind(kind);
      assert.equal(ok, ts, key);
      if (ok !== before.get(key).ok) {
        changed++;
        assert.equal(kind, "match_pairs", `only Match par may change: ${key}`);
      }
    }
    assert.equal(after.size, FORMATS.length * TYPES.length * 2);
    // match with answer_type short, "" or null (all short), without force_text.
    assert.equal(changed, 3);
  });
}

// ── 2. Constraints ───────────────────────────────────────────────────────────────────────────────

test("constraints: a contract row is stored; every contract break is refused; the database is never more lenient than TS", async () => {
  const db = await freshDb();
  assert.equal(await accepted(db, { content: VALID[0] }), false, "production refuses a match row today");
  await db.exec(MIGRATION);
  for (const content of VALID) {
    assert.equal(tsAccepts(content), true, `TS accepts ${JSON.stringify(content)}`);
    assert.equal(await accepted(db, { content }), true, `the database accepts ${JSON.stringify(content)}`);
    // get-next-question can build the instance and its public payload from what was stored.
    const key = createMatchKey(content.pairs.length);
    assert.deepEqual(toPublicQuestion(content, "match", null, key).content.match.left, content.pairs.map((p) => p.left));
  }
  for (const content of BREAKS) {
    assert.equal(tsAccepts(content), false, `TS refuses ${JSON.stringify(content)}`);
    assert.equal(await accepted(db, { content }), false, `the database refuses ${JSON.stringify(content)}`);
  }
  // Table rules on top of the content contract.
  const ok = VALID[0];
  assert.equal(await accepted(db, { content: { ...ok, force_text: true } }), false, "force_text would be shown as free text");
  assert.equal(await accepted(db, { content: ok, type: "long" }), false, "long would be teacher-graded");
  assert.equal(await accepted(db, { content: ok, type: null }), true, "a NULL answer_type is short");
  const { correct, ...noCorrect } = ok;
  assert.equal(correct, "par");
  assert.equal(await accepted(db, { content: noCorrect }), false, "every row keeps content.correct (content_valid_check)");
  assert.equal(await accepted(db, { content: { ...ok, correct: null }, active: true }), false, "auto_requires_correct on an active row");
  assert.equal(await accepted(db, { content: ok, active: true }), true, "an active contract row");
  // The other spelling of the kind is still refused.
  assert.equal(await accepted(db, { format: "match_pairs", content: ok }), false);
});

test("constraints: what production accepts and refuses today is unchanged; true_false only with F-02", async () => {
  const rows = [
    { format: "mc", content: { type: "mc", question: "MC?", options: ["a", "b"], correct: "a" } },
    { format: "number", content: { type: "number", question: "Tal?", correct: "1849" } },
    { format: "text", content: { type: "text", question: "Stav?", correct: "Polen" } },
    { format: "text", content: { type: "text", question: "Stav?", correct: "x", options: ["x"] } }, // refused
    { format: "mc", content: { type: "mc", question: "MC?", options: ["a"], correct: "a" } },        // refused
    { format: "number", content: { question: "Ingen type?", correct: "5" } },                         // refused
    { format: "true_false", content: { question: "Himlen er blå.", correct: "Sandt" } },              // refused (no F-02)
  ];
  for (const f02 of [false, true]) {
    const before = await freshDb({ f02 });
    const after = await freshDb({ f02 });
    await after.exec(MIGRATION);
    for (const row of rows) {
      assert.equal(await accepted(after, row), await accepted(before, row), `${f02 ? "F-02: " : ""}${JSON.stringify(row)}`);
    }
    assert.equal(await accepted(after, rows[6]), f02, "true_false is stored only with F-02");
  }
});

// ── 3. Grading and idempotency on a STORED row ─────────────────────────────────────────────────────

let nextPupil = 700;
async function addPupil(db) {
  const id = `00000000-0000-4000-8000-${String(nextPupil++).padStart(12, "0")}`;
  await db.exec(`INSERT INTO auth.users VALUES ('${id}');
    INSERT INTO public.profiles (id, role, selected_grade) VALUES ('${id}', 'student', 5);
    INSERT INTO public.student_progress (student_id, xp, coins, correct_answers, total_correct_answers,
      current_streak, longest_streak, last_activity_date) VALUES ('${id}', 100, 50, 7, 7, 1, 1, current_date - 1);`);
  return id;
}
async function asService(db, sql, params) {
  await db.exec("SET ROLE service_role");
  try { return (await db.query(sql, params)).rows[0]; } finally { await db.exec("RESET ROLE"); }
}
// As get-next-question creates the round: the key drawn once (createMatchKey), stored server-side.
const serve = async (db, pupil, questionId, key) => (await asService(db, `INSERT INTO public.question_instances
  (student_id, question_id, correct_answer, repeat_count, answered, next_review_at) VALUES ($1, $2, $3, 0, false, now()) RETURNING id`,
  [pupil, questionId, key])).id;
// As process-event grades it: canonicalMatchAnswer first, then the live RPC.
const submit = async (db, pupil, instance, key, connections) => {
  const graded = canonicalMatchAnswer(JSON.stringify(connections), key);
  assert.ok(graded, "process-event would refuse this shape");
  return (await asService(db, "SELECT public.process_question_attempt($1, $2, $3, 0) AS r", [pupil, instance, graded])).r;
};
const progress = async (db, pupil) => one(db, "SELECT xp, coins, correct_answers FROM public.student_progress WHERE student_id = $1", [pupil]);

test("grading: a stored match row is paid like MC, once; a wrong connection pays nothing (live process_question_attempt)", async () => {
  const db = await freshDb();
  await db.exec(MIGRATION);
  const content = { question: "Forbind landet med hovedstaden", correct: "par",
    pairs: [{ left: "Danmark", right: "København" }, { left: "Norge", right: "Oslo" }, { left: "Sverige", right: "Stockholm" }] };
  const { rows: [{ id: questionId }] } = await insert(db, { content, active: true });
  const draws = [0, 0]; // deterministic Fisher–Yates draws: order [1, 2, 0]
  const key = createMatchKey(3, () => draws.shift());
  assert.equal(key, "0:2,1:0,2:1");
  const p = await addPupil(db);

  const qi = await serve(db, p, questionId, key);
  // The browser's connections, in any order: left i → right display position key[i].
  const right = [[2, 1], [0, 2], [1, 0]];
  const r = await submit(db, p, qi, key, right);
  assert.equal(r.status, "correct");
  assert.equal(r.correct_answer, key);
  assert.deepEqual(await progress(db, p), { xp: 110, coins: 55, correct_answers: 8 });
  // The same instance again (a retry): the same verdict, nothing paid twice.
  const again = await submit(db, p, qi, key, [[0, 2], [1, 0], [2, 1]]);
  assert.equal(again.status, "correct");
  assert.deepEqual(await progress(db, p), { xp: 110, coins: 55, correct_answers: 8 });
  const row = await one(db, "SELECT answered, was_correct, user_answer FROM public.question_instances WHERE id = $1", [qi]);
  assert.deepEqual(row, { answered: true, was_correct: true, user_answer: key });

  const p2 = await addPupil(db);
  const wrong = await submit(db, p2, await serve(db, p2, questionId, key), key, [[0, 0], [1, 2], [2, 1]]);
  assert.equal(wrong.status, "incorrect");
  assert.deepEqual(await progress(db, p2), { xp: 100, coins: 50, correct_answers: 7 });
  // An incomplete answer never reaches the RPC.
  assert.equal(canonicalMatchAnswer(JSON.stringify([[0, 2], [1, 0]]), key), null);
});

test("idempotency under H5: process_question_attempt_v2 replays the same submission frozen and pays once", async () => {
  const db = await freshDb();
  await db.exec(MIGRATION);
  await db.exec(readMigration(ATTEMPTS_MIGRATION_FILE));
  const content = { question: "Forbind ordet med ordklassen", correct: "par",
    pairs: [{ left: "løbe", right: "verbum" }, { left: "hus", right: "substantiv" }] };
  const { rows: [{ id: questionId }] } = await insert(db, { content, active: true });
  const key = createMatchKey(2);
  assert.equal(key, "0:1,1:0", "two pairs have one non-identity shuffle");
  const p = await addPupil(db);
  const qi = await serve(db, p, questionId, key);
  const sub = randomUUID();
  const answer = canonicalMatchAnswer(JSON.stringify([[1, 0], [0, 1]]), key);
  const v2 = async () => (await asService(db, "SELECT public.process_question_attempt_v2($1, $2, $3, 1, $4, NULL, NULL) AS r", [p, qi, answer, sub])).r;
  const first = await v2();
  assert.equal(first.outcome, "recorded");
  assert.equal(first.status, "correct");
  assert.deepEqual([first.xp_awarded, first.coins_awarded], [10, 5]);
  const afterFirst = await progress(db, p);
  const replay = await v2();
  assert.deepEqual({ ...replay, outcome: "recorded" }, first, "the frozen result");
  assert.deepEqual(await progress(db, p), afterFirst, "paid once");
  const { c } = await one(db, "SELECT count(*)::int AS c FROM public.question_attempts WHERE student_id = $1", [p]);
  assert.equal(c, 1);
});

// ── 4. Guard ─────────────────────────────────────────────────────────────────────────────────────

test("guard: an unreviewed body or constraint, or mixed states, stops the migration", async () => {
  const drifted = await freshDb();
  await drifted.exec(`CREATE OR REPLACE FUNCTION public.question_is_servable(p_answer_format text, p_answer_type text, p_content jsonb)
    RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$ SELECT true $$;`);
  await assert.rejects(drifted.exec(MIGRATION), /unreviewed body/);

  const driftedCheck = await freshDb();
  await driftedCheck.exec(`ALTER TABLE public.questions DROP CONSTRAINT questions_answer_format_check,
    ADD CONSTRAINT questions_answer_format_check CHECK (answer_format <> '')`);
  await assert.rejects(driftedCheck.exec(MIGRATION), /questions_answer_format_check is unreviewed/);

  const driftedContent = await freshDb();
  await driftedContent.exec(`ALTER TABLE public.questions DROP CONSTRAINT content_valid_check,
    ADD CONSTRAINT content_valid_check CHECK (jsonb_typeof(content) = 'object')`);
  await assert.rejects(driftedContent.exec(MIGRATION), /content_valid_check is unreviewed/);

  // F-02's function with production's constraints: half-applied, refused.
  const mixed = await freshDb();
  const f02Fn = F02.match(/CREATE OR REPLACE FUNCTION public\.question_is_servable\([\s\S]*?\n\$\$;/)[0];
  await mixed.exec(f02Fn);
  await assert.rejects(mixed.exec(MIGRATION), /mixed states/);
  // The refused run changed nothing: the file runs as one transaction, so even the validator it creates
  // before the guard is rolled back.
  assert.equal(await md5Fn(mixed), "3027c287884e35f42afcd1a4818e3cd0");
  assert.equal((await one(mixed, "SELECT to_regprocedure('public.match_pairs_content_is_valid(jsonb)') IS NULL AS v")).v, true);
});

test("guard: a re-run is a no-op on both bases; the guard names both of its own bodies; F-02 after this file is refused", async () => {
  for (const f02 of [false, true]) {
    const db = await freshDb({ f02 });
    await db.exec(MIGRATION);
    const once = [await md5Fn(db), await constraintDef(db, "questions_answer_format_check"), await constraintDef(db, "content_valid_check")];
    await db.exec(MIGRATION);
    assert.deepEqual([await md5Fn(db), await constraintDef(db, "questions_answer_format_check"), await constraintDef(db, "content_valid_check")], once);
    assert.match(MIGRATION, new RegExp(once[0]), "the guard names this file's own body");
    assert.equal((once[1].match(/match_pairs_content_is_valid/g) ?? []).length, 1, "extended exactly once");
    assert.equal((once[2].match(/match_pairs_content_is_valid/g) ?? []).length, 1, "extended exactly once");
    // The old definition is kept verbatim inside the new one (old OR match branch; the deparser drops the
    // outer parentheses of the old expression).
    const base = await freshDb({ f02 });
    assert.ok(once[1].includes((await constraintDef(base, "questions_answer_format_check")).slice(8, -2)), "format check: old OR new");
    assert.ok(once[2].includes((await constraintDef(base, "content_valid_check")).slice(8, -2)), "content check: old OR new");
    if (!f02) await assert.rejects(db.exec(F02), /F-02: question_is_servable has an unreviewed body/);
  }
});

// ── 5. Privileges ────────────────────────────────────────────────────────────────────────────────

test("privileges: question_is_servable stays service_role only; the validator runs for every writer", async () => {
  const db = await freshDb();
  await db.exec(MIGRATION);
  for (const [role, expected] of [["anon", false], ["authenticated", false], ["public", false], ["service_role", true]]) {
    const { ok } = await one(db, `SELECT has_function_privilege('${role}', 'public.question_is_servable(text, text, jsonb)', 'EXECUTE') AS ok`);
    assert.equal(ok, expected, role);
  }
  for (const role of ["anon", "authenticated", "service_role"]) {
    const { ok } = await one(db, `SELECT has_function_privilege('${role}', 'public.match_pairs_content_is_valid(jsonb)', 'EXECUTE') AS ok`);
    assert.equal(ok, true, role);
  }
  const { secdef } = await one(db, "SELECT prosecdef AS secdef FROM pg_proc WHERE oid = 'public.match_pairs_content_is_valid(jsonb)'::regprocedure");
  assert.equal(secdef, false, "never SECURITY DEFINER");
  // A non-superuser writer: an MC row and a match row both pass the CHECKs that now call the validator.
  await db.exec("SET ROLE service_role");
  try {
    await insert(db, { format: "mc", content: { type: "mc", question: "MC efter F-03?", options: ["a", "b"], correct: "a" } });
    await insert(db, { content: VALID[0] });
  } finally { await db.exec("RESET ROLE"); }
});

// ── 6. Inactive ──────────────────────────────────────────────────────────────────────────────────

test("inactive: the file is NOT_IN_PRODUCTION and never replayed; it says so and never mentions db push as a route", () => {
  assert.ok(Object.hasOwn(NOT_IN_PRODUCTION, FILE), `${FILE} must be in NOT_IN_PRODUCTION`);
  assert.ok(Object.hasOwn(NOT_IN_PRODUCTION, F02_FILE));
  assert.match(MIGRATION, /NOT APPLIED IN PRODUCTION/);
  assert.match(MIGRATION, /Q-21/);
  assert.equal(/\bdb push\b/.test(MIGRATION.replace(/never db push/g, "")), false);
});
