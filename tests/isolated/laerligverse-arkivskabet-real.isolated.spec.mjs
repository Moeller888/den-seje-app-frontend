// F11-C: the REAL Arkivskabet game against the REAL isolated backend — one pupil journey, end to end (D-110).
//
//   pupil signs in on the REAL F3 host (loopback 127.0.0.1:4330, laerligverse/host/) → the REAL game
//   (adventure-engine/packages/archive-prototype, game-main.ts: PixiJS world, IntroView, archive card, TaskView —
//   built by laerligverse-harness/build-arkivskabet.mjs, served on 127.0.0.1:4331) negotiates laerligverse.bridge/3 →
//   the host calls THIS commit's get-next-question (LAERLIGVERSE_INTRODUCTION=on in this lane only) with the pupil's
//   JWT → the server chooses the introduction from the database → the game shows the cards → "shown" / "done" go to
//   introduction-progress → PostgreSQL → the same decision point then gets the first guided-practice task, which the
//   pupil answers in the real TaskView.
//
// F11-B's visible spec (laerligverse-intro-visible) runs the same backend with the D-315 TEST game (a DOM stand-in
// for the renderer); this spec closes the gap: the game is the pupil's actual client. Nothing is intercepted (no
// route.fulfill / route.abort, no local-network-access permission — F11-A); a network break is the browser's own
// offline mode. The database is the oracle, read with the local service key by THIS test process only.
// The introduction pays nothing and is not evidence (D-330): "shown" and "done" are registrations, not learning.
//
// Runs only in the isolated introduction lane (REPLAY_PROFILE=introduction, ISOLATED_ARKIVSKABET_DIST = the build),
// in Chromium, Firefox and WebKit; tests/isolated/require-complete-run.mjs fails the lane if anything is skipped.
import { test, expect } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { assertIsolated, SYNTHETIC_EMAIL_DOMAIN } from "./isolation-guard.mjs";
import { startHarness, HOST_ORIGIN, GAME_ORIGIN } from "./laerligverse-harness/serve-harness.mjs";

assertIsolated(process.env);

const LANE = process.env.REPLAY_PROFILE === "introduction";
const DIST = process.env.ISOLATED_ARKIVSKABET_DIST ?? "";
const SUPA = process.env.ISOLATED_SUPABASE_URL.replace(/\/+$/, "");
const ANON = process.env.ISOLATED_SUPABASE_ANON_KEY;
const SERVICE = process.env.ISOLATED_SUPABASE_SERVICE_KEY;
const RUN = (process.env.GITHUB_RUN_ID || "local") + "-" + (process.env.GITHUB_RUN_ATTEMPT || "1");
const svc = { apikey: SERVICE, authorization: `Bearer ${SERVICE}` };
const json = { "content-type": "application/json" };
const INTRO = JSON.parse(readFileSync(new URL("./fixtures/kildekritik-introduction.json", import.meta.url), "utf8"));
const ITEMS = JSON.parse(readFileSync(new URL("./fixtures/kildekritik-questions.json", import.meta.url), "utf8"));
const CARDS = INTRO.content.cards;
// Its own objective: neither the visible spec (…_intro_visible), #664's chain (…_intro_e2e) nor the sequence specs share it.
const OBJECTIVE = `${INTRO.learning_objective}_f11c`;
const SOURCE = ITEMS.find((r) => r.learning_step === "guided_practice");
const PRACTICE = { ...SOURCE, content: { ...SOURCE.content, question: `${SOURCE.content.question} (rigtigt Arkivskab, testkopi)` } };
const CONTEXT_OF_STEP = Object.fromEntries(ITEMS.map((r) => [r.learning_step, r.step]));
// The REAL game's one objective for the whole sequence (archive-prototype/src/sequence.ts OBJECTIVE_ID); the host maps it.
const GAME_OBJECTIVE = "kildekritik.ophav";
const HARNESS = { host: "f3", supabaseUrl: SUPA, anonKey: ANON, objectiveMap: { [GAME_OBJECTIVE]: OBJECTIVE }, h5: true, sequence: true, stepContexts: CONTEXT_OF_STEP, gameDist: DIST };

test.describe.configure({ mode: "serial" });
test.beforeEach(() => {
  test.skip(!LANE, "runs only in the isolated introduction lane (REPLAY_PROFILE=introduction); require-complete-run.mjs fails that lane if it does not run");
});

