// Lærligverse (D-321): the REAL F3 host page (laerligverse/host/, plain JavaScript, no build) on the isolated
// stack (D-110). The pupil signs in through the host's own form with a synthetic local account; the game
// (the neutral harness game: adventure-engine core + the Arkivskabet scene) runs on its own origin.
//
//   pupil signs in on the host (:4330) → host loads the game iframe (:4331) → bridge/2 handshake →
//   get-next-question / process-event (this commit's Edge Functions) → PostgreSQL grades, records, pays →
//   verdict → the engine's own graph changes the world.
//
// Nothing is mocked in this chain. The database is the oracle, read with the local service key by THIS test
// process only. Network evidence comes from Playwright's own request log, not from the page.
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
  harness = await startHarness({ host: "f3", supabaseUrl: SUPA, anonKey: ANON });
});
test.afterAll(async () => {
  await harness?.close();
});

async function makePupil(request, label, browserName) {
  const tag = `${label}-${browserName}-${RUN}`.replace(/[^A-Za-z0-9-]/g, "");
  const email = `lvh-${tag}@${SYNTHETIC_EMAIL_DOMAIN}`;
  const password = createHash("sha256").update(`isolated-lvh:${tag}`).digest("base64url");
  const created = await request.post(`${SUPA}/auth/v1/admin/users`, { headers: svc, data: { email, password, email_confirm: true } });
  expect(created.status(), "local Auth must create the synthetic pupil").toBe(200);
  const id = (await created.json()).id;
  const profile = await request.post(`${SUPA}/rest/v1/profiles`, {
    headers: { ...svc, "content-type": "application/json", prefer: "return=minimal" },
    data: { id, role: "student", full_name: `Syntetisk F3-elev ${label}`, selected_grade: 8, active_domains: ["cold_war"], equipped_slots: {}, active_theme: "default" },
  });
  expect(profile.status(), await profile.text()).toBe(201);
  return { id, email, password };
}

const progress = async (request, pupil) =>
  (await (await request.get(`${SUPA}/rest/v1/student_progress?select=xp,coins,correct_answers&student_id=eq.${pupil.id}`, { headers: svc })).json())[0] ?? { xp: 0, coins: 0, correct_answers: 0 };
const instances = async (request, pupil) =>
  await (await request.get(`${SUPA}/rest/v1/question_instances?select=id,answered,was_correct,correct_answer&student_id=eq.${pupil.id}&order=created_at`, { headers: svc })).json();

/** Count the backend requests the BROWSER actually made (Playwright's network log, all frames). */
function trackRequests(page) {
  const seen = [];
  page.on("request", (r) => {
    const u = r.url();
    if (u.includes("/functions/v1/") && r.method() === "POST") seen.push(u.split("/functions/v1/")[1]);
  });
  return seen;
}

/** Sign in through the host page's own form, then use the cabinet in the game. */
async function signInAndOpenTask(page, pupil) {
  await page.goto(`${HOST_ORIGIN}/`);
  await expect(page.locator("#lv-mode")).toHaveText("Isoleret testmiljø — syntetiske elever");
  await page.locator("#lv-email").fill(pupil.email);
  await page.locator("#lv-password").fill(pupil.password);
  await page.locator("#lv-login-submit").click();
  await expect(page.locator("body")).toHaveAttribute("data-session", "active");
  await expect(page.locator("#lv-password")).toHaveValue("");
  const f = page.frameLocator("#lv-game");
  await expect(f.locator("body")).toHaveAttribute("data-bridge", "ready", { timeout: 30_000 });
  await expect(page.locator("#lv-link")).toHaveText("forbundet");
  await f.locator("#use-cabinet").click();
  await expect(f.locator("body")).toHaveAttribute("data-task", "open", { timeout: 30_000 });
  return f;
}

async function optionId(request, pupil, f, wantCorrect) {
  const key = (await instances(request, pupil)).at(-1).correct_answer;
  const opts = await f.locator("#options button").evaluateAll((bs) => bs.map((b) => ({ id: b.dataset.option, label: b.textContent })));
  const hit = opts.find((o) => (o.label === key) === wantCorrect);
  expect(hit).toBeTruthy();
  return hit.id;
}

