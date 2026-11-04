// D-257 — the local illustration of r1-c1 (no image call): the cut's construction layer, the bleed canvas a call would send as
// Image 1, the checks on D-255's REAL R1-1 (fitted by D-256's s1; it was not asked for a bleed, so it shows where a generated
// trim lands against the cut's bands), and a SIMULATED bleed made from R1-1 by a DEMONSTRATIVE REPAIR (its own outline removed,
// its edge colours extended outward). Every simulated tile is framed in red and marked in the report; it is never a generated
// result and never evidence of automation. Writes only outside the repository.
// Usage: node tools/avatar/northstar-r1-construction-demo.mjs --out <dir outside the repo>
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
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
import * as C1 from "./northstar-r1-construction.mjs";
import * as EV from "./northstar-r1-evaluate.mjs";
import { flat, crop, grid, down } from "./northstar-wardrobe-poc.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const ART = join(homedir(), "Documents", "DenSejeApp-artefacts"), { W, N } = WR, H = N / W, Mo = WR.maskOps;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const bg = [236, 233, 226], FIGB = [250, 0, 774, 1536], CALL = "R1-1-top-tee-hip-apricot-jersey";
const checker = (P) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0, c = ((x >> 3) + (y >> 3)) % 2 ? 205 : 245, a = P[i * 4 + 3] / 255; for (let k = 0; k < 3; k++) o[i * 4 + k] = Math.round(P[i * 4 + k] * a + c * (1 - a)); o[i * 4 + 3] = 255; } return o; };
const union = (layers) => { const u = new Uint8ClampedArray(N * 4); for (const L of Object.values(layers)) for (let i = 0; i < N; i++) if (L[i * 4 + 3]) u.set(L.subarray(i * 4, i * 4 + 4), i * 4); return u; };
const half = (P) => down(flat(P, bg), 262, 768, FIGB);
const framed = (im) => { const o = { ...im, px: new Uint8ClampedArray(im.px) }; for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) if (x < 6 || y < 6 || x >= o.w - 6 || y >= o.h - 6) o.px.set([220, 0, 0, 255], (y * o.w + x) * 4); return o; };

/** DEMONSTRATIVE REPAIR (simulation only): R1-1's own outline near its edge replaced by the nearest non-ink paint inward, then its
 *  edge colours carried outward by `bleed` px. Used to illustrate the layering; it is never a method step. */
export function simulateBleed(fitted, bleed) {
  const o = new Uint8ClampedArray(fitted), m = S1.maskOf(o), edge6 = Mo.dilate(Mo.not(m), 6);
  const isInk = (i) => o[i * 4 + 3] >= 128 && BF.classify(o, i) === "ink";
  const drop = new Uint8Array(N); for (let i = 0; i < N; i++) if (m[i] && edge6[i] && isInk(i)) drop[i] = 1;
  const q = []; for (let i = 0; i < N; i++) if (m[i] && !drop[i]) q.push(i); const done = Uint8Array.from(m, (v, i) => (v && !drop[i] ? 1 : 0)), steps = new Int16Array(N);
  for (let h = 0; h < q.length; h++) { const i = q[h], x = i % W; for (const j of [i - 1, i + 1, i - W, i + W]) { if (j < 0 || j >= N || Math.abs((j % W) - x) > 1 || done[j]) continue;
    const s = m[j] ? 0 : steps[i] + 1; if (!m[j] && s > bleed) continue; steps[j] = s; done[j] = 1; o.set([o[i * 4], o[i * 4 + 1], o[i * 4 + 2], 255], j * 4); q.push(j); } }
  return o;
}

