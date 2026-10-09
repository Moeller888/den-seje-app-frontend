// D-155 — deterministic gate- and request-design FEASIBILITY for the next R3 head-colour call.
// NO NETWORK, NO MODEL, NO CLAIM, NO CALL-ID. Nothing here can send, and nothing here authorises anything.
//
// 1  maps the blindness of D-152's background-leak gate on D-153's raw output (read-only, hash-verified);
// 2  compares four detectors (r3-head-colour-coverage-gate.mjs) on control cases that do NOT depend on D-153;
// 3  simulates a protected U1 perimeter of 0-32 px (and one adaptive rule) with D-153's raw output as the diagnostic
//    model source — a FEASIBILITY SIMULATION, not a prediction of what a new call would return;
// 4  applies acceptance limits that are fixed below BEFORE any measurement, from existing contract constants.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng } from "./build-r2-torso-occlusion-mask.mjs";
import { loadInputs, apiMaskToEditable, finalModelRgbRegion, apiContextMargin, REGIONS, regionOf, toLab, deltaE00, SEAM, FIXTURE_DIR, FILES } from "./build-r3-head-colour-fixtures.mjs";
import { pngToContour, FIXTURE_DIR as GEO_DIR, FILES as GEO_FILES, HEAD_MAX_Y } from "./build-r3-head-geometry.mjs";
import { processOutput, ColourGateError } from "./process-r3-head-colour-output.mjs";
import { decodeOutputRgbOrRgba, backgroundLeakGate, LEAK_RULE } from "./r3-head-colour-opaque-output.mjs";
import { coverageGate, estimateBackground, backgroundShare, detectors, edgeDistance, COVERAGE_RULE } from "./r3-head-colour-coverage-gate.mjs";

export const DECISION = "D-155";
export const STATUS = "DETERMINISTIC GATE AND REQUEST-DESIGN FEASIBILITY ONLY — NO IMAGE REQUEST AUTHORISED";
export const CALL_ID = "UNASSIGNED";
export const CLAIM_IDENTITY = "NONE";
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const W = 1024, H = 1536, N = W * H;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const yOf = (p) => (p / W) | 0;

/** Fixed BEFORE any measurement, from existing contract constants only. */
export const ACCEPTANCE = Object.freeze({
  seamMedianMaxDE00: LEAK_RULE.jndDE00,                 // a join whose median exceeds a just-noticeable difference is visible
  seamP95MaxDE00: SEAM.S1.thresholdDE00,                // the Northstar skin's own natural spread (p95)
  visibleU1TotalMax: 0.25,                              // at most a quarter of the head may be the flat underpainting
  visibleU1RegionMax: 0.5,                              // every region must stay majority model-coloured
  rule: "A perimeter strategy is feasible only if every old gate and the D-155 coverage gate pass, the model↔U1 seam has median <= 2.3 and p95 <= 4.50, visible U1 <= 25 % of the head and < 50 % of every region.",
});
export const WIDTHS = Object.freeze([0, 4, 8, 12, 16, 20, 24, 28, 32]);
export const PINS = Object.freeze({
  raw: { path: "tools/avatar/build/r3-head-colour-d153/r3-head-colour-d153.raw.png", sha256: "c397168d63cd3405055d18153dc004615154cbd079b2736d4171a06377df1e78" },
  h1: { sha256: "72875565ecd62b542a91156dbcca1399a434fe04634f4e737df71337be0d5af4" },
  u1: { path: "tools/avatar/fixtures/r3-head-colour/r3-head-underpainting-u1-v1.png", sha256: "e67e2cccb25d914dfd016fd1ed3d9d36fa883bfc75457426b59f8d1204ba217d" },
  mask: { path: "tools/avatar/fixtures/r3-head-colour/r3-head-colour-api-mask-v2.png", sha256: "33790c5decd357aa1c9ec2bcebef60fe941a05826c55ccc81d6d54d31a6eb5d1" },
});

