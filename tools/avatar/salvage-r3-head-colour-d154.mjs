// D-154 — DETERMINISTIC SALVAGE FEASIBILITY ONLY — NO IMAGE REQUEST AUTHORISED. NO NETWORK, NO MODEL, NO CLAIM.
//
// Asks one question about D-153's single, rejected raw output: if every pixel the BINDING background-leak gate
// classified as background leak takes the U1 underpainting's RGB instead ("S0 — exact leak fallback to U1"), does the
// UNCHANGED D-149/D-152 post-processing then pass every gate? Nothing else is tried: no interpolation, inpainting,
// nearest-neighbour fill, blur, feathering, mask growth or erosion, colour correction or AI.
//
//   1  the raw output, H1, U1 and the API_EDIT mask are verified against their full SHA-256 before any work;
//   2  the leak mask is computed with the EXACT D-153 definition (r3-head-colour-opaque-output.mjs LEAK_RULE), and its
//      per-region counts must equal backgroundLeakGate()'s own counts — otherwise the tool stops;
//   3  S0 = raw RGB, except leak pixels, which take U1's RGB; alpha stays as decoded (255 for an RGB PNG);
//   4  the unchanged backgroundLeakGate() and processOutput() run on S0;
//   5  every final pixel gets a provenance class, and seam diagnostics are measured (informational, never binding).
// The result is a FEASIBILITY output, never a candidate: callId UNASSIGNED, claimIdentity NONE, nothing is promoted,
// and every file is written only into the gitignored build area, never over an existing file.
import { readFileSync, writeFileSync, renameSync, mkdirSync, lstatSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng, encodePngRGBA } from "./build-r2-torso-occlusion-mask.mjs";
import { loadInputs, apiMaskToEditable, finalModelRgbRegion, apiContextMargin, regionOf, REGIONS, toLab, deltaE00, FIXTURE_DIR, FILES } from "./build-r3-head-colour-fixtures.mjs";
import { pngToContour, FIXTURE_DIR as GEO_DIR, FILES as GEO_FILES, HEAD_MAX_Y } from "./build-r3-head-geometry.mjs";
import { processOutput, ColourGateError, S1_PIN, S2_PIN } from "./process-r3-head-colour-output.mjs";
import { decodeOutputRgbOrRgba, backgroundLeakGate, LEAK_RULE } from "./r3-head-colour-opaque-output.mjs";
import { SOLID_ALPHA } from "./build-r3-head-edit-masks.mjs";

export const DECISION = "D-154";
export const STATUS = "DETERMINISTIC SALVAGE FEASIBILITY ONLY — NO IMAGE REQUEST AUTHORISED";
export const CALL_ID = "UNASSIGNED";
export const CLAIM_IDENTITY = "NONE";
export const VARIANT = "S0 — exact leak fallback to U1";
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const W = 1024, H = 1536, N = W * H;
export const PINS = Object.freeze({
  raw: { path: "tools/avatar/build/r3-head-colour-d153/r3-head-colour-d153.raw.png", bytes: 1393929, sha256: "c397168d63cd3405055d18153dc004615154cbd079b2736d4171a06377df1e78" },
  h1: { sha256: "72875565ecd62b542a91156dbcca1399a434fe04634f4e737df71337be0d5af4" },
  u1: { path: "tools/avatar/fixtures/r3-head-colour/r3-head-underpainting-u1-v1.png", sha256: "e67e2cccb25d914dfd016fd1ed3d9d36fa883bfc75457426b59f8d1204ba217d" },
  mask: { path: "tools/avatar/fixtures/r3-head-colour/r3-head-colour-api-mask-v2.png", sha256: "33790c5decd357aa1c9ec2bcebef60fe941a05826c55ccc81d6d54d31a6eb5d1" },
});
export const EXPECTED_LEAK_PX = 5752;
export const OUT_DIR = "tools/avatar/build/r3-head-colour-d154-salvage";
/** Provenance classes of a final pixel, with the fixed colours of the provenance map. */
export const PROVENANCE = Object.freeze({
  MODEL_RGB: { code: 1, rgb: [70, 130, 220] },
  U1_LEAK_FALLBACK: { code: 2, rgb: [230, 40, 40] },
  S1: { code: 3, rgb: [255, 255, 0] },          // S1 is a gate: it changes no pixel, so this class is always empty
  S2: { code: 4, rgb: [160, 90, 220] },
  K4: { code: 5, rgb: [20, 20, 20] },
  TRANSITION: { code: 6, rgb: [250, 200, 0] },
  PROTECT2: { code: 7, rgb: [200, 200, 200] },
  E2_ALPHA: { code: 8, rgb: [255, 255, 255] },   // inside CORE₂ but outside the head geometry: alpha 0 from E2
});
const sha = (b) => createHash("sha256").update(b).digest("hex");
const yOf = (p) => (p / W) | 0;
const rgbAt = (img, p) => [img[p * 4], img[p * 4 + 1], img[p * 4 + 2]];
const median = (a) => { const s = [...a].sort((p, q) => p - q); return s[s.length >> 1]; };
function stats(v) {
  if (!v.length) return { n: 0 };
  const s = Float64Array.from(v).sort(), q = (f) => +s[Math.min(s.length - 1, Math.floor(f * s.length))].toFixed(3);
  return { n: s.length, mean: +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(3), median: q(0.5), p90: q(0.9), p95: q(0.95), p99: q(0.99), max: +s[s.length - 1].toFixed(3) };
}

