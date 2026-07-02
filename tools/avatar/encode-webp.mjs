// 167A Phase-2 (gate 4) — PNG → WebP encoder wrapper
// ---------------------------------------------------------------------------
// Thin, deterministic wrapper around the VENDORED libwebp `cwebp.exe`
// (tools/avatar/vendor/cwebp.exe — gitignored; fetch with `fetch-cwebp.mjs`).
// Encodes a transparent PNG (e.g. a Phase-2 layer review PNG) to the runtime
// WebP format (ADR-163D / plan §13 gate 4). No npm dependency.
//
//   node encode-webp.mjs <input.png> <output.webp> [--q 90] [--alpha-q 100] [--half]
//
//   --half   downscale to 50% first (1024×1536 authoring PNG → 512×768 served)
//            via cwebp's `-resize`. Omit if the PNG is already served-size.
//
// BOUNDARIES: this is BUILD tooling. It does NOT write into assets/avatar-r2/,
// does NOT touch the manifest or AVATAR_R2, and does NOT start Phase-2 wiring.
// Promoting an encoded WebP to the runtime folder + registering the manifest is
// a separate, human-gated step.
// ---------------------------------------------------------------------------

import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const CWEBP = join(HERE, "vendor", "cwebp.exe");

function argVal(args, name, dflt) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] !== undefined ? args[i + 1] : dflt;
}

// Value-taking flags — their following token is a value, not a positional.
const VALUE_FLAGS = new Set(["--q", "--alpha-q"]);

function main() {
  const args = process.argv.slice(2);
  const positionals = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) { if (VALUE_FLAGS.has(a)) i++; continue; }
    positionals.push(a);
  }
  const input = positionals[0];
  const output = positionals[1];

  if (!input || !output) {
    console.error("usage: node encode-webp.mjs <input.png> <output.webp> [--q 90] [--alpha-q 100] [--half]");
    process.exit(2);
  }
  if (!existsSync(CWEBP)) {
    console.error("✖ vendored encoder missing: " + CWEBP + "\n  run:  node tools/avatar/fetch-cwebp.mjs");
    process.exit(3);
  }
  if (!existsSync(input)) {
    console.error("✖ input not found: " + input);
    process.exit(4);
  }

  const q = String(parseInt(argVal(args, "--q", "90"), 10) || 90);
  const alphaQ = String(parseInt(argVal(args, "--alpha-q", "100"), 10) || 100);
  const half = args.includes("--half");

  // -q quality · -alpha_q alpha quality · -m 6 slowest/best · -metadata none · -mt multithread.
  // -exact is intentionally OFF (we don't need hidden RGB under transparent px → smaller files).
  // --half → "-resize 512 0" (0 = auto height, aspect-preserving): a 1024-wide authoring PNG → 512 served.
  const finalArgs = ["-q", q, "-alpha_q", alphaQ, "-m", "6", "-metadata", "none", "-mt"];
  if (half) finalArgs.push("-resize", "512", "0");
  finalArgs.push(input, "-o", output);

  const res = spawnSync(CWEBP, finalArgs, { encoding: "utf8" });
  if (res.status !== 0) {
    console.error("✖ cwebp failed (exit " + res.status + ")");
    if (res.stderr) console.error(res.stderr.trim());
    process.exit(res.status || 1);
  }

  const inKB = statSync(input).size / 1024;
  const outKB = statSync(output).size / 1024;
  console.log("✔ WebP encoded (vendored libwebp cwebp):");
  console.log("  in : " + input + "  (" + inKB.toFixed(1) + " KB)");
  console.log("  out: " + output + "  (" + outKB.toFixed(1) + " KB, q=" + q + " alpha_q=" + alphaQ + (half ? ", resized ÷ to 512w" : "") + ")");
  console.log("  budget: total avatar < ~350 KB (ADR-163D) — this layer: " + (outKB <= 350 ? "OK" : "OVER"));
}

main();