function stats(v) {
  if (!v.length) return { n: 0 };
  const s = Float64Array.from(v).sort(), q = (f) => +s[Math.min(s.length - 1, Math.floor(f * s.length))].toFixed(3);
  return { n: s.length, mean: +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(3), median: q(0.5), p90: q(0.9), p95: q(0.95), p99: q(0.99), max: +s[s.length - 1].toFixed(3) };
}
function components(mask) {
  const seen = new Uint8Array(N), sizes = [], stack = [];
  for (let p = 0; p < N; p++) {
    if (!mask[p] || seen[p]) continue; let n = 0; stack.push(p); seen[p] = 1;
    while (stack.length) { const q = stack.pop(); n++; const x = q % W; for (const r of [x > 0 ? q - 1 : -1, x < W - 1 ? q + 1 : -1, q - W, q + W]) if (r >= 0 && r < N && mask[r] && !seen[r]) { seen[r] = 1; stack.push(r); } }
    sizes.push(n);
  }
  sizes.sort((a, b) => b - a); return { count: sizes.length, largest: sizes[0] || 0 };
}

/** The shared, read-only context. */
export function loadContext({ root = REPO } = {}) {
  const inp = loadInputs(root);
  const contour = pngToContour(readFileSync(join(root, GEO_DIR, GEO_FILES.contour)));
  const u1Buf = readFileSync(join(root, ...PINS.u1.path.split("/"))), maskBuf = readFileSync(join(root, ...PINS.mask.path.split("/")));
  if (sha(u1Buf) !== PINS.u1.sha256 || sha(maskBuf) !== PINS.mask.sha256) throw new Error("U1 or API_EDIT does not match its pin");
  const regions = { EDIT: inp.edit, PROTECT: inp.protect, TRANSITION: inp.transition, CORE: new Uint8Array(N) };
  for (let p = 0; p < N; p++) regions.CORE[p] = inp.edit[p] && !inp.transition[p] ? 1 : 0;
  const head = finalModelRgbRegion(inp.geom);
  return { root, inp, contour, regions, head, u1: decodePng(u1Buf, "U1").rgba, apiEdit: apiMaskToEditable(maskBuf), distance: edgeDistance(inp.geom), margin: apiContextMargin(inp.geom) };
}

// ── control cases, independent of D-153 ──────────────────────────────────────────────────────
/** Synthetic H1 for the probe: solid only on TRANSITION and the head, so rows 0-119 are empty as in the real H1. */
export function syntheticH1(ctx) { const h = Buffer.alloc(N * 4); for (let p = 0; p < N; p++) if (ctx.inp.transition[p] || ctx.head[p]) h.set([253, 197, 128, 255], p * 4); return h; }
const mix = (a, b, t) => a.map((v, k) => Math.round(v * (1 - t) + b[k] * t));
export function controlCases(ctx) {
  const BG = [245, 245, 245], SKIN = [...SEAM.S1.expectedNsMedianRGB];
  const base = (bg = BG) => { const o = Buffer.alloc(N * 4); for (let p = 0; p < N; p++) o.set(ctx.head[p] ? [ctx.u1[p * 4], ctx.u1[p * 4 + 1], ctx.u1[p * 4 + 2], 255] : [...bg, 255], p * 4); return o; };
  const each = (o, f) => { for (let p = 0; p < N; p++) if (ctx.head[p]) { const c = f(p, p % W, yOf(p), ctx.distance[p]); if (c) o.set([...c, 255], p * 4); } return o; };
  const faceCentre = [512, 330];
  return [
    { id: "u1-clean", expect: "pass", why: "pure U1 on an opaque off-palette background", src: base() },
    { id: "highlight-blob", expect: "pass", why: "a soft light highlight inside the face plane is legitimate skin", src: each(base(), (p, x, y) => (Math.hypot(x - faceCentre[0], y - faceCentre[1]) <= 14 ? [252, 236, 214] : null)) },
    { id: "isolated-light-px", expect: "pass", why: "isolated light skin pixels are not a rim", src: each(base(), (p, x, y, d) => (d > 6 && p % 97 === 0 ? [250, 240, 230] : null)) },
    { id: "light-face", expect: "pass", why: "a lighter face plane alone must not fail", src: each(base(), (p, x, y) => (regionOf(x, y) === "face-plane" ? [255, 222, 178] : null)) },
    { id: "halo-ring", expect: "fail", why: "head 4 px too small with a 3 px anti-aliased rim", src: each(base(), (p, x, y, d) => (d <= 4 ? BG : d === 5 ? mix(SKIN, BG, 0.8) : d === 6 ? mix(SKIN, BG, 0.6) : d === 7 ? mix(SKIN, BG, 0.4) : null)) },
    { id: "halo-only", expect: "fail", why: "a rim of 60 % background without any exact-background pixel", src: each(base(), (p, x, y, d) => (d <= 3 ? mix(SKIN, BG, 0.6) : null)) },
    { id: "small-leak-left-ear", expect: "fail", why: "a 2 px leak at the left ear only", src: each(base(), (p, x, y, d) => (x < 366 && d <= 2 ? BG : null)) },
    { id: "large-leak-right-ear", expect: "fail", why: "the whole right ear missing", src: each(base(), (p, x) => (x > 657 ? BG : null)) },
    { id: "symmetric-ears", expect: "fail", why: "both ears 6 px short — left and right must count the same", src: each(base(), (p, x, y, d) => ((x < 366 || x > 657) && d <= 6 ? BG : null)) },
    { id: "hidden-under-k4", expect: "fail", why: "a 2 px gap entirely under the K4 band is still a gap before composition", src: each(base(), (p, x, y, d) => (d <= 2 ? BG : null)) },
    { id: "enclosed-hole", expect: "fail", why: "an enclosed hole of exact background inside the face", src: each(base(), (p, x, y) => (Math.hypot(x - faceCentre[0], y - faceCentre[1]) <= 6 ? BG : null)) },
    { id: "on-palette-background", expect: "fail", why: "a skin-coloured background hides a 6 px shrink: colour cannot prove coverage, so the gate must fail closed",
      src: each(base([250, 200, 135]), (p, x, y, d) => (d <= 6 ? [250, 200, 135] : null)) },
  ];
}

