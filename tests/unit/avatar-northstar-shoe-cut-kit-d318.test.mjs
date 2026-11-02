// D-318 — the shoe cut kit on SYNTHETIC inputs (no private file, no C): the sneaker contract holds exactly the numbers that were spread
// over the locked modules (D-299's pins, unchanged); the kit's geometry equals northstar-shoe-source.mjs's for that contract; the kit's K
// route renders a synthetic shoe exactly as SS.renderAtK; the ankle-boot contract is valid; the opening check passes normal overlap, a
// tongue rising inside the opening and skin in the opening, and fails a hole, material on the shin, a notch below the opening floor and a
// shoe moved up. Passing approves no item.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as WR from "../../tools/avatar/northstar-wardrobe.mjs";
import * as SM from "../../tools/avatar/northstar-shoe-master.mjs";
import * as SS from "../../tools/avatar/northstar-shoe-source.mjs";
import * as E2 from "../../tools/avatar/northstar-shoe-eval-v2.mjs";
import * as R1 from "../../tools/avatar/northstar-r1-garment.mjs";
import * as KIT from "../../tools/avatar/northstar-shoe-cut-kit.mjs";

const { W, N } = WR, sha = (px) => createHash("sha256").update(Buffer.from(px.buffer ? px.buffer : px)).digest("hex");
const SN = KIT.loadCut("sneaker-low"), AB = KIT.loadCut("ankle-boot");

test("D-318 the sneaker contract holds the locked modules' numbers unchanged; the ankle-boot contract is valid and its own", () => {
  assert.deepEqual(SN.source.crop, { ...SS.CROP }); assert.equal(SN.source.K, SS.K); assert.equal(SN.source.splitX, SS.SPLIT_X);
  assert.deepEqual(Object.fromEntries(Object.entries(SN.fields).map(([k, v]) => [v.slot, v.seeds])), JSON.parse(JSON.stringify(SM.SPEC.seeds)));
  assert.deepEqual(SN.opening.zone, { ...E2.COLLAR_ZONE }); assert.equal(SN.referenceItem, SM.SPEC.source);
  assert.deepEqual(Object.keys(AB.fields), ["upper", "sole"]); assert.equal(AB.opening.type, "shaft"); assert.equal(AB.referenceItem, "shoes-ankleboots-brown");
  assert.throws(() => KIT.checkCut({ ...SN, fields: { a: { slot: "upper", seeds: [] }, b: { slot: "upper", seeds: [] } } }), /own master group slot/);
  assert.throws(() => KIT.checkCut({ ...SN, source: { ...SN.source, splitX: 10 } }), /splitX/);
});

test("D-318 the kit's geometry from the sneaker contract equals northstar-shoe-source.mjs's", () => {
  const s4 = SS.synthShoe(4), layer = SS.place(SS.synthShoe(1));
  assert.equal(sha(KIT.layoutCanvas(layer, SN).px), sha(SS.layoutCanvas(layer).px));
  const a = KIT.downscale(s4, SN), b = SS.downscale(s4); assert.equal(sha(a.px), sha(b.px)); assert.equal(sha(KIT.place(a, SN, 1, -2)), sha(SS.place(b, 1, -2)));
  for (const side of ["left", "right"]) { assert.equal(sha(KIT.tileOf(s4, SN, side)), sha(SS.tileOf(s4, side))); assert.deepEqual(KIT.seedsAtK(SN, side), JSON.parse(JSON.stringify(SS.seedsFor(side))));
    assert.deepEqual(JSON.parse(JSON.stringify(KIT.specAtK(SM.SPEC_V4, SN, side))), JSON.parse(JSON.stringify(SS.specAtK(SM.SPEC_V4, side, null)))); }
  assert.equal(sha(KIT.untile({ left: SS.tileOf(s4, "left"), right: SS.tileOf(s4, "right") }, SN).px), sha(SS.untile({ left: SS.tileOf(s4, "left"), right: SS.tileOf(s4, "right") }).px));
});

