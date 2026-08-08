// login.html — the visual match with the landing page, and the behaviour that must survive it.
// ---------------------------------------------------------------------------------------------
// SELF-SERVED, ZERO BACKEND. A local http.Server serves this branch's files. login.html loads
// js/supabase.js, which imports the Supabase client from a CDN and constructs a real client, so
// two things are intercepted: the CDN module (replaced with a local stub) and every *.supabase.co
// call (refused). A guard FAILS the test if any request escapes localhost.
//
// The point of this spec is that restyling login.html did not break it. The one that matters most
// is the forgot-password toggle: js/login.js flips `forgotPanel.style.display`, reading the INLINE
// value. If the `display:none` ever moves from the markup into CSS, the first click reads "" —
// which is not "none" — so the panel would be set to "none" and could never open. That is a silent
// break of password recovery, and it is what "panel opens on the first click" below pins down.
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

// A stand-in for the CDN's @supabase/supabase-js ESM build. Only the surface js/login.js touches.
const SUPABASE_STUB = `
export function createClient() {
  const ok = async () => ({ data: { session: null }, error: null });
  return {
    auth: {
      getSession: ok,
      signInWithPassword: async () => ({ data: null, error: { message: "stub" } }),
      resetPasswordForEmail: async () => ({ error: null }),
      signOut: async () => ({ error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null, status: 200 }) }) }),
    }),
  };
}
`;

let server: http.Server;
let baseUrl: string;

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const p = decodeURIComponent((req.url || "/").split("?")[0]);
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

async function openLogin(page: any) {
  const offHost: string[] = [];
  const errors: string[] = [];

  // The CDN module, replaced locally. Nothing leaves the machine.
  await page.route("**/cdn.jsdelivr.net/**", (route: any) =>
    route.fulfill({ status: 200, headers: { "content-type": "text/javascript; charset=utf-8" }, body: SUPABASE_STUB }));
  // Belt and braces: the real project must never be reachable from this spec.
  await page.route("**/*.supabase.co/**", (route: any) => route.abort());

  page.on("request", (r: any) => {
    const u = r.url();
    if (u.startsWith(baseUrl) || u.startsWith("data:") || u.startsWith("about:")) return;
    if (u.includes("cdn.jsdelivr.net")) return;      // intercepted above, never dispatched
    offHost.push(u);
  });
  page.on("pageerror", (e: Error) => errors.push(String(e)));
  page.on("console", (m: any) => { if (m.type() === "error") errors.push(m.text()); });

  await page.goto(baseUrl + "/login.html", { waitUntil: "load" });
  return { offHost, errors };
}

// ── the contract js/login.js depends on ───────────────────────────────────────────────────────

test("every element js/login.js binds to is present", async ({ page }) => {
  await openLogin(page);
  for (const id of ["login-form", "email", "password", "loginBtn", "message",
                    "forgotBtn", "forgot-panel", "reset-email", "resetRequestBtn", "reset-message"]) {
    await expect(page.locator(`#${id}`), `#${id} is missing`).toHaveCount(1);
  }
});

test("the login button still submits the form", async ({ page }) => {
  await openLogin(page);
  const btn = page.locator("#loginBtn");
  expect(await btn.evaluate((el) => (el as HTMLButtonElement).type)).toBe("submit");
  expect(await btn.evaluate((el) => el.closest("form")?.id)).toBe("login-form");
});

test("#forgotBtn keeps the exact label the password-reset spec asserts on", async ({ page }) => {
  await openLogin(page);
  await expect(page.locator("#forgotBtn")).toContainText("Glemt adgangskode?");
});

// THE regression this spec exists for.
test("the forgot panel is hidden, opens on the FIRST click, and closes again", async ({ page }) => {
  await openLogin(page);
  const panel = page.locator("#forgot-panel");

  await expect(panel).not.toBeVisible();
  // The inline style is what js/login.js toggles against — not a CSS rule.
  expect(await panel.getAttribute("style")).toContain("display:none");

  await page.locator("#forgotBtn").click();
  await expect(panel).toBeVisible();
  await expect(page.locator("#reset-email")).toBeVisible();
  await expect(page.locator("#resetRequestBtn")).toBeVisible();

  await page.locator("#forgotBtn").click();
  await expect(panel).not.toBeVisible();
});

