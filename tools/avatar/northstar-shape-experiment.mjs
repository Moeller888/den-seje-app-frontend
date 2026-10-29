// D-250 EXPERIMENT A — the offline comparison of shape-based extraction (northstar-shape-extract.mjs) with the production method on
// EXISTING raw pictures only (no image call). Two sets, fixed before any result: DEVELOPMENT — b1's five received pictures, the
// cases the rules were shaped on; REGRESSION — the 21 earlier items (D-207, D-228, D-235; tops, bottoms, closed and OPEN footwear),
// run only after the rules were frozen (their file sha256 is recorded). Both sets were seen before by the project: this is a
// regression check, never an independent validation. Every raw is verified against its pinned sha256. Writes only outside the
// repository: report.json and review sheets. The production method, the raw pictures and earlier results are unchanged.
// Usage: node tools/avatar/northstar-shape-experiment.mjs --set dev|regression|all --out <dir outside the repo> [--outfits <id,id,…>]
//   --outfits: every combination of the listed items that each method rates technically OK, with the production outfit check
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, dirname, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { encodePng, decodePng } from "./r3-hair-tool-v2.mjs";
import * as WR from "./northstar-wardrobe.mjs";
import * as BF from "./northstar-base-figure.mjs";
import * as BC from "./northstar-base-figure-c.mjs";
import * as IP from "./northstar-item-pilot.mjs";
import * as SX from "./northstar-shape-extract.mjs";
import { flat, crop, grid, down } from "./northstar-wardrobe-poc.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."), FX = join(ROOT, "tools", "avatar", "fixtures", "northstar-wardrobe");
const A = join(homedir(), "Documents", "DenSejeApp-artefacts"), { W, N } = WR, H = N / W;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const json = (f) => JSON.parse(readFileSync(f, "utf8"));
export const DEV = Object.freeze(["top-breton-longsleeve", "shoes-hightop-canvas-red", "top-waist-boxy-peach", "bottom-pleated-skirt-tartan", "shoes-desert-boots-tan"]);
const MANIFESTS = ["item-pipeline-manifest-d222.json", "item-pipeline-manifest-d228.json", "item-pipeline-manifest-d235.json"];
/** The pinned raw of every item of a set: b1's from the D-246 authorisation file (the received calls), the rest from the manifests. */
export function inputs(set) {
  const out = [];
  if (set === "dev" || set === "all") { const auth = json(join(FX, "batches", "b1-authorisation-v1.json"));
    for (const e of auth.calls) if (e.outcome === "RECEIVED_FOR_BF_CHECK" && DEV.includes(e.item)) out.push({ set: "dev", id: e.item, category: e.category, raw: "b1-batch/" + e.callId + "/b1.image-1.png", rawSha256: e.result.imageSha256 }); }
  if (set === "regression" || set === "all") { const seen = new Set();
    for (const f of MANIFESTS) { const m = json(join(FX, f)); for (const it of m.items) { if (seen.has(it.id)) continue; seen.add(it.id);
      out.push({ set: "regression", id: it.id, category: it.category, raw: (m.rawRoot && m.rawRoot !== "." ? m.rawRoot + "/" : "") + it.raw, rawSha256: it.rawSha256 }); } } }
  return out;
}
const outside = (p) => { const r = relative(ROOT, resolve(p)); return r.startsWith("..") || isAbsolute(r); };

