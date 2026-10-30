/**
 * Content format types (spec 07-indholdsformat.md).
 *
 * The format is the engine's own. All examples and tests use synthetic data.
 */

export type Value = boolean | number | string;

export type Facing =
  | "right"
  | "down_right"
  | "down"
  | "down_left"
  | "left"
  | "up_left"
  | "up"
  | "up_right";

export const FACINGS: readonly Facing[] = [
  "right",
  "down_right",
  "down",
  "down_left",
  "left",
  "up_left",
  "up",
  "up_right",
];

/** Reference to an entry node: "<graphId>#<entryName>". */
export type EntryRef = string;

export type { Vec2 as Point, Poly as Polygon } from "@adventure-engine/geometry";
import type { Poly as Polygon } from "@adventure-engine/geometry";

// ---------------------------------------------------------------------------
// Expressions (spec 02 B5)
// ---------------------------------------------------------------------------

export type Expr =
  | { readonly const: Value }
  | { readonly var: string }
  | { readonly eq: readonly [Expr, Expr] }
  | { readonly neq: readonly [Expr, Expr] }
  | { readonly and: readonly Expr[] }
  | { readonly or: readonly Expr[] }
  | { readonly not: Expr }
  | { readonly lt: readonly [Expr, Expr] }
  | { readonly lte: readonly [Expr, Expr] }
  | { readonly gt: readonly [Expr, Expr] }
  | { readonly gte: readonly [Expr, Expr] };

// ---------------------------------------------------------------------------
// Graphs (spec 02 B2/B4)
// ---------------------------------------------------------------------------

export type EdgeDef = string | { readonly to: string; readonly order?: number };

export type ContainerRef =
  | { readonly kind: "scene"; readonly id: string }
  | { readonly kind: "actor"; readonly id: string }
  | { readonly kind: "none" };

export type UseKind = "object" | "actor" | "inventory";

interface NodeBase {
  readonly id: string;
  readonly next?: readonly EdgeDef[];
}

export interface EntryNode extends NodeBase { readonly type: "entry"; readonly name: string; readonly modal?: boolean }
export interface GuardNode extends NodeBase { readonly type: "guard"; readonly expr: Expr }
export interface ReturnNode extends NodeBase { readonly type: "return"; readonly value: boolean }
export interface RandomNode extends NodeBase { readonly type: "random" }
export interface DelayNode extends NodeBase {
  readonly type: "delay";
  readonly minMs: number;
  readonly maxMs: number;
  readonly mode: "block" | "background";
}
export interface JoinNode extends NodeBase { readonly type: "join" }
export interface DetachNode extends NodeBase { readonly type: "detach" }
export interface SetNode extends NodeBase { readonly type: "set"; readonly var: string; readonly value: Value }
export interface MoveObjectNode extends NodeBase {
  readonly type: "move_object";
  readonly object: string;
  readonly to: ContainerRef;
  readonly from?: ContainerRef;
  readonly spot?: string;
}
export interface MoveActorNode extends NodeBase {
  readonly type: "move_actor";
  readonly actor: string;
  readonly scene: string;
  readonly spot?: string;
}
export interface SetVariantNode extends NodeBase { readonly type: "set_variant"; readonly entity: string; readonly variant: string }
export interface RenameNode extends NodeBase { readonly type: "rename"; readonly object: string; readonly nameKey: string }
export interface PortalLockNode extends NodeBase { readonly type: "portal_lock"; readonly portal: string; readonly locked: boolean }
export interface PlayerSetNode extends NodeBase { readonly type: "player_set"; readonly actor: string }
export interface InteractNode extends NodeBase { readonly type: "interact"; readonly object: string }
export interface WalkToNode extends NodeBase {
  readonly type: "walk_to";
  readonly actor: string;
  readonly spot: string;
  readonly scene?: string;
}
export interface TalkNode extends NodeBase { readonly type: "talk"; readonly actor: string; readonly target: string }
export interface UseItemNode extends NodeBase {
  readonly type: "use_item";
  readonly item: string;
  readonly target: string;
  readonly kind: UseKind;
}
export interface PortalUseNode extends NodeBase {
  readonly type: "portal_use";
  readonly portal?: string;
  readonly toScene?: string;
  readonly actor?: string;
}
export interface StopWalkNode extends NodeBase { readonly type: "stop_walk"; readonly actor: string }
export interface SayNode extends NodeBase { readonly type: "say"; readonly speaker: string; readonly textKey: string }
export interface ChoiceNode extends NodeBase { readonly type: "choice" }
export interface EndDialogNode extends NodeBase { readonly type: "end_dialog" }
export interface DialogPushNode extends NodeBase { readonly type: "dialog_push"; readonly actor: string; readonly entryName: string }
export interface DialogPopNode extends NodeBase { readonly type: "dialog_pop"; readonly actor: string }
export interface PlayAnimationNode extends NodeBase { readonly type: "play_animation"; readonly entity: string; readonly animation: string }
export interface SoundPlayNode extends NodeBase {
  readonly type: "sound_play";
  readonly entity: string;
  readonly sound: string;
  readonly times?: number | "loop";
  readonly volume?: number;
}
export interface SoundStopNode extends NodeBase { readonly type: "sound_stop"; readonly entity: string; readonly sound: string }
export interface CutsceneNode extends NodeBase { readonly type: "cutscene"; readonly name: string; readonly hold?: boolean }
/** Remove a held cutscene (phase 4 extension of spec 06 F6). */
export interface CutsceneClearNode extends NodeBase { readonly type: "cutscene_clear" }
export interface InputLockNode extends NodeBase { readonly type: "input_lock" }
export interface InputUnlockNode extends NodeBase { readonly type: "input_unlock" }
export interface QuitNode extends NodeBase { readonly type: "quit" }

