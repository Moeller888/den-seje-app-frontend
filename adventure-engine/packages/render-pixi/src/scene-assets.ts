/**
 * Which assets a scene needs before it is shown (spec 06 F8.2): the scene's
 * layers in the current scene variant, the sprites and portraits of the actors
 * and objects in the scene in their current variants, and the icons of the
 * player's inventory. Inactive variants are loaded lazily (PrepareVariant).
 */

import type { LoadedContent, VariantDef } from "@adventure-engine/content";
import type { WorldState } from "@adventure-engine/core";

function variantAssets(v: VariantDef | undefined, out: Set<string>, atlases?: ReadonlyMap<string, string>): void {
  if (v?.sprite !== undefined) out.add(v.sprite);
  if (v?.portrait !== undefined) out.add(v.portrait);
  // Phase 4: the atlases of every animation of the variant.
  for (const id of Object.values(v?.animations ?? {})) {
    const atlas = atlases?.get(id);
    if (atlas !== undefined) out.add(atlas);
  }
}

const atlasMap = (content: LoadedContent): Map<string, string> => new Map((content.pkg.animations ?? []).map((a) => [a.id, a.atlas]));

/** Sorted, unique asset ids for `sceneId` given the current world state. */
export function sceneAssetIds(content: LoadedContent, world: WorldState, sceneId: string): string[] {
  const out = new Set<string>();
  const atlases = atlasMap(content);
  const scene = content.scenes.get(sceneId);
  for (const c of Object.values(scene?.cutscenes ?? {})) {
    for (const v of Object.values(c.variants)) for (const f of v.timeline ?? []) if (f.asset !== undefined) out.add(f.asset);
  }
  const sceneVariant = world.scenes.get(sceneId)?.variant ?? "default";
  for (const layer of scene?.layers ?? []) {
    const id = layer.assets?.[sceneVariant] ?? layer.assets?.["default"];
    if (id !== undefined) out.add(id);
  }
  for (const st of world.actors.values()) {
    if (st.scene === sceneId) variantAssets(content.actors.get(st.id)?.variants[st.variant], out, atlases);
  }
  for (const st of world.objects.values()) {
    if (st.container.kind === "scene" && st.container.id === sceneId) variantAssets(content.objects.get(st.id)?.variants[st.variant], out, atlases);
  }
  const player = world.playerId === null ? undefined : world.actors.get(world.playerId);
  // The player is shown in the target scene even before it has moved there.
  if (player !== undefined) variantAssets(content.actors.get(player.id)?.variants[player.variant], out, atlases);
  for (const item of player?.inventory ?? []) {
    const icon = content.objects.get(item)?.icon;
    if (icon !== undefined) out.add(icon);
  }
  return [...out].sort();
}

/** Audio asset ids of the sounds a scene, its entities, the player and its inventory can play (phase 4). */
export function sceneAudioIds(content: LoadedContent, world: WorldState, sceneId: string): string[] {
  const sounds = new Map((content.pkg.sounds ?? []).map((s) => [s.id, s.asset]));
  const out = new Set<string>();
  const add = (map: Readonly<Record<string, string>> | undefined): void => {
    for (const id of Object.values(map ?? {})) {
      const asset = sounds.get(id);
      if (asset !== undefined) out.add(asset);
    }
  };
  add(content.scenes.get(sceneId)?.sounds);
  const player = world.playerId;
  for (const st of world.actors.values()) if (st.scene === sceneId || st.id === player) add(content.actors.get(st.id)?.sounds);
  for (const st of world.objects.values()) {
    const c = st.container;
    if ((c.kind === "scene" && c.id === sceneId) || (c.kind === "actor" && c.id === player)) add(content.objects.get(st.id)?.sounds);
  }
  return [...out].sort();
}

/** Asset ids of one variant of an entity (for PrepareVariant: sprites, portraits and animation atlases). */
export function variantAssetIds(content: LoadedContent, entity: string, variant: string): string[] {
  const out = new Set<string>();
  variantAssets((content.actors.get(entity) ?? content.objects.get(entity))?.variants[variant], out, atlasMap(content));
  const scene = content.scenes.get(entity);
  for (const layer of scene?.layers ?? []) {
    const id = layer.assets?.[variant];
    if (id !== undefined) out.add(id);
  }
  return [...out].sort();
}
