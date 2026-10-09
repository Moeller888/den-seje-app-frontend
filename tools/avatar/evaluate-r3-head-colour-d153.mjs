// D-153 — deterministic evaluation of the ONE raw opaque-background head-colour output. NO NETWORK, NO MODEL, NO CLAIM.
//
// Reads the raw output the D-153 send adapter stored byte for byte, verifies it against the request manifest, and:
//   1  decodes it with decodeOutputRgbOrRgba() (8-bit RGB or RGBA at 1024x1536; RGB gets alpha 255);
//   2  runs D-152's backgroundLeakGate() — BINDING for D-153 — because the alpha-based coverage of the D-149 processor
//      cannot see a head drawn too small when the background is opaque;
//   3  runs the unchanged D-149 post-processing: geometry and alpha from the pinned head geometry (E2), S1 (unrounded
//      CIEDE2000 <= 4.50), S2 (rows 417-424 before K4), K4, TRANSITION and PROTECT2 byte-identical from H1, every gate.
// The raw output is never edited, retouched, cropped or scaled. A failing gate REJECTS the candidate; there is no repair
// and no new call. Nothing is promoted: every file this tool writes stays in the gitignored build area, and it never
// overwrites or deletes an existing file.
//
// Usage: node tools/avatar/evaluate-r3-head-colour-d153.mjs --h1 <path>      (or FITTING_BASE_V1_PATH)
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, lstatSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadInputs, apiMaskToEditable, FIXTURE_DIR as COLOUR_DIR, FILES as COLOUR_FILES } from "./build-r3-head-colour-fixtures.mjs";
import { pngToContour, FIXTURE_DIR as GEO_DIR, FILES as GEO_FILES } from "./build-r3-head-geometry.mjs";
import { decodePng } from "./build-r2-torso-occlusion-mask.mjs";
import { processOutput, writeCandidate, ColourGateError, S1_PIN, S2_PIN } from "./process-r3-head-colour-output.mjs";
import { decodeOutputRgbOrRgba, backgroundLeakGate, LEAK_RULE } from "./r3-head-colour-opaque-output.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const OUT_DIR = "tools/avatar/build/r3-head-colour-d153";
export const CALL_ID = "D-153-r3-head-colour-u1-opaque-v1";
export const FILES = Object.freeze({
  raw: OUT_DIR + "/r3-head-colour-d153.raw.png",
  manifest: OUT_DIR + "/r3-head-colour-d153.request.json",
  candidate: OUT_DIR + "/r3-head-colour-d153.candidate.png",
  evaluation: OUT_DIR + "/r3-head-colour-d153.evaluation.json",
});
export const H1_SHA256 = "72875565ecd62b542a91156dbcca1399a434fe04634f4e737df71337be0d5af4";
const N = 1024 * 1536;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const errText = (e) => (e && e.message ? e.message : String(e));
const exists = (p) => { try { lstatSync(p); return true; } catch (_) { return false; } };
const plain = (v) => JSON.parse(JSON.stringify(v === undefined ? null : v, (k, x) => (ArrayBuffer.isView(x) ? "<buffer>" : x)));

function writeNew(target, data) {
  mkdirSync(dirname(target), { recursive: true });
  const partial = target + ".partial";
  writeFileSync(partial, data, { flag: "wx" });
  if (exists(target)) throw new Error("refusing to replace an existing file: " + target);
  renameSync(partial, target);
}

