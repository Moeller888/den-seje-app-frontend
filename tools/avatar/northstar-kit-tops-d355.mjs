// D-355 — D-354'S 33 OWNER-APPROVED TOP CANDIDATES PREPARED FOR THE NORTHSTAR OPT-IN (offline; no image call; nothing published; the
// flag stays false; no catalogue, shop, database or ordinary pupil change). The scope is exactly R01–R11 on tee-hip-v2, sweater-long-v3
// and tank-v5 (production-trial-owner-approval-d354.json); the planet (R12) is never read. Every output shows C: --out and --staging must
// lie outside the repository, and the new layer files stay in the private staging until the owner approves the publication list.
//   verify — the 33 private layer files against the approved sha256 (file and pixels); each cut's shared runtime files are the published
//            ones: its skin shadow parts (K.shadowParts) and its hip seam / hem junction (D-354's behind-bottom layer) equal the published
//            top-tee-hip-cream, top-sweater-ls2 and top-tank files byte for byte, so they are reused, never staged again.
//   check  — every proposed combination (kitTopCombos: each cut's own current list of (bottom, shoes), nothing added): the production
//            outfit check (checkOutfitSeam, the cut's runtime layers behind and in front of the bottom), its composite with the skin shadows
//            (the reference: its pixel sha256), an app-size view on light and dark and a 1:1 crop of the hip; one unit per combination,
//            resumable (--cut, --from, --count keep a run under ten minutes).
//   stage  — the runtime layers of the 33 (TOP_SPLIT: the tee and the sweater split at C's arm alpha 1 as the published tees since D-349 and
//            the sweaters; the tank at 128 with no sleeve layer) as lossless WebP into --staging, decoded back byte for byte, with
//            staging-manifest.json: the item table, every file's sha256 and its trace to the approved candidate.
//   equiv  — over the staged and published files: the top-body and sleeve layers together are the approved layer byte for byte; for every
//            proposed combination northstarCompose(northstarPlanFor(outfit)) equals check's composite; D-354's reviewed outfits (the
//            light and dark pair per candidate) are reproduced byte for byte — on the tee except exactly the pixels the D-349 split moves.
//   sheets — the visual review: per cut and bottom, the 11 designs (rows) over its shoes (columns) at app size, light and dark; the hip at
//            1:1; the selector previews come from verify-northstar-kit-tops-d355.mjs.
//   page   — the private decision page (index.html) from the written files.
//   armedge, lists — the bounded checks of the tee's arm edge and of the list's sources (northstar-kit-tops-review-d355.mjs).
// Usage: node --expose-gc tools/avatar/northstar-kit-tops-d355.mjs --phase verify|check|stage|equiv|armedge|lists|sheets|page --out <dir> --dwebp <exe>
//        [--cwebp <exe>] [--staging <dir>] [--cut <id>] [--from <n>] [--count <n>]
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir, homedir } from "node:os";
import { encodePng, decodePng } from "./r3-hair-tool-v2.mjs";
import * as WR from "./northstar-wardrobe.mjs";
import * as IP from "./northstar-item-pilot.mjs";
import * as K from "./northstar-top-cut-kit.mjs";
import { partners } from "./northstar-tank-family.mjs";
import { checkOutfitSeam } from "./northstar-longsleeve-master-study.mjs";
import { splitLayers } from "./northstar-longsleeve-master-v2.mjs";
import { loadItems, writeLayerSet } from "./build-northstar-runtime-assets.mjs";
import { flat, crop, grid, down } from "./northstar-wardrobe-poc.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", ".."), PUB = join(ROOT, "assets", "avatar-northstar"), ART = join(homedir(), "Documents", "DenSejeApp-artefacts"), { W, N } = WR, H = N / W;
const sha = (b) => createHash("sha256").update(b).digest("hex"), pxSha = (px) => sha(Buffer.from(px.buffer, px.byteOffset, px.byteLength)), gc = () => { if (typeof globalThis.gc === "function") globalThis.gc(); };
const loadPx = (f) => Uint8ClampedArray.from(decodePng(readFileSync(f)).px), json = (f) => JSON.parse(readFileSync(f, "utf8"));
const LIGHT = [236, 233, 226], DARK = [24, 26, 40];
export const APPROVAL_REL = "tools/avatar/fixtures/northstar-wardrobe/top-cuts/production-trial-owner-approval-d354.json";
export const approval = () => json(join(ROOT, ...APPROVAL_REL.split("/")));
/** The cut of each candidate and the runtime family it joins (its shared files are that family's published ones). */
export const CUT_FAMILY = Object.freeze({
  "tee-hip-v2": { base: "top-tee-hip", shadowsOf: "top-tee-hip-cream", layers: ["top-body", "sleeves"], shadows: ["body", "arms"], hipSeam: null },
  "sweater-long-v3": { base: "top-sweater-ls2", shadowsOf: "top-sweater-ls2", layers: ["top-body", "sleeves"], shadows: ["body", "arms"], hipSeam: "top-sweater-ls2-hip-seam-v1.webp" },
  "tank-v5": { base: "top-tank", shadowsOf: "top-tank", layers: ["top-body"], shadows: ["body"], hipSeam: "top-tank-hem-junction-v1.webp" },
});
/** The runtime split at C's arm alpha: the tee as the published tees since D-349 (U-343-1: threshold 1, the sweater's), the sweater its
 *  own (1), the tank its own (128; it has no sleeve layer). */
