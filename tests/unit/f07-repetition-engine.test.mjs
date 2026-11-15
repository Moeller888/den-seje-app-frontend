// F-07 / D-362: what the EXISTING repetition engine does around a phased course (characterisation, PGlite,
// synthetic pupils only). Owner question 2026-11-15: "is a correctly answered task offered again, and can a pupil
// earn rewards again and again without new achievement?" Nothing here changes a rule; it pins today's behaviour.
//
// Real code under test (unmodified):
//   request_repeat_phase_question_for_student (20261113170000) — the phase repeat while a phase is open;
//   request_repeat_level_question_for_student — the generic repeat that runs once nothing new is servable
//     (LEVEL_ENGINE=v1, production);
//   process_question_attempt — the answer path every deployed client uses today (legacy, H5 is off in js/).
// The HTTP layer (index.ts orders: due → new → phase repeat → generic repeat) is covered by the isolated F07 lane.
//
// Real concurrency (two connections at once) cannot be run in PGlite (one connection). The interleavings are
// replayed in order here; the HTTP race is the isolated lane's backend 3.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { replaySchema } from "../isolated/schema/replay.mjs";
import { bootstrapMarkerSql } from "../isolated/seed/seed-guard.mjs";
import { MAX_REPEATS } from "../../supabase/functions/get-next-question/phase-gate.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let db, ROWS = [];
const LABEL = new Map();

const asService = async (fn) => { await db.exec("SET ROLE service_role"); try { return await fn(); } finally { await db.exec("RESET ROLE"); } };

before(async () => {
  db = new PGlite();
  await db.exec(read("tests/isolated/schema/pglite-platform.sql"));
  await db.exec(bootstrapMarkerSql("0123456789abcdef0123456789abcdef"));
  const r = await replaySchema({ exec: (s) => db.exec(s), query: async (s) => (await db.query(s)).rows });
  assert.deepEqual(r.failures, []);
  await db.exec(read("supabase/migrations/20261108090100_stimulus_pilot_content.sql"));
  await db.exec(read("supabase/migrations/20261113170000_phase_repeat_rpc.sql"));
  const act = await db.query(`UPDATE public.questions SET is_active = true WHERE metadata->>'pilot' = 'D-362' AND metadata->>'pilot_form' = 'stimulus'
    RETURNING id, difficulty_level, content, metadata`);
  ROWS = act.rows.sort((a, b) => a.difficulty_level - b.difficulty_level);
  ROWS.forEach((q, i) => LABEL.set(q.id, `S${i + 1}`));
  assert.equal(ROWS.length, 7);
});
after(async () => { await db?.close(); });

let n = 5100;
// A pupil whose 7 course items are already answered once (first round), each right or wrong as given.
async function pupilAfterCourse(firstRight, { repeatCount = 0 } = {}) {
  const id = uid(n++);
  await db.query("INSERT INTO auth.users (id, email) VALUES ($1, $2)", [id, `f07rep-${n}@example.test`]);
  await db.query("INSERT INTO public.profiles (id, role, selected_grade, active_domains) VALUES ($1, 'student', 7, ARRAY['pilot_d362'])", [id]);
  for (const [i, q] of ROWS.entries()) {
    await db.query(`INSERT INTO public.question_instances (student_id, question_id, answered, correct_answer, difficulty_at_time, mastery_snapshot, repeat_count, next_review_at, was_correct, answered_at)
      VALUES ($1, $2, true, $3, 1, 1, $4, now(), $5, now() - make_interval(mins => $6))`, [id, q.id, q.content.correct, repeatCount, firstRight(i), 100 - i]);
  }
  return id;
}
const wallet = async (p) => (await db.query("SELECT coalesce((SELECT xp FROM public.student_progress WHERE student_id = $1), 0) AS xp, coalesce((SELECT coins FROM public.student_progress WHERE student_id = $1), 0) AS coins", [p])).rows[0];
const genericRepeat = (p) => asService(async () => (await db.query("SELECT public.request_repeat_level_question_for_student($1, ARRAY['pilot_d362']) AS id", [p])).rows[0].id);
const phaseRepeat = (p, ids, max = MAX_REPEATS) => asService(async () => (await db.query("SELECT public.request_repeat_phase_question_for_student($1, ARRAY['pilot_d362'], $2::uuid[], $3) AS id", [p, ids, max])).rows[0].id);
const answer = (p, qi, ok) => asService(async () => {
  const q = (await db.query("SELECT q.content FROM public.question_instances qi JOIN public.questions q ON q.id = qi.question_id WHERE qi.id = $1", [qi])).rows[0].content;
  const wrong = q.options ? q.options.find((o) => o !== q.correct) : String(Number(q.correct) + 1);
  return (await db.query("SELECT public.process_question_attempt($1, $2, $3, 0) AS r", [p, qi, ok ? q.correct : wrong])).rows[0].r;
});
const labelOf = async (qi) => LABEL.get((await db.query("SELECT question_id FROM public.question_instances WHERE id = $1", [qi])).rows[0].question_id);

