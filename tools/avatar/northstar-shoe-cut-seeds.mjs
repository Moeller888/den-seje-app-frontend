// D-325 — ROBUST FIELD LABELLING FOR A SHOE CUT: the seed of each material field is FOUND per image inside a fixed search zone of the
// cut contract (contract v3), instead of being one exact hand-entered point (D-324: the ankle boot's sole seed sat in a 2 px welt band of
// the old drawing and on a line of the new one). Offline; changes no locked file (D-319's pins: the kit, the cut evaluation, contract v2
// and the masters stay as they are); developed WITH knowledge of AB-1, so it is not independently validated.
//   rule (SEED_RULE "zone-v1", fixed per cut, never per image or colour):
//     1. the drawing's ink is the master's own rule (a pixel darker than inkRatio x the brightest within inkRadius, or alpha < 128);
//     2. each non-ink connected component is a candidate field; a pixel of it is SAFE when its distance to the nearest ink or empty pixel
//        (4-neighbour steps) is at least safeDistPx — a thin band (a welt) has no safe pixel and is never a seed;
//     3. per field, side and ZONE (a field may have several zones, e.g. the sole band and the heel block), the candidates are the
//        components with safe pixels inside the zone; one with at least minSafePx
//        safe pixels there is chosen only if no other reaches ambiguityRatio x its count (else AMBIGUOUS); none is MISSING;
//     4. one component may not be chosen for two DIFFERENT fields (a merged field, e.g. a rim band without its seam, is REJECTED); two zones
//        of the same field finding the same component is one closed field (no second seed);
//     5. the seed is the chosen component's deepest safe pixel in the zone (largest distance; ties: smallest y, then x);
//   every choice is logged: field, side, zone, every candidate (pixels, safe pixels, depth), the chosen one, its point and the reason.
import * as WR from "./northstar-wardrobe.mjs";
import * as SM from "./northstar-shoe-master.mjs";
import * as KIT from "./northstar-shoe-cut-kit.mjs";

const { W, N } = WR, H = N / W;
export const SEED_RULE_ID = "zone-v1";
const lum = (P, i) => 0.299 * P[i * 4] + 0.587 * P[i * 4 + 1] + 0.114 * P[i * 4 + 2];

/** The master's ink rule (northstar-shoe-master.mjs buildShoeMaster, the same numbers): 1 = ink or a partial edge pixel. */
export function inkMap(P, inkRatio = SM.SPEC.inkRatio, r = SM.SPEC.inkRadius) {
  const A = (i) => P[i * 4 + 3], ink = new Uint8Array(N), L = new Float32Array(N); for (let i = 0; i < N; i++) if (A(i)) L[i] = lum(P, i);
  for (let i = 0; i < N; i++) { if (!A(i)) continue; if (A(i) < 128) { ink[i] = 1; continue; } const x = i % W, y = (i / W) | 0; let mx = 0;
    for (let dy = -r; dy <= r; dy++) { const yy = y + dy; if (yy < 0 || yy >= H) continue; for (let dx = -r; dx <= r; dx++) { const xx = x + dx; if (xx < 0 || xx >= W) continue; const j = yy * W + xx; if (A(j) >= 128 && L[j] > mx) mx = L[j]; } }
    if (mx > 0 && L[i] / mx < inkRatio) ink[i] = 1; }
  return ink;
}
/** Resolve the contract's fields to seeds on one avatar-resolution layer: { ok, seeds (avatar px per field), log, problems, comp }.
 *  The fields are DECIDED here, at the contract's own resolution (the zones are avatar px; scale is kept for tests of the rule only). */
