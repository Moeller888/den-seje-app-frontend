// D-258 R1C EVALUATION — the one authorised R1C call (r1c-plan-v1.json) through r1-c1 (D-257), with the placement against the
// BLEED shape, every automatic check, the review sheets and the record. No image call is made here.
//   node tools/avatar/northstar-r1c-evaluate.mjs --call-id R1C-1-top-tee-hip-apricot-bleed     writes r1c.record.json + sheets
// THE REFERENCE SHAPE: the output is asked to paint the canvas shape (the cut's core grown by 16 px), but the bleed it actually
// paints may be wider or narrower, and a fixed 16 px reference turns that into a wrong scale (D-258's study). So s1 fits the
// output's opaque mask to the core grown by b, with b estimated jointly (0…30 px, best IoU). The margin then neither causes a
// rejection nor a wrong scale; an output without bleed is placed right (b ≈ 0) and fails the coverage before crop.
// THE CHECKS read only the output, the cut and the construction layer — never a mask from a simulation. Holes are counted on the
// output BEFORE the construction lines are drawn. Criteria that need the eye are marked visual and never count as automatic passes.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { encodePng, decodePng } from "./r3-hair-tool-v2.mjs";
import * as WR from "./northstar-wardrobe.mjs";
import * as BF from "./northstar-base-figure.mjs";
import * as BC from "./northstar-base-figure-c.mjs";
import * as IP from "./northstar-item-pilot.mjs";
import * as R1 from "./northstar-r1-garment.mjs";
import * as S1 from "./northstar-r1-similarity.mjs";
import * as C1 from "./northstar-r1-construction.mjs";
import * as EV from "./northstar-r1-evaluate.mjs";
import { PARTNERS } from "./northstar-r1-proof.mjs";
import { inputs } from "./northstar-shape-experiment.mjs";
import { flat, crop, grid, down } from "./northstar-wardrobe-poc.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const ART = join(homedir(), "Documents", "DenSejeApp-artefacts"), CALLS_DIR = join(ART, "r1c-calls"), { W, N } = WR, H = N / W;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const PLAN = JSON.parse(readFileSync(join(ROOT, "tools", "avatar", "fixtures", "northstar-wardrobe", "r1", "r1c-plan-v1.json"), "utf8"));
// the canvas actually sent is pinned by the authorisation (D-258 replaced the plan's v1 canvas by v2 before any send)
export const CANVAS_V2 = Object.freeze({ name: "image-1.tee-hip-bleed-v2.png", bytes: 25098, sha256: "1a7fe120eafece870808848ea9d5e2aa9b5cb2e689835b4cf33966c2dddb2a67" });
export const CALL_ID = PLAN.call.callId;
export const ACCEPT = Object.freeze({ placementIou: 0.95, toneLeak: 0.01 });
export const VISUAL = Object.freeze(["neck: the rib follows the opening; one line at its inner edge; no second line; no white sliver", "armpits: fabric to the cut's contour; no notch; no background",
  "cuffs: the trim ends at the sleeve opening; one line at its edge; not clipped", "hem and side seams: one stitch line, not two; the hem not cut", "pocket: whole, inside the body, naturally placed",
  "folds: shading once, not doubled; the folds belong to the fabric", "material: new fabric, folds, pocket and details from the output (not a recolour of the canvas)", "trim colour: the bands read as trim of the design, not as the canvas's grey",
  "Northstar quality at full size and at 110×165 and 52×78", "no skin, hands or background inside the material"]);

/** The bleed canvas v2 (D-258) — Image 1 of the call. D-257's canvas carried the template item's own drawn lines in its fold shade
 *  (the neck rib line, sleeve seams, the hem stitch) and a darker ring in the bleed (the contour's dark pixels carried outward):
 *  both invite the model to draw lines the cut draws itself. v2: (1) the fold shade is closed by 3 px (a grey closing: thin dark lines
 *  vanish, broad folds stay); (2) the edge zone (< 4 px inside) and the bleed take the shade of the nearest interior pixel;
 *  (3) the trim tone runs into the bleed only beyond the neck and cuff edges (nearest core edge of those segments), the body tone
 *  everywhere else; (4) the shade softened by a 9×9 mean; (5) the bleed's tone cleaned by a 5×5 majority. Two grey tones, no line. */
