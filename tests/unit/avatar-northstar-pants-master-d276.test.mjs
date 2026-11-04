// D-276 — the pants master's mechanics on a SYNTHETIC trousers cut (C and the cut item are private, D-127 §2): the waistband and the
// two legs are split by the hand-entered centre seam; the material does not jump inside a panel, also where a hand mask crosses a leg;
// both legs point the same way and neither is mirrored (the PCA axis is normalised: a leg slanting the other way is not turned by
// 180°); the cut's alpha is kept; a drawn fold stroke is carried onto a new material; stripes run along each leg. The visual review on
// C is in docs/decisions/D-276.md (passing these tests is not evidence of visual quality).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as WR from "../../tools/avatar/northstar-wardrobe.mjs";
import * as PM from "../../tools/avatar/northstar-pants-master.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CHILD_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/API_?KEY/i.test(k)));
const { W, N } = WR;
// the synthetic cut: a hip block (y 760–893) and two legs slanting outward to y 1380, a 10 px gap between them below the crotch
const inLeg = (x, y, side) => { const t = (y - 893) / (1380 - 893), shift = side * 18 * t; return side < 0 ? x >= 400 + shift && x <= 505 + shift : x >= 517 + shift && x <= 622 + shift; };
const inside = (x, y) => (y >= 760 && y < 893 && x >= 400 && x <= 622) || (y >= 893 && y <= 1380 && (inLeg(x, y, -1) || inLeg(x, y, 1)));
const alpha = new Uint8Array(N), core = new Uint8Array(N), contour = new Uint8ClampedArray(N * 4), pants = new Uint8ClampedArray(N * 4);
for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0; if (!inside(x, y)) continue; alpha[i] = 255; core[i] = 1;
  const edge = !inside(x - 2, y) || !inside(x + 2, y) || !inside(x, y - 2) || !inside(x, y + 2); if (edge) contour.set([30, 30, 30, 255], i * 4);
  const stroke = y > 1100 && y < 1140 && Math.abs(x - 440 + (y - 1100) * 0.4) < 3;   // one drawn fold stroke on the left knee
  pants.set(edge ? [30, 30, 30, 255] : stroke ? [60, 70, 40, 255] : [110, 120, 70, 255], i * 4); }
const t = { alpha, core, contour }, src = { layers: { pants } }, arms = new Uint8ClampedArray(N * 4);
for (let y = 900; y < 1000; y++) for (let x = 380; x < 430; x++) arms[(y * W + x) * 4 + 3] = 255;   // a "hand" over the left thigh
const base = { arms }, master = PM.buildPantsMaster(t, src);

test("D-276 the panels: the waistband under the top edge and two legs split by the centre seam; every pixel of the cut belongs to one", () => {
  assert.equal(PM.REVISION, "pants-master-v1"); assert.deepEqual(PM.SPEC.crotch, [511, 893]);
  for (let i = 0; i < N; i++) if (core[i]) assert.ok(master.panel[i] >= 0, "pixel " + i);
  assert.equal(master.panel[(762) * W + 450], 0, "the waistband"); assert.equal(master.panel[(770) * W + 450], 1, "under the waistband: the left leg");
  assert.equal(master.panel[1200 * W + 440], 1); assert.equal(master.panel[1200 * W + 590], 2); assert.equal(master.panel[850 * W + 505], 1); assert.equal(master.panel[850 * W + 520], 2, "the centre seam splits the hips");
  assert.ok(master.sizes.left > 1000 && master.sizes.right > 1000 && Math.abs(master.sizes.left - master.sizes.right) / master.sizes.left < 0.05);
});

test("D-276 the mapping: no jump inside a panel (also across a hand mask), no mirrored leg, both legs the same way (the PCA axis normalised)", () => {
  const m = PM.mappingChecks(master, t, arms);
  assert.equal(m.inPanelJumps, 0); assert.ok(m.armPairs > 0 && m.armMaxStep <= 2.5, "the hand mask is crossed without a change"); assert.deepEqual(m.mirroredPanels, [false, false, false]);
  assert.equal(m.legsSameWay, true); assert.equal(m.ok, true);
  for (const a of master.axes) { assert.ok(a.angle >= 0 && a.angle < Math.PI); assert.deepEqual(a.origin, [511, 893]); }
  assert.ok(master.axes[0].angle > Math.PI / 2 && master.axes[1].angle < Math.PI / 2, "the legs slant apart: a rotation each, not a mirror");
});

test("D-276 the render: the cut's alpha kept; a drawn fold stroke carried onto a new material; stripes run along each leg", () => {
  const mats = PM.materials(); assert.deepEqual(Object.keys(mats).map((k) => /SYNTHETIC/.test(k)), [true, true, true, true]);
  for (const m of Object.values(mats)) { const L = PM.renderPants(master, t, base, { body: m }).layer; for (let i = 0; i < N; i += 7) assert.equal(L[i * 4 + 3], alpha[i]); }
  const navy = PM.renderPants(master, t, base, { body: [48, 66, 110] }).layer, lum = (i) => 0.299 * navy[i * 4] + 0.587 * navy[i * 4 + 1] + 0.114 * navy[i * 4 + 2];
  assert.ok(lum(1120 * W + 432) < 0.8 * lum(1120 * W + 470), "the fold stroke darkens the new material");
  // a stripe along the leg: along the leg's own axis the stripe phase (u) barely changes; across it, it does
  const { U } = PM.mapping(master, t), along = Math.abs(U[1300 * W + 450] - U[1000 * W + 450 + Math.round(18 * (300 / 487))]), across = Math.abs(U[1150 * W + 420] - U[1150 * W + 480]);
  assert.ok(along < 8 && across > 50, JSON.stringify({ along, across }));
});

test("D-276 the study refuses an --out inside the repository (it shows C)", () => {
  const r = spawnSync(process.execPath, [join(REPO, "tools", "avatar", "northstar-pants-master-study.mjs"), "--out", join(REPO, "tools", "avatar", "build", "d276")], { cwd: REPO, env: CHILD_ENV, encoding: "utf8", windowsHide: true, timeout: 60000 });
  assert.equal(r.status, 1); assert.match(r.stderr, /--out must be outside the repository/);
});
