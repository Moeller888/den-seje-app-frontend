// R3 NORTHSTAR AFRO (D-192). A review derivative of an afro for the Northstar v2 head, made from the FULL-RESOLUTION R2 afro
// original (tools/avatar/fixtures/r2-hair/afro-cleaned.png, D-113; the served webp is its ÷2 downscale): one placement on the
// unchanged D-191 head, a smooth radial displacement of the afro's own hairline out of the face (nothing cut, scallops kept),
// and a documented back-hair fill behind the head where the D-191 head has a slit (ear band). The original is read only. D-191 and its UNSUITABLE afro
// derivative stay unchanged. REVIEW DERIVATIVE: not approved, not promotable. No image call, no runtime change; R3 OFF.
// Usage: node tools/avatar/r3-northstar-afro.mjs --out <empty dir>
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng, encodePng, pixelSha256 } from "./r3-hair-tool-v2.mjs";
import * as NL from "./r3-northstar-layers.mjs";
import * as HS from "./r3-northstar-hairstyles.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
export const DECISION = "D-192";
export const FIXTURES = "tools/avatar/fixtures/r3-northstar-afro/";
export const SPEC_FILE = FIXTURES + "spec-v1.json";
export const MANIFEST_FILE = FIXTURES + "manifest-v1.json";
export const LAYERS = Object.freeze(["afro", "backHair"]);
export const MASKS = Object.freeze(["hairline-shift", "head-slit-fill"]);
export const REVIEW_STATUS = "REVIEW DERIVATIVE (D-192) — an afro for the Northstar v2 head from the full-resolution R2 original; not approved, not an R3 production asset, not promotable";
const W = 1024, H = 1536, N = W * H;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const rel = (p) => readFileSync(join(REPO, ...p.split("/")));
export const loadSpec = () => JSON.parse(rel(SPEC_FILE).toString("utf8"));
export function promotionStatus() { return { promotable: false, status: REVIEW_STATUS, reason: "D-192 builds a review derivative only; promotion needs a later, explicit owner decision and is never derived from check results" }; }
export function promote() { throw new Error("the Northstar afro is a review derivative (D-192) and cannot be promoted by this tool"); }

/** The tracked full-resolution original, verified against its D-113 pin. */
export function loadSource(spec = loadSpec()) {
  const b = rel(spec.source.file); if (sha(b) !== spec.source.sha256) throw new Error(`${spec.source.file} is not the pinned D-113 afro ${spec.source.sha256}`);
  return decodePng(b).px;
}
const sampleBilinear = (P, sx, sy) => { const fx = sx - 0.5, fy = sy - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0; let l = 0, a = 0;
  for (const [dx, dy, w] of [[0, 0, (1 - ax) * (1 - ay)], [1, 0, ax * (1 - ay)], [0, 1, (1 - ax) * ay], [1, 1, ax * ay]]) { const xx = x0 + dx, yy = y0 + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const j = (yy * W + xx) * 4, aa = P[j + 3] / 255; l += P[j] * aa * w; a += aa * w; }
  return a > 0 ? [Math.round(l / a), Math.round(a * 255)] : null; };
