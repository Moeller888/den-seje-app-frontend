// D-264 — the tee master's mechanics on the CI stand-in (C and the cut item are private, D-127 §2): the panels are split along the
// drawn seam and not along C's arm mask; the shading ratio carries the item's strokes onto any material; the displacement is
// bounded and smooth; the alpha is the cut's with no holes; a chest print lands at its fixed anchor; the study refuses to write in
// the repository. The visual review on C is in docs/decisions/D-264.md (passing these tests is not evidence of visual quality).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as WR from "../../tools/avatar/northstar-wardrobe.mjs";
import * as BC from "../../tools/avatar/northstar-base-figure-c.mjs";
import * as IP from "../../tools/avatar/northstar-item-pilot.mjs";
import * as R1 from "../../tools/avatar/northstar-r1-garment.mjs";
import * as C1 from "../../tools/avatar/northstar-r1-construction.mjs";
import * as TM from "../../tools/avatar/northstar-tee-master.mjs";
import { SYNTHETIC } from "../../tools/avatar/northstar-r1-material-quality.mjs";
import { syntheticPrint } from "../../tools/avatar/northstar-tee-master-study.mjs";
import { recolour } from "../../tools/avatar/northstar-wardrobe-poc.mjs";
import * as NL from "../../tools/avatar/r3-northstar-layers.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const w = WR.buildWardrobe(), L = w.base.layers, A = w.anchors, M = w.fg.master, { W, N } = WR;
const LEGS = (() => { const legs = new Uint8ClampedArray(L.pants); for (let i = 0; i < (A.crotchY + 10) * W; i++) legs[i * 4 + 3] = 0; return NL.overStack([M, recolour(legs, { h: 33, s: 0.51, vScale: 1.3 })]); })();
const base = BC.prepareBase(w, LEGS), T = BC.templatesC(w, base, { revision: "d213" });
const only = (k, P = LEGS) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) if (base.sep.lab[i] === k) o.set(P.subarray(i * 4, i * 4 + 4), i * 4); return o; };
const sleeve = new Uint8ClampedArray(N * 4); for (let y = A.shoulder.y; y < 720; y++) for (let x = 0; x < W; x++) if (base.arms[(y * W + x) * 4 + 3] >= 128) sleeve.set([40, 140, 120, 255], (y * W + x) * 4);
const top = IP.processItem(w, base, T, "top", NL.overStack([LEGS, recolour(only(1), { h: 175, s: 0.55 }), sleeve]));
const t = R1.templateFromLayers(top.layers, { category: "top" }), cl = C1.constructionLayer(t, base, "tee-hip");

// the stand-in's cut item with the armhole seams DRAWN as dark 1 px lines along SPEC's polylines (the seams the master must find)
const union = (() => { const u = new Uint8ClampedArray(N * 4); for (const Lr of Object.values(top.layers)) for (let i = 0; i < N; i++) if (Lr[i * 4 + 3]) u.set(Lr.subarray(i * 4, i * 4 + 4), i * 4); return u; })();
for (const poly of Object.values(TM.SPEC.seams)) for (let k = 0; k + 1 < poly.length; k++) { const [ax, ay] = poly[k], [bx, by] = poly[k + 1];
  for (let y = ay; y <= by; y++) { const x = Math.round(ax + ((bx - ax) * (y - ay)) / Math.max(1, by - ay)), i = y * W + x; if (t.core[i]) union.set([60, 50, 45, 255], i * 4); } }
const src = { layers: { all: union } }, master = TM.buildMaster(t, src);

test("D-264 the panels split along the drawn seam, not along C's arm mask", () => {
  assert.ok(master.sizes.left > 500 && master.sizes.right > 500, JSON.stringify(master.sizes));
  for (const [side, k, sgn] of [["left", 1, -1], ["right", 2, 1]]) { let outside = 0, beyondArm = 0, inside = 0;
    // the refined seam within the drawn rows (the ends extended to the outline are per-cut data for C's cut, not checked here)
    const ys = [TM.SPEC.seams[side][0][1], TM.SPEC.seams[side].at(-1)[1] - 6];
    for (const [x, y] of master.seams[side].filter(([, y]) => y >= ys[0] && y <= ys[1] && y % 7 === 0)) { const o = y * W + x + sgn * 4, n = y * W + x - sgn * 4;
      if (t.core[o]) { assert.equal(master.panel[o], k, side + " outside the seam is the sleeve at " + x + "," + y); outside++; if (base.arms[o * 4 + 3] < 128) beyondArm++; }
      if (t.core[n]) { assert.equal(master.panel[n], 0, side + " inside the seam is the body"); inside++; } }
    assert.ok(outside >= 3 && inside >= 3); assert.ok(beyondArm >= 1, side + ": sleeve fabric where C's arm mask is not — the mask does not decide the panel"); }
});

