// NORTHSTAR WARDROBE (D-197) — the fixed fitting system for generated clothing items on ONE Northstar v2 body and pose.
//
// The base is NOT a bare body. Northstar v2's own painted outfit (tee, jeans, sneakers) is decomposed into the DEFAULT item of
// three mandatory categories; the base figure keeps only what is never covered: head (the D-194 R3 head stack), arms below the
// sleeves and hands. An item REPLACES its category's default: it must cover the default garment's region completely and may
// draw only inside the category's allowed envelope, never in its protect zone. So no body is ever shown under clothing and no
// unclothed figure exists anywhere (the H1 ban and D-127 §2 stand). Garments that would reveal skin the base does not have
// (sleeveless, shorts, skirts, crop tops, sandals, deep necklines) are OUT OF SCOPE until owner-approved limb material exists.
//
// Fixed coordinates: the Northstar v2 master canvas, 1024x1536, unchanged. Every item is a full-canvas RGBA layer set in these
// coordinates; the app never places an item individually. Tools — not prompts — guarantee the fit: registration, extraction,
// layer split, gates, reproducible export. Review material only: no image call, no runtime change, R3 stays default OFF.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as NL from "./r3-northstar-layers.mjs";
import * as FG from "./r3-northstar-figure.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DECISION = "D-197";
export const CONTRACT_FILE = "tools/avatar/fixtures/northstar-wardrobe/contract-v1.json";
export const W = 1024, H = 1536, N = W * H;
const sha = (b) => createHash("sha256").update(b).digest("hex");
export const loadContract = () => JSON.parse(readFileSync(join(REPO, ...CONTRACT_FILE.split("/")), "utf8"));

// ── layer stack (bottom → top). Back cosmetics and auras keep their own slots below everything. ────────────────────────
// An item may own several of these layers (a top owns top-body AND top-sleeves) because the arms lie between them.
export const STACK = Object.freeze(["shoes", "pants", "top-body", "arms", "top-sleeves", "hands", "head", "hair"]);
export const CATEGORY_LAYERS = Object.freeze({ top: ["top-body", "top-sleeves"], pants: ["pants"], shoes: ["shoes"] });
export const BASE_LAYERS = Object.freeze(["arms", "hands"]);
const Z = Object.fromEntries(STACK.map((k, i) => [k, i]));

// ── colour classes on the master (painted cartoon: dark ink, peach skin, blue denim, neutral grey cotton/rubber) ───────
const hsv = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0; if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; } return [h, mx ? d / mx : 0, mx / 255]; };
export function colourClass(r, g, b) { const [h, s, v] = hsv(r, g, b); if (v < 0.22) return "ink"; if (h >= 15 && h <= 45 && s > 0.25 && v > 0.45) return "skin"; if (h >= 200 && h <= 240 && s > 0.3) return "denim"; if (s < 0.2) return "grey"; return "other"; }

/** Decompose the D-194 reference body (master minus the head, below y 440) into the stack's body layers. Every body pixel goes
 *  to exactly one layer; ink and antialiased pixels go to the HIGHEST layer among the nearest classified pixels, so a seam's
 *  outline belongs to the garment drawn on top (the tee hem to the top, a sleeve cuff to the sleeve, the hand outline to the
 *  hand, the jeans hem to the pants). */
