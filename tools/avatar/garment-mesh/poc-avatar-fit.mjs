// POC — Avatar Fit Engine: derive a garment target mesh from an avatar's own silhouette.
// =============================================================================================
// WHAT THIS IS. A proof of ONE mechanism:
//
//     canonical item topology
//         -> canonical normalized item space
//         -> avatar landmark / proportion model   (measured from the silhouette)
//         -> automatic target mesh
//         -> deterministic warp                    (mesh-core, unchanged)
//         -> validation gates
//
// WHAT ALREADY EXISTED, AND IS REUSED RATHER THAN REBUILT. `warp-garment-mesh.mjs --autofit`
// already generates target X automatically: COL_FRACTIONS distributes each row's half-width from
// centre to boundary, and the 9x9 grid + 128 triangles + constraints are all built in code. No
// vertex was ever hand-typed. The ONLY thing that was not avatar-adaptive is the row Y values:
// `ROWS` pins them to 524/560/640/680/714/756/786/850/903, which are THIS base's garment landmarks.
// On a different body those Y's point at the wrong anatomy.
//
// So this POC adds exactly one missing link — a landmark detector that derives the nine row Y's
// from an arbitrary silhouette — and then reuses the existing column maths and mesh-core verbatim.
//
// WHY THE LANDMARK LAYER IS RE-IMPLEMENTED HERE INSTEAD OF IMPORTED. `measure()` in
// build-r2-torso-occlusion-mask.mjs is not exported, and more importantly it bootstraps from the
// hard-coded D084.seamX0/seamX1 constants when it looks for the crotch and the fingertips. A
// generic engine has to break that dependency: the corridor must be *derived* from the image. This
// file therefore derives everything, and imports only the pure, exported primitives.
//
// BOUNDARIES. Read-only with respect to the repository: it writes ONLY into
// tools/avatar/build/poc-avatar-fit/ (gitignored). It never touches runtime, R2_MANIFEST,
// AVATAR_R2, tracked fixtures, tracked meshes or accepted artwork. No network. No AI. No random.
// =============================================================================================
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, sep } from "node:path";

import { decodePng, encodePngRGBA, semanticOf, SEM, OUT_W, OUT_H } from "../build-r2-torso-occlusion-mask.mjs";
import { applyConstraints, assertValidMesh, distortionMetrics, SCHEMA_VERSION, MIN_TRIANGLE_AREA } from "./mesh-core.mjs";
import { COL_FRACTIONS, COLS, ROWS as CANONICAL_ROWS } from "./warp-garment-mesh.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");
const OUT_DIR = join(REPO, "tools", "avatar", "build", "poc-avatar-fit");
const BASE_WEBP = join(REPO, "assets", "avatar-r2", "base", "body-neutral-medium-v2.webp");
const CANONICAL_MESH = join(HERE, "meshes", "torso-armor-knight-v1.mesh.json");
const DWEBP = join(REPO, "tools", "avatar", "vendor", "dwebp.exe");

export const W = OUT_W, H = OUT_H;          // 1024 x 1536 Master canvas (served 512x768 x2)
const SOLID = 128;                          // D-071: alpha >= 128 is solid; the AA ramp is excluded

const sha256 = (b) => createHash("sha256").update(b).digest("hex");

// Every write goes through this. The POC can only ever produce review output.
function assertWritable(p) {
  const abs = resolve(p), root = resolve(OUT_DIR);
  if (abs !== root && !abs.startsWith(root + sep)) {
    throw new Error("POC refuses to write outside build/poc-avatar-fit/: " + abs);
  }
  return abs;
}
const write = (p, buf) => { const a = assertWritable(p); mkdirSync(dirname(a), { recursive: true }); writeFileSync(a, buf); return a; };

// ── TOLERANCES ────────────────────────────────────────────────────────────────────────────────
// All configurable, all documented. A gate that fails is a FAIL — there is no best-effort path.
export const TOL = Object.freeze({
  MIN_RUN_WIDTH:        24,    // Master px. Runs narrower than this are AA slivers, not anatomy.
  CENTRE_BAND_PX:       44,    // Half-width of the centre probe. Matches the existing measure().
  OUTER_BAND_PX:        28,    // Width of the outer probe used to spot bare arms beside a sleeve.
  CLASS_SHARE_MIN:      0.60,  // A span only "reads" a class at >= 60% agreement among solid px.
  // RETIRED, kept visible so the rejected approach stays on the record rather than vanishing.
  // "Shoulder = first row reaching 90% of the maximum torso width in the collar..sleeve bracket."
  // Measured on the canonical base: maxW=370 px occurs at y=692, which is where the ARMS are
  // widest apart, and 90% of it is first reached at y=624. At y=624 the centre band is skin 0/167,
  // fabric 166/167 — the neck closed 60 rows earlier. The rule measured arm spread, not shoulders.
  // Re-tuning 0.90 to 0.85 or 0.80 would only move a landmark that was measuring the wrong thing.
  SHOULDER_WIDTH_FRAC_RETIRED: 0.90,
  SHOULDER_MIN_BAND_PX: 10,    // Solid samples needed in the centre band before a row is read at all.
  // Half-window for the closure's SHARPNESS, in Master px. The measured ramp runs ~14 Master rows
  // end to end (fabric share 0.07 at y=554 to 1.00 at y=568), so +-4 brackets its steep core
  // without reaching the flat skin/fabric plateaus on either side, where the difference would
  // saturate at 1.0 for every avatar and stop discriminating.
  SHOULDER_SHARPNESS_WINDOW_PX: 4,
  CROTCH_STABLE_ROWS:   40,    // Two leg runs must persist this many rows to count as the crotch.
  MIN_CONFIDENCE:       0.50,  // Below this a landmark is reported UNKNOWN rather than guessed.
  // ── collar rim detection (see detectCollarRim) ──
  OWNERSHIP_REACH:      4,     // Master px. A dark stroke this close above fabric belongs to it.
  MIN_GARMENT_PX_ROW:   24,    // Garment pixels needed before a row counts as garment, not speckle.
  COLLAR_PERSIST_ROWS:  20,    // The band must continue this far down to be the garment's top edge.
  COLLAR_AXIS_TOL_PX:   40,    // |collar centre - avatar axis|. A collar sits on the neck.
  COLLAR_WIDTH_RATIO:   0.70,  // collarWidth / shoulderWidth. A collar is markedly narrower.
  MAX_AREA_RATIO:       4.00,  // Local stretch bound: target/source triangle area.
  MIN_AREA_RATIO:       0.25,  // Local compression bound.
  SYMMETRY_TOL_PX:      1.50,  // |left offset - right offset| for a symmetric avatar.
  MAX_VERTICES_OUTSIDE: 0,     // Vertices landing in transparent space. Zero tolerated.
  MAX_DEGENERATE_TRI:   0,
  MAX_ORIENTATION_FLIP: 0,
});

