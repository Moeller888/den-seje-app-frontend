// NORTHSTAR CLOTHING PILOT ON C (D-207) — processing of a generated item: registration on C, extraction against C, the layer
// split, the body/remnant checks and contract v3's fitCheck and quality; and the outfit combinations. It separates three kinds of
// fault: GENERATION (the model redrew the body, left the base garment, failed registration), EXTRACTION (paint the tool missed)
// and FIT (the item, correctly extracted, does not fit C). A technical pass is never the owner's visual approval.
//
// Nothing is painted, deformed or retouched: the item IS the generated pixels (after the established dust cleanup) where they
// differ from C inside the category's envelope; the raw result stays unchanged. C, its layers and every result stay OUTSIDE both
// clones (D-127 §2). C is read from <Documents>/DenSejeApp-artefacts/d-202-northstar-base-figure/ and verified by its hash.
// Usage: node tools/avatar/northstar-item-pilot.mjs --process <generated.png> --item <item id> --out <empty dir outside both clones>
//        node tools/avatar/northstar-item-pilot.mjs --combine <dir holding the processed item dirs> --out <empty dir outside both clones>
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { encodePng, decodePng } from "./r3-hair-tool-v2.mjs";
import * as NL from "./r3-northstar-layers.mjs";
import * as WR from "./northstar-wardrobe.mjs";
import * as BF from "./northstar-base-figure.mjs";
import * as BC from "./northstar-base-figure-c.mjs";
const classify = BF.classify;
import { flat, crop, down, grid } from "./northstar-wardrobe-poc.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DECISION = "D-207";
export const ITEMS = Object.freeze({ "top-tank-teal": "top", "top-tee-red": "top", "top-sweater-green": "top", "bottom-shorts-navy": "bottom", "bottom-trousers-khaki": "bottom", "bottom-skirt-plum": "bottom", "shoes-sandals-brown": "shoes", "shoes-sneakers-white": "shoes", "shoes-boots-black": "shoes" });
const { W, H, N } = WR, Mo = WR.maskOps, sha = (b) => createHash("sha256").update(b).digest("hex"), count = (m) => { let n = 0; for (let i = 0; i < N; i++) if (m[i]) n++; return n; };
export const CHANGE_TOL = 24;   // D-197's changeTol: a generated pixel differing from C by more than this has changed
export const STRONG_TOL = 40;   // D-210 (D-208: 60): new paint when no pixel of C within EXPLAIN_PX lies within this of it (see colourDist).
// Stage 1's redraw, measured outside the envelopes, stays explained within 2 px at 60 / 50 / 40 / 30 for 98.6 / 97.7 / 96.2 /
// 93.6 % (tank) and 99.1 / 98.9 / 98.2 / 96.6 % (shorts); 40 is the lowest that keeps ≥ 96 %, and a light garment is ≈ 58 from
// C's skin (253,195,124) — at 60 it would be explained away. A garment closer to skin than 40 is a known limit (manual review).
export const EXPLAIN_PX = 2;    // D-210: the model moves the body's contours by up to this much when it redraws it (see processItem)
export const LIMITS = Object.freeze({
  remnantShare: { value: 0.01, why: "the item must replace the base garment: more than 1 % of the base interior left identical to C means the base shows through the item (a generation fault)" },
});
const empty = () => new Uint8ClampedArray(N * 4);

/** C, read from outside both clones and verified by its pinned hash. */
export function readC() {
  const f = resolve(homedir(), "Documents", "DenSejeApp-artefacts", "d-202-northstar-base-figure", "d202-base-figure-v2.image-1.png"), buf = readFileSync(f);
  if (sha(buf) !== BC.C_RAW_SHA256) throw new Error("C does not match its pinned sha256"); return buf;
}
/** D-210: the larger of the largest channel difference (alpha included) and the chroma difference (R−G, G−B) — brown against a
 *  grey antialiased contour differs by only 50 in its largest channel but by 54 in chroma. */
export const colourDist = (O, i, C, j) => { let m = 0; for (let k = 0; k < 4; k++) m = Math.max(m, Math.abs(O[i * 4 + k] - C[j * 4 + k]));
  return Math.max(m, Math.abs((O[i * 4] - O[i * 4 + 1]) - (C[j * 4] - C[j * 4 + 1])), Math.abs((O[i * 4 + 1] - O[i * 4 + 2]) - (C[j * 4 + 1] - C[j * 4 + 2]))); };
