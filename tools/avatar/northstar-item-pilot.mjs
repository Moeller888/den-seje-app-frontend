// NORTHSTAR CLOTHING PILOT ON C (D-207) — processing of a generated item: registration on C, extraction against C, the layer
// split, the body/remnant checks and contract v3's fitCheck and quality; and the outfit combinations. It separates three kinds of
// fault: GENERATION (the model redrew the body, left the base garment, failed registration), EXTRACTION (paint the tool missed)
// and FIT (the item, correctly extracted, does not fit C). A technical pass is never the owner's visual approval.
//
// Nothing is painted, deformed or retouched: the item IS the generated pixels (after the established dust cleanup) where they
// differ from C inside the category's envelope; the raw result stays unchanged. C, its layers and every result stay OUTSIDE both
// clones (D-127 §2). C is read from <Documents>/DenSejeApp-artefacts/d-202-northstar-base-figure/ and verified by its hash.
// Usage: node tools/avatar/northstar-item-pilot.mjs --process <generated.png> --item <item id> --out <empty dir outside both clones>
//        node tools/avatar/northstar-item-pilot.mjs --combine <dir holding the processed item dirs> --out <empty dir outside both clones>
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { encodePng, decodePng } from "./r3-hair-tool-v2.mjs";
import * as NL from "./r3-northstar-layers.mjs";
import * as WR from "./northstar-wardrobe.mjs";
import * as BF from "./northstar-base-figure.mjs";
import * as BC from "./northstar-base-figure-c.mjs";
const classify = BF.classify;
import { flat, crop, down, grid } from "./northstar-wardrobe-poc.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DECISION = "D-207";
export const ITEMS = Object.freeze({ "top-tank-teal": "top", "top-tee-red": "top", "top-sweater-green": "top", "bottom-shorts-navy": "bottom", "bottom-trousers-khaki": "bottom", "bottom-skirt-plum": "bottom", "shoes-sandals-brown": "shoes", "shoes-sneakers-white": "shoes", "shoes-boots-black": "shoes" });
const { W, H, N } = WR, Mo = WR.maskOps, sha = (b) => createHash("sha256").update(b).digest("hex"), count = (m) => { let n = 0; for (let i = 0; i < N; i++) if (m[i]) n++; return n; };
export const CHANGE_TOL = 24;   // D-197's changeTol: a generated pixel differing from C by more than this has changed
export const STRONG_TOL = 60;   // D-208: a change this large is new paint (a garment over skin or background), not redrawn body shading
export const LIMITS = Object.freeze({
  remnantShare: { value: 0.01, why: "the item must replace the base garment: more than 1 % of the base interior left identical to C means the base shows through the item (a generation fault)" },
});
const empty = () => new Uint8ClampedArray(N * 4);

/** C, read from outside both clones and verified by its pinned hash. */
export function readC() {
  const f = resolve(homedir(), "Documents", "DenSejeApp-artefacts", "d-202-northstar-base-figure", "d202-base-figure-v2.image-1.png"), buf = readFileSync(f);
  if (sha(buf) !== BC.C_RAW_SHA256) throw new Error("C does not match its pinned sha256"); return buf;
}
const changedPx = (O, C, i) => { const a = O[i * 4 + 3], b = C[i * 4 + 3]; if (Math.abs(a - b) > CHANGE_TOL) return true; if (a < 128 && b < 128) return false; return [0, 1, 2].some((k) => Math.abs(O[i * 4 + k] - C[i * 4 + k]) > CHANGE_TOL); };

