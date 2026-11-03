// D-308 — THE PUBLISHED SV1-V5 SHOES IN THE RUNTIME, verified on the owner's machine (needs D-304's private renderings; no image call).
// Every file the browser draws is decoded from assets/avatar-northstar/ (the published bytes), then:
//   1. FILES — the 8 published files are exactly D-305's staged files (sha256 and bytes) and its file list;
//   2. LIST — js/avatar-layers.js NORTHSTAR_SV1_SHOE_COMBOS is exactly the 21 combinations of sv1-v5-owner-approval-v1.json;
//   3. REACHABLE — every outfit the opt-in can show with a shoe choice (each K outfit, without and with every print tee and trousers it
//      allows, with each shoe where northstarShoeAllowed lets it in — the browser's own functions) is one of the 21;
//   4. EQUIVALENCE — for each reachable outfit, northstarCompose(northstarPlanFor(outfit)) on the published files equals the owner-
//      approved D-304 rendering byte for byte (the skin shadow is the published beige sneakers' shadow).
// With --record, the result is written into the manifest's D-305 extension (and the 8 file entries). No other file is written.
// Usage: node --expose-gc tools/avatar/verify-northstar-sv1-shoes-runtime-d308.mjs --dwebp <dwebp.exe> --package <D-304 dir> --staged <D-305 staging dir> [--record]
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { decodePng } from "./r3-hair-tool-v2.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", ".."), DIR = join(ROOT, "assets", "avatar-northstar");
const APPROVAL_REL = "tools/avatar/fixtures/northstar-wardrobe/shoe-source/sv1-v5-owner-approval-v1.json";
const sha = (b) => createHash("sha256").update(b).digest("hex"), gc = () => { if (typeof globalThis.gc === "function") globalThis.gc(); };
export const AUTHORISATION = "owner 2026-11-02: D-305 OFFENTLIGGØRELSE OG OPT-IN-INTEGRATION GODKENDT. De otte runtime-filer i D-305's filliste—fire skolag og fire dækningsmasker—med præcis de registrerede sha256-hashes må committes og offentliggøres under assets/avatar-northstar/ som udvidelse af D-242's undtagelse fra D-127 §2. Integrér SV1-V5-skoene i Northstar-opt-in efter D-305's plan, begrænset til de 21 godkendte kombinationer. Tilladelsen omfatter kun disse filer og denne testintegration.";

/** Every distinct outfit the opt-in can show with an approved shoe: [[label, outfit], …]. */
export function reachableShoeOutfits(AL) {
  const seen = new Map();
  for (const k of Object.keys(AL.NORTHSTAR_OUTFITS)) for (const t of [null, ...Object.keys(AL.NORTHSTAR_PRINT_TEES)]) for (const p of [null, ...Object.keys(AL.NORTHSTAR_SOLID_PANTS)]) for (const s of Object.keys(AL.NORTHSTAR_SV1_SHOES)) {
    if (!AL.northstarShoeAllowed(k, t, p, s)) continue; const o = AL.northstarOutfitFor(k, t, p, s), id = [o.top, o.bottom, o.shoes].join("+");
    if (o.shoes !== AL.NORTHSTAR_SV1_SHOES[s].item) throw new Error(k + ": the shoe was not applied");
    if (!seen.has(id)) seen.set(id, [[k, t, p, s].filter(Boolean).join("+"), o, s]); }
  return [...seen.values()];
}

