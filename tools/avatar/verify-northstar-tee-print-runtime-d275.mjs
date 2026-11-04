// D-275 — THE PUBLISHED PRINT TEES IN THE RUNTIME, verified on the owner's machine (needs C and the private item runs; no image call).
// Every file the browser draws is decoded from assets/avatar-northstar/ (the published bytes), then:
//   1. the runtime plan (js/avatar-layers.js northstarPlanFor over NORTHSTAR_ITEMS, with the print tees' shadowsOf) and
//      northstarCompose — the browser's own functions — must equal the item pipeline (layerProof + applyShadow) byte for byte for
//      the 9 cream-tee outfits K01–K09 and for every approved print tee in place of their top (16 x 9 = 144 outfits): the partners the
//      cut was checked with, no other combination;
//   2. every published file the pipeline also builds (the figure, the closed shoes' masks, the partners' layers and shadows, the
//      cream tee and its shadows, the 32 print layers) must decode to exactly the pipeline's pixels.
// With --record, the result is written into the manifest's D-274 extension (equivalence). No file other than the manifest is written.
// Usage: node tools/avatar/verify-northstar-tee-print-runtime-d275.mjs --dwebp <dwebp.exe> [--record]
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { decodePng } from "./r3-hair-tool-v2.mjs";
import * as IP from "./northstar-item-pilot.mjs";
import { loadItems, buildLayerSet } from "./build-northstar-runtime-assets.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", ".."), DIR = join(ROOT, "assets", "avatar-northstar");
const sha = (b) => createHash("sha256").update(b).digest("hex");

async function main() {
  const args = process.argv.slice(2), at = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), DWEBP = at("--dwebp");
  if (!DWEBP) throw new Error("--dwebp <the vendored dwebp>");
  const AL = await import(pathToFileURL(join(ROOT, "js", "avatar-layers.js")).href);
  const man = JSON.parse(readFileSync(join(DIR, "manifest.json"), "utf8")), ext = (man.extensions || []).find((e) => e.decision === "D-274");
  if (!ext) throw new Error("the manifest has no D-274 extension");
  for (const f of man.files) if (sha(readFileSync(join(DIR, f.file))) !== f.sha256) throw new Error("not the manifest's bytes: " + f.file);
  const tmp = join(tmpdir(), "d275-" + process.pid); mkdirSync(tmp, { recursive: true });
  const decoded = {}; const dec = (f) => { if (!decoded[f]) { const o = join(tmp, "x.png"); execFileSync(DWEBP, ["-quiet", join(DIR, f), "-o", o]); decoded[f] = Uint8ClampedArray.from(decodePng(readFileSync(o)).px); } return decoded[f]; };
  try {
    const K = Object.keys(AL.NORTHSTAR_OUTFITS).filter((k) => AL.northstarTeeAllowed(k)), tees = Object.keys(AL.NORTHSTAR_PRINT_TEES);
    const partnerIds = [...new Set(K.flatMap((k) => [AL.NORTHSTAR_OUTFITS[k].bottom, AL.NORTHSTAR_OUTFITS[k].shoes]))];
    const spec = JSON.parse(readFileSync(join(ROOT, "tools", "avatar", "fixtures", "northstar-wardrobe", "runtime-assets-inputs-d242.json"), "utf8"));
    const { P, origin } = loadItems(Object.fromEntries([AL.NORTHSTAR_PRINT_TEE_BASE, ...partnerIds].map((id) => [id, spec.items[id]])));
    for (const t of tees) { const id = AL.NORTHSTAR_PRINT_TEES[t].item;
      P[id] = { item: id, layers: { topBody: dec(id + "-top-body-v1.webp"), sleeves: dec(id + "-sleeves-v1.webp") }, shadow: P[AL.NORTHSTAR_PRINT_TEE_BASE].shadow, category: "top", covering: "none" };
      origin[id] = { decision: "D-274", approval: t, published: "assets/avatar-northstar/" }; }
    const outfits = [...K.map((k) => [k, AL.NORTHSTAR_OUTFITS[k]]), ...tees.flatMap((t) => K.map((k) => [k + "+" + t, AL.northstarOutfitFor(k, t)]))];
    for (const [k, o] of outfits) if (k.includes("+") && o.top !== AL.NORTHSTAR_PRINT_TEES[k.split("+")[1]].item) throw new Error(k + ": the print tee is not allowed here");
    const set = buildLayerSet({ P, origin, outfits, figureNames: AL.NORTHSTAR_FIGURE, planOf: (o) => AL.northstarPlanFor(o), compose: AL.northstarCompose, cBuf: IP.readC() });
    // the published files against the pipeline's pixels (the print tees' own shadow names are not published: shadowsOf reuses the cream tee's)
    const published = new Set(man.files.map((f) => f.file)), compared = [];
    for (const [name, f] of Object.entries(set.files)) { if (!published.has(name)) { if (!/^top-tee-hip-print-.*-shadow-/.test(name)) throw new Error("built but not published: " + name); continue; }
      const px = dec(name); for (let i = 0; i < px.length; i++) if (px[i] !== f.px[i]) throw new Error(name + ": the published file differs from the pipeline at byte " + i); compared.push(name); }
    const differing = Object.entries(set.equivalence).filter(([, e]) => e.bytesDiffering).length;
    const result = { what: "northstarCompose(northstarPlanFor(outfit)) on the published files against the pipeline composite (layerProof + applyShadow), RGBA bytes that differ; K01–K09 and each approved print tee in place of their top",
      outfits: Object.keys(set.equivalence).length, printOutfits: outfits.filter(([k]) => k.includes("+")).length, outfitsDiffering: differing, publishedFilesIdenticalToPipeline: compared.length, partners: partnerIds };
    if (args.includes("--record")) { ext.equivalence = result; writeFileSync(join(DIR, "manifest.json"), JSON.stringify(man, null, 2) + "\n"); }
    console.log(JSON.stringify(result));
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error("REFUSED: " + e.message); process.exit(1); });