export const TOP_SPLIT = Object.freeze({ "tee-hip-v2": 1, "sweater-long-v3": 1, "tank-v5": 128 });
/** The runtime item of a candidate: the family's base and the recipe's slug (top-tee-hip-forest-melange, top-sweater-ls2-…, top-tank-…). */
export const itemOfCandidate = (cut, slug) => CUT_FAMILY[cut].base + "-" + slug;
export const itemShape = (cut) => { const f = CUT_FAMILY[cut]; return { category: "top", layers: [...f.layers], shadows: [...f.shadows], shadowsOf: f.shadowsOf, ...(f.hipSeam ? { hipSeam: f.hipSeam } : {}) }; };

/** Each cut's current (bottom, shoes) pairs from the runtime's own lists, nothing added: the tee's are the pairs the opt-in shows the cream
 *  tee with (the print tees' too), the sweater's NORTHSTAR_LS2_COMBOS', the tank's NORTHSTAR_TANK_COMBOS'. */
export function cutPairs(AL) {
  const tee = new Set(); for (const k of Object.keys(AL.NORTHSTAR_OUTFITS)) for (const p of [null, ...Object.keys(AL.NORTHSTAR_SOLID_PANTS)]) for (const s of [null, ...Object.keys(AL.NORTHSTAR_SHOE_CHOICES)]) {
    const o = AL.northstarOutfitFor(k, null, p, s); if (o && o.top === "top-tee-hip-cream" && AL.northstarPlanFor(o)) tee.add(o.bottom + "|" + o.shoes); }
  const of = (list) => new Set(list.map((c) => { const [, b, s] = c.split("+"); return b + "|" + s; }));
  return { "tee-hip-v2": tee, "sweater-long-v3": of(AL.NORTHSTAR_LS2_COMBOS), "tank-v5": of(AL.NORTHSTAR_TANK_COMBOS) };
}
/** The proposed combinations: every approved candidate over its cut's current pairs, in the approval's order, the pairs sorted. */
export function kitTopCombos(AL, A = approval()) {
  const P = cutPairs(AL), out = [];
  for (const c of A.approved) for (const p of [...P[c.cut]].sort()) { const [bottom, shoes] = p.split("|"), top = itemOfCandidate(c.cut, c.slug);
    out.push({ id: c.cut + "--" + c.recipe + "--" + bottom.replace("bottom-", "") + "--" + shoes.replace("shoes-", ""), candidate: c.id, cut: c.cut, recipe: c.recipe, top, bottom, shoes }); }
  return out;
}
const outside = (d) => { const r = relative(ROOT, resolve(d || ".")); return !!d && (r.startsWith("..") || isAbsolute(r)); };
const privateFile = (f) => join(ART, ...f.replace("<Documents>/DenSejeApp-artefacts/", "").split("/"));
function decoder(DW) { const tmp = join(tmpdir(), "d355-" + process.pid); mkdirSync(tmp, { recursive: true }); const cache = new Map();
  return { dec: (f, dir = PUB) => { const key = dir + "|" + f; if (!cache.has(key)) { const o = join(tmp, "x.png"); execFileSync(DW, ["-quiet", join(dir, f), "-o", o]); cache.set(key, loadPx(o)); } return cache.get(key); }, cache, done: () => rmSync(tmp, { recursive: true, force: true }) }; }
