// D-270 — INDEPENDENT VALIDATION OF LARGE CENTRAL TEE PRINTS: the lock, the delivery checks, the contrast check and the evaluation (no
// image call here; the send adapter is openai-send-northstar-tee-print-validation-d270.mjs). Three separate deliveries, one motif each, on a
// transparent background: a single animal, a single object, a single emblem. Each is placed by D-269's UNCHANGED rule in D-269's
// chest-center box on the UNCHANGED D-264 master (northstar-tee-print-family.mjs is imported, never copied or adjusted).
// THE LOCK: the master's fingerprint on C and the tracked modules' sha256 (the plan pins them); the evaluation refuses any difference.
// Nothing of the master, the box, the size rule, the mapping or the checks is changed after receipt; no motif is retouched.
// THE DELIVERY CHECKS (on the delivered 1024x1024 image alone): D-267's print checks (transparent border and background, sizeable, few
// semi-transparent pixels, no light fringe, no shadow or glow, no specks, flat colours) plus the compact-motif checks this experiment asks
// for: one single shape (exactly one significant component — no loose stars or separate decorations), a compact format (aspect of the
// visible box within ACCEPT.aspect) and no broad sparse decoration (ink share of the visible box >= ACCEPT.inkShareMin). Text and small
// face details are VISUAL criteria; no check claims to find them.
// THE CONTRAST CHECK (general, per motif and shirt colour; advisory — never a text-contrast pass mark): a motif pixel is SEEN against the
// shirt when its OKLab distance to the shirt colour is >= CONTRAST.seenDE, and STRONGLY seen at >= CONTRAST.strongDE. visibleShare and
// strongShare = those shares of the motif's opaque area (its colour fields); silhouette = the share of the motif's EDGE within
// CONTRAST.bridge x size of a seen pixel (an outline that matches the shirt, inside a seen fill, does not break the silhouette).
// clear / borderline / weak by the thresholds below; borderline (a faint or partial separation) goes to visual review, weak is reported
// as a poor combination, and clear is NOT a pass: every combination is judged visually.
// Usage:
//   node tools/avatar/northstar-tee-print-validation.mjs --study --out <dir outside the repo>       the pipeline on the planet and SYNTHETIC examples (needs C)
//   node tools/avatar/northstar-tee-print-validation.mjs --from-calls --out <dir outside the repo>  evaluate the received calls (needs C)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { encodePng, decodePng } from "./r3-hair-tool-v2.mjs";
import * as WR from "./northstar-wardrobe.mjs";
import * as BF from "./northstar-base-figure.mjs";
import * as BC from "./northstar-base-figure-c.mjs";
import * as IP from "./northstar-item-pilot.mjs";
import * as R1 from "./northstar-r1-garment.mjs";
import * as S1 from "./northstar-r1-similarity.mjs";
import * as RC from "./northstar-r1c-evaluate.mjs";
import * as M1 from "./northstar-r1-material.mjs";
import * as TM from "./northstar-tee-master.mjs";
import * as TMM from "./northstar-tee-material.mjs";
import * as PF from "./northstar-tee-print-family.mjs";
import { fromItem } from "./northstar-r1-material-study.mjs";
import { flat, crop, grid, down } from "./northstar-wardrobe-poc.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const ART = join(homedir(), "Documents", "DenSejeApp-artefacts"), CALLS_DIR = join(ART, "tp-validation-calls"), { W, N } = WR;
const sha = (b) => createHash("sha256").update(b).digest("hex");

