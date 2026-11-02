// D-319 — the locked cut evaluation (northstar-shoe-cut-evaluate.mjs) and the layout-reference guide on SYNTHETIC inputs (no C, no private
// file): a freestanding stroke tip on a K source is caught and a rounded corner is not; the guide removes stroke tips and skin specks in
// the opening band only; shape catches a moved or resized shoe; the fields catch a merged field; the conclusion never turns an
// automatic FAIL into PASS. Passing approves no source or item.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as WR from "../../tools/avatar/northstar-wardrobe.mjs";
import * as SS from "../../tools/avatar/northstar-shoe-source.mjs";
import * as KIT from "../../tools/avatar/northstar-shoe-cut-kit.mjs";
import * as EV from "../../tools/avatar/northstar-shoe-cut-evaluate.mjs";
import * as REF from "../../tools/avatar/northstar-shoe-cut-reference.mjs";

const { W, N } = WR, SN = KIT.loadCut("sneaker-low");
// the synthetic shoe's top lies at avatar y 1350 (CROP y 80): an opening zone just above it
const cut = KIT.checkCut({ ...SN, id: "synthetic", fields: Object.fromEntries(Object.entries(SS.cropSeedsAt1(SS.SYNTH_SEEDS)).filter(([, p]) => p.length).map(([g, p]) => [g, { slot: g, seeds: p, minPxPerSide: 0 }])), opening: { type: "shaft", zone: { y0: 1345, y1: 1360 }, riseMaxPx: 3, envelopePx: 2, parts: [] } });
const K = SS.K, at = (img, ax, ay) => ((ay - SS.CROP.y0) * K * img.w + (ax - SS.CROP.x0) * K) * 4;

test("D-319 a freestanding stroke tip on the K source is caught; the shoe's own (rounded) top is not", () => {
  const img = SS.synthShoe(K); assert.deepEqual(EV.strokeTips(img, cut), { left: [], right: [] }, "the plain synthetic shoe has no tip");
  const tip = { ...img, px: Uint8ClampedArray.from(img.px) }; for (let y = 0; y < 6 * K; y++) for (let x = 0; x < K; x++) tip.px.set([40, 30, 20, 255], at(tip, 380, 1344) + (y * tip.w + x) * 4);
  const t = EV.strokeTips(tip, cut); assert.equal(t.left.length, 1); assert.ok(t.left[0].heightPx >= EV.ACCEPT.tipMinHeightPx);
  const nub = { ...img, px: Uint8ClampedArray.from(img.px) }; for (let y = 0; y < 2 * K; y++) for (let x = 0; x < K; x++) nub.px.set([40, 30, 20, 255], at(nub, 380, 1348) + (y * nub.w + x) * 4);
  assert.deepEqual(EV.strokeTips(nub, cut).left, [], "a 2 px nub (a corner's top rows) is not a tip");
});

test("D-319 the guide removes stroke tips and skin specks in the opening band only", () => {
  const L = SS.place(SS.synthShoe(1)), g0 = REF.guideLayer(L, cut); assert.deepEqual(g0.removed, { tips: 0, skin: 0 });
  const d = Uint8ClampedArray.from(L); for (let y = 1340; y < 1350; y++) d.set([40, 30, 20, 255], (y * W + 380) * 4); d.set([254, 214, 152, 255], (1352 * W + 400) * 4); d.set([254, 214, 152, 255], (1420 * W + 400) * 4);
  const g = REF.guideLayer(d, cut); assert.ok(g.removed.tips >= 10); assert.ok(g.removed.skin >= 1);
  assert.equal(g.layer[(1352 * W + 400) * 4 + 3], 0, "a speck in the band goes"); assert.equal(g.layer[(1420 * W + 400) * 4 + 3], 255, "below the band nothing is touched");
});

test("D-319 shape and fields: a moved or resized shoe and a merged field are rejected", () => {
  const ref = SS.place(SS.synthShoe(1)); assert.ok(EV.shapeCheck(ref, ref, cut).ok === false, "one synthetic shoe is one piece, not two");
  const two = Uint8ClampedArray.from(ref); for (let y = 0; y < 1536; y++) for (let x = 0; x < 512; x++) if (ref[(y * W + x) * 4 + 3]) two.set(ref.subarray((y * W + x) * 4, (y * W + x) * 4 + 4), (y * W + 1023 - x) * 4);
  assert.ok(EV.shapeCheck(two, two, cut).ok); const moved = new Uint8ClampedArray(N * 4); for (let y = 5; y < 1536; y++) moved.set(two.subarray(y * W * 4, (y + 1) * W * 4), (y - 5) * W * 4);
  assert.ok(!EV.shapeCheck(moved, two, cut).ok);
  assert.ok(EV.fieldCheck(ref, cut).ok, "the synthetic shoe's fields are separate");
  const merged = KIT.checkCut({ ...cut, fields: { ...cut.fields, toe: { slot: "toe", seeds: [cut.fields.upper.seeds[0]], minPxPerSide: 0 } } }); const f = EV.fieldCheck(ref, merged); assert.ok(!f.ok && /two groups/.test(f.problems.join()));
});

test("D-319 the conclusion never turns an automatic FAIL into PASS; a PASS needs a visual OK", () => {
  const check = { verdict: "REJECTED SOURCE" }, chain = { designs: { a: { verdict: "NOT USABLE" }, b: { verdict: "USABLE DESIGN (automatic)" } } }, outfits = { units: { "a | x": { verdict: "FAIL", technical: "PASS", failed: [] } } };
  const c = EV.conclude(check, chain, outfits, { source: { verdict: "OK" }, "design: a": { verdict: "OK" }, "design: b": { verdict: "OK" }, "combination: a | x": { verdict: "OK" } });
  assert.equal(c.source.usable, false); assert.equal(c.designs.a.usable, false); assert.equal(c.designs.b.usable, true); assert.equal(c.combinations["a | x"].usable, false);
  assert.equal(EV.conclude(check, chain, outfits, null).designs.b.usable, false, "no visual review: not usable");
  assert.match(EV.VERDICT.scope, /not a general validation/);
});
