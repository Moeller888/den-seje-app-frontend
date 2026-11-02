// D-289 PROTOTYPE — A MASTER FOR ONE CLOSED SHOE CUT (offline; no image call; not the production method). The low sneaker cut of
// shoes-sneakers-beige. The tee and pants masters map a FABRIC pattern over panels; a shoe is built from a few painted MATERIAL FIELDS
// separated by the drawing's own ink lines, so this master does not reuse their material model (no pattern mapping, no fold warp):
//   fields      — the drawing's thin ink lines (a pixel clearly darker than the brightest pixel within inkRadius) split the shoe into
//                 closed fields; each field is labelled once per cut by a hand-entered SEED point (upper, toe cap, sole, tongue, laces —
//                 the same seeds for every design, never per design); a field without a seed, a partial edge pixel and every ink pixel
//                 join the nearest labelled field (geodesic, through the shoe's own pixels);
//   ink         — the outer contour (R1's: the cut's own ink at the silhouette edge) and the inner construction ink (seams, the toe cap
//                 line, the sole line, the lace outlines);
//   shading     — the painted volume per field, in LINEAR light against the field's base (its median): darker than the base is
//                 multiplied (shadows, ink), lighter than the base is ADDED as light (a highlight keeps its strength on a dark material
//                 instead of being scaled away by a multiply);
//   contour     — the drawn outer ink is kept as drawn, but never lighter than the material's own ink (a dark shoe gets a darker
//                 outline); the partial pixels just outside it take the nearest contour pixel's final colour (D-279's outer-edge rule);
//   alpha       — never changed: silhouette, placement and the closed-footwear covering (closedFootwearHidden reads the alpha only)
//                 stay the cut's.
// A design is one colour per field group: { upper, toe, sole, laces, tongue }. Approximations (documented in D-289): the source has
// ONE light material, so the split of its shading into diffuse and highlight is taken at the field's median; the original's slight hue
// variation inside a field is not carried over (only its luminance); the lace outlines and seams are darkened in each field's material,
// so on a very dark material they become faint.
import * as WR from "./northstar-wardrobe.mjs";

const { W, N } = WR, H = N / W;
export const REVISION = "shoe-master-v1";
/** The one-time per-cut data (entered by hand once from the cut's own drawing; never per design). */
export const SPEC = Object.freeze({
  cut: "sneaker-low", source: "shoes-sneakers-beige",
  inkRatio: 0.8, inkRadius: 4,               // a pixel below 0.8 x the brightest within 4 px is a drawn line
  seeds: Object.freeze({                     // [x, y] inside each field, left shoe then right shoe
    sole: [[404, 1465], [618, 1465]],
    toe: [[387, 1445], [634, 1445]],
    upper: [[439, 1410], [377, 1404], [583, 1410], [645, 1405]],
    tongue: [[416, 1365], [605, 1365], [408, 1384], [402, 1400], [613, 1384], [620, 1401]],
    laces: [[413, 1377], [407, 1392], [400, 1410], [396, 1421], [609, 1377], [614, 1393], [621, 1410], [626, 1421]],
  }),
});
/** D-291: the successor (v1 above and its render stay as D-289 recorded them). ONE general rule for the shading across the materials'
 *  lightness, in OKLab lightness L instead of linear light — the source's painting is carried as a lightness DIFFERENCE d from the
 *  field's base, split into its VOLUME (d smoothed over volumeRadius px inside the field) and its GRAIN (the rest):
 *    fitted base — a material too light to hold the field's highlights is toned down just enough (L_e = min(L_m, 1 − the field's
 *                  highlight reach, its p95 of d > 0)), so a light sole keeps its facet instead of clipping;
 *    volume      — the light side scaled by g_up = clamp(√((1 − L_e) / (1 − L_b)), 1, maxGain), the dark side by
 *                  g_down = min(1, √(L_e / L_b)): a dark material has more room above its base and less below, so its painted
 *                  volume is carried there, never pushed past black or white;
 *    grain       — scaled by g_down, never enlarged: a dark field no longer grows the source's paint grain (v1's added linear light did);
 *    lines       — the inner construction ink (seams, the toe cap and sole lines, lace outlines) is at least lineMin darker than the
 *                  field's material, so it stays visible on a dark material;
 *    colour      — the material's own hue; its chroma scaled with the lightness in shadows and toward white in highlights.
 *  The outer contour, its fringe and the alpha are as in v1. */
