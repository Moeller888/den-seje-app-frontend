// D-255 R1 EVALUATION — one received R1 picture through the frozen R1 method (northstar-r1-garment.mjs, r1-v1) and the production
// checks (d240), with every measure of the plan and the review sheets; then, after the last call, the joint outfits. No image call.
//   node tools/avatar/northstar-r1-evaluate.mjs --call-id <R1-…>      one call: writes r1.record.json (+ sheets) in the call's directory
//   node tools/avatar/northstar-r1-evaluate.mjs --joint                  after the last call: the received items together (r1-joint.json)
// The record is what the send adapter requires before the next call; a coverage of the template core below the plan's 0.80 writes
// stop: true and the adapter refuses every later call. The record holds the AUTOMATIC measures only: fixed alpha guarantees the
// geometry, not a correct item. The assistant's visual review (body or background in the material, neckband, cuffs, pocket,
// waistband, collar, double outlines, double fold shading, clipped details, the pattern across body and sleeves) is written apart
// and decides with them; nothing here approves anything. Everything is written outside both clones.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { encodePng, decodePng } from "./r3-hair-tool-v2.mjs";
import * as WR from "./northstar-wardrobe.mjs";
import * as BF from "./northstar-base-figure.mjs";
import * as BC from "./northstar-base-figure-c.mjs";
import * as IP from "./northstar-item-pilot.mjs";
import * as R1 from "./northstar-r1-garment.mjs";
import { inputs } from "./northstar-shape-experiment.mjs";
import { PARTNERS } from "./northstar-r1-proof.mjs";
import { flat, crop, grid, down } from "./northstar-wardrobe-poc.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const ART = join(homedir(), "Documents", "DenSejeApp-artefacts"), CALLS_DIR = join(ART, "r1-calls"), { W, N } = WR, H = N / W;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const json = (f) => JSON.parse(readFileSync(f, "utf8"));
const PLAN = json(join(ROOT, "tools", "avatar", "fixtures", "northstar-wardrobe", "r1", "r1-plan-v1.json"));
export const CALL_IDS = Object.freeze(PLAN.calls.map((c) => c.callId));
const bg = [236, 233, 226], FIGB = [250, 0, 774, 1536];
// the review crops: neck/shoulders, both cuffs/hands, the chest pocket, both sides of the waist, the hands by the hips, the legs at the shoes
export const REVIEW = Object.freeze({ "neck/shoulders": [380, 420, 644, 560], "sleeve/arm left": [280, 520, 440, 700], "sleeve/arm right": [584, 520, 744, 700], "chest pocket": [420, 520, 604, 680],
  "waist left": [340, 730, 500, 880], "waist right": [524, 730, 684, 880], "hand left": [280, 780, 420, 960], "hand right": [604, 780, 744, 960], "leg/shoe": [330, 1290, 694, 1510] });
const checker = (P) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0, c = ((x >> 3) + (y >> 3)) % 2 ? 205 : 245, a = P[i * 4 + 3] / 255; for (let k = 0; k < 3; k++) o[i * 4 + k] = Math.round(P[i * 4 + k] * a + c * (1 - a)); o[i * 4 + 3] = 255; } return o; };
const union = (layers) => { const u = new Uint8ClampedArray(N * 4); for (const L of Object.values(layers)) for (let i = 0; i < N; i++) if (L[i * 4 + 3]) u.set(L.subarray(i * 4, i * 4 + 4), i * 4); return u; };

function prepare() { const w = WR.buildWardrobe(), base = BC.prepareBase(w, Uint8ClampedArray.from(decodePng(IP.readC()).px)), T = BC.templatesC(w, base, { revision: "d213" }); return { w, base, T }; }
const MEMO = new Map();
function itemOf(env, id) { if (MEMO.has(id)) return MEMO.get(id); const it = inputs("all").find((x) => x.id === id), buf = readFileSync(join(ART, ...it.raw.split("/")));
  if (sha(buf) !== it.rawSha256) throw new Error(id + ": the raw is not its pinned picture");
  const r0 = IP.processItem(env.w, env.base, env.T, it.category, Uint8ClampedArray.from(decodePng(buf).px), { itemId: id }); if (!r0.ok) throw new Error(id + ": not technically OK under d240");
  const v = { id, category: it.category, layers: r0.layers, shadow: r0.shadow, covering: r0.covering || "none" }; MEMO.set(id, v); return v; }
/** The cut's template, rebuilt from its pinned raw and checked against the canvas that was sent (its pinned sha256). */
export function templateOf(env, category) { const cut = PLAN.frozen.templates.cuts[category], src = itemOf(env, cut.from);
  const t = R1.templateFromLayers(src.layers, { shadow: src.shadow, covering: src.covering, category, cut: cut.cut });
  const canvas = sha(encodePng(W, H, R1.templateCanvas(t))); if (canvas !== cut.canvasSha256) throw new Error(category + ": the rebuilt template is not the canvas that was sent (" + canvas + ")");
  return { t, src }; }

/** The automatic measures beyond fixed alpha: real material over the core, the output's own outline inside the cut's contour
 *  (a second outline), partial-alpha material, paint outside. */
