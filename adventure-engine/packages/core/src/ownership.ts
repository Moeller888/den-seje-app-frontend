import type { WorldState } from "./world.ts";

/**
 * Sound ownership for scene clean-up (spec 06 F4, phase 4): a scene owns its
 * own sounds, the actors standing in it and the objects lying in it. The player
 * and everything it carries travel with the player and belong to no scene.
 */
export function ownerScene(w: WorldState, entity: string): string | null {
  if (w.scenes.has(entity)) return entity;
  if (entity === w.playerId) return null;
  const actor = w.actors.get(entity);
  if (actor !== undefined) return actor.scene;
  const obj = w.objects.get(entity);
  if (obj === undefined) return null;
  if (obj.container.kind === "scene") return obj.container.id;
  // Validated content: the carrying actor exists.
  if (obj.container.kind === "actor") return obj.container.id === w.playerId ? null : (w.actors.get(obj.container.id) as { scene: string | null }).scene;
  return null;
}
