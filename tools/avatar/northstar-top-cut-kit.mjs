// D-342 — THE TOP CUT KIT: the shared method for a top (tee, sweater, …), with every cut-specific number in a CONTRACT (one JSON per cut
// under tools/avatar/fixtures/northstar-wardrobe/top-cuts/). Offline; no image call; publishes nothing; no runtime file changes. The locked
// method files are NOT changed (northstar-tee-master.mjs is pinned by D-267/D-270's plans; northstar-longsleeve-master.mjs and -v2.mjs are
// D-333/D-335's recorded versions): this module only calls them, with the contract's data, and proves it by reproducing the owner-approved
// tee (D-274) and sweater (D-336) layers byte for byte (northstar-top-cut-kit-study.mjs --phase control).
//   what is shared (the same code for every cut)
//     master    — LS.buildMasterFor(spec): panels split along the drawn armhole seams, the shading ratio, the fold/cylinder displacement,
//                 the sleeve axes (D-264's method, D-333's parameter). With the tee's data it IS TM.buildMaster (D-333's test).
//     render    — TM.render on a colour (the cut's own contour on top), then PF.placePrint at the print box (D-269/D-271's print path).
//     split     — LS2.splitLayers with the cut's threshold: a fabric pixel goes to the sleeve layer from that alpha of C's arm. With 128 it is
//                 TM.render's/PF.placePrint's production split (tee); with 1 it is D-335's long-sleeve repair.
//     hip seam  — LS2.hipSeamLayer (D-335 v3): C's base top uncovered at the hip, as the cut's ink, in a layer drawn behind the bottom.
//     shadow    — the cut item's skin shadow split by C's figure (D-242): arms where C's arm alpha >= 128, body elsewhere on C's body.
//     print box — D-269's chest-center box held as its box on C (the same on every top, since every top sits on C).
//   what is per cut (the contract) — the source item and how its template is read; the seam polylines (by hand, once) and the armpit
//     direction; the warp; the sleeve kind and split threshold; cuffs; trim bands (for the print's safe area); the print box; the shadow;
//     whether a hip seam is needed. A SLEEVELESS cut has seams: null — the master is then built with both seams placed outside the cut
//     (SLEEVELESS_SEAMS), so the same method leaves one body panel and no sleeve panel (checked).
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng } from "./r3-hair-tool-v2.mjs";
import * as WR from "./northstar-wardrobe.mjs";
import * as BC from "./northstar-base-figure-c.mjs";
import * as IP from "./northstar-item-pilot.mjs";
import * as R1 from "./northstar-r1-garment.mjs";
import * as RC from "./northstar-r1c-evaluate.mjs";
import * as TM from "./northstar-tee-master.mjs";
import * as LS from "./northstar-longsleeve-master.mjs";
import * as LS2 from "./northstar-longsleeve-master-v2.mjs";
import * as PF from "./northstar-tee-print-family.mjs";
import { loadItems } from "./build-northstar-runtime-assets.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", ".."), { W, N } = WR;
export const CUTS_DIR = "tools/avatar/fixtures/northstar-wardrobe/top-cuts";
export const CONTRACT = "top-cut-v1";
/** The method files this kit calls and does not change (sha256): the tee master is pinned by D-267/D-270's plans; the long-sleeve
 *  master v1/v2 are D-333/D-335's recorded versions; the print family is pinned by D-270's plan. */
export const LOCKED = Object.freeze({
  "tools/avatar/northstar-tee-master.mjs": "6a4b650cb8d8cbd162bc5a8563a59b4b27ac5fa2dfcd0459a359bb405f881038",
  "tools/avatar/northstar-longsleeve-master.mjs": "dbb1037cc45861f879137d877c697ad931867174dbb4e3273fcd7a8eaadaddad",
  "tools/avatar/northstar-longsleeve-master-v2.mjs": "e9e3022eebcbeeb2c26627efbe9c94e1d4821397905e1ee4ddc7bb8b960c6305",
  "tools/avatar/northstar-tee-print-family.mjs": "7155a4193bcf961ce06f948be3e63c1bd8a148f8aa1f9ff52510eefec5e35521",
});
/** A sleeveless cut's seams: two short vertical runs at the canvas edges, far outside any top, so the barrier never meets the cut. */
export const SLEEVELESS_SEAMS = Object.freeze({ left: [[2, 500], [2, 520]], right: [[W - 3, 500], [W - 3, 520]] });
const REQUIRED = ["id", "label", "contract", "family", "source", "panels", "warp", "sleeves", "trim", "print", "shadow", "runtime", "oneTimeWork"];

