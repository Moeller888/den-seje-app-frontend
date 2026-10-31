// D-281 — THE RUNTIME LAYERS OF THE SOLID TROUSERS THE OWNER APPROVED AS CANDIDATES (D-279), prepared PRIVATELY (no image call;
// nothing published; the runtime is not changed). Reads ONLY ps-candidates-v1.json: a variant that is not a candidate is never built.
//   --phase layers  1. the lock: the pants master module and the tee master's render by the sha256 the candidate file pins, D-279's
//                      private study record and layer list by theirs;
//                   2. the layers: each candidate rendered again through pants-master-v2 (renderPants) and required to be D-279's
//                      rendering exactly (the PNG sha256 the candidate file and the study pin, and the study's own PNG pixel for pixel);
//                      its alpha equal to the published olive trousers' (the same cut, so the same fit);
//                   3. the shadow: the candidate's skin shadow is the cut's, verified identical to the published olive trousers' shadow
//                      file (reused through shadowsOf, never republished);
//                   4. the runtime equivalence (D-242's check, in memory, one top at a time): buildLayerSet composes each candidate
//                      with every top the opt-in can show — the blue and cream tees and the 16 approved print tees — and each of the four
//                      shoes through northstarPlanFor + northstarCompose (the browser's functions) and requires the pipeline composite
//                      byte for byte; every built file that is published must decode to exactly the pipeline's pixels;
//                   5. the files: only the candidates' pants layers as lossless WebP 1024x1536 into <out>/staging (the exact list a
//                      publication permission would cover).
//   --phase outfits the outfit check (R1.checkOutfit, the geometry) of every candidate x top x shoe, one unit at a time (resumable), and
//                   the private review crops of every top x candidate with the white sneakers (app size, waist) on light and dark;
//   --phase pack    the review sheets, a private index.html, the advisory colour distance between each top and each candidate
//                   (OKLab, D-271's thresholds — the drawn hem line separates them whatever the distance), and the staging manifest.
// MEMORY: as D-279's study — each phase its own process, one unit at a time, run with --expose-gc. The crops show C: --out must be
// outside the repository. Nothing here approves an item; the visual review is never automatic.
// Usage: node --expose-gc tools/avatar/build-northstar-pants-solid-layers.mjs --out <private dir> --phase layers|outfits|pack --cwebp <cwebp.exe> --dwebp <dwebp.exe>
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { homedir, tmpdir } from "node:os";
import { encodePng, decodePng } from "./r3-hair-tool-v2.mjs";
import * as WR from "./northstar-wardrobe.mjs";
import * as BC from "./northstar-base-figure-c.mjs";
import * as BF from "./northstar-base-figure.mjs";
import * as IP from "./northstar-item-pilot.mjs";
import * as R1 from "./northstar-r1-garment.mjs";
import * as EV from "./northstar-r1-evaluate.mjs";
import * as PM from "./northstar-pants-master.mjs";
import * as V from "./northstar-tee-print-validation.mjs";
import { loadItems, buildLayerSet, writeLayerSet } from "./build-northstar-runtime-assets.mjs";
import { flat, crop, grid, down } from "./northstar-wardrobe-poc.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", ".."), { W, N } = WR, H = N / W;
const ART = join(homedir(), "Documents", "DenSejeApp-artefacts"), PUB = join(ROOT, "assets", "avatar-northstar");
const sha = (b) => createHash("sha256").update(b).digest("hex");
export const CANDIDATES = "tools/avatar/fixtures/northstar-wardrobe/pants-master/ps-candidates-v1.json";
export const PLAIN_TOPS = Object.freeze(["top-tee-hip-blue", "top-tee-hip-cream"]);
export const SHOES = Object.freeze(["shoes-sneakers-white", "shoes-ankleboots-brown", "shoes-sneakers-beige", "shoes-boots-laceup-black"]);
/** The proposed runtime item table entry: the olive trousers' shape (the same cut), its published skin shadow reused. */
export const ITEM_SHAPE = Object.freeze({ category: "bottom", layers: ["pants"], shadows: ["body"] });
export const SHADOW_OF = PM.SPEC.source;
export const BGS = Object.freeze({ light: [236, 233, 226], dark: [24, 26, 40] });
export const WAIST = Object.freeze([370, 700, 654, 880]);
const rss = () => Math.round(process.memoryUsage().rss / 1048576), gc = () => { if (typeof globalThis.gc === "function") globalThis.gc(); };
const json = (rel) => JSON.parse(readFileSync(join(ROOT, ...rel.split("/")), "utf8"));
const savePng = (f, im) => writeFileSync(f, encodePng(im.w, im.h, im.px)), loadPng = (f) => { const d = decodePng(readFileSync(f)); return { w: d.header.w, h: d.header.h, px: Uint8ClampedArray.from(d.px) }; };
const short = (id) => id.replace("top-tee-hip-print-", "p-").replace("top-tee-hip-", "tee-").replace("bottom-trousers-square-", "ts-").replace("shoes-", "");
const uidOf = (pants, top, sh) => short(pants) + "--" + short(top) + "--" + short(sh);

