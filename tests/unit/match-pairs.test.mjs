// Match par (match_pairs): the server contract (_shared/match-pairs.ts), the public payload, the wiring in
// get-next-question / process-event, the browser helpers (js/match-pairs.js), and — offline in PGlite —
// that the production grading function process_question_attempt pays a Match par answer exactly like
// an MC answer: full award once, nothing for a wrong or repeated submission, the token repeat award.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  MATCH_MIN_PAIRS, MATCH_MAX_PAIRS, RECOMMENDED_PAIRS_BY_BAND, parseMatchPairs, validateMatchContent,
  createMatchKey, cryptoRandomInt, parseMatchKey, matchLayout, canonicalMatchAnswer,
} from "../../supabase/functions/_shared/match-pairs.ts";
import { toPublicQuestion, PUBLIC_CONTENT_KEYS } from "../../supabase/functions/_shared/question-dto.ts";
import { INTERACTION_KINDS, classifyQuestion, servableWireFormat } from "../../supabase/functions/_shared/interaction-kinds.ts";
import { resolveAnswerRenderer, ANSWER_RENDERERS } from "../../js/answer-input.js";
import * as client from "../../js/match-pairs.js";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

const PAIRS = [
  { left: "Danmark", right: "København" },
  { left: "Norge", right: "Oslo" },
  { left: "Sverige", right: "Stockholm" },
  { left: "Finland", right: "Helsinki" },
];
const CONTENT = { question: "Forbind landet med hovedstaden", pairs: PAIRS };

// Every permutation of 0..n-1.
function permutations(n) {
  if (n === 0) return [[]];
  const out = [];
  for (const p of permutations(n - 1)) for (let i = 0; i <= p.length; i++) out.push([...p.slice(0, i), n - 1, ...p.slice(i)]);
  return out;
}
const keyOf = (perm) => perm.map((r, l) => `${l}:${r}`).join(",");
// process_question_attempt's normalisation, verbatim: lower(), then strip everything but [a-z0-9].
const pqaNormalise = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "").trim();

// ── Content contract ───────────────────────────────────────────────────────────────────────────

test("parseMatchPairs accepts 2–6 unique pairs and refuses everything a pupil could not answer one way", () => {
  assert.deepEqual(parseMatchPairs(CONTENT), PAIRS);
  assert.equal(MATCH_MIN_PAIRS, 2);
  assert.equal(MATCH_MAX_PAIRS, 6);
  const bad = [
    null, "x", [], {},
    { question: "q", pairs: PAIRS.slice(0, 1) },
    { question: "q", pairs: [...PAIRS, ...PAIRS.map((p) => ({ left: p.left + "x", right: p.right + "x" }))].slice(0, 7) },
    { question: "q", pairs: PAIRS, options: ["a", "b"] },                       // never shown as MC
    { question: "q", pairs: [{ left: "a", right: "" }, { left: "b", right: "c" }] },
    { question: "q", pairs: [{ left: "a", right: 1 }, { left: "b", right: "c" }] },
    { question: "q", pairs: [{ left: "a", right: "x" }, { left: " A ", right: "y" }] },   // duplicate left
    { question: "q", pairs: [{ left: "a", right: "x" }, { left: "b", right: "X" }] },     // duplicate right
    { question: "q", pairs: [{ left: "a".repeat(81), right: "x" }, { left: "b", right: "y" }] },
    { question: "q", pairs: ["a", "b"] },
  ];
  for (const c of bad) assert.throws(() => parseMatchPairs(c), undefined, JSON.stringify(c));
});

