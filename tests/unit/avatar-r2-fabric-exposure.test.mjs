// D-098 — the fabric-exposure classifier: mandatory-mask RUNS, not the column's first opaque row.
// ---------------------------------------------------------------------------------------------
// D-097 §7 concluded that three columns needed roughly 10 px of new shoulder-plate artwork. D-098
// measured those columns before drawing anything and the conclusion did not survive: the proposed
// correction was 10 pixels, all 10 outside `torso-edit-allowed-v1` and on `torso-protect-v1`, and
// 8 of the 10 already drawn by the existing plate and clipped away by that same mask.
//
// The cause was the exposure metric, and its bug was in two places: it compared a fabric top only
// against the column's FIRST mandatory run, and it never asked whether the fabric was inside the
// mandatory mask at all. These tests pin both, plus the threshold, on synthetic masks (where the
// topology is stated outright) AND on the real tracked mask fixtures at the real coordinates.
//
// NO VENDORED BINARY: this file reads the tracked mask PNGs through the pure-JS `decodePng`, so it
// runs in CI. See tests/unit-ci-exclusions.mjs — `decodePng` is deliberately not a binary marker.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  CATEGORY, TRUE_CUT_THRESHOLD, SILHOUETTE_TOLERANCE_ROWS,
  maskRuns, runContaining, classifyFabricTop, classifyFabricTopLegacyD097,
  classifyExposure, exposureReport,
} from "../../tools/avatar/garment-mesh/fabric-exposure.mjs";
import { decodePng } from "../../tools/avatar/build-r2-torso-occlusion-mask.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, "..", "..", "tools", "avatar", "fixtures", "r2-torso");
const W = 1024, H = 1536;

function loadMask(name) {
  const img = decodePng(readFileSync(join(FIX, name)), name);
  assert.equal(img.w, W); assert.equal(img.h, H);
  const m = new Uint8Array(img.w * img.h);
  for (let i = 0; i < m.length; i++) m[i] = img.rgba[i * 4 + 3] > 0 ? 1 : 0;
  return m;
}
const hard = loadMask("torso-occlusion-hard-v1.png");
const edit = loadMask("torso-edit-allowed-v1.png");
const protect = loadMask("torso-protect-v1.png");

// A tiny canvas whose mandatory column is stated outright, so the run logic is tested against a
// topology the test itself declares rather than against whatever the fixture happens to contain.
function synthetic(runsPerColumn, w = 4, h = 24) {
  const m = new Uint8Array(w * h);
  for (const [x, runs] of Object.entries(runsPerColumn)) {
    for (const [y0, y1] of runs) for (let y = y0; y <= y1; y++) m[y * w + Number(x)] = 1;
  }
  return { mask: m, w, h };
}

// ── run detection ─────────────────────────────────────────────────────────────────────────────
test("maskRuns: a single-run column yields one run", () => {
  const { mask, w, h } = synthetic({ 1: [[5, 9]] });
  assert.deepEqual(maskRuns(mask, w, h, 1), [{ y0: 5, y1: 9 }]);
});

test("maskRuns: a multi-run column yields every run, ascending and non-overlapping", () => {
  const { mask, w, h } = synthetic({ 1: [[3, 4], [8, 12], [20, 21]] });
  assert.deepEqual(maskRuns(mask, w, h, 1), [{ y0: 3, y1: 4 }, { y0: 8, y1: 12 }, { y0: 20, y1: 21 }]);
});

test("maskRuns: a one-row run is a run", () => {
  const { mask, w, h } = synthetic({ 2: [[7, 7]] });
  assert.deepEqual(maskRuns(mask, w, h, 2), [{ y0: 7, y1: 7 }]);
});

test("maskRuns: an empty column yields no runs, and runContaining returns null", () => {
  const { mask, w, h } = synthetic({ 1: [[3, 4]] });
  assert.deepEqual(maskRuns(mask, w, h, 0), []);
  assert.equal(runContaining([], 5), null);
});

// ── the three categories ──────────────────────────────────────────────────────────────────────
test("1. the FIRST run's top classifies as A (mandatory_run_silhouette)", () => {
  const { mask, w, h } = synthetic({ 1: [[3, 6], [11, 18]] });
  assert.equal(classifyFabricTop(mask, w, h, 1, 3).category, CATEGORY.A);
});

test("2. a LATER run's top classifies as A — the D-097 bug that made x=338/339 false positives", () => {
  const { mask, w, h } = synthetic({ 1: [[3, 6], [11, 18]] });
  const c = classifyFabricTop(mask, w, h, 1, 11);
  assert.equal(c.category, CATEGORY.A);
  assert.deepEqual(c.run, { y0: 11, y1: 18 });
  assert.equal(c.rowsBelowRunTop, 0);
  // and the shipped rule gets it wrong, which is the regression this pins
  assert.equal(classifyFabricTopLegacyD097(mask, w, h, 1, 11), "cut");
});

