// D-294 — THE LOCKED EVALUATION OF A NEW SHOE SOURCE (offline; no image call). Input: one 1536x1024 RGBA PNG drawn at K = 4 for CROP
// (northstar-shoe-source.mjs). It keeps D-293's four causes apart and the source apart from the master:
//   check    — DETAIL (detailMeasures/detailVerdict: drawn at K, not an enlargement) and GEOMETRY after the FIXED downscale and placement
//              (one global integer translation from the registration, nothing else): both shoes' IoU, size ratio, centre, the painted
//              pieces, skin-coloured pixels, paint over C's ankle where the shoe is open, the closed-footwear covering against the
//              published low sneaker; the collar's alpha antialiasing (alphaZones). REJECTED when a rule fails; a source that would
//              need a free deformation or a retouch is reported as such and goes no further (--rehearsal runs on, labelled).
//   chain    — the five fixed designs (the original colour, chalk, charcoal, navy/white, burgundy/gum): SOURCE EFFECT = the new source
//              through master v2 at K, against the published source through v2 at 1x (D-291); MASTER EFFECT = v3 at K against v2 at K on
//              the SAME new source. Measures: D-293's edges and split lines, the line contrast and grain per field (perceptualMeasures).
//   outfits  — the cream tee over the six bottoms with every chain result: the outfit check (COMBO-2 results are kept as they are),
//              whole outfits and the app sizes.
//   views    — D-293's regions of both shoes at 1:1, 4x NEAREST and 4x INTERPOLATED (labelled), light and dark; the browser at
//              110x165 and 300x450 CSS px, DPR 1, 2, 3 (shoe crops at device pixels).
// Field seeds at K: the cut's seeds mapped (seedsFor); each must land in a field of the new drawing (the build refuses otherwise:
// a new drawing whose fields do not match needs its seeds entered once — reported, not guessed).
// Usage: node --expose-gc tools/avatar/northstar-shoe-source-evaluate.mjs --source <png> --out <dir> --phase check|chain|outfits|views|browser [--rehearsal] [--dwebp <dwebp.exe>]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
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
import { edgeMeasures, splitLines, alphaZones, REGIONS, BROWSER, bilinear } from "./northstar-shoe-edge-study.mjs";
import { perceptualMeasures, TOP, BOTTOMS, PUBLISHED_BOTTOMS, BGS } from "./northstar-shoe-master-study.mjs";
import { loadItems } from "./build-northstar-runtime-assets.mjs";
import { flat, crop, grid, down } from "./northstar-wardrobe-poc.mjs";
import { decodeScreenshot } from "./r3-review-quiz.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", ".."), { W, N } = WR, H = N / W;
const sha = (b) => createHash("sha256").update(b).digest("hex"), rss = () => Math.round(process.memoryUsage().rss / 1048576), gc = () => { if (typeof globalThis.gc === "function") globalThis.gc(); };
export const SMOOTHING_GUARD = 0.9;
export const DESIGNS = Object.freeze(["original colour", "light chalk (SYNTHETIC)", "dark charcoal (SYNTHETIC)", "contrast navy + white (SYNTHETIC)", "contrast burgundy + gum (SYNTHETIC)"]);
export const ROUTES = Object.freeze({ "published v2 at 1x": "the published source through master v2 at avatar resolution (D-291)", "new source v2 at K": "the new source through master v2 at K, downscaled (SOURCE EFFECT against the first)", "new source v3 at K": "the new source through the v3 edge rules at K, downscaled (MASTER EFFECT against the second)" });
const slug = (s) => s.split(" (")[0].replace(/[^a-z0-9]+/gi, "-").toLowerCase();
const savePng = (f, im) => writeFileSync(f, encodePng(im.w, im.h, im.px)), loadPng = (f) => { const d = decodePng(readFileSync(f)); return { w: d.header.w, h: d.header.h, px: Uint8ClampedArray.from(d.px) }; };
const tpl = (L) => R1.templateFromLayers({ shoes: L }, { category: "shoes", covering: "closed-footwear", cut: SM.SPEC.cut });
function outDir(OUT) { const r = relative(ROOT, resolve(OUT || ".")); if (!OUT || !(r.startsWith("..") || isAbsolute(r))) throw new Error("--out must be outside the repository (the views show C)"); mkdirSync(OUT, { recursive: true }); return OUT; }
const itemsSpec = () => JSON.parse(readFileSync(join(ROOT, "tools", "avatar", "fixtures", "northstar-wardrobe", "runtime-assets-inputs-d242.json"), "utf8")).items;
function readSource(SRC) { const b = readFileSync(SRC), d = decodePng(b); if (!d || d.header.w !== SS.OUT.w || d.header.h !== SS.OUT.h) throw new Error("the source must be a " + SS.OUT.w + "x" + SS.OUT.h + " RGBA PNG"); return { sha256: sha(b), img: { w: d.header.w, h: d.header.h, px: Uint8ClampedArray.from(d.px) } }; }
const published = () => loadItems({ [SM.SPEC.source]: itemsSpec()[SM.SPEC.source] }).P[SM.SPEC.source].layers.shoes;

