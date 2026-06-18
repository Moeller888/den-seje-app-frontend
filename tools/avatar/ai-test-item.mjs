// 164N — Single Controlled AI Test Item through the clip/QA gate
// ---------------------------------------------------------------------------
// Validates EXACTLY ONE real (AI-generated) overlay item — slot = eyes/glasses —
// through the same clip + QA pipeline proven in 164M. NO AI art is generated in this
// repo: the script consumes a raw PNG the user places manually at a gitignored path.
//
// HARD BOUNDARIES:
//   * One item, one slot (eyes/glasses). NO bulk. NO DB/RPC. NO runtime wiring.
//   * AVATAR_V2 untouched. Master read-only. Inputs/outputs are gitignored build artifacts.
//   * Placement uses the glassesBand anchor (no per-item manual offset in committed code).
//
// Input  (you place this, gitignored): tools/avatar/build/ai-input/glasses-test-raw.png
// Output (gitignored):
//   tools/avatar/build/ai-test/items/glasses-test-clipped.png
//   tools/avatar/build/ai-test/previews/glasses-test-composite.png
//   tools/avatar/build/ai-test/reports/glasses-test-qa.json
// ---------------------------------------------------------------------------

import { decodePNG, encodePNG, MANUAL_ANCHOR_OVERRIDES_164L2 } from "./extract-anchor-masks.mjs";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const MASTER = join(REPO, "assets", "avatar", "reference", "Northstar Master.png");
const MASK = join(HERE, "build", "masks", "mask-eyes-v1.png");
const IN_DIR = join(HERE, "build", "ai-input");
const RAW = join(IN_DIR, "glasses-test-raw.png");
const OUT_ITEM = join(HERE, "build", "ai-test", "items");
const OUT_PREV = join(HERE, "build", "ai-test", "previews");
const OUT_REP = join(HERE, "build", "ai-test", "reports");
const W = 1024, H = 1536;
const SLOT = "eyes";

function main() {
  // No raw input yet → create the drop dir, print instructions, exit cleanly (not a failure).
  if (!existsSync(RAW)) {
    mkdirSync(IN_DIR, { recursive: true });
    console.log(JSON.stringify({
      status: "AWAITING_RAW_INPUT",
      slot: SLOT,
      placeRawPngAt: "tools/avatar/build/ai-input/glasses-test-raw.png",
      note: "Place ONE generated glasses overlay PNG (transparent bg) at the path above, then re-run `npm run avatar:ai-test-item`. Ideal: 1024x1536 transparent; smaller is OK (it will be centred on the glassesBand anchor).",
    }, null, 2));
    return;
  }
  if (!existsSync(MASK)) { console.error("mask-eyes-v1.png missing — run `npm run avatar:extract-masks` first."); process.exit(1); }

  const raw = decodePNG(readFileSync(RAW));           // throws on unsupported PNG (palette/16-bit/interlaced)
  const mask = decodePNG(readFileSync(MASK)).rgba;
  const master = decodePNG(readFileSync(MASTER));
  if (master.width !== W || master.height !== H) { console.error(`Master must be ${W}x${H}`); process.exit(1); }

  const hasAlpha = raw.colorType === 6;
  const warnings = [];
  if (!hasAlpha) warnings.push("raw PNG has no alpha channel (colorType 2) — an overlay item should be transparent-background RGBA; a solid block will likely fail mask clipping usefully.");

  // --- placement onto a full 1024x1536 transparent canvas (anchor-derived, no manual offset) ---
  const item = new Uint8Array(W * H * 4);
  let placement;
  if (raw.width === W && raw.height === H) {
    item.set(raw.rgba);                                // already full-canvas → use as-is (no reposition)
    placement = "as-is (raw already 1024x1536)";
  } else {
    const gb = MANUAL_ANCHOR_OVERRIDES_164L2.glassesBand; // centre on glassesBand
    const cx = gb.x + gb.width / 2, cy = gb.y + gb.height / 2;
    const ox = Math.round(cx - raw.width / 2), oy = Math.round(cy - raw.height / 2);
    for (let y = 0; y < raw.height; y++) for (let x = 0; x < raw.width; x++) {
      const dx = ox + x, dy = oy + y;
      if (dx < 0 || dy < 0 || dx >= W || dy >= H) continue;
      const s = (y * raw.width + x) * 4, d = (dy * W + dx) * 4;
      item[d] = raw.rgba[s]; item[d+1] = raw.rgba[s+1]; item[d+2] = raw.rgba[s+2]; item[d+3] = raw.rgba[s+3];
    }
    placement = `centred on glassesBand (${Math.round(cx)},${Math.round(cy)}); offset (${ox},${oy})`;
  }

  // --- clip to eyes mask + QA ---
  let preClipOverflow = 0;
  for (let i = 3; i < item.length; i += 4) {
    if (item[i] > 0 && mask[i] === 0) { preClipOverflow++; item[i-3]=0; item[i-2]=0; item[i-1]=0; item[i]=0; }
  }
  let opaque = 0, outside = 0;
  for (let i = 3; i < item.length; i += 4) { if (item[i] > 0) { opaque++; if (mask[i] === 0) outside++; } }

  // --- composite over Master (placement/extent visualization, not runtime z-order) ---
  const comp = Uint8Array.from(master.rgba);
  for (let i = 0; i < comp.length; i += 4) {
    const a = item[i+3] / 255;
    if (a > 0) { comp[i]=Math.round(item[i]*a+comp[i]*(1-a)); comp[i+1]=Math.round(item[i+1]*a+comp[i+1]*(1-a)); comp[i+2]=Math.round(item[i+2]*a+comp[i+2]*(1-a)); comp[i+3]=255; }
  }

  for (const d of [OUT_ITEM, OUT_PREV, OUT_REP]) mkdirSync(d, { recursive: true });
  writeFileSync(join(OUT_ITEM, "glasses-test-clipped.png"), encodePNG(W, H, item));
  writeFileSync(join(OUT_PREV, "glasses-test-composite.png"), encodePNG(W, H, comp));

  if (opaque === 0) warnings.push("clipped item is empty (no opaque pixels inside the eyes mask) — raw art may be mis-sized/mis-placed.");
  const pass = outside === 0 && opaque > 0;
  const report = {
    section: "164N single controlled AI test item",
    slot: SLOT, mask: "mask-eyes-v1.png",
    rawInput: { file: "tools/avatar/build/ai-input/glasses-test-raw.png", width: raw.width, height: raw.height, colorType: raw.colorType, hasAlpha },
    placement,
    canvas: `${W}x${H}`,
    opaquePx: opaque, preClipOverflowPx: preClipOverflow, outsideMaskPx: outside,
    pass, warnings,
    humanReviewRequired: true,
    humanReviewMustConfirm: ["no avatar geometry/skin/hair/eyes copied", "reads as a glasses item", "style fits", "content safe (kids platform)"],
    outputs: {
      clipped: "tools/avatar/build/ai-test/items/glasses-test-clipped.png",
      composite: "tools/avatar/build/ai-test/previews/glasses-test-composite.png",
    },
  };
  writeFileSync(join(OUT_REP, "glasses-test-qa.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main();
