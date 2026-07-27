// Avatar R2 shop-preview grid verification — FORCE_ALL_SHOP_PREVIEWS_TO_C2 (pilot).
// SELF-SERVED + FIXTURE-INTERCEPTED: a local static server serves this branch's code; every
// *.supabase.co call is answered from fictitious local fixtures. The spec's own requests make no
// real backend call, no shared-student mutation, no real token. Renders shop.html with the R2 opt-in
// and shop items across slots (aura, back, headwear, face, body) and proves the WHOLE grid is C2:
// no product card renders the R2 stack (incl. the former R2-safe aura/back), every avatar-item
// preview has render-path c2 with the item visible, and no R2 base/asset leaks into the grid.

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
const USER = { id: UID, aud: "authenticated", role: "authenticated", email: "r@e.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
// LOCAL FICTITIOUS fixture token — not a real JWT, not from .env, not a production/account token.
function jwt() { const b = (o: any) => Buffer.from(JSON.stringify(o)).toString("base64url"); return b({ alg: "HS256", typ: "JWT" }) + "." + b({ sub: UID, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 2592000 }) + ".s"; }
const SESSION = { access_token: jwt(), token_type: "bearer", expires_in: 2592000, expires_at: Math.floor(Date.now() / 1000) + 2592000, refresh_token: "f", user: USER };
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS" };

// One product per slot, spanning the former R2-safe slots (aura/back) + always-C2 slots.
const ITEM_IMG = "/assets/avatar/expressions/expr-neutral.svg"; // a real local svg → cosmetic layer loads
const SHOP_ITEMS = [
  { id: "it-aura", name: "Aura", price: 10, rarity: "common", type: "avatar", image_url: ITEM_IMG, slot_type: "aura", layer_order: 1 },
  { id: "it-back", name: "Wings", price: 10, rarity: "common", type: "avatar", image_url: ITEM_IMG, slot_type: "back", layer_order: 1 },
  { id: "it-head", name: "Crown", price: 10, rarity: "common", type: "avatar", image_url: ITEM_IMG, slot_type: "headwear", layer_order: 1 },
  { id: "it-face", name: "Mask", price: 10, rarity: "common", type: "avatar", image_url: ITEM_IMG, slot_type: "face", layer_order: 1 },
  { id: "it-body", name: "Suit", price: 10, rarity: "common", type: "avatar", image_url: ITEM_IMG, slot_type: "body", layer_order: 1 },
];

function profile() {
  return { id: UID, role: "student", name: "R", email: "r@e.com", equipped_slots: {}, active_title: null, active_theme: "default", avatar_gender: "neutral", avatar_identity: idNeutralMedium, grade: 5, selected_grade: 5, placement_band: 2, current_band: 2, xp: 420, coins: 500 };
}
const route = async (r: Route) => {
  const req = r.request();
  if (req.method() === "OPTIONS") return r.fulfill({ status: 204, headers: CORS });
  const p = new URL(req.url()).pathname;
  const wo = ((req.headers()["accept"]) || "").includes("vnd.pgrst.object");
  const one = (o: any) => (wo ? o : [o]);
  const j = (b: any) => r.fulfill({ status: 200, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify(b) });
  if (p.startsWith("/auth/v1/user")) return j(USER);
  if (p.startsWith("/auth/v1/token")) return j(SESSION);
  if (p.startsWith("/auth/v1/logout")) return r.fulfill({ status: 204, headers: CORS });
  if (p.startsWith("/functions/v1/")) return j({});
  if (p.startsWith("/rest/v1/rpc/")) return j(null);
  if (p.startsWith("/rest/v1/profiles")) return j(one(profile()));
  if (p.startsWith("/rest/v1/student_progress")) return j([{ student_id: UID, xp: 420, coins: 500 }]);
  if (p.startsWith("/rest/v1/user_items")) return j([]);          // nothing owned → all cards unowned, still render
  if (p.startsWith("/rest/v1/shop_items")) return j(SHOP_ITEMS);
  return j([]);
};

test("shop grid is entirely C2 under R2 opt-in — no per-card R2, item visible", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, reducedMotion: "reduce" });
  const errs: string[] = [];
  await ctx.route("**://*.supabase.co/**", route);
  await ctx.addInitScript(([k, s]: [string, any]) => {
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem("avatar_v2", "1");
    localStorage.setItem("avatar_r2", "1"); // R2 opt-in ON — the grid must STILL be all-C2
  }, [`sb-${REF}-auth-token`, SESSION]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(`${baseUrl}/shop.html`, { waitUntil: "networkidle" });

  // Wait until every avatar-item preview has rendered.
  await expect
    .poll(async () => page.locator('.shop-preview[data-avatar-rendered="1"]').count(), { timeout: 20000 })
    .toBeGreaterThanOrEqual(SHOP_ITEMS.length);

  const probe = await page.evaluate(() => {
    const previews = Array.from(document.querySelectorAll(".shop-preview")) as HTMLElement[];
    const rendered = previews.filter((el) => el.dataset.avatarRendered === "1");
    const bySlot: Record<string, string> = {};
    let cosmeticSeen = 0;
    for (const el of rendered) {
      const card = el.closest(".shop-card") as HTMLElement | null;
      const slot = card?.dataset.slotType || "?";
      bySlot[slot] = el.dataset.avatarRenderPath || "";
      if (el.querySelector('[data-c2-layer="cosmetic"]')) cosmeticSeen++;
    }
    const imgs = Array.from(document.querySelectorAll(".shop-preview img")) as HTMLImageElement[];
    return {
      renderedCount: rendered.length,
      r2Count: document.querySelectorAll('.shop-preview[data-avatar-render-path="r2"]').length,
      c2Count: document.querySelectorAll('.shop-preview[data-avatar-render-path="c2"]').length,
      bySlot,
      r2AssetLeak: imgs.filter((i) => (i.getAttribute("src") || "").includes("avatar-r2/")).length,
      r2MarkerLeak: document.querySelectorAll('.shop-preview [data-c2-layer="hair-r2"], .shop-preview [data-c2-layer="iris"], .shop-preview [data-c2-layer="blush"]').length,
      cosmeticSeen,
    };
  });

  // No product card renders the R2 stack — including the former R2-safe aura/back.
  expect(probe.r2Count, "no .shop-preview renders R2").toBe(0);
  expect(probe.c2Count, "every rendered preview is C2").toBeGreaterThanOrEqual(SHOP_ITEMS.length);
  for (const slot of ["aura", "back", "headwear", "face", "body"]) {
    expect(probe.bySlot[slot], `${slot} card render-path`).toBe("c2");
  }
  // No R2 base/asset or R2-only marker leaks into the grid (no mixed stack).
  expect(probe.r2AssetLeak, "no avatar-r2/* asset in the shop grid").toBe(0);
  expect(probe.r2MarkerLeak, "no R2-only layer marker in the shop grid").toBe(0);
  // Existing cosmetics stay visible in the preview.
  expect(probe.cosmeticSeen, "item cosmetic layer visible in previews").toBeGreaterThanOrEqual(SHOP_ITEMS.length);

  expect(errs.filter((e) => !/favicon/i.test(e)), "no page errors").toEqual([]);
  await ctx.close();
});
