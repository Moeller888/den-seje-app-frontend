// NORTHSTAR BASE FIGURE C — the local proof of contract v3 (D-205), on C itself, with STAND-IN items only: the minimum items cut
// unchanged from C's own base garments, Northstar's old tee / jeans / sneakers (reference and test material, judged for FIT to C
// and reported separately for compatibility), and deliberate fault stimuli. NO GPT item exists or is tested here. Everything is
// written outside the repository (D-127 §2); nothing is painted or deformed — the stimuli are cuts and moves of existing pixels.
import { writeFileSync, readFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng, decodePng } from "./r3-hair-tool-v2.mjs";
import * as NL from "./r3-northstar-layers.mjs";
import * as WR from "./northstar-wardrobe.mjs";
import * as BF from "./northstar-base-figure.mjs";
import * as BC from "./northstar-base-figure-c.mjs";
import { flat, crop, down, grid } from "./northstar-wardrobe-poc.mjs";

const { W, H, N } = WR, sha = (b) => createHash("sha256").update(b).digest("hex");
const empty = () => new Uint8ClampedArray(N * 4);

/** The stand-in items on a prepared base (C locally; a Northstar-derived stand-in in CI). */
export function standInItems(w, base) {
  const L = w.base.layers, min = BF.minimumItems(base.R, base.sep.lab), A = w.anchors;
  const cut = (P, keep) => { const o = new Uint8ClampedArray(P); for (let i = 0; i < N; i++) if (!keep(i % W, (i / W) | 0)) o[i * 4 + 3] = 0; return o; };
  let y1 = 0; for (let i = 0; i < N; i++) if (base.sep.lab[i] === 2) y1 = Math.max(y1, (i / W) | 0);
  const hole = new Uint8ClampedArray(min.topBody); for (let y = 660; y < 700; y++) for (let x = 492; x < 532; x++) hole[(y * W + x) * 4 + 3] = 0;
  const lifted = empty(); for (let i = 20 * W; i < N; i++) lifted.set(L.shoes.subarray(i * 4, i * 4 + 4), (i - 20 * W) * 4);
  return {
    "min-sleeveless-top": { kind: "minimum", category: "top", layers: { topBody: min.topBody, sleeves: empty() }, expectFit: true, what: "C's own base top as the smallest sleeveless top" },
    "min-shorts": { kind: "minimum", category: "bottom", layers: { pants: min.pants }, expectFit: true, what: "C's own base shorts as the shortest shorts" },
    "legacy-tee": { kind: "legacy", category: "top", layers: { topBody: L["top-body"], sleeves: L["top-sleeves"] }, expectFit: null, what: "Northstar's tee — old reference item, judged for fit to C" },
    "legacy-jeans": { kind: "legacy", category: "bottom", layers: { pants: L.pants }, expectFit: null, what: "Northstar's jeans — old reference item, judged for fit to C" },
    "legacy-sneakers": { kind: "legacy", category: "shoes", layers: { shoes: L.shoes }, expectFit: null, what: "Northstar's sneakers — old reference item, judged for fit to C" },
    "FAULT-top-hole": { kind: "fault", category: "top", layers: { topBody: hole, sleeves: empty() }, expectFit: false, what: "the sleeveless top with a 40×40 px hole in the chest" },
    "FAULT-shorts-too-short": { kind: "fault", category: "bottom", layers: { pants: cut(min.pants, (x, y) => y < y1 - 60) }, expectFit: false, what: "the shorts cut 60 px above their hem — the base interior left open" },
    "FAULT-sleeves-in-body-layer": { kind: "fault", category: "top", layers: { topBody: NL.overStack([min.topBody, (() => { const o = empty(); for (let y = 650; y < 760; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (base.arms[i * 4 + 3] >= 128) o.set([150, 150, 165, 255], i * 4); } return o; })()]), sleeves: empty() }, expectFit: false, what: "a sleeve over the upper arm delivered in the top-body layer — hidden behind the arm" },
    "FAULT-top-over-hand": { kind: "fault", category: "top", layers: { topBody: NL.overStack([min.topBody, (() => { const o = empty(); for (let y = A.wristY.left; y < A.wristY.left + 40; y++) for (let x = 320; x < 360; x++) o.set([180, 180, 186, 255], (y * W + x) * 4); return o; })()]), sleeves: empty() }, expectFit: false, what: "a top with a patch over the left hand" },
    "FAULT-shoes-lifted-20": { kind: "fault", category: "shoes", layers: { shoes: lifted }, expectFit: false, what: "the sneakers 20 px above the ground line" },
  };
}

