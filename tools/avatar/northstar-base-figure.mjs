// NORTHSTAR BASE FIGURE (D-198) — the target, the provenance and the ACCEPTANCE CHECK for ONE shared Northstar-style base figure
// in neutral, close-fitting base clothing, with continuous arms, legs and feet, so short and open clothing becomes possible.
//
// D-197 showed the fitting system on a CLOTHED base (Northstar's own tee, jeans and sneakers as default items); that base cannot
// carry sleeveless tops, shorts, skirts or sandals. D-198 prepares the base those forms need. NO base figure exists yet and no
// image call is made here: this tool measures zones on Northstar v2, draws the expected provenance map, and checks a FUTURE
// candidate (BF1–BF15) after a separately authorised call. The head is never taken from the candidate: the existing R3 head
// stack is recomposed over the candidate's body with the D-194 seam rule. Registration is an integer shift ≤ 6 px or a
// rejection — never a warp — and nothing is painted or retouched to pass a gate. H1 is never read. D-127 §2 keeps any generated
// base figure outside both clones; this tool never writes one into the repository.
// Usage: node tools/avatar/northstar-base-figure.mjs --out <empty dir>            (review material from Northstar v2 only)
//        node tools/avatar/northstar-base-figure.mjs --check <candidate.png>       (a future candidate, read-only)
//        node tools/avatar/northstar-base-figure.mjs --diagnose <candidate.png> --out <empty dir OUTSIDE both clones>
//             (D-201: localized pixel maps for BF4, BF5/BF15, BF9 and BF14, the neck seam before/after the fix, the proposed
//              BF revisions — measurements and proposals only; nothing is re-classified)
//        node tools/avatar/northstar-base-figure.mjs --review <candidate.png> --out <empty dir OUTSIDE both clones>
//             (D-199: BF1–BF15 plus the review images of a generated candidate; refuses any directory inside the repository,
//              because a figure in close-fitting base clothing is never tracked or published — D-127 §2)
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng, decodePng } from "./r3-hair-tool-v2.mjs";
import * as NL from "./r3-northstar-layers.mjs";
import * as FG from "./r3-northstar-figure.mjs";
import * as WR from "./northstar-wardrobe.mjs";
import { recolour, flat, crop, down, grid } from "./northstar-wardrobe-poc.mjs";
import { cleanAlpha } from "./clean-r2-hair-alpha.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DECISION = "D-198";
export const FILES = Object.freeze({
  spec: "tools/avatar/fixtures/northstar-wardrobe/base-figure-spec-v1.json",
  prompt: "tools/avatar/fixtures/northstar-wardrobe/base-figure-prompt-v1.txt",
  contract: "tools/avatar/fixtures/northstar-wardrobe/contract-v2.json",
  pilot: "tools/avatar/fixtures/northstar-wardrobe/pilot-plan-v2.json",
});
const rd = (f) => readFileSync(join(REPO, ...f.split("/")));
export const loadSpec = () => JSON.parse(rd(FILES.spec).toString("utf8"));
export const loadContractV2 = () => JSON.parse(rd(FILES.contract).toString("utf8"));
export const loadPilot = () => JSON.parse(rd(FILES.pilot).toString("utf8"));
export const promptBytes = () => rd(FILES.prompt);
const { W, H, N } = WR, Mo = WR.maskOps, sha = (b) => createHash("sha256").update(b).digest("hex");
const count = (m) => { let n = 0; for (let i = 0; i < N; i++) if (m[i]) n++; return n; };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const median = (a) => (a.length ? Float64Array.from(a).sort()[a.length >> 1] : NaN);

/** Pixel class of a candidate: null (transparent), ink, skin — and every other opaque colour is garment. */
export function classify(P, i) { if (P[i * 4 + 3] < 128) return null; const c = WR.colourClass(P[i * 4], P[i * 4 + 1], P[i * 4 + 2]); return c === "ink" || c === "skin" ? c : "garment"; }
/** Garment pixels that form LARGE connected components (≥ minComponentPx, D-197's rule): isolated shading speckles on painted
 *  skin are not clothing. */
export function garmentMask(P, minPx = 400) {
  const g = new Uint8Array(N), seen = new Uint8Array(N), o = new Uint8Array(N); for (let i = 0; i < N; i++) if (classify(P, i) === "garment") g[i] = 1;
  for (let s = 0; s < N; s++) { if (!g[s] || seen[s]) continue; const comp = [s], st = [s]; seen[s] = 1;
    while (st.length) { const i = st.pop(), x = i % W; for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < N && g[j] && !seen[j] && Math.abs((j % W) - x) <= 1) { seen[j] = 1; st.push(j); comp.push(j); } }
    if (comp.length >= minPx) for (const i of comp) o[i] = 1; }
  return o;
}
const medianRgb = (P, m, want) => { const r = [], g = [], b = []; for (let i = 0; i < N; i++) if (m[i] && classify(P, i) === want) { r.push(P[i * 4]); g.push(P[i * 4 + 1]); b.push(P[i * 4 + 2]); } return r.length ? [median(r), median(g), median(b)] : null; };

/** Northstar's own skin: the median of the visible forearms' opaque skin. */
export function skinReference(w) { return medianRgb(w.base.layers.arms, Mo.toMask(w.base.layers.arms, 250), "skin"); }

