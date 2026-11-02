// D-297 — master v4 and the second shoe evaluation on SYNTHETIC and constructed inputs (C is private, D-127 §2): v1–v3 unchanged and
// v4 separate; splitAlong tells a drawn line from a zigzag; v4 keeps the lace and toe-cap weight and grain; the collar check passes
// a 1 px collar change and fails a visible one, a hole and a slit; the halo distance rule removes a glow that an alpha floor leaves and
// leaves a crisp drawing untouched; the source line check rejects smoothed or enlarged copies and a lost seam. Passing these tests
// approves no shoe and says nothing of a real source's quality; SS-1 stays rejected (D-294, D-296).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as WR from "../../tools/avatar/northstar-wardrobe.mjs";
import * as SM from "../../tools/avatar/northstar-shoe-master.mjs";
import * as SS from "../../tools/avatar/northstar-shoe-source.mjs";
import * as E2 from "../../tools/avatar/northstar-shoe-eval-v2.mjs";
import * as R1 from "../../tools/avatar/northstar-r1-garment.mjs";

const { W, N } = WR, sha = (b) => createHash("sha256").update(b).digest("hex");
const tpl = (L) => R1.templateFromLayers({ shoes: L }, { category: "shoes", covering: "closed-footwear", cut: "synthetic" });
const s1 = SS.place(SS.synthShoe(1)), seeds1 = SS.cropSeedsAt1(SS.SYNTH_SEEDS), NAVY = SM.designs()["contrast navy + white (SYNTHETIC)"];
const master = (sp, L = s1) => SM.buildShoeMaster(L, tpl(L), { ...sp, seeds: seeds1 });
const mc4 = master(SM.SPEC_V4);

test("D-297 v1–v3 render exactly as before D-297 (hashes from main at 3c97154); v4 is a separate revision", () => {
  const before = { SPEC: "b55c9b2ad4fc4181601e7da1b22002979fde2d18fcd3d2bc1c13ab6f3092718d", SPEC_V2: "5acbcb0b4add369680f91fc4d15b9bd86d69415d9aae827c012fe001accdadd7", SPEC_V3: "4af092c30c27aadb0a816df18181995923815c1c4694efb81477e80a2b47a55d" };
  for (const [v, h] of Object.entries(before)) assert.equal(sha(SM.renderShoe(master(SM[v]), s1, NAVY)), h, v + " changed");
  assert.equal(SM.SPEC_V4.revision, "shoe-master-v4-line"); assert.equal(SM.SPEC_V4.lineBlend, "nearer"); assert.deepEqual([...SM.SPEC_V4.lineStep], [0.35, 0.65]);
  assert.equal(SM.SPEC_V3.lineBlend, undefined); assert.notEqual(SM.SPEC_V3.revision, SM.SPEC_V4.revision);
});

test("D-297 splitAlong: the drawing's own lines barely vary along themselves; a zigzagged seam is caught", () => {
  const own = E2.lineMeasures(mc4, s1).splitAlong, zig = Uint8ClampedArray.from(s1);
  for (let i = 0; i < N; i++) if (mc4.edge.w[i] >= 0.9 && !mc4.contour[i] && (mc4.group[i] === 0 || mc4.group[i] === 1) && ((i % W) + ((i / W) | 0)) % 2 === 0) for (let c = 0; c < 3; c++) zig[i * 4 + c] = Math.round(zig[i * 4 + c] * 0.4);
  const z = E2.lineMeasures(mc4, zig).splitAlong; assert.ok(own < 0.1, "drawing " + own); assert.ok(z > own + 0.3, "zigzag " + z + " vs drawing " + own);
});

test("D-297 the chain: v4 keeps each side's own line (no split beyond v2), the lace and toe weight and the grain; v3's heavier lines fail", () => {
  const v2 = SM.renderShoe(master(SM.SPEC_V2), s1, NAVY), v3 = SM.renderShoe(master(SM.SPEC_V3), s1, NAVY), v4 = SM.renderShoe(mc4, s1, NAVY), orig = SM.renderShoe(mc4, s1, SM.originalDesign(mc4, s1));
  const a2 = E2.lineMeasures(mc4, v2), a4 = E2.lineMeasures(mc4, v4); assert.ok(a4.splitAlong <= a2.splitAlong + 0.005, "v4 " + a4.splitAlong + " vs v2 " + a2.splitAlong);
  for (const g of ["laces", "toe"]) { const k = a4.lineContrast[g] / a2.lineContrast[g]; assert.ok(k >= E2.LINE_RULE.weightBand[0] && k <= E2.LINE_RULE.weightBand[1], g + " x" + k); assert.ok(a4.grain[g] <= E2.LINE_RULE.grainMax * a2.grain[g] + 0.002, g + " grain"); }
  const r4 = E2.chainLineCheck(mc4, s1, orig, { navy: { variant: v4, reference: v2 } }); assert.equal(r4.ok, true, r4.problems.join("; "));
  const r3 = E2.chainLineCheck(mc4, s1, orig, { navy: { variant: v3, reference: v2 } }); assert.equal(r3.ok, false); assert.match(r3.problems.join(" "), /line weight|grain/);
});

