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
export const GROUPS = Object.freeze(["upper", "toe", "sole", "laces", "tongue"]);
const lum = (P, i) => 0.299 * P[i * 4] + 0.587 * P[i * 4 + 1] + 0.114 * P[i * 4 + 2];
export const toLin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
export const toSrgb = (l) => { const v = l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(v * 255))); };

/** The master for the cut. src: the shoe layer (RGBA, the item's own pixels); t: R1's template of it (alpha, core, contour). */
export function buildShoeMaster(src, t, spec = SPEC) {
  const P = src, A = (i) => P[i * 4 + 3];
  // the ink: a thin-line detector against the local brightest pixel; partial pixels are edge, not field
  const L = new Float32Array(N); for (let i = 0; i < N; i++) if (A(i)) L[i] = lum(P, i);
  const ink = new Uint8Array(N), r = spec.inkRadius;
  for (let i = 0; i < N; i++) { if (!A(i)) continue; if (A(i) < 128) { ink[i] = 1; continue; } const x = i % W, y = (i / W) | 0; let mx = 0;
    for (let dy = -r; dy <= r; dy++) { const yy = y + dy; if (yy < 0 || yy >= H) continue; for (let dx = -r; dx <= r; dx++) { const xx = x + dx; if (xx < 0 || xx >= W) continue; const j = yy * W + xx; if (A(j) >= 128 && L[j] > mx) mx = L[j]; } }
    if (mx > 0 && L[i] / mx < spec.inkRatio) ink[i] = 1; }
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
  const count = (k) => { let n = 0; for (let i = 0; i < N; i++) if (group[i] === k) n++; return n; };
  return { revision: REVISION, spec, ink, group, field, base, shade, light, contour, fringe: Int32Array.from(fringe), unassigned, fields: nComp, seededFields: seeded.size,
    sizes: Object.fromEntries(GROUPS.map((g, k) => [g, count(k)])), inkPx: ink.reduce((s, v) => s + v, 0), contourPx: contour.reduce((s, v) => s + v, 0) };
}

/** A design's shoe layer: { upper, toe, sole, laces, tongue } (sRGB triples; tongue defaults to upper). The alpha is the source's. */
export function renderShoe(master, src, design) {
  const d = { ...design, tongue: design.tongue || design.upper }; for (const g of GROUPS) if (!Array.isArray(d[g])) throw new Error("the design has no " + g);
  const M = GROUPS.map((g) => d[g].map(toLin)), out = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < N; i++) { const a = src[i * 4 + 3]; if (!a) continue; const k = master.group[i]; out[i * 4 + 3] = a; if (k < 0) { out.set(src.subarray(i * 4, i * 4 + 3), i * 4); continue; }
    for (let c = 0; c < 3; c++) { const v = toSrgb(Math.min(1, M[k][c] * master.shade[i] + master.light[i]));
      out[i * 4 + c] = master.contour[i] ? Math.min(src[i * 4 + c], v) : v; } }
  const f = master.fringe; for (let k = 0; k < f.length; k += 2) { const i = f[k], j = f[k + 1]; out[i * 4] = out[j * 4]; out[i * 4 + 1] = out[j * 4 + 1]; out[i * 4 + 2] = out[j * 4 + 2]; }
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
