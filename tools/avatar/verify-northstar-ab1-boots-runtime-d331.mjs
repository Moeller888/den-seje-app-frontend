// D-331 — THE PUBLISHED AB-1 ANKLE BOOTS IN THE RUNTIME, verified on the owner's machine (needs D-325's and D-326's private renderings;
// no image call). Every file the browser draws is decoded from assets/avatar-northstar/ (the published bytes), then:
//   1. FILES — the 4 published files are exactly D-326's staged files (sha256 and bytes) and its file list;
//   2. LIST — js/avatar-layers.js NORTHSTAR_AB1_BOOT_COMBOS is exactly the 180 combinations D-326 mapped (its combinations.json and
//      northstar-ab1-boot-runtime-prep.mjs combinations(), the browser's own functions);
//   3. REACHABLE — every outfit the opt-in can show with a boot choice (each K outfit, without and with every print tee and trousers it
//      allows, with each boot where northstarShoeAllowed lets it in) is one of the 180, and every one of the 180 is reachable;
//   4. EQUIVALENCE — for each, northstarCompose(northstarPlanFor(outfit)) on the published files equals byte for byte: the owner-shown
//      D-325 rendering (10, cream tee) or D-326's checked pipeline composite (170); the skin shadow is the published ankle boots'.
// With --record, the result is written into the manifest's D-326 extension (and the 4 file entries). No other file is written.
// Usage: node --expose-gc tools/avatar/verify-northstar-ab1-boots-runtime-d331.mjs --dwebp <dwebp.exe> --study <D-325 dir> --prep <D-326 dir> [--record]
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { decodePng } from "./r3-hair-tool-v2.mjs";
import * as PREP from "./northstar-ab1-boot-runtime-prep.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", ".."), DIR = join(ROOT, "assets", "avatar-northstar");
const sha = (b) => createHash("sha256").update(b).digest("hex"), gc = () => { if (typeof globalThis.gc === "function") globalThis.gc(); };
export const AUTHORISATION = "owner 2026-11-03: Jeg godkender offentliggørelse af de fire runtime-filer i D-326 med de registrerede SHA-256-hashes. Tilladelsen omfatter de to støvlelag og de to dækningsmasker under assets/avatar-northstar/ som udvidelse af D-242's undtagelse fra D-127 §2. Jeg godkender også, at AB1-BOOT-ORIGINAL og AB1-BOOT-LIGHTSAND tilbydes i Northstar-opt-in for præcis de 180 kombinationer kortlagt i D-326. Registrér særskilt, at 10 kombinationer var vist for mig, mens de øvrige 170 blev kontrolleret teknisk. Hold udgivelsen til de fire filer og opt-in-integrationen. Behold AVATAR_NORTHSTAR_WARDROBE=false, og lad katalog, shop og almindelig elevvisning være uden for opgaven.";
const slugOf = (design) => design.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Every distinct outfit the opt-in can show with an approved boot: [[label, outfit, boot], …]. */
export function reachableBootOutfits(AL) {
  const seen = new Map();
  for (const k of Object.keys(AL.NORTHSTAR_OUTFITS)) for (const t of [null, ...Object.keys(AL.NORTHSTAR_PRINT_TEES)]) for (const p of [null, ...Object.keys(AL.NORTHSTAR_SOLID_PANTS)]) for (const b of Object.keys(AL.NORTHSTAR_AB1_BOOTS)) {
    if (!AL.northstarShoeAllowed(k, t, p, b)) continue; const o = AL.northstarOutfitFor(k, t, p, b), id = [o.top, o.bottom, o.shoes].join("+");
    if (o.shoes !== AL.NORTHSTAR_AB1_BOOTS[b].item) throw new Error(k + ": the boot was not applied");
    if (!seen.has(id)) seen.set(id, [[k, t, p, b].filter(Boolean).join("+"), o, b]); }
  return [...seen.values()];
}

