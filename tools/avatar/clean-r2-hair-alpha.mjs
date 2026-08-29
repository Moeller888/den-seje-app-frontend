// R2 hair candidate — deterministic orphan-dust removal (NON-AI, no network, no randomness)
// ---------------------------------------------------------------------------------------------
// WHAT THIS REMOVES, AND NOTHING ELSE
// A generated hair candidate carries thousands of isolated pixels at 1–3 % opacity: numerical dust
// from the image model's encoder, not artwork. Measured on the afro candidate: 5 938 orphan-soft
// pixels at authoring scale, mean alpha 2.4/255, 97 % of them at alpha <= 8. They are invisible,
// and they were the only thing between a geometrically correct candidate and the alpha gate.
//
// A pixel is cleared if and ONLY if BOTH hold ON THE ORIGINAL INPUT:
//   1. alpha < ALPHA_FLOOR (24)
//   2. it is orphan-soft by the ONE shared definition exported from check-r2-hair-candidate.mjs
// A cleared pixel becomes 0,0,0,0. Every other byte is copied unchanged.
//
// WHY 24, AND WHY IT WAS NOT TUNED HERE
// ALPHA_FLOOR = 24 is the project's existing threshold from openai-generate-torso-item.mjs
// ("below this, a pixel is background glow rather than artwork"). It was chosen for the torso work,
// before any hair candidate existed, and is reused unchanged. Deliberately not fitted to the afro:
// a threshold picked to make one asset pass proves nothing about the next one.
//
// FAIL-CLOSED
// Everything is computed and validated BEFORE anything is written. If any postcondition fails the
// tool throws and writes no file at all — not the PNG, not the sidecar, not a partial. A sidecar
// with `pass: true` can therefore only exist if every check actually ran and actually held.
//
// WHERE IT MAY WRITE
// A positive allowlist: output must resolve inside tools/avatar/build/alpha-cleanup/ and nowhere
// else. A blacklist was tried first and was wrong — it happily allowed docs/, index.html,
// package.json and paths outside the repository entirely.
//
// The allowlist is resolved through SYMLINKS, not merely lexically. resolve() + relative() answer
// a question about strings; the filesystem answers a different one. `build/` is gitignored scratch
// that tools create and delete freely, so a link planted inside it — or a link left at the output
// path itself — would satisfy a string check and still land the bytes anywhere on disk. A DANGLING
// link is the sharp case: existsSync() reports false, so the "already exists" guard waves it
// through and the write follows the link out of the tree. Both files are therefore created with
// O_EXCL, which refuses to follow a symlink at the final component at all.
//
// WHY THE COMMIT IS ORDERED, NOT MERELY GUARDED
// Two files cannot be published in one atomic step. Both are written to temporaries, fsynced and
// renamed, and the SIDECAR IS RENAMED FIRST. The two crash residues are not equally bad: a report
// with no image is obviously incomplete and refuses the next run, whereas an image with no report
// looks exactly like a validated output while carrying no evidence that anything was checked. The
// ordering makes only the harmless residue reachable.
//
// WHAT THIS IS NOT
// Not a repair, not a fit, not an approval. Passing the alpha gate afterwards is a PRECONDITION
// for owner review at real render scale (D-059, D-105), never a substitute for it.
import {
  readFileSync, existsSync, mkdirSync, realpathSync, lstatSync,
  openSync, writeSync, fsyncSync, closeSync, renameSync, unlinkSync,
} from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { dirname, resolve, relative, join, isAbsolute, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng, encodePngRGBA } from "./build-r2-torso-occlusion-mask.mjs";
import { downscaleHalf } from "./promote-r2-torso-asset.mjs";
import {
  analyse, isOrphanSoft, countOrphanSoft, ALPHA_INK,
  HALO_TOLERANCE_AUTHORING, HALO_TOLERANCE_SERVED,
} from "./check-r2-hair-candidate.mjs";

export const TOOL = "clean-r2-hair-alpha";
export const TOOL_VERSION = "3.0.0";

// Reused unchanged from openai-generate-torso-item.mjs. Do not tune.
export const ALPHA_FLOOR = 24;

export const SRC_W = 1024, SRC_H = 1536;

