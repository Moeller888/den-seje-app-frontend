// RUNTIME proof of the COMBINATION: the H5/K1-track PROPOSAL docs/laerligverse/forslag-k1-belonning-kursussvar.sql
// (NOT a migration — it lives outside supabase/migrations and is applied nowhere but in these test databases)
// together with migration 20261108171500_course_progress_rewards. PGlite over the full isolated replay; two
// databases built the same way: BASE (replay + migration, production's reward bodies) and PROP (replay +
// proposal + migration). Synthetic pupils only.
//
// Proven:
//   A. The proposal file: outside migrations, labelled a proposal; its guard pins exactly the replay's (=
//      production's) four bodies; applying it changes only the bodies (signature, SECURITY DEFINER, search_path,
//      owner, EXECUTE unchanged) to the after-md5s it names; a re-run is accepted, an unknown body aborts it; the
//      award function's guard list is exactly the proposal's after-md5s.
//   B. ORDINARY answers pay exactly as before on all four reward paths: 10+5 first answer, 2+1 repeat, 0 wrong,
//      counters, quests, streak, attempt rows, replies — PROP and BASE give identical figures.
//   C. COURSE answers through all four paths pay 0 XP / 0 coins, never touch correct_answers /
//      total_correct_answers or quests; grading, streak and the attempt row (amounts 0) stay.
//   D. A full Arkivskab sequence pays EXACTLY the milestone rewards (61 XP + 26 coins) and nothing per answer.
//   E. Retries, replays and repetition farming pay 0; the award stays at one payout; a failure inside the award
//      transaction leaves no partial payment and the retry pays exactly once.
//   F. The double-pay GUARD: while any reward function still has a body that pays course answers (BASE, or one
//      body restored in PROP), award_course_milestones refuses with 'reward_path_not_ready' and writes nothing.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { replaySchema } from "../isolated/schema/replay.mjs";
import { bootstrapMarkerSql } from "../isolated/seed/seed-guard.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const PROPOSAL = "docs/laerligverse/forslag-k1-belonning-kursussvar.sql";
const MIGRATION = "supabase/migrations/20261108171500_course_progress_rewards.sql";
const SIGS = {
  pqa: "public.process_question_attempt(uuid,uuid,text,bigint)",
  v2: "public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text)",
  text: "public.process_text_answer(uuid,uuid,text,boolean)",
  textV2: "public.process_text_answer_v2(uuid,uuid,text,boolean,integer,uuid,text,text)",
  review: "public.review_answer(uuid,integer,text,uuid)",
};
// review: BEFORE is the isolated replay's STUB (production's body is not in the repository; see the proposal).
const BEFORE = { pqa: "2e05e769a102f61ffef0ea4dd550c55b", v2: "8a7696147df978e250918b2c93e20577", text: "e80727ea87ffdc64988e5a09dcb20356", textV2: "f880984680d52b20d07c628a9dfae474", review: "228aca24e326a57663d761b78eba1e12" };
const AFTER = { pqa: "a91a651c32b8f0d4a8efad588f2f78dd", v2: "f241c2115ec48441efc9e695b028d2d2", text: "62589388dae732ad79ca8f893027785d", textV2: "098969e41b5c85a00e21a733093d7ecb", review: "d3e08630604112b593c218cc07ad496b" };
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

async function replayed() {
  const db = new PGlite();
  await db.exec(read("tests/isolated/schema/pglite-platform.sql"));
  await db.exec(bootstrapMarkerSql("0123456789abcdef0123456789abcdef"));
  const r = await replaySchema({ exec: (s) => db.exec(s), query: async (s) => (await db.query(s)).rows });
  assert.deepEqual(r.failures, []);
  return db;
}
const fnFacts = async (db) => Object.fromEntries(await Promise.all(Object.entries(SIGS).map(async ([k, sig]) => {
  const r = (await db.query(`SELECT md5(prosrc) AS m, prosecdef, proconfig::text AS cfg, pg_get_userbyid(proowner) AS owner,
    proacl::text AS acl, pg_get_function_result(oid) AS res FROM pg_proc WHERE oid = to_regprocedure($1)`, [sig])).rows[0];
  return [k, r ?? null];
})));
const defOf = async (db, sig) => (await db.query("SELECT pg_get_functiondef(to_regprocedure($1)) AS d", [sig])).rows[0].d;

