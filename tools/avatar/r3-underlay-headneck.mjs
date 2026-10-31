// R3 UNDERLAY — HEAD AND NECK (D-186). A deterministic drawing of the R3 head underlay with drawn ear details, the jaw
// underside and a self-drawn neck. No image call, no H1 pixels, no Northstar pixels, no paint from a rejected call.
//   · the head silhouette (rows <= 424) is the approved G1V3 + E2 geometry and its contour is K4 (D-148), both unchanged;
//   · below row 424 the separate neck geometry N1 (spec.neckGeometryN1) replaces what used to be H1's continuation;
//   · the skin is split into a LUMINANCE layer (a shading factor) and a skin colour token (the adopted medium skin from
//     U1 / S1, D-149), so another skin tone can follow from the same luminance without a new drawing; hair ramp B is not
//     used for skin;
//   · the INK layer holds K4 plus the drawn chin, neck and ear lines in K4's own ink colour.
// pre.join-continuity and pre.transition-silhouette compare a candidate with H1's rows 424/425 and 425..445; they do not
// apply to an asset that contains no H1 pixels and are reported NOT APPLICABLE. The neck attachment has its own check.
//
// Usage: node tools/avatar/r3-underlay-headneck.mjs --spec <spec.json> --out <empty dir>
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng, encodePng, pixelSha256 } from "./r3-hair-tool.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
export const TOOL_ID = "r3-underlay-headneck";
export const W = 1024, H = 1536, AXIS = 511.5, HEAD_LAST_ROW = 424;
const sha = (b) => createHash("sha256").update(b).digest("hex");

// ── sources ─────────────────────────────────────────────────────────────────────────────────────────────────────
export function loadSources(spec) {
  const out = {};
  for (const k of ["headGeometry", "contourK4", "underpaintingU1"]) {
    const s = spec.sources[k], buf = readFileSync(join(REPO, ...s.file.split("/")));
    if (sha(buf) !== s.sha256) throw new Error(`${k}: ${s.file} is not the pinned ${s.sha256}`);
    if (/h1/i.test(s.file.split("/").pop())) throw new Error("an H1 file is never a source");
    out[k] = decodePng(buf).px;
  }
  // U1 must be exactly the head geometry filled with the adopted skin colour
  const G = out.headGeometry, U = out.underpaintingU1, skin = spec.palette.skinMedium;
  for (let i = 0; i < W * H; i++) {
    const g = G[i * 4 + 3] >= 128, u = U[i * 4 + 3] >= 128;
    if (g !== u) throw new Error("U1 is not the head geometry");
    if (u && (U[i * 4] !== skin[0] || U[i * 4 + 1] !== skin[1] || U[i * 4 + 2] !== skin[2])) throw new Error("U1's fill is not the adopted skin colour");
    if (g && Math.floor(i / W) > HEAD_LAST_ROW) throw new Error("the head geometry reaches below row 424");
  }
  return out;
}

