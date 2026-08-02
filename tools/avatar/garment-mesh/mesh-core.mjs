// D-095 — deterministic piecewise-affine garment mesh: schema, validation, warp, metrics.
// ---------------------------------------------------------------------------------------------
// WHY THIS EXISTS. The shipped Ridderdragt (D-089) was fitted by ONE uniform scale, then clipped,
// then 8,608 pixels of the mandatory region were filled by the adapter because the artwork simply
// did not reach. A single scale cannot widen shoulders without also widening the waist, so the
// only remaining lever was backfill. A mesh gives many local levers instead of one global one.
//
// METHOD: piecewise-affine warping with INVERSE mapping and barycentric coordinates.
//   For every OUTPUT pixel we find the TARGET triangle containing it, express the pixel in that
//   triangle's barycentric coordinates, and read the SAME coordinates in the corresponding SOURCE
//   triangle. Inverse mapping is what guarantees every output pixel is written exactly once — a
//   forward map would leave holes wherever the mesh stretches.
//
// DETERMINISM, stated precisely because the project has been burned by "green but wrong":
//   - triangles are tested in their declared array order; the FIRST containing triangle wins, so a
//     pixel on a shared edge is never resolved by chance;
//   - containment uses an inclusive epsilon on the barycentric coordinates (EPS_INSIDE);
//   - sampling is bilinear on PREMULTIPLIED alpha (the same reason extract-master-base.mjs
//     premultiplies: unpremultiplied interpolation drags the RGB of transparent pixels into the
//     garment edge and produces exactly the halo D-058/D-061 fought);
//   - all rounding is Math.round on the final unpremultiplied channel;
//   - no randomness, no time, no platform-dependent rendering, no network.
// The same input therefore yields byte-identical output on any machine.
//
// This module is PURE. It never writes files and never touches the runtime.

export const TOOL = "garment-mesh-core";
export const TOOL_VERSION = "1.0.0";
export const SCHEMA_VERSION = 1;

// Barycentric containment tolerance. Slightly negative so pixels exactly on a shared edge are
// claimed by the first triangle rather than falling through the cracks between two.
export const EPS_INSIDE = -1e-9;
// A triangle smaller than this (in target space) cannot be rasterised meaningfully.
export const MIN_TRIANGLE_AREA = 1e-6;

const VALID_ROLES = new Set(["boundary", "interior", "feature"]);

