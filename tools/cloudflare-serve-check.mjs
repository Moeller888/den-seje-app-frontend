// Local smoke test of dist-cloudflare over real HTTP, mirroring the Worker's asset behaviour
// (`html_handling: auto-trailing-slash`, `not_found_handling: 404-page`).
//
// It answers two questions the unit tests cannot: does every runtime page actually SERVE, and is
// every internal path genuinely unreachable over HTTP rather than merely absent from a file list.
// Node builtins only, so it runs with SKIP_DEPENDENCY_INSTALL=1.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, normalize } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const ROOT = join(REPO, "dist-cloudflare");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".wav": "audio/wav" };

if (!existsSync(ROOT)) { console.error("dist-cloudflare/ is missing — run: npm run build:cloudflare"); process.exit(1); }

// Model the Worker's asset routing exactly as configured, so this check proves the contract rather
// than approximating it:
//   html_handling: "none"  → paths resolve LITERALLY. No extension guessing, so `/login` is a 404
//                            and `/login.html` is served directly with no 3xx.
//   _redirects             → the public website's routing table: `/` plus one clean route per
//                            information page, each an internal 200 rewrite. Status 200 means
//                            INTERNAL: the response body is the .html file while the URL keeps
//                            showing the clean path. The quiz keeps its own address at
//                            /index.html and is NOT what `/` serves — both halves are asserted
//                            below, as is every clean route in the table.
//   `_redirects` itself is configuration and is never served as an asset.
const REWRITES = new Map(
  readFileSync(join(ROOT, "_redirects"), "utf8").split("\n").map((l) => l.trim()).filter(Boolean)
    .map((line) => { const [from, to, status] = line.split(/\s+/); return [from, { to, status: Number(status) }]; }),
);

const server = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  const rewrite = REWRITES.get(p);
  if (rewrite && rewrite.status === 200) p = rewrite.to;      // internal rewrite; the URL is unchanged
  if (p === "/_redirects" || p === "/_headers") {             // routing config is never an asset
    res.writeHead(404, { "content-type": "text/html" });
    res.end(readFileSync(join(ROOT, "404.html")));
    return;
  }
  // Resolve inside ROOT only; a traversal attempt must never escape.
  const abs = join(ROOT, normalize(p).replace(/^([/\\])+/, ""));
  if (!abs.startsWith(ROOT) || !existsSync(abs) || !statSync(abs).isFile()) {
    const nf = join(ROOT, "404.html");
    res.writeHead(404, { "content-type": "text/html" });
    res.end(existsSync(nf) ? readFileSync(nf) : "404");
    return;
  }
  const ext = abs.slice(abs.lastIndexOf(".")).toLowerCase();
  res.writeHead(200, { "content-type": TYPES[ext] ?? "application/octet-stream" });
  res.end(readFileSync(abs));
});

// The public website: every clean route AND the .html file behind it must serve.
const PUBLIC_ROUTES = [
  ["/", "/landing.html"],
  ["/produktet", "/produktet.html"],
  ["/saadan-virker-det", "/saadan-virker-det.html"],
  ["/elev-og-laerer", "/elev-og-laerer.html"],
  ["/til-skoler", "/til-skoler.html"],
  ["/priser", "/priser.html"],
  ["/om-laerlig", "/om-laerlig.html"],
];

const MUST_SERVE = [
  ...PUBLIC_ROUTES.flat(),
  "/index.html", "/login.html", "/hub.html", "/teacher.html", "/admin.html", "/shop.html",
  "/student-detail.html", "/student-detail.html?id=test", "/avatar.html",
  "/achievements.html", "/collection.html", "/leaderboard.html", "/themes.html", "/reset-password.html",
  "/docs.html", "/404.html",
  "/app.js", "/style.css", "/supabaseClient.js", "/css/theme.css",
  "/js/supabase.js", "/js/login.js", "/js/avatar-layers.js",
  "/assets/avatar/base/body.svg", "/assets/avatar-r2/torso/armor-knight-r2-v1.webp",
];
// The .html contract: explicit addresses serve directly, extensionless ones do NOT exist.
const EXTENSIONLESS_MUST_404 = [
  "/login", "/teacher", "/student-detail", "/avatar", "/reset-password", "/hub", "/admin", "/shop",
  "/landing",
];
const MUST_NOT_SERVE = [
  "/_redirects", "/_headers",
  "/docs/ROADMAP.md", "/docs/project-state.md", "/docs/PROJECT_VISION.md", "/docs/157o-read-aloud.md",
  "/CLAUDE.md", "/package.json", "/package-lock.json", "/.env", "/.env.local", "/.env.example",
  "/KUN TIL MIG.txt", "/legacy_questions.json", "/runBatch_dump.txt", "/worker-conc-A.log",
  "/tests/unit/cloudflare-static-build.test.mjs", "/tools/cloudflare-build-static.mjs",
  "/supabase/functions/process-event/index.ts", "/node_modules/.package-lock.json",
  "/gamefeel.html", "/data/questions.js", "/wrangler.jsonc", "/.gitignore",
  "/../package.json", "/%2e%2e/package.json",
];

