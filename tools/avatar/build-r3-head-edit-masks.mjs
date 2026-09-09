// build-r3-head-edit-masks — D-133 §2/§3/§4.
//
// Builds the three R3 head-edit region masks deterministically from TWO inputs only:
//   1. the tracked head-protect mask (E0), and
//   2. H1's own alpha channel.
//
// It never loads North Star v2, and it never uses a difference between H1 and the target
// figure as segmentation — D-132 §9 forbids that, and the region rules below need neither.
//
// H1 itself is EXTERNAL (D-127 §2). It is passed by --h1 <path>, pinned by sha256, and is
// never copied into the repository. The three PNGs this writes are region masks, not artwork:
// binary alpha plus a flat marker colour, so they carry no pixel of the figure.
//
// Regions (D-133, owner-approved 2026-09-09):
//   H1solid    := alpha >= 128                                        (D-071)
//   G1         := ( dilate8(E0, 1) ∩ H1solid ∩ { y <= 433 } ) \ E0
//   CORE_BASE  := E0 ∪ G1
//   BAND       := H1solid ∩ { 425 <= y <= 445 }                       (candidate B)
//   EDIT       := CORE_BASE ∪ BAND
//   TRANSITION := BAND
//   CORE       := CORE_BASE \ BAND   ( == EDIT \ TRANSITION )
//   PROTECT    := complement(EDIT) over the whole 1024x1536 canvas
//
// Every count and bbox below is an owner-approved constant. The builder REFUSES to write
// anything if a single one of them fails to reproduce — a drifted input must be a hard stop,
// never a silently re-fitted region.
//
// Usage:
//   node tools/avatar/build-r3-head-edit-masks.mjs --h1 <path-to-fitting-base.H1.png>
//   node tools/avatar/build-r3-head-edit-masks.mjs --h1 <path> --check   (verify, write nothing)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { decodePng, encodePngRGBA } from "./build-r2-torso-occlusion-mask.mjs";

export const TOOL = "build-r3-head-edit-masks";
export const TOOL_VERSION = "1.0.0";
export const DECISION = "D-133";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");

export const OUT_W = 1024, OUT_H = 1536;
export const SOLID_ALPHA = 128;          // D-071: solid = alpha >= 128
export const NECK_LINE_Y = 433;          // fitting-base-spec-v1.json -> geometry.neckLineY
export const BAND_Y_TOP = 425;           // D-133 candidate B
export const BAND_Y_BOT = 445;           // D-133 candidate B
export const BBOX_CONVENTION = "inclusive-max";   // [x0, y0, x1, y1], all four inclusive

/** The two pinned inputs. H1 is external and passed by path; E0 is tracked. */
export const H1_SHA256 = "72875565ecd62b542a91156dbcca1399a434fe04634f4e737df71337be0d5af4";
export const E0_PATH   = join("tools", "avatar", "fixtures", "fitting-base", "head-protect-mask-v1.png");
export const E0_SHA256 = "cc9c8b7a68dab60ab5c2914644d28676eefcb29e917a05f7bf4ce44093b737b3";

/** Where the fixtures live, following the existing fixtures/<tool-area>/ precedent. */
export const FIXTURE_DIR = join("tools", "avatar", "fixtures", "r3-head-edit");
export const FILES = Object.freeze({
  edit:       "r3-head-edit-v1.png",
  transition: "r3-head-transition-v1.png",
  protect:    "r3-head-protect-v1.png",
  spec:       "r3-head-edit-mask-spec-v1.json",
});

/** One unambiguous marker colour per mask. Metadata, never image data: the alpha channel
 *  carries the region and the RGB is this constant wherever alpha is 255, 0/0/0 elsewhere. */
export const MARKER = Object.freeze({
  edit:       [236, 72, 153],
  transition: [250, 204, 21],
  protect:    [15, 23, 42],
});

