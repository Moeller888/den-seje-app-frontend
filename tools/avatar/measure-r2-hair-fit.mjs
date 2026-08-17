// 167A spor A / R2 HAIR-IDENTITY AUDIT — deterministic geometric measurement (NON-AI, READ-ONLY).
// ---------------------------------------------------------------------------
// Plan of record: docs/167a-r2-hair-identity-audit.md (D-102 decision request)
// Decisions:      D-101 (R2 is the default render; hairSrcForR2 ignores identity.hairstyle),
//                 D-079/D-080/D-081 (the wrapper-transform mechanism this measures against),
//                 D-083 (whole-avatar C2 fallback — the alternative to new art),
//                 D-033 (AI REJECTED for base/rig layers — hair is one; this tool uses NO AI),
//                 D-057/D-058/D-061 (base decomposition + the accepted faint alpha residue),
//                 D-071 (render scales), D-085 (the vendored-decoder idiom this follows).
//
// WHAT THIS IS:
//   The evidence behind the audit. It answers ONE question with numbers instead of opinion:
//   where does the R2 figure's head actually sit, and what vertical re-seat would a C2-canvas
//   hair asset need to land its hairline on that head — i.e. is the missing-hairstyle gap a
//   WIRING slice (like headwear/eyes/face) or ART production (like the torso, D-082)?
//
//   It measures, all in the shared 160x240 C2 canvas so the two paths are directly comparable:
//     1. the R2 bald base  — crown, widest skull row, neck, head centre-x, shoulder onset
//     2. the R2 hair layer — envelope bbox + the per-column hairline it actually paints
//     3. all seven C2 hair SVGs — per-column crown + hairline, from EXACT quadratic-Bezier
//        and line column crossings of the path data (never from the SVG comments)
//     4. the delta: the vertical offset between each C2 style's hairline and the R2 one, per column,
//        which is where a CANDIDATE translateY would start — this tool validates no transform
//
// WHAT THIS IS NOT:
//   * NOT a decision, NOT a fix, NOT a wiring step. It changes no runtime, asset, manifest,
//     resolver, z, transform, test, golden, catalog, migration or flag.
//   * It writes NO file at all — not even under tools/avatar/build/. Output is stdout only.
//   * Geometry is a NECESSARY condition, never a sufficient one: a passing delta says an asset
//     can be made to LAND correctly, not that flat two-tone SVG hair LOOKS right on a painted
//     raster head. That judgement is a visual review at real render scale plus owner sign-off
//     (the D-059 lesson: never judge fringe/fit on the full-res asset composite).
//
// Requires the vendored decoder tools/avatar/vendor/dwebp.exe (gitignored; fetch with
// tools/avatar/fetch-dwebp.mjs). No npm dependency, no network, no AI.
// ---------------------------------------------------------------------------

import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { verifyVendoredDwebp } from "./fetch-dwebp.mjs";

export const TOOL = "measure-r2-hair-fit";
export const TOOL_VERSION = "1.0.0";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const DWEBP = join(HERE, "vendor", "dwebp.exe");

// ── Frozen inputs (the RUNTIME assets, R2_MANIFEST base "neutral-medium":2, hair "northstar":1) ──
const BASE_REL = "assets/avatar-r2/base/body-neutral-medium-v2.webp";
const HAIR_REL = "assets/avatar-r2/hair/hair-northstar-v1.webp";
export const BASE_EXPECT_SHA = "28765eea616dd92beb73273c67d6d603cabd9f92af8057d2d9a5fe50c01032f9";
export const HAIR_EXPECT_SHA = "3edc70bcc4420516b7b9a17e577147cb4f3a23411111899382f2041e25199055";
const SRC_W = 512, SRC_H = 768;                 // served R2 dimensions (ADR-163D)
export const K = 160 / SRC_W;                   // served px -> 160x240 C2 canvas unit (0.3125)

// The seven selectable C2 styles (js/avatar-layers.js C2_HAIRSTYLES) in resolver order.
export const C2_STYLES = ["short", "tousled", "curly", "long", "ponytail", "buzz", "afro"];
const c2HairPath = (style) => join(REPO, "assets", "avatar", "hair", `hair-${style}-c2.svg`);

