// 167A Phase-2 Gate 2 — Deterministic inpainting INPUT package for the v2 base
// ---------------------------------------------------------------------------
// Prepares the masked-inpainting INPUTS for the AI-assisted masked decomposition
// of the v2 base (D-042) — it does NOT generate images and does NOT call ComfyUI.
// A person/tool later feeds these into Flux.2 Klein (masked inpaint) → the v2 base
// candidate → 164B.3 review → cwebp → manifest.
//
//   Northstar Master.png (1024×1536, frozen, READ-ONLY)
//     + avatar-anchor-template-v1.json (164L/164S/164T anchors)
//   →  tools/avatar/build/phase2/inpaint-v2-base/   (GITIGNORED review/build package)
//        source-master.png · mask-face-features.png · mask-eyes.png · mask-hair.png
//        · mask-signature-outfit.png · mask-v2-base-combined.png
//        · preview-mask-overlay.png · prompt-sheet.md · delivery-checklist.md
//
// Masks: WHITE (255) = inpaint/remove-region · BLACK (0) = preserve. 1024×1536.
//
// HARD BOUNDARIES (D-040/D-041/D-042): deterministic, NON-AI, pure Node built-ins,
// no deps. Master READ-ONLY. Output is a build/review package — NOT runtime assets,
// NOT auto-promoted, no assets/avatar-r2 write, no R2_MANIFEST change, AVATAR_R2
// untouched. No image generation here; no /prompt call.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { inflateSync, deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const MASTER = join(REPO, "assets", "avatar", "reference", "Northstar Master.png");
const ANCHORS = join(HERE, "build", "anchors", "avatar-anchor-template-v1.json");
const OUT_DIR = join(HERE, "build", "phase2", "inpaint-v2-base");

const EXPECT_SHA = "2ca10ef868b9564164f28afc8bb03baec99cc10fd03f7200ed2dc58edd607a21";
const W = 1024, H = 1536;

// White-matte flood-fill threshold (border-connected background → transparent/figure=0).
const WHITE_HI = 250;
// Outfit mask starts at the collar (raised in v2 to catch the green sweater collar remnant).
const OUTFIT_TOP_Y = 505;
// Hair color-detection box (head+hair region; keeps brown detection off the body).
const HAIR_BOX = { x0: 260, y0: 40, x1: 770, y1: 490 };
const HAIR_DILATE = 12;  // px, closes hair-stroke gaps + temple smudges + covers outline
const EYE_GROW = 16;     // px, grow the eye boxes (covers eye-corner/temple smudges)
const FEATHER = 9;       // px, soft edge on the combined mask for seamless inpaint blends

// ── CRC32 + PNG codec (colour type 2 in, colour type 6 out) — from extract-master-base ──
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function paeth(a, b, c) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
function decodePng(buf) {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) throw new Error("not a PNG");
  let off = 8, ihdr = null; const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString("ascii", off + 4, off + 8), data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") ihdr = { w: data.readUInt32BE(0), h: data.readUInt32BE(4), bitDepth: data[8], colorType: data[9], interlace: data[12] };
    else if (type === "IDAT") idat.push(data); else if (type === "IEND") break;
    off += 12 + len;
  }
  if (!ihdr || ihdr.bitDepth !== 8 || ihdr.colorType !== 2 || ihdr.interlace !== 0) throw new Error("need 8-bit RGB non-interlaced; got " + JSON.stringify(ihdr));
  const raw = inflateSync(Buffer.concat(idat)), { w, h } = ihdr, bpp = 3, stride = w * bpp;
  const rgb = Buffer.alloc(h * stride); let prev = Buffer.alloc(stride), p = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[p++], cur = raw.subarray(p, p + stride); p += stride;
    const out = rgb.subarray(y * stride, y * stride + stride);
    for (let x = 0; x < stride; x++) { const a = x >= bpp ? out[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0; let v = cur[x]; if (filter === 1) v += a; else if (filter === 2) v += b; else if (filter === 3) v += (a + b) >> 1; else if (filter === 4) v += paeth(a, b, c); out[x] = v & 0xff; }
    prev = out;
  }
  return { w, h, rgb };
}
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0); const t = Buffer.from(type, "ascii"); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0); return Buffer.concat([len, t, data, crc]); }
function encodePngRGBA(w, h, rgba) {
  const stride = w * 4, raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) { raw[y * (stride + 1)] = 0; rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

// ── figure alpha via border-connected white-matte flood fill ─────────────────
function figureAlpha(rgb) {
  const isMatte = (i) => rgb[i * 3] >= WHITE_HI && rgb[i * 3 + 1] >= WHITE_HI && rgb[i * 3 + 2] >= WHITE_HI;
  const bg = new Uint8Array(W * H), st = [];
  const push = (i) => { if (!bg[i] && isMatte(i)) { bg[i] = 1; st.push(i); } };
  for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
  while (st.length) { const i = st.pop(), x = i % W, y = (i / W) | 0; if (x > 0) push(i - 1); if (x < W - 1) push(i + 1); if (y > 0) push(i - W); if (y < H - 1) push(i + W); }
  const fig = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) fig[i] = bg[i] ? 0 : 1; return fig;
}