export function canvasV2(t, cl) {
  const R = 3, sh = Float32Array.from(t.shade), tmp = new Float32Array(N);
  const pass = (src, dst, dx, dy, fn) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (!t.core[i]) { dst[i] = src[i]; continue; } let v = src[i];
    for (let k = -R; k <= R; k++) { const xx = x + k * dx, yy = y + k * dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const j = yy * W + xx; if (t.core[j]) v = fn(v, src[j]); } dst[i] = v; } };
  pass(sh, tmp, 1, 0, Math.max); pass(tmp, sh, 0, 1, Math.max); pass(sh, tmp, 1, 0, Math.min); pass(tmp, sh, 0, 1, Math.min);
  // distance inward from the core's edge; the interior (≥ 4 px) is the shade's source for the edge zone and the bleed
  const din = new Int16Array(N).fill(-1), q = []; for (let i = W; i < N - W; i++) if (t.core[i] && (!t.core[i - 1] || !t.core[i + 1] || !t.core[i - W] || !t.core[i + W])) { din[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) { const i = q[h]; if (din[i] >= 4) continue; for (const j of [i - 1, i + 1, i - W, i + W]) if (t.core[j] && din[j] < 0) { din[j] = din[i] + 1; q.push(j); } }
  const grow = WR.maskOps.dilate(t.core, cl.spec.bleed), shade = new Float32Array(N).fill(-1), src = [];
  for (let i = 0; i < N; i++) if (t.core[i] && (din[i] < 0 || din[i] >= 4)) { shade[i] = sh[i]; src.push(i); }
  for (let h = 0; h < src.length; h++) { const i = src[h], x = i % W; for (const j of [i - 1, i + 1, i - W, i + W]) { if (j < 0 || j >= N || Math.abs((j % W) - x) > 1 || !grow[j] || shade[j] >= 0) continue; shade[j] = shade[i]; src.push(j); } }
  // the tone: in the core the cut's bands; in the bleed the segment of the nearest core edge pixel (neck or cuff → trim)
  const tone = new Int8Array(N).fill(-1), qt = []; for (let i = 0; i < N; i++) if (t.core[i]) tone[i] = cl.band[i] ? 1 : 0;
  for (let i = 0; i < N; i++) if (cl.seg[i]) { tone[i] = cl.seg[i] === 1 || cl.seg[i] === 2 ? 1 : 0; qt.push(i); }
  const lab = new Int8Array(N).fill(-1); for (const i of qt) lab[i] = tone[i];
  for (let h = 0; h < qt.length; h++) { const i = qt[h], x = i % W; for (const j of [i - 1, i + 1, i - W, i + W]) { if (j < 0 || j >= N || Math.abs((j % W) - x) > 1 || !grow[j] || t.core[j] || lab[j] >= 0) continue; lab[j] = lab[i]; qt.push(j); } }
  // (4) the shade softened by a 9×9 box mean over the shape (no hard step a model could read as a panel or seam)
  const sm = new Float32Array(N); { const B = 4; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (!grow[i]) continue; let s2 = 0, n = 0;
    for (let dy = -B; dy <= B; dy++) for (let dx = -B; dx <= B; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const j = yy * W + xx; if (grow[j] && shade[j] >= 0) { s2 += shade[j]; n++; } } sm[i] = n ? s2 / n : 0.5; } }
  // (5) in the bleed, the tone by a 5×5 majority (no isolated specks); the core keeps the cut's bands exactly
  const lab2 = Int8Array.from(lab); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (!grow[i] || t.core[i]) continue; let a = 0, b = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const j = yy * W + xx; if (!grow[j]) continue; const k = t.core[j] ? tone[j] : lab[j]; if (k === 1) a++; else if (k === 0) b++; } lab2[i] = a > b ? 1 : 0; }
  const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) { if (!grow[i]) continue; const k = t.core[i] ? tone[i] : lab2[i], v = Math.max(0, sm[i]);
    const g = Math.round(255 * (k === 1 ? 0.22 + 0.22 * v : 0.45 + 0.35 * v)); o.set([g, g, g, 255], i * 4); }
  return { canvas: o, bleedMask: grow, revision: "v2" };
}

/** Placement: one uniform scale and one translation (s1), with the REFERENCE SHAPE = the cut's core grown by b, where b — the bleed
 *  the output actually painted — is estimated jointly: b in 0…28 px (coarse every 4, then ±2), each fitted by s1, the best IoU
 *  wins. A fixed 16 px reference would turn a wider or narrower bleed into a wrong scale (D-258's study); b only names the reference
 *  shape, the output itself is never deformed. An output without bleed is placed right (b ≈ 0) and fails the coverage check. */