test("2b. one row below a run's top is still A; the tolerance is exactly one row", () => {
  const { mask, w, h } = synthetic({ 1: [[3, 6], [11, 18]] });
  assert.equal(SILHOUETTE_TOLERANCE_ROWS, 1);
  assert.equal(classifyFabricTop(mask, w, h, 1, 12).category, CATEGORY.A);
  assert.equal(classifyFabricTop(mask, w, h, 1, 13).category, CATEGORY.C);
});

test("3. inside a run but several rows below its top classifies as C (true_cut)", () => {
  const { mask, w, h } = synthetic({ 1: [[3, 6], [11, 18]] });
  const c = classifyFabricTop(mask, w, h, 1, 15);
  assert.equal(c.category, CATEGORY.C);
  assert.equal(c.rowsBelowRunTop, 4);
});

test("4. fabric BETWEEN two runs is never C — the garment is not required to be there", () => {
  const { mask, w, h } = synthetic({ 1: [[3, 6], [11, 18]] });
  for (const y of [7, 8, 9, 10]) {
    const c = classifyFabricTop(mask, w, h, 1, y);
    assert.equal(c.category, CATEGORY.B, `y=${y} must be B, got ${c.category}`);
    assert.equal(c.run, null);
    assert.notEqual(c.category, CATEGORY.C);
  }
});

test("5. fabric entirely outside the mandatory mask classifies as B", () => {
  const { mask, w, h } = synthetic({ 1: [[3, 6]] });
  const c = classifyFabricTop(mask, w, h, 0, 5);
  assert.equal(c.category, CATEGORY.B);
  assert.equal(c.run, null);
});

// ── the real columns, on the real tracked masks ───────────────────────────────────────────────
// The fabric tops are the values D-098 measured on the D-097 micro-fit candidate. The masks are the
// tracked fixtures, so the topology under test is the real one.
const MEASURED_MICROFIT_FABRIC_TOPS = Object.freeze([
  [333, 670], [334, 664], [335, 664], [336, 656], [337, 656], [338, 656],
  [339, 656], [687, 656], [688, 656], [690, 674], [691, 674], [692, 682],
]);

test("6. x=338 is NOT a true_cut — it is the top of the column's second mandatory run", () => {
  assert.deepEqual(maskRuns(hard, W, H, 338), [{ y0: 646, y1: 649 }, { y0: 656, y1: 693 }]);
  const c = classifyFabricTop(hard, W, H, 338, 656);
  assert.equal(c.category, CATEGORY.A);
  assert.notEqual(c.category, CATEGORY.C);
});

test("7. x=339 is NOT a true_cut — same second-run top", () => {
  assert.deepEqual(maskRuns(hard, W, H, 339), [{ y0: 646, y1: 649 }, { y0: 656, y1: 693 }]);
  const c = classifyFabricTop(hard, W, H, 339, 656);
  assert.equal(c.category, CATEGORY.A);
  assert.notEqual(c.category, CATEGORY.C);
});

test("8. x=687 is B — the fabric top lies outside the mandatory mask entirely", () => {
  assert.deepEqual(maskRuns(hard, W, H, 687), [{ y0: 648, y1: 649 }, { y0: 658, y1: 707 }]);
  assert.equal(hard[656 * W + 687], 0, "y=656 must be outside the mandatory mask at x=687");
  const c = classifyFabricTop(hard, W, H, 687, 656);
  assert.equal(c.category, CATEGORY.B);
  assert.notEqual(c.category, CATEGORY.C);
});

test("9. category-C count is 0 across every fabric top measured on the micro-fit candidate", () => {
  const cats = MEASURED_MICROFIT_FABRIC_TOPS.map(([x, top]) => classifyFabricTop(hard, W, H, x, top).category);
  assert.equal(cats.filter((c) => c === CATEGORY.C).length, TRUE_CUT_THRESHOLD);
  assert.ok(cats.filter((c) => c === CATEGORY.B).length > 0, "category B must not be empty — it is a real open question");
});

test("10. the shipped D-097 rule reproduces exactly the three false positives", () => {
  const cut = MEASURED_MICROFIT_FABRIC_TOPS
    .filter(([x, top]) => classifyFabricTopLegacyD097(hard, W, H, x, top) === "cut")
    .map(([x]) => x);
  assert.deepEqual(cut, [338, 339, 687], "the regression under repair, stated as data");
});

