/**
 * Ambient state for saves (spec 05 E2 `ambient`, phase 5): the looping sounds
 * that core started and that are still running, so that a load can restart
 * them. Core sees the loops through its own commands (`sound_play` with
 * `times: "loop"`, `sound_stop`) and applies the same scene clean-up rule as
 * the presentation layer (phase 4): leaving a scene ends the loops it owns,
 * except sounds marked `persistAcrossScenes`.
 */

import type { LoadedContent, SoundDef } from "@adventure-engine/content";

export interface AmbientLoop {
  readonly entity: string;
  readonly sound: string;
  readonly volume: number;
}

/** Sound definition behind an entity's sound name (the name may also be a sound id). */
export function resolveSound(content: LoadedContent, entity: string, name: string): SoundDef | undefined {
  const map = content.scenes.get(entity)?.sounds ?? content.actors.get(entity)?.sounds ?? content.objects.get(entity)?.sounds;
  const id = map?.[name] ?? name;
  return (content.pkg.sounds ?? []).find((s) => s.id === id);
}

export class AmbientTracker {
  private readonly content: LoadedContent;
  private loops_: AmbientLoop[] = [];

  constructor(content: LoadedContent) {
    this.content = content;
  }

  /** Running loops in start order (a loop started twice is listed twice, as it plays twice). */
  get loops(): readonly AmbientLoop[] {
    return this.loops_;
  }

  started(loop: AmbientLoop): void {
    this.loops_.push(loop);
  }

  stopped(entity: string, sound: string): void {
    this.loops_ = this.loops_.filter((l) => !(l.entity === entity && l.sound === sound));
  }

  /** The player leaves `scene`: its non-persistent loops end (`owner` maps an entity to its scene). */
  sceneExit(scene: string, owner: (entity: string) => string | null): void {
    this.loops_ = this.loops_.filter((l) => owner(l.entity) !== scene || resolveSound(this.content, l.entity, l.sound)?.persistAcrossScenes === true);
  }

  restore(loops: readonly AmbientLoop[]): void {
    this.loops_ = [...loops];
  }

  reset(): void {
    this.loops_ = [];
  }
}
