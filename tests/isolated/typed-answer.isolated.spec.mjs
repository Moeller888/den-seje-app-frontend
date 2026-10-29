// A typed ("Stav til") answer graded by the REAL backend, on the isolated stack (D-110).
//
// The quiz specs answer multiple choice, and stav-til.spec.ts intercepts both backend calls (it tests
// the renderer). This proves the server half separately: one of the two seeded typed questions
// (synthetic-questions.mjs TEXT_QUESTIONS) goes through this commit's process-event and the replayed
// process_text_answer — a correct spelling, a wrong spelling (key and explanation come back), and a
// repeated answer that awards nothing twice. Synthetic pupil, synthetic question; nothing else.
import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { assertIsolated, SYNTHETIC_EMAIL_DOMAIN } from "./isolation-guard.mjs";

assertIsolated(process.env);

const SUPA = process.env.ISOLATED_SUPABASE_URL.replace(/\/+$/, "");
const ANON = process.env.ISOLATED_SUPABASE_ANON_KEY;
const SERVICE = process.env.ISOLATED_SUPABASE_SERVICE_KEY;
const RUN = (process.env.GITHUB_RUN_ID || "local") + "-" + (process.env.GITHUB_RUN_ATTEMPT || "1");
const PUPIL = `typed-${RUN}@${SYNTHETIC_EMAIL_DOMAIN}`;
const PASSWORD = createHash("sha256").update("isolated-typed:" + RUN).digest("base64url");
const svc = { apikey: SERVICE, authorization: `Bearer ${SERVICE}` };

test.describe.configure({ mode: "serial" });

let pupilId = "", token = "", typed = [];

test.beforeAll(async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "backend path: once per run");
  const created = await request.post(`${SUPA}/auth/v1/admin/users`, { headers: svc, data: { email: PUPIL, password: PASSWORD, email_confirm: true } });
  expect(created.status(), "local Auth must create the synthetic pupil").toBe(200);
  pupilId = (await created.json()).id;
  const profile = await request.post(`${SUPA}/rest/v1/profiles`, {
    headers: { ...svc, "content-type": "application/json", prefer: "return=minimal" },
    data: { id: pupilId, role: "student", full_name: "Syntetisk staveelev", selected_grade: 7, equipped_slots: {}, active_theme: "default" },
  });
  expect(profile.status(), await profile.text()).toBe(201);
  const signIn = await request.post(`${SUPA}/auth/v1/token?grant_type=password`, { headers: { apikey: ANON }, data: { email: PUPIL, password: PASSWORD } });
  expect(signIn.status()).toBe(200);
  token = (await signIn.json()).access_token;
  const qs = await request.get(`${SUPA}/rest/v1/questions?select=id,content,difficulty&is_active=eq.true&answer_format=eq.text&order=id`, { headers: svc });
  typed = await qs.json();
  expect(typed.length, "the seed carries exactly two typed questions, as production does").toBe(2);
});

// The instance a pupil would be served (question_instances are written by the backend only).
async function serve(request, q) {
  const res = await request.post(`${SUPA}/rest/v1/question_instances`, {
    headers: { ...svc, "content-type": "application/json", prefer: "return=representation" },
    data: { student_id: pupilId, question_id: q.id, correct_answer: q.content.correct, difficulty_at_time: q.difficulty, mastery_snapshot: q.difficulty },
  });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json())[0].id;
}
const answer = (request, instanceId, text) => request.post(`${SUPA}/functions/v1/process-event`, {
  headers: { apikey: ANON, authorization: `Bearer ${token}` },
  data: { student_id: pupilId, question_instance_id: instanceId, answer: text, question_shown_at: new Date().toISOString() },
});
const progress = async (request) => (await (await request.get(`${SUPA}/rest/v1/student_progress?select=xp,coins&student_id=eq.${pupilId}`, { headers: svc })).json())[0] ?? { xp: 0, coins: 0 };
const instance = async (request, id) => (await (await request.get(`${SUPA}/rest/v1/question_instances?select=answered,was_correct&id=eq.${id}`, { headers: svc })).json())[0];

test("a correct spelling is graded correct by the backend, recorded once, and rewarded once", async ({ request }) => {
  const id = await serve(request, typed[0]);
  const before = await progress(request);
  const res = await answer(request, id, typed[0].content.correct);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.status).toBe("correct");
  expect(body.correct_answer).toBe(typed[0].content.correct);
  expect(await instance(request, id)).toEqual({ answered: true, was_correct: true });
  const after = await progress(request);
  // process_text_answer's reward: 10 XP and 5 coins.
  expect(after, "a correct typed answer earns 10 XP and 5 coins").toEqual({ xp: before.xp + 10, coins: before.coins + 5 });

  // A retry of the same answer (network retry) must not award again.
  const again = await answer(request, id, typed[0].content.correct);
  expect(again.status()).toBe(200);
  expect(await progress(request)).toEqual(after);
});

test("a wrong spelling is graded incorrect; the key and the explanation come back only now", async ({ request }) => {
  const id = await serve(request, typed[1]);
  const before = await progress(request);
  const res = await answer(request, id, typed[1].content.correct + "x");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.status).toBe("incorrect");
  expect(body.correct_answer).toBe(typed[1].content.correct);
  expect(body.review_text).toBe(typed[1].content.review_text);
  expect(await instance(request, id)).toEqual({ answered: true, was_correct: false });
  expect(await progress(request), "nothing for a wrong spelling").toEqual(before);
});
