// D-274 — THE RUNTIME TEE LAYERS OF THE OWNER-APPROVED PRINT COMBINATIONS, prepared PRIVATELY (no image call; nothing published;
// the runtime is not changed). Reads ONLY tp-owner-approval-v1.json: an ID that is not approved is never built.
//   1. the lock: D-270's plan (the modules) and the D-264 master's fingerprint on C; D-271's record by its pinned sha256;
//   2. the layers: each approved combination exactly as D-271 rendered it — the received motif (by its sha256), D-269's rule in the
//      chest-center box (PF.prepareFor), the master's print path on the plain shirt colour (PF.placePrint): topBody and sleeves.
//      Checked layer by layer: the prepared size and the placement as D-271 recorded them, the alpha equal to the plain shirt's and
//      to the runtime cream tee's (the same cut, so the same fit), the footprint inside the safe area;
//   3. the runtime equivalence (D-242's own check, in memory only): buildLayerSet composes each print tee with a fixed partner
//      outfit through northstarPlanFor + northstarCompose (the browser's functions) and requires the pipeline composite byte for
//      byte; the print tee's skin shadow is the cut's, verified identical to the public top-tee-hip-cream shadow files;
//   4. the files: only the 32 tee layers (top-body, sleeves) as lossless WebP 1024x1536 into a PRIVATE staging directory with a
//      manifest (purpose, origin, sha256, bytes) — the exact list a publication permission would cover. No full avatar image and no
//      raw generation is written.
// Usage: node tools/avatar/build-northstar-tee-print-layers.mjs --out <private dir outside the repo> --cwebp <cwebp.exe> --dwebp <dwebp.exe>
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { homedir, tmpdir } from "node:os";
import { decodePng } from "./r3-hair-tool-v2.mjs";
import * as WR from "./northstar-wardrobe.mjs";
import * as BC from "./northstar-base-figure-c.mjs";
import * as IP from "./northstar-item-pilot.mjs";
import * as S1 from "./northstar-r1-similarity.mjs";
import * as RC from "./northstar-r1c-evaluate.mjs";
import * as M1 from "./northstar-r1-material.mjs";
import * as TM from "./northstar-tee-master.mjs";
import * as TMM from "./northstar-tee-material.mjs";
import * as PF from "./northstar-tee-print-family.mjs";
import * as V from "./northstar-tee-print-validation.mjs";
import { fromItem } from "./northstar-r1-material-study.mjs";
import { loadItems, buildLayerSet, writeLayerSet } from "./build-northstar-runtime-assets.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const ART = join(homedir(), "Documents", "DenSejeApp-artefacts"), { N } = WR;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const FX = "tools/avatar/fixtures/northstar-wardrobe/tee-master/";
export const APPROVAL = FX + "tp-owner-approval-v1.json", CANDIDATES = FX + "tp-approval-candidates-v1.json";
export const MOTIF_WORD = Object.freeze({ FOX: "fox", TEA: "teapot", SHD: "shield" });
/** The partner outfit every print tee is checked with in the runtime equivalence (an existing ready K pairing). */
export const PARTNERS = Object.freeze({ bottom: "bottom-shorts-navy", shoes: "shoes-sneakers-white" });
/** The proposed runtime item table entry: the same shape as the cream tee (the same cut, the same skin shadow). */
export const ITEM_SHAPE = Object.freeze({ category: "top", layers: ["top-body", "sleeves"], shadows: ["body", "arms"] });

const json = (rel) => JSON.parse(readFileSync(join(ROOT, ...rel.split("/")), "utf8"));
/** The approved IDs, checked against D-272's candidates and their pinned file: refuses anything else. */
export function approvedIds(approval, candidates, candidatesSha) {
  const p = [], all = new Set([...candidates.advisory.candidates, ...Object.keys(candidates.advisory.notCandidates)]);
  if (approval.basis.candidates.sha256 !== candidatesSha) p.push("the approval does not rest on this candidate file");
  if (!Array.isArray(approval.approved) || new Set(approval.approved).size !== approval.approved.length) p.push("the approved list is not a list of unique IDs");
  for (const id of approval.approved || []) if (!all.has(id)) p.push("not a D-272 combination: " + id);
  for (const id of Object.keys(approval.notApproved || {})) if ((approval.approved || []).includes(id)) p.push("both approved and not approved: " + id);
  if (p.length) throw new Error(p.join("; "));
  return [...approval.approved];
}
/** The pack ID → { callId, colour, runtime item id }. */
export function itemOf(candidates, id) {
  const m = /^TP-([A-Z]{3})-([A-Z]{3})$/.exec(id); if (!m) throw new Error("not an ID: " + id);
  const callId = Object.keys(candidates.source.calls).find((k) => candidates.source.calls[k].code === m[1]), colour = Object.keys(candidates.source.colours).find((k) => candidates.source.colours[k] === m[2]);
  if (!callId || !colour) throw new Error("unknown ID: " + id);
  return { id, callId, colour, item: "top-tee-hip-print-" + MOTIF_WORD[m[1]] + "-" + colour };
}

