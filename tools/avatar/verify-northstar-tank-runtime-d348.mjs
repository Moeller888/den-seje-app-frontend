// D-348 — THE PUBLISHED TANK TOPS IN THE RUNTIME, verified on the owner's machine (needs D-345's private renderings and staging; no
// image call). Every file the browser draws is decoded from assets/avatar-northstar/ (the published bytes), then:
//   1. FILES — the 8 published files are exactly D-345's staged files (sha256 and bytes, tank-owner-approval-v1.json) and its file list;
//   2. LIST — js/avatar-layers.js NORTHSTAR_TANK_COMBOS is exactly the 264 combinations of the approval file, and each tank's item is
//      the staged item table's (one body layer, no sleeves, the cut's shadow and hem junction);
//   3. ORDER — northstarPlanFor draws the hem junction after the shoes and right before the bottom, the tank's body after the bottom,
//      and no sleeve layer of a tank;
//   4. REACHABLE — every outfit the opt-in can show with a tank top (each K outfit, without and with every print tee, trousers and shoe
//      it allows, with each tank where northstarSweaterAllowed lets it in — the browser's own functions) is one of the 264;
//   5. EQUIVALENCE — for all 264, northstarCompose(northstarPlanFor(outfit)) on the published files equals the owner-approved D-345
//      rendering byte for byte (its pixel sha256 checked against the approval first).
// With --record, the result is written into the manifest's D-348 extension (and the 8 file entries). No other file is written.
// Usage: node --expose-gc tools/avatar/verify-northstar-tank-runtime-d348.mjs --dwebp <dwebp.exe> --staged <D-345 runtime-staging dir> [--record]
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { homedir, tmpdir } from "node:os";
import { decodePng } from "./r3-hair-tool-v2.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", ".."), DIR = join(ROOT, "assets", "avatar-northstar"), ART = join(homedir(), "Documents", "DenSejeApp-artefacts");
const sha = (b) => createHash("sha256").update(b).digest("hex"), gc = () => { if (typeof globalThis.gc === "function") globalThis.gc(); };
export const APPROVAL_REL = "tools/avatar/fixtures/northstar-wardrobe/tank/tank-owner-approval-v1.json";
export function approval() { return JSON.parse(readFileSync(join(ROOT, APPROVAL_REL), "utf8")); }

/** Every distinct outfit the opt-in can show with an approved tank top: [[label, outfit, tank], …]. */
export function reachableTankOutfits(AL) {
  const seen = new Map();
  for (const k of Object.keys(AL.NORTHSTAR_OUTFITS)) for (const t of [null, ...Object.keys(AL.NORTHSTAR_PRINT_TEES)]) for (const p of [null, ...Object.keys(AL.NORTHSTAR_SOLID_PANTS)]) for (const s of [null, ...Object.keys(AL.NORTHSTAR_SHOE_CHOICES)]) for (const w of Object.keys(AL.NORTHSTAR_TANKS)) {
    if (!AL.northstarSweaterAllowed(k, t, p, s, w)) continue; const o = AL.northstarOutfitFor(k, t, p, s, w), id = [o.top, o.bottom, o.shoes].join("+");
    if (o.top !== AL.NORTHSTAR_TANKS[w].item) throw new Error(k + ": the tank top was not applied");
    if (!seen.has(id)) seen.set(id, [[k, t, p, s, w].filter(Boolean).join("+"), o, w]); }
  return [...seen.values()];
}

