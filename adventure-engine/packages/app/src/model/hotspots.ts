/**
 * Keyboard/screen-reader access to the scene (accessibility extension): the
 * interactive things of the current scene as a list of logical click targets,
 * in the same category order as hover resolution (objects, actors, portals).
 */

import type { LoadedContent } from "@adventure-engine/content";
import type { ClickTarget, WorldState } from "@adventure-engine/core";

export interface Hotspot {
  readonly key: string;
  readonly kind: "object" | "actor" | "portal";
  readonly target: ClickTarget;
  readonly nameKey: string | null;
  readonly locked: boolean;
}

function present(world: WorldState, id: string, sceneId: string, variant: string | undefined): boolean {
  const a = world.actors.get(id);
  if (a !== undefined) return a.scene === sceneId && (variant === undefined || a.variant === variant);
  const o = world.objects.get(id);
  return o !== undefined && o.container.kind === "scene" && o.container.id === sceneId && (variant === undefined || o.variant === variant);
}

export function sceneHotspots(content: LoadedContent, world: WorldState, sceneId: string): Hotspot[] {
  const scene = content.scenes.get(sceneId);
  const out: Hotspot[] = [];
  const seen = new Set<string>();
  const add = (h: Hotspot): void => {
    if (seen.has(h.key)) return;
    seen.add(h.key);
    out.push(h);
  };
  for (const z of scene?.objectZones ?? []) {
    if (!present(world, z.entity, sceneId, z.variant)) continue;
    const nameKey = z.nameKey ?? world.objects.get(z.entity)?.nameKey ?? content.actors.get(z.entity)?.nameKey ?? null;
    add({ key: `object:${z.entity}`, kind: "object", target: { objectZone: z.entity }, nameKey, locked: false });
  }
  for (const z of scene?.actorZones ?? []) {
    if (!present(world, z.actor, sceneId, z.variant) || z.actor === world.playerId) continue;
    add({ key: `actor:${z.actor}`, kind: "actor", target: { actorZone: z.actor }, nameKey: content.actors.get(z.actor)?.nameKey ?? null, locked: false });
  }
  for (const p of content.pkg.portals ?? []) {
    if (p.from !== sceneId || p.polygon === undefined) continue;
    const locked = world.portals.get(p.id)?.locked === true;
    add({ key: `portal:${p.id}`, kind: "portal", target: { portal: p.id }, nameKey: (locked ? (p.lockedKey ?? p.nameKey) : p.nameKey) ?? null, locked });
  }
  return out;
}
