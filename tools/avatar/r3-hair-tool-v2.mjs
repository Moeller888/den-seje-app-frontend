// R3 hair TOOL v2 — D-179 (contract: hairMethod.methodV2). Library only: no side effects, no network, no credentials, no
// claims, no image request. It never writes a file; the CLI r3-hair-compose-v2.mjs does. r3-hair-tool.mjs (v1, D-174) stays
// unchanged and in force for its own records; v2 is used only for FUTURE hair sheets made under a new owner decision.
//
// What v2 changes (registration v2), and only this:
//   * Fit points are the hair's SEAT, not lock tips: A4 centreHairline (top of the parting), A9 leftEarTopJunction and A10
//     rightEarTopJunction (inner lower corner of the side hair above each ear). ONE positive uniform scale + translation,
//     least squares onto the SAME target coordinates as D-174 (targets-hair-v2.json, roles changed, no point moved). No
//     rotation, reflection, warp or per-lock move. A missing or unidentifiable fit point REJECTS; there is no reduced fit.
//   * A7 and A8 (temple locks) are MANDATORY SHAPE CHECKS (HP-LOCK), not fit points: each needs an identified, separate lock
//     with a documented annotation (tip + two flanking notches + evidence), a minimum length, and its tip inside a window.
//   * A diagnostic x/y scale ratio (never used for placement) catches a seat that is too wide or too narrow.
//   * HP4's crown zone is rows <= 194 (v1: <= 199). HP5..HP8 are v1's checks, called unchanged.
//   * HP-FRAG: no hair component other than the dominant one may lie on a head pixel.
// Units: annotation coordinates and their uncertainties are SHEET px (1024x1024, continuous: pixel i covers [i, i+1)).
// Targets, residuals, windows and every placed-layer zone are MASTER px (1024x1536). A sheet uncertainty u becomes u * s
// master px after the fit.
import { createHash } from "node:crypto";
import { fitUniformScaleTranslate, resampleArea, overInto, quantise, pixelSha256, MASTER } from "./r3-face-parts-tool.mjs";
import { components } from "./r3-eyes-tool.mjs";
import { checkPlacedHair as checkPlacedHairV1, THRESHOLDS as THRESHOLDS_V1, SHEET, decodePng, encodePng, applyTonalRampB } from "./r3-hair-tool.mjs";

export { decodePng, encodePng, pixelSha256, applyTonalRampB, SHEET };
export const TOOL_ID = "r3-hair-tool-v2";
export const ANNOTATION_SCHEMA = "r3-hair-annotation-v2";
export const TARGETS_SCHEMA = "r3-hair-targets-v2";
export const FIT_POINTS = Object.freeze(["centreHairline", "leftEarTopJunction", "rightEarTopJunction"]);          // A4, A9, A10
export const MANDATORY_LOCKS = Object.freeze({ leftTempleLock: "leftTempleLockTip", rightTempleLock: "rightTempleLockTip" });   // A7, A8
export const CHECK_POINTS = Object.freeze(["crownTuftTip", "leftOuterSpikeTip", "rightOuterSpikeTip", "centralLockTip", "rightOfCentreLockTip"]);
export const MODES = Object.freeze({
  production: { annotation: ["APPROVED"], targets: ["APPROVED"] },
  "synthetic-test": { annotation: ["SYNTHETIC_TEST_APPROVED"], targets: ["SYNTHETIC_TEST_APPROVED", "APPROVED"] },
});
export const POINT_STATUS = Object.freeze({ identified: "IDENTIFIED", notIdentifiable: "NOT_IDENTIFIABLE" });
export const sha256 = (b) => createHash("sha256").update(b).digest("hex");

/**
 * D-179's thresholds. PROPOSED from the documented noise model (methodV2.simulation) and fixed BEFORE any hair call; changing
 * one is a new owner decision made before a call, never after seeing an output. v1's raw-sheet thresholds (H1..H5) and its
 * HP5..HP8 thresholds are inherited unchanged.
 */