// ── colour classifiers ────────────────────────────────────────────────────────
function isSkin(r, g, b) { return r > 175 && g > 135 && r >= g && g >= b && (r - b) >= 25 && (r - b) <= 145; }
function isHair(r, g, b) { return r >= 48 && r < 205 && g < r * 0.93 && b < g * 0.97 && (r - b) >= 18 && r > g && g >= b; }

// ── mask primitives (Uint8 0/255) ────────────────────────────────────────────
function blank() { return new Uint8Array(W * H); }
function fillRect(m, x, y, w, h) { const x1 = Math.max(0, x | 0), y1 = Math.max(0, y | 0), x2 = Math.min(W - 1, (x + w) | 0), y2 = Math.min(H - 1, (y + h) | 0); for (let yy = y1; yy <= y2; yy++) for (let xx = x1; xx <= x2; xx++) m[yy * W + xx] = 255; }
function fillRoundRect(m, x, y, w, h, r) {
  const x1 = x | 0, y1 = y | 0, x2 = (x + w) | 0, y2 = (y + h) | 0;
  for (let yy = Math.max(0, y1); yy <= Math.min(H - 1, y2); yy++) for (let xx = Math.max(0, x1); xx <= Math.min(W - 1, x2); xx++) {
    let inside = true;
    // corner circles
    const cx = xx < x1 + r ? x1 + r : (xx > x2 - r ? x2 - r : xx);
    const cy = yy < y1 + r ? y1 + r : (yy > y2 - r ? y2 - r : yy);
    if ((cx !== xx || cy !== yy)) inside = (xx - cx) ** 2 + (yy - cy) ** 2 <= r * r;
    if (inside) m[yy * W + xx] = 255;
  }
}
// separable max-filter dilation
function dilate(m, r) {
  if (r <= 0) return m;
  const tmp = new Uint8Array(W * H), out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = 0; for (let d = -r; d <= r; d++) { const xx = x + d; if (xx >= 0 && xx < W && m[y * W + xx]) { v = 255; break; } } tmp[y * W + x] = v; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = 0; for (let d = -r; d <= r; d++) { const yy = y + d; if (yy >= 0 && yy < H && tmp[yy * W + x]) { v = 255; break; } } out[y * W + x] = v; }
  return out;
}
function unionInto(dst, src) { for (let i = 0; i < W * H; i++) if (src[i]) dst[i] = 255; }
function count(m) { let c = 0; for (let i = 0; i < W * H; i++) if (m[i]) c++; return c; }
function grayToRGBA(m) { const rgba = Buffer.alloc(W * H * 4); for (let i = 0; i < W * H; i++) { const v = m[i] ? 255 : 0; rgba[i * 4] = v; rgba[i * 4 + 1] = v; rgba[i * 4 + 2] = v; rgba[i * 4 + 3] = 255; } return rgba; }
function writeMask(name, m) { writeFileSync(join(OUT_DIR, name), encodePngRGBA(W, H, grayToRGBA(m))); return count(m); }
// separable box-blur (feather) on a 0/255 mask → soft 0-255 gradient (sliding window)
function boxBlur(m, r) {
  const win = 2 * r + 1; const tmp = new Float32Array(W * H); const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) { let s = 0; for (let x = -r; x <= r; x++) s += m[y * W + Math.max(0, Math.min(W - 1, x))]; for (let x = 0; x < W; x++) { tmp[y * W + x] = s / win; s += m[y * W + Math.min(W - 1, x + r + 1)] - m[y * W + Math.max(0, x - r)]; } }
  for (let x = 0; x < W; x++) { let s = 0; for (let y = -r; y <= r; y++) s += tmp[Math.max(0, Math.min(H - 1, y)) * W + x]; for (let y = 0; y < H; y++) { out[y * W + x] = Math.round(s / win); s += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x]; } }
  return out;
}
function grayValToRGBA(m) { const rgba = Buffer.alloc(W * H * 4); for (let i = 0; i < W * H; i++) { const v = m[i]; rgba[i * 4] = v; rgba[i * 4 + 1] = v; rgba[i * 4 + 2] = v; rgba[i * 4 + 3] = 255; } return rgba; }

