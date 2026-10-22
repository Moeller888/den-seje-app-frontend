// R3 NORTHSTAR BROW REVIEW VARIANT — D-190: the image-left brow completed by the D-158 mirroring on the unchanged D-189
// baseline. The tests bind the source and the baseline, rebuild the brow and its masks, check the D-158 fit (measured midline,
// translation only, no pixel on safe skin) against D-158's own result, prove every observed pixel is kept and nothing changed
// outside the area the hair hid, and prove the variant cannot be promoted. No image call, no runtime change; R3 stays OFF.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng, pixelSha256 } from "../../tools/avatar/r3-hair-tool-v2.mjs";
import * as NL from "../../tools/avatar/r3-northstar-layers.mjs";
import * as HD from "../../tools/avatar/r3-northstar-head.mjs";
import * as BR from "../../tools/avatar/r3-northstar-brow.mjs";
import { runVariantChecks, changeReport } from "../../tools/avatar/r3-review-northstar-brow.mjs";
import { VARIANTS } from "../../tools/avatar/r3-review-pack.mjs";
import { preD190Contract, PRE_D190_CONTRACT_CANONICAL_SHA256, PRE_D190_COMMIT, preD189Contract, PRE_D189_CONTRACT_CANONICAL_SHA256 } from "./avatar-r3-d147-closure.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const file = (rel) => readFileSync(join(REPO, ...rel.split("/")));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const LIVE = JSON.parse(file("tools/avatar/fixtures/r3/r3-shadow-contract-v1.json").toString("utf8"));
const BRK = LIVE.northstarBrowReview;
const TR = BR.loadTracked(), MAN = TR.man;
const BUILD = BR.buildBrow();
const N = 1024 * 1536;

test("D-190 adds exactly the top-level key northstarBrowReview: the contract minus it is the D-189 merge", () => {
  assert.equal(sha(JSON.stringify(preD190Contract(LIVE))), PRE_D190_CONTRACT_CANONICAL_SHA256, "canonical contract at " + PRE_D190_COMMIT);
  assert.equal(sha(JSON.stringify(preD189Contract(LIVE))), PRE_D189_CONTRACT_CANONICAL_SHA256, "and the older chain still holds");
  assert.equal(Object.keys(LIVE).at(-1), "northstarBrowReview");
  assert.deepEqual([BRK.decision, BRK.isAuthorisation, BRK.authorisesImageRequest, BRK.authorisesUpload], ["D-190", false, false, false]);
  assert.deepEqual(LIVE.authorisedCalls.calls.filter((e) => e.mandateState === "UNSPENT"), [], "no live permission");
  assert.equal(LIVE.architecture.defaultEnabled, false, "R3 stays default OFF");
  const layersJs = file("js/avatar-layers.js").toString("utf8");
  assert.ok(!/AVATAR_R3\s*=\s*true/.test(layersJs) && !/northstar-brow|northstarBrowReview|r3-northstar-brow/.test(layersJs));
  assert.equal(BRK.method.binding, "D-158 (1)(b)–(h)");
  assert.ok(BRK.openAreas.some((x) => /D-158 \(h\)/.test(x)), "the brow is still to be judged in the D-158 (h) situations");
});

test("source and baseline binding; the tracked files are pinned, binary and H1-free", () => {
  const src = file(NL.SOURCE.file), tampered = Buffer.from(src); tampered[tampered.length - 20] ^= 0xff;
  assert.throws(() => BR.buildBrow({ srcBuf: tampered }), /not the tracked Northstar Master v2/);
  assert.equal(sha(file(HD.MANIFEST_FILE)), MAN.baseline.manifestSha256, "the D-189 manifest is byte-identical to the baseline");
  assert.equal(MAN.baseline.mergeCommit, PRE_D190_COMMIT);
  assert.equal(pixelSha256(HD.composeHead(BUILD.base.layers)), MAN.baseline.headPixelSha256);
  assert.equal(sha(file(BR.SPEC_FILE)), MAN.spec.sha256);
  for (const e of [...Object.values(MAN.layers), ...Object.values(MAN.masks)]) assert.equal(sha(file(e.file)), e.sha256, e.file);
  assert.match(file(BR.FIXTURES + ".gitattributes").toString("utf8"), /^\* binary$/m);
  const tracked = execFileSync("git", ["ls-files", BR.FIXTURES], { cwd: REPO, encoding: "utf8" }).split("\n").filter(Boolean);
  assert.ok(tracked.length > 0 && tracked.every((f) => !/h1|fitting-base/i.test(f)));
});

