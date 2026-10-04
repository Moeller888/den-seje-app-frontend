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
import * as crypto from "crypto";
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
// The eight information pages, in the routing table's order.
const PAGES: Array<[string, string]> = [
  ["/produktet", "Det svære kommer igen."],
  ["/saadan-virker-det", "Tre trin, hver gang."],
  ["/elev-og-laerer", "To sider af den samme time."],
  ["/for-eleven", "Eleven arbejder på sit eget niveau."],
  ["/for-laereren", "Hele klassen. Og den enkelte elev."],
  ["/til-skoler", "Læreren bestemmer."],
  ["/priser", "Prisen er ikke fastlagt endnu."],
  ["/om-laerlig", "Lærlig er i pilotdrift."],
];

// The two doors under the header (owner decision 2026-10-04), in order, and their own pages.
const DOORS = ["/for-eleven", "/for-laereren"];
// The four entries in the main menu. The door pages are reached through the doors; "Om Lærlig"
// and the /elev-og-laerer bridge are reached from the footer (and the bridge from the doors'
// pages' neighbourhood) — none of them is a menu entry. The same rule on desktop and on mobile.
const MENU = PAGES.map(([r]) => r).filter((r) => !["/om-laerlig", "/elev-og-laerer", ...DOORS].includes(r));

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
    "/for-eleven /for-eleven.html 200",
    "/for-laereren /for-laereren.html 200",
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

// THE FIGURE IS THE NORTH STAR v2 BRAND IMAGE (owner decision, 2026-10-04). It used to be the live
// R2 avatar mounted through mountC2Avatar. The front page now shows the approved North Star v2
// DESIGN reference (D-124) as Lærlig's visual identity, while the app's runtime keeps the R2 stack.
// Pinned here: both figures are exactly that file, byte-identical to the hash D-124 binds, and the
// front page no longer pulls in the runtime renderer or any R2 runtime asset.
const NORTH_STAR_V2 = "assets/avatar/reference/Northstar Master v2.png";
const NORTH_STAR_V2_SHA256 = "3daf32e76bff9a53ec7d25cf148a230073cfd0da6a003d02a23c4292d139ff50";

test("both figures on the front page are the approved North Star v2 — not the runtime avatar", async ({ page }) => {
  const sha = crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, NORTH_STAR_V2))).digest("hex");
  expect(sha, "the North Star v2 file is not the one D-124 approved").toBe(NORTH_STAR_V2_SHA256);

  const src = fs.readFileSync(path.join(ROOT, "js", "forside.js"), "utf8");
  expect(src, "the front page must not mount the runtime avatar").not.toMatch(/avatar-render-c2|mountC2Avatar/);

  const requested: string[] = [];
  page.on("request", (r: any) => requested.push(decodeURIComponent(new URL(r.url()).pathname)));
  await openLanding(page);
  await page.waitForSelector("html[data-forside-ready]");

  const figures = page.locator("[data-fs-figure] img");
  await expect(figures).toHaveCount(2);
  for (let i = 0; i < 2; i++) {
    const img = figures.nth(i);
    expect(decodeURIComponent(new URL(await img.evaluate((el: HTMLImageElement) => el.currentSrc)).pathname)).toBe("/" + NORTH_STAR_V2);
    expect(await img.evaluate((el: HTMLImageElement) => [el.naturalWidth, el.naturalHeight])).toEqual([1024, 1536]);
  }
  expect(requested.filter((p) => p.startsWith("/assets/avatar-r2/") || p.endsWith("/avatar-render-c2.js")),
    "the front page loaded the runtime avatar").toEqual([]);
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
  // Each door page marks its own door — in the band and in the mobile menu — and nothing else.
  for (const route of DOORS) {
    await page.goto(baseUrl + route, { waitUntil: "load" });
    const doorMarks = await page.locator('[aria-current="page"]').evaluateAll(
      (els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href")));
    expect(doorMarks, `${route} must mark its own door, twice`).toEqual([route, route]);
  }
  // Pages that are neither a menu entry nor a door mark nothing: the front page, /om-laerlig
  // (footer only) and the /elev-og-laerer bridge.
  for (const route of ["/", "/om-laerlig", "/elev-og-laerer"]) {
    await page.goto(baseUrl + route, { waitUntil: "load" });
    await expect(page.locator('[aria-current="page"]'), `${route} must not mark a menu entry`).toHaveCount(0);
  }
});

