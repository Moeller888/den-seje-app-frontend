// D-318 — THE SHOE CUT KIT: the shared method for a shoe cut, with every cut-specific number in a CONTRACT (one JSON per cut under
// tools/avatar/fixtures/northstar-wardrobe/shoe-cuts/). Offline; no image call; publishes nothing. The locked method files (D-299's pins:
// northstar-shoe-source.mjs, -eval-v2.mjs, -master.mjs) are NOT changed: this module re-expresses their geometry as functions of the
// contract, and proves it by reproducing the approved SV1-V5 sneaker layers byte for byte from the sneaker contract.
//   contract  — id, label, reference item; source geometry (crop, K, the split between the two shoes, layout-reference sha256); the
//               material FIELDS and their fixed seeds (avatar px) and which master group slot each uses; the opening (collar or shaft:
//               its zone, how far material may rise over the leg inside it, the envelope around the reference); the foot covering;
//               placement (registration window); the bottoms to judge with and the review regions.
//   geometry  — layoutCanvas, downscale, place, tileOf, untile, seedsAtK, specAtK, register — the K route of northstar-shoe-source.mjs
//               with the contract's numbers.
//   design    — a design is one colour per FIELD; it is mapped to the master's group slots (unused slots take the first field's colour).
//   opening   — the opening check (openingCheck): instead of the distance to one reference collar line it CLASSIFIES what the shoe does
//               at the leg: normal overlap (material over the leg within the envelope, or rising inside the opening zone up to riseMaxPx)
//               — material beyond the envelope over the BACKGROUND (a toe a few px longer) is the shape check's, reported, not failed here —
//               and skin seen in the opening (connected to the leg, above the zone's floor) are fine; material over the wrong area
//               (beyond the envelope), skin seen below the opening's floor or not connected to the leg (foot through the shoe), and a hole
//               in the material (background enclosed by the shoe) fail.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as WR from "./northstar-wardrobe.mjs";
import * as BC from "./northstar-base-figure-c.mjs";
import * as R1 from "./northstar-r1-garment.mjs";
import * as SM from "./northstar-shoe-master.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", ".."), { W, N } = WR, H = N / W;
export const CUTS_DIR = "tools/avatar/fixtures/northstar-wardrobe/shoe-cuts";
const REQUIRED = ["id", "label", "referenceItem", "source", "fields", "opening", "covering", "placement", "evaluation"];

/** A cut contract, validated and frozen. */
export function loadCut(id) { return checkCut(JSON.parse(readFileSync(join(ROOT, CUTS_DIR, id + ".json"), "utf8"))); }
export function checkCut(c) {
  const p = []; for (const k of REQUIRED) if (c[k] === undefined) p.push("missing " + k);
  if (!p.length) { const s = c.source, cr = s.crop;
    if (![cr.x0, cr.y0, cr.w, cr.h, s.K].every(Number.isInteger) || cr.x0 < 0 || cr.y0 < 0 || cr.x0 + cr.w > W || cr.y0 + cr.h > H) p.push("source.crop is not an integer box inside the canvas");
    if (!(s.splitX > cr.x0 && s.splitX < cr.x0 + cr.w)) p.push("source.splitX is not inside the crop");
    const slots = Object.values(c.fields).map((f) => f.slot); if (new Set(slots).size !== slots.length || slots.some((g) => !SM.GROUPS.includes(g))) p.push("each field needs its own master group slot");
    for (const [n, f] of Object.entries(c.fields)) for (const [x, y] of f.seeds) if (x < cr.x0 || x >= cr.x0 + cr.w || y < cr.y0 || y >= cr.y0 + cr.h) p.push("field " + n + ": seed " + x + "," + y + " outside the crop");
    const o = c.opening; if (!["collar", "shaft"].includes(o.type) || !(o.zone.y0 < o.zone.y1) || !(o.riseMaxPx >= 0) || !(o.envelopePx >= 0)) p.push("opening: type collar|shaft, zone y0 < y1, riseMaxPx and envelopePx >= 0");
    if (c.covering.rule !== "closed-footwear" || c.covering.sliverPx !== BC.SLIVER_PX) p.push("covering: only closed-footwear with BC.SLIVER_PX (" + BC.SLIVER_PX + ") is implemented"); }
  if (p.length) throw new Error("cut " + (c.id || "?") + ": " + p.join("; "));
  return Object.freeze(c);
}