// The locked C2 head contract every C2 hair asset was authored against (js/avatar-layers.js,
// BODY_SRCS_C2 comment): head cx=80 cy=50 r=30 -> x 50..110, y 20..80; eye anchor cy=47.
export const C2_HEAD = { cx: 80, cy: 50, r: 30, eyeCy: 47 };

// Columns sampled across the skull, in C2 units. 80 is the face centre.
const COLUMNS = [50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105, 110];
// The FOREHEAD band. Outside it, both paths stop describing the same feature: the C2 caps end in
// a temple point while the R2 hair drops side locks past the ear, so an edge-column delta compares
// two different things and is not evidence either way. Every fit conclusion uses this band.
const CENTRAL = [65, 70, 75, 80, 85, 90, 95];
// Hair below this C2 y is a side lock / tail draping onto the body, not a hairline.
const CAP_MAX_Y = 90;
// Alpha floor + minimum run: the accepted faint alpha residue (D-059/D-061) must not be able
// to move a landmark, so a landmark needs real opacity AND real width.
const A_MIN = 64, MIN_RUN = 4;

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const u = (n) => (n === null || n === undefined || Number.isNaN(n) ? "   -  " : n.toFixed(1).padStart(6));

// ── WebP → RGBA, with NO file on disk ────────────────────────────────────────────────────────
// The decoder is asked for PAM (uncompressed RGBA) on STDOUT and the bytes are parsed in memory.
// That is why this tool creates no temp file and no build directory: unlike the mask tools it
// produces nothing, so it leaves nothing — not even a file it would delete afterwards.
function parsePam(buf, label) {
  const end = buf.indexOf("ENDHDR\n");
  if (end < 0) throw new Error(label + ": decoder did not return PAM");
  const hdr = buf.slice(0, end).toString("latin1");
  const num = (k) => {
    const m = new RegExp("^" + k + "\\s+(\\d+)\\s*$", "m").exec(hdr);
    if (!m) throw new Error(`${label}: PAM header has no ${k}`);
    return parseInt(m[1], 10);
  };
  const w = num("WIDTH"), h = num("HEIGHT"), depth = num("DEPTH");
  if (depth !== 4) throw new Error(`${label}: expected RGBA (DEPTH 4), got ${depth}`);
  const rgba = buf.slice(end + 7); // 7 = "ENDHDR\n"
  if (rgba.length !== w * h * 4) {
    throw new Error(`${label}: PAM payload is ${rgba.length} bytes, expected ${w * h * 4}`);
  }
  return { w, h, rgba };
}

function loadWebp(rel, expectSha) {
  const v = verifyVendoredDwebp(DWEBP);
  if (!v.ok) {
    throw new Error(`vendored WebP decoder unusable (${v.reason}).\n  ${v.how}\n` +
      (v.sha256 ? `  found sha256 ${v.sha256}\n  expected     ${v.expected}\n` : ""));
  }
  const abs = join(REPO, ...rel.split("/"));
  if (!existsSync(abs)) throw new Error("missing runtime asset: " + rel);
  const bytes = readFileSync(abs);
  const actual = sha256(bytes);
  if (actual !== expectSha) {
    throw new Error(`input SHA mismatch for ${rel}\n  expected ${expectSha}\n  actual   ${actual}\n` +
      "The runtime asset changed — the audit's numbers no longer describe what ships.");
  }
  // "-o -" sends the PAM to stdout; maxBuffer must clear 512*768*4 bytes plus the header.
  const res = spawnSync(DWEBP, [abs, "-pam", "-o", "-"], { maxBuffer: 8 * 1024 * 1024 });
  if (res.error) throw new Error("decoder failed to start for " + rel + ": " + res.error.message);
  if (res.status !== 0) {
    throw new Error("decoder failed on " + rel + ": " + String(res.stderr || "").trim());
  }
  const img = parsePam(res.stdout, rel);
  if (img.w !== SRC_W || img.h !== SRC_H) {
    throw new Error(`${rel}: expected ${SRC_W}x${SRC_H}, got ${img.w}x${img.h}`);
  }
  return { ...img, sha256: actual };
}

// ── raster measurement (served px in, C2 units out) ──────────────────────────────────────────
const drawn = (img, x, y) => img.rgba[(y * img.w + x) * 4 + 3] >= A_MIN;