// ── validation ────────────────────────────────────────────────────────────────────────────────
// Every failure is an explicit throw with the offending id/index named. A mesh that silently
// "mostly works" is the failure mode this whole file exists to avoid.
export function validateMesh(mesh, { canvasWidth, canvasHeight } = {}) {
  const errors = [];
  const fail = (m) => errors.push(m);

  if (!mesh || typeof mesh !== "object") throw new Error("mesh: not an object");
  if (mesh.version !== SCHEMA_VERSION) fail(`version ${mesh.version} != ${SCHEMA_VERSION}`);
  if (!mesh.canvas || typeof mesh.canvas.width !== "number" || typeof mesh.canvas.height !== "number") {
    fail("canvas.width/height missing or not numeric");
  }
  const W = mesh.canvas?.width, H = mesh.canvas?.height;
  if (canvasWidth != null && W !== canvasWidth) fail(`canvas.width ${W} != image ${canvasWidth}`);
  if (canvasHeight != null && H !== canvasHeight) fail(`canvas.height ${H} != image ${canvasHeight}`);

  if (!Array.isArray(mesh.vertices) || mesh.vertices.length < 3) fail("vertices: need at least 3");
  if (!Array.isArray(mesh.triangles) || mesh.triangles.length < 1) fail("triangles: need at least 1");
  if (errors.length) return { ok: false, errors };

  const byId = new Map();
  mesh.vertices.forEach((v, i) => {
    if (!v || typeof v.id !== "string" || v.id === "") { fail(`vertex[${i}]: missing id`); return; }
    if (byId.has(v.id)) fail(`vertex[${i}]: duplicate id "${v.id}"`);
    byId.set(v.id, v);
    for (const key of ["source", "target"]) {
      const p = v[key];
      if (!Array.isArray(p) || p.length !== 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
        fail(`vertex "${v.id}": ${key} must be [x, y] finite numbers`);
        continue;
      }
      // Outside the canvas the inverse map would sample nothing and the rasteriser would silently
      // drop geometry — refuse instead.
      if (p[0] < 0 || p[1] < 0 || p[0] > W || p[1] > H) {
        fail(`vertex "${v.id}": ${key} [${p[0]}, ${p[1]}] outside canvas ${W}x${H}`);
      }
    }
    if (v.role != null && !VALID_ROLES.has(v.role)) fail(`vertex "${v.id}": unknown role "${v.role}"`);
  });
  if (errors.length) return { ok: false, errors };

  mesh.triangles.forEach((t, i) => {
    if (!Array.isArray(t) || t.length !== 3) { fail(`triangle[${i}]: must be 3 vertex ids`); return; }
    for (const id of t) if (!byId.has(id)) fail(`triangle[${i}]: unknown vertex id "${id}"`);
  });
  if (errors.length) return { ok: false, errors };

  // Geometry: zero area and orientation flips. A flipped triangle mirrors its artwork — the visual
  // result is a smeared fold, and no coverage number would reveal it.
  const inverted = [], degenerate = [];
  mesh.triangles.forEach((t, i) => {
    const [a, b, c] = t.map((id) => byId.get(id));
    const sa = signedArea(a.source, b.source, c.source);
    const ta = signedArea(a.target, b.target, c.target);
    if (Math.abs(sa) < MIN_TRIANGLE_AREA) degenerate.push({ index: i, space: "source", area: sa });
    if (Math.abs(ta) < MIN_TRIANGLE_AREA) degenerate.push({ index: i, space: "target", area: ta });
    if (Math.sign(sa) !== Math.sign(ta) && Math.abs(sa) >= MIN_TRIANGLE_AREA && Math.abs(ta) >= MIN_TRIANGLE_AREA) {
      inverted.push({ index: i, ids: t, sourceArea: sa, targetArea: ta });
    }
  });
  for (const d of degenerate) fail(`triangle[${d.index}]: zero-area in ${d.space} (${d.area})`);
  for (const inv of inverted) fail(`triangle[${inv.index}] (${inv.ids.join(", ")}): orientation flipped — foldover`);

  // Constraints are declarative; validate they reference real vertices so a typo cannot silently
  // disable a constraint the author believes is holding the belt straight.
  const cons = mesh.constraints ?? {};
  for (const [name, pairs] of [["symmetryPairs", cons.symmetryPairs]]) {
    if (pairs == null) continue;
    if (!Array.isArray(pairs)) { fail(`constraints.${name}: not an array`); continue; }
    pairs.forEach((p, i) => {
      if (!Array.isArray(p) || p.length !== 2) { fail(`constraints.${name}[${i}]: must be a pair`); return; }
      for (const id of p) if (!byId.has(id)) fail(`constraints.${name}[${i}]: unknown vertex "${id}"`);
    });
  }
  for (const name of ["horizontalGroups", "verticalGroups"]) {
    const groups = cons[name];
    if (groups == null) continue;
    if (!Array.isArray(groups)) { fail(`constraints.${name}: not an array`); continue; }
    groups.forEach((g, i) => {
      if (!Array.isArray(g)) { fail(`constraints.${name}[${i}]: not an array`); return; }
      for (const id of g) if (!byId.has(id)) fail(`constraints.${name}[${i}]: unknown vertex "${id}"`);
    });
  }
  if (Array.isArray(cons.pinnedVertices)) {
    for (const id of cons.pinnedVertices) if (!byId.has(id)) fail(`constraints.pinnedVertices: unknown vertex "${id}"`);
  }

  return errors.length ? { ok: false, errors } : { ok: true, errors: [], vertexCount: byId.size, triangleCount: mesh.triangles.length };
}

export function assertValidMesh(mesh, opts) {
  const r = validateMesh(mesh, opts);
  if (!r.ok) throw new Error("invalid mesh:\n  - " + r.errors.join("\n  - "));
  return r;
}

function signedArea(p, q, r) {
  return 0.5 * ((q[0] - p[0]) * (r[1] - p[1]) - (r[0] - p[0]) * (q[1] - p[1]));
}

