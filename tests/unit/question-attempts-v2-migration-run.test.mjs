// RUNTIME proof for migration 20261030211428_question_attempts_v2 (D-266, H5 — PR 1 of 6). The SQL
// file is executed UNMODIFIED on PGlite, on top of production's answer chain with production's exact
// function bodies (helpers/answer-chain-schema.mjs pins every md5), and the tests assert what the
// functions DO: the attempt log, the round check, the submission replay, the frozen result, the
// rewards, the rollback, the privileges, and that the live answer functions are unchanged.
//
// The concurrency half (simultaneous sessions) is question-attempts-v2-concurrency.test.mjs on a real
// PostgreSQL 17 — PGlite has one connection.
//
// HONEST LIMITS: PGlite is PostgreSQL 18.x and runs as superuser (function ownership is not modelled);
// calls run under SET ROLE service_role, as process-event's admin client does. Passing here is not
// permission to apply: production needs its own owner authorisation (D-110, apply_migration only).
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import {
  answerChainSql, LIVE_PROSRC_MD5, readMigration, extractFunction, ATTEMPTS_MIGRATION_FILE,
} from "./helpers/answer-chain-schema.mjs";
import { planReplay } from "../isolated/schema/replay-plan.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATION = readMigration(ATTEMPTS_MIGRATION_FILE);
const CODE = MIGRATION.replace(/--.*$/gm, "");
const MC_V2 = "public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text)";
const TEXT_V2 = "public.process_text_answer_v2(uuid,uuid,text,boolean,integer,uuid,text,text)";

const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const Q = { mc: uid(9001), number: uid(9002), text: uid(9003), long: uid(9004), alias: uid(9005), mc2: uid(9006) };
const KEY = { [Q.mc]: "Paris", [Q.number]: "4", [Q.text]: "hund", [Q.long]: "", [Q.alias]: "Skt. Hans", [Q.mc2]: "Rom" };
const DOMAIN = { [Q.mc]: "geografi", [Q.mc2]: "historie", [Q.alias]: "dansk-ortografi" };

const SEED = `
  INSERT INTO public.questions (id, type, content, difficulty, is_active, question_type, learning_objective,
    answer_format, answer_type, metadata, difficulty_level) VALUES
  ('${Q.mc}', 'mc', '{"type":"mc","question":"Hovedstad i Frankrig?","options":["Paris","Rom"],"correct":"Paris"}',
    1, true, 'auto', 'geografi', 'mc', 'short', '{"review_text":"Paris er Frankrigs hovedstad.","misconception_type":"capital_mixup"}', 1000),
  ('${Q.number}', 'number', '{"type":"number","question":"Hvad er 2 + 2?","correct":"4"}',
    1, true, 'auto', 'matematik', 'number', 'short', '{}', 1000),
  ('${Q.text}', 'text', '{"type":"text","question":"Dog på dansk?","correct":"hund"}',
    1, true, 'auto', 'engelsk-ord', 'text', 'short', '{}', 1000),
  ('${Q.long}', 'text', '{"type":"text","question":"Skriv om din sommer.","correct":"-"}',
    1, true, 'auto', 'dansk-essay', 'text', 'long', '{}', 1000),
  ('${Q.alias}', 'mc', '{"type":"mc","question":"Hvornår er midsommer?","options":["Sankt Hans","Jul"],"correct":"Sankt Hans"}',
    1, true, 'auto', 'dansk-ortografi', 'mc', 'short', '{"danish_orthography_correct_aliases":["Skt. Hans","Sankt Hans"]}', 1000),
  ('${Q.mc2}', 'mc', '{"type":"mc","question":"Hovedstad i Italien?","options":["Rom","Paris"],"correct":"Rom"}',
    1, true, 'auto', 'historie', 'mc', 'short', '{}', 1000);
  INSERT INTO public.daily_quests (quest_key, label, type, target, reward_coins) VALUES
    ('d_answers', 'Svar', 'answer_count', 5, 10), ('d_correct', 'Rigtige', 'correct_count', 5, 10),
    ('d_xp', 'XP', 'xp_earned', 100, 10);
  INSERT INTO public.weekly_quests (quest_key, label, type, target, reward_coins) VALUES
    ('w_answers', 'Svar', 'answer_count', 50, 50), ('w_correct', 'Rigtige', 'correct_count', 50, 50);
`;

async function chainDb() {
  const db = new PGlite();
  for (const sql of answerChainSql()) await db.exec(sql);
  await db.exec(SEED);
  return db;
}
async function migratedDb() {
  const db = await chainDb();
  await db.exec(MIGRATION);
  return db;
}

