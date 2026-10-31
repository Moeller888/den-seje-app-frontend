// D-276/D-279 — the pants master study on C (offline; no image call): the trousers-square cut, its master (--master v1: D-276's;
// v2: D-279's waistband and outer-edge rules), the original and four SYNTHETIC materials (two solids, a stripe along the leg, a check)
// through the same master; for v1 also the two CONTROLS of D-276's double-contour investigation. Then:
//   geometry  — every variant's alpha equals the cut's; the outfit check (R1.checkOutfit) of every top x shoe combination of the
//               controlled items, against the original trousers (K17 and K18 are the documented outfits; the rest are geometry only);
//   mapping   — no jump inside a panel, none where C's arms or hands cross the legs, no mirrored leg (mappingChecks);
//   shading   — the fold strokes kept: the contrast of the fold pixels against the plain fabric, per variant;
//   views     — whole outfits, close-ups (waistband, crotch, inner seams/knees, both hems at the shoes, the hem at the laced boot), the
//               waistband ISOLATED (the pants layer alone) and in the outfit under a ghosted top (a private diagnostic: the tops cover
//               it), the app sizes 110x165 and 52x78 — each on a light and on a dark background;
//   compare   — with --before <a v1 study dir> the sheets phase also writes before/after sheets and a private comparison page.
// MEMORY: three phases, each its own process; within a phase one variant and one combination at a time, every result written at once,
// the large buffers dropped (collected with --expose-gc), the resident size logged per unit:
//   --phase layers   the master and each variant's pants layer (lossless PNG), the isolated waistband views, the mapping checks
//   --phase outfits  per variant x combination: the outfit check and, for the sheet combinations, the small crops (PNG)
//   --phase sheets   the sheets, record.json (and the comparison), from the saved files only (no C, no composite)
// A unit is reused only when its saved key (the sha256 of this tool, the master module, the master version and the unit's inputs) matches.
// The views show C: --out must be outside the repository. Nothing here approves an item; the visual review is never automatic.
// Usage: node --expose-gc tools/avatar/northstar-pants-master-study.mjs --out <dir outside the repo> --master v1|v2 --phase layers|outfits|sheets [--before <dir>]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng, decodePng } from "./r3-hair-tool-v2.mjs";
import * as WR from "./northstar-wardrobe.mjs";
import * as BF from "./northstar-base-figure.mjs";
import * as BC from "./northstar-base-figure-c.mjs";
import * as IP from "./northstar-item-pilot.mjs";
import * as R1 from "./northstar-r1-garment.mjs";
import * as EV from "./northstar-r1-evaluate.mjs";
import * as PM from "./northstar-pants-master.mjs";
import { loadItems } from "./build-northstar-runtime-assets.mjs";
import { flat, crop, grid, down } from "./northstar-wardrobe-poc.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", ".."), { W, N } = WR;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const TOPS = ["top-tee-hip-blue", "top-tee-hip-cream"], SHOES = ["shoes-sneakers-white", "shoes-ankleboots-brown", "shoes-sneakers-beige", "shoes-boots-laceup-black"];
export const DOCUMENTED = Object.freeze({ K17: ["top-tee-hip-blue", "shoes-sneakers-white"], K18: ["top-tee-hip-blue", "shoes-ankleboots-brown"] });
export const CLOSE = Object.freeze({ waistband: [400, 740, 624, 830], crotch: [440, 830, 584, 990], "inner seams / knees": [430, 1040, 594, 1240], "hem at the shoes": [360, 1300, 664, 1520] });
export const WAIST = Object.freeze([370, 730, 654, 860]);
export const SHEET_COMBOS = Object.freeze([["K17", "top-tee-hip-blue", "shoes-sneakers-white"], ["K18", "top-tee-hip-blue", "shoes-ankleboots-brown"], ["geometry only", "top-tee-hip-cream", "shoes-sneakers-beige"], ["geometry only", "top-tee-hip-cream", "shoes-boots-laceup-black"]]);
export const BGS = Object.freeze({ light: [236, 233, 226], dark: [24, 26, 40] });
const FIG = [250, 0, 774, 1536];
const slug = (s) => s.split(" (")[0].replace(/[^a-z0-9]+/gi, "-").toLowerCase();
const rss = () => Math.round(process.memoryUsage().rss / 1048576), gc = () => { if (typeof globalThis.gc === "function") globalThis.gc(); };
const specOf = (v) => { if (v === "v1") return PM.SPEC; if (v === "v2") return PM.SPEC_V2; throw new Error("--master v1|v2"); };