// `redirect: "manual"` on purpose: a 307 that silently resolves to 200 is exactly the behaviour
// this change exists to remove, so the RAW status has to be visible.
const get = (path) => new Promise((ok) => {
  const { port } = server.address();
  fetch(`http://127.0.0.1:${port}${path}`, { redirect: "manual" })
    .then(async (r) => ok({ status: r.status, body: await r.text(), location: r.headers.get("location") }))
    .catch(() => ok({ status: 0, body: "", location: null }));
});

server.listen(0, "127.0.0.1", async () => {
  let failures = 0;
  console.log("MUST SERVE — direct 200, no redirect:");
  for (const p of MUST_SERVE) {
    const r = await get(p);
    const ok = r.status === 200;
    if (!ok) failures++;
    const note = r.status >= 300 && r.status < 400 ? `  <- REDIRECT to ${r.location}` : "";
    console.log(`  ${ok ? "OK  " : "FAIL"} ${String(r.status).padStart(3)}  ${p}${note}`);
  }

  console.log("\nEXPLICIT .html CONTRACT — extensionless paths must NOT exist:");
  for (const p of EXTENSIONLESS_MUST_404) {
    const r = await get(p);
    const ok = r.status === 404;
    if (!ok) failures++;
    console.log(`  ${ok ? "OK  " : "FAIL"} ${String(r.status).padStart(3)}  ${p}`);
  }

  console.log("\nCLEAN ROUTES — each serves its page internally, with no redirect:");
  for (const [route, file] of PUBLIC_ROUTES) {
    const a = await get(route), b = await get(file);
    const okStatus = a.status === 200 && b.status === 200;
    const okBody = a.body === b.body && a.body.length > 0;
    if (!okStatus || !okBody) failures++;
    console.log(`  ${okStatus && okBody ? "OK  " : "FAIL"} ${route.padEnd(20)} → ${file.padEnd(24)} ${a.status}/${b.status}, identical body (${a.body.length} B)`);
  }

  console.log("\nTHE QUIZ DID NOT MOVE — /index.html still serves, and / is NOT the quiz:");
  {
    const root = await get("/"), idx = await get("/index.html");
    const okQuiz = idx.status === 200 && idx.body.includes('class="game-shell"');
    const okDistinct = root.body !== idx.body;
    if (!okQuiz) failures++;
    if (!okDistinct) failures++;
    console.log(`  ${okQuiz ? "OK  " : "FAIL"} /index.html = ${idx.status} and is still the quiz shell`);
    console.log(`  ${okDistinct ? "OK  " : "FAIL"} / and /index.html serve different documents`);
  }

  console.log("\nMUST NOT SERVE (404 + the neutral 404 page):");
  for (const p of MUST_NOT_SERVE) {
    const r = await get(p);
    const ok = r.status === 404;
    if (!ok) failures++;
    console.log(`  ${ok ? "OK  " : "LEAK"} ${String(r.status).padStart(3)}  ${p}`);
  }
  // The 404 body must be the neutral generated page, never a directory listing or internal text.
  const nf = await get("/docs/ROADMAP.md");
  for (const bad of ["D-098", "project-state", "ROADMAP", "KUN TIL MIG"]) {
    if (nf.body.includes(bad)) { console.log(`  LEAK  404 body contains ${bad}`); failures++; }
  }
  const docs = await get("/docs.html");
  if (!docs.body.includes("ikke offentligt tilg")) { console.log("  FAIL  /docs.html is not the public stub"); failures++; }
  if (/fetch\s*\(/.test(docs.body)) { console.log("  FAIL  /docs.html stub contains fetch()"); failures++; }

  console.log(`\n${failures === 0 ? "ALL LOCAL CHECKS PASSED" : failures + " CHECK(S) FAILED"}`);
  server.close();
  process.exit(failures === 0 ? 0 : 1);
});
