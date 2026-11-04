/**
 * Polygon-based navigation (spec 03 C4): a visibility graph over all vertices of
 * the walk polygons and blockers, searched with A*.
 *
 * - Shortest paths in a polygonal domain bend only at polygon vertices, so a path
 *   through the visibility graph is already "string-pulled" (no funnel pass needed).
 * - The allowed area is the union of walk polygons minus blocker interiors
 *   (see Area); blocker edges themselves are walkable.
 * - Determinism: graph nodes are numbered in content order (walk polygons, then
 *   blockers; vertices in order; near-duplicates within EPS keep the first).
 *   The open set is ordered by (f, h, node index); a node is only relaxed when the
 *   new cost is strictly lower (by more than EPS), so equal-cost alternatives keep
 *   the path found first in index order.
 */
import { EPS, distance, isAllowed, nearestAllowedPoint, pointsNearlyEqual, segmentAllowed, type Area, type Vec2 } from "./shapes.ts";

export interface NavGraph {
  readonly area: Area;
  readonly nodes: readonly Vec2[];
  /** Adjacency lists (ascending node index) with edge lengths. */
  readonly adjacency: ReadonlyArray<ReadonlyArray<{ readonly to: number; readonly cost: number }>>;
}

export function buildNavGraph(area: Area): NavGraph {
  const nodes: Vec2[] = [];
  for (const poly of [...area.walkable, ...area.blockers]) {
    for (const v of poly) {
      if (isAllowed(area, v) && !nodes.some((n) => pointsNearlyEqual(n, v))) nodes.push(v);
    }
  }
  const adjacency: Array<Array<{ to: number; cost: number }>> = nodes.map(() => []);
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i] as Vec2;
      const b = nodes[j] as Vec2;
      if (segmentAllowed(area, a, b)) {
        const cost = distance(a, b);
        (adjacency[i] as Array<{ to: number; cost: number }>).push({ to: j, cost });
        (adjacency[j] as Array<{ to: number; cost: number }>).push({ to: i, cost });
      }
    }
  }
  for (const list of adjacency) list.sort((x, y) => x.to - y.to);
  return { area, nodes, adjacency };
}

export interface PathResult {
  /** Waypoints from the (projected) start to the (projected) goal, inclusive. */
  readonly points: readonly Vec2[];
  readonly length: number;
  /** The goal after projection into the allowed area (spec 03 C4.3). */
  readonly goal: Vec2;
}

/**
 * Shortest path from `from` to `to`. Points outside the allowed area are first
 * projected to the nearest allowed point. Returns null if the area is empty or
 * start and goal lie in disconnected parts (spec 03 C4.4).
 */
export function findPath(graph: NavGraph, from: Vec2, to: Vec2): PathResult | null {
  const start = nearestAllowedPoint(graph.area, from);
  const goal = nearestAllowedPoint(graph.area, to);
  if (start === null || goal === null) return null;
  if (pointsNearlyEqual(start, goal)) return { points: [start], length: 0, goal };
  if (segmentAllowed(graph.area, start, goal)) return { points: [start, goal], length: distance(start, goal), goal };

  const n = graph.nodes.length;
  const S = n;
  const G = n + 1;
  const pos = (i: number): Vec2 => (i === S ? start : i === G ? goal : (graph.nodes[i] as Vec2));
  const neighbours = (i: number): Array<{ to: number; cost: number }> => {
    if (i === S) return visibleFrom(graph, start).map((to) => ({ to, cost: distance(start, graph.nodes[to] as Vec2) }));
    const list = [...(graph.adjacency[i] as ReadonlyArray<{ to: number; cost: number }>)];
    if (segmentAllowed(graph.area, pos(i), goal)) list.push({ to: G, cost: distance(pos(i), goal) });
    return list;
  };

  const g = new Map<number, number>([[S, 0]]);
  const prev = new Map<number, number>();
  const closed = new Set<number>();
  const h = (i: number): number => distance(pos(i), goal);
  const open: Array<{ node: number; f: number; h: number }> = [{ node: S, f: h(S), h: h(S) }];

  while (open.length > 0) {
    const cur = open.shift() as { node: number; f: number; h: number };
    if (closed.has(cur.node)) continue;
    if (cur.node === G) {
      const points: Vec2[] = [];
      for (let k: number | undefined = G; k !== undefined; k = prev.get(k)) points.push(pos(k));
      points.reverse();
      return { points, length: g.get(G) as number, goal };
    }
    closed.add(cur.node);
    const gCur = g.get(cur.node) as number;
    for (const { to, cost } of neighbours(cur.node)) {
      if (closed.has(to)) continue;
      const ng = gCur + cost;
      const old = g.get(to);
      if (old !== undefined && ng >= old - EPS) continue;
      g.set(to, ng);
      prev.set(to, cur.node);
      insertOpen(open, { node: to, f: ng + h(to), h: h(to) });
    }
  }
  return null;
}

function visibleFrom(graph: NavGraph, p: Vec2): number[] {
  const out: number[] = [];
  graph.nodes.forEach((n, i) => {
    if (segmentAllowed(graph.area, p, n)) out.push(i);
  });
  return out;
}

function insertOpen(open: Array<{ node: number; f: number; h: number }>, item: { node: number; f: number; h: number }): void {
  let lo = 0;
  let hi = open.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const o = open[mid] as { node: number; f: number; h: number };
    const before = o.f < item.f || (o.f === item.f && (o.h < item.h || (o.h === item.h && o.node <= item.node)));
    if (before) lo = mid + 1;
    else hi = mid;
  }
  open.splice(lo, 0, item);
}
