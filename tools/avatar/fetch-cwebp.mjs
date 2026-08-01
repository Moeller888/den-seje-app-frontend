// 167A Phase-2 (gate 4) — reproducible fetch of the vendored WebP encoder
// ---------------------------------------------------------------------------
// Downloads Google's official libwebp `cwebp.exe` (Windows x64) and extracts it
// to tools/avatar/vendor/cwebp.exe. The binary is GITIGNORED (never committed);
// this script makes it reproducible (owner / CI / a fresh clone re-fetches).
//
//   node tools/avatar/fetch-cwebp.mjs
//
// Zero npm dependencies: Node global fetch + a minimal built-in ZIP reader
// (zlib.inflateRawSync). Source = the official downloads.webmproject.org release.
// This downloads + stages a third-party binary — run it deliberately.
// ---------------------------------------------------------------------------

import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const VENDOR = join(HERE, "vendor");
const OUT = join(VENDOR, "cwebp.exe");

const VERSION = "1.5.0";
const URL = `https://storage.googleapis.com/downloads.webmproject.org/releases/webp/libwebp-${VERSION}-windows-x64.zip`;

// Checksum pin for the EXTRACTED executable, mirroring fetch-dwebp.mjs (D-085 revision 2).
// PROVENANCE, stated plainly: this was taken from the already-vendored binary that produced the
// existing runtime assets. It is a pin against silent drift — NOT an independent verification
// against a Google-published signature. An asset encoder is exactly the place where an unnoticed
// binary swap would be invisible in review, which is why the encode step refuses to run without it.
export const EXE_SHA256 = "6fcb809892083ce6558878082c0b5a927442654dac963b0d02268f6e99986787";
export const EXE_BYTES = 741888;

// Runtime guard for consumers (promotion tool, tests): present AND the pinned one?
// Returns { ok, reason, sha256 } — never throws, so a caller can turn it into its own clear failure.
export function verifyVendoredCwebp(path = OUT) {
  if (!existsSync(path)) {
    return { ok: false, reason: "missing", sha256: null,
      how: "node tools/avatar/fetch-cwebp.mjs   (downloads libwebp " + VERSION + " and verifies the pinned checksum)" };
  }
  const sha256 = createHash("sha256").update(readFileSync(path)).digest("hex");
  if (sha256 !== EXE_SHA256) {
    return { ok: false, reason: "checksum-mismatch", sha256, expected: EXE_SHA256,
      how: "delete tools/avatar/vendor/cwebp.exe and re-run: node tools/avatar/fetch-cwebp.mjs" };
  }
  return { ok: true, reason: "pinned", sha256 };
}

// ── minimal ZIP reader (store + deflate), enough for a libwebp release zip ────
function findEOCD(buf) {
  // End Of Central Directory signature 0x06054b50, searched from the tail.
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  throw new Error("not a zip (no EOCD)");
}
function extractEntry(buf, wantSuffix) {
  const eocd = findEOCD(buf);
  const total = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16); // central directory offset
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
      if (method === 0) return Buffer.from(data);            // stored
      if (method === 8) return inflateRawSync(data);          // deflate
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

  const exe = extractEntry(zip, "/cwebp.exe");

  // Verify BEFORE staging: a mismatched encoder must never reach vendor/, because everything
  // downstream trusts it to have produced the bytes we then commit as an asset.
  const sha = createHash("sha256").update(exe).digest("hex");
  if (sha !== EXE_SHA256) {
    throw new Error("extracted cwebp.exe sha256 " + sha + "\n  != pinned " + EXE_SHA256 +
      "\n  refusing to install an unpinned encoder (see the PROVENANCE note above)");
  }
  if (exe.length !== EXE_BYTES) {
    throw new Error("extracted cwebp.exe is " + exe.length + " B, expected " + EXE_BYTES);
  }

  mkdirSync(VENDOR, { recursive: true });
  writeFileSync(OUT, exe);
  console.log("✔ extracted → " + OUT + "  (" + (exe.length / 1024).toFixed(0) + " KB, sha " + sha.slice(0, 16) + "… = pinned)");
  console.log("  (gitignored — verify with:  tools/avatar/vendor/cwebp.exe -version)");
  console.log("  encode with:  node tools/avatar/encode-webp.mjs <in.png> <out.webp> [--half]");
}

// Only download when run deliberately. Importing this module (for `verifyVendoredCwebp`) must
// never reach for the network.
const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  main().catch((e) => { console.error("✖ fetch-cwebp failed:", e.message); process.exit(1); });
}
