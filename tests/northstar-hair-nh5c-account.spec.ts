// D-381 — the nape locks ("Nakkelokker · gråt" / "Nakkelokker · brunt") SAVED ON THE TEST PUPIL'S ACCOUNT. Their two cards are hidden by
// default (NORTHSTAR_HAIR_NH5C = false), so the choosing browser opts in with ?northstarnh5c=1 (the documented opt-in for the later
// production test): both colours are chosen in place on Avatar; the outfit stays; a part (tank top, sweater) keeps the nape locks; the
// choice is kept after a manual reload and after a new login in a fresh browser WITHOUT the opt-in, and drawn the same on Avatar, Hub and
// in the quiz; an older choice without a hairstyle gets the standard hair.
// Runs against the suite's environment (the isolated stack in CI, which replays D-381's migration — REPO_AHEAD_OF_PRODUCTION) with the
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
const CARDS = 84;          // the 79 parts, D-373's 3 hairstyles and the two top knots (D-378); the nape locks hidden
const CARDS_OPT_IN = 86;   // and the two nape locks with this browser's opt-in (D-381)

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
  await openWardrobe(page, "", (await page.evaluate(() => { try { return localStorage.getItem("avatar_northstar_hair_nh5c"); } catch { return null; } })) === "1" ? CARDS_OPT_IN : CARDS);
  const back = page.getByRole("button", { name: "Brug min nuværende avatar", exact: true });
  if (await back.isVisible()) {
    await back.click();
    await expect.poll(() => stored(page), { timeout: 15000 }).toBe(null);
  }
}
const HEAD = (hair: string) => "/assets/avatar-northstar-hair/head-" + hair + "-v1.webp";
const FREE = { outfit: "FRI", top: "top-tee-hip-blue", pants: "bottom-trousers-square-navy", shoes: "shoes-sneakers-white" };

test("D-381: both nape-lock colours are saved on the account with the outfit (opt-in browser), kept after a reload and a new login without the opt-in, and drawn the same on Avatar, Hub and in the quiz", async ({ browser, browserName }) => {
  test.skip(browserName !== "chromium", "UI dedup");
  test.setTimeout(240000);
  let { ctx, page } = await signedIn(browser);
  try {
    await clearChoice(page);
    // the probe: does this database accept the nape locks (D-381's migration)? production refuses them until then, and nothing is written
    const refused = await directSave(page, { ...FREE, hair: "nh5c-grey" });
    test.skip(refused !== null, "this database's validate_avatar_identity has no D-381 migration: " + refused);
    expect(await directSave(page, { ...FREE })).toBe(null);
    // hidden by default: no nape-lock card without the opt-in
    await openWardrobe(page);
    expect(await page.evaluate(() => localStorage.getItem("avatar_northstar_hair_nh5c")), "no opt-in in this browser yet").toBe(null);
    for (const k of ["nh5c-grey", "nh5c-brown"]) await expect(hairCard(page, k)).toHaveCount(0);
    // this browser opts in (the documented opt-in for the production test)
    await openWardrobe(page, "?northstarnh5c=1", CARDS_OPT_IN);
    expect(await page.evaluate(() => localStorage.getItem("avatar_northstar_hair_nh5c"))).toBe("1");
    let loads = 0, saves = 0;
    page.on("load", () => { loads++; });
    page.on("request", (r) => { if (r.url().includes("/rest/v1/rpc/set_avatar_northstar")) saves++; });
    const outfit = "top-tee-hip-blue+bottom-trousers-square-navy+shoes-sneakers-white";
    expect(await outfitNow(page)).toBe(outfit);
    await page.getByRole("tab", { name: "Hoved", exact: true }).click();
    await expect(hairCard(page, "standard")).toHaveClass(/equipped/);
    await hairCard(page, "nh5c-grey").locator(".equip-btn").click();
    await expect(hairCard(page, "nh5c-grey")).toHaveClass(/equipped/);
    await expect.poll(() => saves).toBe(1);
    const grey = { ...FREE, hair: "nh5c-grey" };
    await expect.poll(() => stored(page), { timeout: 15000 }).toEqual(grey);
    expect(await outfitNow(page), "the outfit stays").toBe(outfit);
    expect(loads, "no reload").toBe(0);
    // a part keeps the nape locks: the tank top, then the sweater
    await page.getByRole("tab", { name: "Overdele", exact: true }).click();
    await page.locator("#northstarWardrobeCards .item-card[data-piece='top-tank-navy'] .equip-btn").click();
    await expect.poll(() => stored(page), { timeout: 15000 }).toEqual({ ...grey, top: "top-tank-navy" });
    await page.locator("#northstarWardrobeCards .item-card[data-piece='top-sweater-ls2-heather'] .equip-btn").click();
    const sweater = { ...grey, top: "top-sweater-ls2-heather" };
    await expect.poll(() => stored(page), { timeout: 15000 }).toEqual(sweater);
    const sweaterOutfit = "top-sweater-ls2-heather+bottom-trousers-square-navy+shoes-sneakers-white";
    // a manual reload, then a new login in a fresh browser session without the opt-in; Avatar, Hub and the quiz draw the same
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#northstarWardrobeCards .item-card")).toHaveCount(CARDS_OPT_IN, { timeout: 30000 });
    await page.getByRole("tab", { name: "Hoved", exact: true }).click();
    await expect(hairCard(page, "nh5c-grey")).toHaveClass(/equipped/);
    await ctx.close();
    ({ ctx, page } = await signedIn(browser));
    const want = { hair: "nh5c-grey", head: HEAD("nh5c-grey"), outfit: sweaterOutfit };
    expect(await shownOn(page, "avatar.html", "avatar-preview", "avatar"), "on Avatar after a new login").toEqual(want);
    expect(await page.evaluate(() => localStorage.getItem("avatar_northstar_hair_nh5c")), "the new browser has no opt-in").toBe(null);
    expect(await shownOn(page, "hub.html", "profileAvatar", "hub"), "on Hub").toEqual(want);
    expect(await shownOn(page, "index.html", "avatar-display", "quiz"), "in the quiz").toEqual(want);
    // the brown, chosen in an opt-in browser, then after another new login without it
    await openWardrobe(page, "?northstarnh5c=1", CARDS_OPT_IN);
    await page.getByRole("tab", { name: "Hoved", exact: true }).click();
    await hairCard(page, "nh5c-brown").locator(".equip-btn").click();
    await expect.poll(() => stored(page), { timeout: 15000 }).toEqual({ ...sweater, hair: "nh5c-brown" });
    expect(await outfitNow(page), "the outfit stays").toBe(sweaterOutfit);
    await ctx.close();
    ({ ctx, page } = await signedIn(browser));
    const brown = { ...want, hair: "nh5c-brown", head: HEAD("nh5c-brown") };
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
