// Avatar R2 expression-frame verification (D-069 follow-up). Deterministic visual + DOM
// protection for the R2 expression FACE-LAYER SWAP: the five owner-approved expressions
// (neutral / curious / focused / determined / proud) rendered as a z3 face-layer src swap on
// exact R2 neutral-medium. Until now the wiring was only unit-tested; nothing compared or
// golden-protected the rendered expressions.
//
// SELF-SERVED + FIXTURE-INTERCEPTED: a local static server serves this branch's code (which
// carries the ExpressionEngine R2 mode + the gated forceExpression seam that production does
// not yet have), and every *.supabase.co call is answered from fixtures — no external API call,
// no shared-student mutation, no backend flake. Reproducible in the manual Linux golden-regen job.
//
// Determinism: reduced motion freezes breathing and suppresses auto-blink (eyes stay open), and
// forceExpression() pins a static face frame (instant swap, transition:none) — the engine's REAL
// R2 face layer, not a replica. Golden captures are chromium-only; the DOM/bbox invariants run on
// every browser. R2 opt-in is per-browser (localStorage); global AVATAR_R2 stays false.

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

// expected tracked WebP per expression (accepted versions: proud/curious v1, focused/determined v2)
const FACE_SRC: Record<string, string> = {
  neutral: "face-neutral-v1.webp",
  curious: "face-curious-v1.webp",
  focused: "face-focused-v2.webp",
  determined: "face-determined-v2.webp",
  proud: "face-proud-v1.webp",
};

async function openSurface(browser: any, urlPath: string, identity: object) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 700 }, reducedMotion: "reduce" });
  const errs: string[] = [];
  await ctx.route("**://*.supabase.co/**", makeRoute(identity));
  await ctx.addInitScript(([k, s]: [string, any]) => {
    (window as any).__AVATAR_TEST__ = true; // gates the forceExpression handle (js/avatar-expression-engine.js)
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem("avatar_v2", "1");
    localStorage.setItem("avatar_r2", "1");
  }, [`sb-${REF}-auth-token`, SESSION]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errs.push("[console] " + m.text()); });
  await page.goto(`${baseUrl}${urlPath}`, { waitUntil: "networkidle" });
  return { ctx, page, errs };
}

async function waitForR2Expr(page: any, selector: string) {
  await page.waitForSelector(`${selector}[data-avatar-rendered="1"]`, { timeout: 15000 });
  await expect(page.locator(`${selector} img[data-c2-layer="base"][src*="avatar-r2/base/body-neutral-medium-v2.webp"]`)).toBeAttached({ timeout: 10000 });
  await expect(page.locator(`${selector} img[data-c2-layer="face"]`)).toBeAttached({ timeout: 10000 });
  await page.waitForFunction(() => !!(window as any).__avatarExprEngine && typeof (window as any).__avatarExprEngine.forceExpression === "function", { timeout: 10000 });
}

