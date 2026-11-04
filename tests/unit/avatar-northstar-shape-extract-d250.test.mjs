// D-250 — experiment A, shape-based extraction (tools/avatar/northstar-shape-extract.mjs), on the CI stand-in (C is private, D-127
// §2): what a garment's own outline encloses joins the item only when the picture repainted it; an enclosed region painted as
// C stays uncertain and is never filled; the production method is untouched and stays the default. The runs on the real pictures
// are recorded in docs/decisions/D-250.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as WR from "../../tools/avatar/northstar-wardrobe.mjs";
import * as BC from "../../tools/avatar/northstar-base-figure-c.mjs";
import * as IP from "../../tools/avatar/northstar-item-pilot.mjs";
import * as SX from "../../tools/avatar/northstar-shape-extract.mjs";
import * as EX from "../../tools/avatar/northstar-shape-experiment.mjs";
import { recolour } from "../../tools/avatar/northstar-wardrobe-poc.mjs";
import * as NL from "../../tools/avatar/r3-northstar-layers.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const w = WR.buildWardrobe(), L = w.base.layers, A = w.anchors, M = w.fg.master, { W, N } = WR;
const LEGS = (() => { const legs = new Uint8ClampedArray(L.pants); for (let i = 0; i < (A.crotchY + 10) * W; i++) legs[i * 4 + 3] = 0; return NL.overStack([M, recolour(legs, { h: 33, s: 0.51, vScale: 1.3 })]); })();
const base = BC.prepareBase(w, LEGS), T = BC.templatesC(w, base, { revision: "d213" }), C = base.R;
const only = (k, P = LEGS) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) if (base.sep.lab[i] === k) o.set(P.subarray(i * 4, i * 4 + 4), i * 4); return o; };
// a top whose sleeve covers the upper arms; a 12 × 12 block inside the sleeve, over C's opaque arm, at least 6 px from any edge
const sleeve = new Uint8ClampedArray(N * 4); for (let y = A.shoulder.y; y < 720; y++) for (let x = 0; x < W; x++) if (base.arms[(y * W + x) * 4 + 3] >= 128) sleeve.set([40, 140, 120, 255], (y * W + x) * 4);
const top = NL.overStack([LEGS, recolour(only(1), { h: 175, s: 0.55 }), sleeve]);
const block = (() => { for (let y = A.shoulder.y + 40; y < 700; y++) for (let x = 0; x < W / 2; x++) { let ok = true;
  for (let dy = -6; dy < 18 && ok; dy++) for (let dx = -6; dx < 18 && ok; dx++) { const i = (y + dy) * W + x + dx; if (sleeve[i * 4 + 3] < 255 || !T.top.allowed[i] || T.top.protect[i] || base.arms[i * 4 + 3] < 250) ok = false; }
  if (ok) { const b = []; for (let dy = 0; dy < 12; dy++) for (let dx = 0; dx < 12; dx++) b.push((y + dy) * W + x + dx); return b; } } return null; })();
const picture = (paint) => { const p = new Uint8ClampedArray(top); for (const i of block) p.set(paint(i), i * 4); return p; };
const near = (i) => [C[i * 4], Math.max(0, C[i * 4 + 1] - 30), C[i * 4 + 2], 255];   // skin-near fabric: repainted (30 > CHANGE_TOL), yet near enough to C that production explains part of it as C
const asC = (i) => C.subarray(i * 4, i * 4 + 4);
const held = (Ls, i) => Ls.sleeves[i * 4 + 3] >= 128 || Ls.topBody[i * 4 + 3] >= 128;

test("D-250 the experiment is not the production method: METHOD unchanged, its own revision and rules", () => {
  assert.equal(IP.METHOD, "d240"); assert.equal(SX.SHAPE_REVISION, "a1");
  assert.match(SX.SHAPE_RULES.enclosed, /whole border is certain item or a drawn \(ink\) line/); assert.match(SX.SHAPE_RULES.open, /never filled/);
  assert.ok(!/northstar-shape-extract/.test(readFileSync(join(REPO, "tools", "avatar", "northstar-item-pilot.mjs"), "utf8")), "the production pipeline does not use the experiment");
});

test("D-250 skin-near fabric enclosed by the sleeve: production leaves part of it out, A takes the picture's own pixels", () => {
  assert.ok(block, "a block inside the sleeve over C's arm");
  const O = picture(near), r = SX.shapeExtract(w, base, T, "top", O, {});
  assert.ok(block.filter((i) => held(r.r0.layers, i)).length < block.length, "production explains part of it as C");
  for (const i of block) { assert.ok(held(r.layers, i), "A holds it"); const L = r.layers.sleeves[i * 4 + 3] ? r.layers.sleeves : r.layers.topBody; for (let c = 0; c < 4; c++) assert.equal(L[i * 4 + c], O[i * 4 + c], "the picture's own pixel"); }
  assert.ok(block.some((i) => r.masks.added[i]));
  for (let i = 0; i < N; i++) if (r.masks.added[i]) assert.ok(T.top.allowed[i] && !T.top.protect[i], "only inside the envelope");
});

test("D-250 an enclosed region the picture paints AS C stays uncertain and is never filled", () => {
  const O = picture(asC), r = SX.shapeExtract(w, base, T, "top", O, {});
  for (const i of block) { assert.ok(!held(r.layers, i), "never filled"); assert.equal(r.masks.added[i], 0); assert.equal(r.masks.uncertainEnclosed[i], 1, "reported uncertain"); }
  assert.ok(r.stats.uncertainEnclosedPx >= block.length);
});

test("D-250 the experiment's sets are fixed: development = b1's five, regression = the 21 earlier items; disjoint", () => {
  assert.deepEqual([...EX.DEV], ["top-breton-longsleeve", "shoes-hightop-canvas-red", "top-waist-boxy-peach", "bottom-pleated-skirt-tartan", "shoes-desert-boots-tan"]);
  const dev = EX.inputs("dev"), reg = EX.inputs("regression");
  assert.deepEqual(dev.map((x) => x.id).sort(), [...EX.DEV].sort()); assert.equal(reg.length, 21);
  assert.equal(reg.filter((x) => EX.DEV.includes(x.id)).length, 0); assert.ok(reg.some((x) => x.id === "shoes-sandals-brown"), "open footwear in the regression set");
  for (const x of [...dev, ...reg]) assert.match(x.rawSha256, /^[0-9a-f]{64}$/);
});

test("D-250 the experiment refuses to write inside the repository (its sheets show C)", () => {
  const r = spawnSync(process.execPath, [join(REPO, "tools", "avatar", "northstar-shape-experiment.mjs"), "--set", "dev", "--out", join(REPO, "tools", "avatar", "build", "d250")], { encoding: "utf8" });
  assert.equal(r.status, 1); assert.match(r.stderr, /REFUSED: --out must be outside the repository/);
});