export const SPEC_V2 = Object.freeze({ ...SPEC, revision: "shoe-master-v2", model: "oklab", lineMin: 0.08, volumeRadius: 6, maxGain: 3 });
/** D-293 PROTOTYPE: v2 plus three EDGE rules, the same for every design (v1 and v2 stay as recorded). v1/v2 decide three things per
 *  pixel with a hard yes/no where the source itself is antialiased, which makes edges step:
 *    inkness     — a line is not a yes/no: w = clamp((inkSoft[0] − r) / (inkSoft[0] − inkSoft[1]), 0, 1) from the pixel's ratio r to the
 *                  brightest pixel within inkRadius, so a line's antialiased flank is darkened in proportion (v2: only r < inkRatio, by
 *                  lineMin, its flank not at all);
 *    group blend — a pixel INSIDE a drawn line (weighted by its inkness) takes a mix of its own group's and the nearest other group's
 *                  material's HUE by its distances to their fields (within blendRadius), and the darker of the two line lightnesses, so
 *                  the colour changes inside the line and smoothly, instead of flipping between two materials pixel by pixel where the
 *                  breadth-first labelling met (a field's own flank is not blended: no light halo beside a dark line);
 *    outline     — the "never lighter than drawn" cap of the outer contour is applied with a weight (1 on the contour, 0.5 on its
 *                  8-neighbours), so the outline does not switch rule from one pixel to the next.
 *  No blur: each pixel keeps its own source lightness; only the decisions that were binary are made continuous. The alpha is unchanged. */
export const SPEC_V3 = Object.freeze({ ...SPEC_V2, revision: "shoe-master-v3-edge", edge: Object.freeze({ inkSoft: [0.95, 0.6], blendRadius: 5 }) });
/** D-297 PROTOTYPE: v3's edge rules with ONE change at a border between two materials. v3 gave a line's core the DARKER material's line
 *  lightness on both sides (no split, but a white lace on navy got a navy-dark outline: heavier). A plain mix across the line (tried
 *  first) lightened the seams on the dark side. v4: each side of the line keeps ITS OWN material's line (lightness and hue), and the
 *  border between the two sides follows the line's geometric middle — the pixel takes the material of the NEARER field (t > 0.5: the
 *  other one), with a narrow smooth step (t from 0.35 to 0.65) — instead of the order in which the breadth-first labelling reached it,
 *  which made the colour flip ALONG the line. v1–v3 stay as recorded. */
export const SPEC_V4 = Object.freeze({ ...SPEC_V3, revision: "shoe-master-v4-line", lineBlend: "nearer", lineStep: Object.freeze([0.35, 0.65]) });
export const GROUPS = Object.freeze(["upper", "toe", "sole", "laces", "tongue"]);
/** sRGB ↔ OKLab (D-291). */
export function oklab(rgb) { const [r, g, b] = rgb.map((v) => toLin(v)), l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), q = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * q, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * q, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * q]; }
export function fromOklab([L, a, b]) { const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, q = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * q, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * q, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * q].map(toSrgb); }
const lum = (P, i) => 0.299 * P[i * 4] + 0.587 * P[i * 4 + 1] + 0.114 * P[i * 4 + 2];
export const toLin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
export const toSrgb = (l) => { const v = l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(v * 255))); };

