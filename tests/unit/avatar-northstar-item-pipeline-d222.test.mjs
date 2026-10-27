// D-222: the consolidated Northstar item method — one pipeline entry (manifest in; layers, skin shadow, body visibility, checks,
// review pictures and the outfit package out), reproducible bytes, and the documented check fixes with their fault stimuli:
// FIT-4 measured against C's own exterior (a real hole and too short bottoms still fail), FIT-6v2 crossings by their shape (a double
// contour and a too narrow garment still fail), the skin shadow by luminance and the contour edge over skin unmixed. On the CI
// stand-in base (C is private, D-127 §2); the run on C's real pilot pictures is recorded in item-method-results-d222.json.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync, realpathSync, rmSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { encodePng } from "../../tools/avatar/r3-hair-tool.mjs";
import * as WR from "../../tools/avatar/northstar-wardrobe.mjs";
import * as BF from "../../tools/avatar/northstar-base-figure.mjs";
import * as BC from "../../tools/avatar/northstar-base-figure-c.mjs";
import * as IP from "../../tools/avatar/northstar-item-pilot.mjs";
import { recolour } from "../../tools/avatar/northstar-wardrobe-poc.mjs";
import * as NL from "../../tools/avatar/r3-northstar-layers.mjs";
import { standInItems } from "../../tools/avatar/northstar-base-figure-c-proof.mjs";

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = resolve(HERE, "..", ".."), sha = (b) => createHash("sha256").update(b).digest("hex");
const fixture = (n) => JSON.parse(readFileSync(join(REPO, "tools", "avatar", "fixtures", "northstar-wardrobe", n), "utf8"));
const ROOTS = []; after(() => { for (const r of ROOTS) rmSync(r, { recursive: true, force: true }); });
const w = WR.buildWardrobe(), L = w.base.layers, A = w.anchors, M = w.fg.master, { W, N } = WR;
const LEGS = (() => { const legs = new Uint8ClampedArray(L.pants); for (let i = 0; i < (A.crotchY + 10) * W; i++) legs[i * 4 + 3] = 0; return NL.overStack([M, recolour(legs, { h: 33, s: 0.51, vScale: 1.3 })]); })();
const base = BC.prepareBase(w, LEGS), T = BC.templatesC(w, base, { revision: "d213" }), min = BF.minimumItems(base.R, base.sep.lab);
const only = (k, P = LEGS) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) if (base.sep.lab[i] === k) o.set(P.subarray(i * 4, i * 4 + 4), i * 4); return o; };
const get = (r, id) => r.checks.find((c) => c.id === id);
const enclosedPx = (it, enclosure) => { const P = BF.layerProof(w, base.R, base.Z, it, { sep: base.sep, headSeam: "d201", enclosure }); let n = 0; for (let i = 0; i < N; i++) if (P.enclosed[i]) n++; return n; };

