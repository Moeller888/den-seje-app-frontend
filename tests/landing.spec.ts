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

// The production routing table, read from the build script so the two cannot drift apart.
const BUILD_SRC = fs.readFileSync(path.join(ROOT, "tools", "cloudflare-build-static.mjs"), "utf8");
const TABLE_BLOCK = (BUILD_SRC.match(/export const REDIRECT_RULES = Object\.freeze\(\[([\s\S]*?)\]\);/) || [])[1] ?? "";
const REDIRECT_RULES: string[] = [...TABLE_BLOCK.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
// clean route → the file it serves
const ROUTES = new Map<string, string>(
  REDIRECT_RULES.map((r) => { const [from, to] = r.split(/\s+/); return [from, to]; }),
);
// …and its inverse: the legacy .html address → the clean route it permanently moved to. Derived
// exactly as tools/cloudflare-build-static.mjs derives LEGACY_HTML_REDIRECTS from FILE_TO_ROUTE,
// so this spec models the production contract instead of a guess at it. A unit test asserts the
// build's own list matches this derivation.
const LEGACY = new Map<string, string>([...ROUTES].map(([route, file]) => [file, route]));
// The six information pages, in menu order.
const PAGES: Array<[string, string]> = [
  ["/produktet", "Det svære kommer igen."],
  ["/saadan-virker-det", "Tre trin, hver gang."],
  ["/elev-og-laerer", "To sider af den samme time."],
  ["/til-skoler", "Læreren bestemmer."],
  ["/priser", "Prisen er ikke fastlagt endnu."],
  ["/om-laerlig", "Lærlig er i pilotdrift."],
];

// The five entries in the main menu. "Om Lærlig" is reachable from the footer only, so it is
// deliberately not one of them — the same rule on desktop and on mobile.
const MENU = PAGES.filter(([r]) => r !== "/om-laerlig").map(([r]) => r);

let server: http.Server;
let baseUrl: string;

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    let p = decodeURIComponent((req.url || "/").split("?")[0]);

    // A legacy .html address moved permanently. Answered before anything else, exactly as the
    // asset worker does: Cloudflare follows redirects "regardless of whether or not an asset
    // matches", so the fact that produktet.html is a real file on disk does not shortcut this.
    const moved = LEGACY.get(p);
    if (moved) {
      const qs = (req.url || "").includes("?") ? "?" + (req.url || "").split("?").slice(1).join("?") : "";
      res.writeHead(301, { location: moved + qs });
      res.end();
      return;
    }

    // The routing table's internal rewrites. Status 200 = the body changes, the URL does not.
    // This does NOT re-enter the redirect map above — that is what keeps the pair loop-free.
    const target = ROUTES.get(p);
    if (target) p = target;

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

test("the build script declares the full public routing table", () => {
  expect(REDIRECT_RULES).toEqual([
    "/ /landing.html 200",
    "/produktet /produktet.html 200",
    "/saadan-virker-det /saadan-virker-det.html 200",
    "/elev-og-laerer /elev-og-laerer.html 200",
    "/til-skoler /til-skoler.html 200",
    "/priser /priser.html 200",
    "/om-laerlig /om-laerlig.html 200",
  ]);
});

// ── the six information pages ─────────────────────────────────────────────────────────────────

for (const [route, heading] of PAGES) {
  test(`${route} serves its own page, keeps the clean URL, and has one h1`, async ({ page }) => {
    const res = await page.goto(baseUrl + route, { waitUntil: "load" });
    expect(res?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe(route);      // internal rewrite: no 3xx, no .html
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toHaveText(heading);
  });
}

test("every clean route and its .html file render the same document", async ({ request }) => {
  for (const [route, file] of ROUTES) {
    const a = await request.get(baseUrl + route);
    const b = await request.get(baseUrl + file);
    expect(a.status(), `${route} did not serve`).toBe(200);
    expect(b.status(), `${file} did not serve`).toBe(200);
    expect(await a.text(), `${route} and ${file} differ`).toBe(await b.text());
  }
});

// -- the legacy .html addresses -------------------------------------------------------------------
// In a real browser, following real redirects. The unit tests hold the RULES to the routing
// contract; these hold the BEHAVIOUR to what a visitor and a crawler actually experience.

test("every legacy .html address permanently moves to its clean route", async ({ request }) => {
  for (const [route, file] of ROUTES) {
    const res = await request.get(baseUrl + file, { maxRedirects: 0 });
    expect(res.status(), `${file} must be a permanent redirect`).toBe(301);
    expect(res.headers()["location"], `${file} must point at ${route}`).toBe(route);
  }
});

test("following the redirect takes exactly one hop and ends on a 200 - no loop", async ({ request }) => {
  for (const [route, file] of ROUTES) {
    // Walked by hand rather than with maxRedirects, so the NUMBER of hops is observable. A loop
    // would show up as the walk running to its limit instead of terminating at the second step.
    let path = file;
    let hops = 0;
    let status = 0;
    while (hops < 10) {
      const res = await request.get(baseUrl + path, { maxRedirects: 0 });
      status = res.status();
      if (status !== 301) break;
      path = res.headers()["location"];
      hops++;
    }
    expect(hops, `${file} took ${hops} hops`).toBe(1);
    expect(path).toBe(route);
    expect(status).toBe(200);
  }
});

test("the query string survives the redirect - tracking parameters are not dropped", async ({ request }) => {
  const res = await request.get(baseUrl + "/produktet.html?utm_source=nyhedsbrev&utm_campaign=pilot",
    { maxRedirects: 0 });
  expect(res.status()).toBe(301);
  expect(res.headers()["location"]).toBe("/produktet?utm_source=nyhedsbrev&utm_campaign=pilot");
});

test("the page renders properly after the redirect, with no console error", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  for (const [route, file] of ROUTES) {
    const res = await page.goto(baseUrl + file, { waitUntil: "load" });
    expect(res?.status(), `${file} did not end on a 200`).toBe(200);
    expect(new URL(page.url()).pathname).toBe(route);
    await expect(page.locator("h1")).toHaveCount(1);
  }
  expect(errors).toEqual([]);
});

test("back and forward behave normally across a redirect", async ({ page }) => {
  // A redirect replaces its own entry in the history, so going back from the destination must
  // land on where the visitor actually came from - not bounce them forward again through the 301.
  await page.goto(baseUrl + "/", { waitUntil: "load" });
  await page.goto(baseUrl + "/produktet.html", { waitUntil: "load" });
  expect(new URL(page.url()).pathname).toBe("/produktet");

  await page.goBack({ waitUntil: "load" });
  expect(new URL(page.url()).pathname, "back must reach the front page, not loop").toBe("/");

  await page.goForward({ waitUntil: "load" });
  expect(new URL(page.url()).pathname, "forward must return to the clean route").toBe("/produktet");
  await expect(page.locator("h1")).toHaveCount(1);
});

test("no internal app address is redirected - the app keeps every URL it links to", async ({ request }) => {
  for (const p of ["/index.html", "/login.html", "/reset-password.html", "/hub.html", "/shop.html",
                   "/avatar.html", "/collection.html", "/themes.html", "/leaderboard.html",
                   "/achievements.html", "/teacher.html", "/student-detail.html", "/admin.html"]) {
    const res = await request.get(baseUrl + p, { maxRedirects: 0 });
    expect(res.status(), `${p} must still serve directly`).toBe(200);
  }
});

test("no navigation or footer link points at a legacy .html address", async ({ page }) => {
  // We must not send our own visitors through a redirect we control.
  for (const [route] of ROUTES) {
    await page.goto(baseUrl + route, { waitUntil: "load" });
    const hrefs = await page.locator("nav a, footer a").evaluateAll(
      (els) => els.map((el) => (el as HTMLAnchorElement).getAttribute("href") ?? ""));
    for (const href of hrefs) {
      for (const legacy of LEGACY.keys()) {
        expect(href, `${route} links to the legacy address ${legacy}`).not.toBe(legacy);
        expect(href).not.toBe(legacy.replace(/^\//, ""));
      }
    }
  }
});

// -- the canonical contract --------------------------------------------------------------------
// Every public page answers at TWO addresses: its clean route and its .html file, with identical
// bodies (proved by the test above). The canonical tag is the only thing that tells a crawler
// which of the two is the page. Read out of the REAL DOM here rather than by regex, so a tag the
// browser refuses to parse cannot pass a test that a string search would let through.
//
// SITE_ORIGIN is restated once, deliberately: this spec exists to check the pages independently of
// the build script, and the routing table it does import is already asserted literally above.
const CANONICAL_ORIGIN = "https://l\u00e6rlig.dk";

test("every public page declares exactly one canonical, naming its own clean route", async ({ page }) => {
  for (const [route] of ROUTES) {
    await page.goto(baseUrl + route, { waitUntil: "load" });
    const links = page.locator('link[rel="canonical"]');
    await expect(links, `${route} must declare exactly one canonical`).toHaveCount(1);
    expect(await links.getAttribute("href"), `${route} canonicalises somewhere else`)
      .toBe(CANONICAL_ORIGIN + route);
  }
});

test("arriving at the legacy .html address lands on the clean route, carrying its canonical", async ({ page }) => {
  // The .html address no longer delivers HTML at all, so there is no canonical to read there -
  // the 301 is the stronger signal and it happens first. What matters is where the visitor ends
  // up: the clean route, with the tag that names itself.
  for (const [route, file] of ROUTES) {
    await page.goto(baseUrl + file, { waitUntil: "load" });
    expect(new URL(page.url()).pathname, `${file} should have moved to ${route}`).toBe(route);
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
    expect(await page.locator('link[rel="canonical"]').getAttribute("href")).toBe(CANONICAL_ORIGIN + route);
  }
});

test("the browser RESOLVES every canonical to https on the real IDN host, with no .html", async ({ page }) => {
  for (const [route] of ROUTES) {
    await page.goto(baseUrl + route, { waitUntil: "load" });
    // `.href` on the DOM node is the RESOLVED URL - the browser applies the URL Standard, which
    // is exactly what a crawler does. This is the proof that the human-readable IDN spelling
    // addresses the same host as the punycode A-label, rather than an assumption that it does.
    const resolved = await page.locator('link[rel="canonical"]')
      .evaluate((el) => (el as HTMLLinkElement).href);
    const u = new URL(resolved);
    expect(u.protocol, `${route} canonical is not https`).toBe("https:");
    expect(u.hostname, `${route} canonical is on the wrong host`).toBe("xn--lrlig-sra.dk");
    expect(u.pathname.endsWith(".html"), `${route} canonical is a .html address`).toBe(false);
    expect(u.search + u.hash, `${route} canonical carries a query or fragment`).toBe("");
  }
});

test("the canonical set is exactly the routing table, with no page claiming another's URL", async ({ page }) => {
  const seen: string[] = [];
  for (const [route] of ROUTES) {
    await page.goto(baseUrl + route, { waitUntil: "load" });
    seen.push((await page.locator('link[rel="canonical"]').getAttribute("href")) ?? "");
  }
  expect(seen).toEqual([...ROUTES.keys()].map((r) => CANONICAL_ORIGIN + r));
  expect(new Set(seen).size, "two pages claim the same canonical URL").toBe(seen.length);
});

test("no internal surface declares a canonical", async ({ page }) => {
  for (const p of ["/index.html", "/login.html", "/hub.html", "/teacher.html", "/admin.html"]) {
    await page.goto(baseUrl + p, { waitUntil: "domcontentloaded" });
    await expect(page.locator('link[rel="canonical"]'),
      `${p} is an internal surface and must not declare a canonical`).toHaveCount(0);
  }
});

// THE FRONT PAGE IS A STORY, NOT A TITLE CARD (owner brief, Lærlig 2.0, 2026-10-02). It used to be
// a hero and nothing else (docs/LANDING.md tranche 8). The redesign replaces that decision on
// purpose: the front page now shows the product itself, scene by scene. What is pinned here is
// the order of the story and what it must never become — a sales page of identical feature
// cards — while the six information pages stay reachable through the menu and the footer.
const STORY: Array<[string, RegExp]> = [
  ["hero-title",    /Læring, der tilpasser sig eleven\./],
  ["premise-title", /24 elever\.\s*24 forskellige udgangspunkter\./],
  ["adapt-title",   /Samme opgave\. To forskellige næste skridt\./],
  ["return-title",  /Det svære kommer igen\./],
  ["student-title", /Du kan se, at det rykker\./],
  ["teacher-title", /Læreren bestemmer\./],
  ["trust-title",   /Det, skolen kan regne med\./],
  ["closing-title", /Ét klasseværelse\.\s*Mange forskellige næste skridt\./],
];

test("the front page tells the story in order — and never turns into a card grid", async ({ page }) => {
  await openLanding(page);
  const labelled = await page.locator("main > section").evaluateAll(
    (els) => els.map((e) => e.getAttribute("aria-labelledby")));
  expect(labelled).toEqual(STORY.map(([id]) => id));
  for (const [id, text] of STORY) {
    await expect(page.locator(`#${id}`)).toHaveText(text);
  }
  // The generic kit stays off the front page: no feature-card grids, no step cards, no old portal.
  for (const gone of [".cards", ".card", ".steps", ".split", ".ticks", ".explore", ".explore-card", ".cta-portal"]) {
    await expect(page.locator(gone), `${gone} is on the front page`).toHaveCount(0);
  }
  // The six pages are reached through the menu and the footer.
  for (const [route] of PAGES) {
    await expect(page.locator(`header a[href="${route}"], footer a[href="${route}"]`).first(),
      `${route} is not reachable from the menu or the footer`).toHaveCount(1);
  }
});

test("the front page says 'next step', and never calls the whole product 'questions'", async ({ page }) => {
  // Lærlig has several task types. The brief is explicit: "spørgsmål" is not the umbrella word,
  // and "Lærlig tilpasser næste skridt til den enkelte elev" is the line the page carries.
  await openLanding(page);
  const text = await page.locator("main").innerText();
  expect(text).toContain("Lærlig tilpasser næste skridt til den enkelte elev");
  expect(text.toLowerCase()).not.toContain("spørgsmål");
  const meta = await page.locator('meta[name="description"]').getAttribute("content");
  expect((meta ?? "").toLowerCase()).not.toContain("spørgsmål");
});

test("the avatar on the front page is the live one, mounted by the shared render path", async ({ page }) => {
  // No copy of the layer stack may live on the front page: js/forside.js must go through
  // mountC2Avatar, the one path every app surface uses, so the site can never show a figure the
  // student does not get. Whichever path it takes (R2 or the C2 fallback), it must render layers.
  const src = fs.readFileSync(path.join(ROOT, "js", "forside.js"), "utf8");
  expect(src).toContain('import { mountC2Avatar } from "./avatar-render-c2.js"');
  await openLanding(page);
  await page.waitForSelector("html[data-forside-ready]");
  const roots = page.locator("[data-fs-avatar]");
  const n = await roots.count();
  expect(n).toBeGreaterThanOrEqual(2);
  for (let i = 0; i < n; i++) {
    const root = roots.nth(i);
    expect(["r2", "c2"]).toContain(await root.getAttribute("data-avatar-path"));
    expect(await root.locator("[data-c2-layer]").count()).toBeGreaterThan(0);
  }
});

test("the navigation uses page links everywhere — no in-page anchors left in any nav", async ({ page }) => {
  for (const route of ["/", ...PAGES.map(([r]) => r)]) {
    await page.goto(baseUrl + route, { waitUntil: "load" });
    const hrefs = await page.locator("header nav a, footer nav a").evaluateAll(
      (els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href") || ""));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const h of hrefs) expect(h.startsWith("#"), `${route} nav still has ${h}`).toBe(false);
  }
});

test("the current page is marked with aria-current in the navigation", async ({ page }) => {
  for (const route of MENU) {
    await page.goto(baseUrl + route, { waitUntil: "load" });
    const marked = await page.locator('[aria-current="page"]').evaluateAll(
      (els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href")));
    expect(marked.length, `${route} marks nothing current`).toBeGreaterThan(0);
    for (const h of marked) expect(h).toBe(route);
  }
  // Pages that are not menu entries mark nothing: the front page, and /om-laerlig, which is
  // reachable from the footer only.
  for (const route of ["/", "/om-laerlig"]) {
    await page.goto(baseUrl + route, { waitUntil: "load" });
    await expect(page.locator('[aria-current="page"]'), `${route} must not mark a menu entry`).toHaveCount(0);
  }
});

test("the desktop and mobile menus list exactly the same five pages", async ({ page }) => {
  for (const route of ["/", ...PAGES.map(([r]) => r)]) {
    await page.goto(baseUrl + route, { waitUntil: "load" });
    const desktop = await page.locator(".nav-desktop a").evaluateAll(
      (els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href")));
    const mobile = await page.locator("#nav-mobile a").evaluateAll(
      (els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href")));
    expect(desktop, `${route}: menu drifted`).toEqual(MENU);
    expect(mobile, `${route}: the mobile menu differs from desktop`).toEqual(MENU);
    // …and Om Lærlig is still reachable, from the footer.
    await expect(page.locator('footer a[href="/om-laerlig"]')).toHaveCount(1);
  }
});

test("every navigation and footer link on every public page resolves to 200", async ({ page, request }) => {
  const checked = new Set<string>();
  for (const route of ["/", ...PAGES.map(([r]) => r)]) {
    await page.goto(baseUrl + route, { waitUntil: "load" });
    const hrefs = await page.locator("header a, footer a, main a").evaluateAll(
      (els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href") || ""));
    for (const h of hrefs) {
      // mailto: is a real destination but not one an HTTP request can resolve.
      if (!h || h.startsWith("#") || h.startsWith("http") || h.startsWith("mailto:")) continue;
      const key = h.startsWith("/") ? h : "/" + h;
      if (checked.has(key)) continue;
      checked.add(key);
      const r = await request.get(baseUrl + key);
      expect(r.status(), `${route} links to ${h}, which is ${r.status()}`).toBe(200);
    }
  }
  expect(checked.size).toBeGreaterThan(6);
});

test("the wordmark returns to the front page from every information page", async ({ page }) => {
  for (const [route] of PAGES) {
    await page.goto(baseUrl + route, { waitUntil: "load" });
    expect(await page.locator(".wordmark").getAttribute("href")).toBe("/");
  }
});

test("Log ind keeps its destination on every public page", async ({ page }) => {
  for (const route of ["/", ...PAGES.map(([r]) => r)]) {
    await page.goto(baseUrl + route, { waitUntil: "load" });
    const href = await page.locator(".login-link").evaluate((el) => (el as HTMLAnchorElement).href);
    expect(new URL(href).pathname).toBe("/login.html");
  }
});

test("no information page has horizontal overflow or an empty screen at desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const [route] of PAGES) {
    await page.goto(baseUrl + route, { waitUntil: "load" });
    const m = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      headerBottom: document.querySelector(".site-header")!.getBoundingClientRect().bottom,
      h1Top: document.querySelector("h1")!.getBoundingClientRect().top,
    }));
    expect(m.overflow, `${route} scrolls sideways`).toBeLessThanOrEqual(1);
    // The page hero is compact: the heading sits close under the header, never a screen below it.
    expect(m.h1Top - m.headerBottom, `${route} has a large empty band under the header`).toBeLessThan(140);
  }
});

test("the mobile menu works on an information page, not just the front page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseUrl + "/til-skoler", { waitUntil: "load" });
  const toggle = page.locator("#nav-toggle");
  const menu = page.locator("#nav-mobile");
  await expect(menu).toBeHidden();
  await toggle.click();
  await expect(menu).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(toggle).toBeFocused();
});

test("every information page loads with no off-host request and no console error", async ({ page }) => {
  const offHost: string[] = [];
  const errors: string[] = [];
  page.on("request", (r) => {
    const u = r.url();
    if (!u.startsWith(baseUrl) && !u.startsWith("data:") && !u.startsWith("about:")) offHost.push(u);
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  for (const [route] of PAGES) {
    await page.goto(baseUrl + route, { waitUntil: "load" });
    await page.waitForTimeout(120);
  }
  expect(offHost).toEqual([]);
  expect(errors).toEqual([]);
});

test("/ serves the landing page, and the URL stays / (internal rewrite, no 3xx)", async ({ page }) => {
  const res = await page.goto(baseUrl + "/", { waitUntil: "load" });
  expect(res?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe("/");
  await expect(page.locator("h1")).toHaveText("Læring, der tilpasser sig eleven.");
});

test("/landing.html has MOVED to / - the root case, end to end", async ({ page }) => {
  // The one pair where the two rules name each other: `/landing.html -> / 301` and
  // `/ -> /landing.html 200`. If a rewrite could re-enter the redirect table this is where it
  // would spin, so the address is asserted as well as the status.
  const res = await page.goto(baseUrl + "/landing.html", { waitUntil: "load" });
  expect(res?.status(), "the final response must be the page, not a redirect").toBe(200);
  expect(new URL(page.url()).pathname, "the browser must end on the clean root").toBe("/");
  await expect(page.locator("h1")).toHaveText("Læring, der tilpasser sig eleven.");
});

test("/ and /landing.html end on the same page, reached by different means", async ({ page }) => {
  // The front page has a live avatar and a one-time demo, so its DOM keeps changing for a few
  // seconds after `load`. Both visits are compared once the page reports itself settled
  // (`html[data-forside-ready]`, set by js/forside.js) — the same finished document either way.
  await page.goto(baseUrl + "/", { waitUntil: "load" });
  await page.waitForSelector("html[data-forside-ready]");
  const viaRoot = await page.content();
  await page.goto(baseUrl + "/landing.html", { waitUntil: "load" });
  expect(new URL(page.url()).pathname).toBe("/");
  await page.waitForSelector("html[data-forside-ready]");
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

test("the hero's primary action is a real link to the 'how it works' scene on the same page", async ({ page }) => {
  await openLanding(page);
  const cta = page.locator(".fs-hero .fs-btn-primary");
  await expect(cta).toHaveCount(1);
  await expect(cta).toBeVisible();
  // A real anchor: works with JS off, with middle-click, and with the keyboard.
  expect(await cta.evaluate((el) => el.tagName)).toBe("A");
  await expect(cta).toHaveText("Se hvordan Lærlig virker");
  expect(await cta.getAttribute("href")).toBe("#naeste-skridt");
  await expect(page.locator("#naeste-skridt")).toHaveCount(1);
});

test("following the primary action brings the adaptive scene into view", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openLanding(page);
  await page.locator(".fs-hero .fs-btn-primary").click();
  await expect(page.locator("#adapt-title")).toBeInViewport();
});

test("the hero's Log ind resolves to /login.html from BOTH / and /landing.html", async ({ page }) => {
  for (const from of ["/", "/landing.html"]) {
    await page.goto(baseUrl + from, { waitUntil: "load" });
    const link = page.locator(".fs-hero .fs-btn-quiet");
    await expect(link).toHaveText("Log ind");
    expect(await link.getAttribute("href")).toBe("login.html");
    const href = await link.evaluate((el) => (el as HTMLAnchorElement).href);
    expect(new URL(href).pathname).toBe("/login.html");
  }
});

test("clicking the hero's Log ind navigates to the login page", async ({ page }) => {
  await openLanding(page);
  await page.locator(".fs-hero .fs-btn-quiet").click();
  await page.waitForURL(baseUrl + "/login.html");
  await expect(page.locator("#login-form")).toHaveCount(1);
});

test("the closing action writes to kontakt@lærlig.dk and points schools to /til-skoler", async ({ page }) => {
  await openLanding(page);
  const actions = page.locator(".fs-closing .fs-btn");
  expect(await actions.evaluateAll((els) => els.map((e) => e.getAttribute("href"))))
    .toEqual(["mailto:kontakt@lærlig.dk", "/til-skoler"]);
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

test("document language is Danish, and every public page is indexable", async ({ page }) => {
  await openLanding(page);
  expect(await page.locator("html").getAttribute("lang")).toBe("da");
  // Indexing is the default: the pages carry no robots directive at all.
  for (const route of ["/", ...PAGES.map(([r]) => r)]) {
    await page.goto(baseUrl + route, { waitUntil: "load" });
    await expect(page.locator('meta[name="robots"]'), `${route} still blocks indexing`).toHaveCount(0);
  }
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

test("every front-page action is keyboard reachable and shows a visible focus ring", async ({ page }) => {
  await openLanding(page);
  const actions = page.locator("main .fs-btn");
  expect(await actions.count()).toBe(4);
  for (let i = 0; i < 4; i++) {
    const a = actions.nth(i);
    await a.focus();
    await expect(a).toBeFocused();
    const outline = await a.evaluate((el) => {
      const s = getComputedStyle(el);
      return { width: s.outlineWidth, style: s.outlineStyle };
    });
    expect(outline.style).not.toBe("none");
    expect(parseFloat(outline.width)).toBeGreaterThanOrEqual(2);
  }
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
    await expect(page.locator(".fs-hero .fs-btn-primary")).toBeVisible();
    // Measured again once the avatar has mounted and the demo has played: both add content late.
    await page.waitForSelector("html[data-forside-ready]");
    const settled = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(settled, "the settled page must never scroll sideways").toBeLessThanOrEqual(1);
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

test("the hero is content-height and the next scene follows it directly", async ({ page }) => {
  // The hero-only page and its "under two screens" ceiling are gone by owner decision (Lærlig
  // 2.0). What stays is the original defect guard: no viewport-height floor on the hero, and no
  // empty band between it and what follows.
  await page.setViewportSize({ width: 1440, height: 900 });
  await openLanding(page);
  const m = await page.evaluate(() => {
    const hero = document.querySelector(".hero")!.getBoundingClientRect();
    const next = document.querySelector(".fs-premise")!.getBoundingClientRect();
    return { heroTop: hero.top, heroBottom: hero.bottom, nextTop: next.top, viewportH: window.innerHeight };
  });
  expect(m.heroTop, "the hero must start at the header's bottom edge").toBeLessThanOrEqual(72);
  expect(m.heroBottom, "the hero must not fill the whole first screen").toBeLessThan(m.viewportH);
  expect(Math.abs(m.nextTop - m.heroBottom), "an empty band opened up under the hero").toBeLessThan(2);
});

test("no scroll indicator remains — it would point at something already visible", async ({ page }) => {
  await openLanding(page);
  await expect(page.locator(".scroll-hint")).toHaveCount(0);
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

test("prefers-reduced-motion removes transitions, the button lift and the demo", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(baseUrl + "/", { waitUntil: "load" });

  const cta = page.locator(".fs-hero .fs-btn-primary");
  const durations = await cta.evaluate((el) =>
    getComputedStyle(el).transitionDuration.split(",").map((d) => parseFloat(d)));
  for (const d of durations) expect(d).toBeLessThanOrEqual(0.001);

  // The affordance survives as colour; only the movement is gone.
  await cta.hover();
  expect(await cta.evaluate((el) => getComputedStyle(el).transform)).toMatch(/none|matrix\(1, 0, 0, 1, 0, 0\)/);

  // The demo never plays: the finished moment is shown, still.
  await page.waitForSelector("html[data-forside-ready]");
  await expect(page.locator("[data-demo]")).not.toHaveClass(/is-playing/);
  await expect(page.locator("[data-demo-xp]")).toHaveText("314");

  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");
  await ctx.close();
});

test("without reduced motion the buttons keep their transition and the demo plays once", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "no-preference" });
  const page = await ctx.newPage();
  await page.goto(baseUrl + "/", { waitUntil: "load" });
  const durations = await page.locator(".fs-hero .fs-btn-primary").evaluate((el) =>
    getComputedStyle(el).transitionDuration.split(",").map((d) => parseFloat(d)));
  expect(Math.max(...durations)).toBeGreaterThan(0.05);
  // Rewound to before the answer, then played forward to the same finished state the markup ships.
  await expect(page.locator("[data-demo]")).toHaveClass(/is-playing/);
  await page.waitForSelector("html[data-forside-ready]");
  await expect(page.locator("[data-demo-xp]")).toHaveText("314");
  await expect(page.locator("[data-demo-coins]")).toHaveText("148");
  await expect(page.locator(".fs-next")).toHaveClass(/is-shown/);
  await ctx.close();
});