test("D-264 the shading ratio carries the item's strokes; the displacement is bounded and smooth; alpha is the cut's with no holes", () => {
  const [sx, sy] = TM.SPEC.seams.left[1]; let darkest = 9; for (let d = -TM.SPEC.seamSearchPx; d <= TM.SPEC.seamSearchPx; d++) darkest = Math.min(darkest, master.ratio[sy * W + sx + d]);
  assert.ok(darkest < 0.6, "the drawn seam darkens the fabric: " + darkest);
  let maxD = 0, maxStep = 0; for (let j = W; j < N - W; j++) { if (master.panel[j] < 0) continue; const dx = master.disp[j * 2], dy = master.disp[j * 2 + 1];
    if (master.panel[j] === master.panel[j + 1]) maxStep = Math.max(maxStep, Math.abs(master.disp[(j + 1) * 2] - dx), Math.abs(master.disp[(j + 1) * 2 + 1] - dy));
    maxD = Math.max(maxD, Math.abs(dx)); }
  assert.ok(maxD <= TM.SPEC.warp.foldMaxPx + 1e-3, "the horizontal shift stays within foldMaxPx: " + maxD); assert.ok(maxStep < 1, "smooth: neighbouring shifts differ < 1 px, got " + maxStep);
  const plain = TM.render(master, t, base, cl.band, { body: [200, 100, 50] }); let holes = 0, k = 0;
  for (let j = 0; j < N; j++) { assert.equal(plain.layer[j * 4 + 3], t.alpha[j]); if (t.core[j] && plain.layer[j * 4 + 3] < 128) holes++; }
  assert.equal(holes, 0);
  for (let j = 0; j < N; j += 89) if (t.core[j] && !t.contour[j * 4 + 3]) { assert.ok(Math.abs(plain.layer[j * 4] - Math.min(255, Math.round(200 * master.ratio[j]))) <= 1); k++; } assert.ok(k > 100);
  const sum = (Lr) => { let n = 0; for (let j = 0; j < N; j++) if (Lr[j * 4 + 3]) n++; return n; }; let a = 0; for (let j = 0; j < N; j++) if (t.alpha[j]) a++;
  assert.equal(sum(plain.layers.topBody) + sum(plain.layers.sleeves), a, "the production layer split loses nothing");
  const fit = R1.checkItem(w, base, T, t, plain.layers); assert.ok(fit.ok, JSON.stringify(fit.failed));
});

test("D-264 the same master renders a pattern and puts a chest print at its fixed anchor for every design", () => {
  const st = TM.render(master, t, base, cl.band, { body: SYNTHETIC.stripes() }), pr = TM.render(master, t, base, cl.band, { body: [230, 220, 200], print: { img: syntheticPrint(), anchor: "chest-left" } });
  assert.equal(pr.placed.length, 1); const [px, py, pw, ph] = pr.placed[0].box; assert.ok(pr.placed[0].px > pw * ph * 0.5, "most of the print is on the fabric");
  let navy = 0; for (let y = py; y < py + ph; y++) for (let x = px; x < px + pw; x++) { const j = (y * W + x) * 4; if (pr.layer[j + 2] > pr.layer[j] + 40) navy++; } assert.ok(navy > pw * ph * 0.2, "the print's navy disc is in its box: " + navy);
  // a different print image on a different fabric lands in the same place: the anchor is per cut, not per design
  const p2 = TM.render(master, t, base, cl.band, { body: [40, 60, 160], print: { img: syntheticPrint(64), anchor: "chest-left" } }); assert.deepEqual(p2.placed[0].box, pr.placed[0].box);
  for (const a of master.axes) assert.ok(Number.isFinite(a.angle) && a.px > 500);
  const lum = new Set(); for (let j = 0; j < N; j++) if (master.panel[j] === 1 && st.layer[j * 4 + 3] && !t.contour[j * 4 + 3]) lum.add(st.layer[j * 4] >> 5); assert.ok(lum.size >= 3, "the sleeve carries the stripes");
});

test("D-264 the study refuses to write inside the repository", () => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/API_?KEY/i.test(k)));
  const r = spawnSync(process.execPath, [join(REPO, "tools", "avatar", "northstar-tee-master-study.mjs"), "--out", join(REPO, "tools", "avatar", "build", "d264")], { encoding: "utf8", env });
  assert.equal(r.status, 1); assert.match(r.stderr, /REFUSED: --out must be outside the repository/);
});
