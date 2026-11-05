// D-349 — U-343-1, THE TEE'S WARM DOTTED LINE ALONG THE ARM EDGE, REPAIRED OFFLINE (no image call; nothing published; no runtime file,
// catalogue, shop or flag changed). The cause: the tee split (TM's production split, threshold 128) leaves a fabric pixel where C's arm
// alpha is 1..127 in the TOP-BODY layer, under C's arms — so C's soft arm edge is drawn over the sleeve fabric, a 1 px warm dotted line
// along the arm inside the sleeve. The repair is the sweater's split (D-335, LS2.splitLayers with threshold 1) on the same fabric: those
// pixels go to the SLEEVE layer, drawn after the arms. Nothing is repainted: the union of the two layers is the published one, byte for
// byte; only the partition changes. The locked method files are not touched; the result is a new file version (-v2).
//   stage — for each of the 18 tees (cream, blue, 16 print tees): decode the published v1 top-body and sleeve layers, check they are TM's
//           threshold-128 split of their union over C's published arm layer (figure-arms-v1), re-split with threshold 1, write
//           <item>-top-body-v2.webp and <item>-sleeves-v2.webp (lossless, decoded back byte for byte) and staging-manifest.json with the
//           old and new sha256 of every file.
//   check — every outfit the opt-in can show with a tee (each K outfit with and without every print tee, trousers and shoe it allows):
//           northstarCompose of the plan on the staged v2 files against today's plan: the pixels that change are only that tee's moved
//           pixels, no alpha is lower (no hole); sweater and tank outfits do not draw a tee file.
// Usage: node --expose-gc tools/avatar/northstar-tee-armline-d349.mjs stage --out <private dir> --cwebp <exe> --dwebp <exe>
//        node --expose-gc tools/avatar/northstar-tee-armline-d349.mjs check --staged <private dir> --dwebp <exe>
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { decodePng } from "./r3-hair-tool-v2.mjs";
import { splitLayers } from "./northstar-longsleeve-master-v2.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", ".."), PUB = join(ROOT, "assets", "avatar-northstar"), W = 1024, N = W * 1536;
const sha = (b) => createHash("sha256").update(b).digest("hex"), gc = () => { if (typeof globalThis.gc === "function") globalThis.gc(); };
export const FROM_ARM_ALPHA = 1;   // the sweater's split (D-335)
export const NEW_REV = 2;

/** The 18 tee items of the runtime: the cream and blue tee and the 16 print tees. */
export const teeItems = (AL) => ["top-tee-hip-cream", "top-tee-hip-blue", ...Object.values(AL.NORTHSTAR_PRINT_TEES).map((t) => t.item)];

/** The repair on one tee: tb and sl are its published layers (RGBA), arms C's arm layer. The union is re-split with the sweater's
 *  threshold. Refuses layers that overlap or that are not the threshold-128 split of their union. Returns { tb, sl, moved }. */
export function resplitTee(tb, sl, arms) {
  const union = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < N; i++) { const a = tb[i * 4 + 3], b = sl[i * 4 + 3]; if (a && b) throw new Error("top-body and sleeves overlap at " + i);
    if (a) union.set(tb.subarray(i * 4, i * 4 + 4), i * 4); else if (b) union.set(sl.subarray(i * 4, i * 4 + 4), i * 4); }
  const base = { arms }, v1 = splitLayers(union, base, 128);
  for (let i = 0; i < N * 4; i++) if (v1.layers.topBody[i] !== tb[i] || v1.layers.sleeves[i] !== sl[i]) throw new Error("the published layers are not the threshold-128 split at byte " + i);
  const v2 = splitLayers(union, base, FROM_ARM_ALPHA), moved = [];
  for (let i = 0; i < N; i++) if (tb[i * 4 + 3] && !v2.layers.topBody[i * 4 + 3]) moved.push(i);
  if (moved.length !== v2.moved) throw new Error("moved pixels disagree");
  return { tb: v2.layers.topBody, sl: v2.layers.sleeves, moved };
}

function decoder(dwebp) {
  const tmp = join(tmpdir(), "d349-" + process.pid); mkdirSync(tmp, { recursive: true });
  return { px: (file) => { const o = join(tmp, "x.png"); execFileSync(dwebp, ["-quiet", file, "-o", o]); return Uint8ClampedArray.from(decodePng(readFileSync(o)).px); }, tmp, done: () => rmSync(tmp, { recursive: true, force: true }) };
}

