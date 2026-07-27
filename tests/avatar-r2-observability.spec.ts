// Avatar R2 pilot-observability verification (D-076). SELF-SERVED + FIXTURE-INTERCEPTED: a
// local static server serves this branch's code and every *.supabase.co call is answered from
// fixtures with fictitious local values — so the SPEC ITSELF makes no real backend request and no
// shared-student mutation, and uses no real token. NOTE: the repo's DEFAULT playwright.config.ts runs
// tests/global-setup.ts first, which DOES contact Supabase (question-pool health check + idempotent
// test-account provisioning) before any spec — that is repo global setup, not this spec. Run this spec
// via `playwright.observability.config.ts` (no globalSetup, no .env) for a fully backend-free run.
// Verifies the console-only, pilot-gated render signal on avatar / hub / quiz: one event per root per load,
// correct surface/result/reason, c2_fallback on a mandatory-asset failure, silence without opt-in,
// dedup on rerender, and render_failed on an otherwise-unhandled render exception. No goldens.

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

type Ev = { level: string; payload: any };
async function open(browser: any, urlPath: string, opts: { identity?: object; optIn?: boolean; asset404?: string; failAppend?: boolean } = {}) {
  const { identity = idNeutralMedium, optIn = true, asset404, failAppend = false } = opts;
  const ctx = await browser.newContext({ viewport: { width: 900, height: 700 }, reducedMotion: "reduce" });
  await ctx.route("**://*.supabase.co/**", makeRoute(identity));
  if (asset404) await ctx.route(`**${asset404}`, (r: Route) => r.fulfill({ status: 404, body: "" }));
  await ctx.addInitScript(([k, s, opt, fail]: [string, any, boolean, boolean]) => {
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem("avatar_v2", "1");
    if (opt) localStorage.setItem("avatar_r2", "1"); else localStorage.removeItem("avatar_r2");
    if (fail) {
      // Controlled local fixture: force an otherwise-unhandled render exception by making the
      // avatar root reject appends (scoped by id → other DOM is untouched).
      const _oa = Element.prototype.appendChild;
      Element.prototype.appendChild = function (c: any) {
        if (this && (this as HTMLElement).id === "avatar-preview") throw new Error("injected render failure");
        return _oa.call(this, c);
      } as any;
    }
  }, [`sb-${REF}-auth-token`, SESSION, optIn, failAppend]);
  const page = await ctx.newPage();
  const raw: any[] = [];
  page.on("console", (m) => { if (m.text().includes("[avatar-r2-observability]")) raw.push(m); });
  await page.goto(`${baseUrl}${urlPath}`, { waitUntil: "networkidle" });
  const drain = async (): Promise<Ev[]> => {
    const out: Ev[] = [];
    for (const m of raw) { try { out.push({ level: m.type(), payload: await m.args()[1].jsonValue() }); } catch { /* ignore */ } }
    return out;
  };
  return { ctx, page, raw, drain };
}

async function waitRendered(page: any, sel: string) {
  await page.waitForSelector(`${sel}[data-avatar-rendered="1"]`, { timeout: 15000 });
}
function stackProbe(page: any, sel: string) {
  return page.evaluate((s: string) => {
    const root = document.querySelector(s) as HTMLElement | null;
    if (!root) return { present: false };
    const imgs = Array.from(root.querySelectorAll("img")) as HTMLImageElement[];
    return {
      present: true,
      renderPath: root.dataset.avatarRenderPath ?? null,
      c2Svg: imgs.some((i) => (i.getAttribute("src") || "").includes("-c2.svg")),
      broken: imgs.filter((i) => i.complete && i.naturalWidth === 0).length,
    };
  }, sel);
}