export const REVISION = "tpv-v1";
export const PLAN_FILE = "tools/avatar/fixtures/northstar-wardrobe/tee-master/tp-validation-plan-v1.json";
export const CALL_IDS = Object.freeze({ animal: "TPV-1-tee-print-animal-fox", object: "TPV-2-tee-print-object-teapot", emblem: "TPV-3-tee-print-emblem-shield" });
/** D-269's candidate, unchanged: the chest-center box and the size rule (read from the family module, never restated). */
export const PLACEMENT = "chest-center";
/** The fixed shirt colours (cream is the cut's own fabric, measured on C). */
export const COLOURS = Object.freeze({ cream: null, heather: [158, 160, 164], navy: [38, 50, 92], coral: [214, 96, 82], forest: [46, 94, 62], mustard: [222, 172, 58] });
export const ACCEPT = Object.freeze({ aspect: [0.6, 1 / 0.6], inkShareMin: 0.45, components: 1 });
export const CONTRAST = Object.freeze({ seenDE: 0.1, strongDE: 0.15, bridge: 0.03, clear: { silhouette: 0.95, visibleShare: 0.6, strongShare: 0.7 }, weak: { silhouette: 0.8, visibleShare: 0.25 } });
export const VISUAL = Object.freeze([
  "110x165: the motif's main form is recognised (what it is: the animal, the object, the emblem) — the face and small details are not required",
  "52x78: the motif reads as a small graphic mark (a distinct shape and colour on the shirt), not as a smudge",
  "close-up (2x): Northstar's drawn quality — even bold outline, flat cel colours, clean edges, no colour rim, no halo, no shadow",
  "the motif itself: one compact shape, a strong silhouette, few large colour fields; no text, no small face details, no loose stars or broad decoration",
  "each shirt colour: the silhouette and the main colour fields hold against the shirt; the contrast class is advisory and never a pass",
  "placement: balanced on the chest under the neck rib, nothing cut, clear of the seams and armpits (D-269's box, unchanged)",
]);
export const KNOWN_LIMITS = Object.freeze([
  "D-264/D-269: the master's displacement gives large prints slightly wavy outlines and nearest-sample steps; the chest is drawn flat, so a print does not follow folds",
  "D-269: a small light speck at the neck rib on the plain shirt (not from the prints)",
  "D-269: the chest-center box is wider than tall (150 x 135 px on C); a motif's format decides how much of the box it gets",
  "the contrast check measures colour separation from the shirt; it does not judge legibility, appeal or style",
]);

// ── OKLab and the contrast check ─────────────────────────────────────────────────────────────────────────────────────────
export function oklab([r, g, b]) {
  const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }, R = f(r), G = f(g), B = f(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B), m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B), s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
export const deltaE = (a, b) => { const p = oklab(a), q = oklab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
const dilate = (m, w, h, r) => { const t = new Uint8Array(w * h), o = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 0; for (let d = -r; d <= r && !v; d++) { const u = x + d; if (u >= 0 && u < w && m[y * w + u]) v = 1; } t[y * w + x] = v; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 0; for (let d = -r; d <= r && !v; d++) { const u = y + d; if (u >= 0 && u < h && t[u * w + x]) v = 1; } o[y * w + x] = v; } return o; };

/** The contrast check of a prepared print against a shirt colour (advisory): visibleShare = the seen share of the motif's area (its
 *  colour fields); silhouette = the share of the motif's EDGE (opaque pixels next to the outside) within the bridge of a seen pixel. */
export function contrastCheck(p, shirt) {
  const n = p.w * p.h, A = new Uint8Array(n), V = new Uint8Array(n); let a = 0, v = 0, st = 0;
  for (let i = 0; i < n; i++) if (p.px[i * 4 + 3] >= 128) { A[i] = 1; a++; const d = deltaE([p.px[i * 4], p.px[i * 4 + 1], p.px[i * 4 + 2]], shirt); if (d >= CONTRAST.seenDE) { V[i] = 1; v++; } if (d >= CONTRAST.strongDE) st++; }
  const r = Math.max(2, Math.round(CONTRAST.bridge * Math.max(p.w, p.h))), D = dilate(V, p.w, p.h, r); let e = 0, s = 0;
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) { const i = y * p.w + x; if (!A[i]) continue; const edge = x === 0 || y === 0 || x === p.w - 1 || y === p.h - 1 || !A[i - 1] || !A[i + 1] || !A[i - p.w] || !A[i + p.w]; if (!edge) continue; e++; if (D[i]) s++; }
  const visibleShare = a ? v / a : 0, strongShare = a ? st / a : 0, silhouette = e ? s / e : 0, C = CONTRAST;
  const cls = silhouette < C.weak.silhouette || visibleShare < C.weak.visibleShare ? "weak" : silhouette >= C.clear.silhouette && visibleShare >= C.clear.visibleShare && strongShare >= C.clear.strongShare ? "clear" : "borderline";
  return { visibleShare: +visibleShare.toFixed(3), strongShare: +strongShare.toFixed(3), silhouette: +silhouette.toFixed(3), bridgePx: r, class: cls };
}

