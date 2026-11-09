// D-370 — THE FIT CHECK OF THE FREE NORTHSTAR WARDROBE, on the owner's machine (needs the private base figure C and dwebp; no image call).
// Tops end at row 846 and shoes begin at row 1292, so rows above 846 depend only on (top, bottom) and rows from 1292 only on (bottom, shoes):
// 378 + 60 transitions decide all 3,780 outfits. Each runs the production outfit check (BF.layerProof + BC.outfitCheck) UNCHANGED; a finding
// counts for the zone it lies in. The only exception is charcoalLaceException below. Resumable; writes outside the repository.
// Usage: node --expose-gc tools/avatar/northstar-free-matrix.mjs --dwebp <exe> --fixes <staging dir> --out <dir> [--portion 40] | --summary
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", ".."), FIX = join(ROOT, "tools/avatar/fixtures/northstar-wardrobe/free-combination");
const json = (f) => JSON.parse(readFileSync(f, "utf8"));
export const exceptionSpec = () => json(join(FIX, "charcoal-lace-exception-v1.json"));
export const stagingSpec = () => json(join(FIX, "layer-fixes-staging-v1.json"));
export const ZONE = 1050;   // rows above: waist and hip; rows from here: legs and shoes
const N = 1024 * 1536;

/** The documented exception, and nothing else: only the one check, only charcoal sneakers with one of the three straight trousers, and only a
 *  finding whose box is one of that transition's marked lace areas. Everything else is kept. */
export function charcoalLaceException(findings, shoes, bottom, spec) {
  const t = shoes === spec.shoes ? spec.transitions.find((x) => x.bottom === bottom) : null, kept = [], exempt = [];
  for (const f of findings) {
    const hit = !!t && f.check === spec.check && t.boxes.some((b) => b.length === f.box.length && b.every((v, i) => v === f.box[i]));
    (hit ? exempt : kept).push(f);
  }
  return { kept, exempt };
}
/** The hip remark the owner keeps in the package: a slightly heavy hip contour, seen in close-up only. Reported, never a failure. */
export const heavyHipContour = (top, bottom) => (top.startsWith("top-tank") && (bottom.startsWith("bottom-trousers-square-") || bottom === "bottom-shorts-navy")) || (top.startsWith("top-sweater") && (bottom.startsWith("bottom-trousers-square-") || bottom === "bottom-skirt-sand"));
/** D-370's two layer fixes taken out of a plan's file names: what the same plan drew before they were published (the blue tee at layer
 *  revision 2 without its hip cover; a white sneaker without its lining under long trousers). The older decisions' plan checks use it;
 *  the D-370 test proves the fixes appear exactly where they belong. */
export const LAYER_FIX_FILES = Object.freeze(["top-tee-hip-blue-hip-cover-v1.webp", "shoes-sneakers-white-under-long-hem-v1.webp"]);
export const beforeLayerFixes = (names) => names.filter((f) => !LAYER_FIX_FILES.includes(f)).map((f) => f.replace(/^(top-tee-hip-blue-(?:top-body|sleeves))-v3\.webp$/, "$1-v2.webp"));

const parts = (AL) => { const by = { top: [], bottom: [], shoes: [] }; for (const p of AL.northstarPieces()) by[p.category].push(p.item); return by; };
const lines = (f) => (existsSync(f) ? readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);

