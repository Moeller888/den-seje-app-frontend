// D-319 — THE LOCKED EVALUATION OF A NEW SOURCE FOR A SHOE CUT (offline; no image call). It tests one new 1536x1024 RGBA source drawn at
// K for the cut contract's crop (northstar-shoe-cut-kit.mjs), unchanged, against ACCEPT (below). This file, the kit, the contract and the
// master are pinned by sha256 in the cut's plan (ab-plan-v1.json for AB-1); nothing may change after receipt — a change makes the result
// development material and needs a new source to be validated.
//   check    — the source: the halo rule first, detail (drawn at K), antialiasing; the fixed downscale and placement (one global integer
//              translation ≤ maxShiftPx); shape per shoe against the cut's reference item (IoU, size, centre, two pieces); covering change;
//              skin remnants and stroke tips in the opening band; the opening check (kit); the fields (each contract field its own closed
//              field on both sides, at least minPxPerSide); line contrast and presence per field; painted volume per field.
//   chain    — the designs of the plan through master v5 at K (the method) and v2 at K (the line-weight reference): the original colour's
//              reproduction (OKLab ΔE), chainLineCheck, the original colour's volume.
//   outfits  — each design with the cream tee over the contract's bottoms: R1.checkOutfit, UNCHANGED (every failure stays FAIL).
//   views    — the shoes alone 1:1 (light, dark), the opening band 4x NEAREST (labelled), the hems 1:1, from the saved layers.
//   verdict  — the automatic classes (source, designs, combinations) and, beside them, the owner's visual review if present: a visual OK
//              never turns an automatic FAIL into PASS. One passed result is evidence for this cut and these cases, not a validation of
//              every shoe or fault.
// The views show C: --out must be outside both clones.
// Usage: node --expose-gc tools/avatar/northstar-shoe-cut-evaluate.mjs --cut ankle-boot --plan <plan.json> --source <png> --out <dir> --phase check|chain|outfits|views|verdict --dwebp <dwebp.exe>
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng, decodePng } from "./r3-hair-tool-v2.mjs";
import * as WR from "./northstar-wardrobe.mjs";
import * as BC from "./northstar-base-figure-c.mjs";
import * as IP from "./northstar-item-pilot.mjs";
import * as R1 from "./northstar-r1-garment.mjs";
import * as SM from "./northstar-shoe-master.mjs";
import * as SS from "./northstar-shoe-source.mjs";
import * as E2 from "./northstar-shoe-eval-v2.mjs";
import * as V5 from "./northstar-shoe-master-v5.mjs";
import * as KIT from "./northstar-shoe-cut-kit.mjs";
import { perceptualMeasures } from "./northstar-shoe-master-study.mjs";
import { loadItems } from "./build-northstar-runtime-assets.mjs";
import { flat, crop, grid } from "./northstar-wardrobe-poc.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", ".."), { W, N } = WR, H = N / W, DIR = join(ROOT, "assets", "avatar-northstar");
const sha = (b) => createHash("sha256").update(b).digest("hex"), gc = () => { if (typeof globalThis.gc === "function") globalThis.gc(); }, LIGHT = [236, 233, 226], DARK = [24, 26, 40];
/** The acceptance rules, fixed before any source (D-319 documents each number's origin):
 *  - lines: ABSOLUTE floors, not ratios to the reference — the reference boot's lines have a contrast of only 0.047 (the sneaker's
 *    0.25–0.41), so a ratio would be trivial for contrast and, for presence, would punish a lighter source; 0.2 lies below every
 *    accepted sneaker value and far above the dark boot's;
 *  - volume: an ABSOLUTE floor per scored field (0.035, below the accepted sneaker's upper/sole and SV-1's 0.042, above a flat fill);
 *  - original colour: ΔE (OKLab) p95 ≤ 0.045 between source and master — the published sneaker gives 0.032 and the published boot 0.038
 *    through v5, so the master's own model (one colour per field, lines at least lineMin darker) is inside it; a byte count is not used;
 *  - shape, shift, covering, antialiasing, glow: D-294/D-299's values;
 *  - skin remnants: measured on the SOURCE at K in the opening band (the downscale blends them away): pixels within 0.08 of C's skin
 *    colour (the old boot's specks lie at 0.046–0.08; SS.SKIN_DE 0.04 missed them), at most 16 source px (one avatar px); the prompt asks
 *    for a tan-brown clearly darker than skin, so the leather itself stays outside 0.08;
 *  - stroke tips: measured on the SOURCE at K in the opening band: a vertical stack of opaque runs at most spurMaxRunPx avatar px wide
 *    (≤ 2K source px), overlapping row to row, at least tipMinHeightPx avatar px tall (≥ 3K rows) — a freestanding line; a rounded corner's
 *    top has only a few narrow rows; none allowed. */
