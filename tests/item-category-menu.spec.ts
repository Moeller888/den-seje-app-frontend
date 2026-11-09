// D-363 — the shared category menu over the item cards on Avatar and in Butik.
// SELF-SERVED + FIXTURE-INTERCEPTED: a local static server serves this branch's code; every *.supabase.co call is answered from
// fictitious local fixtures (a stateful pupil: what is owned, worn and chosen changes as the page asks). No real backend call, no
// shared-student mutation, no real token. At 1100 and 390 px it proves:
//   - both pages show the same 7 categories in the same order, Overdele chosen first, the menu directly over the cards, no
//     horizontal scrolling, the chosen tab marked (aria-selected) and reachable with the arrow keys, Home and End;
//   - only the chosen category's cards are shown: on Avatar the 63 wardrobe tops (tees, sweaters and tank tops) and the pupil's
//     Ridderdragt under Overdele, 6 bottoms, 10 shoes, the hat under Hoved; in Butik Ridderdragt under Overdele, the hats under Hoved;
//   - an empty category says so (Avatar: Ryg; Butik: Underdele);
//   - switching category changes nothing the pupil wears and saves nothing;
//   - a wardrobe choice and an equip keep the pupil in the category (in place since D-366); the outfit stays approved;
//   - Butik's purchase flow is unchanged (price, Køb, "Købt!", Senere, Ejet, Udstyr nu) and keeps the category; "Udstyr nu" opens
//     Avatar in the same category.
// Screenshots of each state are attached to the test (test-results), for the review.

import { test, expect, Route, Page } from "@playwright/test";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

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

