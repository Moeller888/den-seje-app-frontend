import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  EPS,
  closestPointOnPolygonBoundary,
  closestPointOnSegment,
  distance,
  edgesOf,
  interiorPoint,
  isAllowed,
  lerp,
  nearestAllowedPoint,
  nearlyEqual,
  orient,
  pointInPolygon,
  pointOnPolygonEdge,
  pointOnSegment,
  pointStrictlyInPolygon,
  pointsNearlyEqual,
  polygonProblem,
  polygonsOverlap,
  segmentAllowed,
  segmentPolygonParams,
  segmentsIntersect,
  signedArea,
  splitParams,
  zoneTransitions,
  type Area,
  type Poly,
  type Vec2,
} from "../src/index.ts";

const rect = (x: number, y: number, w: number, h: number): Poly => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

describe("basic predicates", () => {
  it("near equality, distance, interpolation, orientation", () => {
    expect(nearlyEqual(1, 1 + EPS / 2)).toBe(true);
    expect(nearlyEqual(1, 1 + 2 * EPS)).toBe(false);
    expect(pointsNearlyEqual([0, 0], [0, EPS / 2])).toBe(true);
    expect(pointsNearlyEqual([0, 0], [1, 0])).toBe(false);
    expect(distance([0, 0], [3, 4])).toBe(5);
    expect(lerp([0, 0], [10, 20], 0.5)).toEqual([5, 10]);
    expect(orient([0, 0], [1, 0], [0, 1])).toBe(1);
    expect(orient([0, 0], [1, 0], [0, -1])).toBe(-1);
    expect(orient([0, 0], [1, 0], [5, 1e-9])).toBe(0);
  });

  it("segment intersection incl. touching and collinear cases", () => {
    expect(segmentsIntersect([0, 0], [2, 2], [0, 2], [2, 0])).toBe(true);
    expect(segmentsIntersect([0, 0], [1, 0], [2, 0], [3, 0])).toBe(false);
    expect(segmentsIntersect([0, 0], [2, 0], [1, 0], [3, 0])).toBe(true);
    expect(segmentsIntersect([1, 0], [3, 0], [0, 0], [2, 0])).toBe(true);
    expect(segmentsIntersect([0, 0], [1, 1], [0, 1], [1, 1])).toBe(true);
    expect(segmentsIntersect([0, 1], [1, 1], [0, 0], [1, 1])).toBe(true);
    expect(segmentsIntersect([0, 0], [1, 0], [0, 1], [1, 1])).toBe(false);
  });

  it("closest points on segments and polygon boundaries", () => {
    expect(closestPointOnSegment([5, 5], [0, 0], [10, 0])).toEqual({ point: [5, 0], t: 0.5, distSq: 25 });
    expect(closestPointOnSegment([-5, 1], [0, 0], [10, 0]).t).toBe(0);
    expect(closestPointOnSegment([3, 3], [1, 1], [1, 1])).toEqual({ point: [1, 1], t: 0, distSq: 8 });
    expect(pointOnSegment([5, EPS / 2], [0, 0], [10, 0])).toBe(true);
    expect(pointOnSegment([5, 1], [0, 0], [10, 0])).toBe(false);
    const sq = rect(0, 0, 10, 10);
    expect(edgesOf(sq)).toHaveLength(4);
    expect(closestPointOnPolygonBoundary([5, -3], sq)).toMatchObject({ point: [5, 0], edge: 0 });
    // Equidistant to two edges (a corner) → first edge in order wins.
    expect(closestPointOnPolygonBoundary([12, -2], sq).edge).toBe(0);
    expect(closestPointOnPolygonBoundary([12, 5], sq)).toMatchObject({ point: [10, 5], edge: 1 });
  });

  it("point in polygon: boundary (within EPS) counts as inside; strict excludes it", () => {
    const sq = rect(0, 0, 10, 10);
    expect(pointInPolygon([5, 5], sq)).toBe(true);
    expect(pointInPolygon([10, 5], sq)).toBe(true);
    expect(pointInPolygon([10 + EPS / 2, 5], sq)).toBe(true);
    expect(pointInPolygon([10 + 1e-3, 5], sq)).toBe(false);
    expect(pointOnPolygonEdge([0, 3], sq)).toBe(true);
    expect(pointStrictlyInPolygon([0, 3], sq)).toBe(false);
    expect(pointStrictlyInPolygon([3, 3], sq)).toBe(true);
    expect(pointStrictlyInPolygon([30, 3], sq)).toBe(false);
  });

  it("points on any edge are inside (property)", () => {
    const sq = rect(0, 0, 100, 50);
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 3 }), fc.double({ min: 0, max: 1, noNaN: true }), (edge, t) => {
        const [a, b] = edgesOf(sq)[edge] as [Vec2, Vec2];
        return pointInPolygon(lerp(a, b, t), sq) && pointOnPolygonEdge(lerp(a, b, t), sq);
      }),
    );
  });
});

