// D-276 — the pants master study on C (offline; no image call): the trousers-square cut, its master, the original and four SYNTHETIC
// materials (two solids, a stripe along the leg, a check) through the same master, plus two CONTROLS for the double contour at the
// laced boot (the master in the original's own olive; the original item recoloured to sand WITHOUT the master). Then:
//   geometry  — every variant's alpha equals the cut's; the outfit check (R1.checkOutfit) of every top x shoe combination of the
//               controlled items, against the original trousers (K17 and K18 are the documented outfits; the rest are geometry only);
//   mapping   — no jump inside a panel, none where C's arms or hands cross the legs, no mirrored leg (mappingChecks);
//   shading   — the fold strokes kept: the contrast of the fold pixels against the plain fabric, per variant;
//   sheets    — whole outfits, close-ups (waistband, crotch, inner seams/knees, hem at the shoes, hem at the laced boot) and the app
//               sizes 110x165 and 52x78.
// MEMORY: three phases, each its own process, so nothing is held across them; within a phase one variant and one combination at a time,
// every result written at once, the large buffers dropped (and collected with --expose-gc), the resident size logged per unit:
//   --phase layers   the master and each variant's pants layer (lossless PNG) and the mapping checks
//   --phase outfits  per variant x combination: the outfit check and, for the sheet combinations, the small crops (PNG)
//   --phase sheets   the sheets and record.json, from the saved files only (no C, no composite)
// A unit is reused only when its saved key (the sha256 of this tool, the master module and the unit's inputs) matches.
// The sheets show C: --out must be outside the repository. Nothing here approves an item; the visual review is never automatic.
// Usage: node --expose-gc tools/avatar/northstar-pants-master-study.mjs --out <dir outside the repo> --phase layers|outfits|sheets
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
export const SHEET_COMBOS = Object.freeze([["K17", "top-tee-hip-blue", "shoes-sneakers-white"], ["K18", "top-tee-hip-blue", "shoes-ankleboots-brown"], ["geometry only", "top-tee-hip-cream", "shoes-sneakers-beige"], ["geometry only", "top-tee-hip-cream", "shoes-boots-laceup-black"]]);
const FIG = [250, 0, 774, 1536], BG = [236, 233, 226];
const slug = (s) => s.split(" (")[0].replace(/[^a-z0-9]+/gi, "-").toLowerCase();
const rss = () => Math.round(process.memoryUsage().rss / 1048576), gc = () => { if (typeof globalThis.gc === "function") globalThis.gc(); };

function outDir(OUT) { const r = relative(ROOT, resolve(OUT || ".")); if (!OUT || !(r.startsWith("..") || isAbsolute(r))) throw new Error("--out must be outside the repository (the sheets show C)"); mkdirSync(OUT, { recursive: true }); return OUT; }
const codeKey = () => sha(Buffer.concat([readFileSync(fileURLToPath(import.meta.url)), readFileSync(join(ROOT, "tools", "avatar", "northstar-pants-master.mjs"))]));
const savePng = (f, im) => writeFileSync(f, encodePng(im.w, im.h, im.px)), loadPng = (f) => { const d = decodePng(readFileSync(f)); return { w: d.header.w, h: d.header.h, px: Uint8ClampedArray.from(d.px) }; };
function env() { const w = WR.buildWardrobe(), base = BC.prepareBase(w, Uint8ClampedArray.from(decodePng(IP.readC()).px)), T = BC.templatesC(w, base, { revision: "d213" }); return { w, base, T }; }
const itemsSpec = () => JSON.parse(readFileSync(join(ROOT, "tools", "avatar", "fixtures", "northstar-wardrobe", "runtime-assets-inputs-d242.json"), "utf8")).items;

