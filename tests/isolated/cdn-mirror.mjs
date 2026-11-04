// CDN mirror for the isolated E2E bundle (D-110).
//
// The frontend loads @supabase/supabase-js from a public CDN (js/supabase.js: cdn.jsdelivr.net,
// supabaseClient.js: esm.sh). The isolated job's network lock (egress-firewall.sh) forbids every
// non-local request from the test user, and the browser tripwire would fail the run on one — so the
// exact CDN modules production users receive are fetched ONCE, before the lock, together with every
// module they import, and the bundle server (serve-build.mjs) then serves them from loopback:
//
//   https://cdn.jsdelivr.net/npm/…  →  /__cdn/cdn.jsdelivr.net/npm/…
//   https://esm.sh/…                →  /__cdn/esm.sh/…
//
// Absolute-path imports inside a mirrored module ("/npm/…", "/@supabase/…") are rewritten to the same
// /__cdn/<host>/ prefix. A module that was not mirrored is a 404 — the page breaks visibly, it never
// falls back to the network. Only these two origins are ever fetched or served.
//
//   node tests/isolated/cdn-mirror.mjs --fetch <dist-dir> <mirror-dir>   (before the network lock)
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname, resolve } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

export const MIRRORED_ORIGINS = Object.freeze(["https://cdn.jsdelivr.net", "https://esm.sh"]);
export const MIRROR_PREFIX = "/__cdn/";
const MAX_MODULES = 400;

const ORIGIN_RE = /https:\/\/(cdn\.jsdelivr\.net|esm\.sh)\/[^"'`\s)]+/g;
// Static and dynamic import / export-from specifiers, quoted.
const SPECIFIER_RE = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)(["'])([^"'\n]+)\2/g;

export const isMirroredUrl = (u) => MIRRORED_ORIGINS.some((o) => u.startsWith(o + "/"));

// Every mirrored-origin URL named in the bundle's text files.
export function entryUrls(distDir) {
  const out = new Set();
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if ([".html", ".js", ".mjs"].includes(extname(p))) for (const m of readFileSync(p, "utf8").matchAll(ORIGIN_RE)) out.add(m[0]);
    }
  };
  walk(distDir);
  return [...out].sort();
}

// The import specifiers of a module, resolved against its URL; only mirrored origins are kept.
export function importsOf(text, url) {
  const out = [];
  for (const m of text.matchAll(SPECIFIER_RE)) {
    const spec = m[3];
    if (!spec.startsWith("/") && !spec.startsWith("./") && !spec.startsWith("../") && !spec.startsWith("https://")) continue;
    let abs;
    try { abs = new URL(spec, url).href; } catch { continue; }
    if (isMirroredUrl(abs)) out.push(abs);
  }
  return out;
}

export function mirrorKey(url) {
  return createHash("sha256").update(url).digest("hex");
}

// Breadth-first fetch of the entries and everything they import. `fetchImpl(url)` → { status, type, body }.
// An ENTRY that does not answer 200 is a failure. A discovered import that does not is recorded and
// skipped: the regex can match an import-like string inside a comment, and a REAL missing import
// still fails the page visibly (404 from the bundle server, never the network).
export async function crawl(entries, fetchImpl) {
  const modules = new Map();
  const skipped = [];
  const entrySet = new Set(entries);
  const queue = [...entries];
  const seen = new Set();
  while (queue.length) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    if (!isMirroredUrl(url)) throw new Error(`refusing to mirror ${url}`);
    if (modules.size >= MAX_MODULES) throw new Error(`more than ${MAX_MODULES} modules — refusing`);
    const r = await fetchImpl(url);
    if (r.status !== 200) {
      if (entrySet.has(url)) throw new Error(`${url}: HTTP ${r.status}`);
      skipped.push(url);
      continue;
    }
    modules.set(url, { type: r.type || "text/javascript; charset=utf-8", body: r.body });
    for (const dep of importsOf(r.body, url)) if (!seen.has(dep)) queue.push(dep);
  }
  modules.skipped = skipped;
  return modules;
}

export function writeMirror(dir, modules) {
  mkdirSync(dir, { recursive: true });
  const index = {};
  for (const [url, m] of modules) {
    const key = mirrorKey(url);
    writeFileSync(join(dir, key), m.body, "utf8");
    index[url] = { key, type: m.type };
  }
  writeFileSync(join(dir, "index.json"), JSON.stringify(index, null, 1));
  return Object.keys(index).length;
}

export function loadMirror(dir) {
  if (!dir || !existsSync(join(dir, "index.json"))) return null;
  const index = JSON.parse(readFileSync(join(dir, "index.json"), "utf8"));
  return { index, read: (key) => readFileSync(join(dir, key), "utf8") };
}

// Page text: absolute CDN URLs → local prefix.
export function rewriteCdnUrls(text) {
  let out = text;
  for (const o of MIRRORED_ORIGINS) out = out.split(o + "/").join(MIRROR_PREFIX + new URL(o).host + "/");
  return out;
}

// Module text served from the mirror: its absolute-path and absolute-URL imports → local prefix.
export function rewriteModule(text, url) {
  const host = new URL(url).host;
  return rewriteCdnUrls(text).replace(SPECIFIER_RE, (all, lead, q, spec) =>
    spec.startsWith("/") && !spec.startsWith(MIRROR_PREFIX) ? `${lead}${q}${MIRROR_PREFIX}${host}${spec}${q}` : all);
}

// /__cdn/<host>/<rest> → the original URL, or null.
export function urlForMirrorPath(pathWithQuery) {
  if (!pathWithQuery.startsWith(MIRROR_PREFIX)) return null;
  const rest = pathWithQuery.slice(MIRROR_PREFIX.length);
  const slash = rest.indexOf("/");
  if (slash < 1) return null;
  const url = `https://${rest.slice(0, slash)}${rest.slice(slash)}`;
  return isMirroredUrl(url) ? url : null;
}

async function main(argv) {
  if (argv[0] !== "--fetch" || !argv[1] || !argv[2]) throw new Error("usage: cdn-mirror.mjs --fetch <dist-dir> <mirror-dir>");
  const entries = entryUrls(resolve(argv[1]));
  const modules = await crawl(entries, async (url) => {
    const r = await fetch(url, { redirect: "follow" });
    return { status: r.status, type: r.headers.get("content-type"), body: await r.text() };
  });
  const n = writeMirror(resolve(argv[2]), modules);
  console.log(`cdn mirror: ${entries.length} entr${entries.length === 1 ? "y" : "ies"}, ${n} module(s)${modules.skipped.length ? `, ${modules.skipped.length} non-200 import-like string(s) skipped` : ""}`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
}
