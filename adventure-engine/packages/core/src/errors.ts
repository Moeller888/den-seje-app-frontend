/** Stable runtime warning codes (spec 01 A7). Never rename a code; add new ones. */
export const RuntimeCode = {
  /** A runtime reference (entity, node, entry) could not be resolved. */
  Ref: "W-RUNTIME-REF",
  UnknownNode: "W-UNKNOWN-NODE",
  ExprNonNumeric: "W-EXPR-NONNUMERIC",
  ExprInvalid: "W-EXPR-INVALID",
  ChoiceEmpty: "W-CHOICE-EMPTY-RUNTIME",
  DialogNoOwner: "W-DIALOG-NO-OWNER",
  DialogPopLast: "W-DIALOG-POP-LAST",
  UnlockWithoutLock: "W-UNLOCK-WITHOUT-LOCK",
  LockLeak: "W-LOCK-LEAK",
  Watchdog: "W-WATCHDOG",
  CommandTimeout: "W-COMMAND-TIMEOUT",
  MoveFailed: "W-MOVE-FAILED",
  /** A text key has no non-empty translation in the language chain (spec 06 F7). */
  I18nEmpty: "W-I18N-EMPTY",
  /** A presentation asset failed to load; a placeholder was used (spec 06 F8). */
  AssetLoad: "W-ASSET-LOAD",
  // Phase 4 (media, reported by the presentation layer):
  /** A sound could not be resolved, loaded or decoded; the command completed anyway. */
  AudioLoad: "W-AUDIO-LOAD",
  /** A finite sound was skipped because audio is locked until the first user gesture. */
  AudioLocked: "W-AUDIO-LOCKED",
  /** The browser has no usable audio (no Web Audio, or it refused to start); sounds are skipped. */
  AudioUnavailable: "W-AUDIO-UNAVAILABLE",
  /** A cutscene had neither the current language nor "default"; the first variant was used (spec 06 F6). */
  CutsceneLang: "W-CUTSCENE-LANG",
  /** A cutscene was missing or failed to play; it completed anyway. */
  CutsceneFailed: "W-CUTSCENE-FAILED",
  /** PlayAnimation for an animation the entity does not have; completed at once. */
  AnimMissing: "W-ANIM-MISSING",
  // Phase 5 (save/load):
  /** A loaded save was repaired (unknown ids removed, variant fallback, inventory, migration, dev checksum). */
  SaveRepaired: "W-SAVE-REPAIRED",
} as const;

export type RuntimeCodeValue = (typeof RuntimeCode)[keyof typeof RuntimeCode];

export interface RuntimeWarning {
  readonly t: number;
  readonly code: RuntimeCodeValue;
  readonly message: string;
  readonly runId: string | null;
  readonly nodeId: string | null;
}

/** Programming/contract errors raised to the caller (never swallowed). */
export const EngineErrorCode = {
  CtxWrite: "E-CTX-WRITE",
  BadReply: "E-BAD-REPLY",
  UnknownEntry: "E-UNKNOWN-ENTRY",
  NoPlayer: "E-NO-PLAYER",
  BadArgument: "E-BAD-ARGUMENT",
} as const;

export type EngineErrorCodeValue = (typeof EngineErrorCode)[keyof typeof EngineErrorCode];

export class EngineError extends Error {
  readonly code: EngineErrorCodeValue;
  constructor(code: EngineErrorCodeValue, message: string) {
    super(`${code}: ${message}`);
    this.name = "EngineError";
    this.code = code;
  }
}