// ── constraint enforcement (applied to TARGET coordinates) ────────────────────────────────────
// Declarative constraints are only worth having if something enforces them. Applied in a fixed
// order so the result is deterministic when constraints overlap.
export function applyConstraints(mesh) {
  const byId = new Map(mesh.vertices.map((v) => [v.id, v]));
  const cons = mesh.constraints ?? {};
  const centreX = mesh.canvas.width / 2;

  // 1. pinned: target := source, unconditionally.
  for (const id of cons.pinnedVertices ?? []) {
    const v = byId.get(id);
    if (v) v.target = [v.source[0], v.source[1]];
  }
  // 2. per-vertex axis locks.
  for (const v of mesh.vertices) {
    if (v.lockedX) v.target[0] = v.source[0];
    if (v.lockedY) v.target[1] = v.source[1];
  }
  // 3. horizontal groups: share the mean Y, so a belt edge stays a straight horizontal line.
  for (const g of cons.horizontalGroups ?? []) {
    const vs = g.map((id) => byId.get(id)).filter(Boolean);
    if (vs.length < 2) continue;
    const y = vs.reduce((s, v) => s + v.target[1], 0) / vs.length;
    for (const v of vs) v.target[1] = y;
  }
  // 4. vertical groups: share the mean X, so the centre ridge stays a straight vertical line.
  for (const g of cons.verticalGroups ?? []) {
    const vs = g.map((id) => byId.get(id)).filter(Boolean);
    if (vs.length < 2) continue;
    const x = vs.reduce((s, v) => s + v.target[0], 0) / vs.length;
    for (const v of vs) v.target[0] = x;
  }
  // 5. symmetry pairs: mirror about the canvas centre, averaging the two so neither side dominates.
  for (const [lid, rid] of cons.symmetryPairs ?? []) {
    const l = byId.get(lid), r = byId.get(rid);
    if (!l || !r) continue;
    const dl = centreX - l.target[0], dr = r.target[0] - centreX;
    const d = (dl + dr) / 2;
    l.target[0] = centreX - d;
    r.target[0] = centreX + d;
    const y = (l.target[1] + r.target[1]) / 2;
    l.target[1] = y; r.target[1] = y;
  }
  return mesh;
}

// ── the warp ──────────────────────────────────────────────────────────────────────────────────
// rgba: Buffer/Uint8Array RGBA of the SOURCE image (w x h). Returns a new Buffer of the same size.
export function warp(mesh, srcRgba, w, h) {
  assertValidMesh(mesh, { canvasWidth: w, canvasHeight: h });
  const out = Buffer.alloc(w * h * 4);
  const byId = new Map(mesh.vertices.map((v) => [v.id, v]));

  // Precompute per-triangle target-space inverse basis + source vertices, in declared order.
  const tris = mesh.triangles.map((ids) => {
    const [A, B, C] = ids.map((id) => byId.get(id));
    const [ax, ay] = A.target, [bx, by] = B.target, [cx, cy] = C.target;
    const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    return {
      ids, ax, ay, bx, by, cx, cy, det,
      sA: A.source, sB: B.source, sC: C.source,
      minX: Math.floor(Math.min(ax, bx, cx)), maxX: Math.ceil(Math.max(ax, bx, cx)),
      minY: Math.floor(Math.min(ay, by, cy)), maxY: Math.ceil(Math.max(ay, by, cy)),
    };
  });

  let written = 0;
  // Iterate triangles, not pixels: each triangle rasterises its own target bbox. A pixel already
  // written by an earlier triangle is left alone — that is the deterministic edge tie-break.
  const claimed = new Uint8Array(w * h);
  for (const t of tris) {
    if (Math.abs(t.det) < 1e-12) continue;
    const y0 = Math.max(0, t.minY), y1 = Math.min(h - 1, t.maxY);
    const x0 = Math.max(0, t.minX), x1 = Math.min(w - 1, t.maxX);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * w + x;
        if (claimed[i]) continue;
        // Pixel centre, so a pixel is inside iff its centre is inside.
        const px = x + 0.5, py = y + 0.5;
        const l1 = ((t.by - t.cy) * (px - t.cx) + (t.cx - t.bx) * (py - t.cy)) / t.det;
        if (l1 < EPS_INSIDE) continue;
        const l2 = ((t.cy - t.ay) * (px - t.cx) + (t.ax - t.cx) * (py - t.cy)) / t.det;
        if (l2 < EPS_INSIDE) continue;
        const l3 = 1 - l1 - l2;
        if (l3 < EPS_INSIDE) continue;
        // Same barycentric coordinates, read in the source triangle.
        const sx = l1 * t.sA[0] + l2 * t.sB[0] + l3 * t.sC[0];
        const sy = l1 * t.sA[1] + l2 * t.sB[1] + l3 * t.sC[1];
        sampleBilinear(srcRgba, w, h, sx - 0.5, sy - 0.5, out, i * 4);
        claimed[i] = 1;
        written++;
      }
    }
  }
  return { rgba: out, writtenPixels: written };
}

// Bilinear on PREMULTIPLIED alpha, then unpremultiply. Outside the source canvas reads as fully
// transparent — never as clamped edge colour, which would smear the garment border outwards.
function sampleBilinear(src, w, h, fx, fy, out, o) {
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = fx - x0, ty = fy - y0;
  let r = 0, g = 0, b = 0, a = 0;
  for (let dy = 0; dy <= 1; dy++) {
    const yy = y0 + dy;
    const wy = dy === 0 ? 1 - ty : ty;
    if (wy === 0) continue;
    for (let dx = 0; dx <= 1; dx++) {
      const xx = x0 + dx;
      const wx = dx === 0 ? 1 - tx : tx;
      if (wx === 0) continue;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;   // outside → transparent
      const si = (yy * w + xx) * 4;
      const sa = src[si + 3];
      const k = wx * wy;
      r += src[si] * sa * k; g += src[si + 1] * sa * k; b += src[si + 2] * sa * k;
      a += sa * k;
    }
  }
  if (a <= 0) { out[o] = 0; out[o + 1] = 0; out[o + 2] = 0; out[o + 3] = 0; return; }
  out[o] = Math.round(r / a);
  out[o + 1] = Math.round(g / a);
  out[o + 2] = Math.round(b / a);
  out[o + 3] = Math.round(a);
}

