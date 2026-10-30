/**
 * Per-entity animation slots (phase 4).
 *
 * - "action": animations started by PlayAnimation (and the "cannot" reaction).
 *   A new action on the same entity replaces the old one; the old player is
 *   stopped and emits nothing more. A finished action leaves the slot.
 * - "auto": stand/walk/talk chosen from the actor's movement, facing and speech
 *   (`stand.<facing>`, `walk.<facing>`, `talk.<facing>`, then the bare name).
 *   A facing change while walking keeps the normalised walk phase.
 *
 * The visible animation is the action if there is one, else the auto animation.
 * Starting to walk ends a looping action (the actor leaves its pose).
 * Animations are looked up through the entity's current variant; a missing
 * animation is not an error (fail-soft): nothing is played.
 */

import type { AnimationDef, LoadedContent } from "@adventure-engine/content";
import { AnimationPlayer, type PlayerEvents, type StartOptions } from "./animation.ts";
import type { Clock } from "./clock.ts";

export type AutoMode = "stand" | "walk" | "talk";

export interface AnimatorHost {
  /** Current variant of an actor or object (null if the entity is unknown). */
  variantOf(entity: string): string | null;
  signal(entity: string, name: string): void;
}

export interface SlotView {
  readonly slot: "action" | "auto";
  readonly name: string;
  readonly player: AnimationPlayer;
}

interface AutoState {
  readonly key: string;
  readonly mode: AutoMode;
  readonly facing: string;
}

export class Animator {
  private readonly content: LoadedContent;
  private readonly clock: Clock;
  private readonly host: AnimatorHost;
  private readonly defs = new Map<string, AnimationDef>();
  private readonly action = new Map<string, { name: string; player: AnimationPlayer }>();
  private readonly auto = new Map<string, { state: AutoState; name: string; player: AnimationPlayer } | { state: AutoState; name: null; player: null }>();

  constructor(content: LoadedContent, clock: Clock, host: AnimatorHost) {
    this.content = content;
    this.clock = clock;
    this.host = host;
    for (const a of content.pkg.animations ?? []) this.defs.set(a.id, a);
  }

  /** Animation definition for an entity's animation name in its current variant (or the default variant). */
  resolve(entity: string, name: string): AnimationDef | undefined {
    const def = this.content.actors.get(entity) ?? this.content.objects.get(entity);
    if (def === undefined) return undefined;
    const variant = this.host.variantOf(entity) ?? "default";
    const id = def.variants[variant]?.animations?.[name] ?? def.variants["default"]?.animations?.[name];
    return id === undefined ? undefined : this.defs.get(id);
  }

  /**
   * Start an action animation. Returns null (and starts nothing) when the
   * entity has no such animation. Signals go to core through the host.
   */
  play(entity: string, name: string, events: Omit<PlayerEvents, "onSignal"> = {}, options: StartOptions = {}): AnimationPlayer | null {
    const def = this.resolve(entity, name);
    if (def === undefined) return null;
    this.stopAction(entity);
    const player = new AnimationPlayer(def, this.clock, {
      onSignal: (e, n) => this.host.signal(e, n),
      onLoop: () => events.onLoop?.(),
      onDone: () => {
        if (this.action.get(entity)?.player === player) this.action.delete(entity);
        events.onDone?.();
      },
    });
    this.action.set(entity, { name, player });
    player.start(options);
    return player;
  }

  stopAction(entity: string): void {
    const a = this.action.get(entity);
    if (a === undefined) return;
    a.player.stop();
    this.action.delete(entity);
  }

  /** Set the automatic animation of an actor (called by the host every frame; cheap when unchanged). */
  setAuto(entity: string, mode: AutoMode, facing: string): void {
    const key = `${mode}|${facing}|${this.host.variantOf(entity) ?? ""}`;
    const cur = this.auto.get(entity);
    if (cur?.state.key === key) return;
    if (mode === "walk") {
      const action = this.action.get(entity);
      if (action !== undefined && action.player.status === "looping") this.stopAction(entity);
    }
    const phase = cur?.state.mode === "walk" && mode === "walk" ? (cur.player?.loopPhase() ?? undefined) : undefined;
    cur?.player?.stop();
    const name = [`${mode}.${facing}`, mode, ...(mode === "stand" ? [] : [`stand.${facing}`, "stand"])].find((n) => this.resolve(entity, n) !== undefined);
    const state: AutoState = { key, mode, facing };
    if (name === undefined) {
      this.auto.set(entity, { state, name: null, player: null });
      return;
    }
    const player = new AnimationPlayer(this.resolve(entity, name) as AnimationDef, this.clock, { onSignal: (e, n) => this.host.signal(e, n) });
    this.auto.set(entity, { state, name, player });
    player.start(phase !== undefined ? { loopPhase: phase } : {});
  }

  /** What to draw for an entity: the action, else the auto animation, else null. */
  view(entity: string): SlotView | null {
    const a = this.action.get(entity);
    if (a !== undefined) return { slot: "action", name: a.name, player: a.player };
    const auto = this.auto.get(entity);
    return auto?.player === null || auto === undefined ? null : { slot: "auto", name: auto.name, player: auto.player };
  }

  /** Forget an entity (left the scene, removed). */
  clear(entity: string): void {
    this.stopAction(entity);
    this.auto.get(entity)?.player?.stop();
    this.auto.delete(entity);
  }

  entities(): string[] {
    return [...new Set([...this.action.keys(), ...this.auto.keys()])].sort();
  }

  reset(): void {
    for (const e of this.entities()) this.clear(e);
  }
}
