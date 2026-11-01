// D-299 — THE LOCKED VALIDATION EVALUATION OF A NEW SHOE SOURCE (offline; no image call). It tests D-297's method, unchanged, on one new
// 1536x1024 RGBA source drawn at K = 4 for CROP (northstar-shoe-source.mjs). The method, its parameters and this file are pinned by
// sha256 in sv-plan-v1.json; nothing here may change after receipt (a correction is a new version and a new validation).
//   check    — SOURCE: the halo rule (northstar-shoe-eval-v2.mjs dropHalo, HALO_RULE) on the source BEFORE anything else; detail (D-294's
//              DETAIL_RULE, drawn at K); the fixed downscale and placement (one global integer translation, |dx|, |dy| <= 2); shape (D-294's
//              IoU, size ratio, centre, two pieces); C's ankle skin; the collar check v2 (collarCheck, COLLAR_RULE — replaces D-294's pixel
//              counts); the seeds at K; the line inventory (sourceLineCheck); the painted volume (VOLUME_RULE); the antialiasing (AA_RULE).
//   chain    — the five designs through master v4 at K (the method) and v2 at K (the line-weight reference), and the published source
//              through v2 at 1x (the production master today; shown, not scored). chainLineCheck per design and the original colour's
//              volume (VOLUME_RULE.chainMin).
//   outfits  — v4 at K x five designs x the cream tee over the six bottoms: R1.checkOutfit, UNCHANGED. A COMBO-2 failure on one of the
//              nine combinations D-291 recorded is labelled KNOWN_D291, any other failure NEW; both stay FAIL.
//   views    — D-293's regions of both shoes at 1:1, 4x NEAREST and 4x INTERPOLATED (labelled), light and dark; the hems over six bottoms.
//   browser  — the composites (5 designs x shorts-navy, trousers-square-sand) in Chromium at 110x165 and 300x450, DPR 1, 2, 3.
//   verdict  — the automatic classes (source, five variants, thirty combinations) and, from the owner's visual review file if present,
//              the visual diagnosis BESIDE them: a visual OK never turns an automatic FAIL into PASS (see VERDICT). The method conclusion.
// Every phase runs whatever the check found (the evaluation is the experiment; nothing is repaired); a rejected source stays rejected.
// The views show C: --out must be outside both clones.
// Usage: node --expose-gc tools/avatar/northstar-shoe-validation-evaluate.mjs --source <png> --out <dir> --phase check|chain|outfits|views|browser|verdict [--dwebp <dwebp.exe>]
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import { encodePng, decodePng } from "./r3-hair-tool-v2.mjs";
import * as WR from "./northstar-wardrobe.mjs";
import * as BF from "./northstar-base-figure.mjs";
import * as BC from "./northstar-base-figure-c.mjs";
import * as IP from "./northstar-item-pilot.mjs";
import * as R1 from "./northstar-r1-garment.mjs";
import * as SM from "./northstar-shoe-master.mjs";
import * as SS from "./northstar-shoe-source.mjs";
import * as E2 from "./northstar-shoe-eval-v2.mjs";
import { REGIONS, BROWSER, bilinear } from "./northstar-shoe-edge-study.mjs";
import { perceptualMeasures, TOP, BOTTOMS, PUBLISHED_BOTTOMS, BGS } from "./northstar-shoe-master-study.mjs";
import { loadItems } from "./build-northstar-runtime-assets.mjs";
import { flat, crop, grid } from "./northstar-wardrobe-poc.mjs";
import { decodeScreenshot } from "./r3-review-quiz.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", ".."), { W, N } = WR, H = N / W;
const sha = (b) => createHash("sha256").update(b).digest("hex"), rss = () => Math.round(process.memoryUsage().rss / 1048576), gc = () => { if (typeof globalThis.gc === "function") globalThis.gc(); };
export const DESIGNS = Object.freeze(["original colour", "light chalk (SYNTHETIC)", "dark charcoal (SYNTHETIC)", "contrast navy + white (SYNTHETIC)", "contrast burgundy + gum (SYNTHETIC)"]);
export const ROUTES = Object.freeze({ "published v2 at 1x": "the published source through master v2 (production master today; shown, not scored)", "new v2 at K": "the new source through master v2 at K (the line-weight reference)", "new v4 at K": "the new source through master v4 at K (THE METHOD)" });
/** Painted volume (perceptualMeasures volumeL, the 5–95 % spread of a field's smoothed lightness): the source keeps at least sourceMin x
 *  the published drawing's in each scored field; the master keeps at least chainMin x the new drawing's own in the original colour.
 *  The laces and the tongue are small fields whose measure barely moves when flattened (D-299): reported, not scored. */