export function materialMeasures(out, t, reg) {
  const at = (i) => { const x = (i % W) - reg.dx, y = ((i / W) | 0) - reg.dy; return x >= 0 && x < W && y >= 0 && y < H ? y * W + x : -1; };
  const inner = WR.maskOps.dilate(Uint8Array.from(t.core, (v) => (v ? 0 : 1)), 8), band = WR.maskOps.dilate(Uint8Array.from(t.core, (v) => (v ? 0 : 1)), R1.LIMITS.contourPx);
  let partial = 0, opaque = 0, innerInk = 0, innerPx = 0;
  for (let i = 0; i < N; i++) { if (!t.core[i]) continue; const j = at(i); const a = j >= 0 ? out[j * 4 + 3] : 0; if (a >= 250) opaque++; else if (a >= 128) partial++;
    if (inner[i] && !band[i]) { innerPx++; if (j >= 0 && a >= 128 && BF.classify(out, j) === "ink") innerInk++; } }
  return { coreOpaqueShare: +(opaque / Math.max(1, t.corePx)).toFixed(4), corePartialAlphaPx: partial, secondOutlineInkPx: innerInk, secondOutlineBandPx: innerPx, secondOutlineShare: +(innerInk / Math.max(1, innerPx)).toFixed(4) };
}

function callDir(id) { return join(CALLS_DIR, id); }
function receivedImage(id) { const d = callDir(id), rc = join(d, "r1.receipt.json"); if (!existsSync(rc)) return null; const r = json(rc); if (r.verdict !== "RECEIVED_FOR_BF_CHECK") return { verdict: r.verdict };
  const buf = readFileSync(join(d, "r1.image-1.png")); if (sha(buf) !== r.image.sha256) throw new Error(id + ": the stored picture is not the one received"); return { verdict: r.verdict, buf, sha256: r.image.sha256 }; }

