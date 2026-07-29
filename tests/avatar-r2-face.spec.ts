// Avatar R2 face/mask (D-081) — third R2 item-equipment slice. SELF-SERVED + FIXTURE-INTERCEPTED
// (0 real backend from the spec, fictitious local fixtures). Proves the three live face items
// (ninja-mask, hero-mask, panda-mask) render on the R2 stack as a DISTINCT cosmetic layer (marker
// "face-cosmetic", per-item z: ninja/hero 8 under the hair, panda 41 above the hair), each re-seated
// onto the R2 face by a per-item wrapper transform; the mandatory internal "face" layer is untouched
// (exactly one of each); blink & expression leave the mask in place; headwear composes above; opt-out →
// C2; the shop stays uniform C2 (D-077). Plus a compact golden MATRIX of all three masks × avatar/hub/
// quiz sizes. AVATAR_R2 stays false; R2 is per-browser opt-in.
import { test, expect, Route } from "@playwright/test";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REF = "tjzbehwfagiwpwodsgwg";
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".svg": "image/svg+xml", ".css": "text/css", ".webp": "image/webp", ".png": "image/png", ".json": "application/json" };
const MATRIX = '<!doctype html><meta charset=utf-8><style>.mx-layer{position:absolute;inset:0;width:100%;height:100%}body{margin:0;background:#1a1c24}</style><body></body>';

let server: http.Server; let baseUrl: string;
test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const p = decodeURIComponent((req.url || "/").split("?")[0]);
    if (p === "/_matrix.html") { res.writeHead(200, { "content-type": "text/html" }); res.end(MATRIX); return; }
    try {
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

// Live face catalog: id === asset basename for all three masks.
const MASKS = ["ninja-mask", "hero-mask", "panda-mask"];
const REP = "hero-mask";                 // representative for the surface tests (covers the eyes)
const HAT = "hat-blue";
const maskUrl = (id: string) => `/assets/avatar/mask/${id}.svg`;
const hatUrl = (id: string) => `/assets/avatar/hat/${id}.svg`;
const UID = "00000000-0000-4000-8000-000000000001";
const idNeutralMedium = { v: 1, body_type: "neutral", skin_tone: "medium", hairstyle: "tousled", hair_color: "brown", chosen_at: "2026-06-01T00:00:00Z" };
const USER = { id: UID, aud: "authenticated", role: "authenticated", email: "r@e.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
function jwt() { const b = (o: any) => Buffer.from(JSON.stringify(o)).toString("base64url"); return b({ alg: "HS256", typ: "JWT" }) + "." + b({ sub: UID, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 2592000 }) + ".s"; }
const SESSION = { access_token: jwt(), token_type: "bearer", expires_in: 2592000, expires_at: Math.floor(Date.now() / 1000) + 2592000, refresh_token: "f", user: USER };
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS" };
const today = new Date().toISOString().slice(0, 10);
const FACE_ITEM = (id: string) => ({ id, name: id, price: 120, rarity: "rare", type: "avatar", image_url: maskUrl(id), slot_type: "face", layer_order: 6 });
const HAT_ITEM = (id: string) => ({ id, name: id, price: 10, rarity: "common", type: "avatar", image_url: hatUrl(id), slot_type: "headwear", layer_order: 5 });

function makeRoute(equipped: Record<string, string>) {
  return async (route: Route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const p = new URL(req.url()).pathname;
    const wo = ((req.headers()["accept"]) || "").includes("vnd.pgrst.object");
    const one = (o: any) => (wo ? o : [o]);
    const j = (b: any) => route.fulfill({ status: 200, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify(b) });
    const profile = { id: UID, role: "student", name: "R", email: "r@e.com", equipped_slots: equipped, active_title: null, active_theme: "default", avatar_gender: "neutral", avatar_identity: idNeutralMedium, grade: 5, selected_grade: 5, placement_band: 2, current_band: 2, xp: 420, coins: 500 };
    const owned = Object.values(equipped).map((item_id) => ({ item_id }));
    if (p.startsWith("/auth/v1/user")) return j(USER);
    if (p.startsWith("/auth/v1/token")) return j(SESSION);
    if (p.startsWith("/auth/v1/logout")) return route.fulfill({ status: 204, headers: CORS });
    if (p.startsWith("/functions/v1/")) return j({});
    if (p.startsWith("/rest/v1/rpc/")) return j(null);
    if (p.startsWith("/rest/v1/profiles")) return j(one(profile));
    if (p.startsWith("/rest/v1/student_progress")) return j([{ student_id: UID, xp: 420, coins: 500 }]);
    if (p.startsWith("/rest/v1/user_items")) return j(owned);
    if (p.startsWith("/rest/v1/shop_items")) return j([...MASKS.map(FACE_ITEM), HAT_ITEM(HAT)]);
    if (p.startsWith("/rest/v1/daily_login_rewards")) return j(one({ student_id: UID, last_claimed_date: today }));
    return j([]);
  };
}

async function open(browser: any, url: string, equipped: Record<string, string>, optIn = true) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 900 }, reducedMotion: "reduce" });
  await ctx.route("**://*.supabase.co/**", makeRoute(equipped));
  await ctx.addInitScript(([k, s, opt]: [string, any, boolean]) => {
    (window as any).__AVATAR_TEST__ = true;
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem("avatar_v2", "1");
    if (opt) localStorage.setItem("avatar_r2", "1"); else localStorage.removeItem("avatar_r2");
  }, [`sb-${REF}-auth-token`, SESSION, optIn]);
  const page = await ctx.newPage();
  await page.goto(`${baseUrl}${url}`, { waitUntil: "networkidle" });
  return { ctx, page };
}

