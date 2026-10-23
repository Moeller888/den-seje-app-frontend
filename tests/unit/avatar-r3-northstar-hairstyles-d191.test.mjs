// R3 NORTHSTAR HAIRSTYLES REVIEW VARIANT — D-191: on the unchanged D-190 baseline, the brow's hair-lock remnants move to the
// Northstar hair (D-190's classification corrected), sideburn tips leave the skin, the lit skin under the hair's cast shadow
// is refitted, and R2's short and afro are placed on the v2 head as review derivatives (the afro UNSUITABLE). The tests bind
// every source, prove the edits stay inside their masks and the default with Northstar's hair keeps its pixels, rebuild
// everything, pin the brow coverage per hairstyle, and prove nothing can be promoted. No image call; R3 stays default OFF.
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
import * as HS from "../../tools/avatar/r3-northstar-hairstyles.mjs";
import { runVariantChecks, changeReport, browCoverage, SITUATIONS } from "../../tools/avatar/r3-review-northstar-hairstyles.mjs";
import { VARIANTS } from "../../tools/avatar/r3-review-pack.mjs";
import { preD191Contract, PRE_D191_CONTRACT_CANONICAL_SHA256, PRE_D191_COMMIT, preD190Contract, PRE_D190_CONTRACT_CANONICAL_SHA256 } from "./avatar-r3-d147-closure.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const file = (rel) => readFileSync(join(REPO, ...rel.split("/")));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const LIVE = JSON.parse(file("tools/avatar/fixtures/r3/r3-shadow-contract-v1.json").toString("utf8"));
const KEY = LIVE.northstarHairstylesReview;
const TR = HS.loadTracked(), MAN = TR.man;
const BUILD = HS.buildHairstyles();
const CHECKS = runVariantChecks({ tracked: TR, build: BUILD });
const N = 1024 * 1536;

