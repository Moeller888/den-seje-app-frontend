// D-232: the three limits D-231 found, corrected without an image call — each with its fault stimulus on the CI stand-in (C is
// private, D-127 §2) and with the faults the old rule caught still caught: (1) a limb leaving a hem or a cuff at its end (the
// limb's redrawn contour hanging below it leaves the item; FIT-6v2 reports the exit, a strip along the garment still fails);
// (2) extraction of skin-like and dark colours (a skin shadow shifts the hue no more than C's own shading — orange fabric is
// fabric; G-2 counts a base pixel unchanged only with its chroma — dark olive is no grey remnant, a real remnant still counts);
// (3) seam-contract-v2's hip lanes (top ≥ + 6, bottoms ≤ + 6). The runs on C are recorded in seam-limits-results-d232.json.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as WR from "../../tools/avatar/northstar-wardrobe.mjs";
import * as BF from "../../tools/avatar/northstar-base-figure.mjs";
import * as BC from "../../tools/avatar/northstar-base-figure-c.mjs";
import * as IP from "../../tools/avatar/northstar-item-pilot.mjs";
import * as ST from "../../tools/avatar/northstar-seam-templates.mjs";
import { recolour } from "../../tools/avatar/northstar-wardrobe-poc.mjs";
import * as NL from "../../tools/avatar/r3-northstar-layers.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."), FX = join(REPO, "tools", "avatar", "fixtures", "northstar-wardrobe");
const J = (n) => JSON.parse(readFileSync(join(FX, n), "utf8")), sha = (b) => createHash("sha256").update(b).digest("hex");
const w = WR.buildWardrobe(), L = w.base.layers, A = w.anchors, M = w.fg.master, { W, N } = WR;
const LEGS = (() => { const legs = new Uint8ClampedArray(L.pants); for (let i = 0; i < (A.crotchY + 10) * W; i++) legs[i * 4 + 3] = 0; return NL.overStack([M, recolour(legs, { h: 33, s: 0.51, vScale: 1.3 })]); })();
const base = BC.prepareBase(w, LEGS), T = BC.templatesC(w, base, { revision: "d213" }), min = BF.minimumItems(base.R, base.sep.lab);
const only = (k, P = LEGS) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) if (base.sep.lab[i] === k) o.set(P.subarray(i * 4, i * 4 + 4), i * 4); return o; };
const get = (r, id) => r.checks.find((c) => c.id === id);
// a top with a cuff ending above the stand-in's wrist (D-222's stimulus): what lies below the cuff on the skin is the stimulus
const top = recolour(only(1), { h: 175, s: 0.55 }), wr = T.top.wristRows, wristOf = (x) => wr[x < W / 2 ? "left" : "right"];
const cuff = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0; if (y >= A.shoulder.y && y < wristOf(x) - 14 && base.arms[i * 4 + 3] >= 128) cuff.set([40, 120, 60, 255], i * 4); }
const rowOnSkin = (dy0, dy1, f) => { const o = new Uint8ClampedArray(N * 4), px = []; for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0, w0 = wristOf(x);
  if (base.arms[i * 4 + 3] >= 250 && BF.classify(base.R, i) === "skin" && y >= w0 + dy0 && y < w0 + dy1) { o.set(f(i), i * 4); px.push(i); } } return { o, px }; };

test("D-232 method: d232 as D-232 defined it; d221 … d225 stay recorded as they ran", () => {
  // d232 was the default when D-232 recorded it; a later method (D-239's test pins the default) leaves its definition unchanged
  const m = IP.METHODS.d232; assert.ok(!m.limbExitDetached && !m.unmixPictureSkin);
  assert.deepEqual([m.fitRevision, m.shadowHue, m.remnantChroma, m.limbExit, m.outfitRevision, m.contract], ["d232", "c-own", true, true, "d225", "seam-contract-v2"]);
  for (const k of ["d221", "d222", "d223", "d225"]) assert.ok(!IP.METHODS[k].shadowHue && !IP.METHODS[k].remnantChroma && !IP.METHODS[k].limbExit, k + " unchanged");
});

