// D-293 — the edge prototype (shoe-master-v3-edge) on a SYNTHETIC shoe (C is private, D-127 §2): v1 and v2 are unchanged; v3 changes
// only decisions that were binary — a line's antialiased flank is darkened in proportion to its inkness instead of not at all, the colour
// changes INSIDE a drawn line between two fields smoothly and the line stays dark (no light halo), a field's own pixels are v2's — and
// the alpha never changes; the edge measures read a hard step as harder than a spread one. Passing these tests is not a visual approval;
// the review on C is in docs/decisions/D-293.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as WR from "../../tools/avatar/northstar-wardrobe.mjs";
import * as SM from "../../tools/avatar/northstar-shoe-master.mjs";
import { edgeMeasures, bilinear, OPAQUE } from "../../tools/avatar/northstar-shoe-edge-study.mjs";

const { W, N } = WR, INK = [30, 25, 20];
const inBox = (x, y) => x >= 400 && x <= 520 && y >= 1300 && y <= 1420;
// two fields (upper above, toe below) split by a drawn line at y 1390–1391 with an antialiased flank at 1389 and 1392
const lumAt = (y) => (y === 1390 || y === 1391 ? 110 : y === 1389 || y === 1392 ? 185 : 224);
const src = new Uint8ClampedArray(N * 4), contour = new Uint8ClampedArray(N * 4);
for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0; if (!inBox(x, y)) continue; const edge = !inBox(x - 2, y) || !inBox(x + 2, y) || !inBox(x, y - 2) || !inBox(x, y + 2);
  const v = lumAt(y); src.set([...(edge ? INK : [v, v - 12, v - 30]), 252], i * 4); if (edge) contour.set([...INK, 252], i * 4); }
const t = { alpha: Uint8Array.from({ length: N }, (_, i) => src[i * 4 + 3]), contour };
const seeds = { upper: [[460, 1340]], toe: [[460, 1405]], sole: [], laces: [], tongue: [] };
const m1 = SM.buildShoeMaster(src, t, { ...SM.SPEC, seeds }), m2 = SM.buildShoeMaster(src, t, { ...SM.SPEC_V2, seeds }), m3 = SM.buildShoeMaster(src, t, { ...SM.SPEC_V3, seeds });
const design = { upper: [40, 54, 96], toe: [236, 234, 228], sole: [240, 238, 232], laces: [242, 240, 234] };
const Lof = (P, i) => SM.oklab([P[i * 4], P[i * 4 + 1], P[i * 4 + 2]])[0], at = (x, y) => y * W + x;

test("D-293 v3 is a separate, versioned prototype; v1 and v2 render as before; the alpha never changes", () => {
  assert.deepEqual([m1.revision, m2.revision, m3.revision], ["shoe-master-v1", "shoe-master-v2", "shoe-master-v3-edge"]); assert.equal(m2.edge, null); assert.ok(m3.edge);
  const again2 = SM.buildShoeMaster(src, t, { ...SM.SPEC_V2, seeds }); assert.deepEqual(SM.renderShoe(m2, src, design), SM.renderShoe(again2, src, design), "v2 unchanged by v3");
  const L3 = SM.renderShoe(m3, src, design); for (let i = 3; i < N * 4; i += 4) assert.equal(L3[i], src[i]);
  assert.equal(OPAQUE, 240, "the source shoe's interior alpha is 247–254, never 255");
});

test("D-293 a line between two materials keeps the source's profile: both core rows equally dark (v2 split the line into a dark and a grey row), the flanks where the source has them", () => {
  const Ls = (y) => SM.oklab([...src.subarray(at(470, y) * 4, at(470, y) * 4 + 3)])[0], L2 = SM.renderShoe(m2, src, design), L3 = SM.renderShoe(m3, src, design);
  const core = (L) => Math.abs(Lof(L, at(470, 1390)) - Lof(L, at(470, 1391)));
  assert.ok(core(L2) > 0.3, "v2: the line's two rows differ (" + core(L2).toFixed(3) + ")"); assert.ok(core(L3) < 0.03, "v3: one line, both rows dark (" + core(L3).toFixed(3) + ")");
  // the flank's place between the field and the line core, as a fraction: v3 on both sides within 0.1 of the source's
  const frac = (Lf, Lfl, Lc) => (Lf - Lfl) / (Lf - Lc), fs = frac(Ls(1394), Ls(1392), Ls(1391));
  for (const [f, fl, c] of [[1386, 1389, 1390], [1394, 1392, 1391]]) assert.ok(Math.abs(frac(Lof(L3, at(470, f)), Lof(L3, at(470, fl)), Lof(L3, at(470, c))) - fs) < 0.1, "flank at " + fl);
  assert.ok(m3.edge.w[at(470, 1389)] > 0 && m3.edge.w[at(470, 1389)] < 1, "the flank is part line, part field");
});

test("D-293 the colour changes inside the drawn line, which stays dark; a field's own pixels are v2's", () => {
  const L2 = SM.renderShoe(m2, src, design), L3 = SM.renderShoe(m3, src, design), line = [at(470, 1390), at(470, 1391)];
  const fieldL = Math.min(Lof(L3, at(470, 1340)), Lof(L3, at(470, 1405)));
  for (const i of line) assert.ok(Lof(L3, i) < fieldL - 0.05, "the line is darker than both fields (no light halo)");
  const b = (L, i) => SM.oklab([L[i * 4], L[i * 4 + 1], L[i * 4 + 2]])[2], gap2 = Math.abs(b(L2, line[0]) - b(L2, line[1])), gap3 = Math.abs(b(L3, line[0]) - b(L3, line[1]));
  assert.ok(gap3 < gap2, "the hue steps less between the line's two rows (" + gap3.toFixed(3) + " < " + gap2.toFixed(3) + ")");
  for (const i of [at(470, 1340), at(470, 1405)]) assert.deepEqual([...L3.subarray(i * 4, i * 4 + 4)], [...L2.subarray(i * 4, i * 4 + 4)]);
});

test("D-293 the edge measure reads one hard step as harder than a spread one; the interpolated view only smooths", () => {
  const mk = (vals) => { const L = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0; if (!inBox(x, y)) continue; const v = vals(y); L.set([v, v, v, 252], i * 4); } return L; };
  const hard = edgeMeasures(m1, mk((y) => (y < 1390 ? 224 : 110))), soft = edgeMeasures(m1, mk((y) => (y < 1389 ? 224 : y === 1389 ? 185 : y === 1390 ? 150 : 110)));
  assert.ok(hard["group border"].hardness > soft["group border"].hardness);
  const im = { w: 2, h: 1, px: Uint8ClampedArray.from([0, 0, 0, 255, 200, 200, 200, 255]) }, up = bilinear(im, 4);
  assert.equal(up.w, 8); for (let x = 0; x < 8; x++) { const v = up.px[x * 4]; assert.ok(v >= 0 && v <= 200); }
});
