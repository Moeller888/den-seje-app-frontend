// 164S — Deterministic PROCEDURAL glasses overlay (no AI, no network)
// ---------------------------------------------------------------------------
// Draws a simple FRONT-ONLY glasses overlay (two lens frames + bridge + tiny side tabs) onto a
// 1024×1536 transparent canvas, so the corrected 164S eye anchors can be validated
// end-to-end (extract-masks → generate-procedural-glasses → ai-test-item) WITHOUT
// generating any AI art. The lenses are centred on the glasses LENS VISUAL CENTRE
// (the eye-opening centre) — NOT the pupil centre — so each round lens is concentric
// with the eye and SURROUNDS it; the hollow frame never crosses the black pupil.
//
// HARD BOUNDARIES (same as the rest of 164*):
//   * Deterministic, NON-AI image drawing only (Node built-ins + local codec).
//   * Master is READ-ONLY. Outputs are gitignored QA/build artifacts, NOT runtime assets.
//   * No DB/RPC/migrations, no AVATAR_V2, no runtime/frontend, no network, no commit.
//
// Outputs (all gitignored):
//   tools/avatar/build/procedural/glasses-procedural-v1.png          (overlay, transparent)
//   tools/avatar/build/procedural/glasses-procedural-composite.png   (overlay over Master, UNclipped — clean visual review)
//   tools/avatar/build/ai-input/glasses-test-raw.png                 (mirror, so `ai-test-item` consumes it)
// ---------------------------------------------------------------------------

import { decodePNG, encodePNG, MANUAL_EYE_SEMANTIC_ANCHORS_164S } from "./extract-anchor-masks.mjs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const MASTER = join(REPO, "assets", "avatar", "reference", "Northstar Master.png");
const OUT_PROC = join(HERE, "build", "procedural");
const OUT_AI_IN = join(HERE, "build", "ai-input");
const W = 1024, H = 1536;

// Frame geometry derived from 164S anchors (lens surrounds the eye opening).
const LENS = { rx: 46, ry: 48, frame: 7 };          // outer lens radii + frame thickness
const FRAME_COL = [38, 40, 52, 255];                 // dark slate, opaque
const BRIDGE_T = 9;                                  // bridge half-thickness
const TAB_T = 6;                                     // side-tab half-thickness
const TAB_LEN = 16;                                  // 164T: FRONT-ONLY tiny side tab — NOT a long temple to the ear

function setPx(buf, x, y, col) {
  x |= 0; y |= 0;
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const d = (y * W + x) * 4;
  buf[d] = col[0]; buf[d + 1] = col[1]; buf[d + 2] = col[2]; buf[d + 3] = col[3];
}
// filled elliptical ANNULUS (lens frame): inside outer ellipse, outside inner ellipse
function fillAnnulus(buf, cx, cy, rx, ry, t, col) {
  const irx = rx - t, iry = ry - t;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const ox = (x - cx) / rx, oy = (y - cy) / ry;
      if (ox * ox + oy * oy > 1) continue;            // outside outer ellipse
      const ix = (x - cx) / irx, iy = (y - cy) / iry;
      if (ix * ix + iy * iy < 1) continue;            // inside hollow interior — leave clear
      setPx(buf, x, y, col);
    }
}
// thick line (bridge / temples) via perpendicular offset
function thickLine(buf, x0, y0, x1, y1, half, col) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;               // unit normal
  const steps = Math.ceil(len);
  for (let s = 0; s <= steps; s++) {
    const px = x0 + (dx * s) / steps, py = y0 + (dy * s) / steps;
    for (let o = -half; o <= half; o++) setPx(buf, px + nx * o, py + ny * o, col);
  }
}

