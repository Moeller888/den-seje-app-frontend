// D-297 — the v4 master and the second evaluation on existing sources (offline; no image call). SS-1 is REJECTED (D-294, D-296) and
// is used here for development and diagnostics only, never as an independent validation or a later approval.
//   layers   — four routes x the five designs: the published source through v2 and v4 at 1x; SS-1 through v2 and v4 at K (diagnostic);
//              D-293's regions of both shoes cut at 1:1 on a light and a dark background; the line measures on each drawing's own lines
//   outfits  — v4 on the published source with the cream tee over the six bottoms (the outfit check: the transitions), and the full
//              composites for the browser (navy+white, burgundy+gum, the original colour; shorts-navy, trousers-sand; every route)
//   browser  — the composites in Chromium at 110x165 and 300x450 CSS px, DPR 1, 2, 3; the shoes at device pixels
//   sheets   — the before/after sheets (v2 | v4) per region at 1:1, 4x NEAREST and 4x INTERPOLATED (labelled), the browser sheets, a page
// The evaluation cases (collar, glow, lines) are northstar-shoe-v4-cases.mjs. Each phase is its own process (--expose-gc); the views
// show C: --out must be outside the repository. Nothing here approves a shoe.
// Usage: node --expose-gc tools/avatar/northstar-shoe-v4-study.mjs --out <dir> --phase layers|outfits|browser|sheets [--dwebp <dwebp.exe>]
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import { homedir } from "node:os";
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
import { TOP, BOTTOMS, PUBLISHED_BOTTOMS, BGS } from "./northstar-shoe-master-study.mjs";
import { loadItems } from "./build-northstar-runtime-assets.mjs";
import { flat, crop, grid, down } from "./northstar-wardrobe-poc.mjs";
import { decodeScreenshot } from "./r3-review-quiz.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", ".."), { W, N } = WR, H = N / W;
const sha = (b) => createHash("sha256").update(b).digest("hex"), rss = () => Math.round(process.memoryUsage().rss / 1048576), gc = () => { if (typeof globalThis.gc === "function") globalThis.gc(); };
export const SS1_DIR = join(homedir(), "Documents", "DenSejeApp-artefacts", "ss-calls", "SS-1-shoes-sneakers-low-tight-k4");
export const SS1_SHA256 = "adf02a0ae4f1414920b9c774d340ead8b93a90c812a3a2a75c2cf36f91482fc5";
export const ROUTES = Object.freeze({ "published v2 1x": "the published source, master v2 (D-291)", "published v4 1x": "the published source, master v4", "SS-1 v2 at K": "SS-1 (rejected; diagnostic), master v2 at K", "SS-1 v4 at K": "SS-1 (rejected; diagnostic), master v4 at K" });
const DESIGNS = ["original colour", ...Object.keys(SM.designs())];
const slug = (s) => s.split(" (")[0].replace(/[^a-z0-9|]+/gi, "-").replace(/\|/g, "x").toLowerCase();
const savePng = (f, im) => writeFileSync(f, encodePng(im.w, im.h, im.px)), loadPng = (f) => { const d = decodePng(readFileSync(f)); return { w: d.header.w, h: d.header.h, px: Uint8ClampedArray.from(d.px) }; };
const tpl = (L) => R1.templateFromLayers({ shoes: L }, { category: "shoes", covering: "closed-footwear", cut: SM.SPEC.cut });
function outDir(OUT) { const r = relative(ROOT, resolve(OUT || ".")); if (!OUT || !(r.startsWith("..") || isAbsolute(r))) throw new Error("--out must be outside the repository (the views show C)"); mkdirSync(OUT, { recursive: true }); return OUT; }
const itemsSpec = () => JSON.parse(readFileSync(join(ROOT, "tools", "avatar", "fixtures", "northstar-wardrobe", "runtime-assets-inputs-d242.json"), "utf8")).items;
const seedsAt = (dx, dy) => Object.fromEntries(Object.entries(SM.SPEC.seeds).map(([k, p]) => [k, p.map(([x, y]) => [x + dx, y + dy])]));
function sources() {
  const pub = loadItems({ [SM.SPEC.source]: itemsSpec()[SM.SPEC.source] }).P[SM.SPEC.source].layers.shoes, b = readFileSync(join(SS1_DIR, "ss.image-1.png"));
  if (sha(b) !== SS1_SHA256) throw new Error("not SS-1's received image"); const d = decodePng(b), ss = { w: d.header.w, h: d.header.h, px: Uint8ClampedArray.from(d.px) };
  const sh = JSON.parse(readFileSync(join(SS1_DIR, "evaluation", "check.json"), "utf8")).registration; return { pub, ss, sh, ssPlaced: SS.place(SS.downscale(ss), sh.dx, sh.dy) };
}