/** The zones every gate uses, measured on Northstar v2 (no typed coordinates beyond the spec's targets). */
export function zones(w, spec = loadSpec()) {
  const A = w.anchors, L = w.base.layers, z = spec.zones, t = spec.targets, cx = Math.round(A.centreX);
  const tee = Mo.toMask(L["top-body"], 250), pants = Mo.toMask(L.pants, 1);
  // the base garments' MINIMUM regions: chest band to the natural waist inside the torso; natural waist to below the crotch
  const topCore = Mo.and(Mo.rect(A.torsoX[0] + z.torsoInsetPx, A.shoulder.y + z.chestBelowShoulderPx, A.torsoX[1] - z.torsoInsetPx, t.waistY + z.coreOverlapPx), tee);
  // the tee hides the jeans' waistband, so rows above the first full jeans row at the centre take that row's span, kept inside
  // Northstar's clothes (tee or jeans)
  let refY = A.waistbandY; while (refY < A.crotchY && !pants[refY * W + cx]) refY++;
  const clothes = Mo.or(pants, Mo.toMask(L["top-body"], 1)), hipCore = new Uint8Array(N);
  for (let y = t.waistY - z.coreOverlapPx; y <= A.crotchY + z.hipBelowCrotchPx; y++) { const yy = Math.max(y, refY); let run = -1;
    for (let x = 0; x <= W; x++) { const on = x < W && pants[yy * W + x]; if (on && run < 0) run = x; if (!on && run >= 0) { for (let k = run + z.hipInsetPx; k < x - z.hipInsetPx; k++) if (clothes[y * W + k]) hipCore[y * W + k] = 1; run = -1; } } }
  // limb zones: where Northstar's clothing now covers a limb the base must show
  const armZone = Mo.and(Mo.toMask(L["top-sleeves"], 1), Mo.rect(0, A.shoulder.y + z.armTopBelowShoulderPx, W, Math.max(A.sleeveEndY.left, A.sleeveEndY.right)));
  const legTop = t.baseShortsHemY[1] + z.legTopBelowShortsHemPx, legZone = Mo.and(pants, Mo.rect(0, legTop, W, Math.min(A.shoeTopY.left, A.shoeTopY.right) - 1));
  const footZone = Mo.toMask(L.shoes, 1);
  const bodySil = Mo.toMask(w.fg.master, 1), envelope = Mo.dilate(bodySil, z.envelopePx);
  const pantsGuard = Mo.dilate(pants, 2), hands = Mo.toMask(L.hands, 1), handRegion = {};
  for (const side of ["left", "right"]) { let x0 = W, x1 = 0, y0 = H, y1 = 0; for (let i = 0; i < N; i++) if (hands[i] && ((i % W) < cx) === (side === "left")) { const x = i % W, y = (i / W) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    handRegion[side] = Mo.and(Mo.rect(x0 - 10, y0 - 10, x1 + 10, y1 + 10), Mo.not(pantsGuard)); }
  return { cx, topCore, hipCore, armZone, legZone, legTop, footZone, bodySil, envelope, hands, handRegion, skinRef: skinReference(w) };
}

/** Integer translation with a transparent fill (registration never resamples). */
export function shift(P, dx, dy) { const o = new Uint8ClampedArray(N * 4); for (let y = Math.max(0, dy); y < Math.min(H, H + dy); y++) for (let x = Math.max(0, dx); x < Math.min(W, W + dx); x++) { const j = ((y - dy) * W + (x - dx)) * 4; o.set(P.subarray(j, j + 4), (y * W + x) * 4); } return o; }

/** BF2 — register the candidate on Northstar's head silhouette (head + hair above the neck seam): the best integer shift
 *  within ±maxShift by IoU. The candidate's head is only used to find the shift; it is replaced by the R3 head stack. */
export function register(cand, master, spec = loadSpec()) {
  const seam = spec.head.neckSeamY, ms = spec.gates.maxShiftPx, ref = [];
  for (let i = 0; i < seam * W; i++) if (master[i * 4 + 3] >= 128) ref.push(i);
  const cm = new Uint8Array(N); for (let i = 0; i < N; i++) if (cand[i * 4 + 3] >= 128) cm[i] = 1;
  const rowCount = new Int32Array(H); for (let i = 0; i < N; i++) if (cm[i]) rowCount[(i / W) | 0]++;
  let best = { dx: 0, dy: 0, iou: -1 };
  for (let dy = -ms; dy <= ms; dy++) for (let dx = -ms; dx <= ms; dx++) {
    let inter = 0; for (const i of ref) { const x = (i % W) - dx, y = ((i / W) | 0) - dy; if (x >= 0 && x < W && y >= 0 && y < H && cm[y * W + x]) inter++; }
    let cn = 0; for (let y = Math.max(0, -dy); y < Math.min(H, seam - dy); y++) cn += rowCount[y];
    const iou = inter / (ref.length + cn - inter); if (iou > best.iou) best = { dx, dy, iou };
  }
  return { ...best, iou: +best.iou.toFixed(4), ok: best.iou >= spec.gates.minHeadIoU };
}

/** Recompose: the existing R3 head stack over the candidate's body, with D-194's seam rule (FG.bodyLayer). No painting. */
/** D-201 — the seam rule for a GENERATED body. Below the neck seam the R3 head stack still carries the BOTTOM EDGE of
 *  Northstar's neck: antialiased pixels that once blended skin into the t-shirt collar, so their colour is pale at low alpha.
 *  Over Northstar's own body they are invisible (the collar is there); over a generated body whose neck continues they draw a
 *  pale dotted line across the neck (D-200 §4) — with D-194's un-mixing AND with a plain composite, measured in D-201. The rule:
 *  below the seam, wherever the bald head is only an antialiased edge (0 < alpha < opaque), no hair is drawn there, and the
 *  candidate is opaque, the candidate's own pixel is the figure — the head's leftover collar edge is not composited over a
 *  continuous neck. Everywhere else the head stack lies over the body exactly as before. The body layer itself is the
 *  candidate's pixels below the seam where the head is absent, plus that collar edge; under the rest of the head (its opaque
 *  skin and its antialiased jaw, ear and hair edges) it is empty — no second contour under the head, as in D-194. Nothing is
 *  painted. */
export function generatedBodyLayer(cand, bald, b, edge) {
  const body = new Uint8ClampedArray(N * 4);
  for (let y = b.seamY; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x, j = i * 4; if (bald[j + 3] > 0 && !edge[i]) continue; body.set(cand.subarray(j, j + 4), j); }
  return { body };
}
/** The head's leftover COLLAR EDGE below the seam, where a generated neck must win: (a) the bald head's antialiased pixels
 *  (0 < alpha < opaque) and (b) a band of `k` px of nearly opaque head pixels directly above the head's lower boundary — the
 *  D-188 split keeps the head's skin at alpha 254, and the last rows there carry Northstar's skin-to-collar blend baked into
 *  their colour (e.g. 251,206,136 against the neck's 254,195,127). Only where no hair lies over the skin (head = bald). */
export function neckEdgeMask(w, k = 3) {
  const b = FG.loadSpec().body, m = new Uint8Array(N), bald = w.fg.bald, head = w.head;
  const noHair = (i) => Math.abs(head[i * 4 + 3] - bald[i * 4 + 3]) <= 2 && [0, 1, 2].every((c) => Math.abs(head[i * 4 + c] - bald[i * 4 + c]) <= 2);
  for (let y = b.seamY; y < H; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x, ha = bald[i * 4 + 3]; if (!ha || !noHair(i)) continue;
    if (ha < b.opaqueHeadAlpha) { m[i] = 1; continue; }
    if (y < b.seamY + 10) continue;
    let edge = false; for (let dy = 1; dy <= k && !edge && y + dy < H; dy++) for (let dx = -1; dx <= 1; dx++) if (bald[((y + dy) * W + x + dx) * 4 + 3] === 0) { edge = true; break; }
    if (edge) m[i] = 1; }
  return m;
}
export const SEAM_RULES = Object.freeze({ generated: "D-201 generated-body seam (the candidate owns its neck below the seam; the head's leftover collar edge is not composited over it)", d194: "D-194 FG.bodyLayer (un-mixing; exact for Northstar only)" });
export function recompose(w, registered, seam = "generated") {
  const b = FG.loadSpec().body;
  if (seam === "d194") { const { body } = FG.bodyLayer(registered, w.fg.bald, b); return { body, figure: NL.overStack([body, w.head]) }; }
  const edge = neckEdgeMask(w), { body } = generatedBodyLayer(registered, w.fg.bald, b, edge), figure = NL.overStack([body, w.head]);
  for (let i = 0; i < N; i++) if (edge[i] && registered[i * 4 + 3] >= 250) figure.set(registered.subarray(i * 4, i * 4 + 4), i * 4);
  return { body, figure };
}
/** The neck line, measured: pixels of the head's leftover neck edge where the candidate is opaque and the composed figure
 *  departs from the candidate by more than `tol` in any channel — paint that neither the candidate's neck nor a clean seam has. */
export function neckLine(w, registered, figure, tol = 12) {
  const edge = neckEdgeMask(w); let n = 0, max = 0;
  for (let i = 0; i < N; i++) { if (!edge[i] || registered[i * 4 + 3] < 250) continue; let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(figure[i * 4 + c] - registered[i * 4 + c])); if (d > tol) { n++; max = Math.max(max, d); } }
  return { linePx: n, maxDeviation: max };
}

const outlineShare = (P, y0) => { let edge = 0, dark = 0; for (let i = Math.max(W, y0 * W); i < N - W; i++) { if (P[i * 4 + 3] < 200) continue; if ([i - 1, i + 1, i - W, i + W].some((j) => P[j * 4 + 3] < 64)) { edge++; if (Math.max(P[i * 4], P[i * 4 + 1], P[i * 4 + 2]) < 110) dark++; } } return edge ? dark / edge : 0; };
const sideOf = (x, cx, side) => (x < cx) === (side === "left");
/** Per row: alpha ≥ 128 width and skin count in an x-range. */
const rowStats = (P, y, xa, xb) => { let wd = 0, skin = 0, ink = 0; for (let x = xa; x < xb; x++) { const i = y * W + x, c = classify(P, i); if (c) { wd++; if (c === "skin") skin++; if (c === "ink") ink++; } } return { wd, skin, inkShare: wd ? ink / wd : 0 }; };
const maxStep = (ws) => { let m = 0; for (let k = 1; k < ws.length; k++) m = Math.max(m, Math.abs(ws[k] - ws[k - 1])); return m; };
/** A limb's row profile in rows y0..y1 and columns xa..xb-1: rows without skin, rows narrower than minWidth, the largest width
 *  step between rows and the largest share of ink ACROSS one row. Bare painted skin keeps its ink at the two edges (Northstar's
 *  visible arms: ≤ 0.15); a hem line running across a limb pushes the share above 0.2 (Northstar's sleeve hem: 0.21–0.31). */