/** The D-153 background-leak mask, pixel by pixel, with EXACTLY LEAK_RULE's definition. */
export function leakMask(srcRgba, { h1Rgba, geom, apiEdit }) {
  const ch = [[], [], []]; let probe = 0;
  for (let y = LEAK_RULE.probeRows[0]; y <= LEAK_RULE.probeRows[1]; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x; if (h1Rgba[p * 4 + 3] !== 0 || apiEdit[p]) continue; probe++;
    if (srcRgba[p * 4 + 3] >= SOLID_ALPHA) for (let k = 0; k < 3; k++) ch[k].push(srcRgba[p * 4 + k]);
  }
  const bg = ch.map(median), bgLab = toLab(bg), mask = new Uint8Array(N);
  for (let p = 0; p < N; p++) { if (!geom[p] || yOf(p) > HEAD_MAX_Y) continue; if (deltaE00(toLab(rgbAt(srcRgba, p)), bgLab) <= LEAK_RULE.jndDE00) mask[p] = 1; }
  return { mask, background: bg, probe, opaqueShare: ch[0].length / probe };
}

/** Chebyshev distance (1 = edge) from the outside of the head geometry, rows <= 424; 255 above 60. */
function edgeDistance(head) {
  const d = new Uint8Array(N).fill(0);
  for (let p = 0; p < N; p++) {
    if (!head[p]) continue; const x = p % W, y = yOf(p); let found = 255;
    outer: for (let r = 1; r <= 60; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const yy = y + dy, xx = x + dx;
      if (yy < 0 || yy > HEAD_MAX_Y || xx < 0 || xx >= W || !head[yy * W + xx]) { found = r; break outer; }
    }
    d[p] = found;
  }
  return d;
}

function components(mask) {
  const seen = new Uint8Array(N), sizes = []; const stack = [];
  for (let p = 0; p < N; p++) {
    if (!mask[p] || seen[p]) continue; let n = 0; stack.push(p); seen[p] = 1;
    while (stack.length) { const q = stack.pop(); n++; const x = q % W;
      for (const r of [q - 1, q + 1, q - W, q + W]) { if (r < 0 || r >= N || (r === q - 1 && x === 0) || (r === q + 1 && x === W - 1)) continue; if (mask[r] && !seen[r]) { seen[r] = 1; stack.push(r); } } }
    sizes.push(n);
  }
  sizes.sort((a, b) => b - a);
  return { count: sizes.length, largest: sizes[0] || 0, sizes: sizes.slice(0, 10) };
}