/** Every detector on every control case: false positives and false negatives. */
export function compareDetectors(ctx) {
  const h1 = syntheticH1(ctx), rows = [];
  for (const c of controlCases(ctx)) {
    const bgEst = estimateBackground(c.src, { h1Rgba: h1, apiEdit: ctx.apiEdit });
    const gate = coverageGate(c.src, { h1Rgba: h1, geom: ctx.inp.geom, apiEdit: ctx.apiEdit, distance: ctx.distance });
    const old = backgroundLeakGate(c.src, { h1Rgba: h1, geom: ctx.inp.geom, apiEdit: ctx.apiEdit });
    const det = detectors(c.src, { geom: ctx.inp.geom, background: bgEst.background, share: backgroundShare(c.src, bgEst.background), distance: ctx.distance });
    const count = (m) => { let n = 0; for (let p = 0; p < N; p++) if (m[p]) n++; return n; };
    const side = (m, left) => { let n = 0; for (let p = 0; p < N; p++) if (m[p] && (left ? p % W < 366 : p % W > 657)) n++; return n; };
    const verdict = (failCount, undecidable) => (undecidable ? "fail" : failCount > 0 ? "fail" : "pass");
    const undec = gate.undecidable === true;
    const res = {
      oldGate: old.pass ? "pass" : "fail",
      M1_fixedDE00_5: verdict(count(det.m1), false), M2_twoTier: verdict(count(det.m2), false),
      M3_connectivity: verdict(gate.applicable ? gate.uncovered : 0, undec), M4_connectivityEdgeBand: verdict(count(det.m4), undec),
    };
    rows.push({ id: c.id, expect: c.expect, why: c.why, counts: { old: old.total ?? 0, m1: count(det.m1), m2: count(det.m2), m3: gate.uncovered ?? null, m4: count(det.m4) },
      leftRight: { m3: [side(det.m3, true), side(det.m3, false)] }, results: res,
      wrong: Object.fromEntries(Object.entries(res).map(([k, v]) => [k, v !== c.expect])) });
  }
  const errors = Object.fromEntries(["oldGate", "M1_fixedDE00_5", "M2_twoTier", "M3_connectivity", "M4_connectivityEdgeBand"].map((k) => [k, {
    falsePositives: rows.filter((r) => r.expect === "pass" && r.results[k] === "fail").map((r) => r.id),
    falseNegatives: rows.filter((r) => r.expect === "fail" && r.results[k] === "pass").map((r) => r.id) }]));
  return { rows, errors };
}

