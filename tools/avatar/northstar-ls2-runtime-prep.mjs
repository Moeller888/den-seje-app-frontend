// D-336 — THE RUNTIME FILES OF THE 30 OWNER-APPROVED SWEATER COMBINATIONS (D-335 v3), PREPARED PRIVATELY (offline; no image call;
// nothing published; no runtime file, catalogue, shop or flag changed). Reads only ls2-owner-approval-v1.json.
//   files       — per approved design (6): its body and sleeve layers (<item>-top-body-v1.webp, <item>-sleeves-v1.webp), split from the
//                 approved layer by the cut's own rule (LS2.splitLayers) — the approved layer is checked by its pixel sha256 (no look
//                 change); the cut's skin shadow ONCE for all six (top-sweater-ls2-shadow-{body,arms}-v1.webp, D-242's split by C's
//                 figure: arms where C's arm alpha >= 128, body elsewhere on C's body; every design names it with shadowsOf); the hip-seam
//                 layer ONCE (top-sweater-ls2-hip-seam-v1.webp). Lossless WebP (D-242's arguments), each decoded back byte for byte.
//   the extra draw step — planWithHipSeam: the browser's northstarPlanFor, plus ONE draw of the hip-seam file right before the bottom's
//                 first draw (body · shoes · HIP SEAM · bottom · top body · arms · sleeves · head · shadows); only for an item that
//                 names hipSeam.
//   equivalence — for each of the 30 combinations: js/avatar-layers.js northstarCompose (unchanged) of that plan, over the staged files
//                 and the published figure, shoe, covering, bottom and shadow files, must equal the approved D-335 v3 rendering byte for
//                 byte (its pixel sha256 is checked against the approval first).
// Usage: node --expose-gc tools/avatar/northstar-ls2-runtime-prep.mjs --out <private staging dir> --cwebp <exe> --dwebp <exe>
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { homedir, tmpdir } from "node:os";
import { decodePng } from "./r3-hair-tool-v2.mjs";
import * as WR from "./northstar-wardrobe.mjs";
import * as BC from "./northstar-base-figure-c.mjs";
import * as LS2 from "./northstar-longsleeve-master-v2.mjs";
import { loadItems, writeLayerSet } from "./build-northstar-runtime-assets.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", ".."), ART = join(homedir(), "Documents", "DenSejeApp-artefacts"), PUB = join(ROOT, "assets", "avatar-northstar"), { N } = WR;
const sha = (b) => createHash("sha256").update(b).digest("hex"), gc = () => { if (typeof globalThis.gc === "function") globalThis.gc(); };
export const APPROVAL_REL = "tools/avatar/fixtures/northstar-wardrobe/sweater/ls2-owner-approval-v1.json";
/** The cut's base id: its skin shadow and hip seam are published once under it; every design names it (shadowsOf, hipSeam). */
export const CUT_ITEM = "top-sweater-ls2";
export const HIP_SEAM_FILE = CUT_ITEM + "-hip-seam-v1.webp";
/** The item table entry each design would have (NORTHSTAR_ITEMS shape plus hipSeam). shadows are set from the parts found. */
export const itemShape = (shadows) => Object.freeze({ category: "top", layers: Object.freeze(["top-body", "sleeves"]), shadows: Object.freeze([...shadows]), shadowsOf: CUT_ITEM, hipSeam: HIP_SEAM_FILE });

export function approval() { return JSON.parse(readFileSync(join(ROOT, APPROVAL_REL), "utf8")); }
/** The plan of an outfit with the hip seam: northstarPlanFor's plan, plus one draw of the top's hipSeam file before the bottom's first
 *  draw. Returns null where northstarPlanFor does; a top without hipSeam gets the plan unchanged, and so does a plan that already draws
 *  the seam (D-337 put the step into northstarPlanFor itself). */
export function planWithHipSeam(AL, o, table, basePath) {
  const plan = AL.northstarPlanFor(o, table, basePath); if (!plan) return null; const top = table[o.top];
  if (!top || !top.hipSeam || plan.some((s) => s.src === basePath + "/" + top.hipSeam)) return plan;   // D-337: the runtime's plan draws it already
  const k = plan.findIndex((s) => s.op === "draw" && s.src === basePath + "/" + o.bottom + "-pants-v1.webp"); if (k < 0) throw new Error("no bottom draw in the plan");
  return [...plan.slice(0, k), { op: "draw", src: basePath + "/" + top.hipSeam }, ...plan.slice(k)];
}