/** A cut contract, validated. */
export function loadCut(id) { return checkCut(JSON.parse(readFileSync(join(ROOT, CUTS_DIR, id + ".json"), "utf8"))); }
export function checkCut(c) {
  const p = []; for (const k of REQUIRED) if (c[k] === undefined) p.push("missing " + k);
  if (!p.length) {
    if (c.contract !== CONTRACT) p.push("contract must be " + CONTRACT);
    if (!["r1c-cut", "item-layers"].includes(c.source.template)) p.push("source.template: r1c-cut | item-layers");
    if (c.source.template === "item-layers" && !(c.source.run && c.source.method)) p.push("source: an item-layers cut names its run and method");
    const s = c.panels.seams, kind = c.sleeves.kind;
    if (!["short", "long", "none"].includes(kind)) p.push("sleeves.kind: short | long | none");
    if ((kind === "none") !== (s === null)) p.push("a sleeveless cut has seams: null, a sleeved cut has both seams");
    if (s) for (const side of ["left", "right"]) { const l = s[side]; if (!Array.isArray(l) || l.length < 2 || l.some((q, k) => !Number.isInteger(q[0]) || !Number.isInteger(q[1]) || (k && q[1] <= l[k - 1][1]))) p.push("seams." + side + ": integer points, rows going down"); }
    if (s && !(c.panels.armpitOut && c.panels.armpitOut.left && c.panels.armpitOut.right)) p.push("a sleeved cut gives the armpit direction per side");
    if (![1, 128].includes(c.sleeves.layerSplitFromArmAlpha)) p.push("sleeves.layerSplitFromArmAlpha: 128 (production) or 1 (D-335)");
    if (!["r1c-construction", "none"].includes(c.trim.bands)) p.push("trim.bands: r1c-construction | none");
    if (c.trim.bands === "r1c-construction" && c.source.template !== "r1c-cut") p.push("trim bands come from the r1c cut only");
    const b = c.print.boxOnC; if (!Array.isArray(b) || b.length !== 4 || !b.every(Number.isInteger)) p.push("print.boxOnC: [x0, y0, w, h]");
    if (c.hipSeam && (c.hipSeam.rule !== "LS2.hipSeamLayer" || JSON.stringify(c.hipSeam.rows) !== JSON.stringify(LS2.HIP_ROWS))) p.push("hipSeam: only LS2.hipSeamLayer with its rows " + JSON.stringify(LS2.HIP_ROWS) + " is implemented");
    for (const k of ["cylinder", "foldMaxPx", "foldBlur"]) if (typeof c.warp[k] !== "number") p.push("warp." + k);
    if (!Array.isArray(c.oneTimeWork) || !c.oneTimeWork.length) p.push("oneTimeWork: what was done by hand, once");
  }
  if (p.length) throw new Error((c && c.id ? c.id + ": " : "") + p.join("; "));
  return c;
}

/** The master spec the shared method reads (the shape of TM.SPEC / LS.SPEC). */
export function specOf(c) {
  const s = c.panels.seams;
  return { cut: c.id, source: c.source.item, seams: s || SLEEVELESS_SEAMS, seamSearchPx: c.panels.seamSearchPx ?? TM.SPEC.seamSearchPx, extendPx: c.panels.extendPx ?? TM.SPEC.extendPx,
    armpitOut: s ? c.panels.armpitOut : { left: [0, 1], right: [0, 1] }, warp: { ...c.warp }, anchors: {} };
}

/** C, its wardrobe and templates (private: needs ITEM_PILOT_C_PATH). */
export function envC() { const w = WR.buildWardrobe(), base = BC.prepareBase(w, Uint8ClampedArray.from(decodePng(IP.readC()).px)), T = BC.templatesC(w, base, { revision: "d213" }); return { w, base, T }; }

