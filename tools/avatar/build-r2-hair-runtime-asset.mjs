// build-r2-hair-runtime-asset — turn a hair authoring candidate into the exact bytes that would
// ship, so the acceptance gates can measure the image a student actually sees (D-115).
// ---------------------------------------------------------------------------------------------
// DETERMINISTIC · NON-AI · NO NETWORK · PROMOTES NOTHING.
//
// It writes only into tools/avatar/build/r2-hair-runtime/ (gitignored scratch). It does NOT write
// into assets/avatar-r2/, does NOT touch R2_MANIFEST, hairSrcForR2, AVATAR_R2 or any runtime file,
// and registers nothing. Producing the bytes is not promoting them: promotion is a separate,
// separately authorised step that still requires owner sign-off at real render scale (D-059/D-105).
//
// THE PIPELINE, REUSED RATHER THAN REINVENTED — every step already existed:
//
//   1024x1536 RGBA authoring candidate
//     -> clean-r2-hair-alpha.cleanAlpha            (authoring orphan-dust removal)
//     -> promote-r2-torso-asset.downscaleHalf      (premultiplied 2x2 box /2)
//     -> clean-r2-hair-alpha.cleanAlpha            (served orphan-dust removal)
//        ^^^ those three are exactly clean-served-alpha.servedPass, imported, not copied
//     -> 512x768 RGBA reference PNG
//     -> cwebp -lossless -exact -z 9 -metadata none    (promote-r2-torso-asset.CWEBP_ARGS)
//     -> dwebp
//     -> the decoded pixels the browser paints
//
// WHY A SEPARATE REFERENCE, AND WHY THE BYTE COMPARISON IS THE POINT
// The reference PNG is built BEFORE the encoder runs, from pixels the encoder never touched. The
// decoded WebP must then equal it byte for byte. That is what proves the encode was lossless and
// that no pixel of the candidate moved — as opposed to asking cwebp whether cwebp did well, which
// is the circular gate D-085 caught. It is the same proof promote-r2-torso-asset.mjs applies to
// the torso asset, applied here for hair.
//
// WHY THIS IS ITS OWN MODULE
// check-r2-hair-candidate.mjs exports the shared orphan-soft definition that BOTH cleanup tools
// import. If the gate file also imported the cleanup chain statically, the module graph would be
// a cycle. Keeping the pipeline here leaves every static import one-directional; the gate file
// reaches this module through a dynamic import at the one point it needs it.
// ---------------------------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, sep } from "node:path";
import { decodePng, encodePngRGBA } from "./build-r2-torso-occlusion-mask.mjs";
import { CWEBP_ARGS, ENCODER_SHA256, DECODER_SHA256 } from "./promote-r2-torso-asset.mjs";
import { servedPass } from "./clean-served-alpha.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(join(HERE, "..", ".."));

export const TOOL = "build-r2-hair-runtime-asset";
export const TOOL_VERSION = "1.0.0";

export const SRC_W = 1024, SRC_H = 1536;
export const RUNTIME_W = 512, RUNTIME_H = 768;

// The ONE directory this tool may write into. Gitignored scratch, never the runtime asset folder.
export const WRITE_ROOT = join(HERE, "build", "r2-hair-runtime");

const CWEBP = join(HERE, "vendor", "cwebp.exe");
const DWEBP = join(HERE, "vendor", "dwebp.exe");

const sha256 = (b) => createHash("sha256").update(b).digest("hex");

/** Positive allowlist, same shape as the cleanup tool's: refuse anything outside the scratch dir. */
export function assertWritable(target) {
  const abs = resolve(target);
  const root = resolve(WRITE_ROOT);
  if (abs !== root && !abs.startsWith(root + sep)) {
    throw new Error(`REFUSED: ${TOOL} may only write inside ` +
      `${WRITE_ROOT.replace(REPO + sep, "").split(sep).join("/")}/ — got ${abs}`);
  }
  return abs;
}

/**
 * The vendored binaries are SHA-pinned. An unverified encoder must not be able to produce bytes
 * that a gate then blesses, so this fails loudly rather than falling back to anything.
 */
export function requireBinary(path, name, pinnedSha) {
  if (!existsSync(path)) {
    throw new Error(`vendored ${name} missing: ${path}\n  run:  node tools/avatar/fetch-${name}.mjs`);
  }
  const actual = sha256(readFileSync(path));
  if (actual !== pinnedSha) {
    throw new Error(`vendored ${name} SHA ${actual.slice(0, 16)}… != pinned ${pinnedSha.slice(0, 16)}… ` +
      `— refusing to measure an asset built with an unverified binary`);
  }
  return actual;
}

