// D-253 — R1, the garment generated apart from the body (tools/avatar/northstar-r1-garment.mjs), on the CI stand-in (C is private,
// D-127 §2): a cut's template fixes placement, alpha and the outline at its edge; an output only supplies the material. The
// stand-in proves the deterministic half, never what an image model can do. The plan (r1-plan-v1.json) authorises nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as WR from "../../tools/avatar/northstar-wardrobe.mjs";
import * as BC from "../../tools/avatar/northstar-base-figure-c.mjs";
import * as IP from "../../tools/avatar/northstar-item-pilot.mjs";
import * as R1 from "../../tools/avatar/northstar-r1-garment.mjs";
import { simulate, MATERIALS } from "../../tools/avatar/northstar-r1-proof.mjs";
import { recolour } from "../../tools/avatar/northstar-wardrobe-poc.mjs";
import * as NL from "../../tools/avatar/r3-northstar-layers.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const w = WR.buildWardrobe(), L = w.base.layers, A = w.anchors, M = w.fg.master, { W, N } = WR;
const LEGS = (() => { const legs = new Uint8ClampedArray(L.pants); for (let i = 0; i < (A.crotchY + 10) * W; i++) legs[i * 4 + 3] = 0; return NL.overStack([M, recolour(legs, { h: 33, s: 0.51, vScale: 1.3 })]); })();
const base = BC.prepareBase(w, LEGS), T = BC.templatesC(w, base, { revision: "d213" }), C = base.R;
const only = (k, P = LEGS) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) if (base.sep.lab[i] === k) o.set(P.subarray(i * 4, i * 4 + 4), i * 4); return o; };
// the stand-in cuts: a bottom (the stand-in's shorts) and a top (its tee with sleeves over the arms)
const shorts = IP.processItem(w, base, T, "bottom", NL.overStack([LEGS, recolour(only(2), { h: 120, s: 0.5 })]));
const tB = R1.templateFromLayers(shorts.layers, { category: "bottom", cut: "stand-in-shorts" });
const skin = (() => { const v = [[], [], []]; for (let i = 0; i < N; i++) if (C[i * 4 + 3] >= 250 && base.arms[i * 4 + 3] >= 250) for (let k = 0; k < 3; k++) v[k].push(C[i * 4 + k]); return v.map((a) => a.sort((x, y) => x - y)[a.length >> 1]); })();
const alphaOf = (layers) => { const u = new Uint8Array(N); for (const Lr of Object.values(layers)) for (let i = 0; i < N; i++) if (Lr[i * 4 + 3] > u[i]) u[i] = Lr[i * 4 + 3]; return u; };

test("D-253 a cut's template: alpha and core from the item, enclosed holes closed, fold shade in 0..1, the item's edge ink as the cut's contour", () => {
  assert.equal(shorts.ok, true, JSON.stringify(shorts.faults)); assert.ok(tB.corePx > 1000 && tB.contourPx > 0);
  const holed = new Uint8ClampedArray(shorts.layers.pants); let cx = 0, cy = 0, n = 0; for (let i = 0; i < N; i++) if (holed[i * 4 + 3] >= 250) { cx += i % W; cy += (i / W) | 0; n++; }
  const c = Math.round(cy / n) * W + Math.round(cx / n); assert.ok(tB.core[c]); for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) holed[(c + dy * W + dx) * 4 + 3] = 0;
  const t2 = R1.templateFromLayers({ pants: holed }, { category: "bottom" }); assert.ok(t2.closedHolePx >= 49 && t2.core[c], "a hole inside the solid core is closed");
  for (let i = 0; i < N; i++) if (tB.core[i]) assert.ok(tB.shade[i] >= 0 && tB.shade[i] <= 1);
  const cv = R1.templateCanvas(tB); for (let i = 0; i < N; i++) { assert.equal(cv[i * 4 + 3], tB.alpha[i]); if (cv[i * 4 + 3]) assert.ok(cv[i * 4] === cv[i * 4 + 1] && cv[i * 4 + 1] === cv[i * 4 + 2], "neutral grey"); }
});

test("D-253 registration is one integer translation: a shifted, spilled output is found within 1 px; a shift beyond the window is rejected and stops the rest", () => {
  const out = simulate(tB, () => [40, 60, 160], { dx: 5, dy: -3, spill: 3 }), r = R1.register(out, tB);
  assert.ok(Math.abs(r.dx - 5) <= 1 && Math.abs(r.dy + 3) <= 1, JSON.stringify(r)); assert.equal(r.coverage, 1);
  const c = R1.compose(out, tB, base); assert.equal(c.placement, "accepted"); assert.equal(c.ok, true); assert.ok(c.measures.outsidePx > 0, "spill measured and discarded");
  const far = R1.compose(simulate(tB, () => [40, 60, 160], { dx: 60, dy: 0 }), tB, base); assert.equal(far.placement, "rejected"); assert.equal(far.registration.atWindowEdge, true); assert.equal(far.stop, true);
});