/** Phase check: detail, registration, geometry, covering, collar alpha. Writes check.json; REJECTED stops the evaluation (unless --rehearsal). */
function phaseCheck(OUT, SRC, rehearsal) {
  const { sha256, img } = readSource(SRC), detail = SS.detailMeasures(img), dv = SS.detailVerdict(detail), ref = published();
  const placed0 = SS.place(SS.downscale(img)), reg = SS.register(placed0, ref), placed = SS.place(SS.downscale(img), reg.dx, reg.dy);
  const w = WR.buildWardrobe(), base = BC.prepareBase(w, Uint8ClampedArray.from(decodePng(IP.readC()).px)), hidden = { ref: BC.closedFootwearHidden(base, ref), cand: BC.closedFootwearHidden(base, placed) };
  const geo = SS.geometryCheck(placed, ref, { base, hidden, shift: reg }), seedProblems = [];
  for (const side of Object.keys(SS.SIDES)) try { SM.buildShoeMaster(SS.tileOf(img, side), tpl(SS.tileOf(img, side)), SS.specAtK(SM.SPEC, side)); } catch (e) { seedProblems.push(side + ": " + e.message); }
  const problems = [...dv.problems, ...geo.problems, ...seedProblems.map((p) => "the cut's seeds do not fit the new drawing (" + p + "): its fields need entering once")];
  const out = { source: { file: SRC, sha256 }, rehearsal: !!rehearsal, verdict: problems.length ? "REJECTED" : "ACCEPTED FOR THE CHAIN", problems, detail, registration: reg, geometry: geo.measures, collarAlpha: { new: alphaZones(placed), published: alphaZones(ref) } };
  writeFileSync(join(OUT, "check.json"), JSON.stringify(out, null, 2) + "\n"); writeFileSync(join(OUT, "placed.png"), encodePng(W, H, placed));
  console.log(JSON.stringify({ phase: "check", verdict: out.verdict, problems, detail, registration: reg, geometry: geo.measures, collar: out.collarAlpha }));
  if (problems.length && !rehearsal) process.exitCode = 2;
}
function gate(OUT, rehearsal) { const c = JSON.parse(readFileSync(join(OUT, "check.json"), "utf8")); if (c.verdict !== "ACCEPTED FOR THE CHAIN" && !rehearsal) throw new Error("the source was REJECTED by the check: " + c.problems.join("; ")); return c; }

