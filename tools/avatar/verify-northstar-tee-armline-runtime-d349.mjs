// D-349 — THE PUBLISHED TEE LAYER VERSIONS (U-343-1) IN THE RUNTIME, verified on the owner's machine (needs D-349's private staging; no
// image call). Every file the browser draws is decoded from assets/avatar-northstar/ (the published bytes), then:
//   1. FILES — the 36 published -v2 files are exactly the approved list (tee-armline-owner-approval-v1.json, pinned to the merged
//      candidate list) and the private staging, byte for byte; every v1 file they replace is still published with its manifest sha256;
//   2. ITEMS — exactly the 18 tees set layerRev 2 and no other item sets it; apart from layerRev each tee is the item it was;
//   3. TEE OUTFITS — for every outfit the opt-in can show with a tee (D-349's teeOutfits, the browser's own functions), the runtime plan
//      draws that tee's two -v2 layers and its v1 shadows, and northstarCompose on the published files differs from the v1 revision (the
//      same table without layerRev) only on that tee's moved pixels, with no lower alpha; the outfits and their changed-pixel counts are
//      exactly D-349's private check (check.json);
//   4. OTHER TOPS — every approved sweater and tank combination (NORTHSTAR_LS2_COMBOS, NORTHSTAR_TANK_COMBOS) has the same plan as the v1
//      revision and draws no tee file.
// The v1 files stay published: the historical approvals and verifiers that compose the v1 revision keep their evidence.
// With --record, the result is written into the manifest (the 36 file entries and a D-349 extension). No other file is written.
// Usage: node --expose-gc tools/avatar/verify-northstar-tee-armline-runtime-d349.mjs --dwebp <dwebp.exe> --staged <D-349 staging dir> [--record]
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { teeItems, teeOutfits, resplitTee, NEW_REV } from "./northstar-tee-armline-d349.mjs";
import { decodePng } from "./r3-hair-tool-v2.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", ".."), DIR = join(ROOT, "assets", "avatar-northstar"), N = 1024 * 1536;
const sha = (b) => createHash("sha256").update(b).digest("hex"), gc = () => { if (typeof globalThis.gc === "function") globalThis.gc(); };
export const APPROVAL_REL = "tools/avatar/fixtures/northstar-wardrobe/tee/tee-armline-owner-approval-v1.json";
export const CANDIDATES_REL = "tools/avatar/fixtures/northstar-wardrobe/tee/tee-armline-v2-candidates.json";
export function approval() { return JSON.parse(readFileSync(join(ROOT, APPROVAL_REL), "utf8")); }

/** The v1 revision of an item table: the same items without layerRev — what the tees drew before D-349's publication. */
export function v1Table(table) { return Object.fromEntries(Object.entries(table).map(([k, it]) => { const { layerRev, ...rest } = it; return [k, rest]; })); }

