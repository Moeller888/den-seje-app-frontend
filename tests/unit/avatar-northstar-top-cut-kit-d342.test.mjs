// D-342 — the top cut kit on SYNTHETIC inputs (no private file, no C): the three contracts validate; the tee and sweater contracts hold
// exactly the locked masters' per-cut data (TM.SPEC, LS.SPEC, D-269's box, D-335's split threshold and hip rows); the locked method files
// are unchanged; the kit's master is TM.buildMaster with the tee's contract, and a sleeveless contract gives one body panel; the kit's
// render and split equal TM.render's (threshold 128) and LS2.splitLayers' (threshold 1). The byte-for-byte reproduction of the approved
// layers runs on the owner's machine (northstar-top-cut-kit-study.mjs --phase control). Passing approves nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as WR from "../../tools/avatar/northstar-wardrobe.mjs";
import * as R1 from "../../tools/avatar/northstar-r1-garment.mjs";
import * as TM from "../../tools/avatar/northstar-tee-master.mjs";
import * as LS from "../../tools/avatar/northstar-longsleeve-master.mjs";
import * as LS2 from "../../tools/avatar/northstar-longsleeve-master-v2.mjs";
import * as K from "../../tools/avatar/northstar-top-cut-kit.mjs";

const { W, N } = WR, REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."), sha = (b) => createHash("sha256").update(b).digest("hex"), arr = (a) => sha(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
const json = (...p) => JSON.parse(readFileSync(join(REPO, ...p), "utf8"));

/** A synthetic top at the tee's coordinates (D-333's): body, two sleeves (or none), dark outline and seams, soft fold bands. */
function synthTop(sleeves = true) {
  const P = new Uint8ClampedArray(N * 4), inBody = (x, y) => x >= 400 && x <= 624 && y >= 470 && y <= 830, inSleeve = (x, y) => sleeves && y >= 490 && y <= 640 && ((x >= 330 && x < 400) || (x > 624 && x <= 694)), inside = (x, y) => inBody(x, y) || inSleeve(x, y);
  for (let y = 0; y < N / W; y++) for (let x = 0; x < W; x++) { if (!inside(x, y)) continue; const fold = 0.85 + 0.15 * Math.cos((x + y) / 23), edge = !inside(x - 2, y) || !inside(x + 2, y) || !inside(x, y - 2) || !inside(x, y + 2);
    const seam = sleeves && (Math.abs(x - (381 + (y - 500) * 0.2)) < 1.5 || Math.abs(x - (642 - (y - 500) * 0.2)) < 1.5), l = edge || seam ? 25 : Math.round(200 * fold); P.set([l, Math.round(l * 0.95), Math.round(l * 0.9), 255], (y * W + x) * 4); }
  return P;
}
/** C's arms, synthetic: opaque over the sleeves' outer half, a soft edge (alpha 100) one column wide. */
function synthArms() { const A = new Uint8ClampedArray(N * 4); for (let y = 480; y < 900; y++) for (const [x0, x1] of [[300, 372], [652, 724]]) for (let x = x0; x <= x1; x++) A[(y * W + x) * 4 + 3] = x === x0 || x === x1 ? 100 : 255; return A; }

test("D-342 the three contracts validate; a broken one is refused", () => {
  for (const id of ["tee-hip", "sweater-long", "tank"]) { const c = K.loadCut(id); assert.equal(c.id, id); assert.equal(c.contract, K.CONTRACT); assert.ok(c.oneTimeWork.length > 0); }
  const c = json("tools", "avatar", "fixtures", "northstar-wardrobe", "top-cuts", "tank.json");
  assert.throws(() => K.checkCut({ ...c, panels: { ...c.panels, seams: { left: [[1, 2]], right: [[1, 2]] } } }), /sleeveless cut has seams: null/);
  assert.throws(() => K.checkCut({ ...c, sleeves: { kind: "none", layerSplitFromArmAlpha: 64 } }), /layerSplitFromArmAlpha/);
  assert.throws(() => K.checkCut({ ...c, hipSeam: { rule: "LS2.hipSeamLayer", rows: [-45, 80] } }), /hipSeam/);
});