export function resolveSeeds(P, cut, { scale = 1, side: only = null, x0: tx0 = 0, ink = inkMap(P, SM.SPEC.inkRatio, SM.SPEC.inkRadius * scale) } = {}) {
  const rule = cut.seedRule; if (!rule || rule.id !== SEED_RULE_ID) throw new Error("cut " + cut.id + " has no " + SEED_RULE_ID + " seed rule");
  const free = (i) => P[i * 4 + 3] && !ink[i], comp = new Int32Array(N).fill(-1), size = []; let n = 0;
  for (let s = 0; s < N; s++) { if (!free(s) || comp[s] >= 0) continue; const q = [s]; comp[s] = n; let c = 0; while (q.length) { const i = q.pop(), x = i % W; c++; for (const j of [i - 1, i + 1, i - W, i + W]) { if (j < 0 || j >= N || Math.abs((j % W) - x) > 1 || comp[j] >= 0 || !free(j)) continue; comp[j] = n; q.push(j); } } size.push(c); n++; }
  // depth: 4-neighbour distance to the nearest non-free pixel (ink or empty)
  const depth = new Int16Array(N).fill(-1), q = []; for (let i = 0; i < N; i++) if (!free(i)) { depth[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) { const i = q[h], x = i % W; for (const j of [i - 1, i + 1, i - W, i + W]) { if (j < 0 || j >= N || Math.abs((j % W) - x) > 1 || depth[j] >= 0) continue; depth[j] = depth[i] + 1; q.push(j); } }
  const seeds = {}, log = [], problems = [], taken = new Map();
  for (const [name, f] of Object.entries(cut.fields)) { seeds[name] = [];
    for (const side of only ? [only] : ["left", "right"]) { const zs = f.zones && f.zones[side]; if (!zs) { problems.push(name + " (" + side + "): no zone in the contract"); continue; }
      for (const z0 of Array.isArray(zs[0]) ? zs : [zs]) { const c0 = cut.source.crop, z = scale === 1 ? z0 : [scale * (z0[0] - c0.x0) - tx0, scale * (z0[1] - c0.y0), scale * (z0[2] - c0.x0) - tx0, scale * (z0[3] - c0.y0)], safeD = rule.safeDistPx * scale, minSafe = f.minSafePx * scale * scale;
      const cand = new Map(); for (let y = z[1]; y < z[3]; y++) for (let x = z[0]; x < z[2]; x++) { const i = y * W + x; if (!free(i) || depth[i] < safeD) continue; const c = comp[i]; const e = cand.get(c) || { component: c, pixels: size[c], safePx: 0, depth: 0, at: null };
        e.safePx++; if (depth[i] > e.depth) { e.depth = depth[i]; e.at = [x, y]; } cand.set(c, e); }
      const list = [...cand.values()].sort((a, b) => b.safePx - a.safePx || a.component - b.component), top = list[0], second = list[1], entry = { field: name, side, zone: z, scale, candidates: list.map((e) => ({ ...e })) };
      if (!top || top.safePx < minSafe) { entry.chosen = null; entry.reason = "MISSING: no field with at least " + minSafe + " safe px (≥ " + safeD + " px from any line) in the zone" + (top ? " (best " + top.safePx + ")" : ""); problems.push(name + " (" + side + "): " + entry.reason); }
      else if (second && second.safePx >= rule.ambiguityRatio * top.safePx) { entry.chosen = null; entry.reason = "AMBIGUOUS: two fields in the zone (" + top.safePx + " and " + second.safePx + " safe px; the rule needs the second below " + rule.ambiguityRatio + " x the first)"; problems.push(name + " (" + side + "): " + entry.reason); }
      else if (taken.has(top.component) && taken.get(top.component) === name + " (" + side + ")") { entry.chosen = top.component; entry.point = null; entry.reason = "the field already holds this component through another of its zones (one closed field)"; }
      else if (taken.has(top.component)) { entry.chosen = null; entry.reason = "MERGED: the field chosen here is already " + taken.get(top.component) + "'s (no line separates them)"; problems.push(name + " (" + side + "): " + entry.reason); }
      else { taken.set(top.component, name + " (" + side + ")"); entry.chosen = top.component; entry.point = top.at; entry.reason = "the only field with ≥ " + minSafe + " safe px in the zone" + (second ? " (next: " + second.safePx + " safe px, below " + rule.ambiguityRatio + " x)" : "") + "; its deepest safe pixel (" + top.depth + " px from any line)"; seeds[name].push(top.at); }
      log.push(entry); } } }
  return { ok: !problems.length, seeds, log, problems, rule: SEED_RULE_ID, comp };
}
/** The seeds on a side's working canvas at K, FOLLOWING the fields decided at 1x (resolveSeeds on the placed layer, r1): at K the painted
 *  drawing has inner lines the 1x layer does not resolve (AB-1's rim band splits into sub-bands), so the K canvas does not decide fields
 *  again. Every non-ink K component with safe pixels (distance >= safeDistPx, NOT scaled: the ink radius x K already widens the lines) in
 *  a field's scaled zone is a candidate; it belongs to the field only if at least insideRatio of its safe pixels map (x/K, y/K, the
 *  registration shift) into the component(s) that field chose at 1x on this side. Every belonging candidate with at least minSafePx safe
 *  pixels is seeded (the sub-bands of one field), the field's belonging safe pixels must reach minSafePx x K x K, and one K component may
 *  not belong to two fields (MERGED). Anything else is logged and refused; nothing is chosen by nearness. */
export const K_RULE = Object.freeze({ id: "zone-v1-k-follows-1x", insideRatio: 0.9 });
export function resolveSeedsAtK(T, cut, r1, { side, x0: tx0, shift = { dx: 0, dy: 0 } }) {
  const rule = cut.seedRule, K = cut.source.K, c0 = cut.source.crop, ink = inkMap(T, SM.SPEC.inkRatio, SM.SPEC.inkRadius * K), free = (i) => T[i * 4 + 3] && !ink[i];
  if (!r1 || !r1.ok || !r1.comp) throw new Error("the fields at 1x are not resolved");
  const comp = new Int32Array(N).fill(-1), size = []; let n = 0;
  for (let s = 0; s < N; s++) { if (!free(s) || comp[s] >= 0) continue; const q = [s]; comp[s] = n; let c = 0; while (q.length) { const i = q.pop(), x = i % W; c++; for (const j of [i - 1, i + 1, i - W, i + W]) { if (j < 0 || j >= N || Math.abs((j % W) - x) > 1 || comp[j] >= 0 || !free(j)) continue; comp[j] = n; q.push(j); } } size.push(c); n++; }
  const depth = new Int16Array(N).fill(-1), q = []; for (let i = 0; i < N; i++) if (!free(i)) { depth[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) { const i = q[h], x = i % W; for (const j of [i - 1, i + 1, i - W, i + W]) { if (j < 0 || j >= N || Math.abs((j % W) - x) > 1 || depth[j] >= 0) continue; depth[j] = depth[i] + 1; q.push(j); } }
  const at1 = (x, y) => { const X = Math.floor(c0.x0 + (x + tx0) / K + shift.dx), Y = Math.floor(c0.y0 + y / K + shift.dy); return X < 0 || X >= W || Y < 0 || Y >= H ? -1 : r1.comp[Y * W + X]; };
  const seeds = {}, log = [], problems = [], owner = new Map();
  for (const [name, f] of Object.entries(cut.fields)) { seeds[name] = [];
    const mine = new Set(r1.log.filter((e) => e.field === name && e.side === side && e.chosen !== null).map((e) => e.chosen)), cand = new Map();
    for (const z0 of Array.isArray(f.zones[side][0]) ? f.zones[side] : [f.zones[side]]) { const z = [K * (z0[0] - c0.x0) - tx0, K * (z0[1] - c0.y0), K * (z0[2] - c0.x0) - tx0, K * (z0[3] - c0.y0)];
      for (let y = Math.max(0, z[1]); y < Math.min(H, z[3]); y++) for (let x = Math.max(0, z[0]); x < Math.min(W, z[2]); x++) { const i = y * W + x; if (!free(i) || depth[i] < rule.safeDistPx) continue;
        const c = comp[i], e = cand.get(c) || { component: c, pixels: size[c], safePx: 0, inside: 0, depth: 0, at: null }; e.safePx++; if (mine.has(at1(x, y))) e.inside++; if (depth[i] > e.depth) { e.depth = depth[i]; e.at = [x, y]; } cand.set(c, e); } }
    const list = [...cand.values()].sort((a, b) => b.safePx - a.safePx || a.component - b.component), entry = { field: name, side, scale: K, rule: K_RULE.id, fieldsAt1: [...mine], candidates: list.map((e) => ({ ...e, insideShare: +(e.inside / e.safePx).toFixed(3) })) };
    const belong = list.filter((e) => e.inside / e.safePx >= K_RULE.insideRatio), total = belong.reduce((t, e) => t + e.safePx, 0), chosen = belong.filter((e) => e.safePx >= f.minSafePx), minTotal = f.minSafePx * K * K;
    if (!mine.size) { entry.reason = "MISSING: the field has no component at 1x"; problems.push(name + " (" + side + "): " + entry.reason); }
    else if (!chosen.length || total < minTotal) { entry.reason = "MISSING: " + total + " safe px at K inside the 1x field (needs " + minTotal + ", each seeded part " + f.minSafePx + ")"; problems.push(name + " (" + side + "): " + entry.reason); }
    else { const clash = chosen.find((e) => owner.has(e.component)); if (clash) { entry.reason = "MERGED: a K component of this field is already " + owner.get(clash.component) + "'s"; problems.push(name + " (" + side + "): " + entry.reason); }
      else { for (const e of chosen) { owner.set(e.component, name); seeds[name].push(e.at); } entry.chosen = chosen.map((e) => e.component); entry.points = chosen.map((e) => e.at);
        entry.reason = chosen.length + " K part(s) of the 1x field (" + total + " safe px inside it, needs " + minTotal + "); each seeded at its deepest safe pixel; " + (list.length - belong.length) + " candidate(s) of other 1x fields left out"; } }
    log.push(entry); }
  return { ok: !problems.length, seeds, log, problems, rule: K_RULE.id };
}
/** The contract with the resolved seeds filled in (for the kit's routes); refuses an unresolved contract. */
export function cutWithSeeds(cut, resolved) { if (!resolved.ok) throw new Error("the fields are not resolved: " + resolved.problems.join("; "));
  return KIT.checkCut({ ...cut, fields: Object.fromEntries(Object.entries(cut.fields).map(([n, f]) => [n, { ...f, seeds: resolved.seeds[n] }])) }); }
/** The K route with the seeds FOUND (the kit's renderAtK takes the contract's fixed seeds): the fields decided at 1x on the placed layer,
 *  then followed on each side's working canvas at K (resolveSeedsAtK); the designs and the seed log per side. build(src, template, spec)
 *  is the master builder. */
export function renderAtKFound(img, cut, spec, build, designs, shift = { dx: 0, dy: 0 }) {
  const per = {}, logs = {}, g = KIT.geometry(cut), r1 = resolveSeeds(KIT.place(KIT.downscale(img, cut), cut, shift.dx, shift.dy), cut);
  if (!r1.ok) throw new Error("the fields at 1x are not resolved: " + r1.problems.join("; "));
  for (const side of ["left", "right"]) { const t0 = KIT.tileOf(img, cut, side), r = resolveSeedsAtK(t0, cut, r1, { side, x0: g.sides[side].x0, shift }); logs[side] = r; if (!r.ok) throw new Error("the fields at K (" + side + ") are not resolved: " + r.problems.join("; "));
    const sp = { ...KIT.specAtK(spec, cut, side), seeds: Object.fromEntries(SM.GROUPS.map((gr) => [gr, Object.values(cut.fields).filter((f) => f.slot === gr).flatMap(() => [])])) };
    for (const [n, f] of Object.entries(cut.fields)) sp.seeds[f.slot] = r.seeds[n]; const m = build(t0, KIT.templateOf(t0, cut), sp);
    for (const [n, d] of Object.entries(designs)) (per[n] = per[n] || {})[side] = SM.renderShoe(m, t0, typeof d === "function" ? d(m, t0) : d); }
  return { layers: Object.fromEntries(Object.keys(designs).map((n) => [n, KIT.place(KIT.downscale(KIT.untile(per[n], cut), cut), cut, shift.dx, shift.dy)])), logs };
}
