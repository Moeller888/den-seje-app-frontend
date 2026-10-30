/**
 * Pure 2D geometry in scene coordinates (spec 03 C2/C4/C6).
 *
 * Tolerance: all predicates use the absolute tolerance EPS (1e-6 scene units).
 * A point within EPS of a polygon edge counts as ON the edge, and points on the
 * edge of a walk zone or trigger zone count as INSIDE. Blockers exclude only
 * their strict interior, so walking along a blocker edge is allowed.
 */

export type Vec2 = readonly [number, number];
export type Poly = readonly Vec2[];

export const EPS = 1e-6;

export function nearlyEqual(a: number, b: number, eps = EPS): boolean {
  return Math.abs(a - b) <= eps;
}

export function pointsNearlyEqual(a: Vec2, b: Vec2, eps = EPS): boolean {
  return nearlyEqual(a[0], b[0], eps) && nearlyEqual(a[1], b[1], eps);
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

/** Linear interpolation a + t·(b − a). */
export function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Sign of the cross product (b − a) × (c − a) with tolerance: 1, −1 or 0 (collinear). */
export function orient(a: Vec2, b: Vec2, c: Vec2): number {
  const v = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const scale = Math.max(1, Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]));
  if (Math.abs(v) <= EPS * scale) return 0;
  return v > 0 ? 1 : -1;
}

function withinBox(a: Vec2, b: Vec2, p: Vec2): boolean {
  return (
    Math.min(a[0], b[0]) - EPS <= p[0] &&
    p[0] <= Math.max(a[0], b[0]) + EPS &&
    Math.min(a[1], b[1]) - EPS <= p[1] &&
    p[1] <= Math.max(a[1], b[1]) + EPS
  );
}

/** True if segments ab and cd intersect (including touching). */
export function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  return (
    (o1 === 0 && withinBox(a, b, c)) ||
    (o2 === 0 && withinBox(a, b, d)) ||
    (o3 === 0 && withinBox(c, d, a)) ||
    (o4 === 0 && withinBox(c, d, b))
  );
}

export interface ClosestPoint {
  readonly point: Vec2;
  /** Parameter along the segment, 0..1. */
  readonly t: number;
  readonly distSq: number;
}

export function closestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): ClosestPoint {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  const point: Vec2 = [a[0] + dx * t, a[1] + dy * t];
  const ex = p[0] - point[0];
  const ey = p[1] - point[1];
  return { point, t, distSq: ex * ex + ey * ey };
}

export function pointOnSegment(p: Vec2, a: Vec2, b: Vec2, eps = EPS): boolean {
  return closestPointOnSegment(p, a, b).distSq <= eps * eps;
}

export function edgesOf(poly: Poly): Array<[Vec2, Vec2]> {
  const out: Array<[Vec2, Vec2]> = [];
  for (let i = 0; i < poly.length; i++) out.push([poly[i] as Vec2, poly[(i + 1) % poly.length] as Vec2]);
  return out;
}

/** True if p lies within EPS of the polygon boundary. */
export function pointOnPolygonEdge(p: Vec2, poly: Poly, eps = EPS): boolean {
  return edgesOf(poly).some(([a, b]) => pointOnSegment(p, a, b, eps));
}

/** Even-odd test; points on the boundary (within EPS) count as inside. */
export function pointInPolygon(p: Vec2, poly: Poly): boolean {
  if (pointOnPolygonEdge(p, poly)) return true;
  return strictCrossing(p, poly);
}

/** Inside and not on the boundary. */
export function pointStrictlyInPolygon(p: Vec2, poly: Poly): boolean {
  return !pointOnPolygonEdge(p, poly) && strictCrossing(p, poly);
}

function strictCrossing(p: Vec2, poly: Poly): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const pi = poly[i] as Vec2;
    const pj = poly[j] as Vec2;
    if (pi[1] > p[1] !== pj[1] > p[1] && p[0] < ((pj[0] - pi[0]) * (p[1] - pi[1])) / (pj[1] - pi[1]) + pi[0]) inside = !inside;
  }
  return inside;
}