let BASE, PROP, factsBefore, factsAfter, originalDefs;
before(async () => {
  BASE = await replayed();
  PROP = await replayed();
  factsBefore = await fnFacts(PROP);
  originalDefs = Object.fromEntries(await Promise.all(Object.entries(SIGS).map(async ([k, s]) => [k, await defOf(PROP, s)])));
  await PROP.exec(read(PROPOSAL));
  factsAfter = await fnFacts(PROP);
  for (const db of [BASE, PROP]) await db.exec(read(MIGRATION));
});
after(async () => { await BASE?.close(); await PROP?.close(); });

// ── fixtures ──────────────────────────────────────────────────────────────────────────────────────────
let nextPupil = 300;
async function addPupil(db, n) {
  const id = uid(n);
  await db.query("INSERT INTO auth.users (id, email) VALUES ($1, $2)", [id, `p${n}@example.test`]);
  await db.query("INSERT INTO public.profiles (id, role, selected_grade) VALUES ($1, 'student', 7)", [id]);
  await db.query(`INSERT INTO public.student_progress (student_id, xp, coins, correct_answers, total_correct_answers,
      current_streak, longest_streak, last_activity_date) VALUES ($1, 100, 50, 7, 7, 1, 1, current_date - 1)
    ON CONFLICT (student_id) DO UPDATE SET xp = 100, coins = 50, correct_answers = 7, total_correct_answers = 7,
      current_streak = 1, longest_streak = 1, last_activity_date = current_date - 1`, [id]);
  return id;
}
// The same pupil id in both databases, so the two runs are comparable.
const pupilBoth = async () => { const n = nextPupil++; return [await addPupil(BASE, n), await addPupil(PROP, n)][0]; };
const pupilIn = async (db) => addPupil(db, nextPupil++);

let qn = 0;
async function question(db, { objective = "lv_k1", metadata = null, format = "mc" } = {}) {
  qn++;
  const right = `Rigtig ${qn}`;
  const content = format === "text" ? { type: "text", question: `Skriv ordet ${qn}`, correct: right }
    : { type: "mc", question: `Spørgsmål ${qn}?`, options: [right, `Forkert ${qn}`], correct: right };
  const id = (await db.query(`INSERT INTO public.questions (type, content, difficulty, difficulty_band, is_active, question_type,
      learning_objective, answer_format, answer_type, target_grade, metadata)
    VALUES ($1, $2::jsonb, 2, 2, true, 'auto', $3, $4, 'short', 7, $5::jsonb) RETURNING id`,
    [format === "text" ? "text_input" : "mc_single", JSON.stringify(content), objective, format,
      metadata === null ? null : JSON.stringify(metadata)])).rows[0].id;
  return { id, right };
}
const course = (step, objective = "lv_k1") => ({ objective, metadata: { learning_step: step } });
const ordinary = (objective = "historie_quiz") => ({ objective, metadata: { domain: "historie" } });

