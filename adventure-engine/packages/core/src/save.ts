/**
 * Save format `engine.save/1` (spec 05, phase 5): types, parsing, format
 * migration, validation and reference repair. Pure functions; the engine
 * builds snapshots and applies validated data (engine.ts).
 *
 * Load pipeline (spec 05 E4/E5/E6):
 *   parse → format/version (migrate older formats) → content id → checksum →
 *   schema → content migrations → reference repair (warnings) → apply.
 * The content id is checked before the checksum so that a save of another game
 * is reported as "wrong-content" even when it was also changed.
 */

import type { ContainerRef, LoadedContent, Value } from "@adventure-engine/content";
import { canonicalJson, sha256Hex } from "./sha256.ts";

export const SAVE_FORMAT = "engine.save";
export const SAVE_FORMAT_VERSION = 1;
export const ENGINE_VERSION = "0.5.0";

export interface SavePos {
  readonly x: number;
  readonly y: number;
}

export interface SaveActor {
  readonly id: string;
  readonly scene: string | null;
  readonly pos: SavePos | null;
  readonly facing: string | null;
  readonly variant: string;
  readonly dialogStack: readonly string[];
  readonly inventory: readonly string[];
}

export interface SaveObject {
  readonly id: string;
  readonly container: ContainerRef;
  readonly pos: SavePos | null;
  readonly facing: string | null;
  readonly variant: string;
  readonly nameKey: string | null;
}

export interface SaveAmbient {
  readonly scene: string | null;
  readonly music?: { readonly sound: string; readonly volumeFraction: number };
  readonly loops: ReadonlyArray<{ readonly entity: string; readonly sound: string; readonly volume: number }>;
}

/** `engine.save` version 1 (spec 05 E2). */
export interface SaveData {
  readonly format: typeof SAVE_FORMAT;
  readonly formatVersion: number;
  readonly engineVersion: string;
  readonly content: { readonly id: string; readonly version: string; readonly hash: string };
  readonly createdAt: string;
  readonly savedAt: string;
  readonly playTimeMs: number;
  readonly language: string;
  readonly playerId: string;
  readonly rng: { readonly algorithm: "xoshiro128**"; readonly state: string };
  readonly actors: readonly SaveActor[];
  readonly objects: readonly SaveObject[];
  readonly scenes: ReadonlyArray<{ readonly id: string; readonly variant: string }>;
  readonly portals: ReadonlyArray<{ readonly id: string; readonly locked: boolean }>;
  readonly globals: Readonly<Record<string, Value>>;
  readonly ambient: SaveAmbient;
  readonly checksum: string;
}

/** Why a save cannot be loaded (stable short kinds and codes, TS-E06). */
export type SaveErrorKind = "parse" | "schema" | "newer-format" | "checksum" | "wrong-content" | "player-scene";

export const SAVE_ERROR_CODES: Readonly<Record<SaveErrorKind, string>> = {
  parse: "E-SAVE-PARSE",
  schema: "E-SAVE-SCHEMA",
  "newer-format": "E-SAVE-NEWER",
  checksum: "E-SAVE-CHECKSUM",
  "wrong-content": "E-SAVE-CONTENT",
  "player-scene": "E-SAVE-PLAYER-SCENE",
};

export interface SaveError {
  readonly kind: SaveErrorKind;
  readonly code: string;
  readonly message: string;
}

/** Repairs done while loading (spec 05 E4/E5, TS-E08). */
export type SaveWarningKind =
  | "unknown-variant-fallback"
  | "unknown-actor-removed"
  | "unknown-object-removed"
  | "unknown-scene-removed"
  | "unknown-portal-removed"
  | "unknown-dialog-removed"
  | "unknown-language-fallback"
  | "inventory-mismatch"
  | "unknown-ambient-removed"
  | "content-migrated"
  | "format-migrated"
  | "checksum-ignored"
  | "duplicate-id-removed";

export interface SaveWarning {
  readonly kind: SaveWarningKind;
  readonly message: string;
}

