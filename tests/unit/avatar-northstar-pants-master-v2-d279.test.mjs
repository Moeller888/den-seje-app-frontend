// D-279 — the pants master v2's two construction rules on a SYNTHETIC trousers cut (C is private, D-127 §2): the waistband stays under
// the cut's top edge (v1 also took a strip along the legs' outer flare); the cut's outer edge takes the outline's ink — the outline's own
// partial edge pixels and the partial fabric fringe just outside it — the same for every material, colour only (the alpha is untouched).
// v1 is unchanged. Passing these tests is not a visual approval; the review on C is in docs/decisions/D-279.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as WR from "../../tools/avatar/northstar-wardrobe.mjs";
import * as PM from "../../tools/avatar/northstar-pants-master.mjs";

const { W, N } = WR, INK = [30, 30, 30], FABRIC = [110, 120, 70];
// a hip block and two legs flaring outward (the outer columns of the flare start far below the waist), a 2 px outline, and outside it a
// 1 px partial FABRIC fringe (alpha 120, no outline) as a generator paints it
const inLeg = (x, y, side) => { const t = (y - 893) / (1380 - 893), shift = side * 18 * t; return side < 0 ? x >= 400 + shift && x <= 505 + shift : x >= 517 + shift && x <= 622 + shift; };
const inside = (x, y) => (y >= 760 && y < 893 && x >= 400 && x <= 622) || (y >= 893 && y <= 1380 && (inLeg(x, y, -1) || inLeg(x, y, 1)));
const alpha = new Uint8Array(N), core = new Uint8Array(N), contour = new Uint8ClampedArray(N * 4), pants = new Uint8ClampedArray(N * 4);
for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0;
  if (inside(x, y)) { alpha[i] = 255; core[i] = 1; const edge = !inside(x - 2, y) || !inside(x + 2, y) || !inside(x, y - 2) || !inside(x, y + 2); if (edge) contour.set([...INK, 255], i * 4); pants.set([...(edge ? INK : FABRIC), 255], i * 4); }
  else if (y > 760 && (inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1))) { alpha[i] = 120; pants.set([...FABRIC, 120], i * 4); } }
const t = { alpha, core, contour }, src = { layers: { pants } }, base = { arms: new Uint8ClampedArray(N * 4) };
const v1 = PM.buildPantsMaster(t, src, PM.SPEC), v2 = PM.buildPantsMaster(t, src, PM.SPEC_V2);

test("D-279 v2 is a separate, versioned master; v1 stays as D-276 recorded it", () => {
  assert.deepEqual([v1.revision, v2.revision], ["pants-master-v1", "pants-master-v2"]); assert.equal(PM.REVISION, "pants-master-v1");
  assert.equal(v1.edge, null); assert.ok(v2.edge && v2.edge.idx.length > 0);
  assert.deepEqual({ ...PM.SPEC_V2, revision: undefined, waistTopSpan: undefined, outerEdgeInk: undefined }, { ...PM.SPEC, revision: undefined, waistTopSpan: undefined, outerEdgeInk: undefined }, "every other per-cut datum unchanged");
});

test("D-279 the waistband stays under the top edge: v1 also took the legs' outer flare, v2 does not", () => {
  const below = (m) => { let n = 0; for (let i = 0; i < N; i++) if (m.panel[i] === 0 && ((i / W) | 0) > 760 + 40 + PM.SPEC.waistBand) n++; return n; };
  assert.ok(below(v1) > 0, "v1 has waistband pixels down the outer flare"); assert.equal(below(v2), 0);
  assert.ok(v2.sizes.waistband > 0 && v2.sizes.waistband < v1.sizes.waistband);
  assert.equal(PM.mappingChecks(v2, t, base.arms).ok, true);
});

test("D-279 the outer edge takes the outline's ink for every material; the alpha is untouched; v1 lets the fabric show there", () => {
  const ring = []; for (let i = 0; i < N; i++) if (alpha[i] === 120) ring.push(i); assert.ok(ring.length > 100);
  const looks = {};
  for (const [name, m] of Object.entries(PM.materials())) { const L2 = PM.renderPants(v2, t, base, { body: m }).layer, L1 = PM.renderPants(v1, t, base, { body: m }).layer;
    for (let i = 0; i < N; i += 5) assert.equal(L2[i * 4 + 3], alpha[i], name + ": alpha");
    const covered = ring.filter((i) => v2.edge.idx.includes(i)); assert.ok(covered.length / ring.length > 0.95, name + ": the fringe is taken");
    for (const i of covered.slice(0, 60)) assert.deepEqual([L2[i * 4], L2[i * 4 + 1], L2[i * 4 + 2]], INK, name);
    looks[name] = covered.slice(0, 60).map((i) => [L2[i * 4], L2[i * 4 + 1], L2[i * 4 + 2]].join()).join("|");
    if (/sand/.test(name)) assert.ok(covered.slice(0, 60).some((i) => L1[i * 4] > 60), "v1 shows the light fabric in the fringe"); }
  assert.equal(new Set(Object.values(looks)).size, 1, "the same edge for every material");
});