// Widest contiguous drawn run in a row; runs narrower than MIN_RUN are ignored.
function mainRun(img, y) {
  let best = null, x0 = -1;
  for (let x = 0; x <= img.w; x++) {
    const on = x < img.w && drawn(img, x, y);
    if (on && x0 < 0) x0 = x;
    if (!on && x0 >= 0) {
      const w = x - x0;
      if (w >= MIN_RUN && (!best || w > best.w)) best = { x0, x1: x - 1, w };
      x0 = -1;
    }
  }
  return best;
}
// Outer extent of a row across ALL runs >= MIN_RUN (so ears / side volume count).
function extent(img, y) {
  let lo = -1, hi = -1, x0 = -1;
  for (let x = 0; x <= img.w; x++) {
    const on = x < img.w && drawn(img, x, y);
    if (on && x0 < 0) x0 = x;
    if (!on && x0 >= 0) {
      if (x - x0 >= MIN_RUN) { if (lo < 0) lo = x0; hi = x - 1; }
      x0 = -1;
    }
  }
  return lo < 0 ? null : { lo, hi, w: hi - lo + 1 };
}

export function measureBase(base) {
  let crownY = -1;
  for (let y = 0; y < base.h && crownY < 0; y++) if (mainRun(base, y)) crownY = y;
  if (crownY < 0) throw new Error("base has no drawn pixel");

  // The neck is the narrowest main run below the crown; the head cannot extend past y=340 px
  // (C2 106) on a 768-tall figure, so the search window cannot wander into the waist.
  let neck = null;
  for (let y = crownY + 40; y <= 340; y++) {
    const r = mainRun(base, y);
    if (r && (!neck || r.w < neck.w)) neck = { y, ...r };
  }
  if (!neck) throw new Error("no neck row found");

  let widest = null;
  for (let y = crownY; y < neck.y; y++) {
    const e = extent(base, y);
    if (e && (!widest || e.w > widest.w)) widest = { y, ...e };
  }

  // Shoulder onset: the first row BELOW the neck at least twice the neck's width.
  let shoulder = null;
  for (let y = neck.y; y < base.h && !shoulder; y++) {
    const e = extent(base, y);
    if (e && e.w >= neck.w * 2) shoulder = { y, ...e };
  }

  const profile = [];
  for (let y = crownY; y <= neck.y; y++) {
    const e = extent(base, y);
    if (e) profile.push({ y, ...e });
  }
  return { crownY, neck, widest, shoulder, profile };
}

// Per-column hairline of the RASTER hair layer: topmost and lowest drawn row within the cap.
export function measureHairColumns(hair) {
  const capMaxPx = Math.round(CAP_MAX_Y / K);
  return COLUMNS.map((cx) => {
    const x = Math.round(cx / K);
    let top = null, low = null;
    for (let y = 0; y <= capMaxPx && y < hair.h; y++) {
      if (drawn(hair, x, y)) { if (top === null) top = y; low = y; }
    }
    return { c2x: cx, crown: top === null ? null : top * K, hairline: low === null ? null : low * K };
  });
}

// What is under the hair? The decomposed base was cut UNDER the North Star hair, so the
// scalp/temples it permanently hides were reconstructed rather than photographed. A C2 style with
// less coverage would expose part of that area, so this compares the hidden pixels against the
// visibly painted skin of the same base.
// AVERAGE COLOUR ONLY, and deliberately not a gate: a mean says nothing about WHERE the pixels
// sit, so it can lower the suspicion of an obvious colour hole and nothing more. It cannot show
// the scalp is finished, that hairline/crown shading is right, or that ear detail exists. No
// threshold is defined on it here or in the audit.
export function measureUnderHair(base, hair, b) {
  const stat = (px) => {
    if (!px.length) return null;
    const m = [0, 1, 2].map((k) => px.reduce((a, p) => a + p[k], 0) / px.length);
    const sd = [0, 1, 2].map((k) => Math.sqrt(px.reduce((a, p) => a + (p[k] - m[k]) ** 2, 0) / px.length));
    return { n: px.length, mean: m, sd };
  };
  const hidden = [], visible = [];
  for (let y = b.crownY; y <= b.neck.y; y++) {
    for (let x = 0; x < base.w; x++) {
      if (!drawn(base, x, y)) continue;
      const i = (y * base.w + x) * 4;
      const px = [base.rgba[i], base.rgba[i + 1], base.rgba[i + 2]];
      if (drawn(hair, x, y)) hidden.push(px); else visible.push(px);
    }
  }
  const h = stat(hidden), v = stat(visible);
  const dist = (h && v) ? Math.hypot(h.mean[0] - v.mean[0], h.mean[1] - v.mean[1], h.mean[2] - v.mean[2]) : null;
  const headPx = hidden.length + visible.length;
  return { hidden: h, visible: v, meanDistance: dist, hiddenShare: hidden.length / headPx, headPx };
}