/** The candidates, checked against the pinned modules and D-279's private study: refuses anything else. */
export function candidatesOf(c, { pantsModuleSha, renderModuleSha, recordSha, layersSha, studyLayers }) {
  const p = [];
  if (c.master.revision !== PM.SPEC_V2.revision) p.push("the master is not pants-master-v2");
  if (c.master.moduleSha256 !== pantsModuleSha) p.push("the pants master module is not the pinned one");
  if (c.master.renderModuleSha256 !== renderModuleSha) p.push("the tee master's render is not the pinned one");
  if (recordSha !== undefined && c.study.recordSha256 !== recordSha) p.push("D-279's study record is not the pinned one");
  if (layersSha !== undefined && c.study.layersSha256 !== layersSha) p.push("D-279's layer list is not the pinned one");
  const ids = Object.keys(c.candidates || {}); if (!ids.length) p.push("no candidates");
  for (const id of ids) { const k = c.candidates[id];
    if (!/^TS-[A-Z]{3}$/.test(id)) p.push("not an ID: " + id);
    if (!/^bottom-trousers-square-[a-z]+$/.test(k.item) || k.item === SHADOW_OF) p.push(id + ": not a new trousers-square item");
    if (!/^solid /.test(k.variant)) p.push(id + ": not a solid variant");
    if (Object.prototype.hasOwnProperty.call(c.notCandidates || {}, k.variant)) p.push(id + ": its variant is not a candidate");
    if (studyLayers) { const s = studyLayers[k.variant]; if (!s || s.sha256 !== k.layerPngSha256 || !s.alphaEqualsCut) p.push(id + ": not D-279's rendering"); } }
  if (p.length) throw new Error(p.join("; "));
  return ids.map((id) => ({ id, ...c.candidates[id] }));
}

function outDir(OUT) { const r = relative(ROOT, resolve(OUT || ".")); if (!OUT || !(r.startsWith("..") || isAbsolute(r))) throw new Error("--out must be outside the repository (unpublished layers and crops stay private)"); mkdirSync(OUT, { recursive: true }); return OUT; }
const codeKey = () => sha(Buffer.concat([readFileSync(fileURLToPath(import.meta.url)), readFileSync(join(ROOT, ...CANDIDATES.split("/")))]));
function env() { const w = WR.buildWardrobe(), base = BC.prepareBase(w, Uint8ClampedArray.from(decodePng(IP.readC()).px)), T = BC.templatesC(w, base, { revision: "d213" }); return { w, base, T }; }
function lock() {
  const c = json(CANDIDATES), sd = join(ART, "d-277-pants-v2"), layersBuf = readFileSync(join(sd, "layers.json"));
  const list = candidatesOf(c, { pantsModuleSha: sha(readFileSync(join(ROOT, "tools", "avatar", "northstar-pants-master.mjs"))), renderModuleSha: sha(readFileSync(join(ROOT, "tools", "avatar", "northstar-tee-master.mjs"))),
    recordSha: sha(readFileSync(join(sd, "record.json"))), layersSha: sha(layersBuf), studyLayers: JSON.parse(layersBuf.toString("utf8")).layers });
  return { c, list, sd };
}
/** The published file decoded (lossless WebP → RGBA). */
function decoder(DWEBP) {
  const tmp = join(tmpdir(), "d281-" + process.pid); mkdirSync(tmp, { recursive: true });
  return { dec: (f) => { const o = join(tmp, "x.png"); execFileSync(DWEBP, ["-quiet", join(PUB, f), "-o", o]); return Uint8ClampedArray.from(decodePng(readFileSync(o)).px); }, done: () => rmSync(tmp, { recursive: true, force: true }) };
}
const sameBytes = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
const sameAlpha = (a, b) => { for (let i = 3; i < a.length; i += 4) if (a[i] !== b[i]) return false; return true; };