/** The whole feasibility run on verified buffers: every input is checked against its full SHA-256 first. */
export function salvage({ root = REPO, rawBuf, h1Buf, u1Buf, maskBuf } = {}) {
  for (const [k, b] of [["raw", rawBuf], ["h1", h1Buf], ["u1", u1Buf], ["mask", maskBuf]]) {
    if (!Buffer.isBuffer(b)) throw new Error(k + " was not supplied");
    if (sha(b) !== PINS[k].sha256) throw new Error(`${k} does not match its pin ${PINS[k].sha256}`);
  }
  const rawShaBefore = sha(rawBuf);
  const decoded = decodeOutputRgbOrRgba(rawBuf);
  const result = salvageFromPixels({ root, raw: decoded.rgba, h1: decodePng(h1Buf, "H1").rgba, u1: decodePng(u1Buf, "U1").rgba, apiEdit: apiMaskToEditable(maskBuf),
    format: { colourType: decoded.colourType, alphaChannel: decoded.alphaChannel } });
  result.report.inputs = { raw: { sha256: rawShaBefore, bytes: rawBuf.length }, h1: PINS.h1.sha256, u1: PINS.u1.sha256, mask: PINS.mask.sha256, s1Pin: S1_PIN, s2Pin: S2_PIN };
  result.report.proofs.rawUnchanged = sha(rawBuf) === rawShaBefore;
  return result;
}

