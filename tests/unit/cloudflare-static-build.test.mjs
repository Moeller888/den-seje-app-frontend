// The Cloudflare Static Assets build: what ships, and — mostly — what must never ship.
// ---------------------------------------------------------------------------------------------
// The frontend lives in the repository ROOT, beside `.env`, `.env.local`, `KUN TIL MIG.txt`, the
// `docs/` decision register, `tests/`, `tools/`, `supabase/` and 1,025 tracked files under
// `node_modules/`. `wrangler deploy --assets .` would publish all of it. These tests are the
// standing proof that the allowlist build does not.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, lstatSync, readdirSync, mkdtempSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, sep } from "node:path";
import {
  build, validateOutput, notFoundHtml, REDIRECT_RULES, ROUTE_TO_FILE,
  PUBLIC_HTML, INTERNAL_HTML,
  RUNTIME_HTML, ROOT_FILES, MANDATORY, FORBIDDEN_DIRS, FORBIDDEN_STRINGS, KNOWN_STRING_EXCEPTIONS,
  ASSET_DIRS, SITE_ORIGIN, PUBLIC_ROUTES, SITEMAP_FILE, SITEMAP_XMLNS,
  FILE_TO_ROUTE, canonicalUrlFor, canonicalLinksIn, validateCanonicals,
  sitemapUrls, sitemapXml, validateSitemap, xmlEscape, xmlUnescape,
} from "../../tools/cloudflare-build-static.mjs";

// The public website's pages, in menu order. Used by several assertions below.
const PUBLIC_PAGES = ["produktet.html", "saadan-virker-det.html", "elev-og-laerer.html",
                      "til-skoler.html", "priser.html", "om-laerlig.html"];

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const toPosix = (p) => p.split(sep).join("/");

// One build, shared by every assertion below.
const result = build({ quiet: true });
const OUT = result.outDir;
const outFiles = new Set(result.files);
const read = (rel) => readFileSync(join(OUT, rel), "utf8");
const has = (rel) => outFiles.has(rel);

// ── what must be there ────────────────────────────────────────────────────────────────────────
test("index.html is in the output", () => assert.ok(has("index.html")));

test("login.html is in the output — it is the active entry page for every role", () => {
  assert.ok(has("login.html"));
  assert.match(read("login.html"), /<html/i);
});

// ── the public landing page ───────────────────────────────────────────────────────────────────
// `/` rewrites to landing.html, so the page and its stylesheet are load-bearing: if either is
// missing the site's front door is a 404 or an unstyled document.
test("landing.html and css/landing.css ship — they are what `/` resolves to", () => {
  assert.ok(has("landing.html"), "the root rewrite target must exist");
  assert.ok(has("css/landing.css"), "the landing page would render unstyled");
  assert.ok(has("js/landing.js"), "the header and mobile menu would be inert");
});

test("the landing page's call to action points at login.html, not at the quiz", () => {
  const t = read("landing.html");
  assert.match(t, /href="login\.html"/, "the CTA must enter through the shared login page");
  // index.html bounces an anonymous visitor straight back to login after painting the quiz shell.
  assert.ok(!/href="index\.html"/.test(t), "the landing page must never link into the quiz directly");
  assert.ok(has("login.html"), "the CTA would otherwise land on a 404");
});

test("the landing page is indexable — no robots meta at all", () => {
  // Indexing is the default, so the page carries no robots tag rather than an "index, follow"
  // one. The check is for ABSENCE: a stray noindex here would quietly delist the front page.
  assert.ok(!/name="robots"/i.test(read("landing.html")),
    "the front page must not carry a robots meta tag");
});

