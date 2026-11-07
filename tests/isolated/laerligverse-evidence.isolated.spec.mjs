// Lærligverse F4 (D-330): the whole chain on the REAL backend of the isolated stack (D-110), through the real
// F3 host page (laerligverse/host/) with the neutral harness game on its own origin.
//
//   pupil signs in on the host → game asks for objective "hist.besaettelsen.h4" (the WORLD's id) → the HOST
//   maps it to the EXISTING server objective "world_war_2" (D-329 targeting, on in this stack only) →
//   get-next-question serves a world_war_2 question and echoes the objective → the pupil answers →
//   process-event takes the H5 path (round_no + the host's submission_id, D-273) → process_question_attempt_v2
//   grades, pays and REGISTERS the attempt in question_attempts → the world reacts.
//
// Then the generated evidence classifier (laerligverse/host/bridge/evidence.js) is run on the REAL rows:
// what the server registered supports "practised", and NOT "independent" — mode and hints are not registered
// (L1 K1, PR #536). Nothing is mocked; the database is the oracle (service key, this test process only).
import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { assertIsolated, SYNTHETIC_EMAIL_DOMAIN } from "./isolation-guard.mjs";
import { startHarness, HOST_ORIGIN, GAME_ORIGIN } from "./laerligverse-harness/serve-harness.mjs";
import { K1_GAP, k1InStack } from "./k1-probe.mjs";
import { assessObjectives, observationFromAttemptRow } from "../../laerligverse/host/bridge/evidence.js";

assertIsolated(process.env);

