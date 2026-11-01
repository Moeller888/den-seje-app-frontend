// D-289 — the shoe master study on C (offline; no image call): the low sneaker cut of shoes-sneakers-beige, its master
// (northstar-shoe-master.mjs), the original, the master's self-reproduction (the original's own field colours) and four SYNTHETIC
// designs (light, dark, two with contrast between material fields). Then:
//   geometry  — every variant's alpha equals the original's and so does the closed-footwear covering (closedFootwearHidden); the
//               outfit check (R1.checkOutfit) with the cream tee over every bottom — skirt-sand, shorts-navy, capri-lightblue,
//               trousers-square-olive and D-283's navy and sand trousers (the transitions; no combination is offered by this);
//   material  — per field group: the painted volume kept (the correlation of the variant's luminance with the original's), the
//               highlights kept as highlights (the share of the original's highlight pixels still lighter than the material), the
//               highlight spread (p95 − p50 of the luminance), colour residue (pixels left in the original's colour where the design
//               changed the colour), and the self-reproduction error (OKLab ΔE against the original);
//   views     — both shoes and the collar, sole and heel close up, every bottom's hem at the shoes, whole outfits and the app sizes
//               110x165 and 52x78, each on a light and a dark background.
// MEMORY: as D-276/D-279 — three phases, each its own process, one unit at a time, run with --expose-gc; a unit is reused only when
// its key (the sha256 of this tool, the master module and the unit's inputs) matches. The views show C: --out must be outside the
// repository. Nothing here approves an item; the visual review is never automatic.
// Usage: node --expose-gc tools/avatar/northstar-shoe-master-study.mjs --out <dir outside the repo> --phase layers|outfits|sheets --dwebp <dwebp.exe>
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { encodePng, decodePng } from "./r3-hair-tool-v2.mjs";
import * as WR from "./northstar-wardrobe.mjs";
import * as BF from "./northstar-base-figure.mjs";
import * as BC from "./northstar-base-figure-c.mjs";
import * as IP from "./northstar-item-pilot.mjs";
import * as R1 from "./northstar-r1-garment.mjs";
import * as SM from "./northstar-shoe-master.mjs";
import { deltaE } from "./northstar-tee-print-validation.mjs";
import { loadItems } from "./build-northstar-runtime-assets.mjs";
import { flat, crop, grid, down } from "./northstar-wardrobe-poc.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", ".."), { W, N } = WR, H = N / W;
const sha = (b) => createHash("sha256").update(b).digest("hex");
export const TOP = "top-tee-hip-cream";
export const BOTTOMS = Object.freeze(["bottom-skirt-sand", "bottom-shorts-navy", "bottom-capri-lightblue", "bottom-trousers-square-olive", "bottom-trousers-square-navy", "bottom-trousers-square-sand"]);
export const PUBLISHED_BOTTOMS = Object.freeze(["bottom-trousers-square-navy", "bottom-trousers-square-sand"]);   // D-283's, shadowsOf the olive trousers
export const CLOSE = Object.freeze({ "both shoes": [336, 1290, 688, 1504], "left shoe": [336, 1340, 476, 1500], "right shoe": [548, 1340, 688, 1500], collar: [380, 1340, 640, 1392], "sole and heel": [336, 1440, 688, 1504] });
export const BGS = Object.freeze({ light: [236, 233, 226], dark: [24, 26, 40] });
const FIG = [250, 0, 774, 1536];
const slug = (s) => s.split(" (")[0].replace(/[^a-z0-9]+/gi, "-").toLowerCase();
const rss = () => Math.round(process.memoryUsage().rss / 1048576), gc = () => { if (typeof globalThis.gc === "function") globalThis.gc(); };
function outDir(OUT) { const r = relative(ROOT, resolve(OUT || ".")); if (!OUT || !(r.startsWith("..") || isAbsolute(r))) throw new Error("--out must be outside the repository (the sheets show C)"); mkdirSync(OUT, { recursive: true }); return OUT; }
const codeKey = () => sha(Buffer.concat([readFileSync(fileURLToPath(import.meta.url)), readFileSync(join(ROOT, "tools", "avatar", "northstar-shoe-master.mjs"))]));
const savePng = (f, im) => writeFileSync(f, encodePng(im.w, im.h, im.px)), loadPng = (f) => { const d = decodePng(readFileSync(f)); return { w: d.header.w, h: d.header.h, px: Uint8ClampedArray.from(d.px) }; };
const itemsSpec = () => JSON.parse(readFileSync(join(ROOT, "tools", "avatar", "fixtures", "northstar-wardrobe", "runtime-assets-inputs-d242.json"), "utf8")).items;
function env() { const w = WR.buildWardrobe(), base = BC.prepareBase(w, Uint8ClampedArray.from(decodePng(IP.readC()).px)); return { w, base }; }
const decodePublished = (DWEBP, f) => { const o = join(tmpdir(), "d289-" + process.pid + ".png"); try { execFileSync(DWEBP, ["-quiet", join(ROOT, "assets", "avatar-northstar", f), "-o", o]); return Uint8ClampedArray.from(decodePng(readFileSync(o)).px); } finally { rmSync(o, { force: true }); } };
const uidOf = (n, b) => slug(n) + "--" + b.replace("bottom-", "");
const nearest = (im, k) => { const o = new Uint8ClampedArray(im.w * k * im.h * k * 4); for (let y = 0; y < im.h * k; y++) for (let x = 0; x < im.w * k; x++) o.set(im.px.subarray((((y / k) | 0) * im.w + ((x / k) | 0)) * 4, (((y / k) | 0) * im.w + ((x / k) | 0)) * 4 + 4), (y * im.w * k + x) * 4); return { w: im.w * k, h: im.h * k, px: o }; };

