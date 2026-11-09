// D-366 — a wardrobe choice on Avatar changes the outfit in place: no navigation, no reload. D-367 — only the chosen part changes.
// SELF-SERVED + FIXTURE-INTERCEPTED: a local static server serves this branch's code; every *.supabase.co call is answered from a
// fictitious, stateful pupil (the stored choice changes as set_avatar_northstar is called). No real backend, account or token.
// At 1100 and 390 px it proves:
//   - "Tag på" redraws the figure in the existing preview without navigation or reload (a page marker survives, no load event);
//   - the category, the list's scroll position and keyboard focus stay; "✓ På" moves to the right card;
//   - D-370: the wardrobe is free: any top, bottom or shoes goes on, exactly the chosen part changes, saved as the three parts. Only an
//     outfit the renderer will not draw (the three known faults, until the layer fixes are published) is refused and changes nothing;
//   - the choice is saved on the account and kept after a manual reload and in a new session;
//   - quick choices: one save at a time, only the newest waiting choice is sent, a late answer never overwrites a newer choice;
//   - a failed save shows the last saved outfit again with a short message.
// Before/after screenshots are attached for the review.

import { test, expect, Route, Page } from "@playwright/test";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REF = "tjzbehwfagiwpwodsgwg";
// With NORTHSTAR_LAYER_FIXES_DIR (the owner's machine only: private staging, hashes checked) the page runs with the layer fixes on.
const STAGING = process.env.NORTHSTAR_LAYER_FIXES_DIR || null;
const STAGED = STAGING ? new Map((JSON.parse(fs.readFileSync(path.join(ROOT, "tools/avatar/fixtures/northstar-wardrobe/free-combination/layer-fixes-staging-v1.json"), "utf8")).files as Array<{ file: string; sha256: string }>).map((f) => {
  const b = fs.readFileSync(path.join(STAGING, f.file));
  if (crypto.createHash("sha256").update(b).digest("hex") !== f.sha256) throw new Error("not the approved staging file: " + f.file);
  return ["/assets/avatar-northstar/" + f.file, b] as [string, Buffer];
})) : new Map<string, Buffer>();
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".svg": "image/svg+xml", ".css": "text/css", ".webp": "image/webp", ".png": "image/png", ".json": "application/json", ".wav": "audio/wav" };

