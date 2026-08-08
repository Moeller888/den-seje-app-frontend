// Lærlig public landing page — routing contract, CTA destination, accessibility, motion.
// ---------------------------------------------------------------------------------------------
// SELF-SERVED, ZERO BACKEND. A local http.Server serves this branch's own files, exactly like the
// Avatar R2 fixture specs. Nothing here touches Supabase, the deployed origin, or the network: a
// guard below FAILS the test if any request leaves localhost, so "no third-party contact" is
// proven rather than asserted in a comment.
//
// The server models the production routing rule (`/` → internal rewrite → `/landing.html`) rather
// than guessing it: the rule string is read out of tools/cloudflare-build-static.mjs and asserted,
// so if the contract is ever retargeted this spec fails instead of silently testing the old shape.
import { test, expect } from "@playwright/test";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".wav": "audio/wav",
};

// The production rule, read from the build script so the two cannot drift apart.
const BUILD_SRC = fs.readFileSync(path.join(ROOT, "tools", "cloudflare-build-static.mjs"), "utf8");
const RULE_MATCH = BUILD_SRC.match(/export const REDIRECTS_RULE = "([^"]+)"/);
const REDIRECTS_RULE = RULE_MATCH ? RULE_MATCH[1] : "";
const RULE_PARTS = REDIRECTS_RULE.split(/\s+/);           // ["/", "/landing.html", "200"]

let server: http.Server;
let baseUrl: string;

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    let p = decodeURIComponent((req.url || "/").split("?")[0]);

    // The single internal rewrite. Status 200 = the body changes, the URL does not.
    if (p === RULE_PARTS[0] && RULE_PARTS[2] === "200") p = RULE_PARTS[1];

    try {
      const fp = path.normalize(path.join(ROOT, p));
      if (!fp.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      const data = fs.readFileSync(fp);
      res.writeHead(200, { "content-type": MIME[path.extname(fp).toLowerCase()] || "application/octet-stream" });
      res.end(data);
    } catch {
      res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
      res.end("<h1>404</h1>");
    }
  });
  await new Promise<void>((r) => server.listen(0, r));
  baseUrl = `http://localhost:${(server.address() as any).port}`;
});

test.afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

