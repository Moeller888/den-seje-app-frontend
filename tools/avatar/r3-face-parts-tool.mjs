// R3 face-neutral PARTS TOOL — D-164 (contract: faceNeutralPartsMethod). Library only: no side effects, no network,
// no credentials, no claims, no image request. It never writes a file; the CLI r3-face-parts-compose.mjs does.
//
// Workflow (D-164):
//   raw 1024x1024 sheet (never modified)
//     -> RAW checks (binding: format, size, every fixed cell non-empty, nothing cut at a cell boundary)
//        + RAW diagnostics (stray pixels, edge distance, marker / skin / near-white colours) — never reject
//     -> fixed cell extraction (2x2, 512 px)
//     -> per part: APPROVED source-point annotation (separate metadata) + APPROVED target points
//     -> least-squares UNIFORM POSITIVE scale + translation (no rotation, no reflection, no per-axis scale, no warp)
//     -> pinned area-filter resampling + pinned rounding, source-over into ONE 1024x1536 face layer
//     -> COMPOSED checks: the EXISTING D-159 checker (AUTO-1..5 incl. the binding broad envelope, DIAG-1..8)
//        + residuals, overlap, owner-review flags
//   bbox / alpha NEVER set scale or translation. They only reject (empty, cut, outside canvas) or diagnose.
//   The residual is REVIEW-ONLY (D-164): always logged and shown, never a numeric rejection.
import { createHash } from "node:crypto";
import { deflateSync, inflateSync } from "node:zlib";

export const TOOL_ID = "r3-face-parts-tool-v1";
export const LAYOUT = Object.freeze({
  id: "r3-face-parts-2x2-v1", sheet: [1024, 1024], cell: [512, 512],
  cells: Object.freeze({ browLeft: [0, 0], browRight: [1, 0], nose: [0, 1], mouth: [1, 1] }),
  order: Object.freeze(["browLeft", "browRight", "nose", "mouth"]),
});
export const PART_POINTS = Object.freeze({ browLeft: ["inner", "outer"], browRight: ["inner", "outer"], nose: ["top", "bottom"], mouth: ["left", "right"] });
export const MASTER = Object.freeze({ w: 1024, h: 1536 });
export const ANNOTATION_SCHEMA = "r3-face-parts-annotation-v1";
export const TARGETS_SCHEMA = "r3-face-neutral-targets-v1";
export const REVIEW_FLAGS = Object.freeze(["orientation", "proportions", "lineWeight", "style", "other"]);
// Status values per mode. PRODUCTION accepts only owner approval; synthetic statuses are never accepted there.
export const MODES = Object.freeze({
  production: { annotation: ["APPROVED"], targets: ["APPROVED"] },
  "synthetic-test": { annotation: ["SYNTHETIC_TEST_APPROVED"], targets: ["SYNTHETIC_TEST_APPROVED"] },
  preview: { annotation: ["SYNTHETIC_TEST_APPROVED", "APPROVED"], targets: ["DRAFT", "SYNTHETIC_TEST_APPROVED", "APPROVED"] }, // review images only; output is marked PREVIEW
});
export const sha256 = (b) => createHash("sha256").update(b).digest("hex");
export const pixelSha256 = (px) => sha256(Buffer.from(px.buffer, px.byteOffset, px.byteLength));

// ═════════════════════════════════ PNG ═════════════════════════════════
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** 8-bit RGBA, filter 0, zlib level 9. File bytes depend on the zlib build; pixelSha256 does not. */
export function encodePng(w, h, px) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) Buffer.from(px.buffer, px.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}
/** Returns { ok, error?, header?, px? } — never throws on bad input. px only for 8-bit RGBA non-interlaced. */
export function decodePng(buf) {
  const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!Buffer.isBuffer(buf) || buf.length < 33 || SIG.some((v, i) => buf[i] !== v)) return { ok: false, error: "not a PNG" };
  let p = 8, header = null; const idat = [];
  while (p + 12 <= buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString("ascii", p + 4, p + 8);
    if (p + 12 + len > buf.length) return { ok: false, error: "truncated chunk " + type };
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") header = { w: data.readUInt32BE(0), h: data.readUInt32BE(4), bitDepth: data[8], colourType: data[9], interlace: data[12] };
    else if (type === "IDAT") idat.push(data); else if (type === "IEND") break;
    p += 12 + len;
  }
  if (!header || !idat.length) return { ok: false, error: "missing IHDR or IDAT" };
  if (header.bitDepth !== 8 || header.colourType !== 6 || header.interlace !== 0) return { ok: true, header, px: null };
  let raw; try { raw = inflateSync(Buffer.concat(idat)); } catch { return { ok: false, error: "IDAT does not inflate", header }; }
  const { w, h } = header, st = w * 4;
  if (raw.length < h * (st + 1)) return { ok: false, error: "image data too short", header };
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (st + 1)], row = y * (st + 1) + 1;
    if (f > 4) return { ok: false, error: "bad filter byte", header };
    for (let x = 0; x < st; x++) {
      const a = x >= 4 ? px[y * st + x - 4] : 0, b = y ? px[(y - 1) * st + x] : 0, c = x >= 4 && y ? px[(y - 1) * st + x - 4] : 0;
      let v = raw[row + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[y * st + x] = v & 255;
    }
  }
  return { ok: true, header, px };
}

