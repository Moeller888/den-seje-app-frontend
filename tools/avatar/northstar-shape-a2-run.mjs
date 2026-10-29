// D-251 EXPERIMENT A, REVISION a2 — the offline run on the 26 EXISTING pictures (no image call), in small resumable steps so no
// step holds every picture in memory: development and regression material both (D-250's sets), never an independent validation.
//   items    --out <dir> [--set dev|regression|all] [--budget-s 480]
//            per picture, sequentially: production (d240), a1 (frozen, D-250) and a2 on the same production result; the metrics;
//            the review sheet; and a cache of the production and a2 layers. A picture whose cache matches its raw and the code is
//            skipped, so a run stopped by its time budget (or by the machine) is resumed by running it again.
//   outfits  --out <dir> --group <name> --tops a,b --bottoms a,b --shoes a,b
//            every top × bottom × shoes of the group, for production and a2, from the cache only (the items of one group in
//            memory), each method only with its own technically OK items; the production outfit check (BC.outfitCheck, the
//            method's outfit revision); seam sheets (waist, wrists/hands, neck/shoulders, leg/shoe) of both methods side by side.
//            A group whose result matches the cache is reused.
//   summary  --out <dir>   merges the items and the outfit groups into summary.json.
// Writes only outside the repository (the sheets show C). The production method, the raw pictures and earlier results are
// unchanged.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, dirname, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { encodePng, decodePng } from "./r3-hair-tool-v2.mjs";
import * as WR from "./northstar-wardrobe.mjs";
import * as BF from "./northstar-base-figure.mjs";
import * as BC from "./northstar-base-figure-c.mjs";
import * as IP from "./northstar-item-pilot.mjs";
import * as SX1 from "./northstar-shape-extract.mjs";
import * as SX2 from "./northstar-shape-extract-a2.mjs";
import { inputs } from "./northstar-shape-experiment.mjs";
import { flat, crop, grid, down } from "./northstar-wardrobe-poc.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ART = join(homedir(), "Documents", "DenSejeApp-artefacts"), { W, N } = WR;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const json = (f) => JSON.parse(readFileSync(f, "utf8"));
export const outside = (p) => { const r = relative(ROOT, resolve(p)); return r.startsWith("..") || isAbsolute(r); };
const CODE = ["northstar-shape-extract-a2.mjs", "northstar-shape-extract.mjs", "northstar-item-pilot.mjs", "northstar-base-figure-c.mjs", "northstar-base-figure.mjs"];
export const codeKey = () => sha(CODE.map((f) => sha(readFileSync(join(ROOT, "tools", "avatar", f)))).join(""));
const bg = [236, 233, 226], FIGB = [250, 0, 774, 1536], half = (P) => down(flat(P, bg), 262, 768, FIGB);
const checker = (P) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0, c = ((x >> 3) + (y >> 3)) % 2 ? 205 : 245, a = P[i * 4 + 3] / 255; for (let k = 0; k < 3; k++) o[i * 4 + k] = Math.round(P[i * 4 + k] * a + c * (1 - a)); o[i * 4 + 3] = 255; } return o; };
const unionOf = (layers) => { const u = new Uint8ClampedArray(N * 4); for (const L of Object.values(layers)) for (let i = 0; i < N; i++) if (L[i * 4 + 3]) u.set(L.subarray(i * 4, i * 4 + 4), i * 4); return u; };
const SEAMS = Object.freeze({ "waist left": [340, 730, 500, 880], "waist right": [524, 730, 684, 880], "wrist/hand left": [280, 780, 420, 960], "wrist/hand right": [604, 780, 744, 960], "neck/shoulders": [380, 420, 644, 560], "leg/shoe": [330, 1290, 694, 1510] });

function prepare() { const w = WR.buildWardrobe(), base = BC.prepareBase(w, Uint8ClampedArray.from(decodePng(IP.readC()).px)), T = BC.templatesC(w, base, { revision: "d213" }); return { w, base, T }; }
const saveLayers = (dir, pre, layers) => { const names = []; for (const [k, L] of Object.entries(layers)) { writeFileSync(join(dir, pre + "-" + k + ".png"), encodePng(W, N / W, L)); names.push(k); } return names; };
const loadLayers = (dir, pre, names) => Object.fromEntries(names.map((k) => [k, Uint8ClampedArray.from(decodePng(readFileSync(join(dir, pre + "-" + k + ".png"))).px)]));

