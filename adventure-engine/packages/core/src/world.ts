import { FACINGS, type ContainerRef, type Facing, type LoadedContent } from "@adventure-engine/content";
import type { Vec2 } from "@adventure-engine/geometry";

/**
 * Mutable world state (spec 01 A2). Static content stays in LoadedContent;
 * only state that can change during play lives here. All mutations go through
 * methods that emit a WorldChange (spec 01 A5).
 */

export interface ActorState {
  readonly id: string;
  scene: string | null;
  spot: string | null;
  /** Floor contact point in scene coordinates (spec 03 C2); null if the actor has no placement. */
  pos: Vec2 | null;
  facing: Facing;
  variant: string;
  readonly inventory: string[];
  /** Dialog entry refs; the last element is the top (spec 02 B7, decision B-08). */
  readonly dialogStack: string[];
}

export interface ObjectState {
  readonly id: string;
  container: ContainerRef;
  spot: string | null;
  variant: string;
  nameKey: string | null;
}

export interface SceneState {
  readonly id: string;
  variant: string;
}

export interface PortalState {
  readonly id: string;
  locked: boolean;
}

export type WorldChange =
  | { readonly kind: "object.moved"; readonly object: string; readonly from: ContainerRef; readonly to: ContainerRef; readonly spot: string | null }
  | { readonly kind: "actor.moved"; readonly actor: string; readonly from: string | null; readonly to: string; readonly spot: string | null }
  | { readonly kind: "actor.spot"; readonly actor: string; readonly spot: string }
  | { readonly kind: "variant"; readonly entity: string; readonly from: string; readonly to: string }
  | { readonly kind: "object.renamed"; readonly object: string; readonly nameKey: string }
  | { readonly kind: "portal.locked"; readonly portal: string; readonly locked: boolean }
  | { readonly kind: "player"; readonly from: string | null; readonly to: string }
  | { readonly kind: "dialog"; readonly actor: string; readonly stack: readonly string[] }
  | { readonly kind: "actor.position"; readonly actor: string; readonly pos: Vec2; readonly facing: Facing };

/** Default facing when neither a spot nor movement determined one (fallback for unknown facings, see E-FACING). */
export const DEFAULT_FACING: Facing = "down";

/** A known facing name, or the default (lenient content may contain unknown names). */
export function facingOr(value: string | undefined, fallback: Facing = DEFAULT_FACING): Facing {
  return value !== undefined && (FACINGS as readonly string[]).includes(value) ? (value as Facing) : fallback;
}

const sameContainer = (a: ContainerRef, b: ContainerRef): boolean =>
  a.kind === b.kind && (a.kind === "none" || (a as { id: string }).id === (b as { id: string }).id);

export class WorldState {
  readonly actors = new Map<string, ActorState>();
  readonly objects = new Map<string, ObjectState>();
  readonly scenes = new Map<string, SceneState>();
  readonly portals = new Map<string, PortalState>();
  playerId: string | null;
  language: string;
  /** Horizontal camera scroll of the player's scene (spec 03 C5). */
  scrollX = 0;
  /** Trigger zones each actor currently stands in (spec 03 C6), in content order. */
  readonly activeZones = new Map<string, string[]>();
  private readonly content: LoadedContent;
  private readonly onChange: (change: WorldChange) => void;

  constructor(content: LoadedContent, onChange: (change: WorldChange) => void) {
    this.content = content;
    this.onChange = onChange;
    const pkg = content.pkg;
    this.playerId = pkg.game.player?.actor ?? null;
    this.language = pkg.game.defaultLanguage;
    for (const s of pkg.scenes ?? []) this.scenes.set(s.id, { id: s.id, variant: "default" });
    for (const a of pkg.actors ?? []) {
      const scene = a.scene ?? null;
      const spot = a.spot ?? content.scenes.get(scene ?? "")?.defaultSpot ?? null;
      const def = this.spotDef(scene, spot);
      this.actors.set(a.id, {
        id: a.id,
        scene,
        spot,
        pos: def === undefined ? null : [def.x, def.y],
        facing: facingOr(def?.facing),
        variant: "default",
        inventory: [],
        dialogStack: a.dialog !== undefined ? [a.dialog] : [],
      });
    }
    for (const o of pkg.objects ?? []) {
      this.objects.set(o.id, { id: o.id, container: o.container, spot: o.spot ?? null, variant: "default", nameKey: o.nameKey ?? null });
      if (o.container.kind === "actor") this.actors.get(o.container.id)?.inventory.push(o.id);
    }
    for (const p of pkg.portals ?? []) this.portals.set(p.id, { id: p.id, locked: p.locked === true });
  }

  isValidContainer(c: ContainerRef): boolean {
    if (c.kind === "none") return true;
    if (c.kind === "scene") return this.scenes.has(c.id);
    return this.actors.has(c.id);
  }

