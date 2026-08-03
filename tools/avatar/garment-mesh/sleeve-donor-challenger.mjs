// D-097 (design/measurement only) — deterministic SLEEVE-DONOR challenger.
// ---------------------------------------------------------------------------------------------
// Three full regenerations (D-095/D-096) established that prompt wording moves the shortfall
// between bands rather than removing it: v1 owns the collar and skirt, v2/v3 own the sleeves, and
// none beats v1 overall (8,608 vs 10,486 vs 9,172 backfill px). So instead of asking for a fourth
// whole garment, this takes the ONE region the donors genuinely do better and grafts only that.
//
// BASE: the accepted v1 chain (`…-candidate-nobackfill.png`). Everything the owner approved —
// collar, breastplate, centre ridge, belt and buckle, torso, skirt — is carried over untouched.
// DONOR: v2 or v3, LEFT AND RIGHT SLEEVE REGIONS ONLY.
//
// WHY THE SEAM CAN BE INVISIBLE HERE, and why it is not a horizontal band swap:
// the seam is the garment's own ARMPIT / breastplate-side line — the vertical boundary of the
// torso column, measured per source rather than assumed. v1's column is x 401..625 and v2's is
// x 401..624: a ONE-PIXEL difference, so the two garments' armholes sit on the same anatomical
// line and the join lands where a plate edge already is. v3's column is x 395..627 (6 px wider on
// the left), which is measured and reported rather than hidden.
//
// A horizontal cut would have severed the breastplate; this cuts vertically at the armhole, which
// is where a real garment is seamed too.
//
// Nothing here is promoted, and the accepted asset is never written.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, sep } from "node:path";
import { decodePng, encodePngRGBA } from "../build-r2-torso-occlusion-mask.mjs";
import { OPAQUE, VISIBLE, BANDS, REFERENCE_BAND_COVERAGE } from "../check-r2-torso-candidate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");
const AI = join(REPO, "tools", "avatar", "build", "ai-input");
const FIX = join(REPO, "tools", "avatar", "fixtures", "r2-torso");
const BUILD = join(REPO, "tools", "avatar", "build", "sleeve-donor");
export const W = 1024, H = 1536;

const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const ALLOWED = [BUILD];
function assertWritable(p) {
  const abs = resolve(p);
  if (!ALLOWED.some((r) => abs === resolve(r) || abs.startsWith(resolve(r) + sep))) {
    throw new Error("refusing to write outside build/sleeve-donor/: " + abs);
  }
  return abs;
}
const write = (p, b) => { const a = assertWritable(p); mkdirSync(dirname(a), { recursive: true }); writeFileSync(a, b); return a; };

const SOURCES = {
  v1: "torso-armor-knight-candidate-nobackfill.png",
  v2: "torso-armor-knight-candidate-v2-nobackfill.png",
  v3: "torso-armor-knight-candidate-v3-nobackfill.png",
};

function load(key) {
  const p = join(AI, SOURCES[key]);
  if (!existsSync(p)) throw new Error(`missing source ${key}: ${p}`);
  const buf = readFileSync(p);
  return { ...decodePng(buf, key), sha256: sha256(buf) };
}
function loadMask(name) {
  const img = decodePng(readFileSync(join(FIX, name)), name);
  const m = new Uint8Array(img.w * img.h);
  for (let i = 0; i < m.length; i++) m[i] = img.rgba[i * 4 + 3] > 0 ? 1 : 0;
  return m;
}

const alphaAt = (img, x, y) => img.rgba[(y * W + x) * 4 + 3];
function rowSpan(img, y, thr = 200) {
  let l = -1, h = -1;
  for (let x = 0; x < W; x++) if (alphaAt(img, x, y) >= thr) { if (l < 0) l = x; h = x; }
  return [l, h];
}