export function limbProfile(P, y0, y1, xa, xb, minWidth = 0) {
  const ws = []; let missing = 0, narrow = 0, ink = 0;
  for (let y = y0; y <= y1; y++) { const s = rowStats(P, y, xa, xb); ws.push(s.wd); if (!s.skin) missing++; if (s.wd < minWidth) narrow++; ink = Math.max(ink, s.inkShare); }
  return { rowsWithoutSkin: missing, rowsNarrowerThanMin: narrow, maxWidthStepPx: maxStep(ws), maxInkRowShare: +ink.toFixed(3) };
}
const garmentShare = (G, m) => { let n = 0, g = 0; for (let i = 0; i < N; i++) if (m[i]) { n++; if (G[i]) g++; } return n ? g / n : 0; };
/** Walk down a column while the pixel is ink or a garment close to `rgb`; the last garment row is the hem. */
/** The base garments as labelled pixels: the garment components reached from the two minimum regions, each pixel assigned to
 *  the nearer of the two median colours (the top and the shorts may touch at the waist). */
export function baseGarments(P, G, Z, topRgb, hipRgb) {
  const seeds = []; for (let i = 0; i < N; i++) if (G[i] && (Z.topCore[i] || Z.hipCore[i])) seeds.push([i % W, (i / W) | 0]);
  const m = NL.flood(seeds, (i) => G[i] === 1), lab = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (m[i]) { const c = [P[i * 4], P[i * 4 + 1], P[i * 4 + 2]]; lab[i] = !hipRgb || (topRgb && dist(c, topRgb) <= dist(c, hipRgb)) ? 1 : 2; }
  return lab;
}
/** The hem: the lowest row in column x that carries garment `k` (1 top, 2 shorts), ignoring rows above y0. */
const hemAt = (lab, x, y0, k) => { let hem = -1; for (let y = y0; y < H; y++) if (lab[y * W + x] === k) hem = y; return hem; };