export function fitProof(buf, OUT) {
  if (!BF.isOutsideRepo(OUT)) throw new Error("refusing to write inside the repository (D-127 §2)");
  const img = decodePng(buf), w = WR.buildWardrobe(), base = BC.prepareBase(w, Uint8ClampedArray.from(img.px)), T = BC.templatesC(w, base), S = standInItems(w, base), files = {};
  const save = (n, im, what) => { const b = encodePng(im.w, im.h, im.px); writeFileSync(join(OUT, n), b); files[n] = { sha256: sha(b), w: im.w, h: im.h, what }; };
  const bg = [236, 233, 226], FIGB = [250, 0, 774, 1536], half = (P) => down(flat(P, bg), 262, 768, FIGB);
  const results = {}, tiles = [];
  for (const [id, s] of Object.entries(S)) { const r = BC.fitCheck(w, base, T, s.category, s.layers); results[id] = { kind: s.kind, category: s.category, what: s.what, expectFit: s.expectFit, fitOk: r.fitOk, qualityOk: r.qualityOk, failed: r.checks.filter((c) => !c.ok).map((c) => c.id), checks: r.checks.map(({ axis, id: k, ok, value }) => ({ axis, id: k, ok, value })) }; tiles.push(half(NL.overStack([r.composite]))); }
  save("f01-stand-in-items.png", grid(tiles, 5), "each stand-in item on C (the other categories in the minimum items): " + Object.keys(S).join(" · "));
  const tv = (t, rgb) => { let o = flat(NL.overStack([base.body, base.arms, w.head]), bg); o = BF.tint(o, t.allowed, [120, 220, 120], 0.35); o = BF.tint(o, t.mustCover, rgb, 0.7); o = BF.tint(o, t.protect, [230, 0, 60], 0.6); return half(o); };
  save("f02-templates-c.png", grid([tv(T.top, [200, 60, 170]), tv(T.bottom, [0, 170, 200]), tv(T.shoes, [0, 0, 0])], 3), "category templates on C: allowed (green), must cover — the base interior (magenta / cyan; shoes: none), protected (red)");
  const P = BF.layerProof(w, base.R, base.Z, BF.minimumItems(base.R, base.sep.lab), { sep: base.sep });
  const combos = [["min-sleeveless-top", "min-shorts", null], ["min-sleeveless-top", "legacy-jeans", "legacy-sneakers"], ["legacy-tee", "min-shorts", null], ["legacy-tee", "legacy-jeans", "legacy-sneakers"]];
  save("f03-combinations.png", grid(combos.map(([t, b, sh]) => { const it = { ...S[t].layers, ...S[b].layers, ...(sh ? S[sh].layers : { shoes: empty() }) }; return half(BF.layerProof(w, base.R, base.Z, it, { sep: base.sep }).dressedRuntime); }), 4),
    "combinations on C (stand-ins only): minimum top + shorts barefoot · minimum top + old jeans + sneakers · old tee + shorts barefoot · the old outfit");
  const app = (Q, ww, hh) => down(flat(Q, bg), ww, hh);
  save("f04-app-sizes.png", grid([app(P.dressedRuntime, 110, 165), app(P.dressedRuntime, 52, 78)], 2, 6), "C in the minimum items at hub 110×165 and quiz 52×78");
  const summary = Object.fromEntries(Object.entries(results).map(([k, r]) => [k, { kind: r.kind, expectFit: r.expectFit, fitOk: r.fitOk, qualityOk: r.qualityOk, failed: r.failed }]));
  const report = { decision: "D-205", note: "Stand-in items only — no GPT item exists or was tested. FIT is binding for new items; COMPATIBILITY is a report; QUALITY measures, the look is the owner's.", results, compatibility: BC.legacyReport(w, base), files };
  writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2) + "\n");
  return { summary, report };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const a = process.argv.slice(2), oi = a.indexOf("--out"), pi = a.indexOf("--fit-proof"), OUT = oi >= 0 && a[oi + 1] ? resolve(a[oi + 1]) : null;
  if (!OUT || pi < 0 || !a[pi + 1]) { console.error("usage: --fit-proof <C.png> --out <empty dir outside both clones>"); process.exit(1); }
  if (!BF.isOutsideRepo(OUT)) { console.error("REFUSED: --out is inside the repository; a base figure is never written there (D-127 §2)"); process.exit(1); }
  if (existsSync(OUT) && readdirSync(OUT).length) { console.error("--out must be empty"); process.exit(1); } mkdirSync(OUT, { recursive: true });
  console.log(JSON.stringify(fitProof(readFileSync(resolve(a[pi + 1])), OUT).summary, null, 2));
}