function outDir(OUT) { const r = relative(ROOT, resolve(OUT || ".")); if (!OUT || !(r.startsWith("..") || isAbsolute(r))) throw new Error("--out must be outside the repository (the sheets show C)"); mkdirSync(OUT, { recursive: true }); return OUT; }
const codeKey = (v) => sha(Buffer.concat([readFileSync(fileURLToPath(import.meta.url)), readFileSync(join(ROOT, "tools", "avatar", "northstar-pants-master.mjs")), Buffer.from(v)]));
const savePng = (f, im) => writeFileSync(f, encodePng(im.w, im.h, im.px)), loadPng = (f) => { const d = decodePng(readFileSync(f)); return { w: d.header.w, h: d.header.h, px: Uint8ClampedArray.from(d.px) }; };
function env() { const w = WR.buildWardrobe(), base = BC.prepareBase(w, Uint8ClampedArray.from(decodePng(IP.readC()).px)), T = BC.templatesC(w, base, { revision: "d213" }); return { w, base, T }; }
const itemsSpec = () => JSON.parse(readFileSync(join(ROOT, "tools", "avatar", "fixtures", "northstar-wardrobe", "runtime-assets-inputs-d242.json"), "utf8")).items;
const nearest = (im, k) => { const o = new Uint8ClampedArray(im.w * k * im.h * k * 4); for (let y = 0; y < im.h * k; y++) for (let x = 0; x < im.w * k; x++) o.set(im.px.subarray((((y / k) | 0) * im.w + ((x / k) | 0)) * 4, (((y / k) | 0) * im.w + ((x / k) | 0)) * 4 + 4), (y * im.w * k + x) * 4); return { w: im.w * k, h: im.h * k, px: o }; };

