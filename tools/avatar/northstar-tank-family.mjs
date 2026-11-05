// D-345 — THE TANK TOP FAMILY, offline (no image call; nothing published; no runtime change; NOT approved — the owner's visual review
// decides). The six tank designs (D-343: heather and navy, plain, teapot and fox) with the existing shoes over five bottoms (skirt, capri,
// olive, navy and sand trousers; the navy shorts stay outside).
//   map     — the (bottom, shoes) pairs come from the TEE approvals only (the shoe lists, the K outfits, the trousers — D-339's
//             priorApproval over the pairs the opt-in reaches), not from the sweater's list: a pair without a tee approval is excluded (the
//             olive trousers with the beige sneakers). x the six designs. Stable IDs TK-<DESIGN>--<bottom>--<shoes>.
//   check   — sequentially, cached per unit, one design at a time: the production outfit check with the tank's layer behind the bottom
//             (checkOutfitSeam), its enclosed holes and hip openings, on the published bottoms and shoes; the composite (with the skin
//             shadows) kept for the views and the staging check.
//   reuse   — the evidence that a combination shows nothing new but its colours: the feet (rows FEET_ROW.. of D-339) equal the same rows
//             of an approved tee outfit with the same bottom and shoes (the runtime's own composition of published files), and the rest of
//             the figure equals the same design and bottom with the beige sneakers from the reviewed tank run (--ref). Groups of pixel-identical
//             regions are listed (HIP per design x bottom, HEM per bottom x shoes).
//   sheets  — the review sheets: designs x shoes over each bottom at app size (light, dark), the hem groups at 1:1, all designs.
//   stage   — the runtime layers PRIVATELY: per design its body layer, the cut's skin shadow and its layer behind the bottom, lossless WebP;
//             the item table entry each would have; and the equivalence: js/avatar-layers.js northstarCompose(northstarPlanFor(o, table))
//             over the staged and published files equals every recommended combination's checked composite byte for byte.
// Every view shows C: --out must be outside the repository.
// Usage: node --expose-gc tools/avatar/northstar-tank-family.mjs --phase map|check|reuse|sheets|stage --out <dir> --dwebp <exe> [--layers <tank run dir>] [--cwebp <exe>] [--staging <dir>]
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { encodePng, decodePng } from "./r3-hair-tool-v2.mjs";
import * as WR from "./northstar-wardrobe.mjs";
import * as BC from "./northstar-base-figure-c.mjs";
import * as IP from "./northstar-item-pilot.mjs";
import * as LS2 from "./northstar-longsleeve-master-v2.mjs";
import * as K from "./northstar-top-cut-kit.mjs";
import * as SC from "./northstar-ls2-shoe-compat.mjs";
import { loadItems, writeLayerSet } from "./build-northstar-runtime-assets.mjs";
import { checkOutfitSeam } from "./northstar-longsleeve-master-study.mjs";
import { flat, crop, grid, down } from "./northstar-wardrobe-poc.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", ".."), PUB = join(ROOT, "assets", "avatar-northstar"), { W, N } = WR, H = N / W;
const sha = (b) => createHash("sha256").update(b).digest("hex"), gc = () => { if (typeof globalThis.gc === "function") globalThis.gc(); };
const LIGHT = [236, 233, 226], DARK = [24, 26, 40], loadPx = (f) => Uint8ClampedArray.from(decodePng(readFileSync(f)).px);
export const BEIGE = "shoes-sneakers-beige";
/** The six designs (D-343's layers/<slug>.png) and the runtime item each would be. */
export const DESIGNS = Object.freeze({ "TK-HEATHER": "heather", "TK-HEATHER-TEAPOT": "heather-teapot", "TK-HEATHER-FOX": "heather-fox", "TK-NAVY": "navy", "TK-NAVY-TEAPOT": "navy-teapot", "TK-NAVY-FOX": "navy-fox" });
export const CUT_ITEM = "top-tank", JUNCTION_FILE = CUT_ITEM + "-hem-junction-v1.webp";
export const itemOf = (design) => CUT_ITEM + "-" + DESIGNS[design];
/** The item table entry a tank design would have (NORTHSTAR_ITEMS shape): one body layer (no sleeves), the cut's shadow, the junction. */
export const itemShape = (shadows) => Object.freeze({ category: "top", layers: Object.freeze(["top-body"]), shadows: Object.freeze([...shadows]), shadowsOf: CUT_ITEM, hipSeam: JUNCTION_FILE });
const short = (s) => s.replace(/^shoes-/, "").replace(/^sneakers-low-sv1-/, "sv1-").replace(/^ankleboots-ab1-/, "ab1-");

