// D-291 — shoe-master-v2's one general rule on a SYNTHETIC shoe (C is private, D-127 §2): v2 is a separate, versioned master and v1
// renders as D-289 recorded it; the painted volume (low frequency) gets room where the material has it, the paint grain is never enlarged
// on a dark material; a near-white material keeps its highlight (fitted base) instead of clipping; the inner construction lines stay at
// least lineMin darker than their field on a dark material; the alpha never changes. Passing these tests is not a visual approval; the
// review on C is in docs/decisions/D-291.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as WR from "../../tools/avatar/northstar-wardrobe.mjs";
import * as SM from "../../tools/avatar/northstar-shoe-master.mjs";

const { W, N } = WR, INK = [30, 25, 20], LINE = [120, 100, 80];
const inBox = (x, y) => x >= 400 && x <= 520 && y >= 1300 && y <= 1420;
// the field: a soft painted highlight (a wide bump around 440,1330) plus a fine deterministic grain of ±3 levels
const fieldLum = (x, y) => 222 + 22 * Math.exp(-((x - 440) ** 2 + (y - 1330) ** 2) / 300) + (((x * 7 + y * 13) % 5) - 2) * 1.5;
const src = new Uint8ClampedArray(N * 4), contour = new Uint8ClampedArray(N * 4);
for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0; if (!inBox(x, y)) continue; const edge = !inBox(x - 2, y) || !inBox(x + 2, y) || !inBox(x, y - 2) || !inBox(x, y + 2);
  const v = fieldLum(x, y), c = edge ? INK : y === 1390 || y === 1391 ? LINE : [v, v - 12, v - 30]; src.set([...c.map((q) => Math.round(q)), 255], i * 4); if (edge) contour.set([...INK, 255], i * 4); }
const t = { alpha: Uint8Array.from({ length: N }, (_, i) => src[i * 4 + 3]), contour };
const seeds = { upper: [[480, 1330]], sole: [[460, 1405]], toe: [], laces: [], tongue: [] };
const m1 = SM.buildShoeMaster(src, t, { ...SM.SPEC, seeds }), m2 = SM.buildShoeMaster(src, t, { ...SM.SPEC_V2, seeds });
const design = (c) => ({ upper: c, toe: c, sole: c, laces: c });
const Lof = (P, i) => SM.oklab([P[i * 4], P[i * 4 + 1], P[i * 4 + 2]])[0], at = (x, y) => y * W + x;
// the grain: the RMS of L minus its 5x5 mean over a quiet patch of the upper (away from the bump and the lines)
const grain = (P) => { let s = 0, n = 0; for (let y = 1350; y < 1380; y++) for (let x = 480; x < 510; x++) { let mu = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) mu += Lof(P, at(x + dx, y + dy)); s += (Lof(P, at(x, y)) - mu / 25) ** 2; n++; } return Math.sqrt(s / n); };

test("D-291 v2 is a separate, versioned master; v1 renders as before", () => {
  assert.deepEqual([m1.revision, m2.revision], ["shoe-master-v1", "shoe-master-v2"]); assert.equal(m1.v2, null); assert.ok(m2.v2);
  assert.deepEqual({ ...SM.SPEC_V2, revision: undefined, model: undefined, lineMin: undefined, volumeRadius: undefined, maxGain: undefined }, { ...SM.SPEC, revision: undefined, model: undefined, lineMin: undefined, volumeRadius: undefined, maxGain: undefined });
  const again = SM.buildShoeMaster(src, t, { ...SM.SPEC, seeds }), d = design([54, 56, 62]); assert.deepEqual(SM.renderShoe(m1, src, d), SM.renderShoe(again, src, d), "v1 is deterministic and unchanged by v2");
  for (const L of [SM.renderShoe(m2, src, d), SM.renderShoe(m2, src, design([246, 244, 238]))]) for (let i = 3; i < N * 4; i += 4) assert.equal(L[i], src[i], "the alpha is the source's");
});

test("D-291 a dark material: v1 enlarges the paint grain, v2 never does; the painted highlight stays a highlight", () => {
  const d = design([54, 56, 62]), g0 = grain(src), g1 = grain(SM.renderShoe(m1, src, d)), L2 = SM.renderShoe(m2, src, d), g2 = grain(L2);
  assert.ok(g1 > g0 * 1.3, "v1 grows the grain (" + g1.toFixed(4) + " vs " + g0.toFixed(4) + ")"); assert.ok(g2 <= g0 + 1e-4, "v2 keeps it at most the source's (" + g2.toFixed(4) + ")");
  assert.ok(Lof(L2, at(440, 1330)) > Lof(L2, at(495, 1370)) + 0.03, "the bump is still lighter than the plain field");
});

test("D-291 a near-white material keeps its painted highlight (fitted base) instead of clipping", () => {
  const d = design([250, 250, 250]), L1 = SM.renderShoe(m1, src, d), L2 = SM.renderShoe(m2, src, d);
  const lift = (L) => Lof(L, at(440, 1330)) - Lof(L, at(495, 1370)), src0 = lift(src);
  assert.ok(lift(L2) >= src0 * 0.8, "v2 keeps the highlight's lift (" + lift(L2).toFixed(3) + " of " + src0.toFixed(3) + ")"); assert.ok(lift(L2) > lift(L1), "more than v1's clipped lift");
});

test("D-291 the inner lines stay at least lineMin darker than their field on a dark material; the self-reproduction is close", () => {
  const L2 = SM.renderShoe(m2, src, design([54, 56, 62])), field = Lof(L2, at(495, 1370)), line = Lof(L2, at(495, 1390));
  assert.ok(field - line >= SM.SPEC_V2.lineMin - 1e-6, "the seam is visible (" + (field - line).toFixed(3) + ")");
  const self = SM.renderShoe(m2, src, SM.originalDesign(m2, src)); let worst = 0;
  for (let i = 0; i < N; i++) if (src[i * 4 + 3] === 255 && m2.field[i] && !m2.contour[i]) worst = Math.max(worst, Math.abs(Lof(self, i) - Lof(src, i)));
  assert.ok(worst <= 0.02, "the self-reproduction within 0.02 L (" + worst.toFixed(4) + ")");
});