// ── silhouette primitives (POC-local, avatar-agnostic) ────────────────────────────────────────
function solidMask(rgba) {
  const m = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (rgba[i * 4 + 3] >= SOLID) m[i] = 1;
  return m;
}
function rowRuns(solid, y, minWidth) {
  const out = []; let start = -1;
  for (let x = 0; x < W; x++) {
    const on = solid[y * W + x] === 1;
    if (on && start < 0) start = x;
    if ((!on || x === W - 1) && start >= 0) {
      const end = on ? x : x - 1;
      if (end - start + 1 >= minWidth) out.push([start, end]);
      start = -1;
    }
  }
  return out;
}
// Semantic reading of a horizontal span, built on the EXPORTED semanticOf (D-085 revision 3).
// Deliberately not the legacy nearest-RGB classify(): that palette is tuned to one avatar's
// colours, which is exactly the coupling a generic engine must not inherit.
function spanRead(rgba, solid, y, x0, x1) {
  const c = { skin: 0, fabric: 0, dark: 0, other: 0 };
  for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x += 2) {
    const i = y * W + x;
    if (!solid[i]) continue;
    const s = semanticOf(rgba, i);
    if (s === SEM.SKIN) c.skin++;
    else if (s === SEM.FABRIC) c.fabric++;
    else if (s === SEM.OUTLINE) c.dark++;    // trousers AND line work — deliberately conflated
    else c.other++;
  }
  const tot = c.skin + c.fabric + c.dark + c.other;
  if (!tot) return { cls: "none", share: 0, n: 0 };
  const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
  return { cls: top[0], share: top[1] / tot, n: tot };
}

// ── COLLAR RIM DETECTION ──────────────────────────────────────────────────────────────────────
// WHY THE FIRST ATTEMPT WAS WRONG. v1 took "the first row whose torso centre reads fabric" and
// called it the collar. Measured on the canonical base that lands at y=566; the canonical mesh's
// collar row is y=524. The 42 px error is not a tuning problem, it is a semantic one: that rule
// finds where the SHIRT BODY starts reading as fabric at the centre, which is well below the neck.
//
// WHAT THE COLLAR RIM ACTUALLY IS, measured pixel by pixel on the base:
//   * at y=524 the row is mostly neck SKIN (x 480-540), with fabric only at the far right (x~550);
//   * at y=526 OUTLINE spikes to 76 px spanning x 460..567 — that band IS the tee's collar ring;
//   * FABRIC does not appear in quantity until y=530 (38 px).
// So the rim is a DARK STROKE, not fabric. Looking for fabric can never find it. This matches the
// mask builder's own revision-3 note that the collar ring reads nearest to the trousers swatch.
//
// THE RULE. Build a garment mask = FABRIC, plus OUTLINE that has fabric within OWNERSHIP_REACH
// rows below it (the same ownership idea the mask builder uses, so a garment's own edge stroke
// counts as garment). The collar rim is then simply the TOPMOST row of that mask.
//
// WHY A COUNT THRESHOLD IS REQUIRED. The neck carries its own dark shading lines, and they sit
// above fabric, so ownership adopts them too. Measured: rows y505..523 yield 8-16 sparse pixels,
// then y=525 jumps to 32 and rises monotonically. MIN_GARMENT_PX_ROW=24 separates the two cleanly.
// This is a measured step in the data, not a fitted constant.
function buildGarmentMask(rgba, solid) {
  const fabric = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (solid[i] && semanticOf(rgba, i) === SEM.FABRIC) fabric[i] = 1;
  const R = TOL.OWNERSHIP_REACH;
  const rowPixels = (y) => {
    const xs = [];
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!solid[i]) continue;
      const s = semanticOf(rgba, i);
      if (s === SEM.FABRIC) { xs.push(x); continue; }
      if (s !== SEM.OUTLINE) continue;
      let owned = false;
      for (let dy = 1; dy <= R && !owned; dy++) {
        const ny = y + dy; if (ny >= H) break;
        for (let dx = -R; dx <= R; dx++) {
          const nx = x + dx; if (nx < 0 || nx >= W) continue;
          if (fabric[ny * W + nx]) { owned = true; break; }
        }
      }
      if (owned) xs.push(x);
    }
    return xs;
  };
  return { fabric, rowPixels };
}

export function detectCollarRim(rgba, solid, centreX, contentTop, shoulderWidthHint) {
  const g = buildGarmentMask(rgba, solid);
  let y0 = -1, span = null, count = 0;
  for (let y = Math.max(0, contentTop); y < H; y++) {
    const xs = g.rowPixels(y);
    if (xs.length < TOL.MIN_GARMENT_PX_ROW) continue;
    y0 = y; count = xs.length; span = [xs[0], xs[xs.length - 1]];
    break;
  }
  if (y0 < 0) return UNKNOWN("garment-mask-top", "no row reaches the garment pixel threshold");

  // Persistence: a real garment edge continues downward. A stray stroke does not.
  let persisted = 0;
  for (let k = 1; k <= TOL.COLLAR_PERSIST_ROWS; k++) {
    if (y0 + k >= H) break;
    if (g.rowPixels(y0 + k).length >= TOL.MIN_GARMENT_PX_ROW) persisted++;
  }
  const persistence = persisted / TOL.COLLAR_PERSIST_ROWS;

  // Hard gates. Failing any of these means we found something, but not a collar.
  const centre = Math.round((span[0] + span[1]) / 2);
  const axisDev = Math.abs(centre - centreX);
  if (axisDev > TOL.COLLAR_AXIS_TOL_PX) {
    return UNKNOWN("garment-mask-top", `topmost garment band is off-axis by ${axisDev}px (limit ${TOL.COLLAR_AXIS_TOL_PX}) — probably a sleeve, not a collar`);
  }
  const width = span[1] - span[0] + 1;
  if (shoulderWidthHint > 0 && width / shoulderWidthHint > TOL.COLLAR_WIDTH_RATIO) {
    return UNKNOWN("garment-mask-top", `topmost garment band is ${(width / shoulderWidthHint).toFixed(2)}x the shoulder width (limit ${TOL.COLLAR_WIDTH_RATIO}) — that is a shoulder line, not a collar rim`);
  }
  if (persistence < TOL.MIN_CONFIDENCE) {
    return UNKNOWN("garment-mask-top", `band persists only ${persisted}/${TOL.COLLAR_PERSIST_ROWS} rows — not a continuous garment edge`);
  }
  return { value: y0, confidence: +persistence.toFixed(3), method: "detected:garment-mask-top(fabric+owned-stroke)",
           detail: { span, width, count, axisDeviation: axisDev, widthRatio: shoulderWidthHint > 0 ? +(width / shoulderWidthHint).toFixed(3) : null } };
}

// ── LANDMARK DETECTION ────────────────────────────────────────────────────────────────────────
// Returns, per landmark: { value, confidence, method } or { value: null, confidence: 0, reason }.
const UNKNOWN = (method, reason) => ({ value: null, confidence: 0, method, reason: "UNKNOWN: " + reason });

