// R3 NORTHSTAR HAIRSTYLES (D-191). On the unchanged D-190 baseline: (1) the documented hair-lock remnants at the image-left
// brow move to the Northstar hair layer and the D-190 mirror fills under them; (2) sideburn tips that D-188 left in the skin
// inside its ear zones move to the hair and the skin under them is refilled; (3) the lit skin under the hair's cast shadow is
// refitted with the painted cranium as a boundary and the shadow layer lifted again, so the composite with Northstar's hair
// keeps its pixels; (4) review derivatives of R2's short and afro placed on the v2 head (the afro documented as UNSUITABLE).
// All new pixels outside the hair are RECONSTRUCTED. REVIEW VARIANT ONLY: never promotable by passing checks.
// No H1, no image call, no runtime change; R3 stays default OFF.
// Usage: node tools/avatar/r3-northstar-hairstyles.mjs --out <empty dir>
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng, encodePng, pixelSha256 } from "./r3-hair-tool-v2.mjs";
import * as NL from "./r3-northstar-layers.mjs";
import * as HD from "./r3-northstar-head.mjs";
import * as BR from "./r3-northstar-brow.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
export const DECISION = "D-191";
export const FIXTURES = "tools/avatar/fixtures/r3-northstar-hairstyles/";
export const SPEC_FILE = FIXTURES + "spec-v1.json";
export const MANIFEST_FILE = FIXTURES + "manifest-v1.json";
export const R2_SOURCES = Object.freeze({
  short: { webp: "assets/avatar-r2/hair/hair-short-v1.webp", webpSha256: "1d01bfef787fc2a185e03f40abe5695a186edee41bcca2268afaa7209d41e9f3", png: FIXTURES + "sources/r2-short-512x768.png", pixelSha256: "16d70187722811e81af15550c5c0b99a7984a7672caceae045b2e1020767dbb5" },
  afro: { webp: "assets/avatar-r2/hair/hair-afro-v1.webp", webpSha256: "675f8f951c65266c75cc661163219a7958b612b0d45ec9471655f0bebf9eb09a", png: FIXTURES + "sources/r2-afro-512x768.png", pixelSha256: "530b21d3cd327cd7f2edbc4bd47b925fb17eda457da3a9c32bcc1dae02eecdac" },
});
export const COMPOSITE_ORDER = HD.COMPOSITE_ORDER;
export const BUILT = Object.freeze(["browL", "skin", "hairShadow", "hair"]);
export const STYLES = Object.freeze(["short", "afro"]);
export const MASKS = Object.freeze(["brow-residue-to-hair", "ear-hair-to-hair", "ear-skin-refill", "lit-skin-refit"]);
export const REVIEW_STATUS = "REVIEW VARIANT (D-191) — the Northstar head's reconstructed areas finished and reviewed with R2-derived short (review derivative) and afro (UNSUITABLE) on the D-190 baseline; not approved, not promotable";
export const HAIR_TOKEN_BROWN = Object.freeze([0x5a, 0x3d, 0x28]);
const W = 1024, H = 1536, N = W * H;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const rel = (p) => readFileSync(join(REPO, ...p.split("/")));
export const loadSpec = () => JSON.parse(rel(SPEC_FILE).toString("utf8"));
const luma = (P, i) => 0.299 * P[i * 4] + 0.587 * P[i * 4 + 1] + 0.114 * P[i * 4 + 2];
export function promotionStatus() { return { promotable: false, status: REVIEW_STATUS, reason: "D-191 builds review material only; promotion needs a later, explicit owner decision and is never derived from check results" }; }
export function promote() { throw new Error("the Northstar hairstyles variant is a review candidate (D-191) and cannot be promoted by this tool"); }

