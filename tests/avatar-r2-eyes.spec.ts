// Avatar R2 eyes/glasses (D-080) — second R2 item-equipment slice. SELF-SERVED + FIXTURE-INTERCEPTED
// (0 real backend from the spec, fictitious local fixtures). Proves: the ONE active eyes item
// (glasses-round) renders on the R2 stack as a DISTINCT cosmetic layer (marker "eyes-cosmetic", z6 —
// above the internal eye stack + blink lid, under the hair), re-seated onto the R2 eye-line by a wrapper
// transform; the mandatory internal "eyes" layer is untouched (exactly one of each); blink and
// expressions leave the glasses in place; headwear can show simultaneously with the correct z-order;
// opt-out → C2; the shop stays uniform C2 (D-077). Plus a compact golden MATRIX of the glasses across
// avatar/hub/quiz sizes × neutral/proud/focused expressions + a closed blink frame. AVATAR_R2 stays
// false; R2 is per-browser opt-in.
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

// The ONLY live eyes catalog item: id `glasses-round`, but since migration 20260623000000 its image_url
// is the front-only 164Z asset glasses-round-basic-v1.svg (asset-basename glasses-round-basic-v1). The
// fixtures mirror the LIVE binding — catalog id ≠ asset basename.
const EYES_ID = "glasses-round";                 // live catalog id
const EYES_ASSET = "glasses-round-basic-v1";     // live asset basename (what image_url points at)
const EYES_IDS = [EYES_ID];
const REP = EYES_ID;
const HAT = "hat-blue";                 // for the headwear + glasses combo test
const eyesUrl = (asset: string) => `/assets/avatar/glasses/${asset}.svg`;
const hatUrl = (id: string) => `/assets/avatar/hat/${id}.svg`;
const UID = "00000000-0000-4000-8000-000000000001";
const idNeutralMedium = { v: 1, body_type: "neutral", skin_tone: "medium", hairstyle: "tousled", hair_color: "brown", chosen_at: "2026-06-01T00:00:00Z" };
const USER = { id: UID, aud: "authenticated", role: "authenticated", email: "r@e.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
function jwt() { const b = (o: any) => Buffer.from(JSON.stringify(o)).toString("base64url"); return b({ alg: "HS256", typ: "JWT" }) + "." + b({ sub: UID, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 2592000 }) + ".s"; }
const SESSION = { access_token: jwt(), token_type: "bearer", expires_in: 2592000, expires_at: Math.floor(Date.now() / 1000) + 2592000, refresh_token: "f", user: USER };
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS" };
const today = new Date().toISOString().slice(0, 10);
// live binding: catalog id `glasses-round` → image_url the basic-v1 asset (migration 20260623000000)
const EYES_ITEM = (id: string) => ({ id, name: id, price: 90, rarity: "common", type: "avatar", image_url: eyesUrl(EYES_ASSET), slot_type: "eyes", layer_order: 7 });
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
    if (p.startsWith("/rest/v1/shop_items")) return j([...EYES_IDS.map(EYES_ITEM), HAT_ITEM(HAT)]);
    if (p.startsWith("/rest/v1/daily_login_rewards")) return j(one({ student_id: UID, last_claimed_date: today }));
    return j([]);
  };
}