/** The master for the cut. src: the shoe layer (RGBA, the item's own pixels); t: R1's template of it (alpha, core, contour). */
export function buildShoeMaster(src, t, spec = SPEC) {
  const P = src, A = (i) => P[i * 4 + 3];
  // the ink: a thin-line detector against the local brightest pixel; partial pixels are edge, not field
  const L = new Float32Array(N); for (let i = 0; i < N; i++) if (A(i)) L[i] = lum(P, i);
  const ink = new Uint8Array(N), r = spec.inkRadius, ratio = spec.edge ? new Float32Array(N).fill(1) : null;
  for (let i = 0; i < N; i++) { if (!A(i)) continue; if (A(i) < 128) { ink[i] = 1; continue; } const x = i % W, y = (i / W) | 0; let mx = 0;
    for (let dy = -r; dy <= r; dy++) { const yy = y + dy; if (yy < 0 || yy >= H) continue; for (let dx = -r; dx <= r; dx++) { const xx = x + dx; if (xx < 0 || xx >= W) continue; const j = yy * W + xx; if (A(j) >= 128 && L[j] > mx) mx = L[j]; } }
    if (mx > 0 && L[i] / mx < spec.inkRatio) ink[i] = 1; if (ratio && mx > 0) ratio[i] = L[i] / mx; }
  // the fields: connected non-ink pixels; a seed labels the field it lies in
  const comp = new Int32Array(N).fill(-1); let nComp = 0;
  for (let s = 0; s < N; s++) { if (!A(s) || ink[s] || comp[s] >= 0) continue; const id = nComp++, q = [s]; comp[s] = id;
    while (q.length) { const i = q.pop(), x = i % W; for (const j of [i - 1, i + 1, i - W, i + W]) { if (j < 0 || j >= N || Math.abs((j % W) - x) > 1 || !A(j) || ink[j] || comp[j] >= 0) continue; comp[j] = id; q.push(j); } } }
  const group = new Int8Array(N).fill(-1), seeded = new Map(), problems = [];
  for (const [g, pts] of Object.entries(spec.seeds)) for (const [x, y] of pts) { const c = comp[y * W + x]; if (c < 0) { problems.push(g + " seed " + x + "," + y + " is not in a field"); continue; }
    if (seeded.has(c) && seeded.get(c) !== g) problems.push("one field has two groups: " + seeded.get(c) + ", " + g); seeded.set(c, g); }
  if (problems.length) throw new Error(problems.join("; "));
  const gi = Object.fromEntries(GROUPS.map((g, k) => [g, k])), field = new Uint8Array(N), q = [];
  for (let i = 0; i < N; i++) if (comp[i] >= 0 && seeded.has(comp[i])) { group[i] = gi[seeded.get(comp[i])]; field[i] = 1; q.push(i); }
  // everything else joins the nearest labelled field through the shoe's own pixels (breadth first, in a fixed order)
  for (let h = 0; h < q.length; h++) { const i = q[h], x = i % W; for (const j of [i - 1, i + 1, i - W, i + W]) { if (j < 0 || j >= N || Math.abs((j % W) - x) > 1 || !A(j) || group[j] >= 0) continue; group[j] = group[i]; q.push(j); } }
  // a pixel the shoe's own pixels do not connect (an isolated speck) joins the nearest labelled pixel (straight distance)
  let unassigned = 0; for (let i = 0; i < N; i++) { if (!A(i) || group[i] >= 0) continue; unassigned++; const x = i % W, y = (i / W) | 0;
    for (let rr = 1; rr <= 16 && group[i] < 0; rr++) for (let dy = -rr; dy <= rr && group[i] < 0; dy++) for (let dx = -rr; dx <= rr; dx++) { const j = (y + dy) * W + x + dx; if (j >= 0 && j < N && field[j]) { group[i] = group[j]; break; } } }
  // each group's base (the median luminance of its seeded field pixels) and the shading in linear light against it
  const base = GROUPS.map((_, k) => { const v = []; for (let i = 0; i < N; i++) if (field[i] && group[i] === k) v.push(L[i]); v.sort((a, b) => a - b); return v.length ? v[v.length >> 1] : 1; });
  const shade = new Float32Array(N), light = new Float32Array(N);
  for (let i = 0; i < N; i++) { if (!A(i) || group[i] < 0) continue; const pl = toLin(L[i]), bl = toLin(base[group[i]]); if (pl <= bl) shade[i] = pl / bl; else { shade[i] = 1; light[i] = pl - bl; } }
  const contour = new Uint8Array(N); for (let i = 0; i < N; i++) if (t.contour[i * 4 + 3] > 0) contour[i] = 1;
  // the partial pixels just outside the contour (an empty neighbour, within 2 px of a solid contour pixel): their nearest contour pixel
  const fringe = []; for (let i = 0; i < N; i++) { if (!A(i) || A(i) >= 255 || contour[i]) continue; const x = i % W, y = (i / W) | 0; let ext = false;
    for (let dy = -1; dy <= 1 && !ext; dy++) for (let dx = -1; dx <= 1; dx++) { const j = (y + dy) * W + x + dx; if (j < 0 || j >= N || !A(j)) { ext = true; break; } } if (!ext) continue;
    let best = -1, bd = 9; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const j = (y + dy) * W + x + dx, d = Math.max(Math.abs(dx), Math.abs(dy)); if (j >= 0 && j < N && contour[j] && A(j) >= 128 && d < bd) { bd = d; best = j; } }
    if (best >= 0) fringe.push(i, best); }
  // D-291 (v2 only): every pixel's OKLab lightness, each group's base lightness and highlight reach
  let v2 = null; if (spec.model === "oklab") { const Ls = new Float32Array(N); for (let i = 0; i < N; i++) if (A(i)) Ls[i] = oklab([P[i * 4], P[i * 4 + 1], P[i * 4 + 2]])[0];
    const baseL = GROUPS.map((_, k) => { const v = []; for (let i = 0; i < N; i++) if (field[i] && group[i] === k) v.push(Ls[i]); v.sort((a, b) => a - b); return v.length ? v[v.length >> 1] : 1; });
    const reach = GROUPS.map((_, k) => { const v = []; for (let i = 0; i < N; i++) if (field[i] && group[i] === k && Ls[i] > baseL[k]) v.push(Ls[i] - baseL[k]); v.sort((a, b) => a - b); return v.length ? v[Math.floor(v.length * 0.95)] : 0; });
    // the volume: d averaged over the field pixels of the same group within volumeRadius (a masked box filter); ink is not averaged in
    const R = spec.volumeRadius, dLow = new Float32Array(N), S = new Float64Array((W + 1) * (H + 1)), C = new Float64Array((W + 1) * (H + 1));
    for (let k = 0; k < GROUPS.length; k++) { S.fill(0); C.fill(0);
      for (let y = 0; y < H; y++) { let rs = 0, rc = 0; for (let x = 0; x < W; x++) { const i = y * W + x; if (field[i] && group[i] === k) { rs += Ls[i] - baseL[k]; rc++; } const q = (y + 1) * (W + 1) + x + 1; S[q] = S[q - W - 1] + rs; C[q] = C[q - W - 1] + rc; } }
      const box = (A, x0, y0, x1, y1) => A[y1 * (W + 1) + x1] - A[y0 * (W + 1) + x1] - A[y1 * (W + 1) + x0] + A[y0 * (W + 1) + x0];
      for (let i = 0; i < N; i++) { if (group[i] !== k || !A(i)) continue; const x = i % W, y = (i / W) | 0, x0 = Math.max(0, x - R), y0 = Math.max(0, y - R), x1 = Math.min(W, x + R + 1), y1 = Math.min(H, y + R + 1), c = box(C, x0, y0, x1, y1); dLow[i] = c ? box(S, x0, y0, x1, y1) / c : 0; } }
    v2 = { Ls, baseL, reach, dLow }; }
  // D-293 (v3 only): the inkness, the nearest other group and the blend weight, the outline weight
  let edge = null; if (spec.edge) { const [s0, s1] = spec.edge.inkSoft, R = spec.edge.blendRadius, w = new Float32Array(N), other = new Int8Array(N).fill(-1), t = new Float32Array(N), wc = new Float32Array(N);
    for (let i = 0; i < N; i++) { if (!A(i)) continue; w[i] = A(i) < 128 ? 1 : Math.max(0, Math.min(1, (s0 - ratio[i]) / (s0 - s1)));
      if (field[i] && !w[i]) continue; const x = i % W, y = (i / W) | 0, best = new Array(GROUPS.length).fill(Infinity);   // a line's field-side flank too (its own field at distance 0: no hue mix)
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const j = (y + dy) * W + x + dx; if (j < 0 || j >= N || !field[j]) continue; const dd = Math.hypot(dx, dy); if (dd < best[group[j]]) best[group[j]] = dd; }
      const g = group[i]; let g2 = -1; for (let k = 0; k < GROUPS.length; k++) if (k !== g && best[k] < Infinity && (g2 < 0 || best[k] < best[g2])) g2 = k;
      if (g2 >= 0) { const d1 = field[i] ? 0 : Math.min(best[g], R + 1), d2 = best[g2]; other[i] = g2; t[i] = d1 / (d1 + d2); } }
    for (let i = 0; i < N; i++) { if (!A(i)) continue; if (contour[i]) { wc[i] = 1; continue; } const x = i % W, y = (i / W) | 0;
      for (let dy = -1; dy <= 1 && !wc[i]; dy++) for (let dx = -1; dx <= 1; dx++) { const j = (y + dy) * W + x + dx; if (j >= 0 && j < N && contour[j]) { wc[i] = 0.5; break; } } }
    edge = { w, other, t, wc }; }
  const count = (k) => { let n = 0; for (let i = 0; i < N; i++) if (group[i] === k) n++; return n; };
  return { revision: spec.revision || REVISION, spec, v2, edge, ink, group, field, base, shade, light, contour, fringe: Int32Array.from(fringe), unassigned, fields: nComp, seededFields: seeded.size,
    sizes: Object.fromEntries(GROUPS.map((g, k) => [g, count(k)])), inkPx: ink.reduce((s, v) => s + v, 0), contourPx: contour.reduce((s, v) => s + v, 0) };
}