/** D-214: C's own skin-shading floor — the 10th percentile of the red ratio of C's shaded skin pixels to C's base skin tone (the
 *  median skin colour of C's body); measured on C (cached on the prepared base), never on an item. */
export function shadeFloorC(base) {
  if (base._shadeFloor !== undefined) return base._shadeFloor; const C = base.R, sk = [];
  for (let i = 441 * W; i < N; i++) if ((base.body[i * 4 + 3] >= 250 || base.arms[i * 4 + 3] >= 250) && classify(C, i) === "skin") sk.push(i);
  const med = (c) => { const v = sk.map((i) => C[i * 4 + c]).sort((a, b) => a - b); return v[v.length >> 1] || 1; }, B = [med(0), med(1), med(2)];
  const kr = sk.map((i) => C[i * 4] / B[0]).filter((v) => v < 0.98).sort((a, b) => a - b);
  return (base._shadeFloor = kr.length ? kr[Math.floor(0.1 * (kr.length - 1))] : 1); }
/** D-214: multiply a skin-shadow layer onto a composed figure, only where the body or the arms are the topmost layer. */
export function applyShadow(composite, stack, shadow) {
  const o = new Uint8ClampedArray(composite);
  for (let i = 0; i < N; i++) { const a = shadow[i * 4 + 3]; if (!a) continue; let top = null; for (const [n, L] of stack) if (L[i * 4 + 3] >= 128) top = n; if (top !== "body" && top !== "arms") continue;
    for (let c = 0; c < 3; c++) o[i * 4 + c] = Math.round(composite[i * 4 + c] * (1 - a / 255 + (a / 255) * shadow[i * 4 + c] / 255)); }
  return o; }
const changedPx = (O, C, i) => { const a = O[i * 4 + 3], b = C[i * 4 + 3]; if (Math.abs(a - b) > CHANGE_TOL) return true; if (a < 128 && b < 128) return false; return [0, 1, 2].some((k) => Math.abs(O[i * 4 + k] - C[i * 4 + k]) > CHANGE_TOL); };

