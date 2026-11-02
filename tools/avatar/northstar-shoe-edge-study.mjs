// D-293 — WHERE THE SHOE'S RASTER AND STEPS COME FROM (offline; no image call): the source (the item layer, the generation's own
// 1024x1536 pixels), shoe-master v1 (D-289), v2 (D-291) and the edge prototype v3 (SPEC_V3) measured APART, and the review chain:
//   edges     — per boundary class, from the drawing (v1's line detector and R1's outer contour, the same for every version): the outline's
//               inner flank, the inner lines' flanks, the borders between field groups. Over every 4-neighbour pair across such a border
//               (both opaque) the 4-pixel profile along it in OKLab: hardness = the largest single step / the whole change (1 = one hard
//               step, aliased; ~0.5 = spread over the antialiased pixels as drawn), and the share of hard steps (> 0.8); the source is the
//               reference;
//   alpha     — the silhouette's antialiasing (the share of its edge pixels at partial alpha): the source's, unchanged by every version;
//   grain     — apart from the edges (perceptualMeasures of the shoe study: the RMS of L minus its 6 px smoothing in the fields);
//   views     — the same regions (laces and eyelets, upper | toe, the collar, the sole's curve) of both shoes at 1:1, at 4x NEAREST (every
//               source pixel a 4x4 block: this is how the D-289/D-291 sheets showed them) and at 4x INTERPOLATED (a display aid; it adds
//               no detail), on a light and a dark background;
//   outfits   — v3's outfit check (the alpha is unchanged; the check is colour-dependent) with the cream tee over the six bottoms, and full
//               composites for the browser;
//   browser   — the composites shown by Chromium in an <img> at the app's sizes (110x165, 300x450 CSS px) at device pixel ratios 1, 2 and 3,
//               screenshot at device resolution: what the screen actually shows.
// Phases, each its own process (--expose-gc): layers | outfits | browser | sheets. --history <D-291 v1 dir> <D-291 v2 dir> requires v1
// and v2 to render exactly as D-291 recorded them. The views show C: --out must be outside the repository. Nothing here approves a shoe.
// Usage: node --expose-gc tools/avatar/northstar-shoe-edge-study.mjs --out <dir> --phase layers|outfits|browser|sheets --dwebp <dwebp.exe> [--history <v1 dir> <v2 dir>]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import http from "node:http";
import { encodePng, decodePng } from "./r3-hair-tool-v2.mjs";
import * as WR from "./northstar-wardrobe.mjs";
import * as BF from "./northstar-base-figure.mjs";
import * as BC from "./northstar-base-figure-c.mjs";
import * as IP from "./northstar-item-pilot.mjs";
import * as R1 from "./northstar-r1-garment.mjs";
import * as SM from "./northstar-shoe-master.mjs";
import { perceptualMeasures, TOP, BOTTOMS, PUBLISHED_BOTTOMS, BGS } from "./northstar-shoe-master-study.mjs";
import { loadItems } from "./build-northstar-runtime-assets.mjs";
import { flat, crop, grid, down } from "./northstar-wardrobe-poc.mjs";
import { decodeScreenshot } from "./r3-review-quiz.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", ".."), { W, N } = WR, H = N / W;
const sha = (b) => createHash("sha256").update(b).digest("hex");
// the source shoe's interior alpha is 247-254, never 255 (the extraction's): opaque here means >= 240
export const OPAQUE = 240;
export const VERSIONS = Object.freeze({ v1: SM.SPEC, v2: SM.SPEC_V2, v3: SM.SPEC_V3 });
export const REGIONS = Object.freeze({ "laces and eyelets L": [388, 1360, 440, 1425], "laces and eyelets R": [584, 1360, 636, 1425], "upper | toe L": [350, 1415, 470, 1460], "upper | toe R": [552, 1415, 672, 1460],
  "collar L": [380, 1352, 470, 1380], "collar R": [556, 1352, 646, 1380], "sole curve L": [336, 1440, 480, 1500], "sole curve R": [544, 1440, 688, 1500] });
