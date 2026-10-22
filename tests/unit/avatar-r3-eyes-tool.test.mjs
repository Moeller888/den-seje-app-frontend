// D-169 — the R3 eyes tool on SYNTHETIC sheets: every binding check (E1..E5, I1..I5, P1..P5) rejects what it must and
// passes what it must; the transforms come only from the annotation (A) and the iris centroids (B); nothing is repaired;
// the output is deterministic; the CLI writes nothing on a rejection and production refuses the DRAFT targets.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { checkFixedSheet, checkFixedSheetShape, SHAPE_THRESHOLDS, checkIrisSheet, composeEyes, tintedReviewPair, inEyeEnvelope, validateTargets, validateAnnotation, decodePng, encodePng, sha256, pixelSha256, THRESHOLDS, SHEET, IRIS_TOKEN } from "../../tools/avatar/r3-eyes-tool.mjs";
import { resampleArea, overInto, quantise } from "../../tools/avatar/r3-face-parts-tool.mjs";
import { fixedSheet, irisSheet, syntheticAnnotation, syntheticTargets, DRAFT_TARGETS, GEO, toSheet } from "./avatar-r3-eyes-synthetic.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI = join(REPO, "tools", "avatar", "r3-eyes-compose.mjs");
const W = SHEET.w;
const at = (X, Y) => (Y * W + X) * 4;
const toMaster = (X, Y) => [(X + 0.5 - 768) / 4 + 509.9, (Y + 0.5 - 512) / 4 + 321];
const inE = (p, c, r) => ((p[0] - c[0]) / r[0]) ** 2 + ((p[1] - c[1]) / r[1]) ** 2 <= 1;
const paint = (px, x0, y0, x1, y1, rgba) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) px.set(rgba, at(x, y)); };
const FIXED = fixedSheet(), IRIS = irisSheet();
const pass = (fb = FIXED, ib = IRIS, ann = syntheticAnnotation(fb), targets = syntheticTargets()) =>
  composeEyes({ fixed: checkFixedSheet(fb), iris: ib ? checkIrisSheet(ib) : null, annotation: ann, targets, mode: "synthetic-test" });

test("the synthetic pair passes E1..E5, I1..I5 and P1..P5 with zero residuals", () => {
  const f = checkFixedSheet(FIXED), i = checkIrisSheet(IRIS);
  assert.equal(f.verdict, "PASS_TO_ANNOTATION");
  assert.deepEqual(f.auto.map((s) => s.id), ["E1", "E2", "E3", "E4", "E5"]);
  assert.equal(i.verdict, "PASS_TO_REGISTRATION");
  assert.deepEqual(i.auto.map((s) => s.id), ["I1", "I2", "I3", "I4", "I5"]);
  const c = pass();
  assert.equal(c.ok, true, JSON.stringify(c));
  assert.equal(c.stage, "pair");
  assert.ok(c.log.fixed.residualMaxPx < 1e-9 && c.log.iris.residualMaxPx < 0.01);
  assert.ok(Math.abs(c.log.fixed.transform.s - 0.25) < 1e-12);
  assert.ok(Math.abs(c.log.iris.scaleRatioToFixed - 1) < 0.001);
  assert.ok(c.log.diagnosticsP7.ringCentreYDifferencePx > 0, "P7 is reported");
});

test("the fixed stage places A alone, before any iris exists", () => {
  const c = pass(FIXED, null);
  assert.equal(c.ok, true);
  assert.equal(c.stage, "fixed");
  assert.equal(c.irisPx, undefined);
  assert.match(c.log.stage, /^FIXED ONLY/);
});

test("E1: the sheet must be a 1536x1024 8-bit RGBA PNG", () => {
  assert.equal(checkFixedSheet(Buffer.from("not a png")).firstFailure, "E1");
  assert.equal(checkFixedSheet(encodePng(1024, 1024, new Uint8ClampedArray(1024 * 1024 * 4))).firstFailure, "E1");
  assert.equal(checkIrisSheet(encodePng(1024, 1536, new Uint8ClampedArray(1024 * 1536 * 4))).firstFailure, "I1");
});

