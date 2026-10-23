// R3 NORTHSTAR AFRO REVIEW DERIVATIVE — D-192: the full-resolution R2 afro original (D-113) placed once on the unchanged D-191
// head, its own hairline displaced out of the face (nothing cut) and the D-191 head's slit closed behind it. The tests bind the
// source and the D-191 baseline, rebuild everything, prove the derivative clears the brows, covers the cranium, stays on the
// canvas and keeps its scallops, prove D-191 and the default with Northstar's hair are unchanged, and that nothing can be
// promoted. No image call; R3 stays default OFF.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng, pixelSha256 } from "../../tools/avatar/r3-hair-tool-v2.mjs";
import * as NL from "../../tools/avatar/r3-northstar-layers.mjs";
import * as HS from "../../tools/avatar/r3-northstar-hairstyles.mjs";
import * as AF from "../../tools/avatar/r3-northstar-afro.mjs";
import { runVariantChecks, SCALLOP_BAND_PX } from "../../tools/avatar/r3-review-northstar-afro.mjs";
import { VARIANTS } from "../../tools/avatar/r3-review-pack.mjs";
import { preD192Contract, PRE_D192_CONTRACT_CANONICAL_SHA256, PRE_D192_COMMIT, preD191Contract, PRE_D191_CONTRACT_CANONICAL_SHA256, preD193Contract } from "./avatar-r3-d147-closure.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const file = (rel) => readFileSync(join(REPO, ...rel.split("/")));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const LIVE = JSON.parse(file("tools/avatar/fixtures/r3/r3-shadow-contract-v1.json").toString("utf8"));
const KEY = LIVE.northstarAfroReview;
const TR = AF.loadTracked(), MAN = TR.man;
const BUILD = AF.buildAfro();
const CHECKS = runVariantChecks({ tracked: TR, build: BUILD });
const byId = Object.fromEntries(CHECKS.checks.map((c) => [c.id, c]));
const N = 1024 * 1536;

test("D-192 adds exactly the top-level key northstarAfroReview: the contract minus it is the D-191 merge", () => {
  assert.equal(sha(JSON.stringify(preD192Contract(LIVE))), PRE_D192_CONTRACT_CANONICAL_SHA256, "canonical contract at " + PRE_D192_COMMIT);
  assert.equal(sha(JSON.stringify(preD191Contract(LIVE))), PRE_D191_CONTRACT_CANONICAL_SHA256, "and the older chain still holds");
  assert.equal(Object.keys(preD193Contract(LIVE)).at(-1), "northstarAfroReview", "the last key D-192 added (D-193 appends northstarEarfixQuizReview after it)");
  assert.deepEqual([KEY.decision, KEY.isAuthorisation, KEY.authorisesImageRequest, KEY.authorisesUpload], ["D-192", false, false, false]);
  assert.deepEqual(LIVE.authorisedCalls.calls.filter((e) => e.mandateState === "UNSPENT"), [], "no live permission");
  assert.equal(LIVE.architecture.defaultEnabled, false, "R3 stays default OFF");
  const layersJs = file("js/avatar-layers.js").toString("utf8");
  assert.ok(!/AVATAR_R3\s*=\s*true/.test(layersJs) && !/northstar-afro|northstarAfroReview/.test(layersJs));
  assert.match(LIVE.northstarHairstylesReview.hairstyles.afro.status, /^UNSUITABLE/, "D-191's record of its afro derivative is unchanged");
  assert.ok(KEY.notApproved.includes("the afro as an R3 production asset"));
  assert.equal(KEY.variant.baseline.manifestSha256, MAN.baseline.manifestSha256);
});

test("source binding: the D-113 full-resolution original, read only; the D-191 baseline byte-identical", () => {
  const spec = AF.loadSpec();
  assert.equal(sha(file(spec.source.file)), "0dacc5ce56f9915bb1fb2abe2774355f8ebda60319b2daa8e4779cfd07fa6bfd");
  const src = decodePng(file(spec.source.file)); assert.deepEqual([src.header.w, src.header.h], [1024, 1536], "the full resolution, not the 512 webp");
  const bad = structuredClone(spec); bad.source.sha256 = "0".repeat(64);
  assert.throws(() => AF.loadSource(bad), /not the pinned D-113 afro/);
  assert.equal(sha(file(HS.MANIFEST_FILE)), MAN.baseline.manifestSha256, "the D-191 manifest is byte-identical to the baseline");
  assert.equal(MAN.baseline.mergeCommit, PRE_D192_COMMIT);
  assert.equal(sha(file(AF.SPEC_FILE)), MAN.spec.sha256);
  for (const e of [...Object.values(MAN.layers), ...Object.values(MAN.masks)]) assert.equal(sha(file(e.file)), e.sha256, e.file);
  assert.match(file(AF.FIXTURES + ".gitattributes").toString("utf8"), /^\* binary$/m);
  const tracked = execFileSync("git", ["ls-files", AF.FIXTURES], { cwd: REPO, encoding: "utf8" }).split("\n").filter(Boolean);
  assert.ok(tracked.length > 0 && tracked.every((f) => !/h1|fitting-base/i.test(f)));
  assert.equal(byId["SOURCE-D113"].ok, true); assert.equal(byId["BASELINE-D191"].ok, true);
});

