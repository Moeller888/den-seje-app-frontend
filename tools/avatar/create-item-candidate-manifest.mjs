// 164U — First Avatar Item Candidate Manifest (glasses.round.basic)
// ---------------------------------------------------------------------------
// Turns the approved 164S/164T anchor+mask system and the deterministic procedural
// glasses output into a STRUCTURED, REVIEWABLE item-candidate manifest — WITHOUT
// activating anything in the app, shop, or DB.
//
// It reads the latest build artifacts (anchor template, eyes mask, procedural overlay,
// and the glasses QA report), HARD-GATES on the approved QA thresholds, and writes:
//   tools/avatar/build/items/glasses.round.basic/manifest.json
//
// HARD BOUNDARIES:
//   * Deterministic, NON-AI, NO network, NO OpenAI.
//   * Reads/writes ONLY under tools/avatar/build/* (gitignored QA/build artifacts).
//   * Never writes assets/*, never touches runtime/frontend/DB/RPC/migrations/AVATAR_V2,
//     never creates shop rows.
//   * FAILS LOUD (non-zero exit) if any required input or QA gate is missing/failing.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

// repo-relative path strings (stable, mirrored in the manifest)
const REL = {
  anchors:        "tools/avatar/build/anchors/avatar-anchor-template-v1.json",
  mask:           "tools/avatar/build/masks/mask-eyes-v1.png",
  procOverlay:    "tools/avatar/build/procedural/glasses-procedural-v1.png",
  procComposite:  "tools/avatar/build/procedural/glasses-procedural-composite.png",
  gateClipped:    "tools/avatar/build/ai-test/items/glasses-test-clipped.png",
  gateComposite:  "tools/avatar/build/ai-test/previews/glasses-test-composite.png",
  qaReport:       "tools/avatar/build/ai-test/reports/glasses-test-qa.json",
  sourceScript:   "tools/avatar/generate-procedural-glasses.mjs",
  outDir:         "tools/avatar/build/items/glasses.round.basic",
  manifest:       "tools/avatar/build/items/glasses.round.basic/manifest.json",
};
// absolute path for a repo-relative path (REPO = tools/avatar/../..)
const abs = (rel) => join(HERE, "..", "..", rel);

function fail(msg) {
  console.error(JSON.stringify({ section: "164U create-item-candidate-manifest", status: "FAIL", error: msg }, null, 2));
  process.exit(1);
}