// ── the garment's own geometry, measured not assumed ──────────────────────────────────────────
// The torso column is the span that SURVIVES below the sleeves (median over rows 730–880, i.e.
// below every source's sleeve end and above the hem). Its edges are the armhole line.
export function geometry(img) {
  const ls = [], hs = [];
  for (let y = 730; y <= 880; y += 5) {
    const [l, h] = rowSpan(img, y);
    if (l >= 0) { ls.push(l); hs.push(h); }
  }
  ls.sort((a, b) => a - b); hs.sort((a, b) => a - b);
  const torsoL = ls[Math.floor(ls.length / 2)], torsoR = hs[Math.floor(hs.length / 2)];
  let top = -1;
  for (let y = 500; y < 760 && top < 0; y++) if (rowSpan(img, y)[0] >= 0) top = y;
  let sleeveEnd = -1;
  for (let y = 560; y <= 760; y++) {
    const [l, h] = rowSpan(img, y);
    if (l >= 0 && (h - l) > (torsoR - torsoL) + 20) sleeveEnd = y;
  }
  return { torsoL, torsoR, torsoWidth: torsoR - torsoL + 1, top, sleeveEnd };
}

// ── the seam: follow the garment's own plate outline, not a straight line ─────────────────────
// The first attempt cut vertically at the torso-column edge. Numerically flawless, visually a
// paste edge: the median luminance step across the join went from 0.81 in the untouched garment to
// 50.67 after grafting, and at 4× it reads as a dead-straight line no garment would have.
//
// The armhole in this artwork IS drawn — a dark outline stroke (luma ≈ 0–16) separating sleeve from
// breastplate. Cutting ON that stroke hides the join inside a line the eye already expects.
//
// Finding it needs TRACKING, not a per-row minimum: searching a fixed window catches the outer
// silhouette outline instead wherever the sleeve narrows (measured: rows 640–650 jumped to x 376–384,
// ~25 px off the armhole). So the seam is followed from a seed row with a tight per-row window, and
// rows where no dark stroke exists fall back to the previous position rather than inventing one.
// ARMHOLE_WINDOW spans the torso column edge and reaches INBOARD, because that is where the
// armhole actually is — measured, after two attempts that assumed otherwise.
export const ARMHOLE_INBOARD = 40, ARMHOLE_OUTBOARD = 25;

export function plateSeam(img, geo, side) {
  const lum = (x, y) => { const i = (y * W + x) * 4; return 0.299 * img.rgba[i] + 0.587 * img.rgba[i + 1] + 0.114 * img.rgba[i + 2]; };
  const opaque = (x, y) => alphaAt(img, x, y) >= 250;
  const edge = side === "left" ? geo.torsoL : geo.torsoR;
  const inward = side === "left" ? 1 : -1;   // toward the centre
  const raw = new Int16Array(H).fill(-1);

  // The armhole is the INNERMOST dark pixel before the breastplate tone begins — i.e. the last
  // stroke pixel on the way in. Measured on v1: it runs x 440 at the shoulder down to 410 at the
  // armpit, a real armhole curve, and it sits INBOARD of the torso column (401), not on it.
  for (let y = Math.max(0, geo.top - 10); y <= geo.sleeveEnd + 40; y++) {
    let last = -1;
    for (let d = -ARMHOLE_OUTBOARD; d <= ARMHOLE_INBOARD; d++) {
      const x = edge + inward * d;
      if (x < 1 || x >= W - 1 || !opaque(x, y)) continue;
      if (lum(x, y) < 110) last = x;
    }
    raw[y] = last;
  }

  // Median over 15 rows. Under the sleeve the "stroke" widens into a cast shadow (measured up to
  // 60 px at rows 635–675), which throws single-row outliers; a wide median rejects them, and a
  // jittering cut line would itself be visible.
  const out = new Int16Array(H).fill(-1);
  for (let y = 0; y < H; y++) {
    const w = [];
    for (let d = -7; d <= 7; d++) if (raw[y + d] !== undefined && raw[y + d] > 0) w.push(raw[y + d]);
    if (!w.length) { out[y] = -1; continue; }
    w.sort((a, b) => a - b);
    out[y] = w[Math.floor(w.length / 2)];
  }
  return out;
}

