// D-384 (F8): THE STALE TAB. A pupil gets an active course round in tab A; the round is parked; the pupil works in another
// subject; the round is resumed in tab B (the SAME question_instance id); then a delayed request from tab A arrives, and
// tab B answers with its own answer. Proven end to end with the REAL get-next-question and the REAL process-event of this
// tree (tests/unit/helpers/gnq-db-backend.mjs turns each supabase-js call into SQL) against a REAL database: production's
// answer chain (helpers/answer-chain-schema.mjs) + D-280 + D-316 and, unmodified on top, 20261120150000 (D-383),
// 20261123100000 (#740) and 20261124120000 (D-384). PGlite locally; the unit job's PostgreSQL 17.6 in CI
// (LEVEL_ENGINE_PG_URL) — and the simultaneous cases only there (two connections).
//
// The answer path is the one production uses today: the LEGACY one (H5 off, K1 not applied) — process_question_attempt
// with no round_no and no submission_id. (The H5 _v2 path calls K1's 9-argument functions, which production does not
// have; the activation check is ONE check before every path, proven on all four in process-event-round-activation.test.)
//
// A pass proves more than "paid once": the answer that counts is the CURRENT activation's (tab B), whichever request
// arrives first; the older tab's answer is refused (409 stale_activation) and changes nothing — not the row, not the
// reward, not the course step.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { answerChainSql, extractFunction, readMigration } from "./helpers/answer-chain-schema.mjs";
import { PG_URL, loadHandler, makeTemplate, openDatabase, post, request } from "./helpers/gnq-db-backend.mjs";
import { historyFromRows, nextStep } from "../../supabase/functions/_shared/learning-sequence.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GNQ = await loadHandler(join(ROOT, "supabase", "functions", "get-next-question", "index.ts"));
const PE = await loadHandler(join(ROOT, "supabase", "functions", "process-event", "index.ts"));

// ── The database: production's answer chain → D-383 → #740 → D-384 (built once, copied per test) ─────────────────
let template = null;
after(async () => { if (template) await (await template).dispose(); });
async function build() {
  const db = await openDatabase(ROOT, "stale_tab_tpl");
  for (const s of answerChainSql({ realServer: db.onPg })) await db.x(s);
  await db.x(readMigration("20261031194600_mc_length_cue_answer_paths.sql"));
  await db.x(readMigration("20261102100000_release_open_rounds_on_inactive_questions.sql"));
  await db.x(extractFunction("20261016160000_answer_keys_server_side_rpcs.sql", "get_unserved_questions_for_student"));
  await db.x(`REVOKE ALL ON FUNCTION public.get_unserved_questions_for_student(uuid, smallint, text[]) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.get_unserved_questions_for_student(uuid, smallint, text[]) TO service_role;`);
  await db.x(extractFunction("20261019150000_question_format_mix.sql", "get_question_candidates_for_student"));
  await db.x(`REVOKE ALL ON FUNCTION public.get_question_candidates_for_student(uuid, smallint, text[], integer) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.get_question_candidates_for_student(uuid, smallint, text[], integer) TO service_role;`);
  await db.x(readMigration("20261120150000_course_items_out_of_ordinary_quiz.sql"));
  await db.x(readMigration("20261123100000_course_scope_before_candidate_limit.sql"));
  await db.x(readMigration("20261124120000_course_round_parking.sql"));
  return makeTemplate(db);
}
async function database() {
  template ??= build();
  return openDatabase(ROOT, "stale_tab", { template: await template });
}

