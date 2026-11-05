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
// Usage: node --expose-gc tools/avatar/northstar-top-cut-production-trial.mjs --phase control|render|outfits|views|page --out <dir> --dwebp <exe> [--cut <id>]
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
  for (const [tone, prefs] of Object.entries(PAIR_PREFERENCE)) { const hit = prefs.find(([b, s]) => CUTS.every((c) => P[c].has(b + "|" + s))); if (!hit) throw new Error("no " + tone + " pair is on all three lists"); out[tone] = { bottom: hit[0], shoes: hit[1] }; }
  return out;
}

const motifCache = {};
function motifFor(name, box) { const k = name + "|" + box.join(","); if (!motifCache[k]) motifCache[k] = PF.prepareFor(TMM.decodeRgba(RC.motifBytes(name)), [box[2], box[3]]).img; return motifCache[k]; }
function decoder(DW) { const tmp = join(tmpdir(), "d351-" + process.pid); mkdirSync(tmp, { recursive: true }); const cache = new Map();
  return { dec: (f) => { if (!cache.has(f)) { const o = join(tmp, "x.png"); execFileSync(DW, ["-quiet", join(PUB, f), "-o", o]); cache.set(f, loadPx(o)); } return cache.get(f); }, cache, done: () => rmSync(tmp, { recursive: true, force: true }) }; }
const recipes = () => RC.checkRecipes(json(join(ROOT, ...RC.RECIPES_FILE.split("/")))).recipes;
const unitId = (cut, r) => cut + "--" + r.id + "-" + r.slug;
const diffBytes = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++; return d; };

function phaseControl(OUT, DW) {
  const t0 = Date.now(), E = K.envC(), D = decoder(DW), c = K.loadCut("tank-v3"), ctx = K.prepare(c, E), A = json(join(ROOT, "tools", "avatar", "fixtures", "northstar-wardrobe", "tank", "tank-owner-approval-v1.json")), res = {};
  const DES = { "TK-HEATHER": [PF.COLOURS.heather, null], "TK-HEATHER-TEAPOT": [PF.COLOURS.heather, "teapot"], "TK-HEATHER-FOX": [PF.COLOURS.heather, "fox"], "TK-NAVY": [PF.COLOURS.navy, null], "TK-NAVY-TEAPOT": [PF.COLOURS.navy, "teapot"], "TK-NAVY-FOX": [PF.COLOURS.navy, "fox"] };
  try { for (const [id, [rgb, m]] of Object.entries(DES)) { const r = K.renderDesign(ctx, { rgb, print: m ? motifFor(m, c.print.boxOnC) : null }), f = A.designs[id].proposedRuntimeItem + "-top-body-v1.webp";
      res[id] = { file: f, topBodyBytesDiffering: diffBytes(r.layers.topBody, D.dec(f)), sleevePx: (() => { let n = 0; for (let i = 0; i < N; i++) if (r.layers.sleeves[i * 4 + 3]) n++; return n; })() }; gc(); }
    const j = K.behindBottom(ctx); res.hemJunction = { file: "top-tank-hem-junction-v1.webp", bytesDiffering: diffBytes(j.layer, D.dec("top-tank-hem-junction-v1.webp")) };
    // the kit's fabric sampler with a 1x1 solid swatch against TM.render's rgb path: the same mapping, alpha, shading and contour (only
    // floating-point rounding of the bilinear weights could differ, by at most 1)
    const a = K.renderDesign(ctx, { rgb: PF.COLOURS.navy }), b = K.renderDesign(ctx, { swatch: RC.swatchOf({ type: "solid", base: PF.COLOURS.navy }) }); let mx = 0, n = 0, al = 0;
    for (let i = 0; i < N * 4; i++) { const d = Math.abs(a.layer[i] - b.layer[i]); if (d) { n++; mx = Math.max(mx, d); if (i % 4 === 3) al++; } } res.solidSwatchAgainstRgb = { bytesDiffering: n, maxDiff: mx, alphaDiffering: al, ok: mx <= 1 && al === 0 }; }
  finally { D.done(); }
  const ok = Object.entries(res).every(([k, v]) => k === "solidSwatchAgainstRgb" ? v.ok : k === "hemJunction" ? v.bytesDiffering === 0 : v.topBodyBytesDiffering === 0 && v.sleevePx === 0);
  writeFileSync(join(OUT, "control-tank.json"), JSON.stringify({ decision: "D-351", what: "the approved tank designs (tank-v3) through the kit against their published files; the kit's fabric sampler on a solid swatch against TM.render's rgb path", ok, res, seconds: Math.round((Date.now() - t0) / 1000) }, null, 2) + "\n");
  console.log(JSON.stringify({ ok, res })); if (!ok) process.exitCode = 1;
}

