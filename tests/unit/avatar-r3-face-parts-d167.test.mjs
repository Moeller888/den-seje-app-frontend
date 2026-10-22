// D-167 — partial sheets (RAW-4′) and composition from several raw sources in tools/avatar/r3-face-parts-tool.mjs and its
// CLI. Synthetic technical shapes only (tests/unit/avatar-r3-face-parts-synthetic.mjs): no model output, no face asset.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { checkRawSheet, checkPartialSheet, checkSheetByType, composeFaceLayer, composeFromSources, extractCell, resampleArea, overInto, quantise, encodePng, sha256, pixelSha256,
  LAYOUT, MASTER, SHEET_TYPES, REJECTED_SOURCE_PARTS, SOURCE_MANIFEST_SCHEMA } from "../../tools/avatar/r3-face-parts-tool.mjs";
import { mainSheet, annotationsFor, makeAnnotation, syntheticTargets, renderCell, buildSheet, ellipseF, COL, NOSE } from "./avatar-r3-face-parts-synthetic.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const APPROVED = JSON.parse(readFileSync(join(REPO, "tools", "avatar", "fixtures", "r3-face-parts", "targets-v1.json"), "utf8"));
const TT = syntheticTargets(APPROVED);
const CLI = join(REPO, "tools", "avatar", "r3-face-parts-compose.mjs");
const D165_SHA = "d300466081acf9595fd06b73a04682815d5248c6f3c4204f0a77aeb0a424055d";

// source A: a full synthetic sheet (brows and mouth are taken from it); source B: a nose-only partial sheet
const A = mainSheet({ tiltMouth: true }), A_SHA = sha256(A.png);
const noseCell = (cx = 260, cy = 250) => renderCell([{ value: ellipseF(cx, cy, 36, 58), rgb: COL.nose }]);
const partial = (cells) => { const px = buildSheet(cells); return { px, png: encodePng(1024, 1024, px) }; };
const B = partial({ nose: noseCell() }), B_SHA = sha256(B.png);
const B_POINTS = { top: [260, 250 - 58], bottom: [260, 250 + 58] };
const sourcesAB = () => ({ browLeft: { sheetPx: A.px, rawSha: A_SHA, sheetType: "full-v1" }, browRight: { sheetPx: A.px, rawSha: A_SHA, sheetType: "full-v1" },
  mouth: { sheetPx: A.px, rawSha: A_SHA, sheetType: "full-v1" }, nose: { sheetPx: B.px, rawSha: B_SHA, sheetType: "partial-nose-v1" } });
const annsAB = (opts) => ({ browLeft: makeAnnotation(A_SHA, "browLeft", A.points.browLeft, opts), browRight: makeAnnotation(A_SHA, "browRight", A.points.browRight, opts),
  mouth: makeAnnotation(A_SHA, "mouth", A.points.mouth, opts), nose: makeAnnotation(B_SHA, "nose", B_POINTS, opts) });

