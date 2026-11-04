// D-339 — THE 6 INTEGRATED SWEATERS (D-337) WITH THE OTHER EXISTING SHOES, offline (no image call; nothing published; the runtime list
// NORTHSTAR_LS2_COMBOS is NOT changed — an extension needs the owner's approval). The sweaters' approved layering is reused unchanged: the
// cut's hip seam behind the bottom (northstarPlanFor's hipSeam step), the sweater's body and rib in front.
//   map    — every (bottom, shoes) pair the opt-in can reach today with a sweater-friendly bottom (skirt, capri, olive, navy and sand
//            trousers — the navy shorts stay outside, D-336) and shoes other than the already approved beige sneakers, through the
//            browser's own functions (each K outfit, without and with every print tee, trousers and shoe choice it allows); x the 6
//            sweaters. Stable IDs LS2-<DESIGN>--<bottom>--<shoes>. Each combination names its review groups: the HIP join (bottom; the
//            sweater's hip seam over that bottom, approved in D-336 with every design) and the HEM join (bottom x shoes; the same pair the
//            owner approved with a tee — the tee does not reach the hem), and the earlier approval of that pair.
//   check  — sequentially, cached per unit: the production outfit check (BC.outfitCheck through checkOutfitSeam: the hip seam in the
//            slot right under the bottom, the closed shoe's covering from the shoe alone) on the PUBLISHED layers, its enclosed holes and
//            hip openings; the same bottom and shoes with the cream or blue tee they were approved with (does the sweater change any join
//            verdict?); the pipeline composite (dressed + skin shadows) against northstarCompose(northstarPlanFor(outfit)) on the
//            published files, byte for byte; the composite kept for the views.
//   reuse  — the evidence for reusing the HEM review: per combination, the feet (rows FEET_ROW..bottom) of its composite against the
//            same rows of an approved tee outfit with the same bottom and shoes, composed by the runtime on the published files — 0 px
//            means the sweater changes nothing at the hem, the shoe or the foot, and the owner's earlier review of that pair holds; and
//            the rest of the figure (rows above FEET_ROW: the sweater, sleeves, cuffs, print and the HIP join) against the owner-approved
//            D-336 rendering of the same sweater and bottom with the beige sneakers — 0 px means that review holds too.
//   sheets — the review sheets: one tile per HEM group (feet at x2), one per HIP group (right hip at x4), the colour grid (designs x
//            shoes over capri, app size), and app sizes per design.
// Every view shows C: --out must be outside the repository. Nothing here approves a combination.
// Usage: node --expose-gc tools/avatar/northstar-ls2-shoe-compat.mjs --phase map|check|sheets --out <dir outside the repo> --dwebp <dwebp.exe>
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir, homedir } from "node:os";
import { encodePng, decodePng } from "./r3-hair-tool-v2.mjs";
import * as WR from "./northstar-wardrobe.mjs";
import * as BC from "./northstar-base-figure-c.mjs";
import * as IP from "./northstar-item-pilot.mjs";
import * as R1 from "./northstar-r1-garment.mjs";
import * as LS2 from "./northstar-longsleeve-master-v2.mjs";
import { loadItems } from "./build-northstar-runtime-assets.mjs";
import { checkOutfitSeam } from "./northstar-longsleeve-master-study.mjs";
import { flat, crop, grid, down } from "./northstar-wardrobe-poc.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", ".."), PUB = join(ROOT, "assets", "avatar-northstar"), { W, N } = WR, H = N / W;
const sha = (b) => createHash("sha256").update(b).digest("hex"), gc = () => { if (typeof globalThis.gc === "function") globalThis.gc(); };
const LIGHT = [236, 233, 226], DARK = [24, 26, 40];
export const BOTTOMS = Object.freeze(["bottom-skirt-sand", "bottom-capri-lightblue", "bottom-trousers-square-olive", "bottom-trousers-square-navy", "bottom-trousers-square-sand"]);
export const APPROVED_SHOES = "shoes-sneakers-beige";
const short = (s) => s.replace(/^shoes-/, "").replace(/^sneakers-low-sv1-/, "sv1-").replace(/^ankleboots-ab1-/, "ab1-");