// The ONLY directory this tool may write into, relative to the repository root.
export const WRITE_ROOT = join("tools", "avatar", "build", "alpha-cleanup");
export const SIDECAR_SUFFIX = ".alpha-report.json";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(join(HERE, "..", ".."));

/**
 * Resolves the deepest ANCESTOR of `abs` that exists, and returns it with the not-yet-existing
 * tail re-attached. realpathSync() throws ENOENT on a path that is not there yet, and the output
 * never is — so the link-following has to happen on the part of the path that does exist.
 *
 * `realpath` is injectable so the policy can be exercised on machines where creating a symlink
 * needs a privilege this one does not have (Windows without developer mode returns EPERM). The
 * real filesystem behaviour is asserted separately wherever links can actually be created.
 */
export function resolveThroughLinks(abs, realpath = realpathSync) {
  let cur = abs;
  const tail = [];
  for (;;) {
    try {
      return tail.length === 0 ? realpath(cur) : join(realpath(cur), ...tail.reverse());
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
    const parent = dirname(cur);
    if (parent === cur) return abs;         // reached the root without finding anything that exists
    tail.push(basename(cur));
    cur = parent;
  }
}

/**
 * Positive allowlist. Returns null when the path is acceptable, otherwise the reason it is not.
 *
 * Two questions, both of which must hold. The LEXICAL one — resolve() + relative() — rejects a
 * path whose relative form starts with ".." or is absolute, which covers `..` traversal, a sibling
 * repository and anything outside the tree. The PHYSICAL one repeats the test after following
 * symlinks on both sides, because the lexical answer is about strings and the write is not: a link
 * planted anywhere along the path would otherwise satisfy the first check and defeat the second.
 */
export function checkWritePath(p, repoRoot = REPO_ROOT, realpath = realpathSync) {
  const abs = resolve(repoRoot, p);
  const root = resolve(repoRoot, WRITE_ROOT);

  const rel = relative(root, abs);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
    return `outside the only writable directory (${WRITE_ROOT.replace(/\\/g, "/")})`;
  }

  // The physical test is anchored on the REPOSITORY root, and the write root is re-derived from it
  // lexically. Resolving the write root through links instead would be self-defeating: if that
  // directory is itself a link to /tmp/attacker, both sides resolve to /tmp/attacker, the two
  // agree, and the escape is waved through precisely when it succeeded.
  const realAbs = resolveThroughLinks(abs, realpath);
  const realRoot = join(resolveThroughLinks(resolve(repoRoot), realpath), WRITE_ROOT);
  const realRel = relative(realRoot, realAbs);
  if (realRel === "" || realRel.startsWith("..") || isAbsolute(realRel)) {
    return `outside the only writable directory once symlinks are resolved ` +
           `(${WRITE_ROOT.replace(/\\/g, "/")})`;
  }
  return null;
}

export function isAllowedWritePath(p, repoRoot = REPO_ROOT, realpath = realpathSync) {
  return checkWritePath(p, repoRoot, realpath) === null;
}

/**
 * Creates a file that must not already exist, and refuses to follow a symlink to do it.
 *
 * "wx" is O_CREAT|O_EXCL: the kernel fails with EEXIST if the final component is anything at all,
 * INCLUDING a dangling symlink — which is exactly the case existsSync() reports as absent. The
 * fsync is what makes the later rename meaningful; without it the rename can be durable while the
 * contents behind it are not.
 */
/** True if ANYTHING occupies the path — a file, a directory, or a symlink of either kind. */
export function pathPresent(p) {
  try { lstatSync(p); return true; } catch { return false; }
}