// ── geometry (the K route of northstar-shoe-source.mjs, from the contract) ──
export function geometry(cut) { const { crop, K, splitX } = cut.source, out = { w: crop.w * K, h: crop.h * K };
  return { crop, K, splitX, out, sides: { left: { x0: 0, w: (splitX - crop.x0) * K }, right: { x0: (splitX - crop.x0) * K, w: (crop.x0 + crop.w - splitX) * K } } }; }
export function layoutCanvas(layer, cut) { const { crop, K, out } = geometry(cut), o = new Uint8ClampedArray(out.w * out.h * 4), at = (x, y) => (Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))) * 4;
  for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) { const sx = crop.x0 + (x + 0.5) / K - 0.5, sy = crop.y0 + (y + 0.5) / K - 0.5, x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0; let a = 0; const c = [0, 0, 0];
    for (const [xx, yy, wt] of [[x0, y0, (1 - fx) * (1 - fy)], [x0 + 1, y0, fx * (1 - fy)], [x0, y0 + 1, (1 - fx) * fy], [x0 + 1, y0 + 1, fx * fy]]) { const q = at(xx, yy), al = layer[q + 3] * wt; a += al; for (let k = 0; k < 3; k++) c[k] += layer[q + k] * al; }
    const q = (y * out.w + x) * 4; if (a > 0) for (let k = 0; k < 3; k++) o[q + k] = Math.round(c[k] / a); o[q + 3] = Math.round(a); }
  return { w: out.w, h: out.h, px: o }; }
export function downscale(img, cut) { const k = cut.source.K, w = img.w / k, h = img.h / k, o = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let a = 0; const c = [0, 0, 0];
    for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) { const p = ((y * k + j) * img.w + x * k + i) * 4, al = img.px[p + 3]; a += al; for (let q = 0; q < 3; q++) c[q] += img.px[p + q] * al; }
    const q = (y * w + x) * 4; if (a > 0) for (let t = 0; t < 3; t++) o[q + t] = Math.round(c[t] / a); o[q + 3] = Math.round(a / (k * k)); }
  return { w, h, px: o }; }
export function place(small, cut, dx = 0, dy = 0) { const { crop } = cut.source, o = new Uint8ClampedArray(N * 4);
  for (let y = 0; y < small.h; y++) for (let x = 0; x < small.w; x++) { const ax = crop.x0 + x + dx, ay = crop.y0 + y + dy; if (ax < 0 || ax >= W || ay < 0 || ay >= H) continue; o.set(small.px.subarray((y * small.w + x) * 4, (y * small.w + x) * 4 + 4), (ay * W + ax) * 4); }
  return o; }
export function tileOf(img, cut, side) { const s = geometry(cut).sides[side], o = new Uint8ClampedArray(N * 4); for (let y = 0; y < img.h; y++) o.set(img.px.subarray((y * img.w + s.x0) * 4, (y * img.w + s.x0 + s.w) * 4), y * W * 4); return o; }
export function untile(tiles, cut) { const g = geometry(cut), o = new Uint8ClampedArray(g.out.w * g.out.h * 4); for (const [side, t] of Object.entries(tiles)) { const s = g.sides[side]; for (let y = 0; y < g.out.h; y++) o.set(t.subarray(y * W * 4, (y * W + s.w) * 4), (y * g.out.w + s.x0) * 4); } return { w: g.out.w, h: g.out.h, px: o }; }
/** The contract's seeds as master seeds (group slot → points) at 1x, or in one side's working canvas at K. */
export function seedsAt1(cut, dx = 0, dy = 0) { const s = Object.fromEntries(SM.GROUPS.map((g) => [g, []])); for (const f of Object.values(cut.fields)) s[f.slot] = f.seeds.map(([x, y]) => [x + dx, y + dy]); return s; }
export function seedsAtK(cut, side) { const g = geometry(cut), s = g.sides[side], left = side === "left", K = g.K;
  return Object.fromEntries(Object.entries(seedsAt1(cut)).map(([k, pts]) => [k, pts.filter(([x]) => (x < g.splitX) === left).map(([x, y]) => [K * (x - g.crop.x0) - s.x0 + (K >> 1), K * (y - g.crop.y0) + (K >> 1)])])); }
