// D-340 — THE EXTENDED SWEATER LIST IN THE RUNTIME, verified on the owner's machine (needs the private D-335 v3 renderings and D-339's
// composites; no image call; no file written but the result). Every file the browser draws is decoded from assets/avatar-northstar/:
//   1. LIST — js/avatar-layers.js NORTHSTAR_LS2_COMBOS is exactly the union of ls2-owner-approval-v1.json (D-336, 30) and
//      ls2-shoe-owner-approval-v1.json (D-340, 240): 270; no navy shorts; the charcoal SV1 sneakers only with the skirt and capri;
//   2. REACHABLE — every outfit the opt-in can show with a sweater (the browser's own functions) is on the list; how many;
//   3. ORDER — for all 270, northstarPlanFor draws the hip seam after the shoes and right before the bottom, the sweater after it;
//   4. EQUIVALENCE — northstarCompose(northstarPlanFor(outfit)) on the published files equals byte for byte: the owner-approved D-335 v3
//      rendering (the 30, pixel sha256 checked) or D-339's checked composite (the 240).
// Usage: node --expose-gc tools/avatar/verify-northstar-ls2-shoes-runtime-d340.mjs --dwebp <dwebp.exe> --d339 <D-339 out dir>
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { homedir, tmpdir } from "node:os";
import { decodePng } from "./r3-hair-tool-v2.mjs";
import { reachableSweaterOutfits } from "./verify-northstar-ls2-runtime-d337.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", ".."), DIR = join(ROOT, "assets", "avatar-northstar"), ART = join(homedir(), "Documents", "DenSejeApp-artefacts");
const FX = join(ROOT, "tools", "avatar", "fixtures", "northstar-wardrobe", "sweater"), sha = (b) => createHash("sha256").update(b).digest("hex"), gc = () => { if (typeof globalThis.gc === "function") globalThis.gc(); };
export const approvedUnion = () => { const A = JSON.parse(readFileSync(join(FX, "ls2-owner-approval-v1.json"), "utf8")), B = JSON.parse(readFileSync(join(FX, "ls2-shoe-owner-approval-v1.json"), "utf8"));
  return { A, B, keys: [...A.combinations, ...B.combinations].map((c) => c.top + "+" + c.bottom + "+" + c.shoes) }; };

async function main() {
  const args = process.argv.slice(2), at = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), DWEBP = at("--dwebp"), D339 = at("--d339");
  if (!DWEBP || !D339) throw new Error("--dwebp and --d339");
  const AL = await import(pathToFileURL(join(ROOT, "js", "avatar-layers.js")).href), { A, B, keys } = approvedUnion();
  // 1. list
  if (JSON.stringify([...AL.NORTHSTAR_LS2_COMBOS].sort()) !== JSON.stringify([...keys].sort())) throw new Error("NORTHSTAR_LS2_COMBOS is not the union of the two approval files");
  if (AL.NORTHSTAR_LS2_COMBOS.some((k) => k.includes("shorts") || (k.endsWith("sv1-charcoal") && k.includes("trousers")))) throw new Error("a restriction is broken");
  // 2. reachable
  const reach = reachableSweaterOutfits(AL), ids = reach.map(([, o]) => [o.top, o.bottom, o.shoes].join("+"));
  if (ids.some((k) => !keys.includes(k))) throw new Error("reachable but not approved");
  // 3 + 4
  const tmp = join(tmpdir(), "d340-" + process.pid); mkdirSync(tmp, { recursive: true }); const cache = new Map(), eq = {};
  const pixelsOf = (src) => { const f = src.split("/").pop(); if (!cache.has(f)) { const o = join(tmp, "x.png"); execFileSync(DWEBP, ["-quiet", join(DIR, f), "-o", o]); cache.set(f, Uint8ClampedArray.from(decodePng(readFileSync(o)).px)); } return cache.get(f); };
  const local = (f) => join(ART, ...f.replace("<Documents>/DenSejeApp-artefacts/", "").split("/"));
  try { for (const [c, file, pxSha] of [...A.combinations.map((c) => [c, local(c.rendering.file), c.rendering.pixelSha256]), ...B.combinations.map((c) => [c, join(D339, "full", c.id + ".png"), null])]) {
      const o = { top: c.top, bottom: c.bottom, shoes: c.shoes }, plan = AL.northstarPlanFor(o), srcs = plan.map((s) => s.src.split("/").pop()), k = srcs.indexOf(AL.NORTHSTAR_LS2_HIP_SEAM);
      if (k < 0 || srcs[k - 1] !== c.shoes + "-shoes-v1.webp" || srcs[k + 1] !== c.bottom + "-pants-v1.webp" || srcs.indexOf(c.top + "-top-body-v1.webp") <= k + 1) throw new Error(c.id + ": not the approved layer order");
      const want = Uint8ClampedArray.from(decodePng(readFileSync(file)).px); if (pxSha && sha(Buffer.from(want.buffer)) !== pxSha) throw new Error(c.id + ": not the approved rendering");
      const got = AL.northstarCompose(plan, pixelsOf, 1024 * 1536); let d = 0; for (let i = 0; i < want.length; i++) if (got[i] !== want[i]) d++;
      eq[c.id] = d; if (d) throw new Error(c.id + ": " + d + " bytes differ"); if (Object.keys(eq).length % 30 === 0) { for (const f of [...cache.keys()]) if (f.startsWith("top-sweater-ls2-") && !f.includes("shadow") && !f.includes("hip-seam")) cache.delete(f); gc(); } } }
  finally { rmSync(tmp, { recursive: true, force: true }); }
  const result = { decision: "D-340", listLength: AL.NORTHSTAR_LS2_COMBOS.length, approvedD336: A.combinations.length, approvedD340: B.combinations.length, reachableOutfits: reach.length,
    approvedNotReachable: keys.filter((k) => !ids.includes(k)), outfitsDiffering: 0, compared: Object.keys(eq).length, hipSeamBetweenShoesAndBottom: true };
  writeFileSync(join(D339, "d340-runtime.json"), JSON.stringify(result, null, 2) + "\n"); console.log(JSON.stringify(result));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error("REFUSED: " + e.message); process.exit(1); });
