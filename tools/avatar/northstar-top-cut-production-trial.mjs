// D-351 — OFFLINE PRODUCTION TRIAL OF THE TOP CUT KIT: 12 design recipes (production-trial-recipes-v1.json; 4 fabrics, 4 patterns, 4
// existing chest motifs) applied to the three approved cuts (tee-hip, sweater-long, tank-v3) = 36 CANDIDATES on the fixed figure C. No
// image call; nothing published; no runtime, catalogue, shop, database, flag or pupil change; the combination lists are not extended.
// Every view shows C: --out must be outside the repository. One cut and one recipe at a time; every unit is written as soon as it is done
// (units/<cut>--<slug>.json) and skipped on a rerun with the same inputs, so a stopped run resumes.
//   control  — the approved tank designs (D-345/D-348: tank-v3, heather and navy, plain/teapot/fox) through the kit equal their published
//              top-body files byte for byte, and the cut's hem junction equals the published one (the tee and sweater controls are
//              northstar-top-cut-kit-study.mjs --phase control, D-342's, run as before).
//   render   — per cut and recipe: the layer (K.renderDesign with the recipe's swatch and motif), and the checks: the alpha is the cut's
//              (geometry), the cut's contour ink is untouched, the fit check (R1.checkItem, the production fit check), the print's
//              footprint inside the safe area (PF.clearance >= PF.MARGIN, nothing on the contour), the tank has no sleeve layer.
//   outfits  — per cut and recipe, a light and a dark (bottom, shoes) pair taken from each cut's own current list (the tee's reachable
//              cream-tee outfits, NORTHSTAR_LS2_COMBOS, NORTHSTAR_TANK_COMBOS): the production outfit check with the cut's layer behind
//              the bottom (checkOutfitSeam), its composite with the skin shadows; and the reuse evidence: the feet (rows FEET_ROW..)
//              equal the runtime composition of an approved outfit with the same bottom and shoes (only the top is new).
//   views    — sheets: the 12 recipes x 3 cuts (figure, light and dark), app sizes 110x165 and 300x450, close-ups x3 (armholes, hem/hip,
//              chest, sleeve end) per recipe; the swatches.
//   page     — a private index.html with the comparison, the candidates' verdicts (verdicts.json, written by hand after the visual
//              review), the timings and the capacity assessment (capacity.json).
// D-352 adds: bands (the trim bands of a cut with them, overlays), decision (the private decision page with before/after against --prev),
// and --recipes <file> (another recipe file with its own "cuts", e.g. the trim-band contract versions; default D-351's).
// Usage: node --expose-gc tools/avatar/northstar-top-cut-production-trial.mjs --phase control|bands|render|outfits|views|page|decision --out <dir> --dwebp <exe> [--cut <id>] [--recipes <file>] [--prev <dir>]
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { encodePng, decodePng } from "./r3-hair-tool-v2.mjs";
import * as WR from "./northstar-wardrobe.mjs";
import * as R1 from "./northstar-r1-garment.mjs";
import * as IP from "./northstar-item-pilot.mjs";
import * as TMM from "./northstar-tee-material.mjs";
import * as PF from "./northstar-tee-print-family.mjs";
import * as K from "./northstar-top-cut-kit.mjs";
import * as RC from "./northstar-top-cut-recipes.mjs";
import * as SC from "./northstar-ls2-shoe-compat.mjs";
import { partners } from "./northstar-tank-family.mjs";
import { checkOutfitSeam } from "./northstar-longsleeve-master-study.mjs";
import { flat, crop, grid, down } from "./northstar-wardrobe-poc.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", ".."), PUB = join(ROOT, "assets", "avatar-northstar"), { W, N } = WR, H = N / W;
const sha = (b) => createHash("sha256").update(b).digest("hex"), pxSha = (px) => sha(Buffer.from(px.buffer, px.byteOffset, px.byteLength)), gc = () => { if (typeof globalThis.gc === "function") globalThis.gc(); };
const LIGHT = [236, 233, 226], DARK = [24, 26, 40], loadPx = (f) => Uint8ClampedArray.from(decodePng(readFileSync(f)).px), json = (f) => JSON.parse(readFileSync(f, "utf8"));
export const CUTS = Object.freeze(["tee-hip", "sweater-long", "tank-v3"]);
// D-352: --recipes <file> runs another recipe file with its own "cuts" (e.g. the trim-band contract versions); the default is D-351's
let RECIPES_REL = RC.RECIPES_FILE, RUN_CUTS = CUTS;
/** The runtime list a cut version answers to (a contract version keeps its cut's list: sweater-long-v2 is the sweater, tank-v4 the tank). */
export const listOf = (cut) => (cut.startsWith("tee-hip") ? "tee-hip" : cut.startsWith("sweater-long") ? "sweater-long" : cut.startsWith("tank") ? "tank-v3" : null);
/** The cut's item in the runtime lists (whose pairs are the cut's current list). */
const CUT_TOPS = { "tee-hip": "top-tee-hip-cream" };
const FIG = [250, 0, 774, 1536];
export const CLOSE = Object.freeze({ "armhole left": [330, 520, 450, 680], "armhole right": [574, 520, 694, 680], chest: [420, 520, 604, 690], "hem and hip right": [560, 720, 680, 860], "sleeve end left": [270, 600, 420, 900] });
/** The representative pairs, in preference order: light (a light bottom with light shoes) and dark (a dark bottom with dark shoes). */
export const PAIR_PREFERENCE = Object.freeze({
  light: [["bottom-trousers-square-sand", "shoes-sneakers-white"], ["bottom-trousers-square-sand", "shoes-sneakers-low-sv1-chalk"], ["bottom-skirt-sand", "shoes-sneakers-white"], ["bottom-skirt-sand", "shoes-sneakers-beige"], ["bottom-capri-lightblue", "shoes-sneakers-white"]],
  dark: [["bottom-trousers-square-navy", "shoes-boots-laceup-black"], ["bottom-trousers-square-navy", "shoes-sneakers-low-sv1-charcoal"], ["bottom-trousers-square-navy", "shoes-ankleboots-ab1-original"], ["bottom-trousers-square-navy", "shoes-ankleboots-brown"], ["bottom-trousers-square-olive", "shoes-ankleboots-brown"]],
});

