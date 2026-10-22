// D-174 — the R3 hair tool: tonal ramp B (exact integer stops, interpolation, rounding, alpha), the raw sheet checks H1..H5,
// and the composition with the functional placement checks HP1..HP8 on synthetic technical shapes (not a hair design).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { rampStopsB, rampColourB, lumaB, applyTonalRampB, hexToRgb, checkHairSheet, composeHair, checkPlacedHair, insidePolygon, encodePng, decodePng, THRESHOLDS, ZONES, FIT_POINTS, CHECK_POINTS, SHEET, ANNOTATION_SCHEMA } from "../../tools/avatar/r3-hair-tool.mjs";
import { HAIR_COLOR_TOKENS, DEFAULT_HAIR_COLOR } from "../../js/avatar-layers.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const file = (rel) => readFileSync(join(REPO, ...rel.split("/")));
const TARGETS = JSON.parse(file("tools/avatar/fixtures/r3-hair/targets-hair-v1.json").toString("utf8"));
const HEAD = decodePng(file("tools/avatar/fixtures/r3-head-geometry/r3-head-geometry-g1v3-e2-v1.png")).px;
const W = 1024, H = 1536;

// ── tonal ramp B ───────────────────────────────────────────────────────────────────────────────────────────────────
test("ramp B stops for the standard brown are exact (#1E140C ink, #3C2818 shadow, #5A3D28 base, #A47853 light)", () => {
  assert.equal(DEFAULT_HAIR_COLOR, "brown");
  assert.deepEqual(rampStopsB(HAIR_COLOR_TOKENS.brown), [[0, [30, 20, 12]], [80, [60, 40, 24]], [150, [90, 61, 40]], [255, [164, 120, 83]]]);
});

test("ramp B: the light stop per token matches the reviewed values, no channel clips, and the base stop IS the token", () => {
  const light = { black: [138, 124, 113], dark_brown: [149, 106, 71], brown: [164, 120, 83], light_brown: [191, 143, 97], blonde: [225, 189, 124], red: [207, 102, 66], auburn: [185, 98, 64], fantasy_blue: [104, 156, 225] };
  assert.deepEqual(Object.keys(HAIR_COLOR_TOKENS).sort(), Object.keys(light).sort(), "the eight live tokens");
  for (const [name, t] of Object.entries(HAIR_COLOR_TOKENS)) {
    const s = rampStopsB(t);
    assert.deepEqual(s[2][1], hexToRgb(t.base), name + " base");
    assert.deepEqual(s[1][1], hexToRgb(t.shadow), name + " shadow");
    assert.deepEqual(s[3][1], light[name], name + " light");
    assert.ok(s[3][1].every((c) => c < 255), name + " light does not clip");
    assert.deepEqual(s[0][1], hexToRgb(t.shadow).map((c) => Math.floor((c + 1) / 2)), name + " ink = shadow / 2, half up");
  }
});

test("ramp B interpolates piecewise linearly, hits every stop exactly and rounds half up (also for negative steps)", () => {
  const s = rampStopsB(HAIR_COLOR_TOKENS.brown);
  for (const [L, c] of s) assert.deepEqual(rampColourB(s, L), c, `L ${L}`);
  assert.deepEqual(rampColourB(s, 40), [45, 30, 18]);
  assert.deepEqual(rampColourB(s, 115), [75, 51, 32]);
  const t = rampStopsB({ base: [4, 4, 4], shadow: [2, 2, 2] });           // ink 1 (2/2), shadow 2, base 4
  assert.deepEqual(rampColourB(t, 40), [2, 2, 2], "1 + 0.5 rounds up to 2");
  const d = [[0, [10, 10, 10]], [80, [9, 9, 9]], [150, [9, 9, 9]], [255, [9, 9, 9]]];
  assert.deepEqual(rampColourB(d, 40), [10, 10, 10], "10 - 0.5 rounds half up to 10");
  assert.throws(() => rampColourB(s, 256)); assert.throws(() => rampColourB(s, 1.5)); assert.throws(() => rampStopsB({ base: "#5A3D2", shadow: "#000000" }));
  assert.deepEqual(rampStopsB({ base: "#000000", shadow: "#000000" })[3][1], [0, 0, 0], "a black base keeps light = base");
});