/** Process one generated picture of one item on a prepared base (C, or a stand-in in CI). */
export function processItem(w, base, T, category, raw) {
  const reg = BF.register(raw, w.fg.master), gen = [], ext = [], obs = {};
  if (!reg.ok) return { registration: reg, ok: false, faults: { generation: ["G-1 registration: the head does not register within ±6 px — never warped"], extraction: [], fit: [] } };
  const O = BF.dustCleaned(BF.shift(raw, reg.dx, reg.dy)), C = base.R, t = T[category];
  const changed = new Uint8Array(N); for (let i = 441 * W; i < N; i++) if (changedPx(O, C, i)) changed[i] = 1;
  let outside = 0, inProtect = 0, head = 0; for (let i = 0; i < N; i++) { if (i < 441 * W) { if (changedPx(O, C, i)) head++; continue; } if (!changed[i]) continue; if (t.protect[i]) inProtect++; else if (!t.allowed[i]) outside++; }
  let bodyPx = 0; for (let i = 441 * W; i < N; i++) if (C[i * 4 + 3] >= 128) bodyPx++;
  obs.bodyChangedOutsideEnvelopePx = outside; obs.protectedChangedPx = inProtect; obs.headChangedPx = head; obs.comparedBodyPx = bodyPx;
  // the item: generated pixels that differ from C inside the envelope (never in a protected region), plus the base interior
  const item = empty(), im = new Uint8Array(N), own = category === "top" ? 1 : category === "bottom" ? 2 : 0; let remnant = 0, mc = 0;
  // D-208 extraction (stage 1 showed two systematic faults of the D-207 rule, both in this tool): the model redraws the body's
  // contour lines 1–2 px off, and ink is not skin, so contour lines entered the item; and "never skin" by hue dropped brown and
  // tan garment paint (sandal straps). The item is now the GARMENT REGION: (1) fill — pixels that changed STRONGLY from C (any
  // channel > STRONG_TOL, or the alpha), lie inside the envelope and outside the protected regions, kept only where they survive
  // a 2 px opening (a shifted body contour line or sliver, ≤ 4 px wide, vanishes; garment areas — dark shading included — stay); (2) the whole base interior
  // and every opaque pixel where C had THIS category's base garment (the base is gone at runtime); (3) the garment's own outline
  // and antialiasing: changed pixels within 3 px of (1)/(2); (4) below. A mildly changed pixel (24 … 60) elsewhere is redrawn body shading;
  // a contour line farther than 3 px from the garment is the body's own. A base-interior pixel left unchanged and not ink is a
  // remnant of the base fabric (a generation fault, G-2).
  const strong = new Uint8Array(N); for (let i = 441 * W; i < N; i++) { if (!t.allowed[i] || t.protect[i] || O[i * 4 + 3] < 128) continue;
    if (Math.abs(O[i * 4 + 3] - C[i * 4 + 3]) > 128 || [0, 1, 2].some((k) => Math.abs(O[i * 4 + k] - C[i * 4 + k]) > STRONG_TOL)) strong[i] = 1; }
  const fill = Mo.dilate(Mo.not(Mo.dilate(Mo.not(strong), 2)), 2), core = new Uint8Array(N);
  for (let i = 441 * W; i < N; i++) { if (t.mustCover[i]) { mc++; if (!changed[i] && classify(O, i) !== "ink") remnant++; }
    if ((fill[i] && strong[i]) || t.mustCover[i] || (own > 0 && base.sep.lab[i] === own && O[i * 4 + 3] >= 128)) core[i] = 1; }
  // (4) gaps up to 6 px inside the garment region (closing by 3 px) — where an old body contour crossed new paint of nearly the same
  // darkness, the pixel did not "change", and C's line would show through the item — are taken from the generated picture too
  const closed = Mo.not(Mo.dilate(Mo.not(Mo.dilate(core, 3)), 3)), near = Mo.dilate(core, 3);
  for (let i = 441 * W; i < N; i++) { if (O[i * 4 + 3] === 0) continue; const inside = t.allowed[i] && !t.protect[i];
    if (core[i] || (inside && closed[i]) || (near[i] && changed[i] && inside)) { item.set(O.subarray(i * 4, i * 4 + 4), i * 4); im[i] = 1; } }
  obs.baseRemnantPx = remnant; obs.baseRemnantShare = +(remnant / Math.max(1, mc)).toFixed(4);
  if (mc && remnant / mc > LIMITS.remnantShare.value) gen.push("G-2 base remnant: " + remnant + " px of the base interior unchanged from C (" + (100 * remnant / mc).toFixed(1) + " %)");
  // the layer split: a top's pixels over C's arm pixels are sleeves, the rest its body
  let layers;
  if (category === "top") { const tb = empty(), sl = empty(); for (let i = 0; i < N; i++) if (im[i]) (base.arms[i * 4 + 3] >= 128 ? sl : tb).set(item.subarray(i * 4, i * 4 + 4), i * 4); layers = { topBody: tb, sleeves: sl }; }
  else layers = category === "bottom" ? { pants: item } : { shoes: item };
  const fit = BC.fitCheck(w, base, T, category, layers);
  const failedFit = fit.checks.filter((c) => c.axis === "fit" && !c.ok);
  // EXTRACTION: a hole in the outfit where the generated picture has opaque paint means the tool missed the item, not the model
  const P = BF.layerProof(w, base.R, base.Z, { ...BF.minimumItems(base.R, base.sep.lab), ...layers }, { sep: base.sep });
  let missedPaint = 0; for (let i = 0; i < N; i++) if (P.enclosed[i] && O[i * 4 + 3] >= 128) missedPaint++;
  if (missedPaint > 0) ext.push("E-1 " + missedPaint + " px of a hole lie where the generated picture has opaque paint — the extraction missed them");
  const fitFaults = failedFit.filter((c) => !(c.id === "FIT-4-COVERAGE" && missedPaint > 0)).map((c) => c.id + " " + JSON.stringify(c.value));
  return { registration: reg, observations: obs, layers, composite: fit.composite, checks: fit.checks, fitOk: fit.fitOk, qualityOk: fit.qualityOk,
    faults: { generation: gen, extraction: ext, fit: fitFaults }, ok: gen.length === 0 && ext.length === 0 && fit.fitOk, O };
}

