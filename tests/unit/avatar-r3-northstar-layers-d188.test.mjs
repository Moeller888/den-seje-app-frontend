// R3 NORTHSTAR LAYER REVIEW VARIANT — D-188: Northstar v2's own pixels split into separate review layers, as a SEPARATE
// variant of the R3 review tool beside D-187. The tests bind the source and the tracked copies, rebuild every layer and mask
// pixel for pixel, pin the composite's deviation from the original, check layer order, alpha, overlaps and that no feature
// lies twice, rebuild the editable .ora deterministically, and prove the variant cannot be promoted by passing its checks.
// No image call, no runtime change; R3 stays default OFF.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng, pixelSha256 } from "../../tools/avatar/r3-hair-tool-v2.mjs";
import * as NL from "../../tools/avatar/r3-northstar-layers.mjs";
import { runVariantChecks, NOT_APPLICABLE, VARIANT } from "../../tools/avatar/r3-review-northstar-layers.mjs";
import { VARIANTS, loadPack } from "../../tools/avatar/r3-review-pack.mjs";
import { preD188Contract, PRE_D188_CONTRACT_CANONICAL_SHA256, PRE_D188_COMMIT, preD187Contract, PRE_D187_CONTRACT_CANONICAL_SHA256 } from "./avatar-r3-d147-closure.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const file = (rel) => readFileSync(join(REPO, ...rel.split("/")));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const LIVE = JSON.parse(file("tools/avatar/fixtures/r3/r3-shadow-contract-v1.json").toString("utf8"));
const NR = LIVE.northstarLayerReview;
const TR = NL.loadTracked();
const MAN = TR.man;
const BUILD = NL.buildLayers();
const N = 1024 * 1536;

test("D-188 adds exactly the top-level key northstarLayerReview: the contract minus it is the D-187 merge", () => {
  assert.equal(sha(JSON.stringify(preD188Contract(LIVE))), PRE_D188_CONTRACT_CANONICAL_SHA256, "canonical contract at " + PRE_D188_COMMIT);
  assert.equal(sha(JSON.stringify(preD187Contract(LIVE))), PRE_D187_CONTRACT_CANONICAL_SHA256, "and the older chain still holds");
  assert.equal(Object.keys(LIVE).at(-1), "northstarLayerReview");
  assert.deepEqual([NR.decision, NR.isAuthorisation, NR.authorisesImageRequest, NR.authorisesUpload], ["D-188", false, false, false]);
  assert.deepEqual(LIVE.authorisedCalls.calls.filter((e) => e.mandateState === "UNSPENT"), [], "no live permission");
  const sent = LIVE.imageCallBudget.callsActuallySentSoFar;
  assert.deepEqual([LIVE.imageCallBudget.minimum, LIVE.imageCallBudget.maximum, sent.underlay, sent.hair], [26, 27, 5, 4], "no capacity, no call");
  assert.equal(LIVE.architecture.defaultEnabled, false, "R3 stays default OFF");
  const layersJs = file("js/avatar-layers.js").toString("utf8");
  assert.ok(!/AVATAR_R3\s*=\s*true/.test(layersJs), "R3 stays OFF at runtime");
  assert.ok(!/northstar-layers|northstarLayerReview|r3-northstar-layers/.test(layersJs), "the active renderer knows nothing of the variant");
  assert.match(NR.pixelSourceException.scope, /review variant northstar-layers .* only/);
  assert.match(NR.pixelSourceException.notWidened, /still holds for the D-187 pack/);
  assert.match(NR.pixelSourceException.h1, /unchanged/);
  for (const x of ["a production asset or promotion", "a runtime change or a change to the active renderer", "an R3 body asset", "a skin, iris or hair token or recolouring method", "a change to D-187 or any earlier decision"]) assert.ok(NR.notApproved.includes(x), x);
  assert.match(NR.notEvidenceFor, /other hairstyles, skin tones or expressions/);
});

