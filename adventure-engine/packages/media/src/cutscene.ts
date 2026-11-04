/**
 * Cutscenes (spec 06 F6, phase 4).
 *
 * Variant choice (TS-F06): current language → "default" → the first variant in
 * content order, with a warning for the last step.
 *
 * Playback: a backend shows a video or a timeline and reports `ended` or
 * `failed`. Skip input is honoured only for skippable cutscenes after
 * `skipAfterMs` (default 1000 ms); earlier input is ignored.
 *
 * Hold (phase 4 decision): `hold: true` keeps the last picture on screen after
 * the cutscene has finished (the command is done, input is free again) until the
 * next cutscene starts or ClearCutscene / cutscene_clear removes it; a new game
 * also removes it. `hold: false` removes the picture when it ends.
 */

import { DEFAULT_SKIP_AFTER_MS, type CutsceneDef, type CutsceneVariantDef } from "@adventure-engine/content";
import type { Clock } from "./clock.ts";

export interface VariantChoice {
  readonly key: string;
  readonly variant: CutsceneVariantDef;
  /** "language" = the current language, "default", or "first" (warning). */
  readonly via: "language" | "default" | "first";
}

export function selectCutsceneVariant(def: CutsceneDef, language: string): VariantChoice | null {
  const v = def.variants;
  const own = v[language];
  if (own !== undefined) return { key: language, variant: own, via: "language" };
  const fallback = v["default"];
  if (fallback !== undefined) return { key: "default", variant: fallback, via: "default" };
  const first = Object.keys(v)[0];
  return first === undefined ? null : { key: first, variant: v[first] as CutsceneVariantDef, via: "first" };
}

export interface CutsceneShow {
  readonly name: string;
  readonly choice: VariantChoice;
  readonly hold: boolean;
}

/** What a backend must do: start showing, keep the last picture on `hold()`, remove on `clear()`. */
export interface CutsceneBackend {
  start(show: CutsceneShow, cb: { ended(): void; failed(message: string): void }): void;
  /** Stop playback and keep the last picture visible. */
  hold(): void;
  /** Stop playback and remove everything; releases media elements and listeners. */
  clear(): void;
}

export type CutsceneState = "idle" | "playing" | "held";

export interface CutsceneHost {
  warn(code: "W-CUTSCENE-LANG" | "W-CUTSCENE-FAILED", message: string): void;
  trace?(event: string, data: Record<string, unknown>): void;
}

export class CutscenePlayer {
  private readonly clock: Clock;
  private readonly host: CutsceneHost;
  private readonly makeBackend: (choice: VariantChoice) => CutsceneBackend;
  private backend: CutsceneBackend | null = null;
  private state_: CutsceneState = "idle";
  private current: { show: CutsceneShow; def: CutsceneDef; startedAt: number; done: () => void } | null = null;

  constructor(clock: Clock, makeBackend: (choice: VariantChoice) => CutsceneBackend, host: CutsceneHost) {
    this.clock = clock;
    this.makeBackend = makeBackend;
    this.host = host;
  }

  get state(): CutsceneState {
    return this.state_;
  }

  get name(): string | null {
    return this.current?.show.name ?? null;
  }

  get variant(): string | null {
    return this.current?.show.choice.key ?? null;
  }

  /** The current cutscene accepts skip input (once `skipAfterMs` has passed). */
  get skippable(): boolean {
    return this.state_ === "playing" && this.current?.def.skippable === true;
  }

  /** Skip input would be honoured right now. */
  canSkip(): boolean {
    if (!this.skippable) return false;
    // skippable implies a current cutscene.
    const cur = this.current as NonNullable<CutscenePlayer["current"]>;
    return this.clock.now() - cur.startedAt >= (cur.def.skipAfterMs ?? DEFAULT_SKIP_AFTER_MS);
  }