// ═════════════════════════════════ raw sheet ═════════════════════════════════
export function extractCell(sheetPx, name) {
  const [SW] = LAYOUT.sheet, [CW, CH] = LAYOUT.cell, pos = LAYOUT.cells[name];
  if (!pos) throw new Error("unknown part " + name);
  const [cx, cy] = pos, px = new Uint8ClampedArray(CW * CH * 4);
  for (let y = 0; y < CH; y++) px.set(sheetPx.subarray(((cy * CH + y) * SW + cx * CW) * 4, ((cy * CH + y) * SW + cx * CW + CW) * 4), y * CW * 4);
  return { w: CW, h: CH, px };
}
const RGB_LAB = (() => {
  const linC = (c) => { c /= 255; return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92; };
  return ([r, g, b]) => {
    const R = linC(r), G = linC(g), B = linC(b), t = (v) => (v > 216 / 24389 ? Math.cbrt(v) : (24389 / 27 * v + 16) / 116);
    const X = t((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047), Y = t(0.2126 * R + 0.7152 * G + 0.0722 * B), Z = t((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
    return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
  };
})();
const U1_SKIN = [254, 197, 128], MARKERS = { cyan: [0, 255, 255], magenta: [255, 0, 255] };
/** Per-cell diagnostics. Alpha/bbox here are TECHNICAL only. Colour diagnostics use simple, stated rules and never reject. */
export function cellDiagnostics({ w, h, px }) {
  let support = null, solid = null, supportPx = 0, solidPx = 0, faintPx = 0, boundaryPx = 0, minEdge = null, markerPx = 0, skinLikePx = 0, nearWhitePx = 0;
  const grow = (bb, x, y) => (bb ? [Math.min(bb[0], x), Math.min(bb[1], y), Math.max(bb[2], x), Math.max(bb[3], y)] : [x, y, x, y]);
  const skinLab = RGB_LAB(U1_SKIN);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4, a = px[o + 3];
    if (!a) continue;
    supportPx++; support = grow(support, x, y);
    if (a >= 128) { solidPx++; solid = grow(solid, x, y); } else faintPx++;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) boundaryPx++;
    const e = Math.min(x, y, w - 1 - x, h - 1 - y); minEdge = minEdge === null ? e : Math.min(minEdge, e);
    const rgb = [px[o], px[o + 1], px[o + 2]];
    if (Object.values(MARKERS).some((m) => Math.abs(m[0] - rgb[0]) <= 8 && Math.abs(m[1] - rgb[1]) <= 8 && Math.abs(m[2] - rgb[2]) <= 8)) markerPx++;
    if (a >= 128) { const L = RGB_LAB(rgb), d = Math.hypot(L[0] - skinLab[0], L[1] - skinLab[1], L[2] - skinLab[2]); if (d <= 6) skinLikePx++; if (L[0] >= 90 && Math.hypot(L[1], L[2]) <= 8) nearWhitePx++; }
  }
  // connected components (8-connectivity) over alpha > 0; "stray" = pixels outside the largest component
  const seen = new Uint8Array(w * h), sizes = [];
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || !px[i * 4 + 3]) continue;
    let n = 0; const st = [i]; seen[i] = 1;
    while (st.length) { const q = st.pop(), x = q % w, y = (q / w) | 0; n++; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const r = yy * w + xx; if (!seen[r] && px[r * 4 + 3]) { seen[r] = 1; st.push(r); } } }
    sizes.push(n);
  }
  sizes.sort((a, b) => b - a);
  return { supportBox: support, solidBox: solid, supportPx, solidPx, faintPx, boundaryPx, minEdgeDistancePx: minEdge, components: sizes.length, largestComponentPx: sizes[0] ?? 0, strayPx: supportPx - (sizes[0] ?? 0), markerColourPx: markerPx, skinLikeSolidPx: skinLikePx, nearWhiteSolidPx: nearWhitePx };
}
const RESULT = Object.freeze({ ok: "PASS", rejected: "REJECT" });
/**
 * RAW checks on the sheet bytes. Binding (D-164): RAW-1..5 reject; RDIAG never reject.
 * The old global face envelope is deliberately NOT applied to a sheet.
 */
