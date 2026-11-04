// D-269 — the print family's mechanics without C (C, the cut item and TMG-2's planet are private, D-127 §2): the SYNTHETIC control
// motifs have their formats; the size rule keeps the whole visible content, keeps its aspect, fills the box unless the ink cap binds,
// and is one constant for every motif; the placements are fixed data; the fringe measure catches a light matte rim; the module's print
// path reproduces the master's own anchor print on the CI stand-in and leaves the alpha untouched; the study refuses to write in the
// repository. The visual review on C is in docs/decisions/D-269.md (passing these tests is not evidence of visual quality).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as WR from "../../tools/avatar/northstar-wardrobe.mjs";
import * as BC from "../../tools/avatar/northstar-base-figure-c.mjs";
import * as IP from "../../tools/avatar/northstar-item-pilot.mjs";
import * as R1 from "../../tools/avatar/northstar-r1-garment.mjs";
import * as C1 from "../../tools/avatar/northstar-r1-construction.mjs";
import * as S1 from "../../tools/avatar/northstar-r1-similarity.mjs";
import * as TM from "../../tools/avatar/northstar-tee-master.mjs";
import * as TMM from "../../tools/avatar/northstar-tee-material.mjs";
import * as PF from "../../tools/avatar/northstar-tee-print-family.mjs";
import { recolour } from "../../tools/avatar/northstar-wardrobe-poc.mjs";
import * as NL from "../../tools/avatar/r3-northstar-layers.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CHILD_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/API_?KEY/i.test(k)));
const M = PF.controlMotifs(512), [COMPACT, WIDE, TALL] = Object.values(M);

test("D-269 the control motifs: SYNTHETIC, labelled, transparent around, and of the three formats (compact, 3:1, 1:3)", () => {
  assert.deepEqual(Object.keys(M), ["compact (SYNTHETIC, D-264 badge)", "wide (SYNTHETIC 3:1)", "tall (SYNTHETIC 1:3)"]);
  const asp = (im) => { const v = PF.visible(im); return v.box[2] / v.box[3]; };
  assert.ok(Math.abs(asp(COMPACT) - 1) < 0.02); assert.ok(Math.abs(asp(WIDE) - 3) < 0.05); assert.ok(Math.abs(asp(TALL) - 1 / 3) < 0.01);
  for (const im of Object.values(M)) { const v = PF.visible(im); assert.ok(v.box[0] > 0 && v.box[1] > 0 && v.box[0] + v.box[2] < im.w && v.box[1] + v.box[3] < im.h, "a transparent margin"); }
  const h = (im) => createHash("sha256").update(im.px).digest("hex"); assert.equal(h(PF.controlMotifs(512)["wide (SYNTHETIC 3:1)"]), h(WIDE), "deterministic");
});

test("D-269 the size rule: the visible content as large as the box allows, at most RULE.inkShare of the box in ink; aspect kept; nothing cut; one constant", () => {
  assert.deepEqual(PF.RULE, { alphaBox: 8, inkShare: 0.5, samples: 8 }); assert.equal(PF.sizeFor.length, 2, "sizeFor(img, box): no per-motif parameter");
  const box = [78, 78];
  for (const [im, by] of [[COMPACT, "ink"], [WIDE, "box"], [TALL, "box"]]) {
    const z = PF.sizeFor(im, box), p = PF.prepareFor(im, box), v = PF.visible(im), pv = PF.visible(p.img);
    assert.equal(z.limitedBy, by); assert.ok(z.w <= box[0] && z.h <= box[1], "inside the box");
    if (by === "box") assert.ok(z.w === box[0] || z.h === box[1], "the box binds: one side fills it");
    assert.ok(z.scale * z.scale * v.ink <= PF.RULE.inkShare * box[0] * box[1] * 1.0001, "the ink cap holds");
    assert.ok(Math.abs(z.w / z.h - v.box[2] / v.box[3]) < 0.06, "aspect kept");
    // the whole illustration: the prepared print is the visible content, edge to edge, with its ink scaled by s^2 (nothing dropped)
    assert.deepEqual([p.img.w, p.img.h], [z.w, z.h]); assert.ok(pv.box[2] >= z.w - 1 && pv.box[3] >= z.h - 1);
    assert.ok(Math.abs(pv.ink / (v.ink * (z.w / v.box[2]) * (z.h / v.box[3])) - 1) < 0.03, "ink kept");
  }
  // against D-267's rule (the square around the alpha box at the anchor width): a wide motif grows, a compact one does not grow past it
  const bw = 259, anchor = Math.round(TM.SPEC.anchors["chest-left"].width * bw), g = { bbox: [331, 462, 692, 827], bodyWidthBelowSleeves: bw, height: 366 }, left = PF.placementBox(g, "chest-left");
  const orig = (im) => PF.visible(TMM.preparePrint(im, bw)).box[2];
  assert.equal(orig(WIDE), anchor); assert.ok(PF.sizeFor(WIDE, [left[2], left[3]]).w > orig(WIDE)); assert.ok(PF.sizeFor(COMPACT, [left[2], left[3]]).w <= anchor + 1);
});