// ── geometry helpers ────────────────────────────────────────────────────────────────────────────────────────────
// AXIS is the pixel-index axis (pixel i mirrors to pixel 2 * AXIS - i); in continuous coordinates the same mirror is x -> 2 * AXIS + 1 - x
export const MIRROR_X = 2 * AXIS + 1, mirrorPt = ([x, y]) => [MIRROR_X - x, y];
export const quad = (a, c, b, m) => { const o = []; for (let k = 0; k <= m; k++) { const t = k / m, u = 1 - t; o.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]); } return o; };
export const expand = (pts) => pts.flatMap((p, i) => (Array.isArray(p) ? [p] : (p.q ? quad(...p.q, 32).slice(i ? 1 : 0) : [])));
export function polyCoverage(P, S = 4) {
  const cov = new Float32Array(W * H);
  let y0 = Infinity, y1 = -Infinity; for (const [, y] of P) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  for (let sy = Math.max(0, Math.floor(y0) * S); sy < Math.min(H, Math.ceil(y1) + 1) * S; sy++) {
    const yy = (sy + 0.5) / S, xs = [];
    for (let i = 0; i < P.length; i++) { const [ax, ay] = P[i], [bx, by] = P[(i + 1) % P.length]; if ((ay <= yy) !== (by <= yy)) xs.push(ax + (yy - ay) / (by - ay) * (bx - ax)); }
    xs.sort((a, b) => a - b);
    for (let j = 0; j + 1 < xs.length; j += 2) for (let sx = Math.max(0, Math.ceil(xs[j] * S - 0.5)); sx < Math.min(W * S, Math.ceil(xs[j + 1] * S - 0.5)); sx++) cov[Math.floor(sy / S) * W + Math.floor(sx / S)] += 1 / (S * S);
  }
  return cov;
}
export function lineCoverage(P, r, into = new Float32Array(W * H)) {
  for (let i = 0; i + 1 < P.length; i++) {
    const [ax, ay] = P[i], [bx, by] = P[i + 1], vx = bx - ax, vy = by - ay, vv = vx * vx + vy * vy || 1;
    for (let y = Math.max(0, Math.floor(Math.min(ay, by) - r - 1)); y <= Math.min(H - 1, Math.ceil(Math.max(ay, by) + r + 1)); y++)
      for (let x = Math.max(0, Math.floor(Math.min(ax, bx) - r - 1)); x <= Math.min(W - 1, Math.ceil(Math.max(ax, bx) + r + 1)); x++) {
        const px = x + 0.5, py = y + 0.5, t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / vv)), d = Math.hypot(px - ax - t * vx, py - ay - t * vy);
        const c = Math.max(0, Math.min(1, r + 0.5 - d)); if (c > into[y * W + x]) into[y * W + x] = c;
      }
  }
  return into;
}
/** Separable box blur of radius r (deterministic), used to feather a field's edge. */
export function feather(cov, r) {
  if (r <= 0) return cov;
  const R = Math.round(r), tmp = new Float32Array(W * H), out = new Float32Array(W * H), n = 2 * R + 1;
  for (let y = 0; y < H; y++) { let s = 0; for (let x = -R; x <= R; x++) s += cov[y * W + Math.min(W - 1, Math.max(0, x))]; for (let x = 0; x < W; x++) { tmp[y * W + x] = s / n; s += cov[y * W + Math.min(W - 1, x + R + 1)] - cov[y * W + Math.max(0, x - R)]; } }
  for (let x = 0; x < W; x++) { let s = 0; for (let y = -R; y <= R; y++) s += tmp[Math.min(H - 1, Math.max(0, y)) * W + x]; for (let y = 0; y < H; y++) { out[y * W + x] = s / n; s += tmp[Math.min(H - 1, y + R + 1) * W + x] - tmp[Math.max(0, y - R) * W + x]; } }
  return out;
}
/** Euclidean distance (two-pass chamfer 3-4, divided by 3) to the nearest pixel where inside[i] is false. */
function distanceToOutside(inside) {
  const INF = 1e9, d = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) d[i] = inside[i] ? INF : 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (!d[i]) continue; let v = d[i]; if (x) v = Math.min(v, d[i - 1] + 3); if (y) { v = Math.min(v, d[i - W] + 3); if (x) v = Math.min(v, d[i - W - 1] + 4); if (x < W - 1) v = Math.min(v, d[i - W + 1] + 4); } d[i] = v; }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; if (!d[i]) continue; let v = d[i]; if (x < W - 1) v = Math.min(v, d[i + 1] + 3); if (y < H - 1) { v = Math.min(v, d[i + W] + 3); if (x < W - 1) v = Math.min(v, d[i + W + 1] + 4); if (x) v = Math.min(v, d[i + W - 1] + 4); } d[i] = v; }
  for (let i = 0; i < W * H; i++) d[i] /= 3;
  return d;
}

