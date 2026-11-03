// D-333 — the study of the long-sleeve master (northstar-longsleeve-master.mjs; offline, no image call, nothing published). The SAME
// master renders two approved print-tee shirt colours (heather and navy, D-274's RGB) plain and with two approved chest prints (D-271's
// received teapot and fox motifs, read byte for byte by their sha256), all with D-269's one chest-center rule; plus the source's own
// green through the master (fidelity against the source item). Every view shows C: --out must be outside the repository.
//   build   — the master (magenta in the layer map: C's arm skin the source item leaves uncovered between armpit and cuff); per design the body and sleeve layers, R1.checkItem (fit), the alpha against the cut's, the print's safe-area
//             clearance and footprint; the cuffs (sleeve end per side, visible hand, arm skin showing above the cuff); the armhole
//             gap is judged by the fit checks and the x3 close-ups; a layer map (body, sleeves, hands, seams). Writes layers/<design>.png and build.json.
//   outfits — per design x the 6 checked bottoms (skirt, shorts, capri, olive, navy and sand trousers) x the beige sneakers: the unchanged
//             production outfit check (R1.checkOutfit, its waistband and hem seams), and the same partners with the source item
//             (does the master change any verdict?); composites with the skin shadows (the cut's own top shadow). Writes full/ + outfits.json.
//   views   — sheets: the figure on light and dark, close-ups x3 (armholes, cuffs, hem over each waistband, the print), area-downscaled
//             app sizes 110x165 and 300x450 on light and dark, the layer map. Writes views/.
//   package — (D-335) the candidates for the owner's visual review: every design except the source-colour control x every bottom whose
//             outfit check passes for ALL designs (outfits.json); app-size sheets (110x165, 300x450; light and dark) per design over
//             those bottoms; candidates.json lists them with the bottoms held out and why.
//   hip     — (D-335) the right hip before (--before, the previous build) and after, heather and navy over each bottom: 1:1, x6 and the
//             whole figure at 300x450 and 110x165 (light); hip.json with the outfit verdicts before and after.
//   compare — (D-335) before/after of the cut repair on heather: v1's and v2's sleeve, armhole and cuff close-ups side by side, and the
//             warm pixels the composite shows over the sleeves (C's arm contour through not fully opaque fabric). --before <v1 out dir>.
// --master v1 (default; D-333's ls-master-v1, unchanged) or v2 (D-335's ls-master-v2: the same master and layer, split into body and
// sleeve layers by the cut's own rule LS2.splitLayers — every fabric pixel over C's arm, its soft edge included, in the sleeve layer).
// Nothing here approves a design; the visual review is never automatic.
// Usage: node --expose-gc tools/avatar/northstar-longsleeve-master-study.mjs --phase build|outfits|views|compare [--master v1|v2] --out <dir outside the repo> --dwebp <dwebp.exe> [--before <dir>]
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir, tmpdir } from "node:os";
import { encodePng, decodePng } from "./r3-hair-tool-v2.mjs";
import * as WR from "./northstar-wardrobe.mjs";
import * as BC from "./northstar-base-figure-c.mjs";
import * as IP from "./northstar-item-pilot.mjs";
import * as R1 from "./northstar-r1-garment.mjs";
import * as S1 from "./northstar-r1-similarity.mjs";
import * as TM from "./northstar-tee-master.mjs";
import * as TMM from "./northstar-tee-material.mjs";
import * as PF from "./northstar-tee-print-family.mjs";
import * as LS from "./northstar-longsleeve-master.mjs";
import * as LS2 from "./northstar-longsleeve-master-v2.mjs";
import { loadItems } from "./build-northstar-runtime-assets.mjs";
import { flat, crop, grid, down } from "./northstar-wardrobe-poc.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", ".."), ART = join(homedir(), "Documents", "DenSejeApp-artefacts"), PUB = join(ROOT, "assets", "avatar-northstar");
const { W, N } = WR, H = N / W, sha = (b) => createHash("sha256").update(b).digest("hex"), gc = () => { if (typeof globalThis.gc === "function") globalThis.gc(); };
const LIGHT = [236, 233, 226], DARK = [24, 26, 40];
/** The two approved print-tee colours used (D-269/D-274 RGB) and the two approved received motifs (D-271, by sha256). */
export const COLOURS = Object.freeze({ heather: PF.COLOURS.heather, navy: PF.COLOURS.navy });
export const MOTIFS = Object.freeze({
  teapot: { callId: "TPV-2-tee-print-object-teapot", sha256: "8df1696338145d5b553b8dec40f1134b4aef08affbe855e91019804fd3d529d1" },
  fox: { callId: "TPV-1-tee-print-animal-fox", sha256: "a7b321204599be347a790224974836adf88090d4d6cf847e062577da2003c219" },
});
export const BOTTOMS = Object.freeze(["bottom-skirt-sand", "bottom-shorts-navy", "bottom-capri-lightblue", "bottom-trousers-square-olive", "bottom-trousers-square-navy", "bottom-trousers-square-sand"]);
export const SHOE = "shoes-sneakers-beige";
/** Bottoms the owner holds out of the candidate package whatever the checks say (owner 2026-11-03: navy shorts until checked separately). */
export const OWNER_HELD = Object.freeze({ "bottom-shorts-navy": "held out by the owner until that combination is checked separately (D-335)" });
/** Bottoms held out on a VISUAL finding of the v2 hip seam although the outfit check passes (D-335; a wider bottom than C at the right
 *  hip: the sweater's continued side contour lies on the bottom's fabric inside its own outline). Applies to --master v2 only. */
