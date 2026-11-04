// D-251 EXPERIMENT A, REVISION a2 — shape-based item extraction with the LAYER CONTRACT deciding which lines may close a region
// (offline, not the production method; a1 in northstar-shape-extract.mjs stays frozen as D-250 recorded it). D-250 found one
// systematic fault of a1: for bottoms, C's own fingers and the base top's hem closed regions that a1 then took as garment. a2
// keeps a1's rules and adds one general correction, derived from C and the stack (northstar-wardrobe STACK), never per item:
//   FRONT — what lies IN FRONT of every layer of the category on C: C's hands for a top (sleeves lie over the arms, the hands over
//      the sleeves); C's arms, hands and base top for a bottom (pants lie under top-body and arms); and the base bottom as well
//      for shoes. The zone is C's own pixels of those layers, grown by 1 px for the outline drawn on their border. In it:
//      - no pixel joins the item (the item cannot be seen there by contract; what the picture paints there is body or another
//        garment redrawn);
//      - its drawn lines do NOT close a region: a region touching it is OPEN — never filled, reported uncertain when repainted.
//   LINES ALONE — a region whose border holds no certain item pixel is closed only by drawn lines: it is UNCERTAIN, never filled.
// Everything else is a1: certain = the production layer + the placement (mustCover); enclosed repainted regions (median
// colourDist > CHANGE_TOL) join with their own bounding line and its antialias as painted; regions left as C are uncertain; open
// regions are never filled; G-2 by shape; E-2 kept unless the item holds that paint. Pure; no file is written.
import * as WR from "./northstar-wardrobe.mjs";
import * as BF from "./northstar-base-figure.mjs";
import * as BC from "./northstar-base-figure-c.mjs";
import * as IP from "./northstar-item-pilot.mjs";

const { W, N } = WR, Mo = WR.maskOps;
export const SHAPE_REVISION = "a2";
export const SHAPE_RULES = Object.freeze({
  certain: "the production layer + the placement (mustCover) inside the picture's opaque paint, outside the front zone",
  front: "C's own pixels of the layers in front of the category by the stack (top: hands; bottom: arms, hands, base top; shoes: arms, hands, base top, base bottom), grown by 1 px: never item, and its lines never close a region",
  enclosed: "4-connected regions of the envelope's opaque, not-yet-item, non-ink pixels outside the front zone whose whole border is certain item or a drawn (ink) line of the picture outside the front zone, and at least one border pixel is certain item; joined when their median colourDist to C exceeds CHANGE_TOL (" + IP.CHANGE_TOL + "), otherwise uncertain",
  linesAlone: "a region whose border holds no certain item pixel is uncertain, never filled",
  edge: "an accepted region's own bounding ink line inside the envelope and outside the front zone (≤ 3 px) and that line's antialias, as the picture paints them",
  open: "regions touching anything else (background, the envelope's border, the protected or the front zone) are never filled; repainted ones (median > CHANGE_TOL) bordering the item over ≥ 8 px are reported uncertain",
  g2Shape: "base remnant after a 1 px opening; the production share limit " + IP.LIMITS.remnantShare.value,
});
const median = (a) => { if (!a.length) return 0; const s = Float64Array.from(a).sort(); return s[s.length >> 1]; };

/** The front zone of a category on C (see FRONT above), as a 0/1 mask, and its parts unexpanded (for the evaluation). */
export function frontZone(w, base, category) {
  const A = w.anchors, hands = new Uint8Array(N), arms = new Uint8Array(N), top = new Uint8Array(N), bottom = new Uint8Array(N);
  for (let i = 0; i < N; i++) { if (base.arms[i * 4 + 3] >= 128) { const x = i % W, y = (i / W) | 0; if (y >= (x < W / 2 ? A.wristY.left : A.wristY.right)) hands[i] = 1; else arms[i] = 1; }
    if (base.sep.lab[i] === 1) top[i] = 1; else if (base.sep.lab[i] === 2) bottom[i] = 1; }
  const parts = category === "top" ? [hands] : category === "bottom" ? [arms, hands, top] : category === "shoes" ? [arms, hands, top, bottom] : null;
  if (!parts) throw new Error("unknown category " + category);
  return { front: Mo.dilate(Mo.or(...parts), 1), hands, arms, baseTop: top, baseBottom: bottom };
}