test("E2: alpha >= 16 in the middle strip or border rejects; alpha 1..15 is only reported", () => {
  assert.equal(checkFixedSheet(fixedSheet((px) => px.set([0, 0, 0, 16], at(760, 500)))).firstFailure, "E2");
  assert.equal(checkFixedSheet(fixedSheet((px) => px.set([0, 0, 0, 16], at(10, 500)))).firstFailure, "E2");
  const low = checkFixedSheet(fixedSheet((px) => { px.set([0, 0, 0, 15], at(760, 500)); px.set([0, 0, 0, 1], at(5, 5)); }));
  assert.equal(low.verdict, "PASS_TO_ANNOTATION");
  const d = low.diag.find((x) => x.id === "E2-LOW");
  assert.deepEqual([d.value.inStripOrBorder, d.flagged], [2, true]);
});

test("E3: each half needs exactly one enclosed transparent opening of plausible area", () => {
  const base = checkFixedSheet(FIXED), id = base.openings.eyeLeft.id;
  const filled = fixedSheet((px) => { for (let i = 0; i < W * SHEET.h; i++) if (base.openingLabels[i] === id) px.set([10, 10, 10, 255], i * 4); });
  assert.equal(checkFixedSheet(filled).firstFailure, "E3");
  // a second large enclosed hole in the right half
  const second = fixedSheet((px) => { paint(px, 1300, 300, 1400, 400, [0, 0, 0, 255]); paint(px, 1310, 310, 1390, 390, [0, 0, 0, 0]); });
  assert.equal(checkFixedSheet(second).firstFailure, "E3");
});

test("E4: a missing or lower-right highlight rejects", () => {
  const g = GEO.eyeLeft;
  const none = fixedSheet((px) => { for (let Y = 380; Y < 530; Y++) for (let X = 420; X < 600; X++) if (inE(toMaster(X, Y), g.highlight.centre, g.highlight.semiAxes)) px[at(X, Y) + 3] = 0; });
  assert.equal(checkFixedSheet(none).firstFailure, "E4");
  const mirrored = [2 * g.irisRing.centre[0] - g.highlight.centre[0], 2 * g.irisRing.centre[1] - g.highlight.centre[1]];
  const lowerRight = fixedSheet((px) => { for (let Y = 380; Y < 700; Y++) for (let X = 420; X < 700; X++) { const m = toMaster(X, Y); if (inE(m, g.highlight.centre, g.highlight.semiAxes)) px[at(X, Y) + 3] = 0; if (inE(m, mirrored, g.highlight.semiAxes)) px.set([252, 252, 250, 255], at(X, Y)); } });
  assert.equal(checkFixedSheet(lowerRight).firstFailure, "E4");
});

test("E5: opaque skin-coloured pixels reject", () => {
  assert.equal(checkFixedSheet(fixedSheet((px) => paint(px, 200, 600, 204, 604, [254, 197, 128, 255]))).firstFailure, "E5");
  assert.equal(checkFixedSheet(fixedSheet((px) => paint(px, 200, 600, 204, 604, [254, 197, 128, 249]))).verdict, "PASS_TO_ANNOTATION", "below alpha 250 it is not counted");
});

test("I2..I5: components, achromatic, opaque, centred pupil", () => {
  assert.equal(checkIrisSheet(irisSheet((px) => px.set([100, 100, 100, 255], at(100, 100)))).firstFailure, "I2", "a third component");
  const rect = irisSheet((px) => { const c = checkIrisSheet(IRIS).irises.eyeLeft.bbox; paint(px, c[0], c[1], c[2], c[3], [128, 128, 128, 255]); });
  assert.equal(checkIrisSheet(rect).firstFailure, "I2", "a rectangle is not an oval");
  const [cx, cy] = toSheet(GEO.eyeLeft.irisRing.centre).map(Math.round);
  assert.equal(checkIrisSheet(irisSheet((px) => px.set([120, 107, 107, 255], at(cx + 60, cy + 90)))).firstFailure, "I3", "chroma 13");
  assert.equal(checkIrisSheet(irisSheet((px) => px.set([120, 108, 108, 255], at(cx + 60, cy + 90)))).verdict, "PASS_TO_REGISTRATION", "chroma 12 is allowed");
  assert.equal(checkIrisSheet(irisSheet((px) => px.set([128, 128, 128, 200], at(cx + 60, cy + 90)))).firstFailure, "I4");
  assert.equal(checkIrisSheet(irisSheet((px) => paint(px, cx - 74, cy - 115, cx + 6, cy - 35, [0, 0, 0, 255]))).firstFailure, "I5", "the darkest pixels sit high and left");
});