// ── the delivery checks ─────────────────────────────────────────────────────────────────────────────────────────────────
/** D-267's print checks plus the compact-motif checks (single shape, compact format, no broad sparse decoration). */
export function deliveryChecks(img) {
  const base = TMM.printChecks(img); if (!base.checks) return { ok: false, problems: base.problems, checks: {}, measures: {} };
  const v = PF.visible(img), aspect = v.box[2] / v.box[3], inkShare = v.ink / (v.box[2] * v.box[3]);
  const checks = { ...base.checks, singleShape: base.measures.components === ACCEPT.components, compactFormat: aspect >= ACCEPT.aspect[0] && aspect <= ACCEPT.aspect[1], noBroadDecoration: inkShare >= ACCEPT.inkShareMin };
  const problems = Object.entries(checks).filter(([, x]) => !x).map(([k]) => k);
  return { ok: problems.length === 0, problems, checks, measures: { ...base.measures, aspect: +aspect.toFixed(3), inkShareOfBox: +inkShare.toFixed(3), visibleBox: v.box } };
}

// ── SYNTHETIC examples (format and contrast), never designs ─────────────────────────────────────────────────────────────────
/** SYNTHETIC delivery examples on 1024x1024: a compact positive and negatives for each compact check. */
export function deliveryExamples() {
  const n = 1024, cov = (d) => Math.min(1, Math.max(0, 0.5 - d)), NAVY = [24, 34, 74];
  const paint = (shapes) => { const px = new Uint8ClampedArray(n * n * 4); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const X = x + 0.5, Y = y + 0.5; let c = [0, 0, 0], al = 0;
    for (const [sd, fill, ow] of shapes) { const d = sd(X, Y), ao = cov(d), af = cov(d + ow); if (ao > 0) { const mix = (col, a) => { c = c.map((k, q) => (col[q] * a + k * al * (1 - a)) / (a + al * (1 - a) || 1)); al = a + al * (1 - a); }; mix(NAVY, ao); if (af > 0) mix(fill, af); } }
    px.set([...c.map(Math.round), Math.round(al * 255)], (y * n + x) * 4); } return { w: n, h: n, px }; };
  const disc = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) - r, rect = (cx, cy, hw, hh) => (x, y) => Math.max(Math.abs(x - cx) - hw, Math.abs(y - cy) - hh), ring = (cx, cy, r, t) => (x, y) => Math.abs(Math.hypot(x - cx, (y - cy) * 3) - r) - t;
  return {
    "P-compact disc (SYNTHETIC)": { img: paint([[disc(512, 512, 380), [232, 120, 52], 18]]), pass: true },
    "N-loose stars (separate decorations)": { img: paint([[disc(512, 560, 320), [232, 120, 52], 18], [disc(170, 170, 40), [250, 214, 72], 10], [disc(860, 180, 34), [250, 214, 72], 10]]), pass: false, fails: "singleShape" },
    "N-wide banner (not compact)": { img: paint([[rect(512, 512, 400, 120), [64, 186, 190], 18]]), pass: false, fails: "compactFormat" },
    "N-broad sparse ring (decoration makes the motif small)": { img: paint([[ring(512, 512, 400, 16), [64, 186, 190], 6], [disc(512, 512, 90), [232, 120, 52], 12]]), pass: false, fails: "noBroadDecoration" },
  };
}
/** SYNTHETIC contrast examples (prepared size, about the box): expected class per shirt colour. */
export function contrastExamples() {
  const n = 128, mk = (fill, outline, ow = 3) => { const px = new Uint8ClampedArray(n * n * 4); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const d = Math.hypot(x + 0.5 - 64, y + 0.5 - 64) - 56; if (d > 0) continue; px.set([...(d > -ow ? outline : fill), 255], (y * n + x) * 4); } return { w: n, h: n, px }; };
  const ORANGE = [232, 120, 52], NAVY = [24, 34, 74], WHITE = [246, 244, 238], TEAL = [64, 186, 190], CORAL = [214, 96, 82];
  const half = (a, b) => { const im = mk(a, NAVY); for (let y = 0; y < n; y++) for (let x = 64; x < n; x++) { const i = (y * n + x) * 4; if (im.px[i + 3] && Math.hypot(x + 0.5 - 64, y + 0.5 - 64) < 53) im.px.set([...b, 255], i); } return im; };
  return [
    { name: "orange disc, navy outline on cream", img: mk(ORANGE, NAVY), shirt: [250, 238, 210], expect: "clear" },
    { name: "orange disc, navy outline on navy (the outline merges, the fill carries the silhouette)", img: mk(ORANGE, NAVY), shirt: [38, 50, 92], expect: "clear" },
    { name: "navy disc, navy outline on navy (nothing is seen)", img: mk(NAVY, NAVY), shirt: [38, 50, 92], expect: "weak" },
    { name: "off-white disc, navy outline on cream (only the thin outline is seen)", img: mk(WHITE, NAVY), shirt: [250, 238, 210], expect: "weak" },
    { name: "orange disc, navy outline on coral (the fill merges, only the outline holds)", img: mk(ORANGE, NAVY), shirt: CORAL, expect: "weak" },
    { name: "half teal, half coral disc, navy outline on coral (half the fill merges, the outline holds)", img: half(TEAL, CORAL), shirt: CORAL, expect: "borderline" },
    { name: "light-orange disc, navy outline on coral (the fill is seen, but only faintly)", img: mk([236, 140, 52], NAVY), shirt: CORAL, expect: "borderline" },
    { name: "coral disc with no outline, a teal centre, on coral (the edge merges)", img: (() => { const im = mk(CORAL, CORAL); for (let i = 0; i < n * n; i++) { const x = i % n, y = (i / n) | 0; if (Math.hypot(x + 0.5 - 64, y + 0.5 - 64) < 30) im.px.set([...TEAL, 255], i * 4); } return im; })(), shirt: CORAL, expect: "weak" },
  ];
}

