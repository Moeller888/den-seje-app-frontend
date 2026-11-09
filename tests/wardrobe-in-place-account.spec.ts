// D-366 — a wardrobe choice on Avatar is changed in place and SAVED ON THE TEST PUPIL'S ACCOUNT: kept after a manual reload and a new
// login. D-367: only the chosen part changes; a part that does not go with the worn parts is refused and saves nothing.
// Runs against the suite's environment (the isolated stack in CI) with the slot's test pupil, through the UI only (the cards and
// "Brug min nuværende avatar"; no direct RPC). The pupil's wardrobe choice is cleared again at the end, also when a step fails.

import { test, expect, Page } from "@playwright/test";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import * as path from "path";
import { PROD, serveCheckoutLogin } from "./helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const STUDENT_EMAIL = process.env.TEST_STUDENT_EMAIL!;
const STUDENT_PASS  = process.env.TEST_STUDENT_PASSWORD!;

async function loginAsStudent(page: Page) {
  await serveCheckoutLogin(page);
  await page.goto(`${PROD}/login.html`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", STUDENT_EMAIL);
  await page.fill("#password", STUDENT_PASS);
  await page.locator("#loginBtn").click();
  await page.waitForURL(`${PROD}/hub.html`, { timeout: 20000 });
}
async function openWardrobe(page: Page) {
  await page.goto(`${PROD}/avatar.html`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#northstarWardrobeCards .item-card")).toHaveCount(79, { timeout: 30000 });
}
const card = (page: Page, piece: string) => page.locator(`#northstarWardrobeCards .item-card[data-piece='${piece}']`);
const outfitNow = (page: Page) => page.evaluate(async () => { const L: any = await import("/js/avatar-layers.js"); const o = L.northstarOutfitNow(); return o ? [o.top, o.bottom, o.shoes].join("+") : null; });
/** Clears the pupil's wardrobe choice through the page's own button, and waits until the account no longer holds one. */
async function clearChoice(page: Page) {
  const back = page.getByRole("button", { name: "Brug min nuværende avatar", exact: true });
  if (await back.isVisible()) {
    await back.click();
    await expect.poll(() => outfitNow(page)).toBe(null);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#northstarWardrobeCards .item-card")).toHaveCount(79, { timeout: 30000 });
    expect(await outfitNow(page), "the cleared choice is saved").toBe(null);
  }
}

test("D-366/D-367: a wardrobe choice is saved on the account — only the chosen part, in place, kept after a reload and a new login", async ({ browser, browserName }) => {
  test.skip(browserName !== "chromium", "UI dedup");
  let ctx = await browser.newContext({ reducedMotion: "reduce" });
  let page = await ctx.newPage();
  try {
    await loginAsStudent(page);
    await openWardrobe(page);
    await clearChoice(page);
    let loads = 0;
    page.on("load", () => { loads++; });

    let saves = 0;
    page.on("request", (r) => { if (r.url().includes("/rest/v1/rpc/set_avatar_northstar")) saves++; });
    const status = page.locator("#northstarWardrobe .northstar-status");

    // the navy shorts (the first choice starts the figure), then a sweater: it does not go with the shorts, so it is refused —
    // the outfit and the account stay (D-367); the pupil chooses the light blue capris first, then the sweater goes on
    await page.getByRole("tab", { name: "Underdele", exact: true }).click();
    await card(page, "bottom-shorts-navy").locator(".equip-btn").click();
    await expect(card(page, "bottom-shorts-navy")).toHaveClass(/equipped/);
    await expect.poll(() => saves).toBe(1);
    const withShorts = (await outfitNow(page))!;
    await page.getByRole("tab", { name: "Overdele", exact: true }).click();
    await card(page, "top-sweater-ls2-green-check").locator(".equip-btn").click();
    await expect(status).toContainText("Den overdel passer ikke til dit nuværende outfit.");
    await expect(card(page, "top-sweater-ls2-green-check")).not.toHaveClass(/equipped/);
    expect(await outfitNow(page), "a refused part changes nothing").toBe(withShorts);
    await page.waitForTimeout(500);
    expect(saves, "a refused part saves nothing").toBe(1);
    await page.getByRole("tab", { name: "Underdele", exact: true }).click();
    await card(page, "bottom-capri-lightblue").locator(".equip-btn").click();
    await expect(card(page, "bottom-capri-lightblue")).toHaveClass(/equipped/);
    await page.getByRole("tab", { name: "Overdele", exact: true }).click();
    await card(page, "top-sweater-ls2-green-check").locator(".equip-btn").click();
    await expect(card(page, "top-sweater-ls2-green-check")).toHaveClass(/equipped/);
    const chosen = (await outfitNow(page))!;
    const [, b0, s0] = withShorts.split("+");
    expect(chosen).toBe("top-sweater-ls2-green-check+bottom-capri-lightblue+" + s0);   // only the chosen parts changed
    expect(b0).toBe("bottom-shorts-navy");
    await expect.poll(() => saves).toBe(3);
    expect(loads, "no reload").toBe(0);
    await expect(status).not.toContainText("kunne ikke gemmes", { timeout: 5000 });

    // a manual reload: the account holds the outfit
    await expect.poll(async () => {
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.locator("#northstarWardrobeCards .item-card")).toHaveCount(79, { timeout: 30000 });
      return outfitNow(page);
    }, { timeout: 20000 }).toBe(chosen);
    await expect(card(page, "top-sweater-ls2-green-check")).toHaveClass(/equipped/);

    // a new login in a fresh browser session
    await ctx.close();
    ctx = await browser.newContext({ reducedMotion: "reduce" });
    page = await ctx.newPage();
    await loginAsStudent(page);
    await openWardrobe(page);
    expect(await outfitNow(page)).toBe(chosen);
  } finally {
    try { await clearChoice(page); } finally { await ctx.close(); }
  }
});