/** Phase 1: the master and the variants' pants layers (lossless PNG), the isolated waistband views, the mapping checks. */
function phaseLayers(OUT, version) {
  const mem = [["start", rss()]], E = env(); mem.push(["env", rss()]);
  const spec = specOf(version), { t, src } = EV.templateOf(E, "bottom"), t0 = Date.now(), master = PM.buildPantsMaster(t, src, spec), buildMs = Date.now() - t0; mem.push(["master", rss()]);
  const items = itemsSpec(), { P } = loadItems({ [PM.SPEC.source]: items[PM.SPEC.source] }), same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  const runtimeSame = same(P[PM.SPEC.source].layers.pants, src.layers.pants) && same(P[PM.SPEC.source].shadow, src.shadow);
  mkdirSync(join(OUT, "layers"), { recursive: true }); mkdirSync(join(OUT, "crops"), { recursive: true });
  const plainOf = (L) => { const c = [[], [], []]; for (let i = 0; i < N; i++) if (master.panel[i] > 0 && !t.contour[i * 4 + 3] && master.ratio[i] >= 0.97 && master.ratio[i] <= 1.03) for (let k = 0; k < 3; k++) c[k].push(L[i * 4 + k]); return c.map((a) => a.sort((x, y) => x - y)[a.length >> 1]); };
  const olive = plainOf(src.layers.pants), mats = PM.materials(), sand = mats["solid sand (SYNTHETIC)"];
  const variants = [["original (olive, the item itself)", () => src.layers.pants], ...Object.entries(mats).map(([n, m]) => [n, () => PM.renderPants(master, t, E.base, { body: m }).layer])];
  if (version === "v1") variants.push(["CONTROL master olive (the master in the original's own colour)", () => PM.renderPants(master, t, E.base, { body: olive }).layer],
    // the original's own pixels recoloured to sand WITHOUT the master: its own luminance against its plain fabric, its own contour kept
    ["CONTROL recoloured sand (the original recoloured without the master)", () => { const L = Uint8ClampedArray.from(src.layers.pants), o = 0.299 * olive[0] + 0.587 * olive[1] + 0.114 * olive[2];
      for (let i = 0; i < N; i++) { if (!L[i * 4 + 3] || t.contour[i * 4 + 3]) continue; const f = (0.299 * L[i * 4] + 0.587 * L[i * 4 + 1] + 0.114 * L[i * 4 + 2]) / o; for (let k = 0; k < 3; k++) L[i * 4 + k] = Math.min(255, Math.round(sand[k] * f)); } return L; }]);
  const a0 = src.layers.pants, layers = {};
  for (const [name, make] of variants) { let L = make(); let alphaEquals = true; for (let i = 0; i < N; i++) if (L[i * 4 + 3] !== a0[i * 4 + 3]) { alphaEquals = false; break; }
    const lum = (i) => 0.299 * L[i * 4] + 0.587 * L[i * 4 + 1] + 0.114 * L[i * 4 + 2]; let f = 0, nf = 0, p = 0, np = 0;
    for (let i = 0; i < N; i++) { if (master.panel[i] < 1 || t.contour[i * 4 + 3]) continue; const r = master.ratio[i]; if (r < 0.85) { f += lum(i); nf++; } else if (r >= 0.97 && r <= 1.03) { p += lum(i); np++; } }
    const file = slug(name) + ".png", png = encodePng(W, N / W, L); writeFileSync(join(OUT, "layers", file), png);
    for (const [bn, bg] of Object.entries(BGS)) savePng(join(OUT, "crops", "waist-isolated--" + slug(name) + "--" + bn + ".png"), crop(flat(L, bg), WAIST, 3));
    layers[name] = { file, sha256: sha(png), alphaEqualsCut: alphaEquals, foldContrast: +((f / nf) / (p / np)).toFixed(3), control: name.startsWith("CONTROL") };
    L = null; gc(); mem.push(["layer " + slug(name), rss()]); }
  const mc = PM.mappingChecks(master, t, E.base.arms), g = { top: (() => { let y0 = 1e9; for (let i = 0; i < N; i++) if (t.core[i]) { y0 = (i / W) | 0; break; } return y0; })() };
  let waistOutside = 0; for (let i = 0; i < N; i++) if (master.panel[i] === 0 && ((i / W) | 0) > g.top + 40 + spec.waistBand) waistOutside++;
  const out = { key: codeKey(version), master: version, revision: master.revision, buildMs, runtimeTrousersIdenticalToCut: runtimeSame, sizes: master.sizes, waistbandOutsideTheWaist: waistOutside, outerEdgePx: master.edge ? master.edge.idx.length : 0,
    axes: master.axes.map((a) => ({ angleDeg: +(a.angle * 180 / Math.PI).toFixed(2), origin: a.origin })), base: +master.base.toFixed(1), seamPx: master.seam.length, oliveRgb: olive, mapping: mc, layers, memory: mem };
  const pv = new Uint8ClampedArray(N * 4), col = [[200, 200, 80], [90, 160, 220], [230, 120, 100]]; for (let i = 0; i < N; i++) { const pn = master.panel[i]; if (pn >= 0) pv.set([...col[pn], 255], i * 4); } for (const [x, y] of master.seam) pv.set([0, 0, 0, 255], (y * W + x) * 4);
  savePng(join(OUT, "pm-panels.png"), crop(flat(pv, BGS.light), [360, 720, 664, 1400], 1));
  writeFileSync(join(OUT, "layers.json"), JSON.stringify(out, null, 2) + "\n"); mem.push(["end", rss()]);
  console.log(JSON.stringify({ phase: "layers", master: version, runtimeSame, waistOutside, outerEdgePx: out.outerEdgePx, mapping: mc, layers: Object.fromEntries(Object.entries(layers).map(([k, v]) => [slug(k), [v.alphaEqualsCut, v.foldContrast]])), peakMB: Math.max(...mem.map((m) => m[1])) }));
}