/** The pairs: those the opt-in reaches with a non-beige shoe (D-339's map) plus the beige pairs — each kept only with a TEE approval. */
export function pairs(AL) {
  const seen = new Map(); for (const c of SC.combinations(AL)) { const k = c.bottom + "|" + c.shoes; if (!seen.has(k)) seen.set(k, c.prior); }
  for (const b of SC.BOTTOMS) seen.set(b + "|" + BEIGE, SC.priorApproval(AL, b, BEIGE));
  const keep = [], excluded = []; for (const [k, prior] of seen) { const [bottom, shoes] = k.split("|"); (prior ? keep : excluded).push({ bottom, shoes, prior }); }
  return { keep, excluded: [...excluded.map((e) => ({ ...e, why: "no tee approval of this bottom with these shoes (the sweater's approval does not carry over)" })), { bottom: "bottom-shorts-navy", shoes: "*", why: "the navy shorts stay outside (owner)" }] };
}
export function combinations(AL) {
  const { keep } = pairs(AL), out = [];
  for (const d of Object.keys(DESIGNS)) for (const p of keep) out.push({ id: d + "--" + p.bottom.replace("bottom-", "") + "--" + short(p.shoes), design: d, top: itemOf(d), bottom: p.bottom, shoes: p.shoes, prior: p.prior,
    hip: "HIP:" + d + "+" + p.bottom.replace("bottom-", ""), hem: "HEM:" + p.bottom.replace("bottom-", "") + "+" + short(p.shoes), reviewedInD343: p.shoes === BEIGE });
  const ord = (c) => [Object.keys(DESIGNS).indexOf(c.design), SC.BOTTOMS.indexOf(c.bottom), c.shoes].join("|"); return out.sort((a, b) => (ord(a) < ord(b) ? -1 : ord(a) > ord(b) ? 1 : 0));
}

function decoder(DW) { const tmp = join(tmpdir(), "d345-" + process.pid); mkdirSync(tmp, { recursive: true }); const cache = new Map();
  return { dec: (f, dir = PUB) => { const key = dir + "|" + f; if (!cache.has(key)) { const o = join(tmp, "x.png"); execFileSync(DW, ["-quiet", join(dir, f), "-o", o]); cache.set(key, loadPx(o)); } return cache.get(key); }, cache, done: () => rmSync(tmp, { recursive: true, force: true }) }; }

