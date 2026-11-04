// D-251 — experiment A revision a2 (tools/avatar/northstar-shape-extract-a2.mjs) on the CI stand-in (C is private, D-127 §2): the
// layer contract decides which lines may close a region. What lies in front of the category on C (a bottom: arms, hands, base top)
// never joins the item and its lines never close; a top's sleeve over the arms still recovers skin-near fabric. a1 stays frozen as
// D-250 recorded it; the production method is untouched and stays the default. The runs on the real pictures are in
// docs/decisions/D-251.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as WR from "../../tools/avatar/northstar-wardrobe.mjs";
import * as BC from "../../tools/avatar/northstar-base-figure-c.mjs";
import * as IP from "../../tools/avatar/northstar-item-pilot.mjs";
import * as SX1 from "../../tools/avatar/northstar-shape-extract.mjs";
import * as SX2 from "../../tools/avatar/northstar-shape-extract-a2.mjs";
import { recolour } from "../../tools/avatar/northstar-wardrobe-poc.mjs";
import * as NL from "../../tools/avatar/r3-northstar-layers.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const w = WR.buildWardrobe(), L = w.base.layers, A = w.anchors, M = w.fg.master, { W, N } = WR;
const LEGS = (() => { const legs = new Uint8ClampedArray(L.pants); for (let i = 0; i < (A.crotchY + 10) * W; i++) legs[i * 4 + 3] = 0; return NL.overStack([M, recolour(legs, { h: 33, s: 0.51, vScale: 1.3 })]); })();
const base = BC.prepareBase(w, LEGS), T = BC.templatesC(w, base, { revision: "d213" }), C = base.R;
const only = (k, P = LEGS) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) if (base.sep.lab[i] === k) o.set(P.subarray(i * 4, i * 4 + 4), i * 4); return o; };
const count = (m, f = () => true) => { let n = 0; for (let i = 0; i < N; i++) if (m[i] && f(i)) n++; return n; };

test("D-251 a2 is an experiment beside a frozen a1: METHOD unchanged, a1's module is the one D-250 recorded", () => {
  assert.equal(IP.METHOD, "d240"); assert.equal(SX2.SHAPE_REVISION, "a2"); assert.equal(SX1.SHAPE_REVISION, "a1");
  assert.equal(createHash("sha256").update(readFileSync(join(REPO, "tools", "avatar", "northstar-shape-extract.mjs"))).digest("hex"), "86c331da49c238248e9b43cac98f1a512f7344e836807c08e3d3e3ffcd88b620", "a1 frozen (D-250)");
  const pilot = readFileSync(join(REPO, "tools", "avatar", "northstar-item-pilot.mjs"), "utf8"); assert.ok(!/northstar-shape-extract/.test(pilot), "the production pipeline does not use the experiment");
  assert.match(SX2.SHAPE_RULES.front, /bottom: arms, hands, base top/); assert.match(SX2.SHAPE_RULES.linesAlone, /never filled/);
});

test("D-251 the front zone follows the stack: a top lies under the hands only, a bottom under arms, hands and the base top, shoes under the base bottom too", () => {
  const top = SX2.frontZone(w, base, "top"), bottom = SX2.frontZone(w, base, "bottom"), shoes = SX2.frontZone(w, base, "shoes");
  assert.ok(count(top.hands) > 0 && count(top.arms) > 0 && count(top.baseTop) > 0);
  const th = Mo1(top.hands), bt = Mo1(bottom.baseTop), ba = Mo1(bottom.arms), bh = Mo1(bottom.hands);
  assert.equal(count(top.arms, (i) => top.front[i] && !th[i]), 0, "a top's sleeves lie over the arms: the arms are not in front of it");
  for (const k of ["arms", "hands", "baseTop"]) assert.equal(count(bottom[k], (i) => !bottom.front[i]), 0, "in front of a bottom: " + k);
  assert.equal(count(bottom.baseBottom, (i) => bottom.front[i] && !bt[i] && !ba[i] && !bh[i]), 0, "a bottom's own base is not in front of it");
  assert.equal(count(shoes.baseBottom, (i) => !shoes.front[i]), 0, "the base bottom lies over the shoes");
  assert.throws(() => SX2.frontZone(w, base, "hat"), /unknown category/);
});
const Mo1 = (m) => WR.maskOps.dilate(m, 1);

