// D-342 — the study of the top cut kit (northstar-top-cut-kit.mjs; offline, no image call, nothing published, no runtime change). Every
// view shows C: --out must be outside the repository.
//   control — the shared path with the tee and sweater contracts reproduces the owner-approved layers byte for byte:
//             tee-hip: the master equals TM.buildMaster and carries D-267's locked fingerprint; the print box equals D-269's fraction box
//             on this cut; the 16 approved print tees (D-274) equal their published top-body and sleeve files; the skin shadow equals
//             the published top-tee-hip-cream shadow files;
//             sweater-long: the master equals LS.buildMasterFor(LS.SPEC); each of the 6 approved designs equals the approved D-335 v3
//             layer (pixel sha256 in ls2-owner-approval-v1.json) and its published top-body and sleeve files; the hip seam equals the
//             approved and the published file; the skin shadow equals the published top-sweater-ls2 shadow files. control.json.
//   tank    — the third cut (top-tank-teal, contract tank.json) through the same path: the master (one body panel), the print's safe
//             area, the hip seam, designs (source teal for fidelity; heather and navy, plain and with the approved teapot and fox
//             motifs); per design the fit check (R1.checkItem) and per design x bottom (6) x the beige sneakers the production outfit
//             check with the hip seam (checkOutfitSeam), and the same with the source item. Writes layers/, full/ and tank.json.
//   views   — the comparison: the same designs on the three cuts (tee: the approved print tees; sweater: the approved layers; tank: the
//             kit's) on navy trousers and beige sneakers, light and dark, 1:1 figure, close-ups x3 (armhole, hem and hip, print) and app
//             sizes 110x165 and 300x450; writes views/ and a private index.html.
// Usage: node --expose-gc tools/avatar/northstar-top-cut-kit-study.mjs --phase control|tank|views --out <dir outside the repo> --dwebp <dwebp.exe>
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir, tmpdir } from "node:os";
import { encodePng, decodePng } from "./r3-hair-tool-v2.mjs";
import * as WR from "./northstar-wardrobe.mjs";
import * as R1 from "./northstar-r1-garment.mjs";
import * as S1 from "./northstar-r1-similarity.mjs";
import * as IP from "./northstar-item-pilot.mjs";
import * as M1 from "./northstar-r1-material.mjs";
import * as TM from "./northstar-tee-master.mjs";
import * as TMM from "./northstar-tee-material.mjs";
import * as LS from "./northstar-longsleeve-master.mjs";
import * as LS2 from "./northstar-longsleeve-master-v2.mjs";
import * as PF from "./northstar-tee-print-family.mjs";
import * as V from "./northstar-tee-print-validation.mjs";
import * as K from "./northstar-top-cut-kit.mjs";
import { fromItem } from "./northstar-r1-material-study.mjs";
import { approvedIds, itemOf, APPROVAL as TP_APPROVAL, CANDIDATES as TP_CANDIDATES } from "./build-northstar-tee-print-layers.mjs";
import { checkOutfitSeam } from "./northstar-longsleeve-master-study.mjs";
import { loadItems } from "./build-northstar-runtime-assets.mjs";
import { flat, crop, grid, down } from "./northstar-wardrobe-poc.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", ".."), ART = join(homedir(), "Documents", "DenSejeApp-artefacts"), PUB = join(ROOT, "assets", "avatar-northstar");
const { W, N } = WR, H = N / W, sha = (b) => createHash("sha256").update(b).digest("hex"), pxSha = (px) => sha(Buffer.from(px.buffer, px.byteOffset, px.byteLength)), gc = () => { if (typeof globalThis.gc === "function") globalThis.gc(); };
const LIGHT = [236, 233, 226], DARK = [24, 26, 40], json = (rel) => JSON.parse(readFileSync(join(ROOT, ...rel.split("/")), "utf8")), loadPx = (f) => Uint8ClampedArray.from(decodePng(readFileSync(f)).px);
const local = (f) => join(ART, ...f.replace("<Documents>/DenSejeApp-artefacts/", "").split("/"));
export const MOTIFS = Object.freeze({ teapot: { callId: "TPV-2-tee-print-object-teapot", sha256: "8df1696338145d5b553b8dec40f1134b4aef08affbe855e91019804fd3d529d1" }, fox: { callId: "TPV-1-tee-print-animal-fox", sha256: "a7b321204599be347a790224974836adf88090d4d6cf847e062577da2003c219" } });
export const BOTTOMS = Object.freeze(["bottom-skirt-sand", "bottom-shorts-navy", "bottom-capri-lightblue", "bottom-trousers-square-olive", "bottom-trousers-square-navy", "bottom-trousers-square-sand"]);
export const SHOE = "shoes-sneakers-beige";
/** The tank's designs: the source colour (fidelity) and the sweater's approved six (heather and navy; plain, teapot, fox). */
export const TANK_DESIGNS = Object.freeze({ "teal (source colour)": { colour: "source" }, heather: { colour: "heather" }, "heather + teapot": { colour: "heather", print: "teapot" }, "heather + fox": { colour: "heather", print: "fox" }, navy: { colour: "navy" }, "navy + teapot": { colour: "navy", print: "teapot" }, "navy + fox": { colour: "navy", print: "fox" } });
export const slug = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const diffPx = (a, b) => { let d = 0; for (let i = 0; i < N * 4; i++) if (a[i] !== b[i]) d++; return d; };

