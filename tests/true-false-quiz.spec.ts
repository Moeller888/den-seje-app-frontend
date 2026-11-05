// Sandt/falsk (F-02) in the REAL quiz — index.html + app.js + js/true-false.js — offline.
// FULLY FIXTURE-INTERCEPTED like tests/number-answer-ui.spec.ts: a local static server serves this
// checkout, and every *.supabase.co call is answered from fixtures, so no request reaches a real backend
// and no test pupil is touched. get-next-question serves true_false statements one after another; every
// process-event POST is recorded with its body, and the reply is chosen per test.
//
// tests/true-false-ui.spec.ts proves the control on its demo page. This file proves that the control
// works inside the quiz's state machine (AWAITING_ANSWER → SUBMITTING_ANSWER → TRANSITIONING/REFLECTING →
// LOADING_QUESTION → AWAITING_ANSWER) on desktop, tablet and phone sizes:
//   - a right answer: the option text is sent once, "Ja! 🎯", and the next statement arrives answerable;
//   - a wrong answer: the quiz's correction ("Svaret er …"), or — with an explanation — the reflection
//     panel led by the right judgement ("Udsagnet er sandt."), then "Videre" to the next statement;
//   - a failed send hands the answer back and it can be given again;
//   - a second click while the answer is on its way sends nothing;
//   - the page itself never writes XP, coins or progress: the only answer request is process-event.
// Grading and rewards are proven in tests/unit/true-false-grading.test.mjs (PGlite, real functions).
import { test, expect, Route, Page } from "@playwright/test";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REF = "tjzbehwfagiwpwodsgwg";

const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".svg": "image/svg+xml", ".css": "text/css", ".webp": "image/webp",
  ".png": "image/png", ".json": "application/json",
};

let server: http.Server;
let baseUrl: string;

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    try {
      const p = decodeURIComponent((req.url || "/").split("?")[0]);
      const fp = path.normalize(path.join(ROOT, p === "/" ? "/index.html" : p));
      if (!fp.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      const data = fs.readFileSync(fp);
      res.writeHead(200, { "content-type": MIME[path.extname(fp).toLowerCase()] || "application/octet-stream" });
      res.end(data);
    } catch { res.writeHead(404); res.end("nf"); }
  });
  await new Promise<void>((r) => server.listen(0, r));
  baseUrl = `http://localhost:${(server.address() as any).port}`;
});

test.afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); });

