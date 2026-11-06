// Sandt/falsk — the browser control (js/true-false.js) in a real engine, on the local demo page
// (tools/true-false/demo.html) served from this checkout on localhost. No production URL, no Supabase,
// no test pupil: the kind is not servable yet, so the live quiz cannot show it. Every *.supabase.co
// request is aborted and every request that leaves localhost is collected (offHost) and must be none.
// What is proven here is the pupil-facing behaviour — mouse, touch and keyboard, the exact answer text
// the server's key holds, the quiz's correct/incorrect feedback, the hand-back after a failed send, the
// read-aloud player on the statement, the visible error for a payload that breaks the contract, and that
// a phone-width screen does not overflow. Grading and rewards are proven in
// tests/unit/true-false-grading.test.mjs, the contract in tests/unit/true-false.test.mjs.
import { test, expect, type Page } from "@playwright/test";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

let server: http.Server;
let baseUrl: string;

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const p = decodeURIComponent((req.url || "/").split("?")[0]);
    const fp = path.normalize(path.join(ROOT, p));
    if (!fp.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    try {
      const data = fs.readFileSync(fp);
      res.writeHead(200, { "content-type": MIME[path.extname(fp).toLowerCase()] || "application/octet-stream" });
      res.end(data);
    } catch {
      res.writeHead(404); res.end();
    }
  });
  await new Promise<void>((r) => server.listen(0, r));
  baseUrl = `http://localhost:${(server.address() as any).port}`;
});

test.afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

const offHostByPage = new WeakMap<Page, string[]>();

// Example 0: "Danmark erklærede Tyskland krig …" → key Falsk. Example 1: "Jorden bevæger sig …" → Sandt.
async function open(page: Page, query: string) {
  if (!offHostByPage.has(page)) {
    const offHost: string[] = [];
    offHostByPage.set(page, offHost);
    page.on("request", (req) => {
      const url = req.url();
      if (url.startsWith("data:") || url.startsWith("blob:")) return;
      const host = new URL(url).hostname;
      if (host !== "localhost") offHost.push(url);
    });
    await page.route("**/*.supabase.co/**", (route) => route.abort());
  }
  await page.goto(`${baseUrl}/tools/true-false/demo.html?${query}`);
}

test.afterEach(async ({ page }) => {
  expect(offHostByPage.get(page) ?? [], "no request may leave localhost").toEqual([]);
});

const sandt = (page: Page) => page.locator("#true-false button.true-false-option", { hasText: "Sandt" });
const falsk = (page: Page) => page.locator("#true-false button.true-false-option", { hasText: "Falsk" });
const sent = (page: Page) => page.evaluate(() => (window as any).__tfDemo.sent as string[]);

test("render: the statement, two large answer buttons in a labelled group, and the read-aloud player", async ({ page }) => {
  await open(page, "example=0");
  await expect(page.locator("#question")).toContainText("Danmark erklærede Tyskland krig den 9. april 1940.");
  const buttons = page.locator("#true-false button.true-false-option");
  await expect(buttons).toHaveCount(2);
  await expect(buttons.nth(0)).toHaveText("Sandt");
  await expect(buttons.nth(1)).toHaveText("Falsk");
  for (const b of [sandt(page), falsk(page)]) {
    await expect(b).toHaveAttribute("type", "button");
    await expect(b).toHaveAttribute("aria-pressed", "false");
    await expect(b).toHaveAttribute("aria-describedby", "question");
    const box = await b.boundingBox();
    expect(box && box.height >= 44 && box.width >= 44, "touch target ≥ 44px").toBe(true);
  }
  const group = page.locator("#true-false .true-false-options");
  await expect(group).toHaveAttribute("role", "group");
  await expect(page.getByRole("group", { name: "Er udsagnet sandt eller falsk?" })).toBeVisible();
  // The statement is read aloud by the quiz's own player (js/read-aloud/adapters/quiz.js).
  const readAloud = page.locator("#question .read-aloud-player button.read-aloud-toggle");
  await expect(readAloud).toBeVisible();
  await expect(readAloud).toHaveAttribute("aria-label", "Læs spørgsmålet højt");
  await expect(page.locator("#unsupported-format")).toHaveCount(0);
});

