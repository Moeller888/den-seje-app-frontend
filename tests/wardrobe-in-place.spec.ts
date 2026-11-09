// D-366 — a wardrobe choice on Avatar changes the outfit in place: no navigation, no reload.
// SELF-SERVED + FIXTURE-INTERCEPTED: a local static server serves this branch's code; every *.supabase.co call is answered from a
// fictitious, stateful pupil (the stored choice changes as set_avatar_northstar is called). No real backend, account or token.
// At 1100 and 390 px it proves:
//   - "Tag på" redraws the figure in the existing preview without navigation or reload (a page marker survives, no load event);
//   - the category, the list's scroll position and keyboard focus stay; "✓ På" moves to the right card;
//   - a sweater chosen with the navy shorts swaps the bottom, and both cards and the note show at once;
//   - the choice is saved on the account and kept after a manual reload and in a new session;
//   - quick choices: one save at a time, only the newest waiting choice is sent, a late answer never overwrites a newer choice;
//   - a failed save shows the last saved outfit again with a short message.
// Before/after screenshots are attached for the review.

import { test, expect, Route, Page } from "@playwright/test";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REF = "tjzbehwfagiwpwodsgwg";
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".svg": "image/svg+xml", ".css": "text/css", ".webp": "image/webp", ".png": "image/png", ".json": "application/json", ".wav": "audio/wav" };

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

