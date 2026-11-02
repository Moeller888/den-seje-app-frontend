// D-302 DEVELOPMENT PROTOTYPE — SHOE MASTER v5 (offline; no image call; not validated; not the production method). v4 (D-297, the
// method D-299 locked by sha256 and D-301 validated on SV-1) stays byte-identical in northstar-shoe-master.mjs; v5 lives here so the
// lock and every earlier version stay reproducible.
// The fault (D-301's possible missed alarm, found on SV-1's left and right shoe): a thin line in the UPPER's colour along the sole's top
// edge near the corner where the upper, the toe cap and the sole meet (navy + white, burgundy + gum; v2 and v4 alike). The cause is in
// the FIELD labelling, not the line rule: the drawing has closed fields without a hand-entered seed (here the light band between the
// upper|sole seam and the sole's inner line). v1–v4 hand such a field's pixels, one by one, to whichever seeded field the breadth-first
// labelling reaches first THROUGH the ink, so one closed field is split between two materials; its pixels are not ink (inkness 0), so
// v3/v4 render them as plain field pixels of the group they happened to get — a strip of upper colour on the sole's side of the seam.
// v5's ONE rule, the same for every cut, side and design (no per-colour rule, no retouch): a closed field takes ONE group as a whole —
// its hand-entered seed's, or, without a seed, the group most of its pixels got from the breadth-first labelling (ties: GROUPS order) —
// and is then a seeded field of that group like any other (its base, volume and line borders follow). Implemented as derived seeds
// (one per unseeded field, its first pixel in scan order) on v4's builder; ink, lines, edges and alpha are v4's.
import * as WR from "./northstar-wardrobe.mjs";
import * as SM from "./northstar-shoe-master.mjs";
import * as SS from "./northstar-shoe-source.mjs";

const { W, N } = WR;
export const SPEC_V5 = Object.freeze({ ...SM.SPEC_V4, revision: "shoe-master-v5-field", unseededField: "whole-majority" });

/** The closed fields without a hand-entered seed in v4's labelling: { group, pixels, at: [x, y] } each, in scan order. */
export function unseededFields(m4, src) {
  const seen = new Uint8Array(N), out = [];
  for (let s = 0; s < N; s++) { if (!src[s * 4 + 3] || m4.ink[s] || m4.field[s] || seen[s]) continue; const px = [s], tally = new Array(SM.GROUPS.length).fill(0); seen[s] = 1;
    for (let h = 0; h < px.length; h++) { const i = px[h], x = i % W; if (m4.group[i] >= 0) tally[m4.group[i]]++; for (const j of [i - 1, i + 1, i - W, i + W]) { if (j < 0 || j >= N || Math.abs((j % W) - x) > 1 || !src[j * 4 + 3] || m4.ink[j] || m4.field[j] || seen[j]) continue; seen[j] = 1; px.push(j); } }
    let g = 0; for (let k = 1; k < tally.length; k++) if (tally[k] > tally[g]) g = k;
    out.push({ group: SM.GROUPS[g], pixels: px.length, split: tally.filter((v) => v > 0).length > 1, tally: Object.fromEntries(SM.GROUPS.map((n, k) => [n, tally[k]]).filter(([, v]) => v)), at: [s % W, (s / W) | 0] }); }
  return out;
}

/** v5's master: v4's builder with the hand seeds plus one derived seed per unseeded closed field (its majority group). */
export function buildShoeMasterV5(src, t, spec = SPEC_V5) {
  const { unseededField, ...v4spec } = spec; if (unseededField !== "whole-majority") throw new Error("not a v5 spec");
  const m4 = SM.buildShoeMaster(src, t, { ...v4spec, revision: SM.SPEC_V4.revision }), fields = unseededFields(m4, src), seeds = Object.fromEntries(Object.entries(spec.seeds).map(([g, p]) => [g, p.map((q) => [...q])]));
  for (const f of fields) (seeds[f.group] = seeds[f.group] || []).push(f.at);
  const m = SM.buildShoeMaster(src, t, { ...v4spec, seeds });
  return { ...m, revision: spec.revision, spec, derivedFields: fields.length, splitFieldsInV4: fields.filter((f) => f.split).length, splitPixelsInV4: fields.filter((f) => f.split).reduce((s, f) => s + f.pixels, 0) };
}

/** SS.renderAtK with v5's builder (the same K route: per side at K, then the fixed downscale and placement). */
export function renderAtKV5(img, spec, design, { shift = { dx: 0, dy: 0 }, templateOf } = {}) {
  const tiles = {};
  for (const side of Object.keys(SS.SIDES)) { const t0 = SS.tileOf(img, side), m = buildShoeMasterV5(t0, templateOf(t0), SS.specAtK(spec, side, null)); tiles[side] = design ? SM.renderShoe(m, t0, design) : t0; }
  return SS.place(SS.downscale(SS.untile(tiles)), shift.dx, shift.dy);
}