/** Each cut's current (bottom, shoes) pairs, from the runtime's own lists (nothing is added). */
export function cutPairs(AL) {
  const tee = new Set(); for (const k of Object.keys(AL.NORTHSTAR_OUTFITS)) for (const p of [null, ...Object.keys(AL.NORTHSTAR_SOLID_PANTS)]) for (const s of [null, ...Object.keys(AL.NORTHSTAR_SHOE_CHOICES)]) {
    const o = AL.northstarOutfitFor(k, null, p, s); if (o && o.top === CUT_TOPS["tee-hip"] && AL.northstarPlanFor(o)) tee.add(o.bottom + "|" + o.shoes); }
  const of = (list) => new Set(list.map((c) => { const [, b, s] = c.split("+"); return b + "|" + s; }));
  return { "tee-hip": tee, "sweater-long": of(AL.NORTHSTAR_LS2_COMBOS), "tank-v3": of(AL.NORTHSTAR_TANK_COMBOS) };
}
/** The light and the dark pair: the first preferred pair on every cut's list (so the three cuts are compared on the same outfit). */
export function representativePairs(AL) {
  const P = cutPairs(AL), out = {};
  for (const [tone, prefs] of Object.entries(PAIR_PREFERENCE)) { const hit = prefs.find(([b, s]) => CUTS.every((c) => P[listOf(c)].has(b + "|" + s))); if (!hit) throw new Error("no " + tone + " pair is on all three lists"); out[tone] = { bottom: hit[0], shoes: hit[1] }; }
  return out;
}

const motifCache = {};
function motifFor(name, box) { const k = name + "|" + box.join(","); if (!motifCache[k]) motifCache[k] = PF.prepareFor(TMM.decodeRgba(RC.motifBytes(name)), [box[2], box[3]]).img; return motifCache[k]; }
function decoder(DW) { const tmp = join(tmpdir(), "d351-" + process.pid); mkdirSync(tmp, { recursive: true }); const cache = new Map();
  return { dec: (f) => { if (!cache.has(f)) { const o = join(tmp, "x.png"); execFileSync(DW, ["-quiet", join(PUB, f), "-o", o]); cache.set(f, loadPx(o)); } return cache.get(f); }, cache, done: () => rmSync(tmp, { recursive: true, force: true }) }; }
const recipes = () => RC.checkRecipes(json(join(ROOT, ...RECIPES_REL.split("/")))).recipes;
// a recipe's trim is laid only on a cut whose bands follow its drawn seams (seam-rule, D-352); the tee's construction band (D-257) ends
// inside its drawn neck seam, so the tee keeps its body fabric there (and D-351's tee candidates are unchanged)
const designOf = (r, c) => ({ swatch: RC.swatchOf(r.fabric), trim: r.trim && c.trim.bands === "seam-rule" ? RC.swatchOf(r.trim) : null, print: r.motif ? motifFor(r.motif, c.print.boxOnC) : null });
const unitId = (cut, r) => cut + "--" + r.id + "-" + r.slug;
const diffBytes = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++; return d; };

/** The approved designs of a cut through the kit against their published files: the tank's six (D-345/D-348) on tank-v3 or a tank
 *  version, the sweater's six (D-336/D-337) and its hip seam on sweater-long or a version; and the kit's fabric sampler on a solid swatch
 *  against TM.render's rgb path. A contract version with trim bands must leave every approved design exactly as it was (no design of
 *  theirs has a trim). */
