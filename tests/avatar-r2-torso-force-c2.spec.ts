// Avatar R2 — unrenderable equipped cosmetic drops the WHOLE avatar to C2 (D-082 option B, D-083).
// SELF-SERVED + FIXTURE-INTERCEPTED (0 real backend from this spec, fictitious local fixtures).
//
// The R2 stack cannot render the torso slot: the only live item (`armor-knight`, "Ridderdragt",
// 300 coins) is authored on the C2 wide-arm pose and every arm-side element lands on 0 px of the R2
// figure (measured — docs/167a-r2-cosmetic-slot-completion-audit.md). It used to be filtered out
// SILENTLY, so an opted-in pilot student saw the armour on C2 and nothing at all on R2.
//
// Proves on avatar/hub/quiz: an equipped Ridderdragt forces renderPath "c2" with the armour VISIBLE
// and no R2 layer; R2-supported items equipped alongside it come along to C2; removing it restores
// R2 (the fallback is scoped to what is equipped, not sticky); the observability event carries the
// DISTINCT reason `unsupported_cosmetic_equipped`; without opt-in nothing changes and no event is
// emitted; the shop stays uniform C2 (D-077). AVATAR_R2 is true (D-101); the C2 cases opt out with "0".
// No golden: this fix changes WHICH path renders, not how the C2 avatar looks (the C2 render is
// byte-unchanged), so no new baseline is introduced.
import { test, expect, Route } from "@playwright/test";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REF = "tjzbehwfagiwpwodsgwg";
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".svg": "image/svg+xml", ".css": "text/css", ".webp": "image/webp", ".png": "image/png", ".json": "application/json" };

let server: http.Server; let baseUrl: string;
test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const p = decodeURIComponent((req.url || "/").split("?")[0]);
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

// The live catalog rows this spec mirrors (D-082 §2): one torso item, plus two R2-supported items.
const ARMOR = "armor-knight";
// A second torso item with NO R2 artwork — the shape of any torso item added after D-090. It is the
// one that must still force the whole avatar to C2, so the D-083 protection keeps being exercised.
const UNWIRED = "future-robe";
const HAT = "hat-blue";
const GLASSES = "glasses-round";
const armorUrl = `/assets/avatar/shirt/${ARMOR}.svg`;
// Deliberately points at a REAL file so the C2 render is not testing a 404. What makes it unwired is
// its basename: `cape-red` is not registered in R2_MANIFEST.torso, so it has no R2 artwork.
const unwiredUrl = "/assets/avatar/shirt/cape-red.svg";
const ARMOR_R2 = "/assets/avatar-r2/torso/armor-knight-r2-v1.webp";
const hatUrl = `/assets/avatar/hat/${HAT}.svg`;
const glassesUrl = "/assets/avatar/glasses/glasses-round-basic-v1.svg";
const UID = "00000000-0000-4000-8000-000000000001";
const idNeutralMedium = { v: 1, body_type: "neutral", skin_tone: "medium", hairstyle: "tousled", hair_color: "brown", chosen_at: "2026-06-01T00:00:00Z" };
const USER = { id: UID, aud: "authenticated", role: "authenticated", email: "r@e.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
function jwt() { const b = (o: any) => Buffer.from(JSON.stringify(o)).toString("base64url"); return b({ alg: "HS256", typ: "JWT" }) + "." + b({ sub: UID, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 2592000 }) + ".s"; }
const SESSION = { access_token: jwt(), token_type: "bearer", expires_in: 2592000, expires_at: Math.floor(Date.now() / 1000) + 2592000, refresh_token: "f", user: USER };
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS" };
const today = new Date().toISOString().slice(0, 10);
const ITEMS = [
  { id: ARMOR, name: "Ridderdragt", price: 300, rarity: "rare", type: "avatar", image_url: armorUrl, slot_type: "torso", layer_order: 2 },
  { id: HAT, name: HAT, price: 10, rarity: "common", type: "avatar", image_url: hatUrl, slot_type: "headwear", layer_order: 5 },
  { id: GLASSES, name: "Runde Briller", price: 50, rarity: "common", type: "avatar", image_url: glassesUrl, slot_type: "eyes", layer_order: 7 },
  { id: UNWIRED, name: "Fremtidig kappe", price: 100, rarity: "rare", type: "avatar", image_url: unwiredUrl, slot_type: "torso", layer_order: 2 },
];

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
    if (p.startsWith("/rest/v1/shop_items")) return j(ITEMS);
    if (p.startsWith("/rest/v1/daily_login_rewards")) return j(one({ student_id: UID, last_claimed_date: today }));
    return j([]);
  };
}

