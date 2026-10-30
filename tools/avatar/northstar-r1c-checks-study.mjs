// D-258 — the study of R1C's placement and automatic checks on C's real tee-hip cut (no image call): constructed POSITIVE and
// NEGATIVE examples, each a flat-coloured garment built from the cut's geometry alone (never from a simulation's repair mask) and
// enlarged and moved like a product shot, plus D-255's REAL R1-1. Each example goes through exactly what the R1C evaluation runs
// (northstar-r1c-evaluate.mjs automatic()). The constructed examples test the checks; they are not generated results.
// Usage: node tools/avatar/northstar-r1c-checks-study.mjs --out <dir outside the repo>
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { encodePng, decodePng } from "./r3-hair-tool-v2.mjs";
import * as WR from "./northstar-wardrobe.mjs";
import * as BC from "./northstar-base-figure-c.mjs";
import * as IP from "./northstar-item-pilot.mjs";
import * as S1 from "./northstar-r1-similarity.mjs";
import * as RC from "./northstar-r1c-evaluate.mjs";
import { flat, grid, down } from "./northstar-wardrobe-poc.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const ART = join(homedir(), "Documents", "DenSejeApp-artefacts"), { W, N } = WR, H = N / W, Mo = WR.maskOps;
const sha = (b) => createHash("sha256").update(b).digest("hex");

/** A constructed garment from the cut's geometry: body fabric over `extent` (the bleed shape, the core, or the core grown by k),
 *  trim on the band zone (uncapped distance < width + extraTrim) and its bleed continuation, the cut's fold shade, optional pocket,
 *  optional dark lines (at the cut's edge, at the band edges, at the extent's own edge), optional grey bands (the canvas's tone). */
export function construct(t, cl, bc, { extent = "bleed", grow = 16, extraTrim = 0, pocket = "inside", lines = [], greyBands = false } = {}) {
  const ext = extent === "bleed" ? bc.bleedMask : extent === "core" ? t.core : Mo.dilate(t.core, grow), o = new Uint8ClampedArray(N * 4);
  const dist = Object.fromEntries([["neck", 1], ["cuff", 2]].map(([n, k]) => { const d = new Int16Array(N).fill(-1), q = []; for (let i = 0; i < N; i++) if (cl.seg[i] === k) { d[i] = 0; q.push(i); }
    for (let h = 0; h < q.length; h++) { const i = q[h]; if (d[i] >= 40) continue; for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < N && t.core[j] && d[j] < 0) { d[j] = d[i] + 1; q.push(j); } } return [n, d]; }));
  // the fold shade as the canvas shows it (v2: no drawn lines), recovered from its grey per tone
  const shade = (i, c) => { const g = bc.canvas[i * 4] / 255, s = Math.min(1, Math.max(0, g >= 0.44 ? (g - 0.45) / 0.35 : (g - 0.22) / 0.22)); return c.map((v) => Math.round(v * (0.82 + 0.3 * s))); };
  const trimNear = Mo.dilate(Uint8Array.from(cl.seg, (v) => (v === 1 || v === 2 ? 1 : 0)), 16);
  for (let i = 0; i < N; i++) { if (!ext[i]) continue; const isTrim = (dist.neck[i] >= 0 && dist.neck[i] < cl.spec.neckBand + extraTrim) || (dist.cuff[i] >= 0 && dist.cuff[i] < cl.spec.cuffBand + extraTrim) || (!t.core[i] && trimNear[i]);
    if (isTrim && greyBands) o.set([bc.canvas[i * 4], bc.canvas[i * 4 + 1], bc.canvas[i * 4 + 2], 255], i * 4);
    else o.set([...shade(i, isTrim ? [214, 140, 96] : [250, 196, 150]), 255], i * 4); }
  // a patch pocket (ink outline) on the wearer's left chest, or placed across the body's side edge
  const g = S1.geometry(t.core), [x0, y0, x1] = g.bbox, cx = (x0 + x1) / 2;
  // across the edge: below the sleeves, over the body's right side edge at that row (14 px inside it)
  const sy = y0 + Math.round(g.height * 0.72); let sideX = -1; for (let x = W - 1; x >= 0; x--) if (t.core[sy * W + x]) { sideX = x; break; }
  const py = pocket === "acrossEdge" ? sy : y0 + Math.round(g.height * 0.32);
  const px = pocket === "inside" ? Math.round(cx + g.bodyWidthBelowSleeves * 0.12) : pocket === "acrossEdge" ? sideX - 14 : null;
  if (px !== null) for (let y = py; y < py + 44; y++) for (let x = px; x < px + 36; x++) { const i = y * W + x, edge = x < px + 2 || x >= px + 34 || y >= py + 42; if (ext[i] && edge) o.set([60, 38, 30, 255], i * 4); }
  const drawLine = (mask) => { for (let i = 0; i < N; i++) if (mask[i] && ext[i]) o.set([42, 30, 26, 255], i * 4); };
  if (lines.includes("cutEdge")) { const out = Uint8Array.from(t.core, (v) => (v ? 0 : 1)), a = Mo.dilate(out, 6), b = Mo.dilate(out, 3); drawLine(Uint8Array.from(a, (v, i) => (v && !b[i] && t.core[i] ? 1 : 0))); }
  if (lines.includes("bandEdges")) drawLine(Uint8Array.from(cl.edgeLine, (v, i) => (v || (dist.neck[i] === cl.spec.neckBand + 4 || dist.cuff[i] === cl.spec.cuffBand + 4) ? 1 : 0)));
  if (lines.includes("ownEdge")) { const e = Mo.dilate(Mo.not(ext), 3); drawLine(Uint8Array.from(e, (v, i) => (v && ext[i] ? 1 : 0))); }
  return o;
}

