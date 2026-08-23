// Build the PUBLIC frontend into dist-cloudflare/ for Cloudflare Workers Static Assets.
// ---------------------------------------------------------------------------------------------
// WHY AN ALLOWLIST, AND WHY NOT `wrangler deploy --assets .`
// The frontend lives in the REPOSITORY ROOT, next to `.env`, `.env.local`, `KUN TIL MIG.txt`,
// `runBatch_dump.txt`, `worker-*.log`, `legacy_questions.json`, the whole `docs/` decision
// register, `tests/`, `tools/`, `supabase/` and 1,025 tracked files under `node_modules/`.
// Uploading the root would publish every one of them. So nothing is copied unless it is named
// here, and the output is re-validated after the copy — a denylist would only ever be as good as
// the last person who remembered to extend it.
//
// TWO FILES ARE GENERATED RATHER THAN COPIED:
//   docs.html — the SOURCE page fetches `/docs/<file>.md` at runtime and is linked from hub.html
//               and admin.html. Shipping it would mean shipping internal documentation, so the
//               output gets a neutral stub instead: the links still resolve, nothing internal is
//               served, and no Markdown is fetched. Deliberate hardening of the deployment, not a
//               change to the app.
//   404.html  — required by `not_found_handling: "404-page"`; neutral, no internal information.
//               It links to `landing.html`, the public front page — not to the quiz, which would
//               bounce an anonymous visitor straight back out to login.
//
// RUNS WITH NO DEPENDENCIES INSTALLED (Cloudflare sets SKIP_DEPENDENCY_INSTALL=1): Node builtins
// only. Deterministic on Windows and Linux — every listing is sorted, paths are normalised to
// forward slashes, and nothing embeds a timestamp.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, lstatSync, readdirSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, relative, sep, posix } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
export const OUT_DIR_NAME = "dist-cloudflare";
const OUT = join(REPO, OUT_DIR_NAME);

// ── the allowlist ─────────────────────────────────────────────────────────────────────────────
// Runtime pages, copied verbatim. `gamefeel.html` (a dev sandbox with no inbound links from any
// runtime page) and the source `docs.html` are deliberately absent.
// `teacher.html` and `reset-password.html` are not optional: js/login.js routes teachers to the
// first by role, and sets Supabase's password-recovery `redirectTo` to the second. Dropping either
// breaks a live flow, which is why the reference check below is a test and not a code review step.
// The seven PUBLIC website pages — `landing.html` plus the six information pages — are likewise
// not optional: each one is the target of a rewrite in REDIRECT_RULES below, and a missing file
// would leave its clean route rewriting to nothing. `validateOutput()` checks that link both ways.
export const RUNTIME_HTML = Object.freeze([
  "achievements.html", "admin.html", "avatar.html", "collection.html", "elev-og-laerer.html",
  "hub.html", "index.html", "landing.html", "leaderboard.html", "login.html", "om-laerlig.html",
  "priser.html", "produktet.html", "reset-password.html", "saadan-virker-det.html", "shop.html",
  "student-detail.html", "teacher.html", "themes.html", "til-skoler.html",
]);
// Entry files the pages load directly from the root.
export const ROOT_FILES = Object.freeze(["app.js", "style.css", "supabaseClient.js"]);
// Whole directories, filtered by extension. The extension allowlist is the point: a stray .md,
// .env or .map dropped into one of these can never reach the output.
export const ASSET_DIRS = Object.freeze([
  { dir: "js", extensions: [".js"] },              // .jsx is a build-time source, not a runtime file
  { dir: "css", extensions: [".css"] },
  { dir: "assets", extensions: [".svg", ".png", ".webp", ".wav"] },
]);
// Pages that must exist in the output or the build fails.
// `landing.html` and `css/landing.css` are mandatory because `/` rewrites to the first and it is
// unreadable without the second — a missing landing page must fail the build, not production.
export const MANDATORY = Object.freeze([
  "index.html", "login.html", "hub.html", "landing.html", "docs.html", "404.html", "_redirects",
  "sitemap.xml",
  "produktet.html", "saadan-virker-det.html", "elev-og-laerer.html", "til-skoler.html",
  "priser.html", "om-laerlig.html",
  "app.js", "style.css", "supabaseClient.js", "css/theme.css", "css/landing.css", "js/landing.js",
]);

