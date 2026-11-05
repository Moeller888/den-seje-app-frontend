// Anti-gætte-pausen i quizzen — browserens opførsel (docs/quiz-anti-guess-cooldown.md).
//
// SELF-SERVED + FIXTURE-INTERCEPTED (samme mønster som avatar-r2-blink-frames.spec.ts): en lokal server
// leverer denne checkouts filer, og hvert *.supabase.co-kald besvares her. Ingen produktion, ingen delt
// testelev. Selve reglen (10 forkerte / 60 s → 120 s) og håndhævelsen ligger i databasen og bevises i
// tests/unit/quiz-anti-guess-cooldown-migration-run.test.mjs; her bevises, at browseren
//   * viser den godkendte tekst og ALDRIG antal fejl, tærskel eller vindue,
//   * tæller ned fra serverens tid (02:00 → 00:00) med Playwrights styrede ur — ingen 120 s i realtid,
//   * ikke kan snydes af et ændret systemur,
//   * viser den rigtige resttid efter genindlæsning og i en anden fane,
//   * låser "Fortsæt quizzen" til 00:00 og derefter henter næste spørgsmål,
//   * genkender både den nye 429 og process-event version 34's 500,
//   * passer på en smal mobilskærm og kan betjenes med tastatur.
import { test, expect, type Route, type BrowserContext, type Page } from "@playwright/test";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REF = "tjzbehwfagiwpwodsgwg";
const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript", ".svg": "image/svg+xml", ".css": "text/css", ".webp": "image/webp", ".png": "image/png", ".json": "application/json" };

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

const T0 = Date.parse("2026-11-05T12:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
const UID = "00000000-0000-4000-8000-0000000000c1";
const USER = { id: UID, aud: "authenticated", role: "authenticated", email: "c@e.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
function jwt() { const b = (o: any) => Buffer.from(JSON.stringify(o)).toString("base64url"); return b({ alg: "HS256", typ: "JWT" }) + "." + b({ sub: UID, role: "authenticated", exp: Math.floor(T0 / 1000) + 2592000 }) + ".s"; }
const SESSION = { access_token: jwt(), token_type: "bearer", expires_in: 2592000, expires_at: Math.floor(T0 / 1000) + 2592000, refresh_token: "f", user: USER };
const PROGRESS = { student_id: UID, xp: 420, coins: 120, current_streak: 3, longest_streak: 7, correct_answers: 42 };
const PROFILE = { id: UID, role: "student", name: "C", email: "c@e.com", equipped_slots: {}, active_title: null, active_theme: null, avatar_gender: "neutral", avatar_identity: { v: 1, body_type: "neutral", skin_tone: "medium", hairstyle: "tousled", hair_color: "brown", chosen_at: "2026-06-01T00:00:00Z" }, grade: 5, selected_grade: 5, placement_band: 2, current_band: 2, xp: 420, coins: 120 };
const QUESTION = (n: number) => ({ step: "question", question_instance_id: `q${n}`, answer_format: "mc", subject: "Historie", content: { question: `Spørgsmål nummer ${n}?`, options: ["Alfa", "Beta", "Gamma", "Delta"] } });
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS" };

// Den simulerede server: kun det, browseren kan se. `until` er pausens slut (serverens tid).
type Sim = { until: number | null; reply: "new" | "v34" | "ok" | "starts"; served: number; answers: number; statusCalls: number };
const sim = (): Sim => ({ until: null, reply: "new", served: 0, answers: 0, statusCalls: 0 });
// Serverens "nu" følger browserens styrede Date (begge starter i T0 og flyttes af page.clock).
let serverNow = () => T0;

function routeFor(s: Sim) {
  return async (route: Route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const p = new URL(req.url()).pathname;
    const wo = ((req.headers()["accept"]) || "").includes("vnd.pgrst.object");
    const one = (o: any) => (wo ? o : [o]);
    const j = (b: any, status = 200) => route.fulfill({ status, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify(b) });
    if (p.startsWith("/auth/v1/user")) return j(USER);
    if (p.startsWith("/auth/v1/token")) return j(SESSION);
    if (p.startsWith("/functions/v1/get-next-question")) { s.served++; return j(QUESTION(s.served)); }
    if (p.startsWith("/functions/v1/process-event")) {
      s.answers++;
      if (s.reply === "ok") return j({ status: "incorrect", correct_answer: "Alfa", review_text: null, misconception_type: null });
      // Det tiende forkerte svar: bedømt og vist normalt; serveren har samtidig startet pausen.
      if (s.reply === "starts") { s.until = serverNow() + 120_000; s.reply = "new"; return j({ status: "incorrect", correct_answer: "Alfa", review_text: null, misconception_type: null }); }
      if (s.reply === "v34") return j({ error: "quiz_cooldown_active" }, 500);
      return j({ outcome: "quiz_cooldown", error: "Quiz cooldown", cooldown_until: iso(s.until!), server_now: iso(serverNow()) }, 429);
    }
    if (p.startsWith("/functions/v1/")) return j({});
    if (p.startsWith("/rest/v1/rpc/get_my_quiz_cooldown")) {
      s.statusCalls++;
      const now = serverNow();
      const active = s.until !== null && s.until > now;
      return j({ active, ends_at: active ? iso(s.until!) : null, server_now: iso(now) });
    }
    if (p.startsWith("/rest/v1/rpc/evaluate_achievements")) return j([]);
    if (p.startsWith("/rest/v1/rpc/")) return j(null);
    if (p.startsWith("/rest/v1/profiles")) return j(one(PROFILE));
    if (p.startsWith("/rest/v1/student_progress")) return j([PROGRESS]);
    if (p.startsWith("/rest/v1/daily_login_rewards")) return j(one({ student_id: UID, last_claimed_date: "2026-11-05" }));
    return j([]);
  };
}

async function context(browser: any, s: Sim, viewport = { width: 900, height: 800 }): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport, reducedMotion: "reduce", hasTouch: viewport.width < 500 });
  await ctx.route("**://*.supabase.co/**", routeFor(s));
  await ctx.addInitScript(([k, v]: [string, any]) => { localStorage.setItem(k, JSON.stringify(v)); }, [`sb-${REF}-auth-token`, SESSION]);
  return ctx;
}
async function openQuiz(ctx: BrowserContext): Promise<Page> {
  const page = await ctx.newPage();
  await page.clock.install({ time: T0 });
  serverNow = () => T0;
  await page.goto(`${baseUrl}/index.html`);
  await expect(page.locator("#options button").first()).toBeVisible();   // quizzen er startet, ingen pause
  return page;
}
// Lad tiden gå på browserens styrede ur OG den simulerede servers ur.
async function pass(page: Page, ms: number) {
  const before = serverNow();
  serverNow = () => before + ms;
  await page.clock.runFor(ms);
}
const panel = (page: Page) => page.locator("#quiz-cooldown");
const timer = (page: Page) => page.locator("#quiz-cooldown-timer");
const cont = (page: Page) => page.locator("#quiz-cooldown-continue");
const option = (page: Page, text: string) => page.locator("#options button", { hasText: text });

