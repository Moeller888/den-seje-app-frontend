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

const server = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
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

const MUST_SERVE = [
  "/", "/index.html", "/login.html", "/hub.html", "/teacher.html", "/admin.html", "/shop.html",
  "/student-detail.html", "/avatar.html", "/achievements.html", "/collection.html",
  "/leaderboard.html", "/themes.html", "/reset-password.html",
  "/docs.html", "/404.html",
  "/app.js", "/style.css", "/supabaseClient.js", "/css/theme.css",
  "/js/supabase.js", "/js/login.js", "/js/avatar-layers.js",
  "/assets/avatar/base/body.svg", "/assets/avatar-r2/torso/armor-knight-r2-v1.webp",
];
const MUST_NOT_SERVE = [
  "/docs/ROADMAP.md", "/docs/project-state.md", "/docs/PROJECT_VISION.md", "/docs/157o-read-aloud.md",
  "/CLAUDE.md", "/package.json", "/package-lock.json", "/.env", "/.env.local", "/.env.example",
  "/KUN TIL MIG.txt", "/legacy_questions.json", "/runBatch_dump.txt", "/worker-conc-A.log",
  "/tests/unit/cloudflare-static-build.test.mjs", "/tools/cloudflare-build-static.mjs",
  "/supabase/functions/process-event/index.ts", "/node_modules/.package-lock.json",
  "/gamefeel.html", "/data/questions.js", "/wrangler.jsonc", "/.gitignore",
  "/../package.json", "/%2e%2e/package.json",
];

const get = (path) => new Promise((ok) => {
  const { port } = server.address();
  fetch(`http://127.0.0.1:${port}${path}`).then(async (r) => ok({ status: r.status, body: await r.text() })).catch(() => ok({ status: 0, body: "" }));
});

server.listen(0, "127.0.0.1", async () => {
  let failures = 0;
  console.log("MUST SERVE (200):");
  for (const p of MUST_SERVE) {
    const r = await get(p);
    const ok = r.status === 200;
    if (!ok) failures++;
    console.log(`  ${ok ? "OK  " : "FAIL"} ${String(r.status).padStart(3)}  ${p}`);
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