let harness;
test.beforeAll(async ({ request }) => {
  if (!LANE) return;
  expect(DIST, "ISOLATED_ARKIVSKABET_DIST: the introduction lane builds the real game first").not.toBe("");
  for (const table of ["introduction_rounds", "learning_introductions"]) {
    const r = await request.get(`${SUPA}/rest/v1/${table}?select=*&limit=0`, { headers: svc });
    expect(r.status(), `${table} must exist in the introduction lane: ${await r.text()}`).toBe(200);
  }
  const have = await (await request.get(`${SUPA}/rest/v1/learning_introductions?select=id&learning_objective=eq.${OBJECTIVE}`, { headers: svc })).json();
  if (have.length === 0) {
    const ins = await request.post(`${SUPA}/rest/v1/learning_introductions`, { headers: { ...svc, ...json, prefer: "return=minimal" }, data: { learning_objective: OBJECTIVE, content: INTRO.content } });
    expect(ins.status(), await ins.text()).toBe(201);
  }
  const q = await (await request.get(`${SUPA}/rest/v1/questions?select=id&learning_objective=eq.${OBJECTIVE}`, { headers: svc })).json();
  if (q.length === 0) {
    const ins = await request.post(`${SUPA}/rest/v1/questions`, {
      headers: { ...svc, ...json, prefer: "return=minimal" },
      data: [{
        type: "mc_single", content: PRACTICE.content, difficulty: 500, is_active: true, question_type: "auto",
        learning_objective: OBJECTIVE, answer_format: "mc", answer_type: "short",
        metadata: { domain: OBJECTIVE, concepts: ["kildekritik"], cognitive_skill: "analysis", synthetic: true, fixture: "F11-C", learning_step: "guided_practice" },
        target_grade: 8, difficulty_band: 3,
      }],
    });
    expect(ins.status(), await ins.text()).toBe(201);
  }
  harness = await startHarness({ ...HARNESS, introductions: true });
});
test.afterAll(async () => {
  await harness?.close();
});

// ── Synthetic pupils and the database oracle ────────────────────────────────────────────────────────────────────
async function makePupil(request, label, browserName) {
  const tag = `${label}-${browserName}-${RUN}`.replace(/[^A-Za-z0-9-]/g, "");
  const email = `f11c-${tag}@${SYNTHETIC_EMAIL_DOMAIN}`;
  const password = createHash("sha256").update(`isolated-f11c:${tag}`).digest("base64url");
  const created = await request.post(`${SUPA}/auth/v1/admin/users`, { headers: svc, data: { email, password, email_confirm: true } });
  expect(created.status()).toBe(200);
  const id = (await created.json()).id;
  const profile = await request.post(`${SUPA}/rest/v1/profiles`, {
    headers: { ...svc, ...json, prefer: "return=minimal" },
    data: { id, role: "student", full_name: `Syntetisk F11-C-elev ${label}`, selected_grade: 8, active_domains: [OBJECTIVE], equipped_slots: {}, active_theme: "default" },
  });
  expect(profile.status(), await profile.text()).toBe(201);
  const progress = await request.post(`${SUPA}/rest/v1/student_progress`, {
    headers: { ...svc, ...json, prefer: "resolution=merge-duplicates,return=minimal" },
    data: { student_id: id, xp: 100, coins: 50, mastery_level: 3, current_streak: 2, longest_streak: 5 },
  });
  expect(progress.status(), await progress.text()).toBeLessThan(300);
  return { id, email, password };
}
const rows = async (request, path) => {
  const r = await request.get(`${SUPA}/rest/v1/${path}`, { headers: svc });
  const text = await r.text();
  expect(r.status(), `${path}: ${text}`).toBe(200);
  return JSON.parse(text);
};
const rounds = (request, p) => rows(request, `introduction_rounds?select=id,student_id,served_at,presented_at,presented_request_id,completed_at,completion_request_id&student_id=eq.${p.id}&order=served_at`);
const instances = (request, p) => rows(request, `question_instances?select=id,answered,presented_at&student_id=eq.${p.id}&order=created_at`);
const attempts = (request, p) => rows(request, `question_attempts?select=question_instance_id,status,xp_awarded,coins_awarded,mode&student_id=eq.${p.id}&order=created_at`);
/** Everything a reward, mastery, level, streak or achievement could move — read straight from the database. */
async function rewardState(request, p) {
  return {
    progress: await rows(request, `student_progress?select=*&student_id=eq.${p.id}`),
    subject: await rows(request, `student_subject_level?select=*&student_id=eq.${p.id}`),
    folds: await rows(request, `student_level_fold_log?select=*&student_id=eq.${p.id}`),
    attempts: await attempts(request, p),
    events: await rows(request, `student_events?select=*&student_id=eq.${p.id}`),
  };
}
async function pupilToken(request, p) {
  const t = await request.post(`${SUPA}/auth/v1/token?grant_type=password`, { headers: { apikey: ANON }, data: { email: p.email, password: p.password } });
  expect(t.status()).toBe(200);
  return (await t.json()).access_token;
}

