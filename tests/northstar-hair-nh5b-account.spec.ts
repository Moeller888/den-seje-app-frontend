// D-377 — the top knot ("Topknude · gråt" / "Topknude · brunt") SAVED ON THE TEST PUPIL'S ACCOUNT. Its two cards are hidden by default
// (NORTHSTAR_HAIR_NH5B = false), so this browser opts in through the page itself (avatar.html?northstarnh5b=1): both colours are chosen
// in place on Avatar; the outfit stays; a part keeps the top knot; it is kept after a manual reload and after a new login in a fresh
// browser WITHOUT the opt-in, and drawn the same on Avatar, Hub and in the quiz; an older choice without a hairstyle gets the standard hair.
// Runs against the suite's environment (the isolated stack in CI, which replays D-377's migration — REPO_AHEAD_OF_PRODUCTION) with the
// slot's test pupil. A database without the migration (production until it is applied) refuses the value: the test is then skipped with
// that reason, and nothing is written. After the production migration this is the test with the test pupil. Choices go through the UI;
// only the probe and the older choice are written directly. The pupil's choice is cleared at the end, also when a step fails.

import { test, expect, Page, BrowserContext, Browser } from "@playwright/test";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import * as path from "path";
import { PROD, serveCheckoutLogin } from "./helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const STUDENT_EMAIL = process.env.TEST_STUDENT_EMAIL!;
const STUDENT_PASS  = process.env.TEST_STUDENT_PASSWORD!;
const CARDS = 82;          // the 79 parts and D-373's 3 hairstyles
const CARDS_OPTED = 84;    // and the two top knots, with this browser's opt-in