/** Phase layers: the four routes x five designs, the region crops, the line measures on each drawing's own lines. */
function phaseLayers(OUT) {
  const { pub, ss, sh, ssPlaced } = sources(), mem = [["start", rss()]]; for (const d of ["layers", "crops"]) mkdirSync(join(OUT, d), { recursive: true });
  const mcPub = SM.buildShoeMaster(pub, tpl(pub), SM.SPEC_V4), mcSS = SM.buildShoeMaster(ssPlaced, tpl(ssPlaced), { ...SM.SPEC_V4, seeds: seedsAt(sh.dx, sh.dy) }), m = {};
  const pubM = { v2: SM.buildShoeMaster(pub, tpl(pub), SM.SPEC_V2), v4: SM.buildShoeMaster(pub, tpl(pub), SM.SPEC_V4) };
  const designOf = (n, mc, L) => (n === "original colour" ? SM.originalDesign(mc, L) : SM.designs()[n]);
  for (const route of Object.keys(ROUTES)) for (const n of DESIGNS) { const ssRoute = route.startsWith("SS-1"), v = route.includes("v4") ? "v4" : "v2";
    let L = ssRoute ? SS.renderAtK(ss, v === "v4" ? SM.SPEC_V4 : SM.SPEC_V2, designOf(n, mcSS, ssPlaced), { shift: sh, templateOf: tpl }) : SM.renderShoe(pubM[v], pub, designOf(n, mcPub, pub));
    const id = slug(route) + "--" + slug(n); writeFileSync(join(OUT, "layers", id + ".png"), encodePng(W, H, L));
    for (const [r, box] of Object.entries(REGIONS)) for (const [bn, bg] of Object.entries(BGS)) savePng(join(OUT, "crops", id + "--" + slug(r) + "--" + bn + ".png"), crop(flat(L, bg), box, 1));
    m[id] = { route, design: n, ...E2.lineMeasures(ssRoute ? mcSS : mcPub, L) }; L = null; gc(); mem.push([id, rss()]); }
  m.drawings = { published: E2.lineMeasures(mcPub, pub), "SS-1 (diagnostic)": E2.lineMeasures(mcSS, ssPlaced) };
  writeFileSync(join(OUT, "layers.json"), JSON.stringify({ routes: ROUTES, measures: m, memory: mem }, null, 2) + "\n");
  console.log(JSON.stringify({ phase: "layers", n: Object.keys(m).length, peakMB: Math.max(...mem.map((x) => x[1])) }));
}