async function stage(args) {
  const { writeLayerSet } = await import("./build-northstar-runtime-assets.mjs");
  const AL = await import(pathToFileURL(join(ROOT, "js", "avatar-layers.js")).href), D = decoder(args.dwebp), arms = D.px(join(PUB, "figure-arms-v1.webp")), files = [];
  const man = JSON.parse(readFileSync(join(PUB, "manifest.json"), "utf8")), keep = existsSync(args.out) ? readdirSync(args.out).filter((f) => /^top-tee-.*-v2\.webp$/.test(f)) : [];
  try { for (const t of teeItems(AL)) {
      const old = { tb: t + "-top-body-v1.webp", sl: t + "-sleeves-v1.webp" }, r = resplitTee(D.px(join(PUB, old.tb)), D.px(join(PUB, old.sl)), arms);
      const set = { [t + "-top-body-v2.webp"]: { px: r.tb, purpose: "the top-body layer of " + t + " re-split with the sweater's threshold (D-349, U-343-1)", origin: { replaces: old.tb, rule: "LS2.splitLayers(union, C's arms, 1)", movedPx: r.moved.length } },
        [t + "-sleeves-v2.webp"]: { px: r.sl, purpose: "the sleeve layer of " + t + " re-split with the sweater's threshold (D-349, U-343-1)", origin: { replaces: old.sl, rule: "LS2.splitLayers(union, C's arms, 1)", movedPx: r.moved.length } } };
      const entries = writeLayerSet(set, args.out, { cwebp: args.cwebp, dwebp: args.dwebp, keep: [...keep, "staging-manifest.json"] });
      for (const e of entries) { const replaces = e.origin.replaces, prev = man.files.find((f) => f.file === replaces); if (!prev || prev.sha256 !== sha(readFileSync(join(PUB, replaces)))) throw new Error("not the published manifest's " + replaces);
        files.push({ ...e, oldFile: replaces, oldSha256: prev.sha256, oldBytes: prev.bytes }); keep.push(e.file); }
      console.log(t, r.moved.length); gc(); } }
  finally { D.done(); }
  const out = { decision: "D-349", kind: "PRIVATE STAGING — new tee layer versions for the owner's approval; NOT published", rule: "LS2.splitLayers(union of the published v1 layers, C's arms (figure-arms-v1), threshold 1)", newRev: NEW_REV, files: files.sort((a, b) => (a.file < b.file ? -1 : 1)) };
  writeFileSync(join(args.out, "staging-manifest.json"), JSON.stringify(out, null, 2) + "\n"); console.log(files.length + " files staged");
}

/** Every distinct outfit the opt-in can show with a tee on top: [[label, outfit], …]. */
export function teeOutfits(AL) {
  const seen = new Map(), tees = new Set(teeItems(AL));
  for (const k of Object.keys(AL.NORTHSTAR_OUTFITS)) for (const t of [null, ...Object.keys(AL.NORTHSTAR_PRINT_TEES)]) for (const p of [null, ...Object.keys(AL.NORTHSTAR_SOLID_PANTS)]) for (const s of [null, ...Object.keys(AL.NORTHSTAR_SHOE_CHOICES)]) {
    const o = AL.northstarOutfitFor(k, t, p, s); if (!o || !tees.has(o.top) || !AL.northstarPlanFor(o)) continue; const id = [o.top, o.bottom, o.shoes].join("+"); if (!seen.has(id)) seen.set(id, [[k, t, p, s].filter(Boolean).join("+"), o]); }
  return [...seen.values()];
}