export function bboxOf(img) {
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1, n = 0;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      if (drawn(img, x, y)) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y; n++;
      }
    }
  }
  return x1 < 0 ? null : { x0: x0 * K, y0: y0 * K, x1: x1 * K, y1: y1 * K, px: n };
}

// ── C2 hair SVG measurement — exact column crossings of the path data ────────────────────────
// The seven assets use ONLY M / L / Q / Z with absolute coordinates. Crossings of a vertical
// line x=X are solved analytically (linear for L, quadratic for Q), so no rasteriser, no
// renderer and no library is involved and the result is exact rather than sampled.
export function parseSubpaths(d) {
  const tok = d.match(/[MLQZmlqz]|-?\d*\.?\d+/g) || [];
  const subs = [];
  let cur = null, start = null, pt = null, i = 0, cmd = null;
  const num = () => parseFloat(tok[i++]);
  while (i < tok.length) {
    if (/^[MLQZmlqz]$/.test(tok[i])) cmd = tok[i++];
    if (cmd === "M" || cmd === "m") {
      const p = [num(), num()];
      if (cur && cur.length) subs.push({ segs: cur, start, end: pt });
      cur = []; start = p; pt = p; cmd = "L";
    } else if (cmd === "L" || cmd === "l") {
      const p = [num(), num()];
      cur.push({ t: "L", p0: pt, p1: p }); pt = p;
    } else if (cmd === "Q" || cmd === "q") {
      const c = [num(), num()], p = [num(), num()];
      cur.push({ t: "Q", p0: pt, c, p1: p }); pt = p;
    } else if (cmd === "Z" || cmd === "z") {
      if (pt && start && (pt[0] !== start[0] || pt[1] !== start[1])) cur.push({ t: "L", p0: pt, p1: start });
      subs.push({ segs: cur, start, end: start });
      cur = []; pt = start; i++;
      cmd = null;
    } else {
      throw new Error("unsupported path command: " + cmd);
    }
  }
  if (cur && cur.length) subs.push({ segs: cur, start, end: pt });
  return subs;
}

// y-values where the subpath crosses the vertical line x=X (implicitly closed).
function crossings(subs, X) {
  const ys = [];
  for (const sub of subs) {
    const segs = sub.segs.slice();
    if (sub.end && sub.start && (sub.end[0] !== sub.start[0] || sub.end[1] !== sub.start[1])) {
      segs.push({ t: "L", p0: sub.end, p1: sub.start }); // implicit close
    }
    for (const s of segs) {
      if (s.t === "L") {
        const [x0, y0] = s.p0, [x1, y1] = s.p1;
        if (x0 === x1) continue;
        const t = (X - x0) / (x1 - x0);
        if (t >= 0 && t < 1) ys.push(y0 + t * (y1 - y0));
      } else {
        const [x0, y0] = s.p0, [cx, cy] = s.c, [x1, y1] = s.p1;
        const a = x0 - 2 * cx + x1, b = 2 * (cx - x0), c = x0 - X;
        const roots = [];
        if (Math.abs(a) < 1e-9) { if (Math.abs(b) > 1e-9) roots.push(-c / b); }
        else {
          const disc = b * b - 4 * a * c;
          if (disc >= 0) {
            const sq = Math.sqrt(disc);
            roots.push((-b + sq) / (2 * a), (-b - sq) / (2 * a));
          }
        }
        for (const t of roots) {
          if (t >= 0 && t < 1) {
            const mt = 1 - t;
            ys.push(mt * mt * y0 + 2 * mt * t * cy + t * t * y1);
          }
        }
      }
    }
  }
  return ys.sort((p, q) => p - q);
}

// Filled spans along column X (even-odd pairing; every asset is a set of simple closed shapes).
export function columnSpans(subs, X) {
  const ys = crossings(subs, X);
  const out = [];
  for (let i = 0; i + 1 < ys.length; i += 2) out.push([ys[i], ys[i + 1]]);
  return out;
}