/** The evaluation of one picture: where each method's ADDED pixels lie on C, what fabric each layer holds or misses. */
export function evaluate(w, base, T, category, O, prod, a1, a2) {
  const t = T[category], C = base.R, z = SX2.frontZone(w, base, category), P = unionOf(prod.layers), Q = unionOf(a2.layers);
  const at = (m) => { const o = { hands: 0, arms: 0, baseTop: 0, baseBottom: 0, front: 0, total: 0 };
    for (let i = 0; i < N; i++) if (m[i]) { o.total++; if (z.hands[i]) o.hands++; if (z.arms[i]) o.arms++; if (z.baseTop[i]) o.baseTop++; if (z.baseBottom[i]) o.baseBottom++; if (z.front[i]) o.front++; } return o; };
  const a1Added = a1 && a1.masks ? a1.masks.added : new Uint8Array(N), removed = new Uint8Array(N); for (let i = 0; i < N; i++) if (a1Added[i] && !a2.masks.added[i]) removed[i] = 1;
  // repainted fabric (colourDist > CHANGE_TOL) in the envelope outside the front zone that a layer does NOT hold; C-like pixels it does
  let lostP = 0, lostQ = 0, likeCP = 0, likeCQ = 0, frontRepainted = 0;
  for (let i = 441 * W; i < N; i++) { if (!t.allowed[i] || t.protect[i] || O[i * 4 + 3] < 128) continue; const d = IP.colourDist(O, i, C, i);
    if (z.front[i]) { if (d > IP.CHANGE_TOL) frontRepainted++; continue; }
    if (d > IP.CHANGE_TOL) { if (!P[i * 4 + 3]) lostP++; if (!Q[i * 4 + 3]) lostQ++; } else { if (P[i * 4 + 3] >= 128) likeCP++; if (Q[i * 4 + 3] >= 128) likeCQ++; } }
  return { addedA1: at(a1Added), addedA2: at(a2.masks.added), removedFromA1: at(removed), frontRepaintedPx: frontRepainted,
    repaintedNotInLayer: { production: lostP, a2: lostQ }, cLikeInLayer: { production: likeCP, a2: likeCQ }, masks: { removed } };
}