export function place(out, t) {
  const m = S1.maskOf(out), shapes = new Map(), at = (b) => { if (!shapes.has(b)) { const ref = b ? WR.maskOps.dilate(t.core, b) : t.core; shapes.set(b, { b, ...S1.fit(m, ref) }); } return shapes.get(b); };
  let best = null; for (const b of [0, 4, 8, 12, 16, 20, 24, 28]) { const r = at(b); if (!best || r.iou > best.iou) best = r; }
  for (const b of [best.b - 2, best.b - 1, best.b + 1, best.b + 2]) if (b >= 0 && b <= 30) { const r = at(b); if (r.iou > best.iou) best = r; }
  return { ...best, bleedPx: best.b, reference: "the cut's core grown by the estimated bleed b (0…30 px)", tried: [...shapes.keys()].sort((x, y) => x - y), ok: best.iou >= ACCEPT.placementIou };
}

/** The canvas's grey showing through: core pixels (not ink) that are neutral grey AND within 12 levels of the canvas tone at that
 *  very pixel — the output kept the reference's grey instead of painting the design. A grey design would trip it: then it is a
 *  visual question, reported, never an automatic pass. */
export function toneLeak(fitted, t, canvas) {
  let n = 0, c = 0;
  for (let i = 0; i < N; i++) { if (!t.core[i] || fitted[i * 4 + 3] < 128 || BF.classify(fitted, i) === "ink") continue; c++;
    const r = fitted[i * 4], g = fitted[i * 4 + 1], b = fitted[i * 4 + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b), v = canvas[i * 4];
    if (mx - mn < 12 && Math.abs((r + g + b) / 3 - v) <= 12) n++; }
  return { px: n, share: +(n / Math.max(1, c)).toFixed(4), ok: n / Math.max(1, c) <= ACCEPT.toneLeak };
}

/** Drawn lines by CONTRAST, not by a colour class: an opaque pixel whose luminance is at least LINE_CONTRAST below the mean of the
 *  opaque pixels in its 7×7 neighbourhood AND at least LINE_VALLEY below both pixels 3 px away along some axis (a valley). A thin
 *  line (a brown stitch, a dark outline) is found; a broad fold shadow, a colour step between trim and body and the corner of a
 *  broad dark field are not (the dark run along the valley's axis must be at most LINE_RUN px, and the valley must hold on the
 *  horizontal or vertical axis or on both diagonals).
 *  (r1-c1's ink class saw only near-black lines and missed brown ones — D-258's study, case N6.) */