  /** Start a cutscene; `done` is called once when it ends, is skipped or fails (never after cancel/clear). */
  play(name: string, def: CutsceneDef, language: string, hold: boolean, done: () => void): void {
    this.clear();
    const choice = selectCutsceneVariant(def, language);
    if (choice === null) {
      this.host.warn("W-CUTSCENE-FAILED", `cutscene "${name}" has no variants`);
      done();
      return;
    }
    if (choice.via === "first") this.host.warn("W-CUTSCENE-LANG", `cutscene "${name}" has no "${language}" or "default" variant; using "${choice.key}"`);
    const show: CutsceneShow = { name, choice, hold };
    const backend = this.makeBackend(choice);
    this.backend = backend;
    this.state_ = "playing";
    const cur = { show, def, startedAt: this.clock.now(), done };
    this.current = cur;
    this.host.trace?.("cutscene.start", { name, variant: choice.key, via: choice.via, hold });
    backend.start(show, {
      ended: () => this.finish(cur, "ended"),
      failed: (message) => {
        if (this.current !== cur) return;
        this.host.warn("W-CUTSCENE-FAILED", `cutscene "${name}" failed: ${message}`);
        this.finish(cur, "failed");
      },
    });
  }

  /** Skip input (click, Enter, Space, Escape). Returns true when the cutscene was skipped. */
  skip(): boolean {
    const cur = this.current;
    if (cur === null || this.state_ !== "playing" || cur.def.skippable !== true) return false;
    if (this.clock.now() - cur.startedAt < (cur.def.skipAfterMs ?? DEFAULT_SKIP_AFTER_MS)) {
      this.host.trace?.("cutscene.skip-ignored", { name: cur.show.name });
      return false;
    }
    this.finish(cur, "skipped");
    return true;
  }

  private finish(cur: NonNullable<CutscenePlayer["current"]>, how: string): void {
    if (this.current !== cur || this.state_ !== "playing") return;
    this.host.trace?.("cutscene.end", { name: cur.show.name, how, hold: cur.show.hold && how !== "failed" });
    if (cur.show.hold && how !== "failed") {
      this.backend?.hold();
      this.state_ = "held";
    } else {
      this.backend?.clear();
      this.backend = null;
      this.current = null;
      this.state_ = "idle";
    }
    cur.done();
  }

  /** Remove a playing or held cutscene without calling `done` (ClearCutscene, cancellation, new game). */
  clear(): void {
    if (this.current !== null) this.host.trace?.("cutscene.clear", { name: this.current.show.name, state: this.state_ });
    this.backend?.clear();
    this.backend = null;
    this.current = null;
    this.state_ = "idle";
  }
}

/**
 * Timeline backend: shows the timeline frames at their times on the clock and
 * ends at `durationMs`. Also used headless for video variants (with the
 * variant's `durationMs`).
 */
export class TimelineBackend implements CutsceneBackend {
  private readonly clock: Clock;
  private timers: number[] = [];
  private frameCount = 0;
  /** Index of the visible timeline frame, or -1. */
  frameIndex = -1;
  visible = false;
  playing = false;

  constructor(clock: Clock) {
    this.clock = clock;
  }

  start(show: CutsceneShow, cb: { ended(): void; failed(message: string): void }): void {
    const v = show.choice.variant;
    this.visible = true;
    this.playing = true;
    this.frameCount = v.timeline?.length ?? 0;
    if (v.durationMs === undefined) {
      this.timers.push(this.clock.setTimer(0, () => cb.failed("no durationMs for headless playback")));
      return;
    }
    (v.timeline ?? []).forEach((f, i) => {
      this.timers.push(this.clock.setTimer(f.atMs, () => {
        this.frameIndex = i;
      }));
    });
    this.timers.push(this.clock.setTimer(v.durationMs, () => {
      this.playing = false;
      cb.ended();
    }));
  }

  private stopTimers(): void {
    for (const t of this.timers) this.clock.clearTimer(t);
    this.timers = [];
    this.playing = false;
  }

  /** The last picture stays: a skipped timeline jumps to its final frame. */
  hold(): void {
    this.stopTimers();
    if (this.frameCount > 0) this.frameIndex = this.frameCount - 1;
  }

  clear(): void {
    this.stopTimers();
    this.visible = false;
    this.frameIndex = -1;
  }
}
