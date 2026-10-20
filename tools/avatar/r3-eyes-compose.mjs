// R3 eyes — composition CLI, D-169 (contract: eyesPartsMethod). No network, no credentials, no claims, no image request,
// no candidate promotion.
//
//   RAW CHECK ONLY (writes nothing):
//   node tools/avatar/r3-eyes-compose.mjs --check-fixed <eyes-fixed.png>
//   node tools/avatar/r3-eyes-compose.mjs --check-iris <iris.png>
//   FIXED STAGE (A is placed and reviewed before B is requested):
//   node tools/avatar/r3-eyes-compose.mjs --fixed <eyes-fixed.png> --annotation <annotation.json> --out <NEW dir>
//        [--targets <targets.json>] [--mode production|synthetic-test]
//   PAIR STAGE:
//   node tools/avatar/r3-eyes-compose.mjs --fixed <eyes-fixed.png> --iris <iris.png> --annotation <annotation.json> --out <NEW dir>
//        [--targets <targets.json>] [--mode production|synthetic-test]
//
// Order: E1..E5 (+ I1..I5) -> annotation + targets (approved) -> fit + placement -> P1..P6 (P7 diagnostic). The FIRST failure
// prints a JSON report, exits 2 and writes NOTHING. On success it creates the new --out dir with eyes-fixed-layer.png
// (+ iris-luminance-layer.png and review-tinted-pair-REVIEW-ONLY.png in the pair stage) and transform-log.json. No layer is
// a candidate. Raw sheets are only read. PRODUCTION mode additionally requires the tracked, pinned targets file (whose status
// must be APPROVED — the D-169 file is DRAFT, so production refuses until a later owner decision) and an --out inside
// tools/avatar/build/.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve, dirname, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { checkFixedSheet, checkIrisSheet, composeEyes, tintedReviewPair, encodePng, sha256, TOOL_ID } from "./r3-eyes-tool.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
/** D-169: the eye target points (tools/avatar/fixtures/r3-eyes/targets-eyes-v1.json), status DRAFT. */
export const TARGETS_REL = "tools/avatar/fixtures/r3-eyes/targets-eyes-v1.json";
export const TARGETS_SHA256 = "09848f0e5ae87de1b1fbdf8a9102ec3125cf2e21a1cc6324a7ed1bcbad19a88c";
const BUILD = join(REPO, "tools", "avatar", "build");
const inside = (child, parent) => { const r = relative(parent, child); return r !== "" && !r.startsWith("..") && !isAbsolute(r); };
const W = 1024, H = 1536;

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, a) => (v.startsWith("--") ? [...acc, [v.slice(2), a[i + 1]]] : acc), []));
const stop = (report) => { process.stdout.write(JSON.stringify({ verdict: "REJECT", outputWritten: false, ...report }, null, 2) + "\n"); process.exit(2); };
const readBuf = (p, stage) => { try { return readFileSync(resolve(p)); } catch (e) { stop({ stage, code: "UNREADABLE", why: String(e.message) }); } };
const strip = ({ px, openingLabels, openings, irises, ...rest }) => rest;

if (args["check-fixed"] || args["check-iris"]) {
  if (args["check-fixed"] && args["check-iris"]) stop({ stage: "args", code: "ONE_CHECK_AT_A_TIME" });
  const r = args["check-fixed"] ? checkFixedSheet(readBuf(args["check-fixed"], "raw")) : checkIrisSheet(readBuf(args["check-iris"], "raw"));
  if (r.verdict === "REJECT") stop({ stage: "raw", code: r.firstFailure, raw: strip(r) });
  process.stdout.write(JSON.stringify({ verdict: r.verdict, outputWritten: false, raw: strip(r) }, null, 2) + "\n");
  process.exit(0);
}

