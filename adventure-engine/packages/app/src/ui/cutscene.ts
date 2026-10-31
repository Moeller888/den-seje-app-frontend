/**
 * Cutscene layer (phase 4, spec 06 F6): shows the current timeline picture and
 * caption, or hosts the video element. It only displays what the media
 * presenter's cutscene player and backends say; input (skip) is handled by the
 * game. The layer never takes pointer events itself.
 */

import type { CutscenePlayer, TimelineBackend, VariantChoice, VideoHost, VideoLike } from "@adventure-engine/media";
import { el } from "./dom.ts";

export class CutsceneView implements VideoHost {
  private readonly host: HTMLElement;
  private readonly img: HTMLImageElement;
  private readonly caption: HTMLElement;
  private readonly hint: HTMLElement;
  private timeline: { backend: TimelineBackend; choice: VariantChoice } | null = null;
  private shown = "";

  constructor(host: HTMLElement) {
    this.host = host;
    this.img = el("img", { class: "cutscene-picture", alt: "" });
    this.caption = el("p", { class: "cutscene-caption" });
    this.hint = el("p", { class: "cutscene-hint" });
    host.append(this.img, this.caption, this.hint);
  }

  /** Remember the timeline backend whose frames are shown. */
  track(backend: TimelineBackend, choice: VariantChoice): void {
    this.timeline = { backend, choice };
  }

  create(): VideoLike {
    const v = el("video", { class: "cutscene-video" });
    this.host.append(v);
    return v as unknown as VideoLike;
  }

  remove(video: VideoLike): void {
    (video as unknown as HTMLVideoElement).remove();
  }

  /** Per frame. `url(asset)` resolves image assets; `text(key)` captions; `skippable` shows the hint while playing. */
  update(player: CutscenePlayer, url: (asset: string) => string | null, text: (key: string) => string, skippable: boolean, force: boolean): void {
    const state = player.state;
    this.host.hidden = state === "idle";
    this.host.dataset["state"] = state;
    const tl = this.timeline;
    const visible = state !== "idle" && tl !== null && tl.backend.visible;
    const frame = visible ? tl.choice.variant.timeline?.[tl.backend.frameIndex] : undefined;
    const key = `${state}|${frame?.asset ?? ""}|${frame?.textKey ?? ""}|${skippable}`;
    if (key === this.shown && !force) return;
    this.shown = key;
    const src = frame?.asset === undefined ? null : url(frame.asset);
    this.img.hidden = src === null;
    if (src !== null && this.img.getAttribute("src") !== src) this.img.src = src;
    this.img.dataset["asset"] = frame?.asset ?? "";
    this.caption.textContent = frame?.textKey === undefined ? "" : text(frame.textKey);
    this.caption.hidden = frame?.textKey === undefined;
    this.hint.hidden = !(state === "playing" && skippable);
    this.hint.textContent = text("ui.skip");
  }
}