export const ACCEPT = Object.freeze({
  detail: "SS.DETAIL_RULE (drawn at K)", maxShiftPx: 2, minShoeIoU: 0.95, sizeRatio: Object.freeze([0.96, 1.04]), maxCentroidOffsetPx: 2, shoeComponents: 2, maxCoveringChange: 0.01,
  minEdgeAntialiased: 0.5, maxGlowPx: 0, skinRemnantDE: 0.08, maxSkinSourcePx: 16, openingBandExtraPx: 4, spurMaxRunPx: 2, maxTipsPerShoe: 0, tipMinHeightPx: 3,
  minLineContrast: 0.2, minLineInventory: 0.05, volumeFields: Object.freeze(["upper", "sole"]), minVolumeL: 0.035, chainVolumeMin: 0.9, maxOriginalDeltaE95: 0.045,
});
export const VERDICT = Object.freeze({
  source: "USABLE SOURCE (automatic) when every check rule passes; else REJECTED SOURCE (the failed rules named)",
  design: "USABLE DESIGN (automatic) when the source is usable, the original colour meets its reproduction and volume rules, and the design passes chainLineCheck; else NOT USABLE",
  combination: "USABLE COMBINATION (automatic) when its design is usable and R1.checkOutfit passes; else FAIL",
  visual: "the owner's visual review is recorded BESIDE each automatic class; an automatic FAIL stays FAIL whatever the visual says, and an automatic PASS is usable only with a visual OK",
  scope: "one passed result is evidence for this cut and these cases, not a general validation of all shoes or fault types",
});
const slug = (s) => s.split(" (")[0].replace(/[^a-z0-9]+/gi, "-").toLowerCase();
const savePng = (f, im) => writeFileSync(f, encodePng(im.w, im.h, im.px)), loadPx = (f) => Uint8ClampedArray.from(decodePng(readFileSync(f)).px);
const dE = (a, b) => { const p = SM.oklab([a[0], a[1], a[2]]), q = SM.oklab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
export function edgeAntialiased(im) { const { w, h, px } = im; let e = 0, p = 0; for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x, a = px[i * 4 + 3]; if (!a || ![i - 1, i + 1, i - w, i + w].some((j) => !px[j * 4 + 3])) continue; e++; if (a < 240) p++; } return e ? +(p / e).toFixed(3) : 0; }

