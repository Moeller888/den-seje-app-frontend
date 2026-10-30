import type { Command, Disposition, Engine, PresentationAdapter } from "@adventure-engine/core";
import { HeadlessAudioBackend, MEDIA_WARNING_CODES, MediaPresenter, TimelineBackend, ownerScene, schedulerClock } from "@adventure-engine/media";

/**
 * Headless adapter with real media semantics (phase 4, harness "media-headless").
 *
 * Media commands go through the same `MediaPresenter` the browser uses, on the
 * engine's simulated clock: animations advance with simulated time, sounds end
 * after their `durationMs`, cutscenes after theirs. All other commands behave as
 * in `HeadlessAdapter` (auto-completed at once; Say/Choose wait for the scenario).
 */
export class MediaHeadlessAdapter implements PresentationAdapter {
  readonly log: Command[] = [];
  private presenter_: MediaPresenter | null = null;
  private audio_: HeadlessAudioBackend | null = null;
  readonly cutsceneBackends: TimelineBackend[] = [];

  /** Bind to the engine (after `new Engine(…, { adapter })`, before the first command). */
  attach(engine: Engine): void {
    const clock = schedulerClock(engine.sched);
    const world = () => engine.world;
    this.audio_ = new HeadlessAudioBackend(clock);
    this.presenter_ = new MediaPresenter(
      {
        content: engine.content,
        clock,
        reply: (cmdId) => {
          engine.reply(cmdId, { kind: "done" });
        },
        signal: (entity, name) => {
          engine.signal(entity, name);
        },
        warn: (code, message) => engine.reportWarning(MEDIA_WARNING_CODES[code], message),
        trace: (event, data) => engine.tracer.emit(`media.${event}`, data),
        variantOf: (e) => world().actors.get(e)?.variant ?? world().objects.get(e)?.variant ?? null,
        ownerScene: (e) => ownerScene(engine.world, e),
        playerScene: () => {
          const p = world().playerId;
          return p === null ? null : (world().actors.get(p)?.scene ?? null);
        },
      },
      {
        audio: this.audio_,
        cutscene: () => {
          const b = new TimelineBackend(clock);
          this.cutsceneBackends.push(b);
          return b;
        },
      },
    );
  }

  get presenter(): MediaPresenter {
    if (this.presenter_ === null) throw new Error("MediaHeadlessAdapter used before attach()");
    return this.presenter_;
  }

  get audio(): HeadlessAudioBackend {
    if (this.audio_ === null) throw new Error("MediaHeadlessAdapter used before attach()");
    return this.audio_;
  }

  onCommand(command: Command): Disposition {
    this.log.push(command);
    return this.presenter.handle(command) ?? { kind: "auto", afterMs: 0 };
  }

  onCommandAbandoned(command: Command, reason: "timeout" | "cancelled"): void {
    this.presenter.onCommandAbandoned(command, reason);
  }

  onRunCancelled(runId: string): void {
    this.presenter.onRunCancelled(runId);
  }

  onSceneExit(sceneId: string): void {
    this.presenter.onSceneExit(sceneId);
  }

  onReset(): void {
    this.presenter_?.onReset();
  }
}