test("the D-158 fit: measured midline, translation only, no pixel on safe skin, the same place as D-158's own fit", () => {
  const s = BUILD.stats;
  assert.deepEqual(s, MAN.stats);
  assert.equal(s.sourceBrowPx, 1122, "the visible image-right brow (D-158 measured 1,120 on the original)");
  assert.ok(Math.abs(s.axis - 510.9) < 1.5, "the measured midline lies within 1.5 px of D-158's 510.90");
  assert.deepEqual([s.fit.stage, s.fit.rotationDeg, s.fit.scale, s.fit.skinPx], ["translation", 0, 1, 0], "translation alone was enough");
  assert.ok(s.raw.skin > 0, "the raw mirror needed the adjustment");
  // D-158 found tx −5, ty +4 about x = 510.90; the same absolute place about this axis is tx −5 + 2·(510.90 − axis)
  const d158tx = -5 + 2 * (510.9 - s.axis);
  assert.ok(Math.abs(s.fit.tx - d158tx) <= 1 && s.fit.ty === 4, `the fit (${s.fit.tx}, ${s.fit.ty}) is D-158's place (${d158tx.toFixed(2)}, 4) within 1 px`);
  assert.ok(s.fit.iou > s.raw.iou && s.fit.recall > s.raw.recall);
});

test("completion: every observed pixel kept; the mirror only where the hair hid it; nothing changed outside that mask", () => {
  for (const k of BR.MASKS) assert.equal(pixelSha256(BUILD.masks[k]), MAN.masks[k].pixelSha256, k);
  assert.equal(pixelSha256(BUILD.layers.browL), MAN.layers.browL.pixelSha256);
  assert.equal(pixelSha256(decodePng(TR.files.browL).px), MAN.layers.browL.pixelSha256);
  const O = BUILD.base.layers.browL, L = BUILD.layers.browL, fill = BUILD.masks["brow-mirror-fill"], miss = decodePng(NL.loadTracked().files["missing-under-hair"]).px;
  let lost = 0, fillOutsideHidden = 0, fillOnObserved = 0;
  for (let i = 0; i < N; i++) { if (O[i * 4 + 3] && (O[i * 4] !== L[i * 4] || O[i * 4 + 1] !== L[i * 4 + 1] || O[i * 4 + 2] !== L[i * 4 + 2] || O[i * 4 + 3] !== L[i * 4 + 3])) lost++; if (fill[i * 4 + 3]) { if (!miss[i * 4 + 3]) fillOutsideHidden++; if (O[i * 4 + 3]) fillOnObserved++; } }
  assert.deepEqual([lost, fillOutsideHidden, fillOnObserved], [0, 0, 0]);
  const ch = changeReport(BUILD);
  assert.deepEqual(ch, MAN.changesVsD189);
  assert.deepEqual([ch.layerPxOutsideFill, ch.compositeWithHair.outsideFillPx, ch.compositeWithHair.underNonOpaqueHairPx], [0, 0, 0]);
  assert.ok(ch.compositeWithHair.maxRgb <= 2, "with hair the change stays under the opaque hair");
  assert.equal(BUILD.stats.filledPx, ch.layerPxChanged);
  for (const k of HD.COMPOSITE_ORDER) if (k !== "browL") assert.equal(pixelSha256(BUILD.layers[k]), MAN.reused[k].pixelSha256, k + " reused");
});

test("review only: every check passes, yet the variant is never promotable; earlier variants unchanged", () => {
  const checks = runVariantChecks({ tracked: TR, build: BUILD });
  assert.equal(checks.firstFailure, null);
  assert.ok(checks.checks.every((c) => c.ok === true));
  assert.equal(BR.promotionStatus().promotable, false);
  assert.throws(() => BR.promote(), /cannot be promoted/);
  assert.deepEqual([...VARIANTS], ["d187", "northstar-layers", "both", "northstar-head", "northstar-brow"]);
  assert.match(file("tools/avatar/r3-review-pack.mjs").toString("utf8"), /const variant = arg\("--variant"\) \?\? "d187"/);
  assert.equal(pixelSha256(BR.buildBrow().layers.browL), MAN.layers.browL.pixelSha256, "a second build is identical");
});
