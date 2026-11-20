// D-315: TEST-ONLY servers for the Lærligverse browser chain on the isolated stack.
//
// Two loopback origins, as in production two origins: the HOST page on 127.0.0.1:4330 (holds the
// synthetic pupil's session, talks to the local Edge Functions) and the GAME on 127.0.0.1:4331
// (adventure-engine core + the Arkivskabet scene + the bridge's game end, in an iframe).
//
// No build step and no production change: the adventure-engine TypeScript sources are served with
// their types stripped by Node's built-in module.stripTypeScriptTypes (strip mode — the sources use
// only erasable syntax; the content CLI already runs on Node's type stripping). Bare package names are
// resolved by an import map in the HTML. Nothing here is part of tools/cloudflare-build-static.mjs.
//
// Each origin serves an explicit allowlist: the game origin never serves the host code, the real
// backend adapter or the test adapter; neither origin serves the test adapter at all.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { stripTypeScriptTypes } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..");
const PKG = join(REPO, "adventure-engine", "packages");

export const HOST_PORT = 4330;
export const GAME_PORT = 4331;
export const HOST_ORIGIN = `http://127.0.0.1:${HOST_PORT}`;
export const GAME_ORIGIN = `http://127.0.0.1:${GAME_PORT}`;

/** What each origin may serve: harness files by name, package sources by prefix. */
export const ALLOW = Object.freeze({
  host: {
    files: ["host.html", "host.mjs"],
    // The bridge's host end and the REAL backend adapter. Never test-service.ts.
    pkg: ["learning-bridge/src/"],
    deny: ["learning-bridge/src/test-service.ts"],
  },
  game: {
    files: ["game.html", "game.mjs"],
    // Engine core, the scene, and only the game end of the bridge.
    // F11-B: plus the archive prototype's IntroView (and its local card content), which renders the server's cards.
    pkg: ["core/src/", "content/src/", "geometry/src/", "archive-prototype/src/content.ts", "archive-prototype/src/intro-view.ts", "archive-prototype/src/intro-content.ts", "learning-bridge/src/client.ts", "learning-bridge/src/protocol.ts"],
    deny: [],
  },
});

/** Pure: may `side` serve URL path `p`? Returns the file to read, or null. */
export function resolveAllowed(side, p) {
  const rule = ALLOW[side];
  if (!rule) return null;
  let path;
  try {
    path = decodeURIComponent(p.split("?")[0].split("#")[0]).replace(/^\/+/, "");
  } catch {
    return null;
  }
  if (path.includes("..") || path.includes("\\")) return null;
  if (rule.files.includes(path)) return join(HERE, path);
  if (!path.startsWith("pkg/")) return null;
  const rel = path.slice(4);
  if (rule.deny.includes(rel)) return null;
  if (!rule.pkg.some((prefix) => (prefix.endsWith("/") ? rel.startsWith(prefix) : rel === prefix))) return null;
  if (!rel.endsWith(".ts")) return null;
  const abs = normalize(join(PKG, rel));
  return abs.startsWith(PKG + sep) ? abs : null;
}

const TYPES = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".ts": "text/javascript; charset=utf-8" };

/**
 * F11-C: what the game origin may serve when it serves the REAL Arkivskabet build (build-arkivskabet.mjs) instead of
 * the D-315 test game: game.html and the build's own assets/ files of these types — nothing else (no host page, no
 * sourcemap, no directory, no other path). Pure: returns the file to read, or null.
 */
export const DIST_TYPES = Object.freeze({
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".woff": "font/woff", ".woff2": "font/woff2",
});
export function resolveDistAllowed(distDir, p) {
  let path;
  try {
    path = decodeURIComponent(p.split("?")[0].split("#")[0]).replace(/^\/+/, "");
  } catch {
    return null;
  }
  if (path.includes("..") || path.includes("\\")) return null;
  const ok = path === "game.html" || /^assets\/[A-Za-z0-9_.-]+$/.test(path);
  if (!ok || /(^|\/)host[-.]/.test(path)) return null;
  const ext = path.slice(path.lastIndexOf("."));
  if (DIST_TYPES[ext] === undefined) return null;
  const abs = normalize(join(distDir, path));
  return abs.startsWith(normalize(distDir) + sep) ? abs : null;
}

function distHandler(distDir) {
  return (req, res) => {
    const file = resolveDistAllowed(distDir, req.url || "/");
    if (file === null || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not served");
      return;
    }
    res.writeHead(200, { "content-type": DIST_TYPES[file.slice(file.lastIndexOf("."))], "cache-control": "no-store" });
    res.end(readFileSync(file));
  };
}

function handler(side) {
  return (req, res) => {
    const file = resolveAllowed(side, req.url || "/");
    if (file === null || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not served");
      return;
    }
    const ext = file.slice(file.lastIndexOf("."));
    let body = readFileSync(file, "utf8");
    if (ext === ".ts") body = stripTypeScriptTypes(body, { mode: "strip" });
    res.writeHead(200, { "content-type": TYPES[ext] ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  };
}

/**
 * @param {{ host?: "harness" | "f3", mode?: "isolated-test" | "local-preview", supabaseUrl?: string, anonKey?: string }} [opts]
 *   host "harness" (default): the D-315 test host page. host "f3" (D-321): the REAL Lærligverse host page
 *   (laerligverse/host/) with its configuration and CSP rendered by tools/laerligverse/host-page.mjs.
 *   gameDist (F11-C, only with host "f3"): a directory built by build-arkivskabet.mjs — the game origin then serves the
 *   REAL Arkivskabet game (game-main.ts) instead of the D-315 test game; it is checked before anything is served.
 */
export async function startHarness(opts = {}) {
  let hostHandlerFn = handler("host");
  let gameHandlerFn = handler("game");
  let gameUrl = `${GAME_ORIGIN}/game.html${opts.introductions === true ? "?introductions=1" : ""}`;
  if (opts.gameDist !== undefined) {
    if (opts.host !== "f3") throw new Error("harness: the real game is served only behind the real F3 host");
    const { checkGameDist } = await import("./build-arkivskabet.mjs");
    const problems = checkGameDist(opts.gameDist);
    if (problems.length > 0) throw new Error(`harness: refusing to serve ${opts.gameDist}:\n  ${problems.join("\n  ")}`);
    gameHandlerFn = distHandler(opts.gameDist);
    // The real game shows the server's introduction whenever its host negotiates bridge/3 (no ?introductions flag).
    gameUrl = `${GAME_ORIGIN}/game.html?motion=off`;
  }
  if (opts.host === "f3") {
    const { renderHostPage, hostHandler } = await import("../../../tools/laerligverse/host-page.mjs");
    hostHandlerFn = hostHandler(renderHostPage({ mode: opts.mode ?? "isolated-test", backend: "local-supabase", gameOrigin: GAME_ORIGIN, gameUrl, supabaseUrl: opts.supabaseUrl, anonKey: opts.anonKey, objectiveMap: opts.objectiveMap ?? null, h5: opts.h5 === true, sequence: opts.sequence === true, stepContexts: opts.stepContexts ?? null, introductions: opts.introductions === true }));
  }
  const listen = (fn, port) =>
    new Promise((ok, fail) => {
      const s = createServer(fn);
      s.once("error", fail);
      s.listen(port, "127.0.0.1", () => ok(s));
    });
  const host = await listen(hostHandlerFn, HOST_PORT);
  const game = await listen(gameHandlerFn, GAME_PORT);
  return { close: () => Promise.all([host, game].map((s) => new Promise((ok) => s.close(() => ok())))) };
}