test("after a course with every answer RIGHT, the generic repeat serves right answers again and again (oldest first), each paying 2 XP + 1 coin", async () => {
  const p = await pupilAfterCourse(() => true);
  const w0 = await wallet(p);
  const served = [];
  for (let k = 0; k < 21; k++) {            // three full cycles over the 7 items
    const qi = await genericRepeat(p);
    assert.ok(qi, `round ${k + 1}: the generic repeat always finds a right answer to reopen`);
    served.push(await labelOf(qi));
    const r = await answer(p, qi, true);
    assert.equal(r.status, "correct");
  }
  assert.deepEqual(served.slice(0, 7), ["S1", "S2", "S3", "S4", "S5", "S6", "S7"], "oldest answer first");
  assert.deepEqual(served.slice(7, 14), served.slice(0, 7), "round robin: the same 7 again");
  assert.deepEqual(served.slice(14), served.slice(0, 7), "and again — no upper bound");
  const w = await wallet(p);
  assert.equal(w.xp - w0.xp, 21 * 2, "every correct repeat pays 2 XP");
  assert.equal(w.coins - w0.coins, 21 * 1, "and 1 coin");
  const rc = (await db.query("SELECT max(repeat_count) AS m FROM public.question_instances WHERE student_id = $1", [p])).rows[0].m;
  assert.equal(rc, 3, "repeat_count grows past MAX_REPEATS: the generic repeat has no cap");
});

test("WRONG answers come first: the generic repeat picks the oldest wrong answer, also after both phase repeats are used up", async () => {
  // S3 and S6 still wrong after 1 + MAX_REPEATS rounds (needs support), the rest right.
  const p = await pupilAfterCourse((i) => i !== 2 && i !== 5);
  const wrongIds = (await db.query("SELECT question_id FROM public.question_instances WHERE student_id = $1 AND was_correct = false", [p])).rows.map((r) => r.question_id);
  // Use up both phase repeats of S3 and S6 the real way (each reopened and answered wrong), S3 last.
  for (let k = 0; k < 2 * MAX_REPEATS; k++) { const id = await phaseRepeat(p, wrongIds); assert.ok(id); await answer(p, id, false); }
  assert.equal(await phaseRepeat(p, wrongIds), null, "the phase repeat refuses: both phase repeats are used up");
  const rc = (await db.query("SELECT repeat_count FROM public.question_instances WHERE student_id = $1 AND was_correct = false", [p])).rows.map((r) => r.repeat_count);
  assert.deepEqual(rc, [MAX_REPEATS, MAX_REPEATS]);
  const lastWrong = (await db.query(`SELECT qi.question_id FROM public.question_instances qi WHERE qi.student_id = $1 AND qi.was_correct = false ORDER BY qi.answered_at ASC LIMIT 1`, [p])).rows[0].question_id;
  const oldest = LABEL.get(lastWrong);
  const other = oldest === "S3" ? "S6" : "S3";
  const w0 = await wallet(p);
  const first = await genericRepeat(p);
  assert.equal(await labelOf(first), oldest, "the generic repeat still offers a needs-support item (oldest wrong first)");
  assert.equal((await answer(p, first, false)).status, "incorrect");
  assert.deepEqual(await wallet(p), w0, "a wrong repeat pays nothing");
  const second = await genericRepeat(p);
  // Order among wrong answers is answered_at ASC: the other one now precedes the just re-answered one.
  assert.equal(await labelOf(second), other);
  assert.equal((await answer(p, second, true)).status, "correct");
  const third = await genericRepeat(p);
  assert.equal(await labelOf(third), oldest, "the remaining wrong item before any right one");
  assert.equal((await answer(p, third, true)).status, "correct");
  const fourth = await genericRepeat(p);
  assert.equal(await labelOf(fourth), "S1", "no wrong answer left → back to the oldest right answer");
  const w = await wallet(p);
  assert.equal(w.xp - w0.xp, 4, "two correct repeats = 2 × 2 XP");
});

