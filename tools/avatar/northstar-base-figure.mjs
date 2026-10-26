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
//        node tools/avatar/northstar-base-figure.mjs --layers <candidate.png> --out <empty dir OUTSIDE both clones>
//             (D-204: the runtime layering proof — base garments separated from the body, the body dressed WITHOUT them)
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

export const outlineShare = (P, y0) => { let edge = 0, dark = 0; for (let i = Math.max(W, y0 * W); i < N - W; i++) { if (P[i * 4 + 3] < 200) continue; if ([i - 1, i + 1, i - W, i + W].some((j) => P[j * 4 + 3] < 64)) { edge++; if (Math.max(P[i * 4], P[i * 4 + 1], P[i * 4 + 2]) < 110) dark++; } } return edge ? dark / edge : 0; };
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
/** The gate sets. v1 = D-198's BF1–BF15 exactly (A's historical D-200 result). v2 = D-202: BF4, BF9 and BF14 replaced by the
 *  adopted D-201 revisions (BF4v2, BF9v2, BF14v2); every other gate and threshold unchanged. v2 binds every candidate after A. */
export const GATE_SETS = Object.freeze({ v1: "D-198 BF1–BF15 (A's historical result, D-200)", v2: "D-202: BF4v2, BF9v2 and BF14v2 replace BF4, BF9 and BF14 (C's historical result, D-203)",
  v3: "D-205 binding set: v2 with BF9v3 (the waist seam closed instead of a hem row) and BF15v3 (the runtime composition with the minimum items, no base garments under them) — legacy dress-back is a compatibility report, not a gate" });
/** BF9v3 — the waist seam: in every torso column (12 px inset) no skin and no transparent pixel lies between the base top and the
 *  base shorts. The hem row range of v1/v2 was a proxy for exactly this closure; a gap would open the midriff in the minimum outfit. */
export function waistSeam(R, lab, A) { let gap = 0, cols = 0;
  for (let x = A.torsoX[0] + 12; x <= A.torsoX[1] - 12; x++) { let lo = -1, hi = -1; for (let y = 700; y < 900; y++) { const i = y * W + x; if (lab[i] === 1) lo = y; if (lab[i] === 2 && hi < 0) hi = y; } if (lo < 0 || hi < 0) continue; cols++;
    for (let y = lo + 1; y < hi; y++) { const i = y * W + x; if (R[i * 4 + 3] < 128 || classify(R, i) === "skin") gap++; } }
  return { columns: cols, gapPx: gap }; }
/** The minimum items of a base: its own base top and base shorts cut out unchanged (the contract's smallest top and bottom), no shoes. */
export function minimumItems(R, lab) { const top = new Uint8ClampedArray(N * 4), bot = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < N; i++) { if (lab[i] === 1) top.set(R.subarray(i * 4, i * 4 + 4), i * 4); if (lab[i] === 2) bot.set(R.subarray(i * 4, i * 4 + 4), i * 4); }
  return { topBody: top, sleeves: new Uint8ClampedArray(N * 4), pants: bot, shoes: new Uint8ClampedArray(N * 4) }; }
/** BF15v3 — the actual runtime composition (D-198): the body with its base garments REMOVED, dressed in the minimum items.
 *  Limits and why: 0 enclosed holes (any hole shows background through the figure); ≤ 10 exposed cut-skin px (antialias where a
 *  removed outline met skin: C 2 px, a bottom cut 60 px short 198 px); 0 open base px deeper than FABRIC_BAND_PX (4 px, the
 *  measured fabric excess) inside the silhouette (deeper means missing body); arms shown over the top's body (≥ 0.99 of their
 *  overlap; the contract order puts the arms in front). */
export function bf15v3(w, R, Z, opts = {}) { const sep = separateBase(R, Z), P = layerProof(w, R, Z, minimumItems(R, sep.lab), { sep, ...opts }), c = (m) => { let n = 0; for (let i = 0; i < N; i++) if (m[i]) n++; return n; };
  // the order probe: an opaque top body behind the whole upper body (shoulders to the natural waist, full width) — every arm pixel
  // must still be seen in front of it; the minimum items alone never overlap the arms, so they cannot test the order
  const probe = new Uint8ClampedArray(N * 4); for (let y = w.anchors.shoulder.y; y <= loadSpec().targets.waistY; y++) for (let x = 0; x < W; x++) probe.set([128, 128, 128, 255], (y * W + x) * 4);
  const O = layerProof(w, R, Z, { ...minimumItems(R, sep.lab), topBody: probe }, { sep, ...opts });
  const v = { enclosedHolePx: c(P.enclosed), exposedCutSkinPx: c(P.cutSkin), deepOpenBasePx: c(P.deep), armShownShare: O.order.armShownShare, armOverTopPx: O.order.armOverTopPx };
  return { ok: v.enclosedHolePx === 0 && v.exposedCutSkinPx <= 10 && v.deepOpenBasePx === 0 && v.armOverTopPx > 0 && v.armShownShare >= 0.99, value: v, P, sep }; }
