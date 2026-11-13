// D-373 — the hair choice on the Northstar figure, open by default (NORTHSTAR_HAIR_CHOICE = true).
// SELF-SERVED + FIXTURE-INTERCEPTED (as wardrobe-in-place.spec.ts): a local static server serves this branch's code; every *.supabase.co
// call is answered from a fictitious, stateful pupil (the stored choice changes as set_avatar_northstar is called). No real backend,
// account or token. It proves:
//   - on by default, WITHOUT any opt-in (no ?northstarhair=1, no localStorage): three hair cards under Hoved; a hairstyle goes on in place (no reload), the outfit stays and the
//     hairstyle is saved with it; a part keeps the hairstyle; after a reload the hairstyle stays; Hub and the quiz draw the same head;
//   - saved avatars: an older K choice and a free choice without a hairstyle get the standard hair; a pupil without a choice keeps
//     today's avatar;
//   - with a T-shirt, a tank top and a sweater, switching between the three hairstyles changes nothing at or below the neck (y ≥ 430):
//     those rows are exactly today's figure (no light arc across the neck), and the outfit never moves;
//   - the flag still switches it all off: this branch's avatar-layers.js served with NORTHSTAR_HAIR_CHOICE = false shows no hair
//     cards (79 cards) and today's head. That served copy is also the "today's figure" reference for the neck check.
// Screenshots of every hairstyle are attached for the review.

import { test, expect, Route, Page, Browser } from "@playwright/test";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
// @ts-ignore — a plain ES module of the avatar tools (PNG codec, no dependencies)
import { decodePng } from "../tools/avatar/r3-hair-tool-v2.mjs";

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

const UID = "00000000-0000-4000-8000-000000000373";
const USER = { id: UID, aud: "authenticated", role: "authenticated", email: "d373@e.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
// LOCAL FICTITIOUS fixture token — not a real JWT, not from .env, not a production/account token.
function jwt() { const b = (o: any) => Buffer.from(JSON.stringify(o)).toString("base64url"); return b({ alg: "HS256", typ: "JWT" }) + "." + b({ sub: UID, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 2592000 }) + ".s"; }
const SESSION = { access_token: jwt(), token_type: "bearer", expires_in: 2592000, expires_at: Math.floor(Date.now() / 1000) + 2592000, refresh_token: "f", user: USER };
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS" };

type Pupil = { northstar: Record<string, string> | null; sent: string[] };
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
      pupil.northstar = Object.keys(c).length ? c : null;
      return j(identity(pupil));
    }
    if (p.startsWith("/rest/v1/rpc/")) return j(null);
    if (p.startsWith("/rest/v1/profiles")) {
      const row = { id: UID, role: "student", name: "D", email: "d373@e.com", equipped_slots: {}, active_title: null, active_theme: "default", avatar_gender: "neutral", avatar_identity: identity(pupil), grade: 5, selected_grade: 5, placement_band: 2, current_band: 2, xp: 420, coins: 100 };
      return j(wo ? row : [row]);
    }
    if (p.startsWith("/rest/v1/student_progress")) return j([{ student_id: UID, xp: 420, coins: 100 }]);
    return j([]);
  };
}

