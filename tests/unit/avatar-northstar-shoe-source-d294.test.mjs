// D-294 — the tight shoe source's geometry and chain on SYNTHETIC and constructed inputs (C is private, D-127 §2): the fixed mapping
// and the premultiplied downscale (no rim from a transparent background), the detail rule that tells an enlargement from a drawing,
// the geometry rules that reject another scale, a shift, skin and extra pieces, the seeds at K, the chain at K on the synthetic shoe,
// and the evaluator's refusals. Passing these tests approves no shoe and says nothing of a real source's quality.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as WR from "../../tools/avatar/northstar-wardrobe.mjs";
import * as SM from "../../tools/avatar/northstar-shoe-master.mjs";
import * as SS from "../../tools/avatar/northstar-shoe-source.mjs";
import * as R1 from "../../tools/avatar/northstar-r1-garment.mjs";
import { splitLines } from "../../tools/avatar/northstar-shoe-edge-study.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."), { W, N } = WR;
const CHILD_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/API_?KEY/i.test(k)));
const PLAN = JSON.parse(readFileSync(join(REPO, "tools/avatar/fixtures/northstar-wardrobe/shoe-source/ss-plan-v1.json"), "utf8"));
const tpl = (L) => R1.templateFromLayers({ shoes: L }, { category: "shoes", covering: "closed-footwear", cut: "synthetic" });

test("D-294 the fixed geometry: CROP x K is the call's size, the shoes' halves split at x 512, the plan carries the same numbers", () => {
  assert.deepEqual([SS.K, SS.CROP, SS.OUT, SS.SPLIT_X], [4, { x0: 320, y0: 1270, w: 384, h: 256 }, { w: 1536, h: 1024 }, 512]);
  assert.equal(PLAN.request.parameters.size, "1536x1024"); assert.deepEqual(PLAN.geometry.crop, SS.CROP); assert.equal(PLAN.geometry.k, 4);
  assert.equal(PLAN.authorisesImageRequest, false); assert.equal(PLAN.request.images.length, 1); assert.ok(!/C \(the base figure\)/.test(PLAN.request.images[0].what));
  assert.deepEqual(PLAN.acceptance.geometry, { ...SS.GEOMETRY_RULE }); assert.deepEqual(PLAN.acceptance.detail, { ...SS.DETAIL_RULE });
});

test("D-294 the premultiplied downscale: a transparent background leaves no rim; K x K of one colour is that colour; place and tiles round-trip", () => {
  const img = { w: 8, h: 4, px: new Uint8ClampedArray(8 * 4 * 4) };
  for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) img.px.set(x < 2 ? [60, 40, 30, 255] : [255, 255, 255, 0], (y * 8 + x) * 4);   // dark shoe edge on a WHITE transparent background
  const d = SS.downscale(img); assert.deepEqual([d.w, d.h], [2, 1]); assert.deepEqual([...d.px.subarray(0, 4)], [60, 40, 30, 128], "the colour stays the shoe's, the alpha is the coverage");
  const s4 = SS.synthShoe(4), back = SS.untile({ left: SS.tileOf(s4, "left"), right: SS.tileOf(s4, "right") }); assert.deepEqual(back.px, s4.px);
  const placed = SS.place(SS.downscale(s4)); let n = 0; for (let i = 0; i < N; i++) if (placed[i * 4 + 3]) { n++; const x = i % W, y = (i / W) | 0; assert.ok(x >= SS.CROP.x0 && x < SS.CROP.x0 + SS.CROP.w && y >= SS.CROP.y0 && y < SS.CROP.y0 + SS.CROP.h); } assert.ok(n > 1000);
});

test("D-294 the detail rule: a drawing at K passes; its bilinear enlargement (an upscaled copy) is rejected", () => {
  const s1 = SS.synthShoe(1), s4 = SS.synthShoe(4); assert.equal(SS.detailVerdict(SS.detailMeasures(s4)).ok, true);
  const big = SS.layoutCanvas(SS.place(s1)), m = SS.detailMeasures(big), v = SS.detailVerdict(m);
  assert.equal(v.ok, false, JSON.stringify(m)); assert.ok(m.alphaTransitionPx >= 3); assert.match(v.problems.join(" "), /an enlargement/);
});