/** BF1–BF15 on a candidate base figure (full 1024×1536 RGBA, transparent background). Returns { registration, checks, ok }. */
export function checkBaseFigure(w, cand, Z = zones(w), spec = loadSpec(), seam = "generated") {
  const g = spec.gates, t = spec.targets, A = w.anchors, L = w.base.layers, master = w.fg.master, out = [], add = (id, ok, value, what) => out.push({ id, ok, value, what });
  // BF1 format and a transparent background
  let border = 0, bt = 0; for (let x = 0; x < W; x++) for (const y of [0, H - 1]) { border++; if (cand.length === N * 4 && cand[(y * W + x) * 4 + 3] === 0) bt++; }
  for (let y = 0; y < H; y++) for (const x of [0, W - 1]) { border++; if (cand.length === N * 4 && cand[(y * W + x) * 4 + 3] === 0) bt++; }
  add("BF1-FORMAT", cand.length === N * 4 && bt / border >= g.borderTransparentShare, { borderTransparentShare: +(bt / border).toFixed(4) }, "1024×1536 RGBA with a transparent background");
  if (cand.length !== N * 4) return { registration: null, checks: out, ok: false };
  const reg = register(cand, master, spec);
  add("BF2-REGISTRATION", reg.ok, reg, "the head silhouette registers on Northstar within an integer shift of ±" + g.maxShiftPx + " px (IoU ≥ " + g.minHeadIoU + "); otherwise rejected, never warped");
  if (!reg.ok) return { registration: reg, checks: out, ok: false };
  const R = shift(cand, reg.dx, reg.dy), { body, figure } = recompose(w, R, seam), G = garmentMask(R);
  // BF3 the neck join: the candidate's neck edges under the seam meet Northstar's
  let neck = 0; for (let y = spec.head.neckSeamY + 1; y <= spec.head.neckSeamY + 15; y++) { const e = (P) => { let a = -1, b = -1; for (let x = 440; x < 585; x++) if (P[(y * W + x) * 4 + 3] >= 128) { if (a < 0) a = x; b = x; } return [a, b]; }; const [a, b] = e(R), [c, d] = e(master); neck = Math.max(neck, a < 0 ? 99 : Math.abs(a - c), b < 0 ? 99 : Math.abs(b - d)); }
  add("BF3-NECK-JOIN", neck <= g.maxNeckEdgeDeltaPx, { maxEdgeDeltaPx: neck }, "the neck below the seam meets the R3 head's neck within " + g.maxNeckEdgeDeltaPx + " px");
  // BF4 pose: centre axis, ground line per foot, hands
  const centre = (P) => { let s = 0, n = 0; for (let y = 600; y <= 780; y += 4) { let a = Z.cx, b = Z.cx; if (P[(y * W + Z.cx) * 4 + 3] < 128) continue; while (a > 0 && P[(y * W + a - 1) * 4 + 3] >= 128) a--; while (b < W - 1 && P[(y * W + b + 1) * 4 + 3] >= 128) b++; s += (a + b) / 2; n++; } return n ? s / n : NaN; };
  const ground = (P, side) => { let yb = -1; for (let y = 1300; y < H; y++) for (let x = 0; x < W; x++) if (sideOf(x, Z.cx, side) && P[(y * W + x) * 4 + 3] >= 128) { yb = y; break; } return yb; };
  const handIoU = (side) => { let i1 = 0, u = 0; for (let i = 0; i < N; i++) { if (!Z.handRegion[side][i]) continue; const a = R[i * 4 + 3] >= 128, b = master[i * 4 + 3] >= 128; if (a && b) i1++; if (a || b) u++; } return u ? i1 / u : 0; };
  const pose = { centreX: +centre(R).toFixed(1), northstarCentreX: +centre(master).toFixed(1), groundY: { left: ground(R, "left"), right: ground(R, "right") }, handIoU: { left: +handIoU("left").toFixed(4), right: +handIoU("right").toFixed(4) } };
  add("BF4-POSE", Math.abs(pose.centreX - pose.northstarCentreX) <= g.centreTolPx && ["left", "right"].every((s) => Math.abs(pose.groundY[s] - A.groundY) <= g.groundTolPx && pose.handIoU[s] >= g.minHandIoU), pose, "Northstar's centre axis (±" + g.centreTolPx + "), ground line (±" + g.groundTolPx + " per foot) and hands (IoU ≥ " + g.minHandIoU + ", the D-131 bound)");
  // BF5 nothing outside Northstar's silhouette + envelope (bare limbs are slimmer than the clothes, never wider)
  let outside = 0; for (let i = (spec.head.neckSeamY + 1) * W; i < N; i++) if (R[i * 4 + 3] >= 128 && !Z.envelope[i]) outside++;
  add("BF5-ENVELOPE", outside <= g.maxOutsideEnvelopePx, { outsidePx: outside }, "the body stays inside Northstar's silhouette + " + spec.zones.envelopePx + " px");
  // BF6 arms: no garment over the upper arms, skin in every row from below the shoulders to the wrist, a smooth silhouette
  const arms = {}; for (const side of ["left", "right"]) { const xa = side === "left" ? 0 : A.torsoX[1] + 1, xb = side === "left" ? A.torsoX[0] : W;
    const { rowsWithoutSkin, maxWidthStepPx, maxInkRowShare } = limbProfile(R, A.shoulder.y + spec.zones.armTopBelowShoulderPx, A.wristY[side], xa, xb);
    arms[side] = { garmentShare: +garmentShare(G, Mo.and(Z.armZone, Mo.rect(xa, 0, xb - 1, H))).toFixed(4), rowsWithoutSkin, maxWidthStepPx, maxInkRowShare }; }
  add("BF6-ARMS", ["left", "right"].every((s) => arms[s].garmentShare <= g.maxGarmentShareInLimbZone && arms[s].rowsWithoutSkin === 0 && arms[s].maxWidthStepPx <= g.maxLimbWidthStepPx && arms[s].maxInkRowShare <= g.maxInkRowShare), arms, "bare, continuous arms: no garment over the upper arms, skin in every row to the wrist, no width step > " + g.maxLimbWidthStepPx + " px, and no outline running ACROSS the arm (a sleeve merely painted in skin colour keeps its hem line)");
  // BF7 legs and BF8 feet
  const legs = {}; for (const side of ["left", "right"]) {
    const p = limbProfile(R, Z.legTop, Math.min(A.shoeTopY.left, A.shoeTopY.right) - 1, side === "left" ? 0 : Z.cx, side === "left" ? Z.cx : W, g.minLegWidthPx);
    legs[side] = { garmentShare: +garmentShare(G, Mo.and(Z.legZone, Mo.rect(side === "left" ? 0 : Z.cx, 0, side === "left" ? Z.cx - 1 : W - 1, H))).toFixed(4), ...p }; }
  add("BF7-LEGS", ["left", "right"].every((s) => legs[s].garmentShare <= g.maxGarmentShareInLimbZone && !legs[s].rowsWithoutSkin && !legs[s].rowsNarrowerThanMin && legs[s].maxWidthStepPx <= g.maxLimbWidthStepPx && legs[s].maxInkRowShare <= g.maxInkRowShare), legs, "bare, continuous legs from mid-thigh to the ankle, with no outline running across a leg");
  const feet = {}; for (const side of ["left", "right"]) { let skin = 0; for (let y = A.groundY - 30; y <= A.groundY - 5; y++) skin += rowStats(R, y, side === "left" ? 0 : Z.cx, side === "left" ? Z.cx : W).skin;
    feet[side] = { garmentShare: +garmentShare(G, Mo.and(Z.footZone, Mo.rect(side === "left" ? 0 : Z.cx, 0, side === "left" ? Z.cx - 1 : W - 1, H))).toFixed(4), skinPxNearGround: skin }; }
  add("BF8-FEET", ["left", "right"].every((s) => feet[s].garmentShare <= g.maxGarmentShareInLimbZone && feet[s].skinPxNearGround > 0), feet, "bare feet: no shoe or sock, skin down to the ground line");
  // BF9 base top and BF10 base shorts: cover their minimum regions opaquely, distinct colours, hems in range
  const cover = (m) => { let n = 0, ok = 0; for (let i = 0; i < N; i++) if (m[i]) { n++; if (R[i * 4 + 3] >= 250 && classify(R, i) !== "skin") ok++; } return n ? ok / n : 0; };
  const topRgb = medianRgb(R, Z.topCore, "garment"), hipRgb = medianRgb(R, Z.hipCore, "garment");
  const BG = baseGarments(R, G, Z, topRgb, hipRgb), topHem = topRgb ? hemAt(BG, Z.cx, A.shoulder.y, 1) : -1;
  const top = { coverage: +cover(Z.topCore).toFixed(4), rgb: topRgb, skinDistance: topRgb && Z.skinRef ? +dist(topRgb, Z.skinRef).toFixed(1) : null, hemY: topHem };
  add("BF9-BASE-TOP", top.coverage >= g.minCoreCoverage && top.skinDistance >= g.minGarmentSkinDistance && topHem >= t.baseTopHemY[0] && topHem <= t.baseTopHemY[1], top, "the base top covers the chest band to the natural waist, opaque, clearly not skin-coloured, hem at y " + t.baseTopHemY.join("–"));
  const legMid = (side) => { let a = -1, b = -1; for (let x = side === "left" ? 0 : Z.cx; x < (side === "left" ? Z.cx : W); x++) if (L.pants[((A.crotchY + 30) * W + x) * 4 + 3] >= 128) { if (a < 0) a = x; b = x; } return Math.round((a + b) / 2); };
  const shortsHem = hipRgb ? { left: hemAt(BG, legMid("left"), A.crotchY, 2), right: hemAt(BG, legMid("right"), A.crotchY, 2) } : { left: -1, right: -1 };
  const hip = { coverage: +cover(Z.hipCore).toFixed(4), rgb: hipRgb, skinDistance: hipRgb && Z.skinRef ? +dist(hipRgb, Z.skinRef).toFixed(1) : null, topDistance: hipRgb && topRgb ? +dist(hipRgb, topRgb).toFixed(1) : null, hemY: shortsHem };
  add("BF10-BASE-SHORTS", hip.coverage >= g.minCoreCoverage && hip.skinDistance >= g.minGarmentSkinDistance && hip.topDistance >= g.minGarmentGarmentDistance && ["left", "right"].every((s) => shortsHem[s] >= t.baseShortsHemY[0] && shortsHem[s] <= t.baseShortsHemY[1]), hip, "the base shorts cover the natural waist to below the crotch, opaque, distinct from skin and from the top, hem at mid-thigh (y " + t.baseShortsHemY.join("–") + ")");
  // BF11 the reconstructed skin is Northstar's skin tone
  const recon = Mo.or(Z.armZone, Z.legZone, Z.footZone), skinRgb = medianRgb(R, recon, "skin"), tone = skinRgb && Z.skinRef ? dist(skinRgb, Z.skinRef) : Infinity;
  add("BF11-SKIN-TONE", tone <= g.maxSkinToneDistance, { reconstructedSkinRgb: skinRgb, northstarSkinRgb: Z.skinRef, distance: Number.isFinite(tone) ? +tone.toFixed(1) : null }, "the reconstructed skin matches Northstar's visible skin (RGB distance ≤ " + g.maxSkinToneDistance + ")");
  // BF12–BF14 the painted quality on the body (D-197's I5–I7 measures)
  const os = outlineShare(body, spec.head.neckSeamY + 1), sh = WR.sharpness(body); let haze = 0, px = 0; for (let i = 0; i < N; i++) if (body[i * 4 + 3]) { px++; if (body[i * 4 + 3] < 128) haze++; }
  add("BF12-OUTLINE", os >= g.minOutlineShare, { darkShare: +os.toFixed(3) }, "the silhouette carries Northstar's dark painted contour");
  add("BF13-SHARPNESS", sh >= g.minSharpness, { lapToGrad: +sh.toFixed(3) }, "crisp painted detail, not a soft upscale (D-197's contrast-independent ratio)");
  add("BF14-ALPHA", haze <= g.maxHazeShare * px, { share: +(haze / Math.max(1, px)).toFixed(4) }, "a clean cut-out: semi-transparency only as a thin rim");
  // BF15 dress-back: D-197's three default items over the new body hide every base-garment pixel and give Northstar's silhouette
  const dressed = NL.overStack([body, L.shoes, L.pants, L["top-body"], L["top-sleeves"]]), cov = NL.overStack([L.shoes, L.pants, L["top-body"], L["top-sleeves"]]);
  const GB = garmentMask(body), seeds = []; for (let i = 0; i < N; i++) if (GB[i] && (Z.topCore[i] || Z.hipCore[i])) seeds.push([i % W, (i / W) | 0]);
  const baseG = NL.flood(seeds, (i) => GB[i] === 1);
  let visibleBase = 0, inter = 0, uni = 0; for (let i = 0; i < N; i++) { if (baseG[i] && cov[i * 4 + 3] < 128) visibleBase++; const a = dressed[i * 4 + 3] >= 128, b = w.body[i * 4 + 3] >= 128; if (a && b) inter++; if (a || b) uni++; }
  add("BF15-DRESS-BACK", visibleBase <= g.maxDressBackVisibleBasePx && inter / uni >= g.minDressBackIoU, { visibleBaseGarmentPx: visibleBase, silhouetteIoU: +(inter / uni).toFixed(4) }, "dressed in D-197's tee, jeans and sneakers the base shows no base garment and Northstar's silhouette");
  return { registration: reg, checks: out, ok: out.every((x) => x.ok), registered: R, body, figure };
}

/** POSITIVE CONTROL for the limb gates: Northstar's own VISIBLE bare arms (below the short sleeves, to the wrists) pass the same
 *  row profile a reconstructed limb must pass. No base figure exists, so this is the only bare limb the gates can be shown on. */
export function visibleSkinControl(w, spec = loadSpec()) {
  const A = w.anchors, M = w.fg.master, g = spec.gates, out = {};
  for (const side of ["left", "right"]) { let y0 = A.shoulder.y; while (y0 < A.wristY[side] && w.base.layers.arms[(y0 * W + (side === "left" ? A.torsoX[0] - 30 : A.torsoX[1] + 30)) * 4 + 3] < 128) y0++;
    const p = limbProfile(M, y0 + 8, A.wristY[side], side === "left" ? 0 : A.torsoX[1] + 1, side === "left" ? A.torsoX[0] : W);
    out[side] = { rows: [y0 + 8, A.wristY[side]], ...p, ok: p.rowsWithoutSkin === 0 && p.maxWidthStepPx <= g.maxLimbWidthStepPx && p.maxInkRowShare <= g.maxInkRowShare }; }
  return out;
}

