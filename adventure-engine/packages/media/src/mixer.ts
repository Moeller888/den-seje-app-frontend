/**
 * Sound model (spec 06 F4, phase 4): channels, volumes, mute, active
 * playbacks, ownership and scene clean-up. Playback itself is delegated to an
 * `AudioBackend` (Web Audio in the browser, the clock-driven headless backend
 * in tests and scenarios).
 *
 * Effective volume = master × channel × command × asset, clamped to [0, 1];
 * 0 while muted. Mute keeps every volume setting, so unmute restores them.
 */

import { SOUND_CHANNELS, type LoadedContent, type SoundChannel, type SoundDef } from "@adventure-engine/content";
import type { Clock } from "./clock.ts";

export const DEFAULT_FADE_MS = 500;

export interface BackendPlayback {
  readonly id: number;
  readonly asset: string;
  readonly times: number | "loop";
  readonly volume: number;
  readonly durationMs?: number;
  readonly loopStartMs?: number;
  readonly loopEndMs?: number;
}

export interface AudioBackend {
  /** No sound can be made right now (before the first user gesture, or never: see `unavailable`). */
  readonly locked: boolean;
  /** Audio will not become available (no Web Audio, or the browser refused it). Default false. */
  readonly unavailable?: boolean;
  /** Start playing; exactly one of `ended` (finite, all repetitions) or `failed` follows, unless stopped first. */
  start(p: BackendPlayback, cb: { ended(): void; failed(message: string): void }): void;
  setVolume(id: number, volume: number): void;
  /** Stop with a fade; no callback follows. Unknown ids are ignored. */
  stop(id: number, fadeMs: number): void;
  dispose(): void;
}

export interface Playback {
  readonly id: number;
  readonly entity: string;
  readonly name: string;
  readonly sound: SoundDef;
  readonly times: number | "loop";
  readonly commandVolume: number;
  /** Run that issued the command (loops stop when this run is cancelled). */
  readonly ownerRun: string;
  /** Waiting for the audio unlock (loops started before the first user gesture). */
  queued: boolean;
}

export interface MixerHost {
  warn(code: "W-AUDIO-LOAD" | "W-AUDIO-LOCKED" | "W-AUDIO-UNAVAILABLE", message: string): void;
  trace?(event: string, data: Record<string, unknown>): void;
}

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

export class SoundMixer {
  private readonly content: LoadedContent;
  private readonly backend: AudioBackend;
  private readonly host: MixerHost;
  private readonly sounds = new Map<string, SoundDef>();
  private readonly active = new Map<number, Playback>();
  private nextId = 1;
  private master_ = 1;
  private readonly channels: Record<SoundChannel, number> = { music: 1, ambient: 1, sfx: 1, voice: 1 };
  private muted_ = false;
  private readonly warnedLocked = new Set<string>();

  constructor(content: LoadedContent, backend: AudioBackend, host: MixerHost) {
    this.content = content;
    this.backend = backend;
    this.host = host;
    for (const s of content.pkg.sounds ?? []) this.sounds.set(s.id, s);
  }

  get master(): number {
    return this.master_;
  }

  get muted(): boolean {
    return this.muted_;
  }

  channelVolume(ch: SoundChannel): number {
    return this.channels[ch];
  }

  /** Sound definition behind an entity's sound name (the name may also be a sound id). */
  resolve(entity: string, name: string): SoundDef | undefined {
    const c = this.content;
    const map = c.scenes.get(entity)?.sounds ?? c.actors.get(entity)?.sounds ?? c.objects.get(entity)?.sounds;
    return this.sounds.get(map?.[name] ?? name);
  }

  effectiveVolume(p: Pick<Playback, "sound" | "commandVolume">): number {
    if (this.muted_) return 0;
    return clamp01(this.master_ * this.channels[p.sound.channel] * clamp01(p.commandVolume) * clamp01(p.sound.volume ?? 1));
  }