// ── the evaluation on C ──────────────────────────────────────────────────────────────────────────────────────────────────
function prepareC() { const w = WR.buildWardrobe(), base = BC.prepareBase(w, Uint8ClampedArray.from(decodePng(IP.readC()).px)), T = BC.templatesC(w, base, { revision: "d213" }); return { w, base, T }; }
function plan() { return JSON.parse(readFileSync(join(ROOT, ...PLAN_FILE.split("/")), "utf8")); }
/** The lock: the tracked modules' bytes and the master's fingerprint on C. */
export function verifyLock(pl, fingerprint) {
  const problems = []; for (const [rel, want] of Object.entries(pl.lock.modules)) { let got = null; try { got = sha(readFileSync(join(ROOT, ...rel.split("/")))); } catch (_) { /* missing */ } if (got !== want) problems.push(rel + ": " + got + ", locked " + want); }
  if (fingerprint !== undefined && fingerprint !== pl.lock.masterFingerprint) problems.push("the master's fingerprint " + fingerprint + " is not the locked " + pl.lock.masterFingerprint);
  return problems;
}
function outDir(OUT) { const r = relative(ROOT, resolve(OUT || ".")); if (!OUT || !(r.startsWith("..") || isAbsolute(r))) throw new Error("--out must be outside the repository (the sheets show C)"); mkdirSync(OUT, { recursive: true }); return OUT; }
const FIGURE_CROP = [380, 450, 644, 830], CLOSE_CROP = [420, 510, 604, 690];
const nearest = (im, k) => { const o = new Uint8ClampedArray(im.w * k * im.h * k * 4); for (let y = 0; y < im.h * k; y++) for (let x = 0; x < im.w * k; x++) o.set(im.px.subarray((((y / k) | 0) * im.w + ((x / k) | 0)) * 4, (((y / k) | 0) * im.w + ((x / k) | 0)) * 4 + 4), (y * im.w * k + x) * 4); return { w: im.w * k, h: im.h * k, px: o }; };
const onBg = (im, bg) => { const o = new Uint8ClampedArray(im.w * im.h * 4); for (let i = 0; i < im.w * im.h; i++) { const a = im.px[i * 4 + 3] / 255; for (let c = 0; c < 3; c++) o[i * 4 + c] = Math.round(im.px[i * 4 + c] * a + bg[c] * (1 - a)); o[i * 4 + 3] = 255; } return { w: im.w, h: im.h, px: o }; };