/** Process one generated picture of one item on a prepared base (C, or a stand-in in CI). */
export function processItem(w, base, T, category, raw) {
  if (T.revision !== "d213") throw new Error("processItem needs templatesC(w, base, { revision: \"d213\" })");
  const reg = BF.register(raw, w.fg.master), gen = [], ext = [], obs = {};
  if (!reg.ok) return { registration: reg, ok: false, faults: { generation: ["G-1 registration: the head does not register within ±6 px — never warped"], extraction: [], fit: [] } };
  const O = BF.dustCleaned(BF.shift(raw, reg.dx, reg.dy)), C = base.R, t = T[category];
  const changed = new Uint8Array(N); for (let i = 441 * W; i < N; i++) if (changedPx(O, C, i)) changed[i] = 1;
  let outside = 0, inProtect = 0, head = 0; for (let i = 0; i < N; i++) { if (i < 441 * W) { if (changedPx(O, C, i)) head++; continue; } if (!changed[i]) continue; if (t.protect[i]) inProtect++; else if (!t.allowed[i]) outside++; }
  let bodyPx = 0; for (let i = 441 * W; i < N; i++) if (C[i * 4 + 3] >= 128) bodyPx++;
  obs.bodyChangedOutsideEnvelopePx = outside; obs.protectedChangedPx = inProtect; obs.headChangedPx = head; obs.comparedBodyPx = bodyPx;
  // the item: generated pixels that differ from C inside the envelope (never in a protected region), plus the base interior
  const item = empty(), im = new Uint8Array(N), own = category === "top" ? 1 : category === "bottom" ? 2 : 0; let remnant = 0, mc = 0;
  // D-210 extraction (replaces D-208's 2 px opening, which removed every thin stripe — wanted straps and edges too — and still let
  // a 3 px body contour redrawn 2 px off through as a ≥ 5 px band). A generated pixel is NEW PAINT only if no pixel of C within
  // EXPLAIN_PX explains it (colourDist — channels incl. alpha, and chroma — above the tolerance for each of them): the model redraws the
  // whole body and moves its contours by up to 2 px (measured on stage 1 outside the envelopes, where nothing new belongs: see
  // STRONG_TOL), but a garment's colour over skin or background is explained by no shift of C. The item: (1) new paint (tolerance STRONG_TOL) inside the envelope, outside the protected regions; (2) the base
  // interior and the opaque pixels of THIS category's base garment (the base is gone at runtime); (3) the garment's outline and
  // antialias: new paint at CHANGE_TOL within 3 px of (1)/(2); (4) gaps up to 6 px inside it (closing by 3 px) — where an old body
  // contour crossed paint of nearly its darkness. (3) and (4) never reach into ANOTHER category's base garment: there the model
  // redraws that garment (a top's hem, the shorts' side seams), which is not this item. A base-interior pixel left unchanged and not
  // ink is a remnant of the base fabric (a generation fault, G-2).
  const near2 = new Uint8Array(N).fill(255); for (let i = 441 * W; i < N; i++) { if (!(t.allowed[i] || (t.handGuard && t.handGuard[i])) || O[i * 4 + 3] < 128) continue; const x = i % W; let best = 255;
    for (let dy = -EXPLAIN_PX; dy <= EXPLAIN_PX && best > 0; dy++) for (let dx = -EXPLAIN_PX; dx <= EXPLAIN_PX; dx++) { if (x + dx < 0 || x + dx >= W) continue; const j = i + dy * W + dx; if (j < 0 || j >= N) continue;
      const m = colourDist(O, i, C, j); if (m < best) best = m; }
    near2[i] = best; }
  const core = new Uint8Array(N), other = new Uint8Array(N); for (let i = 0; i < N; i++) if (base.sep.lab[i] && base.sep.lab[i] !== own) other[i] = 1;
  for (let i = 441 * W; i < N; i++) { if (t.mustCover[i]) { mc++; if (!changed[i] && classify(O, i) !== "ink") remnant++; }
    const inside = t.allowed[i] && !t.protect[i];
    if ((inside && O[i * 4 + 3] >= 128 && near2[i] > STRONG_TOL) || t.mustCover[i] || (own > 0 && base.sep.lab[i] === own && O[i * 4 + 3] >= 128)) core[i] = 1; }
  const closed = Mo.not(Mo.dilate(Mo.not(Mo.dilate(core, 3)), 3)), near = Mo.dilate(core, 3);
  const ruleOf = new Uint8Array(N);   // which rule took each item pixel: 1 new paint · 2 base interior / own base · 3 closing · 4 outline band · 6 edge from the picture · 7 enclosed hole (D-216)
  for (let i = 441 * W; i < N; i++) { if (O[i * 4 + 3] === 0) continue; const inside = t.allowed[i] && !t.protect[i] && !other[i];
    if (core[i] || (inside && closed[i]) || (inside && near[i] && near2[i] > CHANGE_TOL)) { item.set(O.subarray(i * 4, i * 4 + 4), i * 4); im[i] = 1; ruleOf[i] = core[i] ? (near2[i] > STRONG_TOL && O[i * 4 + 3] >= 128 ? 1 : 2) : closed[i] ? 3 : 4; } }
  // (5) the garment is the paint CONNECTED to it: to the base interior (a top, a bottom) or reaching C's sole line (shoes). A
  // detached piece of new paint is the body's contour redrawn more than EXPLAIN_PX off (a forearm, a knee, a toe line); it is
  // reported, never extracted. A detached piece thicker than a contour line (a pixel deeper than EXPLAIN_PX + 1 inside it) could be
  // garment the tool cannot place: E-2 for manual review — nothing is dropped silently.
  const compOf = new Int32Array(N).fill(-1), comps = [], sole = category === "shoes" ? t.soleRange : null;
  for (let s0 = 441 * W; s0 < N; s0++) { if (!im[s0] || compOf[s0] >= 0) continue; const q = [s0], px = []; compOf[s0] = comps.length; let keep = false, x0 = W, x1 = -1, y0 = H, y1 = -1;
    while (q.length) { const i = q.pop(); px.push(i); const x = i % W, y = (i / W) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      if (sole ? y >= sole[0] : t.mustCover[i]) keep = true;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const j = i + dy * W + dx; if (x + dx < 0 || x + dx >= W || j < 0 || j >= N) continue; if (im[j] && compOf[j] < 0) { compOf[j] = comps.length; q.push(j); } } }
    comps.push({ px, keep, box: [x0, y0, x1, y1] }); }
  const detachedM = new Uint8Array(N); let detachedPx = 0, detachedPieces = 0; for (const c of comps) { if (c.keep) continue; detachedPx += c.px.length; detachedPieces++; for (const i of c.px) { im[i] = 0; detachedM[i] = 1; item.fill(0, i * 4, i * 4 + 4); }
    // thicker than a contour line: some pixel lies more than EXPLAIN_PX + 1 inside the piece (a diagonal line has a square box)
    const inC = new Set(c.px), r = EXPLAIN_PX + 1, thick = c.px.some((i) => { const x = i % W; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (x + dx < 0 || x + dx >= W || !inC.has(i + dy * W + dx)) return false; return true; });
    if (thick) ext.push("E-2 detached paint (" + c.px.length + " px at x" + c.box[0] + " y" + c.box[1] + ") is thicker than a contour line and not connected to the garment — manual review"); }
  obs.detachedPaintPx = detachedPx; obs.detachedPieces = detachedPieces;
  // (6) a pixel the picture paints, next to the garment (≤ 3 px), where the runtime figure would show background (no body, no
  // arm, no other garment): the garment's own edge there — the model drew the foot or the limb a little wider than C, so the shift
  // test explained it away; it comes from the picture, never painted. D-213: the head counts as figure too — the runtime body is
  // empty under the head, and the rule took the generated neck skin beside a collar (the tee's FIT-6v2 strip)
  const ring = Mo.dilate(im, 3), headRt = BF.runtimeHead(w, base.body); let edgeFilled = 0;
  for (let i = 441 * W; i < N; i++) if (ring[i] && !im[i] && O[i * 4 + 3] >= 128 && t.allowed[i] && !t.protect[i] && !other[i] && base.body[i * 4 + 3] < 128 && base.arms[i * 4 + 3] < 128 && headRt[i * 4 + 3] < 128) { item.set(O.subarray(i * 4, i * 4 + 4), i * 4); im[i] = 1; ruleOf[i] = 6; edgeFilled++; }
  obs.edgeFromPicturePx = edgeFilled;
  // (7) D-216 ENCLOSED HOLES: a hole of the item wholly enclosed by the garment (4-connected, never reaching the canvas border
  // through non-item pixels) is the garment's own paint, taken from the picture — unless the hole shows the BODY: any pixel of it
  // the picture paints as skin that C explains (an opening — the toes in a sandal) keeps the whole hole C's. Black boots showed
  // why: their dark paint next to C's dark foot contours was explained by those contours, and C's foot skin showed through
  // specks along the soles (rule (4) closes only gaps up to 6 px). Never in a protected region or another category's base.
  { const out = new Uint8Array(N), st = [];
    const seed = (i) => { if (!im[i] && !out[i]) { out[i] = 1; st.push(i); } };
    for (let x = 0; x < W; x++) { seed(x); seed((H - 1) * W + x); } for (let y = 0; y < H; y++) { seed(y * W); seed(y * W + W - 1); }
    while (st.length) { const i = st.pop(), x = i % W; for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < N && Math.abs((j % W) - x) <= 1 && !im[j] && !out[j]) { out[j] = 1; st.push(j); } }
    const seen = new Uint8Array(N); let filledHoles = 0, openings = 0, holePx = 0;
    for (let s0 = 441 * W; s0 < N; s0++) { if (im[s0] || out[s0] || seen[s0]) continue; const q = [s0], px = []; seen[s0] = 1; let body = false;
      while (q.length) { const i = q.pop(); px.push(i); if (O[i * 4 + 3] >= 128 && classify(O, i) === "skin" && near2[i] <= STRONG_TOL) body = true; const x = i % W;
        for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < N && Math.abs((j % W) - x) <= 1 && !im[j] && !out[j] && !seen[j]) { seen[j] = 1; q.push(j); } }
      if (body) { openings++; continue; } filledHoles++;
      for (const i of px) if (O[i * 4 + 3] > 0 && t.allowed[i] && !t.protect[i] && !other[i]) { item.set(O.subarray(i * 4, i * 4 + 4), i * 4); im[i] = 1; ruleOf[i] = 7; holePx++; } }
    obs.enclosedHolesFilled = filledHoles; obs.enclosedHolePxFromPicture = holePx; obs.bodyOpenings = openings; }
  let unexplained = 0; for (let i = 441 * W; i < N; i++) if (!t.allowed[i] && !t.protect[i] && O[i * 4 + 3] >= 128 && changed[i]) { const x = i % W; let ok = false;
    for (let dy = -EXPLAIN_PX; dy <= EXPLAIN_PX && !ok; dy++) for (let dx = -EXPLAIN_PX; dx <= EXPLAIN_PX && !ok; dx++) { if (x + dx < 0 || x + dx >= W) continue; const j = i + dy * W + dx; if (j < 0 || j >= N) continue;
      if (colourDist(O, i, C, j) <= STRONG_TOL) ok = true; }
    if (!ok) unexplained++; }
  obs.unexplainedOutsideEnvelopePx = unexplained;
  // D-213 G-3: a top whose picture paints over C's HAND (below C's own wrist): new paint there, connected to the item, thicker
  // than a contour line — the generator drew the sleeve over the fingers; the hand stays the base's, so this is reported as a
  // generation fault, never extracted. (A redrawn hand — explained within EXPLAIN_PX — is only an observation, as before.)
  if (category === "top" && t.handGuard) {
    const hp = new Uint8Array(N); for (let i = 441 * W; i < N; i++) if (t.handGuard[i] && O[i * 4 + 3] >= 128 && near2[i] > STRONG_TOL) hp[i] = 1;
    const seen = new Uint8Array(N), touch = Mo.dilate(im, 1); let worst = 0, total = 0;
    for (let s0 = 0; s0 < N; s0++) { if (!hp[s0] || seen[s0]) continue; const q = [s0], px = []; seen[s0] = 1; let attached = false;
      while (q.length) { const i = q.pop(); px.push(i); if (touch[i]) attached = true; const x = i % W;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const j = i + dy * W + dx; if (x + dx < 0 || x + dx >= W || j < 0 || j >= N) continue; if (hp[j] && !seen[j]) { seen[j] = 1; q.push(j); } } }
      if (!attached) continue; total += px.length;
      const inC = new Set(px), r = EXPLAIN_PX + 1; if (px.some((i) => { const x = i % W; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (x + dx < 0 || x + dx >= W || !inC.has(i + dy * W + dx)) return false; return true; })) worst = Math.max(worst, px.length); }
    obs.newPaintOverHandPx = total;
    if (worst > 0) gen.push("G-3 the picture paints over C's hand (" + worst + " px of new paint connected to the sleeve, below C's wrist) — the hand stays the base's");
  }
  obs.baseRemnantPx = remnant; obs.baseRemnantShare = +(remnant / Math.max(1, mc)).toFixed(4);
  if (mc && remnant / mc > LIMITS.remnantShare.value) gen.push("G-2 base remnant: " + remnant + " px of the base interior unchanged from C (" + (100 * remnant / mc).toFixed(1) + " %)");
  // D-214 SKIN SHADOW: a shadow the garment casts on C's skin (the cast shadow under a cuff) is no fabric — baked into the fabric
  // layer it is C's skin tone, wrong on any other. It is kept as its own material, a MULTIPLY layer (the face's blush is one,
  // D-016/D-022: the body owns skin): an item pixel over C's skin, outside the base interior and this category's base, whose
  // colour is C's own skin there darkened the way C itself shades skin — every channel ratio k = O/C ≤ 1.02, red ≥ C's own
  // shading floor (its 10th percentile, measured on C; darker is contour antialias or brown garment paint), warm order
  // kR ≥ kG ≥ kB (± 0.02 / 0.04; khaki over skin has the opposite order) and darker than C (kR < 0.98). Its value is the multiply
  // factor 255·k; composed only where the body is the topmost layer, it reproduces the picture on C. Nothing is painted.
  const shade = shadeFloorC(base), shadow = empty(); let shadowPx = 0;
  for (let i = 441 * W; i < N; i++) { if (!im[i] || t.mustCover[i] || (own > 0 && base.sep.lab[i] === own) || O[i * 4 + 3] < 128) continue;
    if (!(base.body[i * 4 + 3] >= 250 || base.arms[i * 4 + 3] >= 250) || classify(C, i) !== "skin" || classify(O, i) !== "skin") continue;
    const k = [0, 1, 2].map((c) => O[i * 4 + c] / Math.max(1, C[i * 4 + c]));
    if (k.some((v) => v > 1.02) || k[0] < shade || k[0] >= 0.98 || k[0] < k[1] - 0.02 || k[1] < k[2] - 0.04) continue;
    shadow.set([...k.map((v) => Math.round(255 * Math.min(1, v))), O[i * 4 + 3]], i * 4); item.fill(0, i * 4, i * 4 + 4); im[i] = 0; shadowPx++; }
  obs.skinShadowPx = shadowPx;
  // the layer split: a top's pixels over C's arm pixels are sleeves, the rest its body
  let layers;
  if (category === "top") { const tb = empty(), sl = empty(); for (let i = 0; i < N; i++) if (im[i]) (base.arms[i * 4 + 3] >= 128 ? sl : tb).set(item.subarray(i * 4, i * 4 + 4), i * 4); layers = { topBody: tb, sleeves: sl }; }
  else layers = category === "bottom" ? { pants: item } : { shoes: item };
  const fit = BC.fitCheck(w, base, T, category, layers, { revision: "d213", shadow: shadowPx ? shadow : null });
  const failedFit = fit.checks.filter((c) => c.axis === "fit" && !c.ok);
  // EXTRACTION: a hole in the outfit where the generated picture has opaque paint means the tool missed the item, not the model
  const P = BF.layerProof(w, base.R, base.Z, { ...BF.minimumItems(base.R, base.sep.lab), ...layers }, { sep: base.sep, headSeam: "d201" });
  const missedM = new Uint8Array(N); let missedPaint = 0;   // P (below) also places the skin shadow for (let i = 0; i < N; i++) if (P.enclosed[i] && O[i * 4 + 3] >= 128) { missedPaint++; missedM[i] = 1; }
  if (missedPaint > 0) ext.push("E-1 " + missedPaint + " px of a hole lie where the generated picture has opaque paint — the extraction missed them");
  const fitFaults = failedFit.filter((c) => !(c.id === "FIT-4-COVERAGE" && missedPaint > 0)).map((c) => c.id + " " + JSON.stringify(c.value));
  return { masks: { ...(fit.masks || {}), missedPaint: missedM, detached: detachedM, ruleOf }, registration: reg, observations: obs, layers, shadow: shadowPx ? shadow : null, composite: shadowPx ? applyShadow(fit.composite, P.stack, shadow) : fit.composite, checks: fit.checks, fitOk: fit.fitOk, qualityOk: fit.qualityOk,
    faults: { generation: gen, extraction: ext, fit: fitFaults }, ok: gen.length === 0 && ext.length === 0 && fit.fitOk, O };
}