async function main() {
  const args = process.argv.slice(2), at = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), DWEBP = at("--dwebp"), STUDY = at("--study"), PRE = at("--prep");
  if (!DWEBP || !STUDY || !PRE) throw new Error("--dwebp, --study and --prep");
  const AL = await import(pathToFileURL(join(ROOT, "js", "avatar-layers.js")).href), A = PREP.approval();
  // 1. files
  const st = JSON.parse(readFileSync(join(PRE, "staging-manifest.json"), "utf8")); if (st.approval.sha256 !== sha(readFileSync(join(ROOT, PREP.APPROVAL_REL)))) throw new Error("the staging is not on this approval file");
  for (const e of st.files) { const b = readFileSync(join(DIR, e.file)); if (sha(b) !== e.sha256 || b.length !== e.bytes) throw new Error("not D-326's staged bytes: " + e.file); }
  const bootFiles = Object.values(AL.NORTHSTAR_AB1_BOOTS).flatMap((b) => [b.item + "-shoes-v1.webp", "hide-" + b.item + "-v1.webp"]).sort();
  if (JSON.stringify(bootFiles) !== JSON.stringify(st.files.map((e) => e.file).sort())) throw new Error("the runtime's files are not D-326's file list");
  for (const b of A.approved) if (AL.NORTHSTAR_AB1_BOOTS[b.id].item !== b.proposedRuntimeItem) throw new Error(b.id + ": not the approved runtime item");
  // 2. the list
  const mapped = JSON.parse(readFileSync(join(PRE, "combinations.json"), "utf8")).combinations, want = mapped.map((c) => c.key).sort();
  if (JSON.stringify(PREP.combinations(AL, A).map((c) => c.key).sort()) !== JSON.stringify(want)) throw new Error("D-326's mapping no longer matches the opt-in");
  if (JSON.stringify([...AL.NORTHSTAR_AB1_BOOT_COMBOS].sort()) !== JSON.stringify(want)) throw new Error("NORTHSTAR_AB1_BOOT_COMBOS is not D-326's 180");
  // 3. reachable
  const reach = reachableBootOutfits(AL), ids = reach.map(([, o]) => [o.top, o.bottom, o.shoes].join("+")).sort();
  if (JSON.stringify(ids) !== JSON.stringify(want)) throw new Error("the reachable boot outfits are not exactly the 180");
  // 4. equivalence: the owner-shown renderings (10) and D-326's checked composites (170)
  const tmp = join(tmpdir(), "d331-" + process.pid); mkdirSync(tmp, { recursive: true }); const cache = new Map(), equivalence = {}; let shown = 0, checked = 0;
  const pixelsOf = (src) => { const f = src.split("/").pop(); if (!cache.has(f)) { const o = join(tmp, "x.png"); execFileSync(DWEBP, ["-quiet", join(DIR, f), "-o", o]); cache.set(f, Uint8ClampedArray.from(decodePng(readFileSync(o)).px)); } return cache.get(f); };
  try { for (const [label, o, b] of reach) { const c = mapped.find((x) => x.key === [o.top, o.bottom, o.shoes].join("+")), ap = A.approved.find((x) => x.id === b);
      const ref = c.shownInD325 ? join(STUDY, "full", slugOf(ap.design) + "--" + o.bottom.replace("bottom-", "") + ".png") : join(PRE, "full", c.id + ".png");
      const plan = AL.northstarPlanFor(o), got = AL.northstarCompose(plan, pixelsOf, 1024 * 1536), want1 = Uint8ClampedArray.from(decodePng(readFileSync(ref)).px);
      if (c.shownInD325 && sha(Buffer.from(want1.buffer)) !== ap.shownRenderings[o.top + "+" + o.bottom].pixelSha256) throw new Error(label + ": not the rendering the owner was shown");
      let d = 0; for (let i = 0; i < want1.length; i++) if (got[i] !== want1[i]) d++;
      equivalence[label] = d; if (d) throw new Error(label + ": " + d + " bytes differ from " + (c.shownInD325 ? "the shown rendering" : "the checked composite"));
      if (!plan.some((x) => x.op === "shade" && x.src.endsWith("/" + AL.NORTHSTAR_AB1_BOOT_BASE + "-shadow-body-v1.webp"))) throw new Error(label + ": not the ankle boots' shadow");
      if (c.shownInD325) shown++; else checked++; if ((shown + checked) % 30 === 0) { for (const k of [...cache.keys()]) if (k.includes("print")) cache.delete(k); gc(); } } }
  finally { rmSync(tmp, { recursive: true, force: true }); }
  const result = { what: "northstarCompose(northstarPlanFor(outfit)) on the published files, RGBA bytes that differ; every distinct outfit the opt-in can show with an AB-1 boot", reachableOutfits: reach.length, outfitsDiffering: 0,
    shownToOwner: shown, checkedTechnically: checked, allReachableOnTheList: true, everyListedReachable: true, shoeShadowIsAnkleBoots: true, publishedFilesEqualStaged: st.files.length };
  if (args.includes("--record")) { const mp = join(DIR, "manifest.json"), man = JSON.parse(readFileSync(mp, "utf8"));
    man.files = [...man.files.filter((f) => !bootFiles.includes(f.file)), ...st.files.map((e) => ({ ...e, origin: { ...e.origin, decision: "D-326" } }))].sort((a, b) => (a.file < b.file ? -1 : 1));
    man.counts = { ...man.counts, d326Files: st.files.length, files: man.files.length };
    man.extensions = [...(man.extensions || []).filter((e) => e.decision !== "D-326"), { decision: "D-326", publishedBy: "D-331", authorisation: AUTHORISATION, files: bootFiles, approval: PREP.APPROVAL_REL,
      itemTable: Object.fromEntries(Object.values(AL.NORTHSTAR_AB1_BOOTS).map((b) => [b.item, AL.NORTHSTAR_ITEMS[b.item]])), combinations: [...AL.NORTHSTAR_AB1_BOOT_COMBOS],
      combinationBasis: { shownToOwner: mapped.filter((c) => c.shownInD325).map((c) => c.key), checkedTechnicallyOnly: mapped.filter((c) => !c.shownInD325).length },
      shadowsReused: { body: { publishedFile: "assets/avatar-northstar/" + AL.NORTHSTAR_AB1_BOOT_BASE + "-shadow-body-v1.webp", sha256: sha(readFileSync(join(DIR, AL.NORTHSTAR_AB1_BOOT_BASE + "-shadow-body-v1.webp"))), identicalForAll: true } },
      stagedManifestSha256: sha(readFileSync(join(PRE, "staging-manifest.json"))), stagedEquivalence: { shownRenderings: Object.keys(st.equivalence).length, differing: 0 }, equivalence: result }];
    writeFileSync(mp, JSON.stringify(man, null, 2) + "\n"); }
  console.log(JSON.stringify(result));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error("REFUSED: " + e.message); process.exit(1); });