  /** Atomic container change (spec 01 A2.4). Returns false (no change) for an unknown object/container. */
  moveObject(objectId: string, to: ContainerRef, spot: string | null): boolean {
    const obj = this.objects.get(objectId);
    if (obj === undefined || !this.isValidContainer(to)) return false;
    const from = obj.container;
    if (sameContainer(from, to)) {
      if (spot !== null && spot !== obj.spot) obj.spot = spot;
      return true;
    }
    if (from.kind === "actor") {
      const inv = (this.actors.get(from.id) as ActorState).inventory;
      inv.splice(inv.indexOf(objectId), 1);
    }
    if (to.kind === "actor") {
      const inv = (this.actors.get(to.id) as ActorState).inventory;
      if (!inv.includes(objectId)) inv.push(objectId);
    }
    obj.container = to;
    obj.spot = spot;
    this.onChange({ kind: "object.moved", object: objectId, from, to, spot });
    return true;
  }

  moveActor(actorId: string, sceneId: string, spot: string | null): boolean {
    const actor = this.actors.get(actorId);
    if (actor === undefined || !this.scenes.has(sceneId)) return false;
    const from = actor.scene;
    actor.scene = sceneId;
    actor.spot = spot ?? this.content.scenes.get(sceneId)?.defaultSpot ?? null;
    const def = this.spotDef(sceneId, actor.spot);
    actor.pos = def === undefined ? null : [def.x, def.y];
    actor.facing = facingOr(def?.facing, actor.facing);
    this.onChange({ kind: "actor.moved", actor: actorId, from, to: sceneId, spot: actor.spot });
    return true;
  }

  /** Place the actor on a spot of its current scene (position and the spot's facing). */
  setActorSpot(actorId: string, spot: string): boolean {
    const actor = this.actors.get(actorId);
    if (actor === undefined) return false;
    actor.spot = spot;
    const def = this.spotDef(actor.scene, spot);
    if (def !== undefined) actor.pos = [def.x, def.y];
    actor.facing = facingOr(def?.facing, actor.facing);
    this.onChange({ kind: "actor.spot", actor: actorId, spot });
    return true;
  }

  /** Free placement (not on a named spot). Emits actor.position. */
  setActorPosition(actorId: string, pos: Vec2, facing?: Facing): boolean {
    const actor = this.actors.get(actorId);
    if (actor === undefined) return false;
    actor.pos = pos;
    actor.spot = null;
    if (facing !== undefined) actor.facing = facing;
    this.onChange({ kind: "actor.position", actor: actorId, pos, facing: actor.facing });
    return true;
  }

  /** Movement step: position and facing change without a WorldChange (movement is traced as walk.start/walk.end). */
  stepActor(actorId: string, pos: Vec2, facing: Facing): void {
    const actor = this.actors.get(actorId) as ActorState;
    actor.pos = pos;
    actor.spot = null;
    actor.facing = facing;
  }

  spotDef(sceneId: string | null, spot: string | null): { x: number; y: number; facing?: string } | undefined {
    if (sceneId === null || spot === null) return undefined;
    return this.content.scenes.get(sceneId)?.spots?.[spot];
  }

  setVariant(entityId: string, variant: string): boolean {
    const known = this.content.variantsOf(entityId);
    const state = this.actors.get(entityId) ?? this.objects.get(entityId) ?? this.scenes.get(entityId);
    if (known === undefined || state === undefined || !known.includes(variant)) return false;
    const from = state.variant;
    state.variant = variant;
    this.onChange({ kind: "variant", entity: entityId, from, to: variant });
    return true;
  }

  rename(objectId: string, nameKey: string): boolean {
    const obj = this.objects.get(objectId);
    if (obj === undefined) return false;
    obj.nameKey = nameKey;
    this.onChange({ kind: "object.renamed", object: objectId, nameKey });
    return true;
  }

  setPortalLocked(portalId: string, locked: boolean): boolean {
    const p = this.portals.get(portalId);
    if (p === undefined) return false;
    p.locked = locked;
    this.onChange({ kind: "portal.locked", portal: portalId, locked });
    return true;
  }

  setPlayer(actorId: string): boolean {
    if (!this.actors.has(actorId)) return false;
    const from = this.playerId;
    this.playerId = actorId;
    this.onChange({ kind: "player", from, to: actorId });
    return true;
  }

  topDialog(actorId: string): string | undefined {
    const stack = this.actors.get(actorId)?.dialogStack;
    return stack === undefined ? undefined : stack[stack.length - 1];
  }

  pushDialog(actorId: string, entryRef: string): boolean {
    const actor = this.actors.get(actorId);
    if (actor === undefined) return false;
    actor.dialogStack.push(entryRef);
    this.onChange({ kind: "dialog", actor: actorId, stack: [...actor.dialogStack] });
    return true;
  }

  /** Removes the top entry, but never the last one (spec 02 B7). Returns false if nothing was popped. */
  popDialog(actorId: string): boolean {
    const actor = this.actors.get(actorId);
    if (actor === undefined || actor.dialogStack.length <= 1) return false;
    actor.dialogStack.pop();
    this.onChange({ kind: "dialog", actor: actorId, stack: [...actor.dialogStack] });
    return true;
  }

  /** Decision B-08: end_dialog replaces the top entry (pushes if the stack is empty). */
  replaceTopDialog(actorId: string, entryRef: string): boolean {
    const actor = this.actors.get(actorId);
    if (actor === undefined) return false;
    if (actor.dialogStack.length > 0) actor.dialogStack[actor.dialogStack.length - 1] = entryRef;
    else actor.dialogStack.push(entryRef);
    this.onChange({ kind: "dialog", actor: actorId, stack: [...actor.dialogStack] });
    return true;
  }
}