async function open(browser: any, url: string, equipped: Record<string, string>, optIn = true) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 900 }, reducedMotion: "reduce" });
  await ctx.route("**://*.supabase.co/**", makeRoute(equipped));
  await ctx.addInitScript(([k, s, opt]: [string, any, boolean]) => {
    (window as any).__AVATAR_TEST__ = true; // gates the blink/expression forceFrame handles
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem("avatar_v2", "1");
    if (opt) localStorage.setItem("avatar_r2", "1"); else localStorage.setItem("avatar_r2", "0");
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
    const cos = root.querySelector('[data-c2-layer="eyes-cosmetic"]') as HTMLElement | null;
    const hair = root.querySelector('[data-c2-layer="hair-r2"]') as HTMLElement | null;
    const hw = root.querySelector('[data-c2-layer="headwear"]') as HTMLElement | null;
    const lid = document.getElementById("avatar-blink-layer") as HTMLElement | null;
    const bb = (el: Element | null) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
    return {
      present: true,
      renderPath: root.dataset.avatarRenderPath ?? null,
      internalEyes: root.querySelectorAll('[data-c2-layer="eyes"]').length,
      cosmeticCount: root.querySelectorAll('[data-c2-layer="eyes-cosmetic"]').length,
      cosmeticSrc: cos ? ((cos as HTMLImageElement).currentSrc || (cos as HTMLImageElement).src) : null,
      cosmeticZ: cos ? Number(cos.style.zIndex) : null,
      cosmeticBB: bb(cos),
      hairZ: hair ? Number(hair.style.zIndex) : null,
      headwearZ: hw ? Number(hw.style.zIndex) : null,
      lidZ: lid ? Number(getComputedStyle(lid).zIndex) : null,
      faceSrc: (root.querySelector('img[data-c2-layer="face"]') as HTMLImageElement | null)?.getAttribute("src") || "",
      c2Svg: imgs.some((i) => (i.getAttribute("src") || "").includes("-c2.svg")),
      broken: imgs.filter((i) => i.complete && i.naturalWidth === 0).length,
    };
  }, sel);
}

// ── Surfaces: the equipped glasses render on R2 as a distinct cosmetic layer ───
for (const [name, url, sel] of [
  ["avatar", "/avatar.html", "#avatar-preview"],
  ["hub", "/hub.html", "#profileAvatar"],
  ["quiz", "/index.html", "#avatar-display"],
] as const) {
  test(`glasses on R2 — ${name}`, async ({ browser }) => {
    const { ctx, page } = await open(browser, url, { eyes: REP });
    await page.waitForSelector(`${sel}[data-avatar-rendered="1"]`, { timeout: 20000 });
    await page.waitForFunction((s) => !!document.querySelector(`${s} [data-c2-layer="eyes-cosmetic"]`), sel, { timeout: 10000 });
    const r = await probe(page, sel);
    expect(r.renderPath, `${name}: R2`).toBe("r2");
    expect(r.internalEyes, `${name}: exactly one internal eyes layer`).toBe(1);
    expect(r.cosmeticCount, `${name}: exactly one eyes-cosmetic layer`).toBe(1);
    expect(r.cosmeticSrc, `${name}: cosmetic src is the live glasses asset`).toContain(`${EYES_ASSET}.svg`);
    expect(r.cosmeticZ! > 5, `${name}: cosmetic (${r.cosmeticZ}) above blink lid z5`).toBeTruthy();
    expect(r.cosmeticZ! < r.hairZ!, `${name}: cosmetic (${r.cosmeticZ}) under hair (${r.hairZ})`).toBeTruthy();
    expect(r.c2Svg, `${name}: no C2 .svg base leak`).toBeFalsy();
    expect(r.broken, `${name}: no broken images`).toBe(0);
    await ctx.close();
  });
}

test("blink leaves the glasses in place (cosmetic stays above the closed lid, bbox unchanged)", async ({ browser }) => {
  const { ctx, page } = await open(browser, "/avatar.html", { eyes: REP });
  await page.waitForSelector('#avatar-preview[data-avatar-rendered="1"]', { timeout: 20000 });
  await page.waitForFunction(() => !!document.querySelector('#avatar-preview [data-c2-layer="eyes-cosmetic"]') && !!(window as any).__avatarBlinkEngine, { timeout: 10000 });
  const before = await probe(page, "#avatar-preview");
  await page.evaluate(() => (window as any).__avatarBlinkEngine.forceFrame("closed"));
  await page.waitForTimeout(80);
  const after = await probe(page, "#avatar-preview");
  expect(after.lidZ, "blink lid present with z5").toBe(5);
  expect(after.cosmeticZ! > after.lidZ!, "glasses stay above the closed lid").toBeTruthy();
  expect(after.cosmeticCount, "glasses still present through a blink").toBe(1);
  expect(after.cosmeticBB, "glasses do not move when blinking").toEqual(before.cosmeticBB);
  expect(after.broken, "no broken images").toBe(0);
  await ctx.close();
});