export const VISUAL_HELD_V2 = Object.freeze({ "bottom-capri-lightblue": "a short dark stroke of the hip seam on the capri fabric just inside its outline, seen at x6 (technical PASS) (D-335)" });
/** The designs: one master, two colours, plain and with each print at the one chest-center rule; plus the source's own colour. */
export const DESIGNS = Object.freeze({
  "green (source colour)": { colour: "source" },
  "heather": { colour: "heather" }, "heather + teapot": { colour: "heather", print: "teapot" }, "heather + fox": { colour: "heather", print: "fox" },
  "navy": { colour: "navy" }, "navy + teapot": { colour: "navy", print: "teapot" }, "navy + fox": { colour: "navy", print: "fox" },
});
export const slug = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

let VERSION = "v1";
function env() {
  const w = WR.buildWardrobe(), base = BC.prepareBase(w, Uint8ClampedArray.from(decodePng(IP.readC()).px)), T = BC.templatesC(w, base, { revision: "d213" });
  const { P, origin } = loadItems({ [LS.SOURCE.item]: { run: LS.SOURCE.run, method: LS.SOURCE.method } }), src = P[LS.SOURCE.item];
  const t = R1.templateFromLayers(src.layers, { shadow: src.shadow, covering: "none", category: "top", cut: LS.SPEC.cut });
  return { w, base, T, src, origin: origin[LS.SOURCE.item], t };
}
const union = (layers) => { const u = new Uint8ClampedArray(N * 4); for (const L of Object.values(layers)) for (let i = 0; i < N; i++) if (L[i * 4 + 3]) u.set(L.subarray(i * 4, i * 4 + 4), i * 4); return u; };
const median = (P, mask) => [0, 1, 2].map((k) => { const v = []; for (let i = 0; i < N; i++) if (mask(i)) v.push(P[i * 4 + k]); v.sort((a, b) => a - b); return v[v.length >> 1]; });
const loadPx = (f) => Uint8ClampedArray.from(decodePng(readFileSync(f)).px);

/** The cuffs of a top's layers on C, per sleeve panel of the master (1 = left, 2 = right): the panel's lowest row (the cuff), C's arm
 *  pixels below it and how many stay visible (the hand), and C's arm pixels between the armpit row and the cuff that no garment pixel
 *  covers (skin showing through the armhole gap or beside a sleeve; their mask is returned for the views). */
export function wristAndGap(layers, base, master, armpitRow) {
  const sl = layers.sleeves, tb = layers.topBody, arms = base.arms, res = {}, shown = new Uint8Array(N);
  for (const [side, k] of [["left", 1], ["right", 2]]) {
    let cuffY = -1, x0 = W, x1 = 0; for (let i = 0; i < N; i++) if (master.panel[i] === k) { cuffY = Math.max(cuffY, (i / W) | 0); x0 = Math.min(x0, i % W); x1 = Math.max(x1, i % W); }
    let hand = 0, armBelow = 0, skin = 0; for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0; if (x < x0 - 30 || x > x1 + 30 || arms[i * 4 + 3] < 128) continue; const covered = sl[i * 4 + 3] >= 128 || tb[i * 4 + 3] >= 128;
      if (y > cuffY) { armBelow++; if (!covered) hand++; } else if (!covered && y > armpitRow) { skin++; shown[i] = 1; } }
    res[side] = { cuffBottomRow: cuffY, handPxVisible: hand, armPxBelowCuff: armBelow, armSkinShowingBetweenArmpitAndCuffPx: skin };
  }
  return { sides: res, shown };
}