/** A design's shoe layer: { upper, toe, sole, laces, tongue } (sRGB triples; tongue defaults to upper). The alpha is the source's. */
export function renderShoe(master, src, design) {
  const d = { ...design, tongue: design.tongue || design.upper }; for (const g of GROUPS) if (!Array.isArray(d[g])) throw new Error("the design has no " + g);
  if (master.edge) return renderShoeV3(master, src, d);
  if (master.v2) return renderShoeV2(master, src, d);
  const M = GROUPS.map((g) => d[g].map(toLin)), out = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < N; i++) { const a = src[i * 4 + 3]; if (!a) continue; const k = master.group[i]; out[i * 4 + 3] = a; if (k < 0) { out.set(src.subarray(i * 4, i * 4 + 3), i * 4); continue; }
    for (let c = 0; c < 3; c++) { const v = toSrgb(Math.min(1, M[k][c] * master.shade[i] + master.light[i]));
      out[i * 4 + c] = master.contour[i] ? Math.min(src[i * 4 + c], v) : v; } }
  const f = master.fringe; for (let k = 0; k < f.length; k += 2) { const i = f[k], j = f[k + 1]; out[i * 4] = out[j * 4]; out[i * 4 + 1] = out[j * 4 + 1]; out[i * 4 + 2] = out[j * 4 + 2]; }
  return out;
}