/** v2 = s·(x + 0.5) + t on the 1024x1536 canvas (grey + alpha). */
export function place(S, s, tx, ty) {
  const o = new Uint8ClampedArray(N * 4);
  for (let y = 0; y < 700; y++) for (let x = 0; x < W; x++) { const v = sampleBilinear(S, (x + 0.5 - tx) / s, (y + 0.5 - ty) / s); if (!v) continue; const i = (y * W + x) * 4; o[i] = o[i + 1] = o[i + 2] = v[0]; o[i + 3] = v[1]; }
  return o;
}
/** The smooth radial displacement of the hairline (spec.hairline). Returns the moved layer and the per-pixel shift. */
export function shiftHairline(P, h) {
  const A = h.angularSamples, c = h.centre, [rx, ry] = h.radii, n = h.exponent, rc = new Float32Array(A), ro = new Float32Array(A), d = new Float32Array(A);
  for (let k = 0; k < A; k++) { const th = (k / A) * 2 * Math.PI, dx = Math.cos(th), dy = Math.sin(th); let first = -1, last = -1;
    for (let q = 0; q < 700; q += 0.5) { const x = Math.round(c[0] + q * dx), y = Math.round(c[1] + q * dy); if (x < 0 || y < 0 || x >= W || y >= H) break; if (P[(y * W + x) * 4 + 3] >= 128) { if (first < 0) first = q; last = q; } }
    rc[k] = first; ro[k] = last; }
  for (let k = 0; k < A; k++) {
    if (rc[k] < 0) continue; const th = (k / A) * 2 * Math.PI, dx = Math.cos(th), dy = Math.sin(th), rt = 1 / Math.pow(Math.abs(dx / rx) ** n + Math.abs(dy / ry) ** n, 1 / n), ty = c[1] + rt * dy;
    const w = ty <= h.fadeY[0] ? 1 : ty >= h.fadeY[1] ? 0 : (h.fadeY[1] - ty) / (h.fadeY[1] - h.fadeY[0]);
    let mn = Infinity; for (let j = -h.scallopWindowSamples; j <= h.scallopWindowSamples; j++) { const v = rc[(k + j + A) % A]; if (v >= 0) mn = Math.min(mn, v); }
    d[k] = Math.max(0, rt - mn) * w;
  }
  const sm = h.smoothSamples, ds = new Float32Array(A);
  for (let k = 0; k < A; k++) { let s = 0, m = 0; for (let j = -2 * sm; j <= 2 * sm; j++) { const w = Math.exp(-(j * j) / (2 * sm * sm)); s += d[(k + j + A) % A] * w; m += w; } ds[k] = Math.max(d[k], s / m); }
  const o = new Uint8ClampedArray(N * 4), shift = new Float32Array(N);
  for (let y = 0; y < 700; y++) for (let x = 0; x < W; x++) {
    const vx = x + 0.5 - c[0], vy = y + 0.5 - c[1], rr = Math.hypot(vx, vy), th = Math.atan2(vy, vx), kf = ((th < 0 ? th + 2 * Math.PI : th) / (2 * Math.PI)) * A, k0 = Math.floor(kf) % A, k1 = (k0 + 1) % A, f = kf - Math.floor(kf);
    const dd = ds[k0] * (1 - f) + ds[k1] * f; let sx = x + 0.5, sy = y + 0.5;
    if (dd > 0.01) { const r0 = Math.min(rc[k0] < 0 ? Infinity : rc[k0], rc[k1] < 0 ? Infinity : rc[k1]), r1 = Math.max(ro[k0], ro[k1]);
      const g = rr <= r0 + dd ? 1 : rr >= r1 ? 0 : 1 - (rr - r0 - dd) / Math.max(1, r1 - r0 - dd), rs = rr - dd * g;
      sx = c[0] + rs * Math.cos(th); sy = c[1] + rs * Math.sin(th); shift[y * W + x] = dd * g; }
    const v = sampleBilinear(P, sx, sy); if (!v) continue; const i = (y * W + x) * 4; o[i] = o[i + 1] = o[i + 2] = v[0]; o[i + 3] = v[1];
  }
  return { px: o, shift, maxShift: Math.max(...ds), rcBefore: rc };
}

