/**
 * Media content (phase 4): program analysis and validation of animations,
 * sounds and cutscenes (spec 06 F3/F4/F6, 07), plus the asset manifest format
 * and its cross-check against content (spec 06 F8.1).
 *
 * Timing model of an animation program (also used by the player):
 * - `frame(n)`, `fps`, `layer`, `layerPop`, `signal` take no time.
 * - `play(a, b)` shows a … b (either direction), each frame for 1/fps s.
 * - `wait(k)` keeps the current frame for k/fps s.
 * - `loopRange(a, b)` plays a … b forever; it must be the last instruction.
 * - `loop: true` repeats the whole program forever.
 */

import { ValidationCode as C, type Diagnostic, type ValidationCodeValue } from "./diagnostics.ts";
import type { AnimInstr, AnimationDef, ContentPackage, CutsceneDef, NodeDef, SoundDef } from "./types.ts";

export const DEFAULT_ANIMATION_FPS = 12;
export const DEFAULT_SKIP_AFTER_MS = 1000;
/** The PlayAnimation command timeout without `maxDuration` (spec 06 F1). */
export const DEFAULT_ANIMATION_TIMEOUT_MS = 30000;
export const SOUND_CHANNELS = ["music", "ambient", "sfx", "voice"] as const;

export interface ProgramInfo {
  /** Never finishes (loopRange or loop: true). */
  readonly infinite: boolean;
  /** Duration of one pass in ms (for loopRange: time until the loop starts). */
  readonly durationMs: number;
  /** Highest frame index used, or -1. */
  readonly maxFrame: number;
}

const finitePos = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
const index = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

/** Static analysis of a (valid) program. */
export function programInfo(def: Pick<AnimationDef, "instructions" | "loop" | "defaultFps">): ProgramInfo {
  let fps = def.defaultFps ?? DEFAULT_ANIMATION_FPS;
  let ms = 0;
  let maxFrame = -1;
  let infinite = def.loop === true;
  for (const ins of def.instructions) {
    switch (ins.op) {
      case "frame":
        maxFrame = Math.max(maxFrame, ins.n);
        break;
      case "play":
        maxFrame = Math.max(maxFrame, ins.from, ins.to);
        ms += ((Math.abs(ins.to - ins.from) + 1) * 1000) / fps;
        break;
      case "wait":
        ms += (ins.frames * 1000) / fps;
        break;
      case "fps":
        fps = ins.n;
        break;
      case "loopRange":
        maxFrame = Math.max(maxFrame, ins.from, ins.to);
        infinite = true;
        break;
      default:
        break;
    }
  }
  return { infinite, durationMs: ms, maxFrame };
}

interface Out {
  error(code: ValidationCodeValue, path: string, message: string): void;
  warn(code: ValidationCodeValue, path: string, message: string): void;
}

function instruction(ins: unknown, path: string, entities: ReadonlySet<string>, d: Out): ins is AnimInstr {
  if (typeof ins !== "object" || ins === null) {
    d.error(C.Anim, path, "instruction must be an object");
    return false;
  }
  const i = ins as Record<string, unknown>;
  switch (i["op"]) {
    case "frame":
      if (!index(i["n"])) return (d.error(C.Anim, path, "frame(n) needs an integer n ≥ 0"), false);
      return true;
    case "play":
    case "loopRange":
      if (!index(i["from"]) || !index(i["to"])) return (d.error(C.Anim, path, `${String(i["op"])}(from, to) needs integers ≥ 0`), false);
      return true;
    case "wait":
      if (!(typeof i["frames"] === "number" && Number.isInteger(i["frames"]) && i["frames"] > 0)) return (d.error(C.Anim, path, "wait(frames) needs an integer > 0"), false);
      return true;
    case "fps":
      if (!finitePos(i["n"]) || (i["n"] as number) > 240) return (d.error(C.Anim, path, "fps(n) needs a number in (0, 240]"), false);
      return true;
    case "layer":
      if (typeof i["name"] !== "string" || i["name"] === "") return (d.error(C.Anim, path, "layer(name) needs a name"), false);
      return true;
    case "layerPop":
      return true;
    case "signal":
      if (typeof i["entity"] !== "string" || typeof i["name"] !== "string" || i["name"] === "") return (d.error(C.Anim, path, "signal(entity, name) needs two strings"), false);
      if (!entities.has(i["entity"])) d.error(C.Ref, `${path}.entity`, `signal target "${i["entity"]}" is not an entity`);
      return true;
    default:
      d.error(C.Anim, path, `unknown animation instruction "${String(i["op"])}"`);
      return false;
  }
}