/** Phase chain: the three routes x five designs, the measures, the region views. */
function phaseChain(OUT, SRC, rehearsal) {
  const c = gate(OUT, rehearsal), { img } = readSource(SRC), ref = published(), mem = [["start", rss()]], shift = c.registration;
  mkdirSync(join(OUT, "layers"), { recursive: true }); mkdirSync(join(OUT, "crops"), { recursive: true });
  const m1 = SM.buildShoeMaster(ref, tpl(ref), SM.SPEC), m2 = SM.buildShoeMaster(ref, tpl(ref), SM.SPEC_V2), m3 = SM.buildShoeMaster(ref, tpl(ref), SM.SPEC_V3);
  const designOf = (n, m) => (n === "original colour" ? SM.originalDesign(m, ref) : SM.designs()[n]);
  const res = {};
  for (const route of Object.keys(ROUTES)) for (const n of DESIGNS) { const d = designOf(n, m1);
    let L = route === "published v2 at 1x" ? SM.renderShoe(m2, ref, d) : SS.renderAtK(img, route.includes("v3") ? SM.SPEC_V3 : SM.SPEC_V2, d, { shift, templateOf: tpl });
    const id = slug(route) + "--" + slug(n), png = encodePng(W, H, L); writeFileSync(join(OUT, "layers", id + ".png"), png);
    for (const [r, box] of Object.entries(REGIONS)) for (const [bn, bg] of Object.entries(BGS)) savePng(join(OUT, "crops", id + "--" + slug(r) + "--" + bn + ".png"), crop(flat(L, bg), box, 1));
    const e = edgeMeasures(m1, L), p = perceptualMeasures(m1, L);
    res[id] = { route, design: n, sha256: sha(png), edges: Object.fromEntries(Object.entries(e).map(([k, v]) => [k, v.hardShare])), splitLines: splitLines(m3, L).splitShare,
      lineContrast: Object.fromEntries(Object.entries(p).map(([g, v]) => [g, v.lineContrastL])), grain: Object.fromEntries(Object.entries(p).map(([g, v]) => [g, v.grainL])), collar: alphaZones(L)["collar top"] };
    L = null; gc(); mem.push([id, rss()]); }
  // the smoothing guard: per design and field, the new source's line contrast (v2 at K) at least SMOOTHING_GUARD x the published
  // source's (v2 at 1x): softer edges bought by losing the seams are not an improvement
  const guard = {}; for (const n of DESIGNS) { const a = res[slug("published v2 at 1x") + "--" + slug(n)], b = res[slug("new source v2 at K") + "--" + slug(n)], lost = [];
    for (const g of Object.keys(a.lineContrast)) if (a.lineContrast[g] && b.lineContrast[g] < SMOOTHING_GUARD * a.lineContrast[g]) lost.push(g + " " + a.lineContrast[g] + " -> " + b.lineContrast[g]); guard[n] = { ok: !lost.length, linesLost: lost }; }
  writeFileSync(join(OUT, "chain.json"), JSON.stringify({ rehearsal: !!rehearsal, routes: ROUTES, results: res, smoothingGuard: guard, memory: mem }, null, 2) + "\n");
  console.log(JSON.stringify({ phase: "chain", smoothingGuard: guard, results: Object.fromEntries(Object.entries(res).map(([k, v]) => [k, v.edges["outline flank"] + "/" + v.edges["inner line flank"] + " split " + v.splitLines + " collar " + v.collar.partialShare])), peakMB: Math.max(...mem.map((m) => m[1])) }));
}

/** Phase outfits: every chain layer with the cream tee over the six bottoms: the outfit check, whole outfits, app sizes, composites. */
function phaseOutfits(OUT, DWEBP, rehearsal, onlyRoutes) {
  gate(OUT, rehearsal); const ch = JSON.parse(readFileSync(join(OUT, "chain.json"), "utf8")), mem = [["start", rss()]];
  const w = WR.buildWardrobe(), base = BC.prepareBase(w, Uint8ClampedArray.from(decodePng(IP.readC()).px)), items = itemsSpec();
  const { P } = loadItems(Object.fromEntries([TOP, SM.SPEC.source, ...BOTTOMS.filter((b) => !PUBLISHED_BOTTOMS.includes(b))].map((id) => [id, items[id]])));
  const tmp = join(OUT, "tmp.png"); for (const b of PUBLISHED_BOTTOMS) { execFileSync(DWEBP, ["-quiet", join(ROOT, "assets", "avatar-northstar", b + "-pants-v1.webp"), "-o", tmp]); P[b] = { item: b, layers: { pants: Uint8ClampedArray.from(decodePng(readFileSync(tmp)).px) }, shadow: P["bottom-trousers-square-olive"].shadow, category: "bottom", covering: "none" }; }
  const shadow = P[SM.SPEC.source].shadow, min = BF.minimumItems(base.R, base.sep.lab), units = {}; mkdirSync(join(OUT, "composites"), { recursive: true });
  for (const [id, r] of Object.entries(ch.results)) for (const b of BOTTOMS) { if (onlyRoutes && !onlyRoutes.includes(r.route)) continue; let shoes = loadPng(join(OUT, "layers", id + ".png")).px;
    let x = R1.checkOutfit(w, base, [P[TOP], P[b], { category: "shoes", layers: { shoes }, covering: "closed-footwear", shadow }]); const u = { ok: x.ok, failed: x.failed }; x = null;
    const pr = BF.layerProof(w, base.R, base.Z, Object.assign({}, min, P[TOP].layers, P[b].layers, { shoes }), { sep: base.sep, headSeam: "d201", hide: BC.closedFootwearHidden(base, shoes), enclosure: "c-exterior" });
    let c = pr.dressedRuntime; for (const s of [P[TOP].shadow, P[b].shadow, shadow]) if (s) c = IP.applyShadow(c, pr.stack, s); const fl = flat(c, BGS.light), key = id + "--" + b.replace("bottom-", "");
    savePng(join(OUT, "crops", key + "--hem.png"), crop(fl, [336, 1290, 688, 1504], 1)); savePng(join(OUT, "crops", key + "--app110.png"), down(fl, 110, 165)); savePng(join(OUT, "crops", key + "--app52.png"), down(fl, 52, 78));
    if (b === "bottom-shorts-navy" || b === "bottom-trousers-square-sand") writeFileSync(join(OUT, "composites", key + ".png"), encodePng(W, H, fl));
    units[key] = u; c = null; shoes = null; gc(); mem.push([key, rss()]); }
  writeFileSync(join(OUT, "outfits.json"), JSON.stringify({ rehearsal: !!rehearsal, units, memory: mem }, null, 2) + "\n");
  console.log(JSON.stringify({ phase: "outfits", units: Object.keys(units).length, failed: Object.entries(units).filter(([, u]) => !u.ok).map(([k, u]) => k + ":" + u.failed.join("|")), peakMB: Math.max(...mem.map((m) => m[1])) }));
}

