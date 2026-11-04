// D-304 — THE SV-1 + MASTER v5 CANDIDATE PACKAGE FOR THE OWNER'S VISUAL REVIEW (offline; no image call; no send authorisation).
// D-301 stands: SV-1 is a REJECTED SOURCE by the original locked rules (D-299). Master v5 was developed ON SV-1 (D-302) and is not
// independently validated. This package lets the owner judge the concrete finished items, separately and documented; it approves
// nothing, and its classes are recorded beside — never instead of — the automatic results.
//   lock    — the four candidates (stable IDs, CANDIDATES) rendered from the source exactly as D-302's study (halo rule, K route, v5, the
//             fixed downscale and placement) and written to --out; the manifest pins the source, the method files (processing, master v4
//             + v5, the covering rule, the outfit check), the colours and each layer by sha256 (sv1-v5-candidates-v1.json is that
//             manifest, committed). No look changes after the lock: a later phase refuses a layer whose sha256 differs.
//   outfits — each candidate with the cream tee over the six bottoms: R1.checkOutfit, UNCHANGED (a COMBO-2 on a KNOWN_COMBO2 pair is
//             KNOWN_D291, any other NEW; both stay FAIL). The same for the published shoe (beige) and, for COMBO-2, the published drawing
//             through v2 in charcoal. Every COMBO-2 failure: the check's own flagged pixels classified as D-291 did (hem outline; the
//             shoe's outer contour, its inner ink or a field pixel read as ink by colour) and the crops (unmarked and marked).
//   raster  — per candidate: glow outside the silhouette (haloInAvatar), silhouette spurs and notches (1 px), and colour remnants at K
//             (a FIELD pixel whose hue is nearer another material of the design than its own), v4 beside v5.
//   browser — whole outfits in Chromium at 110x165 (DPR 1, 2, 3) and 300x450 (DPR 2), light and dark.
// The views show C: --out must be outside the repository.
// Usage: node --expose-gc tools/avatar/northstar-shoe-v5-candidates.mjs --source <sv.image-1.png> --out <dir> --phase lock|outfits|raster|browser
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
import * as E2 from "./northstar-shoe-eval-v2.mjs";
import * as V5 from "./northstar-shoe-master-v5.mjs";
import { KNOWN_COMBO2 } from "./northstar-shoe-validation-evaluate.mjs";
import { TOP, BOTTOMS, BGS } from "./northstar-shoe-master-study.mjs";
import { loadItems } from "./build-northstar-runtime-assets.mjs";
import { flat, crop } from "./northstar-wardrobe-poc.mjs";
import { decodeScreenshot } from "./r3-review-quiz.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", ".."), { W, N } = WR, H = N / W;
const sha = (b) => createHash("sha256").update(b).digest("hex"), gc = () => { if (typeof globalThis.gc === "function") globalThis.gc(); };
export const PACKAGE = "sv1-v5-candidates-v1";
export const MANIFEST_REL = "tools/avatar/fixtures/northstar-wardrobe/shoe-source/" + PACKAGE + ".json";
/** The stable candidate IDs and their designs (SM.designs(), unchanged). The original colour is the self-reproduction, not a candidate. */
export const CANDIDATES = Object.freeze({ "SV1-V5-CHALK": "light chalk (SYNTHETIC)", "SV1-V5-CHARCOAL": "dark charcoal (SYNTHETIC)", "SV1-V5-NAVYWHITE": "contrast navy + white (SYNTHETIC)", "SV1-V5-BURGUNDYGUM": "contrast burgundy + gum (SYNTHETIC)" });
/** The files that make the look (processing, master, covering, outfit check): pinned by the manifest. */
export const METHOD_FILES = Object.freeze(["tools/avatar/northstar-shoe-source.mjs", "tools/avatar/northstar-shoe-eval-v2.mjs", "tools/avatar/northstar-shoe-master.mjs", "tools/avatar/northstar-shoe-master-v5.mjs", "tools/avatar/northstar-shoe-v5-study.mjs", "tools/avatar/northstar-base-figure-c.mjs", "tools/avatar/northstar-base-figure.mjs", "tools/avatar/northstar-r1-garment.mjs"]);
const tpl = (L) => R1.templateFromLayers({ shoes: L }, { category: "shoes", covering: "closed-footwear", cut: SM.SPEC.cut });
const savePng = (f, im) => writeFileSync(f, encodePng(im.w, im.h, im.px)), loadPx = (f) => Uint8ClampedArray.from(decodePng(readFileSync(f)).px);
const itemsSpec = () => JSON.parse(readFileSync(join(ROOT, "tools", "avatar", "fixtures", "northstar-wardrobe", "runtime-assets-inputs-d242.json"), "utf8")).items;
const published = () => loadItems({ [SM.SPEC.source]: itemsSpec()[SM.SPEC.source] }).P[SM.SPEC.source];
function readSource(SRC) { const b = readFileSync(SRC), d = decodePng(b); return { sha256: sha(b), img: E2.dropHalo({ w: d.header.w, h: d.header.h, px: Uint8ClampedArray.from(d.px) }, E2.HALO_RULE) }; }
const layerFile = (OUT, id) => join(OUT, "layers", id + ".png");
/** A layer of the package, refused if it is not the locked one. */
function lockedLayer(OUT, id) { const m = JSON.parse(readFileSync(join(OUT, "manifest.json"), "utf8")), px = loadPx(layerFile(OUT, id)); if (sha(Buffer.from(px.buffer)) !== m.candidates[id].layerSha256) throw new Error(id + ": the layer is not the locked one"); return px; }

