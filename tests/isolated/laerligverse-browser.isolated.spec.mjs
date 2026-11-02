// Lærligverse (D-315): THE WHOLE CHAIN in a real browser, on the isolated stack (D-110).
//
//   pupil clicks in the game (iframe, origin :4331, adventure-engine core + Arkivskabet scene)
//   → bridge/2 (postMessage, origin + window + nonce checked)
//   → test host page (origin :4330, the pupil's session, LaerligTaskService — the REAL adapter)
//   → this commit's Edge Functions get-next-question / process-event (local Edge Runtime)
//   → process_question_attempt in the local PostgreSQL (graded, recorded, rewarded)
//   → verdict back through the bridge → the engine's own graph changes the world (cabinet variant).
//
// Nothing in this chain is mocked. The pupils are synthetic (@e2e.invalid); the database is the oracle,
// read with the local service key by THIS test process only — never in the browser. The host and game
// pages are test-only (tests/isolated/laerligverse-harness/), served without a build step and never
// part of the deploy bundle. The question is a random synthetic question from the pupil's subject:
// a TECHNICAL integration demonstration, not Arkivskabet's didactic task (D-310/D-311).
import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { assertIsolated, SYNTHETIC_EMAIL_DOMAIN } from "./isolation-guard.mjs";
import { startHarness, HOST_ORIGIN, GAME_ORIGIN } from "./laerligverse-harness/serve-harness.mjs";

assertIsolated(process.env);

const SUPA = process.env.ISOLATED_SUPABASE_URL.replace(/\/+$/, "");
const ANON = process.env.ISOLATED_SUPABASE_ANON_KEY;
const SERVICE = process.env.ISOLATED_SUPABASE_SERVICE_KEY;
const RUN = (process.env.GITHUB_RUN_ID || "local") + "-" + (process.env.GITHUB_RUN_ATTEMPT || "1");
const svc = { apikey: SERVICE, authorization: `Bearer ${SERVICE}` };

test.describe.configure({ mode: "serial" });

let harness;
test.beforeAll(async () => {
  harness = await startHarness();
});
test.afterAll(async () => {
  await harness?.close();
});

/** A fresh synthetic pupil per test and browser: grade 8, teacher domain cold_war (multiple choice only in the seed). */
async function makePupil(request, label, browserName) {
  const tag = `${label}-${browserName}-${RUN}`.replace(/[^A-Za-z0-9-]/g, "");
  const email = `lvb-${tag}@${SYNTHETIC_EMAIL_DOMAIN}`;
  const password = createHash("sha256").update(`isolated-lvb:${tag}`).digest("base64url");
  const created = await request.post(`${SUPA}/auth/v1/admin/users`, { headers: svc, data: { email, password, email_confirm: true } });
  expect(created.status(), "local Auth must create the synthetic pupil").toBe(200);
  const id = (await created.json()).id;
  const profile = await request.post(`${SUPA}/rest/v1/profiles`, {
    headers: { ...svc, "content-type": "application/json", prefer: "return=minimal" },
    data: { id, role: "student", full_name: `Syntetisk browserelev ${label}`, selected_grade: 8, active_domains: ["cold_war"], equipped_slots: {}, active_theme: "default" },
  });
  expect(profile.status(), await profile.text()).toBe(201);
  const signIn = await request.post(`${SUPA}/auth/v1/token?grant_type=password`, { headers: { apikey: ANON }, data: { email, password } });
  expect(signIn.status()).toBe(200);
  return { id, token: (await signIn.json()).access_token };
}

// ── Database oracle (service key; this test process only) ────────────────────────────────────────
const progress = async (request, pupil) =>
  (await (await request.get(`${SUPA}/rest/v1/student_progress?select=xp,coins,correct_answers&student_id=eq.${pupil.id}`, { headers: svc })).json())[0] ?? { xp: 0, coins: 0, correct_answers: 0 };
const instances = async (request, pupil) =>
  await (await request.get(`${SUPA}/rest/v1/question_instances?select=id,answered,was_correct,user_answer,correct_answer,question_id&student_id=eq.${pupil.id}&order=created_at`, { headers: svc })).json();