/** The same pipeline for the received calls and for the study: delivery checks, D-269's rule in its box, every shirt colour, the sheets,
 *  the preview and the record. motifs: { key: { label, img, receipt? } }. */
function evaluate(OUT, motifs, kind) {
  outDir(OUT); if (existsSync(join(OUT, "record.json"))) throw new Error("already evaluated into " + OUT + "; a record is never rewritten");
  const pl = plan(), lockFiles = verifyLock(pl); if (lockFiles.length) throw new Error("the lock does not hold: " + lockFiles.join("; "));
  const env = prepareC(), { w, base, T } = env, { t, src, cl } = RC.cutOf(env), master = TM.buildMaster(t, src), fp = TMM.masterFingerprint(master, t, cl.band), lockFp = verifyLock(pl, fp); if (lockFp.length) throw new Error("the lock does not hold: " + lockFp.join("; "));
  const g = S1.geometry(t.core), box = PF.placementBox(g, PLACEMENT), bg = [236, 233, 226], min = BF.minimumItems(base.R, base.sep.lab), dressed = (layers) => BF.layerProof(w, base.R, base.Z, { ...min, ...layers }, { sep: base.sep, headSeam: "d201", enclosure: "c-exterior" }).dressedRuntime;
  const clr = PF.clearance(master, t, cl.band, base.arms);
  const cream = (() => { const s = M1.flatten(fromItem(env, "top-tee-hip-cream", "topBody")); return [0, 1, 2].map((k) => { const a = []; for (let i = 0; i < s.w * s.h; i++) a.push(s.px[i * 4 + k]); a.sort((x, y) => x - y); return a[a.length >> 1]; }); })();
  const colours = Object.fromEntries(Object.entries(COLOURS).map(([k, v]) => [k, v || cream])), plain = Object.fromEntries(Object.entries(colours).map(([k, c]) => [k, TM.render(master, t, base, cl.band, { body: c })]));
  const alphaSame = (a, b) => { for (let i = 0; i < N; i++) if (a[i * 4 + 3] !== b[i * 4 + 3]) return false; return true; };
  const record = { decision: "D-270", revision: REVISION, kind, fingerprint: fp, placement: { name: PLACEMENT, spec: PF.PLACEMENTS[PLACEMENT], box, minClearance: (() => { let m = 1e9; for (let y = box[1]; y < box[1] + box[3]; y++) for (let x = box[0]; x < box[0] + box[2]; x++) m = Math.min(m, clr[y * W + x]); return m; })() },
    rule: PF.RULE, contrast: CONTRAST, accept: ACCEPT, colours, motifs: {}, renders: {}, visual: VISUAL, knownLimits: KNOWN_LIMITS, visualIsNeverAutomatic: true, approved: "nothing" };
  mkdirSync(join(OUT, "preview"), { recursive: true }); const save = (n, im) => writeFileSync(join(OUT, n), encodePng(im.w, im.h, im.px));
  const raw = [], torsos = [], apps = [], appsX3 = [], closes = []; let fitDone = false;
  for (const [key, m] of Object.entries(motifs)) {
    if (!m.img) { record.motifs[key] = { label: m.label, receipt: m.receipt || null, delivered: false, classification: "technically-rejected", reason: "no image (" + (m.receipt || "not received") + ")" }; continue; }
    const dc = deliveryChecks(m.img), prep = PF.prepareFor(m.img, [box[2], box[3]]), fr = PF.fringe(prep.img), pv = PF.visible(prep.img);
    record.motifs[key] = { label: m.label, imageSha256: m.sha256 || null, receipt: m.receipt || null, delivered: true, delivery: dc, classification: dc.ok ? "requires-visual-review" : "delivery-rejected (kept and shown)",
      prepared: { size: [prep.img.w, prep.img.h], limitedBy: prep.size.limitedBy, app: PF.APP_SIZES.map(([aw]) => [+(pv.box[2] * aw / W).toFixed(1), +(pv.box[3] * aw / W).toFixed(1)]), fringe: fr }, colours: {}, visualReview: "PENDING — never automatic" };
    raw.push(onBg(TMM.resample(m.img, 256, 256, { samples: 4 }), [128, 128, 128]), onBg(TMM.resample(m.img, 256, 256, { samples: 4 }), [250, 250, 250]), onBg(TMM.resample(m.img, 256, 256, { samples: 4 }), [20, 20, 30]));
    for (const [cName, col] of Object.entries(colours)) {
      const L = PF.placePrint(master, t, base, plain[cName].layer, prep.img, box); let fMin = 1e9; for (const i of L.footprint) fMin = Math.min(fMin, clr[i]);
      const checks = { alphaUnchanged: alphaSame(L.layer, plain[cName].layer), footprintInSafeArea: fMin >= 1, offContour: L.onContour === 0, notClipped: L.mass / pv.ink >= 0.97, noFringe: fr.ok };
      if (!fitDone) { const f = R1.checkItem(w, base, T, t, L.layers); record.fit = { ok: f.ok, failed: f.failed }; fitDone = true; }
      const cc = contrastCheck(prep.img, col), k = key + "-" + cName;
      record.motifs[key].colours[cName] = { contrast: cc, checks, placementOk: Object.values(checks).every(Boolean) };
      const on = flat(dressed(L.layers), bg), torso = crop(on, FIGURE_CROP, 1), close = crop(on, CLOSE_CROP, 2), a110 = down(on, 110, 165), a52 = down(on, 52, 78);
      for (const [s, im] of [["torso", crop(on, FIGURE_CROP, 2)], ["close", close], ["app110", a110], ["app52", a52]]) save(join("preview", k + "-" + s + ".png"), im);
      record.renders[k] = { motif: key, colour: cName, contrast: cc.class, visibleShare: cc.visibleShare, silhouette: cc.silhouette, placementOk: record.motifs[key].colours[cName].placementOk, delivery: record.motifs[key].classification };
      torsos.push(torso); closes.push(close); apps.push(a110, a52); appsX3.push(nearest(a110, 3), nearest(a52, 3));
    }
  }
  const nC = Object.keys(colours).length;
  if (raw.length) { save("tpv-raw.png", grid(raw, 3, 8)); save("tpv-torsos.png", grid(torsos, nC, 6)); save("tpv-closeups-x2.png", grid(closes, nC, 6)); save("tpv-app-actual.png", grid(apps, nC * 2, 4)); save("tpv-app-x3.png", grid(appsX3, nC * 2, 6)); }
  record.sheets = { "tpv-raw.png": "each motif on grey, light and dark (rows: motifs)", "tpv-torsos.png": "rows: motifs; columns: " + Object.keys(colours).join(", ") + "; torso 1x",
    "tpv-closeups-x2.png": "the same order; print and neck rib at 2x", "tpv-app-actual.png": "the same order; per colour 110x165 then 52x78 at ACTUAL size", "tpv-app-x3.png": "as tpv-app-actual.png, 3x nearest-neighbour for inspection only" };
  const ms = Object.values(record.motifs), all = Object.values(record.renders);
  record.summary = { yield: { requested: ms.length, delivered: ms.filter((x) => x.delivered).length, deliveryAccepted: ms.filter((x) => x.classification === "requires-visual-review").length },
    combinations: { total: all.length, clear: all.filter((r) => r.contrast === "clear").length, borderline: all.filter((r) => r.contrast === "borderline").length, weak: all.filter((r) => r.contrast === "weak").length, placementOk: all.filter((r) => r.placementOk).length },
    note: "yield (the generation) and the quality of the combinations are reported apart; a clear contrast class is not a pass; the visual review decides nothing automatically and approves nothing" };
  writeFileSync(join(OUT, "index.html"), previewHtml(record, Object.keys(record.motifs).filter((k) => record.motifs[k].delivered), Object.keys(colours)));
  writeFileSync(join(OUT, "record.json"), JSON.stringify(record, null, 2) + "\n");
  return record;
}

