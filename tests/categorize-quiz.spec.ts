// Kategorisering (F-05) in the REAL quiz — index.html + app.js + js/categorize.js — offline. Fixture-
// intercepted like tests/learning-sequence-quiz.spec.ts: a local static server serves this checkout, every
// *.supabase.co call is answered from fixtures, no real backend is reached.
//
// get-next-question serves tools/stimulus/examples/grundloven-1849-kategorisering.json, its payload built
// by the REAL _shared/question-dto.ts toPublicQuestion with a fixed instance key; process-event plays the
// server with the REAL _shared/categorize.ts canonicalCategorizeAnswer and the exact comparison.
//
// Proven (computer by keyboard, tablet and phone by touch): the items in the shown order with a button per
// category, 44 px targets, no overflow, no counts per category; an incomplete Svar refused visibly with
// nothing sent; every placement announced; the right placement correct; the facit never in the payload; a
// wrong placement explained in the shown texts (with and without an explanation); a second Svar while
// sending is not sent; a failed send hands the placement back.
import { test, expect, Route, Page } from "@playwright/test";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { toPublicQuestion } from "../supabase/functions/_shared/question-dto.ts";
import { canonicalCategorizeAnswer } from "../supabase/functions/_shared/categorize.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REF = "tjzbehwfagiwpwodsgwg";
const EXAMPLE = JSON.parse(fs.readFileSync(path.join(ROOT, "tools", "stimulus", "examples", "grundloven-1849-kategorisering.json"), "utf8"));
const ROW = EXAMPLE.row;
const CATS: string[] = ROW.content.categories;
const TEXTS: string[] = ROW.content.items.map((i: any) => i.text);
// Shown position → authored item : category. Shown: TEXTS[3], TEXTS[0], TEXTS[5], TEXTS[1], TEXTS[4], TEXTS[2].
const KEY = "3:1,0:0,5:1,1:0,4:1,2:0";
const SHOWN = [TEXTS[3], TEXTS[0], TEXTS[5], TEXTS[1], TEXTS[4], TEXTS[2]];
const RIGHT = [1, 0, 1, 0, 1, 0];
const NEXT = { answer_format: "number", answer_type: "short", content: { question: "Hvilket år blev Grundloven underskrevet?", correct: "1849" } };
const normalize = (s: string) => String(s).normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
const CORRECTION = `Den rigtige fordeling — ${CATS[0]}: ${TEXTS[0]}, ${TEXTS[1]}, ${TEXTS[2]}. ${CATS[1]}: ${TEXTS[3]}, ${TEXTS[5]}, ${TEXTS[4]}.`;

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
      const key = current.answer_format === "categorize" ? KEY : undefined;
      const body = { step: "question", question_instance_id: `cq${n}`, answer_format: current.answer_format, answer_type: current.answer_type,
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
      if (current.answer_format === "categorize") {
        const canonical = canonicalCategorizeAnswer(body.answer, KEY);
        if (canonical === null) return j({ status: "invalid", error: "Placér alle elementer, før du sender." }, 400);
        const ok = normalize(canonical) === normalize(KEY);
        return j({ status: ok ? "correct" : "incorrect", correct_answer: KEY, review_text: ok ? null : review });
      }
      const key = String(current.content.correct);
      const ok = normalize(body.answer) === normalize(key);
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

const shown = (page: Page) => page.locator("#categorize .categorize-item .categorize-text").allTextContents();
const choice = (page: Page, text: string, category: string) =>
  page.locator("#categorize .categorize-item", { has: page.locator(".categorize-text", { hasText: text }) })
    .locator("button.categorize-choice", { hasText: category });

async function place(page: Page, placement: number[], how: "keyboard" | "tap" | "click") {
  for (let i = 0; i < placement.length; i++) {
    const b = choice(page, SHOWN[i], CATS[placement[i]]);
    if (how === "keyboard") { await b.focus(); await page.keyboard.press("Enter"); }
    else if (how === "tap") await b.tap();
    else await b.click();
    await expect(b).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#categorize .categorize-live")).toHaveText(`${SHOWN[i]}: ${CATS[placement[i]]}`);
  }
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
  test(`${v.name}: kategorisering — ufuldstændigt svar afvises synligt, den rigtige fordeling er rigtig`, async ({ browser }) => {
    const { page, answers, payloads } = await openQuiz(browser, v.viewport, [ROW, NEXT], { hasTouch: v.hasTouch });
    await expect(page.locator("#categorize")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("#categorize .categorize-instructions")).toHaveText("Placér hvert element i den kategori, det hører til.");
    expect(await shown(page)).toEqual(SHOWN);
    // One labelled group per item, a button per category, in the authored category order.
    await expect(page.getByRole("group", { name: SHOWN[0] })).toBeVisible();
    await expect(page.getByRole("group", { name: SHOWN[0] }).getByRole("button")).toHaveText(CATS);
    for (const b of await page.locator("#categorize button.categorize-choice").all()) {
      const box = await b.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
    await noOverflow(page);
    // Svar before everything is placed: refused visibly, nothing sent.
    await place(page, RIGHT.slice(0, 4), v.how);
    const submit = page.locator("#categorize button.categorize-submit");
    if (v.hasTouch) await submit.tap(); else { await submit.focus(); await page.keyboard.press("Enter"); }
    await expect(page.locator("#categorize .categorize-live")).toHaveText("Placér alle elementer, før du sender. 2 mangler.");
    expect(answers).toEqual([]);    // Change of mind: move one item, then back.
    await place(page, RIGHT, v.how);
    if (v.hasTouch) await submit.tap(); else { await submit.focus(); await page.keyboard.press("Enter"); }
    await expect(page.locator("#feedback")).toHaveText("Ja! 🎯", { timeout: 10000 });
    expect(answers).toEqual([JSON.stringify(RIGHT)]);
    // The payload holds labels and shown texts only: never an item's category, the key or the explanation.
    for (const leak of ['"category"', '"correct"', '"review_text"', KEY, '"accepted_answers"']) expect(payloads[0].includes(leak), leak).toBe(false);
    await expect(page.locator("#question")).toContainText(NEXT.content.question, { timeout: 10000 });
    await page.context().close();
  });
}

test("a wrong placement without an explanation: the correct placement in the shown texts, never the key", async ({ browser }) => {
  const { page, answers } = await openQuiz(browser, { width: 900, height: 700 }, [ROW, NEXT], { noReview: true });
  await place(page, [1, 0, 1, 0, 0, 1], "click"); // 4 of 6 right — all or nothing: wrong
  await page.locator("#categorize button.categorize-submit").click();
  await expect(page.locator("#feedback")).toHaveText(`Ikke helt. ${CORRECTION}`);
  await expect(page.locator("#feedback")).not.toContainText("3:1");
  expect(answers).toHaveLength(1);
  await page.context().close();
});

test("a wrong placement with an explanation: the reflection is led by the correct placement, then Videre", async ({ browser }) => {
  const { page } = await openQuiz(browser, { width: 900, height: 700 }, [ROW, NEXT]);
  await place(page, [0, 0, 1, 0, 1, 0], "click");
  await page.locator("#categorize button.categorize-submit").click();
  await expect(page.locator("#feedback")).toHaveText(CORRECTION);
  await expect(page.locator("#review-feedback")).toContainText("Grundloven af 5. juni 1849 delte magten");
  await page.locator("#reflection-continue").click();
  await expect(page.locator("#question")).toContainText(NEXT.content.question, { timeout: 10000 });
  await page.context().close();
});

test("a second Svar while the placement is on its way is not sent; a failed send hands the placement back", async ({ browser }) => {
  const held = await openQuiz(browser, { width: 900, height: 700 }, [ROW, NEXT], { holdFirst: true });
  await place(held.page, RIGHT, "click");
  await held.page.locator("#categorize button.categorize-submit").click();
  await expect.poll(() => held.answers.length).toBe(1);
  await expect(held.page.locator("#categorize")).toHaveAttribute("aria-busy", "true");
  await held.page.locator("#categorize button.categorize-submit").click({ force: true });
  await held.page.waitForTimeout(300);
  expect(held.answers).toHaveLength(1);
  held.release();
  await held.page.context().close();

  const failed = await openQuiz(browser, { width: 900, height: 700 }, [ROW, NEXT], { failFirst: true });
  await place(failed.page, RIGHT, "click");
  await failed.page.locator("#categorize button.categorize-submit").click();
  await expect(failed.page.locator("#feedback")).toHaveText("⚠️ Fejl ved svar – prøv igen");
  for (let i = 0; i < RIGHT.length; i++) await expect(choice(failed.page, SHOWN[i], CATS[RIGHT[i]])).toHaveAttribute("aria-pressed", "true");
  await expect(failed.page.locator("#categorize button.categorize-submit")).toBeEnabled();
  await expect(failed.page.locator("#categorize button.categorize-submit")).toBeFocused();
  await failed.page.locator("#categorize button.categorize-submit").click();
  await expect(failed.page.locator("#feedback")).toHaveText("Ja! 🎯");
  expect(failed.answers).toEqual([JSON.stringify(RIGHT), JSON.stringify(RIGHT)]);
  await failed.page.context().close();
});
