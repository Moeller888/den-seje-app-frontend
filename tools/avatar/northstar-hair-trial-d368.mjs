// D-368 — NORTHSTAR HAIRSTYLE TRIAL (private review material; no image call, no runtime change, nothing published).
// The runtime head (assets/avatar-northstar/figure-head-v1.webp) is exactly the D-194 head stack in situation "northstar" minus the
// neck seam (verified pixel for pixel), so hair, hair shadow, brows and the bald head are separate layers here.
// Round 1 put Northstar's own hair (reference), D-191 "short", D-192 afro and the D-185 R3 hybrid on that head (the hybrid was judged
// unsuitable and is out of the first selection). Round 2 (this tool) repairs and compares, before and after, from existing pixels only
// (northstar-hair-polish-d368.mjs):
//   the shared head — the left brow's residue and the forehead's light spots removed; the Northstar reference keeps its pixels through
//                     two patches drawn only for its own hairstyle, and the tool proves it still composes pixel for pixel;
//   "short"         — an ink edge like Northstar's line;
//   afro            — opened at each ear, so the whole ear shows inside the curls.
// Every figure is outfit K01 through the runtime's own plan (northstarPlanFor/northstarCompose); only the head layer is replaced.
// Colours: the source colour, and black and blonde through the tone curve (mapTint).
// Usage: node tools/avatar/northstar-hair-trial-d368.mjs --dwebp <dwebp.exe> --out <dir outside the repository>
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { decodePng, encodePng, pixelSha256 } from "./r3-hair-tool-v2.mjs";
import * as FIG from "./r3-northstar-figure.mjs";
import * as EF from "./r3-northstar-earfix.mjs";
import * as HD from "./r3-northstar-head.mjs";
import * as HS from "./r3-northstar-hairstyles.mjs";
import * as NL from "./r3-northstar-layers.mjs";
import * as PO from "./northstar-hair-polish-d368.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const W = 1024, H = 1536, N = W * H;
export const DECISION = "D-368";
export const REVIEW_STATUS = "PRIVATE TRIAL (D-368) — existing review sources on the Northstar runtime head; not approved, not promotable, nothing published";
export function promote() { throw new Error("the D-368 hairstyle trial is private review material and cannot be promoted by this tool"); }
export const CANDIDATES = Object.freeze(["northstar", "short", "afro"]);   // round 1's hybrid is out of the first selection
export const VARIANTS = Object.freeze(["before", "after"]);
// the colours shown: the source colour, and existing hair colours of the app (HAIR_COLOR_TOKENS). "multiply" is the app's R2 tint
// (token base × grey / 255); "map" is a tone curve through the token's shadow and base, with a lighter highlight, so a light colour
// keeps its light, shadow and strands.
export const TOKENS = Object.freeze({ black: { base: [0x2b, 0x26, 0x22], shadow: [0x14, 0x11, 0x10] }, blonde: { base: [0xc9, 0x9a, 0x5b], shadow: [0x9c, 0x70, 0x38] } });
export const COLOURS = Object.freeze({ source: null, black: { token: "black", method: "map" }, blonde: { token: "blonde", method: "map" } });
/** The tone curve: grey (normalised over the layer's own 2nd–98th percentile) → shadow×0.5 · shadow · base · highlight. */
export function mapTint(P, { base, shadow }) {
  const gs = []; for (let i = 0; i < N; i++) if (P[i * 4 + 3] >= 128) gs.push(P[i * 4]); gs.sort((a, b) => a - b);
  const lo = gs.length ? gs[Math.floor(gs.length * 0.02)] : 0, hi = gs.length ? gs[Math.floor(gs.length * 0.98)] : 255;
  const hl = base.map((v) => Math.round(v + (255 - v) * 0.35)), dk = shadow.map((v) => Math.round(v * 0.5));
  const stops = [[0, dk], [0.45, shadow], [0.8, base], [1, hl]], o = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < N; i++) { const a = P[i * 4 + 3]; if (!a) continue; const t = Math.max(0, Math.min(1, (P[i * 4] - lo) / Math.max(1, hi - lo)));
    let k = 0; while (k < stops.length - 2 && t > stops[k + 1][0]) k++; const [t0, c0] = stops[k], [t1, c1] = stops[k + 1], u = (t - t0) / (t1 - t0);
    for (let c = 0; c < 3; c++) o[i * 4 + c] = Math.round(c0[c] + (c1[c] - c0[c]) * u); o[i * 4 + 3] = a; }
  return o;
}
const BALD = HD.COMPOSITE_ORDER.filter((k) => k !== "hair" && k !== "hairShadow");
const lum = (P, i) => 0.299 * P[i * 4] + 0.587 * P[i * 4 + 1] + 0.114 * P[i * 4 + 2];

