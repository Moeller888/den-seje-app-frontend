/**
 * Media part of a presentation adapter (phase 4): PlayAnimation, PlaySound,
 * StopSound, PlayCutscene, ClearCutscene and the "cannot" animation of React,
 * plus the core notifications (abandoned commands, cancelled runs, scene exit,
 * reset). Used unchanged by the headless runner and by the browser app; only
 * the clock and the audio/cutscene backends differ.
 *
 * Reply rules:
 * - finite animation / finite sound / cutscene: `await`, answered when done;
 * - loop animation: answered as soon as the loop is established;
 * - loop sound, StopSound, ClearCutscene: fire-and-forget in core;
 * - nothing to play (unknown animation or cutscene): `auto 0` plus a warning;
 * - replies are always sent later from a clock timer (never inside onCommand)
 *   and only while core still waits; abandoned commands are never answered.
 */

import type { LoadedContent } from "@adventure-engine/content";
import { RuntimeCode, type Command, type Disposition, type PresentationWarningCode } from "@adventure-engine/core";
import { Animator } from "./animator.ts";
import type { Clock } from "./clock.ts";
import { CutscenePlayer, type CutsceneBackend, type VariantChoice } from "./cutscene.ts";
import { SoundMixer, type AudioBackend } from "./mixer.ts";

export type MediaWarningCode = "W-AUDIO-LOAD" | "W-AUDIO-LOCKED" | "W-AUDIO-UNAVAILABLE" | "W-CUTSCENE-LANG" | "W-CUTSCENE-FAILED" | "W-ANIM-MISSING";

/** The engine's runtime code for each media warning (for `engine.reportWarning`). */
export const MEDIA_WARNING_CODES: Readonly<Record<MediaWarningCode, PresentationWarningCode>> = {
  "W-AUDIO-LOAD": RuntimeCode.AudioLoad,
  "W-AUDIO-LOCKED": RuntimeCode.AudioLocked,
  "W-AUDIO-UNAVAILABLE": RuntimeCode.AudioUnavailable,
  "W-CUTSCENE-LANG": RuntimeCode.CutsceneLang,
  "W-CUTSCENE-FAILED": RuntimeCode.CutsceneFailed,
  "W-ANIM-MISSING": RuntimeCode.AnimMissing,
};

export interface PresenterHost {
  readonly content: LoadedContent;
  readonly clock: Clock;
  reply(cmdId: string): void;
  signal(entity: string, name: string): void;
  warn(code: MediaWarningCode, message: string): void;
  trace?(event: string, data: Record<string, unknown>): void;
  variantOf(entity: string): string | null;
  /** Scene an entity belongs to for sound ownership (null: none). The player and its inventory belong to no scene. */
  ownerScene(entity: string): string | null;
  /** The player's current scene (cutscenes are looked up there). */
  playerScene(): string | null;
}

export interface PresenterBackends {
  readonly audio: AudioBackend;
  readonly cutscene: (choice: VariantChoice) => CutsceneBackend;
}

interface PendingMedia {
  readonly cmd: Command;
  stop(): void;
}

export class MediaPresenter {
  readonly animator: Animator;
  readonly mixer: SoundMixer;
  readonly cutscenes: CutscenePlayer;
  private readonly host: PresenterHost;
  private readonly pending = new Map<string, PendingMedia>();
  /** Run that started the current action animation of an entity. */
  private readonly animOwner = new Map<string, string>();
  private readonly timers = new Set<number>();
  private disposed = false;

  constructor(host: PresenterHost, backends: PresenterBackends) {
    this.host = host;
    this.animator = new Animator(host.content, host.clock, { variantOf: (e) => host.variantOf(e), signal: (e, n) => this.signal(e, n) });
    this.mixer = new SoundMixer(host.content, backends.audio, { warn: (c, m) => host.warn(c, m), ...(host.trace !== undefined ? { trace: host.trace } : {}) });
    this.cutscenes = new CutscenePlayer(host.clock, backends.cutscene, { warn: (c, m) => host.warn(c, m), ...(host.trace !== undefined ? { trace: host.trace } : {}) });
  }

  /** Commands still awaited by core that this presenter is working on. */
  get pendingCount(): number {
    return this.pending.size;
  }

  private signal(entity: string, name: string): void {
    // Signals are events for core; they never block the animation.
    this.later(() => this.host.signal(entity, name));
  }

  private later(fn: () => void): void {
    const id = this.host.clock.setTimer(0, () => {
      this.timers.delete(id);
      fn();
    });
    this.timers.add(id);
  }

  /** Answer later, and only if core still waits for this command. */
  private answer(cmdId: string): void {
    this.later(() => {
      if (!this.pending.delete(cmdId)) return;
      this.host.reply(cmdId);
    });
  }