/** Phase views: the region sheets (1:1, 4x nearest, 4x interpolated; rows = designs, columns = routes) and the hems; and the page. */
function phaseViews(OUT, rehearsal) {
  const ch = JSON.parse(readFileSync(join(OUT, "chain.json"), "utf8")), c = JSON.parse(readFileSync(join(OUT, "check.json"), "utf8")), routes = Object.keys(ROUTES), C = (f) => loadPng(join(OUT, "crops", f));
  const big = (im, k) => { const o = new Uint8ClampedArray(im.w * k * im.h * k * 4); for (let y = 0; y < im.h * k; y++) for (let x = 0; x < im.w * k; x++) o.set(im.px.subarray((((y / k) | 0) * im.w + ((x / k) | 0)) * 4, (((y / k) | 0) * im.w + ((x / k) | 0)) * 4 + 4), (y * im.w * k + x) * 4); return { w: im.w * k, h: im.h * k, px: o }; };
  for (const r of Object.keys(REGIONS)) for (const bn of Object.keys(BGS)) { const t = DESIGNS.flatMap((n) => routes.map((ro) => C(slug(ro) + "--" + slug(n) + "--" + slug(r) + "--" + bn + ".png")));
    savePng(join(OUT, "ev-" + slug(r) + "--" + bn + "--1to1.png"), grid(t, routes.length, 4)); savePng(join(OUT, "ev-" + slug(r) + "--" + bn + "--x4-nearest.png"), grid(t.map((im) => big(im, 4)), routes.length, 6)); savePng(join(OUT, "ev-" + slug(r) + "--" + bn + "--x4-interpolated.png"), grid(t.map((im) => bilinear(im, 4)), routes.length, 6)); }
  if (existsSync(join(OUT, "outfits.json"))) for (const b of BOTTOMS) { const hr = routes.filter((ro) => existsSync(join(OUT, "crops", slug(ro) + "--" + slug(DESIGNS[0]) + "--" + b.replace("bottom-", "") + "--hem.png")));
    if (hr.length) savePng(join(OUT, "ev-hems--" + b.replace("bottom-", "") + ".png"), grid(DESIGNS.flatMap((n) => hr.map((ro) => C(slug(ro) + "--" + slug(n) + "--" + b.replace("bottom-", "") + "--hem.png"))), hr.length, 6)); }
  const label = rehearsal ? "GENERALPRØVE PÅ EN STAND-IN (en forstørret kopi af den publicerede sko, ikke en ny kilde)" : "Ny kilde";
  writeFileSync(join(OUT, "index.html"), '<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Skokilde: evaluering</title><style>body{margin:0;padding:16px;font:14px/1.45 system-ui,sans-serif;background:#f4f2ee;color:#1d1d1f}@media (prefers-color-scheme:dark){body{background:#18181a;color:#eee}}img{max-width:100%;height:auto;image-rendering:pixelated;border:1px solid #d9d5cc}figcaption{font-size:12px;opacity:.75}.note{border:1px solid #d9d5cc;border-radius:8px;padding:10px;max-width:72em}</style></head><body>'
    + "<h1>Skokilde (D-294) — " + label + "</h1><p class=\"note\">Privat; viser C. Kolonner: " + routes.join(" | ") + "; rækker: " + DESIGNS.join(", ") + ". Afgørelse: <b>" + c.verdict + "</b>" + (c.problems.length ? ": " + c.problems.join("; ") : "") + ". Ingen sko er godkendt.</p>"
    + Object.keys(REGIONS).map((r) => "<h2>" + r + "</h2>" + ["light", "dark"].map((bn) => ["1to1", "x4-nearest", "x4-interpolated"].map((v) => '<figure><img src="ev-' + slug(r) + "--" + bn + "--" + v + '.png"><figcaption>' + ({ "1to1": "1:1 (faktiske pixels)", "x4-nearest": "4× NÆRMESTE NABO", "x4-interpolated": "4× INTERPOLERET (visningshjælp, ingen ny detalje)" })[v] + " — " + bn + "</figcaption></figure>").join("")).join("")).join("")
    + BOTTOMS.map((b) => '<figure><img src="ev-hems--' + b.replace("bottom-", "") + '.png"><figcaption>Overgang til ' + b + " (1:1)</figcaption></figure>").join("") + "</body></html>");
  console.log(JSON.stringify({ phase: "views", regions: Object.keys(REGIONS).length }));
}