export function checkBaseFigure(w, cand, Z = zones(w), spec = loadSpec(), seam = "generated", gateSet = "v1") {
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
  const v3 = gateSet === "v3", v2 = gateSet === "v2" || v3, P2 = v2 ? Object.fromEntries(proposedChecks(w, R, null, Z, spec).map((c) => [c.id, c])) : null, S3 = v3 ? bf15v3(w, dustCleaned(R), Z) : null;
  if (v2) add("BF4v2-POSE", Math.abs(pose.centreX - pose.northstarCentreX) <= g.centreTolPx && ["left", "right"].every((s) => pose.handIoU[s] >= g.minHandIoU) && P2["P-BF4-BARE-FEET"].ok,
    { centreX: pose.centreX, northstarCentreX: pose.northstarCentreX, handIoU: pose.handIoU, bareFeet: P2["P-BF4-BARE-FEET"].value },
    "Northstar's centre axis (±" + g.centreTolPx + ") and hands (IoU ≥ " + g.minHandIoU + "); each bare sole between the top of the sneaker outsole and the ground line, the foot inside the sneaker (D-202, adopted P-BF4)");
  else add("BF4-POSE", Math.abs(pose.centreX - pose.northstarCentreX) <= g.centreTolPx && ["left", "right"].every((s) => Math.abs(pose.groundY[s] - A.groundY) <= g.groundTolPx && pose.handIoU[s] >= g.minHandIoU), pose, "Northstar's centre axis (±" + g.centreTolPx + "), ground line (±" + g.groundTolPx + " per foot) and hands (IoU ≥ " + g.minHandIoU + ", the D-131 bound)");
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
  if (v3) { const seam = waistSeam(dustCleaned(R), S3.sep.lab, A); add("BF9v3-BASE-TOP", P2["P-BF9-CHEST-BAND"].ok && top.skinDistance >= g.minGarmentSkinDistance && seam.columns > 0 && seam.gapPx === 0,
    { chestBand: P2["P-BF9-CHEST-BAND"].value, rgb: topRgb, skinDistance: top.skinDistance, hemY: topHem, waistSeam: seam },
    "the base top covers the torso below the armpits, is clearly not skin-coloured, and meets the base shorts with no skin and no transparency between them in any torso column (D-205)"); }
  else if (v2) add("BF9v2-BASE-TOP", P2["P-BF9-CHEST-BAND"].ok && top.skinDistance >= g.minGarmentSkinDistance && topHem >= t.baseTopHemY[0] && topHem <= t.baseTopHemY[1],
    { chestBand: P2["P-BF9-CHEST-BAND"].value, rgb: topRgb, skinDistance: top.skinDistance, hemY: topHem },
    "the base top covers the candidate's own torso from 8 px below its armpits to the natural waist (4 px rim excluded), opaque, clearly not skin-coloured, hem at y " + t.baseTopHemY.join("–") + " (D-202, adopted P-BF9)");
  else add("BF9-BASE-TOP", top.coverage >= g.minCoreCoverage && top.skinDistance >= g.minGarmentSkinDistance && topHem >= t.baseTopHemY[0] && topHem <= t.baseTopHemY[1], top, "the base top covers the chest band to the natural waist, opaque, clearly not skin-coloured, hem at y " + t.baseTopHemY.join("–"));
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
  if (v2) add("BF14v2-ALPHA", P2["P-BF14-ALPHA"].ok, P2["P-BF14-ALPHA"].value, "after the established dust cleanup (cleanAlpha): semi-transparent share ≤ " + g.maxHazeShare + " and interior share ≤ " + spec.gatesV2.maxInteriorShare + " (D-202, adopted P-BF14)");
  else add("BF14-ALPHA", haze <= g.maxHazeShare * px, { share: +(haze / Math.max(1, px)).toFixed(4) }, "a clean cut-out: semi-transparency only as a thin rim");
  // BF15 dress-back: D-197's three default items over the new body hide every base-garment pixel and give Northstar's silhouette
  const dressed = NL.overStack([body, L.shoes, L.pants, L["top-body"], L["top-sleeves"]]), cov = NL.overStack([L.shoes, L.pants, L["top-body"], L["top-sleeves"]]);
  const GB = garmentMask(body), seeds = []; for (let i = 0; i < N; i++) if (GB[i] && (Z.topCore[i] || Z.hipCore[i])) seeds.push([i % W, (i / W) | 0]);
  const baseG = NL.flood(seeds, (i) => GB[i] === 1);
  let visibleBase = 0, inter = 0, uni = 0; for (let i = 0; i < N; i++) { if (baseG[i] && cov[i * 4 + 3] < 128) visibleBase++; const a = dressed[i * 4 + 3] >= 128, b = w.body[i * 4 + 3] >= 128; if (a && b) inter++; if (a || b) uni++; }
  if (v3) add("BF15v3-RUNTIME", S3.ok, S3.value, "the body WITHOUT its base garments, dressed in the minimum items: no hole, ≤ 10 exposed cut-skin px, no missing body beyond the 4 px fabric band, the arms in front of the top's body (D-205)");
  else add("BF15-DRESS-BACK", visibleBase <= g.maxDressBackVisibleBasePx && inter / uni >= g.minDressBackIoU, { visibleBaseGarmentPx: visibleBase, silhouetteIoU: +(inter / uni).toFixed(4) }, "dressed in D-197's tee, jeans and sneakers the base shows no base garment and Northstar's silhouette");
  return { registration: reg, checks: out, ok: out.every((x) => x.ok), registered: R, body, figure, gateSet };
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
export const tint = (P, m, rgb, k = 0.55) => { const o = new Uint8ClampedArray(P); for (let i = 0; i < N; i++) if (m[i]) for (let c = 0; c < 3; c++) o[i * 4 + c] = Math.round(o[i * 4 + c] * (1 - k) + rgb[c] * k); return o; };
export const outline = (P, m, rgb) => { const o = new Uint8ClampedArray(P); for (let i = W; i < N - W; i++) if (m[i] && [i - 1, i + 1, i - W, i + W].some((j) => !m[j])) o.set([...rgb, 255], i * 4); return o; };
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
  add("P-BF14-ALPHA", cleaned.share <= spec.gates.maxHazeShare && cleaned.interiorShare <= (spec.gatesV2 ? spec.gatesV2.maxInteriorShare : 0.01), { raw, afterDustCleanup: cleaned },
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

// ── D-204: the runtime layering proof ───────────────────────────────────────────────────────────────────────────────────
/** Separate the base garments from the visible body of a registered candidate. The base region is every NON-skin pixel within
 *  3 px of the base garments' colour components (their fill, their painted outline and its antialiasing); skin is never removed,
 *  so no needed skin is cut away and the body contour is not moved. Nothing is painted. Returns label 1 top / 2 shorts / 0. */
export function separateBase(R, Z) {
  const G = garmentMask(R), topRgb = medianRgb(R, Z.topCore, "garment"), hipRgb = medianRgb(R, Z.hipCore, "garment"), core = baseGarments(R, G, Z, topRgb, hipRgb);
  const near = Mo.dilate(Mo.or(...[1, 2].map((k) => { const m = new Uint8Array(N); for (let i = 0; i < N; i++) if (core[i] === k) m[i] = 1; return m; })), 3), lab = new Uint8Array(N);
  // top or shorts by POSITION, not colour (the top's dark outline is closer in colour to the shorts): per column, the seam is the
  // first row of the waist band where five base pixels in a row are shorts-dark; above it top, below it shorts (default: the waist row)
  const lum = (i) => 0.3 * R[i * 4] + 0.59 * R[i * 4 + 1] + 0.11 * R[i * 4 + 2], cut = hipRgb && topRgb ? (0.3 * (topRgb[0] + hipRgb[0]) + 0.59 * (topRgb[1] + hipRgb[1]) + 0.11 * (topRgb[2] + hipRgb[2])) / 2 : 130;
  const seamY = new Int32Array(W).fill(loadSpec().targets.waistY);
  // the search stays in the waist band (waist − 40 … waist + 30): lower down, a crotch-gap column would put the shorts' inner outline into the top
  const wy = loadSpec().targets.waistY;
  for (let x = 0; x < W; x++) for (let y = wy - 40; y < wy + 30; y++) { let ok = true; for (let k = 0; k < 5 && ok; k++) { const i = (y + k) * W + x; ok = core[i] > 0 && lum(i) < cut; } if (ok) { seamY[x] = y; break; } }
  for (let i = 0; i < N; i++) { if (!near[i] || !R[i * 4 + 3] || classify(R, i) === "skin" || (R[i * 4 + 3] >= 128 && skinish(R, i))) continue; lab[i] = ((i / W) | 0) < seamY[i % W] ? 1 : 2; }
  return { lab, topRgb, hipRgb };
}
/** Skin shading the colour classifier calls "other": warm, saturated, light — never removed with the base garments. */
const skinish = (P, i) => { const r = P[i * 4], g = P[i * 4 + 1], b = P[i * 4 + 2]; return r > 150 && r > g && g > b && r - b > 60; };
/** The runtime body: the candidate below the seam with the base garments EMPTY (D-198), split into the body proper and the arms
 *  with hands, so items can lie behind the arms (top body) and over them (sleeves). The arms are the runtime pixels CONNECTED to
 *  Northstar's own arm and hand regions inside the arm columns (outside the torso, shoulder to hand bottom) — never a column cut,
 *  which would lift the outer edge of a thigh into the arm layer and draw it over the bottoms. */
export function runtimeBody(w, R, lab) {
  const A = w.anchors, b = FG.loadSpec().body, L = w.base.layers, all = new Uint8ClampedArray(N * 4), body = new Uint8ClampedArray(N * 4), arms = new Uint8ClampedArray(N * 4), edge = neckEdgeMask(w);
  let handBottom = 0; for (let i = 0; i < N; i++) if (L.hands[i * 4 + 3]) handBottom = Math.max(handBottom, ((i / W) | 0) + 12);
  for (let y = b.seamY; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x, j = i * 4; if (lab[i] || !R[j + 3] || (w.fg.bald[j + 3] > 0 && !edge[i])) continue; all.set(R.subarray(j, j + 4), j); }
  const zone = (i) => { const x = i % W, y = (i / W) | 0; return y >= A.shoulder.y && y <= handBottom && (x < A.torsoX[0] || x > A.torsoX[1]); };
  const seeds = []; for (let i = 0; i < N; i++) if (zone(i) && all[i * 4 + 3] >= 128 && (L.arms[i * 4 + 3] >= 128 || L.hands[i * 4 + 3] >= 128)) seeds.push([i % W, (i / W) | 0]);
  const armM = NL.flood(seeds, (i) => zone(i) && all[i * 4 + 3] > 0);
  for (let i = 0; i < N; i++) if (all[i * 4 + 3]) (armM[i] ? arms : body).set(all.subarray(i * 4, i * 4 + 4), i * 4);
  return { body, arms };
}
/** The canvas exterior of a figure: transparent pixels connected to the border. */
export function outsideExterior(R) { return outsideConnected(new Uint8Array(N).fill(1), (i) => R[i * 4 + 3] < 128); }
/** Pixels of `m` connected (4-way, through pixels where `pass` holds) to the canvas border — what simply becomes background. */
function outsideConnected(m, pass) { const o = new Uint8Array(N), st = []; for (let x = 0; x < W; x++) for (const y of [0, H - 1]) { const i = y * W + x; if (pass(i)) { o[i] = 1; st.push(i); } }
  for (let y = 0; y < H; y++) for (const x of [0, W - 1]) { const i = y * W + x; if (pass(i) && !o[i]) { o[i] = 1; st.push(i); } }
  while (st.length) { const i = st.pop(), x = i % W; for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < N && !o[j] && Math.abs((j % W) - x) <= 1 && pass(j)) { o[j] = 1; st.push(j); } }
  return Mo.and(o, m); }
const borderMask = () => { const b = new Uint8Array(N); for (let x = 0; x < W; x++) { b[x] = 1; b[(H - 1) * W + x] = 1; } for (let y = 0; y < H; y++) { b[y * W] = 1; b[y * W + W - 1] = 1; } return b; };
/** D-222: pixels of `m` connected (4-way, through pixels where `pass` holds) to any seed pixel where `pass` holds. */
function reachFrom(seed, pass, m) { const o = new Uint8Array(N), st = []; for (let i = 0; i < N; i++) if (seed[i] && pass(i)) { o[i] = 1; st.push(i); }
  while (st.length) { const i = st.pop(), x = i % W; for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < N && !o[j] && Math.abs((j % W) - x) <= 1 && pass(j)) { o[j] = 1; st.push(j); } }
  return Mo.and(o, m); }