const bg = [236, 233, 226], FIGB = [250, 0, 774, 1536], half = (P) => down(flat(P, bg), 262, 768, FIGB);
const checker = (Q) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0, c = ((x >> 4) + (y >> 4)) & 1 ? 205 : 245, a = Q[i * 4 + 3] / 255; for (let k = 0; k < 3; k++) o[i * 4 + k] = Math.round(Q[i * 4 + k] * a + c * (1 - a)); o[i * 4 + 3] = 255; } return o; };
const CLOSE = { top: [[360, 420, 664, 620], [290, 600, 420, 980], [604, 600, 734, 980], [380, 720, 644, 860]], bottom: [[360, 740, 664, 900], [330, 880, 694, 1100], [330, 1100, 694, 1380]], shoes: [[330, 1300, 694, 1500]] };

export function processToDir(w, base, T, itemId, rawBuf, OUT) {
  if (!BF.isOutsideRepo(OUT)) throw new Error("refusing to write inside the repository (D-127 §2)");
  const category = ITEMS[itemId]; if (!category) throw new Error("unknown item " + itemId);
  const img = decodePng(rawBuf); if (!img.ok || !img.px || img.px.length !== N * 4) throw new Error("not a 1024×1536 RGBA PNG");
  const r = processItem(w, base, T, category, Uint8ClampedArray.from(img.px)), files = {};
  const save = (n, im, what) => { const b = encodePng(im.w, im.h, im.px); writeFileSync(join(OUT, n), b); files[n] = { sha256: sha(b), w: im.w, h: im.h, what }; };
  save("p01-raw-as-received.png", half(Uint8ClampedArray.from(img.px)), "the raw result, unchanged (shown flattened)");
  if (r.layers) {
    for (const [k, L] of Object.entries(r.layers)) writeFileSync(join(OUT, "layer-" + k + ".png"), encodePng(W, H, L));
    save("p02-item-layers.png", grid(Object.values(r.layers).map((L) => down(checker(L), 262, 768, FIGB)), Object.keys(r.layers).length), "the extracted layer(s) on a checkerboard: " + Object.keys(r.layers).join(" · "));
    save("p03-on-c.png", grid([half(r.composite), half(NL.overStack([r.O, w.head]))], 2), "the item on C's runtime body (contract order, other categories in the minimum items) beside the raw picture with the R3 head");
    const F = flat(r.composite, bg); save("p04-close-ups-x2.png", grid(CLOSE[category].map((b) => crop(F, b, 2)), CLOSE[category].length > 2 ? 2 : CLOSE[category].length), "the seams ×2");
    const D = flat(r.O, bg); const C = base.R; for (let i = 441 * W; i < N; i++) if (changedPx(r.O, C, i) && !T[category].allowed[i]) D.set([255, 0, 0, 255], i * 4);
    save("p05-body-changes.png", half(D), "red: pixels outside the item's envelope that differ from C by more than " + CHANGE_TOL + " (the body redrawn by the model)");
    save("p06-app-sizes.png", grid([down(flat(r.composite, bg), 110, 165), down(flat(r.composite, bg), 52, 78)], 2, 6), "hub 110×165 and quiz 52×78");
  }
  const report = { decision: DECISION, item: itemId, category, raw: { sha256: sha(rawBuf) }, registration: r.registration, ok: r.ok, observations: r.observations || null, faults: r.faults,
    checks: (r.checks || []).map(({ axis, id, ok, value }) => ({ axis, id, ok, value })), note: "A technical pass is never the owner's visual approval.", files };
  writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2) + "\n");
  return report;
}