export function decompose(body, spec) {
  const lab = new Int8Array(N).fill(-1), core = new Uint8Array(N);
  const id = (k) => Z[k];
  // 1. core classes
  for (let i = 0; i < N; i++) {
    if (body[i * 4 + 3] === 0) continue; const y = (i / W) | 0;
    const c = body[i * 4 + 3] >= 128 ? colourClass(body[i * 4], body[i * 4 + 1], body[i * 4 + 2]) : "edge";
    if (c === "denim") { lab[i] = id("pants"); core[i] = 1; }
    else if (c === "grey") { lab[i] = y >= spec.shoesFromY ? id("shoes") : id("top-body"); core[i] = 1; }
    else if (c === "skin") { lab[i] = id("arms"); core[i] = 1; }
  }
  // 1b. a class only counts in its LARGE connected components (≥ spec.minComponentPx): stray bluish shading in the tee, grey
  //     glints on the skin etc. are left to the ring assignment below instead of seeding a garment of their own
  const seen = new Uint8Array(N);
  for (let s = 0; s < N; s++) {
    if (lab[s] < 0 || seen[s]) continue; const k = lab[s], comp = [s], st = [s]; seen[s] = 1;
    while (st.length) { const i = st.pop(), x = i % W; for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < N && !seen[j] && lab[j] === k && Math.abs((j % W) - x) <= 1) { seen[j] = 1; st.push(j); comp.push(j); } }
    if (comp.length < (spec.minComponentPx ?? 400)) for (const i of comp) { lab[i] = -1; core[i] = 0; }
  }
  // 2. skin below the wrist line is hand; grey outside the torso columns above the sleeve end is sleeve
  for (let i = 0; i < N; i++) {
    if (lab[i] < 0) continue; const x = i % W, y = (i / W) | 0;
    if (lab[i] === id("arms") && y >= (x < W / 2 ? spec.wristY.left : spec.wristY.right)) lab[i] = id("hands");
    if (lab[i] === id("top-body") && (x < spec.torsoX[0] || x > spec.torsoX[1])) lab[i] = id("top-sleeves");
  }
  // 3. multi-source BFS for ink / antialias / other: per distance ring, the highest layer among already-labelled neighbours
  let frontier = []; for (let i = 0; i < N; i++) if (lab[i] >= 0) frontier.push(i);
  while (frontier.length) {
    const next = new Map();
    for (const i of frontier) { const x = i % W; for (const j of [i - 1, i + 1, i - W, i + W, i - W - 1, i - W + 1, i + W - 1, i + W + 1]) { if (j < 0 || j >= N || Math.abs((j % W) - x) > 1 || lab[j] >= 0 || body[j * 4 + 3] === 0) continue; next.set(j, Math.max(next.get(j) ?? -1, lab[i])); } }
    frontier = []; for (const [j, z] of next) { lab[j] = z; frontier.push(j); }
  }
  const layers = Object.fromEntries(["shoes", "pants", "top-body", "arms", "top-sleeves", "hands"].map((k) => [k, new Uint8ClampedArray(N * 4)]));
  for (let i = 0; i < N; i++) if (lab[i] >= 0) layers[STACK[lab[i]]].set(body.subarray(i * 4, i * 4 + 4), i * 4);
  return { layers, label: lab, core };
}

/** Measure the split lines on the master (deterministic; pinned in the contract). */
export function measureSplits(body) {
  const cls = (i) => (body[i * 4 + 3] >= 128 ? colourClass(body[i * 4], body[i * 4 + 1], body[i * 4 + 2]) : null);
  // torso columns: the central grey run, rows 690–790 (below the armpits, where the arms hang free), widest extent
  let tl = W, tr = 0; for (let y = 690; y <= 790; y += 2) { let best = null, run = null; for (let x = 300; x < 730; x++) { const g = cls(y * W + x) === "grey"; if (g && !run) run = [x, x]; if (g) run[1] = x; if ((!g || x === 729) && run) { if (!best || run[1] - run[0] > best[1] - best[0]) best = run; run = null; } } if (best) { tl = Math.min(tl, best[0]); tr = Math.max(tr, best[1]); } }
  // wrist: the narrowest skin run per side between y 760 and 880
  const wrist = (side) => { let bestY = 0, bestW = 1e9; for (let y = 760; y <= 880; y++) { let n = 0; for (let x = side === "left" ? 280 : W / 2; x < (side === "left" ? W / 2 : 750); x++) if (cls(y * W + x) === "skin") n++; if (n > 0 && n < bestW) { bestW = n; bestY = y; } } return bestY; };
  // shoes: the first row (from the bottom up) where grey appears below the denim
  let shoesFromY = H; for (let y = H - 1; y > 1200; y--) { let denim = 0, grey = 0; for (let x = 300; x < 730; x++) { const c = cls(y * W + x); if (c === "denim") denim++; if (c === "grey") grey++; } if (denim > 0 && grey === 0) { shoesFromY = y + 1; break; } }
  return { torsoX: [tl, tr], wristY: { left: wrist("left"), right: wrist("right") }, shoesFromY };
}

