// D-256 — the offline study of D-255's R1-1 (no image call): its geometry against the tee-hip cut, the s1 hypothesis (one uniform
// scale + one translation, northstar-r1-similarity.mjs) applied to it, everything measured BEFORE any cropping, the sheets for the
// visual review (uncropped and cropped, on the cut and on C, close-ups and app sizes), the origin of the look (cut vs output), and
// controls on EXISTING extractions. The method is developed on R1-1 and the controls reuse seen pictures: nothing here is an
// independent validation. Writes only outside the repository (the sheets show C and a private raw result).
// Usage: node tools/avatar/northstar-r1-similarity-proof.mjs --out <dir outside the repo>
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { encodePng, decodePng } from "./r3-hair-tool-v2.mjs";
import * as WR from "./northstar-wardrobe.mjs";
import * as BF from "./northstar-base-figure.mjs";
import * as BC from "./northstar-base-figure-c.mjs";
import * as IP from "./northstar-item-pilot.mjs";
import * as R1 from "./northstar-r1-garment.mjs";
import * as S1 from "./northstar-r1-similarity.mjs";
import * as EV from "./northstar-r1-evaluate.mjs";
import { inputs } from "./northstar-shape-experiment.mjs";
import { flat, crop, grid, down } from "./northstar-wardrobe-poc.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const ART = join(homedir(), "Documents", "DenSejeApp-artefacts"), { W, N } = WR, H = N / W;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const bg = [236, 233, 226], FIGB = [250, 0, 774, 1536], CALL = "R1-1-top-tee-hip-apricot-jersey";
const checker = (P) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0, c = ((x >> 3) + (y >> 3)) % 2 ? 205 : 245, a = P[i * 4 + 3] / 255; for (let k = 0; k < 3; k++) o[i * 4 + k] = Math.round(P[i * 4 + k] * a + c * (1 - a)); o[i * 4 + 3] = 255; } return o; };
const over = (B, P) => { const o = new Uint8ClampedArray(B); for (let i = 0; i < N; i++) { const a = P[i * 4 + 3] / 255; if (!a) continue; for (let k = 0; k < 3; k++) o[i * 4 + k] = Math.round(P[i * 4 + k] * a + B[i * 4 + k] * (1 - a)); o[i * 4 + 3] = Math.max(B[i * 4 + 3], P[i * 4 + 3]); } return o; };
const union = (layers) => { const u = new Uint8ClampedArray(N * 4); for (const L of Object.values(layers)) for (let i = 0; i < N; i++) if (L[i * 4 + 3]) u.set(L.subarray(i * 4, i * 4 + 4), i * 4); return u; };
const half = (P) => down(flat(P, bg), 262, 768, FIGB);
const sub = (a, b) => Object.fromEntries(Object.keys(a).map((k) => [k, +(a[k] - b[k]).toFixed(4)]));