// ── semantic sleeve masks ─────────────────────────────────────────────────────────────────────
// A sleeve pixel is one that is (a) opaque in the donor, (b) OUTBOARD of the armhole line, and
// (c) within the sleeve's own vertical extent. The inboard boundary is the armhole, the outer
// boundary is the donor's own silhouette, the top is the shoulder contour and the bottom is the
// cuff — all four come from the artwork rather than from a rectangle.
export function sleeveMasks(donor, geo, { seamL = null, seamR = null } = {}) {
  const left = new Uint8Array(W * H), right = new Uint8Array(W * H);
  const yTop = geo.top, yBot = geo.sleeveEnd + 40;   // +40: the donor's sleeve reaches lower than the base's
  let nL = 0, nR = 0;
  for (let y = yTop; y <= yBot; y++) {
    // Per-row seam from the plate outline; the straight column edge only as a fallback.
    const cutL = (seamL && seamL[y] >= 0) ? seamL[y] : geo.torsoL;
    const cutR = (seamR && seamR[y] >= 0) ? seamR[y] : geo.torsoR;
    for (let x = 0; x < W; x++) {
      if (alphaAt(donor, x, y) < VISIBLE) continue;
      // STRICTLY outboard of the stroke: the dark line itself stays with the BASE, so the accepted
      // artwork keeps its own outline and the donor is tucked behind it.
      if (x < cutL) { left[y * W + x] = 1; nL++; }
      else if (x > cutR) { right[y * W + x] = 1; nR++; }
    }
  }
  return { left, right, leftPx: nL, rightPx: nR, yTop, yBot };
}

// ── the graft ─────────────────────────────────────────────────────────────────────────────────
// Base pixels are kept everywhere except inside the sleeve masks, where the donor replaces them.
// Below the base's own sleeve end the base is transparent there, so the donor ADDS material —
// which is the entire point.
// The donor is here to ADD sleeve, never to subtract garment. Measured on the first attempt: a
// straight replace lost 170 opaque pixels the base already had — 165 in the shoulder band at rows
// 560–564, where the donor's sleeve is a few pixels narrower than v1's, and 5 in the torso band.
// The shoulder swamped that (5,244 gained), but the torso ended 2 px worse than the accepted asset
// and therefore failed its criterion outright.
//
// So the rule is asymmetric on purpose: the donor wins wherever it HAS content, and the base
// survives wherever the donor has none. The silhouette can then only grow, never retreat — which
// is exactly the guarantee "torso must not be worse than v1" asks for, expressed in the graft
// instead of patched afterwards.
export function graft(base, donor, masks) {
  const out = Buffer.from(base.rgba);
  let replaced = 0, added = 0, keptBase = 0;
  for (let i = 0; i < W * H; i++) {
    if (!masks.left[i] && !masks.right[i]) continue;
    const baseA = base.rgba[i * 4 + 3], donorA = donor.rgba[i * 4 + 3];
    const had = baseA >= VISIBLE;
    // Preserve the base ONLY where the donor genuinely has no garment — i.e. at the SILHOUETTE,
    // never inside the sleeve face.
    //
    // The obvious rule ("keep whichever alpha is higher") was tried and is wrong: 3,131 pixels have
    // both artworks fully opaque but differing by a single alpha step (255 vs 254), so the base won
    // arbitrarily and the two drawings ended up interleaved — 22 source switches per 100 px, which
    // at 8× is visible salt-and-pepper speckle across the whole sleeve. It fixed a 2-pixel number
    // and broke the picture.
    //
    // OPAQUE is the boundary that matters: if the donor is opaque here, the donor owns the pixel,
    // full stop — no per-pixel arbitration, so the sleeve face comes from ONE drawing. The base is
    // kept only where the donor is not opaque but the base was, which is exactly the silhouette
    // shortfall that lost 170 pixels.
    if (donorA < OPAQUE && baseA > donorA) { if (had) keptBase++; continue; }
    for (let c = 0; c < 4; c++) out[i * 4 + c] = donor.rgba[i * 4 + c];
    if (had) replaced++; else added++;
  }
  return { rgba: out, replacedPx: replaced, addedPx: added, keptBasePx: keptBase };
}