test("D-294 the geometry rules reject another scale (the R1 problem), a shift, extra pieces; the reference itself passes", () => {
  // a pair: the synthetic shoe and its mirror image in the right half (around x = 512)
  const pair = (P) => { const o = new Uint8ClampedArray(P); for (let i = 0; i < N; i++) { const x = i % W; if (x < SS.SPLIT_X || !P[(i - x + (2 * SS.SPLIT_X - 1 - x)) * 4 + 3]) continue; const j = i - x + (2 * SS.SPLIT_X - 1 - x); o.set(P.subarray(j * 4, j * 4 + 4), i * 4); } return o; };
  const ref = pair(SS.place(SS.downscale(SS.synthShoe(4)))); assert.equal(SS.geometryCheck(ref, ref).ok, true, JSON.stringify(SS.geometryCheck(ref, ref).problems));
  const scaled = new Uint8ClampedArray(N * 4); const cx = SS.CROP.x0 + 96, cy = SS.CROP.y0 + 130;
  for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0, sx = Math.round(cx + (x - cx) / 1.08), sy = Math.round(cy + (y - cy) / 1.08); if (ref[(sy * W + sx) * 4 + 3]) scaled.set(ref.subarray((sy * W + sx) * 4, (sy * W + sx) * 4 + 4), i * 4); }
  assert.match(SS.geometryCheck(scaled, ref).problems.join(" "), /size ratio/);
  assert.match(SS.geometryCheck(ref, ref, { shift: { dx: 3, dy: 0 } }).problems.join(" "), /translation/);
  const extra = new Uint8ClampedArray(ref); for (let y = 1300; y < 1320; y++) for (let x = 650; x < 670; x++) extra.set([10, 10, 10, 255], (y * W + x) * 4);
  assert.match(SS.geometryCheck(extra, ref).problems.join(" "), /separate painted pieces/);
  const moved = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0, j = (y + 2) * W + x - 1; if (j >= 0 && j < N && x >= 1) moved.set(ref.subarray(j * 4, j * 4 + 4), i * 4); }
  const reg = SS.register(moved, ref); assert.deepEqual([reg.dx, reg.dy], [-1, 2], JSON.stringify(reg));
});

test("D-294 the seeds at K land in the middle of their K x K block, per side; the cut's 22 seeds split 11 / 11", () => {
  const l = SS.seedsFor("left"), r = SS.seedsFor("right"), n = (s) => Object.values(s).flat().length; assert.deepEqual([n(l), n(r)], [11, 11]);
  assert.deepEqual(l.sole[0], [4 * (404 - 320) + 2, 4 * (1465 - 1270) + 2]); assert.deepEqual(r.sole[0], [4 * (618 - 320) - 768 + 2, 4 * (1465 - 1270) + 2]);
  const sp = SS.specAtK(SM.SPEC_V3, "left"); assert.deepEqual([sp.inkRadius, sp.volumeRadius, sp.edge.blendRadius], [16, 24, 20]);
});

test("D-294 the chain at K on the synthetic shoe: the alpha is the drawing's own after the downscale; v2 at K keeps a split line split, v3 at K does not", () => {
  const s4 = SS.synthShoe(4), seedsK = { left: SS.cropSeedsAtK(SS.SYNTH_SEEDS, "left"), right: null }, d = SM.designs()["contrast navy + white (SYNTHETIC)"];
  const plain = SS.renderAtK(s4, SM.SPEC_V2, null, { seedsBySide: seedsK, templateOf: tpl }), ideal = SS.place(SS.downscale(s4)); assert.deepEqual(plain, ideal);
  const v2 = SS.renderAtK(s4, SM.SPEC_V2, d, { seedsBySide: seedsK, templateOf: tpl }), v3 = SS.renderAtK(s4, SM.SPEC_V3, d, { seedsBySide: seedsK, templateOf: tpl });
  for (let i = 3; i < N * 4; i += 4) { assert.equal(v2[i], ideal[i]); assert.equal(v3[i], ideal[i]); }
  const s1 = SS.place(SS.synthShoe(1)), m3 = SM.buildShoeMaster(s1, tpl(s1), { ...SM.SPEC_V3, seeds: SS.cropSeedsAt1(SS.SYNTH_SEEDS) });
  assert.ok(splitLines(m3, v2).splitShare > 0.4, "the opacity of the source does not fix the master's split"); assert.ok(splitLines(m3, v3).splitShare < 0.2);
});

test("D-294 the evaluator refuses an --out inside the repository and a source of the wrong size", () => {
  const ev = join(REPO, "tools/avatar/northstar-shoe-source-evaluate.mjs");
  const a = spawnSync(process.execPath, [ev, "--out", join(REPO, "tools/avatar/build/d294"), "--phase", "check", "--source", join(REPO, "package.json")], { encoding: "utf8", env: CHILD_ENV }); assert.equal(a.status, 1); assert.match(a.stderr, /REFUSED: --out must be outside the repository/);
  const src = readFileSync(ev, "utf8"); assert.match(src, /the source must be a/); assert.match(src, /SMOOTHING_GUARD/); assert.match(src, /REJECTED/);
});

test("D-296 the evaluator's --diagnostic-after-reject only labels: it excludes --rehearsal and every later output carries the check's rejection", () => {
  const src = readFileSync(join(REPO, "tools/avatar/northstar-shoe-source-evaluate.mjs"), "utf8");
  assert.match(src, /--rehearsal and --diagnostic-after-reject exclude each other/); assert.match(src, /verdictOfTheCheck: c\.verdict/); assert.match(src, /AFVIST — DIAGNOSTISK VISNING EFTER AFVISNING/);
  for (const k of ["maxPaintOverAnklePx: 40", "maxNewlyExposedFootPx: 20", "maxSkinPx: 3", "minShoeIoU: 0.95"]) assert.match(readFileSync(join(REPO, "tools/avatar/northstar-shoe-source.mjs"), "utf8"), new RegExp(k.replace(".", "\.")), "the D-294 rule is unchanged: " + k);
});