describe("segment/polygon parameters and zone transitions (spec 03 C6)", () => {
  const zone = rect(10, 0, 2, 10);

  it("crossings, collinear overlaps and parallel misses", () => {
    expect(segmentPolygonParams([0, 5], [20, 5], zone).sort()).toEqual([0.5, 0.6]);
    expect(segmentPolygonParams([0, 0], [20, 0], zone).sort()).toEqual([0.5, 0.5, 0.6, 0.6]);
    expect(segmentPolygonParams([0, 20], [20, 20], zone)).toEqual([]);
    expect(segmentPolygonParams([5, 5], [5, 5], zone)).toEqual([]);
    expect(splitParams([0.5, 0.5 + EPS / 10, 0.25])).toEqual([0, 0.25, 0.5, 1]);
    expect(splitParams([1 - EPS / 10])).toEqual([0, 1]);
  });

  it("a thin zone crossed in one step yields enter then exit", () => {
    expect(zoneTransitions([0, 5], [20, 5], zone)).toEqual([
      { t: 0.5, inside: true },
      { t: 0.6, inside: false },
    ]);
  });

  it("enter, exit, ending on the boundary, starting inside, and vertex touches", () => {
    expect(zoneTransitions([0, 5], [11, 5], zone)).toEqual([{ t: 10 / 11, inside: true }]);
    expect(zoneTransitions([11, 5], [20, 5], zone)).toEqual([{ t: 1 / 9, inside: false }]);
    expect(zoneTransitions([0, 5], [10, 5], zone)).toEqual([{ t: 1, inside: true }]);
    expect(zoneTransitions([11, 5], [11, 6], zone)).toEqual([]);
    // Touching only the corner (10, 0) of a diamond: no state change.
    expect(zoneTransitions([10, -5], [10, 5], [[10, 0], [20, -10], [30, 0], [20, 10]])).toEqual([]);
    // Running along an edge counts as inside (boundary inclusive).
    expect(zoneTransitions([5, -5], [15, 5], [[10, 0], [20, -10], [30, 0], [20, 10]])).toEqual([{ t: 0.5, inside: true }]);
  });
});

describe("walk areas (union minus blocker interiors)", () => {
  const area: Area = { walkable: [rect(0, 0, 100, 100), rect(100, 0, 100, 100)], blockers: [rect(40, 40, 20, 20)] };

  it("allowed points and segments", () => {
    expect(isAllowed(area, [10, 10])).toBe(true);
    expect(isAllowed(area, [50, 50])).toBe(false);
    expect(isAllowed(area, [40, 50])).toBe(true);
    expect(isAllowed(area, [250, 50])).toBe(false);
    expect(segmentAllowed(area, [10, 10], [190, 10])).toBe(true);
    expect(segmentAllowed(area, [10, 50], [90, 50])).toBe(false);
    expect(segmentAllowed(area, [40, 30], [40, 70])).toBe(true);
    // A blocker flush with the outer edge leaves no zero-width corridor along that edge.
    const flush: Area = { walkable: [rect(0, 0, 100, 100)], blockers: [rect(40, 50, 20, 50)] };
    expect(segmentAllowed(flush, [30, 100], [70, 100])).toBe(false);
    expect(segmentAllowed(flush, [40, 50], [60, 50])).toBe(true);
    expect(segmentAllowed(flush, [10, 10], [10, 10])).toBe(true);
    expect(segmentAllowed(area, [10, 10], [250, 10])).toBe(false);
    // Segment leaving and re-entering an L-shaped area.
    const L: Area = { walkable: [[[0, 0], [100, 0], [100, 10], [10, 10], [10, 100], [0, 100]]], blockers: [] };
    expect(segmentAllowed(L, [5, 95], [95, 5])).toBe(false);
    expect(segmentAllowed(L, [5, 95], [5, 5])).toBe(true);
  });

  it("nearest allowed point (spec 03 C4.3)", () => {
    expect(nearestAllowedPoint(area, [10, 10])).toEqual([10, 10]);
    expect(nearestAllowedPoint(area, [50, -30])).toEqual([50, 0]);
    expect(nearestAllowedPoint(area, [50, 45])).toEqual([50, 40]);
    expect(nearestAllowedPoint({ walkable: [], blockers: [] }, [0, 0])).toBeNull();
    // Equidistant to two edges: the first candidate in content order wins.
    expect(nearestAllowedPoint({ walkable: [rect(0, 0, 10, 10)], blockers: [] }, [-1, -1])).toEqual([0, 0]);
  });

  it("projected points are allowed (property)", () => {
    fc.assert(
      fc.property(fc.double({ min: -100, max: 300, noNaN: true }), fc.double({ min: -100, max: 200, noNaN: true }), (x, y) => {
        const p = nearestAllowedPoint(area, [x, y]);
        return p !== null && isAllowed(area, p);
      }),
    );
  });
});

describe("polygon validation helpers", () => {
  it("problems, area, overlap, interior points", () => {
    expect(polygonProblem(rect(0, 0, 1, 1))).toBeNull();
    expect(polygonProblem([[0, 0], [1, 1]])).toMatch(/3 points/);
    expect(polygonProblem([[0, 0], [1, Number.NaN], [2, 2]])).toMatch(/finite/);
    expect(polygonProblem([[0, 0], [2, 2], [2, 0], [0, 2]])).toMatch(/self-intersecting/);
    expect(polygonProblem([[0, 0], [1, 1], [2, 2]])).toMatch(/zero area/);
    expect(signedArea(rect(0, 0, 2, 3))).toBe(6);
    expect(polygonsOverlap(rect(0, 0, 10, 10), rect(5, 5, 10, 10))).toBe(true);
    expect(polygonsOverlap(rect(0, 0, 10, 10), rect(50, 50, 1, 1))).toBe(false);
    expect(polygonsOverlap(rect(0, 0, 100, 100), rect(10, 10, 5, 5))).toBe(true);
    expect(polygonsOverlap(rect(10, 10, 5, 5), rect(0, 0, 100, 100))).toBe(true);
    const sq = rect(0, 0, 10, 10);
    expect(pointStrictlyInPolygon(interiorPoint(sq), sq)).toBe(true);
    const concave: Poly = [[0, 0], [10, 0], [10, 10], [9, 10], [9, 1], [1, 1], [1, 10], [0, 10]];
    expect(pointStrictlyInPolygon(interiorPoint(concave), concave)).toBe(true);
    // Degenerate input falls back to the first vertex.
    expect(interiorPoint([[0, 0], [1, 1], [2, 2]])).toEqual([0, 0]);
  });
});