let server: http.Server;
let baseUrl: string;
test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    try {
      const p = decodeURIComponent((req.url || "/").split("?")[0]);
      const fp = path.normalize(path.join(ROOT, p === "/" ? "/index.html" : p));
      if (!fp.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      let data: Buffer = STAGED.get(p) || (undefined as unknown as Buffer);
      if (!data) { data = fs.readFileSync(fp); if (STAGING && p === "/js/avatar-layers.js") data = Buffer.from(data.toString("utf8").replace("NORTHSTAR_LAYER_FIXES = false;", "NORTHSTAR_LAYER_FIXES = true;")); }
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
  test(`D-370 at ${width} px: every part goes on freely and only that part changes, in place`, async ({ browser, browserName }) => {
    test.skip(browserName !== "chromium", "UI dedup");
    test.setTimeout(120000);   // two page loads, a manual reload and a second session in one test
    const pupil = newPupil();
    pupil.northstar = { outfit: "K01" };   // an older choice: creme T-shirt, sand skirt, beige sneakers
    const { ctx, page, errs } = await openAvatar(browser, pupil, width);
    await page.waitForLoadState("load");   // the page's own first load event (it can come late, e.g. on a slower host) is not a reload
    await expect.poll(async () => { const f = await figure(page); return f.rendered && f.path === "northstar" && !!f.src; }, { timeout: 30000 }).toBe(true);
    expect(await outfitNow(page), "the older choice reads as before").toBe("top-tee-hip-cream+bottom-skirt-sand+shoes-sneakers-beige");
    let loads = 0, navigations = 0;
    const start = page.url().split("#")[0];   // the category menu writes #kategori=<key> (D-363), a same-document change
    page.on("load", () => { loads++; });
    page.on("framenavigated", (f) => { if (f === page.mainFrame() && f.url().split("#")[0] !== start) navigations++; });
    await page.evaluate(() => { (window as any).__d366 = "same page"; });
    const status = page.locator("#northstarWardrobe .northstar-status");
    /** Exactly that part changes, the figure is redrawn in place, the "✓ På" mark moves, and the three parts are saved. */
    const accepted = async (piece: string, category: "top" | "bottom" | "shoes") => {
      const before = (await outfitNow(page))!.split("+"), fig = (await figure(page)).src, sent = pupil.sent.length, at = { top: 0, bottom: 1, shoes: 2 }[category];
      await card(page, piece).locator(".equip-btn").click();
      await expect(card(page, piece)).toHaveClass(/equipped/);
      await expect(card(page, piece).locator(".equipped-label")).toHaveText("✓ På");
      await expect(card(page, before[at]), "the old part is no longer marked").not.toHaveClass(/equipped/);
      const after = (await outfitNow(page))!.split("+");
      expect(after[at]).toBe(piece);
      expect(after.filter((_x, i) => i !== at), "the other two parts are exactly the same").toEqual(before.filter((_x, i) => i !== at));
      await redrawn(page, fig);
      await expect.poll(() => pupil.sent.length).toBe(sent + 1);
      expect(JSON.parse(pupil.sent[sent])).toEqual({ outfit: "FRI", top: after[0], pants: after[1], shoes: after[2] });
      await expect.poll(() => JSON.stringify(pupil.northstar)).toBe(pupil.sent[sent]);   // saved on the account
      await expect(status).not.toContainText("passer ikke");
    };

    // brown ankle boots with the creme T-shirt and sand skirt, refused before D-370
    await page.getByRole("tab", { name: "Sko", exact: true }).click();
    await accepted("shoes-ankleboots-brown", "shoes");

    // from the keyboard after scrolling the list: only the shoes change; category, scroll and focus stay
    await scrollList(page, 120);
    await shot(page, `d370-${width}-foer`);
    const fig0 = (await figure(page)).src;
    await card(page, "shoes-sneakers-low-sv1-chalk").locator(".equip-btn").focus();   // focusing a card far down the list scrolls it into view
    const scrolled = await scrollTop(page);
    await page.keyboard.press("Enter");
    expect((await figure(page)).src, "the preview is never empty while the new figure loads").not.toBeNull();
    await expect(card(page, "shoes-sneakers-low-sv1-chalk")).toHaveClass(/equipped/);
    expect(await page.evaluate(() => document.activeElement && (document.activeElement as HTMLElement).dataset.piece)).toBe("shoes-sneakers-low-sv1-chalk");   // focus stays on the card
    await expect(page.locator("#categoryTabs [aria-selected=true]")).toHaveText("Sko");
    expect(await scrollTop(page)).toBe(scrolled);
    await redrawn(page, fig0);
    await expect.poll(() => pupil.sent.length).toBe(2);

    // the olive trousers with the creme T-shirt and these sneakers: on an approval list, but not selectable before D-370
    await page.getByRole("tab", { name: "Underdele", exact: true }).click();
    await accepted("bottom-trousers-square-olive", "bottom");
    expect(await outfitNow(page)).toBe("top-tee-hip-cream+bottom-trousers-square-olive+shoes-sneakers-low-sv1-chalk");
    await shot(page, `d370-${width}-oliven`);
    // a sweater over the olive trousers, then over the navy shorts; the charcoal sneakers under long trousers
    await page.getByRole("tab", { name: "Overdele", exact: true }).click();
    await accepted("top-sweater-ls2-green-check", "top");
    await page.getByRole("tab", { name: "Sko", exact: true }).click();
    await accepted("shoes-sneakers-low-sv1-charcoal", "shoes");
    await page.getByRole("tab", { name: "Underdele", exact: true }).click();
    await accepted("bottom-shorts-navy", "bottom");
    const final = (await outfitNow(page))!;
    expect(final).toBe("top-sweater-ls2-green-check+bottom-shorts-navy+shoes-sneakers-low-sv1-charcoal");
    await shot(page, `d370-${width}-efter`);

    expect(loads, "no reload").toBe(0);
    expect(navigations, "no navigation").toBe(0);
    expect(await page.evaluate(() => (window as any).__d366)).toBe("same page");
    expect(errs.filter((e) => !/favicon/i.test(e)), "no page errors").toEqual([]);

    // kept after a manual reload, and in a new session
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#northstarWardrobeCards .item-card")).toHaveCount(79, { timeout: 30000 });
    expect(await outfitNow(page)).toBe(final);
    await ctx.close();
    const again = await openAvatar(browser, pupil, width);
    expect(await outfitNow(again.page)).toBe(final);
    await expect(card(again.page, "shoes-sneakers-low-sv1-charcoal")).toHaveClass(/equipped/);
    await again.ctx.close();
  });

  test(`D-370 at ${width} px: quick choices across top, bottom and shoes keep each other; a failed save shows the last saved outfit`, async ({ browser, browserName }) => {
    test.skip(browserName !== "chromium", "UI dedup");
    test.setTimeout(90000);
    const pupil = newPupil();
    pupil.northstar = { outfit: "K01" };
    const { ctx, page } = await openAvatar(browser, pupil, width);
    const pick = async (tab: string, piece: string) => { await page.getByRole("tab", { name: tab, exact: true }).click(); await card(page, piece).locator(".equip-btn").click(); await expect(card(page, piece)).toHaveClass(/equipped/); };
    pupil.mode = "hold";
    await pick("Underdele", "bottom-trousers-square-olive");
    await pick("Overdele", "top-tank-navy");
    await pick("Sko", "shoes-ankleboots-ab1-lightsand");
    const newest = "top-tank-navy+bottom-trousers-square-olive+shoes-ankleboots-ab1-lightsand";
    expect(await outfitNow(page), "all three quick choices are shown at once").toBe(newest);
    expect(pupil.sent.length, "one save at a time").toBe(1);
    pupil.mode = "ok";
    pupil.held.shift()!();   // the late answer to the first choice
    await expect.poll(() => pupil.sent.length).toBe(2);   // the waiting newest choice goes; the middle one is never sent
    expect(JSON.parse(pupil.sent[1])).toEqual({ outfit: "FRI", top: "top-tank-navy", pants: "bottom-trousers-square-olive", shoes: "shoes-ankleboots-ab1-lightsand" });
    await expect.poll(() => JSON.stringify(pupil.northstar)).toBe(pupil.sent[1]);
    expect(await outfitNow(page), "a late answer never wins").toBe(newest);
    // a failed save: back to exactly the last saved outfit, marks included, and a later choice works
    pupil.mode = "fail";
    await page.getByRole("tab", { name: "Overdele", exact: true }).click();
    await card(page, "top-tee-hip-blue").locator(".equip-btn").click();
    await expect(page.locator("#northstarWardrobe .northstar-status")).toContainText("Valget kunne ikke gemmes. Prøv igen.");
    expect(await outfitNow(page)).toBe(newest);
    await expect(card(page, "top-tee-hip-blue")).not.toHaveClass(/equipped/);
    await expect(card(page, "top-tank-navy")).toHaveClass(/equipped/);
    await shot(page, `d370-${width}-fejlet-gemning`);
    pupil.mode = "ok";
    await card(page, "top-tee-hip-blue").locator(".equip-btn").click();
    await expect.poll(() => (pupil.northstar || {}).top).toBe("top-tee-hip-blue");
    await ctx.close();
  });
}

test("D-370: an outfit the renderer will not draw is refused and changes nothing; with the layer fixes it goes on", async ({ browser, browserName }) => {
  test.skip(browserName !== "chromium", "UI dedup");
  const pupil = newPupil();
  pupil.northstar = { outfit: "K10" };   // blue T-shirt, navy shorts, beige sneakers
  const { ctx, page } = await openAvatar(browser, pupil, 1100);
  await expect.poll(async () => { const f = await figure(page); return f.rendered && f.path === "northstar" && !!f.src; }, { timeout: 30000 }).toBe(true);
  await page.getByRole("tab", { name: "Underdele", exact: true }).click();
  const before = await outfitNow(page), fig = (await figure(page)).src;
  await card(page, "bottom-skirt-sand").locator(".equip-btn").click();
  if (STAGING) {
    await expect(card(page, "bottom-skirt-sand")).toHaveClass(/equipped/);
    await redrawn(page, fig);
    expect(await outfitNow(page)).toBe("top-tee-hip-blue+bottom-skirt-sand+shoes-sneakers-beige");
  } else {
    const reason = "Den underdel passer ikke til dit nuværende outfit.";
    await expect(page.locator("#northstarWardrobe .northstar-status")).toContainText(reason);
    await expect(card(page, "bottom-skirt-sand").locator(".northstar-refusal"), "the reason shows on the card the pupil pressed").toHaveText(reason);
    expect(await outfitNow(page), "the outfit stays").toBe(before);
    await page.waitForTimeout(400);
    expect((await figure(page)).src, "the figure is not redrawn").toBe(fig);
    expect(pupil.sent.length, "nothing is saved").toBe(0);
  }
  await ctx.close();
});

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
  expect(pupil.sent[0]).toContain("top-tank-navy");         // the first choice is out, held
  pupil.mode = "ok";
  pupil.held.shift()!();                                   // the late answer to the first choice arrives
  await expect.poll(() => pupil.sent.length).toBe(2);      // the middle choice was never sent; the newest was
  await expect.poll(() => JSON.stringify(pupil.northstar)).toBe(pupil.sent[1]);
  expect(pupil.sent[1]).not.toContain("top-tank");
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
  await expect.poll(() => JSON.stringify(pupil.northstar)).toContain("top-tank-navy");
  await ctx.close();
});
