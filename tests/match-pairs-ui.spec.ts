// Match par — the browser control (js/match-pairs.js) in a real engine, on the local demo page
// (tools/match-pairs/demo.html) served from this checkout. No production URL, no Supabase, no test
// student: the kind is not servable yet, so the live quiz cannot show it. What is proven here is the
// pupil-facing behaviour — mouse, touch and keyboard, changing your mind, the locked "Send svar", the
// exact answer shape the server accepts, the result marks, and that a phone-width screen does not
// overflow. Grading and rewards are proven in tests/unit/match-pairs.test.mjs.
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
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;
});

test.afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

// Example 1 = band 3, four countries; key "0:2,1:3,2:0,3:1" →
// right column: Stockholm, Helsinki, København, Oslo.
async function open(page: Page, example = 1) {
  await page.goto(`${baseUrl}/tools/match-pairs/demo.html?example=${example}`);
  await expect(page.locator("#match-pairs")).toBeVisible();
}
const left = (page: Page, text: string) => page.locator('.match-column-left button.match-item', { hasText: text });
const right = (page: Page, text: string) => page.locator('.match-column-right button.match-item', { hasText: text });

test("mouse: connect, change your mind, send only when complete, see the result", async ({ page }) => {
  await open(page);
  const send = page.locator("#match-submit");
  await expect(send).toBeDisabled();
  await expect(page.locator("#match-progress")).toHaveText("0 af 4 par forbundet");

  await left(page, "Danmark").click();
  await expect(left(page, "Danmark")).toHaveAttribute("aria-pressed", "true");
  await right(page, "Oslo").click();                                   // wrong on purpose
  await expect(left(page, "Danmark")).toHaveAttribute("aria-label", "Danmark, forbundet med Oslo (par 1)");
  await expect(right(page, "Oslo").locator(".match-badge")).toHaveText("1");
  await expect(page.locator("#match-live")).toContainText("Danmark og Oslo er forbundet");

  // Tapping a connected item removes the connection and picks the item up again.
  await right(page, "Oslo").click();
  await expect(left(page, "Danmark")).toHaveAttribute("aria-label", "Danmark");
  await expect(right(page, "Oslo")).toHaveAttribute("aria-pressed", "true");
  await left(page, "Norge").click();                                   // right side first works too

  await left(page, "Danmark").click();
  await right(page, "København").click();
  await left(page, "Sverige").click();
  await right(page, "Stockholm").click();
  await expect(send).toBeDisabled();
  await left(page, "Finland").click();
  await right(page, "Helsinki").click();
  await expect(page.locator("#match-progress")).toHaveText("4 af 4 par forbundet");
  await expect(send).toBeEnabled();

  await send.click();
  await expect(page.locator("body")).toHaveAttribute("data-result", "correct");
  await expect(page.locator("#feedback")).toHaveText("Ja! 🎯");
  await expect(page.locator("button.match-item.match-ok")).toHaveCount(8);
  await expect(page.locator("#match-solution li")).toHaveCount(4);
});

test("the answer sent is exactly the server's shape: one [left, right] per pair, display positions", async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const w = window as any;
    w.__sent = null;
    const orig = w.__matchDemo.control.submit;
    w.__matchDemo.control.button.onclick = () => { w.__sent = JSON.stringify(w.__matchDemo.control.connections()); return orig(); };
  });
  for (const [l, r] of [["Danmark", "København"], ["Norge", "Oslo"], ["Sverige", "Stockholm"], ["Finland", "Helsinki"]]) {
    await left(page, l).click();
    await right(page, r).click();
  }
  await page.locator("#match-submit").click();
  const sent = await page.evaluate(() => (window as any).__sent);
  expect(JSON.parse(sent)).toEqual([[0, 2], [1, 3], [2, 0], [3, 1]]);
});

