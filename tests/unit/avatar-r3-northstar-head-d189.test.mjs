// R3 NORTHSTAR HEAD REVIEW VARIANT — D-189: on the unchanged D-188 baseline, a reconstructed cranium and ear roots under the
// hair (design, not observed pixels) as their own layer, cleaned brow/nose/mouth edges by local-ink projection, and the hair's
// edge residue moved from the skin to the hair. The tests bind the source and the baseline, rebuild every derived layer and
// mask, prove that nothing changed outside the explicit edit masks, pin the composite, keep the nose shadow and highlights,
// and prove the variant cannot be promoted. No image call, no runtime change; R3 stays default OFF.
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
import { runVariantChecks, changeReport, EDIT_MASK_OF } from "../../tools/avatar/r3-review-northstar-head.mjs";
import { VARIANTS } from "../../tools/avatar/r3-review-pack.mjs";
import { preD190Contract, preD189Contract, PRE_D189_CONTRACT_CANONICAL_SHA256, PRE_D189_COMMIT, preD188Contract, PRE_D188_CONTRACT_CANONICAL_SHA256 } from "./avatar-r3-d147-closure.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const file = (rel) => readFileSync(join(REPO, ...rel.split("/")));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const LIVE = JSON.parse(file("tools/avatar/fixtures/r3/r3-shadow-contract-v1.json").toString("utf8"));
const HR = LIVE.northstarHeadReview;
const TR = HD.loadTracked(), MAN = TR.man;
const BUILD = HD.buildHead();
const BODY = NL.buildLayers().comparisonOnly.body;
const N = 1024 * 1536;
const luma = (p, i) => 0.299 * p[i * 4] + 0.587 * p[i * 4 + 1] + 0.114 * p[i * 4 + 2];

test("D-189 adds exactly the top-level key northstarHeadReview: the contract minus it is the D-188 merge", () => {
  assert.equal(sha(JSON.stringify(preD189Contract(LIVE))), PRE_D189_CONTRACT_CANONICAL_SHA256, "canonical contract at " + PRE_D189_COMMIT);
  assert.equal(sha(JSON.stringify(preD188Contract(LIVE))), PRE_D188_CONTRACT_CANONICAL_SHA256, "and the older chain still holds");
  assert.equal(Object.keys(preD190Contract(LIVE)).at(-1), "northstarHeadReview", "the last key D-189 added (D-190 appends northstarBrowReview after it)");
  assert.deepEqual([HR.decision, HR.isAuthorisation, HR.authorisesImageRequest, HR.authorisesUpload], ["D-189", false, false, false]);
  assert.deepEqual(LIVE.authorisedCalls.calls.filter((e) => e.mandateState === "UNSPENT"), [], "no live permission");
  assert.deepEqual([LIVE.imageCallBudget.minimum, LIVE.imageCallBudget.maximum], [26, 27], "no capacity");
  assert.equal(LIVE.architecture.defaultEnabled, false, "R3 stays default OFF");
  const layersJs = file("js/avatar-layers.js").toString("utf8");
  assert.ok(!/AVATAR_R3\s*=\s*true/.test(layersJs) && !/northstar-head|northstarHeadReview|r3-northstar-head/.test(layersJs), "the renderer knows nothing of it");
  assert.match(HR.reconstructed.cranium, /^RECONSTRUCTED DESIGN, not observed pixels/);
  for (const x of ["OPEN: the hidden end and upper edge of the image-left brow (the hair lock covered it)", "OPEN: the sclera behind the iris", "OPEN: new expressions and closed eyelids"]) assert.ok(HR.openAreas.includes(x), x);
  for (const x of ["the cranium's shape", "a production asset or promotion", "a change to D-188, D-187 or any earlier decision"]) assert.ok(HR.notApproved.includes(x), x);
});