/** A coloured hair layer as grey luminance for the app's tint (rgb × grey / 255): the 98th percentile of its luminance maps to 255. */
export function toGrey(P) {
  const ls = []; for (let i = 0; i < N; i++) if (P[i * 4 + 3] >= 128) ls.push(lum(P, i));
  ls.sort((a, b) => a - b); const top = ls.length ? ls[Math.floor(ls.length * 0.98)] : 255;
  const o = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < N; i++) { const a = P[i * 4 + 3]; if (!a) continue; const g = Math.min(255, Math.round(lum(P, i) * 255 / top)); o[i * 4] = o[i * 4 + 1] = o[i * 4 + 2] = g; o[i * 4 + 3] = a; }
  return o;
}

const bbox = (P, t = 128, w = W, h = H) => { let x0 = w, y0 = h, x1 = -1, y1 = -1; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (P[(y * w + x) * 4 + 3] >= t) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return { x0, y0, x1, y1 }; };

/** Brow check: covered share, the visible pieces, and a loose stump (a small visible piece of a mostly covered brow). */
export function browCheck(brow, hair) {
  let tot = 0, vis = 0, browPx = 0; const v = new Uint8Array(N);
  for (let i = 0; i < N; i++) { const a = brow[i * 4 + 3] / 255; if (!a) continue; tot += a; if (a >= 0.25) browPx++; const s = a * (1 - hair[i * 4 + 3] / 255); vis += s; if (s >= 0.25) v[i] = 1; }
  const seen = new Uint8Array(N), parts = [];
  for (let i = 0; i < N; i++) if (v[i] && !seen[i]) { let n = 0; const st = [i]; seen[i] = 1; while (st.length) { const j = st.pop(); n++; const x = j % W; for (const k of [j - 1, j + 1, j - W, j + W]) if (k >= 0 && k < N && v[k] && !seen[k] && Math.abs((k % W) - x) <= 1) { seen[k] = 1; st.push(k); } } parts.push(n); }
  parts.sort((a, b) => b - a); const area = parts.reduce((s, n) => s + n, 0), covered = tot ? 1 - vis / tot : 0;
  // a separate visible piece smaller than a quarter of the whole brow (pieces under 20 px are antialiasing specks)
  const stump = parts.length > 1 ? parts.slice(1).some((n) => n >= 20 && n < browPx * 0.25) : (covered > 0.4 && area > 0 && area < browPx * 0.25);
  return { coveredShare: +covered.toFixed(3), visiblePieces: parts.length, pieces: parts.slice(0, 4), looseStump: stump };
}
/** Bare cranium: the reconstructed top of the head (hidden under hair in the source) showing where neither skin nor hair covers it. */
export function bareCranium(L, hair) {
  const m = new Uint8Array(N); let n = 0;
  for (let i = 0; i < N; i++) if (L.cranium[i * 4 + 3] >= 128 && L.skin[i * 4 + 3] < 128 && hair[i * 4 + 3] < 128) { m[i] = 1; n++; }
  return { mask: m, px: n };
}
/** Light fringe: hair edge pixels (partly transparent) clearly lighter than the hair's own body — they show as pale outlines. */
export function lightFringe(hair) {
  const ls = []; for (let i = 0; i < N; i++) if (hair[i * 4 + 3] === 255) ls.push(lum(hair, i)); ls.sort((a, b) => a - b);
  const p90 = ls.length ? ls[Math.floor(ls.length * 0.9)] : 255; let n = 0; const m = new Uint8Array(N);
  for (let i = 0; i < N; i++) { const a = hair[i * 4 + 3]; if (a >= 16 && a <= 239 && lum(hair, i) > p90 + 20) { n++; m[i] = 1; } }
  return { px: n, mask: m };
}
const crop = (P, r) => { const o = new Uint8ClampedArray(r.w * r.h * 4); for (let y = 0; y < r.h; y++) o.set(P.subarray(((r.y + y) * W + r.x) * 4, ((r.y + y) * W + r.x + r.w) * 4), y * r.w * 4); return o; };
const overlay = (P, m, rgb) => { const o = new Uint8ClampedArray(P); for (let i = 0; i < N; i++) if (m[i]) { o[i * 4] = rgb[0]; o[i * 4 + 1] = rgb[1]; o[i * 4 + 2] = rgb[2]; o[i * 4 + 3] = 255; } return o; };