async function main() {
  const args = process.argv.slice(2), arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const set = arg("--set"), OUT = arg("--out"); if (!["dev", "regression", "all"].includes(set)) throw new Error("--set dev|regression|all");
  if (!OUT || !outside(OUT)) throw new Error("--out must be outside the repository (the sheets show C)"); mkdirSync(OUT, { recursive: true });
  const w = WR.buildWardrobe(), base = BC.prepareBase(w, Uint8ClampedArray.from(decodePng(IP.readC()).px)), T = BC.templatesC(w, base, { revision: "d213" }), C = base.R;
  const bg = [236, 233, 226], FIGB = [250, 0, 774, 1536];
  const half = (P) => down(flat(P, bg), 262, 768, FIGB);
  const checker = (P) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0, c = ((x >> 3) + (y >> 3)) % 2 ? 205 : 245, a = P[i * 4 + 3] / 255; for (let k = 0; k < 3; k++) o[i * 4 + k] = Math.round(P[i * 4 + k] * a + c * (1 - a)); o[i * 4 + 3] = 255; } return o; };
  const unionOf = (layers) => { const u = new Uint8ClampedArray(N * 4); for (const L of Object.values(layers)) for (let i = 0; i < N; i++) if (L[i * 4 + 3]) u.set(L.subarray(i * 4, i * 4 + 4), i * 4); return u; };
  const code = { "northstar-shape-extract.mjs": sha(readFileSync(join(ROOT, "tools", "avatar", "northstar-shape-extract.mjs"))), "northstar-item-pilot.mjs": sha(readFileSync(join(ROOT, "tools", "avatar", "northstar-item-pilot.mjs"))) };
  const report = { decision: "D-250", experiment: "A (shape-based extraction)", revision: SX.SHAPE_REVISION, rules: SX.SHAPE_RULES, set, method: IP.METHOD, code, items: {}, note: "existing pictures only; dev = the five b1 cases the rules were shaped on; regression = earlier items, seen before — not an independent validation" };
  const outfitIds = (arg("--outfits") || "").split(",").filter(Boolean), kept = {};
  for (const it of inputs(set)) {
    const buf = readFileSync(join(A, ...it.raw.split("/"))); if (sha(buf) !== it.rawSha256) throw new Error(it.id + ": the raw is not its pinned picture");
    const O = Uint8ClampedArray.from(decodePng(buf).px), t = T[it.category];
    const t0 = process.hrtime.bigint(), rss0 = process.memoryUsage().rss;
    const r = SX.shapeExtract(w, base, T, it.category, O, { itemId: it.id });
    const ms = Number(process.hrtime.bigint() - t0) / 1e6, rss = process.memoryUsage().rss;
    if (!r.layers) { report.items[it.id] = { set: it.set, category: it.category, production: { ok: false, faults: r.r0.faults }, a: null, reason: r.reason }; continue; }
    const t1 = process.hrtime.bigint(); IP.processItem(w, base, T, it.category, O, { itemId: it.id }); const msProd = Number(process.hrtime.bigint() - t1) / 1e6;
    const P = unionOf(r.r0.layers), Q = unionOf(r.layers);
    // repainted fabric in the envelope (colourDist > CHANGE_TOL) the layer does NOT hold; and C-like pixels the layer DOES hold
    let lostP = 0, lostQ = 0, likeC_P = 0, likeC_Q = 0, addedLikeC = 0;
    for (let i = 441 * W; i < N; i++) { if (!t.allowed[i] || t.protect[i] || O[i * 4 + 3] < 128) continue; const d = IP.colourDist(O, i, C, i);
      if (d > IP.CHANGE_TOL) { if (!P[i * 4 + 3]) lostP++; if (!Q[i * 4 + 3]) lostQ++; }
      else { if (P[i * 4 + 3] >= 128) likeC_P++; if (Q[i * 4 + 3] >= 128) likeC_Q++; if (r.masks.added[i]) addedLikeC++; } }
    report.items[it.id] = { set: it.set, category: it.category, covering: r.covering,
      production: { ok: r.r0.ok, faults: r.r0.faults, layerPx: P.reduce((s, v, k) => s + (k % 4 === 3 && v >= 128 ? 1 : 0), 0), repaintedNotInLayerPx: lostP, cLikeInLayerPx: likeC_P, ms: Math.round(msProd) },
      a: { ok: r.ok, faults: r.faults, layerPx: Q.reduce((s, v, k) => s + (k % 4 === 3 && v >= 128 ? 1 : 0), 0), repaintedNotInLayerPx: lostQ, cLikeInLayerPx: likeC_Q, addedCLikePx: addedLikeC, ...r.stats, ms: Math.round(ms), rssMB: Math.round(rss / 1048576), rssDeltaMB: Math.round((rss - rss0) / 1048576) } };
    // the sheet: raw | production layer | A layer | marks (added green, uncertain enclosed yellow, uncertain open orange)
    const marks = new Uint8ClampedArray(flat(O, bg)); for (let i = 0; i < N; i++) { if (r.masks.added[i]) marks.set([20, 170, 70, 255], i * 4); else if (r.masks.uncertainEnclosed[i]) marks.set([235, 200, 0, 255], i * 4); else if (r.masks.uncertainOpen[i]) marks.set([255, 130, 0, 255], i * 4); }
    const g = grid([half(O), half(checker(P)), half(checker(Q)), half(marks)], 4, 10); writeFileSync(join(OUT, it.id + ".png"), encodePng(g.w, g.h, g.px));
    if (outfitIds.includes(it.id)) kept[it.id] = { category: it.category, prod: { layers: r.r0.layers, shadow: r.r0.shadow, ok: r.r0.ok, covering: r.r0.covering }, a: { layers: r.layers, shadow: r.shadow, ok: r.ok, covering: r.covering } };
    console.log(it.id, "prod", r.r0.ok ? "OK" : "rej", "A", r.ok ? "OK" : "rej", "added", r.stats.addedPx, "unc", r.stats.uncertainEnclosedPx + r.stats.uncertainOpenPx, Math.round(ms) + " ms");
  }
  // outfits (optional): every combination of the technically OK items of each method, with the production outfit check
  if (outfitIds.length) {
    const min = BF.minimumItems(base.R, base.sep.lab), res = {};
    for (const which of ["prod", "a"]) { const ok = Object.entries(kept).filter(([, k]) => k[which].ok), by = (c) => ok.filter(([, k]) => k.category === c).map(([id]) => id), o = {};
      for (const tp of by("top")) for (const bo of by("bottom")) for (const sh of by("shoes")) { const ks = [tp, bo, sh].map((id) => kept[id][which]);
        const hide = ks[2].covering === "closed-footwear" ? BC.closedFootwearHidden(base, ks[2].layers.shoes) : null;
        const Pp = BF.layerProof(w, base.R, base.Z, Object.assign({}, min, ...ks.map((k) => k.layers)), { sep: base.sep, headSeam: "d201", hide, enclosure: "c-exterior" });
        const oc = BC.outfitCheck(w, base, Pp, { revision: IP.METHODS[IP.METHOD].outfitRevision || "d223" }); o[[tp, bo, sh].join("+")] = { ok: oc.ok, failed: oc.checks.filter((c) => !c.ok).map((c) => c.id) }; }
      res[which] = { items: ok.map(([id]) => id), outfits: Object.keys(o).length, technicallyOk: Object.values(o).filter((x) => x.ok).length, detail: o }; }
    report.outfits = res; }
  writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2) + "\n");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error("REFUSED: " + e.message); process.exit(1); });