  /** Handle a media command; null for commands that are not media (the outer adapter handles them). */
  handle(cmd: Command): Disposition | null {
    if (this.disposed) return null;
    switch (cmd.type) {
      case "PlayAnimation": {
        if (this.animator.resolve(cmd.entity, cmd.animation) === undefined) {
          this.host.warn("W-ANIM-MISSING", `"${cmd.entity}" has no animation "${cmd.animation}"; nothing is played`);
          return { kind: "auto", afterMs: 0 };
        }
        // Register before starting: a program can finish or loop synchronously.
        this.pending.set(cmd.cmdId, { cmd, stop: () => this.stopAnimationOf(cmd.entity, player) });
        this.animOwner.set(cmd.entity, cmd.runId);
        const player = this.animator.play(cmd.entity, cmd.animation, { onLoop: () => this.answer(cmd.cmdId), onDone: () => this.answer(cmd.cmdId) });
        this.host.trace?.("anim.start", { entity: cmd.entity, animation: cmd.animation, loop: player?.def.loop === true || player?.status === "looping" });
        return { kind: "await" };
      }
      case "PlaySound": {
        if (cmd.times === "loop") {
          this.mixer.play({ entity: cmd.entity, name: cmd.sound, times: "loop", volume: cmd.volume, ownerRun: cmd.runId }, () => {});
          return { kind: "auto", afterMs: 0 };
        }
        let id: number | null = null;
        this.pending.set(cmd.cmdId, {
          cmd,
          stop: () => {
            if (id !== null) this.mixer.stopId(id, 0);
          },
        });
        id = this.mixer.play({ entity: cmd.entity, name: cmd.sound, times: cmd.times, volume: cmd.volume, ownerRun: cmd.runId }, () => this.answer(cmd.cmdId))?.id ?? null;
        return { kind: "await" };
      }
      case "StopSound":
        this.mixer.stop(cmd.entity, cmd.sound);
        return { kind: "auto", afterMs: 0 };
      case "PlayCutscene": {
        const scene = this.host.playerScene();
        const def = scene === null ? undefined : this.host.content.scenes.get(scene)?.cutscenes?.[cmd.cutscene];
        if (def === undefined) {
          this.host.warn("W-CUTSCENE-FAILED", `scene "${String(scene)}" has no cutscene "${cmd.cutscene}"`);
          return { kind: "auto", afterMs: 0 };
        }
        this.pending.set(cmd.cmdId, { cmd, stop: () => this.cutscenes.clear() });
        this.cutscenes.play(cmd.cutscene, def, cmd.language, cmd.hold || def.hold === true, () => this.answer(cmd.cmdId));
        return { kind: "await" };
      }
      case "ClearCutscene":
        this.cutscenes.clear();
        return { kind: "auto", afterMs: 0 };
      case "React":
        // Optional "cannot" animation; the outer adapter shows the rest of the reaction.
        if (this.animator.resolve(cmd.actor, "cannot") !== undefined) this.animator.play(cmd.actor, "cannot");
        return null;
      default:
        return null;
    }
  }

  private stopAnimationOf(entity: string, player: unknown): void {
    if (this.animator.view(entity)?.player === player) this.animator.stopAction(entity);
  }

  /** Skip input for the current cutscene (TS: skip honours skippable and skipAfterMs). */
  skipCutscene(): boolean {
    return this.cutscenes.skip();
  }

  // ---------------------------------------------------------------------------
  // Core notifications (never call back into the engine from here)
  // ---------------------------------------------------------------------------

  onCommandAbandoned(cmd: Command, reason: "timeout" | "cancelled"): void {
    const p = this.pending.get(cmd.cmdId);
    if (p === undefined) return;
    this.pending.delete(cmd.cmdId);
    p.stop();
    this.host.trace?.("command.abandoned", { cmdId: cmd.cmdId, type: cmd.type, reason });
  }

  onRunCancelled(runId: string): void {
    this.mixer.stopOwnedBy(runId);
    for (const [entity, owner] of [...this.animOwner]) {
      if (owner !== runId) continue;
      this.animOwner.delete(entity);
      this.animator.stopAction(entity);
    }
  }

  onSceneExit(sceneId: string): void {
    this.mixer.stopForSceneExit((entity) => this.host.ownerScene(entity) === sceneId);
    for (const entity of this.animator.entities()) if (this.host.ownerScene(entity) === sceneId) this.animator.clear(entity);
  }

  onReset(): void {
    for (const p of this.pending.values()) p.stop();
    this.pending.clear();
    this.animOwner.clear();
    this.animator.reset();
    this.mixer.stopAll(0);
    this.cutscenes.clear();
  }

  /** Release every timer, player, sound and cutscene deterministically. */
  dispose(): void {
    this.onReset();
    for (const t of this.timers) this.host.clock.clearTimer(t);
    this.timers.clear();
    this.mixer.dispose();
    this.disposed = true;
  }
}
