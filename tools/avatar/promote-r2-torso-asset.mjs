// A3.1 (D-089) — promote the OWNER-ACCEPTED Ridderdragt torso candidate to a tracked R2 asset.
// ---------------------------------------------------------------------------------------------
// Deterministic · NON-AI · NO network · NO image generation · NO manual retouching.
//
// This is the ASSET step only. It does NOT wire anything: `js/` is never written, `R2_MANIFEST`
// is never edited, `torso` is not added to `R2_SUPPORTED_COSMETIC_SLOTS`, and `AVATAR_R2` stays
// `false`. After this tool runs, the runtime still drops the whole avatar to C2 when the armour is
// equipped (D-083) — exactly as before. Registration + wiring are A3.2.
//
// PIPELINE — reused from the established runtime-asset path, not invented here:
//   1024×1536 RGBA PNG (owner-accepted, SHA-pinned)
//     → premultiplied 2×2 box downscale ÷2      (the same method `extract-master-base.mjs` used to
//                                                produce the runtime base, D-057)
//     → 512×768 RGBA reference PNG
//     → cwebp -lossless -exact -z 9 -metadata none
//                                                (the same flags `build-r2-arm-fringe-fix.mjs` used
//                                                for the runtime base v2, D-061, and the flags
//                                                D-084 §5 mandates for this asset)
//     → assets/avatar-r2/torso/armor-knight-r2-v1.webp
//
// WHY A SEPARATE REFERENCE instead of `encode-webp.mjs --half`: `--half` lets cwebp do the resize
// internally, which leaves nothing independent to compare the asset against — "the decoded asset
// matches what cwebp produced" is circular. Downscaling first gives a reference the asset must
// equal BYTE-FOR-BYTE after decoding, which is what actually proves the encode was lossless and
// that no pixel of the accepted artwork moved. (D-085 lesson: a gate that consults its own output
// cannot fail.) `encode-webp.mjs` is the LOSSY q90 path used for the small face/eyes overlays; a
// runtime layer that must occlude the base tee is the lossless path instead.
//
//   node tools/avatar/promote-r2-torso-asset.mjs             # VERIFY only — writes nothing
//   node tools/avatar/promote-r2-torso-asset.mjs --promote    # verify + encode + write the asset
//   node tools/avatar/promote-r2-torso-asset.mjs --review     # + regenerate gitignored review images
// ---------------------------------------------------------------------------------------------

import { readFileSync, existsSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, sep } from "node:path";
import { decodePng, encodePngRGBA } from "./build-r2-torso-occlusion-mask.mjs";
import { OPAQUE, VISIBLE, RENDER_SIZES, MIN_SCALE_COVERAGE } from "./check-r2-torso-candidate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");

export const TOOL = "promote-r2-torso-asset";
export const TOOL_VERSION = "1.0.0";

// ── the single promotable source, SHA-pinned to the owner acceptance (D-088) ──────────────────
export const ACCEPTED_SOURCE_SHA =
  "31f4b2b60737d5801cb115d3bdcac632881b8223ad7107be3a9b0655ebc7cfe0";
export const DEFAULT_SOURCE = join(HERE, "build", "ai-input", "torso-armor-knight-candidate.png");

// Candidate 1 was REJECTED (D-087) and must never become an asset. Only its PREFIX was ever
// recorded (`dc332329…` in the register) and the file itself no longer exists, so this is a
// prefix check — not a full-hash pin, and deliberately not written as one. The positive pin above
// is what actually gates promotion; this only turns "silently wrong file" into a named refusal.
export const FORBIDDEN_SOURCE_SHA_PREFIXES = Object.freeze({
  "dc332329": "A2 candidate 1 — REJECTED by the harness (D-087)",
});

export const SRC_W = 1024, SRC_H = 1536;
export const OUT_W = 512, OUT_H = 768;

// cwebp flags — byte-for-byte the runtime-asset settings used for base v2 (D-061).
export const CWEBP_ARGS = Object.freeze(["-lossless", "-exact", "-z", "9", "-metadata", "none"]);
export const ENCODER_NAME = "libwebp cwebp";
export const ENCODER_VERSION = "1.5.0";
export const ENCODER_SHA256 = "6fcb809892083ce6558878082c0b5a927442654dac963b0d02268f6e99986787";
export const DECODER_SHA256 = "ee66951df0f868f0c41f49fcc2d0fc53072912b7357836317ca177cbae5eb343";