function previewHtml(record, keys, colours) {
  const opt = (vals, lab) => vals.map((v) => `<option value="${v}">${lab ? lab(v) : v}</option>`).join("");
  const panel = (id, m, c) => `<section class="panel" id="${id}"><div class="ctl"><label>Motiv <select data-k="m">${opt(keys, (k) => record.motifs[k].label)}</select></label><label>T-shirt <select data-k="c">${opt(colours)}</select></label></div>
  <div class="imgs"><figure><img data-s="torso"><figcaption>Torso 2×</figcaption></figure><figure><img data-s="close"><figcaption>Nærbillede 2×</figcaption></figure>
  <figure class="app"><img data-s="app110" class="a1"><img data-s="app110" class="x3"><figcaption>110×165: faktisk størrelse og 3×</figcaption></figure>
  <figure class="app"><img data-s="app52" class="a1"><img data-s="app52" class="x4"><figcaption>52×78: faktisk størrelse og 4×</figcaption></figure></div><pre class="m"></pre></section>
  <script>init(${JSON.stringify(id)}, ${JSON.stringify(m)}, ${JSON.stringify(c)});</script>`;
  return `<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Trykvalidering D-270</title>
<style>:root{--bg:#f4f2ee;--fg:#1d1d1f;--mut:#5b5b60;--card:#fff;--line:#d9d5cc}@media (prefers-color-scheme:dark){:root{--bg:#18181a;--fg:#eee;--mut:#a5a5ab;--card:#232326;--line:#3a3a3e}}
body{margin:0;padding:16px;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif}h1{font-size:18px;margin:0 0 4px}p.note{color:var(--mut);margin:0 0 12px;max-width:70em}
.wrap{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,560px),1fr));gap:16px}.panel{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px}
.ctl{display:flex;flex-wrap:wrap;gap:8px 16px;margin-bottom:8px}select{font:inherit}.imgs{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start}figure{margin:0}figcaption{color:var(--mut);font-size:12px}
.imgs img{display:block;max-width:100%;height:auto}.app img{display:inline-block;vertical-align:bottom;margin-right:8px;image-rendering:pixelated}.x3{width:330px}.x4{width:208px}.m{white-space:pre-wrap;font-size:12px;color:var(--mut);margin:8px 0 0}</style>
<script>const R=${JSON.stringify(record.renders)};function init(id,m,c){const s=document.getElementById(id),set=()=>{const v={};s.querySelectorAll("select").forEach(x=>v[x.dataset.k]=x.value);const k=v.m+"-"+v.c;
s.querySelectorAll("img").forEach(i=>i.src="preview/"+k+"-"+i.dataset.s+".png");const r=R[k];s.querySelector(".m").textContent=r?("Levering: "+r.delivery+"\\nKontrastklasse (rådgivende, ikke facit): "+r.contrast+" · synlig andel "+r.visibleShare+" · silhuet "+r.silhouette+"\\nPlacering: "+(r.placementOk?"ok":"FEJL")):"";};
const d={m,c};s.querySelectorAll("select").forEach(x=>{x.value=d[x.dataset.k];x.onchange=set;});set();}</script></head><body>
<h1>Uafhængig validering af store midtertryk (D-270) — privat forhåndsvisning</h1>
<p class="note">Lokal og privat; viser C og må ikke offentliggøres. Placering og størrelsesregel er D-269's uændrede (${PLACEMENT}). Kontrastklassen er rådgivende; intet er godkendt, og vurderingen er visuel.</p>
<div class="wrap">${keys.length ? panel("A", keys[0], "cream") + panel("B", keys[0], "navy") : "<p>Ingen leverede motiver.</p>"}</div></body></html>
`;
}