function decoder(DW) { const tmp = join(tmpdir(), "d342-" + process.pid); mkdirSync(tmp, { recursive: true });
  return { dec: (f) => { const o = join(tmp, "x.png"); execFileSync(DW, ["-quiet", join(PUB, f), "-o", o]); return loadPx(o); }, done: () => rmSync(tmp, { recursive: true, force: true }) }; }
function motif(m, box) { const b = readFileSync(join(ART, "tp-validation-calls", m.callId, "tpv.image-1.png")); if (sha(b) !== m.sha256) throw new Error(m.callId + ": not the received motif"); return PF.prepareFor(TMM.decodeRgba(b), [box[2], box[3]]); }
const sameMaster = (a, b) => ["panel", "ratio", "disp"].every((k) => pxSha(a[k]) === pxSha(b[k])) && JSON.stringify(a.seams) === JSON.stringify(b.seams) && JSON.stringify(a.axes) === JSON.stringify(b.axes) && a.base === b.base;

function phaseControl(OUT, DW) {
  const t0 = Date.now(), E = K.envC(), D = decoder(DW), res = { tee: {}, sweater: {} };
  try {
    // ── tee-hip ──
    // the fingerprint hashes the master's labels (revision, spec) with its arrays: the kit's master carries its own labels, so the lock is
    // checked on TM.buildMaster's master and on the kit's arrays under the tee master's labels
    { const c = K.loadCut("tee-hip"), ctx = K.prepare(c, E), ref = TM.buildMaster(ctx.t, ctx.src), box = PF.placementBox(S1.geometry(ctx.t.core), V.PLACEMENT);
      const fpRef = TMM.masterFingerprint(ref, ctx.t, ctx.bands), fpKit = TMM.masterFingerprint({ ...ctx.master, revision: ref.revision, spec: ref.spec }, ctx.t, ctx.bands);
      res.tee.master = { equalsTmBuildMaster: sameMaster(ctx.master, ref), fingerprint: fpKit, lockedFingerprint: V.verifyLock(json(V.PLAN_FILE), fpRef).length === 0 && fpKit === fpRef, labelsOnly: { revision: ctx.master.revision, tmRevision: ref.revision }, sizes: ctx.master.sizes };
      res.tee.printBox = { contract: c.print.boxOnC, fractionRuleOnThisCut: box, equal: JSON.stringify(box) === JSON.stringify(c.print.boxOnC) };
      const candBuf = readFileSync(join(ROOT, ...TP_CANDIDATES.split("/"))), cand = JSON.parse(candBuf.toString("utf8")), ids = approvedIds(json(TP_APPROVAL), cand, sha(candBuf));
      const s = M1.flatten(fromItem(E, "top-tee-hip-cream", "topBody")), cream = [0, 1, 2].map((k) => { const a = []; for (let i = 0; i < s.w * s.h; i++) a.push(s.px[i * 4 + k]); a.sort((x, y) => x - y); return a[a.length >> 1]; });
      const colours = Object.fromEntries(Object.entries(V.COLOURS).map(([k, v]) => [k, v || cream])), motifs = {}, layers = {};
      for (const id of ids) { const it = itemOf(cand, id), call = cand.source.calls[it.callId];
        if (!motifs[it.callId]) motifs[it.callId] = motif({ callId: it.callId, sha256: call.imageSha256 }, c.print.boxOnC);
        const r = K.renderDesign(ctx, { rgb: colours[it.colour], print: motifs[it.callId].img });
        layers[id] = { item: it.item, topBodyBytesDiffering: diffPx(r.layers.topBody, D.dec(it.item + "-top-body-v1.webp")), sleevesBytesDiffering: diffPx(r.layers.sleeves, D.dec(it.item + "-sleeves-v1.webp")) }; gc(); }
      const sh = K.shadowParts(ctx); res.tee.shadow = Object.fromEntries(["body", "arms"].map((p) => [p, sh[p] ? diffPx(sh[p], D.dec("top-tee-hip-cream-shadow-" + p + "-v1.webp")) : "missing"]));
      res.tee.approved = layers; res.tee.ok = res.tee.master.equalsTmBuildMaster && res.tee.master.lockedFingerprint && res.tee.printBox.equal && Object.values(layers).every((l) => !l.topBodyBytesDiffering && !l.sleevesBytesDiffering) && Object.values(res.tee.shadow).every((d) => d === 0) && ids.length === 16; }
    gc();
    // ── sweater-long ──
    { const c = K.loadCut("sweater-long"), ctx = K.prepare(c, E), ref = LS.buildMasterFor(LS.SPEC, ctx.t, ctx.src), A = json("tools/avatar/fixtures/northstar-wardrobe/sweater/ls2-owner-approval-v1.json"), motifs = {}, layers = {};
      res.sweater.master = { equalsLsBuildMasterFor: sameMaster(ctx.master, ref), sizes: ctx.master.sizes };
      for (const [name, d] of Object.entries(A.designs)) { let img = null; if (d.print) { if (!motifs[d.print.motif]) motifs[d.print.motif] = motif(d.print, c.print.boxOnC); img = motifs[d.print.motif].img; }
        const r = K.renderDesign(ctx, { rgb: d.colour.rgb, print: img });
        layers[d.id] = { design: name, approvedLayerPixelSha256: pxSha(r.layer) === d.layer.pixelSha256, topBodyBytesDiffering: diffPx(r.layers.topBody, D.dec(d.proposedRuntimeItem + "-top-body-v1.webp")), sleevesBytesDiffering: diffPx(r.layers.sleeves, D.dec(d.proposedRuntimeItem + "-sleeves-v1.webp")), movedToSleevesPx: r.movedToSleevesPx }; gc(); }
      const hs = K.hipSeam(ctx); res.sweater.hipSeam = { addedPx: hs.addedPx, approvedPixelSha256: pxSha(hs.layer) === A.hipSeam.pixelSha256, publishedBytesDiffering: diffPx(hs.layer, D.dec(c.runtime.hipSeam)) };
      const sh = K.shadowParts(ctx); res.sweater.shadow = Object.fromEntries(["body", "arms"].map((p) => [p, sh[p] ? diffPx(sh[p], D.dec("top-sweater-ls2-shadow-" + p + "-v1.webp")) : "missing"]));
      res.sweater.approved = layers; res.sweater.ok = res.sweater.master.equalsLsBuildMasterFor && Object.values(layers).every((l) => l.approvedLayerPixelSha256 && !l.topBodyBytesDiffering && !l.sleevesBytesDiffering) && res.sweater.hipSeam.approvedPixelSha256 && !res.sweater.hipSeam.publishedBytesDiffering && Object.values(res.sweater.shadow).every((d) => d === 0) && Object.keys(layers).length === 6; }
  } finally { D.done(); }
  const rec = { decision: "D-342", what: "the kit's shared path with the tee and sweater contracts against the owner-approved and published layers", locked: K.LOCKED, ...res, seconds: Math.round((Date.now() - t0) / 1000) };
  writeFileSync(join(OUT, "control.json"), JSON.stringify(rec, null, 2) + "\n");
  console.log(JSON.stringify({ tee: { ok: res.tee.ok, master: res.tee.master.equalsTmBuildMaster, fingerprint: res.tee.master.lockedFingerprint, box: res.tee.printBox.equal, layers: Object.keys(res.tee.approved).length, shadow: res.tee.shadow }, sweater: { ok: res.sweater.ok, master: res.sweater.master.equalsLsBuildMasterFor, layers: Object.keys(res.sweater.approved).length, hipSeam: res.sweater.hipSeam, shadow: res.sweater.shadow }, seconds: rec.seconds }));
  if (!res.tee.ok || !res.sweater.ok) process.exitCode = 1;
}