function controlCut(cutId, E, D) {
  const c = K.loadCut(cutId), ctx = K.prepare(c, E), res = {}, J = (...p) => json(join(ROOT, "tools", "avatar", "fixtures", "northstar-wardrobe", ...p)), sleevePx = (L) => { let n = 0; for (let i = 0; i < N; i++) if (L[i * 4 + 3]) n++; return n; };
  if (listOf(cutId) === "tank-v3") { const A = J("tank", "tank-owner-approval-v1.json");
    const DES = { "TK-HEATHER": [PF.COLOURS.heather, null], "TK-HEATHER-TEAPOT": [PF.COLOURS.heather, "teapot"], "TK-HEATHER-FOX": [PF.COLOURS.heather, "fox"], "TK-NAVY": [PF.COLOURS.navy, null], "TK-NAVY-TEAPOT": [PF.COLOURS.navy, "teapot"], "TK-NAVY-FOX": [PF.COLOURS.navy, "fox"] };
    for (const [id, [rgb, m]] of Object.entries(DES)) { const r = K.renderDesign(ctx, { rgb, print: m ? motifFor(m, c.print.boxOnC) : null }), f = A.designs[id].proposedRuntimeItem + "-top-body-v1.webp";
      res[id] = { file: f, topBodyBytesDiffering: diffBytes(r.layers.topBody, D.dec(f)), sleevePx: sleevePx(r.layers.sleeves) }; gc(); }
    const j = K.behindBottom(ctx); res.behindBottom = { file: "top-tank-hem-junction-v1.webp", bytesDiffering: diffBytes(j.layer, D.dec("top-tank-hem-junction-v1.webp")) }; }
  else if (listOf(cutId) === "sweater-long") { const A = J("sweater", "ls2-owner-approval-v1.json");
    for (const d of Object.values(A.designs)) { const r = K.renderDesign(ctx, { rgb: d.colour.rgb, print: d.print ? motifFor(d.print.motif, c.print.boxOnC) : null });
      res[d.id] = { file: d.proposedRuntimeItem, topBodyBytesDiffering: diffBytes(r.layers.topBody, D.dec(d.proposedRuntimeItem + "-top-body-v1.webp")), sleevesBytesDiffering: diffBytes(r.layers.sleeves, D.dec(d.proposedRuntimeItem + "-sleeves-v1.webp")), sleevePx: 0 }; gc(); }
    const h = K.behindBottom(ctx); res.behindBottom = { file: c.runtime.hipSeam, bytesDiffering: diffBytes(h.layer, D.dec(c.runtime.hipSeam)) }; }
  else throw new Error(cutId + ": no control here (the tee is D-342's --phase control)");
  const a = K.renderDesign(ctx, { rgb: PF.COLOURS.navy }), b = K.renderDesign(ctx, { swatch: RC.swatchOf({ type: "solid", base: PF.COLOURS.navy }) }); let mx = 0, n = 0, al = 0;
  for (let i = 0; i < N * 4; i++) { const d = Math.abs(a.layer[i] - b.layer[i]); if (d) { n++; mx = Math.max(mx, d); if (i % 4 === 3) al++; } } res.solidSwatchAgainstRgb = { bytesDiffering: n, maxDiff: mx, alphaDiffering: al, ok: mx <= 1 && al === 0 };
  const ok = Object.entries(res).every(([k, v]) => k === "solidSwatchAgainstRgb" ? v.ok : k === "behindBottom" ? v.bytesDiffering === 0 : v.topBodyBytesDiffering === 0 && !v.sleevesBytesDiffering && (listOf(cutId) !== "tank-v3" || v.sleevePx === 0));
  return { ok, trimRegions: ctx.trimRegions || null, res };
}
function phaseControl(OUT, DW) {
  const t0 = Date.now(), E = K.envC(), D = decoder(DW), cuts = RUN_CUTS.filter((c) => listOf(c) !== "tee-hip"), out = {};
  try { for (const c of cuts) { out[c] = controlCut(c, E, D); console.log(c, out[c].ok); gc(); } } finally { D.done(); }
  const ok = Object.values(out).every((x) => x.ok), name = RUN_CUTS === CUTS ? "control-tank.json" : "control-cuts.json";
  writeFileSync(join(OUT, name), JSON.stringify({ decision: RUN_CUTS === CUTS ? "D-351" : "D-352", what: "the approved designs of each cut (version) through the kit against their published files; the kit's fabric sampler on a solid swatch against TM.render's rgb path", ok, cuts: out, seconds: Math.round((Date.now() - t0) / 1000) }, null, 2) + "\n");
  console.log(JSON.stringify({ ok, cuts: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.ok])) })); if (!ok) process.exitCode = 1;
}

/** D-352 — the trim bands of each cut with seam-rule bands: per region its pixels, columns and seam depth, and overlays (the band in
 *  magenta over a plain heather render, x3) of the neck, hem and cuffs, plain beside overlaid. */