test("D-222 FIT-4: an open seam beside the arm–torso gap that a flared garment closes from below is C's outline, not a hole; a real hole and too short bottoms still fail", () => {
  // the gap between the left arm and the torso, row by row (transparent between the arm and the body; C's own exterior)
  const ext = BF.outsideExterior(base.R), gap = {}; for (let y = 600; y < 1000; y++) { let ax = -1; for (let x = 0; x < W / 2; x++) if (base.arms[(y * W + x) * 4 + 3] >= 128) ax = x; if (ax < 0) continue;
    for (let x = ax + 1; x < W / 2; x++) if (base.R[(y * W + x) * 4 + 3] >= 128) { if (x > ax + 1 && ext[y * W + ax + 1]) gap[y] = [ax, x]; break; } }
  assert.ok(gap[710] && gap[900], "the stand-in has an open arm–torso gap at the waist and at the hand");
  // the minimum top leaves a 2 px column of the base open at the torso's edge (C's 1 px side seam), and a flare closes the gap below
  const topB = new Uint8ClampedArray(min.topBody); let seam = 0; for (let y = 700; y < 720; y++) for (let x = gap[y][1]; x < gap[y][1] + 2; x++) { const i = y * W + x; if (topB[i * 4 + 3]) { topB.fill(0, i * 4, i * 4 + 4); seam++; } }
  const flare = new Uint8ClampedArray(min.pants); for (let y = 900; y < 906; y++) for (let x = gap[y][0] - 2; x <= gap[y][1]; x++) flare.set([120, 40, 90, 255], (y * W + x) * 4);
  assert.ok(seam >= 20);
  assert.equal(enclosedPx({ ...min, topBody: topB, pants: flare }, "canvas"), seam, "v3 … d221: the open seam counts as enclosed once the flare closes the gap (the skirt's 9 px)");
  assert.equal(enclosedPx({ ...min, topBody: topB, pants: flare }, "c-exterior"), 0, "D-222: it reaches C's own exterior — the figure's outline");
  // a 12 × 12 hole inside the bottoms (over the base shorts) never touches C's exterior: still enclosed
  let hy = -1, hx = -1; for (let y = 760; y < 900 && hy < 0; y++) for (let x = 300; x < 500; x++) { let all = true; for (let dy = 0; dy < 12 && all; dy++) for (let dx = 0; dx < 12; dx++) if (base.sep.lab[(y + dy) * W + x + dx] !== 2) { all = false; break; } if (all) { hy = y; hx = x; break; } }
  const holed = new Uint8ClampedArray(flare); for (let y = hy; y < hy + 12; y++) for (let x = hx; x < hx + 12; x++) holed.fill(0, (y * W + x) * 4, (y * W + x) * 4 + 4);
  assert.equal(enclosedPx({ ...min, topBody: topB, pants: holed }, "c-exterior"), 144, "the hole's 144 px");
  const fh = BC.fitCheck(w, base, T, "bottom", { pants: holed }, { revision: "d222" }); assert.equal(get(fh, "FIT-4-COVERAGE").ok, false, JSON.stringify(get(fh, "FIT-4-COVERAGE").value));
  const S = standInItems(w, base), short = BC.fitCheck(w, base, T, "bottom", S["FAULT-shorts-too-short"].layers, { revision: "d222" });
  assert.equal(get(short, "FIT-4-COVERAGE").ok, false, "too short bottoms: " + JSON.stringify(get(short, "FIT-4-COVERAGE").value));
  assert.ok(BC.fitCheck(w, base, T, "bottom", S["min-shorts"].layers, { revision: "d222" }).fitOk, "the minimum shorts pass");
});

test("D-222 FIT-6v2: a compact piece where two contours meet at an angle is a crossing; an elongated strip along the garment (a double contour) and a too narrow garment still fail", () => {
  const trousers = (inset) => { const o = new Uint8ClampedArray(min.pants); let hem = 0; for (let i = 0; i < N; i++) if (base.sep.lab[i] === 2) hem = Math.max(hem, (i / W) | 0);
    for (let y = hem; y < Math.min(A.shoeTopY.left, A.shoeTopY.right) - 20; y++) { let s0 = -1; for (let x = 0; x <= W; x++) { const on = x < W && base.body[(y * W + x) * 4 + 3] >= 128 && !base.sep.lab[y * W + x];
      if (on && s0 < 0) s0 = x; if (!on && s0 >= 0) { for (let xx = s0 + inset; xx <= x - 1 - inset; xx++) o.set([150, 130, 90, 255], (y * W + xx) * 4); s0 = -1; } } } return o; };
  const full = trousers(0), y0 = 1150, edge = (y) => { for (let x = 0; x < W / 2; x++) if (full[(y * W + x) * 4 + 3] >= 128) return x; return -1; };
  // a cut of wd × ht px at the left leg's outer edge (a rectangle from the edge's leftmost column): the leg shows between the
  // background and the trousers there, a piece wd × ht px
  const cut = (wd, ht) => { const o = new Uint8ClampedArray(full); let e0 = W; for (let y = y0; y < y0 + ht; y++) e0 = Math.min(e0, edge(y));
    for (let y = y0; y < y0 + ht; y++) for (let x = e0; x < e0 + wd; x++) o.fill(0, (y * W + x) * 4, (y * W + x) * 4 + 4); return o; };
  const f6 = (layers, revision) => get(BC.fitCheck(w, base, T, "bottom", { pants: layers }, { revision }), "FIT-6v2-SILHOUETTE");
  assert.ok(f6(full, "d222").ok, JSON.stringify(f6(full, "d222").value));
  const wedge = cut(6, 7), a = f6(wedge, "d221"), b = f6(wedge, "d222");
  assert.equal(a.ok, false, "d221: a 6 × 7 piece is over the square allowance: " + JSON.stringify(a.value));
  assert.ok(b.ok && b.value.compactCrossingsOverSquare.length === 1 && b.value.sliverPx === 0, "d222: a compact crossing, reported: " + JSON.stringify(b.value));
  const strip = f6(cut(3, 20), "d222"); assert.equal(strip.ok, false, "an elongated 3 × 20 strip along the garment is a double contour: " + JSON.stringify(strip.value));
  const narrow = f6(trousers(3), "d222"); assert.equal(narrow.ok, false); assert.ok(narrow.value.sliverPx > 100, "a too narrow garment: " + JSON.stringify(narrow.value));
});