const bboxOf = (P) => { let x0 = W, x1 = -1, y0 = H, y1 = -1; for (let i = 0; i < N; i++) if (P[i * 4 + 3] >= 128) { const x = i % W, y = (i / W) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return { x0, x1, y0, y1 }; };
const rowSpan = (P, y, xa = 0, xb = W) => { let a = -1, b = -1; for (let x = xa; x < xb; x++) if (P[(y * W + x) * 4 + 3] >= 128) { if (a < 0) a = x; b = x; } return [a, b]; };
/** The body anchors in master coordinates (neck, shoulders, sleeves, wrists, waist, crotch, ankles, ground). */
export function anchors(base, splits) {
  const top = NLmerge(base.layers["top-body"], base.layers["top-sleeves"]), pants = base.layers.pants, shoes = base.layers.shoes, cx = (splits.torsoX[0] + splits.torsoX[1]) / 2;
  const tb = bboxOf(top), pb = bboxOf(pants), sb = bboxOf(shoes), sl = bboxOf(base.layers["top-sleeves"]);
  // crotch: below the first pants row on the centre column, the first row where the centre column is empty (the legs part)
  let onCentre = -1; for (let y = pb.y0; y < pb.y1; y++) if (pants[(y * W + Math.round(cx)) * 4 + 3] >= 128) { onCentre = y; break; }
  let crotch = pb.y1; for (let y = Math.max(onCentre, pb.y0); y < pb.y1; y++) if (pants[(y * W + Math.round(cx)) * 4 + 3] < 128) { crotch = y; break; }
  let hem = tb.y1; for (let y = tb.y1; y > tb.y0; y--) if (top[(y * W + Math.round(cx)) * 4 + 3] >= 128) { hem = y; break; }
  let collar = tb.y0; for (let y = tb.y0; y < tb.y1; y++) if (top[(y * W + Math.round(cx)) * 4 + 3] >= 128) { collar = y; break; }
  const legBottom = (side) => { let yb = 0; for (let i = 0; i < N; i++) if (pants[i * 4 + 3] >= 128 && ((i % W) < cx) === (side === "left")) yb = Math.max(yb, (i / W) | 0); return yb; };
  const shoeTop = (side) => { let yt = H; for (let i = 0; i < N; i++) if (shoes[i * 4 + 3] >= 128 && ((i % W) < cx) === (side === "left")) yt = Math.min(yt, (i / W) | 0); return yt; };
  const sleeveEnd = (side) => { let yb = 0; const S = base.layers["top-sleeves"]; for (let i = 0; i < N; i++) if (S[i * 4 + 3] >= 128 && ((i % W) < cx) === (side === "left")) yb = Math.max(yb, (i / W) | 0); return yb; };
  const [shL, shR] = rowSpan(top, Math.min(tb.y0 + 40, tb.y1));
  return {
    centreX: +cx.toFixed(1), neckSeamY: 440, collarY: collar, shoulder: { y: tb.y0 + 40, leftX: shL, rightX: shR }, torsoX: splits.torsoX,
    sleeveEndY: { left: sleeveEnd("left"), right: sleeveEnd("right") }, wristY: splits.wristY, waistHemY: hem, waistbandY: pb.y0, crotchY: crotch,
    ankleY: { left: legBottom("left"), right: legBottom("right") }, shoeTopY: { left: shoeTop("left"), right: shoeTop("right") }, groundY: sb.y1,
    bbox: { top: tb, sleeves: sl, pants: pb, shoes: sb },
  };
}
function NLmerge(...Ps) { return NL.overStack(Ps); }

// ── masks ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const toMask = (P, t = 1) => { const m = new Uint8Array(N); for (let i = 0; i < N; i++) if (P[i * 4 + 3] >= t) m[i] = 1; return m; };
const or = (...ms) => { const o = new Uint8Array(N); for (const m of ms) for (let i = 0; i < N; i++) if (m[i]) o[i] = 1; return o; };
const and = (a, b) => { const o = new Uint8Array(N); for (let i = 0; i < N; i++) if (a[i] && b[i]) o[i] = 1; return o; };
const not = (a) => { const o = new Uint8Array(N); for (let i = 0; i < N; i++) o[i] = a[i] ? 0 : 1; return o; };
const rect = (x0, y0, x1, y1) => { const m = new Uint8Array(N); for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) m[y * W + x] = 1; return m; };
const erode = (m, r) => not(NL.dilate(not(m), r));
export const maskOps = { toMask, or, and, not, rect, dilate: NL.dilate, erode };

