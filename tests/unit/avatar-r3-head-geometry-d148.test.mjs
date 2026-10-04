// D-148 — the owner-adopted deterministic R3 head geometry: G1V3 + E2 + K4, the P2 regions and the
// classified transition gate.
//
// CI never needs H1 (D-127 §2): the geometry, the K4 contour and every locked value are RECOMPUTED here
// from the tracked G1V3 + D-133 fixtures and compared byte-for-byte with the tracked outputs. The P2
// rim (which reads H1's alpha) and the candidate gates are re-run only when FITTING_BASE_V1_PATH points
// at the pinned H1; without it those tests are skipped, exactly like the other H1-dependent R3 tests.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng } from "../../tools/avatar/build-r2-torso-occlusion-mask.mjs";
import { pngToMask, maskToPng, OUT_W, OUT_H } from "../../tools/avatar/build-r3-head-edit-masks.mjs";
import { transitionSilhouetteDiff } from "../../tools/avatar/recompose-r3-head-edit.mjs";
import {
  FIXTURE_DIR, FILES, MARKER, EXPECT, E2, K4, G1V3_SHA256, DECISION, HEAD_MAX_Y,
  buildGeometry, loadRegionsV1, contourToPng, pngToContour, sha256, run,
} from "../../tools/avatar/build-r3-head-geometry.mjs";
import {
  transitionUncovered, coreUncovered, recomposeGeometry, verifyOutput, GateError,
} from "../../tools/avatar/recompose-r3-head-geometry.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const N = OUT_W * OUT_H;
const fx = (k) => readFileSync(join(REPO, FIXTURE_DIR, FILES[k]));
const SPEC = JSON.parse(fx("spec").toString("utf8"));
const GEOM = pngToMask(fx("geometry"), FILES.geometry, MARKER.geometry);
const EDIT2 = pngToMask(fx("edit"), FILES.edit, MARKER.edit);
const PROTECT2 = pngToMask(fx("protect"), FILES.protect, MARKER.protect);
const CONTOUR = pngToContour(fx("contour"));
const V1 = loadRegionsV1(REPO);
const GEO = buildGeometry(REPO);                       // rebuilt from tracked inputs, no H1
const yOf = (p) => (p / OUT_W) | 0;
const maskToPngForTest = (set) => maskToPng(set, MARKER.geometry);
const H1_PATH = process.env.FITTING_BASE_V1_PATH;
const H1_AVAILABLE = !!H1_PATH && existsSync(H1_PATH);

// ── identity and reproducibility ─────────────────────────────────────────────
test("D-148 spec: the chosen geometry, contour and ear variant, with every fixture hash", () => {
  assert.equal(SPEC.decision, "D-148");
  assert.equal(DECISION, "D-148");
  assert.deepEqual(SPEC.chosen, { baseGeometry: "G1V3", earContour: "E2", contour: "K4" });
  assert.match(SPEC.notChosen.E4, /passed every gate, rejected/);
  for (const k of ["geometry", "contour", "edit", "protect"]) assert.equal(sha256(fx(k)), SPEC.fixtures[k].sha256, FILES[k] + " matches the spec");
  assert.equal(sha256(fx("g1v3")), G1V3_SHA256, "G1V3 is the owner-reviewed mask, byte-for-byte");
  assert.equal(SPEC.inputs.g1v3.sha256, G1V3_SHA256);
  assert.equal(SPEC.inputs.editV1.sha256, "5e843a9a217966e80affdc2b8783cf8926941ff4ab6d62d1e424c795f4885156");
  assert.equal(SPEC.inputs.transitionV1.sha256, "8f7a6f4c703adc52adbf12d7ee9357d6c0fd85721f8e46ae92f5f508a7ddb9f3");
  assert.equal(SPEC.inputs.authoringBase.tracked, false, "H1 is never tracked");
});