// Every test gets the off-host guard and a console-error collector.
async function openLanding(page: any, urlPath = "/") {
  const offHost: string[] = [];
  const errors: string[] = [];
  page.on("request", (r: any) => {
    const u = r.url();
    if (!u.startsWith(baseUrl) && !u.startsWith("data:") && !u.startsWith("about:")) offHost.push(u);
  });
  page.on("pageerror", (e: Error) => errors.push(String(e)));
  page.on("console", (m: any) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(baseUrl + urlPath, { waitUntil: "load" });
  return { offHost, errors };
}

// ── the routing contract ──────────────────────────────────────────────────────────────────────

test("the build script's root rewrite targets the landing page", () => {
  expect(REDIRECTS_RULE).toBe("/ /landing.html 200");
});

test("/ serves the landing page, and the URL stays / (internal rewrite, no 3xx)", async ({ page }) => {
  const res = await page.goto(baseUrl + "/", { waitUntil: "load" });
  expect(res?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe("/");
  await expect(page.locator("h1")).toHaveText("Læring, der tilpasser sig eleven.");
});

test("/landing.html serves the same document directly", async ({ page }) => {
  const res = await page.goto(baseUrl + "/landing.html", { waitUntil: "load" });
  expect(res?.status()).toBe(200);
  await expect(page.locator("h1")).toHaveText("Læring, der tilpasser sig eleven.");
});

test("/ and /landing.html render the identical page", async ({ page }) => {
  await page.goto(baseUrl + "/", { waitUntil: "load" });
  const viaRoot = await page.content();
  await page.goto(baseUrl + "/landing.html", { waitUntil: "load" });
  expect(await page.content()).toBe(viaRoot);
});

// Asserted on the SERVED DOCUMENT, not in a browser. Opening /index.html in a page would execute
// app.js, whose auth guard immediately does location.replace("login.html") for an anonymous
// visitor — and, on the way, would load the Supabase client and make a real getSession() call.
// The routing question here is "what does this address serve", which the raw response answers
// exactly, with no script execution and no backend contact.
test("THE QUIZ DID NOT MOVE — /index.html still serves the quiz, and / does not", async ({ request }) => {
  const quiz = await request.get(baseUrl + "/index.html");
  expect(quiz.status()).toBe(200);
  const quizBody = await quiz.text();
  expect(quizBody).toContain('<div class="game-shell">');
  expect(quizBody).toContain('id="question"');
  expect(quizBody).toContain('src="app.js"');

  const root = await request.get(baseUrl + "/");
  expect(root.status()).toBe(200);
  const rootBody = await root.text();
  expect(rootBody).not.toContain('class="game-shell"');
  expect(rootBody).toContain("Læring, der tilpasser sig eleven.");
  expect(rootBody).not.toBe(quizBody);
});

// The quiz's auth guard is what makes index.html the wrong CTA target — pin that reasoning down
// so a future change cannot quietly make the landing page link into an auth-guarded page.
test("index.html is auth-guarded, which is why the CTA points at login.html instead", async ({ request }) => {
  const appJs = await (await request.get(baseUrl + "/app.js")).text();
  expect(appJs).toContain('window.location.replace("login.html")');
});

// ── the CTA ───────────────────────────────────────────────────────────────────────────────────

test("VI LÆRER! is a real relative link to login.html — not a script-driven button", async ({ page }) => {
  await openLanding(page);
  const cta = page.locator(".cta-portal").first();
  await expect(cta).toBeVisible();
  // A real anchor: works with JS off, with middle-click, and with the keyboard.
  expect(await cta.evaluate((el) => el.tagName)).toBe("A");
  expect(await cta.getAttribute("href")).toBe("login.html");
  await expect(cta).toHaveText(/Vi lærer!/i);
});

test("the CTA resolves to /login.html from BOTH / and /landing.html", async ({ page }) => {
  for (const from of ["/", "/landing.html"]) {
    await page.goto(baseUrl + from, { waitUntil: "load" });
    const href = await page.locator(".cta-portal").first().evaluate((el) => (el as HTMLAnchorElement).href);
    expect(new URL(href).pathname).toBe("/login.html");
  }
});

test("clicking the CTA navigates to the login page", async ({ page }) => {
  await openLanding(page);
  await page.locator(".cta-portal").first().click();
  await page.waitForURL(baseUrl + "/login.html");
  await expect(page.locator("#login-form")).toHaveCount(1);
});

test("the landing page never links into the quiz", async ({ page }) => {
  await openLanding(page);
  await expect(page.locator('a[href="index.html"]')).toHaveCount(0);
  await expect(page.locator('a[href="/index.html"]')).toHaveCount(0);
});

// ── third-party contact ───────────────────────────────────────────────────────────────────────

test("the page loads with zero off-host requests and no console errors", async ({ page }) => {
  const { offHost, errors } = await openLanding(page);
  await page.waitForTimeout(300);           // let any late/deferred request fire
  expect(offHost, "the landing page must contact no third party").toEqual([]);
  expect(errors).toEqual([]);
});

// ── accessibility ─────────────────────────────────────────────────────────────────────────────

test("document language is Danish and the page is noindex while pre-launch", async ({ page }) => {
  await openLanding(page);
  expect(await page.locator("html").getAttribute("lang")).toBe("da");
  expect(await page.locator('meta[name="robots"]').getAttribute("content")).toBe("noindex, nofollow");
});

test("there is exactly one h1, and every section is labelled", async ({ page }) => {
  await openLanding(page);
  await expect(page.locator("h1")).toHaveCount(1);
  const sections = page.locator("main section");
  const n = await sections.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const id = await sections.nth(i).getAttribute("aria-labelledby");
    expect(id, `section ${i} has no aria-labelledby`).toBeTruthy();
    await expect(page.locator(`#${id}`)).toHaveCount(1);
  }
});

test("the skip link is the first tab stop and reaches main", async ({ page }) => {
  await openLanding(page);
  await page.keyboard.press("Tab");
  const focused = page.locator(":focus");
  await expect(focused).toHaveClass(/skip-link/);
  expect(await focused.getAttribute("href")).toBe("#main");
  await expect(focused).toBeVisible();
});

test("the CTA is keyboard reachable and shows a visible focus ring", async ({ page }) => {
  await openLanding(page);
  const cta = page.locator(".cta-portal").first();
  await cta.focus();
  const outline = await cta.evaluate((el) => {
    const s = getComputedStyle(el);
    return { width: s.outlineWidth, style: s.outlineStyle };
  });
  expect(outline.style).not.toBe("none");
  expect(parseFloat(outline.width)).toBeGreaterThanOrEqual(2);
});

test("every interactive element meets the 44x44 minimum hit area", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openLanding(page);
  const els = page.locator("main a, header a, footer a, header button");
  const n = await els.count();
  expect(n).toBeGreaterThan(0);
  const tooSmall: string[] = [];
  for (let i = 0; i < n; i++) {
    const el = els.nth(i);
    if (!(await el.isVisible())) continue;          // the skip link is off-screen until focused
    const box = await el.boundingBox();
    if (!box) continue;
    if (box.height < 44 || box.width < 44) {
      tooSmall.push(`${await el.innerText()} → ${Math.round(box.width)}x${Math.round(box.height)}`);
    }
  }
  expect(tooSmall).toEqual([]);
});