test("rebuild: both layers and both masks equal their tracked files; the composite and stats are pinned", () => {
  for (const k of AF.LAYERS) { assert.equal(pixelSha256(BUILD.layers[k]), MAN.layers[k].pixelSha256, k); assert.equal(pixelSha256(decodePng(TR.files[k]).px), MAN.layers[k].pixelSha256, k + " file"); }
  for (const k of AF.MASKS) assert.equal(pixelSha256(BUILD.masks[k]), MAN.masks[k].pixelSha256, k);
  assert.deepEqual(BUILD.stats, MAN.stats);
  assert.equal(pixelSha256(AF.composeAfro(BUILD)), MAN.composite.afroPixelSha256);
  assert.equal(byId.REBUILD.ok, true); assert.equal(byId.MEASUREMENTS.ok, true);
});

test("overlap: brows clear, cranium covered beyond the scallop band, nothing on the canvas edge, one mass, scallops kept", () => {
  const m = CHECKS.measurements;
  assert.deepEqual([m.browCoverage.browL.coveredPx, m.browCoverage.browR.coveredPx], [0, 0]);
  assert.ok(m.browCoverage.browL.browPx > 1000 && m.browCoverage.browR.browPx > 1000, "the complete D-190 brows");
  assert.equal(m.cranium.beyondBandCoveredPx, m.cranium.beyondBandPx); assert.ok(m.cranium.beyondBandPx > 10000);
  assert.equal(SCALLOP_BAND_PX, 8);
  assert.deepEqual([m.canvas.pxWithin4OfEdge, m.canvas.topRow], [0, 8]);
  assert.deepEqual([m.components.count, m.components.smallUnder50], [1, 0]);
  assert.ok(m.hairlineRoughnessPx.after >= 0.8 * m.hairlineRoughnessPx.before);
  // the back hair lies only behind the head, never on the face or over the afro, and only in the ear band
  const bald = BUILD.bald, A = BUILD.layers.afro, B = BUILD.layers.backHair; let onHead = 0, onAfro = 0, outBand = 0, n = 0;
  for (let i = 0; i < N; i++) { if (!B[i * 4 + 3]) continue; n++; if (bald[i * 4 + 3] >= 128) onHead++; if (A[i * 4 + 3] >= 128) onAfro++; const y = (i / 1024) | 0; if (y < 300 || y > 430) outBand++; }
  assert.deepEqual([onHead, onAfro, outBand], [0, 0, 0]); assert.equal(n, MAN.stats.headSlitFillPx);
  // the afro stays R2's grey luminance map: no chroma
  let chroma = 0; for (let i = 0; i < N; i++) if (A[i * 4 + 3]) chroma = Math.max(chroma, Math.max(A[i * 4], A[i * 4 + 1], A[i * 4 + 2]) - Math.min(A[i * 4], A[i * 4 + 1], A[i * 4 + 2])); assert.equal(chroma, 0);
  for (const id of ["BROWS-CLEAR", "CRANIUM-COVERED", "NOT-CROPPED", "ONE-MASS", "SCALLOPS-KEPT"]) assert.equal(byId[id].ok, true, id);
});

test("the default and D-191 unchanged: every D-191 situation composes as recorded; no cast shadow on the afro", () => {
  const hs = HS.loadTracked().man;
  for (const s of ["bald", "northstar", "short", "afro"]) assert.equal(pixelSha256(HS.composeSituation(BUILD.head, s)), hs.situations[s], s);
  assert.deepEqual(MAN.baseline.situations, hs.situations);
  assert.equal(pixelSha256(AF.composeAfro(BUILD)), pixelSha256(NL.overStack([HS.tint(BUILD.layers.backHair), BUILD.bald, HS.tint(BUILD.layers.afro)])));
  assert.equal(MAN.composite.shadow, "none");
  assert.equal(byId["D191-SITUATIONS-UNCHANGED"].ok, true); assert.equal(byId.COMPOSITION.ok, true);
});

test("review only: every check passes, yet nothing is promotable; earlier variants unchanged", () => {
  assert.equal(CHECKS.firstFailure, null);
  assert.ok(CHECKS.checks.every((c) => c.ok === true));
  assert.equal(AF.promotionStatus().promotable, false);
  assert.throws(() => AF.promote(), /cannot be promoted/);
  assert.deepEqual([...VARIANTS].slice(0, 7), ["d187", "northstar-layers", "both", "northstar-head", "northstar-brow", "northstar-hairstyles", "northstar-afro"], "D-192's variants are kept (D-193 appends northstar-earfix-quiz)");
  assert.match(file("tools/avatar/r3-review-pack.mjs").toString("utf8"), /const variant = arg\("--variant"\) \?\? "d187"/);
});
