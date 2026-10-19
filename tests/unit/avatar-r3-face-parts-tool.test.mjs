// D-164 — the R3 face-parts tool (tools/avatar/r3-face-parts-tool.mjs) and its CLI (tools/avatar/r3-face-parts-compose.mjs).
// Synthetic technical shapes only (tests/unit/avatar-r3-face-parts-synthetic.mjs): no model output, no face asset.
// Geometric determinism is tested here; visual quality is the owner's review and is not claimed by any test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { composeFaceLayer, checkRawSheet, extractCell, resampleArea, overInto, quantise, encodePng, sha256, pixelSha256, decodePng, LAYOUT, MASTER } from "../../tools/avatar/r3-face-parts-tool.mjs";
import { mainSheet, annotationsFor, syntheticTargets, makeAnnotation, renderCell, buildSheet, crescentF, shifted, rectF, ellipseF, COL, BROW_R } from "./avatar-r3-face-parts-synthetic.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const TARGETS_PATH = join(REPO, "tools", "avatar", "fixtures", "r3-face-parts", "targets-v1.json");
const APPROVED = JSON.parse(readFileSync(TARGETS_PATH, "utf8"));
const DRAFT = { ...APPROVED, status: "DRAFT" };
const TT = syntheticTargets(APPROVED);
const CLI = join(REPO, "tools", "avatar", "r3-face-parts-compose.mjs");
const M = mainSheet(), M_SHA = sha256(M.png);
const compose = (sheet, rawSha, annotations, targets = TT, mode = "synthetic-test") => composeFaceLayer({ sheetPx: sheet, rawSha, annotations, targets, mode });
const partLog = (r, part) => r.log.parts.find((p) => p.part === part);

// ── geometry stability ──────────────────────────────────────────────────────────────────────────────
test("shadow and opacity changes do not change the transform (explicit points, not bbox)", () => {
  const brow = crescentF(...BROW_R);
  const variants = {
    plain: [{ value: brow, rgb: COL.browRight }],
    shadowDown150: [{ value: shifted(brow, 0, 14), rgb: COL.shadow, opacity: 150 / 255 }, { value: brow, rgb: COL.browRight }],
    shadowDiag150: [{ value: shifted(brow, 16, 10), rgb: COL.shadow, opacity: 150 / 255 }, { value: brow, rgb: COL.browRight }],
    opacity140: [{ value: brow, rgb: COL.browRight, opacity: 140 / 255 }],
    opacity115: [{ value: brow, rgb: COL.browRight, opacity: 115 / 255 }],
  };
  const t = Object.entries(variants).map(([k, shapes]) => {
    const s = mainSheet({ browRightShapes: shapes }), sh = sha256(s.png), r = compose(s.px, sh, annotationsFor(sh, s.points));
    assert.equal(r.ok, true, k);
    return [k, partLog(r, "browRight").transform, partLog(r, "browRight").technicalDiagnostics.solidBox];
  });
  for (const [, tr] of t) assert.deepEqual(tr, t[0][1]);
  assert.notDeepEqual(t[2][2], t[0][2], "the diagonal shadow does change the alpha bbox (which is ignored)");
});