type Ev = { level: string; payload: any };
async function open(browser: any, url: string, equipped: Record<string, string>, optIn = true) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 900 }, reducedMotion: "reduce" });
  await ctx.route("**://*.supabase.co/**", makeRoute(equipped));
  await ctx.addInitScript(([k, s, opt]: [string, any, boolean]) => {
    (window as any).__AVATAR_TEST__ = true;
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem("avatar_v2", "1");
    if (opt) localStorage.setItem("avatar_r2", "1"); else localStorage.setItem("avatar_r2", "0");
  }, [`sb-${REF}-auth-token`, SESSION, optIn]);
  const page = await ctx.newPage();
  const raw: any[] = [];
  page.on("console", (m) => { if (m.text().includes("[avatar-r2-observability]")) raw.push(m); });
  await page.goto(`${baseUrl}${url}`, { waitUntil: "networkidle" });
  const drain = async (): Promise<Ev[]> => {
    const out: Ev[] = [];
    for (const m of raw) { try { out.push({ level: m.type(), payload: await m.args()[1].jsonValue() }); } catch { /* ignore */ } }
    return out;
  };
  return { ctx, page, drain };
}

function probe(page: any, sel: string) {
  return page.evaluate((s: string) => {
    const root = document.querySelector(s) as HTMLElement | null;
    if (!root) return { present: false };
    const imgs = Array.from(root.querySelectorAll("img")) as HTMLImageElement[];
    const srcs = imgs.map((i) => i.getAttribute("src") || "");
    return {
      present: true,
      renderPath: root.dataset.avatarRenderPath ?? null,
      srcs,
      hasArmor: srcs.some((x) => x.includes("armor-knight.svg")),
      hasArmorR2: srcs.some((x) => x.includes("armor-knight-r2-v1.webp")),
      hasUnwired: srcs.some((x) => x.includes("cape-red.svg")),
      hasR2: srcs.some((x) => x.includes("avatar-r2/")),
      r2Markers: root.querySelectorAll('[data-c2-layer="hair-r2"],[data-c2-layer="blush"],[data-c2-layer="iris"]').length,
      c2Base: srcs.some((x) => x.includes("-c2.svg")),
      broken: imgs.filter((i) => i.complete && i.naturalWidth === 0).length,
    };
  }, sel);
}

const SURFACES = [
  ["avatar", "/avatar.html", "#avatar-preview"],
  ["hub", "/hub.html", "#profileAvatar"],
  ["quiz", "/index.html", "#avatar-display"],
] as const;

// ── The defect this PR closes: the paid item must never vanish ────────────────
for (const [name, url, sel] of SURFACES) {
  test(`a torso item WITHOUT R2 artwork → whole avatar C2, item visible — ${name}`, async ({ browser }) => {
    const { ctx, page } = await open(browser, url, { torso: UNWIRED });
    await page.waitForSelector(`${sel}[data-avatar-rendered="1"]`, { timeout: 20000 });
    const r = await probe(page, sel);
    expect(r.renderPath, `${name}: forced to C2 while an unrenderable item is equipped`).toBe("c2");
    expect(r.hasUnwired, `${name}: the item the student paid for is rendered`).toBeTruthy();
    expect(r.hasR2, `${name}: no R2 asset in the forced C2 render`).toBeFalsy();
    expect(r.r2Markers, `${name}: no R2 stack markers`).toBe(0);
    expect(r.c2Base, `${name}: the complete C2 base renders`).toBeTruthy();
    expect(r.broken, `${name}: no broken images`).toBe(0);
    await ctx.close();
  });
}

test("R2-supported items equipped alongside an unrenderable one come along to C2 (never a half-dressed figure)", async ({ browser }) => {
  const { ctx, page } = await open(browser, "/avatar.html", { torso: UNWIRED, headwear: HAT, eyes: GLASSES });
  await page.waitForSelector('#avatar-preview[data-avatar-rendered="1"]', { timeout: 20000 });
  const r = await probe(page, "#avatar-preview");
  expect(r.renderPath).toBe("c2");
  expect(r.hasUnwired, "the unrenderable torso item is visible").toBeTruthy();
  expect(r.srcs.some((x: string) => x.includes(`${HAT}.svg`)), "hat visible").toBeTruthy();
  expect(r.srcs.some((x: string) => x.includes("glasses-round-basic-v1.svg")), "glasses visible").toBeTruthy();
  expect(r.hasR2, "no R2 leak").toBeFalsy();
  await ctx.close();
});

test("scoped, not sticky: without the armour the same student renders R2 again", async ({ browser }) => {
  const { ctx, page } = await open(browser, "/avatar.html", { headwear: HAT });
  await page.waitForSelector('#avatar-preview[data-avatar-rendered="1"]', { timeout: 20000 });
  const r = await probe(page, "#avatar-preview");
  expect(r.renderPath, "R2 is unaffected when nothing unrenderable is equipped").toBe("r2");
  expect(r.hasR2).toBeTruthy();
  expect(r.hasArmor).toBeFalsy();
  await ctx.close();
});

// ── Observability: the fallback is reported with its OWN reason ───────────────
test("observability: c2_fallback / unsupported_cosmetic_equipped (never identity_ineligible)", async ({ browser }) => {
  const { ctx, page, drain } = await open(browser, "/avatar.html", { torso: UNWIRED });
  await page.waitForSelector('#avatar-preview[data-avatar-rendered="1"]', { timeout: 20000 });
  const events = await drain();
  expect(events.length, "exactly one event for the avatar root").toBe(1);
  expect(events[0].level, "a designed fallback is informational, never a warning").toBe("info");
  expect(events[0].payload).toEqual({
    event: "avatar_r2_render", version: 1, surface: "avatar",
    result: "c2_fallback", reason: "unsupported_cosmetic_equipped",
  });
  await ctx.close();
});