test("validateMatchContent: contract errors vs. the per-band pair-count guidance", () => {
  assert.deepEqual(validateMatchContent(CONTENT, 3), { errors: [], warnings: [] });
  assert.deepEqual(validateMatchContent(CONTENT, 1).warnings, ["band 1 recommends 2-3 pairs, this question has 4"]);
  assert.deepEqual(validateMatchContent(CONTENT, null).warnings, ["difficulty_band 1-5 is required to check the pair count"]);
  assert.ok(validateMatchContent({ pairs: PAIRS }, 3).errors.includes("Missing question text"));
  assert.equal(validateMatchContent({ question: "q", pairs: [] }, 3).errors.length, 1);
  // The guidance grows with the band and stays inside the contract.
  let prevMin = 0;
  for (const band of [1, 2, 3, 4, 5]) {
    const [min, max] = RECOMMENDED_PAIRS_BY_BAND[band];
    assert.ok(min >= prevMin && min <= max && min >= MATCH_MIN_PAIRS && max <= MATCH_MAX_PAIRS, String(band));
    prevMin = min;
  }
});

// ── The per-instance key ───────────────────────────────────────────────────────────────────────

test("createMatchKey: every random draw gives a valid non-identity shuffle, and every non-identity shuffle is reachable", () => {
  for (let n = MATCH_MIN_PAIRS; n <= 5; n++) {
    // Enumerate every possible sequence of Fisher–Yates draws (i+1 choices at step i).
    const seen = new Set();
    const walk = (draws) => {
      if (draws.length === n - 1) {
        let k = 0;
        const key = createMatchKey(n, () => draws[k++]);
        const perm = parseMatchKey(key, n);
        assert.ok(perm, key);
        assert.ok(perm.some((r, l) => r !== l), `identity for n=${n}: ${key}`);
        seen.add(key);
        return;
      }
      const i = n - 1 - draws.length;
      for (let j = 0; j <= i; j++) walk([...draws, j]);
    };
    walk([]);
    const expected = permutations(n).filter((p) => p.some((r, l) => r !== l)).map(keyOf);
    assert.deepEqual([...seen].sort(), expected.sort(), `n=${n}`);
  }
});

test("createMatchKey with the platform's cryptographic source, and its guards", () => {
  for (let i = 0; i < 300; i++) {
    const n = MATCH_MIN_PAIRS + (i % 5);
    const perm = parseMatchKey(createMatchKey(n), n);
    assert.ok(perm && perm.some((r, l) => r !== l));
  }
  for (const n of [0, 1, 7, 2.5, NaN]) assert.throws(() => createMatchKey(n));
  assert.throws(() => createMatchKey(3, () => 5), /out of range/);
  assert.throws(() => cryptoRandomInt(0));
  for (let i = 0; i < 200; i++) { const v = cryptoRandomInt(6); assert.ok(Number.isInteger(v) && v >= 0 && v < 6); }
});

test("parseMatchKey accepts exactly a permutation written left 0..n-1", () => {
  assert.deepEqual(parseMatchKey("0:2,1:0,2:1"), [2, 0, 1]);
  assert.deepEqual(parseMatchKey("0:2,1:0,2:1", 3), [2, 0, 1]);
  for (const k of ["", "0:1", "0:1,1:1", "1:0,0:1", "0:1,1:2", "0:1, 1:0", "0:1,1:0,", "0:10,1:0", 12, null,
    "0:1,1:2,2:3,3:4,4:5,5:6,6:0"]) {
    assert.equal(parseMatchKey(k), null, String(k));
  }
  assert.equal(parseMatchKey("0:1,1:0", 3), null);
});

// ── What the browser receives ──────────────────────────────────────────────────────────────────

test("matchLayout: left in authored order, right rebuilt from the key alone", () => {
  assert.deepEqual(matchLayout(CONTENT, "0:2,1:3,2:0,3:1"), {
    left: ["Danmark", "Norge", "Sverige", "Finland"],
    right: ["Stockholm", "Helsinki", "København", "Oslo"],
  });
  assert.throws(() => matchLayout(CONTENT, "0:1,1:0"), /no valid instance key/);
  assert.throws(() => matchLayout(CONTENT, undefined), /no valid instance key/);
});