// ── annotation gates ───────────────────────────────────────────────────────────────────────────────
test("missing, invalid or unapproved annotations are rejected", () => {
  const base = annotationsFor(M_SHA, M.points);
  const cases = [
    ["NO_ANNOTATION", { ...base, nose: undefined }],
    ["ANNOTATION_POINTS_INVALID", { ...base, nose: { ...base.nose, points: { top: [300, NaN], bottom: [300, 324] } } }],
    ["ANNOTATION_POINTS_INVALID", { ...base, nose: { ...base.nose, points: { top: [300, 196] } } }],
    ["ANNOTATION_POINTS_INVALID", { ...base, nose: { ...base.nose, points: { ...base.nose.points, extra: [1, 1] } } }],
    ["ANNOTATION_NOT_APPROVED", { ...base, mouth: { ...base.mouth, status: "DRAFT" } }],
    ["ANNOTATION_SCHEMA_INVALID", { ...base, mouth: { ...base.mouth, schema: "x" } }],
    ["ANNOTATION_REVIEW_FLAG_INVALID", { ...base, mouth: { ...base.mouth, reviewFlags: ["looks fine"] } }],
    ["ANNOTATION_POINT_OUTSIDE_CELL", { ...base, nose: { ...base.nose, points: { top: [300, -4], bottom: [300, 324] } } }],
  ];
  for (const [code, ann] of cases) { const r = compose(M.px, M_SHA, ann); assert.equal(r.ok, false); assert.equal(r.code, code); assert.equal(r.px, undefined); }
});
test("modes never accept each other's statuses; DRAFT targets are refused outside preview", () => {
  const syn = annotationsFor(M_SHA, M.points), appr = annotationsFor(M_SHA, M.points, { status: "APPROVED" });
  assert.equal(compose(M.px, M_SHA, syn, TT, "production").code, "TARGETS_NOT_APPROVED");
  assert.equal(compose(M.px, M_SHA, syn, { ...TT, status: "APPROVED" }, "production").code, "ANNOTATION_NOT_APPROVED");
  assert.equal(compose(M.px, M_SHA, appr, TT, "synthetic-test").code, "ANNOTATION_NOT_APPROVED");
  assert.equal(compose(M.px, M_SHA, syn, DRAFT, "synthetic-test").code, "TARGETS_NOT_APPROVED");
  assert.equal(compose(M.px, M_SHA, syn, DRAFT, "production").code, "TARGETS_NOT_APPROVED");
  assert.equal(compose(M.px, M_SHA, syn, DRAFT, "preview").ok, true, "preview renders review images from DRAFT targets");
});

// ── raw hash + cell identity ───────────────────────────────────────────────────────────────────────
test("raw-sheet hash and cell identity are enforced", () => {
  const base = annotationsFor(M_SHA, M.points);
  assert.equal(compose(M.px, M_SHA, { ...base, nose: { ...base.nose, raw: { ...base.nose.raw, sha256: "0".repeat(64) } } }).code, "ANNOTATION_RAW_SHA_MISMATCH");
  assert.equal(compose(M.px, "f".repeat(64), base).code, "ANNOTATION_RAW_SHA_MISMATCH");
  assert.equal(compose(M.px, M_SHA, { ...base, nose: { ...base.nose, cell: [1, 1] } }).code, "ANNOTATION_CELL_MISMATCH");
  assert.equal(compose(M.px, M_SHA, { ...base, browRight: { ...base.browLeft } }).code, "ANNOTATION_PART_MISMATCH");
  assert.equal(compose(M.px, M_SHA, { ...base, nose: { ...base.nose, layoutId: "other" } }).code, "ANNOTATION_LAYOUT_MISMATCH");
});