export function specAtK(spec, cut, side) { const K = cut.source.K; return Object.freeze({ ...spec, inkRadius: spec.inkRadius * K, ...(spec.volumeRadius ? { volumeRadius: spec.volumeRadius * K } : {}), ...(spec.edge ? { edge: Object.freeze({ ...spec.edge, blendRadius: spec.edge.blendRadius * K }) } : {}), seeds: seedsAtK(cut, side) }); }
export function register(cand, ref, cut) { const { crop } = cut.source, m = cut.placement.maxShiftPx + 2; let best = { dx: 0, dy: 0, iou: -1 };
  for (let dy = -m; dy <= m; dy++) for (let dx = -m; dx <= m; dx++) { let inter = 0, uni = 0;
    for (let y = crop.y0; y < crop.y0 + crop.h; y++) for (let x = crop.x0; x < crop.x0 + crop.w; x++) { const i = y * W + x, sx = x - dx, sy = y - dy, c = sx >= 0 && sx < W && sy >= 0 && sy < H && cand[(sy * W + sx) * 4 + 3] >= 128, r = ref[i * 4 + 3] >= 128; if (c && r) inter++; if (c || r) uni++; }
    const iou = uni ? inter / uni : 0; if (iou > best.iou) best = { dx, dy, iou }; }
  return best; }
export const templateOf = (L, cut) => R1.templateFromLayers({ shoes: L }, { category: "shoes", covering: cut.covering.rule, cut: cut.id });

// ── design ──
/** A design for the cut ({ field: [r, g, b] }) as a master design over the group slots. */
export function designFor(cut, colours) { const fields = Object.keys(cut.fields), d = {};
  for (const f of fields) { if (!Array.isArray(colours[f])) throw new Error("the design has no colour for the field " + f); d[cut.fields[f].slot] = colours[f]; }
  for (const g of SM.GROUPS) if (!d[g]) d[g] = colours[fields[0]]; return d; }
/** The original colours per field (the master's own originalDesign, read back per field). */
export function originalColours(cut, master, src) { const o = SM.originalDesign(master, src); return Object.fromEntries(Object.entries(cut.fields).map(([n, f]) => [n, o[f.slot]])); }

// ── the routes ──
/** The K route for several designs from ONE master per side: { name: avatar layer }. build(src, template, spec) is the master builder. */
export function renderAtK(img, cut, spec, build, designs, shift = { dx: 0, dy: 0 }) {
  const per = {}; for (const side of ["left", "right"]) { const t0 = tileOf(img, cut, side), sp = specAtK(spec, cut, side);
    if (!Object.values(sp.seeds).some((p) => p.length)) { for (const n of Object.keys(designs)) (per[n] = per[n] || {})[side] = t0; continue; }   // no shoe on this side: carried through (as SS.renderAtK)
    const m = build(t0, templateOf(t0, cut), sp);
    for (const [n, d] of Object.entries(designs)) (per[n] = per[n] || {})[side] = SM.renderShoe(m, t0, typeof d === "function" ? d(m, t0) : d); }
  return Object.fromEntries(Object.keys(designs).map((n) => [n, place(downscale(untile(per[n], cut), cut), cut, shift.dx, shift.dy)])); }
/** The 1x route (an avatar-resolution source, e.g. a published layer): one master, several designs. */
export function renderAt1(layer, cut, spec, build, designs) { const m = build(layer, templateOf(layer, cut), { ...spec, seeds: seedsAt1(cut) });
  return { master: m, layers: Object.fromEntries(Object.entries(designs).map(([n, d]) => [n, SM.renderShoe(m, layer, typeof d === "function" ? d(m, layer) : d)])) }; }
/** The foot covering of the contract (what the closed shoe hides of C). */
export function covering(base, layer, cut) { if (cut.covering.rule !== "closed-footwear") throw new Error("not implemented: " + cut.covering.rule); return BC.closedFootwearHidden(base, layer); }