/** Shape per shoe (the contract's split) against the reference: IoU, size ratio, centre offset; and the number of painted pieces. */
export function shapeCheck(cand, ref, cut) {
  const op = (P, i) => P[i * 4 + 3] >= 128, p = [], m = {};
  for (const [side, inSide] of [["left", (x) => x < cut.source.splitX], ["right", (x) => x >= cut.source.splitX]]) { let inter = 0, uni = 0; const bb = (P) => { let x0 = W, x1 = -1, y0 = H, y1 = -1, sx = 0, sy = 0, n = 0; for (let i = 0; i < N; i++) { const x = i % W; if (!inSide(x) || !op(P, i)) continue; const y = (i / W) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); sx += x; sy += y; n++; } return { w: x1 - x0 + 1, h: y1 - y0 + 1, cx: sx / n, cy: sy / n }; };
    for (let i = 0; i < N; i++) { if (!inSide(i % W)) continue; const c = op(cand, i), r = op(ref, i); if (c && r) inter++; if (c || r) uni++; }
    const a = bb(cand), b = bb(ref), iou = uni ? inter / uni : 0, sw = a.w / b.w, sh = a.h / b.h, off = Math.hypot(a.cx - b.cx, a.cy - b.cy);
    m[side] = { iou: +iou.toFixed(4), widthRatio: +sw.toFixed(3), heightRatio: +sh.toFixed(3), centroidOffsetPx: +off.toFixed(2) };
    if (!(iou >= ACCEPT.minShoeIoU)) p.push(side + " shoe: IoU " + iou.toFixed(3) + " < " + ACCEPT.minShoeIoU);
    if (!(sw >= ACCEPT.sizeRatio[0] && sw <= ACCEPT.sizeRatio[1] && sh >= ACCEPT.sizeRatio[0] && sh <= ACCEPT.sizeRatio[1])) p.push(side + " shoe: size ratio " + sw.toFixed(3) + " x " + sh.toFixed(3));
    if (!(off <= ACCEPT.maxCentroidOffsetPx)) p.push(side + " shoe: centre moved " + off.toFixed(1) + " px"); }
  const seen = new Uint8Array(N); let comps = 0; for (let s = 0; s < N; s++) { if (seen[s] || !op(cand, s)) continue; let n = 0; const q = [s]; seen[s] = 1; while (q.length) { const i = q.pop(), x = i % W; n++; for (const j of [i - 1, i + 1, i - W, i + W]) { if (j < 0 || j >= N || Math.abs((j % W) - x) > 1 || seen[j] || !op(cand, j)) continue; seen[j] = 1; q.push(j); } } if (n >= 20) comps++; }
  m.components = comps; if (comps !== ACCEPT.shoeComponents) p.push(comps + " separate painted pieces (expected the two shoes)");
  return { ok: !p.length, problems: p, measures: m };
}
/** Stroke tips on the source at K: stacks of narrow runs (≤ spurMaxRunPx·K wide) in the opening band, at least tipMinHeightPx·K rows tall. */
export function strokeTips(img, cut) { const K = cut.source.K, c = cut.source.crop, Z = cut.opening.zone, y0 = Math.max(0, (Z.y0 - 6 - c.y0) * K), y1 = Math.min(img.h, (Z.y1 - c.y0) * K), maxW = ACCEPT.spurMaxRunPx * K, split = (cut.source.splitX - c.x0) * K;
  let open = [], tips = { left: [], right: [] }; const close = (r) => { if (r.y1 - r.y0 + 1 >= ACCEPT.tipMinHeightPx * K) (r.x < split ? tips.left : tips.right).push({ x: Math.round(c.x0 + r.x / K), y: Math.round(c.y0 + r.y0 / K), heightPx: +((r.y1 - r.y0 + 1) / K).toFixed(1) }); };
  for (let y = y0; y < y1; y++) { const runs = []; let x = 0; while (x < img.w) { if (img.px[(y * img.w + x) * 4 + 3] < 128) { x++; continue; } let e = x; while (e < img.w && img.px[(y * img.w + e) * 4 + 3] >= 128) e++; if (e - x <= maxW) runs.push([x, e]); x = e; }
    const next = []; for (const [a, b] of runs) { const o = open.find((r) => r.a < b && a < r.b); if (o) { open = open.filter((r) => r !== o); next.push({ ...o, a, b, y1: y }); } else next.push({ a, b, x: a, y0: y, y1: y }); }
    for (const r of open) close(r); open = next; }
  for (const r of open) close(r); return tips; }
/** Stroke tips (and specks) at avatar resolution: opaque runs at most spurMaxRunPx wide in the opening band, per shoe (the guide's rule). */
export function spurs(cand, cut) { const Z = cut.opening.zone, out = { left: [], right: [] };
  for (let y = Z.y0 - 6; y < Z.y1; y++) { let x = cut.source.crop.x0; const x1 = cut.source.crop.x0 + cut.source.crop.w; while (x < x1) { if (cand[(y * W + x) * 4 + 3] < 128) { x++; continue; } let e = x; while (e < x1 && cand[(y * W + e) * 4 + 3] >= 128) e++; if (e - x <= ACCEPT.spurMaxRunPx) (x < cut.source.splitX ? out.left : out.right).push([x, y, e - x]); x = e; } }
  return out; }
