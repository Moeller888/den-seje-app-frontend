// Avatar R2 blink-frame verification (activation-audit F5). Deterministic visual
// + DOM protection for the R2 blink CLOSED frame (Option-A lids) and the
// open→closed→open contract on exact R2 neutral-medium. Until now R2 blink was
// only unit-tested; nothing compared or golden-protected the open vs closed lids.
//
// SELF-SERVED + FIXTURE-INTERCEPTED: a local static server serves the repo (this
// branch's code, which carries the forceFrame seam that production does not yet
// have), and every *.supabase.co call is answered from fixtures — no external API
// call, no shared-student mutation, no backend flake. This also makes the closed
// frame reproducible in the manual Linux golden-regen job (same checked-out code).
//
// Determinism: reduced motion freezes breathing/expression and suppresses the
// random auto-blink, so the ONLY dynamic element is the lid frame, pinned by
// BlinkEngine.forceFrame() (js/avatar-blink-engine.js) — the engine's REAL R2 lids,
// not a test replica. Golden captures are chromium-only; the DOM/bbox invariants,
// open==open, destroy cleanup and C2-fallback-lids checks run on every browser.
// R2 opt-in is per-browser (localStorage); global AVATAR_R2 stays false.

import { test, expect, Route } from "@playwright/test";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REF = "tjzbehwfagiwpwodsgwg";
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".svg": "image/svg+xml", ".css": "text/css", ".webp": "image/webp", ".png": "image/png", ".json": "application/json" };

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

const UID = "00000000-0000-4000-8000-000000000001";
const idNeutralMedium = { v: 1, body_type: "neutral", skin_tone: "medium", hairstyle: "tousled", hair_color: "brown", chosen_at: "2026-06-01T00:00:00Z" };
const idNeutralDark   = { v: 1, body_type: "neutral", skin_tone: "dark",   hairstyle: "tousled", hair_color: "brown", chosen_at: "2026-06-01T00:00:00Z" };
const USER = { id: UID, aud: "authenticated", role: "authenticated", email: "r@e.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
function jwt() { const b = (o: any) => Buffer.from(JSON.stringify(o)).toString("base64url"); return b({ alg: "HS256", typ: "JWT" }) + "." + b({ sub: UID, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 2592000 }) + ".s"; }
const SESSION = { access_token: jwt(), token_type: "bearer", expires_in: 2592000, expires_at: Math.floor(Date.now() / 1000) + 2592000, refresh_token: "f", user: USER };
const PROGRESS = { student_id: UID, xp: 420, coins: 120, current_streak: 3, longest_streak: 7, correct_answers: 42 };
const QUESTION = { step: "question", question_instance_id: "q1", answer_format: "mc", subject: "Historie", content: { question: "Hvornår sluttede 2. verdenskrig i Europa?", options: ["1943", "1944", "1945", "1946"] } };
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS" };
const today = new Date().toISOString().slice(0, 10);

function profile(identity: object) {
  return { id: UID, role: "student", name: "R", email: "r@e.com", equipped_slots: {}, active_title: null, active_theme: null, avatar_gender: "neutral", avatar_identity: identity, grade: 5, selected_grade: 5, placement_band: 2, current_band: 2, xp: 420, coins: 120 };
}
function makeRoute(identity: object) {
  return async (route: Route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const p = new URL(req.url()).pathname;
    const wo = ((req.headers()["accept"]) || "").includes("vnd.pgrst.object");
    const one = (o: any) => (wo ? o : [o]);
    const j = (b: any) => route.fulfill({ status: 200, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify(b) });
    if (p.startsWith("/auth/v1/user")) return j(USER);
    if (p.startsWith("/auth/v1/token")) return j(SESSION);
    if (p.startsWith("/auth/v1/logout")) return route.fulfill({ status: 204, headers: CORS });
    if (p.startsWith("/functions/v1/get-next-question")) return j(QUESTION);
    if (p.startsWith("/functions/v1/")) return j({});
    if (p.startsWith("/rest/v1/rpc/evaluate_achievements")) return j([]);
    if (p.startsWith("/rest/v1/rpc/")) return j(null);
    if (p.startsWith("/rest/v1/profiles")) return j(one(profile(identity)));
    if (p.startsWith("/rest/v1/student_progress")) return j([PROGRESS]);
    if (p.startsWith("/rest/v1/daily_login_rewards")) return j(one({ student_id: UID, last_claimed_date: today }));
    if (p.startsWith("/rest/v1/shop_items")) return j([]);
    return j([]);
  };
}

async function openSurface(browser: any, urlPath: string, identity: object, testFlag = true) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 700 }, reducedMotion: "reduce" });
  const errs: string[] = [];
  await ctx.route("**://*.supabase.co/**", makeRoute(identity));
  await ctx.addInitScript(([k, s, flag]: [string, any, boolean]) => {
    // Gate the deterministic blink test handle on (js/avatar-blink-engine.js only
    // exposes window.__avatarBlinkEngine when this flag is true — production never sets it).
    if (flag) (window as any).__AVATAR_TEST__ = true;
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem("avatar_v2", "1");
    localStorage.setItem("avatar_r2", "1");
  }, [`sb-${REF}-auth-token`, SESSION, testFlag]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errs.push("[console] " + m.text()); });
  await page.goto(`${baseUrl}${urlPath}`, { waitUntil: "networkidle" });
  return { ctx, page, errs };
}

