// D-281 — the solid trousers the owner approved as candidates (D-279), prepared as items: the candidate file is unambiguous (ID, colour,
// master version, D-279's rendering), the build refuses anything else, the pinned master modules are the ones in the repository, and the
// proposed item entry is the olive trousers' shape with their published skin shadow reused. The layers themselves are built and checked
// on the owner's machine (C is private, D-127 §2); passing these tests is not an item approval.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import * as PS from "../../tools/avatar/build-northstar-pants-solid-layers.mjs";
import * as PM from "../../tools/avatar/northstar-pants-master.mjs";
import * as AL from "../../js/avatar-layers.js";

const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");
const C = JSON.parse(readFileSync(PS.CANDIDATES, "utf8"));
const pins = { pantsModuleSha: sha("tools/avatar/northstar-pants-master.mjs"), renderModuleSha: sha("tools/avatar/northstar-tee-master.mjs") };
const clone = () => JSON.parse(JSON.stringify(C));

test("D-281 the candidate file names exactly navy and sand through pants-master-v2, with D-279's colours", () => {
  const list = PS.candidatesOf(C, pins);
  assert.deepEqual(list.map((k) => [k.id, k.item, k.rgb]), [["TS-NAV", "bottom-trousers-square-navy", [48, 66, 110]], ["TS-SND", "bottom-trousers-square-sand", [214, 190, 140]]]);
  const mats = PM.materials(); for (const k of list) assert.deepEqual(mats[k.variant], k.rgb, k.id + " is D-279's solid");
  assert.equal(C.master.revision, PM.SPEC_V2.revision); assert.ok(Object.keys(C.notCandidates).every((v) => !/^solid /.test(v)), "the patterns stay technical samples");
});

test("D-281 the build refuses a changed master, a pattern, the olive item or another rendering", () => {
  assert.throws(() => PS.candidatesOf(C, { ...pins, pantsModuleSha: "0".repeat(64) }), /pants master module/);
  assert.throws(() => PS.candidatesOf(C, { ...pins, renderModuleSha: "0".repeat(64) }), /render/);
  let c = clone(); c.candidates["TS-STR"] = { item: "bottom-trousers-square-stripe", variant: "stripe (SYNTHETIC, along the leg, 24 px)", rgb: [0, 0, 0], layerPngSha256: "x" };
  assert.throws(() => PS.candidatesOf(c, pins), /not a solid variant/);
  c = clone(); c.candidates["TS-NAV"].item = PS.SHADOW_OF; assert.throws(() => PS.candidatesOf(c, pins), /not a new trousers-square item/);
  c = clone(); c.master.revision = "pants-master-v1"; assert.throws(() => PS.candidatesOf(c, pins), /not pants-master-v2/);
  assert.throws(() => PS.candidatesOf(C, { ...pins, studyLayers: { "solid navy (SYNTHETIC)": { sha256: "y", alphaEqualsCut: true } } }), /not D-279's rendering/);
});

test("D-281 the proposed item entry is the olive trousers' shape; the new items are not in the runtime", () => {
  const olive = AL.NORTHSTAR_ITEMS[PS.SHADOW_OF];
  assert.deepEqual(PS.ITEM_SHAPE, { category: olive.category, layers: olive.layers, shadows: olive.shadows });
  for (const k of Object.values(C.candidates)) assert.equal(AL.NORTHSTAR_ITEMS[k.item], undefined, k.item + " is not integrated");
  assert.equal(AL.AVATAR_NORTHSTAR_WARDROBE, false);
});

test("D-281 the advisory colour classes use D-271's thresholds", () => {
  assert.deepEqual([0.2, 0.15, 0.12, 0.1, 0.05].map(PS.contrastClass), ["clear", "clear", "borderline", "borderline", "weak"]);
});
