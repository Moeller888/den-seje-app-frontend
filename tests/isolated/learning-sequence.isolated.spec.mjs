// D-338: the SERVER-DIRECTED learning sequence on the REAL backend of the isolated stack (D-110).
// The workflow serves the functions with LAERLIGVERSE_OBJECTIVE_TARGETING=on and LAERLIGVERSE_SEQUENCE=on (off
// everywhere else). The items are the reviewed source-criticism items (fixtures/kildekritik-questions.json),
// each tagged with its learning step, under the TEST objective test_kildekritik_ophav.
//
// Proven here, with the database as the oracle: the server derives the step from the pupil's own history and
// serves only that step's item; a client cannot choose a later step; the step survives a new login (state is
// the server's history, not the browser's); two tabs and replays do not advance it twice; the revisit waits
// until it is due. The time shift for the revisit is a TEST MANIPULATION of answered_at (labelled below) —
// never evidence of retention. Transitions are the provisional test policy (LP-13 decides the real ones).
import { test, expect } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { assertIsolated, SYNTHETIC_EMAIL_DOMAIN } from "./isolation-guard.mjs";
import { startHarness, HOST_ORIGIN, GAME_ORIGIN } from "./laerligverse-harness/serve-harness.mjs";
import { K1_GAP, k1InStack } from "./k1-probe.mjs";

assertIsolated(process.env);

const SUPA = process.env.ISOLATED_SUPABASE_URL.replace(/\/+$/, "");
const ANON = process.env.ISOLATED_SUPABASE_ANON_KEY;
const SERVICE = process.env.ISOLATED_SUPABASE_SERVICE_KEY;
const RUN = (process.env.GITHUB_RUN_ID || "local") + "-" + (process.env.GITHUB_RUN_ATTEMPT || "1");
const svc = { apikey: SERVICE, authorization: `Bearer ${SERVICE}` };
const json = { "content-type": "application/json" };
const FIXTURE = JSON.parse(readFileSync(new URL("./fixtures/kildekritik-questions.json", import.meta.url), "utf8"));
const OBJECTIVE = FIXTURE[0].learning_objective;
const ITEM = Object.fromEntries(FIXTURE.map((r) => [r.learning_step, r]));
const CONTEXT_OF_STEP = Object.fromEntries(FIXTURE.map((r) => [r.learning_step, r.step]));

test.describe.configure({ mode: "serial" });

let harness;
let K1;
test.beforeAll(async ({ request }) => {
  K1 = await k1InStack(request, SUPA, svc);
  const have = await (await request.get(`${SUPA}/rest/v1/questions?select=id&learning_objective=eq.${OBJECTIVE}`, { headers: svc })).json();
  if (have.length === 0) {
    const rows = FIXTURE.map((r) => ({
      type: "mc_single", content: r.content, difficulty: 500, is_active: true, question_type: "auto",
      learning_objective: r.learning_objective, answer_format: "mc", answer_type: "short",
      metadata: { domain: r.learning_objective, concepts: ["kildekritik"], cognitive_skill: "analysis", synthetic: true, fixture: "D-332", learning_step: r.learning_step },
      target_grade: 8, difficulty_band: 3,
    }));
    const ins = await request.post(`${SUPA}/rest/v1/questions`, { headers: { ...svc, ...json, prefer: "return=minimal" }, data: rows });
    expect(ins.status(), await ins.text()).toBe(201);
  }
  harness = await startHarness({
    host: "f3", supabaseUrl: SUPA, anonKey: ANON, objectiveMap: { "hist.besaettelsen.h4": OBJECTIVE }, h5: true,
    sequence: true, stepContexts: CONTEXT_OF_STEP,
  });
});
test.afterAll(async () => {
  await harness?.close();
});

async function makePupil(request, label, browserName) {
  const tag = `${label}-${browserName}-${RUN}`.replace(/[^A-Za-z0-9-]/g, "");
  const email = `seq-${tag}@${SYNTHETIC_EMAIL_DOMAIN}`;
  const password = createHash("sha256").update(`isolated-seq:${tag}`).digest("base64url");
  const created = await request.post(`${SUPA}/auth/v1/admin/users`, { headers: svc, data: { email, password, email_confirm: true } });
  expect(created.status()).toBe(200);
  const id = (await created.json()).id;
  const profile = await request.post(`${SUPA}/rest/v1/profiles`, {
    headers: { ...svc, ...json, prefer: "return=minimal" },
    data: { id, role: "student", full_name: `Syntetisk sekvenselev ${label}`, selected_grade: 8, active_domains: [OBJECTIVE], equipped_slots: {}, active_theme: "default" },
  });
  expect(profile.status(), await profile.text()).toBe(201);
  return { id, email, password, token: await signIn(request, email, password) };
}
async function signIn(request, email, password) {
  const r = await request.post(`${SUPA}/auth/v1/token?grant_type=password`, { headers: { apikey: ANON }, data: { email, password } });
  expect(r.status()).toBe(200);
  return (await r.json()).access_token;
}