function animation(a: AnimationDef, path: string, entities: ReadonlySet<string>, d: Out): void {
  if (a.defaultFps !== undefined && !(finitePos(a.defaultFps) && a.defaultFps <= 240)) d.error(C.Number, `${path}.defaultFps`, "defaultFps must be a number in (0, 240]");
  if (a.maxDuration !== undefined && !finitePos(a.maxDuration)) d.error(C.Number, `${path}.maxDuration`, "maxDuration must be a number > 0");
  if (a.loop !== undefined && typeof a.loop !== "boolean") d.error(C.Schema, `${path}.loop`, "loop must be a boolean");
  if (typeof a.atlas !== "string" || a.atlas === "") d.error(C.Schema, `${path}.atlas`, "atlas must be an asset id");
  if (!Array.isArray(a.instructions) || a.instructions.length === 0) {
    d.error(C.Anim, `${path}.instructions`, "an animation needs at least one instruction");
    return;
  }
  let ok = true;
  let depth = 0;
  let loopAt = -1;
  a.instructions.forEach((ins, k) => {
    const p = `${path}.instructions[${k}]`;
    if (!instruction(ins, p, entities, d)) {
      ok = false;
      return;
    }
    if (loopAt >= 0) return;
    if (ins.op === "layer") depth++;
    if (ins.op === "layerPop") {
      if (depth === 0) d.error(C.AnimLayer, p, "layerPop without a matching layer");
      else depth--;
    }
    if (ins.op === "loopRange") loopAt = k;
  });
  if (!ok) return;
  if (loopAt >= 0 && loopAt < a.instructions.length - 1) d.warn(C.AnimUnreachable, `${path}.instructions[${loopAt + 1}]`, "instructions after loopRange never run");
  if (loopAt >= 0 && a.loop === true) d.warn(C.AnimUnreachable, `${path}.loop`, "loop: true has no effect after loopRange");
  const info = programInfo(a);
  if (!info.infinite && depth > 0) d.warn(C.AnimLayerOpen, `${path}.instructions`, `${depth} layer(s) still open at the end of the program`);
  const timed = a.instructions.some((x) => x.op === "play" || x.op === "wait" || x.op === "loopRange");
  const shows = a.instructions.some((x) => x.op === "frame" || x.op === "play" || x.op === "loopRange");
  if (info.infinite && !timed) d.error(C.Anim, `${path}.instructions`, "an endless program must take time (play, wait or loopRange)");
  else if (!shows) d.error(C.Anim, `${path}.instructions`, "the program shows no frame");
  const limit = a.maxDuration ?? DEFAULT_ANIMATION_TIMEOUT_MS;
  if (!info.infinite && info.durationMs > limit) {
    d.warn(C.AnimDuration, `${path}.maxDuration`, `the program takes ${Math.round(info.durationMs)} ms, longer than its ${limit} ms timeout; set maxDuration`);
  }
}

function sound(s: SoundDef, path: string, d: Out): void {
  if (typeof s.asset !== "string" || s.asset === "") d.error(C.Schema, `${path}.asset`, "asset must be an asset id");
  if (!(SOUND_CHANNELS as readonly string[]).includes(s.channel)) d.error(C.Sound, `${path}.channel`, `channel must be one of ${SOUND_CHANNELS.join(", ")}`);
  if (s.volume !== undefined && !(typeof s.volume === "number" && s.volume >= 0 && s.volume <= 1)) d.error(C.Number, `${path}.volume`, "volume must be a number in [0, 1]");
  if (s.durationMs !== undefined && !finitePos(s.durationMs)) d.error(C.Number, `${path}.durationMs`, "durationMs must be a number > 0");
  if (s.persistAcrossScenes !== undefined && typeof s.persistAcrossScenes !== "boolean") d.error(C.Schema, `${path}.persistAcrossScenes`, "persistAcrossScenes must be a boolean");
  const a = s.loopStartMs;
  const b = s.loopEndMs;
  if (a !== undefined || b !== undefined) {
    const validA = a === undefined || (typeof a === "number" && Number.isFinite(a) && a >= 0);
    const validB = b === undefined || finitePos(b);
    if (!validA || !validB || (a !== undefined && b !== undefined && a >= b) || (s.durationMs !== undefined && b !== undefined && b > s.durationMs)) {
      d.error(C.Sound, `${path}.loopStartMs`, "loop points must satisfy 0 ≤ loopStartMs < loopEndMs ≤ durationMs");
    }
  }
}