test("annotation and targets: hashes, statuses and modes are enforced", () => {
  const f = checkFixedSheet(FIXED), ann = syntheticAnnotation(FIXED), t = syntheticTargets();
  assert.deepEqual(validateTargets(DRAFT_TARGETS, "production").code, "TARGETS_NOT_APPROVED");
  assert.deepEqual(validateTargets(DRAFT_TARGETS, "synthetic-test").code, "TARGETS_NOT_APPROVED");
  assert.equal(validateTargets(t, "production").code, "TARGETS_NOT_APPROVED");
  assert.equal(validateAnnotation(ann, f.rawSha256, "production").code, "ANNOTATION_NOT_APPROVED");
  assert.equal(validateAnnotation({ ...ann, raw: { sha256: "0".repeat(64) } }, f.rawSha256, "synthetic-test").code, "ANNOTATION_RAW_SHA_MISMATCH");
  const missing = JSON.parse(JSON.stringify(ann)); delete missing.points.eyeRight.innerCorner;
  assert.equal(validateAnnotation(missing, f.rawSha256, "synthetic-test").code, "ANNOTATION_POINTS_INVALID");
  const swapped = JSON.parse(JSON.stringify(ann)); [swapped.points.eyeLeft, swapped.points.eyeRight] = [swapped.points.eyeRight, swapped.points.eyeLeft];
  assert.equal(validateAnnotation(swapped, f.rawSha256, "synthetic-test").code, "ANNOTATION_EYE_IN_WRONG_HALF");
  assert.equal(composeEyes({ fixed: f, iris: null, annotation: ann, targets: DRAFT_TARGETS, mode: "production" }).code, "TARGETS_NOT_APPROVED");
});

test("P1/P2 fixed: one shared fit; a bad anchor or a wrong scale rejects", () => {
  assert.equal(pass(FIXED, null, syntheticAnnotation(FIXED, { "eyeLeft.outerCorner": [40, 0] })).code, "P1_RESIDUAL_FIXED");
  const ann = syntheticAnnotation(FIXED);
  for (const e of ["eyeLeft", "eyeRight"]) for (const k of Object.keys(ann.points[e])) ann.points[e][k] = [768 + (ann.points[e][k][0] - 768) * 1.3, 512 + (ann.points[e][k][1] - 512) * 1.3]; // s = 0.25 / 1.3 < 0.20
  assert.equal(pass(FIXED, null, ann).code, "P2_SCALE_FIXED");
});

test("P5: anything placed outside the grown D-159 eye and fold zones rejects", () => {
  assert.equal(pass(fixedSheet((px) => paint(px, 300, 150, 310, 160, [0, 0, 0, 255])), null).code, "P5_ENVELOPE");
  assert.equal(inEyeEnvelope(440, 318), true);
  assert.equal(inEyeEnvelope(395 - 1, 318), false);
  assert.equal(inEyeEnvelope(458, 266), true, "fold zone grown by 6");
  assert.equal(inEyeEnvelope(510, 330), false, "between the eyes");
});

test("P1/P2 iris: the centroids must land on the placed ring centres at a matching scale", () => {
  assert.equal(pass(FIXED, irisSheet(null, { shiftRight: [0, 4] })).code, "P1_RESIDUAL_IRIS");
  assert.equal(pass(FIXED, irisSheet(null, { spread: 1.2 })).code, "P2_SCALE_IRIS");
});

test("P3/P4: the iris must cover the opening and stay inside the eye", () => {
  assert.equal(pass(FIXED, irisSheet(null, { scale: 0.85 })).code, "P3_COVERAGE");
  assert.equal(pass(FIXED, irisSheet(null, { scale: 1.15 })).code, "P4_CONTAINMENT");
});

