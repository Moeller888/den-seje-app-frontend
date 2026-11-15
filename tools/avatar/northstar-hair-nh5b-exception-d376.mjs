// D-376 — the one-time exception for D-375 NH-5B (the top knot): exactly the candidate the owner saw in the private avatar trial, in neutral
// grey and in Northstar's brown, bound to full hashes. Deterministic, offline; no image call.
//   1. the LOCKED post-processing of D-375 (northstar-hair-nh5.mjs postProcess, unchanged — same method, same thresholds) on NH-5B's one
//      returned image; its recorded rejection (P2, P3, P4, P8, P9, P11, P12) must come out exactly as recorded, nothing is re-scored;
//   2. the same lifted layer in neutral grey and in Northstar's brown (one shared alpha), each composed on D-373's shared head base: the ears
//      on top, the base's own pixels wherever the layer is empty — the brown head IS the locked composite, byte for byte;
//   3. the finished candidate's measured facts (brows, eyes, ears, face and neck) and where the result departs from design B's guide;
//   4. the two heads as lossless WebP (D-373's toWebp: encoded, decoded back and compared pixel for pixel) — the files the trial showed.
// The command line refuses inputs without their pinned hashes and stops unless every output is byte for byte the bound file. The images
// stay outside the clones. This exception approves one candidate; it changes no rule, publishes nothing and activates nothing.
// Usage: node tools/avatar/northstar-hair-nh5b-exception-d376.mjs --raw <nh.image-1.png> --base <d373-base-figure.png> --ear <ear mask png>
//          --nh4 <D-373 NH-4 grey layer png> --cwebp <cwebp.exe> --dwebp <dwebp.exe> --out <empty dir outside the repository>
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, resolve, dirname, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import * as NH5 from "./northstar-hair-nh5.mjs";
import * as NL from "./r3-northstar-layers.mjs";
import { encodePng, decodePng } from "./r3-hair-tool-v2.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const FIXTURE = "tools/avatar/fixtures/northstar-hair-d375/exception-d376-v1.json";
export const RECORDED_FAILED = Object.freeze(["P2", "P3", "P4", "P8", "P9", "P11", "P12"]);
const W = NH5.W, H = NH5.H, N = NH5.N;
export const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const same = (P, Q, i) => P[i * 4] === Q[i * 4] && P[i * 4 + 1] === Q[i * 4 + 1] && P[i * 4 + 2] === Q[i * 4 + 2] && P[i * 4 + 3] === Q[i * 4 + 3];

/** A hair layer on D-373's base: the ears on top, the base's own pixels wherever the layer is empty (as the locked composite). */
export function composeOnBase(base, ear, L) {
  const top = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) if (ear[i * 4 + 3]) top.set(base.subarray(i * 4, i * 4 + 4), i * 4);
  const o = NL.overStack([base, L, top]); for (let i = 0; i < N; i++) if (L[i * 4 + 3] === 0) o.set(base.subarray(i * 4, i * 4 + 4), i * 4);
  return o;
}