/** Owner-approved expected geometry. A mismatch is a hard stop, not a re-fit. */
export const EXPECT = Object.freeze({
  E0:         { px: 124099,  bbox: [292, 20, 732, 433], components: 1 },
  G1:         { px: 445,     bbox: [292, 20, 731, 433] },
  CORE_BASE:  { px: 124544,  bbox: [292, 20, 732, 433], components: 1 },
  TRANSITION: { px: 1702,    bbox: [455, 425, 565, 445], components: 1 },
  EDIT:       { px: 125423,  bbox: [292, 20, 732, 445], components: 1 },
  CORE:       { px: 123721,  bbox: [292, 20, 732, 424] },
  PROTECT:    { px: 1447441 },
  /** The single neck-contour pixel inside G1; the other 444 are head/edge fringe. */
  G1_NECK_PIXEL: [475, 433],
  G1_ABOVE_Y420: 444,
  /** G1 pixels strictly above the transition band; the remaining one sits at (475,433). */
  G1_ABOVE_BAND: 444,
});

const N = OUT_W * OUT_H;
export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

// ── set helpers (all operate on Uint8Array of length OUT_W*OUT_H) ────────────
export function countOf(set) { let n = 0; for (let i = 0; i < N; i++) if (set[i]) n++; return n; }

export function bboxOf(set) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < OUT_H; y++) for (let x = 0; x < OUT_W; x++) {
    if (!set[y * OUT_W + x]) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : [x0, y0, x1, y1];   // inclusive-max
}

export function componentCount(set) {
  const seen = new Uint8Array(N), stack = new Int32Array(N);
  let comps = 0;
  for (let i = 0; i < N; i++) {
    if (!set[i] || seen[i]) continue;
    comps++; let sp = 0; stack[sp++] = i; seen[i] = 1;
    while (sp) {
      const c = stack[--sp], cx = c % OUT_W, cy = (c - cx) / OUT_W;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= OUT_W || ny >= OUT_H) continue;
        const j = ny * OUT_W + nx;
        if (set[j] && !seen[j]) { seen[j] = 1; stack[sp++] = j; }
      }
    }
  }
  return comps;
}

/** One step of 8-connected dilation. Bounded on purpose: it can never reach the neck or body. */
export function dilate8(set) {
  const out = new Uint8Array(N);
  for (let y = 0; y < OUT_H; y++) for (let x = 0; x < OUT_W; x++) {
    if (!set[y * OUT_W + x]) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= OUT_W || ny >= OUT_H) continue;
      out[ny * OUT_W + nx] = 1;
    }
  }
  return out;
}

// ── inputs ───────────────────────────────────────────────────────────────────
function requirePng(buf, label, { colourType = 6 } = {}) {
  const img = decodePng(buf, label);
  if (img.w !== OUT_W || img.h !== OUT_H) throw new Error(`${label}: expected ${OUT_W}x${OUT_H}, got ${img.w}x${img.h}`);
  if (colourType === 6 && buf.readUInt8(25) !== 6) throw new Error(`${label}: expected PNG colour type 6 (RGBA)`);
  if (buf.readUInt8(24) !== 8) throw new Error(`${label}: expected bit depth 8`);
  return img;
}

/** The tracked head-protect mask. Verified by sha and required to be strictly binary. */
export function loadE0(repoRoot = REPO) {
  const p = join(repoRoot, E0_PATH);
  const buf = readFileSync(p);
  const got = sha256(buf);
  if (got !== E0_SHA256) throw new Error(`head-protect-mask-v1.png sha256 ${got} != pinned ${E0_SHA256}`);
  const img = requirePng(buf, "head-protect-mask-v1.png");
  const set = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const a = img.rgba[i * 4 + 3];
    if (a !== 0 && a !== 255) throw new Error(`head-protect-mask-v1.png: alpha ${a} at index ${i} is not binary`);
    if (a === 255) set[i] = 1;
  }
  return set;
}