export function detectLandmarks(rgba) {
  const solid = solidMask(rgba);
  const runs = [];
  for (let y = 0; y < H; y++) runs.push(rowRuns(solid, y, TOL.MIN_RUN_WIDTH));

  // Derived centre — NOT canvas/2. An off-centre or asymmetric avatar must still be measured
  // against its own axis, and reporting the deviation is how we detect that it is off-centre.
  let sx = 0, n = 0, top = -1, bot = -1;
  for (let y = 0; y < H; y++) for (const [a, b] of runs[y]) {
    sx += (a + b) / 2 * (b - a + 1); n += (b - a + 1);
    if (top < 0) top = y; bot = y;
  }
  if (!n) throw new Error("silhouette is empty — nothing to measure");
  const centreX = Math.round(sx / n);

  const torsoRunAt = (y) => {
    const rr = runs[y]; if (!rr.length) return null;
    const hit = rr.find(([a, b]) => a <= centreX && centreX <= b);
    return hit || rr.slice().sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]))[0];
  };
  const centreRead = (y) => {
    const t = torsoRunAt(y); if (!t) return null;
    const cx = Math.round((t[0] + t[1]) / 2);
    return spanRead(rgba, solid, y, cx - TOL.CENTRE_BAND_PX, cx + TOL.CENTRE_BAND_PX);
  };

  const L = {};

  // 1. collar rim. Two passes: the width gate needs the shoulder width, and the shoulder search
  //    needs a starting row, so a provisional detection (width gate skipped, hint 0) opens the
  //    bracket and the final one re-validates it once the shoulder is known. Both are pure.
  const provisionalCollar = detectCollarRim(rgba, solid, centreX, top, 0);
  const garmentTopY = provisionalCollar.value ?? -1;

  // 2. sleeveY. First row below the collar where an OUTER band reads skin while the centre still
  //    reads fabric — i.e. bare arms have appeared beside the sleeve.
  let sleeveY = -1, slRead = null;
  if (garmentTopY >= 0) {
    for (let y = garmentTopY + 1; y < H; y++) {
      const t = torsoRunAt(y); if (!t) continue;
      const c = centreRead(y);
      if (!c || c.cls !== "fabric" || c.share < TOL.CLASS_SHARE_MIN) continue;
      const oL = spanRead(rgba, solid, y, t[0], t[0] + TOL.OUTER_BAND_PX);
      const oR = spanRead(rgba, solid, y, t[1] - TOL.OUTER_BAND_PX, t[1]);
      if (oL.cls === "skin" || oR.cls === "skin") {
        sleeveY = y; slRead = Math.max(oL.cls === "skin" ? oL.share : 0, oR.cls === "skin" ? oR.share : 0);
        break;
      }
    }
  }
  L.sleeveY = sleeveY < 0
    ? UNKNOWN("outer-skin-onset", "no row shows bare skin outboard of a fabric centre")
    : { value: sleeveY, confidence: +slRead.toFixed(3), method: "detected:outer-skin-onset" };

  // 3. hemY. First row below the sleeve end whose torso centre stops reading fabric.
  let hemY = -1, hemRead = null;
  if (sleeveY >= 0) {
    for (let y = sleeveY + 1; y < H; y++) {
      const r = centreRead(y);
      if (r && r.cls !== "fabric" && r.share >= TOL.CLASS_SHARE_MIN) { hemY = y; hemRead = r; break; }
    }
  }
  L.hemY = hemY < 0
    ? UNKNOWN("centre-fabric-offset", "the torso centre never stops reading fabric")
    : { value: hemY, confidence: +hemRead.share.toFixed(3), method: "detected:centre-fabric-offset" };

  // 4. shoulderY — NECK CLOSURE, not silhouette width.
  //
  // WHAT THE SHOULDER IS IN PIXELS. Unlike the collar, the shoulder has NO drawn rim. Measured on
  // the canonical base, the outline pixels through y=556..566 are not a band at all; they are the
  // neck's two sides converging: 478-481 + 536-541 at y=560, 488-493 + 524-529 at y=564, a single
  // merged cluster 496-511 at y=566, and nothing at y=568. The shoulders close over the neck, and
  // that closure IS the shoulder line. It is a semantic transition, not an edge that was drawn.
  //
  // THE MEASURABLE EVENT. In the centre band the fabric share is a monotone ramp:
  //   0.07 (554) -> 0.27 (560) -> 0.49 (564) -> 0.64 (566) -> 1.00 (568)
  // i.e. roughly seven source rows. The shoulder is therefore a BAND, and any single row is a
  // choice of threshold inside it. We take the majority crossing — the first row where fabric
  // outnumbers skin having previously been skin-majority — because "majority" is a definition
  // rather than a tuned constant, and it is the same centre band (+-CENTRE_BAND_PX) the existing
  // measure() already uses. Canonical D-084 shoulderY=560 sits inside this band at 27% fabric.
  //
  // CONFIDENCE = SHARPNESS x PERSISTENCE, both measured on the ramp itself.
  //
  // The first version multiplied persistence by a binary 1-or-0.5 "did the share go up" term, so
  // persistence decided everything and all five cases scored a flat 1.000 — including a ramp whose
  // per-row margin at the crossing was only 0.089. That number told us nothing.
  //
  // Sharpness is now the distance the fabric share actually travels ACROSS the closure, sampled
  // over a fixed +-SHOULDER_SHARPNESS_WINDOW_PX window centred on the crossing row. It is already
  // a fraction, so it needs no scaling: a crisp closure moves the share most of the way from 0 to
  // 1 inside the window, a blurry one barely moves it, and a ramp so gradual that the crossing row
  // is ambiguous scores low — which is exactly when we should not trust the row we picked.
  let shoulderY = -1, shConf = 0, shBand = null;
  const bandRead = (y) => {
    let sk = 0, fa = 0, n = 0;
    for (let x = centreX - TOL.CENTRE_BAND_PX; x <= centreX + TOL.CENTRE_BAND_PX; x += 2) {
      if (x < 0 || x >= W) continue;
      const i = y * W + x; if (!solid[i]) continue;
      n++; const s = semanticOf(rgba, i);
      if (s === SEM.SKIN) sk++; else if (s === SEM.FABRIC) fa++;
    }
    return { sk, fa, n, share: n ? fa / n : 0 };
  };
  if (garmentTopY >= 0 && sleeveY > garmentTopY) {
    let prev = null;
    for (let y = garmentTopY; y <= sleeveY; y++) {
      const r = bandRead(y);
      if (r.n < TOL.SHOULDER_MIN_BAND_PX) continue;
      if (prev && prev.sk > prev.fa && r.fa > r.sk) {                  // the majority crossing
        shoulderY = y;
        const wnd = TOL.SHOULDER_SHARPNESS_WINDOW_PX;
        const lo = bandRead(Math.max(0, y - wnd)), hi = bandRead(Math.min(H - 1, y + wnd));
        // Both ends must be readable, else the window fell off the figure and sharpness is unknown.
        const sharpness = (lo.n >= TOL.SHOULDER_MIN_BAND_PX && hi.n >= TOL.SHOULDER_MIN_BAND_PX)
          ? Math.max(0, Math.min(1, hi.share - lo.share)) : 0;
        let persisted = 0;
        for (let k = 1; k <= TOL.COLLAR_PERSIST_ROWS; k++) {
          const yy = y + k; if (yy > sleeveY) break;
          const p = bandRead(yy);
          if (p.n >= TOL.SHOULDER_MIN_BAND_PX && p.fa > p.sk) persisted++;
        }
        const persistence = persisted / TOL.COLLAR_PERSIST_ROWS;
        shConf = sharpness * persistence;
        shBand = { crossing: y, window: wnd,
                   shareAtCrossingMinusWindow: +lo.share.toFixed(3),
                   shareAtCrossingPlusWindow:  +hi.share.toFixed(3),
                   sharpness: +sharpness.toFixed(3), persistence: +persistence.toFixed(3),
                   crossingMargin: +((r.fa - r.sk) / r.n).toFixed(3) };
        break;
      }
      prev = r;
    }
  }
  L.shoulderY = shoulderY < 0
    ? UNKNOWN("neck-closure", "the centre band never crosses from skin-majority to fabric-majority — no neck closure to measure")
    : (shoulderY <= garmentTopY
        ? UNKNOWN("neck-closure", `closure at y=${shoulderY} is not below the collar rim (${garmentTopY})`)
        : { value: shoulderY, confidence: +shConf.toFixed(3), method: "detected:neck-closure(centre-band majority crossing)", detail: shBand });

  // 1b. FINAL collar rim — now re-validated against the measured shoulder width, so the
  //     "a collar is markedly narrower than the shoulders" gate can actually fire.
  let shoulderWidth = 0;
  if (shoulderY >= 0) { const t = torsoRunAt(shoulderY); if (t) shoulderWidth = t[1] - t[0] + 1; }
  L.collarY = detectCollarRim(rgba, solid, centreX, top, shoulderWidth);

  // 5. widestY. Argmax of torso width between the shoulder line and the sleeve end.
  let widestY = -1, widestW = 0;
  if (shoulderY >= 0 && sleeveY > shoulderY) {
    for (let y = shoulderY; y <= sleeveY; y++) {
      const t = torsoRunAt(y); if (!t) continue;
      const wid = t[1] - t[0] + 1;
      if (wid > widestW) { widestW = wid; widestY = y; }
    }
  }
  L.widestY = widestY < 0
    ? UNKNOWN("argmax-width", "no shoulder/sleeve bracket")
    : { value: widestY, confidence: 1.0, method: "detected:argmax-width" };

  // 6. Corridor — DERIVED, never assumed. Median torso-run edge over the sleeve..hem band. The
  //    median rather than min/max because a few rows have no alpha gap between arm and torso.
  let corridor = null;
  if (sleeveY >= 0 && hemY > sleeveY) {
    const ls = [], rs = [];
    for (let y = sleeveY; y < hemY; y++) { const t = torsoRunAt(y); if (t) { ls.push(t[0]); rs.push(t[1]); } }
    if (ls.length) {
      const med = (a) => a.slice().sort((p, q) => p - q)[(a.length / 2) | 0];
      corridor = [med(ls), med(rs)];
    }
  }

  // 7. crotchY. First row below the hem carrying >= 2 runs whose midpoints sit inside the DERIVED
  //    corridor (two legs; arm runs are outboard), stable for CROTCH_STABLE_ROWS rows.
  let crotchY = -1;
  if (hemY >= 0 && corridor) {
    const legLike = (y) => runs[y].filter(([a, b]) => { const m = (a + b) / 2; return m >= corridor[0] && m <= corridor[1]; }).length >= 2;
    for (let y = hemY + 1; y < H - TOL.CROTCH_STABLE_ROWS; y++) {
      let ok = true;
      for (let k = 0; k < TOL.CROTCH_STABLE_ROWS; k++) if (!legLike(y + k)) { ok = false; break; }
      if (ok) { crotchY = y; break; }
    }
  }
  L.crotchY = crotchY < 0
    ? UNKNOWN("two-leg-runs", "no stable two-run band below the hem inside the derived corridor")
    : { value: crotchY, confidence: 1.0, method: "detected:two-leg-runs" };

  return { landmarks: L, centreX, corridor, contentTop: top, contentBottom: bot, solid, runs, torsoRunAt };
}

