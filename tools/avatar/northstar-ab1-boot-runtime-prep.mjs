// D-326 — THE RUNTIME LAYERS OF THE TWO OWNER-APPROVED AB-1 ANKLE BOOTS, PREPARED PRIVATELY, AND THE COMBINATIONS THE NORTHSTAR OPT-IN
// COULD REACH WITH THEM (offline; no image call; nothing published; no runtime code, catalogue, shop or flag changed).
// The owner approved two concrete items of D-325 (ab1-boot-owner-approval-v1.json): the original colour and the light sand layer, as
// shown. Black + gum is not covered. Every view shows C: --out must be outside the repository.
//   stage  — per approved boot: its layer, unchanged (<item>-shoes-v1.webp; the approval's pixel sha256 is checked, no look change), and
//            its covering mask (hide-<item>-v1.webp, closedFootwearHidden as D-242/D-305 build it); lossless WebP (D-242's arguments),
//            each decoded back byte for byte. The skin shadow is the published ankle boot's (shadowsOf "shoes-ankleboots-brown"), as in
//            D-325's renderings: no new shadow file; how far that shadow reaches outside each boot is measured. Then the browser's own
//            northstarPlanFor + northstarCompose over the staged and published files must equal D-325's shown renderings (cream tee x 6
//            bottoms x 2 boots) byte for byte.
//   map    — every outfit the opt-in can compose (each K outfit, without and with every print tee and trousers it allows) with each
//            approved boot in place of its shoes; known-faulty outfits left out; those D-325 already checked and showed are marked.
//   check  — sequentially, one top at a time (memory), each combination D-325 did not check: R1.checkOutfit UNCHANGED (fit and seams,
//            with the boot's covering), the pipeline composite (layerProof + applyShadow), and northstarCompose(northstarPlanFor) over
//            the staged + published files against it byte for byte; each unit cached (units/<id>.json) and its composite kept.
//   sheet  — contact sheets of the hems and boots per boot (rows: tops, columns: bottoms) for the visual pass.
// Nothing here approves a combination or publishes a file.
// Usage: node --expose-gc tools/avatar/northstar-ab1-boot-runtime-prep.mjs --phase stage|map|check|sheet --study <D-325 dir> --out <dir> --cwebp <exe> --dwebp <exe>
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { decodePng, encodePng } from "./r3-hair-tool-v2.mjs";
import * as WR from "./northstar-wardrobe.mjs";
import * as BC from "./northstar-base-figure-c.mjs";
import * as IP from "./northstar-item-pilot.mjs";
import * as R1 from "./northstar-r1-garment.mjs";
import { writeLayerSet, loadItems } from "./build-northstar-runtime-assets.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", ".."), { W, N } = WR, H = N / W, PUBLIC = join(ROOT, "assets", "avatar-northstar");
const sha = (b) => createHash("sha256").update(b).digest("hex"), gc = () => { if (typeof globalThis.gc === "function") globalThis.gc(); };
export const APPROVAL_REL = "tools/avatar/fixtures/northstar-wardrobe/shoe-source/ab1-boot-owner-approval-v1.json";
/** The skin shadow the boots reuse (the published ankle boot's, as D-325 rendered them). */
export const SHADOW_OF = "shoes-ankleboots-brown";
/** The item table entry each boot would have: the published ankle boot's shape, its skin shadow reused (shadowsOf), closed footwear. */
export const RUNTIME_ITEM_SHAPE = Object.freeze({ category: "shoes", layers: Object.freeze(["shoes"]), shadows: Object.freeze(["body"]), closed: true, shadowsOf: SHADOW_OF });
const SHOWN_BOTTOMS = Object.freeze(["skirt-sand", "shorts-navy", "capri-lightblue", "trousers-square-olive", "trousers-square-navy", "trousers-square-sand"]);
const slugOf = (design) => design.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function approval() { return JSON.parse(readFileSync(join(ROOT, APPROVAL_REL), "utf8")); }
/** The opt-in's composable outfits with each approved boot: [{ id, top, bottom, boot, item, shownInD325, reachableAs }], fixed order. */
export function combinations(AL, A = approval()) {
  const seen = new Map(), topId = (top) => { const p = Object.entries(AL.NORTHSTAR_PRINT_TEES).find(([, t]) => t.item === top); return p ? p[0] : top.replace("top-", "").replace("-hip", ""); };
  for (const k of Object.keys(AL.NORTHSTAR_OUTFITS)) for (const t of [null, ...Object.keys(AL.NORTHSTAR_PRINT_TEES)]) for (const p of [null, ...Object.keys(AL.NORTHSTAR_SOLID_PANTS)]) {
    const o = AL.northstarOutfitFor(k, t, p); if (!o || AL.NORTHSTAR_KNOWN_FAULTY.includes(o.top + "+" + o.bottom + "+" + o.shoes)) continue;
    for (const b of A.approved) { const key = o.top + "+" + o.bottom + "+" + b.proposedRuntimeItem; if (seen.has(key)) continue;
      seen.set(key, { id: b.id + "--" + topId(o.top) + "--" + o.bottom.replace("bottom-", ""), key, top: o.top, bottom: o.bottom, boot: b.id, item: b.proposedRuntimeItem,
        shownInD325: o.top === "top-tee-hip-cream" && SHOWN_BOTTOMS.includes(o.bottom.replace("bottom-", "")), reachableAs: [k, t, p].filter(Boolean).join("+") }); } }
  const order = (c) => [c.top.includes("print") ? 2 : c.top.includes("blue") ? 1 : 0, c.top, c.bottom, c.boot].join("|");
  return [...seen.values()].sort((a, b) => (order(a) < order(b) ? -1 : 1));
}