function main() {
  const ES = MANUAL_EYE_SEMANTIC_ANCHORS_164S;
  const L = ES.left.glassesLensVisualCenter, R = ES.right.glassesLensVisualCenter; // lens centres = eye-opening centres
  const overlay = new Uint8Array(W * H * 4);          // all transparent

  // two lens frames (hollow → never cross the pupil, which sits inside the interior)
  fillAnnulus(overlay, L.x, L.y, LENS.rx, LENS.ry, LENS.frame, FRAME_COL);
  fillAnnulus(overlay, R.x, R.y, LENS.rx, LENS.ry, LENS.frame, FRAME_COL);
  // bridge: between the two lenses' inner (nasal) edges, slightly above centre
  const bridgeY = ES.derived.glassesBridgePoint.y - 6;
  thickLine(overlay, L.x + LENS.rx - 2, bridgeY, R.x - LENS.rx + 2, bridgeY, BRIDGE_T, FRAME_COL);
  // 164T: tiny FRONT-ONLY side tabs at each lens' outer edge (short stubs, no long temples/ear hooks)
  thickLine(overlay, L.x - LENS.rx + 2, L.y, L.x - LENS.rx - TAB_LEN, L.y, TAB_T, FRAME_COL);
  thickLine(overlay, R.x + LENS.rx - 2, R.y, R.x + LENS.rx + TAB_LEN, R.y, TAB_T, FRAME_COL);

  // composite over Master (UNclipped — clean visual review of placement)
  const master = decodePNG(readFileSync(MASTER));
  if (master.width !== W || master.height !== H) { console.error(`Master must be ${W}x${H}`); process.exit(1); }
  const comp = Uint8Array.from(master.rgba);
  for (let i = 0; i < comp.length; i += 4) {
    const a = overlay[i + 3] / 255;
    if (a > 0) {
      comp[i] = Math.round(overlay[i] * a + comp[i] * (1 - a));
      comp[i + 1] = Math.round(overlay[i + 1] * a + comp[i + 1] * (1 - a));
      comp[i + 2] = Math.round(overlay[i + 2] * a + comp[i + 2] * (1 - a));
      comp[i + 3] = 255;
    }
  }

  // count opaque + a sanity check: no opaque frame pixel within r of either pupil centre
  let opaque = 0;
  const PUP_R = 12;
  let pupilHits = 0;
  for (const pc of [ES.left.pupilCenter, ES.right.pupilCenter]) {
    for (let y = pc.y - PUP_R; y <= pc.y + PUP_R; y++)
      for (let x = pc.x - PUP_R; x <= pc.x + PUP_R; x++) {
        if ((x - pc.x) ** 2 + (y - pc.y) ** 2 > PUP_R * PUP_R) continue;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        if (overlay[(y * W + x) * 4 + 3] > 0) pupilHits++;
      }
  }
  for (let i = 3; i < overlay.length; i += 4) if (overlay[i] > 0) opaque++;

  mkdirSync(OUT_PROC, { recursive: true });
  mkdirSync(OUT_AI_IN, { recursive: true });
  writeFileSync(join(OUT_PROC, "glasses-procedural-v1.png"), encodePNG(W, H, overlay));
  writeFileSync(join(OUT_PROC, "glasses-procedural-composite.png"), encodePNG(W, H, comp));
  // mirror raw overlay so `npm run avatar:ai-test-item` consumes this exact item
  writeFileSync(join(OUT_AI_IN, "glasses-test-raw.png"), encodePNG(W, H, overlay));

  console.log(JSON.stringify({
    section: "164S procedural glasses (deterministic, non-AI)",
    lensCentres: { left: L, right: R, note: "= glasses lens visualCenter (eye-opening centre), NOT pupil centre" },
    lens: LENS, bridgeY, sideTabs: { lengthPx: TAB_LEN, note: "164T front-only tiny tabs (no long temples)" },
    opaquePx: opaque,
    pupilFrameHitsWithinR12: pupilHits,
    pupilHitsOk: pupilHits === 0,
    outputs: {
      overlay: "tools/avatar/build/procedural/glasses-procedural-v1.png",
      composite: "tools/avatar/build/procedural/glasses-procedural-composite.png",
      aiInputMirror: "tools/avatar/build/ai-input/glasses-test-raw.png",
    },
    humanReviewRequired: true,
  }, null, 2));
}

main();