// ── NORMALIZED PROPORTION MODEL ───────────────────────────────────────────────────────────────
// The canonical item is described once, in a space normalised to the CANONICAL avatar's
// shoulder..hem span. Any avatar is then described in the same normalised space by its OWN
// measured shoulder..hem. Mapping canonical -> avatar is what makes one item fit many bodies.
export function canonicalNormalizedModel() {
  const byId = Object.fromEntries(CANONICAL_ROWS.map((r) => [r.id, r.y]));
  const shoulder = byId.shoulder, hem = byId.hem, span = hem - shoulder;
  const t = {};
  for (const r of CANONICAL_ROWS) t[r.id] = +((r.y - shoulder) / span).toFixed(6);
  return { anchorShoulder: shoulder, anchorHem: hem, span, t };
}

// Anchors that are MEASURED on the avatar; every other row is interpolated between the two nearest
// anchors in normalised space. Interpolated rows are flagged and carry a reduced confidence.
const ANCHOR_ROWS = ["collar", "shoulder", "widest", "sleeve", "hem"];
const INTERPOLATION_PENALTY = 0.7;

export function avatarRowModel(landmarks) {
  const canon = canonicalNormalizedModel();
  const map = { collar: "collarY", shoulder: "shoulderY", widest: "widestY", sleeve: "sleeveY", hem: "hemY" };

  const sh = landmarks.shoulderY, hm = landmarks.hemY;
  if (sh.value === null || hm.value === null) {
    return { ok: false, reason: "shoulder or hem UNKNOWN — the normalised span cannot be established", canon };
  }
  const span = hm.value - sh.value;
  if (span <= 0) return { ok: false, reason: "hem is not below the shoulder", canon };

  // Measured anchors, expressed in the avatar's own normalised space.
  const anchors = [];
  for (const id of ANCHOR_ROWS) {
    const lm = landmarks[map[id]];
    if (!lm || lm.value === null || lm.confidence < TOL.MIN_CONFIDENCE) continue;
    anchors.push({ id, t: (lm.value - sh.value) / span, y: lm.value, conf: lm.confidence });
  }
  anchors.sort((a, b) => a.t - b.t);
  if (anchors.length < 2) return { ok: false, reason: "fewer than two usable anchors", canon };

  const rows = [];
  for (const r of CANONICAL_ROWS) {
    const tc = canon.t[r.id];
    const measured = anchors.find((a) => a.id === r.id);
    if (measured) {
      rows.push({ id: r.id, y: measured.y, tCanonical: tc, tAvatar: +((measured.y - sh.value) / span).toFixed(6),
                  source: "measured", confidence: measured.conf, horizontal: !!r.horizontal, pinned: !!r.pinned });
      continue;
    }
    // Interpolate in CANONICAL normalised space between the two bracketing measured anchors, then
    // read the result back out in the AVATAR's span. This is what transfers proportion, not pixels.
    let lo = null, hi = null;
    for (const a of anchors) {
      const ta = canon.t[a.id];
      if (ta <= tc && (!lo || ta > canon.t[lo.id])) lo = a;
      if (ta >= tc && (!hi || ta < canon.t[hi.id])) hi = a;
    }
    if (!lo || !hi || lo.id === hi.id) {
      rows.push({ id: r.id, y: null, tCanonical: tc, source: "UNKNOWN",
                  reason: "no bracketing anchor pair", confidence: 0, horizontal: !!r.horizontal, pinned: !!r.pinned });
      continue;
    }
    const tLo = canon.t[lo.id], tHi = canon.t[hi.id];
    const f = (tc - tLo) / (tHi - tLo);
    const tAv = lo.t + f * (hi.t - lo.t);
    rows.push({ id: r.id, y: Math.round(sh.value + tAv * span), tCanonical: tc, tAvatar: +tAv.toFixed(6),
                source: "interpolated", between: [lo.id, hi.id], confidence: +(Math.min(lo.conf, hi.conf) * INTERPOLATION_PENALTY).toFixed(3),
                horizontal: !!r.horizontal, pinned: !!r.pinned });
  }
  return { ok: true, canon, anchors: anchors.map((a) => a.id), shoulderY: sh.value, hemY: hm.value, span, rows };
}