export type NodeDef =
  | EntryNode
  | GuardNode
  | ReturnNode
  | RandomNode
  | DelayNode
  | JoinNode
  | DetachNode
  | SetNode
  | MoveObjectNode
  | MoveActorNode
  | SetVariantNode
  | RenameNode
  | PortalLockNode
  | PlayerSetNode
  | InteractNode
  | WalkToNode
  | TalkNode
  | UseItemNode
  | PortalUseNode
  | StopWalkNode
  | SayNode
  | ChoiceNode
  | EndDialogNode
  | DialogPushNode
  | DialogPopNode
  | PlayAnimationNode
  | SoundPlayNode
  | SoundStopNode
  | CutsceneNode
  | CutsceneClearNode
  | InputLockNode
  | InputUnlockNode
  | QuitNode;

export type NodeType = NodeDef["type"];

export interface GraphDef {
  readonly id: string;
  readonly kind: "logic" | "dialog";
  readonly owner?: string;
  readonly actors?: readonly string[];
  readonly nodes: readonly NodeDef[];
}

// ---------------------------------------------------------------------------
// World content
// ---------------------------------------------------------------------------

export interface SpotDef {
  readonly x: number;
  readonly y: number;
  readonly facing?: string;
  readonly height?: number;
  readonly scale?: boolean;
}

export interface ObjectZoneDef {
  readonly entity: string;
  readonly variant?: string;
  readonly nameKey?: string;
  readonly priority?: number;
  readonly polygon: Polygon;
}

export interface ActorZoneDef {
  readonly actor: string;
  readonly variant?: string;
  readonly talkSpot?: string;
  readonly priority?: number;
  readonly polygon: Polygon;
}

export interface TriggerZoneDef {
  readonly id: string;
  readonly entry: EntryRef | null;
  readonly polygon: Polygon;
}

/** Perspective camera of a scene (spec 03 C2.1, 07 §3). Projection plane = scene size. */
export interface CameraDef {
  readonly focal: number;
  /** Camera height above the floor in world units. */
  readonly height: number;
  /** Tilt in degrees. */
  readonly tilt: number;
  /** Horizon reference as a fraction of the scene height. */
  readonly horizon: number;
  /** Walking speed in floor units per second. */
  readonly speed: number;
  /** Extra factor for perspective heights. Default 1. */
  readonly scale?: number;
}