async function main() {
  const args = process.argv.slice(2), at = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), phase = at("--phase"), OUT = at("--out"), DW = at("--dwebp"), r = relative(ROOT, resolve(OUT || "."));
  if (!OUT || !(r.startsWith("..") || isAbsolute(r))) throw new Error("--out must be outside the repository (the views show C)"); mkdirSync(OUT, { recursive: true });
  VERSION = at("--master") || "v1"; if (!["v1", "v2"].includes(VERSION)) throw new Error("--master v1|v2");
  if (phase === "build") return phaseBuild(OUT);
  if (phase === "compare") return phaseCompare(OUT, at("--before"));
  if (phase === "package") return phasePackage(OUT);
  if (phase === "hip") return phaseHip(OUT, at("--before"));
  if (phase === "outfits") { if (!DW) throw new Error("--dwebp"); return phaseOutfits(OUT, DW); }
  if (phase === "views") return phaseViews(OUT);
  throw new Error("--phase build|outfits|views|compare|package|hip");
}

function phaseBuild(OUT) {
  const t0 = Date.now(), E = env(), { base, w, T, src } = E, m0 = LS.buildMasterFor(LS.SPEC, E.t, src), hip = VERSION === "v2" ? LS2.coverBaseTopStrip(E.t, m0, base) : null;
  const t = hip ? hip.t : E.t, master = hip ? hip.master : m0, item = union(src.layers), g = S1.geometry(t.core);
  // the ONE placement: D-269's chest-center box as it lies on C for the approved print tees (tp-approval-candidates-v1.json boxOnC). D-269
  // defines it as fractions of the cut's geometry, whose body width is measured below the sleeves' end; a long sleeve reaches the hip, so
  // that measure is undefined here (40 px) — every top sits on the same figure C, so the box on C is the rule's cut-independent form
  const cand = JSON.parse(readFileSync(join(ROOT, "tools", "avatar", "fixtures", "northstar-wardrobe", "tee-master", "tp-approval-candidates-v1.json"), "utf8")), box = cand.placement.boxOnC, armpitRow = Math.max(LS.SPEC.seams.left.at(-1)[1], LS.SPEC.seams.right.at(-1)[1]);
  const zero = new Uint8Array(N), clear = PF.clearance(master, t, zero, base.arms), motifs = {};
  for (const [k, m] of Object.entries(MOTIFS)) { const b = readFileSync(join(ART, "tp-validation-calls", m.callId, "tpv.image-1.png")); if (sha(b) !== m.sha256) throw new Error(k + ": not the received motif"); motifs[k] = PF.prepareFor(TMM.decodeRgba(b), [box[2], box[3]]); }
  const green = median(item, (i) => master.panel[i] === 0 && !t.contour[i * 4 + 3] && item[i * 4 + 3] >= 250 && Math.abs(master.ratio[i] - 1) < 0.03);
  mkdirSync(join(OUT, "layers"), { recursive: true }); const designs = {};
  const srcFit = R1.checkItem(w, base, T, t, src.layers);
  for (const [name, d] of Object.entries(DESIGNS)) {
    const rgb = d.colour === "source" ? green : COLOURS[d.colour], plain = TM.render(master, t, base, null, { body: rgb });
    let L = plain, print = null;
    if (d.print) { const p = PF.placePrint(master, t, base, plain.layer, motifs[d.print].img, box); L = p; let minClear = 99; for (const i of p.footprint) minClear = Math.min(minClear, clear[i]);
      print = { motif: d.print, sha256: MOTIFS[d.print].sha256, box, at: p.at, size: motifs[d.print].size.limitedBy, footprintPx: p.footprint.length, onContour: p.onContour, minClearancePx: minClear, safe: minClear >= PF.MARGIN && p.onContour === 0, fringe: PF.fringe(motifs[d.print].img) }; }
    let moved = null; if (VERSION === "v2") { const sp = LS2.splitLayers(L.layer, base); L = { ...L, layers: sp.layers }; moved = sp.moved; }
    let alphaDiff = 0; for (let i = 0; i < N; i++) if ((L.layer[i * 4 + 3] | 0) !== (item[i * 4 + 3] | 0)) alphaDiff++;
    const fit = R1.checkItem(w, base, T, t, L.layers), wg = wristAndGap(L.layers, base, master, armpitRow).sides;
    let fid = null; if (d.colour === "source") { const dd = []; for (let i = 0; i < N; i++) if (item[i * 4 + 3] >= 250) dd.push(Math.max(...[0, 1, 2].map((k) => Math.abs(L.layer[i * 4 + k] - item[i * 4 + k])))); dd.sort((a, b) => a - b); fid = { p50: dd[dd.length >> 1], p95: dd[Math.floor(dd.length * 0.95)], p99: dd[Math.floor(dd.length * 0.99)], max: dd[dd.length - 1] }; }
    writeFileSync(join(OUT, "layers", slug(name) + ".png"), encodePng(W, H, L.layer));
    designs[name] = { rgb, movedToSleevesPx: moved, fit: { ok: fit.ok, failed: fit.failed }, alphaPxDifferingFromCut: alphaDiff, cuffsAndHands: wg, print, fidelityToSourceMaxChannelDiff: fid }; gc(); }
  // the layer map: body grey-blue, sleeves green, hands (C's arms below the cuffs) orange, seams red
  const pm = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) { const p = master.panel[i]; let c = null; if (t.core[i]) c = p === 0 ? [150, 160, 190] : p === 1 ? [90, 190, 110] : [90, 160, 210]; else if (base.arms[i * 4 + 3] >= 128) c = [240, 160, 80]; if (c) pm.set([...c, 255], i * 4); }
  for (const line of Object.values(master.seams)) for (const [x, y] of line) pm.set([220, 0, 0, 255], (y * W + x) * 4);
  const srcWG = wristAndGap(src.layers, base, master, armpitRow); for (let i = 0; i < N; i++) if (srcWG.shown[i]) pm.set([255, 0, 255, 255], i * 4);
  for (let y = box[1]; y < box[1] + box[3]; y++) for (const x of [box[0], box[0] + box[2] - 1]) pm.set([0, 0, 0, 255], (y * W + x) * 4); for (let x = box[0]; x < box[0] + box[2]; x++) for (const y of [box[1], box[1] + box[3] - 1]) pm.set([0, 0, 0, 255], (y * W + x) * 4);
  writeFileSync(join(OUT, "layer-map.png"), encodePng(W, H, pm));
  const rec = { decision: VERSION === "v2" ? "D-335" : "D-333", hipSeam: hip ? { addedPx: hip.addedPx, box: hip.box, ink: hip.ink } : null, splitRule: VERSION === "v2" ? "LS2.splitLayers: sleeve layer where C's arm alpha >= " + LS2.SLEEVE_FROM_ARM_ALPHA : "production: sleeve layer where C's arm alpha >= 128", master: { revision: VERSION === "v2" ? LS2.REVISION : LS.REVISION, spec: LS.SPEC, source: { ...LS.SOURCE, origin: E.origin }, sizes: master.sizes, seamPx: { left: master.seams.left.length, right: master.seams.right.length }, base: master.base, sourceColour: green },
    geometry: { bbox: g.bbox, height: g.height, bodyWidthBelowSleeves: g.bodyWidthBelowSleeves, sleeveEndRow: g.sleeveEndRow, fractionRuleBoxWouldBe: PF.placementBox(g, "chest-center") },
    placement: { rule: "D-269 chest-center as its box on C (tp-approval-candidates-v1.json boxOnC); the fraction rule's body width is undefined on a long sleeve", spec: PF.PLACEMENTS["chest-center"], box, armpitRow },
    source: { fit: { ok: srcFit.ok, failed: srcFit.failed }, cuffsAndHands: srcWG.sides }, designs, seconds: Math.round((Date.now() - t0) / 1000) };
  writeFileSync(join(OUT, "build.json"), JSON.stringify(rec, null, 2) + "\n"); console.log(JSON.stringify({ sizes: master.sizes, box, designs: Object.fromEntries(Object.entries(designs).map(([n, d]) => [n, [d.fit.ok, d.fit.failed.join("|"), d.alphaPxDifferingFromCut, d.print ? d.print.minClearancePx + "/" + d.print.safe : "-"]])), fidelity: designs["green (source colour)"].fidelityToSourceMaxChannelDiff, cuffs: designs.heather.cuffsAndHands, seconds: rec.seconds }));
}