const gameFrame = (page) => page.frames().find((fr) => fr.url().startsWith(GAME_ORIGIN));

test("F3 HOST CHAIN: sign-in on the real host page → real backend grades and pays once → the world changes; no token ever reaches the game", async ({ page, request, browserName }) => {
  const pupil = await makePupil(request, "chain", browserName);
  const calls = trackRequests(page);
  const before = await progress(request, pupil);
  const f = await signInAndOpenTask(page, pupil);
  await f.locator(`#options [data-option="${await optionId(request, pupil, f, true)}"]`).click();
  await f.locator("#commit").click();
  await expect(f.locator("body")).toHaveAttribute("data-task", "correct", { timeout: 30_000 });
  expect(await instances(request, pupil)).toMatchObject([{ answered: true, was_correct: true }]);
  expect(await progress(request, pupil)).toEqual({ xp: before.xp + 10, coins: before.coins + 5, correct_answers: before.correct_answers + 1 });
  await expect(f.locator("body")).toHaveAttribute("data-cabinet", "open");
  expect(calls).toEqual(["get-next-question", "process-event"]);
  // Everything the game received, as text: no JWT, no bearer, no key, no instance id.
  const received = (await gameFrame(page).evaluate(() => window.__lvReceived())).join("\n");
  const row = (await instances(request, pupil))[0];
  for (const secret of ["eyJ", "Bearer", "access_token", "refresh_token", ANON, row.id]) expect(received, `the game received ${secret}`).not.toContain(secret);
});

test("the host page's CSP is enforced: it may only call the Supabase origin and frame only the game origin", async ({ page, request, browserName }) => {
  const pupil = await makePupil(request, "csp", browserName);
  await signInAndOpenTask(page, pupil);
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  expect(csp).toContain("default-src 'none'");
  expect(csp).toContain(`connect-src ${new URL(SUPA).origin}`);
  expect(csp).toContain(`frame-src ${GAME_ORIGIN}`);
  // A request to any other origin is blocked by the browser, not by our code.
  const blocked = await page.evaluate(async (other) => {
    try { await fetch(`${other}/game.html`); return "allowed"; } catch { return "blocked"; }
  }, GAME_ORIGIN);
  expect(blocked).toBe("blocked");
});

test("logout on the host stops every further submission BEFORE the network: session_expired, nothing recorded", async ({ page, request, browserName }) => {
  const pupil = await makePupil(request, "logout", browserName);
  const calls = trackRequests(page);
  const before = await progress(request, pupil);
  const f = await signInAndOpenTask(page, pupil);
  await page.locator("#lv-logout").click();
  await expect(page.locator("body")).toHaveAttribute("data-session", "signed-out");
  await f.locator(`#options [data-option="${await optionId(request, pupil, f, true)}"]`).click();
  await f.locator("#commit").click();
  await expect(f.locator("body")).toHaveAttribute("data-error", "session_expired", { timeout: 30_000 });
  expect(calls).toEqual(["get-next-question"]);
  expect(await instances(request, pupil)).toMatchObject([{ answered: false }]);
  expect(await progress(request, pupil)).toEqual(before);
  await expect(f.locator("body")).toHaveAttribute("data-cabinet", "default");
});

test("a reloaded game is a NEW session: the open instance resumes, the old instance's messages are dead", async ({ page, request, browserName }) => {
  const pupil = await makePupil(request, "reload", browserName);
  const f = await signInAndOpenTask(page, pupil);
  const prompt = await f.locator("#prompt").textContent();
  await page.evaluate(() => { const fr = document.getElementById("lv-game"); fr.src = `${fr.src.split("?")[0]}?reload=1`; });
  await expect(f.locator("body")).toHaveAttribute("data-resumed", "true", { timeout: 30_000 });
  await expect(f.locator("#prompt")).toHaveText(prompt ?? "");
  expect(await instances(request, pupil)).toHaveLength(1);
  // A message carrying a stale nonce (any nonce the old game held) is dropped by the host.
  await gameFrame(page).evaluate((host) => window.parent.postMessage({ protocol: "laerligverse.bridge/2", type: "task.request", nonce: "stale-nonce", requestId: "old", objectiveId: "x", purpose: "check", surface: "world", contextKey: "arkivskab" }, host), HOST_ORIGIN);
  await expect(page.locator("body")).toHaveAttribute("data-last-reject", "nonce");
});

