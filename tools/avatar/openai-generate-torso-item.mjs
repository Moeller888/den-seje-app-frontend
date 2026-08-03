// 167A option A / step A2 — OpenAI Image API adapter: generate EXACTLY ONE torso overlay candidate.
// ---------------------------------------------------------------------------
// Brief:   docs/167a-r2-torso-a2-art-brief.md (D-086)
// Masks:   tools/avatar/fixtures/r2-torso/ (D-085, A1_ACCEPTED)
// Judge:   npm run avatar:r2-torso-check -- <candidate.png>
//
// Mirrors openai-generate-item.mjs (the sanctioned glasses adapter) and keeps its boundaries:
//   * Exactly ONE image (n:1). One slot: torso. NO bulk.
//   * API key from env OPENAI_API_KEY only — NEVER hardcoded, NEVER printed, NEVER stored.
//   * Output is a gitignored build artifact under tools/avatar/build/ai-input/.
//   * No runtime/DB/assets/manifest change. Nothing is promoted. AVATAR_R2 untouched.
//
// WHY THIS TOOL DOES MORE THAN GENERATE: a raw text-to-image result is centred on its own canvas and
// has no idea where the R2 figure's torso is. It therefore cannot be judged as a candidate. After
// generation this adapter performs two DETERMINISTIC, non-AI steps — fit and clip — so what reaches
// the harness is an actual overlay rather than a picture of one:
//   fit  : uniform scale + translate so the artwork's opaque bbox matches the mandatory region's bbox
//   clip : multiply by the edit-allowed mask, so nothing can land on protected anatomy
// Both are pure functions of the raw image; re-running them on the same raw file is reproducible.
//
//   npm run avatar:generate-openai-torso            (generate + fit + clip)
//   npm run avatar:generate-openai-torso -- --fit-only <raw.png>   (re-fit an existing raw file)
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, sep } from "node:path";
import { decodePng, encodePngRGBA, OUT_W, OUT_H } from "./build-r2-torso-occlusion-mask.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const FIX_DIR = join(HERE, "fixtures", "r2-torso");
const OUT_DIR = join(HERE, "build", "ai-input");
// Which prompt this run sends. Declared here because the output filenames derive from it.
export const PROMPT_VERSION = "v3";
// Output names carry the PROMPT VERSION (D-095). Without this, a v2 run would overwrite in place the
// files that ARE the accepted asset's provenance: `…-raw.png` is the non-reproducible generation
// (`83fcff0c…`) and `…-candidate.png` is the owner-accepted artwork (`31f4b2b6…`, D-088). The owner's
// out-of-repo backup would make that recoverable, but "recoverable" is not a reason to overwrite
// approved work. v1 keeps its historical, unsuffixed names so nothing already recorded moves.
const SUFFIX = PROMPT_VERSION === "v1" ? "" : `-${PROMPT_VERSION}`;
const RAW = join(OUT_DIR, `torso-armor-knight-raw${SUFFIX}.png`);
const CANDIDATE = join(OUT_DIR, `torso-armor-knight-candidate${SUFFIX}.png`);
const CANDIDATE_NO_BACKFILL = join(OUT_DIR, `torso-armor-knight-candidate${SUFFIX}-nobackfill.png`);
const BACKFILL_MAP = join(OUT_DIR, `torso-armor-knight-backfill-map${SUFFIX}.png`);
const BACKFILL_META = join(OUT_DIR, `torso-armor-knight-candidate${SUFFIX}.backfill.json`);
// Hard stop: these two files are provenance for an accepted, shipped asset. Nothing in this tool may
// write them again, whatever the version suffix ends up being.
const PROTECTED_OUTPUTS = Object.freeze([
  join(OUT_DIR, "torso-armor-knight-raw.png"),
  join(OUT_DIR, "torso-armor-knight-candidate.png"),
]);
function assertNotProtected(p) {
  if (PROTECTED_OUTPUTS.some((q) => resolve(q) === resolve(p))) {
    throw new Error(`refusing to overwrite accepted-asset provenance: ${p}\n  (D-088 accepted 31f4b2b6…; its raw is non-reproducible)`);
  }
  return p;
}
const rel = (p) => resolve(p).slice(resolve(REPO).length + 1).split(sep).join("/");

const MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
const SIZE = `${OUT_W}x${OUT_H}`;          // the Master canvas the brief requires
export const ALPHA_FLOOR = 24;             // below this, a pixel is background glow rather than artwork
export const MIN_COMPONENT = 64;           // Master px, same speck threshold as the A1 mask builder
export const DEFAULT_OVERSCAN = 1.0;

// Prompt derived from docs/167a-r2-torso-a2-art-brief.md §1 and §3. The exclusions are not stylistic
// preferences: the arms are BARE in the R2 base and the mask forbids drawing on them, so pauldrons,
// arm plates and gauntlets would be rejected by the harness no matter how good they looked.
// Revised after candidate 1 (D-087). That image was on-brief as art but its SILHOUETTE did not match
// the mask: it tapered at the waist and had slits between the skirt plates, leaving 11.4 % of the
// mandatory region bare. Scaling it up closed the number but cropped away the breastplate, collar and
// plate edges — it stopped reading as the Ridderdragt. So the shape is now part of the prompt.
// PROMPT v1 produced candidates 1 and 2 (D-087/D-088). Kept verbatim so the register can say which
// prompt produced which candidate, and so v2 can be diffed against it rather than described.
export const PROMPT_V1 = [
  "A FRONT-FACING children's knight armour TUNIC, front view only, as a clothing overlay.",
  "SHAPE IS CRITICAL: the outline must be a broad T-shirt shape — wide straight shoulders, short",
  "sleeve caps, straight sides that do NOT taper at the waist, and a straight flat hem at the bottom.",
  "The garment must be a SINGLE SOLID SHAPE with no gaps, no slits, no cut-outs and no separated",
  "plates: any skirt below the belt is one continuous piece.",
  "Decorate that shape as steel plate armour: a rounded breastplate with a centre ridge, a closed",
  "armour collar filling the neckline, and a leather belt with a plain buckle at the waist.",
  "NO arms, NO arm plates, NO pauldrons sticking out sideways, NO gauntlets, NO hands.",
  "FULLY TRANSPARENT background — no glow, no vignette, no gradient, no drop shadow, no backdrop.",
  "ONLY the garment — no head, no neck, no face, no skin, no hair, no legs, no character,",
  "no mannequin, no scene, no text, no logo.",
  "Style: premium anime mobile-game equipment, clean cel-shaded, flat shading with one clear",
  "highlight and one shadow tone, bold silhouette that still reads at thumbnail size.",
  "Centred, filling most of the frame.",
].join(" ");

// PROMPT v2 — the D-095 fix. v1 asked for "short sleeve caps"; the model delivered exactly that, and
// the sleeves ended 41.2 % down the garment while the base tee's reach 50.1 %. That 9-point shortfall
// IS the 5,990 backfill pixels in the shoulder band. Every other line is unchanged from v1, so a
// difference in the result can be attributed to the sleeve instruction and nothing else.
//
// The requirement is stated PROPORTIONALLY (fractions of the garment's own height and width) because
// the generation is scaled before it meets the mask — an absolute pixel figure would be meaningless
// to the model and wrong after placement.
export const PROMPT_V2 = [
  "A FRONT-FACING children's knight armour TUNIC, front view only, as a clothing overlay.",
  "SHAPE IS CRITICAL: the outline must be a broad T-shirt shape — wide straight shoulders,",
  "straight sides that do NOT taper at the waist, and a straight flat hem at the bottom.",
  "SLEEVE LENGTH IS THE MOST IMPORTANT REQUIREMENT: the sleeves must extend DOWN to HALFWAY between",
  "the shoulders and the hem — reaching the middle of the garment's height, well below the armpit.",
  "They are elbow-length sleeves, NOT short caps and NOT tiny shoulder pads.",
  "The sleeve ends must be the WIDEST part of the whole silhouette, wider than the chest and the",
  "waist, forming a broad T shape whose horizontal bar is thick and reaches the middle of the height.",
  "Each sleeve ends in a straight horizontal cuff, not a rounded taper.",
  "The garment must be a SINGLE SOLID SHAPE with no gaps, no slits, no cut-outs and no separated",
  "plates: any skirt below the belt is one continuous piece.",
  "Decorate that shape as steel plate armour: a rounded breastplate with a centre ridge, a closed",
  "armour collar filling the neckline, and a leather belt with a plain buckle at the waist.",
  "NO arms, NO arm plates, NO pauldrons sticking out sideways, NO gauntlets, NO hands.",
  "FULLY TRANSPARENT background — no glow, no vignette, no gradient, no drop shadow, no backdrop.",
  "ONLY the garment — no head, no neck, no face, no skin, no hair, no legs, no character,",
  "no mannequin, no scene, no text, no logo.",
  "Style: premium anime mobile-game equipment, clean cel-shaded, flat shading with one clear",
  "highlight and one shadow tone, bold silhouette that still reads at thumbnail size.",
  "Centred, filling most of the frame.",
].join(" ");

