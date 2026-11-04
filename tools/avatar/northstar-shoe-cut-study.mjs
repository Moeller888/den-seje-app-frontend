// D-318 — the shoe cut kit tried offline on the two existing cuts (no image call; nothing published; no runtime change). Each phase is its
// own process (memory) and writes to --out (outside the repository; the views show C).
//   reproduce — the SNEAKER contract through the kit: SV-1's source → halo rule → registration → master v5 at K → the four approved
//               designs must equal the locked D-304 layers (sv1-v5-candidates-v1.json) byte for byte, and the kit's covering of each
//               must equal the published hide-…-v1.webp mask pixel for pixel.
//   opening   — openingCheck on real layers with C: the two reference items, SV-1 as placed, the four approved SV1-V5 layers, and
//               NEGATIVES made from real layers (a hole punched in the material, a patch of material on the shin, a notch cut below the
//               opening's floor, the shoe moved 4 px up); and the locked collarCheck (D-297) beside it on the sneaker cases (history).
//   rehearse  — the ANKLE-BOOT contract on its existing (published, dark) source at 1x through master v5: the source's quality, the
//               fields found, three designs (original colour, a light and a contrast variant — synthetic colours, no per-design retouch),
//               R1.checkOutfit with the cream tee over the six bottoms, openingCheck, composites; timings.
// Usage: node --expose-gc tools/avatar/northstar-shoe-cut-study.mjs --out <dir> --phase reproduce|opening|rehearse --dwebp <dwebp.exe> [--source <SV-1 png>] [--package <D-304 dir>]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng, decodePng } from "./r3-hair-tool-v2.mjs";
import * as WR from "./northstar-wardrobe.mjs";
import * as BC from "./northstar-base-figure-c.mjs";
import * as IP from "./northstar-item-pilot.mjs";
import * as R1 from "./northstar-r1-garment.mjs";
import * as SM from "./northstar-shoe-master.mjs";
import * as E2 from "./northstar-shoe-eval-v2.mjs";
import * as V5 from "./northstar-shoe-master-v5.mjs";
import * as KIT from "./northstar-shoe-cut-kit.mjs";
import { loadItems } from "./build-northstar-runtime-assets.mjs";
import { flat, crop, grid } from "./northstar-wardrobe-poc.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", ".."), { W, N } = WR, H = N / W, DIR = join(ROOT, "assets", "avatar-northstar");
const sha = (b) => createHash("sha256").update(b).digest("hex"), gc = () => { if (typeof globalThis.gc === "function") globalThis.gc(); }, LIGHT = [236, 233, 226], DARK = [24, 26, 40];
const save = (f, im) => writeFileSync(f, encodePng(im.w, im.h, im.px));
/** The ankle boot's rehearsal designs: SYNTHETIC colours per field (no retouch, the same rule for every design). */
export const BOOT_DESIGNS = Object.freeze({ "light sand suede (SYNTHETIC)": { upper: [214, 190, 150], sole: [238, 232, 220] }, "contrast black + gum (SYNTHETIC)": { upper: [40, 40, 44], sole: [176, 124, 72] } });