let nextPupil = 100;
async function addPupil(db, { streak = 1, lastActivity = "current_date - 1", progress = true } = {}) {
  const id = uid(nextPupil++);
  await db.exec(`INSERT INTO auth.users VALUES ('${id}');
    INSERT INTO public.profiles (id, role, selected_grade) VALUES ('${id}', 'student', 5);
    ${progress ? `INSERT INTO public.student_progress (student_id, xp, coins, correct_answers, total_correct_answers,
      current_streak, longest_streak, last_activity_date) VALUES ('${id}', 100, 50, 7, 7, ${streak}, ${streak}, ${lastActivity});` : ""}`);
  return id;
}
async function serve(db, pupil, question, { repeatCount = 0, answered = false } = {}) {
  return (await db.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, repeat_count,
      answered, next_review_at) VALUES ($1, $2, $3, $4, $5, now()) RETURNING id`,
    [pupil, question, KEY[question], repeatCount, answered])).rows[0].id;
}

async function as(db, role, sql, params = []) {
  await db.exec(`SET ROLE ${role}`);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("RESET ROLE"); }
}
const mc = async (db, a) => (await as(db, "service_role",
  `SELECT public.process_question_attempt_v2($1, $2, $3, $4, $5, $6, $7) AS r`,
  [a.pupil, a.qi, a.answer, a.round, a.sub, a.review ?? null, a.misc ?? null]))[0].r;
const txt = async (db, a) => (await as(db, "service_role",
  `SELECT public.process_text_answer_v2($1, $2, $3, $4, $5, $6, $7, $8) AS r`,
  [a.qi, a.pupil, a.answer, a.correct, a.round, a.sub, a.review ?? null, a.misc ?? null]))[0].r;

async function snapshot(db, pupil) {
  const rows = async (sql) => (await db.query(sql, [pupil])).rows;
  return {
    progress: await rows(`SELECT xp, coins, correct_answers, total_correct_answers, current_streak, longest_streak,
      last_activity_date::text AS last FROM public.student_progress WHERE student_id = $1`),
    instances: await rows(`SELECT id, answered, answered_at::text AS at, user_answer, was_correct, repeat_count,
      misconception_signal, next_review_at::text AS review FROM public.question_instances WHERE student_id = $1 ORDER BY id`),
    attempts: (await db.query("SELECT to_regclass('public.question_attempts') AS t")).rows[0].t === null ? []
      : await rows(`SELECT to_jsonb(a)::text AS a FROM public.question_attempts a WHERE student_id = $1
      ORDER BY question_instance_id, attempt_no`),
    daily: await rows(`SELECT d.quest_key, p.progress, p.completed FROM public.student_quest_progress p
      JOIN public.daily_quests d ON d.id = p.quest_id WHERE p.student_id = $1 ORDER BY 1`),
    weekly: await rows(`SELECT w.quest_key, p.progress FROM public.student_weekly_quest_progress p
      JOIN public.weekly_quests w ON w.id = p.quest_id WHERE p.student_id = $1 ORDER BY 1`),
    milestones: await rows(`SELECT milestone_day FROM public.streak_milestones WHERE student_id = $1 ORDER BY 1`),
  };
}
const attempts = async (db, pupil) => (await db.query(
  "SELECT * FROM public.question_attempts WHERE student_id = $1 ORDER BY question_instance_id, attempt_no", [pupil])).rows;
const progress = async (db, pupil) => (await db.query(
  "SELECT xp, coins, correct_answers AS c, total_correct_answers AS t FROM public.student_progress WHERE student_id = $1",
  [pupil])).rows[0];
const quests = async (db, pupil) => Object.fromEntries((await db.query(`SELECT d.quest_key, p.progress FROM public.student_quest_progress p
  JOIN public.daily_quests d ON d.id = p.quest_id WHERE p.student_id = $1`, [pupil])).rows.map((r) => [r.quest_key, r.progress]));
const result = (r) => { const { outcome, ...rest } = r; return rest; };

let db;
before(async () => { db = await migratedDb(); });

// ── The file ─────────────────────────────────────────────────────────────────

test("the file: a unique version after the newest production migration, replayed by the isolated E2E", () => {
  const files = readdirSync(join(ROOT, "supabase", "migrations")).filter((f) => /^\d{14}_.+\.sql$/.test(f));
  assert.ok(files.includes(ATTEMPTS_MIGRATION_FILE));
  assert.equal(files.filter((f) => f.startsWith("20261030211428_")).length, 1, "version is unique");
  assert.ok("20261030211428" > "20261030120000", "after the newest migration on main when written");
  const entry = planReplay(files, readMigration).plan.find((p) => p.file === ATTEMPTS_MIGRATION_FILE);
  assert.equal(entry.action, "apply", "the isolated CI database gets the real file");
});

test("the file does not redefine, alter, revoke or drop the live answer functions", () => {
  assert.equal(/FUNCTION\s+public\.process_question_attempt\s*\(/i.test(CODE), false);
  assert.equal(/FUNCTION\s+public\.process_text_answer\s*\(/i.test(CODE), false);
  assert.equal(/\b(DROP|ALTER)\s+FUNCTION\b/i.test(CODE), false);
  assert.equal(/\b(INSERT\s+INTO|DELETE\s+FROM|TRUNCATE)\s+public\.(question_instances|student_progress)\b/i.test(CODE), false);
  assert.equal(/UPDATE\s+public\.student_progress/i.test(CODE.replace(/CREATE FUNCTION[\s\S]*?\$function\$[\s\S]*?\$function\$/g, "")), false,
    "outside the _v2 bodies nothing updates rewards");
  assert.equal(/db\s+push/i.test(CODE), false);
});

test("the chain is production's: every function body has its live md5, before and after the migration", async () => {
  const fresh = await chainDb();
  for (const d of [fresh, db]) {
    for (const [sig, md5] of Object.entries(LIVE_PROSRC_MD5)) {
      const h = (await d.query("SELECT md5(prosrc) AS h FROM pg_proc WHERE oid = to_regprocedure($1)", [sig])).rows[0]?.h;
      assert.equal(h, md5, sig);
    }
  }
});

// ── Preconditions ────────────────────────────────────────────────────────────

test("preconditions: a drifted reopen function stops the migration before anything is created", async () => {
  const d = await chainDb();
  await d.exec(extractFunction("20261019150000_question_format_mix.sql", "request_repeat_question_servable_for_student")
    .replace("repeat_count   = repeat_count + 1", "repeat_count   = repeat_count + 2"));
  await assert.rejects(d.exec(MIGRATION), /request_repeat_question_servable_for_student.*er ændret siden analysen/);
  assert.equal((await d.query("SELECT to_regclass('public.question_attempts') AS t")).rows[0].t, null);
  assert.equal((await d.query(`SELECT count(*)::int AS n FROM pg_constraint
    WHERE conname = 'question_instances_id_student_id_key'`)).rows[0].n, 0);
});

test("preconditions: an unknown function that updates question_instances stops the migration", async () => {
  const d = await chainDb();
  await d.exec(`CREATE FUNCTION public.reset_round(p uuid) RETURNS void LANGUAGE sql AS
    $f$ UPDATE public.question_instances SET answered = false WHERE id = p $f$;`);
  await assert.rejects(d.exec(MIGRATION), /ukendt funktion opdaterer question_instances: reset_round\(uuid\)/);
  assert.equal((await d.query("SELECT to_regclass('public.question_attempts') AS t")).rows[0].t, null);
});

test("preconditions: an existing trigger on question_instances stops the migration", async () => {
  const d = await chainDb();
  await d.exec(`CREATE FUNCTION public.t_noop() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN RETURN NEW; END $f$;
    CREATE TRIGGER t_noop BEFORE UPDATE ON public.question_instances FOR EACH ROW EXECUTE FUNCTION public.t_noop();`);
  await assert.rejects(d.exec(MIGRATION), /har allerede en trigger/);
});

// ── 14. No backfill, no data change; open rounds need nothing ────────────────

test("14. existing rows are untouched and 43 open rounds (repeat_count 0 and 1) can be answered with no backfill", async () => {
  const d = await chainDb();
  const open = [];
  for (let i = 0; i < 43; i++) {
    const p = await addPupil(d);
    await serve(d, p, Q.mc2, { answered: true });                       // an earlier, answered question
    open.push({ pupil: p, qi: await serve(d, p, Q.mc, { repeatCount: i % 3 === 0 ? 1 : 0 }), rc: i % 3 === 0 ? 1 : 0 });
  }
  const dump = async () => (await d.query(`SELECT to_jsonb(qi)::text AS r FROM public.question_instances qi ORDER BY id`)).rows;
  const progressDump = async () => (await d.query(`SELECT to_jsonb(p)::text AS r FROM public.student_progress p ORDER BY student_id`)).rows;
  const [qiBefore, progBefore] = [await dump(), await progressDump()];
  await d.exec(MIGRATION);
  assert.deepEqual(await dump(), qiBefore, "no question_instances row changed");
  assert.deepEqual(await progressDump(), progBefore, "no student_progress row changed");
  assert.equal((await d.query("SELECT count(*)::int AS n FROM public.question_attempts")).rows[0].n, 0, "the log starts empty");
  for (const o of open) {
    const r = await mc(d, { pupil: o.pupil, qi: o.qi, answer: "Paris", round: o.rc + 1, sub: randomUUID() });
    assert.equal(r.outcome, "recorded");
    assert.equal(r.round_no, o.rc + 1);
    assert.deepEqual([r.xp_awarded, r.coins_awarded], o.rc === 0 ? [10, 5] : [2, 1]);
  }
});

// ── 1. First answer ──────────────────────────────────────────────────────────

test("1. first correct MC answer: recorded once with 10 XP, 5 coins, both counters, streak and quests", async () => {
  const p = await addPupil(db);
  const qi = await serve(db, p, Q.mc);
  const sub = randomUUID();
  const r = await mc(db, { pupil: p, qi, answer: "Paris", round: 1, sub, review: "Paris er Frankrigs hovedstad.", misc: "capital_mixup" });
  assert.deepEqual(r, { outcome: "recorded", status: "correct", correct_answer: "Paris", review_text: null,
    misconception_type: null, xp_awarded: 10, coins_awarded: 5, round_no: 1 });
  assert.deepEqual(await progress(db, p), { xp: 110, coins: 55, c: 8, t: 8 });
  const s = await snapshot(db, p);
  assert.deepEqual(s.progress.map((x) => [x.current_streak, x.last]), [[2, (await db.query("SELECT current_date::text AS d")).rows[0].d]]);
  assert.deepEqual(s.daily, [{ quest_key: "d_answers", progress: 1, completed: false },
    { quest_key: "d_correct", progress: 1, completed: false }, { quest_key: "d_xp", progress: 10, completed: false }]);
  assert.deepEqual(s.weekly, [{ quest_key: "w_answers", progress: 1 }, { quest_key: "w_correct", progress: 1 }]);
  const [inst] = s.instances;
  assert.deepEqual([inst.answered, inst.user_answer, inst.was_correct, inst.misconception_signal], [true, "Paris", true, null]);
  const [a] = await attempts(db, p);
  assert.equal(a.question_instance_id, qi);
  assert.equal(a.submission_id, sub);
  assert.deepEqual([a.attempt_no, a.grading, a.status, a.was_correct, a.is_repeat, a.answer_format, a.answer_type, a.source,
    a.correct_answer_shown, a.review_text_shown, a.xp_awarded, a.coins_awarded],
  [1, "auto", "correct", true, false, "mc", "short", "process_question_attempt_v2", "Paris", null, 10, 5]);
  assert.equal(a.answered_at.toISOString(), (await db.query("SELECT answered_at FROM public.question_instances WHERE id = $1", [qi])).rows[0].answered_at.toISOString());
});

test("1. first wrong MC answer: no reward, the shown explanation is frozen and the misconception signal is written in the same call", async () => {
  const p = await addPupil(db);
  const qi = await serve(db, p, Q.mc);
  const r = await mc(db, { pupil: p, qi, answer: "Rom", round: 1, sub: randomUUID(), review: "Paris er Frankrigs hovedstad.", misc: "capital_mixup" });
  assert.deepEqual(r, { outcome: "recorded", status: "incorrect", correct_answer: "Paris", review_text: "Paris er Frankrigs hovedstad.",
    misconception_type: "capital_mixup", xp_awarded: 0, coins_awarded: 0, round_no: 1 });
  assert.deepEqual(await progress(db, p), { xp: 100, coins: 50, c: 7, t: 7 });
  assert.deepEqual(await quests(db, p), { d_answers: 1 }, "a wrong answer counts only as an answer");
  assert.equal((await snapshot(db, p)).instances[0].misconception_signal, "capital_mixup");
});

test("1. number and orthography aliases are graded exactly as the live function grades them", async () => {
  const p = await addPupil(db);
  const qn = await serve(db, p, Q.number);
  assert.equal((await mc(db, { pupil: p, qi: qn, answer: " 4 ", round: 1, sub: randomUUID() })).status, "correct");
  const v2 = await migratedDb();                         // the same instance, graded by both functions
  const live = await migratedDb();
  for (const answer of ["Skt. Hans", "Sankt Hans", "Jul"]) {
    const pv = await addPupil(v2); const pl = await addPupil(live);
    const a = await serve(v2, pv, Q.alias); const b = await serve(live, pl, Q.alias);
    const r2 = await mc(v2, { pupil: pv, qi: a, answer, round: 1, sub: randomUUID() });
    const rl = (await as(live, "service_role", "SELECT public.process_question_attempt($1, $2, $3, 0) AS r", [pl, b, answer]))[0].r;
    assert.deepEqual({ status: r2.status, correct_answer: r2.correct_answer }, rl, answer);
  }
});

// ── 2. Repeat ────────────────────────────────────────────────────────────────

test("2. a repeat via each request_repeat_* is a new attempt: 2 XP + 1 coin, no counters, no quests; attempt 1 is byte-identical", async () => {
  const reopeners = {
    servable: (p) => `SELECT public.request_repeat_question_servable_for_student('${p}', 5::smallint, ARRAY['geografi']) AS id`,
    forStudent: (p) => `SELECT public.request_repeat_question_for_student('${p}', 5::smallint, ARRAY['geografi']) AS id`,
    level: (p) => `SELECT public.request_repeat_level_question_for_student('${p}', ARRAY['geografi']) AS id`,
  };
  for (const [name, sql] of Object.entries(reopeners)) {
    const p = await addPupil(db);
    const qi = await serve(db, p, Q.mc);
    await mc(db, { pupil: p, qi, answer: "Rom", round: 1, sub: randomUUID() });
    const first = (await snapshot(db, p)).attempts;
    const questsAfterFirst = await quests(db, p);
    assert.equal((await as(db, "service_role", sql(p)))[0].id, qi, `${name} reopens the instance`);
    const before = await progress(db, p);
    const r = await mc(db, { pupil: p, qi, answer: "Paris", round: 2, sub: randomUUID() });
    assert.deepEqual([r.outcome, r.status, r.round_no, r.xp_awarded, r.coins_awarded], ["recorded", "correct", 2, 2, 1], name);
    assert.deepEqual(await progress(db, p), { ...before, xp: before.xp + 2, coins: before.coins + 1 }, name);
    assert.deepEqual(await quests(db, p), questsAfterFirst, `${name}: repeats do not advance quests`);
    const all = (await snapshot(db, p)).attempts;
    assert.equal(all.length, 2);
    assert.equal(all[0].a, first[0].a, `${name}: attempt 1 unchanged byte for byte`);
    assert.equal(JSON.parse(all[1].a).is_repeat, true);
  }
});

test("2. two repeats in a row give attempts 1, 2 and 3; a wrong repeat pays nothing", async () => {
  const p = await addPupil(db);
  const qi = await serve(db, p, Q.mc);
  const reopen = () => as(db, "service_role", `SELECT public.request_repeat_question_servable_for_student($1, 5::smallint, ARRAY['geografi'])`, [p]);
  await mc(db, { pupil: p, qi, answer: "Paris", round: 1, sub: randomUUID() });
  await reopen();
  await mc(db, { pupil: p, qi, answer: "Rom", round: 2, sub: randomUUID() });
  await reopen();
  const r = await mc(db, { pupil: p, qi, answer: "Rom", round: 3, sub: randomUUID() });
  assert.deepEqual([r.outcome, r.status, r.xp_awarded, r.coins_awarded], ["recorded", "incorrect", 0, 0]);
  assert.deepEqual((await attempts(db, p)).map((a) => [a.attempt_no, a.status]), [[1, "correct"], [2, "incorrect"], [3, "incorrect"]]);
  assert.deepEqual(await progress(db, p), { xp: 110, coins: 55, c: 8, t: 8 });
});

// ── 3 / 6. Same submission again: replay ─────────────────────────────────────

test("3. the same submission twice (double click): one attempt, one payout, the identical result", async () => {
  const p = await addPupil(db);
  const qi = await serve(db, p, Q.mc);
  const a = { pupil: p, qi, answer: "Rom", round: 1, sub: randomUUID(), review: "Paris er Frankrigs hovedstad.", misc: "capital_mixup" };
  const first = await mc(db, a);
  const state = await snapshot(db, p);
  const again = await mc(db, a);
  assert.equal(again.outcome, "replay");
  assert.deepEqual(result(again), result(first));
  assert.deepEqual(await snapshot(db, p), state, "nothing was written: answer, rewards, streak, quests, log");
});

test("6. lost response: the retry returns the original result — also after the question was reopened", async () => {
  const p = await addPupil(db);
  const qi = await serve(db, p, Q.mc);
  const lost = { pupil: p, qi, answer: "Paris", round: 1, sub: randomUUID() };
  const original = await mc(db, lost);                    // the response never reached the browser
  await as(db, "service_role", `SELECT public.request_repeat_question_servable_for_student($1, 5::smallint, ARRAY['geografi'])`, [p]);
  const state = await snapshot(db, p);
  const retry = await mc(db, lost);
  assert.equal(retry.outcome, "replay");
  assert.deepEqual(result(retry), result(original));
  assert.deepEqual(await snapshot(db, p), state, "the open round 2 is untouched");
});

// ── 4 / 5. Another submission for the same or an earlier round ──────────────

test("4. a different submission for an answered round (another tab): round_closed, nothing written", async () => {
  const p = await addPupil(db);
  const qi = await serve(db, p, Q.mc);
  await mc(db, { pupil: p, qi, answer: "Rom", round: 1, sub: randomUUID() });
  const state = await snapshot(db, p);
  assert.deepEqual(await mc(db, { pupil: p, qi, answer: "Paris", round: 1, sub: randomUUID() }), { outcome: "round_closed" });
  assert.deepEqual(await snapshot(db, p), state);
});

test("5. a late answer from an earlier round is never accepted in the new round", async () => {
  const p = await addPupil(db);
  const qi = await serve(db, p, Q.mc);
  await mc(db, { pupil: p, qi, answer: "Rom", round: 1, sub: randomUUID() });
  await as(db, "service_role", `SELECT public.request_repeat_question_servable_for_student($1, 5::smallint, ARRAY['geografi'])`, [p]);
  const state = await snapshot(db, p);
  assert.deepEqual(await mc(db, { pupil: p, qi, answer: "Paris", round: 1, sub: randomUUID() }), { outcome: "stale_round" });
  assert.deepEqual(await snapshot(db, p), state, "round 2 stays open, no XP, coins, streak, quests or attempt");
  assert.equal((await mc(db, { pupil: p, qi, answer: "Paris", round: 2, sub: randomUUID() })).outcome, "recorded");
});

// ── 7. Changed question content ──────────────────────────────────────────────

test("7. replay returns the frozen result after the question's text, key, aliases and explanation changed", async () => {
  const d = await migratedDb();
  const p = await addPupil(d);
  const qi = await serve(d, p, Q.alias);
  const a = { pupil: p, qi, answer: "Jul", round: 1, sub: randomUUID(), review: "Midsommer er Sankt Hans.", misc: "holiday_mixup" };
  const original = await mc(d, a);
  await d.exec(`UPDATE public.questions SET content = '{"type":"mc","question":"Hvornår er midsommer? (ny)","options":["Jul","Påske"],"correct":"Jul"}',
      metadata = '{"review_text":"Ny forklaring."}' WHERE id = '${Q.alias}';
    UPDATE public.question_instances SET correct_answer = 'Jul' WHERE id = '${qi}';`);
  const replay = await mc(d, a);
  assert.equal(replay.outcome, "replay");
  assert.deepEqual(result(replay), result(original));
  assert.deepEqual([replay.status, replay.correct_answer, replay.review_text], ["incorrect", "Sankt Hans", "Midsommer er Sankt Hans."]);
});

// ── 8. Rewards: amounts, streak milestone, no progress row, short text ──────

test("8. the streak milestone is paid once by the answer; the attempt records only the answer's own coins", async () => {
  const p = await addPupil(db, { streak: 2 });
  const qi = await serve(db, p, Q.mc);
  const a = { pupil: p, qi, answer: "Paris", round: 1, sub: randomUUID() };
  const r = await mc(db, a);
  assert.deepEqual([r.xp_awarded, r.coins_awarded], [10, 5]);
  assert.deepEqual(await progress(db, p), { xp: 110, coins: 50 + 5 + 100, c: 8, t: 8 });
  assert.deepEqual((await snapshot(db, p)).milestones, [{ milestone_day: 3 }]);
  await mc(db, a);
  assert.deepEqual(await progress(db, p), { xp: 110, coins: 155, c: 8, t: 8 }, "a replay pays no milestone again");
});

test("8. without a student_progress row nothing is paid, and the attempt says so (0/0), as the live function behaves", async () => {
  const p = await addPupil(db, { progress: false });
  const qi = await serve(db, p, Q.mc);
  const r = await mc(db, { pupil: p, qi, answer: "Paris", round: 1, sub: randomUUID() });
  assert.deepEqual([r.outcome, r.status, r.xp_awarded, r.coins_awarded], ["recorded", "correct", 0, 0]);
});

test("8. short text: 10 XP + 5 coins + counters when correct, next_review_at as live, quests always, misconception when wrong", async () => {
  const p = await addPupil(db);
  const qi = await serve(db, p, Q.text);
  const r = await txt(db, { pupil: p, qi, answer: "Hund", correct: true, round: 1, sub: randomUUID(), review: "x", misc: "y" });
  assert.deepEqual(r, { outcome: "recorded", status: "correct", correct_answer: "hund", review_text: null, misconception_type: null,
    xp_awarded: 10, coins_awarded: 5, round_no: 1 });
  assert.deepEqual(await progress(db, p), { xp: 110, coins: 55, c: 8, t: 8 });
  assert.deepEqual(await quests(db, p), { d_answers: 1, d_correct: 1, d_xp: 10 });
  const due = (await db.query(`SELECT EXTRACT(epoch FROM next_review_at - answered_at)::int AS d FROM public.question_instances WHERE id = $1`, [qi])).rows[0].d;
  assert.equal(due, 86400);
  const p2 = await addPupil(db);
  const qi2 = await serve(db, p2, Q.text);
  const w = await txt(db, { pupil: p2, qi: qi2, answer: "kat", correct: false, round: 1, sub: randomUUID(), review: "Dog = hund.", misc: "false_friend" });
  assert.deepEqual([w.status, w.review_text, w.misconception_type, w.xp_awarded], ["incorrect", "Dog = hund.", "false_friend", 0]);
  assert.equal((await snapshot(db, p2)).instances[0].misconception_signal, "false_friend");
  assert.deepEqual((await db.query(`SELECT EXTRACT(epoch FROM next_review_at - answered_at)::int AS d FROM public.question_instances WHERE id = $1`, [qi2])).rows[0].d, 600);
});

test("8. short text: replay, round_closed and stale_round behave as for MC", async () => {
  const p = await addPupil(db);
  const qi = await serve(db, p, Q.text);
  const a = { pupil: p, qi, answer: "hund", correct: true, round: 1, sub: randomUUID() };
  const first = await txt(db, a);
  const state = await snapshot(db, p);
  assert.deepEqual(result(await txt(db, a)), result(first));
  assert.deepEqual(await txt(db, { ...a, sub: randomUUID() }), { outcome: "round_closed" });
  // request_repeat_* never reopen short text (answer_format 'text'); a reopen is simulated the only legal way.
  await db.exec(`UPDATE public.question_instances SET answered = false, repeat_count = repeat_count + 1 WHERE id = '${qi}'`);
  assert.deepEqual(await txt(db, { ...a, sub: randomUUID() }), { outcome: "stale_round" });
  const r2 = await txt(db, { ...a, round: 2, sub: randomUUID() });
  assert.deepEqual([r2.outcome, r2.round_no, r2.xp_awarded], ["recorded", 2, 10], "no repeat rule for short text, as live");
  assert.equal(JSON.parse((await snapshot(db, p)).attempts[1].a).is_repeat, true);
  assert.equal((await snapshot(db, p)).attempts[0].a, state.attempts[0].a);
});

// ── 9. A failure inside the call rolls everything back ───────────────────────

for (const [label, inject] of [
  ["the last quest helper fails", `CREATE OR REPLACE FUNCTION public.update_weekly_quest_progress_for_answer(p_student_id uuid, p_correct boolean, p_xp_earned integer)
     RETURNS void LANGUAGE plpgsql AS $f$ BEGIN RAISE EXCEPTION 'injected weekly failure'; END $f$;`],
  ["the attempt insert fails", `CREATE FUNCTION public.t_fail() RETURNS trigger LANGUAGE plpgsql AS
     $f$ BEGIN RAISE EXCEPTION 'injected insert failure'; END $f$;
     CREATE TRIGGER t_fail BEFORE INSERT ON public.question_attempts FOR EACH ROW EXECUTE FUNCTION public.t_fail();`],
]) {
  test(`9. ${label}: answer, XP, coins, counters, streak, daily quests and the log are all rolled back`, async () => {
    const d = await migratedDb();
    const p = await addPupil(d, { streak: 2 });
    const qi = await serve(d, p, Q.mc);
    const qt = await serve(d, await addPupil(d), Q.text);
    const before = await snapshot(d, p);
    await d.exec(inject);
    await assert.rejects(mc(d, { pupil: p, qi, answer: "Paris", round: 1, sub: randomUUID(), misc: "x" }), /injected/);
    assert.deepEqual(await snapshot(d, p), before);
    const tp = (await d.query("SELECT student_id FROM public.question_instances WHERE id = $1", [qt])).rows[0].student_id;
    const tBefore = await snapshot(d, tp);
    await assert.rejects(txt(d, { pupil: tp, qi: qt, answer: "hund", correct: true, round: 1, sub: randomUUID() }), /injected/);
    assert.deepEqual(await snapshot(d, tp), tBefore);
  });
}

// ── 10. Manipulated and invalid input ────────────────────────────────────────

test("10. invalid or manipulated round, submission, answer, instance or path: an outcome, never a write", async () => {
  const p = await addPupil(db);
  const other = await addPupil(db);
  const done = await serve(db, p, Q.mc2);
  const used = randomUUID();
  await mc(db, { pupil: p, qi: done, answer: "Rom", round: 1, sub: used });
  const qi = await serve(db, p, Q.mc);
  const state = await snapshot(db, p);
  const otherState = await snapshot(db, other);
  const base = { pupil: p, qi, answer: "Paris", round: 1, sub: randomUUID() };
  const cases = [
    [{ ...base, round: 0 }, { outcome: "invalid_request", reason: "invalid_round" }],
    [{ ...base, round: -1 }, { outcome: "invalid_request", reason: "invalid_round" }],
    [{ ...base, round: null }, { outcome: "invalid_request", reason: "invalid_round" }],
    [{ ...base, round: 2 }, { outcome: "invalid_request", reason: "round_ahead" }],
    [{ ...base, round: 2147483647 }, { outcome: "invalid_request", reason: "round_ahead" }],
    [{ ...base, sub: null }, { outcome: "invalid_request", reason: "missing_identity" }],
    [{ ...base, answer: "" }, { outcome: "invalid_request", reason: "missing_answer" }],
    [{ ...base, answer: null }, { outcome: "invalid_request", reason: "missing_answer" }],
    [{ ...base, pupil: other }, { outcome: "not_found" }],
    [{ ...base, qi: uid(777777) }, { outcome: "not_found" }],
    [{ ...base, sub: used }, { outcome: "submission_conflict" }],
    [{ ...base, qi: done, round: 1, sub: used, answer: "Paris" }, { outcome: "submission_conflict" }],
  ];
  for (const [args, expected] of cases) assert.deepEqual(await mc(db, args), expected, JSON.stringify(args));
  assert.deepEqual(await txt(db, { ...base, correct: null }), { outcome: "invalid_request", reason: "missing_verdict" });
  assert.deepEqual(await txt(db, { ...base, correct: true }), { outcome: "invalid_request", reason: "answer_path" });
  assert.deepEqual(await txt(db, { ...base, qi: done, correct: true, sub: used, answer: "Rom" }), { outcome: "submission_conflict" },
    "an MC submission cannot be replayed through the text function");
  await assert.rejects(mc(db, { ...base, sub: "not-a-uuid" }), /invalid input syntax for type uuid/);
  assert.deepEqual(await snapshot(db, p), state);
  assert.deepEqual(await snapshot(db, other), otherState);
});

test("10. each function refuses the other path's questions, and both refuse long answers", async () => {
  for (const [question, fn, args] of [[Q.text, mc, {}], [Q.long, mc, {}], [Q.mc, txt, { correct: true }], [Q.long, txt, { correct: true }]]) {
    const p = await addPupil(db);
    const qi = await serve(db, p, question);
    const state = await snapshot(db, p);
    assert.deepEqual(await fn(db, { pupil: p, qi, answer: "et svar", round: 1, sub: randomUUID(), ...args }),
      { outcome: "invalid_request", reason: "answer_path" });
    assert.deepEqual(await snapshot(db, p), state);
  }
});

// ── 11. Privileges ───────────────────────────────────────────────────────────

test("11. ACLs: _v2 SECURITY DEFINER with search_path '' and EXECUTE for service_role only; the log readable by service_role only", async () => {
  const fns = (await db.query(`SELECT p.oid::regprocedure::text AS fn, p.prosecdef, p.proconfig, pg_get_userbyid(p.proowner) AS owner,
      ARRAY(SELECT a.grantee::regrole::text || ':' || a.privilege_type FROM aclexplode(p.proacl) a WHERE a.grantee <> 0 ORDER BY 1) AS grants,
      EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0) AS public_execute
    FROM pg_proc p WHERE p.oid IN (to_regprocedure($1), to_regprocedure($2)) ORDER BY 1`, [MC_V2, TEXT_V2])).rows;
  assert.equal(fns.length, 2);
  for (const f of fns) {
    assert.equal(f.prosecdef, true, f.fn);
    assert.deepEqual(f.proconfig, ['search_path=""'], f.fn);
    assert.equal(f.public_execute, false, f.fn);
    assert.deepEqual(f.grants, [`${f.owner}:EXECUTE`, "service_role:EXECUTE"].sort(), f.fn);
  }
  const triggers = (await db.query(`SELECT p.proname, ARRAY(SELECT a.grantee::regrole::text FROM aclexplode(p.proacl) a
      WHERE a.grantee <> p.proowner) AS others, p.proacl IS NULL AS default_acl
    FROM pg_proc p WHERE p.proname IN ('question_attempts_reject_update', 'question_instances_round_guard') ORDER BY 1`)).rows;
  assert.deepEqual(triggers.map((t) => [t.proname, t.others, t.default_acl]),
    [["question_attempts_reject_update", [], false], ["question_instances_round_guard", [], false]]);
  const table = (await db.query(`SELECT c.relrowsecurity,
      (SELECT count(*)::int FROM pg_policy WHERE polrelid = c.oid) AS policies,
      ARRAY(SELECT a.grantee::regrole::text || ':' || a.privilege_type FROM aclexplode(c.relacl) a
            WHERE a.grantee <> c.relowner ORDER BY 1) AS grants
    FROM pg_class c WHERE c.oid = 'public.question_attempts'::regclass`)).rows[0];
  assert.deepEqual(table, { relrowsecurity: true, policies: 0, grants: ["service_role:SELECT"] });
});

test("11. anon and authenticated can neither call _v2 nor read, write, delete or truncate the log; service_role can only read it", async () => {
  const p = await addPupil(db);
  const qi = await serve(db, p, Q.mc);
  const sub = randomUUID();
  await db.exec(`SELECT set_config('test.uid', '${p}', false)`);
  for (const role of ["anon", "authenticated"]) {
    await assert.rejects(as(db, role, `SELECT public.process_question_attempt_v2($1, $2, 'Paris', 1, $3, null, null)`, [p, qi, sub]), /permission denied/, role);
    await assert.rejects(as(db, role, `SELECT public.process_text_answer_v2($1, $2, 'hund', true, 1, $3, null, null)`, [qi, p, sub]), /permission denied/, role);
    for (const sql of ["SELECT * FROM public.question_attempts", "DELETE FROM public.question_attempts",
      "UPDATE public.question_attempts SET xp_awarded = 999", "TRUNCATE public.question_attempts",
      `INSERT INTO public.question_attempts (question_instance_id, student_id, attempt_no, submission_id, grading, status,
        was_correct, user_answer, answer_format, answer_type, is_repeat, answered_at, xp_awarded, coins_awarded, source)
       VALUES ('${qi}', '${p}', 1, '${sub}', 'auto', 'correct', true, 'Paris', 'mc', 'short', false, now(), 999, 999, 'process_question_attempt_v2')`]) {
      await assert.rejects(as(db, role, sql), /permission denied/, `${role}: ${sql.slice(0, 30)}`);
    }
  }
  await mc(db, { pupil: p, qi, answer: "Paris", round: 1, sub });
  assert.equal((await as(db, "service_role", "SELECT count(*)::int AS n FROM public.question_attempts WHERE student_id = $1", [p]))[0].n, 1);
  for (const sql of ["DELETE FROM public.question_attempts", "UPDATE public.question_attempts SET xp_awarded = 999",
    "TRUNCATE public.question_attempts"]) {
    await assert.rejects(as(db, "service_role", sql), /permission denied/, `service_role: ${sql}`);
  }
  // A pupil's own client cannot reopen or renumber a round: no UPDATE policy, so 0 rows.
  await as(db, "authenticated", `UPDATE public.question_instances SET answered = false, repeat_count = repeat_count + 1 WHERE id = $1`, [qi]);
  assert.deepEqual((await db.query("SELECT answered, repeat_count FROM public.question_instances WHERE id = $1", [qi])).rows[0],
    { answered: true, repeat_count: 0 });
  await db.exec("SELECT set_config('test.uid', '', false)");
});

// ── Append-only and the round guard ──────────────────────────────────────────

test("append-only: no role can update an attempt; deleting the pupil or the question removes the history by cascade", async () => {
  const d = await migratedDb();
  const p = await addPupil(d);
  const qi = await serve(d, p, Q.mc);
  await mc(d, { pupil: p, qi, answer: "Paris", round: 1, sub: randomUUID() });
  await assert.rejects(d.exec("UPDATE public.question_attempts SET xp_awarded = 0"), /append-only/);
  await d.exec(`DELETE FROM auth.users WHERE id = '${p}'`);
  assert.equal((await d.query("SELECT count(*)::int AS n FROM public.question_attempts")).rows[0].n, 0);
  const p2 = await addPupil(d);
  const q2 = await serve(d, p2, Q.number);
  await mc(d, { pupil: p2, qi: q2, answer: "4", round: 1, sub: randomUUID() });
  await d.exec(`DELETE FROM public.questions WHERE id = '${Q.number}'`);
  assert.equal((await d.query("SELECT count(*)::int AS n FROM public.question_attempts")).rows[0].n, 0);
});

test("round guard: repeat_count and reopening change only together, as one reopen with + 1", async () => {
  const p = await addPupil(db);
  const qi = await serve(db, p, Q.mc, { answered: true });
  const upd = (set) => db.exec(`UPDATE public.question_instances SET ${set} WHERE id = '${qi}'`);
  await assert.rejects(upd("answered = false"), /kan kun genåbnes med repeat_count \+ 1/);
  await assert.rejects(upd("repeat_count = repeat_count + 1"), /repeat_count \+ 1/);
  await assert.rejects(upd("answered = false, repeat_count = repeat_count + 2"), /repeat_count \+ 1/);
  await upd("answered = false, repeat_count = repeat_count + 1");
  await assert.rejects(upd("repeat_count = 0"), /repeat_count \+ 1/, "never back");
  await upd("answered = true, answered_at = now()");
  await upd("answered = true, teacher_feedback = 'ok', next_review_at = now(), user_answer = 'x'");
  assert.deepEqual((await db.query("SELECT answered, repeat_count FROM public.question_instances WHERE id = $1", [qi])).rows[0],
    { answered: true, repeat_count: 1 });
});

// ── 12. The live answer functions are unchanged ──────────────────────────────

test("12. the live process_question_attempt and process_text_answer behave identically with and without the migration, and write no attempts", async () => {
  const run = async (d) => {
    const out = [];
    const p = await addPupil(d);
    const qi = await serve(d, p, Q.mc);
    const live = (answer) => as(d, "service_role", "SELECT public.process_question_attempt($1, $2, $3, 0) AS r", [p, qi, answer]);
    out.push((await live("Rom"))[0].r, (await live("Paris"))[0].r);            // wrong, then already answered
    await as(d, "service_role", `SELECT public.request_repeat_question_servable_for_student($1, 5::smallint, ARRAY['geografi'])`, [p]);
    out.push((await live("Paris"))[0].r);                                      // a repeat: 2 XP + 1 coin
    const pt = await addPupil(d);
    const qt = await serve(d, pt, Q.text);
    const liveText = (ok) => as(d, "service_role", "SELECT public.process_text_answer($1, $2, 'hund', $3) AS r", [qt, pt, ok]);
    out.push((await liveText(true))[0].r, (await liveText(true))[0].r);         // rewarded, then already_processed
    const strip = (s) => ({ ...s, instances: s.instances.map(({ id, at, review, ...rest }) => rest) });
    out.push(strip(await snapshot(d, p)), strip(await snapshot(d, pt)));
    return out;
  };
  const before = await run(await chainDb());
  const after = await run(await migratedDb());
  assert.deepEqual(after, before);
  assert.deepEqual(after[5].attempts, [], "the log is written only by _v2");
});

// ── 13. Subject switch: release_open_question_outside ────────────────────────

test("13. a round closed by a subject switch answers round_closed; a released round 0 is gone (not_found); a new instance starts at round 1", async () => {
  const p = await addPupil(db);
  const answered = await serve(db, p, Q.mc2);
  await mc(db, { pupil: p, qi: answered, answer: "Rom", round: 1, sub: randomUUID() });
  await as(db, "service_role", `SELECT public.request_repeat_question_servable_for_student($1, 5::smallint, ARRAY['historie'])`, [p]);
  await db.exec(`SELECT set_config('test.uid', '${p}', false)`);
  assert.equal((await as(db, "authenticated", "SELECT public.release_open_question_outside(ARRAY['geografi']) AS n"))[0].n, 1);
  assert.deepEqual(await mc(db, { pupil: p, qi: answered, answer: "Rom", round: 2, sub: randomUUID() }), { outcome: "round_closed" });

  const fresh = await serve(db, p, Q.mc);
  assert.equal((await as(db, "authenticated", "SELECT public.release_open_question_outside(ARRAY['historie']) AS n"))[0].n, 1);
  await db.exec("SELECT set_config('test.uid', '', false)");
  assert.deepEqual(await mc(db, { pupil: p, qi: fresh, answer: "Paris", round: 1, sub: randomUUID() }), { outcome: "not_found" });
  const again = await serve(db, p, Q.mc);
  assert.notEqual(again, fresh);
  assert.equal((await mc(db, { pupil: p, qi: again, answer: "Paris", round: 1, sub: randomUUID() })).outcome, "recorded");
  assert.deepEqual((await attempts(db, p)).map((a) => [a.question_instance_id, a.attempt_no]).sort(),
    [[answered, 1], [again, 1]].sort());
});