function outDir(OUT) { const r = relative(ROOT, resolve(OUT || ".")); if (!OUT || !(r.startsWith("..") || isAbsolute(r))) throw new Error("--out must be outside the repository (unpublished layers stay private)"); return OUT; }

function main() {
  const args = process.argv.slice(2), at = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), OUT = outDir(at("--out")), CWEBP = at("--cwebp"), DWEBP = at("--dwebp");
  if (!CWEBP || !DWEBP || !existsSync(CWEBP) || !existsSync(DWEBP)) throw new Error("--cwebp and --dwebp must name the vendored libwebp tools");
  if (existsSync(join(OUT, "manifest.json"))) throw new Error("already staged into " + OUT + "; a staging is never rewritten");
  const candidatesBuf = readFileSync(join(ROOT, ...CANDIDATES.split("/"))), candidates = JSON.parse(candidatesBuf.toString("utf8")), approval = json(APPROVAL), ids = approvedIds(approval, candidates, sha(candidatesBuf));
  // 1. the lock and the record
  const plan = json(V.PLAN_FILE), lock = V.verifyLock(plan); if (lock.length) throw new Error("the D-270 lock does not hold: " + lock.join("; "));
  const recBuf = readFileSync(join(ART, "d-270-tpv-result", "record.json")); if (sha(recBuf) !== approval.basis.d271RecordSha256) throw new Error("D-271's record is not the approved one");
  const record = JSON.parse(recBuf.toString("utf8"));
  const w = WR.buildWardrobe(), cBuf = IP.readC(), base = BC.prepareBase(w, Uint8ClampedArray.from(decodePng(cBuf).px)), T = BC.templatesC(w, base, { revision: "d213" }), env = { w, base, T };
  const { t, src, cl } = RC.cutOf(env), master = TM.buildMaster(t, src), fp = TMM.masterFingerprint(master, t, cl.band); if (V.verifyLock(plan, fp).length) throw new Error("the master's fingerprint is not the locked one");
  const g = S1.geometry(t.core), box = PF.placementBox(g, V.PLACEMENT); if (JSON.stringify(box) !== JSON.stringify(record.placement.box)) throw new Error("the box is not D-271's");
  const cream = (() => { const s = M1.flatten(fromItem(env, "top-tee-hip-cream", "topBody")); return [0, 1, 2].map((k) => { const a = []; for (let i = 0; i < s.w * s.h; i++) a.push(s.px[i * 4 + k]); a.sort((x, y) => x - y); return a[a.length >> 1]; }); })();
  const colours = Object.fromEntries(Object.entries(V.COLOURS).map(([k, v]) => [k, v || cream])); if (JSON.stringify(colours) !== JSON.stringify(record.colours)) throw new Error("the shirt colours are not D-271's");
  const clr = PF.clearance(master, t, cl.band, base.arms), plain = {};
  // the runtime cream tee (the same cut) — its layers and its skin shadow, from its pinned run
  const spec = json("tools/avatar/fixtures/northstar-wardrobe/runtime-assets-inputs-d242.json"), loaded = loadItems({ "top-tee-hip-cream": spec.items["top-tee-hip-cream"], [PARTNERS.bottom]: spec.items[PARTNERS.bottom], [PARTNERS.shoes]: spec.items[PARTNERS.shoes] });
  const creamTee = loaded.P["top-tee-hip-cream"]; if (sha(creamTee.shadow) !== sha(t.shadow)) throw new Error("the cut's skin shadow is not the cream tee's");
  // 2. the layers, checked against D-271
  const motifs = {}, P = { [PARTNERS.bottom]: loaded.P[PARTNERS.bottom], [PARTNERS.shoes]: loaded.P[PARTNERS.shoes] }, origin = { [PARTNERS.bottom]: loaded.origin[PARTNERS.bottom], [PARTNERS.shoes]: loaded.origin[PARTNERS.shoes] }, checks = {};
  for (const id of ids) {
    const it = itemOf(candidates, id), c = candidates.source.calls[it.callId];
    if (!motifs[it.callId]) { const b = readFileSync(join(ART, "tp-validation-calls", it.callId, "tpv.image-1.png")); if (sha(b) !== c.imageSha256) throw new Error(it.callId + ": not the received motif"); motifs[it.callId] = TMM.decodeRgba(b); }
    const prep = PF.prepareFor(motifs[it.callId], [box[2], box[3]]), rm = record.motifs[it.callId];
    if (!plain[it.colour]) plain[it.colour] = TM.render(master, t, base, cl.band, { body: colours[it.colour] });
    const L = PF.placePrint(master, t, base, plain[it.colour].layer, prep.img, box); let fMin = 1e9; for (const i of L.footprint) fMin = Math.min(fMin, clr[i]);
    const alphaSame = (A, B) => { for (let i = 0; i < N; i++) if (A[i * 4 + 3] !== B[i * 4 + 3]) return false; return true; };
    const ck = { preparedAsRecorded: JSON.stringify([prep.img.w, prep.img.h]) === JSON.stringify(rm.prepared.size), placementOkAsRecorded: rm.colours[it.colour].placementOk === true,
      alphaAsPlainShirt: alphaSame(L.layer, plain[it.colour].layer), topBodyAlphaAsCreamTee: alphaSame(L.layers.topBody, creamTee.layers.topBody), sleevesAlphaAsCreamTee: alphaSame(L.layers.sleeves, creamTee.layers.sleeves),
      footprintInSafeArea: fMin >= 1, offContour: L.onContour === 0 };
    const bad = Object.entries(ck).filter(([, v]) => !v).map(([k]) => k); if (bad.length) throw new Error(id + ": " + bad.join(", "));
    checks[id] = { item: it.item, ...ck, footprintMinClearance: fMin, topBodySha256: sha(L.layers.topBody), sleevesSha256: sha(L.layers.sleeves) };
    P[it.item] = { item: it.item, layers: L.layers, shadow: t.shadow, category: "top", covering: "none" };
    origin[it.item] = { approval: "D-274 " + id, method: "D-271 render: tee-master-v1 + D-269 chest-center rule (tee-print-v1), evaluator tpv-v1", motifSha256: c.imageSha256, callId: it.callId, colour: it.colour, rgb: colours[it.colour], masterFingerprint: fp };
  }
  // 3. the runtime equivalence, in memory (the browser's plan and compose)
  return import(pathToFileURL(join(ROOT, "js", "avatar-layers.js")).href).then((AL) => {
    const outfits = ids.map((id) => { const it = itemOf(candidates, id); return [id, { top: it.item, bottom: PARTNERS.bottom, shoes: PARTNERS.shoes }]; });
    const set = buildLayerSet({ P, origin, outfits, figureNames: AL.NORTHSTAR_FIGURE, planOf: (o, tb) => AL.northstarPlanFor(o, tb), compose: AL.northstarCompose, cBuf });
    for (const id of ids) { const it = itemOf(candidates, id); if (JSON.stringify(set.itemTable[it.item]) !== JSON.stringify(ITEM_SHAPE)) throw new Error(id + ": item table " + JSON.stringify(set.itemTable[it.item])); }
    // the print tee's shadow parts equal the published cream tee's shadow files (so they can be reused, not republished)
    const tmp = join(tmpdir(), "d274-" + process.pid); mkdirSync(tmp, { recursive: true }); const shadowReuse = {};
    try { for (const part of ["body", "arms"]) { const pub = join(ROOT, "assets", "avatar-northstar", "top-tee-hip-cream-shadow-" + part + "-v1.webp"), png = join(tmp, part + ".png"); execFileSync(DWEBP, ["-quiet", pub, "-o", png]);
        const px = decodePng(readFileSync(png)).px; let same = true; for (const id of ids) { const f = set.files[itemOf(candidates, id).item + "-shadow-" + part + "-v1.webp"].px; for (let i = 0; i < N * 4 && same; i++) if (f[i] !== px[i]) same = false; }
        if (!same) throw new Error("a print tee's " + part + " shadow is not the published cream tee's"); shadowReuse[part] = { publishedFile: "assets/avatar-northstar/top-tee-hip-cream-shadow-" + part + "-v1.webp", sha256: sha(readFileSync(pub)), identicalForAll: true }; } }
    finally { rmSync(tmp, { recursive: true, force: true }); }
    // 4. only the tee layers, privately
    const selected = {}; for (const id of ids) { const it = itemOf(candidates, id); for (const l of ["top-body", "sleeves"]) { const n = it.item + "-" + l + "-v1.webp"; selected[n] = { ...set.files[n], purpose: "the tee layer " + l + " of " + it.item + " (owner-approved " + id + ", D-274)" }; } }
    const entries = writeLayerSet(selected, OUT, { cwebp: CWEBP, dwebp: DWEBP });
    const manifest = { decision: "D-274", status: "STAGED PRIVATELY — NOT PUBLISHED; publication needs the owner's explicit permission (D-242's exception to D-127 §2 covers only its own 31 layers)",
      approval: { file: APPROVAL, sha256: sha(readFileSync(join(ROOT, ...APPROVAL.split("/")))), ids }, d271RecordSha256: approval.basis.d271RecordSha256, masterFingerprint: fp,
      targetDir: "assets/avatar-northstar/", itemTable: Object.fromEntries(ids.map((id) => [itemOf(candidates, id).item, ITEM_SHAPE])), shadowReuse,
      layerChecks: checks, equivalence: { what: "northstarCompose(northstarPlanFor({ print tee, " + PARTNERS.bottom + ", " + PARTNERS.shoes + " })) against the pipeline composite (layerProof + applyShadow), RGBA bytes that differ; in memory only", outfits: set.equivalence },
      counts: { files: entries.length, bytes: entries.reduce((s, e) => s + e.bytes, 0) }, files: entries };
    writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
    console.log(JSON.stringify({ ids: ids.length, files: entries.length, bytes: manifest.counts.bytes, equivalenceBytesDiffering: Object.values(set.equivalence).reduce((s, e) => s + e.bytesDiffering, 0), shadowReuse: Object.keys(shadowReuse) }));
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { try { Promise.resolve(main()).catch((e) => { console.error("REFUSED: " + e.message); process.exit(1); }); } catch (e) { console.error("REFUSED: " + e.message); process.exit(1); } }