test("source binding: only the tracked Northstar v2 with its sha256; the tracked copies are pinned, binary and H1-free", () => {
  const src = file(NL.SOURCE.file);
  assert.equal(sha(src), NL.SOURCE.sha256);
  assert.equal(NR.pixelSourceException.source.sha256, NL.SOURCE.sha256);
  const tampered = Buffer.from(src); tampered[tampered.length - 20] ^= 0xff;
  assert.throws(() => NL.loadSource(tampered), /not the tracked Northstar Master v2/);
  assert.throws(() => NL.buildLayers({ srcBuf: tampered }), /not the tracked Northstar Master v2/);
  assert.equal(MAN.source.sha256, NL.SOURCE.sha256);
  assert.equal(sha(file(NL.SPEC_FILE)), MAN.spec.sha256);
  assert.equal(MAN.spec.sha256, MAN.move.prototypeFileSha256["spec.json"], "the spec is the prototype's byte copy");
  for (const e of [...Object.values(MAN.layers), ...Object.values(MAN.masks)]) assert.equal(sha(file(e.file)), e.sha256, e.file);
  assert.match(file(NL.FIXTURES + ".gitattributes").toString("utf8"), /^\* binary$/m, "git never normalises the copies");
  const tracked = execFileSync("git", ["ls-files", NL.FIXTURES], { cwd: REPO, encoding: "utf8" }).split("\n").filter(Boolean);
  assert.ok(tracked.length > 0 && tracked.every((f) => !/h1|fitting-base/i.test(f)), "no private reference among the tracked files");
  assert.ok(!tracked.some((f) => /body|face\.png|\.ora$/i.test(f)), "the comparison body, the face helper and the .ora are not tracked");
  assert.ok(!/fitting-base|H1\.png/.test(file("tools/avatar/r3-northstar-layers.mjs").toString("utf8")), "the generator never names H1");
});

test("the tracked generator rebuilds every layer and mask pixel for pixel, and the helper and comparison exports", () => {
  for (const k of NL.COMPOSITE_ORDER) {
    const got = pixelSha256(BUILD.layers[k]);
    assert.equal(got, MAN.layers[k].pixelSha256, k);
    assert.equal(pixelSha256(decodePng(TR.files[k]).px), got, k + " tracked file");
  }
  for (const k of NL.MASKS) {
    const got = pixelSha256(BUILD.masks[k]);
    assert.equal(got, MAN.masks[k].pixelSha256, k);
    assert.equal(pixelSha256(decodePng(TR.files[k]).px), got, k + " tracked file");
  }
  assert.equal(pixelSha256(BUILD.helper.face), MAN.helperExports.face.pixelSha256);
  assert.equal(pixelSha256(BUILD.comparisonOnly.body), MAN.comparisonOnly.body.pixelSha256);
  assert.deepEqual(BUILD.stats, MAN.stats);
});

test("the default composite in original colours: deviation from Northstar pinned, head and comparison composites pinned", () => {
  const comp = NL.composeOriginalComparison(BUILD), dev = NL.deviation(BUILD.src, comp);
  assert.deepEqual(dev, MAN.composite.deviationFromOriginal);
  assert.deepEqual([dev.visiblePx, dev.bitIdenticalPx, dev.maxRgb, dev.maxAlpha], [391180, 377143, 5, 5]);
  assert.deepEqual(dev.rgb, { 0: 380751, "1-2": 10402, "3-5": 27, "6-16": 0, ">16": 0 });
  assert.equal(pixelSha256(comp), MAN.composite.withComparisonBodyPixelSha256);
  assert.equal(pixelSha256(NL.composeHead(BUILD.layers)), MAN.composite.headPixelSha256);
});