const questionOf = async (request, id) =>
  (await (await request.get(`${SUPA}/rest/v1/questions?select=content,learning_objective,target_grade&id=eq.${id}`, { headers: svc })).json())[0];

/** Open the test host as the pupil (session handed in memory, never via URL or storage) and use the cabinet. */
async function openTask(page, pupil) {
  await page.goto(`${HOST_ORIGIN}/host.html`);
  await page.evaluate((s) => window.__lvStart(s), { supabaseUrl: SUPA, anonKey: ANON, accessToken: pupil.token });
  const f = page.frameLocator("#game");
  await expect(f.locator("body")).toHaveAttribute("data-bridge", "ready", { timeout: 30_000 });
  await f.locator("#use-cabinet").click();
  await expect(f.locator("body")).toHaveAttribute("data-task", "open", { timeout: 30_000 });
  return f;
}

/** The option the pupil clicks — the right or a wrong one, looked up in the database (test oracle). */
async function optionId(request, pupil, f, wantCorrect) {
  const key = (await instances(request, pupil)).at(-1).correct_answer;
  const opts = await f.locator("#options button").evaluateAll((bs) => bs.map((b) => ({ id: b.dataset.option, label: b.textContent })));
  const hit = opts.find((o) => (o.label === key) === wantCorrect);
  expect(hit, "the served options contain the key exactly once").toBeTruthy();
  return hit.id;
}

const processEventCalls = (page) => page.locator('#calls li[data-fn="process-event"]').evaluateAll((l) => l.map((x) => `${x.dataset.sent}:${x.dataset.status ?? "-"}`));
const lines = (f) => f.locator("#lines li").evaluateAll((l) => l.map((x) => x.dataset.key));

test("CHAIN: a correct click in the game is graded by process-event, recorded and paid once in PostgreSQL, and opens the cabinet", async ({ page, request, browserName }) => {
  const pupil = await makePupil(request, "correct", browserName);
  const before = await progress(request, pupil);
  const f = await openTask(page, pupil);
  // 7. A real question from the backend, in the pupil's scope.
  const rows = await instances(request, pupil);
  expect(rows).toHaveLength(1);
  const q = await questionOf(request, rows[0].question_id);
  expect(q.learning_objective).toBe("cold_war");
  expect(q.target_grade).toBeLessThanOrEqual(8);
  await expect(f.locator("#prompt")).toHaveText(q.content.question);
  // Nothing the game shows before grading names the instance, the key as a key, or the review text.
  const gameText = await f.locator("body").evaluate((b) => b.outerHTML);
  for (const secret of [rows[0].id, rows[0].question_id, q.content.review_text]) expect(gameText).not.toContain(secret);
  await expect(f.locator("body")).toHaveAttribute("data-cabinet", "default");
  // 9. The pupil acts; 10–11. the bridge and process-event.
  await f.locator(`#options [data-option="${await optionId(request, pupil, f, true)}"]`).click();
  await f.locator("#commit").click();
  await expect(f.locator("body")).toHaveAttribute("data-task", "correct", { timeout: 30_000 });
  // 12–13. PostgreSQL: recorded once, the authoritative reward (first correct answer: 10 XP, 5 coins).
  expect(await instances(request, pupil)).toMatchObject([{ answered: true, was_correct: true }]);
  expect(await progress(request, pupil)).toEqual({ xp: before.xp + 10, coins: before.coins + 5, correct_answers: before.correct_answers + 1 });
  expect(await processEventCalls(page)).toEqual(["true:200"]);
  // 14–15. The verdict came back and the engine's own graph changed the world.
  await expect(f.locator("body")).toHaveAttribute("data-cabinet", "open");
  await expect(f.locator("body")).toHaveAttribute("data-cabinet-open", "true");
  await expect.poll(() => lines(f)).toEqual(["line.intro", "line.cabinet_locked", "line.unlocked"]);
});

