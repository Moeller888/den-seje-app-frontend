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
  build, validateOutput, docsStubHtml, notFoundHtml, DOCS_STUB_MARKER, REDIRECT_RULES, ROUTE_TO_FILE,
  RUNTIME_HTML, ROOT_FILES, MANDATORY, FORBIDDEN_DIRS, FORBIDDEN_STRINGS, KNOWN_STRING_EXCEPTIONS,
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
    assert.ok(!/https?:\/\//i.test(t), `${f} references an external URL`);
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

test("all 20 runtime HTML pages are copied", () => {
  assert.equal(RUNTIME_HTML.length, 20);
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

test("the information pages contact no third party and ship no imagery", () => {
  for (const p of ["landing.html", ...PUBLIC_PAGES]) {
    const t = read(p);
    assert.ok(!/https?:\/\//i.test(t), `${p} references an external URL`);
    assert.ok(!/<img\b/i.test(t), `${p} ships an image — none is approved yet`);
    assert.ok(!/assets\/avatar/i.test(t), `${p} uses avatar art as a marketing visual`);
  }
});

test("all seven public pages are indexable, and nothing else became indexable with them", () => {
  // The seven marketing pages: no robots directive, so the default (index, follow) applies.
  for (const p of ["landing.html", ...PUBLIC_PAGES]) {
    assert.ok(!/noindex|nofollow/i.test(read(p)), `${p} still blocks indexing`);
    assert.ok(!/name="robots"/i.test(read(p)), `${p} still carries a robots meta tag`);
  }
  // These two are NOT public marketing pages and must keep theirs. Opening indexing on the
  // seven should never have leaked into the app's entry page or the internal docs stub.
  for (const p of ["login.html", "docs.html"]) {
    assert.match(read(p), /<meta name="robots" content="noindex[^"]*">/i,
      `${p} must stay out of search results`);
  }
});

test("the site is reachable — one contact address, in the footer of every public page", () => {
  const CONTACT = "mailto:Christarbejde@gmail.com";
  for (const p of ["landing.html", ...PUBLIC_PAGES]) {
    const t = read(p);
    assert.ok(t.includes(`<a href="${CONTACT}">Skriv til os</a>`),
      `${p}: the footer must offer a way to get in touch`);
    // Exactly one address, so a second one cannot drift in unnoticed.
    assert.equal((t.match(/mailto:/g) || []).length, p === "priser.html" ? 2 : 1,
      `${p}: unexpected number of mailto links`);
  }
  // Pricing invites schools to write, so it must actually carry the address in the body too.
  assert.match(read("priser.html"), /Vil du høre mere\?/);
  assert.ok(read("priser.html").includes(`href="${CONTACT}"`),
    "the pricing page invites contact but does not give the address");
});

// ── the docs.html stub ────────────────────────────────────────────────────────────────────────
test("docs.html exists and IS the generated public stub, not the source page", () => {
  assert.ok(has("docs.html"));
  const t = read("docs.html");
  assert.ok(t.includes(DOCS_STUB_MARKER), "not the generated stub");
  assert.match(t, /ikke offentligt tilgængelig/);
  assert.match(t, /href="hub\.html"/);
  // the source page's machinery must be absent
  assert.ok(!t.includes("FILE_TO_SLUG"), "source docs.html machinery leaked into the output");
  assert.ok(!t.includes("157o-read-aloud"));
});

test("the public docs.html neither fetches nor links to /docs/", () => {
  const t = read("docs.html");
  assert.ok(!/fetch\s*\(/.test(t), "stub must not fetch");
  assert.ok(!/XMLHttpRequest/.test(t));
  assert.ok(!/["'`]\/?docs\//.test(t), "stub must not reference the docs/ directory");
  assert.ok(!/\.md\b/.test(t), "stub must not reference any Markdown file");
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
    for (const f of Object.values(ROUTE_TO_FILE)) writeFileSync(join(tmp, f), "<html></html>", "utf8");
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
    if (!/\.(html|js|css|svg)$/.test(f)) continue;
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
  // generated pages must not embed a timestamp or build id
  for (const html of [docsStubHtml(), notFoundHtml()]) {
    assert.ok(!/\d{4}-\d{2}-\d{2}T/.test(html), "generated page embeds a timestamp");
  }
});

test("validateOutput rejects path traversal, forbidden files and symlinks", () => {
  const tmp = mkdtempSync(join(tmpdir(), "cf-static-"));
  try {
    writeFileSync(join(tmp, "index.html"), "<html></html>", "utf8");
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
  assert.ok(src.includes('"/student-detail.html?id=test"'), "serve-check must prove a query string still serves");
  // raw status, or a 307 resolving to 200 would look like a pass
  assert.match(src, /redirect:\s*["']manual["']/, "serve-check must not follow redirects");
});

test("dist-cloudflare is gitignored so the build output can never be committed", () => {
  assert.match(readFileSync(join(REPO, ".gitignore"), "utf8"), /^dist-cloudflare\/$/m);
});