const next = (request, p, extra = {}) => request.post(`${SUPA}/functions/v1/get-next-question`, {
  headers: { apikey: ANON, authorization: `Bearer ${p.token}`, ...json },
  data: { subject: "historie", learning_objective: OBJECTIVE, sequence: true, ...extra },
});
const answer = (request, p, served, text, submissionId = randomUUID()) => request.post(`${SUPA}/functions/v1/process-event`, {
  headers: { apikey: ANON, authorization: `Bearer ${p.token}`, ...json },
  data: { question_instance_id: served.question_instance_id, answer: text, question_shown_at: Date.now(), round_no: served.round_no, submission_id: submissionId },
});
const attempts = async (request, p) => await (await request.get(`${SUPA}/rest/v1/question_attempts?select=question_instance_id,submission_id,was_correct,xp_awarded&student_id=eq.${p.id}&order=created_at`, { headers: svc })).json();
const progress = async (request, p) => (await (await request.get(`${SUPA}/rest/v1/student_progress?select=xp,coins&student_id=eq.${p.id}`, { headers: svc })).json())[0] ?? { xp: 0, coins: 0 };
const wrongOf = (step) => ITEM[step].content.options.find((o) => o !== ITEM[step].content.correct);

/** Serve the next item, check it is the expected step's reviewed item, answer it right or wrong. */
async function step(request, p, expected, right) {
  const r = await next(request, p);
  expect(r.status(), await r.text()).toBe(200);
  const s = await r.json();
  expect(s, `expected step ${expected}`).toMatchObject({ learning_objective: OBJECTIVE, learning_step: expected, mode: { guided_practice: "practice", revision: "practice", independent_application: "check", transfer: "application", revisit: "review" }[expected] });
  expect(s.content.question).toBe(ITEM[expected].content.question);
  const g = await answer(request, p, s, right ? ITEM[expected].content.correct : wrongOf(expected));
  expect(g.status(), await g.text()).toBe(200);
  expect(await g.json()).toMatchObject({ outcome: "recorded", status: right ? "correct" : "incorrect" });
  return s;
}