test("a wrong click is graded incorrect, pays nothing, and the cabinet stays locked", async ({ page, request, browserName }) => {
  const pupil = await makePupil(request, "wrong", browserName);
  const before = await progress(request, pupil);
  const f = await openTask(page, pupil);
  await f.locator(`#options [data-option="${await optionId(request, pupil, f, false)}"]`).click();
  await f.locator("#commit").click();
  await expect(f.locator("body")).toHaveAttribute("data-task", "incorrect", { timeout: 30_000 });
  expect(await instances(request, pupil)).toMatchObject([{ answered: true, was_correct: false }]);
  expect(await progress(request, pupil)).toEqual(before);
  await expect(f.locator("body")).toHaveAttribute("data-cabinet", "default");
  await expect.poll(() => lines(f)).toContain("line.still_locked");
});

test("double click and a second simultaneous commit: ONE process-event call, ONE reward, ONE world reaction", async ({ page, request, browserName }) => {
  const pupil = await makePupil(request, "double", browserName);
  const before = await progress(request, pupil);
  const f = await openTask(page, pupil);
  await f.locator(`#options [data-option="${await optionId(request, pupil, f, true)}"]`).click();
  await f.locator("#commit").evaluate((b) => { b.click(); b.click(); b.click(); });
  await f.locator("#commit").dblclick().catch(() => undefined);
  await expect(f.locator("body")).toHaveAttribute("data-cabinet", "open", { timeout: 30_000 });
  expect(await processEventCalls(page)).toEqual(["true:200"]);
  expect(await progress(request, pupil)).toEqual({ xp: before.xp + 10, coins: before.coins + 5, correct_answers: before.correct_answers + 1 });
  await expect.poll(() => lines(f)).toContain("line.unlocked");
  expect((await lines(f)).filter((k) => k === "line.unlocked")).toHaveLength(1);
});

test("reload before the commit: the new iframe resumes the SAME server instance; no second instance", async ({ page, request, browserName }) => {
  const pupil = await makePupil(request, "reload", browserName);
  const f = await openTask(page, pupil);
  const prompt = await f.locator("#prompt").textContent();
  await page.evaluate(() => window.__lvReloadGame());
  await expect(f.locator("body")).toHaveAttribute("data-resumed", "true", { timeout: 30_000 });
  await expect(f.locator("#prompt")).toHaveText(prompt ?? "");
  expect(await instances(request, pupil)).toHaveLength(1);
  await f.locator(`#options [data-option="${await optionId(request, pupil, f, true)}"]`).click();
  await f.locator("#commit").click();
  await expect(f.locator("body")).toHaveAttribute("data-task", "correct", { timeout: 30_000 });
  expect(await instances(request, pupil)).toMatchObject([{ answered: true, was_correct: true }]);
});

test("network lost BEFORE the request: the host retries, the server records once", async ({ page, request, browserName }) => {
  const pupil = await makePupil(request, "netbefore", browserName);
  const before = await progress(request, pupil);
  const f = await openTask(page, pupil);
  await page.evaluate(() => window.__lvFault("before"));
  await f.locator(`#options [data-option="${await optionId(request, pupil, f, true)}"]`).click();
  await f.locator("#commit").click();
  await expect(f.locator("body")).toHaveAttribute("data-task", "correct", { timeout: 30_000 });
  expect(await processEventCalls(page)).toEqual(["false:-", "true:200"]);
  expect(await progress(request, pupil)).toEqual({ xp: before.xp + 10, coins: before.coins + 5, correct_answers: before.correct_answers + 1 });
  await expect(f.locator("body")).toHaveAttribute("data-cabinet", "open");
});

test("response lost AFTER the server recorded the answer: the retry returns the ORIGINAL verdict; recorded and paid once", async ({ page, request, browserName }) => {
  const pupil = await makePupil(request, "netafter", browserName);
  const before = await progress(request, pupil);
  const f = await openTask(page, pupil);
  await page.evaluate(() => window.__lvFault("after"));
  await f.locator(`#options [data-option="${await optionId(request, pupil, f, true)}"]`).click();
  await f.locator("#commit").click();
  await expect(f.locator("body")).toHaveAttribute("data-task", "correct", { timeout: 30_000 });
  // Two requests reached the server; the database (answered=true after the first) made the second a read.
  expect(await processEventCalls(page)).toEqual(["true:200", "true:200"]);
  expect(await instances(request, pupil)).toMatchObject([{ answered: true, was_correct: true }]);
  expect(await progress(request, pupil)).toEqual({ xp: before.xp + 10, coins: before.coins + 5, correct_answers: before.correct_answers + 1 });
});

