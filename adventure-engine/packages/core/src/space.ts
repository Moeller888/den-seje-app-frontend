/**
 * Derived, immutable per-scene geometry (spec 03): size, camera, walk area,
 * navigation graph, scroll, depth order and scaling. Pure; no renderer.
 */
import { DEFAULT_VIEWPORT, FACINGS, polygonProblem, type Facing, type LoadedContent, type SceneDef } from "@adventure-engine/content";
import { Camera, buildNavGraph, cameraProblems, findPath, isAllowed, type Area, type NavGraph, type PathResult, type Vec2 } from "@adventure-engine/geometry";
import type { ActorState, WorldState } from "./world.ts";

/** Walking speed in scene pixels per second when a scene has no camera (spec 07 §3, `walkSpeed`). */
export const DEFAULT_WALK_SPEED = 200;
/** Default headless hit box of an actor (scene pixels, anchored at the feet). */
export const DEFAULT_HIT_BOX = { width: 40, height: 100 } as const;
/** Default reference height of a grounded actor in world units (spec 03 C2.2). */
export const DEFAULT_REFERENCE_HEIGHT = 160;

/**
 * Facing from a movement direction in scene coordinates (y down), spec 03 C3.2:
 * 45° sectors centred on the 8 directions; each sector includes its lower
 * boundary, e.g. [-22.5°, 22.5°) = right, [22.5°, 67.5°) = down_right.
 * Angles are rounded to 1e-9° so boundary cases are deterministic. Null for a zero vector.
 */
export function facingFromDelta(dx: number, dy: number): Facing | null {
  if (dx === 0 && dy === 0) return null;
  const deg = Math.round(((Math.atan2(dy, dx) * 180) / Math.PI) * 1e9) / 1e9;
  const norm = (((deg + 22.5) % 360) + 360) % 360;
  return FACINGS[Math.floor(norm / 45) % 8] as Facing;
}

export function viewportOf(content: LoadedContent): { readonly width: number; readonly height: number } {
  const vp = content.pkg.game.viewport;
  return vp !== undefined && vp.width > 0 && vp.height > 0 ? vp : DEFAULT_VIEWPORT;
}

export class SceneSpace {
  readonly id: string;
  readonly def: SceneDef;
  readonly width: number;
  readonly height: number;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly camera: Camera | null;
  /** Null when the scene has no (valid) walk polygons: walking is then delegated to presentation. */
  readonly area: Area | null;
  private graph: NavGraph | null = null;

  constructor(content: LoadedContent, def: SceneDef) {
    this.id = def.id;
    this.def = def;
    this.viewport = viewportOf(content);
    this.width = def.size?.width ?? this.viewport.width;
    this.height = def.size?.height ?? this.viewport.height;
    const cam = def.camera;
    const params = cam === undefined ? null : { ...cam, width: this.width, planeHeight: this.height };
    this.camera = params !== null && cameraProblems(params).length === 0 ? new Camera(params) : null;
    const walkable = (def.walkable ?? []).filter((p) => polygonProblem(p) === null);
    const blockers = (def.blockers ?? []).filter((p) => polygonProblem(p) === null);
    this.area = walkable.length > 0 ? { walkable, blockers } : null;
  }

  get hasNavigation(): boolean {
    return this.area !== null;
  }

  /** Walking speed: floor units/s with a camera (camera.speed), else scene px/s (walkSpeed). */
  get speed(): number {
    return this.camera !== null ? (this.def.camera?.speed as number) : (this.def.walkSpeed ?? DEFAULT_WALK_SPEED);
  }

  spot(name: string | null | undefined): Vec2 | null {
    const s = name === null || name === undefined ? undefined : this.def.spots?.[name];
    return s === undefined ? null : [s.x, s.y];
  }

  /** Inside the walk area and, with a camera, below the horizon (spec 03 C2.1/TS-C02). */
  isWalkable(p: Vec2): boolean {
    return this.area !== null && isAllowed(this.area, p) && this.belowHorizon(p);
  }

  belowHorizon(p: Vec2): boolean {
    return this.camera === null || this.camera.screenToFloor(p) !== null;
  }

