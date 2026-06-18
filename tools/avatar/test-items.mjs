// 164M — Small Controlled Tier-2 Test-Item Generation / QA Pilot
// ---------------------------------------------------------------------------
// DETERMINISTIC, NON-AI pilot (option B). Creates a handful of SYNTHETIC placeholder
// overlay items (not AI art, not runtime assets) to prove the Tier-2 item pipeline:
// full-canvas placement → clip to the slot QA/build mask → QA counting → manifest/
// report → composite preview over the Master.
//
// HARD BOUNDARIES:
//   * Pilot only: 1 item per slot (aura, back, headwear, eyes/glasses) = 4 total (≤6).
//   * NO AI generation. NO bulk run. NO DB/RPC. NO runtime wiring. AVATAR_V2 untouched.
//   * Master is READ-ONLY. Items contain NO avatar geometry/skin/hair/eyes pixels.
//   * Outputs live under tools/avatar/build/test-items/ (gitignored, regenerable).
//
// Reuses the proven PNG codec + helpers from extract-anchor-masks.mjs (no side effects).
// ---------------------------------------------------------------------------

import { decodePNG, encodePNG, setPx, fillRectBuf, fillEllipseBuf } from "./extract-anchor-masks.mjs";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const MASTER = join(REPO, "assets", "avatar", "reference", "Northstar Master.png");
const MASK_DIR = join(HERE, "build", "masks");
const OUT = join(HERE, "build", "test-items");
const W = 1024, H = 1536;

// Pilot slots only (face/masks intentionally excluded; torso/bottom/shoes/body/hands/front_fx excluded).
const PILOT = [
  { slot: "aura",     maskFile: "mask-aura-v1.png",     color: [0, 200, 255], shape: "ring"    },
  { slot: "back",     maskFile: "mask-back-v1.png",     color: [60, 220, 90], shape: "wings"   },
  { slot: "headwear", maskFile: "mask-headwear-v1.png", color: [255, 150, 0], shape: "hat"     },
  { slot: "eyes",     maskFile: "mask-eyes-v1.png",     color: [80, 120, 255], shape: "glasses" },
];
const ITEM_ALPHA = 205; // semi-opaque so reviewers can see it over the Master

const blank = () => new Uint8Array(W * H * 4);
function maskBBox(rgba) { // allowed = alpha>0
  let x0 = W, y0 = H, x1 = -1, y1 = -1, n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (rgba[(y * W + x) * 4 + 3] > 0) { n++; if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  }
  return { x0, y0, x1, y1, n };
}

