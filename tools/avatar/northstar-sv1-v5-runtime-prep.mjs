// D-305 — THE RUNTIME LAYERS OF THE OWNER-APPROVED SV1-V5 SHOES, PREPARED PRIVATELY (offline; no image call; nothing published).
// The owner approved 21 concrete combinations of D-304 (sv1-v5-owner-approval-v1.json): the cream tee over a named bottom with one of
// the four locked candidate layers. This tool stages, OUTSIDE the repository, the files the Northstar opt-in would need for them and
// checks them against the approved renderings; it changes no public file, no runtime code, no catalogue and no flag.
//   files       — per approved shoe: its layer, unchanged (<item>-shoes-v1.webp), and its covering mask (hide-<item>-v1.webp,
//                 closedFootwearHidden as D-242 builds it); lossless WebP (D-242's cwebp arguments), each decoded back byte for byte.
//                 The skin shadow is the published sneakers-beige shadow (shadowsOf), as in D-304's renderings: no new shadow file.
//   locked      — every candidate layer must have the package's sha256 (no look change).
//   equivalence — for each of the 21 approved combinations: the browser's own plan and compose (js/avatar-layers.js northstarPlanFor +
//                 northstarCompose, the staged files plus the published ones) must equal D-304's approved rendering byte for byte.
// Usage: node --expose-gc tools/avatar/northstar-sv1-v5-runtime-prep.mjs --package <D-304 dir> --out <staging dir> --cwebp <exe> --dwebp <exe>
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { decodePng } from "./r3-hair-tool-v2.mjs";
import * as WR from "./northstar-wardrobe.mjs";
import * as BC from "./northstar-base-figure-c.mjs";
import * as IP from "./northstar-item-pilot.mjs";
import { writeLayerSet } from "./build-northstar-runtime-assets.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", ".."), { W, N } = WR, PUBLIC = join(ROOT, "assets", "avatar-northstar");
const sha = (b) => createHash("sha256").update(b).digest("hex"), gc = () => { if (typeof globalThis.gc === "function") globalThis.gc(); };
export const APPROVAL_REL = "tools/avatar/fixtures/northstar-wardrobe/shoe-source/sv1-v5-owner-approval-v1.json";
/** The proposed runtime item ID of each approved candidate (the opt-in choice ID stays the candidate ID). */
export const RUNTIME_ITEMS = Object.freeze({ "SV1-V5-CHALK": "shoes-sneakers-low-sv1-chalk", "SV1-V5-CHARCOAL": "shoes-sneakers-low-sv1-charcoal", "SV1-V5-NAVYWHITE": "shoes-sneakers-low-sv1-navywhite", "SV1-V5-BURGUNDYGUM": "shoes-sneakers-low-sv1-burgundygum" });
/** The item table entry each would have: the published sneaker's shape, its skin shadow reused (shadowsOf), closed footwear. */
export const RUNTIME_ITEM_SHAPE = Object.freeze({ category: "shoes", layers: Object.freeze(["shoes"]), shadows: Object.freeze(["body"]), closed: true, shadowsOf: "shoes-sneakers-beige" });

