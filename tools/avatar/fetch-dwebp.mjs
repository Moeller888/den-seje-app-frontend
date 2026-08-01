// R2 alpha-fringe fix — reproducible fetch of the vendored WebP DECODER
// ---------------------------------------------------------------------------
// Mirrors fetch-cwebp.mjs: downloads Google's official libwebp `dwebp.exe`
// (Windows x64) and extracts it to tools/avatar/vendor/dwebp.exe. The binary is
// GITIGNORED (never committed); this script makes it reproducible (owner / CI /
// a fresh clone re-fetches). Needed by build-r2-alpha-decontaminate.mjs and by
// build-r2-arm-fringe-fix.mjs (D-065, verify/idempotent mode) to decode the
// promoted runtime WebPs back to RGBA for alpha-aware analysis.
//
//   node tools/avatar/fetch-dwebp.mjs
//
// Zero npm dependencies: Node global fetch + a minimal built-in ZIP reader
// (zlib.inflateRawSync). Source = the official downloads.webmproject.org release
// (same archive/version as fetch-cwebp.mjs). This downloads + stages a
// third-party binary — run it deliberately.
// ---------------------------------------------------------------------------

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const VENDOR = join(HERE, "vendor");
const OUT = join(VENDOR, "dwebp.exe");

export const VERSION = "1.5.0";
const URL = `https://storage.googleapis.com/downloads.webmproject.org/releases/webp/libwebp-${VERSION}-windows-x64.zip`;

// Checksum pin for the EXTRACTED dwebp.exe (libwebp 1.5.0, windows-x64), 505,344 bytes.
// PROVENANCE, stated plainly: this hash was taken from the binary this repo had already vendored via
// this script from the official URL above. It is a pin against SILENT DRIFT (a re-cut release, a
// truncated download, a swapped file) — it is NOT an independent verification against a signature
// published by Google. Anyone re-pinning it should verify the upstream release first.
export const EXE_SHA256 = "ee66951df0f868f0c41f49fcc2d0fc53072912b7357836317ca177cbae5eb343";
export const EXE_BYTES = 505344;

// Runtime guard for consumers (builders, tests): is the vendored decoder present AND the pinned one?
// Returns { ok, reason, sha256 } — never throws, so a caller can turn it into its own clear failure.
export function verifyVendoredDwebp(path = OUT) {
  if (!existsSync(path)) {
    return { ok: false, reason: "missing", sha256: null,
      how: "node tools/avatar/fetch-dwebp.mjs   (downloads libwebp " + VERSION + " and verifies the pinned checksum)" };
  }
  const sha256 = createHash("sha256").update(readFileSync(path)).digest("hex");
  if (sha256 !== EXE_SHA256) {
    return { ok: false, reason: "checksum-mismatch", sha256, expected: EXE_SHA256,
      how: "delete tools/avatar/vendor/dwebp.exe and re-run: node tools/avatar/fetch-dwebp.mjs" };
  }
  return { ok: true, reason: "pinned", sha256 };
}

// ── minimal ZIP reader (store + deflate), enough for a libwebp release zip ────
function findEOCD(buf) {
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  throw new Error("not a zip (no EOCD)");
}
function extractEntry(buf, wantSuffix) {
  const eocd = findEOCD(buf);
  const total = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error("bad central dir entry");
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const fnLen = buf.readUInt16LE(off + 28);
    const exLen = buf.readUInt16LE(off + 30);
    const cmLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.toString("utf8", off + 46, off + 46 + fnLen);
    if (name.replace(/\\/g, "/").endsWith(wantSuffix)) {
      if (buf.readUInt32LE(localOff) !== 0x04034b50) throw new Error("bad local header");
      const lfn = buf.readUInt16LE(localOff + 26);
      const lex = buf.readUInt16LE(localOff + 28);
      const dataStart = localOff + 30 + lfn + lex;
      const data = buf.subarray(dataStart, dataStart + compSize);
      if (method === 0) return Buffer.from(data);
      if (method === 8) return inflateRawSync(data);
      throw new Error("unsupported zip compression method " + method);
    }
    off += 46 + fnLen + exLen + cmLen;
  }
  throw new Error("entry not found: " + wantSuffix);
}

async function main() {
  console.log("Fetching libwebp " + VERSION + " …\n  " + URL);
  const res = await fetch(URL);
  if (!res.ok) throw new Error("download failed: HTTP " + res.status);
  const zip = Buffer.from(await res.arrayBuffer());
  console.log("  downloaded " + (zip.length / 1024 / 1024).toFixed(2) + " MB");

  const exe = extractEntry(zip, "/dwebp.exe");
  // Checksum pin (D-085): the version + URL alone did not make this reproducible — a re-cut release at
  // the same URL would land a different binary silently. The extracted executable must match
  // EXE_SHA256 exactly, or nothing is written. See verifyVendoredDwebp() for the runtime check.
  const got = createHash("sha256").update(exe).digest("hex");
  if (got !== EXE_SHA256) {
    throw new Error(
      "dwebp.exe checksum mismatch — refusing to install.\n" +
      "  expected " + EXE_SHA256 + "\n  actual   " + got + "\n" +
      "  libwebp " + VERSION + " may have been re-cut upstream; verify the release before changing the pin.");
  }
  mkdirSync(VENDOR, { recursive: true });
  writeFileSync(OUT, exe);
  console.log("✔ extracted → " + OUT + "  (" + (exe.length / 1024).toFixed(0) + " KB)");
  console.log("  sha256 verified: " + EXE_SHA256);
  console.log("  (gitignored — verify with:  tools/avatar/vendor/dwebp.exe -version)");
}

// Download ONLY when this file is executed directly. It is also imported for its checksum pin and
// verifyVendoredDwebp(), and an import must never reach out to the network.
const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  main().catch((e) => { console.error("✖ fetch-dwebp failed:", e.message); process.exit(1); });
}
