// build-r3-api-mask — D-139 §3.
//
// Derives the ONE API guidance mask for the R3 technical-underlay head-only call, deterministically
// and from a single tracked input: D-133's EDIT region fixture.
//
// WHY A SEPARATE MASK EXISTS AT ALL. D-133's fixtures are MARKER masks: their alpha means "this
// pixel belongs to the region", and the RGB triple is a flat label colour. The Images edit endpoint
// reads a mask the other way round — a TRANSPARENT pixel is a pixel the model may repaint, an
// OPAQUE pixel is one it must leave alone. Sending r3-head-edit-v1.png unchanged would therefore
// hand the model the exact inverse of the intended region: it would repaint the whole body and
// protect the head. The two semantics are inverted with respect to each other, so the API mask is
// derived, pinned and tested on its own rather than reused.
//
//   API mask alpha = 0    wherever D-133 EDIT   (the head region the model may repaint)
//   API mask alpha = 255  wherever D-133 PROTECT (everything else)
//   API mask RGB   = 0,0,0 on every pixel       (no pixel of the figure, ever)
//
// WHAT THIS MASK IS NOT. It is MODEL GUIDANCE. It is NOT the guarantee that nothing outside the
// head changes. That guarantee comes from D-133's deterministic recomposition, which copies PROTECT
// back from H1 byte-identically after the response. A model that ignores the mask changes nothing
// about the final bytes; a recomposition that skipped its copy would. Never describe this file as
// the 0-changed-pixels gate.
//
// H1 IS NOT AN INPUT. The region is already fixed in the tracked EDIT fixture, so this tool runs on
// a fresh clone with no external file, and CI can verify every byte it produces.
//
// Usage:
//   node tools/avatar/build-r3-api-mask.mjs           write the fixture and its spec
//   node tools/avatar/build-r3-api-mask.mjs --check   verify only, write nothing
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { decodePng, encodePngRGBA } from "./build-r2-torso-occlusion-mask.mjs";

export const TOOL = "build-r3-api-mask";
export const TOOL_VERSION = "1.0.0";
export const DECISION = "D-139";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");

export const OUT_W = 1024, OUT_H = 1536;
const N = OUT_W * OUT_H;
export const SOLID_ALPHA = 128;                 // the same binary threshold D-133 reads its fixtures at

/** The single input: D-133's EDIT fixture, tracked and pinned. */
export const SOURCE = Object.freeze({
  path: join("tools", "avatar", "fixtures", "r3-head-edit", "r3-head-edit-v1.png"),
  sha256: "5e843a9a217966e80affdc2b8783cf8926941ff4ab6d62d1e424c795f4885156",
  marker: Object.freeze([236, 72, 153]),
  px: 125423,
  decision: "D-133",
});

/** D-133's own approved counts, restated so a drifted input is a hard stop rather than a refit. */
export const EXPECT = Object.freeze({
  editPx: 125423,
  protectPx: 1447441,
  canvasPx: N,
  editBbox: Object.freeze([292, 20, 732, 445]),
});

export const FIXTURE_DIR = join("tools", "avatar", "fixtures", "r3-underlay");
export const FILES = Object.freeze({
  mask: "r3-underlay-api-mask-v1.png",
  spec: "r3-underlay-api-mask-spec-v1.json",
});

/** The direction, written down once so a test can assert it rather than re-deriving it. */
export const SEMANTICS = Object.freeze({
  endpoint: "https://api.openai.com/v1/images/edits",
  transparentMeans: "EDITABLE — the model may repaint this pixel",
  opaqueMeans: "PROTECTED — the model must leave this pixel alone",
  editAlpha: 0,
  protectAlpha: 255,
  rgb: "0,0,0 on every pixel, transparent and opaque alike — the mask carries no pixel of the figure",
  invertedRelativeToD133: "D-133's marker fixtures use the OPPOSITE convention: alpha 255 marks the "
    + "region. This file is their alpha-inverse, restricted to the EDIT region.",
  guidanceOnly: "MODEL GUIDANCE ONLY. The guarantee that nothing outside the head changes comes from "
    + "D-133's deterministic recomposition copying PROTECT back from H1 byte-identically — never from "
    + "this mask.",
});

const sha = (b) => createHash("sha256").update(b).digest("hex");

/** Reads the EDIT fixture into a binary region set, refusing anything that is not what D-133 wrote. */
export function loadEditRegion(buf, label) {
  const img = decodePng(buf, label || "EDIT fixture");
  if (img.w !== OUT_W || img.h !== OUT_H) {
    throw new Error(`${label}: ${img.w}x${img.h}, expected ${OUT_W}x${OUT_H}`);
  }
  const set = new Uint8Array(N);
  let px = 0;
  for (let i = 0; i < N; i++) {
    const a = img.rgba[i * 4 + 3];
    if (a !== 0 && a !== 255) throw new Error(`${label}: alpha ${a} is not binary`);
    if (a === 0) continue;
    if (img.rgba[i * 4] !== SOURCE.marker[0] || img.rgba[i * 4 + 1] !== SOURCE.marker[1]
      || img.rgba[i * 4 + 2] !== SOURCE.marker[2]) {
      throw new Error(`${label}: marker colour is not constant inside the region`);
    }
    set[i] = 1;
    px++;
  }
  if (px !== EXPECT.editPx) throw new Error(`${label}: ${px} px, expected ${EXPECT.editPx} — refusing to refit the region`);
  return { set, px };
}