function phaseBands(OUT) {
  const E = K.envC(), V = join(OUT, "bands"), rec = {}; mkdirSync(V, { recursive: true });
  for (const cut of RUN_CUTS) { const c = K.loadCut(cut); if (c.trim.bands === "none") continue; const ctx = K.prepare(c, E), r = K.renderDesign(ctx, { rgb: PF.COLOURS.heather }), o = flat(r.layer, [255, 255, 255]);
    for (let i = 0; i < N; i++) if (ctx.bands[i]) { o[i * 4] = Math.round(o[i * 4] * 0.45 + 255 * 0.55); o[i * 4 + 1] = Math.round(o[i * 4 + 1] * 0.45); o[i * 4 + 2] = Math.round(o[i * 4 + 2] * 0.45 + 200 * 0.55); }
    const boxes = { neck: [400, 430, 624, 540], "hem left": [360, 740, 520, 830], "hem right": [504, 740, 664, 830], "cuff left": [250, 800, 420, 920], "cuff right": [604, 800, 774, 920] };
    const plain = flat(r.layer, [255, 255, 255]), t = []; for (const b of Object.values(boxes)) { t.push(crop(plain, b, 3)); t.push(crop(o, b, 3)); }
    const g = grid(t, 2, 8); writeFileSync(join(V, cut + "--bands--x3.png"), encodePng(g.w, g.h, g.px)); rec[cut] = ctx.trimRegions; gc(); }
  writeFileSync(join(OUT, "bands.json"), JSON.stringify({ decision: "D-352", regions: rec }, null, 2) + "\n"); console.log(JSON.stringify(rec));
}

function phaseRender(OUT, onlyCut) {
  const E = K.envC(), { w, base, T } = E, R = recipes(); mkdirSync(join(OUT, "units"), { recursive: true }); mkdirSync(join(OUT, "layers"), { recursive: true });
  for (const cut of RUN_CUTS.filter((c) => !onlyCut || c === onlyCut)) {
    const t0 = Date.now(), c = K.loadCut(cut), ctx = K.prepare(c, E), clear = K.printClearance(ctx), seam = K.behindBottom(ctx), prepS = (Date.now() - t0) / 1000;
    if (seam) writeFileSync(join(OUT, "layers", cut + "--behind-bottom.png"), encodePng(W, H, seam.layer));
    let contourPx = 0; for (let i = 0; i < N; i++) if (ctx.t.contour[i * 4 + 3] === 255) contourPx++;
    writeFileSync(join(OUT, "units", cut + "--prepare.json"), JSON.stringify({ cut, seconds: prepS, behindBottom: seam ? { addedPx: seam.addedPx } : null, contourPx, printBox: c.print.boxOnC }, null, 2) + "\n");
    for (const r of R) { const id = unitId(cut, r), uf = join(OUT, "units", id + ".json"), key = sha(JSON.stringify([RC.REVISION, K.FABRIC_SAMPLER, cut, c.trim, r]));
      if (existsSync(uf) && existsSync(join(OUT, "layers", id + ".png")) && json(uf).key === key) continue;
      const t1 = Date.now(), swatch = RC.swatchOf(r.fabric), design = { ...designOf(r, c), swatch }, x = K.renderDesign(ctx, design);
      let alphaDiff = 0, contourDiff = 0, sleevePx = 0; for (let i = 0; i < N; i++) { if (x.layer[i * 4 + 3] !== ctx.t.alpha[i]) alphaDiff++; if (ctx.t.contour[i * 4 + 3] === 255 && [0, 1, 2].some((k) => x.layer[i * 4 + k] !== ctx.t.contour[i * 4 + k])) contourDiff++; if (x.layers.sleeves[i * 4 + 3]) sleevePx++; }
      const fit = R1.checkItem(w, base, T, ctx.t, x.layers); let minClear = null; if (x.print) { minClear = 99; for (const i of x.print.footprint) minClear = Math.min(minClear, clear[i]); }
      const sw = RC.seamless(swatch), checks = { alphaPxDifferingFromCut: alphaDiff, contourInkPxChanged: contourDiff, fit: { ok: fit.ok, failed: fit.failed }, sleeveLayerPx: sleevePx, tankHasNoSleeves: cut !== "tank-v3" || sleevePx === 0,
        print: x.print ? { at: x.print.at, footprintPx: x.print.footprintPx, onContour: x.print.onContour, minClearancePx: minClear, safe: minClear >= PF.MARGIN && x.print.onContour === 0 } : null, swatch: { w: swatch.w, h: swatch.h, seamless: sw } };
      const ok = alphaDiff === 0 && contourDiff === 0 && fit.ok && checks.tankHasNoSleeves && (!x.print || checks.print.safe) && sw.ok;
      writeFileSync(join(OUT, "layers", id + ".png"), encodePng(W, H, x.layer));
      writeFileSync(uf, JSON.stringify({ key, id, cut, recipe: r.id, group: r.group, name: r.name, motif: r.motif || null, motifStanding: r.motif ? RC.MOTIFS[r.motif].standing : null, technical: ok ? "PASS" : "FAIL", checks, layerPixelSha256: pxSha(x.layer), seconds: (Date.now() - t1) / 1000 }, null, 2) + "\n");
      console.log(id, ok ? "PASS" : "FAIL", ((Date.now() - t1) / 1000).toFixed(1) + " s", Math.round(process.memoryUsage().rss / 1048576) + " MB"); gc(); }
    gc(); }
}