/** Category templates (masks in master coordinates) from the base decomposition, the anchors and the contract's margins. */
export function templates(base, A, head, c) {
  // opaque = the default garment's FULLY opaque pixels (≥ 250); its antialiased rim is never something an item must reproduce
  const m = c.margins, L = base.layers, opaque = (k) => toMask(L[k], 250);
  const headM = toMask(head, 1), hands = toMask(L.hands, 1), arms = toMask(L.arms, 1);
  const T = {};
  // TOP — must cover the default tee (core, eroded so antialiased rims never fail it); may extend outward and down to the
  // crotch; never above the collar band into the head, never on the hands, never below the crotch line
  const tee = or(opaque("top-body"), opaque("top-sleeves")), sleeveZone = and(NL.dilate(or(opaque("top-sleeves"), arms), m.sleeveZonePx), rect(0, A.shoulder.y - 60, W, Math.max(A.wristY.left, A.wristY.right)));
  // (the head stack lies above the top, so a collar running under the neck is hidden by the head itself)
  const topAllowed = or(rect(A.bbox.top.x0 - m.topSidePx, A.bbox.top.y0 - m.collarUpPx, A.bbox.top.x1 + m.topSidePx, A.crotchY - m.topAboveCrotchPx), sleeveZone);
  T.top = { mustCover: erode(tee, m.coverErodePx), allowed: topAllowed, protect: or(NL.dilate(hands, m.handGuardPx), rect(0, A.crotchY - m.topAboveCrotchPx + 1, W, H), and(headM, rect(0, 0, W, A.bbox.top.y0 - m.collarUpPx - 1))), sleeveZone, layers: CATEGORY_LAYERS.top };
  // PANTS — must cover the default jeans; may widen and may cover the shoe tops down to above the ground band
  const jeans = opaque("pants");
  T.pants = { mustCover: erode(jeans, m.coverErodePx), allowed: rect(A.bbox.pants.x0 - m.pantsSidePx, A.waistbandY - m.waistUpPx, A.bbox.pants.x1 + m.pantsSidePx, A.groundY - m.groundBandPx), protect: or(rect(0, 0, W, A.waistbandY - m.waistUpPx - 1), rect(0, A.groundY - m.groundBandPx + 1, W, H)), layers: CATEGORY_LAYERS.pants };
  // SHOES — must cover the default sneakers; may grow outward and up (boot shafts run under the pants); must stand on the ground line
  const shoes = opaque("shoes");
  T.shoes = { mustCover: erode(shoes, m.coverErodePx), allowed: rect(A.bbox.shoes.x0 - m.shoeSidePx, Math.min(A.shoeTopY.left, A.shoeTopY.right) - m.shoeUpPx, A.bbox.shoes.x1 + m.shoeSidePx, A.groundY + m.groundTolPx), protect: rect(0, 0, W, Math.min(A.shoeTopY.left, A.shoeTopY.right) - m.shoeUpPx - 1), groundY: A.groundY, layers: CATEGORY_LAYERS.shoes };
  return T;
}

/** Split one category's single full-canvas garment image into its stack layers (a top: sleeves inside the sleeve zone go
 *  above the arms, the rest stays under them). */
export function splitItem(category, P, T) {
  if (category !== "top") return { [CATEGORY_LAYERS[category][0]]: P };
  const body = new Uint8ClampedArray(N * 4), sleeves = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < N; i++) { if (!P[i * 4 + 3]) continue; (T.top.sleeveZone[i] ? sleeves : body).set(P.subarray(i * 4, i * 4 + 4), i * 4); }
  return { "top-body": body, "top-sleeves": sleeves };
}