/** The D-190 layer set (pin-verified through the D-190, D-189 and D-188 manifests). */
export function loadBaseline() {
  const b190 = BR.loadTracked(), base = BR.loadBaseline(), layers = { ...base.layers, browL: decodePng(b190.files.browL).px };
  return { d190: b190, d189: base.d189, d188: base.d188, layers };
}
/** The tracked native decodes of R2's short and afro, verified against their pins. */
export function loadR2(style) {
  const s = R2_SOURCES[style]; if (!s) throw new Error(`unknown style ${style}`);
  const px = decodePng(rel(s.png)).px; if (pixelSha256(px) !== s.pixelSha256) throw new Error(`${s.png} is not the pinned decode of ${s.webp}`);
  return px;
}
/** A 512x768 R2 style placed on the 1024x1536 v2 canvas: v2 = k·(x512 + 0.5) + t, bilinear on premultiplied grey + alpha. */
export function placeStyle(S, t) {
  const o = new Uint8ClampedArray(N * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const fx = (x + 0.5 - t.tx) / t.k - 0.5, fy = (y + 0.5 - t.ty) / t.k - 0.5; if (fx < -1 || fy < -1 || fx > 512 || fy > 768) continue;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0; let l = 0, a = 0;
    for (const [dx, dy, w] of [[0, 0, (1 - ax) * (1 - ay)], [1, 0, ax * (1 - ay)], [0, 1, (1 - ax) * ay], [1, 1, ax * ay]]) { const xx = x0 + dx, yy = y0 + dy; if (xx < 0 || yy < 0 || xx >= 512 || yy >= 768) continue; const j = (yy * 512 + xx) * 4, aa = S[j + 3] / 255; l += S[j] * aa * w; a += aa * w; }
    if (a <= 0) continue; const g = Math.round(l / a), i = (y * W + x) * 4; o[i] = g; o[i + 1] = g; o[i + 2] = g; o[i + 3] = Math.round(a * 255);
  }
  return o;
}
/** Review tint as the R2 runtime: token base x luminance, the map's alpha. */
export function tint(P, rgb = HAIR_TOKEN_BROWN) { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) { const a = P[i * 4 + 3]; if (!a) continue; for (let c = 0; c < 3; c++) o[i * 4 + c] = Math.round(rgb[c] * P[i * 4] / 255); o[i * 4 + 3] = a; } return o; }