/** The whole transformation: one inversion, no geometry of its own. */
export function buildApiMask(editSet) {
  if (!editSet || editSet.length !== N) throw new Error("buildApiMask needs a full-canvas region set");
  const rgba = Buffer.alloc(N * 4);              // RGB stays 0,0,0 everywhere
  for (let i = 0; i < N; i++) rgba[i * 4 + 3] = editSet[i] ? 0 : 255;
  return rgba;
}

/** Every gate D-139 names, checked on the pixels rather than on the intent. */
export function verifyApiMask(rgba, editSet) {
  const problems = [];
  if (!Buffer.isBuffer(rgba) || rgba.length !== N * 4) {
    return { ok: false, problems: ["the mask buffer is not a full 1024x1536 RGBA canvas"], counts: null };
  }
  let editable = 0, protectedPx = 0, nonBinary = 0, colouredPx = 0, wrongInEdit = 0, wrongOutside = 0;
  for (let i = 0; i < N; i++) {
    const a = rgba[i * 4 + 3];
    if (a === 0) editable++;
    else if (a === 255) protectedPx++;
    else nonBinary++;
    if (rgba[i * 4] !== 0 || rgba[i * 4 + 1] !== 0 || rgba[i * 4 + 2] !== 0) colouredPx++;
    if (editSet) {
      if (editSet[i] && a !== 0) wrongInEdit++;
      if (!editSet[i] && a !== 255) wrongOutside++;
    }
  }
  if (nonBinary !== 0) problems.push(`alpha is not binary: ${nonBinary} px are neither 0 nor 255`);
  if (colouredPx !== 0) problems.push(`RGB is not 0,0,0 on ${colouredPx} px — a mask must carry no figure pixel`);
  if (editable !== EXPECT.editPx) problems.push(`${editable} editable px, expected ${EXPECT.editPx}`);
  if (protectedPx !== EXPECT.protectPx) problems.push(`${protectedPx} protected px, expected ${EXPECT.protectPx}`);
  if (editable + protectedPx !== EXPECT.canvasPx) problems.push("editable + protected does not cover the canvas exactly");
  if (editSet) {
    if (wrongInEdit !== 0) problems.push(`${wrongInEdit} px inside D-133 EDIT are not transparent — the mask is inverted or misaligned`);
    if (wrongOutside !== 0) problems.push(`${wrongOutside} px outside D-133 EDIT are not opaque — the mask is inverted or misaligned`);
  }
  return { ok: problems.length === 0, problems, counts: { editable, protected: protectedPx, nonBinary, colouredPx } };
}

/** PNG header fields, so the written file is checked as a file and not only as a pixel array. */
export function pngHeader(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 33) return null;
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < sig.length; i++) if (buf[i] !== sig[i]) return null;
  if (buf.toString("ascii", 12, 16) !== "IHDR") return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bitDepth: buf[24], colourType: buf[25] };
}

export function specFor(maskBytes, sourceSha) {
  return {
    tool: TOOL,
    toolVersion: TOOL_VERSION,
    decision: DECISION,
    status: "API GUIDANCE MASK ONLY — NO IMAGE REQUEST SENT, NO CLAIM CREATED BY THIS TOOL",
    canvas: { width: OUT_W, height: OUT_H, origin: "top-left" },
    derivedFrom: { path: SOURCE.path.split("\\").join("/"), sha256: sourceSha, decision: SOURCE.decision, px: SOURCE.px },
    semantics: SEMANTICS,
    counts: { editablePx: EXPECT.editPx, protectedPx: EXPECT.protectPx, canvasPx: EXPECT.canvasPx },
    editBbox: EXPECT.editBbox,
    bboxConvention: "inclusive-max",
    mask: { file: FILES.mask, bytes: maskBytes.length, sha256: sha(maskBytes), png: pngHeader(maskBytes) },
    invariants: [
      "alpha is strictly binary {0,255}",
      "alpha = 0 on exactly the D-133 EDIT region, and nowhere else",
      "alpha = 255 on exactly the D-133 PROTECT region, and nowhere else",
      "RGB = 0,0,0 on every pixel; the mask contains no pixel of the figure",
      "the same input and tool version reproduce every output byte-identically",
    ],
    prohibitions: {
      notTheByteIdentityGate: "This mask is model guidance. It is NOT the guarantee of 0 changed pixels "
        + "outside the head — that guarantee is D-133's deterministic recomposition, which copies PROTECT "
        + "back from H1 byte-identically.",
      noRuntimePromotion: "An authoring fixture. It is NOT a runtime mask and carries no runtime authority.",
      noRefit: "A deviation from D-133's approved counts is a hard stop. The region is never re-fitted.",
    },
  };
}

