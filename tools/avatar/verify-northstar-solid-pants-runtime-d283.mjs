// D-283 — THE PUBLISHED SOLID TROUSERS IN THE RUNTIME, verified on the owner's machine (needs C and the private item runs; no image call).
// Every file the browser draws is decoded from assets/avatar-northstar/ (the published bytes), then:
//   1. REACHABLE — every outfit the opt-in can show with trousers: each K outfit, without and with every print tee it allows, with each
//      approved trousers where northstarPantsAllowed lets them in (js/avatar-layers.js, the browser's own functions). Each reachable
//      top x shoe pair must be one D-281 checked (its staged outfit check passed for both trousers);
//   2. EQUIVALENCE — the runtime plan (northstarPlanFor over NORTHSTAR_ITEMS, the trousers' shadowsOf the olive trousers) and
//      northstarCompose must equal the item pipeline (layerProof + applyShadow) byte for byte for every distinct reachable outfit,
//      one top at a time;
//   3. FILES — every published file the pipeline also builds must decode to exactly the pipeline's pixels; the trousers' skin shadow
//      the pipeline builds must be the published olive trousers' shadow.
// With --record, the result is written into the manifest's D-281 extension. No file other than the manifest is written.
// Usage: node --expose-gc tools/avatar/verify-northstar-solid-pants-runtime-d283.mjs --dwebp <dwebp.exe> [--record]
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir, homedir } from "node:os";
import { decodePng } from "./r3-hair-tool-v2.mjs";
import * as IP from "./northstar-item-pilot.mjs";
import { loadItems, buildLayerSet } from "./build-northstar-runtime-assets.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", ".."), DIR = join(ROOT, "assets", "avatar-northstar");
const STAGED = join(homedir(), "Documents", "DenSejeApp-artefacts", "d-281-pants-solid-items");
const sha = (b) => createHash("sha256").update(b).digest("hex"), gc = () => { if (typeof globalThis.gc === "function") globalThis.gc(); };

/** Every distinct outfit the opt-in can show with approved trousers: [[label, outfit], …] keyed by top+bottom+shoes. */
export function reachablePantsOutfits(AL) {
  const seen = new Map();
  for (const k of Object.keys(AL.NORTHSTAR_OUTFITS)) for (const t of [null, ...Object.keys(AL.NORTHSTAR_PRINT_TEES).filter(() => AL.northstarTeeAllowed(k))]) for (const p of Object.keys(AL.NORTHSTAR_SOLID_PANTS)) {
    if (!AL.northstarPantsAllowed(k, t)) continue; const o = AL.northstarOutfitFor(k, t, p), id = [o.top, o.bottom, o.shoes].join("+");
    if (o.bottom !== AL.NORTHSTAR_SOLID_PANTS[p].item) throw new Error(k + ": the trousers were not applied");
    if (!seen.has(id)) seen.set(id, [k + (t ? "+" + t : "") + "+" + p, o]); }
  return [...seen.values()];
}