export const THRESHOLDS = Object.freeze({
  seatResidualMaxPx: 6.0,                 // master px; worst-case q99.9 of the noise model over the whole scale range is 5.79 (s 0.85)
  aspectMaxAbsDev: 0.08,                  // |sx / sy - 1|, diagnostic axis scales on the three seat points; worst-case q99.9 0.076
  scaleRange: THRESHOLDS_V1.scaleRange,   // 0.35..0.85, unchanged
  crownMaxY: 194,                         // HP4 v2: A4.y 200 - 3 (target uncertainty) - 2 (anti-aliasing) - 1
  hairSolidAlphaMin: THRESHOLDS_V1.hairSolidAlphaMin,
  hairTouchAlphaMin: THRESHOLDS_V1.hairTouchAlphaMin,
  visibleAlphaMin: THRESHOLDS_V1.visibleAlphaMin,
  fitUncertaintySheetPx: Object.freeze({ centreHairline: 3, leftEarTopJunction: 4, rightEarTopJunction: 4 }),
  readingAgreementMaxSheetPx: 4,          // A9/A10: two readings, each within this of the other and of the approved xy
  lockMinLengthMasterPx: 6,               // 2 x the 3 px target uncertainty: a shorter protrusion is not a lock
  lockWindowRule: "half the distance from the lock's target to the nearest OTHER target point",
});

const isPt = (p) => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === "number" && Number.isFinite(v));
const isPoly = (a) => Array.isArray(a) && a.length >= 3 && a.every(isPt);
const inSheet = ([x, y]) => x >= 0 && y >= 0 && x <= SHEET.w && y <= SHEET.h;
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const map = (f, p) => [f.s * p[0] + f.tx, f.s * p[1] + f.ty];

/** The mandatory-lock windows in master px (D-179 rule: half the distance to the nearest other target point). */
export function lockWindowsPx(targets) {
  const pts = Object.entries(targets.points).map(([k, v]) => [k, v.xy]);
  return Object.fromEntries(Object.values(MANDATORY_LOCKS).map((k) => [k, Math.min(...pts.filter(([j]) => j !== k).map(([, xy]) => dist(targets.points[k].xy, xy))) / 2]));
}

// ═════════════════════════════════ targets and annotation ═════════════════════════════════
export function validateTargets(targets, mode) {
  const m = MODES[mode]; if (!m) return { ok: false, code: "UNKNOWN_MODE" };
  if (!targets || targets.schema !== TARGETS_SCHEMA) return { ok: false, code: "TARGETS_SCHEMA_INVALID" };
  if (!m.targets.includes(targets.status)) return { ok: false, code: "TARGETS_NOT_APPROVED", why: `status ${targets.status} not accepted in ${mode} mode` };
  const want = { fit: FIT_POINTS, mandatoryLock: Object.values(MANDATORY_LOCKS), check: CHECK_POINTS };
  for (const [role, keys] of Object.entries(want)) for (const k of keys) {
    if (!isPt(targets.points?.[k]?.xy)) return { ok: false, code: "TARGETS_POINTS_INVALID", why: k };
    if (targets.points[k].role !== role) return { ok: false, code: "TARGETS_ROLE_INVALID", why: `${k} must have role ${role}` };
  }
  if (Object.keys(targets.points).length !== FIT_POINTS.length + 2 + CHECK_POINTS.length) return { ok: false, code: "TARGETS_POINTS_INVALID", why: "exactly the ten D-174 points" };
  if (!isPoly(targets.geometry?.sketchSilhouette)) return { ok: false, code: "TARGETS_GEOMETRY_INVALID" };
  return { ok: true };
}

/**
 * Validate a v2 annotation of ONE sheet (bound to its SHA-256). Every fit point must be IDENTIFIED with the method's sheet
 * uncertainty; A9/A10 carry two readings that agree. Lock records are checked by HP-LOCK after the fit (their absence is a
 * SHAPE failure there, not an annotation error). Returns { ok } or the first failure.
 */
