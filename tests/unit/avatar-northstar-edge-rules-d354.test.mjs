// D-354 — the shared edge rules of the top cut kit (no private file needed): the rim outside the contour takes C's own colour beside it
// (figure-or-ink; the contour ink against background; alpha unchanged, nothing inside touched), and the plain contour-ink variant; a column band's seam is one smooth curve over all its columns (no spike, no skipped corner); a
// one-row gap in a band is closed; a soft edge joins the band one step from its core pixels only (it never creeps along the outline);
// the corner closure works only around an opening; the D-354 contract versions and recipes differ from D-352's only where stated.
// Passing approves nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as K from "../../tools/avatar/northstar-top-cut-kit.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."), W = 1024, N = W * 1536, CUTS = join(REPO, "tools", "avatar", "fixtures", "northstar-wardrobe", "top-cuts");
const json = (f) => JSON.parse(readFileSync(join(CUTS, f), "utf8"));
const blank = () => ({ core: new Uint8Array(N), alpha: new Uint8Array(N), contour: new Uint8ClampedArray(N * 4) });

test("D-354 the rim rule: a fabric pixel outside the contour, against the outside, takes the contour ink; nothing else changes", () => {
  const t = blank(), layer = new Uint8ClampedArray(N * 4);
  for (let y = 500; y < 600; y++) for (let x = 400; x < 500; x++) { const i = y * W + x; t.alpha[i] = 255; layer.set([200, 60, 60, 255], i * 4); if (x > 401 && x < 498 && y > 501 && y < 598) t.core[i] = 1;
    if (x === 401 || x === 498 || y === 501 || y === 598) t.contour.set([20, 18, 16, 255], i * 4); }
  const before = Uint8ClampedArray.from(layer), n = K.rimToContourInk(t, layer);
  assert.equal(n, 2 * 100 + 2 * 98 - 8, "the one-pixel rim outside the outline (its 8 pixels that are contour ink stay ink)");
  for (let i = 0; i < N; i++) { assert.equal(layer[i * 4 + 3], before[i * 4 + 3], "alpha unchanged");
    const x = i % W, y = (i / W) | 0, rim = t.alpha[i] && !t.contour[i * 4 + 3] && (x === 400 || x === 499 || y === 500 || y === 599);
    if (rim) assert.deepEqual([...layer.subarray(i * 4, i * 4 + 3)], [20, 18, 16]); else assert.deepEqual([...layer.subarray(i * 4, i * 4 + 3)], [...before.subarray(i * 4, i * 4 + 3)]); }
});

// a body panel 400..599 x 500..699 whose bottom edge is rounded at its corners, with a dark seam line 14 px above the bottom edge
function hemPanel({ noisy = false } = {}) {
  const t = blank(), panel = new Int8Array(N).fill(-1), ratio = new Float32Array(N).fill(1), disp = new Float32Array(N * 2);
  for (let x = 400; x < 600; x++) { const corner = x < 406 ? 406 - x : x > 593 ? x - 593 : 0, bottom = 699 - corner * 2;
    for (let y = 500; y <= bottom; y++) { const i = y * W + x; t.core[i] = 1; t.alpha[i] = 255; panel[i] = 0; }
    const seam = 699 - 14 + (noisy && x % 17 === 0 ? 6 : 0); ratio[seam * W + x] = 0.4; }
  return { t, master: { panel, ratio, disp, axes: [] } };
}

test("D-354 the rim rule figure-or-ink: a rim pixel beside C takes C's colour there (alpha kept: it still covers), beside background the ink", () => {
  const t = blank(), layer = new Uint8ClampedArray(N * 4), R = new Uint8ClampedArray(N * 4);
  for (let y = 500; y < 600; y++) for (let x = 400; x < 500; x++) { const i = y * W + x; t.alpha[i] = 255; layer.set([200, 60, 60, 255], i * 4); if (x > 401 && x < 498 && y > 501 && y < 598) t.core[i] = 1;
    if (x === 401 || x === 498 || y === 501 || y === 598) t.contour.set([20, 18, 16, 255], i * 4); }
  for (let y = 480; y < 620; y++) for (let x = 380; x < 450; x++) R.set([240, 190, 150, 255], (y * W + x) * 4);   // C beside the left half only
  const r = K.rimEdge(t, layer, { R });
  assert.ok(r.figure > 0 && r.ink > 0 && r.figure + r.ink === 388, JSON.stringify(r));
  assert.deepEqual([...layer.subarray((550 * W + 400) * 4, (550 * W + 400) * 4 + 4)], [240, 190, 150, 255], "left rim: C's colour, still opaque");
  assert.deepEqual([...layer.subarray((550 * W + 499) * 4, (550 * W + 499) * 4 + 4)], [20, 18, 16, 255], "right rim: the contour ink");
  assert.deepEqual([...layer.subarray((550 * W + 450) * 4, (550 * W + 450) * 4 + 4)], [200, 60, 60, 255], "inside: untouched");
});