async function main() {
  const args = process.argv.slice(2), at = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), DWEBP = at("--dwebp");
  if (!DWEBP) throw new Error("--dwebp <the vendored dwebp>");
  const AL = await import(pathToFileURL(join(ROOT, "js", "avatar-layers.js")).href);
  const man = JSON.parse(readFileSync(join(DIR, "manifest.json"), "utf8")), ext = (man.extensions || []).find((e) => e.decision === "D-281");
  if (!ext) throw new Error("the manifest has no D-281 extension");
  for (const f of man.files) if (sha(readFileSync(join(DIR, f.file))) !== f.sha256) throw new Error("not the manifest's bytes: " + f.file);
  // 1. reachable, against D-281's staged outfit checks
  const reach = reachablePantsOutfits(AL), staged = JSON.parse(readFileSync(join(STAGED, "staging", "manifest.json"), "utf8"));
  if (sha(readFileSync(join(STAGED, "staging", "manifest.json"))) !== ext.stagedManifestSha256) throw new Error("not D-281's staged manifest");
  const pantsId = Object.fromEntries(Object.entries(AL.NORTHSTAR_SOLID_PANTS).map(([id, p]) => [p.item, id])), checkedPairs = new Set();
  for (const id of Object.values(pantsId)) for (const top of AL.NORTHSTAR_SOLID_PANTS_CHECKED.tops) for (const sh of AL.NORTHSTAR_SOLID_PANTS_CHECKED.shoes) {
    const u = JSON.parse(readFileSync(join(STAGED, "units", ({ "TS-NAV": "ts-navy", "TS-SND": "ts-sand" })[id] + "--" + top.replace("top-tee-hip-print-", "p-").replace("top-tee-hip-", "tee-") + "--" + sh.replace("shoes-", "") + ".json"), "utf8"));
    if (u.ok) checkedPairs.add(id + "|" + top + "|" + sh); }
  if (staged.outfitChecks.failed.length) throw new Error("D-281 recorded failed checks");
  const unchecked = reach.filter(([, o]) => !checkedPairs.has(pantsId[o.bottom] + "|" + o.top + "|" + o.shoes)); if (unchecked.length) throw new Error("reachable but not checked: " + unchecked.map(([k]) => k).join(", "));
  // 2 + 3. the equivalence on the published files, one top at a time
  const tmp = join(tmpdir(), "d283-" + process.pid); mkdirSync(tmp, { recursive: true });
  const dec = (f) => { const o = join(tmp, "x.png"); execFileSync(DWEBP, ["-quiet", join(DIR, f), "-o", o]); return Uint8ClampedArray.from(decodePng(readFileSync(o)).px); };
  try {
    const spec = JSON.parse(readFileSync(join(ROOT, "tools", "avatar", "fixtures", "northstar-wardrobe", "runtime-assets-inputs-d242.json"), "utf8"));
    const base = loadItems(Object.fromEntries([AL.NORTHSTAR_PRINT_TEE_BASE, "top-tee-hip-blue", AL.NORTHSTAR_SOLID_PANTS_BASE, ...AL.NORTHSTAR_SOLID_PANTS_CHECKED.shoes].map((id) => [id, spec.items[id]])));
    const published = new Set(man.files.map((f) => f.file)), compared = new Set(), equivalence = {}, cBuf = IP.readC(), oliveShadow = dec(AL.NORTHSTAR_SOLID_PANTS_BASE + "-shadow-body-v1.webp");
    const pantsP = Object.fromEntries(Object.values(AL.NORTHSTAR_SOLID_PANTS).map((p) => [p.item, { item: p.item, layers: { pants: dec(p.item + "-pants-v1.webp") }, shadow: base.P[AL.NORTHSTAR_SOLID_PANTS_BASE].shadow, category: "bottom", covering: "none" }]));
    const tops = [...new Set(reach.map(([, o]) => o.top))];
    for (const top of tops) {
      const P = { ...pantsP }, origin = {};
      for (const id of AL.NORTHSTAR_SOLID_PANTS_CHECKED.shoes) { P[id] = base.P[id]; origin[id] = base.origin[id]; }
      P[top] = base.P[top] || { item: top, layers: { topBody: dec(top + "-top-body-v1.webp"), sleeves: dec(top + "-sleeves-v1.webp") }, shadow: base.P[AL.NORTHSTAR_PRINT_TEE_BASE].shadow, category: "top", covering: "none" };
      origin[top] = base.origin[top] || { decision: "D-274", published: "assets/avatar-northstar/" }; for (const id of Object.keys(pantsP)) origin[id] = { decision: "D-281", published: "assets/avatar-northstar/" };
      // the plans name the olive trousers' shadow (shadowsOf), so the chunk also builds the olive trousers' files through one outfit of
      // its own (a shadow source, compared like the rest but not counted as reachable)
      P[AL.NORTHSTAR_SOLID_PANTS_BASE] = base.P[AL.NORTHSTAR_SOLID_PANTS_BASE]; origin[AL.NORTHSTAR_SOLID_PANTS_BASE] = base.origin[AL.NORTHSTAR_SOLID_PANTS_BASE];
      const sources = [top]; if (P[top].item !== AL.NORTHSTAR_PRINT_TEE_BASE && !base.P[top]) { sources.push(AL.NORTHSTAR_PRINT_TEE_BASE); P[AL.NORTHSTAR_PRINT_TEE_BASE] = base.P[AL.NORTHSTAR_PRINT_TEE_BASE]; origin[AL.NORTHSTAR_PRINT_TEE_BASE] = base.origin[AL.NORTHSTAR_PRINT_TEE_BASE]; }
      const outfits = [...reach.filter(([, o]) => o.top === top), ...sources.map((s) => ["(shadow source) " + s, { top: s, bottom: AL.NORTHSTAR_SOLID_PANTS_BASE, shoes: AL.NORTHSTAR_SOLID_PANTS_CHECKED.shoes[0] }])];
      const set = buildLayerSet({ P, origin, outfits, figureNames: AL.NORTHSTAR_FIGURE, planOf: (o) => AL.northstarPlanFor(o), compose: AL.northstarCompose, cBuf });
      for (const k of Object.keys(set.equivalence)) if (k.startsWith("(shadow source)")) { if (set.equivalence[k].bytesDiffering) throw new Error(k + " differs"); delete set.equivalence[k]; }
      for (const [name, f] of Object.entries(set.files)) {
        if (/^bottom-trousers-square-(navy|sand)-shadow-body-v1\.webp$/.test(name)) { for (let i = 0; i < f.px.length; i++) if (f.px[i] !== oliveShadow[i]) throw new Error(name + " is not the published olive shadow"); continue; }
        if (!published.has(name)) { if (!/^top-tee-hip-print-.*-shadow-/.test(name)) throw new Error("built but not published: " + name); continue; }
        if (compared.has(name)) continue; const px = dec(name); for (let i = 0; i < px.length; i++) if (px[i] !== f.px[i]) throw new Error(name + ": the published file differs from the pipeline at byte " + i); compared.add(name); }
      Object.assign(equivalence, set.equivalence); gc(); }
    const pairs = [...new Set(reach.map(([, o]) => o.top + " + " + o.shoes))].sort();
    const result = { what: "northstarCompose(northstarPlanFor(outfit)) on the published files against the pipeline composite (layerProof + applyShadow), RGBA bytes that differ; every distinct outfit the opt-in can show with the approved trousers",
      reachableOutfits: reach.length, outfitsDiffering: Object.values(equivalence).filter((e) => e.bytesDiffering).length, reachableTopShoePairs: pairs.length, allReachableChecked: true,
      notReachableButChecked: AL.NORTHSTAR_SOLID_PANTS_CHECKED.tops.flatMap((t) => AL.NORTHSTAR_SOLID_PANTS_CHECKED.shoes.map((s) => t + " + " + s)).filter((x) => !pairs.includes(x)).length,
      publishedFilesIdenticalToPipeline: compared.size, trousersShadowIsOlives: true };
    if (args.includes("--record")) { ext.equivalence = result; writeFileSync(join(DIR, "manifest.json"), JSON.stringify(man, null, 2) + "\n"); }
    console.log(JSON.stringify(result));
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error("REFUSED: " + e.message); process.exit(1); });