// a top with a cuff ending above the stand-in's wrist; what lies below the cuff on the skin is the stimulus
const top = recolour(only(1), { h: 175, s: 0.55 }), wr = T.top.wristRows, wristOf = (x) => wr[x < W / 2 ? "left" : "right"];
const cuff = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0; if (y >= A.shoulder.y && y < wristOf(x) - 14 && base.arms[i * 4 + 3] >= 128) cuff.set([40, 120, 60, 255], i * 4); }
const rowOnSkin = (dy0, dy1, f) => { const o = new Uint8ClampedArray(N * 4), px = []; for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0, w0 = wristOf(x);
  if (base.arms[i * 4 + 3] >= 250 && BF.classify(base.R, i) === "skin" && y >= w0 + dy0 && y < w0 + dy1) { o.set(f(i), i * 4); px.push(i); } } return { o, px }; };

test("D-222 skin shadow by luminance: a warm cast shadow that keeps C's red is shadow, not fabric; khaki and brown leather stay fabric", () => {
  const sh = rowOnSkin(-14, -8, (i) => [0, 1, 2].map((c) => Math.round(base.R[i * 4 + c] * [1.0, 0.81, 0.77][c])).concat(255)), pic = NL.overStack([LEGS, top, cuff, sh.o]);
  const old = IP.processItem(w, base, T, "top", pic, { method: "d221" }), now = IP.processItem(w, base, T, "top", pic);
  const inFabric = (r) => sh.px.filter((i) => r.layers.sleeves[i * 4 + 3] || r.layers.topBody[i * 4 + 3]).length, inShadow = (r) => sh.px.filter((i) => r.shadow && r.shadow[i * 4 + 3]).length;
  assert.ok(sh.px.length > 50 && inFabric(old) > 0.25 * sh.px.length, "d221 took it as fabric: " + inFabric(old) + " of " + sh.px.length);
  // every pixel d221 took as fabric is shadow now; the rest is fainter than the new-paint tolerance — C's own skin (as in D-214)
  assert.ok(inFabric(now) === 0 && inShadow(now) === inFabric(old), "d222: " + inShadow(now) + " in the shadow layer, " + inFabric(now) + " fabric, of " + sh.px.length);
  let maxd = 0; for (const i of sh.px) if (now.shadow[i * 4 + 3]) for (let c = 0; c < 3; c++) maxd = Math.max(maxd, Math.abs(now.composite[i * 4 + c] - pic[i * 4 + c])); assert.ok(maxd <= 2, "composed it is the picture (max " + maxd + ")");
  for (const [what, k] of [["khaki", [0.75, 0.87, 0.97]], ["brown leather", [0.55, 0.44, 0.37]]]) { const b = rowOnSkin(-14, -8, (i) => [0, 1, 2].map((c) => Math.round(base.R[i * 4 + c] * k[c])).concat(255)), q = IP.processItem(w, base, T, "top", NL.overStack([LEGS, top, cuff, b.o]));
    assert.equal(b.px.filter((i) => q.shadow && q.shadow[i * 4 + 3]).length, 0, what + " is fabric, never a skin shadow"); }
});

