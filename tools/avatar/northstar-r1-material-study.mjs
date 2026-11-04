// D-260 — the offline study of r1-m1 (geometry-free material laid on by the cut; no image call). Three designs from REAL generated
// material already in the project: R1C-1's apricot fabric, rib and pocket (D-259), b1's breton stripes and b1's tartan (D-248). The
// swatches and the pocket are cut out of those pictures by fixed rules (largest square inside the fabric, flattened; the pocket's
// closed outline) — a DEMONSTRATIVE EXTRACTION, because a future call would deliver them on their own. Each design is laid on the
// tee-hip cut by r1-m1 and checked like R1C (holes, own lines, clipped details), with fitCheck and the K-partner outfits beside the
// cut's template item. Sheets for the visual review. Nothing here is an independent validation; all sources were seen before.
// Usage: node tools/avatar/northstar-r1-material-study.mjs --out <dir outside the repo>
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
import * as RC from "./northstar-r1c-evaluate.mjs";
import * as M1 from "./northstar-r1-material.mjs";
import { PARTNERS } from "./northstar-r1-proof.mjs";
import { inputs } from "./northstar-shape-experiment.mjs";
import { flat, crop, grid, down } from "./northstar-wardrobe-poc.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const ART = join(homedir(), "Documents", "DenSejeApp-artefacts"), { W, N } = WR, H = N / W, Mo = WR.maskOps;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const bg = [236, 233, 226], FIGB = [250, 0, 774, 1536];
const lumOf = (P, i) => 0.299 * P[i * 4] + 0.587 * P[i * 4 + 1] + 0.114 * P[i * 4 + 2];
const enlarge = (s, k) => { const w = s.w * k, h = s.h * k, px = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.set(s.px.subarray(((y / k | 0) * s.w + (x / k | 0)) * 4, ((y / k | 0) * s.w + (x / k | 0)) * 4 + 4), (y * w + x) * 4); return { w, h, px }; };

/** DEMONSTRATIVE EXTRACTION from R1C-1's own picture: the body fabric (the largest square inside its fabric, away from its edge,
 *  the rib and the pocket), the rib (the largest square of trim-coloured pixels near its neck) and the pocket (the largest closed
 *  line component on its chest, with the area inside its outline as alpha). */
export function pocketOf(out) {
  const m = S1.maskOf(out), g = S1.geometry(m), lines = RC.lineMask(out);
  // the pocket: line components in the upper half, right of centre; the largest; inside = not reachable from its box border
  const seen = new Uint8Array(N); let best = null;
  for (let s = 0; s < N; s++) { if (!lines[s] || seen[s]) continue; const st = [s]; seen[s] = 1; let n = 0, x0 = W, y0 = H, x1 = 0, y1 = 0;
    while (st.length) { const i = st.pop(), x = i % W, y = (i / W) | 0; n++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (const dy of [-W, 0, W]) for (const dx of [-1, 0, 1]) { const j = i + dy + dx; if ((dx || dy) && j >= 0 && j < N && Math.abs((j % W) - x) <= 1 && lines[j] && !seen[j]) { seen[j] = 1; st.push(j); } } }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2; if (cx > (g.bbox[0] + g.bbox[2]) / 2 && cy < g.bbox[1] + g.height * 0.6 && x1 - x0 > 20 && y1 - y0 > 20 && (!best || n > best.n)) best = { n, box: [x0 - 3, y0 - 3, x1 + 3, y1 + 3] }; }
  if (!best) return null;
  const [px0, py0, px1, py1] = best.box, pw = px1 - px0 + 1, ph = py1 - py0 + 1, outside = new Uint8Array(pw * ph), q = [];
  const isLine = (x, y) => lines[(py0 + y) * W + px0 + x]; for (let x = 0; x < pw; x++) for (const y of [0, ph - 1]) if (!isLine(x, y)) { outside[y * pw + x] = 1; q.push(y * pw + x); }
  for (let y = 0; y < ph; y++) for (const x of [0, pw - 1]) if (!isLine(x, y) && !outside[y * pw + x]) { outside[y * pw + x] = 1; q.push(y * pw + x); }
  // the pocket's own top edge may be open (a fold-over): the outside is the region beyond its line, closed by a 3 px dilation of the line
  const thick = new Uint8Array(pw * ph); for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) if (isLine(x, y)) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < pw && yy < ph) thick[yy * pw + xx] = 1; }
  for (let h = 0; h < q.length; h++) { const i = q[h], x = i % pw; for (const j of [i - 1, i + 1, i - pw, i + pw]) { if (j < 0 || j >= pw * ph || Math.abs((j % pw) - x) > 1 || outside[j] || thick[j]) continue; outside[j] = 1; q.push(j); } }
  const pocket = { w: pw, h: ph, px: new Uint8ClampedArray(pw * ph * 4) }; for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) { const i = (py0 + y) * W + px0 + x; pocket.px.set([out[i * 4], out[i * 4 + 1], out[i * 4 + 2], outside[y * pw + x] ? 0 : 255], (y * pw + x) * 4); }
  return { pocket, box: best.box };
}
export function fromR1C(out) {
  const m = S1.maskOf(out), g = S1.geometry(m), lines = RC.lineMask(out), pk = pocketOf(out), [px0, py0, px1, py1] = pk ? pk.box : [-100, -100, -100, -100];
  // the body fabric: inside the garment eroded 30 px, below the neck rib, outside the pocket's box (grown 20 px)
  const er = Mo.not(Mo.dilate(Mo.not(m), 30)), body = new Uint8Array(N); for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0; if (er[i] && y > g.bbox[1] + g.height * 0.25 && !(x > px0 - 20 && x < px1 + 20 && y > py0 - 20 && y < py1 + 20)) body[i] = 1; }
  const bodyMedian = (() => { const v = []; for (let i = 0; i < N; i++) if (body[i]) v.push(lumOf(out, i)); v.sort((a, b) => a - b); return v[v.length >> 1]; })();
  // the rib: trim-coloured (darker than the body by 12) inside the garment, in its top quarter
  const rib = new Uint8Array(N); for (let i = 0; i < N; i++) { const y = (i / W) | 0; if (m[i] && y < g.bbox[1] + g.height * 0.25 && lumOf(out, i) < bodyMedian - 12 && !lines[i]) rib[i] = 1; }
  const ribEr = Mo.not(Mo.dilate(Mo.not(rib), 2));
  return { body: M1.swatchFrom(out, M1.largestSquare(body, 192)), rib: M1.swatchFrom(out, M1.largestSquare(ribEr, 24)), pocket: pk ? pk.pocket : null, pocketBox: pk ? pk.box : null };
}
/** From an item extracted by the production pipeline (d240) from its pinned raw: the largest square inside its fabric (eroded 6 px). */
export function fromItem(env, id, layerKey) {
  const it = inputs("all").find((x) => x.id === id), b = readFileSync(join(ART, ...it.raw.split("/"))); if (sha(b) !== it.rawSha256) throw new Error(id + ": raw not pinned");
  const r0 = IP.processItem(env.w, env.base, env.T, it.category, Uint8ClampedArray.from(decodePng(b).px), { itemId: id }), L = r0.layers[layerKey];
  const m = new Uint8Array(N); for (let i = 0; i < N; i++) if (L[i * 4 + 3] >= 250) m[i] = 1; const er = Mo.not(Mo.dilate(Mo.not(m), 6));
  return M1.swatchFrom(L, M1.largestSquare(er, 160));
}

