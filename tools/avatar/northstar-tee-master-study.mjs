// D-264 — the study of the tee-hip master (northstar-tee-master.mjs; no image call). ONE master (the same per-cut data) renders five
// designs from clean material: plain cream and plain blue (the approved K-set colours, D-242), SYNTHETIC seamless stripes and tartan
// (D-262's samples) and a SYNTHETIC chest print at the fixed anchor — all marked synthetic where they are. Beside each: the original
// cut item (cream) and D-262's laying-on of the same material. Checks: holes, fitCheck, the K-partner outfits for the patterns.
// Sheets for the visual review; the geometric checks are not evidence of visual quality.
// Usage: node tools/avatar/northstar-tee-master-study.mjs --out <dir outside the repo>
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { encodePng, decodePng } from "./r3-hair-tool-v2.mjs";
import * as WR from "./northstar-wardrobe.mjs";
import * as BF from "./northstar-base-figure.mjs";
import * as BC from "./northstar-base-figure-c.mjs";
import * as IP from "./northstar-item-pilot.mjs";
import * as R1 from "./northstar-r1-garment.mjs";
import * as RC from "./northstar-r1c-evaluate.mjs";
import * as M1 from "./northstar-r1-material.mjs";
import * as TM from "./northstar-tee-master.mjs";
import { SYNTHETIC } from "./northstar-r1-material-quality.mjs";
import { fromItem } from "./northstar-r1-material-study.mjs";
import { PARTNERS } from "./northstar-r1-proof.mjs";
import { inputs } from "./northstar-shape-experiment.mjs";
import { flat, crop, grid, down } from "./northstar-wardrobe-poc.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const ART = join(homedir(), "Documents", "DenSejeApp-artefacts"), { W, N } = WR;
const bg = [236, 233, 226], FIGB = [250, 0, 774, 1536];
/** A SYNTHETIC chest print (drawn here): a navy disc with an off-white five-point star and an orange ring. */
export function syntheticPrint(n = 96) { const px = new Uint8ClampedArray(n * n * 4), c = n / 2, star = (x, y) => { const a = Math.atan2(y - c, x - c), r = Math.hypot(x - c, y - c), k = (a + Math.PI / 2 + 4 * Math.PI) % (2 * Math.PI / 5), t = Math.abs(k - Math.PI / 5) / (Math.PI / 5); return r < n * (0.16 + 0.17 * t); };
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const r = Math.hypot(x - c + 0.5, y - c + 0.5); let col = null; if (r < n * 0.48) col = [214, 112, 48]; if (r < n * 0.43) col = [30, 42, 96]; if (r < n * 0.43 && star(x + 0.5, y + 0.5)) col = [246, 240, 228]; if (col) px.set([...col, 255], (y * n + x) * 4); }
  return { w: n, h: n, px }; }