/** S0 on decoded pixels (no pin checks): the algorithm itself, used by salvage() and by synthetic tests. */
export function salvageFromPixels({ root = REPO, raw, h1, u1, apiEdit, format = { colourType: 6, alphaChannel: true } } = {}) {
  const rawCopy = Buffer.from(raw);
  const inp = loadInputs(root);
  const contour = pngToContour(readFileSync(join(root, GEO_DIR, GEO_FILES.contour)));
  const head = finalModelRgbRegion(inp.geom), margin = apiContextMargin(inp.geom);
  const regions = { EDIT: inp.edit, PROTECT: inp.protect, TRANSITION: inp.transition, CORE: new Uint8Array(N) };
  for (let p = 0; p < N; p++) regions.CORE[p] = inp.edit[p] && !inp.transition[p] ? 1 : 0;

  // 1 · the leak mask, checked against the binding gate's own counts
  const gateBefore = backgroundLeakGate(raw, { h1Rgba: h1, geom: inp.geom, apiEdit });
  const lm = leakMask(raw, { h1Rgba: h1, geom: inp.geom, apiEdit });
  const perRegion = Object.fromEntries(REGIONS.map((r) => [r, 0])); let leakTotal = 0;
  for (let p = 0; p < N; p++) if (lm.mask[p]) { perRegion[regionOf(p % W, yOf(p))]++; leakTotal++; }
  if (JSON.stringify(perRegion) !== JSON.stringify(gateBefore.leaks) || leakTotal !== gateBefore.total || JSON.stringify(lm.background) !== JSON.stringify(gateBefore.background)) {
    throw new Error("the leak mask does not reproduce the binding gate's counts");
  }
  // 2 · S0: exact fallback to U1 in leak pixels only
  const s0 = Buffer.from(raw); let fallback = 0, u1NotSolid = 0;
  for (let p = 0; p < N; p++) if (lm.mask[p]) { if (u1[p * 4 + 3] !== 255) u1NotSolid++; for (let k = 0; k < 3; k++) s0[p * 4 + k] = u1[p * 4 + k]; fallback++; }
  let changedOutsideMask = 0, nonLeakModelChanged = 0;
  for (let p = 0; p < N; p++) { const diff = s0[p * 4] !== raw[p * 4] || s0[p * 4 + 1] !== raw[p * 4 + 1] || s0[p * 4 + 2] !== raw[p * 4 + 2] || s0[p * 4 + 3] !== raw[p * 4 + 3];
    if (diff && !lm.mask[p]) changedOutsideMask++; if (!lm.mask[p] && head[p] && diff) nonLeakModelChanged++; }

  // 3 · the unchanged gates on S0
  const gates = { format: { pass: true, colourType: format.colourType, alphaChannel: format.alphaChannel } };
  const gateAfter = backgroundLeakGate(s0, { h1Rgba: h1, geom: inp.geom, apiEdit });
  gates.backgroundLeakAfterFallback = gateAfter;
  let processed = null, failedGate = null;
  try { processed = processOutput({ srcRgba: s0, h1Rgba: h1, geom: inp.geom, contour, regions, nsRgba: inp.ns }); }
  catch (e) { if (!(e instanceof ColourGateError)) throw e; failedGate = { gate: e.gate, message: e.message }; }
  if (processed) {
    const r = processed.report;
    Object.assign(gates, {
      coverageAlpha: Object.fromEntries(Object.entries(r.coverage).map(([k, v]) => [k, { pass: v.uncovered === 0, px: v.px, covered: v.covered, uncovered: v.uncovered }])),
      transitionUncovered: { pass: r.transition.uncovered === 0 && r.transition.widerInsideEdit === 0, uncovered: r.transition.uncovered, widerInsideEdit: r.transition.widerInsideEdit, widerOutsideEdit: r.transition.widerOutsideEdit },
      s1: { pass: r.s1.pass, de00Exact: r.s1.de00Exact, de00: r.s1.de00, threshold: r.s1.threshold, headMedianRGB: r.s1.headMedianRGB, northstarMedianRGB: r.s1.northstarMedianRGB },
      s2: { pass: true, pin: r.s2.pin, neckTarget: r.s2.neckTarget },
      joinContinuity: { pass: r.join.pass, observed: r.join.observed, bound: r.join.bound },
      protectedBytes: { pass: r.protectedBytes === 0, value: r.protectedBytes },
      transitionAlpha: { pass: r.transitionAlpha === 0, value: r.transitionAlpha },
      residueOutsideGeometry: { pass: r.residueOutsideGeometry === 0, value: r.residueOutsideGeometry },
      asymmetry: { pass: r.asymmetryPx === 0, value: r.asymmetryPx },
      rows425to445BytesVsH1: { pass: r.rows425to445BytesVsH1 === 0, value: r.rows425to445BytesVsH1 },
      alphaEqualsGeometry: { pass: r.alphaNotGeometry === 0, value: r.alphaNotGeometry },
      interiorDarkPxForVisualReview: { informational: true, value: r.interiorDarkPxForVisualReview },
    });
  }
  const allPass = !failedGate && gateAfter.pass && processed && Object.values(gates).every((g) => g.informational || g.pass !== false || g === gates.coverageAlpha) && Object.values(gates.coverageAlpha || {}).every((g) => g.pass);

  // 4 · provenance of every final pixel, and proofs
  const out = processed ? processed.rgba : null;
  const prov = new Uint8Array(N); const counts = Object.fromEntries(Object.keys(PROVENANCE).map((k) => [k, 0]));
  const s2Under = { MODEL_RGB: 0, U1_LEAK_FALLBACK: 0 };
  for (let p = 0; p < N; p++) {
    const y = yOf(p); let cls;
    if (!inp.edit[p]) cls = "PROTECT2";
    else if (inp.transition[p]) cls = "TRANSITION";
    else if (!head[p]) cls = "E2_ALPHA";
    else if (contour[p] > 0) cls = "K4";
    else if (y >= 417 && y <= 424) { cls = "S2"; s2Under[lm.mask[p] ? "U1_LEAK_FALLBACK" : "MODEL_RGB"]++; }
    else cls = lm.mask[p] ? "U1_LEAK_FALLBACK" : "MODEL_RGB";
    prov[p] = PROVENANCE[cls].code; counts[cls]++;
  }
  const proofs = { fallbackPx: fallback, expectedLeakPx: EXPECTED_LEAK_PX, fallbackEqualsLeakMask: fallback === leakTotal, u1NotSolidAtFallback: u1NotSolid,
    changedOutsideLeakMask: changedOutsideMask, nonLeakModelPxChangedBeforeProcessing: nonLeakModelChanged, provenanceSumsToCanvas: Object.values(counts).reduce((a, b) => a + b, 0) === N };
  if (out) {
    let alphaNotE2 = 0, modelOutsideHead = 0, transitionOrProtectNotH1 = 0;
    for (let p = 0; p < N; p++) {
      const y = yOf(p);
      if (y <= HEAD_MAX_Y && (out[p * 4 + 3] === 255) !== (inp.geom[p] === 1)) alphaNotE2++;
      if (regions.CORE[p] && !head[p] && (out[p * 4] | out[p * 4 + 1] | out[p * 4 + 2] | out[p * 4 + 3])) modelOutsideHead++;
      if ((!inp.edit[p] || inp.transition[p]) && (out[p * 4] !== h1[p * 4] || out[p * 4 + 1] !== h1[p * 4 + 1] || out[p * 4 + 2] !== h1[p * 4 + 2] || out[p * 4 + 3] !== h1[p * 4 + 3])) transitionOrProtectNotH1++;
    }
    Object.assign(proofs, { finalAlphaNotE2: alphaNotE2, modelRgbOutsideFinalRegion: modelOutsideHead, transitionOrProtect2NotH1: transitionOrProtectNotH1 });
  }
  proofs.rawPixelsUnchanged = Buffer.compare(raw, rawCopy) === 0;

  // 5 · seam diagnostics (informational, never binding)
  const dist = edgeDistance(head);
  const lab = (img, p) => toLab(rgbAt(img, p));
  const seam = [], naturalModel = [], naturalU1 = [];
  for (let p = 0; p < N; p++) {
    if (!head[p] || contour[p]) continue; const x = p % W;
    for (const q of [x < W - 1 ? p + 1 : -1, p + W]) {
      if (q < 0 || q >= N || !head[q] || contour[q]) continue;
      const a = lm.mask[p], b = lm.mask[q];
      if (a !== b) seam.push(deltaE00(lab(s0, p), lab(s0, q)));
      else if (!a) naturalModel.push(deltaE00(lab(raw, p), lab(raw, q)));
      naturalU1.push(deltaE00(lab(u1, p), lab(u1, q)));
    }
  }
  const k4Edge = [];
  if (out) for (let p = 0; p < N; p++) { if (!head[p]) continue; const x = p % W; for (const q of [x < W - 1 ? p + 1 : -1, p + W]) { if (q < 0 || q >= N || !head[q]) continue; if ((contour[p] > 0) !== (contour[q] > 0)) k4Edge.push(deltaE00(lab(out, p), lab(out, q))); } }
  const comp = components(lm.mask);
  let maxDepth = 0, k4Full = 0, k4Partial = 0, inS2Rows = 0;
  for (let p = 0; p < N; p++) if (lm.mask[p]) { if (dist[p] !== 255) maxDepth = Math.max(maxDepth, dist[p]); if (contour[p] === 255) k4Full++; else if (contour[p] > 0) k4Partial++; else if (yOf(p) >= 417 && yOf(p) <= 424) inS2Rows++; }
  const headPerRegion = Object.fromEntries(REGIONS.map((r) => [r, 0])); for (let p = 0; p < N; p++) if (head[p]) headPerRegion[regionOf(p % W, yOf(p))]++;
  let inMargin = 0; for (let p = 0; p < N; p++) if (lm.mask[p] && margin[p]) inMargin++;
  const diagnostics = {
    informational: true, note: "Seam measurements never decide anything; they let the owner judge the join.",
    seamPairs: seam.length, seamDE00: stats(seam),
    naturalNeighbourDE00: { rawNonLeakSkin: stats(naturalModel), u1: stats(naturalU1), k4EdgeInFinal: stats(k4Edge) },
    fallbackComponents: comp,
    fallbackShare: { total: +(leakTotal / Object.values(headPerRegion).reduce((a, b) => a + b, 0)).toFixed(4), byRegion: Object.fromEntries(REGIONS.map((r) => [r, { px: perRegion[r], of: headPerRegion[r], share: +(perRegion[r] / headPerRegion[r]).toFixed(4) }])) },
    maxFallbackDepthPxFromE2Edge: maxDepth,
    overlaps: { k4FullCoverage: k4Full, k4PartialCoverage: k4Partial, s2RowsNotK4: inS2Rows, s1Region: "S1 measures rows 300-416 (K4 excluded); it changes no pixel", finalModelRgbRegion: leakTotal, apiContextMargin: inMargin, transition: 0, protect2: 0 },
    fallbackLaterOverwritten: { fullyByK4: k4Full, partlyByK4: k4Partial, blendedByS2: inS2Rows },
    fallbackVisibleInFinal: leakTotal - k4Full,
  };

  return {
    s0, out, prov, leak: lm.mask,
    report: { tool: "salvage-r3-head-colour-d154", decision: DECISION, status: STATUS, callId: CALL_ID, claimIdentity: CLAIM_IDENTITY, variant: VARIANT,
      notACandidate: "D-154 SALVAGE FEASIBILITY — NOT AN APPROVED CANDIDATE", promoted: false, runtimeChanged: false,
      inputs: null,
      leakRule: LEAK_RULE, leakBefore: { background: lm.background, probe: lm.probe, opaqueShare: lm.opaqueShare, total: leakTotal, byRegion: perRegion, gate: gateBefore },
      gates, failedGate, allBindingGatesPass: !!allPass, provenance: { counts, s2Underlying: s2Under }, proofs, diagnostics },
  };
}

