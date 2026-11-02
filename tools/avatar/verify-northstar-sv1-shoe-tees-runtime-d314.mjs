// D-314 — THE 326 APPROVED SV1-V5 SHOE COMBINATIONS IN THE RUNTIME, verified on the owner's machine (needs D-304's and D-312's private
// renderings; no image call). Every file the browser draws is decoded from assets/avatar-northstar/ (the published bytes, unchanged):
//   1. FILES — every published file still has the manifest's sha256 (no asset changed);
//   2. LIST — NORTHSTAR_SV1_SHOE_COMBOS is exactly sv1-v5-owner-approval-v1.json (21) + sv1-shoe-tee-owner-approval-v1.json (305);
//   3. REACHABLE — every outfit the opt-in can show with a shoe choice (the browser's own functions) is approved; the held-out 37 and
//      unknown shoes are refused (the outfit keeps its own shoes);
//   4. EQUIVALENCE — for each reachable outfit, northstarCompose(northstarPlanFor(outfit)) on the published files equals the approved
//      rendering byte for byte: D-304's for the cream tee, D-312's (the pipeline composite of its check) for the blue and print tees.
// Usage: node --expose-gc tools/avatar/verify-northstar-sv1-shoe-tees-runtime-d314.mjs --dwebp <dwebp.exe> --d304 <D-304 dir> --d312 <D-312 dir>
import { readFileSync, mkdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { decodePng } from "./r3-hair-tool-v2.mjs";
import { reachableShoeOutfits } from "./verify-northstar-sv1-shoes-runtime-d308.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", ".."), DIR = join(ROOT, "assets", "avatar-northstar"), FX = join(ROOT, "tools", "avatar", "fixtures", "northstar-wardrobe", "shoe-source");
const sha = (b) => createHash("sha256").update(b).digest("hex"), gc = () => { if (typeof globalThis.gc === "function") globalThis.gc(); };

async function main() {
  const args = process.argv.slice(2), at = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), DWEBP = at("--dwebp"), D304 = at("--d304"), D312 = at("--d312");
  if (!DWEBP || !D304 || !D312) throw new Error("--dwebp, --d304 and --d312");
  const AL = await import(pathToFileURL(join(ROOT, "js", "avatar-layers.js")).href);
  const man = JSON.parse(readFileSync(join(DIR, "manifest.json"), "utf8")); for (const f of man.files) if (sha(readFileSync(join(DIR, f.file))) !== f.sha256) throw new Error("not the manifest's bytes: " + f.file);
  const A = JSON.parse(readFileSync(join(FX, "sv1-v5-owner-approval-v1.json"), "utf8")), B = JSON.parse(readFileSync(join(FX, "sv1-shoe-tee-owner-approval-v1.json"), "utf8"));
  if (sha(readFileSync(join(ROOT, B.candidates.file))) !== B.candidates.sha256) throw new Error("not the approved candidate file");
  const key = (top, bottom, s) => top + "+" + bottom + "+" + AL.NORTHSTAR_SV1_SHOES[s].item;
  const want = new Map([...A.combinations.map((c) => [key(c.top, c.bottom, c.candidate), { src: "d304", file: join(D304, "full", c.candidate + "--" + c.bottom.replace("bottom-", "") + ".png") }]),
    ...B.combinations.map((c) => [key(c.top, c.bottom, c.shoe), { src: "d312", file: join(D312, "full", c.id + ".png") }])]);
  if (want.size !== 326 || JSON.stringify([...AL.NORTHSTAR_SV1_SHOE_COMBOS].sort()) !== JSON.stringify([...want.keys()].sort())) throw new Error("NORTHSTAR_SV1_SHOE_COMBOS is not the 326 approved");
  const reach = reachableShoeOutfits(AL), out = reach.filter(([, o]) => !want.has([o.top, o.bottom, o.shoes].join("+"))); if (out.length) throw new Error("reachable but not approved: " + out.map(([k]) => k).join(", "));
  // refused: the held-out 37 (as the panel can build them) and unknown shoes
  let refused = 0; for (const id of B.notApproved) { const [s, , b] = id.split("--"), t = id.split("--")[1];
    for (const k of Object.keys(AL.NORTHSTAR_OUTFITS)) for (const tee of [null, ...Object.keys(AL.NORTHSTAR_PRINT_TEES)]) for (const p of [null, ...Object.keys(AL.NORTHSTAR_SOLID_PANTS)]) { const o = AL.northstarOutfitFor(k, tee, p);
      if (!o || o.bottom !== "bottom-" + b || !(t === "tee-blue" ? o.top === "top-tee-hip-blue" : t === "tee-cream" ? o.top === "top-tee-hip-cream" : AL.NORTHSTAR_PRINT_TEES[t] && o.top === AL.NORTHSTAR_PRINT_TEES[t].item)) continue;
      if (AL.northstarShoeAllowed(k, tee, p, s) || AL.northstarOutfitFor(k, tee, p, s).shoes === AL.NORTHSTAR_SV1_SHOES[s].item) throw new Error(id + " is not refused (" + [k, tee, p].join("+") + ")"); refused++; } }
  for (const k of Object.keys(AL.NORTHSTAR_OUTFITS)) if (AL.northstarShoeAllowed(k, null, null, "SV1-V5-ORANGE")) throw new Error("an unknown shoe is allowed");
  const tmp = join(tmpdir(), "d314-" + process.pid); mkdirSync(tmp, { recursive: true }); const cache = new Map(), eq = { d304: 0, d312: 0 };
  const pixelsOf = (src) => { const f = src.split("/").pop(); if (!cache.has(f)) { if (cache.size > 40) cache.clear(); const o = join(tmp, "x.png"); execFileSync(DWEBP, ["-quiet", join(DIR, f), "-o", o]); cache.set(f, Uint8ClampedArray.from(decodePng(readFileSync(o)).px)); } return cache.get(f); };
  try { for (const [label, o] of reach) { const w = want.get([o.top, o.bottom, o.shoes].join("+")), got = AL.northstarCompose(AL.northstarPlanFor(o), pixelsOf, 1024 * 1536), ref = decodePng(readFileSync(w.file)).px;
      let d = 0; for (let i = 0; i < ref.length; i++) if (got[i] !== ref[i]) d++; if (d) throw new Error(label + ": " + d + " bytes differ from the approved rendering (" + w.src + ")"); eq[w.src]++; gc(); } }
  finally { rmSync(tmp, { recursive: true, force: true }); }
  console.log(JSON.stringify({ publishedFilesUnchanged: man.files.length, approved: want.size, reachable: reach.length, approvedNotReachable: [...want.keys()].filter((k) => !reach.some(([, o]) => [o.top, o.bottom, o.shoes].join("+") === k)), heldOutRefusedPaths: refused, byteIdentical: eq }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error("REFUSED: " + e.message); process.exit(1); });
