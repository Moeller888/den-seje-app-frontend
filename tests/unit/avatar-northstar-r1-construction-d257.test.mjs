// D-257 — r1-c1 (tools/avatar/northstar-r1-construction.mjs) on the CI stand-in (C and R1-1 are private, D-127 §2): the cut's
// construction layer (bands, edge lines, hem stitch) made by fixed rules; the bleed canvas a call would send; and the checks that
// decide whether a generated material can be used — coverage before crop, the trim edge by shape, holes never hidden. Also: the
// R1C plan authorises nothing. The illustration on R1-1 and the closure of D-255 are in docs/decisions/D-257.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as WR from "../../tools/avatar/northstar-wardrobe.mjs";
import * as BC from "../../tools/avatar/northstar-base-figure-c.mjs";
import * as IP from "../../tools/avatar/northstar-item-pilot.mjs";
import * as R1 from "../../tools/avatar/northstar-r1-garment.mjs";
import * as C1 from "../../tools/avatar/northstar-r1-construction.mjs";
import { recolour } from "../../tools/avatar/northstar-wardrobe-poc.mjs";
import * as NL from "../../tools/avatar/r3-northstar-layers.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const w = WR.buildWardrobe(), L = w.base.layers, A = w.anchors, M = w.fg.master, { W, N } = WR;
const LEGS = (() => { const legs = new Uint8ClampedArray(L.pants); for (let i = 0; i < (A.crotchY + 10) * W; i++) legs[i * 4 + 3] = 0; return NL.overStack([M, recolour(legs, { h: 33, s: 0.51, vScale: 1.3 })]); })();
const base = BC.prepareBase(w, LEGS), T = BC.templatesC(w, base, { revision: "d213" });
const only = (k, P = LEGS) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) if (base.sep.lab[i] === k) o.set(P.subarray(i * 4, i * 4 + 4), i * 4); return o; };
const sleeve = new Uint8ClampedArray(N * 4); for (let y = A.shoulder.y; y < 720; y++) for (let x = 0; x < W; x++) if (base.arms[(y * W + x) * 4 + 3] >= 128) sleeve.set([40, 140, 120, 255], (y * W + x) * 4);
const top = IP.processItem(w, base, T, "top", NL.overStack([LEGS, recolour(only(1), { h: 175, s: 0.55 }), sleeve]));
const t = R1.templateFromLayers(top.layers, { category: "top", cut: "stand-in-tee" }), cl = C1.constructionLayer(t, base, "tee-hip"), bc = C1.bleedCanvas(t, cl);
// the inward distance from the neck and cuff edges, uncapped (the construction layer's own maps stop at the band width + 2)
const DIST = Object.fromEntries([["neck", 1], ["cuff", 2]].map(([n, k]) => { const d = new Int16Array(N).fill(-1), q = []; for (let i = 0; i < N; i++) if (cl.seg[i] === k) { d[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) { const i = q[h]; if (d[i] >= 40) continue; for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < N && t.core[j] && d[j] < 0) { d[j] = d[i] + 1; q.push(j); } } return [n, d]; }));
// a material over the whole bleed shape: body colour, trim colour on the pixels within `trim` px of the neck and cuff edges
const material = (trim) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) if (bc.bleedMask[i]) o.set([230, 170, 120, 255], i * 4);
  for (let i = 0; i < N; i++) { const dn = DIST.neck[i], dc = DIST.cuff[i]; if ((dn >= 0 && dn < trim.neck) || (dc >= 0 && dc < trim.cuff)) o.set([200, 120, 80, 255], i * 4); }
  // the trim also runs out through the bleed next to its edge (as the canvas shows it)
  const g = WR.maskOps.dilate(Uint8Array.from(cl.seg, (v) => (v === 1 || v === 2 ? 1 : 0)), cl.spec.bleed); for (let i = 0; i < N; i++) if (g[i] && !t.core[i] && bc.bleedMask[i]) o.set([200, 120, 80, 255], i * 4); return o; };

test("D-257 r1-c1 is a hypothesis beside r1-v1, s1 and d240; the cut's construction constants are per cut", () => {
  assert.equal(C1.REVISION, "r1-c1"); assert.equal(R1.R1_REVISION, "r1-v1"); assert.equal(IP.METHOD, "d240");
  assert.deepEqual(C1.CUT_SPECS["tee-hip"], { neckBand: 11, cuffBand: 9, hemStitch: 7, bleed: 16 }); assert.throws(() => C1.constructionLayer(t, base, "unknown-cut"), /no construction spec/);
});

test("D-257 the construction layer: neck, cuff, hem and outer edges by fixed rules; bands inside the core; lines only on the cut", () => {
  const n = [0, 0, 0, 0, 0]; for (let i = 0; i < N; i++) n[cl.seg[i]]++; assert.ok(n[1] > 0 && n[2] > 0 && n[3] > 0 && n[4] > 0, JSON.stringify(n));
  for (let i = 0; i < N; i++) { if (cl.band[i]) assert.ok(t.core[i]); if (cl.lines[i * 4 + 3]) assert.ok(t.alpha[i]); if (cl.seg[i] === 2) assert.ok(base.arms[i * 4 + 3] >= 128, "a cuff edge lies on the sleeve, facing C's arm"); }
  assert.ok(cl.counts.neckBandPx > 0 && cl.counts.cuffBandPx > 0);
});