/** Phase browser: the composites in Chromium at the app sizes and DPR 1, 2, 3; the shoes at device pixels. */
async function phaseBrowser(OUT) {
  const { chromium } = await import("@playwright/test"), files = existsSync(join(OUT, "composites")) ? (await import("node:fs")).readdirSync(join(OUT, "composites")) : [];
  const server = http.createServer((req, res) => { const f = join(OUT, "composites", decodeURIComponent(req.url.slice(1))); if (!existsSync(f)) { res.writeHead(404); return res.end(); } res.writeHead(200, { "content-type": "image/png" }); res.end(readFileSync(f)); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r)); const port = server.address().port, browser = await chromium.launch(), shots = []; mkdirSync(join(OUT, "browser"), { recursive: true });
  try { for (const f of files) for (const [cw, ch] of BROWSER.sizes) for (const dpr of BROWSER.dprs) { const ctx = await browser.newContext({ deviceScaleFactor: dpr, viewport: { width: cw + 20, height: ch + 20 } }), p = await ctx.newPage();
      await p.setContent(`<!doctype html><body style="margin:0;padding:10px;background:rgb(${BGS.light.join(",")})"><img id="a" src="http://127.0.0.1:${port}/${f}" style="width:${cw}px;height:${ch}px;display:block"></body>`);
      await p.waitForFunction(() => document.getElementById("a").complete && document.getElementById("a").naturalWidth > 0); const buf = await (await p.$("#a")).screenshot({ animations: "disabled" }), d = decodeScreenshot(buf);
      const x0 = Math.round(d.w * 330 / 1024), y0 = Math.round(d.h * 1290 / 1536), x1 = Math.round(d.w * 694 / 1024), y1 = Math.round(d.h * 1510 / 1536), o = new Uint8ClampedArray((x1 - x0) * (y1 - y0) * 4); for (let y = 0; y < y1 - y0; y++) o.set(d.px.subarray(((y0 + y) * d.w + x0) * 4, ((y0 + y) * d.w + x1) * 4), y * (x1 - x0) * 4);
      const fn = f.replace(".png", "--" + cw + "x" + ch + "-dpr" + dpr + "-shoes.png"); savePng(join(OUT, "browser", fn), { w: x1 - x0, h: y1 - y0, px: o }); shots.push(fn); await ctx.close(); } }
  finally { await browser.close(); server.close(); }
  console.log(JSON.stringify({ phase: "browser", shots: shots.length }));
}

async function main() {
  const args = process.argv.slice(2), at = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), OUT = outDir(at("--out")), phase = at("--phase"), SRC = at("--source"), rehearsal = args.includes("--rehearsal");
  if (phase !== "browser" && phase !== "views" && (!SRC || !existsSync(SRC))) throw new Error("--source <the 1536x1024 PNG>");
  if (phase === "check") return phaseCheck(OUT, SRC, rehearsal); if (phase === "chain") return phaseChain(OUT, SRC, rehearsal); if (phase === "outfits") return phaseOutfits(OUT, at("--dwebp"), rehearsal, at("--routes") ? at("--routes").split(",") : null);
  if (phase === "views") return phaseViews(OUT, rehearsal); if (phase === "browser") return phaseBrowser(OUT);
  throw new Error("--phase check|chain|outfits|views|browser");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error("REFUSED: " + e.message); process.exit(1); });