/** Phase 1: the candidates' layers (checked against D-279), the runtime equivalence, the staged WebP files. */
async function phaseLayers(OUT, CWEBP, DWEBP) {
  const AL = await import(pathToFileURL(join(ROOT, "js", "avatar-layers.js")).href), { list, sd } = lock(), mem = [["start", rss()]];
  const man = JSON.parse(readFileSync(join(PUB, "manifest.json"), "utf8")); for (const f of man.files) if (sha(readFileSync(join(PUB, f.file))) !== f.sha256) throw new Error("not the manifest's bytes: " + f.file);
  const published = new Set(man.files.map((f) => f.file)), D = decoder(DWEBP);
  try {
    const E = env(), { t, src } = EV.templateOf(E, "bottom"), master = PM.buildPantsMaster(t, src, PM.SPEC_V2); mem.push(["master", rss()]);
    const spec = json("tools/avatar/fixtures/northstar-wardrobe/runtime-assets-inputs-d242.json"), loaded = loadItems(Object.fromEntries([SHADOW_OF, ...PLAIN_TOPS, ...SHOES].map((id) => [id, spec.items[id]])));
    const olive = loaded.P[SHADOW_OF]; if (!sameBytes(olive.layers.pants, src.layers.pants) || !sameBytes(olive.shadow, src.shadow)) throw new Error("the runtime olive trousers are not the cut's item");
    const P = { ...loaded.P }, origin = { ...loaded.origin }, layerChecks = {};
    for (const k of list) { const L = PM.renderPants(master, t, E.base, { body: k.rgb }).layer, png = encodePng(W, H, L), study = loadPng(join(sd, "layers", slugOf(k.variant) + ".png"));
      const ck = { pngAsCandidate: sha(png) === k.layerPngSha256, pixelsAsStudy: sameBytes(study.px, L), alphaAsOlive: sameAlpha(L, olive.layers.pants) };
      const bad = Object.entries(ck).filter(([, v]) => !v).map(([n]) => n); if (bad.length) throw new Error(k.id + ": " + bad.join(", "));
      layerChecks[k.id] = { item: k.item, ...ck, pantsSha256: sha(L) };
      P[k.item] = { item: k.item, layers: { pants: L }, shadow: olive.shadow, category: "bottom", covering: "none" };
      origin[k.item] = { decision: "D-281 " + k.id, method: "pants-master-v2 (D-279) renderPants, solid " + JSON.stringify(k.rgb), layerPngSha256: k.layerPngSha256 }; }
    mem.push(["layers", rss()]);
    const tees = Object.values(AL.NORTHSTAR_PRINT_TEES).map((x) => x.item), tops = [...PLAIN_TOPS, ...tees], equivalence = {}, comparedPublished = new Set(); let staged = null;
    const shadowPub = D.dec(SHADOW_OF + "-shadow-body-v1.webp");
    for (const top of tops) {
      const Q = { [top]: P[top] || { item: top, layers: { topBody: D.dec(top + "-top-body-v1.webp"), sleeves: D.dec(top + "-sleeves-v1.webp") }, shadow: P[AL.NORTHSTAR_PRINT_TEE_BASE].shadow, category: "top", covering: "none" } };
      const O = { [top]: origin[top] || { decision: "D-274", published: "assets/avatar-northstar/" } };
      for (const id of [...list.map((k) => k.item), ...SHOES]) { Q[id] = P[id]; O[id] = origin[id]; }
      const outfits = list.flatMap((k) => SHOES.map((sh) => [uidOf(k.item, top, sh), { top, bottom: k.item, shoes: sh }]));
      const set = buildLayerSet({ P: Q, origin: O, outfits, figureNames: AL.NORTHSTAR_FIGURE, planOf: (o, tb) => AL.northstarPlanFor(o, tb), compose: AL.northstarCompose });
      for (const k of list) { if (JSON.stringify(set.itemTable[k.item]) !== JSON.stringify(ITEM_SHAPE)) throw new Error(k.id + ": item table " + JSON.stringify(set.itemTable[k.item]));
        if (!sameBytes(set.files[k.item + "-shadow-body-v1.webp"].px, shadowPub)) throw new Error(k.id + ": its shadow is not the published olive trousers' shadow"); }
      for (const [name, f] of Object.entries(set.files)) { if (!published.has(name) || comparedPublished.has(name)) continue; if (!sameBytes(D.dec(name), f.px)) throw new Error(name + ": the published file differs from the pipeline"); comparedPublished.add(name); }
      Object.assign(equivalence, set.equivalence);
      if (!staged) staged = Object.fromEntries(list.map((k) => [k.item + "-pants-v1.webp", { ...set.files[k.item + "-pants-v1.webp"], purpose: "the pants layer of " + k.item + " (" + k.id + ", owner-approved candidate D-279; prepared D-281)" }]));
      mem.push([short(top), rss()]); gc(); }
    const notPublished = [...Object.keys(staged)].filter((n) => published.has(n)); if (notPublished.length) throw new Error("already published: " + notPublished.join(", "));
    const entries = writeLayerSet(staged, join(OUT, "staging"), { cwebp: CWEBP, dwebp: DWEBP });
    const out = { key: codeKey(), layerChecks, shadowReuse: { publishedFile: "assets/avatar-northstar/" + SHADOW_OF + "-shadow-body-v1.webp", sha256: sha(readFileSync(join(PUB, SHADOW_OF + "-shadow-body-v1.webp"))), identicalForAll: true },
      equivalence: { what: "northstarCompose(northstarPlanFor({ top, candidate, shoes })) against the pipeline composite (layerProof + applyShadow), RGBA bytes that differ; every top the opt-in can show (blue, cream, the 16 approved print tees) x the four shoes", outfits: Object.keys(equivalence).length, outfitsDiffering: Object.values(equivalence).filter((e) => e.bytesDiffering).length, byOutfit: equivalence },
      publishedFilesIdenticalToPipeline: [...comparedPublished].sort(), files: entries, memory: mem };
    writeFileSync(join(OUT, "layers.json"), JSON.stringify(out, null, 2) + "\n");
    console.log(JSON.stringify({ phase: "layers", candidates: list.length, outfits: out.equivalence.outfits, differing: out.equivalence.outfitsDiffering, publishedCompared: comparedPublished.size, files: entries.map((e) => [e.file, e.sha256, e.bytes]), peakMB: Math.max(...mem.map((m) => m[1])) }));
  } finally { D.done(); }
}
const slugOf = (s) => s.split(" (")[0].replace(/[^a-z0-9]+/gi, "-").toLowerCase();

