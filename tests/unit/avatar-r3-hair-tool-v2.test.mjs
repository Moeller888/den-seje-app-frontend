// D-179 — the R3 hair tool v2 (registration v2): seat fit on A4, A9, A10, the A4 proposal, the mandatory temple locks
// (HP-LOCK), fragments (HP-FRAG), the crown zone <= 194 (HP4 v2) and the noise-model justification of the thresholds over
// the WHOLE allowed scale range. Synthetic technical shapes only (not a hair design); no image call, no D-177 sheet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkHairSheet, insidePolygon, checkPlacedHair as checkPlacedHairV1, THRESHOLDS as THRESHOLDS_V1 } from "../../tools/avatar/r3-hair-tool.mjs";
import { composeHair, proposeA4, fitSeat, checkLocks, checkFragments, checkPlacedHair, lockWindowsPx, validateTargets, axisScales, encodePng, decodePng, THRESHOLDS, FIT_POINTS, MANDATORY_LOCKS, POINT_DEFINITIONS, CHECK_POINTS, ANNOTATION_SCHEMA, SHEET } from "../../tools/avatar/r3-hair-tool-v2.mjs";
import { fitUniformScaleTranslate } from "../../tools/avatar/r3-face-parts-tool.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const file = (rel) => readFileSync(join(REPO, ...rel.split("/")));
const TARGETS = JSON.parse(file("tools/avatar/fixtures/r3-hair/targets-hair-v2.json").toString("utf8"));
const TV1 = JSON.parse(file("tools/avatar/fixtures/r3-hair/targets-hair-v1.json").toString("utf8"));
const HEAD = decodePng(file("tools/avatar/fixtures/r3-head-geometry/r3-head-geometry-g1v3-e2-v1.png")).px;
const W = 1024, H = 1536, T = (k) => TARGETS.points[k].xy;