async function main() {
  const args = process.argv.slice(2), OUT = args[args.indexOf("--out") + 1], r = relative(ROOT, resolve(OUT || "."));
  if (!OUT || !(r.startsWith("..") || isAbsolute(r))) throw new Error("--out must be outside the repository (the sheets show C and a private raw result)");
  mkdirSync(OUT, { recursive: true }); const t0 = Date.now();
  const dir = join(ART, "r1-calls", CALL), rec = JSON.parse(readFileSync(join(dir, "r1.record.json"), "utf8")), buf = readFileSync(join(dir, "r1.image-1.png"));
  if (sha(buf) !== rec.imageSha256) throw new Error("R1-1's stored picture is not the one D-255 evaluated");
  const w = WR.buildWardrobe(), base = BC.prepareBase(w, Uint8ClampedArray.from(decodePng(IP.readC()).px)), T = BC.templatesC(w, base, { revision: "d213" }), env = { w, base, T };
  const { t, src } = EV.templateOf(env, "top"), cl = C1.constructionLayer(t, base, "tee-hip"), bc = C1.bleedCanvas(t, cl);
  const canvasPng = encodePng(W, H, bc.canvas); writeFileSync(join(OUT, "image-1.tee-hip-bleed.png"), canvasPng);
  // REAL: R1-1 fitted by s1 to the core (as in D-256)
  const out = Uint8ClampedArray.from(decodePng(buf).px), f = S1.fit(S1.maskOf(out), t.core), real = S1.apply(out, f);
  const realChecks = { coverage: C1.coverage(real, t, cl), trimOffset: C1.trimOffset(real, t, cl), bandAgreement: C1.bandAgreement(real, t, cl), secondOutline: C1.secondOutline(real, t, cl), clippedDetails: C1.clippedDetails(real, t), compose: (({ holes, holesUnderLines, ok }) => ({ holes, holesUnderLines, ok }))(C1.composeC1(real, t, cl, base)) };
  // SIMULATED (demonstrative repair): the bleed the method asks for, made from R1-1
  const sim = simulateBleed(real, cl.spec.bleed), simC = C1.composeC1(sim, t, cl, base), simFit = R1.checkItem(w, base, T, t, simC.layers);
  const simChecks = { simulated: true, coverage: C1.coverage(sim, t, cl), trimOffset: C1.trimOffset(sim, t, cl), bandAgreement: C1.bandAgreement(sim, t, cl), secondOutline: C1.secondOutline(sim, t, cl), clippedDetails: C1.clippedDetails(sim, t), compose: { holes: simC.holes, holesUnderLines: simC.holesUnderLines, ok: simC.ok }, fit: { ok: simFit.ok, failed: simFit.failed } };
  // the D-256 composition for comparison (r1-v1 on the s1 fit)
  const v1 = R1.compose(real, t, base, { shift: { dx: 0, dy: 0, coverage: 1, iou: f.iou, atWindowEdge: false } });
  const min = BF.minimumItems(base.R, base.sep.lab), dressed = (layers) => BF.layerProof(w, base.R, base.Z, { ...min, ...layers }, { sep: base.sep, headSeam: "d201", enclosure: "c-exterior" }).dressedRuntime;
  const onSim = dressed(simC.layers), onV1 = dressed(v1.layers), onTpl = dressed(src.layers);
  // the construction layer drawn: segments (neck blue, cuff green, hem orange, outer grey), bands tinted, lines on top
  const cv = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) { if (t.core[i]) cv.set(cl.band[i] === 1 ? [150, 180, 240, 255] : cl.band[i] === 2 ? [160, 220, 160, 255] : [235, 235, 235, 255], i * 4); const s = cl.seg[i]; if (s) cv.set(s === 1 ? [0, 70, 220, 255] : s === 2 ? [0, 150, 40, 255] : s === 3 ? [230, 120, 0, 255] : [120, 120, 120, 255], i * 4); }
  const linesOnly = new Uint8ClampedArray(cl.lines);
  // trim classification of the REAL output: pixels nearer the trim colour, inside (blue) and outside (red) the cut's bands
  const ba = realChecks.bandAgreement, dist = (i, c) => Math.hypot(real[i * 4] - c[0], real[i * 4 + 1] - c[1], real[i * 4 + 2] - c[2]), map = new Uint8ClampedArray(flat(checker(real), bg));
  for (let i = 0; i < N; i++) { if (!t.core[i] || real[i * 4 + 3] < 128) continue; const trim = dist(i, ba.trimRgb) < dist(i, ba.bodyRgb); if (trim && cl.band[i]) map.set([40, 90, 230, 255], i * 4); else if (trim && !cl.band[i]) map.set([230, 0, 0, 255], i * 4); else if (!trim && cl.band[i]) map.set([255, 170, 0, 255], i * 4); }
  for (let i = 0; i < N; i++) if (cl.edgeLine[i]) map.set([0, 0, 0, 255], i * 4);
  const g1 = grid([half(cv), half(checker(linesOnly)), half(bc.canvas), half(checker(real)), framed(half(checker(sim))), framed(half(onSim)), half(onV1), half(onTpl)], 8, 10);
  writeFileSync(join(OUT, "c1-layers.png"), encodePng(g1.w, g1.h, g1.px));
  const boxes = { "neck": [400, 440, 624, 540], "armpit left": [360, 580, 470, 690], "armpit right": [554, 580, 664, 690], "cuff left": [300, 560, 420, 680], "cuff right": [604, 560, 724, 680], "hem": [380, 760, 644, 860] };
  const rows = []; for (const b of Object.values(boxes)) rows.push(crop(flat(onV1, bg), b, 3), framed(crop(flat(onSim, bg), b, 3)), crop(flat(map, bg), b, 3), crop(flat(onTpl, bg), b, 3));
  const g2 = grid(rows, 4, 8); writeFileSync(join(OUT, "c1-closeups-x3.png"), encodePng(g2.w, g2.h, g2.px));
  const g3 = grid([down(flat(onV1, bg), 110, 165), framed(down(flat(onSim, bg), 110, 165)), down(flat(onTpl, bg), 110, 165), down(flat(onV1, bg), 52, 78), framed(down(flat(onSim, bg), 52, 78)), down(flat(onTpl, bg), 52, 78)], 6, 8);
  writeFileSync(join(OUT, "c1-app.png"), encodePng(g3.w, g3.h, g3.px));
  const report = { decision: "D-257", hypothesis: C1.REVISION, cut: "tee-hip", spec: cl.spec, limits: C1.LIMITS, construction: cl.counts, inkRgb: cl.inkRgb,
    canvas: { file: "image-1.tee-hip-bleed.png", sha256: sha(canvasPng), bytes: canvasPng.length },
    real: { note: "D-255's R1-1 (not asked for a bleed), fitted by D-256's s1", fit: f, ...realChecks },
    simulated: { note: "DEMONSTRATIVE REPAIR made from R1-1 (outline removed, edge colours extended): not a generated result, not evidence of automation", ...simChecks },
    ms: Date.now() - t0, rssMB: Math.round(process.memoryUsage().rss / 1048576) };
  writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ canvas: report.canvas, construction: cl.counts, real: realChecks, simulated: simChecks }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error("REFUSED: " + e.message); process.exit(1); });