test("the landing page contacts no third party — no external host, no webfont, no tracker", () => {
  for (const f of ["landing.html", "css/landing.css", "js/landing.js"]) {
    const t = read(f);
    // The site's OWN canonical URL is the single permitted absolute address, and only in a
    // <link rel="canonical">. It is metadata, not a load: no browser ever fetches it, so it
    // cannot contact a third party — which is the rule this test exists to enforce. Everything
    // else, including any other absolute URL in the same tag, still fails here.
    const withoutCanonical = t.replace(/<link\b[^>]*rel="canonical"[^>]*>/gi, "");
    assert.ok(!/https?:\/\//i.test(withoutCanonical), `${f} references an external URL`);
    assert.ok(!/\/\/(?:fonts|cdn|unpkg|jsdelivr)\./i.test(t), `${f} references a CDN`);
    assert.ok(!/@import\s+url\(/i.test(t), `${f} pulls in a remote stylesheet`);
    assert.ok(!/\b(fetch|XMLHttpRequest|navigator\.sendBeacon)\s*\(/.test(t), `${f} makes a request`);
  }
});

test("the landing page ships no avatar or product imagery — none is approved yet", () => {
  const t = read("landing.html");
  assert.ok(!/<img\b/i.test(t), "no <img> may ship until real product screenshots are approved");
  assert.ok(!/assets\/avatar/i.test(t), "avatar assets must not be used as marketing visuals");
});

test("every mandatory runtime file is present", () => {
  for (const m of MANDATORY) assert.ok(existsSync(join(OUT, m)), `missing ${m}`);
});

test("all 21 runtime HTML pages are copied", () => {
  assert.equal(RUNTIME_HTML.length, 21);
  for (const p of RUNTIME_HTML) assert.ok(has(p), `missing ${p}`);
});

test("the role-routing and password-recovery targets ship — js/login.js sends users to them", () => {
  const login = read("js/login.js");
  assert.match(login, /teacher\.html/);
  assert.match(login, /reset-password\.html/);
  assert.ok(has("teacher.html"), "teachers would land on a 404 after login");
  assert.ok(has("reset-password.html"), "password recovery would land on a 404");
});

test("the root entry files and css/theme.css are copied", () => {
  for (const f of [...ROOT_FILES, "css/theme.css"]) assert.ok(has(f), `missing ${f}`);
});

test("the required JS and asset trees are copied", () => {
  const js = result.files.filter((f) => f.startsWith("js/"));
  const assets = result.files.filter((f) => f.startsWith("assets/"));
  assert.ok(js.length >= 70, `expected the js/ tree, got ${js.length}`);
  assert.ok(assets.length >= 70, `expected the assets/ tree, got ${assets.length}`);
  assert.ok(has("js/supabase.js"), "the shared Supabase client must ship");
});

test("every local HTML reference resolves — directly, or through a declared clean route", () => {
  const missing = [];
  for (const page of [...RUNTIME_HTML, "docs.html", "404.html"]) {
    const html = read(page);
    for (const m of html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
      const raw = m[1].trim();
      if (!raw || /^(https?:|data:|mailto:|javascript:|#|\/\/)/i.test(raw)) continue;
      if (raw.includes("${")) continue;                       // template literal, resolved at runtime
      const path = raw.split(/[?#]/)[0];
      if (!path) continue;
      // A clean route is a real destination: the Worker rewrites it to a file that must ship.
      if (Object.prototype.hasOwnProperty.call(ROUTE_TO_FILE, path)) {
        if (!has(ROUTE_TO_FILE[path])) missing.push(`${page} -> ${path} (route target ${ROUTE_TO_FILE[path]})`);
        continue;
      }
      const rel = path.replace(/^\.?\//, "");
      if (!rel || rel.endsWith("/")) continue;
      if (!has(rel)) missing.push(`${page} -> ${raw}`);
    }
  }
  assert.deepEqual(missing, [], "referenced files or routes absent from the output");
});

// ── the multipage public website ──────────────────────────────────────────────────────────────
test("all six information pages ship", () => {
  for (const p of PUBLIC_PAGES) assert.ok(has(p), `missing ${p}`);
});

test("every clean route rewrites to a page that actually shipped", () => {
  for (const [route, file] of Object.entries(ROUTE_TO_FILE)) {
    assert.ok(has(file), `${route} rewrites to ${file}, which is not in the output`);
  }
});

test("the front page is SHORT — the long sections were moved out, not hidden", () => {
  const home = read("landing.html");
  // Checked on STRUCTURE, not on prose: the overview cards legitimately quote a page's heading
  // as a teaser, so a substring search would flag its own link text. What must be gone is the
  // section content itself — the card grids, the step list and the two-column split.
  for (const markup of ['class="cards"', 'class="cards cards-tight"', 'class="steps"',
                        'class="split"', 'class="ticks"', 'class="card"', 'class="step"']) {
    assert.ok(!home.includes(markup), `front page still carries section markup: ${markup}`);
  }
  assert.ok(!/id="(produktet|saadan-virker-det|elev-og-laerer|til-skoler|priser|om)"/.test(home),
    "front page still has the old in-page section anchors");
  assert.ok(!/display:\s*none/i.test(home), "a moved section must not merely be hidden");
  assert.ok(!/\bhidden\b(?![-\w])/.test(home.replace(/id="nav-mobile"[^>]*>/, "")) ||
            home.includes('id="nav-mobile"'), "no section may be hidden rather than moved");

  // And each moved section must now exist on its own page.
  assert.ok(read("produktet.html").includes('class="cards"'), "the product cards did not arrive");
  assert.ok(read("saadan-virker-det.html").includes('class="steps"'), "the steps did not arrive");
  assert.ok(read("elev-og-laerer.html").includes('class="split"'), "the split did not arrive");
  assert.ok(read("til-skoler.html").includes('class="cards cards-tight"'), "the principles did not arrive");
});

test("the front page stays lean — well under the old one-pager", () => {
  const home = read("landing.html");
  const sections = (home.match(/<section\b/g) || []).length;
  assert.ok(sections <= 4, `front page has ${sections} sections; it should be hero + overview + CTA`);
});

test("each information page carries exactly one h1 and its own title and description", () => {
  const titles = new Set(), descriptions = new Set();
  for (const p of ["landing.html", ...PUBLIC_PAGES]) {
    const t = read(p);
    assert.equal((t.match(/<h1[\s>]/g) || []).length, 1, `${p} must have exactly one <h1>`);
    const title = (t.match(/<title>([^<]+)<\/title>/) || [])[1];
    // The attribute may be wrapped onto the next line — match across whitespace.
    const desc = (t.match(/<meta name="description"\s+content="([^"]+)"/) || [])[1];
    assert.ok(title, `${p} has no <title>`);
    assert.ok(desc, `${p} has no meta description`);
    assert.ok(!titles.has(title), `${p} reuses the title "${title}"`);
    assert.ok(!descriptions.has(desc), `${p} reuses another page's description`);
    titles.add(title); descriptions.add(desc);
  }
});

test("the navigation is identical on every public page, and marks the current one", () => {
  const navOf = (html, sel) => (html.match(new RegExp(`<nav class="${sel}"[\\s\\S]*?</nav>`)) || [])[0] || "";
  const strip = (s) => s.replace(/\s+aria-current="page"/g, "");

  const baseDesktop = strip(navOf(read("landing.html"), "nav-desktop"));
  const baseMobile = strip(navOf(read("landing.html"), "nav-mobile"));
  assert.ok(baseDesktop.length > 0 && baseMobile.length > 0, "the front page has no navigation");

  for (const p of PUBLIC_PAGES) {
    const html = read(p);
    assert.equal(strip(navOf(html, "nav-desktop")), baseDesktop, `${p} desktop nav differs`);
    assert.equal(strip(navOf(html, "nav-mobile")), baseMobile, `${p} mobile nav differs`);

    // ONE consistent rule: the main navigation is the same five entries on desktop and mobile.
    // "Om Lærlig" lives in the footer only, so — like the front page — it is not a menu entry
    // and marks nothing. The five that are menu entries mark themselves twice, once per nav.
    const expected = p === "om-laerlig.html" ? 0 : 2;
    assert.equal((html.match(/aria-current="page"/g) || []).length, expected,
      `${p} must mark its own entry current in every nav that contains it`);

    // Whatever the count, the marks must sit on the link that points at this page.
    const route = "/" + p.replace(/\.html$/, "");
    for (const m of html.matchAll(/<a href="([^"]+)"\s+aria-current="page"/g)) {
      assert.equal(m[1], route, `${p} marks ${m[1]} current instead of ${route}`);
    }
  }
  // The front page marks nothing: it is not one of the menu entries.
  assert.ok(!read("landing.html").includes('aria-current="page"'),
    "the front page is not a menu entry and must not mark one current");

  // The desktop and mobile menus must carry exactly the same entries — the asymmetry where
  // "Om Lærlig" appeared on mobile only is what this pins shut.
  for (const p of ["landing.html", ...PUBLIC_PAGES]) {
    const html = read(p);
    const hrefs = (nav) => [...(navOf(html, nav).matchAll(/href="([^"]+)"/g))].map((m) => m[1]);
    assert.deepEqual(hrefs("nav-mobile"), hrefs("nav-desktop"),
      `${p}: the mobile menu must list the same pages as the desktop menu`);
    assert.equal(hrefs("nav-desktop").length, 5, `${p}: the main menu should stay five entries`);
    assert.ok(!hrefs("nav-desktop").includes("/om-laerlig"),
      `${p}: "Om Lærlig" belongs in the footer, not the main menu`);
    assert.ok(html.includes('<a href="/om-laerlig">Om Lærlig</a>'),
      `${p}: "Om Lærlig" must still be reachable from the footer`);
  }
});

test("the navigation uses real page links, not the old in-page anchors", () => {
  for (const p of ["landing.html", ...PUBLIC_PAGES]) {
    const html = read(p);
    const navs = html.match(/<nav[\s\S]*?<\/nav>/g) || [];
    assert.ok(navs.length >= 2, `${p} is missing navigation`);
    for (const nav of navs) {
      for (const m of nav.matchAll(/href="([^"]+)"/g)) {
        assert.ok(!m[1].startsWith("#"), `${p} still has a hash link in the nav: ${m[1]}`);
      }
    }
  }
});

test("every public page loads the shared stylesheet and script — no per-page copies", () => {
  for (const p of ["landing.html", ...PUBLIC_PAGES]) {
    const t = read(p);
    assert.match(t, /href="css\/theme\.css"/, `${p} does not load the shared tokens`);
    assert.match(t, /href="css\/landing\.css"/, `${p} does not load the shared stylesheet`);
    assert.match(t, /src="js\/landing\.js"/, `${p} does not load the shared script`);
    assert.ok(!/<style[\s>]/.test(t), `${p} carries page-local CSS instead of using the shared file`);
  }
});

test("the information pages LOAD nothing from a third party, and ship no imagery", () => {
  // The rule is about what the browser FETCHES, not about what the reader may click. An <a href>
  // to another site costs the visitor nothing until they choose to follow it; a src/link/@import
  // is a request made on their behalf, every visit, without asking. Only the second is banned.
  const LOADING_ATTR = /(?:src|srcset|href)\s*=\s*["']https?:\/\//gi;
  for (const p of ["landing.html", ...PUBLIC_PAGES]) {
    const t = read(p);
    for (const m of t.matchAll(LOADING_ATTR)) {
      // href is a load only on <link>; on <a> it is navigation.
      const tagStart = t.lastIndexOf("<", m.index);
      const whole = t.slice(tagStart, t.indexOf(">", m.index) + 1);
      const tag = whole.match(/^<\s*([a-z0-9-]+)/i)?.[1]?.toLowerCase();
      // <link rel="canonical"> is the one <link> that is NOT a load — the browser never fetches
      // it. It is allowed here only when it names this page's own canonical URL, so the carve-out
      // cannot be widened into a way to smuggle a real third-party <link> in.
      if (tag === "link" && /\brel\s*=\s*["']?canonical\b/i.test(whole)) {
        const href = (whole.match(/\bhref\s*=\s*"([^"]*)"/i) || [])[1];
        assert.equal(href, canonicalUrlFor(p), `${p} canonical link is not its own canonical URL`);
        continue;
      }
      assert.ok(tag === "a", `${p} loads a third-party resource in <${tag}>: ${m[0]}`);
    }
    assert.ok(!/@import\s+url\(/i.test(t), `${p} pulls in a remote stylesheet`);
    assert.ok(!/\b(fetch|XMLHttpRequest|navigator\.sendBeacon)\s*\(/.test(t), `${p} makes a request`);
    assert.ok(!/<img\b/i.test(t), `${p} ships an image — none is approved yet`);
    assert.ok(!/assets\/avatar/i.test(t), `${p} uses avatar art as a marketing visual`);
  }
});

test("the dictionary entry is real, quotable text with its source attached", () => {
  const t = read("elev-og-laerer.html");
  const ODS = "https://ordnet.dk/ods/ordbog?query=l%C3%A6rlig";

  assert.ok(!/<img\b/i.test(t), "the entry must be text, never a screenshot of Ordnet");
  assert.match(t, /<figure class="dict-quote">/, "the entry is missing");
  assert.match(t, /<span class="dict-word">lærlig<\/span>/, "the headword must be selectable text");
  assert.match(t, /om person: som egner sig til at belæres eller\s+undervises; lærenem; lærvillig/,
    "the sense must be quoted exactly");
  // The dagger marks the sense as obsolete. Losing it would silently change what is being claimed.
  assert.match(t, /<span class="dict-obelisk">†<\/span>/, "the obelisk must survive");
  assert.ok(t.includes(`<blockquote cite="${ODS}">`), "the blockquote must carry its cite");

  // The attribution reads "fra Ordbog over det danske Sprog, bind 13, 1932" — every word of it
  // real text, the title in <cite>, and no generated dash. Pinned exactly, because a CSS
  // ::before would look identical on screen while being uncopyable and unreadable to a
  // screen reader.
  assert.ok(t.includes(
    `fra <cite><a href="${ODS}">Ordbog over det danske Sprog</a></cite>, bind 13, 1932`),
    'the attribution must read: fra <cite><a>Ordbog over det danske Sprog</a></cite>, bind 13, 1932');

  const css = read("css/landing.css");
  assert.ok(!/\.dict-source::before/.test(css), "the attribution must not be generated by CSS");
  assert.match(css, /\.dict-source\s*\{[^}]*font-style:\s*italic/,
    "the whole attribution must be italic");

  // No heading above it and no commentary below — the entry speaks for itself.
  const block = t.slice(t.indexOf('<figure class="dict-quote">'), t.indexOf("</figure>"));
  assert.ok(!/<h[1-6]/i.test(block), "the entry must not be introduced by a heading");
});

// ── search-engine classification ──────────────────────────────────────────────────────────────
// Two lists, no default. The three assertions below are the whole contract.

test("1 — the seven public pages are indexable: no robots directive at all", () => {
  assert.deepEqual([...PUBLIC_HTML].sort(), ["landing.html", ...PUBLIC_PAGES].sort(),
    "PUBLIC_HTML drifted from the six information pages plus the front page");
  for (const p of PUBLIC_HTML) {
    assert.ok(has(p), `${p} is classified public but does not ship`);
    assert.ok(!/noindex|nofollow/i.test(read(p)), `${p} blocks indexing`);
    assert.ok(!/name="robots"/i.test(read(p)), `${p} carries a robots meta tag; indexing is the default`);
  }
});

test("2 — every internal app, teacher, admin and auth page carries noindex", () => {
  for (const p of INTERNAL_HTML) {
    assert.ok(has(p), `${p} is classified internal but does not ship`);
    assert.match(read(p), /<meta\s+name="robots"[^>]*content="[^"]*noindex/i,
      `${p} is an internal surface and must not appear in search results`);
  }
  // The surfaces this exists to protect, named explicitly so a silent removal is loud.
  for (const p of ["index.html", "hub.html", "teacher.html", "admin.html",
                   "student-detail.html", "reset-password.html", "login.html"]) {
    assert.ok(INTERNAL_HTML.includes(p), `${p} must be classified internal`);
    assert.match(read(p), /noindex/i, `${p} lost its noindex`);
  }
});

test("3 — no page can ship unclassified: the two lists cover every HTML file, exactly once", () => {
  const shipped = result.files.filter((f) => /^[^/]+\.html$/.test(f)).sort();
  const classified = [...PUBLIC_HTML, ...INTERNAL_HTML].sort();

  assert.deepEqual(shipped, classified,
    "an HTML page ships that is in neither PUBLIC_HTML nor INTERNAL_HTML — or is listed but absent");

  const overlap = PUBLIC_HTML.filter((p) => INTERNAL_HTML.includes(p));
  assert.deepEqual(overlap, [], "a page is in both lists");
  assert.equal(new Set(classified).size, classified.length, "a page is listed twice");

  // The generated page is covered too — it is the one easiest to forget. docs.html is no longer
  // generated; it is copied like any other runtime page, and it is INTERNAL because it is a
  // super_admin viewer.
  assert.ok(INTERNAL_HTML.includes("404.html"), "404.html is generated by the build and must be classified");
  assert.ok(INTERNAL_HTML.includes("docs.html"), "docs.html is an internal page and must be classified");
});

test("3b — validateOutput REFUSES an unclassified or misclassified page", () => {
  const tmp = mkdtempSync(join(tmpdir(), "cf-robots-"));
  const page = (robots) => `<html><head>${robots ? `<meta name="robots" content="${robots}">` : ""}</head></html>`;
  try {
    // A page nobody classified must not be publishable.
    writeFileSync(join(tmp, "helt-ny-side.html"), page(null), "utf8");
    let p = validateOutput(tmp).problems;
    assert.ok(p.some((x) => x.includes("unclassified page")), "an unclassified page must be refused");
    rmSync(join(tmp, "helt-ny-side.html"));

    // An internal page that lost its noindex must not be publishable.
    writeFileSync(join(tmp, "hub.html"), page(null), "utf8");
    p = validateOutput(tmp).problems;
    assert.ok(p.some((x) => x.includes("internal page is indexable")), "a bare internal page must be refused");
    rmSync(join(tmp, "hub.html"));

    // A public page that gained a noindex must not be publishable either — that would
    // silently delist the marketing site.
    writeFileSync(join(tmp, "priser.html"), page("noindex, nofollow"), "utf8");
    p = validateOutput(tmp).problems;
    assert.ok(p.some((x) => x.includes("public page blocks indexing")), "a noindexed public page must be refused");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// -- canonical addresses -------------------------------------------------------------------------
// Every public page answers at TWO addresses - its clean route and its .html file - with
// byte-identical bodies. Without a canonical tag a crawler has to guess which to index, and the
// guess is not ours to make. These tests hold the tag to the routing table.
//
// A wrong canonical is the most dangerous kind of SEO defect precisely because nothing breaks: no
// 404, no visual change, no failing request. The page simply stops being the one that ranks - or,
// if it points somewhere that is not the page, stops being indexed at all.

test("all seven public pages carry exactly one canonical link", () => {
  for (const file of PUBLIC_HTML) {
    const hrefs = canonicalLinksIn(read(file));
    assert.equal(hrefs.length, 1, `${file} has ${hrefs.length} canonical links, expected exactly 1`);
    assert.ok(hrefs[0], `${file} has a canonical link with no href`);
  }
  assert.equal(PUBLIC_HTML.length, 7);
});

test("each canonical is the URL its OWN route implies - file -> route -> canonical", () => {
  // The contract the whole task turns on, walked in the same direction the build walks it.
  for (const file of PUBLIC_HTML) {
    const route = FILE_TO_ROUTE[file];
    assert.ok(route !== undefined, `${file} is public but the routing table gives it no route`);
    assert.equal(ROUTE_TO_FILE[route], file, `${route} does not round-trip back to ${file}`);
    assert.equal(canonicalLinksIn(read(file))[0], SITE_ORIGIN + route,
      `${file} canonicalises somewhere other than its own clean route`);
  }
});

test("FILE_TO_ROUTE is the exact inverse of ROUTE_TO_FILE - not a second mapping", () => {
  assert.deepEqual(Object.keys(FILE_TO_ROUTE).sort(), Object.values(ROUTE_TO_FILE).sort());
  for (const [route, file] of Object.entries(ROUTE_TO_FILE)) assert.equal(FILE_TO_ROUTE[file], route);
  for (const [file, route] of Object.entries(FILE_TO_ROUTE)) assert.equal(ROUTE_TO_FILE[route], file);
  // No public page may share a route with another, or one of them would be canonicalised away.
  assert.equal(new Set(Object.values(ROUTE_TO_FILE)).size, Object.keys(ROUTE_TO_FILE).length);
});

test("every canonical is absolute, https, on the right host, and never a .html address", () => {
  const expectedHost = new URL(SITE_ORIGIN).hostname;
  for (const file of PUBLIC_HTML) {
    const href = canonicalLinksIn(read(file))[0];
    let url;
    assert.doesNotThrow(() => { url = new URL(href); }, `${file} canonical is not an absolute URL: ${href}`);
    assert.equal(url.protocol, "https:", `${file} canonical is not https`);
    // `new URL` normalises the IDN to its A-label, so this holds whichever way the host is written.
    assert.equal(url.hostname, "xn--lrlig-sra.dk", `${file} canonical is on the wrong host`);
    assert.ok(!/\.html/i.test(href), `${file} canonical points at a .html address: ${href}`);
    assert.ok(!/^http:/i.test(href), `${file} canonical uses plain HTTP`);
    assert.ok(!/\/\/www\./i.test(href), `${file} canonical uses a www host that does not exist`);
    assert.ok(!/laerlig\.dk/i.test(href), `${file} canonical uses the ASCII look-alike domain`);
    assert.ok(!/vercel\.app/i.test(href), `${file} canonical points at the dead Vercel origin`);
  }
});

test("the front page canonicalises to the bare origin, not to /landing.html", () => {
  // The one page whose route is not its filename. `/` is the public front door; `landing.html`
  // is an implementation detail of the rewrite and must never be the advertised address.
  assert.equal(canonicalLinksIn(read("landing.html"))[0], "https://l\u00e6rlig.dk/");
  assert.equal(FILE_TO_ROUTE["landing.html"], "/");
});

test("no internal surface declares a canonical - not one of them", () => {
  for (const file of INTERNAL_HTML) {
    assert.deepEqual(canonicalLinksIn(read(file)), [],
      `${file} is an internal surface and must not declare a canonical`);
  }
  // The generated pages included - they are the easiest to forget.
  for (const g of ["docs.html", "404.html"]) assert.deepEqual(canonicalLinksIn(read(g)), []);
});

test("CONTRACT: routing -> public file -> canonical -> sitemap all say the same seven URLs", () => {
  // The four-way agreement, asserted end to end. Each step is computed from the previous one, so
  // a change to any single link in the chain that is not carried through the others fails here.
  const fromRouting = PUBLIC_ROUTES.map((route) => SITE_ORIGIN + route);
  const fromFiles = PUBLIC_ROUTES.map((route) => canonicalUrlFor(ROUTE_TO_FILE[route]));
  const fromHtml = PUBLIC_ROUTES.map((route) => canonicalLinksIn(read(ROUTE_TO_FILE[route]))[0]);
  const fromSitemap = [...read(SITEMAP_FILE).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

  assert.deepEqual(fromFiles, fromRouting, "canonicalUrlFor drifted from the routing table");
  assert.deepEqual(fromHtml, fromRouting, "the shipped HTML drifted from the routing table");
  assert.deepEqual(fromSitemap, fromRouting, "the sitemap drifted from the routing table");
  assert.deepEqual(fromHtml, fromSitemap, "canonical and sitemap advertise different URLs");
  assert.deepEqual(fromHtml, sitemapUrls());
  assert.equal(new Set(fromHtml).size, 7, "two pages claim the same canonical URL");
});

test("validateCanonicals REFUSES every way the tag can go wrong", () => {
  const tmp = mkdtempSync(join(tmpdir(), "cf-canonical-"));
  const page = (body) => `<html><head>${body}</head></html>`;
  const link = (href) => `<link rel="canonical" href="${href}">`;
  const write = (file, body) => writeFileSync(join(tmp, file), page(body), "utf8");
  const problemsFor = (body) => { write("priser.html", body); return validateCanonicals(tmp); };
  try {
    // A faithful page validates clean - otherwise nothing below proves anything.
    assert.deepEqual(problemsFor(link("https://l\u00e6rlig.dk/priser")), []);

    for (const [what, body, needle] of [
      ["no canonical at all", "", "no canonical link"],
      ["two canonicals", link("https://l\u00e6rlig.dk/priser") + link("https://l\u00e6rlig.dk/priser"), "exactly one"],
      ["another page's route", link("https://l\u00e6rlig.dk/produktet"), "its route says"],
      ["the .html address", link("https://l\u00e6rlig.dk/priser.html"), "its route says"],
      ["plain HTTP", link("http://l\u00e6rlig.dk/priser"), "its route says"],
      ["a www host", link("https://www.l\u00e6rlig.dk/priser"), "its route says"],
      ["the ASCII look-alike domain", link("https://laerlig.dk/priser"), "its route says"],
      ["the dead Vercel origin", link("https://den-seje-app-frontend.vercel.app/priser"), "its route says"],
      ["a relative path", link("/priser"), "its route says"],
      ["an internal app surface", link("https://l\u00e6rlig.dk/hub"), "its route says"],
    ]) {
      const problems = problemsFor(body);
      assert.ok(problems.length > 0, `${what} must be refused`);
      assert.ok(problems.some((x) => x.includes(needle)),
        `${what}: expected a problem mentioning ${JSON.stringify(needle)}, got ${JSON.stringify(problems)}`);
    }

    // Attribute order and single quotes must not let a wrong tag slip past the parser.
    assert.ok(problemsFor(`<link href='https://l\u00e6rlig.dk/produktet' rel='canonical'>`).length > 0,
      "a reordered, single-quoted canonical must still be read and refused");
    assert.deepEqual(problemsFor(`<link href="https://l\u00e6rlig.dk/priser" rel="canonical">`), [],
      "a reordered but CORRECT canonical must still be accepted");

    // And an internal page that grows one is refused.
    write("priser.html", link("https://l\u00e6rlig.dk/priser"));
    writeFileSync(join(tmp, "hub.html"), page(link("https://l\u00e6rlig.dk/")), "utf8");
    assert.ok(validateCanonicals(tmp).some((x) => x.includes("internal surface")),
      "an internal page must not be allowed to declare a canonical");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("a new public page cannot ship without a canonical", () => {
  // The forward-looking guard: PUBLIC_HTML is what makes a page public, and validateCanonicals
  // walks exactly that list. So adding a page to it without a canonical fails the build.
  const tmp = mkdtempSync(join(tmpdir(), "cf-canonical-new-"));
  try {
    for (const file of PUBLIC_HTML) {
      writeFileSync(join(tmp, file), `<html><head><link rel="canonical" href="${canonicalUrlFor(file)}"></head></html>`, "utf8");
    }
    assert.deepEqual(validateCanonicals(tmp), [], "the complete, correct set must validate clean");
    // Now the newcomer arrives with no tag.
    writeFileSync(join(tmp, "priser.html"), "<html><head></head></html>", "utf8");
    assert.ok(validateCanonicals(tmp).some((x) => x.includes("no canonical link")));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("the canonical tag is in the SOURCE html, not injected by the build", () => {
  // The deliberate architectural choice: what ships is what the file says. If the build ever
  // starts writing this tag, the source pages stop being honest and this test says so.
  for (const file of PUBLIC_HTML) {
    const src = readFileSync(join(REPO, file), "utf8");
    assert.equal(canonicalLinksIn(src)[0], canonicalUrlFor(file),
      `${file} in the repository must already carry its canonical`);
    assert.equal(canonicalLinksIn(src).length, 1);
  }
  const build = readFileSync(join(REPO, "tools", "cloudflare-build-static.mjs"), "utf8");
  assert.ok(!/writeFileSync[^;]*canonical/i.test(build), "the build must not write canonical tags");
  assert.ok(!/replace[^;]*rel="canonical"/i.test(build), "the build must not rewrite canonical tags");
});

// -- the sitemap --------------------------------------------------------------------------------
// Google could not discover the site because /sitemap.xml was a 404 - nothing in the repository
// had ever produced one. It is generated now, from the routing table itself. These tests are the
// standing proof that it stays correct and cannot drift away from the routes it describes: a
// sitemap is read INSTEAD of the site, so a wrong one fails quietly. Nothing 404s, nothing looks
// broken, the wrong pages simply get indexed.

test("sitemap.xml ships, as a regular file, and a build that loses it fails", () => {
  assert.ok(has(SITEMAP_FILE), "the sitemap must be in the output");
  assert.ok(lstatSync(join(OUT, SITEMAP_FILE)).isFile(), "the sitemap must be a regular file");
  assert.ok(MANDATORY.includes(SITEMAP_FILE),
    "existence must be enforced by MANDATORY, so a build that fails to emit it stops");
});

test("the sitemap's URLs are DERIVED from the routing table, not kept as a second list", () => {
  // The contract that matters. What the sitemap says is a FUNCTION of REDIRECT_RULES, recomputed
  // here straight from the raw rules: if someone ever replaces the derivation with a hand-kept
  // array, the two stop agreeing the moment one of them is edited. (Every current route is ASCII,
  // so percent-encoding is a no-op here; the encoder is exercised separately.)
  const fromRules = REDIRECT_RULES.map((rule) => SITE_ORIGIN + rule.split(/\s+/)[0]);
  assert.deepEqual(sitemapUrls(), fromRules);
  assert.deepEqual([...PUBLIC_ROUTES], Object.keys(ROUTE_TO_FILE));
});

test("the routing table and PUBLIC_HTML describe the same seven public pages", () => {
  // ONE source of truth. The table names the addresses, PUBLIC_HTML names the pages; the sitemap
  // is derived from the first and the robots classification from the second.
  assert.deepEqual([...new Set(Object.values(ROUTE_TO_FILE))].sort(), [...PUBLIC_HTML].sort());
  assert.equal(PUBLIC_ROUTES.length, 7);
  assert.equal(PUBLIC_HTML.length, 7);
  const src = readFileSync(join(REPO, "tools", "cloudflare-build-static.mjs"), "utf8");
  assert.match(src, /describe different public pages/,
    "validateOutput must refuse a routing table that disagrees with PUBLIC_HTML");
});

test("the sitemap lists exactly the seven public routes, in the routing table's order", () => {
  // A separate expected list on purpose: it is the one assertion that does not go through the
  // generator, so a generator that is confidently wrong still fails here.
  const locs = [...read(SITEMAP_FILE).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(locs, [
    "https://l\u00e6rlig.dk/",
    "https://l\u00e6rlig.dk/produktet",
    "https://l\u00e6rlig.dk/saadan-virker-det",
    "https://l\u00e6rlig.dk/elev-og-laerer",
    "https://l\u00e6rlig.dk/til-skoler",
    "https://l\u00e6rlig.dk/priser",
    "https://l\u00e6rlig.dk/om-laerlig",
  ]);
  assert.equal(new Set(locs).size, locs.length, "no URL may be listed twice");
  assert.deepEqual(locs, sitemapUrls(), "the shipped document must match the generator");
});

test("every URL is https, on the right host, and is the clean route - never the .html file", () => {
  const xml = read(SITEMAP_FILE);
  for (const loc of sitemapUrls()) {
    const u = new URL(loc);
    assert.equal(u.protocol, "https:", `${loc} is not https`);
    // `new URL` normalises the IDN to its A-label, so this compares the same two forms whichever
    // way the host happens to be written.
    assert.equal(u.hostname, "xn--lrlig-sra.dk", `${loc} is not on the site's domain`);
    assert.ok(!/\.html/i.test(loc), `${loc} is a .html address, not the public clean route`);
  }
  // The urlset's xmlns is an IDENTIFIER, not a fetched address: the sitemaps.org namespace URI
  // is http:// by definition and must stay that way. So scheme and host are asserted on the
  // <loc> VALUES, which is where they mean something, and the document as a whole is only
  // checked for the things that may never appear in it at all.
  const locText = sitemapUrls().join(" ");
  assert.ok(!/http:\/\//.test(locText), "no plain-HTTP URL may appear");
  assert.ok(!/www\./i.test(locText), "the site has no www host");
  assert.ok(!/\.html/i.test(xml), "no .html address anywhere in the document");
  assert.ok(!/laerlig\.dk/i.test(xml), "the ASCII spelling is a different domain");
  assert.ok(!/xn--/i.test(xml), "the readable IRI form is what ships - see SITE_ORIGIN");
});

test("no internal surface appears in the sitemap - not as a file, not as a route", () => {
  const xml = read(SITEMAP_FILE);
  const paths = sitemapUrls().map((u) => new URL(u).pathname);
  for (const page of INTERNAL_HTML) {
    assert.ok(!xml.includes(page), `the sitemap names an internal page: ${page}`);
    assert.ok(!paths.includes("/" + page.replace(/\.html$/, "")), `the sitemap lists /${page}`);
  }
  // Named explicitly, so a silent removal from INTERNAL_HTML stays loud here too.
  for (const surface of ["index", "login", "reset-password", "hub", "shop", "avatar", "collection",
                         "themes", "leaderboard", "achievements", "teacher", "student-detail",
                         "admin", "docs", "404"]) {
    assert.ok(!xml.includes(surface), `the sitemap mentions the internal surface ${surface}`);
  }
});

test("the sitemap invents no metadata, and its XML structure is sound", () => {
  const xml = read(SITEMAP_FILE);
  // The repository has no deterministic source for any of these; inventing one would be a guess
  // dressed up as data.
  for (const tag of ["lastmod", "changefreq", "priority"]) {
    assert.ok(!xml.includes(tag), `the sitemap carries a <${tag}> nothing here can honestly fill in`);
  }
  assert.ok(xml.startsWith(`<?xml version="1.0" encoding="UTF-8"?>\n`), "missing the XML declaration");
  assert.ok(xml.includes(`<urlset xmlns="${SITEMAP_XMLNS}">`), "missing the sitemaps 0.9 namespace");
  assert.equal(SITEMAP_XMLNS, "http://www.sitemaps.org/schemas/sitemap/0.9");
  assert.ok(xml.trimEnd().endsWith("</urlset>"), "the urlset is not closed");
  for (const [open, close] of [["<url>", "</url>"], ["<loc>", "</loc>"]]) {
    assert.equal(xml.split(open).length - 1, 7, `expected 7 ${open}`);
    assert.equal(xml.split(close).length - 1, 7, `expected 7 ${close}`);
  }
  assert.ok(!xml.includes("*"), "a wildcard would mean URLs nobody listed");
  assert.ok(xml.endsWith("</urlset>\n"), "the document must end with a single newline");
});

test("the sitemap is deterministic - the same bytes twice, and no clock inside it", () => {
  const first = readFileSync(join(build({ quiet: true }).outDir, SITEMAP_FILE));
  const second = readFileSync(join(build({ quiet: true }).outDir, SITEMAP_FILE));
  assert.ok(first.equals(second), "two builds of one commit must produce byte-identical output");
  assert.equal(sitemapXml(), sitemapXml());
  const xml = sitemapXml();
  assert.ok(!/\d{4}-\d{2}-\d{2}/.test(xml), "the sitemap embeds a date");
  assert.ok(!/\d{4}-\d{2}-\d{2}T/.test(xml), "the sitemap embeds a timestamp");
  assert.ok(!/\d{9,}/.test(xml), "the sitemap embeds an epoch or a build id");
});

test("the generator discovers nothing - it reads the routing table, never the filesystem", () => {
  const src = readFileSync(join(REPO, "tools", "cloudflare-build-static.mjs"), "utf8");
  const from = src.indexOf("export const SITE_ORIGIN");
  const to = src.indexOf("what may never appear in the output");
  assert.ok(from > 0 && to > from, "the sitemap section moved - re-anchor this test");
  const section = src.slice(from, to);
  for (const forbidden of ["readdirSync", "listDir", "existsSync", "new Date", "Math.random", "process.env"]) {
    assert.ok(!section.includes(forbidden),
      `the sitemap generator uses ${forbidden}; its URLs must come from REDIRECT_RULES alone`);
  }
  assert.match(section, /Object\.keys\(ROUTE_TO_FILE\)/,
    "the public routes must be derived from the routing table");
});

test("XML escaping is real, not incidental to today's all-ASCII routes", () => {
  assert.equal(xmlEscape(`&<>"'`), "&amp;&lt;&gt;&quot;&apos;");
  // `&` must be replaced FIRST, or the ampersands the later replacements introduce get escaped a
  // second time and the document ends up saying something other than it means.
  assert.equal(xmlEscape("<&>"), "&lt;&amp;&gt;");
  assert.equal(xmlEscape("a?x=1&y=2"), "a?x=1&amp;y=2");
  assert.equal(xmlUnescape(xmlEscape(`&<>"' \u00e6\u00f8\u00e5`)), `&<>"' \u00e6\u00f8\u00e5`);
  assert.equal(xmlUnescape("&amp;lt;"), "&lt;", "unescaping must not run twice over its own output");
  // And the path must be percent-encoded, so a future non-ASCII route cannot emit a broken URL.
  const src = readFileSync(join(REPO, "tools", "cloudflare-build-static.mjs"), "utf8");
  assert.match(src, /encodeURIComponent/, "the path must be percent-encoded, not concatenated raw");
});

test("sitemap.xml is the only XML in the output - the extension is not a new door", () => {
  assert.deepEqual(result.files.filter((f) => f.endsWith(".xml")), [SITEMAP_FILE]);
  for (const d of ASSET_DIRS) {
    assert.ok(!d.extensions.includes(".xml"), `${d.dir}/ must not copy .xml files in from the repo`);
  }
  assert.ok(!RUNTIME_HTML.some((f) => f.endsWith(".xml")));
  assert.ok(!ROOT_FILES.some((f) => f.endsWith(".xml")));
});

test("a sitemap that drifts from the routing table cannot pass validation", () => {
  // The anti-drift guard, exercised. Each case is a way the sitemap could quietly stop describing
  // the site: an extra page, a lost one, a reorder, a duplicate, a .html address, plain HTTP, the
  // wrong host, an internal surface, invented metadata, a wildcard, a truncated document.
  const tmp = mkdtempSync(join(tmpdir(), "cf-sitemap-"));
  const write = (xml) => writeFileSync(join(tmp, SITEMAP_FILE), xml, "utf8");
  const doc = (urls) => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="${SITEMAP_XMLNS}">\n`
    + urls.map((u) => `  <url>\n    <loc>${u}</loc>\n  </url>`).join("\n")
    + `\n</urlset>\n`;
  const urls = sitemapUrls();
  const HOST = "https://l\u00e6rlig.dk";
  try {
    // The faithful document must validate clean, or every assertion below proves nothing.
    write(sitemapXml());
    assert.deepEqual(validateSitemap(tmp), []);

    rmSync(join(tmp, SITEMAP_FILE));
    assert.ok(validateSitemap(tmp).some((x) => x.includes("missing")), "a missing sitemap must be refused");

    const cases = [
      ["a page the routing table does not contain", doc([...urls, `${HOST}/kampagne`])],
      ["a dropped public route", doc(urls.slice(0, -1))],
      ["a reordered list", doc([urls[1], urls[0], ...urls.slice(2)])],
      ["a duplicate URL", doc([...urls.slice(0, -1), urls[0]])],
      ["a .html address", doc(urls.map((u, i) => (i === 1 ? `${HOST}/produktet.html` : u)))],
      ["plain HTTP", doc(urls.map((u, i) => (i === 0 ? u.replace("https:", "http:") : u)))],
      ["the ASCII look-alike host", doc(urls.map((u, i) => (i === 0 ? "https://laerlig.dk/" : u)))],
      ["an internal surface", doc(urls.map((u, i) => (i === 1 ? `${HOST}/hub` : u)))],
      ["invented metadata", sitemapXml().replace("</urlset>", "  <lastmod>2026-08-23</lastmod>\n</urlset>")],
      ["a wildcard", doc(urls.map((u, i) => (i === 1 ? `${HOST}/*` : u)))],
      ["a truncated document", sitemapXml().replace("</urlset>\n", "")],
    ];
    for (const [what, xml] of cases) {
      write(xml);
      assert.ok(validateSitemap(tmp).length > 0, `${what} must be refused`);
    }

    // ...and the faithful document still validates afterwards, so the guard is not simply stuck.
    write(sitemapXml());
    assert.deepEqual(validateSitemap(tmp), []);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("the site is reachable — one contact address, in the footer of every public page", () => {
  const CONTACT = "mailto:kontakt@lærlig.dk";
  for (const p of ["landing.html", ...PUBLIC_PAGES]) {
    const t = read(p);
    assert.ok(t.includes(`<a href="${CONTACT}">Skriv til os</a>`),
      `${p}: the footer must offer a way to get in touch`);
    // Exactly one address, so a second one cannot drift in unnoticed.
    assert.equal((t.match(/mailto:/g) || []).length, p === "priser.html" ? 2 : 1,
      `${p}: unexpected number of mailto links`);
    // The public site writes from its own domain. A personal free-mail address — the private
    // Gmail this replaced, or any other — must not come back, in a link or as visible text.
    assert.ok(!/@(?:gmail|hotmail|outlook|yahoo|live)\.[a-z.]+/i.test(t),
      `${p}: a personal free-mail address is on the page instead of the domain address`);
  }
  // Pricing invites schools to write, so it must actually carry the address in the body too.
  assert.match(read("priser.html"), /Vil du høre mere\?/);
  assert.ok(read("priser.html").includes(`href="${CONTACT}"`),
    "the pricing page invites contact but does not give the address");
  // …and show it, so a reader can copy it without opening a mail client.
  assert.ok(read("priser.html").includes(">kontakt@lærlig.dk</a>"),
    "the pricing page must display the address as text, not only as a link target");
});

// ── docs.html: the gated viewer ───────────────────────────────────────────────────────────────
// It used to ship as an inert stub because a public /docs/ directory would have been
// world-readable. The documents now live in a PRIVATE Supabase bucket (RLS: super_admin only)
// and are never published, so the real viewer can ship — provided it cannot reach a document
// without a session. That is what these assert.
test("docs.html ships as the real viewer", () => {
  assert.ok(has("docs.html"));
  const t = read("docs.html");
  assert.ok(t.includes("FILE_TO_SLUG"), "the shipped page is not the source viewer");
  assert.match(t, /noindex/, "an internal page must not be indexable");
});

test("docs.html cannot reach a document without a session and the super_admin role", () => {
  const t = read("docs.html");
  // the directory is never published, so naming it could only ever produce a 404 - or a leak
  assert.ok(!/["'`]\/?docs\//.test(t), "docs.html references the docs/ directory");
  assert.ok(!/\/docs\/[^"'`\r\n]*\.md\b/.test(t), "docs.html points at a published Markdown path");
  // and the gate itself
  assert.match(t, /getSession\s*\(/, "no session check");
  assert.ok(t.includes("super_admin"), "no role gate");
  assert.match(t, /storage\s*\.\s*from\(/, "documents are not read from private storage");
});

test("no Markdown is published at all", () => {
  // the real protection is upstream of the page: there is nothing on the CDN to read
  const md = build({ quiet: true }).files.filter((f) => /\.md$/i.test(f));
  assert.deepEqual(md, [], "a Markdown file reached the output");
});

test("hub.html and admin.html can still open /docs.html without a 404", () => {
  for (const page of ["hub.html", "admin.html"]) {
    assert.ok(read(page).includes("docs.html"), `${page} should still link to docs.html`);
  }
  assert.ok(has("docs.html"), "so docs.html must exist in the output");
});

// ── the explicit .html routing contract ───────────────────────────────────────────────────────
// Cloudflare's default `auto-trailing-slash` strips the extension and 307s: /login.html → /login.
// This app is a multipage app whose runtime links, role redirects and Playwright assertions all
// use explicit .html addresses, so hosting is configured to match the app rather than the tests
// being weakened to match the hosting.
test("wrangler.jsonc keeps explicit .html routes — html_handling is none", () => {
  const wrangler = readFileSync(join(REPO, "wrangler.jsonc"), "utf8");
  assert.match(wrangler, /"html_handling":\s*"none"/);
  assert.ok(!/"html_handling":\s*"auto-trailing-slash"/.test(wrangler), "auto-trailing-slash 307s away the .html extension");
  assert.match(wrangler, /"not_found_handling":\s*"404-page"/, "the 404 page behaviour must be preserved");
  assert.ok(!/"main"\s*:/.test(wrangler), "the Worker must stay asset-only");
});

test("_redirects is generated as exactly the declared routing table", () => {
  assert.ok(has("_redirects"));
  const lines = read("_redirects").split("\n").map((l) => l.trim()).filter(Boolean);
  assert.deepEqual(lines, [
    "/ /landing.html 200",
    "/produktet /produktet.html 200",
    "/saadan-virker-det /saadan-virker-det.html 200",
    "/elev-og-laerer /elev-og-laerer.html 200",
    "/til-skoler /til-skoler.html 200",
    "/priser /priser.html 200",
    "/om-laerlig /om-laerlig.html 200",
  ]);
  assert.deepEqual(lines, [...REDIRECT_RULES]);
  // status 200 = internal rewrite: the address bar keeps the clean path and no 3xx is emitted
  for (const l of lines) assert.match(l, /\s200$/, `${l} must be a rewrite, not a 301/302`);
});

test("the routing table is an explicit list — no pattern could ever match a stray path", () => {
  const raw = read("_redirects");
  assert.ok(!raw.includes("*"), "no wildcard anywhere");
  assert.ok(!/:\w/.test(raw), "no placeholder segments");
  // Every route is a literal, single-segment path.
  for (const from of Object.keys(ROUTE_TO_FILE)) {
    assert.match(from, /^\/[a-z-]*$/, `${from} is not a literal single-segment route`);
  }
});

// The whole point of Model A: the quiz did NOT move. `/` changed meaning; `/index.html` did not.
test("the root rewrite does NOT point at the quiz, and the quiz keeps its own address", () => {
  const raw = read("_redirects");
  assert.ok(!raw.includes("/index.html"), "`/` must no longer resolve to the quiz");
  assert.ok(has("index.html"), "the quiz must still ship at its own unchanged address");
  // the quiz page itself must be untouched by this change
  const quiz = read("index.html");
  assert.match(quiz, /<div class="game-shell">/, "index.html must still be the quiz shell");
  assert.match(quiz, /id="question"/, "index.html must still be the quiz");
  assert.match(quiz, /src="app\.js"/, "index.html must still load the quiz app");
});

test("student role routing still targets index.html — the landing page did not take it over", () => {
  // js/login.js is the single owner of role routing. If the landing work had touched it, the
  // student would stop reaching the quiz after login; this is the standing proof it did not.
  assert.match(read("js/login.js"), /window\.location\.href\s*=\s*"index\.html"/,
    "students must still be routed to the quiz after login");
});

test("_redirects is NOT a SPA fallback — unknown paths must still reach the 404 page", () => {
  const raw = read("_redirects");
  assert.ok(!/^\s*\/\*/m.test(raw), "a wildcard rule would swallow every unknown path");
  assert.ok(!raw.includes("/*"), "no wildcard anywhere");
});

test("validateOutput rejects a tampered _redirects", () => {
  const tmp = mkdtempSync(join(tmpdir(), "cf-redirects-"));
  const writeTable = (lines) => writeFileSync(join(tmp, "_redirects"), lines.join("\n") + "\n", "utf8");
  try {
    // A faithful copy of the real table, with every target present, must validate clean.
    // A faithful page carries its canonical, because a real output always does.
    for (const f of Object.values(ROUTE_TO_FILE)) {
      writeFileSync(join(tmp, f), `<html><head><link rel="canonical" href="${canonicalUrlFor(f)}"></head></html>`, "utf8");
    }
    writeTable([...REDIRECT_RULES]);
    assert.deepEqual(validateOutput(tmp).problems, []);

    writeTable([...REDIRECT_RULES, "/* /landing.html 200"]);
    let p = validateOutput(tmp).problems;
    assert.ok(p.some((x) => x.includes("wildcard")), "a wildcard must be refused");

    writeTable(REDIRECT_RULES.map((r, i) => (i === 0 ? "/ /landing.html 302" : r)));
    p = validateOutput(tmp).problems;
    assert.ok(p.some((x) => x.includes("not an internal 200 rewrite") || x.includes("line 1")),
      "a 302 must be refused — it would expose /landing.html in the URL bar");

    writeTable([...REDIRECT_RULES, "/extra /other.html 200"]);
    p = validateOutput(tmp).problems;
    assert.ok(p.some((x) => x.includes("exactly")), "an extra rule must be refused");

    writeTable(REDIRECT_RULES.slice(0, -1));
    p = validateOutput(tmp).problems;
    assert.ok(p.some((x) => x.includes("exactly")), "a missing rule must be refused");

    // Reordering is refused too: the emitted file must match the declaration exactly.
    writeTable([REDIRECT_RULES[1], REDIRECT_RULES[0], ...REDIRECT_RULES.slice(2)]);
    p = validateOutput(tmp).problems;
    assert.ok(p.some((x) => x.includes("line 1")), "a reordered table must be refused");

    // A rewrite silently retargeted at the quiz must be refused — that would put the app behind
    // the public front door again and expose the quiz shell to anonymous visitors.
    writeTable(REDIRECT_RULES.map((r, i) => (i === 0 ? "/ /index.html 200" : r)));
    p = validateOutput(tmp).problems;
    assert.ok(p.some((x) => x.includes("line 1")), "retargeting the root at the quiz must be refused");

    // A route pointing at a page that was never shipped must be refused.
    rmSync(join(tmp, "priser.html"));
    writeTable([...REDIRECT_RULES]);
    p = validateOutput(tmp).problems;
    assert.ok(p.some((x) => x.includes("missing from the output")), "a dangling route target must be refused");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("no extensionless twin of any runtime page ships — clean paths exist only as rewrites", () => {
  for (const page of RUNTIME_HTML) {
    const bare = page.replace(/\.html$/, "");
    assert.ok(!has(bare), `${bare} must not exist as an asset`);
    assert.ok(!existsSync(join(OUT, bare)), `${bare} must not exist on disk`);
  }
  // So an app address like /login can still only ever be a 404: it is not a file, and it is not
  // in the routing table either. Only the six public pages have clean routes.
  for (const app of ["/login", "/hub", "/teacher", "/admin", "/index", "/landing"]) {
    assert.ok(!Object.prototype.hasOwnProperty.call(ROUTE_TO_FILE, app),
      `${app} must not have a clean route — app addresses stay explicit .html`);
  }
});

test("404.html is generated, neutral, and links back to the public front page", () => {
  assert.ok(has("404.html"));
  const t = read("404.html");
  assert.match(t, /404/);
  // The front page is the landing page now. Linking to the quiz would bounce an anonymous
  // visitor straight back out to login after a flash of app UI.
  assert.match(t, /href="landing\.html"/);
  assert.ok(has("landing.html"), "the 404 link would otherwise be a 404 itself");
  for (const s of FORBIDDEN_STRINGS) assert.ok(!t.includes(s), `404.html leaks ${s}`);
});

// ── what must NOT be there ────────────────────────────────────────────────────────────────────
test("no internal directory reaches the output", () => {
  for (const d of FORBIDDEN_DIRS) {
    assert.ok(!existsSync(join(OUT, d)), `${d}/ must not be in the output`);
    assert.equal(result.files.filter((f) => f.startsWith(d + "/")).length, 0, `files under ${d}/ leaked`);
  }
});

test("docs/ is absent entirely — 0 files from the repository's docs directory", () => {
  assert.ok(!existsSync(join(OUT, "docs")));
  assert.equal(result.files.filter((f) => f.startsWith("docs/")).length, 0);
});

test("ROADMAP.md, project-state.md and CLAUDE.md appear nowhere in the output", () => {
  for (const name of ["ROADMAP.md", "project-state.md", "CLAUDE.md"]) {
    assert.equal(result.files.filter((f) => f.endsWith(name)).length, 0, `${name} leaked`);
    assert.ok(!existsSync(join(OUT, name)));
  }
});

test("no .env file and no package manifest reaches the output", () => {
  for (const f of result.files) {
    assert.ok(!/(^|\/)\.env/i.test(f), `env file leaked: ${f}`);
    const base = f.split("/").pop();
    assert.ok(!["package.json", "package-lock.json", "deno.lock"].includes(base), `manifest leaked: ${f}`);
  }
});

test("no internal Markdown, source map, or other non-runtime file type ships", () => {
  for (const f of result.files) {
    assert.ok(!f.endsWith(".md"), `markdown leaked: ${f}`);
    assert.ok(!f.endsWith(".map"), `source map leaked: ${f}`);
    for (const ext of [".ts", ".jsx", ".mjs", ".ps1", ".log", ".jsonl", ".txt", ".json"]) {
      assert.ok(!f.endsWith(ext), `non-runtime file leaked: ${f}`);
    }
  }
});

test("gamefeel.html and data/questions.js stay out, as agreed", () => {
  assert.ok(!has("gamefeel.html"));
  assert.ok(!has("data/questions.js"));
});

test("no dotfiles in the output except an optional .assetsignore", () => {
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      if (name.startsWith(".")) assert.equal(name, ".assetsignore", `unexpected dotfile: ${toPosix(relative(OUT, abs))}`);
      if (lstatSync(abs).isDirectory()) walk(abs);
    }
  };
  walk(OUT);
});

test("no symlinks anywhere in the output", () => {
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      const st = lstatSync(abs);
      assert.ok(!st.isSymbolicLink(), `symlink in output: ${toPosix(relative(OUT, abs))}`);
      if (st.isDirectory()) walk(abs);
    }
  };
  walk(OUT);
});

test("the forbidden strings do not occur in the output", () => {
  const allowed = new Set(KNOWN_STRING_EXCEPTIONS.map((e) => `${e.file}::${e.string}`));
  const found = [];
  for (const f of result.files) {
    if (!/\.(html|js|css|svg|xml)$/.test(f)) continue;
    const t = readFileSync(join(OUT, f), "utf8");
    for (const s of FORBIDDEN_STRINGS) {
      if (t.includes(s) && !allowed.has(`${f}::${s}`)) found.push(`${f}: ${s}`);
    }
  }
  assert.deepEqual(found, []);
});

test("the string exception list is exactly the two known comment references and cannot grow silently", () => {
  assert.equal(KNOWN_STRING_EXCEPTIONS.length, 2);
  assert.deepEqual(
    KNOWN_STRING_EXCEPTIONS.map((e) => `${e.file}::${e.string}`).sort(),
    ["js/analytics.js::CLAUDE.md", "js/sentry.js::CLAUDE.md"],
  );
  for (const e of KNOWN_STRING_EXCEPTIONS) {
    assert.ok(e.reason && e.reason.length > 10, "every exception must carry a reason");
    // each must genuinely be a comment line, not live code
    const line = readFileSync(join(OUT, e.file), "utf8").split("\n").find((l) => l.includes(e.string));
    assert.match(line.trim(), /^(\/\/|\*|\/\*)/, `${e.file}: the exception must be a comment, got: ${line.trim()}`);
  }
});

// ── the build's own guarantees ────────────────────────────────────────────────────────────────
test("the build is deterministic — two runs produce the identical file list and bytes", () => {
  const a = build({ quiet: true });
  const b = build({ quiet: true });
  assert.deepEqual(a.files, b.files);
  assert.equal(a.bytes, b.bytes);
  assert.deepEqual(a.files, [...a.files].sort(), "the file list must be sorted, not filesystem-ordered");
  for (const f of ["docs.html", "404.html"]) {
    assert.equal(readFileSync(join(OUT, f), "utf8"), readFileSync(join(OUT, f), "utf8"));
  }
  // the generated page must not embed a timestamp or build id
  assert.ok(!/\d{4}-\d{2}-\d{2}T/.test(notFoundHtml()), "generated page embeds a timestamp");
});

test("validateOutput rejects path traversal, forbidden files and symlinks", () => {
  const tmp = mkdtempSync(join(tmpdir(), "cf-static-"));
  try {
    // index.html is classified internal, so the fixture carries the noindex it would have in a
    // real build. This test is about traversal and forbidden files; the robots contract is
    // exercised separately, and a bare page here would fail for the wrong reason.
    writeFileSync(join(tmp, "index.html"),
      '<html><head><meta name="robots" content="noindex, nofollow"></head></html>', "utf8");
    assert.deepEqual(validateOutput(tmp).problems, []);

    writeFileSync(join(tmp, "ROADMAP.md"), "internal", "utf8");
    let p = validateOutput(tmp).problems;
    assert.ok(p.some((x) => x.includes("ROADMAP.md")), "a forbidden filename must be caught");
    rmSync(join(tmp, "ROADMAP.md"));

    writeFileSync(join(tmp, ".env"), "SECRET=1", "utf8");
    p = validateOutput(tmp).problems;
    assert.ok(p.some((x) => x.includes(".env")), "an env file must be caught");
    rmSync(join(tmp, ".env"));

    writeFileSync(join(tmp, "leak.html"), "see project-state for D-098", "utf8");
    p = validateOutput(tmp).problems;
    assert.ok(p.some((x) => x.includes("forbidden string")), "forbidden text must be caught");
    rmSync(join(tmp, "leak.html"));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("a symlink in the output is refused rather than followed", () => {
  const tmp = mkdtempSync(join(tmpdir(), "cf-symlink-"));
  try {
    writeFileSync(join(tmp, "index.html"), "<html></html>", "utf8");
    const target = join(REPO, "package.json");
    try {
      symlinkSync(target, join(tmp, "sneaky.html"), "file");
    } catch {
      return;   // unprivileged Windows cannot create symlinks; the guard is still asserted below
    }
    const p = validateOutput(tmp).problems;
    assert.ok(p.some((x) => x.includes("symlink")), "a symlink must be reported, never followed");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("the build refuses to publish the repository root", () => {
  const src = readFileSync(join(REPO, "tools", "cloudflare-build-static.mjs"), "utf8");
  assert.ok(!/--assets\s+\.[\s"']/.test(src), "must never suggest deploying the repo root");
  const wrangler = readFileSync(join(REPO, "wrangler.jsonc"), "utf8");
  assert.match(wrangler, /"directory":\s*"\.\/dist-cloudflare"/);
  assert.ok(!/"main"\s*:/.test(wrangler), "the Worker must stay asset-only — no main entry");
});

test("the serve-check still asserts the routing contract over HTTP", () => {
  const src = readFileSync(join(REPO, "tools", "cloudflare-serve-check.mjs"), "utf8");
  // the extensionless 404 list must cover the pages whose URLs the Playwright suite asserts on
  for (const bare of ["/login", "/teacher", "/student-detail", "/avatar", "/reset-password", "/landing"]) {
    assert.ok(src.includes(`"${bare}"`), `serve-check must prove ${bare} is a 404`);
  }
  // and it must prove the root rewrite lands on the landing page, not on the quiz
  assert.ok(src.includes('"/landing.html"'), "serve-check must prove /landing.html serves");
  assert.match(src, /THE QUIZ DID NOT MOVE/, "serve-check must prove /index.html still serves the quiz");
  assert.ok(src.includes('"/_redirects"'), "serve-check must prove /_redirects is unreachable");
  assert.ok(src.includes('"/sitemap.xml"'), "serve-check must prove /sitemap.xml actually serves");
  assert.match(src, /THE SITEMAP/, "serve-check must assert what the sitemap contains, over HTTP");
  assert.ok(src.includes('"/student-detail.html?id=test"'), "serve-check must prove a query string still serves");
  // raw status, or a 307 resolving to 200 would look like a pass
  assert.match(src, /redirect:\s*["']manual["']/, "serve-check must not follow redirects");
});

test("dist-cloudflare is gitignored so the build output can never be committed", () => {
  assert.match(readFileSync(join(REPO, ".gitignore"), "utf8"), /^dist-cloudflare\/$/m);
});