export type SaveParseResult =
  | { readonly ok: true; readonly data: SaveData; readonly warnings: readonly SaveWarning[] }
  | { readonly ok: false; readonly error: SaveError; readonly warnings: readonly SaveWarning[] };

const fail = (kind: SaveErrorKind, message: string, warnings: readonly SaveWarning[]): SaveParseResult => ({ ok: false, error: { kind, code: SAVE_ERROR_CODES[kind], message }, warnings });

/** "sha256:<hex>" of the canonical JSON of the save without its checksum. */
export function saveChecksum(data: Omit<SaveData, "checksum"> | SaveData): string {
  // canonicalJson drops undefined members, so this hashes the save without its checksum.
  return `sha256:${sha256Hex(canonicalJson({ ...data, checksum: undefined }))}`;
}

/** "sha256:<hex>" of the canonical content package. */
export function contentHash(content: LoadedContent): string {
  return `sha256:${sha256Hex(canonicalJson(content.pkg))}`;
}

/** Compare dotted numeric versions ("1.2.10" > "1.2.9"); non-numeric parts compare as text. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".");
  const pb = b.split(".");
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? "0";
    const y = pb[i] ?? "0";
    const nx = Number(x);
    const ny = Number(y);
    const c = Number.isFinite(nx) && Number.isFinite(ny) ? nx - ny : x < y ? -1 : x > y ? 1 : 0;
    if (c !== 0) return Math.sign(c);
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Format migrations (spec 05 E6): pure functions vN → vN+1
// ---------------------------------------------------------------------------

/**
 * Format 0 was the project's pre-release draft (synthetic, phase 5): maps instead
 * of arrays, `game`/`gameVersion`, `player`, `rngState`, `vars`, objects placed by
 * "scene:<id>" / "actor:<id>" / "none" strings, no timestamps and no checksum.
 */
function v0ToV1(d: Record<string, unknown>): Record<string, unknown> {
  const obj = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
  const container = (where: unknown): ContainerRef => {
    if (typeof where === "string" && where.startsWith("scene:")) return { kind: "scene", id: where.slice(6) };
    if (typeof where === "string" && where.startsWith("actor:")) return { kind: "actor", id: where.slice(6) };
    return { kind: "none" };
  };
  return {
    format: SAVE_FORMAT,
    formatVersion: 1,
    engineVersion: "0.0.0",
    content: { id: d["game"], version: d["gameVersion"], hash: "" },
    createdAt: "1970-01-01T00:00:00.000Z",
    savedAt: "1970-01-01T00:00:00.000Z",
    playTimeMs: 0,
    language: d["language"],
    playerId: d["player"],
    rng: { algorithm: "xoshiro128**", state: d["rngState"] },
    actors: Object.entries(obj(d["actors"])).map(([id, raw]) => {
      const a = obj(raw);
      return {
        id,
        scene: a["scene"] ?? null,
        pos: typeof a["x"] === "number" && typeof a["y"] === "number" ? { x: a["x"], y: a["y"] } : null,
        facing: a["facing"] ?? null,
        variant: a["variant"] ?? "default",
        dialogStack: a["dialog"] ?? [],
        inventory: a["items"] ?? [],
      };
    }),
    objects: Object.entries(obj(d["objects"])).map(([id, raw]) => {
      const o = obj(raw);
      return { id, container: container(o["where"]), pos: null, facing: null, variant: o["variant"] ?? "default", nameKey: o["name"] ?? null };
    }),
    scenes: Object.entries(obj(d["scenes"])).map(([id, variant]) => ({ id, variant })),
    portals: Object.entries(obj(d["portals"])).map(([id, locked]) => ({ id, locked })),
    globals: obj(d["vars"]),
    ambient: { scene: null, loops: [] },
    checksum: "",
  };
}

const FORMAT_MIGRATIONS: Readonly<Record<number, (d: Record<string, unknown>) => Record<string, unknown>>> = { 0: v0ToV1 };