/** The bottoms and shoes as items with their skin shadows (D-339's way: pinned runs, the published solid trousers, SV1 and AB-1); D-351 reuses it). */
export function partners(AL, dec) {
  const spec = JSON.parse(readFileSync(join(ROOT, "tools", "avatar", "fixtures", "northstar-wardrobe", "runtime-assets-inputs-d242.json"), "utf8"));
  const base0 = ["bottom-skirt-sand", "bottom-capri-lightblue", "bottom-trousers-square-olive", BEIGE, "shoes-boots-laceup-black", "shoes-sneakers-white", "shoes-ankleboots-brown"], { P } = loadItems(Object.fromEntries(base0.map((id) => [id, spec.items[id]])));
  for (const p of Object.values(AL.NORTHSTAR_SOLID_PANTS)) P[p.item] = { item: p.item, layers: { pants: dec(p.item + "-pants-v1.webp") }, shadow: P[AL.NORTHSTAR_SOLID_PANTS_BASE].shadow, category: "bottom", covering: "none" };
  for (const s of Object.values(AL.NORTHSTAR_SV1_SHOES)) P[s.item] = { item: s.item, layers: { shoes: dec(s.item + "-shoes-v1.webp") }, shadow: P[AL.NORTHSTAR_SV1_SHOE_BASE].shadow, category: "shoes", covering: "closed-footwear" };
  for (const b of Object.values(AL.NORTHSTAR_AB1_BOOTS)) P[b.item] = { item: b.item, layers: { shoes: dec(b.item + "-shoes-v1.webp") }, shadow: P[AL.NORTHSTAR_AB1_BOOT_BASE].shadow, category: "shoes", covering: "closed-footwear" };
  return P;
}
const tankLayers = (LAY, slug, base) => LS2.splitLayers(loadPx(join(LAY, "layers", slug + ".png")), base, 128).layers;

async function phaseCheck(AL, OUT, DW, LAY) {
  const C = JSON.parse(readFileSync(join(OUT, "combinations.json"), "utf8")).combinations, D = decoder(DW), E = K.envC(), { w, base } = E, junction = loadPx(join(LAY, "layers", "hem-junction.png")), layKey = sha(Buffer.from(junction.buffer));
  const tankShadow = K.cutOf(K.loadCut("tank-v2"), E).t.shadow, P = partners(AL, D.dec), keep = new Set(D.cache.keys()), results = {}; mkdirSync(join(OUT, "units"), { recursive: true }); mkdirSync(join(OUT, "full"), { recursive: true });
  let current = null, top = null;
  try { for (const c of C) {
      if (c.design !== current) { current = c.design; top = { category: "top", layers: tankLayers(LAY, DESIGNS[c.design], base), shadow: tankShadow }; for (const k of [...D.cache.keys()]) if (!keep.has(k)) D.cache.delete(k); gc(); }
      const key = sha(JSON.stringify([c.id, layKey, sha(Buffer.from(top.layers.topBody.buffer))])), uf = join(OUT, "units", c.id + ".json");
      if (existsSync(uf) && existsSync(join(OUT, "full", c.id + ".png")) && JSON.parse(readFileSync(uf, "utf8")).key === key) { results[c.id] = JSON.parse(readFileSync(uf, "utf8")); continue; }
      const x = checkOutfitSeam(w, base, [top, P[c.bottom], P[c.shoes]], junction); let comp = x.proof.dressedRuntime; for (const it of [top, P[c.bottom], P[c.shoes]]) comp = IP.applyShadow(comp, x.proof.stack, it.shadow);
      writeFileSync(join(OUT, "full", c.id + ".png"), encodePng(W, H, comp));
      const u = { key, id: c.id, technical: x.ok ? "PASS" : "FAIL", failed: x.failed, enclosedPx: x.enclosedPx, hipOpen: x.hipOpen }; writeFileSync(uf, JSON.stringify(u, null, 2) + "\n"); results[c.id] = u; x.proof = null; comp = null; gc();
      if (Object.keys(results).length % 24 === 0) console.log(Object.keys(results).length + "/" + C.length, Math.round(process.memoryUsage().rss / 1048576) + " MB"); } }
  finally { D.done(); }
  const all = Object.values(results), summary = { units: all.length, pass: all.filter((u) => u.technical === "PASS").length, fail: all.filter((u) => u.technical === "FAIL").map((u) => u.id + ": " + u.failed.join("|")), enclosedPxMax: Math.max(...all.map((u) => u.enclosedPx)), hipOpenMax: { right: Math.max(...all.map((u) => u.hipOpen.right)), left: Math.max(...all.map((u) => u.hipOpen.left)) } };
  writeFileSync(join(OUT, "check.json"), JSON.stringify({ decision: "D-345", layers: LAY, junctionSha256: layKey, summary, units: results }, null, 2) + "\n"); console.log(JSON.stringify(summary));
}