function probe(page: any, sel: string) {
  return page.evaluate((s: string) => {
    const root = document.querySelector(s) as HTMLElement | null;
    if (!root) return { present: false };
    const imgs = Array.from(root.querySelectorAll("img")) as HTMLImageElement[];
    const cos = root.querySelector('[data-c2-layer="face-cosmetic"]') as HTMLElement | null;
    const hair = root.querySelector('[data-c2-layer="hair-r2"]') as HTMLElement | null;
    const hw = root.querySelector('[data-c2-layer="headwear"]') as HTMLElement | null;
    const lid = document.getElementById("avatar-blink-layer") as HTMLElement | null;
    const bb = (el: Element | null) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
    return {
      present: true,
      renderPath: root.dataset.avatarRenderPath ?? null,
      internalFace: root.querySelectorAll('[data-c2-layer="face"]').length,
      cosmeticCount: root.querySelectorAll('[data-c2-layer="face-cosmetic"]').length,
      cosmeticSrc: cos ? ((cos as HTMLImageElement).currentSrc || (cos as HTMLImageElement).src) : null,
      cosmeticZ: cos ? Number(cos.style.zIndex) : null,
      cosmeticBB: bb(cos),
      hairZ: hair ? Number(hair.style.zIndex) : null,
      headwearZ: hw ? Number(hw.style.zIndex) : null,
      lidZ: lid ? Number(getComputedStyle(lid).zIndex) : null,
      c2Svg: imgs.some((i) => (i.getAttribute("src") || "").includes("-c2.svg")),
      broken: imgs.filter((i) => i.complete && i.naturalWidth === 0).length,
    };
  }, sel);
}

// ── Surfaces: the equipped mask renders on R2 as a distinct cosmetic layer ─────
for (const [name, url, sel] of [
  ["avatar", "/avatar.html", "#avatar-preview"],
  ["hub", "/hub.html", "#profileAvatar"],
  ["quiz", "/index.html", "#avatar-display"],
] as const) {
  test(`mask on R2 — ${name}`, async ({ browser }) => {
    const { ctx, page } = await open(browser, url, { face: REP });
    await page.waitForSelector(`${sel}[data-avatar-rendered="1"]`, { timeout: 20000 });
    await page.waitForFunction((s) => !!document.querySelector(`${s} [data-c2-layer="face-cosmetic"]`), sel, { timeout: 10000 });
    const r = await probe(page, sel);
    expect(r.renderPath, `${name}: R2`).toBe("r2");
    expect(r.internalFace, `${name}: exactly one internal face layer`).toBe(1);
    expect(r.cosmeticCount, `${name}: exactly one face-cosmetic layer`).toBe(1);
    expect(r.cosmeticSrc, `${name}: cosmetic src is the mask asset`).toContain(`${REP}.svg`);
    expect(r.cosmeticZ! > 5, `${name}: cosmetic (${r.cosmeticZ}) above blink lid z5`).toBeTruthy();
    expect(r.cosmeticZ! < r.hairZ!, `${name}: hero mask (${r.cosmeticZ}) under hair (${r.hairZ})`).toBeTruthy();
    expect(r.c2Svg, `${name}: no C2 .svg base leak`).toBeFalsy();
    expect(r.broken, `${name}: no broken images`).toBe(0);
    await ctx.close();
  });
}