function main() {
  const buf = readFileSync(MASTER);
  const sha = createHash("sha256").update(buf).digest("hex");
  if (sha !== EXPECT_SHA) throw new Error("Master sha mismatch (D-032) — refusing.\n  got " + sha);
  const { w, h, rgb } = decodePng(buf);
  if (w !== W || h !== H) throw new Error("Master dims " + w + "×" + h + " ≠ " + W + "×" + H);
  const a = JSON.parse(readFileSync(ANCHORS, "utf8")).anchors;

  mkdirSync(OUT_DIR, { recursive: true });
  copyFileSync(MASTER, join(OUT_DIR, "source-master.png"));

  const fig = figureAlpha(rgb);

  // face-features: face oval (rounded-rect) — brows/nose/mouth zone → repaint blank skin
  const face = blank();
  fillRoundRect(face, a.faceMaskRegion.x, a.faceMaskRegion.y, a.faceMaskRegion.width, a.faceMaskRegion.height, a.faceMaskRegion.radius || 0);

  // eyes: both eye boxes, grown
  const eyes = blank();
  fillRect(eyes, a.eyeLeftBox.x - EYE_GROW, a.eyeLeftBox.y - EYE_GROW, a.eyeLeftBox.width + 2 * EYE_GROW, a.eyeLeftBox.height + 2 * EYE_GROW);
  fillRect(eyes, a.eyeRightBox.x - EYE_GROW, a.eyeRightBox.y - EYE_GROW, a.eyeRightBox.width + 2 * EYE_GROW, a.eyeRightBox.height + 2 * EYE_GROW);

  // hair: brown figure pixels inside the head box → dilate to close strokes
  let hair = blank();
  for (let y = HAIR_BOX.y0; y <= HAIR_BOX.y1; y++) for (let x = HAIR_BOX.x0; x <= HAIR_BOX.x1; x++) {
    const i = y * W + x; if (!fig[i]) continue;
    const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2];
    if (isHair(r, g, b)) hair[i] = 255;
  }
  hair = dilate(hair, HAIR_DILATE);

  // signature-outfit: figure below the collar, minus skin (preserve visible hands/forearms/neck skin)
  const outfit = blank();
  for (let y = OUTFIT_TOP_Y; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (!fig[i]) continue;
    const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2];
    if (!isSkin(r, g, b)) outfit[i] = 255;
  }

  // combined
  const combined = blank();
  unionInto(combined, face); unionInto(combined, eyes); unionInto(combined, hair); unionInto(combined, outfit);

  const cFace = writeMask("mask-face-features.png", face);
  const cEyes = writeMask("mask-eyes.png", eyes);
  const cHair = writeMask("mask-hair.png", hair);
  const cOutfit = writeMask("mask-signature-outfit.png", outfit);
  // combined is written FEATHERED (soft grayscale edge) for seamless inpaint blends;
  // the per-region masks above stay crisp binary for review.
  const cComb = count(combined);
  const feathered = boxBlur(dilate(combined, 4), FEATHER);
  writeFileSync(join(OUT_DIR, "mask-v2-base-combined.png"), encodePngRGBA(W, H, grayValToRGBA(feathered)));

  // preview overlay: Master tinted per region
  const rgba = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) { rgba[i * 4] = rgb[i * 3]; rgba[i * 4 + 1] = rgb[i * 3 + 1]; rgba[i * 4 + 2] = rgb[i * 3 + 2]; rgba[i * 4 + 3] = 255; }
  const tint = (m, col) => { for (let i = 0; i < W * H; i++) if (m[i]) { rgba[i * 4] = (rgba[i * 4] * 0.45 + col[0] * 0.55) | 0; rgba[i * 4 + 1] = (rgba[i * 4 + 1] * 0.45 + col[1] * 0.55) | 0; rgba[i * 4 + 2] = (rgba[i * 4 + 2] * 0.45 + col[2] * 0.55) | 0; } };
  tint(outfit, [170, 90, 220]); tint(hair, [240, 150, 30]); tint(face, [60, 200, 80]); tint(eyes, [40, 200, 230]);
  writeFileSync(join(OUT_DIR, "preview-mask-overlay.png"), encodePngRGBA(W, H, rgba));

  writeFileSync(join(OUT_DIR, "prompt-sheet.md"), PROMPT_SHEET());
  writeFileSync(join(OUT_DIR, "delivery-checklist.md"), DELIVERY_CHECKLIST());

  const pct = (c) => ((c / (W * H)) * 100).toFixed(1) + "%";
  console.log("✔ Inpaint v2-base input package written:");
  console.log("  " + OUT_DIR);
  console.log("  source-master.png (1024×1536)");
  console.log("  mask-face-features.png     " + pct(cFace));
  console.log("  mask-eyes.png              " + pct(cEyes));
  console.log("  mask-hair.png              " + pct(cHair));
  console.log("  mask-signature-outfit.png  " + pct(cOutfit));
  console.log("  mask-v2-base-combined.png  " + pct(cComb));
  console.log("  preview-mask-overlay.png · prompt-sheet.md · delivery-checklist.md");
  console.log("\nBOUNDARIES: build/review package only (gitignored). No image generation, no /prompt,");
  console.log("  no assets/avatar-r2 write, no R2_MANIFEST change, AVATAR_R2 untouched.");
}