async function waitForR2(page: any, selector: string) {
  await page.waitForSelector(`${selector}[data-avatar-rendered="1"]`, { timeout: 15000 });
  await expect(page.locator(`${selector} img[data-c2-layer="base"][src*="avatar-r2/base/body-neutral-medium-v2.webp"]`)).toBeAttached({ timeout: 10000 });
  await page.waitForFunction((sel: string) => {
    const imgs = Array.from(document.querySelectorAll(sel + " img"));
    return imgs.length > 0 && imgs.every((i: any) => i.complete && i.naturalWidth > 0);
  }, selector, { timeout: 15000 });
  await page.waitForFunction(() => !!(window as any).__avatarBlinkEngine && typeof (window as any).__avatarBlinkEngine.forceFrame === "function", { timeout: 10000 });
}

async function forceAndProbe(page: any, selector: string, state: "open" | "closed") {
  await page.evaluate((s: string) => (window as any).__avatarBlinkEngine.forceFrame(s), state);
  await page.waitForTimeout(60);
  return page.evaluate((sel: string) => {
    const root = document.querySelector(sel) as HTMLElement;
    const layers = document.querySelectorAll("#avatar-blink-layer");
    const layer = document.getElementById("avatar-blink-layer");
    const lids = layer ? Array.from(layer.querySelectorAll("ellipse")) : [];
    const imgs = Array.from(root.querySelectorAll("img"));
    const markers = Array.from(root.querySelectorAll("[data-c2-layer]")).map((n) => n.getAttribute("data-c2-layer"));
    const bb = (el: Element | null) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
    return {
      renderPath: root.dataset.avatarRenderPath,
      blinkLayerCount: layers.length,
      lidCount: lids.length,
      lidTransforms: lids.map((l) => (l as SVGElement).style.transform),
      lidCx: lids.map((l) => l.getAttribute("cx")),
      lidFill: lids.map((l) => l.getAttribute("fill")),
      baseCount: root.querySelectorAll('img[data-c2-layer="base"]').length,
      r2Markers: markers.filter((m) => ["blush", "face", "iris", "eyes", "hair-r2"].includes(m as string)).length,
      c2Svg: imgs.some((i) => (i.getAttribute("src") || "").includes("-c2.svg")),
      broken: imgs.filter((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth === 0).length,
      containerBB: bb(root),
      baseBB: bb(root.querySelector('img[data-c2-layer="base"]')),
      hairBB: bb(root.querySelector('[data-c2-layer="hair-r2"]')),
      faceBB: bb(root.querySelector('[data-c2-layer="face"]')),
    };
  }, selector);
}

// closedGolden always; openGolden only where we assert the visual open==open
// contract (avatar). Golden captures use NO animations:"disabled" — everything is
// already frozen (reduced motion + forceFrame sets transition:none), and that
// option would reset the forced lid transform to its scaleY(0) base and hide the
// closed frame. open-before/open-after equality is proven visually by matching the
// SAME open baseline within maxDiffPixels (robust to GPU sub-pixel variance) plus
// the DOM/bbox invariants below.
async function blinkContract(page: any, errs: string[], browserName: string, selector: string, closedGolden: string, maxDiffPixels: number, openGolden?: string) {
  await waitForR2(page, selector);
  const el = page.locator(selector);
  const chromium = browserName === "chromium";

  const open1 = await forceAndProbe(page, selector, "open");
  expect(open1.renderPath, "exact R2").toBe("r2");
  expect(open1.r2Markers, "full R2 stack").toBeGreaterThanOrEqual(4);
  expect(open1.c2Svg, "no C2 mixed into R2").toBeFalsy();
  expect(open1.baseCount, "one base layer").toBe(1);
  expect(open1.broken, "no broken images").toBe(0);
  expect(open1.blinkLayerCount, "one blink layer").toBe(1);
  expect(open1.lidCount, "two lids (no duplicate eyes)").toBe(2);
  expect(open1.lidTransforms.every((t) => /scaleY\(0\)/.test(t)), "open lids retracted").toBeTruthy();
  if (chromium && openGolden) await expect(el).toHaveScreenshot(openGolden, { maxDiffPixels });

  const closed = await forceAndProbe(page, selector, "closed");
  expect(closed.blinkLayerCount, "still one blink layer").toBe(1);
  expect(closed.lidCount, "still two lids").toBe(2);
  expect(closed.lidTransforms.every((t) => /scaleY\(1\)/.test(t)), "closed lids fully down").toBeTruthy();
  expect(closed.lidFill, "R2 medium eyelid fill").toEqual(["#FEC183", "#FEC183"]);
  expect(closed.lidCx, "R2 Option-A geometry").toEqual(["66.7", "90.6"]);
  expect(closed.baseCount, "base unchanged").toBe(1);
  expect(closed.r2Markers, "R2 stack unchanged").toBe(open1.r2Markers);
  expect(closed.c2Svg, "no C2 mixing").toBeFalsy();
  expect(closed.broken, "no broken images").toBe(0);
  expect(closed.containerBB, "container bbox unchanged").toEqual(open1.containerBB);
  expect(closed.baseBB, "base bbox unchanged").toEqual(open1.baseBB);
  expect(closed.hairBB, "hair bbox unchanged").toEqual(open1.hairBB);
  expect(closed.faceBB, "face bbox unchanged").toEqual(open1.faceBB);
  if (chromium) await expect(el).toHaveScreenshot(closedGolden, { maxDiffPixels });

  const open2 = await forceAndProbe(page, selector, "open");
  expect(open2.lidTransforms.every((t) => /scaleY\(0\)/.test(t)), "open-after lids retracted").toBeTruthy();
  expect(open2.blinkLayerCount, "still exactly one blink layer after blink").toBe(1);
  expect(open2.containerBB, "container bbox unchanged after blink").toEqual(open1.containerBB);
  expect(open2.baseBB, "base bbox unchanged after blink").toEqual(open1.baseBB);
  // Visual open==open: open-after matches the SAME open baseline as open-before.
  if (chromium && openGolden) await expect(el).toHaveScreenshot(openGolden, { maxDiffPixels });

  expect(errs.filter((e) => !/favicon/i.test(e)), "no page/console errors").toEqual([]);
}

test("golden: R2 blink frames — avatar.html (open→closed→open)", async ({ browser, browserName }) => {
  const { ctx, page, errs } = await openSurface(browser, "/avatar.html", idNeutralMedium);
  await page.waitForSelector("#skinToneButtons .identity-btn", { timeout: 15000 });
  await blinkContract(page, errs, browserName, "#avatar-preview", "r2-avatar-page-blink-closed.png", 250, "r2-avatar-page-blink-open.png");
  await ctx.close();
});

test("golden: R2 blink frames — hub.html (closed + invariants)", async ({ browser, browserName }) => {
  const { ctx, page, errs } = await openSurface(browser, "/hub.html", idNeutralMedium);
  await page.waitForSelector("#profileAvatar img", { timeout: 15000 });
  await blinkContract(page, errs, browserName, "#profileAvatar", "r2-hub-avatar-blink-closed.png", 150);
  await ctx.close();
});

test("golden: R2 blink frames — index.html/quiz (closed + invariants)", async ({ browser, browserName }) => {
  const { ctx, page, errs } = await openSurface(browser, "/index.html", idNeutralMedium);
  await blinkContract(page, errs, browserName, "#avatar-display", "r2-quiz-avatar-blink-closed.png", 120);
  await ctx.close();
});

test("R2 blink cleanup: destroy removes the lid layer", async ({ browser }) => {
  const { ctx, page } = await openSurface(browser, "/avatar.html", idNeutralMedium);
  await page.waitForSelector("#skinToneButtons .identity-btn", { timeout: 15000 });
  await waitForR2(page, "#avatar-preview");
  await page.evaluate(() => (window as any).__avatarBlinkEngine.forceFrame("closed"));
  expect(await page.evaluate(() => !!document.getElementById("avatar-blink-layer")), "closed layer exists").toBeTruthy();
  await page.evaluate(() => (window as any).__avatarBlinkEngine.destroy());
  expect(await page.evaluate(() => !!document.getElementById("avatar-blink-layer")), "destroy removes the layer").toBeFalsy();
  await ctx.close();
});

test("C2 fallback uses C2 lids, never R2 geometry", async ({ browser }) => {
  // Dark skin under opt-in is unsupported by R2 → C2 fallback; its lids must use
  // C2 geometry (cx 68/92), never the R2 Option-A geometry (cx 66.7/90.6).
  const { ctx, page } = await openSurface(browser, "/avatar.html", idNeutralDark);
  await page.waitForSelector("#skinToneButtons .identity-btn", { timeout: 15000 });
  await page.waitForSelector('#avatar-preview[data-avatar-rendered="1"]', { timeout: 15000 });
  await page.waitForFunction(() => !!(window as any).__avatarBlinkEngine, { timeout: 10000 });
  const info = await page.evaluate(() => {
    const root = document.querySelector("#avatar-preview") as HTMLElement;
    (window as any).__avatarBlinkEngine.forceFrame("closed");
    const layer = document.getElementById("avatar-blink-layer");
    const lids = layer ? Array.from(layer.querySelectorAll("ellipse")) : [];
    const srcs = Array.from(root.querySelectorAll("img")).map((i) => i.getAttribute("src") || "");
    return { renderPath: root.dataset.avatarRenderPath, lidCx: lids.map((l) => l.getAttribute("cx")), hasC2Base: srcs.some((s) => s.includes("-c2.svg")), hasR2Base: srcs.some((s) => s.includes("avatar-r2/base")) };
  });
  expect(info.renderPath, "dark skin → C2").toBe("c2");
  expect(info.hasC2Base, "C2 base rendered").toBeTruthy();
  expect(info.hasR2Base, "no R2 base on fallback").toBeFalsy();
  expect(info.lidCx, "fallback lids use C2 geometry").toEqual(["68", "92"]);
  await ctx.close();
});

test("blink test handle is GATED: exposed only under window.__AVATAR_TEST__", async ({ browser }) => {
  // (a) WITHOUT the test flag → production behaviour → NO global exposed.
  {
    const { ctx, page } = await openSurface(browser, "/avatar.html", idNeutralMedium, /* testFlag */ false);
    await page.waitForSelector('#avatar-preview[data-avatar-rendered="1"]', { timeout: 15000 });
    await page.waitForTimeout(300);
    const exposed = await page.evaluate(() => ({
      flag: (window as any).__AVATAR_TEST__ === true,
      handle: typeof (window as any).__avatarBlinkEngine !== "undefined" && (window as any).__avatarBlinkEngine !== null,
    }));
    expect(exposed.flag, "no test flag in this context").toBeFalsy();
    expect(exposed.handle, "production must NOT expose the blink-engine global").toBeFalsy();
    await ctx.close();
  }
  // (b) WITH the test flag → global exposed; destroy clears it; a fresh engine replaces it.
  {
    const { ctx, page } = await openSurface(browser, "/avatar.html", idNeutralMedium /* testFlag defaults true */);
    await waitForR2(page, "#avatar-preview");
    const present = await page.evaluate(() => !!(window as any).__avatarBlinkEngine && typeof (window as any).__avatarBlinkEngine.forceFrame === "function");
    expect(present, "test mode exposes the handle").toBeTruthy();
    // destroy clears the global (engine === this)
    const afterDestroy = await page.evaluate(() => { (window as any).__avatarBlinkEngine.destroy(); return (window as any).__avatarBlinkEngine; });
    expect(afterDestroy, "destroy clears the global for the destroyed engine").toBeNull();
    // a newly constructed engine (test mode) re-registers the global
    const afterRemount = await page.evaluate(async () => {
      const mod = await import("/js/avatar-blink-engine.js");
      const el = document.querySelector("#avatar-preview");
      const e = new mod.BlinkEngine(el, "medium", { mode: "r2" });
      const ok = (window as any).__avatarBlinkEngine === e;
      e.destroy();
      return ok;
    });
    expect(afterRemount, "a remount replaces the global with the new engine").toBeTruthy();
    await ctx.close();
  }
});
