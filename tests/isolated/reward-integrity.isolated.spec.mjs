// D-278 (reward integrity, server authority) on the isolated stack (D-110), with authenticated
// synthetic pupils. Regression proof for what the read-only production checks cannot show:
//   1. a client-claimed session streak is ignored — the server derives it from the pupil's own answers;
//   2. the night flag is set only by a correct answer the server recorded before 04:00 Copenhagen time;
//   3. a pupil cannot INSERT, UPDATE or DELETE weekly-quest progress directly;
//   4. the legitimate flows still work: real answers through process-event advance the weekly quest,
//      a completed quest is claimed exactly once, and the real streak is stored.
// The isolated replay applies 20261031190000_reward_integrity_server_authority.sql (it is applied in
// production). Synthetic pupils and the synthetic question seed only; nothing reaches production.
//
// WHAT IS A service_role FIXTURE AND WHAT IS VERIFIED AS THE PUPIL (kept apart on purpose):
//   service_role fixtures (setup only, never the behaviour under test):
//     * the Auth user and the profile; the progress row comes from trigger_ensure_student_progress and
//       is only created here if it is genuinely missing (makePupil);
//     * served question instances (serveAndAnswer) — the same backend-owned insert get-next-question does;
//     * answers RECORDED at a fixed past time (recordedAnswer) — answered_at is server-written, so a time
//       before or after 04:00 Copenhagen time can only be placed this way;
//     * every read of the outcome (progressOf, weeklyOf).
//   verified through the pupil's own authenticated session (the behaviour under test):
//     * answering through process-event; update_best_session_streak and set_night_correct with the
//       pupil's token; the refused direct INSERT/UPDATE/DELETE on student_weekly_quest_progress; the
//       pupil reading their own rows; claim_weekly_quest_reward; and the refusal without a session.
import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { assertIsolated, SYNTHETIC_EMAIL_DOMAIN } from "./isolation-guard.mjs";

assertIsolated(process.env);

const SUPA = process.env.ISOLATED_SUPABASE_URL.replace(/\/+$/, "");
const ANON = process.env.ISOLATED_SUPABASE_ANON_KEY;
const SERVICE = process.env.ISOLATED_SUPABASE_SERVICE_KEY;
const RUN = (process.env.GITHUB_RUN_ID || "local") + "-" + (process.env.GITHUB_RUN_ATTEMPT || "1");
const svc = { apikey: SERVICE, authorization: `Bearer ${SERVICE}` };
const json = { "content-type": "application/json" };

test.describe.configure({ mode: "serial" });

// A synthetic pupil: Auth user, profile, progress row, signed-in token (as typed-answer.isolated.spec.mjs).
async function makePupil(request, tag) {
  const email = `reward-${tag}-${RUN}@${SYNTHETIC_EMAIL_DOMAIN}`;
  const password = createHash("sha256").update(`isolated-reward-${tag}:${RUN}`).digest("base64url");
  const created = await request.post(`${SUPA}/auth/v1/admin/users`, { headers: svc, data: { email, password, email_confirm: true } });
  expect(created.status(), "local Auth must create the synthetic pupil").toBe(200);
  const id = (await created.json()).id;
  const profile = await request.post(`${SUPA}/rest/v1/profiles`, {
    headers: { ...svc, ...json, prefer: "return=minimal" },
    data: { id, role: "student", full_name: `Syntetisk belønningselev ${tag}`, selected_grade: 7, equipped_slots: {}, active_theme: "default" },
  });
  expect(profile.status(), await profile.text()).toBe(201);
  // The progress row: the trigger trigger_ensure_student_progress (AFTER INSERT ON profiles, role
  // 'student'; the same trigger exists in production) creates it with the table defaults when the profile
  // is inserted. The answer and reward functions only UPDATE it. Use the existing row; create it only if
  // it is genuinely missing — never reset or overwrite it.
  const existing = await request.get(`${SUPA}/rest/v1/student_progress?select=student_id&student_id=eq.${id}`, { headers: svc });
  expect(existing.status(), await existing.text()).toBe(200);
  if ((await existing.json()).length === 0) {
    const progress = await request.post(`${SUPA}/rest/v1/student_progress`, {
      headers: { ...svc, ...json, prefer: "return=minimal" }, data: { student_id: id },
    });
    expect(progress.status(), await progress.text()).toBe(201);
  }
  const row = await (await request.get(`${SUPA}/rest/v1/student_progress?select=coins,best_session_streak,night_correct&student_id=eq.${id}`, { headers: svc })).json();
  expect(row.length, "exactly one progress row for the new pupil").toBe(1);
  const signIn = await request.post(`${SUPA}/auth/v1/token?grant_type=password`, { headers: { apikey: ANON }, data: { email, password } });
  expect(signIn.status()).toBe(200);
  return { id, token: (await signIn.json()).access_token };
}
const asPupil = (p) => ({ apikey: ANON, authorization: `Bearer ${p.token}` });
const rpc = (request, p, fn, data = {}) => request.post(`${SUPA}/rest/v1/rpc/${fn}`, { headers: { ...asPupil(p), ...json }, data });
const progressOf = async (request, p) =>
  (await (await request.get(`${SUPA}/rest/v1/student_progress?select=coins,best_session_streak,night_correct&student_id=eq.${p.id}`, { headers: svc })).json())[0];