/** Phase outfits: v4 (published) x five designs x six bottoms: the outfit check; the browser composites of every route. */
function phaseOutfits(OUT, DWEBP) {
  const mem = [["start", rss()]], w = WR.buildWardrobe(), base = BC.prepareBase(w, Uint8ClampedArray.from(decodePng(IP.readC()).px)), items = itemsSpec();
  const { P } = loadItems(Object.fromEntries([TOP, SM.SPEC.source, ...BOTTOMS.filter((b) => !PUBLISHED_BOTTOMS.includes(b))].map((id) => [id, items[id]])));
  const tmp = join(OUT, "tmp-decode.png"); for (const b of PUBLISHED_BOTTOMS) { execFileSync(DWEBP, ["-quiet", join(ROOT, "assets", "avatar-northstar", b + "-pants-v1.webp"), "-o", tmp]); P[b] = { item: b, layers: { pants: Uint8ClampedArray.from(decodePng(readFileSync(tmp)).px) }, shadow: P["bottom-trousers-square-olive"].shadow, category: "bottom", covering: "none" }; }
  const shadow = P[SM.SPEC.source].shadow, min = BF.minimumItems(base.R, base.sep.lab), units = {}; mkdirSync(join(OUT, "composites"), { recursive: true });
  for (const route of Object.keys(ROUTES)) for (const n of DESIGNS) for (const b of BOTTOMS) {
    const wantCheck = route === "published v4 1x", wantComp = ["original colour", "contrast navy + white (SYNTHETIC)", "contrast burgundy + gum (SYNTHETIC)"].includes(n) && ["bottom-shorts-navy", "bottom-trousers-square-sand"].includes(b);
    if (!wantCheck && !wantComp) continue; const id = slug(route) + "--" + slug(n), key = id + "--" + b.replace("bottom-", ""); let shoes = loadPng(join(OUT, "layers", id + ".png")).px;
    if (wantCheck) { let r = R1.checkOutfit(w, base, [P[TOP], P[b], { category: "shoes", layers: { shoes }, covering: "closed-footwear", shadow }]); units[key] = { ok: r.ok, failed: r.failed }; r = null; gc(); }
    if (wantComp) { const pr = BF.layerProof(w, base.R, base.Z, Object.assign({}, min, P[TOP].layers, P[b].layers, { shoes }), { sep: base.sep, headSeam: "d201", hide: BC.closedFootwearHidden(base, shoes), enclosure: "c-exterior" });
      let c = pr.dressedRuntime; for (const s of [P[TOP].shadow, P[b].shadow, shadow]) if (s) c = IP.applyShadow(c, pr.stack, s); writeFileSync(join(OUT, "composites", key + ".png"), encodePng(W, H, flat(c, BGS.light))); c = null; }
    shoes = null; gc(); mem.push([key, rss()]); }
  writeFileSync(join(OUT, "outfits.json"), JSON.stringify({ units, memory: mem }, null, 2) + "\n");
  console.log(JSON.stringify({ phase: "outfits", checks: Object.keys(units).length, failed: Object.entries(units).filter(([, u]) => !u.ok).map(([k, u]) => k + ":" + u.failed.join("|")), peakMB: Math.max(...mem.map((x) => x[1])) }));
}