/** Contrast-independent sharpness of an RGBA image's fully opaque interior: mean |Laplacian| / mean |gradient|. */
export function sharpness(P) {
  const v = (k) => 0.299 * P[k * 4] + 0.587 * P[k * 4 + 1] + 0.114 * P[k * 4 + 2]; let lap = 0, grad = 0;
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) { const i = y * W + x; if (P[i * 4 + 3] < 250 || P[(i - 2) * 4 + 3] < 250 || P[(i + 2) * 4 + 3] < 250 || P[(i - 2 * W) * 4 + 3] < 250 || P[(i + 2 * W) * 4 + 3] < 250) continue;
    lap += Math.abs(4 * v(i) - v(i - 1) - v(i + 1) - v(i - W) - v(i + W)); grad += Math.abs(v(i + 1) - v(i - 1)) + Math.abs(v(i + W) - v(i - W)); }
  return grad > 0 ? lap / grad : 0;
}
/** A 3x3 box blur of an RGBA image (premultiplied) — the calibration stimulus a soft upscale stands for. */
export function blur3(P) { const o = new Uint8ClampedArray(N * 4); for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; let a = 0; const c = [0, 0, 0]; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const j = (i + dy * W + dx) * 4, aa = P[j + 3]; a += aa; for (let k = 0; k < 3; k++) c[k] += P[j + k] * aa; } if (a) { o[i * 4 + 3] = Math.round(a / 9); for (let k = 0; k < 3; k++) o[i * 4 + k] = Math.round(c[k] / a); } } return o; }

/** The item gates (per category). Returns { checks, ok }. */
export function checkItem(category, layers, T, c) {
  const t = T[category], g = c.gates, out = [], add = (id, ok, value, what) => out.push({ id, ok, value, what });
  const names = Object.keys(layers);
  add("I1-LAYERS", JSON.stringify(names) === JSON.stringify(t.layers) && names.every((k) => layers[k].length === N * 4), names, "exactly the category's layers, each a full 1024x1536 RGBA canvas");
  const all = NL.overStack(names.map((k) => layers[k])); let uncovered = 0, outside = 0, inProtect = 0, haze = 0, px = 0;
  for (let i = 0; i < N; i++) { const a = all[i * 4 + 3]; if (t.mustCover[i] && a < 250) uncovered++; if (!a) continue; px++; if (!t.allowed[i]) outside++; if (t.protect[i]) inProtect++; if (a < 128) haze++; }
  add("I2-COVERAGE", uncovered === 0, { uncoveredPx: uncovered }, "covers the default garment's core completely (opaque ≥ 250): no default garment and no body can show through");
  add("I3-ENVELOPE", outside === 0, { outsidePx: outside }, "draws only inside the category's allowed envelope");
  add("I4-PROTECT", inProtect === 0, { protectPx: inProtect }, "nothing in the protected zone (head and neck band, hands, other categories' exclusive bands)");
  add("I5-ALPHA", haze <= g.maxHazeShare * px, { semiTransparentPx: haze, share: +(haze / Math.max(1, px)).toFixed(4) }, "a clean cut-out: semi-transparent pixels only as a thin antialiased rim");
  // outline: share of silhouette boundary pixels that are dark ink (the Northstar painted style draws a dark contour)
  let edge = 0, dark = 0; for (let i = W; i < N - W; i++) { if (all[i * 4 + 3] < 200) continue; if ([i - 1, i + 1, i - W, i + W].some((j) => all[j * 4 + 3] < 64)) { edge++; const v = Math.max(all[i * 4], all[i * 4 + 1], all[i * 4 + 2]); if (v < 110) dark++; } }
  add("I6-OUTLINE", edge > 0 && dark / edge >= g.minOutlineShare, { edgePx: edge, darkShare: +(dark / Math.max(1, edge)).toFixed(3) }, "the silhouette carries the dark painted contour of the Northstar style");
  // sharpness, CONTRAST-INDEPENDENT: fine detail (|Laplacian|) relative to edge strength (|gradient|) inside the item. A soft
  // upscale or a blur lowers the ratio; a darker or paler recolour does not
  const sharp = sharpness(all);
  add("I7-SHARPNESS", sharp >= g.minSharpness, { lapToGrad: +sharp.toFixed(3) }, "painted detail is crisp, not a soft upscale (contrast-independent ratio)");
  if (category === "shoes") { const bb = bboxOf(all); add("I8-GROUND", Math.abs(bb.y1 - t.groundY) <= c.margins.groundTolPx, { soleY: bb.y1, groundY: t.groundY }, "the soles stand on the fixed ground line"); }
  if (category === "top") { const s = layers["top-sleeves"]; let bad = 0; for (let i = 0; i < N; i++) if (s[i * 4 + 3] && !t.sleeveZone[i]) bad++; add("I8-SLEEVE-SPLIT", bad === 0, { sleevePxOutsideZone: bad }, "sleeve pixels only in the sleeve zone (above the arms)"); }
  return { checks: out, ok: out.every((x) => x.ok) };
}