async function main() {
  const args = process.argv.slice(2), at = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), OUT = at("--out");
  if (!OUT || resolve(OUT).toLowerCase().startsWith(ROOT.toLowerCase())) throw new Error("--out <dir outside the repository>");
  mkdirSync(OUT, { recursive: true });
  const AL = await import(pathToFileURL(join(ROOT, "js/avatar-layers.js")).href), by = parts(AL), f = join(OUT, "transitions.jsonl");
  if (args.includes("--summary")) return summary(by, lines(f), OUT);
  const DW = at("--dwebp"), STG = at("--fixes"), PORTION = +(at("--portion") || 40); if (!DW || !STG) throw new Error("--dwebp <exe> --fixes <staging dir>");
  const spec = stagingSpec(), sha = (b) => createHash("sha256").update(b).digest("hex");
  for (const x of spec.files) if (sha(readFileSync(join(STG, x.file))) !== x.sha256) throw new Error(x.file + ": not the approved staging file");
  const { decodePng } = await import(pathToFileURL(join(ROOT, "tools/avatar/r3-hair-tool-v2.mjs")).href), tmp = join(OUT, "x.png"), cacheDir = join(OUT, "raw"); mkdirSync(cacheDir, { recursive: true });
  const raw = (file, dir = join(ROOT, "assets/avatar-northstar")) => { const c = join(cacheDir, file + ".rgba"); if (!existsSync(c)) { execFileSync(DW, ["-quiet", join(dir, file), "-o", tmp]); writeFileSync(c, decodePng(readFileSync(tmp)).px); } const b = readFileSync(c); return new Uint8ClampedArray(b.buffer, b.byteOffset, b.length); };
  const staged = (file) => raw(file, STG);
  const K = await import(pathToFileURL(join(ROOT, "tools/avatar/northstar-top-cut-kit.mjs")).href), BF = await import(pathToFileURL(join(ROOT, "tools/avatar/northstar-base-figure.mjs")).href), BC = await import(pathToFileURL(join(ROOT, "tools/avatar/northstar-base-figure-c.mjs")).href), NL = await import(pathToFileURL(join(ROOT, "tools/avatar/r3-northstar-layers.mjs")).href), IP = await import(pathToFileURL(join(ROOT, "tools/avatar/northstar-item-pilot.mjs")).href);
  const REV = IP.METHODS[IP.METHOD].outfitRevision, E = K.envC(), { w, base } = E, none = new Uint8ClampedArray(N * 4);
  const check = (t, b, s) => { const T = AL.NORTHSTAR_ITEMS[t], blue = t === "top-tee-hip-blue", fv = (id, l, it) => id + "-" + l + "-v" + (it.layerRev || 1) + ".webp";
    const body = blue ? staged("top-tee-hip-blue-top-body-v3.webp") : raw(fv(t, "top-body", T)), sleeves = T.layers.includes("sleeves") ? raw(fv(t, "sleeves", T)) : none, seam = blue ? staged("top-tee-hip-blue-hip-cover-v1.webp") : T.hipSeam ? raw(T.hipSeam) : none, pants = raw(b + "-pants-v1.webp");
    let sh = raw(s + "-shoes-v1.webp"); if (s === "shoes-sneakers-white" && b.startsWith("bottom-trousers-square-")) { const c = staged("shoes-sneakers-white-under-long-hem-v1.webp"), o = Uint8ClampedArray.from(sh); for (let i = 0; i < N; i++) if (c[i * 4 + 3]) for (let k = 0; k < 4; k++) o[i * 4 + k] = c[i * 4 + k]; sh = o; }
    const it = Object.assign({}, BF.minimumItems(base.R, base.sep.lab), { topBody: body, sleeves, pants, shoes: NL.overStack([seam, sh]) }), P = BF.layerProof(w, base.R, base.Z, it, { sep: base.sep, headSeam: "d201", hide: BC.closedFootwearHidden(base, sh), enclosure: "c-exterior" }), oc = BC.outfitCheck(w, base, P, { revision: REV }), out = [];
    const take = (id, arr) => { for (const p of arr || []) out.push({ check: id, px: p.px, box: p.box }); };
    for (const c of oc.checks) { const v = c.value || {}; if (c.id.includes("1a")) take(c.id, v.slits); else if (c.id.includes("1d")) take(c.id, v.cuts); else if (c.id.includes("COMBO-2")) take(c.id, v.doubles); else if (c.id.includes("COMBO-5")) take(c.id, v.slivers); else if (c.id.includes("COMBO-6")) take(c.id, v.notches); }
    for (const [id, m] of [["COMBO-1b-ENCLOSED-HOLE", P.enclosed], ["COMBO-1c-MISSING-OVERLAP", P.deep]]) { let n = 0, y0 = 1e9, y1 = -1, x0 = 1e9, x1 = -1; for (let i = 0; i < N; i++) if (m[i]) { n++; const y = (i / 1024) | 0, x = i % 1024; y0 = Math.min(y0, y); y1 = Math.max(y1, y); x0 = Math.min(x0, x); x1 = Math.max(x1, x); } if (n) out.push({ check: id, px: n, box: [x0, y0, x1 - x0 + 1, y1 - y0 + 1] }); }
    return { findings: out, orderOk: oc.checks.find((c) => c.id === "COMBO-3-ORDER").ok }; };
  const done = new Set(lines(f).map((x) => x.id)), todo = [];
  for (const b of by.bottom) { for (const t of by.top) todo.push({ id: "U|" + t + "|" + b, t, b, s: "shoes-sneakers-white", up: true }); for (const s of by.shoes) todo.push({ id: "L|" + b + "|" + s, t: "top-tee-hip-cream", b, s, up: false }); }
  let n = 0; for (const u of todo) { if (done.has(u.id) || n >= PORTION) continue; const r = check(u.t, u.b, u.s); appendFileSync(f, JSON.stringify({ id: u.id, kind: u.up ? "upper" : "lower", top: u.t, bottom: u.b, shoes: u.s, findings: r.findings.filter((x) => (u.up ? x.box[1] + x.box[3] <= ZONE : x.box[1] >= ZONE)), spanning: r.findings.filter((x) => x.box[1] < ZONE && x.box[1] + x.box[3] > ZONE), orderOk: r.orderOk }) + "\n"); n++; globalThis.gc?.(); }
  console.log("transitions", done.size + n, "/", todo.length);
}
function summary(by, L, OUT) {
  const M = new Map(L.map((x) => [x.id, x])), spec = exceptionSpec(), res = { total: 0, pass: 0, passWithLaceException: 0, fail: 0, heavyHipContour: 0, failures: [] };
  if (L.length !== 438) throw new Error("the matrix is not complete: " + L.length + " of 438 transitions");
  for (const t of by.top) for (const b of by.bottom) for (const s of by.shoes) { res.total++; const u = M.get("U|" + t + "|" + b), l = M.get("L|" + b + "|" + s), { kept, exempt } = charcoalLaceException([...u.findings, ...l.findings], s, b, spec); if (heavyHipContour(t, b)) res.heavyHipContour++;
    if (kept.length || u.spanning.length || l.spanning.length || !u.orderOk || !l.orderOk) { res.fail++; if (res.failures.length < 20) res.failures.push({ outfit: [t, b, s].join("+"), kept }); } else if (exempt.length) res.passWithLaceException++; else res.pass++; }
  writeFileSync(join(OUT, "summary.json"), JSON.stringify(res, null, 1) + "\n"); console.log(JSON.stringify(res)); if (res.fail) process.exit(1);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