export function buildHairstyles({ srcBuf, spec = loadSpec() } = {}) {
  const src = NL.loadSource(srcBuf);
  if (spec.source.sha256 !== NL.SOURCE.sha256) throw new Error("the spec does not name the tracked Northstar v2");
  if (spec.baseline.manifest !== BR.MANIFEST_FILE) throw new Error("the spec does not name the D-190 baseline");
  const base = loadBaseline(), L0 = base.layers, nl = NL.loadSpec();
  const browL = new Uint8ClampedArray(L0.browL), hair = new Uint8ClampedArray(L0.hair), skin = new Uint8ClampedArray(L0.skin), shadow = new Uint8ClampedArray(L0.hairShadow);
  const m = Object.fromEntries(MASKS.map((k) => [k, new Uint8Array(N)]));

  // (1) brow residue -> hair, the D-190 mirror under it
  const brow = BR.buildBrow(), fittedM = decodePng(base.d190.files["brow-mirror-fitted"]).px, shared = decodePng(base.d188.files["overlap-ink-hair-features"]).px;
  const sh = new Uint8Array(N); for (let i = 0; i < N; i++) if (shared[i * 4 + 3]) sh[i] = 1;
  const nearShared = NL.dilate(sh, 3), cand = new Uint8Array(N);
  for (let y = 200; y < 300; y++) for (let x = 380; x < 540; x++) {
    const i = y * W + x; if (!browL[i * 4 + 3] || fittedM[i * 4 + 3] || !nearShared[i]) continue;
    for (let d = 1; d <= 8; d++) if (fittedM[(i + d * W) * 4 + 3]) { cand[i] = 1; break; }
  }
  const [gx0, gx1] = spec.browResidue.documentedX, seen = new Uint8Array(N);
  for (let s = 0; s < N; s++) {
    if (!cand[s] || seen[s]) continue; const comp = [s], st = [s]; seen[s] = 1;
    while (st.length) { const i = st.pop(); for (const j of [i - 1, i + 1, i - W, i + W, i - W - 1, i - W + 1, i + W - 1, i + W + 1]) if (cand[j] && !seen[j]) { seen[j] = 1; st.push(j); comp.push(j); } }
    if (!comp.some((i) => i % W >= gx0 && i % W <= gx1)) continue;
    // the mirror fills only under OPAQUE remnants (alpha >= 250): under a faint remnant the hair is not opaque either, and a
    // mirror pixel there would show through and add brow where the original shows skin with Northstar's hair
    for (const i of comp) { m["brow-residue-to-hair"][i] = 1; const opaque = browL[i * 4 + 3] >= 250; if (!hair[i * 4 + 3]) hair.set(browL.subarray(i * 4, i * 4 + 4), i * 4); if (opaque) browL.set(brow.fitted.subarray(i * 4, i * 4 + 4), i * 4); else browL[i * 4] = browL[i * 4 + 1] = browL[i * 4 + 2] = browL[i * 4 + 3] = 0; }
  }

  // (2) sideburn tips in the ear zones -> hair; the skin under them refilled
  const hc = nl.hairColour, ear = NL.polyMask(nl.zones.earInL), earR = NL.polyMask(nl.zones.earInR); for (let i = 0; i < N; i++) if (earR[i]) ear[i] = 1;
  const isH = (i) => { const r = skin[i * 4], g = skin[i * 4 + 1], b = skin[i * 4 + 2]; return skin[i * 4 + 3] >= 250 && Math.max(r, g, b) >= 50 && r < hc.rMax && g < hc.gOverR * r && b < hc.bOverR * r; };
  const N8 = (i) => [i - 1, i + 1, i - W, i + W, i - W - 1, i - W + 1, i + W - 1, i + W + 1], mv = m["ear-hair-to-hair"], st = [];
  for (let i = W; i < N - W; i++) if (ear[i] && isH(i) && N8(i).some((j) => hair[j * 4 + 3] >= 128)) { mv[i] = 1; st.push(i); }
  while (st.length) { const i = st.pop(); for (const j of N8(i)) if (!mv[j] && ear[j] && isH(j)) { mv[j] = 1; st.push(j); } }
  const known = new Uint8Array(N);
  for (let i = 0; i < N; i++) { if (mv[i]) { if (!hair[i * 4 + 3]) hair.set(skin.subarray(i * 4, i * 4 + 4), i * 4); m["ear-skin-refill"][i] = 1; continue; } const k = NL.cls(skin[i * 4], skin[i * 4 + 1], skin[i * 4 + 2], 255); if (skin[i * 4 + 3] >= 250 && (k === "S" || k === "O") && skin[i * 4 + 2] < 170) known[i] = 1; }
  const fillE = NL.harmonicFill(skin, m["ear-skin-refill"], known);
  for (let i = 0; i < N; i++) if (m["ear-skin-refill"][i]) for (let c = 0; c < 3; c++) skin[i * 4 + c] = Math.round(fillE[i * 3 + c]);

  // (3) lit skin under the hair's cast shadow refitted with the painted cranium as a boundary; the shadow lifted again
  const lit = decodePng(base.d188.files["shadow-lit-reconstructed"]).px, cr = L0.cranium, U = m["lit-skin-refit"], kn = new Uint8Array(N), seed = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < N; i++) if (lit[i * 4 + 3]) U[i] = 1;
  for (let i = 0; i < N; i++) {
    if (U[i]) continue; const k = NL.cls(skin[i * 4], skin[i * 4 + 1], skin[i * 4 + 2], 255);
    if (skin[i * 4 + 3] >= 250 && (k === "S" || k === "O") && skin[i * 4 + 2] < 170) { seed.set(skin.subarray(i * 4, i * 4 + 3), i * 4); kn[i] = 1; }
    else if (skin[i * 4 + 3] < 250 && cr[i * 4 + 3] === 255) { seed.set(cr.subarray(i * 4, i * 4 + 3), i * 4); kn[i] = 1; }
  }
  const S2 = NL.harmonicFill(seed, U, kn); let relifted = 0;
  for (let i = 0; i < N; i++) {
    if (!U[i]) continue;
    // target: what the D-190 skin + shadow show at this pixel (premultiplied over)
    const sa = L0.skin[i * 4 + 3] / 255, ha = L0.hairShadow[i * 4 + 3] / 255, oa = ha + sa * (1 - ha); if (oa <= 0) continue;
    const P = [0, 1, 2].map((c) => (L0.hairShadow[i * 4 + c] * ha + L0.skin[i * 4 + c] * sa * (1 - ha)) / oa), S = [S2[i * 3], S2[i * 3 + 1], S2[i * 3 + 2]];
    let af = 0; for (let c = 0; c < 3; c++) { const d = P[c] - S[c]; af = Math.max(af, d > 0 ? d / Math.max(1e-6, 255 - S[c]) : -d / Math.max(1e-6, S[c])); }
    for (let c = 0; c < 3; c++) skin[i * 4 + c] = Math.round(S[c]);
    if (af < 0.02) { shadow[i * 4] = shadow[i * 4 + 1] = shadow[i * 4 + 2] = shadow[i * 4 + 3] = 0; continue; }
    if (af > 0.75) af = 1;
    for (let c = 0; c < 3; c++) shadow[i * 4 + c] = Math.round(Math.min(255, Math.max(0, S[c] + (P[c] - S[c]) / af)));
    shadow[i * 4 + 3] = Math.round(af * L0.skin[i * 4 + 3]); relifted++;
  }

  // (4) R2 short and afro on the v2 head
  const styles = {}; for (const s of STYLES) styles[s] = placeStyle(loadR2(s), spec.hairstyles[s].transform);
  const toPx = (mask, rgb) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) if (mask[i]) { o.set(rgb, i * 4); o[i * 4 + 3] = 255; } return o; };
  const masks = { "brow-residue-to-hair": toPx(m["brow-residue-to-hair"], [255, 0, 200]), "ear-hair-to-hair": toPx(m["ear-hair-to-hair"], [0, 200, 255]), "ear-skin-refill": toPx(m["ear-skin-refill"], [60, 200, 90]), "lit-skin-refit": toPx(U, [255, 140, 0]) };
  const count = (mk) => mk.reduce((s, v) => s + v, 0);
  const stats = { browResiduePx: count(m["brow-residue-to-hair"]), earHairPx: count(mv), litSkinRefitPx: count(U), shadowRelifted: relifted };
  return { src, base, layers: { ...L0, browL, skin, hairShadow: shadow, hair }, styles, masks, stats };
}