export const LINE_CONTRAST = 30, LINE_VALLEY = 15, LINE_RUN = 5;
export function lineMask(P) {
  const lum = new Float64Array(N), op = new Float64Array(N); for (let i = 0; i < N; i++) if (P[i * 4 + 3] >= 128) { op[i] = 1; lum[i] = 0.299 * P[i * 4] + 0.587 * P[i * 4 + 1] + 0.114 * P[i * 4 + 2]; }
  const I = new Float64Array((W + 1) * (H + 1)), C = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) { let rs = 0, rc = 0; for (let x = 0; x < W; x++) { const i = y * W + x; rs += lum[i]; rc += op[i]; const k = (y + 1) * (W + 1) + x + 1; I[k] = I[k - W - 1] + rs; C[k] = C[k - W - 1] + rc; } }
  const box = (A, x0, y0, x1, y1) => A[y1 * (W + 1) + x1] - A[y0 * (W + 1) + x1] - A[y1 * (W + 1) + x0] + A[y0 * (W + 1) + x0];
  const m = new Uint8Array(N); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (!op[i]) continue;
    const x0 = Math.max(0, x - 3), y0 = Math.max(0, y - 3), x1 = Math.min(W, x + 4), y1 = Math.min(H, y + 4), c = box(C, x0, y0, x1, y1); if (c < 9) continue;
    if (lum[i] > box(I, x0, y0, x1, y1) / c - LINE_CONTRAST) continue;
    // a line is darker than BOTH sides (a valley) and thin along that axis; the valley must hold on the horizontal or the vertical
    // axis, or on both diagonals — the corner of a broad dark field is a valley on one diagonal only and is no line
    const thinValley = (dx, dy) => { const xa = x - 3 * dx, ya = y - 3 * dy, xb = x + 3 * dx, yb = y + 3 * dy;
      if (xa < 0 || xb < 0 || xa >= W || xb >= W || ya < 0 || yb < 0 || ya >= H || yb >= H) return false; const a = ya * W + xa, b = yb * W + xb;
      if (!(op[a] && op[b] && lum[i] <= Math.min(lum[a], lum[b]) - LINE_VALLEY)) return false;
      let run = 1; for (const sgn of [-1, 1]) for (let k = 1; k <= LINE_RUN; k++) { const xx = x + sgn * k * dx, yy = y + sgn * k * dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) break; const j = yy * W + xx; if (!op[j] || lum[j] > lum[i] + 10) break; run++; }
      return run <= LINE_RUN; };
    if (thinValley(1, 0) || thinValley(0, 1) || (thinValley(1, 1) && thinValley(1, -1))) m[i] = 1; }
  return m;
}
/** The output's own lines along the cut's outer edge (2–10 px inside) and along the band edges (outside the cut's own line). */
export function secondOutline(fitted, t, cl, lines = lineMask(fitted)) {
  const outside = Uint8Array.from(t.core, (v) => (v ? 0 : 1)), o10 = WR.maskOps.dilate(outside, 10), o2 = WR.maskOps.dilate(outside, 2), eZone = WR.maskOps.dilate(cl.edgeLine, 4), eLine = WR.maskOps.dilate(cl.edgeLine, 1);
  let n = 0, bandPx = 0; for (let i = 0; i < N; i++) { if (cl.band[i]) bandPx++; if (!t.core[i] || !lines[i]) continue; if ((o10[i] && !o2[i]) || (eZone[i] && !eLine[i])) n++; }
  return { linePx: n, share: +(n / Math.max(1, bandPx)).toFixed(4), ok: n / Math.max(1, bandPx) <= C1.LIMITS.secondOutline, detector: "contrast" };
}
/** Free details clipped by the crop: line components (8-connected, ≥ 12 px) reaching both 6 px into the core and outside the cut. */
export function clippedDetails(fitted, t, lines = lineMask(fitted)) {
  const inner = WR.maskOps.not(WR.maskOps.dilate(Uint8Array.from(t.core, (v) => (v ? 0 : 1)), 6)), seen = new Uint8Array(N); let comps = 0, clipped = 0;
  for (let s = 0; s < N; s++) { if (seen[s] || !lines[s]) continue; const st = [s]; seen[s] = 1; let a = false, b = false, n = 0;
    while (st.length) { const i = st.pop(), x = i % W; n++; if (inner[i]) a = true; if (!t.alpha[i]) b = true;
      for (const dy of [-W, 0, W]) for (const dx of [-1, 0, 1]) { const j = i + dy + dx; if ((dx || dy) && j >= 0 && j < N && Math.abs((j % W) - x) <= 1 && !seen[j] && lines[j]) { seen[j] = 1; st.push(j); } } }
    if (n >= 12) { comps++; if (a && b) clipped++; } }
  return { components: comps, clipped, ok: clipped === 0, detector: "contrast" };
}

/** Every automatic check on an output (RGBA, the raw picture): placement, the fitted garment, coverage, holes before the lines,
 *  trim edge, second outline, clipped details, tone leak; then the r1-c1 layer. */
export function automatic(out, t, cl, bc, base) {
  const p = place(out, t), fitted = S1.apply(out, p), cov = C1.coverage(fitted, t, cl);
  let holesBefore = 0; for (let i = 0; i < N; i++) if (t.core[i] && fitted[i * 4 + 3] < 128) holesBefore++;
  const comp = C1.composeC1(fitted, t, cl, base), lm = lineMask(fitted);
  const checks = { placement: p, coverage: cov, holesBeforeLines: { px: holesBefore, underLines: comp.holesUnderLines, ok: holesBefore === 0 }, trim: C1.trimOffset(fitted, t, cl),
    secondOutline: secondOutline(fitted, t, cl, lm), clippedDetails: clippedDetails(fitted, t, lm), toneLeak: toneLeak(fitted, t, bc.canvas) };
  return { fitted, comp, checks, ok: Object.values(checks).every((c) => c.ok) };
}