async function main() {
  const args = process.argv.slice(2), at = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), PKG = at("--package"), OUT = at("--out"), CW = at("--cwebp"), DW = at("--dwebp");
  for (const d of [PKG, OUT]) { const r = relative(ROOT, resolve(d || ".")); if (!d || !(r.startsWith("..") || isAbsolute(r))) throw new Error("--package and --out must be outside the repository"); }
  if (!CW || !DW) throw new Error("--cwebp and --dwebp");
  const AL = await import(pathToFileURL(join(ROOT, "js", "avatar-layers.js")).href), A = JSON.parse(readFileSync(join(ROOT, APPROVAL_REL), "utf8"));
  const M = JSON.parse(readFileSync(join(ROOT, A.package.file), "utf8")); if (sha(readFileSync(join(ROOT, A.package.file))) !== A.package.sha256) throw new Error("not the approved package manifest");
  // locked layers
  const ids = [...new Set(A.combinations.map((c) => c.candidate))], layer = {};
  for (const id of ids) { const px = Uint8ClampedArray.from(decodePng(readFileSync(join(PKG, "layers", id + ".png"))).px); if (sha(Buffer.from(px.buffer)) !== M.candidates[id].layerSha256) throw new Error(id + ": not the locked layer"); layer[id] = px; }
  // files: layer + covering mask per approved shoe
  const w = WR.buildWardrobe(), base = BC.prepareBase(w, Uint8ClampedArray.from(decodePng(IP.readC()).px)), arms = base.arms, files = {};
  for (const id of ids) { const item = RUNTIME_ITEMS[id], hide = BC.closedFootwearHidden(base, layer[id]), m = new Uint8ClampedArray(N * 4);
    for (let i = 0; i < N; i++) if (hide[i]) { if (arms[i * 4 + 3]) throw new Error(id + ": the covering reaches C's arms"); m.set([255, 255, 255, 255], i * 4); }
    files[item + "-shoes-v1.webp"] = { px: layer[id], purpose: "the owner-approved shoe " + id + " (D-305), the locked D-304 layer unchanged", origin: { candidate: id, layerSha256: M.candidates[id].layerSha256, package: M.package } };
    files["hide-" + item + "-v1.webp"] = { px: m, purpose: "what the closed shoe " + id + " hides of C's foot (D-218 covering)", origin: { candidate: id, cSha256: BC.C_RAW_SHA256, tool: "northstar-base-figure-c.mjs closedFootwearHidden" } }; }
  mkdirSync(OUT, { recursive: true }); const entries = writeLayerSet(files, OUT, { cwebp: CW, dwebp: DW }); gc();
  // equivalence: the browser's plan and compose over staged + published files, against D-304's approved renderings
  const table = { ...AL.NORTHSTAR_ITEMS, ...Object.fromEntries(ids.map((id) => [RUNTIME_ITEMS[id], RUNTIME_ITEM_SHAPE])) }, staged = new Set(entries.map((e) => e.file));
  const tmp = join(tmpdir(), "d305-" + process.pid); mkdirSync(tmp, { recursive: true }); const cache = new Map();
  const pixelsOf = (src) => { const f = src.replace(/^ns\//, ""); if (!cache.has(f)) { const o = join(tmp, "x.png"); execFileSync(DW, ["-quiet", join(staged.has(f) ? OUT : PUBLIC, f), "-o", o]); cache.set(f, Uint8ClampedArray.from(decodePng(readFileSync(o)).px)); } return cache.get(f); };
  const eq = {};
  try { for (const c of A.combinations) { const o = { top: c.top, bottom: c.bottom, shoes: RUNTIME_ITEMS[c.candidate] }, plan = AL.northstarPlanFor(o, table, "ns"); if (!plan) throw new Error(c.id + ": no plan");
      const got = AL.northstarCompose(plan, pixelsOf, N), want = Uint8ClampedArray.from(decodePng(readFileSync(join(PKG, "full", c.candidate + "--" + c.bottom.replace("bottom-", "") + ".png"))).px);
      let diff = 0; for (let i = 0; i < N * 4; i++) if (got[i] !== want[i]) diff++; eq[c.id] = { differingBytes: diff, publishedFilesUsed: plan.map((s) => s.src.replace(/^ns\//, "")).filter((f) => !staged.has(f)).length }; if (diff) throw new Error(c.id + ": " + diff + " bytes differ from the approved rendering"); gc(); } }
  finally { rmSync(tmp, { recursive: true, force: true }); }
  const manifest = { decision: "D-305", status: "STAGED PRIVATELY — NOT PUBLISHED; publishing needs the owner's separate permission naming these files and hashes", approval: { file: APPROVAL_REL, sha256: sha(readFileSync(join(ROOT, APPROVAL_REL))) }, runtimeItems: RUNTIME_ITEMS, itemShape: RUNTIME_ITEM_SHAPE, files: entries, equivalence: eq };
  writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(JSON.stringify({ files: entries.map((e) => [e.file, e.sha256, e.bytes]), equivalence: Object.values(eq).every((e) => e.differingBytes === 0) ? "21/21 byte-identical" : eq }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error("REFUSED: " + e.message); process.exit(1); });