async function main() {
  const args = process.argv.slice(2), OUT = args[args.indexOf("--out") + 1], r = relative(ROOT, resolve(OUT || "."));
  if (!OUT || !(r.startsWith("..") || isAbsolute(r))) throw new Error("--out must be outside the repository (the sheets show C's cut and a private raw result)");
  mkdirSync(OUT, { recursive: true }); const t0 = Date.now();
  const w = WR.buildWardrobe(), base = BC.prepareBase(w, Uint8ClampedArray.from(decodePng(IP.readC()).px)), T = BC.templatesC(w, base, { revision: "d213" }), env = { w, base, T };
  const { t, cl, bc, canvasSha256 } = RC.cutOf(env, { check: false }), shot = { s: 1.9, tx: -330, ty: -520 };
  const cpng = encodePng(W, H, bc.canvas); writeFileSync(join(OUT, "image-1.tee-hip-bleed-v2.png"), cpng); console.log("canvas v2", canvasSha256, cpng.length);
  const cases = {
    "P1 bleed, trim on the bands, pocket inside": { expect: "all automatic checks pass", o: {} },
    "P2 bleed of 24 px (more than asked)": { expect: "passes; the scale stays right", o: { extent: "grow", grow: 24 } },
    "P4 bleed of 10 px (less than asked, still a margin)": { expect: "passes; the scale stays right", o: { extent: "grow", grow: 10 } },
    "P3 an outline at the bleed's own outer edge": { expect: "passes: the crop removes it", o: { lines: ["ownEdge"] } },
    "N1 no bleed: painted to the silhouette only": { expect: "coverage fails (the fit enlarges it)", o: { extent: "core" } },
    "N2 a bleed of 3 px (below the 4 px coverage ring)": { expect: "coverage fails", o: { extent: "grow", grow: 3 } },
    "N3 trim 6 px wider than the bands": { expect: "trim fails", o: { extraTrim: 6 } },
    "N4 an own outline at the cut's edge": { expect: "second outline fails", o: { lines: ["cutEdge"] } },
    "N5 own lines at the band edges": { expect: "second outline fails", o: { lines: ["bandEdges"] } },
    "N6 a pocket across the side edge": { expect: "clipped details fail", o: { pocket: "acrossEdge" } },
    "N7 the bands left in the canvas's grey": { expect: "tone leak fails", o: { greyBands: true } },
  };
  const res = {}, tiles = [];
  for (const [name, c] of Object.entries(cases)) { const g = construct(t, cl, bc, c.o), out = S1.apply(g, shot), a = RC.automatic(out, t, cl, bc, base);
    res[name] = { expect: c.expect, ok: a.ok, failed: Object.entries(a.checks).filter(([, v]) => !v.ok).map(([k]) => k), placement: { s: a.checks.placement.s, expectedS: +(1 / 1.9).toFixed(5), bleedPx: a.checks.placement.bleedPx, iou: a.checks.placement.iou },
      coverage: a.checks.coverage.share, holes: a.checks.holesBeforeLines.px, trimP90: { neck: a.checks.trim.neck.p90AbsOffset, cuff: a.checks.trim.cuff.p90AbsOffset }, secondOutline: a.checks.secondOutline.share, clipped: a.checks.clippedDetails.clipped, toneLeak: a.checks.toneLeak.share };
    tiles.push(down(flat(a.fitted, [236, 233, 226]), 262, 768, [250, 0, 774, 1536])); console.log(name, "→", a.ok ? "PASS" : "FAIL " + res[name].failed.join(",")); }
  // D-255's REAL R1-1: what the R1C checks say about an output that was not asked for a bleed or for bands
  const rec = JSON.parse(readFileSync(join(ART, "r1-calls", "R1-1-top-tee-hip-apricot-jersey", "r1.record.json"), "utf8")), rbuf = readFileSync(join(ART, "r1-calls", "R1-1-top-tee-hip-apricot-jersey", "r1.image-1.png"));
  if (sha(rbuf) !== rec.imageSha256) throw new Error("R1-1's picture is not D-255's"); const ra = RC.automatic(Uint8ClampedArray.from(decodePng(rbuf).px), t, cl, bc, base);
  res["R real R1-1 (D-255; no bleed, no bands asked)"] = { expect: "fails: no bleed, wider trim, own outline", ok: ra.ok, failed: Object.entries(ra.checks).filter(([, v]) => !v.ok).map(([k]) => k), placement: { s: ra.checks.placement.s, iou: ra.checks.placement.iou },
    coverage: ra.checks.coverage.share, holes: ra.checks.holesBeforeLines.px, trimP90: { neck: ra.checks.trim.neck.p90AbsOffset, cuff: ra.checks.trim.cuff.p90AbsOffset }, secondOutline: ra.checks.secondOutline.share, clipped: ra.checks.clippedDetails.clipped, toneLeak: ra.checks.toneLeak.share };
  const g = grid(tiles, 5, 8); writeFileSync(join(OUT, "r1c-check-cases.png"), encodePng(g.w, g.h, g.px));
  const report = { decision: "D-258", note: "constructed examples from the cut's geometry, enlarged ×1.9 and moved like a product shot; never a simulation's repair mask; not generated results", shot, cases: res, ms: Date.now() - t0 };
  writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2) + "\n"); console.log("R1-1 →", ra.ok ? "PASS" : "FAIL " + res["R real R1-1 (D-255; no bleed, no bands asked)"].failed.join(","));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error("REFUSED: " + e.message); process.exit(1); });