// ── sheet types ────────────────────────────────────────────────────────────────────────────────────────────────
test("the sheet types: full-v1 is D-164's four-cell sheet, partial-nose-v1 is the nose cell only", () => {
  assert.deepEqual([...SHEET_TYPES["full-v1"].contentCells], ["browLeft", "browRight", "nose", "mouth"]);
  assert.deepEqual([...SHEET_TYPES["partial-nose-v1"].contentCells], ["nose"]);
  assert.deepEqual(REJECTED_SOURCE_PARTS.map((r) => [r.rawSha256, r.part, r.decision]), [[D165_SHA, "nose", "D-166"]]);
});
test("RAW-4 is NOT weakened: a full sheet still needs all four cells, also through checkSheetByType", () => {
  assert.equal(checkRawSheet(B.png).firstFailure, "RAW-4");
  assert.equal(checkSheetByType(B.png, "full-v1").firstFailure, "RAW-4");
  assert.equal(checkSheetByType(A.png, "full-v1").verdict, "PASS_TO_ANNOTATION");
  assert.equal(checkSheetByType(A.png, "nope").firstFailure, "SHEET_TYPE_UNKNOWN");
});
test("RAW-4′: the nose-only sheet passes; a full sheet does not pass as a nose-only sheet", () => {
  const r = checkPartialSheet(B.png, ["nose"]);
  assert.equal(r.verdict, "PASS_TO_ANNOTATION");
  assert.deepEqual(r.auto.map((a) => [a.id, a.status]), [["RAW-1", "PASS"], ["RAW-2", "PASS"], ["RAW-3", "PASS"], ["RAW-4′", "PASS"], ["RAW-5", "PASS"]]);
  assert.equal(checkSheetByType(A.png, "partial-nose-v1").firstFailure, "RAW-4′");
});
test("RAW-4′ rejects ANY visible pixel in an empty cell — even one at alpha 1 — but RGB under alpha 0 does not count", () => {
  for (const part of ["browLeft", "browRight", "mouth"]) {
    const s = partial({ nose: noseCell() }), [cx, cy] = LAYOUT.cells[part], i = ((cy * 512 + 100) * 1024 + cx * 512 + 100) * 4;
    s.px.set([10, 10, 10, 1], i);
    const r = checkPartialSheet(encodePng(1024, 1024, s.px), ["nose"]);
    assert.equal(r.firstFailure, "RAW-4′", part); assert.match(r.auto.at(-1).detail, new RegExp("visible pixels in: " + part + " 1 px"));
  }
  const hidden = partial({ nose: noseCell() });
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) hidden.px.set([200, 120, 60, 0], (y * 1024 + x) * 4);   // RGB under alpha 0 in browLeft's cell
  assert.equal(checkPartialSheet(encodePng(1024, 1024, hidden.px), ["nose"]).verdict, "PASS_TO_ANNOTATION");
});
test("RAW-4′ rejects an empty nose cell; RAW-5 rejects a nose cut at its cell boundary; RAW-2 rejects another size", () => {
  assert.equal(checkPartialSheet(partial({}).png, ["nose"]).firstFailure, "RAW-4′");
  assert.equal(checkPartialSheet(partial({ nose: noseCell(500, 250) }).png, ["nose"]).firstFailure, "RAW-5");
  assert.equal(checkPartialSheet(encodePng(1024, 1536, new Uint8ClampedArray(1024 * 1536 * 4)), ["nose"]).firstFailure, "RAW-2");
});

