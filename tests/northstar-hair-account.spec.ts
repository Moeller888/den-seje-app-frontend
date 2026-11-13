// D-373 — the hairstyle on the Northstar figure, SAVED ON THE TEST PUPIL'S ACCOUNT, with this browser's opt-in (the flag is off):
// chosen in place on Avatar, kept after a manual reload and a new login, and drawn the same on Avatar, Hub and in the quiz; a part keeps
// the hairstyle; an older choice without a hairstyle gets the standard hair.
// Runs against the suite's environment (the isolated stack in CI, where the D-373 migration is replayed as REPO_AHEAD_OF_PRODUCTION) with
// the slot's test pupil. A database without the migration (production today) refuses the key: the test is then skipped with that reason,
// and nothing is written. Choices go through the UI; only the probe and the older choice are written directly. The pupil's choice is
// cleared at the end, also when a step fails.

import { test, expect, Page, BrowserContext, Browser } from "@playwright/test";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import * as path from "path";
import { PROD, serveCheckoutLogin } from "./helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const STUDENT_EMAIL = process.env.TEST_STUDENT_EMAIL!;
const STUDENT_PASS  = process.env.TEST_STUDENT_PASSWORD!;
const CARDS = 82;   // the 79 parts and the 3 hairstyles

async function signedIn(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  await ctx.addInitScript(() => { localStorage.setItem("avatar_northstar_hair", "1"); });   // this browser's opt-in; the flag stays off
  const page = await ctx.newPage();
  await serveCheckoutLogin(page);
  await page.goto(`${PROD}/login.html`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", STUDENT_EMAIL);
  await page.fill("#password", STUDENT_PASS);
  await page.locator("#loginBtn").click();
  await page.waitForURL(`${PROD}/hub.html`, { timeout: 20000 });
  return { ctx, page };
}
async function openWardrobe(page: Page) {
  await page.goto(`${PROD}/avatar.html`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#northstarWardrobeCards .item-card")).toHaveCount(CARDS, { timeout: 30000 });
}
const hairCard = (page: Page, hair: string) => page.locator(`#northstarWardrobeCards .item-card[data-hair='${hair}']`);
const outfitNow = (page: Page) => page.evaluate(async () => { const L: any = await import("/js/avatar-layers.js"); const o = L.northstarOutfitNow(); return o ? [o.top, o.bottom, o.shoes].join("+") : null; });
/** What the account holds, read through the page's own signed-in client. */
const stored = (page: Page) => page.evaluate(async () => { const { supabase }: any = await import("/js/supabase.js"); const { data: u } = await supabase.auth.getUser(); const { data, error } = await supabase.from("profiles").select("avatar_identity").eq("id", u.user.id).limit(1); if (error) throw new Error(error.message); return data && data[0] ? data[0].avatar_identity?.northstar ?? null : null; });
const directSave = (page: Page, choice: Record<string, string>) => page.evaluate(async (c) => { const { supabase }: any = await import("/js/supabase.js"); const { error } = await supabase.rpc("set_avatar_northstar", { p_choice: c }); return error ? error.message : null; }, choice);
/** The hairstyle and outfit a surface draws for this account, once its own avatar element is on the Northstar path. */
async function shownOn(page: Page, url: string, element: string, surface: string) {
  await page.goto(`${PROD}/${url}`, { waitUntil: "domcontentloaded" });
  await expect.poll(() => page.evaluate((id) => document.getElementById(id)?.dataset.avatarRenderPath ?? null, element), { timeout: 30000 }).toBe("northstar");
  return page.evaluate(async (s) => { const L: any = await import("/js/avatar-layers.js"); const r = L.northstarRenderFor(s, []); const o = L.northstarOutfitNow();
    return { hair: r ? r.hair : null, head: r ? r.plan.filter((x: any) => x.op === "draw" && /head/.test(x.src)).map((x: any) => x.src)[0] : null, outfit: o ? [o.top, o.bottom, o.shoes].join("+") : null }; }, surface);
}
/** Clears the pupil's wardrobe choice through the page's own button, and waits until the account no longer holds one. */
async function clearChoice(page: Page) {
  await openWardrobe(page);
  const back = page.getByRole("button", { name: "Brug min nuværende avatar", exact: true });
  if (await back.isVisible()) {
    await back.click();
    await expect.poll(() => stored(page), { timeout: 15000 }).toBe(null);
  }
}

test("D-373: a hairstyle is saved on the account with the outfit, kept after a reload and a new login, and drawn the same on Avatar, Hub and in the quiz", async ({ browser, browserName }) => {
  test.skip(browserName !== "chromium", "UI dedup");
  test.setTimeout(150000);
  let { ctx, page } = await signedIn(browser);
  try {
    await clearChoice(page);
    // the probe: does this database accept the hairstyle (D-373's migration)? production today refuses it and nothing is written
    const refused = await directSave(page, { outfit: "FRI", top: "top-tee-hip-blue", pants: "bottom-trousers-square-navy", shoes: "shoes-sneakers-white", hair: "standard" });
    test.skip(refused !== null, "this database's validate_avatar_identity has no D-373 migration: " + refused);
    await openWardrobe(page);
    let loads = 0, saves = 0;
    page.on("load", () => { loads++; });
    page.on("request", (r) => { if (r.url().includes("/rest/v1/rpc/set_avatar_northstar")) saves++; });
    const outfit = "top-tee-hip-blue+bottom-trousers-square-navy+shoes-sneakers-white";
    expect(await outfitNow(page)).toBe(outfit);
    await page.getByRole("tab", { name: "Hoved", exact: true }).click();
    await expect(hairCard(page, "standard")).toHaveClass(/equipped/);
    await hairCard(page, "nh4-grey").locator(".equip-btn").click();
    await expect(hairCard(page, "nh4-grey")).toHaveClass(/equipped/);
    await expect.poll(() => saves).toBe(1);
    const grey = { outfit: "FRI", top: "top-tee-hip-blue", pants: "bottom-trousers-square-navy", shoes: "shoes-sneakers-white", hair: "nh4-grey" };
    await expect.poll(() => stored(page), { timeout: 15000 }).toEqual(grey);
    expect(await outfitNow(page), "the outfit stays").toBe(outfit);
    expect(loads, "no reload").toBe(0);
    // a part keeps the hairstyle
    await page.getByRole("tab", { name: "Overdele", exact: true }).click();
    await page.locator("#northstarWardrobeCards .item-card[data-piece='top-sweater-ls2-heather'] .equip-btn").click();
    const sweater = { ...grey, top: "top-sweater-ls2-heather" };
    await expect.poll(() => stored(page), { timeout: 15000 }).toEqual(sweater);
    const sweaterOutfit = "top-sweater-ls2-heather+bottom-trousers-square-navy+shoes-sneakers-white";
    // a manual reload, then a new login in a fresh browser session; Avatar, Hub and the quiz draw the same
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#northstarWardrobeCards .item-card")).toHaveCount(CARDS, { timeout: 30000 });
    await page.getByRole("tab", { name: "Hoved", exact: true }).click();
    await expect(hairCard(page, "nh4-grey")).toHaveClass(/equipped/);
    await ctx.close();
    ({ ctx, page } = await signedIn(browser));
    const want = { hair: "nh4-grey", head: "/assets/avatar-northstar-hair/head-nh4-grey-v1.webp", outfit: sweaterOutfit };
    expect(await shownOn(page, "avatar.html", "avatar-preview", "avatar"), "on Avatar after a new login").toEqual(want);
    expect(await shownOn(page, "hub.html", "profileAvatar", "hub"), "on Hub").toEqual(want);
    expect(await shownOn(page, "index.html", "avatar-display", "quiz"), "in the quiz").toEqual(want);
    // the brown, then an older choice without a hairstyle: the standard hair everywhere
    await openWardrobe(page);
    await page.getByRole("tab", { name: "Hoved", exact: true }).click();
    await hairCard(page, "nh4-brown").locator(".equip-btn").click();
    await expect.poll(() => stored(page), { timeout: 15000 }).toEqual({ ...sweater, hair: "nh4-brown" });
    expect(await shownOn(page, "hub.html", "profileAvatar", "hub"), "brown on Hub").toEqual({ ...want, hair: "nh4-brown", head: "/assets/avatar-northstar-hair/head-nh4-brown-v1.webp" });
    expect(await directSave(page, { outfit: "K07", pants: "TS-NAV", shoes: "SV1-V5-CHALK", top: "TK-NAVY" })).toBe(null);
    const older = { hair: "standard", head: "/assets/avatar-northstar-hair/head-standard-v1.webp", outfit: "top-tank-navy+bottom-trousers-square-navy+shoes-sneakers-low-sv1-chalk" };
    expect(await shownOn(page, "avatar.html", "avatar-preview", "avatar"), "older choice on Avatar").toEqual(older);
    expect(await shownOn(page, "hub.html", "profileAvatar", "hub"), "older choice on Hub").toEqual(older);
    expect(await shownOn(page, "index.html", "avatar-display", "quiz"), "older choice in the quiz").toEqual(older);
  } finally {
    try { await clearChoice(page); } finally { await ctx.close(); }
  }
});
