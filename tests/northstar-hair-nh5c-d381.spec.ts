// D-381 — the nape locks (D-379 NH-5C, V2 excepted by D-380) as "Nakkelokker · gråt" and "Nakkelokker · brunt", their two cards HIDDEN
// by default (NORTHSTAR_HAIR_NH5C = false).
// SELF-SERVED + FIXTURE-INTERCEPTED (as northstar-hair-nh5b-d377.spec.ts): a local static server serves this branch's code; every
// *.supabase.co call is answered from a fictitious, stateful pupil (the stored choice changes as set_avatar_northstar is called). No real
// backend, account or token. It proves:
//   - hidden by default: today's 84 cards and no nape lock; a browser's opt-in (?northstarnh5c=1) shows the two last under Hoved (86) and
//     ?northstarnh5c=0 hides them again; the flag turned on shows the same seven hairstyles; a STORED nape-lock head is drawn on Avatar,
//     Hub and in the quiz without the opt-in; older saved avatars (the top knot included) are drawn as before;
//   - each colour goes on in place (no reload), the outfit stays and the nape locks are saved with it; a part (tank top, sweater) keeps the
//     nape locks; after a reload both stay; Hub and the quiz draw the same head;
//   - ears and collar with a T-shirt, a tank top and a sweater: in D-376's ear boxes every opaque pixel the five earlier heads draw the
//     same (the ears' own pixels with their outline, and the skin beside them) is unchanged except D-380's ear strands (at most 66 px,
//     none below y 345); at the ears' soft edge the nape locks only add hair behind; at and below the neck (y ≥ 430) the figure is
//     today's figure and NH-4's, 0 px.
// Screenshots of both colours with the three tops are attached for the review.

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

const UID = "00000000-0000-4000-8000-000000000381";
const USER = { id: UID, aud: "authenticated", role: "authenticated", email: "d381@e.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
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
      const row = { id: UID, role: "student", name: "D", email: "d381@e.com", equipped_slots: {}, active_title: null, active_theme: "default", avatar_gender: "neutral", avatar_identity: identity(pupil), grade: 5, selected_grade: 5, placement_band: 2, current_band: 2, xp: 420, coins: 100 };
      return j(wo ? row : [row]);
    }
    if (p.startsWith("/rest/v1/student_progress")) return j([{ student_id: UID, xp: 420, coins: 100 }]);
    return j([]);
  };
}

const LAYERS = fs.readFileSync(path.join(ROOT, "js", "avatar-layers.js"), "utf8");
const FLAG_ON = "export const NORTHSTAR_HAIR_CHOICE = true;";
const NH5C_OFF = "export const NORTHSTAR_HAIR_NH5C = false;";
async function openPage(browser: Browser, pupil: Pupil, { hairFlagOff = false, nh5cFlagOn = false }: { hairFlagOff?: boolean; nh5cFlagOn?: boolean } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, reducedMotion: "reduce" });
  await ctx.route("**://*.supabase.co/**", routeFor(pupil));
  // hairFlagOff: this branch's module with only D-373's flag turned off — today's figure, the reference at and below the neck;
  // nh5cFlagOn: this branch's module with only D-381's flag turned on — the nape-lock cards shown, as a later opening would
  if (hairFlagOff || nh5cFlagOn) {
    expect(LAYERS.split(FLAG_ON).length, "the hair flag line occurs once").toBe(2);
    expect(LAYERS.split(NH5C_OFF).length, "the nape-lock flag line occurs once").toBe(2);
    let body = LAYERS;
    if (hairFlagOff) body = body.replace(FLAG_ON, "export const NORTHSTAR_HAIR_CHOICE = false;");
    if (nh5cFlagOn) body = body.replace(NH5C_OFF, "export const NORTHSTAR_HAIR_NH5C = true;");
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
/** The composed figure in the preview as RGBA pixels (1024×1536). */
const figurePixels = async (page: Page): Promise<Uint8ClampedArray> => {
  const url = await page.evaluate(() => { const i = document.querySelector("#avatar-preview img[data-c2-layer]") as HTMLImageElement; const c = document.createElement("canvas"); c.width = i.naturalWidth; c.height = i.naturalHeight; c.getContext("2d")!.drawImage(i, 0, 0); return c.toDataURL("image/png"); });
  const d = decodePng(Buffer.from(url.split(",")[1], "base64"));
  expect([d.header.w, d.header.h]).toEqual([1024, 1536]);
  return d.px;
};
const rowsFrom = (a: Uint8ClampedArray, b: Uint8ClampedArray, y0: number) => { let n = 0; for (let i = y0 * 1024 * 4; i < a.length; i++) if (a[i] !== b[i]) n++; return n; };
// D-376's two ear boxes (from the row below the temple tips down to the jaw), and D-380's ear-strand window (the strands kept in front
// run from the ear top, y 306, down to y 345, beside each ear)
const EARS = [{ x: [352, 403], y: [309, 381] }, { x: [615, 666], y: [309, 381] }];
const STRAND_MAX_Y = 345, STRAND_PX_MAX = 66;   // D-380 G3: 66 face pixels below the ear tops change, all of them the ear strands
const samePx = (a: Uint8ClampedArray, b: Uint8ClampedArray, i: number) => a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2] && a[i + 3] === b[i + 3];
/** In the ear boxes, the pixels every earlier head draws the same. Opaque ones are the ears' own pixels with their outline and the skin
 * beside them (no earlier hair lies there); the others are the ears' soft edge and the empty space beside the ear, where the nape locks
 * may show behind. Counts where the nape locks differ from them. */