/** Closest point on the polygon boundary; ties resolve to the first edge in order. */
export function closestPointOnPolygonBoundary(p: Vec2, poly: Poly): ClosestPoint & { readonly edge: number } {
  const es = edgesOf(poly);
  let best = { ...closestPointOnSegment(p, (es[0] as [Vec2, Vec2])[0], (es[0] as [Vec2, Vec2])[1]), edge: 0 };
  for (let edge = 1; edge < es.length; edge++) {
    const [a, b] = es[edge] as [Vec2, Vec2];
    const c = closestPointOnSegment(p, a, b);
    if (c.distSq < best.distSq) best = { ...c, edge };
  }
  return best;
}

/**
 * Parameters t in [0, 1] along ab where ab meets an edge of the polygon
 * (crossings, touches and both ends of collinear overlaps).
 */
export function segmentPolygonParams(a: Vec2, b: Vec2, poly: Poly): number[] {
  const out: number[] = [];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  for (const [c, d] of edgesOf(poly)) {
    const ex = d[0] - c[0];
    const ey = d[1] - c[1];
    const denom = dx * ey - dy * ex;
    if (Math.abs(denom) > EPS * EPS) {
      const t = ((c[0] - a[0]) * ey - (c[1] - a[1]) * ex) / denom;
      const u = ((c[0] - a[0]) * dy - (c[1] - a[1]) * dx) / denom;
      if (t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS) out.push(clamp01(t));
    } else if (len2 > 0 && orient(a, b, c) === 0) {
      // Collinear: project the edge ends onto ab.
      for (const q of [c, d]) {
        const t = ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / len2;
        if (t >= -EPS && t <= 1 + EPS) out.push(clamp01(t));
      }
    }
  }
  return out;
}

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Sorted, de-duplicated parameters (within EPS) including 0 and 1. */
export function splitParams(ts: readonly number[]): number[] {
  const sorted = [0, 1, ...ts].sort((x, y) => x - y);
  const out: number[] = [];
  for (const t of sorted) if (out.length === 0 || t - (out[out.length - 1] as number) > EPS) out.push(t);
  if ((out[out.length - 1] as number) < 1) out[out.length - 1] = 1;
  return out;
}

// ---------------------------------------------------------------------------
// Walk areas: union of walk polygons minus blocker interiors
// ---------------------------------------------------------------------------

export interface Area {
  readonly walkable: readonly Poly[];
  readonly blockers: readonly Poly[];
}

export function isAllowed(area: Area, p: Vec2): boolean {
  return area.walkable.some((w) => pointInPolygon(p, w)) && !area.blockers.some((b) => pointStrictlyInPolygon(p, b));
}

/** Probe distance for the "walkable on at least one side" rule of segmentAllowed. */
export const SIDE_PROBE = 1e-3;

/**
 * True if every point of segment ab lies in the area (walk union, outside blocker
 * interiors) AND every piece has walkable space on at least one side within
 * SIDE_PROBE. The side rule rejects zero-width corridors, e.g. along a blocker
 * edge that coincides with the walk zone's outer edge, while still allowing
 * walking along a blocker edge that borders open floor.
 */
export function segmentAllowed(area: Area, a: Vec2, b: Vec2): boolean {
  if (!isAllowed(area, a) || !isAllowed(area, b)) return false;
  const ts: number[] = [];
  for (const poly of [...area.walkable, ...area.blockers]) ts.push(...segmentPolygonParams(a, b, poly));
  const split = splitParams(ts);
  const len = distance(a, b);
  const nx = len === 0 ? 0 : (-(b[1] - a[1]) / len) * SIDE_PROBE;
  const ny = len === 0 ? 0 : ((b[0] - a[0]) / len) * SIDE_PROBE;
  for (let i = 0; i + 1 < split.length; i++) {
    const mid = lerp(a, b, ((split[i] as number) + (split[i + 1] as number)) / 2);
    if (!isAllowed(area, mid)) return false;
    if (len > 0 && !isAllowed(area, [mid[0] + nx, mid[1] + ny]) && !isAllowed(area, [mid[0] - nx, mid[1] - ny])) return false;
  }
  // Split points between two allowed pieces lie on a walk boundary (allowed) and never
  // strictly inside a blocker (the neighbouring midpoints would be inside it too).
  return true;
}

/**
 * Nearest allowed point (spec 03 C4.3). Inside → the point itself. Otherwise the
 * closest point on any walk/blocker edge that is allowed; ties resolve by content
 * order (walk polygons first, then blockers; edges in order). Null if the area is empty.
 */