export function checkRawSheet(buf) {
  const auto = [], diag = [];
  const step = (id, name, ok, detail) => { auto.push({ id, name, status: ok ? RESULT.ok : RESULT.rejected, detail }); return ok; };
  const P = decodePng(buf);
  const fail = (id) => ({ verdict: "REJECT", firstFailure: id, auto, diag, rawSha256: Buffer.isBuffer(buf) ? sha256(buf) : null });
  if (!step("RAW-1", "PNG decodes", P.ok, P.ok ? "ok" : P.error)) return fail("RAW-1");
  if (!step("RAW-2", "sheet 1024x1024", P.header.w === 1024 && P.header.h === 1024, `${P.header.w}x${P.header.h}`)) return fail("RAW-2");
  if (!step("RAW-3", "RGBA 8-bit, not interlaced", !!P.px, `colour type ${P.header.colourType}, bit depth ${P.header.bitDepth}, interlace ${P.header.interlace}`)) return fail("RAW-3");
  const cells = Object.fromEntries(LAYOUT.order.map((n) => [n, cellDiagnostics(extractCell(P.px, n))]));
  const empty = LAYOUT.order.filter((n) => !cells[n].supportPx);
  if (!step("RAW-4", "every fixed cell has content (alpha > 0)", !empty.length, empty.length ? `empty: ${empty.join(", ")}` : "4 of 4 cells")) return fail("RAW-4");
  const cut = LAYOUT.order.filter((n) => cells[n].boundaryPx);
  if (!step("RAW-5", "nothing cut at a cell boundary (alpha = 0 on every cell's outermost ring, incl. the sheet's centre lines)", !cut.length, cut.length ? cut.map((n) => `${n}: ${cells[n].boundaryPx} px`).join("; ") : "0 px")) return fail("RAW-5");
  for (const n of LAYOUT.order) {
    const c = cells[n];
    diag.push({ id: "RDIAG-1", part: n, name: "stray pixels outside the largest 8-connected component", value: { components: c.components, strayPx: c.strayPx }, flagged: c.strayPx > 0 });
    diag.push({ id: "RDIAG-2", part: n, name: "minimum distance from content to the cell edge (px)", value: c.minEdgeDistancePx, flagged: null, note: "reported only; no margin threshold is approved" });
    diag.push({ id: "RDIAG-3", part: n, name: "guide-marker colours (cyan/magenta ±8)", value: c.markerColourPx, flagged: c.markerColourPx > 0 });
    diag.push({ id: "RDIAG-4", part: n, name: "skin-like solid pixels (ΔE76 ≤ 6 to U1 skin)", value: c.skinLikeSolidPx, flagged: c.skinLikeSolidPx > 0 });
    diag.push({ id: "RDIAG-5", part: n, name: "near-white solid pixels (L* ≥ 90, chroma ≤ 8) — eye whites? (the nose highlight is also white)", value: c.nearWhiteSolidPx, flagged: c.nearWhiteSolidPx > 0 });
  }
  diag.push({ id: "RDIAG-6", name: "wrong part in a cell / text / eyes / hair / blush", value: "NOT APPLICABLE automatically", flagged: null, note: "visual review only" });
  return { verdict: "PASS_TO_ANNOTATION", firstFailure: null, auto, diag, cells, rawSha256: sha256(buf), px: P.px };
}

