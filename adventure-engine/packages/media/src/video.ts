/**
 * Video cutscene backend (spec 06 F6, phase 4) against a minimal video element
 * interface, so it is testable without a DOM. The browser passes a factory for
 * real HTMLVideoElements.
 *
 * - `ended` → done; `error` or a rejected `play()` → failed.
 * - Listeners are removed when the video ends, fails, is held or cleared.
 * - `hold()` pauses on the last frame; `clear()` also drops the source, asks
 *   the element to release its decoder (`load()` without src) and removes it.
 */

import type { CutsceneBackend, CutsceneShow } from "./cutscene.ts";

export interface VideoLike {
  src: string;
  muted: boolean;
  playsInline: boolean;
  play(): Promise<void>;
  pause(): void;
  load(): void;
  removeAttribute(name: string): void;
  addEventListener(type: "ended" | "error", fn: () => void): void;
  removeEventListener(type: "ended" | "error", fn: () => void): void;
}

export interface VideoHost {
  /** Create an element and show it (above the scene, below the cursor). */
  create(): VideoLike;
  /** Remove the element from the page. */
  remove(video: VideoLike): void;
}

export class VideoCutsceneBackend implements CutsceneBackend {
  private readonly host: VideoHost;
  private readonly url: string | null;
  private video: VideoLike | null = null;
  private off: (() => void) | null = null;

  /** `url` is the chosen format (null: none playable). */
  constructor(host: VideoHost, url: string | null) {
    this.host = host;
    this.url = url;
  }

  start(_show: CutsceneShow, cb: { ended(): void; failed(message: string): void }): void {
    if (this.url === null) {
      void Promise.resolve().then(() => cb.failed("no playable video format"));
      return;
    }
    const v = this.host.create();
    this.video = v;
    v.playsInline = true;
    let settled = false;
    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      this.unlisten();
      fn();
    };
    const onEnded = (): void => finish(() => cb.ended());
    const onError = (): void => finish(() => cb.failed("the video could not be played"));
    v.addEventListener("ended", onEnded);
    v.addEventListener("error", onError);
    this.off = () => {
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("error", onError);
    };
    v.src = this.url;
    v.play().catch((err: unknown) => finish(() => cb.failed(err instanceof Error ? err.message : String(err))));
  }

  private unlisten(): void {
    this.off?.();
    this.off = null;
  }

  hold(): void {
    this.unlisten();
    this.video?.pause();
  }

  clear(): void {
    this.unlisten();
    const v = this.video;
    this.video = null;
    if (v === null) return;
    v.pause();
    v.removeAttribute("src");
    v.load();
    this.host.remove(v);
  }

  get element(): VideoLike | null {
    return this.video;
  }
}