test("D-222 contour edge over skin: a pixel mixing the cuff's ink and C's skin becomes ink with partial alpha (the picture on C, ink over anything else); fabric is never unmixed", () => {
  const INK = [22, 14, 10], ink = rowOnSkin(-14, -12, () => [...INK, 255]), mix = rowOnSkin(-12, -11, (i) => [0, 1, 2].map((c) => Math.round(0.5 * INK[c] + 0.5 * base.R[i * 4 + c])).concat(255));
  const pic = NL.overStack([LEGS, top, cuff, ink.o, mix.o]), old = IP.processItem(w, base, T, "top", pic, { method: "d221" }), now = IP.processItem(w, base, T, "top", pic);
  const L0 = (r, i) => (r.layers.sleeves[i * 4 + 3] ? r.layers.sleeves : r.layers.topBody).subarray(i * 4, i * 4 + 4);
  const taken = mix.px.filter((i) => L0(old, i)[3] >= 250); assert.ok(mix.px.length > 20 && taken.length > 0.8 * mix.px.length, "d221 took the mix as opaque fabric: " + taken.length + " of " + mix.px.length);
  // (a pixel the extraction does not take at all stays C's — in both versions; only the item's own pixels are compared)
  let unmixed = 0, maxd = 0; for (const i of mix.px) { const p = L0(now, i); if (!p[3]) continue; if (p[3] > 100 && p[3] < 160 && [0, 1, 2].every((c) => Math.abs(p[c] - INK[c]) <= 6)) unmixed++; for (let c = 0; c < 3; c++) maxd = Math.max(maxd, Math.abs(now.composite[i * 4 + c] - pic[i * 4 + c])); }
  assert.ok(unmixed >= 0.8 * mix.px.length, "ink at about half alpha: " + unmixed + " of " + mix.px.length); assert.ok(maxd <= IP.UNMIX_RESIDUAL, "composed on the base it is the picture (max " + maxd + ")");
  let cuffTouched = 0; for (let i = 0; i < N; i++) if (cuff[i * 4 + 3] && (now.layers.sleeves[i * 4 + 3] || now.layers.topBody[i * 4 + 3]) && L0(now, i)[3] < 250) cuffTouched++;
  assert.equal(cuffTouched, 0, "the cuff's fabric keeps full alpha"); assert.ok(now.observations.contourUnmixedPx >= unmixed);
});

test("D-222 pipeline: one manifest in, everything out; the same input gives the same bytes; a raw off its pin, a wrong covering or an output inside the repository is refused", () => {
  const pic = NL.overStack([LEGS, recolour(only(2), { h: 120, s: 0.5 })]), buf = Buffer.from(encodePng(W, WR.H, pic));
  const man = { decision: "D-222", method: "d222", rawRoot: "stand-in", items: [{ id: "bottom-shorts-navy", category: "bottom", type: "shorts", covering: "none", raw: "shorts.png", rawSha256: sha(buf) }] };
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "d222-pipeline-"))); ROOTS.push(root);
  const run = (out, m = man, b = buf) => IP.runPipeline(w, base, T, m, () => b, join(root, out));
  const r1 = run("a"), r2 = run("b");
  assert.equal(r1.method, "d222"); assert.deepEqual(Object.keys(r1.code), [...IP.PIPELINE_CODE]); assert.equal(r1.items["bottom-shorts-navy"].technicallyOk, true);
  for (const f of ["layer-pants.png", "covering-hidden.png", "report.json", "p01-raw-as-received.png", "p02-item-layers.png", "p03-on-c.png", "p07-visibility-and-seams.png"]) assert.ok(existsSync(join(root, "a", "items", "bottom-shorts-navy", f)), f);
  const rep = JSON.parse(readFileSync(join(root, "a", "items", "bottom-shorts-navy", "report.json"), "utf8")); assert.deepEqual(rep.categoryRules, IP.CATEGORY_RULES.bottom); assert.ok(rep.extractionRulePx["base interior / own base garment"] > 0);
  const bytes = (d) => { const o = {}; const walk = (p, rel) => { for (const f of readdirSync(p, { withFileTypes: true })) f.isDirectory() ? walk(join(p, f.name), rel + f.name + "/") : (o[rel + f.name] = sha(readFileSync(join(p, f.name)))); }; walk(join(root, d), ""); return o; };
  assert.deepEqual(bytes("a"), bytes("b"), "two runs, byte for byte the same");
  const bad = Buffer.from(buf); bad[bad.length - 20] ^= 1; assert.throws(() => run("c", man, bad), /does not match its pinned sha256/); assert.ok(!existsSync(join(root, "c", "items")), "nothing is processed before every raw matches its pin");
  assert.throws(() => run("d", { ...man, items: [{ ...man.items[0], covering: "closed-footwear" }] }), /covering/);
  assert.throws(() => run("e", { ...man, method: "d999" }), /unknown method/);
  assert.throws(() => IP.runPipeline(w, base, T, man, () => buf, join(REPO, "tools", "avatar", "build", "d222-probe")), /inside the repository/);
});

