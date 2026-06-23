// 164Z — Deterministic SVG re-emit for glasses.round.basic (no AI, no network)
// ---------------------------------------------------------------------------
// Re-emits the front-only round glasses as a VECTOR SVG in the LIVE avatar layer
// coordinate space (160×240), authored directly on the LOCKED eye anchors — NOT a
// downscale of the 1024×1536 Master-space procedural PNG (the two spaces do not
// share face positioning; see docs/164y-…).
//
// Authoritative locked geometry (from den-seje-app-frontend/assets/avatar/base/body.svg
// and js/avatar-layers.js "locked geometry contract"):
//   viewBox 0 0 160 240, eyes POSITION LOCKED at cx=68/92 cy=47
//   (sclera ellipse rx=7 ry=6, iris r=4.8, pupil r=2.5)
//
// HARD BOUNDARIES (same as the rest of 164*):
//   * Deterministic vector authoring only (string template from named constants).
//   * No AI, no network, no DB/RPC/migrations, no AVATAR_V2, no runtime/frontend.
//   * Output is a gitignored BUILD-ONLY artifact, NOT a runtime asset — promotion
//     into assets/* is a SEPARATE, human-approved step (164Z review gate).
//
// Output (gitignored): tools/avatar/build/promote/glasses-round-basic-v1.svg
// ---------------------------------------------------------------------------

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "build", "promote");
const OUT_SVG = join(OUT_DIR, "glasses-round-basic-v1.svg");

// ── LOCKED anchors (live 160×240 layer space) ───────────────────────────────
const VIEWBOX = { w: 160, h: 240 };
const EYE_L = { cx: 68, cy: 47 };          // LOCKED — body.svg
const EYE_R = { cx: 92, cy: 47 };          // LOCKED — body.svg
const SCLERA = { rx: 7, ry: 6 };           // eye-opening half-extent (for surround check)
const PUPIL_R = 2.5;                        // pupil radius (for clearance check)

// ── Front-only glasses geometry (derived deterministically from the anchors) ──
const LENS_R = 10;                          // round lens ring radius (surrounds the eye opening)
const FRAME_W = 2.6;                        // frame stroke width (lighter than legacy 3.5 — 164W polish note)
const FRAME_COL = "#262834";                // dark slate (matches procedural FRAME_COL [38,40,52])
const TINT = "rgba(100,181,246,0.26)";      // translucent lens tint (eye shows through)
const TINT_R = LENS_R - FRAME_W / 2;        // tint sits inside the frame ring
const BRIDGE_Y = 45;                        // slightly above eye centre
const BRIDGE_W = 2.4;
const TAB_LEN = 3;                          // 164T: tiny FRONT-ONLY stub (NOT a temple to the ear)
const TAB_W = 2.0;
const SHINE_W = 1.4;

const r2 = (n) => Math.round(n * 100) / 100; // tidy 2-dp for the emitted SVG

// frame-ring painted half-extent from a lens centre (centreline radius + half stroke)
const RING_EXT = LENS_R + FRAME_W / 2;
// inner painted edges of the two lenses (the bridge gap)
const L_INNER = EYE_L.cx + RING_EXT;
const R_INNER = EYE_R.cx - RING_EXT;
// outer painted edges (where the tiny front tabs start)
const L_OUTER = EYE_L.cx - RING_EXT;
const R_OUTER = EYE_R.cx + RING_EXT;

function buildSvg() {
  const lens = (e) =>
    `  <circle cx="${e.cx}" cy="${e.cy}" r="${TINT_R}" fill="${TINT}"/>\n` +
    `  <circle cx="${e.cx}" cy="${e.cy}" r="${LENS_R}" fill="none" stroke="${FRAME_COL}" stroke-width="${FRAME_W}"/>`;
  const shine = (e) =>
    `  <path d="M ${r2(e.cx - 6)} ${r2(e.cy - 6)} Q ${r2(e.cx - 3)} ${r2(e.cy - 8.5)} ${r2(e.cx)} ${r2(e.cy - 6.5)}" ` +
    `fill="none" stroke="white" stroke-width="${SHINE_W}" stroke-linecap="round" opacity="0.4"/>`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX.w} ${VIEWBOX.h}">`,
    `  <!-- 164Z front-only round glasses (glasses.round.basic). Authored on LOCKED eyes cx=68/92 cy=47, 160x240. No temples. -->`,
    `  <!-- Left lens -->`,
    lens(EYE_L),
    `  <!-- Right lens -->`,
    lens(EYE_R),
    `  <!-- Bridge (between inner edges, slightly raised) -->`,
    `  <path d="M ${r2(L_INNER)} ${BRIDGE_Y + 1} Q ${r2((L_INNER + R_INNER) / 2)} ${BRIDGE_Y - 2} ${r2(R_INNER)} ${BRIDGE_Y + 1}" ` +
      `fill="none" stroke="${FRAME_COL}" stroke-width="${BRIDGE_W}" stroke-linecap="round"/>`,
    `  <!-- Tiny FRONT-ONLY side tabs (3px stubs — NOT temples) -->`,
    `  <path d="M ${r2(L_OUTER)} ${EYE_L.cy} L ${r2(L_OUTER - TAB_LEN)} ${EYE_L.cy}" ` +
      `fill="none" stroke="${FRAME_COL}" stroke-width="${TAB_W}" stroke-linecap="round"/>`,
    `  <path d="M ${r2(R_OUTER)} ${EYE_R.cy} L ${r2(R_OUTER + TAB_LEN)} ${EYE_R.cy}" ` +
      `fill="none" stroke="${FRAME_COL}" stroke-width="${TAB_W}" stroke-linecap="round"/>`,
    `  <!-- Subtle catch-light shine -->`,
    shine(EYE_L),
    shine(EYE_R),
    `</svg>`,
    ``,
  ].join("\n");
}