function main() {
  // ---- 1) required inputs must exist ----------------------------------------
  const requiredInputs = [REL.anchors, REL.mask, REL.procOverlay, REL.qaReport];
  const missing = requiredInputs.filter((r) => !existsSync(abs(r)));
  if (missing.length) {
    fail(`Missing required build inputs: ${missing.join(", ")}. Run extract-masks + generate-procedural-glasses + ai-test-item first.`);
  }

  // ---- 2) parse QA report defensively --------------------------------------
  let qa;
  try { qa = JSON.parse(readFileSync(abs(REL.qaReport), "utf8")); }
  catch (e) { return fail(`QA report is not valid JSON (${REL.qaReport}): ${e.message}`); }
  if (!qa || typeof qa !== "object") return fail("QA report parsed to a non-object.");

  const pfi = qa.pupilFrameIntrusion && typeof qa.pupilFrameIntrusion === "object" ? qa.pupilFrameIntrusion : null;
  const metrics = {
    pass: qa.pass,
    pupilFrameIntrusionTotal: pfi ? pfi.total : undefined,
    outsideMaskPx: qa.outsideMaskPx,
    preClipOverflowPx: qa.preClipOverflowPx,
    opaquePx: qa.opaquePx,
  };

  // ---- 3) HARD QA GATES (do not loosen) ------------------------------------
  const gates = [];
  if (metrics.pass !== true)                    gates.push(`pass must be true (got ${JSON.stringify(metrics.pass)})`);
  if (metrics.pupilFrameIntrusionTotal !== 0)   gates.push(`pupilFrameIntrusion.total must be 0 (got ${JSON.stringify(metrics.pupilFrameIntrusionTotal)})`);
  if (metrics.outsideMaskPx !== 0)              gates.push(`outsideMaskPx must be 0 (got ${JSON.stringify(metrics.outsideMaskPx)})`);
  if (metrics.preClipOverflowPx !== 0)          gates.push(`preClipOverflowPx must be 0 (got ${JSON.stringify(metrics.preClipOverflowPx)})`);
  if (!(typeof metrics.opaquePx === "number" && metrics.opaquePx > 0)) gates.push(`opaquePx must be a positive number (got ${JSON.stringify(metrics.opaquePx)})`);
  if (gates.length) return fail(`QA gates not satisfied — manifest NOT written:\n  - ${gates.join("\n  - ")}`);

  // ---- 4) provenance from the anchor template (deterministic, no timestamps) -
  let masterSha256, anchorSchema;
  try {
    const anchors = JSON.parse(readFileSync(abs(REL.anchors), "utf8"));
    masterSha256 = anchors && anchors.source ? anchors.source.sha256 : undefined;
    anchorSchema = anchors ? anchors.schema : undefined;
  } catch (e) { return fail(`Anchor template is not valid JSON (${REL.anchors}): ${e.message}`); }

  // ---- 5) build the candidate manifest -------------------------------------
  const lensError = qa.lensError && typeof qa.lensError === "object" ? qa.lensError : null;
  const manifest = {
    schema: "avatar-item-candidate/v1",
    itemId: "glasses.round.basic",
    displayName: "Basic Round Glasses",
    slot: "glasses",
    maskSlot: "eyes",                 // the underlying eyes-slot mask drives clipping
    equipmentType: "glasses.round",
    generator: "procedural",
    generationType: "deterministic-local",
    sourceScript: REL.sourceScript,
    anchorDependency: REL.anchors,
    maskDependency: REL.mask,
    provenance: {
      masterSha256: masterSha256 || null,
      anchorSchema: anchorSchema || null,
      anchorCalibration: "164S eye semantics + 164T eye-box/front-slot recalibration",
      note: "Build artifacts are regenerable; this manifest references them, it does not embed them.",
    },
    outputImagePaths: {
      proceduralOverlay: REL.procOverlay,
      proceduralComposite: REL.procComposite,
      gateClipped: REL.gateClipped,
      gateComposite: REL.gateComposite,
    },
    qaReportPath: REL.qaReport,
    qaMetricsSummary: {
      pass: metrics.pass,
      pupilFrameIntrusionTotal: metrics.pupilFrameIntrusionTotal,
      outsideMaskPx: metrics.outsideMaskPx,
      preClipOverflowPx: metrics.preClipOverflowPx,
      opaquePx: metrics.opaquePx,
      lensErrorLeftPx: lensError && lensError.left ? lensError.left.errorPx : undefined,
      lensErrorRightPx: lensError && lensError.right ? lensError.right.errorPx : undefined,
    },
    humanReviewRequired: true,
    status: "candidate",
    runtimeActivated: false,
    shopActivated: false,
    dbRowsCreated: false,
    av2Required: false,
    notes: [
      "164U: first canonical avatar item CANDIDATE for glasses.round.basic. NOT active anywhere.",
      "Base geometry is procedural/deterministic (no AI, no network) per 164Q.3/164R decision.",
      "Outputs live ONLY under tools/avatar/build/* (gitignored, regenerable) — NEVER under assets/*.",
      "Activation in runtime/shop/DB and any AVATAR_V2 work are SEPARATE, later, human-gated steps.",
      "lensError is a coarse half-centroid proxy (164P typed lens-centre fitter not yet built); not gated.",
    ],
  };

  // ---- 6) write manifest under build/items only ----------------------------
  mkdirSync(abs(REL.outDir), { recursive: true });
  writeFileSync(abs(REL.manifest), JSON.stringify(manifest, null, 2));

  console.log(JSON.stringify({
    section: "164U create-item-candidate-manifest",
    status: "OK",
    manifest: REL.manifest,
    itemId: manifest.itemId,
    qaMetricsSummary: manifest.qaMetricsSummary,
    runtimeActivated: false, shopActivated: false, dbRowsCreated: false, av2Required: false,
    humanReviewRequired: true,
  }, null, 2));
}

main();
