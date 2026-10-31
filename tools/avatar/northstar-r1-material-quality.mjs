// D-262 — a local QUALITY REFERENCE for r1-m1 (no image call): clean, controlled material laid on C's tee-hip cut, to separate the
// quality of the laying-on from faults in source pictures (D-260's ghost pocket, baked pleats, mirror axis). Plain fabric comes from
// APPROVED material (the K set's cream and blue tees, the owner's prototype look; D-242); stripes and tartan are SYNTHETIC, seamless
// samples drawn here and marked as such — never generated results, never a validation. No pocket: no approved matching detail
// exists. Also: the swatch checks (seam, flatness, details) on the clean swatches and on D-260's faulty ones; stripes and tartan
// laid with wrap and with mirror tiling; the K-partner outfits for the patterns (COMBO-2's pattern sensitivity, D-253).
// Usage: node tools/avatar/northstar-r1-material-quality.mjs --out <dir outside the repo>
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
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
import { fromR1C, fromItem } from "./northstar-r1-material-study.mjs";
import { PARTNERS } from "./northstar-r1-proof.mjs";
import { inputs } from "./northstar-shape-experiment.mjs";
import { flat, crop, grid, down } from "./northstar-wardrobe-poc.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const ART = join(homedir(), "Documents", "DenSejeApp-artefacts"), { W, N } = WR;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const bg = [236, 233, 226], FIGB = [250, 0, 774, 1536];
const tile = (n, f) => { const px = new Uint8ClampedArray(n * n * 4); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) px.set([...f(x, y), 255], (y * n + x) * 4); return { w: n, h: n, px }; };
/** SYNTHETIC seamless samples (period divides the size): navy/off-white stripes (8 + 8 px); a tartan sett on a green ground. */
export const SYNTHETIC = Object.freeze({
  stripes: () => tile(128, (x, y) => (Math.floor(y / 8) % 2 ? [244, 240, 230] : [34, 46, 108])),
  plain: (rgb) => tile(64, () => rgb),
  tartan: () => tile(128, (x, y) => { const px = x % 64, py = y % 64, band = (v) => v >= 20 && v < 44, line = (v) => v === 6 || v === 7 || v === 56 || v === 57;
    let c = [38, 96, 62]; const bx = band(px), by = band(py); if (bx && by) c = [22, 32, 70]; else if (bx || by) c = [30, 50, 92];
    if (line(px) || line(py)) c = c.map((v, k) => Math.round(v * 0.45 + [190, 50, 44][k] * 0.55)); return c; }),
});