/** The fields: v4's labelling with the contract's seeds (each field its own closed field; a seed conflict is a merged field) and sizes. */
export function fieldCheck(placed, cut, dx = 0, dy = 0) {
  const p = []; let m = null; try { m = SM.buildShoeMaster(placed, KIT.templateOf(placed, cut), { ...SM.SPEC_V4, seeds: KIT.seedsAt1(cut, dx, dy) }); } catch (e) { return { ok: false, problems: ["the fields are not separate: " + e.message], measures: {}, master: null }; }
  const sizes = {}; for (const [n, f] of Object.entries(cut.fields)) { const k = SM.GROUPS.indexOf(f.slot); for (const side of ["left", "right"]) { let c = 0; for (let i = 0; i < N; i++) if (m.field[i] && m.group[i] === k && ((i % W) < cut.source.splitX) === (side === "left")) c++; sizes[n + " " + side] = c; if (c < f.minPxPerSide) p.push(n + " (" + side + "): " + c + " px as its own field (< " + f.minPxPerSide + ")"); } }
  const split = V5.unseededFields(m, placed).filter((f) => f.split && f.pixels >= 50).map((f) => ({ group: f.group, pixels: f.pixels, at: f.at }));
  return { ok: !p.length, problems: p, measures: { sizes, splitFieldsInV4: split }, master: m };
}

function readSource(SRC) { const b = readFileSync(SRC), d = decodePng(b); if (!d || d.header.w !== 1536 || d.header.h !== 1024) throw new Error("the source must be a 1536x1024 RGBA PNG"); const raw = { w: d.header.w, h: d.header.h, px: Uint8ClampedArray.from(d.px) }; return { sha256: sha(b), raw, img: E2.dropHalo(raw, E2.HALO_RULE) }; }
const designsOf = (plan, cut) => Object.fromEntries(Object.entries(plan.acceptance.designs).map(([n, d]) => [n, d === "original" ? "original" : KIT.designFor(cut, d)]));