// ---------------------------------------------------------------------------
// Schema check (spec 05 E5: a missing required field rejects the save)
// ---------------------------------------------------------------------------

const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isPos = (v: unknown): boolean => v === null || (isObj(v) && isNum(v["x"]) && isNum(v["y"]));
const isStrArr = (v: unknown): boolean => Array.isArray(v) && v.every(isStr);
const isValue = (v: unknown): boolean => typeof v === "boolean" || isNum(v) || isStr(v);
const isContainer = (v: unknown): boolean => isObj(v) && (v["kind"] === "none" || ((v["kind"] === "scene" || v["kind"] === "actor") && isStr(v["id"])));

/** First schema problem of a (format-1) save, or null. Optional fields are filled by `withDefaults`. */
export function schemaProblem(d: Record<string, unknown>): string | null {
  const checks: Array<[boolean, string]> = [
    [d["format"] === SAVE_FORMAT, "format"],
    [isNum(d["formatVersion"]), "formatVersion"],
    [isObj(d["content"]) && isStr(d["content"]["id"]) && isStr(d["content"]["version"]), "content"],
    [isStr(d["language"]), "language"],
    [isStr(d["playerId"]), "playerId"],
    [isObj(d["rng"]) && d["rng"]["algorithm"] === "xoshiro128**" && isStr(d["rng"]["state"]) && /^[0-9a-f]{32}$/.test(d["rng"]["state"]) && !/^0+$/.test(d["rng"]["state"]), "rng"],
    [Array.isArray(d["actors"]), "actors"],
    [Array.isArray(d["objects"]), "objects"],
  ];
  for (const [ok, field] of checks) if (!ok) return `missing or invalid required field "${field}"`;
  for (const [i, a] of (d["actors"] as unknown[]).entries()) {
    if (!isObj(a) || !isStr(a["id"]) || !(a["scene"] === null || isStr(a["scene"])) || !isPos(a["pos"] ?? null) || !isStrArr(a["inventory"] ?? []) || !isStrArr(a["dialogStack"] ?? [])) {
      return `invalid actors[${i}]`;
    }
  }
  for (const [i, o] of (d["objects"] as unknown[]).entries()) {
    if (!isObj(o) || !isStr(o["id"]) || !isContainer(o["container"]) || !isPos(o["pos"] ?? null)) return `invalid objects[${i}]`;
  }
  for (const key of ["scenes", "portals"] as const) {
    const list = d[key];
    if (list !== undefined && !(Array.isArray(list) && list.every((x) => isObj(x) && isStr(x["id"])))) return `invalid ${key}`;
  }
  const g = d["globals"];
  if (g !== undefined && !(isObj(g) && Object.entries(g).every(([k, v]) => !k.startsWith("$") && isValue(v)))) return "invalid globals";
  return null;
}