/** The bottoms and the shoe as items (the published navy and sand trousers decoded; the others from their pinned runs, D-333's way). */
function partners(DW) { const spec = json("tools/avatar/fixtures/northstar-wardrobe/runtime-assets-inputs-d242.json"), { P } = loadItems(Object.fromEntries(["bottom-skirt-sand", "bottom-shorts-navy", "bottom-capri-lightblue", "bottom-trousers-square-olive", SHOE].map((id) => [id, spec.items[id]])));
  const D = decoder(DW); try { for (const id of ["bottom-trousers-square-navy", "bottom-trousers-square-sand"]) P[id] = { item: id, layers: { pants: D.dec(id + "-pants-v1.webp") }, shadow: P["bottom-trousers-square-olive"].shadow, category: "bottom", covering: "none" }; } finally { D.done(); } return P; }
function composite(w, base, items, seam) { const x = seam ? checkOutfitSeam(w, base, items, seam) : (() => { const r = R1.checkOutfit(w, base, items); return { ...r, enclosedPx: null, hipOpen: null }; })();
  let c = x.proof.dressedRuntime; for (const it of items) if (it.shadow) c = IP.applyShadow(c, x.proof.stack, it.shadow); const out = { ok: x.ok, failed: x.failed, enclosedPx: x.enclosedPx, hipOpen: x.hipOpen, picture: c }; x.proof = null; return out; }