const bg = [236, 233, 226], FIGB = [250, 0, 774, 1536], half = (P) => down(flat(P, bg), 262, 768, FIGB);
const checker = (Q) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0, c = ((x >> 4) + (y >> 4)) & 1 ? 205 : 245, a = Q[i * 4 + 3] / 255; for (let k = 0; k < 3; k++) o[i * 4 + k] = Math.round(Q[i * 4 + k] * a + c * (1 - a)); o[i * 4 + 3] = 255; } return o; };
const CLOSE = { top: [[360, 420, 664, 620], [290, 600, 420, 980], [604, 600, 734, 980], [380, 720, 644, 860]], bottom: [[360, 740, 664, 900], [330, 880, 694, 1100], [330, 1100, 694, 1380]], shoes: [[330, 1300, 694, 1500]] };

export function processToDir(w, base, T, itemId, rawBuf, OUT) {
  if (!BF.isOutsideRepo(OUT)) throw new Error("refusing to write inside the repository (D-127 §2)");
  const category = ITEMS[itemId]; if (!category) throw new Error("unknown item " + itemId);
  const img = decodePng(rawBuf); if (!img.ok || !img.px || img.px.length !== N * 4) throw new Error("not a 1024×1536 RGBA PNG");
  const r = processItem(w, base, T, category, Uint8ClampedArray.from(img.px)), files = {};
  const save = (n, im, what) => { const b = encodePng(im.w, im.h, im.px); writeFileSync(join(OUT, n), b); files[n] = { sha256: sha(b), w: im.w, h: im.h, what }; };
  save("p01-raw-as-received.png", half(Uint8ClampedArray.from(img.px)), "the raw result, unchanged (shown flattened)");
  if (r.layers) {
    for (const [k, L] of Object.entries(r.layers)) writeFileSync(join(OUT, "layer-" + k + ".png"), encodePng(W, H, L));
    if (r.shadow) writeFileSync(join(OUT, "shadow-multiply.png"), encodePng(W, H, r.shadow));   // D-214: the skin shadow, its own material
    save("p02-item-layers.png", grid(Object.values(r.layers).map((L) => down(checker(L), 262, 768, FIGB)), Object.keys(r.layers).length), "the extracted layer(s) on a checkerboard: " + Object.keys(r.layers).join(" · "));
    save("p03-on-c.png", grid([half(r.composite), half(NL.overStack([r.O, w.head]))], 2), "the item on C's runtime body (contract order, other categories in the minimum items) beside the raw picture with the R3 head");
    const F = flat(r.composite, bg); save("p04-close-ups-x2.png", grid(CLOSE[category].map((b) => crop(F, b, 2)), CLOSE[category].length > 2 ? 2 : CLOSE[category].length), "the seams ×2");
    const D = flat(r.O, bg); const C = base.R; for (let i = 441 * W; i < N; i++) if (changedPx(r.O, C, i) && !T[category].allowed[i]) D.set([255, 0, 0, 255], i * 4);
    save("p05-body-changes.png", half(D), "red: pixels outside the item's envelope that differ from C by more than " + CHANGE_TOL + " (the body redrawn by the model)");
    save("p06-app-sizes.png", grid([down(flat(r.composite, bg), 110, 165), down(flat(r.composite, bg), 52, 78)], 2, 6), "hub 110×165 and quiz 52×78");
  }
  const report = { decision: DECISION, method: "D-216 extraction (D-214 + enclosed holes) + fitCheck revision d213", item: itemId, category, raw: { sha256: sha(rawBuf) }, registration: r.registration, ok: r.ok, observations: r.observations || null, faults: r.faults,
    checks: (r.checks || []).map(({ axis, id, ok, value }) => ({ axis, id, ok, value })), note: "A technical pass is never the owner's visual approval.", files };
  writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2) + "\n");
  return report;
}

