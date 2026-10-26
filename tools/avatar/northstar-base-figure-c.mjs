// NORTHSTAR BASE FIGURE C (D-205) — the frozen development candidate for the new item system, its category templates and the
// three separate item assessments of contract v3: FIT to C (binding for new items), COMPATIBILITY with Northstar's old clothing
// (a report, never a gate) and artistic QUALITY (measured; the look is the owner's).
//
// C is D-202's one raw result (sha256 10f4a4b9…, stored outside both clones). Freezing derives — deterministically, with nothing
// painted, deformed or cut from the skin — its runtime layers (body, arms with hands, base top, base shorts), the masks and the
// category templates, and writes them ONLY outside the repository (D-127 §2: a figure in close-fitting base clothing and its
// skin layers are never tracked or published). The repository tracks the numbers: hashes, anchors, pixel counts. Freezing is
// not production activation and not a visual approval; D-200 and D-203 stay as recorded.
// Usage: node tools/avatar/northstar-base-figure-c.mjs --freeze <C.png> --out <empty dir OUTSIDE both clones>
//        node tools/avatar/northstar-base-figure-c-proof.mjs --fit-proof <C.png> --out <empty dir OUTSIDE both clones>
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng, decodePng } from "./r3-hair-tool-v2.mjs";
import * as NL from "./r3-northstar-layers.mjs";
import * as WR from "./northstar-wardrobe.mjs";
import * as BF from "./northstar-base-figure.mjs";
import { flat, crop, down, grid } from "./northstar-wardrobe-poc.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DECISION = "D-205";
export const FREEZE_FILE = "tools/avatar/fixtures/northstar-wardrobe/base-figure-c-v1.json";
export const CONTRACT_FILE = "tools/avatar/fixtures/northstar-wardrobe/contract-v3.json";
export const PILOT_FILE = "tools/avatar/fixtures/northstar-wardrobe/pilot-plan-v3.json";
export const C_RAW_SHA256 = "10f4a4b9baf9886e8f230e09b2ab4e69bfebd6795c2a1222eb84f8db3884e818";
const { W, H, N } = WR, Mo = WR.maskOps, sha = (b) => createHash("sha256").update(b).digest("hex");
const rd = (f) => JSON.parse(readFileSync(join(REPO, ...f.split("/")), "utf8"));
export const loadFreeze = () => rd(FREEZE_FILE), loadContractV3 = () => rd(CONTRACT_FILE), loadPilotV3 = () => rd(PILOT_FILE);
const count = (m) => { let n = 0; for (let i = 0; i < N; i++) if (m[i]) n++; return n; };
const maskOf = (P, t = 128) => Mo.toMask(P, t);
const bbox = (m) => { let x0 = W, x1 = -1, y0 = H, y1 = -1; for (let i = 0; i < N; i++) if (m[i]) { const x = i % W, y = (i / W) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return { x0, x1, y0, y1 }; };

/** The base prepared once: registration (integer shift, never a warp), the established dust cleanup, the base separation and the
 *  runtime body. Any base works — C locally, a Northstar-derived stand-in in CI. */
export function prepareBase(w, raw, Z = BF.zones(w)) {
  const reg = BF.register(raw, w.fg.master); if (!reg.ok) throw new Error("the base does not register on Northstar");
  const R = BF.dustCleaned(BF.shift(raw, reg.dx, reg.dy)), sep = BF.separateBase(R, Z), { body, arms } = BF.runtimeBody(w, R, sep.lab);
  return { reg, R, sep, body, arms, Z };
}

/** C's anchors, measured on the base itself (not typed): the neck seam, armpits, the base garments' extent, soles and centre. */
export function anchorsOf(w, base) {
  const { R, sep } = base, A = w.anchors, t = new Uint8Array(N), b = new Uint8Array(N); for (let i = 0; i < N; i++) { if (sep.lab[i] === 1) t[i] = 1; if (sep.lab[i] === 2) b[i] = 1; }
  const sole = (side) => { let yb = -1; for (let i = 1300 * W; i < N; i++) if (((i % W) < 512) === (side === "left") && R[i * 4 + 3] >= 128) yb = Math.max(yb, (i / W) | 0); return yb; };
  return { coordinates: "Northstar v2 master, 1024×1536", neckSeamY: 440, armpitY: { left: BF.armpitY(R, "left"), right: BF.armpitY(R, "right") }, baseTop: bbox(t), baseShorts: bbox(b),
    waistSeam: BF.waistSeam(R, sep.lab, A), soleY: { left: sole("left"), right: sole("right") }, groundLineY: A.groundY, centreX: A.centreX };
}

/** Category templates on C (contract v3). mustCover is the base garment's INTERIOR — the base minus its outer fabric band
 *  (FABRIC_BAND_PX of the silhouette's exterior): there is no skin under it, so an item must cover it or the body has a hole;
 *  the outer band may stay open (it becomes background) and the outfit's silhouette decides there. allowed / protect are the
 *  envelopes of contract v2 measured on C; the sleeve zone is C's own arms grown by 14 px. Nothing here is skin removed. */
export function templatesC(w, base, { revision = "v3" } = {}) {
  const T = templatesV3(w, base); if (revision !== "d210" && revision !== "d213") return T;
  if (revision === "d213") return templatesD213(w, base, templatesC(w, base, { revision: "d210" }));
  // D-210: a sole under a bare foot reaches below C's soles — Northstar's own sneaker sole is NORTHSTAR_SOLE_PX thick — so the
  // shoes envelope reaches C's lowest sole + that sole + the ground tolerance (v3 cut it at the ground line + 4 and so cut the
  // generated sandals' soles off, while FIT-7 measured the cut item)
  const sole = Math.max(T.shoes.soleY.left, T.shoes.soleY.right), low = sole + NORTHSTAR_SOLE_PX + FIT_LIMITS.groundTolPx.value, a = T.shoes.allowed, allowed = new Uint8Array(a);
  let x0 = W, x1 = -1, y1 = -1; for (let i = 0; i < N; i++) if (a[i]) { const x = i % W; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y1 = Math.max(y1, (i / W) | 0); }
  for (let y = y1 + 1; y <= Math.min(H - 1, low); y++) for (let x = x0; x <= x1; x++) allowed[y * W + x] = 1;
  return { ...T, revision: "d210", shoes: { ...T.shoes, allowed, soleRange: [sole - FIT_LIMITS.groundTolPx.value, low] } };
}
/** D-213 (tops only): the hand guard begins at C's OWN wrist on each side — where C's arm widens into the hand: the lower end of
 *  the narrow plateau (width ≤ the narrowest + 1 px) within ±40 px of Northstar's wrist anchor — instead of 10 px above the larger of Northstar's two wrist anchors (837 on C, while C's wrists are at
 *  y≈844): v3 cut the last rows of a long sleeve's cuff off on C's forearm. Below the wrist the hand stays the base's; the head
 *  guard, the other categories and every other envelope are unchanged. */
export function wristRowsC(w, base) {
  const o = {}; for (const side of ["left", "right"]) { const a0 = w.anchors.wristY[side], wd = {}; let best = Infinity, at = a0;
    for (let y = a0 - 40; y <= a0 + 40; y++) { let n = 0; for (let x = 0; x < W; x++) if ((side === "left" ? x < W / 2 : x >= W / 2) && base.arms[(y * W + x) * 4 + 3] >= 128) n++; wd[y] = n; if (n > 0 && n < best) { best = n; at = y; } }
    let row = at; while (row + 1 <= a0 + 40 && wd[row + 1] > 0 && wd[row + 1] <= best + 1) row++;   // the narrow plateau's lower end
    o[side] = row; } return o; }
function templatesD213(w, base, T) {
  const wr = wristRowsC(w, base), hands = new Uint8Array(N); for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0; if (base.arms[i * 4 + 3] >= 128 && y >= wr[x < W / 2 ? "left" : "right"]) hands[i] = 1; }
  const top = new Uint8Array(N); for (let i = 0; i < N; i++) if (base.sep.lab[i] === 1) top[i] = 1;
  const tb = bbox(top), head = Mo.and(maskOf(w.head, 1), Mo.rect(0, 0, W, tb.y0 - 15));   // v3's head guard, unchanged
  // the sleeve zone of the envelope likewise reaches C's own wrist on each side (v3: Northstar's larger wrist anchor, y849)
  const sleeveTo = new Uint8Array(N); for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0; if (base.arms[i * 4 + 3] >= 128 && y >= w.anchors.shoulder.y - 60 && y < wr[x < W / 2 ? "left" : "right"]) sleeveTo[i] = 1; }
  const allowed = Mo.or(T.top.allowed, Mo.and(Mo.dilate(sleeveTo, 14), Mo.not(Mo.dilate(hands, 2))));
  const handGuard = Mo.dilate(hands, 2);
  return { ...T, revision: "d213", top: { ...T.top, allowed, protect: Mo.or(head, handGuard), hands, handGuard, wristRows: wr } };
}
/** D-218 — the THREE regions of an item on C, kept apart:
 *  (1) apiEdit: where the image API is ASKED to paint — the item's allowed region grown by API_MASK_MARGIN_PX, never the head or
 *      the hands. A GPT Image mask is guidance only (OpenAI: "the model uses the mask as guidance, but may not follow its exact
 *      shape"); it preserves nothing.
 *  (2) itemAllowed: where the finished item may have pixels — the category's envelope minus its protected regions (extraction and
 *      FIT-2/FIT-3 enforce it).
 *  (3) hidden(layers): the body pixels a WORN item hides by its declared covering rule — closed footwear hides C's foot inside the
 *      shoe's solid extent, column by column (an arch, a heel gap or a side notch shows background, not C's bare foot); open footwear
 *      and every other item hide nothing. C is never changed; a hole this leaves inside the item is FIT-4's (missing material). */