test.describe("server-directed sequence over HTTP (chromium: backend path once per run)", () => {
  test.beforeEach(({}, testInfo) => test.skip(testInfo.project.name !== "chromium", "backend path: once per run"));

  test("pupil A + E: a new pupil starts at guided practice; asking for a later or unknown step is refused and creates nothing", async ({ request }, testInfo) => {
    const p = await makePupil(request, "a", testInfo.project.name);
    for (const [learning_step, status, error] of [["transfer", 409, "learning_step_not_current"], ["revisit", 409, "learning_step_not_current"], ["mastery", 400, "invalid_learning_step"]]) {
      const r = await next(request, p, { learning_step });
      expect(r.status(), learning_step).toBe(status);
      expect(await r.json()).toEqual({ error });
    }
    expect(await (await request.get(`${SUPA}/rest/v1/question_instances?select=id&student_id=eq.${p.id}`, { headers: svc })).json()).toEqual([]);
    const s = await (await next(request, p, { learning_step: "guided_practice" })).json();
    expect(s).toMatchObject({ learning_step: "guided_practice", mode: "practice" });
  });

  test("pupil B: wrong practice → revision → (wrong again) → application → transfer; then the revisit WAITS", async ({ request }, testInfo) => {
    test.fail(!K1, K1_GAP);
    if (!K1) test.setTimeout(120_000); // the unchanged 30 s assertion must FAIL, not hit the 30 s test timeout
    const p = await makePupil(request, "b", testInfo.project.name);
    await step(request, p, "guided_practice", false);
    await step(request, p, "revision", false);
    await step(request, p, "independent_application", true);
    await step(request, p, "transfer", true);
    const w = await (await next(request, p)).json();
    expect(w).toMatchObject({ step: "sequence_waiting", learning_objective: OBJECTIVE, learning_step: "revisit" });
    expect(Date.parse(w.due_at)).toBeGreaterThan(Date.now() + 19 * 3_600_000);
    expect((await attempts(request, p)).map((a) => a.was_correct)).toEqual([false, false, true, true]);
  });

  test("pupil C: right practice → NO revision → application; rewards come from the server only", async ({ request }, testInfo) => {
    test.fail(!K1, K1_GAP);
    if (!K1) test.setTimeout(120_000); // the unchanged 30 s assertion must FAIL, not hit the 30 s test timeout
    const p = await makePupil(request, "c", testInfo.project.name);
    const before = await progress(request, p);
    await step(request, p, "guided_practice", true);
    await step(request, p, "independent_application", true);
    expect(await progress(request, p)).toEqual({ xp: before.xp + 20, coins: before.coins + 10 });
  });

  test("pupil D: the step survives a NEW login (another token, as on another device); an open round resumes, not duplicated", async ({ request }, testInfo) => {
    test.fail(!K1, K1_GAP);
    if (!K1) test.setTimeout(120_000); // the unchanged 30 s assertion must FAIL, not hit the 30 s test timeout
    const p = await makePupil(request, "d", testInfo.project.name);
    await step(request, p, "guided_practice", false);
    const open = await (await next(request, p)).json();
    expect(open.learning_step).toBe("revision");
    // "Log out and back in": a fresh session for the same pupil. The state is the server's history.
    p.token = await signIn(request, p.email, p.password);
    const resumed = await (await next(request, p)).json();
    expect(resumed).toMatchObject({ learning_step: "revision", question_instance_id: open.question_instance_id });
  });

  test("two tabs + replay: concurrent 'next' gives ONE instance; two submissions of the same round record ONE attempt; a replay changes nothing", async ({ request }, testInfo) => {
    test.fail(!K1, K1_GAP);
    if (!K1) test.setTimeout(120_000); // the unchanged 30 s assertion must FAIL, not hit the 30 s test timeout
    const p = await makePupil(request, "tabs", testInfo.project.name);
    const rs = await Promise.all([next(request, p), next(request, p)]);
    const ids = new Set();
    for (const r of rs) {
      const b = await r.json();
      if (r.status() === 200) ids.add(b.question_instance_id);
      else expect(b).toEqual({ error: "open_question_exists" });
    }
    expect(ids.size).toBe(1);
    const s = await (await next(request, p)).json();
    const sub = randomUUID();
    const [a1, a2] = await Promise.all([answer(request, p, s, ITEM.guided_practice.content.correct, sub), answer(request, p, s, ITEM.guided_practice.content.correct)]);
    const outcomes = [await a1.json(), await a2.json()].map((b) => b.outcome ?? b.error);
    expect(outcomes.filter((o) => o === "recorded")).toHaveLength(1);
    const xp = (await progress(request, p)).xp;
    // The same submission again (e.g. a retry after the response was lost): the frozen result, no new effect.
    const replay = await (await answer(request, p, s, ITEM.guided_practice.content.correct, sub)).json();
    expect(["replay", "Round already closed"]).toContain(replay.outcome ?? replay.error);
    expect((await attempts(request, p)).length).toBe(1);
    expect((await progress(request, p)).xp).toBe(xp);
    // The step advanced exactly once.
    expect((await (await next(request, p)).json()).learning_step).toBe("independent_application");
  });

  test("the revisit opens only when due (TEST MANIPULATION of answered_at, labelled), then the sequence completes", async ({ request }, testInfo) => {
    test.fail(!K1, K1_GAP);
    if (!K1) test.setTimeout(120_000); // the unchanged 30 s assertion must FAIL, not hit the 30 s test timeout
    const p = await makePupil(request, "revisit", testInfo.project.name);
    await step(request, p, "guided_practice", true);
    await step(request, p, "independent_application", true);
    const t = await step(request, p, "transfer", true);
    expect((await (await next(request, p)).json()).step).toBe("sequence_waiting");
    // SIMULATION, not retention: move the transfer answer 21 h into the past in the isolated database.
    const back = await request.patch(`${SUPA}/rest/v1/question_instances?id=eq.${t.question_instance_id}`, {
      headers: { ...svc, ...json, prefer: "return=minimal" }, data: { answered_at: new Date(Date.now() - 21 * 3_600_000).toISOString() },
    });
    expect(back.status(), await back.text()).toBe(204);
    await step(request, p, "revisit", true);
    expect(await (await next(request, p)).json()).toMatchObject({ step: "sequence_complete", learning_objective: OBJECTIVE });
  });

  test("D-341 characterization: WITHOUT K1 in the stack an H5 submission fails safely — 500, no attempt, no reward, the round stays open", async ({ request }, testInfo) => {
    test.skip(K1, "K1 is in the isolated stack: the gap is closed, the ordinary H5 tests prove the path");
    const p = await makePupil(request, "k1gap", testInfo.project.name);
    const before = await progress(request, p);
    const s = await (await next(request, p)).json();
    expect(s).toMatchObject({ learning_step: "guided_practice" });
    const r = await answer(request, p, s, ITEM.guided_practice.content.correct);
    expect(r.status()).toBe(500);
    expect(await r.json()).toEqual({ error: "Could not process answer" });
    expect(await attempts(request, p)).toEqual([]);
    expect(await progress(request, p)).toEqual(before);
    const inst = await (await request.get(`${SUPA}/rest/v1/question_instances?select=answered&id=eq.${s.question_instance_id}`, { headers: svc })).json();
    expect(inst).toEqual([{ answered: false }]);
    // Not stuck: the same open round is resumed, not duplicated.
    expect(await (await next(request, p)).json()).toMatchObject({ learning_step: "guided_practice", question_instance_id: s.question_instance_id });
  });

  test("off path: without `sequence` the same objective is served untagged-aware but WITHOUT a step (today's targeting)", async ({ request }, testInfo) => {
    const p = await makePupil(request, "off", testInfo.project.name);
    const r = await request.post(`${SUPA}/functions/v1/get-next-question`, { headers: { apikey: ANON, authorization: `Bearer ${p.token}`, ...json }, data: { subject: "historie", learning_objective: OBJECTIVE } });
    const s = await r.json();
    expect(s.learning_objective).toBe(OBJECTIVE);
    expect("learning_step" in s).toBe(false);
    expect("mode" in s).toBe(false);
  });
});

