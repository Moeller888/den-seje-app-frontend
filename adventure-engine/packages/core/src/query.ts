/**
 * Headless world query: what lies under a scene point (spec 04 D1/D2).
 *
 * Without a selected item: object zone → actor zone → portal → walk area → idle.
 * With a selected item:   object zone → actor zone → the player → no target.
 * Within a category the zone with the highest `priority` wins, then the first
 * in content order. While input is modal the result is always `busy`.
 */
import type { LoadedContent } from "@adventure-engine/content";
import { pointInPolygon, type Vec2 } from "@adventure-engine/geometry";
import { DEFAULT_HIT_BOX, type SceneSpace } from "./space.ts";
import type { WorldState } from "./world.ts";

export type CursorResult =
  | { readonly mode: "busy" }
  /** Over an inventory item without a selection, `tooltipKey` names the item. */
  | { readonly mode: "idle"; readonly tooltipKey?: string | null }
  | { readonly mode: "walk"; readonly point: Vec2 }
  | { readonly mode: "interact"; readonly target: string; readonly tooltipKey: string | null }
  | { readonly mode: "talk"; readonly target: string; readonly tooltipKey: string | null; readonly talkSpot: string | null }
  | { readonly mode: "portal"; readonly target: string; readonly tooltipKey: string | null }
  | { readonly mode: "portal_locked"; readonly target: string; readonly tooltipKey: string | null }
  | {
      readonly mode: "use";
      readonly item: string;
      readonly target: string | null;
      readonly targetKind: "object" | "actor" | "inventory" | null;
      readonly tooltipKey: string | null;
    };

export interface QueryInput {
  readonly content: LoadedContent;
  readonly world: WorldState;
  readonly space: SceneSpace;
  readonly point: Vec2;
  readonly selectedItem: string | null;
  readonly modal: boolean;
}

/** Stable order: priority descending, then content order. */
function ordered<T extends { readonly priority?: number }>(list: readonly T[]): T[] {
  return list
    .map((z, i) => ({ z, i }))
    .sort((a, b) => (b.z.priority ?? 0) - (a.z.priority ?? 0) || a.i - b.i)
    .map((x) => x.z);
}

function entityInScene(world: WorldState, id: string, sceneId: string, variant: string | undefined): boolean {
  const a = world.actors.get(id);
  if (a !== undefined) return a.scene === sceneId && (variant === undefined || a.variant === variant);
  const o = world.objects.get(id);
  return o !== undefined && o.container.kind === "scene" && o.container.id === sceneId && (variant === undefined || o.variant === variant);
}

function nameKeyOf(content: LoadedContent, world: WorldState, id: string): string | null {
  const o = world.objects.get(id);
  if (o !== undefined) return o.nameKey;
  return content.actors.get(id)?.nameKey ?? null;
}

/** Actor hit box: width × height anchored at the feet, centred horizontally. */
export function actorHit(content: LoadedContent, world: WorldState, actorId: string, p: Vec2): boolean {
  const st = world.actors.get(actorId);
  if (st?.pos === null || st?.pos === undefined) return false;
  const box = content.actors.get(actorId)?.hitBox ?? DEFAULT_HIT_BOX;
  const [x, y] = st.pos;
  return p[0] >= x - box.width / 2 && p[0] <= x + box.width / 2 && p[1] >= y - box.height && p[1] <= y;
}

export function queryPoint(q: QueryInput): CursorResult {
  if (q.modal) return { mode: "busy" };
  const { content, world, space, point } = q;
  const sceneId = space.id;
  const objectHit = ordered(space.def.objectZones ?? []).find(
    (z) => entityInScene(world, z.entity, sceneId, z.variant) && pointInPolygon(point, z.polygon),
  );
  const actorHitZone = ordered(space.def.actorZones ?? []).find(
    (z) => entityInScene(world, z.actor, sceneId, z.variant) && pointInPolygon(point, z.polygon),
  );

  if (q.selectedItem !== null) {
    const item = q.selectedItem;
    if (objectHit !== undefined) {
      const kind = world.actors.has(objectHit.entity) ? "actor" : "object";
      return { mode: "use", item, target: objectHit.entity, targetKind: kind, tooltipKey: objectHit.nameKey ?? nameKeyOf(content, world, objectHit.entity) };
    }
    if (actorHitZone !== undefined) {
      return { mode: "use", item, target: actorHitZone.actor, targetKind: "actor", tooltipKey: nameKeyOf(content, world, actorHitZone.actor) };
    }
    const player = world.playerId;
    if (player !== null && actorHit(content, world, player, point)) {
      return { mode: "use", item, target: player, targetKind: "actor", tooltipKey: nameKeyOf(content, world, player) };
    }
    return { mode: "use", item, target: null, targetKind: null, tooltipKey: null };
  }

  if (objectHit !== undefined) {
    return { mode: "interact", target: objectHit.entity, tooltipKey: objectHit.nameKey ?? nameKeyOf(content, world, objectHit.entity) };
  }
  if (actorHitZone !== undefined) {
    return { mode: "talk", target: actorHitZone.actor, tooltipKey: nameKeyOf(content, world, actorHitZone.actor), talkSpot: actorHitZone.talkSpot ?? null };
  }
  for (const p of content.pkg.portals ?? []) {
    if (p.from !== sceneId || p.polygon === undefined || !pointInPolygon(point, p.polygon)) continue;
    const locked = world.portals.get(p.id)?.locked === true;
    return locked
      ? { mode: "portal_locked", target: p.id, tooltipKey: p.lockedKey ?? p.nameKey ?? null }
      : { mode: "portal", target: p.id, tooltipKey: p.nameKey ?? null };
  }
  if (space.isWalkable(point)) return { mode: "walk", point };
  return { mode: "idle" };
}