export function readIfExists(p) {
  try { return existsSync(p) ? readFileSync(p) : null; } catch (_) { return null; }
}

/**
 * Builds, verifies and (unless --check) writes. Returns a report; it never throws for a mismatch,
 * so the CLI can print every problem at once.
 */
export function run(opts) {
  const o = opts || {};
  const repoRoot = o.repoRoot || REPO;
  const check = o.check === true;
  const srcPath = join(repoRoot, SOURCE.path);
  if (!existsSync(srcPath)) throw new Error("missing tracked input: " + SOURCE.path);
  const srcBuf = readFileSync(srcPath);
  const srcSha = sha(srcBuf);
  if (srcSha !== SOURCE.sha256) {
    throw new Error(`${SOURCE.path}: sha ${srcSha}, expected ${SOURCE.sha256} — refusing to build from a drifted input`);
  }

  const { set } = loadEditRegion(srcBuf, SOURCE.path);
  const rgba = buildApiMask(set);
  const verdict = verifyApiMask(rgba, set);
  const png = encodePngRGBA(OUT_W, OUT_H, rgba);
  const spec = specFor(png, srcSha);
  const specText = JSON.stringify(spec, null, 2) + "\n";

  const dir = join(repoRoot, FIXTURE_DIR);
  const maskPath = join(dir, FILES.mask);
  const specPath = join(dir, FILES.spec);
  const existingMask = readIfExists(maskPath);
  const existingSpec = readIfExists(specPath);
  const maskMatches = existingMask !== null && existingMask.equals(png);
  const specMatches = existingSpec !== null && existingSpec.equals(Buffer.from(specText, "utf8"));

  if (!check && verdict.ok) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(maskPath, png);
    writeFileSync(specPath, specText, "utf8");
  }

  return {
    check, verdict, spec,
    source: { path: SOURCE.path, sha256: srcSha },
    mask: { path: maskPath, bytes: png.length, sha256: sha(png) },
    reproduction: { maskExisted: existingMask !== null, maskMatches, specExisted: existingSpec !== null, specMatches },
    wrote: !check && verdict.ok,
  };
}

export function exitCodeFor(result) {
  if (!result || !result.verdict || !result.verdict.ok) return 1;
  if (result.check) {
    const r = result.reproduction;
    if (!r.maskExisted || !r.maskMatches || !r.specExisted || !r.specMatches) return 1;
  }
  return 0;
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const check = process.argv.includes("--check");
    const result = run({ check });
    console.log(TOOL + " " + TOOL_VERSION + " — " + DECISION);
    console.log("  source   : " + result.source.path);
    console.log("             " + result.source.sha256 + "   [" + SOURCE.decision + "]");
    console.log("  direction: alpha 0 = EDITABLE (D-133 EDIT) · alpha 255 = PROTECTED (D-133 PROTECT)");
    console.log("             this is the ALPHA-INVERSE of D-133's marker fixtures");
    const c = result.verdict.counts;
    if (c) console.log("  counts   : editable " + c.editable + "  protected " + c.protected +
      "  non-binary " + c.nonBinary + "  coloured " + c.colouredPx);
    console.log("  mask     : " + result.mask.bytes + " B  " + result.mask.sha256);
    if (!result.verdict.ok) {
      console.error("  verify   : FAIL");
      for (const p of result.verdict.problems) console.error("    · " + p);
    } else {
      console.log("  verify   : OK");
    }
    if (result.check) {
      const r = result.reproduction;
      const ok = r.maskExisted && r.maskMatches && r.specExisted && r.specMatches;
      console.log("  check    : " + (ok ? "PASS — the tracked fixtures reproduce byte-identically" : "FAIL"));
      if (!ok) {
        if (!r.maskExisted) console.error("    · the tracked mask does not exist");
        else if (!r.maskMatches) console.error("    · the tracked mask differs from a fresh build");
        if (!r.specExisted) console.error("    · the tracked spec does not exist");
        else if (!r.specMatches) console.error("    · the tracked spec differs from a fresh build");
      }
      console.log("  wrote    : nothing (--check)");
    } else {
      console.log("  wrote    : " + (result.wrote ? FIXTURE_DIR.split("\\").join("/") + "/{" + FILES.mask + "," + FILES.spec + "}" : "nothing"));
    }
    console.log("\n  This tool sends nothing and creates no claim. The mask is model guidance only;");
    console.log("  D-133's recomposition is what keeps everything outside the head byte-identical.");
    process.exitCode = exitCodeFor(result);
  } catch (err) {
    console.error("✖ " + (err && err.message ? err.message : String(err)));
    process.exitCode = 1;
  }
}