test("D-232 (2a) skin shadow: orange fabric over skin is fabric (a hue shift C's own shading never shows); a warm cast shadow stays a shadow", () => {
  const hue = IP.shadeHueC(base); assert.ok(hue > 0.05 && hue < 0.4, "C's own shading shifts the hue a little: " + hue);
  const orange = rowOnSkin(-14, -8, (i) => [0, 1, 2].map((c) => Math.round(base.R[i * 4 + c] * [1.0, 0.67, 0.24][c])).concat(255)), pic = NL.overStack([LEGS, top, cuff, orange.o]);
  const inFabric = (r, s) => s.px.filter((i) => r.layers.sleeves[i * 4 + 3] || r.layers.topBody[i * 4 + 3]).length, inShadow = (r, s) => s.px.filter((i) => r.shadow && r.shadow[i * 4 + 3]).length;
  const old = IP.processItem(w, base, T, "top", pic, { method: "d225" }), now = IP.processItem(w, base, T, "top", pic, { method: "d232" });
  assert.ok(orange.px.length > 50 && inShadow(old, orange) > 0.5 * orange.px.length, "d225 took orange as a skin shadow: " + inShadow(old, orange) + " of " + orange.px.length);
  assert.equal(inShadow(now, orange), 0, "d232: orange is never a skin shadow"); assert.ok(inFabric(now, orange) >= inShadow(old, orange), "d232: it is fabric: " + inFabric(now, orange));
  // a cast shadow: exactly what d225 took as a shadow stays one (D-222: the fainter rest is C's own skin), none of it fabric
  const cast = rowOnSkin(-14, -8, (i) => [0, 1, 2].map((c) => Math.round(base.R[i * 4 + c] * [1.0, 0.81, 0.77][c])).concat(255)), cpic = NL.overStack([LEGS, top, cuff, cast.o]);
  const r = IP.processItem(w, base, T, "top", cpic, { method: "d232" }), r0 = IP.processItem(w, base, T, "top", cpic, { method: "d225" });
  assert.equal(inFabric(r, cast), 0, "a cast shadow (k 1.00 / 0.81 / 0.77) is no fabric"); assert.ok(inShadow(r, cast) > 0 && inShadow(r, cast) === inShadow(r0, cast), "it stays a skin shadow: " + inShadow(r, cast) + " / " + inShadow(r0, cast));
});

test("D-232 (2b) G-2: dark fabric within 24 of C's grey per channel but of another chroma is no base remnant; the base left unchanged still is", () => {
  const shorts = only(2), olive = new Uint8ClampedArray(shorts); for (let i = 0; i < N; i++) if (shorts[i * 4 + 3]) { const c = [0, 1, 2].map((k) => shorts[i * 4 + k]); olive.set([c[0] + 6, c[1] + 14, Math.max(0, c[2] - 20), 255], i * 4); }
  const g2 = (pic, method) => IP.processItem(w, base, T, "bottom", pic, { method }).observations.baseRemnantPx;
  const dark = NL.overStack([LEGS, olive]), old = g2(dark, "d225"), now = g2(dark, "d232"); let mc = 0; for (let i = 0; i < N; i++) if (T.bottom.mustCover[i]) mc++;
  assert.ok(old > 0.5 * mc, "d225 counted the dark olive as the grey base: " + old + " of " + mc); assert.ok(now < 0.01 * mc, "d232: its chroma changed — not a remnant: " + now);
  const half = new Uint8ClampedArray(olive); for (let i = 0; i < N; i++) if (half[i * 4 + 3] && (i % W) < W / 2) half.set(LEGS.subarray(i * 4, i * 4 + 4), i * 4);
  assert.ok(g2(NL.overStack([LEGS, half]), "d232") > 0.3 * mc, "the base left unchanged on one side is still a remnant");
});