// ── D-153 blindness and the perimeter series (needs the local raw output and H1) ─────────────
export function loadReal(ctx, { rawBuf, h1Buf }) {
  if (!Buffer.isBuffer(rawBuf) || sha(rawBuf) !== PINS.raw.sha256) throw new Error("the D-153 raw output does not match its pin");
  if (!Buffer.isBuffer(h1Buf) || sha(h1Buf) !== PINS.h1.sha256) throw new Error("H1 does not match its pin");
  return { raw: decodeOutputRgbOrRgba(rawBuf).rgba, h1: decodePng(h1Buf, "H1").rgba };
}

export function blindness(ctx, { raw, h1 }, extraSources = {}) {
  const old = backgroundLeakGate(raw, { h1Rgba: h1, geom: ctx.inp.geom, apiEdit: ctx.apiEdit });
  const gate = coverageGate(raw, { h1Rgba: h1, geom: ctx.inp.geom, apiEdit: ctx.apiEdit, distance: ctx.distance });
  const det = gate.detectors, bgLab = toLab(old.background);
  const band = new Uint8Array(N); const byRegion = Object.fromEntries(REGIONS.map((r) => [r, 0]));
  let bandCount = 0, bandVisible = 0, bandConnected = 0, maxDist = 0;
  for (let p = 0; p < N; p++) {
    if (!ctx.head[p]) continue; const d = det.de[p];
    if (d > LEAK_RULE.jndDE00 && d <= 5) { band[p] = 1; bandCount++; byRegion[regionOf(p % W, yOf(p))]++; if (ctx.contour[p] < 255) bandVisible++; if (gate.mask[p]) bandConnected++; if (ctx.distance[p] !== 255) maxDist = Math.max(maxDist, ctx.distance[p]); }
  }
  const legit = {};
  for (const [name, img, region] of [["U1", ctx.u1, ctx.head], ["H1 (whole image, solid pixels)", h1, null], ...Object.entries(extraSources).map(([k, v]) => [k, v, null])]) {
    let n = 0, total = 0;
    for (let p = 0; p < N; p++) { if (region ? !region[p] : img[p * 4 + 3] < 128) continue; total++; if (deltaE00(toLab([img[p * 4], img[p * 4 + 1], img[p * 4 + 2]]), bgLab) <= 5) n++; }
    legit[name] = { withinDE00_5_ofBackground: n, of: total };
  }
  return { oldGate: { pass: old.pass, total: old.total, byRegion: old.leaks, background: old.background },
    band2_3to5: { px: bandCount, byRegion, components: components(band), visibleAfterK4: bandVisible, connectedToBackground: bandConnected, isolated: bandCount - bandConnected, maxDistanceFromEdge: maxDist },
    newGate: { pass: gate.pass, uncovered: gate.uncovered, coreLeak: gate.coreLeak, haloOnly: gate.haloOnly, byRegion: gate.byRegion },
    legitimateColoursNearBackground: legit };
}

