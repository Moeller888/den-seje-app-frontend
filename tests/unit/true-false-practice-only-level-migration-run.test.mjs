// D-353 — Sandt/falsk er en træningsform: XP og svarlog som før, men niveauet (og formatmixets bånd) flyttes
// aldrig. RUNTIME-bevis for migration 20261105173000_true_false_practice_only_level, kørt UÆNDRET på en rigtig
// PostgreSQL (PGlite) oven på produktionens svarkæde (helpers/answer-chain-schema.mjs: produktionsbaseret
// skema, niveaumotorens migrationer #351 → A → B og svarfunktionerne med deres live-kroppe), sandt/falsk-
// aktiveringen 20261105120000 og H5's process_question_attempt_v2 (20261030211428).
//
// Det, der bevises:
//   1. KROPPE: de to folder er byte-identiske med produktionens (B / #351) bortset fra filteret; vagten
//      stopper filen på en anden krop; signaturer, SECURITY-type og EXECUTE er uændrede; ingen funktion
//      tager et format som argument.
//   2. PARITET: SQL-listen over træningsformater = registry'ets wire-formater med gættegulv >= 0.5.
//   3. SANDT/FALSK: rigtigt → XP og mønter som MC, niveau uændret; forkert → niveau uændret; 10 rigtige og
//      10 forkerte i træk → niveau, `answered` og bånd uændret, ingen fold-log-række — via legacy-vejen
//      (process_question_attempt) og H5-vejen (process_question_attempt_v2) med samme resultat.
//   4. ANDRE FORMATER: MC, tal og Match par foldes præcis som før (TS-tvillingen foldLevel), også når
//      sandt/falsk-svar ligger imellem — de tæller ikke i step-størrelsen og bryder ikke båndets serier.
//   5. VÆRN: dobbelt indsendelse giver ikke dobbelt XP; gentagne fold-kald folder intet to gange; en elev kan
//      hverken ændre et spørgsmåls format, kalde klassificeringen eller give folden et format.
//   6. RÆKKEFØLGE: migrationen kan anvendes før og efter aktiveringen; uden true_false-rækker ændrer den
//      intet.
//
// TEST-ONLY: Match par kan ikke gemmes i produktionens questions endnu (questions_answer_format_check), så
// den ene match-række indsættes efter et test-only DROP af den constraint — som
// question-attempts-v2-match-grading.test.mjs gør. Tal- og match-verdicts skrives direkte i
// question_instances, sådan som deres bedømmere gør; folden læser kun verdicten og formatet.
//
// ÆRLIGE GRÆNSER: PGlite er PostgreSQL 18.x og superuser; kald kører under SET ROLE service_role som
// Edge-funktionernes backend-klient. PostgREST er ikke med. At testen er grøn, er ikke tilladelse til at
// anvende migrationen (D-110).
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { answerChainSql, readMigration, ATTEMPTS_MIGRATION_FILE } from "./helpers/answer-chain-schema.mjs";
import { INTERACTION_KINDS } from "../../supabase/functions/_shared/interaction-kinds.ts";
import { foldLevel, levelStep } from "../../supabase/functions/get-next-question/level-flow.ts";

const MIGRATION = "20261105173000_true_false_practice_only_level.sql";
const ACTIVATION = "20261105120000_true_false_activation.sql";
const B_FILE = "20261029120000_difficulty_scale_b.sql";
const MIX_FILE = "20261019150000_question_format_mix.sql";
const LEVEL_SIG = "public.advance_student_level(uuid,text,smallint)";
const BAND_SIG = "public.advance_student_band(uuid,smallint)";
const PROD_MD5 = { level: "4147c559353946a64c3ea1c791d19635", band: "0c6856ac2ae63eb2cd7ba3ce5d21ceb0" };