function phaseTank(OUT, DW) {
  const t0 = Date.now(), E = K.envC(), { w, base, T } = E, c = K.loadCut("tank"), ctx = K.prepare(c, E), { t, src, master } = ctx, union = new Uint8ClampedArray(N * 4);
  for (const L of Object.values(src.layers)) for (let i = 0; i < N; i++) if (L[i * 4 + 3]) union.set(L.subarray(i * 4, i * 4 + 4), i * 4);
  const clear = K.printClearance(ctx), box = c.print.boxOnC, seam = K.hipSeam(ctx), sh = K.shadowParts(ctx), g = S1.geometry(t.core);
  let boxClear = 99; for (let y = box[1]; y < box[1] + box[3]; y++) for (let x = box[0]; x < box[0] + box[2]; x++) boxClear = Math.min(boxClear, clear[y * W + x]);
  const src0 = (() => { const v = [[], [], []]; for (let i = 0; i < N; i++) if (master.panel[i] === 0 && !t.contour[i * 4 + 3] && union[i * 4 + 3] >= 250 && Math.abs(master.ratio[i] - 1) < 0.03) for (let k = 0; k < 3; k++) v[k].push(union[i * 4 + k]); return v.map((a) => { a.sort((x, y) => x - y); return a[a.length >> 1]; }); })();
  const motifs = Object.fromEntries(Object.entries(MOTIFS).map(([k, m]) => [k, motif(m, box)])), colours = { heather: PF.COLOURS.heather, navy: PF.COLOURS.navy, source: src0 };
  mkdirSync(join(OUT, "layers"), { recursive: true }); mkdirSync(join(OUT, "full"), { recursive: true }); writeFileSync(join(OUT, "layers", "hip-seam.png"), encodePng(W, H, seam.layer));
  const designs = {}, P = partners(DW), srcItem = { ...src, category: "top", covering: "none" }, ref = {};
  for (const bt of BOTTOMS) { const x = composite(w, base, [srcItem, P[bt], P[SHOE]], null); ref[bt] = { ok: x.ok, failed: x.failed }; writeFileSync(join(OUT, "full", "source--" + bt.replace("bottom-", "") + ".png"), encodePng(W, H, x.picture)); gc(); }
  for (const [name, d] of Object.entries(TANK_DESIGNS)) {
    const r = K.renderDesign(ctx, { rgb: colours[d.colour], print: d.print ? motifs[d.print].img : null }), fit = R1.checkItem(w, base, T, t, r.layers);
    let minClear = null; if (r.print) { minClear = 99; for (const i of r.print.footprint) minClear = Math.min(minClear, clear[i]); }
    let fid = null; if (d.colour === "source") { const dd = []; for (let i = 0; i < N; i++) if (union[i * 4 + 3] >= 250) dd.push(Math.max(...[0, 1, 2].map((k) => Math.abs(r.layer[i * 4 + k] - union[i * 4 + k])))); dd.sort((a, b) => a - b); fid = { p50: dd[dd.length >> 1], p95: dd[Math.floor(dd.length * 0.95)], p99: dd[Math.floor(dd.length * 0.99)], max: dd[dd.length - 1] }; }
    let alphaDiff = 0; for (let i = 0; i < N; i++) if (r.layer[i * 4 + 3] !== union[i * 4 + 3]) alphaDiff++; let slPx = 0; for (let i = 0; i < N; i++) if (r.layers.sleeves[i * 4 + 3]) slPx++;
    writeFileSync(join(OUT, "layers", slug(name) + ".png"), encodePng(W, H, r.layer));
    const item = { item: "tank", layers: r.layers, shadow: t.shadow, category: "top", covering: "none" }, outfits = {};
    for (const bt of BOTTOMS) { const x = composite(w, base, [item, P[bt], P[SHOE]], seam.layer); writeFileSync(join(OUT, "full", slug(name) + "--" + bt.replace("bottom-", "") + ".png"), encodePng(W, H, x.picture));
      outfits[bt] = { ok: x.ok, failed: x.failed, enclosedPx: x.enclosedPx, hipOpen: x.hipOpen, sourceItem: ref[bt] }; x.picture = null; gc(); }
    designs[name] = { rgb: colours[d.colour], fit: { ok: fit.ok, failed: fit.failed }, alphaPxDifferingFromSource: alphaDiff, sleeveLayerPx: slPx, print: r.print ? { at: r.print.at, footprintPx: r.print.footprintPx, onContour: r.print.onContour, minClearancePx: minClear, safe: minClear >= PF.MARGIN && r.print.onContour === 0 } : null, fidelityToSourceMaxChannelDiff: fid, outfits };
    console.log(name, JSON.stringify({ fit: fit.ok, print: designs[name].print && designs[name].print.safe, outfits: Object.values(outfits).filter((o) => o.ok).length + "/" + BOTTOMS.length })); gc(); }
  const all = Object.values(designs).flatMap((d) => Object.values(d.outfits));
  const rec = { decision: "D-342", cut: c.id, source: { item: c.source.item, origin: ctx.origin, sourceColour: src0 }, master: { sizes: master.sizes, base: master.base }, geometry: { bbox: g.bbox, height: g.height },
    printBox: { box, minClearanceInBoxPx: boxClear, margin: PF.MARGIN }, hipSeam: { addedPx: seam.addedPx, box: seam.box, ink: seam.ink }, shadowParts: Object.keys(sh), sourceOutfits: ref, designs,
    summary: { outfits: all.length, pass: all.filter((o) => o.ok).length, enclosedPxMax: Math.max(...all.map((o) => o.enclosedPx)), hipOpenMax: { right: Math.max(...all.map((o) => o.hipOpen.right)), left: Math.max(...all.map((o) => o.hipOpen.left)) } }, seconds: Math.round((Date.now() - t0) / 1000) };
  writeFileSync(join(OUT, "tank.json"), JSON.stringify(rec, null, 2) + "\n"); console.log(JSON.stringify({ master: rec.master, printBox: rec.printBox, hipSeam: rec.hipSeam, summary: rec.summary, sourceOutfits: ref, failing: Object.entries(designs).flatMap(([n, d]) => Object.entries(d.outfits).filter(([, o]) => !o.ok).map(([b, o]) => n + " | " + b + ": " + o.failed.join("|"))), seconds: rec.seconds }));
}