/** One perimeter strategy: protect(p) decides which head pixels keep U1. */
export function simulatePerimeter(ctx, { raw, h1 }, { id, protect }) {
  const src = Buffer.from(raw); const prot = new Uint8Array(N);
  for (let p = 0; p < N; p++) if (ctx.head[p] && protect(p)) { prot[p] = 1; for (let k = 0; k < 3; k++) src[p * 4 + k] = ctx.u1[p * 4 + k]; }
  const r = { id, gates: {} };
  const old = backgroundLeakGate(src, { h1Rgba: h1, geom: ctx.inp.geom, apiEdit: ctx.apiEdit });
  const gate = coverageGate(src, { h1Rgba: h1, geom: ctx.inp.geom, apiEdit: ctx.apiEdit, distance: ctx.distance });
  r.gates.oldBackgroundLeak = { pass: old.pass, total: old.total };
  r.gates.d155Coverage = { pass: gate.pass, uncovered: gate.uncovered, byRegion: gate.byRegion };
  let out = null;
  try { const res = processOutput({ srcRgba: src, h1Rgba: h1, geom: ctx.inp.geom, contour: ctx.contour, regions: ctx.regions, nsRgba: ctx.inp.ns }); out = res.rgba; const g = res.report;
    Object.assign(r.gates, { s1: { pass: g.s1.pass, de00Exact: +g.s1.de00Exact.toFixed(4) }, join: { pass: g.join.pass, observed: g.join.observed, bound: g.join.bound },
      protectedBytes: g.protectedBytes, transitionAlpha: g.transitionAlpha, residue: g.residueOutsideGeometry, asymmetry: g.asymmetryPx, rows425to445: g.rows425to445BytesVsH1, alphaNotGeometry: g.alphaNotGeometry });
    r.processor = "pass";
  } catch (e) { if (!(e instanceof ColourGateError)) throw e; r.processor = "FAIL " + e.gate; }
  // counts, visibility, regions
  const reg = Object.fromEntries(REGIONS.map((k) => [k, { u1: 0, u1Visible: 0, of: 0 }])); let modelPx = 0, u1Px = 0, u1Visible = 0, headPx = 0;
  for (let p = 0; p < N; p++) { if (!ctx.head[p]) continue; headPx++; const rr = reg[regionOf(p % W, yOf(p))]; rr.of++;
    if (prot[p]) { u1Px++; rr.u1++; if (ctx.contour[p] < 255) { u1Visible++; rr.u1Visible++; } } else modelPx++; }
  // the seam: 4-neighbour pairs, both in the head and outside K4, one protected and one model
  const seam = []; let darkNear = 0;
  for (let p = 0; p < N; p++) { if (!ctx.head[p] || ctx.contour[p]) continue; const x = p % W;
    for (const q of [x < W - 1 ? p + 1 : -1, p + W]) { if (q < 0 || q >= N || !ctx.head[q] || ctx.contour[q] || prot[p] === prot[q]) continue;
      seam.push(deltaE00(toLab([src[p * 4], src[p * 4 + 1], src[p * 4 + 2]]), toLab([src[q * 4], src[q * 4 + 1], src[q * 4 + 2]]))); } }
  for (let p = 0; p < N; p++) { if (!ctx.head[p] || prot[p] || ctx.contour[p]) continue; if (toLab([src[p * 4], src[p * 4 + 1], src[p * 4 + 2]])[0] >= 40) continue; const x = p % W;
    let near = false; for (let dy = -3; dy <= 3 && !near; dy++) for (let dx = -3; dx <= 3; dx++) { const q = p + dy * W + dx; if (q >= 0 && q < N && Math.abs((q % W) - x) <= 3 && prot[q]) { near = true; break; } } if (near) darkNear++; }
  const s = stats(seam);
  const visibleShare = u1Visible / headPx;
  const regionShares = Object.fromEntries(Object.entries(reg).map(([k, v]) => [k, +(v.u1Visible / v.of).toFixed(4)]));
  let maxDepth = 0; for (let p = 0; p < N; p++) if (prot[p] && ctx.distance[p] !== 255) maxDepth = Math.max(maxDepth, ctx.distance[p]);
  const oldGatesPass = old.pass && r.processor === "pass";
  const criteria = {
    oldGates: oldGatesPass, d155Coverage: gate.pass,
    seamMedian: s.n === 0 ? true : s.median <= ACCEPTANCE.seamMedianMaxDE00, seamP95: s.n === 0 ? true : s.p95 <= ACCEPTANCE.seamP95MaxDE00,
    visibleU1Total: visibleShare <= ACCEPTANCE.visibleU1TotalMax, visibleU1Regions: Object.values(regionShares).every((v) => v < ACCEPTANCE.visibleU1RegionMax),
  };
  Object.assign(r, { modelPx, u1Px, u1Visible, visibleU1Share: +visibleShare.toFixed(4), regions: reg, regionVisibleShares: regionShares,
    seamPairs: seam.length, seamDE00: s, largestU1Component: components(prot).largest, maxDepth, darkModelPxNearSeam: darkNear,
    symmetry: { earLeftVisibleU1: reg["ear-left"].u1Visible, earRightVisibleU1: reg["ear-right"].u1Visible, sideLeft: reg["side-left"].u1Visible, sideRight: reg["side-right"].u1Visible },
    criteria, feasible: Object.values(criteria).every(Boolean) });
  return { result: r, src, out, protect: prot };
}