// ── R2 success on each surface: exactly one {surface, r2} ─────────────────────
for (const [name, url, sel] of [
  ["avatar", "/avatar.html", "#avatar-preview"],
  ["hub", "/hub.html", "#profileAvatar"],
  ["quiz", "/index.html", "#avatar-display"],
] as const) {
  test(`observability: R2 success on ${name} → one ${name}/r2 event`, async ({ browser }) => {
    const { ctx, page, raw, drain } = await open(browser, url);
    await waitRendered(page, sel);
    await expect.poll(() => raw.length, { timeout: 10000 }).toBeGreaterThan(0);
    await page.waitForTimeout(150);
    const events = await drain();
    expect(events.length, "exactly one event").toBe(1);
    expect(events[0].level).toBe("info");
    expect(events[0].payload).toEqual({ event: "avatar_r2_render", version: 1, surface: name, result: "r2", reason: "unknown" });
    const st = await stackProbe(page, sel);
    expect(st.renderPath, "R2 mounted").toBe("r2");
    expect(st.c2Svg, "no mixed C2 stack").toBeFalsy();
    expect(st.broken, "no broken images").toBe(0);
    await ctx.close();
  });
}

// ── Mandatory R2 asset failure → clean C2 fallback + c2_fallback/required_asset_failed ────
test("observability: mandatory asset failure → c2_fallback / required_asset_failed (not render_failed)", async ({ browser }) => {
  const { ctx, page, raw, drain } = await open(browser, "/avatar.html", { asset404: "/assets/avatar-r2/base/body-neutral-medium-v2.webp" });
  await waitRendered(page, "#avatar-preview");
  await expect.poll(() => raw.length, { timeout: 10000 }).toBeGreaterThan(0);
  await page.waitForTimeout(150);
  const events = await drain();
  expect(events.length).toBe(1);
  expect(events[0].level).toBe("info");
  expect(events[0].payload.result).toBe("c2_fallback");
  expect(events[0].payload.reason).toBe("required_asset_failed");
  expect(events[0].payload.result).not.toBe("render_failed");
  const st = await stackProbe(page, "#avatar-preview");
  expect(st.renderPath, "clean C2 fallback").toBe("c2");
  await ctx.close();
});

// ── No opt-in → completely silent, normal C2 ─────────────────────────────────
test("observability: no opt-in → no events, normal C2 render", async ({ browser }) => {
  const { ctx, page, raw, drain } = await open(browser, "/avatar.html", { optIn: false });
  await waitRendered(page, "#avatar-preview");
  await page.waitForTimeout(400);
  const events = await drain();
  expect(events.length, "silent without opt-in").toBe(0);
  const st = await stackProbe(page, "#avatar-preview");
  expect(st.renderPath, "C2 render unaffected").toBe("c2");
  await ctx.close();
});

// ── Dedup: a legitimate rerender of the same root stays at one event ──────────
test("observability: rerender of the same root does not emit a second event", async ({ browser }) => {
  const { ctx, page, raw, drain } = await open(browser, "/avatar.html");
  await waitRendered(page, "#avatar-preview");
  await expect.poll(() => raw.length, { timeout: 10000 }).toBeGreaterThan(0);
  await page.waitForTimeout(150);
  expect((await drain()).length, "one event after initial render").toBe(1);
  // Trigger a re-render of the SAME #avatar-preview root via an identity control, if present.
  const btn = page.locator("#skinToneButtons .identity-btn").first();
  if (await btn.count()) { await btn.click(); await page.waitForTimeout(500); }
  expect((await drain()).length, "still one event after rerender (WeakSet dedup)").toBe(1);
  await ctx.close();
});

// ── render_failed: an otherwise-unhandled render exception → one render_failed/render_exception ──
test("observability: unhandled render exception → one render_failed / render_exception", async ({ browser }) => {
  const { ctx, page, raw, drain } = await open(browser, "/avatar.html", { failAppend: true });
  await expect.poll(() => raw.length, { timeout: 12000 }).toBeGreaterThan(0);
  await page.waitForTimeout(150);
  const events = await drain();
  const rf = events.filter((e) => e.payload.result === "render_failed");
  expect(rf.length, "exactly one render_failed").toBe(1);
  expect(rf[0].level, "render_failed uses console.warn").toBe("warning");
  expect(rf[0].payload).toEqual({ event: "avatar_r2_render", version: 1, surface: "avatar", result: "render_failed", reason: "render_exception" });
  await ctx.close();
});
