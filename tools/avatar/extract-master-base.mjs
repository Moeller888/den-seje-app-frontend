// 167A step-3 (Phase-1, D-040) — Deterministic Master base extractor
// ---------------------------------------------------------------------------
// Produces the Phase-1 "Master-as-is" baked base by a DETERMINISTIC, NON-AI image
// op on the frozen Tier-0 Master:
//   Northstar Master.png (1024×1536, white-matte)  →  alpha-cut (border flood-fill)
//   →  downscale ÷2 (premultiplied 2×2 box)  →  512×768 transparent PNG.
//
// The PNG is a REVIEW ARTIFACT written to tools/avatar/build/r2/ (gitignored). The
// runtime asset is WebP (body-neutral-medium-v1.webp); this tool prints the exact
// `cwebp` command for the final PNG→WebP encode (no cwebp/sharp bundled — zero deps).
//
// HARD BOUNDARIES (D-040/D-041, matches extract-anchor-masks.mjs):
//   * Deterministic, NON-AI, pure Node built-ins (zlib, crypto). No dependencies.
//   * Geometry-preserving: this is an alpha-cut + ÷2 downscale of the EXISTING Master,
//     NOT a regeneration and NOT the D-033 manual paint-over (that governs Phase-2).
//   * The Master is READ-ONLY. Output is a build/review artifact — NOT auto-promoted,
//     NOT registered in R2_MANIFEST, NOT activated. Human visual sign-off required
//     (167a §E) before promoting to assets/avatar-r2/base/ and registering the manifest.
//   * Supports the Master's format only: PNG colour type 2 (RGB), 8-bit, non-interlaced.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { inflateSync, deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const MASTER = join(REPO, "assets", "avatar", "reference", "Northstar Master.png");

// Frozen input contract (D-032). Abort on any mismatch → guarantees deterministic geometry.
const EXPECT_SHA = "2ca10ef868b9564164f28afc8bb03baec99cc10fd03f7200ed2dc58edd607a21";
const EXPECT_W = 1024;
const EXPECT_H = 1536;
const OUT_W = 512;
const OUT_H = 768;

// White-matte flood-fill threshold (a pixel is background-matte candidate when every
// channel ≥ WHITE_HI). Border-connected only, so interior whites (eye highlights,
// white clothing) are preserved. Overridable: --white <0-255>.
const args = process.argv.slice(2);
function argVal(name, dflt) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] !== undefined ? args[i + 1] : dflt;
}
const WHITE_HI = Math.max(0, Math.min(255, parseInt(argVal("--white", "250"), 10) || 250));
const OUT_DIR = argVal("--out", join(HERE, "build", "r2"));
const OUT_PNG = join(OUT_DIR, "body-neutral-medium-v1.png");
const OUT_JSON = join(OUT_DIR, "body-neutral-medium-v1.report.json");

// ── minimal CRC32 (PNG) ─────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ── minimal PNG decode (colour type 2, 8-bit, non-interlaced) ────────────────
function decodePng(buf) {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) throw new Error("not a PNG");
  let off = 8, ihdr = null;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      ihdr = { w: data.readUInt32BE(0), h: data.readUInt32BE(4), bitDepth: data[8], colorType: data[9], interlace: data[12] };
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    off += 12 + len;
  }
  if (!ihdr) throw new Error("no IHDR");
  if (ihdr.bitDepth !== 8 || ihdr.colorType !== 2 || ihdr.interlace !== 0) {
    throw new Error("unsupported PNG (need 8-bit RGB, non-interlaced); got " + JSON.stringify(ihdr));
  }
  const raw = inflateSync(Buffer.concat(idat));
  const { w, h } = ihdr;
  const bpp = 3;
  const stride = w * bpp;
  const rgb = Buffer.alloc(h * stride);
  let prev = Buffer.alloc(stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[p++];
    const cur = raw.subarray(p, p + stride);
    p += stride;
    const out = rgb.subarray(y * stride, y * stride + stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = cur[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) v += paeth(a, b, c);
      out[x] = v & 0xff;
    }
    prev = out;
  }
  return { w, h, rgb };
}
function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