/** The cut's template, source item and trim bands. */
export function cutOf(c, E) {
  if (c.source.template === "r1c-cut") { const r = RC.cutOf(E); return { t: r.t, src: r.src, bands: c.trim.bands === "r1c-construction" ? r.cl.band : new Uint8Array(N), origin: { cut: "RC.cutOf", item: c.source.item } }; }
  const { P, origin } = loadItems({ [c.source.item]: { run: c.source.run, method: c.source.method } }), src = P[c.source.item];
  const t = R1.templateFromLayers(src.layers, { shadow: src.shadow, covering: "none", category: "top", cut: c.id });
  return { t, src, bands: new Uint8Array(N), origin: origin[c.source.item] };
}

/** The master of the cut (the shared method). A sleeveless cut must come out with no sleeve panel. */
export function buildMaster(c, t, src) {
  const m = LS.buildMasterFor(specOf(c), t, src);
  if (c.sleeves.kind === "none" && (m.sizes.left || m.sizes.right)) throw new Error(c.id + ": a sleeveless cut got sleeve panels");
  if (c.sleeves.kind !== "none" && !(m.sizes.left > 0 && m.sizes.right > 0)) throw new Error(c.id + ": a sleeved cut got no sleeve panel");
  return m;
}

/** Everything a cut needs to render: { c, E, t, src, bands, master, origin }. */
export function prepare(c, E = envC()) { const { t, src, bands, origin } = cutOf(c, E); return { c, E, t, src, bands, origin, master: buildMaster(c, t, src) }; }

/** A design on the cut: { rgb: [r,g,b], print?: prepared image (PF.prepareFor's img) }. Returns the full layer, its split by the cut's rule
 *  and the print's placement. */
export function renderDesign(ctx, design) {
  const { c, t, master, E, bands } = ctx, plain = TM.render(master, t, E.base, bands, { body: design.rgb });
  let layer = plain.layer, print = null;
  if (design.print) { const p = PF.placePrint(master, t, E.base, plain.layer, design.print, c.print.boxOnC); layer = p.layer; print = { at: p.at, footprintPx: p.footprint.length, onContour: p.onContour, footprint: p.footprint }; }
  const sp = LS2.splitLayers(layer, E.base, c.sleeves.layerSplitFromArmAlpha);
  return { layer, layers: sp.layers, movedToSleevesPx: c.sleeves.layerSplitFromArmAlpha < 128 ? sp.moved : 0, print };
}

/** The print's safe area on the cut (chessboard distance from the cut's edge, contour, sleeve panels, trim bands and C's arms). */
export function printClearance(ctx) { return PF.clearance(ctx.master, ctx.t, ctx.bands, ctx.E.base.arms); }

/** The cut's hip-seam layer (null when the cut needs none). */
export function hipSeam(ctx) { if (!ctx.c.hipSeam) return null; return LS2.hipSeamLayer(ctx.t, ctx.master, ctx.E.base); }

/** The cut's skin shadow split by C's figure (D-242): { body, arms } (a part without pixels is left out). */
export function shadowParts(ctx) {
  const s = ctx.t.shadow || ctx.src.shadow, base = ctx.E.base, out = {};
  if (!s) return out;
  for (const part of ["body", "arms"]) { const o = new Uint8ClampedArray(N * 4); let n = 0;
    for (let i = 0; i < N; i++) { if (!s[i * 4 + 3]) continue; const arm = base.arms[i * 4 + 3] >= 128, bod = base.body[i * 4 + 3] >= 128; if (part === "arms" ? arm : bod && !arm) { o.set(s.subarray(i * 4, i * 4 + 4), i * 4); n++; } }
    if (n) out[part] = o; }
  return out;
}

/** The runtime item a design of the cut would have (NORTHSTAR_ITEMS shape), for a proposal only (nothing here changes the runtime). */
export function itemShape(c, shadows) {
  const o = { category: "top", layers: [...c.runtime.layers], shadows: [...shadows] };
  if (c.runtime.shadowsOf) o.shadowsOf = c.runtime.shadowsOf; if (c.runtime.hipSeam) o.hipSeam = c.runtime.hipSeam; return o;
}