test("D-253 composition: alpha is the template's, colour the output's own, the edge outline the cut's; an unpainted core is a hole, never filled", () => {
  const out = simulate(tB, () => [40, 60, 160]), c = R1.compose(out, tB, base), a = alphaOf(c.layers);
  for (let i = 0; i < N; i++) { assert.equal(a[i], c.masks.hole[i] ? 0 : tB.alpha[i]); if (tB.contour[i * 4 + 3]) for (let k = 0; k < 4; k++) assert.equal(c.layers.pants[i * 4 + k], tB.contour[i * 4 + k]); }
  let own = 0; for (let i = 0; i < N; i++) if (tB.core[i] && !tB.contour[i * 4 + 3] && out[i * 4 + 3] >= 128) { own++; for (let k = 0; k < 3; k++) assert.equal(c.layers.pants[i * 4 + k], out[i * 4 + k]); } assert.ok(own > 1000);
  const ctr = []; for (let i = 0; i < N; i++) if (tB.core[i] && !tB.contour[i * 4 + 3]) { const x = i % W, y = (i / W) | 0; let ok = true; for (let d = -8; d <= 8 && ok; d++) if (!tB.core[i + d] || !tB.core[i + d * W]) ok = false; if (ok) { ctr.push(x, y); break; } }
  const holed = simulate(tB, () => [40, 60, 160], { hole: [ctr[0], ctr[1], 6, 6] }), h = R1.compose(holed, tB, base);
  assert.equal(h.measures.holeCorePx, 36); for (let y = ctr[1]; y < ctr[1] + 6; y++) for (let x = ctr[0]; x < ctr[0] + 6; x++) assert.equal(h.layers.pants[(y * W + x) * 4 + 3], 0, "not filled");
});

test("D-253 the fit never depends on the garment's colour: material exactly C's skin composes to the same alpha and passes the same checks as a dark one", () => {
  const dark = R1.compose(simulate(tB, () => [30, 30, 40], { dx: 3, dy: 2 }), tB, base), sk = R1.compose(simulate(tB, MATERIALS.skinNear(skin), { dx: 3, dy: 2 }), tB, base);
  const aD = alphaOf(dark.layers), aS = alphaOf(sk.layers); for (let i = 0; i < N; i++) assert.equal(aS[i], aD[i]);
  const fD = R1.checkItem(w, base, T, tB, dark.layers), fS = R1.checkItem(w, base, T, tB, sk.layers); assert.deepEqual(fS.failed, fD.failed); assert.equal(fS.ok, fD.ok);
});

test("D-253 a top is split by C's arms: what lies over them is the sleeve layer (the production rule)", () => {
  const sleeve = new Uint8ClampedArray(N * 4); for (let y = A.shoulder.y; y < 720; y++) for (let x = 0; x < W; x++) if (base.arms[(y * W + x) * 4 + 3] >= 128) sleeve.set([40, 140, 120, 255], (y * W + x) * 4);
  const top = IP.processItem(w, base, T, "top", NL.overStack([LEGS, recolour(only(1), { h: 175, s: 0.55 }), sleeve])), t = R1.templateFromLayers(top.layers, { category: "top" });
  const c = R1.compose(simulate(t, () => [200, 80, 60]), t, base); let sl = 0;
  for (let i = 0; i < N; i++) { if (c.layers.sleeves[i * 4 + 3]) { sl++; assert.ok(base.arms[i * 4 + 3] >= 128); } if (c.layers.topBody[i * 4 + 3]) assert.ok(base.arms[i * 4 + 3] < 128); } assert.ok(sl > 1000);
});

test("D-253 the plan authorises nothing: at most three calls, a skin-near and a patterned item, frozen templates and C, the cost bound from the documented basis", () => {
  const p = JSON.parse(readFileSync(join(REPO, "tools", "avatar", "fixtures", "northstar-wardrobe", "r1", "r1-plan-v1.json"), "utf8"));
  assert.equal(p.authorisesImageRequest, false); assert.equal(p.activePermissions, 0); assert.match(p.status, /^PLAN ONLY — NOT AUTHORISED/);
  assert.ok(p.calls.length <= 3); assert.deepEqual(p.calls.map((c) => c.category).sort(), ["bottom", "shoes", "top"]);
  assert.ok(p.calls.some((c) => /close to light skin/.test(c.design))); assert.ok(p.calls.some((c) => /houndstooth|pattern/.test(c.design)));
  for (const c of p.calls) { assert.ok(p.frozen.templates.cuts[c.category].canvasSha256.match(/^[0-9a-f]{64}$/)); assert.equal(c.cut, p.frozen.templates.cuts[c.category].cut); }
  const b1 = JSON.parse(readFileSync(join(REPO, "tools", "avatar", "fixtures", "northstar-wardrobe", "batches", "b1-authorisation-v1.json"), "utf8"));
  assert.equal(p.request.model, b1.request.model, "no silent model switch"); assert.equal(p.request.images[1].sha256, b1.request.images[0].sha256, "Image 2 is C");
  const d = p.cost.documented, per = (d.usage.imageInputTokens * d.price.imageInputPerM + d.usage.textInputTokensMax * d.price.textInputPerM + d.usage.imageOutputTokens * d.price.imageOutputPerM) / 1e6;
  assert.equal(p.cost.perCallMax, +per.toFixed(4)); assert.equal(p.cost.totalMax, +(per * p.calls.length).toFixed(4));
  assert.equal(p.frozen.productionBaseline.method, IP.METHOD, "the production baseline is the current method");
  assert.ok(!readdirSync(join(REPO, "tools", "avatar")).some((f) => /send.*r1|r1.*send/i.test(f)), "no send adapter exists for R1");
  assert.equal(R1.R1_REVISION, p.frozen.method.revision);
});

test("D-253 the proof refuses to write inside the repository (its canvases and sheets are C-derived)", () => {
  const r = spawnSync(process.execPath, [join(REPO, "tools", "avatar", "northstar-r1-proof.mjs"), "--out", join(REPO, "tools", "avatar", "build", "r1")], { encoding: "utf8" });
  assert.equal(r.status, 1); assert.match(r.stderr, /REFUSED: --out must be outside the repository/); assert.ok(!existsSync(join(REPO, "tools", "avatar", "build", "r1")));
});