function earCheck(refs: Uint8ClampedArray[], locks: Uint8ClampedArray) {
  let opaque = 0, opaqueChanged = 0, opaqueChangedBelowStrands = 0, edgeChanged = 0, edgeLostCover = 0;
  for (const e of EARS) for (let y = e.y[0]; y <= e.y[1]; y++) for (let x = e.x[0]; x <= e.x[1]; x++) {
    const i = (y * 1024 + x) * 4;
    if (!refs.every((r) => samePx(r, refs[0], i))) continue;
    const same = samePx(locks, refs[0], i);
    if (refs[0][i + 3] === 255) { opaque++; if (!same) { opaqueChanged++; if (y > STRAND_MAX_Y) opaqueChangedBelowStrands++; } }
    else if (!same) { edgeChanged++; if (locks[i + 3] < refs[0][i + 3]) edgeLostCover++; }
  }
  return { opaque, opaqueChanged, opaqueChangedBelowStrands, edgeChanged, edgeLostCover };
}
const shot = async (page: Page, name: string) => {
  const file = test.info().outputPath(name + ".png");
  await page.locator("#avatar-preview").screenshot({ path: file });
  await test.info().attach(name, { path: file, contentType: "image/png" });
};
const FREE = { outfit: "FRI", top: "top-tee-hip-blue", pants: "bottom-trousers-square-navy", shoes: "shoes-sneakers-white" };
const LOCKS = ["nh5c-grey", "nh5c-brown"];
const EARLIER = ["standard", "nh4-grey", "nh4-brown", "nh5b-grey", "nh5b-brown"];
const FIVE = [["standard", "Standardhår"], ["nh4-grey", "Kort pjusket hår · gråt"], ["nh4-brown", "Kort pjusket hår · brunt"], ["nh5b-grey", "Topknude · gråt"], ["nh5b-brown", "Topknude · brunt"]];
const SEVEN = [...FIVE, ["nh5c-grey", "Nakkelokker · gråt"], ["nh5c-brown", "Nakkelokker · brunt"]];
const HEAD = (hair: string) => "/assets/avatar-northstar-hair/head-" + hair + "-v1.webp";
const TOPS = ["top-tee-hip-blue", "top-tank-navy", "top-sweater-ls2-heather"];   // T-shirt, tank top, sweater