test("per-item z: ninja/hero under the hair, panda ABOVE the hair (full-face replacement)", async ({ browser }) => {
  for (const [mask, expectAboveHair] of [["ninja-mask", false], ["hero-mask", false], ["panda-mask", true]] as const) {
    const { ctx, page } = await open(browser, "/avatar.html", { face: mask });
    await page.waitForSelector('#avatar-preview[data-avatar-rendered="1"]', { timeout: 20000 });
    await page.waitForFunction(() => !!document.querySelector('#avatar-preview [data-c2-layer="face-cosmetic"]'), { timeout: 10000 });
    const r = await probe(page, "#avatar-preview");
    expect(r.cosmeticCount, `${mask}: one cosmetic`).toBe(1);
    if (expectAboveHair) expect(r.cosmeticZ! > r.hairZ!, `${mask} above hair`).toBeTruthy();
    else expect(r.cosmeticZ! < r.hairZ!, `${mask} under hair`).toBeTruthy();
    await ctx.close();
  }
});

test("blink leaves the mask in place (mask stays above the closed lid, bbox unchanged)", async ({ browser }) => {
  const { ctx, page } = await open(browser, "/avatar.html", { face: REP });
  await page.waitForSelector('#avatar-preview[data-avatar-rendered="1"]', { timeout: 20000 });
  await page.waitForFunction(() => !!document.querySelector('#avatar-preview [data-c2-layer="face-cosmetic"]') && !!(window as any).__avatarBlinkEngine, { timeout: 10000 });
  const before = await probe(page, "#avatar-preview");
  await page.evaluate(() => (window as any).__avatarBlinkEngine.forceFrame("closed"));
  await page.waitForTimeout(80);
  const after = await probe(page, "#avatar-preview");
  expect(after.lidZ, "blink lid present with z5").toBe(5);
  expect(after.cosmeticZ! > after.lidZ!, "mask stays above the closed lid").toBeTruthy();
  expect(after.cosmeticCount, "mask still present through a blink").toBe(1);
  expect(after.cosmeticBB, "mask does not move when blinking").toEqual(before.cosmeticBB);
  await ctx.close();
});

test("expression swap leaves the mask in place (face swaps under, mask bbox unchanged)", async ({ browser }) => {
  const { ctx, page } = await open(browser, "/avatar.html", { face: REP });
  await page.waitForSelector('#avatar-preview[data-avatar-rendered="1"]', { timeout: 20000 });
  await page.waitForFunction(() => !!document.querySelector('#avatar-preview [data-c2-layer="face-cosmetic"]') && !!(window as any).__avatarExprEngine, { timeout: 10000 });
  const before = await probe(page, "#avatar-preview");
  await page.evaluate(() => (window as any).__avatarExprEngine.forceExpression("proud"));
  await page.waitForFunction(() => ((document.querySelector('#avatar-preview img[data-c2-layer="face"]') as HTMLImageElement)?.getAttribute("src") || "").includes("face-proud-v1.webp"), { timeout: 10000 });
  await page.waitForTimeout(50);
  const after = await probe(page, "#avatar-preview");
  expect(after.renderPath, "still R2").toBe("r2");
  expect(after.cosmeticBB, "mask invariant to the expression swap").toEqual(before.cosmeticBB);
  expect(after.cosmeticCount, "mask still present").toBe(1);
  await ctx.close();
});

test("headwear + panda mask compose with the correct z-order (hat above the panda)", async ({ browser }) => {
  const { ctx, page } = await open(browser, "/avatar.html", { face: "panda-mask", headwear: HAT });
  await page.waitForSelector('#avatar-preview[data-avatar-rendered="1"]', { timeout: 20000 });
  await page.waitForFunction(() => !!document.querySelector('#avatar-preview [data-c2-layer="face-cosmetic"]') && !!document.querySelector('#avatar-preview [data-c2-layer="headwear"]'), { timeout: 10000 });
  const r = await probe(page, "#avatar-preview");
  expect(r.renderPath, "R2").toBe("r2");
  expect(r.cosmeticZ! > r.hairZ!, "panda above hair").toBeTruthy();
  expect(r.headwearZ! > r.cosmeticZ!, "headwear paints above the panda mask").toBeTruthy();
  expect(r.broken, "no broken images").toBe(0);
  await ctx.close();
});

test("opt-out → C2 (mask no longer on the R2 stack)", async ({ browser }) => {
  const { ctx, page } = await open(browser, "/avatar.html", { face: REP }, /* optIn */ false);
  await page.waitForSelector('#avatar-preview[data-avatar-rendered="1"]', { timeout: 20000 });
  const r = await probe(page, "#avatar-preview");
  expect(r.renderPath, "C2 without opt-in").toBe("c2");
  expect(r.cosmeticCount, "no R2 face-cosmetic marker on the C2 path").toBe(0);
  await ctx.close();
});