const uidOf = (n, top, sh) => slug(n) + "--" + top.replace("top-tee-hip-", "tee-") + "--" + sh.replace("shoes-", "");

/** Phase 2: per variant x combination, one at a time: the outfit check and the small crops (light and dark). */
function phaseOutfits(OUT, version) {
  const L0 = JSON.parse(readFileSync(join(OUT, "layers.json"), "utf8")); if (L0.key !== codeKey(version)) throw new Error("layers.json is from other code or another master: run --phase layers again");
  const mem = [["start", rss()]], E = env(), { w, base } = E, items = itemsSpec(), { P } = loadItems(Object.fromEntries([...TOPS, ...SHOES, PM.SPEC.source].map((id) => [id, items[id]])));
  const shadow = P[PM.SPEC.source].shadow, min = BF.minimumItems(base.R, base.sep.lab); mem.push(["env + items", rss()]);
  mkdirSync(join(OUT, "units"), { recursive: true }); mkdirSync(join(OUT, "crops"), { recursive: true });
  const composite = (top, pants, shoes, topAlpha = 1) => { const closed = P[shoes].covering === "closed-footwear", tl = topAlpha === 1 ? P[top].layers : Object.fromEntries(Object.entries(P[top].layers).map(([k, L]) => { const o = Uint8ClampedArray.from(L); for (let i = 3; i < o.length; i += 4) o[i] = Math.round(o[i] * topAlpha); return [k, o]; }));
    const pr = BF.layerProof(w, base.R, base.Z, Object.assign({}, min, tl, { pants }, P[shoes].layers), { sep: base.sep, headSeam: "d201", hide: closed ? BC.closedFootwearHidden(base, P[shoes].layers.shoes) : null, enclosure: "c-exterior" });
    let comp = pr.dressedRuntime; for (const sh of [P[top].shadow, shadow, P[shoes].shadow]) if (sh) comp = IP.applyShadow(comp, pr.stack, sh); return comp; };
  let done = 0, reused = 0;
  for (const [name, v] of Object.entries(L0.layers)) for (const top of TOPS) for (const sh of SHOES) {
    const id = uidOf(name, top, sh), f = join(OUT, "units", id + ".json"), key = sha(L0.key + v.sha256 + top + sh);
    if (existsSync(f) && JSON.parse(readFileSync(f, "utf8")).key === key) { reused++; continue; }
    let pants = loadPng(join(OUT, "layers", v.file)).px; if (sha(encodePng(W, N / W, pants)) !== v.sha256) throw new Error(v.file + " changed");
    let r = R1.checkOutfit(w, base, [P[top], { category: "bottom", layers: { pants }, covering: "none", shadow }, P[sh]]);
    const unit = { key, variant: name, top, shoes: sh, ok: r.ok, failed: r.failed, crops: [] }; r = null; gc();
    const combo = SHEET_COMBOS.find(([, t2, s2]) => t2 === top && s2 === sh), put = (tag, im) => { const file = id + "--" + tag + ".png"; savePng(join(OUT, "crops", file), im); unit.crops.push(file); };
    if (combo && (!v.control || sh === "shoes-boots-laceup-black" || combo[0] === "K18")) {
      let c = composite(top, pants, sh);
      for (const [bn, bg] of Object.entries(BGS)) { const fl = flat(c, bg);
        put("whole--" + bn, down(fl, 262, 768, FIG)); if (combo[0].startsWith("K")) { put("app110--" + bn, down(fl, 110, 165)); put("app52--" + bn, down(fl, 52, 78)); }
        if (combo[0] === "K18") for (const [tag, box] of Object.entries(CLOSE)) put("close-" + slug(tag) + "--" + bn, crop(fl, box, 2));
        if (sh === "shoes-boots-laceup-black") put("close-hem-at-the-laced-boot--" + bn, crop(fl, CLOSE["hem at the shoes"], 2)); }
      c = null; gc();
      if (combo[0] === "K18") { let gh = composite(top, pants, sh, 0.35); for (const [bn, bg] of Object.entries(BGS)) put("waist-ghost--" + bn, crop(flat(gh, bg), WAIST, 3)); gh = null; } }
    pants = null; gc(); unit.rssMB = rss(); mem.push([id, unit.rssMB]);
    writeFileSync(f, JSON.stringify(unit, null, 2) + "\n"); done++; }
  writeFileSync(join(OUT, "memory-outfits.json"), JSON.stringify(mem, null, 2) + "\n");
  console.log(JSON.stringify({ phase: "outfits", master: version, units: done, reused, peakMB: Math.max(...mem.map((m) => m[1])) }));
}