export const BROWSER = Object.freeze({ sizes: [[110, 165], [300, 450]], dprs: [1, 2, 3], designs: ["original (beige, the item itself)", "dark charcoal (SYNTHETIC)", "contrast navy + white (SYNTHETIC)"], bottoms: ["bottom-shorts-navy", "bottom-trousers-square-sand"] });
const slug = (s) => s.split(" (")[0].replace(/[^a-z0-9|]+/gi, "-").replace(/\|/g, "x").toLowerCase();
const rss = () => Math.round(process.memoryUsage().rss / 1048576), gc = () => { if (typeof globalThis.gc === "function") globalThis.gc(); };
function outDir(OUT) { const r = relative(ROOT, resolve(OUT || ".")); if (!OUT || !(r.startsWith("..") || isAbsolute(r))) throw new Error("--out must be outside the repository (the views show C)"); mkdirSync(OUT, { recursive: true }); return OUT; }
const codeKey = () => sha(Buffer.concat([readFileSync(fileURLToPath(import.meta.url)), readFileSync(join(ROOT, "tools", "avatar", "northstar-shoe-master.mjs"))]));
const savePng = (f, im) => writeFileSync(f, encodePng(im.w, im.h, im.px)), loadPng = (f) => { const d = decodePng(readFileSync(f)); return { w: d.header.w, h: d.header.h, px: Uint8ClampedArray.from(d.px) }; };
const itemsSpec = () => JSON.parse(readFileSync(join(ROOT, "tools", "avatar", "fixtures", "northstar-wardrobe", "runtime-assets-inputs-d242.json"), "utf8")).items;

/** 4x by bilinear interpolation (a display aid: it smooths the blocks, it adds no detail). */
export function bilinear(im, k) { const w = im.w * k, h = im.h * k, o = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const sx = Math.max(0, Math.min(im.w - 1, (x + 0.5) / k - 0.5)), sy = Math.max(0, Math.min(im.h - 1, (y + 0.5) / k - 0.5)), x0 = Math.floor(sx), y0 = Math.floor(sy), x1 = Math.min(im.w - 1, x0 + 1), y1 = Math.min(im.h - 1, y0 + 1), fx = sx - x0, fy = sy - y0;
    for (let c = 0; c < 4; c++) { const p = (xx, yy) => im.px[(yy * im.w + xx) * 4 + c]; o[(y * w + x) * 4 + c] = Math.round(p(x0, y0) * (1 - fx) * (1 - fy) + p(x1, y0) * fx * (1 - fy) + p(x0, y1) * (1 - fx) * fy + p(x1, y1) * fx * fy); } }
  return { w, h, px: o }; }
const nearest = (im, k) => { const o = new Uint8ClampedArray(im.w * k * im.h * k * 4); for (let y = 0; y < im.h * k; y++) for (let x = 0; x < im.w * k; x++) o.set(im.px.subarray((((y / k) | 0) * im.w + ((x / k) | 0)) * 4, (((y / k) | 0) * im.w + ((x / k) | 0)) * 4 + 4), (y * im.w * k + x) * 4); return { w: im.w * k, h: im.h * k, px: o }; };