export function measureC2Style(style) {
  const file = c2HairPath(style);
  if (!existsSync(file)) throw new Error("missing C2 hair asset: " + file);
  const svg = readFileSync(file, "utf8");
  const ds = [...svg.matchAll(/\bd="([^"]+)"/g)].map((m) => m[1]);
  if (!ds.length) throw new Error("no path data in " + file);
  const subs = ds.flatMap((d) => parseSubpaths(d));

  const cols = COLUMNS.map((X) => {
    const sp = columnSpans(subs, X);
    const cap = sp.filter(([y0]) => y0 <= CAP_MAX_Y);
    if (!cap.length) return { c2x: X, crown: null, hairline: null };
    const crown = Math.min(...cap.map(([y0]) => y0));
    // hairline = the bottom of the cap span, clamped to the head so a lock cannot pose as one
    const hairline = Math.max(...cap.map(([, y1]) => Math.min(y1, CAP_MAX_Y)));
    return { c2x: X, crown, hairline };
  });

  // does the style drape below the head (side locks / tail)?
  let lowest = -Infinity, widest = { x0: Infinity, x1: -Infinity };
  for (let X = 30; X <= 130; X += 1) {
    const sp = columnSpans(subs, X);
    if (!sp.length) continue;
    widest.x0 = Math.min(widest.x0, X); widest.x1 = Math.max(widest.x1, X);
    lowest = Math.max(lowest, ...sp.map(([, y1]) => y1));
  }
  return { style, cols, lowestY: lowest, xSpan: widest, drapes: lowest > CAP_MAX_Y };
}

// ── report ──────────────────────────────────────────────────────────────────────────────────
export function run() {
  const base = loadWebp(BASE_REL, BASE_EXPECT_SHA);
  const hair = loadWebp(HAIR_REL, HAIR_EXPECT_SHA);
  const b = measureBase(base);
  const hairCols = measureHairColumns(hair);
  const hairBox = bboxOf(hair);
  const styles = C2_STYLES.map(measureC2Style);
  const underHair = measureUnderHair(base, hair, b);
  return { base, hair, b, hairCols, hairBox, styles, underHair };
}