/** The layering proof with Northstar's D-197 defaults over the runtime body (base garments removed). */
export const FABRIC_BAND_PX = 4;   // the base shorts' measured excess over the bare thigh directly below their hem (D-204)
/** D-213: the R3 head as the runtime composes it over a body that owns its neck — D-201's seam rule: the head's leftover collar
 *  edge (neckEdgeMask) is not drawn where the body is opaque; everywhere else the head is unchanged. */
export function runtimeHead(w, body) { const h = new Uint8ClampedArray(w.head), edge = neckEdgeMask(w); for (let i = 0; i < N; i++) if (edge[i] && body[i * 4 + 3] > 0) h[i * 4 + 3] = 0; return h; }
export function layerProof(w, R, Z = zones(w), it = {}, { order = "contract", sep = null, headSeam = "plain", hide = null, enclosure = "canvas" } = {}) {
  const L = w.base.layers, { lab } = sep || separateBase(R, Z), rb = runtimeBody(w, R, lab), I = { shoes: L.shoes, pants: L.pants, topBody: L["top-body"], sleeves: L["top-sleeves"], ...it };
  // D-218: body VISIBILITY — a worn item may hide body pixels by a declared covering rule (closed footwear hides the foot inside its
  // own outline); hidden pixels are simply not drawn this time; C itself is never changed
  const body = hide ? rb.body.map((v, k) => (k % 4 === 3 && hide[k >> 2] ? 0 : v)) : rb.body, arms = hide ? rb.arms.map((v, k) => (k % 4 === 3 && hide[k >> 2] ? 0 : v)) : rb.arms;
  // the contract order (D-198 contract v2): body · shoes · bottoms · top-body · ARMS · top-sleeves · head. "arms-under" and (D-210)
  // "bottoms-over-top" exist only as control stimuli: a composer that puts the arms under the top's body, or the bottoms over the
  // top, must be caught by the order checks. `stack` names the composed layers in the order used, bottom first.
  // headSeam "plain" (v3): the whole R3 head over the body — its leftover collar edge drew a pale line across C's neck (D-213);
  // "d201": the head as the runtime composes it (runtimeHead)
  const named = { body, shoes: I.shoes, pants: I.pants, topBody: I.topBody, arms, sleeves: I.sleeves, head: headSeam === "d201" ? runtimeHead(w, body) : w.head };
  const orderNames = order === "arms-under" ? ["body", "arms", "shoes", "pants", "topBody", "sleeves", "head"] : order === "bottoms-over-top" ? ["body", "shoes", "topBody", "pants", "arms", "sleeves", "head"] : ["body", "shoes", "pants", "topBody", "arms", "sleeves", "head"];
  const stack = orderNames.map((n) => [n, named[n]]), dressedRuntime = NL.overStack(stack.map(([, L]) => L));
  const items = NL.overStack([I.shoes, I.pants, I.topBody, I.sleeves]), covered = (i) => items[i * 4 + 3] >= 128;
  const base = new Uint8Array(N); for (let i = 0; i < N; i++) if (lab[i]) base[i] = 1;
  // only base pixels that were VISIBLE (alpha ≥ 128) can leave a hole; a semi-transparent rim pixel vanishes with its garment
  const uncoveredBase = new Uint8Array(N); for (let i = 0; i < N; i++) if (base[i] && R[i * 4 + 3] >= 128 && !covered(i)) uncoveredBase[i] = 1;
  // D-222 enclosure "c-exterior": an open base pixel that reaches C's OWN exterior (the gap between an arm and the torso) through
  // transparent pixels is the figure's outline, not a hole — a flared skirt reaching the hand closes that gap from below, and the
  // canvas-border test (v3 … d221, "canvas") then counted C's 1 px side seam beside it as enclosed. A hole inside a garment never
  // touches C's exterior, so it stays enclosed.
  const pass = (i) => dressedRuntime[i * 4 + 3] < 128;
  const transparentOk = enclosure === "c-exterior" ? reachFrom(Mo.or(borderMask(), outsideExterior(R)), pass, uncoveredBase) : outsideConnected(uncoveredBase, pass), enclosed = Mo.and(uncoveredBase, Mo.not(transparentOk));
  // D-205: also every transparent pixel inside the filled silhouette of the garments (items ∪ base) — a hole in a garment itself
  const garmentArea = Mo.or(Mo.toMask(items, 128), base), inside = Mo.not(outsideConnected(new Uint8Array(N).fill(1), (i) => !garmentArea[i]));
  for (let i = 441 * W; i < N; i++) if (inside[i] && !garmentArea[i] && dressedRuntime[i * 4 + 3] < 128) enclosed[i] = 1;
  // cut skin: visible runtime skin that borders a removed base pixel the items leave open — an edge with no painted contour
  const cutSkin = new Uint8Array(N); for (let i = W; i < N - W; i++) { if (!(body[i * 4 + 3] >= 128 || arms[i * 4 + 3] >= 128) || covered(i) || classify(R, i) !== "skin") continue; if ([i - 1, i + 1, i - W, i + W].some((j) => uncoveredBase[j])) cutSkin[i] = 1; }
  // body wider than an item drawn for Northstar: visible skin directly outside the jeans' outline (≤ 3 px) in the leg rows
  // any visible body pixel (skin or its painted contour) within 6 px OUTSIDE an item's opaque silhouette: the body is wider there
  const itemM = Mo.toMask(items, 128), ring = Mo.and(Mo.dilate(itemM, 6), Mo.not(itemM)), slivers = new Uint8Array(N);
  // only from the waistband to the shoe tops: there the item is meant to hide the body (the neck, the shoulders above a collar and
  // the arms are legitimately outside a tee; the feet are inside the shoes)
  for (let i = w.anchors.waistbandY * W; i < Math.min(w.anchors.shoeTopY.left, w.anchors.shoeTopY.right) * W; i++) if (ring[i] && body[i * 4 + 3] >= 128) slivers[i] = 1;
  // open base pixels deeper than the fabric band inside the candidate's outer silhouette: there the body had to be, and no item
  // and no skin is there — missing material (a cropped item), not fabric that may vanish
  const exterior = outsideConnected(new Uint8Array(N).fill(1), (i) => R[i * 4 + 3] < 128), deep = Mo.and(uncoveredBase, Mo.not(Mo.dilate(exterior, FABRIC_BAND_PX)));
  // the order check: where an arm lies over the top's body, the ARM must be what is seen (arms ∩ top-body, arm pixel visible)
  let armOverTop = 0, armShown = 0; for (let i = 0; i < N; i++) if (arms[i * 4 + 3] >= 250 && I.topBody[i * 4 + 3] >= 128) { armOverTop++; if ([0, 1, 2].every((c) => Math.abs(dressedRuntime[i * 4 + c] - arms[i * 4 + c]) <= 2)) armShown++; }
  return { lab, body, arms, dressedRuntime, stack, uncoveredBase, transparentOk, enclosed, cutSkin, slivers, deep, items, I, order: { armOverTopPx: armOverTop, armShownShare: armOverTop ? +(armShown / armOverTop).toFixed(4) : 1 } };
}

