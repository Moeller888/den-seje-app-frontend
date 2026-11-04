/**
 * Web Audio backend for the sound mixer (phase 4).
 *
 * - One AudioContext; every playback is source → gain → destination. The mixer
 *   computes the effective volume (master × channel × command × asset, mute).
 * - Autoplay: the backend is locked until `unlock()` is called from a real user
 *   gesture, whatever the browser's own policy is (deterministic everywhere).
 *   `unlock()` resumes the context but never waits on it: a refused resume
 *   leaves the backend in "refused" (sounds complete, nothing hangs).
 * - Finite sounds restart the buffer until all repetitions are done; loops use
 *   the buffer's loop points.
 * - Stop fades the gain over `fadeMs`, then stops and disconnects the nodes.
 *   All listeners are removed; `dispose()` stops everything and closes the context.
 * - Buffers are fetched and decoded once per URL (deduplicated); the first
 *   format the browser reports as playable is used.
 *
 * The browser objects are injected (`AudioEnv`), so the backend is unit-tested
 * with fakes.
 */

import type { MediaManifest } from "@adventure-engine/content";
import { chooseFormat, type AudioBackend, type BackendPlayback } from "@adventure-engine/media";

/** The subset of Web Audio this backend uses. */
export interface AudioContextLike {
  readonly state: string;
  readonly currentTime: number;
  readonly destination: unknown;
  resume(): Promise<void>;
  close(): Promise<void>;
  decodeAudioData(data: ArrayBuffer): Promise<AudioBufferLike>;
  createGain(): GainLike;
  createBufferSource(): SourceLike;
}

export interface AudioBufferLike {
  readonly duration: number;
}

export interface GainLike {
  readonly gain: { value: number; cancelScheduledValues(t: number): void; setValueAtTime(v: number, t: number): void; linearRampToValueAtTime(v: number, t: number): void };
  connect(target: unknown): void;
  disconnect(): void;
}

export interface SourceLike {
  buffer: AudioBufferLike | null;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  onended: (() => void) | null;
  connect(target: unknown): void;
  disconnect(): void;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface AudioEnv {
  /** null when Web Audio is not available. */
  createContext(): AudioContextLike | null;
  fetchBytes(url: string): Promise<ArrayBuffer>;
  canPlay(type: string): boolean;
  /** Real-time timer for releasing nodes after a fade. */
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(id: number): void;
}

export type AudioState = "locked" | "running" | "refused" | "unavailable";

interface Live {
  readonly p: BackendPlayback;
  gain: GainLike | null;
  source: SourceLike | null;
  played: number;
  stopped: boolean;
  releaseTimer: number | null;
}

export class WebAudioBackend implements AudioBackend {
  private readonly env: AudioEnv;
  private readonly manifest: MediaManifest;
  private ctx: AudioContextLike | null;
  private state_: AudioState;
  private readonly buffers = new Map<string, Promise<AudioBufferLike>>();
  private readonly live = new Map<number, Live>();
  private listener: (() => void) | null = null;

  constructor(env: AudioEnv, manifest: MediaManifest) {
    this.env = env;
    this.manifest = manifest;
    let ctx: AudioContextLike | null = null;
    try {
      ctx = env.createContext();
    } catch {
      ctx = null;
    }
    this.ctx = ctx;
    this.state_ = ctx === null ? "unavailable" : "locked";
  }

  get state(): AudioState {
    return this.state_;
  }

  /** Locked until a user gesture; also when audio is unavailable or the browser refused it. */
  get locked(): boolean {
    return this.state_ !== "running";
  }

  /** Audio will not come: no Web Audio, or the browser refused to start it. */
  get unavailable(): boolean {
    return this.state_ === "unavailable" || this.state_ === "refused";
  }

  /** Called once audio becomes usable (the mixer starts queued loops). */
  set unlockListener(fn: (() => void) | null) {
    this.listener = fn;
  }

  /** Call from a user gesture handler. Returns the resulting state; never waits for the browser. */
  unlock(): AudioState {
    const ctx = this.ctx;
    if (ctx === null || this.state_ !== "locked") return this.state_;
    this.state_ = "running";
    ctx.resume().catch(() => {
      // The browser refused: finite sounds complete at once, loops stay queued.
      this.state_ = "refused";
    });
    this.listener?.();
    return this.state_;
  }

  /** Playbacks currently producing sound (observability). */
  snapshot(): Array<{ id: number; asset: string; loop: boolean; volume: number }> {
    return [...this.live.values()].filter((l) => !l.stopped).map((l) => ({ id: l.p.id, asset: l.p.asset, loop: l.p.times === "loop", volume: l.gain?.gain.value ?? l.p.volume }));
  }