const differing = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++; return d; };
/** A candidate's approved layer, checked against the approval (file sha256 and pixel sha256) before use. */
function approvedLayer(c) { const f = privateFile(c.layer.file), b = readFileSync(f); if (sha(b) !== c.layer.sha256) throw new Error(c.id + ": the private layer file is not the approved one");
  const px = Uint8ClampedArray.from(decodePng(b).px); if (pxSha(px) !== c.layer.pixelSha256) throw new Error(c.id + ": the layer's pixels are not the approved ones"); return px; }
const runtimeLayers = (c, layer, base) => { const s = splitLayers(layer, base, TOP_SPLIT[c.cut]); return { ...s.layers, moved: s.moved }; };

function phaseVerify(OUT, DW) {
  const A = approval(), E = K.envC(), D = decoder(DW), res = { candidates: {}, shared: {} };
  try { if (A.approved.length !== 33 || A.approved.some((c) => c.recipe === "R12")) throw new Error("the scope is exactly the 33 (R01–R11 on three cuts)");
    for (const c of A.approved) { const px = approvedLayer(c); res.candidates[c.id] = { fileSha256: c.layer.sha256, pixelSha256: c.layer.pixelSha256, ok: true }; gc(); }
    for (const cut of Object.keys(CUT_FAMILY)) { const f = CUT_FAMILY[cut], ctx = { c: K.loadCut(cut), E, ...K.cutOf(K.loadCut(cut), E) }, sh = K.shadowParts(ctx), r = { shadows: {}, hipSeam: null };
      for (const [part, px] of Object.entries(sh)) { const file = f.shadowsOf + "-shadow-" + part + "-v1.webp"; let ink = 0; for (let i = 0; i < N; i++) if (px[i * 4 + 3]) ink++;
        r.shadows[part] = f.shadows.includes(part) ? { file, bytesDiffering: differing(px, D.dec(file)) } : { file: null, inkPx: ink }; }
      if (f.hipSeam) { const lf = join(ART, "d354-edge-fixes", "layers", cut + "--behind-bottom.png"); r.hipSeam = { file: f.hipSeam, bytesDiffering: differing(loadPx(lf), D.dec(f.hipSeam)) }; }
      r.ok = Object.values(r.shadows).every((s) => (s.file ? s.bytesDiffering === 0 : s.inkPx === 0)) && (!r.hipSeam || r.hipSeam.bytesDiffering === 0); res.shared[cut] = r; gc(); } }
  finally { D.done(); }
  res.ok = Object.values(res.candidates).every((x) => x.ok) && Object.values(res.shared).every((x) => x.ok);
  writeFileSync(join(OUT, "verify.json"), JSON.stringify({ decision: "D-355", what: "the 33 private layers against the approval; each cut's shared files against the published ones", ...res }, null, 2) + "\n");
  console.log(JSON.stringify({ ok: res.ok, candidates: Object.keys(res.candidates).length, shared: res.shared }));
  if (!res.ok) process.exit(1);
}

