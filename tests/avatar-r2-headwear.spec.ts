// Avatar R2 headwear (D-079) — first R2 item-equipment slice. SELF-SERVED + FIXTURE-INTERCEPTED
// (0 real backend from the spec, fictitious local fixtures). Proves: a real equipped headwear item
// renders on the R2 stack on avatar/hub/quiz (layer above the R2 hair, no C2-base leak, no broken
// images), living engines intact, opt-out → C2, and the shop stays uniform C2 (D-077 unaffected).
// Plus a compact golden MATRIX of all five current headwear items on the R2 figure for one-glance
// transform review. Global AVATAR_R2 stays false; R2 is per-browser opt-in.
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

const HATS = ["crown-golden", "crown-silver", "hat-blue", "pirate-hat", "bow-yellow"];
const REP = "hat-blue"; // representative item for the surface tests
const hatUrl = (id: string) => `/assets/avatar/hat/${id}.svg`;
const UID = "00000000-0000-4000-8000-000000000001";
const idNeutralMedium = { v: 1, body_type: "neutral", skin_tone: "medium", hairstyle: "tousled", hair_color: "brown", chosen_at: "2026-06-01T00:00:00Z" };
const USER = { id: UID, aud: "authenticated", role: "authenticated", email: "r@e.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
function jwt() { const b = (o: any) => Buffer.from(JSON.stringify(o)).toString("base64url"); return b({ alg: "HS256", typ: "JWT" }) + "." + b({ sub: UID, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 2592000 }) + ".s"; }
const SESSION = { access_token: jwt(), token_type: "bearer", expires_in: 2592000, expires_at: Math.floor(Date.now() / 1000) + 2592000, refresh_token: "f", user: USER };
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS" };
const today = new Date().toISOString().slice(0, 10);
const HAT_ITEM = (id: string) => ({ id, name: id, price: 10, rarity: "common", type: "avatar", image_url: hatUrl(id), slot_type: "headwear", layer_order: 1 });

function makeRoute(equippedHat: string | null) {
  return async (route: Route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const p = new URL(req.url()).pathname;
    const wo = ((req.headers()["accept"]) || "").includes("vnd.pgrst.object");
    const one = (o: any) => (wo ? o : [o]);
    const j = (b: any) => route.fulfill({ status: 200, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify(b) });
    const profile = { id: UID, role: "student", name: "R", email: "r@e.com", equipped_slots: equippedHat ? { headwear: equippedHat } : {}, active_title: null, active_theme: "default", avatar_gender: "neutral", avatar_identity: idNeutralMedium, grade: 5, selected_grade: 5, placement_band: 2, current_band: 2, xp: 420, coins: 500 };
    if (p.startsWith("/auth/v1/user")) return j(USER);
    if (p.startsWith("/auth/v1/token")) return j(SESSION);
    if (p.startsWith("/auth/v1/logout")) return route.fulfill({ status: 204, headers: CORS });
    if (p.startsWith("/functions/v1/")) return j({});
    if (p.startsWith("/rest/v1/rpc/")) return j(null);
    if (p.startsWith("/rest/v1/profiles")) return j(one(profile));
    if (p.startsWith("/rest/v1/student_progress")) return j([{ student_id: UID, xp: 420, coins: 500 }]);
    if (p.startsWith("/rest/v1/user_items")) return j(equippedHat ? [{ item_id: equippedHat }] : []);
    if (p.startsWith("/rest/v1/shop_items")) return j(HATS.map(HAT_ITEM));
    if (p.startsWith("/rest/v1/daily_login_rewards")) return j(one({ student_id: UID, last_claimed_date: today }));
    return j([]);
  };
}

async function open(browser: any, url: string, equippedHat: string | null, optIn = true) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 900 }, reducedMotion: "reduce" });
  await ctx.route("**://*.supabase.co/**", makeRoute(equippedHat));
  await ctx.addInitScript(([k, s, opt]: [string, any, boolean]) => {
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
    const hw = root.querySelector('[data-c2-layer="headwear"]') as HTMLElement | null;
    const hair = root.querySelector('[data-c2-layer="hair-r2"]') as HTMLElement | null;
    return {
      present: true,
      renderPath: root.dataset.avatarRenderPath ?? null,
      hasHeadwear: !!hw,
      headwearZ: hw ? Number(hw.style.zIndex) : null,
      hairZ: hair ? Number(hair.style.zIndex) : null,
      headwearSrc: hw ? ((hw as HTMLImageElement).currentSrc || (hw as HTMLImageElement).src) : null,
      c2Svg: imgs.some((i) => (i.getAttribute("src") || "").includes("-c2.svg")),
      broken: imgs.filter((i) => i.complete && i.naturalWidth === 0).length,
    };
  }, sel);
}