const SUPA = process.env.ISOLATED_SUPABASE_URL.replace(/\/+$/, "");
const ANON = process.env.ISOLATED_SUPABASE_ANON_KEY;
const SERVICE = process.env.ISOLATED_SUPABASE_SERVICE_KEY;
const RUN = (process.env.GITHUB_RUN_ID || "local") + "-" + (process.env.GITHUB_RUN_ATTEMPT || "1");
const svc = { apikey: SERVICE, authorization: `Bearer ${SERVICE}` };
const json = { "content-type": "application/json" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

test.describe.configure({ mode: "serial" });

let harness;
let K1;
test.beforeAll(async ({ request }) => {
  K1 = await k1InStack(request, SUPA, { apikey: SERVICE, authorization: `Bearer ${SERVICE}` });
  harness = await startHarness({ host: "f3", supabaseUrl: SUPA, anonKey: ANON, objectiveMap: { "hist.besaettelsen.h4": "world_war_2" }, h5: true });
});
test.afterAll(async () => {
  await harness?.close();
});

async function makePupil(request, label, browserName, domains = ["cold_war", "world_war_2"]) {
  const tag = `${label}-${browserName}-${RUN}`.replace(/[^A-Za-z0-9-]/g, "");
  const email = `lve-${tag}@${SYNTHETIC_EMAIL_DOMAIN}`;
  const password = createHash("sha256").update(`isolated-lve:${tag}`).digest("base64url");
  const created = await request.post(`${SUPA}/auth/v1/admin/users`, { headers: svc, data: { email, password, email_confirm: true } });
  expect(created.status(), "local Auth must create the synthetic pupil").toBe(200);
  const id = (await created.json()).id;
  const profile = await request.post(`${SUPA}/rest/v1/profiles`, {
    headers: { ...svc, ...json, prefer: "return=minimal" },
    data: { id, role: "student", full_name: `Syntetisk F4-elev ${label}`, selected_grade: 8, active_domains: domains, equipped_slots: {}, active_theme: "default" },
  });
  expect(profile.status(), await profile.text()).toBe(201);
  return { id, email, password };
}

const instances = async (request, pupil) =>
  await (await request.get(`${SUPA}/rest/v1/question_instances?select=id,answered,was_correct,correct_answer,repeat_count,questions(learning_objective)&student_id=eq.${pupil.id}&order=created_at`, { headers: svc })).json();
const attempts = async (request, pupil) =>
  await (await request.get(`${SUPA}/rest/v1/question_attempts?select=question_instance_id,submission_id,attempt_no,grading,was_correct,is_repeat,answered_at,xp_awarded,coins_awarded&student_id=eq.${pupil.id}&order=created_at`, { headers: svc })).json();
const progress = async (request, pupil) =>
  (await (await request.get(`${SUPA}/rest/v1/student_progress?select=xp,coins&student_id=eq.${pupil.id}`, { headers: svc })).json())[0] ?? { xp: 0, coins: 0 };

function trackRequests(page) {
  const seen = [];
  page.on("request", (r) => {
    if (r.url().includes("/functions/v1/") && r.method() === "POST") seen.push({ fn: r.url().split("/functions/v1/")[1], body: r.postDataJSON() });
  });
  return seen;
}

async function signIn(page, pupil) {
  await page.goto(`${HOST_ORIGIN}/`);
  await page.locator("#lv-email").fill(pupil.email);
  await page.locator("#lv-password").fill(pupil.password);
  await page.locator("#lv-login-submit").click();
  await expect(page.locator("body")).toHaveAttribute("data-session", "active");
  const f = page.frameLocator("#lv-game");
  await expect(f.locator("body")).toHaveAttribute("data-bridge", "ready", { timeout: 30_000 });
  return f;
}

async function optionId(request, pupil, f, wantCorrect) {
  const key = (await instances(request, pupil)).at(-1).correct_answer;
  const opts = await f.locator("#options button").evaluateAll((bs) => bs.map((b) => ({ id: b.dataset.option, label: b.textContent })));
  const hit = opts.find((o) => (o.label === key) === wantCorrect);
  expect(hit).toBeTruthy();
  return hit.id;
}

/** The server rows → the evidence classifier (the generated host module), per objective. */
async function classify(request, pupil) {
  const objectiveOf = new Map((await instances(request, pupil)).map((i) => [i.id, i.questions?.learning_objective]));
  const rows = await attempts(request, pupil);
  return assessObjectives(rows.map((r) => observationFromAttemptRow({ ...r, learning_objective: objectiveOf.get(r.question_instance_id) })));
}

test("F4 CHAIN: the host maps the world's objective, the server targets it, H5 registers the attempt with the host's submission id; the classifier keeps 'correct' apart from 'learned'", async ({ page, request, browserName }) => {
  test.fail(!K1, K1_GAP);
  if (!K1) test.setTimeout(120_000); // the unchanged 30 s assertion must FAIL, not hit the 30 s test timeout
  const pupil = await makePupil(request, "chain", browserName);
  const calls = trackRequests(page);
  const before = await progress(request, pupil);
  const f = await signIn(page, pupil);
  await f.locator("#use-cabinet").click();
  await expect(f.locator("body")).toHaveAttribute("data-task", "open", { timeout: 30_000 });
  // The host sent the EXISTING server objective, never the world's prototype id.
  expect(calls[0]).toEqual({ fn: "get-next-question", body: { subject: "historie", learning_objective: "world_war_2" } });
  const [inst] = await instances(request, pupil);
  expect(inst.questions.learning_objective, "the served question is in the objective (database)").toBe("world_war_2");
  await f.locator(`#options [data-option="${await optionId(request, pupil, f, true)}"]`).click();
  await f.locator("#commit").evaluate((b) => { b.click(); b.click(); b.click(); });
  await expect(f.locator("body")).toHaveAttribute("data-task", "correct", { timeout: 30_000 });
  await expect(f.locator("body")).toHaveAttribute("data-cabinet", "open");
  // H5: exactly one registered attempt, with the host's own submission id and round.
  const pe = calls.filter((c) => c.fn === "process-event");
  expect(pe).toHaveLength(1);
  expect(pe[0].body).toMatchObject({ round_no: 1 });
  expect(pe[0].body.submission_id).toMatch(UUID);
  const rows = await attempts(request, pupil);
  expect(rows).toEqual([expect.objectContaining({ question_instance_id: inst.id, submission_id: pe[0].body.submission_id, attempt_no: 1, grading: "auto", was_correct: true, is_repeat: false, xp_awarded: 10, coins_awarded: 5 })]);
  expect(await progress(request, pupil)).toEqual({ xp: before.xp + 10, coins: before.coins + 5 });
  // Observation vs interpretation, on the REAL rows.
  const [a] = await classify(request, pupil);
  expect(a.objective).toBe("world_war_2");
  expect(a.sources).toEqual(["server"]);
  expect(a.states.practised.status).toBe("observed");
  expect(a.states.independent.status, "a correct answer is not independent performance without registered mode and hints").toBe("unknown");
  expect(a.evidence.map((e) => e.eligible)).toEqual([false]);
  expect(a.documentedProgression).toBe(false);
  // Still: the game never received a token.
  const received = (await page.frames().find((fr) => fr.url().startsWith(GAME_ORIGIN)).evaluate(() => window.__lvReceived())).join("\n");
  for (const secret of ["eyJ", "Bearer", "access_token", "refresh_token", ANON, inst.id]) expect(received).not.toContain(secret);
});

test("a wrong answer is registered as an attempt that pays nothing; a REPEAT round is a new attempt (is_repeat, 2 XP/1 coin) with a new submission id", async ({ page, request, browserName }) => {
  test.fail(!K1, K1_GAP);
  if (!K1) test.setTimeout(120_000); // the unchanged 30 s assertion must FAIL, not hit the 30 s test timeout
  const pupil = await makePupil(request, "repeat", browserName);
  const f = await signIn(page, pupil);
  await f.locator("#use-cabinet").click();
  await expect(f.locator("body")).toHaveAttribute("data-task", "open", { timeout: 30_000 });
  await f.locator(`#options [data-option="${await optionId(request, pupil, f, false)}"]`).click();
  await f.locator("#commit").click();
  await expect(f.locator("body")).toHaveAttribute("data-task", "incorrect", { timeout: 30_000 });
  const first = await attempts(request, pupil);
  expect(first).toEqual([expect.objectContaining({ attempt_no: 1, was_correct: false, is_repeat: false, xp_awarded: 0, coins_awarded: 0 })]);
  const afterWrong = await progress(request, pupil);
  // Reopen as the repeat functions do, then the next request serves round 2 of the SAME instance.
  const [inst] = await instances(request, pupil);
  const reopen = await request.patch(`${SUPA}/rest/v1/question_instances?id=eq.${inst.id}`, { headers: { ...svc, ...json, prefer: "return=minimal" }, data: { answered: false, repeat_count: 1, user_answer: null } });
  expect(reopen.status(), await reopen.text()).toBe(204);
  await page.evaluate(() => { const fr = document.getElementById("lv-game"); fr.src = `${fr.src.split("?")[0]}?reload=f4`; });
  await expect(f.locator("body")).toHaveAttribute("data-task", "none", { timeout: 30_000 });
  await expect(f.locator("body")).toHaveAttribute("data-bridge", "ready", { timeout: 30_000 });
  await f.locator("#use-cabinet").click();
  await expect(f.locator("body")).toHaveAttribute("data-task", "open", { timeout: 30_000 });
  await f.locator(`#options [data-option="${await optionId(request, pupil, f, true)}"]`).click();
  await f.locator("#commit").click();
  await expect(f.locator("body")).toHaveAttribute("data-task", "correct", { timeout: 30_000 });
  const rows = await attempts(request, pupil);
  expect(rows).toHaveLength(2);
  expect(rows[1]).toMatchObject({ question_instance_id: inst.id, is_repeat: true, was_correct: true, xp_awarded: 2, coins_awarded: 1 });
  expect(rows[1].submission_id).not.toBe(rows[0].submission_id);
  const after = await progress(request, pupil);
  expect({ xp: after.xp - afterWrong.xp, coins: after.coins - afterWrong.coins }).toEqual({ xp: 2, coins: 1 });
  // A wrong first try and a right repeat: still no independent performance, no evidence, no progression.
  const [a] = await classify(request, pupil);
  expect(a.states.practised.basis).toHaveLength(2);
  expect(a.evidence.every((e) => !e.eligible)).toBe(true);
  expect(a.documentedProgression).toBe(false);
});

test("refusals reach the game as errors and create nothing: objective outside the pupil's domains (403), open question in another objective (409)", async ({ page, request, browserName }) => {
  // 403: world_war_2 is not among this pupil's domains.
  const outside = await makePupil(request, "outside", browserName, ["cold_war"]);
  const f1 = await signIn(page, outside);
  await f1.locator("#use-cabinet").click();
  await expect(f1.locator("body")).toHaveAttribute("data-task", "error", { timeout: 30_000 });
  expect(await instances(request, outside)).toEqual([]);
  await expect(page.locator("body")).toHaveAttribute("data-last-service-error", "forbidden");
  await page.locator("#lv-logout").click();

  // 409: an open cold_war question (served to the pupil through the normal, untargeted path for cold_war only).
  const busy = await makePupil(request, "busy", browserName);
  const tokenRes = await request.post(`${SUPA}/auth/v1/token?grant_type=password`, { headers: { apikey: ANON }, data: { email: busy.email, password: busy.password } });
  const token = (await tokenRes.json()).access_token;
  const served = await request.post(`${SUPA}/functions/v1/get-next-question`, { headers: { apikey: ANON, authorization: `Bearer ${token}`, ...json }, data: { subject: "historie", learning_objective: "cold_war" } });
  expect(served.status()).toBe(200);
  const before = await instances(request, busy);
  expect(before).toHaveLength(1);
  const f2 = await signIn(page, busy);
  await f2.locator("#use-cabinet").click();
  await expect(f2.locator("body")).toHaveAttribute("data-task", "error", { timeout: 30_000 });
  await expect(page.locator("body")).toHaveAttribute("data-last-service-error", "unavailable");
  expect(await instances(request, busy), "the open cold_war question is untouched").toEqual(before);
  expect(await attempts(request, busy)).toEqual([]);
});