test("et afvist svar viser den godkendte pause, tæller 02:00 → 00:00 og åbner så for quizzen", async ({ browser }) => {
  const s = sim();
  const ctx = await context(browser, s);
  const page = await openQuiz(ctx);
  await expect(option(page, "Beta")).toBeVisible();
  s.until = T0 + 120_000;
  await option(page, "Beta").click();

  await expect(panel(page)).toBeVisible();
  await expect(page.locator("#quiz-cooldown-title")).toHaveText("🧠 Hov, lidt for hurtigt!");
  await expect(page.locator("#quiz-cooldown-body")).toHaveText("Tag en lille tænkepause. Du kan snart fortsætte din læring!");
  await expect(page.locator("#quiz-cooldown-note")).toHaveText("Du mister ikke XP eller mønter i pausen.");
  await expect(cont(page)).toHaveText("Fortsæt quizzen");
  await expect(timer(page)).toHaveText("02:00");
  await expect(cont(page)).toBeDisabled();
  await expect(page.locator("#options")).toBeHidden();
  await expect(page.locator("#question")).toBeHidden();
  await expect(page.locator("#question")).toHaveAttribute("data-state", "cooldown");
  // Ingen mekanik: hverken antal, tærskel eller vindue nogen steder på siden.
  await expect(page.locator("body")).not.toContainText(/\b(10|60) (forkerte|sekunder)|af 10|forkerte svar/i);

  await pass(page, 30_000);
  await expect(timer(page)).toHaveText("01:30");
  await pass(page, 89_000);
  await expect(timer(page)).toHaveText("00:01");
  await expect(cont(page)).toBeDisabled();
  await cont(page).click({ force: true });          // en låst knap gør intet
  await expect(panel(page)).toBeVisible();

  await pass(page, 1_000);
  await expect(timer(page)).toHaveText("00:00");
  await expect(cont(page)).toBeEnabled();
  await expect(cont(page)).toBeFocused();            // tastatur: fokus flytter til knappen
  s.reply = "ok";
  await page.keyboard.press("Enter");
  await expect(panel(page)).toBeHidden();
  await expect(page.locator("#question")).toContainText("Spørgsmål nummer 2?");
  await expect(option(page, "Alfa")).toBeVisible();
  await ctx.close();
});

test("svaret, der starter pausen, vises normalt — og pausen følger med det samme, uden et nyt svar", async ({ browser }) => {
  const s = sim();
  s.reply = "starts";
  const ctx = await context(browser, s);
  const page = await openQuiz(ctx);
  const answersBefore = s.answers;
  await option(page, "Beta").click();
  await expect(page.locator("#feedback")).toContainText("Svaret er Alfa");   // det tiende svar behandles normalt
  await page.clock.runFor(2_500);                                           // feedbacktiden før næste spørgsmål
  await expect(panel(page)).toBeVisible();
  await expect(timer(page)).toHaveText("02:00");
  await expect(page.locator("#options")).toBeHidden();
  expect(s.answers - answersBefore, "ét svar; pausen kom uden et nyt").toBe(1);
  expect(s.served, "intet nyt spørgsmål hentes under pausen").toBe(1);
  await ctx.close();
});

