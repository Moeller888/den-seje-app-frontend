// R3 hair — composition CLI, D-174 (contract: hairMethod). No network, no credentials, no claims, no image request, no
// candidate promotion, no runtime change.
//
//   RAW CHECK ONLY (writes nothing):
//   node tools/avatar/r3-hair-compose.mjs --check-sheet <hair-sheet.png>
//   COMPOSE:
//   node tools/avatar/r3-hair-compose.mjs --sheet <hair-sheet.png> --annotation <annotation.json> --face <face-layer.png>
//        --eyes-fixed <eyes-fixed-layer.png> --iris <iris-layer.png> --out <NEW dir> [--targets <targets.json>]
//        [--mode production|synthetic-test]
//
// Order: H1..H5 -> annotation + targets (approved) -> fit + placement (HP1, HP2) -> HP4..HP8 on the placed layer against the
// adopted head geometry (tracked, pinned) and the given face/eyes layers. The FIRST failure prints a JSON report, exits 2
// and writes NOTHING. On success it creates the new --out dir with hair-luminance-layer.png, one REVIEW-ONLY tonal-ramp-B
// render per hair token, and transform-log.json. Nothing is a candidate. PRODUCTION mode requires the tracked, pinned
// targets file and an --out inside tools/avatar/build/. Ramp B is offline only: no renderer uses it.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve, dirname, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { checkHairSheet, composeHair, applyTonalRampB, decodePng, encodePng, sha256, TOOL_ID } from "./r3-hair-tool.mjs";
import { HAIR_COLOR_TOKENS, DEFAULT_HAIR_COLOR } from "../../js/avatar-layers.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
/** D-174: the owner-APPROVED hair placement targets. */
export const TARGETS_REL = "tools/avatar/fixtures/r3-hair/targets-hair-v1.json";
export const TARGETS_SHA256 = "c50356b36e4c52246269523bb9247ad21544e0cc57efd54c4b9c60fde12b24c6";
/** D-148: the adopted R3 head geometry (G1V3 + E2 + K4), the scalp/ear reference for HP4, HP5 and HP8. */
export const HEAD_GEOMETRY_REL = "tools/avatar/fixtures/r3-head-geometry/r3-head-geometry-g1v3-e2-v1.png";
const BUILD = join(REPO, "tools", "avatar", "build");
const inside = (child, parent) => { const r = relative(parent, child); return r !== "" && !r.startsWith("..") && !isAbsolute(r); };
const W = 1024, H = 1536;

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, a) => (v.startsWith("--") ? [...acc, [v.slice(2), a[i + 1]]] : acc), []));
const stop = (report) => { process.stdout.write(JSON.stringify({ verdict: "REJECT", outputWritten: false, ...report }, null, 2) + "\n"); process.exit(2); };
const readBuf = (p, stage) => { try { return readFileSync(resolve(p)); } catch (e) { stop({ stage, code: "UNREADABLE", why: String(e.message) }); } };
const strip = ({ px, ...rest }) => rest;
const layer = (p, stage) => { const d = decodePng(readBuf(p, stage)); if (!d.ok || d.header.w !== W || d.header.h !== H) stop({ stage, code: "LAYER_INVALID", why: `${p}: need a 1024x1536 RGBA PNG` }); return d.px; };

if (args["check-sheet"]) {
  const r = checkHairSheet(readBuf(args["check-sheet"], "raw"));
  if (r.verdict === "REJECT") stop({ stage: "raw", code: r.firstFailure, raw: strip(r) });
  process.stdout.write(JSON.stringify({ verdict: r.verdict, outputWritten: false, raw: strip(r) }, null, 2) + "\n");
  process.exit(0);
}

