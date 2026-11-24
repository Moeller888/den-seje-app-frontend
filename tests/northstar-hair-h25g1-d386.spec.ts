// D-386 — HAIR-25 group 1: six hairstyles (N2, N3, N6, N7, V2, N5), each in grey and brown, approved by the owner 2026-11-24 exactly as
// shown on the private assessment page. Their twelve cards are HIDDEN by default (NORTHSTAR_HAIR_H25G1 = false) until D-386's migration is
// applied in production.
// SELF-SERVED + FIXTURE-INTERCEPTED (as northstar-hair-nh5c-d381.spec.ts): a local static server serves this branch's code; every
// *.supabase.co call is answered from a fictitious, stateful pupil (the stored choice changes as set_avatar_northstar is called). No real
// backend, account or token. It proves:
//   - hidden by default: today's 86 cards and no group-1 card; a browser's opt-in (?northstarh25=1) shows the twelve last under Hoved
//     (98) and ?northstarh25=0 hides them again; the flag turned on shows the same nineteen hairstyles; a STORED group-1 head is drawn on
//     Avatar, Hub and in the quiz without the opt-in; older saved avatars are drawn as before;
//   - each of the twelve goes on in place (no reload), the outfit stays and the hairstyle is saved with it; a part (tank top, sweater,
//     trousers, shoes) keeps the hairstyle; after a reload both stay; Hub and the quiz draw the same head and outfit;
//   - AS APPROVED: with a T-shirt, a tank top and a sweater the browser loads exactly the twelve WebP heads the approval fixture binds
//     (approval-h25g1-v1.json — the files whose exact decoding rebuilt the assessment page's pictures byte for byte through the
//     renderer's own northstarCompose), and outside the hair the figure is the standard-hair figure pixel for pixel (body, clothes, shadows).
// Screenshots of all twelve are attached for the review.

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
const FX = JSON.parse(fs.readFileSync(path.join(ROOT, "tools", "avatar", "fixtures", "northstar-hair-d386", "approval-h25g1-v1.json"), "utf8"));

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

const UID = "00000000-0000-4000-8000-000000000386";
const USER = { id: UID, aud: "authenticated", role: "authenticated", email: "d386@e.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
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
      const row = { id: UID, role: "student", name: "D", email: "d386@e.com", equipped_slots: {}, active_title: null, active_theme: "default", avatar_gender: "neutral", avatar_identity: identity(pupil), grade: 5, selected_grade: 5, placement_band: 2, current_band: 2, xp: 420, coins: 100 };
      return j(wo ? row : [row]);
    }
    if (p.startsWith("/rest/v1/student_progress")) return j([{ student_id: UID, xp: 420, coins: 100 }]);
    return j([]);
  };
}

