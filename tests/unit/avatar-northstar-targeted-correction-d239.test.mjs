// D-239: the targeted correction after D-238 as method version d239 — each correction with its fault stimulus on the CI stand-in
// (C is private, D-127 §2), and the faults the old rules caught still caught: (1) paint left detached after the limb exit leaves
// the item (the N2 sleeve "cut"); a contour edge mixed with the picture's own shaded skin is unmixed (D-238 MF-1a, F-001's
// mechanism); (2) the outfit check d239 keeps every d225 check, reads a partially transparent item pixel as that item's edge,
// and adds COMBO-5 (skin between a hem and a shoe, MF-1b) and COMBO-6 (C's base left uncovered as a notch, MF-2); (3) SC-W4 judges
// a line by its contrast, not by dark fabric; (4) the manual findings stand in a review register beside the pinned findings
// register. D-235's six pictures are development material for d239 — nothing here is a validation. Runs on C: seam-correction-results-d239.json.
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
import { recolour } from "../../tools/avatar/northstar-wardrobe-poc.mjs";
import * as NL from "../../tools/avatar/r3-northstar-layers.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."), FX = join(REPO, "tools", "avatar", "fixtures", "northstar-wardrobe");
const J = (n) => JSON.parse(readFileSync(join(FX, n), "utf8")), sha = (b) => createHash("sha256").update(b).digest("hex");
const w = WR.buildWardrobe(), L = w.base.layers, A = w.anchors, M = w.fg.master, { W, N } = WR;
const LEGS = (() => { const legs = new Uint8ClampedArray(L.pants); for (let i = 0; i < (A.crotchY + 10) * W; i++) legs[i * 4 + 3] = 0; return NL.overStack([M, recolour(legs, { h: 33, s: 0.51, vScale: 1.3 })]); })();
const base = BC.prepareBase(w, LEGS), T = BC.templatesC(w, base, { revision: "d213" }), min = BF.minimumItems(base.R, base.sep.lab);
const only = (k, P = LEGS) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) if (base.sep.lab[i] === k) o.set(P.subarray(i * 4, i * 4 + 4), i * 4); return o; };
const outfit = (layers, opts = {}, revision = "d239") => BC.outfitCheck(w, base, BF.layerProof(w, base.R, base.Z, { ...min, ...layers }, { sep: base.sep, headSeam: "d201", enclosure: "c-exterior", ...opts }), { revision });
const okOf = (r, id) => r.checks.find((c) => c.id === id).ok;
const seamRow = (() => { let s = 0; for (let i = 0; i < N; i++) if (base.sep.lab[i] === 1) s = Math.max(s, (i / W) | 0); return s; })();
// a top with a cuff ending above the stand-in's wrist (D-222's stimulus)
const top = recolour(only(1), { h: 175, s: 0.55 }), wr = T.top.wristRows, wristOf = (x) => wr[x < W / 2 ? "left" : "right"];
const CUFF = [40, 120, 60];
const cuff = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0; if (y >= A.shoulder.y && y < wristOf(x) - 14 && base.arms[i * 4 + 3] >= 128) cuff.set([...CUFF, 255], i * 4); }
const armSpan = (y) => { let a = -1, b = -1; for (let x = 0; x < W / 2; x++) if (base.arms[(y * W + x) * 4 + 3] >= 250 && BF.classify(base.R, y * W + x) === "skin") { if (a < 0) a = x; b = x; } return [a, b]; };

test("D-239 method: d239 as D-239 defined it; d221 … d232 stay recorded as they ran", () => {
  // d239 was the default when D-239 recorded it; a later method (D-240's test pins the default) leaves its definition unchanged
  const m = IP.METHODS.d239; assert.ok(!m.coverFromPicture);
  assert.deepEqual([m.fitRevision, m.limbExit, m.limbExitDetached, m.unmixPictureSkin, m.outfitRevision, m.contract, m.contractRevision], ["d232", true, true, true, "d239", "seam-contract-v2", "d239"]);
  for (const k of ["d221", "d222", "d223", "d225", "d232"]) assert.ok(!IP.METHODS[k].limbExitDetached && !IP.METHODS[k].unmixPictureSkin && IP.METHODS[k].outfitRevision !== "d239", k + " unchanged");
});

