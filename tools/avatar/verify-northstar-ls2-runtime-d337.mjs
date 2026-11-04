// D-337 — THE PUBLISHED SWEATERS IN THE RUNTIME, verified on the owner's machine (needs D-335 v3's private renderings and D-336's staging;
// no image call). Every file the browser draws is decoded from assets/avatar-northstar/ (the published bytes), then:
//   1. FILES — the 15 published files are exactly D-336's staged files (sha256 and bytes) and its file list;
//   2. LIST — js/avatar-layers.js NORTHSTAR_LS2_COMBOS is exactly the 30 combinations of ls2-owner-approval-v1.json, and each sweater's
//      item names the cut's shadow (shadowsOf) and hip seam;
//   3. ORDER — northstarPlanFor draws the hip seam after the shoes and right before the bottom, the sweater's body after the bottom;
//   4. REACHABLE — every outfit the opt-in can show with a sweater (each K outfit, without and with every print tee, trousers and shoe it
//      allows, with each sweater where northstarSweaterAllowed lets it in — the browser's own functions) is one of the 30; the 24 reached;
//   5. EQUIVALENCE — for all 30, northstarCompose(northstarPlanFor(outfit)) on the published files equals the owner-approved D-335 v3
//      rendering byte for byte (its pixel sha256 checked against the approval first).
// With --record, the result is written into the manifest's D-336 extension (and the 15 file entries). No other file is written.
// Usage: node --expose-gc tools/avatar/verify-northstar-ls2-runtime-d337.mjs --dwebp <dwebp.exe> --staged <D-336 staging dir> [--record]
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { homedir, tmpdir } from "node:os";
import { decodePng } from "./r3-hair-tool-v2.mjs";
import * as PREP from "./northstar-ls2-runtime-prep.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", ".."), DIR = join(ROOT, "assets", "avatar-northstar"), ART = join(homedir(), "Documents", "DenSejeApp-artefacts");
const sha = (b) => createHash("sha256").update(b).digest("hex"), gc = () => { if (typeof globalThis.gc === "function") globalThis.gc(); };
export const AUTHORISATION = "owner 2026-11-03: Jeg godkender også offentliggørelse af præcis de 15 filer i D-336's filliste med de registrerede SHA-256-hashes under assets/avatar-northstar/ som udvidelse af D-242's undtagelse fra D-127 §2. Færdiggør derefter integrationen af de seks sweatere i Northstar-opt-in. Tegn det fælles hoftelag bag underdelen og sweaterens krop og ribkant foran. Begræns sweatervalget til de 30 godkendte kombinationer med beige sneakers. Brug de eksisterende outfits, så de 24 kombinationer, der kan nås i panelet i dag, bliver tilgængelige. Hold integrationen bag den eksisterende opt-in med AVATAR_NORTHSTAR_WARDROBE=false.";

/** Every distinct outfit the opt-in can show with an approved sweater: [[label, outfit, sweater], …]. */
export function reachableSweaterOutfits(AL) {
  const seen = new Map();
  for (const k of Object.keys(AL.NORTHSTAR_OUTFITS)) for (const t of [null, ...Object.keys(AL.NORTHSTAR_PRINT_TEES)]) for (const p of [null, ...Object.keys(AL.NORTHSTAR_SOLID_PANTS)]) for (const s of [null, ...Object.keys(AL.NORTHSTAR_SHOE_CHOICES)]) for (const w of Object.keys(AL.NORTHSTAR_LS2_SWEATERS)) {
    if (!AL.northstarSweaterAllowed(k, t, p, s, w)) continue; const o = AL.northstarOutfitFor(k, t, p, s, w), id = [o.top, o.bottom, o.shoes].join("+");
    if (o.top !== AL.NORTHSTAR_LS2_SWEATERS[w].item) throw new Error(k + ": the sweater was not applied");
    if (!seen.has(id)) seen.set(id, [[k, t, p, s, w].filter(Boolean).join("+"), o, w]); }
  return [...seen.values()];
}

