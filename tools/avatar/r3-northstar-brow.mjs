// R3 NORTHSTAR BROW (D-190). Completes the image-left brow of the D-189 review variant by the D-158 mirroring: Northstar's fully
// visible image-right brow (the D-189 browR layer) is mirrored about the measured midline (the midpoint of the two eye
// components' centroids), fitted by the smallest reproducible adjustment in D-158's lexicographic order (no pixel on safe
// visible skin, then the highest IoU with the observed left brow, then the smallest deviation), and used ONLY inside the area
// the hair hid (D-188's missing-under-hair mask) where the observed brow has no pixel. Every observed pixel is kept. The filled
// pixels are RECONSTRUCTED, never observed. The D-189 and D-188 files are read through their own pins and stay unchanged.
// REVIEW VARIANT ONLY: never promotable by passing checks. No H1, no image call, no runtime change; R3 stays default OFF.
// Usage: node tools/avatar/r3-northstar-brow.mjs --out <empty dir>
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng, encodePng, pixelSha256 } from "./r3-hair-tool-v2.mjs";
import * as NL from "./r3-northstar-layers.mjs";
import * as HD from "./r3-northstar-head.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
export const DECISION = "D-190";
export const FIXTURES = "tools/avatar/fixtures/r3-northstar-brow/";
export const SPEC_FILE = FIXTURES + "spec-v1.json";
export const MANIFEST_FILE = FIXTURES + "manifest-v1.json";
export const COMPOSITE_ORDER = HD.COMPOSITE_ORDER;
export const BUILT = Object.freeze(["browL"]);
export const MASKS = Object.freeze(["brow-observed", "brow-mirror-fitted", "brow-mirror-fill", "brow-safe-skin"]);
export const REVIEW_STATUS = "REVIEW VARIANT (D-190) — the image-left brow completed by the D-158 mirroring on the D-189 baseline (the filled part is reconstructed, not observed); not approved, not promotable";
export const BOX = Object.freeze([370, 215, 520, 300]);   // the left brow's neighbourhood: every fit is evaluated here
const W = 1024, H = 1536, N = W * H;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const rel = (p) => readFileSync(join(REPO, ...p.split("/")));
export const loadSpec = () => JSON.parse(rel(SPEC_FILE).toString("utf8"));
export function promotionStatus() { return { promotable: false, status: REVIEW_STATUS, reason: "D-190 completes a review variant only; promotion needs a later, explicit owner decision and is never derived from check results" }; }
export function promote() { throw new Error("the Northstar brow variant is a review candidate (D-190) and cannot be promoted by this tool"); }

/** The D-189 layer set: its built layers from its tracked files, the rest from D-188's tracked files (both pin-verified). */
export function loadBaseline() {
  const h = HD.loadTracked(), d = NL.loadTracked(), layers = {};
  for (const k of HD.COMPOSITE_ORDER) layers[k] = decodePng(HD.BUILT.includes(k) ? h.files[k] : d.files[k]).px;
  return { d189: h, d188: d, layers };
}

/** The measured midline: the midpoint of the alpha centroids of the two eye components (iris ∪ eyes-fixed, alpha >= 128). */
export function measureAxis(layers) {
  const s = { L: [0, 0], R: [0, 0] };
  for (let i = 0; i < N; i++) if (layers.iris[i * 4 + 3] >= 128 || layers.eyesFixed[i * 4 + 3] >= 128) { const x = i % W, k = x < 510 ? "L" : "R"; s[k][0] += x + 0.5; s[k][1]++; }
  return (s.L[0] / s.L[1] + s.R[0] / s.R[1]) / 2;
}