/** Flatten an RGBA image over a solid key colour (what the generator receives and returns: an opaque picture). */
export function onKey(P, key) { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) { const a = P[i * 4 + 3] / 255; for (let c = 0; c < 3; c++) o[i * 4 + c] = Math.round(P[i * 4 + c] * a + key[c] * (1 - a)); o[i * 4 + 3] = 255; } return o; }

/** The two reference pictures for generating ONE item of `category` (opaque, on the key):
 *   ref    — what the generator receives: the base figure wearing the category's DEFAULT, every OTHER category clipped to its
 *            guaranteed core (every item of that category covers at least this core, so whatever lies beyond it can become
 *            visible in some combination — the generator must see and paint it);
 *   behind — the same picture WITHOUT the category: everything that lies behind or above the item. */
export function referencePictures(w, category, c = w.contract) {
  const T = w.templates, others = {};
  for (const [cat, layers] of Object.entries(CATEGORY_LAYERS)) { if (cat === category) continue; const core = T[cat].mustCover, o = {}; for (const k of layers) { const P = new Uint8ClampedArray(w.base.layers[k]); for (let i = 0; i < N; i++) if (!core[i]) P[i * 4 + 3] = 0; o[k] = P; } others[cat] = o; }
  const empty = Object.fromEntries(CATEGORY_LAYERS[category].map((k) => [k, new Uint8ClampedArray(N * 4)]));
  return { others, ref: onKey(composeOutfit(w.base, w.head, others), c.extraction.key), behind: onKey(composeOutfit(w.base, w.head, { ...others, [category]: empty }), c.extraction.key) };
}

/** EXTRACTION — from ONE generated, opaque picture (referencePictures().ref with exactly this category repainted) to the
 *  category's item layers in master coordinates. The tool, not the prompt, guarantees the fit:
 *   1. registration: the protected figure must match `ref` within maxRegistrationDelta after the best integer shift ≤
 *      maxShiftPx — otherwise the output is REJECTED, never warped into place;
 *   2. the item = pixels inside the allowed envelope (outside the protect zone) where the picture differs from `behind`; what is
 *      hidden under another category's guaranteed core or under the base figure is never needed (it can never show);
 *   3. alpha at the item's rim by un-mixing against what lies behind it there (key, skin or another garment), so the painted
 *      antialiasing is kept rather than re-cut; the interior is opaque;
 *   4. the layer split (a top's sleeves above the arms). */