test("D-222 the tracked manifest pins the nine original D-207 pictures by the hashes D-207 recorded; covering follows the item's type", () => {
  const man = fixture("item-pipeline-manifest-d222.json"), calls = fixture("item-pilot-calls-v1.json"); assert.ok(IP.validateManifest(man)); assert.equal(man.method, "d222", "D-222's record keeps its method version");
  assert.deepEqual(man.items.map((it) => it.id).sort(), Object.keys(IP.ITEMS).sort());
  for (const it of man.items) { const e = calls.calls.find((c) => c.callId === it.sourceCall); assert.equal(e.result.imageSha256, it.rawSha256, it.id); assert.equal(e.outcome, it.d207Outcome, it.id); assert.equal(it.raw, it.sourceCall + "/d207.image-1.png"); }
  assert.deepEqual(man.items.filter((it) => it.category === "shoes").map((it) => [it.type, it.covering]), [["sandals", "open-footwear"], ["boots", "closed-footwear"], ["sneakers", "closed-footwear"]]);
});

test("D-222 records results under a new method version: D-207's outcomes and D-221's results unchanged, no image call, no automatic approval", () => {
  const RES = fixture("item-method-results-d222.json"), D221 = fixture("item-method-results-d221.json"), man = fixture("item-pipeline-manifest-d222.json");
  assert.deepEqual([RES.decision, RES.method, RES.recordsResultsOnly, RES.rewritesD207, RES.rewritesD221, RES.imageCalls], ["D-222", "d222", true, false, false, 0]);
  assert.match(RES.note, /not visual approval/); assert.equal(RES.visualReview.by, "Claude (not the owner)");
  for (const it of man.items) { const r = RES.items[it.id]; assert.equal(r.rawSha256, it.rawSha256); assert.equal(r.d207Outcome, it.d207Outcome); assert.deepEqual(r.methodD221, D221.items[it.id].methodD221, it.id + ": D-221's result as recorded"); }
  assert.deepEqual(Object.entries(RES.items).filter(([, r]) => !r.methodD222.technicallyOk).map(([k]) => k), ["shoes-sandals-brown"], "the sandals still fail");
  assert.deepEqual(RES.reproducibility.code && Object.keys(RES.reproducibility.code), [...IP.PIPELINE_CODE]);
  const REG = readFileSync(join(REPO, "docs", "project-state.md"), "utf8"); assert.equal(REG.split("\n").filter((l) => l.startsWith("| **D-222** |")).length, 1);
});

// ── D-223: the outfit check at the seams between categories, its fault stimuli both ways, and the findings register ─────────
const outfit = (layers, opts = {}) => BC.outfitCheck(w, base, BF.layerProof(w, base.R, base.Z, { ...min, ...layers }, { sep: base.sep, headSeam: "d201", enclosure: "c-exterior", ...opts }));
const okOf = (r, id) => r.checks.find((c) => c.id === id).ok;
const seamRow = (() => { let s = 0; for (let i = 0; i < N; i++) if (base.sep.lab[i] === 1) s = Math.max(s, (i / W) | 0); return s; })();
const rows = (L, y0, y1, f) => { const o = new Uint8ClampedArray(L); for (let y = y0; y <= y1; y++) for (let x = 0; x < W; x++) f(o, y * W + x); return o; };

test("D-223 outfit check: C's minimum items, C's own gaps and intended openings pass; a sandal's openings are its covering's, not a cut", () => {
  const r = outfit({}); assert.ok(r.ok, JSON.stringify(r.checks.filter((c) => !c.ok)));
  // a sandal (straps only) over the minimum items: its openings show the foot — no cut, no slit
  let fb = 0; for (let i = 0; i < N; i++) if (LEGS[i * 4 + 3] >= 128) fb = Math.max(fb, (i / W) | 0);
  const straps = new Uint8ClampedArray(N * 4); for (let y = fb - 40; y <= fb + 6; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (T.shoes.allowed[i] && LEGS[i * 4 + 3] >= 128 && (y > fb - 4 || (y >= fb - 30 && y < fb - 22))) straps.set([140, 86, 46, 255], i * 4); }
  assert.ok(outfit({ shoes: straps }).ok, "a sandal's openings are intended");
  // normal antialias: the top's hem row half transparent (alpha 140) over the shorts is no background
  const aa = rows(min.topBody, seamRow, seamRow, (o, i) => { if (o[i * 4 + 3]) o[i * 4 + 3] = 140; }); assert.ok(okOf(outfit({ topBody: aa }), "COMBO-1a-SEAM-BACKGROUND"));
});