async function phaseOutfits(OUT, DW, onlyCut) {
  const AL = await import(pathToFileURL(join(ROOT, "js", "avatar-layers.js")).href), E = K.envC(), { w, base } = E, R = recipes(), D = decoder(DW), PR = representativePairs(AL), P = partners(AL, D.dec);
  mkdirSync(join(OUT, "full"), { recursive: true }); const refs = {};
  // the reuse reference: the runtime composition of an approved outfit with the pair's bottom and shoes (the cream tee's, its own list)
  const refOf = (pair) => { const k = pair.bottom + "|" + pair.shoes; if (!refs[k]) { let o = null; for (const kk of Object.keys(AL.NORTHSTAR_OUTFITS)) for (const p of [null, ...Object.keys(AL.NORTHSTAR_SOLID_PANTS)]) for (const s of [null, ...Object.keys(AL.NORTHSTAR_SHOE_CHOICES)]) { const x = !o && AL.northstarOutfitFor(kk, null, p, s); if (x && x.bottom === pair.bottom && x.shoes === pair.shoes && AL.northstarPlanFor(x)) o = x; }
      refs[k] = o ? { outfit: o, px: AL.northstarCompose(AL.northstarPlanFor(o), (src) => D.dec(src.split("/").pop()), N) } : null; } return refs[k]; };
  try { for (const cut of RUN_CUTS.filter((c) => !onlyCut || c === onlyCut)) {
      const c = K.loadCut(cut), shadow = K.cutOf(c, E).t.shadow, seamF = join(OUT, "layers", cut + "--behind-bottom.png"), seam = existsSync(seamF) ? loadPx(seamF) : new Uint8ClampedArray(N * 4);
      for (const r of R) { const id = unitId(cut, r), lf = join(OUT, "layers", id + ".png"); if (!existsSync(lf)) throw new Error(id + ": run --phase render first");
        const layerKey = pxSha(loadPx(lf)), top = { category: "top", layers: null, shadow };
        for (const [tone, pair] of Object.entries(PR)) { const oid = id + "--" + tone, uf = join(OUT, "units", oid + ".json"), key = sha(JSON.stringify([layerKey, pair, cut]));
          if (existsSync(uf) && existsSync(join(OUT, "full", oid + ".png")) && json(uf).key === key) continue;
          const t1 = Date.now(); if (!top.layers) { const { splitLayers } = await import("./northstar-longsleeve-master-v2.mjs"); top.layers = splitLayers(loadPx(lf), base, c.sleeves.layerSplitFromArmAlpha).layers; }
          const x = checkOutfitSeam(w, base, [top, P[pair.bottom], P[pair.shoes]], seam); let comp = x.proof.dressedRuntime; for (const it of [top, P[pair.bottom], P[pair.shoes]]) comp = IP.applyShadow(comp, x.proof.stack, it.shadow);
          writeFileSync(join(OUT, "full", oid + ".png"), encodePng(W, H, comp));
          const ref = refOf(pair); let feet = null; if (ref) { feet = 0; for (let i = SC.FEET_ROW * W * 4; i < N * 4; i++) if (comp[i] !== ref.px[i]) feet++; }
          writeFileSync(uf, JSON.stringify({ key, id: oid, cut, recipe: r.id, tone, pair, technical: x.ok ? "PASS" : "FAIL", failed: x.failed, enclosedPx: x.enclosedPx, hipOpen: x.hipOpen,
            reuse: { feetFromRow: SC.FEET_ROW, approvedOutfit: ref ? [ref.outfit.top, ref.outfit.bottom, ref.outfit.shoes].join("+") : null, feetBytesDiffering: feet }, seconds: (Date.now() - t1) / 1000 }, null, 2) + "\n");
          console.log(oid, x.ok ? "PASS" : "FAIL " + x.failed.join("|"), "feet " + feet, ((Date.now() - t1) / 1000).toFixed(1) + " s", Math.round(process.memoryUsage().rss / 1048576) + " MB"); x.proof = null; comp = null; gc(); }
        top.layers = null; gc(); } } }
  finally { D.done(); }
  writeFileSync(join(OUT, "pairs.json"), JSON.stringify({ decision: "D-351", pairs: PR, perCutListSizes: Object.fromEntries(Object.entries(cutPairs(AL)).map(([k, v]) => [k, v.size])) }, null, 2) + "\n");
}

