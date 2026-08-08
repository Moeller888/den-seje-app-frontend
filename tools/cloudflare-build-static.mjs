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
// `landing.html` is the PUBLIC front page and the target of the root rewrite below, so it is
// likewise not optional: without it, `/` would rewrite to a file that does not exist.
export const RUNTIME_HTML = Object.freeze([
  "achievements.html", "admin.html", "avatar.html", "collection.html", "hub.html", "index.html",
  "landing.html", "leaderboard.html", "login.html", "reset-password.html", "shop.html",
  "student-detail.html", "teacher.html", "themes.html",
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
  "app.js", "style.css", "supabaseClient.js", "css/theme.css", "css/landing.css",
]);

// THE ONLY ROUTING RULE. `html_handling: "none"` keeps explicit .html addresses intact — nothing
// 307s the extension away — but it also stops `/` resolving to anything on its own. This restores
// exactly that one behaviour and nothing else.
//
// THE ROOT IS THE PUBLIC LANDING PAGE, NOT THE QUIZ. `/` serves the marketing page at
// `landing.html`; the student quiz keeps its own address at `/index.html`, unmoved and unrenamed,
// and every in-app link, role redirect and Playwright assertion that names `/index.html` continues
// to resolve exactly as before. The landing page's "VI LÆRER!" call to action is a plain relative
// link to `login.html`, which is where role routing already lives (js/login.js).
//
// Status 200 makes it an INTERNAL REWRITE, not a redirect: the browser's address bar keeps showing
// `/` and no 3xx is emitted. A 301/302 here would put `/landing.html` in the URL bar and reintroduce
// the round trip this rule exists to remove.
//
// Deliberately NOT a SPA fallback (`/* /landing.html 200`): unknown paths must keep reaching the 404
// page, so a mistyped or dead link fails visibly instead of silently rendering the landing page.
export const REDIRECTS_RULE = "/ /landing.html 200";

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
    if (![".html", ".js", ".css", ".svg"].includes(extOf(rel))) continue;
    let text;
    try { text = readFileSync(join(outDir, rel), "utf8"); } catch { continue; }
    for (const s of strings) {
      if (!text.includes(s)) continue;
      if (allowed.has(`${rel}::${s}`)) continue;
      problems.push(`forbidden string ${JSON.stringify(s)} in output file: ${rel}`);
    }
  }
  // The generated docs.html must be the stub, and must never reach for the docs directory.
  // `_redirects` is Cloudflare CONFIGURATION, not an asset. It must hold exactly the one rewrite —
  // a second rule, or a wildcard turning this into a SPA fallback, would silently change routing
  // for every unknown path and is refused here rather than discovered in production.
  const redirects = join(outDir, "_redirects");
  if (existsSync(redirects)) {
    const lines = readFileSync(redirects, "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length !== 1) problems.push(`_redirects must hold exactly one rule, found ${lines.length}`);
    else if (lines[0] !== REDIRECTS_RULE) problems.push(`_redirects rule is ${JSON.stringify(lines[0])}, expected ${JSON.stringify(REDIRECTS_RULE)}`);
    if (/^\/\*/m.test(readFileSync(redirects, "utf8"))) problems.push("_redirects contains a wildcard SPA fallback — unknown paths must reach the 404 page");
  }
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
  writeFileSync(join(OUT, "_redirects"), REDIRECTS_RULE + "\n", "utf8");
  const generated = ["404.html", "_redirects", "docs.html"];

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