// ── Surfaces: a real equipped hat renders on R2 above the hair, no C2 leak ────
for (const [name, url, sel] of [
  ["avatar", "/avatar.html", "#avatar-preview"],
  ["hub", "/hub.html", "#profileAvatar"],
  ["quiz", "/index.html", "#avatar-display"],
] as const) {
  test(`headwear on R2 — ${name}`, async ({ browser }) => {
    const { ctx, page } = await open(browser, url, REP);
    await page.waitForSelector(`${sel}[data-avatar-rendered="1"]`, { timeout: 20000 });
    await page.waitForFunction((s) => !!document.querySelector(`${s} [data-c2-layer="headwear"]`), sel, { timeout: 10000 });
    const r = await probe(page, sel);
    expect(r.renderPath, `${name}: R2`).toBe("r2");
    expect(r.hasHeadwear, `${name}: headwear layer present`).toBeTruthy();
    expect(r.headwearSrc, `${name}: headwear src is the item asset`).toContain(`${REP}.svg`);
    expect(r.headwearZ! > r.hairZ!, `${name}: headwear (${r.headwearZ}) above hair (${r.hairZ})`).toBeTruthy();
    expect(r.c2Svg, `${name}: no C2 .svg base leak`).toBeFalsy();
    expect(r.broken, `${name}: no broken images`).toBe(0);
    await ctx.close();
  });
}

test("opt-out → C2 (headwear no longer on the R2 stack)", async ({ browser }) => {
  const { ctx, page } = await open(browser, "/avatar.html", REP, /* optIn */ false);
  await page.waitForSelector('#avatar-preview[data-avatar-rendered="1"]', { timeout: 20000 });
  const r = await probe(page, "#avatar-preview");
  expect(r.renderPath, "C2 without opt-in").toBe("c2");
  await ctx.close();
});

test("shop stays uniform C2 preview even with R2 opt-in (D-077 unaffected)", async ({ browser }) => {
  const { ctx, page } = await open(browser, "/shop.html", null, /* optIn */ true);
  await page.waitForSelector('.shop-preview[data-avatar-rendered="1"]', { timeout: 20000 });
  const counts = await page.evaluate(() => ({
    r2: document.querySelectorAll('.shop-preview[data-avatar-render-path="r2"]').length,
    c2: document.querySelectorAll('.shop-preview[data-avatar-render-path="c2"]').length,
  }));
  expect(counts.r2, "no R2 shop preview").toBe(0);
  expect(counts.c2, "shop previews are C2").toBeGreaterThanOrEqual(1);
  await ctx.close();
});

// ── Golden MATRIX: all five headwear items on the R2 figure (one-glance review) ─
test("golden: R2 headwear matrix (all five items)", async ({ browser, browserName }) => {
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 420 }, reducedMotion: "reduce" });
  await ctx.route("**://*.supabase.co/**", makeRoute(null));
  await ctx.addInitScript(() => localStorage.setItem("avatar_r2", "1"));
  const page = await ctx.newPage();
  await page.goto(`${baseUrl}/_matrix.html`, { waitUntil: "networkidle" });
  const info = await page.evaluate(async (hats: string[]) => {
    const mod: any = await import("/js/avatar-render-c2.js");
    const id = { v: 1, body_type: "neutral", skin_tone: "medium", hairstyle: "tousled", hair_color: "brown" };
    document.body.style.cssText = "margin:0;background:#1a1c24;display:flex;flex-wrap:nowrap";
    const out: any[] = [];
    for (const hat of hats) {
      const wrap = document.createElement("div");
      wrap.style.cssText = "position:relative;width:220px;height:330px;margin:6px";
      wrap.dataset.hat = hat;
      document.body.appendChild(wrap);
      const cosmetics = mod.c2CosmeticLayers({ headwear: "/assets/avatar/hat/" + hat + ".svg" }, (x: string) => x);
      const rp = await mod.mountC2Avatar(wrap, id, { layerClass: "mx-layer", cosmetics });
      const hw = wrap.querySelector('[data-c2-layer="headwear"]') as HTMLImageElement | null;
      out.push({ hat, rp, hasHeadwear: !!hw, z: hw ? Number(hw.style.zIndex) : null, c2: !!wrap.querySelector('img[src*="-c2.svg"]') });
    }
    // wait for all layer images to decode
    await Promise.all(Array.from(document.images).map((im) => (im.decode ? im.decode().catch(() => {}) : Promise.resolve())));
    return out;
  }, HATS);
  // structural invariants for every item (all browsers)
  for (const it of info) {
    expect(it.rp, `${it.hat}: R2`).toBe("r2");
    expect(it.hasHeadwear, `${it.hat}: headwear layer`).toBeTruthy();
    expect(it.z, `${it.hat}: z above hair 40`).toBeGreaterThan(40);
    expect(it.c2, `${it.hat}: no C2 svg leak`).toBeFalsy();
  }
  if (browserName === "chromium") {
    await expect(page.locator("body")).toHaveScreenshot("r2-headwear-matrix.png", { maxDiffPixels: 350 });
  }
  await ctx.close();
});
