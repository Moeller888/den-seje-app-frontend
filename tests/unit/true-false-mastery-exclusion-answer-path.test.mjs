// F-02 Sandt/falsk — the ANSWER PATH under migration 20261105115000_true_false_mastery_exclusion.sql.
// Companion to true-false-mastery-exclusion-run.test.mjs, which proves the five folds and read models on a
// seeded history. This file drives REAL answers through production's answer functions — the legacy
// process_question_attempt and H5's process_question_attempt_v2 (both live in production since the H5
// bootstrap/align, 2026-11-04, and so in the isolated replay) — and then folds as get-next-question does.
//
// Ported from PR #621 (D-353, the governance session's alternative carrier, test file
// true-false-practice-only-level-migration-run.test.mjs) when the owner chose #623 as the one carrier
// (2026-11-05): the behavioural checks #623 lacked are kept here against #623's migration, with no second
// SQL implementation. #621's body-diff and helper-parity tests are not ported: #623 has no helper function
// (answer_format_moves_level), and its own run test already proves the bodies and the one rule.
//
// Proven:
//   1. ANSWER PATH: a correct true/false answer gives MC's XP and coins (10 + 5) and is registered; a wrong
//      one gives nothing; neither moves the level, the fold count or the band — via legacy and H5 alike,
//      also after 10 correct or 10 wrong in a row, folded after every answer as get-next-question does.
//   2. OTHER FORMATS: MC, number and Match par fold exactly as before (the TS twin foldLevel), also with
//      true/false answers in between; true/false neither counts nor breaks the band's correct-run.
//   3. GUARDS: a double submit gives no second XP on either path; repeated fold calls fold nothing twice;
//      a pupil can neither change a question's format nor call the folds, the folds take no format, and
//      whatever the answer text claims, the format is read from public.questions; repeats never fold.
//   4. NEGATIVE CONTROL: without the exclusion one correct true/false answer moves the level (the gap the
//      migration closes), and with no true/false rows the exclusion changes no fold.
//
// TEST-ONLY: Match par cannot be stored in production's questions yet (questions_answer_format_check), so
// the one match row is inserted after a test-only DROP of that constraint IN THIS DATABASE ONLY. Number and
// match verdicts are written directly to question_instances, as their graders leave them; the fold reads
// only the verdict and the format.
//
// HONEST LIMITS: PGlite is PostgreSQL 18.x (production 17.6) and runs as superuser; the answer and fold
// calls run under SET ROLE service_role like the Edge Functions' backend client, and the pupil checks under
// SET ROLE authenticated. PostgREST is not involved. Green here is not leave to apply the migration (D-110).
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { replaySchema } from "../isolated/schema/replay.mjs";
import { bootstrapMarkerSql } from "../isolated/seed/seed-guard.mjs";
import { foldLevel, levelStep } from "../../supabase/functions/get-next-question/level-flow.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const EXCLUSION_SQL = read("supabase/migrations/20261105115000_true_false_mastery_exclusion.sql");
const ACTIVATION_SQL = read("supabase/migrations/20261105120000_true_false_activation.sql");
const PLATFORM = read("tests/isolated/schema/pglite-platform.sql");

const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TF = Array.from({ length: 12 }, (_, i) => ({
  id: uid(9300 + i),
  content: { question: `Udsagn ${i}.`, correct: i % 2 === 0 ? "Sandt" : "Falsk" },
}));
const MC = Array.from({ length: 12 }, (_, i) => ({
  id: uid(9400 + i),
  content: { type: "mc", question: `MC ${i}?`, options: ["a", "b", "c", "d"], correct: "a" },
}));
const NUM = { id: uid(9500), content: { type: "number", question: "Hvornår?", correct: "1849" } };
const MATCH = { id: uid(9501), content: { type: "text", question: "Par?", correct: "x" } };
const wrongOf = (key) => (key === "Sandt" ? "Falsk" : "Sandt");

async function replayDb() {
  const db = new PGlite();
  await db.exec(PLATFORM);
  await db.exec(bootstrapMarkerSql("0123456789abcdef0123456789abcdef"));
  const r = await replaySchema({ exec: (s) => db.exec(s), query: async (s) => (await db.query(s)).rows });
  assert.deepEqual(r.failures, [], "the isolated replay builds");
  return db;
}