// ── synthetic sheet: the targets' sketch silhouette (NO nape lock under v2) at a known transform ─────────────────────
const S0 = 0.5, TX = 255, TY = -8;                                     // master = S0 * sheet + T
const toSheet = ([x, y]) => [(x - TX) / S0, (y - TY) / S0];
const SIL = TARGETS.geometry.sketchSilhouette;
function synthSheet({ extra = [], hole = null, poly = SIL } = {}) {
  const px = new Uint8ClampedArray(SHEET.w * SHEET.h * 4);
  for (let v = 0; v < SHEET.h; v++) for (let u = 0; u < SHEET.w; u++) {
    const x = S0 * (u + 0.5) + TX, y = S0 * (v + 0.5) + TY;
    let on = insidePolygon(poly, x, y) || extra.some((e) => insidePolygon(e, x, y));
    if (hole && insidePolygon(hole, x, y)) on = false;
    if (on) { const o = (v * SHEET.w + u) * 4; px[o] = px[o + 1] = px[o + 2] = 150; px[o + 3] = 255; }
  }
  return px;
}
const sheetBuf = (px) => Buffer.from(encodePng(SHEET.w, SHEET.h, px));
// D-179 owner rule: reading 2 with reading 1 hidden, one point definition, a marked crop per reading for owner review
const reading = (k, xy, pass) => ({ xy, pass, ...(pass === 2 ? { firstReadingHidden: true } : {}), definition: POINT_DEFINITIONS[k], crop: { file: `crops/${k}-reading-${pass}.png`, sha256: "a".repeat(64) } });
const readingsFor = (k, a, b = a) => [reading(k, a, 1), reading(k, b, 2)];
const NOTCHES = { leftTempleLock: [[413, 246], [372, 286]], rightTempleLock: [[612, 224], [633, 292]] };   // master; technical
function annotationFor(rawSha, edit = (a) => a) {
  const fp = (k, u) => ({ status: "IDENTIFIED", xy: toSheet(T(k)), uncertaintySheetPx: u });
  const ear = (k) => ({ ...fp(k, 4), readings: readingsFor(k, toSheet(T(k))) });
  const lock = (lk) => ({ status: "IDENTIFIED", tip: toSheet(T(MANDATORY_LOCKS[lk])), flankingNotches: NOTCHES[lk].map(toSheet), evidence: "synthetic test lock: a separate protrusion between two notches" });
  return edit({ schema: ANNOTATION_SCHEMA, version: "synthetic-1", status: "SYNTHETIC_TEST_APPROVED", raw: { file: "synthetic", sha256: rawSha }, annotator: "test", units: "sheet-px",
    fitPoints: { centreHairline: { ...fp("centreHairline", 3), proposal: { tool: "r3-hair-tool-v2 proposeA4", xy: null } }, leftEarTopJunction: ear("leftEarTopJunction"), rightEarTopJunction: ear("rightEarTopJunction") },
    locks: { leftTempleLock: lock("leftTempleLock"), rightTempleLock: lock("rightTempleLock") },
    checkPoints: Object.fromEntries(CHECK_POINTS.map((k) => [k, toSheet(T(k))])) });
}
// synthetic face (brow bars) and eyes (whites + lash bar + iris) — the same technical shapes as the v1 tests
const FACE = new Uint8ClampedArray(W * H * 4), EYES = new Uint8ClampedArray(W * H * 4), IRIS = new Uint8ClampedArray(W * H * 4);
const put = (px, x, y, rgb, a = 255) => { const o = (y * W + x) * 4; px[o] = rgb[0]; px[o + 1] = rgb[1]; px[o + 2] = rgb[2]; px[o + 3] = a; };
for (let y = 258; y <= 270; y++) { for (let x = 398; x <= 482; x++) put(FACE, x, y, [80, 50, 30]); for (let x = 535; x <= 619; x++) put(FACE, x, y, [80, 50, 30]); }
for (const [cx, cy] of [[440, 318], [580, 318]]) for (let y = 284; y <= 352; y++) for (let x = cx - 34; x <= cx + 34; x++) {
  const e = ((x - cx) / 34) ** 2 + ((y - cy) / 34) ** 2; if (e > 1) continue;
  if (y <= 289) put(EYES, x, y, [18, 10, 7]); else if (((x - cx) / 22) ** 2 + ((y - cy) / 30) ** 2 <= 1) put(IRIS, x, y, [120, 120, 120]); else put(EYES, x, y, [255, 255, 255]);
}
const LAYERS = { headPx: HEAD, facePx: FACE, eyesFixedPx: EYES, irisPx: IRIS };
const BASE = synthSheet(), BASE_SHEET = checkHairSheet(sheetBuf(BASE));
const compose = (sheetPx, edit) => { const sheet = sheetPx === BASE ? BASE_SHEET : checkHairSheet(sheetBuf(sheetPx)); assert.equal(sheet.verdict, "PASS_TO_ANNOTATION", JSON.stringify(sheet.auto)); return composeHair({ sheet, annotation: annotationFor(sheet.rawSha256, edit), targets: TARGETS, mode: "synthetic-test", ...LAYERS }); };
const box = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

// ── targets v2 ─────────────────────────────────────────────────────────────────────────────────────────────────────
test("targets v2: D-174's coordinates, ids, provenance and geometry unchanged; only the roles change", () => {
  assert.deepEqual(validateTargets(TARGETS, "production"), { ok: true });
  assert.deepEqual(Object.keys(TARGETS.points), Object.keys(TV1.points));
  for (const [k, p] of Object.entries(TV1.points)) {
    assert.deepEqual(TARGETS.points[k].xy, p.xy, k + ": no silent move");
    assert.deepEqual([TARGETS.points[k].id, TARGETS.points[k].kind, TARGETS.points[k].source, TARGETS.points[k].uncertaintyMasterPx, TARGETS.points[k].roleV1], [p.id, p.kind, p.source, p.uncertaintyPx, p.role], k);
  }
  assert.deepEqual(TARGETS.geometry, TV1.geometry);
  const role = (r) => Object.keys(TARGETS.points).filter((k) => TARGETS.points[k].role === r);
  assert.deepEqual(role("fit"), ["centreHairline", "leftEarTopJunction", "rightEarTopJunction"]);
  assert.deepEqual(FIT_POINTS.map((k) => TARGETS.points[k].id), ["A4", "A9", "A10"]);
  assert.deepEqual(role("mandatoryLock").map((k) => TARGETS.points[k].id), ["A7", "A8"]);
  assert.deepEqual(role("check").map((k) => TARGETS.points[k].id).sort(), ["A1", "A2", "A3", "A5", "A6"]);
  assert.equal(TARGETS.points.rightEarTopJunction.kind, "DESIGN_POINT", "A10 keeps its status as a reconstructed design point");
  assert.match(TARGETS.provenance, /A10 is a DESIGN_POINT reconstructed/);
  assert.match(TARGETS.units, /MASTER px/);
  assert.deepEqual(validateTargets({ ...TARGETS, status: "DRAFT" }, "production").code, "TARGETS_NOT_APPROVED");
  const bad = JSON.parse(JSON.stringify(TARGETS)); bad.points.rightTempleLockTip.role = "fit";
  assert.equal(validateTargets(bad, "production").code, "TARGETS_ROLE_INVALID", "A8 can never become a fit point again silently");
});