/** The a2 layers for one picture O of an item. r0 may be passed in when the caller already ran the production extraction on the
 *  same inputs (it is then used as is); otherwise it is computed here. Returns r0 unchanged beside a2's layers, masks and checks. */
export function shapeExtract(w, base, T, category, O, { itemId = null, method = IP.METHOD, r0 = null } = {}) {
  if (!r0) r0 = IP.processItem(w, base, T, category, O, { itemId, method });
  if (!r0.layers) return { r0, ok: false, reason: "no production layers (registration)", layers: null };
  const t = T[category], C = base.R, M = IP.METHODS[method], { front: F } = frontZone(w, base, category);
  const item = new Uint8ClampedArray(N * 4), certain = new Uint8Array(N);
  for (const L of Object.values(r0.layers)) for (let i = 0; i < N; i++) if (L[i * 4 + 3]) { item.set(L.subarray(i * 4, i * 4 + 4), i * 4); if (L[i * 4 + 3] >= 128) certain[i] = 1; }
  const K = new Uint8Array(N); for (let i = 441 * W; i < N; i++) if (t.allowed[i] && !t.protect[i] && !F[i] && O[i * 4 + 3] >= 128) K[i] = 1;
  let placed = 0; if (t.mustCover) for (let i = 0; i < N; i++) if (t.mustCover[i] && K[i] && !certain[i]) { certain[i] = 1; item.set(O.subarray(i * 4, i * 4 + 4), i * 4); placed++; }
  const ink = new Uint8Array(N); for (let i = 441 * W; i < N; i++) if (O[i * 4 + 3] >= 128 && BF.classify(O, i) === "ink") ink[i] = 1;
  const comp = new Int32Array(N).fill(-1), comps = [];
  for (let s = 0; s < N; s++) { if (!K[s] || certain[s] || ink[s] || comp[s] >= 0) continue;
    const id = comps.length, px = [s]; comp[s] = id; let open = false, border = 0;
    for (let k = 0; k < px.length; k++) { const i = px[k], x = i % W;
      for (const j of [i - 1, i + 1, i - W, i + W]) { if (j < 0 || j >= N || Math.abs((j % W) - x) > 1) { open = true; continue; }
        if (certain[j]) { border++; continue; }
        if (F[j]) { open = true; continue; }                     // a2: the front zone (and its lines) never closes a region
        if (ink[j]) continue;
        if (!K[j]) { open = true; continue; }
        if (comp[j] < 0) { comp[j] = id; px.push(j); } } }
    const d = px.map((i) => IP.colourDist(O, i, C, i));
    comps.push({ px, open, border, median: median(d) }); }
  const added = new Uint8Array(N), uncEnclosed = new Uint8Array(N), uncOpen = new Uint8Array(N), uncLines = new Uint8Array(N); let nAdd = 0, nUE = 0, nUO = 0, nUL = 0, cAdd = 0;
  for (const c of comps) {
    const repainted = c.median > IP.CHANGE_TOL;
    if (!c.open && repainted && c.border > 0) { for (const i of c.px) { added[i] = 1; item.set(O.subarray(i * 4, i * 4 + 4), i * 4); } nAdd += c.px.length; cAdd++;
      const line = []; for (const i of c.px) for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < N && ink[j] && K[j] && !item[j * 4 + 3]) line.push(j);
      for (let r = 0; r < 3 && line.length; r++) { const next = []; for (const j of line) { if (item[j * 4 + 3]) continue; item.set(O.subarray(j * 4, j * 4 + 4), j * 4); added[j] = 1; nAdd++;
          for (const k of [j - 1, j + 1, j - W, j + W]) if (k >= 0 && k < N && ink[k] && K[k] && !item[k * 4 + 3]) next.push(k); } line.length = 0; line.push(...next); } }
    else if (!c.open && repainted) { for (const i of c.px) uncLines[i] = 1; nUL += c.px.length; }          // a2: closed by lines alone
    else if (!c.open) { for (const i of c.px) uncEnclosed[i] = 1; nUE += c.px.length; }
    else if (repainted && c.border >= 8) { for (const i of c.px) uncOpen[i] = 1; nUO += c.px.length; } }
  for (let i = 441 * W; i < N; i++) { if (!added[i] || !ink[i]) continue; for (const k of [i - 1, i + 1, i - W, i + W]) if (k >= 0 && k < N && t.allowed[k] && !t.protect[k] && !F[k] && O[k * 4 + 3] > 0 && O[k * 4 + 3] < 128 && !item[k * 4 + 3]) { item.set(O.subarray(k * 4, k * 4 + 4), k * 4); added[k] = 1; } }

  let layers;
  if (category === "top") { const tb = new Uint8ClampedArray(N * 4), sl = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) if (item[i * 4 + 3]) (base.arms[i * 4 + 3] >= 128 ? sl : tb).set(item.subarray(i * 4, i * 4 + 4), i * 4); layers = { topBody: tb, sleeves: sl }; }
  else layers = category === "bottom" ? { pants: item } : { shoes: item };
  const covering = r0.covering || "none", hide = BC.regionsC(w, base, T, category, { covering }).hidden(layers);
  const fit = BC.fitCheck(w, base, T, category, layers, { revision: M.fitRevision, shadow: r0.shadow, hide });
  const P = BF.layerProof(w, base.R, base.Z, { ...BF.minimumItems(base.R, base.sep.lab), ...layers }, { sep: base.sep, headSeam: "d201", hide, enclosure: M.fitRevision === "d222" || M.fitRevision === "d232" ? "c-exterior" : "canvas" });
  let missedPaint = 0; for (let i = 0; i < N; i++) if (P.enclosed[i] && O[i * 4 + 3] >= 128) missedPaint++;
  const rem = new Uint8Array(N); let remPx = 0, mc = 0;
  if (t.mustCover) for (let i = 441 * W; i < N; i++) if (t.mustCover[i]) { mc++; const a = O[i * 4 + 3], b = C[i * 4 + 3], ch = Math.abs(a - b) > IP.CHANGE_TOL || (!(a < 128 && b < 128) && [0, 1, 2].some((k) => Math.abs(O[i * 4 + k] - C[i * 4 + k]) > IP.CHANGE_TOL));
    if (!ch && BF.classify(O, i) !== "ink" && IP.colourDist(O, i, C, i) <= IP.CHANGE_TOL) { rem[i] = 1; remPx++; } }
  const opened = Mo.dilate(Mo.not(Mo.dilate(Mo.not(rem), 1)), 1); let remThick = 0; for (let i = 0; i < N; i++) if (opened[i] && rem[i]) remThick++;
  const e2 = (r0.faults.extraction || []).filter((f) => /^E-2 /.test(f)), e2Left = e2.filter((f) => { const m = /at x(\d+) y(\d+)/.exec(f); return !m || !(item[(+m[2] * W + +m[1]) * 4 + 3] >= 128); });
  const gen = (r0.faults.generation || []).filter((f) => !/^G-2 /.test(f)); if (mc && remThick / mc > IP.LIMITS.remnantShare.value) gen.push("G-2 (shape) base remnant: " + remThick + " px");
  const ext = []; if (missedPaint > 0) ext.push("E-1 " + missedPaint + " px of a hole lie where the picture has opaque paint"); ext.push(...e2Left);
  const failedFit = fit.checks.filter((c) => c.axis === "fit" && !c.ok).map((c) => c.id + " " + JSON.stringify(c.value));
  const faults = { generation: gen, extraction: ext, fit: failedFit };
  return { r0, revision: SHAPE_REVISION, layers, shadow: r0.shadow, hide, covering, ok: !gen.length && !ext.length && !failedFit.length, faults,
    masks: { added, uncertainEnclosed: uncEnclosed, uncertainOpen: uncOpen, uncertainLinesAlone: uncLines, front: F },
    stats: { placedPx: placed, addedPx: nAdd, addedRegions: cAdd, uncertainEnclosedPx: nUE, uncertainOpenPx: nUO, uncertainLinesAlonePx: nUL, remnantPx: remPx, remnantThickPx: remThick, mustCoverPx: mc, missedPaintPx: missedPaint, e2Left: e2Left.length },
    composite: fit.composite };
}
