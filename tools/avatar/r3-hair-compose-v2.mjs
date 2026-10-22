// R3 hair — composition CLI v2, D-179 (contract: hairMethod.methodV2). No network, no credentials, no claims, no image
// request, no candidate promotion, no runtime change. r3-hair-compose.mjs (v1, D-174) stays unchanged.
//
//   A4 PROPOSAL (review aid only, writes nothing):
//   node tools/avatar/r3-hair-compose-v2.mjs --propose-a4 <hair-sheet.png> --a9 <x,y> --a10 <x,y>
//   COMPOSE:
//   node tools/avatar/r3-hair-compose-v2.mjs --sheet <hair-sheet.png> --annotation <annotation-v2.json> --face <face-layer.png>
//        --eyes-fixed <eyes-fixed-layer.png> --iris <iris-layer.png> --out <NEW dir> [--targets <targets.json>]
//        [--mode production|synthetic-test]
//
// Order: H1..H5 (v1, unchanged) -> targets v2 + annotation v2 (approved, bound to the sheet) -> seat fit on A4, A9, A10
// (HP1v2 residual, aspect, HP2) -> HP-LOCK -> placement -> HP4v2, HP5..HP8 (v1), HP-FRAG. The FIRST failure prints a JSON
// report (stage "seat" or "shape" or "placement"), exits 2 and writes NOTHING. On success it creates the new --out dir with
// hair-luminance-layer.png, one REVIEW-ONLY tonal-ramp-B render per hair token and transform-log.json. Nothing is a candidate.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve, dirname, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { checkHairSheet } from "./r3-hair-tool.mjs";
import { composeHair, proposeA4, applyTonalRampB, decodePng, encodePng, sha256, TOOL_ID, SHEET } from "./r3-hair-tool-v2.mjs";
import { HAIR_COLOR_TOKENS, DEFAULT_HAIR_COLOR } from "../../js/avatar-layers.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
/** D-179: the owner-APPROVED v2 targets (D-174's coordinates, new roles). */
export const TARGETS_REL = "tools/avatar/fixtures/r3-hair/targets-hair-v2.json";
export const TARGETS_SHA256 = "8c3b24e8404d3ccf44160108eaf13cd58cdb66c6705f503a6415b49a151864cc";
/** D-148: the adopted R3 head geometry, the scalp/ear reference for HP4, HP5, HP8 and HP-FRAG. */
export const HEAD_GEOMETRY_REL = "tools/avatar/fixtures/r3-head-geometry/r3-head-geometry-g1v3-e2-v1.png";
const BUILD = join(REPO, "tools", "avatar", "build");
const inside = (child, parent) => { const r = relative(parent, child); return r !== "" && !r.startsWith("..") && !isAbsolute(r); };
const W = 1024, H = 1536;

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, a) => (v.startsWith("--") ? [...acc, [v.slice(2), a[i + 1]]] : acc), []));
const stop = (report) => { process.stdout.write(JSON.stringify({ verdict: "REJECT", outputWritten: false, ...report }, null, 2) + "\n"); process.exit(2); };
const readBuf = (p, stage) => { try { return readFileSync(resolve(p)); } catch (e) { stop({ stage, code: "UNREADABLE", why: String(e.message) }); } };
const layer = (p, stage) => { const d = decodePng(readBuf(p, stage)); if (!d.ok || d.header.w !== W || d.header.h !== H) stop({ stage, code: "LAYER_INVALID", why: `${p}: need a 1024x1536 RGBA PNG` }); return d.px; };
const pt = (s, k) => { const v = String(s ?? "").split(",").map(Number); if (v.length !== 2 || !v.every(Number.isFinite)) stop({ stage: "args", code: "POINT_INVALID", why: `--${k} needs x,y in sheet px` }); return v; };

if (args["propose-a4"]) {
  const d = decodePng(readBuf(args["propose-a4"], "raw"));
  if (!d.ok || d.header.w !== SHEET.w || d.header.h !== SHEET.h) stop({ stage: "raw", code: "SHEET_INVALID", why: "need a 1024x1024 RGBA sheet" });
  const r = proposeA4(d.px, pt(args.a9, "a9"), pt(args.a10, "a10"));
  process.stdout.write(JSON.stringify({ status: "A4 PROPOSAL ONLY — the reviewer confirms or corrects it; not an annotation, not an approval", units: "sheet px", outputWritten: false, ...r }, null, 2) + "\n");
  process.exit(r.ok ? 0 : 2);
}