test("no hidden operation: each layer equals a plain area resample with the logged transform; raw sheets are untouched", () => {
  const before = [sha256(FIXED), sha256(IRIS)], c = pass();
  const plain = (buf, t) => { const p = decodePng(buf).px, L = resampleArea({ w: SHEET.w, h: SHEET.h, px: p }, t.s, t.tx, t.ty, 1024, 1536), a = new Float64Array(1024 * 1536 * 4); overInto(a, 1024, L); return quantise(a, 1024, 1536); };
  assert.equal(pixelSha256(c.fixedPx), pixelSha256(plain(FIXED, c.log.fixed.transform)));
  assert.equal(pixelSha256(c.irisPx), pixelSha256(plain(IRIS, c.log.iris.transform)));
  assert.deepEqual([sha256(FIXED), sha256(IRIS)], before);
  assert.equal(pixelSha256(pass().fixedPx), pixelSha256(c.fixedPx), "repeatable");
});

test("the review render tints by luminance x R3_IRIS_DEFAULT under the fixed layer", () => {
  const fx = new Uint8ClampedArray(1024 * 1536 * 4), ir = new Uint8ClampedArray(1024 * 1536 * 4);
  ir.set([255, 255, 255, 255], 0); ir.set([0, 0, 0, 255], 4); ir.set([128, 128, 128, 255], 8); fx.set([250, 250, 250, 255], 8);
  const out = tintedReviewPair(fx, ir);
  assert.deepEqual([...out.subarray(0, 12)], [...IRIS_TOKEN.rgb, 255, 0, 0, 0, 255, 250, 250, 250, 255]);
  assert.deepEqual(IRIS_TOKEN, { name: "R3_IRIS_DEFAULT", hex: "#A34A0F", rgb: [0xa3, 0x4a, 0x0f] });
});

test("CLI: raw-check mode, rejections write nothing, success reruns byte-identically, production refuses unapproved annotations and DRAFT targets", () => {
  const dir = mkdtempSync(join(tmpdir(), "r3-eyes-cli-"));
  const fp = join(dir, "fixed.png"), ip = join(dir, "iris.png"), ap = join(dir, "ann.json"), tp = join(dir, "targets.json");
  writeFileSync(fp, FIXED); writeFileSync(ip, IRIS); writeFileSync(ap, JSON.stringify(syntheticAnnotation(FIXED))); writeFileSync(tp, JSON.stringify(syntheticTargets()));
  const run = (...a) => spawnSync(process.execPath, [CLI, ...a], { encoding: "utf8" });
  const chk = run("--check-fixed", fp);
  assert.equal(chk.status, 0, chk.stderr);
  assert.equal(JSON.parse(chk.stdout).verdict, "PASS_TO_ANNOTATION");
  const bad = join(dir, "bad.png"); writeFileSync(bad, fixedSheet((px) => px.set([0, 0, 0, 255], at(760, 500))));
  const rej = run("--fixed", bad, "--iris", ip, "--annotation", ap, "--targets", tp, "--mode", "synthetic-test", "--out", join(dir, "o-bad"));
  assert.equal(rej.status, 2);
  assert.equal(JSON.parse(rej.stdout).code, "E2");
  assert.ok(!existsSync(join(dir, "o-bad")));
  const ok1 = run("--fixed", fp, "--iris", ip, "--annotation", ap, "--targets", tp, "--mode", "synthetic-test", "--out", join(dir, "o1"));
  const ok2 = run("--fixed", fp, "--iris", ip, "--annotation", ap, "--targets", tp, "--mode", "synthetic-test", "--out", join(dir, "o2"));
  assert.equal(ok1.status, 0, ok1.stdout + ok1.stderr); assert.equal(ok2.status, 0);
  assert.deepEqual(readdirSync(join(dir, "o1")).sort(), ["eyes-fixed-layer.png", "iris-luminance-layer.png", "review-tinted-pair-REVIEW-ONLY.png", "transform-log.json"]);
  for (const f of ["eyes-fixed-layer.png", "iris-luminance-layer.png", "review-tinted-pair-REVIEW-ONLY.png"]) assert.equal(sha256(readFileSync(join(dir, "o1", f))), sha256(readFileSync(join(dir, "o2", f))), f);
  const again = run("--fixed", fp, "--iris", ip, "--annotation", ap, "--targets", tp, "--mode", "synthetic-test", "--out", join(dir, "o1"));
  assert.equal(JSON.parse(again.stdout).code, "OUT_EXISTS");
  // Since D-170 the pinned production targets are APPROVED: production now passes the targets stage and refuses the
  // synthetic annotation's status instead; a DRAFT targets file (D-169's v1) is still refused as unpinned / unapproved.
  const never = join(REPO, "tools", "avatar", "build", "r3-eyes-cli-test-never-written");
  const prod = run("--fixed", fp, "--iris", ip, "--annotation", ap, "--out", never);
  assert.equal(prod.status, 2);
  assert.equal(JSON.parse(prod.stdout).code, "ANNOTATION_NOT_APPROVED", "a synthetic annotation is never accepted in production");
  const draftTargets = run("--fixed", fp, "--iris", ip, "--annotation", ap, "--targets", join(REPO, "tools", "avatar", "fixtures", "r3-eyes", "targets-eyes-v1.json"), "--out", never);
  assert.equal(JSON.parse(draftTargets.stdout).code, "TARGETS_NOT_PINNED", "D-169's DRAFT v1 is not the pinned production file");
  assert.ok(!existsSync(never));
  const approvedAnn = { ...syntheticAnnotation(FIXED), status: "APPROVED" }; writeFileSync(ap, JSON.stringify(approvedAnn));
  assert.equal(JSON.parse(run("--fixed", fp, "--iris", ip, "--annotation", ap, "--out", join(dir, "o-prod")).stdout).code, "OUT_NOT_IN_BUILD");
});