export const API_MASK_MARGIN_PX = 8;
export function closedFootwearHidden(base, shoes) {
  // column by column: everything of C's foot from where the shoe's SOLID material begins in that column (the first run of at
  // least SLIVER_PX opaque shoe pixels — a thinner run is an outline, e.g. the rim of a boot's shaft or a sneaker's collar seen
  // above the leg) DOWN to the canvas bottom: a shoe's sole lifts the foot (C's bare sole stands on the ground line, a shoe's
  // sole lies below it), so under an arch, a heel gap or a side notch C's bare foot would show. The leg above the shoe's solid
  // top — also inside a shaft or a collar opening — stays C's. A gap left inside the shoe's outline is FIT-4's / VIS-2's.
  const hide = new Uint8Array(N);
  for (let x = 0; x < W; x++) { let top = -1;
    for (let y = 0; y < H && top < 0; y++) { let k = 0; while (y + k < H && shoes[((y + k) * W + x) * 4 + 3] >= 128) k++; if (k >= SLIVER_PX) top = y; else y += k; }
    if (top < 0) continue; for (let y = top; y < H; y++) { const i = y * W + x; if (base.body[i * 4 + 3] > 0 || base.arms[i * 4 + 3] > 0) hide[i] = 1; } }
  return hide; }
export function regionsC(w, base, T, category, { covering = "none" } = {}) {
  const t = T[category], itemAllowed = Mo.and(t.allowed, Mo.not(t.protect)), apiEdit = Mo.and(Mo.dilate(itemAllowed, API_MASK_MARGIN_PX), Mo.not(t.protect));
  return { apiEdit, itemAllowed, covering, hidden: (layers) => (covering === "closed-footwear" && layers.shoes ? closedFootwearHidden(base, layers.shoes) : null) }; }
