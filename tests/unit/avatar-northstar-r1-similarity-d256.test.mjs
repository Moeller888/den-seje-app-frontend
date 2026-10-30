// D-256 — the s1 hypothesis (tools/avatar/northstar-r1-similarity.mjs) on the CI stand-in (C and R1-1 are private, D-127 §2): one
// uniform scale and one translation, computed from the shapes alone, recover a known similarity; the resampling keeps the
// garment's own colours; the before-crop measures count what is missing and what lies outside. The study of R1-1 itself is in
// docs/decisions/D-256.md. Nothing here changes r1-v1 or D-255.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as WR from "../../tools/avatar/northstar-wardrobe.mjs";
import * as BC from "../../tools/avatar/northstar-base-figure-c.mjs";
import * as IP from "../../tools/avatar/northstar-item-pilot.mjs";
import * as R1 from "../../tools/avatar/northstar-r1-garment.mjs";
import * as S1 from "../../tools/avatar/northstar-r1-similarity.mjs";
import { recolour } from "../../tools/avatar/northstar-wardrobe-poc.mjs";
import * as NL from "../../tools/avatar/r3-northstar-layers.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const w = WR.buildWardrobe(), L = w.base.layers, A = w.anchors, M = w.fg.master, { W, N } = WR;
const LEGS = (() => { const legs = new Uint8ClampedArray(L.pants); for (let i = 0; i < (A.crotchY + 10) * W; i++) legs[i * 4 + 3] = 0; return NL.overStack([M, recolour(legs, { h: 33, s: 0.51, vScale: 1.3 })]); })();
const base = BC.prepareBase(w, LEGS), T = BC.templatesC(w, base, { revision: "d213" });
const only = (k, P = LEGS) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) if (base.sep.lab[i] === k) o.set(P.subarray(i * 4, i * 4 + 4), i * 4); return o; };
const shorts = IP.processItem(w, base, T, "bottom", NL.overStack([LEGS, recolour(only(2), { h: 120, s: 0.5 })]));
const t = R1.templateFromLayers(shorts.layers, { category: "bottom", cut: "stand-in-shorts" });
const garment = (() => { const g = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) if (t.alpha[i]) g.set([40, 90, 170, t.alpha[i]], i * 4); return g; })();

test("D-256 the rule is one uniform scale and one translation, chosen from the shapes alone", () => {
  assert.equal(S1.REVISION, "s1-hypothesis"); assert.match(S1.RULE.transform, /one uniform scale, one translation; no rotation, shear, warp/); assert.match(S1.RULE.manual, /none/);
  assert.equal(R1.R1_REVISION, "r1-v1", "r1-v1 is unchanged"); assert.equal(IP.METHOD, "d240");
});

test("D-256 a garment enlarged and moved (a product shot) is fitted back: the known similarity is recovered and the fit covers the cut", () => {
  const shot = S1.apply(garment, { s: 1.8, tx: -260, ty: -900 }), f = S1.fit(S1.maskOf(shot), t.core);
  assert.ok(Math.abs(f.s * 1.8 - 1) < 0.01, "the scale within 1 % " + JSON.stringify(f)); assert.ok(f.iou > 0.95);
  // scale and offset are coupled (a 1 % scale error moves a point 500 px away by 5 px): the round trip itself must land on the original
  const back = S1.apply(shot, f), bm = S1.maskOf(back), gm = S1.maskOf(garment); let inter = 0, uni = 0; for (let i = 0; i < N; i++) { if (bm[i] && gm[i]) inter++; if (bm[i] || gm[i]) uni++; }
  assert.ok(inter / uni > 0.97, "the round trip overlaps the original: " + (inter / uni).toFixed(4));
  const bc = S1.beforeCrop(back, t); assert.ok(bc.missingShare < 0.02 && bc.outsideShare < 0.02, JSON.stringify(bc));
});

test("D-256 the resampling keeps the garment's own colours (no new colour) and the before-crop measures count the missing and the outside", () => {
  const f = { s: 0.5, tx: 100, ty: 100 }, o = S1.apply(garment, f); let n = 0;
  for (let i = 0; i < N; i++) if (o[i * 4 + 3] >= 250) { n++; assert.deepEqual([o[i * 4], o[i * 4 + 1], o[i * 4 + 2]], [40, 90, 170]); } assert.ok(n > 1000);
  const bc = S1.beforeCrop(o, t); assert.ok(bc.missingCorePx > 0 && bc.outsidePx > 0, "a misfit is measured, never hidden");
  for (let i = 0; i < N; i++) { if (bc.masks.missing[i]) assert.ok(t.core[i] && o[i * 4 + 3] < 128); if (bc.masks.outside[i]) assert.ok(!t.alpha[i] && o[i * 4 + 3] >= 128); }
});

test("D-256 geometry: size removed, a scaled copy has the same proportions", () => {
  const g1 = S1.normalised(S1.geometry(S1.maskOf(garment))), g2 = S1.normalised(S1.geometry(S1.maskOf(S1.apply(garment, { s: 1.5, tx: -100, ty: -300 }))));
  for (const k of Object.keys(g1)) assert.ok(Math.abs(g1[k] - g2[k]) < 0.03, k + " " + g1[k] + " " + g2[k]);
});

test("D-256 the study refuses to write inside the repository (its sheets show C and a private raw result)", () => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/API_?KEY/i.test(k)));
  const r = spawnSync(process.execPath, [join(REPO, "tools", "avatar", "northstar-r1-similarity-proof.mjs"), "--out", join(REPO, "tools", "avatar", "build", "d256")], { encoding: "utf8", env });
  assert.equal(r.status, 1); assert.match(r.stderr, /REFUSED: --out must be outside the repository/);
});