test("toPublicQuestion: a Match par payload carries the two lists and nothing that pairs them", () => {
  const key = "0:2,1:3,2:0,3:1";
  const pub = toPublicQuestion({ ...CONTENT, correct: "x", review_text: "y" }, "match", { domain: "geo", review_text: "z" }, key);
  assert.deepEqual(Object.keys(pub.content).sort(), ["match", "question"]);
  assert.deepEqual(pub.content.match, matchLayout(CONTENT, key));
  const wire = JSON.stringify(pub);
  for (const leak of ["pairs", key, "review_text", "correct"]) assert.equal(wire.includes(leak), false, leak);
  assert.ok(PUBLIC_CONTENT_KEYS.includes("match"));
  // No key, no payload — never a layout the server cannot grade.
  assert.throws(() => toPublicQuestion(CONTENT, "match", null));
  // Other formats ignore the key argument entirely.
  assert.deepEqual(toPublicQuestion({ question: "q", options: ["a", "b"] }, "mc", null, key).content, { question: "q", options: ["a", "b"] });
});

test("v1 safety: a match row reaching the MC mapping is refused, never shown as multiple choice", () => {
  // get-next-question's v1 mapAnswerFormat maps "match" to "match" since F-03 (the version deployed in
  // production before it maps it to "mc"). Either way a match row is never shown as MC: the MC payload
  // needs options, which a match row must not have (parseMatchPairs refuses options), so it is skipped.
  assert.throws(() => toPublicQuestion(CONTENT, "mc", null), /MC question missing valid options/);
  const index = read("supabase/functions/get-next-question/index.ts");
  const norm = index.match(/function normalizeContent\(raw: any, answer_format: string\) \{[\s\S]*?\n\}/)[0];
  assert.ok(norm.indexOf('if (answer_format === "mc")') < norm.indexOf('if (answer_format === "match")'));
});

// ── Registry, renderer, servability ───────────────────────────────────────────────────────────