// ── the gate itself ───────────────────────────────────────────────────────────────────────────
test("11. the true_cut threshold is exactly zero and is not caller-configurable", () => {
  assert.equal(TRUE_CUT_THRESHOLD, 0);
  // classifyExposure takes no threshold argument: there is no seam through which to widen the gate.
  assert.ok(!/threshold/i.test(classifyExposure.toString().split("\n")[0]));
  const { mask, w, h } = synthetic({ 1: [[3, 6], [11, 18]] });
  const visibleFabric = new Uint8Array(w * h); visibleFabric[15 * w + 1] = 1;   // deep inside run 2
  const opaque = new Uint8Array(w * h);
  const r = classifyExposure({ hard: mask, visibleFabric, opaque, width: w, height: h });
  assert.deepEqual(r.trueCutColumns, [1]);
  assert.equal(r.passesTrueCutGate, false, "a real cut must fail the gate");
});

test("12. category B is a required field of the report and cannot vanish silently", () => {
  const { mask, w, h } = synthetic({ 1: [[3, 6], [11, 18]] });
  const visibleFabric = new Uint8Array(w * h); visibleFabric[8 * w + 1] = 1;    // between the runs
  const opaque = new Uint8Array(w * h);
  const rep = exposureReport(classifyExposure({ hard: mask, visibleFabric, opaque, width: w, height: h }));
  for (const k of ["trueCutColumns", "trueCutCount", "nonMandatoryFabricColumns", "nonMandatoryFabricCount", "nonMandatoryFabricNote", "mandatoryRunSilhouetteColumns", "legacyD097CutColumns"]) {
    assert.ok(k in rep, `exposureReport must always carry ${k}`);
  }
  assert.deepEqual(rep.nonMandatoryFabricColumns, [1]);
  assert.equal(rep.trueCutCount, 0);
  assert.match(rep.nonMandatoryFabricNote, /open question/i);
});

test("13. protect is still the exact complement of edit, so 'outside edit' and 'on protect' are one rule", () => {
  let disagree = 0;
  for (let i = 0; i < W * H; i++) if ((edit[i] === 1) === (protect[i] === 1)) disagree++;
  assert.equal(disagree, 0);
});

test("14. the 10 pixels the D-097 correction would have needed are unpaintable, and nothing paints them", () => {
  // 4 at x=338 (y 652-655), 4 at x=339, 2 at x=687 (y 654-655) — measured in D-098.
  const proposed = [];
  for (const y of [652, 653, 654, 655]) { proposed.push([338, y]); proposed.push([339, y]); }
  for (const y of [654, 655]) proposed.push([687, y]);
  assert.equal(proposed.length, 10);
  for (const [x, y] of proposed) {
    const i = y * W + x;
    assert.equal(edit[i], 0, `(${x},${y}) must be outside the edit mask`);
    assert.equal(protect[i], 1, `(${x},${y}) must be on the protect mask`);
    assert.equal(hard[i], 0, `(${x},${y}) must be outside the mandatory mask`);
  }
  // The classifier is a measurement, not a painter: it exports no way to write pixels.
  const api = ["CATEGORY", "TRUE_CUT_THRESHOLD", "SILHOUETTE_TOLERANCE_ROWS", "maskRuns", "runContaining",
    "classifyFabricTop", "classifyFabricTopLegacyD097", "classifyExposure", "exposureReport"];
  const src = readFileSync(join(HERE, "..", "..", "tools", "avatar", "garment-mesh", "fabric-exposure.mjs"), "utf8");
  for (const m of src.match(/^export (?:const|function) (\w+)/gm) ?? []) {
    assert.ok(api.includes(m.split(" ").pop()), `unexpected export ${m} — the classifier must stay a pure measurement`);
  }
  assert.ok(!/writeFileSync|encodePng|rgba\[/.test(src), "fabric-exposure.mjs must not touch pixels or files");
});

// ── the boolean-mask contract ─────────────────────────────────────────────────────────────────
test("antialiasing cannot invent runs: the classifier refuses a non-boolean mask", () => {
  const alphaish = new Uint8Array(4 * 4); alphaish[5] = 128;
  const ok = new Uint8Array(4 * 4);
  assert.throws(() => classifyExposure({ hard: alphaish, visibleFabric: ok, opaque: ok, width: 4, height: 4 }), /not boolean/);
  assert.throws(() => classifyExposure({ hard: ok, visibleFabric: alphaish, opaque: ok, width: 4, height: 4 }), /not boolean/);
});

test("classifyExposure skips columns that are covered from directly above", () => {
  const { mask, w, h } = synthetic({ 1: [[3, 18]] });
  const visibleFabric = new Uint8Array(w * h); visibleFabric[15 * w + 1] = 1;
  const opaque = new Uint8Array(w * h); opaque[14 * w + 1] = 1;                 // plate sits on top
  const r = classifyExposure({ hard: mask, visibleFabric, opaque, width: w, height: h });
  assert.deepEqual(r.columns, []);
  assert.equal(r.passesTrueCutGate, true);
});