function phaseRender(OUT, onlyCut) {
  const E = K.envC(), { w, base, T } = E, R = recipes(); mkdirSync(join(OUT, "units"), { recursive: true }); mkdirSync(join(OUT, "layers"), { recursive: true });
  for (const cut of CUTS.filter((c) => !onlyCut || c === onlyCut)) {
    const t0 = Date.now(), c = K.loadCut(cut), ctx = K.prepare(c, E), clear = K.printClearance(ctx), seam = K.behindBottom(ctx), prepS = (Date.now() - t0) / 1000;
    if (seam) writeFileSync(join(OUT, "layers", cut + "--behind-bottom.png"), encodePng(W, H, seam.layer));
    let contourPx = 0; for (let i = 0; i < N; i++) if (ctx.t.contour[i * 4 + 3] === 255) contourPx++;
    writeFileSync(join(OUT, "units", cut + "--prepare.json"), JSON.stringify({ cut, seconds: prepS, behindBottom: seam ? { addedPx: seam.addedPx } : null, contourPx, printBox: c.print.boxOnC }, null, 2) + "\n");
    for (const r of R) { const id = unitId(cut, r), uf = join(OUT, "units", id + ".json"), key = sha(JSON.stringify([RC.REVISION, K.FABRIC_SAMPLER, cut, r]));
      if (existsSync(uf) && existsSync(join(OUT, "layers", id + ".png")) && json(uf).key === key) continue;
      const t1 = Date.now(), swatch = RC.swatchOf(r.fabric), design = { swatch, print: r.motif ? motifFor(r.motif, c.print.boxOnC) : null }, x = K.renderDesign(ctx, design);
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
  try { for (const cut of CUTS.filter((c) => !onlyCut || c === onlyCut)) {
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
    for (const [tone, bg] of [["light", LIGHT], ["dark", DARK]]) { save("compare--" + g + "--figure--" + tone + ".png", grid(rs.flatMap((r) => CUTS.map((cut) => down(flat(pic(cut, r, tone), bg), 262, 768, FIG))), CUTS.length * 1, 8)); gc(); } }
  // app sizes: all 36, rows = recipes, columns = cuts x (light, dark)
  for (const [w2, h2] of [[110, 165], [300, 450]]) { const t = []; for (const r of R) for (const cut of CUTS) for (const [tone, bg] of [["light", LIGHT], ["dark", DARK]]) t.push(down(flat(pic(cut, r, tone), bg), w2, h2));
    save("app--" + w2 + "x" + h2 + ".png", grid(t, CUTS.length * 2, 6)); gc(); }
  // close-ups x3 per recipe: the five boxes (columns) x the three cuts (rows), the light outfit on light
  for (const r of R) { const t = []; for (const cut of CUTS) { const p = flat(pic(cut, r, "light"), LIGHT); for (const b of Object.values(CLOSE)) t.push(crop(p, b, 3)); }
    save("close--" + r.id + "-" + r.slug + "--x3.png", grid(t, Object.keys(CLOSE).length, 8)); gc(); }
  // the swatches at x4 (a 96 px window of each)
  { const t = R.map((r) => { const s = RC.swatchOf(r.fabric), n = 96, px = new Uint8ClampedArray(n * 4 * n * 4 * 4); for (let y = 0; y < n * 4; y++) for (let x = 0; x < n * 4; x++) { const j = ((((y >> 2) % s.h) * s.w) + ((x >> 2) % s.w)) * 4; px.set(s.px.subarray(j, j + 4), (y * n * 4 + x) * 4); } return { w: n * 4, h: n * 4, px }; }); save("swatches--x4.png", grid(t, 6, 8)); }
  writeFileSync(join(OUT, "views.json"), JSON.stringify({ decision: "D-351", order: { rows: R.map((r) => r.id), columns: CUTS }, close: CLOSE, seconds: Math.round((Date.now() - t0) / 1000) }, null, 2) + "\n"); console.log("views", Math.round((Date.now() - t0) / 1000) + " s");
}

function phasePage(OUT) {
  const R = recipes(), u = (f) => (existsSync(join(OUT, "units", f + ".json")) ? json(join(OUT, "units", f + ".json")) : null), V = existsSync(join(OUT, "verdicts.json")) ? json(join(OUT, "verdicts.json")) : { candidates: {} }, CAP = existsSync(join(OUT, "capacity.json")) ? json(join(OUT, "capacity.json")) : null;
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"), rows = [];
  for (const r of R) for (const cut of CUTS) { const id = unitId(cut, r), x = u(id), l = u(id + "--light"), d = u(id + "--dark"), v = V.candidates[id] || {};
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

async function main() {
  const args = process.argv.slice(2), at = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), phase = at("--phase"), OUT = at("--out"), DW = at("--dwebp"), r = relative(ROOT, resolve(OUT || "."));
  if (!OUT || !(r.startsWith("..") || isAbsolute(r))) throw new Error("--out must be outside the repository (the views show C)"); mkdirSync(OUT, { recursive: true });
  if (phase === "views") return phaseViews(OUT);
  if (phase === "page") return phasePage(OUT);
  if (phase === "render") return phaseRender(OUT, at("--cut"));
  if (!DW || !existsSync(DW)) throw new Error("--dwebp <the vendored dwebp>");
  if (phase === "control") return phaseControl(OUT, DW);
  if (phase === "outfits") return phaseOutfits(OUT, DW, at("--cut"));
  throw new Error("--phase control|render|outfits|views|page");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error("REFUSED: " + e.message); process.exit(1); });
