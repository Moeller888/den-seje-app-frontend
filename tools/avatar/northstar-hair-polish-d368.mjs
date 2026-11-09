// D-368 (round 2) — the repairs for the private Northstar hairstyle trial, all from existing pixels (no image call):
//   browResidue       — the left brow's thin spikes and specks (left over from Northstar's hair) leave the shared brow layer;
//   foreheadSpots     — light spots in the forehead skin are filled from the surrounding skin (harmonic fill) in the shared skin layer;
//                       for both, the Northstar reference keeps its pixels through two small patches drawn in their own places only for
//                       Northstar's own hairstyle (headStack), so it composes exactly as before while every new hairstyle gets the fix;
//   outlineHair       — an ink edge for a hair layer without one ("Kort"): the layer's own boundary band darkened toward ink.
//   earOpening        — the afro opened at each ear, so the whole ear shows inside the curls instead of loose lobes peeking out; the
//                       curls along the opening shaded darker.
//   flapByReference   — (D-371) the flap in front of each ear that Northstar's own hair covers: head skin next to the ear under its hair,
//                       and the face's contour line through it (the "double line" when a hairstyle leaves it bare). Used as a zone of
//                       the hair template that every new hairstyle must cover; nothing is drawn from it.
import * as NL from "./r3-northstar-layers.mjs";

const W = 1024, H = 1536, N = W * H;
const lum = (P, i) => 0.299 * P[i * 4] + 0.587 * P[i * 4 + 1] + 0.114 * P[i * 4 + 2];
const morph = (src, r, op) => { const o = new Uint8Array(N); for (let y = r; y < H - r; y++) for (let x = r; x < W - r; x++) { let v = op === "erode" ? 1 : 0;
  outer: for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (dx * dx + dy * dy > r * r) continue; const s = src[(y + dy) * W + x + dx]; if (op === "erode" && !s) { v = 0; break outer; } if (op === "dilate" && s) { v = 1; break outer; } }
  o[y * W + x] = v; } return o; };
const components = (m) => { const seen = new Uint8Array(N), out = []; for (let i = 0; i < N; i++) if (m[i] && !seen[i]) { const px = [], st = [i]; seen[i] = 1;
  while (st.length) { const j = st.pop(); px.push(j); const x = j % W; for (const k of [j - 1, j + 1, j - W, j + W]) if (k >= 0 && k < N && m[k] && !seen[k] && Math.abs((k % W) - x) <= 1) { seen[k] = 1; st.push(k); } } out.push(px); } return out; };
/** over(top, bottom) for one pixel, straight alpha, in floats; rounded. */
function over(t, b) { const at = t[3] / 255, ab = b[3] / 255, a = at + ab * (1 - at); if (a <= 0) return [0, 0, 0, 0];
  return [0, 1, 2].map((c) => Math.round((t[c] * at + b[c] * ab * (1 - at)) / a)).concat(Math.round(a * 255)); }

/** The left brow's residue (what an opening of radius r removes, and pieces under `speck` px): removed from the shared brow layer and
 *  kept as the reference's brow patch (drawn in the brow's own place, only for Northstar's own hairstyle). */
export function browResidue(L, { r = 2, speck = 30 } = {}) {
  const B = L.browL, m = new Uint8Array(N); for (let i = 0; i < N; i++) if (B[i * 4 + 3] >= 64) m[i] = 1;
  const keep = morph(morph(morph(m, r, "erode"), r, "dilate"), 1, "dilate"), res = new Uint8Array(N);
  for (const c of components(m)) if (c.length < speck) for (const j of c) keep[j] = 0;
  for (let i = 0; i < N; i++) if (B[i * 4 + 3] > 0 && !keep[i]) res[i] = 1;
  const browL = new Uint8ClampedArray(B), patch = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < N; i++) if (res[i]) { patch.set(B.subarray(i * 4, i * 4 + 4), i * 4); browL[i * 4] = browL[i * 4 + 1] = browL[i * 4 + 2] = browL[i * 4 + 3] = 0; }
  return { layers: { ...L, browL }, patch, mask: res };
}

/** Light spots in the forehead skin (lighter than the local mean by `t`): filled from the surrounding skin in the shared skin layer;
 *  the reference keeps the head as it was there through a skin patch (the old cranium+skin, opaque), drawn right above the skin. */