async function main() {
  const args = process.argv.slice(2), at = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), phase = at("--phase"), OUT = at("--out"), STUDY = at("--study"), CW = at("--cwebp"), DW = at("--dwebp");
  for (const d of [OUT, STUDY]) { const r = relative(ROOT, resolve(d || ".")); if (!d || !(r.startsWith("..") || isAbsolute(r))) throw new Error("--out and --study must be outside the repository (the views show C)"); }
  mkdirSync(OUT, { recursive: true }); const AL = await import(pathToFileURL(join(ROOT, "js", "avatar-layers.js")).href), A = approval();
  if (phase === "map") { const c = combinations(AL, A); writeFileSync(join(OUT, "combinations.json"), JSON.stringify({ count: c.length, shownInD325: c.filter((x) => x.shownInD325).length, combinations: c }, null, 2) + "\n"); return console.log(JSON.stringify({ count: c.length, shownInD325: c.filter((x) => x.shownInD325).length })); }
  if (!DW) throw new Error("--dwebp");
  if (phase === "stage") { if (!CW) throw new Error("--cwebp"); return phaseStage(AL, A, OUT, STUDY, CW, DW); }
  if (phase === "check") return phaseCheck(AL, A, OUT, DW);
  if (phase === "sheet") return phaseSheet(A, OUT);
  throw new Error("--phase stage|map|check|sheet");
}

function decoder(DW, OUT) {
  const tmp = join(tmpdir(), "d326-" + process.pid); mkdirSync(tmp, { recursive: true }); const cache = new Map(), staged = join(OUT, "staging");
  const dec = (f) => { if (!cache.has(f)) { const o = join(tmp, "x.png"); execFileSync(DW, ["-quiet", existsSync(join(staged, f)) ? join(staged, f) : join(PUBLIC, f), "-o", o]); cache.set(f, Uint8ClampedArray.from(decodePng(readFileSync(o)).px)); } return cache.get(f); };
  return { dec, cache, done: () => rmSync(tmp, { recursive: true, force: true }) };
}
const tableOf = (AL, A) => ({ ...AL.NORTHSTAR_ITEMS, ...Object.fromEntries(A.approved.map((b) => [b.proposedRuntimeItem, RUNTIME_ITEM_SHAPE])) });