function writeNew(target, data) {
  mkdirSync(dirname(target), { recursive: true });
  const partial = target + ".partial";
  writeFileSync(partial, data, { flag: "wx" });
  let exists = true; try { lstatSync(target); } catch (_) { exists = false; }
  if (exists) throw new Error("refusing to replace an existing file: " + target);
  renameSync(partial, target);
}

export function provenanceImage(prov) {
  const byCode = Object.fromEntries(Object.values(PROVENANCE).map((v) => [v.code, v.rgb]));
  const o = Buffer.alloc(N * 4); for (let p = 0; p < N; p++) o.set([...byCode[prov[p]], 255], p * 4); return o;
}

/** Writes the feasibility files into the gitignored build area. Never overwrites. */
export function writeOutputs(result, { root = REPO } = {}) {
  const dir = join(root, ...OUT_DIR.split("/"));
  const files = { "s0-pre-processing.png": encodePngRGBA(W, H, result.s0), "provenance.png": encodePngRGBA(W, H, provenanceImage(result.prov)) };
  if (result.out) files["s0-final-not-a-candidate.png"] = encodePngRGBA(W, H, result.out);
  const hashes = {};
  for (const [n, b] of Object.entries(files)) { writeNew(join(dir, n), b); hashes[n] = sha(b); }
  const report = { ...result.report, outputs: hashes };
  const text = JSON.stringify(report, null, 2) + "\n";
  writeNew(join(dir, "report.json"), text);
  return { hashes, reportSha256: sha(Buffer.from(text, "utf8")), report };
}

