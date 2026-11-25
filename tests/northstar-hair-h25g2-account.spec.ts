// D-387 — HAIR-25 group 2 (three hairstyles, each in grey and brown) SAVED ON THE TEST PUPIL'S ACCOUNT. The six cards are hidden by
// default (NORTHSTAR_HAIR_H25G2 = false), so the choosing browser opts in with ?northstarh25g2=1 (the documented opt-in for the later
// production test): each of the six is chosen in place on Avatar and saved with the outfit, which stays; a part (tank top, sweater)
// keeps the hairstyle; the choice is kept after a manual reload and after a new login in a fresh browser WITHOUT the opt-in, and drawn
// the same on Avatar, Hub and in the quiz (a grey and a brown of two different styles); an older choice without a hairstyle gets the
// standard hair.
// Runs against the suite's environment (the isolated stack in CI, which replays D-387's migration — REPO_AHEAD_OF_PRODUCTION) with the
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
const CARDS = 98;          // the 79 parts and the nineteen hairstyles of D-374/D-378/D-381/D-386; group 2 hidden
const CARDS_OPT_IN = 104;  // and group 2's six with this browser's opt-in (D-387)
const G2 = ["h25d1", "h25v1", "h25n9"].flatMap((s) => [s + "-grey", s + "-brown"]);

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
async function openWardrobe(page: Page, query = "", cards = CARDS) {
  await page.goto(`${PROD}/avatar.html${query}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#northstarWardrobeCards .item-card")).toHaveCount(cards, { timeout: 30000 });
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
  await openWardrobe(page, "", (await page.evaluate(() => { try { return localStorage.getItem("avatar_northstar_hair_h25g2"); } catch { return null; } })) === "1" ? CARDS_OPT_IN : CARDS);
  const back = page.getByRole("button", { name: "Brug min nuværende avatar", exact: true });
  if (await back.isVisible()) {
    await back.click();
    await expect.poll(() => stored(page), { timeout: 15000 }).toBe(null);
  }
}
const HEAD = (hair: string) => "/assets/avatar-northstar-hair/head-" + hair + "-v1.webp";
const FREE = { outfit: "FRI", top: "top-tee-hip-blue", pants: "bottom-trousers-square-navy", shoes: "shoes-sneakers-white" };

test("D-387: all six group-2 hairstyles are saved on the account with the outfit, kept after a reload and a new login, and drawn the same on Avatar, Hub and in the quiz", async ({ browser, browserName }) => {
  test.skip(browserName !== "chromium", "UI dedup");
  test.setTimeout(360000);
  let { ctx, page } = await signedIn(browser);
  try {
    await clearChoice(page);
    // the probe: does this database accept group 2 (D-387's migration)? production refuses it until then, and nothing is written
    const refused = await directSave(page, { ...FREE, hair: "h25d1-grey" });
    test.skip(refused !== null, "this database's validate_avatar_identity has no D-387 migration: " + refused);
    expect(await directSave(page, { ...FREE })).toBe(null);
    // hidden by default; the choosing browser opts in
    await openWardrobe(page);
    expect(await page.evaluate(() => localStorage.getItem("avatar_northstar_hair_h25g2")), "no opt-in in this browser yet").toBe(null);
    for (const k of G2) await expect(hairCard(page, k)).toHaveCount(0);
    await openWardrobe(page, "?northstarh25g2=1", CARDS_OPT_IN);
    expect(await page.evaluate(() => localStorage.getItem("avatar_northstar_hair_h25g2"))).toBe("1");
    let loads = 0, saves = 0;
    page.on("load", () => { loads++; });
    page.on("request", (r) => { if (r.url().includes("/rest/v1/rpc/set_avatar_northstar")) saves++; });
    const outfit = "top-tee-hip-blue+bottom-trousers-square-navy+shoes-sneakers-white";
    expect(await outfitNow(page)).toBe(outfit);
    await page.getByRole("tab", { name: "Hoved", exact: true }).click();
    await expect(hairCard(page, "standard")).toHaveClass(/equipped/);
    // each of the six, chosen in place: saved with the outfit, which stays
    for (const [n, hair] of G2.entries()) {
      await hairCard(page, hair).locator(".equip-btn").click();
      await expect(hairCard(page, hair)).toHaveClass(/equipped/);
      await expect.poll(() => saves).toBe(n + 1);
      await expect.poll(() => stored(page), { timeout: 15000 }).toEqual({ ...FREE, hair });
      expect(await outfitNow(page), hair + ": the outfit stays").toBe(outfit);
    }
    expect(loads, "no reload").toBe(0);
    // back to the D1 grey; a part keeps it: the tank top, then the sweater
    await hairCard(page, "h25d1-grey").locator(".equip-btn").click();
    const grey = { ...FREE, hair: "h25d1-grey" };
    await expect.poll(() => stored(page), { timeout: 15000 }).toEqual(grey);
    await page.getByRole("tab", { name: "Overdele", exact: true }).click();
    await page.locator("#northstarWardrobeCards .item-card[data-piece='top-tank-navy'] .equip-btn").click();
    await expect.poll(() => stored(page), { timeout: 15000 }).toEqual({ ...grey, top: "top-tank-navy" });
    await page.locator("#northstarWardrobeCards .item-card[data-piece='top-sweater-ls2-heather'] .equip-btn").click();
    const sweater = { ...grey, top: "top-sweater-ls2-heather" };
    await expect.poll(() => stored(page), { timeout: 15000 }).toEqual(sweater);
    const sweaterOutfit = "top-sweater-ls2-heather+bottom-trousers-square-navy+shoes-sneakers-white";
    // a manual reload, then a new login in a fresh browser session WITHOUT the opt-in; Avatar, Hub and the quiz draw the same
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#northstarWardrobeCards .item-card")).toHaveCount(CARDS_OPT_IN, { timeout: 30000 });
    await page.getByRole("tab", { name: "Hoved", exact: true }).click();
    await expect(hairCard(page, "h25d1-grey")).toHaveClass(/equipped/);
    await ctx.close();
    ({ ctx, page } = await signedIn(browser));
    const want = { hair: "h25d1-grey", head: HEAD("h25d1-grey"), outfit: sweaterOutfit };
    expect(await shownOn(page, "avatar.html", "avatar-preview", "avatar"), "on Avatar after a new login").toEqual(want);
    expect(await page.evaluate(() => localStorage.getItem("avatar_northstar_hair_h25g2")), "the new browser has no opt-in").toBe(null);
    expect(await shownOn(page, "hub.html", "profileAvatar", "hub"), "on Hub").toEqual(want);
    expect(await shownOn(page, "index.html", "avatar-display", "quiz"), "in the quiz").toEqual(want);
    // another style in brown (the long straight hair), then after another new login
    await openWardrobe(page, "?northstarh25g2=1", CARDS_OPT_IN);
    await page.getByRole("tab", { name: "Hoved", exact: true }).click();
    await hairCard(page, "h25n9-brown").locator(".equip-btn").click();
    await expect.poll(() => stored(page), { timeout: 15000 }).toEqual({ ...sweater, hair: "h25n9-brown" });
    expect(await outfitNow(page), "the outfit stays").toBe(sweaterOutfit);
    await ctx.close();
    ({ ctx, page } = await signedIn(browser));
    const brown = { ...want, hair: "h25n9-brown", head: HEAD("h25n9-brown") };
    expect(await shownOn(page, "avatar.html", "avatar-preview", "avatar"), "brown on Avatar after a new login").toEqual(brown);
    expect(await shownOn(page, "hub.html", "profileAvatar", "hub"), "brown on Hub").toEqual(brown);
    expect(await shownOn(page, "index.html", "avatar-display", "quiz"), "brown in the quiz").toEqual(brown);
    // an older choice without a hairstyle: the standard hair everywhere
    expect(await directSave(page, { outfit: "K07", pants: "TS-NAV", shoes: "SV1-V5-CHALK", top: "TK-NAVY" })).toBe(null);
    const older = { hair: "standard", head: HEAD("standard"), outfit: "top-tank-navy+bottom-trousers-square-navy+shoes-sneakers-low-sv1-chalk" };
    expect(await shownOn(page, "avatar.html", "avatar-preview", "avatar"), "older choice on Avatar").toEqual(older);
    expect(await shownOn(page, "hub.html", "profileAvatar", "hub"), "older choice on Hub").toEqual(older);
    expect(await shownOn(page, "index.html", "avatar-display", "quiz"), "older choice in the quiz").toEqual(older);
  } finally {
    try { await clearChoice(page); } finally { await ctx.close(); }
  }
});