function evaluateCall(id) {
  const call = PLAN.calls.find((c) => c.callId === id); if (!call) throw new Error("--call-id must be one of " + CALL_IDS.join(", "));
  const rec = receivedImage(id); if (!rec) throw new Error(id + ": no receipt — nothing to evaluate"); const dir = callDir(id), recordF = join(dir, "r1.record.json");
  if (existsSync(recordF)) throw new Error(id + ": already evaluated (" + recordF + "); a record is never rewritten");
  if (rec.verdict !== "RECEIVED_FOR_BF_CHECK") { writeFileSync(recordF, JSON.stringify({ decision: "D-255", callId: id, verdict: rec.verdict, classification: "technically-rejected", reason: "format at receipt", stop: false }, null, 2) + "\n"); return; }
  const t0 = Date.now(), env = prepare(), { t, src } = templateOf(env, call.category), out = Uint8ClampedArray.from(decodePng(rec.buf).px);
  const comp = R1.compose(out, t, env.base), mm = materialMeasures(out, t, comp.registration), layer = union(comp.layers), dm = R1.designMeasure(layer, t);
  const fit = comp.ok ? R1.checkItem(env.w, env.base, env.T, t, comp.layers) : null, item = { category: call.category, layers: comp.layers, covering: t.covering, shadow: t.shadow };
  const outfits = {}, OD = join(dir, "review"); mkdirSync(OD, { recursive: true }); const tiles = [];
  if (comp.ok) { const others = Object.keys(PARTNERS).filter((c) => c !== call.category), [c1, c2] = others;
    for (const a of PARTNERS[c1]) for (const b of PARTNERS[c2]) { const P = Object.fromEntries([[c1, itemOf(env, a)], [c2, itemOf(env, b)]]);
      const order = (x) => ["top", "bottom", "shoes"].map((c) => (c === call.category ? x : P[c]));
      const n = R1.checkOutfit(env.w, env.base, order(item)), o = R1.checkOutfit(env.w, env.base, order(src)), name = [a, b].join("+");
      outfits[name] = { r1: { ok: n.ok, failed: n.failed }, template: { ok: o.ok, failed: o.failed }, same: n.ok === o.ok && n.failed.join() === o.failed.join(),
        combo2OnPattern: /houndstooth|pattern/.test(call.design) && n.failed.includes("COMBO-2-DOUBLE-CONTOUR") && !o.failed.includes("COMBO-2-DOUBLE-CONTOUR") };
      tiles.push(down(flat(n.proof.dressedRuntime, bg), 262, 768, FIGB)); } }
  // sheets: output | composed layer | map (holes red, paint outside orange, the cut's contour blue, a second outline magenta) | dressed on C
  const mk = new Uint8ClampedArray(flat(checker(layer), bg)), reg = comp.registration, inner = WR.maskOps.dilate(Uint8Array.from(t.core, (v) => (v ? 0 : 1)), 8), band = WR.maskOps.dilate(Uint8Array.from(t.core, (v) => (v ? 0 : 1)), R1.LIMITS.contourPx);
  for (let i = 0; i < N; i++) { const x = (i % W) - reg.dx, y = ((i / W) | 0) - reg.dy, j = x >= 0 && x < W && y >= 0 && y < H ? y * W + x : -1;
    if (comp.masks.hole[i] && t.core[i]) mk.set([230, 0, 0, 255], i * 4); else if (t.contour[i * 4 + 3]) mk.set([40, 90, 230, 255], i * 4);
    else if (t.core[i] && inner[i] && !band[i] && j >= 0 && out[j * 4 + 3] >= 128 && BF.classify(out, j) === "ink") mk.set([210, 0, 210, 255], i * 4);
    else if (!t.alpha[i] && j >= 0 && out[j * 4 + 3] >= 128) mk.set([255, 140, 0, 255], i * 4); }
  const min = BF.minimumItems(env.base.R, env.base.sep.lab), hide = t.covering === "closed-footwear" ? BC.closedFootwearHidden(env.base, comp.layers.shoes) : null;
  const dressed = BF.layerProof(env.w, env.base.R, env.base.Z, { ...min, ...comp.layers }, { sep: env.base.sep, headSeam: "d201", hide, enclosure: "c-exterior" }).dressedRuntime;
  const half = (P) => down(flat(P, bg), 262, 768, FIGB), g1 = grid([half(checker(out)), half(checker(layer)), half(mk), half(dressed)], 4, 10);
  writeFileSync(join(OD, "r1-sheet.png"), encodePng(g1.w, g1.h, g1.px));
  const g2 = grid(Object.values(REVIEW).map((b) => crop(flat(dressed, bg), b, 2)), 3, 6); writeFileSync(join(OD, "r1-review-x2.png"), encodePng(g2.w, g2.h, g2.px));
  const g3 = grid(Object.values(REVIEW).map((b) => crop(checker(out), b, 2)), 3, 6); writeFileSync(join(OD, "r1-output-x2.png"), encodePng(g3.w, g3.h, g3.px));
  if (tiles.length) { const g4 = grid(tiles, Math.min(4, tiles.length), 8); writeFileSync(join(OD, "r1-outfits.png"), encodePng(g4.w, g4.h, g4.px)); }
  const vals = Object.values(outfits), technicallyRejected = !comp.ok || !fit || !fit.ok;
  const record = { decision: "D-255", callId: id, category: call.category, cut: call.cut, imageSha256: rec.sha256, method: R1.R1_REVISION, production: IP.METHOD,
    registration: comp.registration, placement: comp.placement, measures: { ...comp.measures, ...mm }, design: dm, fit: fit ? { ok: fit.ok, failed: fit.failed } : null,
    outfits, outfitsSameAsTemplate: vals.filter((v) => v.same).length + "/" + vals.length, combo2OnPatternPx: vals.filter((v) => v.combo2OnPattern).length,
    stop: comp.registration.coverage < R1.LIMITS.stopCoverage,
    classification: technicallyRejected ? "technically-rejected" : "pending-visual-review",
    note: "automatic measures only; the visual review decides between automatically usable and requires a manual decision. Fixed alpha is not a correct item.",
    ms: Date.now() - t0, rssMB: Math.round(process.memoryUsage().rss / 1048576) };
  writeFileSync(recordF, JSON.stringify(record, null, 2) + "\n");
  console.log(id, record.placement, JSON.stringify(record.registration), "holes", comp.measures.holeCorePx, "fit", fit ? (fit.ok ? "OK" : fit.failed.join(",")) : "-", "outfits same", record.outfitsSameAsTemplate, "stop", record.stop, "→", record.classification);
}

function evaluateJoint() {
  const env = prepare(), got = {}; for (const id of CALL_IDS) { const r = join(callDir(id), "r1.record.json"); if (!existsSync(r)) continue; const rec = json(r); if (rec.classification === "technically-rejected") continue;
    const call = PLAN.calls.find((c) => c.callId === id), { t } = templateOf(env, call.category), img = receivedImage(id), comp = R1.compose(Uint8ClampedArray.from(decodePng(img.buf).px), t, env.base);
    got[call.category] = { id, category: call.category, layers: comp.layers, covering: t.covering, shadow: t.shadow }; }
  const res = { decision: "D-255", items: Object.fromEntries(Object.entries(got).map(([k, v]) => [k, v.id])), outfit: null };
  if (got.top && got.bottom && got.shoes) { const o = R1.checkOutfit(env.w, env.base, [got.top, got.bottom, got.shoes]); res.outfit = { ok: o.ok, failed: o.failed };
    const d = o.proof.dressedRuntime, g = grid([down(flat(d, bg), 262, 768, FIGB), ...Object.values(REVIEW).map((b) => crop(flat(d, bg), b, 1))], 5, 8); writeFileSync(join(CALLS_DIR, "r1-joint.png"), encodePng(g.w, g.h, g.px)); }
  writeFileSync(join(CALLS_DIR, "r1-joint.json"), JSON.stringify(res, null, 2) + "\n"); console.log("joint:", JSON.stringify(res));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2); try { if (a[0] === "--joint") evaluateJoint(); else if (a[0] === "--call-id" && a[1]) evaluateCall(a[1]); else throw new Error("usage: --call-id <R1-…> | --joint"); }
  catch (e) { console.error("REFUSED: " + e.message); process.exit(1); }
}
