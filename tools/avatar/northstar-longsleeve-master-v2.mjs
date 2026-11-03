// D-335 — VERSION 2 OF THE LONG-SLEEVE (SWEATER) MASTER: D-333's ls-master-v1 unchanged (its file and results stay as recorded), plus
// ONE per-cut repair of how the cut's layer is split into the body and sleeve layers (offline; no image call; nothing published).
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
// The hip corner (D-333's COMBO-6 with the navy shorts) is NOT repaired: C's base top shows 2–3 px wide for 9 rows below the sweater's
// right hem corner (the cream tee's longer hem covers it). D-335 tried lengthening the hem there column by column (the outline moved
// down, fabric above it): every variant (both hips, right only, at most 9 rows) left a 1–7 px enclosed hole against C's outline and
// failed FIT-4-COVERAGE on every design — it makes the item worse, so the shorts stay out of the candidate package (D-335).
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