async function phaseCheck(AL, OUT, DW, onlyCut, from, count) {
  const A = approval(), E = K.envC(), { w, base } = E, D = decoder(DW), P = partners(AL, D.dec), C = kitTopCombos(AL, A).filter((x) => !onlyCut || x.cut === onlyCut).slice(from, count ? from + count : undefined);
  // the tee's pairs include the navy shorts (the cream tee's K04–K06), which the tank family's partners never needed: D-242's own item
  if (!P["bottom-shorts-navy"]) { const spec = json(join(ROOT, "tools", "avatar", "fixtures", "northstar-wardrobe", "runtime-assets-inputs-d242.json")); Object.assign(P, loadItems({ "bottom-shorts-navy": spec.items["bottom-shorts-navy"] }).P); }
  for (const d of ["units", "app", "hip"]) mkdirSync(join(OUT, d), { recursive: true });
  const shadowOf = {}, seamOf = {}; let current = null, top = null;
  try { for (const x of C) { const uf = join(OUT, "units", x.id + ".json");
      const c = A.approved.find((a) => a.id === x.candidate), key = sha(JSON.stringify([c.layer.pixelSha256, x.bottom, x.shoes, TOP_SPLIT[x.cut], CUT_FAMILY[x.cut]]));
      if (existsSync(uf) && json(uf).key === key && existsSync(join(OUT, "app", x.id + "--light.png"))) continue;
      if (current !== x.candidate) { current = x.candidate; top = null; gc();
        if (!shadowOf[x.cut]) shadowOf[x.cut] = K.cutOf(K.loadCut(x.cut), E).t.shadow;
        if (!(x.cut in seamOf)) seamOf[x.cut] = CUT_FAMILY[x.cut].hipSeam ? D.dec(CUT_FAMILY[x.cut].hipSeam) : new Uint8ClampedArray(N * 4);
        const L = runtimeLayers(x, approvedLayer(c), base); top = { category: "top", layers: { topBody: L.topBody, sleeves: L.sleeves }, shadow: shadowOf[x.cut] }; }
      const t1 = Date.now(), r = checkOutfitSeam(w, base, [top, P[x.bottom], P[x.shoes]], seamOf[x.cut]); let comp = r.proof.dressedRuntime;
      for (const it of [top, P[x.bottom], P[x.shoes]]) comp = IP.applyShadow(comp, r.proof.stack, it.shadow);
      for (const [tone, bg] of [["light", LIGHT], ["dark", DARK]]) { const f = flat(comp, bg), a = down(f, 300, 450); writeFileSync(join(OUT, "app", x.id + "--" + tone + ".png"), encodePng(a.w, a.h, a.px));
        if (tone === "light") { const h = crop(f, [360, 700, 664, 900], 1); writeFileSync(join(OUT, "hip", x.id + ".png"), encodePng(h.w, h.h, h.px)); } }
      writeFileSync(uf, JSON.stringify({ key, id: x.id, candidate: x.candidate, top: x.top, bottom: x.bottom, shoes: x.shoes, technical: r.ok ? "PASS" : "FAIL", failed: r.failed, enclosedPx: r.enclosedPx, hipOpen: r.hipOpen, compositeSha256: pxSha(comp), seconds: (Date.now() - t1) / 1000 }, null, 2) + "\n");
      console.log(x.id, r.ok ? "PASS" : "FAIL " + r.failed.join("|"), ((Date.now() - t1) / 1000).toFixed(1) + " s", Math.round(process.memoryUsage().rss / 1048576) + " MB"); r.proof = null; comp = null; gc(); } }
  finally { D.done(); }
}