test("unknown commands, reward claims and forged verdicts change nothing", async ({ page, request, browserName }) => {
  const pupil = await makePupil(request, "forged", browserName);
  const calls = trackRequests(page);
  const before = await progress(request, pupil);
  const f = await signInAndOpenTask(page, pupil);
  const game = gameFrame(page);
  for (const data of [
    { protocol: "laerligverse.bridge/2", type: "reward.grant", xp: 999, coins: 999 },
    { protocol: "laerligverse.bridge/2", type: "mastery.set", objective: "hist.h4", level: "mestret" },
    { protocol: "laerligverse.bridge/2", type: "task.result", outcome: "correct" },
  ]) {
    await game.evaluate(({ host, d }) => window.parent.postMessage(d, host), { host: HOST_ORIGIN, d: data });
    await expect(page.locator("body")).toHaveAttribute("data-last-reject", "invalid");
  }
  // A verdict forged INTO the game (from the host page's origin, without the session nonce) is dropped.
  await page.evaluate((go) => document.getElementById("lv-game").contentWindow.postMessage({ protocol: "laerligverse.bridge/2", type: "task.result", nonce: "forged", requestId: "x", instanceToken: "t", outcome: "correct", feedback: { text: null, correctAnswer: null }, evidence: "evidence", retryable: false }, go), GAME_ORIGIN);
  await expect(f.locator("body")).toHaveAttribute("data-last-reject", "nonce");
  await expect(f.locator("body")).toHaveAttribute("data-cabinet", "default");
  expect(calls).toEqual(["get-next-question"]);
  expect(await progress(request, pupil)).toEqual(before);
});

test("two tabs of the same pupil on the real host page: two requests, ONE registration, ONE reward", async ({ browser, request, browserName }) => {
  const pupil = await makePupil(request, "twotabs", browserName);
  const before = await progress(request, pupil);
  const [ca, cb] = [await browser.newContext(), await browser.newContext()];
  try {
    const [pa, pb] = [await ca.newPage(), await cb.newPage()];
    const fa = await signInAndOpenTask(pa, pupil);
    const fb = await signInAndOpenTask(pb, pupil);
    expect(await instances(request, pupil)).toHaveLength(1);
    await fa.locator(`#options [data-option="${await optionId(request, pupil, fa, true)}"]`).click();
    await fb.locator(`#options [data-option="${await optionId(request, pupil, fb, true)}"]`).click();
    await Promise.all([fa.locator("#commit").click(), fb.locator("#commit").click()]);
    await expect(fa.locator("body")).toHaveAttribute("data-task", "correct", { timeout: 30_000 });
    await expect(fb.locator("body")).toHaveAttribute("data-task", "correct", { timeout: 30_000 });
    expect(await instances(request, pupil)).toMatchObject([{ answered: true, was_correct: true }]);
    expect(await progress(request, pupil)).toEqual({ xp: before.xp + 10, coins: before.coins + 5, correct_answers: before.correct_answers + 1 });
  } finally {
    await ca.close();
    await cb.close();
  }
});

test("the host page is keyboard-operable and exposes its structure to assistive technology", async ({ page, request, browserName }) => {
  const pupil = await makePupil(request, "a11y", browserName);
  await page.goto(`${HOST_ORIGIN}/`);
  await expect(page.getByRole("heading", { level: 1, name: "Lærligverse" })).toBeVisible();
  await expect(page.getByRole("form").or(page.locator("#lv-login-form"))).toBeVisible();
  await expect(page.getByLabel("E-mail")).toBeVisible();
  await expect(page.getByLabel("Adgangskode")).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(1);
  // Sign in with the keyboard only.
  await page.getByLabel("E-mail").focus();
  await page.keyboard.type(pupil.email);
  await page.keyboard.press("Tab");
  await page.keyboard.type(pupil.password);
  await page.keyboard.press("Enter");
  await expect(page.locator("body")).toHaveAttribute("data-session", "active");
  await expect(page.getByRole("region", { name: "Lærligverse-spillet" })).toBeVisible();
  await expect(page.locator("#lv-game")).toHaveAttribute("title", "Lærligverse: Arkivskabet");
});