/** Fill optional fields with their defaults (spec 05 E5: missing optional field → default value). */
function withDefaults(d: Record<string, unknown>): SaveData {
  const amb = isObj(d["ambient"]) ? d["ambient"] : {};
  return {
    format: SAVE_FORMAT,
    formatVersion: d["formatVersion"] as number,
    engineVersion: isStr(d["engineVersion"]) ? d["engineVersion"] : "0.0.0",
    content: { hash: "", ...(d["content"] as { id: string; version: string }) } as SaveData["content"],
    createdAt: isStr(d["createdAt"]) ? d["createdAt"] : "1970-01-01T00:00:00.000Z",
    savedAt: isStr(d["savedAt"]) ? d["savedAt"] : "1970-01-01T00:00:00.000Z",
    playTimeMs: isNum(d["playTimeMs"]) ? Math.max(0, Math.round(d["playTimeMs"])) : 0,
    language: d["language"] as string,
    playerId: d["playerId"] as string,
    rng: d["rng"] as SaveData["rng"],
    actors: (d["actors"] as Array<Record<string, unknown>>).map((a) => ({
      id: a["id"] as string,
      scene: (a["scene"] as string | null) ?? null,
      pos: (a["pos"] as SavePos | null | undefined) ?? null,
      facing: isStr(a["facing"]) ? a["facing"] : null,
      variant: isStr(a["variant"]) ? a["variant"] : "default",
      dialogStack: (a["dialogStack"] as string[] | undefined) ?? [],
      inventory: (a["inventory"] as string[] | undefined) ?? [],
    })),
    objects: (d["objects"] as Array<Record<string, unknown>>).map((o) => ({
      id: o["id"] as string,
      container: o["container"] as ContainerRef,
      pos: (o["pos"] as SavePos | null | undefined) ?? null,
      facing: isStr(o["facing"]) ? o["facing"] : null,
      variant: isStr(o["variant"]) ? o["variant"] : "default",
      nameKey: isStr(o["nameKey"]) ? o["nameKey"] : null,
    })),
    scenes: ((d["scenes"] as Array<Record<string, unknown>> | undefined) ?? []).map((s) => ({ id: s["id"] as string, variant: isStr(s["variant"]) ? s["variant"] : "default" })),
    portals: ((d["portals"] as Array<Record<string, unknown>> | undefined) ?? []).map((p) => ({ id: p["id"] as string, locked: p["locked"] === true })),
    globals: (d["globals"] as Record<string, Value> | undefined) ?? {},
    ambient: {
      scene: isStr(amb["scene"]) ? amb["scene"] : null,
      ...(isObj(amb["music"]) && isStr(amb["music"]["sound"]) && isNum(amb["music"]["volumeFraction"]) ? { music: { sound: amb["music"]["sound"], volumeFraction: amb["music"]["volumeFraction"] } } : {}),
      loops: Array.isArray(amb["loops"])
        ? (amb["loops"] as unknown[])
            .filter((l): l is { entity: string; sound: string; volume: number } => isObj(l) && isStr(l["entity"]) && isStr(l["sound"]) && isNum(l["volume"]))
            // Volumes are fractions; anything outside [0, 1] in a file is clamped.
            .map((l) => ({ entity: l.entity, sound: l.sound, volume: Math.min(1, Math.max(0, l.volume)) }))
        : [],
    },
    checksum: isStr(d["checksum"]) ? d["checksum"] : "",
  };
}

// ---------------------------------------------------------------------------
// Content migrations (spec 05 E6.2) and reference repair (E4/E5, TS-E08)
// ---------------------------------------------------------------------------

function applyContentMigrations(data: SaveData, content: LoadedContent, warnings: SaveWarning[]): SaveData {
  const current = content.pkg.game.version;
  if (compareVersions(data.content.version, current) >= 0) return data;
  let d = data;
  for (const m of content.pkg.saveMigrations ?? []) {
    if (compareVersions(d.content.version, m.fromVersion) > 0) continue;
    // Own keys only: an id such as "constructor" must not resolve to an Object.prototype member.
    const ren = (id: string): string => (m.rename !== undefined && Object.hasOwn(m.rename, id) ? (m.rename[id] as string) : id);
    const gone = new Set(m.remove ?? []);
    const renContainer = (c: ContainerRef): ContainerRef => (c.kind === "none" ? c : { kind: c.kind, id: ren(c.id) });
    d = {
      ...d,
      playerId: ren(d.playerId),
      actors: d.actors.filter((a) => !gone.has(a.id)).map((a) => ({ ...a, id: ren(a.id), scene: a.scene === null ? null : ren(a.scene), inventory: a.inventory.filter((i) => !gone.has(i)).map(ren) })),
      objects: d.objects.filter((o) => !gone.has(o.id)).map((o) => ({ ...o, id: ren(o.id), container: renContainer(o.container) })),
      scenes: d.scenes.filter((s) => !gone.has(s.id)).map((s) => ({ ...s, id: ren(s.id) })),
      portals: d.portals.filter((p) => !gone.has(p.id)).map((p) => ({ ...p, id: ren(p.id) })),
      globals: { ...Object.fromEntries(Object.entries(d.globals).filter(([k]) => !gone.has(k)).map(([k, v]) => [ren(k), v])), ...(m.setGlobals ?? {}) },
    };
    warnings.push({ kind: "content-migrated", message: `content migration from ${m.fromVersion} applied` });
  }
  return { ...d, content: { ...d.content, version: current } };
}