function cutscene(c: CutsceneDef, path: string, d: Out): void {
  if (typeof c !== "object" || c === null) return d.error(C.Cutscene, path, "cutscene must be an object");
  if (c.skippable !== undefined && typeof c.skippable !== "boolean") d.error(C.Schema, `${path}.skippable`, "skippable must be a boolean");
  if (c.hold !== undefined && typeof c.hold !== "boolean") d.error(C.Schema, `${path}.hold`, "hold must be a boolean");
  if (c.skipAfterMs !== undefined && !(typeof c.skipAfterMs === "number" && Number.isFinite(c.skipAfterMs) && c.skipAfterMs >= 0)) d.error(C.Number, `${path}.skipAfterMs`, "skipAfterMs must be a number ≥ 0");
  const variants = typeof c.variants === "object" && c.variants !== null ? Object.entries(c.variants) : [];
  if (variants.length === 0) return d.error(C.Cutscene, `${path}.variants`, "a cutscene needs at least one variant");
  for (const [lang, v] of variants) {
    const p = `${path}.variants.${lang}`;
    const hasVideo = typeof v?.video === "string" && v.video !== "";
    const hasTimeline = Array.isArray(v?.timeline);
    if (hasVideo === hasTimeline) {
      d.error(C.Cutscene, p, "a variant needs exactly one of video or timeline");
      continue;
    }
    if (v.durationMs !== undefined && !finitePos(v.durationMs)) d.error(C.Number, `${p}.durationMs`, "durationMs must be a number > 0");
    if (hasTimeline) {
      const frames = v.timeline as readonly unknown[];
      if (frames.length === 0 || !finitePos(v.durationMs)) d.error(C.Cutscene, p, "a timeline needs frames and a durationMs > 0");
      let last = -1;
      frames.forEach((f, k) => {
        const at = (f as { atMs?: unknown } | null)?.atMs;
        if (typeof at !== "number" || !Number.isFinite(at) || at < 0 || at < last || (finitePos(v.durationMs) && at >= v.durationMs)) {
          d.error(C.Cutscene, `${p}.timeline[${k}].atMs`, "frame times must be ascending and inside [0, durationMs)");
        } else last = at;
      });
    }
  }
}

/** Save migrations (spec 05 E6.2): well-formed steps only; ids may refer to content that no longer exists. */
export function validateSaveMigrations(pkg: ContentPackage, d: Out): void {
  const list = pkg.saveMigrations;
  if (list === undefined) return;
  if (!Array.isArray(list)) return d.error(C.Schema, "saveMigrations", "saveMigrations must be an array");
  list.forEach((m, i) => {
    const p = `saveMigrations[${i}]`;
    if (typeof m !== "object" || m === null || typeof m.fromVersion !== "string" || m.fromVersion === "") return d.error(C.Schema, p, "a save migration needs a fromVersion");
    if (m.rename !== undefined && !(typeof m.rename === "object" && m.rename !== null && Object.values(m.rename).every((v) => typeof v === "string"))) d.error(C.Schema, `${p}.rename`, "rename maps ids to ids");
    if (m.remove !== undefined && !(Array.isArray(m.remove) && (m.remove as readonly unknown[]).every((v) => typeof v === "string"))) d.error(C.Schema, `${p}.remove`, "remove is a list of ids");
    if (m.setGlobals !== undefined && !(typeof m.setGlobals === "object" && m.setGlobals !== null && Object.values(m.setGlobals).every((v) => ["boolean", "number", "string"].includes(typeof v)))) {
      d.error(C.Schema, `${p}.setGlobals`, "setGlobals maps names to boolean, number or string");
    }
  });
}