test("D-223 outfit check: a shifted waistband (a slit between top and bottoms) and a missing overlap fail; a hole at the wrist is a cut; a wrong shoe/bottoms order fails", () => {
  // the shorts start k px below the top's lower edge in each column (they no longer reach under it): background between them
  const topEnd = new Int32Array(W).fill(-1); for (let i = 0; i < N; i++) if (min.topBody[i * 4 + 3] >= 128) topEnd[i % W] = Math.max(topEnd[i % W], (i / W) | 0);
  const drop = (k) => { const o = new Uint8ClampedArray(min.pants); for (let i = 0; i < N; i++) { const x = i % W; if (topEnd[x] >= 0 && ((i / W) | 0) <= topEnd[x] + k) o.fill(0, i * 4, i * 4 + 4); } return o; };
  // 4 px: a slit along the waist between two categories
  const lowered = drop(4);
  const slit = outfit({ pants: lowered }); assert.equal(okOf(slit, "COMBO-1a-SEAM-BACKGROUND"), false, JSON.stringify(slit.checks[0].value).slice(0, 300));
  assert.ok(slit.checks[0].value.slits.some((p) => p.seam === "waist/hip"), "named as the waist/hip seam");
  // 14 px: no narrow slit any more, but open base deeper than the fabric band — missing overlap
  const gap = outfit({ pants: drop(14) });
  assert.equal(okOf(gap, "COMBO-1c-MISSING-OVERLAP"), false, JSON.stringify(gap.checks[2].value));
  // a long sleeve over the arm with a 3 px band cut out above the cuff: the arm shows through one garment
  const sleeve = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0; if (y >= A.shoulder.y && y < wristOf(x) - 14 && base.arms[i * 4 + 3] >= 128) sleeve.set([40, 120, 60, 255], i * 4); }
  const cutS = new Uint8ClampedArray(sleeve); for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0; if (y >= wristOf(x) - 40 && y < wristOf(x) - 37) cutS.fill(0, i * 4, i * 4 + 4); }
  assert.ok(okOf(outfit({ sleeves: sleeve }), "COMBO-1d-CUT-IN-GARMENT"), "the whole sleeve: no cut");
  const cut = outfit({ sleeves: cutS }); assert.equal(okOf(cut, "COMBO-1d-CUT-IN-GARMENT"), false, JSON.stringify(cut.checks[3].value).slice(0, 300));
  // trousers reaching over the shoe tops: under the contract order the trousers are seen; a composer putting shoes over them fails
  const S = standInItems(w, base), sh = L.shoes, trousers = new Uint8ClampedArray(min.pants); for (let i = 0; i < N; i++) if (LEGS[i * 4 + 3] >= 128 && sh[i * 4 + 3] >= 128 && !base.sep.lab[i]) trousers.set([150, 130, 90, 255], i * 4);
  assert.ok(okOf(outfit({ pants: trousers, shoes: sh }), "COMBO-3-ORDER"));
  assert.equal(okOf(outfit({ pants: trousers, shoes: sh }, { order: "shoes-over-bottoms" }), "COMBO-3-ORDER"), false);
  assert.ok(S["min-shorts"]);
});

test("D-223 outfit check: a garment's leftover line 1–3 px beside another category's outline along a seam is a double contour; one outline alone is not", () => {
  const ink = [20, 15, 10, 255], longTop = rows(min.topBody, seamRow + 1, seamRow + 3, (o, i) => { if (base.sep.lab[i] === 2 && LEGS[i * 4 + 3] >= 128) o.set(i < (seamRow + 3) * W ? [60, 150, 150, 255] : ink, i * 4); });
  const lined = rows(min.pants, seamRow + 6, seamRow + 6, (o, i) => { if (o[i * 4 + 3]) o.set(ink, i * 4); });
  assert.ok(okOf(outfit({ topBody: longTop }), "COMBO-2-DOUBLE-CONTOUR"), "the top's hem line alone");
  const d = outfit({ topBody: longTop, pants: lined }); assert.equal(okOf(d, "COMBO-2-DOUBLE-CONTOUR"), false, JSON.stringify(d.checks[4].value).slice(0, 300));
});