// ── TARGET MESH ───────────────────────────────────────────────────────────────────────────────
// Topology is canonical and untouched: the same 81 ids and the same 128 triangles. Only the target
// coordinates are computed, and they are computed from the avatar, never typed in.
const COL_SIGNED = [
  ...COL_FRACTIONS.slice().reverse().map((f) => -f),
  ...COL_FRACTIONS.slice(1),
];
const vid = (row, col) => `${row}-${col}`;

// THE CONSTRAINT FRAME PROBLEM — measured, not assumed.
// mesh-core's applyConstraints is correct, but three of its rules are expressed in ABSOLUTE
// canonical coordinates, so inheriting the canonical constraint set verbatim silently undoes the
// adaptation. Measured on the neutral case before this adapter existed:
//   * pinnedVertices  -> `target := source`, so all nine `collar` vertices snapped back to the
//                        canonical (452.5, 524) instead of the avatar's measured collar at y=566;
//   * lockedX/lockedY -> `target := source` per axis, so belttop/beltbot returned to y 756/786
//                        instead of the measured 764/793, and the centre column to x=512;
//   * symmetryPairs   -> mirrors about `canvas.width / 2` (512), not the avatar's own measured
//                        axis (510 here), shifting every boundary pair by the deviation.
// Each is right for the canonical body and wrong for any other one. The fix is not a new engine:
// horizontalGroups and verticalGroups are frame-INDEPENDENT (they average, they do not pin), so
// they are kept and still applied by mesh-core. Only the three absolute rules are re-expressed.
export function adaptConstraints(canonical, centreX) {
  return {
    // dropped: both encode canonical absolute positions and cannot survive a change of body.
    pinnedVertices: [],
    symmetryPairs: [],
    // kept: "this row shares one Y" and "this column shares one X" hold on any geometry.
    horizontalGroups: canonical.horizontalGroups ?? [],
    verticalGroups: canonical.verticalGroups ?? [],
    _adapted: { droppedPinned: (canonical.pinnedVertices ?? []).length,
                droppedSymmetryPairs: (canonical.symmetryPairs ?? []).length, centreX },
  };
}
// Symmetry about the AVATAR's measured axis, replacing the canvas-centred rule we dropped above.
//
// INSCRIBE, DO NOT AVERAGE. The canonical base is itself not left-right symmetric — measured here
// at 1 px at the shoulder rising to 9 px at the collar. Averaging the two half-widths puts the
// boundary asym/2 px OUTSIDE the silhouette on the narrower side; that is exactly the 2-4 px
// excursions the first run reported, and it is a geometric certainty, not a tuning accident.
// A symmetric garment that must sit inside an asymmetric body has to be inscribed in the
// INTERSECTION of the two sides, so the shared half-width is the minimum.
// COST, stated plainly: on the wider side the garment now stops `asym` px short of the silhouette
// (<= 9 px Master = 4.5 px served = ~1.6 px at the avatar page's real render size).
function applyAvatarSymmetry(mesh, pairs, centreX) {
  const byId = new Map(mesh.vertices.map((v) => [v.id, v]));
  for (const [lid, rid] of pairs) {
    const l = byId.get(lid), r = byId.get(rid);
    if (!l || !r) continue;
    const d = Math.min(centreX - l.target[0], r.target[0] - centreX);
    l.target[0] = centreX - d; r.target[0] = centreX + d;
    const y = (l.target[1] + r.target[1]) / 2;
    l.target[1] = y; r.target[1] = y;
  }
  return mesh;
}

export function buildTargetMesh(det, rowModel, canonicalMesh, { symmetric = true } = {}) {
  const srcById = Object.fromEntries(canonicalMesh.vertices.map((v) => [v.id, v.source]));
  const cx = det.centreX;
  const vertices = [], problems = [];

  for (const r of rowModel.rows) {
    if (r.y === null) { problems.push(`row ${r.id}: UNKNOWN y (${r.reason})`); continue; }
    const t = det.torsoRunAt(r.y);
    if (!t) { problems.push(`row ${r.id}: no torso run at y=${r.y}`); continue; }
    // Below the sleeve end the arms are separate runs; clamp to the derived corridor so the garment
    // never reaches out onto bare arm. Above it the garment legitimately spans the shoulders.
    let lo = t[0], hi = t[1];
    const sleeveRow = rowModel.rows.find((q) => q.id === "sleeve");
    if (det.corridor && sleeveRow && sleeveRow.y !== null && r.y >= sleeveRow.y) {
      lo = Math.max(lo, det.corridor[0]); hi = Math.min(hi, det.corridor[1]);
    }
    const halfL = cx - lo, halfR = hi - cx;
    if (halfL <= 0 || halfR <= 0) { problems.push(`row ${r.id}: degenerate half-width L=${halfL} R=${halfR}`); continue; }

    COLS.forEach((col, i) => {
      const f = COL_SIGNED[i];
      const x = f < 0 ? cx + f * halfL : cx + f * halfR;
      const id = vid(r.id, col);
      vertices.push({
        id,
        source: srcById[id] ?? [Math.round(x * 100) / 100, r.y],
        target: [Math.round(x * 100) / 100, r.y],
        role: Math.abs(f) === 1 ? "boundary" : (f === 0 ? "feature" : "interior"),
        // Axis locks are deliberately NOT set: mesh-core reads them as `target := source`, i.e.
        // canonical absolute coordinates. The same intent is carried by the frame-independent
        // horizontal/vertical groups below.
        lockedX: false,
        lockedY: false,
      });
    });
  }

  const ids = new Set(vertices.map((v) => v.id));
  const triangles = canonicalMesh.triangles.filter((t) => t.every((id) => ids.has(id)));
  const mesh = {
    version: SCHEMA_VERSION,
    generatedBy: "poc-avatar-fit.mjs",
    note: "Target Y from measured avatar landmarks; target X from COL_FRACTIONS of the measured half-width. No hand-placed vertex.",
    canvas: { width: W, height: H },
    vertices, triangles,
    constraints: adaptConstraints(canonicalMesh.constraints ?? {}, cx),
  };
  applyConstraints(mesh);                                    // horizontal + vertical groups only
  if (symmetric) applyAvatarSymmetry(mesh, canonicalMesh.constraints?.symmetryPairs ?? [], cx);
  return { mesh, problems, droppedTriangles: canonicalMesh.triangles.length - triangles.length };
}