/** The material measures of a variant against the original, per field group (the seeded field pixels, the outer contour excluded). */
export function materialMeasures(master, src, L, design) {
  const lumOf = (P, i) => 0.299 * P[i * 4] + 0.587 * P[i * 4 + 1] + 0.114 * P[i * 4 + 2], out = {};
  SM.GROUPS.forEach((g, k) => { const a = [], b = []; let hl = 0, hlKept = 0, residue = 0, n = 0; const M = design ? (design[g] || design.upper) : null, mLum = M ? 0.299 * M[0] + 0.587 * M[1] + 0.114 * M[2] : null;
    for (let i = 0; i < N; i++) { if (master.group[i] !== k || !master.field[i] || master.contour[i]) continue; n++; const o = lumOf(src, i), v = lumOf(L, i); a.push(o); b.push(v);
      if (master.light[i] > 0.005) { hl++; if (mLum === null || v > mLum + 2) hlKept++; }
      // residue: the pixel kept the original's colour although the design's field colour is far from it
      const s0 = [src[i * 4], src[i * 4 + 1], src[i * 4 + 2]]; if (M && deltaE([L[i * 4], L[i * 4 + 1], L[i * 4 + 2]], s0) < 0.02 && deltaE(M, s0) > 0.1) residue++; }
    const mean = (x) => x.reduce((s, v) => s + v, 0) / x.length, ma = mean(a), mb = mean(b); let sab = 0, saa = 0, sbb = 0; for (let j = 0; j < a.length; j++) { sab += (a[j] - ma) * (b[j] - mb); saa += (a[j] - ma) ** 2; sbb += (b[j] - mb) ** 2; }
    const sp = (x) => { const s = [...x].sort((p, q) => p - q); return Math.round(s[Math.floor(s.length * 0.95)] - s[s.length >> 1]); };
    out[g] = { px: n, volumeCorrelation: +(sab / Math.sqrt(saa * sbb || 1)).toFixed(3), highlightPx: hl, highlightsKept: hl ? +(hlKept / hl).toFixed(3) : null, spreadOriginal: sp(a), spreadVariant: sp(b), residuePx: residue }; });
  return out;
}