test("luma is integer Rec. 709 on the 8-bit code values, round half up", () => {
  assert.deepEqual([lumaB(0, 0, 0), lumaB(255, 255, 255), lumaB(100, 100, 100), lumaB(255, 0, 0), lumaB(0, 255, 0), lumaB(0, 0, 255)], [0, 255, 100, 54, 182, 18]);
});

test("applyTonalRampB copies alpha unchanged, zeroes fully transparent pixels and never touches the input", () => {
  const px = new Uint8ClampedArray([150, 150, 150, 255, 80, 80, 80, 128, 0, 0, 0, 7, 200, 200, 200, 0]), copy = px.slice();
  const out = applyTonalRampB(px, HAIR_COLOR_TOKENS.brown);
  assert.deepEqual([...out], [90, 61, 40, 255, 60, 40, 24, 128, 30, 20, 12, 7, 0, 0, 0, 0]);
  assert.deepEqual([...px], [...copy]);
  assert.throws(() => applyTonalRampB([1, 2, 3, 4], HAIR_COLOR_TOKENS.brown));
});

// ── synthetic sheet: the targets' sketch polygon drawn on a sheet at a known transform (technical shape only) ─────────
const S0 = 0.5, TX = 255, TY = -8;                                     // master = S0 * sheet + T
const toSheet = ([x, y]) => [(x - TX) / S0, (y - TY) / S0];
function synthSheet({ grey = 150, hole = null, extra = null } = {}) {
  const px = new Uint8ClampedArray(SHEET.w * SHEET.h * 4), sil = TARGETS.geometry.sketchSilhouette, nape = TARGETS.geometry.napeLock;
  for (let v = 0; v < SHEET.h; v++) for (let u = 0; u < SHEET.w; u++) {
    const x = S0 * (u + 0.5) + TX, y = S0 * (v + 0.5) + TY;
    let on = insidePolygon(sil, x, y) || insidePolygon(nape, x, y) || (extra && insidePolygon(extra, x, y));
    if (hole && insidePolygon(hole, x, y)) on = false;
    if (on) { const o = (v * SHEET.w + u) * 4; px[o] = px[o + 1] = px[o + 2] = grey; px[o + 3] = 255; }
  }
  return px;
}
const sheetBuf = (px) => Buffer.from(encodePng(SHEET.w, SHEET.h, px));
const annotationFor = (rawSha, shift = [0, 0]) => ({ schema: ANNOTATION_SCHEMA, version: "synthetic-1", status: "SYNTHETIC_TEST_APPROVED", raw: { file: "synthetic", sha256: rawSha }, annotator: "test", uncertaintyPx: 0,
  points: Object.fromEntries([...FIT_POINTS, ...CHECK_POINTS].map((k, i) => { const p = toSheet(TARGETS.points[k].xy); return [k, i === 0 ? [p[0] + shift[0], p[1] + shift[1]] : p]; })) });
// synthetic face (two brow bars at D-164's brow lines) and eyes (whites + lash bar + iris), technical shapes only
const FACE = new Uint8ClampedArray(W * H * 4), EYES = new Uint8ClampedArray(W * H * 4), IRIS = new Uint8ClampedArray(W * H * 4);
const put = (px, x, y, rgb, a = 255) => { const o = (y * W + x) * 4; px[o] = rgb[0]; px[o + 1] = rgb[1]; px[o + 2] = rgb[2]; px[o + 3] = a; };
for (let y = 258; y <= 270; y++) { for (let x = 398; x <= 482; x++) put(FACE, x, y, [80, 50, 30]); for (let x = 535; x <= 619; x++) put(FACE, x, y, [80, 50, 30]); }
for (const [cx, cy] of [[440, 318], [580, 318]]) for (let y = 284; y <= 352; y++) for (let x = cx - 34; x <= cx + 34; x++) {
  const e = ((x - cx) / 34) ** 2 + ((y - cy) / 34) ** 2; if (e > 1) continue;
  if (y <= 289) put(EYES, x, y, [18, 10, 7]); else if (((x - cx) / 22) ** 2 + ((y - cy) / 30) ** 2 <= 1) put(IRIS, x, y, [120, 120, 120]); else put(EYES, x, y, [255, 255, 255]);
}
const LAYERS = { headPx: HEAD, facePx: FACE, eyesFixedPx: EYES, irisPx: IRIS };
const compose = (sheetPx, ann) => { const sheet = checkHairSheet(sheetBuf(sheetPx)); assert.equal(sheet.verdict, "PASS_TO_ANNOTATION", JSON.stringify(sheet.auto)); return composeHair({ sheet, annotation: ann ?? annotationFor(sheet.rawSha256), targets: TARGETS, mode: "synthetic-test", ...LAYERS }); };
const BASE = synthSheet();