// ── mobile menu ───────────────────────────────────────────────────────────────────────────────

test("the mobile menu opens, closes, and reports its state to assistive tech", async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 900 });
  await openLanding(page);

  const toggle = page.locator("#nav-toggle");
  const menu = page.locator("#nav-mobile");

  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toHaveAttribute("aria-controls", "nav-mobile");
  await expect(menu).toBeHidden();

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(menu).toBeVisible();

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toBeHidden();
});

test("Escape closes the mobile menu and returns focus to the toggle", async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 900 });
  await openLanding(page);

  const toggle = page.locator("#nav-toggle");
  await toggle.click();
  await expect(page.locator("#nav-mobile")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.locator("#nav-mobile")).toBeHidden();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeFocused();
});

test("following a menu link closes the menu", async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 900 });
  await openLanding(page);

  await page.locator("#nav-toggle").click();
  await expect(page.locator("#nav-mobile")).toBeVisible();

  await page.locator("#nav-mobile a").first().click();
  await expect(page.locator("#nav-mobile")).toBeHidden();
});

test("growing past the breakpoint closes an open mobile menu", async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 900 });
  await openLanding(page);

  await page.locator("#nav-toggle").click();
  await expect(page.locator("#nav-mobile")).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator("#nav-mobile")).toBeHidden();
  await expect(page.locator(".nav-desktop")).toBeVisible();
});

// ── responsive ────────────────────────────────────────────────────────────────────────────────