/** Validate media definitions and media references (called by loadContent). */
export function validateMedia(pkg: ContentPackage, nodes: ReadonlyArray<{ node: NodeDef; path: string }>, d: Out): void {
  const entities = new Set<string>([...(pkg.scenes ?? []), ...(pkg.actors ?? []), ...(pkg.objects ?? []), ...(pkg.portals ?? [])].map((e) => e.id));
  entities.add("$game");
  const animIds = new Set<string>();
  (pkg.animations ?? []).forEach((a, i) => {
    const path = `animations[${i}]`;
    if (typeof a !== "object" || a === null || typeof a.id !== "string") return d.error(C.Schema, path, "animation needs a string id");
    if (animIds.has(a.id)) d.error(C.DuplicateId, `${path}.id`, `duplicate animation id "${a.id}"`);
    animIds.add(a.id);
    animation(a, path, entities, d);
  });
  const soundIds = new Set<string>();
  (pkg.sounds ?? []).forEach((s, i) => {
    const path = `sounds[${i}]`;
    if (typeof s !== "object" || s === null || typeof s.id !== "string") return d.error(C.Schema, path, "sound needs a string id");
    if (soundIds.has(s.id)) d.error(C.DuplicateId, `${path}.id`, `duplicate sound id "${s.id}"`);
    soundIds.add(s.id);
    sound(s, path, d);
  });
  const animNames = new Map<string, Set<string>>();
  const soundNames = new Map<string, Set<string>>();
  const holders: Array<[string, readonly { id: string; variants?: Readonly<Record<string, { animations?: Readonly<Record<string, string>> }>>; sounds?: Readonly<Record<string, string>> }[]]> = [
    ["actors", pkg.actors ?? []],
    ["objects", pkg.objects ?? []],
    ["scenes", (pkg.scenes ?? []).map((s) => ({ id: s.id, ...(s.sounds !== undefined ? { sounds: s.sounds } : {}) }))],
  ];
  for (const [key, list] of holders) {
    list.forEach((e, i) => {
      const names = new Set<string>();
      for (const [variant, v] of Object.entries(e.variants ?? {})) {
        for (const [name, id] of Object.entries(v.animations ?? {})) {
          names.add(name);
          // Fail-soft (spec 06 F3: a missing animation falls back): a warning, not an error.
          if (!animIds.has(id)) d.warn(C.MediaRef, `${key}[${i}].variants.${variant}.animations.${name}`, `unknown animation "${id}"`);
        }
      }
      animNames.set(e.id, names);
      const sn = new Set<string>();
      for (const [name, id] of Object.entries(e.sounds ?? {})) {
        sn.add(name);
        if (!soundIds.has(id)) d.warn(C.MediaRef, `${key}[${i}].sounds.${name}`, `unknown sound "${id}"`);
      }
      soundNames.set(e.id, sn);
    });
  }
  const cutsceneNames = new Set<string>();
  (pkg.scenes ?? []).forEach((s, i) => {
    for (const [name, c] of Object.entries(s.cutscenes ?? {})) {
      cutsceneNames.add(name);
      cutscene(c, `scenes[${i}].cutscenes.${name}`, d);
    }
  });
  // Graph references are warnings: content may be authored before its media (fail-soft at runtime).
  for (const { node, path } of nodes) {
    if (node.type === "play_animation" && entities.has(node.entity) && !(animNames.get(node.entity)?.has(node.animation) ?? false)) {
      d.warn(C.MediaRef, `${path}.animation`, `"${node.entity}" has no animation "${node.animation}"`);
    }
    if ((node.type === "sound_play" || node.type === "sound_stop") && entities.has(node.entity) && !(soundNames.get(node.entity)?.has(node.sound) ?? false) && !soundIds.has(node.sound)) {
      d.warn(C.MediaRef, `${path}.sound`, `"${node.entity}" has no sound "${node.sound}"`);
    }
    if (node.type === "sound_play" && typeof node.volume === "number" && !(node.volume >= 0 && node.volume <= 1)) d.error(C.Number, `${path}.volume`, "volume must be a number in [0, 1]");
    if (node.type === "cutscene" && !cutsceneNames.has(node.name)) d.warn(C.MediaRef, `${path}.name`, `no scene defines cutscene "${node.name}"`);
  }
}

// ---------------------------------------------------------------------------
// Asset manifest (spec 06 F8.1)
// ---------------------------------------------------------------------------

export type MediaKind = "image" | "atlas" | "audio" | "video";

export interface AssetFormat {
  readonly url: string;
  /** MIME type with optional codecs, used for format selection (e.g. "audio/ogg; codecs=opus"). */
  readonly type?: string;
  readonly bytes?: number;
  readonly hash?: string;
}

/** Grid atlas: frames are laid out row by row, `columns` per row. */
export interface AtlasSpec {
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly frames: number;
  readonly columns?: number;
  /** Floor anchor inside a frame in pixels (default: bottom centre). */
  readonly anchor?: readonly [number, number];
  /** Named sub-layers (spec 06 F3 `layer`), drawn at an offset from the base. */
  readonly layers?: Readonly<Record<string, { readonly dx: number; readonly dy: number }>>;
}