async function main() {
  const args = process.argv.slice(2), OUT = args[args.indexOf("--out") + 1], r = relative(ROOT, resolve(OUT || "."));
  if (!OUT || !(r.startsWith("..") || isAbsolute(r))) throw new Error("--out must be outside the repository (the sheets show C)");
  mkdirSync(OUT, { recursive: true }); const t0 = Date.now();
  const w = WR.buildWardrobe(), base = BC.prepareBase(w, Uint8ClampedArray.from(decodePng(IP.readC()).px)), T = BC.templatesC(w, base, { revision: "d213" }), env = { w, base, T };
  const { t, src, cl } = RC.cutOf(env), tm0 = Date.now(), master = TM.buildMaster(t, src), buildMs = Date.now() - tm0;
  const med = (s) => [0, 1, 2].map((k) => { const v = []; for (let i = 0; i < s.w * s.h; i++) v.push(s.px[i * 4 + k]); v.sort((a, b) => a - b); return v[v.length >> 1]; });
  const cream = med(M1.flatten(fromItem(env, "top-tee-hip-cream", "topBody"))), blue = med(M1.flatten(fromItem(env, "top-tee-hip-blue", "topBody"))), stripes = SYNTHETIC.stripes(), tartan = SYNTHETIC.tartan(), print = syntheticPrint();
  const designs = { "1 plain cream (approved K colour)": { body: cream }, "2 plain blue (approved K colour)": { body: blue }, "3 SYNTHETIC stripes": { body: stripes }, "4 SYNTHETIC tartan": { body: tartan }, "5 SYNTHETIC chest print on cream": { body: cream, print: { img: print, anchor: "chest-left" } } };
  const tile = (n, c) => ({ w: n, h: n, px: (() => { const p = new Uint8ClampedArray(n * n * 4); for (let i = 0; i < n * n; i++) p.set([...c, 255], i * 4); return p; })() });
  const d262 = (d) => M1.lay(t, cl, base, { body: Array.isArray(d.body) ? tile(16, d.body) : d.body, scale: 1, tiling: "wrap", shade: "ratio", src, details: d.print ? [{ img: d.print.img, anchor: "chest-left" }] : [] }).layers;
  const min = BF.minimumItems(base.R, base.sep.lab), dressed = (layers) => BF.layerProof(w, base.R, base.Z, { ...min, ...layers }, { sep: base.sep, headSeam: "d201", enclosure: "c-exterior" }).dressedRuntime;
  const memo = new Map(), itemOf = (id) => { if (memo.has(id)) return memo.get(id); const it = inputs("all").find((x) => x.id === id), b = readFileSync(join(ART, ...it.raw.split("/")));
    const r0 = IP.processItem(w, base, T, it.category, Uint8ClampedArray.from(decodePng(b).px), { itemId: id }); const v = { category: it.category, layers: r0.layers, covering: r0.covering || "none" }; memo.set(id, v); return v; };
  const report = { decision: "D-264", master: { revision: TM.REVISION, spec: TM.SPEC, panelPx: master.sizes, seamPx: { left: master.seams.left.length, right: master.seams.right.length }, base: master.base, buildMs }, designs: {} };
  const tplOn = dressed(src.layers), save = (n, g) => writeFileSync(join(OUT, n), encodePng(g.w, g.h, g.px));
  // the panel map over the cut item: body grey, sleeves tinted, seams red, C's arm mask hatched blue
  const pm = new Uint8ClampedArray(flat(tplOn, bg)); for (let i = 0; i < N; i++) { const p = master.panel[i]; if (p === 1 || p === 2) for (let k = 0; k < 3; k++) pm[i * 4 + k] = Math.round(pm[i * 4 + k] * 0.55 + (p === 1 ? [40, 200, 90] : [60, 120, 230])[k] * 0.45); if (t.core[i] && base.arms[i * 4 + 3] >= 128 && ((i % W) + ((i / W) | 0)) % 6 === 0) pm.set([0, 0, 200, 255], i * 4); }
  for (const line of Object.values(master.seams)) for (const [x, y] of line) pm.set([230, 0, 0, 255], (y * W + x) * 4);
  save("tm-panels-x2.png", grid([crop(pm, [300, 430, 724, 860], 2)], 1, 0));
  const torsos = [crop(flat(tplOn, bg), [360, 420, 664, 860], 2)], figs = [down(flat(tplOn, bg), 262, 768, FIGB)], close = [], apps = [down(flat(tplOn, bg), 110, 165), down(flat(tplOn, bg), 52, 78)];
  const boxes = { neck: [400, 440, 624, 540], "armhole left": [330, 480, 470, 660], "armhole right": [554, 480, 694, 660], "cuff left": [300, 600, 420, 690], hem: [380, 760, 644, 860], "chest print": [480, 520, 640, 640] };
  for (const [name, d] of Object.entries(designs)) {
    const Lm = TM.render(master, t, base, cl.band, d), Ld = d262(d), fit = R1.checkItem(w, base, T, t, Lm.layers);
    let holes = 0; for (let i = 0; i < N; i++) if (t.core[i] && Lm.layer[i * 4 + 3] < 128) holes++;
    const outfits = {}; if (/stripes|tartan/.test(name)) { const item = { category: "top", layers: Lm.layers, covering: t.covering, shadow: t.shadow };
      for (const bo of PARTNERS.bottom) for (const sh of PARTNERS.shoes) { const n = R1.checkOutfit(w, base, [item, itemOf(bo), itemOf(sh)]), o = R1.checkOutfit(w, base, [src, itemOf(bo), itemOf(sh)]); outfits[bo + "+" + sh] = { ok: n.ok, failed: n.failed, same: n.ok === o.ok && n.failed.join() === o.failed.join() }; } }
    const ov = Object.values(outfits); report.designs[name] = { holes, fit: { ok: fit.ok, failed: fit.failed }, print: Lm.placed, outfits: ov.length ? { same: ov.filter((v) => v.same).length + "/" + ov.length, ok: ov.filter((v) => v.ok).length + "/" + ov.length, detail: outfits } : "not run (plain fabric or print: the silhouette is the cut's)" };
    const onM = dressed(Lm.layers), onD = dressed(Ld);
    figs.push(down(flat(onD, bg), 262, 768, FIGB), down(flat(onM, bg), 262, 768, FIGB)); torsos.push(crop(flat(onD, bg), [360, 420, 664, 860], 2), crop(flat(onM, bg), [360, 420, 664, 860], 2));
    for (const b of Object.values(boxes)) close.push(crop(flat(onM, bg), b, 3)); apps.push(down(flat(onM, bg), 110, 165), down(flat(onM, bg), 52, 78));
    console.log(name, "holes", holes, "fit", fit.ok ? "OK" : fit.failed.join(","), "outfits", ov.length ? report.designs[name].outfits.same : "-", "print", JSON.stringify(Lm.placed)); }
  save("tm-figures.png", grid(figs, figs.length, 8)); save("tm-torsos-x2.png", grid(torsos, 3, 8)); save("tm-closeups-x3.png", grid(close, 6, 6)); save("tm-app.png", grid(apps, 12, 6));
  report.ms = Date.now() - t0; writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2) + "\n");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error("REFUSED: " + e.message); process.exit(1); });