// ── orientation residual, no hidden rotation ───────────────────────────────────────────────────────
test("a wrongly oriented part shows its residual and angle deviation; it is not rotated", () => {
  const level = compose(M.px, M_SHA, annotationsFor(M_SHA, M.points)), m = partLog(level, "mouth");
  assert.equal(level.ok, true);
  assert.match(m.fitDescription, /LEAST-SQUARES APPROXIMATION/);
  assert.ok(m.residualMaxPx > 3.5 && m.residualMaxPx < 4.5, `residual ${m.residualMaxPx}`);
  assert.ok(Math.abs(m.angleDeviationDeg + 6.04) < 0.1, `angle ${m.angleDeviationDeg}`);
  assert.equal(m.ownerReviewRequired, true);
  const T = mainSheet({ tiltMouth: true }), ts = sha256(T.png), tilted = partLog(compose(T.px, ts, annotationsFor(ts, T.points)), "mouth");
  assert.ok(tilted.residualMaxPx < 0.05 && tilted.residualMaxPx < m.residualMaxPx / 50, `tilted residual ${tilted.residualMaxPx}`);
  assert.ok(Math.abs(tilted.angleDeviationDeg) < 0.05);
});
test("reflection is impossible: swapped points give a non-positive scale and are rejected", () => {
  const base = annotationsFor(M_SHA, M.points), p = base.mouth.points;
  assert.equal(compose(M.px, M_SHA, { ...base, mouth: { ...base.mouth, points: { left: p.right, right: p.left } } }).code, "NON_POSITIVE_SCALE");
});
test("no hidden operation: each placed part equals a plain uniform resample with the logged s, tx, ty", () => {
  const r = compose(M.px, M_SHA, annotationsFor(M_SHA, M.points));
  for (const part of LAYOUT.order) {
    const l = partLog(r, part);
    assert.deepEqual(Object.keys(l.transform).sort(), ["s", "tx", "ty"]);
    const c = new Float64Array(MASTER.w * MASTER.h * 4); overInto(c, MASTER.w, resampleArea(extractCell(M.px, part), l.transform.s, l.transform.tx, l.transform.ty, MASTER.w, MASTER.h));
    assert.equal(pixelSha256(quantise(c, MASTER.w, MASTER.h)), pixelSha256(r.layers[part]), part);
  }
});
test("uniform scale keeps proportions exactly on a pixel-aligned rectangle (no per-axis scale)", () => {
  const cells = { browLeft: renderCell([{ value: rectF(100, 200, 400, 300), rgb: COL.browLeft }]), browRight: renderCell([{ value: rectF(100, 200, 400, 300), rgb: COL.browRight }]), nose: renderCell([{ value: ellipseF(256, 256, 40, 64), rgb: COL.nose }]), mouth: renderCell([{ value: rectF(100, 250, 400, 262), rgb: COL.mouth }]) };
  const px = buildSheet(cells), sh = sha256(encodePng(1024, 1024, px));
  const pts = { browLeft: { inner: [400, 250], outer: [100, 250] }, browRight: { inner: [100, 250], outer: [400, 250] }, nose: { top: [256, 192], bottom: [256, 320] }, mouth: { left: [100, 256], right: [400, 256] } };
  const tg = { ...TT, points: { ...TT.points, browRight: { inner: { xy: [540, 256.5] }, outer: { xy: [615, 256.5] } } } };
  const r = compose(px, sh, annotationsFor(sh, pts), tg), l = partLog(r, "browRight");
  assert.equal(l.transform.s, 0.25); assert.equal(l.transform.tx, 515); assert.equal(l.transform.ty, 194);
  let bb = null; for (let y = 0; y < MASTER.h; y++) for (let x = 0; x < MASTER.w; x++) if (r.layers.browRight[(y * MASTER.w + x) * 4 + 3] >= 128) bb = bb ? [Math.min(bb[0], x), Math.min(bb[1], y), Math.max(bb[2], x), Math.max(bb[3], y)] : [x, y, x, y];
  assert.deepEqual([bb[2] - bb[0] + 1, bb[3] - bb[1] + 1], [75, 25], "300x100 -> 75x25 (3:1 kept)");
});

// ── raw sheet untouched + raw checks ───────────────────────────────────────────────────────────────
test("the raw sheet is never modified", () => {
  const before = Buffer.from(M.px), r = compose(M.px, M_SHA, annotationsFor(M_SHA, M.points));
  assert.equal(r.ok, true); assert.ok(Buffer.from(M.px).equals(before)); assert.equal(sha256(encodePng(1024, 1024, M.px)), M_SHA);
});
test("raw checks: format, size, content in every cell, nothing cut at a cell boundary; no global face envelope", () => {
  assert.equal(checkRawSheet(Buffer.from("nope")).firstFailure, "RAW-1");
  assert.equal(checkRawSheet(encodePng(1024, 1536, new Uint8ClampedArray(1024 * 1536 * 4))).firstFailure, "RAW-2");
  const noNose = buildSheet({ browLeft: extractCell(M.px, "browLeft").px, browRight: extractCell(M.px, "browRight").px, mouth: extractCell(M.px, "mouth").px });
  assert.equal(checkRawSheet(encodePng(1024, 1024, noNose)).firstFailure, "RAW-4");
  const cut = buildSheet({ ...Object.fromEntries(LAYOUT.order.map((p) => [p, extractCell(M.px, p).px])), browRight: renderCell([{ value: ellipseF(480, 250, 70, 30), rgb: COL.browRight }]) });
  assert.equal(checkRawSheet(encodePng(1024, 1024, cut)).firstFailure, "RAW-5");
  const ok = checkRawSheet(M.png);
  assert.equal(ok.verdict, "PASS_TO_ANNOTATION");
  assert.ok(!JSON.stringify(ok.auto).includes("384, 230, 632, 412") && !JSON.stringify(ok.auto).includes("envelope"));
});

// ── determinism ────────────────────────────────────────────────────────────────────────────────────
test("repeated composition is byte-identical (pixels, file bytes, log)", () => {
  const a = compose(M.px, M_SHA, annotationsFor(M_SHA, M.points)), b = compose(M.px, M_SHA, annotationsFor(M_SHA, M.points));
  assert.ok(encodePng(1024, 1536, a.px).equals(encodePng(1024, 1536, b.px)));
  assert.equal(JSON.stringify(a.log), JSON.stringify(b.log));
});