/** Phase 2: the outfit check of every candidate x top x shoe, and the review crops (white sneakers), one unit at a time. */
async function phaseOutfits(OUT, DWEBP) {
  const AL = await import(pathToFileURL(join(ROOT, "js", "avatar-layers.js")).href), { list } = lock(), L0 = JSON.parse(readFileSync(join(OUT, "layers.json"), "utf8"));
  if (L0.key !== codeKey()) throw new Error("layers.json is from other code: run --phase layers again");
  const mem = [["start", rss()]], E = env(), { w, base } = E, spec = json("tools/avatar/fixtures/northstar-wardrobe/runtime-assets-inputs-d242.json");
  const { P } = loadItems(Object.fromEntries([SHADOW_OF, ...PLAIN_TOPS, ...SHOES].map((id) => [id, spec.items[id]]))), min = BF.minimumItems(base.R, base.sep.lab), D = decoder(DWEBP);
  mkdirSync(join(OUT, "units"), { recursive: true }); mkdirSync(join(OUT, "crops"), { recursive: true });
  let done = 0, reused = 0;
  try {
    const pants = {}; for (const k of list) { pants[k.item] = decodeStaged(join(OUT, "staging", k.item + "-pants-v1.webp"), DWEBP); if (sha(pants[k.item]) !== L0.layerChecks[k.id].pantsSha256) throw new Error(k.id + ": the staged layer changed"); }
    const tees = Object.values(AL.NORTHSTAR_PRINT_TEES).map((x) => x.item);
    for (const top of [...PLAIN_TOPS, ...tees]) {
      let T = P[top] || { item: top, layers: { topBody: D.dec(top + "-top-body-v1.webp"), sleeves: D.dec(top + "-sleeves-v1.webp") }, shadow: P[AL.NORTHSTAR_PRINT_TEE_BASE].shadow, category: "top", covering: "none" };
      for (const k of list) for (const sh of SHOES) {
        const id = uidOf(k.item, top, sh), f = join(OUT, "units", id + ".json"), key = sha(L0.key + L0.layerChecks[k.id].pantsSha256 + top + sh);
        if (existsSync(f) && JSON.parse(readFileSync(f, "utf8")).key === key) { reused++; continue; }
        const B = { category: "bottom", layers: { pants: pants[k.item] }, covering: "none", shadow: P[SHADOW_OF].shadow };
        let r = R1.checkOutfit(w, base, [T, B, P[sh]]); const unit = { key, candidate: k.id, top, shoes: sh, ok: r.ok, failed: r.failed, crops: [] }; r = null; gc();
        if (sh === "shoes-sneakers-white") {
          const pr = BF.layerProof(w, base.R, base.Z, Object.assign({}, min, T.layers, B.layers, P[sh].layers), { sep: base.sep, headSeam: "d201", hide: BC.closedFootwearHidden(base, P[sh].layers.shoes), enclosure: "c-exterior" });
          let c = pr.dressedRuntime; for (const s of [T.shadow, B.shadow, P[sh].shadow]) if (s) c = IP.applyShadow(c, pr.stack, s);
          for (const [bn, bg] of Object.entries(BGS)) { const fl = flat(c, bg), put = (tag, im) => { const file = id + "--" + tag + ".png"; savePng(join(OUT, "crops", file), im); unit.crops.push(file); };
            put("app110--" + bn, down(fl, 110, 165)); put("waist--" + bn, crop(fl, WAIST, 2)); }
          c = null; gc(); }
        unit.rssMB = rss(); mem.push([id, unit.rssMB]); writeFileSync(f, JSON.stringify(unit, null, 2) + "\n"); done++; }
      T = null; gc(); }
  } finally { D.done(); }
  writeFileSync(join(OUT, "memory-outfits.json"), JSON.stringify(mem, null, 2) + "\n");
  console.log(JSON.stringify({ phase: "outfits", units: done, reused, peakMB: Math.max(...mem.map((m) => m[1])) }));
}
function decodeStaged(file, DWEBP) { const tmp = join(tmpdir(), "d281s-" + process.pid + ".png"); try { execFileSync(DWEBP, ["-quiet", file, "-o", tmp]); return Uint8ClampedArray.from(decodePng(readFileSync(tmp)).px); } finally { rmSync(tmp, { force: true }); } }