async function phaseLock(OUT, SRC) {
  const { sha256, img } = readSource(SRC), ref = published().layers.shoes, small = SS.downscale(img), shift = SS.register(SS.place(small), ref), placed = SS.place(small, shift.dx, shift.dy);
  const seeds1 = Object.fromEntries(Object.entries(SM.SPEC.seeds).map(([k, p]) => [k, p.map(([x, y]) => [x + shift.dx, y + shift.dy])])), mc = SM.buildShoeMaster(placed, tpl(placed), { ...SM.SPEC_V4, seeds: seeds1 });
  const { routeAtK } = await import("./northstar-shoe-v5-study.mjs"), designOf = (n) => (n === "original colour" ? SM.originalDesign(mc, placed) : SM.designs()[n]);
  const v5 = routeAtK(img, V5.SPEC_V5, designOf, V5.buildShoeMasterV5, shift).layers, candidates = {}; mkdirSync(join(OUT, "layers"), { recursive: true });
  for (const [id, n] of Object.entries(CANDIDATES)) { writeFileSync(layerFile(OUT, id), encodePng(W, H, v5[n])); candidates[id] = { design: n, colours: SM.designs()[n], layerSha256: sha(Buffer.from(v5[n].buffer)) }; }
  const m = { package: PACKAGE, status: "CANDIDATES FOR THE OWNER'S VISUAL REVIEW — NOT APPROVED; D-301 REJECTED SOURCE STANDS; MASTER v5 DEVELOPED ON SV-1, NOT INDEPENDENTLY VALIDATED; PRIVATE (NO PUBLIC ASSET, RUNTIME, CATALOGUE, ACTIVATION OR FLAG CHANGE)",
    source: { callId: "SV-1-shoes-sneakers-low-tight-k4", sha256, location: "<Documents>/DenSejeApp-artefacts/sv-calls/SV-1-shoes-sneakers-low-tight-k4/sv.image-1.png" },
    processing: { haloRule: E2.HALO_RULE, k: SS.K, crop: SS.CROP, registration: { dx: shift.dx, dy: shift.dy } }, master: { revision: V5.SPEC_V5.revision, unseededField: V5.SPEC_V5.unseededField, base: SM.SPEC_V4.revision },
    covering: "closed-footwear (BC.closedFootwearHidden, SLIVER_PX " + BC.SLIVER_PX + ")", outfitCheck: "R1.checkOutfit (outfit revision " + (IP.METHODS[IP.METHOD].outfitRevision || "d223") + ")",
    methodFiles: Object.fromEntries(METHOD_FILES.map((f) => [f, sha(readFileSync(join(ROOT, f)))])), candidates };
  writeFileSync(join(OUT, "manifest.json"), JSON.stringify(m, null, 2) + "\n"); console.log(JSON.stringify({ phase: "lock", candidates: Object.fromEntries(Object.entries(candidates).map(([k, v]) => [k, v.layerSha256])) }));
}