export function foreheadSpots(L, bald, { box = { x0: 360, x1: 670, y0: 110, y1: 262 }, r = 8, t = 4, grow = 2 } = {}) {
  const Lm = new Float32Array(N); for (let i = 0; i < N; i++) Lm[i] = lum(bald, i);
  const region = new Uint8Array(N);
  for (let y = box.y0 - r; y < box.y1 + r; y++) for (let x = box.x0 - r; x < box.x1 + r; x++) { const i = y * W + x; if (bald[i * 4 + 3] === 255 && !L.browL[i * 4 + 3] && !L.browR[i * 4 + 3] && Lm[i] > 150) region[i] = 1; }
  const spot = new Uint8Array(N);
  for (let y = box.y0; y < box.y1; y++) for (let x = box.x0; x < box.x1; x++) { const i = y * W + x; if (!region[i]) continue; let sum = 0, n = 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const k = i + dy * W + dx; if (region[k]) { sum += Lm[k]; n++; } }
    if (n > 100 && Lm[i] - sum / n > t) spot[i] = 1; }
  const grown = morph(spot, grow, "dilate"), unk = new Uint8Array(N), known = new Uint8Array(N);
  for (let i = 0; i < N; i++) { if (grown[i] && region[i]) unk[i] = 1; else if (region[i]) known[i] = 1; }
  const f = NL.harmonicFill(bald, unk, known), skin = new Uint8ClampedArray(L.skin), patch = new Uint8ClampedArray(N * 4); let n = 0;
  for (let i = 0; i < N; i++) if (unk[i]) { patch.set(bald.subarray(i * 4, i * 4 + 4), i * 4); for (let c = 0; c < 3; c++) skin[i * 4 + c] = Math.round(f[i * 3 + c]); skin[i * 4 + 3] = 255; n++; }
  return { layers: { ...L, skin }, patch, mask: unk, px: n };
}

/** The head stack in compositing order, with the reference's patches in their own places (skin patch above the skin, brow patch above
 *  the left brow) — only Northstar's own hairstyle uses them. `include` names the layers (as HD.COMPOSITE_ORDER). */
export function headStack(L, include, patches = null) {
  const out = [];
  for (const k of ["cranium", "skin", "hairShadow", "browL", "browR", "nose", "mouth", "iris", "eyesFixed", "hair"]) {
    if (!include.includes(k) || !L[k]) continue; out.push(L[k]);
    if (patches && k === "skin" && patches.skin) out.push(patches.skin);
    if (patches && k === "browL" && patches.browL) out.push(patches.browL);
  }
  return NL.overStack(out);
}

/** An ink edge on a hair layer: the soft edge hardened, then the boundary band (`width` px) darkened toward `ink` (grey). */
export function outlineHair(P, { width = 3, ink = 18, soft = [40, 190] } = {}) {
  const o = new Uint8ClampedArray(P), inside = new Uint8Array(N);
  for (let i = 0; i < N; i++) { const a = P[i * 4 + 3]; if (!a) continue; o[i * 4 + 3] = Math.max(0, Math.min(255, Math.round((a - soft[0]) * 255 / (soft[1] - soft[0])))); if (o[i * 4 + 3] >= 128) inside[i] = 1; }
  // distance (in px, 4-neighbour rings) from the outside, up to width
  const d = new Uint8Array(N); let ring = []; for (let i = 0; i < N; i++) if (inside[i]) { const x = i % W; if ((x > 0 && !inside[i - 1]) || (x < W - 1 && !inside[i + 1]) || !inside[i - W] || !inside[i + W]) { d[i] = 1; ring.push(i); } }
  for (let k = 2; k <= width; k++) { const next = []; for (const i of ring) for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < N && inside[j] && !d[j]) { d[j] = k; next.push(j); } ring = next; }
  for (let i = 0; i < N; i++) { if (o[i * 4 + 3] && !inside[i]) { for (let c = 0; c < 3; c++) o[i * 4 + c] = ink; continue; } if (!d[i]) continue;
    const t = d[i] === width ? 0.5 : 1; for (let c = 0; c < 3; c++) o[i * 4 + c] = Math.round(o[i * 4 + c] * (1 - t) + ink * t); }
  return o;
}

/** The ears on the bald head: the protrusions of the head's silhouette that an opening with a square of side 2R+1 removes, inside the
 *  ear band [y0, y1] and outside the middle of the face; the two largest pieces. Separable running min/max, so it stays fast. */