test("D-381 hidden by default: 84 cards and no nape lock; ?northstarnh5c=1 shows the two last under Hoved (86) and =0 hides them; the flag turned on shows them too; stored nape locks are drawn on Avatar, Hub and in the quiz; older saved avatars as before", async ({ browser, browserName }) => {
  test.skip(browserName !== "chromium", "UI dedup");
  test.setTimeout(240000);
  {
    const pupil: Pupil = { northstar: { ...FREE }, sent: [] };
    const { ctx, page, errs } = await openPage(browser, pupil);
    await openAvatar(page, 84);
    expect(await page.evaluate(() => localStorage.getItem("avatar_northstar_hair_nh5c")), "no opt-in in this browser").toBe(null);
    expect(await hairIds(page)).toEqual(FIVE);
    for (const k of LOCKS) await expect(hairCard(page, k)).toHaveCount(0);
    await openAvatar(page, 86, "?northstarnh5c=1");
    expect(await page.evaluate(() => localStorage.getItem("avatar_northstar_hair_nh5c"))).toBe("1");
    expect(await hairIds(page)).toEqual(SEVEN);
    await openAvatar(page, 86);   // the opt-in is kept in this browser
    await openAvatar(page, 84, "?northstarnh5c=0");
    expect(await page.evaluate(() => localStorage.getItem("avatar_northstar_hair_nh5c"))).toBe(null);
    expect(await hairIds(page)).toEqual(FIVE);
    expect(pupil.sent, "the opt-in saves nothing").toEqual([]);
    expect(errs).toEqual([]);
    await ctx.close();
  }
  {
    const pupil: Pupil = { northstar: { ...FREE }, sent: [] };
    const { ctx, page, errs } = await openPage(browser, pupil, { nh5cFlagOn: true });
    await openAvatar(page, 86);
    expect(await hairIds(page), "the flag turned on (a later opening) shows the same seven").toEqual(SEVEN);
    expect(pupil.sent).toEqual([]);
    expect(errs).toEqual([]);
    await ctx.close();
  }
  for (const hair of LOCKS) {
    const pupil: Pupil = { northstar: { ...FREE, top: "top-tank-navy", hair }, sent: [] };
    const { ctx, page, errs } = await openPage(browser, pupil);   // no opt-in: drawn whatever the flag
    await openAvatar(page, 84);
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
  const older: [Record<string, string> | null, string | null][] = [[{ outfit: "K01" }, "standard"], [{ ...FREE }, "standard"], ...EARLIER.map((h): [Record<string, string>, string] => [{ ...FREE, hair: h }, h]), [null, null]];
  for (const [choice, want] of older) {
    const pupil: Pupil = { northstar: choice ? { ...choice } : null, sent: [] };
    const { ctx, page, errs } = await openPage(browser, pupil);
    await openAvatar(page, 84);
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

test("D-381 with the opt-in: both nape-lock colours go on in place, keep the outfit and are saved with it; a part keeps the nape locks; both survive a reload; Hub and the quiz draw the same", async ({ browser, browserName }) => {
  test.skip(browserName !== "chromium", "UI dedup");
  test.setTimeout(150000);
  const pupil: Pupil = { northstar: { ...FREE }, sent: [] };
  const { ctx, page, errs } = await openPage(browser, pupil);
  await openAvatar(page, 86, "?northstarnh5c=1");
  await page.waitForLoadState("load");
  await drawn(page);
  await page.getByRole("tab", { name: "Hoved", exact: true }).click();
  expect(await hairIds(page)).toEqual(SEVEN);
  await expect(page.locator("#northstarWardrobeCards [data-wardrobe-category='top']")).toBeHidden();
  await expect(hairCard(page, "standard")).toHaveClass(/equipped/);
  let loads = 0; page.on("load", () => { loads++; });
  const outfit = await outfitNow(page);
  for (const hair of LOCKS) {
    const before = (await figure(page)).src, sent = pupil.sent.length;
    await hairCard(page, hair).locator(".equip-btn").click();
    await expect(hairCard(page, hair)).toHaveClass(/equipped/);
    await redrawn(page, before);
    expect(await headOn(page, "avatar")).toEqual({ hair, head: [HEAD(hair)] });
    expect(await outfitNow(page), "the outfit stays").toBe(outfit);
    await expect.poll(() => pupil.sent.length).toBe(sent + 1);
    expect(JSON.parse(pupil.sent[sent])).toEqual({ ...FREE, hair });   // saved with the outfit
    await shot(page, "d381-" + hair);
  }
  expect(loads, "no reload").toBe(0);
  // a part keeps the nape locks: the tank top, then the sweater
  await page.getByRole("tab", { name: "Overdele", exact: true }).click();
  await page.locator("#northstarWardrobeCards .item-card[data-piece='top-tank-navy'] .equip-btn").click();
  await expect.poll(() => pupil.sent.length).toBe(3);
  expect(JSON.parse(pupil.sent[2])).toEqual({ ...FREE, top: "top-tank-navy", hair: "nh5c-brown" });
  await page.locator("#northstarWardrobeCards .item-card[data-piece='top-sweater-ls2-heather'] .equip-btn").click();
  await expect.poll(() => pupil.sent.length).toBe(4);
  expect(JSON.parse(pupil.sent[3])).toEqual({ ...FREE, top: "top-sweater-ls2-heather", hair: "nh5c-brown" });
  expect(await headOn(page, "avatar"), "the part keeps the nape locks on the figure").toEqual({ hair: "nh5c-brown", head: [HEAD("nh5c-brown")] });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#northstarWardrobeCards .item-card")).toHaveCount(86, { timeout: 30000 });
  expect(await headOn(page, "avatar")).toEqual({ hair: "nh5c-brown", head: [HEAD("nh5c-brown")] });
  expect(await outfitNow(page), "the part stays after the reload").toBe("top-sweater-ls2-heather+bottom-trousers-square-navy+shoes-sneakers-white");
  await page.getByRole("tab", { name: "Hoved", exact: true }).click();
  await expect(hairCard(page, "nh5c-brown")).toHaveClass(/equipped/);
  // and the other way round: the grey after the part keeps the part, also after a reload
  await hairCard(page, "nh5c-grey").locator(".equip-btn").click();
  await expect.poll(() => pupil.sent.length).toBe(5);
  expect(JSON.parse(pupil.sent[4])).toEqual({ ...FREE, top: "top-sweater-ls2-heather", hair: "nh5c-grey" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#northstarWardrobeCards .item-card")).toHaveCount(86, { timeout: 30000 });
  expect(await headOn(page, "avatar")).toEqual({ hair: "nh5c-grey", head: [HEAD("nh5c-grey")] });
  expect(await outfitNow(page)).toBe("top-sweater-ls2-heather+bottom-trousers-square-navy+shoes-sneakers-white");
  for (const [url, el, surface] of [["hub.html", "profileAvatar", "hub"], ["index.html", "avatar-display", "quiz"]]) {
    await page.goto(`${baseUrl}/${url}`, { waitUntil: "domcontentloaded" });
    await expect.poll(() => page.evaluate((id) => document.getElementById(id)?.dataset.avatarRenderPath ?? null, el), { timeout: 30000 }).toBe("northstar");
    expect(await headOn(page, surface), surface).toEqual({ hair: "nh5c-grey", head: [HEAD("nh5c-grey")] });
    expect(await outfitNow(page), surface).toBe("top-sweater-ls2-heather+bottom-trousers-square-navy+shoes-sneakers-white");
  }
  expect(pupil.sent.length).toBe(5);
  expect(errs).toEqual([]);
  await ctx.close();
});

test("D-381 ears and collar with a T-shirt, a tank top and a sweater: the ears' outline is every earlier head's (only D-380's ear strands change face pixels, none below y 345), and at and below the neck the figure is today's", async ({ browser, browserName }) => {
  test.skip(browserName !== "chromium", "UI dedup");
  test.setTimeout(360000);
  const measured: Record<string, unknown> = {};
  for (const top of TOPS) {
    const a = await openPage(browser, { northstar: { ...FREE, top }, sent: [] }, { hairFlagOff: true });
    await openAvatar(a.page, 79);
    await drawn(a.page);
    const reference = await figurePixels(a.page);
    await a.ctx.close();
    const pupil: Pupil = { northstar: { ...FREE, top }, sent: [] };
    const { ctx, page, errs } = await openPage(browser, pupil);
    await openAvatar(page, 86, "?northstarnh5c=1");
    await drawn(page);
    await page.getByRole("tab", { name: "Hoved", exact: true }).click();
    const px: Record<string, Uint8ClampedArray> = { standard: await figurePixels(page) };
    for (const hair of [...EARLIER.slice(1), ...LOCKS]) {
      const before = (await figure(page)).src;
      await hairCard(page, hair).locator(".equip-btn").click();
      await redrawn(page, before);
      px[hair] = await figurePixels(page);
      expect(await outfitNow(page), top).toBe([top, FREE.pants, FREE.shoes].join("+"));
      if (hair.startsWith("nh5c")) await shot(page, `d381-${top}-${hair}`);
    }
    const refs = EARLIER.map((h) => px[h]);
    for (const lock of LOCKS) {
      const ears = earCheck(refs, px[lock]);
      measured[`${top} ${lock}`] = { ...ears, belowY430VsToday: rowsFrom(px[lock], reference, 430) };
      expect(ears.opaque, `${top} ${lock}: the ear boxes hold the ears' own opaque pixels`).toBeGreaterThan(5000);
      expect(ears.opaqueChangedBelowStrands, `${top} ${lock}: no opaque ear, outline or skin pixel below the strand window changes`).toBe(0);
      expect(ears.opaqueChanged, `${top} ${lock}: above it only the ear strands change (D-380 G3)`).toBeLessThanOrEqual(STRAND_PX_MAX);
      expect(ears.edgeLostCover, `${top} ${lock}: at the soft edge the locks only add hair behind, they never uncover`).toBe(0);
      expect(rowsFrom(px[lock], reference, 430), `${top} ${lock}: neck, collar, body and outfit are today's figure`).toBe(0);
      expect(rowsFrom(px[lock], px[lock === "nh5c-grey" ? "nh4-grey" : "nh4-brown"], 430), `${top} ${lock}: the same as NH-4 at and below the neck`).toBe(0);
    }
    expect(errs).toEqual([]);
    await ctx.close();
  }
  await test.info().attach("d381-ear-collar-measurements.json", { body: JSON.stringify(measured, null, 2), contentType: "application/json" });
  console.log("D-381 ear/collar measurements " + JSON.stringify(measured));
});