/** The received calls (each one present; a missing or rejected call is recorded, never replaced). */
function fromCalls(OUT) {
  outDir(OUT); const motifs = {};
  for (const [role, id] of Object.entries(CALL_IDS)) {
    const dir = join(CALLS_DIR, id), rc = join(dir, "tpv.receipt.json"), label = role + " (" + id + ")";
    if (!existsSync(rc)) { motifs[id] = { label, img: null, receipt: "not received" }; continue; }
    const receipt = JSON.parse(readFileSync(rc, "utf8"));
    if (receipt.verdict !== "RECEIVED_FOR_CHECK") { motifs[id] = { label, img: null, receipt: receipt.verdict }; continue; }
    const buf = readFileSync(join(dir, "tpv.image-1.png")); if (sha(buf) !== receipt.image.sha256) throw new Error(id + ": the stored picture is not the one received");
    motifs[id] = { label, img: TMM.decodeRgba(buf), sha256: sha(buf), receipt: receipt.verdict };
  }
  const r = evaluate(OUT, motifs, "calls");
  console.log(JSON.stringify({ summary: r.summary, motifs: Object.fromEntries(Object.entries(r.motifs).map(([k, v]) => [k, { classification: v.classification, problems: v.delivery && v.delivery.problems }])) }));
}