test("registry: Match par is classified, rendered by match_pairs, and servable (F-03)", () => {
  const row = { answer_format: "match", answer_type: "short", content: CONTENT };
  assert.equal(classifyQuestion(row), "match_pairs");
  assert.equal(INTERACTION_KINDS.match_pairs.renderer, ANSWER_RENDERERS.MATCH_PAIRS);
  assert.equal(resolveAnswerRenderer(row), "match_pairs");
  assert.equal(INTERACTION_KINDS.match_pairs.servable, true);
  assert.equal(servableWireFormat(row), "match");
  // force_text or a long answer type is never Match par.
  assert.equal(servableWireFormat({ ...row, content: { ...CONTENT, force_text: true } }), null);
  assert.equal(servableWireFormat({ ...row, answer_type: "long" }), null);
  // The SQL twin: 20261019150000 says no explicitly; the activation migration 20261105141500 changes exactly
  // that line (tests/unit/match-pairs-activation-migration-run.test.mjs runs it).
  const sql = read("supabase/migrations/20261019150000_question_format_mix.sql");
  const fn = sql.match(/CREATE FUNCTION public\.question_is_servable\([\s\S]*?\n\$\$;/)[0];
  assert.match(fn, /WHEN p_answer_format = 'match' THEN false/);
  assert.equal((fn.match(/'match'/g) ?? []).length, 1);
  const activation = read("supabase/migrations/20261105141500_match_pairs_activation.sql");
  assert.ok(activation.includes("WHEN p_answer_format = ''match'' THEN (p_content -> ''force_text'') IS DISTINCT FROM ''true''::jsonb"));
});

// ── The answer shape ──────────────────────────────────────────────────────────────────────────

test("canonicalMatchAnswer: one connection per item, any order in, the key's form out", () => {
  const key = "0:2,1:0,2:1";
  assert.equal(canonicalMatchAnswer("[[2,1],[0,2],[1,0]]", key), "0:2,1:0,2:1");
  assert.equal(canonicalMatchAnswer([[0, 0], [1, 1], [2, 2]], key), "0:0,1:1,2:2");
  const bad = [
    "[[0,2],[1,0]]",               // incomplete
    "[[0,2],[0,0],[2,1]]",         // left used twice
    "[[0,2],[1,2],[2,1]]",         // right used twice
    "[[0,3],[1,0],[2,1]]",         // out of range
    "[[0,-1],[1,0],[2,1]]",
    "[[0,1.5],[1,0],[2,1]]",
    '[["0","2"],[1,0],[2,1]]',
    "[[0,2,9],[1,0],[2,1]]",
    "0:2,1:0,2:1",                 // the key itself is not an answer
    "not json", "", "{}", "null", JSON.stringify(Array(3).fill([0, 0])) + " ".repeat(200),
  ];
  for (const a of bad) assert.equal(canonicalMatchAnswer(a, key), null, a);
  assert.equal(canonicalMatchAnswer("[[0,1],[1,0]]", "garbage"), null);
});

test("grading by process_question_attempt's comparison is exact for every possible answer (2–5 pairs)", () => {
  for (let n = MATCH_MIN_PAIRS; n <= 5; n++) {
    const all = permutations(n);
    for (const keyPerm of all) {
      const key = keyOf(keyPerm);
      for (const answerPerm of all) {
        const canonical = canonicalMatchAnswer(JSON.stringify(answerPerm.map((r, l) => [l, r]).reverse()), key);
        const same = answerPerm.every((r, l) => r === keyPerm[l]);
        assert.equal(pqaNormalise(canonical) === pqaNormalise(key), same, `${key} vs ${canonical}`);
      }
    }
  }
});

// ── Wiring ────────────────────────────────────────────────────────────────────────────────────

test("get-next-question: the key is drawn at instance creation and every path lays out from the instance key", () => {
  const index = read("supabase/functions/get-next-question/index.ts");
  assert.match(index, /if \(answer_format === "match"\) \{[\s\S]*?return \{ question, correct: createMatchKey\(parseMatchPairs\(raw\)\.length\) \};/);
  // Due and repeat lay out from the instance key on BOTH approved paths:
  //   * K1_SERVED_SNAPSHOT off (delivered = null): the key read below, exactly as before;
  //   * on (L1 K1): the key stored in the round's delivered snapshot — the key of THIS round, the same
  //     one _v2 grades against and the attempt records.
  // The rows built from are the delivered version when there is one, else the question row (unchanged).
  assert.match(index, /const delivered = servedSnapshot \? await deliveredFor\(instance\.id\) : null;\s*const q = delivered \?\? instance\.questions;/);
  assert.match(index, /const instanceKey = delivered\s*\? \(format === "match" \? delivered\.key : undefined\)\s*: await matchInstanceKey\(format, instance\.id\);\s*const pub = toPublicQuestion\(q\.content, format, q\.metadata, instanceKey\)/);
  assert.match(index, /toPublicQuestion\(q\.content, format, q\.metadata, normalized\.correct\)/);
  assert.match(index, /const delivered = servedSnapshot \? await deliveredFor\(repeatRow\.id\) : null;\s*const src = delivered \?\? rq;/);
  assert.match(index, /const instanceKey = delivered\s*\? \(format === "match" \? delivered\.key : undefined\)\s*: await matchInstanceKey\(format, repeatRow\.id\);\s*const pub = toPublicQuestion\(src\.content, format, src\.metadata, instanceKey\)/);
  // The snapshot's key is only ever used for a "match" layout; every other format passes no key (as before).
  assert.equal((index.match(/delivered\.key/g) ?? []).length, 2);
  // The delivered version is read on the backend client, scoped to the verified student and the instance,
  // and a failed read is a visible 500 (the same error class), never a fallback to the question row.
  const snapRead = index.slice(index.indexOf("const deliveredFor"), index.indexOf("// 🔥 1. DUE QUESTIONS"));
  assert.match(snapRead, /await admin\(\)\s*\.from\("question_instances"\)\s*\.select\("served_snapshot"\)\s*\.eq\("id", instanceId\)\s*\.eq\("student_id", student_id\)\s*\.limit\(1\);/);
  assert.match(snapRead, /if \(error\) throw new InstanceKeyReadError/);
  assert.equal((index.match(/^\s*served_snapshot,$/gm) ?? []).length, 0, "the shared due/repeat selects stay unchanged");
  // The key is read only for a "match" row, on the backend client, scoped to the verified student — the
  // shared due/repeat selects stay as in the release-gated version (no correct_answer in them).
  const keyRead = index.slice(index.indexOf("const matchInstanceKey"), index.indexOf("// 🔥 1. DUE QUESTIONS"));
  assert.match(keyRead, /if \(format !== "match"\) return undefined;/);
  assert.match(keyRead, /await admin\(\)\s*\.from\("question_instances"\)\s*\.select\("correct_answer"\)\s*\.eq\("id", instanceId\)\s*\.eq\("student_id", student_id\)/);
  assert.match(keyRead, /if \(keyError\) throw new InstanceKeyReadError/);
  assert.equal((index.match(/^\s*correct_answer,$/gm) ?? []).length, 0);
  // A failed key read is a visible 500, never skipped as bad content.
  assert.equal((index.match(/if \(e instanceof InstanceKeyReadError\) throw e;/g) ?? []).length, 2);
  for (const resp of index.matchAll(/JSON\.stringify\(\{([\s\S]*?)\}\)/g)) assert.equal(/correct_answer|normalized/.test(resp[1]), false);
});

test("process-event: Match par is shape-checked, then graded and paid by process_question_attempt only", () => {
  const pe = read("supabase/functions/process-event/index.ts");
  const matchBlock = pe.slice(pe.indexOf('if (format === "match") {'), pe.indexOf("// ── PATH 3"));
  assert.match(matchBlock, /canonicalMatchAnswer\(answer, correct_answer\)/);
  assert.match(matchBlock, /status: 400/);
  assert.equal(/rpc|callProcess|isCorrect|xp|coins/i.test(matchBlock.replace(/process_question_attempt/g, "")), false);
  // The match branch sits after the long and short-text paths, before the shared MC / number RPC.
  assert.ok(pe.indexOf("// ── PATH 2:") < pe.indexOf('if (format === "match") {'));
  assert.ok(pe.indexOf('if (format === "match") {') < pe.indexOf("await callProcessQuestionAttempt("));
});

// ── Browser helpers ───────────────────────────────────────────────────────────────────────────

test("browser: readMatchLayout, parseMatchKey and matchCorrectionText agree with the server", () => {
  const key = "0:2,1:3,2:0,3:1";
  const layout = matchLayout(CONTENT, key);
  assert.deepEqual(client.readMatchLayout({ match: layout }), layout);
  for (const bad of [null, {}, { match: { left: ["a"], right: ["b"] } }, { match: { left: ["a", "b"], right: ["c"] } },
    { match: { left: ["a", ""], right: ["c", "d"] } }, { match: { left: "ab", right: "cd" } }]) {
    assert.equal(client.readMatchLayout(bad), null, JSON.stringify(bad));
  }
  for (const k of ["0:2,1:0,2:1", "0:1,1:1", "x"]) assert.deepEqual(client.parseMatchKey(k, 3), parseMatchKey(k, 3));
  assert.equal(client.matchCorrectionText(layout, key),
    "De rigtige par: Danmark → København · Norge → Oslo · Sverige → Stockholm · Finland → Helsinki");
  assert.equal(client.matchCorrectionText(layout, "0:1,1:0"), null);
  assert.equal(client.MATCH_MIN_PAIRS, MATCH_MIN_PAIRS);
  assert.equal(client.MATCH_MAX_PAIRS, MATCH_MAX_PAIRS);
});

// ── The award path, offline, against the production grading function ─────────────────────────

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const PUPIL = id(1), QUESTION = id(2);
const GRADING = read("supabase/migrations/20261018143726_fix_danish_question_bank_text.sql")
  .match(/EXECUTE \$grading\$\n([\s\S]*?)\n {2}\$grading\$/)[1];

async function fixture(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE TABLE questions(id uuid PRIMARY KEY, content jsonb, metadata jsonb, answer_format text);
    CREATE TABLE question_instances(id uuid PRIMARY KEY, student_id uuid, question_id uuid REFERENCES questions,
      correct_answer text, answered boolean DEFAULT false, was_correct boolean, repeat_count integer DEFAULT 0,
      answered_at timestamptz, user_answer text);
    CREATE TABLE student_progress(student_id uuid PRIMARY KEY, xp integer DEFAULT 0, coins integer DEFAULT 0,
      correct_answers integer DEFAULT 0, total_correct_answers integer DEFAULT 0);
    CREATE TABLE calls(name text);
    CREATE FUNCTION update_streak(uuid) RETURNS void LANGUAGE sql AS $$ INSERT INTO calls VALUES ('streak') $$;
    CREATE FUNCTION update_quest_progress_for_answer(uuid,boolean,integer) RETURNS void LANGUAGE sql AS $$ INSERT INTO calls VALUES ('quest') $$;
    CREATE FUNCTION update_weekly_quest_progress_for_answer(uuid,boolean,integer) RETURNS void LANGUAGE sql AS $$ INSERT INTO calls VALUES ('weekly') $$;
  `);
  await db.exec(GRADING);
  await db.query("INSERT INTO questions VALUES ($1, $2, '{}', 'match')", [QUESTION, JSON.stringify(CONTENT)]);
  await db.query("INSERT INTO student_progress(student_id) VALUES ($1)", [PUPIL]);
  return db;
}
async function answer(db, instance, key, pupilConnections, repeat = 0) {
  await db.query(
    "INSERT INTO question_instances(id, student_id, question_id, correct_answer, repeat_count) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING",
    [instance, PUPIL, QUESTION, key, repeat]);
  const graded = canonicalMatchAnswer(JSON.stringify(pupilConnections), key);
  assert.ok(graded, "process-event would refuse this shape");
  return (await db.query("SELECT process_question_attempt($1,$2,$3,0) AS r", [PUPIL, instance, graded])).rows[0].r;
}
const progress = async (db) => (await db.query("SELECT xp, coins, correct_answers FROM student_progress")).rows[0];
const calls = async (db) => (await db.query("SELECT name FROM calls")).rows.map((r) => r.name).sort();

test("PGlite: a correct Match par answer is paid once, like MC; the response key drives the browser feedback", async (t) => {
  const db = await fixture(t);
  const key = "0:2,1:3,2:0,3:1";
  const r = await answer(db, id(10), key, [[3, 1], [0, 2], [2, 0], [1, 3]]);
  assert.equal(r.status, "correct");
  assert.equal(r.correct_answer, key);
  assert.deepEqual(await progress(db), { xp: 10, coins: 5, correct_answers: 1 });
  assert.deepEqual(await calls(db), ["quest", "streak", "weekly"]);
  // The same submission again (a network retry): same verdict, no second award.
  const again = await answer(db, id(10), key, [[0, 2], [1, 3], [2, 0], [3, 1]]);
  assert.equal(again.status, "correct");
  assert.deepEqual(await progress(db), { xp: 10, coins: 5, correct_answers: 1 });
  const row = (await db.query("SELECT answered, was_correct, user_answer FROM question_instances WHERE id=$1", [id(10)])).rows[0];
  assert.deepEqual(row, { answered: true, was_correct: true, user_answer: key });
});

test("PGlite: one wrong connection is a wrong answer — nothing paid, streak still counted", async (t) => {
  const db = await fixture(t);
  const r = await answer(db, id(11), "0:2,1:3,2:0,3:1", [[0, 2], [1, 0], [2, 3], [3, 1]]);
  assert.equal(r.status, "incorrect");
  assert.deepEqual(await progress(db), { xp: 0, coins: 0, correct_answers: 0 });
  assert.deepEqual(await calls(db), ["quest", "streak", "weekly"]);
});

test("PGlite: a repeated Match par instance earns the token repeat award and no quest progress", async (t) => {
  const db = await fixture(t);
  const r = await answer(db, id(12), "0:1,1:0", [[0, 1], [1, 0]], 1);
  assert.equal(r.status, "correct");
  assert.deepEqual(await progress(db), { xp: 2, coins: 0, correct_answers: 0 });
  assert.deepEqual(await calls(db), ["streak"]);
});