function templatesV3(w, base) {
  const { R, sep, arms } = base, A = w.anchors, ext = BF.outsideExterior(R), band = Mo.dilate(ext, BF.FABRIC_BAND_PX);
  const lab = (k) => { const m = new Uint8Array(N); for (let i = 0; i < N; i++) if (sep.lab[i] === k) m[i] = 1; return m; };
  const top = lab(1), bot = lab(2), tb = bbox(top), bb = bbox(bot), armM = maskOf(arms), handsM = Mo.and(armM, Mo.rect(0, Math.max(A.wristY.left, A.wristY.right) - 10, W, H));
  const crotch = A.crotchY, ground = A.groundY, sleeveZone = Mo.and(Mo.dilate(armM, 14), Mo.rect(0, A.shoulder.y - 60, W, Math.max(A.wristY.left, A.wristY.right)));
  const head = Mo.and(maskOf(w.head, 1), Mo.rect(0, 0, W, tb.y0 - 15));
  const feet = Mo.and(maskOf(R), Mo.rect(0, Math.min(A.shoeTopY.left, A.shoeTopY.right), W, H)), fb = bbox(feet);
  return {
    top: { layers: ["topBody", "sleeves"], mustCover: Mo.and(top, Mo.not(band)), allowed: Mo.or(Mo.rect(tb.x0 - 40, tb.y0 - 14, tb.x1 + 40, crotch - 8), sleeveZone), protect: Mo.or(head, Mo.dilate(handsM, 2)), sleeveZone },
    bottom: { layers: ["pants"], mustCover: Mo.and(bot, Mo.not(band)), allowed: Mo.rect(bb.x0 - 80, bb.y0 - 30, bb.x1 + 80, ground - 22), protect: Mo.or(head, Mo.rect(0, ground - 21, W, H)) },
    shoes: { layers: ["shoes"], mustCover: new Uint8Array(N), allowed: Mo.rect(fb.x0 - 34, fb.y0 - 150, fb.x1 + 34, ground + 4), protect: head, groundY: ground, groundTolPx: 4, soleY: { left: anchorsOf(w, base).soleY.left, right: anchorsOf(w, base).soleY.right } },
  };
}

/** The item assessments of contract v3. FIT (binding for a new item on C): layers, envelope, protect, coverage (no hole, no
 *  exposed cut skin, no missing body), order (every painted item pixel stays visible), silhouette (no body contour visible just
 *  outside a garment meant to cover it), ground (shoes). QUALITY: outline, sharpness, clean alpha (measures; the look is the
 *  owner's). The other categories are dressed in the minimum items, so a top is judged with the base shorts, and so on. */