const UID = "00000000-0000-4000-8000-000000000366";
const USER = { id: UID, aud: "authenticated", role: "authenticated", email: "d366@e.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
// LOCAL FICTITIOUS fixture token — not a real JWT, not from .env, not a production/account token.
function jwt() { const b = (o: any) => Buffer.from(JSON.stringify(o)).toString("base64url"); return b({ alg: "HS256", typ: "JWT" }) + "." + b({ sub: UID, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 2592000 }) + ".s"; }
const SESSION = { access_token: jwt(), token_type: "bearer", expires_in: 2592000, expires_at: Math.floor(Date.now() / 1000) + 2592000, refresh_token: "f", user: USER };
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS" };

// The stored choice, and how the next saves are answered: "ok", "fail", or held until released (to make a slow answer).
type Pupil = { northstar: Record<string, string> | null; sent: string[]; mode: "ok" | "fail" | "hold"; held: Array<() => void> };
const newPupil = (): Pupil => ({ northstar: null, sent: [], mode: "ok", held: [] });
const identity = (pupil: Pupil) => ({ v: 1, body_type: "neutral", skin_tone: "medium", hairstyle: "tousled", hair_color: "brown", chosen_at: "2026-06-01T00:00:00Z", ...(pupil.northstar ? { northstar: pupil.northstar } : {}) });

function routeFor(pupil: Pupil) {
  return async (r: Route) => {
    const req = r.request();
    if (req.method() === "OPTIONS") return r.fulfill({ status: 204, headers: CORS });
    const p = new URL(req.url()).pathname;
    const wo = ((req.headers()["accept"]) || "").includes("vnd.pgrst.object");
    const j = (b: any) => r.fulfill({ status: 200, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify(b) });
    if (p.startsWith("/auth/v1/user")) return j(USER);
    if (p.startsWith("/auth/v1/token")) return j(SESSION);
    if (p.startsWith("/auth/v1/logout")) return r.fulfill({ status: 204, headers: CORS });
    if (p === "/rest/v1/rpc/set_avatar_northstar") {
      let c: any = {};
      try { c = JSON.parse(req.postData() || "{}").p_choice || {}; } catch { c = {}; }
      pupil.sent.push(JSON.stringify(c));
      const answer = () => {
        if (pupil.mode === "fail") return r.fulfill({ status: 400, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify({ message: "fixture: refused" }) });
        pupil.northstar = Object.keys(c).length ? c : null;
        return j(identity(pupil));
      };
      if (pupil.mode === "hold") { pupil.held.push(() => { answer(); }); return; }
      return answer();
    }
    if (p.startsWith("/rest/v1/rpc/")) return j(null);
    if (p.startsWith("/rest/v1/profiles")) {
      const row = { id: UID, role: "student", name: "D", email: "d366@e.com", equipped_slots: {}, active_title: null, active_theme: "default", avatar_gender: "neutral", avatar_identity: identity(pupil), grade: 5, selected_grade: 5, placement_band: 2, current_band: 2, xp: 420, coins: 100 };
      return j(wo ? row : [row]);
    }
    if (p.startsWith("/rest/v1/student_progress")) return j([{ student_id: UID, xp: 420, coins: 100 }]);
    return j([]);
  };
}

async function openAvatar(browser: any, pupil: Pupil, width: number) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
  await ctx.route("**://*.supabase.co/**", routeFor(pupil));
  await ctx.addInitScript(([k, s]: [string, any]) => { localStorage.setItem(k, JSON.stringify(s)); }, [`sb-${REF}-auth-token`, SESSION]);
  const page: Page = await ctx.newPage();
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(`${baseUrl}/avatar.html`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#northstarWardrobeCards .item-card")).toHaveCount(79, { timeout: 30000 });
  return { ctx, page, errs };
}

const card = (page: Page, piece: string) => page.locator(`#northstarWardrobeCards .item-card[data-piece='${piece}']`);
const worn = (page: Page) => page.locator("#northstarWardrobeCards .item-card.equipped").evaluateAll((cs) => cs.map((c) => (c as HTMLElement).dataset.piece).sort());
const outfitNow = (page: Page) => page.evaluate(async () => { const L: any = await import("/js/avatar-layers.js"); const o = L.northstarOutfitNow(); return o ? [o.top, o.bottom, o.shoes].join("+") : null; });
// The figure is drawn as one composed image: what the preview shows is its source, rendered on the Northstar path.
const figure = (page: Page) => page.evaluate(() => { const p = document.getElementById("avatar-preview")!; const i = p.querySelector("img[data-c2-layer]") as HTMLImageElement | null;
  return { src: i ? i.getAttribute("src") : null, path: p.dataset.avatarRenderPath || null, rendered: p.getAttribute("data-avatar-rendered") === "1", opacity: i ? getComputedStyle(i).opacity : null }; });
/** Waits until the preview shows a newly drawn figure (a different image than `before`), completely rendered on the Northstar path, and
 *  fully visible: the figure is swapped, never faded in from nothing. */
const redrawn = async (page: Page, before: string | null) => {
  await expect.poll(async () => { const f = await figure(page); return f.rendered && f.path === "northstar" && !!f.src && f.src !== before; }, { timeout: 15000 }).toBe(true);
  expect((await figure(page)).opacity, "the new figure is fully visible at once").toBe("1");
};
const scrollTop = (page: Page) => page.evaluate(() => { const c = document.querySelector(".right-column") as HTMLElement; return c && c.scrollHeight > c.clientHeight ? c.scrollTop : window.scrollY; });
const shot = async (page: Page, name: string) => {
  const file = test.info().outputPath(name + ".png");
  await page.waitForFunction(() => Array.from(document.images).filter((i) => i.offsetParent !== null && i.getBoundingClientRect().top < window.innerHeight).every((i) => i.complete), null, { timeout: 10000 }).catch(() => {});
  await page.screenshot({ path: file, fullPage: true });
  await test.info().attach(name, { path: file, contentType: "image/png" });
};
/** Scrolls the list a little, so a kept scroll position is visible: the right column on desktop, the page on a phone. */
const scrollList = (page: Page, by: number) => page.evaluate((y) => { const c = document.querySelector(".right-column") as HTMLElement; if (c && c.scrollHeight > c.clientHeight) c.scrollTop = y; else window.scrollTo(0, y); }, by);

for (const width of [1100, 390]) {
  test(`D-366 at ${width} px: "Tag på" changes the outfit in place — category, scroll, focus, swap, saved on the account`, async ({ browser, browserName }) => {
    test.skip(browserName !== "chromium", "UI dedup");
    test.setTimeout(120000);   // two page loads, a manual reload and a second session in one test
    const pupil = newPupil();
    pupil.northstar = { outfit: "K01" };
    const { ctx, page, errs } = await openAvatar(browser, pupil, width);
    let loads = 0, navigations = 0;
    page.on("load", () => { loads++; });
    // the category menu writes #kategori=<key> (D-363) — a same-document change; anything else would be a navigation
    const start = page.url().split("#")[0];
    page.on("framenavigated", (f) => { if (f === page.mainFrame() && f.url().split("#")[0] !== start) navigations++; });
    await page.evaluate(() => { (window as any).__d366 = "same page"; });

    // the navy shorts, chosen in Underdele after scrolling the list a little
    await page.getByRole("tab", { name: "Underdele", exact: true }).click();
    await scrollList(page, 120);
    const before = await scrollTop(page);
    const fig0 = (await figure(page)).src;
    await shot(page, `d366-${width}-foer`);
    await card(page, "bottom-shorts-navy").locator(".equip-btn").focus();
    await page.keyboard.press("Enter");
    expect((await figure(page)).src, "the preview is never empty while the new figure loads").not.toBeNull();
    await expect(card(page, "bottom-shorts-navy")).toHaveClass(/equipped/);
    await expect(card(page, "bottom-shorts-navy").locator(".equipped-label")).toHaveText("✓ På");
    expect(await page.evaluate(() => document.activeElement && (document.activeElement as HTMLElement).dataset.piece)).toBe("bottom-shorts-navy");   // focus stays on the card
    await expect(page.locator("#categoryTabs [aria-selected=true]")).toHaveText("Underdele");
    expect(await scrollTop(page)).toBe(before);
    await redrawn(page, fig0);
    expect((await outfitNow(page))!.split("+")[1]).toBe("bottom-shorts-navy");
    await expect.poll(() => pupil.sent.length).toBe(1);
    await expect.poll(() => JSON.stringify(pupil.northstar)).toBe(pupil.sent[0]);   // saved on the account
    await shot(page, `d366-${width}-efter`);

    // a sweater with the navy shorts: the bottom is swapped, both marks and the note at once
    await page.getByRole("tab", { name: "Overdele", exact: true }).click();
    const fig1 = (await figure(page)).src;
    await card(page, "top-sweater-ls2-green-check").locator(".equip-btn").click();
    await expect(card(page, "top-sweater-ls2-green-check")).toHaveClass(/equipped/);
    const swapped = (await outfitNow(page))!;
    expect(swapped.startsWith("top-sweater-ls2-green-check+")).toBe(true);
    expect(swapped).not.toContain("bottom-shorts-navy");
    const bottom = swapped.split("+")[1];
    expect(await worn(page)).toContain(bottom);
    expect(await worn(page)).not.toContain("bottom-shorts-navy");
    await expect(page.locator("#northstarWardrobe .northstar-status")).toContainText("passer ikke til");
    await redrawn(page, fig1);
    await shot(page, `d366-${width}-sweater-skift`);
    await expect.poll(() => pupil.sent.length).toBe(2);
    await expect.poll(() => JSON.stringify(pupil.northstar)).toBe(pupil.sent[1]);

    expect(loads, "no reload").toBe(0);
    expect(navigations, "no navigation").toBe(0);
    expect(await page.evaluate(() => (window as any).__d366)).toBe("same page");
    expect(errs.filter((e) => !/favicon/i.test(e)), "no page errors").toEqual([]);

    // kept after a manual reload, and in a new session
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#northstarWardrobeCards .item-card")).toHaveCount(79, { timeout: 30000 });
    expect(await outfitNow(page)).toBe(swapped);
    await ctx.close();
    const again = await openAvatar(browser, pupil, width);
    expect(await outfitNow(again.page)).toBe(swapped);
    await expect(card(again.page, "top-sweater-ls2-green-check")).toHaveClass(/equipped/);
    await again.ctx.close();
  });
}

test("D-366: quick choices — one save at a time, only the newest waiting choice is sent, a late answer never wins", async ({ browser, browserName }) => {
  test.skip(browserName !== "chromium", "UI dedup");
  const pupil = newPupil();
  pupil.northstar = { outfit: "K01" };
  const { ctx, page } = await openAvatar(browser, pupil, 1100);
  pupil.mode = "hold";
  for (const piece of ["top-tank-navy", "top-tank-breton-stripe", "top-sweater-ls2-green-check"]) await card(page, piece).locator(".equip-btn").click();
  // the figure and the marks show the newest choice at once; the first save is still out, the middle one never sent
  await expect(card(page, "top-sweater-ls2-green-check")).toHaveClass(/equipped/);
  expect((await outfitNow(page))!.startsWith("top-sweater-ls2-green-check+")).toBe(true);
  expect(pupil.sent.length).toBe(1);
  expect(pupil.sent[0]).toContain("TK-NAVY");               // the first choice is out, held
  pupil.mode = "ok";
  pupil.held.shift()!();                                   // the late answer to the first choice arrives
  await expect.poll(() => pupil.sent.length).toBe(2);      // the middle choice was never sent; the newest was
  await expect.poll(() => JSON.stringify(pupil.northstar)).toBe(pupil.sent[1]);
  expect(pupil.sent[1]).not.toContain("TK-");
  expect((await outfitNow(page))!.startsWith("top-sweater-ls2-green-check+")).toBe(true);
  await page.waitForTimeout(500);
  expect(pupil.sent.length, "nothing more is sent").toBe(2);
  await expect(page.locator("#northstarWardrobe .northstar-status")).not.toContainText("kunne ikke gemmes");
  await ctx.close();
  const again = await openAvatar(browser, pupil, 1100);   // the account holds the newest choice
  expect((await outfitNow(again.page))!.startsWith("top-sweater-ls2-green-check+")).toBe(true);
  await again.ctx.close();
});

test("D-366: a failed save shows the last saved outfit again with a short message", async ({ browser, browserName }) => {
  test.skip(browserName !== "chromium", "UI dedup");
  const pupil = newPupil();
  pupil.northstar = { outfit: "K01" };
  const { ctx, page } = await openAvatar(browser, pupil, 1100);
  const savedOutfit = await outfitNow(page);
  pupil.mode = "fail";
  await card(page, "top-tank-navy").locator(".equip-btn").click();
  await expect(page.locator("#northstarWardrobe .northstar-status")).toContainText("Valget kunne ikke gemmes. Prøv igen.");
  expect(await outfitNow(page)).toBe(savedOutfit);
  await expect(card(page, "top-tank-navy")).not.toHaveClass(/equipped/);
  await expect(card(page, savedOutfit!.split("+")[0])).toHaveClass(/equipped/);
  await shot(page, "d366-1100-fejlet-gemning");
  // and a later choice that saves works again
  pupil.mode = "ok";
  await card(page, "top-tank-navy").locator(".equip-btn").click();
  await expect.poll(() => JSON.stringify(pupil.northstar)).toContain("TK-NAVY");
  await ctx.close();
});