/** The median colour of a layer's opaque pixels (the item layers' interior alpha is 250–254, not 255). */
function medianRgb(L) { const c = [[], [], []]; for (let i = 0; i < L.length / 4; i++) if (L[i * 4 + 3] >= 250) for (let k = 0; k < 3; k++) c[k].push(L[i * 4 + k]); return c.map((a) => a.sort((x, y) => x - y)[a.length >> 1]); }
export function contrastClass(de) { return de >= V.CONTRAST.strongDE ? "clear" : de >= V.CONTRAST.seenDE ? "borderline" : "weak"; }

/** Phase 3: the sheets, the advisory colour distance, the private page and the staging manifest. */
async function phasePack(OUT, DWEBP) {
  const AL = await import(pathToFileURL(join(ROOT, "js", "avatar-layers.js")).href), { c, list } = lock(), L0 = JSON.parse(readFileSync(join(OUT, "layers.json"), "utf8"));
  if (L0.key !== codeKey()) throw new Error("layers.json is from other code");
  const tees = Object.values(AL.NORTHSTAR_PRINT_TEES).map((x) => x.item), tops = [...PLAIN_TOPS, ...tees], units = {};
  for (const k of list) for (const top of tops) for (const sh of SHOES) { const id = uidOf(k.item, top, sh), f = join(OUT, "units", id + ".json"); if (!existsSync(f)) throw new Error("missing unit " + id + ": run --phase outfits");
    const u = JSON.parse(readFileSync(f, "utf8")); if (u.key !== sha(L0.key + L0.layerChecks[k.id].pantsSha256 + top + sh)) throw new Error("stale unit " + id); units[id] = u; }
  const D = decoder(DWEBP), topRgb = {};
  try { for (const top of tops) topRgb[top] = medianRgb(D.dec(top + "-top-body-v1.webp")); } finally { D.done(); }
  const contrast = {}; for (const top of tops) for (const k of list) { const de = V.deltaE(topRgb[top], k.rgb); contrast[short(top) + "+" + k.id] = { topRgb: topRgb[top], pantsRgb: k.rgb, deltaE: +de.toFixed(3), class: contrastClass(de) }; }
  const C = (f) => loadPng(join(OUT, "crops", f));
  for (const bn of Object.keys(BGS)) { const app = [], waist = [];
    for (const top of tops) for (const k of list) { const u = uidOf(k.item, top, "shoes-sneakers-white"); app.push(C(u + "--app110--" + bn + ".png")); waist.push(C(u + "--waist--" + bn + ".png")); }
    savePng(join(OUT, "ps-app110--" + bn + ".png"), grid(app, 12, 6)); savePng(join(OUT, "ps-waist-x2--" + bn + ".png"), grid(waist, 4, 8)); }
  const failed = Object.values(units).filter((u) => !u.ok).map((u) => [u.candidate, u.top, u.shoes, u.failed]);
  const summary = { checks: Object.keys(units).length, failed, byCandidate: Object.fromEntries(list.map((k) => [k.id, { plainTops: Object.values(units).filter((u) => u.candidate === k.id && PLAIN_TOPS.includes(u.top) && u.ok).length + "/8", printTees: Object.values(units).filter((u) => u.candidate === k.id && !PLAIN_TOPS.includes(u.top) && u.ok).length + "/" + tees.length * SHOES.length }])) };
  const manifest = { decision: "D-281", status: "STAGED PRIVATELY — NOT PUBLISHED; item approval and publication need the owner's explicit permission",
    candidates: { file: CANDIDATES, sha256: sha(readFileSync(join(ROOT, ...CANDIDATES.split("/")))), ids: list.map((k) => k.id) }, master: c.master,
    targetDir: "assets/avatar-northstar/", itemTable: Object.fromEntries(list.map((k) => [k.item, { ...ITEM_SHAPE, shadowsOf: SHADOW_OF }])), shadowReuse: L0.shadowReuse,
    layerChecks: L0.layerChecks, equivalence: { what: L0.equivalence.what, outfits: L0.equivalence.outfits, outfitsDiffering: L0.equivalence.outfitsDiffering }, publishedFilesIdenticalToPipeline: L0.publishedFilesIdenticalToPipeline.length,
    outfitChecks: summary, contrastAdvisory: { what: "OKLab distance between the top's median colour and the candidate's solid colour; D-271's thresholds (clear >= " + V.CONTRAST.strongDE + ", borderline >= " + V.CONTRAST.seenDE + "); advisory — the drawn hem line separates top and trousers at any distance", pairs: contrast },
    counts: { files: L0.files.length, bytes: L0.files.reduce((s, e) => s + e.bytes, 0) }, files: L0.files };
  writeFileSync(join(OUT, "staging", "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  writeFileSync(join(OUT, "index.html"), page(manifest, list, tops));
  console.log(JSON.stringify({ phase: "pack", outfitChecks: summary, contrastClasses: Object.values(contrast).reduce((a, x) => ((a[x.class] = (a[x.class] || 0) + 1), a), {}), weak: Object.entries(contrast).filter(([, x]) => x.class !== "clear").map(([k, x]) => k + " " + x.deltaE) }));
}
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
function page(m, list, tops) {
  const rows = tops.map((top) => "<tr><td>" + esc(short(top)) + "</td>" + list.map((k) => { const x = m.contrastAdvisory.pairs[short(top) + "+" + k.id]; return "<td>" + x.deltaE + " (" + x.class + ")</td>"; }).join("") + "</tr>").join("");
  const img = (f, alt) => "<figure><img src=\"" + f + "\" alt=\"" + esc(alt) + "\"><figcaption>" + esc(alt) + "</figcaption></figure>";
  return "<!doctype html><meta charset=\"utf-8\"><title>D-281 ensfarvede bukser</title><style>body{font:14px system-ui;margin:16px;background:#f6f4ef;color:#222}img{max-width:100%;image-rendering:pixelated}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:3px 6px}figure{margin:12px 0}</style>"
    + "<h1>D-281 — navy og sand som items (privat)</h1><p>Kandidater: " + list.map((k) => esc(k.id + " " + k.item + " " + JSON.stringify(k.rgb))).join(", ") + ". Master " + esc(m.master.revision) + ". Ækvivalens: " + m.equivalence.outfits + " outfits, " + m.equivalence.outfitsDiffering + " afvigende. Outfitkontrol: " + esc(JSON.stringify(m.outfitChecks.byCandidate)) + ", fejl: " + m.outfitChecks.failed.length + ".</p>"
    + "<p>Rækkefølge i arkene: for hver top (blå, creme, de 16 trykte) navy og sand, med hvide sneakers.</p>"
    + img("ps-app110--light.png", "110×165, lys") + img("ps-app110--dark.png", "110×165, mørk") + img("ps-waist-x2--light.png", "linning og T-shirtkant ×2, lys") + img("ps-waist-x2--dark.png", "linning og T-shirtkant ×2, mørk")
    + "<h2>Farveafstand top/bukser (vejledende, OKLab)</h2><table><tr><th>top</th>" + list.map((k) => "<th>" + esc(k.id) + "</th>").join("") + "</tr>" + rows + "</table>";
}

function main() {
  const args = process.argv.slice(2), at = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), OUT = outDir(at("--out")), phase = at("--phase"), CWEBP = at("--cwebp"), DWEBP = at("--dwebp");
  if (!DWEBP || !existsSync(DWEBP) || (phase === "layers" && (!CWEBP || !existsSync(CWEBP)))) throw new Error("--cwebp and --dwebp must name the vendored libwebp tools");
  if (phase === "layers") { if (existsSync(join(OUT, "staging", "manifest.json"))) throw new Error("already staged into " + OUT + "; a staging is never rewritten"); return phaseLayers(OUT, CWEBP, DWEBP); }
  if (phase === "outfits") return phaseOutfits(OUT, DWEBP);
  if (phase === "pack") return phasePack(OUT, DWEBP);
  throw new Error("--phase layers|outfits|pack");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { try { Promise.resolve(main()).catch((e) => { console.error("REFUSED: " + e.message); process.exit(1); }); } catch (e) { console.error("REFUSED: " + e.message); process.exit(1); } }