function PROMPT_SHEET() {
  return `# v2 Base — Masked Inpainting Prompt Sheet (Gate 2, D-042)

**Do not generate from this sheet automatically.** These are the inputs for a *masked* Flux.2 Klein
run that a human sets up and reviews. Output → 164B.3 review → cwebp → manifest (all separate steps).

## Art policy (D-042)
AI-assisted **masked** decomposition is allowed: masked inpainting/outpainting **on the frozen
\`source-master.png\` only**. **Only the WHITE areas of the masks may change; BLACK is preserved.**
FORBIDDEN: full regeneration, redesign, "new avatar," any unmasked/broad prompt; **no change** to head
size, eye shape, hair silhouette, pose, outfit *fit*, skin tone, line art, lighting, palette or
proportions. Any result that no longer matches the signed-off Master is rejected.

## Goal
Turn the Master into the **decomposed v2 base**: skin + a **plain neutral outfit** + head, with **NO
hair, NO eyes, NO face features (brows/nose/mouth), NO signature outfit**. The removed things become
separate layers later; the base is the featureless underlayer.

## What each mask means (white = inpaint)
- \`mask-hair\` → remove all hair; **reconstruct the scalp/forehead/skin underneath** (smooth, same skin tone).
- \`mask-face-features\` → remove brows/nose/mouth/blush; reconstruct **smooth blank facial skin**.
- \`mask-eyes\` → remove the eyes; reconstruct **smooth blank skin** (no eye, no socket detail).
- \`mask-signature-outfit\` → replace the sweater / star emblem / cuffs / cargo pockets / wristbands /
  branded sneakers with a **plain flat neutral outfit** (plain grey/charcoal tee, plain grey trousers,
  plain low sneakers). Keep visible **hand/forearm/neck skin** (already excluded from the mask).
- \`mask-v2-base-combined\` → all of the above at once (use this for a single pass, or run per-region).

## Positive prompt (exact)
\`\`\`
Inside the white-masked regions only, repaint to match the same anime chibi kid from the reference
image exactly. Under the hair mask: clean bare scalp and forehead skin, smooth, no hair. Under the
face mask: smooth blank facial skin, no eyebrows, no nose, no mouth, no blush. Under the eyes mask:
smooth blank skin, no eyes. Under the outfit mask: a plain, flat, neutral outfit — plain grey t-shirt,
plain grey trousers, plain low sneakers, no logos, no star, no emblem, no cargo pockets, no wristbands.
Identical head size, body proportions, pose and silhouette; identical warm skin tone; identical cel
shading, line weight, lighting direction and colour palette as the reference. Seamless, no seams at
mask edges.
\`\`\`

## Negative prompt (exact)
\`\`\`
new character, different face, different kid, changed proportions, resized head, bigger or smaller
head, altered pose, altered body, different hairstyle, any hair, eyebrows, eyes, eyelashes, pupils,
nose, mouth, teeth, blush, facial features, sweater, hoodie, star emblem, logo, text, watermark,
cargo pockets, wristbands, branded shoes, patterned clothes, different outfit style, recoloured skin,
different skin tone, different line art, different lighting, different palette, realistic, 3d render,
photo, extra limbs, deformed, blurry, low quality, background change
\`\`\`

## ComfyUI / Flux.2 Klein notes
- Models present (verified via /object_info): UNET \`flux-2-klein-4b-fp8.safetensors\`, CLIP
  \`qwen_3_4b.safetensors\` (type \`flux2\`), VAE \`flux2-vae.safetensors\`.
- Suggested graph (local, no cloud API nodes): \`LoadImage(source-master.png)\` +
  \`LoadImageMask(mask-v2-base-combined.png)\` → \`GrowMask\`(+2) → \`FeatherMask\`(~6) →
  \`InpaintModelConditioning\` (or \`VAEEncodeForInpaint\`) + \`SetLatentNoiseMask\` →
  \`UNETLoader\`(flux-2-klein) + \`CLIPLoader\`(qwen_3_4b, flux2) + \`CLIPTextEncodeFlux\` +
  \`FluxGuidance\` + \`Flux2Scheduler\` + \`KSampler\` → \`VAEDecode\`(flux2-vae) → \`SaveImage\`.
- **Masked only:** \`SetLatentNoiseMask\`/\`InpaintModelConditioning\` restrict denoising to the white
  mask — black is preserved. Do **not** use a full-frame img2img/regeneration.
- Consider **per-region passes** (hair → face → eyes → outfit) for tighter control; feather each mask.
- Keep \`source-master.png\` as the **only** reference image. No other refs, no broad prompts.
- Denoise ~0.9–1.0 inside the mask; moderate guidance; fixed seed for reproducible review.

## Boundary
This is an offline art step. It does not change runtime code, \`AVATAR_R2\` (stays \`false\`),
\`R2_MANIFEST\`, or write into \`assets/avatar-r2/\`. Wiring is a later, separately-gated step.
`;
}