test("source and baseline binding: Northstar v2 by hash, D-188 unchanged and read through its pins; tracked files pinned and H1-free", () => {
  const src = file(NL.SOURCE.file), tampered = Buffer.from(src); tampered[tampered.length - 20] ^= 0xff;
  assert.throws(() => HD.buildHead({ srcBuf: tampered }), /not the tracked Northstar Master v2/);
  assert.equal(MAN.source.sha256, NL.SOURCE.sha256);
  assert.equal(sha(file(NL.MANIFEST_FILE)), MAN.baseline.manifestSha256, "the D-188 manifest is byte-identical to the baseline D-189 was built on");
  assert.equal(MAN.baseline.mergeCommit, PRE_D189_COMMIT);
  for (const e of [...Object.values(NL.loadTracked().man.layers), ...Object.values(NL.loadTracked().man.masks)]) assert.equal(sha(file(e.file)), e.sha256, "D-188 " + e.file);
  assert.equal(sha(file(HD.SPEC_FILE)), MAN.spec.sha256);
  for (const e of [...Object.values(MAN.layers), ...Object.values(MAN.masks)]) assert.equal(sha(file(e.file)), e.sha256, e.file);
  assert.match(file(HD.FIXTURES + ".gitattributes").toString("utf8"), /^\* binary$/m);
  const tracked = execFileSync("git", ["ls-files", HD.FIXTURES], { cwd: REPO, encoding: "utf8" }).split("\n").filter(Boolean);
  assert.ok(tracked.length > 0 && tracked.every((f) => !/h1|fitting-base|body/i.test(f)));
  assert.ok(!/fitting-base|H1\.png/.test(file("tools/avatar/r3-northstar-head.mjs").toString("utf8")));
});

test("rebuild: every derived layer and mask equals its tracked file; reused layers are D-188's; a second build is identical", () => {
  for (const k of HD.BUILT) { assert.equal(pixelSha256(BUILD.layers[k]), MAN.layers[k].pixelSha256, k); assert.equal(pixelSha256(decodePng(TR.files[k]).px), MAN.layers[k].pixelSha256, k + " file"); }
  for (const k of HD.MASKS) { assert.equal(pixelSha256(BUILD.masks[k]), MAN.masks[k].pixelSha256, k); assert.equal(pixelSha256(decodePng(TR.files[k]).px), MAN.masks[k].pixelSha256, k + " file"); }
  for (const [k, e] of Object.entries(MAN.reusedFromD188)) assert.equal(pixelSha256(BUILD.layers[k]), e.pixelSha256, k);
  assert.deepEqual(Object.keys(MAN.reusedFromD188), ["hairShadow", "iris", "eyesFixed"]);
  const again = HD.buildHead();
  for (const k of HD.BUILT) assert.equal(pixelSha256(again.layers[k]), MAN.layers[k].pixelSha256, k + " again");
  assert.deepEqual(BUILD.stats, MAN.stats);
});

test("bounded edits: nothing changed outside the explicit edit masks, per layer and in the composite; semi-transparent hair edges untouched", () => {
  const ch = changeReport(BUILD, BODY);
  assert.deepEqual(ch, MAN.changesVsD188);
  assert.equal(ch.outsideEditMasksPx, 0);
  for (const [k, n] of Object.entries(ch.perLayerOutsideEditMaskPx)) assert.equal(n, 0, k);
  assert.deepEqual(Object.keys(ch.perLayerOutsideEditMaskPx).sort(), [...HD.COMPOSITE_ORDER].sort());
  assert.ok(!Object.keys(ch.byCause).some((k) => /SEMI-TRANSPARENT|no cover/.test(k)), "no change under a semi-transparent hair edge and no uncovered cranium in the default composite");
  for (const [k, v] of Object.entries(ch.byCause)) if (/^cranium|residue/.test(k)) assert.ok(v.maxRgb <= 2, k);
  assert.deepEqual(EDIT_MASK_OF, { skin: "skin-to-hair", hair: "skin-to-hair", browL: "feature-edit", browR: "feature-edit", nose: "feature-edit", mouth: "feature-edit", cranium: "cranium-region" });
});