async function main() {
  const args = process.argv.slice(2), at = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), DWEBP = at("--dwebp"), STAGED = at("--staged");
  if (!DWEBP || !STAGED) throw new Error("--dwebp and --staged");
  const AL = await import(pathToFileURL(join(ROOT, "js", "avatar-layers.js")).href), A = PREP.approval();
  // 1. files
  const st = JSON.parse(readFileSync(join(STAGED, "staging-manifest.json"), "utf8")); if (st.approval.sha256 !== sha(readFileSync(join(ROOT, PREP.APPROVAL_REL)))) throw new Error("the staging is not on this approval file");
  for (const e of st.files) { const b = readFileSync(join(DIR, e.file)); if (sha(b) !== e.sha256 || b.length !== e.bytes) throw new Error("not D-336's staged bytes: " + e.file); }
  const sw = Object.values(AL.NORTHSTAR_LS2_SWEATERS), files = [...sw.flatMap((s) => [s.item + "-top-body-v1.webp", s.item + "-sleeves-v1.webp"]), AL.NORTHSTAR_LS2_HIP_SEAM, ...["body", "arms"].map((p) => AL.NORTHSTAR_LS2_BASE + "-shadow-" + p + "-v1.webp")].sort();
  if (JSON.stringify(files) !== JSON.stringify(st.files.map((e) => e.file).sort())) throw new Error("the runtime's files are not D-336's file list");
  for (const d of Object.values(A.designs)) { const s = AL.NORTHSTAR_LS2_SWEATERS[d.id]; if (!s || s.item !== d.proposedRuntimeItem) throw new Error(d.id + ": not the approved runtime item");
    const it = AL.NORTHSTAR_ITEMS[s.item]; if (it.shadowsOf !== AL.NORTHSTAR_LS2_BASE || it.hipSeam !== AL.NORTHSTAR_LS2_HIP_SEAM) throw new Error(d.id + ": not the cut's shadow and seam"); }
  // 2. the list
  const want = A.combinations.map((c) => c.top + "+" + c.bottom + "+" + c.shoes).sort();
  if (JSON.stringify([...AL.NORTHSTAR_LS2_COMBOS].sort()) !== JSON.stringify(want)) throw new Error("NORTHSTAR_LS2_COMBOS is not the approval file's 30");
  // 3. order + 4. reachable
  const reach = reachableSweaterOutfits(AL), ids = reach.map(([, o]) => [o.top, o.bottom, o.shoes].join("+"));
  if (ids.some((k) => !want.includes(k))) throw new Error("reachable but not approved: " + ids.filter((k) => !want.includes(k)).join(", "));
  const order = {};
  for (const c of A.combinations) { const srcs = AL.northstarPlanFor({ top: c.top, bottom: c.bottom, shoes: c.shoes }).map((s) => s.src.split("/").pop()), k = srcs.indexOf(AL.NORTHSTAR_LS2_HIP_SEAM);
    if (k < 0 || srcs[k + 1] !== c.bottom + "-pants-v1.webp" || srcs[k - 1] !== c.shoes + "-shoes-v1.webp" || srcs.indexOf(c.top + "-top-body-v1.webp") <= k + 1) throw new Error(c.id + ": the hip seam is not between the shoes and the bottom");
    order[c.id] = srcs.filter((f) => f.includes("-v1.webp") && !f.includes("shadow")).length; }
  // 5. equivalence against the approved renderings
  const tmp = join(tmpdir(), "d337-" + process.pid); mkdirSync(tmp, { recursive: true }); const cache = new Map(), equivalence = {};
  const pixelsOf = (src) => { const f = src.split("/").pop(); if (!cache.has(f)) { const o = join(tmp, "x.png"); execFileSync(DWEBP, ["-quiet", join(DIR, f), "-o", o]); cache.set(f, Uint8ClampedArray.from(decodePng(readFileSync(o)).px)); } return cache.get(f); };
  try { for (const c of A.combinations) { const o = { top: c.top, bottom: c.bottom, shoes: c.shoes }, got = AL.northstarCompose(AL.northstarPlanFor(o), pixelsOf, 1024 * 1536);
      const want1 = Uint8ClampedArray.from(decodePng(readFileSync(join(ART, ...c.rendering.file.replace("<Documents>/DenSejeApp-artefacts/", "").split("/")))).px);
      if (sha(Buffer.from(want1.buffer)) !== c.rendering.pixelSha256) throw new Error(c.id + ": not the approved rendering");
      let d = 0; for (let i = 0; i < want1.length; i++) if (got[i] !== want1[i]) d++; equivalence[c.id] = d; if (d) throw new Error(c.id + ": " + d + " bytes differ from the approved rendering");
      for (const k of [...cache.keys()]) if (k.startsWith(c.top) && !k.includes("shadow")) cache.delete(k); gc(); } }
  finally { rmSync(tmp, { recursive: true, force: true }); }
  const unreachable = want.filter((k) => !ids.includes(k));
  const result = { what: "northstarCompose(northstarPlanFor(outfit)) on the published files against the owner-approved D-335 v3 rendering, RGBA bytes that differ; all 30 approved combinations", approvedCombinations: want.length, outfitsDiffering: 0,
    reachableOutfits: reach.length, approvedNotReachable: unreachable, allReachableApproved: true, hipSeamBetweenShoesAndBottom: true, publishedFilesEqualStaged: st.files.length };
  if (args.includes("--record")) { const mp = join(DIR, "manifest.json"), man = JSON.parse(readFileSync(mp, "utf8"));
    man.files = [...man.files.filter((f) => !files.includes(f.file)), ...st.files.map((e) => ({ ...e, origin: { ...e.origin, decision: "D-336" } }))].sort((a, b) => (a.file < b.file ? -1 : 1));
    man.counts = { ...man.counts, d336Files: st.files.length, files: man.files.length };
    man.extensions = [...(man.extensions || []).filter((e) => e.decision !== "D-336"), { decision: "D-336", publishedBy: "D-337", authorisation: AUTHORISATION, files, approval: PREP.APPROVAL_REL,
      itemTable: Object.fromEntries(sw.map((s) => [s.item, AL.NORTHSTAR_ITEMS[s.item]])), combinations: [...AL.NORTHSTAR_LS2_COMBOS], drawOrder: "body · shoes · hip seam · bottom · top body · arms · sleeves · head · shadows",
      stagedManifestSha256: sha(readFileSync(join(STAGED, "staging-manifest.json"))), equivalence: result }];
    writeFileSync(mp, JSON.stringify(man, null, 2) + "\n"); }
  console.log(JSON.stringify(result));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error("REFUSED: " + e.message); process.exit(1); });