const weeklyOf = async (request, p) =>
  await (await request.get(`${SUPA}/rest/v1/student_weekly_quest_progress?select=quest_id,week_key,progress,completed,claimed&student_id=eq.${p.id}&order=quest_id`, { headers: svc })).json();

let mc = [];
let weekly = [];

test.beforeAll(async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "backend path: once per run");
  mc = await (await request.get(`${SUPA}/rest/v1/questions?select=id,content,difficulty&is_active=eq.true&answer_format=eq.mc&order=id&limit=16`, { headers: svc })).json();
  expect(mc.length, "the synthetic seed has enough multiple-choice questions").toBeGreaterThanOrEqual(15);
  weekly = await (await request.get(`${SUPA}/rest/v1/weekly_quests?select=id,quest_key,type,target,reward_coins&is_active=eq.true&order=sort_order`, { headers: svc })).json();
  expect(weekly.map((q) => q.quest_key), "20260524000000_weekly_quests.sql seeds the three weekly quests")
    .toEqual(["week_answer_20", "week_correct_10", "week_xp_150"]);
});

// The backend path a pupil uses: the instance is served (backend-owned insert), then answered through
// this commit's process-event, which calls process_question_attempt.
async function serveAndAnswer(request, p, q, correct) {
  const served = await request.post(`${SUPA}/rest/v1/question_instances`, {
    headers: { ...svc, ...json, prefer: "return=representation" },
    data: { student_id: p.id, question_id: q.id, correct_answer: q.content.correct, difficulty_at_time: q.difficulty, mastery_snapshot: q.difficulty },
  });
  expect(served.status(), await served.text()).toBe(201);
  const instanceId = (await served.json())[0].id;
  const wrong = q.content.options.find((o) => o !== q.content.correct);
  const res = await request.post(`${SUPA}/functions/v1/process-event`, {
    headers: asPupil(p),
    data: { student_id: p.id, question_instance_id: instanceId, answer: correct ? q.content.correct : wrong,
      // As the real client (app.js: questionShownAt = Date.now()): epoch milliseconds. process_question_attempt
      // takes p_question_shown_at bigint.
      question_shown_at: Date.now() },
  });
  expect(res.status(), await res.text()).toBe(200);
  expect((await res.json()).status).toBe(correct ? "correct" : "incorrect");
}

// An answer the server recorded at a given moment (answered_at is server-written; a historic time is
// the only way to place one deterministically before or after 04:00 Copenhagen time).
async function recordedAnswer(request, p, q, answeredAt, wasCorrect) {
  const res = await request.post(`${SUPA}/rest/v1/question_instances`, {
    headers: { ...svc, ...json, prefer: "return=minimal" },
    data: { student_id: p.id, question_id: q.id, correct_answer: q.content.correct, difficulty_at_time: q.difficulty,
      mastery_snapshot: q.difficulty, answered: true, answered_at: answeredAt, was_correct: wasCorrect,
      user_answer: wasCorrect ? q.content.correct : "x" },
  });
  expect(res.status(), await res.text()).toBe(201);
}