const LAYERS = fs.readFileSync(path.join(ROOT, "js", "avatar-layers.js"), "utf8");
const FLAG_ON = "export const NORTHSTAR_HAIR_CHOICE = true;";
async function openPage(browser: Browser, pupil: Pupil, { optIn, flagOff = false }: { optIn: boolean; flagOff?: boolean }) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, reducedMotion: "reduce" });
  await ctx.route("**://*.supabase.co/**", routeFor(pupil));
  if (flagOff) {   // this branch's module with only the flag turned off: the figure as it was before the hair choice opened
    expect(LAYERS.split(FLAG_ON).length, "the flag line occurs once").toBe(2);
    await ctx.route(`${baseUrl}/js/avatar-layers.js*`, (r) => r.fulfill({ status: 200, headers: { "content-type": "text/javascript" }, body: LAYERS.replace(FLAG_ON, "export const NORTHSTAR_HAIR_CHOICE = false;") }));
  }
  await ctx.addInitScript(([k, s, hair]: [string, any, boolean]) => { localStorage.setItem(k, JSON.stringify(s)); if (hair) localStorage.setItem("avatar_northstar_hair", "1"); }, [`sb-${REF}-auth-token`, SESSION, optIn]);
  const page: Page = await ctx.newPage();
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  return { ctx, page, errs };
}
const openAvatar = async (page: Page, cards: number) => {
  await page.goto(`${baseUrl}/avatar.html`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#northstarWardrobeCards .item-card")).toHaveCount(cards, { timeout: 30000 });
};
const hairCard = (page: Page, hair: string) => page.locator(`#northstarWardrobeCards .item-card[data-hair='${hair}']`);
const outfitNow = (page: Page) => page.evaluate(async () => { const L: any = await import("/js/avatar-layers.js"); const o = L.northstarOutfitNow(); return o ? [o.top, o.bottom, o.shoes].join("+") : null; });
/** The hairstyle and head a surface's renderer uses for the named account. */
const headOn = (page: Page, surface: string) => page.evaluate(async (s) => { const L: any = await import("/js/avatar-layers.js"); const r = L.northstarRenderFor(s, []); return r ? { hair: r.hair ?? null, head: r.plan.filter((x: any) => x.op === "draw" && /head/.test(x.src)).map((x: any) => x.src) } : null; }, surface);
const figure = (page: Page, id = "avatar-preview") => page.evaluate((el) => { const p = document.getElementById(el)!; const i = p.querySelector("img[data-c2-layer]") as HTMLImageElement | null;
  return { src: i ? i.getAttribute("src") : null, path: p.dataset.avatarRenderPath || null, rendered: p.getAttribute("data-avatar-rendered") === "1" }; }, id);
const redrawn = async (page: Page, before: string | null) => {
  await expect.poll(async () => { const f = await figure(page); return f.rendered && f.path === "northstar" && !!f.src && f.src !== before; }, { timeout: 15000 }).toBe(true);
};
/** The composed figure in the preview as RGBA pixels (1024×1536). */
const figurePixels = async (page: Page): Promise<Uint8ClampedArray> => {
  const url = await page.evaluate(() => { const i = document.querySelector("#avatar-preview img[data-c2-layer]") as HTMLImageElement; const c = document.createElement("canvas"); c.width = i.naturalWidth; c.height = i.naturalHeight; c.getContext("2d")!.drawImage(i, 0, 0); return c.toDataURL("image/png"); });
  const d = decodePng(Buffer.from(url.split(",")[1], "base64"));
  expect([d.header.w, d.header.h]).toEqual([1024, 1536]);
  return d.px;
};
const rowsFrom = (a: Uint8ClampedArray, b: Uint8ClampedArray, y0: number) => { let n = 0; for (let i = y0 * 1024 * 4; i < a.length; i++) if (a[i] !== b[i]) n++; return n; };
const shot = async (page: Page, name: string) => {
  const file = test.info().outputPath(name + ".png");
  await page.locator("#avatar-preview").screenshot({ path: file });
  await test.info().attach(name, { path: file, contentType: "image/png" });
};
const FREE = { outfit: "FRI", top: "top-tee-hip-blue", pants: "bottom-trousers-square-navy", shoes: "shoes-sneakers-white" };

test("D-373 the flag still switches it off: with NORTHSTAR_HAIR_CHOICE = false and no opt-in — no hair cards, today's head", async ({ browser, browserName }) => {
  test.skip(browserName !== "chromium", "UI dedup");
  const pupil: Pupil = { northstar: { ...FREE }, sent: [] };
  const { ctx, page, errs } = await openPage(browser, pupil, { optIn: false, flagOff: true });
  await openAvatar(page, 79);
  await expect(page.locator("#northstarWardrobeCards [data-wardrobe-category='hair']")).toHaveCount(0);
  await expect.poll(async () => (await figure(page)).path, { timeout: 30000 }).toBe("northstar");
  expect(await headOn(page, "avatar")).toEqual({ hair: null, head: ["/assets/avatar-northstar/figure-head-v1.webp"] });
  expect(errs).toEqual([]);
  await ctx.close();
});

test("D-373 on by default, without the opt-in: a hairstyle goes on in place, keeps the outfit, is saved with it; a part keeps the hairstyle; both survive a reload, and Hub and the quiz draw the same", async ({ browser, browserName }) => {
  test.skip(browserName !== "chromium", "UI dedup");
  test.setTimeout(120000);
  const pupil: Pupil = { northstar: { ...FREE }, sent: [] };
  const { ctx, page, errs } = await openPage(browser, pupil, { optIn: false });
  await openAvatar(page, 82);
  expect(await page.evaluate(() => localStorage.getItem("avatar_northstar_hair")), "no opt-in in this browser").toBe(null);
  await page.waitForLoadState("load");
  await expect.poll(async () => { const f = await figure(page); return f.rendered && f.path === "northstar" && !!f.src; }, { timeout: 30000 }).toBe(true);
  expect(await headOn(page, "avatar")).toEqual({ hair: "standard", head: ["/assets/avatar-northstar-hair/head-standard-v1.webp"] });
  // the three hairstyles under Hoved, nowhere else
  await page.getByRole("tab", { name: "Hoved", exact: true }).click();
  await expect(page.locator("#northstarWardrobeCards [data-wardrobe-category='hair'] .item-card")).toHaveCount(3);
  await expect(page.locator("#northstarWardrobeCards [data-wardrobe-category='hair']")).toBeVisible();
  await expect(page.locator("#northstarWardrobeCards [data-wardrobe-category='top']")).toBeHidden();
  await expect(hairCard(page, "standard")).toHaveClass(/equipped/);
  await shot(page, "d373-standard");
  let loads = 0; page.on("load", () => { loads++; });
  const outfit = await outfitNow(page);
  for (const hair of ["nh4-grey", "nh4-brown"]) {
    const before = (await figure(page)).src, sent = pupil.sent.length;
    await hairCard(page, hair).locator(".equip-btn").click();
    await expect(hairCard(page, hair)).toHaveClass(/equipped/);
    await redrawn(page, before);
    expect(await headOn(page, "avatar")).toEqual({ hair, head: ["/assets/avatar-northstar-hair/head-" + hair + "-v1.webp"] });
    expect(await outfitNow(page), "the outfit stays").toBe(outfit);
    await expect.poll(() => pupil.sent.length).toBe(sent + 1);
    expect(JSON.parse(pupil.sent[sent])).toEqual({ ...FREE, hair });   // saved with the outfit
    await shot(page, "d373-" + hair);
  }
  expect(loads, "no reload").toBe(0);
  // a part keeps the hairstyle
  await page.getByRole("tab", { name: "Overdele", exact: true }).click();
  await page.locator("#northstarWardrobeCards .item-card[data-piece='top-tank-navy'] .equip-btn").click();
  await expect.poll(() => pupil.sent.length).toBe(3);
  expect(JSON.parse(pupil.sent[2])).toEqual({ ...FREE, top: "top-tank-navy", hair: "nh4-brown" });
  // a reload, then Hub and the quiz
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#northstarWardrobeCards .item-card")).toHaveCount(82, { timeout: 30000 });
  expect(await headOn(page, "avatar")).toEqual({ hair: "nh4-brown", head: ["/assets/avatar-northstar-hair/head-nh4-brown-v1.webp"] });
  expect(await outfitNow(page), "the part stays after the reload").toBe("top-tank-navy+bottom-trousers-square-navy+shoes-sneakers-white");
  await page.getByRole("tab", { name: "Hoved", exact: true }).click();
  await expect(hairCard(page, "nh4-brown")).toHaveClass(/equipped/);
  await page.getByRole("tab", { name: "Overdele", exact: true }).click();
  await expect(page.locator("#northstarWardrobeCards .item-card[data-piece='top-tank-navy']")).toHaveClass(/equipped/);
  // and the other way round: a hairstyle after the part keeps the part, also after a reload
  await page.getByRole("tab", { name: "Hoved", exact: true }).click();
  await hairCard(page, "nh4-grey").locator(".equip-btn").click();
  await expect.poll(() => pupil.sent.length).toBe(4);
  expect(JSON.parse(pupil.sent[3])).toEqual({ ...FREE, top: "top-tank-navy", hair: "nh4-grey" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#northstarWardrobeCards .item-card")).toHaveCount(82, { timeout: 30000 });
  expect(await headOn(page, "avatar")).toEqual({ hair: "nh4-grey", head: ["/assets/avatar-northstar-hair/head-nh4-grey-v1.webp"] });
  expect(await outfitNow(page), "the part stays after the hairstyle and a reload").toBe("top-tank-navy+bottom-trousers-square-navy+shoes-sneakers-white");
  for (const [url, el, surface] of [["hub.html", "profileAvatar", "hub"], ["index.html", "avatar-display", "quiz"]]) {
    await page.goto(`${baseUrl}/${url}`, { waitUntil: "domcontentloaded" });
    await expect.poll(() => page.evaluate((id) => document.getElementById(id)?.dataset.avatarRenderPath ?? null, el), { timeout: 30000 }).toBe("northstar");
    expect(await headOn(page, surface), surface).toEqual({ hair: "nh4-grey", head: ["/assets/avatar-northstar-hair/head-nh4-grey-v1.webp"] });
    expect(await outfitNow(page), surface).toBe("top-tank-navy+bottom-trousers-square-navy+shoes-sneakers-white");
  }
  expect(errs).toEqual([]);
  await ctx.close();
});

test("D-373 on by default: saved avatars — an older K choice and a choice without a hairstyle get the standard hair; no choice keeps today's avatar", async ({ browser, browserName }) => {
  test.skip(browserName !== "chromium", "UI dedup");
  for (const [choice, path] of [[{ outfit: "K01" }, "northstar"], [{ ...FREE }, "northstar"], [null, null]] as const) {
    const pupil: Pupil = { northstar: choice ? { ...choice } : null, sent: [] };
    const { ctx, page, errs } = await openPage(browser, pupil, { optIn: false });
    await openAvatar(page, 82);
    if (path) {
      await expect.poll(async () => (await figure(page)).path, { timeout: 30000 }).toBe("northstar");
      expect(await headOn(page, "avatar")).toEqual({ hair: "standard", head: ["/assets/avatar-northstar-hair/head-standard-v1.webp"] });
    } else {
      await expect.poll(async () => (await figure(page)).rendered, { timeout: 30000 }).toBe(true);
      expect((await figure(page)).path, "today's avatar").not.toBe("northstar");
      await page.getByRole("tab", { name: "Hoved", exact: true }).click();
      await expect(page.locator("#northstarWardrobeCards [data-wardrobe-category='hair'] .item-card.equipped")).toHaveCount(0);
    }
    expect(pupil.sent, "nothing is saved by looking").toEqual([]);
    expect(errs).toEqual([]);
    await ctx.close();
  }
});

test("D-373 on by default: with a T-shirt, a tank top and a sweater, a hairstyle changes nothing at or below the neck — exactly today's figure there", async ({ browser, browserName }) => {
  test.skip(browserName !== "chromium", "UI dedup");
  test.setTimeout(180000);
  for (const top of ["top-tee-hip-blue", "top-tank-navy", "top-sweater-ls2-heather"]) {
    const today: Pupil = { northstar: { ...FREE, top }, sent: [] };
    const a = await openPage(browser, today, { optIn: false, flagOff: true });
    await openAvatar(a.page, 79);
    await expect.poll(async () => { const f = await figure(a.page); return f.rendered && f.path === "northstar"; }, { timeout: 30000 }).toBe(true);
    const reference = await figurePixels(a.page);
    await a.ctx.close();
    const pupil: Pupil = { northstar: { ...FREE, top }, sent: [] };
    const { ctx, page, errs } = await openPage(browser, pupil, { optIn: false });
    await openAvatar(page, 82);
    await expect.poll(async () => { const f = await figure(page); return f.rendered && f.path === "northstar"; }, { timeout: 30000 }).toBe(true);
    await page.getByRole("tab", { name: "Hoved", exact: true }).click();
    const px: Record<string, Uint8ClampedArray> = { standard: await figurePixels(page) };
    for (const hair of ["nh4-grey", "nh4-brown", "standard"]) {
      const before = (await figure(page)).src;
      await hairCard(page, hair).locator(".equip-btn").click();
      await redrawn(page, before);
      px[hair === "standard" ? "standardAgain" : hair] = await figurePixels(page);
      expect(await outfitNow(page), top).toBe([top, FREE.pants, FREE.shoes].join("+"));
    }
    for (const k of ["standard", "nh4-grey", "nh4-brown"]) expect(rowsFrom(px[k], reference, 430), `${top} ${k}: neck, body and outfit are today's figure`).toBe(0);
    expect(rowsFrom(px.standard, px.standardAgain, 0), `${top}: switching back gives the same figure`).toBe(0);
    expect(errs).toEqual([]);
    await ctx.close();
  }
});
