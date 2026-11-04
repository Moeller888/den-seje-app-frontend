/**
 * Navigation and camera preview (phase 6, §5): the editor asks the engine's
 * own SceneSpace, so the route shown for two clicks is the route the runtime
 * computes (same area, same visibility graph, same A*, same projection).
 */

import type { LoadedContent, SceneDef } from "@adventure-engine/content";
import { SceneSpace } from "@adventure-engine/core";
import { buildNavGraph, pointsNearlyEqual, type Vec2 } from "@adventure-engine/geometry";
import type { Project } from "./project.ts";

/** The engine's view of one scene of a project (no content validation needed). */
export function sceneSpace(p: Project, scene: SceneDef): SceneSpace {
  const content = { pkg: { game: p.game } } as unknown as LoadedContent;
  return new SceneSpace(content, scene);
}

export interface RoutePreview {
  /** No walk area (or every walk polygon is invalid). */
  readonly noNavigation: boolean;
  /** Start and goal after projection into the walk area (null: no path). */
  readonly start: Vec2 | null;
  readonly goal: Vec2 | null;
  readonly points: readonly Vec2[];
  readonly length: number;
  /** The start or the goal was moved to the nearest walkable point. */
  readonly startProjected: boolean;
  readonly goalProjected: boolean;
  /** Start and goal lie in parts of the area that are not connected. */
  readonly noPath: boolean;
}

export function routePreview(space: SceneSpace, from: Vec2, to: Vec2): RoutePreview {
  if (!space.hasNavigation) return { noNavigation: true, start: null, goal: null, points: [], length: 0, startProjected: false, goalProjected: false, noPath: true };
  const r = space.findPath(from, to);
  if (r === null) return { noNavigation: false, start: null, goal: null, points: [], length: 0, startProjected: false, goalProjected: false, noPath: true };
  const start = r.points[0] as Vec2;
  return {
    noNavigation: false,
    start,
    goal: r.goal,
    points: r.points,
    length: r.length,
    startProjected: !pointsNearlyEqual(start, from),
    goalProjected: !pointsNearlyEqual(r.goal, to),
    noPath: false,
  };
}

/** Nodes and edges of the visibility graph the runtime searches. */
export function navGraphPreview(space: SceneSpace): { readonly nodes: readonly Vec2[]; readonly edges: ReadonlyArray<readonly [Vec2, Vec2]> } {
  if (space.area === null) return { nodes: [], edges: [] };
  const g = buildNavGraph(space.area);
  const edges: Array<readonly [Vec2, Vec2]> = [];
  g.adjacency.forEach((list, i) => {
    for (const e of list) if (e.to > i) edges.push([g.nodes[i] as Vec2, g.nodes[e.to] as Vec2]);
  });
  return { nodes: g.nodes, edges };
}

export interface CameraPreview {
  /** Screen y of the horizon, or null without a camera. */
  readonly horizonY: number | null;
  /** Scroll range [0, max] of the scene in the viewport. */
  readonly scrollMax: number;
  /** Perspective height in pixels of a reference figure at `at` (null: no camera or above the horizon). */
  readonly heightPx: number | null;
  /** Depth used for draw order at `at` (camera floor z, or −y without a camera). */
  readonly depth: number;
  /** Floor point under `at` (camera only). */
  readonly floor: readonly [number, number, number] | null;
}

export function cameraPreview(space: SceneSpace, at: Vec2, referenceHeight = 160): CameraPreview {
  const cam = space.camera;
  return {
    horizonY: cam === null ? null : cam.horizonY,
    scrollMax: Math.max(0, space.width - space.viewport.width),
    heightPx: cam === null ? null : cam.heightPx(at, referenceHeight),
    depth: space.depthAt(at),
    floor: cam === null ? null : cam.screenToFloor(at),
  };
}