async function phaseStage(AL, A, OUT, STUDY, CW, DW) {
  const w = WR.buildWardrobe(), base = BC.prepareBase(w, Uint8ClampedArray.from(decodePng(IP.readC()).px)), arms = base.arms, files = {}, layer = {}, stagedDir = join(OUT, "staging");
  for (const b of A.approved) { const px = Uint8ClampedArray.from(decodePng(readFileSync(join(STUDY, "layers", slugOf(b.design) + ".png"))).px);
    if (sha(Buffer.from(px.buffer)) !== b.layer.pixelSha256) throw new Error(b.id + ": not the approved layer"); layer[b.id] = px;
    const hide = BC.closedFootwearHidden(base, px), m = new Uint8ClampedArray(N * 4);
    for (let i = 0; i < N; i++) if (hide[i]) { if (arms[i * 4 + 3]) throw new Error(b.id + ": the covering reaches C's arms"); m.set([255, 255, 255, 255], i * 4); }
    files[b.proposedRuntimeItem + "-shoes-v1.webp"] = { px, purpose: "the owner-approved ankle boot " + b.id + " (D-326), the approved D-325 layer unchanged", origin: { approved: b.id, layerPixelSha256: b.layer.pixelSha256, approval: APPROVAL_REL } };
    files["hide-" + b.proposedRuntimeItem + "-v1.webp"] = { px: m, purpose: "what the closed boot " + b.id + " hides of C's foot (D-218 covering)", origin: { approved: b.id, cSha256: BC.C_RAW_SHA256, tool: "northstar-base-figure-c.mjs closedFootwearHidden" } }; }
  mkdirSync(stagedDir, { recursive: true }); const entries = writeLayerSet(files, stagedDir, { cwebp: CW, dwebp: DW }); gc();
  const D = decoder(DW, OUT), table = tableOf(AL, A), eq = {}, shadow = {};
  try {
    // the reused shadow: its darkening outside each boot (on skin the boot does not cover) against the published ankle boot's own
    const sh = D.dec(SHADOW_OF + "-shadow-body-v1.webp"), refHide = D.dec("hide-" + SHADOW_OF + "-v1.webp"), refShoe = D.dec(SHADOW_OF + "-shoes-v1.webp");
    const outside = (shoe, hide) => { let n = 0, s = 0; for (let i = 0; i < N; i++) { const a = sh[i * 4 + 3]; if (!a || shoe[i * 4 + 3] || hide[i * 4 + 3]) continue; n++; s += a; } return { px: n, meanAlpha: n ? +(s / n).toFixed(1) : 0 }; };
    shadow.reference = outside(refShoe, refHide);
    for (const b of A.approved) shadow[b.id] = outside(layer[b.id], D.dec("hide-" + b.proposedRuntimeItem + "-v1.webp"));
    for (const b of A.approved) for (const bt of SHOWN_BOTTOMS) { const o = { top: "top-tee-hip-cream", bottom: "bottom-" + bt, shoes: b.proposedRuntimeItem }, plan = AL.northstarPlanFor(o, table, "ns");
      if (!plan) throw new Error(b.id + " " + bt + ": no plan"); const got = AL.northstarCompose(plan, (src) => D.dec(src.replace(/^ns\//, "")), N), want = Uint8ClampedArray.from(decodePng(readFileSync(join(STUDY, "full", slugOf(b.design) + "--" + bt + ".png"))).px);
      let diff = 0; for (let i = 0; i < N * 4; i++) if (got[i] !== want[i]) diff++; eq[b.id + "--" + bt] = { differingBytes: diff, renderingPixelSha256: sha(Buffer.from(want.buffer)), approvedPixelSha256: b.shownRenderings["top-tee-hip-cream+bottom-" + bt].pixelSha256 };
      if (eq[b.id + "--" + bt].renderingPixelSha256 !== eq[b.id + "--" + bt].approvedPixelSha256) throw new Error(b.id + " " + bt + ": not the shown rendering"); if (diff) throw new Error(b.id + " " + bt + ": " + diff + " bytes differ from the shown rendering"); gc(); }
  } finally { D.done(); }
  const manifest = { decision: "D-326", status: "STAGED PRIVATELY — NOT PUBLISHED; publishing needs the owner's separate permission naming these files and hashes", approval: { file: APPROVAL_REL, sha256: sha(readFileSync(join(ROOT, APPROVAL_REL))) }, itemShape: RUNTIME_ITEM_SHAPE, files: entries, reusedShadow: { file: SHADOW_OF + "-shadow-body-v1.webp", outsideTheBoot: shadow }, equivalence: eq };
  writeFileSync(join(OUT, "staging-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(JSON.stringify({ files: entries.map((e) => [e.file, e.sha256, e.bytes]), shadow, equivalence: Object.values(eq).every((e) => e.differingBytes === 0) ? Object.keys(eq).length + "/" + Object.keys(eq).length + " byte-identical" : eq }));
}

async function phaseCheck(AL, A, OUT, DW) {
  const C = JSON.parse(readFileSync(join(OUT, "combinations.json"), "utf8")).combinations.filter((c) => !c.shownInD325), D = decoder(DW, OUT), table = tableOf(AL, A);
  const man = JSON.parse(readFileSync(join(PUBLIC, "manifest.json"), "utf8")), sm = JSON.parse(readFileSync(join(OUT, "staging-manifest.json"), "utf8")), fileSha = new Map([...man.files, ...sm.files].map((e) => [e.file, e.sha256]));
  mkdirSync(join(OUT, "units"), { recursive: true }); mkdirSync(join(OUT, "full"), { recursive: true });
  const spec = JSON.parse(readFileSync(join(ROOT, "tools", "avatar", "fixtures", "northstar-wardrobe", "runtime-assets-inputs-d242.json"), "utf8"));
  const base0 = ["top-tee-hip-cream", "top-tee-hip-blue", "bottom-skirt-sand", "bottom-shorts-navy", "bottom-capri-lightblue", "bottom-trousers-square-olive", SHADOW_OF];
  const { P } = loadItems(Object.fromEntries(base0.map((id) => [id, spec.items[id]])));
  for (const p of Object.values(AL.NORTHSTAR_SOLID_PANTS)) P[p.item] = { item: p.item, layers: { pants: D.dec(p.item + "-pants-v1.webp") }, shadow: P[AL.NORTHSTAR_SOLID_PANTS_BASE].shadow, category: "bottom", covering: "none" };
  for (const b of A.approved) P[b.proposedRuntimeItem] = { item: b.proposedRuntimeItem, layers: { shoes: D.dec(b.proposedRuntimeItem + "-shoes-v1.webp") }, shadow: P[SHADOW_OF].shadow, category: "shoes", covering: "closed-footwear" };
  const w = WR.buildWardrobe(), base = BC.prepareBase(w, Uint8ClampedArray.from(decodePng(IP.readC()).px)), keep = new Set([...D.cache.keys()]), results = {}; let currentTop = null;
  try {
    for (const c of C) {
      if (c.top !== currentTop) { for (const k of [...D.cache.keys()]) if (!keep.has(k) && !k.startsWith("figure-") && !k.includes("shadow")) D.cache.delete(k); if (currentTop && currentTop.includes("print")) delete P[currentTop]; currentTop = c.top; gc();
        if (c.top.includes("print")) P[c.top] = { item: c.top, layers: { topBody: D.dec(c.top + "-top-body-v1.webp"), sleeves: D.dec(c.top + "-sleeves-v1.webp") }, shadow: P[AL.NORTHSTAR_PRINT_TEE_BASE].shadow, category: "top", covering: "none" }; }
      const o = { top: c.top, bottom: c.bottom, shoes: c.item }, plan = AL.northstarPlanFor(o, table, "ns"), planFiles = plan ? [...new Set(plan.flatMap((s) => [s.src, s.cut].filter(Boolean).map((x) => x.split("/").pop())))] : [];
      const keyIn = sha(JSON.stringify([o, planFiles.map((f) => fileSha.get(f) || "missing:" + f), IP.METHODS[IP.METHOD].outfitRevision || "d223"]));
      const uf = join(OUT, "units", c.id + ".json"); if (existsSync(uf) && JSON.parse(readFileSync(uf, "utf8")).key === keyIn && existsSync(join(OUT, "full", c.id + ".png"))) { results[c.id] = JSON.parse(readFileSync(uf, "utf8")); continue; }
      const missing = planFiles.filter((f) => !fileSha.has(f)), x = R1.checkOutfit(w, base, [P[c.top], P[c.bottom], P[c.item]]);
      const oc = x.ok ? { checks: [] } : BC.outfitCheck(w, base, x.proof, { revision: IP.METHODS[IP.METHOD].outfitRevision || "d223" }), seams = {};
      for (const ch of oc.checks.filter((q) => !q.ok)) { const v = ch.value || {}, pcs = [...(v.doubles || []), ...(v.slits || []), ...(v.cuts || [])]; seams[ch.id] = [...new Set(pcs.map((p) => p.seam))]; }
      let comp = x.proof.dressedRuntime; for (const id of [c.top, c.bottom, c.item]) comp = IP.applyShadow(comp, x.proof.stack, P[id].shadow);
      let diff = -1; if (plan && !missing.length) { const got = AL.northstarCompose(plan, (src) => D.dec(src.split("/").pop()), N); diff = 0; for (let i = 0; i < N * 4; i++) if (got[i] !== comp[i]) diff++; }
      writeFileSync(join(OUT, "full", c.id + ".png"), encodePng(W, H, comp));
      const u = { key: keyIn, id: c.id, top: c.top, bottom: c.bottom, boot: c.boot, technical: x.ok ? "PASS" : "FAIL", failed: x.failed, seams, plan: !!plan, missingAssets: missing, runtimeBytesDiffering: diff };
      writeFileSync(uf, JSON.stringify(u, null, 2) + "\n"); results[c.id] = u; x.proof = null; comp = null; gc();
      if (Object.keys(results).length % 20 === 0) console.log(Object.keys(results).length + "/" + C.length, Math.round(process.memoryUsage().rss / 1048576) + " MB"); }
  } finally { D.done(); }
  const all = Object.values(results), summary = { units: all.length, pass: all.filter((u) => u.technical === "PASS").length, fail: all.filter((u) => u.technical === "FAIL").map((u) => u.id + ": " + u.failed.join("|") + " " + JSON.stringify(u.seams)),
    runtimeEquivalent: all.filter((u) => u.runtimeBytesDiffering === 0).length, missingAssets: all.filter((u) => u.missingAssets.length).length };
  writeFileSync(join(OUT, "check.json"), JSON.stringify({ summary, units: results }, null, 2) + "\n"); console.log(JSON.stringify(summary));
}

function phaseSheet(A, OUT) {
  const C = JSON.parse(readFileSync(join(OUT, "combinations.json"), "utf8")).combinations.filter((c) => !c.shownInD325), BX = [330, 1250, 700, 1536], k = 2, cw = (BX[2] - BX[0]) / k, ch = (BX[3] - BX[1]) / k, gap = 4;
  mkdirSync(join(OUT, "sheets"), { recursive: true });
  for (const b of A.approved) { const mine = C.filter((c) => c.boot === b.id), tops = [...new Set(mine.map((c) => c.top))], bottoms = [...new Set(mine.map((c) => c.bottom))].sort();
    const sw = bottoms.length * (cw + gap), sh = tops.length * (ch + gap), o = new Uint8ClampedArray(sw * sh * 4).fill(255);
    for (const c of mine) { const P = decodePng(readFileSync(join(OUT, "full", c.id + ".png"))).px, ox = bottoms.indexOf(c.bottom) * (cw + gap), oy = tops.indexOf(c.top) * (ch + gap);
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const j = ((oy + y) * sw + ox + x) * 4, acc = [0, 0, 0, 0];
        for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) { const i = ((BX[1] + y * k + dy) * W + BX[0] + x * k + dx) * 4, a = P[i + 3] / 255; for (let q = 0; q < 3; q++) acc[q] += P[i + q] * a + 236 * (1 - a); }
        for (let q = 0; q < 3; q++) o[j + q] = Math.round(acc[q] / (k * k)); o[j + 3] = 255; } }
    writeFileSync(join(OUT, "sheets", b.id + ".png"), encodePng(sw, sh, o)); writeFileSync(join(OUT, "sheets", b.id + ".json"), JSON.stringify({ rows: tops, columns: bottoms }, null, 1) + "\n"); gc(); }
  console.log(JSON.stringify({ sheets: A.approved.map((b) => b.id) }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error("REFUSED: " + e.message); process.exit(1); });