async function check(args) {
  const AL = await import(pathToFileURL(join(ROOT, "js", "avatar-layers.js")).href), D = decoder(args.dwebp), st = JSON.parse(readFileSync(join(args.staged, "staging-manifest.json"), "utf8"));
  for (const f of st.files) if (sha(readFileSync(join(args.staged, f.file))) !== f.sha256) throw new Error("the staging changed: " + f.file);
  const table = { ...AL.NORTHSTAR_ITEMS }; for (const t of teeItems(AL)) table[t] = Object.freeze({ ...table[t], layerRev: NEW_REV });
  const cache = new Map(), get = (src) => { const f = src.split("/").pop(); if (!cache.has(f)) cache.set(f, D.px(f.endsWith("-v2.webp") ? join(args.staged, f) : join(PUB, f))); return cache.get(f); };
  const arms = get("figure-arms-v1.webp"), out = [], tees = new Set(teeItems(AL));
  let current = null, moved = null;
  try { for (const [label, o] of teeOutfits(AL).sort((a, b) => (a[1].top < b[1].top ? -1 : a[1].top > b[1].top ? 1 : 0))) {
      if (o.top !== current) { for (const k of [...cache.keys()]) if (k.startsWith("top-tee-")) cache.delete(k); current = o.top; gc();
        moved = new Set(resplitTee(get(o.top + "-top-body-v1.webp"), get(o.top + "-sleeves-v1.webp"), arms).moved); }
      const before = AL.northstarCompose(AL.northstarPlanFor(o), get, N), plan2 = AL.northstarPlanFor(o, table);
      if (!plan2.some((s) => s.src.endsWith(o.top + "-sleeves-v2.webp")) || plan2.some((s) => s.src.includes(o.top) && s.src.endsWith("-v1.webp") && !s.src.includes("shadow"))) throw new Error(label + ": the plan does not draw the v2 layers");
      const after = AL.northstarCompose(plan2, get, N); let changed = 0, outside = 0, lower = 0;
      for (let i = 0; i < N; i++) { const j = i * 4; if (before[j] !== after[j] || before[j + 1] !== after[j + 1] || before[j + 2] !== after[j + 2] || before[j + 3] !== after[j + 3]) { changed++; if (!moved.has(i)) outside++; } if (after[j + 3] < before[j + 3]) lower++; }
      if (outside || lower) throw new Error(label + ": " + outside + " changed pixels outside the moved line, " + lower + " lower alpha");
      out.push({ outfit: label, top: o.top, bottom: o.bottom, shoes: o.shoes, moved: moved.size, changed }); } }
  finally { D.done(); }
  // the other tops never draw a tee file
  const others = [...Object.values(AL.NORTHSTAR_LS2_SWEATERS), ...Object.values(AL.NORTHSTAR_TANKS)].map((x) => x.item);
  for (const c of [...AL.NORTHSTAR_LS2_COMBOS, ...AL.NORTHSTAR_TANK_COMBOS]) { const [top, bottom, shoes] = c.split("+"); const p = AL.northstarPlanFor({ top, bottom, shoes }, table); if (!others.includes(top) || p.some((s) => s.src.includes("top-tee-"))) throw new Error(c + ": draws a tee file"); }
  const res = { outfits: out.length, tees: [...new Set(out.map((x) => x.top))].length, changedOutsideMoved: 0, alphaLower: 0, maxChanged: Math.max(...out.map((x) => x.changed)), sweaterAndTankCombosWithoutTeeFiles: AL.NORTHSTAR_LS2_COMBOS.length + AL.NORTHSTAR_TANK_COMBOS.length, stagingManifestSha256: sha(readFileSync(join(args.staged, "staging-manifest.json"))) };
  writeFileSync(join(args.staged, "check.json"), JSON.stringify({ ...res, units: out }, null, 1) + "\n"); console.log(JSON.stringify(res));
}

async function main() {
  const a = process.argv.slice(2), at = (k) => (a.includes(k) ? a[a.indexOf(k) + 1] : null), phase = a[0];
  const args = { out: at("--out"), staged: at("--staged"), cwebp: at("--cwebp"), dwebp: at("--dwebp") };
  if (!args.dwebp || !existsSync(args.dwebp)) throw new Error("--dwebp <the vendored dwebp>");
  const dir = args.out || args.staged; if (!dir || resolve(dir).toLowerCase().startsWith(ROOT.toLowerCase())) throw new Error("the staging directory must be outside the repository (nothing is published)");
  if (phase === "stage") { if (!args.cwebp || !existsSync(args.cwebp)) throw new Error("--cwebp"); return stage(args); }
  if (phase === "check") return check(args);
  throw new Error("phase: stage | check");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error("REFUSED: " + e.message); process.exit(1); });