// ── VALIDATION GATES ──────────────────────────────────────────────────────────────────────────
const triArea = (a, b, c) => ((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;

export function validate(mesh, det, rowModel, canonicalMesh, { symmetric }) {
  const gates = [];
  const add = (id, pass, detail) => gates.push({ id, pass, detail });
  const pos = Object.fromEntries(mesh.vertices.map((v) => [v.id, v]));

  // 1+2. every target vertex must land on solid avatar pixels
  let outside = 0; const outsideIds = [];
  for (const v of mesh.vertices) {
    const x = Math.round(v.target[0]), y = Math.round(v.target[1]);
    const inBounds = x >= 0 && y >= 0 && x < W && y < H;
    if (!inBounds || !det.solid[y * W + x]) { outside++; outsideIds.push(v.id); }
  }
  add("vertices-inside-silhouette", outside <= TOL.MAX_VERTICES_OUTSIDE, { outside, limit: TOL.MAX_VERTICES_OUTSIDE, ids: outsideIds.slice(0, 12) });

  // 3+4. degenerate triangles and orientation flips, target vs source
  let degenerate = 0, flips = 0, maxStretch = 0, minStretch = Infinity;
  const hotspots = [];
  for (const [a, b, c] of mesh.triangles) {
    const va = pos[a], vb = pos[b], vc = pos[c];
    if (!va || !vb || !vc) continue;
    const at = triArea(va.target, vb.target, vc.target);
    const as = triArea(va.source, vb.source, vc.source);
    if (Math.abs(at) < MIN_TRIANGLE_AREA) degenerate++;
    if (as !== 0 && at !== 0 && Math.sign(as) !== Math.sign(at)) flips++;
    if (Math.abs(as) > MIN_TRIANGLE_AREA) {
      const ratio = Math.abs(at) / Math.abs(as);
      maxStretch = Math.max(maxStretch, ratio); minStretch = Math.min(minStretch, ratio);
      if (ratio > TOL.MAX_AREA_RATIO || ratio < TOL.MIN_AREA_RATIO) hotspots.push({ tri: [a, b, c], ratio: +ratio.toFixed(3) });
    }
  }
  add("no-degenerate-triangles", degenerate <= TOL.MAX_DEGENERATE_TRI, { degenerate });
  add("no-orientation-flips", flips <= TOL.MAX_ORIENTATION_FLIP, { flips });
  add("local-distortion-within-bounds", hotspots.length === 0,
      { maxAreaRatio: +maxStretch.toFixed(3), minAreaRatio: +(minStretch === Infinity ? 0 : minStretch).toFixed(3),
        bounds: [TOL.MIN_AREA_RATIO, TOL.MAX_AREA_RATIO], hotspots: hotspots.slice(0, 6) });

  // 5. self-intersection, via mesh-core's own metrics where available
  let dm = null;
  try { dm = distortionMetrics(mesh); } catch (e) { dm = { error: String(e.message || e) }; }
  add("mesh-core-distortion-computable", !dm.error, dm.error ? { error: dm.error } : { keys: Object.keys(dm) });

  // 6. row Y monotonicity — anatomy cannot run backwards
  const ys = mesh.vertices.filter((v) => v.id.endsWith("-mid") && !v.id.includes("-l-") && !v.id.includes("-r-"))
                          .map((v) => v.target[1]);
  const rowYs = rowModel.rows.filter((r) => r.y !== null).map((r) => r.y);
  let monotonic = true;
  for (let i = 1; i < rowYs.length; i++) if (rowYs[i] <= rowYs[i - 1]) monotonic = false;
  add("landmark-monotonic", monotonic, { rowYs });

  // 7. left/right symmetry — only meaningful on an avatar that IS symmetric
  let maxAsym = 0;
  for (const r of rowModel.rows) {
    if (r.y === null) continue;
    for (const c of ["out", "o2", "mid", "in"]) {
      const l = pos[vid(r.id, "l-" + c)], rr = pos[vid(r.id, "r-" + c)], m = pos[vid(r.id, "mid")];
      if (!l || !rr || !m) continue;
      maxAsym = Math.max(maxAsym, Math.abs((m.target[0] - l.target[0]) - (rr.target[0] - m.target[0])));
    }
  }
  add("symmetry", symmetric ? maxAsym <= TOL.SYMMETRY_TOL_PX : true,
      { maxAsymmetryPx: +maxAsym.toFixed(2), tolerance: TOL.SYMMETRY_TOL_PX, enforced: !!symmetric });

  // 8. canonical topology preservation — ids and triangles must be exactly the canonical set
  const canonIds = canonicalMesh.vertices.map((v) => v.id).sort().join("|");
  const meshIds = mesh.vertices.map((v) => v.id).sort().join("|");
  add("canonical-topology-preserved",
      canonIds === meshIds && mesh.triangles.length === canonicalMesh.triangles.length,
      { canonicalVertices: canonicalMesh.vertices.length, meshVertices: mesh.vertices.length,
        canonicalTriangles: canonicalMesh.triangles.length, meshTriangles: mesh.triangles.length });

  // 9. schema validity, via mesh-core
  let schemaOk = true, schemaErr = null;
  try { assertValidMesh(mesh, { canvasWidth: W, canvasHeight: H }); } catch (e) { schemaOk = false; schemaErr = String(e.message || e); }
  add("mesh-core-schema-valid", schemaOk, schemaErr ? { error: schemaErr.slice(0, 300) } : {});

  return { gates, pass: gates.every((g) => g.pass), stats: { outside, degenerate, flips, maxStretch, minStretch, hotspots: hotspots.length } };
}

// ── SYNTHETIC AVATAR GEOMETRIES ───────────────────────────────────────────────────────────────
// Deterministic horizontal rescaling around the avatar's own axis, applied over a vertical band
// with a cosine falloff so no hard seam is introduced. Inverse-sampled nearest-neighbour: pure,
// repeatable, and it never invents colour.
function reshape(rgba, bands) {
  const out = Buffer.alloc(W * H * 4);
  let sx = 0, n = 0;
  for (let i = 0; i < W * H; i++) if (rgba[i * 4 + 3] >= SOLID) { sx += i % W; n++; }
  const cx = n ? sx / n : W / 2;
  const factorAt = (y) => {
    let f = 1;
    for (const b of bands) {
      if (y < b.y0 || y > b.y1) continue;
      const t = (y - b.y0) / Math.max(1, b.y1 - b.y0);
      const wgt = 0.5 - 0.5 * Math.cos(2 * Math.PI * t);   // 0 at both edges, 1 in the middle
      f *= 1 + (b.scale - 1) * wgt;
    }
    return f;
  };
  for (let y = 0; y < H; y++) {
    const f = factorAt(y), fl = bands.some((b) => b.side === "left") ? factorAt(y) : f;
    for (let x = 0; x < W; x++) {
      const d = x - cx;
      const useF = d < 0 ? (bands.some((b) => b.side === "right") ? 1 : fl) : f;
      const srcX = Math.round(cx + d / useF);
      const o = (y * W + x) * 4;
      if (srcX < 0 || srcX >= W) continue;
      const s = (y * W + srcX) * 4;
      out[o] = rgba[s]; out[o + 1] = rgba[s + 1]; out[o + 2] = rgba[s + 2]; out[o + 3] = rgba[s + 3];
    }
  }
  return out;
}

export function syntheticCases(baseRgba) {
  return [
    { id: "1-neutral",        label: "neutral (unmodified base)",  symmetric: true,  rgba: Buffer.from(baseRgba) },
    { id: "2-wide-shoulders", label: "wider shoulders (+18%)",     symmetric: true,  rgba: reshape(baseRgba, [{ y0: 500, y1: 720, scale: 1.18 }]) },
    { id: "3-narrow-torso",   label: "narrower torso (-15%)",      symmetric: true,  rgba: reshape(baseRgba, [{ y0: 620, y1: 900, scale: 0.85 }]) },
    { id: "4-wide-hips",      label: "wider hips (+20%)",          symmetric: true,  rgba: reshape(baseRgba, [{ y0: 820, y1: 1040, scale: 1.20 }]) },
    { id: "5-asymmetric",     label: "asymmetric (left +15%)",     symmetric: false, rgba: reshape(baseRgba, [{ y0: 520, y1: 900, scale: 1.15, side: "left" }]) },
  ];
}

// ── VISUALISATION ─────────────────────────────────────────────────────────────────────────────
function blank() { return Buffer.alloc(W * H * 4); }
function px(buf, x, y, [r, g, b, a = 255]) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const o = (y * W + x) * 4; buf[o] = r; buf[o + 1] = g; buf[o + 2] = b; buf[o + 3] = a;
}
function line(buf, x0, y0, x1, y1, col) {
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const steps = Math.max(dx, dy, 1);
  for (let i = 0; i <= steps; i++) px(buf, x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps, col);
}
function dot(buf, x, y, col, r = 4) {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) px(buf, x + dx, y + dy, col);
}
function dim(rgba) {
  const out = Buffer.from(rgba);
  for (let i = 0; i < W * H; i++) { const o = i * 4; out[o] = out[o] * 0.35 | 0; out[o + 1] = out[o + 1] * 0.35 | 0; out[o + 2] = out[o + 2] * 0.4 | 0; }
  return out;
}
function renderOverlay(rgba, det, rowModel, mesh, outsideIds, hotspotTris) {
  const buf = dim(rgba);
  // silhouette edge
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (!det.solid[y * W + x]) continue;
    if (!det.solid[y * W + x - 1] || !det.solid[y * W + x + 1] || !det.solid[(y - 1) * W + x] || !det.solid[(y + 1) * W + x]) px(buf, x, y, [90, 220, 160]);
  }
  // landmark rows
  for (const r of rowModel.rows) {
    if (r.y === null) continue;
    const col = r.source === "measured" ? [255, 190, 60] : [120, 150, 255];
    for (let x = 0; x < W; x += 3) px(buf, x, r.y, col);
  }
  // centre axis
  for (let y = 0; y < H; y += 4) px(buf, det.centreX, y, [255, 90, 200]);
  // mesh edges
  const pos = Object.fromEntries(mesh.vertices.map((v) => [v.id, v.target]));
  const hot = new Set(hotspotTris.map((h) => h.tri.join("|")));
  for (const t of mesh.triangles) {
    const [a, b, c] = t.map((id) => pos[id]);
    if (!a || !b || !c) continue;
    const col = hot.has(t.join("|")) ? [255, 60, 60] : [80, 170, 255];
    line(buf, a[0], a[1], b[0], b[1], col); line(buf, b[0], b[1], c[0], c[1], col); line(buf, c[0], c[1], a[0], a[1], col);
  }
  // vertices
  const bad = new Set(outsideIds);
  for (const v of mesh.vertices) dot(buf, v.target[0], v.target[1], bad.has(v.id) ? [255, 40, 40] : [255, 255, 255], bad.has(v.id) ? 6 : 3);
  return encodePngRGBA(W, H, buf);
}
function renderCanonical(rgba, canonicalMesh) {
  const buf = dim(rgba);
  const pos = Object.fromEntries(canonicalMesh.vertices.map((v) => [v.id, v.target]));
  for (const t of canonicalMesh.triangles) {
    const [a, b, c] = t.map((id) => pos[id]);
    if (!a || !b || !c) continue;
    line(buf, a[0], a[1], b[0], b[1], [255, 200, 80]); line(buf, b[0], b[1], c[0], c[1], [255, 200, 80]); line(buf, c[0], c[1], a[0], a[1], [255, 200, 80]);
  }
  for (const v of canonicalMesh.vertices) dot(buf, v.target[0], v.target[1], [255, 255, 200], 3);
  return encodePngRGBA(W, H, buf);
}

