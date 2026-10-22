// R3 face-neutral parts — composition CLI, D-164 (contract: faceNeutralPartsMethod), extended by D-167
// (faceNeutralPartsExtension: partial sheets and composition from several sources).
// No network, no credentials, no claims, no image request, no candidate promotion.
//
//   ONE SHEET (D-164, unchanged):
//   node tools/avatar/r3-face-parts-compose.mjs --sheet <raw.png> --annotations <dir with browLeft/browRight/nose/mouth .json>
//        --out <NEW dir> [--targets <targets.json>] [--northstar <png>] [--mode production|synthetic-test]
//   SEVERAL SOURCES (D-167):
//   node tools/avatar/r3-face-parts-compose.mjs --manifest <source-manifest.json>
//        --out <NEW dir> [--targets <targets.json>] [--northstar <png>] [--mode production|synthetic-test]
//
// Order: RAW checks (every raw source by ITS sheet type) -> annotations + targets (approved) -> fit + compose -> COMPOSED
// checks (the existing D-159 checker, AUTO-1..5 incl. the binding broad envelope). The FIRST failure prints a JSON report,
// exits 2 and writes NOTHING. On success it creates the new --out dir with composed-face-layer.png + transform-log.json.
// The layer is NOT a candidate. Raw sheets are only read; nothing is cropped, moved, warped, de-matted or repaired, and no
// combined "raw sheet" is ever written. PRODUCTION mode additionally requires the tracked, pinned targets file and an
// --out inside tools/avatar/build/.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve, dirname, relative, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkRawSheet, checkSheetByType, composeFaceLayer, composeFromSources, encodePng, sha256, decodePng, LAYOUT, TOOL_ID, SHEET_TYPES, SOURCE_MANIFEST_SCHEMA } from "./r3-face-parts-tool.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const CHECKER = join(HERE, "check-r3-face-neutral-output.mjs");
const DEFAULT_NS = join(REPO, "assets", "avatar", "reference", "Northstar Master v2.png");
const NS_SHA = "3daf32e76bff9a53ec7d25cf148a230073cfd0da6a003d02a23c4292d139ff50";
/** D-164: the owner-approved target points (tools/avatar/fixtures/r3-face-parts/targets-v1.json). */
export const TARGETS_REL = "tools/avatar/fixtures/r3-face-parts/targets-v1.json";
export const TARGETS_SHA256 = "f6fe9f82ed57de32c6a7abdc96b5ea7c4154362a490fb3ac1799fbecb67ac3fd";
const BUILD = join(REPO, "tools", "avatar", "build");
const inside = (child, parent) => { const r = relative(parent, child); return r !== "" && !r.startsWith("..") && !isAbsolute(r); };

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, a) => (v.startsWith("--") ? [...acc, [v.slice(2), a[i + 1]]] : acc), []));
const stop = (report) => { process.stdout.write(JSON.stringify({ verdict: "REJECT", outputWritten: false, ...report }, null, 2) + "\n"); process.exit(2); };
const mode = args.mode ?? "production";
if (!["production", "synthetic-test"].includes(mode)) stop({ stage: "args", code: "MODE_NOT_ALLOWED", why: "the CLI runs production or synthetic-test only" });
const manifestMode = !!args.manifest;
if (manifestMode && (args.sheet || args.annotations)) stop({ stage: "args", code: "MIXED_MODES", why: "--manifest cannot be combined with --sheet or --annotations" });
for (const k of manifestMode ? ["manifest", "out"] : ["sheet", "annotations", "out"]) if (!args[k]) stop({ stage: "args", code: "MISSING_ARG", why: `--${k} is required` });
if (mode === "synthetic-test" && !args.targets) stop({ stage: "args", code: "MISSING_ARG", why: "--targets is required in synthetic-test mode" });
const OUT = resolve(args.out);
if (existsSync(OUT)) stop({ stage: "args", code: "OUT_EXISTS", why: `refusing to overwrite ${OUT}` });
if (mode === "production" && !inside(OUT, BUILD)) stop({ stage: "args", code: "OUT_NOT_IN_BUILD", why: "production output must go inside the gitignored tools/avatar/build/" });
const targetsPath = resolve(args.targets ?? join(REPO, ...TARGETS_REL.split("/")));
const readJson = (p) => { try { const b = readFileSync(p); return { ok: true, value: JSON.parse(b.toString("utf8")), sha256: sha256(b) }; } catch (e) { return { ok: false, error: String(e.message) }; } };

