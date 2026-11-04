/**
 * Structured diagnostics with stable codes (spec 07 §8, 01 A7).
 */

export type DiagnosticLevel = "error" | "warning";

/** Stable validation codes. Never rename a code; add new ones instead. */
export const ValidationCode = {
  /** Structural problem that makes the package impossible to index (fatal in every mode). */
  Schema: "E-SCHEMA",
  Ref: "E-REF",
  DuplicateId: "E-DUP-ID",
  NodeType: "E-NODE-TYPE",
  Entry: "E-ENTRY",
  ReturnNext: "E-RETURN-NEXT",
  ChoiceSet: "E-CHOICE-SET",
  CtxWrite: "E-CTX-WRITE",
  VarName: "E-VAR-NAME",
  PortalArrival: "E-PORTAL-ARRIVAL",
  Polygon: "E-POLY",
  Facing: "E-FACING",
  PlayerScene: "E-PLAYER-SCENE",
  SceneSize: "E-SCENE-SIZE",
  Viewport: "E-VIEWPORT",
  Camera: "E-CAMERA",
  Spot: "E-SPOT",
  Number: "E-NUMBER",
  PortalSelf: "E-PORTAL-SELF",
  PortalDup: "E-PORTAL-DUP",
  SpotUnwalkable: "W-SPOT-UNWALKABLE",
  ChoiceEmpty: "W-CHOICE-EMPTY",
  ZoneOverlap: "W-ZONE-OVERLAP",
  I18nEmpty: "W-I18N-EMPTY",
  Unreachable: "W-UNREACHABLE",
  VarReadonly: "W-VAR-READONLY",
  // Phase 4 (media):
  /** Invalid animation program or instruction. */
  Anim: "E-ANIM",
  /** layerPop without a matching layer. */
  AnimLayer: "E-ANIM-LAYER",
  /** Frame or layer outside the referenced atlas. */
  AnimFrame: "E-ANIM-FRAME",
  AnimLayerOpen: "W-ANIM-LAYER-OPEN",
  AnimUnreachable: "W-ANIM-UNREACHABLE",
  /** A finite program is longer than its PlayAnimation timeout. */
  AnimDuration: "W-ANIM-DURATION",
  Sound: "E-SOUND",
  Cutscene: "E-CUTSCENE",
  /** play_animation / sound_play / sound_stop / cutscene refer to media that is not defined. */
  MediaRef: "W-MEDIA-REF",
  /** Content refers to an asset that is missing from the manifest or has the wrong kind. */
  AssetRef: "E-ASSET-REF",
} as const;

export type ValidationCodeValue = (typeof ValidationCode)[keyof typeof ValidationCode];

export interface Diagnostic {
  readonly code: ValidationCodeValue;
  readonly level: DiagnosticLevel;
  readonly message: string;
  /** Dotted path into the content package, e.g. "graphs[2].nodes[5].next[0]". */
  readonly path: string;
}

export class ContentValidationError extends Error {
  readonly diagnostics: readonly Diagnostic[];

  constructor(diagnostics: readonly Diagnostic[]) {
    const errors = diagnostics.filter((d) => d.level === "error");
    super(
      `Content validation failed with ${errors.length} error(s):\n` +
        errors.map((d) => `  ${d.code} at ${d.path}: ${d.message}`).join("\n"),
    );
    this.name = "ContentValidationError";
    this.diagnostics = diagnostics;
  }
}