function phaseOutfits(OUT, DW) {
  const t0 = Date.now(), E = env(), { base, w, src } = E, spec = JSON.parse(readFileSync(join(ROOT, "tools", "avatar", "fixtures", "northstar-wardrobe", "runtime-assets-inputs-d242.json"), "utf8"));
  const { P } = loadItems(Object.fromEntries(["bottom-skirt-sand", "bottom-shorts-navy", "bottom-capri-lightblue", "bottom-trousers-square-olive", SHOE].map((id) => [id, spec.items[id]])));
  const tmp = join(tmpdir(), "d333-" + process.pid); mkdirSync(tmp, { recursive: true }); const dec = (f) => { const o = join(tmp, "x.png"); execFileSync(DW, ["-quiet", join(PUB, f), "-o", o]); return loadPx(o); };
  for (const id of ["bottom-trousers-square-navy", "bottom-trousers-square-sand"]) P[id] = { item: id, layers: { pants: dec(id + "-pants-v1.webp") }, shadow: P["bottom-trousers-square-olive"].shadow, category: "bottom", covering: "none" };
  rmSync(tmp, { recursive: true, force: true }); mkdirSync(join(OUT, "full"), { recursive: true });
  const top = (layer) => { let ls; if (VERSION === "v2") ls = LS2.splitLayers(layer, base).layers; else { const tb = new Uint8ClampedArray(N * 4), sl = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) if (layer[i * 4 + 3]) (base.arms[i * 4 + 3] >= 128 ? sl : tb).set(layer.subarray(i * 4, i * 4 + 4), i * 4); ls = { topBody: tb, sleeves: sl }; }
    return { item: "ls", layers: ls, shadow: src.shadow, category: "top", covering: "none" }; };
  const units = {}, ref = {};
  for (const bt of BOTTOMS) { const x = R1.checkOutfit(w, base, [src, P[bt], P[SHOE]]); ref[bt] = { ok: x.ok, failed: x.failed }; x.proof = null; gc(); }
  for (const name of Object.keys(DESIGNS)) { const it = top(loadPx(join(OUT, "layers", slug(name) + ".png")));
    for (const bt of BOTTOMS) { const x = R1.checkOutfit(w, base, [it, P[bt], P[SHOE]]); let c = x.proof.dressedRuntime; for (const s of [it.shadow, P[bt].shadow, P[SHOE].shadow]) c = IP.applyShadow(c, x.proof.stack, s);
      writeFileSync(join(OUT, "full", slug(name) + "--" + bt.replace("bottom-", "") + ".png"), encodePng(W, H, c));
      units[name + " | " + bt] = { ok: x.ok, failed: x.failed, sourceItem: ref[bt], sameVerdictAsSource: x.ok === ref[bt].ok && x.failed.join() === ref[bt].failed.join() }; x.proof = null; c = null; gc(); } }
  const all = Object.values(units), rec = { decision: VERSION === "v2" ? "D-335" : "D-333", master: VERSION, shoe: SHOE, bottoms: BOTTOMS, sourceItem: ref, units, summary: { units: all.length, pass: all.filter((u) => u.ok).length, sameVerdictAsSource: all.filter((u) => u.sameVerdictAsSource).length }, seconds: Math.round((Date.now() - t0) / 1000) };
  writeFileSync(join(OUT, "outfits.json"), JSON.stringify(rec, null, 2) + "\n"); console.log(JSON.stringify({ summary: rec.summary, sourceItem: ref, failing: Object.entries(units).filter(([, u]) => !u.ok).map(([k, u]) => k + ": " + u.failed.join("|")), seconds: rec.seconds }));
}