/** Where the owner approved a (bottom, shoes) pair with a tee: the shoe's own list or the K outfits and trousers (D-242/D-283). */
export function priorApproval(AL, bottom, shoes) {
  const hit = (list) => list.filter((k) => k.endsWith("+" + bottom + "+" + shoes)).map((k) => k.split("+")[0]);
  const sv1 = hit(AL.NORTHSTAR_SV1_SHOE_COMBOS), ab1 = hit(AL.NORTHSTAR_AB1_BOOT_COMBOS);
  if (sv1.length) return { source: "D-305/D-314 (SV1 shoes)", tops: sv1 }; if (ab1.length) return { source: "D-326/D-331 (AB-1 boots)", tops: ab1 };
  const ks = Object.entries(AL.NORTHSTAR_OUTFITS).filter(([, o]) => o.bottom === bottom && o.shoes === shoes).map(([k]) => k);
  if (ks.length) return { source: "D-242 K outfits", tops: ks.map((k) => AL.NORTHSTAR_OUTFITS[k].top), outfits: ks };
  const viaPants = Object.entries(AL.NORTHSTAR_OUTFITS).filter(([k, o]) => o.shoes === shoes && Object.values(AL.NORTHSTAR_SOLID_PANTS).some((p) => p.item === bottom) && AL.northstarPantsAllowed(k, null)).map(([k]) => k);
  if (viaPants.length) return { source: "D-281/D-283 (trousers)", tops: [...new Set(viaPants.map((k) => AL.NORTHSTAR_OUTFITS[k].top))], outfits: viaPants };
  return null;
}
/** The new combinations: [{ id, design, top, bottom, shoes, hip, hem, prior, reachableAs }], fixed order. */
export function combinations(AL) {
  const pairs = new Map();
  for (const k of Object.keys(AL.NORTHSTAR_OUTFITS)) for (const t of [null, ...Object.keys(AL.NORTHSTAR_PRINT_TEES)]) for (const p of [null, ...Object.keys(AL.NORTHSTAR_SOLID_PANTS)]) for (const s of [null, ...Object.keys(AL.NORTHSTAR_SHOE_CHOICES)]) {
    const o = AL.northstarOutfitFor(k, t, p, s); if (!o || !BOTTOMS.includes(o.bottom) || o.shoes === APPROVED_SHOES) continue;
    const key = o.bottom + "|" + o.shoes; if (!pairs.has(key)) pairs.set(key, [k, t, p, s].filter(Boolean).join("+")); }
  const out = [];
  for (const [d, sw] of Object.entries(AL.NORTHSTAR_LS2_SWEATERS)) for (const [key, via] of pairs) { const [bottom, shoes] = key.split("|");
    out.push({ id: d + "--" + bottom.replace("bottom-", "") + "--" + short(shoes), design: d, top: sw.item, bottom, shoes, hip: "HIP:" + bottom.replace("bottom-", ""), hem: "HEM:" + bottom.replace("bottom-", "") + "+" + short(shoes), prior: priorApproval(AL, bottom, shoes), reachableAs: via + "+" + d }); }
  const ord = (c) => [BOTTOMS.indexOf(c.bottom), c.shoes, c.design].join("|");
  return out.sort((a, b) => (ord(a) < ord(b) ? -1 : ord(a) > ord(b) ? 1 : 0));
}