function phaseViews(OUT) {
  const t0 = Date.now(), R = recipes(), V = join(OUT, "views"); mkdirSync(V, { recursive: true }); const save = (n, g) => writeFileSync(join(V, n), encodePng(g.w, g.h, g.px));
  const pic = (cut, r, tone) => loadPx(join(OUT, "full", unitId(cut, r) + "--" + tone + ".png"));
  // the comparison: per group, recipes (rows) x cuts (columns); the light outfit on light, the dark outfit on dark
  for (const g of ["fabric", "pattern", "motif"]) { const rs = R.filter((r) => r.group === g);
    for (const [tone, bg] of [["light", LIGHT], ["dark", DARK]]) { save("compare--" + g + "--figure--" + tone + ".png", grid(rs.flatMap((r) => RUN_CUTS.map((cut) => down(flat(pic(cut, r, tone), bg), 262, 768, FIG))), RUN_CUTS.length, 8)); gc(); } }
  // app sizes: all 36, rows = recipes, columns = cuts x (light, dark)
  for (const [w2, h2] of [[110, 165], [300, 450]]) { const t = []; for (const r of R) for (const cut of RUN_CUTS) for (const [tone, bg] of [["light", LIGHT], ["dark", DARK]]) t.push(down(flat(pic(cut, r, tone), bg), w2, h2));
    save("app--" + w2 + "x" + h2 + ".png", grid(t, RUN_CUTS.length * 2, 6)); gc(); }
  // close-ups x3 per recipe: the five boxes (columns) x the three cuts (rows), the light outfit on light
  for (const r of R) { const t = []; for (const cut of RUN_CUTS) { const p = flat(pic(cut, r, "light"), LIGHT); for (const b of Object.values(CLOSE)) t.push(crop(p, b, 3)); }
    save("close--" + r.id + "-" + r.slug + "--x3.png", grid(t, Object.keys(CLOSE).length, 8)); gc(); }
  // the swatches at x4 (a 96 px window of each)
  { const t = R.map((r) => { const s = RC.swatchOf(r.fabric), n = 96, px = new Uint8ClampedArray(n * 4 * n * 4 * 4); for (let y = 0; y < n * 4; y++) for (let x = 0; x < n * 4; x++) { const j = ((((y >> 2) % s.h) * s.w) + ((x >> 2) % s.w)) * 4; px.set(s.px.subarray(j, j + 4), (y * n * 4 + x) * 4); } return { w: n * 4, h: n * 4, px }; }); save("swatches--x4.png", grid(t, 6, 8)); }
  writeFileSync(join(OUT, "views.json"), JSON.stringify({ decision: RUN_CUTS === CUTS ? "D-351" : "D-352", order: { rows: R.map((r) => r.id), columns: RUN_CUTS }, close: CLOSE, seconds: Math.round((Date.now() - t0) / 1000) }, null, 2) + "\n"); console.log("views", Math.round((Date.now() - t0) / 1000) + " s");
}