test("D-239 (1) paint left detached by the limb exit leaves the item; a fabric-coloured tab hanging from the cuff stays", () => {
  // below the left cuff: 6 rows of the limb's contour (ink) and under them a 3-row stub in the cuff's colour; at the right a tab in
  // the cuff's colour hanging straight from the cuff
  const cuffEnd = (x) => { let e = -1; for (let y = 0; y < base.arms.length / 4 / W; y++) if (cuff[(y * W + x) * 4 + 3]) e = y; return e; };
  // the stub and the tab in the garment's own fabric colour (the rule compares with the median of the item's wide runs: the top body)
  const [a, b] = armSpan(wristOf(100) - 10), xs = a + Math.round((b - a) / 3), xt = a + Math.round(2 * (b - a) / 3), e1 = cuffEnd(xs), e2 = cuffEnd(xt); assert.ok(e1 > 0 && e2 > 0);
  const fab = [0, 1, 2].map((c) => { const v = []; for (let i = 0; i < N; i += 13) if (top[i * 4 + 3] >= 250) v.push(top[i * 4 + c]); v.sort((p, q) => p - q); return v[v.length >> 1]; });
  const hang = new Uint8ClampedArray(N * 4);
  for (let k = 1; k <= 6; k++) hang.set([20, 14, 10, 255], ((e1 + k) * W + xs) * 4);
  for (let k = 7; k <= 9; k++) hang.set([...fab, 255], ((e1 + k) * W + xs) * 4);
  for (let k = 1; k <= 8; k++) hang.set([...fab, 255], ((e2 + k) * W + xt) * 4);
  const pic = NL.overStack([LEGS, top, cuff, hang]), has = (r, x, y0, y1) => { let n = 0; for (let y = y0; y <= y1; y++) if (r.layers.sleeves[(y * W + x) * 4 + 3] || r.layers.topBody[(y * W + x) * 4 + 3]) n++; return n; };
  const old = IP.processItem(w, base, T, "top", pic, { method: "d232" }), now = IP.processItem(w, base, T, "top", pic, { method: "d239" });
  assert.equal(has(old, xs, e1 + 1, e1 + 6), 0, "d232 took the ink line out"); assert.ok(has(old, xs, e1 + 7, e1 + 9) >= 2, "d232 left the stub, detached: " + has(old, xs, e1 + 7, e1 + 9));
  assert.equal(has(now, xs, e1 + 7, e1 + 9), 0, "d239: the detached stub leaves the item"); assert.ok(now.observations.limbExitDetachedPx >= 2);
  assert.equal(has(now, xt, e2 + 1, e2 + 8), has(old, xt, e2 + 1, e2 + 8), "the tab hanging from the cuff stays as it was");
});

test("D-239 (1) a contour edge mixed with the picture's own shaded skin is unmixed to ink at partial alpha; fabric is never unmixed", () => {
  const rowOnSkin = (dy0, dy1, f) => { const o = new Uint8ClampedArray(N * 4), px = []; for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0, w0 = wristOf(x);
    if (base.arms[i * 4 + 3] >= 250 && BF.classify(base.R, i) === "skin" && y >= w0 + dy0 && y < w0 + dy1) { o.set(f(i), i * 4); px.push(i); } } return { o, px }; };
  const INK = [22, 14, 10], K = [0.99, 0.78, 0.72], shaded = (i) => [0, 1, 2].map((c) => Math.round(base.R[i * 4 + c] * K[c]));
  const ink = rowOnSkin(-14, -12, () => [...INK, 255]), mix = rowOnSkin(-12, -11, (i) => shaded(i).map((v, c) => Math.round(0.3 * INK[c] + 0.7 * v)).concat(255)), sh = rowOnSkin(-11, -7, (i) => [...shaded(i), 255]);
  const pic = NL.overStack([LEGS, top, cuff, ink.o, mix.o, sh.o]), L0 = (r, i) => (r.layers.sleeves[i * 4 + 3] ? r.layers.sleeves : r.layers.topBody).subarray(i * 4, i * 4 + 4);
  const old = IP.processItem(w, base, T, "top", pic, { method: "d232" }), now = IP.processItem(w, base, T, "top", pic, { method: "d239" });
  const opaqueMix = (r) => mix.px.filter((i) => L0(r, i)[3] >= 200).length, partialInk = (r) => mix.px.filter((i) => { const p = L0(r, i); return p[3] > 40 && p[3] < 120 && [0, 1, 2].every((c) => Math.abs(p[c] - INK[c]) <= 8); }).length;
  assert.ok(mix.px.length > 20 && opaqueMix(old) > 0.5 * mix.px.length, "d232 left the mix with the shaded skin opaque in the layer: " + opaqueMix(old) + " of " + mix.px.length);
  assert.ok(partialInk(now) >= 0.6 * mix.px.length, "d239: ink at about 0.3 alpha: " + partialInk(now) + " of " + mix.px.length);
  let cuffTouched = 0; for (let i = 0; i < N; i++) if (cuff[i * 4 + 3] && (now.layers.sleeves[i * 4 + 3] || now.layers.topBody[i * 4 + 3]) && L0(now, i)[3] < 250) cuffTouched++; assert.equal(cuffTouched, 0, "the cuff's fabric keeps full alpha");
});