/** H1, from an explicit path outside the repository. Pinned by sha256. */
export function loadH1Solid(h1Path) {
  if (!h1Path) throw new Error("--h1 <path> is required: H1 is external (D-127 §2) and is never read from the repository");
  if (!existsSync(h1Path)) throw new Error(`H1 not found at ${h1Path}`);
  const buf = readFileSync(h1Path);
  const got = sha256(buf);
  if (got !== H1_SHA256) throw new Error(`H1 sha256 ${got} != pinned ${H1_SHA256} — refusing to build from an unpinned figure`);
  const img = requirePng(buf, "fitting-base.H1.png");
  const solid = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (img.rgba[i * 4 + 3] >= SOLID_ALPHA) solid[i] = 1;
  return solid;
}

// ── regions ──────────────────────────────────────────────────────────────────
export function buildRegions(E0, H1solid) {
  const d1 = dilate8(E0);
  const G1 = new Uint8Array(N);
  for (let y = 0; y <= NECK_LINE_Y; y++) for (let x = 0; x < OUT_W; x++) {
    const i = y * OUT_W + x;
    if (!E0[i] && d1[i] && H1solid[i]) G1[i] = 1;
  }
  const CORE_BASE = new Uint8Array(N);
  for (let i = 0; i < N; i++) CORE_BASE[i] = (E0[i] || G1[i]) ? 1 : 0;

  const TRANSITION = new Uint8Array(N);
  for (let y = BAND_Y_TOP; y <= BAND_Y_BOT; y++) for (let x = 0; x < OUT_W; x++) {
    const i = y * OUT_W + x;
    if (H1solid[i]) TRANSITION[i] = 1;
  }
  const EDIT = new Uint8Array(N), CORE = new Uint8Array(N), PROTECT = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    EDIT[i]    = (CORE_BASE[i] || TRANSITION[i]) ? 1 : 0;
    CORE[i]    = (CORE_BASE[i] && !TRANSITION[i]) ? 1 : 0;
    PROTECT[i] = EDIT[i] ? 0 : 1;
  }
  return { G1, CORE_BASE, TRANSITION, EDIT, CORE, PROTECT };
}