async function main() {
  const args = process.argv.slice(2), at = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), phase = at("--phase"), OUT = at("--out"), DW = at("--dwebp"), r = relative(ROOT, resolve(OUT || "."));
  if (!OUT || !(r.startsWith("..") || isAbsolute(r))) throw new Error("--out must be outside the repository (the views show C)"); mkdirSync(OUT, { recursive: true });
  const AL = await import(pathToFileURL(join(ROOT, "js", "avatar-layers.js")).href);
  if (phase === "map") { const c = combinations(AL), groups = { hip: [...new Set(c.map((x) => x.hip))], hem: [...new Set(c.map((x) => x.hem))] };
    writeFileSync(join(OUT, "combinations.json"), JSON.stringify({ count: c.length, groups, withoutPriorApproval: c.filter((x) => !x.prior).map((x) => x.id), combinations: c }, null, 2) + "\n");
    return console.log(JSON.stringify({ count: c.length, hipGroups: groups.hip.length, hemGroups: groups.hem.length, withoutPriorApproval: c.filter((x) => !x.prior).length })); }
  if (!DW) throw new Error("--dwebp");
  if (phase === "check") return phaseCheck(AL, OUT, DW);
  if (phase === "sheets") return phaseSheets(OUT);
  if (phase === "reuse") return phaseReuse(AL, OUT, DW);
  throw new Error("--phase map|check|reuse|sheets");
}