// THE ROUTING TABLE. `html_handling: "none"` keeps explicit .html addresses intact — nothing 307s
// the extension away — but it also means a clean path like `/produktet` resolves to nothing on its
// own. Each public route is therefore listed here explicitly, one internal rewrite per page.
//
// THE ROOT IS THE PUBLIC WEBSITE, NOT THE QUIZ. `/` serves `landing.html`; the student quiz keeps
// its own address at `/index.html`, unmoved and unrenamed, and every in-app link, role redirect and
// Playwright assertion that names `/index.html` resolves exactly as before. The site's "VI LÆRER!"
// call to action is a plain relative link to `login.html`, which is where role routing already
// lives (js/login.js).
//
// Status 200 makes each entry an INTERNAL REWRITE, not a redirect: the address bar keeps showing
// the clean path and no 3xx is emitted. A 301/302 would expose the `.html` file in the URL bar and
// reintroduce the round trip these rules exist to remove.
//
// AN EXPLICIT LIST, NEVER A PATTERN. This deliberately is not a SPA fallback (`/* … 200`) and not a
// generic extensionless resolver: unknown paths must keep reaching the 404 page, so a mistyped or
// dead link fails visibly instead of silently rendering a marketing page. `validateOutput()` holds
// the emitted file to exactly this list, in this order, refuses any wildcard, refuses any status
// other than 200, and refuses a rule whose target is not actually in the output.
//
// Adding a public page means adding it here AND to RUNTIME_HTML. Nothing resolves by convention.
export const REDIRECT_RULES = Object.freeze([
  "/ /landing.html 200",
  "/produktet /produktet.html 200",
  "/saadan-virker-det /saadan-virker-det.html 200",
  "/elev-og-laerer /elev-og-laerer.html 200",
  "/til-skoler /til-skoler.html 200",
  "/priser /priser.html 200",
  "/om-laerlig /om-laerlig.html 200",
]);

