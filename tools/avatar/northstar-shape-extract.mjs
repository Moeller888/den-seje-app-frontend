// D-250 EXPERIMENT A — SHAPE-BASED ITEM EXTRACTION (offline, not the production method). D-248's path A: identify the garment by its
// form, edges and category placement instead of its colour. It runs ON TOP of the production extraction (northstar-item-pilot.mjs
// processItem, method as pinned), which it never changes, and adds only what the garment's own shape proves:
//   1. CERTAIN — the production layer (its painted outline, antialias and alpha kept as extracted) and the category's placement:
//      the base garment's interior (template mustCover), which the item replaces by contract;
//   2. ENCLOSED — inside the item's envelope (template allowed, outside protect) and the picture's opaque paint, every 4-connected
//      region not yet in the item whose border is ENTIRELY certain item or a drawn line of the picture (an ink pixel outside the
//      envelope, e.g. the neckline along the protected neck band): it lies inside the garment's own closed outline;
//      it joins the item only when the picture repainted it (median colourDist to C above CHANGE_TOL, the production body-redraw
//      bound — not a new threshold). An enclosed region the picture left as C (median ≤ CHANGE_TOL) is UNCERTAIN: C showing
//      through a gap (a sandal's toes, an ankle between hem and collar) — never filled;
//   3. OPEN — a repainted region that touches anything else (background, the envelope's border, the protected zones) is never
//      filled: it is reported as UNCERTAIN (a garment edge that does not close, or body redrawn).
// So no closed line is filled by itself: only regions enclosed by the ITEM's certain pixels, and only repainted ones. Nothing is
// painted: every added pixel is the picture's own. The checks are the production checks (fitCheck, layerProof's hole test).
// G-2 by SHAPE: base remnant counted after an opening by 1 px (thin lines such as stripe-edge antialias are no base fabric).
import * as WR from "./northstar-wardrobe.mjs";
import * as BF from "./northstar-base-figure.mjs";
import * as BC from "./northstar-base-figure-c.mjs";
import * as IP from "./northstar-item-pilot.mjs";

const { W, N } = WR, Mo = WR.maskOps;
export const SHAPE_REVISION = "a1";
export const SHAPE_RULES = Object.freeze({
  certain: "the production layer + the placement (mustCover) inside the picture's opaque paint",
  enclosed: "4-connected regions of the envelope's opaque, not-yet-item, non-ink pixels whose whole border is certain item or a drawn (ink) line of the picture; joined when their median colourDist to C exceeds CHANGE_TOL (" + IP.CHANGE_TOL + "), otherwise uncertain",
  edge: "an accepted region's own bounding ink line inside the envelope (≤ 3 px) and that line's antialias, as the picture paints them",
  open: "regions touching anything but certain item or a drawn line are never filled; repainted ones (median > CHANGE_TOL) bordering the item over ≥ 8 px are reported uncertain",
  g2Shape: "base remnant after a 1 px opening; the production share limit " + IP.LIMITS.remnantShare.value,
});
const median = (a) => { if (!a.length) return 0; const s = Float64Array.from(a).sort(); return s[s.length >> 1]; };

/** The shape-based layers for one picture O (RGBA, 1024×1536) of an item. Returns the production result (r0) unchanged beside the
 *  experiment's layers, its masks (added, uncertain enclosed, uncertain open), the production checks run on the new layers, and
 *  the shape-based remnant. Pure; no file is written. */