function phaseStage(OUT, DW, CW, STG) {
  if (!outside(STG)) throw new Error("--staging must be outside the repository");
  if (existsSync(join(STG, "staging-manifest.json"))) throw new Error("already staged into " + STG + "; a staging is never rewritten");
  const A = approval(), E = K.envC(), files = {}, table = {}, trace = {};
  for (const c of A.approved) { const L = runtimeLayers(c, approvedLayer(c), E.base), item = itemOfCandidate(c.cut, c.slug), f = CUT_FAMILY[c.cut];
    let sl = 0; for (let i = 0; i < N; i++) if (L.sleeves[i * 4 + 3]) sl++; if (!f.layers.includes("sleeves") && sl) throw new Error(c.id + ": a tank has no sleeve layer");
    const origin = { candidate: c.id, approvedLayerSha256: c.layer.sha256, approvedLayerPixelSha256: c.layer.pixelSha256, rule: "splitLayers(approved layer, C's arms, " + TOP_SPLIT[c.cut] + ")", movedPx: L.moved };
    files[item + "-top-body-v1.webp"] = { px: L.topBody, purpose: "the body layer of " + item + " (" + c.name + " on " + c.cut + ", D-354, owner-approved)", origin };
    if (f.layers.includes("sleeves")) files[item + "-sleeves-v1.webp"] = { px: L.sleeves, purpose: "the sleeve layer of " + item + " (" + c.name + " on " + c.cut + ", D-354, owner-approved)", origin };
    table[item] = itemShape(c.cut); trace[item] = { candidate: c.id, cut: c.cut, recipe: c.recipe, name: c.name, approvedLayerSha256: c.layer.sha256 }; gc(); }
  mkdirSync(STG, { recursive: true }); const staged = join(STG, "staging"); mkdirSync(staged, { recursive: true });
  const entries = writeLayerSet(files, staged, { cwebp: CW, dwebp: DW }); for (const k of Object.keys(files)) files[k].px = null; gc();
  const notAllowed = readdirSync(staged).filter((f) => !/^top-(tee-hip|sweater-ls2|tank)-[a-z-]+-(top-body|sleeves)-v1\.webp$/.test(f)); if (notAllowed.length) throw new Error("staging holds a file that is not a new top layer: " + notAllowed.join(", "));
  const clash = entries.filter((e) => existsSync(join(PUB, e.file))); if (clash.length) throw new Error("a staged name is already published: " + clash.map((e) => e.file).join(", "));
  const manifest = { decision: "D-355", status: "STAGED PRIVATELY — NOT PUBLISHED; publishing needs the owner's separate approval of this list of files and hashes",
    approval: { file: APPROVAL_REL, sha256: sha(readFileSync(join(ROOT, ...APPROVAL_REL.split("/")))) }, split: TOP_SPLIT, sharedFiles: Object.fromEntries(Object.entries(CUT_FAMILY).map(([k, f]) => [k, [...f.shadows.map((p) => f.shadowsOf + "-shadow-" + p + "-v1.webp"), ...(f.hipSeam ? [f.hipSeam] : [])]])),
    itemTable: table, trace, files: entries };
  writeFileSync(join(STG, "staging-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(JSON.stringify({ files: entries.length, bytes: entries.reduce((s, e) => s + e.bytes, 0) }));
}

async function phaseEquiv(AL, OUT, DW, STG, onlyCut) {
  const A = approval(), M = json(join(STG, "staging-manifest.json")), staged = join(STG, "staging"), D = decoder(DW), E = K.envC();
  for (const e of M.files) if (sha(readFileSync(join(staged, e.file))) !== e.sha256) throw new Error("the staging changed: " + e.file);
  const px = (src) => { const f = src.split("/").pop(); return D.dec(f, existsSync(join(staged, f)) ? staged : PUB); }, table = { ...AL.NORTHSTAR_ITEMS, ...M.itemTable }, res = { layers: {}, combos: {}, reviewed: {} };
  const ef = join(OUT, "equiv" + (onlyCut ? "-" + onlyCut : "") + ".json");
  try { for (const c of A.approved.filter((a) => !onlyCut || a.cut === onlyCut)) { const item = itemOfCandidate(c.cut, c.slug), want = approvedLayer(c), tb = px(item + "-top-body-v1.webp"), sl = M.itemTable[item].layers.includes("sleeves") ? px(item + "-sleeves-v1.webp") : null;
      let d = 0, overlap = 0; for (let i = 0; i < N; i++) { const a = tb[i * 4 + 3] ? tb : sl && sl[i * 4 + 3] ? sl : null; if (tb[i * 4 + 3] && sl && sl[i * 4 + 3]) overlap++; for (let k = 0; k < 4; k++) if ((a ? a[i * 4 + k] : 0) !== (want[i * 4 + 3] ? want[i * 4 + k] : 0)) { d++; break; } }
      res.layers[c.id] = { item, pxDifferingFromApprovedLayer: d, overlapPx: overlap };
      for (const x of kitTopCombos(AL, A).filter((y) => y.candidate === c.id)) { const u = json(join(OUT, "units", x.id + ".json")), plan = AL.northstarPlanFor({ top: x.top, bottom: x.bottom, shoes: x.shoes }, table); if (!plan) throw new Error(x.id + ": no plan");
        res.combos[x.id] = pxSha(AL.northstarCompose(plan, px, N)) === u.compositeSha256; }
      // D-354's reviewed outfits (the light and dark pair): sweater and tank byte for byte; the tee except exactly the pixels the D-349 split moves
      const L = runtimeLayers(c, want, E.base), moved = new Uint8Array(N); for (let i = 0; i < N; i++) if (want[i * 4 + 3] && E.base.arms[i * 4 + 3] >= TOP_SPLIT[c.cut] && E.base.arms[i * 4 + 3] < 128) moved[i] = 1;
      for (const tone of ["light", "dark"]) { const ru = json(join(ART, "d354-edge-fixes", "units", c.id + "--" + tone + ".json")), ref = loadPx(join(ART, "d354-edge-fixes", "full", c.id + "--" + tone + ".png"));
        const got = AL.northstarCompose(AL.northstarPlanFor({ top: item, bottom: ru.pair.bottom, shoes: ru.pair.shoes }, table), px, N); let off = 0, onMoved = 0;
        for (let i = 0; i < N; i++) { if ([0, 1, 2, 3].some((k) => got[i * 4 + k] !== ref[i * 4 + k])) { if (moved[i]) onMoved++; else off++; } }
        res.reviewed[c.id + "--" + tone] = { pair: ru.pair, pxDifferingOutsideMoved: off, pxDifferingOnMoved: onMoved, movedPx: L.moved }; }
      for (const k of [...D.cache.keys()]) if (k.startsWith(staged)) D.cache.delete(k); gc(); console.log(c.id, JSON.stringify(res.layers[c.id]), Object.values(res.combos).filter(Boolean).length + "/" + Object.keys(res.combos).length); } }
  finally { D.done(); }
  const summary = { candidates: Object.keys(res.layers).length, layersExact: Object.values(res.layers).filter((l) => !l.pxDifferingFromApprovedLayer && !l.overlapPx).length, combos: Object.keys(res.combos).length, combosEqual: Object.values(res.combos).filter(Boolean).length,
    reviewed: Object.keys(res.reviewed).length, reviewedExactOutsideMoved: Object.values(res.reviewed).filter((r) => r.pxDifferingOutsideMoved === 0).length, reviewedMovedPxDiffering: Object.values(res.reviewed).reduce((s, r) => s + r.pxDifferingOnMoved, 0) };
  writeFileSync(ef, JSON.stringify({ decision: "D-355", stagingManifestSha256: sha(readFileSync(join(STG, "staging-manifest.json"))), summary, ...res }, null, 2) + "\n"); console.log(JSON.stringify(summary));
}

function phaseSheets(AL, OUT) {
  const A = approval(), C = kitTopCombos(AL, A), V = join(OUT, "views"); mkdirSync(V, { recursive: true }); const layout = {};
  for (const cut of Object.keys(CUT_FAMILY)) { const cc = C.filter((x) => x.cut === cut), bottoms = [...new Set(cc.map((x) => x.bottom))].sort(), recipes = [...new Set(cc.map((x) => x.recipe))];
    for (const b of bottoms) { const shoes = [...new Set(cc.filter((x) => x.bottom === b).map((x) => x.shoes))].sort(); (layout[cut] ||= {})[b] = shoes;
      for (const tone of ["light", "dark"]) { const t = []; for (const r of recipes) for (const s of shoes) { const x = cc.find((y) => y.recipe === r && y.bottom === b && y.shoes === s), im = decodePng(readFileSync(join(OUT, "app", x.id + "--" + tone + ".png"))); t.push(down2(im, 150, 225)); }
        const g = grid(t, shoes.length, 6); writeFileSync(join(V, cut + "--" + b.replace("bottom-", "") + "--app--" + tone + ".png"), encodePng(g.w, g.h, g.px)); gc(); }
      const t = []; for (const r of recipes) for (const s of shoes) { const x = cc.find((y) => y.recipe === r && y.bottom === b && y.shoes === s), im = decodePng(readFileSync(join(OUT, "hip", x.id + ".png"))); t.push({ w: im.header.w, h: im.header.h, px: Uint8ClampedArray.from(im.px) }); }
      const g = grid(t, shoes.length, 6); writeFileSync(join(V, cut + "--" + b.replace("bottom-", "") + "--hip--1to1.png"), encodePng(g.w, g.h, g.px)); gc(); } }
  writeFileSync(join(OUT, "sheets.json"), JSON.stringify({ decision: "D-355", rows: A.approved.filter((c) => c.cut === "tee-hip-v2").map((c) => c.recipe), layout }, null, 2) + "\n"); console.log("sheets", Object.keys(layout).map((k) => k + ":" + Object.keys(layout[k]).length).join(" "));
}
// a box average of a 300x450 view to w x h (the app-size sheets)
function down2(im, w2, h2) { const w = im.header.w, h = im.header.h, o = new Uint8ClampedArray(w2 * h2 * 4), sx = w / w2, sy = h / h2;
  for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) { const acc = [0, 0, 0]; let n = 0; for (let yy = Math.floor(y * sy); yy < Math.ceil((y + 1) * sy); yy++) for (let xx = Math.floor(x * sx); xx < Math.ceil((x + 1) * sx); xx++) { const j = (yy * w + xx) * 4; for (let c = 0; c < 3; c++) acc[c] += im.px[j + c]; n++; }
    o.set([...acc.map((v) => Math.round(v / n)), 255], (y * w2 + x) * 4); } return { w: w2, h: h2, px: o }; }

async function main() {
  const args = process.argv.slice(2), at = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), phase = at("--phase"), OUT = at("--out"), DW = at("--dwebp");
  if (!outside(OUT)) throw new Error("--out must be outside the repository (the views show C)"); mkdirSync(OUT, { recursive: true });
  const AL = await import(pathToFileURL(join(ROOT, "js", "avatar-layers.js")).href);
  if (phase === "sheets") return phaseSheets(AL, OUT);
  if (phase === "lists") { const RV = await import("./northstar-kit-tops-review-d355.mjs"), r = RV.lists(AL, kitTopCombos, cutPairs); writeFileSync(join(OUT, "lists.json"), JSON.stringify({ decision: "D-355", ...r }, null, 2) + "\n");
    return console.log(JSON.stringify({ total: r.total, checks: r.checks, cuts: Object.fromEntries(Object.entries(r.cuts).map(([k, v]) => [k, { pairs: v.pairs, allowed: v.allowed, selectable: v.selectable, notSelectable: v.notSelectable }])) })); }
  if (phase === "page") return (await import("./northstar-kit-tops-page-d355.mjs")).writePage(AL, OUT, at("--staging"));
  if (!DW || !existsSync(DW)) throw new Error("--dwebp");
  if (phase === "verify") return phaseVerify(OUT, DW);
  if (phase === "check") return phaseCheck(AL, OUT, DW, at("--cut"), Number(at("--from") || 0), Number(at("--count") || 0));
  if (phase === "stage") { if (!at("--cwebp") || !existsSync(at("--cwebp"))) throw new Error("--cwebp"); return phaseStage(OUT, DW, at("--cwebp"), at("--staging")); }
  if (phase === "equiv") return phaseEquiv(AL, OUT, DW, at("--staging"), at("--cut"));
  if (phase === "armedge") { const STG = at("--staging"), M = json(join(STG, "staging-manifest.json")), staged = join(STG, "staging"), D = decoder(DW), RV = await import("./northstar-kit-tops-review-d355.mjs");
    for (const e of M.files) if (sha(readFileSync(join(staged, e.file))) !== e.sha256) throw new Error("the staging changed: " + e.file);
    try { return RV.phaseArmEdge(OUT, { A: approval(), AL, M, px: (src) => { const f = src.split("/").pop(); return D.dec(f, existsSync(join(staged, f)) ? staged : PUB); }, approvedLayer, itemOf: (c) => itemOfCandidate(c.cut, c.slug), ART354: join(ART, "d354-edge-fixes"), loadPx, TOP_SPLIT, contour: K.cutOf(K.loadCut("tee-hip-v2"), K.envC()).t.contour }); } finally { D.done(); } }
  throw new Error("--phase verify|check|stage|equiv|armedge|lists|sheets|page");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