test("the geometry and the K4 contour are rebuilt byte-for-byte from the tracked inputs — twice", () => {
  const again = buildGeometry(REPO);
  for (const g of [GEO, again]) {
    assert.ok(maskToPngForTest(g.GEOM).equals(fx("geometry")), "geometry fixture reproduces");
    assert.ok(contourToPng(g.cov).equals(fx("contour")), "K4 contour fixture reproduces");
  }
  assert.equal(sha256(maskToPngForTest(GEO.GEOM)), sha256(maskToPngForTest(again.GEOM)));
});

test("G1V3 = symmetric head (rows <= 424) + exactly D-133's TRANSITION (rows 425–445)", () => {
  assert.equal(GEO.metrics.g1v3BandEqualsTransitionV1, true);
  for (let p = 0; p < N; p++) if (yOf(p) > HEAD_MAX_Y) assert.equal(GEOM[p], 0, "the geometry fixture holds the head only");
});

// ── E2: the previously measured variant, exactly ─────────────────────────────
test("E2 is the measured variant: 78 px (36 removed, 42 added), rows 291–305 / 376–384, jumps 2 / 3", () => {
  const m = GEO.metrics;
  assert.deepEqual(E2, { r: 4, windows: [[289, 306], [376, 385]] });
  assert.equal(m.changedPx, 78); assert.equal(m.removed, 36); assert.equal(m.added, 42);
  assert.deepEqual(m.changedRows, EXPECT.e2.changedRows);
  assert.equal(m.changedRows[0], 291); assert.equal(m.changedRows.filter((y) => y < 340).at(-1), 305);
  assert.equal(m.changedRows.filter((y) => y > 340)[0], 376); assert.equal(m.changedRows.at(-1), 384);
  assert.deepEqual(m.topJump, { d: 2, y: 295 }); assert.deepEqual(m.bottomJump, { d: 3, y: 376 });
});

// ── locked geometry values (binding) ─────────────────────────────────────────
test("locked: crownY 160, total width 342, protrusion 22, outermost ear point (341,325), symmetric, one component", () => {
  const m = GEO.metrics;
  assert.equal(m.crownY, 160); assert.equal(m.totalWidth, 342); assert.equal(m.protrusionB, 22);
  assert.deepEqual(m.outermostEarPoint, [341, 325]); assert.equal(m.asymmetryPx, 0); assert.equal(m.components, 1);
  // asymmetry recomputed from the tracked fixture, not from the builder
  let asym = 0; for (let p = 0; p < N; p++) if (GEOM[p] !== GEOM[yOf(p) * OUT_W + OUT_W - 1 - (p % OUT_W)]) asym++;
  assert.equal(asym, 0);
});

test("locked rows: no change against G1V3 in rows 309–373 or 390–424, and none below 424", () => {
  for (let p = 0; p < N; p++) {
    const y = yOf(p);
    if ((y >= 309 && y <= 373) || (y >= 390 && y <= HEAD_MAX_Y)) assert.equal(GEOM[p], GEO.G1V3[p], `row ${y} is locked`);
  }
  assert.deepEqual(GEO.metrics.lockedRowsChangedPx, {});
});

test("K4: 2,945 contour pixels on unchanged G1V3 become 2,935 on E2 — only where E2 moved the edge", () => {
  const k = GEO.metrics.k4Explanation;
  assert.equal(k.onUnchangedG1V3, 2945, "the A0 count");
  assert.equal(k.onE2, 2935); assert.equal(k.delta, -10);
  assert.equal(k.differingPxFurtherThan4RowsFromAnE2Row, 0, "the contour changes only within K4's 4-row reach of an E2 row");
  assert.deepEqual(SPEC.geometry.k4Explanation, k, "the spec records the same explanation");
});