export function validateAnnotation(ann, rawSha, mode) {
  const m = MODES[mode]; if (!m) return { ok: false, code: "UNKNOWN_MODE" };
  if (!ann) return { ok: false, code: "NO_ANNOTATION" };
  if (ann.schema !== ANNOTATION_SCHEMA) return { ok: false, code: "ANNOTATION_SCHEMA_INVALID" };
  if (ann.raw?.sha256 !== rawSha) return { ok: false, code: "ANNOTATION_RAW_SHA_MISMATCH", why: "the annotation belongs to another hair sheet" };
  if (!m.annotation.includes(ann.status)) return { ok: false, code: "ANNOTATION_NOT_APPROVED", why: `status ${ann.status} not accepted in ${mode} mode` };
  if (ann.units !== "sheet-px") return { ok: false, code: "ANNOTATION_UNITS_INVALID", why: "annotation coordinates are sheet px" };
  for (const k of FIT_POINTS) {
    const p = ann.fitPoints?.[k];
    if (!p) return { ok: false, code: "FIT_POINT_MISSING", why: `${k}: no record — no reduced fit` };
    if (p.status !== POINT_STATUS.identified) return { ok: false, code: "FIT_POINT_NOT_IDENTIFIABLE", why: `${k}: ${p.status ?? "no status"}${p.reason ? ` (${p.reason})` : ""} — no reduced fit` };
    if (!isPt(p.xy) || !inSheet(p.xy)) return { ok: false, code: "FIT_POINT_INVALID", why: k };
    if (p.uncertaintySheetPx !== THRESHOLDS.fitUncertaintySheetPx[k]) return { ok: false, code: "FIT_POINT_UNCERTAINTY_INVALID", why: `${k}: the method fixes ${THRESHOLDS.fitUncertaintySheetPx[k]} sheet px` };
    if (k !== "centreHairline") {
      const r = p.readings;
      if (!Array.isArray(r) || r.length !== 2 || !r.every((x) => isPt(x?.xy) && inSheet(x.xy))) return { ok: false, code: "FIT_READINGS_MISSING", why: `${k}: two readings required` };
      const A = THRESHOLDS.readingAgreementMaxSheetPx;
      if (dist(r[0].xy, r[1].xy) > A || dist(r[0].xy, p.xy) > A || dist(r[1].xy, p.xy) > A) return { ok: false, code: "FIT_READINGS_DISAGREE", why: `${k}: readings and the approved xy must lie within ${A} sheet px of each other — read again` };
    }
  }
  for (const [k, v] of Object.entries(ann.checkPoints ?? {})) {
    if (!CHECK_POINTS.includes(k)) return { ok: false, code: "ANNOTATION_POINT_UNKNOWN", why: k };
    if (!isPt(v) || !inSheet(v)) return { ok: false, code: "ANNOTATION_POINTS_INVALID", why: k };
  }
  return { ok: true };
}

// ═════════════════════════════════ A4 proposal (review aid only) ═════════════════════════════════
/**
 * PROPOSE A4 on a raw sheet. Never an annotation: the reviewer confirms or corrects it. Search: flood-fill the TRANSPARENT
 * pixels (alpha < visibleAlphaMin = 16), 4-connected, from every transparent pixel of the sheet's bottom row, restricted to
 * the column band floor(min(A9.x, A10.x)) .. ceil(max(A9.x, A10.x)) - 1 (the two ear-junction readings, sheet px), so the
 * fill cannot reach the background above the hair. The proposal is the HIGHEST filled pixel (smallest y; ties: smallest x),
 * returned as its top-edge centre [x + 0.5, y]. Returns { ok: true, xy, pixel, band } or { ok: false, code }.
 */
export function proposeA4(sheetPx, a9, a10) {
  if (!(sheetPx instanceof Uint8Array || sheetPx instanceof Uint8ClampedArray) || sheetPx.length !== SHEET.w * SHEET.h * 4) return { ok: false, code: "SHEET_INVALID" };
  if (!isPt(a9) || !isPt(a10)) return { ok: false, code: "EAR_JUNCTIONS_REQUIRED" };
  const x0 = Math.max(0, Math.floor(Math.min(a9[0], a10[0]))), x1 = Math.min(SHEET.w - 1, Math.ceil(Math.max(a9[0], a10[0])) - 1);
  if (x1 < x0) return { ok: false, code: "BAND_EMPTY" };
  const W = SHEET.w, H = SHEET.h, clear = (x, y) => sheetPx[(y * W + x) * 4 + 3] < THRESHOLDS.visibleAlphaMin, seen = new Uint8Array(W * H), stack = [];
  for (let x = x0; x <= x1; x++) if (clear(x, H - 1)) { seen[(H - 1) * W + x] = 1; stack.push((H - 1) * W + x); }
  let best = -1;
  while (stack.length) {
    const i = stack.pop(), x = i % W, y = (i - x) / W;
    if (best < 0 || y < (best - (best % W)) / W || (y === (best - (best % W)) / W && x < best % W)) best = i;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx < x0 || nx > x1 || ny < 0 || ny >= H) continue;
      const j = ny * W + nx; if (seen[j] || !clear(nx, ny)) continue; seen[j] = 1; stack.push(j);
    }
  }
  if (best < 0) return { ok: false, code: "NO_TRANSPARENT_PATH" };
  const bx = best % W, by = (best - bx) / W;
  return { ok: true, xy: [bx + 0.5, by], pixel: [bx, by], band: [x0, x1], alphaBelow: THRESHOLDS.visibleAlphaMin };
}