/** Evaluates the raw output under `root`. Writes the candidate only when every gate passed, and the report always. */
export function evaluate({ root = REPO, h1Path } = {}) {
  const at = (rel) => join(root, ...rel.split("/"));
  for (const k of ["candidate", "evaluation"]) if (exists(at(FILES[k])) || exists(at(FILES[k]) + ".partial")) throw new Error("refusing to overwrite an existing " + k + ": " + FILES[k]);
  if (!existsSync(at(FILES.raw))) throw new Error("no raw output at " + FILES.raw);
  if (!existsSync(at(FILES.manifest))) throw new Error("no request manifest at " + FILES.manifest);
  const raw = readFileSync(at(FILES.raw));
  const manifest = JSON.parse(readFileSync(at(FILES.manifest), "utf8"));
  if (!manifest.result || manifest.result.sha256 !== sha(raw) || manifest.result.bytes !== raw.length) throw new Error("the raw output does not match the request manifest");
  if (manifest.callId !== CALL_ID) throw new Error("the manifest is not D-153's");
  if (typeof h1Path !== "string" || h1Path === "" || !existsSync(h1Path)) throw new Error("H1 was not supplied");
  const h1Buf = readFileSync(h1Path);
  if (sha(h1Buf) !== H1_SHA256) throw new Error("H1 does not match its pin");

  const report = { tool: "evaluate-r3-head-colour-d153", decision: "D-153", callId: manifest.callId,
    raw: { file: FILES.raw, bytes: raw.length, sha256: sha(raw) }, h1Sha256: H1_SHA256, s1Pin: S1_PIN, s2Pin: S2_PIN, leakRule: LEAK_RULE,
    verdict: null, rejectedAt: null, gates: {}, candidate: null, promoted: false, runtimeChanged: false };
  const reject = (gate, detail) => { report.verdict = "REJECTED"; report.rejectedAt = gate; report.gates.failed = { gate, ...detail }; writeNew(at(FILES.evaluation), JSON.stringify(report, null, 2) + "\n"); return report; };

  let decoded;
  try { decoded = decodeOutputRgbOrRgba(raw); }
  catch (e) { return reject(e instanceof ColourGateError ? e.gate : "format", { message: errText(e) }); }
  report.gates.format = { pass: true, colourType: decoded.colourType, alphaChannel: decoded.alphaChannel };
  const src = decoded.rgba;
  const inp = loadInputs(root);
  const h1 = decodePng(h1Buf, "H1").rgba;
  const apiEdit = apiMaskToEditable(readFileSync(join(root, COLOUR_DIR, COLOUR_FILES.mask)));
  const leak = backgroundLeakGate(src, { h1Rgba: h1, geom: inp.geom, apiEdit });
  report.gates.backgroundLeak = plain(leak);
  if (!leak.pass) return reject("background-leak", { message: "head-geometry pixels show the output's background colour", leaks: leak.leaks, total: leak.total });
  const contour = pngToContour(readFileSync(join(root, GEO_DIR, GEO_FILES.contour)));
  const regions = { EDIT: inp.edit, PROTECT: inp.protect, TRANSITION: inp.transition, CORE: new Uint8Array(N) };
  for (let p = 0; p < N; p++) regions.CORE[p] = inp.edit[p] && !inp.transition[p] ? 1 : 0;
  try {
    const result = processOutput({ srcRgba: src, h1Rgba: h1, geom: inp.geom, contour, regions, nsRgba: inp.ns });
    const r = result.report;
    Object.assign(report.gates, {
      coverageAlpha: Object.fromEntries(Object.entries(r.coverage).map(([k, v]) => [k, { pass: v.uncovered === 0, px: v.px, covered: v.covered, uncovered: v.uncovered }])),
      coverageAlphaNote: "for an opaque output every pixel is solid, so this alpha coverage is trivially met; the binding coverage is backgroundLeak",
      transitionUncovered: { pass: true, value: plain(r.transition) },
      s1: { pass: r.s1.pass, de00: r.s1.de00, de00Exact: r.s1.de00Exact, threshold: r.s1.threshold, headMedianRGB: r.s1.headMedianRGB, northstarMedianRGB: r.s1.northstarMedianRGB },
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
    report.verdict = "PASSED_ALL_MACHINE_GATES — AWAITS THE OWNER'S VISUAL DECISION";
    const candidateSha = writeCandidate(result, at(FILES.candidate));
    report.candidate = { file: FILES.candidate, sha256: candidateSha, bytes: readFileSync(at(FILES.candidate)).length };
  } catch (e) {
    if (!(e instanceof ColourGateError)) throw e;
    return reject(e.gate, { message: errText(e), report: plain(e.report) });
  }
  writeNew(at(FILES.evaluation), JSON.stringify(report, null, 2) + "\n");
  return report;
}

const invokedDirectly = typeof process.argv[1] === "string" && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  const i = process.argv.indexOf("--h1");
  const eqArg = process.argv.find((a) => a.startsWith("--h1="));
  const h1Path = eqArg ? eqArg.slice(5) : i > 0 ? process.argv[i + 1] : process.env.FITTING_BASE_V1_PATH;
  try {
    const r = evaluate({ h1Path });
    console.log("verdict: " + r.verdict + (r.rejectedAt ? " at " + r.rejectedAt : ""));
    console.log("raw " + r.raw.sha256 + (r.candidate ? " · candidate " + r.candidate.sha256 : ""));
    console.log("report: " + FILES.evaluation);
  } catch (e) { console.error("✖ " + errText(e)); process.exitCode = 1; }
}