function phaseViews(OUT) {
  const V = join(OUT, "views"); mkdirSync(V, { recursive: true }); const names = Object.keys(DESIGNS), save = (n, gr) => writeFileSync(join(V, n), encodePng(gr.w, gr.h, gr.px));
  const FIG = [250, 0, 774, 1536], BOX = { "armhole left": [330, 560, 450, 720], "armhole right": [574, 560, 694, 720], "cuff left": [280, 770, 420, 870], "cuff right": [604, 770, 744, 870], "hem + waistband": [370, 780, 654, 880], "hip right": [590, 770, 670, 840], "chest print": [420, 520, 604, 690] };
  const row = (bt) => names.map((n) => loadPx(join(OUT, "full", slug(n) + "--" + bt + ".png")));
  for (const [bn, bg] of [["light", LIGHT], ["dark", DARK]]) { const F = row("trousers-square-navy"); save("figure--trousers-navy--" + bn + ".png", grid(F.map((P) => down(flat(P, bg), 262, 768, FIG)), names.length, 8)); }
  for (const [bn, bt] of [["skirt", "skirt-sand"], ["shorts", "shorts-navy"], ["capri", "capri-lightblue"], ["olive", "trousers-square-olive"], ["sand", "trousers-square-sand"]]) { const F = row(bt); save("figure--" + bn + "--light.png", grid(F.map((P) => down(flat(P, LIGHT), 262, 768, FIG)), names.length, 8)); }
  for (const [k, b] of Object.entries(BOX)) { const tiles = []; for (const bt of k.startsWith("hem") || k.startsWith("hip") ? ["skirt-sand", "shorts-navy", "capri-lightblue", "trousers-square-olive", "trousers-square-navy", "trousers-square-sand"] : ["trousers-square-navy"]) for (const P of row(bt)) tiles.push(crop(flat(P, LIGHT), b, 3)); save("close--" + slug(k) + "--x3.png", grid(tiles, names.length, 8)); gc(); }
  for (const [bn, bg] of [["light", LIGHT], ["dark", DARK]]) for (const [w2, h2] of [[110, 165], [300, 450]]) { const F = [...row("trousers-square-navy"), ...row("capri-lightblue")]; save("app--" + w2 + "x" + h2 + "--" + bn + ".png", grid(F.map((P) => down(flat(P, bg), w2, h2)), names.length, 6)); gc(); }
  save("layer-map--x2.png", grid([crop(loadPx(join(OUT, "layer-map.png")), [280, 440, 744, 860], 2)], 1, 0));
  console.log(JSON.stringify({ views: "written", columns: names }));
}
/** Warm pixels over the sleeves in a composite: red - blue > 25 and red > 90 where the top's layer is opaque (>= 128) and gray-ish
 *  fabric is expected (heather): C's arm contour showing through the fabric. */