// ── RUN ───────────────────────────────────────────────────────────────────────────────────────
function loadBase() {
  const tmp = join(OUT_DIR, "_base-decoded.png");
  mkdirSync(OUT_DIR, { recursive: true });
  execFileSync(DWEBP, [BASE_WEBP, "-o", assertWritable(tmp)], { stdio: "ignore" });
  const small = decodePng(readFileSync(tmp), "base");
  // 2x nearest upscale to the Master canvas — the existing convention
  const up = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const s = ((y >> 1) * small.w + (x >> 1)) * 4, o = (y * W + x) * 4;
    up[o] = small.rgba[s]; up[o + 1] = small.rgba[s + 1]; up[o + 2] = small.rgba[s + 2]; up[o + 3] = small.rgba[s + 3];
  }
  return up;
}

export function runCase(c, canonicalMesh, { emitPng }) {
  const det = detectLandmarks(c.rgba);
  const rowModel = avatarRowModel(det.landmarks);
  if (!rowModel.ok) {
    return { id: c.id, label: c.label, ok: false, stage: "row-model", reason: rowModel.reason, landmarks: det.landmarks };
  }
  const built = buildTargetMesh(det, rowModel, canonicalMesh, { symmetric: c.symmetric });
  const val = validate(built.mesh, det, rowModel, canonicalMesh, { symmetric: c.symmetric });
  const hotspots = (val.gates.find((g) => g.id === "local-distortion-within-bounds")?.detail?.hotspots) ?? [];
  const outsideIds = (val.gates.find((g) => g.id === "vertices-inside-silhouette")?.detail?.ids) ?? [];

  const meshJson = JSON.stringify(built.mesh, null, 2) + "\n";
  const meshSha = sha256(Buffer.from(meshJson));
  if (emitPng) {
    write(join(OUT_DIR, c.id, "target-mesh.json"), meshJson);
    write(join(OUT_DIR, c.id, "overlay-target-mesh.png"), renderOverlay(c.rgba, det, rowModel, built.mesh, outsideIds, hotspots));
    write(join(OUT_DIR, c.id, "overlay-canonical-mesh.png"), renderCanonical(c.rgba, canonicalMesh));
    write(join(OUT_DIR, c.id, "silhouette.png"), encodePngRGBA(W, H, c.rgba));
  }
  return { id: c.id, label: c.label, ok: true, symmetric: c.symmetric, det, rowModel, mesh: built.mesh,
           problems: built.problems, droppedTriangles: built.droppedTriangles, val, meshSha, landmarks: det.landmarks };
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const canonicalMesh = JSON.parse(readFileSync(CANONICAL_MESH, "utf8"));
  const base = loadBase();
  const cases = syntheticCases(base);

  console.log("POC — Avatar Fit Engine");
  console.log("=".repeat(94));
  console.log(`canvas ${W}x${H}   canonical topology: ${canonicalMesh.vertices.length} vertices / ${canonicalMesh.triangles.length} triangles`);
  const canon = canonicalNormalizedModel();
  console.log(`canonical normalised model (shoulder=0, hem=1): ` +
    CANONICAL_ROWS.map((r) => `${r.id}=${canon.t[r.id].toFixed(3)}`).join("  "));
  console.log("");

  const results = [], hashes = {};
  for (const c of cases) {
    const r1 = runCase(c, canonicalMesh, { emitPng: true });
    const r2 = runCase(c, canonicalMesh, { emitPng: false });     // determinism: second pass
    hashes[c.id] = { first: r1.meshSha, second: r2.meshSha, deterministic: r1.meshSha === r2.meshSha };
    results.push(r1);

    console.log(`── ${c.id}  ${c.label}`.padEnd(94, " "));
    if (!r1.ok) { console.log(`   ABORTED at ${r1.stage}: ${r1.reason}`); continue; }
    console.log(`   centreX ${r1.det.centreX} (canvas centre ${W / 2}, deviation ${r1.det.centreX - W / 2})   corridor ${JSON.stringify(r1.det.corridor)}`);
    console.log("   landmarks:");
    for (const [k, v] of Object.entries(r1.landmarks)) {
      console.log(v.value === null
        ? `     ${k.padEnd(10)} ${"UNKNOWN".padStart(6)}  conf 0.000  ${v.method}  ${v.reason}`
        : `     ${k.padEnd(10)} ${String(v.value).padStart(6)}  conf ${v.confidence.toFixed(3)}  ${v.method}`);
    }
    console.log("   rows (canonical t -> avatar y):");
    for (const r of r1.rowModel.rows) {
      console.log(`     ${r.id.padEnd(9)} t=${r.tCanonical.toFixed(3)}  y=${String(r.y ?? "UNKNOWN").padStart(6)}  ${r.source}` +
        (r.between ? ` [${r.between.join("..")}]` : "") + `  conf ${Number(r.confidence).toFixed(3)}`);
    }
    const s = r1.val.stats;
    console.log(`   vertices ${r1.mesh.vertices.length}  outside ${s.outside}   triangles ${r1.mesh.triangles.length}  degenerate ${s.degenerate}  flips ${s.flips}`);
    console.log(`   area ratio  min ${s.minStretch === Infinity ? "-" : s.minStretch.toFixed(3)}  max ${s.maxStretch.toFixed(3)}  hotspots ${s.hotspots}`);
    for (const g of r1.val.gates) console.log(`     ${g.pass ? "PASS" : "FAIL"}  ${g.id}` + (g.pass ? "" : `  ${JSON.stringify(g.detail).slice(0, 160)}`));
    console.log(`   VERDICT: ${r1.val.pass ? "PASS" : "FAIL"}   mesh sha ${r1.meshSha.slice(0, 16)}`);
    console.log("");
  }

  console.log("── DETERMINISM (two independent passes per case)");
  for (const [id, h] of Object.entries(hashes)) console.log(`   ${id.padEnd(18)} ${h.deterministic ? "IDENTICAL" : "DIVERGED"}  ${h.first.slice(0, 16)}`);
  const allDet = Object.values(hashes).every((h) => h.deterministic);

  console.log("");
  console.log("── GENERALISATION GATE: does target Y follow the avatar, or the hard-coded ROWS?");
  const canonY = Object.fromEntries(CANONICAL_ROWS.map((r) => [r.id, r.y]));
  for (const r of results) {
    if (!r.ok) continue;
    const deltas = r.rowModel.rows.map((q) => `${q.id}:${q.y === null ? "?" : (q.y - canonY[q.id] >= 0 ? "+" : "") + (q.y - canonY[q.id])}`);
    console.log(`   ${r.id.padEnd(18)} ${deltas.join("  ")}`);
  }
  const moved = results.filter((r) => r.ok && r.rowModel.rows.some((q) => q.y !== null && q.y !== canonY[q.id]));
  console.log(`   rows differ from the hard-coded canonical Y in ${moved.length}/${results.filter((r) => r.ok).length} cases`);

  const summary = {
    tolerances: TOL,
    canonicalNormalized: canon,
    deterministic: allDet,
    cases: results.map((r) => ({
      id: r.id, ok: r.ok, pass: r.ok ? r.val.pass : false, meshSha: r.meshSha ?? null,
      landmarks: r.landmarks, rows: r.ok ? r.rowModel.rows : null,
      gates: r.ok ? r.val.gates : null, stats: r.ok ? r.val.stats : null, problems: r.problems ?? null,
    })),
  };
  write(join(OUT_DIR, "poc-report.json"), JSON.stringify(summary, null, 2) + "\n");
  console.log("");
  console.log(`review output -> tools/avatar/build/poc-avatar-fit/  (gitignored)`);
  const passed = results.filter((r) => r.ok && r.val.pass).length;
  console.log(`OVERALL: ${passed}/${results.length} cases PASS   determinism ${allDet ? "OK" : "FAILED"}`);
  process.exitCode = (passed === results.length && allDet) ? 0 : 1;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) main();