async function phaseReuse(AL, OUT, DW, REF) {
  if (!REF) throw new Error("--ref <the reviewed tank run (its full/<design>--<bottom>.png, beige sneakers)>");
  const C = JSON.parse(readFileSync(join(OUT, "combinations.json"), "utf8")).combinations, D = decoder(DW), px = (src) => D.dec(src.split("/").pop()), refs = {}, res = {};
  const teeOutfit = (bottom, shoes) => { for (const k of Object.keys(AL.NORTHSTAR_OUTFITS)) for (const p of [null, ...Object.keys(AL.NORTHSTAR_SOLID_PANTS)]) for (const sh of [null, ...Object.keys(AL.NORTHSTAR_SHOE_CHOICES)]) {
      const o = AL.northstarOutfitFor(k, null, p, sh); if (o && o.bottom === bottom && o.shoes === shoes) return { label: [k, p, sh].filter(Boolean).join("+"), o }; } return null; };
  try { for (const c of C) { if (!refs[c.hem]) { const t = teeOutfit(c.bottom, c.shoes); refs[c.hem] = t ? { label: t.label, top: t.o.top, px: AL.northstarCompose(AL.northstarPlanFor(t.o), px, N) } : null; }
      const a = loadPx(join(OUT, "full", c.id + ".png")), b = refs[c.hem] ? refs[c.hem].px : null; let feet = -1; if (b) { feet = 0; for (let i = SC.FEET_ROW * W * 4; i < N * 4; i++) if (a[i] !== b[i]) feet++; }
      // the same design and bottom with the beige sneakers from the reviewed tank run (all six bottoms, the olive one included)
      const beigeId = DESIGNS[c.design] + "--" + c.bottom.replace("bottom-", ""), r = loadPx(join(REF, "full", beigeId + ".png")); let above = 0; for (let i = 0; i < SC.FEET_ROW * W * 4; i++) if (a[i] !== r[i]) above++;
      res[c.id] = { hip: c.hip, hem: c.hem, teeOutfit: refs[c.hem] ? refs[c.hem].label : null, feetBytesDifferingFromTeeOutfit: feet, aboveFeetBytesDifferingFromBeige: above, beigeReference: beigeId }; gc(); } }
  finally { D.done(); }
  const all = Object.values(res), summary = { units: all.length, feetIdenticalToApprovedTeeOutfit: all.filter((r) => r.feetBytesDifferingFromTeeOutfit === 0).length, feetDiffering: [...new Set(all.filter((r) => r.feetBytesDifferingFromTeeOutfit !== 0).map((r) => r.hem))],
    aboveFeetIdenticalToBeige: all.filter((r) => r.aboveFeetBytesDifferingFromBeige === 0).length, aboveDiffering: [...new Set(all.filter((r) => r.aboveFeetBytesDifferingFromBeige !== 0).map((r) => r.hip))],
    hemGroups: [...new Set(all.map((r) => r.hem))].length, hipGroups: [...new Set(all.map((r) => r.hip))].length };
  writeFileSync(join(OUT, "reuse.json"), JSON.stringify({ decision: "D-345", feetFromRow: SC.FEET_ROW, summary, units: res }, null, 2) + "\n"); console.log(JSON.stringify(summary));
}