function writeNewFileSync(path, data) {
  const fd = openSync(path, "wx");
  try {
    writeSync(fd, data);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

export function sidecarPathFor(pngPath) {
  return pngPath.replace(/\.png$/i, SIDECAR_SUFFIX);
}

/**
 * Pure. Returns { rgba, report }; never mutates `src`.
 * Every decision reads `src`, so clearing one pixel can never make a neighbour newly orphaned
 * within the same run: no cascade, and the result does not depend on scan order.
 */
export function cleanAlpha(src, w, h) {
  const out = Buffer.from(src);
  const histogram = new Map();
  let changed = 0, maxRemovedAlpha = 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = src[i + 3];
      if (a >= ALPHA_FLOOR) continue;                 // rule 1, against the ORIGINAL
      if (!isOrphanSoft(src, w, h, x, y)) continue;   // rule 2, against the ORIGINAL
      out[i] = 0; out[i + 1] = 0; out[i + 2] = 0; out[i + 3] = 0;
      changed++;
      if (a > maxRemovedAlpha) maxRemovedAlpha = a;
      histogram.set(a, (histogram.get(a) ?? 0) + 1);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  // 4-connected components of the removed set — dust should be scattered, not a solid region.
  let components = 0;
  if (changed > 0) {
    const removed = new Uint8Array(w * h);
    for (let p = 0; p < w * h; p++) if (src[p * 4 + 3] !== 0 && out[p * 4 + 3] === 0) removed[p] = 1;
    const seen = new Uint8Array(w * h);
    for (let p = 0; p < w * h; p++) {
      if (!removed[p] || seen[p]) continue;
      components++;
      seen[p] = 1;
      const stack = [p];
      while (stack.length) {
        const q = stack.pop(), qx = q % w, qy = (q / w) | 0;
        for (const [nx, ny] of [[qx - 1, qy], [qx + 1, qy], [qx, qy - 1], [qx, qy + 1]]) {
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const r = ny * w + nx;
          if (removed[r] && !seen[r]) { seen[r] = 1; stack.push(r); }
        }
      }
    }
  }

  // Independent audit: recomputed from src vs out, not trusted from the loop above.
  let atOrAboveFloor = 0, atOrAboveInk = 0, withInkNeighbour = 0, notFullyCleared = 0, otherBytesChanged = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (out[i] === src[i] && out[i + 1] === src[i + 1] &&
          out[i + 2] === src[i + 2] && out[i + 3] === src[i + 3]) continue;
      const a = src[i + 3];
      if (a >= ALPHA_FLOOR) atOrAboveFloor++;
      if (a >= ALPHA_INK) atOrAboveInk++;
      if (!isOrphanSoft(src, w, h, x, y)) withInkNeighbour++;
      if (!(out[i] === 0 && out[i + 1] === 0 && out[i + 2] === 0 && out[i + 3] === 0)) notFullyCleared++;
      if (a >= ALPHA_FLOOR || !isOrphanSoft(src, w, h, x, y)) otherBytesChanged++;
    }
  }

  return {
    rgba: out,
    report: {
      alphaFloor: ALPHA_FLOOR,
      inkThreshold: ALPHA_INK,
      pixelsChanged: changed,
      maxRemovedAlpha,
      removedAlphaHistogram: Object.fromEntries([...histogram.entries()].sort((a, b) => a[0] - b[0])),
      removedBoundingBox: changed ? { minX, minY, maxX, maxY } : null,
      removedComponents: components,
      invariants: {
        changedAtOrAboveAlphaFloor: atOrAboveFloor,
        changedAtOrAboveInk: atOrAboveInk,
        changedWithInkNeighbour: withInkNeighbour,
        changedToSomethingOtherThanFullyTransparent: notFullyCleared,
        nonQualifyingBytesChanged: otherBytesChanged,
      },
    },
  };
}

const sha = (b) => createHash("sha256").update(b).digest("hex");

function geometryOf(rgba, w, h) {
  const a = analyse(rgba, w, h);
  return { ink: a.ink, envelope: a.envelope, components: a.components, meanSat: a.meanSat, peakSat: a.peakSat };
}

/**
 * Computes everything, validates everything, and only then writes. Throws before any write if a
 * postcondition fails, so a rejected candidate leaves the filesystem exactly as it was.
 */
