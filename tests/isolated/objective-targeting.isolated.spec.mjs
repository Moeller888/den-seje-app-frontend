// Objective targeting (D-329) against the REAL backend on the isolated stack (D-110): this commit's
// get-next-question and process-event, the replayed schema, synthetic pupils and synthetic questions.
// The workflow serves the functions with LAERLIGVERSE_OBJECTIVE_TARGETING=on (it is off everywhere else).
//
// Nothing is mocked. Every assertion reads the database with the local service key (this test process
// only): which question an instance belongs to, whether it was answered and graded, what was paid.
// "learning_objective" here is the EXISTING questions.learning_objective (a domain such as world_war_2);
// no new objective ids exist — those are LP-2/LP-13.
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
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "backend path: once per run");
});

async function makePupil(request, label, { grade = 8, domains = ["cold_war", "world_war_2"] } = {}) {
  const tag = `${label}-${RUN}`.replace(/[^A-Za-z0-9-]/g, "");
  const email = `obj-${tag}@${SYNTHETIC_EMAIL_DOMAIN}`;
  const password = createHash("sha256").update(`isolated-obj:${tag}`).digest("base64url");
  const created = await request.post(`${SUPA}/auth/v1/admin/users`, { headers: svc, data: { email, password, email_confirm: true } });
  expect(created.status(), "local Auth must create the synthetic pupil").toBe(200);
  const id = (await created.json()).id;
  const profile = await request.post(`${SUPA}/rest/v1/profiles`, {
    headers: { ...svc, ...json, prefer: "return=minimal" },
    data: { id, role: "student", full_name: `Syntetisk målelev ${label}`, selected_grade: grade, active_domains: domains, equipped_slots: {}, active_theme: "default" },
  });
  expect(profile.status(), await profile.text()).toBe(201);
  const signIn = await request.post(`${SUPA}/auth/v1/token?grant_type=password`, { headers: { apikey: ANON }, data: { email, password } });
  expect(signIn.status()).toBe(200);
  return { id, token: (await signIn.json()).access_token };
}

const gnq = (request, pupil, body) =>
  request.post(`${SUPA}/functions/v1/get-next-question`, { headers: { apikey: ANON, authorization: `Bearer ${pupil.token}`, ...json }, data: body });
const answer = (request, pupil, instanceId, text) =>
  request.post(`${SUPA}/functions/v1/process-event`, {
    headers: { apikey: ANON, authorization: `Bearer ${pupil.token}`, ...json },
    // process-event takes question_shown_at as epoch milliseconds (the adapter sends Date.now()).
    data: { question_instance_id: instanceId, answer: text, question_shown_at: Date.now() },
  });
const instances = async (request, pupil) =>
  await (await request.get(`${SUPA}/rest/v1/question_instances?select=id,answered,was_correct,correct_answer,repeat_count,questions(learning_objective)&student_id=eq.${pupil.id}&order=created_at`, { headers: svc })).json();
const progress = async (request, pupil) =>
  (await (await request.get(`${SUPA}/rest/v1/student_progress?select=xp,coins&student_id=eq.${pupil.id}`, { headers: svc })).json())[0] ?? { xp: 0, coins: 0 };

/** The right and a wrong answer for an instance, from the server's own key (read by this test only). */
async function answers(request, pupil, served) {
  const row = (await instances(request, pupil)).find((r) => r.id === served.question_instance_id);
  expect(row, "the served instance exists for THIS pupil").toBeTruthy();
  const options = Array.isArray(served.content?.options) ? served.content.options : [];
  const wrong = options.find((o) => o !== row.correct_answer) ?? "syntetisk-forkert-svar";
  return { right: row.correct_answer, wrong, row };
}