// ═════════════════════════════════ seat fit + shape checks ═════════════════════════════════
/** Diagnostic axis scales (least squares per axis) on the seat points; never used for placement. */
export function axisScales(src, dst) {
  const axis = (j) => { const n = src.length, pm = src.reduce((a, p) => a + p[j], 0) / n, qm = dst.reduce((a, p) => a + p[j], 0) / n; let nu = 0, de = 0; for (let i = 0; i < n; i++) { nu += (src[i][j] - pm) * (dst[i][j] - qm); de += (src[i][j] - pm) ** 2; } return de > 0 ? nu / de : NaN; };
  const sx = axis(0), sy = axis(1); return { sx, sy, aspect: sx / sy };
}

/** The seat fit: A4, A9, A10 -> targets. Returns { ok, stage: "seat", code } on the first failure, else { ok: true, fit, log }. */
export function fitSeat(annotation, targets) {
  const src = FIT_POINTS.map((k) => annotation.fitPoints[k].xy), dst = FIT_POINTS.map((k) => targets.points[k].xy);
  const f = fitUniformScaleTranslate(src, dst);
  if (!f.ok) return { ok: false, stage: "seat", code: f.code, why: f.why };
  const ax = axisScales(src, dst), T = THRESHOLDS;
  const log = { s: f.s, tx: f.tx, ty: f.ty, residualVectorsMasterPx: Object.fromEntries(FIT_POINTS.map((k, i) => [k, f.residuals[i]])), residualMaxMasterPx: f.residualMaxPx,
    aspect: ax.aspect, axisScales: { sx: ax.sx, sy: ax.sy }, fitUncertaintyMasterPx: Object.fromEntries(FIT_POINTS.map((k) => [k, T.fitUncertaintySheetPx[k] * f.s])) };
  if (f.residualMaxPx > T.seatResidualMaxPx) return { ok: false, stage: "seat", code: "HP1V2_SEAT_RESIDUAL", why: `max residual ${f.residualMaxPx.toFixed(3)} master px > ${T.seatResidualMaxPx}`, log };
  if (!(Math.abs(ax.aspect - 1) <= T.aspectMaxAbsDev)) return { ok: false, stage: "seat", code: "HP1V2_SEAT_ASPECT", why: `|sx/sy - 1| = ${Math.abs(ax.aspect - 1).toFixed(4)} > ${T.aspectMaxAbsDev}`, log };
  if (!(f.s >= T.scaleRange[0] && f.s <= T.scaleRange[1])) return { ok: false, stage: "seat", code: "HP2_SCALE", why: `s = ${f.s}`, log };
  return { ok: true, fit: f, log };
}

/**
 * HP-LOCK: each mandatory temple lock must be IDENTIFIED as a separate lock with a documented annotation — tip, two flanking
 * notches (where the lock separates from its neighbours) and a non-empty evidence text — the tip must lie on hair (a pixel
 * with alpha >= 16 within the tip's sheet uncertainty, 3 px), the lock must be at least lockMinLengthMasterPx long (tip to the
 * notches' midpoint, after the fit) and its tip must lie inside its window. The window alone never proves the lock exists.
 */