function warmOver(comp, layer) { let n = 0; for (let i = 0; i < N; i++) { if (layer[i * 4 + 3] < 128) continue; const y = (i / W) | 0; if (y < 520 || y > 840) continue; if (comp[i * 4] - comp[i * 4 + 2] > 25 && comp[i * 4] > 90) n++; } return n; }
function phaseCompare(OUT, BEFORE) {
  if (!BEFORE) throw new Error("--before <the v1 out dir>"); const V = join(OUT, "views"); mkdirSync(V, { recursive: true });
  const res = {}, tiles = { "armhole left": [], "armhole right": [], "sleeve left": [], "cuff left": [], "cuff right": [] }, B = { "armhole left": [330, 560, 450, 720], "armhole right": [574, 560, 694, 720], "sleeve left": [300, 520, 420, 660], "cuff left": [280, 770, 420, 870], "cuff right": [604, 770, 744, 870] };
  for (const name of ["heather", "heather + teapot", "navy"]) for (const [tag, dir] of [["v1", BEFORE], ["v2", OUT]]) { const L = loadPx(join(dir, "layers", slug(name) + ".png")), C = loadPx(join(dir, "full", slug(name) + "--trousers-square-navy.png"));
    res[name + " " + tag] = { warmOverSleevesPx: warmOver(C, L) };
    if (name === "heather") for (const [k, b] of Object.entries(B)) tiles[k].push(crop(flat(C, LIGHT), b, 4)); }
  for (const [k, t] of Object.entries(tiles)) { const g = grid(t, 2, 12); writeFileSync(join(V, "before-after--" + slug(k) + "--x4.png"), encodePng(g.w, g.h, g.px)); }
  writeFileSync(join(OUT, "compare.json"), JSON.stringify({ decision: "D-335", before: "ls-master-v1 (D-333)", after: "ls-master-v2 (D-335)", outfit: "with navy trousers and beige sneakers", res }, null, 2) + "\n"); console.log(JSON.stringify(res));
}
function phasePackage(OUT) {
  const O = JSON.parse(readFileSync(join(OUT, "outfits.json"), "utf8")), names = Object.keys(DESIGNS).filter((n) => DESIGNS[n].colour !== "source"), V = join(OUT, "views"); mkdirSync(V, { recursive: true });
  const vis = VERSION === "v2" ? VISUAL_HELD_V2 : {}, ok = BOTTOMS.filter((bt) => !OWNER_HELD[bt] && !vis[bt] && names.every((n) => O.units[n + " | " + bt].ok)), out = BOTTOMS.filter((bt) => !ok.includes(bt));
  const candidates = names.flatMap((n) => ok.map((bt) => ({ id: "LS2-" + slug(n).toUpperCase() + "--" + bt.replace("bottom-", ""), design: n, top: DESIGNS[n], bottom: bt, shoes: SHOE, technical: "PASS" })));
  for (const [bn, bg] of [["light", LIGHT], ["dark", DARK]]) for (const [w2, h2] of [[110, 165], [300, 450]]) { const tiles = []; for (const n of names) for (const bt of ok) tiles.push(down(flat(loadPx(join(OUT, "full", slug(n) + "--" + bt.replace("bottom-", "") + ".png")), bg), w2, h2)); writeFileSync(join(V, "package--" + w2 + "x" + h2 + "--" + bn + ".png"), (() => { const g = grid(tiles, ok.length, 6); return encodePng(g.w, g.h, g.px); })()); gc(); }
  const rec = { decision: "D-335", master: "ls-master-v2", rows: names, columns: ok, candidates, heldOut: out.map((bt) => ({ bottom: bt, ownerHeld: OWNER_HELD[bt] || null, visualHeld: vis[bt] || null, failed: [...new Set(names.flatMap((n) => O.units[n + " | " + bt].failed))], sourceItemAlso: O.sourceItem[bt] })) };
  writeFileSync(join(OUT, "candidates.json"), JSON.stringify(rec, null, 2) + "\n"); console.log(JSON.stringify({ candidates: candidates.length, columns: ok, heldOut: rec.heldOut }));
}
function phaseHip(OUT, BEFORE) {
  if (!BEFORE) throw new Error("--before <the previous out dir>"); const V = join(OUT, "views"), HB = [590, 770, 670, 840]; mkdirSync(V, { recursive: true });
  const bots = ["skirt-sand", "capri-lightblue", "trousers-square-olive", "trousers-square-navy", "trousers-square-sand", "shorts-navy"], sets = { x1: [], x6: [], app300: [], app110: [] };
  for (const n of ["heather", "navy"]) for (const bt of bots) for (const dir of [BEFORE, OUT]) { const C = flat(loadPx(join(dir, "full", slug(n) + "--" + bt + ".png")), LIGHT);
    sets.x1.push(crop(C, HB, 1)); sets.x6.push(crop(C, HB, 6)); sets.app300.push(down(C, 300, 450)); sets.app110.push(down(C, 110, 165)); }
  for (const [k, t] of Object.entries(sets)) { const g = grid(t, 4, k === "x1" ? 4 : 8); writeFileSync(join(V, "hip-before-after--" + k + ".png"), encodePng(g.w, g.h, g.px)); gc(); }
  const ob = JSON.parse(readFileSync(join(BEFORE, "outfits.json"), "utf8")).units, oa = JSON.parse(readFileSync(join(OUT, "outfits.json"), "utf8")).units, verdicts = {};
  for (const k of Object.keys(oa)) verdicts[k] = { before: ob[k] ? (ob[k].ok ? "PASS" : ob[k].failed.join("|")) : null, after: oa[k].ok ? "PASS" : oa[k].failed.join("|") };
  writeFileSync(join(OUT, "hip.json"), JSON.stringify({ decision: "D-335", layout: "rows: heather (6 bottoms), then navy; per bottom two columns: before | after; bottoms: " + bots.join(", "), verdicts }, null, 2) + "\n");
  console.log(JSON.stringify(Object.fromEntries(Object.entries(verdicts).filter(([, v]) => v.before !== v.after))));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error("REFUSED: " + e.message); process.exit(1); });