/** Phase 3: the sheets and the record (and with --before, the before/after comparison), from the saved files only. */
function phaseSheets(OUT, version, BEFORE) {
  const L0 = JSON.parse(readFileSync(join(OUT, "layers.json"), "utf8")), units = {};
  for (const [name, v] of Object.entries(L0.layers)) for (const top of TOPS) for (const sh of SHOES) { const id = uidOf(name, top, sh), f = join(OUT, "units", id + ".json");
    if (!existsSync(f)) throw new Error("missing unit " + id + ": run --phase outfits"); const u = JSON.parse(readFileSync(f, "utf8")); if (u.key !== sha(L0.key + v.sha256 + top + sh)) throw new Error("stale unit " + id); units[id] = u; }
  const C = (dir, f) => loadPng(join(dir, "crops", f)), names = Object.keys(L0.layers), main = names.filter((n) => !L0.layers[n].control), ctl = names.filter((n) => L0.layers[n].control);
  for (const bn of Object.keys(BGS)) {
    const whole = [], closes = [], apps = [], waist = [];
    for (const n of main) { for (const [, top, sh] of SHEET_COMBOS) whole.push(C(OUT, uidOf(n, top, sh) + "--whole--" + bn + ".png"));
      const k18 = uidOf(n, ...DOCUMENTED.K18); for (const tag of Object.keys(CLOSE)) closes.push(C(OUT, k18 + "--close-" + slug(tag) + "--" + bn + ".png")); closes.push(C(OUT, uidOf(n, "top-tee-hip-cream", "shoes-boots-laceup-black") + "--close-hem-at-the-laced-boot--" + bn + ".png"));
      for (const k of ["K17", "K18"]) { const u = uidOf(n, ...DOCUMENTED[k]); apps.push(C(OUT, u + "--app110--" + bn + ".png"), C(OUT, u + "--app52--" + bn + ".png")); }
      waist.push(C(OUT, "waist-isolated--" + slug(n) + "--" + bn + ".png"), C(OUT, k18 + "--waist-ghost--" + bn + ".png")); }
    savePng(join(OUT, "pm-outfits--" + bn + ".png"), grid(whole, SHEET_COMBOS.length, 8)); savePng(join(OUT, "pm-closeups-x2--" + bn + ".png"), grid(closes, Object.keys(CLOSE).length + 1, 8));
    savePng(join(OUT, "pm-app-actual--" + bn + ".png"), grid(apps, 4, 6)); savePng(join(OUT, "pm-app-x3--" + bn + ".png"), grid(apps.map((im) => nearest(im, 3)), 4, 8)); savePng(join(OUT, "pm-waistband-x3--" + bn + ".png"), grid(waist, 2, 8));
    savePng(join(OUT, "pm-laced-boot-hem-x2--" + bn + ".png"), grid(names.map((n) => C(OUT, uidOf(n, "top-tee-hip-cream", "shoes-boots-laceup-black") + "--close-hem-at-the-laced-boot--" + bn + ".png")), 4, 8)); }
  const per = (n, U) => Object.fromEntries(TOPS.flatMap((top) => SHOES.map((sh) => { const u = U[uidOf(n, top, sh)]; return [top + "+" + sh, { ok: u.ok, failed: u.failed }]; })));
  const ref = per(names[0], units), record = { decision: version === "v2" ? "D-279" : "D-276", ...L0, documentedOutfits: DOCUMENTED, variants: {} }; delete record.layers; delete record.key;
  for (const n of names) { const p = per(n, units); record.variants[n] = { ...L0.layers[n], outfitChecks: p, outfitChecksAsOriginal: Object.keys(ref).every((k) => ref[k].ok === p[k].ok && ref[k].failed.join() === p[k].failed.join()) }; }
  record.memory = { layers: L0.memory, outfits: JSON.parse(readFileSync(join(OUT, "memory-outfits.json"), "utf8")) };
  if (BEFORE) {   // before/after: the same views, v1 (the before dir) beside this master, each pair on light and dark
    const B0 = JSON.parse(readFileSync(join(BEFORE, "layers.json"), "utf8")), pages = [], beforeChecks = {};
    for (const n of main) { if (!B0.layers[n]) throw new Error("the before study has no " + n); const bu = {}; for (const top of TOPS) for (const sh of SHOES) bu[uidOf(n, top, sh)] = JSON.parse(readFileSync(join(BEFORE, "units", uidOf(n, top, sh) + ".json"), "utf8")); beforeChecks[n] = per(n, bu); }
    record.before = { master: B0.master, revision: B0.revision, outfitChecks: beforeChecks, waistbandOutsideTheWaist: B0.waistbandOutsideTheWaist };
    for (const bn of Object.keys(BGS)) { const pairs = []; for (const n of main) { const k18 = uidOf(n, ...DOCUMENTED.K18), lb = uidOf(n, "top-tee-hip-cream", "shoes-boots-laceup-black");
        for (const f of ["waist-isolated--" + slug(n) + "--" + bn + ".png", k18 + "--waist-ghost--" + bn + ".png", k18 + "--close-hem-at-the-shoes--" + bn + ".png", lb + "--close-hem-at-the-laced-boot--" + bn + ".png"]) pairs.push(C(BEFORE, f), C(OUT, f)); }
      savePng(join(OUT, "pm-before-after--" + bn + ".png"), grid(pairs, 8, 8)); pages.push(bn); }
    writeFileSync(join(OUT, "index.html"), comparePage(record, main)); }
  record.sheets = { "pm-outfits--{light,dark}.png": "rows: " + main.join(" | ") + "; columns: K17, K18, cream tee + sneakers-beige (geometry only), cream tee + boots-laceup-black (geometry only); 0.5x",
    "pm-closeups-x2--{light,dark}.png": "rows: the same; columns: " + Object.keys(CLOSE).join(", ") + " (K18), hem at the laced boot (cream tee + boots-laceup-black, geometry only); 2x",
    "pm-waistband-x3--{light,dark}.png": "rows: the same; the waistband isolated (the pants layer alone) | in K18 under a ghosted top (35 %, a private diagnostic); 3x",
    "pm-app-actual--{light,dark}.png": "rows: the same; K17 110x165, K17 52x78, K18 110x165, K18 52x78 at ACTUAL size", "pm-app-x3--{light,dark}.png": "as pm-app-actual, 3x nearest",
    "pm-laced-boot-hem-x2--{light,dark}.png": "the hem at the laced boot: " + names.join(" | "), "pm-before-after--{light,dark}.png": "with --before: rows: variants; per row pairs before|after of: waistband isolated, waistband under a ghosted top, both hems (K18), hem at the laced boot",
    "pm-panels.png": "the panels (waistband yellow, left leg blue, right leg red) and the centre seam" };
  record.approved = "nothing"; record.visualIsNeverAutomatic = true;
  writeFileSync(join(OUT, "record.json"), JSON.stringify(record, null, 2) + "\n");
  console.log(JSON.stringify({ phase: "sheets", master: version, variants: Object.fromEntries(Object.entries(record.variants).map(([k, v]) => [slug(k), { alpha: v.alphaEqualsCut, asOriginal: v.outfitChecksAsOriginal, fold: v.foldContrast, failed: Object.entries(v.outfitChecks).filter(([, c]) => !c.ok).map(([o, c]) => o.replace(/top-tee-hip-|shoes-/g, "") + ":" + c.failed.join("|")) }])) }));
}