// ── minimal PNG encode (colour type 6, RGBA, filter None) ────────────────────
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function encodePngRGBA(w, h, rgba) {
  const stride = w * 4;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter None
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

// ── alpha-cut: border-connected white-matte flood-fill → RGBA ────────────────
function alphaCut(w, h, rgb, whiteHi) {
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0, j = 0; i < w * h; i++, j += 3) {
    rgba[i * 4] = rgb[j]; rgba[i * 4 + 1] = rgb[j + 1]; rgba[i * 4 + 2] = rgb[j + 2]; rgba[i * 4 + 3] = 255;
  }
  const isMatte = (i) => rgb[i * 3] >= whiteHi && rgb[i * 3 + 1] >= whiteHi && rgb[i * 3 + 2] >= whiteHi;
  const bg = new Uint8Array(w * h);
  const stack = [];
  const push = (i) => { if (!bg[i] && isMatte(i)) { bg[i] = 1; stack.push(i); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (stack.length) {
    const i = stack.pop();
    const x = i % w, y = (i / w) | 0;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }
  let cut = 0;
  for (let i = 0; i < w * h; i++) if (bg[i]) { rgba[i * 4 + 3] = 0; cut++; }
  return { rgba, cut };
}

// ── downscale ÷2: premultiplied 2×2 box average (avoids edge fringe) ─────────
function downscaleHalf(sw, sh, srgba, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4);
  for (let dy = 0; dy < dh; dy++) {
    for (let dx = 0; dx < dw; dx++) {
      let r = 0, g = 0, b = 0, aSum = 0;
      for (let yy = 0; yy < 2; yy++) {
        for (let xx = 0; xx < 2; xx++) {
          const si = ((dy * 2 + yy) * sw + (dx * 2 + xx)) * 4;
          const a = srgba[si + 3];
          r += srgba[si] * a; g += srgba[si + 1] * a; b += srgba[si + 2] * a; aSum += a;
        }
      }
      const di = (dy * dw + dx) * 4;
      if (aSum === 0) { out[di] = 0; out[di + 1] = 0; out[di + 2] = 0; out[di + 3] = 0; }
      else {
        out[di] = Math.round(r / aSum); out[di + 1] = Math.round(g / aSum); out[di + 2] = Math.round(b / aSum);
        out[di + 3] = Math.round(aSum / 4);
      }
    }
  }
  return out;
}

// ── run ──────────────────────────────────────────────────────────────────────
function main() {
  const buf = readFileSync(MASTER);
  const sha = createHash("sha256").update(buf).digest("hex");
  if (sha !== EXPECT_SHA) {
    throw new Error("Master sha256 mismatch — refusing (geometry contract, D-032).\n  expected " + EXPECT_SHA + "\n  got      " + sha);
  }
  const { w, h, rgb } = decodePng(buf);
  if (w !== EXPECT_W || h !== EXPECT_H) throw new Error("Master dims " + w + "×" + h + " ≠ " + EXPECT_W + "×" + EXPECT_H);

  const { rgba, cut } = alphaCut(w, h, rgb, WHITE_HI);
  const small = downscaleHalf(w, h, rgba, OUT_W, OUT_H);
  const png = encodePngRGBA(OUT_W, OUT_H, small);

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_PNG, png);

  // QA
  let opaque = 0, transparent = 0;
  for (let i = 0; i < OUT_W * OUT_H; i++) { if (small[i * 4 + 3] === 0) transparent++; else opaque++; }
  const kb = (png.length / 1024);
  const report = {
    tool: "extract-master-base", generatedFor: "167A Phase-1 (D-040)",
    source: { file: "assets/avatar/reference/Northstar Master.png", sha256: sha, dims: w + "×" + h },
    params: { whiteHi: WHITE_HI },
    output: { file: OUT_PNG.replace(REPO + "\\", "").replace(REPO + "/", ""), format: "PNG RGBA", dims: OUT_W + "×" + OUT_H, bytes: png.length, kb: +kb.toFixed(1) },
    alpha: { cutSourcePx: cut, opaquePx: opaque, transparentPx: transparent, transparentPct: +((transparent / (OUT_W * OUT_H)) * 100).toFixed(1) },
    budget: { limitKB: 350, withinPNG: kb <= 350, note: "final WebP will be smaller than this PNG" },
  };
  writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));

  console.log("✔ Master base extracted (deterministic alpha-cut + ÷2):");
  console.log("  " + OUT_PNG);
  console.log("  " + OUT_W + "×" + OUT_H + " RGBA · " + kb.toFixed(1) + " KB · transparent " + report.alpha.transparentPct + "%");
  console.log("");
  console.log("NEXT (not done here — human review + promote):");
  console.log("  1. Visually review the PNG (167a §E onion-skin vs Northstar Master.png; check clean alpha edge / no white halo).");
  console.log("  2. Encode WebP (no cwebp/sharp bundled). Once cwebp is available:");
  console.log("       cwebp -q 90 -alpha_q 100 \"" + OUT_PNG + "\" -o \"" + join(OUT_DIR, "body-neutral-medium-v1.webp") + "\"");
  console.log("     (or: npx --yes sharp-cli -i <png> -o <webp> --format webp)");
  console.log("  3. Promote the WebP to assets/avatar-r2/base/body-neutral-medium-v1.webp");
  console.log("  4. Register: R2_MANIFEST.base = { \"neutral-medium\": 1 }, R2_MANIFEST.version = 1");
  console.log("  5. Then execute 167A step 3a (wire baseSrcForR2 behind AVATAR_R2; default-off).");
}

try { main(); } catch (e) { console.error("✖ extract-master-base failed:", e.message); process.exit(1); }
