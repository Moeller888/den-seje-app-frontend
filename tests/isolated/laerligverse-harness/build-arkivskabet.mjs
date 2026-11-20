// F11-C: builds the REAL Arkivskabet game (adventure-engine/packages/archive-prototype, game-main.ts: the PixiJS
// renderer, IntroView, TaskView, the archive card and the bridge's game end) for the isolated introduction lane.
//
//   node tests/isolated/laerligverse-harness/build-arkivskabet.mjs <out-dir>
//
// TEST-ONLY. It changes no product file and is never part of tools/cloudflare-build-static.mjs:
//   - ONE entry, game.html. The prototype's own host page (host-main.ts: the fake task service and the curated items
//     WITH their answer keys) is not an input, so none of its code can be in the output; checkGameDist() proves it.
//   - The two origins are fixed at build time (src/config.ts reads VITE_LV_HOST_ORIGIN at build time, never from the
//     URL or a message): the game accepts messages only from the REAL F3 host page the harness serves on
//     127.0.0.1:4330 and posts only to it. A build for any other origin is refused.
//   - Same Vite (adventure-engine's lockfile) and the same build options as the package's vite.config.ts, without
//     sourcemaps; adventure-engine's dependencies must be installed (corepack pnpm@9.15.4 install --frozen-lockfile).
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { HOST_ORIGIN, GAME_ORIGIN } from "./serve-harness.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..");
export const ARCHIVE_DIR = join(REPO, "adventure-engine", "packages", "archive-prototype");

/**
 * Strings that exist only in the prototype's HOST side: an answer key and feedback of the curated items
 * (host-items.ts) and the Edge Function name the real backend adapter calls (learning-bridge laerlig-service.ts).
 * Object keys and string literals survive minification, so a game bundle containing one of them would carry host code.
 */
export const HOST_ONLY_MARKERS = Object.freeze(["correctLabel", "feedbackCorrect", "get-next-question", "introduction-progress"]);

function filesUnder(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...filesUnder(p));
    else out.push(p);
  }
  return out;
}

/**
 * Pure check of a built game directory: game.html exists, no host page, no host-only code, no sourcemap, and the
 * game's two origins are the harness's. Returns the list of problems (empty = fine).
 */
export function checkGameDist(dir, { hostOrigin = HOST_ORIGIN } = {}) {
  const problems = [];
  if (!existsSync(join(dir, "game.html"))) return [`${dir}: no game.html`];
  if (existsSync(join(dir, "host.html"))) problems.push("host.html is in the game build");
  let bundle = "";
  for (const f of filesUnder(dir)) {
    const rel = relative(dir, f).split(sep).join("/");
    if (rel.endsWith(".map")) problems.push(`sourcemap ${rel}`);
    if (/(^|\/)host[-.]/.test(rel)) problems.push(`host file ${rel}`);
    if (/\.(js|html|css)$/.test(rel)) bundle += readFileSync(f, "utf8");
  }
  for (const m of HOST_ONLY_MARKERS) if (bundle.includes(m)) problems.push(`host-only code in the game build ("${m}")`);
  if (!bundle.includes(hostOrigin)) problems.push(`the game does not accept the harness host ${hostOrigin}`);
  if (bundle.includes("127.0.0.1:4320")) problems.push("the game still accepts the prototype host on :4320");
  return problems;
}

export async function buildArkivskabet(outDir) {
  if (typeof outDir !== "string" || outDir === "") throw new Error("usage: build-arkivskabet.mjs <out-dir>");
  const out = resolve(outDir);
  if (out === REPO || out.startsWith(join(REPO, "dist-cloudflare")) || out.startsWith(ARCHIVE_DIR + sep)) throw new Error(`refusing to build into ${out}`);
  // Vite from adventure-engine's own lockfile (the package's devDependency), not from the root project.
  // Its ESM Node API (dist/node/index.js); require.resolve would give the deprecated CJS entry.
  const viteDir = dirname(createRequire(join(ARCHIVE_DIR, "package.json")).resolve("vite/package.json"));
  const { build } = await import(pathToFileURL(join(viteDir, "dist", "node", "index.js")).href);
  process.env.VITE_LV_HOST_ORIGIN = HOST_ORIGIN;
  process.env.VITE_LV_GAME_ORIGIN = GAME_ORIGIN;
  await build({
    root: ARCHIVE_DIR,
    configFile: false,
    base: "./",
    logLevel: "warn",
    build: { outDir: out, emptyOutDir: true, target: "es2022", sourcemap: false, rollupOptions: { input: { game: join(ARCHIVE_DIR, "game.html") } } },
  });
  const problems = checkGameDist(out);
  if (problems.length > 0) throw new Error(`the Arkivskabet test build is not safe to serve:\n  ${problems.join("\n  ")}`);
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = await buildArkivskabet(process.argv[2]);
  console.log(`arkivskabet: real game built for host ${HOST_ORIGIN} / game ${GAME_ORIGIN} into ${out}; checks passed`);
}