test("through the real host page: the server's step decides the world's activity — a wrong practice answer makes the NEXT activity a revision", async ({ page, request, browserName }) => {
  test.fail(!K1, K1_GAP);
  if (!K1) test.setTimeout(120_000); // the unchanged 30 s assertion must FAIL, not hit the 30 s test timeout
  const p = await makePupil(request, "host", browserName);
  await page.goto(`${HOST_ORIGIN}/`);
  await page.locator("#lv-email").fill(p.email);
  await page.locator("#lv-password").fill(p.password);
  await page.locator("#lv-login-submit").click();
  await expect(page.locator("body")).toHaveAttribute("data-session", "active");
  const f = page.frameLocator("#lv-game");
  await expect(f.locator("body")).toHaveAttribute("data-bridge", "ready", { timeout: 30_000 });
  await f.locator("#use-cabinet").click();
  await expect(f.locator("body")).toHaveAttribute("data-task", "open", { timeout: 30_000 });
  await expect(f.locator("#prompt")).toHaveText(ITEM.guided_practice.content.question);
  const opts = await f.locator("#options button").evaluateAll((bs) => bs.map((b) => ({ id: b.dataset.option, label: b.textContent })));
  await f.locator(`#options [data-option="${opts.find((o) => o.label === wrongOf("guided_practice")).id}"]`).click();
  await f.locator("#commit").click();
  await expect(f.locator("body")).toHaveAttribute("data-task", "incorrect", { timeout: 30_000 });
  // The world asks again with ITS context ("arkivskab"); the SERVER answers with the revision.
  await page.evaluate(() => { const fr = document.getElementById("lv-game"); fr.src = `${fr.src.split("?")[0]}?reload=seq`; });
  await expect(f.locator("body")).toHaveAttribute("data-task", "none", { timeout: 30_000 });
  await expect(f.locator("body")).toHaveAttribute("data-bridge", "ready", { timeout: 30_000 });
  await f.locator("#use-cabinet").click();
  await expect(f.locator("body")).toHaveAttribute("data-task", "open", { timeout: 30_000 });
  await expect(f.locator("#prompt")).toHaveText(ITEM.revision.content.question);
  const received = (await page.frames().find((fr) => fr.url().startsWith(GAME_ORIGIN)).evaluate(() => window.__lvReceived())).join("\n");
  expect(received).toContain(`"contextKey":"${CONTEXT_OF_STEP.revision}"`);
  expect(received).toContain('"mode":"practice"');
  for (const secret of ["eyJ", "Bearer", "access_token", ANON]) expect(received).not.toContain(secret);
});