test("D-354 the seam curve: one smooth line over all the region's columns, also where a column's own edge is skipped; no spike", () => {
  const { t, master } = hemPanel({ noisy: true }), region = { name: "hem", panel: "body", edge: "bottom", x: [400, 599], edgeY: [690, 705], depth: [8, 24] };
  const v1 = K.seamBands({ trim: { bands: "seam-rule", regions: [region] } }, t, master).band, v2 = K.seamBands({ trim: { bands: "seam-rule", revision: 2, regions: [region] } }, t, master).band;
  const top = (b, x) => { for (let y = 500; y < 700; y++) if (b[y * W + x]) return y; return null; };
  assert.equal(top(v1, 401), null, "revision 1 skips a column whose edge lies outside edgeY (the rounded corner)");
  for (let x = 400; x < 600; x++) { const y = top(v2, x); assert.ok(y !== null, "revision 2 covers column " + x); if (x > 406 && x < 593) assert.ok(Math.abs(y - 685) <= 1, x + ": " + y); }
  let step = 0; for (let x = 408; x < 592; x++) step = Math.max(step, Math.abs(top(v2, x + 1) - top(v2, x))); assert.ok(step <= 1, "no spike: " + step);
});

test("D-354 a one-row gap is closed; a soft edge joins one step from the band's core only; the corner closure needs an opening", () => {
  const { t, master } = hemPanel(); // a soft fringe of 3 rows under the bottom edge, columns 450..459
  for (let y = 700; y < 703; y++) for (let x = 450; x < 460; x++) t.alpha[y * W + x] = 120;
  const region = { name: "hem", panel: "body", edge: "bottom", x: [400, 599], depth: [8, 24] }, c = { trim: { bands: "seam-rule", revision: 2, regions: [region] } };
  const r = K.seamBands(c, t, master), b = r.band;
  for (let x = 450; x < 460; x++) assert.ok(b[700 * W + x] && !b[701 * W + x] && !b[702 * W + x], "the soft edge: one step, no creeping (" + x + ")");
  assert.equal(r.regions.cornerPx, 0, "no opening, no corner closure");
  const gapT = blank(), gapM = { panel: new Int8Array(N).fill(0), ratio: new Float32Array(N).fill(1) }, band = new Uint8Array(N);
  for (let y = 600; y < 610; y++) for (let x = 400; x < 420; x++) { gapT.core[y * W + x] = 1; if (y !== 605) band[y * W + x] = 1; }
  for (let x = 400; x < 420; x++) gapM.panel[605 * W + x] = 2;   // the gap row on another panel (a seam), as at the shoulder
  assert.equal(K.gapClosure(gapT, gapM, band), 20); for (let x = 400; x < 420; x++) assert.equal(band[605 * W + x], 1);
  const open = new Uint8Array(N); for (let x = 400; x < 420; x++) open[600 * W + x] = 1; assert.equal(K.gapClosure(gapT, gapM, open), 0, "an edge is not a gap");
});

test("D-354 the contract versions and recipes: only the stated fields differ; they validate", () => {
  for (const [v, base, keys] of [["tee-hip-v2", "tee-hip", ["id", "label", "edges", "oneTimeWork", "derivedFrom"]], ["sweater-long-v3", "sweater-long-v2", ["id", "label", "trim", "edges", "oneTimeWork", "derivedFrom"]], ["tank-v5", "tank-v4", ["id", "label", "trim", "edges", "oneTimeWork", "derivedFrom"]]]) {
    const a = json(v + ".json"), b = json(base + ".json"), strip = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));
    assert.doesNotThrow(() => K.checkCut(a)); assert.deepEqual(strip(a), strip(b), v); assert.equal(a.edges.rim, "figure-or-ink");
    if (a.trim.bands === "seam-rule") { const { revision, revisionWhy, ...rest } = a.trim; assert.equal(revision, 2); assert.deepEqual(rest, b.trim); } }
  assert.throws(() => K.checkCut({ ...json("tank-v5.json"), edges: { rim: "fabric" } }), /edges.rim/);
  assert.throws(() => K.checkCut({ ...json("tank-v5.json"), trim: { ...json("tank-v5.json").trim, revision: 3 } }), /trim.revision/);
  const v2 = json("production-trial-recipes-v2.json"), v3 = json("production-trial-recipes-v3.json");
  assert.deepEqual(v3.recipes, v2.recipes); assert.equal(v3.printFit, v2.printFit); assert.deepEqual(v3.cuts, ["tee-hip-v2", "sweater-long-v3", "tank-v5"]); assert.match(v3.kind, /NOT approved, NOT published/);
});
