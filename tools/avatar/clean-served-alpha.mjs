// The orphan-dust cleanup, applied AFTER downscaleHalf() — at served scale.
// ---------------------------------------------------------------------------------------------
// WHY A SECOND PASS EXISTS AT ALL
// The authoring cleanup runs at 1024×1536 and leaves that canvas clean. The promotion downscale
// then averages each 2×2 block, and that average CREATES new orphan-soft pixels: four authoring
// pixels, none of them isolated, can collapse into one served pixel that IS isolated in the
// coarser grid. Measured on two candidates, that is where most of the residue comes from —
//   short: 18 of 21 remaining served components were born in the downscale, 3 survived from authoring
//   afro:   9 of 11                    ditto,                               2 survived
// and in both, every single component sat one pixel from ink, along the silhouette edge, never
// free in transparent space. It is an artefact of the scaling, not dust in the artwork.
//
// THE RULE IS NOT NEW. This applies `cleanAlpha` — the same function, the same ALPHA_FLOOR, the
// same four-orthogonal-neighbour definition of orphan-soft — to the served buffer. Nothing about
// what may be removed changes; only the grid it is measured on. A cleanup that invented a second,
// looser rule for the smaller canvas would be exactly the kind of drift the shared definition in
// check-r2-hair-candidate.mjs exists to prevent.
//
// WHAT THIS TOOL DELIBERATELY DOES NOT DO
// It changes NO gate and NO postcondition. `clean-r2-hair-alpha.mjs` still refuses on its own
// served budget, and `check-r2-hair-candidate.mjs` still measures the served orphans of the
// UNCLEANED downscale. Whether those two should instead measure the post-cleanup buffer is a
// decision about what a gate means, and it is not this tool's to take. Until that decision is
// made, this produces a reference for review and nothing more: it promotes nothing, registers
// nothing, and writes no runtime asset.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng, encodePngRGBA } from "./build-r2-torso-occlusion-mask.mjs";
import { downscaleHalf } from "./promote-r2-torso-asset.mjs";
import { cleanAlpha, ALPHA_FLOOR, SRC_W, SRC_H, checkWritePath } from "./clean-r2-hair-alpha.mjs";
import { countOrphanSoft, isOrphanSoft, ALPHA_INK, HALO_TOLERANCE_SERVED } from "./check-r2-hair-candidate.mjs";

export const TOOL = "clean-served-alpha";
export const TOOL_VERSION = "1.0.0";
export const OUT_W = SRC_W >> 1, OUT_H = SRC_H >> 1;   // 512 × 768

const sha = (b) => createHash("sha256").update(b).digest("hex");

/**
 * Pure. Runs the WHOLE documented chain on an authoring canvas:
 *
 *     authoring RGBA → cleanAlpha (authoring scale) → downscaleHalf → cleanAlpha (served scale)
 *
 * The authoring pass is included deliberately. `downscaleHalf` operates on the CLEANED authoring
 * image in the real pipeline, so a tool that downscaled the raw input would be measuring a
 * composition that never happens. Taking the raw canvas and running both passes also means this
 * works for a candidate whose authoring cleanup REFUSED to write — which is exactly the case that
 * motivated the second pass.
 *
 * `served` is the downscale before the second pass; `cleaned` is it after.
 */
export function servedPass(authoringRgba, w, h) {
  const { rgba: authoringCleaned, report: authoringReport } = cleanAlpha(authoringRgba, w, h);
  const served = downscaleHalf(w, h, authoringCleaned);
  const sw = w >> 1, sh = h >> 1;
  const { rgba: cleaned, report } = cleanAlpha(served, sw, sh);
  return { served, cleaned, sw, sh, report, authoringReport, authoringCleaned };
}

