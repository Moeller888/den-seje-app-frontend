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
// D-291: --master v1|v2 (v1 by default, as D-289 ran it; with --history <D-289's study dir> every v1 layer must be D-289's recorded
// rendering), the perceptual measures per field group (OKLab L: the volume spread, the grain, the line contrast), the close-ups of the
// toe, the laces and the sole, and the COMBO-2 DIAGNOSIS: where the original check fails, its own flagged pixels (the check is run as it
// is, its result is never changed) are classified against the shoe master's fields — the trouser hem outline, the shoe's outer contour,
// its inner ink or a field pixel the check reads as ink by colour — with the pixels between them, and shown as an overlay beside the raw
// shoe layer and the finished outfit. With --before <the v1 study dir> the sheets phase also writes v1|v2 pairs and a private page.
// Usage: node --expose-gc tools/avatar/northstar-shoe-master-study.mjs --out <dir outside the repo> --phase layers|outfits|sheets --dwebp <dwebp.exe> [--master v1|v2] [--history <D-289 dir>] [--before <v1 dir>]
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
const codeKey = (v) => sha(Buffer.concat([readFileSync(fileURLToPath(import.meta.url)), readFileSync(join(ROOT, "tools", "avatar", "northstar-shoe-master.mjs")), Buffer.from(v)]));
const specOf = (v) => { if (v === "v1") return SM.SPEC; if (v === "v2") return SM.SPEC_V2; throw new Error("--master v1|v2"); };
export const EXTRA = Object.freeze({ toe: [350, 1420, 470, 1490], laces: [380, 1356, 640, 1430], sole: [336, 1440, 688, 1504] });
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

/** D-291: the perceptual measures per field group (OKLab L over the seeded field pixels, the contour excluded): the volume spread
 *  (p95 − p5 of L smoothed over 6 px), the grain (the RMS of L minus that smoothing) and the line contrast (the field's median L minus
 *  the median L of the group's inner ink). */
export function perceptualMeasures(master, L) {
  const Lof = (i) => SM.oklab([L[i * 4], L[i * 4 + 1], L[i * 4 + 2]])[0], out = {};
  SM.GROUPS.forEach((g, k) => { const idx = []; for (let i = 0; i < N; i++) if (master.field[i] && master.group[i] === k && !master.contour[i]) idx.push(i); if (!idx.length) return;
    const Lv = new Map(idx.map((i) => [i, Lof(i)])), sm = idx.map((i) => { let t = 0, c = 0; const x = i % W, y = (i / W) | 0; for (let dy = -6; dy <= 6; dy += 2) for (let dx = -6; dx <= 6; dx += 2) { const v = Lv.get((y + dy) * W + x + dx); if (v !== undefined) { t += v; c++; } } return t / c; });
    const s2 = [...sm].sort((a, b) => a - b); let gr = 0; idx.forEach((i, j) => { gr += (Lv.get(i) - sm[j]) ** 2; });
    const ink = []; for (let i = 0; i < N; i++) if (master.group[i] === k && master.ink[i] && !master.contour[i] && L[i * 4 + 3] >= 128) ink.push(Lof(i)); ink.sort((a, b) => a - b);
    const fm = [...Lv.values()].sort((a, b) => a - b)[idx.length >> 1];
    out[g] = { volumeL: +(s2[Math.floor(s2.length * 0.95)] - s2[Math.floor(s2.length * 0.05)]).toFixed(3), grainL: +Math.sqrt(gr / idx.length).toFixed(4), lineContrastL: ink.length ? +(fm - ink[ink.length >> 1]).toFixed(3) : null }; });
  return out;
}