test("expression swap leaves the glasses in place (face swaps under, glasses bbox unchanged)", async ({ browser }) => {
  const { ctx, page } = await open(browser, "/avatar.html", { eyes: REP });
  await page.waitForSelector('#avatar-preview[data-avatar-rendered="1"]', { timeout: 20000 });
  await page.waitForFunction(() => !!document.querySelector('#avatar-preview [data-c2-layer="eyes-cosmetic"]') && !!(window as any).__avatarExprEngine, { timeout: 10000 });
  const before = await probe(page, "#avatar-preview");
  await page.evaluate(() => (window as any).__avatarExprEngine.forceExpression("proud"));
  await page.waitForFunction(() => ((document.querySelector('#avatar-preview img[data-c2-layer="face"]') as HTMLImageElement)?.getAttribute("src") || "").includes("face-proud-v1.webp"), { timeout: 10000 });
  await page.waitForTimeout(50);
  const after = await probe(page, "#avatar-preview");
  expect(after.renderPath, "still R2").toBe("r2");
  expect(after.faceSrc, "face swapped to proud").toContain("face-proud-v1.webp");
  expect(after.cosmeticBB, "glasses invariant to the expression swap").toEqual(before.cosmeticBB);
  expect(after.cosmeticCount, "glasses still present").toBe(1);
  await ctx.close();
});

test("headwear + glasses show simultaneously with the correct z-order", async ({ browser }) => {
  const { ctx, page } = await open(browser, "/avatar.html", { eyes: REP, headwear: HAT });
  await page.waitForSelector('#avatar-preview[data-avatar-rendered="1"]', { timeout: 20000 });
  await page.waitForFunction(() => !!document.querySelector('#avatar-preview [data-c2-layer="eyes-cosmetic"]') && !!document.querySelector('#avatar-preview [data-c2-layer="headwear"]'), { timeout: 10000 });
  const r = await probe(page, "#avatar-preview");
  expect(r.renderPath, "R2").toBe("r2");
  expect(r.headwearZ! > r.hairZ!, "headwear above hair").toBeTruthy();
  expect(r.cosmeticZ! < r.hairZ!, "glasses under hair").toBeTruthy();
  expect(r.headwearZ! > r.cosmeticZ!, "headwear paints above the glasses").toBeTruthy();
  expect(r.broken, "no broken images").toBe(0);
  await ctx.close();
});

