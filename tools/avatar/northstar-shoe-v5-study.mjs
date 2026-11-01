// D-302 — the v5 field prototype on SV-1's EXISTING source (offline; no image call). D-301's result stands: SV-1 is a REJECTED SOURCE
// by the locked D-299 evaluation, and nothing here re-runs, changes or overrides it; this is development on received material, not an
// independent validation. Both shoes, the five designs, master v4 (the locked method) beside v5 (northstar-shoe-master-v5.mjs) at K:
//   fields   — per shoe, the closed fields without a hand seed and the ones v4's breadth-first labelling SPLIT between groups
//   layers   — the avatar layers (1x) of both routes x five designs (written to --out; they carry no C)
//   lines    — the locked chain measures, unchanged (chainLineCheck with v2 at K as the line-weight reference; the original colour's
//              volume against the drawing's), for v4 and for v5: a regression guard, not a new acceptance
//   changed  — the avatar pixels whose colour differs between v4 and v5 per design, and how many lie in v4's split fields
// --out must be outside the repository. Nothing here approves a shoe.
// Usage: node --expose-gc tools/avatar/northstar-shoe-v5-study.mjs --source <sv.image-1.png> --out <dir>
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng, decodePng } from "./r3-hair-tool-v2.mjs";
import * as WR from "./northstar-wardrobe.mjs";
import * as R1 from "./northstar-r1-garment.mjs";
import * as SM from "./northstar-shoe-master.mjs";
import * as SS from "./northstar-shoe-source.mjs";
import * as E2 from "./northstar-shoe-eval-v2.mjs";
import * as V5 from "./northstar-shoe-master-v5.mjs";
import { DESIGNS, VOLUME_RULE } from "./northstar-shoe-validation-evaluate.mjs";
import { perceptualMeasures } from "./northstar-shoe-master-study.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", ".."), { W, N } = WR, H = N / W;
const sha = (b) => createHash("sha256").update(b).digest("hex"), gc = () => { if (typeof globalThis.gc === "function") globalThis.gc(); };
const slug = (s) => s.split(" (")[0].replace(/[^a-z0-9]+/gi, "-").toLowerCase();
const tpl = (L) => R1.templateFromLayers({ shoes: L }, { category: "shoes", covering: "closed-footwear", cut: SM.SPEC.cut });
const volumeOf = (mc, L) => Object.fromEntries(Object.entries(perceptualMeasures(mc, L)).map(([g, v]) => [g, v.volumeL]));

/** The K route for several designs from ONE master per side (SS.renderAtK builds a master per call): { design: avatar layer }. */
export function routeAtK(img, spec, designOf, build, shift) {
  const per = {}, info = {};
  for (const side of Object.keys(SS.SIDES)) { const t0 = SS.tileOf(img, side), m = build(t0, tpl(t0), SS.specAtK(spec, side, null)); info[side] = m;
    for (const n of DESIGNS) (per[n] = per[n] || {})[side] = SM.renderShoe(m, t0, designOf(n)); }
  return { layers: Object.fromEntries(DESIGNS.map((n) => [n, SS.place(SS.downscale(SS.untile(per[n])), shift.dx, shift.dy)])), masters: info };
}