test("D-239 (2) COMBO-1d: a partially transparent item pixel is the item's edge; a real cut, missing sleeve fabric and a wrong order are still found", () => {
  const sleeve = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0; if (y >= A.shoulder.y && y < wristOf(x) - 14 && base.arms[i * 4 + 3] >= 128) sleeve.set([40, 120, 60, 255], i * 4); }
  assert.ok(okOf(outfit({ sleeves: sleeve }), "COMBO-1d-CUT-IN-GARMENT"), "the whole sleeve: no cut");
  // a 1 px column of the sleeve's edge at alpha 60 (an unmixed contour) through 12 rows
  const [a] = armSpan(wristOf(100) - 30), xe = a + 8, soft = new Uint8ClampedArray(sleeve); for (let y = wristOf(100) - 40; y < wristOf(100) - 28; y++) soft.set([20, 14, 10, 60], (y * W + xe) * 4);
  assert.equal(okOf(outfit({ sleeves: soft }, {}, "d225"), "COMBO-1d-CUT-IN-GARMENT"), false, "d225 read the arm through the soft edge as a cut");
  assert.ok(okOf(outfit({ sleeves: soft }), "COMBO-1d-CUT-IN-GARMENT"), "d239: the edge is the sleeve's");
  const band = new Uint8ClampedArray(sleeve); for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0; if (y >= wristOf(x) - 40 && y < wristOf(x) - 37) band.fill(0, i * 4, i * 4 + 4); }
  assert.equal(okOf(outfit({ sleeves: band }), "COMBO-1d-CUT-IN-GARMENT"), false, "a real cut through the sleeve");
  const hole = new Uint8ClampedArray(sleeve); for (let y = wristOf(100) - 60; y < wristOf(100) - 48; y++) for (let x = xe - 1; x <= xe + 1; x++) hole.fill(0, (y * W + x) * 4, (y * W + x) * 4 + 4);
  assert.equal(okOf(outfit({ sleeves: hole }), "COMBO-1d-CUT-IN-GARMENT"), false, "missing sleeve fabric (3 × 12)");
  const sh = L.shoes, trousers = new Uint8ClampedArray(min.pants); for (let i = 0; i < N; i++) if (LEGS[i * 4 + 3] >= 128 && sh[i * 4 + 3] >= 128 && !base.sep.lab[i]) trousers.set([150, 130, 90, 255], i * 4);
  assert.ok(okOf(outfit({ pants: trousers, shoes: sh }), "COMBO-3-ORDER")); assert.equal(okOf(outfit({ pants: trousers, shoes: sh }, { order: "shoes-over-bottoms" }), "COMBO-3-ORDER"), false, "a wrong order");
});

test("D-239 (2) COMBO-5: a sliver of skin between a long hem and the shoe right below it fails; an ankle by design and a hem over the shoe pass", () => {
  const sh = L.shoes; let shoeTop = new Int32Array(W).fill(-1); for (let i = 0; i < N; i++) if (sh[i * 4 + 3] >= 128) { const x = i % W, y = (i / W) | 0; if (shoeTop[x] < 0 || y < shoeTop[x]) shoeTop[x] = y; }
  // trousers over C's legs from the shorts down to `gap` rows above the shoe's top in each column (or over it when gap < 0)
  const trousers = (gap) => { const o = new Uint8ClampedArray(min.pants); for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0; if (base.sep.lab[i] || LEGS[i * 4 + 3] < 128 || shoeTop[x] < 0 || y < A.crotchY) continue; if (y < shoeTop[x] - gap) o.set([40, 40, 60, 255], i * 4); } return o; };
  const r6 = outfit({ pants: trousers(6), shoes: sh }), r40 = outfit({ pants: trousers(40), shoes: sh }), r0 = outfit({ pants: trousers(-4), shoes: sh });
  assert.equal(okOf(r6, "COMBO-5-HEM-SHOE-SKIN"), false, "6 rows of skin between hem and shoe: " + JSON.stringify(r6.checks.find((c) => c.id === "COMBO-5-HEM-SHOE-SKIN").value).slice(0, 200));
  assert.ok(okOf(r40, "COMBO-5-HEM-SHOE-SKIN"), "40 rows: an ankle by design (a cropped hem)"); assert.ok(okOf(r0, "COMBO-5-HEM-SHOE-SKIN"), "a hem over the shoe");
  assert.equal(outfit({ pants: trousers(6), shoes: sh }, {}, "d225").checks.some((c) => c.id === "COMBO-5-HEM-SHOE-SKIN"), false, "d225's record has no COMBO-5");
});