async function items(args) {
  const OUT = args.out, budget = Number(args["budget-s"] || 480) * 1000, set = args.set || "all", key = codeKey(), start = Date.now();
  const CACHE = join(OUT, "cache"), SHEETS = join(OUT, "sheets"); mkdirSync(CACHE, { recursive: true }); mkdirSync(SHEETS, { recursive: true });
  let env = null, done = 0, skipped = 0;
  for (const it of inputs(set)) {
    const dir = join(CACHE, it.id), metaF = join(dir, "meta.json");
    if (existsSync(metaF)) { const m = json(metaF); if (m.rawSha256 === it.rawSha256 && m.codeKey === key) { skipped++; continue; } }
    if (Date.now() - start > budget) { console.log("BUDGET reached — run again to resume"); break; }
    const buf = readFileSync(join(ART, ...it.raw.split("/"))); if (sha(buf) !== it.rawSha256) throw new Error(it.id + ": the raw is not its pinned picture");
    if (!env) env = prepare(); const { w, base, T } = env, O = Uint8ClampedArray.from(decodePng(buf).px);
    const rss0 = process.memoryUsage().rss, t0 = process.hrtime.bigint();
    const prod = IP.processItem(w, base, T, it.category, O, { itemId: it.id }); const t1 = process.hrtime.bigint();
    const a2 = SX2.shapeExtract(w, base, T, it.category, O, { itemId: it.id, r0: prod }); const t2 = process.hrtime.bigint();
    const a1 = SX1.shapeExtract(w, base, T, it.category, O, { itemId: it.id }); const t3 = process.hrtime.bigint();
    const ms = (a, b) => Math.round(Number(b - a) / 1e6), rss = Math.round(process.memoryUsage().rss / 1048576);
    mkdirSync(dir, { recursive: true });
    if (!a2.layers) { writeFileSync(metaF, JSON.stringify({ id: it.id, set: it.set, category: it.category, rawSha256: it.rawSha256, codeKey: key, production: { ok: false, faults: prod.faults }, a2: null }, null, 2) + "\n"); done++; continue; }
    const ev = evaluate(w, base, T, it.category, O, prod, a1, a2);
    const meta = { id: it.id, set: it.set, category: it.category, rawSha256: it.rawSha256, codeKey: key,
      production: { ok: prod.ok, faults: prod.faults, covering: prod.covering || "none", layers: saveLayers(dir, "prod", prod.layers), shadow: prod.shadow ? (writeFileSync(join(dir, "shadow.png"), encodePng(W, N / W, prod.shadow)), true) : false, ms: ms(t0, t1) },
      a1: a1.layers ? { ok: a1.ok, faults: a1.faults, stats: a1.stats, msWithProduction: ms(t2, t3) } : null,
      a2: { ok: a2.ok, faults: a2.faults, stats: a2.stats, covering: a2.covering, layers: saveLayers(dir, "a2", a2.layers), msBeyondProduction: ms(t1, t2) },
      evaluation: { ...ev, masks: undefined }, rssMB: rss, rssDeltaMB: rss - Math.round(rss0 / 1048576) };
    writeFileSync(metaF, JSON.stringify(meta, null, 2) + "\n");
    // the sheet: raw | production | a2 | map — a2 added green; a1 added that a2 rejects red (in the front zone) or magenta (outside
    // it); uncertain enclosed yellow, closed by lines alone cyan, open orange; the front zone tinted blue
    const mk = new Uint8ClampedArray(flat(O, bg)), F = a2.masks.front;
    for (let i = 0; i < N; i++) { const c = a2.masks.added[i] ? [20, 170, 70] : ev.masks.removed[i] ? (F[i] ? [220, 0, 0] : [200, 0, 200]) : a2.masks.uncertainEnclosed[i] ? [235, 200, 0] : a2.masks.uncertainLinesAlone[i] ? [0, 190, 220] : a2.masks.uncertainOpen[i] ? [255, 130, 0] : null;
      if (c) mk.set([...c, 255], i * 4); else if (F[i]) for (let k = 0; k < 3; k++) mk[i * 4 + k] = Math.round(mk[i * 4 + k] * 0.6 + [60, 110, 255][k] * 0.4); }
    const g = grid([half(O), half(checker(unionOf(prod.layers))), half(checker(unionOf(a2.layers))), half(mk)], 4, 10); writeFileSync(join(SHEETS, it.id + ".png"), encodePng(g.w, g.h, g.px));
    // the same map at full scale over the category's close-ups (hands, waist, shoulders, shoes)
    const z2 = grid(Object.values(SEAMS).map((b) => crop(mk, b, 2)), 3); writeFileSync(join(SHEETS, it.id + ".map-x2.png"), encodePng(z2.w, z2.h, z2.px));
    console.log(it.id, "prod", prod.ok ? "OK" : "rej", "a1", a1.ok ? "OK" : "rej", "a2", a2.ok ? "OK" : "rej", "added a1/a2", ev.addedA1.total + "/" + ev.addedA2.total, "front a1/a2", ev.addedA1.front + "/" + ev.addedA2.front, ms(t0, t3) + " ms", rss + " MB");
    done++; }
  console.log("items: processed", done, "reused", skipped, "in", Math.round((Date.now() - start) / 1000) + " s");
}

