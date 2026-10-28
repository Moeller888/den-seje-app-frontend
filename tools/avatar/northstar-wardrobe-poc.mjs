// NORTHSTAR WARDROBE — LOCAL PROOF OF CONCEPT (D-197). Exercises the fitting system with TEST STIMULI made only from Northstar
// v2's own painted outfit (so the painted quality is the original's): value-preserving recolours, three deterministic SHAPE
// stimuli (a longer top, wider pants, chunkier shoes), two NEGATIVE stimuli that must fail (a cropped top, shorts — the base has
// no body under the clothes) and one FOREIGN item (the R2 armour, drawn for a different figure). Every stimulus is gated with
// the category templates and composed in difficult combinations. TEST STIMULI ARE NOT DESIGNS. No image call; R3 stays OFF.
// Usage: node tools/avatar/northstar-wardrobe-poc.mjs --out <empty dir>
import { writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng } from "./r3-hair-tool-v2.mjs";
import * as NL from "./r3-northstar-layers.mjs";
import * as FG from "./r3-northstar-figure.mjs";
import * as WR from "./northstar-wardrobe.mjs";

const { W, H, N } = WR, sha = (b) => createHash("sha256").update(b).digest("hex");

// ── stimuli ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const hsv2rgb = (h, s, v) => { const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c; const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]; return [(r + m) * 255, (g + m) * 255, (b + m) * 255].map(Math.round); };
/** Value-preserving recolour: every non-ink pixel keeps its value (the painted light and shade), takes hue h and saturation
 *  s scaled by the target; dark ink lines stay as painted. */
export function recolour(P, { h, s, vScale = 1 }) {
  const o = new Uint8ClampedArray(P);
  for (let i = 0; i < N; i++) { if (!P[i * 4 + 3]) continue; const r = P[i * 4], g = P[i * 4 + 1], b = P[i * 4 + 2], v = Math.max(r, g, b) / 255; if (v < 0.22) continue; o.set(hsv2rgb(h, s, Math.min(1, v * vScale)), i * 4); }
  return o;
}
const sampleNN = (P, sx, sy) => { const x = Math.round(sx - 0.5), y = Math.round(sy - 0.5); return x < 0 || y < 0 || x >= W || y >= H ? null : P.subarray((y * W + x) * 4, (y * W + x) * 4 + 4); };
const sampleBL = (P, sx, sy) => { const fx = sx - 0.5, fy = sy - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0; let a = 0; const c = [0, 0, 0];
  for (const [dx, dy, w] of [[0, 0, (1 - ax) * (1 - ay)], [1, 0, ax * (1 - ay)], [0, 1, (1 - ax) * ay], [1, 1, ax * ay]]) { const xx = x0 + dx, yy = y0 + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const j = (yy * W + xx) * 4, aa = P[j + 3] / 255 * w; a += aa; for (let k = 0; k < 3; k++) c[k] += P[j + k] * aa; }
  return a > 0 ? [...c.map((v) => Math.round(v / a)), Math.round(a * 255)] : null; };
/** Inverse-mapped warp of one layer (bilinear on premultiplied colour). */
export function warp(P, inv) { const o = new Uint8ClampedArray(N * 4); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const s = inv(x + 0.5, y + 0.5); if (!s) continue; const v = sampleBL(P, s[0], s[1]); if (v) o.set(v, (y * W + x) * 4); } return o; }
export function cut(P, keep) { const o = new Uint8ClampedArray(P); for (let i = 0; i < N; i++) if (!keep(i % W, (i / W) | 0)) o[i * 4 + 3] = 0; return o; }