/** The 3 × 3 × 3 outfits on C. A missing or rejected item is replaced by the minimum item of its category and MARKED: each tile
 *  carries three bars (top, bottom, shoes): green = the item passed FIT, orange = shown but failed FIT, grey = missing (minimum). */
export function combine(w, base, processed, OUT) {
  if (!BF.isOutsideRepo(OUT)) throw new Error("refusing to write inside the repository (D-127 §2)");
  const min = BF.minimumItems(base.R, base.sep.lab), cats = { top: [], bottom: [], shoes: [] };
  for (const [id, cat] of Object.entries(ITEMS)) cats[cat].push(processed[id] || null);
  const tiles = [], index = [];
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) for (let c = 0; c < 3; c++) {
    const picks = [cats.top[a], cats.bottom[b], cats.shoes[c]], it = { ...min }, marks = [];
    for (const p of picks) { if (p && p.layers) Object.assign(it, p.layers); marks.push(!p || !p.layers ? [150, 150, 150] : p.ok ? [40, 170, 80] : [240, 140, 0]); }
    const tile = half(BF.layerProof(w, base.R, base.Z, it, { sep: base.sep }).dressedRuntime);
    marks.forEach((rgb, k) => { for (let y = 2; y < 10; y++) for (let x = 4 + k * 86; x < 84 + k * 86; x++) tile.px.set([...rgb, 255], (y * tile.w + x) * 4); });
    tiles.push(tile); index.push(picks.map((p) => (p ? p.item + (p.ok ? "" : " (failed)") : "missing → minimum")));
  }
  const g = grid(tiles, 9), b = encodePng(g.w, g.h, g.px); writeFileSync(join(OUT, "c01-27-outfits.png"), b);
  const app = grid(tiles.map((t) => t), 9);
  writeFileSync(join(OUT, "c02-27-outfits-index.json"), JSON.stringify({ legend: "bars per tile: top · bottom · shoes — green passed FIT, orange shown but failed FIT, grey missing (minimum item)", outfits: index }, null, 2) + "\n");
  return { tiles: tiles.length, sha256: sha(b), index };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const a = process.argv.slice(2), oi = a.indexOf("--out"), pi = a.indexOf("--process"), ii = a.indexOf("--item"), ci = a.indexOf("--combine"), OUT = oi >= 0 && a[oi + 1] ? resolve(a[oi + 1]) : null;
  if (!OUT || (pi < 0 && ci < 0)) { console.error("usage: --process <png> --item <id> --out <dir> | --combine <dir> --out <dir>"); process.exit(1); }
  if (!BF.isOutsideRepo(OUT)) { console.error("REFUSED: --out is inside the repository (D-127 §2)"); process.exit(1); }
  if (existsSync(OUT) && readdirSync(OUT).length) { console.error("--out must be empty"); process.exit(1); } mkdirSync(OUT, { recursive: true });
  const w = WR.buildWardrobe(), base = BC.prepareBase(w, Uint8ClampedArray.from(decodePng(readC()).px)), T = BC.templatesC(w, base);
  if (pi >= 0) { const r = processToDir(w, base, T, a[ii + 1], readFileSync(resolve(a[pi + 1])), OUT); console.log(JSON.stringify({ item: r.item, ok: r.ok, faults: r.faults, observations: r.observations }, null, 2)); }
  else {
    const root = resolve(a[ci + 1]), processed = {};
    for (const d of readdirSync(root)) { const rp = join(root, d, "report.json"); if (!existsSync(rp)) continue; const r = JSON.parse(readFileSync(rp, "utf8")); const layers = {};
      for (const f of readdirSync(join(root, d))) if (f.startsWith("layer-")) layers[f.slice(6, -4)] = Uint8ClampedArray.from(decodePng(readFileSync(join(root, d, f))).px);
      processed[r.item] = { item: r.item, ok: r.ok, layers: Object.keys(layers).length ? layers : null }; }
    console.log(JSON.stringify(combine(w, base, processed, OUT).index.length));
  }
}