test("a valid objective: the served question belongs to it, the server grades and pays, and the next task stays in it", async ({ request }) => {
  const p = await makePupil(request, "valid");
  const before = await progress(request, p);
  const r1 = await gnq(request, p, { subject: "historie", learning_objective: "world_war_2" });
  expect(r1.status(), await r1.text()).toBe(200);
  const s1 = await r1.json();
  expect(s1.learning_objective, "the server echoes the objective it served").toBe("world_war_2");
  const a1 = await answers(request, p, s1);
  expect(a1.row.questions.learning_objective, "the instance's question is in the objective (database)").toBe("world_war_2");
  const g1 = await answer(request, p, s1.question_instance_id, a1.right);
  expect(g1.status(), await g1.text()).toBe(200);
  expect((await instances(request, p)).find((r) => r.id === s1.question_instance_id)).toMatchObject({ answered: true, was_correct: true });
  expect(await progress(request, p)).toEqual({ xp: before.xp + 10, coins: before.coins + 5 });

  // A second task in the same objective: a NEW instance, still in world_war_2, graded by the server.
  const r2 = await gnq(request, p, { subject: "historie", learning_objective: "world_war_2" });
  expect(r2.status()).toBe(200);
  const s2 = await r2.json();
  expect(s2.question_instance_id).not.toBe(s1.question_instance_id);
  const a2 = await answers(request, p, s2);
  expect(a2.row.questions.learning_objective).toBe("world_war_2");
  const g2 = await answer(request, p, s2.question_instance_id, a2.wrong);
  expect(g2.status()).toBe(200);
  expect((await instances(request, p)).find((r) => r.id === s2.question_instance_id)).toMatchObject({ answered: true, was_correct: false });
  // A wrong answer pays nothing; the same submission again pays nothing and changes nothing.
  const afterWrong = await progress(request, p);
  expect(afterWrong).toEqual({ xp: before.xp + 10, coins: before.coins + 5 });
  const again = await answer(request, p, s2.question_instance_id, a2.right);
  expect(again.status()).toBe(200);
  expect((await instances(request, p)).find((r) => r.id === s2.question_instance_id), "the stored verdict, not a regrade").toMatchObject({ answered: true, was_correct: false });
  expect(await progress(request, p)).toEqual(afterWrong);
  expect(await instances(request, p)).toHaveLength(2);
});

test("without learning_objective the response carries no objective: today's path (the frontend suite runs it in full)", async ({ request }) => {
  const p = await makePupil(request, "plain");
  const r = await gnq(request, p, { subject: "historie" });
  expect(r.status(), await r.text()).toBe(200);
  const s = await r.json();
  expect(typeof s.question_instance_id).toBe("string");
  expect("learning_objective" in s).toBe(false);
});

test("refused objectives create nothing: malformed (400), outside the pupil's domains, another subject or made up (403)", async ({ request }) => {
  const p = await makePupil(request, "refused");
  for (const [objective, status, error] of [
    ["World War 2", 400, "invalid_learning_objective"],
    [123, 400, "invalid_learning_objective"],
    [["world_war_2"], 400, "invalid_learning_objective"],
    ["vikings", 403, "learning_objective_not_allowed"],
    ["english", 403, "learning_objective_not_allowed"],
    ["hist_besaettelsen_h4_kilde", 403, "learning_objective_not_allowed"],
  ]) {
    const r = await gnq(request, p, { subject: "historie", learning_objective: objective });
    expect(r.status(), JSON.stringify(objective)).toBe(status);
    expect(await r.json()).toEqual({ error });
  }
  expect(await instances(request, p), "no instance was created by a refused request").toEqual([]);
});

test("an open question in ANOTHER objective is a 409: not served as this objective's, not released, not changed", async ({ request }) => {
  const p = await makePupil(request, "conflict");
  const r1 = await gnq(request, p, { subject: "historie", learning_objective: "cold_war" });
  expect(r1.status()).toBe(200);
  const open = await r1.json();
  const before = await instances(request, p);
  const r2 = await gnq(request, p, { subject: "historie", learning_objective: "world_war_2" });
  expect(r2.status(), await r2.text()).toBe(409);
  expect(await r2.json()).toEqual({ error: "open_question_other_objective" });
  expect(await instances(request, p), "nothing released or changed").toEqual(before);
  // Its own objective still gets the same open instance back.
  const r3 = await gnq(request, p, { subject: "historie", learning_objective: "cold_war" });
  expect((await r3.json()).question_instance_id).toBe(open.question_instance_id);
});