test("opt-out → C2 (glasses no longer on the R2 stack)", async ({ browser }) => {
  const { ctx, page } = await open(browser, "/avatar.html", { eyes: REP }, /* optIn */ false);
  await page.waitForSelector('#avatar-preview[data-avatar-rendered="1"]', { timeout: 20000 });
  const r = await probe(page, "#avatar-preview");
  expect(r.renderPath, "C2 without opt-in").toBe("c2");
  expect(r.cosmeticCount, "no R2 eyes-cosmetic marker on the C2 path").toBe(0);
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

// ── Golden MATRIX: glasses across avatar/hub/quiz sizes × expressions + a closed blink frame ──
// One compact labelled grid (rows = states neutral/proud/focused/blink-closed, columns = the three
// surface sizes) so the eye-line, both pupils, no cut-off, fringe overlap and blink/expression
// stability are reviewable at one glance and at real responsive scale.
test("golden: R2 glasses matrix (sizes × expressions + blink)", async ({ browser, browserName }) => {
  const ctx = await browser.newContext({ viewport: { width: 760, height: 900 }, reducedMotion: "reduce" });
  await ctx.route("**://*.supabase.co/**", makeRoute({}));
  await ctx.addInitScript(() => { (window as any).__AVATAR_TEST__ = true; localStorage.setItem("avatar_r2", "1"); });
  const page = await ctx.newPage();
  await page.goto(`${baseUrl}/_matrix.html`, { waitUntil: "networkidle" });
  const info = await page.evaluate(async (asset: string) => {
    const mod: any = await import("/js/avatar-render-c2.js");
    const lay: any = await import("/js/avatar-layers.js");
    const blinkMod: any = await import("/js/avatar-blink-engine.js");
    const id = { v: 1, body_type: "neutral", skin_tone: "medium", hairstyle: "tousled", hair_color: "brown" };
    const SIZES = [ { name: "avatar", w: 180, h: 270 }, { name: "hub", w: 112, h: 168 }, { name: "quiz", w: 72, h: 108 } ];
    const STATES = [
      { name: "neutral", face: null as string | null, blink: false },
      { name: "proud", face: "proud", blink: false },
      { name: "focused", face: "focused", blink: false },
      { name: "blink-closed", face: null, blink: true },
    ];
    document.body.style.cssText = "margin:0;background:#1a1c24;color:#c9cfdd;font:12px/1.3 system-ui,sans-serif;padding:16px";
    const label = (t: string) => { const el = document.createElement("div"); el.style.cssText = "white-space:pre-line;text-align:center;align-self:center;justify-self:center"; el.textContent = t; return el; };
    const grid = document.createElement("div");
    grid.style.cssText = "display:inline-grid;grid-template-columns:auto repeat(3,max-content);gap:12px 16px;align-items:end;justify-items:center";
    grid.appendChild(label(""));
    for (const s of SIZES) grid.appendChild(label(s.name + "\n" + s.w + "×" + s.h));
    const out: any[] = [];
    for (const st of STATES) {
      grid.appendChild(label(st.name));
      for (const size of SIZES) {
        const wrap = document.createElement("div");
        wrap.style.cssText = "position:relative;width:" + size.w + "px;height:" + size.h + "px;outline:1px solid #2c3142";
        grid.appendChild(wrap);
        const cosmetics = mod.c2CosmeticLayers({ eyes: "/assets/avatar/glasses/" + asset + ".svg" }, (x: string) => x);
        const rp = await mod.mountC2Avatar(wrap, id, { layerClass: "mx-layer", cosmetics });
        // expression = a face-layer src swap (exactly what ExpressionEngine does on R2)
        if (st.face) { const f = wrap.querySelector('[data-c2-layer="face"]') as HTMLImageElement | null; if (f) f.src = lay.faceSrcForR2(st.face); }
        // blink-closed = the engine's own R2 lids, forced closed
        if (st.blink) { const be = new blinkMod.BlinkEngine(wrap, "medium", { mode: "r2" }); be.forceFrame("closed"); }
        const cos = wrap.querySelector('[data-c2-layer="eyes-cosmetic"]') as HTMLImageElement | null;
        out.push({ state: st.name, size: size.name, rp, hasCos: !!cos, z: cos ? Number(cos.style.zIndex) : null, internalEyes: wrap.querySelectorAll('[data-c2-layer="eyes"]').length, c2: !!wrap.querySelector('img[src*="-c2.svg"]') });
      }
    }
    document.body.appendChild(grid);
    await Promise.all(Array.from(document.images).map((im) => (im.decode ? im.decode().catch(() => {}) : Promise.resolve())));
    return out;
  }, EYES_ASSET);
  // structural invariants for every cell (all browsers)
  expect(info.length, "4 states × 3 sizes").toBe(12);
  for (const it of info) {
    const tag = `${it.state}@${it.size}`;
    expect(it.rp, `${tag}: R2`).toBe("r2");
    expect(it.hasCos, `${tag}: glasses present`).toBeTruthy();
    expect(it.internalEyes, `${tag}: one internal eyes layer`).toBe(1);
    expect(it.z, `${tag}: cosmetic z above blink lid`).toBeGreaterThan(5);
    expect(it.c2, `${tag}: no C2 svg leak`).toBeFalsy();
  }
  await page.waitForTimeout(120);
  if (browserName === "chromium") {
    await expect(page.locator("body")).toHaveScreenshot("r2-glasses-matrix.png", { maxDiffPixels: 400 });
  }
  await ctx.close();
});