export function checkLocks(annotation, targets, fit, sheetPx) {
  const win = lockWindowsPx(targets), out = [];
  for (const [lockKey, tipKey] of Object.entries(MANDATORY_LOCKS)) {
    const L = annotation.locks?.[lockKey], r = { lock: lockKey, target: tipKey, windowPx: win[tipKey] };
    if (!L || L.status !== POINT_STATUS.identified) { out.push({ ...r, ok: false, reason: `not identified (${L?.status ?? "no record"})` }); continue; }
    if (!isPt(L.tip) || !inSheet(L.tip) || !Array.isArray(L.flankingNotches) || L.flankingNotches.length !== 2 || !L.flankingNotches.every((p) => isPt(p) && inSheet(p))) { out.push({ ...r, ok: false, reason: "tip and two flanking notches required" }); continue; }
    if (typeof L.evidence !== "string" || L.evidence.trim().length < 10) { out.push({ ...r, ok: false, reason: "a documented evidence text is required" }); continue; }
    if (dist(L.flankingNotches[0], L.flankingNotches[1]) === 0) { out.push({ ...r, ok: false, reason: "the two notches coincide" }); continue; }
    let onHair = false; const [tx, ty] = L.tip;
    for (let y = Math.max(0, Math.floor(ty - 3)); y <= Math.min(SHEET.h - 1, Math.floor(ty + 3)) && !onHair; y++) for (let x = Math.max(0, Math.floor(tx - 3)); x <= Math.min(SHEET.w - 1, Math.floor(tx + 3)); x++) if (dist([x + 0.5, y + 0.5], L.tip) <= 3 && sheetPx[(y * SHEET.w + x) * 4 + 3] >= THRESHOLDS.visibleAlphaMin) { onHair = true; break; }
    const tipM = map(fit, L.tip), mid = map(fit, [(L.flankingNotches[0][0] + L.flankingNotches[1][0]) / 2, (L.flankingNotches[0][1] + L.flankingNotches[1][1]) / 2]);
    const lengthPx = dist(tipM, mid), offsetPx = dist(tipM, targets.points[tipKey].xy);
    const v = { ...r, tipMasterPx: tipM, lengthMasterPx: lengthPx, tipOffsetMasterPx: offsetPx, tipOnHair: onHair };
    if (!onHair) out.push({ ...v, ok: false, reason: "the tip is not on hair" });
    else if (lengthPx < THRESHOLDS.lockMinLengthMasterPx) out.push({ ...v, ok: false, reason: `lock length ${lengthPx.toFixed(2)} < ${THRESHOLDS.lockMinLengthMasterPx} master px` });
    else if (offsetPx > win[tipKey]) out.push({ ...v, ok: false, reason: `tip ${offsetPx.toFixed(2)} master px from its target > window ${win[tipKey].toFixed(3)}` });
    else out.push({ ...v, ok: true });
  }
  return { ok: out.every((x) => x.ok), locks: out };
}

/** HP-FRAG on a placed 1024x1536 layer: hair alpha >= 8, 8-connected; every pixel of a non-dominant component on a head pixel fails. */
export function checkFragments(hairPx, headPx) {
  const W = MASTER.w, H = MASTER.h, mask = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (hairPx[i * 4 + 3] >= THRESHOLDS.hairTouchAlphaMin) mask[i] = 1;
  const { labels, comps } = components(mask, W, H, 8);
  if (!comps.length) return { ok: true, components: 0, fragmentsOnHeadPx: 0, fragmentsOffHeadPx: 0 };
  const dominant = comps.reduce((a, b) => (b.n > a.n ? b : a)).id;
  let on = 0, off = 0; const hit = new Set();
  for (let i = 0; i < W * H; i++) { if (!mask[i] || labels[i] === dominant) continue; if (headPx[i * 4 + 3] >= 128) { on++; hit.add(labels[i]); } else off++; }
  return { ok: on === 0, components: comps.length, fragmentsOnHeadPx: on, fragmentsOnHead: hit.size, fragmentsOffHeadPx: off };
}

/** HP4 v2 (crown rows <= 194) + v1's HP5..HP8 unchanged + HP-FRAG. v1's own HP4 (rows <= 199) is reported as a diagnostic. */
export function checkPlacedHair({ hairPx, headPx, facePx, eyesFixedPx, irisPx, targets }) {
  const W = MASTER.w, T = THRESHOLDS;
  let crownUncovered = 0; for (let y = 0; y <= T.crownMaxY; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (headPx[i + 3] >= 128 && hairPx[i + 3] < T.hairSolidAlphaMin) crownUncovered++; }
  const v1 = checkPlacedHairV1({ hairPx, headPx, facePx, eyesFixedPx, irisPx, targets });
  const frag = checkFragments(hairPx, headPx);
  const checks = [
    { id: "HP4", version: 2, name: `crown: every head pixel in rows <= ${T.crownMaxY} under hair alpha >= ${T.hairSolidAlphaMin}`, ok: crownUncovered === 0, value: crownUncovered },
    ...v1.checks.filter((c) => c.id !== "HP4"),
    { id: "HP-FRAG", name: "no hair component other than the dominant one (alpha >= 8, 8-connected) on a head pixel", ok: frag.ok, value: frag },
  ];
  const firstFailure = checks.find((c) => !c.ok)?.id ?? null;
  return { checks, firstFailure, diagnostics: { ...v1.diagnostics, hp4v1RowsLe199: v1.checks.find((c) => c.id === "HP4").value } };
}