/**
 * Runs the whole pipeline and returns every intermediate that a caller might need to prove
 * something about. Pure with respect to the repository: the only writes are the three scratch
 * files the codecs need on disk, inside WRITE_ROOT.
 *
 * `decodedRgba` is the acceptance basis — the pixels a browser paints.
 * `byteIdentical` is the lossless proof; a caller must treat `false` as disqualifying, because a
 * gate result measured on pixels that are not the shipped pixels means nothing.
 */
export function buildRuntimeAsset(authoringRgba, w, h, { label = "candidate" } = {}) {
  if (w !== SRC_W || h !== SRC_H) {
    throw new Error(`REFUSED: expected a ${SRC_W}x${SRC_H} authoring canvas, got ${w}x${h}`);
  }
  const encoderSha = requireBinary(CWEBP, "cwebp", ENCODER_SHA256);
  const decoderSha = requireBinary(DWEBP, "dwebp", DECODER_SHA256);

  // steps 1-3: authoring cleanup -> downscaleHalf -> served cleanup. Imported, never re-derived.
  const { cleaned, served, sw, sh, report, authoringReport } = servedPass(authoringRgba, w, h);
  if (sw !== RUNTIME_W || sh !== RUNTIME_H) {
    throw new Error(`REFUSED: pipeline produced ${sw}x${sh}, expected ${RUNTIME_W}x${RUNTIME_H}`);
  }

  const safeLabel = String(label).replace(/[^a-z0-9._-]/gi, "_");
  mkdirSync(assertWritable(WRITE_ROOT), { recursive: true });
  const refPath = assertWritable(join(WRITE_ROOT, `${safeLabel}.served-reference.png`));
  const webpPath = assertWritable(join(WRITE_ROOT, `${safeLabel}.runtime.webp`));
  const decPath = assertWritable(join(WRITE_ROOT, `${safeLabel}.decoded.png`));

  const referencePng = encodePngRGBA(sw, sh, cleaned);
  writeFileSync(refPath, referencePng);

  const enc = spawnSync(CWEBP, [...CWEBP_ARGS, refPath, "-o", webpPath], { encoding: "utf8" });
  if (enc.status !== 0) throw new Error("cwebp failed: " + (enc.stderr || enc.stdout || ""));
  const webp = readFileSync(webpPath);

  const dec = spawnSync(DWEBP, [webpPath, "-o", decPath], { encoding: "utf8" });
  if (dec.status !== 0) throw new Error("dwebp failed: " + (dec.stderr || ""));
  const decoded = decodePng(readFileSync(decPath), "decoded runtime asset");

  const byteIdentical = decoded.w === sw && decoded.h === sh &&
    Buffer.compare(Buffer.from(decoded.rgba), Buffer.from(cleaned)) === 0;

  return {
    w: sw, h: sh,
    servedRgba: served,            // the downscale BEFORE the served cleanup — an intermediate
    referenceRgba: cleaned,        // what the encoder was handed
    referencePng, referenceSha: sha256(referencePng),
    webp, webpSha: sha256(webp),
    decodedRgba: decoded.rgba,     // THE ACCEPTANCE BASIS
    byteIdentical,
    encoder: { args: [...CWEBP_ARGS], sha256: encoderSha },
    decoder: { sha256: decoderSha },
    cleanup: { authoring: authoringReport, served: report },
    paths: { reference: refPath, webp: webpPath, decoded: decPath },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [, , file, label] = process.argv;
  if (!file) {
    console.error(`usage: node tools/avatar/${TOOL}.mjs <authoring.png> [label]`);
    console.error(`       writes only into ${WRITE_ROOT.replace(REPO + sep, "").split(sep).join("/")}/`);
    process.exit(2);
  }
  try {
    const png = decodePng(readFileSync(resolve(file)), "authoring");
    const r = buildRuntimeAsset(png.rgba, png.w, png.h, { label: label || "candidate" });
    console.log(`${TOOL} v${TOOL_VERSION}`);
    console.log(`  reference ${r.w}x${r.h}  ${r.referenceSha}`);
    console.log(`  webp      ${r.webp.length} bytes  ${r.webpSha}`);
    console.log(`  decoded matches reference byte-for-byte: ${r.byteIdentical}`);
    console.log(`  PROMOTES NOTHING — scratch output only.`);
    process.exit(r.byteIdentical ? 0 : 1);
  } catch (err) {
    console.error(String(err.message ?? err));
    process.exit(1);
  }
}