const mode = args.mode ?? "production";
if (!["production", "synthetic-test"].includes(mode)) stop({ stage: "args", code: "MODE_NOT_ALLOWED", why: "the CLI runs production or synthetic-test only" });
for (const k of ["sheet", "annotation", "face", "eyes-fixed", "iris", "out"]) if (!args[k]) stop({ stage: "args", code: "MISSING_ARG", why: `--${k} is required` });
if (mode === "synthetic-test" && !args.targets) stop({ stage: "args", code: "MISSING_ARG", why: "--targets is required in synthetic-test mode" });
const OUT = resolve(args.out);
if (existsSync(OUT)) stop({ stage: "args", code: "OUT_EXISTS", why: `refusing to overwrite ${OUT}` });
if (mode === "production" && !inside(OUT, BUILD)) stop({ stage: "args", code: "OUT_NOT_IN_BUILD", why: "production output must go inside the gitignored tools/avatar/build/" });
const readJson = (p) => { try { const b = readFileSync(p); return { ok: true, value: JSON.parse(b.toString("utf8")), sha256: sha256(b) }; } catch (e) { return { ok: false, error: String(e.message) }; } };

// 1. raw checks
const sheet = checkHairSheet(readBuf(args.sheet, "raw"));
if (sheet.verdict === "REJECT") stop({ stage: "raw", code: sheet.firstFailure, raw: strip(sheet) });
// 2. annotation + targets
const aj = readJson(resolve(args.annotation));
if (!aj.ok) stop({ stage: "annotation", code: "ANNOTATION_JSON_INVALID", why: aj.error });
const tj = readJson(resolve(args.targets ?? join(REPO, ...TARGETS_REL.split("/"))));
if (!tj.ok) stop({ stage: "targets", code: "TARGETS_JSON_INVALID", why: tj.error });
if (mode === "production" && tj.sha256 !== TARGETS_SHA256) stop({ stage: "targets", code: "TARGETS_NOT_PINNED", why: "production uses only the D-174 approved targets file with its pinned SHA-256" });
// 3. layers
const headPx = layer(join(REPO, ...HEAD_GEOMETRY_REL.split("/")), "inputs"), facePx = layer(args.face, "inputs"), eyesFixedPx = layer(args["eyes-fixed"], "inputs"), irisPx = layer(args.iris, "inputs");
// 4. compose + checks
const c = composeHair({ sheet, annotation: aj.value, targets: tj.value, mode, headPx, facePx, eyesFixedPx, irisPx });
if (!c.ok) stop({ stage: c.stage, code: c.code, why: c.why, checks: c.checks, diagnostics: c.diagnostics });
// 5. write (only now)
mkdirSync(OUT, { recursive: true });
const files = {};
const save = (name, px) => { const b = encodePng(W, H, px); writeFileSync(join(OUT, name), b); files[name] = sha256(b); };
save("hair-luminance-layer.png", c.hairPx);
for (const [name, token] of Object.entries(HAIR_COLOR_TOKENS)) save(`review-ramp-B-${name}${name === DEFAULT_HAIR_COLOR ? "-DEFAULT" : ""}-REVIEW-ONLY.png`, applyTonalRampB(c.hairPx, token));
const log = {
  status: "COMPOSED — NOT A CANDIDATE. Owner visual review required; candidate status is decided separately by the owner. The ramp-B renders are review renders, not assets, and no renderer uses ramp B.",
  decision: "D-174",
  tool: { id: TOOL_ID, cliSha256: sha256(readFileSync(fileURLToPath(import.meta.url))), librarySha256: sha256(readFileSync(join(HERE, "r3-hair-tool.mjs"))) },
  inputs: { sheet: { file: resolve(args.sheet), sha256: sheet.rawSha256 }, annotation: { file: resolve(args.annotation), sha256: aj.sha256 }, targets: { sha256: tj.sha256 },
    headGeometry: { file: HEAD_GEOMETRY_REL, sha256: sha256(readFileSync(join(REPO, ...HEAD_GEOMETRY_REL.split("/")))) },
    face: { file: resolve(args.face), sha256: sha256(readFileSync(resolve(args.face))) }, eyesFixed: { file: resolve(args["eyes-fixed"]), sha256: sha256(readFileSync(resolve(args["eyes-fixed"]))) }, iris: { file: resolve(args.iris), sha256: sha256(readFileSync(resolve(args.iris))) } },
  rawChecks: strip(sheet), composition: c.log, files,
};
writeFileSync(join(OUT, "transform-log.json"), JSON.stringify(log, null, 2));
process.stdout.write(JSON.stringify({ verdict: "PASS", outputWritten: true, out: OUT, files, residualMaxPx: c.log.residualMaxPx, diagnostics: c.log.diagnostics }, null, 2) + "\n");