test("D-342 the tee and sweater contracts hold exactly the locked masters' per-cut data", () => {
  const tee = K.specOf(K.loadCut("tee-hip")), sw = K.specOf(K.loadCut("sweater-long"));
  for (const [s, ref] of [[tee, TM.SPEC], [sw, LS.SPEC]]) for (const k of ["seams", "seamSearchPx", "extendPx", "armpitOut", "warp"]) assert.deepEqual(s[k], JSON.parse(JSON.stringify(ref[k])), k);
  const box = json("tools", "avatar", "fixtures", "northstar-wardrobe", "tee-master", "tp-approval-candidates-v1.json").placement.boxOnC;
  for (const id of ["tee-hip", "sweater-long", "tank"]) assert.deepEqual(K.loadCut(id).print.boxOnC, box, id);
  assert.equal(K.loadCut("tee-hip").sleeves.layerSplitFromArmAlpha, 128); assert.equal(K.loadCut("sweater-long").sleeves.layerSplitFromArmAlpha, LS2.SLEEVE_FROM_ARM_ALPHA);
  assert.deepEqual(K.loadCut("sweater-long").hipSeam.rows, LS2.HIP_ROWS); assert.equal(K.loadCut("tee-hip").hipSeam, null);
  assert.equal(K.loadCut("sweater-long").source.item, LS.SOURCE.item); assert.equal(K.loadCut("sweater-long").source.run, LS.SOURCE.run);
});

test("D-342 the locked method files are unchanged (the kit only calls them)", () => {
  for (const [rel, want] of Object.entries(K.LOCKED)) assert.equal(sha(readFileSync(join(REPO, ...rel.split("/")))), want, rel);
  const pin = JSON.parse(readFileSync(join(REPO, "tools", "avatar", "fixtures", "northstar-wardrobe", "tee-master", "tp-validation-plan-v1.json"), "utf8")).lock.modules;
  assert.equal(pin["tools/avatar/northstar-tee-master.mjs"], K.LOCKED["tools/avatar/northstar-tee-master.mjs"]); assert.equal(pin["tools/avatar/northstar-tee-print-family.mjs"], K.LOCKED["tools/avatar/northstar-tee-print-family.mjs"]);
});

test("D-342 the kit's master is TM.buildMaster with the tee's contract; a sleeveless contract gives one body panel", () => {
  const layer = synthTop(), src = { layers: { topBody: layer } }, t = R1.templateFromLayers(src.layers, { category: "top", cut: "tee-hip" });
  const a = TM.buildMaster(t, src), b = K.buildMaster(K.loadCut("tee-hip"), t, src);
  for (const k of ["panel", "ratio", "disp"]) assert.equal(arr(b[k]), arr(a[k]), k); assert.deepEqual(b.seams, a.seams); assert.deepEqual(b.axes, a.axes); assert.equal(b.base, a.base);
  const L2 = synthTop(false), s2 = { layers: { topBody: L2 } }, t2 = R1.templateFromLayers(s2.layers, { category: "top", cut: "tank" }), m = K.buildMaster(K.loadCut("tank"), t2, s2);
  let core = 0, body = 0; for (let i = 0; i < N; i++) { if (t2.core[i]) core++; if (m.panel[i] === 0) body++; }
  assert.equal(m.sizes.left, 0); assert.equal(m.sizes.right, 0); assert.equal(body, core); assert.ok(core > 50000);
  assert.throws(() => K.buildMaster(K.loadCut("tee-hip"), t2, s2), /no sleeve panel/);
});

test("D-342 render and split: threshold 128 is TM.render's split, threshold 1 is LS2.splitLayers'", () => {
  const layer = synthTop(), src = { layers: { topBody: layer } }, t = R1.templateFromLayers(src.layers, { category: "top", cut: "tee-hip" }), base = { arms: synthArms() }, bands = new Uint8Array(N);
  const tee = K.loadCut("tee-hip"), master = K.buildMaster(tee, t, src), rgb = [158, 160, 164], ref = TM.render(master, t, base, bands, { body: rgb });
  const r = K.renderDesign({ c: tee, t, master, E: { base }, bands }, { rgb });
  assert.equal(arr(r.layer), arr(ref.layer)); assert.equal(arr(r.layers.topBody), arr(ref.layers.topBody)); assert.equal(arr(r.layers.sleeves), arr(ref.layers.sleeves)); assert.equal(r.movedToSleevesPx, 0);
  const long = { ...tee, sleeves: { kind: "short", layerSplitFromArmAlpha: 1 } }, r1 = K.renderDesign({ c: long, t, master, E: { base }, bands }, { rgb }), sp = LS2.splitLayers(ref.layer, base, 1);
  assert.equal(arr(r1.layers.sleeves), arr(sp.layers.sleeves)); assert.equal(r1.movedToSleevesPx, sp.moved); assert.ok(sp.moved > 0, "the soft edge moved to the sleeve layer");
});