test("lock windows: half the distance to the nearest other target (A7 27.902 via A9, A8 35.355 via A4)", () => {
  const w = lockWindowsPx(TARGETS);
  assert.equal(w.leftTempleLockTip.toFixed(3), "27.902");
  assert.equal(w.rightTempleLockTip.toFixed(3), "35.355");
});

// ── the exact synthetic case ───────────────────────────────────────────────────────────────────────────────────────
test("the synthetic seat composes exactly: residual 0, aspect 1, both locks found, HP4v2..HP8 and HP-FRAG pass", () => {
  const c = compose(BASE);
  assert.equal(c.ok, true, JSON.stringify({ code: c.code, why: c.why }));
  assert.ok(Math.abs(c.log.seat.s - S0) < 1e-9 && Math.abs(c.log.seat.tx - TX) < 1e-6 && Math.abs(c.log.seat.ty - TY) < 1e-6);
  assert.ok(c.log.seat.residualMaxMasterPx < 1e-6 && Math.abs(c.log.seat.aspect - 1) < 1e-9);
  assert.deepEqual(c.log.seat.fitUncertaintyMasterPx, { centreHairline: 1.5, leftEarTopJunction: 2, rightEarTopJunction: 2 }, "sheet uncertainty x s");
  assert.deepEqual(c.log.checks.map((x) => [x.id, x.ok]), [["HP1v2", true], ["HP1v2-aspect", true], ["HP2", true], ["HP-LOCK", true], ["HP3", true], ["HP4", true], ["HP5", true], ["HP6", true], ["HP7", true], ["HP8", true], ["HP-FRAG", true]]);
  assert.equal(c.log.checks.find((x) => x.id === "HP4").version, 2);
  assert.deepEqual(c.log.units, { annotation: "sheet px", targetsResidualsWindows: "master px" });
});

// ── A4 proposal ────────────────────────────────────────────────────────────────────────────────────────────────────
test("A4 proposal: the highest transparent pixel reachable from the bottom row inside the A9..A10 band; a review aid only", () => {
  const a9 = toSheet(T("leftEarTopJunction")), a10 = toSheet(T("rightEarTopJunction")), a4 = toSheet(T("centreHairline"));
  const p = proposeA4(BASE, a9, a10);
  assert.equal(p.ok, true);
  assert.deepEqual(p.band, [Math.floor(a9[0]), Math.ceil(a10[0]) - 1]);
  assert.ok(Math.hypot(p.xy[0] - a4[0], p.xy[1] - a4[1]) <= 1.5, `proposal ${p.xy} vs A4 ${a4}`);
  assert.equal(p.alphaBelow, 16);
  assert.deepEqual(proposeA4(BASE, a9, a10), p, "deterministic");
  // the background above the hair is never reached: the band is closed by the hair
  assert.ok(p.pixel[1] > toSheet([0, 150])[1]);
  // alpha 15 is transparent for the proposal, 16 is hair
  const s15 = BASE.slice(); s15[(p.pixel[1] * 1024 + p.pixel[0]) * 4 + 3] = 15; assert.deepEqual(proposeA4(s15, a9, a10).pixel, p.pixel);
  const s16 = BASE.slice(); for (let x = p.band[0]; x <= p.band[1]; x++) s16[(p.pixel[1] * 1024 + x) * 4 + 3] = 16; assert.ok(proposeA4(s16, a9, a10).pixel[1] > p.pixel[1]);
  assert.equal(proposeA4(BASE, null, a10).code, "EAR_JUNCTIONS_REQUIRED");
  assert.equal(proposeA4(new Uint8ClampedArray(16), a9, a10).code, "SHEET_INVALID");
});