test("layer order, helper and comparison exports, alpha and overlaps", () => {
  assert.deepEqual([...NL.COMPOSITE_ORDER], ["skin", "hairShadow", "browL", "browR", "nose", "mouth", "iris", "eyesFixed", "hair"]);
  assert.deepEqual([...NL.COMPOSITE_ORDER], NR.variant.compositeOrder);
  assert.deepEqual([...NL.COMPOSITE_ORDER], MAN.compositeOrder);
  assert.throws(() => NL.composeHead({ ...BUILD.layers, face: BUILD.helper.face }), /helper export/, "the face helper is never composed over the parts");
  assert.throws(() => NL.composeHead({ ...BUILD.layers, body: BUILD.comparisonOnly.body }), /comparison only/, "the body is not an R3 layer");
  assert.throws(() => NL.composeHead(BUILD.layers, { include: ["skin", "face"] }), /not a compositing layer/);
  // the order matters: hair under the face parts differs from the pinned head
  const swapped = NL.overStack([...NL.COMPOSITE_ORDER].reverse().map((k) => BUILD.layers[k]));
  assert.notEqual(pixelSha256(swapped), MAN.composite.headPixelSha256);
  // alpha: no layer is more opaque than the original at any pixel; skin keeps the original alpha where it was reconstructed
  for (const k of NL.COMPOSITE_ORDER) { let over = 0; const p = BUILD.layers[k]; for (let i = 0; i < N; i++) if (p[i * 4 + 3] > BUILD.src[i * 4 + 3]) over++; assert.equal(over, 0, k); }
  let reconAlpha = 0; for (let i = 0; i < N; i++) if (BUILD.masks.reconstructed[i * 4 + 3] && BUILD.layers.skin[i * 4 + 3] && BUILD.layers.skin[i * 4 + 3] !== BUILD.src[i * 4 + 3]) reconAlpha++;
  assert.equal(reconAlpha, 0);
  // overlaps only on opaque pixels, and only between the recorded layers
  for (const m of ["overlap-ink-hair-features", "overlap-ink-hair-skin"]) { let soft = 0, n = 0; for (let i = 0; i < N; i++) if (BUILD.masks[m][i * 4 + 3]) { n++; if (BUILD.src[i * 4 + 3] < 250 || !BUILD.layers.hair[i * 4 + 3]) soft++; } assert.ok(n > 0, m); assert.equal(soft, 0, m); }
});

test("no feature lies twice: the skin layer has no eye, brow, nose or mouth ink and no sclera; features carry no skin plate", () => {
  const checks = runVariantChecks({ tracked: TR, build: BUILD, spec: NL.loadSpec() });
  const nd = checks.checks.find((c) => c.id === "NO-DOUBLE-FEATURES");
  assert.equal(nd.ok, true);
  assert.deepEqual(nd.value.inkPxInSkinByZone, { eyeL: 0, eyeR: 0, browL: 0, browR: 0, nose: 0, mouth: 0 });
  assert.equal(nd.value.scleraWhitePxInSkin, 0);
  // the brow, nose and mouth layers hold no skin PLATE: no opaque skin-coloured region, only scattered halo pixels. Their count
  // is a recorded, open finding (D-188 openAreas): where the skin's red channel is already ~249-255 the exact lift of the light
  // sharpening halo needs alpha 1. Pinned so any change is seen; it is not a tolerance and not an approval.
  const op = checks.checks.find((c) => c.id === "OPAQUE-LIGHT-PX");
  assert.deepEqual(op.value, { browL: 3, browR: 45, nose: 17, mouth: 18, eyesFixed: 103, hairShadow: 87 });
  assert.match(NR.openAreas.join(" "), /83 opaque light halo px in the brow, nose and mouth layers/);
  const largest = {}; // the largest 4-connected opaque skin-coloured component per part: edge specks and one 11 px edge row, no plate
  for (const k of NL.FACE_PARTS) {
    const p = BUILD.layers[k], on = (i) => p[i * 4 + 3] >= 250 && NL.cls(p[i * 4], p[i * 4 + 1], p[i * 4 + 2], 255) === "S", seen = new Uint8Array(N); let L = 0;
    for (let s = 0; s < N; s++) { if (seen[s] || !on(s)) continue; let n = 0; const st = [s]; seen[s] = 1; while (st.length) { const i = st.pop(); n++; for (const j of [i - 1, i + 1, i - 1024, i + 1024]) if (!seen[j] && on(j)) { seen[j] = 1; st.push(j); } } L = Math.max(L, n); }
    largest[k] = L;
  }
  assert.deepEqual(largest, { browL: 3, browR: 11, nose: 4, mouth: 9 }, "measured and pinned");
  // the iris and the fixed eye parts are separate: they overlap ONLY where the highlight (fixed layer) lies over the iris
  // reconstructed under it — never on observed iris pixels
  let both = 0, outsideRecon = 0;
  for (let i = 0; i < N; i++) if (BUILD.layers.iris[i * 4 + 3] && BUILD.layers.eyesFixed[i * 4 + 3]) { both++; if (!BUILD.masks.reconstructed[i * 4 + 3]) outsideRecon++; }
  assert.ok(both > 0, "the highlights exist");
  assert.equal(outsideRecon, 0);
});