/** Phase 1: the master and the variants' pants layers (lossless PNG), the mapping checks. */
function phaseLayers(OUT) {
  const mem = [["start", rss()]], E = env(); mem.push(["env", rss()]);
  const { t, src } = EV.templateOf(E, "bottom"), t0 = Date.now(), master = PM.buildPantsMaster(t, src), buildMs = Date.now() - t0; mem.push(["master", rss()]);
  const spec = itemsSpec(), { P } = loadItems({ [PM.SPEC.source]: spec[PM.SPEC.source] }), same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  const runtimeSame = same(P[PM.SPEC.source].layers.pants, src.layers.pants) && same(P[PM.SPEC.source].shadow, src.shadow);
  mkdirSync(join(OUT, "layers"), { recursive: true });
  // the original's own fabric colour (median of the legs' plain fabric) for the olive control
  const plainOf = (L) => { const c = [[], [], []]; for (let i = 0; i < N; i++) if (master.panel[i] > 0 && !t.contour[i * 4 + 3] && master.ratio[i] >= 0.97 && master.ratio[i] <= 1.03) for (let k = 0; k < 3; k++) c[k].push(L[i * 4 + k]); return c.map((a) => a.sort((x, y) => x - y)[a.length >> 1]); };
  const olive = plainOf(src.layers.pants), mats = PM.materials(), sand = mats["solid sand (SYNTHETIC)"];
  const variants = [["original (olive, the item itself)", () => src.layers.pants], ...Object.entries(mats).map(([n, m]) => [n, () => PM.renderPants(master, t, E.base, { body: m }).layer]),
    ["CONTROL master olive (the master in the original's own colour)", () => PM.renderPants(master, t, E.base, { body: olive }).layer],
    // the original's own pixels recoloured to sand WITHOUT the master: its own luminance against its plain fabric, its own contour kept
    ["CONTROL recoloured sand (the original recoloured without the master)", () => { const L = Uint8ClampedArray.from(src.layers.pants), o = 0.299 * olive[0] + 0.587 * olive[1] + 0.114 * olive[2];
      for (let i = 0; i < N; i++) { if (!L[i * 4 + 3] || t.contour[i * 4 + 3]) continue; const f = (0.299 * L[i * 4] + 0.587 * L[i * 4 + 1] + 0.114 * L[i * 4 + 2]) / o; for (let k = 0; k < 3; k++) L[i * 4 + k] = Math.min(255, Math.round(sand[k] * f)); } return L; }]];
  const a0 = src.layers.pants, layers = {};
  for (const [name, make] of variants) { let L = make(); let alphaEquals = true; for (let i = 0; i < N; i++) if (L[i * 4 + 3] !== a0[i * 4 + 3]) { alphaEquals = false; break; }
    const lum = (i) => 0.299 * L[i * 4] + 0.587 * L[i * 4 + 1] + 0.114 * L[i * 4 + 2]; let f = 0, nf = 0, p = 0, np = 0;
    for (let i = 0; i < N; i++) { if (master.panel[i] < 1 || t.contour[i * 4 + 3]) continue; const r = master.ratio[i]; if (r < 0.85) { f += lum(i); nf++; } else if (r >= 0.97 && r <= 1.03) { p += lum(i); np++; } }
    const file = slug(name) + ".png", png = encodePng(W, N / W, L); writeFileSync(join(OUT, "layers", file), png);
    layers[name] = { file, sha256: sha(png), alphaEqualsCut: alphaEquals, foldContrast: +((f / nf) / (p / np)).toFixed(3), control: name.startsWith("CONTROL") };
    L = null; gc(); mem.push(["layer " + slug(name), rss()]); }
  const mc = PM.mappingChecks(master, t, E.base.arms);
  const out = { key: codeKey(), buildMs, runtimeTrousersIdenticalToCut: runtimeSame, master: { sizes: master.sizes, axes: master.axes.map((a) => ({ angleDeg: +(a.angle * 180 / Math.PI).toFixed(2), origin: a.origin })), base: +master.base.toFixed(1), seamPx: master.seam.length }, oliveRgb: olive, mapping: mc, layers, memory: mem };
  const pv = new Uint8ClampedArray(N * 4), col = [[200, 200, 80], [90, 160, 220], [230, 120, 100]]; for (let i = 0; i < N; i++) { const pn = master.panel[i]; if (pn >= 0) pv.set([...col[pn], 255], i * 4); } for (const [x, y] of master.seam) pv.set([0, 0, 0, 255], (y * W + x) * 4);
  savePng(join(OUT, "pm-panels.png"), crop(flat(pv, BG), [360, 720, 664, 1400], 1));
  writeFileSync(join(OUT, "layers.json"), JSON.stringify(out, null, 2) + "\n"); mem.push(["end", rss()]);
  console.log(JSON.stringify({ phase: "layers", runtimeSame, mapping: mc, layers: Object.fromEntries(Object.entries(layers).map(([k, v]) => [slug(k), [v.alphaEqualsCut, v.foldContrast]])), peakMB: Math.max(...mem.map((m) => m[1])) }));
}