/** D-291's classification of COMBO-2's own flagged pixels (the check as it is; its result unchanged), with a master of the drawing. */
function combo2Pixels(w, base, proof, master, pants) {
  const oc = BC.outfitCheck(w, base, proof, { revision: IP.METHODS[IP.METHOD].outfitRevision || "d223" }), c2 = oc.checks.find((c) => c.id === "COMBO-2-DOUBLE-CONTOUR"), m = new Uint8Array(N), by = {};
  for (const d of c2.value.doubles) { const [bx, b0, bw, bh] = d.box; for (let y = b0; y < b0 + bh; y++) for (let x = bx; x < bx + bw; x++) if (oc.masks.doubles[y * W + x]) m[y * W + x] = 1; }
  for (let i = 0; i < N; i++) { if (!m[i]) continue; const g = master.group[i] >= 0 ? SM.GROUPS[master.group[i]] : "none", k = pants[i * 4 + 3] >= 128 ? "trousers: hem outline" : master.contour[i] ? "shoe: outer contour" : master.ink[i] ? "shoe: inner ink of " + g : "shoe: field pixel of " + g + " (ink by colour only)"; by[k] = (by[k] || 0) + 1; }
  return { ok: c2.ok, doubles: c2.value.doubles.map((d) => ({ px: d.px, box: d.box, seam: d.seam })), mask: m, flaggedBy: by };
}

function phaseOutfits(OUT) {
  const w = WR.buildWardrobe(), base = BC.prepareBase(w, Uint8ClampedArray.from(decodePng(IP.readC()).px)), pub = published(), items = itemsSpec();
  const { P } = loadItems(Object.fromEntries([TOP, ...BOTTOMS.filter((b) => !["bottom-trousers-square-navy", "bottom-trousers-square-sand"].includes(b))].map((id) => [id, items[id]])));
  for (const b of ["bottom-trousers-square-navy", "bottom-trousers-square-sand"]) { const f = join(ROOT, "assets", "avatar-northstar", b + "-pants-v1.webp"), tmp = join(OUT, "tmp-decode.png"), DW = process.env.DWEBP || join(ROOT, "tools", "avatar", "vendor", "dwebp.exe");
    execFileSync(DW, ["-quiet", f, "-o", tmp]); P[b] = { layers: { pants: loadPx(tmp) }, shadow: P["bottom-trousers-square-olive"].shadow }; }
  mkdirSync(join(OUT, "outfits"), { recursive: true }); mkdirSync(join(OUT, "full"), { recursive: true });
  const placed = loadPx(join(OUT, "placed.png")), m1 = SM.buildShoeMaster(placed, tpl(placed), SM.SPEC_V4), mPub = SM.buildShoeMaster(pub.layers.shoes, tpl(pub.layers.shoes), SM.SPEC_V2), units = {};
  const shoesOf = { published: () => pub.layers.shoes, "published-v2-charcoal": () => SM.renderShoe(mPub, pub.layers.shoes, SM.designs()["dark charcoal (SYNTHETIC)"]), ...Object.fromEntries(Object.keys(CANDIDATES).map((id) => [id, () => lockedLayer(OUT, id)])) };
  for (const [sid, get] of Object.entries(shoesOf)) for (const b of BOTTOMS) { if (sid === "published-v2-charcoal" && !/trousers/.test(b)) continue;
    const shoes = get(), x = R1.checkOutfit(w, base, [P[TOP], P[b], { category: "shoes", layers: { shoes }, covering: "closed-footwear", shadow: pub.shadow }]), pair = (CANDIDATES[sid] || sid) + " | " + b;
    const failed = x.failed.map((f) => (/COMBO-2/.test(f) ? f + (KNOWN_COMBO2.includes(pair) || sid.startsWith("published") ? " [KNOWN_D291]" : " [NEW]") : f + " [NEW]"));
    let c = x.proof.dressedRuntime; for (const s of [P[TOP].shadow, P[b].shadow, pub.shadow]) if (s) c = IP.applyShadow(c, x.proof.stack, s);
    const id = sid + "--" + b.replace("bottom-", ""); writeFileSync(join(OUT, "full", id + ".png"), encodePng(W, H, c)); const u = { shoe: sid, bottom: b, technical: x.ok ? "PASS" : "FAIL", failed };
    if (x.failed.includes("COMBO-2-DOUBLE-CONTOUR")) { const d = combo2Pixels(w, base, x.proof, sid.startsWith("published") ? (sid === "published" ? SM.buildShoeMaster(shoes, tpl(shoes), SM.SPEC_V4) : mPub) : m1, P[b].layers.pants);
      u.combo2 = { doubles: d.doubles, flaggedBy: d.flaggedBy }; const mk = Uint8ClampedArray.from(c); for (let i = 0; i < N; i++) if (d.mask[i]) mk.set([230, 20, 20, 255], i * 4); writeFileSync(join(OUT, "full", id + "--combo2-marked.png"), encodePng(W, H, mk)); }
    units[id] = u; gc(); }
  writeFileSync(join(OUT, "outfits.json"), JSON.stringify({ knownCombo2: KNOWN_COMBO2, units }, null, 2) + "\n");
  console.log(JSON.stringify({ phase: "outfits", results: Object.fromEntries(Object.entries(units).map(([k, u]) => [k, u.technical + (u.failed.length ? " " + u.failed.join("|") : "")])) }));
}

