// RUNTIME proof for migration 20261101150000_grading_meaningful_characters (D-290, G1), PGlite.
//
// Fixture: production's answer chain (helpers/answer-chain-schema.mjs) with process_question_attempt
// replaced by production's CURRENT body — D-280 part 1 (20261031194600), md5(prosrc) 328ea8f9… asserted.
// The migration file is executed UNMODIFIED. Synthetic pupils and questions only.
//
// Cases: ordinary answers (MC right/wrong, repeat, Match par key, reviewed alias) give the same status
// AND the same XP/coins/counters before and after; the defect patterns flip from wrongly-correct to
// incorrect (apostrophe, æ/ø/å-only key, number with decimal comma/sign); numbers compare numerically;
// the new body differs from production's only in the grading lines; metadata/ACL unchanged; the helpers
// have no API EXECUTE; the guard refuses an unreviewed body and accepts its own; the rollback restores
// production's exact body and removes the helpers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { answerChainSql, extractFunction } from "./helpers/answer-chain-schema.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const FILE = "supabase/migrations/20261101150000_grading_meaningful_characters.sql";
const PQA = "public.process_question_attempt(uuid,uuid,text,bigint)";
const PROD_MD5 = "328ea8f9a4fd260407b582dcecb7dfdf";
const NEW_MD5 = "2e05e769a102f61ffef0ea4dd550c55b";

function rollbackSql() {
  const m = /```sql\n([\s\S]*?)```/.exec(read("docs/operations/grading-meaningful-characters-rollback.md"));
  assert.ok(m && /ROLLBACK D-290 G1/.test(m[1]));
  return m[1];
}

const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const Q = {
  mc: uid(9301), poss: uid(9302), sent: uid(9303), oe: uid(9304), num: uid(9305), match: uid(9306), alias: uid(9307),
};
const lit = (v) => `'${JSON.stringify(v).replace(/'/g, "''")}'`;
const qrow = (id, format, content, metadata = {}) =>
  `('${id}', '${format}', ${lit(content)}::jsonb, ${lit(metadata)}::jsonb, 1, true, 'auto', 'english', '${format}', 'short', 5, 1, 1000)`;
const SEED = `
  INSERT INTO public.questions (id, type, content, metadata, difficulty, is_active, question_type, learning_objective,
    answer_format, answer_type, target_grade, difficulty_band, difficulty_level) VALUES
  ${qrow(Q.mc, "mc", { question: "Hovedstad?", options: ["Paris", "Rom"], correct: "Paris" })},
  ${qrow(Q.poss, "mc", { question: "sister___ room", options: ["s'", "s", "es", "'s"], correct: "'s" })},
  ${qrow(Q.sent, "mc", { question: "Ejefald?", options: ["Tom's dog is big.", "Toms dog is big."], correct: "Tom's dog is big." })},
  ${qrow(Q.oe, "mc", { question: "island?", options: ["ø", "is"], correct: "ø" })},
  ${qrow(Q.num, "number", { question: "Halvanden?", correct: "1,5" })},
  ${qrow(Q.match, "mc", { question: "Forbind (Match par key format; 'match' is not yet an allowed answer_format)",
    options: ["0:2,1:0,2:1", "0:1,1:2,2:0"], correct: "0:2,1:0,2:1" })},
  ${qrow(Q.alias, "mc", { question: "Stavning?", options: ["prinsesse", "x"], correct: "prinsesse" },
    { danish_orthography_correct_aliases: ["prinsesse", "Prinsesse"] })};
  INSERT INTO public.daily_quests (quest_key, label, type, target, reward_coins) VALUES
    ('d_answers', 'Svar', 'answer_count', 5, 10), ('d_correct', 'Rigtige', 'correct_count', 5, 10);
  INSERT INTO public.weekly_quests (quest_key, label, type, target, reward_coins) VALUES ('w_answers', 'Svar', 'answer_count', 50, 50);
`;
const KEY = { mc: "Paris", poss: "'s", sent: "Tom's dog is big.", oe: "ø", num: "1,5", match: "0:2,1:0,2:1", alias: "prinsesse" };

async function prodDb() {
  const db = new PGlite();
  for (const sql of answerChainSql()) await db.exec(sql);
  await db.exec(extractFunction("20261031194600_mc_length_cue_answer_paths.sql", "process_question_attempt"));
  await db.exec(SEED);
  assert.equal(await md5(db), PROD_MD5, "fixture = production's current body (D-280)");
  return db;
}
async function migrated() {
  const db = await prodDb();
  await db.exec(read(FILE));
  return db;
}
const md5 = async (db) => (await db.query("SELECT md5(prosrc) AS h FROM pg_proc WHERE oid = to_regprocedure($1)", [PQA])).rows[0]?.h ?? null;

