// F-07 / D-362: every one of the 7 pilot rows through production's grading and reward body, and the
// fagskift release against open rounds (P1, owner decision 2026-11-13). PGlite, synthetic pupils only.
//
// Fixture: the isolated replayed schema (production's schema, tests/isolated/schema/replay.mjs), then the
// UNMODIFIED pilot migration 20261108090100, then the rows activated IN THIS TEST DATABASE ONLY (the later,
// separate owner activation). Production's bodies are asserted by md5 (read-only from production on
// 2026-11-13): process_question_attempt 2e05e769… (G1), release_open_question_outside b80c1c78….
//
// The key handed to grading is content.correct, as get-next-question writes it into
// question_instances.correct_answer. process_question_attempt runs as service_role, as process-event calls it.
//
// Proves: per row, the stored key is graded correct and pays 10 XP + 5 coins once; a wrong answer pays
// nothing; a second submission of the same instance pays nothing; a correct repeat round pays 2 + 1; the
// number rows' accepted input variants. And what release_open_question_outside does to open rounds when called
// with exactly the domains get-next-question derives (deriveQuestionScope(...).releaseDomains): a pilot pupil's
// open round survives; a domain the teacher removed is released; a regular pupil's behaviour is unchanged.
// Does NOT prove: the Edge Function code (process-event/get-next-question), the browser, concurrency
// (tests/unit/mc-grading-compensation-concurrency.test.mjs covers that), or PostgreSQL 17 specifics.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { replaySchema } from "../isolated/schema/replay.mjs";
import { bootstrapMarkerSql } from "../isolated/seed/seed-guard.mjs";
import { HISTORY_DOMAINS, deriveQuestionScope } from "../../supabase/functions/get-next-question/scope.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const PILOT_SQL = read("supabase/migrations/20261108090100_stimulus_pilot_content.sql");
const PQA = "public.process_question_attempt(uuid,uuid,text,bigint)";
const RELEASE = "public.release_open_question_outside(text[])";
const PROD_PQA_MD5 = "2e05e769a102f61ffef0ea4dd550c55b";
const PROD_RELEASE_MD5 = "b80c1c7857ecc90bdbd7b6175b65c78f";
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

let db;
let ROWS = []; // [{ id, level, format, correct, wrong }]

before(async () => {
  db = new PGlite();
  await db.exec(read("tests/isolated/schema/pglite-platform.sql"));
  await db.exec(bootstrapMarkerSql("0123456789abcdef0123456789abcdef"));
  const r = await replaySchema({ exec: (s) => db.exec(s), query: async (s) => (await db.query(s)).rows });
  assert.deepEqual(r.failures, []);
  await db.exec(PILOT_SQL);
  const act = await db.query(`UPDATE public.questions SET is_active = true
    WHERE metadata->>'pilot' = 'D-362' AND metadata->>'pilot_form' = 'stimulus'
    RETURNING id, difficulty_level, answer_format, content`);
  ROWS = act.rows.sort((a, b) => a.difficulty_level - b.difficulty_level).map((q) => {
    const c = q.content;
    const wrong = q.answer_format === "number" ? String(Number(c.correct) + 1) : c.options.find((o) => o !== c.correct);
    return { id: q.id, level: q.difficulty_level, format: q.answer_format, correct: c.correct, wrong, options: c.options };
  });
});
after(async () => { await db?.close(); });

const md5 = async (sig) => (await db.query("SELECT md5(prosrc) AS h FROM pg_proc WHERE oid = to_regprocedure($1)", [sig])).rows[0]?.h ?? null;

let n = 700;
async function pupil() {
  const id = uid(n++);
  await db.exec(`INSERT INTO auth.users (id, email) VALUES ('${id}', 'f07qa-${n}@example.test');
    INSERT INTO public.profiles (id, role, selected_grade, active_domains) VALUES ('${id}', 'student', 7, ARRAY['pilot_d362']);
    INSERT INTO public.student_progress (student_id, xp, coins, correct_answers, total_correct_answers,
      current_streak, longest_streak, last_activity_date) VALUES ('${id}', 100, 50, 7, 7, 1, 1, current_date - 1)
    ON CONFLICT (student_id) DO UPDATE SET xp = 100, coins = 50, correct_answers = 7, total_correct_answers = 7,
      current_streak = 1, longest_streak = 1, last_activity_date = current_date - 1;`);
  return id;
}
async function instance(p, row, repeat = 0) {
  // The columns get-next-question's insertQuestionInstance writes (instance-insert.ts), plus repeat_count for a
  // repeat round (which production reaches by reopening the row; set directly here).
  return (await db.query(`INSERT INTO public.question_instances (student_id, question_id, answered, correct_answer,
      difficulty_at_time, mastery_snapshot, repeat_count, next_review_at)
    VALUES ($1, $2, false, $3, 1, 1, $4, now()) RETURNING id`, [p, row.id, row.correct, repeat])).rows[0].id;
}
async function submit(p, qi, given) {
  await db.exec("SET ROLE service_role");
  try { return (await db.query(`SELECT public.process_question_attempt($1, $2, $3, 0) AS r`, [p, qi, given])).rows[0].r; }
  finally { await db.exec("RESET ROLE"); }
}
const progress = async (p) => (await db.query(
  "SELECT xp, coins, total_correct_answers AS t FROM public.student_progress WHERE student_id = $1", [p])).rows[0];