test("the thresholds are the D-169 values", () => {
  assert.deepEqual([THRESHOLDS.residualFixedMaxPx, THRESHOLDS.residualIrisMaxPx, THRESHOLDS.irisChromaMax, THRESHOLDS.visibleAlphaMin, THRESHOLDS.lowAlphaReportedMax], [2.0, 1.5, 12, 16, 15]);
  assert.deepEqual([...THRESHOLDS.scaleRange, ...THRESHOLDS.irisToFixedScaleRatioRange, ...THRESHOLDS.openingAreaRange], [0.2, 0.3, 0.9, 1.1, 0.5, 1.6]);
});

// ── D-172: binding shape checks F1..F2 for a further eyes-fixed sheet ──────────────────────────────────────────────
test("F1/F2 (D-172): the synthetic sheet has no white band and a compatible spacing", () => {
  const r = checkFixedSheetShape(checkFixedSheet(FIXED));
  assert.equal(r.verdict, "PASS_TO_ANNOTATION", JSON.stringify(r.auto));
  assert.deepEqual(r.auto.map((x) => x.id), ["F1", "F2"]);
  assert.match(r.auto[1].detail, /implied s 0\.2500/);
});
test("F1 (D-172): a light band between the ring's top and the lash line rejects; RGB under alpha does not count", () => {
  const base = checkFixedSheet(FIXED);
  const band = fixedSheet((px) => { for (const e of ["eyeLeft", "eyeRight"]) { const [x0, y0, x1] = base.openings[e].bbox; for (let x = x0; x < x1; x++) for (let y = y0 - 6; y < y0 - 2; y++) if (px[at(x, y) + 3] >= 128) px.set([250, 250, 250, 255], at(x, y)); } });
  const c = checkFixedSheet(band); assert.equal(c.verdict, "PASS_TO_ANNOTATION", "the E-checks still pass");
  assert.equal(checkFixedSheetShape(c).firstFailure, "F1");
});
test("F2 (D-172): an eye spacing outside the scale range rejects; E-checks must have passed first", () => {
  const c = checkFixedSheet(FIXED);
  const wide = { ...c, openings: { eyeLeft: { ...c.openings.eyeLeft, regionCentroid: [400, 512] }, eyeRight: { ...c.openings.eyeRight, regionCentroid: [1045.5, 512] } } };
  const r = checkFixedSheetShape(wide);
  assert.equal(r.firstFailure, "F2"); assert.match(r.auto[1].detail, /implied s 0\.189/);
  assert.equal(checkFixedSheetShape({ verdict: "REJECT" }).firstFailure, "E-CHECKS-NOT-PASSED");
  assert.deepEqual([SHAPE_THRESHOLDS.whiteBandLightPxMax, SHAPE_THRESHOLDS.targetRingCentreSpacingPx, SHAPE_THRESHOLDS.bandColumnFraction], [0, 122.205, 0.6]);
});