// ═════════════════════════════════ annotations + targets ═════════════════════════════════
const isPt = (p) => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === "number" && Number.isFinite(v));
export function validateTargets(targets, mode) {
  const m = MODES[mode]; if (!m) return { ok: false, code: "UNKNOWN_MODE" };
  if (!targets || targets.schema !== TARGETS_SCHEMA) return { ok: false, code: "TARGETS_SCHEMA_INVALID" };
  if (!m.targets.includes(targets.status)) return { ok: false, code: "TARGETS_NOT_APPROVED", why: `status ${targets.status} not accepted in ${mode} mode` };
  for (const part of LAYOUT.order) for (const k of PART_POINTS[part]) if (!isPt(targets.points?.[part]?.[k]?.xy)) return { ok: false, code: "TARGETS_POINTS_INVALID", why: `${part}.${k}` };
  return { ok: true };
}
export function validateAnnotation(ann, part, rawSha, mode) {
  const m = MODES[mode]; if (!m) return { ok: false, code: "UNKNOWN_MODE" };
  if (!ann) return { ok: false, code: "NO_ANNOTATION", why: `no annotation for ${part}` };
  if (ann.schema !== ANNOTATION_SCHEMA) return { ok: false, code: "ANNOTATION_SCHEMA_INVALID" };
  if (ann.raw?.sha256 !== rawSha) return { ok: false, code: "ANNOTATION_RAW_SHA_MISMATCH", why: "the annotation belongs to another raw sheet" };
  if (ann.layoutId !== LAYOUT.id) return { ok: false, code: "ANNOTATION_LAYOUT_MISMATCH" };
  if (ann.part !== part) return { ok: false, code: "ANNOTATION_PART_MISMATCH", why: `annotation is for ${ann.part}` };
  if (JSON.stringify(ann.cell) !== JSON.stringify(LAYOUT.cells[part])) return { ok: false, code: "ANNOTATION_CELL_MISMATCH", why: `cell ${JSON.stringify(ann.cell)} ≠ ${JSON.stringify(LAYOUT.cells[part])}` };
  if (!m.annotation.includes(ann.status)) return { ok: false, code: "ANNOTATION_NOT_APPROVED", why: `status ${ann.status} not accepted in ${mode} mode` };
  const names = PART_POINTS[part], keys = Object.keys(ann.points ?? {});
  if (keys.length !== names.length || !names.every((k) => isPt(ann.points[k]))) return { ok: false, code: "ANNOTATION_POINTS_INVALID", why: `need exactly ${names.join(" + ")} as finite [x, y]` };
  if (names.some((k) => ann.points[k][0] < 0 || ann.points[k][1] < 0 || ann.points[k][0] > LAYOUT.cell[0] || ann.points[k][1] > LAYOUT.cell[1])) return { ok: false, code: "ANNOTATION_POINT_OUTSIDE_CELL" };
  if ((ann.reviewFlags ?? []).some((f) => !REVIEW_FLAGS.includes(f))) return { ok: false, code: "ANNOTATION_REVIEW_FLAG_INVALID" };
  return { ok: true };
}

// ═════════════════════════════════ geometry ═════════════════════════════════
/**
 * q ≈ s·p + t with ONE scalar s (uniform) and t = (tx, ty). No rotation term exists in the model.
 * Least squares: s = Σ(p−p̄)·(q−q̄) / Σ|p−p̄|², t = q̄ − s·p̄. With two points the fit is EXACT only if the source and target
 * segments are parallel and equally directed; otherwise the residuals are non-zero and are reported.
 */
