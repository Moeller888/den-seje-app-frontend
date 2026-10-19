// R3 face-neutral parts — composition CLI, D-164 (contract: faceNeutralPartsMethod).
// No network, no credentials, no claims, no image request, no candidate promotion.
//
//   node tools/avatar/r3-face-parts-compose.mjs --sheet <raw.png> --annotations <dir with browLeft/browRight/nose/mouth .json>
//        --out <NEW dir> [--targets <targets.json>] [--northstar <png>] [--mode production|synthetic-test]
//
// Order: RAW checks -> annotations + targets (approved) -> fit + compose -> COMPOSED checks (the existing D-159 checker,
// AUTO-1..5 incl. the binding broad envelope). The FIRST failure prints a JSON report, exits 2 and writes NOTHING.
// On success it creates the new --out dir with composed-face-layer.png + transform-log.json. The layer is NOT a candidate.
// The raw sheet is only read; nothing is cropped, moved, warped, de-matted or repaired to pass a check.
// PRODUCTION mode additionally requires the tracked, pinned targets file and an --out inside tools/avatar/build/.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve, dirname, relative, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkRawSheet, composeFaceLayer, encodePng, sha256, decodePng, LAYOUT, TOOL_ID } from "./r3-face-parts-tool.mjs";

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
for (const k of ["sheet", "annotations", "out"]) if (!args[k]) stop({ stage: "args", code: "MISSING_ARG", why: `--${k} is required` });
if (mode === "synthetic-test" && !args.targets) stop({ stage: "args", code: "MISSING_ARG", why: "--targets is required in synthetic-test mode" });
const OUT = resolve(args.out);
if (existsSync(OUT)) stop({ stage: "args", code: "OUT_EXISTS", why: `refusing to overwrite ${OUT}` });
if (mode === "production" && !inside(OUT, BUILD)) stop({ stage: "args", code: "OUT_NOT_IN_BUILD", why: "production output must go inside the gitignored tools/avatar/build/" });
const targetsPath = resolve(args.targets ?? join(REPO, ...TARGETS_REL.split("/")));

// 1. raw sheet
const rawBuf = readFileSync(resolve(args.sheet)), raw = checkRawSheet(rawBuf);
const { px: _px, ...rawReport } = raw;
if (raw.verdict !== "PASS_TO_ANNOTATION") stop({ stage: "raw", code: raw.firstFailure, raw: rawReport });

// 2. annotations + targets (files are read, never written)
const readJson = (p) => { try { const b = readFileSync(p); return { ok: true, value: JSON.parse(b.toString("utf8")), sha256: sha256(b) }; } catch (e) { return { ok: false, error: String(e.message) }; } };
const annotations = {}, annotationFiles = {};
for (const part of LAYOUT.order) {
  const p = join(resolve(args.annotations), `${part}.json`);
  if (!existsSync(p)) continue;
  const j = readJson(p);
  if (!j.ok) stop({ stage: "annotation", part, code: "ANNOTATION_JSON_INVALID", why: j.error });
  annotations[part] = j.value; annotationFiles[part] = { file: p, sha256: j.sha256 };
}
const tj = readJson(targetsPath);
if (!tj.ok) stop({ stage: "targets", code: "TARGETS_JSON_INVALID", why: tj.error });
if (mode === "production" && tj.sha256 !== TARGETS_SHA256) stop({ stage: "targets", code: "TARGETS_NOT_PINNED", why: "production uses only the D-164 targets file with its pinned SHA-256" });

// 3. compose
const c = composeFaceLayer({ sheetPx: raw.px, rawSha: raw.rawSha256, annotations, targets: tj.value, mode });
if (!c.ok) stop({ stage: c.stage, part: c.part, code: c.code, why: c.why, raw: rawReport });

// 4. composed checks — the EXISTING checker, unchanged, including the binding AUTO-5 broad envelope
const nsPath = resolve(args.northstar ?? DEFAULT_NS), nsBuf = readFileSync(nsPath);
if (sha256(nsBuf) !== NS_SHA) stop({ stage: "composed", code: "NORTHSTAR_HASH_MISMATCH" });
const ns = decodePng(nsBuf);
const checker = await import(pathToFileURL(CHECKER).href);
const png = encodePng(1024, 1536, c.px), composed = checker.checkFaceNeutralOutput(png, Buffer.from(ns.px.buffer, ns.px.byteOffset, ns.px.byteLength));
if (composed.verdict === "REJECT") stop({ stage: "composed", code: composed.firstFailure, composed, raw: rawReport, transform: c.log.parts.map((p) => ({ part: p.part, transform: p.transform })) });

// 5. write (only now)
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "composed-face-layer.png"), png);
const log = {
  status: "COMPOSED — NOT A CANDIDATE. Owner visual review required; candidate status is decided separately by the owner.",
  decision: "D-164",
  tool: { id: TOOL_ID, cliSha256: sha256(readFileSync(fileURLToPath(import.meta.url))), librarySha256: sha256(readFileSync(join(HERE, "r3-face-parts-tool.mjs"))), node: process.version },
  checker: { file: "tools/avatar/check-r3-face-neutral-output.mjs", sha256: sha256(readFileSync(CHECKER)) },
  inputs: { rawSheet: { file: resolve(args.sheet), sha256: raw.rawSha256 }, annotations: annotationFiles, targets: { file: targetsPath, sha256: tj.sha256 }, northstar: { sha256: NS_SHA } },
  rawChecks: rawReport, composedChecks: composed, composition: c.log,
  output: { file: "composed-face-layer.png", sha256: sha256(png), pixelSha256: c.log.output.pixelSha256 },
};
writeFileSync(join(OUT, "transform-log.json"), JSON.stringify(log, null, 2));
process.stdout.write(JSON.stringify({ verdict: composed.verdict, outputWritten: true, out: OUT, output: log.output, ownerReview: c.log.parts.map((p) => ({ part: p.part, required: p.ownerReviewRequired, reasons: p.ownerReviewReasons, residualMaxPx: p.residualMaxPx, angleDeviationDeg: p.angleDeviationDeg })) }, null, 2) + "\n");