function repair(data: SaveData, content: LoadedContent, warnings: SaveWarning[]): SaveParseResult {
  const warn = (kind: SaveWarningKind, message: string): void => void warnings.push({ kind, message });
  const variantOk = (id: string, v: string): string => {
    // Only known ids reach this point, so the entity has a variant list.
    const known = content.variantsOf(id) as readonly string[];
    if (known.includes(v)) return v;
    warn("unknown-variant-fallback", `variant "${v}" of "${id}" no longer exists; "default" used`);
    return "default";
  };
  if (!content.actors.has(data.playerId)) return fail("player-scene", `unknown player actor "${data.playerId}"`, warnings);
  // One entry per id; the later entry wins (a content migration may rename an id onto an existing one).
  const unique = <T extends { readonly id: string }>(list: readonly T[], what: string): T[] =>
    list.filter((x, i) => {
      const later = list.slice(i + 1).some((y) => y.id === x.id);
      if (later) warn("duplicate-id-removed", `duplicate ${what} "${x.id}": the later entry is used`);
      return !later;
    });
  const actors = unique(data.actors, "actor").filter((a) => {
    if (content.actors.has(a.id)) return true;
    warn("unknown-actor-removed", `unknown actor "${a.id}" removed`);
    return false;
  });
  const player = actors.find((a) => a.id === data.playerId);
  if (player === undefined || player.scene === null || !content.scenes.has(player.scene)) {
    return fail("player-scene", `the player's scene ${JSON.stringify(player?.scene ?? null)} is unknown`, warnings);
  }
  const objects = unique(data.objects, "object").filter((o) => {
    if (content.objects.has(o.id)) return true;
    warn("unknown-object-removed", `unknown object "${o.id}" removed`);
    return false;
  });
  const knownContainer = (c: ContainerRef): boolean => c.kind === "none" || (c.kind === "scene" ? content.scenes.has(c.id) : actors.some((a) => a.id === c.id));
  const fixedObjects = objects.map((o) => {
    const container = knownContainer(o.container) ? o.container : ({ kind: "none" } as const);
    if (container !== o.container) warn("unknown-object-removed", `"${o.id}" was in an unknown container; it is now nowhere`);
    return { ...o, container, variant: variantOk(o.id, o.variant) };
  });
  // Inventory: the object's container wins; order comes from the actor's inventory; unknown entries are dropped.
  const fixedActors = actors.map((a) => {
    const scene = a.scene !== null && !content.scenes.has(a.scene) ? (warn("unknown-scene-removed", `actor "${a.id}" was in unknown scene "${a.scene}"`), null) : a.scene;
    const carried = fixedObjects.filter((o) => o.container.kind === "actor" && o.container.id === a.id).map((o) => o.id);
    const ordered = a.inventory.filter((i, k) => carried.includes(i) && a.inventory.indexOf(i) === k);
    const rest = carried.filter((i) => !ordered.includes(i));
    if (ordered.length !== a.inventory.length || rest.length > 0) warn("inventory-mismatch", `inventory of "${a.id}" repaired from object containers`);
    const dialogStack = a.dialogStack.filter((ref) => {
      if (content.entries.has(ref)) return true;
      warn("unknown-dialog-removed", `unknown dialog entry "${ref}" of "${a.id}" removed`);
      return false;
    });
    return { ...a, scene: scene === null ? null : scene, pos: scene === null ? null : a.pos, variant: variantOk(a.id, a.variant), inventory: [...ordered, ...rest], dialogStack };
  });
  const scenes = data.scenes.filter((s) => {
    if (content.scenes.has(s.id)) return true;
    warn("unknown-scene-removed", `unknown scene "${s.id}" removed`);
    return false;
  });
  const portals = data.portals.filter((p) => {
    if (content.portals.has(p.id)) return true;
    warn("unknown-portal-removed", `unknown portal "${p.id}" removed`);
    return false;
  });
  const loops = data.ambient.loops.filter((l) => {
    const known = content.scenes.has(l.entity) || content.actors.has(l.entity) || content.objects.has(l.entity);
    if (!known) warn("unknown-ambient-removed", `ambient loop of unknown "${l.entity}" removed`);
    return known;
  });
  let language = data.language;
  if (!content.pkg.game.languages.includes(language)) {
    warn("unknown-language-fallback", `language "${language}" is not available; "${content.pkg.game.defaultLanguage}" used`);
    language = content.pkg.game.defaultLanguage;
  }
  return {
    ok: true,
    data: { ...data, language, actors: fixedActors, objects: fixedObjects, scenes: scenes.map((s) => ({ ...s, variant: variantOk(s.id, s.variant) })), portals, ambient: { ...data.ambient, loops } },
    warnings,
  };
}