// ── no third-party contact ────────────────────────────────────────────────────────────────────

test("the page loads with no off-host request and no console error", async ({ page }) => {
  const { offHost, errors } = await openLogin(page);
  await page.waitForTimeout(400);
  expect(offHost, "login.html must not reach any host but the CDN module it already imported").toEqual([]);
  expect(errors).toEqual([]);
});

// ── the visual match ──────────────────────────────────────────────────────────────────────────

test("the page renders on the product's dark navy surface, not the browser default", async ({ page }) => {
  await openLogin(page);
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe("rgb(18, 18, 42)");                 // --bg-main #12122a from css/theme.css
  const themed = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--bg-main").trim());
  expect(themed).toBe("#12122a");
});

test("it carries the same Laerlig wordmark and links back to the landing page", async ({ page }) => {
  await openLogin(page);
  await expect(page.locator(".login-brand .wordmark-text")).toHaveText("Lærlig");
  expect(await page.locator(".login-brand").getAttribute("href")).toBe("landing.html");
  expect(await page.locator(".login-back").getAttribute("href")).toBe("landing.html");
});

test("the tab title is the Laerlig brand, not the old internal name", async ({ page }) => {
  await openLogin(page);
  await expect(page).toHaveTitle("Log ind — Lærlig");
});

// ── accessibility ─────────────────────────────────────────────────────────────────────────────

test("every input has a real label bound to it", async ({ page }) => {
  await openLogin(page);
  await page.locator("#forgotBtn").click();           // reveal the reset field too
  for (const id of ["email", "password", "reset-email"]) {
    const label = page.locator(`label[for="${id}"]`);
    await expect(label, `#${id} has no <label for>`).toHaveCount(1);
    expect((await label.innerText()).trim().length).toBeGreaterThan(0);
  }
});

test("inputs use a 16px font so iOS Safari does not zoom on focus", async ({ page }) => {
  await openLogin(page);
  for (const id of ["email", "password"]) {
    const fs = await page.locator(`#${id}`).evaluate((el) => getComputedStyle(el).fontSize);
    expect(parseFloat(fs), `#${id} would trigger iOS auto-zoom`).toBeGreaterThanOrEqual(16);
  }
});

test("the primary action and the forgot control show a visible focus ring", async ({ page }) => {
  await openLogin(page);
  for (const sel of ["#loginBtn", "#forgotBtn"]) {
    await page.locator(sel).focus();
    const s = await page.locator(sel).evaluate((el) => {
      const c = getComputedStyle(el);
      return { style: c.outlineStyle, width: parseFloat(c.outlineWidth) };
    });
    expect(s.style, `${sel} has no focus outline`).not.toBe("none");
    expect(s.width).toBeGreaterThanOrEqual(2);
  }
});

test("interactive controls meet the 44x44 minimum hit area", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openLogin(page);
  await page.locator("#forgotBtn").click();
  const els = page.locator("a, button, input");
  const n = await els.count();
  const small: string[] = [];
  for (let i = 0; i < n; i++) {
    const el = els.nth(i);
    if (!(await el.isVisible())) continue;
    const b = await el.boundingBox();
    if (!b) continue;
    if (b.height < 44 || b.width < 44) small.push(`${await el.evaluate((e) => e.id || e.className)} ${Math.round(b.width)}x${Math.round(b.height)}`);
  }
  expect(small).toEqual([]);
});

// ── responsive + motion ───────────────────────────────────────────────────────────────────────

for (const [label, width] of [["desktop", 1440], ["mobile", 390]] as const) {
  test(`no horizontal overflow at ${label} (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openLogin(page);
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await expect(page.locator("#loginBtn")).toBeVisible();
  });
}

test("prefers-reduced-motion removes the button transition and lift", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await openLogin(page);
  const btn = page.locator("#loginBtn");
  const durations = await btn.evaluate((el) =>
    getComputedStyle(el).transitionDuration.split(",").map((d) => parseFloat(d)));
  for (const d of durations) expect(d).toBeLessThanOrEqual(0.001);
  await btn.hover();
  expect(await btn.evaluate((el) => getComputedStyle(el).transform)).toMatch(/none|matrix\(1, 0, 0, 1, 0, 0\)/);
  await ctx.close();
});