export interface SceneDef {
  readonly id: string;
  readonly nameKey?: string;
  readonly size?: { readonly width: number; readonly height: number };
  readonly entry: EntryRef | null;
  readonly variants?: readonly string[];
  readonly spots?: Readonly<Record<string, SpotDef>>;
  readonly defaultSpot?: string;
  readonly walkable?: readonly Polygon[];
  readonly blockers?: readonly Polygon[];
  readonly objectZones?: readonly ObjectZoneDef[];
  readonly actorZones?: readonly ActorZoneDef[];
  readonly triggerZones?: readonly TriggerZoneDef[];
  readonly speechRegions?: Readonly<Record<string, unknown>>;
  readonly portraitRegions?: Readonly<Record<string, unknown>>;
  /** Local sound name → sound id (spec 06 F4). */
  readonly sounds?: Readonly<Record<string, string>>;
  /** Local cutscene name → cutscene (spec 06 F6). */
  readonly cutscenes?: Readonly<Record<string, CutsceneDef>>;
  readonly camera?: CameraDef;
  /** Walking speed in scene pixels per second when the scene has no camera. Default 200. */
  readonly walkSpeed?: number;
  readonly layers?: readonly LayerDef[];
}

export interface LayerDef {
  readonly id: string;
  readonly depth: number;
  readonly assets?: Readonly<Record<string, string>>;
}

export interface VariantDef {
  readonly sprite?: string;
  readonly portrait?: string;
  /** Animation name (e.g. "walk.left", "wave") → animation id (spec 06 F3). */
  readonly animations?: Readonly<Record<string, string>>;
}

// ---------------------------------------------------------------------------
// Media (spec 06 F3, F4, F6; phase 4)
// ---------------------------------------------------------------------------

/** One animation instruction (spec 06 F3). Frame numbers index the atlas. */
export type AnimInstr =
  | { readonly op: "frame"; readonly n: number }
  | { readonly op: "play"; readonly from: number; readonly to: number }
  | { readonly op: "loopRange"; readonly from: number; readonly to: number }
  | { readonly op: "wait"; readonly frames: number }
  | { readonly op: "fps"; readonly n: number }
  | { readonly op: "layer"; readonly name: string }
  | { readonly op: "layerPop" }
  | { readonly op: "signal"; readonly entity: string; readonly name: string };

export interface AnimationDef {
  readonly id: string;
  /** Asset id of an atlas in the manifest. */
  readonly atlas: string;
  readonly instructions: readonly AnimInstr[];
  /** Repeat the whole program forever. `loopRange` as last instruction also makes it infinite. */
  readonly loop?: boolean;
  /** Timeout for PlayAnimation in ms (default: the 30 s command timeout). */
  readonly maxDuration?: number;
  /** Frames per second until the first `fps` instruction (default 12). */
  readonly defaultFps?: number;
}

export type SoundChannel = "music" | "ambient" | "sfx" | "voice";

export interface SoundDef {
  readonly id: string;
  /** Asset id of an audio asset in the manifest. */
  readonly asset: string;
  readonly channel: SoundChannel;
  /** Asset volume in [0, 1] (default 1). */
  readonly volume?: number;
  /** Duration of one playback in ms; used by headless playback (and as a fallback when the browser cannot tell). */
  readonly durationMs?: number;
  /** Keep a looping sound when its scene is left (spec 06 F4). */
  readonly persistAcrossScenes?: boolean;
  /** Loop points in ms for looping playback. */
  readonly loopStartMs?: number;
  readonly loopEndMs?: number;
}

/** One picture of a timeline cutscene. */
export interface TimelineFrameDef {
  readonly atMs: number;
  /** Image asset id. */
  readonly asset?: string;
  /** Caption text key. */
  readonly textKey?: string;
}

export interface CutsceneVariantDef {
  /** Video asset id (WebM/MP4 formats in the manifest). */
  readonly video?: string;
  /** A timeline instead of a video. */
  readonly timeline?: readonly TimelineFrameDef[];
  /** Duration in ms (required for timelines; used headless for videos). */
  readonly durationMs?: number;
}