async function main() {
  const args = process.argv.slice(2), at = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), OUT = at("--out"), SRC = at("--source"), r = relative(ROOT, resolve(OUT || "."));
  if (!OUT || !(r.startsWith("..") || isAbsolute(r))) throw new Error("--out must be outside the repository"); if (!SRC) throw new Error("--source <png>");
  mkdirSync(join(OUT, "layers"), { recursive: true });
  const b = readFileSync(SRC), d = decodePng(b), img = E2.dropHalo({ w: d.header.w, h: d.header.h, px: Uint8ClampedArray.from(d.px) }, E2.HALO_RULE), small = SS.downscale(img);
  const items = JSON.parse(readFileSync(join(ROOT, "tools", "avatar", "fixtures", "northstar-wardrobe", "runtime-assets-inputs-d242.json"), "utf8")).items;
  const { loadItems } = await import("./build-northstar-runtime-assets.mjs"), ref = loadItems({ [SM.SPEC.source]: items[SM.SPEC.source] }).P[SM.SPEC.source].layers.shoes, shift = SS.register(SS.place(small), ref), placed = SS.place(small, shift.dx, shift.dy);
  const seeds1 = Object.fromEntries(Object.entries(SM.SPEC.seeds).map(([k, p]) => [k, p.map(([x, y]) => [x + shift.dx, y + shift.dy])])), mc = SM.buildShoeMaster(placed, tpl(placed), { ...SM.SPEC_V4, seeds: seeds1 });
  const designOf = (n) => (n === "original colour" ? SM.originalDesign(mc, placed) : SM.designs()[n]);
  const v2 = routeAtK(img, SM.SPEC_V2, designOf, SM.buildShoeMaster, shift).layers; gc();
  const r4 = routeAtK(img, SM.SPEC_V4, designOf, SM.buildShoeMaster, shift), fields = {}; for (const [side, m] of Object.entries(r4.masters)) { const t0 = SS.tileOf(img, side), f = V5.unseededFields(m, t0);
    fields[side] = { unseeded: f.length, split: f.filter((x) => x.split).map((x) => ({ group: x.group, pixels: x.pixels, tally: x.tally, at: x.at })) }; }
  const v4 = r4.layers; r4.masters = null; gc(); const v5 = routeAtK(img, V5.SPEC_V5, designOf, V5.buildShoeMasterV5, shift).layers; gc();
  const route = {}, lines = {};
  for (const [name, L] of [["v4", v4], ["v5", v5]]) { const c = E2.chainLineCheck(mc, placed, L["original colour"], Object.fromEntries(DESIGNS.slice(1).map((n) => [n, { variant: L[n], reference: v2[n] }])));
    const vOwn = volumeOf(mc, placed), vO = volumeOf(mc, L["original colour"]), vr = Object.fromEntries(VOLUME_RULE.fields.map((g) => [g, +(vO[g] / vOwn[g]).toFixed(3)]));
    lines[name] = { problems: c.problems, original: c.original, volumeRatio: vr, volumeOk: VOLUME_RULE.fields.every((g) => vr[g] >= VOLUME_RULE.chainMin), designs: Object.fromEntries(Object.entries(c.designs).map(([n, x]) => [n, { problems: x.problems, splitAlong: x.splitAlong, lineContrast: x.lineContrast, grain: x.grain }])) };
    for (const n of DESIGNS) { const id = name + "--" + slug(n); writeFileSync(join(OUT, "layers", id + ".png"), encodePng(W, H, L[n])); (route[n] = route[n] || {})[name] = sha(Buffer.from(L[n].buffer)); } }
  const changed = Object.fromEntries(DESIGNS.map((n) => { let px = 0, maxDiff = 0; for (let i = 0; i < N; i++) { const dd = Math.max(...[0, 1, 2, 3].map((c) => Math.abs(v4[n][i * 4 + c] - v5[n][i * 4 + c]))); if (dd > 2) px++; maxDiff = Math.max(maxDiff, dd); } return [n, { px, maxDiff }]; }));
  const out = { note: "D-302 development prototype on SV-1's existing source; D-301's REJECTED SOURCE stands; no independent validation; no shoe approved", source: { file: SRC, sha256: sha(b) }, registration: shift, revisions: { v4: SM.SPEC_V4.revision, v5: V5.SPEC_V5.revision }, fields, lines, changed, layerSha256: route };
  writeFileSync(join(OUT, "v5-study.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(JSON.stringify({ fields: Object.fromEntries(Object.entries(fields).map(([s, f]) => [s, f.split.map((x) => x.group + ":" + x.pixels)])), problems: { v4: lines.v4.problems, v5: lines.v5.problems }, volume: { v4: lines.v4.volumeRatio, v5: lines.v5.volumeRatio }, changed }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error("REFUSED: " + e.message); process.exit(1); });