test("H1..H5: the synthetic sheet passes; each binding raw check rejects its own failure", () => {
  const ok = checkHairSheet(sheetBuf(BASE));
  assert.equal(ok.verdict, "PASS_TO_ANNOTATION");
  assert.deepEqual(ok.auto.map((s) => s.id), ["H1", "H2", "H3", "H4", "H5"]);
  assert.equal(checkHairSheet(Buffer.from(encodePng(1024, 1536, new Uint8ClampedArray(1024 * 1536 * 4)))).firstFailure, "H1");
  const border = BASE.slice(); border.set([150, 150, 150, 16], (5 * 1024 + 5) * 4);
  assert.equal(checkHairSheet(sheetBuf(border)).firstFailure, "H2");
  const low = BASE.slice(); low.set([150, 150, 150, 15], (5 * 1024 + 5) * 4);
  assert.equal(checkHairSheet(sheetBuf(low)).verdict, "PASS_TO_ANNOTATION", "alpha 1..15 is reported, never rejected");
  const tinted = BASE.slice(); const o = (300 * 1024 + 500) * 4; assert.equal(tinted[o + 3], 255); tinted.set([170, 150, 150], o);
  assert.equal(checkHairSheet(sheetBuf(tinted)).firstFailure, "H3");
  const islands = BASE.slice(); for (let v = 940; v < 1000; v++) for (let u = 30; u < 300; u++) islands.set([150, 150, 150, 255], (v * 1024 + u) * 4);
  assert.equal(checkHairSheet(sheetBuf(islands)).firstFailure, "H4");
  const tiny = new Uint8ClampedArray(1024 * 1024 * 4); for (let v = 400; v < 500; v++) for (let u = 400; u < 500; u++) tiny.set([150, 150, 150, 255], (v * 1024 + u) * 4);
  assert.equal(checkHairSheet(sheetBuf(tiny)).firstFailure, "H5");
});

test("the synthetic sheet composes exactly and passes HP1..HP8; zone overlap is reported, not decided", () => {
  const c = compose(BASE);
  assert.equal(c.ok, true, JSON.stringify(c));
  assert.ok(Math.abs(c.log.transform.s - S0) < 1e-9 && Math.abs(c.log.transform.tx - TX) < 1e-6 && Math.abs(c.log.transform.ty - TY) < 1e-6);
  assert.ok(c.log.residualMaxPx < 1e-6);
  assert.deepEqual(c.log.checks.map((x) => [x.id, x.ok]), [["HP1", true], ["HP2", true], ["HP3", true], ["HP4", true], ["HP5", true], ["HP6", true], ["HP7", true], ["HP8", true]]);
  const hp6 = c.log.checks.find((x) => x.id === "HP6").value;
  assert.deepEqual([hp6.middleTouchedPx, hp6.rightTouchedPx], [0, 0]);
  assert.ok(hp6.outerEnd.solid / hp6.outerEnd.px >= 0.5 && hp6.innerEnd.solid / hp6.innerEnd.px >= 0.5);
  assert.ok(c.log.diagnostics.zoneOverlapPx.eyeZones > 0, "the A7 tip overlaps the diagnostic eye box ...");
  assert.deepEqual(c.log.checks.find((x) => x.id === "HP7").value, { eyeWhite: 0, lashOrOutline: 0, foldStroke: 0, otherEyesFixed: 0, iris: 0 }, "... but covers no drawn eye content");
  assert.equal(c.log.diagnostics.broadEnvelopeOutsidePx, 0);
  assert.ok(c.log.diagnostics.napeLockSolidPx > 0);
});