/** Every check that must hold before anything is written. Returns a list of failures. */
export function postconditions(served, cleaned, sw, sh) {
  const fail = [];
  const add = (id, ok, value) => { if (!ok) fail.push(`${id}=${JSON.stringify(value)}`); };

  const after = countOrphanSoft(cleaned, sw, sh);
  add("servedWithinBudget", after <= HALO_TOLERANCE_SERVED, after);

  let ink0 = 0, ink1 = 0, aboveFloor = 0, aboveInk = 0, withNeighbour = 0, notCleared = 0, other = 0;
  for (let i = 0; i < served.length; i += 4) {
    const a0 = served[i + 3], a1 = cleaned[i + 3];
    if (a0 >= ALPHA_INK) ink0++;
    if (a1 >= ALPHA_INK) ink1++;
    if (a0 === a1) {
      // an untouched pixel must be untouched in ALL four channels
      if (served[i] !== cleaned[i] || served[i + 1] !== cleaned[i + 1] || served[i + 2] !== cleaned[i + 2]) other++;
      continue;
    }
    const p = i / 4, x = p % sw, y = (p - x) / sw;
    if (a0 >= ALPHA_FLOOR) aboveFloor++;
    if (a0 >= ALPHA_INK) aboveInk++;
    if (!isOrphanSoft(served, sw, sh, x, y)) withNeighbour++;
    if (a1 !== 0 || cleaned[i] !== 0 || cleaned[i + 1] !== 0 || cleaned[i + 2] !== 0) notCleared++;
  }
  add("geometryIdentical", ink0 === ink1, { before: ink0, after: ink1 });
  add("noChangeAtOrAboveAlphaFloor", aboveFloor === 0, aboveFloor);
  add("noChangeAtOrAboveInk", aboveInk === 0, aboveInk);
  add("noChangeWithInkNeighbour", withNeighbour === 0, withNeighbour);
  add("allRemovedFullyTransparent", notCleared === 0, notCleared);
  add("nonQualifyingBytesUntouched", other === 0, other);

  // A second pass must find nothing left to do, or the rule is not converging.
  const { report: again } = cleanAlpha(cleaned, sw, sh);
  add("idempotent", again.pixelsChanged === 0, again.pixelsChanged);

  return fail;
}

/** Fail-closed: everything is computed and checked before a byte reaches disk. */
export function run(inPath, outPath, repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")) {
  const inAbs = resolve(repoRoot, inPath), outAbs = resolve(repoRoot, outPath);
  if (inAbs === outAbs) throw new Error("REFUSED: input and output are the same file");
  const why = checkWritePath(outAbs, repoRoot);
  if (why) throw new Error(`REFUSED: output ${why}`);
  if (existsSync(outAbs)) throw new Error(`REFUSED: output already exists: ${outPath}`);
  if (!existsSync(inAbs)) throw new Error(`input not found: ${inPath}`);

  const srcBuf = readFileSync(inAbs);
  const png = decodePng(srcBuf, "authoring");
  if (png.w !== SRC_W || png.h !== SRC_H) {
    throw new Error(`REFUSED: expected ${SRC_W}x${SRC_H} authoring canvas, got ${png.w}x${png.h}`);
  }

  const { served, cleaned, sw, sh, report } = servedPass(png.rgba, png.w, png.h);
  const before = countOrphanSoft(served, sw, sh);
  const after = countOrphanSoft(cleaned, sw, sh);

  const failures = postconditions(served, cleaned, sw, sh);
  const outBuf = encodePngRGBA(sw, sh, cleaned);
  const rt = decodePng(outBuf, "roundtrip");
  if (Buffer.compare(Buffer.from(rt.rgba), Buffer.from(cleaned)) !== 0) failures.push("encodedRoundTripsExactly=false");
  if (failures.length) throw new Error(`REFUSED: postcondition failed, nothing written — ${failures.join(", ")}`);

  mkdirSync(dirname(outAbs), { recursive: true });
  writeFileSync(outAbs, outBuf);
  return {
    tool: TOOL, toolVersion: TOOL_VERSION,
    input: { path: inPath, sha256: sha(srcBuf), width: png.w, height: png.h },
    output: { path: outPath, sha256: sha(outBuf), width: sw, height: sh },
    servedOrphans: { before, after, tolerance: HALO_TOLERANCE_SERVED },
    cleared: report.pixelsChanged, components: report.removedComponents, maxRemovedAlpha: report.maxRemovedAlpha,
    note: "Reference for review only. No gate, postcondition, manifest or runtime asset is affected.",
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [, , inP, outP] = process.argv;
  if (!inP || !outP) { console.error(`usage: node tools/avatar/${TOOL}.mjs <authoring.png> <served-out.png>`); process.exit(1); }
  try {
    const r = run(inP, outP);
    console.log(`${TOOL} v${r.toolVersion}`);
    console.log(`  in   ${r.input.width}x${r.input.height}  ${r.input.sha256}`);
    console.log(`  out  ${r.output.width}x${r.output.height}  ${r.output.sha256}`);
    console.log(`  served orphans ${r.servedOrphans.before} → ${r.servedOrphans.after}  (max ${r.servedOrphans.tolerance})`);
    console.log(`  cleared ${r.cleared} px in ${r.components} components, max removed alpha ${r.maxRemovedAlpha}`);
    console.log(`  ${r.note}`);
  } catch (err) { console.error(String(err.message ?? err)); process.exit(1); }
}
