// D-371 NH-1B — THE KORT SILHOUETTE: the fixed hair shape for Kort, drawn on Northstar's bald head from the D-371 template alone.
// Deterministic, offline; no image call. Two layers on the figure grid (1024×1536):
//   FRONT  — the cap and its soft crown, the slightly asymmetric fringe (lower at the figure's left), the temples, and a sideburn in front of
//            each ear that covers the whole skin flap (D-371 M4), 2 px past it over the face's contour, and 1 px of the ear's outer rim;
//   BEHIND — the small fillet between the hair's side and the top of each ear, which lies behind the ear.
// The shape is the geometry reference of NH-1B (Image 2) and the clip of the fixed composition (northstar-hair-compose-d371.mjs). Its
// layers are pinned in plan-nh1b-v1.json; the PNGs themselves stay private, outside both clones.
// Usage:
//   node tools/avatar/northstar-kort-silhouette-d371.mjs --out <empty dir outside the repository>     writes kort-silhouette-front.png / -behind.png
import { writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, resolve, dirname, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import * as T from "./northstar-hair-template-d371.mjs";
import { encodePng, pixelSha256 } from "./r3-hair-tool-v2.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const W = 1024, H = 1536, N = W * H;
export const FRONT_NAME = "kort-silhouette-front.png", BEHIND_NAME = "kort-silhouette-behind.png";

/** The shape's numbers (figure grid). */
export const SHAPE = Object.freeze({
  crownLift: 13, sideLift: 8,          // volume above the skull at the crown, and beside it just above the ears
  lobes: 3, lobeAmp: 3,                // three broad, soft swells along the crown (no points)
  fringeLeftEdge: 231,                 // the figure's left (image left): the fringe comes lower here …
  fringeRightEdge: 219,                // … and sits higher at the figure's right: a slight asymmetry
  fringeLocks: 3, lockDepth: 6,        // three locks, each with a point leaning towards the figure's left
  browGap: 7,                          // the fringe stays at least this far above each brow, column by column
  smooth: 4,                           // blur radius for the outer outline (soft curve, no step)
  sideburnTaper: 14,                   // rows over which the sideburn's inner edge narrows towards the flap at its foot
  templeEase: 0.55,                    // how early the temple's inner edge starts turning towards the flap (0…1 of the run)
  tuckBelowEarTop: 12,                 // rows below the ear's top where BEHIND hair may lie (the fillet)
  filletDepth: 10,                     // how far down the ear's top takes part in the smoothing
  rimCover: 1,                         // the ear's outer rim covered within 1 px of each flap: a margin so the flap stays covered
  rimWedge: 1,                         // passes that soften the sideburn's corners on the ear's outer rim (never its inside)
  fill: { front: 132, behind: 112, line: 24, lineRadius: 3 },
});

/** The silhouette on the template `t` (buildTemplate()): { front, behind } masks and { FRONT, BEHIND } painted RGBA layers. */
export function buildKortSilhouette(t) {
  const S = SHAPE, { z, spec } = t, C = spec.crop;
  const forbidden = (i) => z.ears[i] || z.eyesClear[i] || z.brows.left[i] || z.brows.right[i];
  const rowOf = (i) => (i / W) | 0, colOf = (i) => i % W;
  const earTop = z.earTop, fl = spec.temples.left, fr = spec.temples.right, crownY = spec.crown.y;
  const skull = new Uint8Array(N); for (let i = 0; i < N; i++) if (z.head[i] && !z.ears[i]) skull[i] = 1;

  // 1. the fringe: an asymmetric base line with three leaning locks, clipped column by column above the brows
  const fringeX0 = fl.x1 + 1, fringeX1 = fr.x0 - 1;
  const browTopAt = (x) => { for (let y = 200; y < 300; y++) { const i = y * W + x; if (z.brows.left[i] || z.brows.right[i]) return y; } return null; };
  const browGeneralTop = (x) => (x < W / 2 ? spec.brows.left.y0 : spec.brows.right.y0);
  const hairlineY = (x) => {
    const u = (x - fringeX0) / (fringeX1 - fringeX0), base = S.fringeLeftEdge + (S.fringeRightEdge - S.fringeLeftEdge) * u + 2 * Math.sin(Math.PI * u);
    const k = u * S.fringeLocks, f = k - Math.floor(k), lean = 0.35;                       // the point of each lock sits at 35 % of its width
    const tri = f < lean ? f / lean : (1 - f) / (1 - lean), tip = S.lockDepth * Math.pow(Math.max(0, tri), 1.8);
    const b = browTopAt(x) ?? browGeneralTop(x);
    return Math.min(b - S.browGap, Math.round(base + tip));
  };

  // 2. the temples and sideburns: one smooth inner edge per side, from the fringe's end down to the flap's foot
  const flapPlus = new Uint8Array(N); for (let i = 0; i < N; i++) if (z.flap[i]) { const x = colOf(i), y = rowOf(i); for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dy * dy <= 4) flapPlus[(y + dy) * W + x + dx] = 1; }
  const innerEdge = (sideIsLeft) => {
    const f = sideIsLeft ? fl : fr, top = hairlineY(sideIsLeft ? fringeX0 : fringeX1), foot = f.y1 + 2, xs = new Map();
    // the flap's inner edge per row (the face side), +2 px so the face's contour line through the flap is covered too
    for (let y = f.y0 - 2; y <= foot; y++) { let e = null; for (let x = f.x0 - 3; x <= f.x1 + 3; x++) if (flapPlus[y * W + x] && z.head[y * W + x] && !z.ears[y * W + x]) e = e === null ? x : sideIsLeft ? Math.max(e, x) : Math.min(e, x); if (e !== null) xs.set(y, e); }
    const xTop = sideIsLeft ? fringeX0 + 1 : fringeX1 - 1, edge = new Map();
    const flapTop = Math.min(...xs.keys()), firstX = xs.get(flapTop);
    // rows inside the flap's run with no flap pixel (the ear touches the face there): interpolate, so the sideburn runs on in front of the ear
    const known = [...xs.keys()].sort((a, b) => a - b);
    for (let y = flapTop; y <= foot; y++) if (!xs.has(y)) { const a = known.filter((k) => k < y).pop(), b = known.find((k) => k > y); if (a !== undefined && b !== undefined) xs.set(y, Math.round(xs.get(a) + (xs.get(b) - xs.get(a)) * (y - a) / (b - a))); else if (a !== undefined) xs.set(y, xs.get(a)); }
    // never narrower than 4 px of face in front of the ear
    const earSide = (y) => { let e = null; for (let x = f.x0 - 10; x <= f.x1 + 10; x++) if (z.ears[y * W + x]) e = e === null ? x : sideIsLeft ? Math.max(e, x) : Math.min(e, x); return e; };
    for (const [y, x] of xs) { const e = earSide(y); if (e !== null) xs.set(y, sideIsLeft ? Math.max(x, e + 4) : Math.min(x, e - 4)); }
    for (let y = top; y <= foot; y++) {
      let x;
      if (y < flapTop) { const v = (y - top) / Math.max(1, flapTop - top), e = v < S.templeEase ? 0 : Math.pow((v - S.templeEase) / (1 - S.templeEase), 2); x = xTop + (firstX - xTop) * e; }
      else x = xs.get(y) ?? firstX;
      if (y > f.y1 - S.sideburnTaper) { const g = Math.min(1, (y - (f.y1 - S.sideburnTaper)) / S.sideburnTaper); x = x + (sideIsLeft ? -1 : 1) * 2 * g * g; }
      edge.set(y, x);
    }
    // smooth the run (moving average, 9 rows) but never inside the flap's own inner edge: the flap stays covered
    const ys = [...edge.keys()].sort((a, b) => a - b), sm = new Map();
    const flapInner = (y) => { let e = null; for (let x = f.x0; x <= f.x1; x++) if (z.flap[y * W + x]) e = e === null ? x : sideIsLeft ? Math.max(e, x) : Math.min(e, x); return e; };
    for (const y of ys) { let s = 0, n = 0; for (let d = -4; d <= 4; d++) if (edge.has(y + d)) { s += edge.get(y + d); n++; } let x = s / n; const fi = flapInner(y); if (fi !== null) x = sideIsLeft ? Math.max(x, fi) : Math.min(x, fi);
      // 4 px of face in front of the ear in this row, 2 px in the rows above and below: neighbouring rows overlap (one connected lock)
      if (y >= flapTop) for (const d of [0, -1, 1]) { const e = earSide(y + d); if (e !== null) { const g = d === 0 ? 4 : 2; x = sideIsLeft ? Math.max(x, e + g) : Math.min(x, e - g); } }
      sm.set(y, x); }
    return { top, foot, at: (y) => sm.get(y) };
  };
  const IL = innerEdge(true), IR = innerEdge(false);

  // 3. FRONT inside the head; the outside volume; BEHIND at the ears
  const front = new Uint8Array(N), behind = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (!z.head[i] || forbidden(i)) continue;
    const x = colOf(i), y = rowOf(i);
    if (z.flap[i]) { front[i] = 1; continue; }
    if (x >= fringeX0 && x <= fringeX1) { if (y <= hairlineY(x)) front[i] = 1; continue; }
    const E = x < fringeX0 ? IL : IR; if (y < E.top) { front[i] = 1; continue; }
    if (y <= E.foot) { const e = E.at(y); if (e !== undefined && (x < fringeX0 ? x <= e : x >= e)) front[i] = 1; }
  }
  // the short crossing of the ear's rim at its top, where the flap meets it (as Northstar's hair)
  for (let i = 0; i < N; i++) if (z.earRim[i] && rowOf(i) <= earTop + 4) { const x = colOf(i); for (const k of [i - 1, i + 1, i - W, i + W, i - 2, i + 2]) if (k >= 0 && k < N && Math.abs(colOf(k) - x) <= 2 && z.flap[k]) { front[i] = 1; break; } }
  // soften the sideburn's corners against the ear's front on the ear's outer RIM (never its inside)
  for (let pass = 0; pass < S.rimWedge; pass++) { const add = [];
    for (const f of [fl, fr]) for (let y = f.y0; y <= f.y1; y++) for (let x = f.x0 - 4; x <= f.x1 + 4; x++) { const i = y * W + x; if (!z.earRim[i] || front[i]) continue; const nb = (front[i - W] ? 1 : 0) + (front[i - 1] ? 1 : 0) + (front[i + 1] ? 1 : 0); if (nb >= 2 || (front[i - W] && (front[i - W - 1] || front[i - W + 1]))) add.push(i); }
    for (const i of add) front[i] = 1; }
  // a margin for a drawn result: the ear's outer RIM within S.rimCover px of each flap is covered too (never the ear's inside)
  if (S.rimCover > 0) { const near = new Uint8Array(N); for (let i = 0; i < N; i++) if (z.flap[i]) { const x = colOf(i), y = rowOf(i); for (let dy = -S.rimCover; dy <= S.rimCover; dy++) for (let dx = -S.rimCover; dx <= S.rimCover; dx++) if (dx * dx + dy * dy <= S.rimCover * S.rimCover) near[(y + dy) * W + x + dx] = 1; }
    for (let i = 0; i < N; i++) if (near[i] && z.earRim[i]) front[i] = 1; }

  // the outside volume: Euclidean distance to the skull's outline, a soft lift that thins towards the ears with three broad swells
  const CX = (spec.head.x0 + spec.head.x1) / 2, CY = 330;
  const bnd = []; for (let y = 0; y <= earTop + 30; y++) for (let x = C.x; x < C.x + C.size; x++) { const i = y * W + x; if (skull[i] && (!skull[i - 1] || !skull[i + 1] || !skull[i - W] || !skull[i + W])) bnd.push([x, y]); }
  const lim = earTop + S.tuckBelowEarTop, outside = new Float32Array(N).fill(-1);
  for (let y = 0; y <= lim; y++) for (let x = C.x; x < C.x + C.size; x++) {
    const i = y * W + x; if (z.head[i]) continue; let best = 1e9, by = 0, bx = 0;
    for (const [px, py] of bnd) { const d = (px - x) * (px - x) + (py - y) * (py - y); if (d < best) { best = d; bx = px; by = py; } }
    const v = Math.max(0, Math.min(1, (earTop - by) / (earTop - crownY))), s = v * v * (3 - 2 * v);   // smoothstep: soft, no corner
    const a = Math.atan2(CY - by, bx - CX) / Math.PI, lobe = S.lobeAmp * Math.pow(Math.sin(Math.PI * a * S.lobes), 2) * s;
    const lift = y <= earTop - 6 ? S.sideLift + (S.crownLift - S.sideLift) * s + lobe : 0;   // below that, only the smoothing's fillet adds hair
    outside[i] = Math.sqrt(best) <= lift ? 1 : 0;
  }
  // smooth the outer outline: blur (hair ∪ upper skull ∪ the ear's top) and threshold — the corner between the hair's side and the ear fills
  // with a small fillet that lies BEHIND the ear; a convex edge (the ear's top itself) never grows a band of hair
  const U = new Float32Array(N); for (let i = 0; i < N; i++) { const y = rowOf(i); if (y > lim) continue; if (outside[i] === 1 || front[i] || (skull[i] && y < earTop) || (z.ears[i] && y <= earTop + S.filletDepth)) U[i] = 1; }
  const blur = (A, r) => { const tmp = new Float32Array(N), o = new Float32Array(N); for (let y = 0; y <= lim + r; y++) { let s = 0; for (let x = C.x - r; x < C.x + C.size + r; x++) { s += A[y * W + Math.min(W - 1, x + r)] - A[y * W + Math.max(0, x - r - 1)]; tmp[y * W + x] = s / (2 * r + 1); } }
    for (let x = C.x; x < C.x + C.size; x++) { let s = 0; for (let y = -r; y <= lim + r; y++) { s += tmp[Math.min(lim + r, y + r) * W + x] - (y - r - 1 >= 0 ? tmp[(y - r - 1) * W + x] : 0); if (y >= 0) o[y * W + x] = s / (2 * r + 1); } } return o; };
  const Ub = blur(blur(U, S.smooth), S.smooth);
  for (let i = 0; i < N; i++) { const y = rowOf(i); if (y > lim || z.head[i] || z.eyesClear[i]) continue; if (Ub[i] >= 0.5) { if (y >= earTop - 6) behind[i] = 1; else front[i] = 1; } }

  // paint: flat grey + a 3 px ink outline on the union; BEHIND is not lined against the head (the ear draws its own line)
  const union = new Uint8Array(N); for (let i = 0; i < N; i++) if (front[i] || behind[i]) union[i] = 1;
  const paint = (m, fill) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) if (m[i]) o.set([fill, fill, fill, 255], i * 4);
    const inside = (k) => k >= 0 && k < N && (union[k] || (m === behind && z.head[k]));
    for (let i = 0; i < N; i++) if (m[i]) { const x = colOf(i); let edge = false; for (let dy = -3; dy <= 3 && !edge; dy++) for (let dx = -3; dx <= 3; dx++) { if (dx * dx + dy * dy > 9) continue; const k = i + dy * W + dx; if (Math.abs(((k % W) + W) % W - x) > 3 || !inside(k)) { edge = true; break; } } if (edge) o.set([S.fill.line, S.fill.line, S.fill.line, 255], i * 4); }
    return o; };
  return { front, behind, FRONT: paint(front, S.fill.front), BEHIND: paint(behind, S.fill.behind) };
}

function main() {
  const args = process.argv.slice(2), at = args.indexOf("--out"), OUT = at >= 0 ? args[at + 1] : null;
  const rel = OUT ? relative(ROOT, resolve(OUT)) : ""; if (!OUT || !(rel.startsWith("..") || isAbsolute(rel))) throw new Error("--out <empty dir outside the repository>");
  if (existsSync(OUT) && readdirSync(OUT).length) throw new Error("output directory not empty");
  mkdirSync(OUT, { recursive: true });
  const s = buildKortSilhouette(T.buildTemplate());
  writeFileSync(join(OUT, FRONT_NAME), encodePng(W, H, s.FRONT)); writeFileSync(join(OUT, BEHIND_NAME), encodePng(W, H, s.BEHIND));
  console.log(JSON.stringify({ front: pixelSha256(s.FRONT), behind: pixelSha256(s.BEHIND) }));
}
if (typeof process.argv[1] === "string" && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