/** The candidate from the untouched raw image: the locked post-processing, both colours, the finished facts, the deviations, the PNGs. */
export function buildCandidate({ raw, base, ear, nh4 }) {
  const G = NH5.geometry(base, ear), M = NH5.silhouette(G, NH5.DESIGNS.B);
  const r = NH5.postProcess({ result: raw, base, ear, G, M, nh4 });
  if (JSON.stringify(r.report.failed) !== JSON.stringify(RECORDED_FAILED)) throw new Error("the locked post-processing no longer gives the recorded rejection: " + r.report.failed.join(","));
  const { GL, HL } = r, grey = composeOnBase(base, ear, GL), brown = composeOnBase(base, ear, HL);
  for (let i = 0; i < N * 4; i++) if (brown[i] !== r.pic[i]) throw new Error("the brown head differs from the locked composite");
  const f = { browZoneIdentical: [0, 0], browsIdentical: [0, 0], eyesIdentical: [0, 0], earsIdentical: [0, 0], earSoftEdgesIdentical: [0, 0], layerAlphaOnBrowZonePx: 0,
    gapAboveBrowsAnyAlphaPx: { left: 1e9, right: 1e9 }, hairOnFaceAndNeckBelowEarTopsPx: 0, belowY430DiffersFromBasePx: 0, alphaDiffGreyVsBrownPx: 0, greyLayerNonNeutralPx: 0 };
  const count = (k, ok) => { f[k][1]++; if (ok) f[k][0]++; };
  for (let i = 0; i < N; i++) {
    const y = (i / W) | 0, bothSame = same(grey, base, i) && same(brown, base, i);
    if (G.BROWZ[i]) count("browZoneIdentical", bothSame); if (G.BROW[i]) count("browsIdentical", bothSame); if (G.t.z.eyesClear[i]) count("eyesIdentical", bothSame); if (G.EAR[i]) count("earsIdentical", bothSame);
    if (G.EAR[i] && base[i * 4 + 3] > 0 && base[i * 4 + 3] < 255) count("earSoftEdgesIdentical", bothSame);
    if (G.BROWZ[i] && GL[i * 4 + 3] > 0) f.layerAlphaOnBrowZonePx++;
    if (G.head[i] && !G.EAR[i] && y > 310 && GL[i * 4 + 3] > 0) f.hairOnFaceAndNeckBelowEarTopsPx++;
    if (y >= NH5.NECK_Y && !bothSame) f.belowY430DiffersFromBasePx++;
    if (GL[i * 4 + 3] !== HL[i * 4 + 3]) f.alphaDiffGreyVsBrownPx++;
    if (GL[i * 4 + 3] && (GL[i * 4] !== GL[i * 4 + 1] || GL[i * 4 + 1] !== GL[i * 4 + 2])) f.greyLayerNonNeutralPx++;
  }
  for (const sd of ["left", "right"]) for (let i = 0; i < N; i++) if (G.t.z.brows[sd][i]) { const x = i % W, y = (i / W) | 0; for (let k = 1; k < 80; k++) if (GL[((y - k) * W + x) * 4 + 3] > 0) { f.gapAboveBrowsAnyAlphaPx[sd] = Math.min(f.gapAboveBrowsAnyAlphaPx[sd], k); break; } }
  // where the result departs from design B's guide
  const A = (i) => GL[i * 4 + 3] >= 128, hl = NH5.DESIGNS.B.hairline;
  const lineY = (x) => { for (let k = 1; k < hl.length; k++) if (x <= hl[k][0]) { const [a, b] = hl[k - 1], [c, d] = hl[k]; return b + (d - b) * (x - a) / (c - a); } return null; };
  const hairline = [400, 420, 440, 470, 500, 512, 530, 560, 590, 610, 625].map((x) => { let low = -1; for (let y = 150; y < 320; y++) { if (A(y * W + x)) low = y; else if (low > 0 && y > low + 3 && y > 180) break; } return [x, low, Math.round(lineY(x))]; });
  const bunOf = (m) => { let n = 0, sx = 0, sy = 0, b = [1e9, 1e9, -1, -1]; for (let y = 0; y < 135; y++) for (let x = 300; x < 720; x++) { const i = y * W + x; if (m(i) && !G.head[i]) { n++; sx += x; sy += y; b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)]; } } return { px: n, centre: n ? [+(sx / n).toFixed(1), +(sy / n).toFixed(1)] : null, box: b }; };
  const temples = Object.fromEntries([["left", 380, 400], ["right", 624, 642]].map(([nm, xa, xb]) => { let low = -1; for (let y = 240; y < 320; y++) for (let x = xa; x <= xb; x++) if (A(y * W + x)) low = Math.max(low, y); return [nm, low]; }));
  const deviations = { hairlineColumns: hairline, hairlineColumnsAre: "[x, the result's lowest hair y, the guide's hairline y]", bun: { result: bunOf(A), guide: bunOf((i) => M[i]) }, templeLowestHairY: temples, guideTempleEndY: [hl[0][1], hl[hl.length - 1][1]] };
  const files = { greyLayer: encodePng(W, H, GL), brownLayer: encodePng(W, H, HL), greyHeadPng: encodePng(W, H, grey), brownHeadPng: encodePng(W, H, brown) };
  return { report: r.report, finished: f, deviations, files };
}
/** The fixture's bound outputs a build does not reproduce byte for byte (empty: it is the excepted candidate). */
export function bindingMismatches(fixture, files) {
  const out = []; for (const [k, o] of Object.entries(fixture.outputs)) if (!files[k] || sha256(files[k]) !== o.sha256) out.push(k + (files[k] ? " " + sha256(files[k]) : " missing"));
  return out;
}

async function main() {
  const args = process.argv.slice(2), arg = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), outside = (d) => { if (!d) return false; const r = relative(ROOT, resolve(d)); return r.startsWith("..") || isAbsolute(r); };
  const fx = JSON.parse(readFileSync(join(ROOT, ...FIXTURE.split("/")), "utf8")), f = { raw: arg("--raw"), base: arg("--base"), ear: arg("--ear"), nh4: arg("--nh4") }, OUT = arg("--out"), cwebp = arg("--cwebp"), dwebp = arg("--dwebp");
  if (Object.values(f).some((v) => !v) || !OUT || !cwebp || !dwebp || !existsSync(cwebp) || !existsSync(dwebp)) throw new Error("--raw --base --ear --nh4 <png> --cwebp <exe> --dwebp <exe> --out <empty dir outside the repository>");
  for (const p of [...Object.values(f), OUT]) if (!outside(p)) throw new Error("the images and the output stay outside the repository: " + p);
  for (const [k, p] of Object.entries(f)) { const pin = fx.inputs.find((i) => i.role === k), got = sha256(readFileSync(p)); if (!pin || got !== pin.sha256) throw new Error("input " + k + " is not the pinned file: " + got); }
  if (existsSync(OUT) && readdirSync(OUT).length) throw new Error("output directory not empty"); mkdirSync(OUT, { recursive: true });
  const px = (p) => decodePng(readFileSync(p)).px, b = buildCandidate({ raw: px(f.raw), base: px(f.base), ear: px(f.ear), nh4: NH5.alphaMask(px(f.nh4)) });
  const { toWebp } = await import("./build-northstar-hair-heads-d373.mjs");
  b.files.greyHeadWebp = toWebp(b.files.greyHeadPng, { cwebp, dwebp }); b.files.brownHeadWebp = toWebp(b.files.brownHeadPng, { cwebp, dwebp });
  for (const [k, o] of Object.entries(fx.outputs)) writeFileSync(join(OUT, o.name), b.files[k]);
  const bad = bindingMismatches(fx, b.files), { files, ...report } = b;
  writeFileSync(join(OUT, "d376-report.json"), JSON.stringify({ failedHistoricalChecks: report.report.failed, finished: report.finished, deviations: report.deviations, outputs: Object.fromEntries(Object.entries(files).map(([k, v]) => [k, sha256(v)])), bound: bad.length === 0 }, null, 1) + "\n");
  if (bad.length) throw new Error("not the excepted candidate (D-376 binds only the fixture's hashes): " + bad.join("; "));
  console.log(JSON.stringify({ bound: true, failedHistoricalChecks: report.report.failed, finished: report.finished }));
}
if (typeof process.argv[1] === "string" && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exitCode = 1; });