/** The 3 × 3 × 3 outfits on C. A missing or rejected item is replaced by the minimum item of its category and MARKED: each tile
 *  carries three bars (top, bottom, shoes): green = the item passed FIT, orange = shown but failed FIT, grey = missing (minimum).
 *  D-210: a placeholder is hatched in the picture too, and every outfit of generated items only is saved on its own (c03-…). */
export function combine(w, base, processed, OUT) {
  if (!BF.isOutsideRepo(OUT)) throw new Error("refusing to write inside the repository (D-127 §2)");
  const min = BF.minimumItems(base.R, base.sep.lab), cats = { top: [], bottom: [], shoes: [] };
  for (const [id, cat] of Object.entries(ITEMS)) cats[cat].push(processed[id] || null);
  const tiles = [], index = [];
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) for (let c = 0; c < 3; c++) {
    const picks = [cats.top[a], cats.bottom[b], cats.shoes[c]], it = { ...min }, marks = [];
    for (const p of picks) { if (p && p.layers) Object.assign(it, p.layers); marks.push(!p || !p.layers ? [150, 150, 150] : p.ok ? [40, 170, 80] : [240, 140, 0]); }
    const Pc = BF.layerProof(w, base.R, base.Z, it, { sep: base.sep, headSeam: "d201" }); let composed = Pc.dressedRuntime;
    for (const p of picks) if (p && p.layers && p.shadow) composed = applyShadow(composed, Pc.stack, p.shadow);   // D-214: each item's skin shadow
    // D-210: a PLACEHOLDER (C's own base garment, not a generated item) is hatched diagonally, so no tile passes for a tried outfit
    // (D-212: light stripes — dark ones vanished on the dark grey base shorts)
    const hatchOf = { 0: [min.topBody], 1: [min.pants], 2: [] }; picks.forEach((p, k) => { if (p && p.layers) return; for (const Lr of hatchOf[k]) for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0; if (Lr[i * 4 + 3] >= 128 && composed[i * 4 + 3] >= 128 && (x + y) % 12 < 4) composed.set([245, 245, 245, 255], i * 4); } });
    if (picks.every((p) => p && p.layers)) { const F = flat(composed, bg), im = grid([half(composed), crop(F, CLOSE.top[0], 2), crop(F, CLOSE.bottom[1], 2), crop(F, CLOSE.shoes[0], 2), down(F, 110, 165), down(F, 52, 78)], 3, 8);
      writeFileSync(join(OUT, "c03-generated-outfit-" + picks.map((p) => p.item).join("+") + ".png"), encodePng(im.w, im.h, im.px)); }
    const tile = half(composed);
    marks.forEach((rgb, k) => { for (let y = 2; y < 10; y++) for (let x = 4 + k * 86; x < 84 + k * 86; x++) tile.px.set([...rgb, 255], (y * tile.w + x) * 4); });
    tiles.push(tile); index.push(picks.map((p) => (p && p.layers ? p.item + (p.ok ? "" : " (failed)") : "missing → placeholder (C's base garment)")));
  }
  const g = grid(tiles, 9), b = encodePng(g.w, g.h, g.px); writeFileSync(join(OUT, "c01-27-outfits.png"), b);
  const app = grid(tiles.map((t) => t), 9);
  const generated = index.filter((o) => o.every((x) => !x.startsWith("missing"))).length;
  writeFileSync(join(OUT, "c02-27-outfits-index.json"), JSON.stringify({ legend: "bars per tile: top · bottom · shoes — green passed FIT, orange shown but failed FIT, grey missing: a PLACEHOLDER (C's own base garment, hatched diagonally), not a generated item", tilesWithOnlyGeneratedItems: generated, tilesWithPlaceholders: index.length - generated, outfits: index }, null, 2) + "\n");
  return { tiles: tiles.length, generated: index.filter((o) => o.every((x) => !x.startsWith("missing"))).length, sha256: sha(b), index };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const a = process.argv.slice(2), oi = a.indexOf("--out"), pi = a.indexOf("--process"), ii = a.indexOf("--item"), ci = a.indexOf("--combine"), OUT = oi >= 0 && a[oi + 1] ? resolve(a[oi + 1]) : null;
  if (!OUT || (pi < 0 && ci < 0)) { console.error("usage: --process <png> --item <id> --out <dir> | --combine <dir> --out <dir>"); process.exit(1); }
  if (!BF.isOutsideRepo(OUT)) { console.error("REFUSED: --out is inside the repository (D-127 §2)"); process.exit(1); }
  if (existsSync(OUT) && readdirSync(OUT).length) { console.error("--out must be empty"); process.exit(1); } mkdirSync(OUT, { recursive: true });
  const w = WR.buildWardrobe(), base = BC.prepareBase(w, Uint8ClampedArray.from(decodePng(readC()).px)), T = BC.templatesC(w, base, { revision: "d213" });
  if (pi >= 0) { const r = processToDir(w, base, T, a[ii + 1], readFileSync(resolve(a[pi + 1])), OUT); console.log(JSON.stringify({ item: r.item, ok: r.ok, faults: r.faults, observations: r.observations }, null, 2)); }
  else {
    const root = resolve(a[ci + 1]), processed = {};
    for (const d of readdirSync(root)) { const rp = join(root, d, "report.json"); if (!existsSync(rp)) continue; const r = JSON.parse(readFileSync(rp, "utf8")); const layers = {};
      for (const f of readdirSync(join(root, d))) if (f.startsWith("layer-")) layers[f.slice(6, -4)] = Uint8ClampedArray.from(decodePng(readFileSync(join(root, d, f))).px);
      const sp = join(root, d, "shadow-multiply.png"), shadow = existsSync(sp) ? Uint8ClampedArray.from(decodePng(readFileSync(sp)).px) : null;
      processed[r.item] = { item: r.item, ok: r.ok, layers: Object.keys(layers).length ? layers : null, shadow }; }
    console.log(JSON.stringify(combine(w, base, processed, OUT).index.length));
  }
}