/**
 * Parse and validate a raw save for `content`. With `allowChecksumMismatch`
 * (dev builds) a wrong checksum is a warning instead of an error.
 */
export function parseSave(raw: string, content: LoadedContent, options: { allowChecksumMismatch?: boolean } = {}): SaveParseResult {
  const warnings: SaveWarning[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return fail("parse", `the save is not valid JSON (${(err as SyntaxError).message})`, warnings);
  }
  if (!isObj(parsed) || parsed["format"] !== SAVE_FORMAT || !Number.isInteger(parsed["formatVersion"])) return fail("schema", "not an engine.save file", warnings);
  // Bounded structure before any recursive processing (checksum, migration): a deeply nested file is refused, not a stack overflow.
  if (nestedDeeperThan(parsed, MAX_SAVE_DEPTH)) return fail("schema", `the save is nested deeper than ${MAX_SAVE_DEPTH} levels`, warnings);
  let d = parsed;
  const version = d["formatVersion"] as number;
  if (version < 0) return fail("schema", `invalid format version ${version}`, warnings);
  if (version > SAVE_FORMAT_VERSION) return fail("newer-format", `format version ${version} needs a newer engine (this one reads ≤ ${SAVE_FORMAT_VERSION})`, warnings);
  const migrated = version < SAVE_FORMAT_VERSION;
  for (let v = version; v < SAVE_FORMAT_VERSION; v++) {
    // Invariant: v is in 0 … SAVE_FORMAT_VERSION − 1 (negative versions were refused above), and
    // FORMAT_MIGRATIONS has a step for each of them.
    const step = FORMAT_MIGRATIONS[v] as (d: Record<string, unknown>) => Record<string, unknown>;
    d = step(d);
  }
  if (migrated) warnings.push({ kind: "format-migrated", message: `format ${version} migrated to ${SAVE_FORMAT_VERSION}` });
  // A save for another game is reported as such, even when it is also damaged (checked before the checksum).
  const contentId = isObj(d["content"]) ? d["content"]["id"] : undefined;
  if (isStr(contentId) && contentId !== content.pkg.game.id) return fail("wrong-content", `the save belongs to "${contentId}", not "${content.pkg.game.id}"`, warnings);
  // Format 0 had no checksum; migrated saves are not checked.
  if (!migrated && d["checksum"] !== saveChecksum(d as unknown as SaveData)) {
    if (options.allowChecksumMismatch !== true) return fail("checksum", "the save was changed or damaged (checksum mismatch)", warnings);
    warnings.push({ kind: "checksum-ignored", message: "checksum mismatch ignored (dev build)" });
  }
  const problem = schemaProblem(d);
  if (problem !== null) return fail("schema", problem, warnings);
  const data = withDefaults(d);
  return repair(applyContentMigrations(data, content, warnings), content, warnings);
}