test("D-257 the bleed canvas: the cut grown by the bleed, two tones (trim darker), no outline", () => {
  let body = [], trim = []; for (let i = 0; i < N; i++) { assert.equal(bc.canvas[i * 4 + 3] === 255, !!bc.bleedMask[i]); if (!bc.bleedMask[i]) continue; const g = bc.canvas[i * 4];
    assert.ok(g === bc.canvas[i * 4 + 1] && g === bc.canvas[i * 4 + 2]); assert.ok(g > 40, "no ink-dark outline pixel"); (t.core[i] && cl.band[i] ? trim : t.core[i] ? body : []).push(g); }
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length; assert.ok(mean(trim) < mean(body) - 30);
  let grown = 0; for (let i = 0; i < N; i++) if (bc.bleedMask[i] && !t.core[i]) grown++; assert.ok(grown > 1000, "the bleed is real");
});

test("D-257 coverage before crop: a material that stops at the silhouette fails; one over the bleed passes with a real margin", () => {
  const atCore = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) if (t.core[i]) atCore.set([230, 170, 120, 255], i * 4);
  assert.equal(C1.coverage(atCore, t, cl).ok, false);
  const c = C1.coverage(material({ neck: 11, cuff: 9 }), t, cl); assert.equal(c.ok, true, JSON.stringify(c)); for (const v of Object.values(c.marginP5)) assert.ok(v === null || v >= 4, JSON.stringify(c.marginP5));
});

test("D-257 the trim edge is found by shape: on the band it passes; 6 px wider it fails with the offset measured", () => {
  const ok = C1.trimOffset(material({ neck: 11, cuff: 9 }), t, cl); assert.equal(ok.ok, true, JSON.stringify(ok)); assert.ok(Math.abs(ok.neck.medianOffset) <= 1 && Math.abs(ok.cuff.medianOffset) <= 1, JSON.stringify(ok));
  const wide = C1.trimOffset(material({ neck: 17, cuff: 15 }), t, cl); assert.equal(wide.ok, false); assert.ok(wide.neck.medianOffset >= 5 && wide.cuff.medianOffset >= 5, JSON.stringify(wide));
});

test("D-257 composition never hides a hole, not even under a construction line; an own outline along the edge is counted", () => {
  const m = material({ neck: 11, cuff: 9 }); let k = -1; for (let i = 0; i < N; i++) if (t.core[i] && cl.lines[i * 4 + 3] && t.contour[i * 4 + 3] === 0) { k = i; break; }
  assert.ok(k >= 0); m[k * 4 + 3] = 0; const c = C1.composeC1(m, t, cl, base); assert.equal(c.ok, false); assert.equal(c.holes, 1); assert.equal(c.holesUnderLines, 1);
  const outl = material({ neck: 11, cuff: 9 }), g = WR.maskOps.dilate(Uint8Array.from(t.core, (v) => (v ? 0 : 1)), 5); for (let i = 0; i < N; i++) if (t.core[i] && g[i]) outl.set([20, 15, 12, 255], i * 4);
  assert.equal(C1.secondOutline(outl, t, cl).ok, false); assert.equal(C1.secondOutline(material({ neck: 11, cuff: 9 }), t, cl).ok, true);
});

test("D-257 the R1C plan authorises nothing: one new call id, a separate budget, the frozen canvas and prompt, no adapter", () => {
  const p = JSON.parse(readFileSync(join(REPO, "tools", "avatar", "fixtures", "northstar-wardrobe", "r1", "r1c-plan-v1.json"), "utf8"));
  const a = JSON.parse(readFileSync(join(REPO, "tools", "avatar", "fixtures", "northstar-wardrobe", "r1", "r1-authorisation-v1.json"), "utf8"));
  assert.equal(p.authorisesImageRequest, false); assert.equal(p.activePermissions, 0); assert.match(p.status, /^PLAN ONLY — NOT AUTHORISED/);
  assert.equal(p.call.callId, "R1C-1-top-tee-hip-apricot-bleed"); assert.ok(!a.calls.some((e) => e.callId === p.call.callId), "a new call id");
  assert.equal(p.cost.calls, 1); assert.match(p.notReused, /no D-255 permission/);
  const prompt = p.promptFrame.replace("{noun}", p.call.noun).replace("{design}", p.call.design); assert.equal(createHash("sha256").update(prompt, "utf8").digest("hex"), p.call.prompt.sha256); assert.ok(!/[{}]|undefined/.test(prompt));
  assert.match(prompt, /Do not draw any outline/); assert.match(p.frozen.canvas.sha256, /^[0-9a-f]{64}$/); assert.equal(p.frozen.cut.spec.bleed, C1.CUT_SPECS["tee-hip"].bleed);
  const d = p.cost.documented, per = (d.usage.imageInputTokens * d.price.imageInputPerM + d.usage.textInputTokensMax * d.price.textInputPerM + d.usage.imageOutputTokens * d.price.imageOutputPerM) / 1e6; assert.equal(p.cost.perCallMax, +per.toFixed(4));
  assert.ok(!readdirSync(join(REPO, "tools", "avatar")).some((f) => /send.*r1c|r1c.*send/i.test(f)), "no send adapter exists for R1C");
});

test("D-257 the illustration refuses to write inside the repository", () => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/API_?KEY/i.test(k)));
  const r = spawnSync(process.execPath, [join(REPO, "tools", "avatar", "northstar-r1-construction-demo.mjs"), "--out", join(REPO, "tools", "avatar", "build", "d257")], { encoding: "utf8", env });
  assert.equal(r.status, 1); assert.match(r.stderr, /REFUSED: --out must be outside the repository/);
});