export function perimeterStrategies(ctx) {
  const list = WIDTHS.map((w) => ({ id: "perimeter-" + w + "px", protect: (p) => ctx.distance[p] <= w }));
  // adaptive, general rule from geometry only: both ears (thin, by the contract's x limits) fully protected, 12 px elsewhere
  list.push({ id: "adaptive-ears-full+12px", protect: (p) => { const x = p % W; return x < 366 || x > 657 || ctx.distance[p] <= 12; } });
  return list;
}

export function conclusion(series) {
  const feasible = series.filter((r) => r.feasible).map((r) => r.id);
  if (feasible.length) return { code: "A", text: "A — PROTECTED-PERIMETER REQUEST DESIGN PROVEN FEASIBLE", feasible };
  // B would require evidence that a full-E2 request covers the silhouette; the only such evidence (D-153) did not.
  return { code: "C", text: "C — NO NEW IMAGE CALL SHOULD BE AUTHORISED YET", feasible,
    whyNotB: "no measured evidence that a full-silhouette request covers E2; the only sample (D-153) did not" };
}

export function analyse({ root = REPO, rawBuf, h1Buf } = {}) {
  const ctx = loadContext({ root });
  const comparison = compareDetectors(ctx);
  const real = loadReal(ctx, { rawBuf, h1Buf });
  const ns = ctx.inp.ns;
  const blind = blindness(ctx, real, { "Northstar Master v2 (solid pixels)": ns });
  const series = perimeterStrategies(ctx).map((s) => simulatePerimeter(ctx, real, s).result);
  const natural = (() => { const v = []; for (let p = 0; p < N; p++) { if (!ctx.head[p] || ctx.contour[p]) continue; const x = p % W; for (const q of [x < W - 1 ? p + 1 : -1, p + W]) { if (q < 0 || q >= N || !ctx.head[q] || ctx.contour[q]) continue; v.push(deltaE00(toLab([real.raw[p * 4], real.raw[p * 4 + 1], real.raw[p * 4 + 2]]), toLab([real.raw[q * 4], real.raw[q * 4 + 1], real.raw[q * 4 + 2]]))); } } return stats(v); })();
  return { decision: DECISION, status: STATUS, callId: CALL_ID, claimIdentity: CLAIM_IDENTITY, notACandidate: true, simulationOnly: "FEASIBILITY SIMULATION with D-153's raw output as the diagnostic model source — not a prediction of a new call",
    acceptance: ACCEPTANCE, coverageRule: COVERAGE_RULE, comparison, blindness: blind, naturalModelNeighbourDE00: natural, perimeter: series, conclusion: conclusion(series),
    inputs: { raw: PINS.raw.sha256, h1: PINS.h1.sha256, u1: PINS.u1.sha256, mask: PINS.mask.sha256 } };
}

const invokedDirectly = typeof process.argv[1] === "string" && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  const argv = process.argv.slice(2), allowed = (a, i) => a.startsWith("--raw=") || a.startsWith("--h1=") || ((a === "--raw" || a === "--h1") && argv[i + 1]) || ((argv[i - 1] === "--raw" || argv[i - 1] === "--h1"));
  const bad = argv.filter((a, i) => !allowed(a, i));
  if (bad.length) { console.error("REFUSED (" + bad.join(" ") + ") — D-155 is analysis only; the only arguments are --raw <path> and --h1 <path>"); process.exitCode = 1; }
  else {
    try {
      const get = (f) => { const e = argv.find((a) => a.startsWith(f + "=")); if (e) return e.slice(f.length + 1); const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
      const rawPath = get("--raw"), h1Path = get("--h1") || process.env.FITTING_BASE_V1_PATH;
      if (!rawPath || !h1Path) throw new Error("--raw <path> and --h1 <path> are required");
      const r = analyse({ rawBuf: readFileSync(rawPath), h1Buf: readFileSync(h1Path) });
      process.stdout.write(JSON.stringify(r, null, 2) + "\n");
    } catch (e) { console.error("✖ " + (e && e.message ? e.message : e)); process.exitCode = 1; }
  }
}