test("no opt-in: unchanged C2 render with the armour, and no observability event", async ({ browser }) => {
  const { ctx, page, drain } = await open(browser, "/avatar.html", { torso: ARMOR }, /* optIn */ false);
  await page.waitForSelector('#avatar-preview[data-avatar-rendered="1"]', { timeout: 20000 });
  const r = await probe(page, "#avatar-preview");
  expect(r.renderPath).toBe("c2");
  expect(r.hasArmor, "the C2 SVG renders exactly as before").toBeTruthy();
  expect(r.hasArmorR2, "no R2 asset may load without the opt-in").toBeFalsy();
  expect((await drain()).length, "a non-opted-in browser stays silent").toBe(0);
  await ctx.close();
});

// ── D-090 (A3.2): the armour now RENDERS on the R2 figure ────────────────────
for (const [name, url, sel] of SURFACES) {
  test(`equipped Ridderdragt renders ON the R2 stack — ${name}`, async ({ browser }) => {
    const { ctx, page } = await open(browser, url, { torso: ARMOR });
    await page.waitForSelector(`${sel}[data-avatar-rendered="1"]`, { timeout: 20000 });
    const r = await probe(page, sel);
    expect(r.renderPath, `${name}: the armour no longer forces C2`).toBe("r2");
    expect(r.hasArmorR2, `${name}: the R2 garment is mounted`).toBeTruthy();
    expect(r.hasArmor, `${name}: the C2 SVG must not leak into the R2 render`).toBeFalsy();
    expect(r.r2Markers, `${name}: the full R2 stack is present`).toBeGreaterThan(0);
    expect(r.broken, `${name}: no broken images`).toBe(0);
    await ctx.close();
  });
}

test("D-090: the armour renders together with headwear and glasses on R2", async ({ browser }) => {
  const { ctx, page } = await open(browser, "/avatar.html", { torso: ARMOR, headwear: HAT, eyes: GLASSES });
  await page.waitForSelector('#avatar-preview[data-avatar-rendered="1"]', { timeout: 20000 });
  const r = await probe(page, "#avatar-preview");
  expect(r.renderPath).toBe("r2");
  expect(r.hasArmorR2).toBeTruthy();
  for (const s of [hatUrl, glassesUrl]) expect(r.srcs.some((x: string) => x.includes(s))).toBeTruthy();
  expect(r.broken).toBe(0);
  await ctx.close();
});

test("D-090: unequipping the armour leaves a clean R2 render", async ({ browser }) => {
  const { ctx, page } = await open(browser, "/avatar.html", {});
  await page.waitForSelector('#avatar-preview[data-avatar-rendered="1"]', { timeout: 20000 });
  const r = await probe(page, "#avatar-preview");
  expect(r.renderPath).toBe("r2");
  expect(r.hasArmorR2, "no sticky garment layer").toBeFalsy();
  await ctx.close();
});

// THE case that protects the student: if the R2 garment cannot be fetched, the WHOLE avatar must
// fall to C2 with the armour visible — never an R2 figure standing there without the paid item.
test("D-090: a failing R2 garment drops the WHOLE avatar to C2, armour still visible", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 900 }, reducedMotion: "reduce" });
  await ctx.route("**://*.supabase.co/**", makeRoute({ torso: ARMOR }));
  await ctx.route(`**${ARMOR_R2}`, (route: Route) => route.fulfill({ status: 404, body: "gone" }));
  await ctx.addInitScript(([k, s]: [string, any]) => {
    (window as any).__AVATAR_TEST__ = true;
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem("avatar_v2", "1");
    localStorage.setItem("avatar_r2", "1");
  }, [`sb-${REF}-auth-token`, SESSION]);
  const page = await ctx.newPage();
  const raw: any[] = [];
  page.on("console", (m) => { if (m.text().includes("[avatar-r2-observability]")) raw.push(m); });
  await page.goto(`${baseUrl}/avatar.html`, { waitUntil: "networkidle" });
  await page.waitForSelector('#avatar-preview[data-avatar-rendered="1"]', { timeout: 20000 });
  const r = await probe(page, "#avatar-preview");
  expect(r.renderPath, "a mandatory layer failed → whole-stack C2").toBe("c2");
  expect(r.hasArmor, "the student still sees the item they paid for").toBeTruthy();
  expect(r.hasR2, "no partial R2 stack survives").toBeFalsy();
  expect(r.broken, "no broken image is left in the DOM").toBe(0);
  const reasons: string[] = [];
  for (const m of raw) { try { reasons.push((await m.args()[1].jsonValue()).reason); } catch { /* ignore */ } }
  expect(reasons, "reported as an asset failure, not as an unsupported item").toContain("required_asset_failed");
  await ctx.close();
});

test("shop stays uniform C2 preview with R2 opt-in (D-077 unaffected)", async ({ browser }) => {
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