// Clean route → the file it serves. Derived from the table above so the two cannot disagree; used
// by the reference check in the tests to resolve links like `href="/produktet"`.
export const ROUTE_TO_FILE = Object.freeze(Object.fromEntries(
  REDIRECT_RULES.map((r) => { const [from, to] = r.split(/\s+/); return [from, to.replace(/^\//, "")]; }),
));

// ── SEARCH-ENGINE CLASSIFICATION ──────────────────────────────────────────────────────────────
// Every HTML page that ships is EITHER public marketing OR an internal surface. There is no third
// state and no default: `validateOutput()` refuses an output containing a page that is in neither
// list, so a new page cannot reach production without someone deciding which it is.
//
// PUBLIC pages carry NO robots directive at all — indexing is the default, and an explicit
// "index, follow" would just be one more thing to keep correct.
//
// INTERNAL pages carry `noindex`. They are the student app, the teacher and admin surfaces, the
// auth flows, and the two generated system pages. They answer nothing a searcher is looking for:
// without JavaScript they render a loading shell, and with it the auth guard bounces to login.
// NOTE: noindex keeps them out of search results; it does NOT make them private. The real
// boundary is the auth guard and RLS — this list is about search hygiene, not access control.
export const PUBLIC_HTML = Object.freeze([
  "landing.html", "produktet.html", "saadan-virker-det.html", "elev-og-laerer.html",
  "til-skoler.html", "priser.html", "om-laerlig.html",
]);
export const INTERNAL_HTML = Object.freeze([
  // student app
  "index.html", "hub.html", "shop.html", "avatar.html", "collection.html", "themes.html",
  "leaderboard.html", "achievements.html",
  // teacher + admin
  "teacher.html", "student-detail.html", "admin.html",
  // auth flows
  "login.html", "reset-password.html",
  // generated system pages
  "docs.html", "404.html",
]);

// ── THE SITEMAP ───────────────────────────────────────────────────────────────────
// DERIVED, NEVER HAND-MAINTAINED. REDIRECT_RULES already IS the list of public addresses — one
// clean route per marketing page, an explicit list with no pattern in it. The sitemap is generated
// from that same table, so the two cannot drift apart: adding a public page stays one edit in
// REDIRECT_RULES (plus RUNTIME_HTML and PUBLIC_HTML), and the sitemap follows on the next build.
// `validateOutput()` refuses an output whose sitemap disagrees with the table, and refuses a table
// whose targets disagree with PUBLIC_HTML — so a future mismatch fails the build, loudly.
//
// THE HOST IS AN IDN. `lærlig.dk` is the real domain; `xn--lrlig-sra.dk` is the same name written
// in punycode. The sitemap protocol asks that URLs "follow the RFC-3986 standard for URIs, the
// RFC-3987 standard for IRIs, and the XML standard"; RFC 3987 permits non-ASCII in the host, and
// the document is UTF-8, so the readable form is standards-compliant and is what ships. It is one
// constant on purpose: moving to the A-label, if Search Console ever demands it, is a one-line
// change and every URL follows.
export const SITE_ORIGIN = "https://lærlig.dk";

// The public addresses, in the routing table's own order (the menu order). Derived, not restated.
export const PUBLIC_ROUTES = Object.freeze(Object.keys(ROUTE_TO_FILE));

// Percent-encode the PATH per RFC 3986, segment by segment, so a future route carrying a non-ASCII
// letter or a space cannot emit a malformed URL. Today's routes match `^/[a-z-]*$` and therefore
// pass through byte-for-byte — the encoding is here for the next route, not this one.
const encodePath = (path) => path.split("/").map((seg) => encodeURIComponent(seg)).join("/");
// The five characters the sitemap protocol requires to be entity-escaped. `&` must be replaced
// first, or the ampersands introduced by the later replacements would be escaped twice.
export const xmlEscape = (s) => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
// The inverse, for reading a <loc> back out. `&amp;` LAST, for the mirror-image reason.
export const xmlUnescape = (s) => String(s)
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&amp;/g, "&");

export const SITEMAP_FILE = "sitemap.xml";
export const SITEMAP_XMLNS = "http://www.sitemaps.org/schemas/sitemap/0.9";

// The absolute URL of every public route, in table order.
export const sitemapUrls = () => PUBLIC_ROUTES.map((route) => SITE_ORIGIN + encodePath(route));

// NO <lastmod>, <changefreq> OR <priority>. The repository has no deterministic source for any of
// them — a build timestamp is not a modification date, and a hand-picked priority is a guess
// dressed up as data. A <url> carrying only <loc> is a complete, valid entry.
// Deterministic by construction: no clock, no environment, no filesystem listing.
export function sitemapXml() {
  const entries = sitemapUrls()
    .map((url) => `  <url>\n    <loc>${xmlEscape(url)}</loc>\n  </url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n`
       + `<urlset xmlns="${SITEMAP_XMLNS}">\n${entries}\n</urlset>\n`;
}

// ── what may never appear in the output ───────────────────────────────────────────────────────
export const FORBIDDEN_EXTENSIONS = Object.freeze([
  ".md", ".map", ".ts", ".jsx", ".mjs", ".cjs", ".json", ".ps1", ".log", ".txt", ".lock", ".jsonl", ".env", ".yml", ".yaml",
]);
export const FORBIDDEN_NAMES = Object.freeze([
  "package.json", "package-lock.json", "CLAUDE.md", "project-state.md", "ROADMAP.md",
  "deno.lock", ".env", ".env.local", ".env.example", "KUN TIL MIG.txt",
]);
export const FORBIDDEN_DIRS = Object.freeze([
  "docs", "tests", "tools", "supabase", "node_modules", "packages", "production", "debug", "logs",
  "src", "data", ".git", ".github", ".claude", ".vercel", ".vscode", "playwright-report", "test-results",
]);
// Text that must not occur anywhere in a shipped text file.
export const FORBIDDEN_STRINGS = Object.freeze([
  "D-098", "project-state", "ROADMAP", "KUN TIL MIG", "CLAUDE.md",
]);
// The ONLY tolerated occurrences, and why. These two are source-code comments in browser modules
// that were already public; they name an internal file but serve nothing — `CLAUDE.md` is asserted
// absent from the output. Listed explicitly, with the file and the string, so this cannot quietly
// become a place to park new leaks: a test asserts the list is exactly these two entries.
export const KNOWN_STRING_EXCEPTIONS = Object.freeze([
  { file: "js/analytics.js", string: "CLAUDE.md", reason: "header comment citing the privacy guarantees' source documents" },
  { file: "js/sentry.js", string: "CLAUDE.md", reason: "header comment citing the fail-soft guarantees' source documents" },
]);

const toPosix = (p) => p.split(sep).join("/");
const extOf = (p) => { const b = posix.basename(p); const i = b.lastIndexOf("."); return i <= 0 ? "" : b.slice(i).toLowerCase(); };

// A path is only usable if it stays inside the repo and is not a symlink at ANY level — a symlink
// is exactly how a file outside the allowlist would otherwise be pulled in.
function assertSafeSource(rel) {
  if (rel.includes("..") || rel.startsWith("/") || rel.startsWith("\\") || /^[a-zA-Z]:/.test(rel)) {
    throw new Error(`path traversal or absolute path refused: ${rel}`);
  }
  const abs = resolve(REPO, rel);
  // `relative` is measured from the repo root, so anything that climbs out starts with ".."
  // and anything that lands on the root itself is empty. Absolute inputs are already refused above.
  const insideRepo = relative(REPO, abs);
  if (insideRepo === "" || insideRepo.startsWith("..")) {
    throw new Error(`resolves outside the repository: ${rel}`);
  }
  let walk = REPO;
  for (const part of toPosix(rel).split("/")) {
    walk = join(walk, part);
    if (!existsSync(walk)) throw new Error(`missing required source file: ${rel}`);
    if (lstatSync(walk).isSymbolicLink()) throw new Error(`symlink refused (could escape the allowlist): ${toPosix(relative(REPO, walk))}`);
  }
  return abs;
}

function listDir(rel, extensions) {
  const out = [];
  const walk = (r) => {
    const abs = resolve(REPO, r);
    for (const name of readdirSync(abs).sort()) {          // sorted → deterministic
      const childRel = posix.join(toPosix(r), name);
      const childAbs = join(abs, name);
      const st = lstatSync(childAbs);
      if (st.isSymbolicLink()) throw new Error(`symlink refused (could escape the allowlist): ${childRel}`);
      if (st.isDirectory()) { walk(childRel); continue; }
      if (!st.isFile()) continue;
      if (name.startsWith(".")) continue;                   // dotfiles never ship
      if (extensions.includes(extOf(name))) out.push(childRel);
    }
  };
  walk(rel);
  return out.sort();
}

// ── the two generated pages ───────────────────────────────────────────────────────────────────
// No timestamps, no build ids, no project information — deterministic and neutral.
export const DOCS_STUB_MARKER = "data-generated=\"cloudflare-static-build\"";
export function docsStubHtml() {
  return `<!DOCTYPE html>
<html lang="da">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Dokumentation</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#0f1220; color:#e8eaf2; font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }
  .card { max-width:32rem; padding:2rem; text-align:center; }
  h1 { font-size:1.35rem; margin:0 0 .75rem; }
  p { margin:0 0 1.5rem; color:#aab0c6; line-height:1.6; }
  a { display:inline-block; padding:.65rem 1.25rem; border-radius:.5rem;
      background:#4c6ef5; color:#fff; text-decoration:none; font-weight:600; }
  a:hover { background:#3b5bdb; }
</style>
</head>
<body ${DOCS_STUB_MARKER}>
  <main class="card">
    <h1>Dokumentationen er ikke offentligt tilgængelig</h1>
    <p>Denne side er kun til internt brug.</p>
    <a href="hub.html">Tilbage til forsiden</a>
  </main>
</body>
</html>
`;
}
export function notFoundHtml() {
  return `<!DOCTYPE html>
<html lang="da">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Siden blev ikke fundet</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#0f1220; color:#e8eaf2; font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }
  .card { max-width:32rem; padding:2rem; text-align:center; }
  h1 { font-size:2.5rem; margin:0 0 .5rem; }
  h2 { font-size:1.15rem; margin:0 0 .75rem; font-weight:600; }
  p { margin:0 0 1.5rem; color:#aab0c6; line-height:1.6; }
  a { display:inline-block; padding:.65rem 1.25rem; border-radius:.5rem;
      background:#4c6ef5; color:#fff; text-decoration:none; font-weight:600; }
  a:hover { background:#3b5bdb; }
</style>
</head>
<body>
  <main class="card">
    <h1>404</h1>
    <h2>Siden blev ikke fundet</h2>
    <p>Siden findes ikke eller er blevet flyttet.</p>
    <a href="landing.html">Gå til forsiden</a>
  </main>
</body>
</html>
`;
}

// ── validation of the generated sitemap ───────────────────────────────────────────────────────
// The sitemap is the one shipped file a search engine reads INSTEAD of the site, so a wrong one
// fails quietly: nothing 404s, nothing looks broken, the wrong pages simply get indexed. It is
// therefore checked two independent ways rather than one.
//
//   1. STRUCTURALLY, against the sitemap protocol — the declaration, the urlset namespace, matched
//      tags, no element this build does not emit, no wildcard, https only, the right host, no
//      .html address, no duplicate, and exactly the routes classified public, in the routing
//      table's order. Every URL is READ BACK OUT of the document, not taken from the generator.
//   2. BY IDENTITY, against sitemapXml() — the shipped bytes must be what the current routing
//      table produces.
//
// Node ships no XML parser and the project's test stack does not carry one; taking on a dependency
// to read seven <loc> elements would be a larger change than the thing it validates. The two
// checks together are stronger than either alone: (1) catches a generator emitting plausible
// nonsense, (2) catches a document edited after it was generated.
export function validateSitemap(outDir) {
  const problems = [];
  const abs = join(outDir, SITEMAP_FILE);
  if (!existsSync(abs)) { problems.push(`${SITEMAP_FILE} is missing from the output`); return problems; }
  if (!lstatSync(abs).isFile()) { problems.push(`${SITEMAP_FILE} is not a regular file`); return problems; }

  const xml = readFileSync(abs, "utf8");
  const expected = sitemapUrls();

  // ── the document's shape ──
  if (!xml.startsWith(`<?xml version="1.0" encoding="UTF-8"?>\n`)) {
    problems.push(`${SITEMAP_FILE} does not begin with the UTF-8 XML declaration`);
  }
  if (!xml.includes(`<urlset xmlns="${SITEMAP_XMLNS}">`)) {
    problems.push(`${SITEMAP_FILE} is missing the sitemaps 0.9 urlset namespace`);
  }
  if (!xml.trimEnd().endsWith("</urlset>")) problems.push(`${SITEMAP_FILE} does not close its urlset`);
  // Every element must be one this build emits. A stray <priority>, an invented <lastmod> or an
  // injected <sitemapindex> is refused rather than ignored.
  const ALLOWED_TAGS = ["urlset", "/urlset", "url", "/url", "loc", "/loc"];
  for (const m of xml.replace(/<\?xml[^>]*\?>/, "").matchAll(/<([^>\s]+)[^>]*>/g)) {
    if (!ALLOWED_TAGS.includes(m[1])) problems.push(`${SITEMAP_FILE} contains an unexpected element: <${m[1]}>`);
  }
  for (const [open, close] of [["<url>", "</url>"], ["<loc>", "</loc>"]]) {
    const opened = xml.split(open).length - 1;
    const closed = xml.split(close).length - 1;
    if (opened !== closed) problems.push(`${SITEMAP_FILE} has ${opened} ${open} but ${closed} ${close}`);
    if (opened !== expected.length) problems.push(`${SITEMAP_FILE} has ${opened} ${open} element(s), expected ${expected.length}`);
  }
  // No wildcard, and nothing that could stand in for a route nobody listed.
  if (xml.includes("*")) {
    problems.push(`${SITEMAP_FILE} contains a wildcard — every URL must be an explicit public route`);
  }

  // ── the URLs, read back out of the document ──
  const locs = [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/g)].map((m) => xmlUnescape(m[1].trim()));
  if (new Set(locs).size !== locs.length) problems.push(`${SITEMAP_FILE} lists a duplicate URL`);

  const expectedHost = new URL(SITE_ORIGIN).hostname;
  const parsed = [];
  for (const loc of locs) {
    let url;
    try { url = new URL(loc); } catch {
      problems.push(`${SITEMAP_FILE}: ${JSON.stringify(loc)} is not an absolute URL`);
      continue;
    }
    parsed.push(url);
    if (url.protocol !== "https:") problems.push(`${SITEMAP_FILE}: ${loc} does not use https`);
    // `new URL` normalises an IDN host to its A-label, so this compares the same two forms
    // whether the document was written in punycode or in Danish letters.
    if (url.hostname !== expectedHost) problems.push(`${SITEMAP_FILE}: ${loc} is not on ${expectedHost}`);
    if (/\.html/i.test(loc)) problems.push(`${SITEMAP_FILE}: ${loc} is a .html address, not the public clean route`);
  }

  // Exactly the public routes, in the routing table's order — no more, no fewer, no reordering.
  if (JSON.stringify(locs) !== JSON.stringify(expected)) {
    problems.push(`${SITEMAP_FILE} does not list exactly the public routes, in order: ` +
      `expected ${JSON.stringify(expected)}, found ${JSON.stringify(locs)}`);
  }
  // …and no internal surface, named either as a file or as a route.
  for (const page of INTERNAL_HTML) {
    const stem = page.replace(/\.html$/, "");
    if (xml.includes(page)) problems.push(`${SITEMAP_FILE} names an internal page: ${page}`);
    if (parsed.some((u) => u.pathname === `/${stem}`)) {
      problems.push(`${SITEMAP_FILE} lists the internal route /${stem}`);
    }
  }

  // ── and the bytes must be what the current routing table generates ──
  if (xml !== sitemapXml()) {
    problems.push(`${SITEMAP_FILE} is not the document generated from REDIRECT_RULES — rebuild it`);
  }
  return problems;
}

// ── validation of the finished output ─────────────────────────────────────────────────────────
export function validateOutput(outDir, { strings = FORBIDDEN_STRINGS, exceptions = KNOWN_STRING_EXCEPTIONS } = {}) {
  const problems = [];
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const abs = join(dir, name);
      const st = lstatSync(abs);
      const rel = toPosix(relative(outDir, abs));
      if (st.isSymbolicLink()) { problems.push(`symlink in output: ${rel}`); continue; }
      if (st.isDirectory()) {
        if (FORBIDDEN_DIRS.includes(name)) problems.push(`forbidden directory in output: ${rel}`);
        walk(abs); continue;
      }
      files.push(rel);
      if (name.startsWith(".") && name !== ".assetsignore") problems.push(`dotfile in output: ${rel}`);
      if (FORBIDDEN_NAMES.includes(name)) problems.push(`forbidden filename in output: ${rel}`);
      if (FORBIDDEN_EXTENSIONS.includes(extOf(name))) problems.push(`forbidden file type in output: ${rel}`);
      if (/^\.env/i.test(name)) problems.push(`env file in output: ${rel}`);
    }
  };
  walk(outDir);

  const allowed = new Set(exceptions.map((e) => `${e.file}::${e.string}`));
  for (const rel of files) {
    if (![".html", ".js", ".css", ".svg", ".xml"].includes(extOf(rel))) continue;
    let text;
    try { text = readFileSync(join(outDir, rel), "utf8"); } catch { continue; }
    for (const s of strings) {
      if (!text.includes(s)) continue;
      if (allowed.has(`${rel}::${s}`)) continue;
      problems.push(`forbidden string ${JSON.stringify(s)} in output file: ${rel}`);
    }
  }
  // The generated docs.html must be the stub, and must never reach for the docs directory.
  // `_redirects` is Cloudflare CONFIGURATION, not an asset. It must hold exactly the routing table
  // declared above — no more, no fewer, in the same order. An extra rule, a wildcard turning this
  // into a SPA fallback, or a 3xx status would silently change routing and is refused here rather
  // than discovered in production. Every rewrite target must also exist in the output, so a route
  // can never point at a file that was not shipped.
  const redirects = join(outDir, "_redirects");
  if (existsSync(redirects)) {
    const raw = readFileSync(redirects, "utf8");
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length !== REDIRECT_RULES.length) {
      problems.push(`_redirects must hold exactly ${REDIRECT_RULES.length} rule(s), found ${lines.length}`);
    }
    for (let i = 0; i < Math.max(lines.length, REDIRECT_RULES.length); i++) {
      if (lines[i] !== REDIRECT_RULES[i]) {
        problems.push(`_redirects line ${i + 1} is ${JSON.stringify(lines[i] ?? null)}, expected ${JSON.stringify(REDIRECT_RULES[i] ?? null)}`);
      }
    }
    if (/\*/.test(raw)) problems.push("_redirects contains a wildcard — unknown paths must reach the 404 page");
    for (const line of lines) {
      const [, to, status] = line.split(/\s+/);
      if (status !== "200") problems.push(`_redirects rule ${JSON.stringify(line)} is not an internal 200 rewrite`);
      const target = (to ?? "").replace(/^\//, "");
      if (target && !existsSync(join(outDir, target))) {
        problems.push(`_redirects rewrites to a file missing from the output: ${target}`);
      }
    }
  }
  // Every shipped page must be classified, and must match its class. An unclassified page is
  // refused outright: that is what stops a new HTML file reaching production with nobody having
  // decided whether search engines may show it.
  for (const rel of files) {
    if (!/^[^/]+\.html$/.test(rel)) continue;                    // root-level pages only
    const isPublic = PUBLIC_HTML.includes(rel);
    const isInternal = INTERNAL_HTML.includes(rel);
    if (!isPublic && !isInternal) {
      problems.push(`unclassified page in output: ${rel} — add it to PUBLIC_HTML or INTERNAL_HTML`);
      continue;
    }
    if (isPublic && isInternal) { problems.push(`${rel} is in both PUBLIC_HTML and INTERNAL_HTML`); continue; }
    const html = readFileSync(join(outDir, rel), "utf8");
    const noindex = /<meta\s+name="robots"[^>]*content="[^"]*noindex/i.test(html);
    if (isInternal && !noindex) problems.push(`internal page is indexable: ${rel} needs a noindex robots meta`);
    if (isPublic && /noindex|nofollow/i.test(html)) problems.push(`public page blocks indexing: ${rel}`);
  }

  // ONE SOURCE OF TRUTH, ASSERTED. The routing table names the public ADDRESSES; PUBLIC_HTML names
  // the public PAGES. The sitemap is derived from the first, the robots classification from the
  // second. If the two ever describe different sets, the sitemap would be right about one of them
  // and wrong about the other — so neither is trusted until they agree, and the build stops here
  // rather than publishing a sitemap that quietly omits or invents a page.
  const routedTargets = [...new Set(Object.values(ROUTE_TO_FILE))].sort();
  const publicPages = [...PUBLIC_HTML].sort();
  if (JSON.stringify(routedTargets) !== JSON.stringify(publicPages)) {
    problems.push("the routing table and PUBLIC_HTML describe different public pages: " +
      `${JSON.stringify(routedTargets)} vs ${JSON.stringify(publicPages)}`);
  }
  // The sitemap is checked when it is present, exactly as _redirects is; its EXISTENCE is enforced
  // by MANDATORY in build(), so a build that fails to emit it stops before it reaches here.
  if (existsSync(join(outDir, SITEMAP_FILE))) problems.push(...validateSitemap(outDir));

  const docs = join(outDir, "docs.html");
  if (existsSync(docs)) {
    const t = readFileSync(docs, "utf8");
    if (!t.includes(DOCS_STUB_MARKER)) problems.push("docs.html in output is not the generated public stub");
    if (/fetch\s*\(/.test(t)) problems.push("docs.html stub contains a fetch() call");
    if (/["'`]\/?docs\//.test(t)) problems.push("docs.html stub references the docs/ directory");
  }
  return { problems, files: files.sort() };
}

// ── build ─────────────────────────────────────────────────────────────────────────────────────
export function build({ quiet = false } = {}) {
  // Only ever remove the directory this script generates, and only after confirming that is what
  // it is — never a path handed in from outside.
  if (existsSync(OUT)) {
    if (toPosix(relative(REPO, OUT)) !== OUT_DIR_NAME) throw new Error(`refusing to delete ${OUT}`);
    rmSync(OUT, { recursive: true, force: true });
  }
  mkdirSync(OUT, { recursive: true });

  const planned = [...RUNTIME_HTML, ...ROOT_FILES].sort();
  for (const d of ASSET_DIRS) planned.push(...listDir(d.dir, d.extensions));
  planned.sort();

  const copied = [];
  for (const rel of planned) {
    const src = assertSafeSource(rel);
    const dest = join(OUT, rel);
    const insideOut = relative(OUT, dest);
    if (insideOut.startsWith("..")) throw new Error(`refusing to write outside the output directory: ${rel}`);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
    copied.push(toPosix(rel));
  }
  writeFileSync(join(OUT, "docs.html"), docsStubHtml(), "utf8");
  writeFileSync(join(OUT, "404.html"), notFoundHtml(), "utf8");
  writeFileSync(join(OUT, "_redirects"), REDIRECT_RULES.join("\n") + "\n", "utf8");
  writeFileSync(join(OUT, SITEMAP_FILE), sitemapXml(), "utf8");
  const generated = ["404.html", "_redirects", SITEMAP_FILE, "docs.html"];

  for (const m of MANDATORY) {
    if (!existsSync(join(OUT, m))) throw new Error(`mandatory file missing from the output: ${m}`);
  }
  const { problems, files } = validateOutput(OUT);
  if (problems.length) {
    rmSync(OUT, { recursive: true, force: true });
    throw new Error(`output validation failed (${problems.length}); output removed:\n  - ${problems.join("\n  - ")}`);
  }

  let bytes = 0;
  for (const f of files) bytes += lstatSync(join(OUT, f)).size;
  const result = { outDir: OUT, files, fileCount: files.length, bytes, copiedCount: copied.length, generated };
  if (!quiet) {
    console.log(`copied    ${copied.length} file(s) from the allowlist`);
    console.log(`generated ${generated.length} file(s): ${generated.join(", ")}`);
    console.log(`total     ${files.length} file(s), ${bytes.toLocaleString("en-US")} bytes (${(bytes / 1048576).toFixed(2)} MB)`);
    console.log(`output    ${toPosix(relative(REPO, OUT))}/`);
  }
  return result;
}

const invoked = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invoked) {
  try { build(); } catch (e) { console.error("build failed: " + e.message); process.exit(1); }
}