test("the desktop and mobile menus list exactly the same four pages", async ({ page }) => {
  for (const route of ["/", ...PAGES.map(([r]) => r)]) {
    await page.goto(baseUrl + route, { waitUntil: "load" });
    const desktop = await page.locator(".nav-desktop a").evaluateAll(
      (els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href")));
    const mobile = await page.locator("#nav-mobile > a").evaluateAll(
      (els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href")));
    expect(desktop, `${route}: menu drifted`).toEqual(MENU);
    expect(mobile, `${route}: the mobile menu differs from desktop`).toEqual(MENU);
    // The mobile menu leads with the two doors — the band has scrolled away by then.
    expect(await page.locator("#nav-mobile .nav-doors a").evaluateAll(
      (els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href")))).toEqual(DOORS);
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
      // The top chrome is the header plus the two doors directly under it.
      headerBottom: document.querySelector(".doors")!.getBoundingClientRect().bottom,
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

// ── the two doors: For eleven / For læreren ───────────────────────────────────────────────────
// Owner decision 2026-10-04: two separate, clearly different entrances directly under the header
// on every public page — not two more small menu links. Pinned: they are there on every page and
// at every width, side by side, visibly different surfaces, NOT sticky (the header that follows the
// reader stays one row), keyboard reachable with a visible ring, and they land on real anchors.

for (const [label, width] of [["desktop", 1440], ["tablet", 834], ["mobile", 390]] as const) {
  test(`the two doors sit side by side under the header at ${label} (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/", ...PAGES.map(([r]) => r)]) {
      await page.goto(baseUrl + route, { waitUntil: "load" });
      const m = await page.evaluate(() => {
        const box = (s: string) => document.querySelector(s)!.getBoundingClientRect();
        const bg = (s: string) => getComputedStyle(document.querySelector(s)!).backgroundColor;
        return {
          header: box(".site-header"), elev: box(".door-elev"), laerer: box(".door-laerer"),
          elevBg: bg(".door-elev"), laererBg: bg(".door-laerer"), vw: document.documentElement.clientWidth,
        };
      });
      expect(Math.abs(m.elev.top - m.header.bottom), `${route}: the doors must start at the header`).toBeLessThan(2);
      expect(m.elev.top, `${route}: the doors must share one row`).toBe(m.laerer.top);
      expect(m.elev.left).toBeLessThanOrEqual(0.5);
      expect(Math.abs(m.laerer.right - m.vw)).toBeLessThan(1);
      expect(Math.abs(m.elev.width - m.laerer.width), `${route}: the doors must be equal halves`).toBeLessThan(2);
      expect(m.elevBg, `${route}: the doors must be two different surfaces`).not.toBe(m.laererBg);
      // A band, not a hero of its own: it must stay well under two header heights.
      expect(m.elev.height, `${route}: the doors became heavy`).toBeLessThanOrEqual(120);
      await expect(page.locator(".door-elev .door-label")).toHaveText("For eleven");
      await expect(page.locator(".door-laerer .door-label")).toHaveText("For læreren");
    }
  });
}

test("the doors scroll away; the header alone stays — it never turns heavy", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openLanding(page);
  await page.evaluate(() => window.scrollTo(0, 1200));
  await expect(page.locator(".door-elev")).not.toBeInViewport();
  const h = await page.locator(".site-header").evaluate((el) => el.getBoundingClientRect());
  expect(h.top).toBe(0);
  expect(h.height).toBeLessThan(80);
});

test("each door leads to its own page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openLanding(page);
  await page.locator(".door-laerer").click();
  await page.waitForURL(baseUrl + "/for-laereren");
  await expect(page.locator("h1")).toHaveText("Hele klassen. Og den enkelte elev.");
  await page.goto(baseUrl + "/", { waitUntil: "load" });
  await page.locator(".door-elev").click();
  await page.waitForURL(baseUrl + "/for-eleven");
  await expect(page.locator("h1")).toHaveText("Eleven arbejder på sit eget niveau.");
});

test("the doors follow the header in tab order and show a visible focus ring", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openLanding(page);
  await page.locator(".login-link").focus();
  for (const cls of ["door-elev", "door-laerer"]) {
    await page.keyboard.press("Tab");
    const focused = page.locator(":focus");
    await expect(focused).toHaveClass(new RegExp(cls));
    const o = await focused.evaluate((el) => {
      const s = getComputedStyle(el);
      return { style: s.outlineStyle, width: parseFloat(s.outlineWidth), offset: parseFloat(s.outlineOffset) };
    });
    expect(o.style).not.toBe("none");
    expect(o.width).toBeGreaterThanOrEqual(2);
    // Drawn inside: the band is full-bleed, so an outside ring would be clipped at the edge.
    expect(o.offset).toBeLessThan(0);
  }
});

test("the doors' product cues are decoration, and step aside below 1080px", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openLanding(page);
  const cues = page.locator(".door-cue");
  await expect(cues).toHaveCount(2);
  for (let i = 0; i < 2; i++) await expect(cues.nth(i)).toHaveAttribute("aria-hidden", "true");
  await expect(cues.first()).toBeVisible();
  await page.setViewportSize({ width: 1000, height: 900 });
  await expect(cues.first()).toBeHidden();
  await expect(page.locator(".door-elev .door-line")).toBeVisible();
});

test("the mobile menu leads with both doors", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openLanding(page);
  await page.locator("#nav-toggle").click();
  const doors = page.locator("#nav-mobile .nav-doors a");
  await expect(doors).toHaveText(["For eleven", "For læreren"]);
  for (let i = 0; i < 2; i++) await expect(doors.nth(i)).toBeVisible();
});

test("a door marked current in the mobile menu keeps readable text on its own surface", async ({ page }) => {
  // Regression: the menu's generic current-page style once turned the teacher door's text white
  // on its light surface.
  await page.setViewportSize({ width: 390, height: 844 });
  const lum = (rgb: string) => { const [r, g, b] = (rgb.match(/\d+/g) || []).map(Number); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  for (const [route, sel] of [["/for-eleven", ".nav-door-elev"], ["/for-laereren", ".nav-door-laerer"]] as const) {
    await page.goto(baseUrl + route, { waitUntil: "load" });
    await page.locator("#nav-toggle").click();
    const door = page.locator(`#nav-mobile ${sel}`);
    await expect(door).toHaveAttribute("aria-current", "page");
    const c = await door.evaluate((el) => { const s = getComputedStyle(el); return [s.color, s.backgroundColor]; });
    expect(Math.abs(lum(c[0]) - lum(c[1])), `${route}: the current door's text is unreadable`).toBeGreaterThan(120);
  }
});

test("reduced motion: the door arrow does not slide, the hover colour remains", async ({ browser }) => {
  // The hover colour lives inside `@media (hover: hover)` on purpose, like every hover effect on
  // the site: a touch screen must not get a "sticky" hover. Some engines do not report a hover
  // device at all (Playwright's headless Firefox), so a live hover cannot prove the rule there.
  // The claim is therefore checked in two ways: the stylesheet itself, in every engine — the
  // hover colour exists under (hover: hover) and nothing under prefers-reduced-motion removes it —
  // and a real hover wherever the engine has a hover device.
  const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(baseUrl + "/", { waitUntil: "load" });

  const rules = await page.evaluate(() => {
    const out = { hoverColour: false, reducedTouchesColour: false };
    const walk = (list: CSSRuleList, media: string) => {
      for (const r of Array.from(list)) {
        if (r instanceof CSSMediaRule) { walk(r.cssRules, media + " " + r.conditionText); continue; }
        if (!(r instanceof CSSStyleRule)) continue;
        if (!/\.door-elev:hover\b/.test(r.selectorText)) continue;
        const bg = r.style.getPropertyValue("background-color") || r.style.getPropertyValue("background");
        if (/hover:\s*hover/.test(media) && bg) out.hoverColour = true;
        if (/prefers-reduced-motion/.test(media) && bg) out.reducedTouchesColour = true;
      }
    };
    for (const sheet of Array.from(document.styleSheets)) {
      if ((sheet.href || "").endsWith("/css/landing.css")) walk(sheet.cssRules, "");
    }
    return out;
  });
  expect(rules.hoverColour, "the student door has no hover colour for hover devices").toBe(true);
  expect(rules.reducedTouchesColour, "reduced motion must not remove the hover colour").toBe(false);

  const hoverDevice = await page.evaluate(() => window.matchMedia("(hover: hover)").matches);
  const before = await page.locator(".door-elev").evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.locator(".door-elev").hover();
  if (hoverDevice) {
    await expect.poll(() => page.locator(".door-elev").evaluate((el) => getComputedStyle(el).backgroundColor))
      .not.toBe(before);
  }
  expect(await page.locator(".door-elev .door-arrow").evaluate((el) => getComputedStyle(el).transform)).toBe("none");
  await ctx.close();
});

// ── the two perspective pages and the bridge ──────────────────────────────────────────────────
// Owner decision 2026-10-04: /for-eleven and /for-laereren are real pages with a story each, not
// copies of /elev-og-laerer, which stays — no redirect — as a short bridge between them. The pages
// are related but have their own character: the student page opens on the app's dark surface,
// the teacher page on the light desk.

const bg = (page: any, sel: string) => page.locator(sel).evaluate((el: Element) => getComputedStyle(el).backgroundColor);
const luminance = (rgb: string) => {
  const [r, g, b] = (rgb.match(/\d+/g) || []).map(Number);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

test("/for-eleven tells the student's story, on the student's dark surface", async ({ page }) => {
  await page.goto(baseUrl + "/for-eleven", { waitUntil: "load" });
  expect(luminance(await bg(page, ".pv-hero")), "the student page must open dark").toBeLessThan(60);
  const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  for (const must of [
    "Lærlig tilpasser næste skridt til den enkelte elev.",
    "Egne opgaver. Ét skridt ad gangen.",
    "Et forkert svar skal hjælpe eleven videre — ikke bare give et rødt kryds.",
    "Det svære kommer igen.",
    "Fremgang, man kan se.",
    "XP", "mønter", "figur",
  ]) expect(text, `/for-eleven is missing: ${must}`).toContain(must);
  expect(text.toLowerCase()).not.toContain("spørgsmål");
  // The product slice shows a wrong answer and what comes next — the moment the front page does not.
  await expect(page.locator(".pv-hero .fs-options li.is-wrong")).toHaveCount(1);
  await expect(page.locator(".pv-hero .pv-next-again")).toContainText("Den kommer igen");
  await expect(page.locator('main a[href="/for-laereren"]').first()).toBeVisible();
});

test("/for-eleven shows the North Star v2 brand figure, says so, and loads no runtime avatar", async ({ page }) => {
  const requested: string[] = [];
  page.on("request", (r: any) => requested.push(decodeURIComponent(new URL(r.url()).pathname)));
  await page.goto(baseUrl + "/for-eleven", { waitUntil: "load" });
  const figures = page.locator("[data-fs-figure] img");
  await expect(figures).toHaveCount(2);
  for (let i = 0; i < 2; i++) {
    expect(decodeURIComponent(new URL(await figures.nth(i).evaluate((el: HTMLImageElement) => el.currentSrc || el.src)).pathname))
      .toBe("/" + NORTH_STAR_V2);
  }
  // Honest about what it is: the brand figure, not the student's own.
  await expect(page.locator(".pv-figure-note")).toContainText("Lærligs figur. I appen former eleven sin egen.");
  expect(requested.filter((p) => p.startsWith("/assets/avatar-r2/") || p.endsWith("/avatar-render-c2.js"))).toEqual([]);
});

test("/for-laereren tells the teacher's story, on the light desk", async ({ page }) => {
  await page.goto(baseUrl + "/for-laereren", { waitUntil: "load" });
  expect(luminance(await bg(page, ".pv-hero")), "the teacher page must open light").toBeGreaterThan(200);
  const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  for (const must of [
    "Klasseoversigt", "Brug for hjælp", "Fremgang",
    "Du kan se, hvem der har brug for dig i dag.",
    "Lange, skrevne svar lander hos dig.",
    "1 – Afvist", "4 – Perfekt",
    "Læreren bestemmer.",
    "Du vælger emnerne.",
    "Ét klasseværelse. Mange forskellige næste skridt.",
  ]) expect(text, `/for-laereren is missing: ${must}`).toContain(must);
  expect(text.toLowerCase()).not.toContain("spørgsmål");
  // No imagery on the teacher page: the desk is drawn, not photographed.
  await expect(page.locator("main img")).toHaveCount(0);
  await expect(page.locator('main a[href="/for-eleven"]').first()).toBeVisible();
  await expect(page.locator('main a[href="mailto:kontakt@lærlig.dk"]')).toHaveCount(1);
});

test("/elev-og-laerer is a short bridge: the name, two doors onward, no copied sections", async ({ page }) => {
  await page.goto(baseUrl + "/elev-og-laerer", { waitUntil: "load" });
  await expect(page.locator(".dict-quote")).toHaveCount(1);
  const doors = page.locator(".pv-bridge-door");
  await expect(doors).toHaveCount(2);
  expect(await doors.evaluateAll((els) => els.map((e) => e.getAttribute("href")))).toEqual(DOORS);
  for (const gone of [".split", ".ticks", ".pv-sheets", ".pv-roster"]) {
    await expect(page.locator(gone), `${gone} is copied onto the bridge`).toHaveCount(0);
  }
  // Short: the whole page, footer aside, is not a long read.
  const words = (await page.locator("main").innerText()).split(/\s+/).filter(Boolean).length;
  expect(words, "the bridge page grew into a page of its own").toBeLessThan(120);
  // Old links to the two halves still land: the anchors now sit on the two doors.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseUrl + "/elev-og-laerer#for-laereren", { waitUntil: "load" });
  await expect(page.locator("#for-laereren")).toBeInViewport();
  await page.locator("#for-laereren").click();
  await page.waitForURL(baseUrl + "/for-laereren");
});

for (const route of ["/for-eleven", "/for-laereren", "/elev-og-laerer"]) {
  for (const [label, width] of [["desktop", 1440], ["tablet", 834], ["mobile", 390]] as const) {
    test(`${route} has no horizontal overflow at ${label} (${width}px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(baseUrl + route, { waitUntil: "load" });
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${route} scrolls sideways at ${width}px`).toBeLessThanOrEqual(1);
      await expect(page.locator("h1")).toBeInViewport();
    });
  }
}

test("every action on the perspective pages meets 44x44 and shows a focus ring", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const route of ["/for-eleven", "/for-laereren", "/elev-og-laerer"]) {
    await page.goto(baseUrl + route, { waitUntil: "load" });
    const actions = page.locator("main a");
    const n = await actions.count();
    for (let i = 0; i < n; i++) {
      const a = actions.nth(i);
      if (!(await a.isVisible())) continue;
      if (await a.evaluate((el) => !!el.closest(".dict-source"))) continue;   // an inline citation link
      const box = (await a.boundingBox())!;
      expect(box.height >= 44 && box.width >= 44, `${route}: ${await a.innerText()} is too small`).toBe(true);
      await a.focus();
      const o = await a.evaluate((el) => getComputedStyle(el).outlineStyle);
      expect(o, `${route}: ${await a.innerText()} has no focus ring`).not.toBe("none");
    }
  }
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

// On a phone the figure belongs to the product (owner review 2026-10-04). It used to stand alone in
// a band between the actions and the product, so the hero read "actions → a loose figure → then the
// product". Pinned: the product starts right under the actions, and the figure stands beside it —
// its whole height inside the product's vertical span, touching the product's left edge.
for (const width of [320, 390, 430]) {
  test(`at ${width}px the figure stands with the product, which starts right under the actions`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await openLanding(page);
    await page.waitForSelector("html[data-forside-ready]");
    const m = await page.evaluate(() => {
      const r = (s: string) => document.querySelector(s)!.getBoundingClientRect();
      return { actions: r(".fs-hero .fs-actions"), shell: r(".fs-hero .fs-shell"), next: r(".fs-hero .fs-next"),
               fig: r(".fs-hero .fs-avatar-hero"),
               overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    expect(m.shell.top - m.actions.bottom, "an empty band opened between the actions and the product").toBeLessThan(80);
    expect(m.fig.top, "the figure stands above the product, on its own").toBeGreaterThanOrEqual(m.shell.top);
    expect(m.fig.bottom, "the figure hangs below the product").toBeLessThanOrEqual(m.next.bottom + 2);
    expect(m.fig.right, "the figure does not reach the product").toBeGreaterThan(m.shell.left);
    expect(m.overflow).toBeLessThanOrEqual(1);
  });
}

// ── the hero sits directly under the header ───────────────────────────────────────────────────
// Regression guard. The hero used to be `min-height: 100svh` + `align-items: center` on a section
// that starts BELOW the sticky header, so the viewport height was counted twice and the leftover
// space was split above the content. That left a dead band under the header which GREW with the
// window — 155px at 800px tall, 294px at 1080px. The measurement below is taken at several heights
// precisely because a fixed-height-only check would not have caught it.
for (const [w, h] of [[1280, 800], [1440, 900], [1920, 1080], [1536, 864]] as const) {
  test(`the eyebrow sits 27-37px under the doors at ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await openLanding(page);

    const m = await page.evaluate(() => {
      const r = (s: string) => {
        const el = document.querySelector(s);
        return el ? el.getBoundingClientRect() : null;
      };
      // Measured from the bottom of the top chrome: the header plus the two doors directly under
      // it (owner decision 2026-10-04). The doors are content, not a spacer; what this guards is
      // the dead band between the last of them and the hero's first line.
      const header = r(".site-header");
      const doors = r(".doors");
      const eyebrow = r(".hero .eyebrow");
      return header && doors && eyebrow ? { headerBottom: doors.bottom, headerH: header.height, eyebrowTop: eyebrow.top } : null;
    });

    expect(m, "header or eyebrow missing").not.toBeNull();
    expect(m!.headerH, "the header must be visible and occupy real height").toBeGreaterThan(40);

    const gap = m!.eyebrowTop - m!.headerBottom;
    // 32px (owner decision 2026-10-04: less air between the doors and the hero, so the hero keeps
    // its first viewport). The band is still held tight: the regression this guards grew with
    // the window height, which is why it is measured at several.
    expect(gap, `gap under the doors was ${Math.round(gap)}px`).toBeGreaterThanOrEqual(27);
    expect(gap, `gap under the doors was ${Math.round(gap)}px`).toBeLessThanOrEqual(37);
  });
}

// THE FIRST-VIEWPORT CONTRACT (owner decision 2026-10-04). This replaces an older assertion that
// the whole hero must end above 900px at 1440×900 — a historical pixel ceiling from the hero-only
// page, which the Lærlig 2.0 hero had already outgrown before the doors arrived. What the owner
// asked for instead is the UX rule itself: at a normal desktop size the FIRST viewport is a
// finished hero — header, both doors, the whole headline, the primary action and a meaningful part
// of the product — not "navigation plus the start of a hero". Asserted on the layout directly.
for (const [w, h] of [[1440, 900], [1280, 800]] as const) {
  test(`the first viewport at ${w}x${h} is a finished hero — header, doors, headline, action, product`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await openLanding(page);
    await page.waitForSelector("html[data-forside-ready]");
    const m = await page.evaluate(() => {
      const r = (s: string) => document.querySelector(s)!.getBoundingClientRect();
      const hero = document.querySelector(".hero")!;
      const h1 = document.querySelector(".fs-hero h1")!;
      const cs = getComputedStyle(hero);
      return {
        vh: window.innerHeight,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        header: r(".site-header"), doors: r(".doors"), hero: r(".hero"), next: r(".fs-premise"),
        h1: r(".fs-hero h1"), h1Lines: Math.round(r(".fs-hero h1").height / parseFloat(getComputedStyle(h1).lineHeight)),
        cta: r(".fs-hero .fs-btn-primary"), shell: r(".fs-shell"), card: r(".fs-card"),
        heroMinHeight: cs.minHeight,
        heroContent: r(".fs-hero-grid").height + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom),
      };
    });
    // The order of the top of the page: header, then the doors, then the hero — nothing between.
    expect(m.header.top).toBe(0);
    expect(Math.abs(m.doors.top - m.header.bottom), "the doors must follow the header").toBeLessThan(2);
    expect(Math.abs(m.hero.top - m.doors.bottom), "the hero must follow the doors").toBeLessThan(2);
    // The headline is whole, inside the first viewport, and not broken into a tower of lines.
    expect(m.h1.top).toBeGreaterThanOrEqual(m.doors.bottom);
    expect(m.h1.bottom, "the headline is cut off by the fold").toBeLessThanOrEqual(m.vh);
    expect(m.h1Lines, "the headline falls over too many lines").toBeLessThanOrEqual(4);
    // The primary action is fully visible.
    expect(m.cta.bottom, "the primary action is below the fold").toBeLessThanOrEqual(m.vh);
    // A meaningful part of the product: the app shell has started, and the task card — the task
    // and the answer feedback — is whole inside the first viewport.
    expect(m.shell.top).toBeLessThan(m.vh);
    expect(m.card.bottom, "the product's task card is below the fold").toBeLessThanOrEqual(m.vh);
    // No viewport-locked height: the hero is exactly as tall as its content, and nothing opens up
    // under it.
    expect(["0px", "auto"]).toContain(m.heroMinHeight);
    expect(Math.abs(m.hero.height - m.heroContent), "the hero is taller than its content").toBeLessThan(2);
    expect(Math.abs(m.next.top - m.hero.bottom), "an empty band opened up under the hero").toBeLessThan(2);
    expect(m.overflow, "the page scrolls sideways").toBeLessThanOrEqual(1);
  });
}

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
  await expect(page.locator("[data-demo-xp]")).toHaveText("322");

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
  await expect(page.locator("[data-demo-xp]")).toHaveText("322");
  await expect(page.locator("[data-demo-coins]")).toHaveText("148");
  await expect(page.locator(".fs-next")).toHaveClass(/is-shown/);
  await ctx.close();
});

// The hero demo shows a real moment, so its numbers are held to their sources rather than to
// literals. The reward is the SERVER's for a FIRST correct answer — the last migration that
// (re)defines process_question_attempt, its non-repeat branch (`v_xp := N; v_coins := M;`; the
// repeat branch sets XP alone). js/progression.js's MC_CORRECT constants are stale and are not the
// source. The bar is the quiz's own level math, getXPProgressInLevel, run in the page itself.
test("the hero demo's reward and XP bar match the server reward and the quiz's level math", async ({ page }) => {
  const dir = path.join(ROOT, "supabase", "migrations");
  const defining = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()
    .filter((f) => fs.readFileSync(path.join(dir, f), "utf8").includes("FUNCTION public.process_question_attempt"));
  expect(defining.length, "no migration defines process_question_attempt").toBeGreaterThan(0);
  const sql = fs.readFileSync(path.join(dir, defining[defining.length - 1]), "utf8");
  const m = sql.match(/v_xp\s*:=\s*(\d+);\s*v_coins\s*:=\s*(\d+);/);
  expect(m, "the first-correct reward branch was not found").not.toBeNull();
  const [xpReward, coinReward] = [Number(m![1]), Number(m![2])];

  await openLanding(page);
  await page.waitForSelector("html[data-forside-ready]");
  await expect(page.locator(".fs-gain-xp")).toHaveText(`+${xpReward} XP`);
  await expect(page.locator(".fs-gain-coin")).toHaveText(`+${coinReward} mønter`);

  // The finished state is 322 XP. The bar must be exactly what the quiz would draw for it, the
  // level must not change, and the start values the demo rewinds to must be end minus reward.
  const endXp = Number(await page.locator("[data-demo-xp]").innerText());
  const endCoins = Number(await page.locator("[data-demo-coins]").innerText());
  const shown = await page.locator("[data-demo-xpbar]").evaluate((el) => (el as HTMLElement).style.getPropertyValue("--p").trim());
  const math = await page.evaluate(async ([end, reward]) => {
    const p = await import("/js/progression.js");
    return { after: p.getXPProgressInLevel(end), before: p.getXPProgressInLevel(end - reward) };
  }, [endXp, xpReward]);
  expect(math.after.level, "the demo must not cross a level").toBe(math.before.level);
  expect(Number(shown)).toBeCloseTo(math.after.progress, 3);
  const src = fs.readFileSync(path.join(ROOT, "js", "forside.js"), "utf8");
  expect(src).toContain(`xp.textContent = "${endXp - xpReward}"`);
  expect(src).toContain(`coins.textContent = "${endCoins - coinReward}"`);
  expect(src).toContain(`bar.style.setProperty("--p", ".${Math.round(math.before.progress * 1000)}")`);
  expect(Number((await page.locator(".fs-hero .fs-level b").innerText()).trim())).toBe(math.after.level);
});

// ── the hero demo waits for a visible page ────────────────────────────────────────────────────
// A front page opened in a background tab must not play its demo unseen. Playwright cannot hide a
// page for real, so this init script owns `document.visibilityState` / `document.hidden` (read
// from window.__fsVis) and dispatches `visibilitychange` on demand, exactly as a browser does on a
// tab switch. A MutationObserver records every value written into the demo's XP counter: the
// rewind writes "312" once, and each PLAY writes "322" once — so a second start is countable.
function visibilityShim(initial: string) {
  (window as any).__fsVis = initial;
  Object.defineProperty(Document.prototype, "visibilityState", { configurable: true, get() { return (window as any).__fsVis; } });
  Object.defineProperty(Document.prototype, "hidden", { configurable: true, get() { return (window as any).__fsVis === "hidden"; } });
  (window as any).__fsXp = [];
  new MutationObserver((records) => {
    for (const r of records) {
      const t = r.target as Element;
      if (t && t.nodeType === 1 && t.hasAttribute("data-demo-xp")) (window as any).__fsXp.push(t.textContent);
    }
  }).observe(document, { childList: true, subtree: true });
  (window as any).__fsSetVis = (v: string) => { (window as any).__fsVis = v; document.dispatchEvent(new Event("visibilitychange")); };
}

// After the single rewind to 312, exactly one play writes 322 — no more, no fewer.
async function expectPlayedOnce(page: any) {
  const seq: string[] = await page.evaluate(() => (window as any).__fsXp);
  expect(seq.filter((v) => v === "312"), `rewound more than once: ${seq}`).toHaveLength(1);
  expect(seq.slice(seq.indexOf("312") + 1), `played more or less than once: ${seq}`).toEqual(["322"]);
}

async function expectFinishedDemo(page: any) {
  await expect(page.locator("[data-demo-xp]")).toHaveText("322");
  await expect(page.locator("[data-demo-coins]")).toHaveText("148");
  await expect(page.locator(".fs-gain-xp")).toHaveText("+10 XP");
  await expect(page.locator(".fs-gain-coin")).toHaveText("+5 mønter");
  expect(await page.locator("[data-demo-xpbar]").evaluate((el: HTMLElement) => el.style.getPropertyValue("--p").trim())).toBe(".776");
  // The visible outcome, not a class: with reduced motion the demo never plays, so "Næste skridt"
  // is shown by the markup itself and never receives is-shown.
  await expect(page.locator(".fs-next")).toHaveCSS("opacity", "1");
}

test("a visible page plays the hero demo at once, and only once", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "no-preference" });
  const page = await ctx.newPage();
  await page.addInitScript(visibilityShim, "visible");
  await page.goto(baseUrl + "/", { waitUntil: "load" });
  // No visibility event is ever sent: a page that is already visible must not wait for one.
  await page.waitForSelector("html[data-forside-ready]", { timeout: 8000 });
  await expectFinishedDemo(page);
  await expectPlayedOnce(page);
  await ctx.close();
});

test("a page opened in a background tab rewinds, waits, and plays once when first shown", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "no-preference" });
  const page = await ctx.newPage();
  await page.addInitScript(visibilityShim, "hidden");
  await page.goto(baseUrl + "/", { waitUntil: "load" });

  // Hidden for longer than the whole demo takes (2.9s): it must still sit at its start.
  await page.waitForTimeout(3500);
  await expect(page.locator("[data-demo]")).toHaveClass(/is-playing/);
  await expect(page.locator("[data-demo-xp]")).toHaveText("312");
  await expect(page.locator("[data-demo-coins]")).toHaveText("143");
  await expect(page.locator("[data-demo-pick]")).not.toHaveClass(/is-picked/);
  await expect(page.locator(".fs-next")).not.toHaveClass(/is-shown/);
  await expect(page.locator("html[data-forside-ready]"), "the page cannot be settled before the demo has played").toHaveCount(0);

  // A visibility event that leaves the page hidden changes nothing.
  await page.evaluate(() => (window as any).__fsSetVis("hidden"));
  await page.waitForTimeout(1200);
  await expect(page.locator("[data-demo-pick]")).not.toHaveClass(/is-picked/);

  // First shown → it plays, to the same finished values.
  await page.evaluate(() => (window as any).__fsSetVis("visible"));
  await page.waitForSelector("html[data-forside-ready]", { timeout: 8000 });
  await expectFinishedDemo(page);

  // Switching away and back, repeatedly, never starts it again.
  await page.evaluate(() => { const w = window as any; w.__fsSetVis("hidden"); w.__fsSetVis("visible"); w.__fsSetVis("hidden"); w.__fsSetVis("visible"); });
  await expect(page.locator("[data-demo-xp]"), "a second start would rewind to 312").toHaveText("322");
  await page.waitForTimeout(3500);
  await expectFinishedDemo(page);
  await expectPlayedOnce(page);
  await ctx.close();
});

test("reduced motion: a hidden page neither rewinds nor plays the demo when shown", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.addInitScript(visibilityShim, "hidden");
  await page.goto(baseUrl + "/", { waitUntil: "load" });
  await page.evaluate(() => (window as any).__fsSetVis("visible"));
  await page.waitForSelector("html[data-forside-ready]", { timeout: 8000 });
  await page.waitForTimeout(3500);
  await expect(page.locator("[data-demo]")).not.toHaveClass(/is-playing/);
  await expectFinishedDemo(page);
  expect(await page.evaluate(() => (window as any).__fsXp), "reduced motion must never rewind").not.toContain("312");
  await ctx.close();
});