/** The edge measures of a shoe layer L against the drawing's classes (ink from v1's detector, the outer contour, the field groups). */
export function edgeMeasures(m, L) {
  const lab = new Float32Array(N * 3), op = (i) => L[i * 4 + 3] >= OPAQUE; for (let i = 0; i < N; i++) if (L[i * 4 + 3]) lab.set(SM.oklab([L[i * 4], L[i * 4 + 1], L[i * 4 + 2]]), i * 3);
  const dist = (a, b) => Math.hypot(lab[a * 3] - lab[b * 3], lab[a * 3 + 1] - lab[b * 3 + 1], lab[a * 3 + 2] - lab[b * 3 + 2]);
  const cls = { "outline flank": (i, j) => m.contour[i] !== m.contour[j], "inner line flank": (i, j) => !m.contour[i] && !m.contour[j] && m.ink[i] !== m.ink[j], "group border": (i, j) => m.group[i] !== m.group[j] };
  const acc = Object.fromEntries(Object.keys(cls).map((k) => [k, { n: 0, sum: 0, hard: 0 }]));
  for (let i = 0; i < N; i++) { if (!op(i)) continue; for (const u of [1, W]) { const j = i + u; if (j >= N || (u === 1 && j % W === 0) || !op(j) || !op(i - u) || !op(j + u)) continue;
      const p = [i - u, i, j, j + u], tot = dist(p[0], p[3]); if (tot < 0.04) continue; const h = Math.max(dist(p[0], p[1]), dist(p[1], p[2]), dist(p[2], p[3])) / tot;
      for (const [k, f] of Object.entries(cls)) if (f(i, j)) { const a = acc[k]; a.n++; a.sum += Math.min(1, h); if (h > 0.8) a.hard++; } } }
  return Object.fromEntries(Object.entries(acc).map(([k, a]) => [k, { pairs: a.n, hardness: a.n ? +(a.sum / a.n).toFixed(3) : null, hardShare: a.n ? +(a.hard / a.n).toFixed(3) : null }]));
}
/** A drawn line split at a border between two field groups: of the line's core pixels (inkness ≥ 0.9, by the source) that lie within
 *  blendRadius of two groups' fields, the share whose lightness differs by more than 0.15 from a core neighbour — a line that is dark
 *  on one side and grey on the other, so its thickness changes where the labelling divided it (the zigzag at a colour border). */
export function splitLines(m3, L) { const { w, other } = m3.edge; let n = 0, split = 0; const Lof = (i) => SM.oklab([L[i * 4], L[i * 4 + 1], L[i * 4 + 2]])[0];
  for (let i = W; i < N - W; i++) { if (w[i] < 0.9 || other[i] < 0 || L[i * 4 + 3] < OPAQUE) continue; n++; const li = Lof(i);
    if ([i - 1, i + 1, i - W, i + W].some((j) => w[j] >= 0.9 && L[j * 4 + 3] >= OPAQUE && Math.abs(Lof(j) - li) > 0.15)) split++; }
  return { corePx: n, splitShare: n ? +(split / n).toFixed(3) : null }; }
/** The silhouette's antialiasing by zone: the collar's top (y < 1385, where the extraction cut the shoe against C's ankle) and the rest. */
export function alphaZones(L) { const z = { "collar top": { e: 0, p: 0 }, "rest of the silhouette": { e: 0, p: 0 } };
  for (let i = W; i < N - W; i++) { const a = L[i * 4 + 3]; if (!a || (L[(i - 1) * 4 + 3] && L[(i + 1) * 4 + 3] && L[(i - W) * 4 + 3] && L[(i + W) * 4 + 3])) continue; const q = z[((i / W) | 0) < 1385 ? "collar top" : "rest of the silhouette"]; q.e++; if (a < OPAQUE) q.p++; }
  return Object.fromEntries(Object.entries(z).map(([k, q]) => [k, { edgePx: q.e, partialShare: +(q.p / q.e).toFixed(3) }])); }
/** The silhouette's antialiasing: of the shoe's edge pixels (an empty 4-neighbour), the share below OPAQUE. */
export function alphaEdge(L) { let e = 0, p = 0; for (let i = W; i < N - W; i++) { const a = L[i * 4 + 3]; if (!a) continue; if (!L[(i - 1) * 4 + 3] || !L[(i + 1) * 4 + 3] || !L[(i - W) * 4 + 3] || !L[(i + W) * 4 + 3]) { e++; if (a < OPAQUE) p++; } } return { edgePx: e, partialShare: +(p / e).toFixed(3) }; }

function sourceAndMasters() {
  const { P } = loadItems({ [SM.SPEC.source]: itemsSpec()[SM.SPEC.source] }), src = P[SM.SPEC.source].layers.shoes, t = R1.templateFromLayers({ shoes: src }, { category: "shoes", covering: "closed-footwear", cut: SM.SPEC.cut });
  return { src, P, masters: Object.fromEntries(Object.entries(VERSIONS).map(([v, s]) => [v, SM.buildShoeMaster(src, t, s)])) };
}
const variantsOf = (m1, src) => [["original (beige, the item itself)", null], ["self-reproduction (the original's own field colours)", SM.originalDesign(m1, src)], ...Object.entries(SM.designs())];