/** Phase 1: the master, the variants' shoe layers (lossless PNG), the material measures, the covering, the field map. */
function phaseLayers(OUT, DWEBP, version, HISTORY) {
  const mem = [["start", rss()]], E = env(); mem.push(["env", rss()]);
  const { P } = loadItems({ [SM.SPEC.source]: itemsSpec()[SM.SPEC.source] }), src = P[SM.SPEC.source].layers.shoes, pub = decodePublished(DWEBP, SM.SPEC.source + "-shoes-v1.webp");
  const sourceIsPublished = src.length === pub.length && src.every((v, i) => v === pub[i]);
  const t0 = Date.now(), t = R1.templateFromLayers({ shoes: src }, { category: "shoes", covering: "closed-footwear", cut: SM.SPEC.cut }), master = SM.buildShoeMaster(src, t, specOf(version)), buildMs = Date.now() - t0; mem.push(["master", rss()]);
  const history = HISTORY ? JSON.parse(readFileSync(join(HISTORY, "layers.json"), "utf8")).layers : null; if (history && version !== "v1") throw new Error("--history checks v1 against D-289");
  mkdirSync(join(OUT, "layers"), { recursive: true }); mkdirSync(join(OUT, "crops"), { recursive: true });
  const hide0 = BC.closedFootwearHidden(E.base, src), self = SM.originalDesign(master, src);
  const variants = [["original (beige, the item itself)", null], ["self-reproduction (the original's own field colours)", self], ...Object.entries(SM.designs())], layers = {};
  for (const [name, d] of variants) { const t1 = Date.now(); let L = d ? SM.renderShoe(master, src, d) : src; const renderMs = Date.now() - t1;
    let alphaEquals = true; for (let i = 3; i < N * 4; i += 4) if (L[i] !== src[i]) { alphaEquals = false; break; }
    const hide = BC.closedFootwearHidden(E.base, L); let hideEquals = true; for (let i = 0; i < N; i++) if (hide[i] !== hide0[i]) { hideEquals = false; break; }
    let selfErr = null; if (name.startsWith("self")) { let s = 0, mx = 0, n = 0, over = 0, at = null; for (let i = 0; i < N; i++) { if (src[i * 4 + 3] < 128 || master.contour[i]) continue; const e = deltaE([L[i * 4], L[i * 4 + 1], L[i * 4 + 2]], [src[i * 4], src[i * 4 + 1], src[i * 4 + 2]]); s += e; if (e > mx) { mx = e; at = [i % W, (i / W) | 0]; } if (e > 0.1) over++; n++; } selfErr = { meanDeltaE: +(s / n).toFixed(4), maxDeltaE: +mx.toFixed(3), maxAt: at, pxOver0_1: over }; }
    const file = slug(name) + ".png", png = encodePng(W, H, L); writeFileSync(join(OUT, "layers", file), png);
    for (const [bn, bg] of Object.entries(BGS)) { const fl = flat(L, bg); savePng(join(OUT, "crops", "layer--" + slug(name) + "--" + bn + ".png"), crop(fl, CLOSE["both shoes"], 2));
      for (const [tag, box] of Object.entries(EXTRA)) savePng(join(OUT, "crops", "layer-" + tag + "--" + slug(name) + "--" + bn + ".png"), crop(fl, box, tag === "sole" ? 3 : 4)); }
    if (history && (!history[name] || history[name].sha256 !== sha(png))) throw new Error(name + ": v1 is not D-289's recorded rendering");
    layers[name] = { file, sha256: sha(png), design: d, renderMs: d ? renderMs : null, alphaEqualsOriginal: alphaEquals, coveringEqualsOriginal: hideEquals, material: d ? materialMeasures(master, src, L, d) : null, perceptual: perceptualMeasures(master, L), selfReproduction: selfErr, ...(history ? { sameAsD289: true } : {}) };
    L = null; gc(); mem.push(["layer " + slug(name), rss()]); }
  // the field map (the groups, the inner ink dark, the outer contour black) — the one-time per-cut data made visible
  const col = [[70, 120, 200], [230, 160, 60], [120, 120, 120], [240, 240, 240], [150, 90, 200]], fm = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < N; i++) { if (!src[i * 4 + 3]) { fm.set([150, 150, 150, 255], i * 4); continue; } const k = master.group[i]; fm.set(master.contour[i] ? [0, 0, 0, 255] : master.ink[i] ? [60, 40, 30, 255] : [...(k >= 0 ? col[k] : [255, 0, 255]), 255], i * 4); }
  for (const [x, y] of Object.values(SM.SPEC.seeds).flat()) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) fm.set([255, 0, 0, 255], ((y + dy) * W + x + dx) * 4);
  savePng(join(OUT, "sm-fields-x3.png"), crop(fm, [336, 1350, 688, 1504], 3));
  const out = { key: codeKey(version), master: version, revision: master.revision, spec: { ...specOf(version), seeds: undefined }, cut: SM.SPEC.cut, source: SM.SPEC.source, sourceIsPublished, buildMs, effortPerCut: { seeds: Object.values(SM.SPEC.seeds).flat().length, seedGroups: Object.fromEntries(Object.entries(SM.SPEC.seeds).map(([g, s]) => [g, s.length])), parameters: { inkRatio: SM.SPEC.inkRatio, inkRadius: SM.SPEC.inkRadius } },
    fields: master.fields, seededFields: master.seededFields, unassignedPx: master.unassigned, sizes: master.sizes, base: master.base.map((v) => Math.round(v)), inkPx: master.inkPx, contourPx: master.contourPx, fringePx: master.fringe.length / 2, layers, memory: mem };
  writeFileSync(join(OUT, "layers.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(JSON.stringify({ phase: "layers", sourceIsPublished, buildMs, unassignedPx: master.unassigned, variants: Object.fromEntries(Object.entries(layers).map(([k, v]) => [slug(k), { alpha: v.alphaEqualsOriginal, covering: v.coveringEqualsOriginal, ms: v.renderMs, self: v.selfReproduction }])), peakMB: Math.max(...mem.map((m) => m[1])) }));
}

/** Phase 2: per variant x bottom the outfit check and the crops, one unit at a time. */
function phaseOutfits(OUT, DWEBP, version) {
  const L0 = JSON.parse(readFileSync(join(OUT, "layers.json"), "utf8")); if (L0.key !== codeKey(version)) throw new Error("layers.json is from other code or another master: run --phase layers again");
  const mem = [["start", rss()]], E = env(), { w, base } = E, items = itemsSpec(), local = [TOP, SM.SPEC.source, ...BOTTOMS.filter((b) => !PUBLISHED_BOTTOMS.includes(b))];
  const { P } = loadItems(Object.fromEntries(local.map((id) => [id, items[id]])));
  for (const b of PUBLISHED_BOTTOMS) P[b] = { item: b, layers: { pants: decodePublished(DWEBP, b + "-pants-v1.webp") }, shadow: P["bottom-trousers-square-olive"].shadow, category: "bottom", covering: "none" };
  const shadow = P[SM.SPEC.source].shadow, min = BF.minimumItems(base.R, base.sep.lab), src = P[SM.SPEC.source].layers.shoes;
  const master = SM.buildShoeMaster(src, R1.templateFromLayers({ shoes: src }, { category: "shoes", covering: "closed-footwear", cut: SM.SPEC.cut }), specOf(version)); mem.push(["env + items + master", rss()]);
  mkdirSync(join(OUT, "units"), { recursive: true });
  let done = 0, reused = 0;
  for (const [name, v] of Object.entries(L0.layers)) { if (name.startsWith("self")) continue;
    for (const b of BOTTOMS) {
      const id = uidOf(name, b), f = join(OUT, "units", id + ".json"), key = sha(L0.key + v.sha256 + b);
      if (existsSync(f) && JSON.parse(readFileSync(f, "utf8")).key === key) { reused++; continue; }
      let shoes = loadPng(join(OUT, "layers", v.file)).px; if (sha(encodePng(W, H, shoes)) !== v.sha256) throw new Error(v.file + " changed");
      const S = { category: "shoes", layers: { shoes }, covering: "closed-footwear", shadow };
      let r = R1.checkOutfit(w, base, [P[TOP], P[b], S]); const unit = { key, variant: name, bottom: b, ok: r.ok, failed: r.failed, crops: [] };
      if (r.failed.includes("COMBO-2-DOUBLE-CONTOUR")) unit.combo2 = diagnoseCombo2(OUT, id, w, base, r.proof, master, shoes, P[b].layers.pants);
      r = null; gc();
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

/** D-291: the original COMBO-2's own flagged pixels (outfitCheck as it is; its result is not changed), classified: on the trouser side
 *  the hem outline; on the shoe side the shoe's outer contour (a drawn outline running beside the hem: an actual double contour), its
 *  inner ink (a lace outline or a seam) or a field pixel the check reads as ink only by its colour; and the pixels between (up to 4 px
 *  above each shoe-side pixel): a painted highlight of the source (a lace highlight) or not. Writes the overlay, the raw shoe layer and
 *  the finished outfit around the flagged pieces (6x). */
function diagnoseCombo2(OUT, id, w, base, proof, master, shoes, pants) {
  const oc = BC.outfitCheck(w, base, proof, { revision: IP.METHODS[IP.METHOD].outfitRevision || "d223" }), c2 = oc.checks.find((c) => c.id === "COMBO-2-DOUBLE-CONTOUR"), all = oc.masks.doubles;
  // only the pieces the check fails on (its doubles; the crossings it reports apart are not failures)
  const m = new Uint8Array(N); for (const d of c2.value.doubles) { const [bx, by, bw, bh] = d.box; for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) if (all[y * W + x]) m[y * W + x] = 1; }
  const shoeSide = {}, gap = {}, add = (o, k) => { o[k] = (o[k] || 0) + 1; }; let x0 = W, y0 = H, x1 = 0, y1 = 0, flagged = 0;
  for (let i = 0; i < N; i++) { if (!m[i]) continue; flagged++; const x = i % W, y = (i / W) | 0; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    if (pants[i * 4 + 3] >= 128) { add(shoeSide, "trousers: hem outline"); continue; }
    const g = master.group[i] >= 0 ? SM.GROUPS[master.group[i]] : "none";
    add(shoeSide, master.contour[i] ? "shoe: outer contour (drawn outline)" : master.ink[i] ? "shoe: inner ink of " + g : "shoe: field pixel of " + g + " (ink by colour only)");
    for (let k = 1; k <= 4; k++) { const j = i - k * W; if (j < 0 || pants[j * 4 + 3] >= 128 || m[j]) break; const gj = master.group[j] >= 0 ? SM.GROUPS[master.group[j]] : "none";
      add(gap, (master.light[j] > 0 ? "source highlight of " : "no highlight, ") + gj + (master.ink[j] ? " (ink)" : "")); } }
  const pad = 14, box = [Math.max(0, x0 - pad), Math.max(0, y0 - pad), Math.min(W, x1 + pad + 1), Math.min(H, y1 + pad + 1)], files = [];
  const comp = flat(proof.dressedRuntime, BGS.light), ov = Uint8ClampedArray.from(comp); for (let i = 0; i < N; i++) if (m[i]) ov.set([230, 20, 20, 255], i * 4);
  for (const [tag, img] of [["overlay", ov], ["outfit", comp], ["raw-shoe", flat(shoes, [150, 150, 150])]]) { const f = id + "--combo2-" + tag + ".png"; savePng(join(OUT, "crops", f), crop(img, box, 4)); files.push(f); }
  return { check: { ok: c2.ok, doubles: c2.value.doubles }, flaggedPx: flagged, box, flaggedBy: shoeSide, between: gap, crops: files };
}

/** Phase 3: the sheets, the record and the private page, from the saved files only. */
function phaseSheets(OUT, version, BEFORE) {
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
  record.decision = version === "v2" ? "D-291" : "D-289"; record.master = version;
  record.combo2 = Object.fromEntries(Object.entries(units).filter(([, u]) => u.combo2).map(([id, u]) => [id, u.combo2]));
  if (BEFORE) {   // D-291: v1 (the before dir) | v2 (this dir), the same views, each pair on light and dark
    const B0 = JSON.parse(readFileSync(join(BEFORE, "layers.json"), "utf8")), bu = {}, Cb = (f) => loadPng(join(BEFORE, "crops", f));
    for (const n of names) for (const b of BOTTOMS) bu[uidOf(n, b)] = JSON.parse(readFileSync(join(BEFORE, "units", uidOf(n, b) + ".json"), "utf8"));
    record.before = { master: B0.master, revision: B0.revision, outfitChecks: Object.fromEntries(names.map((n) => [n, Object.fromEntries(BOTTOMS.map((b) => [b, { ok: bu[uidOf(n, b)].ok, failed: bu[uidOf(n, b)].failed }]))])),
      perceptual: Object.fromEntries(Object.entries(B0.layers).map(([n, v]) => [n, v.perceptual])), combo2: Object.fromEntries(Object.entries(bu).filter(([, u]) => u.combo2).map(([id, u]) => [id, u.combo2])) };
    const all = Object.keys(L0.layers), pair = (f) => [Cb(f), C(f)];
    for (const bn of Object.keys(BGS)) {
      savePng(join(OUT, "ba-layers-x2--" + bn + ".png"), grid(all.flatMap((n) => pair("layer--" + slug(n) + "--" + bn + ".png")), 2, 8));
      for (const tag of Object.keys(EXTRA)) savePng(join(OUT, "ba-" + tag + "--" + bn + ".png"), grid(all.flatMap((n) => pair("layer-" + tag + "--" + slug(n) + "--" + bn + ".png")), 4, 8));
      savePng(join(OUT, "ba-hems-x2--" + bn + ".png"), grid(names.flatMap((n) => BOTTOMS.flatMap((b) => pair(uidOf(n, b) + "--hem--" + bn + ".png"))), 4, 6));
      savePng(join(OUT, "ba-app110--" + bn + ".png"), grid(names.flatMap((n) => BOTTOMS.flatMap((b) => pair(uidOf(n, b) + "--app110--" + bn + ".png"))), 12, 6));
      savePng(join(OUT, "ba-app52-x3--" + bn + ".png"), grid(names.flatMap((n) => BOTTOMS.flatMap((b) => pair(uidOf(n, b) + "--app52--" + bn + ".png").map((im) => nearest(im, 3)))), 12, 6)); }
    const ev = [...Object.values(record.before.combo2).map((d) => d.crops.map(Cb)), ...Object.values(record.combo2).map((d) => d.crops.map(C))].flat();
    if (ev.length) savePng(join(OUT, "ba-combo2-evidence.png"), grid(ev, 3, 8));
    writeFileSync(join(OUT, "index.html"), comparePage(record, names)); }
  record.approved = "nothing"; record.offered = "nothing: no combination is offered by this study"; record.visualIsNeverAutomatic = true;
  writeFileSync(join(OUT, "record.json"), JSON.stringify(record, null, 2) + "\n");
  if (!BEFORE) writeFileSync(join(OUT, "index.html"), page(record, names));
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

/** D-291: the private v1 | v2 page (local file; no network; it shows C). */
function comparePage(record, names) {
  const fails = (c) => Object.entries(c).filter(([, x]) => !x.ok).map(([b, x]) => b.replace("bottom-", "") + ": " + x.failed.join(", ")).join("; ") || "ingen";
  const per = (p) => p ? Object.entries(p).filter(([g]) => g !== "tongue").map(([g, x]) => g + " vol " + x.volumeL + " · korn " + x.grainL + " · streg " + x.lineContrastL).join("<br>") : "–";
  const rows = Object.keys(record.variants).map((n) => `<tr><td>${n}</td><td>${record.before.outfitChecks[n] ? fails(record.before.outfitChecks[n]) : "–"}</td><td>${record.variants[n].outfitChecks ? fails(record.variants[n].outfitChecks) : "–"}</td><td>${per(record.before.perceptual[n])}</td><td>${per(record.variants[n].perceptual)}</td></tr>`).join("");
  const cls = (d) => Object.entries(d).map(([id, x]) => `<tr><td>${id}</td><td>${x.flaggedPx}</td><td>${Object.entries(x.flaggedBy).map(([k, v]) => k + ": " + v).join("<br>")}</td><td>${Object.entries(x.between).map(([k, v]) => k + ": " + v).join("<br>")}</td></tr>`).join("");
  const img = (f, cap) => `<figure><img src="${f}" alt="${cap}"><figcaption>${cap}</figcaption></figure>`;
  return `<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Skomaster v1 og v2</title>
<style>:root{--bg:#f4f2ee;--fg:#1d1d1f;--mut:#5b5b60;--card:#fff;--line:#d9d5cc}@media (prefers-color-scheme:dark){:root{--bg:#18181a;--fg:#eee;--mut:#a5a5ab;--card:#232326;--line:#3a3a3e}}
body{margin:0;padding:16px;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif}h1{font-size:20px}h2{font-size:16px;margin-top:22px}p{max-width:72em}figure{margin:8px 0}figure img{max-width:100%;height:auto;border:1px solid var(--line)}figcaption{color:var(--mut);font-size:12px}
table{border-collapse:collapse}td,th{border:1px solid var(--line);padding:4px 8px;text-align:left;vertical-align:top;font-size:13px}.note{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px;max-width:72em}</style></head><body>
<h1>Skomaster v1 (D-289) og v2 (D-291) — privat før/efter</h1>
<p class="note">Privat og lokal; viser C og må ikke offentliggøres. Ingen sko er godkendt eller tilbudt. I hvert billedpar er venstre v1 og højre v2. Prøverne er SYNTETISKE. Kontrollens resultater er gengivet uændret; diagnosen er en assisteret vurdering og ændrer ikke et resultat.</p>
<h2>Kontroller og mål (OKLab L: volumen p95−p5, korn, stregkontrast)</h2><table><tr><th>Variant</th><th>Outfitfejl v1</th><th>Outfitfejl v2</th><th>v1</th><th>v2</th></tr>${rows}</table>
<h2>COMBO-2: kontrollens egne markerede pixels, klassificeret</h2><p>v1:</p><table><tr><th>Enhed</th><th>px</th><th>Markeret</th><th>Mellem (op til 4 px over skosiden)</th></tr>${cls(record.before.combo2)}</table>
<p>v2:</p><table><tr><th>Enhed</th><th>px</th><th>Markeret</th><th>Mellem</th></tr>${cls(record.combo2)}</table>
${img("ba-combo2-evidence.png", "Pr. udslag (v1 først, så v2): markerede pixels røde | færdigt outfit | rå skolag — 4×")}
<h2>Skolaget alene</h2>${img("ba-layers-x2--light.png", "Par v1|v2: original, selvgengivelse, kridt, koks, navy+hvid, bordeaux+gummi — lys")}${img("ba-layers-x2--dark.png", "Samme — mørk")}
<h2>Koksens tåkappe, snørebånd, sål (kridtsålen)</h2>${img("ba-toe--light.png", "Tåkappe 4× — lys")}${img("ba-toe--dark.png", "Tåkappe 4× — mørk")}${img("ba-laces--light.png", "Snørebånd 4× — lys")}${img("ba-laces--dark.png", "Snørebånd 4× — mørk")}${img("ba-sole--light.png", "Sål 3× — lys")}${img("ba-sole--dark.png", "Sål 3× — mørk")}
<h2>Bukse- og underdelsovergange (alle seks)</h2>${img("ba-hems-x2--light.png", "Rækker: varianter; par v1|v2 pr. underdel (nederdel, shorts, capri, oliven, navy, sand) — lys")}${img("ba-hems-x2--dark.png", "Samme — mørk")}
<h2>Appstørrelser</h2>${img("ba-app110--light.png", "110×165 faktisk, par v1|v2 — lys")}${img("ba-app110--dark.png", "Samme — mørk")}${img("ba-app52-x3--light.png", "52×78, 3× — lys")}${img("ba-app52-x3--dark.png", "Samme — mørk")}
</body></html>`;
}

function main() {
  const args = process.argv.slice(2), at = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), OUT = outDir(at("--out")), phase = at("--phase"), DWEBP = at("--dwebp"), version = at("--master") || "v1"; specOf(version);
  if (phase !== "sheets" && (!DWEBP || !existsSync(DWEBP))) throw new Error("--dwebp <the vendored dwebp>");
  if (phase === "layers") return phaseLayers(OUT, DWEBP, version, at("--history")); if (phase === "outfits") return phaseOutfits(OUT, DWEBP, version); if (phase === "sheets") return phaseSheets(OUT, version, at("--before"));
  throw new Error("--phase layers|outfits|sheets");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { try { main(); } catch (e) { console.error("REFUSED: " + e.message); process.exit(1); } }