// ── Browser evidence ────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Records every message the GAME frame receives (as text), across EVERY game document of the page: proof that no
 * token reaches it. The record lives in the test process, not in the frame — a game or host reload starts a new
 * document, and an in-frame buffer would hold only the last one. (Second CI run of F11-C, run 44534141784: the
 * in-frame buffer lost the introduction's messages after the G2 reloads, in all three browsers.) Only calls from a
 * frame on the game origin are kept.
 */
async function recordGameMessages(page) {
  const seen = [];
  await page.exposeBinding("__f11cRecord", ({ frame }, text) => {
    if (frame && new URL(frame.url()).origin === GAME_ORIGIN) seen.push(String(text));
  });
  await page.addInitScript((gameOrigin) => {
    if (location.origin !== gameOrigin) return;
    window.addEventListener("message", (e) => {
      let text;
      try { text = JSON.stringify(e.data); } catch { text = "<unserialisable>"; }
      window.__f11cRecord(text);
    }, true);
  }, GAME_ORIGIN);
  return seen;
}
/** Diagnostics never carry a token, a key or a query string (tests/isolated: nothing secret in logs or artifacts). */
function redact(s) {
  let out = String(s).replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "<jwt>").replace(/(https?:\/\/[^\s?"']+)\?[^\s"']*/g, "$1?<query>");
  for (const [secret, label] of [[SERVICE, "<service-key>"], [ANON, "<anon-key>"]]) if (secret) out = out.split(secret).join(label);
  return out;
}
/** Every watched page of the running test, for the failure report (afterEach). */
const watched = [];
/**
 * The browser's OWN requests to the Edge Functions (all frames), the failed ones, their status codes, uncaught page
 * errors, and console errors/warnings of the host and the game (the game logs a dropped bridge message as a warning).
 */
function watch(page, label = "page") {
  const seen = [];
  const failed = [];
  const errors = [];
  const statuses = [];
  const consoleLines = [];
  page.on("request", (r) => {
    const u = r.url();
    if (u.startsWith(`${SUPA}/functions/v1/`) && r.method() === "POST") seen.push(u.split("/functions/v1/")[1].split("?")[0]);
  });
  page.on("response", (r) => {
    const u = r.url();
    if (u.startsWith(`${SUPA}/functions/v1/`)) statuses.push(`${r.request().method()} ${u.split("/functions/v1/")[1].split("?")[0]} ${r.status()}`);
  });
  page.on("requestfailed", (r) => {
    if (r.url().startsWith(SUPA)) failed.push(`${r.url()} ${r.failure()?.errorText ?? ""}`);
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") consoleLines.push(`${m.type()} ${new URL(m.location().url || HOST_ORIGIN).origin === GAME_ORIGIN ? "game" : "host"}: ${m.text()}`);
  });
  const w = { label, page, seen, failed, errors, statuses, consoleLines };
  watched.push(w);
  return w;
}
/** What the pupil sees in the game right now: the three views and every visible status line. */
async function gameState(page) {
  const fr = gameFrame(page);
  if (fr === undefined) return { game: "no game frame" };
  return fr.evaluate(() => {
    const at = (id) => { const n = document.getElementById(id); return n === null ? "missing" : { hidden: n.hidden, state: n.dataset.state ?? null, source: n.dataset.source ?? null, step: n.dataset.step ?? null }; };
    const text = (id) => document.getElementById(id)?.textContent ?? null;
    return { bridge: document.body.dataset.bridge ?? null, connection: text("lv-connection"), intro: at("lv-intro"), introStatus: text("lv-intro-status"), archiveCard: at("lv-archive-card"), task: at("lv-task"), taskStatus: text("lv-status"), notice: text("notice") };
  }).catch((e) => ({ game: `unreadable: ${e}` }));
}

test.use({ screenshot: "only-on-failure" });
test.afterEach(async ({ browserName }, testInfo) => {
  const pages = watched.splice(0);
  if (testInfo.status === testInfo.expectedStatus) return;
  const report = [];
  for (const w of pages) {
    report.push({
      page: w.label,
      game: w.page.isClosed() ? "page closed" : await gameState(w.page),
      functionCalls: w.statuses,
      failedRequests: w.failed,
      pageErrors: w.errors,
      console: w.consoleLines,
    });
  }
  const body = redact(JSON.stringify({ browser: browserName, test: testInfo.title, error: testInfo.error?.message ?? null, pages: report }, null, 2).slice(0, 60_000));
  await testInfo.attach("f11c-diagnostics.json", { body, contentType: "application/json" });
  console.log(`F11-C DIAGNOSTICS [${browserName}] ${body}`);
});
const gameFrame = (page) => page.frames().find((fr) => fr.url().startsWith(GAME_ORIGIN));

// ── Driving the real game (the pupil's own controls, keyboard first) ────────────────────────────────────────────
async function signIn(page, p) {
  await page.goto(`${HOST_ORIGIN}/`);
  await page.locator("#lv-email").fill(p.email);
  await page.locator("#lv-password").fill(p.password);
  await page.locator("#lv-login-submit").click();
  await expect(page.locator("body")).toHaveAttribute("data-session", "active");
  const f = page.frameLocator("#lv-game");
  await expect(f.locator("body")).toHaveAttribute("data-bridge", "ready", { timeout: 30_000 });
  await expect(f.locator("#lv-connection")).toHaveText("Forbundet");
  return f;
}
async function confirmLine(page, f, key) {
  const bubble = f.locator(".bubble");
  await expect(bubble).toHaveAttribute("data-key", key, { timeout: 30_000 });
  await bubble.focus().catch(() => undefined);
  await page.keyboard.press("Enter");
}
/** The title screen, the opening line, and the world is idle. */
async function startGame(page, f) {
  await f.locator("#start").click();
  await confirmLine(page, f, "line.intro");
  await expect(f.locator("#game")).toHaveAttribute("data-idle", "true", { timeout: 30_000 });
}
/** The pupil uses the archive cabinet (keyboard): the world's decision point. */
async function useCabinet(page, f) {
  await expect(f.locator("#game")).toHaveAttribute("data-idle", "true", { timeout: 30_000 });
  await f.locator('[data-hotspot="object:cabinet"]').focus();
  await page.keyboard.press("Enter");
  await confirmLine(page, f, "line.cabinet_locked");
}
async function reloadGame(page, f, n) {
  await page.evaluate((tag) => { const fr = document.getElementById("lv-game"); fr.src = `${fr.src}&reload=${tag}`; }, n);
  await expect.poll(() => gameFrame(page)?.url() ?? "").toContain(`reload=${n}`);
  await expect(f.locator("body")).toHaveAttribute("data-bridge", "ready", { timeout: 30_000 });
}
/** The SERVER's introduction is open with card 1 of the approved content — never the game's local cards. */
async function expectServerIntro(f) {
  const view = f.locator("#lv-intro");
  await expect(view).toBeVisible({ timeout: 30_000 });
  await expect(view).toHaveAttribute("data-source", "server");
  await expect(view).toHaveAttribute("data-cards", String(CARDS.length));
  await expect(f.locator("[data-check]"), "no local understanding check in a bridge/3 session").toHaveCount(0);
  await expect(f.locator("#lv-intro .lv-card-title")).toHaveText(CARDS[0].title);
  await expect(f.locator('#lv-intro [data-card="0"]')).toHaveText(CARDS[0].text);
}
/** Cards 1…n in the server's order, by keyboard only; stops before the final control when `last` is false. */
async function workThroughCards(page, f, { last = true } = {}) {
  for (let i = 0; i < CARDS.length; i++) {
    await expect(f.locator(`#lv-intro [data-card="${i}"]`)).toHaveText(CARDS[i].text);
    await expect(f.locator("#lv-intro .lv-card-title")).toHaveText(CARDS[i].title);
    await expect(f.locator("#lv-intro-progress")).toHaveText(`Kort ${i + 1} af ${CARDS.length}`);
    const next = f.locator("#lv-intro-next");
    await expect(next).toBeFocused();
    await expect(next).toHaveText(i === CARDS.length - 1 ? "Afslut introduktionen" : "Videre");
    if (i === CARDS.length - 1 && !last) return;
    await page.keyboard.press("Enter");
  }
}
/** The archive card (D-322 step 1): local practice that follows the introduction — never evidence, never sent. */
async function fillArchiveCard(f) {
  const card = f.locator("#lv-archive-card");
  await expect(card).toBeVisible({ timeout: 30_000 });
  for (const [id, field] of Object.entries({ f1: "afsender", f2: "tid", f3: "modtager", f4: "formaal" })) await f.locator(`#lv-fact-${id}`).selectOption(field);
  await f.locator("#lv-archive-card-check").click();
  await expect(card).toHaveAttribute("data-state", "done");
  await f.locator("#lv-archive-card-next").click();
  await expect(card).toBeHidden();
}
/** The first guided-practice task, served by the server, open in the real TaskView. */
async function expectPracticeTask(f) {
  const task = f.locator("#lv-task");
  await expect(task).toHaveAttribute("data-state", "open", { timeout: 30_000 });
  await expect(f.locator("#lv-prompt")).toHaveText(PRACTICE.content.question);
  await expect(f.locator("#lv-intro")).toBeHidden();
}
/** Turns every document, picks the right source and a reason, and lays it in the cabinet. */
async function answerCorrectly(f) {
  const inspect = f.locator("#lv-cards .lv-inspect");
  const n = await inspect.count();
  for (let i = 0; i < n; i++) await inspect.nth(i).click();
  await f.locator("#lv-cards .lv-card", { hasText: new RegExp(`^${PRACTICE.content.correct}$`) }).click();
  const reasons = f.locator("#lv-reasons .lv-reason");
  if (await reasons.count() > 0) await reasons.first().click();
  await expect(f.locator("#lv-commit")).toBeEnabled();
  await f.locator("#lv-commit").click();
  await expect(f.locator("#lv-task")).toHaveAttribute("data-state", "correct", { timeout: 30_000 });
}

// ── E1–E6, F, G1, G2: the pupil journey ─────────────────────────────────────────────────────────────────────────
test("the real Arkivskabet: sign-in, the SERVER's introduction, shown and done registered once, reloads before and after, then the first task — answered for real; the introduction paid nothing", async ({ page, request, browserName }) => {
  test.setTimeout(300_000);
  const p = await makePupil(request, "main", browserName);
  const start = await rewardState(request, p);
  const unchanged = async (label) => expect(await rewardState(request, p), `${label}: no XP, coins, mastery, level, streak, attempt or event`).toEqual(start);
  const gameMessages = await recordGameMessages(page);
  const w = watch(page);

  // E1–E3: sign-in on the real host, bridge/3, the world's decision point, the server's introduction.
  let f = await signIn(page, p);
  await startGame(page, f);
  await useCabinet(page, f);
  await expectServerIntro(f);
  // E5 "shown": registered by the server once card 1 was on screen (the database, not the DOM, is the oracle).
  await expect.poll(async () => (await rounds(request, p))[0]?.presented_at ?? null, { timeout: 30_000 }).not.toBeNull();
  let rs = await rounds(request, p);
  expect(rs).toHaveLength(1);
  const first = rs[0];
  expect(first.student_id).toBe(p.id);
  expect(first.completed_at).toBeNull();
  expect(Date.parse(first.presented_at)).toBeGreaterThanOrEqual(Date.parse(first.served_at));
  expect(await instances(request, p), "an introduction is not a task").toEqual([]);
  await unchanged("introduction shown");

  // G1: a reload of the GAME mid-introduction, then a reload of the whole HOST page and a new sign-in: the server
  // resumes the SAME round each time; "shown" never moves and is never registered twice.
  await reloadGame(page, f, "intro");
  await startGame(page, f);
  await useCabinet(page, f);
  await expectServerIntro(f);
  await page.reload();
  f = await signIn(page, p);
  await startGame(page, f);
  await useCabinet(page, f);
  await expectServerIntro(f);
  await expect.poll(async () => (await rounds(request, p)).length).toBe(1);
  rs = await rounds(request, p);
  expect([rs[0].id, rs[0].presented_at, rs[0].presented_request_id]).toEqual([first.id, first.presented_at, first.presented_request_id]);

  // E4: the cards in the server's order with the real controls, by keyboard; the view closes only once the server
  // registered "done" (E5), then the archive card (local practice) and the SERVER's next step: the task (E6).
  await workThroughCards(page, f);
  await expect(f.locator("#lv-intro")).toBeHidden({ timeout: 30_000 });
  rs = await rounds(request, p);
  expect(rs).toHaveLength(1);
  expect(rs[0].completed_at).not.toBeNull();
  expect(rs[0].completion_request_id).not.toBeNull();
  expect(Date.parse(rs[0].completed_at)).toBeGreaterThanOrEqual(Date.parse(rs[0].presented_at));
  expect(rs[0].presented_at).toBe(first.presented_at);
  const done = rs[0];
  await fillArchiveCard(f);
  await expectPracticeTask(f);
  let inst = await instances(request, p);
  expect(inst).toHaveLength(1);
  expect(inst[0].answered).toBe(false);
  // F: nothing paid, levelled or recorded as an attempt by the introduction (shown + done) or the archive card.
  await unchanged("introduction completed, task served");

  // G2: after "done", a reload of the game and of the host: the introduction never comes back, and the pupil's ONE open
  // task comes back — never a second one.
  // - A GAME reload: the host still holds the open task and hands it over with the handshake (init.openTask).
  await reloadGame(page, f, "task");
  await startGame(page, f);
  await expectPracticeTask(f);
  // - A HOST reload: the host's openTask() is in memory only (learning-bridge laerlig-service.ts: get-next-question has
  //   no side-effect-free "peek", it would create an instance), so nothing resumes by itself — the world is idle, no
  //   task is open. The pupil's next use of the cabinet asks the server, which serves the SAME open instance first.
  //   (First CI run of F11-C, run 44528177519: expecting a resumption here timed out in all three browsers, and no
  //   get-next-question call followed the host reload — the test's assumption, not the product, was wrong.)
  await page.reload();
  f = await signIn(page, p);
  await startGame(page, f);
  await expect(f.locator("#lv-task"), "after a host reload nothing opens by itself").toHaveAttribute("data-state", "closed");
  await useCabinet(page, f);
  await expectPracticeTask(f);
  expect(await rounds(request, p)).toEqual([done]);
  expect(await instances(request, p)).toEqual(inst);
  await unchanged("reloads after the introduction");

  // The game received the cards and the task — never a token, a key, the round id or an answer key.
  // The record spans all five game documents of this journey (first load, two game reloads, two host reloads).
  expect(gameMessages.filter((m) => m.includes('"type":"init"')).length, "a handshake in every game document").toBeGreaterThanOrEqual(5);
  const received = gameMessages.join("\n");
  expect(received).toContain('"type":"intro.present"');
  expect(received).toContain('"protocol":"laerligverse.bridge/3"');
  for (const secret of ["eyJ", "Bearer", "access_token", ANON, done.id, "content_sha256", "introduction_round_id", '"correct"', "accepted_answers"]) {
    expect(received, `the game saw ${secret}`).not.toContain(secret);
  }
  // The BROWSER itself talked to the server (serve ×3, shown, done, the task, the resumptions); no request failed.
  expect(w.seen.filter((x) => x === "get-next-question").length).toBeGreaterThanOrEqual(4);
  expect(w.seen.filter((x) => x === "introduction-progress").length).toBeGreaterThanOrEqual(2);
  expect(w.failed, "no browser request to the stack failed").toEqual([]);

  // C: only a real answer to the task moves progression, by the existing rules — once.
  await answerCorrectly(f);
  const at = await attempts(request, p);
  expect(at).toHaveLength(1);
  expect(at[0]).toMatchObject({ status: "correct", question_instance_id: inst[0].id });
  const after = (await rows(request, `student_progress?select=xp,coins&student_id=eq.${p.id}`))[0];
  expect(after.xp - start.progress[0].xp).toBe(at[0].xp_awarded);
  expect(after.coins - start.progress[0].coins).toBe(at[0].coins_awarded);
  expect(await rounds(request, p), "the answer never touches the introduction round").toEqual([done]);
  expect(w.errors, "no uncaught error in the host or the game").toEqual([]);
});

// ── G3: two tabs of the same pupil ──────────────────────────────────────────────────────────────────────────────
test("two tabs of the same pupil in the real game: one round, the first 'shown' and the first 'done' stand, one open task, nothing paid", async ({ browser, request, browserName }) => {
  test.setTimeout(300_000);
  const p = await makePupil(request, "tabs", browserName);
  const start = await rewardState(request, p);
  const context = await browser.newContext();
  try {
    const a = await context.newPage();
    const b = await context.newPage();
    const wa = watch(a, "tab A");
    const wb = watch(b, "tab B");
    const fa = await signIn(a, p);
    const fb = await signIn(b, p);
    await startGame(a, fa);
    await startGame(b, fb);
    await useCabinet(a, fa);
    await useCabinet(b, fb);
    await expectServerIntro(fa);
    await expectServerIntro(fb);
    await expect.poll(async () => (await rounds(request, p))[0]?.presented_at ?? null, { timeout: 30_000 }).not.toBeNull();
    const shown = await rounds(request, p);
    expect(shown).toHaveLength(1);

    await fa.locator("#lv-intro-next").click();
    await fa.locator("#lv-intro-next").click();
    await fa.locator("#lv-intro-next").click();
    await expect(fa.locator("#lv-intro")).toBeHidden({ timeout: 30_000 });
    const done = await rounds(request, p);
    expect(done[0].completed_at).not.toBeNull();
    for (let i = 0; i < CARDS.length; i++) await fb.locator("#lv-intro-next").click();
    await expect(fb.locator("#lv-intro")).toBeHidden({ timeout: 30_000 });
    await fillArchiveCard(fa);
    await expectPracticeTask(fa);
    await fillArchiveCard(fb);
    await expectPracticeTask(fb);

    const after = await rounds(request, p);
    expect(after).toHaveLength(1);
    expect([after[0].presented_at, after[0].presented_request_id, after[0].completed_at, after[0].completion_request_id])
      .toEqual([shown[0].presented_at, shown[0].presented_request_id, done[0].completed_at, done[0].completion_request_id]);
    expect(await instances(request, p), "both tabs show the pupil's ONE open task").toHaveLength(1);
    expect(await rewardState(request, p)).toEqual(start);
    expect([...wa.errors, ...wb.errors]).toEqual([]);
  } finally {
    await context.close();
  }
});

// ── G4 and H5: two different pupils; a failed "done" and a retry ────────────────────────────────────────────────
test("two pupils: A's completed introduction is A's alone — B gets the server's introduction, cannot read or change A's round; B's failed 'done' stays uncompleted until B's own retry", async ({ browser, request, browserName }) => {
  test.setTimeout(300_000);
  const pa = await makePupil(request, "pupil-a", browserName);
  const pb = await makePupil(request, "pupil-b", browserName);
  const startB = await rewardState(request, pb);
  const ca = await browser.newContext();
  const cb = await browser.newContext();
  try {
    const a = await ca.newPage();
    watch(a, "pupil A");
    let fa = await signIn(a, pa);
    await startGame(a, fa);
    await useCabinet(a, fa);
    await expectServerIntro(fa);
    await workThroughCards(a, fa);
    await expect(fa.locator("#lv-intro")).toBeHidden({ timeout: 30_000 });
    const roundA = await rounds(request, pa);
    expect(roundA).toHaveLength(1);
    expect(roundA[0].completed_at).not.toBeNull();

    // B, with B's own sign-in: the server still introduces B (A's completion is not B's).
    const b = await cb.newPage();
    const wb = watch(b, "pupil B");
    const fb = await signIn(b, pb);
    await startGame(b, fb);
    await useCabinet(b, fb);
    await expectServerIntro(fb);
    await expect.poll(async () => (await rounds(request, pb))[0]?.presented_at ?? null, { timeout: 30_000 }).not.toBeNull();
    const roundB = await rounds(request, pb);
    expect(roundB).toHaveLength(1);
    expect(roundB[0].id).not.toBe(roundA[0].id);
    expect(roundB[0].completed_at).toBeNull();

    // B's JWT can neither read A's round nor register anything on it (a foreign round answers like an unknown one).
    const tokenB = await pupilToken(request, pb);
    const asB = { apikey: ANON, authorization: `Bearer ${tokenB}` };
    const readA = await request.get(`${SUPA}/rest/v1/introduction_rounds?select=*&id=eq.${roundA[0].id}`, { headers: asB });
    const readText = await readA.text();
    expect(readText, "B never sees A's round").not.toContain(roundA[0].id);
    if (readA.status() === 200) expect(JSON.parse(readText)).toEqual([]);
    for (const action of ["presented", "completed"]) {
      const r = await request.post(`${SUPA}/functions/v1/introduction-progress`, { headers: { ...asB, ...json }, data: { action, round_id: roundA[0].id, request_id: randomUUID() } });
      expect(r.status(), `B's ${action} on A's round`).toBe(404);
    }
    expect(await rounds(request, pa)).toEqual(roundA);

    // H3/H5: B's network drops at "Afslut introduktionen": a readable Danish message, the same control, nothing
    // completed; back online, B's own second press registers "done" once and the journey continues.
    await workThroughCards(b, fb, { last: false });
    await cb.setOffline(true);
    await b.keyboard.press("Enter");
    await expect(fb.locator("#lv-intro-status")).toContainText("Introduktionen kunne ikke gemmes", { timeout: 60_000 });
    await expect(fb.locator("#lv-intro")).toBeVisible();
    await expect(fb.locator("#lv-intro-next")).toBeEnabled();
    await expect(fb.locator("#lv-archive-card")).toBeHidden();
    expect((await rounds(request, pb))[0].completed_at, "no completion without the server").toBeNull();
    await cb.setOffline(false);
    await fb.locator("#lv-intro-next").focus();
    await b.keyboard.press("Enter");
    await expect(fb.locator("#lv-intro")).toBeHidden({ timeout: 30_000 });
    await fillArchiveCard(fb);
    await expectPracticeTask(fb);
    const doneB = await rounds(request, pb);
    expect(doneB).toHaveLength(1);
    expect(doneB[0].completed_at).not.toBeNull();
    expect(doneB[0].presented_at).toBe(roundB[0].presented_at);
    expect(await rewardState(request, pb)).toEqual(startB);
    expect(await rounds(request, pa), "A untouched by everything B did").toEqual(roundA);
    expect(wb.errors).toEqual([]);
  } finally {
    await ca.close();
    await cb.close();
  }
});

// ── H1, H3, H6: the network breaks while the introduction is fetched and while "done" is sent ───────────────────
test("network breaks: no introduction while offline (an explicit Danish error, nothing recorded); a 'done' that never reached the server is not a completion, and after a reload the server resumes the same round", async ({ browser, request, browserName }) => {
  test.setTimeout(300_000);
  const p = await makePupil(request, "net", browserName);
  const start = await rewardState(request, p);
  const context = await browser.newContext();
  try {
    let page = await context.newPage();
    const w = watch(page, "before reload");
    let f = await signIn(page, p);
    await startGame(page, f);

    // H1: offline at the decision point — the request never leaves the browser; the pupil is told so, in Danish.
    await context.setOffline(true);
    await useCabinet(page, f);
    await expect(f.locator("#lv-task")).toHaveAttribute("data-state", "error", { timeout: 60_000 });
    await expect(f.locator("#lv-status")).toContainText("Ingen opgave lige nu");
    await expect(f.locator("#lv-intro")).toBeHidden();
    expect(await rounds(request, p), "nothing reached the server").toEqual([]);
    await context.setOffline(false);
    await f.locator("#lv-close").click();
    await expect(f.locator("#lv-task")).toHaveAttribute("data-state", "closed");
    // Back online, the same decision point again: now the server's introduction.
    await useCabinet(page, f);
    await expectServerIntro(f);
    await expect.poll(async () => (await rounds(request, p))[0]?.presented_at ?? null, { timeout: 30_000 }).not.toBeNull();
    const shown = await rounds(request, p);
    expect(shown).toHaveLength(1);

    // H3: offline at the final control: the view stays open with the message; no false completion, in the browser
    // or the database. H6: a reload while it is unresolved — the server resumes the SAME, uncompleted round.
    await workThroughCards(page, f, { last: false });
    await context.setOffline(true);
    await page.keyboard.press("Enter");
    await expect(f.locator("#lv-intro-status")).toContainText("Introduktionen kunne ikke gemmes", { timeout: 60_000 });
    await expect(f.locator("#lv-intro")).toBeVisible();
    await expect(f.locator("#lv-archive-card")).toBeHidden();
    expect((await rounds(request, p))[0].completed_at).toBeNull();
    await context.setOffline(false);
    expect(w.errors).toEqual([]);
    await page.close();

    page = await context.newPage();
    const w2 = watch(page, "after reload");
    f = await signIn(page, p);
    await startGame(page, f);
    await useCabinet(page, f);
    await expectServerIntro(f);
    const resumed = await rounds(request, p);
    expect(resumed).toHaveLength(1);
    expect([resumed[0].id, resumed[0].presented_at, resumed[0].presented_request_id, resumed[0].completed_at])
      .toEqual([shown[0].id, shown[0].presented_at, shown[0].presented_request_id, null]);
    await workThroughCards(page, f);
    await expect(f.locator("#lv-intro")).toBeHidden({ timeout: 30_000 });
    await fillArchiveCard(f);
    await expectPracticeTask(f);
    const done = await rounds(request, p);
    expect(done).toHaveLength(1);
    expect(done[0].completed_at).not.toBeNull();
    expect(await instances(request, p)).toHaveLength(1);
    expect(await rewardState(request, p)).toEqual(start);
    expect(w2.errors).toEqual([]);
  } finally {
    await context.close();
  }
});

// ── Rollback risk: the host's introductions OFF while the backend still serves them ─────────────────────────────
test("rollback in the WRONG order (host introductions OFF, backend still ON): bridge/2, the game's local introduction, then an explicit error instead of a task — never silent, nothing registered or paid", async ({ page, request, browserName }) => {
  test.setTimeout(300_000);
  // This is why the documented rollback order is backend flag OFF first, host OFF second: get-next-question does not
  // know the host's capability. The backend flag cannot be switched inside one lane (the functions are served once),
  // so the safe order itself is covered by the archive prototype's trial, not here.
  await harness.close();
  harness = await startHarness({ ...HARNESS, introductions: false });
  try {
    const p = await makePupil(request, "rollback", browserName);
    const start = await rewardState(request, p);
    watch(page, "rollback");
    const f = await signIn(page, p);
    await startGame(page, f);
    await useCabinet(page, f);
    const view = f.locator("#lv-intro");
    await expect(view).toBeVisible({ timeout: 30_000 });
    await expect(view, "a bridge/2 session: the game's own cards").toHaveAttribute("data-source", "local");
    for (let i = 0; i < 3; i++) await f.locator("#lv-intro-next").click();
    await f.locator('#lv-intro [data-check="0"]').click();
    await f.locator("#lv-intro-next").click();
    await expect(view).toBeHidden();
    await fillArchiveCard(f);
    await expect(f.locator("#lv-task")).toHaveAttribute("data-state", "error", { timeout: 60_000 });
    await expect(f.locator("#lv-status")).toContainText("Ingen opgave lige nu");
    const rs = await rounds(request, p);
    expect(rs.length).toBeLessThanOrEqual(1);
    for (const r of rs) expect([r.presented_at, r.completed_at], "an introduction the host cannot show is never registered as shown or done").toEqual([null, null]);
    expect(await instances(request, p)).toEqual([]);
    expect(await rewardState(request, p)).toEqual(start);
  } finally {
    await harness.close();
    harness = await startHarness({ ...HARNESS, introductions: true });
  }
});
