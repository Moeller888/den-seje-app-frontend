// D-351 — DESIGN RECIPES FOR THE TOP CUT KIT (offline; no image call; nothing published; no runtime change). A design is DATA: a fabric
// (a colour with a material character, or a repeating pattern) and optionally an existing chest motif; the same recipe is applied to
// every cut (tee-hip, sweater-long, tank-v3) through northstar-top-cut-kit.mjs, which hands the fabric to TM.render as a seamless swatch
// (the locked method maps it per panel through the master's displacement and multiplies it by the cut's shading, so a pattern follows
// the panels and folds). No per-item pixel edits: everything here is a pure function of the recipe.
//   fabric types — solid: the colour; melange: fine two-tone fibre speckle; pique: a fine knit grid; slub: irregular horizontal yarn
//                  streaks; twill: a diagonal rib;
//   pattern types — stripes: two colours, horizontal, a period and a share; check: two-colour gingham (the mix where bands cross);
//                  dots: round dots on a square lattice, offset every other row.
//   motif — only existing, allowed chest motifs (MOTIFS); the print goes through PF.placePrint at the cut's print box.
//   trim — D-352: optionally a fabric for the cut's trim bands (rib, cuff, binding), laid only where the cut has bands.
// Every swatch is seamless (its edges wrap) and deterministic (a fixed seed), anti-aliased analytically where a pattern has edges.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { homedir } from "node:os";

export const REVISION = "top-cut-recipes-v1";
export const RECIPES_FILE = "tools/avatar/fixtures/northstar-wardrobe/top-cuts/production-trial-recipes-v1.json";
export const FABRICS = Object.freeze(["solid", "melange", "pique", "slub", "twill"]);
export const PATTERNS = Object.freeze(["stripes", "check", "dots"]);
const ART = join(homedir(), "Documents", "DenSejeApp-artefacts");
/** The existing chest motifs and their standing: the three owner-approved tee motifs (D-272, generated under D-270's own calls) and the
 *  planet (generated under D-267's own call, reviewed in D-268, never approved as a product print). Nothing else may be used. */
export const MOTIFS = Object.freeze({
  teapot: { file: "tp-validation-calls/TPV-2-tee-print-object-teapot/tpv.image-1.png", sha256: "8df1696338145d5b553b8dec40f1134b4aef08affbe855e91019804fd3d529d1", standing: "owner-approved tee motif (D-272)" },
  shield: { file: "tp-validation-calls/TPV-3-tee-print-emblem-shield/tpv.image-1.png", sha256: "7c54fc034c684be061e1a0d73a8c659c5beeded07018312b3f4c787eeeaf7a31", standing: "owner-approved tee motif (D-272)" },
  fox: { file: "tp-validation-calls/TPV-1-tee-print-animal-fox/tpv.image-1.png", sha256: "a7b321204599be347a790224974836adf88090d4d6cf847e062577da2003c219", standing: "owner-approved tee motif (D-272)" },
  planet: { file: "tm-material-calls/TMG-2-tee-hip-chest-print-planet/tmm.image-1.png", sha256: "608b45398c959708caaa09991f1544032b5dd4b12273c04f29a222e4e9ffe458", standing: "own generated material (D-267 call, D-268 review); NEVER approved as a product print" },
});

/** The motif's PNG bytes from the private artefacts, verified by sha256. */
export function motifBytes(name) {
  const m = MOTIFS[name]; if (!m) throw new Error("not an allowed motif: " + name);
  const b = readFileSync(join(ART, ...m.file.split("/"))); if (createHash("sha256").update(b).digest("hex") !== m.sha256) throw new Error(name + ": not the received motif"); return b;
}

const rgb = (c) => Array.isArray(c) && c.length === 3 && c.every((v) => Number.isInteger(v) && v >= 0 && v <= 255);
/** A recipe list, validated: 12 recipes, 4 per group (fabric, pattern, motif), unique ids, known types, allowed motifs. */
export function checkRecipes(R) {
  const p = [], list = R && R.recipes; if (!Array.isArray(list)) throw new Error("recipes: a list");
  const ids = new Set();
  for (const r of list) { const at = (r && r.id) || "?";
    if (!/^R\d{2}$/.test(r.id) || ids.has(r.id)) p.push(at + ": id R## unique"); ids.add(r.id);
    if (!r.name || !r.slug || !/^[a-z0-9-]+$/.test(r.slug)) p.push(at + ": name and slug");
    if (!["fabric", "pattern", "motif"].includes(r.group)) p.push(at + ": group fabric | pattern | motif");
    const f = r.fabric || {};
    if (![...FABRICS, ...PATTERNS].includes(f.type)) p.push(at + ": fabric.type");
    if (!rgb(f.base)) p.push(at + ": fabric.base [r,g,b]");
    if (PATTERNS.includes(f.type) && !rgb(f.second)) p.push(at + ": a pattern has fabric.second");
    if ((r.group === "pattern") !== PATTERNS.includes(f.type)) p.push(at + ": a pattern recipe has a pattern type and only then");
    if ((r.group === "motif") !== !!r.motif) p.push(at + ": a motif recipe names a motif and only then");
    if (r.motif && !MOTIFS[r.motif]) p.push(at + ": motif must be one of " + Object.keys(MOTIFS).join(", "));
    if (r.trim !== undefined && !(r.trim && [...FABRICS, ...PATTERNS].includes(r.trim.type) && rgb(r.trim.base))) p.push(at + ": trim is a fabric { type, base } (D-352)");
    for (const k of ["period", "share", "cell", "radius", "spread", "seed"]) if (f[k] !== undefined && !(typeof f[k] === "number" && f[k] > 0)) p.push(at + ": fabric." + k + " > 0"); }
  const n = (g) => list.filter((r) => r.group === g).length;
  if (list.length !== 12 || n("fabric") !== 4 || n("pattern") !== 4 || n("motif") !== 4) p.push("12 recipes: 4 fabric, 4 pattern, 4 motif");
  if (p.length) throw new Error(p.join("; ")); return R;
}

