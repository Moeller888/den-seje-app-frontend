// D-335 — VERSION 2 OF THE LONG-SLEEVE (SWEATER) MASTER: D-333's ls-master-v1 unchanged (its file and results stay as recorded), plus
// TWO per-cut repairs — the layer split (splitLayers) and the hip seam (coverBaseTopStrip) — offline; no image call; nothing published.
//   the fault (D-333; its cause corrected here) — a warm dotted line inside the sleeves along C's arm outline, faint on the source's green,
//                       plain on heather. Traced pixel by pixel: those fabric pixels lie on C's arm's soft (antialiased) edge, where the
//                       arm's alpha is 85–115. The production split puts a top's pixel in the sleeve layer (drawn OVER C's arms) only
//                       where the arm's alpha is >= 128, so these go to the body layer, which lies UNDER C's arms: the arm's own warm edge
//                       is drawn over the fabric. (D-333's guess — the source's alpha 251–254 — was tested in D-335 and is not the cause:
//                       raising it to 255 left 110 of 117 warm pixels.) A short tee's sleeves end above most of the arm; a long sleeve
//                       covers its whole length, so the edge shows along it;
//   the repair        — splitLayers: for this cut, a pixel of the top goes to the sleeve layer wherever C's arm has ANY alpha (> 0), so
//                       the fabric covers the arm's soft edge where it covers the arm. The cut's alpha, outline and soft outer edge, the
//                       cuffs and C's hands (outside the cut) are unchanged; only which of the two layers a fabric pixel is in changes.
//                       The same repair for every colour and print: it is cut data, not design data.
// The hip seam (D-335, second repair): at the right hip a 2 px strip of C's base TOP runs down along C's hip outline below the sweater's
// side contour (y 802–817). At runtime the base top is gone under any top, the sweater's side contour stops at y 801 and the trousers'
// fill and own outline leave the strip between them: the page background showed through as a light notch. coverBaseTopStrip continues
// the cut's SIDE CONTOUR down over exactly that strip (the cut's ink colour, C's own alpha), so the sweater's outline runs down along the
// hip and meets the bottom's outline; the rib hem is not lengthened (D-335's first attempt, which lengthened it column by column, left a
// 1–7 px enclosed hole and failed FIT-4 on every design, and is not used).
import * as WR from "./northstar-wardrobe.mjs";
import * as LS from "./northstar-longsleeve-master.mjs";

const { N } = WR;
export const REVISION = "ls-master-v2";
/** The arm alpha from which a fabric pixel belongs to the sleeve layer (the production rule's is 128). */
export const SLEEVE_FROM_ARM_ALPHA = 1;
export const SPEC = LS.SPEC;
export const SOURCE = LS.SOURCE;
export const buildMasterFor = LS.buildMasterFor;

/** A rendered top layer split into { topBody, sleeves } by this cut's rule; moved: pixels that the production rule (>= 128) would have
 *  put in the body layer. */
export function splitLayers(layer, base, from = SLEEVE_FROM_ARM_ALPHA) {
  const tb = new Uint8ClampedArray(N * 4), sl = new Uint8ClampedArray(N * 4); let moved = 0;
  for (let i = 0; i < N; i++) { if (!layer[i * 4 + 3]) continue; const a = base.arms[i * 4 + 3]; if (a >= from) { sl.set(layer.subarray(i * 4, i * 4 + 4), i * 4); if (a < 128) moved++; } else tb.set(layer.subarray(i * 4, i * 4 + 4), i * 4); }
  return { layers: { topBody: tb, sleeves: sl }, moved };
}


/** The hip-seam rule: every pixel of C's base top (base.sep.lab 1, C opaque >= 128) within HIP_ROWS of C's base shorts' top that the cut
 *  does not cover and that is 4-connected to the cut's core through such pixels becomes part of the cut as contour: ink = the median of
 *  the cut's own contour ink, alpha = C's own alpha there; the master's panel 0, ratio 1 and no displacement (the contour is drawn on top).
 *  Returns { t, master, addedPx, box }. One rule for the cut: it does not look at any bottom. */
export const HIP_ROWS = [-20, 80];
export function coverBaseTopStrip(t, master, base) {
  const W = WR.W; let shortsTop = N / W; for (let i = 0; i < N; i++) if (base.sep.lab[i] === 2) { shortsTop = Math.floor(i / W); break; }
  const y0 = shortsTop + HIP_ROWS[0], y1 = shortsTop + HIP_ROWS[1], cand = (i) => { const y = (i / W) | 0; return y >= y0 && y <= y1 && base.sep.lab[i] === 1 && base.R[i * 4 + 3] >= 128 && !t.core[i]; };
  const add = new Uint8Array(N), q = []; for (let i = y0 * W; i < (y1 + 1) * W; i++) { if (!cand(i)) continue; const x = i % W; if ([i - 1, i + 1, i - W, i + W].some((j) => Math.abs((j % W) - x) <= 1 && t.core[j])) { add[i] = 1; q.push(i); } }
  while (q.length) { const i = q.pop(), x = i % W; for (const j of [i - 1, i + 1, i - W, i + W]) { if (Math.abs((j % W) - x) > 1 || add[j] || !cand(j)) continue; add[j] = 1; q.push(j); } }
  const ink = [0, 1, 2].map((k) => { const vals = []; for (let i = 0; i < N; i++) if (t.contour[i * 4 + 3] >= 200) vals.push(t.contour[i * 4 + k]); vals.sort((a, b) => a - b); return vals.length ? vals[vals.length >> 1] : 30; });
  const core = Uint8Array.from(t.core), alpha = Uint8Array.from(t.alpha), contour = Uint8ClampedArray.from(t.contour), panel = Int8Array.from(master.panel), ratio = Float32Array.from(master.ratio), disp = Float32Array.from(master.disp);
  let n = 0, bx0 = W, by0 = N, bx1 = -1, by1 = -1;
  for (let i = 0; i < N; i++) { if (!add[i]) continue; n++; const x = i % W, y = (i / W) | 0; bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y);
    core[i] = 1; alpha[i] = base.R[i * 4 + 3]; contour.set([...ink, base.R[i * 4 + 3]], i * 4); panel[i] = 0; ratio[i] = 1; disp[i * 2] = 0; disp[i * 2 + 1] = 0; }
  return { t: { ...t, core, alpha, contour }, master: { ...master, panel, ratio, disp }, addedPx: n, box: n ? [bx0, by0, bx1, by1] : null, ink };
}