async function main() {
  const args = process.argv.slice(2), at = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), OUT = at("--out"), phase = at("--phase"), DW = at("--dwebp"), r = relative(ROOT, resolve(OUT || "."));
  if (!OUT || !(r.startsWith("..") || isAbsolute(r))) throw new Error("--out must be outside the repository (the views show C)"); if (!DW) throw new Error("--dwebp"); mkdirSync(OUT, { recursive: true });
  const dec = (f) => { const o = join(OUT, "tmp-decode.png"); execFileSync(DW, ["-quiet", join(DIR, f), "-o", o]); return Uint8ClampedArray.from(decodePng(readFileSync(o)).px); };
  const t0 = Date.now(), done = (o) => { o.seconds = +((Date.now() - t0) / 1000).toFixed(1); writeFileSync(join(OUT, phase + ".json"), JSON.stringify(o, null, 2) + "\n"); console.log(JSON.stringify(o).slice(0, 1500)); };
  if (phase === "reproduce") {
    const cut = KIT.loadCut("sneaker-low"), b = readFileSync(at("--source")), d = decodePng(b), img = E2.dropHalo({ w: d.header.w, h: d.header.h, px: Uint8ClampedArray.from(d.px) }, E2.HALO_RULE), ref = dec("shoes-sneakers-beige-shoes-v1.webp");
    const small = KIT.downscale(img, cut), shift = KIT.register(KIT.place(small, cut), ref, cut), M = JSON.parse(readFileSync(join(ROOT, "tools/avatar/fixtures/northstar-wardrobe/shoe-source/sv1-v5-candidates-v1.json"), "utf8"));
    const designs = Object.fromEntries(Object.entries(M.candidates).map(([id, c]) => [id, c.colours])), layers = KIT.renderAtK(img, cut, V5.SPEC_V5, V5.buildShoeMasterV5, designs, shift); gc();
    const w = WR.buildWardrobe(), base = BC.prepareBase(w, Uint8ClampedArray.from(decodePng(IP.readC()).px)), res = {};
    for (const [id, L] of Object.entries(layers)) { const hide = KIT.covering(base, L, cut), pub = dec("hide-" + "shoes-sneakers-low-sv1-" + id.replace("SV1-V5-", "").toLowerCase() + "-v1.webp"); let maskDiff = 0; for (let i = 0; i < N; i++) if ((hide[i] ? 255 : 0) !== pub[i * 4 + 3]) maskDiff++;
      res[id] = { layerSha256: sha(Buffer.from(L.buffer)), locked: M.candidates[id].layerSha256, identical: sha(Buffer.from(L.buffer)) === M.candidates[id].layerSha256, coveringMaskPxDiffering: maskDiff }; }
    return done({ phase, cut: cut.id, source: { sha256: sha(b) }, registration: shift, layers: res, allIdentical: Object.values(res).every((x) => x.identical && !x.coveringMaskPxDiffering) }); }
  const w = WR.buildWardrobe(), base = BC.prepareBase(w, Uint8ClampedArray.from(decodePng(IP.readC()).px));
  if (phase === "opening") {
    const sn = KIT.loadCut("sneaker-low"), ab = KIT.loadCut("ankle-boot"), refS = dec("shoes-sneakers-beige-shoes-v1.webp"), refA = dec("shoes-ankleboots-brown-shoes-v1.webp");
    const sv1 = Uint8ClampedArray.from(decodePng(readFileSync(join(at("--package"), "placed.png"))).px), cases = [];
    const add = (name, cut, ref, L, expect) => { const o = KIT.openingCheck(L, ref, base, cut), hRef = BC.closedFootwearHidden(base, ref), hC = BC.closedFootwearHidden(base, L);
      const old = cut.id === "sneaker-low" ? E2.collarCheck(L, ref, base, { ref: hRef, cand: hC }) : null; cases.push({ name, cut: cut.id, expect, ok: o.ok, matches: o.ok === (expect === "pass"), problems: o.problems, measures: o.measures, lockedCollarCheckD297: old ? { ok: old.ok, problems: old.problems } : null }); gc(); };
    // negatives from a real layer: punch, patch, notch, shift
    const punch = (L, x, y, r) => { const o = Uint8ClampedArray.from(L); for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) o[((y + dy) * W + x + dx) * 4 + 3] = 0; return o; };
    const patch = (L, x, y, w, h, rgb) => { const o = Uint8ClampedArray.from(L); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) o.set([...rgb, 255], ((y + j) * W + x + i) * 4); return o; };
    const notch = (L, x, y0, y1, wd) => { const o = Uint8ClampedArray.from(L); for (let y = y0; y <= y1; y++) for (let i = 0; i < wd; i++) o[(y * W + x + i) * 4 + 3] = 0; return o; };
    const shift = (L, dy) => { const o = new Uint8ClampedArray(N * 4); for (let y = 0; y < H; y++) { const sy = y - dy; if (sy < 0 || sy >= H) continue; o.set(L.subarray(sy * W * 4, (sy + 1) * W * 4), y * W * 4); } return o; };
    add("sneaker reference (published)", sn, refS, refS, "pass"); add("SV-1 as placed (D-301/D-302)", sn, refS, sv1, "pass");
    for (const id of ["chalk", "charcoal", "navywhite", "burgundygum"]) add("SV1-V5 " + id + " (approved, published)", sn, refS, dec("shoes-sneakers-low-sv1-" + id + "-shoes-v1.webp"), "pass");
    add("NEG sneaker: hole punched in the toe", sn, refS, punch(refS, 380, 1450, 3), "fail"); add("NEG sneaker: material patch on the shin", sn, refS, patch(refS, 410, 1320, 14, 8, [200, 190, 170]), "fail");
    add("NEG sneaker: notch below the opening floor", sn, refS, notch(refS, 418, 1352, 1412, 3), "fail"); add("NEG sneaker: moved 4 px up", sn, refS, shift(refS, -4), "fail");
    add("ankle-boot reference (published)", ab, refA, refA, "pass");
    add("NEG boot: hole punched in the shaft", ab, refA, punch(refA, 420, 1360, 3), "fail"); add("NEG boot: material patch on the shin", ab, refA, patch(refA, 405, 1270, 20, 10, [90, 60, 40]), "fail");
    add("NEG boot: notch below the shaft's opening floor", ab, refA, notch(refA, 420, 1300, 1345, 3), "fail"); add("NEG boot: moved 4 px up", ab, refA, shift(refA, -4), "fail");
    return done({ phase, cases, allMatch: cases.every((c) => c.matches) }); }
  if (phase === "rehearse") {
    const cut = KIT.loadCut("ankle-boot"), ref = dec("shoes-ankleboots-brown-shoes-v1.webp"), q = {};
    // the source's quality (separately): luminance, fields found, stray pixels above the shaft, skin-coloured specks, glow
    let lum = [], n = 0, skinLike = 0; const sk = [230, 170, 120]; for (let i = 0; i < N; i++) if (ref[i * 4 + 3] >= 250) { n++; lum.push(0.299 * ref[i * 4] + 0.587 * ref[i * 4 + 1] + 0.114 * ref[i * 4 + 2]); const p = SM.oklab([ref[i * 4], ref[i * 4 + 1], ref[i * 4 + 2]]), s = SM.oklab(sk); if (Math.hypot(p[0] - s[0], p[1] - s[1], p[2] - s[2]) < 0.12) skinLike++; }
    lum.sort((a, b) => a - b); q.opaquePx = n; q.luminanceP5P50P95 = [lum[(n * 0.05) | 0], lum[n >> 1], lum[(n * 0.95) | 0]].map(Math.round); q.skinLikePx = skinLike; q.glow = E2.haloInAvatar(ref, ref);
    const t1 = Date.now(), m4 = SM.buildShoeMaster(ref, KIT.templateOf(ref, cut), { ...SM.SPEC_V4, seeds: KIT.seedsAt1(cut) }), un = V5.unseededFields(m4, ref).filter((f) => f.pixels >= 50); q.fieldsAtV4 = m4.sizes; q.unseededClosedFields = un.map((f) => ({ group: f.group, pixels: f.pixels, at: f.at, split: f.split }));
    const designs = { "original colour": (m, L) => KIT.designFor(cut, KIT.originalColours(cut, m, L)), ...Object.fromEntries(Object.entries(BOOT_DESIGNS).map(([k, v]) => [k, KIT.designFor(cut, v)])) };
    const { master, layers } = KIT.renderAt1(ref, cut, V5.SPEC_V5, V5.buildShoeMasterV5, designs), renderSeconds = +((Date.now() - t1) / 1000).toFixed(1); q.fieldsAtV5 = master.sizes; q.derivedFields = master.derivedFields;
    let self = 0; for (let i = 0; i < N * 4; i++) if (Math.abs(layers["original colour"][i] - ref[i]) > 8) self++; q.originalColourBytesOver8 = self;
    const items = JSON.parse(readFileSync(join(ROOT, "tools/avatar/fixtures/northstar-wardrobe/runtime-assets-inputs-d242.json"), "utf8")).items, T = "top-tee-hip-cream";
    const { P } = loadItems(Object.fromEntries([T, "shoes-ankleboots-brown", ...cut.evaluation.bottoms.filter((b) => !/square-(navy|sand)/.test(b))].map((id) => [id, items[id]])));
    for (const b of ["bottom-trousers-square-navy", "bottom-trousers-square-sand"]) P[b] = { layers: { pants: dec(b + "-pants-v1.webp") }, shadow: P["bottom-trousers-square-olive"].shadow };
    mkdirSync(join(OUT, "layers"), { recursive: true }); mkdirSync(join(OUT, "full"), { recursive: true }); const units = {}, openings = {}, t2 = Date.now();
    for (const [dn, L] of Object.entries(layers)) { const slug = dn.split(" (")[0].replace(/[^a-z0-9]+/gi, "-").toLowerCase(); save(join(OUT, "layers", slug + ".png"), { w: W, h: H, px: L });
      openings[dn] = KIT.openingCheck(L, ref, base, cut);
      for (const b of cut.evaluation.bottoms) { const x = R1.checkOutfit(w, base, [P[T], P[b], { category: "shoes", layers: { shoes: L }, covering: "closed-footwear", shadow: P["shoes-ankleboots-brown"].shadow }]);
        let c = x.proof.dressedRuntime; for (const s of [P[T].shadow, P[b].shadow, P["shoes-ankleboots-brown"].shadow]) c = IP.applyShadow(c, x.proof.stack, s);
        save(join(OUT, "full", slug + "--" + b.replace("bottom-", "") + ".png"), { w: W, h: H, px: c }); units[dn + " | " + b] = { technical: x.ok ? "PASS" : "FAIL", failed: x.failed }; x.proof = null; gc(); } }
    // the published brown boot itself through the same outfit check (the baseline of the existing item)
    const baseline = {}; for (const b of cut.evaluation.bottoms) { const x = R1.checkOutfit(w, base, [P[T], P[b], { category: "shoes", layers: { shoes: ref }, covering: "closed-footwear", shadow: P["shoes-ankleboots-brown"].shadow }]); baseline[b] = x.ok ? "PASS" : "FAIL " + x.failed.join("|"); gc(); }
    // sheets: the boots alone 1:1 and 4x (light, dark); the shaft tops 4x; hems 1:1
    const names = Object.keys(layers), slugs = names.map((dn) => dn.split(" (")[0].replace(/[^a-z0-9]+/gi, "-").toLowerCase());
    for (const [bn, bg] of [["light", LIGHT], ["dark", DARK]]) { save(join(OUT, "rehearsal-alone--" + bn + "--1to1.png"), grid([ref, ...names.map((dn) => layers[dn])].map((L) => crop(flat(L, bg), [330, 1286, 694, 1510], 1)), 1, 6));
      save(join(OUT, "rehearsal-shaft-top--" + bn + "--x4.png"), grid([ref, ...names.map((dn) => layers[dn])].flatMap((L) => [crop(flat(L, bg), cut.evaluation.reviewRegions["shaft top L"], 4), crop(flat(L, bg), cut.evaluation.reviewRegions["shaft top R"], 4)]), 2, 12)); }
    save(join(OUT, "rehearsal-hems--light--1to1.png"), grid(slugs.flatMap((s) => cut.evaluation.bottoms.map((b) => crop(flat(Uint8ClampedArray.from(decodePng(readFileSync(join(OUT, "full", s + "--" + b.replace("bottom-", "") + ".png"))).px), LIGHT), [336, 1260, 688, 1510], 1))), cut.evaluation.bottoms.length, 6));
    return done({ phase, cut: cut.id, sourceQuality: q, renderSeconds, outfitSeconds: +((Date.now() - t2) / 1000).toFixed(1), opening: Object.fromEntries(Object.entries(openings).map(([k, o]) => [k, { ok: o.ok, problems: o.problems, measures: o.measures }])), outfits: units, publishedBootBaseline: baseline }); }
  throw new Error("--phase reproduce|opening|rehearse");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error("REFUSED: " + e.message); process.exit(1); });