async function main() {
  const args = process.argv.slice(2), OUT = args[args.indexOf("--out") + 1], r = relative(ROOT, resolve(OUT || "."));
  if (!OUT || !(r.startsWith("..") || isAbsolute(r))) throw new Error("--out must be outside the repository (the sheets show C and private raw results)");
  mkdirSync(OUT, { recursive: true }); const t0 = Date.now();
  const w = WR.buildWardrobe(), base = BC.prepareBase(w, Uint8ClampedArray.from(decodePng(IP.readC()).px)), T = BC.templatesC(w, base, { revision: "d213" }), env = { w, base, T };
  const { t, src, cl } = RC.cutOf(env);
  const rcDir = join(ART, "r1c-calls", "R1C-1-top-tee-hip-apricot-bleed"), rec = JSON.parse(readFileSync(join(rcDir, "r1c.record.json"), "utf8")), rbuf = readFileSync(join(rcDir, "r1c.image-1.png"));
  if (sha(rbuf) !== rec.imageSha256) throw new Error("R1C-1's picture is not D-259's");
  const ex = fromR1C(Uint8ClampedArray.from(decodePng(rbuf).px)), sR = rec.automatic.placement.s;
  // the pocket: R1C-1's own, if the frozen line detector finds its outline; else R1-1's (D-255; also a real generated pocket)
  let pocketSource = "R1C-1"; if (!ex.pocket) { const d1 = join(ART, "r1-calls", "R1-1-top-tee-hip-apricot-jersey"), r1 = JSON.parse(readFileSync(join(d1, "r1.record.json"), "utf8")), b1 = readFileSync(join(d1, "r1.image-1.png"));
    if (sha(b1) !== r1.imageSha256) throw new Error("R1-1's picture is not D-255's"); const pk = pocketOf(Uint8ClampedArray.from(decodePng(b1).px)); if (!pk) throw new Error("no pocket outline in R1-1 either"); ex.pocket = pk.pocket; ex.pocketBox = pk.box; pocketSource = "R1-1 (R1C-1's pocket lines are below the detector's contrast)"; }
  const breton = fromItem(env, "top-breton-longsleeve", "topBody"), tartan = fromItem(env, "bottom-pleated-skirt-tartan", "pants");
  const designs = {
    "A apricot (R1C-1 fabric and rib, generated pocket)": { body: M1.flatten(ex.body), scale: sR, trim: M1.flatten(ex.rib, 8), trimScale: sR, details: [{ img: ex.pocket, anchor: "chest-left" }] },
    "B breton stripes (b1)": { body: M1.flatten(breton), scale: 1 },
    "C tartan (b1 skirt) + generated pocket": { body: M1.flatten(tartan), scale: 1, details: [{ img: ex.pocket, anchor: "chest-left" }] },
  };
  const min = BF.minimumItems(base.R, base.sep.lab), dressed = (layers) => BF.layerProof(w, base.R, base.Z, { ...min, ...layers }, { sep: base.sep, headSeam: "d201", enclosure: "c-exterior" }).dressedRuntime;
  const memo = new Map(), itemOf = (id) => { if (memo.has(id)) return memo.get(id); const it = inputs("all").find((x) => x.id === id), b = readFileSync(join(ART, ...it.raw.split("/")));
    const r0 = IP.processItem(w, base, T, it.category, Uint8ClampedArray.from(decodePng(b).px), { itemId: id }); const v = { category: it.category, layers: r0.layers, covering: r0.covering || "none" }; memo.set(id, v); return v; };
  const report = { decision: "D-260", hypothesis: M1.REVISION, note: "swatches and pocket cut out of earlier generated pictures (demonstrative extraction); not an independent validation", sources: { r1c: { scale: sR }, pocket: { source: pocketSource, box: ex.pocketBox } }, designs: {} };
  const figs = [], tplOn = dressed(src.layers), boxes = { neck: [400, 440, 624, 540], "sleeve left": [280, 540, 440, 700], "sleeve right": [584, 540, 744, 700], pocket: [440, 520, 624, 680], hem: [380, 760, 644, 860] };
  const closeRows = [], apps = [];
  for (const [name, d] of Object.entries(designs)) {
    const L = M1.lay(t, cl, base, d), item = { category: "top", layers: L.layers, covering: t.covering, shadow: t.shadow };
    let holes = 0; for (let i = 0; i < N; i++) if (t.core[i] && L.material[i * 4 + 3] < 128) holes++;
    const fit = R1.checkItem(w, base, T, t, L.layers), outfits = {};
    for (const bo of PARTNERS.bottom) for (const sh of PARTNERS.shoes) { const n = R1.checkOutfit(w, base, [item, itemOf(bo), itemOf(sh)]), o = R1.checkOutfit(w, base, [src, itemOf(bo), itemOf(sh)]);
      outfits[bo + "+" + sh] = { ok: n.ok, failed: n.failed, template: { ok: o.ok, failed: o.failed }, same: n.ok === o.ok && n.failed.join() === o.failed.join() }; }
    const ov = Object.values(outfits);
    report.designs[name] = { swatch: { w: d.body.w, h: d.body.h, scale: d.scale }, trim: !!d.trim, details: L.placed, holesBeforeLines: holes,
      secondOutlineOnMaterial: RC.secondOutline(L.material, t, cl), clippedDetails: RC.clippedDetails(L.material, t), fit: { ok: fit.ok, failed: fit.failed },
      outfitsSameAsTemplate: ov.filter((v) => v.same).length + "/" + ov.length, outfitsOk: ov.filter((v) => v.ok).length + "/" + ov.length, outfits };
    const onC = dressed(L.layers); figs.push(down(flat(onC, bg), 262, 768, FIGB));
    for (const b of Object.values(boxes)) closeRows.push(crop(flat(onC, bg), b, 3)); apps.push(down(flat(onC, bg), 110, 165), down(flat(onC, bg), 52, 78));
    console.log(name, "holes", holes, "fit", fit.ok ? "OK" : fit.failed.join(","), "outfits same", report.designs[name].outfitsSameAsTemplate, "ok", report.designs[name].outfitsOk, "details", JSON.stringify(L.placed));
  }
  figs.push(down(flat(tplOn, bg), 262, 768, FIGB)); for (const b of Object.values(boxes)) closeRows.push(crop(flat(tplOn, bg), b, 3)); apps.push(down(flat(tplOn, bg), 110, 165), down(flat(tplOn, bg), 52, 78));
  const g1 = grid(figs, figs.length, 10); writeFileSync(join(OUT, "m1-figures.png"), encodePng(g1.w, g1.h, g1.px));
  const g2 = grid(closeRows, 5, 6); writeFileSync(join(OUT, "m1-closeups-x3.png"), encodePng(g2.w, g2.h, g2.px));
  const g3 = grid(apps, 8, 6); writeFileSync(join(OUT, "m1-app.png"), encodePng(g3.w, g3.h, g3.px));
  const sw = [enlarge(designs["A apricot (R1C-1 fabric and rib, generated pocket)"].body, 1), enlarge(M1.flatten(ex.rib, 8), 4), enlarge({ ...ex.pocket, px: (() => { const p = new Uint8ClampedArray(ex.pocket.px); for (let i = 0; i < p.length / 4; i++) if (!p[i * 4 + 3]) p.set([255, 255, 255, 255], i * 4); return p; })() }, 1), enlarge(designs["B breton stripes (b1)"].body, 1), enlarge(designs["C tartan (b1 skirt) + generated pocket"].body, 1)];
  const g4 = grid(sw, 5, 10); writeFileSync(join(OUT, "m1-swatches.png"), encodePng(g4.w, g4.h, g4.px));
  report.ms = Date.now() - t0; writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2) + "\n");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error("REFUSED: " + e.message); process.exit(1); });