/** Phase browser: the composites in Chromium at the app's sizes and device pixel ratios; the shoes at device pixels. */
async function phaseBrowser(OUT) {
  const { chromium } = await import("@playwright/test"), files = readdirSync(join(OUT, "composites"));
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

/** Phase sheets: before (v2) | after (v4) per source, region and background at 1:1, 4x nearest and 4x interpolated; the browser sheets. */
function phaseSheets(OUT) {
  const C = (f) => loadPng(join(OUT, "crops", f)), big = (im, k) => { const o = new Uint8ClampedArray(im.w * k * im.h * k * 4); for (let y = 0; y < im.h * k; y++) for (let x = 0; x < im.w * k; x++) o.set(im.px.subarray((((y / k) | 0) * im.w + ((x / k) | 0)) * 4, (((y / k) | 0) * im.w + ((x / k) | 0)) * 4 + 4), (y * im.w * k + x) * 4); return { w: im.w * k, h: im.h * k, px: o }; };
  const routes = Object.keys(ROUTES);
  for (const r of Object.keys(REGIONS)) for (const bn of Object.keys(BGS)) { const t = DESIGNS.flatMap((n) => routes.map((ro) => C(slug(ro) + "--" + slug(n) + "--" + slug(r) + "--" + bn + ".png")));
    savePng(join(OUT, "ba-" + slug(r) + "--" + bn + "--1to1.png"), grid(t, routes.length, 4)); savePng(join(OUT, "ba-" + slug(r) + "--" + bn + "--x4-nearest.png"), grid(t.map((im) => big(im, 4)), routes.length, 6)); savePng(join(OUT, "ba-" + slug(r) + "--" + bn + "--x4-interpolated.png"), grid(t.map((im) => bilinear(im, 4)), routes.length, 6)); }
  if (existsSync(join(OUT, "browser"))) for (const b of ["shorts-navy", "trousers-square-sand"]) for (const [css, dpr] of [["110x165", 1], ["110x165", 2], ["110x165", 3], ["300x450", 2]]) {
    const t = ["original colour", "contrast navy + white (SYNTHETIC)", "contrast burgundy + gum (SYNTHETIC)"].flatMap((n) => routes.map((ro) => loadPng(join(OUT, "browser", slug(ro) + "--" + slug(n) + "--" + b + "--" + css + "-dpr" + dpr + ".png"))));
    savePng(join(OUT, "browser--" + b + "--" + css + "-dpr" + dpr + ".png"), grid(t, routes.length, 8)); }
  const L = JSON.parse(readFileSync(join(OUT, "layers.json"), "utf8")), rows = DESIGNS.map((n) => "<tr><td>" + n + "</td>" + routes.map((ro) => { const x = L.measures[slug(ro) + "--" + slug(n)]; return "<td>langs " + x.splitAlong + "<br>snørebånd " + x.lineContrast.laces + " · tåkappe " + x.lineContrast.toe + "<br>korn tåkappe " + x.grain.toe + "</td>"; }).join("") + "</tr>").join("");
  const img = (f, cap) => '<figure><img src="' + f + '"><figcaption>' + cap + "</figcaption></figure>";
  writeFileSync(join(OUT, "index.html"), '<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Skomaster v4</title><style>body{margin:0;padding:16px;font:14px/1.45 system-ui,sans-serif;background:#f4f2ee;color:#1d1d1f}@media (prefers-color-scheme:dark){body{background:#18181a;color:#eee}}img{max-width:100%;height:auto;image-rendering:pixelated;border:1px solid #d9d5cc}figcaption{font-size:12px;opacity:.75}table{border-collapse:collapse}td,th{border:1px solid #d9d5cc;padding:4px 8px;font-size:13px;vertical-align:top}.note{border:1px solid #d9d5cc;border-radius:8px;padding:10px;max-width:72em}</style></head><body>'
    + '<h1>Skomaster v4 og evaluering v2 (D-297) — privat</h1><p class="note">Privat; viser C. Kolonner: ' + routes.join(" | ") + ". SS-1 er AFVIST (D-294/D-296) og vises kun som udvikling og diagnostik, ikke som validering. Ingen sko er godkendt. Tegningernes egen deling langs stregerne: publiceret " + L.measures.drawings.published.splitAlong + ", SS-1 " + L.measures.drawings["SS-1 (diagnostic)"].splitAlong + ".</p>"
    + "<h2>Mål på hver tegnings egne streger</h2><table><tr><th>Design</th>" + routes.map((r) => "<th>" + r + "</th>").join("") + "</tr>" + rows + "</table>"
    + Object.keys(REGIONS).map((r) => "<h2>" + r + "</h2>" + ["light", "dark"].map((bn) => img("ba-" + slug(r) + "--" + bn + "--1to1.png", "1:1 — " + bn) + img("ba-" + slug(r) + "--" + bn + "--x4-nearest.png", "4× NÆRMESTE NABO — " + bn) + img("ba-" + slug(r) + "--" + bn + "--x4-interpolated.png", "4× INTERPOLERET (visningshjælp) — " + bn)).join("")).join("")
    + "<h2>Browser (skærmpixels; rækker: originalfarve, navy/hvid, bordeaux/gummi)</h2>" + ["shorts-navy", "trousers-square-sand"].flatMap((b) => [["110x165", 1], ["110x165", 2], ["110x165", 3], ["300x450", 2]].map(([c, d]) => img("browser--" + b + "--" + c + "-dpr" + d + ".png", b + ", " + c + " ved DPR " + d))).join("")
    + "<h2>Evalueringstilfælde</h2>" + img("collar-cases-x3.png", "Kravekontrol v2: rækker = tilfældene i collar-cases.json; rød = maling over anklen, blå = blotlagt") + img("halo-cases-x2.png", "Glorie: SS-1 og syntetisk glorie; ingen regel | alfagulv 16 | afstand 3 px; lys og mørk") + "</body></html>");
  console.log(JSON.stringify({ phase: "sheets" }));
}

async function main() {
  const args = process.argv.slice(2), at = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), OUT = outDir(at("--out")), phase = at("--phase");
  if (phase === "layers") return phaseLayers(OUT); if (phase === "outfits") return phaseOutfits(OUT, at("--dwebp")); if (phase === "browser") return phaseBrowser(OUT); if (phase === "sheets") return phaseSheets(OUT);
  throw new Error("--phase layers|outfits|browser|sheets");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error("REFUSED: " + e.message); process.exit(1); });