// PROMPT v3 — fixes what v2 broke, and the fix is structural rather than verbal.
//
// v2 opened with "SLEEVE LENGTH IS THE MOST IMPORTANT REQUIREMENT". The model obeyed the ranking:
// sleeves reached the middle (shoulder backfill 5,990 → 3,809) but the collar became an open scoop
// and the skirt gained an arch cut-out — both explicitly forbidden in the SAME prompt. Collar
// coverage fell 100 % → 41.5 %, skirt 100 % → 56.5 %, and total backfill rose 8,608 → 10,486.
//
// The lesson is not "word the sleeves differently". It is that RANKING one requirement teaches the
// model that the others are negotiable. v3 therefore states three shape requirements as an
// unranked, numbered set of equals, and — because a model corrects better against a concrete
// counter-example than an abstract rule — names the exact two failures to avoid.
export const PROMPT_V3 = [
  "A FRONT-FACING children's knight armour TUNIC, front view only, as a clothing overlay.",
  "THREE SHAPE REQUIREMENTS, ALL EQUALLY MANDATORY — none may be sacrificed for another:",
  "(1) SLEEVES: elbow-length, extending DOWN to halfway between the shoulders and the hem, ending in",
  "a straight horizontal cuff. The sleeve ends are the widest part of the silhouette, forming a broad",
  "T whose horizontal bar is thick. NOT short caps, NOT tiny shoulder pads.",
  "(2) COLLAR: a CLOSED, HIGH armour collar that completely fills the neckline and rings the neck,",
  "leaving only a small round hole for the neck itself. NOT a scooped, U-shaped, V-shaped or open",
  "neckline; NOT a wide bare chest opening.",
  "(3) BOTTOM: the skirt below the belt is ONE CONTINUOUS SOLID PIECE ending in a straight flat",
  "horizontal hem. NO arch, NO notch, NO split, NO slit, NO cut-out and NO gap anywhere along the",
  "bottom edge or up the centre.",
  "The whole garment is a SINGLE SOLID SHAPE with straight sides that do NOT taper at the waist.",
  "Decorate that shape as steel plate armour: a rounded breastplate with a centre ridge, and a",
  "leather belt with a plain buckle at the waist.",
  "NO arms, NO arm plates, NO pauldrons sticking out sideways, NO gauntlets, NO hands.",
  "FULLY TRANSPARENT background — no glow, no vignette, no gradient, no drop shadow, no backdrop.",
  "ONLY the garment — no head, no neck, no face, no skin, no hair, no legs, no character,",
  "no mannequin, no scene, no text, no logo.",
  "Style: premium anime mobile-game equipment, clean cel-shaded, flat shading with one clear",
  "highlight and one shadow tone, bold silhouette that still reads at thumbnail size.",
  "Centred, filling most of the frame.",
].join(" ");