async function main() {
  const args = process.argv.slice(2), at = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), OUT = at("--out"), CW = at("--cwebp"), DW = at("--dwebp"), r = relative(ROOT, resolve(OUT || "."));
  if (!OUT || !(r.startsWith("..") || isAbsolute(r))) throw new Error("--out must be outside the repository"); if (!CW || !DW) throw new Error("--cwebp and --dwebp");
  const AL = await import(pathToFileURL(join(ROOT, "js", "avatar-layers.js")).href), A = approval(), loadPx = (f) => Uint8ClampedArray.from(decodePng(readFileSync(f)).px);
  const local = (f) => join(ART, ...f.replace("<Documents>/DenSejeApp-artefacts/", "").split("/"));
  const tmp = join(tmpdir(), "d336-" + process.pid); mkdirSync(tmp, { recursive: true }); const cache = new Map(), staged = join(OUT, "staging");
  const dec = (f) => { if (!cache.has(f)) { const o = join(tmp, "x.png"); execFileSync(DW, ["-quiet", existsSync(join(staged, f)) ? join(staged, f) : join(PUB, f), "-o", o]); cache.set(f, loadPx(o)); } return cache.get(f); };
  try {
    // the approved layers and the hip seam, by their pixel sha256
    const base = { arms: dec(AL.NORTHSTAR_FIGURE.arms), body: dec(AL.NORTHSTAR_FIGURE.body) }, files = {};
    const check = (f, want, what) => { const px = loadPx(local(f)); if (sha(Buffer.from(px.buffer)) !== want) throw new Error(what + ": not the approved pixels"); return px; };
    for (const [name, d] of Object.entries(A.designs)) { const L = check(d.layer.file, d.layer.pixelSha256, name), sp = LS2.splitLayers(L, base).layers;
      files[d.proposedRuntimeItem + "-top-body-v1.webp"] = { px: sp.topBody, purpose: "the body layer of the owner-approved sweater " + d.id + " (D-336), split from the approved D-335 v3 layer by the cut's rule (LS2.splitLayers)", origin: { approved: d.id, layerPixelSha256: d.layer.pixelSha256, approval: APPROVAL_REL } };
      files[d.proposedRuntimeItem + "-sleeves-v1.webp"] = { px: sp.sleeves, purpose: "the sleeve layer of the owner-approved sweater " + d.id + " (D-336), drawn over C's arms", origin: { approved: d.id, layerPixelSha256: d.layer.pixelSha256, approval: APPROVAL_REL } }; }
    files[HIP_SEAM_FILE] = { px: check(A.hipSeam.file, A.hipSeam.pixelSha256, "hip seam"), purpose: "the sweater cut's hip seam (D-335 hipSeamLayer), drawn after the shoes and BEFORE the bottom", origin: { approval: APPROVAL_REL, pixelSha256: A.hipSeam.pixelSha256 } };
    // the cut's skin shadow, split by C's figure as D-242
    const { P, origin } = loadItems({ [LS2.SOURCE.item]: { run: LS2.SOURCE.run, method: LS2.SOURCE.method } }), s = P[LS2.SOURCE.item].shadow, shadows = [];
    for (const part of ["body", "arms"]) { const o = new Uint8ClampedArray(N * 4); let n = 0;
      for (let i = 0; i < N; i++) { if (!s[i * 4 + 3]) continue; const arm = base.arms[i * 4 + 3] >= 128, bod = base.body[i * 4 + 3] >= 128; if (part === "arms" ? arm : bod && !arm) { o.set(s.subarray(i * 4, i * 4 + 4), i * 4); n++; } }
      if (!n) continue; shadows.push(part); files[CUT_ITEM + "-shadow-" + part + "-v1.webp"] = { px: o, purpose: "the sweater cut's skin shadow on C's " + part + " (multiply, D-214; shared by all six designs)", origin: { source: "the cut item's skin shadow", item: origin[LS2.SOURCE.item], cSha256: BC.C_RAW_SHA256 } }; }
    mkdirSync(staged, { recursive: true }); const entries = writeLayerSet(files, staged, { cwebp: CW, dwebp: DW }); for (const k of Object.keys(files)) files[k].px = null; cache.clear(); gc();
    // the 30 approved renderings, through the browser's compositor with the extra draw step
    const table = { ...AL.NORTHSTAR_ITEMS, ...Object.fromEntries(Object.values(A.designs).map((d) => [d.proposedRuntimeItem, itemShape(shadows)])) }, eq = {};
    for (const c of A.combinations) { const o = { top: c.top, bottom: c.bottom, shoes: c.shoes }, plan = planWithHipSeam(AL, o, table, "ns"); if (!plan) throw new Error(c.id + ": no plan");
      const want = loadPx(local(c.rendering.file)); if (sha(Buffer.from(want.buffer)) !== c.rendering.pixelSha256) throw new Error(c.id + ": not the approved rendering");
      const got = AL.northstarCompose(plan, (src) => dec(src.replace(/^ns\//, "")), N); let d = 0; for (let i = 0; i < N * 4; i++) if (got[i] !== want[i]) d++;
      eq[c.id] = { differingBytes: d, steps: plan.length }; if (d) throw new Error(c.id + ": " + d + " bytes differ from the approved rendering"); if (Object.keys(eq).length % 10 === 0) { for (const k of [...cache.keys()]) if (k.startsWith(CUT_ITEM + "-")) cache.delete(k); gc(); } }
    const manifest = { decision: "D-336", status: "STAGED PRIVATELY — NOT PUBLISHED; publishing and integration need the owner's separate permission naming these files and hashes", approval: { file: APPROVAL_REL, sha256: sha(readFileSync(join(ROOT, APPROVAL_REL))) },
      itemTable: Object.fromEntries(Object.values(A.designs).map((d) => [d.proposedRuntimeItem, itemShape(shadows)])), drawOrder: "body · shoes · hip seam · bottom · top body · arms · sleeves · head · shadows", files: entries, equivalence: eq };
    writeFileSync(join(OUT, "staging-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
    console.log(JSON.stringify({ files: entries.map((e) => [e.file, e.sha256, e.bytes]), shadows, equivalence: Object.values(eq).every((e) => e.differingBytes === 0) ? Object.keys(eq).length + "/" + Object.keys(eq).length + " byte-identical" : eq }));
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error("REFUSED: " + e.message); process.exit(1); });
