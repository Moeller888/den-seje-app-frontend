// REGRESSION TEST for D-316 (reproduced first in PR #551, Isolated E2E run 41422220606): an open round
// on a question that was deactivated AFTER it was served must not block the pupil.
// Production has four such rounds (read-only, 2026-11-02), all opened in March 2026, all round 1, unanswered,
// on world_war_2 questions whose learning_objective is one of "_turning_point",
// "ww2_event_potsdam_conference_start_year", "ww2_event_tehran_conference_start_year", "world_war_2".
// Before D-316, world_war_2 in historie was NOT released and the pupil got { step: "no_questions" }.
//
// This spec rebuilds each state with a SYNTHETIC pupil and a SYNTHETIC question on the isolated stack and
// calls the REAL get-next-question (this commit's Edge Function) as the pupil, for historie, dansk and
// engelsk (synthetic Danish and English questions are added here; the seed has none). With
// 20261102100000 (replayed as REPO_AHEAD_OF_PRODUCTION until it is applied) every case must:
//   * release the stale round — round 1 deleted; a reopened repeat closed with repeat_count kept;
//   * serve a fresh ACTIVE question of the chosen subject — never the inactive one;
//   * leave student_progress (XP, coins, streaks, counters) and the pupil's answered history unchanged.
// A control pupil without a stale round gets a question as before.
//
// How the state is built (service_role fixtures, setup only): the question is created ACTIVE, the round
// opened while it is active (D-290 G2's guard refuses an open round on an inactive question, so this is the
// only order in which the state can arise), then the question is deactivated — the production sequence.
// LIMITS: mastery and achievements are not written by get-next-question or the release function at all;
// student_progress is compared as a whole row. Synthetic data only; nothing reaches production.
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

async function makePupil(request, tag) {
  const email = `stale-round-${tag}-${RUN}@${SYNTHETIC_EMAIL_DOMAIN}`;
  const password = createHash("sha256").update(`isolated-stale-round-${tag}:${RUN}`).digest("base64url");
  const created = await request.post(`${SUPA}/auth/v1/admin/users`, { headers: svc, data: { email, password, email_confirm: true } });
  expect(created.status(), "local Auth must create the synthetic pupil").toBe(200);
  const id = (await created.json()).id;
  const profile = await request.post(`${SUPA}/rest/v1/profiles`, {
    headers: { ...svc, ...json, prefer: "return=minimal" },
    data: { id, role: "student", full_name: `Syntetisk elev ${tag}`, selected_grade: 7, equipped_slots: {}, active_theme: "default" },
  });
  expect(profile.status(), await profile.text()).toBe(201);
  const signIn = await request.post(`${SUPA}/auth/v1/token?grant_type=password`, { headers: { apikey: ANON }, data: { email, password } });
  expect(signIn.status()).toBe(200);
  return { id, token: (await signIn.json()).access_token };
}
const asPupil = (p) => ({ apikey: ANON, authorization: `Bearer ${p.token}` });

// The real Edge Function, called as the browser does (app.js: functions.invoke("get-next-question", { body: { subject } })).
async function nextQuestion(request, p, subject) {
  const res = await request.post(`${SUPA}/functions/v1/get-next-question`, { headers: { ...asPupil(p), ...json }, data: { subject } });
  expect(res.status(), await res.text()).toBe(200);
  return await res.json();
}
const openRounds = async (request, p) =>
  await (await request.get(`${SUPA}/rest/v1/question_instances?select=id&student_id=eq.${p.id}&answered=eq.false`, { headers: svc })).json();
const progressOf = async (request, p) =>
  (await (await request.get(`${SUPA}/rest/v1/student_progress?select=*&student_id=eq.${p.id}`, { headers: svc })).json())[0];
const historyOf = async (request, p) =>
  await (await request.get(`${SUPA}/rest/v1/question_instances?select=id,question_id,answered,user_answer,was_correct,repeat_count,answered_at&student_id=eq.${p.id}&answered=eq.true&order=id`, { headers: svc })).json();
