// F-01b — the number answer in the REAL quiz (index.html + app.js + js/number-answer.js), offline.
// FULLY FIXTURE-INTERCEPTED like avatar-r2-fallback.spec.ts: a local static server serves this checkout,
// and every *.supabase.co call is answered from fixtures, so no request reaches a real backend and no
// test pupil is touched. get-next-question serves one "number" question; every process-event POST is
// recorded with its body.
// Proven here: an empty field shows the Danish error and sends nothing; a Danish "1 849" is sent as
// "1849" via Enter and via the button; a repeated Enter while the answer is on its way sends once
// (submitAnswer's state machine + the control's in-flight guard). Parsing is pinned in
// tests/unit/number-answer.test.mjs.
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
const QUESTION = { step: "question", question_instance_id: "qn1", answer_format: "number", answer_type: "short", subject: "Historie", content: { question: "Hvilket år blev Danmarks Grundlov underskrevet?" } };
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS" };
const today = new Date().toISOString().slice(0, 10);

type Harness = { page: Page; answers: string[]; release: () => void };

// holdAnswer: process-event does not answer until release() — the answer is "on its way".
async function openQuiz(browser: any, { holdAnswer = false } = {}): Promise<Harness> {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 700 } });
  const answers: string[] = [];
  let release = () => {};
  const held = new Promise<void>((r) => { release = r; });

  await ctx.route("**://*.supabase.co/**", async (route: Route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const p = new URL(req.url()).pathname;
    const wo = ((req.headers()["accept"]) || "").includes("vnd.pgrst.object");
    const one = (o: any) => (wo ? o : [o]);
    const j = (b: any) => route.fulfill({ status: 200, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify(b) });
    if (p.startsWith("/auth/v1/user")) return j(USER);
    if (p.startsWith("/auth/v1/token")) return j(SESSION);
    if (p.startsWith("/auth/v1/logout")) return route.fulfill({ status: 204, headers: CORS });
    if (p.startsWith("/functions/v1/get-next-question")) return j(QUESTION);
    if (p.startsWith("/functions/v1/process-event")) {
      const body = req.postDataJSON() ?? {};
      answers.push(body.answer);
      if (holdAnswer) await held;
      return j({ status: "correct", correct_answer: "1849" });
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
  await expect(page.locator("#number-answer-input")).toBeVisible({ timeout: 15000 });
  return { page, answers, release };
}

test("empty field: the Danish error is shown, nothing is sent, and the pupil can correct and send", async ({ browser }) => {
  const { page, answers } = await openQuiz(browser);
  const input = page.locator("#number-answer-input");
  await page.locator("#options button.submit-btn", { hasText: "Svar" }).click();
  await expect(page.locator("#number-answer-hint")).toHaveText("Skriv et tal, før du sender.");
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await input.fill("   ");
  await input.press("Enter");
  await expect(page.locator("#number-answer-hint")).toHaveText("Skriv et tal, før du sender.");
  await input.fill("12,5");
  await input.press("Enter");
  await expect(page.locator("#number-answer-hint")).toHaveText("Svaret skal være et helt tal. Skriv det uden komma og decimaler.");
  await page.waitForTimeout(300);
  expect(answers, "an invalid field sends nothing").toEqual([]);
  await input.fill("1849");
  await expect(page.locator("#number-answer-hint")).toHaveText("");
  await input.press("Enter");
  await expect.poll(() => answers).toEqual(["1849"]);
  await page.context().close();
});

test("a valid Danish number via Enter is sent as the canonical integer", async ({ browser }) => {
  const { page, answers } = await openQuiz(browser);
  await page.locator("#number-answer-input").fill("1 849");
  await page.locator("#number-answer-input").press("Enter");
  await expect.poll(() => answers).toEqual(["1849"]);
  await page.context().close();
});

test("a valid number via the button is sent as the canonical integer", async ({ browser }) => {
  const { page, answers } = await openQuiz(browser);
  await page.locator("#number-answer-input").fill("1.849");
  await page.locator("#options button.submit-btn", { hasText: "Svar" }).click();
  await expect.poll(() => answers).toEqual(["1849"]);
  await page.context().close();
});

test("repeated Enter while the answer is on its way sends exactly once", async ({ browser }) => {
  const { page, answers, release } = await openQuiz(browser, { holdAnswer: true });
  const input = page.locator("#number-answer-input");
  await input.fill("-50");
  await input.press("Enter");
  await expect.poll(() => answers).toEqual(["-50"]);
  await input.press("Enter");
  await input.press("Enter");
  await page.locator("#options button.submit-btn", { hasText: "Svar" }).click({ force: true });
  await page.waitForTimeout(300);
  expect(answers, "one answer, one request").toEqual(["-50"]);
  release();
  await expect(page.locator("#feedback")).not.toHaveText("", { timeout: 10000 });
  expect(answers).toEqual(["-50"]);
  await page.context().close();
});