// The prompt actually sent. Recorded in the sidecar as `promptVersion`, so a candidate can always
// be traced back to the wording that produced it.
const PROMPT = PROMPT_V3;

const sha256 = (b) => createHash("sha256").update(b).digest("hex");

function loadMask(name) {
  const spec = JSON.parse(readFileSync(join(FIX_DIR, "torso-mask-spec-v1.json"), "utf8"));
  const buf = readFileSync(join(FIX_DIR, name));
  if (sha256(buf) !== spec.masks[name].sha256) {
    throw new Error(`${rel(join(FIX_DIR, name))} does not match the SHA in the spec — re-run the A1 builder.`);
  }
  const img = decodePng(buf, name);
  const m = new Uint8Array(img.w * img.h);
  for (let i = 0; i < m.length; i++) m[i] = img.rgba[i * 4 + 3] > 0 ? 1 : 0;
  return m;
}
function bboxOf(mask, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// ── deterministic fit + clip ────────────────────────────────────────────────
export function fitAndClip(rawBuf, hard, edit, opts = {}) {
  const src = decodePng(rawBuf, "raw");
  const opaque = new Uint8Array(src.w * src.h);
  for (let i = 0; i < opaque.length; i++) opaque[i] = src.rgba[i * 4 + 3] >= 128 ? 1 : 0;
  const sb = bboxOf(opaque, src.w, src.h);
  if (!sb) throw new Error("the generated image has no opaque pixels — nothing to fit");
  const tb = bboxOf(hard, OUT_W, OUT_H);

  // Uniform scale so the artwork covers the mandatory region in BOTH axes, then centre on it. Covering
  // rather than containing is deliberate: leftover artwork is clipped away, whereas a shortfall would
  // leave the base tee visible and fail the occlusion gate.
  const scale = Math.max(tb.w / sb.w, tb.h / sb.h) * (opts.overscan ?? 1.0);
  const srcCx = sb.x0 + sb.w / 2, srcCy = sb.y0 + sb.h / 2;
  const dstCx = tb.x0 + tb.w / 2, dstCy = tb.y0 + tb.h / 2;

  const out = Buffer.alloc(OUT_W * OUT_H * 4);
  for (let y = 0; y < OUT_H; y++) {
    for (let x = 0; x < OUT_W; x++) {
      const di = y * OUT_W + x;
      if (!edit[di]) continue;                                   // clip: nothing outside the edit zone
      const sx = Math.round((x - dstCx) / scale + srcCx);
      const sy = Math.round((y - dstCy) / scale + srcCy);
      if (sx < 0 || sy < 0 || sx >= src.w || sy >= src.h) continue;
      const si = sy * src.w + sx;
      let a = src.rgba[si * 4 + 3];
      // ALPHA FLOOR — asset hygiene, not redesign. The image API baked a soft vignette into the
      // "transparent" background of candidate 1, which the halo gate correctly rejected. Everything
      // below the floor is that glow, so it is dropped outright; nothing above it is altered.
      if (a < ALPHA_FLOOR) continue;
      out[di * 4] = src.rgba[si * 4];
      out[di * 4 + 1] = src.rgba[si * 4 + 1];
      out[di * 4 + 2] = src.rgba[si * 4 + 2];
      out[di * 4 + 3] = a;
    }
  }
  // Speck removal, same rule the mask builder uses: an opaque fragment under MIN_COMPONENT px is
  // debris from the vignette, not garment geometry.
  const dropped = dropSmallOpaqueComponents(out, OUT_W, OUT_H, MIN_COMPONENT);

  // BACKFILL — the step that makes full occlusion achievable at all. Fit and prompt work got coverage
  // to ~95 %; the rest is structural (the mask's outer shoulder corners, and negative space inside the
  // art such as a slit between skirt plates). Scaling further closed the number but cropped the
  // breastplate and collar away, i.e. the item stopped reading as the Ridderdragt. So instead: every
  // pixel of the MANDATORY region that the art leaves bare is filled with the garment's own colour,
  // taken from the nearest opaque artwork pixel. It paints under nothing and over nothing — the art is
  // untouched wherever it exists, and D-037's "fully occlude the base tee" is satisfied by
  // construction rather than by luck.
  let backfilled = 0;
  let backfillMask = new Uint8Array(OUT_W * OUT_H);
  if (opts.backfill !== false) {
    backfilled = backfillMandatory(out, hard, OUT_W, OUT_H, backfillMask);
  }
  return {
    png: encodePngRGBA(OUT_W, OUT_H, out), scale: +scale.toFixed(4),
    sourceBbox: sb, targetBbox: tb, alphaFloor: ALPHA_FLOOR, specksDropped: dropped,
    backfilledPx: backfilled, backfillMask,
    backfill: describeBackfill(backfillMask, hard, out, OUT_W, OUT_H),
  };
}

// Disclosure, not decoration: a candidate must never hide how much of what you see was constructed by
// the adapter rather than drawn by the image model.
export const BACKFILL_BANDS = Object.freeze({ collar: [0, 560], shoulder: [560, 714], torso: [714, 902], skirt: [902, 1000] });
export function describeBackfill(mask, hard, rgba, w, h) {
  let px = 0, hardPx = 0, visible = 0;
  const bands = { collar: 0, shoulder: 0, torso: 0, skirt: 0 };
  for (let i = 0; i < w * h; i++) {
    if (hard[i]) hardPx++;
    if (rgba[i * 4 + 3] >= 250) visible++;
    if (!mask[i]) continue;
    px++;
    const y = (i / w) | 0;
    for (const [name, [a, b]] of Object.entries(BACKFILL_BANDS)) if (y >= a && y < b) { bands[name]++; break; }
  }
  // largest contiguous backfill region (8-connected)
  const seen = new Uint8Array(w * h); let largest = 0;
  const N = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || seen[s]) continue;
    const q = [s]; seen[s] = 1;
    for (let k = 0; k < q.length; k++) {
      const j = q[k], y = (j / w) | 0, x = j % w;
      for (const [dx, dy] of N) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const t = yy * w + xx;
        if (mask[t] && !seen[t]) { seen[t] = 1; q.push(t); }
      }
    }
    if (q.length > largest) largest = q.length;
  }
  // does the fill reach the garment's visible outer edge? (a backfilled pixel with a non-hard neighbour)
  let touchesOuterContour = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (!mask[i]) continue;
    for (const [dx, dy] of N) if (!hard[(y + dy) * w + (x + dx)]) { touchesOuterContour++; break; }
  }
  return {
    px, shareOfHardMask: hardPx ? +(px / hardPx).toFixed(5) : 0,
    shareOfVisibleArtwork: visible ? +(px / visible).toFixed(5) : 0,
    largestContiguousRegionPx: largest, touchesOuterContourPx: touchesOuterContour,
    byBand: bands,
    note: "backfill = pixels the ADAPTER constructed from the nearest garment-body colour, not pixels the image model drew",
  };
}