async function signedIn(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await serveCheckoutLogin(page);
  await page.goto(`${PROD}/login.html`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", STUDENT_EMAIL);
  await page.fill("#password", STUDENT_PASS);
  await page.locator("#loginBtn").click();
  await page.waitForURL(`${PROD}/hub.html`, { timeout: 20000 });
  return { ctx, page };
}
async function openWardrobe(page: Page, optIn: boolean) {
  await page.goto(`${PROD}/avatar.html${optIn ? "?northstarnh5b=1" : ""}`, { waitUntil: "domcontentloaded" });
  const opted = optIn || (await page.evaluate(() => localStorage.getItem("avatar_northstar_hair_nh5b"))) === "1";   // an earlier opt-in in this browser
  await expect(page.locator("#northstarWardrobeCards .item-card")).toHaveCount(opted ? CARDS_OPTED : CARDS, { timeout: 30000 });
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
  await openWardrobe(page, false);
  const back = page.getByRole("button", { name: "Brug min nuværende avatar", exact: true });
  if (await back.isVisible()) {
    await back.click();
    await expect.poll(() => stored(page), { timeout: 15000 }).toBe(null);
  }
}
const HEAD = (hair: string) => "/assets/avatar-northstar-hair/head-" + hair + "-v1.webp";

test("D-377: both top knots are saved on the account with the outfit, kept after a reload and a new login without the opt-in, and drawn the same on Avatar, Hub and in the quiz", async ({ browser, browserName }) => {
  test.skip(browserName !== "chromium", "UI dedup");
  test.setTimeout(180000);
  let { ctx, page } = await signedIn(browser);
  try {
    await clearChoice(page);
    // the probe: does this database accept the top knot (D-377's migration)? production refuses it until then, and nothing is written
    const refused = await directSave(page, { outfit: "FRI", top: "top-tee-hip-blue", pants: "bottom-trousers-square-navy", shoes: "shoes-sneakers-white", hair: "nh5b-grey" });
    test.skip(refused !== null, "this database's validate_avatar_identity has no D-377 migration: " + refused);
    expect(await directSave(page, { outfit: "FRI", top: "top-tee-hip-blue", pants: "bottom-trousers-square-navy", shoes: "shoes-sneakers-white" })).toBe(null);
    // hidden by default: no top-knot card without the opt-in
    await openWardrobe(page, false);
    expect(await page.evaluate(() => localStorage.getItem("avatar_northstar_hair_nh5b")), "no opt-in in this browser yet").toBe(null);
    await expect(hairCard(page, "nh5b-grey")).toHaveCount(0);
    await openWardrobe(page, true);
    let loads = 0, saves = 0;
    page.on("load", () => { loads++; });
    page.on("request", (r) => { if (r.url().includes("/rest/v1/rpc/set_avatar_northstar")) saves++; });
    const outfit = "top-tee-hip-blue+bottom-trousers-square-navy+shoes-sneakers-white";
    expect(await outfitNow(page)).toBe(outfit);
    await page.getByRole("tab", { name: "Hoved", exact: true }).click();
    await expect(hairCard(page, "standard")).toHaveClass(/equipped/);
    await hairCard(page, "nh5b-grey").locator(".equip-btn").click();
    await expect(hairCard(page, "nh5b-grey")).toHaveClass(/equipped/);
    await expect.poll(() => saves).toBe(1);
    const grey = { outfit: "FRI", top: "top-tee-hip-blue", pants: "bottom-trousers-square-navy", shoes: "shoes-sneakers-white", hair: "nh5b-grey" };
    await expect.poll(() => stored(page), { timeout: 15000 }).toEqual(grey);
    expect(await outfitNow(page), "the outfit stays").toBe(outfit);
    expect(loads, "no reload").toBe(0);
    // a part keeps the top knot
    await page.getByRole("tab", { name: "Overdele", exact: true }).click();
    await page.locator("#northstarWardrobeCards .item-card[data-piece='top-sweater-ls2-heather'] .equip-btn").click();
    const sweater = { ...grey, top: "top-sweater-ls2-heather" };
    await expect.poll(() => stored(page), { timeout: 15000 }).toEqual(sweater);
    const sweaterOutfit = "top-sweater-ls2-heather+bottom-trousers-square-navy+shoes-sneakers-white";
    // a manual reload, then a new login in a fresh browser session WITHOUT the opt-in; Avatar, Hub and the quiz draw the same
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#northstarWardrobeCards .item-card")).toHaveCount(CARDS_OPTED, { timeout: 30000 });
    await page.getByRole("tab", { name: "Hoved", exact: true }).click();
    await expect(hairCard(page, "nh5b-grey")).toHaveClass(/equipped/);
    await ctx.close();
    ({ ctx, page } = await signedIn(browser));
    const want = { hair: "nh5b-grey", head: HEAD("nh5b-grey"), outfit: sweaterOutfit };
    expect(await shownOn(page, "avatar.html", "avatar-preview", "avatar"), "on Avatar after a new login").toEqual(want);
    expect(await shownOn(page, "hub.html", "profileAvatar", "hub"), "on Hub").toEqual(want);
    expect(await shownOn(page, "index.html", "avatar-display", "quiz"), "in the quiz").toEqual(want);
    // the brown (opted in again), then after another new login; then an older choice without a hairstyle: the standard hair everywhere
    await openWardrobe(page, true);
    await page.getByRole("tab", { name: "Hoved", exact: true }).click();
    await hairCard(page, "nh5b-brown").locator(".equip-btn").click();
    await expect.poll(() => stored(page), { timeout: 15000 }).toEqual({ ...sweater, hair: "nh5b-brown" });
    expect(await outfitNow(page), "the outfit stays").toBe(sweaterOutfit);
    await ctx.close();
    ({ ctx, page } = await signedIn(browser));
    const brown = { ...want, hair: "nh5b-brown", head: HEAD("nh5b-brown") };
    expect(await shownOn(page, "avatar.html", "avatar-preview", "avatar"), "brown on Avatar after a new login").toEqual(brown);
    expect(await shownOn(page, "hub.html", "profileAvatar", "hub"), "brown on Hub").toEqual(brown);
    expect(await shownOn(page, "index.html", "avatar-display", "quiz"), "brown in the quiz").toEqual(brown);
    expect(await directSave(page, { outfit: "K07", pants: "TS-NAV", shoes: "SV1-V5-CHALK", top: "TK-NAVY" })).toBe(null);
    const older = { hair: "standard", head: HEAD("standard"), outfit: "top-tank-navy+bottom-trousers-square-navy+shoes-sneakers-low-sv1-chalk" };
    expect(await shownOn(page, "avatar.html", "avatar-preview", "avatar"), "older choice on Avatar").toEqual(older);
    expect(await shownOn(page, "hub.html", "profileAvatar", "hub"), "older choice on Hub").toEqual(older);
    expect(await shownOn(page, "index.html", "avatar-display", "quiz"), "older choice in the quiz").toEqual(older);
  } finally {
    try { await clearChoice(page); } finally { await ctx.close(); }
  }
});
