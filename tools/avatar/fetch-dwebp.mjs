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

import { mkdirSync, writeFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const VENDOR = join(HERE, "vendor");
const OUT = join(VENDOR, "dwebp.exe");

const VERSION = "1.5.0";
const URL = `https://storage.googleapis.com/downloads.webmproject.org/releases/webp/libwebp-${VERSION}-windows-x64.zip`;

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
  mkdirSync(VENDOR, { recursive: true });
  writeFileSync(OUT, exe);
  console.log("✔ extracted → " + OUT + "  (" + (exe.length / 1024).toFixed(0) + " KB)");
  console.log("  (gitignored — verify with:  tools/avatar/vendor/dwebp.exe -version)");
}

main().catch((e) => { console.error("✖ fetch-dwebp failed:", e.message); process.exit(1); });