async function insertQuestion(db, id, format, content) {
  await db.query(`INSERT INTO public.questions (id, type, content, difficulty, difficulty_band, is_active, question_type,
      learning_objective, answer_format, answer_type, metadata, target_grade)
    VALUES ($1, $2, $3::jsonb, 1, 1::smallint, true, 'auto', 'world_war_2', $4, 'short', '{}'::jsonb, 5)`,
  [id, format === "mc" ? "mc_single" : format, JSON.stringify(content), format]);
}

// The required production order: exclusion (optional here, for the controls), then the activation.
async function answerDb({ withExclusion }) {
  const db = await replayDb();
  if (withExclusion) await db.exec(EXCLUSION_SQL);
  await db.exec(ACTIVATION_SQL);
  for (const q of TF) await insertQuestion(db, q.id, "true_false", q.content);
  for (const q of MC) await insertQuestion(db, q.id, "mc", q.content);
  await insertQuestion(db, NUM.id, "number", NUM.content);
  await db.exec("ALTER TABLE public.questions DROP CONSTRAINT questions_answer_format_check;   -- test-only, see header");
  await insertQuestion(db, MATCH.id, "match", MATCH.content);
  return db;
}

let nextPupil = 800;
async function addPupil(db) {
  const id = uid(nextPupil++);
  await db.query("INSERT INTO auth.users (id, email) VALUES ($1, $2)", [id, `elev${nextPupil}@example.test`]);
  await db.query("INSERT INTO public.profiles (id, role, selected_grade) VALUES ($1, 'student', 5)", [id]);
  // The replay's profile trigger may already have created the progress row; set the same start either way.
  await db.query(`INSERT INTO public.student_progress (student_id, xp, coins, correct_answers, total_correct_answers,
      current_streak, longest_streak, last_activity_date) VALUES ($1, 100, 50, 7, 7, 1, 1, current_date - 1)
    ON CONFLICT (student_id) DO UPDATE SET xp = 100, coins = 50, correct_answers = 7, total_correct_answers = 7,
      current_streak = 1, longest_streak = 1, last_activity_date = current_date - 1`, [id]);
  return id;
}