const invokedDirectly = typeof process.argv[1] === "string" && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  const bad = process.argv.slice(2).filter((a, i, arr) => !(a === "--h1" || (arr[i - 1] === "--h1") || a.startsWith("--h1=")));
  if (bad.length) { console.error("REFUSED (" + bad.join(" ") + ") — D-154 is feasibility analysis only; the only argument is --h1 <path>"); process.exitCode = 1; }
  else {
    try {
      const i = process.argv.indexOf("--h1"), eq = process.argv.find((a) => a.startsWith("--h1="));
      const h1Path = eq ? eq.slice(5) : i > 0 ? process.argv[i + 1] : process.env.FITTING_BASE_V1_PATH;
      if (!h1Path) throw new Error("H1 was not supplied");
      const result = salvage({ rawBuf: readFileSync(join(REPO, PINS.raw.path)), h1Buf: readFileSync(h1Path), u1Buf: readFileSync(join(REPO, PINS.u1.path)), maskBuf: readFileSync(join(REPO, PINS.mask.path)) });
      const w = writeOutputs(result);
      console.log(`${VARIANT}: fallback ${result.report.proofs.fallbackPx} px · leak after ${result.report.gates.backgroundLeakAfterFallback.total ?? 0} · failed gate ${result.report.failedGate ? result.report.failedGate.gate : "none"} · all binding gates pass ${result.report.allBindingGatesPass}`);
      console.log("report " + w.reportSha256 + " · " + JSON.stringify(w.hashes));
    } catch (e) { console.error("✖ " + (e && e.message ? e.message : e)); process.exitCode = 1; }
  }
}
