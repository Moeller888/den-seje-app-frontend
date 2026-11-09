// D-368 — NORTHSTAR HAIRSTYLE TRIAL (private review material; no image call, no runtime change, nothing published).
// The runtime head (assets/avatar-northstar/figure-head-v1.webp) is exactly the D-194 head stack in situation "northstar" minus the
// neck seam (verified pixel for pixel), so hair, hair shadow, brows and the bald head are separate layers here. On that same stack the
// trial puts up to three existing hairstyle sources beside Northstar's own hair (the reference):
//   short  — D-191's review derivative of the owner-approved R2 short (grey luminance, tinted);
//   afro   — D-192's review derivative of the owner-approved R2 afro original (grey luminance, tinted; backHair not used: the D-193
//            head has no ear slit to fill);
//   hybrid — the D-185 R3 hybrid sheet (drawn for another head, opaque sheet on black): fitted to the reference hair's box only to
//            show what it would need.
// For every candidate and colour it composes the whole Northstar figure in outfit K01 with the runtime's own plan, measures the
// hidden areas the hair must cover (bare cranium), the brows (covered share, loose stumps), light fringes at the hair edge, and
// writes the figures, close-ups and masks for the private preview page (northstar-hair-preview-d368.mjs).
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

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const W = 1024, H = 1536, N = W * H;
export const DECISION = "D-368";
export const REVIEW_STATUS = "PRIVATE TRIAL (D-368) — existing review sources on the Northstar runtime head; not approved, not promotable, nothing published";
export function promote() { throw new Error("the D-368 hairstyle trial is private review material and cannot be promoted by this tool"); }
export const CANDIDATES = Object.freeze(["northstar", "short", "afro", "hybrid"]);
export const HYBRID_SHEET = "tools/avatar/fixtures/r3-hair/hybrid/hybrid-v2-sheet.png";
// the colours shown: the source colour, and existing hair colours of the app (HAIR_COLOR_TOKENS). "multiply" is the app's R2 tint
// (token base × grey / 255); "map" is a tone curve through the token's shadow and base, with a lighter highlight, so a light colour
// keeps its light, shadow and strands.
export const TOKENS = Object.freeze({ black: { base: [0x2b, 0x26, 0x22], shadow: [0x14, 0x11, 0x10] }, blonde: { base: [0xc9, 0x9a, 0x5b], shadow: [0x9c, 0x70, 0x38] } });
export const COLOURS = Object.freeze({ source: null, black: { token: "black", method: "multiply" }, blonde: { token: "blonde", method: "multiply" }, "blonde-map": { token: "blonde", method: "map" } });
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

/** The hybrid sheet as a hair layer: opaque grey hair (with its own black outline) on black; the silhouette is the hair fill grown by the
 *  outline, with the enclosed holes filled — hard edges, no antialiasing (the sheet has no alpha). Returns sheet-sized px. */
export function hybridLayer(sheet, w, h) {
  const fill = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) if (lum(sheet, i) >= 60) fill[i] = 1;
  const grow = new Uint8Array(w * h), R = 5;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (fill[y * w + x]) for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h && dx * dx + dy * dy <= R * R) grow[Y * w + X] = 1; }
  // outside = flood from the border over non-silhouette; anything else not in the silhouette is an enclosed hole → part of the hair
  const out = new Uint8Array(w * h), st = [];
  for (let x = 0; x < w; x++) { st.push(x, (h - 1) * w + x); } for (let y = 0; y < h; y++) { st.push(y * w, y * w + w - 1); }
  while (st.length) { const i = st.pop(); if (out[i] || grow[i]) continue; out[i] = 1; const x = i % w, y = (i / w) | 0; if (x > 0) st.push(i - 1); if (x < w - 1) st.push(i + 1); if (y > 0) st.push(i - w); if (y < h - 1) st.push(i + w); }
  const o = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) if (!out[i]) { const g = Math.round(lum(sheet, i)); o[i * 4] = o[i * 4 + 1] = o[i * 4 + 2] = g; o[i * 4 + 3] = 255; }
  return o;
}
const bbox = (P, t = 128, w = W, h = H) => { let x0 = w, y0 = h, x1 = -1, y1 = -1; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (P[(y * w + x) * 4 + 3] >= t) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return { x0, y0, x1, y1 }; };
/** Places a sheet layer so that its box matches `target`'s width, centre and top (nearest-neighbour). */
export function placeOnBox(S, sw, sh, target) {
  const b = bbox(S, 128, sw, sh), k = (target.x1 - target.x0 + 1) / (b.x1 - b.x0 + 1), cx = (target.x0 + target.x1) / 2, sx = (b.x0 + b.x1) / 2;
  const o = new Uint8ClampedArray(N * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const X = Math.round(sx + (x - cx) / k), Y = Math.round(b.y0 + (y - target.y0) / k);
    if (X < 0 || Y < 0 || X >= sw || Y >= sh) continue; const j = (Y * sw + X) * 4; if (!S[j + 3]) continue; o.set(S.subarray(j, j + 4), (y * W + x) * 4);
  }
  return { px: o, scale: k };
}

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

