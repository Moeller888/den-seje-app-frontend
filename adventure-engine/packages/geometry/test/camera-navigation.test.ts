import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  Camera,
  buildNavGraph,
  cameraProblems,
  distance,
  findPath,
  isAllowed,
  segmentAllowed,
  type Area,
  type Poly,
  type Vec2,
} from "../src/index.ts";

const GOLDEN = { focal: 900, height: 170, tilt: 12, horizon: 0.35, width: 1280, planeHeight: 720 } as const;
const rect = (x: number, y: number, w: number, h: number): Poly => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

describe("camera (spec 03 C2.1)", () => {
  const cam = new Camera(GOLDEN);

  it("TS-C03: golden floor point for screen (640, 600) and depth decreasing with screen y", () => {
    const p = cam.screenToFloor([640, 600]);
    expect(p).not.toBeNull();
    const [x, y, z] = p as [number, number, number];
    expect(x).toBe(0);
    expect(y).toBe(0);
    expect(z).toBeCloseTo(260.38367890486535, 9);
    // Formula convention: screen right of centre → negative floor x (mirrored, but self-consistent).
    expect((cam.screenToFloor([900, 600]) as [number, number, number])[0]).toBeCloseTo(-83.78894571090471, 9);
    expect(cam.horizonY).toBeCloseTo(60.69909449698005, 9);
    let prev = Number.POSITIVE_INFINITY;
    for (let sy = 70; sy <= 720; sy += 10) {
      const d = cam.depthAt([640, sy]) as number;
      expect(d).toBeLessThan(prev);
      prev = d;
    }
  });

  it("TS-C01: floorToScreen(screenToFloor(p)) within 0.5 px for 10 000 points below the horizon", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1280, noNaN: true }), fc.double({ min: 61, max: 720, noNaN: true }), (sx, sy) => {
        const f = cam.screenToFloor([sx, sy]);
        if (f === null) return false;
        const back = cam.floorToScreen(f) as Vec2;
        return Math.abs(back[0] - sx) <= 0.5 && Math.abs(back[1] - sy) <= 0.5;
      }),
      { numRuns: 10000 },
    );
  });

  it("TS-C02: points above the horizon give null; points behind the camera too", () => {
    expect(cam.screenToFloor([640, 60])).toBeNull();
    expect(cam.screenToFloor([640, 0])).toBeNull();
    expect(cam.screenToFloor([640, 61])).not.toBeNull();
    expect(cam.floorToScreen([0, 0, -500])).toBeNull();
    expect(cam.depthAt([640, 10])).toBeNull();
    expect(cam.heightPx([640, 10], 160)).toBeNull();
  });

  it("TS-C15 (geometry part): perspective height shrinks with depth and follows the camera scale", () => {
    const near = cam.heightPx([640, 700], 160) as number;
    const far = cam.heightPx([640, 200], 160) as number;
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
    expect(new Camera({ ...GOLDEN, scale: 2 }).heightPx([640, 700], 160)).toBeCloseTo(near * 2, 9);
    // A head so high that it would be behind the camera gives null.
    expect(cam.heightPx([640, 700], 1e6)).toBeNull();
  });

  it("validates its parameters", () => {
    expect(cameraProblems(GOLDEN)).toEqual([]);
    const bad = cameraProblems({ focal: 0, height: -1, tilt: 95, horizon: 2, width: Number.NaN, planeHeight: "x", scale: 0 });
    expect(bad.map((p) => p.field)).toEqual(["focal", "height", "tilt", "horizon", "width", "planeHeight", "scale"]);
    expect(() => new Camera({ ...GOLDEN, focal: -1 })).toThrow(/invalid camera/);
  });
});

describe("navigation (spec 03 C4)", () => {
  const area: Area = { walkable: [rect(0, 0, 400, 200)], blockers: [rect(150, 50, 100, 150)] };
  const graph = buildNavGraph(area);

  it("TS-C08: paths go around blockers, are optimal and reproducible", () => {
    const res = findPath(graph, [50, 150], [350, 150]);
    expect(res?.points).toEqual([[50, 150], [150, 50], [250, 50], [350, 150]]);
    expect(res?.length).toBeCloseTo(2 * Math.hypot(100, 100) + 100, 9);
    expect(findPath(graph, [50, 150], [350, 150])).toEqual(res);
  });

  it("direct line and identical start/goal", () => {
    expect(findPath(graph, [10, 10], [390, 20])?.points).toEqual([[10, 10], [390, 20]]);
    expect(findPath(graph, [10, 10], [10, 10])).toEqual({ points: [[10, 10]], length: 0, goal: [10, 10] });
  });

  it("TS-C09: a goal outside the area is projected to the nearest edge", () => {
    const res = findPath(graph, [50, 150], [50, -40]);
    expect(res?.goal).toEqual([50, 0]);
    expect(res?.points[res.points.length - 1]).toEqual([50, 0]);
    // Start inside the blocker: equidistant to its right and left edge → the earlier edge (right) wins.
    expect(findPath(graph, [200, 120], [50, 150])?.points[0]).toEqual([250, 120]);
  });

  it("TS-C10: disconnected walk zones give null; an empty area too", () => {
    const islands = buildNavGraph({ walkable: [rect(0, 0, 10, 10), rect(100, 0, 10, 10)], blockers: [] });
    expect(findPath(islands, [5, 5], [105, 5])).toBeNull();
    expect(findPath(buildNavGraph({ walkable: [], blockers: [] }), [0, 0], [1, 1])).toBeNull();
  });

  it("deterministic A* tie-breaking between two equally long routes", () => {
    // A square blocker in the middle: going over or under is equally long.
    const sym: Area = { walkable: [rect(0, 0, 300, 300)], blockers: [rect(100, 100, 100, 100)] };
    const a = findPath(buildNavGraph(sym), [50, 150], [250, 150]);
    const b = findPath(buildNavGraph(sym), [50, 150], [250, 150]);
    expect(a).toEqual(b);
    expect(a?.points).toHaveLength(4);
    // Lower node index wins: the blocker's top corners (y = 100) are numbered before the bottom ones.
    expect(a?.points[1]).toEqual([100, 100]);
  });

  it("paths stay inside the walk area and outside blockers; never shorter than the straight line (property)", () => {
    const pt = fc.tuple(fc.double({ min: 0, max: 400, noNaN: true }), fc.double({ min: 0, max: 200, noNaN: true }));
    const blockers = fc.array(
      fc.tuple(fc.integer({ min: 20, max: 330 }), fc.integer({ min: 10, max: 150 }), fc.integer({ min: 10, max: 60 }), fc.integer({ min: 10, max: 60 })),
      { maxLength: 3 },
    );
    fc.assert(
      fc.property(blockers, pt, pt, (bs, from, to) => {
        const ar: Area = { walkable: [rect(0, 0, 400, 200)], blockers: bs.map(([x, y, w, h]) => rect(x, y, w, h)) };
        const g = buildNavGraph(ar);
        const res = findPath(g, from, to);
        if (res === null) return true;
        const pts = res.points;
        for (const p of pts) if (!isAllowed(ar, p)) return false;
        for (let i = 0; i + 1 < pts.length; i++) if (!segmentAllowed(ar, pts[i] as Vec2, pts[i + 1] as Vec2)) return false;
        const again = findPath(g, from, to);
        return JSON.stringify(again) === JSON.stringify(res) && res.length >= distance(pts[0] as Vec2, res.goal) - 1e-6;
      }),
      { numRuns: 300 },
    );
  });
});