/** The provenance map BEFORE a call: what each pixel of the future base figure will be. */
export const PROVENANCE = Object.freeze({ "original-kept": [70, 110, 220], "original-reference": [60, 180, 90], reconstructed: [245, 160, 40], new: [200, 60, 170], open: [205, 205, 205], removed: [120, 120, 120] });
export function provenanceExpected(w, Z = zones(w)) {
  const L = w.base.layers, lab = new Array(N).fill(null), headM = Mo.toMask(w.head, 1), seam = loadSpec().head.neckSeamY;
  for (let i = 0; i < N; i++) {
    if (headM[i] && (i < (seam + 1) * W || !w.body[i * 4 + 3])) { lab[i] = "original-kept"; continue; }
    if (!w.body[i * 4 + 3]) continue;
    if (Z.topCore[i] || Z.hipCore[i]) lab[i] = "new";
    else if (L.arms[i * 4 + 3] || L.hands[i * 4 + 3] || (i < 459 * W && classify(w.body, i) === "skin")) lab[i] = "original-reference";
    else if (Z.armZone[i] || Z.legZone[i] || Z.footZone[i]) lab[i] = "reconstructed";
    else lab[i] = "open";
  }
  return lab;
}
/** The provenance map AFTER a call, from a registered, recomposed candidate. */
export function provenanceMeasured(w, checked) {
  const lab = new Array(N).fill(null), headM = Mo.toMask(w.head, 1), seam = loadSpec().head.neckSeamY, B = checked.body, L = w.base.layers;
  for (let i = 0; i < N; i++) {
    if (headM[i] && (i < (seam + 1) * W || !w.body[i * 4 + 3])) { lab[i] = "original-kept"; continue; }
    const c = classify(B, i);
    if (!c) { if (w.body[i * 4 + 3] >= 128) lab[i] = "removed"; continue; }
    if (c === "garment") lab[i] = "new"; else if (L.arms[i * 4 + 3] || L.hands[i * 4 + 3] || (i < 459 * W && classify(w.body, i) === "skin")) lab[i] = "original-reference"; else lab[i] = "reconstructed";
  }
  return lab;
}

// ── review material (from Northstar v2 only; no base figure exists) ───────────────────────────────────────────────────────
const FIG = [250, 0, 774, 1536];
const tint = (P, m, rgb, k = 0.55) => { const o = new Uint8ClampedArray(P); for (let i = 0; i < N; i++) if (m[i]) for (let c = 0; c < 3; c++) o[i * 4 + c] = Math.round(o[i * 4 + c] * (1 - k) + rgb[c] * k); return o; };
const outline = (P, m, rgb) => { const o = new Uint8ClampedArray(P); for (let i = W; i < N - W; i++) if (m[i] && [i - 1, i + 1, i - W, i + W].some((j) => !m[j])) o.set([...rgb, 255], i * 4); return o; };
const labelImage = (lab) => { const o = new Uint8ClampedArray(N * 4).fill(255); for (let i = 0; i < N; i++) if (lab[i]) o.set([...PROVENANCE[lab[i]], 255], i * 4); return o; };

/** The stimuli the check is demonstrated on: Northstar itself, two shifts, a blur, and sleeves merely painted in skin colour. */
export function stimuli(w) {
  const M = w.fg.master, L = w.base.layers;
  return {
    northstar: { what: "Northstar v2 itself (the clothed reference)", image: M },
    "shift-3-2": { what: "Northstar shifted (3, −2) px — registration must recover it", image: shift(M, 3, -2) },
    "shift-12-0": { what: "Northstar shifted 12 px — beyond ±6, rejected", image: shift(M, 12, 0) },
    "blur": { what: "Northstar softened (3×3 blur) — the painted quality gates catch a soft image", image: WR.blur3(M) },
    "sleeves-as-skin": { what: "Northstar with its sleeves recoloured to skin — a wrong body hidden by recolouring", image: NL.overStack([M, recolour(L["top-sleeves"], { h: 33, s: 0.51 })]) },
  };
}

export function run(OUT) {
  const w = WR.buildWardrobe(), spec = loadSpec(), Z = zones(w, spec), files = {};
  const save = (n, img, what) => { const b = encodePng(img.w, img.h, img.px); writeFileSync(join(OUT, n), b); files[n] = { sha256: sha(b), w: img.w, h: img.h, what }; };
  const ns = flat(NL.overStack([w.body, w.head])), half = (P) => down(P, 262, 768, FIG);
  let zm = ns; for (const [m, rgb] of [[Z.topCore, [40, 110, 255]], [Z.hipCore, [0, 200, 220]], [Z.armZone, [255, 140, 0]], [Z.legZone, [255, 210, 0]], [Z.footZone, [40, 190, 80]]]) zm = tint(zm, m, rgb);
  zm = outline(zm, Z.envelope, [220, 30, 60]); for (const s of ["left", "right"]) zm = outline(zm, Z.handRegion[s], [180, 0, 200]);
  save("b01-zones.png", half(zm), "Northstar v2 with the D-198 zones: base top minimum (blue), base shorts minimum (cyan), arms (orange), legs (yellow), feet (green), envelope (red line), hand regions (violet line)");
  save("b02-provenance-expected.png", half(labelImage(provenanceExpected(w, Z))), "expected provenance: original kept (blue), original reference (green), reconstructed (orange), new (magenta), open — base garment, skin or nothing, decided by the candidate (light grey)");
  const T1 = w.templates, cmp = (m1, m2) => { let o = tint(ns, m1, [255, 120, 0], 0.6); return outline(tint(o, m2, [40, 110, 255], 0.6), m2, [0, 40, 160]); };
  save("b03-coverage-v1-v2.png", grid([half(cmp(T1.top.mustCover, Z.topCore)), half(cmp(T1.pants.mustCover, Z.hipCore)), half(cmp(T1.shoes.mustCover, new Uint8Array(N)))], 3), "what an item must cover: D-197 (orange, Northstar's own tee/jeans/sneakers) against the D-198 minimum (blue) — top · bottom · shoes (none: sandals show the feet)");
  const S = stimuli(w), report = { decision: DECISION, note: "No base figure exists. These are the gates run on Northstar v2 and on stimuli derived from it; they show what the check rejects, never that a base figure passes.", zones: { topCorePx: count(Z.topCore), hipCorePx: count(Z.hipCore), armZonePx: count(Z.armZone), legZonePx: count(Z.legZone), footZonePx: count(Z.footZone), skinRef: Z.skinRef }, stimuli: {} };
  for (const [id, s] of Object.entries(S)) { const r = checkBaseFigure(w, s.image, Z, spec); report.stimuli[id] = { what: s.what, ok: r.ok, registration: r.registration, checks: r.checks.map(({ id: k, ok, value }) => ({ id: k, ok, value })) }; }
  report.controls = visibleSkinControl(w, spec);
  report.files = files; writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2) + "\n");
  return report;
}

// ── D-201: diagnosis of a rejected candidate and PROPOSED gate revisions (non-binding) ──────────────────────────────────
/** The Northstar sneaker outsole: the light band of rows directly above the ground line (the sole a bare foot stands ABOVE). */
export function outsoleRows(w) { const L = w.base.layers, A = w.anchors; let rows = 0;
  for (let y = A.groundY; y > A.groundY - 60; y--) { let light = 0, n = 0; for (let x = 0; x < W; x++) { const i = y * W + x; if (L.shoes[i * 4 + 3] >= 128) { n++; if (Math.min(L.shoes[i * 4], L.shoes[i * 4 + 1], L.shoes[i * 4 + 2]) > 200) light++; } } if (n && light / n > 0.3) rows++; else if (rows) break; }
  return rows; }
/** The first row (from the top, below the shoulders) where an arm separates from the torso, per side. */
export function armpitY(P, side, y0 = 520, y1 = 800) { for (let y = y0; y < y1; y++) { let segs = 0, prev = false; for (let x = side === "left" ? 250 : 512; x < (side === "left" ? 512 : 780); x++) { const on = P[(y * W + x) * 4 + 3] >= 128; if (on && !prev) segs++; prev = on; } if (segs >= 2) return y; } return -1; }
/** Semi-transparent pixels split into the outer rim (≤ 2 px from fully transparent), the interior, and the share left after the
 *  project's established deterministic dust cleanup (cleanAlpha: alpha < 24 AND orphan-soft, D-112/D-115, used by D-131). */