async function open(db, pupil, q) {
  return (await db.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer,
      difficulty_at_time, mastery_snapshot, answered, repeat_count) VALUES ($1, $2, $3, 1, 1, false, 0) RETURNING id`,
    [pupil, q.id, q.right])).rows[0].id;
}
async function reopen(db, inst) {
  await db.query(`UPDATE public.question_instances SET answered = false, was_correct = NULL, answered_at = NULL,
    user_answer = NULL, repeat_count = repeat_count + 1 WHERE id = $1`, [inst]);
}
const roundOf = async (db, inst) => (await db.query("SELECT repeat_count + 1 AS r FROM public.question_instances WHERE id = $1", [inst])).rows[0].r;
async function asService(db, sql, params) {
  await db.exec("SET ROLE service_role");
  try { return (await db.query(sql, params)).rows[0].r; } finally { await db.exec("RESET ROLE"); }
}
// One answer through one reward path; returns the RPC's reply with volatile fields removed.
async function answerVia(db, path, pupil, inst, q, correct, submission = randomUUID()) {
  const ans = correct ? q.right : "noget forkert";
  if (path === "pqa") return asService(db, "SELECT public.process_question_attempt($1, $2, $3, $4) AS r", [pupil, inst, ans, Date.now()]);
  if (path === "v2") return asService(db, "SELECT public.process_question_attempt_v2($1, $2, $3, $4, $5, NULL, NULL) AS r",
    [pupil, inst, ans, await roundOf(db, inst), submission]);
  if (path === "text") return asService(db, "SELECT public.process_text_answer($1, $2, $3, $4) AS r", [inst, pupil, ans, correct]);
  return asService(db, "SELECT public.process_text_answer_v2($1, $2, $3, $4, $5, $6, NULL, NULL) AS r",
    [inst, pupil, ans, correct, await roundOf(db, inst), submission]);
}
async function award(db, pupil, objective) {
  return asService(db, "SELECT public.award_course_milestones($1, $2) AS r", [pupil, objective]);
}
async function effects(db, p) {
  const q = async (sql) => (await db.query(sql, [p])).rows;
  return {
    progress: (await q(`SELECT xp, coins, correct_answers, total_correct_answers, current_streak, longest_streak, last_activity_date,
      level, mastery_level, mastery_score FROM public.student_progress WHERE student_id = $1`))[0],
    daily: await q(`SELECT d.quest_key, p.progress FROM public.student_quest_progress p JOIN public.daily_quests d ON d.id = p.quest_id
      WHERE p.student_id = $1 ORDER BY 1`),
    weekly: await q(`SELECT w.quest_key, p.progress FROM public.student_weekly_quest_progress p JOIN public.weekly_quests w ON w.id = p.quest_id
      WHERE p.student_id = $1 ORDER BY 1`),
    attempts: await q(`SELECT attempt_no, status, was_correct, is_repeat, xp_awarded, coins_awarded, source
      FROM public.question_attempts WHERE student_id = $1 ORDER BY created_at, attempt_no`),
    ledger: await q("SELECT milestone_key, xp_awarded, coins_awarded FROM public.course_progress_rewards WHERE student_id = $1 ORDER BY id"),
  };
}
const money = async (db, p) => (await db.query("SELECT xp, coins, correct_answers, total_correct_answers FROM public.student_progress WHERE student_id = $1", [p])).rows[0];

// ── A. the proposal file ──────────────────────────────────────────────────────────────────────────────
test("A. the proposal lives outside supabase/migrations and says it is a proposal for the H5/K1 track", () => {
  const sql = read(PROPOSAL);
  assert.ok(!PROPOSAL.startsWith("supabase/migrations/"));
  assert.match(sql, /FORSLAG TIL H5\/K1-SPORET — IKKE EN MIGRATION/);
  assert.match(read("docs/laerligverse/forslag-k1-belonning-kursussvar.md"), /forslag-k1-belonning-kursussvar\.sql/);
});

test("A. its guard pins the replay's (= production's) bodies; applying it changes ONLY the four bodies, to the named after-md5s", () => {
  for (const k of Object.keys(SIGS)) {
    assert.equal(factsBefore[k].m, BEFORE[k], `${k} before`);
    assert.equal(factsAfter[k].m, AFTER[k], `${k} after`);
    for (const f of ["prosecdef", "cfg", "owner", "acl", "res"]) {
      if (k === "review" && f === "res") continue; // review_answer: void → integer (the XP it awarded), by design
      assert.equal(factsAfter[k][f], factsBefore[k][f], `${k} ${f} unchanged`);
    }
    const sql = read(PROPOSAL);
    assert.ok(sql.includes(`'${BEFORE[k]}', '${AFTER[k]}')`), `${k}: guard row pins before and after`);
  }
});

test("A. the award function's guard list is exactly the proposal's after-md5s", () => {
  const mig = read(MIGRATION).replace(/--.*$/gm, "");
  const listed = [...mig.matchAll(/'([0-9a-f]{32})'/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(listed)].sort(), Object.values(AFTER).sort());
});

test("A. a re-run of the proposal is accepted (no change); an unreviewed body aborts it and changes nothing", async () => {
  await PROP.exec(read(PROPOSAL));
  assert.deepEqual(await fnFacts(PROP), factsAfter);
  await PROP.exec("BEGIN");
  try {
    await PROP.exec(`CREATE OR REPLACE FUNCTION public.process_text_answer(p_instance_id uuid, p_user_id uuid, p_user_answer text, p_is_correct boolean)
      RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$ BEGIN RETURN 'x'; END $f$`);
    await assert.rejects(PROP.exec(read(PROPOSAL)), /ureviewet krop/);
  } finally {
    await PROP.exec("ROLLBACK");
  }
  assert.deepEqual(await fnFacts(PROP), factsAfter);
});

// ── B. ordinary answers unchanged ─────────────────────────────────────────────────────────────────────
for (const path of ["pqa", "v2", "text", "textV2"]) {
  test(`B. ordinary answers via ${path}: identical figures with and without the proposal (first, wrong, repeat, replay)`, async () => {
    const p = await pupilBoth();
    const run = async (db) => {
      const fmt = path.startsWith("text") ? "text" : "mc";
      const replies = [];
      const q1 = await question(db, { ...ordinary(), format: fmt });
      const i1 = await open(db, p, q1);
      const sub = randomUUID();
      replies.push(await answerVia(db, path, p, i1, q1, true, sub));        // first correct
      replies.push(await answerVia(db, path, p, i1, q1, true, sub));        // replay / second call
      const q2 = await question(db, { ...ordinary(), format: fmt });
      const i2 = await open(db, p, q2);
      replies.push(await answerVia(db, path, p, i2, q2, false));            // wrong
      if (path !== "text") {                                                // legacy text has no repeat path of its own
        await reopen(db, i1);
        replies.push(await answerVia(db, path, p, i1, q1, true));           // correct repeat
      }
      const e = await effects(db, p);
      return { replies: JSON.stringify(replies).replace(/Rigtig \d+/g, "R"), e: JSON.stringify(e) };
    };
    const base = await run(BASE);
    const prop = await run(PROP);
    assert.deepEqual(prop, base);
    const m = await money(PROP, p);
    // Production's figures: 10+5 first answer, 2+1 MC repeat (D-211), 0 wrong. process_text_answer_v2 has no
    // repeat rate of its own: a correct reopened text round pays 10+5 and counts again (unchanged by the proposal).
    const expected = path === "text" ? [110, 55, 8, 8] : path === "textV2" ? [120, 60, 9, 9] : [112, 56, 8, 8];
    assert.deepEqual([m.xp, m.coins, m.correct_answers, m.total_correct_answers], expected);
  });
}

// ── C. course answers pay nothing per answer ──────────────────────────────────────────────────────────
for (const path of ["pqa", "v2", "text", "textV2"]) {
  test(`C. course answers via ${path} pay 0 XP / 0 coins; counters and quests untouched; grading and streak as before`, async () => {
    const p = await pupilIn(PROP);
    const fmt = path.startsWith("text") ? "text" : "mc";
    const before = await effects(PROP, p);
    const q = await question(PROP, { ...course("guided_practice", `lv_c_${path}`), format: fmt });
    const inst = await open(PROP, p, q);
    const r = await answerVia(PROP, path, p, inst, q, true);
    if (path === "pqa") assert.equal(r.status, "correct");
    if (path === "v2" || path === "textV2") assert.deepEqual([r.outcome, r.status, r.xp_awarded, r.coins_awarded], ["recorded", "correct", 0, 0]);
    if (path === "text") assert.equal(r, "rewarded", "the reply contract is unchanged");
    const after = await effects(PROP, p);
    assert.deepEqual([after.progress.xp, after.progress.coins, after.progress.correct_answers, after.progress.total_correct_answers],
      [before.progress.xp, before.progress.coins, before.progress.correct_answers, before.progress.total_correct_answers]);
    assert.deepEqual([after.daily, after.weekly], [before.daily, before.weekly], "quests not advanced");
    assert.equal(after.progress.current_streak, before.progress.current_streak + 1, "streak still counts showing up");
    const graded = (await PROP.query("SELECT answered, was_correct FROM public.question_instances WHERE id = $1", [inst])).rows[0];
    assert.deepEqual(graded, { answered: true, was_correct: true });
    if (path === "v2" || path === "textV2") assert.deepEqual(after.attempts.map((a) => [a.xp_awarded, a.coins_awarded]), [[0, 0]], "attempt row with amounts 0");
  });
}

// ── D. a full sequence pays exactly the milestones ────────────────────────────────────────────────────
test("D. a full Arkivskab sequence (mixed MC paths) pays exactly 61 XP + 26 coins, nothing per answer, total_correct_answers unchanged", async () => {
  const p = await pupilIn(PROP);
  const m0 = await money(PROP, p);
  const steps = [["guided_practice", "pqa"], ["independent_application", "v2"], ["transfer", "pqa"], ["revisit", "v2"]];
  for (const [step, path] of steps) {
    const q = await question(PROP, course(step, "lv_d"));
    await answerVia(PROP, path, p, await open(PROP, p, q), q, true);
  }
  assert.deepEqual(await money(PROP, p), m0, "the four answers paid nothing");
  const r = await award(PROP, p, "lv_d");
  assert.deepEqual([r.outcome, r.xp_awarded, r.coins_awarded], ["awarded", 61, 26]);
  const m1 = await money(PROP, p);
  assert.deepEqual([m1.xp - m0.xp, m1.coins - m0.coins, m1.correct_answers - m0.correct_answers,
    m1.total_correct_answers - m0.total_correct_answers], [61, 26, 0, 0]);
});

// ── E. retries, replays, farming, failure ─────────────────────────────────────────────────────────────
test("E. replays, second calls and repetition farming pay 0; the award pays once", async () => {
  const p = await pupilIn(PROP);
  const q = await question(PROP, course("guided_practice", "lv_e"));
  const inst = await open(PROP, p, q);
  const sub = randomUUID();
  await answerVia(PROP, "v2", p, inst, q, true, sub);
  assert.equal((await answerVia(PROP, "v2", p, inst, q, true, sub)).outcome, "replay");
  const m0 = await money(PROP, p);
  assert.deepEqual([(await award(PROP, p, "lv_e")).xp_awarded, (await award(PROP, p, "lv_e")).xp_awarded], [3, 0]);
  const m1 = await money(PROP, p);
  for (let i = 0; i < 5; i++) {                       // farm the same course item: reopen + correct, both paths
    await reopen(PROP, inst);
    await answerVia(PROP, i % 2 ? "pqa" : "v2", p, inst, q, true);
    assert.equal((await award(PROP, p, "lv_e")).xp_awarded, 0);
  }
  assert.deepEqual(await money(PROP, p), m1, "5 farmed repeats + 5 award calls: 0 XP, 0 coins, counters unchanged");
  assert.deepEqual([m1.xp - m0.xp, m1.coins - m0.coins], [3, 1]);
});

test("E. a failure inside the award transaction leaves no partial payment; the retry pays exactly once", async () => {
  const p = await pupilIn(PROP);
  for (const step of ["guided_practice", "independent_application", "transfer", "revisit"]) {
    const q = await question(PROP, course(step, "lv_fail"));
    await answerVia(PROP, "pqa", p, await open(PROP, p, q), q, true);
  }
  const m0 = await money(PROP, p);
  await PROP.exec(`CREATE FUNCTION public.zz_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected'; END $$;
    CREATE TRIGGER zz_fail AFTER INSERT ON public.course_progress_rewards FOR EACH ROW
      WHEN (NEW.milestone_key = 'sequence_bonus:lv_fail') EXECUTE FUNCTION public.zz_fail();`);
  try {
    await assert.rejects(award(PROP, p, "lv_fail"), /injected/);
  } finally {
    await PROP.exec("DROP TRIGGER zz_fail ON public.course_progress_rewards; DROP FUNCTION public.zz_fail();");
  }
  assert.deepEqual(await money(PROP, p), m0, "the eight rows inserted before the failure were rolled back with it");
  assert.equal((await effects(PROP, p)).ledger.length, 0);
  assert.equal((await award(PROP, p, "lv_fail")).xp_awarded, 61);
  assert.equal((await award(PROP, p, "lv_fail")).xp_awarded, 0);
  const m1 = await money(PROP, p);
  assert.deepEqual([m1.xp - m0.xp, m1.coins - m0.coins], [61, 26]);
});

// ── F. the double-pay guard ───────────────────────────────────────────────────────────────────────────
test("F. without the proposal (production's bodies) the award refuses: reward_path_not_ready, nothing written", async () => {
  const p = await pupilIn(BASE);
  for (const step of ["guided_practice", "independent_application", "transfer", "revisit"]) {
    const q = await question(BASE, course(step, "lv_g"));
    await answerVia(BASE, "pqa", p, await open(BASE, p, q), q, true);
  }
  const m = await money(BASE, p);
  assert.equal(m.total_correct_answers, 11, "today: each course answer counts (the double-pay risk)");
  const r = await award(BASE, p, "lv_g");
  assert.deepEqual([r.outcome, r.awarded, r.xp_awarded, r.coins_awarded], ["reward_path_not_ready", [], 0, 0]);
  assert.deepEqual(await money(BASE, p), m);
  assert.equal((await effects(BASE, p)).ledger.length, 0);
});

for (const k of Object.keys(SIGS)) {
  test(`F. with the proposal but ${k} restored to its paying body, the award refuses and writes nothing`, async () => {
    const p = await pupilIn(PROP);
    const q = await question(PROP, course("guided_practice", `lv_f_${k}`));
    await answerVia(PROP, "pqa", p, await open(PROP, p, q), q, true);
    await PROP.exec("BEGIN");
    try {
      if (k === "review") await PROP.exec("DROP FUNCTION public.review_answer(uuid, integer, text, uuid)");
      await PROP.exec(originalDefs[k]);
      const m = await money(PROP, p);
      assert.equal((await award(PROP, p, `lv_f_${k}`)).outcome, "reward_path_not_ready");
      assert.deepEqual(await money(PROP, p), m);
      assert.equal((await effects(PROP, p)).ledger.length, 0);
    } finally {
      await PROP.exec("ROLLBACK");
    }
    assert.equal((await award(PROP, p, `lv_f_${k}`)).outcome, "awarded", "with all four proposal bodies it pays");
  });
}

test("F. an extra, unreviewed overload of a reward function also blocks the award", async () => {
  const p = await pupilIn(PROP);
  const q = await question(PROP, course("guided_practice", "lv_overload"));
  await answerVia(PROP, "pqa", p, await open(PROP, p, q), q, true);
  await PROP.exec("BEGIN");
  try {
    await PROP.exec(`CREATE FUNCTION public.process_question_attempt_v2(a uuid) RETURNS jsonb LANGUAGE sql AS $f$ SELECT '{}'::jsonb $f$`);
    assert.equal((await award(PROP, p, "lv_overload")).outcome, "reward_path_not_ready");
  } finally {
    await PROP.exec("ROLLBACK");
  }
});


// ── G. The teacher-review path (review_answer, long answers) ──────────────────────────────────────────
async function review(db, inst, score) {
  return asService(db, "SELECT public.review_answer($1, $2, NULL, $3) AS r", [inst, score, uid(9999)]);
}

test("G. review_answer (proposal): an ordinary answer gets scoreToXP per review as the Edge function gives today; a course item gets 0", async () => {
  const p = await pupilIn(PROP);
  const plain = await question(PROP, { ...ordinary(), format: "text" });
  const iPlain = await open(PROP, p, plain);
  const m0 = await money(PROP, p);
  assert.deepEqual([await review(PROP, iPlain, 1), await review(PROP, iPlain, 2), await review(PROP, iPlain, 3), await review(PROP, iPlain, 4)], [0, 10, 25, 50]);
  const m1 = await money(PROP, p);
  assert.equal(m1.xp - m0.xp, 85, "today's amounts, also on a re-review (unchanged behaviour for ordinary answers)");
  assert.deepEqual([m1.coins, m1.correct_answers, m1.total_correct_answers], [m0.coins, m0.correct_answers, m0.total_correct_answers]);
  const crs = await question(PROP, { ...course("transfer", "lv_g_review"), format: "text" });
  await PROP.query("UPDATE public.question_instances SET answered = true WHERE id = $1", [iPlain]); // one open round at a time
  const iCourse = await open(PROP, p, crs);
  assert.deepEqual([await review(PROP, iCourse, 4), await review(PROP, iCourse, 4)], [0, 0]);
  assert.deepEqual(await money(PROP, p), m1, "a course item pays nothing on review, however often");
  const row = (await PROP.query("SELECT teacher_score FROM public.question_instances WHERE id = $1", [iCourse])).rows[0];
  assert.equal(row.teacher_score, 4, "the review itself is still stored");
  await assert.rejects(review(PROP, uid(424242), 3), /Instance not found/);
});

test("G. while review-answer/index.ts still writes student_progress itself, the award keeps both safeguards (review guard + long-answer block)", () => {
  const edge = read("supabase/functions/review-answer/index.ts");
  const edgeWrites = /from\("student_progress"\)[\s\S]{0,200}\.update\(/.test(edge);
  const mig = read(MIGRATION);
  if (edgeWrites) {
    assert.match(mig, /to_regprocedure\('public\.review_answer\(uuid,integer,text,uuid\)'\)/, "the award requires the proposal's review_answer");
    assert.match(mig, /'long_answer_items_blocked'/, "the temporary long-answer block is in place");
  }
  assert.ok(edgeWrites, "today the Edge function writes XP itself; when that changes, revisit the long-answer block deliberately");
});