// Budget: D-084 §5 sets ~50 KB for this layer. Advisory vs blocking is decided by the owner, not
// by silently switching to lossy — if this is exceeded the tool reports and (with --promote) still
// refuses to pretend it passed.
export const SIZE_BUDGET_BYTES = 50 * 1024;

// Gate thresholds at SERVED scale. The authoring-scale numbers come from the D-086 harness; a ÷2
// downscale quarters an area, so the pixel-count tolerances are quartered with it. Stated here
// rather than reused blindly, because a threshold that silently changes meaning is not a gate.
export const MAX_ORPHAN_SOFT_PX_SERVED = 16;   // 64 authoring px ÷ 4
export const MIN_COMPONENT_SERVED = 16;        // 64 authoring px ÷ 4

const DEST_DIR = join(REPO, "assets", "avatar-r2", "torso");
const DEST = join(DEST_DIR, "armor-knight-r2-v1.webp");
const FIX_DIR = join(HERE, "fixtures", "r2-torso");
// Provenance lives in its OWN tracked directory, not in fixtures/r2-torso/ — that directory is the
// A1 mask TEMPLATE, and a test rightly asserts it contains exactly the four template files. It is
// also kept out of assets/, so the record is not shipped to the CDN alongside the artwork.
const PROV_DIR = join(HERE, "provenance");
const PROVENANCE = join(PROV_DIR, "armor-knight-r2-v1.provenance.json");
const BUILD = join(HERE, "build", "r2-torso-promotion");
const VENDOR = join(HERE, "vendor");
const CWEBP = join(VENDOR, "cwebp.exe");
const DWEBP = join(VENDOR, "dwebp.exe");
const LAYERS_JS = join(REPO, "js", "avatar-layers.js");
const BASE_WEBP = join(REPO, "assets", "avatar-r2", "base", "body-neutral-medium-v2.webp");

const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const rel = (p) => p.replace(REPO + sep, "").split(sep).join("/");
function fail(msg) { throw new Error("HARD FAIL: " + msg); }

// ── write guard: the tool may only ever touch three directories ───────────────────────────────
const ALLOWED_WRITE_ROOTS = [DEST_DIR, PROV_DIR, BUILD];
export function assertWritable(target) {
  const abs = resolve(target);
  const ok = ALLOWED_WRITE_ROOTS.some((root) => abs === resolve(root) || abs.startsWith(resolve(root) + sep));
  if (!ok) fail("refusing to write outside the asset/provenance/build directories: " + abs);
  // Belt and braces: never the runtime, never the settings, never the owner's backup.
  const lowered = abs.toLowerCase();
  for (const forbidden of ["\\js\\", "/js/", ".claude", "_avatar-artefakter", "r2_manifest"]) {
    if (lowered.includes(forbidden)) fail("refusing to write a protected path: " + abs);
  }
  return abs;
}
function write(target, buf) { const p = assertWritable(target); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, buf); return p; }