// ── composition from two sources ──────────────────────────────────────────────────────────────────────────────
test("two synthetic sources compose into ONE layer; every part equals a plain resample of ITS OWN source cell", () => {
  const r = composeFromSources({ sources: sourcesAB(), annotations: annsAB(), targets: TT, mode: "synthetic-test" });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.log.rawSha256s.sort(), [A_SHA, B_SHA].sort());
  assert.match(r.log.noNewRawSheet, /no combined raw sheet exists/);
  for (const p of r.log.parts) {
    const s = sourcesAB()[p.part];
    assert.deepEqual([p.source.rawSha256, p.source.sheetType], [s.rawSha, s.sheetType], p.part);
    const c = new Float64Array(MASTER.w * MASTER.h * 4); overInto(c, MASTER.w, resampleArea(extractCell(s.sheetPx, p.part), p.transform.s, p.transform.tx, p.transform.ty, MASTER.w, MASTER.h));
    assert.equal(pixelSha256(quantise(c, MASTER.w, MASTER.h)), pixelSha256(r.layers[p.part]), p.part);
  }
  assert.equal(r.log.parts.find((p) => p.part === "nose").source.rawSha256, B_SHA, "the nose comes from the partial sheet");
});
test("with one full sheet as every source, composeFromSources equals D-164's composeFaceLayer pixel for pixel", () => {
  const anns = annotationsFor(A_SHA, A.points), src = Object.fromEntries(LAYOUT.order.map((p) => [p, { sheetPx: A.px, rawSha: A_SHA, sheetType: "full-v1" }]));
  const a = composeFromSources({ sources: src, annotations: anns, targets: TT, mode: "synthetic-test" }), b = composeFaceLayer({ sheetPx: A.px, rawSha: A_SHA, annotations: anns, targets: TT, mode: "synthetic-test" });
  assert.equal(pixelSha256(a.px), pixelSha256(b.px));
  assert.deepEqual(a.log.parts.map((p) => p.transform), b.log.parts.map((p) => p.transform));
});
test("source binding: an annotation bound to the other source, a part from a sheet type that cannot carry it, a missing source", () => {
  const wrong = annsAB(); wrong.nose = makeAnnotation(A_SHA, "nose", B_POINTS);
  assert.equal(composeFromSources({ sources: sourcesAB(), annotations: wrong, targets: TT, mode: "synthetic-test" }).code, "ANNOTATION_RAW_SHA_MISMATCH");
  const s = sourcesAB(); s.browLeft = { sheetPx: B.px, rawSha: B_SHA, sheetType: "partial-nose-v1" };
  assert.equal(composeFromSources({ sources: s, annotations: annsAB(), targets: TT, mode: "synthetic-test" }).code, "SOURCE_TYPE_DOES_NOT_CARRY_PART");
  const m = sourcesAB(); delete m.mouth;
  assert.equal(composeFromSources({ sources: m, annotations: annsAB(), targets: TT, mode: "synthetic-test" }).code, "SOURCE_MISSING");
  const t = sourcesAB(); t.nose = { ...t.nose, sheetType: "partial-brow" };
  assert.equal(composeFromSources({ sources: t, annotations: annsAB(), targets: TT, mode: "synthetic-test" }).code, "SHEET_TYPE_UNKNOWN");
});
test("D-165's rejected nose can never be a source, whatever its annotation says", () => {
  const s = sourcesAB(); s.nose = { sheetPx: A.px, rawSha: D165_SHA, sheetType: "full-v1" };
  const anns = annsAB(); anns.nose = makeAnnotation(D165_SHA, "nose", A.points.nose, { status: "SYNTHETIC_TEST_APPROVED" });
  const r = composeFromSources({ sources: s, annotations: anns, targets: TT, mode: "synthetic-test" });
  assert.deepEqual([r.ok, r.code], [false, "SOURCE_PART_REJECTED_BY_OWNER"]);
  const p = composeFromSources({ sources: s, annotations: annsAB({ status: "APPROVED" }), targets: APPROVED, mode: "production" });
  assert.equal(p.code, "SOURCE_PART_REJECTED_BY_OWNER", "also in production");
});
test("DRAFT annotations are refused in production; synthetic statuses never pass in production", () => {
  for (const status of ["DRAFT", "SYNTHETIC_TEST_APPROVED", "REJECTED"]) {
    const r = composeFromSources({ sources: sourcesAB(), annotations: annsAB({ status }), targets: APPROVED, mode: "production" });
    assert.deepEqual([r.ok, r.code], [false, "ANNOTATION_NOT_APPROVED"], status);
  }
});