function phasePage(OUT) {
  const R = recipes(), u = (f) => (existsSync(join(OUT, "units", f + ".json")) ? json(join(OUT, "units", f + ".json")) : null), V = existsSync(join(OUT, "verdicts.json")) ? json(join(OUT, "verdicts.json")) : { candidates: {} }, CAP = existsSync(join(OUT, "capacity.json")) ? json(join(OUT, "capacity.json")) : null;
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"), rows = [];
  for (const r of R) for (const cut of RUN_CUTS) { const id = unitId(cut, r), x = u(id), l = u(id + "--light"), d = u(id + "--dark"), v = V.candidates[id] || {};
    rows.push(`<tr><td>${r.id}</td><td>${esc(r.name)}</td><td>${cut}</td><td>${x ? x.technical : "–"}${x && x.checks.print ? " · tryk " + x.checks.print.minClearancePx + " px" : ""}</td><td>${l ? l.technical : "–"} / ${d ? d.technical : "–"}</td><td>${l && l.reuse.feetBytesDiffering === 0 && d && d.reuse.feetBytesDiffering === 0 ? "identiske" : "–"}</td><td><b>${esc(v.verdict || "–")}</b></td><td>${esc(v.note || "")}</td></tr>`); }
  const img = (f, alt) => `<figure><img src="views/${f}" alt="${esc(alt)}" loading="lazy"><figcaption>${esc(alt)}</figcaption></figure>`;
  const html = `<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>D-351 produktionsprøve</title>
<style>body{font:15px/1.5 system-ui,sans-serif;margin:0 auto;max-width:1400px;padding:16px;background:#f6f4ef;color:#1d1d1f}img{max-width:100%;height:auto;image-rendering:pixelated;border:1px solid #ccc;background:#fff}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border:1px solid #ccc;padding:4px 6px;text-align:left;vertical-align:top}th{background:#e8e4da}figure{margin:12px 0}h2{margin-top:32px}.warn{background:#fff3cd;padding:8px 12px;border-left:4px solid #c90}</style></head><body>
<h1>D-351 · offline produktionsprøve: 12 opskrifter × 3 snit</h1>
<p class="warn">PRIVAT — siden viser C og må ikke offentliggøres. Alle 36 er kandidater, ikke godkendte produkter. Intet er offentliggjort eller integreret.</p>
<h2>1. Kandidater og anbefaling</h2><table><tr><th>Opskrift</th><th>Navn</th><th>Snit</th><th>Lag-kontrol</th><th>Outfit lys / mørk</th><th>Fødder mod godkendt outfit</th><th>Anbefaling</th><th>Note</th></tr>${rows.join("")}</table>
<h2>2. Sammenligning (helfigur)</h2>${["fabric", "pattern", "motif"].flatMap((g) => ["light", "dark"].map((t) => img("compare--" + g + "--figure--" + t + ".png", g + " · " + t + " · rækker = opskrifter, kolonner = T-shirt, sweater, tanktop"))).join("")}
<h2>3. Appstørrelse</h2>${img("app--110x165.png", "110×165: rækker = opskrifter; kolonner = T-shirt lys/mørk, sweater lys/mørk, tanktop lys/mørk")}${img("app--300x450.png", "300×450")}
<h2>4. Nærbilleder ×3</h2>${R.map((r) => img("close--" + r.id + "-" + r.slug + "--x3.png", r.id + " " + r.name + " · kolonner: " + Object.keys(CLOSE).join(", ") + " · rækker: T-shirt, sweater, tanktop")).join("")}
${existsSync(join(OUT, "pass1-nearest", "views")) ? `<h2>4b. Før og efter kittets stofsampler (første gennemløb: nærmeste pixel; nu: bilineær)</h2>${["R05-breton-stripe", "R08-mustard-dots"].map((k) => `<figure><img src="pass1-nearest/views/close--${k}--x3.png" alt="før ${k}" loading="lazy"><figcaption>FØR · ${k}</figcaption></figure>` + img("close--" + k + "--x3.png", "EFTER · " + k)).join("")}` : ""}
<h2>5. Stofprøver ×4</h2>${img("swatches--x4.png", "R01–R12")}
<h2>6. Produktionskapacitet</h2>${CAP ? `<pre style="white-space:pre-wrap">${esc(JSON.stringify(CAP, null, 2))}</pre>` : "<p>–</p>"}
</body></html>`;
  writeFileSync(join(OUT, "index.html"), html); console.log("page written");
}

/** D-352 — the private DECISION page: every candidate with its verdict (verdicts.json, written after the visual review), the comparison
 *  sheets, app sizes and close-ups of this run, before/after of the changed edges against the previous run (--prev: D-351's out dir;
 *  the same recipe on the cut the version derives from), the plan (plan.json) and the capacity (capacity.json). Reads only written files. */