/** Composes a situation: "bald", "northstar" (Northstar hair and its own cast shadow), "short", "afro" (review tint, no shadow). */
export function composeSituation(build, situation) {
  const L = build.layers, bald = COMPOSITE_ORDER.filter((k) => k !== "hair" && k !== "hairShadow");
  if (situation === "northstar") return HD.composeHead(L);
  const head = HD.composeHead(L, { include: bald });
  if (situation === "bald") return head;
  if (!STYLES.includes(situation)) throw new Error(`unknown situation ${situation}`);
  return NL.overStack([head, tint(build.styles[situation])]);
}

export function loadTracked() {
  const man = JSON.parse(rel(MANIFEST_FILE).toString("utf8")), files = {};
  for (const [k, e] of Object.entries({ ...man.layers, ...man.styles, ...man.masks })) { const b = rel(e.file); if (sha(b) !== e.sha256) throw new Error(`${e.file} is not the pinned ${e.sha256}`); files[k] = b; }
  if (sha(rel(SPEC_FILE)) !== man.spec.sha256) throw new Error(`${SPEC_FILE} is not the pinned ${man.spec.sha256}`);
  return { man, files };
}

const invokedDirectly = typeof process.argv[1] === "string" && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  const args = process.argv.slice(2), i = args.indexOf("--out"), outDir = i >= 0 ? args[i + 1] : null;
  if (!outDir) throw new Error("usage: --out <empty dir>");
  const OUT = resolve(outDir); if (existsSync(OUT) && readdirSync(OUT).length) throw new Error("output directory not empty");
  for (const d of ["layers", "styles", "masks"]) mkdirSync(join(OUT, d), { recursive: true });
  const b = buildHairstyles(), pins = {};
  for (const k of BUILT) { writeFileSync(join(OUT, "layers", `${k}.png`), encodePng(W, H, b.layers[k])); pins[`layers/${k}`] = pixelSha256(b.layers[k]); }
  for (const k of STYLES) { writeFileSync(join(OUT, "styles", `hair-${k}-review.png`), encodePng(W, H, b.styles[k])); pins[`styles/${k}`] = pixelSha256(b.styles[k]); }
  for (const [k, px] of Object.entries(b.masks)) { writeFileSync(join(OUT, "masks", `${k}.png`), encodePng(W, H, px)); pins[`masks/${k}`] = pixelSha256(px); }
  writeFileSync(join(OUT, "build.json"), JSON.stringify({ decision: DECISION, status: REVIEW_STATUS, pixelSha256: pins, stats: b.stats }, null, 2) + "\n");
  console.log(JSON.stringify(b.stats));
}