// ── seat failures: no reduced fit ──────────────────────────────────────────────────────────────────────────────────
test("a missing or unidentifiable fit point rejects; there is no reduced fit", () => {
  for (const k of FIT_POINTS) {
    const r = compose(BASE, (a) => { a.fitPoints[k] = { status: "NOT_IDENTIFIABLE", xy: null, uncertaintySheetPx: k === "centreHairline" ? 3 : 4, reason: "side lock hangs over the ear" }; return a; });
    assert.deepEqual([r.ok, r.stage, r.code], [false, "seat", "FIT_POINT_NOT_IDENTIFIABLE"], k);
    const m = compose(BASE, (a) => { delete a.fitPoints[k]; return a; });
    assert.deepEqual([m.ok, m.code], [false, "FIT_POINT_MISSING"], k);
  }
  assert.equal(compose(BASE, (a) => { a.fitPoints.leftEarTopJunction.readings.pop(); return a; }).code, "FIT_READINGS_MISSING");
  assert.equal(compose(BASE, (a) => { a.fitPoints.rightEarTopJunction.readings[1].xy = [a.fitPoints.rightEarTopJunction.xy[0] + 5, a.fitPoints.rightEarTopJunction.xy[1]]; return a; }).code, "FIT_READINGS_DISAGREE", "5 > 4 sheet px: read again");
  assert.equal(compose(BASE, (a) => { a.fitPoints.rightEarTopJunction.readings[1].xy = [a.fitPoints.rightEarTopJunction.xy[0] + 4, a.fitPoints.rightEarTopJunction.xy[1]]; return a; }).ok, true, "4 sheet px is within the protocol");
  assert.equal(compose(BASE, (a) => { a.fitPoints.centreHairline.uncertaintySheetPx = 1; return a; }).code, "FIT_POINT_UNCERTAINTY_INVALID", "the noise model fixes the uncertainty");
  assert.equal(compose(BASE, (a) => { a.units = "master-px"; return a; }).code, "ANNOTATION_UNITS_INVALID");
  assert.equal(composeHair({ sheet: BASE_SHEET, annotation: { ...annotationFor(BASE_SHEET.rawSha256), status: "DRAFT" }, targets: TARGETS, mode: "production", ...LAYERS }).code, "ANNOTATION_NOT_APPROVED");
  assert.equal(composeHair({ sheet: BASE_SHEET, annotation: annotationFor("0".repeat(64)), targets: TARGETS, mode: "synthetic-test", ...LAYERS }).code, "ANNOTATION_RAW_SHA_MISMATCH");
});

test("reading rules (owner, D-179): hidden second reading, one definition, marked crops, approved xy is a reading — never an average", () => {
  const k = "rightEarTopJunction", xy = toSheet(T(k)), near = [xy[0] + 3, xy[1]];
  const code = (edit) => compose(BASE, (a) => { edit(a.fitPoints[k]); return a; }).code;
  assert.equal(code((p) => { delete p.readings[1].firstReadingHidden; }), "FIT_READING_NOT_HIDDEN");
  assert.equal(code((p) => { p.readings[1].firstReadingHidden = false; }), "FIT_READING_NOT_HIDDEN");
  assert.equal(code((p) => { p.readings[1].definition = POINT_DEFINITIONS.leftEarTopJunction; }), "FIT_READING_DEFINITION_MISMATCH", "both readings follow the same definition of THIS point");
  assert.equal(code((p) => { delete p.readings[0].crop; }), "FIT_READING_CROP_MISSING");
  assert.equal(code((p) => { p.readings[1].crop.sha256 = "not-a-hash"; }), "FIT_READING_CROP_MISSING");
  assert.equal(code((p) => { p.readings.reverse(); }), "FIT_READINGS_ORDER_INVALID");
  assert.equal(code((p) => { p.readings = readingsFor(k, xy, near); p.xy = [xy[0] + 1.5, xy[1]]; }), "FIT_POINT_NOT_A_READING", "the average of the two readings is not accepted");
  assert.equal(compose(BASE, (a) => { a.fitPoints[k].readings = readingsFor(k, xy, near); return a; }).ok, true, "the approved xy may be either reading");
  assert.equal(code((p) => { p.readings = readingsFor(k, xy, [xy[0] + 4.5, xy[1]]); }), "FIT_READINGS_DISAGREE", "4.5 > 4 sheet px: investigate and read again");
  assert.equal(code((p) => { p.status = "NOT_IDENTIFIABLE"; p.xy = null; p.reason = "no unambiguous inner corner"; }), "FIT_POINT_NOT_IDENTIFIABLE");
});