// Fill bare pixels of the mandatory region with the colour of the nearest opaque artwork pixel.
// Deterministic: a two-pass chamfer sweep, so the result depends only on the input image.
function backfillMandatory(rgba, hard, w, h, outMask) {
  // Source pixels are opaque GARMENT BODY only. The first cut sampled any opaque pixel, so the
  // nearest source for a bare shoulder corner was the black outline stroke, and the fill dragged dark
  // wedges into the mask's corners — the gate went green while the picture got worse. Excluding the
  // line work (luma < 100) makes the fill extend the steel tone instead.
  const src = new Int32Array(w * h).fill(-1);
  for (let i = 0; i < w * h; i++) {
    if (rgba[i * 4 + 3] < 250) continue;
    const luma = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
    if (luma < 100) continue;                       // outline stroke: never a fill colour
    src[i] = i;
  }
  const dist = new Float64Array(w * h).fill(Infinity);
  for (let i = 0; i < w * h; i++) if (src[i] >= 0) dist[i] = 0;
  const relax = (i, j, d) => {
    if (src[j] < 0) return;
    const nd = dist[j] + d;
    if (nd < dist[i]) { dist[i] = nd; src[i] = src[j]; }
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (x > 0) relax(i, i - 1, 1); if (y > 0) relax(i, i - w, 1);
    if (x > 0 && y > 0) relax(i, i - w - 1, 1.414); if (x < w - 1 && y > 0) relax(i, i - w + 1, 1.414);
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x;
    if (x < w - 1) relax(i, i + 1, 1); if (y < h - 1) relax(i, i + w, 1);
    if (x < w - 1 && y < h - 1) relax(i, i + w + 1, 1.414); if (x > 0 && y < h - 1) relax(i, i + w - 1, 1.414);
  }
  let n = 0;
  for (let i = 0; i < w * h; i++) {
    if (!hard[i] || rgba[i * 4 + 3] >= 250) continue;
    const s = src[i];
    if (s < 0) continue;
    rgba[i * 4] = rgba[s * 4]; rgba[i * 4 + 1] = rgba[s * 4 + 1]; rgba[i * 4 + 2] = rgba[s * 4 + 2]; rgba[i * 4 + 3] = 255;
    if (outMask) outMask[i] = 1;
    n++;
  }
  return n;
}