export function buildAfro({ spec = loadSpec() } = {}) {
  if (spec.baseline.manifest !== HS.MANIFEST_FILE) throw new Error("the spec does not name the D-191 baseline");
  const S = loadSource(spec), head = HS.buildHairstyles(), bald = HS.composeSituation(head, "bald"), p = spec.placement;
  const placed = place(S, p.s, p.axisX - p.s * p.sourceCentreX, p.topMarginPx - p.s * p.sourceTopY);
  const sh = shiftHairline(placed, spec.hairline), afro = sh.px;
  // back-hair fill behind the head (spec.backHair): only the D-191 head's own slits inside a closing of its silhouette
  const B = spec.backHair, bm = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (bald[i * 4 + 3] >= 128) bm[i] = 1;
  const headClosed = NL.dilate(bm, B.headClosingPx), headOutside = NL.dilate(Uint8Array.from(headClosed, (v) => 1 - v), B.headClosingPx);
  const gap = new Uint8Array(N);
  for (let i = 0; i < N; i++) { const y = (i / W) | 0; if (!bm[i] && afro[i * 4 + 3] < 128 && !headOutside[i] && y >= B.headBandY[0] && y <= B.headBandY[1]) gap[i] = 1; }
  const known = new Uint8Array(N); for (let i = 0; i < N; i++) if (afro[i * 4 + 3] >= 250) known[i] = 1;
  const f = NL.harmonicFill(afro, gap, known), backHair = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < N; i++) if (gap[i]) { const g = Math.round(f[i * 3]); backHair[i * 4] = backHair[i * 4 + 1] = backHair[i * 4 + 2] = g; backHair[i * 4 + 3] = 255; }
  const toPx = (m, rgb) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) if (m(i)) { o.set(rgb, i * 4); o[i * 4 + 3] = 255; } return o; };
  const masks = { "hairline-shift": toPx((i) => sh.shift[i] >= 0.5 && afro[i * 4 + 3] > 0, [255, 140, 0]), "head-slit-fill": toPx((i) => gap[i], [230, 0, 180]) };
  const count = (k) => { let n = 0; for (let i = 0; i < N; i++) if (masks[k][i * 4 + 3]) n++; return n; };
  const stats = { maxHairlineShiftPx: +sh.maxShift.toFixed(2), hairlineShiftPx: count("hairline-shift"), headSlitFillPx: count("head-slit-fill") };
  return { head, bald, placed, layers: { afro, backHair }, masks, stats };
}
/** The afro situation: back hair BEHIND the D-191 bald head, the afro on top; both tinted for review (no cast shadow). */
export function composeAfro(build, rgb = HS.HAIR_TOKEN_BROWN) { return NL.overStack([HS.tint(build.layers.backHair, rgb), build.bald, HS.tint(build.layers.afro, rgb)]); }

export function loadTracked() {
  const man = JSON.parse(rel(MANIFEST_FILE).toString("utf8")), files = {};
  for (const [k, e] of Object.entries({ ...man.layers, ...man.masks })) { const b = rel(e.file); if (sha(b) !== e.sha256) throw new Error(`${e.file} is not the pinned ${e.sha256}`); files[k] = b; }
  if (sha(rel(SPEC_FILE)) !== man.spec.sha256) throw new Error(`${SPEC_FILE} is not the pinned ${man.spec.sha256}`);
  return { man, files };
}

const invokedDirectly = typeof process.argv[1] === "string" && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  const args = process.argv.slice(2), i = args.indexOf("--out"), outDir = i >= 0 ? args[i + 1] : null;
  if (!outDir) throw new Error("usage: --out <empty dir>");
  const OUT = resolve(outDir); if (existsSync(OUT) && readdirSync(OUT).length) throw new Error("output directory not empty");
  for (const d of ["layers", "masks"]) mkdirSync(join(OUT, d), { recursive: true });
  const b = buildAfro(), pins = {};
  for (const k of LAYERS) { writeFileSync(join(OUT, "layers", `${k}.png`), encodePng(W, H, b.layers[k])); pins[`layers/${k}`] = pixelSha256(b.layers[k]); }
  for (const [k, px] of Object.entries(b.masks)) { writeFileSync(join(OUT, "masks", `${k}.png`), encodePng(W, H, px)); pins[`masks/${k}`] = pixelSha256(px); }
  writeFileSync(join(OUT, "build.json"), JSON.stringify({ decision: DECISION, status: REVIEW_STATUS, pixelSha256: pins, stats: b.stats }, null, 2) + "\n");
  console.log(JSON.stringify(b.stats));
}