test("a wrong pairing is marked per pair and the correct pairs are listed", async ({ page }) => {
  await open(page);
  for (const [l, r] of [["Danmark", "Oslo"], ["Norge", "København"], ["Sverige", "Stockholm"], ["Finland", "Helsinki"]]) {
    await left(page, l).click();
    await right(page, r).click();
  }
  await page.locator("#match-submit").click();
  await expect(page.locator("body")).toHaveAttribute("data-result", "incorrect");
  await expect(page.locator("#feedback")).toHaveText("Ikke helt — se de rigtige par.");
  await expect(page.locator("button.match-item.match-wrong")).toHaveCount(4);
  await expect(page.locator("button.match-item.match-ok")).toHaveCount(4);
  await expect(page.locator("#match-solution li").first()).toHaveText("Danmark → København");
  await expect(page.locator("#match-solution li.match-solution-ok")).toHaveCount(2);
  // After grading, nothing can be changed.
  await expect(left(page, "Danmark")).toBeDisabled();
});

test("keyboard only: Tab in, arrows to move, Enter/Space to connect, Escape to drop a selection", async ({ page }) => {
  await open(page, 0);                                                 // band 1: dog/cat/house, key 0:2,1:0,2:1
  await left(page, "dog").focus();
  await page.keyboard.press("Enter");
  await expect(left(page, "dog")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(left(page, "dog")).toHaveAttribute("aria-pressed", "false");

  await page.keyboard.press("Space");                                  // dog
  await page.keyboard.press("ArrowRight");                             // → right row 0 (kat)
  await page.keyboard.press("ArrowDown");                              // hund
  await page.keyboard.press("ArrowDown");                              // row 2
  await expect(right(page, "hund")).toBeFocused();
  await page.keyboard.press("Enter");                                  // dog ↔ hund
  await expect(left(page, "dog")).toHaveAttribute("aria-label", "dog, forbundet med hund (par 1)");
  // Focus moves on to the next free item where the pupil started.
  // Right column order is kat, hus, hund.
  await expect(left(page, "cat")).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowRight");                             // row 1: hus
  await page.keyboard.press("ArrowUp");                                // kat
  await expect(right(page, "kat")).toBeFocused();
  await page.keyboard.press("Enter");                                  // cat ↔ kat
  await expect(left(page, "house")).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowRight");                             // row 2: hund (taken)
  await page.keyboard.press("ArrowUp");                                // hus
  await expect(right(page, "hus")).toBeFocused();
  await page.keyboard.press("Enter");                                  // house ↔ hus
  await expect(page.locator("#match-submit")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("body")).toHaveAttribute("data-result", "correct");
});

test.describe("touch, phone width", () => {
  test.use({ viewport: { width: 360, height: 740 }, hasTouch: true });

  test("tap to connect; six long pairs fit a phone without horizontal scrolling; targets ≥ 44px", async ({ page }) => {
    await open(page, 2);                                               // band 5: six pairs, long texts
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const items = page.locator("button.match-item");
    await expect(items).toHaveCount(12);
    for (let i = 0; i < 12; i++) {
      const box = await items.nth(i).boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.x + box!.width).toBeLessThanOrEqual(360);
    }
    await left(page, "Enevælde").tap();
    await right(page, "Kongen har al magt").tap();
    await expect(left(page, "Enevælde")).toHaveAttribute("aria-label", "Enevælde, forbundet med Kongen har al magt (par 1)");
    await page.screenshot({ path: test.info().outputPath("match-pairs-phone.png"), fullPage: true });
  });
});

test("screenshots of the three level examples (for review, not a golden baseline)", async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 820 });
  for (const ex of [0, 1, 2]) {
    await open(page, ex);
    await page.locator(".match-column-left button.match-item").first().click();
    await page.screenshot({ path: test.info().outputPath(`match-pairs-example-${ex}.png`), fullPage: true });
  }
  await open(page, 1);
  for (const [l, r] of [["Danmark", "Oslo"], ["Norge", "København"], ["Sverige", "Stockholm"], ["Finland", "Helsinki"]]) {
    await left(page, l).click();
    await right(page, r).click();
  }
  await page.locator("#match-submit").click();
  await expect(page.locator("#match-solution")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("match-pairs-result.png"), fullPage: true });
});
