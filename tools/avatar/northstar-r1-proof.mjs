// D-253 R1 LOCAL TECHNICAL PROOF — no image call. Builds the three cut templates from their pinned raw pictures (the production
// extraction, d240), writes each call's Image 1 (the template canvas) and runs SIMULATED outputs through the R1 composition and
// the production checks, with the existing items. The simulated outputs are made by this script (procedural material inside the
// template, shifted and spilled on purpose): they prove the composition and the checks, NEVER what an image model can do.
// Usage: node tools/avatar/northstar-r1-proof.mjs --out <dir outside the repo>
// Writes only outside the repository (the canvases are C-coordinate silhouettes of generated items; the sheets show C).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, dirname, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { encodePng, decodePng } from "./r3-hair-tool-v2.mjs";
import * as WR from "./northstar-wardrobe.mjs";
import * as BF from "./northstar-base-figure.mjs";
import * as BC from "./northstar-base-figure-c.mjs";
import * as IP from "./northstar-item-pilot.mjs";
import * as R1 from "./northstar-r1-garment.mjs";
import { inputs } from "./northstar-shape-experiment.mjs";
import { flat, crop, grid, down } from "./northstar-wardrobe-poc.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ART = join(homedir(), "Documents", "DenSejeApp-artefacts"), { W, N } = WR, H = N / W;
const sha = (b) => createHash("sha256").update(b).digest("hex");
export const CUTS = Object.freeze({
  top: { cut: "tee-hip", from: "top-tee-hip-cream" },
  bottom: { cut: "trousers-square", from: "bottom-trousers-square-olive" },
  shoes: { cut: "ankleboot", from: "shoes-ankleboots-brown" },
});
// the existing technically OK items of the public K set the new items are combined with (D-242)
export const PARTNERS = Object.freeze({ top: ["top-tee-hip-cream", "top-tee-hip-blue"], bottom: ["bottom-capri-lightblue", "bottom-shorts-navy", "bottom-skirt-sand", "bottom-trousers-square-olive"], shoes: ["shoes-sneakers-white", "shoes-boots-laceup-black"] });

/** A simulated output (NOT a model output): procedural material in the template's fold shading, a dark outline on its edge,
 *  shifted by (dx, dy) and spilled `spill` px beyond the silhouette; transparent elsewhere. */
export function simulate(t, material, { dx = 0, dy = 0, spill = 0, hole = null } = {}) {
  const o = new Uint8ClampedArray(N * 4), edge = new Uint8Array(N);
  for (let i = W; i < N - W; i++) if (t.core[i] && (!t.core[i - 1] || !t.core[i + 1] || !t.core[i - W] || !t.core[i + W])) edge[i] = 1;
  const paint = (i, j) => { const x = i % W, y = (i / W) | 0, s = t.shade[j] || 0.5, c = material(x, y); for (let k = 0; k < 3; k++) o[i * 4 + k] = Math.round(c[k] * (0.7 + 0.45 * s)); o[i * 4 + 3] = 255; };
  for (let i = 0; i < N; i++) { if (!t.core[i]) continue; const x = (i % W) - dx, y = ((i / W) | 0) - dy; if (x < 0 || x >= W || y < 0 || y >= H) continue; const j = y * W + x; paint(j, i); if (edge[i]) o.set([40, 30, 28, 255], j * 4); }
  if (spill) { const m = new Uint8Array(N); for (let i = 0; i < N; i++) if (o[i * 4 + 3]) m[i] = 1; const g = WR.maskOps.dilate(m, spill); for (let i = 0; i < N; i++) if (g[i] && !m[i]) o.set([40, 30, 28, 255], i * 4); }
  if (hole) for (let y = hole[1]; y < hole[1] + hole[3]; y++) for (let x = hole[0]; x < hole[0] + hole[2]; x++) o[(y * W + x) * 4 + 3] = 0;
  return o;
}
export const MATERIALS = Object.freeze({
  skinNear: (rgb) => () => rgb,
  houndstooth: () => (x, y) => { const u = (x >> 3) & 3, v = (y >> 3) & 3, on = (u + v) % 4 < 2 !== ((x + y) & 8) > 0; return on ? [30, 30, 32] : [228, 226, 220]; },
});

