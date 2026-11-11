// D-321: LOCAL preview of Lærligverse — the host page on http://127.0.0.1:4330, the game on its own origin
// http://127.0.0.1:4331. Nothing here is deployed; production is never contacted.
//
//   Didactic demo (Arkivskabet's full learning sequence, TEST ADAPTER — nothing is graded by Lærlig):
//     node tools/laerligverse/serve-local.mjs --backend=test-adapter
//     (builds the Arkivskabet game with adventure-engine's existing vite build into the OS temp folder;
//      needs `corepack pnpm@9.15.4 install` in adventure-engine/ once)
//
//   Backend demo (the REAL local backend: `supabase start` + the isolated schema and seed, see D-323):
//     node tools/laerligverse/serve-local.mjs --backend=local-supabase --supabase-url=http://127.0.0.1:54321 --anon-key=<local anon key>
//     (the game is the neutral harness game of the isolated E2E: a random question is a technical
//      demonstration, never presented as Arkivskabet's 1940 task)
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { hostHandler, renderHostPage } from "./host-page.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const HOST_ORIGIN = "http://127.0.0.1:4330";
export const GAME_ORIGIN = "http://127.0.0.1:4331";

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

const backend = arg("backend") ?? "test-adapter";
const listen = (fn, port) => new Promise((ok, fail) => { const s = createServer(fn); s.once("error", fail); s.listen(port, "127.0.0.1", () => ok(s)); });
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff", ".map": "application/json", ".json": "application/json" };

function staticHandler(root) {
  return (req, res) => {
    let p = decodeURIComponent((req.url || "/").split("?")[0]);
    if (p === "/") p = "/game.html";
    const abs = normalize(join(root, p));
    if (!abs.startsWith(root + sep) || !existsSync(abs) || !statSync(abs).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": TYPES[extname(abs)] ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(readFileSync(abs));
  };
}

if (backend === "test-adapter") {
  const out = join(tmpdir(), "laerligverse-arkivskabet-game");
  const pkg = join(REPO, "adventure-engine", "packages", "archive-prototype");
  if (!existsSync(join(REPO, "adventure-engine", "node_modules"))) {
    console.error("adventure-engine/node_modules is missing: run `corepack pnpm@9.15.4 install` in adventure-engine/ first.");
    process.exit(2);
  }
  console.log("building the Arkivskabet game (adventure-engine's vite build) …");
  const r = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["vite", "build", "--outDir", out, "--emptyOutDir"], {
    cwd: pkg, stdio: "inherit", shell: process.platform === "win32",
    env: { ...process.env, VITE_LV_HOST_ORIGIN: HOST_ORIGIN, VITE_LV_GAME_ORIGIN: GAME_ORIGIN },
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
  const page = renderHostPage({ mode: "local-preview", backend: "test-adapter", gameOrigin: GAME_ORIGIN, gameUrl: `${GAME_ORIGIN}/game.html`, sequence: !process.argv.includes("--no-sequence") });
  await listen(hostHandler(page, { dev: true }), 4330);
  await listen(staticHandler(out), 4331);
  console.log(`\nDidaktisk demo (TESTADAPTER — intet registreres hos Lærlig):\n  åbn ${HOST_ORIGIN}/\n  spillet kører på ${GAME_ORIGIN}\nCtrl+C stopper.`);
} else if (backend === "local-supabase") {
  const supabaseUrl = arg("supabase-url");
  const anonKey = arg("anon-key");
  if (!supabaseUrl || !anonKey) { console.error("--supabase-url and --anon-key are required (from `supabase status`)."); process.exit(2); }
  const u = new URL(supabaseUrl);
  if (!["127.0.0.1", "localhost"].includes(u.hostname)) { console.error("refusing: --supabase-url must be a LOCAL stack (127.0.0.1/localhost). Production is never contacted."); process.exit(2); }
  const { startHarness } = await import("../../tests/isolated/laerligverse-harness/serve-harness.mjs");
  await startHarness({ host: "f3", mode: "local-preview", supabaseUrl, anonKey });
  console.log(`\nBackend-demo (lokal Supabase ${supabaseUrl}):\n  åbn ${HOST_ORIGIN}/ og log ind med en syntetisk elev\nCtrl+C stopper.`);
} else {
  console.error(`unknown --backend=${backend} (test-adapter | local-supabase)`);
  process.exit(2);
}