async function forceExprAndProbe(page: any, selector: string, expr: string) {
  await page.evaluate((e: string) => (window as any).__avatarExprEngine.forceExpression(e), expr);
  // wait until the face layer has swapped to the expected src AND decoded
  await page.waitForFunction(([sel, tail]: [string, string]) => {
    const f = document.querySelector(sel + ' img[data-c2-layer="face"]') as HTMLImageElement | null;
    return !!f && (f.getAttribute("src") || "").includes(tail) && f.complete && f.naturalWidth > 0;
  }, [selector, FACE_SRC[expr]], { timeout: 10000 });
  await page.waitForTimeout(50);
  return page.evaluate((sel: string) => {
    const root = document.querySelector(sel) as HTMLElement;
    const imgs = Array.from(root.querySelectorAll("img"));
    const markers = Array.from(root.querySelectorAll("[data-c2-layer]")).map((n) => n.getAttribute("data-c2-layer"));
    const bb = (el: Element | null) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
    const face = root.querySelector('img[data-c2-layer="face"]') as HTMLImageElement | null;
    return {
      renderPath: root.dataset.avatarRenderPath,
      faceSrc: face ? (face.getAttribute("src") || "") : "",
      r2Markers: markers.filter((m) => ["blush", "face", "iris", "eyes", "hair-r2"].includes(m as string)).length,
      baseCount: root.querySelectorAll('img[data-c2-layer="base"]').length,
      c2Svg: imgs.some((i) => (i.getAttribute("src") || "").includes("-c2.svg")),
      broken: imgs.filter((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth === 0).length,
      containerBB: bb(root),
      baseBB: bb(root.querySelector('img[data-c2-layer="base"]')),
      hairBB: bb(root.querySelector('[data-c2-layer="hair-r2"]')),
      faceBB: bb(face),
    };
  }, selector);
}

// Force each expression in turn, assert the swap invariants, and (chromium) capture a golden.
async function expressionContract(page: any, errs: string[], browserName: string, selector: string, prefix: string, exprs: string[], maxDiffPixels: number) {
  await waitForR2Expr(page, selector);
  const el = page.locator(selector);
  const chromium = browserName === "chromium";
  let ref: any = null;

  for (const expr of exprs) {
    const p = await forceExprAndProbe(page, selector, expr);
    expect(p.renderPath, "exact R2").toBe("r2");
    expect(p.faceSrc, `${expr} face src`).toContain(FACE_SRC[expr]);
    expect(p.r2Markers, "full R2 stack").toBeGreaterThanOrEqual(4);
    expect(p.baseCount, "one base layer").toBe(1);
    expect(p.c2Svg, "no C2 mixed into R2").toBeFalsy();
    expect(p.broken, "no broken images").toBe(0);
    // the expression is a pure src swap → geometry never moves
    if (ref) {
      expect(p.containerBB, "container bbox unchanged across expressions").toEqual(ref.containerBB);
      expect(p.baseBB, "base bbox unchanged").toEqual(ref.baseBB);
      expect(p.hairBB, "hair bbox unchanged").toEqual(ref.hairBB);
      expect(p.faceBB, "face bbox unchanged (swap, not layout)").toEqual(ref.faceBB);
    } else { ref = p; }
    if (chromium) await expect(el).toHaveScreenshot(`${prefix}-expr-${expr}.png`, { maxDiffPixels });
  }
  expect(errs.filter((e) => !/favicon/i.test(e)), "no page/console errors").toEqual([]);
}

test("golden: R2 expressions — avatar.html (all five)", async ({ browser, browserName }) => {
  const { ctx, page, errs } = await openSurface(browser, "/avatar.html", idNeutralMedium);
  await page.waitForSelector("#skinToneButtons .identity-btn", { timeout: 15000 });
  await expressionContract(page, errs, browserName, "#avatar-preview", "r2-avatar-page", ["neutral", "curious", "focused", "determined", "proud"], 250);
  await ctx.close();
});

test("golden: R2 expressions — hub.html (proud + invariants)", async ({ browser, browserName }) => {
  const { ctx, page, errs } = await openSurface(browser, "/hub.html", idNeutralMedium);
  await page.waitForSelector("#profileAvatar img", { timeout: 15000 });
  await expressionContract(page, errs, browserName, "#profileAvatar", "r2-hub-avatar", ["neutral", "proud"], 150);
  await ctx.close();
});

test("golden: R2 expressions — index.html/quiz (proud + invariants)", async ({ browser, browserName }) => {
  const { ctx, page, errs } = await openSurface(browser, "/index.html", idNeutralMedium);
  await expressionContract(page, errs, browserName, "#avatar-display", "r2-quiz-avatar", ["neutral", "proud"], 120);
  await ctx.close();
});

test("R2 expression cleanup: destroy restores the neutral face layer", async ({ browser }) => {
  const { ctx, page } = await openSurface(browser, "/avatar.html", idNeutralMedium);
  await page.waitForSelector("#skinToneButtons .identity-btn", { timeout: 15000 });
  await waitForR2Expr(page, "#avatar-preview");
  await page.evaluate(() => (window as any).__avatarExprEngine.forceExpression("proud"));
  await page.waitForFunction(() => ((document.querySelector('#avatar-preview img[data-c2-layer="face"]') as HTMLImageElement)?.getAttribute("src") || "").includes("face-proud-v1.webp"), { timeout: 10000 });
  await page.evaluate(() => (window as any).__avatarExprEngine.destroy());
  const src = await page.evaluate(() => (document.querySelector('#avatar-preview img[data-c2-layer="face"]') as HTMLImageElement)?.getAttribute("src") || "");
  expect(src, "destroy restores the neutral face layer").toContain("face-neutral-v1.webp");
  expect(await page.evaluate(() => (window as any).__avatarExprEngine), "destroy clears the gated handle").toBeNull();
  await ctx.close();
});

test("expression test handle is GATED: exposed only under window.__AVATAR_TEST__", async ({ browser }) => {
  // WITHOUT the flag → production behaviour → NO global exposed.
  const ctx = await browser.newContext({ viewport: { width: 900, height: 700 }, reducedMotion: "reduce" });
  await ctx.route("**://*.supabase.co/**", makeRoute(idNeutralMedium));
  await ctx.addInitScript(([k, s]: [string, any]) => {
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem("avatar_v2", "1");
    localStorage.setItem("avatar_r2", "1");
  }, [`sb-${REF}-auth-token`, SESSION]);
  const page = await ctx.newPage();
  await page.goto(`${baseUrl}/avatar.html`, { waitUntil: "networkidle" });
  await page.waitForSelector('#avatar-preview[data-avatar-rendered="1"]', { timeout: 15000 });
  await page.waitForTimeout(300);
  const exposed = await page.evaluate(() => ({
    flag: (window as any).__AVATAR_TEST__ === true,
    handle: typeof (window as any).__avatarExprEngine !== "undefined" && (window as any).__avatarExprEngine !== null,
  }));
  expect(exposed.flag, "no test flag in this context").toBeFalsy();
  expect(exposed.handle, "production must NOT expose the expression-engine global").toBeFalsy();
  await ctx.close();
});