// 8-connected components over the OPAQUE pixels; anything smaller than minPx is erased.
function dropSmallOpaqueComponents(rgba, w, h, minPx) {
  const on = new Uint8Array(w * h);
  // 250, not 128: the harness judges islands on its OPAQUE definition, so cleaning on a looser
  // threshold leaves specks that are isolated in the judge's view but attached in ours.
  for (let i = 0; i < w * h; i++) on[i] = rgba[i * 4 + 3] >= 250 ? 1 : 0;
  const seen = new Uint8Array(w * h);
  const N = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  let dropped = 0;
  for (let s = 0; s < w * h; s++) {
    if (!on[s] || seen[s]) continue;
    const px = [s]; seen[s] = 1;
    for (let k = 0; k < px.length; k++) {
      const j = px[k], y = (j / w) | 0, x = j % w;
      for (const [dx, dy] of N) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const t = yy * w + xx;
        if (on[t] && !seen[t]) { seen[t] = 1; px.push(t); }
      }
    }
    if (px.length >= minPx) continue;
    for (const i of px) { rgba[i * 4] = 0; rgba[i * 4 + 1] = 0; rgba[i * 4 + 2] = 0; rgba[i * 4 + 3] = 0; }
    dropped++;
  }
  return dropped;
}

function instructAndExit() {
  console.log(JSON.stringify({
    status: "MISSING_OPENAI_API_KEY",
    howToSet: { bash: "export OPENAI_API_KEY=sk-...   (then re-run)", powershell: "$env:OPENAI_API_KEY = 'sk-...'  (then re-run)" },
    note: "Key is read from the environment only and is never printed or stored. No generation was attempted.",
  }, null, 2));
}

async function generate() {
  const KEY = process.env.OPENAI_API_KEY;
  if (!KEY) { instructAndExit(); return null; }
  mkdirSync(OUT_DIR, { recursive: true });
  let res;
  try {
    res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, prompt: PROMPT, n: 1, size: SIZE, background: "transparent", output_format: "png", quality: "high" }),
    });
  } catch (e) {
    console.error(JSON.stringify({ status: "NETWORK_ERROR", message: String((e && e.message) || e) }, null, 2));
    process.exit(1);
  }
  if (!res.ok) {
    let detail = "";
    try { const j = await res.json(); detail = j?.error?.message || JSON.stringify(j); } catch { detail = await res.text().catch(() => ""); }
    console.error(JSON.stringify({ status: "OPENAI_API_ERROR", httpStatus: res.status, model: MODEL, message: detail }, null, 2));
    process.exit(1);
  }
  const json = await res.json();
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) { console.error(JSON.stringify({ status: "NO_IMAGE_RETURNED", model: MODEL }, null, 2)); process.exit(1); }
  const bytes = Buffer.from(b64, "base64");
  writeFileSync(assertNotProtected(RAW), bytes);
  return bytes;
}