export const FIT_LIMITS = Object.freeze({
  envelopePx: { value: 0, why: "the allowed envelope already includes the margins of contract v2; a pixel beyond it is outside the category" },
  protectPx: { value: 0, why: "head and hands are drawn by the base; an item pixel there covers them" },
  enclosedHolePx: { value: 0, why: "any hole inside the outfit shows background through the figure" },
  exposedCutSkinPx: { value: 10, why: "antialias where a removed base outline met skin: C with its minimum items 0 px, C dressed in Northstar's defaults 2 px; a bottom cut 60 px short 198 px" },
  deepOpenBasePx: { value: 0, why: "an open base pixel deeper than the 4 px fabric band (the base shorts' measured excess over the bare thigh) is body with no material" },
  hiddenItemShare: { value: 0.005, why: "every pixel the generator painted was visible in its picture; hidden after composing means a wrong layer — 0.5 % allows the antialiased rim under an arm's outline" },
  bodyOutsideItemPx: { value: 10, why: "a body contour visible just outside a garment that covers that body part is a double outline (Northstar's jeans on C: 147 px); 10 px allows antialias where two painted contours cross" },
  groundTolPx: { value: 4, why: "contract v2's shoe ground line ± 4" },
});

// D-210 revision of FIT-5, FIT-6 and FIT-7 (fitCheck(..., { revision: "d210" })); v3 stays as it was for D-205's record. The
// stage-1 pilot showed that v3's FIT-5 counted overlap the contract intends (a garment under a layer above it) and its own
// antialiased rim, FIT-6 counted skin meant to show at open forms (shoulders, the thigh below a hem, feet in sandals), and FIT-7
// measured shoes cut at the envelope. The values below come from Northstar or from v3, never from the pilot pictures.
export const NORTHSTAR_SOLE_PX = 28;   // Northstar's sneaker sole: the dark upper/sole seam at y1460, the bottom at y1488
export const SLIVER_PX = 6;            // v3's FIT-6 ring: a body strip this narrow between a garment and the background
export const tuckPx = (w) => w.anchors.waistHemY - w.anchors.waistbandY;   // Northstar's tee covers its jeans' waistband by 11 px
export const FIT_LIMITS_D210 = Object.freeze({
  wrongOrderShare: { value: 0.005, why: "v3's hiddenItemShare, now only for paint hidden by a layer the contract puts BELOW the item — a wrong composer order" },
  hiddenDetailShare: { value: 0.005, why: "v3's hiddenItemShare for paint hidden by a layer above it deeper than the tuck (Northstar's tee over its jeans' waistband): a detail the outfit never shows" },
  sliverPx: { value: 10, why: "v3's bodyOutsideItemPx, now only for body strips ≤ SLIVER_PX wide between the garment and the background in a row or a column and longer than SLIVER_PX along the edge — a limb wider than its garment or a double contour (Northstar's jeans on C); wide skin at an open form is meant, and a piece ≤ SLIVER_PX in both directions is where two painted contours cross (v3's own allowance), reported per crossing" },
  soleRange: { value: NORTHSTAR_SOLE_PX, why: "the shoe's lowest pixel lies between C's soles − 4 and C's soles + Northstar's sole + 4: a shoe that encloses the foot or puts a sole under it, never floating above the foot or sinking deeper than a sneaker sole" },
});
const RANK = { body: 0, shoes: 1, pants: 2, topBody: 3, arms: 4, sleeves: 5, head: 6 };