// ── the established ÷2 downscale: premultiplied 2×2 box average ───────────────────────────────
// Copied deliberately from `extract-master-base.mjs` (which produced the runtime base) so this
// asset lands on the same grid with the same edge behaviour. Premultiplying is what keeps
// transparent pixels from bleeding their RGB into the garment edge.
export function downscaleHalf(sw, sh, srgba) {
  const dw = sw >> 1, dh = sh >> 1;
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

// Mask downscale. The two masks mean opposite things, so they may NOT share a rule:
//   edit  → UNION  (any of the 4 sources allowed ⇒ served pixel allowed). Permissive, because ink
//           legally drawn at authoring scale must not be reported as stray after averaging.
//   hard  → INTERSECT (all 4 sources mandatory ⇒ served pixel mandatory). Conservative, because a
//           served pixel straddling the mask edge is legitimately semi-transparent.
export function downscaleMask(sw, sh, mask, mode) {
  const dw = sw >> 1, dh = sh >> 1;
  const out = new Uint8Array(dw * dh);
  for (let dy = 0; dy < dh; dy++) {
    for (let dx = 0; dx < dw; dx++) {
      let on = 0;
      for (let yy = 0; yy < 2; yy++) for (let xx = 0; xx < 2; xx++) on += mask[(dy * 2 + yy) * sw + (dx * 2 + xx)] ? 1 : 0;
      out[dy * dw + dx] = mode === "union" ? (on > 0 ? 1 : 0) : (on === 4 ? 1 : 0);
    }
  }
  return out;
}

// ── generic area-average downscale to an arbitrary size (review + legibility only) ────────────
function downscaleTo(sw, sh, srgba, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4);
  for (let dy = 0; dy < dh; dy++) {
    const y0 = Math.floor(dy * sh / dh), y1 = Math.max(y0 + 1, Math.floor((dy + 1) * sh / dh));
    for (let dx = 0; dx < dw; dx++) {
      const x0 = Math.floor(dx * sw / dw), x1 = Math.max(x0 + 1, Math.floor((dx + 1) * sw / dw));
      let r = 0, g = 0, b = 0, aSum = 0, n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const si = (y * sw + x) * 4, a = srgba[si + 3];
        r += srgba[si] * a; g += srgba[si + 1] * a; b += srgba[si + 2] * a; aSum += a; n++;
      }
      const di = (dy * dw + dx) * 4;
      if (aSum === 0) { out[di + 3] = 0; }
      else { out[di] = Math.round(r / aSum); out[di + 1] = Math.round(g / aSum); out[di + 2] = Math.round(b / aSum); out[di + 3] = Math.round(aSum / n); }
    }
  }
  return out;
}

// ── vendored binaries ─────────────────────────────────────────────────────────────────────────
function requireBinary(path, name, pinnedSha) {
  if (!existsSync(path)) {
    fail(`vendored ${name} missing: ${rel(path)}\n  run:  node tools/avatar/fetch-${name}.mjs`);
  }
  const actual = sha256(readFileSync(path));
  if (actual !== pinnedSha) {
    fail(`vendored ${name} SHA ${actual.slice(0, 16)}… != pinned ${pinnedSha.slice(0, 16)}… — refusing to build an asset with an unverified binary`);
  }
  return actual;
}
function cwebpVersion() {
  const r = spawnSync(CWEBP, ["-version"], { encoding: "utf8" });
  if (r.status !== 0) fail("cwebp -version failed");
  return (r.stdout || "").trim().split(/\r?\n/)[0].trim();
}
function encodeWebp(pngPath, outPath) {
  assertWritable(outPath);
  const r = spawnSync(CWEBP, [...CWEBP_ARGS, pngPath, "-o", outPath], { encoding: "utf8" });
  if (r.status !== 0) fail("cwebp failed: " + (r.stderr || r.stdout || ""));
  return readFileSync(outPath);
}
function decodeWebp(webpPath, label) {
  mkdirSync(BUILD, { recursive: true });
  const out = join(BUILD, "decode-" + label + ".png");
  assertWritable(out);
  const r = spawnSync(DWEBP, [webpPath, "-o", out], { encoding: "utf8" });
  if (r.status !== 0) fail("dwebp failed on " + rel(webpPath) + ": " + (r.stderr || ""));
  return decodePng(readFileSync(out), label);
}

// ── masks (verified against the tracked A1 spec, exactly as the D-086 harness does) ────────────
function loadMasks() {
  const spec = JSON.parse(readFileSync(join(FIX_DIR, "torso-mask-spec-v1.json"), "utf8"));
  const read = (f) => {
    const buf = readFileSync(join(FIX_DIR, f));
    if (sha256(buf) !== spec.masks[f].sha256) {
      fail(`${f} does not match the SHA recorded in the A1 spec — the accepted template is inconsistent`);
    }
    const img = decodePng(buf, f);
    const m = new Uint8Array(img.w * img.h);
    for (let i = 0; i < m.length; i++) m[i] = img.rgba[i * 4 + 3] > 0 ? 1 : 0;
    return m;
  };
  return {
    hard: read("torso-occlusion-hard-v1.png"),
    edit: read("torso-edit-allowed-v1.png"),
    protect: read("torso-protect-v1.png"),
    spec,
  };
}