function prepare() { const w = WR.buildWardrobe(), base = BC.prepareBase(w, Uint8ClampedArray.from(decodePng(IP.readC()).px)), T = BC.templatesC(w, base, { revision: "d213" }); return { w, base, T }; }
/** The cut, its construction layer and the bleed canvas, rebuilt and checked against the canvas that is sent (its pinned sha256). */
export function cutOf(env, { check = true } = {}) { const { t, src } = EV.templateOf(env, "top"), cl = C1.constructionLayer(t, env.base, PLAN.frozen.cut.name), bc = canvasV2(t, cl);
  const s = sha(encodePng(W, H, bc.canvas)); if (check && s !== CANVAS_V2.sha256) throw new Error("the rebuilt bleed canvas is not the one sent (" + s + ")"); return { t, src, cl, bc, canvasSha256: s }; }

function evaluate(id) {
  if (id !== CALL_ID) throw new Error("--call-id must be " + CALL_ID);
  const dir = join(CALLS_DIR, id), rc = join(dir, "r1c.receipt.json"), recordF = join(dir, "r1c.record.json");
  if (!existsSync(rc)) throw new Error("no receipt — nothing to evaluate"); if (existsSync(recordF)) throw new Error("already evaluated; a record is never rewritten");
  const receipt = JSON.parse(readFileSync(rc, "utf8"));
  if (receipt.verdict !== "RECEIVED_FOR_BF_CHECK") { writeFileSync(recordF, JSON.stringify({ decision: "D-258", callId: id, verdict: receipt.verdict, classification: "technically-rejected", reason: "format at receipt" }, null, 2) + "\n"); return; }
  const buf = readFileSync(join(dir, "r1c.image-1.png")); if (sha(buf) !== receipt.image.sha256) throw new Error("the stored picture is not the one received");
  const t0 = Date.now(), env = prepare(), { t, src, cl, bc } = cutOf(env), out = Uint8ClampedArray.from(decodePng(buf).px), a = automatic(out, t, cl, bc, env.base);
  const fit = R1.checkItem(env.w, env.base, env.T, t, a.comp.layers), item = { category: "top", layers: a.comp.layers, covering: t.covering, shadow: t.shadow };
  const memo = new Map(), itemOf = (pid) => { if (memo.has(pid)) return memo.get(pid); const it = inputs("all").find((x) => x.id === pid), b = readFileSync(join(ART, ...it.raw.split("/"))); if (sha(b) !== it.rawSha256) throw new Error(pid + ": raw not pinned");
    const r0 = IP.processItem(env.w, env.base, env.T, it.category, Uint8ClampedArray.from(decodePng(b).px), { itemId: pid }); const v = { category: it.category, layers: r0.layers, covering: r0.covering || "none" }; memo.set(pid, v); return v; };
  const outfits = {}; if (a.comp.ok) for (const bo of PARTNERS.bottom) for (const sh of PARTNERS.shoes) { const n = R1.checkOutfit(env.w, env.base, [item, itemOf(bo), itemOf(sh)]), o = R1.checkOutfit(env.w, env.base, [src, itemOf(bo), itemOf(sh)]);
    outfits[bo + "+" + sh] = { r1c: { ok: n.ok, failed: n.failed }, template: { ok: o.ok, failed: o.failed }, same: n.ok === o.ok && n.failed.join() === o.failed.join() }; }
  // sheets: raw output | fitted (uncropped) | map (holes red, outside the cut orange, the cut's band edges black, the output's own ink near edges magenta) | construction lines | on C | the cut's own item on C
  const OD = join(dir, "review"); mkdirSync(OD, { recursive: true }); const bg = [236, 233, 226], FIGB = [250, 0, 774, 1536], half = (P) => down(flat(P, bg), 262, 768, FIGB);
  const checker = (P) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0, c = ((x >> 3) + (y >> 3)) % 2 ? 205 : 245, al = P[i * 4 + 3] / 255; for (let k = 0; k < 3; k++) o[i * 4 + k] = Math.round(P[i * 4 + k] * al + c * (1 - al)); o[i * 4 + 3] = 255; } return o; };
  const f = a.fitted, mk = new Uint8ClampedArray(flat(checker(f), bg)), near = WR.maskOps.dilate(Uint8Array.from(t.core, (v) => (v ? 0 : 1)), 10);
  for (let i = 0; i < N; i++) { if (t.core[i] && f[i * 4 + 3] < 128) mk.set([230, 0, 0, 255], i * 4); else if (!t.alpha[i] && f[i * 4 + 3] >= 128) for (let k = 0; k < 3; k++) mk[i * 4 + k] = Math.round(mk[i * 4 + k] * 0.5 + [255, 140, 0][k] * 0.5);
    if (cl.edgeLine[i]) mk.set([0, 0, 0, 255], i * 4); if (t.core[i] && near[i] && f[i * 4 + 3] >= 128 && BF.classify(f, i) === "ink" && !cl.lines[i * 4 + 3]) mk.set([210, 0, 210, 255], i * 4); }
  const min = BF.minimumItems(env.base.R, env.base.sep.lab), dressed = (layers) => BF.layerProof(env.w, env.base.R, env.base.Z, { ...min, ...layers }, { sep: env.base.sep, headSeam: "d201", enclosure: "c-exterior" }).dressedRuntime;
  const onC = dressed(a.comp.layers), tplOnC = dressed(src.layers), uncropped = (() => { const o = new Uint8ClampedArray(dressed({})); for (let i = 0; i < N; i++) { const al = f[i * 4 + 3] / 255; if (al) for (let k = 0; k < 3; k++) o[i * 4 + k] = Math.round(f[i * 4 + k] * al + o[i * 4 + k] * (1 - al)); } return o; })();
  const g1 = grid([half(checker(out)), half(checker(f)), half(mk), half(checker(cl.lines)), half(uncropped), half(onC), half(tplOnC)], 7, 10); writeFileSync(join(OD, "r1c-sheet.png"), encodePng(g1.w, g1.h, g1.px));
  const boxes = { neck: [400, 440, 624, 540], "armpit left": [360, 580, 470, 690], "armpit right": [554, 580, 664, 690], "cuff left": [300, 560, 420, 680], "cuff right": [604, 560, 724, 680], pocket: [420, 520, 604, 680], hem: [380, 760, 644, 860] };
  const rows = []; for (const b of Object.values(boxes)) rows.push(crop(flat(uncropped, bg), b, 3), crop(flat(mk, bg), b, 3), crop(flat(onC, bg), b, 3), crop(flat(tplOnC, bg), b, 3));
  const g2 = grid(rows, 4, 8); writeFileSync(join(OD, "r1c-closeups-x3.png"), encodePng(g2.w, g2.h, g2.px));
  const g3 = grid([down(flat(onC, bg), 110, 165), down(flat(tplOnC, bg), 110, 165), down(flat(onC, bg), 52, 78), down(flat(tplOnC, bg), 52, 78)], 4, 8); writeFileSync(join(OD, "r1c-app.png"), encodePng(g3.w, g3.h, g3.px));
  const vals = Object.values(outfits), technicallyRejected = !a.checks.placement.ok || !a.checks.coverage.ok || !a.checks.holesBeforeLines.ok || !fit.ok;
  const record = { decision: "D-258", callId: id, imageSha256: receipt.image.sha256, method: C1.REVISION, similarity: S1.REVISION, production: IP.METHOD,
    automatic: { ...a.checks, fit: { ok: fit.ok, failed: fit.failed }, outfitsSameAsTemplate: vals.filter((v) => v.same).length + "/" + vals.length, outfits },
    automaticPassed: a.ok && fit.ok && vals.every((v) => v.same),
    visual: Object.fromEntries(VISUAL.map((k) => [k, "PENDING — the assistant's review; never an automatic pass"])),
    classification: technicallyRejected ? "technically-rejected" : "pending-visual-review",
    note: "one result can support or weaken the r1-c1 hypothesis; it cannot prove automation at scale", ms: Date.now() - t0, rssMB: Math.round(process.memoryUsage().rss / 1048576) };
  writeFileSync(recordF, JSON.stringify(record, null, 2) + "\n");
  console.log(id, "placement", record.automatic.placement.iou, "coverage", record.automatic.coverage.share, "holes", record.automatic.holesBeforeLines.px, "trim", record.automatic.trim.ok, "outline", record.automatic.secondOutline.ok, "clipped", record.automatic.clippedDetails.clipped, "leak", record.automatic.toneLeak.share, "fit", fit.ok, "→", record.classification);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2); try { if (a[0] === "--call-id" && a[1]) evaluate(a[1]); else throw new Error("usage: --call-id " + CALL_ID); } catch (e) { console.error("REFUSED: " + e.message); process.exit(1); }
}
