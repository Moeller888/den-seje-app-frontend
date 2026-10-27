// Serves THIS commit's deploy bundle (the exact `dist-cloudflare/` output of
// tools/cloudflare-build-static.mjs — what Cloudflare would publish) on loopback, pointed at the
// LOCAL Supabase stack instead of production. Proof of concept for isolated E2E.
//
// The frontend hardcodes the production Supabase URL and publishable key (js/supabase.js,
// supabaseClient.js, shop.html). Production code is not changed: the server rewrites those two
// literals in text responses at serve time. A served text file that still mentions production
// after the rewrite is refused with HTTP 500 — the browser never receives a production URL.
//
//   node tests/isolated/serve-build.mjs   (env: ISOLATED_E2E=1, ISOLATED_BASE_URL,
//                                          ISOLATED_SUPABASE_URL, ISOLATED_SUPABASE_ANON_KEY)
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, normalize, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { assertIsolated, mentionsProd, PROD_PROJECT_REF } from "./isolation-guard.mjs";
import { loadMirror, rewriteCdnUrls, rewriteModule, urlForMirrorPath, MIRROR_PREFIX } from "./cdn-mirror.mjs";

export const PROD_SUPABASE_URL = `https://${PROD_PROJECT_REF}.supabase.co`;
// The production publishable key is public (it ships in the frontend); it is replaced, not hidden.
export const PROD_PUBLISHABLE_KEY_RE = /sb_publishable_[A-Za-z0-9_-]+/g;

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".wav": "audio/wav", ".xml": "application/xml", ".json": "application/json" };
const TEXT = new Set([".html", ".js", ".css", ".svg", ".xml", ".json"]);

export function rewriteForLocal(text, { supabaseUrl, anonKey }) {
  return rewriteCdnUrls(text.split(PROD_SUPABASE_URL).join(supabaseUrl).replace(PROD_PUBLISHABLE_KEY_RE, anonKey));
}

export function resolveInside(root, urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath.split("?")[0].split("#")[0]); } catch { return null; }
  if (p.endsWith("/")) p += "index.html";
  const abs = normalize(join(root, p));
  const rootAbs = resolve(root) + sep;
  return abs.startsWith(rootAbs) ? abs : null;
}

// The production Worker (worker/index.js) answers two dynamic routes before the asset layer:
// POST /api/tts and GET /tts/v<N>/…. Isolated runs have no Azure key and no R2 bucket, so this server
// answers both exactly as the Worker does in that state — 503 azure_not_configured /
// tts_not_configured — and the frontend takes its fail-soft path (no 🔊). No request ever leaves the
// runner; read-aloud SUCCESS is therefore not covered by the isolated suite.
export function workerRoute(method, pathname) {
  if (pathname === "/api/tts") {
    return method === "POST" ? { status: 503, body: { error: "azure_not_configured" } } : { status: 405, body: { error: "method_not_allowed" } };
  }
  if (/^\/tts\/v\d+\//.test(pathname)) return { status: 503, body: { error: "tts_not_configured" } };
  return null;
}

export function startServer({ root, port, supabaseUrl, anonKey, mirror = null }) {
  const server = createServer((req, res) => {
    // CDN modules (cdn-mirror.mjs): served from the mirror fetched before the network lock; a module
    // that is not in it is a 404 — never a network fetch.
    if ((req.url || "").startsWith(MIRROR_PREFIX)) {
      const url = urlForMirrorPath(req.url);
      const hit = url && mirror?.index[url];
      if (!hit) { res.writeHead(404); res.end("not in the CDN mirror"); return; }
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" });
      res.end(rewriteModule(mirror.read(hit.key), url));
      return;
    }
    const worker = workerRoute(req.method, (req.url || "/").split("?")[0]);
    if (worker) {
      res.writeHead(worker.status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end(JSON.stringify(worker.body));
      return;
    }
    const file = resolveInside(root, req.url || "/");
    if (!file || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end("not found"); return; }
    const ext = extname(file).toLowerCase();
    let body = readFileSync(file);
    if (TEXT.has(ext)) {
      const text = rewriteForLocal(body.toString("utf8"), { supabaseUrl, anonKey });
      if (mentionsProd(text) && text.includes(PROD_PROJECT_REF)) {
        res.writeHead(500); res.end("refused: response still names the production project"); return;
      }
      body = Buffer.from(text, "utf8");
    }
    res.writeHead(200, { "content-type": TYPES[ext] ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  });
  return new Promise((ok) => server.listen(port, "127.0.0.1", () => ok(server)));
}

const invoked = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invoked) {
  assertIsolated(process.env);
  const root = resolve(fileURLToPath(new URL("../../dist-cloudflare", import.meta.url)));
  if (!existsSync(join(root, "login.html"))) { console.error("dist-cloudflare/ missing: run node tools/cloudflare-build-static.mjs first"); process.exit(1); }
  const port = Number(new URL(process.env.ISOLATED_BASE_URL).port || 80);
  const anonKey = process.env.ISOLATED_SUPABASE_ANON_KEY;
  if (typeof anonKey !== "string" || anonKey.length < 20) { console.error("ISOLATED_SUPABASE_ANON_KEY missing"); process.exit(1); }
  const mirror = loadMirror(process.env.ISOLATED_CDN_MIRROR);
  if (!mirror) { console.error("ISOLATED_CDN_MIRROR missing or empty: run tests/isolated/cdn-mirror.mjs --fetch first"); process.exit(1); }
  await startServer({ root, port, supabaseUrl: process.env.ISOLATED_SUPABASE_URL, anonKey, mirror });
  console.log(`serving dist-cloudflare/ on 127.0.0.1:${port} → local Supabase`);
}