const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const N_TF = 12;
const TF = Array.from({ length: N_TF }, (_, i) => ({
  id: uid(9300 + i),
  content: { question: `Udsagn ${i}.`, correct: i % 2 === 0 ? "Sandt" : "Falsk" },
}));
const N_MC = 12;
const MC = Array.from({ length: N_MC }, (_, i) => ({
  id: uid(9400 + i),
  content: { type: "mc", question: `MC ${i}?`, options: ["a", "b", "c", "d"], correct: "a" },
}));
const NUM = { id: uid(9500), content: { type: "number", question: "Hvornår?", correct: "1849" } };
const MATCH = { id: uid(9501), content: { type: "text", question: "Par?", correct: "x" } };

const prosrcOf = (file, name) => {
  const s = readMigration(file);
  const i = s.indexOf(`FUNCTION public.${name}(`);
  const a = s.indexOf("AS $$", i) + 5;
  return s.slice(a, s.indexOf("$$;", a));
};

async function insertQuestion(db, id, format, content) {
  await db.query(`INSERT INTO public.questions (id, type, content, difficulty, is_active, question_type, learning_objective,
      answer_format, answer_type, metadata, difficulty_level)
    VALUES ($1, $2, $3, 1, true, 'auto', 'world_war_2', $4, 'short', '{}', 1000)`,
  [id, format === "mc" ? "mc_single" : format, JSON.stringify(content), format]);
}

async function freshDb({ withMigration = true } = {}) {
  const db = new PGlite();
  for (const sql of answerChainSql()) await db.exec(sql);
  await db.exec(readMigration(ACTIVATION));
  await db.exec(`
    INSERT INTO public.daily_quests (quest_key, label, type, target, reward_coins) VALUES
      ('d_answers', 'Svar', 'answer_count', 5, 10), ('d_correct', 'Rigtige', 'correct_count', 5, 10),
      ('d_xp', 'XP', 'xp_earned', 100, 10);
    INSERT INTO public.weekly_quests (quest_key, label, type, target, reward_coins) VALUES
      ('w_answers', 'Svar', 'answer_count', 50, 50), ('w_correct', 'Rigtige', 'correct_count', 50, 50);`);
  for (const q of TF) await insertQuestion(db, q.id, "true_false", q.content);
  for (const q of MC) await insertQuestion(db, q.id, "mc", q.content);
  await insertQuestion(db, NUM.id, "number", NUM.content);
  await db.exec("ALTER TABLE public.questions DROP CONSTRAINT questions_answer_format_check;   -- test-only, see header");
  await insertQuestion(db, MATCH.id, "match", MATCH.content);
  await db.exec(readMigration(ATTEMPTS_MIGRATION_FILE));
  if (withMigration) await db.exec(readMigration(MIGRATION));
  return db;
}

let nextPupil = 800;
async function addPupil(db) {
  const id = uid(nextPupil++);
  await db.exec(`INSERT INTO auth.users VALUES ('${id}');
    INSERT INTO public.profiles (id, role, selected_grade) VALUES ('${id}', 'student', 5);
    INSERT INTO public.student_progress (student_id, xp, coins, correct_answers, total_correct_answers,
      current_streak, longest_streak, last_activity_date) VALUES ('${id}', 100, 50, 7, 7, 1, 1, current_date - 1);`);
  return id;
}