/** The source check (exported for the tests: base is C or a constructed stand-in; ref is the cut's reference item layer). */
export function sourceCheck(img, ref, base, cut) {
  const rules = {}, detail = SS.detailMeasures(img), dv = SS.detailVerdict(detail), small = KIT.downscale(img, cut), reg = KIT.register(KIT.place(small, cut), ref, cut), placed = KIT.place(small, cut, reg.dx, reg.dy);
  rules.detail = { ok: dv.ok, problems: dv.problems, measures: detail };
  rules.placement = { ok: Math.abs(reg.dx) <= ACCEPT.maxShiftPx && Math.abs(reg.dy) <= ACCEPT.maxShiftPx, problems: Math.abs(reg.dx) <= ACCEPT.maxShiftPx && Math.abs(reg.dy) <= ACCEPT.maxShiftPx ? [] : ["the registration needs a translation of " + reg.dx + "," + reg.dy + " px"], measures: reg };
  rules.shape = shapeCheck(placed, ref, cut);
  const hR = KIT.covering(base, ref, cut), hC = KIT.covering(base, placed, cut); let diff = 0, n0 = 0; for (let i = 0; i < N; i++) { if (hR[i]) n0++; if (hR[i] !== hC[i]) diff++; } const cc = +(diff / Math.max(1, n0)).toFixed(4);
  rules.covering = { ok: cc <= ACCEPT.maxCoveringChange, problems: cc <= ACCEPT.maxCoveringChange ? [] : ["the covering changes by " + (100 * cc).toFixed(1) + " %"], measures: { coveringChange: cc } };
  const aa = edgeAntialiased(img), glow = E2.haloInAvatar(placed, placed), ap = []; if (aa < ACCEPT.minEdgeAntialiased) ap.push("the source's silhouette edge is " + Math.round(100 * aa) + " % antialiased"); if (glow.haloPx > ACCEPT.maxGlowPx) ap.push(glow.haloPx + " glow px remain");
  rules.antialiasing = { ok: !ap.length, problems: ap, measures: { sourceEdgeAntialiased: aa, glow } };
  const sk = SS.skinOf(base), band = cut.opening.zone.y1 + ACCEPT.openingBandExtraPx, K = cut.source.K, rows = Math.max(0, (band - cut.source.crop.y0) * K); let skin = 0;
  for (let i = 0; i < rows * img.w; i++) if (img.px[i * 4 + 3] >= 128 && dE(img.px.subarray(i * 4, i * 4 + 3), sk) < ACCEPT.skinRemnantDE) skin++;
  rules.skin = { ok: skin <= ACCEPT.maxSkinSourcePx, problems: skin <= ACCEPT.maxSkinSourcePx ? [] : [skin + " source px of C's skin colour in the opening band (skin remnants)"], measures: { skinSourcePxInOpeningBand: skin, sourceRowsTo: rows, skin: sk } };
  const tp = strokeTips(img, cut), tP = Object.entries(tp).filter(([, v]) => v.length > ACCEPT.maxTipsPerShoe).map(([s, v]) => s + " shoe: " + v.length + " stroke tip(s) at the opening (" + v.map((t) => t.x + "," + t.y + " " + t.heightPx + " px tall").join("; ") + ")");
  rules.strokeTips = { ok: !tP.length, problems: tP, measures: tp };
  const oc = KIT.openingCheck(placed, ref, base, cut); rules.opening = { ok: oc.ok, problems: oc.problems, measures: oc.measures };
  const fc = fieldCheck(placed, cut, reg.dx, reg.dy); rules.fields = { ok: fc.ok, problems: fc.problems, measures: fc.measures };
  for (const side of ["left", "right"]) try { V5.buildShoeMasterV5(KIT.tileOf(img, cut, side), KIT.templateOf(KIT.tileOf(img, cut, side), cut), KIT.specAtK(V5.SPEC_V5, cut, side)); } catch (e) { rules.fields.ok = false; rules.fields.problems.push("at K (" + side + "): " + e.message); }
  if (fc.master) { const pm = perceptualMeasures(fc.master, placed), inv = E2.lineMeasures(fc.master, placed).lineInventory, lp = [], vp = [];
    for (const [n, f] of Object.entries(cut.fields)) { const g = pm[f.slot]; if (!g) { lp.push(n + ": not measurable"); continue; }
      if (!(g.lineContrastL >= ACCEPT.minLineContrast)) lp.push(n + ": line contrast " + g.lineContrastL + " < " + ACCEPT.minLineContrast); if (!((inv[f.slot] || 0) >= ACCEPT.minLineInventory)) lp.push(n + ": line presence " + inv[f.slot] + " < " + ACCEPT.minLineInventory);
      if (ACCEPT.volumeFields.includes(n) && !(g.volumeL >= ACCEPT.minVolumeL)) vp.push(n + ": painted volume " + g.volumeL + " < " + ACCEPT.minVolumeL); }
    rules.lines = { ok: !lp.length, problems: lp, measures: { lineContrast: Object.fromEntries(Object.entries(cut.fields).map(([n, f]) => [n, pm[f.slot] && pm[f.slot].lineContrastL])), lineInventory: Object.fromEntries(Object.entries(cut.fields).map(([n, f]) => [n, inv[f.slot]])) } };
    rules.volume = { ok: !vp.length, problems: vp, measures: Object.fromEntries(Object.entries(cut.fields).map(([n, f]) => [n, pm[f.slot] && pm[f.slot].volumeL])) }; }
  else { rules.lines = { ok: false, problems: ["not measurable: the fields are not separate"], measures: {} }; rules.volume = { ok: false, problems: ["not measurable: the fields are not separate"], measures: {} }; }
  const problems = Object.entries(rules).flatMap(([k, r]) => r.problems.map((x) => k + ": " + x));
  return { verdict: problems.length ? "REJECTED SOURCE" : "USABLE SOURCE (automatic)", problems, rules, registration: reg, placed };
}