for (const [label, width] of [["desktop", 1280], ["tablet", 860], ["mobile", 390]] as const) {
  test(`no horizontal overflow at ${label} (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openLanding(page);
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, "the page must never scroll sideways").toBeLessThanOrEqual(1);
    await expect(page.locator(".cta-portal").first()).toBeVisible();
  });
}

// ── the hero sits directly under the header ───────────────────────────────────────────────────
// Regression guard. The hero used to be `min-height: 100svh` + `align-items: center` on a section
// that starts BELOW the sticky header, so the viewport height was counted twice and the leftover
// space was split above the content. That left a dead band under the header which GREW with the
// window — 155px at 800px tall, 294px at 1080px. The measurement below is taken at several heights
// precisely because a fixed-height-only check would not have caught it.
for (const [w, h] of [[1280, 800], [1440, 900], [1920, 1080], [1536, 864]] as const) {
  test(`the eyebrow sits 35-45px under the header at ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await openLanding(page);

    const m = await page.evaluate(() => {
      const r = (s: string) => {
        const el = document.querySelector(s);
        return el ? el.getBoundingClientRect() : null;
      };
      const header = r(".site-header");
      const eyebrow = r(".hero .eyebrow");
      return header && eyebrow ? { headerBottom: header.bottom, headerH: header.height, eyebrowTop: eyebrow.top } : null;
    });

    expect(m, "header or eyebrow missing").not.toBeNull();
    expect(m!.headerH, "the header must be visible and occupy real height").toBeGreaterThan(40);

    const gap = m!.eyebrowTop - m!.headerBottom;
    expect(gap, `gap under the header was ${Math.round(gap)}px`).toBeGreaterThanOrEqual(35);
    expect(gap, `gap under the header was ${Math.round(gap)}px`).toBeLessThanOrEqual(45);
  });
}

test("the hero is not pushed down by a doubled viewport height", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openLanding(page);
  const { heroTop, heroBottom, viewportH } = await page.evaluate(() => {
    const r = document.querySelector(".hero")!.getBoundingClientRect();
    return { heroTop: r.top, heroBottom: r.bottom, viewportH: window.innerHeight };
  });
  // The hero fills exactly the space left under the header — not a whole extra viewport.
  expect(heroBottom - viewportH, "the first screen must not overflow the viewport").toBeLessThanOrEqual(2);
  expect(heroTop, "the hero must start at the header's bottom edge").toBeLessThanOrEqual(72);
});

test("the header is above the hero and stays put — no invisible spacer", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openLanding(page);
  const s = await page.evaluate(() => {
    const h = document.querySelector(".site-header")!.getBoundingClientRect();
    const cs = getComputedStyle(document.querySelector(".site-header")!);
    return { top: h.top, height: h.height, position: cs.position, display: cs.display };
  });
  expect(s.top).toBe(0);
  expect(s.position).toBe("sticky");
  expect(s.display).not.toBe("none");
  expect(s.height).toBeGreaterThan(40);
});

test("the desktop nav is replaced by the toggle below the 900px breakpoint", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openLanding(page);
  await expect(page.locator(".nav-desktop")).toBeVisible();
  await expect(page.locator("#nav-toggle")).toBeHidden();

  await page.setViewportSize({ width: 860, height: 900 });
  await expect(page.locator(".nav-desktop")).toBeHidden();
  await expect(page.locator("#nav-toggle")).toBeVisible();
});

// ── reduced motion ────────────────────────────────────────────────────────────────────────────

test("prefers-reduced-motion removes transitions and the CTA lift", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(baseUrl + "/", { waitUntil: "load" });

  const cta = page.locator(".cta-portal").first();
  const durations = await cta.evaluate((el) =>
    getComputedStyle(el).transitionDuration.split(",").map((d) => parseFloat(d)));
  for (const d of durations) expect(d).toBeLessThanOrEqual(0.001);

  // The affordance survives as colour/glow; only the movement is gone.
  await cta.hover();
  expect(await cta.evaluate((el) => getComputedStyle(el).transform)).toMatch(/none|matrix\(1, 0, 0, 1, 0, 0\)/);

  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");
  await ctx.close();
});

test("without reduced motion the CTA keeps its transition", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "no-preference" });
  const page = await ctx.newPage();
  await page.goto(baseUrl + "/", { waitUntil: "load" });
  const durations = await page.locator(".cta-portal").first().evaluate((el) =>
    getComputedStyle(el).transitionDuration.split(",").map((d) => parseFloat(d)));
  expect(Math.max(...durations)).toBeGreaterThan(0.05);
  await ctx.close();
});