test("edge cases: the seat residual is accepted up to 6.0 master px and rejected above, on the exact fit arithmetic", () => {
  const a9 = toSheet(T("leftEarTopJunction"));
  let seenPass = false, seenFail = false;
  for (let d = 0; d <= 30; d += 0.5) {
    const ann = annotationFor(BASE_SHEET.rawSha256, (a) => { const p = [a9[0], a9[1] + d]; a.fitPoints.leftEarTopJunction.xy = p; a.fitPoints.leftEarTopJunction.readings = [{ xy: p }, { xy: p }]; return a; });
    const src = FIT_POINTS.map((k) => ann.fitPoints[k].xy), f = fitUniformScaleTranslate(src, FIT_POINTS.map(T)), ax = axisScales(src, FIT_POINTS.map(T));
    const r = fitSeat(ann, TARGETS), expectOk = f.residualMaxPx <= 6.0 && Math.abs(ax.aspect - 1) <= 0.08;
    assert.equal(r.ok, expectOk, `d ${d}: residual ${f.residualMaxPx}, aspect ${ax.aspect}`);
    if (!expectOk) assert.match(r.code, /^HP1V2_SEAT_(RESIDUAL|ASPECT)$/); if (expectOk) seenPass = true; else seenFail = true;
  }
  assert.ok(seenPass && seenFail, "the sweep crosses the threshold");
});

test("a seat that is 12 % too wide is rejected as a seat failure; a uniform rescale is not", () => {
  const C = 511.5, wide = (a, k) => { for (const n of ["leftEarTopJunction", "rightEarTopJunction"]) { const m = T(n), p = toSheet([C + k * (m[0] - C), m[1]]); a.fitPoints[n].xy = p; a.fitPoints[n].readings = [{ xy: p }, { xy: p }]; } return a; };
  const r = fitSeat(annotationFor("x", (a) => wide(a, 1.12)), TARGETS);
  assert.deepEqual([r.ok, r.stage], [false, "seat"]);
  assert.match(r.code, /^HP1V2_SEAT_(RESIDUAL|ASPECT)$/);
  const tiny = annotationFor("x", (a) => { for (const n of FIT_POINTS) { const p = a.fitPoints[n].xy.map((v) => v * 0.3); a.fitPoints[n].xy = p; if (a.fitPoints[n].readings) a.fitPoints[n].readings = [{ xy: p }, { xy: p }]; } return a; });
  assert.equal(fitSeat(tiny, TARGETS).code, "HP2_SCALE", "an exact fit outside 0.35..0.85 still fails HP2");
});

test("known misreading: one ear junction read 10 sheet px off is NOT caught by the residual (documented limit); the repeat reading catches it when the two passes disagree", () => {
  const a9 = toSheet(T("leftEarTopJunction")), off = [a9[0] + 8, a9[1] - 6];
  const quiet = fitSeat(annotationFor("x", (a) => { a.fitPoints.leftEarTopJunction.xy = off; a.fitPoints.leftEarTopJunction.readings = [{ xy: off }, { xy: off }]; return a; }), TARGETS);
  assert.equal(quiet.ok, true, "a consistent misreading of 10 sheet px passes the seat fit");
  assert.ok(quiet.log.residualMaxMasterPx < THRESHOLDS.seatResidualMaxPx);
  const caught = compose(BASE, (a) => { a.fitPoints.leftEarTopJunction.xy = off; a.fitPoints.leftEarTopJunction.readings = readingsFor("leftEarTopJunction", off, a9); return a; });
  assert.equal(caught.code, "FIT_READINGS_DISAGREE");
});