/** The private comparison page (local file; no network; it shows C). */
function comparePage(record, main) {
  const fails = (c) => Object.entries(c).filter(([, x]) => !x.ok).map(([o, x]) => o.replace(/top-tee-hip-|shoes-/g, "") + ": " + x.failed.join(", ")).join("; ") || "ingen";
  const rows = main.map((n) => `<tr><td>${n}</td><td>${fails(record.before.outfitChecks[n])}</td><td>${fails(record.variants[n].outfitChecks)}</td></tr>`).join("");
  const img = (f, cap) => `<figure><img src="${f}" alt="${cap}"><figcaption>${cap}</figcaption></figure>`;
  return `<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Buksemaster v2 — før/efter</title>
<style>:root{--bg:#f4f2ee;--fg:#1d1d1f;--mut:#5b5b60;--card:#fff;--line:#d9d5cc}@media (prefers-color-scheme:dark){:root{--bg:#18181a;--fg:#eee;--mut:#a5a5ab;--card:#232326;--line:#3a3a3e}}
body{margin:0;padding:16px;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif}h1{font-size:20px}h2{font-size:16px;margin-top:22px}p,li{max-width:72em}figure{margin:8px 0}figure img{max-width:100%;height:auto;border:1px solid var(--line)}figcaption{color:var(--mut);font-size:12px}
table{border-collapse:collapse}td,th{border:1px solid var(--line);padding:4px 8px;text-align:left;vertical-align:top;font-size:13px}.note{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px;max-width:72em}</style></head><body>
<h1>Buksemaster v2 (D-279) — før/efter, privat</h1>
<p class="note">Privat og lokal; viser C og må ikke offentliggøres. Intet er godkendt. Før = pants-master-v1 (D-276), efter = pants-master-v2 (D-279): linningen kun under snittets overkant, og snittets yderkant i stregens farve (kun farve; alfa og geometri uændret). Mønstermappingen er uændret: striberne ligger fortsat fladt, og ternene har fortsat små trin.</p>
<h2>Outfitkontrol (2 toppe × 4 sko) — fejl før og efter</h2><table><tr><th>Variant</th><th>Før (v1)</th><th>Efter (v2)</th></tr>${rows}</table>
<h2>Før | efter — linning isoleret, linning under gennemsigtig top, begge benafslutninger, benafslutning ved snørestøvle</h2>
${img("pm-before-after--light.png", "Lys baggrund: hver række én variant (original, navy, sand, striber, tern); par før|efter")}${img("pm-before-after--dark.png", "Mørk baggrund: samme")}
<h2>Efter (v2): hele outfits</h2>${img("pm-outfits--light.png", "K17, K18, creme+sneakers beige, creme+snørestøvler — lys")}${img("pm-outfits--dark.png", "Samme — mørk")}
<h2>Efter (v2): nærbilleder</h2>${img("pm-closeups-x2--light.png", "Linning, skridt, indersømme/knæ, benafslutninger (K18), benafslutning ved snørestøvle — lys")}${img("pm-closeups-x2--dark.png", "Samme — mørk")}
<h2>Efter (v2): linning</h2>${img("pm-waistband-x3--light.png", "Isoleret | under gennemsigtig top (diagnose) — lys")}${img("pm-waistband-x3--dark.png", "Samme — mørk")}
<h2>Efter (v2): appstørrelser</h2>${img("pm-app-x3--light.png", "K17 og K18 ved 110×165 og 52×78 (3× forstørret) — lys")}${img("pm-app-x3--dark.png", "Samme — mørk")}${img("pm-app-actual--light.png", "Faktisk størrelse — lys")}
</body></html>
`;
}

function main() {
  const args = process.argv.slice(2), at = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), OUT = outDir(at("--out")), phase = at("--phase"), version = at("--master") || "v1";
  specOf(version);
  if (phase === "layers") return phaseLayers(OUT, version); if (phase === "outfits") return phaseOutfits(OUT, version); if (phase === "sheets") return phaseSheets(OUT, version, at("--before"));
  throw new Error("--phase layers|outfits|sheets");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { try { main(); } catch (e) { console.error("REFUSED: " + e.message); process.exit(1); } }