// 1+2. raw sources and annotations
const annotations = {}, annotationFiles = {}, rawReports = {};
let compose, rawInputs;
if (!manifestMode) {
  const rawBuf = readFileSync(resolve(args.sheet)), raw = checkRawSheet(rawBuf);
  const { px: _px, ...rawReport } = raw;
  if (raw.verdict !== "PASS_TO_ANNOTATION") stop({ stage: "raw", code: raw.firstFailure, raw: rawReport });
  rawReports.sheet = rawReport;
  for (const part of LAYOUT.order) {
    const p = join(resolve(args.annotations), `${part}.json`);
    if (!existsSync(p)) continue;
    const j = readJson(p);
    if (!j.ok) stop({ stage: "annotation", part, code: "ANNOTATION_JSON_INVALID", why: j.error });
    annotations[part] = j.value; annotationFiles[part] = { file: p, sha256: j.sha256 };
  }
  rawInputs = { rawSheet: { file: resolve(args.sheet), sha256: raw.rawSha256 } };
  compose = (targets) => composeFaceLayer({ sheetPx: raw.px, rawSha: raw.rawSha256, annotations, targets, mode });
} else {
  const manifestPath = resolve(args.manifest), mj = readJson(manifestPath);
  if (!mj.ok) stop({ stage: "manifest", code: "MANIFEST_JSON_INVALID", why: mj.error });
  const M = mj.value, base = dirname(manifestPath), at = (p) => (isAbsolute(p) ? p : join(base, p));
  if (!M || M.schema !== SOURCE_MANIFEST_SCHEMA || !M.parts || typeof M.parts !== "object") stop({ stage: "manifest", code: "MANIFEST_SCHEMA_INVALID" });
  const sheets = {}, sources = {};
  for (const part of LAYOUT.order) {
    const e = M.parts[part];
    if (!e || !e.raw || typeof e.raw.file !== "string" || typeof e.raw.sha256 !== "string" || !e.annotation || typeof e.annotation.file !== "string") stop({ stage: "manifest", part, code: "MANIFEST_PART_INVALID" });
    if (e.layoutId !== LAYOUT.id || JSON.stringify(e.cell) !== JSON.stringify(LAYOUT.cells[part])) stop({ stage: "manifest", part, code: "MANIFEST_CELL_MISMATCH" });
    if (!SHEET_TYPES[e.sheetType]) stop({ stage: "manifest", part, code: "SHEET_TYPE_UNKNOWN", why: String(e.sheetType) });
    const key = e.raw.sha256;
    if (!sheets[key]) {
      let buf; try { buf = readFileSync(at(e.raw.file)); } catch (err) { stop({ stage: "source", part, code: "SOURCE_UNREADABLE", why: String(err.message) }); }
      if (sha256(buf) !== key) stop({ stage: "source", part, code: "SOURCE_SHA_MISMATCH", why: `${e.raw.file} is not ${key}` });
      const chk = checkSheetByType(buf, e.sheetType);
      const { px, ...report } = chk;
      if (chk.verdict !== "PASS_TO_ANNOTATION") stop({ stage: "raw", part, code: chk.firstFailure, sheetType: e.sheetType, raw: report });
      sheets[key] = { px, sheetType: e.sheetType, file: at(e.raw.file) }; rawReports[key] = { sheetType: e.sheetType, ...report };
    } else if (sheets[key].sheetType !== e.sheetType) stop({ stage: "manifest", part, code: "SHEET_TYPE_INCONSISTENT", why: `${key} is declared as two sheet types` });
    const aj = readJson(at(e.annotation.file));
    if (!aj.ok) stop({ stage: "annotation", part, code: "ANNOTATION_JSON_INVALID", why: aj.error });
    if (aj.sha256 !== e.annotation.sha256) stop({ stage: "annotation", part, code: "ANNOTATION_FILE_SHA_MISMATCH" });
    if (aj.value?.status !== e.annotation.status) stop({ stage: "annotation", part, code: "ANNOTATION_STATUS_MISMATCH", why: `manifest says ${e.annotation.status}, the file says ${aj.value?.status}` });
    annotations[part] = aj.value; annotationFiles[part] = { file: at(e.annotation.file), sha256: aj.sha256 };
    sources[part] = { sheetPx: sheets[key].px, rawSha: key, sheetType: e.sheetType };
  }
  rawInputs = { manifest: { file: manifestPath, sha256: mj.sha256 }, rawSources: Object.fromEntries(Object.entries(sheets).map(([k, v]) => [k, { file: v.file, sheetType: v.sheetType }])) };
  compose = (targets) => composeFromSources({ sources, annotations, targets, mode });
}
const tj = readJson(targetsPath);
if (!tj.ok) stop({ stage: "targets", code: "TARGETS_JSON_INVALID", why: tj.error });
if (mode === "production" && tj.sha256 !== TARGETS_SHA256) stop({ stage: "targets", code: "TARGETS_NOT_PINNED", why: "production uses only the D-164 targets file with its pinned SHA-256" });