const UID = "00000000-0000-4000-8000-000000000001";
const IDENTITY = { v: 1, body_type: "neutral", skin_tone: "medium", hairstyle: "tousled", hair_color: "brown", chosen_at: "2026-06-01T00:00:00Z" };
const USER = { id: UID, aud: "authenticated", role: "authenticated", email: "n@e.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
function jwt() { const b = (o: any) => Buffer.from(JSON.stringify(o)).toString("base64url"); return b({ alg: "HS256", typ: "JWT" }) + "." + b({ sub: UID, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 2592000 }) + ".s"; }
const SESSION = { access_token: jwt(), token_type: "bearer", expires_in: 2592000, expires_at: Math.floor(Date.now() / 1000) + 2592000, refresh_token: "f", user: USER };
const PROFILE = { id: UID, role: "student", name: "N", email: "n@e.com", equipped_slots: {}, active_title: null, active_theme: null, avatar_gender: "neutral", avatar_identity: IDENTITY, grade: 5, selected_grade: 5, placement_band: 2, current_band: 2, xp: 420, coins: 120 };
const PROGRESS = { student_id: UID, xp: 420, coins: 120, current_streak: 3, longest_streak: 7, correct_answers: 42 };
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS" };
const today = new Date().toISOString().slice(0, 10);

// The statements served in order (the last one repeats). Keys live only in this fixture's replies.
const STATEMENTS = [
  "Danmark erklærede Tyskland krig den 9. april 1940.",
  "Jorden bevæger sig rundt om Solen.",
  "Grundloven blev underskrevet i 1849.",
];
const question = (i: number) => ({
  step: "question",
  question_instance_id: `tf${i}`,
  answer_format: "true_false",
  answer_type: "short",
  subject: "Historie",
  content: { question: STATEMENTS[Math.min(i, STATEMENTS.length - 1)] },
});

type Reply = { status: number; body: any };
type Harness = { page: Page; answers: string[]; served: () => number; writes: string[]; release: () => void };

// reply(n): the process-event reply for the n-th answer (0-based). holdAnswer: the first process-event
// reply waits for release() — the answer is "on its way".
async function openQuiz(browser: any, viewport: { width: number; height: number }, reply: (n: number) => Reply,
  { holdAnswer = false, hasTouch = false } = {}): Promise<Harness> {
  const ctx = await browser.newContext({ viewport, hasTouch });
  const answers: string[] = [];
  const writes: string[] = [];
  let questionsServed = 0;
  let release = () => {};
  const held = new Promise<void>((r) => { release = r; });

  await ctx.route("**://*.supabase.co/**", async (route: Route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const p = new URL(req.url()).pathname;
    const wo = ((req.headers()["accept"]) || "").includes("vnd.pgrst.object");
    const one = (o: any) => (wo ? o : [o]);
    const j = (b: any, status = 200) => route.fulfill({ status, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify(b) });
    // A direct write to the reward tables from the page would bypass the server's grading.
    if (/^\/rest\/v1\/(student_progress|profiles|question_instances|student_answers)/.test(p) && req.method() !== "GET") {
      writes.push(`${req.method()} ${p}`);
    }
    if (p.startsWith("/auth/v1/user")) return j(USER);
    if (p.startsWith("/auth/v1/token")) return j(SESSION);
    if (p.startsWith("/auth/v1/logout")) return route.fulfill({ status: 204, headers: CORS });
    if (p.startsWith("/functions/v1/get-next-question")) return j(question(questionsServed++));
    if (p.startsWith("/functions/v1/process-event")) {
      const body = req.postDataJSON() ?? {};
      const n = answers.length;
      answers.push(body.answer);
      if (holdAnswer && n === 0) await held;
      const r = reply(n);
      return j(r.body, r.status);
    }
    if (p.startsWith("/functions/v1/")) return j({});
    if (p.startsWith("/rest/v1/rpc/evaluate_achievements")) return j([]);
    if (p.startsWith("/rest/v1/rpc/")) return j(null);
    if (p.startsWith("/rest/v1/profiles")) return j(one(PROFILE));
    if (p.startsWith("/rest/v1/student_progress")) return j([PROGRESS]);
    if (p.startsWith("/rest/v1/daily_login_rewards")) return j(one({ student_id: UID, last_claimed_date: today }));
    if (p.startsWith("/rest/v1/shop_items")) return j([]);
    return j([]);
  });
  await ctx.addInitScript(([k, s]: [string, any]) => {
    localStorage.setItem(k, JSON.stringify(s));
  }, [`sb-${REF}-auth-token`, SESSION]);

  const page = await ctx.newPage();
  await page.goto(`${baseUrl}/index.html`);
  await expect(page.locator("#true-false button.true-false-option")).toHaveCount(2, { timeout: 15000 });
  return { page, answers, served: () => questionsServed, writes, release };
}

const opt = (page: Page, text: "Sandt" | "Falsk") =>
  page.locator("#true-false button.true-false-option", { hasText: text });

const CORRECT = (key: string): Reply => ({ status: 200, body: { status: "correct", correct_answer: key } });
const INCORRECT = (key: string, review_text: string | null = null): Reply =>
  ({ status: 200, body: { status: "incorrect", correct_answer: key, review_text } });

const VIEWPORTS = [
  { name: "computer", viewport: { width: 1280, height: 800 }, hasTouch: false },
  { name: "tablet", viewport: { width: 768, height: 1024 }, hasTouch: true },
  { name: "mobil", viewport: { width: 375, height: 667 }, hasTouch: true },
];

for (const v of VIEWPORTS) {
  test(`${v.name}: two large answers side by side, no horizontal overflow, labelled for a screen reader`, async ({ browser }) => {
    const { page, writes } = await openQuiz(browser, v.viewport, () => CORRECT("Falsk"), { hasTouch: v.hasTouch });
    await expect(page.locator("#question")).toContainText(STATEMENTS[0]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, "no horizontal scroll").toBeLessThanOrEqual(0);
    const a = await opt(page, "Sandt").boundingBox();
    const b = await opt(page, "Falsk").boundingBox();
    expect(a && b, "both answers are laid out").toBeTruthy();
    for (const box of [a!, b!]) {
      expect(box.height, "touch target height ≥ 44px").toBeGreaterThanOrEqual(44);
      expect(box.width, "touch target width ≥ 44px").toBeGreaterThanOrEqual(44);
      expect(box.x + box.width, "inside the viewport").toBeLessThanOrEqual(v.viewport.width);
    }
    expect(Math.abs(a!.y - b!.y), "side by side on one row").toBeLessThan(2);
    await expect(page.getByRole("group", { name: "Er udsagnet sandt eller falsk?" })).toBeVisible();
    for (const t of ["Sandt", "Falsk"] as const) {
      await expect(page.getByRole("button", { name: t, exact: true })).toHaveAttribute("aria-describedby", "question");
    }
    // Answer by the pointer the device has.
    if (v.hasTouch) await opt(page, "Falsk").tap(); else await opt(page, "Falsk").click();
    await expect(page.locator("#feedback")).toHaveText("Ja! 🎯");
    expect(writes, "the page writes no progress itself").toEqual([]);
    await page.context().close();
  });
}

test("right answer: sent once as the option text, \"Ja! 🎯\", then the next statement is answerable", async ({ browser }) => {
  const { page, answers, served, writes } = await openQuiz(browser, { width: 900, height: 700 },
    (n) => (n === 0 ? CORRECT("Falsk") : CORRECT("Sandt")));
  await opt(page, "Falsk").click();
  await expect(page.locator("#feedback")).toHaveText("Ja! 🎯");
  await expect(page.locator("#feedback")).toHaveClass("feedback-correct");
  // TRANSITIONING → LOADING_QUESTION → AWAITING_ANSWER: the second statement with fresh, enabled buttons.
  await expect(page.locator("#question")).toContainText(STATEMENTS[1], { timeout: 10000 });
  expect(served()).toBe(2);
  for (const t of ["Sandt", "Falsk"] as const) {
    await expect(opt(page, t)).toBeEnabled();
    await expect(opt(page, t)).toHaveAttribute("aria-pressed", "false");
  }
  expect(answers).toEqual(["Falsk"]);
  // The same control answers again on the next statement (a repeat round looks the same to the pupil).
  await opt(page, "Sandt").click();
  await expect.poll(() => answers).toEqual(["Falsk", "Sandt"]);
  await expect(page.locator("#question")).toContainText(STATEMENTS[2], { timeout: 10000 });
  expect(writes, "the page writes no progress itself").toEqual([]);
  await page.context().close();
});

test("wrong answer without an explanation: the quiz names the right answer and moves on", async ({ browser }) => {
  const { page, answers } = await openQuiz(browser, { width: 900, height: 700 }, () => INCORRECT("Falsk"));
  await opt(page, "Sandt").click();
  await expect(page.locator("#feedback")).toHaveText("Svaret er Falsk — husk det nu.");
  await expect(page.locator("#feedback")).toHaveClass("feedback-error");
  await expect(page.locator("#question")).toContainText(STATEMENTS[1], { timeout: 10000 });
  expect(answers).toEqual(["Sandt"]);
  await page.context().close();
});

test("wrong answer with an explanation: the reflection is led by the right judgement, then \"Videre\"", async ({ browser }) => {
  const why = "Danmark blev besat den 9. april 1940 og erklærede ikke krig.";
  const { page, answers } = await openQuiz(browser, { width: 900, height: 700 }, () => INCORRECT("Falsk", why));
  await opt(page, "Sandt").click();
  await expect(page.locator("#feedback")).toHaveText("Udsagnet er falsk.");
  await expect(page.locator("#review-feedback")).toHaveText(why);
  await expect(page.locator("#review-feedback")).toHaveClass(/visible/);
  const next = page.locator("#reflection-continue");
  await expect(next).toBeVisible();
  await expect(next).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#question")).toContainText(STATEMENTS[1], { timeout: 10000 });
  await expect(opt(page, "Sandt")).toBeEnabled();
  expect(answers).toEqual(["Sandt"]);
  await page.context().close();
});

test("a failed send hands the answer back: visible error, focus back, and it can be given again", async ({ browser }) => {
  const { page, answers } = await openQuiz(browser, { width: 900, height: 700 },
    (n) => (n === 0 ? { status: 500, body: { error: "boom" } } : CORRECT("Sandt")));
  await opt(page, "Sandt").click();
  await expect(page.locator("#feedback")).toHaveText("⚠️ Fejl ved svar – prøv igen");
  await expect(opt(page, "Sandt")).toBeEnabled();
  await expect(opt(page, "Falsk")).toBeEnabled();
  await expect(opt(page, "Sandt")).toHaveAttribute("aria-pressed", "false");
  await expect(opt(page, "Sandt")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#feedback")).toHaveText("Ja! 🎯");
  expect(answers).toEqual(["Sandt", "Sandt"]);
  await page.context().close();
});

test("a second click while the answer is on its way sends nothing", async ({ browser }) => {
  const { page, answers, release } = await openQuiz(browser, { width: 900, height: 700 }, () => CORRECT("Sandt"),
    { holdAnswer: true });
  await opt(page, "Sandt").click();
  await expect.poll(() => answers).toEqual(["Sandt"]);
  await expect(page.locator("#true-false")).toHaveAttribute("aria-busy", "true");
  await expect(opt(page, "Sandt")).toHaveAttribute("aria-pressed", "true");
  await opt(page, "Falsk").click({ force: true });
  await opt(page, "Sandt").click({ force: true });
  await page.waitForTimeout(300);
  expect(answers, "one answer, one request").toEqual(["Sandt"]);
  release();
  await expect(page.locator("#feedback")).toHaveText("Ja! 🎯");
  expect(answers).toEqual(["Sandt"]);
  await page.context().close();
});