test("D-232 (1) limb exit: the limb's contour hanging below a hem leaves the item; a fabric-coloured tab and the garment stay; shoes are not concerned", () => {
  // shorts recoloured, a 2 px ink line and its skin antialias hanging 10 px below the left leg's hem over the thigh
  const shorts = recolour(only(2), { h: 210, s: 0.6 }); let hem = 0; for (let i = 0; i < N; i++) if (base.sep.lab[i] === 2) hem = Math.max(hem, (i / W) | 0);
  let xl = -1; for (let x = 0; x < W / 2; x++) if (base.sep.lab[hem * W + x] === 2) { xl = x; break; } assert.ok(xl > 0);
  const hang = new Uint8ClampedArray(N * 4), tab = new Uint8ClampedArray(N * 4), xs = xl + 30, xt = xl + 70, fab = [...shorts.subarray(((hem - 30) * W + xl + 40) * 4, ((hem - 30) * W + xl + 40) * 4 + 3)];   // the fabric, not the hem's ink
  for (let y = hem + 1; y <= hem + 10; y++) { hang.set([20, 14, 10, 255], (y * W + xs) * 4); hang.set([20, 14, 10, 255], (y * W + xs + 1) * 4); hang.set([235, 170, 120, 255], (y * W + xs + 2) * 4); tab.set([...fab, 255], (y * W + xt) * 4); tab.set([...fab, 255], (y * W + xt + 1) * 4); }
  const pic = NL.overStack([LEGS, shorts, hang, tab]), at = (r, x) => { let n = 0; for (let y = hem + 1; y <= hem + 10; y++) if (r.layers.pants[(y * W + x) * 4 + 3]) n++; return n; };
  const old = IP.processItem(w, base, T, "bottom", pic, { method: "d225" }), now = IP.processItem(w, base, T, "bottom", pic, { method: "d232" });
  assert.ok(at(old, xs) >= 8, "d225 kept the hanging contour: " + at(old, xs)); assert.equal(at(now, xs) + at(now, xs + 1) + at(now, xs + 2), 0, "d232: the limb's contour leaves the item");
  assert.equal(at(now, xt), at(old, xt), "a fabric-coloured tab is the garment's own"); assert.ok(now.observations.limbExitRemovedPx >= 20);
  // the shorts end higher than the global hem in some columns: the garment is the shorts' own pixels, not a row
  let lost = 0; for (let i = 0; i < N; i++) if (shorts[i * 4 + 3] && old.layers.pants[i * 4 + 3] && !now.layers.pants[i * 4 + 3]) lost++; assert.equal(lost, 0, "nothing of the garment itself");
  const shoe = IP.processItem(w, base, T, "shoes", NL.overStack([LEGS, recolour(L.shoes, { h: 20, s: 0.5 })]), { method: "d232" }); assert.equal(shoe.observations.limbExitRemovedPx, undefined, "shoes are not concerned");
});

test("D-232 (1) FIT-6v2: a limb leaving the garment at its end is a reported exit; the same strip along the garment and a too narrow garment still fail", () => {
  const trousers = (inset) => { const o = new Uint8ClampedArray(min.pants); let hem = 0; for (let i = 0; i < N; i++) if (base.sep.lab[i] === 2) hem = Math.max(hem, (i / W) | 0);
    for (let y = hem; y < Math.min(A.shoeTopY.left, A.shoeTopY.right) - 20; y++) { let s0 = -1; for (let x = 0; x <= W; x++) { const on = x < W && base.body[(y * W + x) * 4 + 3] >= 128 && !base.sep.lab[y * W + x];
      if (on && s0 < 0) s0 = x; if (!on && s0 >= 0) { for (let xx = s0 + inset; xx <= x - 1 - inset; xx++) o.set([150, 130, 90, 255], (y * W + xx) * 4); s0 = -1; } } } return o; };
  const full = trousers(0); let end = 0; for (let i = 0; i < N; i++) if (full[i * 4 + 3]) end = Math.max(end, (i / W) | 0);
  const edge = (y) => { for (let x = 0; x < W / 2; x++) if (full[(y * W + x) * 4 + 3] >= 128) return x; return -1; };
  const cut = (y0, wd, ht) => { const o = new Uint8ClampedArray(full); let e0 = W; for (let y = y0; y < y0 + ht; y++) e0 = Math.min(e0, edge(y)); for (let y = y0; y < y0 + ht; y++) for (let x = e0; x < e0 + wd; x++) o.fill(0, (y * W + x) * 4, (y * W + x) * 4 + 4); return o; };
  const f6 = (layers, revision) => get(BC.fitCheck(w, base, T, "bottom", { pants: layers }, { revision }), "FIT-6v2-SILHOUETTE");
  const corner = cut(end - 9, 4, 10), a = f6(corner, "d222"), b = f6(corner, "d232");
  assert.equal(a.ok, false, "d222: a 4 × 10 piece at the hem's corner is a strip: " + JSON.stringify(a.value));
  assert.ok(b.ok && b.value.limbExits.length === 1 && b.value.sliverPx === 0, "d232: a limb exit, reported: " + JSON.stringify(b.value));
  const along = f6(cut(1150, 3, 20), "d232"); assert.equal(along.ok, false, "a 3 × 20 strip along the garment is still a double contour"); assert.equal(along.value.limbExits.length, 0);
  const mid = f6(cut(end - 40, 4, 10), "d232"); assert.equal(mid.ok, false, "the same 4 × 10 piece 30 rows above the end is still a strip: " + JSON.stringify(mid.value));
  assert.equal(f6(trousers(3), "d232").ok, false, "a too narrow garment still fails");
  assert.deepEqual(Object.keys(f6(full, "d222").value).includes("limbExits"), false, "d222's record keeps its fields");
});