let clock = 0;
async function serve(db, pupil, questionId, key, repeatCount = 0) {
  return (await db.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, repeat_count,
      answered, next_review_at, difficulty_at_time, mastery_snapshot) VALUES ($1, $2, $3, $4, false, now(), 1, 1) RETURNING id`,
  [pupil, questionId, key, repeatCount])).rows[0].id;
}
// The answer functions stamp answered_at = now(), equal across fast calls inside PGlite; spread them so the
// (answered_at, id) fold order is the call order.
async function stamp(db, qi) {
  clock += 1;
  await db.query("UPDATE public.question_instances SET answered_at = timestamptz '2026-11-05 08:00:00+00' + $2 * interval '1 second' WHERE id = $1",
    [qi, clock]);
}
async function asService(db, sql, params = []) {
  await db.exec("SET ROLE service_role");
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("RESET ROLE"); }
}
async function answerLegacy(db, pupil, qi, answer) {
  const r = (await asService(db, "SELECT public.process_question_attempt($1, $2, $3, 0) AS r", [pupil, qi, answer]))[0].r;
  await stamp(db, qi);
  return r;
}
async function answerV2(db, pupil, qi, answer, submission = randomUUID()) {
  const r = (await asService(db, "SELECT public.process_question_attempt_v2($1, $2, $3, 1, $4, NULL, NULL) AS r",
    [pupil, qi, answer, submission]))[0].r;
  await stamp(db, qi);
  return r;
}
// A verdict as the number / match graders leave it.
async function verdict(db, pupil, questionId, correct) {
  const qi = await serve(db, pupil, questionId, "k");
  await db.query("UPDATE public.question_instances SET answered = true, was_correct = $2, is_correct = $2 WHERE id = $1", [qi, correct]);
  await stamp(db, qi);
  return qi;
}
const level = async (db, pupil) =>
  (await asService(db, "SELECT * FROM public.advance_student_level($1, 'historie', 5::smallint)", [pupil]))[0];
const band = async (db, pupil) =>
  (await asService(db, "SELECT * FROM public.advance_student_band($1, 5::smallint)", [pupil]))[0];
const progress = async (db, pupil) =>
  (await db.query("SELECT xp, coins FROM public.student_progress WHERE student_id = $1", [pupil])).rows[0];
const foldRows = async (db, pupil) =>
  Number((await db.query("SELECT count(*)::int AS n FROM public.student_level_fold_log WHERE student_id = $1", [pupil])).rows[0].n);

// ── Controls, each in its own database, built and closed ONE AT A TIME before the main database (several
//    PGlite instances at once exhausted the memory of a busy machine). ──────────────────────────────────
const CONTROL = {};
let db;
before(async () => {
  // Negative control: WITHOUT the exclusion, one correct true/false answer moves the level.
  const c = await answerDb({ withExclusion: false });
  const p = await addPupil(c);
  const seed = await level(c, p);
  const key = TF[0].content.correct;
  await answerLegacy(c, p, await serve(c, p, TF[0].id, key), key);
  const l = await level(c, p);
  CONTROL.negative = { seed: seed.level, level: l.level, answered: l.answered };
  // Zero effect: the same MC-only history WITHOUT the exclusion …
  CONTROL.mcOnly = [];
  const mcHistory = async (d) => {
    const q = await addPupil(d);
    const seq = [true, false, true, true, true, false, true];
    for (let i = 0; i < seq.length; i++) await answerLegacy(d, q, await serve(d, q, MC[i].id, "a"), seq[i] ? "a" : "b");
    const lv = await level(d, q);
    const b = await band(d, q);
    return [lv.level, lv.answered, b.band, b.folded];
  };
  CONTROL.mcOnly.push(await mcHistory(c));
  await c.close();

  db = await answerDb({ withExclusion: true });
  // … and WITH it (the main database, first pupil after the controls' numbering).
  CONTROL.mcOnly.push(await mcHistory(db));
});

// ── 1. The answer path: true/false never moves the level ────────────────────────────────────────────────

for (const [path, answer] of [["legacy", answerLegacy], ["H5", answerV2]]) {
  test(`${path}: one correct true/false answer gives MC's XP and coins and is registered; level unchanged`, async () => {
    const p = await addPupil(db);
    const seed = await level(db, p);
    const before = await progress(db, p);
    const qi = await serve(db, p, TF[0].id, TF[0].content.correct);
    const r = await answer(db, p, qi, TF[0].content.correct);
    assert.equal(r.status, "correct", JSON.stringify(r));
    const after = await progress(db, p);
    assert.deepEqual([after.xp - before.xp, after.coins - before.coins], [10, 5]);
    const inst = (await db.query("SELECT answered, was_correct FROM public.question_instances WHERE id = $1", [qi])).rows[0];
    assert.deepEqual(inst, { answered: true, was_correct: true }, "the answer is registered");
    const lvl = await level(db, p);
    assert.deepEqual([lvl.level, lvl.answered, lvl.newly_folded], [seed.level, 0, 0]);
    assert.equal(await foldRows(db, p), 0);
  });

  test(`${path}: one wrong true/false answer — no XP, level unchanged`, async () => {
    const p = await addPupil(db);
    const seed = await level(db, p);
    const before = await progress(db, p);
    const qi = await serve(db, p, TF[1].id, TF[1].content.correct);
    const r = await answer(db, p, qi, wrongOf(TF[1].content.correct));
    assert.equal(r.status, "incorrect", JSON.stringify(r));
    assert.deepEqual(await progress(db, p), before);
    const lvl = await level(db, p);
    assert.deepEqual([lvl.level, lvl.answered, lvl.newly_folded], [seed.level, 0, 0]);
  });

  for (const correct of [true, false]) {
    test(`${path}: 10 ${correct ? "correct" : "wrong"} true/false answers in a row — level, count and band unchanged`, async () => {
      const p = await addPupil(db);
      const seed = await level(db, p);
      const seedBand = await band(db, p);
      for (let i = 0; i < 10; i++) {
        const key = TF[i].content.correct;
        const qi = await serve(db, p, TF[i].id, key);
        const r = await answer(db, p, qi, correct ? key : wrongOf(key));
        assert.equal(r.status, correct ? "correct" : "incorrect");
        const lvl = await level(db, p);            // folded after every answer, as get-next-question does
        assert.deepEqual([lvl.level, lvl.answered, lvl.newly_folded], [seed.level, 0, 0], `after answer ${i + 1}`);
      }
      assert.equal(await foldRows(db, p), 0);
      const b = await band(db, p);
      assert.deepEqual([b.band, b.folded, b.newly_folded], [seedBand.band, 0, 0]);
    });
  }
}