test.describe("streak, weekly quest and direct writes", () => {
  let pupil;
  test.beforeAll(async ({ request }) => { pupil = await makePupil(request, "a"); });

  test("4a. ten correct answers through process-event complete the correct-count weekly quest (server path)", async ({ request }) => {
    for (const q of mc.slice(0, 10)) await serveAndAnswer(request, pupil, q, true);
    const byKey = Object.fromEntries((await weeklyOf(request, pupil)).map((r) => [weekly.find((w) => w.id === r.quest_id).quest_key, r]));
    expect(byKey.week_answer_20).toMatchObject({ progress: 10, completed: false, claimed: false });
    expect(byKey.week_correct_10).toMatchObject({ progress: 10, completed: true, claimed: false });
  });

  test("1. a client-claimed session streak is ignored; the stored streak is the server's run of correct answers", async ({ request }) => {
    const before = await progressOf(request, pupil);
    const res = await rpc(request, pupil, "update_best_session_streak", { p_count: 999 });
    expect(res.ok(), await res.text()).toBe(true);
    const after = await progressOf(request, pupil);
    expect(after.best_session_streak, "ten correct answers in a row, not 999").toBe(10);
    expect(after.coins, "the streak call pays nothing").toBe(before.coins);
    // A wrong answer ends the run; the best streak is kept, never raised by the client's number.
    await serveAndAnswer(request, pupil, mc[10], false);
    await rpc(request, pupil, "update_best_session_streak", { p_count: 1000 });
    expect((await progressOf(request, pupil)).best_session_streak).toBe(10);
  });

  test("1b. without a session the streak and night functions cannot be called", async ({ request }) => {
    for (const fn of ["update_best_session_streak", "set_night_correct"]) {
      const res = await request.post(`${SUPA}/rest/v1/rpc/${fn}`, { headers: { apikey: ANON, ...json }, data: fn === "set_night_correct" ? {} : { p_count: 5 } });
      expect(res.ok(), `${fn} as anon: ${res.status()}`).toBe(false);
    }
  });

  test("3. the pupil cannot INSERT, UPDATE or DELETE weekly-quest progress directly", async ({ request }) => {
    const before = await weeklyOf(request, pupil);
    const answer20 = weekly.find((w) => w.quest_key === "week_answer_20");
    const xp150 = weekly.find((w) => w.quest_key === "week_xp_150");
    const row = before.find((r) => r.quest_id === answer20.id);
    const base = `${SUPA}/rest/v1/student_weekly_quest_progress`;

    const ins = await request.post(base, { headers: { ...asPupil(pupil), ...json, prefer: "return=minimal" },
      data: { student_id: pupil.id, quest_id: xp150.id, week_key: row.week_key, progress: xp150.target, completed: true, claimed: false } });
    expect(ins.ok(), `INSERT: ${ins.status()}`).toBe(false);
    expect([401, 403]).toContain(ins.status());

    const upd = await request.patch(`${base}?student_id=eq.${pupil.id}&quest_id=eq.${answer20.id}&week_key=eq.${row.week_key}`,
      { headers: { ...asPupil(pupil), ...json, prefer: "return=minimal" }, data: { progress: answer20.target, completed: true } });
    expect(upd.ok(), `UPDATE: ${upd.status()}`).toBe(false);
    expect([401, 403]).toContain(upd.status());

    const del = await request.delete(`${base}?student_id=eq.${pupil.id}`, { headers: { ...asPupil(pupil), prefer: "return=minimal" } });
    expect(del.ok(), `DELETE: ${del.status()}`).toBe(false);
    expect([401, 403]).toContain(del.status());

    expect(await weeklyOf(request, pupil), "no row changed").toEqual(before);
    // Reading the own rows still works (the client's quest panel).
    const read = await request.get(`${base}?select=quest_id,progress&student_id=eq.${pupil.id}`, { headers: asPupil(pupil) });
    expect(read.status()).toBe(200);
    expect((await read.json()).length).toBe(before.length);
  });

  test("4b. a completed weekly quest is claimed exactly once; an incomplete one is refused", async ({ request }) => {
    const correct10 = weekly.find((w) => w.quest_key === "week_correct_10");
    const answer20 = weekly.find((w) => w.quest_key === "week_answer_20");
    const weekKey = (await weeklyOf(request, pupil)).find((r) => r.quest_id === correct10.id).week_key;
    const before = await progressOf(request, pupil);

    const first = await rpc(request, pupil, "claim_weekly_quest_reward", { p_quest_id: correct10.id, p_week_key: weekKey });
    expect(first.status(), await first.text()).toBe(200);
    expect(await first.json()).toBe("claimed");
    expect((await progressOf(request, pupil)).coins).toBe(before.coins + correct10.reward_coins);

    const again = await rpc(request, pupil, "claim_weekly_quest_reward", { p_quest_id: correct10.id, p_week_key: weekKey });
    expect(await again.json()).toBe("already_claimed");
    const notDone = await rpc(request, pupil, "claim_weekly_quest_reward", { p_quest_id: answer20.id, p_week_key: weekKey });
    expect(await notDone.json()).toBe("not_completed");
    expect((await progressOf(request, pupil)).coins, "paid once").toBe(before.coins + correct10.reward_coins);
  });
});

test.describe("night flag", () => {
  let pupil;
  test.beforeAll(async ({ request }) => { pupil = await makePupil(request, "n"); });

  test("2. no correct answer before 04:00 Copenhagen time: the client cannot set the night flag", async ({ request }) => {
    // A correct answer at noon and a WRONG answer at 01:00 (both Copenhagen time, CEST +02:00).
    await recordedAnswer(request, pupil, mc[12], "2026-10-15T12:00:00+02:00", true);
    await recordedAnswer(request, pupil, mc[13], "2026-10-16T01:00:00+02:00", false);
    const res = await rpc(request, pupil, "set_night_correct");
    expect(res.ok(), await res.text()).toBe(true);
    // Only these two answers exist for this pupil, so the result does not depend on the CI clock.
    expect((await progressOf(request, pupil)).night_correct,
      "a wrong night answer and a daytime correct answer do not earn the flag").toBe(false);
  });

  test("4c. a correct answer recorded at 02:30 Copenhagen time earns the flag (legitimate flow)", async ({ request }) => {
    await recordedAnswer(request, pupil, mc[14], "2026-10-17T02:30:00+02:00", true);
    const res = await rpc(request, pupil, "set_night_correct");
    expect(res.ok(), await res.text()).toBe(true);
    expect((await progressOf(request, pupil)).night_correct).toBe(true);
  });
});