test("D-191 adds exactly the top-level key northstarHairstylesReview: the contract minus it is the D-190 merge", () => {
  assert.equal(sha(JSON.stringify(preD191Contract(LIVE))), PRE_D191_CONTRACT_CANONICAL_SHA256, "canonical contract at " + PRE_D191_COMMIT);
  assert.equal(sha(JSON.stringify(preD190Contract(LIVE))), PRE_D190_CONTRACT_CANONICAL_SHA256, "and the older chain still holds");
  assert.equal(Object.keys(LIVE).at(-1), "northstarHairstylesReview");
  assert.deepEqual([KEY.decision, KEY.isAuthorisation, KEY.authorisesImageRequest, KEY.authorisesUpload], ["D-191", false, false, false]);
  assert.deepEqual(LIVE.authorisedCalls.calls.filter((e) => e.mandateState === "UNSPENT"), [], "no live permission");
  assert.equal(LIVE.architecture.defaultEnabled, false, "R3 stays default OFF");
  const layersJs = file("js/avatar-layers.js").toString("utf8");
  assert.ok(!/AVATAR_R3\s*=\s*true/.test(layersJs) && !/northstar-hairstyles|northstarHairstylesReview/.test(layersJs));
  assert.match(KEY.hairstyles.afro.status, /^UNSUITABLE/);
  assert.ok(KEY.notApproved.includes("R2 short or afro as an R3 asset"));
  assert.match(KEY.d190Correction, /D-190's row and files are not rewritten/);
});

test("source binding: Northstar v2, the merged D-190 baseline, R2's untouched webp originals and their pinned decodes", () => {
  const src = file(NL.SOURCE.file), tampered = Buffer.from(src); tampered[tampered.length - 20] ^= 0xff;
  assert.throws(() => HS.buildHairstyles({ srcBuf: tampered }), /not the tracked Northstar Master v2/);
  assert.equal(sha(file(BR.MANIFEST_FILE)), MAN.baseline.manifestSha256, "the D-190 manifest is byte-identical to the baseline");
  assert.equal(MAN.baseline.mergeCommit, PRE_D191_COMMIT);
  assert.equal(pixelSha256(HD.composeHead(BUILD.base.layers)), MAN.baseline.headPixelSha256);
  for (const s of HS.STYLES) { const r = HS.R2_SOURCES[s]; assert.equal(sha(file(r.webp)), r.webpSha256, s + " webp untouched"); assert.equal(pixelSha256(HS.loadR2(s)), r.pixelSha256, s + " decode"); assert.equal(decodePng(file(r.png)).header.w, 512); }
  assert.equal(sha(file(HS.SPEC_FILE)), MAN.spec.sha256);
  for (const e of [...Object.values(MAN.layers), ...Object.values(MAN.styles), ...Object.values(MAN.masks)]) assert.equal(sha(file(e.file)), e.sha256, e.file);
  assert.match(file(HS.FIXTURES + ".gitattributes").toString("utf8"), /^\* binary$/m);
  const tracked = execFileSync("git", ["ls-files", HS.FIXTURES], { cwd: REPO, encoding: "utf8" }).split("\n").filter(Boolean);
  assert.ok(tracked.length > 0 && tracked.every((f) => !/h1|fitting-base/i.test(f)));
});

test("rebuild: every built layer, style derivative and mask equals its tracked file (pinned when committed, so a rebuild in CI proves reproducibility)", () => {
  for (const k of HS.BUILT) { assert.equal(pixelSha256(BUILD.layers[k]), MAN.layers[k].pixelSha256, k); assert.equal(pixelSha256(decodePng(TR.files[k]).px), MAN.layers[k].pixelSha256, k + " file"); }
  for (const k of HS.STYLES) { assert.equal(pixelSha256(BUILD.styles[k]), MAN.styles[k].pixelSha256, k); assert.equal(pixelSha256(decodePng(TR.files[k]).px), MAN.styles[k].pixelSha256, k + " file"); }
  for (const k of HS.MASKS) assert.equal(pixelSha256(BUILD.masks[k]), MAN.masks[k].pixelSha256, k);
  assert.deepEqual(BUILD.stats, MAN.stats);
  for (const s of SITUATIONS) assert.equal(pixelSha256(HS.composeSituation(BUILD, s)), MAN.situations[s], s);
});

test("bounded edits and the preserved default: every change inside its mask; with Northstar's hair at most 4/255", () => {
  const ch = changeReport(BUILD);
  assert.deepEqual(ch, MAN.changesVsD190);
  for (const [k, v] of Object.entries(ch.perLayer)) assert.equal(v.outsideEditMaskPx, 0, k);
  for (const k of ["cranium", "browR", "nose", "mouth", "iris", "eyesFixed"]) assert.equal(ch.perLayer[k].changedPx, 0, k + " untouched");
  const nc = ch.northstarComposite;
  assert.deepEqual([nc.outsideEditMasksPx, nc.bands[">16"], nc.bands["6-16"]], [0, 0, 0]);
  assert.ok(nc.maxRgb <= 4 && nc.maxAlpha <= 2, `default kept: max ${nc.maxRgb}/${nc.maxAlpha}`);
});

test("the brow remnants: only the documented group, moved to the hair; faint ones leave no mirror behind", () => {
  const m = BUILD.masks["brow-residue-to-hair"], L0 = BUILD.base.layers.browL, hair = BUILD.layers.hair, browL = BUILD.layers.browL;
  let n = 0, outsideX = 0, notInHair = 0, faintFilled = 0;
  for (let i = 0; i < N; i++) { if (!m[i * 4 + 3]) continue; n++; const x = i % 1024; if (x < 455 || x > 480) outsideX++; if (!hair[i * 4 + 3]) notInHair++; if (L0[i * 4 + 3] < 250 && browL[i * 4 + 3]) faintFilled++; }
  assert.equal(n, BUILD.stats.browResiduePx); assert.equal(n, 32);
  assert.deepEqual([outsideX, notInHair, faintFilled], [0, 0, 0], "the group at x 460–472 only; every remnant now in the hair; no mirror under a faint one");
  // the brow's own top outline further left (x 404–431) stays in the brow
  let kept = 0; for (let y = 245; y < 256; y++) for (let x = 404; x <= 431; x++) { const i = y * 1024 + x; if (L0[i * 4 + 3] && browL[i * 4 + 3] === L0[i * 4 + 3]) kept++; }
  assert.ok(kept > 0);
  // the ear moves are hair-coloured skin pixels, never ink
  const ear = BUILD.masks["ear-hair-to-hair"], S0 = BUILD.base.layers.skin; let ink = 0;
  for (let i = 0; i < N; i++) if (ear[i * 4 + 3] && Math.max(S0[i * 4], S0[i * 4 + 1], S0[i * 4 + 2]) < 50) ink++;
  assert.equal(ink, 0); assert.equal(BUILD.stats.earHairPx, 74);
});

test("hairstyles: brow coverage pinned, short frees the brows, the afro is unsuitable; the cast shadow follows Northstar's hair only", () => {
  const cov = browCoverage(BUILD);
  assert.deepEqual(cov, MAN.browCoverage);
  assert.deepEqual([cov.short.browL.coveredPct, cov.short.browR.coveredPct, cov.bald.browL.coveredPct], [0, 0, 0]);
  assert.ok(cov.afro.browL.coveredPct > 0 && cov.afro.browR.coveredPct > 0, "the afro still covers the brows: why it is UNSUITABLE");
  assert.deepEqual(MAN.styleStatus, { short: "REVIEW DERIVATIVE", afro: HS.loadSpec().hairstyles.afro.status });
  const bald = HD.composeHead(BUILD.layers, { include: HD.COMPOSITE_ORDER.filter((k) => k !== "hair" && k !== "hairShadow") });
  for (const s of HS.STYLES) assert.equal(pixelSha256(HS.composeSituation(BUILD, s)), pixelSha256(NL.overStack([bald, HS.tint(BUILD.styles[s])])), s + " without the Northstar shadow");
  for (const s of HS.STYLES) { let chroma = 0; const P = BUILD.styles[s]; for (let i = 0; i < N; i++) if (P[i * 4 + 3]) chroma = Math.max(chroma, Math.max(P[i * 4], P[i * 4 + 1], P[i * 4 + 2]) - Math.min(P[i * 4], P[i * 4 + 1], P[i * 4 + 2])); assert.equal(chroma, 0, s + " stays R2's grey luminance map"); }
  assert.throws(() => HS.composeSituation(BUILD, "curly"), /unknown situation/);
});

test("review only: every check passes, yet nothing is promotable; earlier variants unchanged", () => {
  const checks = CHECKS;
  assert.equal(checks.firstFailure, null);
  assert.ok(checks.checks.every((c) => c.ok === true));
  assert.equal(HS.promotionStatus().promotable, false);
  assert.throws(() => HS.promote(), /cannot be promoted/);
  assert.deepEqual([...VARIANTS], ["d187", "northstar-layers", "both", "northstar-head", "northstar-brow", "northstar-hairstyles"]);
  assert.match(file("tools/avatar/r3-review-pack.mjs").toString("utf8"), /const variant = arg\("--variant"\) \?\? "d187"/);
  assert.deepEqual([...HD.COMPOSITE_ORDER], MAN.compositeOrder);
});