/** D-291: v2's render (the rule at SPEC_V2). The outer contour and its fringe as v1. */
function renderShoeV2(master, src, d) {
  const { Ls, baseL, reach, dLow } = master.v2, { lineMin, maxGain } = master.spec, out = new Uint8ClampedArray(N * 4);
  const mats = GROUPS.map((g, k) => { const M = oklab(d[g]), Le = Math.min(M[0], 1 - reach[k]); return { M, Le, up: Math.min(maxGain, Math.max(1, Math.sqrt((1 - Le) / Math.max(1e-6, 1 - baseL[k])))), down: Math.min(1, Math.sqrt(Le / baseL[k])) }; }), Mlin = GROUPS.map((g) => d[g].map(toLin));
  for (let i = 0; i < N; i++) { const a = src[i * 4 + 3]; if (!a) continue; const g = master.group[i]; out[i * 4 + 3] = a; if (g < 0) { out.set(src.subarray(i * 4, i * 4 + 3), i * 4); continue; }
    if (master.contour[i]) { for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.min(src[i * 4 + c], toSrgb(Math.min(1, Mlin[g][c] * master.shade[i] + master.light[i]))); continue; }
    const { M, Le, up, down } = mats[g], d0 = Ls[i] - baseL[g], lo = dLow[i]; let dl = (lo > 0 ? lo * up : lo * down) + (d0 - lo) * down;
    if (master.ink[i]) dl = Math.min(d0 > 0 ? d0 : d0 * down, -lineMin);
    const L = Math.max(0.02, Math.min(1, Le + dl)), f = dl > 0 ? Math.max(0, 1 - (L - Le) / Math.max(1e-6, 1 - Le)) : Math.min(1, L / Math.max(1e-6, M[0]));
    out.set(fromOklab([L, M[1] * f, M[2] * f]), i * 4); }
  const f = master.fringe; for (let q = 0; q < f.length; q += 2) { const i = f[q], j = f[q + 1]; out[i * 4] = out[j * 4]; out[i * 4 + 1] = out[j * 4 + 1]; out[i * 4 + 2] = out[j * 4 + 2]; }
  return out;
}