// ── 8-connected opaque components ─────────────────────────────────────────────────────────────
function componentSizes(w, h, rgba, threshold) {
  const on = new Uint8Array(w * h);
  for (let i = 0; i < on.length; i++) on[i] = rgba[i * 4 + 3] >= threshold ? 1 : 0;
  const seen = new Uint8Array(on.length), sizes = [];
  const N = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (let s = 0; s < on.length; s++) {
    if (!on[s] || seen[s]) continue;
    const q = [s]; seen[s] = 1;
    for (let k = 0; k < q.length; k++) {
      const j = q[k], y = (j / w) | 0, x = j % w;
      for (const [dx, dy] of N) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const t = yy * w + xx;
        if (on[t] && !seen[t]) { seen[t] = 1; q.push(t); }
      }
    }
    sizes.push(q.length);
  }
  return sizes.sort((a, b) => b - a);
}

// ── the verification, measured on the DECODED WebP ────────────────────────────────────────────
export function verifyServed(decoded, reference, masks512) {
  const { w, h, rgba } = decoded;
  const gates = [];
  const add = (id, pass, detail) => gates.push({ id, pass, detail });

  add("served-dimensions", w === OUT_W && h === OUT_H, { got: `${w}x${h}`, expect: `${OUT_W}x${OUT_H}` });
  if (w !== OUT_W || h !== OUT_H) return { gates, pass: false };

  let transparent = 0, partial = 0, opaque = 0;
  for (let i = 0; i < w * h; i++) {
    const a = rgba[i * 4 + 3];
    if (a === 0) transparent++; else if (a >= OPAQUE) opaque++; else partial++;
  }
  add("alpha-preserved", transparent > 0 && opaque > 0, { transparent, partial, opaque });

  let strayOutsideEdit = 0, inkOnProtect = 0;
  for (let i = 0; i < w * h; i++) {
    if (rgba[i * 4 + 3] < VISIBLE) continue;
    if (!masks512.edit[i]) strayOutsideEdit++;
    if (masks512.protect[i]) inkOnProtect++;
  }
  add("no-ink-outside-edit-zone", strayOutsideEdit === 0, { strayOutsideEdit });
  add("no-ink-on-protect-mask", inkOnProtect === 0, { inkOnProtect });

  let hardTotal = 0, hardGap = 0;
  for (let i = 0; i < w * h; i++) {
    if (!masks512.hard[i]) continue;
    hardTotal++;
    if (rgba[i * 4 + 3] < OPAQUE) hardGap++;
  }
  add("hard-region-fully-opaque", hardGap === 0, { hardTotal, hardGap, coverage: hardTotal ? +((hardTotal - hardGap) / hardTotal).toFixed(6) : 0 });

  // halo: a semi-transparent pixel with no opaque 8-neighbour is detached glow, not an edge ramp
  let orphanSoft = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, a = rgba[i * 4 + 3];
    if (a === 0 || a >= OPAQUE) continue;
    let neighbour = false;
    for (let dy = -1; dy <= 1 && !neighbour; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      if (rgba[(yy * w + xx) * 4 + 3] >= OPAQUE) { neighbour = true; break; }
    }
    if (!neighbour) orphanSoft++;
  }
  add("alpha-clean-no-halo", orphanSoft <= MAX_ORPHAN_SOFT_PX_SERVED, { orphanSoft, tolerance: MAX_ORPHAN_SOFT_PX_SERVED });

  const comps = componentSizes(w, h, rgba, OPAQUE);
  const specks = comps.filter((c) => c < MIN_COMPONENT_SERVED);
  add("no-floating-islands", specks.length === 0, { components: comps.length, largest: comps[0] || 0, specks: specks.slice(0, 8), minComponent: MIN_COMPONENT_SERVED });

  // THE decisive gate: lossless means the decoded asset IS the reference, byte for byte. This also
  // proves no region — breastplate, collar, belt, skirt — changed, without needing a per-region test.
  let rgbaDiff = 0;
  if (reference && reference.length === rgba.length) {
    for (let i = 0; i < rgba.length; i++) if (rgba[i] !== reference[i]) rgbaDiff++;
  } else { rgbaDiff = -1; }
  add("decoded-matches-reference-exactly", rgbaDiff === 0, { differingBytes: rgbaDiff });

  // legibility at the D-071 render sizes, measured on the served asset over its own hard footprint
  const scales = [];
  for (const [sw, sh] of RENDER_SIZES) {
    const small = downscaleTo(w, h, rgba, sw, sh);
    const hardSmall = downscaleTo(w, h, maskToRgba(w, h, masks512.hard), sw, sh);
    let inFootprint = 0, covered = 0;
    for (let i = 0; i < sw * sh; i++) {
      if (hardSmall[i * 4 + 3] < 128) continue;
      inFootprint++;
      if (small[i * 4 + 3] >= 128) covered++;
    }
    scales.push({ size: `${sw}x${sh}`, coverage: inFootprint ? +(covered / inFootprint).toFixed(4) : 0 });
  }
  add("legible-at-render-sizes", scales.every((s) => s.coverage >= MIN_SCALE_COVERAGE), { min: MIN_SCALE_COVERAGE, scales });

  return { gates, pass: gates.every((g) => g.pass) };
}

