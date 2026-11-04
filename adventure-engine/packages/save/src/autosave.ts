/**
 * Autosave to slot `auto` (spec 05 E3.2, TS-E03): after every completed scene
 * transition, when the player goes to the title screen, and when the page is
 * hidden. A request made while the engine is not idle waits for the next idle
 * point (`tick()`, called every frame); a later request replaces an earlier one.
 */

import type { Engine } from "@adventure-engine/core";
import type { SlotManager, WriteResult } from "./slots.ts";

export type AutosaveReason = "transition" | "title" | "hidden";

export class Autosaver {
  private readonly engine: Engine;
  private readonly slots: SlotManager;
  private readonly slot: string;
  private pending_: AutosaveReason | null = null;
  private seenTransitions: number;
  private saving = false;
  /** Called after each autosave attempt (UI notice, tests). */
  onSaved: (reason: AutosaveReason, result: WriteResult) => void = () => {};

  constructor(engine: Engine, slots: SlotManager, slot = "auto") {
    this.engine = engine;
    this.slots = slots;
    this.slot = slot;
    this.seenTransitions = engine.completedTransitions;
  }

  get pending(): AutosaveReason | null {
    return this.pending_;
  }

  request(reason: AutosaveReason): void {
    this.pending_ = reason;
    this.tick();
  }

  /** Per frame: notice finished transitions and save when idle. */
  tick(): void {
    // A counter, not polling: a transition may start and finish between two frames.
    const done = this.engine.completedTransitions;
    if (done !== this.seenTransitions) {
      this.seenTransitions = done;
      this.pending_ = "transition";
    }
    const reason = this.pending_;
    if (reason === null || this.saving || !this.engine.canSave()) return;
    this.saving = true;
    this.pending_ = null;
    this.engine.requestSave((o) => {
      this.saving = false;
      // A save that became impossible (rare: logic started meanwhile) is retried at the next idle point.
      if (!o.ok) {
        this.pending_ ??= reason;
        return;
      }
      this.onSaved(reason, this.slots.write(this.slot, o.json));
    });
  }
}