test("D-239 (2) COMBO-6: C's base corner left open as a notch in the outline fails; a 1 px rim along the outline passes", () => {
  // the minimum top with its outer 4 (notch) or 1 (rim) columns removed at the left hip, over the 12 rows of C's base top just above
  // its base shorts where background lies outside it (C's own outline there)
  let shortsTop = 0; for (let i = 0; i < N; i++) if (base.sep.lab[i] === 2) { shortsTop = (i / W) | 0; break; }
  const outer = (y) => { for (let x = 1; x < W / 2; x++) { const i = y * W + x; if (base.sep.lab[i] === 1 && base.R[i * 4 + 3] >= 128 && base.R[(i - 1) * 4 + 3] < 128) return x; } return -1; };   // the torso's edge, background outside
  const rowsAt = []; for (let y = shortsTop - 1; y > shortsTop - 60 && rowsAt.length < 12; y--) if (outer(y) > 0) rowsAt.push(y); assert.equal(rowsAt.length, 12, "12 rows of C's base top at the outline");
  const left = (cols) => { const o = new Uint8ClampedArray(min.topBody); for (const y of rowsAt) { const x0 = outer(y); for (let x = x0; x < x0 + cols; x++) o.fill(0, (y * W + x) * 4, (y * W + x) * 4 + 4); } return o; };
  const notch = outfit({ topBody: left(4) }), rim = outfit({ topBody: left(1) });
  assert.equal(okOf(notch, "COMBO-6-UNCOVERED-BASE"), false, "a 4 px notch: " + JSON.stringify(notch.checks.find((c) => c.id === "COMBO-6-UNCOVERED-BASE").value).slice(0, 200));
  assert.ok(okOf(rim, "COMBO-6-UNCOVERED-BASE"), "a 1 px rim: " + JSON.stringify(rim.checks.find((c) => c.id === "COMBO-6-UNCOVERED-BASE").value).slice(0, 200));
  assert.ok(okOf(outfit({}), "COMBO-6-UNCOVERED-BASE") && okOf(outfit({}), "COMBO-5-HEM-SHOE-SKIN"), "C's minimum items pass");
});

test("D-239 (3) SC-W4 by contrast: dark plain fabric has no line; a light stitch on dark, a dark seam on light and a band edge in the hem zone are lines; a waistband within W + 12 is allowed", () => {
  const Ln = BC.seamLines(w, base, T), K2 = BC.SEAM_CONTRACT_V2, shorts = WR.maskOps.toMask(min.pants, 128);
  const paint = (rgb, lines = []) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) if (shorts[i]) { const x = i % W, y = (i / W) | 0, d = Ln.waist[x] !== undefined ? y - Ln.waist[x] : -99; const ln = lines.find((l) => d >= l.at && d < l.at + 2); o.set([...(ln ? ln.rgb : rgb), 255], i * 4); } return { pants: o }; };
  const w4 = (layers, revision) => BC.contractCheck(w, base, T, "bottom", layers, { contract: K2, revision }).checks.find((c) => c.id === "SC-W4-BOTTOMS-NO-LINE-IN-HEM-ZONE").ok;
  const black = paint([18, 18, 20]); assert.equal(w4(black, "v1"), false, "v1 read plain black as lines (D-238)"); assert.ok(w4(black, "d239"), "d239: plain black has no line");
  assert.equal(w4(paint([18, 18, 20], [{ at: 30, rgb: [150, 150, 150] }]), "d239"), false, "a light stitch on black at W + 30");
  assert.equal(w4(paint([200, 180, 150], [{ at: 30, rgb: [40, 30, 25] }]), "d239"), false, "a dark seam on light fabric at W + 30");
  assert.ok(w4(paint([200, 180, 150], [{ at: 4, rgb: [40, 30, 25] }, { at: 8, rgb: [40, 30, 25] }]), "d239"), "a ribbed waistband within W + 12");
  assert.equal(w4(paint([200, 180, 150], [{ at: 4, rgb: [40, 30, 25] }, { at: 20, rgb: [40, 30, 25] }]), "d239"), false, "a band edge at W + 20");
});