/** D-293: the edge prototype's render (SPEC_V3): v2's rule per material, the three edge rules above. */
function renderShoeV3(master, src, d) {
  const { Ls, baseL, reach, dLow } = master.v2, { w, other, t, wc } = master.edge, { lineMin, maxGain } = master.spec, out = new Uint8ClampedArray(N * 4);
  const mats = GROUPS.map((g, k) => { const M = oklab(d[g]), Le = Math.min(M[0], 1 - reach[k]); return { M, Le, up: Math.min(maxGain, Math.max(1, Math.sqrt((1 - Le) / Math.max(1e-6, 1 - baseL[k])))), down: Math.min(1, Math.sqrt(Le / baseL[k])), b: baseL[k] }; }), Mlin = GROUPS.map((g) => d[g].map(toLin));
  // per material: the field's lightness (v2's volume, and its grain outside the line) and the line core's lightness (the
  // source's line darkness at full inkness, at least lineMin under the material); a pixel is (1 − w) field + w line core
  const fieldDl = (i, m) => { const d0 = Ls[i] - m.b, lo = dLow[i]; return (lo > 0 ? lo * m.up : lo * m.down) + (w[i] ? 0 : (d0 - lo) * m.down); };   // on a line pixel the darkness is the line's (w), not grain
  const coreL = (i, m) => m.Le + Math.min((Ls[i] - m.b) / Math.max(w[i], 0.05) * m.down, -lineMin);
  const chroma = (L, Lref, M, hl) => { const f = hl ? Math.max(0, 1 - (L - Lref) / Math.max(1e-6, 1 - Lref)) : Math.min(1, L / Math.max(1e-6, M)); return f; };
  for (let i = 0; i < N; i++) { const a = src[i * 4 + 3]; if (!a) continue; const g = master.group[i]; out[i * 4 + 3] = a; if (g < 0) { out.set(src.subarray(i * 4, i * 4 + 3), i * 4); continue; }
    const m = mats[g], g2 = other[i], wi = w[i], nearer = master.spec.lineBlend === "nearer", st = nearer && g2 >= 0 ? (() => { const [a0, a1] = master.spec.lineStep, z = Math.max(0, Math.min(1, (t[i] - a0) / (a1 - a0))); return z * z * (3 - 2 * z); })() : 0;
    const tw = g2 >= 0 ? (nearer ? st : t[i]) * wi : 0, dlf = fieldDl(i, m); let lab;
    if (!wi) { const L = Math.max(0.02, Math.min(1, m.Le + dlf)), f = chroma(L, m.Le, m.M[0], dlf > 0); lab = [L, m.M[1] * f, m.M[2] * f]; }   // a field pixel: v2's
    else { const core = g2 < 0 ? coreL(i, m) : nearer ? coreL(i, m) * (1 - st) + coreL(i, mats[g2]) * st : Math.min(coreL(i, m), coreL(i, mats[g2])), L = Math.max(0.02, Math.min(1, (1 - wi) * (m.Le + dlf) + wi * core));
      const Ma = m.M[1] * (1 - tw) + (g2 >= 0 ? mats[g2].M[1] * tw : 0), Mb = m.M[2] * (1 - tw) + (g2 >= 0 ? mats[g2].M[2] * tw : 0), Mref = m.M[0] * (1 - tw) + (g2 >= 0 ? mats[g2].M[0] * tw : 0), f = chroma(L, Mref, Mref, false);
      lab = [L, Ma * f, Mb * f]; }
    let rgb = fromOklab(lab);
    if (wc[i] > 0) { const cap = [0, 1, 2].map((c) => Math.min(src[i * 4 + c], toSrgb(Math.min(1, Mlin[g][c] * master.shade[i] + master.light[i])), rgb[c])); rgb = rgb.map((v, c) => Math.round(v * (1 - wc[i]) + cap[c] * wc[i])); }
    out.set(rgb, i * 4); }
  const f = master.fringe; for (let q = 0; q < f.length; q += 2) { const i = f[q], j = f[q + 1]; out[i * 4] = out[j * 4]; out[i * 4 + 1] = out[j * 4 + 1]; out[i * 4 + 2] = out[j * 4 + 2]; }
  return out;
}