// ═════════════════════════════════ compose ═════════════════════════════════
/**
 * Compose the hair with registration v2. `sheet` is a PASSING v1 checkHairSheet result (H1..H5 unchanged). Order: targets ->
 * annotation -> seat fit (HP1v2 residual, aspect, HP2) -> HP-LOCK -> placement -> HP4v2, HP5..HP8, HP-FRAG. Returns the FIRST
 * failure { ok:false, stage, code, why } (stage "seat" = the hair cannot be placed reliably, "shape" = it is placed but its
 * form fails) or { ok:true, hairPx, log }. Never modifies a raw sheet or any input layer.
 */
export function composeHair({ sheet, annotation, targets, mode, headPx, facePx, eyesFixedPx, irisPx }) {
  if (!sheet || sheet.verdict !== "PASS_TO_ANNOTATION") return { ok: false, stage: "raw", code: "HAIR_SHEET_NOT_PASSED" };
  const vt = validateTargets(targets, mode); if (!vt.ok) return { ok: false, stage: "targets", ...vt };
  const va = validateAnnotation(annotation, sheet.rawSha256, mode); if (!va.ok) return { ok: false, stage: va.code.startsWith("FIT_") ? "seat" : "annotation", ...va };
  for (const [k, v] of Object.entries({ headPx, facePx, eyesFixedPx, irisPx })) if (!v || v.length !== MASTER.w * MASTER.h * 4) return { ok: false, stage: "inputs", code: "LAYER_MISSING", why: k };
  const seat = fitSeat(annotation, targets); if (!seat.ok) return seat;
  const f = seat.fit, locks = checkLocks(annotation, targets, f, sheet.px);
  if (!locks.ok) return { ok: false, stage: "shape", code: "HP_LOCK_FAILED", why: JSON.stringify(locks.locks.filter((l) => !l.ok).map(({ lock, reason }) => ({ lock, reason }))), seat: seat.log, locks: locks.locks };
  const layer = resampleArea({ w: SHEET.w, h: SHEET.h, px: sheet.px }, f.s, f.tx, f.ty, MASTER.w, MASTER.h), acc = new Float64Array(MASTER.w * MASTER.h * 4);
  overInto(acc, MASTER.w, layer);
  const hairPx = quantise(acc, MASTER.w, MASTER.h);
  const pc = checkPlacedHair({ hairPx, headPx, facePx, eyesFixedPx, irisPx, targets });
  if (pc.firstFailure) { const c = pc.checks.find((x) => x.id === pc.firstFailure); return { ok: false, stage: c.id === "HP-FRAG" ? "shape" : "placement", code: `${c.id.replace("-", "_")}_FAILED`, why: JSON.stringify(c.value), seat: seat.log, checks: pc.checks, diagnostics: pc.diagnostics }; }
  const checkPointResidualMasterPx = Object.fromEntries(CHECK_POINTS.filter((k) => isPt(annotation.checkPoints?.[k])).map((k) => [k, dist(map(f, annotation.checkPoints[k]), targets.points[k].xy)]));
  return { ok: true, hairPx, log: { tool: TOOL_ID, mode, thresholds: THRESHOLDS, units: { annotation: "sheet px", targetsResidualsWindows: "master px" }, seat: seat.log, locks: locks.locks,
    checks: [{ id: "HP1v2", ok: true, value: seat.log.residualMaxMasterPx }, { id: "HP1v2-aspect", ok: true, value: seat.log.aspect }, { id: "HP2", ok: true, value: f.s }, { id: "HP-LOCK", ok: true, value: locks.locks }, { id: "HP3", ok: true, value: { checkPointResidualMasterPx, note: "reported only" } }, ...pc.checks],
    diagnostics: pc.diagnostics, output: { hairPixelSha256: pixelSha256(hairPx) } } };
}
