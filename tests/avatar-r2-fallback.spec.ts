// Activation-audit F1 — atomic R2 asset-load fallback (Playwright, surface-level).
// FULLY FIXTURE-INTERCEPTED: a local static server serves the repo, every
// *.supabase.co call is fulfilled from fixtures, and no request reaches the real
// backend. Verifies that a failed mandatory R2 layer (404) makes the WHOLE avatar
// fall back to a complete C2 render — no partial R2 stack, no broken images — on
// avatar.html, hub.html and index.html, while a clean load still renders R2.

import { test, expect, Route } from "@playwright/test";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REF = "tjzbehwfagiwpwodsgwg";
const R2_BASE_URLPATH = "/assets/avatar-r2/base/body-neutral-medium-v2.webp";
const R2_FACE_URLPATH = "/assets/avatar-r2/face/face-neutral-v1.webp";

const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".svg": "image/svg+xml", ".css": "text/css", ".webp": "image/webp",
  ".png": "image/png", ".json": "application/json",
};

let server: http.Server;
let baseUrl: string;
let blocked = new Set<string>(); // URL paths to answer with 404 (simulated asset failure)

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    try {
      const p = decodeURIComponent((req.url || "/").split("?")[0]);
      if (blocked.has(p)) { res.writeHead(404); res.end("blocked"); return; }
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
test.beforeEach(() => { blocked = new Set(); });

const UID = "00000000-0000-4000-8000-000000000001";
const IDENTITY = { v: 1, body_type: "neutral", skin_tone: "medium", hairstyle: "tousled", hair_color: "brown", chosen_at: "2026-06-01T00:00:00Z" };
const USER = { id: UID, aud: "authenticated", role: "authenticated", email: "r@e.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
function jwt() { const b = (o: any) => Buffer.from(JSON.stringify(o)).toString("base64url"); return b({ alg: "HS256", typ: "JWT" }) + "." + b({ sub: UID, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 2592000 }) + ".s"; }
const SESSION = { access_token: jwt(), token_type: "bearer", expires_in: 2592000, expires_at: Math.floor(Date.now() / 1000) + 2592000, refresh_token: "f", user: USER };
const PROFILE = { id: UID, role: "student", name: "R", email: "r@e.com", equipped_slots: {}, active_title: null, active_theme: null, avatar_gender: "neutral", avatar_identity: IDENTITY, grade: 5, selected_grade: 5, placement_band: 2, current_band: 2, xp: 420, coins: 120 };
const PROGRESS = { student_id: UID, xp: 420, coins: 120, current_streak: 3, longest_streak: 7, correct_answers: 42 };
const QUESTION = { step: "question", question_instance_id: "q1", answer_format: "mc", subject: "Historie", content: { question: "Hvornår sluttede 2. verdenskrig i Europa?", options: ["1943", "1944", "1945", "1946"] } };
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS" };
const today = new Date().toISOString().slice(0, 10);

async function fixtureRoute(route: Route) {
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
  if (p.startsWith("/rest/v1/profiles")) return j(one(PROFILE));
  if (p.startsWith("/rest/v1/student_progress")) return j([PROGRESS]);
  if (p.startsWith("/rest/v1/daily_login_rewards")) return j(one({ student_id: UID, last_claimed_date: today }));
  if (p.startsWith("/rest/v1/shop_items")) return j([]);
  return j([]);
}

type Probe = { renderer: string; broken: string[]; r2Markers: string[]; hasC2Base: boolean };

async function mountAndProbe(browser: any, urlPath: string, sel: string): Promise<{ probe: Probe; pageErrors: string[]; reachedBackend: string[] }> {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 700 } });
  const pageErrors: string[] = [];
  const reachedBackend: string[] = [];
  await ctx.route("**://*.supabase.co/**", fixtureRoute);
  await ctx.addInitScript(([k, s]: [string, any]) => {
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem("avatar_r2", "1"); // per-browser R2 opt-in
  }, [`sb-${REF}-auth-token`, SESSION]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") pageErrors.push("[console] " + m.text()); });
  page.on("request", (r) => { if (r.url().includes("supabase.co") && !r.url().startsWith("data:")) { /* intercepted below */ } });
  page.on("requestfinished", async (r) => { /* no-op */ });
  await page.goto(`${baseUrl}${urlPath}`, { waitUntil: "networkidle" });
  await page.waitForSelector(sel, { timeout: 15000 }).catch(() => pageErrors.push("selector not found: " + sel));
  await page.waitForTimeout(700);

  const probe: Probe = await page.evaluate((sel) => {
    const root = document.querySelector(sel) as HTMLElement | null;
    if (!root) return { renderer: "no-root", broken: [], r2Markers: [], hasC2Base: false };
    const imgs = Array.from(root.querySelectorAll("img"));
    const srcs = imgs.map((i) => i.getAttribute("src") || "");
    const broken = imgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.getAttribute("src") || "");
    const markerNodes = Array.from(root.querySelectorAll("[data-c2-layer]"));
    const markers = markerNodes.map((n) => n.getAttribute("data-c2-layer") || "");
    const r2Markers = markers.filter((m) => ["blush", "face", "iris", "eyes", "hair-r2"].includes(m));
    const hasR2Base = srcs.some((s) => s.includes("avatar-r2/base/"));
    const hasC2Base = srcs.some((s) => s.includes("-c2.svg"));
    const renderer = hasR2Base && r2Markers.length >= 4 ? "R2" : (hasC2Base ? "C2" : (hasR2Base ? "R2-partial" : "unknown"));
    return { renderer, broken, r2Markers, hasC2Base };
  }, sel);

  await ctx.close();
  return { probe, pageErrors, reachedBackend };
}

const SURFACES: Array<{ name: string; url: string; sel: string }> = [
  { name: "avatar.html", url: "/avatar.html", sel: "#avatar-preview" },
  { name: "hub.html", url: "/hub.html", sel: "#profileAvatar" },
  { name: "index.html", url: "/index.html", sel: "#avatar-display" },
];

test("clean load → complete R2 (avatar.html)", async ({ browser }) => {
  const { probe, pageErrors } = await mountAndProbe(browser, "/avatar.html", "#avatar-preview");
  expect(probe.renderer).toBe("R2");
  expect(probe.broken).toEqual([]);
  expect(pageErrors).toEqual([]);
});

for (const s of SURFACES) {
  test(`base 404 → complete C2, no partial R2, no broken images (${s.name})`, async ({ browser }) => {
    blocked = new Set([R2_BASE_URLPATH]);
    const { probe, pageErrors } = await mountAndProbe(browser, s.url, s.sel);
    expect(probe.renderer, "must fall back to a complete C2 render").toBe("C2");
    expect(probe.r2Markers, "no R2 stack layers may remain after fallback").toEqual([]);
    expect(probe.broken, "no broken images in the fallback").toEqual([]);
    // The only tolerated console noise is the controlled 404 for the blocked asset.
    const unexpected = pageErrors.filter((e) => !/404|Failed to load resource|avatar-r2: mandatory/i.test(e));
    expect(unexpected, "no unexpected page/console errors").toEqual([]);
  });
}

test("face 404 → complete C2 (avatar.html)", async ({ browser }) => {
  blocked = new Set([R2_FACE_URLPATH]);
  const { probe } = await mountAndProbe(browser, "/avatar.html", "#avatar-preview");
  expect(probe.renderer).toBe("C2");
  expect(probe.r2Markers).toEqual([]);
  expect(probe.broken).toEqual([]);
});