async function outfits(args) {
  const OUT = args.out, group = args.group, list = (k) => (args[k] || "").split(",").filter(Boolean), key = codeKey();
  if (!group || !/^[a-z0-9-]+$/.test(group)) throw new Error("--group <name>");
  const ids = { top: list("tops"), bottom: list("bottoms"), shoes: list("shoes") }, all = [...ids.top, ...ids.bottom, ...ids.shoes];
  const metas = Object.fromEntries(all.map((id) => { const f = join(OUT, "cache", id, "meta.json"); if (!existsSync(f)) throw new Error(id + ": not in the cache — run items first"); return [id, json(f)]; }));
  for (const [id, m] of Object.entries(metas)) if (m.codeKey !== key) throw new Error(id + ": cached with other code — run items again");
  const GD = join(OUT, "outfits"); mkdirSync(GD, { recursive: true }); const resF = join(GD, group + ".json");
  const sig = sha(JSON.stringify([key, ids, all.map((id) => metas[id].rawSha256)]));
  if (existsSync(resF) && json(resF).signature === sig) { console.log("group", group, "reused"); return; }
  const { w, base } = prepare(), min = BF.minimumItems(base.R, base.sep.lab), rev = IP.METHODS[IP.METHOD].outfitRevision || "d223", t0 = Date.now();
  const lay = {}; for (const id of all) { const m = metas[id], dir = join(OUT, "cache", id);
    lay[id] = { prod: m.production.ok ? { layers: loadLayers(dir, "prod", m.production.layers), covering: m.production.covering, shadow: m.production.shadow ? Uint8ClampedArray.from(decodePng(readFileSync(join(dir, "shadow.png"))).px) : null } : null,
      a2: m.a2 && m.a2.ok ? { layers: loadLayers(dir, "a2", m.a2.layers), covering: m.a2.covering, shadow: m.production.shadow ? Uint8ClampedArray.from(decodePng(readFileSync(join(dir, "shadow.png"))).px) : null } : null }; }
  const res = { decision: "D-251", group, signature: sig, outfitRevision: rev, ids, combos: {} }, SD = join(GD, group); mkdirSync(SD, { recursive: true });
  for (const tp of ids.top) for (const bo of ids.bottom) for (const sh of ids.shoes) { const name = [tp, bo, sh].join("+"), row = {}, crops = [];
    for (const which of ["prod", "a2"]) { const ks = [tp, bo, sh].map((id) => lay[id][which]); if (ks.some((k) => !k)) { row[which] = { status: "item-not-ok" }; crops.push(null); continue; }
      const hide = ks[2].covering === "closed-footwear" ? BC.closedFootwearHidden(base, ks[2].layers.shoes) : null;
      const P = BF.layerProof(w, base.R, base.Z, Object.assign({}, min, ...ks.map((k) => k.layers)), { sep: base.sep, headSeam: "d201", hide, enclosure: "c-exterior" });
      const oc = BC.outfitCheck(w, base, P, { revision: rev }); row[which] = { ok: oc.ok, failed: oc.checks.filter((c) => !c.ok).map((c) => ({ id: c.id, value: c.value })) };
      let comp = P.dressedRuntime; for (const k of ks) if (k.shadow) comp = IP.applyShadow(comp, P.stack, k.shadow);
      crops.push(Object.values(SEAMS).map((b) => crop(flat(comp, bg), b, 2))); }
    res.combos[name] = row;
    const tiles = []; for (const c of crops) if (c) tiles.push(...c); if (tiles.length) { const g = grid(tiles, Object.keys(SEAMS).length); writeFileSync(join(SD, name + ".seams-x2.png"), encodePng(g.w, g.h, g.px)); }
    console.log(name, "prod", row.prod.status || (row.prod.ok ? "OK" : "rej"), "a2", row.a2.status || (row.a2.ok ? "OK" : "rej")); }
  res.ms = Date.now() - t0; res.rssMB = Math.round(process.memoryUsage().rss / 1048576);
  writeFileSync(resF, JSON.stringify(res, null, 2) + "\n"); console.log("group", group, Object.keys(res.combos).length, "combos in", Math.round(res.ms / 1000) + " s,", res.rssMB + " MB");
}

function summary(args) {
  const OUT = args.out, C = join(OUT, "cache"), G = join(OUT, "outfits");
  const it = existsSync(C) ? Object.fromEntries(readdirSync(C).filter((d) => existsSync(join(C, d, "meta.json"))).map((d) => [d, json(join(C, d, "meta.json"))])) : {};
  const gr = existsSync(G) ? Object.fromEntries(readdirSync(G).filter((f) => f.endsWith(".json")).map((f) => [f.slice(0, -5), json(join(G, f))])) : {};
  const out = { decision: "D-251", revision: SX2.SHAPE_REVISION, rules: SX2.SHAPE_RULES, method: IP.METHOD, codeKey: codeKey(), items: it, outfits: gr, note: "26 existing pictures, development and regression material — not an independent validation" };
  writeFileSync(join(OUT, "summary.json"), JSON.stringify(out, null, 2) + "\n"); console.log("summary:", Object.keys(it).length, "items,", Object.keys(gr).length, "outfit groups");
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2), args = {}; for (let i = 0; i < rest.length; i++) if (rest[i].startsWith("--")) args[rest[i].slice(2)] = rest[i + 1] && !rest[i + 1].startsWith("--") ? rest[++i] : true;
  if (!args.out || !outside(args.out)) throw new Error("--out must be outside the repository (the sheets show C)");
  if (cmd === "items") return items(args); if (cmd === "outfits") return outfits(args); if (cmd === "summary") return summary(args);
  throw new Error("command: items | outfits | summary");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error("REFUSED: " + e.message); process.exit(1); });
