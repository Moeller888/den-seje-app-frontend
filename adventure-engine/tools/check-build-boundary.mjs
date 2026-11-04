#!/usr/bin/env node
/**
 * Build boundary check (phase 6 / release review), run after the builds:
 *
 * - packages/app/dist (the production game) must not contain the developer
 *   tools, their texts or keyboard handler, the editor, the content tools,
 *   fixtures or local absolute paths;
 * - packages/app/dist-devtools (DEV_TOOLS=true) must contain the devtools;
 * - packages/editor/dist must exist and contain no local absolute paths.
 *
 * Exit code 1 with a list of problems; 0 when all builds keep their boundaries.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "..", "..");

/** Strings that must never appear in the production game. */
export const GAME_FORBIDDEN = ["adventure-engine devtools", "Udviklerværktøjer", "installDevtools", "devtools/boot", "Ctrl+Shift+D", "Indholdseditor", "content-tools", "editor-demo", "adventure-editor-recovery"];
/** Local absolute paths (Windows user folders, macOS and Linux homes). */
export const ABSOLUTE = /[A-Za-z]:[\\/]+Users[\\/]|\/Users\/[A-Za-z]|\/home\/[a-z]/;

function files(dir) {
  const out = [];
  const go = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) go(p);
      else if (/\.(js|html|css|map|json)$/.test(name)) out.push(p);
    }
  };
  go(dir);
  return out;
}

/** Problems of the three builds below `base` (the adventure-engine folder). */
export function checkBoundary(base = root) {
  const problems = [];
  const rel = (p) => relative(base, p).split(sep).join("/");
  const game = join(base, "packages/app/dist");
  const devtools = join(base, "packages/app/dist-devtools");
  const editor = join(base, "packages/editor/dist");
  for (const [dir, name] of [
    [game, "packages/app/dist"],
    [devtools, "packages/app/dist-devtools"],
    [editor, "packages/editor/dist"],
  ]) {
    if (!existsSync(dir)) problems.push(`${name} is missing (build first)`);
  }
  if (problems.length > 0) return problems;
  for (const f of files(game)) {
    const text = readFileSync(f, "utf8");
    for (const m of GAME_FORBIDDEN) if (text.includes(m)) problems.push(`${rel(f)} contains "${m}"`);
  }
  for (const dir of [game, devtools, editor]) {
    for (const f of files(dir)) if (ABSOLUTE.test(readFileSync(f, "utf8"))) problems.push(`${rel(f)} contains a local absolute path`);
  }
  if (!files(devtools).some((f) => readFileSync(f, "utf8").includes("adventure-engine devtools"))) problems.push("packages/app/dist-devtools does not contain the devtools");
  return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const problems = checkBoundary();
  for (const p of problems) console.error(`build-boundary: ${p}`);
  if (problems.length > 0) process.exitCode = 1;
  else console.log("build-boundary: OK (production game without devtools/editor; devtools build has them; no absolute paths)");
}