async function main() {
  const args = process.argv.slice(2), at = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), DWEBP = at("--dwebp"), PKG = at("--package"), STAGED = at("--staged");
  if (!DWEBP || !PKG || !STAGED) throw new Error("--dwebp, --package and --staged");
  const AL = await import(pathToFileURL(join(ROOT, "js", "avatar-layers.js")).href), A = JSON.parse(readFileSync(join(ROOT, APPROVAL_REL), "utf8"));
  // 1. files
  const st = JSON.parse(readFileSync(join(STAGED, "manifest.json"), "utf8")); if (st.approval.sha256 !== sha(readFileSync(join(ROOT, APPROVAL_REL)))) throw new Error("the staging is not on this approval file");
  for (const e of st.files) { const b = readFileSync(join(DIR, e.file)); if (sha(b) !== e.sha256 || b.length !== e.bytes) throw new Error("not D-305's staged bytes: " + e.file); }
  const shoeFiles = Object.values(AL.NORTHSTAR_SV1_SHOES).flatMap((s) => [s.item + "-shoes-v1.webp", "hide-" + s.item + "-v1.webp"]).sort();
  if (JSON.stringify(shoeFiles) !== JSON.stringify(st.files.map((e) => e.file).sort())) throw new Error("the runtime's files are not D-305's file list");
  // 2. the list
  const want = A.combinations.map((c) => c.top + "+" + c.bottom + "+" + AL.NORTHSTAR_SV1_SHOES[c.candidate].item).sort();
  if (JSON.stringify([...AL.NORTHSTAR_SV1_SHOE_COMBOS].sort()) !== JSON.stringify(want)) throw new Error("NORTHSTAR_SV1_SHOE_COMBOS is not the approval file's 21");
  // 3. reachable
  const reach = reachableShoeOutfits(AL), out = reach.filter(([, o]) => !want.includes([o.top, o.bottom, o.shoes].join("+"))); if (out.length) throw new Error("reachable but not approved: " + out.map(([k]) => k).join(", "));
  const unreachable = want.filter((c) => !reach.some(([, o]) => [o.top, o.bottom, o.shoes].join("+") === c));
  // 4. equivalence against the approved renderings
  const tmp = join(tmpdir(), "d308-" + process.pid); mkdirSync(tmp, { recursive: true }); const cache = new Map(), equivalence = {};
  const pixelsOf = (src) => { const f = src.split("/").pop(); if (!cache.has(f)) { const o = join(tmp, "x.png"); execFileSync(DWEBP, ["-quiet", join(DIR, f), "-o", o]); cache.set(f, Uint8ClampedArray.from(decodePng(readFileSync(o)).px)); } return cache.get(f); };
  try { for (const [label, o, s] of reach) { const plan = AL.northstarPlanFor(o), got = AL.northstarCompose(plan, pixelsOf, 1024 * 1536);
      const want1 = Uint8ClampedArray.from(decodePng(readFileSync(join(PKG, "full", s + "--" + o.bottom.replace("bottom-", "") + ".png"))).px); let d = 0; for (let i = 0; i < want1.length; i++) if (got[i] !== want1[i]) d++;
      equivalence[label] = d; if (d) throw new Error(label + ": " + d + " bytes differ from the approved rendering");
      if (!plan.some((x) => x.op === "shade" && x.src.endsWith("/" + AL.NORTHSTAR_SV1_SHOE_BASE + "-shadow-body-v1.webp"))) throw new Error(label + ": not the beige sneakers' shadow"); gc(); } }
  finally { rmSync(tmp, { recursive: true, force: true }); }
  const result = { what: "northstarCompose(northstarPlanFor(outfit)) on the published files against the owner-approved D-304 rendering, RGBA bytes that differ; every distinct outfit the opt-in can show with an SV1-V5 shoe", reachableOutfits: reach.length, outfitsDiffering: 0, approvedNotReachable: unreachable, allReachableApproved: true, shoeShadowIsBeigeSneakers: true, publishedFilesEqualStaged: st.files.length };
  if (args.includes("--record")) { const mp = join(DIR, "manifest.json"), man = JSON.parse(readFileSync(mp, "utf8"));
    man.files = [...man.files.filter((f) => !shoeFiles.includes(f.file)), ...st.files.map((e) => ({ ...e, origin: { ...e.origin, decision: "D-305" } }))].sort((a, b) => (a.file < b.file ? -1 : 1));
    man.counts = { ...man.counts, d305Files: st.files.length, files: man.files.length };
    man.extensions = [...(man.extensions || []).filter((e) => e.decision !== "D-305"), { decision: "D-305", publishedBy: "D-308", authorisation: AUTHORISATION, files: shoeFiles, approval: APPROVAL_REL,
      itemTable: Object.fromEntries(Object.values(AL.NORTHSTAR_SV1_SHOES).map((s) => [s.item, AL.NORTHSTAR_ITEMS[s.item]])), combinations: [...AL.NORTHSTAR_SV1_SHOE_COMBOS],
      shadowsReused: { body: { publishedFile: "assets/avatar-northstar/" + AL.NORTHSTAR_SV1_SHOE_BASE + "-shadow-body-v1.webp", sha256: sha(readFileSync(join(DIR, AL.NORTHSTAR_SV1_SHOE_BASE + "-shadow-body-v1.webp"))), identicalForAll: true } },
      stagedManifestSha256: sha(readFileSync(join(STAGED, "manifest.json"))), stagedEquivalence: { approvedCombinations: st.equivalence ? Object.keys(st.equivalence).length : 0, differing: 0 }, equivalence: result }];
    writeFileSync(mp, JSON.stringify(man, null, 2) + "\n"); }
  console.log(JSON.stringify({ ...result, equivalence }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error("REFUSED: " + e.message); process.exit(1); });