async function main() {
  const args = process.argv.slice(2), OUT = args[args.indexOf("--out") + 1];
  const r = relative(ROOT, resolve(OUT || ".")); if (!OUT || !(r.startsWith("..") || isAbsolute(r))) throw new Error("--out must be outside the repository (the canvases and sheets are C-derived)");
  mkdirSync(OUT, { recursive: true }); const t0 = Date.now();
  const w = WR.buildWardrobe(), base = BC.prepareBase(w, Uint8ClampedArray.from(decodePng(IP.readC()).px)), T = BC.templatesC(w, base, { revision: "d213" }), C = base.R;
  const all = Object.fromEntries(inputs("all").map((x) => [x.id, x]));
  const proc = {}; const item = (id) => { if (proc[id]) return proc[id]; const it = all[id], buf = readFileSync(join(ART, ...it.raw.split("/"))); if (sha(buf) !== it.rawSha256) throw new Error(id + ": raw not its pinned picture");
    const r0 = IP.processItem(w, base, T, it.category, Uint8ClampedArray.from(decodePng(buf).px), { itemId: id }); if (!r0.ok) throw new Error(id + ": not technically OK under d240");
    return (proc[id] = { category: it.category, layers: r0.layers, shadow: r0.shadow, covering: r0.covering || "none" }); };
  // C's median skin colour: the hardest skin-near material (the garment exactly as C's skin)
  const sk = []; for (let i = 0; i < N; i++) if (C[i * 4 + 3] >= 250 && BF.classify(C, i) === "skin") sk.push(i); if (!sk.length) throw new Error("no skin pixel of C found"); const med = (k) => { const v = sk.map((i) => C[i * 4 + k]).sort((a, b) => a - b); return v[v.length >> 1]; };
  const skin = [med(0), med(1), med(2)];
  const report = { decision: "D-253", revision: R1.R1_REVISION, note: "SIMULATED outputs made by this script — proof of the composition and checks, not of an image model", limits: R1.LIMITS, rules: R1.RULES, skinRgb: skin, cuts: {}, simulations: {}, outfits: {} };
  const tpl = {}, sheets = [];
  for (const [category, c] of Object.entries(CUTS)) { const src = item(c.from), t = R1.templateFromLayers(src.layers, { shadow: src.shadow, covering: src.covering, category, cut: c.cut }); tpl[category] = t;
    const canvas = R1.templateCanvas(t), png = encodePng(W, H, canvas); writeFileSync(join(OUT, "image-1." + c.cut + ".png"), png);
    report.cuts[category] = { cut: c.cut, from: c.from, rawSha256: all[c.from].rawSha256, corePx: t.corePx, closedHolePx: t.closedHolePx, contourPx: t.contourPx, covering: t.covering, canvasSha256: sha(png), canvasBytes: png.length }; }
  const mats = { top: MATERIALS.skinNear(skin), bottom: MATERIALS.houndstooth(), shoes: MATERIALS.skinNear([Math.min(255, skin[0] - 10), skin[1] - 25, skin[2] - 40]) };
  const sims = { S1: { dx: 5, dy: -3, spill: 3 }, S2: { dx: 40, dy: 0 }, S3: { dx: 0, dy: 0, hole: "centre" } }, r1 = {};
  for (const [category, t] of Object.entries(tpl)) for (const [sid, o] of Object.entries(sims)) {
    let hole = null; if (o.hole) { let sx = 0, sy = 0, n = 0; for (let i = 0; i < N; i++) if (t.core[i]) { sx += i % W; sy += (i / W) | 0; n++; } hole = [Math.round(sx / n) - 12, Math.round(sy / n) - 12, 24, 24]; }
    const out = simulate(t, mats[category], { ...o, hole }), comp = R1.compose(out, t, base), name = category + "." + sid;
    const chk = comp.ok ? R1.checkItem(w, base, T, t, comp.layers) : null, dm = R1.designMeasure(Object.values(comp.layers).reduce((u, L) => { for (let i = 0; i < N; i++) if (L[i * 4 + 3]) u.set(L.subarray(i * 4, i * 4 + 4), i * 4); return u; }, new Uint8ClampedArray(N * 4)), t);
    // alpha identity: the composed alpha equals the template's everywhere it is not a hole
    let alphaDiff = 0; const u = new Uint8Array(N); for (const L of Object.values(comp.layers)) for (let i = 0; i < N; i++) if (L[i * 4 + 3] > u[i]) u[i] = L[i * 4 + 3]; for (let i = 0; i < N; i++) if (!comp.masks.hole[i] && u[i] !== t.alpha[i]) alphaDiff++;
    report.simulations[name] = { simulated: true, setup: { ...o, hole }, registration: comp.registration, placement: comp.placement, measures: comp.measures, ok: comp.ok, stopsTheRest: comp.stop, alphaDiffPx: alphaDiff, design: dm, fit: chk ? { ok: chk.ok, failed: chk.failed } : null };
    if (sid === "S1") r1[category] = { category, layers: comp.layers, covering: t.covering, shadow: t.shadow };
    console.log(name, comp.placement, JSON.stringify(comp.registration), "holes", comp.measures.holeCorePx, "alphaDiff", alphaDiff, "fit", chk ? (chk.ok ? "OK" : chk.failed.join(",")) : "-"); }
  // outfits: each S1 item with the existing partners, beside the same outfit with the TEMPLATE item (same geometry) — the method
  // predicts the same outfit result; and the three S1 items together
  const run = (label, ks) => { const r = R1.checkOutfit(w, base, ks); report.outfits[label] = { ok: r.ok, failed: r.failed }; const comp = r.proof.dressedRuntime; sheets.push([label, comp]); return r; };
  const T3 = { top: item(CUTS.top.from), bottom: item(CUTS.bottom.from), shoes: item(CUTS.shoes.from) }, P = (id) => item(id);
  for (const bo of PARTNERS.bottom) for (const sh of PARTNERS.shoes) { run("S1-top+" + bo + "+" + sh, [r1.top, P(bo), P(sh)]); run("TPL-top+" + bo + "+" + sh, [T3.top, P(bo), P(sh)]); }
  for (const tp of PARTNERS.top) for (const sh of PARTNERS.shoes) { run("S1-bottom+" + tp + "+" + sh, [P(tp), r1.bottom, P(sh)]); run("TPL-bottom+" + tp + "+" + sh, [P(tp), T3.bottom, P(sh)]); }
  for (const tp of PARTNERS.top) for (const bo of PARTNERS.bottom) { run("S1-shoes+" + tp + "+" + bo, [P(tp), P(bo), r1.shoes]); run("TPL-shoes+" + tp + "+" + bo, [P(tp), P(bo), T3.shoes]); }
  run("S1-all-three", [r1.top, r1.bottom, r1.shoes]);
  let same = 0, pairs = 0; const diff = []; for (const k of Object.keys(report.outfits)) if (k.startsWith("S1-") && k !== "S1-all-three") { const o = report.outfits["TPL-" + k.slice(3)]; pairs++; if (o.ok === report.outfits[k].ok && o.failed.join() === report.outfits[k].failed.join()) same++; else diff.push(k); }
  report.outfitEquivalence = { pairs, sameResult: same, different: diff };
  const bg = [236, 233, 226], FIGB = [250, 0, 774, 1536], pick = sheets.filter(([l]) => l.startsWith("S1-")).slice(0, 12);
  const g = grid(pick.map(([, c]) => down(flat(c, bg), 262, 768, FIGB)), 6, 8); writeFileSync(join(OUT, "proof-outfits-simulated.png"), encodePng(g.w, g.h, g.px));
  const seams = [[340, 730, 500, 880], [604, 780, 744, 960], [380, 420, 644, 560], [330, 1290, 694, 1510]], allThree = sheets.find(([l]) => l === "S1-all-three")[1];
  const z = grid(seams.map((b) => crop(flat(allThree, bg), b, 2)), 4, 6); writeFileSync(join(OUT, "proof-all-three-seams-x2.png"), encodePng(z.w, z.h, z.px));
  report.ms = Date.now() - t0; report.rssMB = Math.round(process.memoryUsage().rss / 1048576);
  writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log("outfits", Object.keys(report.outfits).length, "equivalence", same + "/" + pairs, "in", Math.round(report.ms / 1000) + " s,", report.rssMB + " MB");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error("REFUSED: " + e.message); process.exit(1); });