async function main() {
  const args = process.argv.slice(2), OUT = args[args.indexOf("--out") + 1], r = relative(ROOT, resolve(OUT || "."));
  if (!OUT || !(r.startsWith("..") || isAbsolute(r))) throw new Error("--out must be outside the repository (the sheets show C)");
  mkdirSync(OUT, { recursive: true }); const t0 = Date.now();
  const w = WR.buildWardrobe(), base = BC.prepareBase(w, Uint8ClampedArray.from(decodePng(IP.readC()).px)), T = BC.templatesC(w, base, { revision: "d213" }), env = { w, base, T };
  const { t, src, cl } = RC.cutOf(env);
  // swatches: approved plain fabric (the K set) and synthetic seamless patterns; D-260's faulty ones for the checks only
  const cream = M1.flatten(fromItem(env, "top-tee-hip-cream", "topBody")), blue = M1.flatten(fromItem(env, "top-tee-hip-blue", "topBody")), stripes = SYNTHETIC.stripes(), tartan = SYNTHETIC.tartan();
  const rcDir = join(ART, "r1c-calls", "R1C-1-top-tee-hip-apricot-bleed"), rec = JSON.parse(readFileSync(join(rcDir, "r1c.record.json"), "utf8")), rbuf = readFileSync(join(rcDir, "r1c.image-1.png"));
  if (sha(rbuf) !== rec.imageSha256) throw new Error("R1C-1's picture is not D-259's");
  const d260apricot = fromR1C(Uint8ClampedArray.from(decodePng(rbuf).px)).body, d260tartan = fromItem(env, "bottom-pleated-skirt-tartan", "pants");
  const swatches = { "approved cream (K set)": cream, "approved blue (K set)": blue, "SYNTHETIC stripes": stripes, "SYNTHETIC tartan": tartan, "D-260 apricot (contains R1C-1's pocket)": d260apricot, "D-260 tartan (skirt, pleats)": d260tartan };
  const checks = Object.fromEntries(Object.entries(swatches).map(([k, s]) => [k, M1.swatchChecks(s)]));
  for (const [k, c] of Object.entries(checks)) console.log("swatch", k, JSON.stringify({ seam: c.seam, broad: c.broadLuminance, details: c.details, boxes: c.detailBoxes, seamless: c.seamless, flat: c.flat, noDetails: c.noDetails }));
  // the approved fabric's own median colour as a SYNTHETIC flat swatch (the approved crops carry the item's painted fold strokes)
  const med = (s) => [0, 1, 2].map((k) => { const v = []; for (let i = 0; i < s.w * s.h; i++) v.push(s.px[i * 4 + k]); v.sort((a, b) => a - b); return v[v.length >> 1]; });
  const plainCream = SYNTHETIC.plain(med(cream)); swatches["SYNTHETIC plain (approved cream colour)"] = plainCream;
  const designs = { "approved cream (K set)": { body: cream, scale: 1, tiling: "wrap" }, "approved blue (K set)": { body: blue, scale: 1, tiling: "wrap" },
    "SYNTHETIC plain cream, soft shade": { body: plainCream, scale: 1, tiling: "wrap" }, "SYNTHETIC plain cream, crisp shade": { body: plainCream, scale: 1, tiling: "wrap", shade: "crisp" },
    "SYNTHETIC stripes, crisp shade": { body: stripes, scale: 1, tiling: "wrap", shade: "crisp" }, "SYNTHETIC tartan, crisp shade": { body: tartan, scale: 1, tiling: "wrap", shade: "crisp" },
    "SYNTHETIC plain cream, ratio shade": { body: plainCream, scale: 1, tiling: "wrap", shade: "ratio", src }, "SYNTHETIC plain blue, ratio shade": { body: SYNTHETIC.plain(med(blue)), scale: 1, tiling: "wrap", shade: "ratio", src },
    "SYNTHETIC stripes, ratio shade": { body: stripes, scale: 1, tiling: "wrap", shade: "ratio", src }, "SYNTHETIC tartan, ratio shade": { body: tartan, scale: 1, tiling: "wrap", shade: "ratio", src },
    "SYNTHETIC stripes, wrap": { body: stripes, scale: 1, tiling: "wrap" }, "SYNTHETIC tartan, wrap": { body: tartan, scale: 1, tiling: "wrap" }, "SYNTHETIC tartan, mirror": { body: tartan, scale: 1, tiling: "mirror" } };
  const min = BF.minimumItems(base.R, base.sep.lab), dressed = (layers) => BF.layerProof(w, base.R, base.Z, { ...min, ...layers }, { sep: base.sep, headSeam: "d201", enclosure: "c-exterior" }).dressedRuntime;
  const memo = new Map(), itemOf = (id) => { if (memo.has(id)) return memo.get(id); const it = inputs("all").find((x) => x.id === id), b = readFileSync(join(ART, ...it.raw.split("/")));
    const r0 = IP.processItem(w, base, T, it.category, Uint8ClampedArray.from(decodePng(b).px), { itemId: id }); const v = { category: it.category, layers: r0.layers, covering: r0.covering || "none" }; memo.set(id, v); return v; };
  const tplOutfits = {}; for (const bo of PARTNERS.bottom) for (const sh of PARTNERS.shoes) { const o = R1.checkOutfit(w, base, [src, itemOf(bo), itemOf(sh)]); tplOutfits[bo + "+" + sh] = { ok: o.ok, failed: o.failed }; }
  const report = { decision: "D-262", note: "plain fabric from approved K-set material; stripes and tartan SYNTHETIC; laying-on quality only; not generated, not a validation", swatchChecks: checks, designs: {} };
  const tplOn = dressed(src.layers), figs = [down(flat(tplOn, bg), 262, 768, FIGB)], torsos = [crop(flat(tplOn, bg), [360, 420, 664, 860], 2)], close = [], apps = [down(flat(tplOn, bg), 110, 165), down(flat(tplOn, bg), 52, 78)];
  const boxes = { neck: [400, 440, 624, 540], "sleeve+armpit": [300, 540, 480, 720], hem: [380, 760, 644, 860] };
  for (const b of Object.values(boxes)) close.push(crop(flat(tplOn, bg), b, 3));
  for (const [name, d] of Object.entries(designs)) { const L = M1.lay(t, cl, base, d), item = { category: "top", layers: L.layers, covering: t.covering, shadow: t.shadow }, fit = R1.checkItem(w, base, T, t, L.layers);
    let holes = 0; for (let i = 0; i < N; i++) if (t.core[i] && L.material[i * 4 + 3] < 128) holes++;
    const outfits = {}; if (/^SYNTHETIC (stripes|tartan), (wrap|ratio shade)$/.test(name)) for (const bo of PARTNERS.bottom) for (const sh of PARTNERS.shoes) { const n = R1.checkOutfit(w, base, [item, itemOf(bo), itemOf(sh)]), o = tplOutfits[bo + "+" + sh];
      outfits[bo + "+" + sh] = { ok: n.ok, failed: n.failed, template: o, same: n.ok === o.ok && n.failed.join() === o.failed.join(), combo2OnPattern: n.failed.includes("COMBO-2-DOUBLE-CONTOUR") && !o.failed.includes("COMBO-2-DOUBLE-CONTOUR") }; }
    const ov = Object.values(outfits); report.designs[name] = { holes, fit: { ok: fit.ok, failed: fit.failed }, outfits: ov.length ? { same: ov.filter((v) => v.same).length + "/" + ov.length, ok: ov.filter((v) => v.ok).length + "/" + ov.length, combo2OnPattern: ov.filter((v) => v.combo2OnPattern).length, detail: outfits } : "not run (the geometry is D-260's; outfits run for the wrap and ratio-shade pattern variants only)" };
    const onC = dressed(L.layers); figs.push(down(flat(onC, bg), 262, 768, FIGB)); torsos.push(crop(flat(onC, bg), [360, 420, 664, 860], 2)); for (const b of Object.values(boxes)) close.push(crop(flat(onC, bg), b, 3)); apps.push(down(flat(onC, bg), 110, 165), down(flat(onC, bg), 52, 78));
    console.log(name, "holes", holes, "fit", fit.ok ? "OK" : fit.failed.join(","), "outfits", JSON.stringify(report.designs[name].outfits.same ? { same: report.designs[name].outfits.same, ok: report.designs[name].outfits.ok, combo2: report.designs[name].outfits.combo2OnPattern } : "-")); }
  const save = (n, g) => writeFileSync(join(OUT, n), encodePng(g.w, g.h, g.px));
  save("q-figures.png", grid(figs, figs.length, 10)); save("q-torsos-x2.png", grid(torsos, 4, 8)); save("q-closeups-x3.png", grid(close, 3, 6)); save("q-app.png", grid(apps, 12, 6));
  const big = (s, k) => { const o = new Uint8ClampedArray(s.w * k * s.h * k * 4); for (let y = 0; y < s.h * k; y++) for (let x = 0; x < s.w * k; x++) o.set(s.px.subarray(((y / k | 0) * s.w + (x / k | 0)) * 4, ((y / k | 0) * s.w + (x / k | 0)) * 4 + 4), (y * s.w * k + x) * 4); return { w: s.w * k, h: s.h * k, px: o }; };
  save("q-swatches.png", grid(Object.values(swatches).map((s) => big(s, Math.max(1, Math.floor(192 / s.w)))), 6, 10));
  report.ms = Date.now() - t0; writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2) + "\n");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error("REFUSED: " + e.message); process.exit(1); });