export function alphaSplit(P, y0 = 441) { let tot = 0, rim = 0, interior = 0;
  for (let y = y0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x, a = P[i * 4 + 3]; if (!a) continue; tot++; if (a >= 128) continue; let near = false;
    for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) { const yy = y + dy, xx = x + dx; if (yy < 0 || yy >= H || xx < 0 || xx >= W || P[(yy * W + xx) * 4 + 3] === 0) { near = true; break; } } if (near) rim++; else interior++; }
  return { pixels: tot, rim, interior, share: +((rim + interior) / Math.max(1, tot)).toFixed(4), rimShare: +(rim / Math.max(1, tot)).toFixed(4), interiorShare: +(interior / Math.max(1, tot)).toFixed(4) }; }
export const dustCleaned = (P) => Uint8ClampedArray.from(cleanAlpha(Buffer.from(P), W, H).rgba);

/** PROPOSED revisions (D-201), measured side by side with the binding BF result. They bind nothing until the owner adopts them. */
export function proposedChecks(w, R, body, Z = zones(w), spec = loadSpec()) {
  const A = w.anchors, L = w.base.layers, out = [], add = (id, ok, value, why) => out.push({ id, ok, value, why });
  // P-BF4 — bare feet stand ABOVE the sneaker outsole, never below the ground line, and fit inside the sneakers
  const sole = outsoleRows(w), shoesG = Mo.dilate(Mo.or(Mo.toMask(L.shoes, 1), Mo.toMask(L.pants, 1)), 2), feet = {};
  for (const side of ["left", "right"]) { let yb = -1, px = 0, outside = 0; for (let y = A.ankleY[side]; y < H; y++) for (let x = 0; x < W; x++) { if ((x < Z.cx) !== (side === "left")) continue; const i = y * W + x; if (R[i * 4 + 3] >= 128) { yb = Math.max(yb, y); px++; if (!shoesG[i]) outside++; } }
    feet[side] = { soleY: yb, band: [A.groundY - sole, A.groundY], outsideShoePx: outside, footPx: px }; }
  add("P-BF4-BARE-FEET", ["left", "right"].every((s) => feet[s].soleY >= A.groundY - sole && feet[s].soleY <= A.groundY && feet[s].outsideShoePx <= 0.005 * feet[s].footPx), { outsoleRows: sole, ...feet },
    "a bare sole lies between the top of Northstar's sneaker outsole and the ground line, and the foot fits inside the sneaker (≤ 0.5 % outside), so a shoe item always hides it; BF4's ±4 px around the outsole's BOTTOM compared a bare foot with a shoe's sole");
  // P-BF9 — the chest band is the candidate's OWN torso between its armpits and the natural waist, rim excluded
  const ap = Math.max(armpitY(R, "left"), armpitY(R, "right")), yTop = ap + 8, yBot = spec.targets.waistY + spec.zones.coreOverlapPx; let n = 0, ok = 0;
  for (let y = yTop; y <= yBot; y++) { let a = Z.cx, b = Z.cx; if (R[(y * W + Z.cx) * 4 + 3] < 128) continue; while (a > 0 && R[(y * W + a - 1) * 4 + 3] >= 128) a--; while (b < W - 1 && R[(y * W + b + 1) * 4 + 3] >= 128) b++;
    for (let x = a + 4; x <= b - 4; x++) { const i = y * W + x; n++; if (R[i * 4 + 3] >= 250 && classify(R, i) !== "skin") ok++; } }
  add("P-BF9-CHEST-BAND", n > 0 && ok / n >= spec.gates.minCoreCoverage, { armpitY: ap, rows: [yTop, yBot], coverage: +(ok / Math.max(1, n)).toFixed(4) },
    "the band is the candidate's own torso (4 px rim excluded) from 8 px below its armpits to the natural waist: a sleeveless top's armholes above the armpit and a close-fitting torso narrower than the t-shirt are the intended base, not gaps");
  // P-BF14 — semi-transparency measured AFTER the established dust cleanup, interior and rim separately
  const raw = alphaSplit(R), cleaned = alphaSplit(dustCleaned(R));
  add("P-BF14-ALPHA", cleaned.share <= spec.gates.maxHazeShare && cleaned.interiorShare <= 0.01, { raw, afterDustCleanup: cleaned },
    "measured after the project's deterministic dust cleanup (cleanAlpha, used for H1 in D-131); the interior (> 2 px from transparency) is reported and capped separately, so a soft fringe inside the figure cannot hide behind a good rim");
  return out;
}

/** CONTROL STIMULI for the proposed revisions (D-201), all derived from Northstar v2 — never from the private candidate. Each
 *  proposal must pass the sound case and fail the faults it exists for. */
export function proposalStimuli(w) {
  const M = w.fg.master, L = w.base.layers, A = w.anchors, shoes = Mo.toMask(L.shoes, 1);
  const moveShoes = (dy) => { const o = new Uint8ClampedArray(M); for (let i = 0; i < N; i++) if (shoes[i]) o.fill(0, i * 4, i * 4 + 4); for (let i = 0; i < N; i++) { if (!shoes[i]) continue; const j = i + dy * W; if (j >= 0 && j < N) o.set(M.subarray(i * 4, i * 4 + 4), j * 4); } return o; };
  const widenShoes = (k) => { const o = new Uint8ClampedArray(M); for (let y = A.shoeTopY.left; y < H; y++) for (let x = 0; x < W; x++) { const cx = x < A.centreX ? 430 : 594, sx = Math.round(cx + (x - cx) / k), j = (y * W + sx) * 4; if (sx >= 0 && sx < W && shoes[y * W + sx]) o.set(M.subarray(j, j + 4), (y * W + x) * 4); } return o; };
  const cutTop = (y0) => { const o = new Uint8ClampedArray(M), t = Mo.toMask(L["top-body"], 1); for (let i = y0 * W; i < N; i++) if (t[i] && !L.arms[i * 4 + 3] && !L.hands[i * 4 + 3] && !L.pants[i * 4 + 3]) o.set([253, 194, 124, 255], i * 4); return o; };
  const sideSkin = (px) => { const o = new Uint8ClampedArray(M); for (let y = A.shoulder.y + 140; y < 780; y++) for (const x0 of [A.torsoX[0] + 2, A.torsoX[1] - 2 - px]) for (let x = x0; x < x0 + px; x++) if (L["top-body"][(y * W + x) * 4 + 3] >= 250) o.set([253, 194, 124, 255], (y * W + x) * 4); return o; };
  const halo = (r, a) => { const o = new Uint8ClampedArray(M), sil = Mo.toMask(M, 1), ring = Mo.and(Mo.dilate(sil, r), Mo.not(sil)); for (let i = 441 * W; i < N; i++) if (ring[i]) o.set([253, 194, 124, a], i * 4); return o; };
  const patch = (a) => { const o = new Uint8ClampedArray(M); for (let y = 880; y < 940; y++) for (let x = 420; x < 480; x++) o[(y * W + x) * 4 + 3] = a; return o; };
  const dust = () => { const o = new Uint8ClampedArray(M); for (let y = 460; y < 1500; y += 3) for (let x = 120; x < 300; x += 3) o.set([200, 200, 200, 8], (y * W + x) * 4); return o; };
  return {
    northstar: { proposal: "all", expect: { "P-BF4-BARE-FEET": true, "P-BF9-CHEST-BAND": true, "P-BF14-ALPHA": true }, image: M, what: "Northstar itself: soles on the ground line inside the shoes, the tee covering its torso, clean edges" },
    "feet-lifted-25": { proposal: "P-BF4-BARE-FEET", expect: false, image: moveShoes(-25), what: "the feet 25 px above the ground line — above the outsole band" },
    "feet-below-ground-6": { proposal: "P-BF4-BARE-FEET", expect: false, image: moveShoes(6), what: "the feet 6 px below the ground line" },
    "feet-too-wide": { proposal: "P-BF4-BARE-FEET", expect: false, image: widenShoes(1.3), what: "feet 1.3× wider than the sneakers — they would stick out of every shoe" },
    "top-cropped-at-700": { proposal: "P-BF9-CHEST-BAND", expect: false, image: cutTop(700), what: "the top ends at y 700, above the natural waist — bare midriff" },
    "top-side-skin-30": { proposal: "P-BF9-CHEST-BAND", expect: false, image: sideSkin(30), what: "30 px of skin down both torso sides below the armpits — a top that does not cover the chest band" },
    "halo-6-alpha-60": { proposal: "P-BF14-ALPHA", expect: false, image: halo(6, 60), what: "a 6 px semi-transparent halo (alpha 60) around the whole body — a real soft fringe" },
    "interior-patch-alpha-100": { proposal: "P-BF14-ALPHA", expect: false, image: patch(100), what: "a 60×60 px translucent patch (alpha 100) inside the figure" },
    "encoder-dust": { proposal: "P-BF14-ALPHA", expect: true, image: dust(), what: "isolated alpha-8 dust beside the figure — invisible; removed by the established cleanup" },
  };
}

