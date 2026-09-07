// D-131 — focused tests for the fitting-base v1 specification and its read-only checker.
//
// The approved image is deliberately NOT tracked (D-127 §2), so the tests that need the real file
// are explicitly conditional and say so. Everything that can be asserted without it — the spec's
// pins, the checker's guards, its failure paths and its read-only nature — always runs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, writeFileSync, mkdtempSync, rmSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { checkFittingBaseV1, resolveImagePath, SPEC_PATH, REPO } from "../../tools/avatar/check-fitting-base-v1.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const SPEC = JSON.parse(readFileSync(SPEC_PATH, "utf8"));
const APPROVED_SHA = "72875565ecd62b542a91156dbcca1399a434fe04634f4e737df71337be0d5af4";
const imagePresent = () => existsSync(resolveImagePath(SPEC));

test("the spec pins the owner-approved file by sha256 and byte count", () => {
  assert.equal(SPEC.file.sha256, APPROVED_SHA);
  assert.equal(SPEC.file.bytes, 1832612);
  assert.equal(SPEC.file.width, 1024);
  assert.equal(SPEC.file.height, 1536);
  assert.equal(SPEC.file.bitDepth, 8);
  assert.equal(SPEC.file.colourType, 6);
  assert.equal(SPEC.meta.status, "OWNER-APPROVED UNDER D-131");
  assert.equal(SPEC.meta.role, "INTERNAL GARMENT-AUTHORING REFERENCE");
  assert.match(SPEC.meta.identityControl, /bound to the sha256/);
});

test("the spec keeps the image out of the repository, per D-127 §2", () => {
  assert.equal(SPEC.storage.trackedInRepository, false);
  assert.match(SPEC.storage.rule, /OUTSIDE both repositories/);
  assert.match(SPEC.storage.rule, /never under assets\//);
  assert.equal(SPEC.storage.reproducibleFromFreshClone, false);
  assert.match(SPEC.prohibitions.noAssetsDirectory, /D-127 §2/);
});

test("the approved image is not tracked anywhere in the repository", () => {
  const tracked = execFileSync("git", ["-C", REPO, "ls-files"], { encoding: "utf8" }).split("\n");
  const offenders = tracked.filter((p) => /fitting.?base.*\.png$/i.test(p) && !/mask|exclusion|baseline/i.test(p));
  assert.deepEqual(offenders, [], "the fitting-base image must not be tracked — D-127 §2");
  const refDir = join(REPO, "assets", "avatar", "reference");
  const inAssets = readdirSync(refDir).filter((f) => /fitting/i.test(f));
  assert.deepEqual(inAssets, [], "nothing named 'fitting' may sit under assets/ — it would reach the CDN");
});

test("the spec records the bounded hand exception with its measured grounds", () => {
  assert.equal(SPEC.handException.scope, "THE INTERNAL FITTING BASE ONLY");
  assert.match(SPEC.handException.correctsAppendOnly, /D-126 §4/);
  assert.equal(SPEC.handException.handIoUvsV2.left, 0.9477);
  assert.equal(SPEC.handException.handIoUvsV2.right, 0.9602);
  assert.equal(SPEC.handException.maxContourDeltaPx.left, 2);
  assert.equal(SPEC.handException.maxContourDeltaPx.right, 2);
  assert.match(SPEC.handException.notExtendedTo, /remain the authoritative visual identity in runtime/);
  assert.match(SPEC.handException.notExtendedTo, /validated mounted on the actual runtime avatar/);
});

test("the spec states the arm/hand protect mask is NOT applied, and never a pass", () => {
  assert.equal(SPEC.armHandProtectMask.applied, false);
  assert.equal(SPEC.armHandProtectMask.measuredDifferingBytesVsV2, 103702);
  assert.match(SPEC.armHandProtectMask.statement, /NOT a passed gate/);
  assert.match(SPEC.armHandProtectMask.statement, /never be reported as a pass/);
});

test("the spec forbids runtime replacement and promotion without a new decision", () => {
  assert.match(SPEC.prohibitions.notARuntimeReplacement, /may NOT be used as a runtime replacement/);
  assert.match(SPEC.prohibitions.notARuntimeReplacement, /new, separate owner decision/);
  assert.match(SPEC.prohibitions.notPromotionLicence, /not licence to promote/);
});

test("the spec records the provenance of the one authorised call", () => {
  assert.equal(SPEC.provenance.requestId, "req_ed1c5272be34491e8d25efef5be19431");
  assert.equal(SPEC.provenance.rawSha256, "cf99432b2bfb463a8126b35ddaaf93f632ddd63ffdcfe47652b83f38855d4563");
  assert.equal(SPEC.provenance.northStarV2Sha256, "3daf32e76bff9a53ec7d25cf148a230073cfd0da6a003d02a23c4292d139ff50");
  assert.equal(SPEC.provenance.d129ClaimStatus, "SPENT");
  assert.equal(SPEC.provenance.headPixelsPasted, 124099);
  assert.equal(SPEC.provenance.orphanSoftCleared, 20191);
  assert.equal(SPEC.gates.headProtectDifferingBytes, 0);
  assert.match(SPEC.meta.noImageCall, /made no image call/);
});

test("an absent image SKIPS by default and FAILS with --require", () => {
  const missing = join(tmpdir(), "d131-definitely-not-here", "nope.png");
  const skipped = checkFittingBaseV1({ image: missing });
  assert.equal(skipped.status, "SKIPPED");
  assert.deepEqual(skipped.problems, []);
  assert.match(skipped.why, /D-127 §2/);
  const required = checkFittingBaseV1({ image: missing, require: true });
  assert.equal(required.status, "FAIL");
  assert.ok(required.problems.some((p) => p.includes("REQUIRED BUT ABSENT")));
});

test("a file whose hash is not the approved one fails, and no other numbers are reported", () => {
  const dir = mkdtempSync(join(tmpdir(), "d131-"));
  try {
    const fake = join(dir, "not-the-fitting-base.png");
    writeFileSync(fake, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]));
    const r = checkFittingBaseV1({ image: fake });
    assert.equal(r.status, "FAIL");
    assert.ok(r.problems.some((p) => p.includes("sha256")), r.problems.join("; "));
    assert.equal(r.measured.orphanSoftAuthoring, undefined,
      "when the identity check fails the checker must not report measurements about a different file");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the image path is resolvable by flag, by environment variable, then by the spec", () => {
  assert.equal(resolveImagePath(SPEC, { image: "C:/x/y.png" }).toLowerCase().replace(/\\/g, "/"), "c:/x/y.png");
  const viaEnv = resolveImagePath(SPEC, { env: { [SPEC.storage.externalPathEnvVar]: "C:/from/env.png" } });
  assert.match(viaEnv.replace(/\\/g, "/"), /from\/env\.png$/);
  assert.equal(resolveImagePath(SPEC, { env: {} }), SPEC.storage.externalPath);
});