export function run(inPath, outPath, repoRoot = REPO_ROOT) {
  const inAbs = resolve(repoRoot, inPath);
  const outAbs = resolve(repoRoot, outPath);
  const sidecarAbs = sidecarPathFor(outAbs);

  // ── path contract, before anything is read ────────────────────────────────────────────────
  if (inAbs === outAbs) throw new Error("REFUSED: input and output are the same file");
  if (extname(outAbs).toLowerCase() !== ".png") {
    throw new Error(`REFUSED: output must end in .png, got "${extname(outAbs) || "(no extension)"}"`);
  }
  const whyOut = checkWritePath(outAbs, repoRoot);
  if (whyOut) throw new Error(`REFUSED: output ${whyOut}`);
  const whySide = checkWritePath(sidecarAbs, repoRoot);
  if (whySide) throw new Error(`REFUSED: sidecar ${whySide}`);
  if (sidecarAbs === outAbs) throw new Error("REFUSED: sidecar path collides with the PNG path");
  if (!sidecarAbs.toLowerCase().endsWith(SIDECAR_SUFFIX)) {
    throw new Error(`REFUSED: sidecar must end in ${SIDECAR_SUFFIX}`);
  }
  // lstat, not existsSync: existsSync() follows the link and reports FALSE for a dangling one, so
  // it is blind to precisely the plant that would redirect the write out of the tree.
  if (pathPresent(outAbs)) throw new Error(`REFUSED: output already exists: ${outPath}`);
  if (pathPresent(sidecarAbs)) throw new Error(`REFUSED: sidecar already exists: ${sidecarPathFor(outPath)}`);
  if (!existsSync(inAbs)) throw new Error(`input not found: ${inPath}`);

  // ── read and measure ─────────────────────────────────────────────────────────────────────
  const srcBuf = readFileSync(inAbs);
  const png = decodePng(srcBuf, "candidate");
  if (png.w !== SRC_W || png.h !== SRC_H) {
    throw new Error(`REFUSED: expected ${SRC_W}x${SRC_H} authoring canvas, got ${png.w}x${png.h}`);
  }

  // downscaleHalf returns a RAW RGBA Buffer; the served canvas is w>>1 by h>>1.
  const sw = png.w >> 1, sh = png.h >> 1;

  const before = geometryOf(png.rgba, png.w, png.h);
  const beforeAuthoring = countOrphanSoft(png.rgba, png.w, png.h);
  const beforeServed = countOrphanSoft(downscaleHalf(png.w, png.h, png.rgba), sw, sh);

  const { rgba, report } = cleanAlpha(png.rgba, png.w, png.h);

  const after = geometryOf(rgba, png.w, png.h);
  const afterAuthoring = countOrphanSoft(rgba, png.w, png.h);
  const afterServed = countOrphanSoft(downscaleHalf(png.w, png.h, rgba), sw, sh);
  const geometryIdentical = JSON.stringify(before) === JSON.stringify(after);

  // Encode, then decode the encoded bytes back and compare — proves the PNG we are about to write
  // actually round-trips to the pixels that were validated, rather than to something else.
  const outBuf = encodePngRGBA(png.w, png.h, rgba);
  const rt = decodePng(outBuf, "encoded output");
  const roundTripOk = rt.w === png.w && rt.h === png.h && Buffer.compare(Buffer.from(rt.rgba), Buffer.from(rgba)) === 0;

  // ── postconditions — every one evaluated, then all of them required ───────────────────────
  const postconditions = {
    authoringWithinBudget: { pass: afterAuthoring <= HALO_TOLERANCE_AUTHORING, value: afterAuthoring, limit: HALO_TOLERANCE_AUTHORING },
    servedWithinBudget: { pass: afterServed <= HALO_TOLERANCE_SERVED, value: afterServed, limit: HALO_TOLERANCE_SERVED },
    geometryIdentical: { pass: geometryIdentical, value: geometryIdentical },
    noChangeAtOrAboveAlphaFloor: { pass: report.invariants.changedAtOrAboveAlphaFloor === 0, value: report.invariants.changedAtOrAboveAlphaFloor },
    noChangeAtOrAboveInk: { pass: report.invariants.changedAtOrAboveInk === 0, value: report.invariants.changedAtOrAboveInk },
    noChangeWithInkNeighbour: { pass: report.invariants.changedWithInkNeighbour === 0, value: report.invariants.changedWithInkNeighbour },
    allRemovedFullyTransparent: { pass: report.invariants.changedToSomethingOtherThanFullyTransparent === 0, value: report.invariants.changedToSomethingOtherThanFullyTransparent },
    nonQualifyingBytesUntouched: { pass: report.invariants.nonQualifyingBytesChanged === 0, value: report.invariants.nonQualifyingBytesChanged },
    encodedRoundTripsExactly: { pass: roundTripOk, value: roundTripOk },
  };

  const failed = Object.entries(postconditions).filter(([, v]) => !v.pass);
  if (failed.length > 0) {
    const detail = failed.map(([k, v]) => `${k}=${JSON.stringify(v.value)}`).join(", ");
    throw new Error(`REFUSED: postcondition failed, nothing written — ${detail}`);
  }

  const sidecar = {
    tool: TOOL,
    toolVersion: TOOL_VERSION,
    pass: true,
    postconditions,
    input: { path: inPath, sha256: sha(srcBuf), width: png.w, height: png.h },
    output: { path: outPath, sha256: sha(outBuf), width: png.w, height: png.h },
    ...report,
    orphanSoft: {
      authoring: { before: beforeAuthoring, after: afterAuthoring, tolerance: HALO_TOLERANCE_AUTHORING, size: `${png.w}x${png.h}` },
      served: {
        before: beforeServed, after: afterServed, tolerance: HALO_TOLERANCE_SERVED, size: `${sw}x${sh}`,
        downscale: "premultiplied 2x2 box average — promote-r2-torso-asset.downscaleHalf, reused verbatim",
      },
    },
    geometry: { before, after, identical: geometryIdentical },
    note: "Dust removal is a PRECONDITION for owner review, never a visual approval (D-059).",
  };

  // ── commit ───────────────────────────────────────────────────────────────────────────────
  // Only now does anything reach disk. Both files are staged under unguessable temporary names in
  // the destination directory — same directory so the rename is a rename and not a copy — then
  // renamed into place, SIDECAR FIRST. See the header: of the two possible crash residues, only
  // the harmless one (a report with no image, which makes the next run refuse) is reachable.
  mkdirSync(dirname(outAbs), { recursive: true });
  const stamp = randomBytes(8).toString("hex");
  const tmpOut = `${outAbs}.${stamp}.tmp`;
  const tmpSidecar = `${sidecarAbs}.${stamp}.tmp`;
  const sidecarJson = JSON.stringify(sidecar, null, 2);

  try {
    writeNewFileSync(tmpOut, outBuf);
    writeNewFileSync(tmpSidecar, Buffer.from(sidecarJson, "utf8"));
  } catch (err) {
    for (const t of [tmpOut, tmpSidecar]) { try { unlinkSync(t); } catch { /* nothing staged */ } }
    throw err;
  }

  // The final paths were checked for existence far above, but that check is not a guarantee by
  // the time we get here. Re-assert immediately before the rename: renameSync overwrites silently,
  // and lstat (not stat) is what sees a symlink planted at the destination rather than its target.
  for (const p of [sidecarAbs, outAbs]) {
    let clash = null;
    try { clash = lstatSync(p); } catch { /* absent, which is what we require */ }
    if (clash) {
      for (const t of [tmpOut, tmpSidecar]) { try { unlinkSync(t); } catch { /* already gone */ } }
      throw new Error(`REFUSED: destination appeared while writing, nothing committed: ${p}`);
    }
  }

  renameSync(tmpSidecar, sidecarAbs);
  renameSync(tmpOut, outAbs);
  return sidecar;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [, , inP, outP] = process.argv;
  if (!inP || !outP) {
    console.error(`usage: node tools/avatar/${TOOL}.mjs <in.png> <out.png>`);
    console.error(`       output must be under ${WRITE_ROOT.replace(/\\/g, "/")}/ and must not already exist`);
    process.exit(2);
  }
  try {
    const r = run(inP, outP);
    console.log(`${TOOL} v${TOOL_VERSION}`);
    console.log(`  in  ${r.input.sha256}`);
    console.log(`  out ${r.output.sha256}`);
    console.log(`  cleared ${r.pixelsChanged} px in ${r.removedComponents} components, max removed alpha ${r.maxRemovedAlpha} (floor ${r.alphaFloor})`);
    console.log(`  orphan authoring ${r.orphanSoft.authoring.before} → ${r.orphanSoft.authoring.after} (max ${r.orphanSoft.authoring.tolerance})`);
    console.log(`  orphan served    ${r.orphanSoft.served.before} → ${r.orphanSoft.served.after} (max ${r.orphanSoft.served.tolerance})`);
    console.log(`  geometry identical: ${r.geometry.identical}`);
    console.log(`  postconditions: ${Object.keys(r.postconditions).length}/${Object.keys(r.postconditions).length} pass`);
  } catch (e) {
    console.error(String(e.message ?? e));
    process.exit(1);
  }
}