function phaseRaster(OUT, SRC) {
  const { img } = readSource(SRC), m = JSON.parse(readFileSync(join(OUT, "manifest.json"), "utf8")), out = {};
  // colour remnants at K: a field pixel (inkness 0) whose OKLab hue (a, b) lies nearer another group's material than its own, where the
  // two materials differ in hue by more than 0.04 — the D-301/D-302 fault class, measured for v4 (the locked master) and v5
  for (const [id, cand] of Object.entries(m.candidates)) { const d = { ...cand.colours, tongue: cand.colours.tongue || cand.colours.upper }, lab = Object.fromEntries(SM.GROUPS.map((g) => [g, SM.oklab(d[g])])), r = {};
    for (const [ver, spec, build] of [["v4", SM.SPEC_V4, SM.buildShoeMaster], ["v5", V5.SPEC_V5, V5.buildShoeMasterV5]]) { let n = 0; const where = {};
      for (const side of Object.keys(SS.SIDES)) { const t0 = SS.tileOf(img, side), ms = build(t0, tpl(t0), SS.specAtK(spec, side, null)), R = SM.renderShoe(ms, t0, d);
        for (let i = 0; i < N; i++) { if (t0[i * 4 + 3] < 250 || ms.edge.w[i] > 0 || ms.contour[i] || ms.group[i] < 0) continue; const g = SM.GROUPS[ms.group[i]], p = SM.oklab([R[i * 4], R[i * 4 + 1], R[i * 4 + 2]]), own = Math.hypot(p[1] - lab[g][1], p[2] - lab[g][2]);
          for (const h of SM.GROUPS) { if (h === g || Math.hypot(lab[h][1] - lab[g][1], lab[h][2] - lab[g][2]) <= 0.04) continue; if (Math.hypot(p[1] - lab[h][1], p[2] - lab[h][2]) < own) { n++; const k = side + " " + g + " → " + h; where[k] = (where[k] || 0) + 1; break; } } }
        gc(); }
      r[ver] = { remnantPxAtK: n, remnantAvatarPxApprox: +(n / (SS.K * SS.K)).toFixed(1), where }; }
    // the silhouette at 1x: glow beyond 1 px, 1 px spurs (an opaque pixel with at most one opaque 8-neighbour) and 1 px notches (a
    // transparent pixel inside the shoe's bounding run with at least 6 opaque 8-neighbours)
    const L = lockedLayer(OUT, id), op = (i) => L[i * 4 + 3] >= 128; let spur = 0, notch = 0;
    for (let y = 1280; y < 1520; y++) for (let x = 320; x < 704; x++) { const i = y * W + x; let k = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && op(i + dy * W + dx)) k++; if (op(i) && k <= 1) spur++; if (!op(i) && k >= 6) notch++; }
    out[id] = { colourRemnants: r, silhouette: { ...E2.haloInAvatar(L, L), spurPx: spur, notchPx: notch } }; }
  writeFileSync(join(OUT, "raster.json"), JSON.stringify(out, null, 2) + "\n"); console.log(JSON.stringify({ phase: "raster", result: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, { v4: v.colourRemnants.v4.remnantPxAtK, v5: v.colourRemnants.v5.remnantPxAtK, ...v.silhouette }])) }));
}