export function earMask(bald, { y0 = 250, y1 = 460, R = 36, faceHalf = 120, reach = 30 } = {}) {
  const top = Math.max(0, y0 - R - 2), bot = Math.min(H, y1 + R + 2), h = bot - top, sil = new Uint8Array(W * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < W; x++) if (bald[((top + y) * W + x) * 4 + 3] >= 128) sil[y * W + x] = 1;
  const run = (src, horiz, op) => { const o = new Uint8Array(W * h); const len = horiz ? W : h, lines = horiz ? h : W;
    for (let l = 0; l < lines; l++) for (let k = 0; k < len; k++) { let v = op === "min" ? 1 : 0;
      for (let d = -R; d <= R; d++) { const q = k + d; const s = q < 0 || q >= len ? 0 : src[horiz ? l * W + q : q * W + l]; if (op === "min" ? !s : s) { v = op === "min" ? 0 : 1; break; } }
      o[horiz ? l * W + k : k * W + l] = v; } return o; };
  const opened = run(run(run(run(sil, true, "min"), false, "min"), true, "max"), false, "max");
  let cx = 0, n = 0; for (let i = 0; i < W * h; i++) if (sil[i]) { cx += i % W; n++; } cx = n ? cx / n : W / 2;
  const m = new Uint8Array(N);
  for (let y = Math.max(y0, top); y < Math.min(y1, bot); y++) for (let x = 0; x < W; x++) { const k = (y - top) * W + x; if (sil[k] && !opened[k] && Math.abs(x - cx) > faceHalf) m[y * W + x] = 1; }
  const parts = components(m).sort((a, b) => b.length - a.length), o = new Uint8Array(N);
  for (const c of parts.slice(0, 2)) for (const j of c) o[j] = 1;
  // row by row, the ear goes on inward up to and including the cheek's dark outline (at most `reach` px), so the opening follows the
  // drawn ear instead of the opening's straight edge
  const dark = (i) => bald[i * 4 + 3] >= 200 && lum(bald, i) < 90;
  for (let y = y0; y < y1; y++) for (const dir of [1, -1]) {
    let x = dir === 1 ? 0 : W - 1, last = -1; for (; x >= 0 && x < W && Math.abs(x - cx) > faceHalf; x += dir) if (o[y * W + x]) last = x;
    if (last < 0) continue; let k = last + dir, steps = 0, seenDark = false;
    while (k >= 0 && k < W && steps < reach && bald[(y * W + k) * 4 + 3] >= 128) { const i = y * W + k; if (dark(i)) seenDark = true; else if (seenDark) break; o[i] = 1; k += dir; steps++; }
  }
  return o;
}

/** The afro opened at the ears (mask grown by `grow`), with an antialiased cut and the curls along it shaded toward `shade`. */
export function earOpening(afro, ears, { grow = 2, rim = 5, shade = 0.55, bald = null, bridge = 14 } = {}) {
  const cut = morph(ears, grow, "dilate"), o = new Uint8ClampedArray(afro), near = new Float32Array(N).fill(99);
  // the curl strands left lying over the head right next to the ear (between the ear's top and the cheek) go too
  if (bald) { const zone = morph(ears, bridge, "dilate"); for (let i = 0; i < N; i++) if (zone[i] && bald[i * 4 + 3] >= 128 && afro[i * 4 + 3]) cut[i] = 1; }
  let ring = []; for (let i = 0; i < N; i++) if (cut[i]) { o[i * 4 + 3] = 0; near[i] = 0; ring.push(i); }
  for (let k = 1; k <= rim; k++) { const next = []; for (const i of ring) for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < N && near[j] > k) { near[j] = k; next.push(j); } ring = next; }
  for (let i = 0; i < N; i++) { if (!o[i * 4 + 3] || near[i] > rim || near[i] === 0) continue; const k = near[i], f = shade + (1 - shade) * (k - 1) / rim;
    for (let c = 0; c < 3; c++) o[i * 4 + c] = Math.round(o[i * 4 + c] * f); if (k === 1) o[i * 4 + 3] = Math.round(o[i * 4 + 3] * 0.6); }
  return { px: o, cut };
}

/** The flap in front of each ear (D-371): opaque head pixels next to the ear (within `near` px in the row, from `above` px over the ear's
 *  top down to its bottom) that Northstar's hair covers (alpha ≥ 128), plus the face's dark contour line that continues from there under
 *  Northstar's hair (alpha > 0) in the same rows and reach — never the ear itself. */
export function flapByReference(bald, ears, nsHair, { near = 40, above = 40, lineLum = 135 } = {}) {
  let ey0 = H, ey1 = 0; for (let i = 0; i < N; i++) if (ears[i]) { const y = (i / W) | 0; ey0 = Math.min(ey0, y); ey1 = Math.max(ey1, y); }
  const y0 = Math.max(0, ey0 - above), m = new Uint8Array(N);
  const nearEar = (x, y) => { for (let dx = -near; dx <= near; dx += 2) { const X = x + dx; if (X >= 0 && X < W && ears[y * W + X]) return true; } return false; };
  for (let y = y0; y <= ey1; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (ears[i] || bald[i * 4 + 3] < 128 || nsHair[i * 4 + 3] < 128) continue; if (nearEar(x, y)) m[i] = 1; }
  const darkAt = (i) => bald[i * 4 + 3] >= 128 && lum(bald, i) < lineLum && nsHair[i * 4 + 3] > 0 && !ears[i], st = []; for (let i = 0; i < N; i++) if (m[i]) st.push(i);
  while (st.length) { const i = st.pop(), x = i % W, y = (i / W) | 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X < 0 || X >= W || Y < y0 || Y > ey1) continue; const k = Y * W + X; if (m[k] || !darkAt(k) || !nearEar(X, Y)) continue; m[k] = 1; st.push(k); } }
  return m;
}