test("composition: order, pinned composites and deviation, the bare head without the hair shadow", () => {
  assert.deepEqual([...HD.COMPOSITE_ORDER], ["cranium", "skin", "hairShadow", "browL", "browR", "nose", "mouth", "iris", "eyesFixed", "hair"]);
  assert.deepEqual([...HD.COMPOSITE_ORDER], MAN.compositeOrder);
  assert.equal(pixelSha256(HD.composeHead(BUILD.layers)), MAN.composite.headPixelSha256);
  const comp = HD.composeOriginalComparison(BUILD, BODY);
  assert.equal(pixelSha256(comp), MAN.composite.withComparisonBodyPixelSha256);
  assert.deepEqual(NL.deviation(BUILD.src, comp), MAN.composite.deviationFromOriginal);
  const bald = HD.composeHead(BUILD.layers, { include: HD.COMPOSITE_ORDER.filter((k) => k !== "hair" && k !== "hairShadow") });
  assert.equal(pixelSha256(bald), MAN.composite.baldHeadPixelSha256);
  assert.throws(() => HD.composeHead({ ...BUILD.layers, face: new Uint8ClampedArray(N * 4) }), /not a compositing layer/);
  // the cranium is a closed, opaque head: no hole between the visible skin and the painted cranium inside the region
  let holes = 0; for (let i = 0; i < N; i++) if (BUILD.masks["cranium-region"][i * 4 + 3] && bald[i * 4 + 3] < 250 && BUILD.layers.cranium[i * 4 + 3] === 255) holes++;
  assert.equal(holes, 0);
  // the hair shadow layer is D-188's and lies only where the bald head is (it is never baked into the cranium or the skin)
  assert.equal(pixelSha256(BUILD.layers.hairShadow), NL.loadTracked().man.layers.hairShadow.pixelSha256);
});

test("feature edges: halo gone, nose shadow and highlights kept, removed pixels were lighter than the skin", () => {
  const checks = runVariantChecks({ tracked: TR, build: BUILD, body: BODY });
  assert.deepEqual(checks.checks.find((c) => c.id === "OPAQUE-LIGHT-PX").value, { browL: 0, browR: 0, nose: 0, mouth: 0 }, "D-188 had 3 / 45 / 17 / 18");
  const S = BUILD.layers.skin, src = BUILD.src;
  let notLighter = 0, n = 0; for (let i = 0; i < N; i++) if (BUILD.masks["halo-removed"][i * 4 + 3]) { n++; if (!(luma(src, i) > luma(S, i))) notLighter++; }
  assert.ok(n > 0); assert.equal(notLighter, 0, "every removed halo pixel was lighter than the skin under it");
  // the painted nose shadow keeps its colour: its D-188 pixels with alpha >= 0.3 that changed keep a warm, saturated ink
  const n0 = BUILD.baseline.nose, n1 = BUILD.layers.nose; let warm = 0, shade = 0;
  for (let i = 0; i < N; i++) if (n0[i * 4 + 3] >= 0.3 * 255 && n0[i * 4] > 180 && n0[i * 4 + 2] < 120) { shade++; if (n1[i * 4 + 3] && n1[i * 4] > 180 && n1[i * 4] - n1[i * 4 + 2] > 80) warm++; }
  assert.ok(shade > 40 && warm === shade, `nose shadow kept warm (${warm}/${shade})`);
  // white highlights survive (the nose's white dot)
  const white = (L) => { let w = 0; for (let i = 0; i < N; i++) if (L[i * 4 + 3] >= 250 && NL.cls(L[i * 4], L[i * 4 + 1], L[i * 4 + 2], 255) === "W") w++; return w; };
  assert.equal(white(n1), white(n0), "the nose highlight is unchanged");
  // the hair's own outline left the left brow and is still in the hair
  const shared = decodePng(NL.loadTracked().files["overlap-ink-hair-features"]).px; let stray = 0;
  for (let i = 0; i < N; i++) if (shared[i * 4 + 3] && BUILD.layers.browL[i * 4 + 3] && BUILD.layers.hair[i * 4 + 3] >= 250) stray++;
  assert.equal(stray, 0);
});

test("review only: every binding check passes, yet the variant is never promotable; earlier variants unchanged", () => {
  const checks = runVariantChecks({ tracked: TR, build: BUILD, body: BODY });
  assert.equal(checks.firstFailure, null);
  assert.ok(checks.checks.filter((c) => c.kind === "binding").every((c) => c.ok === true));
  assert.equal(HD.promotionStatus().promotable, false);
  assert.throws(() => HD.promote(), /cannot be promoted/);
  assert.match(MAN.status, /not approved, not promotable/);
  assert.deepEqual([...VARIANTS].slice(0, 4), ["d187", "northstar-layers", "both", "northstar-head"], "D-189's variants are kept (D-190 appends northstar-brow)");
  assert.match(file("tools/avatar/r3-review-pack.mjs").toString("utf8"), /const variant = arg\("--variant"\) \?\? "d187"/, "D-187 stays the default");
  assert.ok(checks.checks.some((c) => c.ok === null && /G1V3/.test(c.id)), "geometry checks reported not applicable");
});