async function main() {
  const args = process.argv.slice(2), at = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), DWEBP = at("--dwebp"), STAGED = at("--staged");
  if (!DWEBP || !STAGED) throw new Error("--dwebp and --staged");
  const AL = await import(pathToFileURL(join(ROOT, "js", "avatar-layers.js")).href), A = approval(), C = JSON.parse(readFileSync(join(ROOT, CANDIDATES_REL), "utf8"));
  const man = JSON.parse(readFileSync(join(DIR, "manifest.json"), "utf8"));
  // 1. files
  if (sha(readFileSync(join(ROOT, CANDIDATES_REL))) !== A.candidatesSha256) throw new Error("the candidate list is not the approved one");
  const key = (l) => JSON.stringify(l.map((e) => [e.file, e.replaces, e.sha256, e.bytes]));
  if (key(A.files) !== key(C.files)) throw new Error("the approval is not the candidate list's 36 files");
  const st = JSON.parse(readFileSync(join(STAGED, "staging-manifest.json"), "utf8"));
  if (sha(readFileSync(join(STAGED, "staging-manifest.json"))) !== C.stagingManifestSha256) throw new Error("the private staging manifest changed");
  if (JSON.stringify(st.files.map((e) => [e.file, e.sha256, e.bytes])) !== JSON.stringify(A.files.map((e) => [e.file, e.sha256, e.bytes]))) throw new Error("the staging is not the approved list");
  for (const e of A.files) { const b = readFileSync(join(DIR, e.file)); if (sha(b) !== e.sha256 || b.length !== e.bytes) throw new Error("not the approved bytes: " + e.file);
    if (sha(readFileSync(join(STAGED, e.file))) !== e.sha256) throw new Error("the private staging changed: " + e.file);
    const old = (man.files.find((f) => f.file === e.replaces) || {}).sha256; if (!old || sha(readFileSync(join(DIR, e.replaces))) !== old) throw new Error("the v1 file is not kept: " + e.replaces); }
  // 2. items
  const tees = teeItems(AL);
  if (JSON.stringify([...tees].sort()) !== JSON.stringify(A.items)) throw new Error("the runtime's tees are not the approved 18");
  for (const [k, it] of Object.entries(AL.NORTHSTAR_ITEMS)) if ((it.layerRev !== undefined) !== tees.includes(k) || (tees.includes(k) && it.layerRev !== NEW_REV)) throw new Error(k + ": layerRev " + it.layerRev);
  const T1 = v1Table(AL.NORTHSTAR_ITEMS);
  // 3. tee outfits
  const tmp = join(tmpdir(), "d349r-" + process.pid); mkdirSync(tmp, { recursive: true }); const cache = new Map();
  const get = (src) => { const f = src.split("/").pop(); if (!cache.has(f)) { const o = join(tmp, "x.png"); execFileSync(DWEBP, ["-quiet", join(DIR, f), "-o", o]); cache.set(f, Uint8ClampedArray.from(decodePng(readFileSync(o)).px)); } return cache.get(f); };
  const want = JSON.parse(readFileSync(join(STAGED, "check.json"), "utf8")).units, units = [];
  try { const arms = get("figure-arms-v1.webp"); let current = null, moved = null;
    for (const [label, o] of teeOutfits(AL).sort((a, b) => (a[1].top < b[1].top ? -1 : a[1].top > b[1].top ? 1 : 0))) {
      if (o.top !== current) { for (const k of [...cache.keys()]) if (k.startsWith("top-tee-")) cache.delete(k); current = o.top; gc();
        moved = new Set(resplitTee(get(o.top + "-top-body-v1.webp"), get(o.top + "-sleeves-v1.webp"), arms).moved); }
      const plan = AL.northstarPlanFor(o), srcs = plan.map((s) => s.src.split("/").pop());
      if (!srcs.includes(o.top + "-top-body-v2.webp") || !srcs.includes(o.top + "-sleeves-v2.webp") || srcs.some((f) => f.startsWith("top-tee-") && f.endsWith("-v1.webp") && !f.includes("shadow"))) throw new Error(label + ": the runtime plan does not draw the v2 layers");
      if (JSON.stringify(srcs.map((f) => f.replace(/-v2\.webp$/, "-v1.webp"))) !== JSON.stringify(AL.northstarPlanFor(o, T1).map((s) => s.src.split("/").pop()))) throw new Error(label + ": the plan differs from the v1 revision beyond the file version");
      const before = AL.northstarCompose(AL.northstarPlanFor(o, T1), get, N), after = AL.northstarCompose(plan, get, N); let changed = 0, outside = 0, lower = 0;
      for (let i = 0; i < N; i++) { const j = i * 4; if (before[j] !== after[j] || before[j + 1] !== after[j + 1] || before[j + 2] !== after[j + 2] || before[j + 3] !== after[j + 3]) { changed++; if (!moved.has(i)) outside++; } if (after[j + 3] < before[j + 3]) lower++; }
      if (outside || lower) throw new Error(label + ": " + outside + " changed pixels outside the moved line, " + lower + " lower alpha");
      units.push({ outfit: label, top: o.top, bottom: o.bottom, shoes: o.shoes, moved: moved.size, changed }); } }
  finally { rmSync(tmp, { recursive: true, force: true }); }
  if (JSON.stringify(units) !== JSON.stringify(want)) throw new Error("the tee outfits or their changes are not D-349's private check");
  // 4. other tops
  for (const c of [...AL.NORTHSTAR_LS2_COMBOS, ...AL.NORTHSTAR_TANK_COMBOS]) { const [top, bottom, shoes] = c.split("+"), o = { top, bottom, shoes }, p = AL.northstarPlanFor(o);
    if (JSON.stringify(p) !== JSON.stringify(AL.northstarPlanFor(o, T1)) || p.some((s) => s.src.includes("top-tee-"))) throw new Error(c + ": not the v1 revision's plan"); }
  const result = { what: "northstarCompose(northstarPlanFor(outfit)) on the published files against the v1 revision (the same items without layerRev), RGBA pixels that differ; every outfit the opt-in can show with a tee",
    teeOutfits: units.length, tees: new Set(units.map((u) => u.top)).size, changedOutsideMoved: 0, alphaLower: 0, maxChanged: Math.max(...units.map((u) => u.changed)), equalsPrivateCheck: true,
    sweaterAndTankCombosUnchanged: AL.NORTHSTAR_LS2_COMBOS.length + AL.NORTHSTAR_TANK_COMBOS.length, publishedFilesEqualStaged: A.files.length, v1FilesKept: A.files.length };
  if (args.includes("--record")) { const mp = join(DIR, "manifest.json"), names = A.files.map((e) => e.file);
    man.files = [...man.files.filter((f) => !names.includes(f.file)), ...st.files.map(({ oldFile, oldSha256, oldBytes, ...e }) => ({ ...e, origin: { ...e.origin, oldSha256, decision: "D-349", approval: APPROVAL_REL } }))].sort((a, b) => (a.file < b.file ? -1 : 1));
    man.counts = { ...man.counts, d349Files: A.files.length, files: man.files.length };
    man.extensions = [...(man.extensions || []).filter((e) => e.decision !== "D-349"), { decision: "D-349", publishedBy: "D-349", authorisation: "owner " + A.publishAndActivate.date + ": " + A.publishAndActivate.owner, ownerApproval: A.hashApproval.owner,
      files: names, replaces: A.files.map((e) => e.replaces), approval: APPROVAL_REL, candidates: CANDIDATES_REL, layerRev: { items: A.items, rev: NEW_REV, shadows: "unchanged (v1)" },
      v1Kept: "the replaced v1 files stay published, unchanged; the v1 revision (the item table without layerRev) composes exactly what was drawn before",
      stagedManifestSha256: C.stagingManifestSha256, equivalence: result }];
    writeFileSync(mp, JSON.stringify(man, null, 2) + "\n"); }
  console.log(JSON.stringify(result));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error("REFUSED: " + e.message); process.exit(1); });
