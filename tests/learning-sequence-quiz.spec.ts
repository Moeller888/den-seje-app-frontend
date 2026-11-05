// The Grundloven 1849 learning sequence in the REAL quiz — index.html + app.js + js/stimulus.js +
// js/order-items.js — offline. Fixture-intercepted like tests/stimulus-quiz.spec.ts: a local static server
// serves this checkout, every *.supabase.co call is answered from fixtures, no real backend is reached.
//
// get-next-question serves tools/stimulus/examples/grundloven-1849-forloeb.json step by step, each payload
// built by the REAL _shared/question-dto.ts toPublicQuestion (the order step with a fixed instance key);
// process-event plays the server with the REAL _shared/order-items.ts canonicalOrderAnswer and the MC
// choice comparison.
//
// Proven (computer, tablet, phone): introduction (image) → source comprehension (number) → the year
// (number) → timeline (Rækkefølge, no years in the items) → application (MC on § 35) → repetition (number)
// end to end; the order control by keyboard and by touch, its live announcements, 44 px targets, no
// overflow; the correct order never in the payload; a wrong order explained in the shown texts (with and
// without an explanation); a second Svar while sending is not sent; a failed send hands the order back.
import { test, expect, Route, Page } from "@playwright/test";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { toPublicQuestion } from "../supabase/functions/_shared/question-dto.ts";
import { canonicalOrderAnswer } from "../supabase/functions/_shared/order-items.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REF = "tjzbehwfagiwpwodsgwg";
const SEQ = JSON.parse(fs.readFileSync(path.join(ROOT, "tools", "stimulus", "examples", "grundloven-1849-forloeb.json"), "utf8"));
const STEPS: any[] = SEQ.steps;
const ORDER_KEY = "2,0,3,1"; // rank 0 shown at position 2, rank 1 at 0, rank 2 at 3, rank 3 at 1

const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".svg": "image/svg+xml",
  ".css": "text/css", ".webp": "image/webp", ".png": "image/png", ".json": "application/json",
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
const PROFILE = { id: UID, role: "student", name: "N", email: "n@e.com", equipped_slots: {}, active_title: null, active_theme: null, avatar_gender: "neutral", avatar_identity: IDENTITY, grade: 7, selected_grade: 7, placement_band: 2, current_band: 2, xp: 420, coins: 120 };
const PROGRESS = { student_id: UID, xp: 420, coins: 120, current_streak: 3, longest_streak: 7, correct_answers: 42 };
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS" };
const today = new Date().toISOString().slice(0, 10);
const strip = (s: string) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

type Row = { answer_format: string; answer_type: string; content: any };
type Opts = { hasTouch?: boolean; failFirst?: boolean; holdFirst?: boolean; noReview?: boolean };
type Harness = { page: Page; answers: string[]; payloads: string[]; release: () => void };