export function fitUniformScaleTranslate(src, dst) {
  const n = src.length, pm = [0, 0], qm = [0, 0];
  for (let i = 0; i < n; i++) { pm[0] += src[i][0] / n; pm[1] += src[i][1] / n; qm[0] += dst[i][0] / n; qm[1] += dst[i][1] / n; }
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { const dx = src[i][0] - pm[0], dy = src[i][1] - pm[1]; num += dx * (dst[i][0] - qm[0]) + dy * (dst[i][1] - qm[1]); den += dx * dx + dy * dy; }
  if (!(den > 0)) return { ok: false, code: "DEGENERATE_POINTS", why: "source points coincide" };
  const s = num / den;
  if (!(s > 0)) return { ok: false, code: "NON_POSITIVE_SCALE", why: `fitted s = ${s}: would need a reflection or 180° rotation (e.g. points swapped)` };
  const tx = qm[0] - s * pm[0], ty = qm[1] - s * pm[1];
  const residuals = src.map((p, i) => [dst[i][0] - (s * p[0] + tx), dst[i][1] - (s * p[1] + ty)]);
  const ang = (a, b) => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI, wrap = (d) => ((d + 540) % 360) - 180;
  const lenS = Math.hypot(src[1][0] - src[0][0], src[1][1] - src[0][1]), lenT = Math.hypot(dst[1][0] - dst[0][0], dst[1][1] - dst[0][1]);
  const maxR = Math.max(...residuals.map((r) => Math.hypot(r[0], r[1])));
  return { ok: true, s, tx, ty, residuals, residualMaxPx: maxR, angleDeviationDeg: wrap(ang(dst[0], dst[1]) - ang(src[0], src[1])), lengthRatio: lenT / lenS,
    fitDescription: maxR <= 1e-9 ? "EXACT (residual 0)" : "LEAST-SQUARES APPROXIMATION — not an exact fit; residuals reported" };
}
/** Exact area (box) filter on premultiplied RGBA; output in premultiplied float64 over the touched box. */
export function resampleArea(src, s, tx, ty, outW, outH) {
  const { w, h, px } = src;
  const X0 = Math.max(0, Math.floor(tx)), Y0 = Math.max(0, Math.floor(ty));
  const X1 = Math.min(outW - 1, Math.ceil(tx + s * w) - 1), Y1 = Math.min(outH - 1, Math.ceil(ty + s * h) - 1);
  const bw = Math.max(0, X1 - X0 + 1), bh = Math.max(0, Y1 - Y0 + 1), data = new Float64Array(bw * bh * 4), n = s * s;
  for (let Y = Y0; Y <= Y1; Y++) {
    const sy0 = (Y - ty) / s, sy1 = (Y + 1 - ty) / s, v0 = Math.max(0, Math.floor(sy0)), v1 = Math.min(h, Math.ceil(sy1));
    for (let X = X0; X <= X1; X++) {
      const sx0 = (X - tx) / s, sx1 = (X + 1 - tx) / s, u0 = Math.max(0, Math.floor(sx0)), u1 = Math.min(w, Math.ceil(sx1));
      let r = 0, g = 0, b = 0, a = 0;
      for (let v = v0; v < v1; v++) {
        const wy = Math.min(sy1, v + 1) - Math.max(sy0, v);
        for (let u = u0; u < u1; u++) {
          const o = (v * w + u) * 4, al = px[o + 3] / 255;
          if (!al) continue;
          const wt = (Math.min(sx1, u + 1) - Math.max(sx0, u)) * wy * al;
          r += wt * px[o]; g += wt * px[o + 1]; b += wt * px[o + 2]; a += wt;
        }
      }
      const o = ((Y - Y0) * bw + X - X0) * 4;
      data[o] = r * n; data[o + 1] = g * n; data[o + 2] = b * n; data[o + 3] = a * n;
    }
  }
  return { X0, Y0, bw, bh, data };
}
export function overInto(canvas, cw, layer) {
  let overlap = 0;
  for (let y = 0; y < layer.bh; y++) for (let x = 0; x < layer.bw; x++) {
    const lo = (y * layer.bw + x) * 4, a = layer.data[lo + 3];
    if (a <= 0) continue;
    const co = ((layer.Y0 + y) * cw + layer.X0 + x) * 4, k = 1 - a;
    if (canvas[co + 3] > 0) overlap++;
    for (let c = 0; c < 4; c++) canvas[co + c] = layer.data[lo + c] + canvas[co + c] * k;
  }
  return overlap;
}
export function quantise(canvas, cw, ch) {
  const out = new Uint8ClampedArray(cw * ch * 4);
  for (let i = 0; i < cw * ch; i++) {
    const a = canvas[i * 4 + 3], A = Math.round(a * 255);
    if (A <= 0) continue;
    for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.min(255, Math.max(0, Math.round(canvas[i * 4 + c] / a)));
    out[i * 4 + 3] = A;
  }
  return out;
}
export const CONVENTIONS = Object.freeze({
  coordinates: "continuous; pixel i covers [i, i+1). Source points are cell-local (origin = the cell's top-left); target points are master-canvas (1024x1536)",
  transform: "q = s·p + t, ONE positive scalar s, translation t; no rotation, reflection, per-axis scale, shear or warp",
  fit: "least squares over the part's two approved point pairs; residual vectors and the angle deviation are always reported",
  bboxRole: "alpha/bbox never set s or t; they only reject (empty, cut, outside canvas) or diagnose",
  filter: "exact area (box) filter over each output pixel's footprint, on premultiplied RGBA",
  colourSpace: "sRGB-encoded 8-bit values averaged directly (not linear light)",
  alpha: "files: straight (non-premultiplied) 8-bit RGBA; internally premultiplied float64",
  rounding: "alpha8 = Math.round(a·255); colour8 = clamp(Math.round(premul / a)); Math.round = half up; rounded alpha 0 → (0,0,0,0)",
  compositing: "source-over in the fixed order browLeft > browRight > nose > mouth",
  determinism: "IEEE-754 doubles, fixed operation order; identical inputs give identical pixels on the same engine. File bytes additionally depend on zlib; pixelSha256 does not",
  noQualityClaim: "geometric determinism says nothing about visual quality: line weight, style, edges and identity are judged by the owner's visual review",
});

