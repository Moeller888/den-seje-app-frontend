// D-260 — r1-m1, geometry-free material laid on by the cut (tools/avatar/northstar-r1-material.mjs), on the CI stand-in (C and
// the generated pictures are private, D-127 §2): a flat swatch, a trim swatch and a detail are laid on a cut; the alpha, the
// silhouette, the bands, the lines and the anchors are the cut's; every material pixel is a swatch pixel times the cut's shade;
// nothing is filled. The study on real generated material is in docs/decisions/D-260.md.
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
import * as M1 from "../../tools/avatar/northstar-r1-material.mjs";
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
const swatch = (f, n = 64) => { const px = new Uint8ClampedArray(n * n * 4); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) px.set([...f(x, y), 255], (y * n + x) * 4); return { w: n, h: n, px }; };
const stripes = swatch((x, y) => (Math.floor(y / 8) % 2 ? [30, 40, 120] : [240, 240, 240]));

test("D-260 r1-m1 is a hypothesis beside r1-v1, r1-c1 and d240; the anchors are per cut", () => {
  assert.equal(M1.REVISION, "r1-m1"); assert.equal(C1.REVISION, "r1-c1"); assert.equal(IP.METHOD, "d240"); assert.ok(M1.ANCHORS["tee-hip"]["chest-left"]);
});

test("D-260 flatten divides out broad shading and keeps the pattern; the largest square lies inside its mask", () => {
  const shaded = swatch((x, y) => { const k = 0.5 + 0.5 * (x / 63), on = Math.floor(y / 8) % 2; return (on ? [40, 40, 120] : [220, 220, 220]).map((v) => Math.round(v * k)); });
  const f = M1.flatten(shaded, 12), lum = (s, x, y) => { const j = (y * s.w + x) * 4; return 0.299 * s.px[j] + 0.587 * s.px[j + 1] + 0.114 * s.px[j + 2]; };
  assert.ok(Math.abs(lum(f, 4, 3) - lum(f, 59, 3)) < Math.abs(lum(shaded, 4, 3) - lum(shaded, 59, 3)) / 3, "the broad gradient is mostly gone");
  assert.ok(lum(f, 32, 3) - lum(f, 32, 11) > 60, "the stripes remain");
  const sq = M1.largestSquare(t.core, 96); assert.ok(sq[2] >= 32); for (let y = sq[1]; y < sq[1] + sq[3]; y++) for (let x = sq[0]; x < sq[0] + sq[2]; x++) assert.ok(t.core[y * W + x]);
});

test("D-260 laying on: the cut's alpha everywhere, no hole, every material pixel a swatch colour times the cut's shade, the cut's lines on top", () => {
  const plain = swatch(() => [200, 100, 50]), Ld = M1.lay(t, cl, base, { body: plain, scale: 1 }), sh = M1.shadeOf(t, cl);
  for (let i = 0; i < N; i++) { assert.equal(Ld.material[i * 4 + 3], t.alpha[i]); if (!t.core[i]) continue; assert.ok(Ld.material[i * 4 + 3] >= 128, "no hole");
    const f = M1.SHADE.base + M1.SHADE.gain * sh[i]; assert.ok(Math.abs(Ld.material[i * 4] - Math.round(200 * f)) <= 1 && Math.abs(Ld.material[i * 4 + 2] - Math.round(50 * f)) <= 1); }
  for (let i = 0; i < N; i++) if (cl.lines[i * 4 + 3] >= 200 && t.alpha[i]) assert.ok(Ld.layer[i * 4] < 120, "the cut's ink line is drawn over the material");
  let sl = 0; for (let i = 0; i < N; i++) if (Ld.layers.sleeves[i * 4 + 3]) { sl++; assert.ok(base.arms[i * 4 + 3] >= 128); } assert.ok(sl > 500, "the sleeve split is the production rule");
});

test("D-260 the trim swatch fills exactly the cut's bands; a detail goes to its anchor and stays inside the cut", () => {
  const Ld = M1.lay(t, cl, base, { body: swatch(() => [200, 200, 200]), scale: 1, trim: swatch(() => [200, 40, 40]), details: [{ img: swatch((x, y) => (x < 2 || y < 2 || x > 61 || y > 61 ? [20, 20, 20] : [90, 160, 90]), 64), anchor: "chest-left" }] });
  for (let i = 0; i < N; i++) { if (!t.core[i] || cl.lines[i * 4 + 3]) continue; const red = Ld.material[i * 4] > Ld.material[i * 4 + 1] + 60; if (cl.band[i]) assert.ok(red, "trim on a band"); }
  assert.equal(Ld.placed.length, 1); assert.equal(Ld.placed[0].inside, 1, "the detail lies wholly inside the cut");
  assert.throws(() => M1.lay(t, cl, base, { body: stripes, scale: 1, details: [{ img: stripes, anchor: "back-yoke" }] }), /no anchor/);
});

test("D-260 a sleeve's swatch turns with its arm: stripes across the body stay across the arm", () => {
  const Ld = M1.lay(t, cl, base, { body: stripes, scale: 1 }), { reg, axes } = M1.regions(t, base);
  // along the arm's axis the stripes alternate; across it they hold: count colour changes along both directions inside one sleeve
  const a = axes[0], ux = Math.cos(a.angle), uy = Math.sin(a.angle); let along = 0, across = 0;
  for (let i = 0; i < N; i++) { if (reg[i] !== 1 || cl.band[i] || cl.lines[i * 4 + 3]) continue; const x = i % W, y = (i / W) | 0, j1 = Math.round(y + uy * 2) * W + Math.round(x + ux * 2), j2 = Math.round(y + ux * 2) * W + Math.round(x - uy * 2);
    if (reg[j1] === 1 && Math.abs(Ld.material[i * 4] - Ld.material[j1 * 4]) > 60) along++; if (reg[j2] === 1 && Math.abs(Ld.material[i * 4] - Ld.material[j2 * 4]) > 60) across++; }
  assert.ok(along > 3 * across, "stripes cross the arm: along " + along + ", across " + across);
});

test("D-260 the study refuses to write inside the repository", () => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/API_?KEY/i.test(k)));
  const r = spawnSync(process.execPath, [join(REPO, "tools", "avatar", "northstar-r1-material-study.mjs"), "--out", join(REPO, "tools", "avatar", "build", "d260")], { encoding: "utf8", env });
  assert.equal(r.status, 1); assert.match(r.stderr, /REFUSED: --out must be outside the repository/);
});
