// D-289 — the shoe master's mechanics on a SYNTHETIC shoe (C is private, D-127 §2): the drawing's ink lines split it into fields that
// one seed per field labels once per cut; a design is one colour per field group; the alpha (silhouette, placement, covering) is never
// changed; shading is carried in linear light (shadows multiplied, highlights added, so a highlight stays a highlight on a dark
// material); the drawn outline is never lighter than drawn; the partial fringe outside it takes the outline's colour; no pixel keeps the
// original's colour. Passing these tests is not a visual approval; the review on C is in docs/decisions/D-289.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as WR from "../../tools/avatar/northstar-wardrobe.mjs";
import * as SM from "../../tools/avatar/northstar-shoe-master.mjs";

const { W, N } = WR, INK = [30, 25, 20], LINE = [120, 100, 80], FAB = [224, 210, 190], HL = [246, 238, 226];
const inBox = (x, y) => x >= 400 && x <= 520 && y >= 1300 && y <= 1420;
const src = new Uint8ClampedArray(N * 4), contour = new Uint8ClampedArray(N * 4);
for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0;
  if (inBox(x, y)) { const edge = !inBox(x - 2, y) || !inBox(x + 2, y) || !inBox(x, y - 2) || !inBox(x, y + 2);
    const c = edge ? INK : y === 1390 || y === 1391 ? LINE : x >= 440 && x < 460 && y >= 1320 && y < 1340 ? HL : y > 1360 && y < 1388 ? FAB.map((v) => v - 30) : FAB;
    src.set([...c, 255], i * 4); if (edge) contour.set([...INK, 255], i * 4); }
  else if (inBox(x - 1, y) || inBox(x + 1, y) || inBox(x, y - 1) || inBox(x, y + 1)) src.set([...FAB, 100], i * 4); }
const t = { alpha: Uint8Array.from({ length: N }, (_, i) => src[i * 4 + 3]), contour };
const spec = { ...SM.SPEC, seeds: { upper: [[480, 1330]], sole: [[460, 1405]], toe: [], laces: [], tongue: [] } };
const m = SM.buildShoeMaster(src, t, spec), at = (x, y) => y * W + x;
const all = { upper: [40, 54, 96], toe: [40, 54, 96], sole: [240, 238, 232], laces: [242, 240, 234] };
const lum = (P, i) => 0.299 * P[i * 4] + 0.587 * P[i * 4 + 1] + 0.114 * P[i * 4 + 2];

test("D-289 the ink lines split the shoe into fields; one seed labels each; ink and the fringe join the nearest field; one revision", () => {
  assert.equal(SM.REVISION, "shoe-master-v1"); assert.equal(m.group[at(480, 1330)], SM.GROUPS.indexOf("upper")); assert.equal(m.group[at(460, 1405)], SM.GROUPS.indexOf("sole"));
  assert.equal(m.ink[at(460, 1390)], 1, "the inner line is ink"); assert.ok(m.group[at(460, 1390)] >= 0, "the ink joins a field");
  for (let i = 0; i < N; i++) if (src[i * 4 + 3]) assert.ok(m.group[i] >= 0, "every shoe pixel belongs to a field group");
  assert.ok(m.fringe.length > 0); assert.throws(() => SM.buildShoeMaster(src, t, { ...spec, seeds: { ...spec.seeds, toe: [[460, 1390]] } }), /not in a field/);
  assert.equal(Object.values(SM.SPEC.seeds).flat().length, 22); assert.deepEqual(Object.keys(SM.SPEC.seeds).sort(), [...SM.GROUPS].sort());
});

test("D-289 a design changes colour only: the alpha is the source's; no pixel keeps the original's colour; the fringe takes the outline's", () => {
  const L = SM.renderShoe(m, src, all);
  for (let i = 3; i < N * 4; i += 4) assert.equal(L[i], src[i]);
  const u = at(480, 1330); assert.notDeepEqual([...L.subarray(u * 4, u * 4 + 3)], FAB);
  for (let k = 0; k < m.fringe.length; k += 2) { const i = m.fringe[k], j = m.fringe[k + 1]; assert.deepEqual([...L.subarray(i * 4, i * 4 + 3)], [...L.subarray(j * 4, j * 4 + 3)]); }
  assert.throws(() => SM.renderShoe(m, src, { upper: [1, 2, 3] }), /the design has no/);
});

test("D-289 the painted volume in linear light: on a dark material a highlight stays lighter than the material and a shadow darker", () => {
  const L = SM.renderShoe(m, src, all), mat = 0.299 * 40 + 0.587 * 54 + 0.114 * 96;
  assert.ok(lum(L, at(450, 1330)) > mat + 10, "the highlight keeps its strength (added light, not a scaled multiply)");
  assert.ok(lum(L, at(480, 1370)) < lum(L, at(480, 1330)) - 3, "the painted shadow stays darker");
  assert.ok(lum(L, at(460, 1390)) < lum(L, at(480, 1330)), "the seam line stays a darker line");
});

test("D-289 the outline is never lighter than drawn, and darker on a dark material; the self-reproduction is close to the original", () => {
  const dark = SM.renderShoe(m, src, { upper: [20, 20, 22], toe: [20, 20, 22], sole: [20, 20, 22], laces: [20, 20, 22] }), light = SM.renderShoe(m, src, { upper: [250, 250, 250], toe: [250, 250, 250], sole: [250, 250, 250], laces: [250, 250, 250] });
  for (let i = 0; i < N; i++) if (m.contour[i]) for (let c = 0; c < 3; c++) { assert.ok(light[i * 4 + c] <= src[i * 4 + c]); assert.ok(dark[i * 4 + c] <= src[i * 4 + c]); }
  const self = SM.renderShoe(m, src, SM.originalDesign(m, src)); let worst = 0;
  for (let i = 0; i < N; i++) if (src[i * 4 + 3] === 255 && !m.contour[i] && !m.ink[i]) for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(self[i * 4 + c] - src[i * 4 + c]));
  assert.ok(worst <= 6, "the self-reproduction of the fields within 6 levels (" + worst + ")");
  assert.deepEqual(Object.keys(SM.designs()).map((k) => /SYNTHETIC/.test(k)), [true, true, true, true]);
});