test("the checker source contains no write, delete or rename call", () => {
  const src = readFileSync(join(REPO, "tools", "avatar", "check-fitting-base-v1.mjs"), "utf8");
  for (const banned of ["writeFileSync", "appendFileSync", "rmSync", "unlinkSync", "renameSync", "mkdirSync", "copyFileSync", "createWriteStream", "writeSync"]) {
    assert.ok(!src.includes(banned), `the checker must not call ${banned}`);
  }
});

test("the checker leaves the tracked inputs byte-identical", () => {
  const watched = [SPEC_PATH,
    join(REPO, "assets", "avatar", "reference", "Northstar Master v2.png"),
    join(REPO, "tools", "avatar", "fixtures", "fitting-base", "head-protect-mask-v1.png"),
    join(REPO, "tools", "avatar", "fixtures", "fitting-base", "arm-hand-protect-mask-v1.png")];
  const before = watched.map((p) => ({ bytes: statSync(p).size, sha: sha256(readFileSync(p)) }));
  checkFittingBaseV1({});
  const after = watched.map((p) => ({ bytes: statSync(p).size, sha: sha256(readFileSync(p)) }));
  assert.deepEqual(after, before, "the checker must not touch any tracked input");
});

test("the approved fitting base passes when it is present", { skip: imagePresent() ? false : "the approved image is not on this machine — D-127 §2 keeps it out of the repository" }, () => {
  const r = checkFittingBaseV1({ require: true });
  assert.deepEqual(r.problems, [], "the approved image must satisfy its own specification");
  assert.equal(r.status, "PASS");
  assert.equal(r.measured.sha256, APPROVED_SHA);
  assert.equal(r.measured.headProtectDifferingBytes, 0);
  assert.equal(r.measured.headSilhouetteDeviation, 0);
  assert.equal(r.measured.components, 1);
  assert.equal(r.measured.specks, 0);
  assert.equal(r.measured.pixelsOutsideEnvelope, 0);
  assert.ok(r.measured.orphanSoftAuthoring <= SPEC.gates.orphanSoftAuthoringBudget);
  assert.ok(r.measured.orphanSoftServed <= SPEC.gates.orphanSoftServedBudget);
  assert.equal(r.measured.armHandMaskApplied, false);
  assert.equal(r.measured.armHandMaskDifferingBytes, SPEC.armHandProtectMask.measuredDifferingBytesVsV2);
  assert.deepEqual(r.measured.renderSizes.map((x) => x.size), ["180x270", "112x168", "72x108", "52x78"]);
});