// ── measurement ───────────────────────────────────────────────────────────────────────────────
function components(rgba) {
  const on = new Uint8Array(W * H);
  for (let i = 0; i < on.length; i++) on[i] = rgba[i * 4 + 3] >= OPAQUE ? 1 : 0;
  const seen = new Uint8Array(on.length), sizes = [];
  const N = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (let s = 0; s < on.length; s++) {
    if (!on[s] || seen[s]) continue;
    const q = [s]; seen[s] = 1;
    for (let k = 0; k < q.length; k++) {
      const j = q[k], y = (j / W) | 0, x = j % W;
      for (const [dx, dy] of N) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const t = yy * W + xx;
        if (on[t] && !seen[t]) { seen[t] = 1; q.push(t); }
      }
    }
    sizes.push(q.length);
  }
  return sizes.sort((a, b) => b - a);
}

export function measure(rgba, masks3, label) {
  const bands = {};
  for (const [name, [y0, y1]] of Object.entries(BANDS)) {
    let tot = 0, cov = 0;
    for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!masks3.hard[i]) continue;
        tot++;
        if (rgba[i * 4 + 3] >= OPAQUE) cov++;
      }
    }
    if (tot) bands[name] = { hardPx: tot, coveredPx: cov, missingPx: tot - cov, coverage: +(cov / tot).toFixed(5) };
  }
  let stray = 0, onProtect = 0, orphanSoft = 0, visible = 0;
  for (let i = 0; i < W * H; i++) {
    const a = rgba[i * 4 + 3];
    if (a >= VISIBLE) { visible++; if (!masks3.edit[i]) stray++; if (masks3.protect[i]) onProtect++; }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, a = rgba[i * 4 + 3];
    if (a === 0 || a >= OPAQUE) continue;
    let near = false;
    for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      if (rgba[(yy * W + xx) * 4 + 3] >= OPAQUE) { near = true; break; }
    }
    if (!near) orphanSoft++;
  }
  const comps = components(rgba);
  const totalMissing = Object.values(bands).reduce((s, b) => s + b.missingPx, 0);
  return {
    label, bands, totalMissingPx: totalMissing,
    inkOutsideEdit: stray, inkOnProtect: onProtect, orphanSoftPx: orphanSoft,
    visiblePx: visible, components: comps.length, largestComponent: comps[0] ?? 0,
    specks: comps.filter((c) => c < 64).length,
  };
}

// SEAM QUALITY. A graft can satisfy every band and still show a visible join, so the seam is
// measured directly: at each row, the colour step across the armhole line. A step no larger than
// the garment's own local variation is invisible; a large one is a seam you can see.
export function seamMetrics(rgba, geo, seamL = null, seamR = null) {
  const lum = (i) => 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  const steps = [];
  for (const [fixed, curve] of [[geo.torsoL, seamL], [geo.torsoR, seamR]]) {
    for (let y = geo.top; y <= geo.sleeveEnd; y++) {
      const edge = (curve && curve[y] >= 0) ? curve[y] : fixed;
      const inA = (y * W + edge - 1), inB = (y * W + edge + 1);
      if (rgba[inA * 4 + 3] < OPAQUE || rgba[inB * 4 + 3] < OPAQUE) continue;
      steps.push(Math.abs(lum(inB) - lum(inA)));
    }
  }
  steps.sort((a, b) => a - b);
  const pick = (q) => steps.length ? +steps[Math.min(steps.length - 1, Math.floor(q * (steps.length - 1)))].toFixed(2) : 0;
  return { samples: steps.length, medianStep: pick(0.5), p95Step: pick(0.95), maxStep: pick(1) };
}