/** Bilinear sample of premultiplied RGBA at continuous pixel coordinates (centres at +0.5). */
function sample(P, x, y) {
  const fx = x - 0.5, fy = y - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0, o = [0, 0, 0, 0];
  for (const [dx, dy, w] of [[0, 0, (1 - ax) * (1 - ay)], [1, 0, ax * (1 - ay)], [0, 1, (1 - ax) * ay], [1, 1, ax * ay]]) {
    const xx = x0 + dx, yy = y0 + dy; if (!w || xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
    const j = (yy * W + xx) * 4, a = P[j + 3] / 255; o[0] += P[j] * a * w; o[1] += P[j + 1] * a * w; o[2] += P[j + 2] * a * w; o[3] += a * w;
  }
  return o;
}
/** The source brow mirrored about x = axis and transformed by { tx, ty, rotationDeg, scale } about the mirrored centroid c. */
export function mirrored(src, axis, c, t, box = BOX) {
  const out = new Uint8ClampedArray(N * 4), th = -t.rotationDeg * Math.PI / 180, cs = Math.cos(th), sn = Math.sin(th);
  for (let Y = box[1]; Y < box[3]; Y++) for (let X = box[0]; X < box[2]; X++) {
    const qx = X + 0.5 - t.tx - c[0], qy = Y + 0.5 - t.ty - c[1];                     // inverse of q = c + s·R(θ)(m − c) + t
    const mx = c[0] + (cs * qx - sn * qy) / t.scale, my = c[1] + (sn * qx + cs * qy) / t.scale;
    const s = sample(src, 2 * axis - mx, my); if (s[3] <= 0) continue;
    const i = (Y * W + X) * 4; out[i] = Math.round(s[0] / s[3]); out[i + 1] = Math.round(s[1] / s[3]); out[i + 2] = Math.round(s[2] / s[3]); out[i + 3] = Math.round(s[3] * 255);
  }
  return out;
}

export function buildBrow({ srcBuf, spec = loadSpec() } = {}) {
  const src = NL.loadSource(srcBuf);
  if (spec.source.sha256 !== NL.SOURCE.sha256) throw new Error("the spec does not name the tracked Northstar v2");
  if (spec.baseline.manifest !== HD.MANIFEST_FILE) throw new Error("the spec does not name the D-189 baseline");
  const base = loadBaseline(), L = base.layers, axis = measureAxis(L);
  const R = L.browR, O = L.browL;
  // the mirrored source's centroid (in the left half), the rotation and scale pivot
  let cx = 0, cy = 0, cn = 0; for (let i = 0; i < N; i++) if (R[i * 4 + 3] >= 128) { cx += 2 * axis - (i % W + 0.5); cy += ((i / W) | 0) + 0.5; cn++; }
  const c = [cx / cn, cy / cn];
  // safe visible skin: D-188's own visible skin (owners mask skin colour), class S/O, opaque, not reconstructed, eroded 2 px
  const own = decodePng(base.d188.files.owners).px, recon = decodePng(base.d188.files.reconstructed).px, notSkin = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const isSkin = own[i * 4] === 255 && own[i * 4 + 1] === 205 && own[i * 4 + 2] === 150 && src[i * 4 + 3] >= 250 && !recon[i * 4 + 3] && ["S", "O"].includes(NL.cls(src[i * 4], src[i * 4 + 1], src[i * 4 + 2], 255));
    if (!isSkin) notSkin[i] = 1;
  }
  const grow = NL.dilate(notSkin, 2), safe = new Uint8Array(N); for (let i = 0; i < N; i++) if (!grow[i]) safe[i] = 1;
  const inBox = []; for (let y = BOX[1]; y < BOX[3]; y++) for (let x = BOX[0]; x < BOX[2]; x++) inBox.push(y * W + x);
  // IoU and recall are measured only where the brow is observable: outside the area the hair hid (D-188 missing-under-hair)
  const miss = decodePng(base.d188.files["missing-under-hair"]).px, visible = new Uint8Array(N); for (const i of inBox) if (!miss[i * 4 + 3]) visible[i] = 1;
  const obs = new Uint8Array(N); let obsN = 0; for (const i of inBox) if (O[i * 4 + 3] >= 128) { obs[i] = 1; obsN++; }
  const score = (t) => { const m = mirrored(R, axis, c, t); let skin = 0, inter = 0, uni = 0; for (const i of inBox) { const a = m[i * 4 + 3] >= 128; if (a && safe[i]) skin++; if (!visible[i]) continue; if (a && obs[i]) inter++; if (a || obs[i]) uni++; } return { skin, iou: inter / uni, recall: inter / obsN, dev: Math.abs(t.tx) + Math.abs(t.ty) + Math.abs(t.rotationDeg) + 100 * Math.abs(t.scale - 1) }; };
  const better = (a, b) => a.skin !== b.skin ? a.skin < b.skin : a.iou !== b.iou ? a.iou > b.iou : a.dev < b.dev;
  const range = ([a, b, s]) => { const o = []; for (let v = a; v <= b + 1e-9; v += s) o.push(+v.toFixed(4)); return o; };
  const raw = { tx: 0, ty: 0, rotationDeg: 0, scale: 1 }, rawScore = score(raw);
  let best = null, stage = null;
  for (const st of spec.method.fit.stages) {
    for (const tx of range(st.tx)) for (const ty of range(st.ty)) for (const rotationDeg of st.rotationDeg.length === 1 ? st.rotationDeg : range(st.rotationDeg)) for (const scale of st.scale.length === 1 ? st.scale : range(st.scale)) {
      const t = { tx, ty, rotationDeg, scale }, s = score(t); if (!best || better(s, best.s)) best = { t, s };
    }
    stage = st.name; if (best.s.skin === 0) break;   // a later stage only on documented need
  }
  const fitted = mirrored(R, axis, c, best.t);
  // completion: observed over the mirror, the mirror only where the hair hid it and the observed brow has no pixel
  const out = new Uint8ClampedArray(O), fill = new Uint8Array(N);
  for (const i of inBox) if (fitted[i * 4 + 3] && miss[i * 4 + 3] && !O[i * 4 + 3]) { out.set(fitted.subarray(i * 4, i * 4 + 4), i * 4); fill[i] = 1; }
  const toPx = (m, rgb) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) if (m[i]) { o.set(rgb, i * 4); o[i * 4 + 3] = 255; } return o; };
  const fittedMask = new Uint8Array(N); for (const i of inBox) if (fitted[i * 4 + 3] >= 128) fittedMask[i] = 1;
  const safeBox = new Uint8Array(N); for (const i of inBox) if (safe[i]) safeBox[i] = 1;
  const masks = { "brow-observed": toPx(obs, [0, 170, 80]), "brow-mirror-fitted": toPx(fittedMask, [230, 0, 180]), "brow-mirror-fill": toPx(fill, [255, 140, 0]), "brow-safe-skin": toPx(safeBox, [255, 205, 150]) };
  const stats = { axis: +axis.toFixed(3), mirroredCentroid: c.map((v) => +v.toFixed(3)), sourceBrowPx: cn, observedBrowPx: obsN, raw: { ...raw, ...rawScore, iou: +rawScore.iou.toFixed(4), recall: +rawScore.recall.toFixed(4) }, fit: { stage, ...best.t, skinPx: best.s.skin, iou: +best.s.iou.toFixed(4), recall: +best.s.recall.toFixed(4) }, filledPx: fill.reduce((s, v) => s + v, 0) };
  return { src, base, layers: { ...L, browL: out }, masks, stats, fitted };
}

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
  const b = buildBrow(), pins = {};
  for (const k of BUILT) { writeFileSync(join(OUT, "layers", `${k}.png`), encodePng(W, H, b.layers[k])); pins[`layers/${k}`] = pixelSha256(b.layers[k]); }
  for (const [k, px] of Object.entries(b.masks)) { writeFileSync(join(OUT, "masks", `${k}.png`), encodePng(W, H, px)); pins[`masks/${k}`] = pixelSha256(px); }
  writeFileSync(join(OUT, "build.json"), JSON.stringify({ decision: DECISION, status: REVIEW_STATUS, pixelSha256: pins, stats: b.stats }, null, 2) + "\n");
  console.log(JSON.stringify(b.stats, null, 1));
}