async function phaseBrowser(OUT) {
  const { chromium } = await import("@playwright/test"), units = JSON.parse(readFileSync(join(OUT, "outfits.json"), "utf8")).units; mkdirSync(join(OUT, "browser"), { recursive: true });
  const server = http.createServer((req, res) => { const f = join(OUT, "full", decodeURIComponent(req.url.slice(1))); if (!existsSync(f)) { res.writeHead(404); return res.end(); } res.writeHead(200, { "content-type": "image/png" }); res.end(readFileSync(f)); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r)); const port = server.address().port, browser = await chromium.launch(); let n = 0;
  try { for (const id of Object.keys(units)) for (const [cw, ch, dpr] of [[110, 165, 1], [110, 165, 2], [110, 165, 3], [300, 450, 2]]) for (const [bn, bg] of Object.entries(BGS)) {
      const ctx = await browser.newContext({ deviceScaleFactor: dpr, viewport: { width: cw + 20, height: ch + 20 } }), p = await ctx.newPage();
      await p.setContent(`<!doctype html><body style="margin:0;padding:10px;background:rgb(${bg.join(",")})"><img id="a" src="http://127.0.0.1:${port}/${id}.png" style="width:${cw}px;height:${ch}px;display:block"></body>`);
      await p.waitForFunction(() => document.getElementById("a").complete && document.getElementById("a").naturalWidth > 0); const d = decodeScreenshot(await p.screenshot({ clip: { x: 10, y: 10, width: cw, height: ch }, animations: "disabled" })); await ctx.close();
      savePng(join(OUT, "browser", id + "--" + cw + "x" + ch + "-dpr" + dpr + "--" + bn + ".png"), d); n++; } }
  finally { await browser.close(); server.close(); }
  console.log(JSON.stringify({ phase: "browser", shots: n }));
}

async function main() {
  const args = process.argv.slice(2), at = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), OUT = at("--out"), SRC = at("--source"), phase = at("--phase"), r = relative(ROOT, resolve(OUT || "."));
  if (!OUT || !(r.startsWith("..") || isAbsolute(r))) throw new Error("--out must be outside the repository (the views show C)"); mkdirSync(OUT, { recursive: true });
  if (phase === "lock" || phase === "raster") { if (!SRC || !existsSync(SRC)) throw new Error("--source <sv.image-1.png>"); }
  if (phase === "lock") { await phaseLock(OUT, SRC); const { img } = readSource(SRC), ref = published().layers.shoes, small = SS.downscale(img), s = SS.register(SS.place(small), ref); return writeFileSync(join(OUT, "placed.png"), encodePng(W, H, SS.place(small, s.dx, s.dy))); }
  if (phase === "outfits") return phaseOutfits(OUT); if (phase === "raster") return phaseRaster(OUT, SRC); if (phase === "browser") return phaseBrowser(OUT);
  throw new Error("--phase lock|outfits|raster|browser");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error("REFUSED: " + e.message); process.exit(1); });