  /** Shortest path (spec 03 C4); null without navigation or for disconnected start/goal. */
  findPath(from: Vec2, to: Vec2): PathResult | null {
    if (this.area === null) return null;
    if (this.graph === null) this.graph = buildNavGraph(this.area);
    return findPath(this.graph, from, to);
  }

  /** Follow the player horizontally, clamped to [0, width − viewport]; 0 if the scene is narrower (spec 03 C5). */
  scrollFor(x: number): number {
    const max = Math.max(0, this.width - this.viewport.width);
    return Math.min(max, Math.max(0, x - this.viewport.width / 2));
  }

  /**
   * Depth of a floor point: camera floor z, or −y without a camera (lower on
   * screen = closer). Points above the horizon are infinitely far.
   */
  depthAt(p: Vec2): number {
    if (this.camera === null) return -p[1];
    const z = this.camera.depthAt(p);
    return z === null ? Number.POSITIVE_INFINITY : z;
  }
}

export class Spaces {
  private readonly cache = new Map<string, SceneSpace>();
  private readonly content: LoadedContent;

  constructor(content: LoadedContent) {
    this.content = content;
  }

  get(sceneId: string): SceneSpace | undefined {
    let s = this.cache.get(sceneId);
    if (s === undefined) {
      const def = this.content.scenes.get(sceneId);
      if (def === undefined) return undefined;
      s = new SceneSpace(this.content, def);
      this.cache.set(sceneId, s);
    }
    return s;
  }
}

export interface DrawItem {
  readonly kind: "layer" | "actor" | "object";
  readonly id: string;
  readonly depth: number;
}

/**
 * Painter's order (spec 03 C2.2): far to near (depth descending). Equal depth keeps
 * content order: layers (scene order), then actors, then objects (package order).
 */
export function drawOrder(content: LoadedContent, world: WorldState, space: SceneSpace): DrawItem[] {
  const items: DrawItem[] = [];
  for (const layer of space.def.layers ?? []) items.push({ kind: "layer", id: layer.id, depth: layer.depth });
  // World maps are filled in content order, so iterating them preserves it.
  for (const st of world.actors.values()) {
    if (st.scene === space.id && st.pos !== null) items.push({ kind: "actor", id: st.id, depth: space.depthAt(st.pos) });
  }
  for (const st of world.objects.values()) {
    if (st.container.kind === "scene" && st.container.id === space.id) {
      const p = space.spot(st.spot);
      if (p !== null) items.push({ kind: "object", id: st.id, depth: space.depthAt(p) });
    }
  }
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (b.item.depth === a.item.depth ? a.index - b.index : b.item.depth > a.item.depth ? 1 : -1))
    .map((x) => x.item);
}

export interface ScaleInfo {
  /** On-screen height from perspective (grounded entities with a camera), else null. */
  readonly perspectiveHeightPx: number | null;
  /** Target height from the spot (`scale: true` + `height`), else null. */
  readonly spotHeightPx: number | null;
  /** Height to render: perspective if available, else spot, else null (natural size). */
  readonly effectiveHeightPx: number | null;
}

/** Scaling of an actor (spec 03 C2.2): perspective and spot height are separate factors. */
export function actorScale(content: LoadedContent, world: WorldState, space: SceneSpace, actorId: string): ScaleInfo {
  // The caller guarantees the actor exists and stands in `space`.
  const def = content.actors.get(actorId) as NonNullable<ReturnType<LoadedContent["actors"]["get"]>>;
  const st = world.actors.get(actorId) as ActorState;
  const grounded = def.grounded ?? true;
  const perspective = grounded && space.camera !== null && st.pos !== null ? space.camera.heightPx(st.pos, def.referenceHeight ?? DEFAULT_REFERENCE_HEIGHT) : null;
  const spotDef = st.spot === null ? undefined : space.def.spots?.[st.spot];
  const spotPx = spotDef?.scale === true && spotDef.height !== undefined ? spotDef.height : null;
  return { perspectiveHeightPx: perspective, spotHeightPx: spotPx, effectiveHeightPx: perspective ?? spotPx };
}