test("click the right answer: the option text is sent once and the quiz's correct feedback is shown", async ({ page }) => {
  await open(page, "example=0");
  await falsk(page).click();
  await expect(falsk(page)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("body")).toHaveAttribute("data-result", "correct");
  await expect(page.locator("#feedback")).toHaveText("Ja! 🎯");
  await expect(page.locator("#feedback")).toHaveClass("feedback-correct");
  expect(await sent(page)).toEqual(["Falsk"]);
  // Accepted: nothing can be changed or sent again.
  await expect(sandt(page)).toBeDisabled();
  await expect(falsk(page)).toBeDisabled();
  await page.evaluate(() => (window as any).__tfDemo.control.choose(0));
  expect(await sent(page)).toEqual(["Falsk"]);
});

test("click the wrong answer: the quiz's incorrect feedback names the right one", async ({ page }) => {
  await open(page, "example=1");
  await falsk(page).click();
  await expect(page.locator("body")).toHaveAttribute("data-result", "incorrect");
  await expect(page.locator("#feedback")).toHaveText("Svaret er Sandt — husk det nu.");
  await expect(page.locator("#feedback")).toHaveClass("feedback-error");
  expect(await sent(page)).toEqual(["Falsk"]);
});

test.describe("touch", () => {
  test.use({ hasTouch: true, viewport: { width: 360, height: 740 } });

  test("tap answers on a phone-width screen without horizontal overflow", async ({ page }) => {
    await open(page, "example=1");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await sandt(page).tap();
    await expect(page.locator("body")).toHaveAttribute("data-result", "correct");
    await expect(page.locator("#feedback")).toHaveText("Ja! 🎯");
    expect(await sent(page)).toEqual(["Sandt"]);
  });
});

test("keyboard only: Tab reaches the answers with a visible focus ring, arrows move, Space sends", async ({ page }) => {
  await open(page, "example=0");
  // Tab through the page until the first answer has focus (demo bar and read-aloud player come first).
  for (let i = 0; i < 20; i++) {
    if (await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset?.value === "Sandt")) break;
    await page.keyboard.press("Tab");
  }
  await expect(sandt(page)).toBeFocused();
  const ring = await sandt(page).evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(ring).toBe("solid");
  await page.keyboard.press("ArrowRight");
  await expect(falsk(page)).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(sandt(page)).toBeFocused();
  await page.keyboard.press("End");
  await expect(falsk(page)).toBeFocused();
  await page.keyboard.press("Home");
  await expect(sandt(page)).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(falsk(page)).toBeFocused();
  expect(await sent(page)).toEqual([], "moving focus sends nothing");
  await page.keyboard.press("Space");
  await expect(page.locator("#feedback")).toHaveText("Ja! 🎯");
  expect(await sent(page)).toEqual(["Falsk"]);
});

test("keyboard: Enter sends the focused answer", async ({ page }) => {
  await open(page, "example=1");
  await sandt(page).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#feedback")).toHaveText("Ja! 🎯");
  expect(await sent(page)).toEqual(["Sandt"]);
});

test("an answer handed back after a failed send can be given again", async ({ page }) => {
  await open(page, "example=0&fail=1");
  await sandt(page).click();
  await expect(page.locator("#feedback")).toHaveText("⚠️ Fejl ved svar – prøv igen");
  await expect(sandt(page)).toBeEnabled();
  await expect(sandt(page)).toHaveAttribute("aria-pressed", "false");
  await expect(sandt(page)).toBeFocused();
  await expect(page.locator("#true-false")).not.toHaveAttribute("aria-busy", "true");
  await falsk(page).click();
  await expect(page.locator("#feedback")).toHaveText("Ja! 🎯");
  expect(await sent(page)).toEqual(["Sandt", "Falsk"]);
});

test("malformed content: a visible error with a way out, never a half-built control", async ({ page }) => {
  for (const example of [2, 3]) {
    await open(page, `example=${example}`);
    await expect(page.locator("#unsupported-format")).toBeVisible();
    await expect(page.locator("#unsupported-format")).toHaveAttribute("role", "alert");
    await expect(page.locator("#unsupported-format")).toHaveText("⚠️ Denne opgavetype kan ikke vises endnu.");
    await expect(page.locator("#go-hub-btn")).toBeVisible();
    await expect(page.locator("#true-false")).toHaveCount(0);
    await expect(page.locator("button.true-false-option")).toHaveCount(0);
  }
});