/** D-201 — localized pixel maps of the failed checks, written ONLY outside the repository. The raw file is never changed. */
export function diagnose(buf, OUT, spec = loadSpec()) {
  if (!isOutsideRepo(OUT)) throw new Error("refusing to write diagnosis material inside the repository (D-127 §2): " + OUT);
  const img = decodePng(buf); if (!img.ok || !img.px || img.px.length !== N * 4) throw new Error("not a 1024×1536 RGBA PNG");
  const raw = Uint8ClampedArray.from(img.px), w = WR.buildWardrobe(), Z = zones(w, spec), A = w.anchors, L = w.base.layers, files = {};
  const save = (n, im, what) => { const b = encodePng(im.w, im.h, im.px); writeFileSync(join(OUT, n), b); files[n] = { sha256: sha(b), w: im.w, h: im.h, what }; };
  const bound = checkBaseFigure(w, raw, Z, spec, "d194"), fixed = checkBaseFigure(w, raw, Z, spec, "generated"), R = fixed.registered;
  const bg = [236, 233, 226], paint = (P, m, rgb, k = 0.75) => tint(P, m, rgb, k), line = (P, y, x0, x1, rgb) => { const o = new Uint8ClampedArray(P); for (let x = x0; x < x1; x++) o.set([...rgb, 255], (y * W + x) * 4); return o; };
  const x2 = (P, box) => crop(P, box, 2);
  // BF4 — feet against the sneaker outline, its outsole band and the ground line
  const sole = outsoleRows(w); let F = flat(R, bg); F = outline(F, Mo.toMask(L.shoes, 128), [220, 30, 60]);
  F = line(F, A.groundY - sole, 330, 694, [240, 190, 0]); F = line(F, A.groundY, 330, 694, [30, 160, 60]);
  save("d01-bf4-feet-x2.png", x2(F, [330, 1300, 694, 1500]), "BF4: A's bare feet (raw) with Northstar's sneaker outline (red), the top of its outsole (yellow, " + sole + " rows) and the ground line (green); the soles stop 7 px above the green line, inside the outsole band");
  // BF5 / BF15 — where the base shorts pass the jeans
  const GB = garmentMask(fixed.body), seeds = []; for (let i = 0; i < N; i++) if (GB[i] && (Z.topCore[i] || Z.hipCore[i])) seeds.push([i % W, (i / W) | 0]);
  const baseG = NL.flood(seeds, (i) => GB[i] === 1), cov = NL.overStack([L.shoes, L.pants, L["top-body"], L["top-sleeves"]]), visible = new Uint8Array(N), outsideEnv = new Uint8Array(N);
  for (let i = 0; i < N; i++) { if (baseG[i] && cov[i * 4 + 3] < 128) visible[i] = 1; if (i >= 441 * W && R[i * 4 + 3] >= 128 && !Z.envelope[i]) outsideEnv[i] = 1; }
  const dressed = NL.overStack([fixed.body, L.shoes, L.pants, L["top-body"], L["top-sleeves"], w.head]);
  let D = paint(flat(dressed, bg), visible, [230, 0, 200]); D = paint(D, Mo.dilate(outsideEnv, 1), [255, 0, 0], 0.9);
  let S = outline(flat(R, bg), Mo.toMask(L.pants, 128), [30, 90, 230]);
  save("d02-bf5-bf15-hips-x2.png", grid([x2(D, [300, 760, 724, 980]), x2(S, [300, 760, 724, 980])], 1), "BF5/BF15: top — dressed back; magenta = base-shorts pixels the jeans leave visible, red = outside the envelope; bottom — the raw shorts with the jeans' outline (blue)");
  // BF9 — the chest band and what is not covered, by class
  let C = outline(flat(R, bg), Z.topCore, [30, 90, 230]); const unc = { skin: 0, semi: 0, transparent: 0 };
  for (let i = 0; i < N; i++) { if (!Z.topCore[i] || (R[i * 4 + 3] >= 250 && classify(R, i) !== "skin")) continue; const k = R[i * 4 + 3] === 0 ? "transparent" : R[i * 4 + 3] < 250 ? "semi" : "skin"; unc[k]++; C.set([...(k === "skin" ? [255, 140, 0] : k === "semi" ? [240, 210, 0] : [230, 0, 0]), 255], i * 4); }
  const apL = armpitY(R, "left"), apR = armpitY(R, "right"); C = line(C, Math.max(apL, apR), 360, 664, [0, 170, 90]);
  save("d03-bf9-chestband-x2.png", x2(C, [360, 480, 664, 820]), "BF9: the band (blue outline) and its uncovered pixels — skin (orange), semi-transparent rim (yellow), transparent (red); green = A's armpit row");
  // BF14 — rim / interior / dust, and the figure on several backgrounds
  const M = new Uint8ClampedArray(N * 4).fill(255); const dust = new Uint8Array(N), cl = dustCleaned(R); for (let i = 0; i < N; i++) if (R[i * 4 + 3] && !cl[i * 4 + 3]) dust[i] = 1;
  for (let y = 441; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x, a = R[i * 4 + 3]; if (!a) continue; if (a >= 128) { M.set([200, 200, 200, 255], i * 4); continue; }
    let near = false; for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) { const yy = y + dy, xx = x + dx; if (yy < 0 || yy >= H || xx < 0 || xx >= W || R[(yy * W + xx) * 4 + 3] === 0) { near = true; break; } }
    M.set(dust[i] ? [240, 190, 0, 255] : near ? [0, 170, 220, 255] : [220, 0, 160, 255], i * 4); }
  save("d04-bf14-alpha-map.png", down(M, 262, 768, [250, 0, 774, 1536]), "BF14 at 1/2: opaque (grey), dust removed by the established cleanup (yellow), remaining outer rim ≤ 2 px (cyan), remaining interior semi-transparency (magenta)");
  const box = [380, 820, 644, 1060], bgs = [[255, 255, 255], [20, 20, 24], [255, 0, 255], [120, 120, 120]];
  save("d05-backgrounds-x2.png", grid(bgs.map((c) => x2(flat(R, c), box)), 4), "the raw figure (hands, hips, between the legs) ×2 on white, near-black, magenta and mid grey");
  save("d06-backgrounds-after-dust-x2.png", grid(bgs.map((c) => x2(flat(cl, c), box)), 4), "the same after the established dust cleanup only (alpha < 24 and orphan-soft) — not a retouch");
  // the neck seam: D-194 rule against the D-201 generated-body rule, and the raw neck
  const nb = [400, 420, 624, 520]; save("d07-neck-seam-x3.png", grid([crop(flat(bound.figure, bg), nb, 3), crop(flat(fixed.figure, bg), nb, 3), crop(flat(R, bg), nb, 3)], 1),
    "the neck ×3: D-194 seam rule (top, the pale line), D-201 generated-body seam rule (middle), the raw image (bottom)");
  const report = { decision: "D-201", raw: { sha256: sha(buf) }, note: "Diagnosis only. The binding D-200 result (D-194 seam, thresholds unchanged) stays as recorded; nothing here re-classifies A.",
    bindingResultD200: bound.checks.map(({ id, ok, value }) => ({ id, ok, value })), withFixedSeam: fixed.checks.map(({ id, ok, value }) => ({ id, ok, value })),
    seam: { d194: neckLine(w, R, bound.figure), generated: neckLine(w, R, fixed.figure) },
    bf4: { outsoleRows: sole }, bf5bf15: { visibleBaseGarmentPx: count(visible), outsideEnvelopePx: count(outsideEnv) }, bf9: { uncovered: unc, armpitY: { left: apL, right: apR }, bandRows: [A.shoulder.y + spec.zones.chestBelowShoulderPx, spec.targets.waistY + spec.zones.coreOverlapPx] },
    bf14: { raw: alphaSplit(R), afterDustCleanup: alphaSplit(cl), dustPx: count(dust), northstar: alphaSplit(w.fg.master) },
    proposed: proposedChecks(w, R, fixed.body, Z, spec), files };
  writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2) + "\n");
  return report;
}