// ---- F3 final QA additions (D-321): incorrect answer, repeat reward, wrong window, viewports ----

test("an incorrect answer, committed three times at once: ONE process-event, graded incorrect, nothing paid, the cabinet stays locked", async ({ page, request, browserName }) => {
  const pupil = await makePupil(request, "wrong", browserName);
  const calls = trackRequests(page);
  const before = await progress(request, pupil);
  const f = await signInAndOpenTask(page, pupil);
  await f.locator(`#options [data-option="${await optionId(request, pupil, f, false)}"]`).click();
  await f.locator("#commit").evaluate((b) => { b.click(); b.click(); b.click(); });
  await expect(f.locator("body")).toHaveAttribute("data-task", "incorrect", { timeout: 30_000 });
  expect(calls).toEqual(["get-next-question", "process-event"]);
  expect(await instances(request, pupil)).toMatchObject([{ answered: true, was_correct: false }]);
  expect(await progress(request, pupil)).toEqual(before);
  await expect(f.locator("body")).toHaveAttribute("data-cabinet", "default");
});

test("a repeat (D-211) through the host page: the reopened instance is served again and pays the REPEAT amount (2 XP, 1 coin), not a first reward", async ({ page, request, browserName }) => {
  const pupil = await makePupil(request, "repeat", browserName);
  const f = await signInAndOpenTask(page, pupil);
  await f.locator(`#options [data-option="${await optionId(request, pupil, f, true)}"]`).click();
  await f.locator("#commit").click();
  await expect(f.locator("body")).toHaveAttribute("data-task", "correct", { timeout: 30_000 });
  const first = await progress(request, pupil);
  const [row] = await instances(request, pupil);
  // Reopen the round the way the repeat functions do (answered true → false, repeat_count + 1, answer cleared).
  const reopen = await request.patch(`${SUPA}/rest/v1/question_instances?id=eq.${row.id}`, {
    headers: { ...svc, "content-type": "application/json", prefer: "return=minimal" }, data: { answered: false, repeat_count: 1, user_answer: null },
  });
  expect(reopen.status(), await reopen.text()).toBe(204);
  // A fresh game document (memory-only world: the cabinet is locked again). The repeat is not "resumed" by the
  // handshake (that is only the host's own unanswered instance); it is served the normal way, by get-next-question.
  await page.evaluate(() => { const fr = document.getElementById("lv-game"); fr.src = `${fr.src.split("?")[0]}?reload=repeat`; });
  // The old document said data-task="correct"; wait for the NEW document before using it.
  await expect(f.locator("body")).toHaveAttribute("data-task", "none", { timeout: 30_000 });
  await expect(f.locator("body")).toHaveAttribute("data-bridge", "ready", { timeout: 30_000 });
  await f.locator("#use-cabinet").click();
  await expect(f.locator("body")).toHaveAttribute("data-task", "open", { timeout: 30_000 });
  await f.locator(`#options [data-option="${await optionId(request, pupil, f, true)}"]`).click();
  await f.locator("#commit").click();
  await expect(f.locator("body")).toHaveAttribute("data-task", "correct", { timeout: 30_000 });
  const after = await progress(request, pupil);
  expect({ xp: after.xp - first.xp, coins: after.coins - first.coins }).toEqual({ xp: 2, coins: 1 });
  expect(await instances(request, pupil)).toHaveLength(1);
});

test("a second window on the GAME origin (not the registered iframe) is refused by source, and changes nothing", async ({ page, request, browserName }) => {
  const pupil = await makePupil(request, "window", browserName);
  const calls = trackRequests(page);
  const f = await signInAndOpenTask(page, pupil);
  // CSP allows framing the game origin, so a second game frame can exist; the host must still only trust ITS iframe.
  await page.evaluate((src) => {
    const other = document.createElement("iframe");
    other.id = "lv-intruder";
    other.src = `${src.split("?")[0]}?intruder=1`;
    document.body.append(other);
  }, await page.locator("#lv-game").getAttribute("src"));
  await expect(page.locator("body")).toHaveAttribute("data-last-reject", "source", { timeout: 30_000 });
  await expect(f.locator("body")).toHaveAttribute("data-task", "open");
  expect(calls).toEqual(["get-next-question"]);
  expect(await instances(request, pupil)).toHaveLength(1);
});