test("D-232 (3) seam-contract-v2: v1 with the hip lanes re-derived from the outfit check (top ≥ + 6, bottoms ≤ + 6); everything else v1's", () => {
  const V1 = BC.SEAM_CONTRACT_V1, V2 = BC.SEAM_CONTRACT_V2; assert.equal(V2.version, "seam-contract-v2");
  assert.deepEqual([V2.topHipOverhangPx, V2.bottomsHipMaxPx], [6, 6]); for (const k of Object.keys(V1)) if (!["version", "topHipOverhangPx", "bottomsHipMaxPx"].includes(k)) assert.equal(V2[k], V1[k], k);
  const C = J("seam-contract-v2.json"); assert.deepEqual(C.parameters, { ...V2 }); assert.equal(C.derivedFrom.sweep.rule, "a double contour where the bottoms stand 3–8 px further out than the top's hem; none where the top is as wide or wider, or within 2 px");
  assert.ok(C.limits.some((l) => /does not prove that a model can draw/.test(l)));
  // bottoms b px wider than C's base shorts at the hips: + 5 breaks v1's SC-W6 and meets v2's; + 9 breaks both
  const Ln = BC.seamLines(w, base, T), shorts = WR.maskOps.toMask(min.pants, 128), wTop = Math.min(...Object.values(Ln.waist));
  const wider = (b) => { const m = new Uint8Array(shorts); for (let y = wTop; y <= wTop + 80; y++) { let a = -1, e = -1; for (let x = 0; x < W; x++) if (shorts[y * W + x]) { if (a < 0) a = x; e = x; } if (a < 0) continue; for (let x = a - b; x < a; x++) m[y * W + x] = 1; for (let x = e + 1; x <= e + b; x++) m[y * W + x] = 1; } return { pants: ST.paintMask(m, [60, 60, 90]) }; };
  const w6 = (layers, K) => BC.contractCheck(w, base, T, "bottom", layers, { contract: K }).checks.find((c) => c.id === "SC-W6-BOTTOMS-HIP-WIDTH").ok;
  assert.deepEqual([w6(wider(5), V1), w6(wider(5), V2), w6(wider(9), V2)], [false, true, false]);
});

test("D-232 results: recorded under method d232 on C — the pilot unchanged but three khaki + boots outfits, the validation matrix 38 of 40; D-231's record and verdict stand", () => {
  const R = J("seam-limits-results-d232.json"); assert.deepEqual([R.decision, R.method, R.imageCalls], ["D-232", "d232", 0]);
  assert.deepEqual([R.runs.pilot.byteIdentical, R.runs.validation.byteIdentical], [true, true]);
  assert.deepEqual(R.pilot.summary, { technicallyOk: 10, technicallyOkOpenFinding: 6, rejected: 2 }); assert.deepEqual(R.validation.summary, { technicallyOk: 38, technicallyOkOpenFinding: 0, rejected: 2 });
  assert.deepEqual(R.pilot.rejectedItems, ["shoes-sandals-brown"]); assert.deepEqual(R.validation.rejectedItems, []);
  const D231 = J("seam-validation-results-v1.json"); assert.equal(D231.verdict.byFrozenRule, "partial"); assert.match(R.d231VerdictStands, /partial/);
  assert.equal(R.registerSha256, sha(Buffer.from(JSON.stringify(J("findings-register.json")))), "the findings register is unchanged");
  for (const m of ["item-pipeline-manifest-d232.json", "item-pipeline-manifest-d232-validation.json"]) assert.equal(J(m).method, "d232");
});
