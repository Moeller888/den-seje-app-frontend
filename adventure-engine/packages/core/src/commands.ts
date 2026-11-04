import type { ContainerRef } from "@adventure-engine/content";

/**
 * Command protocol between core and presentation (spec 06 F1).
 * Core sends commands; presentation answers with `done`, `choice` or `failed`.
 */

interface CommandBase {
  readonly cmdId: string;
  /** "engine" for commands not issued by a graph run. */
  readonly runId: string;
  readonly nodeId: string | null;
}

export interface ChoiceOption {
  readonly id: string;
  readonly speaker: string;
  readonly textKey: string;
}

export type Command =
  | (CommandBase & { readonly type: "Say"; readonly speaker: string; readonly textKey: string })
  | (CommandBase & { readonly type: "Choose"; readonly options: readonly ChoiceOption[] })
  | (CommandBase & { readonly type: "DialogEnd" })
  | (CommandBase & {
      readonly type: "PlayAnimation";
      readonly entity: string;
      readonly animation: string;
      readonly loop: boolean;
      /** The animation's `maxDuration`; replaces the default timeout (phase 4). */
      readonly timeoutMs?: number;
    })
  | (CommandBase & { readonly type: "PlaySound"; readonly entity: string; readonly sound: string; readonly times: number | "loop"; readonly volume: number })
  | (CommandBase & { readonly type: "StopSound"; readonly entity: string; readonly sound: string })
  | (CommandBase & { readonly type: "PlayCutscene"; readonly cutscene: string; readonly language: string; readonly hold: boolean })
  | (CommandBase & { readonly type: "ClearCutscene" })
  | (CommandBase & { readonly type: "SceneFade"; readonly direction: "in" | "out"; readonly ms: number })
  | (CommandBase & {
      readonly type: "React";
      readonly actor: string;
      readonly kind: "cannot";
      /** Optional line from `ui.cannotTextKeys` (spec 04 D3), chosen with the seeded rng. */
      readonly textKey?: string;
    })
  | (CommandBase & { readonly type: "ShowCredits" })
  | (CommandBase & { readonly type: "WalkTo"; readonly actor: string; readonly scene: string | null; readonly spot: string })
  | (CommandBase & { readonly type: "StopWalk"; readonly actor: string })
  | (CommandBase & { readonly type: "PrepareVariant"; readonly entity: string; readonly variant: string })
  | (CommandBase & { readonly type: "MoveObject"; readonly object: string; readonly to: ContainerRef })
  | (CommandBase & { readonly type: "MoveActor"; readonly actor: string; readonly scene: string })
  | (CommandBase & { readonly type: "PortalTransition"; readonly actor: string; readonly portal: string | null; readonly toScene: string });

export type CommandType = Command["type"];

export type CommandReply =
  | { readonly kind: "done" }
  | { readonly kind: "choice"; readonly optionId: string }
  | { readonly kind: "failed"; readonly reason?: string };

/** How the presentation layer intends to complete a command that core waits for. */
export type Disposition =
  /** Presentation will call `Engine.reply()` later. */
  | { readonly kind: "await" }
  /** Core completes the command itself after the given simulated duration (headless/test use). */
  | { readonly kind: "auto"; readonly afterMs: number };

export interface PresentationAdapter {
  onCommand(command: Command): Disposition;
  /*
   * Optional notifications (phase 4). They are called synchronously from inside
   * core; an adapter must not call back into the engine from them.
   */
  /** Core finished an awaited command itself (timeout) or dropped it (cancelled run): stop it, never reply. */
  onCommandAbandoned?(command: Command, reason: "timeout" | "cancelled"): void;
  /** A run was cancelled: stop media it still owns (e.g. looping sounds it started). */
  onRunCancelled?(runId: string): void;
  /** The player leaves `sceneId` (after scene.exit and the fade-out, before the move). */
  onSceneExit?(sceneId: string): void;
  /** New game or back to title: stop all presentation state. */
  onReset?(): void;
}

/** Commands answered only by the player; never auto-completed (spec: Say/Choose). */
export const PLAYER_COMMANDS: ReadonlySet<CommandType> = new Set(["Say", "Choose"]);

/** Fire-and-forget commands: core does not wait for them. */
export const FIRE_AND_FORGET: ReadonlySet<CommandType> = new Set(["React", "StopSound", "StopWalk", "ClearCutscene"]);

/** Timeouts for awaited non-player commands (spec 06 F1). On expiry: warning + auto-done. */
export const COMMAND_TIMEOUT_MS: Readonly<Partial<Record<CommandType, number>>> = {
  DialogEnd: 5000,
  PlayAnimation: 30000,
  PlaySound: 120000,
  PlayCutscene: 600000,
  SceneFade: 5000,
  ShowCredits: 600000,
  WalkTo: 120000,
  PrepareVariant: 30000,
  MoveObject: 5000,
  MoveActor: 5000,
  PortalTransition: 30000,
};