test("expired session while the game is open: session_expired in the game, nothing recorded, no automatic resend", async ({ page, request, browserName }) => {
  const pupil = await makePupil(request, "expired", browserName);
  const before = await progress(request, pupil);
  const f = await openTask(page, pupil);
  await page.evaluate(() => window.__lvExpireSession());
  await f.locator(`#options [data-option="${await optionId(request, pupil, f, true)}"]`).click();
  await f.locator("#commit").click();
  await expect(f.locator("body")).toHaveAttribute("data-error", "session_expired", { timeout: 30_000 });
  expect(await processEventCalls(page)).toEqual(["true:401"]);
  expect(await instances(request, pupil)).toMatchObject([{ answered: false }]);
  expect(await progress(request, pupil)).toEqual(before);
  await expect(f.locator("body")).toHaveAttribute("data-cabinet", "default");
});

test("a forged verdict posted into the game is dropped: the world does not change, nothing is recorded", async ({ page, request, browserName }) => {
  const pupil = await makePupil(request, "forgedverdict", browserName);
  const f = await openTask(page, pupil);
  await page.evaluate((game) => {
    document.getElementById("game").contentWindow.postMessage({
      protocol: "laerligverse.bridge/2", type: "task.result", nonce: "forged", requestId: "x", instanceToken: "t",
      outcome: "correct", feedback: { text: null, correctAnswer: null }, evidence: "evidence", retryable: false,
    }, game);
  }, GAME_ORIGIN);
  await expect(f.locator("body")).toHaveAttribute("data-last-reject", "nonce");
  await expect(f.locator("body")).toHaveAttribute("data-cabinet", "default");
  expect(await instances(request, pupil)).toMatchObject([{ answered: false }]);
  expect(await processEventCalls(page)).toEqual([]);
});

test("the game cannot grant XP or coins, nor answer another pupil's instance", async ({ page, request, browserName }) => {
  const victim = await makePupil(request, "victim", browserName);
  const victimFrame = await openTask(page, victim); // the victim has an open instance
  void victimFrame;
  const victimRow = (await instances(request, victim)).at(-1);
  const victimBefore = await progress(request, victim);

  const pupil = await makePupil(request, "attacker", browserName);
  const before = await progress(request, pupil);
  const f = await openTask(page, pupil);
  const game = page.frames().find((fr) => fr.url().startsWith(GAME_ORIGIN));
  // A reward message does not exist in the protocol: the host rejects it as invalid.
  await game.evaluate((host) => window.parent.postMessage({ protocol: "laerligverse.bridge/2", type: "reward.grant", xp: 999, coins: 999 }, host), HOST_ORIGIN);
  await expect(page.locator('#rejects li[data-reason="invalid"]')).toHaveCount(1);
  // Naming another pupil's instance id is not a token the host issued; the server is never asked.
  await game.evaluate(({ host, id }) => window.parent.postMessage({ protocol: "laerligverse.bridge/2", type: "task.action", nonce: "guess", requestId: "steal", instanceToken: id, action: { kind: "choice", payload: { optionId: "o1" } }, clientSeq: 1 }, host), { host: HOST_ORIGIN, id: victimRow.id });
  await expect(page.locator("#rejects li")).toHaveCount(2);
  expect(await processEventCalls(page)).toEqual([]);
  // And the server itself refuses the pupil's session on the victim's instance (403).
  const direct = await request.post(`${SUPA}/functions/v1/process-event`, { headers: { apikey: ANON, authorization: `Bearer ${pupil.token}` }, data: { question_instance_id: victimRow.id, answer: victimRow.correct_answer, question_shown_at: Date.now() } });
  expect(direct.status()).toBe(403);
  expect(await progress(request, pupil)).toEqual(before);
  expect(await progress(request, victim)).toEqual(victimBefore);
  expect((await instances(request, victim)).at(-1).answered).toBe(false);
  void f;
});

