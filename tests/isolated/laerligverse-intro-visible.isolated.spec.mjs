// F11-B: the FIRST VISIBLE server-directed introduction, through a real pupil browser on the isolated stack (D-110).
//
//   pupil signs in on the REAL F3 host (loopback 127.0.0.1:4330) → the game iframe (127.0.0.1:4331) negotiates
//   laerligverse.bridge/3 → get-next-question (this commit's function, LAERLIGVERSE_INTRODUCTION=on in this lane only)
//   serves the introduction → the host sends ONLY the cards → the game's IntroView shows them as text → "shown" once
//   the first card is on screen → the pupil works through the cards with the keyboard → "done" → the server registers
//   it → the SAME decision point now gets the first guided-practice task.
//
// Nothing is intercepted: no route.fulfill / route.abort of any document, no local-network-access permission (F11-A:
// those, not the product, caused #664's "Failed to fetch"). The database is the oracle, read with the local service
// key by THIS test process only. Browser network evidence comes from Playwright's own request log of the page.
// The introduction pays nothing and is not evidence: "shown" and "done" are registrations, not learning (D-330).
//
// Runs only in the isolated introduction lane (REPLAY_PROFILE=introduction), in Chromium, Firefox and WebKit;
// tests/isolated/require-complete-run.mjs fails the lane if anything is skipped or missing.
import { test, expect } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { assertIsolated, SYNTHETIC_EMAIL_DOMAIN } from "./isolation-guard.mjs";
import { startHarness, HOST_ORIGIN, GAME_ORIGIN } from "./laerligverse-harness/serve-harness.mjs";

assertIsolated(process.env);

const LANE = process.env.REPLAY_PROFILE === "introduction";
const SUPA = process.env.ISOLATED_SUPABASE_URL.replace(/\/+$/, "");
const ANON = process.env.ISOLATED_SUPABASE_ANON_KEY;
const SERVICE = process.env.ISOLATED_SUPABASE_SERVICE_KEY;
const RUN = (process.env.GITHUB_RUN_ID || "local") + "-" + (process.env.GITHUB_RUN_ATTEMPT || "1");
const svc = { apikey: SERVICE, authorization: `Bearer ${SERVICE}` };
const json = { "content-type": "application/json" };
const INTRO = JSON.parse(readFileSync(new URL("./fixtures/kildekritik-introduction.json", import.meta.url), "utf8"));
const ITEMS = JSON.parse(readFileSync(new URL("./fixtures/kildekritik-questions.json", import.meta.url), "utf8"));
const CARDS = INTRO.content.cards;
// Its own objective: neither the sequence specs (no introduction) nor #664's API chain (…_intro_e2e) share it.
const OBJECTIVE = `${INTRO.learning_objective}_intro_visible`;
const SOURCE = ITEMS.find((r) => r.learning_step === "guided_practice");
const PRACTICE = { ...SOURCE, content: { ...SOURCE.content, question: `${SOURCE.content.question} (synlig introduktion, testkopi)` } };
const CONTEXT_OF_STEP = Object.fromEntries(ITEMS.map((r) => [r.learning_step, r.step]));

test.describe.configure({ mode: "serial" });
test.beforeEach(() => {
  test.skip(!LANE, "runs only in the isolated introduction lane (REPLAY_PROFILE=introduction); require-complete-run.mjs fails that lane if it does not run");
});

let harness;
test.beforeAll(async ({ request }) => {
  if (!LANE) return;
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
        metadata: { domain: OBJECTIVE, concepts: ["kildekritik"], cognitive_skill: "analysis", synthetic: true, fixture: "F11-B", learning_step: "guided_practice" },
        target_grade: 8, difficulty_band: 3,
      }],
    });
    expect(ins.status(), await ins.text()).toBe(201);
  }
  harness = await startHarness({
    host: "f3", supabaseUrl: SUPA, anonKey: ANON, objectiveMap: { "hist.besaettelsen.h4": OBJECTIVE }, h5: true,
    sequence: true, stepContexts: CONTEXT_OF_STEP, introductions: true,
  });
});
test.afterAll(async () => {
  await harness?.close();
});