/** The study: the same pipeline on TMG-2's planet (a known delivery with loose sparkles) and the SYNTHETIC examples. */
function study(OUT) {
  outDir(OUT); const pbuf =readFileSync(join(ART, ...PF.PLANET.file.split("/"))); if (sha(pbuf) !== PF.PLANET.sha256) throw new Error("the planet print is not TMG-2's received picture");
  const ex = deliveryExamples(), motifs = { planet: { label: "planet (TMG-2, D-268) — reference", img: TMM.decodeRgba(pbuf), sha256: PF.PLANET.sha256 } };
  for (const [k, e] of Object.entries(ex)) motifs[k.split(" ")[0].toLowerCase()] = { label: k, img: e.img };
  const r = evaluate(OUT, motifs, "study");
  const cx = contrastExamples().map((e) => ({ name: e.name, expect: e.expect, got: contrastCheck(e.img, e.shirt) }));
  writeFileSync(join(OUT, "contrast-examples.json"), JSON.stringify(cx, null, 2) + "\n");
  console.log(JSON.stringify({ summary: r.summary, delivery: Object.fromEntries(Object.entries(r.motifs).map(([k, v]) => [k, v.delivery.problems])), contrast: Object.fromEntries(Object.entries(r.motifs).map(([k, v]) => [k, Object.fromEntries(Object.entries(v.colours).map(([c, x]) => [c, x.contrast.class + " " + x.contrast.visibleShare + "/" + x.contrast.silhouette]))])), contrastExamples: cx.map((e) => e.expect + "→" + e.got.class) }));
}

function main() {
  const args = process.argv.slice(2), at = (k) => args[args.indexOf(k) + 1];
  if (args.includes("--study")) return study(at("--out"));
  if (args.includes("--from-calls")) return fromCalls(at("--out"));
  throw new Error("one of --study --out <dir>, --from-calls --out <dir>");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { try { main(); } catch (e) { console.error("REFUSED: " + e.message); process.exit(1); } }
