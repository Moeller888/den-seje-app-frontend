/**
 * Polygon editing and the editor view transform (phase 6, §5). Pure functions;
 * the geometry rules themselves (simple polygon, degenerate edges, inside
 * tests, paths) come from @adventure-engine/geometry, the engine's own code.
 */

import { pointInPolygon, polygonProblem, type Poly, type Vec2 } from "@adventure-engine/geometry";

/** Editor view: scene point × zoom + pan = screen point. */
export interface View {
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
}

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;

export function sceneToScreen(v: View, p: Vec2): Vec2 {
  return [p[0] * v.zoom + v.panX, p[1] * v.zoom + v.panY];
}

export function screenToScene(v: View, p: Vec2): Vec2 {
  return [(p[0] - v.panX) / v.zoom, (p[1] - v.panY) / v.zoom];
}

/** Zoom by `factor` around a screen point (the scene point under it stays put). */
export function zoomAt(v: View, factor: number, at: Vec2): View {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor));
  const s = screenToScene(v, at);
  return { zoom, panX: at[0] - s[0] * zoom, panY: at[1] - s[1] * zoom };
}

/** The view that fits a scene into a box with a margin. */
export function fitView(scene: { readonly width: number; readonly height: number }, box: { readonly width: number; readonly height: number }, margin = 16): View {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min((box.width - 2 * margin) / scene.width, (box.height - 2 * margin) / scene.height)));
  return { zoom, panX: (box.width - scene.width * zoom) / 2, panY: (box.height - scene.height * zoom) / 2 };
}

/** Round to whole scene pixels, or to the grid when snapping. */
export function snap(p: Vec2, grid: number | null): Vec2 {
  const step = grid !== null && grid > 0 ? grid : 1;
  return [Math.round(p[0] / step) * step, Math.round(p[1] / step) * step];
}

export function movePoint(poly: Poly, index: number, to: Vec2): Poly {
  if (index < 0 || index >= poly.length) throw new RangeError(`no point ${index}`);
  return poly.map((p, i) => (i === index ? to : p));
}

/** Insert a point after `index` (−1: at the start). */
export function insertPoint(poly: Poly, index: number, p: Vec2): Poly {
  if (index < -1 || index >= poly.length) throw new RangeError(`no point ${index}`);
  return [...poly.slice(0, index + 1), p, ...poly.slice(index + 1)];
}

export function deletePoint(poly: Poly, index: number): Poly {
  if (index < 0 || index >= poly.length) throw new RangeError(`no point ${index}`);
  return poly.filter((_, i) => i !== index);
}

/** Squared distance from p to the segment a–b. */
function segDist2(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len));
  const x = a[0] + t * dx - p[0];
  const y = a[1] + t * dy - p[1];
  return x * x + y * y;
}

/** Index of the edge (from point i to i+1, closing) nearest to p: a new point goes after i. */
export function nearestEdge(poly: Poly, p: Vec2): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const d = segDist2(p, poly[i] as Vec2, poly[(i + 1) % poly.length] as Vec2);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Index of the point within `radius` of p (nearest), or −1. */
export function hitPoint(poly: Poly, p: Vec2, radius: number): number {
  let best = -1;
  let bestD = radius * radius;
  poly.forEach((q, i) => {
    const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2;
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/**
 * Problems of a polygon as the engine sees them (fewer than three points,
 * non-finite numbers, degenerate edges, self-intersection), or null.
 */
export function polygonIssue(poly: Poly): string | null {
  if (!poly.every((p) => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))) return "points must be finite numbers";
  return polygonProblem(poly);
}

/** Whether a point lies in a polygon (engine rule). */
export const inside = (poly: Poly, p: Vec2): boolean => pointInPolygon(p, poly);

/** A small square around a point: the starting shape of a new zone. */
export function squareAt(p: Vec2, half = 40): Poly {
  return [
    [p[0] - half, p[1] - half],
    [p[0] + half, p[1] - half],
    [p[0] + half, p[1] + half],
    [p[0] - half, p[1] + half],
  ];
}