test("reproducible: a second build is pixel-identical and the .ora rebuilds to the same bytes with pinned members", () => {
  const again = NL.buildLayers();
  for (const k of NL.COMPOSITE_ORDER) assert.equal(pixelSha256(again.layers[k]), MAN.layers[k].pixelSha256, k);
  const a = NL.buildOraFromTracked(BUILD, TR), b = NL.buildOraFromTracked(again, TR);
  assert.equal(sha(a), sha(b), "deterministic .ora");
  // walk the stored zip: names, and every member's pixels
  const members = {}; let off = 0;
  while (a.readUInt32LE(off) === 0x04034b50) { const size = a.readUInt32LE(off + 18), nl = a.readUInt16LE(off + 26), name = a.subarray(off + 30, off + 30 + nl).toString("utf8"); members[name] = a.subarray(off + 30 + nl, off + 30 + nl + size); off += 30 + nl + size; }
  assert.deepEqual(Object.keys(members), MAN.editableSource.members);
  assert.equal(members.mimetype.toString(), "image/openraster");
  for (const k of NL.COMPOSITE_ORDER) assert.equal(sha(members[`data/${k}.png`]), MAN.layers[k].sha256, k + " is the tracked byte copy");
  for (const k of NL.MASKS) assert.equal(sha(members[`data/mask-${k}.png`]), MAN.masks[k].sha256, k);
  assert.equal(pixelSha256(decodePng(members["data/body.png"]).px), MAN.comparisonOnly.body.pixelSha256);
  assert.equal(pixelSha256(decodePng(members["mergedimage.png"]).px), MAN.composite.withComparisonBodyPixelSha256);
  const xml = members["stack.xml"].toString("utf8");
  assert.match(xml, /<layer name="KUN SAMMENLIGNING — Northstars krop, ikke et R3-asset" src="data\/body.png" x="0" y="0" opacity="1.0" visibility="hidden"\/>/);
  assert.match(xml, /<stack name="Masker \(skjult\)" visibility="hidden">/);
});

test("review only: every check passes, yet the variant is never promotable; D-187 is unchanged and stays the default", () => {
  const checks = runVariantChecks({ tracked: TR, build: BUILD, spec: NL.loadSpec() });
  assert.equal(checks.firstFailure, null);
  assert.ok(checks.checks.filter((c) => c.kind === "binding").every((c) => c.ok === true));
  assert.equal(NL.promotionStatus().promotable, false, "passing checks never make it promotable");
  assert.throws(() => NL.promote(), /cannot be promoted/);
  assert.match(MAN.status, /not approved, not promotable/);
  assert.match(NR.promotion, /never promotable by passing technical checks/);
  // the checks that presuppose another geometry or authoring method are reported, not run, each with a reason
  const na = checks.checks.filter((c) => c.ok === null);
  assert.equal(na.length, NOT_APPLICABLE.length);
  assert.ok(na.some((c) => /G1V3 \+ E2 \+ K4/.test(c.name)) && na.some((c) => /hair targets/.test(c.name)) && na.some((c) => /D-159 envelope/.test(c.name)));
  // the D-187 path is untouched: default variant, Northstar still refused as a source there
  assert.deepEqual([...VARIANTS], ["d187", "northstar-layers", "both"]);
  assert.equal(VARIANT, "northstar-layers");
  assert.match(file("tools/avatar/r3-review-pack.mjs").toString("utf8"), /const variant = arg\("--variant"\) \?\? "d187"/);
  assert.match(loadPack.toString(), /northstar/, "D-187's loadPack still refuses a Northstar source file");
  assert.ok(!JSON.stringify(JSON.parse(file("tools/avatar/fixtures/r3-review-pack/review-pack-v1.json").toString("utf8")).sources).includes("Northstar"));
});