async function questionOf(request, instanceId) {
  const qi = (await (await request.get(`${SUPA}/rest/v1/question_instances?select=question_id&id=eq.${instanceId}`, { headers: svc })).json())[0];
  return (await (await request.get(`${SUPA}/rest/v1/questions?select=id,is_active,learning_objective&id=eq.${qi.question_id}`, { headers: svc })).json())[0];
}

let template;
test.beforeAll(async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "backend path: once per run");
  const rows = await (await request.get(`${SUPA}/rest/v1/questions?select=type,difficulty,question_type,answer_format,answer_type,metadata,target_grade,difficulty_band,content&is_active=eq.true&answer_format=eq.mc&learning_objective=eq.world_war_2&target_grade=eq.7&limit=1`, { headers: svc })).json();
  expect(rows.length, "the synthetic seed has a grade-7 world_war_2 MC question to copy the shape from").toBe(1);
  template = rows[0];
  // The seed has no Danish or English questions: add synthetic ones so a subject switch can serve one.
  for (const lo of ["danish", "english"]) {
    for (let i = 0; i < 3; i++) {
      const options = [`A ${lo}${i}`, `B ${lo}${i}`, `C ${lo}${i}`, `D ${lo}${i}`];
      const res = await request.post(`${SUPA}/rest/v1/questions`, {
        headers: { ...svc, ...json, prefer: "return=minimal" },
        data: { ...template, learning_objective: lo, metadata: { ...template.metadata, domain: lo }, is_active: true,
          content: { question: `Syntetisk ${lo}-spørgsmål ${i} ${RUN}`, options, correct: options[0], accepted_answers: [options[0]], review_text: "syntetisk" } },
      });
      expect(res.status(), await res.text()).toBe(201);
    }
  }
});

// An earlier answered round on another active question: history that must survive untouched.
async function earlierAnswer(request, p) {
  const q = (await (await request.get(`${SUPA}/rest/v1/questions?select=id,content,difficulty&is_active=eq.true&answer_format=eq.mc&learning_objective=eq.vikings&target_grade=eq.7&limit=1`, { headers: svc })).json())[0];
  const res = await request.post(`${SUPA}/rest/v1/question_instances`, {
    headers: { ...svc, ...json, prefer: "return=minimal" },
    data: { student_id: p.id, question_id: q.id, correct_answer: q.content.correct, difficulty_at_time: q.difficulty, mastery_snapshot: q.difficulty,
      answered: true, answered_at: new Date(Date.now() - 86400000).toISOString(), was_correct: true, user_answer: q.content.correct },
  });
  expect(res.status(), await res.text()).toBe(201);
}

// A synthetic world_war_2 question with the given learning_objective, served while active, then
// deactivated. With { repeat: true } the round is first answered and then reopened the way the repeat
// functions do it (answered true → false, repeat_count + 1, saved answer cleared), still while active.
async function staleRound(request, p, learningObjective, tag, { repeat = false } = {}) {
  const options = [`A ${tag}`, `B ${tag}`, `C ${tag}`, `D ${tag}`];
  const content = { question: `Syntetisk deaktiveret spørgsmål ${tag} ${RUN}`, options, correct: options[0], accepted_answers: [options[0]], review_text: "syntetisk" };
  const q = await request.post(`${SUPA}/rest/v1/questions`, {
    headers: { ...svc, ...json, prefer: "return=representation" },
    data: { ...template, content, learning_objective: learningObjective, is_active: true },
  });
  expect(q.status(), await q.text()).toBe(201);
  const questionId = (await q.json())[0].id;
  const served = await request.post(`${SUPA}/rest/v1/question_instances`, {
    headers: { ...svc, ...json, prefer: "return=representation" },
    data: { student_id: p.id, question_id: questionId, correct_answer: options[0], difficulty_at_time: template.difficulty, mastery_snapshot: template.difficulty },
  });
  expect(served.status(), await served.text()).toBe(201);
  const instance = (await served.json())[0];
  expect(instance.answered).toBe(false);
  expect(instance.repeat_count).toBe(0);
  if (repeat) {
    const answer = await request.patch(`${SUPA}/rest/v1/question_instances?id=eq.${instance.id}`, {
      headers: { ...svc, ...json, prefer: "return=minimal" },
      data: { answered: true, answered_at: new Date(Date.now() - 3600000).toISOString(), user_answer: options[1], was_correct: false },
    });
    expect(answer.status(), await answer.text()).toBe(204);
    const reopen = await request.patch(`${SUPA}/rest/v1/question_instances?id=eq.${instance.id}`, {
      headers: { ...svc, ...json, prefer: "return=minimal" }, data: { answered: false, repeat_count: 1, user_answer: null },
    });
    expect(reopen.status(), await reopen.text()).toBe(204);
  }
  const off = await request.patch(`${SUPA}/rest/v1/questions?id=eq.${questionId}`, {
    headers: { ...svc, ...json, prefer: "return=minimal" }, data: { is_active: false },
  });
  expect(off.status(), await off.text()).toBe(204);
  return { questionId, instanceId: instance.id };
}