/** Phase 2: per variant x combination, one at a time: the outfit check (with the double contours' places) and the small crops. */
function phaseOutfits(OUT) {
  const L0 = JSON.parse(readFileSync(join(OUT, "layers.json"), "utf8")); if (L0.key !== codeKey()) throw new Error("layers.json is from other code: run --phase layers again");
  const mem = [["start", rss()]], E = env(), { w, base } = E, spec = itemsSpec(), { P } = loadItems(Object.fromEntries([...TOPS, ...SHOES, PM.SPEC.source].map((id) => [id, spec[id]])));
  const shadow = P[PM.SPEC.source].shadow, min = BF.minimumItems(base.R, base.sep.lab); mem.push(["env + items", rss()]);
  mkdirSync(join(OUT, "units"), { recursive: true }); mkdirSync(join(OUT, "crops"), { recursive: true });
  const composite = (top, pants, shoes) => { const closed = P[shoes].covering === "closed-footwear", pr = BF.layerProof(w, base.R, base.Z, Object.assign({}, min, P[top].layers, { pants }, P[shoes].layers), { sep: base.sep, headSeam: "d201", hide: closed ? BC.closedFootwearHidden(base, P[shoes].layers.shoes) : null, enclosure: "c-exterior" });
    let comp = pr.dressedRuntime; for (const sh of [P[top].shadow, shadow, P[shoes].shadow]) if (sh) comp = IP.applyShadow(comp, pr.stack, sh); return flat(comp, BG); };
  let done = 0, reused = 0;
  for (const [name, v] of Object.entries(L0.layers)) for (const top of TOPS) for (const sh of SHOES) {
    const id = slug(name) + "--" + top.replace("top-tee-hip-", "tee-") + "--" + sh.replace("shoes-", ""), f = join(OUT, "units", id + ".json"), key = sha(L0.key + v.sha256 + top + sh);
    if (existsSync(f) && JSON.parse(readFileSync(f, "utf8")).key === key) { reused++; continue; }
    let pants = loadPng(join(OUT, "layers", v.file)).px; if (sha(encodePng(W, N / W, pants)) !== v.sha256) throw new Error(v.file + " changed");
    let r = R1.checkOutfit(w, base, [P[top], { category: "bottom", layers: { pants }, covering: "none", shadow }, P[sh]]);
    const dbl = r.failed.includes("COMBO-2-DOUBLE-CONTOUR");
    const unit = { key, variant: name, top, shoes: sh, ok: r.ok, failed: r.failed, crops: [] }; r = null; gc();
    const combo = SHEET_COMBOS.find(([, t2, s2]) => t2 === top && s2 === sh);
    if (combo && (!v.control || sh === "shoes-boots-laceup-black" || combo[0] === "K18")) {
      let c = composite(top, pants, sh);
      const put = (tag, im) => { const file = id + "--" + tag + ".png"; savePng(join(OUT, "crops", file), im); unit.crops.push(file); };
      put("whole", down(c, 262, 768, FIG)); if (combo[0].startsWith("K")) { put("app110", down(c, 110, 165)); put("app52", down(c, 52, 78)); }
      if (combo[0] === "K18") for (const [tag, box] of Object.entries(CLOSE)) put("close-" + slug(tag), crop(c, box, 2));
      if (sh === "shoes-boots-laceup-black") put("close-hem-at-the-laced-boot", crop(c, CLOSE["hem at the shoes"], 2));
      c = null; }
    unit.doubleContour = dbl; pants = null; gc(); unit.rssMB = rss(); mem.push([id, unit.rssMB]);
    writeFileSync(f, JSON.stringify(unit, null, 2) + "\n"); done++; }
  writeFileSync(join(OUT, "memory-outfits.json"), JSON.stringify(mem, null, 2) + "\n");
  console.log(JSON.stringify({ phase: "outfits", units: done, reused, peakMB: Math.max(...mem.map((m) => m[1])) }));
}