export function stimuli(w) {
  const A = w.anchors, L = w.base.layers, top = NL.overStack([L["top-body"], L["top-sleeves"]]), pants = L.pants, shoes = L.shoes, out = {};
  // recolours (the default shapes)
  out["top-red"] = { category: "top", kind: "recolour", image: recolour(top, { h: 2, s: 0.62 }) };
  out["top-navy"] = { category: "top", kind: "recolour", image: recolour(top, { h: 222, s: 0.55, vScale: 0.7 }) };
  out["pants-black"] = { category: "pants", kind: "recolour", image: recolour(pants, { h: 220, s: 0.12, vScale: 0.55 }) };
  out["pants-khaki"] = { category: "pants", kind: "recolour", image: recolour(pants, { h: 38, s: 0.38, vScale: 1.35 }) };
  out["shoes-white"] = { category: "shoes", kind: "recolour", image: recolour(shoes, { h: 0, s: 0, vScale: 1.18 }) };
  out["shoes-red"] = { category: "shoes", kind: "recolour", image: recolour(shoes, { h: 356, s: 0.6 }) };
  // shape: a longer top — the trunk below the armpit stretched so the hem drops to just above the crotch band
  const k0 = A.sleeveEndY.left - 80, hemT = A.crotchY - w.contract.margins.topAboveCrotchPx - 2, f = (hemT - k0) / (A.waistHemY - k0);
  const longBody = NL.overStack([L["top-body"], warp(L["top-body"], (x, y) => [x, y <= k0 ? y : k0 + (y - k0) / f])]);
  out["top-long-red"] = { category: "top", kind: "shape", image: recolour(NL.overStack([longBody, L["top-sleeves"]]), { h: 2, s: 0.62 }) };
  // shape: wider pants — above the crotch widened about the body centre, below it EACH LEG about its own centre line (the
  // per-row midpoint of that leg), blended in over 60 rows; drawn over the original so the legs only grow
  const legMid = (y, side) => { let a = -1, b = -1; for (let x = side === "left" ? 0 : A.centreX; x < (side === "left" ? A.centreX : W); x++) if (pants[(y * W + x) * 4 + 3] >= 128) { if (a < 0) a = x; b = x; } return a < 0 ? null : (a + b + 1) / 2; };
  const mids = { left: new Float32Array(H), right: new Float32Array(H) }; for (let y = 0; y < H; y++) for (const s of ["left", "right"]) mids[s][y] = legMid(y, s) ?? A.centreX;
  const y0 = A.waistbandY + 20, y1 = y0 + 60, kWide = 1.18;
  const wide = warp(pants, (x, y) => { const t = y <= y0 ? 0 : y >= y1 ? 1 : (y - y0) / (y1 - y0), k = 1 + (kWide - 1) * t; const c = y < A.crotchY ? A.centreX : mids[x < A.centreX ? "left" : "right"][y]; return [c + (x - c) / k, y]; });
  out["pants-wide-black"] = { category: "pants", kind: "shape", image: recolour(NL.overStack([pants, wide]), { h: 220, s: 0.12, vScale: 0.55 }) };
  // shape: chunkier shoes — each foot 1.15x about its own sole centre, so the ground line stays
  const feet = { left: [1e9, -1], right: [1e9, -1] }; for (let i = 0; i < N; i++) if (shoes[i * 4 + 3] >= 128) { const x = i % W, s = x < A.centreX ? "left" : "right"; feet[s][0] = Math.min(feet[s][0], x); feet[s][1] = Math.max(feet[s][1], x); }
  out["shoes-chunky-white"] = { category: "shoes", kind: "shape", image: recolour(warp(shoes, (x, y) => { const s = x < A.centreX ? "left" : "right", cx = (feet[s][0] + feet[s][1] + 1) / 2, gy = A.groundY + 1; return [cx + (x - cx) / 1.15, gy + (y - gy) / 1.15]; }), { h: 0, s: 0, vScale: 1.18 }) };
  // negative: a cropped top and shorts — they would reveal a body the base does not have
  out["NEG-top-cropped"] = { category: "top", kind: "negative", image: recolour(cut(top, (x, y) => y < A.waistHemY - 70), { h: 2, s: 0.62 }) };
  out["NEG-pants-shorts"] = { category: "pants", kind: "negative", image: recolour(cut(pants, (x, y) => y < A.crotchY + 200), { h: 38, s: 0.38, vScale: 1.35 }) };
  return out;
}

/** The R2 armour (drawn for the R2 base, a different figure) placed on the Northstar canvas by the best uniform scale +
 *  translation of its own base onto Northstar's — the honest test of a foreign item without per-item art. */