/** PROPOSED BF15r (D-204, not adopted): the dress-back on the RUNTIME body, as D-198 defines it — base garments empty under the
 *  item. (a) no enclosed hole; (b) ≤ 10 px exposed cut skin (antialias); (c) no open base pixel deeper than the fabric band —
 *  otherwise body material is missing; (d) the silhouette below the seam within IoU 0.985 of Northstar's; and, reported for the
 *  owner's threshold decision, (e) visible body outside the items' silhouette from the waistband to the shoe tops. */
export function bf15r(w, P, { silhouette = true } = {}) { const c = (m) => { let n = 0; for (let i = 0; i < N; i++) if (m[i]) n++; return n; };
  let inter = 0, uni = 0; for (let i = 441 * W; i < N; i++) { const a = P.dressedRuntime[i * 4 + 3] >= 128, b = w.fg.master[i * 4 + 3] >= 128; if (a && b) inter++; if (a || b) uni++; }
  const v = { enclosedHolePx: c(P.enclosed), exposedCutSkinPx: c(P.cutSkin), deepOpenBasePx: c(P.deep), silhouetteIoU: +(inter / uni).toFixed(4), bodyOutsideItemsPx: c(P.slivers) };
  return { ok: v.enclosedHolePx === 0 && v.exposedCutSkinPx <= 10 && v.deepOpenBasePx === 0 && (!silhouette || v.silhouetteIoU >= 0.985), value: v, status: "PROPOSED — not adopted; (e) bodyOutsideItemsPx has no threshold until the owner decides" }; }