/** D-210 FIT-5v2 / FIT-6v2 / FIT-7v2 on a layer proof P (contract order or a control order). */
function fitD210(w, base, T, category, layers, P, add, shadow = null, revision = "d210") {
  const own = Object.keys(layers), lim = FIT_LIMITS_D210;
  // FIT-5v2: every painted item pixel is either visible, or hidden by a layer the contract ranks ABOVE it within the tuck of a
  // visible part of the item; hidden by a layer ranked below it is a wrong order; hidden deeper is a detail the outfit never shows
  const vis = new Uint8Array(N), over = new Uint8Array(N); let painted = 0, wrong = 0;
  for (let i = 0; i < N; i++) { let L = null; for (const [n, Lr] of P.stack) if (own.includes(n) && layers[n] && Lr[i * 4 + 3] >= 250) L = n; if (!L) continue; painted++;
    let top = null; for (const [n, Lr] of P.stack) if (Lr[i * 4 + 3] >= 128) top = n;
    if (own.includes(top)) vis[i] = 1; else if (RANK[top] > RANK[L]) over[i] = 1; else wrong++; }
  const tuck = Mo.dilate(vis, tuckPx(w)), detailM = new Uint8Array(N); let tucked = 0, detail = 0; for (let i = 0; i < N; i++) if (over[i]) { if (tuck[i]) tucked++; else { detail++; detailM[i] = 1; } }
  add("fit", "FIT-5v2-ORDER", painted > 0 && wrong / painted <= lim.wrongOrderShare.value && detail / painted <= lim.hiddenDetailShare.value,
    { paintedPx: painted, wrongOrderPx: wrong, tuckedPx: tucked, hiddenDetailPx: detail, tuckPx: tuckPx(w) }, "no paint hidden by a layer ranked below it; paint under a layer above it only as a tuck of a visible part");
  // FIT-6v2: a body strip of at most SLIVER_PX between THIS garment and the background (a row or a column): the limb is wider
  // than the garment there or its contour shows beside it. Hands and head are the base's (never counted).
  // D-214: the item's skin shadow (a multiply layer) is the item's material too — composed, it shows exactly the picture's pixel
  const sh = shadow ? Mo.toMask(shadow, 128) : new Uint8Array(N), items = Mo.or(Mo.toMask(P.items, 128), sh), im = Mo.or(Mo.toMask(NL.overStack(own.map((k) => layers[k])), 128), sh), guard = T.top.protect;
  const kind = (i) => im[i] ? 1 : P.dressedRuntime[i * 4 + 3] < 128 ? 2 : !items[i] && !guard[i] && (P.body[i * 4 + 3] >= 128 || P.arms[i * 4 + 3] >= 128) ? 3 : 0;
  const sl = new Uint8Array(N), K = new Uint8Array(N); for (let i = 441 * W; i < N; i++) K[i] = kind(i);
  const scan = (start, step, len) => { let k = 0; while (k < len) { if (K[start + k * step] !== 3) { k++; continue; } let e = k; while (e < len && K[start + e * step] === 3) e++;
    const a = k > 0 ? K[start + (k - 1) * step] : 2, b = e < len ? K[start + e * step] : 2;
    if (e - k <= SLIVER_PX && ((a === 1 && b === 2) || (a === 2 && b === 1))) for (let q = k; q < e; q++) sl[start + q * step] = 1; k = e; } };
  for (let y = 441; y < H; y++) scan(y * W, 1, W); for (let x = 0; x < W; x++) scan(441 * W + x, W, H - 441);
  // a strip along the garment's edge is a sliver; a piece no longer than SLIVER_PX in both directions is where the garment's
  // outline crosses the body's contour (a strap meeting the shoulder line) — reported, not counted
  const seen = new Uint8Array(N), strip = new Uint8Array(N), crossingShapes = []; let crossings = 0, crossingPx = 0;
  for (let s0 = 0; s0 < N; s0++) { if (!sl[s0] || seen[s0]) continue; const q = [s0], px = []; seen[s0] = 1; let x0 = W, x1 = -1, y0 = H, y1 = -1;
    while (q.length) { const i = q.pop(); px.push(i); const x = i % W, y = (i / W) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const j = i + dy * W + dx; if (x + dx < 0 || x + dx >= W || j < 0 || j >= N) continue; if (sl[j] && !seen[j]) { seen[j] = 1; q.push(j); } } }
    // D-222: a crossing is decided by its SHAPE, not only its size. Two contours meeting at an angle leave a COMPACT piece; a contour
    // running along the garment (a limb wider than it, a double contour) leaves an ELONGATED one. Compact: the shorter side ≤
    // SLIVER_PX and the longer ≤ 1.5 × the shorter (contours meeting at ≥ 34°); v3's square allowance stays (a piece ≤ SLIVER_PX in
    // both directions). The skirt's hem corner meeting the thigh is 6 × 7
    // px — over v3's square allowance (≤ SLIVER_PX × SLIVER_PX) by one row; the sandals' foot contour beside the sole is 2 × 12 px
    // and stays a strip.
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, lo = Math.min(bw, bh), hi = Math.max(bw, bh);
    const crossing = hi <= SLIVER_PX || (revision === "d222" && lo <= SLIVER_PX && hi <= 1.5 * lo);   // v3's square allowance, and (D-222) compact
    if (crossing) { crossings++; crossingPx += px.length; if (hi > SLIVER_PX) crossingShapes.push([bw, bh, px.length]); } else for (const i of px) strip[i] = 1; }
  add("fit", "FIT-6v2-SILHOUETTE", count(strip) <= lim.sliverPx.value, { sliverPx: count(strip), sliverWidthPx: SLIVER_PX, crossings, crossingPx, ...(revision === "d222" ? { compactCrossingsOverSquare: crossingShapes } : {}) }, "no body strip ≤ " + SLIVER_PX + " px wide along the garment's edge between it and the background" + (revision === "d222" ? " (D-222: a compact piece where two contours meet at an angle is a crossing, reported)" : ""));
  if (category === "shoes") { const sb = bbox(maskOf(layers.shoes)), [lo, hi] = T.shoes.soleRange;
    add("fit", "FIT-7v2-GROUND", sb.y1 >= lo && sb.y1 <= hi, { soleY: sb.y1, range: [lo, hi] }, "the shoe ends between C's soles and a Northstar sneaker sole below them"); }
  return { hiddenDetail: detailM, slivers: strip, crossings: Mo.and(sl, Mo.not(strip)) };
}
export function fitCheck(w, base, T, category, layers, { order = "contract", revision = "v3", shadow = null, hide = null } = {}) {
  const t = T[category], out = [], add = (axis, id, ok, value, what) => out.push({ axis, id, ok, value, what }), lim = FIT_LIMITS;
  const names = Object.keys(layers), itemAll = NL.overStack(names.map((k) => layers[k])), im = maskOf(itemAll, 1);
  add("fit", "FIT-1-LAYERS", JSON.stringify(names) === JSON.stringify(t.layers) && names.every((k) => layers[k].length === N * 4), names, "exactly the category's layers, full 1024×1536 RGBA");
  let env = 0, prot = 0; for (let i = 0; i < N; i++) if (im[i]) { if (!t.allowed[i]) env++; if (t.protect[i]) prot++; }
  add("fit", "FIT-2-ENVELOPE", env <= lim.envelopePx.value, { outsidePx: env }, "inside the category's envelope on C");
  add("fit", "FIT-3-PROTECT", prot <= lim.protectPx.value, { protectPx: prot }, "nothing over the head or the hands");
  const min = BF.minimumItems(base.R, base.sep.lab), it = category === "top" ? { ...min, ...layers } : category === "bottom" ? { ...min, ...layers } : { ...min, shoes: layers.shoes };
  // D-213: the head as the runtime composes it (D-201's seam rule) — v3 / d210 keep the plain head for their records
  const P = BF.layerProof(w, base.R, base.Z, it, { sep: base.sep, order, headSeam: revision === "d213" || revision === "d218" || revision === "d221" || revision === "d222" ? "d201" : "plain", hide: revision === "d218" || revision === "d221" || revision === "d222" ? hide : null,
    enclosure: revision === "d222" ? "c-exterior" : "canvas" }), c = (m) => count(m);
  const own = new Uint8Array(N); for (let i = 0; i < N; i++) if (t.mustCover[i] && P.dressedRuntime[i * 4 + 3] < 128) own[i] = 1;
  const cov = { enclosedHolePx: c(P.enclosed), exposedCutSkinPx: c(P.cutSkin), deepOpenBasePx: c(P.deep), mustCoverOpenPx: c(own) };
  add("fit", "FIT-4-COVERAGE", cov.enclosedHolePx <= lim.enclosedHolePx.value && cov.exposedCutSkinPx <= lim.exposedCutSkinPx.value && cov.deepOpenBasePx <= lim.deepOpenBasePx.value && cov.mustCoverOpenPx === 0, cov, "no hole in the body: the base interior covered, no exposed cut skin, no missing body");
  let masks = null; if (revision === "d210" || revision === "d213" || revision === "d218" || revision === "d221" || revision === "d222") masks = fitD210(w, base, T, category, layers, P, add, shadow, revision);
  if (revision === "d218" || revision === "d221" || revision === "d222") { let hid = 0; if (hide) for (let i = 0; i < N; i++) if (hide[i] && (base.body[i * 4 + 3] >= 128 || base.arms[i * 4 + 3] >= 128)) hid++;
    add("report", "VIS-1-HIDDEN-BODY", true, { hiddenBodyPx: hid }, "body pixels the item hides by its declared covering rule (never a gate; a hole it leaves is FIT-4's)");
    // VIS-2: what an item hides it must REPLACE — hidden body left as background within the item's own column span (top to bottom
    // pixel; below it is the space under a sole or an arch) ≤ 1 % of the hidden body (the remnant rule's share: an item replaces
    // what it removes). A sandal declared closed loses its toes here.
    if (hide) { const im2 = maskOf(NL.overStack(names.map((k) => layers[k])), 128); let lost = 0;
      for (let x = 0; x < W; x++) { let y0 = -1, y1 = -1; for (let y = 0; y < H; y++) if (im2[y * W + x]) { if (y0 < 0) y0 = y; y1 = y; } if (y0 < 0) continue;
        for (let y = y0; y <= y1; y++) { const i = y * W + x; if (hide[i] && P.dressedRuntime[i * 4 + 3] < 128) lost++; } }
      add("fit", "VIS-2-REPLACES-HIDDEN-BODY", lost <= 0.01 * Math.max(1, hid), { vanishedInsidePx: lost, hiddenBodyPx: hid, share: +(lost / Math.max(1, hid)).toFixed(4) }, "a covering item replaces the body it hides: no more than 1 % of it left as background inside the item's own extent");
      // VIS-3 (D-221, closed footwear): the shoe replaces the WHOLE foot inside it — on each side, C's body pixels below the shoe's
      // solid top that still show (neither hidden nor covered: a toe or a heel beside a too small or too narrow shoe) ≤ 1 % of
      // C's body pixels there (the same share: an item replaces what it removes)
      if ((revision === "d221" || revision === "d222") && category === "shoes") { let footPx = 0, shown = 0;
        // each column's own solid top (an ankle in a collar opening, above the tongue, is meant to show); a column the shoe does not
        // reach takes the side's highest solid top (a toe or a heel sticking out beside the shoe)
        for (const left of [true, false]) { const x0 = left ? 0 : W / 2, x1 = left ? W / 2 : W, colTop = new Int32Array(W).fill(H); let top = H;
          for (let x = x0; x < x1; x++) for (let y = 0; y < H; y++) { let k = 0; while (y + k < H && im2[(y + k) * W + x]) k++; if (k >= SLIVER_PX) { colTop[x] = y; top = Math.min(top, y); break; } if (k) y += k; }
          if (top >= H) continue;
          for (let x = x0; x < x1; x++) { let has = false; for (let y = 0; y < H && !has; y++) if (im2[y * W + x]) has = true; const from = has ? colTop[x] : top; if (from >= H) continue;
            for (let y = from; y < H; y++) { const i = y * W + x; if (!(base.body[i * 4 + 3] >= 128 || base.arms[i * 4 + 3] >= 128)) continue; footPx++; if (!hide[i] && !im2[i] && P.dressedRuntime[i * 4 + 3] >= 128) shown++; } } }
        add("fit", "VIS-3-REPLACES-WHOLE-FOOT", shown <= 0.01 * Math.max(1, footPx), { footShownPx: shown, footPx, share: +(shown / Math.max(1, footPx)).toFixed(4) }, "a closed shoe replaces the whole foot below its solid top: no more than 1 % of C's foot there still showing (a too small or too narrow shoe)"); } } }
  else {
  let painted = 0, hidden = 0; for (let i = 0; i < N; i++) if (itemAll[i * 4 + 3] >= 250) { painted++; if ([0, 1, 2].some((k) => Math.abs(P.dressedRuntime[i * 4 + k] - itemAll[i * 4 + k]) > 2)) hidden++; }
  add("fit", "FIT-5-ORDER", painted > 0 && hidden / painted <= lim.hiddenItemShare.value, { paintedPx: painted, hiddenPx: hidden, share: +(hidden / Math.max(1, painted)).toFixed(4) }, "every painted pixel stays visible in the contract order (sleeves over the arms, the top's body behind them)");
  // FIT-6: only where the item lies over REAL skin (a trouser leg over a thigh, a sleeve over an arm) — there the limb's own
  // contour must not show just outside the garment at the outfit's outer silhouette; skin beside a sleeveless top's strap is meant
  const skinUnder = new Uint8Array(N), rowsOver = new Uint8Array(H); for (let i = 441 * W; i < N; i++) if (im[i] && !base.sep.lab[i] && (base.body[i * 4 + 3] >= 128 || base.arms[i * 4 + 3] >= 128)) { skinUnder[i] = 1; rowsOver[(i / W) | 0] = 1; }
  const near = Mo.and(Mo.dilate(im, 6), Mo.not(im)), extNear = Mo.dilate(BF.outsideExterior(P.dressedRuntime), 3); let outside = 0;
  for (let i = 441 * W; i < N; i++) if (rowsOver[(i / W) | 0] && near[i] && extNear[i] && (base.body[i * 4 + 3] >= 128 || base.arms[i * 4 + 3] >= 128) && P.dressedRuntime[i * 4 + 3] >= 128) outside++;
  add("fit", "FIT-6-SILHOUETTE", outside <= lim.bodyOutsideItemPx.value, { bodyOutsideItemPx: outside, rowsOverSkin: count(rowsOver) }, "where the garment lies over real skin, the limb's contour does not show just outside it at the outer silhouette");
  if (category === "shoes") { const sb = bbox(maskOf(layers.shoes)); add("fit", "FIT-7-GROUND", Math.abs(sb.y1 - t.groundY) <= lim.groundTolPx.value, { soleY: sb.y1, groundY: t.groundY }, "the soles on the ground line ± 4"); }
  }
  const q = WR.sharpness(itemAll), o = BF.outlineShare(itemAll, 0); let haze = 0, px = 0; for (let i = 0; i < N; i++) if (itemAll[i * 4 + 3]) { px++; if (itemAll[i * 4 + 3] < 128) haze++; }
  add("quality", "Q-1-OUTLINE", o >= 0.45, { darkShare: +o.toFixed(3) }, "Northstar's dark painted contour (D-197 I6)");
  add("quality", "Q-2-SHARPNESS", q >= 0.7, { lapToGrad: +q.toFixed(3) }, "crisp painted detail (D-197 I7)");
  add("quality", "Q-3-ALPHA", haze <= 0.06 * px, { share: +(haze / Math.max(1, px)).toFixed(4) }, "a clean cut-out (D-197 I5)");
  return { masks, checks: out, fitOk: out.filter((x) => x.axis === "fit").every((x) => x.ok), qualityOk: out.filter((x) => x.axis === "quality").every((x) => x.ok), composite: P.dressedRuntime };
}