async function openQuiz(browser: any, viewport: { width: number; height: number }, rows: Row[], o: Opts = {}): Promise<Harness> {
  const ctx = await browser.newContext({ viewport, hasTouch: !!o.hasTouch });
  const answers: string[] = [];
  const payloads: string[] = [];
  let n = 0;
  let current: Row = rows[0];
  let release = () => {};
  const held = new Promise<void>((r) => { release = r; });

  await ctx.route("**://*.supabase.co/**", async (route: Route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const p = new URL(req.url()).pathname;
    const wo = ((req.headers()["accept"]) || "").includes("vnd.pgrst.object");
    const one = (x: any) => (wo ? x : [x]);
    const j = (b: any, status = 200) => route.fulfill({ status, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify(b) });
    if (p.startsWith("/auth/v1/user")) return j(USER);
    if (p.startsWith("/auth/v1/token")) return j(SESSION);
    if (p.startsWith("/auth/v1/logout")) return route.fulfill({ status: 204, headers: CORS });
    if (p.startsWith("/functions/v1/get-next-question")) {
      current = rows[Math.min(n, rows.length - 1)];
      const key = current.answer_format === "order" ? ORDER_KEY : undefined;
      const body = { step: "question", question_instance_id: `ls${n}`, answer_format: current.answer_format, answer_type: current.answer_type,
        subject: "Historie", ...toPublicQuestion(current.content, current.answer_format, null, key) };
      n++;
      payloads.push(JSON.stringify(body));
      return j(body);
    }
    if (p.startsWith("/functions/v1/process-event")) {
      const body = req.postDataJSON() ?? {};
      const k = answers.length;
      answers.push(body.answer);
      if (o.holdFirst && k === 0) await held;
      if (o.failFirst && k === 0) return j({ error: "boom" }, 500);
      const review = o.noReview ? null : (current.content.review_text ?? null);
      if (current.answer_format === "order") {
        const canonical = canonicalOrderAnswer(body.answer, ORDER_KEY);
        if (canonical === null) return j({ status: "invalid", error: "Sæt alle elementer i rækkefølge, før du sender." }, 400);
        const ok = strip(canonical) === strip(ORDER_KEY);
        return j({ status: ok ? "correct" : "incorrect", correct_answer: ORDER_KEY, review_text: ok ? null : review });
      }
      const key = String(current.content.correct);
      const ok = strip(body.answer) === strip(key);
      return j({ status: ok ? "correct" : "incorrect", correct_answer: key, review_text: ok ? null : review });
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
  await ctx.addInitScript(([k, s]: [string, any]) => { localStorage.setItem(k, JSON.stringify(s)); }, [`sb-${REF}-auth-token`, SESSION]);
  const page = await ctx.newPage();
  await page.goto(`${baseUrl}/index.html`);
  await expect(page.locator("#question")).not.toHaveText(/Indlæser/, { timeout: 15000 });
  return { page, answers, payloads, release };
}

const ORDER_STEP = STEPS.find((s) => s.row.answer_format === "order");
const ITEMS: string[] = ORDER_STEP.row.content.items;
const shown = (page: Page) => page.locator("#order-items .order-item .order-text").allTextContents();
const itemRow = (page: Page, text: string) => page.locator("#order-items .order-item", { has: page.locator(".order-text", { hasText: text }) });

// Put the items in the correct order with the ▲ buttons (selection by moving each item up into place).
async function solveOrder(page: Page, how: "keyboard" | "tap" | "click") {
  for (let target = 0; target < ITEMS.length; target++) {
    for (let guard = 0; guard < 6; guard++) {
      const now = await shown(page);
      const at = now.indexOf(ITEMS[target]);
      if (at === target) break;
      const up = itemRow(page, ITEMS[target]).locator("button.order-up");
      if (how === "keyboard") { await up.focus(); await page.keyboard.press("Enter"); }
      else if (how === "tap") await up.tap();
      else await up.click();
      await expect(page.locator("#order-items .order-live")).toHaveText(`${ITEMS[target]} er nu nummer ${at} af ${ITEMS.length}`);
    }
  }
  expect(await shown(page)).toEqual(ITEMS);
}

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "no horizontal scroll").toBeLessThanOrEqual(0);
}

const VIEWPORTS = [
  { name: "computer", viewport: { width: 1280, height: 800 }, hasTouch: false, how: "keyboard" as const },
  { name: "tablet", viewport: { width: 768, height: 1024 }, hasTouch: true, how: "tap" as const },
  { name: "mobil", viewport: { width: 375, height: 667 }, hasTouch: true, how: "tap" as const },
];

for (const v of VIEWPORTS) {
  test(`${v.name}: hele forløbet — introduktion → kilde → årstal → tidslinje → anvendelse → repetition`, async ({ browser }) => {
    test.slow(); // six questions with the quiz's own transition delays
    const { page, answers, payloads } = await openQuiz(browser, v.viewport, STEPS.map((s) => s.row), { hasTouch: v.hasTouch });
    const press = async (sel: string) => (v.hasTouch ? page.locator(sel).first().tap() : page.locator(sel).first().click());
    const option = (text: string) => `#options button:has-text("${text}")`;
    const number = async (value: string) => { await page.locator("#options input").fill(value); await page.locator("#options input").press("Enter"); };
    const ok = async () => expect(page.locator("#feedback")).toHaveText("Ja! 🎯", { timeout: 10000 });

    // 1. Introduction: the image with its alt text, then MC.
    await expect(page.locator("#stimulus figure.stimulus-kind-image img")).toHaveAttribute("alt", STEPS[0].row.content.stimulus.alt);
    await press(option("Enevælde")); await ok();
    // 2. Source comprehension.
    await expect(page.locator("#stimulus blockquote")).toContainText("naar han har fyldt sit 30te Aar", { timeout: 10000 });
    await number("30"); await ok();
    // 3. The year, without the stimulus (cleared).
    await expect(page.locator("#question")).toContainText(STEPS[2].row.content.question, { timeout: 10000 });
    await expect(page.locator("#stimulus")).toBeHidden();
    await number("1849"); await ok();
    // 4. Timeline: a short source, then the order control.
    await expect(page.locator("#order-items")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("#stimulus .stimulus-title")).toHaveText("Kvinderne måtte vente");
    await expect(page.locator("#order-items .order-instructions")).toHaveText("Sæt begivenhederne i den rækkefølge, de skete. Det første øverst.");
    await expect(page.getByRole("list", { name: "Sæt begivenhederne i den rækkefølge, de skete. Det første øverst." })).toBeVisible();
    expect(await shown(page), "shown shuffled, never already solved").not.toEqual(ITEMS);
    for (const b of await page.locator("#order-items button.order-move").all()) {
      const box = await b.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    await noOverflow(page);
    await solveOrder(page, v.how);
    await press("#order-items button.order-submit"); await ok();
    // 5. Application on § 35.
    await expect(page.locator("#question")).toContainText("Brug § 35", { timeout: 10000 });
    await press(option("Hans, 45 år")); await ok();
    // 6. Repetition: two anchors recalled and connected.
    await expect(page.locator("#question")).toContainText(STEPS[5].row.content.question, { timeout: 10000 });
    await number("66"); await ok();

    expect(answers).toEqual(["Enevælde", "30", "1849", "[2,0,3,1]", STEPS[4].row.content.correct, "66"]);
    // The order payload holds the shown texts only: never the authored (correct) order, key or explanation.
    const orderPayload = payloads[3];
    expect(orderPayload.includes(JSON.stringify(ITEMS))).toBe(false);
    for (const leak of ['"correct"', '"review_text"', ORDER_KEY, '"accepted_answers"']) expect(orderPayload.includes(leak), leak).toBe(false);
    await page.context().close();
  });
}

const ORDER_ONLY: Row[] = [ORDER_STEP.row, STEPS[2].row];

test("a wrong order without an explanation: the correct order in the shown texts, never the key", async ({ browser }) => {
  const { page, answers } = await openQuiz(browser, { width: 900, height: 700 }, ORDER_ONLY, { noReview: true });
  await page.locator("#order-items button.order-submit").click(); // the shuffled order as shown
  await expect(page.locator("#feedback")).toHaveText(`Ikke helt. Den rigtige rækkefølge: ${ITEMS.join(" → ")}`);
  await expect(page.locator("#feedback")).not.toContainText(ORDER_KEY);
  expect(answers).toHaveLength(1);
  await page.context().close();
});

test("a wrong order with an explanation: the reflection is led by the correct order, then Videre", async ({ browser }) => {
  const { page } = await openQuiz(browser, { width: 900, height: 700 }, ORDER_ONLY);
  await page.locator("#order-items button.order-submit").click();
  await expect(page.locator("#feedback")).toHaveText(`Den rigtige rækkefølge: ${ITEMS.join(" → ")}`);
  await expect(page.locator("#review-feedback")).toContainText("Den siger ikke i sig selv, at den ene begivenhed var årsag til den næste.");
  await page.locator("#reflection-continue").click();
  await expect(page.locator("#question")).toContainText(STEPS[2].row.content.question, { timeout: 10000 });
  await page.context().close();
});

test("a second Svar while the order is on its way is not sent; a failed send hands the order back", async ({ browser }) => {
  const held = await openQuiz(browser, { width: 900, height: 700 }, ORDER_ONLY, { holdFirst: true });
  await held.page.locator("#order-items button.order-submit").click();
  await expect.poll(() => held.answers.length).toBe(1);
  await expect(held.page.locator("#order-items")).toHaveAttribute("aria-busy", "true");
  await held.page.locator("#order-items button.order-submit").click({ force: true });
  await held.page.waitForTimeout(300);
  expect(held.answers).toHaveLength(1);
  held.release();
  await held.page.context().close();

  const failed = await openQuiz(browser, { width: 900, height: 700 }, ORDER_ONLY, { failFirst: true });
  await solveOrder(failed.page, "click");
  await failed.page.locator("#order-items button.order-submit").click();
  await expect(failed.page.locator("#feedback")).toHaveText("⚠️ Fejl ved svar – prøv igen");
  expect(await shown(failed.page), "the order is kept").toEqual(ITEMS);
  await expect(failed.page.locator("#order-items button.order-submit")).toBeEnabled();
  await expect(failed.page.locator("#order-items button.order-submit")).toBeFocused();
  await failed.page.locator("#order-items button.order-submit").click();
  await expect(failed.page.locator("#feedback")).toHaveText("Ja! 🎯");
  expect(failed.answers).toEqual(["[2,0,3,1]", "[2,0,3,1]"]);
  await failed.page.context().close();
});
