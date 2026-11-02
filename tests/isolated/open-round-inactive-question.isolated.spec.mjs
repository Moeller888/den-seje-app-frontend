// REPRODUCTION (not a fix): an open round on a question that was deactivated AFTER it was served.
// Production has four such rounds (read-only, 2026-11-02), all opened in March 2026, all round 1
// (repeat_count 0), unanswered, on world_war_2 questions whose learning_objective is one of:
//   "_turning_point", "ww2_event_potsdam_conference_start_year", "ww2_event_tehran_conference_start_year",
//   "world_war_2".
// This spec rebuilds each state with a SYNTHETIC pupil and a SYNTHETIC question on the isolated stack
// and calls the REAL get-next-question (this commit's Edge Function) as the pupil, for each subject
// (historie, dansk, engelsk). It records, per case:
//   * whether the open round was released (release_open_question_outside deletes an unanswered round-1
//     instance whose learning_objective is outside the subject's release domains);
//   * what the pupil gets next: a question, or { step: "no_questions" }.
// A control pupil without the stale round shows that the same subject does serve a question.
//
// How the state is built (service_role fixtures, setup only): the question is created ACTIVE, the open
// instance is inserted while it is active (D-290 G2's guard refuses an open round on an inactive question,
// so this is the only order in which the state can arise), and then the question is deactivated — the
// production sequence. Everything under test runs through the pupil's own session.
//
// Synthetic data only; nothing reaches production.
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
  await (await request.get(`${SUPA}/rest/v1/question_instances?select=id,question_id,answered,repeat_count&student_id=eq.${p.id}&answered=eq.false`, { headers: svc })).json();
const instanceExists = async (request, id) =>
  (await (await request.get(`${SUPA}/rest/v1/question_instances?select=id&id=eq.${id}`, { headers: svc })).json()).length === 1;

let template;
test.beforeAll(async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "backend path: once per run");
  const rows = await (await request.get(`${SUPA}/rest/v1/questions?select=type,difficulty,question_type,answer_format,answer_type,metadata,target_grade,difficulty_band,content&is_active=eq.true&answer_format=eq.mc&learning_objective=eq.world_war_2&target_grade=eq.7&limit=1`, { headers: svc })).json();
  expect(rows.length, "the synthetic seed has a grade-7 world_war_2 MC question to copy the shape from").toBe(1);
  template = rows[0];
});

// A synthetic world_war_2 question with the given learning_objective, served to the pupil while active,
// then deactivated — the production sequence.
async function staleRound(request, p, learningObjective, tag) {
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
  const off = await request.patch(`${SUPA}/rest/v1/questions?id=eq.${questionId}`, {
    headers: { ...svc, ...json, prefer: "return=minimal" }, data: { is_active: false },
  });
  expect(off.status(), await off.text()).toBe(204);
  return { questionId, instanceId: instance.id };
}

const CASES = [
  // [learning_objective, released in historie?]
  ["_turning_point", true],
  ["ww2_event_potsdam_conference_start_year", true],
  ["ww2_event_tehran_conference_start_year", true],
  ["world_war_2", false],
];
const SUBJECTS = ["historie", "dansk", "engelsk"];
const results = [];

test("control: a pupil without a stale round gets a historie question", async ({ request }) => {
  const p = await makePupil(request, "control");
  const r = await nextQuestion(request, p, "historie");
  expect(r.question_instance_id, JSON.stringify(r)).toBeTruthy();
});

for (const [lo, releasedInHistory] of CASES) {
  for (const subject of SUBJECTS) {
    test(`stale round on an inactive "${lo}" question, subject ${subject}`, async ({ request }) => {
      const tag = `${lo.replace(/[^a-z0-9]/gi, "").slice(0, 12)}-${subject}`;
      const p = await makePupil(request, tag);
      const stale = await staleRound(request, p, lo, tag);
      const r = await nextQuestion(request, p, subject);
      const released = !(await instanceExists(request, stale.instanceId));
      const open = await openRounds(request, p);
      results.push({ lo, subject, released, next: r.question_instance_id ? "question" : r.step ?? "unknown" });

      // release_open_question_outside: released unless the learning_objective is one of the subject's
      // release domains — world_war_2 is a historie domain; the other three are not domains at all.
      const expectReleased = subject === "historie" ? releasedInHistory : true;
      expect(released, `released (${lo}, ${subject})`).toBe(expectReleased);
      if (subject === "historie") {
        if (releasedInHistory) {
          // Released → the pupil gets a fresh historie question, and it is the only open round.
          expect(r.question_instance_id, JSON.stringify(r)).toBeTruthy();
          expect(open.map((o) => o.id)).toEqual([r.question_instance_id]);
        } else {
          // REPRODUCED DEFECT: the open round stays, get-next-question never serves it (inactive), and
          // idx_one_open_question refuses every new instance → no next question in historie.
          expect(r, "the pupil is blocked in historie").toEqual({ step: "no_questions" });
          expect(open.map((o) => o.id)).toEqual([stale.instanceId]);
        }
      } else {
        // dansk / engelsk: the stale history round is released; the synthetic seed holds no Danish or
        // English questions, so "no_questions" here is the empty pool, not the stale round.
        expect(open.map((o) => o.id)).not.toContain(stale.instanceId);
      }
    });
  }
}

test.afterAll(async () => {
  if (results.length) console.log("STALE-ROUND RESULTS:", JSON.stringify(results));
});