const mode = args.mode ?? "production";
if (!["production", "synthetic-test"].includes(mode)) stop({ stage: "args", code: "MODE_NOT_ALLOWED", why: "the CLI runs production or synthetic-test only" });
for (const k of ["fixed", "annotation", "out"]) if (!args[k]) stop({ stage: "args", code: "MISSING_ARG", why: `--${k} is required` });
if (mode === "synthetic-test" && !args.targets) stop({ stage: "args", code: "MISSING_ARG", why: "--targets is required in synthetic-test mode" });
const OUT = resolve(args.out);
if (existsSync(OUT)) stop({ stage: "args", code: "OUT_EXISTS", why: `refusing to overwrite ${OUT}` });
if (mode === "production" && !inside(OUT, BUILD)) stop({ stage: "args", code: "OUT_NOT_IN_BUILD", why: "production output must go inside the gitignored tools/avatar/build/" });
const readJson = (p) => { try { const b = readFileSync(p); return { ok: true, value: JSON.parse(b.toString("utf8")), sha256: sha256(b) }; } catch (e) { return { ok: false, error: String(e.message) }; } };

// 1. raw checks
const fixed = checkFixedSheet(readBuf(args.fixed, "raw"));
if (fixed.verdict === "REJECT") stop({ stage: "raw", sheet: "eyes-fixed", code: fixed.firstFailure, raw: strip(fixed) });
let iris = null;
if (args.iris) { iris = checkIrisSheet(readBuf(args.iris, "raw")); if (iris.verdict === "REJECT") stop({ stage: "raw", sheet: "iris", code: iris.firstFailure, raw: strip(iris) }); }
// 2. annotation + targets
const aj = readJson(resolve(args.annotation));
if (!aj.ok) stop({ stage: "annotation", code: "ANNOTATION_JSON_INVALID", why: aj.error });
const targetsPath = resolve(args.targets ?? join(REPO, ...TARGETS_REL.split("/")));
const tj = readJson(targetsPath);
if (!tj.ok) stop({ stage: "targets", code: "TARGETS_JSON_INVALID", why: tj.error });
if (mode === "production" && tj.sha256 !== TARGETS_SHA256) stop({ stage: "targets", code: "TARGETS_NOT_PINNED", why: "production uses only the D-169 targets file with its pinned SHA-256" });
// 3. compose + P-checks
const c = composeEyes({ fixed, iris, annotation: aj.value, targets: tj.value, mode });
if (!c.ok) stop({ stage: c.stage, code: c.code, why: c.why });
// 4. write (only now)
mkdirSync(OUT, { recursive: true });
const files = {};
const save = (name, px) => { const b = encodePng(W, H, px); writeFileSync(join(OUT, name), b); files[name] = sha256(b); };
save("eyes-fixed-layer.png", c.fixedPx);
if (c.irisPx) { save("iris-luminance-layer.png", c.irisPx); save("review-tinted-pair-REVIEW-ONLY.png", tintedReviewPair(c.fixedPx, c.irisPx)); }
const log = {
  status: "COMPOSED — NOT A CANDIDATE. Owner visual review required against Northstar (D-136 render pair); candidate status is decided separately by the owner.",
  decision: "D-169",
  tool: { id: TOOL_ID, cliSha256: sha256(readFileSync(fileURLToPath(import.meta.url))), librarySha256: sha256(readFileSync(join(HERE, "r3-eyes-tool.mjs"))), partsLibrarySha256: sha256(readFileSync(join(HERE, "r3-face-parts-tool.mjs"))), node: process.version },
  inputs: { fixedSheet: { file: resolve(args.fixed), sha256: fixed.rawSha256 }, irisSheet: iris ? { file: resolve(args.iris), sha256: iris.rawSha256 } : null, annotation: { file: resolve(args.annotation), sha256: aj.sha256 }, targets: { file: targetsPath, sha256: tj.sha256, status: tj.value.status } },
  rawChecks: { fixed: strip(fixed), iris: iris ? strip(iris) : null, irisCentroids: iris ? iris.irises : null }, composition: c.log, files,
  reviewRender: c.irisPx ? "review-tinted-pair-REVIEW-ONLY.png: round(Y/255 x R3_IRIS_DEFAULT) under the fixed layer — a review render, not an asset" : null,
};
writeFileSync(join(OUT, "transform-log.json"), JSON.stringify(log, null, 2));
process.stdout.write(JSON.stringify({ verdict: "PASS", stage: c.stage, outputWritten: true, out: OUT, files, residualsPx: { fixed: c.log.fixed.residualMaxPx, iris: c.log.iris?.residualMaxPx ?? null }, diagnosticsP7: c.log.diagnosticsP7 }, null, 2) + "\n");
