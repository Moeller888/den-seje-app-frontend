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
const RAW = join(OUT_DIR, "torso-armor-knight-raw.png");
const CANDIDATE = join(OUT_DIR, "torso-armor-knight-candidate.png");
const rel = (p) => resolve(p).slice(resolve(REPO).length + 1).split(sep).join("/");

const MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
const SIZE = `${OUT_W}x${OUT_H}`;          // the Master canvas the brief requires

// Prompt derived from docs/167a-r2-torso-a2-art-brief.md §1 and §3. The exclusions are not stylistic
// preferences: the arms are BARE in the R2 base and the mask forbids drawing on them, so pauldrons,
// arm plates and gauntlets would be rejected by the harness no matter how good they looked.
const PROMPT = [
  "A FRONT-FACING children's knight armour CHEST PIECE, front view only, as a clothing overlay.",
  "A rounded steel breastplate with a simple centre ridge, small shoulder caps that stop at the",
  "shoulder line, its own armour collar around the neck opening, and a leather belt with a plain",
  "buckle at the waist. Optionally a short skirt of two or three broad plates below the belt.",
  "NO arms, NO arm plates, NO pauldrons sticking out sideways, NO gauntlets, NO hands.",
  "Transparent background. ONLY the armour garment — no head, no neck, no face, no skin, no hair,",
  "no legs, no character, no mannequin, no scene, no text, no logo, no drop shadow.",
  "Style: premium anime mobile-game equipment, clean cel-shaded, flat shading with one clear",
  "highlight and one shadow tone, bold readable silhouette that still reads at thumbnail size.",
  "Centred garment only, filling most of the frame vertically.",
].join(" ");

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
      out[di * 4] = src.rgba[si * 4];
      out[di * 4 + 1] = src.rgba[si * 4 + 1];
      out[di * 4 + 2] = src.rgba[si * 4 + 2];
      out[di * 4 + 3] = src.rgba[si * 4 + 3];
    }
  }
  return { png: encodePngRGBA(OUT_W, OUT_H, out), scale: +scale.toFixed(4), sourceBbox: sb, targetBbox: tb };
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
  writeFileSync(RAW, bytes);
  return bytes;
}

async function main(argv) {
  const hard = loadMask("torso-occlusion-hard-v1.png");
  const edit = loadMask("torso-edit-allowed-v1.png");

  const fitOnlyIdx = argv.indexOf("--fit-only");
  let raw;
  if (fitOnlyIdx !== -1) {
    const p = argv[fitOnlyIdx + 1] || RAW;
    if (!existsSync(p)) { console.error("raw image not found: " + p); process.exit(1); }
    raw = readFileSync(p);
  } else {
    raw = await generate();
    if (!raw) return;                       // no key: instructions were printed, nothing attempted
  }

  const fitted = fitAndClip(raw, hard, edit);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(CANDIDATE, fitted.png);

  console.log(JSON.stringify({
    status: fitOnlyIdx !== -1 ? "REFITTED" : "GENERATED",
    model: fitOnlyIdx !== -1 ? undefined : MODEL,
    size: SIZE,
    rawBytes: raw.length, rawSha256: sha256(raw),
    candidateBytes: fitted.png.length, candidateSha256: sha256(fitted.png),
    fit: { scale: fitted.scale, sourceBbox: fitted.sourceBbox, targetBbox: fitted.targetBbox },
    raw: rel(RAW), candidate: rel(CANDIDATE),
    next: "npm run avatar:r2-torso-check -- " + rel(CANDIDATE),
    boundaries: "gitignored build artifacts only; nothing promoted to assets/; torso slot still gated; AVATAR_R2 false",
  }, null, 2));
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  main(process.argv.slice(2)).catch((e) => { console.error("✖ " + ((e && e.message) || String(e))); process.exit(1); });
}
