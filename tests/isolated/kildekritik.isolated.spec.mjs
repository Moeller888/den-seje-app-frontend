// D-332: the source-criticism sequence's REVIEWED items as real questions on the isolated stack (D-110), under
// a clearly named TEST objective (test_kildekritik_ophav — a fixture, not a product objective; LP-2 decides).
// The rows come from tests/isolated/fixtures/kildekritik-questions.json, generated from the same data as the
// game and the teacher review pack (tools/laerligverse/review-pack.mjs).
//
// What is proven against the real backend (this commit's get-next-question / process-event, PostgreSQL):
//   * targeting the precise objective serves ONLY the reviewed items, and each item's "document backs"
//     (content.option_details, D-332) reach the client — the answer key does not;
//   * the server grades with the reviewed key and registers each attempt (H5, question_attempts);
//   * when the five items are used up the objective is "exhausted" — never a repeat (D-329);
//   * through the real host page, the game receives the backs and no token or key.
// What is NOT proven, and why: the server picks ANY unserved item of the objective, not the item of a given
// learning STEP (practice, revision, transfer …) — step-precise selection needs the step on the server
// (LP-13 / L1 K1). The test asserts exactly that limit.
import { test, expect } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
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
const FIXTURE = JSON.parse(readFileSync(new URL("./fixtures/kildekritik-questions.json", import.meta.url), "utf8"));
const OBJECTIVE = FIXTURE[0].learning_objective;
const byPrompt = new Map(FIXTURE.map((r) => [r.content.question, r]));

test.describe.configure({ mode: "serial" });

let harness;
let K1;
test.beforeAll(async ({ request }) => {
  K1 = await k1InStack(request, SUPA, svc);
  // Idempotent: the fixture rows are inserted once per stack (projects run one after another).
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
  harness = await startHarness({ host: "f3", supabaseUrl: SUPA, anonKey: ANON, objectiveMap: { "hist.besaettelsen.h4": OBJECTIVE }, h5: true });
});
test.afterAll(async () => {
  await harness?.close();
});

async function makePupil(request, label, browserName) {
  const tag = `${label}-${browserName}-${RUN}`.replace(/[^A-Za-z0-9-]/g, "");
  const email = `kk-${tag}@${SYNTHETIC_EMAIL_DOMAIN}`;
  const password = createHash("sha256").update(`isolated-kk:${tag}`).digest("base64url");
  const created = await request.post(`${SUPA}/auth/v1/admin/users`, { headers: svc, data: { email, password, email_confirm: true } });
  expect(created.status()).toBe(200);
  const id = (await created.json()).id;
  const profile = await request.post(`${SUPA}/rest/v1/profiles`, {
    headers: { ...svc, ...json, prefer: "return=minimal" },
    data: { id, role: "student", full_name: `Syntetisk kildekritik-elev ${label}`, selected_grade: 8, active_domains: [OBJECTIVE], equipped_slots: {}, active_theme: "default" },
  });
  expect(profile.status(), await profile.text()).toBe(201);
  const signIn = await request.post(`${SUPA}/auth/v1/token?grant_type=password`, { headers: { apikey: ANON }, data: { email, password } });
  return { id, email, password, token: (await signIn.json()).access_token };
}

const gnq = (request, p) => request.post(`${SUPA}/functions/v1/get-next-question`, { headers: { apikey: ANON, authorization: `Bearer ${p.token}`, ...json }, data: { subject: "historie", learning_objective: OBJECTIVE } });
const answer = (request, p, id, text, roundNo) => request.post(`${SUPA}/functions/v1/process-event`, {
  headers: { apikey: ANON, authorization: `Bearer ${p.token}`, ...json },
  data: { question_instance_id: id, answer: text, question_shown_at: Date.now(), round_no: roundNo, submission_id: randomUUID() },
});
const attempts = async (request, p) => await (await request.get(`${SUPA}/rest/v1/question_attempts?select=question_instance_id,submission_id,attempt_no,grading,was_correct,is_repeat,answered_at,xp_awarded,coins_awarded&student_id=eq.${p.id}&order=created_at`, { headers: svc })).json();