const LAYERS = fs.readFileSync(path.join(ROOT, "js", "avatar-layers.js"), "utf8");
const G1_OFF = "export const NORTHSTAR_HAIR_H25G1 = false;";
async function openPage(browser: Browser, pupil: Pupil, { g1FlagOn = false }: { g1FlagOn?: boolean } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, reducedMotion: "reduce" });
  await ctx.route("**://*.supabase.co/**", routeFor(pupil));
  // g1FlagOn: this branch's module with only D-386's flag turned on — the group-1 cards shown, as a later opening would
  if (g1FlagOn) {
    expect(LAYERS.split(G1_OFF).length, "the group-1 flag line occurs once").toBe(2);
    const body = LAYERS.replace(G1_OFF, "export const NORTHSTAR_HAIR_H25G1 = true;");
    await ctx.route(`${baseUrl}/js/avatar-layers.js*`, (r) => r.fulfill({ status: 200, headers: { "content-type": "text/javascript" }, body }));
  }
  await ctx.addInitScript(([k, s]: [string, any]) => { localStorage.setItem(k, JSON.stringify(s)); }, [`sb-${REF}-auth-token`, SESSION]);
  const page: Page = await ctx.newPage();
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  return { ctx, page, errs };
}
const openAvatar = async (page: Page, cards: number, query = "") => {
  await page.goto(`${baseUrl}/avatar.html${query}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#northstarWardrobeCards .item-card")).toHaveCount(cards, { timeout: 30000 });
};
const hairCard = (page: Page, hair: string) => page.locator(`#northstarWardrobeCards .item-card[data-hair='${hair}']`);
const hairIds = (page: Page) => page.locator("#northstarWardrobeCards [data-wardrobe-category='hair'] .item-card").evaluateAll((els) => els.map((e) => [(e as HTMLElement).dataset.hair, e.querySelector(".item-name")?.textContent]));
const outfitNow = (page: Page) => page.evaluate(async () => { const L: any = await import("/js/avatar-layers.js"); const o = L.northstarOutfitNow(); return o ? [o.top, o.bottom, o.shoes].join("+") : null; });
const headOn = (page: Page, surface: string) => page.evaluate(async (s) => { const L: any = await import("/js/avatar-layers.js"); const r = L.northstarRenderFor(s, []); return r ? { hair: r.hair ?? null, head: r.plan.filter((x: any) => x.op === "draw" && /head/.test(x.src)).map((x: any) => x.src) } : null; }, surface);
const figure = (page: Page, id = "avatar-preview") => page.evaluate((el) => { const p = document.getElementById(el)!; const i = p.querySelector("img[data-c2-layer]") as HTMLImageElement | null;
  return { src: i ? i.getAttribute("src") : null, path: p.dataset.avatarRenderPath || null, rendered: p.getAttribute("data-avatar-rendered") === "1" }; }, id);
const drawn = async (page: Page) => { await expect.poll(async () => { const f = await figure(page); return f.rendered && f.path === "northstar" && !!f.src; }, { timeout: 30000 }).toBe(true); };
const redrawn = async (page: Page, before: string | null) => {
  await expect.poll(async () => { const f = await figure(page); return f.rendered && f.path === "northstar" && !!f.src && f.src !== before; }, { timeout: 15000 }).toBe(true);
};
const shot = async (page: Page, name: string) => {
  const file = test.info().outputPath(name + ".png");
  await page.locator("#avatar-preview").screenshot({ path: file });
  await test.info().attach(name, { path: file, contentType: "image/png" });
};
const FREE = { outfit: "FRI", top: "top-tee-hip-blue", pants: "bottom-trousers-square-navy", shoes: "shoes-sneakers-white" };
const START = { outfit: "FRI", top: "top-tee-hip-cream", pants: "bottom-capri-lightblue", shoes: "shoes-sneakers-beige" };   // the start outfit (K07) the approved pictures wear
const STYLES = ["h25n2", "h25n3", "h25n6", "h25n7", "h25v2", "h25n5"];
const G1 = STYLES.flatMap((s) => [s + "-grey", s + "-brown"]);
const SEVEN = [["standard", "Standardhår"], ["nh4-grey", "Kort pjusket hår · gråt"], ["nh4-brown", "Kort pjusket hår · brunt"], ["nh5b-grey", "Topknude · gråt"], ["nh5b-brown", "Topknude · brunt"], ["nh5c-grey", "Nakkelokker · gråt"], ["nh5c-brown", "Nakkelokker · brunt"]];
const NINETEEN = [...SEVEN, ...G1.map((k) => [k, FX.hairs[k].label])];
const HEAD = (hair: string) => "/assets/avatar-northstar-hair/head-" + hair + "-v1.webp";
const TOPS = ["top-tee-hip-cream", "top-tank-navy", "top-sweater-ls2-heather"];   // T-shirt, tank top, sweater

test("D-386 hidden by default: 86 cards and no group-1 card; ?northstarh25=1 shows the twelve last under Hoved (98) and =0 hides them; the flag turned on shows them too; stored group-1 heads are drawn on Avatar, Hub and in the quiz; older saved avatars as before", async ({ browser, browserName }) => {
  test.skip(browserName !== "chromium", "UI dedup");
  test.setTimeout(480000);
  expect(NINETEEN.slice(7).map(([, l]) => l)).toEqual(["Page med pandehår · gråt", "Page med pandehår · brunt", "Bølget skulderhår · gråt", "Bølget skulderhår · brunt", "Lav hestehale · gråt", "Lav hestehale · brunt", "Stor afro · gråt", "Stor afro · brunt", "Tætte krøller · gråt", "Tætte krøller · brunt", "To fletninger · gråt", "To fletninger · brunt"]);
  {
    const pupil: Pupil = { northstar: { ...FREE }, sent: [] };
    const { ctx, page, errs } = await openPage(browser, pupil);
    await openAvatar(page, 86);
    expect(await page.evaluate(() => localStorage.getItem("avatar_northstar_hair_h25g1")), "no opt-in in this browser").toBe(null);
    expect(await hairIds(page)).toEqual(SEVEN);
    for (const k of G1) await expect(hairCard(page, k)).toHaveCount(0);
    await openAvatar(page, 98, "?northstarh25=1");
    expect(await page.evaluate(() => localStorage.getItem("avatar_northstar_hair_h25g1"))).toBe("1");
    expect(await hairIds(page)).toEqual(NINETEEN);
    await openAvatar(page, 98);   // the opt-in is kept in this browser
    await openAvatar(page, 86, "?northstarh25=0");
    expect(await page.evaluate(() => localStorage.getItem("avatar_northstar_hair_h25g1"))).toBe(null);
    expect(await hairIds(page)).toEqual(SEVEN);
    expect(pupil.sent, "the opt-in saves nothing").toEqual([]);
    expect(errs).toEqual([]);
    await ctx.close();
  }
  {
    const pupil: Pupil = { northstar: { ...FREE }, sent: [] };
    const { ctx, page, errs } = await openPage(browser, pupil, { g1FlagOn: true });
    await openAvatar(page, 98);
    expect(await hairIds(page), "the flag turned on (a later opening) shows the same nineteen").toEqual(NINETEEN);
    expect(pupil.sent).toEqual([]);
    expect(errs).toEqual([]);
    await ctx.close();
  }
  for (const hair of G1) {
    const pupil: Pupil = { northstar: { ...FREE, top: "top-tank-navy", hair }, sent: [] };
    const { ctx, page, errs } = await openPage(browser, pupil);   // no opt-in: drawn whatever the flag
    await openAvatar(page, 86);
    await drawn(page);
    expect(await headOn(page, "avatar"), "stored " + hair + " on Avatar").toEqual({ hair, head: [HEAD(hair)] });
    for (const [url, el, surface] of [["hub.html", "profileAvatar", "hub"], ["index.html", "avatar-display", "quiz"]]) {
      await page.goto(`${baseUrl}/${url}`, { waitUntil: "domcontentloaded" });
      await expect.poll(() => page.evaluate((id) => document.getElementById(id)?.dataset.avatarRenderPath ?? null, el), { timeout: 30000 }).toBe("northstar");
      expect(await headOn(page, surface), hair + " on " + surface).toEqual({ hair, head: [HEAD(hair)] });
      expect(await outfitNow(page), surface).toBe("top-tank-navy+bottom-trousers-square-navy+shoes-sneakers-white");
    }
    expect(pupil.sent).toEqual([]);
    expect(errs).toEqual([]);
    await ctx.close();
  }
  const older: [Record<string, string> | null, string | null][] = [[{ outfit: "K01" }, "standard"], [{ ...FREE }, "standard"], ...SEVEN.map(([h]): [Record<string, string>, string] => [{ ...FREE, hair: h }, h]), [null, null]];
  for (const [choice, want] of older) {
    const pupil: Pupil = { northstar: choice ? { ...choice } : null, sent: [] };
    const { ctx, page, errs } = await openPage(browser, pupil);
    await openAvatar(page, 86);
    if (want) {
      await expect.poll(async () => (await figure(page)).path, { timeout: 30000 }).toBe("northstar");
      expect(await headOn(page, "avatar"), JSON.stringify(choice)).toEqual({ hair: want, head: [HEAD(want)] });
    } else {
      await expect.poll(async () => (await figure(page)).rendered, { timeout: 30000 }).toBe(true);
      expect((await figure(page)).path, "no choice: today's avatar").not.toBe("northstar");
    }
    expect(pupil.sent, "nothing is saved by looking").toEqual([]);
    expect(errs).toEqual([]);
    await ctx.close();
  }
});

test("D-386 with the opt-in: all twelve go on in place, keep the outfit and are saved with it; a part keeps the hairstyle; both survive a reload; Hub and the quiz draw the same", async ({ browser, browserName }) => {
  test.skip(browserName !== "chromium", "UI dedup");
  test.setTimeout(240000);
  const pupil: Pupil = { northstar: { ...FREE }, sent: [] };
  const { ctx, page, errs } = await openPage(browser, pupil);
  await openAvatar(page, 98, "?northstarh25=1");
  await page.waitForLoadState("load");
  await drawn(page);
  await page.getByRole("tab", { name: "Hoved", exact: true }).click();
  expect(await hairIds(page)).toEqual(NINETEEN);
  await expect(hairCard(page, "standard")).toHaveClass(/equipped/);
  let loads = 0; page.on("load", () => { loads++; });
  const outfit = await outfitNow(page);
  for (const hair of G1) {
    const before = (await figure(page)).src, sent = pupil.sent.length;
    await hairCard(page, hair).locator(".equip-btn").click();
    await expect(hairCard(page, hair)).toHaveClass(/equipped/);
    await redrawn(page, before);
    expect(await headOn(page, "avatar")).toEqual({ hair, head: [HEAD(hair)] });
    expect(await outfitNow(page), "the outfit stays").toBe(outfit);
    await expect.poll(() => pupil.sent.length).toBe(sent + 1);
    expect(JSON.parse(pupil.sent[sent])).toEqual({ ...FREE, hair });   // saved with the outfit
    await shot(page, "d386-" + hair);
  }
  expect(loads, "no reload").toBe(0);
  const last = G1[G1.length - 1], n = pupil.sent.length;
  // a part keeps the hairstyle: the tank top, then the sweater
  await page.getByRole("tab", { name: "Overdele", exact: true }).click();
  await page.locator("#northstarWardrobeCards .item-card[data-piece='top-tank-navy'] .equip-btn").click();
  await expect.poll(() => pupil.sent.length).toBe(n + 1);
  expect(JSON.parse(pupil.sent[n])).toEqual({ ...FREE, top: "top-tank-navy", hair: last });
  await page.locator("#northstarWardrobeCards .item-card[data-piece='top-sweater-ls2-heather'] .equip-btn").click();
  await expect.poll(() => pupil.sent.length).toBe(n + 2);
  expect(JSON.parse(pupil.sent[n + 1])).toEqual({ ...FREE, top: "top-sweater-ls2-heather", hair: last });
  expect(await headOn(page, "avatar"), "the part keeps the hairstyle on the figure").toEqual({ hair: last, head: [HEAD(last)] });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#northstarWardrobeCards .item-card")).toHaveCount(98, { timeout: 30000 });
  expect(await headOn(page, "avatar")).toEqual({ hair: last, head: [HEAD(last)] });
  expect(await outfitNow(page), "the part stays after the reload").toBe("top-sweater-ls2-heather+bottom-trousers-square-navy+shoes-sneakers-white");
  await page.getByRole("tab", { name: "Hoved", exact: true }).click();
  await expect(hairCard(page, last)).toHaveClass(/equipped/);
  // and the other way round: another hairstyle after the part keeps the part, also after a reload
  await hairCard(page, "h25n3-grey").locator(".equip-btn").click();
  await expect.poll(() => pupil.sent.length).toBe(n + 3);
  expect(JSON.parse(pupil.sent[n + 2])).toEqual({ ...FREE, top: "top-sweater-ls2-heather", hair: "h25n3-grey" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#northstarWardrobeCards .item-card")).toHaveCount(98, { timeout: 30000 });
  expect(await headOn(page, "avatar")).toEqual({ hair: "h25n3-grey", head: [HEAD("h25n3-grey")] });
  expect(await outfitNow(page)).toBe("top-sweater-ls2-heather+bottom-trousers-square-navy+shoes-sneakers-white");
  for (const [url, el, surface] of [["hub.html", "profileAvatar", "hub"], ["index.html", "avatar-display", "quiz"]]) {
    await page.goto(`${baseUrl}/${url}`, { waitUntil: "domcontentloaded" });
    await expect.poll(() => page.evaluate((id) => document.getElementById(id)?.dataset.avatarRenderPath ?? null, el), { timeout: 30000 }).toBe("northstar");
    expect(await headOn(page, surface), surface).toEqual({ hair: "h25n3-grey", head: [HEAD("h25n3-grey")] });
    expect(await outfitNow(page), surface).toBe("top-sweater-ls2-heather+bottom-trousers-square-navy+shoes-sneakers-white");
  }
  expect(pupil.sent.length).toBe(n + 3);
  expect(errs).toEqual([]);
  await ctx.close();
});

// The byte-for-byte proof against the assessment page lives in the approval fixture: the renderer's own arithmetic (northstarCompose),
// fed the WebP heads decoded exactly, rebuilt the page's pictures byte for byte (figureRgbaSha256, pageViews). In the browser every layer
// is decoded through a 2D canvas, which stores colour premultiplied by alpha, so SOFT (semi-transparent) edge pixels round differently —
// for every hairstyle alike (measured 2026-11-24: mean |Δ| per channel in the hair region 0.13–0.43 for the twelve, 0.08–0.44 for the live
// standard, NH-4 and NH-5C heads; never on an opaque head pixel). So here the browser is held to what it can prove exactly: it draws the
// bound files, the composed alpha is exact, and nothing outside the hair — body, face base, clothes, shadows — differs from the figure
// with the standard hair.
test("D-386 as approved: with a T-shirt, a tank top and a sweater, the browser draws exactly the twelve bound heads, and outside the hair the figure is the standard-hair figure pixel for pixel", async ({ browser, browserName }) => {
  test.skip(browserName !== "chromium", "UI dedup");
  test.setTimeout(480000);
  const measured: Record<string, unknown> = {};
  const pixels = async (page: Page, src?: string): Promise<Uint8ClampedArray> => {
    const url = await page.evaluate(async (s) => { let i = document.querySelector("#avatar-preview img[data-c2-layer]") as HTMLImageElement;
      if (s) { i = new Image(); i.src = s; await i.decode(); }
      const c = document.createElement("canvas"); c.width = i.naturalWidth; c.height = i.naturalHeight; c.getContext("2d")!.drawImage(i, 0, 0); return c.toDataURL("image/png"); }, src);
    const d = decodePng(Buffer.from(url.split(",")[1], "base64"));
    expect([d.header.w, d.header.h]).toEqual([1024, 1536]);
    return d.px;
  };
  const fileSha = (page: Page, src: string) => page.evaluate(async (s) => { const b = await (await fetch(s)).arrayBuffer(); const h = await crypto.subtle.digest("SHA-256", b); return Array.from(new Uint8Array(h)).map((x) => x.toString(16).padStart(2, "0")).join(""); }, src);
  for (const top of TOPS) {
    const pupil: Pupil = { northstar: { ...START, top }, sent: [] };
    const { ctx, page, errs } = await openPage(browser, pupil);
    await openAvatar(page, 98, "?northstarh25=1");
    await drawn(page);
    expect(await page.evaluate(async () => { const L: any = await import("/js/avatar-layers.js"); const o = L.NORTHSTAR_OUTFITS[L.NORTHSTAR_START_OUTFIT]; return [o.bottom, o.shoes]; }), "the approved pictures wear the start outfit").toEqual([START.pants, START.shoes]);
    expect(await headOn(page, "avatar")).toEqual({ hair: "standard", head: [HEAD("standard")] });
    const standard = await pixels(page), standardHead = await pixels(page, HEAD("standard"));
    await page.getByRole("tab", { name: "Hoved", exact: true }).click();
    for (const hair of G1) {
      const before = (await figure(page)).src;
      await hairCard(page, hair).locator(".equip-btn").click();
      await redrawn(page, before);
      expect(await outfitNow(page), top).toBe([top, START.pants, START.shoes].join("+"));
      expect(await headOn(page, "avatar")).toEqual({ hair, head: [HEAD(hair)] });
      expect(await fileSha(page, HEAD(hair)), `${hair}: the browser loads the bound WebP head`).toBe(FX.hairs[hair].webp.sha256);
      const px = await pixels(page), head = await pixels(page, HEAD(hair));
      let changed = 0, outside = 0;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i] === standard[i] && px[i + 1] === standard[i + 1] && px[i + 2] === standard[i + 2] && px[i + 3] === standard[i + 3]) continue;
        changed++;
        if (head[i + 3] === 0 && standardHead[i + 3] === 0) outside++;
      }
      measured[`${top} ${hair}`] = { changedVsStandard: changed, outsideBothHeads: outside };
      expect(changed, `${top} ${hair}: the hairstyle shows`).toBeGreaterThan(1000);
      expect(outside, `${top} ${hair}: nothing outside the two heads changes (body, clothes, shadows)`).toBe(0);
      if (top === TOPS[0]) await shot(page, "d386-" + hair + "-figure");
    }
    expect(pupil.sent.length, "one save per hairstyle").toBe(G1.length);
    expect(errs).toEqual([]);
    await ctx.close();
  }
  await test.info().attach("d386-outside-hair-checks.json", { body: JSON.stringify(measured, null, 2), contentType: "application/json" });
});