async function as(id, fn) {
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${id}', false)`);
  await db.exec("SET ROLE authenticated");
  try { return await fn(); }
  finally { await db.exec("RESET ROLE"); await db.exec("SELECT set_config('request.jwt.claim.sub', '', false)"); }
}

test("fixture: production's grading and release bodies, and the 7 pilot rows (5 mc, 2 number)", async () => {
  assert.equal(await md5(PQA), PROD_PQA_MD5, "process_question_attempt = production's body");
  assert.equal(await md5(RELEASE), PROD_RELEASE_MD5, "release_open_question_outside = production's body");
  assert.deepEqual(ROWS.map((r) => r.level), [5800, 5900, 6100, 6200, 6250, 6450, 6700]);
  assert.deepEqual(ROWS.map((r) => r.format), ["mc", "mc", "number", "mc", "number", "mc", "mc"]);
  for (const r of ROWS.filter((x) => x.format === "mc")) assert.ok(r.options.includes(r.correct), `S@${r.level}: key among the options`);
});

for (let i = 0; i < 7; i++) {
  test(`S${i + 1}: correct pays 10 XP + 5 coins once; resubmission pays nothing; wrong pays nothing; correct repeat pays 2 + 1`, async () => {
    const row = ROWS[i];
    // correct, then the same instance again
    const p = await pupil();
    const before0 = await progress(p);
    const qi = await instance(p, row);
    const r1 = await submit(p, qi, row.correct);
    const after1 = await progress(p);
    assert.equal(r1.status, "correct", `S${i + 1} key graded correct`);
    assert.equal(after1.xp - before0.xp, 10);
    assert.equal(after1.coins - before0.coins, 5);
    assert.equal(after1.t - before0.t, 1);
    const r2 = await submit(p, qi, row.correct);
    const after2 = await progress(p);
    assert.deepEqual([after2.xp, after2.coins, after2.t], [after1.xp, after1.coins, after1.t], "a resubmission pays nothing");
    assert.ok(["correct", "already_answered"].includes(r2.status), `resubmission status ${r2.status}`);
    // wrong
    const pw = await pupil();
    const bw = await progress(pw);
    const rw = await submit(pw, await instance(pw, row), row.wrong);
    const aw = await progress(pw);
    assert.equal(rw.status, "incorrect", `S${i + 1} wrong option graded incorrect`);
    assert.deepEqual([aw.xp - bw.xp, aw.coins - bw.coins, aw.t - bw.t], [0, 0, 0]);
    // correct in a repeat round
    const pr = await pupil();
    const br = await progress(pr);
    const rr = await submit(pr, await instance(pr, row, 1), row.correct);
    const ar = await progress(pr);
    assert.equal(rr.status, "correct");
    assert.deepEqual([ar.xp - br.xp, ar.coins - br.coins], [2, 1]);
  });
}

test("number rows S3 (30) and S5 (189): which inputs a pupil can type and get credit for", async () => {
  const out = [];
  for (const row of ROWS.filter((r) => r.format === "number")) {
    for (const given of [row.correct, ` ${row.correct} `, `${row.correct},0`, `${row.correct}.0`, `0${row.correct}`,
      `${row.correct} år`, `${row.correct}år`, "tredive", ""]) {
      const p = await pupil();
      let status;
      try { status = (await submit(p, await instance(p, row), given)).status; } catch (e) { status = `ERROR ${String(e.message).split("\n")[0]}`; }
      out.push(`${row.correct} ← ${JSON.stringify(given)}: ${status}`);
    }
  }
  for (const l of out) console.log(`# ${l}`);
  // The key itself and its plain numeric variants must count.
  for (const k of ["30", "189"]) for (const v of [k, ` ${k} `, `${k},0`, `0${k}`]) {
    assert.ok(out.includes(`${k} ← ${JSON.stringify(v)}: correct`), `${v} for ${k}`);
  }
});

test("mc rows: grading ignores case and surrounding space, as production's body does", async () => {
  for (const row of ROWS.filter((r) => r.format === "mc")) {
    const p = await pupil();
    const r = await submit(p, await instance(p, row), `  ${row.correct.toUpperCase()} `);
    assert.equal(r.status, "correct", `S@${row.level}`);
  }
});