/** The conclusion: automatic classes, and the owner's visual review beside them (never turning FAIL into PASS). */
export function conclude(check, chain, outfits, visual) {
  const vis = (k) => (visual && visual[k] ? visual[k] : null), auto = (v) => (v.startsWith("USABLE") ? "PASS" : "FAIL");
  const row = (key, verdict) => { const v = vis(key), a = auto(verdict); return { automatic: verdict, visual: v ? v.verdict : null, diagnosis: v ? v.diagnosis || "" : "", usable: a === "PASS" && !!v && v.verdict === "OK" }; };
  return { source: row("source", check.verdict), designs: Object.fromEntries(Object.entries((chain && chain.designs) || {}).map(([n, d]) => [n, row("design: " + n, d.verdict)])),
    combinations: Object.fromEntries(Object.entries((outfits && outfits.units) || {}).map(([k, u]) => [k, { ...row("combination: " + k, u.verdict), technical: u.technical, failed: u.failed }])), rules: VERDICT, accept: ACCEPT };
}

async function main() {
  const args = process.argv.slice(2), at = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), OUT = at("--out"), phase = at("--phase"), DW = at("--dwebp"), r = relative(ROOT, resolve(OUT || "."));
  if (!OUT || !(r.startsWith("..") || isAbsolute(r))) throw new Error("--out must be outside the repository (the views show C)"); mkdirSync(OUT, { recursive: true });
  const cut = KIT.loadCut(at("--cut") || "ankle-boot"), plan = JSON.parse(readFileSync(at("--plan"), "utf8")), dec = (f) => { const o = join(OUT, "tmp-decode.png"); execFileSync(DW, ["-quiet", join(DIR, f), "-o", o]); return loadPx(o); };
  const ref = () => dec(cut.referenceItem + "-shoes-v1.webp"), t0 = Date.now(), done = (f, o) => { o.seconds = +((Date.now() - t0) / 1000).toFixed(1); writeFileSync(join(OUT, f), JSON.stringify(o, null, 2) + "\n"); console.log(JSON.stringify(o).slice(0, 1200)); };
  const base = () => BC.prepareBase(WR.buildWardrobe(), Uint8ClampedArray.from(decodePng(IP.readC()).px));
  if (phase === "check") { const { sha256, raw, img } = readSource(at("--source")), c = sourceCheck(img, ref(), base(), cut); writeFileSync(join(OUT, "placed.png"), encodePng(W, H, c.placed));
    return done("check.json", { cut: cut.id, contractVersion: cut.contractVersion, source: { file: at("--source"), sha256 }, haloRaw: E2.haloMeasures(raw), verdict: c.verdict, problems: c.problems, registration: c.registration, rules: c.rules }); }
  if (phase === "chain") { const c = JSON.parse(readFileSync(join(OUT, "check.json"), "utf8")), { img } = readSource(at("--source")), placed = loadPx(join(OUT, "placed.png")), sh = c.registration;
    // the contract's fields; when two of them form ONE field in this source (a seed conflict), the chain still runs for the views with the
    // fields AS FOUND (the later field's seeds dropped) — every design is then NOT USABLE with that reason; nothing is repaired
    let useCut = cut, fc = fieldCheck(placed, cut, sh.dx, sh.dy); const dropped = [];
    for (let k = 0; k < 3 && !fc.master; k++) { const m = /one field has two groups: (\w+), (\w+)/.exec(fc.problems.join(" ")), slot = m ? m[2] : null, name = slot && Object.keys(useCut.fields).find((n) => useCut.fields[n].slot === slot && n !== Object.keys(useCut.fields)[0]);
      if (!name) break; dropped.push(name); const fields = { ...useCut.fields }; delete fields[name]; useCut = KIT.checkCut({ ...useCut, fields }); fc = fieldCheck(placed, useCut, sh.dx, sh.dy); }
    if (!fc.master) return done("chain.json", { measurable: false, why: fc.problems, designs: Object.fromEntries(Object.keys(plan.acceptance.designs).map((n) => [n, { verdict: "NOT USABLE", problems: ["the fields are not separate"] }])) });
    const asFound = dropped.length ? ["presentation only: the fields as found (" + dropped.join(", ") + " merged with another field in this source)"] : [];
    const D = Object.fromEntries(Object.entries(plan.acceptance.designs).map(([n, d]) => [n, d === "original" ? "original" : KIT.designFor(useCut, Object.fromEntries(Object.keys(useCut.fields).map((k) => [k, d[k]])))])), fn = (n) => (D[n] === "original" ? (m, s) => KIT.designFor(useCut, KIT.originalColours(useCut, m, s)) : D[n]); let v5, v2;
    try { v5 = KIT.renderAtK(img, useCut, V5.SPEC_V5, V5.buildShoeMasterV5, Object.fromEntries(Object.keys(D).map((n) => [n, fn(n)])), sh); gc(); v2 = KIT.renderAtK(img, useCut, SM.SPEC_V2, SM.buildShoeMaster, Object.fromEntries(Object.keys(D).map((n) => [n, fn(n)])), sh); gc(); }
    catch (e) { return done("chain.json", { measurable: false, why: [e.message], designs: Object.fromEntries(Object.keys(D).map((n) => [n, { verdict: "NOT USABLE", problems: ["not renderable at K: " + e.message] }])) }); }
    mkdirSync(join(OUT, "layers"), { recursive: true }); for (const [n, L] of Object.entries(v5)) writeFileSync(join(OUT, "layers", slug(n) + ".png"), encodePng(W, H, L));
    const orig = Object.keys(D).find((n) => D[n] === "original"), de = []; for (let i = 0; i < N; i++) if (placed[i * 4 + 3] >= 250) de.push(dE(placed.subarray(i * 4, i * 4 + 3), Array.from(v5[orig].subarray(i * 4, i * 4 + 3)))); de.sort((a, b) => a - b); const de95 = +de[Math.floor(de.length * 0.95)].toFixed(4);
    const chain = E2.chainLineCheck(fc.master, placed, v5[orig], Object.fromEntries(Object.keys(D).filter((n) => n !== orig).map((n) => [n, { variant: v5[n], reference: v2[n] }])));
    const vOwn = perceptualMeasures(fc.master, placed), vO = perceptualMeasures(fc.master, v5[orig]), vr = Object.fromEntries(ACCEPT.volumeFields.filter((n) => useCut.fields[n]).map((n) => { const g = useCut.fields[n].slot; return [n, +(vO[g].volumeL / vOwn[g].volumeL).toFixed(3)]; }));
    const origP = [...chain.problems.filter((p) => p.startsWith("original colour")), ...(de95 > ACCEPT.maxOriginalDeltaE95 ? ["original colour: ΔE p95 " + de95 + " > " + ACCEPT.maxOriginalDeltaE95] : []), ...Object.entries(vr).filter(([, v]) => v < ACCEPT.chainVolumeMin).map(([n, v]) => "original colour, " + n + ": volume " + v + " x the drawing's"), ...asFound], usable = c.verdict.startsWith("USABLE") && !asFound.length;
    const designs = Object.fromEntries(Object.keys(D).map((n) => { const own = n === orig ? [] : chain.designs[n].problems, p = [...origP, ...own]; return [n, { verdict: usable && !p.length ? "USABLE DESIGN (automatic)" : "NOT USABLE", problems: usable ? p : ["the source is rejected", ...p], measures: n === orig ? { deltaE95: de95, volumeRatio: vr } : { splitAlong: chain.designs[n].splitAlong, lineContrast: chain.designs[n].lineContrast } }]; }));
    return done("chain.json", { measurable: true, fieldsAsFound: dropped.length ? Object.keys(useCut.fields) : null, designs }); }
  if (phase === "outfits") { const ch = JSON.parse(readFileSync(join(OUT, "chain.json"), "utf8")); if (!ch.measurable) return done("outfits.json", { measurable: false, units: {} });
    const w = WR.buildWardrobe(), b = base(), items = JSON.parse(readFileSync(join(ROOT, "tools/avatar/fixtures/northstar-wardrobe/runtime-assets-inputs-d242.json"), "utf8")).items, T = "top-tee-hip-cream";
    const { P } = loadItems(Object.fromEntries([T, cut.referenceItem, ...cut.evaluation.bottoms.filter((x) => !/square-(navy|sand)/.test(x))].map((id) => [id, items[id]])));
    for (const x of ["bottom-trousers-square-navy", "bottom-trousers-square-sand"]) P[x] = { layers: { pants: dec(x + "-pants-v1.webp") }, shadow: P["bottom-trousers-square-olive"].shadow };
    mkdirSync(join(OUT, "full"), { recursive: true }); const units = {};
    for (const n of Object.keys(plan.acceptance.designs)) { const L = loadPx(join(OUT, "layers", slug(n) + ".png")), ok = ch.designs[n].verdict.startsWith("USABLE");
      for (const bt of cut.evaluation.bottoms) { const x = R1.checkOutfit(w, b, [P[T], P[bt], { category: "shoes", layers: { shoes: L }, covering: "closed-footwear", shadow: P[cut.referenceItem].shadow }]);
        let c = x.proof.dressedRuntime; for (const s of [P[T].shadow, P[bt].shadow, P[cut.referenceItem].shadow]) c = IP.applyShadow(c, x.proof.stack, s); writeFileSync(join(OUT, "full", slug(n) + "--" + bt.replace("bottom-", "") + ".png"), encodePng(W, H, c));
        units[n + " | " + bt] = { technical: x.ok ? "PASS" : "FAIL", failed: x.failed, verdict: ok && x.ok ? "USABLE COMBINATION (automatic)" : "FAIL" }; x.proof = null; gc(); } }
    return done("outfits.json", { measurable: true, units }); }
  if (phase === "views") { const names = Object.keys(plan.acceptance.designs).filter((n) => existsSync(join(OUT, "layers", slug(n) + ".png"))), Ls = names.map((n) => loadPx(join(OUT, "layers", slug(n) + ".png"))), rf = ref(), Z = cut.opening.zone, rg = cut.evaluation.reviewRegions;
    const src = [rf, loadPx(join(OUT, "placed.png")), ...Ls];
    for (const [bn, bg] of [["light", LIGHT], ["dark", DARK]]) { savePng(join(OUT, "view-alone--" + bn + "--1to1.png"), grid(src.map((L) => crop(flat(L, bg), [330, Z.y0 - 10, 694, 1510], 1)), 1, 6));
      savePng(join(OUT, "view-opening--" + bn + "--x4-nearest.png"), grid(src.flatMap((L) => [crop(flat(L, bg), rg["shaft top L"], 4), crop(flat(L, bg), rg["shaft top R"], 4)]), 2, 12)); }
    if (existsSync(join(OUT, "full"))) savePng(join(OUT, "view-hems--light--1to1.png"), grid(names.flatMap((n) => cut.evaluation.bottoms.filter((bt) => existsSync(join(OUT, "full", slug(n) + "--" + bt.replace("bottom-", "") + ".png"))).map((bt) => crop(flat(loadPx(join(OUT, "full", slug(n) + "--" + bt.replace("bottom-", "") + ".png")), LIGHT), [336, Z.y0 - 40, 688, 1510], 1))), cut.evaluation.bottoms.length, 6));
    return done("views.json", { rows: ["reference item", "the new source as placed", ...names] }); }
  if (phase === "verdict") { const rd = (f) => (existsSync(join(OUT, f)) ? JSON.parse(readFileSync(join(OUT, f), "utf8")) : null), visual = rd("visual-review.json"), c = conclude(rd("check.json"), rd("chain.json"), rd("outfits.json"), visual);
    if (!visual) writeFileSync(join(OUT, "visual-review.template.json"), JSON.stringify(Object.fromEntries(["source", ...Object.keys(c.designs).map((n) => "design: " + n), ...Object.keys(c.combinations).map((k) => "combination: " + k)].map((k) => [k, { verdict: "OK | NOT OK", diagnosis: "" }])), null, 2) + "\n");
    return done("verdict.json", c); }
  throw new Error("--phase check|chain|outfits|views|verdict");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error("REFUSED: " + e.message); process.exit(1); });