/** The original's own colours per group (each group's median sRGB over its seeded field pixels): the self-reproduction design. */
export function originalDesign(master, src) {
  return Object.fromEntries(GROUPS.map((g, k) => { const c = [[], [], []]; for (let i = 0; i < N; i++) if (master.field[i] && master.group[i] === k) for (let ch = 0; ch < 3; ch++) c[ch].push(src[i * 4 + ch]);
    return [g, c.map((a) => a.sort((x, y) => x - y)[a.length >> 1])]; }));
}

/** The SYNTHETIC designs of the study: a light, a dark and two with contrast between the material fields. */
export function designs() {
  return {
    "light chalk (SYNTHETIC)": { upper: [238, 234, 224], toe: [238, 234, 224], sole: [246, 244, 238], laces: [250, 248, 242] },
    "dark charcoal (SYNTHETIC)": { upper: [54, 56, 62], toe: [54, 56, 62], sole: [44, 44, 48], laces: [72, 74, 82] },
    "contrast navy + white (SYNTHETIC)": { upper: [40, 54, 96], toe: [236, 234, 228], sole: [240, 238, 232], laces: [242, 240, 234] },
    "contrast burgundy + gum (SYNTHETIC)": { upper: [112, 34, 44], toe: [228, 214, 188], sole: [176, 124, 72], laces: [228, 214, 188] },
  };
}