const UID = "00000000-0000-4000-8000-000000000363";
const USER = { id: UID, aud: "authenticated", role: "authenticated", email: "d363@e.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
// LOCAL FICTITIOUS fixture token — not a real JWT, not from .env, not a production/account token.
function jwt() { const b = (o: any) => Buffer.from(JSON.stringify(o)).toString("base64url"); return b({ alg: "HS256", typ: "JWT" }) + "." + b({ sub: UID, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 2592000 }) + ".s"; }
const SESSION = { access_token: jwt(), token_type: "bearer", expires_in: 2592000, expires_at: Math.floor(Date.now() / 1000) + 2592000, refresh_token: "f", user: USER };
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS" };

// The live catalogue's kinds of items (one torso suit, hats, a mask, a cape, an aura), with fictitious ids.
const ITEM_IMG = "/assets/avatar/expressions/expr-neutral.svg";
const SHOP_ITEMS = [
  { id: "it-suit",  name: "Ridderdragt",  price: 300, rarity: "rare",      type: "avatar", image_url: ITEM_IMG, slot_type: "torso",    layer_order: 1 },
  { id: "it-hat",   name: "Pirathat",     price: 120, rarity: "uncommon",  type: "avatar", image_url: ITEM_IMG, slot_type: "headwear", layer_order: 1 },
  { id: "it-crown", name: "Guldkrone",    price: 900, rarity: "legendary", type: "avatar", image_url: ITEM_IMG, slot_type: "headwear", layer_order: 1 },
  { id: "it-mask",  name: "Ninja-maske",  price: 80,  rarity: "common",    type: "avatar", image_url: ITEM_IMG, slot_type: "face",     layer_order: 1 },
  { id: "it-cape",  name: "Rød Kappe",    price: 150, rarity: "uncommon",  type: "avatar", image_url: ITEM_IMG, slot_type: "back",     layer_order: 1 },
  { id: "it-aura",  name: "Guld-aura",    price: 500, rarity: "rare",      type: "avatar", image_url: ITEM_IMG, slot_type: "aura",     layer_order: 1 },
];
const ORDER = ["Overdele", "Underdele", "Sko", "Hoved", "Ansigt", "Ryg", "Effekter"];

type Pupil = { owned: Set<string>; equipped: Record<string, string>; northstar: Record<string, string> | null; coins: number; calls: string[] };
const newPupil = (owned: string[]): Pupil => ({ owned: new Set(owned), equipped: {}, northstar: null, coins: 2000, calls: [] });

function routeFor(pupil: Pupil) {
  return async (r: Route) => {
    const req = r.request();
    if (req.method() === "OPTIONS") return r.fulfill({ status: 204, headers: CORS });
    const p = new URL(req.url()).pathname;
    const wo = ((req.headers()["accept"]) || "").includes("vnd.pgrst.object");
    const j = (b: any) => r.fulfill({ status: 200, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify(b) });
    const body = () => { try { return JSON.parse(req.postData() || "{}"); } catch { return {}; } };
    const identity = () => ({ v: 1, body_type: "neutral", skin_tone: "medium", hairstyle: "tousled", hair_color: "brown", chosen_at: "2026-06-01T00:00:00Z", ...(pupil.northstar ? { northstar: pupil.northstar } : {}) });
    if (p.startsWith("/auth/v1/user")) return j(USER);
    if (p.startsWith("/auth/v1/token")) return j(SESSION);
    if (p.startsWith("/auth/v1/logout")) return r.fulfill({ status: 204, headers: CORS });
    // the shop's only Edge Function call is the purchase: a POST carrying item_id (answered here, never sent anywhere)
    if (p.startsWith("/functions/v1/") && req.method() === "POST" && body().item_id) {
      const id = body().item_id; pupil.calls.push("buy:" + id);
      const it = SHOP_ITEMS.find((x) => x.id === id);
      if (!it || pupil.owned.has(id) || pupil.coins < it.price) return r.fulfill({ status: 400, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify({ error: "refused" }) });
      pupil.owned.add(id); pupil.coins -= it.price; return j({ success: true });
    }
    if (p.startsWith("/functions/v1/")) return j({});
    if (p === "/rest/v1/rpc/equip_item") {
      const id = body().p_item_id, it = SHOP_ITEMS.find((x) => x.id === id); pupil.calls.push("equip:" + id);
      if (!it || !pupil.owned.has(id)) return j(null);
      pupil.equipped[it.slot_type] = id; return j({ slot: it.slot_type });
    }
    if (p === "/rest/v1/rpc/unequip_item") { const s = body().p_slot_type; pupil.calls.push("unequip:" + s); delete pupil.equipped[s]; return j(null); }
    if (p === "/rest/v1/rpc/set_avatar_northstar") {
      const c = body().p_choice || {}; pupil.calls.push("northstar:" + JSON.stringify(c));
      pupil.northstar = Object.keys(c).length ? c : null; return j(identity());
    }
    if (p.startsWith("/rest/v1/rpc/")) return j(null);
    if (p.startsWith("/rest/v1/profiles")) {
      const row = { id: UID, role: "student", name: "D", email: "d363@e.com", equipped_slots: { ...pupil.equipped }, active_title: null, active_theme: "default", avatar_gender: "neutral", avatar_identity: identity(), grade: 5, selected_grade: 5, placement_band: 2, current_band: 2, xp: 420, coins: pupil.coins };
      return j(wo ? row : [row]);
    }
    if (p.startsWith("/rest/v1/student_progress")) return j([{ student_id: UID, xp: 420, coins: pupil.coins }]);
    if (p.startsWith("/rest/v1/user_items")) return j([...pupil.owned].map((item_id) => ({ item_id, user_id: UID })));
    if (p.startsWith("/rest/v1/shop_items")) {
      const ids = /id=in\.\(([^)]*)\)/.exec(decodeURIComponent(new URL(req.url()).search));
      const want = ids ? ids[1].split(",").map((s) => s.replace(/"/g, "")) : null;
      return j(want ? SHOP_ITEMS.filter((x) => want.includes(x.id)) : SHOP_ITEMS);
    }
    return j([]);
  };
}

async function openPage(browser: any, pupil: Pupil, file: string, width: number) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
  await ctx.route("**://*.supabase.co/**", routeFor(pupil));
  await ctx.addInitScript(([k, s]: [string, any]) => { localStorage.setItem(k, JSON.stringify(s)); }, [`sb-${REF}-auth-token`, SESSION]);
  const page: Page = await ctx.newPage();
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(`${baseUrl}/${file}`, { waitUntil: "domcontentloaded" });
  return { ctx, page, errs };
}

const tabs = (page: Page) => page.locator("#categoryTabs [role=tab]");
const selected = (page: Page) => page.locator("#categoryTabs [role=tab][aria-selected=true]");
const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const shot = async (page: Page, name: string) => {
  const file = test.info().outputPath(name + ".png");
  // the card thumbnails load lazily: wait (briefly) until the visible ones have loaded, so the screenshot shows them
  await page.waitForFunction(() => Array.from(document.images).filter((i) => i.offsetParent !== null && i.getBoundingClientRect().top < window.innerHeight).every((i) => i.complete), null, { timeout: 10000 }).catch(() => {});
  await page.screenshot({ path: file, fullPage: true });
  await test.info().attach(name, { path: file, contentType: "image/png" });
};

/** The menu sits directly over the cards: nothing visible between its bottom edge and the first visible card. */
async function menuDirectlyOverCards(page: Page, cardSel: string) {
  return page.evaluate((sel) => {
    const menu = document.getElementById("categoryTabs")!.getBoundingClientRect();
    const card = Array.from(document.querySelectorAll(sel)).find((c) => (c as HTMLElement).offsetParent !== null);
    if (!card) return true;
    const gap = card.getBoundingClientRect().top - menu.bottom;
    return gap >= 0 && gap < 40;
  }, cardSel);
}

/** The keyboard: arrows move and choose, Home and End jump, focus follows the chosen tab. */
async function keyboard(page: Page) {
  await selected(page).focus();
  await page.keyboard.press("ArrowRight");
  const a = await selected(page).textContent();
  const af = await page.evaluate(() => document.activeElement && document.activeElement.textContent);
  await page.keyboard.press("End");
  const b = await selected(page).textContent();
  await page.keyboard.press("Home");
  const c = await selected(page).textContent();
  await page.keyboard.press("ArrowLeft");
  const d = await selected(page).textContent();
  await page.keyboard.press("Home");
  return { a, af, b, c, d };
}

for (const width of [1100, 390]) {
  test(`Butik: the shared menu at ${width} px — categories, empty category, keyboard, purchase keeps the category`, async ({ browser, browserName }) => {
    test.skip(browserName !== "chromium", "UI dedup");
    const pupil = newPupil(["it-mask"]);
    const { ctx, page, errs } = await openPage(browser, pupil, "shop.html", width);
    const visible = () => page.locator(".shop-card:visible .item-name").allTextContents();
    await expect(page.locator(".shop-card")).toHaveCount(SHOP_ITEMS.length, { timeout: 20000 });

    await expect(tabs(page)).toHaveText(ORDER);
    await expect(selected(page)).toHaveText("Overdele");
    expect(await visible()).toEqual(["Ridderdragt"]);
    expect(await menuDirectlyOverCards(page, ".shop-card")).toBe(true);
    expect(await noSideScroll(page), "no horizontal scrolling").toBe(true);
    await shot(page, `butik-${width}-overdele`);

    await page.getByRole("tab", { name: "Hoved", exact: true }).click();
    await expect(selected(page)).toHaveText("Hoved");
    expect((await visible()).sort()).toEqual(["Guldkrone", "Pirathat"]);
    expect(new URL(page.url()).hash).toBe("#kategori=hoved");

    await page.getByRole("tab", { name: "Ansigt", exact: true }).click();
    expect(await visible()).toEqual(["Ninja-maske"]);
    await expect(page.locator(".shop-card:visible .owned-indicator")).toHaveText(/Ejet/);   // ownership unchanged

    await page.getByRole("tab", { name: "Underdele", exact: true }).click();
    expect(await visible()).toEqual([]);
    await expect(page.locator("#categoryEmpty")).toBeVisible();
    await expect(page.locator("#categoryEmpty")).toHaveText("Butikken har ingen ting under Underdele. Tøj vælger du gratis på din avatar.");
    await shot(page, `butik-${width}-tom-kategori`);

    const k = await keyboard(page);
    expect(k).toEqual({ a: "Sko", af: "Sko", b: "Effekter", c: "Overdele", d: "Effekter" });
    await expect(selected(page)).toHaveText("Overdele");

    // the purchase flow, in Hoved
    await page.getByRole("tab", { name: "Hoved", exact: true }).click();
    const hat = page.locator(".shop-card[data-item-id='it-hat']");
    await expect(hat.locator(".price-tag")).toHaveText(/120/);
    await hat.locator(".buy-btn").click();
    await expect(hat.locator(".bought-success")).toBeVisible();
    await expect(selected(page)).toHaveText("Hoved");
    expect((await visible()).sort()).toEqual(["Guldkrone", "Pirathat"]);
    await shot(page, `butik-${width}-koebt`);
    await hat.locator("[data-action='buy-later']").click();
    await expect(page.locator(".shop-card[data-item-id='it-hat'] .owned-indicator")).toBeVisible();
    await expect(selected(page)).toHaveText("Hoved");
    expect((await visible()).sort()).toEqual(["Guldkrone", "Pirathat"]);
    await expect(page.locator(".shop-card[data-item-id='it-crown'] .price-tag")).toHaveText(/900/);   // prices unchanged
    expect(pupil.calls).toEqual(["buy:it-hat"]);

    // "Udstyr nu" opens Avatar in the same category
    await page.locator(".shop-card[data-item-id='it-crown'] .buy-btn").click();
    await Promise.all([page.waitForURL(/avatar\.html#kategori=hoved$/), page.locator(".shop-card[data-item-id='it-crown'] [data-action='equip-now']").click()]);
    await expect(selected(page)).toHaveText("Hoved");
    expect(pupil.calls).toEqual(["buy:it-hat", "buy:it-crown", "equip:it-crown"]);
    expect(errs.filter((e) => !/favicon/i.test(e)), "no page errors").toEqual([]);
    await ctx.close();
  });

  test(`Avatar: the shared menu at ${width} px — wardrobe and items by category, choices keep the category`, async ({ browser, browserName }) => {
    test.skip(browserName !== "chromium", "UI dedup");
    const pupil = newPupil(["it-suit", "it-hat", "it-mask"]);
    const { ctx, page, errs } = await openPage(browser, pupil, "avatar.html", width);
    const wardrobe = () => page.locator("#northstarWardrobeCards .item-card:visible").evaluateAll((cs) => cs.map((c) => (c as HTMLElement).dataset.piece || ""));
    const items = () => page.locator("#inventoryGrid .item-card:visible .item-name").allTextContents();
    const now = () => page.evaluate(async () => { const L: any = await import("/js/avatar-layers.js"); const o = L.northstarOutfitNow(); return o ? { id: o.top + "+" + o.bottom + "+" + o.shoes, approved: L.northstarApprovedOutfits().has(o.top + "+" + o.bottom + "+" + o.shoes) } : null; });
    await expect(page.locator("#northstarWardrobeCards .item-card")).toHaveCount(79, { timeout: 30000 });
    await expect(page.locator("#inventoryGrid .item-card")).toHaveCount(3);

    // Overdele: the 63 wardrobe tops — tees, sweaters and tank tops — and the pupil's Ridderdragt
    await expect(tabs(page)).toHaveText(ORDER);
    await expect(selected(page)).toHaveText("Overdele");
    const tops = await wardrobe();
    expect(tops.length).toBe(63);
    expect(tops.every((p) => p.startsWith("top-"))).toBe(true);
    for (const kind of ["top-tee-", "top-sweater-", "top-tank-"]) expect(tops.some((p) => p.startsWith(kind)), kind).toBe(true);
    expect(await items()).toEqual(["Ridderdragt"]);
    expect(await menuDirectlyOverCards(page, "#northstarWardrobeCards .item-card, #inventoryGrid .item-card")).toBe(true);
    expect(await noSideScroll(page), "no horizontal scrolling").toBe(true);
    await shot(page, `avatar-${width}-overdele`);

    await page.getByRole("tab", { name: "Underdele", exact: true }).click();
    const bottoms = await wardrobe();
    expect(bottoms.length === 6 && bottoms.every((p) => p.startsWith("bottom-"))).toBe(true);
    expect(await items()).toEqual([]);
    await page.getByRole("tab", { name: "Sko", exact: true }).click();
    const shoes = await wardrobe();
    expect(shoes.length === 10 && shoes.every((p) => p.startsWith("shoes-"))).toBe(true);
    await page.getByRole("tab", { name: "Hoved", exact: true }).click();
    expect(await wardrobe()).toEqual([]);
    expect(await items()).toEqual(["Pirathat"]);
    await page.getByRole("tab", { name: "Ansigt", exact: true }).click();
    expect(await items()).toEqual(["Ninja-maske"]);

    // an empty category
    await page.getByRole("tab", { name: "Ryg", exact: true }).click();
    expect(await wardrobe()).toEqual([]);
    expect(await items()).toEqual([]);
    await expect(page.locator("#categoryEmpty")).toBeVisible();
    await expect(page.locator("#categoryEmpty")).toHaveText("Du har ingen ting under Ryg endnu.Gå i butikken for at finde noget!");
    await expect(page.locator("#categoryEmpty a")).toHaveAttribute("href", "shop.html#kategori=ryg");
    await shot(page, `avatar-${width}-tom-kategori`);

    const k = await keyboard(page);
    expect(k).toEqual({ a: "Effekter", af: "Effekter", b: "Effekter", c: "Overdele", d: "Effekter" });
    expect(pupil.calls, "switching category saves nothing").toEqual([]);

    // a wardrobe choice in Underdele keeps Underdele (in place since D-366), the outfit is approved and worn
    await page.getByRole("tab", { name: "Underdele", exact: true }).click();
    await page.locator("#northstarWardrobeCards .item-card[data-piece='bottom-shorts-navy'] .equip-btn").click();
    await expect.poll(() => pupil.calls.length).toBe(1);
    await expect(selected(page)).toHaveText("Underdele");
    await expect(page.locator("#northstarWardrobeCards .item-card[data-piece='bottom-shorts-navy']")).toHaveClass(/equipped/);
    const worn = await now();
    expect(worn && worn.approved && worn.id.includes("bottom-shorts-navy")).toBe(true);
    await shot(page, `avatar-${width}-underdel-valgt`);

    // switching category keeps what the pupil wears
    await page.getByRole("tab", { name: "Overdele", exact: true }).click();
    await page.getByRole("tab", { name: "Sko", exact: true }).click();
    expect(await now()).toEqual(worn);
    expect(pupil.calls.length).toBe(1);

    // a top that does not fit the shorts is refused (D-367): nothing changes, nothing is saved, the category stays Overdele;
    // a top that fits goes on with exactly the same bottom and shoes
    await page.getByRole("tab", { name: "Overdele", exact: true }).click();
    await page.locator("#northstarWardrobeCards .item-card[data-piece='top-sweater-ls2-green-check'] .equip-btn").click();
    await expect(page.locator("#northstarWardrobe .northstar-status")).toContainText("Den overdel passer ikke til dit nuværende outfit.");
    await expect(selected(page)).toHaveText("Overdele");
    expect(await now()).toEqual(worn);
    expect(pupil.calls.length).toBe(1);
    await page.locator("#northstarWardrobeCards .item-card[data-piece='top-tee-hip-blue'] .equip-btn").click();
    await expect.poll(() => pupil.calls.length).toBe(2);
    await expect(selected(page)).toHaveText("Overdele");
    const changedTop = await now();
    expect(changedTop && changedTop.approved && changedTop.id === "top-tee-hip-blue+" + worn!.id.split("+").slice(1).join("+")).toBe(true);

    // equipping an item in Hoved keeps Hoved
    await page.getByRole("tab", { name: "Hoved", exact: true }).click();
    await page.locator("#inventoryGrid .item-card .equip-btn[data-item-id='it-hat']").click();
    await expect(page.locator("#inventoryGrid .item-card.equipped .item-name")).toHaveText("Pirathat");
    await expect(selected(page)).toHaveText("Hoved");
    expect(await items()).toEqual(["Pirathat"]);
    expect(pupil.calls.at(-1)).toBe("equip:it-hat");
    expect(errs.filter((e) => !/favicon/i.test(e)), "no page errors").toEqual([]);
    await ctx.close();
  });
}