test("HP1 / HP2 / annotation and targets gates reject before anything is placed", () => {
  const sheet = checkHairSheet(sheetBuf(BASE));
  const r1 = composeHair({ sheet, annotation: annotationFor(sheet.rawSha256, [20, 0]), targets: TARGETS, mode: "synthetic-test", ...LAYERS });
  assert.deepEqual([r1.ok, r1.code], [false, "HP1_RESIDUAL"]);
  assert.equal(composeHair({ sheet, annotation: { ...annotationFor(sheet.rawSha256), status: "DRAFT" }, targets: TARGETS, mode: "production", ...LAYERS }).code, "ANNOTATION_NOT_APPROVED");
  assert.equal(composeHair({ sheet, annotation: annotationFor("0".repeat(64)), targets: TARGETS, mode: "synthetic-test", ...LAYERS }).code, "ANNOTATION_RAW_SHA_MISMATCH");
  assert.equal(composeHair({ sheet, annotation: annotationFor(sheet.rawSha256), targets: { ...TARGETS, status: "DRAFT" }, mode: "production", ...LAYERS }).code, "TARGETS_NOT_APPROVED");
  const ann = annotationFor(sheet.rawSha256); delete ann.points.centralLockTip;
  assert.equal(composeHair({ sheet, annotation: ann, targets: TARGETS, mode: "synthetic-test", ...LAYERS }).code, "ANNOTATION_POINTS_INVALID");
  // a uniformly smaller sheet geometry fits exactly but at a scale outside 0.35..0.85
  const tiny = { ...annotationFor(sheet.rawSha256) }; tiny.points = Object.fromEntries(Object.entries(tiny.points).map(([k, p]) => [k, [p[0] * 0.3, p[1] * 0.3]]));
  assert.equal(composeHair({ sheet, annotation: tiny, targets: TARGETS, mode: "synthetic-test", ...LAYERS }).code, "HP2_SCALE");
});

test("HP4..HP8 each reject their own failure", () => {
  const box = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  assert.equal(compose(synthSheet({ hole: box(480, 150, 560, 199) })).code, "HP4_FAILED", "crown left bare");
  assert.equal(compose(synthSheet({ hole: box(420, 204, 440, 218) })).code, "HP5_FAILED", "an isolated scalp hole above the fringe, below the crown rows");
  assert.equal(compose(synthSheet({ extra: box(560, 245, 600, 266) })).code, "HP6_FAILED", "hair on the image-right brow");
  assert.equal(compose(synthSheet({ hole: box(395, 230, 412, 290) })).code, "HP6_FAILED", "the image-left brow's outer end left uncovered");
  assert.equal(compose(synthSheet({ extra: box(430, 286, 450, 300) })).code, "HP7_FAILED", "hair over the drawn eye");
  assert.equal(compose(synthSheet({ extra: box(330, 320, 362, 360) })).code, "HP8_FAILED", "hair down the ear below the v2 ear-top area");
});

test("checkPlacedHair is pure and the zones mirror the contract", () => {
  const C = JSON.parse(file("tools/avatar/fixtures/r3/r3-shadow-contract-v1.json").toString("utf8")).hairMethod;
  assert.deepEqual(C.thresholds, { ...THRESHOLDS, visibleAreaFractionRange: [...THRESHOLDS.visibleAreaFractionRange], scaleRange: [...THRESHOLDS.scaleRange] });
  assert.deepEqual(C.zones.faceSeed, [...ZONES.faceSeed]);
  assert.deepEqual(C.zones.ear, { rows: [...ZONES.ear.rows], leftMaxX: ZONES.ear.leftMaxX, rightMinX: ZONES.ear.rightMinX });
  assert.deepEqual(C.zones.browLeft, { rows: [...ZONES.browLeft.rows], outerEnd: [...ZONES.browLeft.outerEnd], middle: [...ZONES.browLeft.middle], innerEnd: [...ZONES.browLeft.innerEnd] });
  assert.deepEqual(C.zones.browRight, { rows: [...ZONES.browRight.rows], cols: [...ZONES.browRight.cols] });
  const hair = new Uint8ClampedArray(W * H * 4), before = HEAD.slice();
  const r = checkPlacedHair({ hairPx: hair, ...LAYERS, targets: TARGETS });
  assert.equal(r.firstFailure, "HP4", "no hair leaves the crown bare");
  assert.deepEqual([...HEAD.subarray(0, 4096)], [...before.subarray(0, 4096)]);
});