async function main() {
  const args = process.argv.slice(2), OUT = args[args.indexOf("--out") + 1], r = relative(ROOT, resolve(OUT || "."));
  if (!OUT || !(r.startsWith("..") || isAbsolute(r))) throw new Error("--out must be outside the repository (the sheets show C and a private raw result)");
  mkdirSync(OUT, { recursive: true }); const t0 = Date.now();
  const dir = join(ART, "r1-calls", CALL), rec = JSON.parse(readFileSync(join(dir, "r1.record.json"), "utf8")), buf = readFileSync(join(dir, "r1.image-1.png"));
  if (sha(buf) !== rec.imageSha256) throw new Error("R1-1's stored picture is not the one D-255 evaluated");
  const w = WR.buildWardrobe(), base = BC.prepareBase(w, Uint8ClampedArray.from(decodePng(IP.readC()).px)), T = BC.templatesC(w, base, { revision: "d213" }), env = { w, base, T };
  const { t, src } = EV.templateOf(env, "top"), out = Uint8ClampedArray.from(decodePng(buf).px), oM = S1.maskOf(out);
  // 1. the shapes as they came: size and place, and the proportions with size removed
  const gO = S1.geometry(oM), gT = S1.geometry(t.core), nO = S1.normalised(gO), nT = S1.normalised(gT);
  const aniso = { sx: +(gT.width / gO.width).toFixed(4), sy: +(gT.height / gO.height).toFixed(4) };
  // 2. the s1 fit and the fitted garment, measured before any cropping
  const f = S1.fit(oM, t.core), fitted = S1.apply(out, f), before = S1.beforeCrop(fitted, t), gF = S1.geometry(S1.maskOf(fitted));
  const diffPx = { neckTopWidth: gF.neck.topWidth - gT.neck.topWidth, neckDepth: gF.neck.depth - gT.neck.depth, shoulderSpan: gF.shoulderSpan - gT.shoulderSpan, sleeveSpan: gF.sleeveSpan - gT.sleeveSpan,
    sleeveEndRow: gF.sleeveEndRow - gT.sleeveEndRow, bodyWidthBelowSleeves: gF.bodyWidthBelowSleeves - gT.bodyWidthBelowSleeves, hemWidth: gF.hemWidth - gT.hemWidth, top: gF.bbox[1] - gT.bbox[1], bottom: gF.bbox[3] - gT.bbox[3], left: gF.bbox[0] - gT.bbox[0], right: gF.bbox[2] - gT.bbox[2] };
  // 3. the R1 composition of the fitted garment (r1-v1 unchanged; the similarity has already placed it, so no further shift)
  const comp = R1.compose(fitted, t, base, { shift: { dx: 0, dy: 0, coverage: 1 - before.missingShare, iou: f.iou, atWindowEdge: false } }), chk = R1.checkItem(w, base, T, t, comp.layers);
  const layer = union(comp.layers), dm = R1.designMeasure(layer, t);
  let fromCut = 0, fromOut = 0; for (let i = 0; i < N; i++) if (layer[i * 4 + 3]) { if (t.contour[i * 4 + 3]) fromCut++; else fromOut++; }
  // 4. sheets
  const min = BF.minimumItems(base.R, base.sep.lab), dressed = (layers) => BF.layerProof(w, base.R, base.Z, { ...min, ...layers }, { sep: base.sep, headSeam: "d201", enclosure: "c-exterior" }).dressedRuntime;
  const onC = dressed(comp.layers), cFig = dressed({}), uncropped = over(cFig, fitted), tplOnC = dressed(src.layers);
  const mk = new Uint8ClampedArray(checker(fitted)), edge = new Uint8Array(N); for (let i = W; i < N - W; i++) if (t.core[i] && (!t.core[i - 1] || !t.core[i + 1] || !t.core[i - W] || !t.core[i + W])) edge[i] = 1;
  for (let i = 0; i < N; i++) { if (before.masks.missing[i]) mk.set([230, 0, 0, 255], i * 4); else if (before.masks.outside[i]) for (let k = 0; k < 3; k++) mk[i * 4 + k] = Math.round(mk[i * 4 + k] * 0.4 + [255, 140, 0][k] * 0.6); if (edge[i]) mk.set([0, 160, 230, 255], i * 4); }
  const g1 = grid([half(checker(out)), half(checker(fitted)), half(mk), half(uncropped), half(onC), half(tplOnC)], 6, 10); writeFileSync(join(OUT, "s1-overview.png"), encodePng(g1.w, g1.h, g1.px));
  const boxes = { "neck/shoulders": EV.REVIEW["neck/shoulders"], "sleeve left": EV.REVIEW["sleeve/arm left"], "sleeve right": EV.REVIEW["sleeve/arm right"], "chest pocket": EV.REVIEW["chest pocket"], "hem left": EV.REVIEW["waist left"], "hem right": EV.REVIEW["waist right"] };
  const rows = []; for (const b of Object.values(boxes)) rows.push(crop(flat(uncropped, bg), b, 3), crop(flat(mk, bg), b, 3), crop(flat(onC, bg), b, 3), crop(flat(tplOnC, bg), b, 3));
  const g2 = grid(rows, 4, 8); writeFileSync(join(OUT, "s1-closeups-x3.png"), encodePng(g2.w, g2.h, g2.px));
  for (const [n, P] of [["s1-uncropped-on-c", uncropped], ["s1-cropped-on-c", onC], ["s1-map", mk]]) writeFileSync(join(OUT, n + ".png"), encodePng(W, H, flat(P, bg)));
  const zoom = { "underarm left": [380, 600, 450, 680], "underarm right": [574, 600, 644, 680], "sleeve edge left": [300, 560, 370, 640], "neck left": [440, 440, 510, 500] };
  const z = []; for (const b of Object.values(zoom)) z.push(crop(flat(uncropped, bg), b, 6), crop(flat(mk, bg), b, 6), crop(flat(onC, bg), b, 6)); const g4 = grid(z, 3, 6); writeFileSync(join(OUT, "s1-zoom-x6.png"), encodePng(g4.w, g4.h, g4.px));
  const g3 = grid([down(flat(onC, bg), 110, 165), down(flat(tplOnC, bg), 110, 165), down(flat(onC, bg), 52, 78), down(flat(tplOnC, bg), 52, 78)], 4, 8); writeFileSync(join(OUT, "s1-app.png"), encodePng(g3.w, g3.h, g3.px));
  // 5. controls on EXISTING extractions (seen pictures; not a validation): the estimator recovers a known similarity; other tops fit to the tee-hip cut
  const item = (id) => { const it = inputs("all").find((x) => x.id === id), b = readFileSync(join(ART, ...it.raw.split("/"))); if (sha(b) !== it.rawSha256) throw new Error(id + ": raw not pinned"); return IP.processItem(w, base, T, it.category, Uint8ClampedArray.from(decodePng(b).px), { itemId: id }); };
  const synth = S1.apply(union(src.layers), { s: 1.9, tx: -330, ty: -520 }), back = S1.fit(S1.maskOf(synth), t.core);
  const controls = { estimator: { applied: { s: 1.9, tx: -330, ty: -520 }, expectedInverse: { s: +(1 / 1.9).toFixed(5), tx: +(330 / 1.9).toFixed(2), ty: +(520 / 1.9).toFixed(2) }, recovered: back } };
  for (const id of ["top-tee-hip-blue", "top-tank-teal", "top-sweater-green", "top-longsleeve-waist-navy"]) { const L = union(item(id).layers), m = S1.maskOf(L), ff = S1.fit(m, t.core), fx = S1.apply(L, ff), bc = S1.beforeCrop(fx, t);
    controls[id] = { fit: ff, normalisedVsCut: sub(S1.normalised(S1.geometry(m)), nT), beforeCrop: { missingShare: bc.missingShare, outsideShare: bc.outsideShare } }; }
  const report = { decision: "D-256", hypothesis: S1.REVISION, rule: S1.RULE, call: CALL, imageSha256: rec.imageSha256, d255: { classification: rec.classification, placement: rec.placement, unchanged: true },
    note: "developed on R1-1; the controls reuse seen pictures — not an independent validation",
    geometry: { output: gO, cut: gT, fitted: gF }, normalised: { output: nO, cut: nT, outputMinusCut: sub(nO, nT) }, anisotropicDiagnostic: aniso,
    fit: f, beforeCrop: { ...before, masks: undefined }, fittedMinusCutPx: diffPx,
    composedWithR1: { placement: comp.placement, measures: comp.measures, fit: { ok: chk.ok, failed: chk.failed } }, origin: { pxFromCutContour: fromCut, pxFromOutput: fromOut, shareFromOutput: +(fromOut / (fromCut + fromOut)).toFixed(4), design: dm },
    controls, ms: Date.now() - t0, rssMB: Math.round(process.memoryUsage().rss / 1048576) };
  writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ fit: f, aniso, normDiff: report.normalised.outputMinusCut, before: report.beforeCrop, diffPx, composed: report.composedWithR1.placement, fitOk: chk.ok, origin: report.origin.shareFromOutput }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error("REFUSED: " + e.message); process.exit(1); });