// ── CLI: --manifest ───────────────────────────────────────────────────────────────────────────────────────────
function manifestFixture(dir, { badRawSha = false, badAnnSha = false, dirtyPartial = false, status = "SYNTHETIC_TEST_APPROVED" } = {}) {
  mkdirSync(join(dir, "ann"), { recursive: true });
  const b = dirtyPartial ? (() => { const px = buildSheet({ nose: noseCell() }); px.set([10, 10, 10, 3], ((40 * 1024) + 40) * 4); return { px, png: encodePng(1024, 1024, px) }; })() : B;
  writeFileSync(join(dir, "a.png"), A.png); writeFileSync(join(dir, "b.png"), b.png);
  const bSha = sha256(b.png), parts = {};
  for (const part of LAYOUT.order) {
    const fromB = part === "nose", rawSha = fromB ? bSha : A_SHA;
    const ann = makeAnnotation(rawSha, part, fromB ? B_POINTS : A.points[part], { status });
    const f = `ann/${part}.json`; writeFileSync(join(dir, f), JSON.stringify(ann));
    parts[part] = { raw: { file: fromB ? "b.png" : "a.png", sha256: badRawSha && fromB ? "0".repeat(64) : rawSha }, sheetType: fromB ? "partial-nose-v1" : "full-v1", layoutId: LAYOUT.id,
      cell: LAYOUT.cells[part], coordinateSpace: "cell-local continuous; pixel i covers [i, i+1); origin = the cell's top-left",
      annotation: { file: f, sha256: badAnnSha && fromB ? "1".repeat(64) : sha256(readFileSync(join(dir, f))), status } };
  }
  writeFileSync(join(dir, "manifest.json"), JSON.stringify({ schema: SOURCE_MANIFEST_SCHEMA, parts }));
  writeFileSync(join(dir, "targets.json"), JSON.stringify(TT));
}
const cli = (dir, outPath, mode = "synthetic-test", targets = join(dir, "targets.json")) => spawnSync(process.execPath,
  [CLI, "--manifest", join(dir, "manifest.json"), ...(targets ? ["--targets", targets] : []), "--out", outPath, "--mode", mode], { encoding: "utf8" });

test("CLI --manifest: two sources pass their own raw checks, compose, pass AUTO-1..5 of the existing checker, and log both sources", () => {
  const d = mkdtempSync(join(tmpdir(), "r3parts167-")); manifestFixture(d);
  const r = cli(d, join(d, "out"));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const log = JSON.parse(readFileSync(join(d, "out", "transform-log.json"), "utf8"));
  assert.equal(log.decision, "D-167");
  assert.deepEqual(log.composedChecks.auto.map((a) => a.status), ["PASS", "PASS", "PASS", "PASS", "PASS"]);
  assert.deepEqual(Object.values(log.rawChecks).map((x) => x.sheetType).sort(), ["full-v1", "partial-nose-v1"]);
  assert.ok(Object.values(log.rawChecks).find((x) => x.sheetType === "partial-nose-v1").auto.some((a) => a.id === "RAW-4′" && a.status === "PASS"));
  assert.equal(log.composition.sources.nose.rawSha256, sha256(B.png));
  assert.equal(sha256(readFileSync(join(d, "a.png"))), A_SHA, "the raw sources are not changed");
});
test("CLI --manifest rejections exit 2 and write no output", () => {
  for (const [opts, code] of [[{ badRawSha: true }, "SOURCE_SHA_MISMATCH"], [{ badAnnSha: true }, "ANNOTATION_FILE_SHA_MISMATCH"], [{ dirtyPartial: true }, "RAW-4′"]]) {
    const d = mkdtempSync(join(tmpdir(), "r3parts167-")); manifestFixture(d, opts);
    const r = cli(d, join(d, "out")); assert.equal(r.status, 2, r.stdout); assert.equal(JSON.parse(r.stdout).code, code); assert.equal(existsSync(join(d, "out")), false);
  }
  const d = mkdtempSync(join(tmpdir(), "r3parts167-")); manifestFixture(d, { status: "DRAFT" });
  const inBuild = join(REPO, "tools", "avatar", "build", "r3-face-parts-test-never-written-" + process.pid);
  const r = cli(d, inBuild, "production", null);
  assert.equal(r.status, 2, r.stdout); assert.equal(JSON.parse(r.stdout).code, "ANNOTATION_NOT_APPROVED", "DRAFT annotations never compose in production"); assert.equal(existsSync(inBuild), false);
  const mixed = spawnSync(process.execPath, [CLI, "--manifest", join(d, "manifest.json"), "--sheet", join(d, "a.png"), "--out", join(d, "x"), "--mode", "synthetic-test", "--targets", join(d, "targets.json")], { encoding: "utf8" });
  assert.equal(JSON.parse(mixed.stdout).code, "MIXED_MODES");
});
void NOSE;
