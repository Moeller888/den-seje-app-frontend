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

export const PROD_SUPABASE_URL = `https://${PROD_PROJECT_REF}.supabase.co`;
// The production publishable key is public (it ships in the frontend); it is replaced, not hidden.
export const PROD_PUBLISHABLE_KEY_RE = /sb_publishable_[A-Za-z0-9_-]+/g;

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".wav": "audio/wav", ".xml": "application/xml", ".json": "application/json" };
const TEXT = new Set([".html", ".js", ".css", ".svg", ".xml", ".json"]);

export function rewriteForLocal(text, { supabaseUrl, anonKey }) {
  return text.split(PROD_SUPABASE_URL).join(supabaseUrl).replace(PROD_PUBLISHABLE_KEY_RE, anonKey);
}

export function resolveInside(root, urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath.split("?")[0].split("#")[0]); } catch { return null; }
  if (p.endsWith("/")) p += "index.html";
  const abs = normalize(join(root, p));
  const rootAbs = resolve(root) + sep;
  return abs.startsWith(rootAbs) ? abs : null;
}

export function startServer({ root, port, supabaseUrl, anonKey }) {
  const server = createServer((req, res) => {
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
  await startServer({ root, port, supabaseUrl: process.env.ISOLATED_SUPABASE_URL, anonKey });
  console.log(`serving dist-cloudflare/ on 127.0.0.1:${port} → local Supabase`);
}