test("two tabs of the same pupil commit the same instance at the same moment: two requests, ONE registration, ONE reward", async ({ browser, request, browserName }) => {
  // Gap closed (F3 review): the in-page dedup cannot help across tabs — only the database can.
  const pupil = await makePupil(request, "twotabs", browserName);
  const before = await progress(request, pupil);
  const [ctxA, ctxB] = [await browser.newContext(), await browser.newContext()];
  try {
    const [pa, pb] = [await ctxA.newPage(), await ctxB.newPage()];
    const fa = await openTask(pa, pupil);
    const fb = await openTask(pb, pupil); // get-next-question serves the SAME open instance to the second tab
    expect(await instances(request, pupil)).toHaveLength(1);
    await fa.locator(`#options [data-option="${await optionId(request, pupil, fa, true)}"]`).click();
    await fb.locator(`#options [data-option="${await optionId(request, pupil, fb, true)}"]`).click();
    await Promise.all([fa.locator("#commit").click(), fb.locator("#commit").click()]);
    await expect(fa.locator("body")).toHaveAttribute("data-task", "correct", { timeout: 30_000 });
    await expect(fb.locator("body")).toHaveAttribute("data-task", "correct", { timeout: 30_000 });
    // Each tab's host sent its own request; the database's CAS on answered=false let only one register and pay.
    expect([...(await processEventCalls(pa)), ...(await processEventCalls(pb))]).toEqual(["true:200", "true:200"]);
    expect(await instances(request, pupil)).toMatchObject([{ answered: true, was_correct: true }]);
    expect(await progress(request, pupil)).toEqual({ xp: before.xp + 10, coins: before.coins + 5, correct_answers: before.correct_answers + 1 });
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});

test("a REAL logout (session revoked on the server) while the game is open: the revoked token is refused, nothing recorded", async ({ page, request, browserName }) => {
  // Gap closed (F3 review): the other expiry test replaces the token with garbage; this one uses the pupil's
  // real, signed token after the server revoked its session.
  const pupil = await makePupil(request, "logout", browserName);
  const before = await progress(request, pupil);
  const f = await openTask(page, pupil);
  const out = await request.post(`${SUPA}/auth/v1/logout?scope=global`, { headers: { apikey: ANON, authorization: `Bearer ${pupil.token}` } });
  expect([200, 204]).toContain(out.status());
  await f.locator(`#options [data-option="${await optionId(request, pupil, f, true)}"]`).click();
  await f.locator("#commit").click();
  await expect(f.locator("body")).toHaveAttribute("data-error", "session_expired", { timeout: 30_000 });
  expect(await processEventCalls(page)).toEqual(["true:401"]);
  expect(await instances(request, pupil)).toMatchObject([{ answered: false }]);
  expect(await progress(request, pupil)).toEqual(before);
  await expect(f.locator("body")).toHaveAttribute("data-cabinet", "default");
});

test("the game's origin cannot read the host's session, and the game is served no host or adapter code", async ({ page, request, browserName }) => {
  const pupil = await makePupil(request, "isolation", browserName);
  await openTask(page, pupil);
  const game = page.frames().find((fr) => fr.url().startsWith(GAME_ORIGIN));
  const probe = await game.evaluate(() => {
    let parent = "readable";
    try { parent = String(window.parent.document.body.innerHTML.length); } catch { parent = "blocked"; }
    return { parent, origin: location.origin };
  });
  expect(probe).toEqual({ parent: "blocked", origin: GAME_ORIGIN });
  for (const path of ["/host.mjs", "/pkg/learning-bridge/src/host.ts", "/pkg/learning-bridge/src/laerlig-service.ts", "/pkg/learning-bridge/src/test-service.ts"]) {
    expect((await request.get(`${GAME_ORIGIN}${path}`)).status(), path).toBe(404);
  }
  expect((await request.get(`${HOST_ORIGIN}/pkg/learning-bridge/src/test-service.ts`)).status()).toBe(404);
});