/** Control items for BF15r, cut from a figure's OWN base garments (never painted): items covering exactly the base shape (the
 *  contract's minimum items — must pass), the same with a 60×60 px hole in the bottoms (an enclosed hole — must fail), and with
 *  the bottoms cut off 60 px above their hem (missing material — must fail). Northstar itself is no positive case for a runtime
 *  check: it has no body under its clothes. */
export function bf15rControlItems(w, R, Z = zones(w)) {
  const { lab } = separateBase(R, Z), top = new Uint8ClampedArray(N * 4), bot = new Uint8ClampedArray(N * 4), none = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < N; i++) { if (lab[i] === 1) top.set(R.subarray(i * 4, i * 4 + 4), i * 4); if (lab[i] === 2) bot.set(R.subarray(i * 4, i * 4 + 4), i * 4); }
  let y0 = H, y1 = 0, x0 = W, x1 = 0; for (let i = 0; i < N; i++) if (lab[i] === 2) { const x = i % W, y = (i / W) | 0; y0 = Math.min(y0, y); y1 = Math.max(y1, y); x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  const hole = new Uint8ClampedArray(bot), cropped = new Uint8ClampedArray(bot), cy = (y0 + y1) >> 1, cx = Math.round((x0 * 3 + x1) / 4);
  for (let y = cy - 30; y < cy + 30; y++) for (let x = cx - 30; x < cx + 30; x++) hole[(y * W + x) * 4 + 3] = 0;
  for (let i = (y1 - 60) * W; i < N; i++) cropped[i * 4 + 3] = 0;
  const base = { shoes: w.base.layers.shoes, topBody: top, sleeves: none };
  return { "exact-base-items": { expect: true, items: { ...base, pants: bot } }, "bottoms-with-hole": { expect: false, items: { ...base, pants: hole } }, "bottoms-cut-60-above-hem": { expect: false, items: { ...base, pants: cropped } } };
}