test("legacy and H5 give the same XP, coins, level and band for the same true/false sequence", async () => {
  const seq = [true, true, false, true, false, false, true, true, true, true];
  const results = [];
  for (const answer of [answerLegacy, answerV2]) {
    const p = await addPupil(db);
    for (let i = 0; i < seq.length; i++) {
      const key = TF[i].content.correct;
      await answer(db, p, await serve(db, p, TF[i].id, key), seq[i] ? key : wrongOf(key));
    }
    const l = await level(db, p);
    const b = await band(db, p);
    results.push({ ...(await progress(db, p)), level: l.level, answered: l.answered, band: b.band, folded: b.folded });
  }
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual([results[0].answered, results[0].folded], [0, 0]);
  assert.deepEqual([results[0].xp, results[0].coins], [100 + 7 * 10, 50 + 7 * 5]);
});

// ── 2. MC, number and Match par: progression unchanged ──────────────────────────────────────────────────

test("MC: correct and wrong answers move the level exactly as before (+step / −3·step)", async () => {
  const up = await addPupil(db);
  const seed = await level(db, up);
  const qi = await serve(db, up, MC[0].id, "a");
  assert.equal((await answerLegacy(db, up, qi, "a")).status, "correct");
  const l1 = await level(db, up);
  assert.deepEqual([l1.level, l1.answered, l1.newly_folded], [Math.min(10000, seed.level + levelStep(0)), 1, 1]);

  const down = await addPupil(db);
  const seed2 = await level(db, down);
  const qi2 = await serve(db, down, MC[1].id, "a");
  assert.equal((await answerV2(db, down, qi2, "b")).status, "incorrect");
  const l2 = await level(db, down);
  assert.deepEqual([l2.level, l2.answered], [Math.max(1, seed2.level - 3 * levelStep(0)), 1]);
});

test("number and Match par verdicts move the level exactly like MC", async () => {
  for (const q of [NUM, MATCH]) {
    for (const correct of [true, false]) {
      const p = await addPupil(db);
      const seed = await level(db, p);
      await verdict(db, p, q.id, correct);
      const l = await level(db, p);
      assert.deepEqual([l.level, l.answered], [foldLevel({ level: seed.level, answered: 0 }, [correct]).level, 1],
        `${q.id} ${correct}`);
    }
  }
});

test("mixed sequence: the level equals the TS twin folded over the non-true/false verdicts only", async () => {
  const p = await addPupil(db);
  const seed = await level(db, p);
  const plan = [
    ["mc", true], ["tf", true], ["mc", true], ["tf", false], ["num", false], ["tf", true], ["match", true],
    ["mc", false], ["tf", true], ["tf", true], ["mc", true], ["tf", false], ["mc", true],
  ];
  let mc = 2; let tf = 0; const counted = [];
  for (const [kind, correct] of plan) {
    if (kind === "tf") {
      const key = TF[tf].content.correct;
      await answerLegacy(db, p, await serve(db, p, TF[tf++].id, key), correct ? key : wrongOf(key));
    } else if (kind === "mc") {
      await answerV2(db, p, await serve(db, p, MC[mc++].id, "a"), correct ? "a" : "b");
      counted.push(correct);
    } else {
      await verdict(db, p, kind === "num" ? NUM.id : MATCH.id, correct);
      counted.push(correct);
    }
    await level(db, p);
  }
  const expected = foldLevel({ level: seed.level, answered: 0 }, counted);
  const l = await level(db, p);
  assert.deepEqual([l.level, l.answered], [expected.level, expected.answered]);
  assert.equal(await foldRows(db, p), counted.length);
});

test("band: true/false answers between MC answers neither count nor break the correct-run", async () => {
  const p = await addPupil(db);
  const seed = await band(db, p);
  let tf = 0;
  for (let i = 0; i < 3; i++) {
    await answerLegacy(db, p, await serve(db, p, MC[i].id, "a"), "a");
    const key = TF[tf].content.correct;
    await answerLegacy(db, p, await serve(db, p, TF[tf++].id, key), wrongOf(key));   // two wrong would drop a band
  }
  const b = await band(db, p);
  assert.deepEqual([b.band, b.folded], [Math.min(5, seed.band + 1), 3]);
});