// ── RELEASE (P1): release_open_question_outside with exactly the domains get-next-question derives ────────────
// get-next-question reads the pupil's profile, derives the scope (deriveQuestionScope) and calls
// release_open_question_outside(scope.releaseDomains) before anything else (index.ts). These tests do the same.
const profileOf = async (p) => (await db.query("SELECT selected_grade, active_domains FROM public.profiles WHERE id = $1", [p])).rows[0];
const releaseAs = async (p, subject = "historie") => {
  const domains = deriveQuestionScope(await profileOf(p), subject).releaseDomains;
  return as(p, async () => (await db.query("SELECT public.release_open_question_outside($1::text[]) AS n", [domains])).rows[0].n);
};
const instanceRow = async (id) => (await db.query("SELECT answered, was_correct, user_answer FROM public.question_instances WHERE id = $1", [id])).rows[0] ?? null;
let regularQ = null, englishQ = null;
async function regularQuestions() {
  if (regularQ) return;
  const ins = async (lo, q, correct, options) => (await db.query(`INSERT INTO public.questions (type, content, answer_format, answer_type, metadata,
      difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band, difficulty_level)
    VALUES ('mc_single', $1::jsonb, 'mc', 'short', '{}'::jsonb, 2, 'auto', true, $2, 7, 2, 6000) RETURNING id, content`,
  [JSON.stringify({ type: "mc", question: q, options, correct, accepted_answers: [correct] }), lo])).rows[0];
  const r = await ins("revolutions_democracy", "F07QA kontrol: hvornår blev Grundloven underskrevet?", "1849", ["1660", "1849", "1915", "1953"]);
  const e = await ins("english", "F07QA control: which word is a noun?", "house", ["run", "house", "quickly", "blue"]);
  regularQ = { id: r.id, correct: "1849", options: r.content.options };
  englishQ = { id: e.id, correct: "house", options: e.content.options };
}

test("RELEASE: a pilot pupil's open round survives a reload / a second get-next-question call, and the old tab can still answer it (paid once)", async () => {
  assert.ok(!HISTORY_DOMAINS.includes("pilot_d362"), "pilot_d362 is not a history domain");
  const p = await pupil(); // active_domains = ['pilot_d362']
  const open = await instance(p, ROWS[0]);
  assert.equal(await releaseAs(p), 0, "first call releases nothing");
  assert.equal(await releaseAs(p), 0, "second call (reload, second tab) releases nothing");
  assert.ok(await instanceRow(open), "the open pilot round still exists");
  const before0 = await progress(p);
  const r = await submit(p, open, ROWS[0].correct);          // the 'old tab' answers the round it was shown
  const after0 = await progress(p);
  assert.equal(r.status, "correct");
  assert.deepEqual([after0.xp - before0.xp, after0.coins - before0.coins], [10, 5], "paid exactly once");
  await submit(p, open, ROWS[0].correct);
  assert.equal((await progress(p)).xp, after0.xp, "no second payment");
});

test("RELEASE: a pilot pupil's open REPEAT round is not closed", async () => {
  const p = await pupil();
  const open = await instance(p, ROWS[1], 1);
  assert.equal(await releaseAs(p), 0);
  const row = await instanceRow(open);
  assert.equal(row.answered, false, "repeat round still open");
  assert.equal(row.was_correct, null);
});

test("RELEASE: when the teacher removes pilot_d362, the open pilot round IS released (no access to a removed domain)", async () => {
  const p = await pupil();
  const open = await instance(p, ROWS[2]);
  await db.query("UPDATE public.profiles SET active_domains = ARRAY['revolutions_democracy'] WHERE id = $1", [p]);
  assert.equal(await releaseAs(p), 1);
  assert.equal(await instanceRow(open), null, "round-1 instance without an answer is removed, as for any foreign domain");
});

test("RELEASE: switching subject to engelsk releases the open pilot round, as for every history round", async () => {
  const p = await pupil();
  const open = await instance(p, ROWS[3]);
  assert.equal(await releaseAs(p, "engelsk"), 1);
  assert.equal(await instanceRow(open), null);
});

test("RELEASE (regression G): a regular pupil is unaffected — own history round kept, an English round released in historie", async () => {
  await regularQuestions();
  for (const domains of [null, ["revolutions_democracy"], ["vikings", "cold_war"], [...HISTORY_DOMAINS]]) {
    const scope = deriveQuestionScope({ selected_grade: 7, active_domains: domains }, "historie");
    assert.deepEqual(scope.releaseDomains, [...HISTORY_DOMAINS], `regular profile ${JSON.stringify(domains)}: release domains unchanged`);
    assert.equal(scope.releaseDomains.includes("pilot_d362"), false);
  }
  const p = await pupil();
  await db.query("UPDATE public.profiles SET active_domains = ARRAY['revolutions_democracy'] WHERE id = $1", [p]);
  const own = await instance(p, regularQ);
  assert.equal(await releaseAs(p), 0);
  assert.ok(await instanceRow(own), "own history round kept");
  await submit(p, own, regularQ.correct); // close it so the pupil may get the next open round (one open round per pupil)
  const eng = await instance(p, englishQ);
  assert.equal(await releaseAs(p), 1, "an English round is released when the pupil is in historie (fagskift)");
  assert.equal(await instanceRow(eng), null);
});