test("D-318 the kit's K route renders a synthetic shoe exactly as SS.renderAtK (the same master and design)", () => {
  const seeds = SS.cropSeedsAt1(SS.SYNTH_SEEDS), cut = KIT.checkCut({ ...SN, id: "synthetic", fields: Object.fromEntries(Object.entries(seeds).filter(([, p]) => p.length).map(([g, p]) => [g, { slot: g, seeds: p }])) });
  const tpl = (L) => R1.templateFromLayers({ shoes: L }, { category: "shoes", covering: "closed-footwear", cut: "synthetic" }), img = SS.synthShoe(4), NAVY = SM.designs()["contrast navy + white (SYNTHETIC)"];
  const a = KIT.renderAtK(img, cut, SM.SPEC_V4, SM.buildShoeMaster, { navy: NAVY }).navy;
  const b = SS.renderAtK(img, SM.SPEC_V4, NAVY, { seedsBySide: { left: SS.cropSeedsAtK(SS.SYNTH_SEEDS, "left"), right: SS.cropSeedsAtK(SS.SYNTH_SEEDS, "right") }, templateOf: tpl });
  assert.equal(sha(a), sha(b));
  assert.deepEqual(KIT.designFor(AB, { upper: [1, 2, 3], sole: [4, 5, 6] }), { upper: [1, 2, 3], sole: [4, 5, 6], toe: [1, 2, 3], laces: [1, 2, 3], tongue: [1, 2, 3] });
  assert.throws(() => KIT.designFor(AB, { upper: [1, 2, 3] }), /no colour for the field sole/);
});

test("D-318 the opening check: normal overlap, a tongue rising inside the opening and skin in the opening pass; a hole, material on the shin, a notch below the floor and a moved shoe fail", () => {
  // a synthetic leg entering the synthetic shoe (top y 1350): C's body is only this leg; nothing else is C
  const body = new Uint8ClampedArray(N * 4), arms = new Uint8ClampedArray(N * 4); for (let y = 1200; y < 1460; y++) for (let x = 396; x < 437; x++) body.set([240, 190, 150, 255], (y * W + x) * 4);
  const base = { body, arms }, ref = SS.place(SS.synthShoe(1)), cut = KIT.checkCut({ ...SN, id: "synthetic", opening: { type: "collar", zone: { y0: 1345, y1: 1370 }, riseMaxPx: 3, envelopePx: 2, parts: [] } });
  const edit = (f) => { const o = Uint8ClampedArray.from(ref); f(o); return o; }, fill = (o, x0, y0, x1, y1, a) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = (y * W + x) * 4; if (a) o.set([200, 180, 160, 255], i); else o[i + 3] = 0; } };
  const check = (L) => KIT.openingCheck(L, ref, base, cut);
  const self = check(ref); assert.ok(self.ok, self.problems.join()); assert.ok(self.measures.openingSkinPx > 0, "skin in the opening is seen and fine");
  assert.ok(check(edit((o) => fill(o, 405, 1347, 425, 1349, true))).ok, "a tongue rising 3 px inside the opening");
  const high = check(edit((o) => fill(o, 405, 1344, 425, 1349, true))); assert.ok(!high.ok && high.measures.wrongPx > 0, "rising 6 px is material over the wrong area");
  const hole = check(edit((o) => fill(o, 370, 1420, 374, 1424, false))); assert.ok(!hole.ok && hole.measures.holePx === 25);
  const shin = check(edit((o) => fill(o, 400, 1300, 420, 1310, true))); assert.ok(!shin.ok && shin.measures.wrongPx > 0);
  const notch = check(edit((o) => fill(o, 410, 1350, 412, 1390, false))); assert.ok(!notch.ok && notch.measures.throughFootPx > 0, "skin below the opening's floor is foot through the shoe");
  const moved = new Uint8ClampedArray(N * 4); for (let y = 4; y < 1536; y++) moved.set(ref.subarray(y * W * 4, (y + 1) * W * 4), (y - 4) * W * 4); assert.ok(!check(moved).ok, "the shoe moved 4 px up");
});