/** The ears as the pupil sees them: the share of the ear mask not under hair, and the separate visible pieces (fragments). */
export function earCheck(ears, hair) {
  let tot = 0, vis = 0; const v = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (ears[i]) { tot++; if (hair[i * 4 + 3] < 128) { vis++; v[i] = 1; } }
  const seen = new Uint8Array(N); let pieces = 0;
  for (let i = 0; i < N; i++) if (v[i] && !seen[i]) { pieces++; const st = [i]; seen[i] = 1; while (st.length) { const j = st.pop(), x = j % W; for (const k of [j - 1, j + 1, j - W, j + W]) if (k >= 0 && k < N && v[k] && !seen[k] && Math.abs((k % W) - x) <= 1) { seen[k] = 1; st.push(k); } } }
  return { visibleShare: tot ? +(vis / tot).toFixed(3) : 0, visiblePieces: pieces };
}

async function main() {
  const args = process.argv.slice(2), at = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), DW = at("--dwebp"), OUT = at("--out");
  if (!DW || !existsSync(DW) || !OUT || resolve(OUT).toLowerCase().startsWith(ROOT.toLowerCase())) throw new Error("--dwebp <exe> --out <dir outside the repository>");
  if (existsSync(OUT) && readdirSync(OUT).length) throw new Error("output directory not empty");
  for (const d of ["fig", "crop", "mask"]) mkdirSync(join(OUT, d), { recursive: true });
  const AL = await import(pathToFileURL(join(ROOT, "js", "avatar-layers.js")).href);
  const tmp = join(tmpdir(), "d368-" + process.pid + ".png"), cache = new Map();
  const dec = (f) => { if (!cache.has(f)) { execFileSync(DW, ["-quiet", join(ROOT, "assets", "avatar-northstar", f), "-o", tmp]); cache.set(f, Uint8ClampedArray.from(decodePng(readFileSync(tmp)).px)); } return cache.get(f); };

  // 1. the head stack, and the proof that it is the runtime head
  const b = FIG.buildFigure(), L0 = b.layers, build = { layers: L0, head: b.ef.head };
  const runtimeHead = dec("figure-head-v1.webp"), ns = EF.composeSituation(build, "northstar"), cut = new Uint8Array(N);
  let cutPx = 0, differ = 0; for (let i = 0; i < N; i++) { if (ns[i * 4 + 3] && !runtimeHead[i * 4 + 3]) { cut[i] = 1; cutPx++; continue; } for (let c = 0; c < 4; c++) if (ns[i * 4 + c] !== runtimeHead[i * 4 + c]) { differ++; break; } }
  if (differ) throw new Error("the head stack is not the runtime head (" + differ + " px differ)");
  const seam = (P) => { const o = new Uint8ClampedArray(P); for (let i = 0; i < N; i++) if (cut[i]) o[i * 4 + 3] = 0; return o; };

  // 2. the repaired shared head; the reference through its patches must still be the runtime head, pixel for pixel
  const bald0 = HD.composeHead(L0, { include: BALD });
  const br = PO.browResidue(L0), fs = PO.foreheadSpots(br.layers, bald0), L1 = fs.layers, patches = { skin: fs.patch, browL: br.patch };
  const bald1 = HD.composeHead(L1, { include: BALD }), ref = seam(PO.headStack(L1, HD.COMPOSITE_ORDER, patches));
  let refDiff = 0; for (let i = 0; i < N * 4; i++) if (ref[i] !== runtimeHead[i]) refDiff++;
  if (refDiff) throw new Error("the Northstar reference changed (" + refDiff + " values)");

  // 3. the hair layers (grey, for colouring), before and after
  const ears = PO.earMask(bald1), afro0 = EF.loadD192Afro().afro, opened = PO.earOpening(afro0, ears, { bald: bald1 });
  const grey = { short: { before: build.head.styles.short, after: PO.outlineHair(build.head.styles.short) }, afro: { before: afro0, after: opened.px }, northstar: { before: toGrey(L0.hair), after: toGrey(L1.hair) } };
  const colourOf = (g, colour) => { const c = COLOURS[colour]; return c ? mapTint(g, TOKENS[c.token]) : HS.tint(g, HS.HAIR_TOKEN_BROWN); };
  const headFor = (cand, variant, colour) => {
    if (cand === "northstar") return colour === "source" ? ref : seam(PO.headStack({ ...L1, hair: colourOf(grey.northstar.after, colour) }, HD.COMPOSITE_ORDER, patches));
    return seam(NL.overStack([variant === "before" ? bald0 : bald1, colourOf(grey[cand][variant], colour)]));
  };
  const hairFor = (cand, variant) => (cand === "northstar" ? L0.hair : grey[cand][variant]);

  // 4. the figure in outfit K01, through the runtime's own plan; only the head layer is replaced
  const plan = AL.northstarPlanFor(AL.NORTHSTAR_OUTFITS.K01), headSrc = AL.NORTHSTAR_FIGURE.head;
  const figure = (head) => AL.northstarCompose(plan, (src) => { const f = src.split("/").pop(); return f === headSrc ? head : dec(f); }, N);
  const refFigure = pixelSha256(figure(ref)) === pixelSha256(figure(runtimeHead));
  if (!refFigure) throw new Error("the reference figure changed");

  // 5. close-up regions
  const hb = bbox(bald0), bl = bbox(L0.browL), brw = bbox(L0.browR), hw = hb.x1 - hb.x0, browsY0 = Math.min(bl.y0, brw.y0), browsY1 = Math.max(bl.y1, brw.y1);
  const R = {
    forehead: { x: Math.min(bl.x0, brw.x0) - 40, y: Math.max(0, browsY0 - 150), w: Math.max(bl.x1, brw.x1) - Math.min(bl.x0, brw.x0) + 80, h: browsY1 - browsY0 + 190 },
    templeL: { x: hb.x0 - 70, y: browsY0 - 190, w: Math.round(hw * 0.42) + 70, h: 320 },
    templeR: { x: hb.x1 - Math.round(hw * 0.42), y: browsY0 - 190, w: Math.round(hw * 0.42) + 70, h: 320 },
    earL: { x: hb.x0 - 80, y: browsY1 - 20, w: Math.round(hw * 0.32) + 80, h: 260 },
    earR: { x: hb.x1 - Math.round(hw * 0.32), y: browsY1 - 20, w: Math.round(hw * 0.32) + 80, h: 260 },
  };
  for (const r of Object.values(R)) { r.x = Math.max(0, r.x); r.y = Math.max(0, r.y); r.w = Math.min(W - r.x, r.w); r.h = Math.min(H - r.y, r.h); }

  // 6. what is left: light spots in the forehead after the repair, measured as before (the reference keeps its own)
  const left = PO.foreheadSpots(L1, bald1);
  writeFileSync(join(OUT, "mask", "forehead-spots-before.png"), encodePng(W, H, overlay(bald0, fs.mask, [255, 0, 200])));
  writeFileSync(join(OUT, "mask", "forehead-spots-after.png"), encodePng(W, H, overlay(bald1, left.mask, [255, 0, 200])));
  writeFileSync(join(OUT, "mask", "brow-residue.png"), encodePng(W, H, overlay(bald0, br.mask, [255, 0, 200])));
  writeFileSync(join(OUT, "mask", "ears.png"), encodePng(W, H, overlay(bald1, ears, [255, 0, 200])));

  const result = { decision: DECISION, status: REVIEW_STATUS, round: 2, referenceIdentical: { head: refDiff === 0, figure: refFigure, seamPx: cutPx },
    repairs: { browResiduePx: br.mask.reduce((a, v) => a + v, 0), foreheadSpotPx: fs.px, foreheadSpotPxLeft: left.px, earPx: ears.reduce((a, v) => a + v, 0) },
    regions: R, headBox: hb, candidates: {} };
  for (const cand of CANDIDATES) {
    const c = { variants: {} };
    for (const variant of cand === "northstar" ? ["after"] : VARIANTS) {
      const hair = hairFor(cand, variant), Lv = variant === "before" ? L0 : L1, v = { checks: {}, colours: {} };
      v.checks.browL = browCheck(Lv.browL, hair); v.checks.browR = browCheck(Lv.browR, hair); v.checks.lightFringe = lightFringe(hair).px;
      v.checks.ears = earCheck(ears, hair);
      for (const colour of Object.keys(COLOURS)) {
        const head = headFor(cand, variant, colour), fig = figure(head), name = `${cand}-${variant}-${colour}`;
        writeFileSync(join(OUT, "fig", name + ".png"), encodePng(W, H, fig));
        for (const [k, r] of Object.entries(R)) writeFileSync(join(OUT, "crop", `${name}-${k}.png`), encodePng(r.w, r.h, crop(head, r)));
        v.colours[colour] = pixelSha256(fig);
      }
      c.variants[variant] = v;
    }
    result.candidates[cand] = c;
    console.log(cand, JSON.stringify(Object.fromEntries(Object.entries(c.variants).map(([k, v]) => [k, v.checks]))));
  }
  writeFileSync(join(OUT, "result.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({ referenceIdentical: result.referenceIdentical, repairs: result.repairs }));
}
const invokedDirectly = typeof process.argv[1] === "string" && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main().catch((e) => { console.error(e); process.exit(1); });