function phaseDecision(OUT, PREV) {
  if (!PREV) throw new Error("--prev <the previous run's out dir>");
  const R = recipes(), V = json(join(OUT, "verdicts.json")), PLAN = existsSync(join(OUT, "plan.json")) ? json(join(OUT, "plan.json")) : null, CAP = existsSync(join(OUT, "capacity.json")) ? json(join(OUT, "capacity.json")) : null;
  const VD = join(OUT, "views"), save = (n, g) => writeFileSync(join(VD, n), encodePng(g.w, g.h, g.px)), esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"), prevCut = (cut) => listOf(cut);
  const EDGES = { "neck": [420, 430, 604, 520], "hem left": [370, 740, 530, 830], "cuff left": [250, 800, 420, 920], "cuff right": [604, 800, 774, 920] }, before = [];
  for (const r of R.filter((x) => x.trim)) for (const cut of RUN_CUTS) { const c = K.loadCut(cut); if (c.trim.bands !== "seam-rule") continue;
    const a = flat(loadPx(join(PREV, "full", unitId(prevCut(cut), r) + "--light.png")), LIGHT), b = flat(loadPx(join(OUT, "full", unitId(cut, r) + "--light.png")), LIGHT), t = [];
    for (const [k, box] of Object.entries(EDGES)) { if (listOf(cut) === "tank-v3" && k !== "neck") continue; if (listOf(cut) === "tee-hip" && k.startsWith("cuff")) continue; t.push(crop(a, box, 3)); t.push(crop(b, box, 3)); }
    const n = "before-after--" + unitId(cut, r) + "--x3.png"; save(n, grid(t, 2, 8)); before.push([n, r, cut]); gc(); }
  const rows = []; for (const r of R) for (const cut of RUN_CUTS) { const id = unitId(cut, r), v = V.candidates[id] || {}, u = (f) => (existsSync(join(OUT, "units", f + ".json")) ? json(join(OUT, "units", f + ".json")) : null), x = u(id), l = u(id + "--light"), d = u(id + "--dark");
    rows.push(`<tr><td>${r.id}</td><td>${esc(r.name)}${r.motif === "planet" ? " <b>(motivet er endnu ikke godkendt)</b>" : ""}</td><td>${cut}</td><td>${x ? x.technical : "–"}</td><td>${l ? l.technical : "–"} / ${d ? d.technical : "–"}</td><td><b>${esc(v.verdict || "–")}</b></td><td>${esc(v.note || "")}</td></tr>`); }
  const img = (f, alt) => `<figure><img src="${f}" alt="${esc(alt)}" loading="lazy"><figcaption>${esc(alt)}</figcaption></figure>`;
  const html = `<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>D-352 beslutningsside</title>
<style>body{font:15px/1.5 system-ui,sans-serif;margin:0 auto;max-width:1400px;padding:16px;background:#f6f4ef;color:#1d1d1f}img{max-width:100%;height:auto;image-rendering:pixelated;border:1px solid #ccc;background:#fff}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border:1px solid #ccc;padding:4px 6px;text-align:left;vertical-align:top}th{background:#e8e4da}figure{margin:12px 0}h2{margin-top:32px}.warn{background:#fff3cd;padding:8px 12px;border-left:4px solid #c90}pre{white-space:pre-wrap;background:#fff;padding:8px;border:1px solid #ddd}</style></head><body>
<h1>D-352 · beslutningsside: 36 kandidater til ejerens visuelle vurdering</h1>
<p class="warn">PRIVAT — siden viser C og må ikke offentliggøres. Alle 36 er kandidater, ikke godkendte produkter. Intet er offentliggjort eller integreret. Planetmotivet (R12) er endnu ikke godkendt som tryk.</p>
<h2>1. Kandidater og anbefaling</h2><table><tr><th>Opskrift</th><th>Navn</th><th>Snit</th><th>Lag-kontrol</th><th>Outfit lys / mørk</th><th>Anbefaling</th><th>Note</th></tr>${rows.join("")}</table>
<h2>2. Før og efter: kantbehandlingen (venstre D-351, højre D-352; ×3, lys)</h2>${before.map(([f, r, cut]) => img("views/" + f, r.id + " " + r.name + " · " + cut + " · kolonner: før, efter")).join("")}
<h2>3. Sammenligning (helfigur)</h2>${["fabric", "pattern", "motif"].flatMap((g) => ["light", "dark"].map((t) => img("views/compare--" + g + "--figure--" + t + ".png", g + " · " + t + " · rækker = opskrifter, kolonner = " + RUN_CUTS.join(", ")))).join("")}
<h2>4. Appstørrelse</h2>${img("views/app--110x165.png", "110×165: rækker = opskrifter; kolonner = snit × lys/mørk")}${img("views/app--300x450.png", "300×450")}
<h2>5. Nærbilleder ×3</h2>${R.map((r) => img("views/close--" + r.id + "-" + r.slug + "--x3.png", r.id + " " + r.name + " · kolonner: " + Object.keys(CLOSE).join(", ") + " · rækker: " + RUN_CUTS.join(", "))).join("")}
<h2>6. Trim-båndene</h2>${RUN_CUTS.filter((c) => existsSync(join(OUT, "bands", c + "--bands--x3.png"))).map((c) => img("bands/" + c + "--bands--x3.png", c + " · venstre uden, højre med båndet markeret")).join("")}
<h2>7. Plan for serieproduktion</h2>${PLAN ? `<pre>${esc(JSON.stringify(PLAN, null, 2))}</pre>` : "<p>–</p>"}
<h2>8. Kapacitet</h2>${CAP ? `<pre>${esc(JSON.stringify(CAP, null, 2))}</pre>` : "<p>–</p>"}
</body></html>`;
  writeFileSync(join(OUT, "index.html"), html); console.log("decision page written", before.length + " before/after sheets");
}

async function main() {
  const args = process.argv.slice(2), at = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), phase = at("--phase"), OUT = at("--out"), DW = at("--dwebp"), r = relative(ROOT, resolve(OUT || "."));
  if (!OUT || !(r.startsWith("..") || isAbsolute(r))) throw new Error("--out must be outside the repository (the views show C)"); mkdirSync(OUT, { recursive: true });
  if (at("--recipes")) { RECIPES_REL = at("--recipes"); const f = json(join(ROOT, ...RECIPES_REL.split("/"))); if (!Array.isArray(f.cuts) || !f.cuts.every((c) => listOf(c))) throw new Error("the recipe file names its cuts"); RUN_CUTS = Object.freeze([...f.cuts]); }
  if (phase === "views") return phaseViews(OUT);
  if (phase === "bands") return phaseBands(OUT);
  if (phase === "decision") return phaseDecision(OUT, at("--prev"));
  if (phase === "page") return phasePage(OUT);
  if (phase === "render") return phaseRender(OUT, at("--cut"));
  if (!DW || !existsSync(DW)) throw new Error("--dwebp <the vendored dwebp>");
  if (phase === "control") return phaseControl(OUT, DW);
  if (phase === "outfits") return phaseOutfits(OUT, DW, at("--cut"));
  throw new Error("--phase control|bands|render|outfits|views|page|decision");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error("REFUSED: " + e.message); process.exit(1); });