/** Phase 1: every version's layers, the history check, the edge, alpha and grain measures, the region views. */
function phaseLayers(OUT, HISTORY) {
  const mem = [["start", rss()]], { src, masters } = sourceAndMasters(), m1 = masters.v1; mem.push(["masters", rss()]);
  for (const d of ["layers", "crops"]) mkdirSync(join(OUT, d), { recursive: true });
  const hist = HISTORY ? { v1: JSON.parse(readFileSync(join(HISTORY[0], "layers.json"), "utf8")).layers, v2: JSON.parse(readFileSync(join(HISTORY[1], "layers.json"), "utf8")).layers } : null;
  const out = { key: codeKey(), alpha: { source: alphaEdge(src), zones: alphaZones(src) }, versions: {} };
  for (const [v, m] of Object.entries(masters)) { out.versions[v] = {};
    for (const [name, d] of variantsOf(m1, src)) { let L = d ? SM.renderShoe(m, src, d) : src; const png = encodePng(W, H, L), h = sha(png);
      if (hist && hist[v] && (!hist[v][name] || hist[v][name].sha256 !== h)) throw new Error(v + " " + name + ": not D-291's recorded rendering");
      let alphaSame = true; for (let i = 3; i < N * 4; i += 4) if (L[i] !== src[i]) { alphaSame = false; break; }
      const file = v + "--" + slug(name) + ".png"; writeFileSync(join(OUT, "layers", file), png);
      for (const [r, box] of Object.entries(REGIONS)) for (const [bn, bg] of Object.entries(BGS)) savePng(join(OUT, "crops", v + "--" + slug(name) + "--" + slug(r) + "--" + bn + ".png"), crop(flat(L, bg), box, 1));
      out.versions[v][name] = { file, sha256: h, ...(hist && hist[v] ? { asRecordedInD291: true } : {}), alphaEqualsSource: alphaSame, edges: edgeMeasures(m1, L), splitLines: splitLines(masters.v3, L), grain: Object.fromEntries(Object.entries(perceptualMeasures(m1, L)).map(([g, x]) => [g, x.grainL])) };
      L = null; gc(); mem.push([v + " " + slug(name), rss()]); } }
  out.memory = mem; writeFileSync(join(OUT, "layers.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(JSON.stringify({ phase: "layers", alpha: out.alpha, edges: Object.fromEntries(Object.entries(out.versions).map(([v, x]) => [v, Object.fromEntries(Object.entries(x).map(([n, e]) => [slug(n), Object.fromEntries(Object.entries(e.edges).map(([k, q]) => [k, q.hardness + "/" + q.hardShare]))]))])), peakMB: Math.max(...mem.map((x) => x[1])) }));
}

/** Phase 2: v3's outfit check (cream tee x six bottoms) and the composites the browser phase shows (v2 and v3, BROWSER's choice). */
function phaseOutfits(OUT, DWEBP) {
  const L0 = JSON.parse(readFileSync(join(OUT, "layers.json"), "utf8")); if (L0.key !== codeKey()) throw new Error("layers.json is from other code");
  const mem = [["start", rss()]], w = WR.buildWardrobe(), base = BC.prepareBase(w, Uint8ClampedArray.from(decodePng(IP.readC()).px)), items = itemsSpec();
  const { P } = loadItems(Object.fromEntries([TOP, SM.SPEC.source, ...BOTTOMS.filter((b) => !PUBLISHED_BOTTOMS.includes(b))].map((id) => [id, items[id]])));
  const tmp = join(OUT, "tmp-decode.png"); for (const b of PUBLISHED_BOTTOMS) { execDw(DWEBP, join(ROOT, "assets", "avatar-northstar", b + "-pants-v1.webp"), tmp); P[b] = { item: b, layers: { pants: Uint8ClampedArray.from(decodePng(readFileSync(tmp)).px) }, shadow: P["bottom-trousers-square-olive"].shadow, category: "bottom", covering: "none" }; }
  const shadow = P[SM.SPEC.source].shadow, min = BF.minimumItems(base.R, base.sep.lab); mkdirSync(join(OUT, "units"), { recursive: true }); mkdirSync(join(OUT, "composites"), { recursive: true }); mem.push(["env", rss()]);
  const composite = (shoes, b) => { const pr = BF.layerProof(w, base.R, base.Z, Object.assign({}, min, P[TOP].layers, P[b].layers, { shoes }), { sep: base.sep, headSeam: "d201", hide: BC.closedFootwearHidden(base, shoes), enclosure: "c-exterior" }); let c = pr.dressedRuntime; for (const s of [P[TOP].shadow, P[b].shadow, shadow]) if (s) c = IP.applyShadow(c, pr.stack, s); return c; };
  let done = 0, reused = 0;
  for (const [v, vs] of Object.entries(L0.versions)) for (const [name, x] of Object.entries(vs)) { if (name.startsWith("self")) continue;
    for (const b of BOTTOMS) { const id = v + "--" + slug(name) + "--" + b.replace("bottom-", ""), f = join(OUT, "units", id + ".json"), key = sha(L0.key + x.sha256 + b);
      const wantCheck = v === "v3", wantComp = BROWSER.designs.includes(name) && BROWSER.bottoms.includes(b) && (v !== "v1" || name.startsWith("original"));
      if (!wantCheck && !wantComp) continue; if (existsSync(f) && JSON.parse(readFileSync(f, "utf8")).key === key) { reused++; continue; }
      let shoes = loadPng(join(OUT, "layers", x.file)).px; const unit = { key, version: v, variant: name, bottom: b };
      if (wantCheck) { let r = R1.checkOutfit(w, base, [P[TOP], P[b], { category: "shoes", layers: { shoes }, covering: "closed-footwear", shadow }]); unit.ok = r.ok; unit.failed = r.failed; r = null; gc(); }
      if (wantComp) { let c = composite(shoes, b); const cf = id + ".png"; writeFileSync(join(OUT, "composites", cf), encodePng(W, H, flat(c, BGS.light))); unit.composite = cf;
        unit.app = {}; for (const [cw, ch] of BROWSER.sizes) { const fn = id + "--node-" + cw + "x" + ch + ".png"; savePng(join(OUT, "crops", fn), down(flat(c, BGS.light), cw, ch)); unit.app[cw + "x" + ch] = fn; } c = null; }
      shoes = null; gc(); unit.rssMB = rss(); mem.push([id, unit.rssMB]); writeFileSync(f, JSON.stringify(unit, null, 2) + "\n"); done++; } }
  writeFileSync(join(OUT, "memory-outfits.json"), JSON.stringify(mem, null, 2) + "\n");
  console.log(JSON.stringify({ phase: "outfits", units: done, reused, peakMB: Math.max(...mem.map((m) => m[1])) }));
}
import { execFileSync } from "node:child_process";
function execDw(DWEBP, from, to) { execFileSync(DWEBP, ["-quiet", from, "-o", to]); }

/** Phase 3: Chromium shows each composite in an <img> at the app sizes and device pixel ratios; the element is screenshot at device
 *  resolution. Also measured: the largest difference to Node's area-average downscale to the same device size. */
async function phaseBrowser(OUT) {
  const { chromium } = await import("@playwright/test"), units = Object.values(readUnits(OUT)).filter((u) => u.composite);
  const server = http.createServer((req, res) => { const f = join(OUT, "composites", decodeURIComponent(req.url.split("?")[0]).replace(/^\//, "")); if (!existsSync(f)) { res.writeHead(404); return res.end(); } res.writeHead(200, { "content-type": "image/png" }); res.end(readFileSync(f)); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r)); const port = server.address().port, browser = await chromium.launch(), result = [];
  mkdirSync(join(OUT, "browser"), { recursive: true });
  try { for (const u of units) for (const [cw, ch] of BROWSER.sizes) for (const dpr of BROWSER.dprs) {
      const ctx = await browser.newContext({ deviceScaleFactor: dpr, viewport: { width: cw + 20, height: ch + 20 } }), p = await ctx.newPage();
      await p.setContent(`<!doctype html><body style="margin:0;padding:10px;background:rgb(${BGS.light.join(",")})"><img id="a" src="http://127.0.0.1:${port}/${u.composite}" style="width:${cw}px;height:${ch}px;display:block"></body>`);
      await p.waitForFunction(() => document.getElementById("a").complete && document.getElementById("a").naturalWidth > 0);
      const buf = await (await p.$("#a")).screenshot({ animations: "disabled" }), f = u.composite.replace(".png", "--browser-" + cw + "x" + ch + "-dpr" + dpr + ".png"); writeFileSync(join(OUT, "browser", f), buf);
      const got = decodeScreenshot(buf), ref = down(loadPng(join(OUT, "composites", u.composite)).px, got.w, got.h); let mx = 0, over = 0;
      for (let i = 0; i < ref.px.length; i += 4) { const dd = Math.max(...[0, 1, 2].map((c) => Math.abs(got.px[i + c] - ref.px[i + c]))); mx = Math.max(mx, dd); if (dd > 24) over++; }
      result.push({ composite: u.composite, css: [cw, ch], dpr, device: [got.w, got.h], file: f, maxDiffToAreaAverage: mx, pxOver24: over }); await ctx.close(); } }
  finally { await browser.close(); server.close(); }
  writeFileSync(join(OUT, "browser.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({ phase: "browser", shots: result.length, worst: result.reduce((a, r) => Math.max(a, r.maxDiffToAreaAverage), 0) }));
}
function readUnits(OUT) { const L0 = JSON.parse(readFileSync(join(OUT, "layers.json"), "utf8")), u = {};
  for (const [v, vs] of Object.entries(L0.versions)) for (const [name, x] of Object.entries(vs)) for (const b of BOTTOMS) { const id = v + "--" + slug(name) + "--" + b.replace("bottom-", ""), f = join(OUT, "units", id + ".json"); if (!existsSync(f)) continue; const q = JSON.parse(readFileSync(f, "utf8")); if (q.key !== sha(L0.key + x.sha256 + b)) throw new Error("stale unit " + id); u[id] = q; }
  return u; }

/** Phase 4: the sheets, the record, the private page. */
function phaseSheets(OUT) {
  const L0 = JSON.parse(readFileSync(join(OUT, "layers.json"), "utf8")), units = readUnits(OUT), br = existsSync(join(OUT, "browser.json")) ? JSON.parse(readFileSync(join(OUT, "browser.json"), "utf8")) : [];
  const C = (f) => loadPng(join(OUT, "crops", f)), names = Object.keys(L0.versions.v1), vs = Object.keys(L0.versions);
  // per region and background: rows = variants, columns = source | v1 | v2 | v3, each at 1:1, 4x nearest, 4x interpolated
  for (const r of Object.keys(REGIONS)) for (const bn of Object.keys(BGS)) { const tiles = [];
    for (const n of names.filter((x) => !x.startsWith("self"))) for (const v of vs) { const im = C(v + "--" + slug(n) + "--" + slug(r) + "--" + bn + ".png"); tiles.push(nearest(im, 4)); }
    savePng(join(OUT, "edge-" + slug(r) + "--" + bn + "--x4-nearest.png"), grid(tiles, vs.length, 6));
    savePng(join(OUT, "edge-" + slug(r) + "--" + bn + "--x4-interpolated.png"), grid(names.filter((x) => !x.startsWith("self")).flatMap((n) => vs.map((v) => bilinear(C(v + "--" + slug(n) + "--" + slug(r) + "--" + bn + ".png"), 4))), vs.length, 6));
    savePng(join(OUT, "edge-" + slug(r) + "--" + bn + "--1to1.png"), grid(names.filter((x) => !x.startsWith("self")).flatMap((n) => vs.map((v) => C(v + "--" + slug(n) + "--" + slug(r) + "--" + bn + ".png"))), vs.length, 4)); }
  // the browser at device resolution (no zoom): per design and bottom, 110x165 at DPR 1, 2, 3 for v2 | v3 (v1 for the original)
  const B = (f) => { const d = decodeScreenshot(readFileSync(join(OUT, "browser", f))); return { w: d.w, h: d.h, px: d.px }; }, comp = (v, n, b) => v + "--" + slug(n) + "--" + b.replace("bottom-", "") + ".png";
  for (const b of BROWSER.bottoms) for (const n of BROWSER.designs) { const vv = n.startsWith("original") ? ["v1"] : ["v2", "v3"];
    savePng(join(OUT, "browser-110--" + slug(n) + "--" + b.replace("bottom-", "") + ".png"), grid(vv.flatMap((v) => BROWSER.dprs.map((dpr) => B(comp(v, n, b).replace(".png", "--browser-110x165-dpr" + dpr + ".png")))), BROWSER.dprs.length, 12));
    const shoes = vv.map((v) => { const d = B(comp(v, n, b).replace(".png", "--browser-300x450-dpr2.png")), x0 = Math.round(d.w * 330 / 1024), y0 = Math.round(d.h * 1290 / 1536), x1 = Math.round(d.w * 694 / 1024), y1 = Math.round(d.h * 1510 / 1536), w = x1 - x0, h = y1 - y0, o = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y++) o.set(d.px.subarray(((y0 + y) * d.w + x0) * 4, ((y0 + y) * d.w + x1) * 4), y * w * 4); return { w, h, px: o }; });
    savePng(join(OUT, "browser-300-dpr2-shoes--" + slug(n) + "--" + b.replace("bottom-", "") + ".png"), grid(shoes, shoes.length, 12)); }
  const record = { decision: "D-293", alpha: L0.alpha, versions: Object.fromEntries(Object.entries(L0.versions).map(([v, x]) => [v, Object.fromEntries(Object.entries(x).map(([n, e]) => [n, { sha256: e.sha256, asRecordedInD291: e.asRecordedInD291, alphaEqualsSource: e.alphaEqualsSource, edges: e.edges, splitLines: e.splitLines, grain: e.grain }]))])),
    v3OutfitChecks: Object.fromEntries(Object.values(units).filter((u) => u.version === "v3" && "ok" in u).map((u) => [slug(u.variant) + "+" + u.bottom.replace("bottom-", ""), { ok: u.ok, failed: u.failed }])), browser: br, approved: "nothing", visualIsNeverAutomatic: true };
  writeFileSync(join(OUT, "record.json"), JSON.stringify(record, null, 2) + "\n");
  writeFileSync(join(OUT, "index.html"), page(record));
  console.log(JSON.stringify({ phase: "sheets", v3Fails: Object.entries(record.v3OutfitChecks).filter(([, c]) => !c.ok).map(([k, c]) => k + ":" + c.failed.join("|")) }));
}

/** The private page (local file; no network; it shows C). */
function page(rec) {
  const vs = Object.keys(rec.versions), names = Object.keys(rec.versions.v1).filter((n) => !n.startsWith("self"));
  const e = (x, k) => x.edges[k].hardness + " / " + Math.round(x.edges[k].hardShare * 100) + " %";
  const rows = names.map((n) => "<tr><td>" + n + "</td>" + ["outline flank", "inner line flank", "group border"].map((k) => "<td>" + vs.map((v) => v + ": " + e(rec.versions[v][n], k)).join("<br>") + "</td>").join("") + "<td>" + vs.map((v) => v + ": " + Math.round(rec.versions[v][n].splitLines.splitShare * 100) + " %").join("<br>") + "</td>" + "<td>" + vs.map((v) => v + ": " + (rec.versions[v][n].grain.upper ?? "–")).join("<br>") + "</td></tr>").join("");
  const img = (f, cap) => '<figure><img src="' + f + '" alt="' + cap + '"><figcaption>' + cap + "</figcaption></figure>";
  const reg = (r, cap) => "<h3>" + cap + "</h3>" + ["light", "dark"].map((bn) => img("edge-" + slug(r) + "--" + bn + "--1to1.png", "1:1 (faktiske pixels) — " + bn) + img("edge-" + slug(r) + "--" + bn + "--x4-nearest.png", "4× NÆRMESTE NABO (hver kildepixel en 4×4-blok, som D-289/D-291-arkene) — " + bn) + img("edge-" + slug(r) + "--" + bn + "--x4-interpolated.png", "4× INTERPOLERET (visningshjælp; tilføjer ingen detalje) — " + bn)).join("");
  const br = BROWSER.bottoms.flatMap((b) => BROWSER.designs.map((n) => img("browser-110--" + slug(n) + "--" + b.replace("bottom-", "") + ".png", n + " + " + b + ": 110×165 i Chromium ved DPR 1, 2, 3 (" + (n.startsWith("original") ? "v1" : "øverst v2, nederst v3") + "), skærmpixels uden forstørrelse") + img("browser-300-dpr2-shoes--" + slug(n) + "--" + b.replace("bottom-", "") + ".png", n + " + " + b + ": skoene ved 300×450, DPR 2, skærmpixels (" + (n.startsWith("original") ? "v1" : "v2 | v3") + ")"))).join("");
  return '<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Skoens raster og kanter</title><style>:root{--bg:#f4f2ee;--fg:#1d1d1f;--mut:#5b5b60;--card:#fff;--line:#d9d5cc}@media (prefers-color-scheme:dark){:root{--bg:#18181a;--fg:#eee;--mut:#a5a5ab;--card:#232326;--line:#3a3a3e}}body{margin:0;padding:16px;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif}h1{font-size:20px}h2{font-size:16px;margin-top:22px}h3{font-size:14px}figure{margin:8px 0}figure img{max-width:100%;height:auto;border:1px solid var(--line);image-rendering:pixelated}figcaption{color:var(--mut);font-size:12px}table{border-collapse:collapse}td,th{border:1px solid var(--line);padding:4px 8px;text-align:left;vertical-align:top;font-size:13px}.note{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px;max-width:72em}</style></head><body>'
    + '<h1>Skoens raster og kanter (D-293) — privat</h1><p class="note">Privat og lokal; viser C. Ingen sko er godkendt. Kolonner i nærbillederne: v1 | v2 | v3-prototype; rækker: original, kridt, koks, navy+hvid, bordeaux+gummi. Kildens silhuet: ' + rec.alpha.source.partialShare * 100 + ' % af kantpixels delvist gennemsigtige (kantudjævnet); kravens top: ' + Math.round(rec.alpha.zones["collar top"].partialShare * 100) + ' %, resten: ' + Math.round(rec.alpha.zones["rest of the silhouette"].partialShare * 100) + ' %. Grønne geometritests er ikke en visuel godkendelse.</p>'
    + '<h2>Kantmål (hårdhed / andel hårde trin; kilden = originalens række) og kornethed (overdel)</h2><table><tr><th>Variant</th><th>Konturens inderkant</th><th>Indre stregers kanter</th><th>Feltgrænser</th><th>Delte streger ved farvegrænser</th><th>Kornethed</th></tr>' + rows + "</table>"
    + "<h2>Nærbilleder (begge sko)</h2>" + reg("laces and eyelets L", "Snørebånd og snørehuller, venstre sko") + reg("laces and eyelets R", "Snørebånd og snørehuller, højre sko") + reg("upper | toe L", "Overdel | tåkappe, venstre") + reg("upper | toe R", "Overdel | tåkappe, højre") + reg("collar L", "Krave, venstre") + reg("collar R", "Krave, højre") + reg("sole curve L", "Sålens kurve, venstre") + reg("sole curve R", "Sålens kurve, højre")
    + "<h2>Faktisk browservisning</h2>" + br + "</body></html>";
}

async function main() {
  const args = process.argv.slice(2), at = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), OUT = outDir(at("--out")), phase = at("--phase");
  const hi = args.indexOf("--history"), HISTORY = hi >= 0 ? [args[hi + 1], args[hi + 2]] : null;
  if (phase === "layers") return phaseLayers(OUT, HISTORY); if (phase === "outfits") return phaseOutfits(OUT, at("--dwebp")); if (phase === "browser") return phaseBrowser(OUT); if (phase === "sheets") return phaseSheets(OUT);
  throw new Error("--phase layers|outfits|browser|sheets");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error("REFUSED: " + e.message); process.exit(1); });