test("viewports 320–1280 px: the game gets real room, nothing scrolls sideways, status says the game is ready, logout stays reachable", async ({ page, request, browserName }) => {
  const pupil = await makePupil(request, "viewport", browserName);
  await page.setViewportSize({ width: 1280, height: 860 });
  const f = await signInAndOpenTask(page, pupil);
  await expect(page.locator("#lv-live")).toHaveText("Spillet er klar.");
  await expect(page.locator("#lv-link")).toHaveText("forbundet");
  for (const [width, height] of [[320, 640], [360, 740], [375, 812], [390, 844], [768, 1024], [1280, 860]]) {
    await page.setViewportSize({ width, height });
    const m = await page.evaluate(() => {
      const fr = document.getElementById("lv-game").getBoundingClientRect();
      const out = document.getElementById("lv-logout").getBoundingClientRect();
      return { sideways: document.documentElement.scrollWidth - window.innerWidth, frameW: fr.width, frameH: fr.height, logoutW: out.width, logoutH: out.height };
    });
    expect(m.sideways, `${width}px: horizontal scroll`).toBeLessThanOrEqual(0);
    expect(m.frameW, `${width}px: frame width`).toBeLessThanOrEqual(width);
    // Phones: most of the screen height (the 16:9 frame was ~180 px at 360 px before 707380fb).
    if (width <= 560) expect(m.frameH, `${width}px: frame height`).toBeGreaterThanOrEqual(Math.min(0.75 * height, 480));
    else expect(m.frameH, `${width}px: frame height`).toBeGreaterThanOrEqual(300);
    expect(m.logoutW * m.logoutH, `${width}px: logout visible`).toBeGreaterThan(0);
    // The game inside stays usable at every width.
    await expect(f.locator("#commit")).toBeVisible();
  }
  await expect(page.locator("#lv-logout")).toBeVisible();
  await page.locator("#lv-logout").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("body")).toHaveAttribute("data-session", "signed-out");
  // After logout the link must not look active, and the pupil is not stuck: the login form is back.
  await expect(page.locator("#lv-link")).toHaveText("afbrudt (logget ud)");
  await expect(page.locator("#lv-login-form")).toBeVisible();
  await expect(page.locator("#lv-live")).toContainText("Du er logget ud");
});

test("after logout the pupil can sign in again on the same page; the game reconnects and the SAME open instance is served again", async ({ page, request, browserName }) => {
  const pupil = await makePupil(request, "relogin", browserName);
  const f = await signInAndOpenTask(page, pupil);
  await page.locator("#lv-logout").click();
  await expect(page.locator("body")).toHaveAttribute("data-session", "signed-out");
  await expect(page.locator("#lv-link")).toHaveText("afbrudt (logget ud)");
  await page.locator("#lv-email").fill(pupil.email);
  await page.locator("#lv-password").fill(pupil.password);
  await page.locator("#lv-login-submit").click();
  await expect(page.locator("body")).toHaveAttribute("data-session", "active");
  await expect(page.locator("#lv-link")).toHaveText("forbundet", { timeout: 30_000 });
  // A new sign-in is a new host: openTask() makes no network call (get-next-question has no side-effect-free
  // peek), so the open instance is not resumed at the handshake but served FIRST on the next task request.
  await expect(f.locator("body")).toHaveAttribute("data-bridge", "ready", { timeout: 30_000 });
  await expect(f.locator("body")).toHaveAttribute("data-task", "none");
  await f.locator("#use-cabinet").click();
  await expect(f.locator("body")).toHaveAttribute("data-task", "open", { timeout: 30_000 });
  // The SAME server instance, not a second one.
  expect(await instances(request, pupil)).toHaveLength(1);
  await f.locator(`#options [data-option="${await optionId(request, pupil, f, true)}"]`).click();
  await f.locator("#commit").click();
  await expect(f.locator("body")).toHaveAttribute("data-task", "correct", { timeout: 30_000 });
  expect(await instances(request, pupil)).toMatchObject([{ answered: true, was_correct: true }]);
});