test("D-239 (4) the manual findings stand in a review register beside the pinned findings register; an open one keeps its outfits from being ready", () => {
  const reg = J("findings-register.json"), rev = J("findings-register-review.json"), merged = { ...reg, findings: [...reg.findings, ...rev.findings] };
  assert.ok(IP.validateRegister(rev) && IP.validateRegister(merged)); assert.deepEqual(rev.findings.map((f) => f.id), ["F-013", "F-014", "F-015", "F-016", "F-017", "F-018", "F-019"]);
  for (const f of rev.findings) assert.deepEqual([f.status, f.foundBy], ["open", "manual"], f.id);
  // F-015 … F-019: the tops that leave C's hip corners open — none of them is a top that covers its corners (N1, V1)
  assert.deepEqual(rev.findings.slice(2).map((f) => f.subject.item), ["top-tank-teal", "top-tee-red", "top-sweater-green", "top-longsleeve-waist-purple", "top-longsleeve-waist-navy"]);
  assert.deepEqual(IP.openFindingsFor(merged, ["top-tee-hip-blue", "bottom-shorts-navy", "shoes-sneakers-white"]), [], "a corner-covering top over the shorts is not held");
  assert.deepEqual(IP.openFindingsFor(merged, ["top-tee-hip-cream", "bottom-trousers-black", "shoes-boots-laceup-black"]), ["F-013"]);
  assert.deepEqual(IP.openFindingsFor(merged, ["top-tank-teal", "bottom-trousers-black", "shoes-sneakers-white"]).sort(), ["F-013", "F-014", "F-015"]);
  assert.equal(sha(Buffer.from(JSON.stringify(reg))), J("seam-limits-results-d232.json").registerSha256, "the findings register is the one D-232 pinned");
  for (const m of ["item-pipeline-manifest-d239-pilot.json", "item-pipeline-manifest-d239-d228.json", "item-pipeline-manifest-d239-d235.json"]) { const x = J(m); assert.deepEqual([x.method, x.reviewRegister], ["d239", "tools/avatar/fixtures/northstar-wardrobe/findings-register-review.json"], m); }
});

test("D-239 results: recorded from the runs; every status change classified, none a false rejection or a regression; D-238's result stands", () => {
  const R = J("seam-correction-results-d239.json"); assert.deepEqual([R.decision, R.method, R.imageCalls], ["D-239", "d239", 0]); assert.match(R.status, /nothing here is an independent validation/);
  assert.equal(J("independent-validation-results-v1.json").decisionByPreRegisteredRule.result, "targetedCorrection"); assert.deepEqual(J("independent-validation-results-v1.json").measures, { T: 6, K: 30, C: 0, MF: 2, CMF: false });
  assert.equal(R.correctedDiagnoses.length, 3); assert.deepEqual([R.review.falseRejections, R.review.regressions, R.review.unresolved], [0, 0, 0]);
  const allowed = ["existing fault now detected", "corrected extraction fault", "existing fault, now named right"];
  for (const [k, v] of Object.entries(R.sets)) { for (const c of v.statusChanges) assert.ok(allowed.includes(c.class), k + " " + c.outfit + " " + c.class);
    assert.equal(v.d239.passChecks + v.d239.rejected, v.outfits, k); assert.equal(v.d239.ready + v.d239.notReadyOpenFinding, v.d239.passChecks, k);
    for (const n of v.readyOutfits) assert.ok(/top-tee-hip-(cream|blue)/.test(n), k + ": only corner-covering tops are ready — " + n); }
  assert.match(R.sets.pilot.runs.byteIdentity, /^verified/); assert.match(R.sets.d235.runs.byteIdentity, /^not verified/); assert.match(R.sets.d228.runs.byteIdentity, /^not verified/);
  assert.deepEqual([R.sets.d235.d239.ready, R.sets.d228.d239.ready, R.sets.pilot.d239.ready], [15, 6, 0]);
});