export async function foreignArmour(w) {
  const { chromium } = await import("@playwright/test"), http = await import("node:http"), fs = await import("node:fs"), path = await import("node:path");
  const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", ".."), srv = http.createServer((q, r) => { if (q.url === "/x.html") { r.writeHead(200, { "content-type": "text/html" }); return r.end("<!doctype html><body></body>"); } const p = path.join(ROOT, decodeURIComponent(q.url)); if (!fs.existsSync(p)) { r.writeHead(404); return r.end(); } r.writeHead(200, { "content-type": "image/webp" }); r.end(fs.readFileSync(p)); });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r)); const b = await chromium.launch();
  try { const p = await b.newPage(); await p.goto(`http://127.0.0.1:${srv.address().port}/x.html`);
    const dec = async (src) => Uint8ClampedArray.from(await p.evaluate(async (src) => { const im = new Image(); im.src = src; await im.decode(); const c = document.createElement("canvas"); c.width = 512; c.height = 768; const x = c.getContext("2d"); x.drawImage(im, 0, 0); return Array.from(x.getImageData(0, 0, 512, 768).data); }, src));
    const base = await dec("/assets/avatar-r2/base/body-neutral-medium-v2.webp"), armour = await dec("/assets/avatar-r2/torso/armor-knight-r2-v1.webp");
    // fit the R2 base's tee+trunk silhouette (rows of its torso) to Northstar's top bbox: uniform scale + translation
    let x0 = 512, x1 = -1, ya = 768, yb = -1; for (let i = 0; i < 512 * 768; i++) if (armour[i * 4 + 3] >= 128) { const x = i % 512, y = (i / 512) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); ya = Math.min(ya, y); yb = Math.max(yb, y); }
    const T = w.anchors.bbox.top, s = (T.x1 - T.x0 + 1) / (x1 - x0 + 1), tx = T.x0 - s * x0, ty = T.y0 - s * ya;
    const o = new Uint8ClampedArray(N * 4); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const sx = (x - tx) / s, sy = (y - ty) / s; if (sx < 0 || sy < 0 || sx >= 512 || sy >= 768) continue; const j = ((sy | 0) * 512 + (sx | 0)) * 4; if (armour[j + 3]) o.set(armour.subarray(j, j + 4), (y * W + x) * 4); }
    void base; return { category: "top", kind: "foreign", image: o, transform: { s: +s.toFixed(4), tx: +tx.toFixed(1), ty: +ty.toFixed(1) } };
  } finally { await b.close(); srv.close(); }
}

// ── images ──────────────────────────────────────────────────────────────────────────────────────────────────────────
export const flat = (P, bg = [255, 255, 255]) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) { const a = P[i * 4 + 3] / 255; for (let c = 0; c < 3; c++) o[i * 4 + c] = Math.round(P[i * 4 + c] * a + bg[c] * (1 - a)); o[i * 4 + 3] = 255; } return o; };
export const crop = (P, [x0, y0, x1, y1], s = 1) => { const w = (x1 - x0) * s, h = (y1 - y0) * s, o = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const j = ((y0 + ((y / s) | 0)) * W + x0 + ((x / s) | 0)) * 4; o.set(P.subarray(j, j + 4), (y * w + x) * 4); } return { w, h, px: o }; };
export const down = (P, w2, h2, [x0, y0, x1, y1] = [0, 0, W, H]) => { const o = new Uint8ClampedArray(w2 * h2 * 4), sx = (x1 - x0) / w2, sy = (y1 - y0) / h2; for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) { const acc = [0, 0, 0]; let n = 0; for (let yy = Math.floor(y0 + y * sy); yy < Math.ceil(y0 + (y + 1) * sy); yy++) for (let xx = Math.floor(x0 + x * sx); xx < Math.ceil(x0 + (x + 1) * sx); xx++) { const j = (yy * W + xx) * 4; for (let c = 0; c < 3; c++) acc[c] += P[j + c]; n++; } o.set([...acc.map((v) => Math.round(v / n)), 255], (y * w2 + x) * 4); } return { w: w2, h: h2, px: o }; };
export function grid(t, cols, gap = 8) { const w = Math.max(...t.map((x) => x.w)), h = Math.max(...t.map((x) => x.h)), rows = Math.ceil(t.length / cols), Wd = cols * w + (cols - 1) * gap, Hd = rows * h + (rows - 1) * gap, o = new Uint8ClampedArray(Wd * Hd * 4).fill(255); t.forEach((x, k) => { const ox = (k % cols) * (w + gap), oy = Math.floor(k / cols) * (h + gap); for (let y = 0; y < x.h; y++) o.set(x.px.subarray(y * x.w * 4, (y + 1) * x.w * 4), ((oy + y) * Wd + ox) * 4); }); return { w: Wd, h: Hd, px: o }; }
const FIG = [250, 0, 774, 1536];