async function main() {
  const args = process.argv.slice(2), at = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), DWEBP = at("--dwebp"), STAGED = at("--staged");
  if (!DWEBP || !STAGED) throw new Error("--dwebp and --staged");
  const AL = await import(pathToFileURL(join(ROOT, "js", "avatar-layers.js")).href), A = approval();
  // 1. files
  const st = JSON.parse(readFileSync(join(STAGED, "staging-manifest.json"), "utf8"));
  if (JSON.stringify(st.files.map((e) => [e.file, e.sha256, e.bytes])) !== JSON.stringify(A.staging.files.map((e) => [e.file, e.sha256, e.bytes]))) throw new Error("the staging is not the approval's file list");
  for (const e of st.files) { const b = readFileSync(join(DIR, e.file)); if (sha(b) !== e.sha256 || b.length !== e.bytes) throw new Error("not D-345's staged bytes: " + e.file);
    const s2 = readFileSync(join(STAGED, "staging", e.file)); if (sha(s2) !== e.sha256) throw new Error("the private staging changed: " + e.file); }
  const tk = Object.values(AL.NORTHSTAR_TANKS), files = [...tk.map((t) => t.item + "-top-body-v1.webp"), AL.NORTHSTAR_TANK_HEM_JUNCTION, AL.NORTHSTAR_TANK_BASE + "-shadow-body-v1.webp"].sort();
  if (JSON.stringify(files) !== JSON.stringify(st.files.map((e) => e.file).sort())) throw new Error("the runtime's files are not D-345's file list");
  for (const d of Object.values(A.designs)) { const t = AL.NORTHSTAR_TANKS[d.id]; if (!t || t.item !== d.proposedRuntimeItem || t.label !== d.label) throw new Error(d.id + ": not the approved runtime item");
    if (JSON.stringify(AL.NORTHSTAR_ITEMS[t.item]) !== JSON.stringify(A.staging.itemTable[t.item])) throw new Error(d.id + ": not the staged item table"); }
  if (Object.keys(AL.NORTHSTAR_TANKS).join() !== Object.keys(A.designs).join()) throw new Error("not the six approved designs");
  // 2. the list
  const want = A.combinations.map((c) => c.top + "+" + c.bottom + "+" + c.shoes).sort();
  if (JSON.stringify([...AL.NORTHSTAR_TANK_COMBOS].sort()) !== JSON.stringify(want)) throw new Error("NORTHSTAR_TANK_COMBOS is not the approval file's 264");
  // 3. order + 4. reachable
  const reach = reachableTankOutfits(AL), ids = reach.map(([, o]) => [o.top, o.bottom, o.shoes].join("+"));
  if (ids.some((k) => !want.includes(k))) throw new Error("reachable but not approved: " + ids.filter((k) => !want.includes(k)).join(", "));
  for (const c of A.combinations) { const srcs = AL.northstarPlanFor({ top: c.top, bottom: c.bottom, shoes: c.shoes }).map((s) => s.src.split("/").pop()), k = srcs.indexOf(AL.NORTHSTAR_TANK_HEM_JUNCTION);
    if (k < 0 || srcs[k + 1] !== c.bottom + "-pants-v1.webp" || srcs[k - 1] !== c.shoes + "-shoes-v1.webp" || srcs.indexOf(c.top + "-top-body-v1.webp") <= k + 1) throw new Error(c.id + ": the hem junction is not between the shoes and the bottom");
    if (srcs.some((f) => /^top-tank.*sleeves/.test(f))) throw new Error(c.id + ": a tank drew sleeves"); }
  // 5. equivalence against the approved renderings
  const tmp = join(tmpdir(), "d348-" + process.pid); mkdirSync(tmp, { recursive: true }); const cache = new Map(), equivalence = {};
  const pixelsOf = (src) => { const f = src.split("/").pop(); if (!cache.has(f)) { const o = join(tmp, "x.png"); execFileSync(DWEBP, ["-quiet", join(DIR, f), "-o", o]); cache.set(f, Uint8ClampedArray.from(decodePng(readFileSync(o)).px)); } return cache.get(f); };
  try { let current = null;
    for (const c of A.combinations) { if (c.top !== current) { for (const k of [...cache.keys()]) if (k.startsWith("top-tank-") && !k.startsWith(c.top + "-top-body") && !k.includes("shadow") && !k.includes("junction")) cache.delete(k); current = c.top; gc(); }
      const o = { top: c.top, bottom: c.bottom, shoes: c.shoes }, got = AL.northstarCompose(AL.northstarPlanFor(o), pixelsOf, 1024 * 1536);
      const want1 = Uint8ClampedArray.from(decodePng(readFileSync(join(ART, ...c.rendering.file.replace("<Documents>/DenSejeApp-artefacts/", "").split("/")))).px);
      if (sha(Buffer.from(want1.buffer)) !== c.rendering.pixelSha256) throw new Error(c.id + ": not the approved rendering");
      let d = 0; for (let i = 0; i < want1.length; i++) if (got[i] !== want1[i]) d++; equivalence[c.id] = d; if (d) throw new Error(c.id + ": " + d + " bytes differ from the approved rendering"); } }
  finally { rmSync(tmp, { recursive: true, force: true }); }
  const unreachable = want.filter((k) => !ids.includes(k));
  const result = { what: "northstarCompose(northstarPlanFor(outfit)) on the published files against the owner-approved D-345 rendering, RGBA bytes that differ; all 264 approved combinations", approvedCombinations: want.length, outfitsDiffering: 0,
    reachableOutfits: reach.length, approvedNotReachable: unreachable, allReachableApproved: true, hemJunctionBetweenShoesAndBottom: true, noSleeves: true, publishedFilesEqualStaged: st.files.length };
  if (args.includes("--record")) { const mp = join(DIR, "manifest.json"), man = JSON.parse(readFileSync(mp, "utf8"));
    man.files = [...man.files.filter((f) => !files.includes(f.file)), ...st.files.map((e) => ({ ...e, origin: { ...e.origin, approval: APPROVAL_REL, decision: "D-345" } }))].sort((a, b) => (a.file < b.file ? -1 : 1));
    man.counts = { ...man.counts, d345Files: st.files.length, files: man.files.length };
    man.extensions = [...(man.extensions || []).filter((e) => e.decision !== "D-345"), { decision: "D-345", publishedBy: "D-348", authorisation: A.publishAndIntegrate, ownerApproval: A.owner, files, approval: APPROVAL_REL,
      itemTable: Object.fromEntries(tk.map((t) => [t.item, AL.NORTHSTAR_ITEMS[t.item]])), combinations: [...AL.NORTHSTAR_TANK_COMBOS], drawOrder: "body · shoes · hem junction · bottom · top body · arms · head · shadows (no sleeves)",
      stagedManifestSha256: sha(readFileSync(join(STAGED, "staging-manifest.json"))), equivalence: result }];
    writeFileSync(mp, JSON.stringify(man, null, 2) + "\n"); }
  console.log(JSON.stringify(result));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error("REFUSED: " + e.message); process.exit(1); });