function main() {
  const r = run();
  const { b, hairCols, hairBox, styles, underHair } = r;
  const cx = (b.widest.lo + b.widest.hi) / 2;

  console.log(`${TOOL} v${TOOL_VERSION} — READ-ONLY measurement, no file written`);
  console.log(`  ${BASE_REL} (${r.base.sha256.slice(0, 12)}…)`);
  console.log(`  ${HAIR_REL} (${r.hair.sha256.slice(0, 12)}…)`);
  console.log(`  all coordinates in the shared 160x240 C2 canvas (served ${SRC_W}x${SRC_H} x ${K})`);

  console.log("\n=== 1. R2 bald base — head landmarks ===");
  console.log(`  crown            y=${u(b.crownY * K)}`);
  console.log(`  widest skull     y=${u(b.widest.y * K)}  x ${u(b.widest.lo * K)}..${u(b.widest.hi * K)}  w=${u(b.widest.w * K)}  cx=${u(cx * K)}`);
  console.log(`  neck             y=${u(b.neck.y * K)}  w=${u(b.neck.w * K)}`);
  if (b.shoulder) console.log(`  shoulder onset   y=${u(b.shoulder.y * K)}  w=${u(b.shoulder.w * K)}`);
  console.log(`  head height      ${u((b.neck.y - b.crownY) * K)}`);
  console.log(`  C2 head contract cx=${C2_HEAD.cx} cy=${C2_HEAD.cy} r=${C2_HEAD.r} -> x ${C2_HEAD.cx - C2_HEAD.r}..${C2_HEAD.cx + C2_HEAD.r}, y ${C2_HEAD.cy - C2_HEAD.r}..${C2_HEAD.cy + C2_HEAD.r}`);
  console.log(`  DELTA crown      R2 ${u(b.crownY * K)} vs C2 ${u(C2_HEAD.cy - C2_HEAD.r)}  -> the R2 skull top is ${((b.crownY * K) - (C2_HEAD.cy - C2_HEAD.r)).toFixed(1)} C2 units LOWER`);
  console.log(`  DELTA width      R2 ${u(b.widest.w * K)} vs C2 ${u(2 * C2_HEAD.r)}   DELTA centre R2 ${u(cx * K)} vs C2 ${u(C2_HEAD.cx)}`);

  console.log("\n=== 2. R2 hair layer (hair-northstar-v1) ===");
  console.log(`  envelope  x ${u(hairBox.x0)}..${u(hairBox.x1)}  y ${u(hairBox.y0)}..${u(hairBox.y1)}  drawn px ${hairBox.px}`);
  console.log("  per-column crown / hairline:");
  for (const c of hairCols) console.log(`    x=${String(c.c2x).padStart(3)}  crown ${u(c.crown)}  hairline ${u(c.hairline)}`);

  console.log("\n=== 3. C2 hair assets — per-column crown / hairline (exact path crossings) ===");
  console.log("    style      " + COLUMNS.map((c) => String(c).padStart(6)).join(""));
  for (const s of styles) {
    console.log(`    ${s.style.padEnd(9)} c ` + s.cols.map((c) => u(c.crown)).join(""));
    console.log(`    ${" ".padEnd(9)} h ` + s.cols.map((c) => u(c.hairline)).join(""));
  }

  console.log(`\n=== 4. Vertical offset per style (forehead band x ${CENTRAL[0]}..${CENTRAL[CENTRAL.length - 1]}) ===`);
  console.log("  delta = (R2 hairline) - (C2 hairline) per column, over the FOREHEAD band only:");
  console.log("  outside it the two paths describe different features (C2 temple point vs R2 side lock).");
  console.log("  The mean is where a candidate translateY would START, never a validated value; the spread");
  console.log("  is how much the columns disagree, and it is what limits how far the mean can be trusted.");
  console.log("  A per-style residual check + render-scale review decides this. This tool decides nothing.");
  const hairAt = new Map(hairCols.map((c) => [c.c2x, c.hairline]));
  for (const s of styles) {
    const ds = [];
    for (const c of s.cols) {
      if (!CENTRAL.includes(c.c2x)) continue;
      const r2 = hairAt.get(c.c2x);
      if (c.hairline !== null && r2 !== null && r2 !== undefined) ds.push(r2 - c.hairline);
    }
    if (!ds.length) { console.log(`  ${s.style.padEnd(9)} no overlapping column`); continue; }
    const mean = ds.reduce((a, x) => a + x, 0) / ds.length;
    const min = Math.min(...ds), max = Math.max(...ds);
    const pct = (mean / 240) * 100;
    console.log(`  ${s.style.padEnd(9)} delta mean ${mean.toFixed(1).padStart(6)}  spread ${min.toFixed(1)}..${max.toFixed(1)} (${(max - min).toFixed(1)})` +
      `  => translateY(${pct.toFixed(1)}%)  x-span ${s.xSpan.x0}..${s.xSpan.x1}` +
      `  lowest y ${s.lowestY.toFixed(1)}${s.drapes ? "  DRAPES onto the body" : ""}`);
  }

  console.log("\n=== 5. What is under the hair? (base pixels the R2 hair hides — average colour only) ===");
  console.log(`  head pixels ${underHair.headPx}, of which ${(underHair.hiddenShare * 100).toFixed(1)}% sit under the R2 hair`);
  if (underHair.hidden && underHair.visible) {
    const f = (m) => m.map((v) => v.toFixed(1).padStart(6)).join(" ");
    console.log(`  hidden  n=${String(underHair.hidden.n).padStart(6)}  mean RGB ${f(underHair.hidden.mean)}  sd ${f(underHair.hidden.sd)}`);
    console.log(`  visible n=${String(underHair.visible.n).padStart(6)}  mean RGB ${f(underHair.visible.mean)}  sd ${f(underHair.visible.sd)}`);
    console.log(`  mean colour distance hidden vs visible skin: ${underHair.meanDistance.toFixed(1)} (scale 0..441)`);
    console.log("  NOT A GATE. A small distance only lowers the suspicion of an obvious colour hole; it");
    console.log("  cannot approve the exposure. A mean says nothing about WHERE the pixels sit, so spatial");
    console.log("  inspection and a render-scale visual review are still required. No threshold is defined.");
  }

  console.log("\nGeometry is a NECESSARY condition only — see docs/167a-r2-hair-identity-audit.md §6.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