export async function run(OUT) {
  const w = WR.buildWardrobe(), S = stimuli(w); S["FOREIGN-r2-armour"] = await foreignArmour(w);
  const files = {}, save = (n, img, what) => { const b = encodePng(img.w, img.h, img.px); writeFileSync(join(OUT, n), b); files[n] = { sha256: sha(b), w: img.w, h: img.h, what }; };
  const report = {};
  for (const [id, s] of Object.entries(S)) { const layers = WR.splitItem(s.category, s.image, w.templates); report[id] = { category: s.category, kind: s.kind, ...WR.checkItem(s.category, layers, w.templates, w.contract), transform: s.transform }; s.layers = layers; }
  const headAfro = FG.composeFigure({ ...w.fg, body: new Uint8ClampedArray(N * 4) }, "afro"), headShort = FG.composeFigure({ ...w.fg, body: new Uint8ClampedArray(N * 4) }, "short");
  const outfit = (...ids) => Object.fromEntries(ids.map((id) => [S[id].category, S[id].layers]));
  const combos = [
    ["default", w.head, {}], ["recolours", w.head, outfit("top-red", "pants-black", "shoes-white")], ["navy+khaki+red", headShort, outfit("top-navy", "pants-khaki", "shoes-red")],
    ["long+wide+chunky", headAfro, outfit("top-long-red", "pants-wide-black", "shoes-chunky-white")], ["NEG cropped+shorts", w.head, outfit("NEG-top-cropped", "NEG-pants-shorts")], ["FOREIGN armour", w.head, outfit("FOREIGN-r2-armour")],
  ];
  const figs = combos.map(([name, head, o]) => ({ name, P: WR.composeOutfit(w.base, head, o) }));
  save("p01-outfits-third.png", grid(figs.map((f) => down(flat(f.P), Math.round((FIG[2] - FIG[0]) / 3), 512, FIG)), 6), "Default · recolours · navy/khaki/red with short · long/wide/chunky with afro · NEGATIVE cropped+shorts · FOREIGN R2 armour (1/3)");
  const hard = figs[3].P, def = figs[0].P;
  save("p02-neck-shoulders-x2.png", grid([crop(flat(def), [360, 440, 664, 620], 2), crop(flat(figs[1].P), [360, 440, 664, 620], 2), crop(flat(hard), [360, 440, 664, 620], 2)], 3), "Neck, collar and shoulders ×2: default · recolour · long top (the head stack lies over every collar)");
  save("p03-waist-hands-x2.png", grid([crop(flat(def), [330, 740, 700, 920], 2), crop(flat(hard), [330, 740, 700, 920], 2)], 1), "Waist, hem and hands ×2: default · long top over wide pants — hands stay on top, the hem over the waistband");
  save("p04-ankles-shoes-x2.png", grid([crop(flat(def), [370, 1290, 660, 1500], 2), crop(flat(hard), [370, 1290, 660, 1500], 2)], 2), "Ankles and shoes ×2: default · wide pants over chunky shoes on the same ground line");
  save("p05-negatives-x2.png", grid([crop(flat(figs[4].P, [255, 0, 200]), [330, 700, 700, 1100], 1), crop(flat(figs[5].P), [300, 440, 724, 960], 1)], 2), "Missing material, shown honestly: the cropped top and the shorts open holes (magenta = nothing there); the foreign armour sits wrong");
  // template masks over the default figure
  const tm = (t) => { const o = flat(def); for (let i = 0; i < N; i++) { const c = t.protect[i] ? [230, 0, 60] : t.mustCover[i] ? [0, 160, 255] : t.allowed[i] ? [120, 220, 120] : null; if (c) for (let k = 0; k < 3; k++) o[i * 4 + k] = Math.round(o[i * 4 + k] * 0.45 + c[k] * 0.55); } return down(o, Math.round((FIG[2] - FIG[0]) / 3), 512, FIG); };
  save("p06-templates-third.png", grid([tm(w.templates.top), tm(w.templates.pants), tm(w.templates.shoes)], 3), "Category templates: top · pants · shoes — blue must cover, green may draw, red protected");
  // app sizes: hub 110x165 and quiz 52x78 (whole canvas, contain)
  save("p07-app-sizes.png", grid([...figs.slice(0, 4).map((f) => down(flat(f.P, [30, 32, 96]), 110, 165)), ...figs.slice(0, 4).map((f) => down(flat(f.P, [30, 32, 96]), 52, 78))], 4, 6), "Hub 110×165 and quiz 52×78 at actual size: default · recolours · navy/khaki/red · long/wide/chunky");
  // extraction round trip: a simulated generator picture (ref with one category repainted, shifted 3/-2) → item layers
  const key = w.contract.extraction.key, shift = (P, dx, dy) => { const o = new Uint8ClampedArray(N * 4); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const sx = Math.min(W - 1, Math.max(0, x - dx)), sy = Math.min(H - 1, Math.max(0, y - dy)); o.set(P.subarray((sy * W + sx) * 4, (sy * W + sx) * 4 + 4), (y * W + x) * 4); } return o; };
  const roundTrip = {}, rtTiles = [];
  for (const id of ["top-long-red", "pants-wide-black", "shoes-red"]) {
    const s = S[id], R = WR.referencePictures(w, s.category), truth = s.layers, out = shift(WR.onKey(WR.composeOutfit(w.base, w.head, { ...R.others, [s.category]: truth }), key), 3, -2);
    const r = WR.extractItem(s.category, out, R.ref, w.templates, w.contract, R.behind), gate = WR.checkItem(s.category, r.layers, w.templates, w.contract);
    const A = WR.composeOutfit(w.base, w.head, { [s.category]: truth }), B = WR.composeOutfit(w.base, w.head, { [s.category]: r.layers }); let big = 0, px = 0;
    for (let i = 0; i < N; i++) { if (!A[i * 4 + 3] && !B[i * 4 + 3]) continue; px++; if (Math.max(...[0, 1, 2, 3].map((c) => Math.abs(A[i * 4 + c] - B[i * 4 + c]))) > 48) big++; }
    roundTrip[id] = { registration: r.registration, gatesOk: gate.ok, failed: gate.checks.filter((c) => !c.ok).map((c) => ({ id: c.id, value: c.value })), pxOver48: big, shareOver48: +(big / px).toFixed(4) };
    const box = s.category === "top" ? [330, 440, 700, 880] : s.category === "pants" ? [360, 760, 680, 1380] : [370, 1300, 660, 1500];
    rtTiles.push(crop(flat(out), box), crop(flat(A), box), crop(flat(B), box));
  }
  // the three generator inputs of the pilot (one per category): reference pictures, opaque on the key
  for (const cat of ["top", "pants", "shoes"]) { const R = WR.referencePictures(w, cat); save(`ref-${cat}.png`, { w: W, h: H, px: R.ref }, `Generator input for one ${cat} item: the base figure wearing the default ${cat}, the other categories clipped to their guaranteed cores, on the magenta key`); }
  const drift = WR.referencePictures(w, "top"); roundTrip.drift10px = WR.extractItem("top", shift(drift.ref, 10, 0), drift.ref, w.templates, w.contract, drift.behind).registration;
  save("p08-extraction-roundtrip.png", grid(rtTiles, 3, 10), "Extraction round trip per row: simulated generator picture (on the key, shifted 3/−2) · the truth in the outfit · the extracted item in the outfit");
  writeFileSync(join(OUT, "report.json"), JSON.stringify({ decision: WR.DECISION, anchors: w.anchors, splits: w.splits, stimuli: report, roundTrip, files }, null, 1) + "\n");
  report.__roundTrip = roundTrip;
  return { report, files, anchors: w.anchors };
}

const invokedDirectly = typeof process.argv[1] === "string" && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  const args = process.argv.slice(2), i = args.indexOf("--out"), outDir = i >= 0 ? args[i + 1] : null; if (!outDir) throw new Error("usage: --out <empty dir>");
  const OUT = resolve(outDir); if (existsSync(OUT) && readdirSync(OUT).length) throw new Error("output directory not empty"); mkdirSync(OUT, { recursive: true });
  const r = await run(OUT);
  const { __roundTrip, ...stims } = r.report;
  for (const [id, s] of Object.entries(stims)) console.log(id.padEnd(20), s.kind.padEnd(9), s.ok ? "PASS" : "FAIL", s.checks.filter((c) => !c.ok).map((c) => `${c.id} ${JSON.stringify(c.value)}`).join(" | "));
  console.log("round trip", JSON.stringify(__roundTrip));
}