async function makePupil(request, label, browserName) {
  const tag = `${label}-${browserName}-${RUN}`.replace(/[^A-Za-z0-9-]/g, "");
  const email = `introvis-${tag}@${SYNTHETIC_EMAIL_DOMAIN}`;
  const password = createHash("sha256").update(`isolated-introvis:${tag}`).digest("base64url");
  const created = await request.post(`${SUPA}/auth/v1/admin/users`, { headers: svc, data: { email, password, email_confirm: true } });
  expect(created.status()).toBe(200);
  const id = (await created.json()).id;
  const profile = await request.post(`${SUPA}/rest/v1/profiles`, {
    headers: { ...svc, ...json, prefer: "return=minimal" },
    data: { id, role: "student", full_name: `Syntetisk F11-B-elev ${label}`, selected_grade: 8, active_domains: [OBJECTIVE], equipped_slots: {}, active_theme: "default" },
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
const rounds = (request, p) => rows(request, `introduction_rounds?select=id,served_at,presented_at,presented_request_id,completed_at,completion_request_id&student_id=eq.${p.id}`);
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

/** The browser's OWN requests to the Edge Functions (all frames), and any that failed. */
function trackNetwork(page) {
  const seen = [];
  const failed = [];
  page.on("request", (r) => {
    const u = r.url();
    if (u.startsWith(`${SUPA}/functions/v1/`) && r.method() === "POST") seen.push(u.split("/functions/v1/")[1].split("?")[0]);
  });
  page.on("requestfailed", (r) => {
    if (r.url().startsWith(SUPA)) failed.push(`${r.url()} ${r.failure()?.errorText ?? ""}`);
  });
  return { seen, failed };
}

async function signIn(page, p) {
  await page.goto(`${HOST_ORIGIN}/`);
  await page.locator("#lv-email").fill(p.email);
  await page.locator("#lv-password").fill(p.password);
  await page.locator("#lv-login-submit").click();
  await expect(page.locator("body")).toHaveAttribute("data-session", "active");
  const f = page.frameLocator("#lv-game");
  await expect(f.locator("body")).toHaveAttribute("data-bridge", "ready", { timeout: 30_000 });
  return f;
}
const gameFrame = (page) => page.frames().find((fr) => fr.url().startsWith(GAME_ORIGIN));

/** Opens the decision point; the server's introduction must appear with card 1 of the approved content. */
async function openIntroduction(f) {
  await f.locator("#use-cabinet").click();
  await expect(f.locator("body")).toHaveAttribute("data-intro", "open", { timeout: 30_000 });
  const view = f.locator("#lv-intro");
  await expect(view).toBeVisible();
  await expect(view).toHaveAttribute("data-source", "server");
  await expect(view).toHaveAttribute("data-cards", String(CARDS.length));
  await expect(f.locator("#lv-intro-body .lv-card-title")).toHaveText(CARDS[0].title);
  await expect(f.locator('#lv-intro-body [data-card="0"]')).toHaveText(CARDS[0].text);
  return view;
}

test("a pupil sees the server's introduction in the game, works through it with the keyboard, and gets the first guided-practice task — registered once, paid nothing", async ({ page, request, browserName }) => {
  test.setTimeout(180_000);
  const p = await makePupil(request, "main", browserName);
  const start = await rewardState(request, p);
  const unchanged = async (label) => expect(await rewardState(request, p), `${label}: no XP, coins, mastery, level, streak, attempt or event`).toEqual(start);
  const net = trackNetwork(page);

  // 1–6. Sign-in, bridge/3, the server's introduction with the approved content, card 1 first.
  let f = await signIn(page, p);
  await openIntroduction(f);
  // 8. "Shown" — reported once card 1 was on screen, registered by the server in its own time.
  await expect(f.locator("body")).toHaveAttribute("data-intro-shown", "recorded", { timeout: 30_000 });
  let rs = await rounds(request, p);
  expect(rs).toHaveLength(1);
  const first = rs[0];
  expect(first.presented_at).not.toBeNull();
  expect(first.completed_at).toBeNull();
  expect(Date.parse(first.presented_at)).toBeGreaterThanOrEqual(Date.parse(first.served_at));
  expect(await instances(request, p), "an introduction is not a task").toEqual([]);
  await unchanged("introduction shown");

  // 9. A reload of the GAME mid-introduction: the server resumes the SAME round; "shown" never moves.
  await page.evaluate(() => { const fr = document.getElementById("lv-game"); fr.src = `${fr.src}&reload=intro`; });
  await expect(f.locator("body")).toHaveAttribute("data-bridge", "ready", { timeout: 30_000 });
  await openIntroduction(f);
  await expect(f.locator("body")).toHaveAttribute("data-intro-shown", "recorded", { timeout: 30_000 });
  // A reload of the whole HOST page and a NEW sign-in (a new login session): still the same round, same first report.
  await page.reload();
  f = await signIn(page, p);
  await openIntroduction(f);
  await expect(f.locator("body")).toHaveAttribute("data-intro-shown", "recorded", { timeout: 30_000 });
  rs = await rounds(request, p);
  expect(rs).toHaveLength(1);
  expect([rs[0].id, rs[0].presented_at, rs[0].presented_request_id]).toEqual([first.id, first.presented_at, first.presented_request_id]);

  // 6–7. The cards in the server's order, with the real controls, by keyboard only (focus is on the control).
  for (let i = 0; i < CARDS.length; i++) {
    await expect(f.locator(`#lv-intro-body [data-card="${i}"]`)).toHaveText(CARDS[i].text);
    await expect(f.locator("#lv-intro-body .lv-card-title")).toHaveText(CARDS[i].title);
    await expect(f.locator("#lv-intro-progress")).toHaveText(`Kort ${i + 1} af ${CARDS.length}`);
    const next = f.locator("#lv-intro-next");
    await expect(next).toBeFocused();
    await expect(next).toHaveText(i === CARDS.length - 1 ? "Afslut introduktionen" : "Videre");
    await page.keyboard.press("Enter");
  }

  // 10–11. "Done" registered once; then the SAME decision point shows the first guided-practice task.
  await expect(f.locator("body")).toHaveAttribute("data-intro-done", "recorded", { timeout: 30_000 });
  await expect(f.locator("body")).toHaveAttribute("data-intro", "done");
  await expect(f.locator("#lv-intro")).toBeHidden();
  await expect(f.locator("body")).toHaveAttribute("data-task", "open", { timeout: 30_000 });
  await expect(f.locator("#prompt")).toHaveText(PRACTICE.content.question);
  rs = await rounds(request, p);
  expect(rs).toHaveLength(1);
  expect(rs[0].completed_at).not.toBeNull();
  expect(rs[0].completion_request_id).not.toBeNull();
  expect(Date.parse(rs[0].completed_at)).toBeGreaterThanOrEqual(Date.parse(rs[0].presented_at));
  expect(rs[0].presented_at).toBe(first.presented_at);
  const inst = await instances(request, p);
  expect(inst).toHaveLength(1);
  expect(inst[0].answered).toBe(false);
  // 12. Nothing paid, levelled or recorded as an attempt by the introduction.
  await unchanged("introduction completed, task served");

  // 13. Another pupil cannot touch this round (the server answers a foreign round like an unknown one).
  const other = await makePupil(request, "other", browserName);
  const t = await request.post(`${SUPA}/auth/v1/token?grant_type=password`, { headers: { apikey: ANON }, data: { email: other.email, password: other.password } });
  const otherToken = (await t.json()).access_token;
  for (const action of ["presented", "completed"]) {
    const r = await request.post(`${SUPA}/functions/v1/introduction-progress`, { headers: { apikey: ANON, authorization: `Bearer ${otherToken}`, ...json }, data: { action, round_id: rs[0].id, request_id: randomUUID() } });
    expect(r.status(), `a foreign ${action}`).toBe(404);
  }
  expect(await rounds(request, p)).toEqual(rs);

  // The game received the cards and the task — never a token, a key, the round id or the content hash.
  const received = (await gameFrame(page).evaluate(() => window.__lvReceived())).join("\n");
  expect(received).toContain('"type":"intro.present"');
  expect(received).toContain('"protocol":"laerligverse.bridge/3"');
  for (const secret of ["eyJ", "Bearer", "access_token", ANON, rs[0].id, "content_sha256", "introduction_round_id", '"correct"', "accepted_answers"]) {
    expect(received, `the game saw ${secret}`).not.toContain(secret);
  }

  // 14. The BROWSER itself talked to the server: serve, shown, done and the task — and no request failed.
  expect(net.seen.filter((x) => x === "get-next-question").length).toBeGreaterThanOrEqual(4);
  expect(net.seen.filter((x) => x === "introduction-progress").length).toBeGreaterThanOrEqual(2);
  expect(net.failed, "no browser request to the stack failed").toEqual([]);

  // Only a real answer moves progression, by the existing rules — once.
  const correct = PRACTICE.content.correct;
  const opts = await f.locator("#options button").evaluateAll((bs) => bs.map((b) => ({ id: b.dataset.option, label: b.textContent })));
  await f.locator(`#options [data-option="${opts.find((o) => o.label === correct).id}"]`).click();
  await f.locator("#commit").click();
  await expect(f.locator("body")).toHaveAttribute("data-task", "correct", { timeout: 30_000 });
  const at = await attempts(request, p);
  expect(at).toHaveLength(1);
  expect(at[0]).toMatchObject({ status: "correct" });
  const after = (await rows(request, `student_progress?select=xp,coins&student_id=eq.${p.id}`))[0];
  expect(after.xp - start.progress[0].xp).toBe(at[0].xp_awarded);
  expect(after.coins - start.progress[0].coins).toBe(at[0].coins_awarded);
});

test("two tabs of the same pupil: one round, the first 'shown' and the first 'done' stand; the other tab moves on without a second registration", async ({ browser, request, browserName }) => {
  test.setTimeout(180_000);
  const p = await makePupil(request, "tabs", browserName);
  const start = await rewardState(request, p);
  const context = await browser.newContext();
  try {
    const a = await context.newPage();
    const b = await context.newPage();
    const fa = await signIn(a, p);
    const fb = await signIn(b, p);
    await openIntroduction(fa);
    await openIntroduction(fb);
    await expect(fa.locator("body")).toHaveAttribute("data-intro-shown", "recorded", { timeout: 30_000 });
    await expect(fb.locator("body")).toHaveAttribute("data-intro-shown", "recorded", { timeout: 30_000 });
    const shown = await rounds(request, p);
    expect(shown).toHaveLength(1);

    const finish = async (page, f) => {
      for (let i = 0; i < CARDS.length; i++) await f.locator("#lv-intro-next").click();
      await expect(f.locator("body")).toHaveAttribute("data-intro-done", "recorded", { timeout: 30_000 });
      await expect(f.locator("body")).toHaveAttribute("data-task", "open", { timeout: 30_000 });
    };
    await finish(a, fa);
    const done = await rounds(request, p);
    expect(done[0].completed_at).not.toBeNull();
    await finish(b, fb);
    const after = await rounds(request, p);
    expect(after).toHaveLength(1);
    expect([after[0].presented_at, after[0].presented_request_id, after[0].completed_at, after[0].completion_request_id])
      .toEqual([shown[0].presented_at, shown[0].presented_request_id, done[0].completed_at, done[0].completion_request_id]);
    // Both tabs got the pupil's ONE open task (one open instance per pupil), and nothing was paid.
    expect(await instances(request, p)).toHaveLength(1);
    expect(await rewardState(request, p)).toEqual(start);
  } finally {
    await context.close();
  }
});