function maskToRgba(w, h, mask) {
  const buf = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) if (mask[i]) { buf[i * 4] = 255; buf[i * 4 + 1] = 255; buf[i * 4 + 2] = 255; buf[i * 4 + 3] = 255; }
  return buf;
}

// ── runtime guards: this tool must never be the thing that switches the avatar over ────────────
function runtimeGuards() {
  const js = readFileSync(LAYERS_JS, "utf8");
  if (!/export const AVATAR_R2 = false;/.test(js)) fail("AVATAR_R2 is not `false` in js/avatar-layers.js");
  const slots = js.match(/R2_SUPPORTED_COSMETIC_SLOTS\s*=\s*\[([^\]]*)\]/);
  if (!slots) fail("could not read R2_SUPPORTED_COSMETIC_SLOTS");
  if (/["']torso["']/.test(slots[1])) fail("`torso` is already in R2_SUPPORTED_COSMETIC_SLOTS — A3.1 must not wire the slot");
  if (!/r2RequiresC2Fallback/.test(js)) fail("D-083 fallback helper missing from js/avatar-layers.js");
  return { avatarR2: false, torsoSupported: false, d083FallbackPresent: true };
}

// ── main ──────────────────────────────────────────────────────────────────────────────────────
export function run({ promote = false, review = false, source = DEFAULT_SOURCE } = {}) {
  const log = [];
  const say = (s) => { log.push(s); console.log(s); };

  say(`${TOOL} v${TOOL_VERSION} — ${promote ? "--promote" : "verify only (no writes)"}`);

  const guards = runtimeGuards();
  say("✓ runtime guards: AVATAR_R2 false · torso NOT in R2_SUPPORTED_COSMETIC_SLOTS · D-083 fallback present");

  const encSha = requireBinary(CWEBP, "cwebp", ENCODER_SHA256);
  const decSha = requireBinary(DWEBP, "dwebp", DECODER_SHA256);
  const encVersion = cwebpVersion();
  if (!encVersion.startsWith(ENCODER_VERSION)) fail(`cwebp version "${encVersion}" != pinned ${ENCODER_VERSION}`);
  say(`✓ encoder: ${ENCODER_NAME} ${encVersion} (sha ${encSha.slice(0, 16)}…) · decoder sha ${decSha.slice(0, 16)}…`);

  if (!existsSync(source)) fail(`source candidate not found: ${source}\n  restore it from the D-088 backup (see its LÆS-MIG.txt) — do not regenerate it`);
  const srcBuf = readFileSync(source);
  const srcSha = sha256(srcBuf);
  for (const [prefix, why] of Object.entries(FORBIDDEN_SOURCE_SHA_PREFIXES)) {
    if (srcSha.startsWith(prefix)) fail(`source is a FORBIDDEN candidate: ${why}`);
  }
  if (srcSha !== ACCEPTED_SOURCE_SHA) {
    fail(`source SHA ${srcSha.slice(0, 16)}… != the owner-accepted ${ACCEPTED_SOURCE_SHA.slice(0, 16)}… (D-088)\n  only the accepted candidate may be promoted`);
  }
  const src = decodePng(srcBuf, "source");
  if (src.w !== SRC_W || src.h !== SRC_H) fail(`source dims ${src.w}x${src.h} != ${SRC_W}x${SRC_H}`);
  say(`✓ source: ${rel(source)} · ${src.w}x${src.h} RGBA · sha ${srcSha.slice(0, 16)}… = D-088 accepted`);

  const masks = loadMasks();
  const masks512 = {
    hard: downscaleMask(SRC_W, SRC_H, masks.hard, "intersect"),
    edit: downscaleMask(SRC_W, SRC_H, masks.edit, "union"),
  };
  masks512.protect = new Uint8Array(OUT_W * OUT_H);
  for (let i = 0; i < masks512.protect.length; i++) masks512.protect[i] = masks512.edit[i] ? 0 : 1;
  say(`✓ masks: A1 template verified by SHA · served hard ${masks512.hard.reduce((a, b) => a + b, 0)} px · served edit ${masks512.edit.reduce((a, b) => a + b, 0)} px`);

  const reference = downscaleHalf(SRC_W, SRC_H, src.rgba);
  const referencePng = encodePngRGBA(OUT_W, OUT_H, reference);
  mkdirSync(BUILD, { recursive: true });
  const refPath = write(join(BUILD, "reference-512x768.png"), referencePng);
  say(`✓ reference: premultiplied 2×2 box ÷2 → ${OUT_W}x${OUT_H} · sha ${sha256(referencePng).slice(0, 16)}…`);

  // encode twice, into the build dir, and only then place the asset
  const tmpA = encodeWebp(refPath, join(BUILD, "encode-a.webp"));
  const tmpB = encodeWebp(refPath, join(BUILD, "encode-b.webp"));
  const outShaA = sha256(tmpA), outShaB = sha256(tmpB);
  if (outShaA !== outShaB) fail("cwebp is NOT deterministic — two encodes of the same reference differ");
  say(`✓ deterministic encode: two runs → ${outShaA.slice(0, 16)}… · ${tmpA.length} B`);

  const decoded = decodeWebp(join(BUILD, "encode-a.webp"), "a");
  const result = verifyServed(decoded, reference, masks512);
  for (const g of result.gates) say(`  ${g.pass ? "✓" : "✖"} ${g.id} ${JSON.stringify(g.detail)}`);

  const budgetOk = tmpA.length <= SIZE_BUDGET_BYTES;
  say(`  ${budgetOk ? "✓" : "✖"} size-budget ${tmpA.length} B vs ${SIZE_BUDGET_BYTES} B (D-084 §5)`);

  const srcShaAfter = sha256(readFileSync(source));
  if (srcShaAfter !== ACCEPTED_SOURCE_SHA) fail("the source candidate changed during the run");
  say("✓ source SHA unchanged after the whole process");

  const provenance = {
    tool: TOOL, toolVersion: TOOL_VERSION, decision: "D-089",
    acceptance: { decision: "D-088", status: "A2_ACCEPTED", note: "owner visual acceptance of A2 candidate 2, incl. the disclosed adapter-constructed pixels" },
    source: {
      path: rel(source), sha256: srcSha, width: src.w, height: src.h, colorType: "RGBA",
      rawGenerationSha256: "83fcff0c543150cd8c1c0e0b2abfb22c66584407dce98067da6354815de1c87e",
      overscan: 1.05, fitScale: 0.438, backfilledPx: 8608, backfillShareOfVisibleArtwork: 0.0855,
      backfillShareOfHardMask: 0.0881,
    },
    downscale: { method: "premultiplied 2x2 box average", from: `${SRC_W}x${SRC_H}`, to: `${OUT_W}x${OUT_H}`, referenceSha256: sha256(referencePng) },
    encoder: { name: ENCODER_NAME, version: encVersion, sha256: encSha, args: [...CWEBP_ARGS], lossless: true, exactAlpha: true, command: `cwebp ${CWEBP_ARGS.join(" ")} <reference.png> -o <out.webp>` },
    decoder: { name: "libwebp dwebp", sha256: decSha },
    output: { path: rel(DEST), sha256: outShaA, bytes: tmpA.length, width: OUT_W, height: OUT_H, budgetBytes: SIZE_BUDGET_BYTES, withinBudget: budgetOk },
    gates: result.gates.map((g) => ({ id: g.id, pass: g.pass, detail: g.detail })),
    runtime: { ...guards, manifestRegistered: false, note: "A3.1 promotes the asset only. R2_MANIFEST lives in js/avatar-layers.js and is NOT edited here; registration + wiring are A3.2. The runtime still uses the D-083 whole-avatar C2 fallback for this item." },
  };

  if (!promote) {
    say(`\n${result.pass && budgetOk ? "✓ VERIFY PASS" : "✖ VERIFY FAIL"} — nothing written to assets/ (verify mode).`);
    return { ...result, budgetOk, provenance, wrote: false };
  }

  if (!result.pass) fail("gates did not pass — refusing to promote");
  if (!budgetOk) {
    fail(`encoded asset is ${tmpA.length} B, over the ${SIZE_BUDGET_BYTES} B budget (D-084 §5).\n` +
         "  Lossy encoding and weakened alpha are NOT acceptable substitutes — this needs an owner decision.");
  }

  mkdirSync(DEST_DIR, { recursive: true });
  write(DEST, tmpA);
  write(PROVENANCE, Buffer.from(JSON.stringify(provenance, null, 2) + "\n", "utf8"));
  const placedSha = sha256(readFileSync(DEST));
  if (placedSha !== outShaA) fail("the placed asset does not match the verified encode");
  say(`\n✓ PROMOTED → ${rel(DEST)} · ${tmpA.length} B · sha ${placedSha.slice(0, 16)}…`);
  say(`✓ provenance → ${rel(PROVENANCE)}`);
  say("  js/ untouched · R2_MANIFEST untouched · torso still unsupported · AVATAR_R2 false");

  if (review) writeReviewImages(src, reference, decoded, masks512, provenance);
  return { ...result, budgetOk, provenance, wrote: true, outSha: outShaA, bytes: tmpA.length };
}

// ── review images (gitignored) ────────────────────────────────────────────────────────────────
function writeReviewImages(src, reference, decoded, masks512, provenance) {
  mkdirSync(BUILD, { recursive: true });
  const put = (name, w, h, rgba) => write(join(BUILD, name), encodePngRGBA(w, h, rgba));

  put("01-source-1024x1536.png", SRC_W, SRC_H, src.rgba);
  put("02-reference-512x768.png", OUT_W, OUT_H, reference);
  put("03-decoded-webp.png", OUT_W, OUT_H, decoded.rgba);

  // source vs reference: nearest-upscale the reference and show where the ÷2 changed the picture
  const up = Buffer.alloc(SRC_W * SRC_H * 4);
  for (let y = 0; y < SRC_H; y++) for (let x = 0; x < SRC_W; x++) {
    const si = ((y >> 1) * OUT_W + (x >> 1)) * 4, di = (y * SRC_W + x) * 4;
    for (let c = 0; c < 4; c++) up[di + c] = reference[si + c];
  }
  const d1 = Buffer.alloc(SRC_W * SRC_H * 4);
  for (let i = 0; i < SRC_W * SRC_H; i++) {
    let m = 0;
    for (let c = 0; c < 4; c++) m = Math.max(m, Math.abs(src.rgba[i * 4 + c] - up[i * 4 + c]));
    d1[i * 4] = m > 0 ? 255 : 0; d1[i * 4 + 1] = m > 0 ? Math.max(0, 255 - m * 4) : 0; d1[i * 4 + 2] = 0; d1[i * 4 + 3] = 255;
  }
  put("04-diff-source-vs-reference.png", SRC_W, SRC_H, d1);

  // reference vs decoded: MUST be entirely black — that is the lossless proof
  const d2 = Buffer.alloc(OUT_W * OUT_H * 4);
  let diffPx = 0;
  for (let i = 0; i < OUT_W * OUT_H; i++) {
    let m = 0;
    for (let c = 0; c < 4; c++) m = Math.max(m, Math.abs(reference[i * 4 + c] - decoded.rgba[i * 4 + c]));
    if (m > 0) diffPx++;
    d2[i * 4] = m > 0 ? 255 : 0; d2[i * 4 + 3] = 255;
  }
  put("05-diff-reference-vs-decoded.png", OUT_W, OUT_H, d2);

  // asset over the runtime R2 base
  let base = null;
  try { base = decodeWebp(BASE_WEBP, "base"); } catch (_e) { base = null; }
  if (base && base.w === OUT_W && base.h === OUT_H) {
    const over = Buffer.from(base.rgba);
    compositeOver(over, decoded.rgba, OUT_W * OUT_H);
    put("06-asset-over-r2-base.png", OUT_W, OUT_H, over);

    const strip = fourScale(over);
    put("09-four-scale-review.png", strip.w, strip.h, strip.rgba);
  }

  put("07-hard-mask-overlay.png", OUT_W, OUT_H, overlay(decoded.rgba, masks512.hard, [0, 255, 0]));
  put("08-protect-mask-overlay.png", OUT_W, OUT_H, overlay(decoded.rgba, masks512.protect, [255, 0, 0]));

  const alphaImg = Buffer.alloc(OUT_W * OUT_H * 4);
  for (let i = 0; i < OUT_W * OUT_H; i++) {
    const a = decoded.rgba[i * 4 + 3];
    alphaImg[i * 4] = a; alphaImg[i * 4 + 1] = a; alphaImg[i * 4 + 2] = a; alphaImg[i * 4 + 3] = 255;
  }
  put("10-alpha-review.png", OUT_W, OUT_H, alphaImg);

  write(join(BUILD, "report.json"), Buffer.from(JSON.stringify({ ...provenance, referenceVsDecodedDifferingPixels: diffPx }, null, 2) + "\n", "utf8"));
}

function compositeOver(dst, srcRgba, n) {
  for (let i = 0; i < n; i++) {
    const a = srcRgba[i * 4 + 3] / 255;
    if (a === 0) continue;
    for (let c = 0; c < 3; c++) dst[i * 4 + c] = Math.round(srcRgba[i * 4 + c] * a + dst[i * 4 + c] * (1 - a));
    dst[i * 4 + 3] = Math.max(dst[i * 4 + 3], srcRgba[i * 4 + 3]);
  }
}
function overlay(rgba, mask, colour) {
  const out = Buffer.from(rgba);
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.round(out[i * 4 + c] * 0.55 + colour[c] * 0.45);
    out[i * 4 + 3] = Math.max(out[i * 4 + 3], 90);
  }
  return out;
}
function fourScale(rgba) {
  const pad = 8;
  const w = RENDER_SIZES.reduce((a, [sw]) => a + sw + pad, pad);
  const h = RENDER_SIZES[0][1] + pad * 2;
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { out[i * 4] = 24; out[i * 4 + 1] = 24; out[i * 4 + 2] = 28; out[i * 4 + 3] = 255; }
  let x0 = pad;
  for (const [sw, sh] of RENDER_SIZES) {
    const small = downscaleTo(OUT_W, OUT_H, rgba, sw, sh);
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      const si = (y * sw + x) * 4, di = ((y + pad) * w + (x + x0)) * 4;
      const a = small[si + 3] / 255;
      for (let c = 0; c < 3; c++) out[di + c] = Math.round(small[si + c] * a + out[di + c] * (1 - a));
    }
    x0 += sw + pad;
  }
  return { w, h, rgba: out };
}

// ── CLI ───────────────────────────────────────────────────────────────────────────────────────
const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  const args = process.argv.slice(2);
  const si = args.indexOf("--source");
  try {
    const r = run({
      promote: args.includes("--promote"),
      review: args.includes("--review") || args.includes("--promote"),
      source: si !== -1 && args[si + 1] ? args[si + 1] : DEFAULT_SOURCE,
    });
    process.exit(r.pass && r.budgetOk ? 0 : 1);
  } catch (e) {
    console.error("✖ " + e.message);
    process.exit(1);
  }
}