/** D-199 — the review of ONE generated candidate: BF1–BF15 and the review images, written ONLY outside the repository
 *  (D-127 §2). The raw file is read, never changed. Nothing is painted; registration is the checker's integer shift. */
export function isOutsideRepo(dir) { const rel = relative(REPO, resolve(dir)); return rel !== "" && (rel.startsWith("..") || isAbsolute(rel)); }
export function review(buf, OUT, spec = loadSpec()) {
  if (!isOutsideRepo(OUT)) throw new Error("refusing to write review material inside the repository (D-127 §2): " + OUT);
  const img = decodePng(buf), raw = img.ok && img.px && img.px.length === N * 4 ? Uint8ClampedArray.from(img.px) : null;
  const w = WR.buildWardrobe(), Z = zones(w, spec), files = {};
  const save = (n, im, what) => { const b = encodePng(im.w, im.h, im.px); writeFileSync(join(OUT, n), b); files[n] = { sha256: sha(b), w: im.w, h: im.h, what }; };
  const report = { decision: "D-199", raw: { sha256: sha(buf), bytes: buf.length, decodedAsRgba1024x1536: !!raw, header: img.header || null }, thresholds: spec.gates, targets: spec.targets,
    note: "BF1–BF15 are measurements. They are never a visual approval: V1–V8 are the owner's. The raw image is unchanged; nothing was painted or retouched." };
  if (!raw) { report.ok = false; report.checks = [{ id: "BF1-FORMAT", ok: false, value: { header: img.header || null, error: img.error || "not 8-bit RGBA" } }]; writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2) + "\n"); return report; }
  const r = checkBaseFigure(w, raw, Z, spec);
  report.ok = r.ok; report.registration = r.registration; report.checks = r.checks.map(({ id, ok, value, what }) => ({ id, ok, value, what }));
  report.seamRule = SEAM_RULES.generated; report.proposedRevisions = proposedChecks(w, r.registered, r.body, Z, spec).map(({ id, ok, value }) => ({ id, ok, value, status: "PROPOSED — not binding" }));
  const bg = [236, 233, 226], FIGB = [250, 0, 774, 1536], half = (P) => down(flat(P, bg), 262, 768, FIGB);
  save("r01-raw-as-received.png", half(raw), "the raw result, unchanged, flattened on a neutral background at 1/2 size (the raw file itself is kept untouched)");
  if (r.figure) {
    const fig = r.figure, dressed = NL.overStack([r.body, w.base.layers.shoes, w.base.layers.pants, w.base.layers["top-body"], w.base.layers["top-sleeves"], w.head]);
    const ns = NL.overStack([w.body, w.head]), F = flat(fig, bg);
    save("r02-body-with-r3-head.png", half(fig), "the candidate's body (registered by the integer shift only) with the existing R3 head stack — D-201 generated-body seam rule, nothing painted");
    const A = w.anchors, x2 = (box) => crop(F, box, 2);
    save("r03-neck-shoulders-x2.png", x2([360, 420, 664, 600]), "neck, collar line and shoulders ×2");
    save("r04-arms-hands-x2.png", grid([x2([290, 500, 420, 980]), x2([604, 500, 734, 980])], 2), "left and right arm with hand ×2");
    save("r05-knees-x2.png", x2([370, 1020, 654, 1200]), "knees ×2 (the knee height is an estimate; the jeans hid it)");
    save("r06-ankles-feet-x2.png", x2([330, 1300, 694, 1500]), "ankles and feet on the ground line ×2");
    save("r07-dress-back.png", grid([half(dressed), half(ns)], 2), "dressed back in D-197's default items (left) beside the original Northstar (right)");
    const app = (P, ww, hh) => down(flat(P, bg), ww, hh);
    save("r08-app-sizes.png", grid([app(fig, 110, 165), app(dressed, 110, 165), app(fig, 52, 78), app(dressed, 52, 78)], 4, 6), "hub 110×165 and quiz 52×78: the base figure and the dressed-back figure");
    const lab = provenanceMeasured(w, r), counts = {}; for (const k of lab) if (k) counts[k] = (counts[k] || 0) + 1;
    save("r09-provenance-measured.png", half(labelImage(lab)), "measured provenance: original kept (blue), original reference (green), reconstructed (orange), new base garment (magenta), removed (dark grey)");
    report.provenance = counts;
  }
  report.files = files; writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2) + "\n");
  return report;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const a = process.argv.slice(2), oi = a.indexOf("--out"), ci = a.indexOf("--check"), ri = a.indexOf("--review"), di = a.indexOf("--diagnose");
  if (di >= 0) {
    if (!a[di + 1] || oi < 0 || !a[oi + 1]) { console.error("usage: --diagnose <candidate.png> --out <empty dir outside both clones>"); process.exit(1); }
    const OUT = resolve(a[oi + 1]);
    if (!isOutsideRepo(OUT)) { console.error("REFUSED: --out is inside the repository; a base figure is never written there (D-127 §2)"); process.exit(1); }
    if (existsSync(OUT) && readdirSync(OUT).length) { console.error("--out must be empty"); process.exit(1); } mkdirSync(OUT, { recursive: true });
    const r = diagnose(readFileSync(resolve(a[di + 1])), OUT);
    console.log(JSON.stringify({ seam: r.seam, bf4: r.bf4, bf5bf15: r.bf5bf15, bf9: r.bf9, bf14: r.bf14, proposed: r.proposed.map(({ id, ok, value }) => ({ id, ok, value })) }, null, 2)); process.exit(0);
  }
  if (ri >= 0) {
    if (!a[ri + 1] || oi < 0 || !a[oi + 1]) { console.error("usage: --review <candidate.png> --out <empty dir outside both clones>"); process.exit(1); }
    const OUT = resolve(a[oi + 1]);
    if (!isOutsideRepo(OUT)) { console.error("REFUSED: --out is inside the repository; a base figure is never written there (D-127 §2)"); process.exit(1); }
    if (existsSync(OUT) && readdirSync(OUT).length) { console.error("--out must be empty"); process.exit(1); } mkdirSync(OUT, { recursive: true });
    const r = review(readFileSync(resolve(a[ri + 1])), OUT);
    for (const c of r.checks) console.log((c.ok ? "PASS " : "FAIL ") + c.id + "  " + JSON.stringify(c.value));
    console.log(r.ok ? "\nALL BF1–BF15 PASSED — a measurement, not a visual approval." : "\nTECHNICAL REJECT — at least one BF check failed."); process.exit(r.ok ? 0 : 2);
  }
  if (ci >= 0 && a[ci + 1]) {
    const buf = readFileSync(resolve(a[ci + 1])), img = decodePng(buf);
    if (!img.ok || !img.px || img.px.length !== N * 4) { console.error("not a 1024×1536 RGBA PNG"); process.exit(1); }
    const w = WR.buildWardrobe(), r = checkBaseFigure(w, Uint8ClampedArray.from(img.px));
    console.log(JSON.stringify({ sha256: sha(buf), ok: r.ok, registration: r.registration, checks: r.checks.map(({ id, ok, value }) => ({ id, ok, value })) }, null, 2)); process.exit(r.ok ? 0 : 2);
  }
  if (oi < 0 || !a[oi + 1]) { console.error("usage: --out <empty dir> | --check <candidate.png>"); process.exit(1); }
  const OUT = resolve(a[oi + 1]); if (existsSync(OUT) && readdirSync(OUT).length) { console.error("--out must be empty"); process.exit(1); } mkdirSync(OUT, { recursive: true });
  const r = run(OUT); for (const [id, s] of Object.entries(r.stimuli)) console.log(id.padEnd(16), s.ok ? "PASS" : "FAIL", s.checks.filter((c) => !c.ok).map((c) => c.id).join(" "));
}