function phaseSheets(OUT) {
  const C = JSON.parse(readFileSync(join(OUT, "combinations.json"), "utf8")).combinations, V = join(OUT, "views"); mkdirSync(V, { recursive: true });
  const save = (n, g) => writeFileSync(join(V, n), encodePng(g.w, g.h, g.px)), load = (id) => loadPx(join(OUT, "full", id + ".png")), designs = Object.keys(DESIGNS), layout = {};
  // per bottom: designs (rows) x its shoes (columns), at 110x165 and 300x450, light and dark
  for (const b of SC.BOTTOMS) { const shoes = [...new Set(C.filter((c) => c.bottom === b).map((c) => c.shoes))]; layout[b] = shoes;
    for (const [bn, bg] of [["light", LIGHT], ["dark", DARK]]) for (const [w2, h2] of [[110, 165], [300, 450]]) { const t = []; for (const d of designs) for (const s of shoes) t.push(down(flat(load(C.find((c) => c.design === d && c.bottom === b && c.shoes === s).id), bg), w2, h2));
      save("colours--" + b.replace("bottom-", "") + "--" + w2 + "x" + h2 + "--" + bn + ".png", grid(t, shoes.length, 6)); gc(); } }
  // the hem groups (bottom x shoes) at 1:1 with heather, light and dark; and the shoe transition of every hem group x2
  const hems = [...new Set(C.map((c) => c.hem))]; for (const [bn, bg] of [["light", LIGHT], ["dark", DARK]]) { const t = hems.map((h) => crop(flat(load(C.find((c) => c.hem === h && c.design === "TK-HEATHER").id), bg), [330, 1180, 694, 1536], 1)); save("hem-groups--1to1--" + bn + ".png", grid(t, 6, 8)); gc(); }
  writeFileSync(join(OUT, "sheets.json"), JSON.stringify({ decision: "D-345", rows: designs, columnsPerBottom: layout, hemGroups: hems }, null, 2) + "\n"); console.log(JSON.stringify({ hemGroups: hems.length, bottoms: SC.BOTTOMS.length }));
}