export function extractItem(category, out, ref, T, c, behind, key = c.extraction.key) {
  const e = c.extraction, t = T[category], prot = t.protect;
  // 1. registration over the protected figure pixels (subsampled), integer shifts
  let best = { dx: 0, dy: 0, d: Infinity };
  for (let dy = -e.maxShiftPx; dy <= e.maxShiftPx; dy++) for (let dx = -e.maxShiftPx; dx <= e.maxShiftPx; dx++) {
    let s = 0, n = 0; for (let y = 8; y < H - 8; y += 4) for (let x = 8; x < W - 8; x += 4) { const i = y * W + x; if (!prot[i]) continue; const r = i * 4, j = ((y + dy) * W + x + dx) * 4; if (Math.abs(ref[r] - key[0]) + Math.abs(ref[r + 1] - key[1]) + Math.abs(ref[r + 2] - key[2]) < 30) continue; s += Math.abs(out[j] - ref[r]) + Math.abs(out[j + 1] - ref[r + 1]) + Math.abs(out[j + 2] - ref[r + 2]); n += 3; }
    const d = n ? s / n : Infinity; if (d < best.d) best = { dx, dy, d };
  }
  const registration = { dx: best.dx, dy: best.dy, meanDelta: +best.d.toFixed(2), ok: best.d <= e.maxRegistrationDelta };
  if (!registration.ok) return { registration, layers: null };
  const at = (x, y) => ((Math.min(H - 1, Math.max(0, y + best.dy)) * W) + Math.min(W - 1, Math.max(0, x + best.dx))) * 4;
  // 2. item pixels: in the envelope, outside protect, different from what lies behind
  const diff = (j, i) => Math.max(Math.abs(out[j] - behind[i * 4]), Math.abs(out[j + 1] - behind[i * 4 + 1]), Math.abs(out[j + 2] - behind[i * 4 + 2]));
  const g = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (!t.allowed[i] || prot[i]) continue; if (diff(at(x, y), i) > e.changeTol) g[i] = 1; }
  // 3. colour and alpha: interior opaque; a rim pixel (a 4-neighbour outside the item) is un-mixed against what lies behind it
  const P = new Uint8ClampedArray(N * 4);
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
    const i = y * W + x; if (!g[i]) continue; const j = at(x, y);
    if (g[i - 1] && g[i + 1] && g[i - W] && g[i + W]) { P.set([out[j], out[j + 1], out[j + 2], 255], i * 4); continue; }
    const inner = [0, 0, 0]; let n = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const k = (y + dy) * W + x + dx; if (!g[k] || !g[k - 1] || !g[k + 1] || !g[k - W] || !g[k + W]) continue; const kk = at(k % W, (k / W) | 0); for (let cc = 0; cc < 3; cc++) inner[cc] += out[kk + cc]; n++; }
    if (!n) { P.set([out[j], out[j + 1], out[j + 2], 255], i * 4); continue; }
    const b = [behind[i * 4], behind[i * 4 + 1], behind[i * 4 + 2]], v = [0, 1, 2].map((cc) => inner[cc] / n - b[cc]), u = [0, 1, 2].map((cc) => out[j + cc] - b[cc]), vv = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
    const a = vv > 100 ? Math.max(0, Math.min(1, (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / vv)) : 1; if (a < 0.04) continue;
    P.set([...[0, 1, 2].map((cc) => Math.round(b[cc] + u[cc] / a)), Math.round(a * 255)], i * 4);
  }
  return { registration, layers: splitItem(category, P, T) };
}

/** Compose an outfit: default items for categories not worn, base arms/hands, the head stack on top. */
export function composeOutfit(base, head, outfit = {}) {
  const pick = (layer) => { for (const [cat, layers] of Object.entries(outfit)) if (layers && layers[layer]) return layers[layer]; return base.layers[layer]; };
  return NL.overStack([...STACK.filter((k) => k !== "head" && k !== "hair").map(pick), head]);
}

/** Build everything once: the D-194 reference body + head, the splits, the base decomposition, anchors and templates. */
export function buildWardrobe({ contract = loadContract(), situation = "northstar" } = {}) {
  const fg = FG.buildFigure(), body = fg.body, splits = measureSplits(body), base = decompose(body, splits);
  const head = FG.composeFigure({ ...fg, body: new Uint8ClampedArray(N * 4) }, situation);
  const A = anchors(base, splits), T = templates(base, A, head, contract);
  return { fg, body, head, splits, base, anchors: A, templates: T, contract };
}
export const sha256 = sha;
export const sourceSha256 = () => NL.SOURCE.sha256;