export const VOLUME_RULE = Object.freeze({ fields: Object.freeze(["upper", "toe", "sole"]), sourceMin: 0.7, chainMin: 0.9 });
/** Antialiasing, measured on the SOURCE after the halo rule (the K x K downscale makes partial alpha by itself: a binary-alpha source
 *  comes out 70 % "antialiased", D-299): the share of the source's silhouette edge pixels (alpha > 0 with a fully transparent
 *  4-neighbour) whose alpha is below 240 is at least minEdgeShare; and in the avatar no glow pixel more than 1 px outside the placed
 *  shoe's own silhouette remains. */
export const AA_RULE = Object.freeze({ minEdgeShare: 0.5, maxHaloPx: 0 });
export function sourceEdgeAntialiased(im) { const { w, h, px } = im; let e = 0, p = 0; for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x, a = px[i * 4 + 3]; if (!a || ![i - 1, i + 1, i - w, i + w].some((j) => !px[j * 4 + 3])) continue; e++; if (a < 240) p++; } return e ? +(p / e).toFixed(3) : 0; }
/** The nine COMBO-2 failures D-291 recorded (v2 on the published source; D-297 the same for v4): known, never new, never ignored. */
export const KNOWN_COMBO2 = Object.freeze(["dark charcoal (SYNTHETIC)", "contrast navy + white (SYNTHETIC)", "contrast burgundy + gum (SYNTHETIC)"].flatMap((d) => ["bottom-trousers-square-olive", "bottom-trousers-square-navy", "bottom-trousers-square-sand"].map((b) => d + " | " + b)));
export const VERDICT = Object.freeze({
  source: "USABLE SOURCE (automatic) when every check rule passes; else REJECTED SOURCE (the failed rules named)",
  variant: "USABLE VARIANT (automatic) when the source is usable, the original colour keeps the drawing's lines and volume, and the design passes chainLineCheck; else NOT USABLE",
  combination: "USABLE COMBINATION (automatic) when its variant is usable and R1.checkOutfit passes; else FAIL (COMBO-2 on a KNOWN_COMBO2 pair labelled KNOWN_D291, any other failure NEW)",
  visual: "the owner's visual review is recorded BESIDE each automatic class (OK | NOT OK | a diagnosis); an automatic FAIL stays FAIL whatever the visual says, and an automatic PASS is usable only with a visual OK",
  method: "METHOD CONFIRMED when the owner's visual verdicts agree with the automatic classes for the source and the five variants; METHOD DISAGREES (the rules named) otherwise; INCOMPLETE without the visual review",
});
const slug = (s) => s.split(" (")[0].replace(/[^a-z0-9]+/gi, "-").toLowerCase();
const savePng = (f, im) => writeFileSync(f, encodePng(im.w, im.h, im.px)), loadPng = (f) => { const d = decodePng(readFileSync(f)); return { w: d.header.w, h: d.header.h, px: Uint8ClampedArray.from(d.px) }; };
const tpl = (L) => R1.templateFromLayers({ shoes: L }, { category: "shoes", covering: "closed-footwear", cut: SM.SPEC.cut });
const seedsAt = (dx, dy) => Object.fromEntries(Object.entries(SM.SPEC.seeds).map(([k, p]) => [k, p.map(([x, y]) => [x + dx, y + dy])]));
const dE = (a, b) => { const p = SM.oklab([a[0], a[1], a[2]]), q = SM.oklab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
const volumeOf = (mc, L) => Object.fromEntries(Object.entries(perceptualMeasures(mc, L)).map(([g, v]) => [g, v.volumeL]));
function outDir(OUT) { const r = relative(ROOT, resolve(OUT || ".")); if (!OUT || !(r.startsWith("..") || isAbsolute(r))) throw new Error("--out must be outside the repository (the views show C)"); mkdirSync(OUT, { recursive: true }); return OUT; }
const itemsSpec = () => JSON.parse(readFileSync(join(ROOT, "tools", "avatar", "fixtures", "northstar-wardrobe", "runtime-assets-inputs-d242.json"), "utf8")).items;
const published = () => loadItems({ [SM.SPEC.source]: itemsSpec()[SM.SPEC.source] }).P[SM.SPEC.source].layers.shoes;
/** The source after the halo rule (part of the locked method, never a repair): the raw sha256 and the processed image. */
function readSource(SRC) { const b = readFileSync(SRC), d = decodePng(b); if (!d || d.header.w !== SS.OUT.w || d.header.h !== SS.OUT.h) throw new Error("the source must be a " + SS.OUT.w + "x" + SS.OUT.h + " RGBA PNG"); const raw = { w: d.header.w, h: d.header.h, px: Uint8ClampedArray.from(d.px) }; return { sha256: sha(b), raw, img: E2.dropHalo(raw, E2.HALO_RULE) }; }
const readJson = (OUT, f) => JSON.parse(readFileSync(join(OUT, f), "utf8"));

/** The source check on an image already through the halo rule (exported for the tests: base is C or a constructed stand-in). */
export function sourceCheck(img, ref, base) {
  const detail = SS.detailMeasures(img), dv = SS.detailVerdict(detail), small = SS.downscale(img), reg = SS.register(SS.place(small), ref), placed = SS.place(small, reg.dx, reg.dy), rules = {};
  rules.detail = { ok: dv.ok, problems: dv.problems, measures: detail };
  const shape = SS.geometryCheck(placed, ref, { shift: reg }); rules.shape = { ok: shape.ok, problems: shape.problems, measures: shape.measures };
  const sk = SS.skinOf(base); let skin = 0; for (let i = 0; i < N; i++) if (placed[i * 4 + 3] >= 128 && dE(placed.subarray(i * 4, i * 4 + 3), sk) < SS.SKIN_DE) skin++;
  rules.skin = { ok: skin <= SS.GEOMETRY_RULE.maxSkinPx, problems: skin <= SS.GEOMETRY_RULE.maxSkinPx ? [] : [skin + " px of C's ankle skin colour in the shoes"], measures: { skinPx: skin } };
  const collar = E2.collarCheck(placed, ref, base, { ref: BC.closedFootwearHidden(base, ref), cand: BC.closedFootwearHidden(base, placed) }); rules.collar = { ok: collar.ok, problems: collar.problems, measures: collar.measures };
  const halo = E2.haloInAvatar(placed, placed), edgeShare = sourceEdgeAntialiased(img), aaP = []; if (edgeShare < AA_RULE.minEdgeShare) aaP.push("the source's silhouette edge is " + Math.round(100 * edgeShare) + " % antialiased (< " + 100 * AA_RULE.minEdgeShare + " %)"); if (halo.haloPx > AA_RULE.maxHaloPx) aaP.push(halo.haloPx + " glow px remain");
  rules.antialiasing = { ok: !aaP.length, problems: aaP, measures: { sourceEdgeAntialiased: edgeShare, avatar: halo } };
  const seedP = []; for (const side of Object.keys(SS.SIDES)) try { SM.buildShoeMaster(SS.tileOf(img, side), tpl(SS.tileOf(img, side)), SS.specAtK(SM.SPEC_V4, side, null)); } catch (e) { seedP.push(side + ": " + e.message); }
  let mc = null; try { mc = SM.buildShoeMaster(placed, tpl(placed), { ...SM.SPEC_V4, seeds: seedsAt(reg.dx, reg.dy) }); } catch (e) { seedP.push("1x: " + e.message); }
  rules.seeds = { ok: !seedP.length, problems: seedP.map((p) => "the cut's seeds do not fit the new drawing (" + p + ")"), measures: {} };
  const mcPub = SM.buildShoeMaster(ref, tpl(ref), SM.SPEC_V4);
  if (mc) { const lc = E2.sourceLineCheck(img, mc, placed, mcPub, ref, { ok: true, problems: [] }); rules.lines = { ok: lc.ok, problems: lc.problems, measures: { inventoryRatio: lc.inventoryRatio, contrast: lc.contrast } };
    const vN = volumeOf(mc, placed), vP = volumeOf(mcPub, ref), ratio = {}, vp = []; for (const g of VOLUME_RULE.fields) { ratio[g] = +(vN[g] / vP[g]).toFixed(3); if (!(ratio[g] >= VOLUME_RULE.sourceMin)) vp.push(g + ": painted volume " + ratio[g] + " x the published drawing's (< " + VOLUME_RULE.sourceMin + ")"); }
    rules.volume = { ok: !vp.length, problems: vp, measures: { ratio, new: vN, published: vP } }; }
  else { rules.lines = { ok: false, problems: ["not measurable: the seeds do not fit"], measures: {} }; rules.volume = { ok: false, problems: ["not measurable: the seeds do not fit"], measures: {} }; }
  const problems = Object.entries(rules).flatMap(([k, r]) => r.problems.map((p) => k + ": " + p));
  return { verdict: problems.length ? "REJECTED SOURCE" : "USABLE SOURCE (automatic)", problems, rules, registration: reg, placed };
}

function phaseCheck(OUT, SRC) {
  const { sha256, raw, img } = readSource(SRC), ref = published(), base = BC.prepareBase(WR.buildWardrobe(), Uint8ClampedArray.from(decodePng(IP.readC()).px)), r = sourceCheck(img, ref, base);
  const out = { source: { file: SRC, sha256 }, haloRaw: E2.haloMeasures(raw), verdict: r.verdict, problems: r.problems, registration: r.registration, rules: r.rules };
  writeFileSync(join(OUT, "check.json"), JSON.stringify(out, null, 2) + "\n"); writeFileSync(join(OUT, "placed.png"), encodePng(W, H, r.placed));
  console.log(JSON.stringify({ phase: "check", verdict: r.verdict, problems: r.problems, registration: r.registration }));
}

function phaseChain(OUT, SRC) {
  const c = readJson(OUT, "check.json"), { img } = readSource(SRC), ref = published(), sh = c.registration, mem = [["start", rss()]], placed = loadPng(join(OUT, "placed.png")).px;
  mkdirSync(join(OUT, "layers"), { recursive: true }); mkdirSync(join(OUT, "crops"), { recursive: true });
  let mc; try { mc = SM.buildShoeMaster(placed, tpl(placed), { ...SM.SPEC_V4, seeds: seedsAt(sh.dx, sh.dy) }); } catch (e) { const out = { verdictOfTheCheck: c.verdict, measurable: false, why: e.message }; writeFileSync(join(OUT, "chain.json"), JSON.stringify(out, null, 2) + "\n"); console.log(JSON.stringify({ phase: "chain", ...out })); return; }
  const m2pub = SM.buildShoeMaster(ref, tpl(ref), SM.SPEC_V2), designOf = (n, m, L) => (n === "original colour" ? SM.originalDesign(m, L) : SM.designs()[n]), layer = {};
  for (const route of Object.keys(ROUTES)) for (const n of DESIGNS) { const L = route === "published v2 at 1x" ? SM.renderShoe(m2pub, ref, designOf(n, m2pub, ref)) : SS.renderAtK(img, route === "new v4 at K" ? SM.SPEC_V4 : SM.SPEC_V2, designOf(n, mc, placed), { shift: sh, templateOf: tpl });
    const id = slug(route) + "--" + slug(n); writeFileSync(join(OUT, "layers", id + ".png"), encodePng(W, H, L)); layer[id] = route === "published v2 at 1x" ? null : L;
    for (const [r, box] of Object.entries(REGIONS)) for (const [bn, bg] of Object.entries(BGS)) savePng(join(OUT, "crops", id + "--" + slug(r) + "--" + bn + ".png"), crop(flat(L, bg), box, 1)); gc(); mem.push([id, rss()]); }
  const v4 = (n) => layer[slug("new v4 at K") + "--" + slug(n)], v2 = (n) => layer[slug("new v2 at K") + "--" + slug(n)];
  const chain = E2.chainLineCheck(mc, placed, v4("original colour"), Object.fromEntries(DESIGNS.slice(1).map((n) => [n, { variant: v4(n), reference: v2(n) }])));
  const vOwn = volumeOf(mc, placed), vOrig = volumeOf(mc, v4("original colour")), vr = {}, vp = []; for (const g of VOLUME_RULE.fields) { vr[g] = +(vOrig[g] / vOwn[g]).toFixed(3); if (!(vr[g] >= VOLUME_RULE.chainMin)) vp.push("original colour, " + g + ": volume " + vr[g] + " x the drawing's (< " + VOLUME_RULE.chainMin + ")"); }
  const originalProblems = [...chain.problems.filter((p) => p.startsWith("original colour")), ...vp], variants = {};
  for (const n of DESIGNS) { const own = n === "original colour" ? [] : chain.designs[n].problems, problems = [...originalProblems, ...own], ok = c.verdict.startsWith("USABLE") && !problems.length;
    variants[n] = { verdict: ok ? "USABLE VARIANT (automatic)" : "NOT USABLE", problems: c.verdict.startsWith("USABLE") ? problems : ["the source is rejected", ...problems], measures: n === "original colour" ? { lines: chain.original, volumeRatio: vr } : { splitAlong: chain.designs[n].splitAlong, lineContrast: chain.designs[n].lineContrast, grain: chain.designs[n].grain } }; }
  writeFileSync(join(OUT, "chain.json"), JSON.stringify({ verdictOfTheCheck: c.verdict, measurable: true, routes: ROUTES, drawing: chain.drawing, variants, memory: mem }, null, 2) + "\n");
  console.log(JSON.stringify({ phase: "chain", variants: Object.fromEntries(Object.entries(variants).map(([k, v]) => [k, v.verdict + (v.problems.length ? ": " + v.problems.join("; ") : "")])), peakMB: Math.max(...mem.map((x) => x[1])) }));
}

function phaseOutfits(OUT, DWEBP) {
  const ch = readJson(OUT, "chain.json"); if (!ch.measurable) { writeFileSync(join(OUT, "outfits.json"), JSON.stringify({ measurable: false }, null, 2) + "\n"); return console.log(JSON.stringify({ phase: "outfits", measurable: false })); }
  const mem = [["start", rss()]], w = WR.buildWardrobe(), base = BC.prepareBase(w, Uint8ClampedArray.from(decodePng(IP.readC()).px)), items = itemsSpec();
  const { P } = loadItems(Object.fromEntries([TOP, SM.SPEC.source, ...BOTTOMS.filter((b) => !PUBLISHED_BOTTOMS.includes(b))].map((id) => [id, items[id]])));
  const tmp = join(OUT, "tmp-decode.png"); for (const b of PUBLISHED_BOTTOMS) { execFileSync(DWEBP, ["-quiet", join(ROOT, "assets", "avatar-northstar", b + "-pants-v1.webp"), "-o", tmp]); P[b] = { item: b, layers: { pants: Uint8ClampedArray.from(decodePng(readFileSync(tmp)).px) }, shadow: P["bottom-trousers-square-olive"].shadow, category: "bottom", covering: "none" }; }
  const shadow = P[SM.SPEC.source].shadow, min = BF.minimumItems(base.R, base.sep.lab), units = {}; mkdirSync(join(OUT, "composites"), { recursive: true });
  for (const n of DESIGNS) for (const b of BOTTOMS) { let shoes = loadPng(join(OUT, "layers", slug("new v4 at K") + "--" + slug(n) + ".png")).px, x = R1.checkOutfit(w, base, [P[TOP], P[b], { category: "shoes", layers: { shoes }, covering: "closed-footwear", shadow }]);
    const pair = n + " | " + b, failed = x.failed.map((f) => (/COMBO-2/.test(f) && KNOWN_COMBO2.includes(pair) ? f + " [KNOWN_D291]" : f + " [NEW]")), variantOk = ch.variants[n].verdict.startsWith("USABLE");
    units[pair] = { technical: x.ok ? "PASS" : "FAIL", failed, verdict: variantOk && x.ok ? "USABLE COMBINATION (automatic)" : "FAIL", why: !variantOk ? "the variant is not usable" : x.ok ? "" : failed.join(" | ") }; x = null;
    const pr = BF.layerProof(w, base.R, base.Z, Object.assign({}, min, P[TOP].layers, P[b].layers, { shoes }), { sep: base.sep, headSeam: "d201", hide: BC.closedFootwearHidden(base, shoes), enclosure: "c-exterior" });
    let c = pr.dressedRuntime; for (const s of [P[TOP].shadow, P[b].shadow, shadow]) if (s) c = IP.applyShadow(c, pr.stack, s); const fl = flat(c, BGS.light);
    savePng(join(OUT, "crops", slug(n) + "--" + b.replace("bottom-", "") + "--hem.png"), crop(fl, [336, 1290, 688, 1504], 1));
    if (b === "bottom-shorts-navy" || b === "bottom-trousers-square-sand") writeFileSync(join(OUT, "composites", slug(n) + "--" + b.replace("bottom-", "") + ".png"), encodePng(W, H, fl));
    c = null; shoes = null; gc(); mem.push([pair, rss()]); }
  writeFileSync(join(OUT, "outfits.json"), JSON.stringify({ measurable: true, knownCombo2: KNOWN_COMBO2, units, memory: mem }, null, 2) + "\n");
  console.log(JSON.stringify({ phase: "outfits", fails: Object.entries(units).filter(([, u]) => u.technical === "FAIL").map(([k, u]) => k + ": " + u.failed.join("|")), peakMB: Math.max(...mem.map((x) => x[1])) }));
}

function phaseViews(OUT) {
  const c = readJson(OUT, "check.json"), routes = Object.keys(ROUTES), C = (f) => loadPng(join(OUT, "crops", f));
  const big = (im, k) => { const o = new Uint8ClampedArray(im.w * k * im.h * k * 4); for (let y = 0; y < im.h * k; y++) for (let x = 0; x < im.w * k; x++) o.set(im.px.subarray((((y / k) | 0) * im.w + ((x / k) | 0)) * 4, (((y / k) | 0) * im.w + ((x / k) | 0)) * 4 + 4), (y * im.w * k + x) * 4); return { w: im.w * k, h: im.h * k, px: o }; };
  if (existsSync(join(OUT, "layers"))) for (const r of Object.keys(REGIONS)) for (const bn of Object.keys(BGS)) { const t = DESIGNS.flatMap((n) => routes.map((ro) => C(slug(ro) + "--" + slug(n) + "--" + slug(r) + "--" + bn + ".png")));
    savePng(join(OUT, "ev-" + slug(r) + "--" + bn + "--1to1.png"), grid(t, routes.length, 4)); savePng(join(OUT, "ev-" + slug(r) + "--" + bn + "--x4-nearest.png"), grid(t.map((im) => big(im, 4)), routes.length, 6)); savePng(join(OUT, "ev-" + slug(r) + "--" + bn + "--x4-interpolated.png"), grid(t.map((im) => bilinear(im, 4)), routes.length, 6)); }
  if (existsSync(join(OUT, "composites"))) for (const b of BOTTOMS) savePng(join(OUT, "ev-hems--" + b.replace("bottom-", "") + ".png"), grid(DESIGNS.map((n) => C(slug(n) + "--" + b.replace("bottom-", "") + "--hem.png")), 1, 6));
  writeFileSync(join(OUT, "index.html"), '<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Skovalidering</title><style>body{margin:0;padding:16px;font:14px/1.45 system-ui,sans-serif;background:#f4f2ee;color:#1d1d1f}@media (prefers-color-scheme:dark){body{background:#18181a;color:#eee}}img{max-width:100%;height:auto;image-rendering:pixelated;border:1px solid #d9d5cc}figcaption{font-size:12px;opacity:.75}.note{border:1px solid #d9d5cc;border-radius:8px;padding:10px;max-width:72em}</style></head><body>'
    + '<h1>Skovalidering (D-299) — privat</h1><p class="note">Viser C. Kolonner: ' + routes.join(" | ") + "; rækker: " + DESIGNS.join(", ") + ". Kildens automatiske afgørelse: <b>" + c.verdict + "</b>" + (c.problems.length ? ": " + c.problems.join("; ") : "") + ". Ingen sko er godkendt af denne side.</p>"
    + Object.keys(REGIONS).map((r) => "<h2>" + r + "</h2>" + ["light", "dark"].map((bn) => ["1to1", "x4-nearest", "x4-interpolated"].map((v) => '<figure><img src="ev-' + slug(r) + "--" + bn + "--" + v + '.png"><figcaption>' + ({ "1to1": "1:1 (faktiske pixels)", "x4-nearest": "4× NÆRMESTE NABO", "x4-interpolated": "4× INTERPOLERET (visningshjælp, ingen ny detalje)" })[v] + " — " + bn + "</figcaption></figure>").join("")).join("")).join("")
    + BOTTOMS.map((b) => '<figure><img src="ev-hems--' + b.replace("bottom-", "") + '.png"><figcaption>Overgang til ' + b + " (1:1; rækker = de fem designs, v4 ved K)</figcaption></figure>").join("") + "</body></html>");
  console.log(JSON.stringify({ phase: "views" }));
}

async function phaseBrowser(OUT) {
  const { chromium } = await import("@playwright/test"), files = existsSync(join(OUT, "composites")) ? readdirSync(join(OUT, "composites")) : [];
  const server = http.createServer((req, res) => { const f = join(OUT, "composites", decodeURIComponent(req.url.slice(1))); if (!existsSync(f)) { res.writeHead(404); return res.end(); } res.writeHead(200, { "content-type": "image/png" }); res.end(readFileSync(f)); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r)); const port = server.address().port, browser = await chromium.launch(); mkdirSync(join(OUT, "browser"), { recursive: true }); let n = 0;
  try { for (const f of files) for (const [cw, ch] of BROWSER.sizes) for (const dpr of BROWSER.dprs) { const ctx = await browser.newContext({ deviceScaleFactor: dpr, viewport: { width: cw + 20, height: ch + 20 } }), p = await ctx.newPage();
      await p.setContent(`<!doctype html><body style="margin:0;padding:10px;background:rgb(${BGS.light.join(",")})"><img id="a" src="http://127.0.0.1:${port}/${f}" style="width:${cw}px;height:${ch}px;display:block"></body>`);
      await p.waitForFunction(() => document.getElementById("a").complete && document.getElementById("a").naturalWidth > 0); const d = decodeScreenshot(await (await p.$("#a")).screenshot({ animations: "disabled" }));
      const x0 = Math.round(d.w * 330 / 1024), y0 = Math.round(d.h * 1290 / 1536), x1 = Math.round(d.w * 694 / 1024), y1 = Math.round(d.h * 1510 / 1536), o = new Uint8ClampedArray((x1 - x0) * (y1 - y0) * 4); for (let y = 0; y < y1 - y0; y++) o.set(d.px.subarray(((y0 + y) * d.w + x0) * 4, ((y0 + y) * d.w + x1) * 4), y * (x1 - x0) * 4);
      savePng(join(OUT, "browser", f.replace(".png", "--" + cw + "x" + ch + "-dpr" + dpr + ".png")), { w: x1 - x0, h: y1 - y0, px: o }); n++; await ctx.close(); } }
  finally { await browser.close(); server.close(); }
  console.log(JSON.stringify({ phase: "browser", shots: n }));
}

/** The conclusion from the automatic results and, if present, the owner's visual review (visual-review.json in --out). Exported for the
 *  tests. The visual review is recorded BESIDE the automatic class and never changes it. */
export function conclude(check, chain, outfits, visual) {
  const vis = (k) => (visual && visual[k] ? visual[k] : null), auto = (v) => (v.startsWith("USABLE") ? "PASS" : "FAIL");
  const row = (key, verdict) => { const v = vis(key), a = auto(verdict); return { automatic: verdict, visual: v ? v.verdict : null, diagnosis: v ? v.diagnosis || "" : "", usable: a === "PASS" && !!v && v.verdict === "OK", agrees: v ? (v.verdict === "OK") === (a === "PASS") : null }; };
  const source = row("source", check.verdict), variants = Object.fromEntries(DESIGNS.map((n) => [n, row("variant: " + n, chain.measurable ? chain.variants[n].verdict : "NOT USABLE")]));
  const combinations = outfits && outfits.measurable ? Object.fromEntries(Object.entries(outfits.units).map(([k, u]) => [k, { ...row("combination: " + k, u.verdict), technical: u.technical, failed: u.failed }])) : {};
  const judged = [source, ...Object.values(variants)], method = judged.some((r) => r.agrees === null) ? "INCOMPLETE (the owner's visual review of the source and the five variants is missing)"
    : judged.every((r) => r.agrees) ? "METHOD CONFIRMED" : "METHOD DISAGREES: " + [["source", source], ...Object.entries(variants)].filter(([, r]) => !r.agrees).map(([k, r]) => k + " (automatic " + auto(r.automatic) + ", visual " + r.visual + ")").join("; ");
  return { source, variants, combinations, method, rules: VERDICT };
}
function phaseVerdict(OUT) {
  const visual = existsSync(join(OUT, "visual-review.json")) ? readJson(OUT, "visual-review.json") : null, r = conclude(readJson(OUT, "check.json"), readJson(OUT, "chain.json"), existsSync(join(OUT, "outfits.json")) ? readJson(OUT, "outfits.json") : null, visual);
  if (!visual) writeFileSync(join(OUT, "visual-review.template.json"), JSON.stringify(Object.fromEntries(["source", ...DESIGNS.map((n) => "variant: " + n), ...Object.keys(r.combinations).map((k) => "combination: " + k)].map((k) => [k, { verdict: "OK | NOT OK", diagnosis: "" }])), null, 2) + "\n");
  writeFileSync(join(OUT, "verdict.json"), JSON.stringify(r, null, 2) + "\n"); console.log(JSON.stringify({ phase: "verdict", source: r.source.automatic, variants: Object.fromEntries(Object.entries(r.variants).map(([k, v]) => [k, v.automatic])), method: r.method }));
}

async function main() {
  const args = process.argv.slice(2), at = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), OUT = outDir(at("--out")), phase = at("--phase"), SRC = at("--source");
  if (["check", "chain"].includes(phase) && (!SRC || !existsSync(SRC))) throw new Error("--source <the 1536x1024 PNG>");
  if (phase === "check") return phaseCheck(OUT, SRC); if (phase === "chain") return phaseChain(OUT, SRC); if (phase === "outfits") return phaseOutfits(OUT, at("--dwebp"));
  if (phase === "views") return phaseViews(OUT); if (phase === "browser") return phaseBrowser(OUT); if (phase === "verdict") return phaseVerdict(OUT);
  throw new Error("--phase check|chain|outfits|views|browser|verdict");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error("REFUSED: " + e.message); process.exit(1); });