const mode = args.mode ?? "production";
if (!["production", "synthetic-test"].includes(mode)) stop({ stage: "args", code: "MODE_NOT_ALLOWED", why: "the CLI runs production or synthetic-test only" });
for (const k of ["sheet", "annotation", "face", "eyes-fixed", "iris", "out"]) if (!args[k]) stop({ stage: "args", code: "MISSING_ARG", why: `--${k} is required` });
if (mode === "synthetic-test" && !args.targets) stop({ stage: "args", code: "MISSING_ARG", why: "--targets is required in synthetic-test mode" });
const OUT = resolve(args.out);
if (existsSync(OUT)) stop({ stage: "args", code: "OUT_EXISTS", why: `refusing to overwrite ${OUT}` });
if (mode === "production" && !inside(OUT, BUILD)) stop({ stage: "args", code: "OUT_NOT_IN_BUILD", why: "production output must go inside the gitignored tools/avatar/build/" });
const readJson = (p) => { try { const b = readFileSync(p); return { ok: true, value: JSON.parse(b.toString("utf8")), sha256: sha256(b) }; } catch (e) { return { ok: false, error: String(e.message) }; } };

const sheet = checkHairSheet(readBuf(args.sheet, "raw"));
if (sheet.verdict === "REJECT") { const { px, ...raw } = sheet; stop({ stage: "raw", code: sheet.firstFailure, raw }); }
const aj = readJson(resolve(args.annotation));
if (!aj.ok) stop({ stage: "annotation", code: "ANNOTATION_JSON_INVALID", why: aj.error });
const tj = readJson(resolve(args.targets ?? join(REPO, ...TARGETS_REL.split("/"))));
if (!tj.ok) stop({ stage: "targets", code: "TARGETS_JSON_INVALID", why: tj.error });
if (mode === "production" && tj.sha256 !== TARGETS_SHA256) stop({ stage: "targets", code: "TARGETS_NOT_PINNED", why: "production uses only the D-179 targets file with its pinned SHA-256" });
const headPx = layer(join(REPO, ...HEAD_GEOMETRY_REL.split("/")), "inputs"), facePx = layer(args.face, "inputs"), eyesFixedPx = layer(args["eyes-fixed"], "inputs"), irisPx = layer(args.iris, "inputs");
const c = composeHair({ sheet, annotation: aj.value, targets: tj.value, mode, headPx, facePx, eyesFixedPx, irisPx });
if (!c.ok) { const { hairPx, ...rest } = c; stop(rest); }
mkdirSync(OUT, { recursive: true });
const files = {};
const save = (name, px) => { const b = encodePng(W, H, px); writeFileSync(join(OUT, name), b); files[name] = sha256(b); };
save("hair-luminance-layer.png", c.hairPx);
for (const [name, token] of Object.entries(HAIR_COLOR_TOKENS)) save(`review-ramp-B-${name}${name === DEFAULT_HAIR_COLOR ? "-DEFAULT" : ""}-REVIEW-ONLY.png`, applyTonalRampB(c.hairPx, token));
const { px, ...rawChecks } = sheet;
writeFileSync(join(OUT, "transform-log.json"), JSON.stringify({
  status: "COMPOSED — NOT A CANDIDATE. Owner visual review required; candidate status is decided separately by the owner. The ramp-B renders are review renders, not assets, and no renderer uses ramp B.",
  decision: "D-179", tool: { id: TOOL_ID, cliSha256: sha256(readFileSync(fileURLToPath(import.meta.url))), librarySha256: sha256(readFileSync(join(HERE, "r3-hair-tool-v2.mjs"))) },
  inputs: { sheet: { file: resolve(args.sheet), sha256: sheet.rawSha256 }, annotation: { file: resolve(args.annotation), sha256: aj.sha256 }, targets: { sha256: tj.sha256 } },
  rawChecks, composition: c.log, files }, null, 2));
process.stdout.write(JSON.stringify({ verdict: "PASS", outputWritten: true, out: OUT, files, seat: c.log.seat, diagnostics: c.log.diagnostics }, null, 2) + "\n");