const CASES = ["_turning_point", "ww2_event_potsdam_conference_start_year", "ww2_event_tehran_conference_start_year", "world_war_2"];
const SUBJECTS = { historie: null, dansk: "danish", engelsk: "english" };
const results = [];

test("control: a pupil without a stale round gets a historie question", async ({ request }) => {
  const p = await makePupil(request, "control");
  const r = await nextQuestion(request, p, "historie");
  expect(r.question_instance_id, JSON.stringify(r)).toBeTruthy();
});

async function check(request, p, stale, subject, { repeat = false, lo }) {
  const progressBefore = await progressOf(request, p);
  const historyBefore = await historyOf(request, p);
  const r = await nextQuestion(request, p, subject);
  results.push({ lo, subject, repeat, next: r.question_instance_id ? "question" : r.step ?? "unknown" });
  // The stale round no longer blocks: a fresh question of the chosen subject, active, not the old one.
  expect(r.question_instance_id, `blocked: ${JSON.stringify(r)}`).toBeTruthy();
  expect(r.question_instance_id).not.toBe(stale.instanceId);
  const served = await questionOf(request, r.question_instance_id);
  expect(served.is_active, "an inactive question is never served").toBe(true);
  expect(served.id).not.toBe(stale.questionId);
  if (SUBJECTS[subject]) expect(served.learning_objective).toBe(SUBJECTS[subject]);
  // Released by the right path.
  const staleRow = (await (await request.get(`${SUPA}/rest/v1/question_instances?select=answered,repeat_count&id=eq.${stale.instanceId}`, { headers: svc })).json())[0] ?? null;
  if (repeat) {
    expect(staleRow, "a repeat is closed, not deleted").not.toBeNull();
    expect(staleRow.answered).toBe(true);
    expect(staleRow.repeat_count, "repeat_count kept: never a new first attempt").toBe(1);
  } else {
    expect(staleRow, "an unanswered round 1 is deleted").toBeNull();
  }
  expect((await openRounds(request, p)).map((o) => o.id)).toEqual([r.question_instance_id]);
  // Nothing paid or taken; no answered history lost.
  expect(await progressOf(request, p)).toEqual(progressBefore);
  const historyAfter = await historyOf(request, p);
  for (const h of historyBefore) expect(historyAfter).toContainEqual(h);
}

for (const lo of CASES) {
  for (const subject of Object.keys(SUBJECTS)) {
    test(`stale round on an inactive "${lo}" question, subject ${subject}: released, next question served`, async ({ request }) => {
      const tag = `${lo.replace(/[^a-z0-9]/gi, "").slice(0, 12)}-${subject}`;
      const p = await makePupil(request, tag);
      await earlierAnswer(request, p);
      const stale = await staleRound(request, p, lo, tag);
      await check(request, p, stale, subject, { lo });
    });
  }
}

test("a reopened repeat on an inactive world_war_2 question, subject historie: closed, repeat_count kept, next question served", async ({ request }) => {
  const p = await makePupil(request, "repeat-ww2");
  await earlierAnswer(request, p);
  const stale = await staleRound(request, p, "world_war_2", "repeat-ww2", { repeat: true });
  await check(request, p, stale, "historie", { repeat: true, lo: "world_war_2" });
});

test.afterAll(async () => {
  if (results.length) console.log("STALE-ROUND RESULTS:", JSON.stringify(results));
});