  private buffer(asset: string): Promise<AudioBufferLike> {
    const entry = this.manifest[asset];
    const fmt = entry === undefined ? null : chooseFormat(entry, (t) => this.env.canPlay(t));
    if (fmt === null) return Promise.reject(new Error(entry === undefined ? `unknown audio asset "${asset}"` : `no playable format for "${asset}"`));
    let p = this.buffers.get(fmt.url);
    if (p === undefined) {
      const ctx = this.ctx as AudioContextLike;
      p = this.env.fetchBytes(fmt.url).then((bytes) => ctx.decodeAudioData(bytes));
      this.buffers.set(fmt.url, p);
      // A failed load may be retried later.
      p.catch(() => this.buffers.delete(fmt.url));
    }
    return p;
  }

  /** Fetch and decode ahead of time (scene preload); never rejects, failures surface when the sound plays. */
  async preload(assets: readonly string[]): Promise<void> {
    if (this.ctx === null) return;
    await Promise.all(assets.map((a) => this.buffer(a).then(() => undefined, () => undefined)));
  }

  start(p: BackendPlayback, cb: { ended(): void; failed(message: string): void }): void {
    const live: Live = { p, gain: null, source: null, played: 0, stopped: false, releaseTimer: null };
    this.live.set(p.id, live);
    if (this.ctx === null) {
      this.live.delete(p.id);
      cb.failed("Web Audio is not available");
      return;
    }
    this.buffer(p.asset).then(
      (buf) => {
        if (live.stopped || this.ctx === null) return;
        const gain = this.ctx.createGain();
        gain.gain.value = p.volume;
        gain.connect(this.ctx.destination);
        live.gain = gain;
        const playOnce = (): void => {
          const ctx = this.ctx as AudioContextLike;
          const src = ctx.createBufferSource();
          src.buffer = buf;
          if (p.times === "loop") {
            src.loop = true;
            if (p.loopStartMs !== undefined) src.loopStart = p.loopStartMs / 1000;
            if (p.loopEndMs !== undefined) src.loopEnd = p.loopEndMs / 1000;
          }
          src.onended = () => {
            src.onended = null;
            src.disconnect();
            if (live.stopped || p.times === "loop") return;
            live.played++;
            if (live.played < p.times) playOnce();
            else {
              this.release(live);
              cb.ended();
            }
          };
          src.connect(gain);
          live.source = src;
          src.start();
        };
        playOnce();
      },
      (err: unknown) => {
        if (live.stopped) return;
        this.live.delete(p.id);
        cb.failed(err instanceof Error ? err.message : String(err));
      },
    );
  }

  setVolume(id: number, volume: number): void {
    const l = this.live.get(id);
    if (l === undefined || l.stopped) return;
    if (l.gain === null) return;
    // A playback with nodes implies a live context (dispose clears all playbacks first).
    l.gain.gain.cancelScheduledValues((this.ctx as AudioContextLike).currentTime);
    l.gain.gain.value = volume;
  }

  stop(id: number, fadeMs: number): void {
    const l = this.live.get(id);
    if (l === undefined || l.stopped) return;
    l.stopped = true;
    const ctx = this.ctx;
    if (ctx === null || l.gain === null || l.source === null || fadeMs <= 0) {
      this.release(l);
      return;
    }
    const t = ctx.currentTime;
    l.gain.gain.cancelScheduledValues(t);
    l.gain.gain.setValueAtTime(l.gain.gain.value, t);
    l.gain.gain.linearRampToValueAtTime(0, t + fadeMs / 1000);
    l.releaseTimer = this.env.setTimeout(() => this.release(l), fadeMs);
  }

  /** Stop and disconnect the nodes of a playback and forget it. */
  private release(l: Live): void {
    if (l.releaseTimer !== null) this.env.clearTimeout(l.releaseTimer);
    l.releaseTimer = null;
    l.stopped = true;
    const src = l.source;
    if (src !== null) {
      src.onended = null;
      try {
        src.stop();
      } catch {
        // Already stopped.
      }
      src.disconnect();
    }
    l.gain?.disconnect();
    l.source = null;
    l.gain = null;
    this.live.delete(l.p.id);
  }

  /** Number of playbacks still holding nodes or waiting for a buffer. */
  get liveCount(): number {
    return this.live.size;
  }

  dispose(): void {
    for (const l of [...this.live.values()]) this.release(l);
    this.buffers.clear();
    this.listener = null;
    const ctx = this.ctx;
    this.ctx = null;
    this.state_ = "unavailable";
    ctx?.close().catch(() => {});
  }
}

/** The real browser environment. */
export function browserAudioEnv(): AudioEnv {
  // Typed structurally so that the package needs no DOM typings (it is unit-tested headless).
  const doc = (globalThis as unknown as { document?: { createElement(tag: "audio"): { canPlayType(type: string): string } } }).document;
  const probe = doc === undefined ? null : doc.createElement("audio");
  return {
    createContext: () => {
      const Ctor = (globalThis as unknown as { AudioContext?: new () => AudioContextLike }).AudioContext;
      return Ctor === undefined ? null : new Ctor();
    },
    fetchBytes: async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return res.arrayBuffer();
    },
    canPlay: (type) => probe !== null && probe.canPlayType(type) !== "",
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms) as unknown as number,
    clearTimeout: (id) => globalThis.clearTimeout(id),
  };
}