// ── the opening check ──
const op = (P, i) => P[i * 4 + 3] >= 128;
function outsideDistance(ref) { const d = new Int16Array(N).fill(9999), q = []; for (let i = 0; i < N; i++) if (op(ref, i)) { d[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) { const i = q[h], x = i % W; if (d[i] >= 16) continue; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const j = i + dy * W + dx; if ((!dx && !dy) || j < 0 || j >= N || Math.abs((j % W) - x) > 1 || d[j] <= d[i] + 1) continue; d[j] = d[i] + 1; q.push(j); } } return d; }
/** cand: the placed shoe layer; ref: the cut's reference layer (geometry only); base: { body, arms } RGBA (C, or a constructed stand-in).
 *  Classes per pixel: wrong (material beyond the envelope), throughFoot (C's foot seen below the opening's floor, or not connected to the
 *  leg), hole (background enclosed by the shoe); reported but fine: overlap (material over the leg inside the envelope), openingSkin. */
export function openingCheck(cand, ref, base, cut) {
  const o = cut.opening, Z = o.zone, d = outsideDistance(ref), body = (i) => base.body[i * 4 + 3] > 0 || base.arms[i * 4 + 3] > 0, hidden = BC.closedFootwearHidden(base, cand), m = { wrongPx: 0, wrongBandPx: 0, overlapPx: 0, beyondOverBackgroundPx: 0, openingSkinPx: 0, throughFootPx: 0, holePx: 0 };
  let x0 = W, x1 = 0, y1 = 0; for (let i = 0; i < N; i++) if (op(ref, i) || op(cand, i)) { const x = i % W, y = (i / W) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  // material over C's leg or foot: within envelopePx of the reference, or rising inside the opening zone up to riseMaxPx above it
  for (let i = 0; i < N; i++) { if (!op(cand, i)) continue; const y = (i / W) | 0, allowed = d[i] <= o.envelopePx || (y >= Z.y0 - o.riseMaxPx && y < Z.y1 && d[i] <= o.riseMaxPx);
    if (!body(i)) { if (!allowed) m.beyondOverBackgroundPx++; continue; }
    if (!allowed) { m.wrongPx++; m.wrongBandPx = Math.max(m.wrongBandPx, Math.min(d[i], 16)); } else if (d[i] > 0) m.overlapPx++; }
  // skin seen: C's body where the candidate is not opaque and the covering does not hide it, inside the reference's envelope
  const vis = (i) => body(i) && !op(cand, i) && !hidden[i], inShoe = (i) => d[i] <= o.envelopePx, seen = new Uint8Array(N), q = [];
  for (let x = x0; x <= x1; x++) { const i = (Z.y0 - 1) * W + x; if (vis(i)) { seen[i] = 1; q.push(i); } }   // the leg entering the opening
  for (let h = 0; h < q.length; h++) { const i = q[h], x = i % W; for (const j of [i - 1, i + 1, i - W, i + W]) { if (j < Z.y0 * W || j >= N || Math.abs((j % W) - x) > 1 || seen[j] || !vis(j)) continue; seen[j] = 1; q.push(j); } }
  for (let y = Z.y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * W + x; if (!vis(i) || !inShoe(i)) continue; if (seen[i] && y < Z.y1) m.openingSkinPx++; else if (d[i] === 0) m.throughFootPx++; }
  // holes: transparent pixels enclosed by the candidate (not connected to the canvas border through non-opaque pixels)
  const out = new Uint8Array(N), st = []; for (let x = 0; x < W; x++) for (const y of [0, H - 1]) { const i = y * W + x; if (!op(cand, i)) { out[i] = 1; st.push(i); } } for (let y = 0; y < H; y++) for (const x of [0, W - 1]) { const i = y * W + x; if (!op(cand, i) && !out[i]) { out[i] = 1; st.push(i); } }
  while (st.length) { const i = st.pop(), x = i % W; for (const j of [i - 1, i + 1, i - W, i + W]) { if (j < 0 || j >= N || Math.abs((j % W) - x) > 1 || out[j] || op(cand, j)) continue; out[j] = 1; st.push(j); } }
  for (let i = 0; i < N; i++) if (!op(cand, i) && !out[i]) m.holePx++;
  const p = []; if (m.wrongPx) p.push(m.wrongPx + " px of material over the wrong area (up to " + m.wrongBandPx + " px beyond the envelope)"); if (m.throughFootPx) p.push(m.throughFootPx + " px of C's foot seen through the shoe"); if (m.holePx) p.push(m.holePx + " px of hole in the material");
  return { ok: !p.length, problems: p, measures: m };
}