// --- synthetic placeholder shapes (drawn ~slightly larger than the mask bbox so the
//     clip has something to remove — proving the gate; then clipped to the mask). ---
function drawRing(buf, cx, cy, rOuter, rInner, col) {
  for (let y = cy - rOuter; y <= cy + rOuter; y++) for (let x = cx - rOuter; x <= cx + rOuter; x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d <= rOuter && d >= rInner) setPx(buf, W, H, x, y, [...col, ITEM_ALPHA]);
  }
}
function drawTriangle(buf, ax, ay, bx, by, cx, cy, col) {
  const minY = Math.min(ay, by, cy), maxY = Math.max(ay, by, cy);
  const area = (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (area === 0) return;
  for (let y = minY; y <= maxY; y++) for (let x = Math.min(ax,bx,cx); x <= Math.max(ax,bx,cx); x++) {
    const w0 = (bx * (cy - y) + cx * (y - by) + x * (by - cy)) / area;
    const w1 = (cx * (ay - y) + ax * (y - cy) + x * (cy - ay)) / area;
    const w2 = 1 - w0 - w1;
    if (w0 >= 0 && w1 >= 0 && w2 >= 0) setPx(buf, W, H, x, y, [...col, ITEM_ALPHA]);
  }
}

function makeShape(shape, bb, col) {
  const buf = blank();
  const cx = (bb.x0 + bb.x1) >> 1, cy = (bb.y0 + bb.y1) >> 1;
  const halfW = (bb.x1 - bb.x0) / 2, halfH = (bb.y1 - bb.y0) / 2;
  if (shape === "ring") {                       // aura: thick glow ring (overflows full canvas? no — sized to bbox)
    drawRing(buf, cx, cy, Math.round(Math.min(halfW, halfH) * 0.95) + 20, Math.round(Math.min(halfW, halfH) * 0.62), col);
  } else if (shape === "wings") {               // back: two angled wing ellipses (overflow sideways to test clip)
    fillEllipseBuf(buf, W, H, cx - Math.round(halfW * 0.5), cy, Math.round(halfW * 0.62) + 30, Math.round(halfH * 0.75), [...col, ITEM_ALPHA]);
    fillEllipseBuf(buf, W, H, cx + Math.round(halfW * 0.5), cy, Math.round(halfW * 0.62) + 30, Math.round(halfH * 0.75), [...col, ITEM_ALPHA]);
  } else if (shape === "hat") {                 // headwear: party-hat triangle (overflow up to test clip)
    drawTriangle(buf, cx, bb.y0 - 30, bb.x0 + 30, bb.y1, bb.x1 - 30, bb.y1, col);
  } else if (shape === "glasses") {             // eyes: two lens rings + bridge (overflow to test clip)
    const lensR = Math.round(halfH * 0.9) + 10, lx = cx - Math.round(halfW * 0.45), rx = cx + Math.round(halfW * 0.45);
    drawRing(buf, lx, cy, lensR, Math.round(lensR * 0.55), col);
    drawRing(buf, rx, cy, lensR, Math.round(lensR * 0.55), col);
    fillRectBuf(buf, W, H, lx + Math.round(lensR * 0.4), cy - 8, rx - Math.round(lensR * 0.4), cy + 8, [...col, ITEM_ALPHA]);
  }
  return buf;
}

function clipToMask(item, mask) {           // keep item pixels only where mask alpha>0
  let preClipOutside = 0;
  for (let i = 3; i < item.length; i += 4) {
    if (item[i] > 0 && mask[i] === 0) { preClipOutside++; item[i - 3] = 0; item[i - 2] = 0; item[i - 1] = 0; item[i] = 0; }
  }
  return preClipOutside;
}

function qa(item, mask) {
  let opaque = 0, outside = 0;
  for (let i = 3; i < item.length; i += 4) {
    if (item[i] > 0) { opaque++; if (mask[i] === 0) outside++; }
  }
  return { opaque, outside };
}

function compositeOver(masterRGBA, item) {  // item over master (source-over alpha blend)
  const out = Uint8Array.from(masterRGBA);
  for (let i = 0; i < out.length; i += 4) {
    const a = item[i + 3] / 255;
    if (a > 0) {
      out[i]     = Math.round(item[i]     * a + out[i]     * (1 - a));
      out[i + 1] = Math.round(item[i + 1] * a + out[i + 1] * (1 - a));
      out[i + 2] = Math.round(item[i + 2] * a + out[i + 2] * (1 - a));
      out[i + 3] = 255;
    }
  }
  return out;
}

function main() {
  if (!existsSync(MASK_DIR) || !existsSync(join(MASK_DIR, "mask-aura-v1.png"))) {
    console.error("Masks not found — run `npm run avatar:extract-masks` first.");
    process.exit(1);
  }
  mkdirSync(OUT, { recursive: true });
  const master = decodePNG(readFileSync(MASTER));
  if (master.width !== W || master.height !== H) { console.error(`Master must be ${W}x${H}`); process.exit(1); }

  const report = { pilot: "164M Tier-2 synthetic placeholder pilot (NON-AI)", canvas: `${W}x${H}`, items: [], humanReviewRequired: true };

  for (const p of PILOT) {
    const mask = decodePNG(readFileSync(join(MASK_DIR, p.maskFile))).rgba;
    const bb = maskBBox(mask);
    const item = makeShape(p.shape, bb, p.color);
    const preClipOutside = clipToMask(item, mask);
    const { opaque, outside } = qa(item, mask);

    const overlayPath = join(OUT, `item-${p.slot}-v1.png`);
    const previewPath = join(OUT, `preview-${p.slot}-v1.png`);
    writeFileSync(overlayPath, encodePNG(W, H, item));
    writeFileSync(previewPath, encodePNG(W, H, compositeOver(master.rgba, item)));

    const warnings = [];
    if (opaque === 0) warnings.push("empty item (no opaque pixels)");
    const pass = outside === 0 && opaque > 0;
    report.items.push({
      slot: p.slot, shape: p.shape, mask: p.maskFile,
      overlay: `tools/avatar/build/test-items/item-${p.slot}-v1.png`,
      preview: `tools/avatar/build/test-items/preview-${p.slot}-v1.png`,
      canvas: `${W}x${H}`, opaquePx: opaque,
      outsideMaskPx: outside, preClipOverflowPx: preClipOutside,
      pass, warnings,
    });
  }

  writeFileSync(join(OUT, "qa-report.json"), JSON.stringify(report, null, 2));
  const md = [
    "# 164M Tier-2 Pilot — QA Report (synthetic, NON-AI)",
    "", `Canvas: ${W}x${H} · items: ${report.items.length} · humanReviewRequired: true`, "",
    "| slot | shape | opaquePx | outsideMaskPx | preClipOverflowPx | pass |",
    "|---|---|---|---|---|---|",
    ...report.items.map(i => `| ${i.slot} | ${i.shape} | ${i.opaquePx} | ${i.outsideMaskPx} | ${i.preClipOverflowPx} | ${i.pass ? "PASS" : "FAIL"} |`),
    "", "Artifacts: `tools/avatar/build/test-items/` (gitignored, regenerable). NOT runtime assets.",
  ].join("\n");
  writeFileSync(join(OUT, "qa-report.md"), md);

  const allPass = report.items.every(i => i.pass);
  console.log(JSON.stringify({ ...report, allPass }, null, 2));
}

main();