/** COMPATIBILITY with Northstar's old clothing (D-197 defaults on C): a report, never a gate — D-204's documented limitation. */
export function legacyReport(w, base) {
  const P = BF.layerProof(w, base.R, base.Z, {}, { sep: base.sep }), c = (m) => count(m); let inter = 0, uni = 0;
  for (let i = 441 * W; i < N; i++) { const a = P.dressedRuntime[i * 4 + 3] >= 128, b = w.fg.master[i * 4 + 3] >= 128; if (a && b) inter++; if (a || b) uni++; }
  return { axis: "compatibility", gate: false, enclosedHolePx: c(P.enclosed), exposedCutSkinPx: c(P.cutSkin), bodyOutsideItemsPx: c(P.slivers), silhouetteIoU: +(inter / uni).toFixed(4),
    limitation: "C is up to ~3 px wider than Northstar's jeans at the hips and upper thighs (D-204): the old jeans show C's contour there. This is a compatibility limitation of the old item, not a licence for new items." };
}

const png = (P) => encodePng(W, H, P), maskPng = (m) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) if (m[i]) o.set([255, 255, 255, 255], i * 4); return encodePng(W, H, o); };
/** Freeze C: the derived layers, masks and templates OUTSIDE the repository, and the numbers for the tracked record. */
export function freeze(buf, OUT) {
  if (!BF.isOutsideRepo(OUT)) throw new Error("refusing to write the frozen base inside the repository (D-127 §2): " + OUT);
  if (sha(buf) !== C_RAW_SHA256) throw new Error("not C: the raw sha256 is " + sha(buf));
  const img = decodePng(buf), w = WR.buildWardrobe(), base = prepareBase(w, Uint8ClampedArray.from(img.px)), T = templatesC(w, base), files = {};
  const put = (n, b, what) => { writeFileSync(join(OUT, n), b); files[n] = { sha256: sha(b), bytes: b.length, what }; };
  const lab = (k) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) if (base.sep.lab[i] === k) o.set(base.R.subarray(i * 4, i * 4 + 4), i * 4); return o; };
  put("layer-body.png", png(base.body), "the runtime body below the neck seam, base garments removed (private)");
  put("layer-arms.png", png(base.arms), "arms with hands, grown from Northstar's arm/hand regions (private)");
  put("layer-base-top.png", png(lab(1)), "the base top — authoring only, never shipped (private)");
  put("layer-base-shorts.png", png(lab(2)), "the base shorts — authoring only, never shipped (private)");
  for (const [k, t] of Object.entries(T)) for (const m of ["mustCover", "allowed", "protect"]) put(`template-${k}-${m}.png`, maskPng(t[m]), `${k} ${m} (contract v3)`);
  put("template-top-sleeveZone.png", maskPng(T.top.sleeveZone), "top sleeve zone: C's arms + 14 px");
  const v3 = BF.checkBaseFigure(w, Uint8ClampedArray.from(img.px), base.Z, BF.loadSpec(), "generated", "v3");
  const record = { decision: DECISION, candidate: "C", raw: { sha256: C_RAW_SHA256, bytes: buf.length, storage: "<Documents>/DenSejeApp-artefacts/d-202-northstar-base-figure/ (outside both clones, untracked)" }, registration: base.reg,
    derivation: "registration (integer shift), the established dust cleanup, separateBase (position split, skin never removed), runtimeBody (arms grown from the arm/hand regions); nothing painted or deformed",
    anchors: anchorsOf(w, base), layersPx: { body: count(maskOf(base.body)), arms: count(maskOf(base.arms)), baseTop: base.sep.lab.filter((v) => v === 1).length, baseShorts: base.sep.lab.filter((v) => v === 2).length },
    templatesPx: Object.fromEntries(Object.entries(T).map(([k, t]) => [k, { mustCover: count(t.mustCover), allowed: count(t.allowed), protect: count(t.protect) }])),
    gateSetV3: { ok: v3.ok, failed: v3.checks.filter((c) => !c.ok).map((c) => c.id) }, compatibility: legacyReport(w, base), externalFiles: files };
  writeFileSync(join(OUT, "manifest.json"), JSON.stringify(record, null, 2) + "\n");
  return record;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const a = process.argv.slice(2), oi = a.indexOf("--out"), fi = a.indexOf("--freeze");
  const OUT = oi >= 0 && a[oi + 1] ? resolve(a[oi + 1]) : null;
  if (!OUT || fi < 0) { console.error("usage: --freeze <C.png> --out <empty dir outside both clones>"); process.exit(1); }
  if (!BF.isOutsideRepo(OUT)) { console.error("REFUSED: --out is inside the repository; a base figure is never written there (D-127 §2)"); process.exit(1); }
  if (existsSync(OUT) && readdirSync(OUT).length) { console.error("--out must be empty"); process.exit(1); } mkdirSync(OUT, { recursive: true });
  const r = freeze(readFileSync(resolve(a[fi + 1])), OUT); console.log(JSON.stringify({ anchors: r.anchors, layersPx: r.layersPx, templatesPx: r.templatesPx, gateSetV3: r.gateSetV3, compatibility: r.compatibility }, null, 2));
}