export interface ManifestEntry {
  readonly kind?: MediaKind;
  /** Single URL (images, atlases); or use `formats`. */
  readonly url?: string;
  /** Alternatives in order of preference; the first one the browser supports is used. */
  readonly formats?: readonly AssetFormat[];
  readonly language?: string;
  readonly bytes?: number;
  readonly hash?: string;
  readonly atlas?: AtlasSpec;
}

export type MediaManifest = Readonly<Record<string, ManifestEntry>>;

export const kindOf = (e: ManifestEntry): MediaKind => e.kind ?? (e.atlas !== undefined ? "atlas" : "image");

/** Cross-check content against a manifest: unknown or wrongly typed assets, frames outside atlases. */
export function validateAssets(pkg: ContentPackage, manifest: MediaManifest): Diagnostic[] {
  const out: Diagnostic[] = [];
  const err = (code: ValidationCodeValue, path: string, message: string): void => void out.push({ code, level: "error", path, message });
  for (const [id, e] of Object.entries(manifest)) {
    const urls = [...(e.url !== undefined ? [e.url] : []), ...(e.formats ?? []).map((f) => f.url)];
    if (urls.length === 0 || urls.some((u) => typeof u !== "string" || u === "")) err(C.AssetRef, `manifest.${id}`, "an asset needs a url or formats with urls");
    const a = e.atlas;
    if (kindOf(e) === "atlas" && !(a !== undefined && finitePos(a.frameWidth) && finitePos(a.frameHeight) && index(a.frames) && a.frames > 0 && (a.columns === undefined || (index(a.columns) && a.columns > 0)))) {
      err(C.AssetRef, `manifest.${id}.atlas`, "an atlas needs frameWidth, frameHeight, frames > 0 and optional columns > 0");
    }
  }
  const need = (id: string | undefined, kinds: readonly MediaKind[], path: string): ManifestEntry | undefined => {
    if (id === undefined) return undefined;
    const e = manifest[id];
    if (e === undefined) err(C.AssetRef, path, `unknown asset "${id}"`);
    else if (!kinds.includes(kindOf(e))) err(C.AssetRef, path, `asset "${id}" is a ${kindOf(e)}, expected ${kinds.join(" or ")}`);
    return e;
  };
  (pkg.animations ?? []).forEach((a, i) => {
    const atlas = need(a.atlas, ["atlas"], `animations[${i}].atlas`)?.atlas;
    if (atlas === undefined) return;
    a.instructions.forEach((ins, k) => {
      const frames = ins.op === "frame" ? [ins.n] : ins.op === "play" || ins.op === "loopRange" ? [ins.from, ins.to] : [];
      if (frames.some((f) => f >= atlas.frames)) err(C.AnimFrame, `animations[${i}].instructions[${k}]`, `frame outside atlas "${a.atlas}" (${atlas.frames} frames)`);
      if (ins.op === "layer" && atlas.layers?.[ins.name] === undefined) err(C.AnimFrame, `animations[${i}].instructions[${k}]`, `atlas "${a.atlas}" has no layer "${ins.name}"`);
    });
  });
  (pkg.sounds ?? []).forEach((s, i) => need(s.asset, ["audio"], `sounds[${i}].asset`));
  const visual = (list: readonly { variants: Readonly<Record<string, { sprite?: string; portrait?: string }>> }[], key: string): void =>
    list.forEach((e, i) => {
      for (const [v, def] of Object.entries(e.variants)) {
        need(def.sprite, ["image", "atlas"], `${key}[${i}].variants.${v}.sprite`);
        need(def.portrait, ["image"], `${key}[${i}].variants.${v}.portrait`);
      }
    });
  visual(pkg.actors ?? [], "actors");
  visual(pkg.objects ?? [], "objects");
  (pkg.objects ?? []).forEach((o, i) => need(o.icon, ["image"], `objects[${i}].icon`));
  (pkg.scenes ?? []).forEach((s, i) => {
    (s.layers ?? []).forEach((l, j) => {
      for (const [v, id] of Object.entries(l.assets ?? {})) need(id, ["image"], `scenes[${i}].layers[${j}].assets.${v}`);
    });
    for (const [name, c] of Object.entries(s.cutscenes ?? {})) {
      for (const [lang, v] of Object.entries(c.variants ?? {})) {
        need(v.video, ["video"], `scenes[${i}].cutscenes.${name}.variants.${lang}.video`);
        (v.timeline ?? []).forEach((f, k) => need(f.asset, ["image"], `scenes[${i}].cutscenes.${name}.variants.${lang}.timeline[${k}].asset`));
      }
    }
  });
  return out;
}