/** Deepest nesting a save may have (a real save is about 5 levels deep). */
export const MAX_SAVE_DEPTH = 64;

/** Whether a JSON value is nested deeper than `max` levels (iterative, so it cannot overflow the stack). */
export function nestedDeeperThan(value: unknown, max: number): boolean {
  const stack: Array<[unknown, number]> = [[value, 1]];
  while (stack.length > 0) {
    const [v, depth] = stack.pop() as [unknown, number];
    if (typeof v !== "object" || v === null) continue;
    if (depth > max) return true;
    for (const child of Array.isArray(v) ? v : Object.values(v)) stack.push([child, depth + 1]);
  }
  return false;
}

/** Value at a dotted path with `[n]` indices and `[key=value]` selectors (saves and scenario steps). */
export function pathSegments(path: string): Array<string | number | { key: string; value: string }> {
  const out: Array<string | number | { key: string; value: string }> = [];
  for (const part of path.split(".")) {
    const m = /^([^[\]]*)((?:\[[^\]]+\])*)$/.exec(part);
    if (m === null) throw new Error(`invalid path "${path}"`);
    if (m[1] !== "") out.push(m[1] as string);
    for (const sel of (m[2] as string).match(/\[[^\]]+\]/g) ?? []) {
      const inner = sel.slice(1, -1);
      const eq = inner.indexOf("=");
      out.push(eq >= 0 ? { key: inner.slice(0, eq), value: inner.slice(eq + 1) } : Number(inner));
    }
  }
  return out;
}

function step(cur: unknown, seg: string | number | { key: string; value: string }): unknown {
  if (typeof seg === "object") return Array.isArray(cur) ? cur.find((x) => isObj(x) && String(x[seg.key]) === seg.value) : undefined;
  if (typeof seg === "number") return Array.isArray(cur) ? cur[seg] : undefined;
  return isObj(cur) ? cur[seg] : undefined;
}

export function getPath(value: unknown, path: string): unknown {
  return pathSegments(path).reduce<unknown>((cur, seg) => step(cur, seg), value);
}

/** Set a value at a path (the parent must exist); returns false if it does not. */
export function setPath(value: unknown, path: string, v: unknown): boolean {
  const segs = pathSegments(path);
  const last = segs.pop();
  const parent = segs.reduce<unknown>((cur, seg) => step(cur, seg), value);
  if (last === undefined || typeof last === "object" || !isObj(parent) && !Array.isArray(parent)) return false;
  (parent as Record<string | number, unknown>)[last] = v;
  return true;
}

/** Remove the value at a path (for comparisons that ignore fields). */
export function deletePath(value: unknown, path: string): void {
  const segs = pathSegments(path);
  const last = segs.pop();
  const parent = segs.reduce<unknown>((cur, seg) => step(cur, seg), value);
  if (typeof last === "string" && isObj(parent)) delete parent[last];
}

/**
 * Integrity of stored bytes without the content (slot listing, `.bak` choice):
 * "ok" when the text parses as an engine save whose checksum matches (format 0
 * has none), "corrupt" otherwise.
 */
export function saveIntegrity(raw: string | null): "ok" | "corrupt" {
  if (raw === null) return "corrupt";
  let d: unknown;
  try {
    d = JSON.parse(raw);
  } catch {
    return "corrupt";
  }
  if (!isObj(d) || d["format"] !== SAVE_FORMAT || !Number.isInteger(d["formatVersion"])) return "corrupt";
  if (nestedDeeperThan(d, MAX_SAVE_DEPTH)) return "corrupt";
  const version = d["formatVersion"] as number;
  // Only the known checksum-less draft format 0 is accepted without a checksum; negative versions are damage.
  if (version < 0) return "corrupt";
  if (version === 0) return "ok";
  return d["checksum"] === saveChecksum(d as unknown as SaveData) ? "ok" : "corrupt";
}