/** Every owner-approved number and structural invariant. Throws on the first deviation. */
export function verifyRegions(E0, r) {
  const fail = (m) => { throw new Error("R3 head-edit region check FAILED: " + m); };
  const eq = (label, got, want) => { if (got !== want) fail(`${label} = ${got}, expected ${want}`); };
  const eqBox = (label, got, want) => {
    if (!got || got.join(",") !== want.join(",")) fail(`${label} bbox = ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
  };
  eq("E0 px", countOf(E0), EXPECT.E0.px);
  eqBox("E0", bboxOf(E0), EXPECT.E0.bbox);
  eq("E0 components", componentCount(E0), EXPECT.E0.components);

  eq("G1 px", countOf(r.G1), EXPECT.G1.px);
  eqBox("G1", bboxOf(r.G1), EXPECT.G1.bbox);
  eq("CORE_BASE px", countOf(r.CORE_BASE), EXPECT.CORE_BASE.px);
  eqBox("CORE_BASE", bboxOf(r.CORE_BASE), EXPECT.CORE_BASE.bbox);
  eq("CORE_BASE components", componentCount(r.CORE_BASE), EXPECT.CORE_BASE.components);

  eq("TRANSITION px", countOf(r.TRANSITION), EXPECT.TRANSITION.px);
  eqBox("TRANSITION", bboxOf(r.TRANSITION), EXPECT.TRANSITION.bbox);
  eq("EDIT px", countOf(r.EDIT), EXPECT.EDIT.px);
  eqBox("EDIT", bboxOf(r.EDIT), EXPECT.EDIT.bbox);
  eq("CORE px", countOf(r.CORE), EXPECT.CORE.px);
  eqBox("CORE", bboxOf(r.CORE), EXPECT.CORE.bbox);
  eq("PROTECT px", countOf(r.PROTECT), EXPECT.PROTECT.px);

  // the GAP-1 evidence the owner approved, re-derived rather than restated
  const [nx, ny] = EXPECT.G1_NECK_PIXEL;
  if (!r.G1[ny * OUT_W + nx]) fail(`G1 is missing the neck-contour pixel (${nx},${ny})`);
  let onNeckRow = 0, aboveY420 = 0;
  for (let x = 0; x < OUT_W; x++) if (r.G1[NECK_LINE_Y * OUT_W + x]) onNeckRow++;
  eq(`G1 pixels on y=${NECK_LINE_Y}`, onNeckRow, 1);
  for (let y = 0; y < 420; y++) for (let x = 0; x < OUT_W; x++) if (r.G1[y * OUT_W + x]) aboveY420++;
  eq("G1 pixels above y=420", aboveY420, EXPECT.G1_ABOVE_Y420);
  let aboveBand = 0;
  for (let y = 0; y < BAND_Y_TOP; y++) for (let x = 0; x < OUT_W; x++) if (r.G1[y * OUT_W + x]) aboveBand++;
  eq(`G1 pixels above the band (y<${BAND_Y_TOP})`, aboveBand, EXPECT.G1_ABOVE_BAND);

  // structural invariants
  for (let i = 0; i < N; i++) {
    if (r.TRANSITION[i] && !r.EDIT[i]) fail("TRANSITION is not a subset of EDIT");
    if (r.CORE[i] && r.TRANSITION[i]) fail("CORE and TRANSITION overlap");
    if (r.EDIT[i] === r.PROTECT[i]) fail("EDIT and PROTECT are not exact complements");
    if (r.EDIT[i] !== ((r.CORE[i] || r.TRANSITION[i]) ? 1 : 0)) fail("EDIT != CORE ∪ TRANSITION");
  }
  if (countOf(r.EDIT) + countOf(r.PROTECT) !== N) fail("EDIT ∪ PROTECT does not cover the canvas exactly");
  // nothing may reach below the band, and nothing above the neck line may reach the body
  const eb = bboxOf(r.EDIT);
  if (eb[3] !== BAND_Y_BOT) fail(`EDIT reaches y=${eb[3]}, expected to stop at y=${BAND_Y_BOT}`);
  const cb = bboxOf(r.CORE_BASE);
  if (cb[3] !== NECK_LINE_Y) fail(`CORE_BASE reaches y=${cb[3]}, expected to stop at y=${NECK_LINE_Y}`);
  return true;
}

// ── fixtures ─────────────────────────────────────────────────────────────────
/** Region -> PNG: binary alpha, flat marker RGB inside, 0/0/0 outside. */
export function maskToPng(set, marker) {
  const rgba = Buffer.alloc(N * 4);
  for (let i = 0; i < N; i++) {
    if (!set[i]) continue;                       // stays 0,0,0,0
    rgba[i * 4] = marker[0]; rgba[i * 4 + 1] = marker[1]; rgba[i * 4 + 2] = marker[2]; rgba[i * 4 + 3] = 255;
  }
  return encodePngRGBA(OUT_W, OUT_H, rgba);
}

/** Reads a written fixture back into a region set, enforcing binary alpha + single marker. */
export function pngToMask(buf, label, marker) {
  const img = requirePng(buf, label);
  const set = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const a = img.rgba[i * 4 + 3];
    if (a !== 0 && a !== 255) throw new Error(`${label}: alpha ${a} is not binary`);
    if (a === 0) continue;
    if (img.rgba[i * 4] !== marker[0] || img.rgba[i * 4 + 1] !== marker[1] || img.rgba[i * 4 + 2] !== marker[2])
      throw new Error(`${label}: marker colour is not constant inside the region`);
    set[i] = 1;
  }
  return set;
}

export function buildArtifacts(E0, r, h1Path) {
  const png = {
    edit:       maskToPng(r.EDIT, MARKER.edit),
    transition: maskToPng(r.TRANSITION, MARKER.transition),
    protect:    maskToPng(r.PROTECT, MARKER.protect),
  };
  const region = (name, set, marker, file) => ({
    file, marker: marker.join(","), px: countOf(set), bbox: bboxOf(set),
    sha256: sha256(png[name]), bytes: png[name].length,
  });
  const spec = {
    tool: TOOL, toolVersion: TOOL_VERSION, decision: DECISION,
    status: "REGION FIXTURES ONLY — NO IMAGE REQUEST AUTHORISED, NO CLAIM CREATED",
    canvas: { width: OUT_W, height: OUT_H, origin: "top-left" },
    bboxConvention: BBOX_CONVENTION,
    alphaRule: `H1solid := alpha >= ${SOLID_ALPHA} (D-071)`,
    markerSemantics: "The alpha channel carries the region (binary 0/255). The RGB triple is a flat marker colour, metadata rather than image data, and is 0,0,0 wherever alpha is 0. No fixture contains a pixel of the figure.",
    inputs: {
      headProtectMask: { path: E0_PATH.split("\\").join("/"), sha256: E0_SHA256, tracked: true, px: countOf(E0) },
      authoringBase: {
        filename: "fitting-base.H1.png", sha256: H1_SHA256, tracked: false,
        storage: "EXTERNAL — passed by --h1 and never copied into the repository (D-127 §2). Only its alpha channel is read.",
        readFrom: h1Path ? "an explicit --h1 path supplied at build time" : null,
      },
      targetFigure: "NOT AN INPUT. No difference between H1 and North Star v2 is used as segmentation (D-132 §9).",
    },
    regionRules: {
      G1: "( dilate8(E0, 1) ∩ H1solid ∩ { y <= " + NECK_LINE_Y + " } ) \\ E0",
      CORE_BASE: "E0 ∪ G1",
      TRANSITION: `H1solid ∩ { ${BAND_Y_TOP} <= y <= ${BAND_Y_BOT} }  (D-133 candidate B, figure-clipped, not a rectangle)`,
      EDIT: "CORE_BASE ∪ TRANSITION",
      CORE: "CORE_BASE \\ TRANSITION  ( == EDIT \\ TRANSITION )",
      PROTECT: "complement(EDIT) over the whole canvas",
    },
    band: { yTop: BAND_Y_TOP, yBot: BAND_Y_BOT, rows: BAND_Y_BOT - BAND_Y_TOP + 1, neckLineY: NECK_LINE_Y },
    derived: {
      G1: { px: countOf(r.G1), bbox: bboxOf(r.G1), neckContourPixel: EXPECT.G1_NECK_PIXEL, headFringePixelsAboveY420: EXPECT.G1_ABOVE_Y420, headFringePixelsAboveBand: EXPECT.G1_ABOVE_BAND },
      CORE_BASE: { px: countOf(r.CORE_BASE), bbox: bboxOf(r.CORE_BASE), components: componentCount(r.CORE_BASE) },
      CORE: { px: countOf(r.CORE), bbox: bboxOf(r.CORE) },
    },
    masks: {
      edit:       region("edit", r.EDIT, MARKER.edit, FILES.edit),
      transition: region("transition", r.TRANSITION, MARKER.transition, FILES.transition),
      protect:    region("protect", r.PROTECT, MARKER.protect, FILES.protect),
    },
    invariants: [
      "TRANSITION ⊆ EDIT",
      "CORE ∩ TRANSITION = ∅",
      "CORE = EDIT \\ TRANSITION",
      "PROTECT = complement(EDIT); EDIT ∪ PROTECT covers all 1024x1536 pixels exactly",
      "alpha is strictly binary {0,255} in all three masks",
      "the same inputs and tool version reproduce every output byte-identically",
    ],
    prohibitions: {
      noImageRequest: "D-133 and these fixtures authorise no image request and no claim.",
      noRuntimePromotion: "These are authoring fixtures. They are NOT runtime masks and carry no runtime authority.",
      noRefit: "A deviation from the approved counts is a hard stop. The regions are never re-fitted to an output.",
    },
  };
  return { png, spec };
}

export function specPath(repoRoot = REPO) { return join(repoRoot, FIXTURE_DIR, FILES.spec); }
export function maskPath(key, repoRoot = REPO) { return join(repoRoot, FIXTURE_DIR, FILES[key]); }

// ── check / exit status ──────────────────────────────────────────────────────
/** Default filesystem reader for compareArtifacts: the bytes, or null when the file is absent. */
export const readIfExists = (p) => (existsSync(p) ? readFileSync(p) : null);

/**
 * Compares freshly built artefacts against what is on disk. Writes nothing, ever.
 *
 * Filesystem access goes through `read` so the FAILURE semantics can be exercised in CI without
 * the external H1 — the point being that a mismatch must be reportable as a failure by callers,
 * not merely logged. Returns { ok, results } where every result is "same" | "differs" | "missing".
 */
export function compareArtifacts({ png, specText, repoRoot = REPO, read = readIfExists, log = () => {} }) {
  const results = [];
  for (const key of ["edit", "transition", "protect"]) {
    const current = read(maskPath(key, repoRoot));
    results.push({ file: FILES[key], status: current === null ? "missing" : (Buffer.from(current).equals(png[key]) ? "same" : "differs") });
  }
  const currentSpec = read(specPath(repoRoot));
  results.push({ file: FILES.spec, status: currentSpec === null ? "missing" : (currentSpec.toString("utf8") === specText ? "same" : "differs") });

  const ok = results.every((rr) => rr.status === "same");
  for (const rr of results) {
    const label = rr.status === "same" ? "byte-identical" : rr.status === "missing" ? "MISSING" : "DIFFERS from a fresh build";
    log(`  ${rr.status === "same" ? "✓" : "✖"} ${rr.file} ${label}`);
  }
  log(ok ? "check: PASS — nothing written" : "check: FAIL — nothing written");
  return { ok, results };
}

/**
 * Maps a run() result to a process exit code. A failed --check returns { ok: false } rather than
 * throwing, so without this the CLI would exit 0 after printing "check: FAIL" and CI would read a
 * failed verification as success. Anything that is not an explicit ok:true is a failure.
 */
export function exitCodeFor(result) {
  return (result && result.ok === true) ? 0 : 1;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
function argOf(flag) { const i = process.argv.indexOf(flag); return i > 0 ? process.argv[i + 1] : null; }

export function run({ h1Path, check, repoRoot = REPO, log = console.log } = {}) {
  const E0 = loadE0(repoRoot);
  const H1solid = loadH1Solid(h1Path);
  const r = buildRegions(E0, H1solid);
  verifyRegions(E0, r);
  const { png, spec } = buildArtifacts(E0, r, h1Path);
  const dir = join(repoRoot, FIXTURE_DIR);
  const specText = JSON.stringify(spec, null, 2) + "\n";

  if (check) {
    const { ok, results } = compareArtifacts({ png, specText, repoRoot, log });
    return { ok, results, spec, regions: r, written: false };
  }

  mkdirSync(dir, { recursive: true });
  for (const key of ["edit", "transition", "protect"]) writeFileSync(maskPath(key, repoRoot), png[key]);
  writeFileSync(specPath(repoRoot), specText);
  for (const key of ["edit", "transition", "protect"])
    log(`  wrote ${FILES[key]}  ${spec.masks[key].px} px  bbox ${JSON.stringify(spec.masks[key].bbox)}  sha256 ${spec.masks[key].sha256}`);
  log(`  wrote ${FILES.spec}`);
  return { ok: true, spec, regions: r, written: true };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const result = run({ h1Path: argOf("--h1"), check: process.argv.includes("--check") });
    // A failed --check does not throw — it returns { ok: false } — so the CLI must translate that
    // into a non-zero status itself, or a caller reads "check: FAIL" as success. `process.exitCode`
    // rather than `process.exit()`, so buffered stdout is flushed before the process ends.
    process.exitCode = exitCodeFor(result);
  } catch (err) {
    console.error("✖ " + err.message);
    process.exitCode = 1;
  }
}