/**
 * Compose a face layer. Returns { ok:false, stage, code, why } on the FIRST failure (nothing else produced), or
 * { ok:true, px (1024x1536 RGBA), layers, log }. Never modifies sheetPx (it is only read).
 */
export function composeFaceLayer({ sheetPx, rawSha, annotations, targets, mode }) {
  const vt = validateTargets(targets, mode);
  if (!vt.ok) return { ok: false, stage: "targets", ...vt };
  const canvas = new Float64Array(MASTER.w * MASTER.h * 4), layers = {}, parts = [];
  for (const part of LAYOUT.order) {
    const ann = annotations?.[part], va = validateAnnotation(ann, part, rawSha, mode);
    if (!va.ok) return { ok: false, stage: "annotation", part, ...va };
    const cell = extractCell(sheetPx, part), d = cellDiagnostics(cell);
    if (!d.supportPx) return { ok: false, stage: "cell", part, code: "EMPTY_PART" };
    if (d.boundaryPx) return { ok: false, stage: "cell", part, code: "CUT_AT_CELL_BOUNDARY" };
    const names = PART_POINTS[part], src = names.map((k) => ann.points[k]), dst = names.map((k) => targets.points[part][k].xy);
    const f = fitUniformScaleTranslate(src, dst);
    if (!f.ok) return { ok: false, stage: "fit", part, code: f.code, why: f.why };
    const [u0, v0, u1, v1] = d.supportBox, dest = [f.tx + f.s * u0, f.ty + f.s * v0, f.tx + f.s * (u1 + 1), f.ty + f.s * (v1 + 1)];
    if (dest[0] < 0 || dest[1] < 0 || dest[2] > MASTER.w || dest[3] > MASTER.h) return { ok: false, stage: "fit", part, code: "OUTSIDE_CANVAS" };
    const layer = resampleArea(cell, f.s, f.tx, f.ty, MASTER.w, MASTER.h);
    const solo = new Float64Array(MASTER.w * MASTER.h * 4); overInto(solo, MASTER.w, layer); layers[part] = quantise(solo, MASTER.w, MASTER.h);
    const overlapPx = overInto(canvas, MASTER.w, layer);
    const reviewReasons = [...(ann.reviewFlags ?? [])];
    if (f.residualMaxPx > 1e-9 && !reviewReasons.includes("orientation")) reviewReasons.push("orientation (residual reported; no threshold approved)");
    parts.push({ part, cell: LAYOUT.cells[part], cellPixelSha256: pixelSha256(cell.px), annotation: { version: ann.annotationVersion, status: ann.status, annotator: ann.annotator, reviewFlags: ann.reviewFlags ?? [] },
      sourcePoints: Object.fromEntries(names.map((k, i) => [k, src[i]])), targetPoints: Object.fromEntries(names.map((k, i) => [k, dst[i]])),
      transform: { s: f.s, tx: f.tx, ty: f.ty }, fitDescription: f.fitDescription,
      residualVectorsPx: Object.fromEntries(names.map((k, i) => [k, f.residuals[i]])), residualMaxPx: f.residualMaxPx, angleDeviationDeg: f.angleDeviationDeg, lengthRatio: f.lengthRatio,
      overlapPxWithEarlierParts: overlapPx, ownerReviewRequired: reviewReasons.length > 0, ownerReviewReasons: reviewReasons,
      technicalDiagnostics: { supportBox: d.supportBox, solidBox: d.solidBox, strayPx: d.strayPx, minEdgeDistancePx: d.minEdgeDistancePx, noSolidPixels: !d.solidPx } });
  }
  const px = quantise(canvas, MASTER.w, MASTER.h);
  return { ok: true, px, layers, log: { tool: TOOL_ID, mode, layout: LAYOUT, conventions: CONVENTIONS, rawSha256: rawSha, targets: { schema: targets.schema, version: targets.version, status: targets.status }, parts, output: { pixelSha256: pixelSha256(px), preview: mode === "preview" } } };
}