test("concurrent targeted requests: ONE open instance, the same one for every request", async ({ request }) => {
  const p = await makePupil(request, "concurrent");
  const rs = await Promise.all([0, 1, 2].map(() => gnq(request, p, { subject: "historie", learning_objective: "world_war_2" })));
  const bodies = await Promise.all(rs.map(async (r) => ({ status: r.status(), body: await r.json() })));
  const served = bodies.filter((b) => b.status === 200 && typeof b.body.question_instance_id === "string");
  expect(served.length, "at least one request is served").toBeGreaterThan(0);
  expect(new Set(served.map((b) => b.body.question_instance_id)).size, "never two different instances").toBe(1);
  // A request that lost the race is told so explicitly — never "the objective is exhausted".
  for (const b of bodies.filter((x) => !served.includes(x))) expect(b).toEqual({ status: 409, body: { error: "open_question_exists" } });
  expect(await instances(request, p)).toHaveLength(1);
  // A retry gets the same instance.
  const again = await (await gnq(request, p, { subject: "historie", learning_objective: "world_war_2" })).json();
  expect(again.question_instance_id).toBe(served[0].body.question_instance_id);
});

test("an exhausted objective is an explicit objective_exhausted and NEVER a repeat (E2); untargeted, the same pupil may get one", async ({ request }) => {
  // Grade 3 + one domain: the synthetic seed has only a handful of such questions.
  const p = await makePupil(request, "exhausted", { grade: 3, domains: ["vikings"] });
  let served = 0;
  let last = null;
  for (let i = 0; i < 25; i++) {
    const r = await gnq(request, p, { subject: "historie", learning_objective: "vikings" });
    expect(r.status(), await r.text()).toBe(200);
    last = await r.json();
    if (last.step === "no_questions") break;
    served++;
    const a = await answers(request, p, last);
    expect(a.row.questions.learning_objective).toBe("vikings");
    // Answer wrong: a wrong answer is exactly what the repeat step would pick up first.
    expect((await answer(request, p, last.question_instance_id, a.wrong)).status()).toBe(200);
  }
  expect(served, "the seed served at least one vikings question at grade 3").toBeGreaterThan(0);
  expect(last).toEqual({ step: "no_questions", reason: "objective_exhausted" });
  const rows = await instances(request, p);
  expect(rows).toHaveLength(served);
  expect(rows.every((r) => r.repeat_count === 0), "no repeat was opened by a targeted request").toBe(true);
  // Contrast — today's untargeted path for the same exhausted pool still reaches the repeat step.
  const plain = await gnq(request, p, { subject: "historie" });
  expect(plain.status()).toBe(200);
  const reopened = (await instances(request, p)).filter((r) => r.repeat_count > 0);
  expect(reopened.length, "the untargeted path reopened a repeat, as it always has").toBe(1);
});

test("another pupil cannot answer a targeted instance, and an invalid session gets nothing", async ({ request }) => {
  const a = await makePupil(request, "owner");
  const b = await makePupil(request, "intruder");
  const s = await (await gnq(request, a, { subject: "historie", learning_objective: "world_war_2" })).json();
  const right = (await answers(request, a, s)).right;
  const before = await progress(request, b);
  const steal = await answer(request, b, s.question_instance_id, right);
  expect(steal.status(), "process-event refuses another pupil's instance").not.toBe(200);
  expect((await instances(request, a)).find((r) => r.id === s.question_instance_id)).toMatchObject({ answered: false });
  expect(await progress(request, b)).toEqual(before);
  const bogus = await request.post(`${SUPA}/functions/v1/get-next-question`, {
    headers: { apikey: ANON, authorization: "Bearer not-a-session", ...json },
    data: { subject: "historie", learning_objective: "world_war_2" },
  });
  expect(bogus.status(), "documented legacy status for an invalid session").toBe(500);
  expect(await bogus.json()).toEqual({ error: "Unauthorized" });
});