test("the phase repeat reopens only WRONG answers with repeats left; a right answer is never reopened by it", async () => {
  const p = await pupilAfterCourse((i) => i !== 0);
  const ids = ROWS.map((r) => r.id);
  const qi = await phaseRepeat(p, ids);
  assert.equal(await labelOf(qi), "S1");
  await answer(p, qi, true);
  assert.equal(await phaseRepeat(p, ids), null, "every answer is right now → nothing to reopen");
  const q2 = await pupilAfterCourse((i) => i !== 0);
  for (let k = 0; k < MAX_REPEATS; k++) { const id = await phaseRepeat(q2, ids); assert.ok(id); await answer(q2, id, false); }
  assert.equal(await phaseRepeat(q2, ids), null, `after ${MAX_REPEATS} wrong repeats: refused`);
  assert.ok(await genericRepeat(q2), "…but the generic repeat still serves it (no cap)");
});

test("the same answer sent twice pays once; a second request while a round is open reopens nothing", async () => {
  const p = await pupilAfterCourse(() => true);
  const w0 = await wallet(p);
  const qi = await genericRepeat(p);
  assert.equal(await genericRepeat(p), null, "second tab: a round is already open → the generic repeat returns null (index.ts: due step serves the open round)");
  assert.equal(await phaseRepeat(p, ROWS.map((r) => r.id)), null, "same for the phase repeat");
  const a = await answer(p, qi, true);
  const b = await answer(p, qi, true);
  assert.equal(a.status, "correct");
  assert.equal(b.status, "correct", "the second submit returns the stored result");
  const w = await wallet(p);
  assert.equal(w.xp - w0.xp, 2, "paid once");
  assert.equal(w.coins - w0.coins, 1);
});

test("two tabs, interleaved: A reopens, B answers A's round, A answers too → one payment, then the next repeat", async () => {
  const p = await pupilAfterCourse(() => true);
  const w0 = await wallet(p);
  const qi = await genericRepeat(p);              // tab A reopens
  assert.equal(await genericRepeat(p), null);      // tab B: refused, gets the open round from the due step
  await answer(p, qi, true);                        // tab B answers
  await answer(p, qi, true);                        // tab A answers the same round
  const w = await wallet(p);
  assert.equal(w.xp - w0.xp, 2, "the shared round pays once");
  assert.ok(await genericRepeat(p), "the next repeat is available afterwards");
});

// Subject switch DURING an open phase repeat (historie → engelsk → historie). release_open_question_outside closes
// the open repeat round as answered with was_correct NULL (no answer, nothing paid). The phase gate counts that item
// as "retry"; the phase repeat must be able to reopen it, or the pupil meets 409 phase_state_changed on every call.
const asPupil = async (p, fn) => {
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [p]);
  await db.exec("SET ROLE authenticated");
  try { return await fn(); } finally { await db.exec("RESET ROLE"); await db.query("SELECT set_config('request.jwt.claim.sub', '', false)"); }
};
test("subject switch closes an open phase repeat (was_correct NULL); the phase repeat can reopen it again, unpaid until answered", async () => {
  const p = await pupilAfterCourse((i) => i !== 0);       // S1 wrong
  const ids = ROWS.map((r) => r.id);
  const qi = await phaseRepeat(p, ids);
  assert.equal(await labelOf(qi), "S1");
  const released = await asPupil(p, async () => (await db.query("SELECT public.release_open_question_outside(ARRAY['english']) AS n")).rows[0].n);
  assert.equal(released, 1, "the English call closes the open S1 repeat round");
  const row = (await db.query("SELECT answered, was_correct, repeat_count FROM public.question_instances WHERE id = $1", [qi])).rows[0];
  assert.deepEqual([row.answered, row.was_correct, row.repeat_count], [true, null, 1], "closed without a verdict");
  const w0 = await wallet(p);
  const again = await phaseRepeat(p, ids);
  assert.equal(again, qi, "back in historie: the phase repeat reopens the closed S1 round (no dead end)");
  assert.deepEqual(await wallet(p), w0, "closing and reopening pays nothing");
});