test("D-269 the placements: fixed data (fractions of the cut), two boxes; on C's geometry they are the recorded boxes", () => {
  assert.ok(Object.isFrozen(PF.PLACEMENTS)); assert.deepEqual(Object.keys(PF.PLACEMENTS), ["chest-left", "chest-center"]);
  assert.deepEqual([PF.PLACEMENTS["chest-left"].x, PF.PLACEMENTS["chest-left"].y], [TM.SPEC.anchors["chest-left"].x, TM.SPEC.anchors["chest-left"].y], "chest-left is centred on the master's own anchor");
  const g = { bbox: [331, 462, 692, 827], bodyWidthBelowSleeves: 259, height: 366 };
  assert.deepEqual(PF.placementBox(g, "chest-left"), [524, 533, 78, 78]); assert.deepEqual(PF.placementBox(g, "chest-center"), [437, 537, 150, 135]);
  assert.equal(PF.MARGIN, 10); assert.deepEqual(PF.APP_SIZES, [[110, 165], [52, 78]]);
});

test("D-269 the fringe measure: a premultiplied resample has no light rim; a light matte rim is caught", () => {
  for (const im of Object.values(M)) assert.equal(PF.fringe(PF.prepareFor(im, [78, 78]).img).ok, true);
  const p = PF.prepareFor(WIDE, [150, 135]).img, rim = { w: p.w, h: p.h, px: Uint8ClampedArray.from(p.px) };
  for (let i = 0; i < p.w * p.h; i++) { const a = p.px[i * 4 + 3]; if (a >= 8 && a < 248) rim.px.set([250, 250, 250, a], i * 4); }
  assert.equal(PF.fringe(rim).ok, false);
  assert.ok(PF.contrast([24, 34, 74], [38, 50, 92]) < 1.5 && PF.contrast([24, 34, 74], [250, 240, 220]) > 10, "the contrast measure orders the obvious cases");
});

test("D-269 on the CI stand-in: the module's print path reproduces the master's anchor print byte for byte and leaves the alpha untouched", () => {
  const w = WR.buildWardrobe(), L = w.base.layers, A = w.anchors, Mf = w.fg.master, { W, N } = WR;
  const LEGS = (() => { const legs = new Uint8ClampedArray(L.pants); for (let i = 0; i < (A.crotchY + 10) * W; i++) legs[i * 4 + 3] = 0; return NL.overStack([Mf, recolour(legs, { h: 33, s: 0.51, vScale: 1.3 })]); })();
  const base = BC.prepareBase(w, LEGS), T = BC.templatesC(w, base, { revision: "d213" });
  const only = (k, P = LEGS) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) if (base.sep.lab[i] === k) o.set(P.subarray(i * 4, i * 4 + 4), i * 4); return o; };
  const top = IP.processItem(w, base, T, "top", NL.overStack([LEGS, recolour(only(1), { h: 175, s: 0.55 })]));
  const t = R1.templateFromLayers(top.layers, { category: "top" }), cl = C1.constructionLayer(t, base, "tee-hip"), master = TM.buildMaster(t, { layers: top.layers });
  const bw = S1.geometry(t.core).bodyWidthBelowSleeves;
  const pr = TMM.preparePrint(PF.controlMotifs(256)["compact (SYNTHETIC, D-264 badge)"], bw), body = [180, 60, 60];
  const a = TM.render(master, t, base, cl.band, { body, print: { img: pr, anchor: "chest-left" } }), plain = TM.render(master, t, base, cl.band, { body }), b = PF.placePrint(master, t, base, plain.layer, pr, a.placed[0].box);
  let diff = 0, alpha = 0; for (let i = 0; i < N * 4; i++) if (a.layer[i] !== b.layer[i]) diff++; for (let i = 0; i < N; i++) if (b.layer[i * 4 + 3] !== plain.layer[i * 4 + 3]) alpha++;
  assert.equal(diff, 0); assert.equal(alpha, 0); assert.ok(b.footprint.length > 0);
});

test("D-269 the study refuses an --out inside the repository (it shows C) before reading anything private", () => {
  const r = spawnSync(process.execPath, [join(REPO, "tools", "avatar", "northstar-tee-print-family.mjs"), "--out", join(REPO, "tools", "avatar", "build", "d269-in-repo")], { cwd: REPO, env: CHILD_ENV, encoding: "utf8", windowsHide: true, timeout: 60000 });
  assert.equal(r.status, 1); assert.match(r.stderr, /--out must be outside the repository/);
});