/** The comparison designs: on the tee the approved print tees (D-274), on the sweater the approved layers (D-336), on the tank the kit's. */
export const COMPARE = Object.freeze([{ name: "heather + teapot", tee: "top-tee-hip-print-teapot-heather", sweater: "top-sweater-ls2-heather-teapot" }, { name: "navy + fox", tee: "top-tee-hip-print-fox-navy", sweater: "top-sweater-ls2-navy-fox" }]);
const VIEW_BOTTOM = "bottom-trousers-square-navy", FIG = [250, 0, 774, 1536];
export const CLOSE = Object.freeze({ "armhole left": [330, 540, 450, 700], "hem and right hip": [560, 720, 680, 860], "print": [420, 520, 604, 690], "cuff or hand left": [280, 760, 420, 880] });

function phaseViews(OUT, DW) {
  const t0 = Date.now(), E = K.envC(), { w, base } = E, P = partners(DW), D = decoder(DW), VD = join(OUT, "views"), pics = {}; mkdirSync(VD, { recursive: true });
  const save = (n, g) => writeFileSync(join(VD, n), encodePng(g.w, g.h, g.px));
  try {
    const teeShadow = K.cutOf(K.loadCut("tee-hip"), E).t.shadow, sw = K.loadCut("sweater-long"), swShadow = K.cutOf(sw, E).t.shadow, swSeam = D.dec(sw.runtime.hipSeam);
    const tc = K.loadCut("tank"), tankCut = K.cutOf(tc, E), tankSeam = loadPx(join(OUT, "layers", "hip-seam.png")); gc();
    for (const d of COMPARE) {
      const items = { tee: [{ category: "top", layers: { topBody: D.dec(d.tee + "-top-body-v1.webp"), sleeves: D.dec(d.tee + "-sleeves-v1.webp") }, shadow: teeShadow }, null],
        sweater: [{ category: "top", layers: { topBody: D.dec(d.sweater + "-top-body-v1.webp"), sleeves: D.dec(d.sweater + "-sleeves-v1.webp") }, shadow: swShadow }, swSeam],
        // the tank's full layer written by --phase tank, split by its contract's rule
        tank: [{ category: "top", layers: LS2.splitLayers(loadPx(join(OUT, "layers", slug(d.name) + ".png")), base, tc.sleeves.layerSplitFromArmAlpha).layers, shadow: tankCut.t.shadow }, tankSeam] };
      for (const [cut, [it, seam]] of Object.entries(items)) { const x = composite(w, base, [it, P[VIEW_BOTTOM], P[SHOE]], seam); pics[cut + " | " + d.name] = { picture: x.picture, ok: x.ok, failed: x.failed }; gc(); } }
  } finally { D.done(); }
  const keys = Object.keys(pics), cols = keys.length, order = ["tee", "sweater", "tank"].flatMap((c) => COMPARE.map((d) => c + " | " + d.name));
  for (const [bn, bg] of [["light", LIGHT], ["dark", DARK]]) { save("compare--figure--" + bn + ".png", grid(order.map((k) => down(flat(pics[k].picture, bg), 262, 768, FIG)), cols, 8));
    for (const [w2, h2] of [[110, 165], [300, 450]]) save("compare--app-" + w2 + "x" + h2 + "--" + bn + ".png", grid(order.map((k) => down(flat(pics[k].picture, bg), w2, h2)), cols, 6)); gc(); }
  for (const [k, b] of Object.entries(CLOSE)) save("compare--close-" + slug(k) + "--x3.png", grid(order.map((n) => crop(flat(pics[n].picture, LIGHT), b, 3)), cols, 8));
  // the tank over the six bottoms (light), heather + teapot, and the source item over the same bottoms
  for (const [tag, pre] of [["kit", "heather-teapot"], ["source", "source"]]) save("tank--bottoms--" + tag + "--light.png", grid(BOTTOMS.map((bt) => down(flat(loadPx(join(OUT, "full", pre + "--" + bt.replace("bottom-", "") + ".png")), LIGHT), 262, 768, FIG)), BOTTOMS.length, 8));
  save("tank--hip-right--x4.png", grid(BOTTOMS.map((bt) => crop(flat(loadPx(join(OUT, "full", "heather-teapot--" + bt.replace("bottom-", "") + ".png")), LIGHT), [560, 700, 680, 860], 4)), 3, 8));
  save("tank--designs--light.png", grid(Object.keys(TANK_DESIGNS).map((n) => down(flat(loadPx(join(OUT, "full", slug(n) + "--trousers-square-navy.png")), LIGHT), 262, 768, FIG)), Object.keys(TANK_DESIGNS).length, 8));
  writeFileSync(join(OUT, "views.json"), JSON.stringify({ decision: "D-342", order, bottom: VIEW_BOTTOM, shoe: SHOE, verdicts: Object.fromEntries(order.map((k) => [k, pics[k].ok ? "PASS" : pics[k].failed.join("|")])), seconds: Math.round((Date.now() - t0) / 1000) }, null, 2) + "\n");
  console.log(JSON.stringify({ order, verdicts: order.map((k) => pics[k].ok) }));
}

async function main() {
  const args = process.argv.slice(2), at = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), phase = at("--phase"), OUT = at("--out"), DW = at("--dwebp"), r = relative(ROOT, resolve(OUT || "."));
  if (!OUT || !(r.startsWith("..") || isAbsolute(r))) throw new Error("--out must be outside the repository (the views show C)"); mkdirSync(OUT, { recursive: true });
  if (!DW || !existsSync(DW)) throw new Error("--dwebp <the vendored dwebp>");
  if (phase === "control") return phaseControl(OUT, DW);
  if (phase === "tank") return phaseTank(OUT, DW);
  if (phase === "views") return phaseViews(OUT, DW);
  throw new Error("--phase control|tank|views");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error("REFUSED: " + e.message); process.exit(1); });