// ── build ───────────────────────────────────────────────────────────────────────────────────────────────────────
/** Builds the luminance layer, the ink layer and the medium-skin render. Pure: the sources are never modified. */
export function buildHeadNeck(spec, src = loadSources(spec)) {
  const S = spec.parameters.supersample, N1 = spec.neckGeometryN1, G = src.headGeometry;
  const clip425 = (cov) => { for (let i = 0; i < (HEAD_LAST_ROW + 1) * W; i++) cov[i] = 0; return cov; };   // N1 never touches rows <= 424
  const chinL = expand(N1.chin.left), chinPoly = [...chinL, ...chinL.slice(0, -1).reverse().map(mirrorPt), [chinL[0][0], 425], [MIRROR_X - chinL[0][0], 425]];
  const chin = clip425(polyCoverage([[chinL[0][0], 424], ...chinL, ...chinL.slice(0, -1).reverse().map(mirrorPt), [MIRROR_X - chinL[0][0], 424]], S));
  const neckL = N1.neck.left, neck = clip425(polyCoverage([...neckL, ...neckL.slice().reverse().map(mirrorPt)], S));
  const alpha = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) alpha[i] = Math.max(G[i * 4 + 3] / 255, chin[i], neck[i]);
  // luminance: edge shading of head + chin, the documented soft fields
  const headChin = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) headChin[i] = (G[i * 4 + 3] >= 128 || chin[i] >= 0.5) ? 1 : 0;
  // the bottom of the neck and the region below the chin are not an outside edge of the head: count the neck as inside
  const insideForEdge = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) insideForEdge[i] = headChin[i] || neck[i] >= 0.5 ? 1 : 0;
  const dist = distanceToOutside(insideForEdge), E = spec.skinModel.edgeShading;
  const f = new Float32Array(W * H).fill(1);
  for (let i = 0; i < W * H; i++) if (headChin[i]) f[i] *= 1 - E.depth * Math.max(0, 1 - (dist[i] - 1) / E.widthPx);
  for (const fd of spec.skinModel.fields) {
    for (const P of fd.mirror ? [fd.polygon, fd.polygon.map(mirrorPt)] : [fd.polygon]) {
      const c = feather(polyCoverage(P, S), fd.featherPx), neckOnly = fd.on === "neck";
      for (let i = 0; i < W * H; i++) if (c[i] > 0 && (!neckOnly || !headChin[i])) f[i] *= 1 - (1 - fd.factor) * c[i];
    }
  }
  // the neck sits behind the chin: wherever the chin covers, the neck's own fields do not show — handled by painting
  // order inside one layer: fields are applied by coverage, and the chin's edge shading already darkens its rim
  const lum = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { if (alpha[i] <= 0) continue; const g = Math.round(255 * Math.max(0, Math.min(1, f[i]))); lum[i * 4] = g; lum[i * 4 + 1] = g; lum[i * 4 + 2] = g; lum[i * 4 + 3] = Math.round(alpha[i] * 255); }
  // ink: K4 unchanged + drawn contours in K4's ink colour
  const inkCov = new Float32Array(W * H);
  if (spec.parameters.inkFromK4) for (let i = 0; i < W * H; i++) inkCov[i] = src.contourK4[i * 4 + 3] / 255;
  for (const c of spec.contours) for (const P of c.mirror ? [expand(c.points), expand(c.points).map(mirrorPt)] : [expand(c.points)]) lineCoverage(P, c.halfWidthPx, inkCov);
  const ink = new Uint8ClampedArray(W * H * 4), INK = spec.palette.ink;
  for (let i = 0; i < W * H; i++) if (inkCov[i] > 0) { ink[i * 4] = INK[0]; ink[i * 4 + 1] = INK[1]; ink[i * 4 + 2] = INK[2]; ink[i * 4 + 3] = Math.round(inkCov[i] * 255); }
  return { lum, ink, render: renderSkin(lum, ink, spec.palette.skinMedium, spec.palette.skinWarmth), chinPoly };
}
/** Skin token x luminance (with the token's warmth per channel), then the ink over it. Any skin tone can be rendered from
 *  the same luminance layer. */
export function renderSkin(lum, ink, skin, warmth = [1, 1, 1]) {
  const out = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const la = lum[i * 4 + 3] / 255, ka = ink[i * 4 + 3] / 255, a = la + ka * (1 - la);
    if (a <= 0) continue;
    const fct = lum[i * 4] / 255;
    for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.round((ink[i * 4 + c] * ka + Math.round(skin[c] * (1 - (1 - fct) * warmth[c])) * la * (1 - ka)) / a);
    out[i * 4 + 3] = Math.round(a * 255);
  }
  return out;
}