/** The planned MINIMUM areas of the contract v2 forms on this base (masks, not items): a sleeveless top = the base top + 1 px,
 *  shorts = the base shorts + 1 px, sandals = no coverage (the bare feet stay visible; soles on the ground line ± 4). */
export function minimumAreas(lab) { const t = new Uint8Array(N), b = new Uint8Array(N); for (let i = 0; i < N; i++) { if (lab[i] === 1) t[i] = 1; if (lab[i] === 2) b[i] = 1; } return { sleevelessTop: Mo.dilate(t, 1), shorts: Mo.dilate(b, 1) }; }

export function layersReport(buf, OUT, spec = loadSpec()) {
  if (!isOutsideRepo(OUT)) throw new Error("refusing to write layering material inside the repository (D-127 §2): " + OUT);
  const img = decodePng(buf); if (!img.ok || !img.px || img.px.length !== N * 4) throw new Error("not a 1024×1536 RGBA PNG");
  const raw = Uint8ClampedArray.from(img.px), w = WR.buildWardrobe(), Z = zones(w, spec), reg = register(raw, w.fg.master, spec); if (!reg.ok) throw new Error("not registered");
  const R = dustCleaned(shift(raw, reg.dx, reg.dy)), P = layerProof(w, R, Z), L = w.base.layers, files = {};
  const save = (n, im, what) => { const b = encodePng(im.w, im.h, im.px); writeFileSync(join(OUT, n), b); files[n] = { sha256: sha(b), w: im.w, h: im.h, what }; };
  const bg = [236, 233, 226], FIGB = [250, 0, 774, 1536], half = (Q, c = bg) => down(flat(Q, c), 262, 768, FIGB), checker = (Q) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0, c = ((x >> 4) + (y >> 4)) & 1 ? 205 : 245, a = Q[i * 4 + 3] / 255; for (let k = 0; k < 3; k++) o[i * 4 + k] = Math.round(Q[i * 4 + k] * a + c * (1 - a)); o[i * 4 + 3] = 255; } return o; };
  const both = NL.overStack([P.body, P.arms, w.head]);
  save("l01-runtime-body.png", grid([down(checker(both), 262, 768, FIGB), half(both)], 2), "the runtime body: base top and base shorts removed (empty, checkerboard left), with the R3 head; nothing painted, no skin removed");
  const masks = new Uint8ClampedArray(N * 4).fill(255); for (let i = 0; i < N; i++) { if (P.lab[i] === 1) masks.set([200, 60, 170, 255], i * 4); else if (P.lab[i] === 2) masks.set([0, 170, 200, 255], i * 4); else if (P.body[i * 4 + 3] >= 128) masks.set([250, 205, 160, 255], i * 4); else if (P.arms[i * 4 + 3] >= 128) masks.set([240, 170, 110, 255], i * 4); }
  save("l02-layer-masks.png", half(masks), "layer masks: base top (magenta) and base shorts (cyan) — authoring only, removed at runtime; body (light skin), arms with hands (darker skin)");
  const itemMask = new Uint8ClampedArray(N * 4).fill(255), it = [[L.shoes, [120, 120, 120]], [L.pants, [40, 80, 170]], [L["top-body"], [150, 150, 165]], [L["top-sleeves"], [190, 190, 205]]];
  for (const [Ly, c] of it) for (let i = 0; i < N; i++) if (Ly[i * 4 + 3] >= 128) itemMask.set([...c, 255], i * 4);
  save("l03-item-masks.png", half(itemMask), "item layer masks: D-197's defaults — sneakers, jeans, tee body (behind the arms), sleeves (over the arms)");
  const withBase = NL.overStack([recompose(w, R, "generated").body, L.shoes, L.pants, L["top-body"], L["top-sleeves"], w.head]);
  save("l04-dressed-runtime-vs-bf15.png", grid([half(P.dressedRuntime), half(withBase), half(NL.overStack([w.body, w.head]))], 3), "dressed: the runtime body WITHOUT base garments (left) · BF15's construction, defaults over the candidate WITH its base garments (middle) · the original Northstar (right)");
  let U = flat(P.dressedRuntime, bg); U = tint(U, P.transparentOk, [0, 200, 120], 0.8); U = tint(U, P.enclosed, [255, 0, 0], 0.9); U = tint(U, Mo.dilate(P.cutSkin, 1), [255, 160, 0], 0.9); U = tint(U, Mo.dilate(P.slivers, 1), [230, 0, 200], 0.9);
  save("l05-uncovered-hips-x2.png", crop(U, [300, 760, 724, 1060], 2), "hips and thighs ×2, dressed runtime: green = base pixels the jeans leave open that simply become background; red = enclosed holes; orange = exposed cut skin; magenta = visible body (skin or its contour) outside an item's silhouette");
  save("l06-uncovered-full.png", half(U), "the same over the whole figure");
  const MA = minimumAreas(P.lab); let Mn = flat(both, bg); Mn = tint(Mn, MA.sleevelessTop, [200, 60, 170], 0.55); Mn = outline(Mn, MA.sleevelessTop, [120, 0, 90]); Mn = tint(Mn, MA.shorts, [0, 170, 200], 0.55); Mn = outline(Mn, MA.shorts, [0, 90, 120]);
  const A = w.anchors; for (let x = 330; x < 694; x++) for (const y of [A.groundY - spec.gates.groundTolPx, A.groundY + spec.gates.groundTolPx]) Mn.set([30, 160, 60, 255], (y * W + x) * 4);
  save("l07-minimum-areas.png", half(Mn), "planned minimum areas on the runtime body (masks only — no GPT item exists or was tested): sleeveless top (magenta), shorts (cyan), sandals: no coverage, soles within the green ground band");
  const count = (m) => { let n = 0; for (let i = 0; i < N; i++) if (m[i]) n++; return n; };
  let tp = 0, sp = 0; for (let i = 0; i < N; i++) { if (P.lab[i] === 1) tp++; if (P.lab[i] === 2) sp++; }
  let inter = 0, uni = 0; for (let i = 441 * W; i < N; i++) { const a = P.dressedRuntime[i * 4 + 3] >= 128, b = w.fg.master[i * 4 + 3] >= 128; if (a && b) inter++; if (a || b) uni++; }
  // BF9: the waist seam, where the base top meets the base shorts
  let Wst = flat(R, bg); const tm = new Uint8Array(N), sm = new Uint8Array(N); for (let i = 0; i < N; i++) { if (P.lab[i] === 1) tm[i] = 1; if (P.lab[i] === 2) sm[i] = 1; }
  Wst = outline(Wst, tm, [200, 60, 170]); Wst = outline(Wst, sm, [0, 170, 200]); let gapSkin = 0; for (let x = A.torsoX[0] + 12; x <= A.torsoX[1] - 12; x++) { let lo = -1, hi = -1; for (let y = 700; y < 860; y++) { const i = y * W + x; if (tm[i]) lo = y; if (sm[i] && hi < 0) hi = y; } for (let y = lo + 1; y < hi; y++) if (classify(R, y * W + x) === "skin") { gapSkin++; Wst.set([255, 0, 0, 255], (y * W + x) * 4); } }
  for (const y of [spec.targets.baseTopHemY[0]]) for (let x = 380; x < 644; x += 2) Wst.set([30, 160, 60, 255], (y * W + x) * 4);
  save("l08-waist-seam-x3.png", crop(Wst, [380, 740, 644, 830], 3), "BF9: the waist ×3 — base top outline (magenta) meets the base shorts outline (cyan); red would be skin between them (none); the dotted green line is the hem limit y " + spec.targets.baseTopHemY[0]);
  const report = { decision: "D-204", raw: { sha256: sha(buf) }, registration: reg, note: "Runtime layering proof (D-198's model: base garments empty under the item). Derived only: the established dust cleanup; nothing painted, deformed or cut from the skin. The binding results (D-203) are unchanged.",
    basePx: { top: tp, shorts: sp }, dressedWithNorthstarDefaults: { uncoveredBasePx: count(P.uncoveredBase), becomesBackgroundPx: count(P.transparentOk), enclosedHolePx: count(P.enclosed), exposedCutSkinPx: count(P.cutSkin), bodyOutsideItemsPx: count(P.slivers), bodyOutsideItemsRows: (() => { const rows = []; for (let i = 0; i < N; i++) if (P.slivers[i]) rows.push((i / W) | 0); return rows.length ? [Math.min(...rows), Math.max(...rows)] : null; })(), bodyOutsideItemsMaxWidthPx: (() => { let m = 0; for (let y = 0; y < H; y++) { let run = 0; for (let x = 0; x < W; x++) { if (P.slivers[y * W + x]) { run++; m = Math.max(m, run); } else run = 0; } } return m; })(), silhouetteIoUBelowSeam: +(inter / uni).toFixed(4) },
    minimumAreasPx: { sleevelessTop: count(MA.sleevelessTop), shorts: count(MA.shorts), sandals: 0 }, waistSeam: { skinBetweenTopAndShortsPx: gapSkin },
    proposedBF15r: bf15r(w, P), bf15rControlsOnThisCandidate: Object.fromEntries(Object.entries(bf15rControlItems(w, R, Z)).map(([k, c]) => { const q = bf15r(w, layerProof(w, R, Z, c.items), { silhouette: false }); return [k, { expect: c.expect, ok: q.ok, value: q.value }]; })), files };
  writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2) + "\n");
  return report;
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
export function review(buf, OUT, spec = loadSpec(), opts = {}) {
  if (!isOutsideRepo(OUT)) throw new Error("refusing to write review material inside the repository (D-127 §2): " + OUT);
  const img = decodePng(buf), raw = img.ok && img.px && img.px.length === N * 4 ? Uint8ClampedArray.from(img.px) : null;
  const w = WR.buildWardrobe(), Z = zones(w, spec), files = {};
  const save = (n, im, what) => { const b = encodePng(im.w, im.h, im.px); writeFileSync(join(OUT, n), b); files[n] = { sha256: sha(b), w: im.w, h: im.h, what }; };
  const report = { decision: "D-199", raw: { sha256: sha(buf), bytes: buf.length, decodedAsRgba1024x1536: !!raw, header: img.header || null }, thresholds: spec.gates, targets: spec.targets,
    note: "BF1–BF15 are measurements. They are never a visual approval: V1–V8 are the owner's. The raw image is unchanged; nothing was painted or retouched." };
  if (!raw) { report.ok = false; report.checks = [{ id: "BF1-FORMAT", ok: false, value: { header: img.header || null, error: img.error || "not 8-bit RGBA" } }]; writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2) + "\n"); return report; }
  const gateSet = opts.gateSet || "v2", r = checkBaseFigure(w, raw, Z, spec, "generated", gateSet);
  report.gateSet = GATE_SETS[gateSet]; report.ok = r.ok; report.registration = r.registration; report.checks = r.checks.map(({ id, ok, value, what }) => ({ id, ok, value, what }));
  report.seamRule = SEAM_RULES.generated;
  if (gateSet === "v2") { const v1 = checkBaseFigure(w, raw, Z, spec, "generated", "v1"); report.v1ForComparison = { note: "the superseded D-198 gate set, for comparison only — not binding", ok: v1.ok, failed: v1.checks.filter((c) => !c.ok).map((c) => c.id) }; }
  const bg = [236, 233, 226], FIGB = [250, 0, 774, 1536], half = (P) => down(flat(P, bg), 262, 768, FIGB);
  save("r01-raw-as-received.png", half(raw), "the raw result, unchanged, flattened on a neutral background at 1/2 size (the raw file itself is kept untouched)");
  if (r.figure) {
    // derived post-processing allowed by D-202: the established dust cleanup, then the D-201 seam composition. The raw file is untouched.
    const cleaned = dustCleaned(r.registered), derived = recompose(w, cleaned, "generated");
    report.derived = { dustCleanup: "cleanAlpha (alpha < 24 AND orphan-soft)", pixelsCleared: (() => { let n = 0; for (let i = 0; i < N; i++) if (r.registered[i * 4 + 3] && !cleaned[i * 4 + 3]) n++; return n; })(), seam: SEAM_RULES.generated };
    r.figure = derived.figure; r.body = derived.body;
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
    if (opts.compare) {
      const ci = decodePng(opts.compare), craw = ci.ok && ci.px && ci.px.length === N * 4 ? Uint8ClampedArray.from(ci.px) : null;
      if (craw) {
        const creg = register(craw, w.fg.master, spec), cR = shift(craw, creg.dx, creg.dy), cfig = recompose(w, dustCleaned(cR), "generated").figure;
        const cdressed = NL.overStack([recompose(w, dustCleaned(cR), "generated").body, w.base.layers.shoes, w.base.layers.pants, w.base.layers["top-body"], w.base.layers["top-sleeves"], w.head]);
        const CF = flat(cfig, bg), x2c = (box) => crop(CF, box, 2);
        save("c01-compare-full.png", grid([half(cfig), half(fig)], 2), "the earlier attempt (left) beside this one (right), both with the D-201 seam and the dust cleanup");
        save("c02-compare-hips-x2.png", grid([x2c([300, 760, 724, 980]), x2([300, 760, 724, 980])], 1), "hips ×2: earlier attempt (top) and this one (bottom)");
        save("c03-compare-dress-back.png", grid([half(cdressed), half(dressed), half(ns)], 3), "dressed back: earlier attempt, this one, the original Northstar");
        report.compare = { sha256: sha(opts.compare) };
      }
    }
  }
  report.files = files; writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2) + "\n");
  return report;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const a = process.argv.slice(2), oi = a.indexOf("--out"), ci = a.indexOf("--check"), ri = a.indexOf("--review"), di = a.indexOf("--diagnose"), li = a.indexOf("--layers");
  if (li >= 0) {
    if (!a[li + 1] || oi < 0 || !a[oi + 1]) { console.error("usage: --layers <candidate.png> --out <empty dir outside both clones>"); process.exit(1); }
    const OUT = resolve(a[oi + 1]);
    if (!isOutsideRepo(OUT)) { console.error("REFUSED: --out is inside the repository; a base figure is never written there (D-127 §2)"); process.exit(1); }
    if (existsSync(OUT) && readdirSync(OUT).length) { console.error("--out must be empty"); process.exit(1); } mkdirSync(OUT, { recursive: true });
    const r = layersReport(readFileSync(resolve(a[li + 1])), OUT); console.log(JSON.stringify({ basePx: r.basePx, dressed: r.dressedWithNorthstarDefaults, minimumAreasPx: r.minimumAreasPx }, null, 2)); process.exit(0);
  }
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
    const ki = a.indexOf("--compare"), r = review(readFileSync(resolve(a[ri + 1])), OUT, loadSpec(), { gateSet: a.includes("--gates=v1") ? "v1" : "v2", compare: ki >= 0 && a[ki + 1] ? readFileSync(resolve(a[ki + 1])) : null });
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
