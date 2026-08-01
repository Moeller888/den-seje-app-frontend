// D-090 owner review export — NOT a gate, NOT a golden. Renders the real runtime on the real
// surfaces and writes PNGs to _avatar-artefakter\D090-runtime-review\ for the owner's visual review.
//
// Deliberately NOT a screenshot ASSERTION: D-090 ships as OWNER_VISUAL_REVIEW_REQUIRED, and baking a
// baseline before the owner has looked would make the automated suite bless an appearance nobody
// approved — the exact inversion this project has rejected twice (D-085, D-087).
//
// Lives OUTSIDE tests/ on purpose: the default playwright.config.ts matches tests/**/*.spec.ts, and\n// this spec writes files and asserts nothing, so it must never join the CI suite.\n//\n// Run: npx playwright test --config=playwright.torso-review.config.ts
import { test, Route } from "@playwright/test";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..", "..");
// Portable: the owner''s artefact folder sits beside the repo. Overridable, and NOT machine-specific
// — an absolute Windows path here would have made this spec unrunnable anywhere else.
const OUT = process.env.D090_REVIEW_OUT || path.resolve(ROOT, "..", "_avatar-artefakter", "D090-runtime-review");
const REF = "tjzbehwfagiwpwodsgwg";
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".svg": "image/svg+xml", ".css": "text/css", ".webp": "image/webp", ".png": "image/png", ".json": "application/json" };

let server: http.Server; let baseUrl: string;
test.beforeAll(async () => {
  fs.mkdirSync(OUT, { recursive: true });
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

const ARMOR = "armor-knight";
const HAT = "hat-blue";
const GLASSES = "glasses-round";
const ARMOR_R2 = "/assets/avatar-r2/torso/armor-knight-r2-v1.webp";
const UID = "00000000-0000-4000-8000-000000000001";
const idNM = { v: 1, body_type: "neutral", skin_tone: "medium", hairstyle: "tousled", hair_color: "brown", chosen_at: "2026-06-01T00:00:00Z" };
const USER = { id: UID, aud: "authenticated", role: "authenticated", email: "r@e.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
function jwt() { const b = (o: any) => Buffer.from(JSON.stringify(o)).toString("base64url"); return b({ alg: "HS256", typ: "JWT" }) + "." + b({ sub: UID, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 2592000 }) + ".s"; }
const SESSION = { access_token: jwt(), token_type: "bearer", expires_in: 2592000, expires_at: Math.floor(Date.now() / 1000) + 2592000, refresh_token: "f", user: USER };
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS" };
const today = new Date().toISOString().slice(0, 10);
const ITEMS = [
  { id: ARMOR, name: "Ridderdragt", price: 300, rarity: "rare", type: "avatar", image_url: `/assets/avatar/shirt/${ARMOR}.svg`, slot_type: "torso", layer_order: 2 },
  { id: HAT, name: HAT, price: 10, rarity: "common", type: "avatar", image_url: `/assets/avatar/hat/${HAT}.svg`, slot_type: "headwear", layer_order: 5 },
  { id: GLASSES, name: "Runde Briller", price: 50, rarity: "common", type: "avatar", image_url: "/assets/avatar/glasses/glasses-round-basic-v1.svg", slot_type: "eyes", layer_order: 7 },
];
function makeRoute(equipped: Record<string, string>) {
  return async (route: Route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const p = new URL(req.url()).pathname;
    const wo = ((req.headers()["accept"]) || "").includes("vnd.pgrst.object");
    const one = (o: any) => (wo ? o : [o]);
    const j = (b: any) => route.fulfill({ status: 200, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify(b) });
    const profile = { id: UID, role: "student", name: "R", email: "r@e.com", equipped_slots: equipped, active_title: null, active_theme: "default", avatar_gender: "neutral", avatar_identity: idNM, grade: 5, selected_grade: 5, placement_band: 2, current_band: 2, xp: 420, coins: 500 };
    if (p.startsWith("/auth/v1/user")) return j(USER);
    if (p.startsWith("/auth/v1/token")) return j(SESSION);
    if (p.startsWith("/auth/v1/logout")) return route.fulfill({ status: 204, headers: CORS });
    if (p.startsWith("/functions/v1/")) return j({});
    if (p.startsWith("/rest/v1/rpc/")) return j(null);
    if (p.startsWith("/rest/v1/profiles")) return j(one(profile));
    if (p.startsWith("/rest/v1/student_progress")) return j([{ student_id: UID, xp: 420, coins: 500 }]);
    if (p.startsWith("/rest/v1/user_items")) return j(Object.values(equipped).map((item_id) => ({ item_id })));
    if (p.startsWith("/rest/v1/shop_items")) return j(ITEMS);
    if (p.startsWith("/rest/v1/daily_login_rewards")) return j(one({ student_id: UID, last_claimed_date: today }));
    return j([]);
  };
}

async function shot(browser: any, file: string, url: string, sel: string, equipped: Record<string, string>, opts: { breakAsset?: boolean; size?: [number, number] } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 900 }, reducedMotion: "reduce" });
  await ctx.route("**://*.supabase.co/**", makeRoute(equipped));
  if (opts.breakAsset) await ctx.route(`**${ARMOR_R2}`, (r: Route) => r.fulfill({ status: 404, body: "gone" }));
  await ctx.addInitScript(([k, s]: [string, any]) => {
    (window as any).__AVATAR_TEST__ = true;
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem("avatar_v2", "1");
    localStorage.setItem("avatar_r2", "1");
  }, [`sb-${REF}-auth-token`, SESSION]);
  const page = await ctx.newPage();
  await page.goto(`${baseUrl}${url}`, { waitUntil: "networkidle" });
  await page.waitForSelector(`${sel}[data-avatar-rendered="1"]`, { timeout: 20000 });
  if (opts.size) {
    await page.evaluate(([s, w, h]: [string, number, number]) => {
      const el = document.querySelector(s) as HTMLElement;
      el.style.width = w + "px"; el.style.height = h + "px";
    }, [sel, opts.size[0], opts.size[1]]);
    await page.waitForTimeout(120);
  }
  const path0 = path.join(OUT, file);
  await page.locator(sel).screenshot({ path: path0, animations: "disabled" });
  const rp = await page.evaluate((s: string) => (document.querySelector(s) as HTMLElement)?.dataset.avatarRenderPath, sel);
  await ctx.close();
  return rp;
}