let clock = 0;
async function serve(db, pupil, questionId, key, repeatCount = 0) {
  return (await db.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, repeat_count,
      answered, next_review_at) VALUES ($1, $2, $3, $4, false, now()) RETURNING id`,
  [pupil, questionId, key, repeatCount])).rows[0].id;
}
// The answer functions stamp answered_at = now(), which is constant inside PGlite's implicit transaction
// per statement but equal across fast calls; spread them so the (answered_at, id) fold order is the call order.
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
const wrongOf = (key) => (key === "Sandt" ? "Falsk" : "Sandt");

let db;
before(async () => { db = await freshDb(); });

// ── 1. Kroppe, signaturer, rettigheder ──────────────────────────────────────────────────────────────────

test("bodies: identical to production's B / #351 bodies except the D-353 filter", () => {
  const diff = (file, name) => {
    const old = prosrcOf(file, name).split("\n");
    const neu = prosrcOf(MIGRATION, name).split("\n");
    return { added: neu.filter((l) => !old.includes(l)), removed: old.filter((l) => !neu.includes(l)) };
  };
  const lvl = diff(B_FILE, "advance_student_level");
  assert.deepEqual(lvl.removed, []);
  assert.deepEqual(lvl.added.map((l) => l.trim()),
    ["AND public.answer_format_moves_level(q.answer_format)   -- D-353: training formats never fold"]);
  const bnd = diff(MIX_FILE, "advance_student_band");
  assert.deepEqual(bnd.removed, []);
  assert.equal(bnd.added.length, 4);
  assert.match(bnd.added.join("\n"), /NOT EXISTS[\s\S]*NOT public\.answer_format_moves_level\(q\.answer_format\)/);
});

test("bodies: the repository files B / #351 still hash to production's live prosrc (the guard's md5s)", async () => {
  const fresh = await freshDb({ withMigration: false });
  const rows = (await fresh.query(`SELECT md5(prosrc) AS m, oid::regprocedure::text AS f FROM pg_proc
    WHERE oid IN (to_regprocedure('${LEVEL_SIG}'), to_regprocedure('${BAND_SIG}')) ORDER BY 2`)).rows;
  assert.deepEqual(rows.map((r) => r.m), [PROD_MD5.band, PROD_MD5.level]);
  await fresh.close();
});

test("guard: an unreviewed advance_student_level body stops the file before anything changes", async () => {
  const fresh = await freshDb({ withMigration: false });
  await fresh.exec(`CREATE OR REPLACE FUNCTION public.advance_student_level(p_student_id uuid, p_subject text, p_grade smallint)
    RETURNS TABLE (level integer, seed_level integer, seed_source text, answered integer, newly_folded integer)
    LANGUAGE plpgsql AS $$ BEGIN RETURN; END; $$;`);
  await assert.rejects(fresh.exec(readMigration(MIGRATION)), /D-353: advance_student_level has an unreviewed body/);
  assert.equal((await fresh.query("SELECT to_regprocedure('public.answer_format_moves_level(text)') AS f")).rows[0].f, null);
  await fresh.close();
});

test("privileges and signatures: unchanged; EXECUTE service_role only; no fold takes a format", async () => {
  const rows = (await db.query(`SELECT oid::regprocedure::text AS f, prosecdef, proconfig, proacl::text AS acl
    FROM pg_proc WHERE oid IN (to_regprocedure('${LEVEL_SIG}'), to_regprocedure('${BAND_SIG}'),
      to_regprocedure('public.answer_format_moves_level(text)')) ORDER BY 1`)).rows;
  assert.deepEqual(rows.map((r) => [r.f, r.prosecdef]), [
    ["advance_student_band(uuid,smallint)", true],
    ["advance_student_level(uuid,text,smallint)", false],
    ["answer_format_moves_level(text)", false],
  ]);
  for (const r of rows) {
    assert.deepEqual(r.proconfig, ["search_path=public, pg_temp"], r.f);
    assert.doesNotMatch(r.acl, /(^|[{,])(anon|authenticated)?=X/, `${r.f}: ${r.acl}`);
    assert.match(r.acl, /service_role=X/, r.f);
  }
  const overloads = (await db.query(`SELECT count(*)::int AS n FROM pg_proc
    WHERE proname IN ('advance_student_level', 'advance_student_band') AND pronamespace = 'public'::regnamespace`)).rows[0].n;
  assert.equal(overloads, 2, "no format-taking overload exists");
});

// ── 2. Paritet med registry'et ──────────────────────────────────────────────────────────────────────────

test("parity: SQL training formats = registry wire formats with guess floor >= 0.5 (today: true_false only)", async () => {
  const training = new Set();
  const levelled = new Set();
  for (const kind of Object.values(INTERACTION_KINDS)) {
    if (kind.guessFloor !== null && kind.guessFloor >= 0.5) training.add(kind.wireFormat);
    else levelled.add(kind.wireFormat);
  }
  assert.deepEqual([...training], ["true_false"]);
  for (const f of training) assert.equal(levelled.has(f), false, `${f} is both`);
  const moves = async (f) => (await asService(db, "SELECT public.answer_format_moves_level($1) AS m", [f]))[0].m;
  for (const f of training) assert.equal(await moves(f), false, f);
  for (const f of [...levelled, null, "", "True_False", "unknown"]) assert.equal(await moves(f), true, String(f));
});

// ── 3. Sandt/falsk flytter aldrig niveauet ──────────────────────────────────────────────────────────────

for (const [path, answer] of [["legacy", answerLegacy], ["H5", answerV2]]) {
  test(`${path}: one correct true/false answer gives MC's XP and coins, level unchanged`, async () => {
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

  test(`${path}: one wrong true/false answer — level unchanged, no XP`, async () => {
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

// ── 4. MC, tal og Match par: uændret progression ────────────────────────────────────────────────────────

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

// ── 5. Værn ─────────────────────────────────────────────────────────────────────────────────────────────

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

test("manipulation: a pupil cannot change a question's format, call the classifier or pass a format to the fold", async () => {
  const p = await addPupil(db);
  const asPupil = async (sql) => {
    await db.exec("BEGIN");
    try {
      await db.exec("SET LOCAL ROLE authenticated");
      await db.query("SELECT set_config('test.uid', $1, true)", [p]);
      return { rows: (await db.query(sql)).rows };
    } catch (e) {
      return { error: String(e.message) };
    } finally {
      await db.exec("ROLLBACK");
    }
  };
  const upd = await asPupil(`UPDATE public.questions SET answer_format = 'mc' WHERE id = '${TF[0].id}' RETURNING id`);
  assert.ok(upd.error || upd.rows.length === 0, JSON.stringify(upd));
  assert.match((await asPupil("SELECT public.answer_format_moves_level('true_false')")).error ?? "", /permission denied/);
  assert.match((await asPupil(`SELECT * FROM public.advance_student_level('${p}', 'historie', 5::smallint)`)).error ?? "",
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

// ── 6. Rækkefølge og nul-effekt ─────────────────────────────────────────────────────────────────────────

test("order: the file applies before the activation migration, and changes no fold without true/false rows", async () => {
  const fresh = new PGlite();
  for (const sql of answerChainSql()) await fresh.exec(sql);
  await fresh.exec(readMigration(MIGRATION));
  await fresh.exec(readMigration(ACTIVATION));
  const n = (await fresh.query("SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'answer_format_moves_level'")).rows[0].n;
  assert.equal(n, 1);
  await fresh.close();

  // Same MC history with and without the file → same level and band.
  const out = [];
  for (const withMigration of [false, true]) {
    const d = await freshDb({ withMigration });
    nextPupil = 990;
    const p = await addPupil(d);
    const seq = [true, false, true, true, true, false, true];
    for (let i = 0; i < seq.length; i++) await answerLegacy(d, p, await serve(d, p, MC[i].id, "a"), seq[i] ? "a" : "b");
    const l = await level(d, p);
    const b = await band(d, p);
    out.push([l.level, l.answered, b.band, b.folded]);
    await d.close();
  }
  assert.deepEqual(out[0], out[1]);
});

test("negative control: WITHOUT this file one correct true/false answer moves the level (the gap it closes)", async () => {
  const d = await freshDb({ withMigration: false });
  nextPupil = 995;
  const p = await addPupil(d);
  const seed = await level(d, p);
  const key = TF[0].content.correct;
  await answerLegacy(d, p, await serve(d, p, TF[0].id, key), key);
  const l = await level(d, p);
  assert.deepEqual([l.level, l.answered], [Math.min(10000, seed.level + levelStep(0)), 1]);
  await d.close();
});