// ── checks ──────────────────────────────────────────────────────────────────────────────────────────────────────
const runs = (px, y) => { const r = []; let s = -1; for (let x = 0; x <= W; x++) { const on = x < W && px[(y * W + x) * 4 + 3] >= 128; if (on && s < 0) s = x; if (!on && s >= 0) { r.push([s, x - 1]); s = -1; } } return r; };
const span = (px, y) => { const s = new Set(); for (let x = 0; x < W; x++) if (px[(y * W + x) * 4 + 3] >= 128) s.add(x); return s; };
const symdiff = (a, b) => { let n = 0; for (const v of a) if (!b.has(v)) n++; for (const v of b) if (!a.has(v)) n++; return n; };
/** The checks of a head/neck asset. Gates that need H1 are NOT APPLICABLE here, never passed. */
export function checkHeadNeck(built, src, spec) {
  const L = built.lum, G = src.headGeometry, out = [];
  let headDiff = 0; for (let i = 0; i < (HEAD_LAST_ROW + 1) * W; i++) if ((L[i * 4 + 3] >= 128) !== (G[i * 4 + 3] >= 128)) headDiff++;
  out.push({ id: "UN-HEAD", name: "head geometry preserved: the solid set of rows <= 424 equals G1V3 + E2 exactly", ok: headDiff === 0, value: { differingPx: headDiff } });
  const bound = symdiff(span(G, HEAD_LAST_ROW - 1), span(G, HEAD_LAST_ROW)), s424 = span(L, HEAD_LAST_ROW), s425 = span(L, HEAD_LAST_ROW + 1);
  let inside = true; for (const v of s425) if (!s424.has(v)) inside = false;
  const step = symdiff(s424, s425);
  let oneRun = true, last = HEAD_LAST_ROW; for (let y = HEAD_LAST_ROW + 1; y < H; y++) { const r = runs(L, y); if (!r.length) break; if (r.length !== 1) oneRun = false; last = y; }
  out.push({ id: "UN-ATTACH", name: "neck attachment: row 425 lies inside row 424, the 424/425 step is at most the head geometry's own 423/424 step, and every N1 row is one solid run",
    ok: inside && step <= bound && oneRun, value: { step, bound, boundDerivation: "|S(G,423) symdiff S(G,424)| of the approved head geometry, computed at run time", row425InsideRow424: inside, everyRowOneRun: oneRun, lastSolidRow: last } });
  // one 8-connected solid component and no enclosed hole
  const solid = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) solid[i] = L[i * 4 + 3] >= 128 ? 1 : 0;
  const comps = (want) => { const seen = new Uint8Array(W * H); let n = 0, touchingBorder = 0; for (let i = 0; i < W * H; i++) { if (solid[i] !== want || seen[i]) continue; n++; let border = false; const st = [i]; seen[i] = 1; while (st.length) { const j = st.pop(), x = j % W, y = (j / W) | 0; if (!x || !y || x === W - 1 || y === H - 1) border = true; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (want === 0 && dx && dy) continue; const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const k = yy * W + xx; if (!seen[k] && solid[k] === want) { seen[k] = 1; st.push(k); } } } if (border) touchingBorder++; } return { n, touchingBorder }; };
  const fg = comps(1), bg = comps(0);
  out.push({ id: "UN-SHAPE", name: "one solid component, no enclosed transparent hole", ok: fg.n === 1 && bg.n === bg.touchingBorder, value: { solidComponents: fg.n, transparentComponents: bg.n, enclosedHoles: bg.n - bg.touchingBorder } });
  let maxRow = 0; for (let i = 0; i < W * H; i++) if (L[i * 4 + 3] > 0) maxRow = Math.max(maxRow, (i / W) | 0);
  out.push({ id: "UN-EXTENT", name: "nothing below the documented neck bottom", ok: maxRow < spec.neckGeometryN1.neck.bottom, value: { lastRowWithAlpha: maxRow, neckBottom: spec.neckGeometryN1.neck.bottom } });
  let chroma = 0; for (let i = 0; i < W * H; i++) if (L[i * 4 + 3] > 0) chroma = Math.max(chroma, Math.max(L[i * 4], L[i * 4 + 1], L[i * 4 + 2]) - Math.min(L[i * 4], L[i * 4 + 1], L[i * 4 + 2]));
  out.push({ id: "UN-LUMINANCE", name: "the luminance layer is achromatic", ok: chroma === 0, value: { maxChroma: chroma } });
  const notApplicable = [
    { id: "pre.join-continuity", status: "NOT APPLICABLE", why: "it compares a generated head's row 424 with H1's row 425 (D-141); this asset contains no H1 pixels and has no H1 handover — UN-ATTACH checks the self-drawn handover instead" },
    { id: "pre.transition-silhouette", status: "NOT APPLICABLE", why: "it requires rows 425..445 to be identical to H1's TRANSITION silhouette (D-133); this asset deliberately replaces H1's continuation with the self-drawn N1, so the gate has no reference here" },
  ];
  return { checks: out, notApplicable, firstFailure: out.find((c) => !c.ok)?.id ?? null };
}

// ── CLI ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const invokedDirectly = typeof process.argv[1] === "string" && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  const args = process.argv.slice(2), arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const specFile = arg("--spec"), outDir = arg("--out"); if (!specFile || !outDir) throw new Error("usage: --spec <spec.json> --out <empty dir>");
  const OUT = resolve(outDir); if (existsSync(OUT) && readdirSync(OUT).length) throw new Error("output directory not empty"); mkdirSync(OUT, { recursive: true });
  const specBuf = readFileSync(resolve(specFile)), spec = JSON.parse(specBuf.toString("utf8")), src = loadSources(spec), built = buildHeadNeck(spec, src), chk = checkHeadNeck(built, src, spec);
  for (const [k, px] of [["luminance", built.lum], ["ink", built.ink], ["medium", built.render]]) writeFileSync(join(OUT, `${spec.id}-${k}.png`), encodePng(W, H, px));
  const res = { id: spec.id, specSha256: sha(specBuf), pixelSha256: { luminance: pixelSha256(built.lum), ink: pixelSha256(built.ink), medium: pixelSha256(built.render) }, ...chk };
  writeFileSync(join(OUT, `${spec.id}.checks.json`), JSON.stringify(res, null, 2) + "\n");
  console.log(JSON.stringify({ id: spec.id, pixelSha256: res.pixelSha256, checks: chk.checks.map((c) => `${c.id}:${c.ok}`), first: chk.firstFailure, attach: chk.checks[1].value }));
}