test("export the D-090 review set", async ({ browser }) => {
  test.setTimeout(300000);
  const notes: string[] = [];
  const rec = (f: string, rp: any, what: string) => notes.push(`${f.padEnd(44)} renderPath=${String(rp).padEnd(3)}  ${what}`);

  rec("01-avatar-r2-no-armour.png", await shot(browser, "01-avatar-r2-no-armour.png", "/avatar.html", "#avatar-preview", {}), "R2 baseline, nothing equipped");
  rec("02-avatar-r2-with-armour.png", await shot(browser, "02-avatar-r2-with-armour.png", "/avatar.html", "#avatar-preview", { torso: ARMOR }), "R2 + Ridderdragt");
  rec("03-hub-r2-with-armour.png", await shot(browser, "03-hub-r2-with-armour.png", "/hub.html", "#profileAvatar", { torso: ARMOR }), "hub surface");
  rec("04-quiz-r2-with-armour.png", await shot(browser, "04-quiz-r2-with-armour.png", "/index.html", "#avatar-display", { torso: ARMOR }), "quiz surface");
  rec("05-avatar-r2-armour-hat-glasses.png", await shot(browser, "05-avatar-r2-armour-hat-glasses.png", "/avatar.html", "#avatar-preview", { torso: ARMOR, headwear: HAT, eyes: GLASSES }), "armour + headwear + eyes");

  const sizes: Array<[number, number]> = [[180, 270], [112, 168], [72, 108], [52, 78]];
  for (const [w, h] of sizes) {
    rec(`06-size-${w}x${h}.png`, await shot(browser, `06-size-${w}x${h}.png`, "/avatar.html", "#avatar-preview", { torso: ARMOR }, { size: [w, h] }), `D-071 render size ${w}x${h}`);
  }

  rec("07-fallback-missing-r2-asset.png", await shot(browser, "07-fallback-missing-r2-asset.png", "/avatar.html", "#avatar-preview", { torso: ARMOR }, { breakAsset: true }), "R2 garment 404 → whole avatar C2");

  fs.writeFileSync(path.join(OUT, "README.txt"),
    "D-090 (A3.2) — runtime wiring review set\n" +
    "Generated by tests/avatar-r2-torso-review-export.spec.ts. Not a golden, not a gate.\n\n" +
    "STATUS: A3.2_RUNTIME_WIRED — OWNER_VISUAL_REVIEW_REQUIRED\n" +
    "The automated gates pass. That is a precondition, not an approval.\n\n" +
    "WHAT TO LOOK FOR (the failure modes this artwork has actually had):\n" +
    "  - the collar covers the old base-tee ring; no grey neckline showing through\n" +
    "  - no skin or collarbone painted over\n" +
    "  - the arms stay bare and natural; the garment does not creep onto the forearms\n" +
    "  - no dark wedges in the shoulder corners (the backfill failure mode of D-087)\n" +
    "  - the breastplate is not cropped; the belt sits at the waist\n" +
    "  - the skirt stops above the legs\n" +
    "  - the garment tracks the body at all four D-071 sizes\n" +
    "  - 07: the WHOLE avatar is C2 with the armour visible — never an R2 figure without it\n\n" +
    notes.join("\n") + "\n",
    "utf8");
  // eslint-disable-next-line no-console
  console.log("\n" + notes.join("\n") + "\n→ " + OUT);
});