test("D-297 the collar check: 1 px collar changes pass; 4 px into the leg, 4 px lower, a hole and a slit fail (a CONSTRUCTED shoe and leg)", () => {
  const box = (x0, y0, x1, y1, P = new Uint8ClampedArray(N * 4)) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) P.set([120, 100, 80, 255], (y * W + x) * 4); return P; };
  const ref = box(400, 1360, 600, 1480), base = { body: box(450, 1200, 550, 1470), arms: new Uint8ClampedArray(N * 4) };
  const hid = (P) => { const h = new Uint8Array(N); for (let i = 0; i < N; i++) h[i] = base.body[i * 4 + 3] && P[i * 4 + 3] >= 128 ? 1 : 0; return h; }, check = (c) => E2.collarCheck(c, ref, base, { ref: hid(ref), cand: hid(c) });
  const cut = (P, x0, y0, x1, y1) => { const o = Uint8ClampedArray.from(P); for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) o[(y * W + x) * 4 + 3] = 0; return o; };
  assert.equal(check(ref).ok, true); for (const c of [box(400, 1359, 600, 1480), cut(ref, 400, 1360, 600, 1361)]) assert.equal(check(c).ok, true, JSON.stringify(check(c).measures));
  const bad = { "4 px into the leg": box(400, 1356, 600, 1480), "4 px lower": cut(ref, 400, 1360, 600, 1364), "a hole": cut(ref, 490, 1372, 494, 1376), "a slit": cut(ref, 420, 1400, 423, 1440) };
  for (const [n, c] of Object.entries(bad)) assert.equal(check(c).ok, false, n + " " + JSON.stringify(check(c).measures));
  assert.match(check(bad["4 px into the leg"]).problems.join(" "), /painted over C.s ankle/); assert.match(check(bad["a slit"]).problems.join(" "), /slit or gap/);
});

test("D-297 the halo: an alpha floor of 16 leaves a faint glow; the distance rule removes it and leaves a crisp drawing untouched", () => {
  const syn = SS.synthShoe(4), n = syn.w * syn.h, dist = new Int16Array(n).fill(9999), q = [], glow = { w: syn.w, h: syn.h, px: Uint8ClampedArray.from(syn.px) };
  for (let i = 0; i < n; i++) if (syn.px[i * 4 + 3] >= 250) { dist[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) { const i = q[h], x = i % syn.w; for (const j of [i - 1, i + 1, i - syn.w, i + syn.w]) { if (j < 0 || j >= n || Math.abs((j % syn.w) - x) > 1 || dist[j] <= dist[i] + 1) continue; dist[j] = dist[i] + 1; q.push(j); } }
  for (let i = 0; i < n; i++) if (!syn.px[i * 4 + 3] && dist[i] <= 24) glow.px.set([245, 238, 225, Math.round(60 * (1 - dist[i] / 25))], i * 4);
  const truth = SS.place(SS.downscale(syn)), inAv = (rule) => E2.haloInAvatar(SS.place(SS.downscale(rule ? E2.dropHalo(glow, rule) : glow)), truth).haloPx;
  assert.ok(inAv(null) > 1000); assert.ok(inAv({ kind: "floor", alpha: 16 }) > 500, "the floor leaves the glow"); assert.equal(inAv(E2.HALO_RULE), 0);
  assert.deepEqual(E2.dropHalo(syn).px, syn.px, "a crisp drawing loses no antialiasing");
});

test("D-297 the source line check: the drawing at K passes; a smoothed or enlarged copy fails; a lost toe seam fails", () => {
  const s4 = SS.synthShoe(4), check = (img) => { const L = SS.place(SS.downscale(img)); let mc; try { mc = master(SM.SPEC_V4, L); } catch (e) { return { ok: false, problems: ["the seeds no longer fit: " + e.message] }; } return E2.sourceLineCheck(img, mc, L, mc4, s1, SS.detailVerdict(SS.detailMeasures(img))); };
  assert.equal(check(s4).ok, true, check(s4).problems.join("; "));
  const blur = { w: s4.w, h: s4.h, px: new Uint8ClampedArray(s4.px.length) }; for (let y = 0; y < s4.h; y++) for (let x = 0; x < s4.w; x++) for (let c = 0; c < 4; c++) { let s = 0, k = 0; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= s4.w || yy >= s4.h) continue; s += s4.px[(yy * s4.w + xx) * 4 + c]; k++; } blur.px[(y * s4.w + x) * 4 + c] = Math.round(s / k); }
  assert.equal(check(blur).ok, false, "smoothed"); assert.equal(check(SS.layoutCanvas(s1)).ok, false, "enlarged");
  const toe = SM.GROUPS.indexOf("toe"), fill = SM.originalDesign(mc4, s1).toe, lost = { w: s4.w, h: s4.h, px: Uint8ClampedArray.from(s4.px) };
  for (let i = 0; i < N; i++) { if (mc4.edge.w[i] < 0.3 || mc4.contour[i] || (mc4.group[i] !== toe && mc4.edge.other[i] !== toe)) continue; const x = (i % W) - SS.CROP.x0, y = ((i / W) | 0) - SS.CROP.y0; if (x < 0 || y < 0 || x >= SS.CROP.w || y >= SS.CROP.h) continue;
    for (let dy = 0; dy < SS.K; dy++) for (let dx = 0; dx < SS.K; dx++) { const j = ((y * SS.K + dy) * s4.w + x * SS.K + dx) * 4; if (lost.px[j + 3]) lost.px.set(fill, j); } }
  const r = check(lost); assert.equal(r.ok, false, "seam lost"); assert.match(r.problems.join(" "), /a lost seam|seeds no longer fit/);
});