/** Phase 3: the sheets and the record, from the saved files only. */
function phaseSheets(OUT) {
  const L0 = JSON.parse(readFileSync(join(OUT, "layers.json"), "utf8")), units = {};
  for (const [name, v] of Object.entries(L0.layers)) for (const top of TOPS) for (const sh of SHOES) { const id = slug(name) + "--" + top.replace("top-tee-hip-", "tee-") + "--" + sh.replace("shoes-", ""), f = join(OUT, "units", id + ".json");
    if (!existsSync(f)) throw new Error("missing unit " + id + ": run --phase outfits"); const u = JSON.parse(readFileSync(f, "utf8")); if (u.key !== sha(L0.key + v.sha256 + top + sh)) throw new Error("stale unit " + id); units[id] = u; }
  const C = (f) => loadPng(join(OUT, "crops", f)), names = Object.keys(L0.layers), main = names.filter((n) => !L0.layers[n].control), ctl = names.filter((n) => L0.layers[n].control);
  const uid = (n, top, sh) => slug(n) + "--" + top.replace("top-tee-hip-", "tee-") + "--" + sh.replace("shoes-", "");
  const whole = [], closes = [], apps = [];
  for (const n of main) { for (const [, top, sh] of SHEET_COMBOS) whole.push(C(uid(n, top, sh) + "--whole.png"));
    const k18 = uid(n, ...DOCUMENTED.K18); for (const tag of Object.keys(CLOSE)) closes.push(C(k18 + "--close-" + slug(tag) + ".png")); closes.push(C(uid(n, "top-tee-hip-cream", "shoes-boots-laceup-black") + "--close-hem-at-the-laced-boot.png"));
    for (const k of ["K17", "K18"]) { const u = uid(n, ...DOCUMENTED[k]); apps.push(C(u + "--app110.png"), C(u + "--app52.png")); } }
  savePng(join(OUT, "pm-outfits.png"), grid(whole, SHEET_COMBOS.length, 8)); savePng(join(OUT, "pm-closeups-x2.png"), grid(closes, Object.keys(CLOSE).length + 1, 8)); savePng(join(OUT, "pm-app-actual.png"), grid(apps, 4, 6));
  const big = apps.map((im) => { const k = 3, o = new Uint8ClampedArray(im.w * k * im.h * k * 4); for (let y = 0; y < im.h * k; y++) for (let x = 0; x < im.w * k; x++) o.set(im.px.subarray((((y / k) | 0) * im.w + ((x / k) | 0)) * 4, (((y / k) | 0) * im.w + ((x / k) | 0)) * 4 + 4), (y * im.w * k + x) * 4); return { w: im.w * k, h: im.h * k, px: o }; });
  savePng(join(OUT, "pm-app-x3.png"), grid(big, 4, 8));
  // the double-contour investigation: the hem at the laced boot for the original, the master variants and the two controls
  const inv = [...names].map((n) => C(uid(n, "top-tee-hip-cream", "shoes-boots-laceup-black") + "--close-hem-at-the-laced-boot.png")); savePng(join(OUT, "pm-laced-boot-hem-x2.png"), grid(inv, 4, 8));
  const per = (n) => Object.fromEntries(TOPS.flatMap((top) => SHOES.map((sh) => { const u = units[uid(n, top, sh)]; return [top + "+" + sh, { ok: u.ok, failed: u.failed }]; })));
  const ref = per(names[0]), record = { decision: "D-276", revision: PM.REVISION, spec: PM.SPEC, ...L0, documentedOutfits: DOCUMENTED, variants: {} };
  delete record.layers; delete record.key;
  for (const n of names) { const p = per(n); record.variants[n] = { ...L0.layers[n], outfitChecks: p, outfitChecksAsOriginal: Object.keys(ref).every((k) => ref[k].ok === p[k].ok && ref[k].failed.join() === p[k].failed.join()) }; }
  record.memory = { layers: L0.memory, outfits: JSON.parse(readFileSync(join(OUT, "memory-outfits.json"), "utf8")) };
  record.sheets = { "pm-outfits.png": "rows: " + main.join(" | ") + "; columns: K17, K18, cream tee + sneakers-beige (geometry only), cream tee + boots-laceup-black (geometry only); 0.5x",
    "pm-closeups-x2.png": "rows: the same; columns: " + Object.keys(CLOSE).join(", ") + " (K18), hem at the laced boot (cream tee + boots-laceup-black, geometry only); 2x",
    "pm-app-actual.png": "rows: the same; per row K17 110x165, K17 52x78, K18 110x165, K18 52x78 at ACTUAL size", "pm-app-x3.png": "as pm-app-actual.png, 3x nearest for inspection",
    "pm-laced-boot-hem-x2.png": "the hem at the laced boot (cream tee + boots-laceup-black): " + names.join(" | "), "pm-panels.png": "the panels (waistband yellow, left leg blue, right leg red) and the centre seam" };
  record.approved = "nothing"; record.visualIsNeverAutomatic = true;
  writeFileSync(join(OUT, "record.json"), JSON.stringify(record, null, 2) + "\n");
  console.log(JSON.stringify({ phase: "sheets", variants: Object.fromEntries(Object.entries(record.variants).map(([k, v]) => [slug(k), { alpha: v.alphaEqualsCut, asOriginal: v.outfitChecksAsOriginal, fold: v.foldContrast, failed: Object.entries(v.outfitChecks).filter(([, c]) => !c.ok).map(([o, c]) => o.replace(/top-tee-hip-|shoes-/g, "") + ":" + c.failed.join("|")) }])) }));
}

function main() {
  const args = process.argv.slice(2), at = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), OUT = outDir(at("--out")), phase = at("--phase");
  if (phase === "layers") return phaseLayers(OUT); if (phase === "outfits") return phaseOutfits(OUT); if (phase === "sheets") return phaseSheets(OUT);
  throw new Error("--phase layers|outfits|sheets");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { try { main(); } catch (e) { console.error("REFUSED: " + e.message); process.exit(1); } }
