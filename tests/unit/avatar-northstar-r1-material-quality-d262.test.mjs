// D-262 — r1-m1's quality tools on the CI stand-in (C and the generated material are private, D-127 §2): wrap tiling repeats a
// seamless swatch without an axis; the swatch checks find a cut-out seam, broad shading and a drawn detail, and leave an all-over
// pattern alone; the crisp shade removes a thin drawn line and keeps a broad shadow; the ratio shade carries the item's own shading
// strength. The quality reference on C is in docs/decisions/D-262.md.
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
import { SYNTHETIC } from "../../tools/avatar/northstar-r1-material-quality.mjs";
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
const tile = (n, f) => { const px = new Uint8ClampedArray(n * n * 4); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) px.set([...f(x, y), 255], (y * n + x) * 4); return { w: n, h: n, px }; };

test("D-262 the synthetic samples are seamless, flat and free of details; a cut-out gradient and a drawn detail are caught", () => {
  for (const s of [SYNTHETIC.stripes(), SYNTHETIC.tartan(), SYNTHETIC.plain([230, 200, 160])]) { const c = M1.swatchChecks(s); assert.deepEqual([c.seamless, c.flat, c.noDetails], [true, true, true], JSON.stringify(c)); }
  const gradient = tile(96, (x, y) => { const v = Math.round(120 + x * 1.2); return [v, v, v]; }), g = M1.swatchChecks(gradient); assert.equal(g.seamless, false); assert.equal(g.flat, false);
  const pocket = tile(96, (x, y) => ((x >= 30 && x <= 60 && (y === 30 || y === 64)) || ((x === 30 || x === 60) && y >= 30 && y <= 64) ? [150, 110, 90] : [235, 200, 170])), p = M1.swatchChecks(pocket);
  assert.equal(p.noDetails, false, "a faint pocket outline is a detail"); assert.equal(p.details, 1);
});

test("D-262 wrap tiling repeats a seamless swatch with its period; mirror tiling flips it", () => {
  const ramp = tile(32, (x) => [x * 8, 100, 100]), wr = M1.lay(t, cl, base, { body: ramp, scale: 1, tiling: "wrap" }), mr = M1.lay(t, cl, base, { body: ramp, scale: 1, tiling: "mirror" });
  const { reg } = M1.regions(t, base); let i0 = -1; for (let i = 0; i < N; i++) if (reg[i] === 0 && reg[i + 32] === 0 && reg[i + 1] === 0 && !cl.band[i] && !cl.band[i + 32] && !cl.lines[i * 4 + 3] && !cl.lines[(i + 32) * 4 + 3]) { i0 = i; break; }
  assert.ok(i0 >= 0); const r = (Lr, i) => Lr.material[i * 4] / Math.max(1, Lr.material[i * 4 + 1]);
  assert.ok(Math.abs(r(wr, i0) - r(wr, i0 + 32)) < 0.05, "wrap: the same colour one period on"); assert.ok(Math.abs(r(mr, i0) - r(mr, i0 + 32)) > 0.05 || Math.abs(r(mr, i0 + 1) - r(mr, i0 + 33)) > 0.05, "mirror: flipped");
});

test("D-262 the crisp shade removes a thin drawn line and keeps a broad shadow; the ratio shade carries the item's own strength", () => {
  const t2 = { ...t, shade: Float32Array.from(t.shade) }; let cx = 0, cy = 0, n = 0; for (let i = 0; i < N; i++) if (t.core[i]) { cx += i % W; cy += (i / W) | 0; n++; } cx = Math.round(cx / n); cy = Math.round(cy / n);
  for (let y = cy - 30; y < cy + 30; y++) for (let x = cx - 30; x < cx + 30; x++) t2.shade[y * W + x] = 0.8; for (let x = cx - 25; x < cx + 25; x++) t2.shade[cy * W + x] = 0.1;
  for (let y = cy + 40; y < cy + 70; y++) for (let x = cx - 25; x < cx + 25; x++) t2.shade[y * W + x] = 0.2;
  const c = M1.shadeCrisp(t2); assert.ok(c[cy * W + cx] > 0.7, "the thin line is gone"); assert.ok(c[(cy + 55) * W + cx] < 0.3, "the broad shadow stays");
  const ratio = M1.shadeRatio(t, { layers: top.layers }), v = []; for (let i = 0; i < N; i++) if (t.core[i]) { assert.ok(ratio[i] >= 0.5 && ratio[i] <= 1.15); v.push(ratio[i]); } v.sort((a, b) => a - b); assert.ok(Math.abs(v[v.length >> 1] - 1) < 0.02, "median 1");
  const plain = tile(16, () => [200, 100, 50]), Lr = M1.lay(t, cl, base, { body: plain, scale: 1, tiling: "wrap", shade: "ratio", src: { layers: top.layers } });
  for (let i = 0; i < N; i += 97) if (t.core[i]) assert.ok(Math.abs(Lr.material[i * 4] - Math.round(200 * ratio[i])) <= 1);
});

test("D-262 the quality study refuses to write inside the repository", () => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/API_?KEY/i.test(k)));
  const r = spawnSync(process.execPath, [join(REPO, "tools", "avatar", "northstar-r1-material-quality.mjs"), "--out", join(REPO, "tools", "avatar", "build", "d262")], { encoding: "utf8", env });
  assert.equal(r.status, 1); assert.match(r.stderr, /REFUSED: --out must be outside the repository/);
});