// ── HP-LOCK ────────────────────────────────────────────────────────────────────────────────────────────────────────
test("HP-LOCK: a missing or undocumented temple lock is a SHAPE failure after a good seat, never removed from the fit", () => {
  const fail = (edit) => { const r = compose(BASE, edit); assert.deepEqual([r.ok, r.stage, r.code], [false, "shape", "HP_LOCK_FAILED"], JSON.stringify(r.why)); return JSON.parse(r.why); };
  assert.match(fail((a) => { a.locks.rightTempleLock = { status: "NOT_IDENTIFIABLE", reason: "merged into the long side lock" }; return a; })[0].reason, /not identified/);
  assert.match(fail((a) => { delete a.locks.leftTempleLock.evidence; return a; })[0].reason, /evidence/);
  assert.match(fail((a) => { a.locks.leftTempleLock.flankingNotches = [a.locks.leftTempleLock.tip]; return a; })[0].reason, /two flanking notches/);
  assert.match(fail((a) => { a.locks.rightTempleLock.tip = toSheet([700, 420]); return a; })[0].reason, /not on hair/, "a tip in empty space");
  assert.match(fail((a) => { const t = a.locks.rightTempleLock.tip; a.locks.rightTempleLock.flankingNotches = [[t[0] - 4, t[1] - 2], [t[0] + 4, t[1] - 2]]; return a; })[0].reason, /lock length/, "a stub shorter than 6 master px");
  // a real lock tip outside its window: the long side lock's end, as a merged temple lock would read
  const side = toSheet([641, 321]);
  assert.match(fail((a) => { a.locks.rightTempleLock.tip = side; a.locks.rightTempleLock.flankingNotches = [toSheet([612, 224]), toSheet([700, 300])]; return a; })[0].reason, /window/);
});

test("checkLocks reports both locks with their master-px windows and offsets", () => {
  const ann = annotationFor(BASE_SHEET.rawSha256), seat = fitSeat(ann, TARGETS), r = checkLocks(ann, TARGETS, seat.fit, BASE);
  assert.equal(r.ok, true);
  assert.deepEqual(r.locks.map((l) => [l.lock, l.target, l.ok]), [["leftTempleLock", "leftTempleLockTip", true], ["rightTempleLock", "rightTempleLockTip", true]]);
  for (const l of r.locks) assert.ok(l.tipOffsetMasterPx < 1e-6 && l.lengthMasterPx >= THRESHOLDS.lockMinLengthMasterPx);
});

// ── HP-FRAG ────────────────────────────────────────────────────────────────────────────────────────────────────────
test("HP-FRAG: a detached piece on the face fails although H4 passes; a detached piece off the head is only reported", () => {
  const onFace = synthSheet({ extra: [box(560, 400, 566, 410)] });
  const raw = checkHairSheet(sheetBuf(onFace));
  assert.equal(raw.verdict, "PASS_TO_ANNOTATION", "H4 (dominant >= 0.95) does not see a small piece");
  const r = compose(onFace);
  assert.deepEqual([r.ok, r.stage, r.code], [false, "shape", "HP_FRAG_FAILED"]);
  const v = JSON.parse(r.why); assert.ok(v.fragmentsOnHeadPx > 0 && v.fragmentsOnHead === 1);
  const off = compose(synthSheet({ extra: [box(700, 30, 706, 40)] }));
  assert.equal(off.ok, true, JSON.stringify(off.why));
  const f = off.log.checks.find((x) => x.id === "HP-FRAG").value; assert.ok(f.fragmentsOffHeadPx > 0 && f.fragmentsOnHeadPx === 0);
  assert.deepEqual(checkFragments(new Uint8ClampedArray(W * H * 4), HEAD), { ok: true, components: 0, fragmentsOnHeadPx: 0, fragmentsOffHeadPx: 0 });
});