async function main(argv) {
  const hard = loadMask("torso-occlusion-hard-v1.png");
  const edit = loadMask("torso-edit-allowed-v1.png");

  const fitOnlyIdx = argv.indexOf("--fit-only");
  const overIdx = argv.indexOf("--overscan");
  const overscan = overIdx !== -1 && argv[overIdx + 1] ? Number(argv[overIdx + 1]) : DEFAULT_OVERSCAN;
  if (!(overscan > 0 && overscan <= 1.6)) { console.error("--overscan must be in (0, 1.6]"); process.exit(1); }

  let raw;
  if (fitOnlyIdx !== -1) {
    const p = (argv[fitOnlyIdx + 1] && !argv[fitOnlyIdx + 1].startsWith("--")) ? argv[fitOnlyIdx + 1] : RAW;
    if (!existsSync(p)) { console.error("raw image not found: " + p); process.exit(1); }
    raw = readFileSync(p);
  } else {
    raw = await generate();
    if (!raw) return;                       // no key: instructions were printed, nothing attempted
  }

  const backfill = !argv.includes("--no-backfill");
  const fitted = fitAndClip(raw, hard, edit, { overscan, backfill });
  mkdirSync(OUT_DIR, { recursive: true });
  const target = backfill ? CANDIDATE : CANDIDATE_NO_BACKFILL;
  writeFileSync(assertNotProtected(target), fitted.png);

  // Sidecar: the harness reads it so the report states, in the same place as the verdict, how much of
  // the candidate the adapter constructed. Written next to the candidate, never into assets/.
  const meta = {
    tool: "openai-generate-torso-item", overscan, alphaFloor: fitted.alphaFloor,
    specksDropped: fitted.specksDropped, backfilledPx: fitted.backfilledPx,
    sourceRawSha256: sha256(raw), candidateSha256: sha256(fitted.png),
    fit: { scale: fitted.scale, sourceBbox: fitted.sourceBbox, targetBbox: fitted.targetBbox },
    backfill: fitted.backfill,
  };
  if (backfill) {
    writeFileSync(assertNotProtected(BACKFILL_META), JSON.stringify(meta, null, 2) + "\n");
    // A visual map of exactly which pixels were constructed — magenta on transparent.
    const map = Buffer.alloc(OUT_W * OUT_H * 4);
    for (let i = 0; i < OUT_W * OUT_H; i++) {
      if (!fitted.backfillMask[i]) continue;
      map[i * 4] = 255; map[i * 4 + 1] = 0; map[i * 4 + 2] = 200; map[i * 4 + 3] = 255;
    }
    writeFileSync(assertNotProtected(BACKFILL_MAP), encodePngRGBA(OUT_W, OUT_H, map));
  }

  console.log(JSON.stringify({
    status: fitOnlyIdx !== -1 ? "REFITTED" : "GENERATED",
    model: fitOnlyIdx !== -1 ? undefined : MODEL,
    size: SIZE, overscan, backfill,
    rawBytes: raw.length, rawSha256: sha256(raw),
    candidateBytes: fitted.png.length, candidateSha256: sha256(fitted.png),
    alphaFloor: fitted.alphaFloor, specksDropped: fitted.specksDropped, backfilledPx: fitted.backfilledPx,
    backfillDisclosure: fitted.backfill,
    fit: { scale: fitted.scale, sourceBbox: fitted.sourceBbox, targetBbox: fitted.targetBbox },
    raw: rel(RAW), candidate: rel(target),
    next: "npm run avatar:r2-torso-check -- " + rel(target),
    boundaries: "gitignored build artifacts only; nothing promoted to assets/; torso slot still gated; AVATAR_R2 false",
  }, null, 2));
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  main(process.argv.slice(2)).catch((e) => { console.error("✖ " + ((e && e.message) || String(e))); process.exit(1); });
}