// ── run ───────────────────────────────────────────────────────────────────────────────────────
function main() {
  mkdirSync(BUILD, { recursive: true });
  const masks3 = { hard: loadMask("torso-occlusion-hard-v1.png"), edit: loadMask("torso-edit-allowed-v1.png"), protect: loadMask("torso-protect-v1.png") };
  const base = load("v1");
  const geoBase = geometry(base);
  console.log(`base v1  sha ${base.sha256.slice(0, 16)}…  torso column x ${geoBase.torsoL}..${geoBase.torsoR}  sleeve end y ${geoBase.sleeveEnd}`);

  const report = { tool: "sleeve-donor-challenger", decision: "D-097", base: { key: "v1", sha256: base.sha256, geometry: geoBase }, reference: REFERENCE_BAND_COVERAGE, variants: {} };
  const baseM = measure(base.rgba, masks3, "v1 base (no backfill)");
  report.variants["v1-base"] = baseM;
  write(join(BUILD, "00-v1-base.png"), encodePngRGBA(W, H, base.rgba));

  for (const donorKey of ["v2", "v3"]) {
    const donor = load(donorKey);
    const geoD = geometry(donor);
    // The graft uses the BASE's armhole line, so the accepted breastplate is never cut into;
    // the donor is read on that line even if its own column sits a pixel or six away.
    const seamL = plateSeam(base, geoBase, "left");
    const seamR = plateSeam(base, geoBase, "right");
    const masks = sleeveMasks(donor, geoBase, { seamL, seamR });
    const g = graft(base, donor, masks);
    const m = measure(g.rgba, masks3, `v1 base + ${donorKey} sleeves`);
    const seam = seamMetrics(g.rgba, geoBase, seamL, seamR);
    report.variants[`v1+${donorKey}-sleeves`] = {
      ...m,
      donor: { key: donorKey, sha256: donor.sha256, geometry: geoD, columnOffsetLeft: geoD.torsoL - geoBase.torsoL, columnOffsetRight: geoD.torsoR - geoBase.torsoR },
      graft: { leftMaskPx: masks.leftPx, rightMaskPx: masks.rightPx, replacedPx: g.replacedPx, addedPx: g.addedPx, seamRows: [masks.yTop, masks.yBot] },
      seam,
    };
    write(join(BUILD, `10-v1+${donorKey}-sleeves.png`), encodePngRGBA(W, H, g.rgba));
    // sleeve-mask overlay, so the graft region is reviewable rather than described
    const ov = Buffer.from(g.rgba);
    for (let i = 0; i < W * H; i++) if (masks.left[i] || masks.right[i]) {
      ov[i * 4] = Math.round(ov[i * 4] * 0.5 + 255 * 0.5);
      ov[i * 4 + 2] = Math.round(ov[i * 4 + 2] * 0.5 + 255 * 0.5);
      ov[i * 4 + 3] = Math.max(ov[i * 4 + 3], 120);
    }
    write(join(BUILD, `11-v1+${donorKey}-sleeve-mask.png`), encodePngRGBA(W, H, ov));
  }

  write(join(BUILD, "report.json"), Buffer.from(JSON.stringify(report, null, 2) + "\n", "utf8"));

  const REF = { collar: 1.0, shoulder: 0.87952, torso: 0.94106, skirt: 1.0 };
  const rows = Object.entries(report.variants);
  console.log("\nvariant                 collar    shoulder     torso     skirt    mangler   soem(p95)");
  for (const [k, v] of rows) {
    const b = v.bands;
    const f = (n) => b[n] ? (b[n].coverage * 100).toFixed(1).padStart(7) + "%" : "     — ";
    console.log(k.padEnd(22), f("collar"), f("shoulder"), f("torso"), f("skirt"),
      String(v.totalMissingPx).padStart(9), v.seam ? String(v.seam.p95Step).padStart(10) : "         —");
  }
  console.log("\nv1-reference (accepted, before backfill): collar 100.0%  shoulder 88.0%  torso 94.1%  skirt 100.0%  mangler 8608");
  for (const [k, v] of rows) {
    if (!v.seam) continue;
    const b = v.bands;
    const ok = [
      ["collar >= 100%", b.collar.coverage >= REF.collar],
      ["skirt >= 100%", b.skirt ? b.skirt.coverage >= REF.skirt : true],
      ["torso >= 94.106%", b.torso.coverage >= REF.torso],
      ["shoulder > 87.952%", b.shoulder.coverage > REF.shoulder],
      ["backfill < 8608", v.totalMissingPx < 8608],
      ["0 ink outside edit", v.inkOutsideEdit === 0],
      ["0 ink on protect", v.inkOnProtect === 0],
      ["1 component", v.components === 1],
    ];
    console.log(`\n${k}:`);
    for (const [name, pass] of ok) console.log(`  ${pass ? "✓" : "✖"} ${name}`);
  }
}
const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  try { main(); } catch (e) { console.error("✖ " + e.message); process.exit(1); }
}