  /**
   * Start a sound. `done` is called once when a finite sound has played all
   * repetitions, failed, could not be resolved or was refused before the audio
   * unlock; never for loops. Returns the playback or null.
   */
  play(o: { entity: string; name: string; times: number | "loop"; volume: number; ownerRun: string }, done: () => void): Playback | null {
    const sound = this.resolve(o.entity, o.name);
    if (sound === undefined) {
      this.host.warn("W-AUDIO-LOAD", `"${o.entity}" has no sound "${o.name}"`);
      done();
      return null;
    }
    if (o.times !== "loop" && this.backend.locked) {
      const never = this.backend.unavailable === true;
      const code = never ? "W-AUDIO-UNAVAILABLE" : "W-AUDIO-LOCKED";
      if (!this.warnedLocked.has(code)) {
        this.warnedLocked.add(code);
        this.host.warn(code, never ? "audio is not available in this browser; sounds are skipped (the game continues)" : "audio is locked until the first user interaction; finite sounds are skipped until then");
      }
      done();
      return null;
    }
    const p: Playback = { id: this.nextId++, entity: o.entity, name: o.name, sound, times: o.times, commandVolume: o.volume, ownerRun: o.ownerRun, queued: false };
    this.active.set(p.id, p);
    this.host.trace?.("sound.play", { id: p.id, entity: p.entity, name: p.name, times: p.times });
    if (this.backend.locked) {
      p.queued = true;
      return p;
    }
    this.startBackend(p, done);
    return p;
  }

  private startBackend(p: Playback, done: () => void): void {
    p.queued = false;
    const s = p.sound;
    this.backend.start(
      {
        id: p.id,
        asset: s.asset,
        times: p.times,
        volume: this.effectiveVolume(p),
        ...(s.durationMs !== undefined ? { durationMs: s.durationMs } : {}),
        ...(s.loopStartMs !== undefined ? { loopStartMs: s.loopStartMs } : {}),
        ...(s.loopEndMs !== undefined ? { loopEndMs: s.loopEndMs } : {}),
      },
      {
        ended: () => {
          if (!this.active.delete(p.id)) return;
          this.host.trace?.("sound.end", { id: p.id });
          done();
        },
        failed: (message) => {
          this.active.delete(p.id);
          this.host.warn("W-AUDIO-LOAD", `sound "${s.id}" (${s.asset}) failed: ${message}`);
          done();
        },
      },
    );
  }

  /** The audio unlock happened: start the queued loops. */
  unlocked(): void {
    for (const p of [...this.active.values()]) if (p.queued) this.startBackend(p, () => {});
  }

  /** Stop matching playbacks with a fade. Idempotent: stopping nothing is a no-op. */
  stop(entity: string, name: string, fadeMs = DEFAULT_FADE_MS): number {
    return this.stopWhere((p) => p.entity === entity && p.name === name, fadeMs, "stop");
  }

  /** Stop one playback (an abandoned finite sound). */
  stopId(id: number, fadeMs = DEFAULT_FADE_MS): number {
    return this.stopWhere((p) => p.id === id, fadeMs, "abandoned");
  }

  /** Loops still owned by a cancelled run. */
  stopOwnedBy(runId: string, fadeMs = DEFAULT_FADE_MS): number {
    return this.stopWhere((p) => p.times === "loop" && p.ownerRun === runId, fadeMs, "cancel");
  }

  /**
   * Scene clean-up (TS-F05): loops whose owner belongs to the left scene fade
   * out, unless the sound persists across scenes. `inScene(entity)` decides the
   * ownership (the scene itself, actors standing in it, objects lying in it;
   * the player and its inventory travel with the player and are not in it).
   */
  stopForSceneExit(inScene: (entity: string) => boolean, fadeMs = DEFAULT_FADE_MS): number {
    return this.stopWhere((p) => p.times === "loop" && p.sound.persistAcrossScenes !== true && inScene(p.entity), fadeMs, "scene-exit");
  }

  stopAll(fadeMs = 0): number {
    return this.stopWhere(() => true, fadeMs, "reset");
  }

