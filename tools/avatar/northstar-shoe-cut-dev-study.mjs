// D-325 — DEVELOPMENT STUDY: the whole chain on AB-1's EXISTING image with contract v3 (fields found by the seed rule, northstar-shoe-cut-
// seeds.mjs). Offline; no image call. D-324's REJECTED SOURCE (the locked D-319 evaluation, contract v2) stands; contract v3 was developed
// WITH knowledge of AB-1, so nothing here is an independent validation, and nothing approves an item. The same rules as D-319's ACCEPT
// are reported, measured the same way, with the fields resolved instead of fixed. Each phase is its own process (memory).
//   check    — the source as D-319 checks it (detail, placement, shape, covering, antialiasing and glow, skin remnants, stroke tips, opening)
//              and the fields by the seed rule (log), their sizes, line contrast and presence, painted volume
//   chain    — the plan's three designs through master v5 at K (and v2 at K, the line-weight reference): original-colour ΔE, chainLineCheck,
//              volume ratio; per design the fields' grain (paint noise) at K
//   outfits  — each design with the cream tee over the six bottoms: R1.checkOutfit UNCHANGED; the composites
//   views    — the shoes alone 1:1 (light, dark), close-ups 4x NEAREST (labelled) of the shaft top, the heel and welt, the toe; hems 1:1
//   browser  — the composites in Chromium at 110x165 and 300x450 (DPR 2), light and dark
// Usage: node --expose-gc tools/avatar/northstar-shoe-cut-dev-study.mjs --source <png> --plan <ab-plan-v1.json> --out <dir> --phase check|chain|outfits|views|browser --dwebp <exe>
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import http from "node:http";
import { join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng, decodePng } from "./r3-hair-tool-v2.mjs";
import * as WR from "./northstar-wardrobe.mjs";
import * as BC from "./northstar-base-figure-c.mjs";
import * as IP from "./northstar-item-pilot.mjs";
import * as R1 from "./northstar-r1-garment.mjs";
import * as SM from "./northstar-shoe-master.mjs";
import * as SS from "./northstar-shoe-source.mjs";
import * as E2 from "./northstar-shoe-eval-v2.mjs";
import * as V5 from "./northstar-shoe-master-v5.mjs";
import * as KIT from "./northstar-shoe-cut-kit.mjs";
import * as EV from "./northstar-shoe-cut-evaluate.mjs";
import * as SD from "./northstar-shoe-cut-seeds.mjs";
import { perceptualMeasures } from "./northstar-shoe-master-study.mjs";
import { loadItems } from "./build-northstar-runtime-assets.mjs";
import { flat, crop, grid } from "./northstar-wardrobe-poc.mjs";
import { decodeScreenshot } from "./r3-review-quiz.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", ".."), { W, N } = WR, H = N / W, DIR = join(ROOT, "assets", "avatar-northstar"), A = EV.ACCEPT;
const gc = () => { if (typeof globalThis.gc === "function") globalThis.gc(); }, LIGHT = [236, 233, 226], DARK = [24, 26, 40], slug = (s) => s.split(" (")[0].replace(/[^a-z0-9]+/gi, "-").toLowerCase();
const loadPx = (f) => Uint8ClampedArray.from(decodePng(readFileSync(f)).px), savePng = (f, im) => writeFileSync(f, encodePng(im.w, im.h, im.px));
const dE = (a, b) => { const p = SM.oklab([a[0], a[1], a[2]]), q = SM.oklab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };

async function main() {
  const args = process.argv.slice(2), at = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), OUT = at("--out"), phase = at("--phase"), DW = at("--dwebp"), r = relative(ROOT, resolve(OUT || "."));
  if (!OUT || !(r.startsWith("..") || isAbsolute(r))) throw new Error("--out must be outside the repository (the views show C)"); mkdirSync(OUT, { recursive: true });
  const cut = KIT.loadCut("ankle-boot-v3"), plan = JSON.parse(readFileSync(at("--plan"), "utf8")), t0 = Date.now();
  const dec = (f) => { const o = join(OUT, "tmp-decode.png"); execFileSync(DW, ["-quiet", join(DIR, f), "-o", o]); return loadPx(o); }, ref = () => dec(cut.referenceItem + "-shoes-v1.webp");
  const done = (f, o) => { o.seconds = +((Date.now() - t0) / 1000).toFixed(1); writeFileSync(join(OUT, f), JSON.stringify(o, null, 2) + "\n"); console.log(JSON.stringify(o).slice(0, 1400)); };
  const readSrc = () => { const d = decodePng(readFileSync(at("--source"))); return E2.dropHalo({ w: d.header.w, h: d.header.h, px: Uint8ClampedArray.from(d.px) }, E2.HALO_RULE); };
  const base = () => BC.prepareBase(WR.buildWardrobe(), Uint8ClampedArray.from(decodePng(IP.readC()).px));
  if (phase === "check") { const img = readSrc(), rf = ref(), b = base(), small = KIT.downscale(img, cut), reg = KIT.register(KIT.place(small, cut), rf, cut), placed = KIT.place(small, cut, reg.dx, reg.dy), rules = {};
    const dv = SS.detailVerdict(SS.detailMeasures(img)); rules.detail = { ok: dv.ok, problems: dv.problems };
    rules.placement = { ok: Math.abs(reg.dx) <= A.maxShiftPx && Math.abs(reg.dy) <= A.maxShiftPx, measures: reg }; rules.shape = EV.shapeCheck(placed, rf, cut);
    const hR = KIT.covering(b, rf, cut), hC = KIT.covering(b, placed, cut); let diff = 0, n0 = 0; for (let i = 0; i < N; i++) { if (hR[i]) n0++; if (hR[i] !== hC[i]) diff++; } rules.covering = { ok: diff / n0 <= A.maxCoveringChange, measures: { coveringChange: +(diff / n0).toFixed(4) } };
    const aa = EV.edgeAntialiased(img), glow = E2.haloInAvatar(placed, placed); rules.antialiasing = { ok: aa >= A.minEdgeAntialiased && glow.haloPx <= A.maxGlowPx, measures: { aa, glow } };
    const sk = SS.skinOf(b), rows = (cut.opening.zone.y1 + A.openingBandExtraPx - cut.source.crop.y0) * cut.source.K; let skin = 0; for (let i = 0; i < rows * img.w; i++) if (img.px[i * 4 + 3] >= 128 && dE(img.px.subarray(i * 4, i * 4 + 3), sk) < A.skinRemnantDE) skin++;
    rules.skin = { ok: skin <= A.maxSkinSourcePx, measures: { skinSourcePx: skin } }; const tp = EV.strokeTips(img, cut); rules.strokeTips = { ok: !tp.left.length && !tp.right.length, measures: tp };
    const oc = KIT.openingCheck(placed, rf, b, cut); rules.opening = { ok: oc.ok, problems: oc.problems, measures: oc.measures };
    const seeds = SD.resolveSeeds(placed, cut); rules.fieldsBySeedRule = { ok: seeds.ok, problems: seeds.problems, log: seeds.log.map((e) => ({ field: e.field, side: e.side, point: e.point || null, reason: e.reason, candidates: e.candidates.map(({ pixels, safePx, depth }) => ({ pixels, safePx, depth })) })) };
    if (seeds.ok) { const c3 = SD.cutWithSeeds(cut, seeds), fc = EV.fieldCheck(placed, c3); rules.fieldSizes = { ok: fc.ok, problems: fc.problems, measures: fc.measures };
      const pm = perceptualMeasures(fc.master, placed), inv = E2.lineMeasures(fc.master, placed).lineInventory, lp = [], vp = [];
      for (const [nm, f] of Object.entries(cut.fields)) { const g = pm[f.slot]; if (!(g.lineContrastL >= A.minLineContrast)) lp.push(nm + ": contrast " + g.lineContrastL); if (!((inv[f.slot] || 0) >= A.minLineInventory)) lp.push(nm + ": presence " + inv[f.slot]); if (A.volumeFields.includes(nm) && !(g.volumeL >= A.minVolumeL)) vp.push(nm + ": volume " + g.volumeL); }
      rules.lines = { ok: !lp.length, problems: lp, measures: Object.fromEntries(Object.entries(cut.fields).map(([nm, f]) => [nm, { contrast: pm[f.slot].lineContrastL, presence: inv[f.slot] }])) };
      rules.volume = { ok: !vp.length, problems: vp, measures: Object.fromEntries(Object.entries(cut.fields).map(([nm, f]) => [nm, pm[f.slot].volumeL])) }; }
    writeFileSync(join(OUT, "placed.png"), encodePng(W, H, placed)); writeFileSync(join(OUT, "seeds.json"), JSON.stringify(seeds.seeds) + "\n");
    const failed = Object.entries(rules).filter(([, v]) => !v.ok).map(([k]) => k);
    return done("check.json", { note: "D-325 development study (contract v3, developed with knowledge of AB-1): NOT the locked evaluation; D-324's REJECTED SOURCE stands", registration: reg, allRulesPass: !failed.length, failed, rules }); }
  if (phase === "chain") { const c = JSON.parse(readFileSync(join(OUT, "check.json"), "utf8")); if (!c.rules.fieldsBySeedRule.ok) return done("chain.json", { measurable: false, why: c.rules.fieldsBySeedRule.problems });
    const img = readSrc(), placed = loadPx(join(OUT, "placed.png")), c3 = SD.cutWithSeeds(cut, { ok: true, seeds: JSON.parse(readFileSync(join(OUT, "seeds.json"), "utf8")) }), sh = c.registration, fc = EV.fieldCheck(placed, c3);
    const D = Object.fromEntries(Object.entries(plan.acceptance.designs).map(([n, d]) => [n, d === "original" ? (m, s) => KIT.designFor(c3, KIT.originalColours(c3, m, s)) : KIT.designFor(c3, d)]));
    // at K the seeds are found again on each side's working canvas (a 1x seed can land on a line that the downscale blurs away)
    const r5 = SD.renderAtKFound(img, c3, V5.SPEC_V5, V5.buildShoeMasterV5, D, sh), v5 = r5.layers; gc(); const v2 = SD.renderAtKFound(img, c3, SM.SPEC_V2, SM.buildShoeMaster, D, sh).layers; gc();
    writeFileSync(join(OUT, "seeds-at-k.json"), JSON.stringify(Object.fromEntries(Object.entries(r5.logs).map(([sd, l]) => [sd, l.log.map((e) => ({ field: e.field, rule: e.rule, fieldsAt1: e.fieldsAt1, points: e.points || null, reason: e.reason, candidates: e.candidates.map(({ pixels, safePx, insideShare, depth }) => ({ pixels, safePx, insideShare, depth })) }))])), null, 2) + "\n");
    mkdirSync(join(OUT, "layers"), { recursive: true }); for (const [n, L] of Object.entries(v5)) writeFileSync(join(OUT, "layers", slug(n) + ".png"), encodePng(W, H, L));
    const orig = "original colour", de = []; for (let i = 0; i < N; i++) if (placed[i * 4 + 3] >= 250) de.push(dE(placed.subarray(i * 4, i * 4 + 3), Array.from(v5[orig].subarray(i * 4, i * 4 + 3)))); de.sort((a, b) => a - b);
    const chain = E2.chainLineCheck(fc.master, placed, v5[orig], Object.fromEntries(Object.keys(D).filter((n) => n !== orig).map((n) => [n, { variant: v5[n], reference: v2[n] }])));
    const vOwn = perceptualMeasures(fc.master, placed), vO = perceptualMeasures(fc.master, v5[orig]), vr = Object.fromEntries(A.volumeFields.map((n) => [n, +(vO[c3.fields[n].slot].volumeL / vOwn[c3.fields[n].slot].volumeL).toFixed(3)]));
    const de95 = +de[Math.floor(de.length * 0.95)].toFixed(4), origP = [...chain.problems.filter((p) => p.startsWith("original colour")), ...(de95 > A.maxOriginalDeltaE95 ? ["ΔE p95 " + de95] : []), ...Object.entries(vr).filter(([, v]) => v < A.chainVolumeMin).map(([n, v]) => n + " volume " + v)];
    const designs = Object.fromEntries(Object.keys(D).map((n) => [n, { technical: !origP.length && (n === orig || !chain.designs[n].problems.length) ? "PASS" : "FAIL", problems: [...origP, ...(n === orig ? [] : chain.designs[n].problems)], measures: n === orig ? { deltaE95: de95, volumeRatio: vr, lines: chain.original } : { splitAlong: chain.designs[n].splitAlong, lineContrast: chain.designs[n].lineContrast, grain: chain.designs[n].grain } }]));
    return done("chain.json", { measurable: true, designs }); }
  if (phase === "outfits") { const ch = JSON.parse(readFileSync(join(OUT, "chain.json"), "utf8")); if (!ch.measurable) return done("outfits.json", { measurable: false });
    const w = WR.buildWardrobe(), b = base(), items = JSON.parse(readFileSync(join(ROOT, "tools/avatar/fixtures/northstar-wardrobe/runtime-assets-inputs-d242.json"), "utf8")).items, T = "top-tee-hip-cream";
    const { P } = loadItems(Object.fromEntries([T, cut.referenceItem, ...cut.evaluation.bottoms.filter((x) => !/square-(navy|sand)/.test(x))].map((id) => [id, items[id]])));
    for (const x of ["bottom-trousers-square-navy", "bottom-trousers-square-sand"]) P[x] = { layers: { pants: dec(x + "-pants-v1.webp") }, shadow: P["bottom-trousers-square-olive"].shadow };
    mkdirSync(join(OUT, "full"), { recursive: true }); const units = {};
    for (const n of Object.keys(plan.acceptance.designs)) { const L = loadPx(join(OUT, "layers", slug(n) + ".png"));
      for (const bt of cut.evaluation.bottoms) { const x = R1.checkOutfit(w, b, [P[T], P[bt], { category: "shoes", layers: { shoes: L }, covering: "closed-footwear", shadow: P[cut.referenceItem].shadow }]);
        let c = x.proof.dressedRuntime; for (const s of [P[T].shadow, P[bt].shadow, P[cut.referenceItem].shadow]) c = IP.applyShadow(c, x.proof.stack, s); writeFileSync(join(OUT, "full", slug(n) + "--" + bt.replace("bottom-", "") + ".png"), encodePng(W, H, c));
        units[n + " | " + bt] = { technical: x.ok ? "PASS" : "FAIL", failed: x.failed }; x.proof = null; gc(); } }
    return done("outfits.json", { measurable: true, units }); }
  if (phase === "views") { const names = Object.keys(plan.acceptance.designs), Ls = names.map((n) => loadPx(join(OUT, "layers", slug(n) + ".png"))), rf = ref(), src = [rf, loadPx(join(OUT, "placed.png")), ...Ls];
    const R = { "shaft top L": [384, 1296, 456, 1336], "heel and welt L": [400, 1440, 476, 1504], "toe L": [336, 1440, 412, 1504], "shaft top R": [568, 1296, 640, 1336] };
    for (const [bn, bg] of [["light", LIGHT], ["dark", DARK]]) { savePng(join(OUT, "view-alone--" + bn + "--1to1.png"), grid(src.map((L) => crop(flat(L, bg), [330, 1286, 694, 1510], 1)), 1, 6));
      for (const [rn, box] of Object.entries(R)) savePng(join(OUT, "view-" + slug(rn) + "--" + bn + "--x4-nearest.png"), grid(src.map((L) => crop(flat(L, bg), box, 4)), src.length, 10)); }
    if (existsSync(join(OUT, "full"))) savePng(join(OUT, "view-hems--light--1to1.png"), grid(names.flatMap((n) => cut.evaluation.bottoms.map((bt) => crop(flat(loadPx(join(OUT, "full", slug(n) + "--" + bt.replace("bottom-", "") + ".png")), LIGHT), [336, 1240, 688, 1510], 1))), cut.evaluation.bottoms.length, 6));
    return done("views.json", { rows: ["published reference", "AB-1 as placed", ...names] }); }
  if (phase === "browser") { const { chromium } = await import("@playwright/test"), names = Object.keys(plan.acceptance.designs); mkdirSync(join(OUT, "browser"), { recursive: true });
    const server = http.createServer((req, res) => { const f = join(OUT, "full", decodeURIComponent(req.url.slice(1))); if (!existsSync(f)) { res.writeHead(404); return res.end(); } res.writeHead(200, { "content-type": "image/png" }); res.end(readFileSync(f)); });
    await new Promise((rr) => server.listen(0, "127.0.0.1", rr)); const port = server.address().port, browser = await chromium.launch();
    try { for (const [cw, ch] of [[110, 165], [300, 450]]) for (const [bn, bg] of [["light", LIGHT], ["dark", DARK]]) { const ctx = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: cw + 20, height: ch + 20 } }), p = await ctx.newPage(), t = [];
        for (const n of names) for (const bt of ["bottom-shorts-navy", "bottom-skirt-sand", "bottom-capri-lightblue", "bottom-trousers-square-sand"]) { await p.setContent(`<!doctype html><body style="margin:0;padding:10px;background:rgb(${bg.join(",")})"><img id="a" src="http://127.0.0.1:${port}/${slug(n)}--${bt.replace("bottom-", "")}.png" style="width:${cw}px;height:${ch}px;display:block"></body>`);
          await p.waitForFunction(() => document.getElementById("a").complete && document.getElementById("a").naturalWidth > 0); t.push(decodeScreenshot(await p.screenshot({ clip: { x: 10, y: 10, width: cw, height: ch }, animations: "disabled" }))); }
        savePng(join(OUT, "browser", "app--" + cw + "x" + ch + "-dpr2--" + bn + ".png"), grid(t, 4, 6)); await ctx.close(); } }
    finally { await browser.close(); server.close(); }
    return done("browser.json", { rows: names, columns: ["shorts-navy", "skirt-sand", "capri-lightblue", "trousers-square-sand"] }); }
  throw new Error("--phase check|chain|outfits|views|browser");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error("REFUSED: " + e.message); process.exit(1); });