test("et ændret systemur forlænger eller forkorter ikke pausen", async ({ browser }) => {
  const s = sim();
  const ctx = await context(browser, s);
  const page = await openQuiz(ctx);
  s.until = T0 + 120_000;
  await option(page, "Beta").click();
  await expect(timer(page)).toHaveText("02:00");
  await page.clock.setSystemTime(T0 + 3_600_000);    // uret stillet en time frem
  await page.clock.runFor(1_000);
  serverNow = () => T0 + 1_000;
  await expect(timer(page)).toHaveText("01:59");
  await expect(cont(page)).toBeDisabled();
  await page.clock.setSystemTime(T0 - 3_600_000);    // … og en time tilbage
  await page.clock.runFor(1_000);
  await expect(timer(page)).toHaveText("01:58");
  await ctx.close();
});

test("genindlæsning midt i pausen viser serverens resttid — ikke 02:00 igen", async ({ browser }) => {
  const s = sim();
  const ctx = await context(browser, s);
  const page = await openQuiz(ctx);
  s.until = T0 + 120_000;
  await option(page, "Beta").click();
  await expect(timer(page)).toHaveText("02:00");
  // Ny side 45 s senere (genindlæsning / ny fane / anden enhed). Uret hører til context'en, så den nye
  // side arver det; det er serverens tid i svaret, der bestemmer resttiden.
  await pass(page, 45_000);
  const later = await ctx.newPage();
  const answersBefore = s.answers;
  await later.goto(`${baseUrl}/index.html`);
  await expect(later.locator("#quiz-cooldown-timer")).toHaveText("01:15");
  await expect(later.locator("#quiz-cooldown-continue")).toBeDisabled();
  await expect(later.locator("#options")).toBeHidden();
  expect(s.answers, "intet svar sendes under pausen").toBe(answersBefore);
  await ctx.close();
});

test("en anden fane, der viser et spørgsmål, går selv i pause, når den første fane får en", async ({ browser }) => {
  const s = sim();
  const ctx = await context(browser, s);
  const a = await openQuiz(ctx);
  const b = await ctx.newPage();   // arver context'ens ur
  await b.goto(`${baseUrl}/index.html`);
  await expect(b.locator("#options button").first()).toBeVisible();
  s.until = T0 + 120_000;
  await option(a, "Beta").click();
  await expect(a.locator("#quiz-cooldown-timer")).toHaveText("02:00");
  // B fik kun en tom besked og spurgte selv serveren.
  await expect(b.locator("#quiz-cooldown")).toBeVisible();
  await expect(b.locator("#quiz-cooldown-timer")).toHaveText("02:00");
  await expect(b.locator("#options")).toBeHidden();
  await ctx.close();
});

test("process-event version 34 (500 med databasens besked) giver samme pause via serverens status", async ({ browser }) => {
  const s = sim();
  s.reply = "v34";
  const ctx = await context(browser, s);
  const page = await openQuiz(ctx);
  s.until = T0 + 90_000;
  const before = s.statusCalls;
  await option(page, "Beta").click();
  await expect(panel(page)).toBeVisible();
  await expect(timer(page)).toHaveText("01:30");
  expect(s.statusCalls).toBeGreaterThan(before);
  await expect(page.locator("#feedback")).not.toContainText("Fejl ved svar");
  await ctx.close();
});

test("uden pause (eller uden serverfunktionen) kører quizzen som før", async ({ browser }) => {
  const s = sim();
  s.reply = "ok";
  const ctx = await context(browser, s);
  await ctx.route("**/rest/v1/rpc/get_my_quiz_cooldown", (r: Route) => r.fulfill({ status: 404, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify({ code: "PGRST202", message: "not found" }) }));
  const page = await openQuiz(ctx);
  await option(page, "Beta").click();
  await expect(page.locator("#feedback")).toContainText("Svaret er Alfa");
  await expect(panel(page)).toHaveCount(0);
  await ctx.close();
});

test("smal mobilskærm: hele pausen er synlig uden vandret scroll, og knappen kan trykkes", async ({ browser }) => {
  const s = sim();
  const ctx = await context(browser, s, { width: 320, height: 640 });
  const page = await openQuiz(ctx);
  s.until = T0 + 120_000;
  await option(page, "Beta").tap();
  await expect(timer(page)).toHaveText("02:00");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  for (const id of ["#quiz-cooldown-title", "#quiz-cooldown-body", "#quiz-cooldown-timer", "#quiz-cooldown-continue", "#quiz-cooldown-note"]) {
    const box = await page.locator(id).boundingBox();
    expect(box, id).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  }
  const btn = await cont(page).boundingBox();
  expect(btn!.height).toBeGreaterThanOrEqual(44);   // touch-mål
  await pass(page, 120_000);
  await expect(cont(page)).toBeEnabled();
  s.reply = "ok";
  await cont(page).tap();
  await expect(page.locator("#question")).toContainText("Spørgsmål nummer 2?");
  await ctx.close();
});