let n = 500;
async function pupil(db) {
  const id = uid(n++);
  await db.exec(`INSERT INTO auth.users VALUES ('${id}');
    INSERT INTO public.profiles (id, role, selected_grade) VALUES ('${id}', 'student', 5);
    INSERT INTO public.student_progress (student_id, xp, coins, correct_answers, total_correct_answers,
      current_streak, longest_streak, last_activity_date) VALUES ('${id}', 100, 50, 7, 7, 1, 1, current_date - 1);`);
  return id;
}
async function answer(db, kind, given, { repeat = 0 } = {}) {
  const p = await pupil(db);
  const qi = (await db.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, repeat_count, next_review_at)
    VALUES ($1, $2, $3, $4, now()) RETURNING id`, [p, Q[kind], KEY[kind], repeat])).rows[0].id;
  await db.exec("SET ROLE service_role");
  let r;
  try { r = (await db.query(`SELECT ${PQA.split("(")[0]}($1, $2, $3, 0) AS r`, [p, qi, given])).rows[0].r; }
  finally { await db.exec("RESET ROLE"); }
  const pr = (await db.query(`SELECT xp, coins, correct_answers AS c, total_correct_answers AS t FROM public.student_progress
    WHERE student_id = $1`, [p])).rows[0];
  return { status: r.status, xp: pr.xp, coins: pr.coins, c: pr.c, t: pr.t };
}

const ORDINARY = [
  ["mc", "Paris"], ["mc", "paris"], ["mc", "  PARIS "], ["mc", "Rom"], ["mc", "Paris", { repeat: 1 }], ["mc", "Rom", { repeat: 1 }],
  ["match", "0:2,1:0,2:1"], ["match", "0:1,1:2,2:0"], ["alias", "Prinsesse"], ["alias", "prinsesse"], ["alias", "x"],
  ["poss", "'s"], ["sent", "Tom's dog is big."], ["oe", "ø"],
];

test("ordinary answers: identical status, XP, coins and counters before and after", async () => {
  const before = await prodDb();
  const after = await migrated();
  for (const [kind, given, opt] of ORDINARY) {
    assert.deepEqual(await answer(after, kind, given, opt), await answer(before, kind, given, opt), `${kind} ${JSON.stringify(given)}`);
  }
  // and the reward is still production's: first correct +10 XP +5 coins, repeat +2 XP +1 coin
  assert.deepEqual(await answer(after, "mc", "Paris"), { status: "correct", xp: 110, coins: 55, c: 8, t: 8 });
  assert.equal((await answer(after, "mc", "Paris", { repeat: 1 })).xp, 102);
});

test("the defect patterns: wrongly correct before, incorrect after", async () => {
  const before = await prodDb();
  const after = await migrated();
  for (const [kind, given] of [["poss", "s'"], ["poss", "s"], ["sent", "Toms dog is big."], ["oe", "å"], ["oe", "!"], ["num", "15"]]) {
    assert.equal((await answer(before, kind, given)).status, "correct", `before: ${kind} ${given}`);
    const a = await answer(after, kind, given);
    assert.equal(a.status, "incorrect", `after: ${kind} ${given}`);
    assert.deepEqual([a.xp, a.coins, a.c], [100, 50, 7], "nothing paid for a wrong answer");
  }
});

test("numbers compare numerically after; non-numbers are incorrect, never an error", async () => {
  const after = await migrated();
  for (const g of ["1,5", "1.5", " 1,50 "]) assert.equal((await answer(after, "num", g)).status, "correct", g);
  for (const g of ["15", "-1,5", "1/2", "halvanden", ""]) assert.equal((await answer(after, "num", g)).status, "incorrect", g);
});

test("the new body is production's with ONLY the grading lines replaced", async () => {
  const src = async (db) => (await db.query("SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure($1)", [PQA])).rows[0].prosrc;
  const oldB = await src(await prodDb());
  const db = await migrated();
  const newB = await src(db);
  assert.equal(await md5(db), NEW_MD5);
  const cut = (s, from, to) => s.slice(0, s.indexOf(from)) + s.slice(s.indexOf(to));
  assert.equal(cut(newB, "  -- D-290 (G1)", "    v_correct := true;"), cut(oldB, "  v_answer         :=", "    v_correct := true;"));
  assert.equal(/\[\^a-z0-9\]/.test(newB), false, "the legacy strip is gone");
});

test("metadata unchanged; the helpers are internal (no API EXECUTE), IMMUTABLE, search_path ''", async () => {
  const meta = async (db) => (await db.query(`SELECT pg_get_function_result(p.oid) AS r, p.prosecdef, p.proconfig, p.proacl::text AS acl
    FROM pg_proc p WHERE p.oid = to_regprocedure($1)`, [PQA])).rows[0];
  const db = await migrated();
  assert.deepEqual(await meta(db), await meta(await prodDb()));
  for (const f of ["public.normalize_choice_answer(text)", "public.normalize_number_answer(text)"]) {
    const r = (await db.query(`SELECT provolatile, proconfig FROM pg_proc WHERE oid = to_regprocedure($1)`, [f])).rows[0];
    assert.equal(r.provolatile, "i", f);
    assert.deepEqual(r.proconfig, ["search_path=\"\""], f);
    for (const role of ["anon", "authenticated", "service_role"]) {
      assert.equal((await db.query(`SELECT has_function_privilege('${role}', '${f}', 'EXECUTE') AS h`)).rows[0].h, false, `${role} ${f}`);
    }
  }
});

test("the guard refuses an unreviewed body and accepts its own (re-run)", async () => {
  const db = await prodDb();
  await db.exec(extractFunction("20261027120000_repeat_answer_coin_reward.sql", "process_question_attempt"));
  await assert.rejects(db.exec(read(FILE)), /D-290: process_question_attempt has an unreviewed body/);
  const ok = await migrated();
  await ok.exec(read(FILE));
  assert.equal(await md5(ok), NEW_MD5);
});

test("the documented rollback restores production's exact body and removes the helpers", async () => {
  const db = await migrated();
  await db.exec(rollbackSql());
  assert.equal(await md5(db), PROD_MD5);
  assert.equal((await db.query("SELECT to_regprocedure('public.normalize_choice_answer(text)') IS NULL AS gone")).rows[0].gone, true);
  assert.equal((await answer(db, "poss", "s'")).status, "correct", "legacy grading is back");
});