/** Phase 1: the master, the variants' shoe layers (lossless PNG), the material measures, the covering, the field map. */
function phaseLayers(OUT, DWEBP) {
  const mem = [["start", rss()]], E = env(); mem.push(["env", rss()]);
  const { P } = loadItems({ [SM.SPEC.source]: itemsSpec()[SM.SPEC.source] }), src = P[SM.SPEC.source].layers.shoes, pub = decodePublished(DWEBP, SM.SPEC.source + "-shoes-v1.webp");
  const sourceIsPublished = src.length === pub.length && src.every((v, i) => v === pub[i]);
  const t0 = Date.now(), t = R1.templateFromLayers({ shoes: src }, { category: "shoes", covering: "closed-footwear", cut: SM.SPEC.cut }), master = SM.buildShoeMaster(src, t), buildMs = Date.now() - t0; mem.push(["master", rss()]);
  mkdirSync(join(OUT, "layers"), { recursive: true }); mkdirSync(join(OUT, "crops"), { recursive: true });
  const hide0 = BC.closedFootwearHidden(E.base, src), self = SM.originalDesign(master, src);
  const variants = [["original (beige, the item itself)", null], ["self-reproduction (the original's own field colours)", self], ...Object.entries(SM.designs())], layers = {};
  for (const [name, d] of variants) { const t1 = Date.now(); let L = d ? SM.renderShoe(master, src, d) : src; const renderMs = Date.now() - t1;
    let alphaEquals = true; for (let i = 3; i < N * 4; i += 4) if (L[i] !== src[i]) { alphaEquals = false; break; }
    const hide = BC.closedFootwearHidden(E.base, L); let hideEquals = true; for (let i = 0; i < N; i++) if (hide[i] !== hide0[i]) { hideEquals = false; break; }
    let selfErr = null; if (name.startsWith("self")) { let s = 0, mx = 0, n = 0, over = 0, at = null; for (let i = 0; i < N; i++) { if (src[i * 4 + 3] < 128 || master.contour[i]) continue; const e = deltaE([L[i * 4], L[i * 4 + 1], L[i * 4 + 2]], [src[i * 4], src[i * 4 + 1], src[i * 4 + 2]]); s += e; if (e > mx) { mx = e; at = [i % W, (i / W) | 0]; } if (e > 0.1) over++; n++; } selfErr = { meanDeltaE: +(s / n).toFixed(4), maxDeltaE: +mx.toFixed(3), maxAt: at, pxOver0_1: over }; }
    const file = slug(name) + ".png", png = encodePng(W, H, L); writeFileSync(join(OUT, "layers", file), png);
    for (const [bn, bg] of Object.entries(BGS)) savePng(join(OUT, "crops", "layer--" + slug(name) + "--" + bn + ".png"), crop(flat(L, bg), CLOSE["both shoes"], 2));
    layers[name] = { file, sha256: sha(png), design: d, renderMs: d ? renderMs : null, alphaEqualsOriginal: alphaEquals, coveringEqualsOriginal: hideEquals, material: d ? materialMeasures(master, src, L, d) : null, selfReproduction: selfErr };
    L = null; gc(); mem.push(["layer " + slug(name), rss()]); }
  // the field map (the groups, the inner ink dark, the outer contour black) — the one-time per-cut data made visible
  const col = [[70, 120, 200], [230, 160, 60], [120, 120, 120], [240, 240, 240], [150, 90, 200]], fm = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < N; i++) { if (!src[i * 4 + 3]) { fm.set([150, 150, 150, 255], i * 4); continue; } const k = master.group[i]; fm.set(master.contour[i] ? [0, 0, 0, 255] : master.ink[i] ? [60, 40, 30, 255] : [...(k >= 0 ? col[k] : [255, 0, 255]), 255], i * 4); }
  for (const [x, y] of Object.values(SM.SPEC.seeds).flat()) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) fm.set([255, 0, 0, 255], ((y + dy) * W + x + dx) * 4);
  savePng(join(OUT, "sm-fields-x3.png"), crop(fm, [336, 1350, 688, 1504], 3));
  const out = { key: codeKey(), revision: master.revision, cut: SM.SPEC.cut, source: SM.SPEC.source, sourceIsPublished, buildMs, effortPerCut: { seeds: Object.values(SM.SPEC.seeds).flat().length, seedGroups: Object.fromEntries(Object.entries(SM.SPEC.seeds).map(([g, s]) => [g, s.length])), parameters: { inkRatio: SM.SPEC.inkRatio, inkRadius: SM.SPEC.inkRadius } },
    fields: master.fields, seededFields: master.seededFields, unassignedPx: master.unassigned, sizes: master.sizes, base: master.base.map((v) => Math.round(v)), inkPx: master.inkPx, contourPx: master.contourPx, fringePx: master.fringe.length / 2, layers, memory: mem };
  writeFileSync(join(OUT, "layers.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(JSON.stringify({ phase: "layers", sourceIsPublished, buildMs, unassignedPx: master.unassigned, variants: Object.fromEntries(Object.entries(layers).map(([k, v]) => [slug(k), { alpha: v.alphaEqualsOriginal, covering: v.coveringEqualsOriginal, ms: v.renderMs, self: v.selfReproduction }])), peakMB: Math.max(...mem.map((m) => m[1])) }));
}

/** Phase 2: per variant x bottom the outfit check and the crops, one unit at a time. */
function phaseOutfits(OUT, DWEBP) {
  const L0 = JSON.parse(readFileSync(join(OUT, "layers.json"), "utf8")); if (L0.key !== codeKey()) throw new Error("layers.json is from other code: run --phase layers again");
  const mem = [["start", rss()]], E = env(), { w, base } = E, items = itemsSpec(), local = [TOP, SM.SPEC.source, ...BOTTOMS.filter((b) => !PUBLISHED_BOTTOMS.includes(b))];
  const { P } = loadItems(Object.fromEntries(local.map((id) => [id, items[id]])));
  for (const b of PUBLISHED_BOTTOMS) P[b] = { item: b, layers: { pants: decodePublished(DWEBP, b + "-pants-v1.webp") }, shadow: P["bottom-trousers-square-olive"].shadow, category: "bottom", covering: "none" };
  const shadow = P[SM.SPEC.source].shadow, min = BF.minimumItems(base.R, base.sep.lab); mem.push(["env + items", rss()]);
  mkdirSync(join(OUT, "units"), { recursive: true });
  let done = 0, reused = 0;
  for (const [name, v] of Object.entries(L0.layers)) { if (name.startsWith("self")) continue;
    for (const b of BOTTOMS) {
      const id = uidOf(name, b), f = join(OUT, "units", id + ".json"), key = sha(L0.key + v.sha256 + b);
      if (existsSync(f) && JSON.parse(readFileSync(f, "utf8")).key === key) { reused++; continue; }
      let shoes = loadPng(join(OUT, "layers", v.file)).px; if (sha(encodePng(W, H, shoes)) !== v.sha256) throw new Error(v.file + " changed");
      const S = { category: "shoes", layers: { shoes }, covering: "closed-footwear", shadow };
      let r = R1.checkOutfit(w, base, [P[TOP], P[b], S]); const unit = { key, variant: name, bottom: b, ok: r.ok, failed: r.failed, crops: [] }; r = null; gc();
      const pr = BF.layerProof(w, base.R, base.Z, Object.assign({}, min, P[TOP].layers, P[b].layers, { shoes }), { sep: base.sep, headSeam: "d201", hide: BC.closedFootwearHidden(base, shoes), enclosure: "c-exterior" });
      let c = pr.dressedRuntime; for (const s of [P[TOP].shadow, P[b].shadow, shadow]) if (s) c = IP.applyShadow(c, pr.stack, s);
      const put = (tag, im) => { const file = id + "--" + tag + ".png"; savePng(join(OUT, "crops", file), im); unit.crops.push(file); };
      for (const [bn, bg] of Object.entries(BGS)) { const fl = flat(c, bg);
        put("whole--" + bn, down(fl, 262, 768, FIG)); put("app110--" + bn, down(fl, 110, 165)); put("app52--" + bn, down(fl, 52, 78)); put("hem--" + bn, crop(fl, CLOSE["both shoes"], 2));
        if (b === "bottom-shorts-navy") for (const tag of ["left shoe", "right shoe", "collar", "sole and heel"]) put("close-" + slug(tag) + "--" + bn, crop(fl, CLOSE[tag], tag === "collar" ? 4 : 3)); }
      c = null; shoes = null; gc(); unit.rssMB = rss(); mem.push([id, unit.rssMB]);
      writeFileSync(f, JSON.stringify(unit, null, 2) + "\n"); done++; } }
  writeFileSync(join(OUT, "memory-outfits.json"), JSON.stringify(mem, null, 2) + "\n");
  console.log(JSON.stringify({ phase: "outfits", units: done, reused, peakMB: Math.max(...mem.map((m) => m[1])) }));
}

/** Phase 3: the sheets, the record and the private page, from the saved files only. */
function phaseSheets(OUT) {
  const L0 = JSON.parse(readFileSync(join(OUT, "layers.json"), "utf8")), names = Object.keys(L0.layers).filter((n) => !n.startsWith("self")), units = {};
  for (const n of names) for (const b of BOTTOMS) { const id = uidOf(n, b), f = join(OUT, "units", id + ".json"); if (!existsSync(f)) throw new Error("missing unit " + id);
    const u = JSON.parse(readFileSync(f, "utf8")); if (u.key !== sha(L0.key + L0.layers[n].sha256 + b)) throw new Error("stale unit " + id); units[id] = u; }
  const C = (f) => loadPng(join(OUT, "crops", f));
  for (const bn of Object.keys(BGS)) {
    savePng(join(OUT, "sm-layers-x2--" + bn + ".png"), grid(Object.keys(L0.layers).map((n) => C("layer--" + slug(n) + "--" + bn + ".png")), 2, 8));
    savePng(join(OUT, "sm-closeups--" + bn + ".png"), grid(names.flatMap((n) => ["left-shoe", "right-shoe", "collar", "sole-and-heel"].map((tag) => C(uidOf(n, "bottom-shorts-navy") + "--close-" + tag + "--" + bn + ".png"))), 4, 8));
    savePng(join(OUT, "sm-hems-x2--" + bn + ".png"), grid(names.flatMap((n) => BOTTOMS.map((b) => C(uidOf(n, b) + "--hem--" + bn + ".png"))), BOTTOMS.length, 6));
    savePng(join(OUT, "sm-outfits--" + bn + ".png"), grid(names.flatMap((n) => BOTTOMS.map((b) => C(uidOf(n, b) + "--whole--" + bn + ".png"))), BOTTOMS.length, 8));
    const apps = names.flatMap((n) => BOTTOMS.flatMap((b) => [C(uidOf(n, b) + "--app110--" + bn + ".png")])), small = names.flatMap((n) => BOTTOMS.map((b) => C(uidOf(n, b) + "--app52--" + bn + ".png")));
    savePng(join(OUT, "sm-app110-actual--" + bn + ".png"), grid(apps, BOTTOMS.length, 6)); savePng(join(OUT, "sm-app52-actual--" + bn + ".png"), grid(small, BOTTOMS.length, 6)); savePng(join(OUT, "sm-app52-x3--" + bn + ".png"), grid(small.map((im) => nearest(im, 3)), BOTTOMS.length, 8)); }
  const per = (n) => Object.fromEntries(BOTTOMS.map((b) => { const u = units[uidOf(n, b)]; return [b, { ok: u.ok, failed: u.failed }]; })), ref = per(names[0]);
  const record = { decision: "D-289", ...L0, top: TOP, bottoms: BOTTOMS, variants: {} }; delete record.layers; delete record.key;
  for (const n of Object.keys(L0.layers)) { const v = { ...L0.layers[n] }; if (!n.startsWith("self")) { const p = per(n); v.outfitChecks = p; v.outfitChecksAsOriginal = Object.keys(ref).every((k) => ref[k].ok === p[k].ok && ref[k].failed.join() === p[k].failed.join()); } record.variants[n] = v; }
  record.memory = { layers: L0.memory, outfits: JSON.parse(readFileSync(join(OUT, "memory-outfits.json"), "utf8")) };
  record.sheets = { "sm-fields-x3.png": "the one-time field map: upper blue, toe orange, sole grey, laces white, tongue violet, inner ink brown, outer contour black, seeds red; 3x",
    "sm-layers-x2--{light,dark}.png": "the shoe layer alone, both shoes: " + Object.keys(L0.layers).join(" | ") + "; 2x",
    "sm-closeups--{light,dark}.png": "rows: " + names.join(" | ") + "; columns: left shoe 3x, right shoe 3x, collar 4x, sole and heel 3x (cream tee + shorts-navy)",
    "sm-hems-x2--{light,dark}.png": "rows: the variants; columns: " + BOTTOMS.join(", ") + " — the bottoms' hems at the shoes; 2x",
    "sm-outfits--{light,dark}.png": "rows: the variants; columns: the bottoms; whole outfits 0.5x", "sm-app110-actual / sm-app52-actual / sm-app52-x3": "the same grid at the app sizes (actual; 52x78 also 3x nearest)" };
  record.approved = "nothing"; record.offered = "nothing: no combination is offered by this study"; record.visualIsNeverAutomatic = true;
  writeFileSync(join(OUT, "record.json"), JSON.stringify(record, null, 2) + "\n");
  writeFileSync(join(OUT, "index.html"), page(record, names));
  console.log(JSON.stringify({ phase: "sheets", variants: Object.fromEntries(Object.entries(record.variants).map(([k, v]) => [slug(k), { alpha: v.alphaEqualsOriginal, covering: v.coveringEqualsOriginal, asOriginal: v.outfitChecksAsOriginal, failed: v.outfitChecks ? Object.entries(v.outfitChecks).filter(([, c]) => !c.ok).map(([b, c]) => b + ":" + c.failed.join("|")) : null }])) }));
}

/** The private comparison page (local file; no network; it shows C). */
function page(record, names) {
  const fails = (c) => Object.entries(c).filter(([, x]) => !x.ok).map(([b, x]) => b.replace("bottom-", "") + ": " + x.failed.join(", ")).join("; ") || "ingen";
  const mat = (m) => m ? Object.entries(m).map(([g, x]) => `${g}: r ${x.volumeCorrelation}, højlys ${x.highlightsKept ?? "–"}, spænd ${x.spreadOriginal}→${x.spreadVariant}, rester ${x.residuePx}`).join("<br>") : "–";
  const rows = Object.entries(record.variants).map(([n, v]) => `<tr><td>${n}</td><td>${v.alphaEqualsOriginal && v.coveringEqualsOriginal ? "ja" : "NEJ"}</td><td>${v.outfitChecks ? fails(v.outfitChecks) : "–"}</td><td>${mat(v.material)}</td><td>${v.renderMs ?? "–"}</td></tr>`).join("");
  const img = (f, cap) => `<figure><img src="${f}" alt="${cap}"><figcaption>${cap}</figcaption></figure>`;
  return `<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Skomaster — sneakers</title>
<style>:root{--bg:#f4f2ee;--fg:#1d1d1f;--mut:#5b5b60;--card:#fff;--line:#d9d5cc}@media (prefers-color-scheme:dark){:root{--bg:#18181a;--fg:#eee;--mut:#a5a5ab;--card:#232326;--line:#3a3a3e}}
body{margin:0;padding:16px;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif}h1{font-size:20px}h2{font-size:16px;margin-top:22px}p{max-width:72em}figure{margin:8px 0}figure img{max-width:100%;height:auto;border:1px solid var(--line)}figcaption{color:var(--mut);font-size:12px}
table{border-collapse:collapse}td,th{border:1px solid var(--line);padding:4px 8px;text-align:left;vertical-align:top;font-size:13px}.note{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px;max-width:72em}</style></head><body>
<h1>Skomaster på sneakers (D-289) — privat sammenligning</h1>
<p class="note">Privat og lokal; viser C og må ikke offentliggøres. Intet er godkendt eller tilbudt. Snit: ${record.cut} fra ${record.source}. Engangsindsats pr. snit: ${record.effortPerCut.seeds} frøpunkter og 2 parametre; master bygget på ${record.buildMs} ms. Pr. design: én farve pr. felt (overdel, tåkappe, sål, snørebånd, tunge). Prøverne er SYNTETISKE.</p>
<h2>Kontroller</h2><table><tr><th>Variant</th><th>Alfa og fodens dækning som originalen</th><th>Outfitfejl (creme T-shirt × 6 underdele)</th><th>Materiale pr. felt (volumen r, højlys bevaret, spænd p95−p50 original→variant, farverester)</th><th>ms</th></tr>${rows}</table>
<h2>Felterne (engangsdata pr. snit)</h2>${img("sm-fields-x3.png", "Overdel blå, tåkappe orange, sål grå, snørebånd hvid, tunge violet, indre streger brune, ydre kontur sort, frøpunkter røde")}
<h2>Skolaget alene</h2>${img("sm-layers-x2--light.png", "Original, selvgengivelse, lys, mørk, navy+hvid, bordeaux+gummi — lys")}${img("sm-layers-x2--dark.png", "Samme — mørk")}
<h2>Nærbilleder (creme T-shirt + navy shorts)</h2>${img("sm-closeups--light.png", "Venstre sko, højre sko, krave, sål og hæl — lys")}${img("sm-closeups--dark.png", "Samme — mørk")}
<h2>Overgange til underdelene</h2>${img("sm-hems-x2--light.png", "Kolonner: nederdel, shorts, capri, oliven, navy og sand bukser — lys")}${img("sm-hems-x2--dark.png", "Samme — mørk")}
<h2>Hele outfits</h2>${img("sm-outfits--light.png", "Lys")}${img("sm-outfits--dark.png", "Mørk")}
<h2>Appstørrelser</h2>${img("sm-app110-actual--light.png", "110×165 faktisk — lys")}${img("sm-app110-actual--dark.png", "110×165 faktisk — mørk")}${img("sm-app52-x3--light.png", "52×78, 3× — lys")}${img("sm-app52-x3--dark.png", "52×78, 3× — mørk")}
</body></html>`;
}

function main() {
  const args = process.argv.slice(2), at = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), OUT = outDir(at("--out")), phase = at("--phase"), DWEBP = at("--dwebp");
  if (phase !== "sheets" && (!DWEBP || !existsSync(DWEBP))) throw new Error("--dwebp <the vendored dwebp>");
  if (phase === "layers") return phaseLayers(OUT, DWEBP); if (phase === "outfits") return phaseOutfits(OUT, DWEBP); if (phase === "sheets") return phaseSheets(OUT);
  throw new Error("--phase layers|outfits|sheets");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { try { main(); } catch (e) { console.error("REFUSED: " + e.message); process.exit(1); } }