async function main() {
  const args = process.argv.slice(2), at = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), DW = at("--dwebp"), OUT = at("--out");
  if (!DW || !existsSync(DW) || !OUT || resolve(OUT).toLowerCase().startsWith(ROOT.toLowerCase())) throw new Error("--dwebp <exe> --out <dir outside the repository>");
  if (existsSync(OUT) && readdirSync(OUT).length) throw new Error("output directory not empty");
  for (const d of ["fig", "crop", "mask", "layer"]) mkdirSync(join(OUT, d), { recursive: true });
  const AL = await import(pathToFileURL(join(ROOT, "js", "avatar-layers.js")).href);
  const tmp = join(tmpdir(), "d368-" + process.pid + ".png"), cache = new Map();
  const dec = (f) => { if (!cache.has(f)) { execFileSync(DW, ["-quiet", join(ROOT, "assets", "avatar-northstar", f), "-o", tmp]); cache.set(f, Uint8ClampedArray.from(decodePng(readFileSync(tmp)).px)); } return cache.get(f); };

  // 1. the head stack, and the proof that it is the runtime head
  const b = FIG.buildFigure(), L = b.layers, build = { layers: L, head: b.ef.head };
  const runtimeHead = dec("figure-head-v1.webp"), ns = EF.composeSituation(build, "northstar"), cut = new Uint8Array(N);
  let cutPx = 0, differ = 0; for (let i = 0; i < N; i++) { if (ns[i * 4 + 3] && !runtimeHead[i * 4 + 3]) { cut[i] = 1; cutPx++; continue; } for (let c = 0; c < 4; c++) if (ns[i * 4 + c] !== runtimeHead[i * 4 + c]) { differ++; break; } }
  if (differ) throw new Error("the head stack is not the runtime head (" + differ + " px differ)");
  const seam = (P) => { const o = new Uint8ClampedArray(P); for (let i = 0; i < N; i++) if (cut[i]) o[i * 4 + 3] = 0; return o; };
  const bald = HD.composeHead(L, { include: BALD });

  // 2. the hair layers, each as it sits on this head (grey for tinting; the reference also in its own colours)
  const sheetPng = decodePng(readFileSync(join(ROOT, ...HYBRID_SHEET.split("/"))));
  const hyb = placeOnBox(hybridLayer(sheetPng.px, sheetPng.header.w, sheetPng.header.h), sheetPng.header.w, sheetPng.header.h, bbox(L.hair));
  // the D-192 afro layer, exactly as composeSituation("afro") uses it
  const grey = { northstar: toGrey(L.hair), short: build.head.styles.short, afro: EF.loadD192Afro().afro, hybrid: hyb.px };
  const hairFor = (cand, colour) => {
    if (cand === "northstar" && colour === "source") return L.hair;
    const c = COLOURS[colour];   // a grey source's "own colour" is the app's default brown, tinted as the app does
    if (!c) return HS.tint(grey[cand], HS.HAIR_TOKEN_BROWN);
    return c.method === "map" ? mapTint(grey[cand], TOKENS[c.token]) : HS.tint(grey[cand], TOKENS[c.token].base);
  };
  const headFor = (cand, colour) => seam(cand === "northstar" ? HD.composeHead({ ...L, hair: hairFor(cand, colour) }) : NL.overStack([bald, hairFor(cand, colour)]));

  // 3. the figure in outfit K01, through the runtime's own plan; only the head layer is replaced
  const outfit = AL.NORTHSTAR_OUTFITS.K01, plan = AL.northstarPlanFor(outfit), headSrc = AL.NORTHSTAR_FIGURE.head;
  const figure = (head) => AL.northstarCompose(plan, (src) => { const f = src.split("/").pop(); return f === headSrc ? head : dec(f); }, N);
  const baseFigure = figure(runtimeHead); if (pixelSha256(baseFigure) !== pixelSha256(figure(seam(ns)))) throw new Error("figure mismatch");

  // 4. close-up regions from the bald head and the brows
  const hb = bbox(bald), bl = bbox(L.browL), br = bbox(L.browR), hw = hb.x1 - hb.x0;
  const browsY0 = Math.min(bl.y0, br.y0), browsY1 = Math.max(bl.y1, br.y1);
  const R = {
    forehead: { x: Math.min(bl.x0, br.x0) - 40, y: Math.max(0, browsY0 - 150), w: Math.max(bl.x1, br.x1) - Math.min(bl.x0, br.x0) + 80, h: browsY1 - browsY0 + 190 },
    templeL: { x: hb.x0 - 70, y: browsY0 - 190, w: Math.round(hw * 0.42) + 70, h: 320 },
    templeR: { x: hb.x1 - Math.round(hw * 0.42), y: browsY0 - 190, w: Math.round(hw * 0.42) + 70, h: 320 },
    earL: { x: hb.x0 - 80, y: browsY1 - 20, w: Math.round(hw * 0.32) + 80, h: 260 },
    earR: { x: hb.x1 - Math.round(hw * 0.32), y: browsY1 - 20, w: Math.round(hw * 0.32) + 80, h: 260 },
  };
  for (const r of Object.values(R)) { r.x = Math.max(0, r.x); r.y = Math.max(0, r.y); r.w = Math.min(W - r.x, r.w); r.h = Math.min(H - r.y, r.h); }

  // 5. every candidate × colour: figure, head close-ups, checks
  const result = { decision: DECISION, status: REVIEW_STATUS, runtimeHeadProof: { identicalBut: "neck seam", seamPx: cutPx }, hybridScale: +hyb.scale.toFixed(3), regions: R, headBox: hb, candidates: {} };
  for (const cand of CANDIDATES) {
    const hair = hairFor(cand, "source"), c = { colours: {}, checks: {} };
    c.checks.bareCranium = bareCranium(L, hair).px;
    c.checks.browL = browCheck(L.browL, hair); c.checks.browR = browCheck(L.browR, hair);
    c.checks.lightFringe = lightFringe(hair).px;
    c.checks.hairBox = bbox(hair);
    const head0 = headFor(cand, "source");
    const bare = bareCranium(L, hair), fr = lightFringe(hair);
    writeFileSync(join(OUT, "mask", `${cand}-bare-cranium.png`), encodePng(W, H, overlay(head0, bare.mask, [255, 0, 200])));
    writeFileSync(join(OUT, "mask", `${cand}-light-fringe.png`), encodePng(W, H, overlay(head0, fr.mask, [0, 220, 255])));
    writeFileSync(join(OUT, "layer", `${cand}-hair.png`), encodePng(W, H, hair));
    for (const colour of Object.keys(COLOURS)) {
      const head = headFor(cand, colour), fig = figure(head);
      writeFileSync(join(OUT, "fig", `${cand}-${colour}.png`), encodePng(W, H, fig));
      for (const [k, r] of Object.entries(R)) writeFileSync(join(OUT, "crop", `${cand}-${colour}-${k}.png`), encodePng(r.w, r.h, crop(head, r)));
      c.colours[colour] = pixelSha256(fig);
    }
    result.candidates[cand] = c;
    console.log(cand, JSON.stringify(c.checks));
  }
  writeFileSync(join(OUT, "fig", "bald.png"), encodePng(W, H, figure(seam(bald))));
  writeFileSync(join(OUT, "result.json"), JSON.stringify(result, null, 2) + "\n");
}
const invokedDirectly = typeof process.argv[1] === "string" && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main().catch((e) => { console.error(e); process.exit(1); });
