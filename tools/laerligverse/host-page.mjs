// D-321: renders laerligverse/host/index.html with its configuration and Content-Security-Policy, and serves
// the host files from an explicit allowlist. Used by tools/laerligverse/serve-local.mjs (local preview) and
// tests/isolated/laerligverse-harness/serve-harness.mjs (isolated E2E). Never part of the deploy bundle.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const HOST_DIR = resolve(HERE, "..", "..", "laerligverse", "host");
/** The only files the host origin serves (plus nothing else: no directory listing, no traversal). */
export const HOST_FILES = Object.freeze(["index.html", "host.css", "host-app.js", "host-core.js", "bridge/index.js", "bridge/protocol.js", "bridge/service.js", "bridge/host.js", "bridge/laerlig-service.js", "bridge/evidence.js", "bridge/learning-sequence.js"]);
/** LOCAL DIDACTIC DEMO ONLY (mode local-preview + backend test-adapter): the test adapter and curated items. */
export const DEV_FILES = Object.freeze(["bridge/test-service.js", "dev/archive-items.js", "dev/test-adapter.js"]);
export const BACKENDS = Object.freeze(["local-supabase", "test-adapter"]);

const ORIGIN_RE = /^(https:\/\/[a-z0-9.-]+(:\d+)?|http:\/\/(127\.0\.0\.1|localhost)(:\d+)?)$/;

/**
 * The host page's policy: its own scripts and styles only; it may call only the Supabase origin and frame
 * only the game origin; no inline script, no plugins, no base or form targets.
 */
export function hostCsp({ gameOrigin, supabaseOrigin }) {
  if (!ORIGIN_RE.test(gameOrigin)) throw new Error(`csp: invalid origin ${gameOrigin}`);
  if (supabaseOrigin !== null && !ORIGIN_RE.test(supabaseOrigin)) throw new Error(`csp: invalid origin ${supabaseOrigin}`);
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self'",
    // The test-adapter demo talks to no backend at all.
    supabaseOrigin === null ? "connect-src 'none'" : `connect-src ${supabaseOrigin}`,
    `frame-src ${gameOrigin}`,
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
  ].join("; ");
}

/** index.html with config and CSP filled in. The JSON is escaped so it can never close its script tag. */
export function renderHostPage({ mode, backend = "local-supabase", gameOrigin, gameUrl, supabaseUrl = null, anonKey = null, subject = "historie", objectiveMap = null, h5 = false, sequence = false, stepContexts = null }) {
  if (mode !== "local-preview" && mode !== "isolated-test") throw new Error(`host page: unknown mode ${mode}`);
  if (!BACKENDS.includes(backend)) throw new Error(`host page: unknown backend ${backend}`);
  // The test adapter is a local demo: never in the isolated test (which must prove the REAL backend).
  if (backend === "test-adapter" && mode !== "local-preview") throw new Error("host page: the test adapter is only for the local preview");
  if (backend === "local-supabase" && (!supabaseUrl || !anonKey)) throw new Error("host page: local-supabase needs supabaseUrl and anonKey");
  const supabaseOrigin = backend === "local-supabase" ? new URL(supabaseUrl).origin : null;
  const config = JSON.stringify({ mode, backend, gameOrigin, gameUrl, supabaseUrl, anonKey, subject, objectiveMap, h5, sequence, stepContexts }).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
  const html = readFileSync(join(HOST_DIR, "index.html"), "utf8");
  if (!html.includes("__LV_CSP__") || !html.includes("__LV_CONFIG__")) throw new Error("host page: placeholders missing");
  return html.replace("__LV_CSP__", hostCsp({ gameOrigin, supabaseOrigin })).replace("__LV_CONFIG__", config);
}

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };

/** A request handler for the host origin. `page` is the rendered index.html; dev files only if `dev`. */
export function hostHandler(page, { dev = false } = {}) {
  const allowed = dev ? [...HOST_FILES, ...DEV_FILES] : HOST_FILES;
  return (req, res) => {
    let p;
    try {
      p = decodeURIComponent((req.url || "/").split("?")[0].split("#")[0]).replace(/^\/+/, "");
    } catch {
      p = "\u0000";
    }
    if (p === "") p = "index.html";
    if (!allowed.includes(p)) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not served");
      return;
    }
    const body = p === "index.html" ? page : readFileSync(join(HOST_DIR, p), "utf8");
    const ext = p.slice(p.lastIndexOf("."));
    res.writeHead(200, { "content-type": TYPES[ext], "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" });
    res.end(body);
  };
}