test("P2 accounting: the 1,716 and 1,570 sets are defined, and every one of the 146 is explained (spec)", () => {
  const a = SPEC.regionsV2.rim.accounting;
  assert.match(a.definitions.set1716, /alpha 1\.\.127 ∧ PROTECT₁ .* rows 0–445/);
  assert.match(a.definitions.set1570, /rows ≤ 424 ∧ ¬EDIT₁ ∧ ¬GEOM ∧ H1 alpha > 0/);
  assert.deepEqual([a.set1716, a.set1570, a.only1716, a.only1570], [1716, 1570, 146, 0]);
  assert.deepEqual(a.only1716Classified, { insideGeometryCoveredAlpha255: 94, neckRows425to445PreservedAndConnectedToTransition: 52, unexplained: 0 });
  assert.equal(a.ghostOutsideGeometryRowsLE424InOutput, 0);
});

test("the spec carries no absolute, personal or scratch path", () => {
  const text = fx("spec").toString("utf8");
  assert.ok(!/[A-Za-z]:[\\/]|\/Users\/|AppData|Temp|DenSejeApp-artefacts|tools\/avatar\/build\//i.test(text), "no absolute or local artefact path");
  assert.ok(!/req_[0-9a-f]{8,}|sk-[A-Za-z0-9]{16,}|claim\.json/.test(text), "no request id, key or claim");
  for (const k of ["g1v3", "editV1", "transitionV1"]) assert.ok(existsSync(join(REPO, SPEC.inputs[k].path)), SPEC.inputs[k].path + " resolves");
});

test("K4: the recorded rule, Northstar's line colour, 2,935 contour pixels, all inside the geometry", () => {
  assert.equal(K4.width, 3); assert.equal(K4.window, 4); assert.deepEqual([...K4.line], [16, 10, 4]);
  let n = 0; for (let p = 0; p < N; p++) if (CONTOUR[p]) { n++; assert.equal(GEOM[p], 1, "contour inside the geometry"); assert.ok(yOf(p) <= HEAD_MAX_Y); }
  assert.equal(n, 2935);
});

// ── P2 (from the tracked fixtures; H1 needed only to re-derive the rim) ─────
test("P2: EDIT₂ ⊇ EDIT₁ ∪ GEOM, grows only in rows <= 424, TRANSITION unchanged, PROTECT₂ = ¬EDIT₂", () => {
  let added = 0;
  for (let p = 0; p < N; p++) {
    if (V1.EDIT[p]) assert.equal(EDIT2[p], 1, "EDIT₁ ⊆ EDIT₂");
    if (GEOM[p]) assert.equal(EDIT2[p], 1, "GEOM ⊆ EDIT₂");
    if (EDIT2[p] && !V1.EDIT[p]) { added++; assert.ok(yOf(p) <= HEAD_MAX_Y, "P2 never reaches the transition or the body"); }
    if (yOf(p) > HEAD_MAX_Y) assert.equal(EDIT2[p], V1.EDIT[p], "rows >= 425 are D-133's regions, unchanged");
    assert.equal(PROTECT2[p], EDIT2[p] ? 0 : 1);
  }
  assert.equal(added, SPEC.regionsV2.addedToEdit.total);
  assert.equal(SPEC.regionsV2.addedToEdit.total, SPEC.regionsV2.addedToEdit.geometryOutsideEditV1 + SPEC.regionsV2.addedToEdit.h1RimOutsideEditV1);
  assert.equal(SPEC.regionsV2.rimSolidPx, 0, "the rim is semi-transparent only");
  assert.equal(SPEC.regionsV2.rim.alpha["128+"], 0);
});

// ── the classified transition gate ───────────────────────────────────────────
// A synthetic H1 that is solid exactly on D-133's TRANSITION, so every case isolates one pixel class.
function syntheticCase() {
  const h1 = Buffer.alloc(N * 4);
  for (let p = 0; p < N; p++) if (V1.TRANSITION[p]) { h1[p * 4] = 200; h1[p * 4 + 1] = 150; h1[p * 4 + 2] = 100; h1[p * 4 + 3] = 255; }
  const src = Buffer.alloc(N * 4);
  for (let p = 0; p < N; p++) if (V1.TRANSITION[p] || GEOM[p]) { src[p * 4] = 250; src[p * 4 + 1] = 190; src[p * 4 + 2] = 120; src[p * 4 + 3] = 255; }
  const regions = { EDIT: EDIT2, PROTECT: PROTECT2, TRANSITION: V1.TRANSITION, CORE: new Uint8Array(N) };
  for (let p = 0; p < N; p++) regions.CORE[p] = EDIT2[p] && !V1.TRANSITION[p] ? 1 : 0;
  return { h1, src, regions };
}
const firstTransitionPixel = () => { for (let p = 0; p < N; p++) if (V1.TRANSITION[p]) return p; return -1; };

test("gate: a RELEVANT narrower deviation (source leaves a TRANSITION pixel uncovered) fails", () => {
  const { h1, src, regions } = syntheticCase();
  src[firstTransitionPixel() * 4 + 3] = 0;
  assert.equal(transitionUncovered(h1, src, regions.TRANSITION, regions.EDIT).uncovered, 1);
  assert.throws(() => recomposeGeometry({ h1Rgba: h1, srcRgba: src, geom: GEOM, contour: CONTOUR, regions, line: K4.line }),
    (e) => e instanceof GateError && e.gate === "pre.transition-uncovered" && /not covered by the source/.test(e.message));
});

test("gate: an IRRELEVANT wider deviation outside EDIT does not trigger the transition gate (the old gate did)", () => {
  const { h1, src, regions } = syntheticCase();
  const p = 430 * OUT_W + 300; assert.equal(regions.EDIT[p], 0, "the probe pixel is outside EDIT₂");
  src[p * 4 + 3] = 255;
  const t = transitionUncovered(h1, src, regions.TRANSITION, regions.EDIT);
  assert.deepEqual([t.uncovered, t.widerInsideEdit, t.widerOutsideEdit], [0, 0, 1]);
  assert.equal(transitionSilhouetteDiff(h1, src).count, 1, "the historical whole-row gate counted it");
  const { rgba } = recomposeGeometry({ h1Rgba: h1, srcRgba: src, geom: GEOM, contour: CONTOUR, regions, line: K4.line });
  assert.equal(rgba[p * 4 + 3], 0, "and it never reaches the output: PROTECT₂ is H1");
});

test("gate: a wider pixel INSIDE EDIT is a separate, failing class — never tolerated", () => {
  const { h1, src, regions } = syntheticCase();
  const p = 430 * OUT_W + 300, edit = new Uint8Array(regions.EDIT); edit[p] = 1;
  src[p * 4 + 3] = 255;
  assert.equal(transitionUncovered(h1, src, regions.TRANSITION, edit).widerInsideEdit, 1);
  assert.throws(() => recomposeGeometry({ h1Rgba: h1, srcRgba: src, geom: GEOM, contour: CONTOUR, regions: { ...regions, EDIT: edit }, line: K4.line }),
    (e) => e.gate === "pre.transition-wider-inside-edit");
});

test("gate: a geometry pixel without source colour fails pre.core-uncovered", () => {
  const { h1, src, regions } = syntheticCase();
  let p = 0; while (!GEOM[p]) p++; src[p * 4 + 3] = 0;
  assert.equal(coreUncovered(src, GEOM), 1);
  assert.throws(() => recomposeGeometry({ h1Rgba: h1, srcRgba: src, geom: GEOM, contour: CONTOUR, regions, line: K4.line }), (e) => e.gate === "pre.core-uncovered");
});

test("post gates: residue outside the geometry and protected-byte changes are counted, not tolerated", () => {
  const { h1, src, regions } = syntheticCase();
  const { rgba } = recomposeGeometry({ h1Rgba: h1, srcRgba: src, geom: GEOM, contour: CONTOUR, regions, line: K4.line });
  const clean = verifyOutput({ outRgba: rgba, h1Rgba: h1, geom: GEOM, regions });
  assert.deepEqual([clean.protectedBytes, clean.transitionAlpha, clean.residueOutsideGeometry, clean.asymmetryPx], [0, 0, 0, 0]);
  const bad = Buffer.from(rgba); let q = 0; while (GEOM[q] || yOf(q) > HEAD_MAX_Y || !regions.CORE[q]) q++; bad[q * 4 + 3] = 40;
  assert.equal(verifyOutput({ outRgba: bad, h1Rgba: h1, geom: GEOM, regions }).residueOutsideGeometry, 1, "a ghost pixel is caught");
});

test("the historical D-133 gate is unchanged, so the D-140 / D-147 numbers stay reproducible", () => {
  const code = readFileSync(join(REPO, "tools", "avatar", "recompose-r3-head-edit.mjs"), "utf8");
  assert.match(code, /GateError\("pre\.transition-silhouette"/);
});

// ── the earlier bad candidates still fail (local only: their raws are not tracked) ──
// D-139's raw lives in the owner's external archive and is passed by environment, never by a tracked path.
const RAWS = {
  "D-139": [process.env.R3_D139_RAW_PATH || "", 113],
  "D-143": [process.env.R3_D143_RAW_PATH || join(REPO, "tools", "avatar", "build", "r3-underlay-core", "r3-underlay-core.raw.png"), 157],
};
for (const [id, [path, uncovered]] of Object.entries(RAWS)) {
  test(`${id} raw still fails the classified gate (${uncovered} uncovered)`, { skip: !(H1_AVAILABLE && path && existsSync(path)) && "local raw or H1 not available" }, () => {
    const h1 = decodePng(readFileSync(H1_PATH)).rgba, raw = decodePng(readFileSync(path)).rgba;
    assert.equal(transitionUncovered(h1, raw, V1.TRANSITION, V1.EDIT).uncovered, uncovered);
  });
}

// ── H1-dependent: full reproduction and the binding candidate gates ──────────
test("with H1: the generator --check reproduces every fixture and the spec byte-for-byte; all candidate gates pass",
  { skip: !H1_AVAILABLE && "FITTING_BASE_V1_PATH not set" }, () => {
    const r = run({ h1Path: H1_PATH, check: true, repoRoot: REPO, log: () => {} });
    assert.equal(r.ok, true, JSON.stringify(r.results));
    const g = r.spec.candidate.gates;
    assert.equal(g.preTransitionUncovered, 0); assert.ok(g.join.pass && g.join.observed <= 4);
    assert.equal(g.ghostResidueOutsideGeometry, 0); assert.equal(g.protectedBytes, 0); assert.equal(g.asymmetryPx, 0);
    assert.equal(g.rows425to445BytesVsH1, 0); assert.equal(g.lockedGeometryRowsChangedPx, 0); assert.equal(g.allPass, true);
    assert.equal(sha256(r.candidate), SPEC.candidate.sha256, "the candidate is deterministic");
    assert.deepEqual(r.spec.regionsV2.rim.accounting, SPEC.regionsV2.rim.accounting, "the 1,716 / 1,570 accounting re-derives from H1");
  });

// ── scope ────────────────────────────────────────────────────────────────────
test("R3 stays a default-OFF shadow stack: nothing in the runtime references the D-148 fixtures", () => {
  const spec = JSON.stringify(SPEC);
  assert.match(spec, /DEFAULT OFF/); assert.match(spec, /NO IMAGE CALL AUTHORISED/);
  for (const f of readdirSync(join(REPO, "js")).filter((n) => n.endsWith(".js")))
    assert.ok(!readFileSync(join(REPO, "js", f), "utf8").includes("r3-head-geometry"), `js/${f} must not load D-148 fixtures`);
  assert.ok(!/AVATAR_R3\s*=\s*true/.test(readFileSync(join(REPO, "js", "avatar-layers.js"), "utf8")));
});