export interface CutsceneDef {
  /** Language → variant; "default" is the language-neutral fallback (spec 06 F6). */
  readonly variants: Readonly<Record<string, CutsceneVariantDef>>;
  readonly skippable?: boolean;
  /** Skip input is ignored before this time (default 1000 ms). */
  readonly skipAfterMs?: number;
  /** Default for the node's `hold`. */
  readonly hold?: boolean;
}

export interface ActorDef {
  readonly id: string;
  readonly nameKey?: string;
  readonly scene: string | null;
  readonly spot?: string;
  readonly entry: EntryRef | null;
  readonly dialog?: EntryRef;
  readonly variants: Readonly<Record<string, VariantDef>>;
  readonly referenceHeight?: number;
  readonly grounded?: boolean;
  readonly triggersZones?: boolean;
  readonly sounds?: Readonly<Record<string, string>>;
  /** Headless hit box in scene pixels, anchored at the feet (centered horizontally). Default 40 × 100. */
  readonly hitBox?: { readonly width: number; readonly height: number };
}

export interface ObjectDef {
  readonly id: string;
  readonly nameKey?: string;
  readonly container: ContainerRef;
  readonly spot?: string;
  readonly entry: EntryRef | null;
  readonly icon?: string;
  readonly variants: Readonly<Record<string, VariantDef>>;
  readonly sounds?: Readonly<Record<string, string>>;
}

export interface PortalDef {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly index?: number;
  readonly nameKey?: string;
  readonly lockedKey?: string;
  readonly locked?: boolean;
  readonly exitSpot?: string;
  readonly entrySpot?: string;
  readonly arrivalSpot?: string | null;
  readonly entry: EntryRef | null;
  readonly polygon?: Polygon;
}

/** UI configuration (spec 07 §7). Defaults are applied by the consumer. */
export interface UiConfig {
  /** Visible inventory slots (default 5). */
  readonly inventorySlots?: number;
  /** Height of the inventory panel in logical pixels (default 96). */
  readonly inventoryHeight?: number;
  /** "cannot" after a use.* run that changed nothing (default true, spec 04 D5). */
  readonly reactWhenNothingHappens?: boolean;
  readonly playerLinesAsMenu?: boolean;
  /** Optional lines for the "cannot" reaction, picked with the seeded rng. */
  readonly cannotTextKeys?: readonly string[];
  /** Scene fade duration in ms (default 500). */
  readonly fadeMs?: number;
  /** Click feedback duration in ms (default 200). */
  readonly clickFeedbackMs?: number;
}

export interface GameDef {
  readonly id: string;
  readonly version: string;
  readonly formatVersion: number;
  readonly languages: readonly string[];
  readonly defaultLanguage: string;
  readonly fallbackLanguage?: string;
  readonly player?: { readonly actor: string };
  readonly entry?: EntryRef | null;
  readonly globals?: Readonly<Record<string, Value>>;
  readonly ui?: UiConfig;
  /** Logical viewport (spec 06 F2.2, decision B-18). Default 1280 × 720. */
  readonly viewport?: { readonly width: number; readonly height: number };
}

/** A complete (bundled) content package. */
export interface ContentPackage {
  readonly game: GameDef;
  readonly scenes?: readonly SceneDef[];
  readonly actors?: readonly ActorDef[];
  readonly objects?: readonly ObjectDef[];
  readonly portals?: readonly PortalDef[];
  readonly graphs?: readonly GraphDef[];
  readonly i18n?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** Phase 4 media definitions. */
  readonly animations?: readonly AnimationDef[];
  readonly sounds?: readonly SoundDef[];
  /** Phase 5: how saves of older content versions are migrated (spec 05 E6.2). */
  readonly saveMigrations?: readonly SaveMigrationDef[];
}

/**
 * One content migration step for saves (spec 05 E6.2): it applies to saves whose
 * content version is `fromVersion` or older, in list order.
 */
export interface SaveMigrationDef {
  readonly fromVersion: string;
  /** Old id → new id for actors, objects, scenes, portals and globals. */
  readonly rename?: Readonly<Record<string, string>>;
  /** Ids (and global names) that no longer exist. */
  readonly remove?: readonly string[];
  readonly setGlobals?: Readonly<Record<string, Value>>;
}