// ── 3. Guards ───────────────────────────────────────────────────────────────────────────────────────────

test("double submit: no second XP on either path; repeated fold calls fold nothing twice", async () => {
  const p = await addPupil(db);
  const before = await progress(db, p);
  const qi = await serve(db, p, TF[0].id, TF[0].content.correct);
  await answerLegacy(db, p, qi, TF[0].content.correct);
  try { await answerLegacy(db, p, qi, TF[0].content.correct); } catch { /* a rejected replay is also no second award */ }
  const sub = randomUUID();
  const qi2 = await serve(db, p, TF[1].id, TF[1].content.correct);
  await answerV2(db, p, qi2, TF[1].content.correct, sub);
  try { await answerV2(db, p, qi2, TF[1].content.correct, sub); } catch { /* a rejected replay is also no second award */ }
  const after = await progress(db, p);
  assert.deepEqual([after.xp - before.xp, after.coins - before.coins], [20, 10]);
  const first = await level(db, p);
  const again = await level(db, p);
  assert.deepEqual([again.level, again.answered, again.newly_folded], [first.level, 0, 0]);
});

test("manipulation: a pupil cannot change a question's format or call the folds; the folds take no format; the answer text cannot claim one", async () => {
  const p = await addPupil(db);
  const asPupil = async (sql) => {
    await db.exec("BEGIN");
    try {
      await db.exec("SET LOCAL ROLE authenticated");
      await db.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [p]);
      return { rows: (await db.query(sql)).rows };
    } catch (e) {
      return { error: String(e.message) };
    } finally {
      await db.exec("ROLLBACK");
    }
  };
  const upd = await asPupil(`UPDATE public.questions SET answer_format = 'mc' WHERE id = '${TF[0].id}' RETURNING id`);
  assert.ok(upd.error || upd.rows.length === 0, JSON.stringify(upd));
  assert.match((await asPupil(`SELECT * FROM public.advance_student_level('${p}', 'historie', 5::smallint)`)).error ?? "",
    /permission denied/);
  assert.match((await asPupil(`SELECT * FROM public.advance_student_band('${p}', 5::smallint)`)).error ?? "",
    /permission denied/);
  await assert.rejects(
    asService(db, `SELECT * FROM public.advance_student_level('${p}', 'historie', 5::smallint, 'mc')`),
    /does not exist/,
  );
  // The format is read from public.questions at fold time — whatever the answer text claims.
  const seed = await level(db, p);
  const claims = ["mc", "a", "MC_CORRECT", '{"answer_format":"mc"}'];
  for (let i = 0; i < claims.length; i++) {
    await answerLegacy(db, p, await serve(db, p, TF[2 + i].id, TF[2 + i].content.correct), claims[i]);
  }
  const l = await level(db, p);
  assert.deepEqual([l.level, l.answered], [seed.level, 0]);
});

test("repeats (repeat_count > 0) of a true/false question never fold, as for every format", async () => {
  const p = await addPupil(db);
  const seed = await level(db, p);
  const qi = await serve(db, p, TF[3].id, TF[3].content.correct, 1);
  await answerLegacy(db, p, qi, TF[3].content.correct);
  const l = await level(db, p);
  assert.deepEqual([l.level, l.answered], [seed.level, 0]);
});

// ── 4. Controls ─────────────────────────────────────────────────────────────────────────────────────────

test("negative control: WITHOUT the exclusion one correct true/false answer moves the level (the gap it closes)", () => {
  assert.deepEqual([CONTROL.negative.level, CONTROL.negative.answered],
    [Math.min(10000, CONTROL.negative.seed + levelStep(0)), 1]);
});

test("zero effect: the same MC-only history gives the same level and band with and without the exclusion", () => {
  assert.equal(CONTROL.mcOnly.length, 2);
  assert.deepEqual(CONTROL.mcOnly[0], CONTROL.mcOnly[1]);
  assert.equal(CONTROL.mcOnly[0][1], 7, "all seven MC answers folded");
});