function DELIVERY_CHECKLIST() {
  return `# v2 Base — Delivery Checklist (Gate 2, D-042)

## Expected output
- **Filename:** \`body-neutral-medium-v2-candidate.png\`
- **Size:** **1024×1536** PNG (authoring resolution; the runtime ÷2 → 512×768 + cwebp is a later step).
- **Background:** transparent if possible. (Flux.2 inpaint keeps the Master's white background; run the
  deterministic alpha-cut afterwards — \`tools/avatar/extract-master-base.mjs\` pattern — to make it
  transparent. A white-bg candidate is acceptable for 164B.3 review.)

## Acceptance (all must hold — then it goes to 164B.3)
- [ ] **No redesign** — reads as the *same* North Star kid; identity preserved.
- [ ] **Only masked areas changed** — everything outside the white masks is byte-identical to the Master.
- [ ] **No hair** left in the base (scalp/forehead reconstructed as skin).
- [ ] **No eyes** left (smooth blank skin where eyes were).
- [ ] **No face features** left — no brows, nose, mouth, or baked blush.
- [ ] **Plain neutral outfit** — no sweater/star/cargo/wristbands/branded sneakers; plain grey tee +
      trousers + low sneakers; no logos/symbols/text.
- [ ] **Hands/forearms/neck skin preserved** (were excluded from the outfit mask).
- [ ] **Unchanged:** head size, head:body ratio, pose, silhouette, skin tone, cel-shading line art,
      lighting direction, palette.
- [ ] **No seams** at mask edges; clean reconstruction.
- [ ] Full-canvas **1024×1536**; if transparent, clean alpha edge / no white halo at 32/48/64 px.

## Then
1. Fill \`docs/164b3-base-review-worksheet.md\` against the candidate → **PASS** required (Gate 2).
2. On PASS: alpha-cut (if needed) → \`node tools/avatar/encode-webp.mjs <candidate.png>
   assets-staging/body-neutral-medium-v2.webp --half\` (encode is Gate 4 tooling; **promotion to
   \`assets/avatar-r2/\` + \`R2_MANIFEST\` is a separate, gated step — not part of this package**).
3. Produce the face/eyes/eyelid/hair layers similarly (Gate 3), then composed visual sign-off (Gate 5).

**Gates 1 + 4 satisfied; 2, 3, 5 open. Phase-2 implementation not started; \`AVATAR_R2\` stays \`false\`.**
`;
}

try { main(); } catch (e) { console.error("✖ build-inpaint-v2-base failed:", e.message); process.exit(1); }