test("the precise objective serves ONLY the reviewed items, with their backs and without their keys; the server grades with the reviewed key and registers every attempt; then 'exhausted', never a repeat", async ({ request }, testInfo) => {
  test.fail(!K1, K1_GAP);
  if (!K1) test.setTimeout(120_000); // the unchanged 30 s assertion must FAIL, not hit the 30 s test timeout
  test.skip(testInfo.project.name !== "chromium", "backend path: once per run");
  const p = await makePupil(request, "http", testInfo.project.name);
  const seen = [];
  for (let i = 0; i < FIXTURE.length + 2; i++) {
    const r = await gnq(request, p);
    expect(r.status(), await r.text()).toBe(200);
    const s = await r.json();
    if (s.step === "no_questions") {
      expect(s).toEqual({ step: "no_questions", reason: "objective_exhausted" });
      break;
    }
    expect(s.learning_objective).toBe(OBJECTIVE);
    const item = byPrompt.get(s.content.question);
    expect(item, "only reviewed items are served for the precise objective").toBeTruthy();
    // The backs come through the DTO in option order; nothing that marks the answer does.
    expect(s.content.options).toEqual(item.content.options);
    expect(s.content.option_details).toEqual(item.content.option_details);
    for (const k of ["correct", "accepted_answers", "review_text"]) expect(k in s.content, k).toBe(false);
    seen.push(item.tag);
    // Alternate right and wrong; the SERVER decides with the reviewed key.
    const right = i % 2 === 0;
    const text = right ? item.content.correct : item.content.options.find((o) => o !== item.content.correct);
    const g = await answer(request, p, s.question_instance_id, text, s.round_no);
    expect(g.status(), await g.text()).toBe(200);
    const body = await g.json();
    expect(body).toMatchObject({ outcome: "recorded", status: right ? "correct" : "incorrect", xp_awarded: right ? 10 : 0 });
    if (!right) expect(body.correct_answer, "the key is revealed only after the answer was recorded").toBe(item.content.correct);
  }
  // Every reviewed item once, in whatever order the server chose (NOT step order — the stated limit).
  expect([...seen].sort()).toEqual(FIXTURE.map((r) => r.tag).sort());
  const rows = await attempts(request, p);
  expect(rows).toHaveLength(FIXTURE.length);
  expect(rows.every((r) => r.is_repeat === false && r.grading === "auto")).toBe(true);
  const [a] = assessObjectives(rows.map((r) => observationFromAttemptRow({ ...r, learning_objective: OBJECTIVE })));
  expect(a.states.practised.status).toBe("observed");
  expect(a.states.independent.status, "server data: mode and hints are not registered (L1 K1)").toBe("unknown");
  expect(a.evidence.every((e) => !e.eligible)).toBe(true);
  expect(a.documentedProgression).toBe(false);
});

test("through the real host page: the game receives the documents' backs for the precise objective, and no token or key; the server grades", async ({ page, request, browserName }) => {
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
  const game = page.frames().find((fr) => fr.url().startsWith(GAME_ORIGIN));
  const received = (await game.evaluate(() => window.__lvReceived())).join("\n");
  const prompt = await f.locator("#prompt").textContent();
  const item = byPrompt.get(prompt ?? "");
  expect(item, "the game shows a reviewed item").toBeTruthy();
  for (const back of item.content.option_details) expect(received, "each back reached the game").toContain(JSON.stringify(back).slice(1, -1));
  for (const secret of ["eyJ", "Bearer", "access_token", "refresh_token", ANON, item.content.review_text]) expect(received).not.toContain(secret);
  // Answer right; the server's verdict reaches the world.
  const opts = await f.locator("#options button").evaluateAll((bs) => bs.map((b) => ({ id: b.dataset.option, label: b.textContent })));
  await f.locator(`#options [data-option="${opts.find((o) => o.label === item.content.correct).id}"]`).click();
  await f.locator("#commit").click();
  await expect(f.locator("body")).toHaveAttribute("data-task", "correct", { timeout: 30_000 });
  await expect(f.locator("body")).toHaveAttribute("data-cabinet", "open");
  expect(await attempts(request, p)).toEqual([expect.objectContaining({ was_correct: true, is_repeat: false, xp_awarded: 10 })]);
});