export function nearestAllowedPoint(area: Area, p: Vec2): Vec2 | null {
  if (isAllowed(area, p)) return p;
  let best: ClosestPoint | null = null;
  for (const poly of [...area.walkable, ...area.blockers]) {
    for (const [a, b] of edgesOf(poly)) {
      const c = closestPointOnSegment(p, a, b);
      if ((best === null || c.distSq < best.distSq - EPS * EPS) && isAllowed(area, c.point)) best = c;
    }
  }
  return best === null ? null : best.point;
}

export interface ZoneTransition {
  /** Parameter along the segment (0..1) where the state changes. */
  readonly t: number;
  readonly inside: boolean;
}

/**
 * State changes when moving from a to b relative to a zone (boundary counts as
 * inside). Uses segment crossings, so a thin zone crossed within one step yields
 * an enter followed by an exit. A mere touch of a vertex yields no change.
 */
export function zoneTransitions(a: Vec2, b: Vec2, poly: Poly): ZoneTransition[] {
  const split = splitParams(segmentPolygonParams(a, b, poly));
  const out: ZoneTransition[] = [];
  let state = pointInPolygon(a, poly);
  for (let i = 0; i + 1 < split.length; i++) {
    const t0 = split[i] as number;
    const mid = pointInPolygon(lerp(a, b, (t0 + (split[i + 1] as number)) / 2), poly);
    if (mid !== state) {
      out.push({ t: t0, inside: mid });
      state = mid;
    }
  }
  const end = pointInPolygon(b, poly);
  if (end !== state) out.push({ t: 1, inside: end });
  return out;
}

// ---------------------------------------------------------------------------
// Polygon validation helpers (used by content validation)
// ---------------------------------------------------------------------------

/** Returns a reason string if the polygon is degenerate (< 3 points, non-finite, zero area or self-intersecting), else null. */
export function polygonProblem(poly: Poly): string | null {
  if (!Array.isArray(poly) || poly.length < 3) return "polygon needs at least 3 points";
  for (const p of poly) {
    if (!Array.isArray(p) || p.length !== 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
      return "polygon points must be [x, y] pairs of finite numbers";
    }
  }
  const es = edgesOf(poly);
  for (let i = 0; i < es.length; i++) {
    for (let j = i + 1; j < es.length; j++) {
      const adjacent = j === i + 1 || (i === 0 && j === es.length - 1);
      if (adjacent) continue;
      const [a, b] = es[i] as [Vec2, Vec2];
      const [c, d] = es[j] as [Vec2, Vec2];
      if (segmentsIntersect(a, b, c, d)) return "polygon is self-intersecting";
    }
  }
  if (Math.abs(signedArea(poly)) <= EPS) return "polygon has zero area";
  return null;
}

export function signedArea(poly: Poly): number {
  let s = 0;
  for (const [a, b] of edgesOf(poly)) s += a[0] * b[1] - b[0] * a[1];
  return s / 2;
}

/** True if two simple polygons overlap with positive area or touch along an edge. */
export function polygonsOverlap(a: Poly, b: Poly): boolean {
  for (const [p, q] of edgesOf(a)) {
    for (const [r, s] of edgesOf(b)) {
      if (segmentsIntersect(p, q, r, s)) return true;
    }
  }
  return pointInPolygon(a[0] as Vec2, b) || pointInPolygon(b[0] as Vec2, a);
}

/** Deterministic interior point: centroid if strictly inside, else the first strictly interior fan-triangle centroid. */
export function interiorPoint(poly: Poly): Vec2 {
  let cx = 0;
  let cy = 0;
  for (const p of poly) {
    cx += p[0];
    cy += p[1];
  }
  const c: Vec2 = [cx / poly.length, cy / poly.length];
  if (pointStrictlyInPolygon(c, poly)) return c;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i] as Vec2;
    for (let j = 1; j < poly.length - 1; j++) {
      const b = poly[(i + j) % poly.length] as Vec2;
      const d = poly[(i + j + 1) % poly.length] as Vec2;
      const t: Vec2 = [(a[0] + b[0] + d[0]) / 3, (a[1] + b[1] + d[1]) / 3];
      if (pointStrictlyInPolygon(t, poly)) return t;
    }
  }
  return poly[0] as Vec2;
}