async function phaseCheck(AL, OUT, DW) {
  const C = JSON.parse(readFileSync(join(OUT, "combinations.json"), "utf8")).combinations, man = JSON.parse(readFileSync(join(PUB, "manifest.json"), "utf8")), fileSha = new Map(man.files.map((f) => [f.file, f.sha256]));
  const tmp = join(tmpdir(), "d339-" + process.pid); mkdirSync(tmp, { recursive: true }); mkdirSync(join(OUT, "units"), { recursive: true }); mkdirSync(join(OUT, "full"), { recursive: true });
  const cache = new Map(), dec = (f) => { if (!cache.has(f)) { const o = join(tmp, "x.png"); execFileSync(DW, ["-quiet", join(PUB, f), "-o", o]); cache.set(f, Uint8ClampedArray.from(decodePng(readFileSync(o)).px)); } return cache.get(f); };
  const spec = JSON.parse(readFileSync(join(ROOT, "tools", "avatar", "fixtures", "northstar-wardrobe", "runtime-assets-inputs-d242.json"), "utf8"));
  const base0 = ["top-tee-hip-cream", "top-tee-hip-blue", "bottom-skirt-sand", "bottom-capri-lightblue", "bottom-trousers-square-olive", "shoes-sneakers-beige", "shoes-boots-laceup-black", "shoes-sneakers-white", "shoes-ankleboots-brown"];
  const { P } = loadItems({ ...Object.fromEntries(base0.map((id) => [id, spec.items[id]])), [LS2.SOURCE.item]: { run: LS2.SOURCE.run, method: LS2.SOURCE.method } });
  const sweaterShadow = P[LS2.SOURCE.item].shadow; delete P[LS2.SOURCE.item];
  for (const p of Object.values(AL.NORTHSTAR_SOLID_PANTS)) P[p.item] = { item: p.item, layers: { pants: dec(p.item + "-pants-v1.webp") }, shadow: P[AL.NORTHSTAR_SOLID_PANTS_BASE].shadow, category: "bottom", covering: "none" };
  for (const s of Object.values(AL.NORTHSTAR_SV1_SHOES)) P[s.item] = { item: s.item, layers: { shoes: dec(s.item + "-shoes-v1.webp") }, shadow: P[AL.NORTHSTAR_SV1_SHOE_BASE].shadow, category: "shoes", covering: "closed-footwear" };
  for (const b of Object.values(AL.NORTHSTAR_AB1_BOOTS)) P[b.item] = { item: b.item, layers: { shoes: dec(b.item + "-shoes-v1.webp") }, shadow: P[AL.NORTHSTAR_AB1_BOOT_BASE].shadow, category: "shoes", covering: "closed-footwear" };
  const seam = dec(AL.NORTHSTAR_LS2_HIP_SEAM), w = WR.buildWardrobe(), base = BC.prepareBase(w, Uint8ClampedArray.from(decodePng(IP.readC()).px)), keep = new Set([...cache.keys()]), results = {}, teeRef = {};
  let current = null;
  try {
    for (const c of C) {
      if (c.top !== current) { for (const k of [...cache.keys()]) if (!keep.has(k) && !k.includes("shadow") && !k.startsWith("figure-")) cache.delete(k); if (current) delete P[current]; current = c.top; gc();
        P[c.top] = { item: c.top, layers: { topBody: dec(c.top + "-top-body-v1.webp"), sleeves: dec(c.top + "-sleeves-v1.webp") }, shadow: sweaterShadow, category: "top", covering: "none" }; }
      const o = { top: c.top, bottom: c.bottom, shoes: c.shoes }, plan = AL.northstarPlanFor(o), planFiles = plan ? [...new Set(plan.flatMap((s) => [s.src, s.cut].filter(Boolean).map((x) => x.split("/").pop())))] : [];
      const keyIn = sha(JSON.stringify([o, planFiles.map((f) => fileSha.get(f) || "missing:" + f), IP.METHODS[IP.METHOD].outfitRevision || "d223"]));
      const uf = join(OUT, "units", c.id + ".json"); if (existsSync(uf) && JSON.parse(readFileSync(uf, "utf8")).key === keyIn && existsSync(join(OUT, "full", c.id + ".png"))) { results[c.id] = JSON.parse(readFileSync(uf, "utf8")); continue; }
      const missing = planFiles.filter((f) => !fileSha.has(f)), x = checkOutfitSeam(w, base, [P[c.top], P[c.bottom], P[c.shoes]], seam);
      let comp = x.proof.dressedRuntime; for (const id of [c.top, c.bottom, c.shoes]) comp = IP.applyShadow(comp, x.proof.stack, P[id].shadow);
      let diff = -1; if (plan && !missing.length) { const got = AL.northstarCompose(plan, (src) => dec(src.split("/").pop()), N); diff = 0; for (let i = 0; i < N * 4; i++) if (got[i] !== comp[i]) diff++; }
      // the same bottom and shoes with the tee the pair was approved with (the hem and shoe joins without the sweater)
      const teeTop = c.prior && c.prior.tops && c.prior.tops.find((t) => P[t]) ? c.prior.tops.find((t) => P[t]) : "top-tee-hip-cream", tk = teeTop + "|" + c.bottom + "|" + c.shoes;
      if (!teeRef[tk]) { const y = R1.checkOutfit(w, base, [P[teeTop], P[c.bottom], P[c.shoes]]); teeRef[tk] = { top: teeTop, ok: y.ok, failed: y.failed }; y.proof = null; }
      writeFileSync(join(OUT, "full", c.id + ".png"), encodePng(W, H, comp));
      const u = { key: keyIn, id: c.id, design: c.design, bottom: c.bottom, shoes: c.shoes, hip: c.hip, hem: c.hem, technical: x.ok ? "PASS" : "FAIL", failed: x.failed, enclosedPx: x.enclosedPx, hipOpen: x.hipOpen, withApprovedTee: teeRef[tk],
        hemJoinsAsWithTee: x.failed.filter((f) => !/COMBO-6/.test(f)).join() === teeRef[tk].failed.filter((f) => !/COMBO-6/.test(f)).join(), missingAssets: missing, runtimeBytesDiffering: diff };
      writeFileSync(uf, JSON.stringify(u, null, 2) + "\n"); results[c.id] = u; x.proof = null; comp = null; gc();
      if (Object.keys(results).length % 20 === 0) console.log(Object.keys(results).length + "/" + C.length, Math.round(process.memoryUsage().rss / 1048576) + " MB"); }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  const all = Object.values(results), summary = { units: all.length, pass: all.filter((u) => u.technical === "PASS").length, fail: all.filter((u) => u.technical === "FAIL").map((u) => u.id + ": " + u.failed.join("|")),
    enclosedPxTotal: all.reduce((s, u) => s + u.enclosedPx, 0), maxHipOpenRight: Math.max(...all.map((u) => u.hipOpen.right)), maxHipOpenLeft: Math.max(...all.map((u) => u.hipOpen.left)),
    hemJoinsAsWithTee: all.filter((u) => u.hemJoinsAsWithTee).length, runtimeEquivalent: all.filter((u) => u.runtimeBytesDiffering === 0).length, missingAssets: all.filter((u) => u.missingAssets.length).length };
  writeFileSync(join(OUT, "check.json"), JSON.stringify({ decision: "D-339", summary, units: results }, null, 2) + "\n"); console.log(JSON.stringify(summary));
}

function phaseSheets(OUT) {
  const C = JSON.parse(readFileSync(join(OUT, "combinations.json"), "utf8")).combinations, V = join(OUT, "views"); mkdirSync(V, { recursive: true });
  const load = (id) => Uint8ClampedArray.from(decodePng(readFileSync(join(OUT, "full", id + ".png"))).px), save = (n, g) => writeFileSync(join(V, n), encodePng(g.w, g.h, g.px));
  // HEM groups: one tile per (bottom, shoes) with heather, the feet at 1:1 and x2; HIP groups: the right hip at x4 with heather and navy
  const hems = [...new Set(C.map((c) => c.hem))], hemTiles = [], hem1 = [], layout = { hem: [], hip: [], colours: {} };
  for (const h of hems) { const c = C.find((x) => x.hem === h && x.design === "LS2-HEATHER"), P = flat(load(c.id), LIGHT); hemTiles.push(crop(P, [330, 1230, 694, 1536], 1)); hem1.push(down(P, 110, 165)); layout.hem.push(h); gc(); }
  save("hem-groups--1to1.png", grid(hemTiles, 5, 8)); save("hem-groups--110x165.png", grid(hem1, 10, 6));
  const hips = [...new Set(C.map((c) => c.hip))], hipTiles = [];
  for (const h of hips) for (const d of ["LS2-HEATHER", "LS2-NAVY-FOX"]) { const c = C.find((x) => x.hip === h && x.design === d); hipTiles.push(crop(flat(load(c.id), LIGHT), [590, 770, 670, 840], 4)); layout.hip.push(h + " " + d + " (" + c.shoes + ")"); gc(); }
  save("hip-groups--x4.png", grid(hipTiles, 2, 8));
  // colours: designs x shoes over capri (every shoe reaches capri), app size, light and dark
  const shoes = [...new Set(C.filter((c) => c.bottom === "bottom-capri-lightblue").map((c) => c.shoes))], designs = [...new Set(C.map((c) => c.design))]; layout.colours = { rows: designs, columns: shoes, bottom: "bottom-capri-lightblue" };
  for (const [bn, bg] of [["light", LIGHT], ["dark", DARK]]) for (const [w2, h2] of [[110, 165], [300, 450]]) { const t = []; for (const d of designs) for (const s of shoes) t.push(down(flat(load(C.find((x) => x.design === d && x.shoes === s && x.bottom === "bottom-capri-lightblue").id), bg), w2, h2)); save("colours--capri--" + w2 + "x" + h2 + "--" + bn + ".png", grid(t, shoes.length, 6)); gc(); }
  // cuffs: unchanged layers — one x3 crop per design to show it
  const cuff = designs.map((d) => crop(flat(load(C.find((x) => x.design === d).id), LIGHT), [280, 770, 420, 870], 3)); save("cuffs--x3.png", grid(cuff, designs.length, 8));
  writeFileSync(join(OUT, "sheets.json"), JSON.stringify(layout, null, 2) + "\n"); console.log(JSON.stringify({ hemGroups: hems.length, hipGroups: hips.length, colourGrid: designs.length + "x" + shoes.length }));
}
export const FEET_ROW = 1280;   // above the tallest shoe's shaft (the lace-up boots reach row 1292)
async function phaseReuse(AL, OUT, DW) {
  const C = JSON.parse(readFileSync(join(OUT, "combinations.json"), "utf8")).combinations, tmp = join(tmpdir(), "d339r-" + process.pid); mkdirSync(tmp, { recursive: true });
  const cache = new Map(), px = (src) => { const f = src.split("/").pop(); if (!cache.has(f)) { const o = join(tmp, "x.png"); execFileSync(DW, ["-quiet", join(PUB, f), "-o", o]); cache.set(f, Uint8ClampedArray.from(decodePng(readFileSync(o)).px)); } return cache.get(f); };
  const teeOutfit = (bottom, shoes) => { for (const k of Object.keys(AL.NORTHSTAR_OUTFITS)) for (const p of [null, ...Object.keys(AL.NORTHSTAR_SOLID_PANTS)]) for (const sh of [null, ...Object.keys(AL.NORTHSTAR_SHOE_CHOICES)]) {
      const o = AL.northstarOutfitFor(k, null, p, sh); if (o && o.bottom === bottom && o.shoes === shoes) return { label: [k, p, sh].filter(Boolean).join("+"), o }; } return null; };
  const A = JSON.parse(readFileSync(join(ROOT, "tools", "avatar", "fixtures", "northstar-wardrobe", "sweater", "ls2-owner-approval-v1.json"), "utf8")), refs = {}, res = {}, ART = join(homedir(), "Documents", "DenSejeApp-artefacts");
  const approvedAbove = (c) => { const a = A.combinations.find((x) => x.top === c.top && x.bottom === c.bottom); if (!a) return null; return Uint8ClampedArray.from(decodePng(readFileSync(join(ART, ...a.rendering.file.replace("<Documents>/DenSejeApp-artefacts/", "").split("/")))).px); };
  try { for (const c of C) { if (!refs[c.hem]) { const t = teeOutfit(c.bottom, c.shoes); refs[c.hem] = { label: t.label, top: t.o.top, px: AL.northstarCompose(AL.northstarPlanFor(t.o), px, N) }; }
      const a = Uint8ClampedArray.from(decodePng(readFileSync(join(OUT, "full", c.id + ".png"))).px), b = refs[c.hem].px; let d = 0;
      for (let i = FEET_ROW * W * 4; i < N * 4; i++) if (a[i] !== b[i]) d++; const ap = approvedAbove(c); let u = -1; if (ap) { u = 0; for (let i = 0; i < FEET_ROW * W * 4; i++) if (a[i] !== ap[i]) u++; }
      res[c.id] = { hem: c.hem, hip: c.hip, teeOutfit: refs[c.hem].label, teeTop: refs[c.hem].top, feetBytesDiffering: d, aboveFeetBytesDifferingFromApprovedSweater: u }; gc(); } }
  finally { rmSync(tmp, { recursive: true, force: true }); }
  const all = Object.values(res), summary = { units: all.length, feetIdenticalToApprovedTeeOutfit: all.filter((r) => r.feetBytesDiffering === 0).length, differing: all.filter((r) => r.feetBytesDiffering).map((r) => r.hem),
    aboveFeetIdenticalToApprovedSweater: all.filter((r) => r.aboveFeetBytesDifferingFromApprovedSweater === 0).length, aboveFeetDiffering: all.filter((r) => r.aboveFeetBytesDifferingFromApprovedSweater !== 0).map((r) => r.hip) };
  writeFileSync(join(OUT, "reuse.json"), JSON.stringify({ decision: "D-339", feetFromRow: FEET_ROW, summary, units: res }, null, 2) + "\n"); console.log(JSON.stringify(summary));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error("REFUSED: " + e.message); process.exit(1); });