async function phaseStage(AL, OUT, DW, CW, LAY, STG) {
  const r = relative(ROOT, resolve(STG || ".")); if (!STG || !(r.startsWith("..") || isAbsolute(r))) throw new Error("--staging must be outside the repository");
  if (existsSync(join(STG, "staging-manifest.json"))) throw new Error("already staged into " + STG + "; a staging is never rewritten");
  const C = JSON.parse(readFileSync(join(OUT, "combinations.json"), "utf8")).combinations, E = K.envC(), base = E.base, ctx = { c: K.loadCut("tank-v2"), E, ...K.cutOf(K.loadCut("tank-v2"), E) }, sh = K.shadowParts(ctx), files = {};
  for (const [d, slug] of Object.entries(DESIGNS)) { const L = tankLayers(LAY, slug, base); let sl = 0; for (let i = 0; i < N; i++) if (L.sleeves[i * 4 + 3]) sl++; if (sl) throw new Error(d + ": a tank has no sleeve layer");
    files[itemOf(d) + "-top-body-v1.webp"] = { px: L.topBody, purpose: "the body layer of the tank design " + d + " (D-343/D-345; NOT approved)", origin: { layer: join(LAY, "layers", slug + ".png").replace(/\\/g, "/").replace(/^.*DenSejeApp-artefacts/, "<Documents>/DenSejeApp-artefacts") } }; }
  for (const [part, px] of Object.entries(sh)) files[CUT_ITEM + "-shadow-" + part + "-v1.webp"] = { px, purpose: "the tank cut's skin shadow on C's " + part + " (multiply, D-214; shared by all six designs)", origin: { source: "top-tank-teal's skin shadow (D-239 final1-pilot), split by C's figure (D-242)" } };
  files[JUNCTION_FILE] = { px: loadPx(join(LAY, "layers", "hem-junction.png")), purpose: "the tank cut's hem junction (D-343/D-345), drawn after the shoes and before the bottom", origin: { contract: LAY.includes("v3") ? "top-cuts/tank-v3.json" : "top-cuts/tank-v2.json" } };
  mkdirSync(STG, { recursive: true }); const staged = join(STG, "staging"); mkdirSync(staged, { recursive: true }); const entries = writeLayerSet(files, staged, { cwebp: CW, dwebp: DW }); for (const k of Object.keys(files)) files[k].px = null; gc();
  const notAllowed = readdirSync(staged).filter((f) => !/^top-tank-[a-z-]+-v1\.webp$/.test(f)); if (notAllowed.length) throw new Error("staging holds a file that is not a tank layer: " + notAllowed.join(", "));
  const table = { ...AL.NORTHSTAR_ITEMS, ...Object.fromEntries(Object.keys(DESIGNS).map((d) => [itemOf(d), itemShape(Object.keys(sh))])) }, D = decoder(DW), eq = {};
  try { for (const c of C) { const o = { top: c.top, bottom: c.bottom, shoes: c.shoes }, plan = AL.northstarPlanFor(o, table, "ns"); if (!plan) throw new Error(c.id + ": no plan");
      const got = AL.northstarCompose(plan, (src) => { const f = src.replace(/^ns\//, ""); return D.dec(f, existsSync(join(staged, f)) ? staged : PUB); }, N), want = loadPx(join(OUT, "full", c.id + ".png"));
      let d = 0; for (let i = 0; i < N * 4; i++) if (got[i] !== want[i]) d++; eq[c.id] = d; if (d) throw new Error(c.id + ": " + d + " bytes differ from the checked composite");
      if (Object.keys(eq).length % 44 === 0) { for (const k of [...D.cache.keys()]) if (k.includes("top-tank-")) D.cache.delete(k); gc(); } } }
  finally { D.done(); }
  const manifest = { decision: "D-345", status: "STAGED PRIVATELY — NOT APPROVED, NOT PUBLISHED; publishing and integration need the owner's separate permissions naming these files and hashes",
    itemTable: Object.fromEntries(Object.keys(DESIGNS).map((d) => [itemOf(d), itemShape(Object.keys(sh))])), drawOrder: "body · shoes · hem junction · bottom · top body · arms · head · shadows (no sleeves)", files: entries,
    equivalence: { what: "northstarCompose(northstarPlanFor(outfit, table)) over the staged and published files against the checked composite, RGBA bytes differing", combinations: Object.keys(eq).length, differing: Object.values(eq).filter(Boolean).length } };
  writeFileSync(join(STG, "staging-manifest.json"), JSON.stringify(manifest, null, 2) + "\n"); console.log(JSON.stringify({ files: entries.map((e) => [e.file, e.sha256, e.bytes]), equivalence: manifest.equivalence }));
}

async function main() {
  const args = process.argv.slice(2), at = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), phase = at("--phase"), OUT = at("--out"), DW = at("--dwebp"), r = relative(ROOT, resolve(OUT || "."));
  if (!OUT || !(r.startsWith("..") || isAbsolute(r))) throw new Error("--out must be outside the repository (the views show C)"); mkdirSync(OUT, { recursive: true });
  const AL = await import(pathToFileURL(join(ROOT, "js", "avatar-layers.js")).href);
  if (phase === "map") { const c = combinations(AL), p = pairs(AL); writeFileSync(join(OUT, "combinations.json"), JSON.stringify({ decision: "D-345", count: c.length, pairs: p.keep.length, excluded: p.excluded, combinations: c }, null, 2) + "\n");
    return console.log(JSON.stringify({ count: c.length, pairs: p.keep.length, excluded: p.excluded.map((e) => e.bottom + "+" + e.shoes), reviewedInD343: c.filter((x) => x.reviewedInD343).length })); }
  if (!DW || !existsSync(DW)) throw new Error("--dwebp");
  if (phase === "check") return phaseCheck(AL, OUT, DW, at("--layers"));
  if (phase === "reuse") return phaseReuse(AL, OUT, DW, at("--ref"));
  if (phase === "sheets") return phaseSheets(OUT);
  if (phase === "stage") return phaseStage(AL, OUT, DW, at("--cwebp"), at("--layers"), at("--staging"));
  throw new Error("--phase map|check|reuse|sheets|stage");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error("REFUSED: " + e.message); process.exit(1); });