test("shop stays uniform C2 preview even with R2 opt-in (D-077 unaffected)", async ({ browser }) => {
  const { ctx, page } = await open(browser, "/shop.html", {}, /* optIn */ true);
  await page.waitForSelector('.shop-preview[data-avatar-rendered="1"]', { timeout: 20000 });
  const counts = await page.evaluate(() => ({
    r2: document.querySelectorAll('.shop-preview[data-avatar-render-path="r2"]').length,
    c2: document.querySelectorAll('.shop-preview[data-avatar-render-path="c2"]').length,
  }));
  expect(counts.r2, "no R2 shop preview").toBe(0);
  expect(counts.c2, "shop previews are C2").toBeGreaterThanOrEqual(1);
  await ctx.close();
});

// ── Golden MATRIX: all three masks × avatar/hub/quiz sizes on the R2 figure ────
test("golden: R2 mask matrix (all three masks × sizes)", async ({ browser, browserName }) => {
  const ctx = await browser.newContext({ viewport: { width: 760, height: 720 }, reducedMotion: "reduce" });
  await ctx.route("**://*.supabase.co/**", makeRoute({}));
  await ctx.addInitScript(() => localStorage.setItem("avatar_r2", "1"));
  const page = await ctx.newPage();
  await page.goto(`${baseUrl}/_matrix.html`, { waitUntil: "networkidle" });
  const info = await page.evaluate(async (masks: string[]) => {
    const mod: any = await import("/js/avatar-render-c2.js");
    const id = { v: 1, body_type: "neutral", skin_tone: "medium", hairstyle: "tousled", hair_color: "brown" };
    const SIZES = [ { name: "avatar", w: 180, h: 270 }, { name: "hub", w: 112, h: 168 }, { name: "quiz", w: 72, h: 108 } ];
    document.body.style.cssText = "margin:0;background:#1a1c24;color:#c9cfdd;font:12px/1.3 system-ui,sans-serif;padding:16px";
    const label = (t: string) => { const el = document.createElement("div"); el.style.cssText = "white-space:pre-line;text-align:center;align-self:center;justify-self:center"; el.textContent = t; return el; };
    const grid = document.createElement("div");
    grid.style.cssText = "display:inline-grid;grid-template-columns:auto repeat(3,max-content);gap:12px 16px;align-items:end;justify-items:center";
    grid.appendChild(label(""));
    for (const s of SIZES) grid.appendChild(label(s.name + "\n" + s.w + "×" + s.h));
    const out: any[] = [];
    for (const mask of masks) {
      grid.appendChild(label(mask));
      for (const size of SIZES) {
        const wrap = document.createElement("div");
        wrap.style.cssText = "position:relative;width:" + size.w + "px;height:" + size.h + "px;outline:1px solid #2c3142";
        grid.appendChild(wrap);
        const cosmetics = mod.c2CosmeticLayers({ face: "/assets/avatar/mask/" + mask + ".svg" }, (x: string) => x);
        const rp = await mod.mountC2Avatar(wrap, id, { layerClass: "mx-layer", cosmetics });
        const cos = wrap.querySelector('[data-c2-layer="face-cosmetic"]') as HTMLImageElement | null;
        out.push({ mask, size: size.name, rp, hasCos: !!cos, z: cos ? Number(cos.style.zIndex) : null, internalFace: wrap.querySelectorAll('[data-c2-layer="face"]').length, c2: !!wrap.querySelector('img[src*="-c2.svg"]') });
      }
    }
    document.body.appendChild(grid);
    await Promise.all(Array.from(document.images).map((im) => (im.decode ? im.decode().catch(() => {}) : Promise.resolve())));
    return out;
  }, MASKS);
  // structural invariants for every cell (all browsers): R2, mask present, one internal face, no C2 leak
  expect(info.length, "3 masks × 3 sizes").toBe(9);
  for (const it of info) {
    const tag = `${it.mask}@${it.size}`;
    expect(it.rp, `${tag}: R2`).toBe("r2");
    expect(it.hasCos, `${tag}: mask present`).toBeTruthy();
    expect(it.internalFace, `${tag}: one internal face layer`).toBe(1);
    expect(it.z, `${tag}: cosmetic z above blink lid`).toBeGreaterThan(5);
    expect(it.c2, `${tag}: no C2 svg leak`).toBeFalsy();
  }
  await page.waitForTimeout(120);
  if (browserName === "chromium") {
    await expect(page.locator("body")).toHaveScreenshot("r2-mask-matrix.png", { maxDiffPixels: 400 });
  }
  await ctx.close();
});
