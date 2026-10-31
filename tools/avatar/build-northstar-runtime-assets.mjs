// D-242 NORTHSTAR WARDROBE RUNTIME ASSETS — builds the owner-authorised runtime layers (at most 41: C's body with an empty torso,
// arms and hands, the head, four closed-shoe covering masks, the 14 item layers of the ten items, at most 20 skin-shadow parts)
// as lossless WebP 1024×1536 into assets/avatar-northstar/, with manifest.json (purpose, origin and sha256 of every file).
// Needs the private inputs (C, D-127 §2, and the D-239/D-240 runs under <Documents>/DenSejeApp-artefacts/), so it runs only on
// the owner's machine; CI checks the result (tests/unit/avatar-northstar-wardrobe-renderer-d242.test.mjs). Never writes C, a raw
// generation, a reference sheet or a review file; H1 is never read. No image call.
//   1. the layers: the uncut runtime body/arms/head of layerProof (one of each for every outfit, verified), each closed shoe's
//      covering as a mask, the item layers unchanged, each item's skin shadow split into its part on C's body and on C's arms;
//   2. lossless: every WebP decodes back to exactly the source pixels;
//   3. equivalence: northstarCompose(northstarCanvasPlan(K)) (js/avatar-layers.js — the function the browser runs) reproduces
//      the pipeline composite (layerProof + applyShadow) of all 19 K outfits byte for byte.
// D-244: loadItems / buildLayerSet / writeLayerSet are the reusable steps; tools/avatar/northstar-batch.mjs exports a batch's
// approved items with them into a PRIVATE directory (the public exception of D-242 is not extended).
// Usage: node tools/avatar/build-northstar-runtime-assets.mjs --cwebp <cwebp.exe> --dwebp <dwebp.exe>
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { homedir, tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { encodePng, decodePng } from "./r3-hair-tool-v2.mjs";
import * as WR from "./northstar-wardrobe.mjs";
import * as BF from "./northstar-base-figure.mjs";
import * as BC from "./northstar-base-figure-c.mjs";
import * as IP from "./northstar-item-pilot.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const OUT_DIR = join(ROOT, "assets", "avatar-northstar");
export const INPUTS = join(ROOT, "tools", "avatar", "fixtures", "northstar-wardrobe", "runtime-assets-inputs-d242.json");
export const MAX_FILES = 41, MAX_SHADOWS = 20;
export const CWEBP_ARGS = Object.freeze(["-lossless", "-exact", "-z", "9", "-metadata", "none"]);
const { W, N } = WR, H = N / W;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const FIGURE_ORIGIN = {
  body: ["C's runtime body: neck, shoulders, upper arms, legs and feet; the torso and hips are empty (covered by the mandatory top and bottom)", { source: "C (D-202 base figure v2, private)", cSha256: BC.C_RAW_SHA256, tool: "northstar-base-figure.mjs layerProof (headSeam d201, enclosure c-exterior)" }],
  arms: ["C's forearms and hands, drawn above the top's body and below its sleeves", { source: "C (D-202 base figure v2, private)", cSha256: BC.C_RAW_SHA256, tool: "layerProof" }],
  head: ["the head: the R3 head stack of Northstar Master v2 with its neck seam cut where C's body lies (runtimeHead)", { source: "assets/avatar/reference/Northstar Master v2.png (tracked) + C's body alpha", cSha256: BC.C_RAW_SHA256, tool: "northstar-base-figure.mjs runtimeHead" }],
};

/** Each item's layers and skin shadow from its pinned run (<artefacts>/<run>/items/<id>/), every file checked against the run's
 *  report: technically OK, the expected method, the same bytes. itemsSpec: { id: { run, method } }. */
export function loadItems(itemsSpec, artefacts = join(homedir(), "Documents", "DenSejeApp-artefacts")) {
  const P = {}, origin = {};
  for (const [id, it] of Object.entries(itemsSpec)) { const d = join(artefacts, ...it.run.split("/"), "items", id), rep = JSON.parse(readFileSync(join(d, "report.json"), "utf8"));
    if (!rep.ok) throw new Error(id + ": not technically OK in " + it.run); if (rep.method !== it.method) throw new Error(id + ": method " + rep.method + " ≠ " + it.method);
    const layers = {}; for (const n of Object.keys(rep.files)) { const m = /^layer-(.+)\.png$/.exec(n); if (!m) continue; const b = readFileSync(join(d, n)); if (sha(b) !== rep.files[n].sha256) throw new Error(id + "/" + n + " differs from its report"); layers[m[1]] = Uint8ClampedArray.from(decodePng(b).px); }
    let shadow = null; if (rep.files["shadow-multiply.png"]) { const b = readFileSync(join(d, "shadow-multiply.png")); if (sha(b) !== rep.files["shadow-multiply.png"].sha256) throw new Error(id + " shadow differs from its report"); shadow = Uint8ClampedArray.from(decodePng(b).px); }
    P[id] = { item: id, layers, shadow, category: rep.category, covering: rep.covering || "none" };
    origin[id] = { run: "<Documents>/DenSejeApp-artefacts/" + it.run, method: rep.method, rawSha256: rep.raw.sha256, files: Object.fromEntries(Object.entries(rep.files).filter(([n]) => /^layer-|^shadow-/.test(n)).map(([n, f]) => [n, f.sha256])) }; }
  return { P, origin };
}

/** The runtime layer set (D-242's format) for loaded items and outfits [[key, { top, bottom, shoes }], …]: C's figure (body, arms,
 *  head — one of each for every outfit, verified), each closed shoe's covering mask, every item layer unchanged, each skin shadow
 *  split into its part on C's body and on C's arms; then every outfit is composed with planOf(outfit, itemTable) and compose
 *  (js/avatar-layers.js — the browser's plan and northstarCompose) and must equal the pipeline composite byte for byte.
 *  Returns { files, itemTable, equivalence, nShadows }; itemTable has the NORTHSTAR_ITEMS shape, with the shadows as found. */
export function buildLayerSet({ P, origin, outfits, figureNames, planOf, compose, cBuf = IP.readC() }) {
  const w = WR.buildWardrobe(), base = BC.prepareBase(w, Uint8ClampedArray.from(decodePng(cBuf).px)), min = BF.minimumItems(base.R, base.sep.lab);
  const closed = (id) => P[id].covering === "closed-footwear";
  const proof = (ids, hide) => BF.layerProof(w, base.R, base.Z, Object.assign({}, min, ...ids.map((id) => P[id].layers)), { sep: base.sep, headSeam: "d201", hide, enclosure: "c-exterior" });
  const pipeline = (ids) => { const pr = proof(ids, closed(ids[2]) ? BC.closedFootwearHidden(base, P[ids[2]].layers.shoes) : null);
    let comp = pr.dressedRuntime; for (const id of ids) if (P[id].shadow) comp = IP.applyShadow(comp, pr.stack, P[id].shadow); return comp; };
  const fig = {};
  for (const [, o] of outfits) { const S = Object.fromEntries(proof([o.top, o.bottom, o.shoes], null).stack);
    for (const n of ["body", "arms", "head"]) { const h = sha(S[n]); if (fig[n] && fig[n].h !== h) throw new Error("the runtime " + n + " differs between outfits"); fig[n] = { h, px: S[n] }; } }
  const files = {}, put = (name, px, purpose, from) => { if (files[name]) throw new Error("twice: " + name); files[name] = { px, purpose, origin: from }; };
  for (const n of ["body", "arms", "head"]) put(figureNames[n], fig[n].px, ...FIGURE_ORIGIN[n]);
  const used = [...new Set(outfits.flatMap(([, o]) => [o.top, o.bottom, o.shoes]))];
  const order = (cat) => used.filter((id) => P[id].category === cat);
  for (const id of order("shoes")) { if (!closed(id)) continue; const hide = BC.closedFootwearHidden(base, P[id].layers.shoes), m = new Uint8ClampedArray(N * 4);
    for (let i = 0; i < N; i++) if (hide[i]) { if (fig.arms.px[i * 4 + 3]) throw new Error(id + ": the covering reaches C's arms"); m.set([255, 255, 255, 255], i * 4); }
    put("hide-" + id + "-v1.webp", m, "what the closed shoe hides of C's foot (D-218 covering); cut out of C's body before the shoe is drawn", { source: "C's body + " + id, cSha256: BC.C_RAW_SHA256, item: origin[id], tool: "northstar-base-figure-c.mjs closedFootwearHidden" }); }
  const itemTable = {}; let nShadows = 0;
  for (const id of [...order("top"), ...order("bottom"), ...order("shoes")]) {
    const cat = P[id].category, layers = cat === "top" ? ["top-body", ...(P[id].layers.sleeves ? ["sleeves"] : [])] : cat === "bottom" ? ["pants"] : ["shoes"];
    for (const l of layers) { const key = l === "top-body" ? "topBody" : l; if (!P[id].layers[key]) throw new Error(id + ": no layer " + key); put(id + "-" + l + "-v1.webp", P[id].layers[key], "the item layer " + l + " of " + id + ", unchanged from its run", { source: "the item's extraction (method " + origin[id].method + ")", item: origin[id] }); }
    const shadows = [];
    if (P[id].shadow) for (const part of ["body", "arms"]) { const s = P[id].shadow, o = new Uint8ClampedArray(N * 4); let n = 0;
      for (let i = 0; i < N; i++) { if (!s[i * 4 + 3]) continue; const arm = fig.arms.px[i * 4 + 3] >= 128, bod = fig.body.px[i * 4 + 3] >= 128; if (part === "arms" ? arm : bod && !arm) { o.set(s.subarray(i * 4, i * 4 + 4), i * 4); n++; } }
      if (!n) continue; shadows.push(part); nShadows++;
      put(id + "-shadow-" + part + "-v1.webp", o, "the skin shadow of " + id + " on C's " + part + " (multiply, D-214)", { source: "the item's skin shadow", cSha256: BC.C_RAW_SHA256, item: origin[id] }); }
    itemTable[id] = { category: cat, layers, shadows, ...(closed(id) ? { closed: true } : {}) }; }
  const byName = (src) => { const f = files[src.split("/").pop()]; if (!f) throw new Error("the plan names an unbuilt file: " + src); return f.px; };
  const equivalence = {};
  for (const [k, o] of outfits) { const plan = planOf(o, itemTable); if (!plan) throw new Error(k + ": no plan for this outfit");
    const got = compose(plan, byName, N), ref = pipeline([o.top, o.bottom, o.shoes]); let diff = 0;
    for (let i = 0; i < N * 4; i++) if (got[i] !== ref[i]) diff++;
    equivalence[k] = { bytesDiffering: diff }; }
  const beyond = Object.entries(equivalence).filter(([, e]) => e.bytesDiffering); if (beyond.length) throw new Error("the plan differs from the pipeline: " + JSON.stringify(Object.fromEntries(beyond)));
  return { files, itemTable, equivalence, nShadows };
}

/** Writes a layer set as lossless WebP (each decoded back to exactly its source pixels); refuses a directory holding anything else
 *  than these files, the manifest and the files named in keep (left untouched). */
export function writeLayerSet(files, outDir, { cwebp, dwebp, keep = [] }) {
  mkdirSync(outDir, { recursive: true }); for (const f of readdirSync(outDir)) if (!files[f] && f !== "manifest.json" && !keep.includes(f)) throw new Error("unexpected file in " + outDir + ": " + f);
  const tmp = join(tmpdir(), "nsl-" + process.pid); mkdirSync(tmp, { recursive: true }); const entries = [];
  try { for (const [name, f] of Object.entries(files)) { const png = join(tmp, "in.png"), back = join(tmp, "back.png"), out = join(outDir, name);
      writeFileSync(png, encodePng(W, H, f.px)); execFileSync(cwebp, [...CWEBP_ARGS, "-quiet", png, "-o", out]); execFileSync(dwebp, ["-quiet", out, "-o", back]);
      const d = decodePng(readFileSync(back)).px; for (let i = 0; i < N * 4; i++) if (d[i] !== f.px[i]) throw new Error(name + ": not lossless at byte " + i);
      const b = readFileSync(out); entries.push({ file: name, purpose: f.purpose, origin: f.origin, sha256: sha(b), bytes: b.length, width: W, height: H, encoding: "WebP lossless (cwebp " + CWEBP_ARGS.join(" ") + ")" }); } }
  finally { rmSync(tmp, { recursive: true, force: true }); }
  return entries.sort((a, b) => (a.file < b.file ? -1 : 1));
}

async function main() {
  const args = process.argv.slice(2), arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const CWEBP = arg("--cwebp"), DWEBP = arg("--dwebp"); if (!CWEBP || !DWEBP || !existsSync(CWEBP) || !existsSync(DWEBP)) throw new Error("--cwebp and --dwebp must name the vendored libwebp tools");
  const L = await import(pathToFileURL(join(ROOT, "js", "avatar-layers.js")).href);
  const spec = JSON.parse(readFileSync(INPUTS, "utf8"));
  const { P, origin } = loadItems(spec.items), K = Object.entries(L.NORTHSTAR_OUTFITS);
  const { files, itemTable, equivalence, nShadows } = buildLayerSet({ P, origin, outfits: K, figureNames: L.NORTHSTAR_FIGURE, planOf: (o, t) => L.northstarPlanFor(o, t), compose: L.northstarCompose });
  const shape = (it) => JSON.stringify({ category: it.category, layers: it.layers, shadows: it.shadows, closed: !!it.closed });
  // D-274/D-275: the print tees are not this build's items; their published layers and the manifest's D-274 extension are kept as they are
  const printIds = new Set(Object.values(L.NORTHSTAR_PRINT_TEES).map((t) => t.item));
  const mismatch = Object.keys(L.NORTHSTAR_ITEMS).filter((id) => !printIds.has(id) && (!itemTable[id] || shape(L.NORTHSTAR_ITEMS[id]) !== shape(itemTable[id])));
  if (mismatch.length) throw new Error("NORTHSTAR_ITEMS must be: " + JSON.stringify(Object.fromEntries(mismatch.map((id) => [id, itemTable[id]]))));
  if (Object.keys(files).length > MAX_FILES || nShadows > MAX_SHADOWS) throw new Error("over the authorised count: " + Object.keys(files).length + " files, " + nShadows + " shadows");
  const previous = existsSync(join(OUT_DIR, "manifest.json")) ? JSON.parse(readFileSync(join(OUT_DIR, "manifest.json"), "utf8")) : { files: [] };
  const kept = previous.files.filter((f) => f.origin && f.origin.decision === "D-274"), extensions = previous.extensions || [];
  const entries = writeLayerSet(files, OUT_DIR, { cwebp: CWEBP, dwebp: DWEBP, keep: kept.map((f) => f.file) });
  const manifest = { decision: "D-242", authorisation: "owner 2026-10-28: at most 41 derived runtime layers tracked in the public repository and deployed under assets/avatar-northstar/ as a specific exception to D-127 §2 — not C, raw generations, reference sheets, review files or H1",
    canvas: { width: W, height: H }, flag: "AVATAR_NORTHSTAR_WARDROBE (js/avatar-layers.js), false", counts: { files: entries.length + kept.length, shadows: nShadows, maxFiles: MAX_FILES, maxShadows: MAX_SHADOWS, ...(kept.length ? { d242Files: entries.length, d274Files: kept.length } : {}) },
    outfits: Object.fromEntries(K.map(([k, o]) => [k, { ...o, reviewFullPngSha256: spec.reviewFullPngSha256[k] }])), knownFaulty: L.NORTHSTAR_KNOWN_FAULTY,
    equivalence: { what: "northstarCompose(northstarCanvasPlan(K)) — the browser's function — against the pipeline composite (layerProof + applyShadow), RGBA bytes that differ", outfits: equivalence },
    ...(extensions.length ? { extensions } : {}), files: [...entries, ...kept].sort((a, b) => (a.file < b.file ? -1 : 1)) };
  writeFileSync(join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(JSON.stringify({ files: entries.length, shadows: nShadows, bytes: entries.reduce((s, e) => s + e.bytes, 0), outfitsIdenticalToPipeline: Object.values(equivalence).filter((e) => !e.bytesDiffering).length }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error("REFUSED: " + e.message); process.exit(1); });