test("D-251 a bottom with the hem and the hand redrawn: a1 takes them as garment, a2 never — nothing in front of the bottom joins it", () => {
  const z = SX2.frontZone(w, base, "bottom"), t = T.bottom, O = NL.overStack([LEGS, recolour(only(2), { h: 120, s: 0.5 })]);
  for (let i = 0; i < N; i++) if ((z.baseTop[i] || z.hands[i]) && t.allowed[i] && !t.protect[i] && O[i * 4 + 3] >= 128) O.set([C[i * 4], Math.max(0, C[i * 4 + 1] - 40), C[i * 4 + 2], 255], i * 4);
  const r1 = SX1.shapeExtract(w, base, T, "bottom", O, {}), r2 = SX2.shapeExtract(w, base, T, "bottom", O, { r0: r1.r0 });
  assert.ok(count(r1.masks.added, (i) => z.front[i]) > 0, "a1 adds pixels in front of the bottom (the D-250 fault, reproduced)");
  assert.equal(count(r2.masks.added, (i) => z.front[i]), 0, "a2 adds none");
  const P = r1.r0.layers.pants, Q = r2.layers.pants; for (let i = 0; i < N; i++) if (z.front[i] && Q[i * 4 + 3] >= 128) assert.ok(P[i * 4 + 3] >= 128, "a2 holds in front of the bottom only what production holds");
});

test("D-251 a2 keeps a1's recovery where the contract allows it: skin-near fabric enclosed by a top's sleeve over the arm; r0 passed in = r0 computed", () => {
  const sleeve = new Uint8ClampedArray(N * 4); for (let y = A.shoulder.y; y < 720; y++) for (let x = 0; x < W; x++) if (base.arms[(y * W + x) * 4 + 3] >= 128) sleeve.set([40, 140, 120, 255], (y * W + x) * 4);
  const O = NL.overStack([LEGS, recolour(only(1), { h: 175, s: 0.55 }), sleeve]);
  const block = (() => { for (let y = A.shoulder.y + 40; y < 700; y++) for (let x = 0; x < W / 2; x++) { let ok = true;
    for (let dy = -6; dy < 18 && ok; dy++) for (let dx = -6; dx < 18 && ok; dx++) { const i = (y + dy) * W + x + dx; if (sleeve[i * 4 + 3] < 255 || !T.top.allowed[i] || T.top.protect[i] || base.arms[i * 4 + 3] < 250) ok = false; }
    if (ok) { const b = []; for (let dy = 0; dy < 12; dy++) for (let dx = 0; dx < 12; dx++) b.push((y + dy) * W + x + dx); return b; } } return null; })();
  assert.ok(block); for (const i of block) O.set([C[i * 4], Math.max(0, C[i * 4 + 1] - 30), C[i * 4 + 2], 255], i * 4);
  const r = SX2.shapeExtract(w, base, T, "top", O, {}), held = (Ls, i) => Ls.sleeves[i * 4 + 3] >= 128 || Ls.topBody[i * 4 + 3] >= 128;
  assert.ok(block.filter((i) => held(r.r0.layers, i)).length < block.length, "production explains part of it as C");
  for (const i of block) assert.ok(held(r.layers, i), "a2 holds it");
  const again = SX2.shapeExtract(w, base, T, "top", O, { r0: r.r0 });
  for (const k of ["sleeves", "topBody"]) assert.ok(Buffer.from(again.layers[k].buffer).equals(Buffer.from(r.layers[k].buffer)), "the same layers with r0 passed in");
});

test("D-251 the run refuses to write inside the repository (its sheets show C)", () => {
  const r = spawnSync(process.execPath, [join(REPO, "tools", "avatar", "northstar-shape-a2-run.mjs"), "items", "--out", join(REPO, "tools", "avatar", "build", "d251")], { encoding: "utf8" });
  assert.equal(r.status, 1); assert.match(r.stderr, /REFUSED: --out must be outside the repository/);
});