  private stopWhere(pred: (p: Playback) => boolean, fadeMs: number, reason: string): number {
    const hits = [...this.active.values()].filter(pred);
    for (const p of hits) {
      this.active.delete(p.id);
      // A queued loop has never sounded: nothing to fade.
      const fade = p.queued ? 0 : fadeMs;
      this.backend.stop(p.id, fade);
      this.host.trace?.("sound.stop", { id: p.id, reason, fadeMs: fade });
    }
    return hits.length;
  }

  setMaster(v: number): void {
    this.master_ = clamp01(v);
    this.refresh();
  }

  setChannel(ch: SoundChannel, v: number): void {
    if (!(SOUND_CHANNELS as readonly string[]).includes(ch)) throw new RangeError(`unknown channel "${String(ch)}"`);
    this.channels[ch] = clamp01(v);
    this.refresh();
  }

  setMuted(m: boolean): void {
    this.muted_ = m;
    this.refresh();
  }

  private refresh(): void {
    for (const p of this.active.values()) if (!p.queued) this.backend.setVolume(p.id, this.effectiveVolume(p));
  }

  /** Active playbacks in start order (observability). */
  playing(): Playback[] {
    return [...this.active.values()];
  }

  dispose(): void {
    this.stopAll(0);
    this.backend.dispose();
  }
}

/**
 * Headless backend: a finite sound ends after `durationMs × times` on the
 * clock (immediately without a duration); loops run until stopped. Fades are
 * kept observable until they finish.
 */
export class HeadlessAudioBackend implements AudioBackend {
  private readonly clock: Clock;
  private locked_ = false;
  private readonly timers = new Map<number, number>();
  readonly volumes = new Map<number, number>();
  readonly fading = new Map<number, number>();
  private readonly fadeTimers = new Map<number, number>();
  /** Assets that fail to "load" (tests). */
  readonly failing = new Set<string>();
  private onUnlock: (() => void) | null = null;

  constructor(clock: Clock, options: { locked?: boolean } = {}) {
    this.clock = clock;
    this.locked_ = options.locked ?? false;
  }

  get locked(): boolean {
    return this.locked_;
  }

  /** Simulate the first user gesture. */
  unlock(): void {
    this.locked_ = false;
    this.onUnlock?.();
  }

  set unlockListener(fn: (() => void) | null) {
    this.onUnlock = fn;
  }

  start(p: BackendPlayback, cb: { ended(): void; failed(message: string): void }): void {
    this.volumes.set(p.id, p.volume);
    if (this.failing.has(p.asset)) {
      this.timers.set(p.id, this.clock.setTimer(0, () => {
        this.forget(p.id);
        cb.failed("decode error");
      }));
      return;
    }
    if (p.times === "loop") return;
    const ms = (p.durationMs ?? 0) * p.times;
    this.timers.set(p.id, this.clock.setTimer(ms, () => {
      this.forget(p.id);
      cb.ended();
    }));
  }

  setVolume(id: number, volume: number): void {
    if (this.volumes.has(id)) this.volumes.set(id, volume);
  }

  stop(id: number, fadeMs: number): void {
    if (!this.volumes.has(id)) return;
    this.forget(id);
    if (fadeMs <= 0) return;
    this.fading.set(id, fadeMs);
    this.fadeTimers.set(id, this.clock.setTimer(fadeMs, () => {
      this.fading.delete(id);
      this.fadeTimers.delete(id);
    }));
  }

  private forget(id: number): void {
    const t = this.timers.get(id);
    if (t !== undefined) this.clock.clearTimer(t);
    this.timers.delete(id);
    this.volumes.delete(id);
  }

  dispose(): void {
    for (const id of [...this.volumes.keys()]) this.forget(id);
    for (const t of this.fadeTimers.values()) this.clock.clearTimer(t);
    this.fadeTimers.clear();
    this.fading.clear();
    this.onUnlock = null;
  }
}
