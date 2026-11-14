// D-366 — a wardrobe choice on Avatar is changed in place and SAVED ON THE TEST PUPIL'S ACCOUNT: kept after a manual reload and a new
// login. D-370: the free wardrobe through the existing account function: the three parts are stored directly and read back, also an olive
// outfit that could not be chosen before, and on Hub and in the quiz; an older choice with a K number gives the same outfit as before.
// Runs against the suite's environment (the isolated stack in CI) with the slot's test pupil. Choices go through the UI; only the older
// choice is written directly (it can no longer be made in the UI). The pupil's choice is cleared at the end, also when a step fails.

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
  await expect(page.locator("#northstarWardrobeCards .item-card")).toHaveCount(82, { timeout: 30000 });   // D-374: the 79 parts and the 3 hairstyles
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
    await expect(page.locator("#northstarWardrobeCards .item-card")).toHaveCount(82, { timeout: 30000 });   // D-374: the 79 parts and the 3 hairstyles
    expect(await outfitNow(page), "the cleared choice is saved").toBe(null);
  }
}

/** What the account holds, read through the page's own signed-in client. */
const stored = (page: Page) => page.evaluate(async () => { const { supabase }: any = await import("/js/supabase.js"); const { data: u } = await supabase.auth.getUser(); const { data, error } = await supabase.from("profiles").select("avatar_identity").eq("id", u.user.id).limit(1); if (error) throw new Error(error.message); return data && data[0] ? data[0].avatar_identity?.northstar ?? null : null; });
const directSave = (page: Page, choice: Record<string, string>) => page.evaluate(async (c) => { const { supabase }: any = await import("/js/supabase.js"); const { error } = await supabase.rpc("set_avatar_northstar", { p_choice: c }); if (error) throw new Error(error.message); }, choice);
/** The outfit a surface shows: drawn on the Northstar path in its own avatar element, and what the page's renderer reads for this account. */
async function shownOn(page: Page, url: string, element: string) {
  await page.goto(`${PROD}/${url}`, { waitUntil: "domcontentloaded" });
  await expect.poll(() => page.evaluate((id) => document.getElementById(id)?.dataset.avatarRenderPath ?? null, element), { timeout: 30000 }).toBe("northstar");
  return outfitNow(page);
}

test("D-370: a free outfit is saved on the account in the three-part format, read back after a new login, and shown on Avatar, Hub and in the quiz", async ({ browser, browserName }) => {
  test.skip(browserName !== "chromium", "UI dedup");
  test.setTimeout(120000);
  let ctx = await browser.newContext({ reducedMotion: "reduce" });
  let page = await ctx.newPage();
  try {
    await loginAsStudent(page);
    await openWardrobe(page);
    await clearChoice(page);
    let loads = 0, saves = 0;
    page.on("load", () => { loads++; });
    page.on("request", (r) => { if (r.url().includes("/rest/v1/rpc/set_avatar_northstar")) saves++; });
    const status = page.locator("#northstarWardrobe .northstar-status");

    // the olive trousers (the first choice starts from the start outfit, only the bottom changes), then sneakers no outfit could reach with them
    await page.getByRole("tab", { name: "Underdele", exact: true }).click();
    await card(page, "bottom-trousers-square-olive").locator(".equip-btn").click();
    await expect(card(page, "bottom-trousers-square-olive")).toHaveClass(/equipped/);
    await expect.poll(() => saves).toBe(1);
    await page.getByRole("tab", { name: "Sko", exact: true }).click();
    await card(page, "shoes-sneakers-low-sv1-chalk").locator(".equip-btn").click();
    await expect(card(page, "shoes-sneakers-low-sv1-chalk")).toHaveClass(/equipped/);
    await expect.poll(() => saves).toBe(2);
    const chosen = "top-tee-hip-cream+bottom-trousers-square-olive+shoes-sneakers-low-sv1-chalk";
    expect(await outfitNow(page)).toBe(chosen);
    expect(loads, "no reload").toBe(0);
    await expect(status).not.toContainText("kunne ikke gemmes", { timeout: 5000 });
    const three = { outfit: "FRI", top: "top-tee-hip-cream", pants: "bottom-trousers-square-olive", shoes: "shoes-sneakers-low-sv1-chalk" };
    await expect.poll(() => stored(page), { timeout: 15000 }).toEqual(three);   // the existing account function took the format

    // a manual reload, then a new login in a fresh browser session
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#northstarWardrobeCards .item-card")).toHaveCount(82, { timeout: 30000 });   // D-374: the 79 parts and the 3 hairstyles
    expect(await outfitNow(page)).toBe(chosen);
    await expect(card(page, "bottom-trousers-square-olive")).toHaveClass(/equipped/);
    await ctx.close();
    ctx = await browser.newContext({ reducedMotion: "reduce" });
    page = await ctx.newPage();
    await loginAsStudent(page);
    await openWardrobe(page);
    expect(await outfitNow(page), "after a new login").toBe(chosen);
    expect(await stored(page)).toEqual(three);
    expect(await shownOn(page, "hub.html", "profileAvatar"), "on Hub").toBe(chosen);
    expect(await shownOn(page, "index.html", "avatar-display"), "in the quiz").toBe(chosen);

    // an older choice with a K number gives the same outfit everywhere
    await page.goto(`${PROD}/avatar.html`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#northstarWardrobeCards .item-card")).toHaveCount(82, { timeout: 30000 });   // D-374: the 79 parts and the 3 hairstyles
    await directSave(page, { outfit: "K07", pants: "TS-NAV", shoes: "SV1-V5-CHALK", top: "TK-NAVY" });
    const older = "top-tank-navy+bottom-trousers-square-navy+shoes-sneakers-low-sv1-chalk";
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#northstarWardrobeCards .item-card")).toHaveCount(82, { timeout: 30000 });   // D-374: the 79 parts and the 3 hairstyles
    expect(await outfitNow(page), "older choice on Avatar").toBe(older);
    expect(await shownOn(page, "avatar.html", "avatar-preview"), "older choice drawn on Avatar").toBe(older);
    expect(await shownOn(page, "hub.html", "profileAvatar"), "older choice on Hub").toBe(older);
    expect(await shownOn(page, "index.html", "avatar-display"), "older choice in the quiz").toBe(older);
    await page.goto(`${PROD}/avatar.html`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#northstarWardrobeCards .item-card")).toHaveCount(82, { timeout: 30000 });   // D-374: the 79 parts and the 3 hairstyles
  } finally {
    try { await clearChoice(page); } finally { await ctx.close(); }
  }
});