// ── HP4 v2 crown zone ──────────────────────────────────────────────────────────────────────────────────────────────
function rasterMaster(poly, hole = null) {   // 4x4 supersampled coverage -> alpha; technical
  const px = new Uint8ClampedArray(W * H * 4), xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
    let n = 0; for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const sx = x + (i + 0.5) / 4, sy = y + (j + 0.5) / 4; if (insidePolygon(poly, sx, sy) && !(hole && insidePolygon(hole, sx, sy))) n++; }
    if (n) { const o = (y * W + x) * 4; px[o] = px[o + 1] = px[o + 2] = 150; px[o + 3] = Math.round((n * 255) / 16); }
  }
  return px;
}
test("HP4 v2 (rows <= 194): a correct geometry with its parting at y 197.5 (inside A4's +/-3 px) passes; v1's rows <= 199 would fail it; a real scalp hole still fails HP4 and HP5", () => {
  const parting = SIL.map((p) => (p[0] === 575 && p[1] === 200 ? [575, 197.5] : p));
  const hair = rasterMaster(parting), args = { hairPx: hair, ...LAYERS, targets: TARGETS };
  const v1 = checkPlacedHairV1(args), v2 = checkPlacedHair(args);
  assert.ok(v1.checks.find((c) => c.id === "HP4").value > 0, "v1 counts the anti-aliased rows 197..199 at the parting");
  assert.equal(v2.checks.find((c) => c.id === "HP4").value, 0, "v2 does not");
  assert.equal(v2.diagnostics.hp4v1RowsLe199, v1.checks.find((c) => c.id === "HP4").value, "v1's figure stays reported");
  assert.deepEqual(v2.checks.find((c) => c.id === "HP5").value, { holePx: 0, holes: 0, faceSeedOpen: true }, "the open wedge at the parting belongs to the face opening, not a hole");
  const holed = checkPlacedHair({ ...args, hairPx: rasterMaster(parting, box(480, 150, 500, 165)) });
  assert.ok(holed.checks.find((c) => c.id === "HP4").value > 0);
  assert.ok(holed.checks.find((c) => c.id === "HP5").value.holePx > 0, "a real hole is still a hole");
  assert.equal(holed.firstFailure, "HP4");
  assert.deepEqual([THRESHOLDS.crownMaxY, THRESHOLDS_V1.crownMaxY], [194, 199], "v1 is unchanged");
});

// ── thresholds over the WHOLE allowed scale range (documented noise model, seeded, deterministic) ───────────────────
function noiseModel(s0, n, seed) {
  let st = seed; const rnd = () => { st |= 0; st = (st + 0x6d2b79f5) | 0; let t = Math.imul(st ^ (st >>> 15), 1 | st); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const disk = (r) => { const a = 2 * Math.PI * rnd(), d = r * Math.sqrt(rnd()); return [d * Math.cos(a), d * Math.sin(a)]; };
  const res = [], asp = [];
  for (let i = 0; i < n; i++) {
    const src = FIT_POINTS.map((k) => { const e = disk(3), m = T(k), sp = [(m[0] + e[0] - 200) / s0, (m[1] + e[1] + 100) / s0], d = disk(THRESHOLDS.fitUncertaintySheetPx[k]); return [sp[0] + d[0], sp[1] + d[1]]; });
    const f = fitUniformScaleTranslate(src, FIT_POINTS.map(T)); res.push(f.residualMaxPx); asp.push(Math.abs(axisScales(src, FIT_POINTS.map(T)).aspect - 1));
  }
  const q = (a) => [...a].sort((x, y) => x - y)[Math.floor(0.999 * a.length)];
  return { res: q(res), asp: q(asp) };
}
test("noise model: q99.9 of the seat residual and of |sx/sy - 1| stay inside 6.0 px / 0.08 from s 0.35 to 0.85; 5.5 px / 0.07 do not hold at 0.85", () => {
  const out = {};
  for (const s of [0.35, 0.6, 0.85]) { out[s] = noiseModel(s, 20000, 0x5eed179c); assert.ok(out[s].res <= THRESHOLDS.seatResidualMaxPx, `s ${s}: ${out[s].res}`); assert.ok(out[s].asp <= THRESHOLDS.aspectMaxAbsDev, `s ${s}: ${out[s].asp}`); }
  assert.ok(out[0.85].res > 5.5 && out[0.85].asp > 0.07, `why the first proposal was raised: ${JSON.stringify(out[0.85])}`);
  assert.ok(out[0.35].res < out[0.85].res, "the sheet uncertainty grows in master px with s");
  assert.deepEqual([THRESHOLDS.seatResidualMaxPx, THRESHOLDS.aspectMaxAbsDev, ...THRESHOLDS.scaleRange], [6.0, 0.08, 0.35, 0.85]);
});

test("v1 stays in force unchanged for its own records", () => {
  assert.deepEqual([THRESHOLDS_V1.residualFitMaxPx, THRESHOLDS_V1.crownMaxY, ...THRESHOLDS_V1.scaleRange], [3.0, 199, 0.35, 0.85]);
});