// a small deterministic PRNG (mulberry32)
const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
const tile = (w, h, fn) => { const px = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = fn(x, y), o = (y * w + x) * 4; px[o] = clamp(c[0]); px[o + 1] = clamp(c[1]); px[o + 2] = clamp(c[2]); px[o + 3] = 255; } return { w, h, px }; };
const scale = (c, f) => [c[0] * f, c[1] * f, c[2] * f];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** The coverage of a periodic band [0, on) in a period, at pixel x (box filter over the pixel: an analytic anti-aliased edge). The
 *  stripes and the check sample it half a pixel in, so that both edges of a band are anti-aliased alike (none falls on a pixel border). */
const band = (x, period, on) => { const cov = (a) => { const k = Math.floor(a / period), r = a - k * period; return k * on + Math.min(r, on); }; return cov(x + 1) - cov(x); };

/** The seamless swatch of a recipe's fabric ({ w, h, px }, canvas scale: one swatch pixel = one canvas pixel at scale 1). */
export function swatchOf(fabric) {
  const f = fabric, A = f.base, B = f.second, s = f.spread ?? 0.06, R = rng(f.seed ?? 1);
  switch (f.type) {
    case "solid": return tile(1, 1, () => A);
    case "melange": { // fine fibre speckle: short horizontal fibres a little lighter or darker than the base
      const w = 64, h = 64, v = new Float32Array(w * h); for (let k = 0; k < 900; k++) { const x = Math.floor(R() * w), y = Math.floor(R() * h), len = 1 + Math.floor(R() * 4), d = (R() < 0.5 ? -1 : 1) * s * (0.6 + R() * 0.8); for (let j = 0; j < len; j++) v[y * w + ((x + j) % w)] += d; }
      return tile(w, h, (x, y) => scale(A, 1 + v[y * w + x])); }
    case "pique": { // a fine knit grid: every cell's corner a little darker, its middle a little lighter
      const c = f.cell ?? 4; return tile(c * 8, c * 8, (x, y) => { const gx = band(x, c, 1), gy = band(y, c, 1); return scale(A, 1 - s * Math.max(gx, gy) + s * 0.4 * (1 - gx) * (1 - gy)); }); }
    case "slub": { // irregular horizontal yarn streaks (thicker slubs), lighter than the base
      const w = 128, h = 48, v = new Float32Array(w * h); for (let k = 0; k < 70; k++) { const x = Math.floor(R() * w), y = Math.floor(R() * h), len = 6 + Math.floor(R() * 22), d = s * (0.5 + R()); for (let j = 0; j < len; j++) { const t = Math.sin((Math.PI * (j + 0.5)) / len); v[y * w + ((x + j) % w)] += d * t; } }
      return tile(w, h, (x, y) => scale(A, 1 + v[y * w + x] - s * 0.15)); }
    case "twill": { // a diagonal rib: one darker line every cell, running down to the right
      const c = f.cell ?? 5; return tile(c * 6, c * 6, (x, y) => scale(A, 1 - s * band((x + y) % (c * 6), c, 1.4) + s * 0.3)); }
    case "stripes": { // horizontal: the second colour for share of the period (v runs down the panel)
      const p = f.period, on = p * (f.share ?? 0.5); return tile(4, p, (x, y) => mix(A, B, band(y + 0.5, p, on))); }
    case "check": { // gingham: second colour where one band crosses, its half-mix where one band lies
      const c = f.cell, p = 2 * c; return tile(p, p, (x, y) => { const a = band(x + 0.5, p, c), b = band(y + 0.5, p, c); return mix(A, B, (a + b) / 2); }); }
    case "dots": { // round dots on a lattice, every other row offset by half a cell; supersampled 4x4 for the edge
      const c = f.cell, r = f.radius; return tile(c, 2 * c, (x, y) => { let cov = 0; for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) { const X = x + (sx + 0.5) / 4, Y = y + (sy + 0.5) / 4, row = Math.floor(Y / c), cx = (row % 2 ? c : c / 2), cy = row * c + c / 2;
          const dx = Math.min(Math.abs(X - cx), Math.abs(X - cx + c), Math.abs(X - cx - c)); if (Math.hypot(dx, Y - cy) <= r) cov++; } return mix(A, B, cov / 16); }); }
    default: throw new Error("unknown fabric type " + f.type);
  }
}

/** The swatch tiles seamlessly: the colour step across each wrap edge is no larger than the largest step inside the tile. */
export function seamless(s) {
  const at = (x, y) => (((y + s.h) % s.h) * s.w + ((x + s.w) % s.w)) * 4, d = (a, b) => Math.max(Math.abs(s.px[a] - s.px[b]), Math.abs(s.px[a + 1] - s.px[b + 1]), Math.abs(s.px[a + 2] - s.px[b + 2]));
  let inner = 0, edge = 0; for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) { const v = Math.max(d(at(x, y), at(x + 1, y)), d(at(x, y), at(x, y + 1))); if (x === s.w - 1 || y === s.h - 1) edge = Math.max(edge, v); else inner = Math.max(inner, v); }
  return { inner, edge, ok: edge <= Math.max(inner, 1) };
}