// ── Local validation gates (fail loud) ──────────────────────────────────────
function validate() {
  const errors = [];
  // surround: ring clears the eye opening
  if (LENS_R <= SCLERA.rx) errors.push(`lens r ${LENS_R} does not surround sclera rx ${SCLERA.rx}`);
  if (LENS_R <= SCLERA.ry) errors.push(`lens r ${LENS_R} does not surround sclera ry ${SCLERA.ry}`);
  // pupil clearance: frame ring (inner painted edge) never reaches the pupil
  const ringInnerFromCentre = LENS_R - FRAME_W / 2;
  if (ringInnerFromCentre <= PUPIL_R) errors.push(`frame ring inner ${ringInnerFromCentre} reaches pupil r ${PUPIL_R}`);
  // lenses do not overlap (positive bridge gap between painted inner edges)
  const bridgeGap = R_INNER - L_INNER;
  if (bridgeGap <= 0) errors.push(`lenses overlap — bridge gap ${r2(bridgeGap)} <= 0`);
  // within viewBox (no clipping), including tabs
  const minX = L_OUTER - TAB_LEN, maxX = R_OUTER + TAB_LEN;
  const minY = EYE_L.cy - RING_EXT, maxY = EYE_L.cy + RING_EXT;
  if (minX < 0 || maxX > VIEWBOX.w) errors.push(`horizontal extent [${r2(minX)},${r2(maxX)}] outside [0,${VIEWBOX.w}]`);
  if (minY < 0 || maxY > VIEWBOX.h) errors.push(`vertical extent [${r2(minY)},${r2(maxY)}] outside [0,${VIEWBOX.h}]`);
  // front-only: tabs must be tiny stubs, well inside the head edges (head cx=80 r=30 → [50,110])
  if (TAB_LEN > 5) errors.push(`tab length ${TAB_LEN} too long — reads as a temple, not a front stub`);
  if (minX < 50 || maxX > 110) errors.push(`frame reaches head edge — looks like a temple/ear hook`);
  return {
    viewBox: `0 0 ${VIEWBOX.w} ${VIEWBOX.h}`,
    lensCenters: { left: EYE_L, right: EYE_R, note: "= LOCKED eyes cx=68/92 cy=47" },
    lensR: LENS_R, frameW: FRAME_W,
    surroundMarginPx: { x: r2(LENS_R - SCLERA.rx), y: r2(LENS_R - SCLERA.ry) },
    pupilClearancePx: r2(ringInnerFromCentre - PUPIL_R),
    bridgeGapPx: r2(R_INNER - L_INNER),
    horizontalExtent: [r2(minX), r2(maxX)], verticalExtent: [r2(minY), r2(maxY)],
    hasTemples: false,
    pass: errors.length === 0,
    errors,
  };
}

function main() {
  const v = validate();
  if (!v.pass) {
    console.error(JSON.stringify({ section: "164Z emit-glasses-svg", status: "FAIL", ...v }, null, 2));
    process.exit(1);
  }
  const svg = buildSvg();
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_SVG, svg, "utf8");
  console.log(JSON.stringify({
    section: "164Z emit-glasses-svg (deterministic vector, build-only)",
    status: "OK",
    output: "tools/avatar/build/promote/glasses-round-basic-v1.svg",
    bytes: Buffer.byteLength(svg, "utf8"),
    validation: v,
    humanReviewRequired: true,
    promotionAuthorized: false,
  }, null, 2));
}

main();
