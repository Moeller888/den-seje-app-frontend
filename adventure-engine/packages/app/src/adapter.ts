/**
 * Browser presentation adapter (spec 06 F1). Commands that need the player
 * (Say, Choose) or real time (SceneFade, preloading) are awaited and answered
 * later through `Engine.reply`; everything else completes at once. The adapter
 * never answers synchronously inside `onCommand`.
 */

import type { Command, Disposition, PresentationAdapter } from "@adventure-engine/core";
import type { MediaPresenter } from "@adventure-engine/media";

export interface AdapterHandlers {
  say(cmd: Extract<Command, { type: "Say" }>): void;
  choose(cmd: Extract<Command, { type: "Choose" }>): void;
  dialogEnd(): void;
  fade(direction: "in" | "out", ms: number): Promise<void>;
  /** Preload the target scene of a portal transition. */
  preloadScene(sceneId: string): Promise<void>;
  preloadVariant(entity: string, variant: string): Promise<void>;
  react(cmd: Extract<Command, { type: "React" }>): void;
  /** Answer an awaited command (ignored by core when its run was cancelled). */
  done(cmdId: string): void;
}

export class BrowserAdapter implements PresentationAdapter {
  private handlers: AdapterHandlers | null = null;
  private media: MediaPresenter | null = null;

  attach(handlers: AdapterHandlers, media: MediaPresenter): void {
    this.handlers = handlers;
    this.media = media;
  }

  // Phase-4 notifications go to the media presenter (animations, sounds, cutscenes).
  onCommandAbandoned(cmd: Command, reason: "timeout" | "cancelled"): void {
    this.media?.onCommandAbandoned(cmd, reason);
  }

  onRunCancelled(runId: string): void {
    this.media?.onRunCancelled(runId);
  }

  onSceneExit(sceneId: string): void {
    this.media?.onSceneExit(sceneId);
  }

  onReset(): void {
    this.media?.onReset();
  }

  onCommand(cmd: Command): Disposition {
    const h = this.handlers;
    if (h === null) throw new Error("BrowserAdapter used before attach()");
    // Media commands (animation, sound, cutscene) first; React continues below for the UI part.
    const media = this.media?.handle(cmd) ?? null;
    if (media !== null) return media;
    const later = (p: Promise<void>): Disposition => {
      p.then(
        () => h.done(cmd.cmdId),
        (err: unknown) => {
          console.error(`[adapter] ${cmd.type} ${cmd.cmdId} failed`, err);
          h.done(cmd.cmdId);
        },
      );
      return { kind: "await" };
    };
    switch (cmd.type) {
      case "Say":
        h.say(cmd);
        return { kind: "await" };
      case "Choose":
        h.choose(cmd);
        return { kind: "await" };
      case "DialogEnd":
        h.dialogEnd();
        return { kind: "auto", afterMs: 0 };
      case "SceneFade":
        return later(h.fade(cmd.direction, cmd.ms));
      case "PortalTransition":
        return later(h.preloadScene(cmd.toScene));
      case "PrepareVariant":
        return later(h.preloadVariant(cmd.entity, cmd.variant));
      case "React":
        h.react(cmd);
        return { kind: "auto", afterMs: 0 };
      default:
        // Remaining commands (MoveObject, MoveActor, WalkTo without navigation, …) complete at once.
        return { kind: "auto", afterMs: 0 };
    }
  }
}
