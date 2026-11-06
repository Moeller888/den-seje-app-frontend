// D-355 — THE 33 TOPS IN THE RUNTIME, verified on the owner's machine over the PUBLISHED files (no private file needed but dwebp; no image
// call). Every file the browser draws is decoded from assets/avatar-northstar/, then:
//   1. FILES — the 55 published files are exactly the owner-approved staging list (kit-tops-owner-approval-d355.json: sha256 and bytes,
//      bound to the staging manifest's sha256), each in manifest.json with decision D-355, and the manifest's D-355 extension names them;
//   2. LIST — NORTHSTAR_KIT_TOP_COMBOS is exactly the approval's 1441 combinations, and every item is the extension's item table entry;
//   3. REACHABLE — every outfit the opt-in can show with a top of the 33 (each K outfit with and without every print tee, trousers and
//      shoe it allows — the browser's own functions) is on the list, and every entry of the list is reachable;
//   4. EQUIVALENCE — for every combination (or one cut with --cut), northstarCompose(northstarPlanFor(outfit)) on the published files
//      equals the approved composite (the approval's pixel sha256, from the outfit check).
// Writes result-runtime[-<cut>].json into --out (outside the repository). Nothing in the repository is written.
// Usage: node --expose-gc tools/avatar/verify-northstar-kit-tops-runtime-d355.mjs --dwebp <dwebp.exe> --out <dir> [--cut tee-hip-v2|sweater-long-v3|tank-v5]
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { decodePng } from "./r3-hair-tool-v2.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", ".."), DIR = join(ROOT, "assets", "avatar-northstar"), N = 1024 * 1536;
const sha = (b) => createHash("sha256").update(b).digest("hex"), gc = () => { if (typeof globalThis.gc === "function") globalThis.gc(); };
export const APPROVAL_REL = "tools/avatar/fixtures/northstar-wardrobe/top-cuts/kit-tops-owner-approval-d355.json";
export const approval = () => JSON.parse(readFileSync(join(ROOT, ...APPROVAL_REL.split("/")), "utf8"));
const key = (o) => [o.top, o.bottom, o.shoes].join("+");

/** Every distinct outfit the opt-in can show with a top of the 33: Set of "top+bottom+shoes". */
export function reachableKitOutfits(AL) {
  const seen = new Set();
  for (const k of Object.keys(AL.NORTHSTAR_OUTFITS)) for (const t of [null, ...Object.keys(AL.NORTHSTAR_PRINT_TEES)]) for (const p of [null, ...Object.keys(AL.NORTHSTAR_SOLID_PANTS)]) for (const s of [null, ...Object.keys(AL.NORTHSTAR_SHOE_CHOICES)]) for (const w of Object.keys(AL.NORTHSTAR_KIT_TOPS)) {
    if (!AL.northstarSweaterAllowed(k, t, p, s, w)) continue; const o = AL.northstarOutfitFor(k, t, p, s, w);
    if (o.top !== AL.NORTHSTAR_KIT_TOPS[w].item) throw new Error(k + ": the top was not applied"); seen.add(key(o)); }
  return seen;
}

async function main() {
  const args = process.argv.slice(2), at = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), DW = at("--dwebp"), OUT = at("--out"), CUT = at("--cut");
  if (!DW || !existsSync(DW) || !OUT || resolve(OUT).toLowerCase().startsWith(ROOT.toLowerCase())) throw new Error("--dwebp <exe> --out <dir outside the repository>");
  mkdirSync(OUT, { recursive: true });
  const AL = await import(pathToFileURL(join(ROOT, "js", "avatar-layers.js")).href), A = approval(), M = JSON.parse(readFileSync(join(DIR, "manifest.json"), "utf8")), ext = M.extensions.find((e) => e.decision === "D-355");
  // 1. files
  const files = { bytesOrShaDiffering: [], notInManifest: [] };
  for (const f of A.staging.files) { const b = readFileSync(join(DIR, f.file)); if (sha(b) !== f.sha256 || b.length !== f.bytes) files.bytesOrShaDiffering.push(f.file);
    const e = M.files.find((x) => x.file === f.file); if (!e || e.sha256 !== f.sha256 || e.origin.decision !== "D-355") files.notInManifest.push(f.file); }
  files.count = A.staging.files.length; files.extensionNamesExactly = !!ext && JSON.stringify(ext.files) === JSON.stringify(A.staging.files.map((f) => f.file).sort());
  files.stagingManifestSha256 = ext && ext.stagedManifestSha256 === A.staging.manifestSha256 ? A.staging.manifestSha256 : null; files.noPlanet = !A.staging.files.some((f) => /planet/.test(f.file));
  // 2. list and item table
  const want = A.combinations.map(key).sort(), list = { equalsApproval: JSON.stringify([...AL.NORTHSTAR_KIT_TOP_COMBOS].sort()) === JSON.stringify(want), count: AL.NORTHSTAR_KIT_TOP_COMBOS.length,
    itemTableEqual: Object.entries(ext.itemTable).every(([id, it]) => JSON.stringify(AL.NORTHSTAR_ITEMS[id]) === JSON.stringify(it)) && Object.keys(ext.itemTable).length === 33 };
  // 3. reachable
  const reach = reachableKitOutfits(AL), reachable = { reachable: reach.size, equalsList: reach.size === want.length && want.every((k) => reach.has(k)) };
  // 4. equivalence
  const tmp = join(tmpdir(), "d355r-" + process.pid); mkdirSync(tmp, { recursive: true }); const cache = new Map();
  const px = (src) => { const f = src.split("/").pop(); if (!cache.has(f)) { const o = join(tmp, "x.png"); execFileSync(DW, ["-quiet", join(DIR, f), "-o", o]); cache.set(f, Uint8ClampedArray.from(decodePng(readFileSync(o)).px)); } return cache.get(f); };
  const eq = { checked: 0, differing: [] }; let current = null;
  try { for (const c of A.combinations.filter((x) => !CUT || x.candidate.startsWith(CUT + "--"))) {
      if (current !== c.top) { if (current) for (const k of [...cache.keys()]) if (k.startsWith(current + "-")) cache.delete(k); current = c.top; gc(); }
      const plan = AL.northstarPlanFor({ top: c.top, bottom: c.bottom, shoes: c.shoes }); if (!plan) { eq.differing.push(c.id + " (no plan)"); continue; }
      const got = AL.northstarCompose(plan, px, N); if (sha(Buffer.from(got.buffer, got.byteOffset, got.byteLength)) !== c.compositeSha256) eq.differing.push(c.id); eq.checked++; } }
  finally { rmSync(tmp, { recursive: true, force: true }); }
  const ok = { files: files.count === 55 && !files.bytesOrShaDiffering.length && !files.notInManifest.length && files.extensionNamesExactly && !!files.stagingManifestSha256 && files.noPlanet,
    list: list.equalsApproval && list.count === 1441 && list.itemTableEqual, reachable: reachable.equalsList, equivalence: eq.checked > 0 && eq.differing.length === 0, flagFalse: AL.AVATAR_NORTHSTAR_WARDROBE === false };
  writeFileSync(join(OUT, "result-runtime" + (CUT ? "-" + CUT : "") + ".json"), JSON.stringify({ decision: "D-355", ok, files, list, reachable, equivalence: eq }, null, 2) + "\n");
  console.log(JSON.stringify({ ok, files: { count: files.count, differing: files.bytesOrShaDiffering.length }, list, reachable, equivalence: { checked: eq.checked, differing: eq.differing.length } }));
  if (!Object.values(ok).every(Boolean)) process.exit(1);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