// 3. compose
const c = compose(tj.value);
if (!c.ok) stop({ stage: c.stage, part: c.part, code: c.code, why: c.why });

// 4. composed checks — the EXISTING checker, unchanged, including the binding AUTO-5 broad envelope
const nsPath = resolve(args.northstar ?? DEFAULT_NS), nsBuf = readFileSync(nsPath);
if (sha256(nsBuf) !== NS_SHA) stop({ stage: "composed", code: "NORTHSTAR_HASH_MISMATCH" });
const ns = decodePng(nsBuf);
const checker = await import(pathToFileURL(CHECKER).href);
const png = encodePng(1024, 1536, c.px), composed = checker.checkFaceNeutralOutput(png, Buffer.from(ns.px.buffer, ns.px.byteOffset, ns.px.byteLength));
if (composed.verdict === "REJECT") stop({ stage: "composed", code: composed.firstFailure, composed, transform: c.log.parts.map((p) => ({ part: p.part, transform: p.transform })) });

// 5. write (only now)
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "composed-face-layer.png"), png);
const log = {
  status: "COMPOSED — NOT A CANDIDATE. Owner visual review required; candidate status is decided separately by the owner.",
  decision: manifestMode ? "D-167" : "D-164",
  tool: { id: TOOL_ID, cliSha256: sha256(readFileSync(fileURLToPath(import.meta.url))), librarySha256: sha256(readFileSync(join(HERE, "r3-face-parts-tool.mjs"))), node: process.version },
  checker: { file: "tools/avatar/check-r3-face-neutral-output.mjs", sha256: sha256(readFileSync(CHECKER)) },
  inputs: { ...rawInputs, annotations: annotationFiles, targets: { file: targetsPath, sha256: tj.sha256 }, northstar: { sha256: NS_SHA } },
  rawChecks: manifestMode ? rawReports : rawReports.sheet, composedChecks: composed, composition: c.log,
  output: { file: "composed-face-layer.png", sha256: sha256(png), pixelSha256: c.log.output.pixelSha256 },
};
writeFileSync(join(OUT, "transform-log.json"), JSON.stringify(log, null, 2));
process.stdout.write(JSON.stringify({ verdict: composed.verdict, outputWritten: true, out: OUT, output: log.output, ownerReview: c.log.parts.map((p) => ({ part: p.part, required: p.ownerReviewRequired, reasons: p.ownerReviewReasons, residualMaxPx: p.residualMaxPx, angleDeviationDeg: p.angleDeviationDeg })) }, null, 2) + "\n");
