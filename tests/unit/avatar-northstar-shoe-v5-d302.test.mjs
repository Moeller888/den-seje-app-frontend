// D-302 — shoe master v5 (development prototype) on SYNTHETIC inputs (C is private, D-127 §2): v1–v4 are untouched (v4's file stays
// pinned by D-299, see the D-300 test); a closed field without a seed that v4 splits between two materials is ONE material in v5, and
// v5 renders exactly as v4 where every closed field already has a seed. Passing these tests approves no shoe, says nothing of SV-1
// (D-301's REJECTED SOURCE stands) and is no independent validation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as WR from "../../tools/avatar/northstar-wardrobe.mjs";
import * as SM from "../../tools/avatar/northstar-shoe-master.mjs";
import * as SS from "../../tools/avatar/northstar-shoe-source.mjs";
import * as R1 from "../../tools/avatar/northstar-r1-garment.mjs";
import * as V5 from "../../tools/avatar/northstar-shoe-master-v5.mjs";

const { W, N } = WR, sha = (b) => createHash("sha256").update(b).digest("hex");
const tpl = (L) => R1.templateFromLayers({ shoes: L }, { category: "shoes", covering: "closed-footwear", cut: "synthetic" });
const s1 = SS.place(SS.synthShoe(1)), seeds1 = SS.cropSeedsAt1(SS.SYNTH_SEEDS), NAVY = SM.designs()["contrast navy + white (SYNTHETIC)"];
// the synthetic shoe with a second sole line 6 px under the drawn one: a closed band without a seed between two lines (as SV-1's)
const LINE_Y = SS.CROP.y0 + SS.SYNTH.cy + 41, banded = Uint8ClampedArray.from(s1);
for (let x = 0; x < W; x++) for (const y of [LINE_Y, LINE_Y + 1]) { const i = (y * W + x) * 4; if (banded[i + 3] >= 128) banded.set([120, 98, 78], i); }
const build = (L, sp, b = sp === V5.SPEC_V5 ? V5.buildShoeMasterV5 : SM.buildShoeMaster) => b(L, tpl(L), { ...sp, seeds: seeds1 });

test("D-302 v5 is a separate revision; v4's spec is unchanged", () => {
  assert.equal(V5.SPEC_V5.revision, "shoe-master-v5-field"); assert.equal(V5.SPEC_V5.unseededField, "whole-majority");
  assert.equal(SM.SPEC_V4.revision, "shoe-master-v4-line"); assert.equal(SM.SPEC_V4.unseededField, undefined);
  for (const k of Object.keys(SM.SPEC_V4)) assert.deepEqual(V5.SPEC_V5[k], k === "revision" ? V5.SPEC_V5.revision : SM.SPEC_V4[k]);
  assert.throws(() => V5.buildShoeMasterV5(s1, tpl(s1), { ...SM.SPEC_V4, seeds: seeds1 }), /not a v5 spec/);
});

test("D-302 v5 renders exactly as v4 when every closed field has a hand seed", () => {
  // the plain synthetic shoe has ONE closed field without a seed (under the sole line, inside the toe-cap curve), split by v4 as well
  const f = V5.unseededFields(build(s1, SM.SPEC_V4), s1); assert.equal(f.length, 1); assert.ok(f[0].split);
  const all = { ...seeds1, [f[0].group]: [...seeds1[f[0].group], f[0].at] }, m4 = SM.buildShoeMaster(s1, tpl(s1), { ...SM.SPEC_V4, seeds: all }), m5 = V5.buildShoeMasterV5(s1, tpl(s1), { ...V5.SPEC_V5, seeds: all });
  assert.equal(V5.unseededFields(m4, s1).length, 0); assert.equal(m5.derivedFields, 0);
  for (const d of [NAVY, SM.designs()["dark charcoal (SYNTHETIC)"]]) assert.equal(sha(SM.renderShoe(m5, s1, d)), sha(SM.renderShoe(m4, s1, d)));
});

test("D-302 a closed band without a seed: v4 splits it between materials, v5 gives it one material as a whole", () => {
  const m4 = build(banded, SM.SPEC_V4), f = V5.unseededFields(m4, banded), band = f.filter((x) => x.split).sort((a, b) => b.pixels - a.pixels)[0];
  assert.ok(band && band.pixels > 100, "the band is one unseeded closed field that v4 splits: " + JSON.stringify(f.filter((x) => x.split).map((x) => x.tally)));
  const m5 = build(banded, V5.SPEC_V5), px = [], [bx, by] = band.at, seen = new Set([by * W + bx]), q = [by * W + bx];
  for (let h = 0; h < q.length; h++) { const i = q[h], x = i % W; px.push(i); for (const j of [i - 1, i + 1, i - W, i + W]) if (!seen.has(j) && Math.abs((j % W) - x) <= 1 && banded[j * 4 + 3] && !m4.ink[j] && !m4.field[j]) { seen.add(j); q.push(j); } }
  assert.equal(px.length, band.pixels);
  const g4 = new Set(px.map((i) => m4.group[i])), g5 = new Set(px.map((i) => m5.group[i]));
  assert.ok(g4.size > 1, "v4 splits the band"); assert.equal(g5.size, 1, "v5: one group"); assert.equal(SM.GROUPS[[...g5][0]], band.group, "the majority group");
  assert.ok(px.every((i) => m5.field[i]), "the band is a field of its group in v5");
  // in the navy + white render the band carries ONE material: no pixel of it in the other material's hue
  const r4 = SM.renderShoe(m4, banded, NAVY), r5 = SM.renderShoe(m5, banded, NAVY), blue = (R, i) => SM.oklab([R[i * 4], R[i * 4 + 1], R[i * 4 + 2]])[2] < -0.03;
  const n4 = px.filter((i) => blue(r4, i)).length, n5 = px.filter((i) => blue(r5, i)).length;
  assert.ok(n4 > 0 && n4 < px.length, "v4: the band is partly in the upper's hue (" + n4 + " of " + px.length + ")");
  assert.ok(n5 === 0 || n5 === px.length, "v5: all or nothing (" + n5 + " of " + px.length + ")");
  // ink, contour and alpha are v4's
  for (let i = 0; i < N; i++) { assert.equal(m5.ink[i], m4.ink[i]); assert.equal(m5.contour[i], m4.contour[i]); assert.equal(r5[i * 4 + 3], r4[i * 4 + 3]); }
});

test("D-302 v5 is deterministic", () => { const a = build(banded, V5.SPEC_V5), b = build(banded, V5.SPEC_V5); assert.equal(sha(SM.renderShoe(a, banded, NAVY)), sha(SM.renderShoe(b, banded, NAVY))); assert.equal(a.derivedFields, b.derivedFields); });