// ── Content and pupils (synthetic) ─────────────────────────────────────────────────────────────────────────────
let seq = 0;
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function question(db, objective, metadata = {}) {
  const id = uid(20000 + ++seq);
  await db.q(`INSERT INTO public.questions (id, type, content, metadata, difficulty, is_active, question_type, learning_objective,
      answer_format, answer_type, target_grade, difficulty_band, difficulty_level)
    VALUES ($1, 'mc_single', $2::jsonb, $3::jsonb, 1, true, 'auto', $4, 'mc', 'short', 6, 1, 1000)`,
  [id, JSON.stringify({ question: `Q ${id}`, options: ["a", "b"], correct: "a" }), JSON.stringify(metadata), objective]);
  return id;
}
async function setup(db) {
  const c = { ordinary: [], english: [], course: null };
  for (let i = 0; i < 4; i++) c.ordinary.push(await question(db, "vikings"));
  for (let i = 0; i < 2; i++) c.english.push(await question(db, "english"));
  c.course = await question(db, "vikings", { learning_step: "guided_practice" });
  const p = uid(60000 + ++seq);
  await db.q("INSERT INTO auth.users VALUES ($1)", [p]);
  await db.q("INSERT INTO public.profiles (id, role, selected_grade, active_domains) VALUES ($1, 'student', 6, $2)", [p, ["vikings"]]);
  await db.q("INSERT INTO public.student_progress (student_id) VALUES ($1)", [p]);
  // The pupil is in the course: an open course round in its first practice step, as the server sequence leaves it.
  const r = await db.q(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, next_review_at)
    VALUES ($1, $2, 'a', now()) RETURNING id`, [p, c.course]);
  return { c, p, round: r[0].id };
}
const PARKING = { LAERLIGVERSE_COURSE_PARKING: "on" };
const LV = { LAERLIGVERSE_OBJECTIVE_TARGETING: "on", LAERLIGVERSE_SEQUENCE: "on", LAERLIGVERSE_SERVED_MODE: "on", LAERLIGVERSE_HINTS: "on" };
const COURSE = { subject: "historie", learning_objective: "vikings", sequence: true };
const row = async (db, id) => (await db.q(`SELECT answered, user_answer, was_correct, repeat_count, activation_no,
  parked_at IS NOT NULL AS parked, parked_objective FROM public.question_instances WHERE id = $1`, [id]))[0];
const progress = async (db, p) => { const r = (await db.q("SELECT xp, coins FROM public.student_progress WHERE student_id = $1", [p]))[0]; return { xp: Number(r.xp), coins: Number(r.coins) }; };
const step = async (db, p) => {
  const rows = await db.q(`SELECT qi.answered, qi.was_correct, qi.answered_at, q.metadata FROM public.question_instances qi
    JOIN public.questions q ON q.id = qi.question_id WHERE qi.student_id = $1 AND q.metadata ? 'learning_step'`, [p]);
  return JSON.stringify(nextStep(historyFromRows(rows.map((r) => ({ ...r, questions: { metadata: r.metadata } }))), Date.now()));
};
/** One answer through the real process-event, on the production (legacy) path. */
const answer = (db, p, instance, ans, activation, { flags = PARKING, capture = true } = {}) => post(PE, db, p, {
  flags, capture,
  body: { student_id: p, question_instance_id: instance, answer: ans, question_shown_at: Date.now(), ...(activation === undefined ? {} : { activation_no: activation }) },
});

/** Steps 1–4: tab A holds the course round (activation 0), the pupil leaves the course, works, and resumes in tab B. */
async function toResumed(db, { cycles = 1 } = {}) {
  const s = await setup(db);
  const tabA = await request(GNQ, db, s.p, { flags: { ...LV, ...PARKING }, body: COURSE });
  assert.equal(tabA.status, 200, tabA.text);
  assert.equal(tabA.body.question_instance_id, s.round, "tab A: the course round");
  assert.equal(tabA.body.activation_no, 0, "tab A: activation 0 (never resumed)");
  let tabB = null;
  for (let i = 0; i < cycles; i++) {
    // The pupil leaves the course: the ordinary quiz parks the round and serves an ordinary task, which is answered.
    const other = await request(GNQ, db, s.p, { flags: PARKING, body: { subject: "historie" } });
    assert.equal(other.status, 200, other.text);
    assert.notEqual(other.body.question_instance_id, s.round, "an ordinary task, not the course round");
    assert.equal((await row(db, s.round)).parked, true, "the course round is parked");
    const o = await answer(db, s.p, other.body.question_instance_id, "a", other.body.activation_no);
    assert.equal(o.status, 200, o.text);
    // Back in the course (tab B): the SAME round, resumed, in a NEW activation.
    tabB = await request(GNQ, db, s.p, { flags: { ...LV, ...PARKING }, body: COURSE });
    assert.equal(tabB.status, 200, `${tabB.text} ${tabB.logs.filter((l) => l.includes("COURSE_ROUND")).join(" | ")} rows=${JSON.stringify(await db.q("SELECT id, answered, parked_at IS NOT NULL AS parked FROM public.question_instances WHERE student_id = $1", [s.p]))}`);
    assert.equal(tabB.body.question_instance_id, s.round, "tab B: the same instance");
    assert.equal(tabB.body.activation_no, i + 1, `activation ${i + 1} after resume ${i + 1}`);
    // Clock-independent: the resumed round is due by its creation time, not the database's now() — on real PostgreSQL
    // now() (µs, the database's clock) could lie after the Edge clock's ms, and the round was then not served (409).
    assert.equal((await db.q("SELECT next_review_at <= created_at AS ok FROM public.question_instances WHERE id = $1", [s.round]))[0].ok, true);
  }
  return { ...s, tabA, tabB };
}

test("scenario: tab A's delayed answer arrives FIRST — refused (409 stale_activation), nothing changes; tab B's answer is the one that counts", async () => {
  const db = await database();
  try {
    for (const [aAnswer, bAnswer] of [["a", "b"], ["b", "a"]]) {
      const s = await toResumed(db);
      const before = { row: await row(db, s.round), prog: await progress(db, s.p), step: await step(db, s.p) };
      const a = await answer(db, s.p, s.round, aAnswer, s.tabA.body.activation_no);
      assert.equal(a.status, 409, a.text);
      assert.deepEqual(a.body, { outcome: "stale_activation", error: "Stale activation" });
      assert.deepEqual(await row(db, s.round), before.row, "the row is untouched");
      assert.deepEqual(await progress(db, s.p), before.prog, "nothing paid");
      assert.equal(await step(db, s.p), before.step, "the course step is unchanged");
      const b = await answer(db, s.p, s.round, bAnswer, s.tabB.body.activation_no);
      assert.equal(b.status, 200, b.text);
      assert.equal(b.body.status, bAnswer === "a" ? "correct" : "incorrect", "graded on TAB B's answer");
      const after = await row(db, s.round);
      assert.equal(after.answered, true);
      assert.equal(after.user_answer, bAnswer, "tab B's answer is recorded, not tab A's");
      assert.equal(after.was_correct, bAnswer === "a");
      const paid = await progress(db, s.p);
      if (bAnswer === "a") assert.ok(paid.xp > before.prog.xp, "a correct current answer is paid");
      else assert.equal(paid.xp, before.prog.xp, "a wrong current answer is not paid");
    }
  } finally { await db.end(); }
});

test("scenario: tab B answers FIRST — accepted; tab A's delayed answer (correct or not) is refused as stale and cannot replace it", async () => {
  const db = await database();
  try {
    for (const [bAnswer, aAnswer] of [["b", "a"], ["a", "b"]]) {
      const s = await toResumed(db);
      const b = await answer(db, s.p, s.round, bAnswer, s.tabB.body.activation_no);
      assert.equal(b.status, 200, b.text);
      const mid = { row: await row(db, s.round), prog: await progress(db, s.p), step: await step(db, s.p) };
      const a = await answer(db, s.p, s.round, aAnswer, s.tabA.body.activation_no);
      assert.equal(a.status, 409, a.text);
      assert.equal(a.body.outcome, "stale_activation", "refused as STALE (not merely 'already answered')");
      assert.deepEqual(await row(db, s.round), mid.row, "tab B's answer stands");
      assert.deepEqual(await progress(db, s.p), mid.prog, "nothing paid for tab A");
      assert.equal(await step(db, s.p), mid.step);
    }
  } finally { await db.end(); }
});

test("an old client (no activation_no at all), a replay of tab A, a future number and tab B's own repeat: only tab B's first answer counts, paid once", async () => {
  const db = await database();
  try {
    const s = await toResumed(db);
    for (const act of [undefined, 0, 7]) {
      const r = await answer(db, s.p, s.round, "a", act);
      assert.equal(r.status, 409, `${act}: ${r.text}`);
      assert.equal(r.body.outcome, "stale_activation");
    }
    const first = await answer(db, s.p, s.round, "a", 1);
    assert.equal(first.status, 200, first.text);
    const paid = await progress(db, s.p);
    const again = await answer(db, s.p, s.round, "a", 1);
    assert.notEqual(again.body?.status, undefined, again.text);
    assert.deepEqual(await progress(db, s.p), paid, "tab B's repeated request pays nothing twice");
    assert.equal((await row(db, s.round)).user_answer, "a");
  } finally { await db.end(); }
});

test("several park/resume cycles: each resume is a new activation; only the latest is accepted", async () => {
  const db = await database();
  try {
    const s = await toResumed(db, { cycles: 3 });
    assert.equal(s.tabB.body.activation_no, 3);
    for (const old of [0, 1, 2]) assert.equal((await answer(db, s.p, s.round, "a", old)).status, 409, `activation ${old}`);
    const ok = await answer(db, s.p, s.round, "a", 3);
    assert.equal(ok.status, 200, ok.text);
    assert.equal((await row(db, s.round)).activation_no, 3);
  } finally { await db.end(); }
});

test("while the round is PARKED, every answer — any activation — is refused (409 round_parked) and nothing is written", async () => {
  const db = await database();
  try {
    const s = await setup(db);
    const tabA = await request(GNQ, db, s.p, { flags: { ...LV, ...PARKING }, body: COURSE });
    await request(GNQ, db, s.p, { flags: PARKING, body: { subject: "engelsk" } });
    assert.equal((await row(db, s.round)).parked, true, "a subject switch parks it too");
    const before = await row(db, s.round);
    for (const act of [tabA.body.activation_no, undefined, 1]) {
      const r = await answer(db, s.p, s.round, "a", act);
      assert.equal(r.status, 409, r.text);
      assert.ok(["round_parked", "stale_activation"].includes(r.body.outcome), r.text);
    }
    assert.deepEqual(await row(db, s.round), before);
  } finally { await db.end(); }
});

test("flags: with LAERLIGVERSE_COURSE_PARKING off nothing is parked or checked (D-383); switched off AFTER a resume, the check is off too", async () => {
  const db = await database();
  try {
    // Off from the start: the open course round blocks the ordinary quiz (D-383's course_round_open), nothing parked.
    const s0 = await setup(db);
    const blocked = await request(GNQ, db, s0.p, { flags: {}, body: { subject: "historie" } });
    assert.equal(blocked.body?.reason, "course_round_open", blocked.text);
    assert.equal("activation_no" in (blocked.body ?? {}), false);
    assert.equal((await row(db, s0.round)).parked, false);
    // Off after a resume: process-event no longer reads the activation — an older tab's answer is accepted as the one
    // answer (first wins, paid once). Documented: the flag is the protection; switching it off is the rollback step.
    const s = await toResumed(db);
    const a = await answer(db, s.p, s.round, "a", s.tabA.body.activation_no, { flags: {} });
    assert.equal(a.status, 200, a.text);
    const paid = await progress(db, s.p);
    const b = await answer(db, s.p, s.round, "b", s.tabB.body.activation_no, { flags: {} });
    assert.notEqual(b.status, 500, b.text);
    assert.deepEqual(await progress(db, s.p), paid, "still one answer, paid once");
    assert.equal((await row(db, s.round)).user_answer, "a");
  } finally { await db.end(); }
});

test("simultaneous (real PostgreSQL, two connections): tab A's stale and tab B's current answer at the same moment — B counts, A is refused; two B requests — one answer, paid once",
  { skip: !PG_URL && "needs a real PostgreSQL server (LEVEL_ENGINE_PG_URL): PGlite has one connection" }, async () => {
    const db = await database();
    try {
      for (let i = 0; i < 6; i++) {
        const s = await toResumed(db);
        const c2 = await db.connect();
        try {
          const [a, b] = await Promise.all([
            answer(c2, s.p, s.round, "b", s.tabA.body.activation_no, { capture: false }),
            answer(db, s.p, s.round, "a", s.tabB.body.activation_no, { capture: false }),
          ]);
          assert.equal(a.status, 409, a.text);
          assert.equal(b.status, 200, b.text);
          assert.equal((await row(db, s.round)).user_answer, "a");
          const s2 = await toResumed(db);
          const before = await progress(db, s2.p);
          const [x, y] = await Promise.all([
            answer(c2, s2.p, s2.round, "a", 1, { capture: false }),
            answer(db, s2.p, s2.round, "a", 1, { capture: false }),
          ]);
          assert.ok([x.status, y.status].includes(200), `${x.text} | ${y.text}`);
          const paid = await progress(db, s2.p);
          assert.equal(paid.xp - before.xp, 10, "paid exactly once (10 XP, D-211)");
          const single = (await db.q(`SELECT count(*)::int n FROM public.question_instances WHERE id = $1 AND answered`, [s2.round]))[0].n;
          assert.equal(single, 1);
        } finally { await c2.close(); }
      }
    } finally { await db.end(); }
  });