// ── distortion metrics ────────────────────────────────────────────────────────────────────────
// Coverage alone cannot say whether the artwork survived: a mesh can cover the whole mask by
// smearing the belt across the chest. These are the numbers that make that visible.
export function distortionMetrics(mesh) {
  const byId = new Map(mesh.vertices.map((v) => [v.id, v]));
  const per = mesh.triangles.map((ids, index) => {
    const [A, B, C] = ids.map((id) => byId.get(id));
    const sa = signedArea(A.source, B.source, C.source);
    const ta = signedArea(A.target, B.target, C.target);
    const sEdges = edgeLengths(A.source, B.source, C.source);
    const tEdges = edgeLengths(A.target, B.target, C.target);
    const areaRatio = Math.abs(sa) < MIN_TRIANGLE_AREA ? Infinity : Math.abs(ta) / Math.abs(sa);
    const longestEdgeRatio = Math.max(...tEdges) / Math.max(...sEdges);
    const sAspect = Math.max(...sEdges) / Math.min(...sEdges);
    const tAspect = Math.max(...tEdges) / Math.min(...tEdges);
    const M = affineOf(A, B, C);
    return {
      index, ids,
      sourceArea: round6(Math.abs(sa)), targetArea: round6(Math.abs(ta)),
      areaRatio: round6(areaRatio),
      longestEdgeRatio: round6(longestEdgeRatio),
      aspectChange: round6(tAspect / sAspect),
      rotationDeg: round6(M.rotationDeg),
      shear: round6(M.shear),
      foldover: Math.sign(sa) !== Math.sign(ta),
    };
  });
  const ratios = per.map((p) => p.areaRatio).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  const pct = (q) => ratios.length ? ratios[Math.min(ratios.length - 1, Math.floor(q * (ratios.length - 1)))] : 0;
  const worst = per.slice().sort((a, b) =>
    Math.abs(Math.log(b.areaRatio || 1e-9)) - Math.abs(Math.log(a.areaRatio || 1e-9))).slice(0, 5);
  return {
    triangles: per,
    foldovers: per.filter((p) => p.foldover).length,
    areaRatio: { min: round6(ratios[0] ?? 0), median: round6(pct(0.5)), p95: round6(pct(0.95)), max: round6(ratios[ratios.length - 1] ?? 0) },
    maxLongestEdgeRatio: round6(Math.max(...per.map((p) => p.longestEdgeRatio))),
    maxAbsRotationDeg: round6(Math.max(...per.map((p) => Math.abs(p.rotationDeg)))),
    worstTriangles: worst.map((p) => ({ index: p.index, ids: p.ids, areaRatio: p.areaRatio, rotationDeg: p.rotationDeg })),
  };
}

function edgeLengths(p, q, r) {
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  return [d(p, q), d(q, r), d(r, p)];
}
// The affine that maps the source triangle onto the target triangle, decomposed enough to report
// rotation and shear separately from pure scaling.
function affineOf(A, B, C) {
  const s1 = [B.source[0] - A.source[0], B.source[1] - A.source[1]];
  const s2 = [C.source[0] - A.source[0], C.source[1] - A.source[1]];
  const t1 = [B.target[0] - A.target[0], B.target[1] - A.target[1]];
  const t2 = [C.target[0] - A.target[0], C.target[1] - A.target[1]];
  const det = s1[0] * s2[1] - s1[1] * s2[0];
  if (Math.abs(det) < 1e-12) return { rotationDeg: 0, shear: 0 };
  const a = (t1[0] * s2[1] - t2[0] * s1[1]) / det;
  const b = (t2[0] * s1[0] - t1[0] * s2[0]) / det;
  const c = (t1[1] * s2[1] - t2[1] * s1[1]) / det;
  const d = (t2[1] * s1[0] - t1[1] * s2[0]) / det;
  const rotation = Math.atan2(c, a) * 180 / Math.PI;
  const sx = Math.hypot(a, c);
  const shear = sx === 0 ? 0 : (a * b + c * d) / (sx * sx);
  return { rotationDeg: rotation, shear };
}
const round6 = (v) => (Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : v);