// ── CLI: rejection writes nothing; success passes the EXISTING composed checks; rerun identical ─────
function cliFixture(dir, { targets = TT, sheet = M, points = M.points, annStatus } = {}) {
  mkdirSync(join(dir, "ann"), { recursive: true });
  writeFileSync(join(dir, "sheet.png"), sheet.png);
  const sh = sha256(sheet.png);
  for (const [p, a] of Object.entries(annotationsFor(sh, points, annStatus ? { status: annStatus } : undefined))) writeFileSync(join(dir, "ann", `${p}.json`), JSON.stringify(a));
  writeFileSync(join(dir, "targets.json"), JSON.stringify(targets));
}
const cli = (dir, out, mode = "synthetic-test", { targets = join(dir, "targets.json"), outPath = join(dir, out) } = {}) => spawnSync(process.execPath,
  [CLI, "--sheet", join(dir, "sheet.png"), "--annotations", join(dir, "ann"), ...(targets ? ["--targets", targets] : []), "--out", outPath, "--mode", mode], { encoding: "utf8" });

test("CLI: rejections exit 2 and write no output", () => {
  const d = mkdtempSync(join(tmpdir(), "r3parts-")); cliFixture(d, { targets: DRAFT });
  let r = cli(d, "o0", "synthetic-test"); assert.equal(r.status, 2); assert.equal(JSON.parse(r.stdout).code, "TARGETS_NOT_APPROVED"); assert.equal(existsSync(join(d, "o0")), false);
  r = cli(d, "o1", "production"); assert.equal(r.status, 2); assert.equal(JSON.parse(r.stdout).code, "OUT_NOT_IN_BUILD"); assert.equal(existsSync(join(d, "o1")), false);
  r = cli(d, "o2", "preview"); assert.equal(r.status, 2); assert.equal(JSON.parse(r.stdout).code, "MODE_NOT_ALLOWED"); assert.equal(existsSync(join(d, "o2")), false);
  // production inside the build area: an unpinned targets file is refused; the pinned one still needs OWNER-APPROVED annotations
  const inBuild = join(REPO, "tools", "avatar", "build", "r3-face-parts-test-never-written-" + process.pid);
  r = cli(d, null, "production", { outPath: inBuild }); assert.equal(r.status, 2); assert.equal(JSON.parse(r.stdout).code, "TARGETS_NOT_PINNED"); assert.equal(existsSync(inBuild), false);
  r = cli(d, null, "production", { outPath: inBuild, targets: null }); assert.equal(r.status, 2); assert.equal(JSON.parse(r.stdout).code, "ANNOTATION_NOT_APPROVED", r.stdout); assert.equal(existsSync(inBuild), false);
  // composed layer outside the EXISTING broad envelope -> AUTO-5 (binding) rejects; nothing is cropped
  const d2 = mkdtempSync(join(tmpdir(), "r3parts-")), low = { ...TT, points: { ...TT.points, mouth: { left: { xy: [475, 438] }, right: { xy: [550.5, 430] } } } };
  cliFixture(d2, { targets: low }); r = cli(d2, "o3");
  assert.equal(r.status, 2); const j = JSON.parse(r.stdout); assert.equal(j.stage, "composed"); assert.equal(j.code, "AUTO-5"); assert.equal(existsSync(join(d2, "o3")), false);
});
test("CLI: success passes AUTO-1..5 of the existing checker and reruns byte-identically", () => {
  const d = mkdtempSync(join(tmpdir(), "r3parts-")); cliFixture(d);
  const r1 = cli(d, "a"), r2 = cli(d, "b");
  assert.equal(r1.status, 0, r1.stdout + r1.stderr); assert.equal(r2.status, 0);
  const log = JSON.parse(readFileSync(join(d, "a", "transform-log.json"), "utf8"));
  assert.equal(log.composedChecks.verdict, "PASS_TO_VISUAL_REVIEW");
  assert.deepEqual(log.composedChecks.auto.map((a) => a.status), ["PASS", "PASS", "PASS", "PASS", "PASS"]);
  for (const f of ["composed-face-layer.png", "transform-log.json"]) assert.ok(readFileSync(join(d, "a", f)).equals(readFileSync(join(d, "b", f))), f);
  assert.equal(decodePng(readFileSync(join(d, "a", "composed-face-layer.png"))).header.h, 1536);
  assert.equal(sha256(readFileSync(join(d, "sheet.png"))), sha256(M.png), "raw input unchanged by the CLI");
});