export function shapeExtract(w, base, T, category, O, { itemId = null, method = IP.METHOD } = {}) {
  const r0 = IP.processItem(w, base, T, category, O, { itemId, method });
  if (!r0.layers) return { r0, ok: false, reason: "no production layers (registration)", layers: null };
  const t = T[category], C = base.R, M = IP.METHODS[method];
  const item = new Uint8ClampedArray(N * 4), certain = new Uint8Array(N);
  for (const L of Object.values(r0.layers)) for (let i = 0; i < N; i++) if (L[i * 4 + 3]) { item.set(L.subarray(i * 4, i * 4 + 4), i * 4); if (L[i * 4 + 3] >= 128) certain[i] = 1; }
  const K = new Uint8Array(N); for (let i = 441 * W; i < N; i++) if (t.allowed[i] && !t.protect[i] && O[i * 4 + 3] >= 128) K[i] = 1;
  let placed = 0; if (t.mustCover) for (let i = 0; i < N; i++) if (t.mustCover[i] && K[i] && !certain[i]) { certain[i] = 1; item.set(O.subarray(i * 4, i * 4 + 4), i * 4); placed++; }
  // a1: the picture's drawn lines (ink) are BARRIERS — a garment edge that coincides with C's contour (a shoulder) closes the region
  const ink = new Uint8Array(N); for (let i = 441 * W; i < N; i++) if (O[i * 4 + 3] >= 128 && BF.classify(O, i) === "ink") ink[i] = 1;
  // the regions of the envelope not yet item, 4-connected, between the barriers
  const comp = new Int32Array(N).fill(-1), comps = [];
  for (let s = 0; s < N; s++) { if (!K[s] || certain[s] || ink[s] || comp[s] >= 0) continue;
    const id = comps.length, px = [s]; comp[s] = id; let open = false, border = 0;
    for (let k = 0; k < px.length; k++) { const i = px[k], x = i % W;
      for (const j of [i - 1, i + 1, i - W, i + W]) { if (j < 0 || j >= N || Math.abs((j % W) - x) > 1) { open = true; continue; }
        if (certain[j]) { border++; continue; }
        if (ink[j]) continue;                                    // a drawn line closes the region (inside or outside the envelope)
        if (!K[j]) { open = true; continue; }
        if (comp[j] < 0) { comp[j] = id; px.push(j); } } }
    const d = px.map((i) => IP.colourDist(O, i, C, i));
    comps.push({ px, open, border, median: median(d) }); }
  const added = new Uint8Array(N), uncEnclosed = new Uint8Array(N), uncOpen = new Uint8Array(N); let nAdd = 0, nUE = 0, nUO = 0, cAdd = 0;
  for (const c of comps) {
    const repainted = c.median > IP.CHANGE_TOL;
    if (!c.open && repainted) { for (const i of c.px) { added[i] = 1; item.set(O.subarray(i * 4, i * 4 + 4), i * 4); } nAdd += c.px.length; cAdd++;
      // the region's own bounding line inside the envelope (up to 3 px thick) and that line's antialias beyond it: the painted edge,
      // taken as the picture paints it (colour and alpha), never a line that does not touch the accepted region
      const line = []; for (const i of c.px) for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < N && ink[j] && K[j] && !item[j * 4 + 3]) line.push(j);
      for (let r = 0; r < 3 && line.length; r++) { const next = []; for (const j of line) { if (item[j * 4 + 3]) continue; item.set(O.subarray(j * 4, j * 4 + 4), j * 4); added[j] = 1; nAdd++;
          for (const k of [j - 1, j + 1, j - W, j + W]) if (k >= 0 && k < N && ink[k] && K[k] && !item[k * 4 + 3]) next.push(k); } line.length = 0; line.push(...next); } }
    else if (!c.open) { for (const i of c.px) uncEnclosed[i] = 1; nUE += c.px.length; }
    else if (repainted && c.border >= 8) { for (const i of c.px) uncOpen[i] = 1; nUO += c.px.length; } }
  // the added lines' antialias beyond them (one pass over every added ink pixel)
  for (let i = 441 * W; i < N; i++) { if (!added[i] || !ink[i]) continue; for (const k of [i - 1, i + 1, i - W, i + W]) if (k >= 0 && k < N && t.allowed[k] && !t.protect[k] && O[k * 4 + 3] > 0 && O[k * 4 + 3] < 128 && !item[k * 4 + 3]) { item.set(O.subarray(k * 4, k * 4 + 4), k * 4); added[k] = 1; } }

  // the layer split of the production method: a top's pixels over C's arms are sleeves
  let layers;
  if (category === "top") { const tb = new Uint8ClampedArray(N * 4), sl = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) if (item[i * 4 + 3]) (base.arms[i * 4 + 3] >= 128 ? sl : tb).set(item.subarray(i * 4, i * 4 + 4), i * 4); layers = { topBody: tb, sleeves: sl }; }
  else layers = category === "bottom" ? { pants: item } : { shoes: item };
  const covering = r0.covering || "none", hide = BC.regionsC(w, base, T, category, { covering }).hidden(layers);
  const fit = BC.fitCheck(w, base, T, category, layers, { revision: M.fitRevision, shadow: r0.shadow, hide });
  const P = BF.layerProof(w, base.R, base.Z, { ...BF.minimumItems(base.R, base.sep.lab), ...layers }, { sep: base.sep, headSeam: "d201", hide, enclosure: M.fitRevision === "d222" || M.fitRevision === "d232" ? "c-exterior" : "canvas" });
  let missedPaint = 0; for (let i = 0; i < N; i++) if (P.enclosed[i] && O[i * 4 + 3] >= 128) missedPaint++;
  // G-2 by shape: the production remnant (base interior unchanged from C, not ink) after a 1 px opening
  const rem = new Uint8Array(N); let remPx = 0, mc = 0;
  if (t.mustCover) for (let i = 441 * W; i < N; i++) if (t.mustCover[i]) { mc++; const a = O[i * 4 + 3], b = C[i * 4 + 3], ch = Math.abs(a - b) > IP.CHANGE_TOL || (!(a < 128 && b < 128) && [0, 1, 2].some((k) => Math.abs(O[i * 4 + k] - C[i * 4 + k]) > IP.CHANGE_TOL));
    if (!ch && BF.classify(O, i) !== "ink" && IP.colourDist(O, i, C, i) <= IP.CHANGE_TOL) { rem[i] = 1; remPx++; } }
  const opened = Mo.dilate(Mo.not(Mo.dilate(Mo.not(rem), 1)), 1); let remThick = 0; for (let i = 0; i < N; i++) if (opened[i] && rem[i]) remThick++;
  // E-2 as production reports it (detached paint thicker than a contour, with its position): it stays unless A joined that paint
  const e2 = (r0.faults.extraction || []).filter((f) => /^E-2 /.test(f)), e2Left = e2.filter((f) => { const m = /at x(\d+) y(\d+)/.exec(f); return !m || !(item[(+m[2] * W + +m[1]) * 4 + 3] >= 128); });
  const detachedLeft = e2Left.length;
  const gen = (r0.faults.generation || []).filter((f) => !/^G-2 /.test(f)); if (mc && remThick / mc > IP.LIMITS.remnantShare.value) gen.push("G-2 (shape) base remnant: " + remThick + " px");
  const ext = []; if (missedPaint > 0) ext.push("E-1 " + missedPaint + " px of a hole lie where the picture has opaque paint"); ext.push(...e2Left);
  const failedFit = fit.checks.filter((c) => c.axis === "fit" && !c.ok).map((c) => c.id + " " + JSON.stringify(c.value));
  const faults = { generation: gen, extraction: ext, fit: failedFit };
  return { r0, revision: SHAPE_REVISION, layers, shadow: r0.shadow, hide, covering, ok: !gen.length && !ext.length && !failedFit.length, faults,
    masks: { added, uncertainEnclosed: uncEnclosed, uncertainOpen: uncOpen },
    stats: { placedPx: placed, addedPx: nAdd, addedRegions: cAdd, uncertainEnclosedPx: nUE, uncertainOpenPx: nUO, remnantPx: remPx, remnantThickPx: remThick, mustCoverPx: mc, missedPaintPx: missedPaint, e2Left: detachedLeft },
    composite: fit.composite };
}