test("D-223 findings register: every finding names its subject, place, picture, status and method version; an open finding keeps an outfit from being ready", () => {
  const reg = fixture("findings-register.json"); assert.ok(IP.validateRegister(reg));
  assert.throws(() => IP.validateRegister({ findings: [{ ...reg.findings[0], status: "done" }] }), /unknown status/);
  assert.throws(() => IP.validateRegister({ findings: [{ ...reg.findings[0], status: "accepted-by-owner" }] }), /owner/);
  assert.throws(() => IP.validateRegister({ findings: [{ ...reg.findings[1], resolvedBy: "d999" }] }), /resolved by no method/);
  const byId = Object.fromEntries(reg.findings.map((f) => [f.id, f]));
  assert.deepEqual([byId["F-002"].status, byId["F-002"].resolvedBy, byId["F-008"].status], ["resolved", "d223", "open"], "the tee + khaki slit is resolved by d223; the sandals stay open");
  assert.deepEqual(IP.openFindingsFor(reg, ["top-tee-red", "bottom-trousers-khaki", "shoes-boots-black"]).sort(), ["F-001", "F-006", "F-011"]);
  assert.deepEqual(IP.openFindingsFor(reg, ["top-tee-red", "bottom-trousers-khaki", "shoes-sneakers-white"]).sort(), ["F-010", "F-011"], "with sneakers the boot findings do not apply");
  assert.deepEqual(IP.openFindingsFor(reg, ["top-tank-teal", "bottom-shorts-navy", "shoes-sneakers-white"]), [], "an outfit with no open finding");
  const man = fixture("item-pipeline-manifest-d223.json"); assert.equal(man.method, "d223", "D-223's record keeps its method version"); assert.ok(IP.validateManifest(man)); assert.equal(man.findingsRegister, "tools/avatar/fixtures/northstar-wardrobe/findings-register.json");
});

test("D-223 records results under method d223: the known slit is found on the d222 items and gone on d223; open findings keep outfits from being ready; earlier records unchanged", () => {
  const RES = fixture("item-method-results-d223.json"), reg = fixture("findings-register.json");
  assert.deepEqual([RES.decision, RES.method, RES.recordsResultsOnly, RES.rewritesEarlierRecords, RES.imageCalls], ["D-223", "d223", true, false, 0]);
  // D-225 only adds a `classification` to some findings; without it the register is byte for byte the one D-223 ran with
  const regD223 = { ...reg, findings: reg.findings.map(({ classification, ...f }) => f) };
  assert.equal(RES.reproducibility.registerSha256, sha(Buffer.from(JSON.stringify(regD223))), "the run used this register");
  const k = "top-tee-red+bottom-trousers-khaki+shoes-sneakers-white";
  assert.deepEqual([RES.d222VsD223[k].d222.ok, RES.d222VsD223[k].d222.failed, RES.d222VsD223[k].d223.ok], [false, ["COMBO-1a-SEAM-BACKGROUND"], true], "the outfit check finds the known slit on the d222 items, not on d223");
  assert.equal(RES.outfits[k].status, "technically-ok-open-finding"); assert.deepEqual(RES.outfits[k].openFindings.sort(), IP.openFindingsFor(reg, k.split("+")).sort());
  for (const [name, o] of Object.entries(RES.outfits)) if (o.status === "technically-ok") assert.deepEqual(IP.openFindingsFor(reg, name.split("+")), [], name + " is ready only without an open finding");
  assert.deepEqual(RES.summary, { technicallyOk: 10, technicallyOkOpenFinding: 3, rejected: 5 }); assert.equal(RES.items["shoes-sandals-brown"].status, "rejected");
  const REG = readFileSync(join(REPO, "docs", "project-state.md"), "utf8"); assert.equal(REG.split("\n").filter((l) => l.startsWith("| **D-223** |")).length, 1);
});
