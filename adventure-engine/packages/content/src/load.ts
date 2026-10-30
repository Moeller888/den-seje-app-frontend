/**
 * Content loading, validation and indexing (spec 07 §8, 01 A7, 02 B2).
 *
 * - strict (default): any error-level diagnostic rejects the package.
 * - lenient (development/tests only): error-level diagnostics are downgraded to
 *   warnings and the package loads. E-SCHEMA is fatal in every mode, because a
 *   structurally broken package cannot be indexed.
 */

import { ContentValidationError, ValidationCode as C, type Diagnostic, type ValidationCodeValue } from "./diagnostics.ts";
import { validateMedia, validateSaveMigrations } from "./media.ts";
import { Camera, cameraProblems, isAllowed, polygonProblem, polygonsOverlap, type Vec2 } from "@adventure-engine/geometry";
import {
  FACINGS,
  type ActorDef,
  type ContainerRef,
  type ContentPackage,
  type EdgeDef,
  type GraphDef,
  type NodeDef,
  type ObjectDef,
  type PortalDef,
  type SceneDef,
} from "./types.ts";

export type LoadMode = "strict" | "lenient";

export interface LoadOptions {
  readonly mode?: LoadMode;
}

export interface Edge {
  readonly to: string;
  readonly order: number;
  /** Position in the node's `next` list (stable tie-breaker). */
  readonly position: number;
}

export interface IndexedNode {
  readonly node: NodeDef;
  readonly graph: GraphDef;
  readonly path: string;
  readonly edges: readonly Edge[];
}

/** Variable name rule (spec 01 A3.6). */
export const VAR_NAME = /^[a-z][a-z0-9_.]*$/;
/** Context key rule: "$" + variable-like name. */
export const CTX_NAME = /^\$[a-z][a-zA-Z0-9_.]*$/;

export interface LoadedContent {
  readonly pkg: ContentPackage;
  readonly mode: LoadMode;
  readonly diagnostics: readonly Diagnostic[];
  readonly nodes: ReadonlyMap<string, IndexedNode>;
  /** "<graphId>#<entryName>" → entry node id. */
  readonly entries: ReadonlyMap<string, string>;
  readonly actors: ReadonlyMap<string, ActorDef>;
  readonly objects: ReadonlyMap<string, ObjectDef>;
  readonly scenes: ReadonlyMap<string, SceneDef>;
  readonly portals: ReadonlyMap<string, PortalDef>;
  readonly graphs: ReadonlyMap<string, GraphDef>;
  /** Predecessor node ids for each node (one element per incoming edge). */
  readonly incoming: ReadonlyMap<string, readonly string[]>;
  /** All nodes from which `nodeId` is reachable via edges (cached). */
  ancestors(nodeId: string): ReadonlySet<string>;
  /** Resolve an entry name relative to a graph, or a full "<graph>#<name>" reference. */
  resolveEntry(nameOrRef: string, contextGraphId?: string): string | undefined;
  /** Variants an entity can take; undefined if the entity is unknown. */
  variantsOf(entityId: string): readonly string[] | undefined;
  hasTextKey(key: string): boolean;
}

/** Default edge order when `order` is absent (spec 02 B3.2). */
export const DEFAULT_EDGE_ORDER = 0;

export function normalizeEdges(next: readonly EdgeDef[] | undefined): Edge[] {
  if (next === undefined) return [];
  return next.map((e, position) =>
    typeof e === "string"
      ? { to: e, order: DEFAULT_EDGE_ORDER, position }
      : { to: e.to, order: e.order ?? DEFAULT_EDGE_ORDER, position },
  );
}

interface ParamSpec {
  readonly name: string;
  readonly kind:
    | "str"
    | "bool"
    | "num"
    | "value"
    | "expr"
    | "var"
    | "actor"
    | "object"
    | "entity"
    | "scene"
    | "portal"
    | "container"
    | "textKey"
    | "useKind"
    | "delayMode"
    | "times"
    | "entryName"
    | "spot";
  readonly optional?: boolean;
}

const P = (name: string, kind: ParamSpec["kind"], optional = false): ParamSpec => ({ name, kind, optional });

/** Required/optional parameters per node type (spec 02 B4). */
export const NODE_PARAMS: Readonly<Record<NodeDef["type"], readonly ParamSpec[]>> = {
  entry: [P("name", "str"), P("modal", "bool", true)],
  guard: [P("expr", "expr")],
  return: [P("value", "bool")],
  random: [],
  delay: [P("minMs", "num"), P("maxMs", "num"), P("mode", "delayMode")],
  join: [],
  detach: [],
  set: [P("var", "var"), P("value", "value")],
  move_object: [P("object", "object"), P("to", "container"), P("from", "container", true), P("spot", "spot", true)],
  move_actor: [P("actor", "actor"), P("scene", "scene"), P("spot", "spot", true)],
  set_variant: [P("entity", "entity"), P("variant", "str")],
  rename: [P("object", "object"), P("nameKey", "textKey")],
  portal_lock: [P("portal", "portal"), P("locked", "bool")],
  player_set: [P("actor", "actor")],
  interact: [P("object", "entity")],
  walk_to: [P("actor", "actor"), P("spot", "spot"), P("scene", "scene", true)],
  talk: [P("actor", "actor"), P("target", "actor")],
  use_item: [P("item", "object"), P("target", "entity"), P("kind", "useKind")],
  portal_use: [P("portal", "portal", true), P("toScene", "scene", true), P("actor", "actor", true)],
  stop_walk: [P("actor", "actor")],
  say: [P("speaker", "actor"), P("textKey", "textKey")],
  choice: [],
  end_dialog: [],
  dialog_push: [P("actor", "actor"), P("entryName", "entryName")],
  dialog_pop: [P("actor", "actor")],
  play_animation: [P("entity", "entity"), P("animation", "str")],
  sound_play: [P("entity", "entity"), P("sound", "str"), P("times", "times", true), P("volume", "num", true)],
  sound_stop: [P("entity", "entity"), P("sound", "str")],
  cutscene: [P("name", "str"), P("hold", "bool", true)],
  cutscene_clear: [],
  input_lock: [],
  input_unlock: [],
  quit: [],
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;

class Collector {
  readonly list: Diagnostic[] = [];
  private readonly mode: LoadMode;
  constructor(mode: LoadMode) {
    this.mode = mode;
  }
  error(code: ValidationCodeValue, path: string, message: string): void {
    const level = code === C.Schema || this.mode === "strict" ? "error" : "warning";
    this.list.push({ code, level, message, path });
  }
  warn(code: ValidationCodeValue, path: string, message: string): void {
    this.list.push({ code, level: "warning", message, path });
  }
}

function schemaCheck(raw: unknown, d: Collector): raw is ContentPackage {
  if (!isObj(raw)) {
    d.error(C.Schema, "", "content package must be an object");
    return false;
  }
  const g = raw["game"];
  if (!isObj(g)) {
    d.error(C.Schema, "game", "missing game object");
  } else {
    if (!isStr(g["id"])) d.error(C.Schema, "game.id", "game.id must be a non-empty string");
    if (!Array.isArray(g["languages"]) || g["languages"].length === 0 || !g["languages"].every(isStr)) {
      d.error(C.Schema, "game.languages", "game.languages must be a non-empty string array");
    }
    if (!isStr(g["defaultLanguage"])) d.error(C.Schema, "game.defaultLanguage", "missing defaultLanguage");
    if (g["globals"] !== undefined && !isObj(g["globals"])) d.error(C.Schema, "game.globals", "globals must be an object");
  }
  for (const key of ["scenes", "actors", "objects", "portals", "graphs"] as const) {
    const arr = raw[key];
    if (arr === undefined) continue;
    if (!Array.isArray(arr)) {
      d.error(C.Schema, key, `${key} must be an array`);
      continue;
    }
    arr.forEach((item, i) => {
      if (!isObj(item) || !isStr(item["id"])) d.error(C.Schema, `${key}[${i}]`, "entry must be an object with a string id");
    });
  }
  if (Array.isArray(raw["graphs"])) {
    raw["graphs"].forEach((gr, gi) => {
      if (!isObj(gr)) return;
      if (gr["kind"] !== "logic" && gr["kind"] !== "dialog") d.error(C.Schema, `graphs[${gi}].kind`, "kind must be logic|dialog");
      if (!Array.isArray(gr["nodes"])) {
        d.error(C.Schema, `graphs[${gi}].nodes`, "nodes must be an array");
        return;
      }
      gr["nodes"].forEach((n, ni) => {
        const p = `graphs[${gi}].nodes[${ni}]`;
        if (!isObj(n) || !isStr(n["id"]) || !isStr(n["type"])) {
          d.error(C.Schema, p, "node must be an object with string id and type");
          return;
        }
        const next = n["next"];
        if (next !== undefined) {
          const ok =
            Array.isArray(next) &&
            next.every((e) => isStr(e) || (isObj(e) && isStr(e["to"]) && (e["order"] === undefined || typeof e["order"] === "number")));
          if (!ok) d.error(C.Schema, `${p}.next`, "next must be a list of node ids or {to, order}");
        }
      });
    });
  }
  if (raw["i18n"] !== undefined) {
    if (!isObj(raw["i18n"]) || !Object.values(raw["i18n"]).every((t) => isObj(t) && Object.values(t).every((s) => typeof s === "string"))) {
      d.error(C.Schema, "i18n", "i18n must map language → { key: string }");
    }
  }
  return !d.list.some((x) => x.code === C.Schema);
}

export function loadContent(raw: unknown, options: LoadOptions = {}): LoadedContent {
  const mode: LoadMode = options.mode ?? "strict";
  const d = new Collector(mode);
  if (!schemaCheck(raw, d)) throw new ContentValidationError(d.list);
  const pkg = raw;

  const scenes = indexById(pkg.scenes ?? [], "scenes", d);
  const actors = indexById(pkg.actors ?? [], "actors", d);
  const objects = indexById(pkg.objects ?? [], "objects", d);
  const portals = indexById(pkg.portals ?? [], "portals", d);
  const graphs = indexById(pkg.graphs ?? [], "graphs", d);

  for (const id of actors.keys()) {
    if (objects.has(id)) d.error(C.DuplicateId, `objects`, `entity id "${id}" is used by both an actor and an object`);
  }

  // ---- nodes: one shared id space across the whole package (spec 02 B2.1)
  const nodes = new Map<string, IndexedNode>();
  const entries = new Map<string, string>();
  (pkg.graphs ?? []).forEach((graph, gi) => {
    graph.nodes.forEach((node, ni) => {
      const path = `graphs[${gi}].nodes[${ni}]`;
      if (nodes.has(node.id)) {
        d.error(C.DuplicateId, path, `node id "${node.id}" is not unique in the package`);
        return;
      }
      nodes.set(node.id, { node, graph, path, edges: normalizeEdges(node.next) });
      if (node.type === "entry" && isStr((node as { name?: unknown }).name)) {
        const ref = `${graph.id}#${node.name}`;
        if (entries.has(ref)) d.error(C.DuplicateId, path, `entry name "${node.name}" is not unique in graph "${graph.id}"`);
        else entries.set(ref, node.id);
      }
    });
  });

  const incoming = new Map<string, string[]>();
  for (const [id, ix] of nodes) {
    for (const e of ix.edges) {
      const list = incoming.get(e.to) ?? [];
      list.push(id);
      incoming.set(e.to, list);
    }
  }

  const languages = pkg.game.languages;
  const i18n = pkg.i18n ?? {};
  const allKeys = new Set<string>();
  for (const table of Object.values(i18n)) for (const k of Object.keys(table)) allKeys.add(k);

  const variantsOf = (id: string): readonly string[] | undefined => {
    const a = actors.get(id) ?? objects.get(id);
    if (a !== undefined) return Object.keys(a.variants ?? {});
    const s = scenes.get(id);
    if (s !== undefined) return s.variants ?? ["default"];
    return undefined;
  };

  const resolveEntry = (nameOrRef: string, contextGraphId?: string): string | undefined => {
    const ref = nameOrRef.includes("#") || contextGraphId === undefined ? nameOrRef : `${contextGraphId}#${nameOrRef}`;
    return entries.get(ref);
  };

  const ancestorCache = new Map<string, ReadonlySet<string>>();
  const ancestors = (nodeId: string): ReadonlySet<string> => {
    const cached = ancestorCache.get(nodeId);
    if (cached !== undefined) return cached;
    const seen = new Set<string>();
    const stack = [...(incoming.get(nodeId) ?? [])];
    while (stack.length > 0) {
      const cur = stack.pop() as string;
      if (seen.has(cur)) continue;
      seen.add(cur);
      for (const p of incoming.get(cur) ?? []) stack.push(p);
    }
    ancestorCache.set(nodeId, seen);
    return seen;
  };

  const v = new Validator(d, pkg, { nodes, entries, actors, objects, scenes, portals, variantsOf, resolveEntry, allKeys });
  v.run();

  // i18n completeness (W-I18N-EMPTY)
  for (const key of [...allKeys].sort()) {
    for (const lang of languages) {
      // Own keys only: a text key such as "constructor" must not find Object.prototype members.
      const table = i18n[lang];
      const text = table !== undefined && Object.hasOwn(table, key) ? table[key] : undefined;
      if (text === undefined) d.warn(C.I18nEmpty, `i18n.${lang}.${key}`, `missing translation for "${key}" in "${lang}"`);
      else if (text.trim() === "") d.warn(C.I18nEmpty, `i18n.${lang}.${key}`, `empty translation for "${key}" in "${lang}"`);
    }
  }

  if (d.list.some((x) => x.level === "error")) throw new ContentValidationError(d.list);

  return {
    pkg,
    mode,
    diagnostics: d.list,
    nodes,
    entries,
    actors,
    objects,
    scenes,
    portals,
    graphs,
    incoming,
    ancestors,
    resolveEntry,
    variantsOf,
    hasTextKey: (key) => allKeys.has(key),
  };
}

function indexById<T extends { readonly id: string }>(list: readonly T[], key: string, d: Collector): Map<string, T> {
  const m = new Map<string, T>();
  list.forEach((item, i) => {
    if (m.has(item.id)) d.error(C.DuplicateId, `${key}[${i}]`, `duplicate ${key} id "${item.id}"`);
    else m.set(item.id, item);
  });
  return m;
}

interface ValidatorIndex {
  readonly nodes: ReadonlyMap<string, IndexedNode>;
  readonly entries: ReadonlyMap<string, string>;
  readonly actors: ReadonlyMap<string, ActorDef>;
  readonly objects: ReadonlyMap<string, ObjectDef>;
  readonly scenes: ReadonlyMap<string, SceneDef>;
  readonly portals: ReadonlyMap<string, PortalDef>;
  readonly variantsOf: (id: string) => readonly string[] | undefined;
  readonly resolveEntry: (nameOrRef: string, contextGraphId?: string) => string | undefined;
  readonly allKeys: ReadonlySet<string>;
}

class Validator {
  private readonly readVars = new Map<string, string>();
  private readonly writtenVars = new Set<string>();
  private readonly d: Collector;
  private readonly pkg: ContentPackage;
  private readonly ix: ValidatorIndex;

  constructor(d: Collector, pkg: ContentPackage, ix: ValidatorIndex) {
    this.d = d;
    this.pkg = pkg;
    this.ix = ix;
  }

  run(): void {
    this.game();
    (this.pkg.scenes ?? []).forEach((s, i) => this.scene(s, `scenes[${i}]`));
    (this.pkg.actors ?? []).forEach((a, i) => this.actor(a, `actors[${i}]`));
    (this.pkg.objects ?? []).forEach((o, i) => this.object(o, `objects[${i}]`));
    (this.pkg.portals ?? []).forEach((p, i) => this.portal(p, `portals[${i}]`, i));
    this.portalOverlaps();
    for (const [i, s] of (this.pkg.scenes ?? []).entries()) {
      this.walkTarget(s.id, s.defaultSpot, `scenes[${i}].defaultSpot`);
      (s.actorZones ?? []).forEach((z, j) => this.walkTarget(s.id, z.talkSpot, `scenes[${i}].actorZones[${j}].talkSpot`));
    }
    for (const ixn of this.ix.nodes.values()) this.node(ixn);
    validateMedia(this.pkg, [...this.ix.nodes.values()].map((ixn) => ({ node: ixn.node, path: ixn.path })), this.d);
    validateSaveMigrations(this.pkg, this.d);
    this.reachability();
    for (const [name, path] of [...this.readVars].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      const initial = this.pkg.game.globals ?? {};
      if (!this.writtenVars.has(name) && !Object.prototype.hasOwnProperty.call(initial, name)) {
        this.d.warn(C.VarReadonly, path, `variable "${name}" is read but never written and has no initial value`);
      }
    }
  }

  private entryRef(ref: unknown, path: string): void {
    if (ref === null || ref === undefined) return;
    if (!isStr(ref)) {
      this.d.error(C.Entry, path, "entry must be a \"<graph>#<entry>\" string or null");
      return;
    }
    const [graphId, name] = ref.split("#");
    if (name === undefined) {
      this.d.error(C.Entry, path, `entry "${ref}" must have the form "<graph>#<entry>"`);
      return;
    }
    if (this.ix.entries.has(ref)) return;
    // The name may be the id of a non-entry node in that graph.
    const byId = this.ix.nodes.get(name);
    if (byId !== undefined && byId.graph.id === graphId) this.d.error(C.Entry, path, `"${ref}" does not point at an entry node`);
    else this.d.error(C.Ref, path, `unknown entry "${ref}"`);
  }

  private game(): void {
    const g = this.pkg.game;
    this.entryRef(g.entry, "game.entry");
    if (!g.languages.includes(g.defaultLanguage)) this.d.error(C.Ref, "game.defaultLanguage", "defaultLanguage is not in languages");
    for (const [name, value] of Object.entries(g.globals ?? {})) {
      if (!VAR_NAME.test(name)) this.d.error(C.VarName, `game.globals.${name}`, `invalid variable name "${name}"`);
      if (!isValue(value)) this.d.error(C.Schema, `game.globals.${name}`, "global values must be boolean, number or string");
    }
    if (g.viewport !== undefined && !(isObj(g.viewport) && positive(g.viewport.width) && positive(g.viewport.height))) {
      this.d.error(C.Viewport, "game.viewport", "viewport must be {width, height} with numbers > 0");
    }
    this.ui(g.ui);
    if (g.player !== undefined) {
      const actor = this.ix.actors.get(g.player.actor);
      if (actor === undefined) this.d.error(C.Ref, "game.player.actor", `unknown player actor "${g.player.actor}"`);
      else if (actor.scene === null || actor.scene === undefined) {
        this.d.error(C.PlayerScene, "game.player.actor", "the player actor must start in a scene");
      }
    }
  }

  /** spec 07 §7: counts and sizes are numbers > 0, durations ≥ 0, flags booleans. */
  private ui(ui: unknown): void {
    if (ui === undefined) return;
    if (!isObj(ui)) return this.d.error(C.Schema, "game.ui", "ui must be an object");
    const slots = ui["inventorySlots"];
    if (slots !== undefined && !(Number.isInteger(slots) && positive(slots))) this.d.error(C.Number, "game.ui.inventorySlots", "inventorySlots must be an integer > 0");
    if (ui["inventoryHeight"] !== undefined && !positive(ui["inventoryHeight"])) this.d.error(C.Number, "game.ui.inventoryHeight", "inventoryHeight must be a number > 0");
    for (const key of ["fadeMs", "clickFeedbackMs"] as const) {
      const v = ui[key];
      if (v !== undefined && !(typeof v === "number" && Number.isFinite(v) && v >= 0)) this.d.error(C.Number, `game.ui.${key}`, `${key} must be a number ≥ 0`);
    }
    for (const key of ["reactWhenNothingHappens", "playerLinesAsMenu"] as const) {
      if (ui[key] !== undefined && typeof ui[key] !== "boolean") this.d.error(C.Schema, `game.ui.${key}`, `${key} must be a boolean`);
    }
    const keys = ui["cannotTextKeys"];
    if (keys !== undefined && !(Array.isArray(keys) && keys.every(isStr))) this.d.error(C.Schema, "game.ui.cannotTextKeys", "cannotTextKeys must be an array of text keys");
  }

  private facing(value: unknown, path: string): void {
    if (value === undefined) return;
    if (!FACINGS.includes(value as never)) this.d.error(C.Facing, path, `unknown facing "${String(value)}"`);
  }

  private poly(polygon: unknown, path: string): boolean {
    const problem = polygonProblem(polygon as never);
    if (problem !== null) {
      this.d.error(C.Polygon, path, problem);
      return false;
    }
    return true;
  }

  private spotIn(sceneId: string | null | undefined, spot: string | undefined, path: string): void {
    if (spot === undefined || sceneId === null || sceneId === undefined) return;
    const scene = this.ix.scenes.get(sceneId);
    if (scene !== undefined && !Object.prototype.hasOwnProperty.call(scene.spots ?? {}, spot)) {
      this.d.error(C.Ref, path, `unknown spot "${spot}" in scene "${sceneId}"`);
    }
  }

  /** Scene size, falling back to the viewport (spec 03 C1). */
  private size(s: SceneDef): { width: number; height: number } {
    const vp = this.pkg.game.viewport;
    const fallback = isObj(vp) && positive(vp.width) && positive(vp.height) ? vp : DEFAULT_VIEWPORT;
    return isObj(s.size) && positive(s.size.width) && positive(s.size.height) ? s.size : fallback;
  }

  private scene(s: SceneDef, path: string): void {
    this.entryRef(s.entry, `${path}.entry`);
    if (s.size !== undefined && !(isObj(s.size) && positive(s.size.width) && positive(s.size.height))) {
      this.d.error(C.SceneSize, `${path}.size`, "size must be {width, height} with numbers > 0");
    }
    const { width, height } = this.size(s);
    if (s.camera !== undefined) {
      const cam = (isObj(s.camera) ? s.camera : {}) as Record<string, unknown>;
      for (const prob of cameraProblems({ ...cam, width, planeHeight: height })) this.d.error(C.Camera, `${path}.camera.${prob.field}`, prob.message);
      if (!positive(cam["speed"])) this.d.error(C.Camera, `${path}.camera.speed`, "speed must be a number > 0");
    }
    if (s.walkSpeed !== undefined && !positive(s.walkSpeed)) this.d.error(C.Number, `${path}.walkSpeed`, "walkSpeed must be a number > 0");
    for (const [name, spot] of Object.entries(s.spots ?? {})) {
      const sp = `${path}.spots.${name}`;
      if (!isObj(spot) || !Number.isFinite(spot.x) || !Number.isFinite(spot.y)) {
        this.d.error(C.Spot, sp, "spot needs finite x and y");
        continue;
      }
      this.facing(spot.facing, `${sp}.facing`);
      if (spot.x < 0 || spot.y < 0 || spot.x > width || spot.y > height) this.d.error(C.Spot, sp, `spot (${spot.x}, ${spot.y}) lies outside the scene (${width} x ${height})`);
      if (spot.height !== undefined && !positive(spot.height)) this.d.error(C.Spot, `${sp}.height`, "spot height must be a number > 0");
    }
    const triggerIds = new Set<string>();
    (s.triggerZones ?? []).forEach((z, i) => {
      if (triggerIds.has(z.id)) this.d.error(C.DuplicateId, `${path}.triggerZones[${i}].id`, `duplicate trigger zone id "${z.id}"`);
      triggerIds.add(z.id);
    });
    if (s.defaultSpot !== undefined) this.spotIn(s.id, s.defaultSpot, `${path}.defaultSpot`);
    (s.walkable ?? []).forEach((p, i) => this.poly(p, `${path}.walkable[${i}]`));
    (s.blockers ?? []).forEach((p, i) => this.poly(p, `${path}.blockers[${i}]`));
    const objectZones: Array<{ poly: unknown; path: string; priority: number | undefined }> = [];
    (s.objectZones ?? []).forEach((z, i) => {
      const zp = `${path}.objectZones[${i}]`;
      const variants = this.ix.variantsOf(z.entity);
      if (variants === undefined || this.ix.scenes.has(z.entity)) this.d.error(C.Ref, `${zp}.entity`, `unknown object/actor "${z.entity}"`);
      else if (z.variant !== undefined && !variants.includes(z.variant)) this.d.error(C.Ref, `${zp}.variant`, `unknown variant "${z.variant}"`);
      if (z.nameKey !== undefined) this.textKey(z.nameKey, `${zp}.nameKey`);
      if (this.poly(z.polygon, `${zp}.polygon`)) objectZones.push({ poly: z.polygon, path: zp, priority: z.priority });
    });
    const actorZones: Array<{ poly: unknown; path: string; priority: number | undefined }> = [];
    (s.actorZones ?? []).forEach((z, i) => {
      const zp = `${path}.actorZones[${i}]`;
      const actor = this.ix.actors.get(z.actor);
      if (actor === undefined) this.d.error(C.Ref, `${zp}.actor`, `unknown actor "${z.actor}"`);
      else if (z.variant !== undefined && !Object.keys(actor.variants).includes(z.variant)) {
        this.d.error(C.Ref, `${zp}.variant`, `unknown variant "${z.variant}"`);
      }
      this.spotIn(s.id, z.talkSpot, `${zp}.talkSpot`);
      if (this.poly(z.polygon, `${zp}.polygon`)) actorZones.push({ poly: z.polygon, path: zp, priority: z.priority });
    });
    (s.triggerZones ?? []).forEach((z, i) => {
      this.entryRef(z.entry, `${path}.triggerZones[${i}].entry`);
      this.poly(z.polygon, `${path}.triggerZones[${i}].polygon`);
    });
    for (const zones of [objectZones, actorZones]) {
      for (let i = 0; i < zones.length; i++) {
        for (let j = i + 1; j < zones.length; j++) {
          const a = zones[i] as (typeof zones)[number];
          const b = zones[j] as (typeof zones)[number];
          if (a.priority !== undefined && b.priority !== undefined && a.priority !== b.priority) continue;
          if (polygonsOverlap(a.poly as never, b.poly as never)) {
            this.d.warn(C.ZoneOverlap, b.path, `zone overlaps ${a.path} in the same category without distinct priority`);
          }
        }
      }
    }
  }

  private actor(a: ActorDef, path: string): void {
    if (!isObj(a.variants) || !Object.prototype.hasOwnProperty.call(a.variants, "default")) {
      this.d.error(C.Ref, `${path}.variants`, "variant \"default\" is required");
    }
    this.entryRef(a.entry, `${path}.entry`);
    if (a.scene !== null && a.scene !== undefined && !this.ix.scenes.has(a.scene)) this.d.error(C.Ref, `${path}.scene`, `unknown scene "${a.scene}"`);
    this.spotIn(a.scene, a.spot, `${path}.spot`);
    this.walkTarget(a.scene, a.spot, `${path}.spot`);
    if (a.nameKey !== undefined) this.textKey(a.nameKey, `${path}.nameKey`);
    if (a.referenceHeight !== undefined && !positive(a.referenceHeight)) this.d.error(C.Number, `${path}.referenceHeight`, "referenceHeight must be a number > 0");
    if (a.hitBox !== undefined && !(isObj(a.hitBox) && positive(a.hitBox.width) && positive(a.hitBox.height))) {
      this.d.error(C.Number, `${path}.hitBox`, "hitBox must be {width, height} with numbers > 0");
    }
    if (a.dialog !== undefined) {
      this.entryRef(a.dialog, `${path}.dialog`);
      const nodeId = this.ix.entries.get(a.dialog);
      if (nodeId !== undefined && this.ix.nodes.get(nodeId)?.graph.kind !== "dialog") {
        this.d.error(C.Entry, `${path}.dialog`, "an actor's dialog must point at an entry in a dialog graph");
      }
    }
  }

  private container(c: unknown, path: string): void {
    if (!isObj(c)) {
      this.d.error(C.Ref, path, "container must be {kind, id}");
      return;
    }
    const kind = c["kind"];
    if (kind === "none") return;
    if (kind === "scene" && isStr(c["id"]) && this.ix.scenes.has(c["id"])) return;
    if (kind === "actor" && isStr(c["id"]) && this.ix.actors.has(c["id"])) return;
    this.d.error(C.Ref, path, `unknown container ${JSON.stringify(c)}`);
  }

  private object(o: ObjectDef, path: string): void {
    if (!isObj(o.variants) || !Object.prototype.hasOwnProperty.call(o.variants, "default")) {
      this.d.error(C.Ref, `${path}.variants`, "variant \"default\" is required");
    }
    this.entryRef(o.entry, `${path}.entry`);
    this.container(o.container, `${path}.container`);
    if (isObj(o.container) && o.container.kind === "scene") this.spotIn(o.container.id, o.spot, `${path}.spot`);
    if (o.nameKey !== undefined) this.textKey(o.nameKey, `${path}.nameKey`);
  }

  private portal(p: PortalDef, path: string, index: number): void {
    for (const key of ["from", "to"] as const) {
      if (!this.ix.scenes.has(p[key])) this.d.error(C.Ref, `${path}.${key}`, `unknown scene "${p[key]}"`);
    }
    if (p.from === p.to) this.d.error(C.PortalSelf, path, `portal "${p.id}" leads from "${p.from}" to itself`);
    const twin = (this.pkg.portals ?? []).findIndex((q) => q.from === p.from && q.to === p.to && (q.index ?? 0) === (p.index ?? 0));
    if (twin !== index) this.d.error(C.PortalDup, path, `portal "${p.id}" duplicates (from, to, index) of portals[${twin}]`);
    this.walkTarget(p.from, p.exitSpot, `${path}.exitSpot`);
    this.walkTarget(p.to, p.entrySpot, `${path}.entrySpot`);
    this.walkTarget(p.to, p.arrivalSpot ?? undefined, `${path}.arrivalSpot`);
    this.entryRef(p.entry, `${path}.entry`);
    this.spotIn(p.from, p.exitSpot, `${path}.exitSpot`);
    this.spotIn(p.to, p.entrySpot, `${path}.entrySpot`);
    if (p.arrivalSpot !== undefined && p.arrivalSpot !== null) this.spotIn(p.to, p.arrivalSpot, `${path}.arrivalSpot`);
    if (p.polygon !== undefined) this.poly(p.polygon, `${path}.polygon`);
    const reverse = [...this.ix.portals.values()].some((q) => q.from === p.to && q.to === p.from && (q.index ?? 0) === (p.index ?? 0));
    if (!reverse && (p.arrivalSpot === undefined || p.arrivalSpot === null)) {
      this.d.error(C.PortalArrival, `${path}.arrivalSpot`, "a portal without a reverse portal must define arrivalSpot");
    }
    if (p.nameKey !== undefined) this.textKey(p.nameKey, `${path}.nameKey`);
    if (p.lockedKey !== undefined) this.textKey(p.lockedKey, `${path}.lockedKey`);
  }

  /** W-SPOT-UNWALKABLE: a spot used as a walk target should be walkable and below the horizon. */
  private walkTarget(sceneId: string | null | undefined, spot: string | undefined, path: string): void {
    if (spot === undefined || sceneId === null || sceneId === undefined) return;
    const scene = this.ix.scenes.get(sceneId);
    const def = scene?.spots?.[spot];
    if (scene === undefined || def === undefined || !Number.isFinite(def.x) || !Number.isFinite(def.y)) return;
    const point: Vec2 = [def.x, def.y];
    const walkable = (scene.walkable ?? []).filter((w) => polygonProblem(w) === null);
    const blockers = (scene.blockers ?? []).filter((b) => polygonProblem(b) === null);
    if (walkable.length > 0 && !isAllowed({ walkable, blockers }, point)) {
      this.d.warn(C.SpotUnwalkable, path, `spot "${spot}" is not inside the walkable area of "${sceneId}"; walking there projects to the nearest edge`);
    }
    const camera = this.cameraOf(scene);
    if (camera !== null && camera.screenToFloor(point) === null) this.d.warn(C.SpotUnwalkable, path, `spot "${spot}" lies above the camera horizon`);
  }

  private cameraOf(scene: SceneDef): Camera | null {
    if (!isObj(scene.camera)) return null;
    const { width, height } = this.size(scene);
    const params = { ...scene.camera, width, planeHeight: height };
    return cameraProblems(params).length === 0 ? new Camera(params) : null;
  }

  /** W-ZONE-OVERLAP for portal zones of the same scene. */
  private portalOverlaps(): void {
    const list = (this.pkg.portals ?? [])
      .map((p, i) => ({ p, path: `portals[${i}].polygon` }))
      .filter((x) => x.p.polygon !== undefined && polygonProblem(x.p.polygon) === null);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i] as (typeof list)[number];
        const b = list[j] as (typeof list)[number];
        if (a.p.from === b.p.from && polygonsOverlap(a.p.polygon as never, b.p.polygon as never)) {
          this.d.warn(C.ZoneOverlap, b.path, `portal zone overlaps ${a.path} in scene "${a.p.from}"`);
        }
      }
    }
  }

  private textKey(key: unknown, path: string): void {
    if (!isStr(key) || !this.ix.allKeys.has(key)) this.d.error(C.Ref, path, `unknown text key "${String(key)}"`);
  }

  private expr(e: unknown, path: string): void {
    if (!isObj(e)) {
      this.d.error(C.NodeType, path, "expression must be an object");
      return;
    }
    const keys = Object.keys(e);
    if (keys.length !== 1) {
      this.d.error(C.NodeType, path, "expression must have exactly one operator key");
      return;
    }
    const op = keys[0] as string;
    const arg = e[op];
    switch (op) {
      case "const":
        if (!isValue(arg)) this.d.error(C.NodeType, path, "const must be boolean, number or string");
        return;
      case "var":
        if (typeof arg !== "string" || !(VAR_NAME.test(arg) || CTX_NAME.test(arg))) {
          this.d.error(C.VarName, path, `invalid variable name "${String(arg)}"`);
        } else if (!arg.startsWith("$") && !this.readVars.has(arg)) {
          this.readVars.set(arg, path);
        }
        return;
      case "not":
        this.expr(arg, `${path}.not`);
        return;
      case "eq":
      case "neq":
      case "lt":
      case "lte":
      case "gt":
      case "gte":
        if (!Array.isArray(arg) || arg.length !== 2) {
          this.d.error(C.NodeType, path, `${op} needs exactly two operands`);
          return;
        }
        arg.forEach((a, i) => this.expr(a, `${path}.${op}[${i}]`));
        return;
      case "and":
      case "or":
        if (!Array.isArray(arg) || arg.length === 0) {
          this.d.error(C.NodeType, path, `${op} needs at least one operand`);
          return;
        }
        arg.forEach((a, i) => this.expr(a, `${path}.${op}[${i}]`));
        return;
      default:
        this.d.error(C.NodeType, path, `unknown expression operator "${op}"`);
    }
  }

  private node(ixn: IndexedNode): void {
    const { node, path } = ixn;
    const raw = node as unknown as Record<string, unknown>;
    const specs = (NODE_PARAMS as Record<string, readonly ParamSpec[] | undefined>)[node.type];
    if (specs === undefined) {
      this.d.error(C.NodeType, `${path}.type`, `unknown node type "${node.type}"`);
      return;
    }
    for (const e of ixn.edges) {
      if (!this.ix.nodes.has(e.to)) this.d.error(C.Ref, `${path}.next`, `edge to unknown node "${e.to}"`);
    }
    for (const spec of specs) {
      const value = raw[spec.name];
      const pp = `${path}.${spec.name}`;
      if (value === undefined) {
        if (spec.optional !== true) this.d.error(C.NodeType, pp, `missing parameter "${spec.name}" for ${node.type}`);
        continue;
      }
      this.param(spec, value, pp, ixn);
    }
    if (node.type === "return" && ixn.edges.length > 0) this.d.error(C.ReturnNext, `${path}.next`, "return must not have successors");
    if (node.type === "delay" && typeof raw["minMs"] === "number" && typeof raw["maxMs"] === "number" && raw["minMs"] > raw["maxMs"]) {
      this.d.error(C.NodeType, path, "delay minMs must be <= maxMs");
    }
    if (node.type === "portal_use" && raw["portal"] === undefined && raw["toScene"] === undefined) {
      this.d.error(C.NodeType, path, "portal_use needs portal or toScene");
    }
    if (node.type === "set_variant" && isStr(raw["entity"]) && isStr(raw["variant"])) {
      const variants = this.ix.variantsOf(raw["entity"]);
      if (variants !== undefined && !variants.includes(raw["variant"])) {
        this.d.error(C.Ref, `${path}.variant`, `unknown variant "${raw["variant"]}" for "${raw["entity"]}"`);
      }
    }
    if (node.type === "walk_to" && isStr(raw["spot"])) {
      const scene = isStr(raw["scene"]) ? raw["scene"] : undefined;
      this.anySpot(raw["spot"], scene, `${path}.spot`);
    }
    if (node.type === "move_actor" && isStr(raw["spot"]) && isStr(raw["scene"])) this.spotIn(raw["scene"], raw["spot"], `${path}.spot`);
    if (node.type === "move_object" && isStr(raw["spot"])) {
      const to = raw["to"] as ContainerRef | undefined;
      if (isObj(to) && to.kind === "scene") this.spotIn(to.id, raw["spot"], `${path}.spot`);
    }
    if (node.type === "choice") this.choice(ixn);
  }

  private anySpot(spot: string, scene: string | undefined, path: string): void {
    if (scene !== undefined) {
      this.spotIn(scene, spot, path);
      return;
    }
    const found = [...this.ix.scenes.values()].some((s) => Object.prototype.hasOwnProperty.call(s.spots ?? {}, spot));
    if (!found) this.d.error(C.Ref, path, `spot "${spot}" does not exist in any scene`);
  }

  private param(spec: ParamSpec, value: unknown, path: string, ixn: IndexedNode): void {
    const bad = (what: string): void => this.d.error(C.NodeType, path, `parameter "${spec.name}" must be ${what}`);
    const ref = (ok: boolean, what: string): void => {
      if (!isStr(value)) bad(`a ${what} id`);
      else if (!ok) this.d.error(C.Ref, path, `unknown ${what} "${value}"`);
    };
    switch (spec.kind) {
      case "str":
      case "spot":
        if (!isStr(value)) bad("a non-empty string");
        return;
      case "bool":
        if (typeof value !== "boolean") bad("a boolean");
        return;
      case "num":
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0) bad("a finite number >= 0");
        return;
      case "value":
        if (!isValue(value)) bad("boolean, number or string");
        return;
      case "expr":
        this.expr(value, path);
        return;
      case "var":
        if (typeof value === "string" && value.startsWith("$")) this.d.error(C.CtxWrite, path, `cannot write context key "${value}"`);
        else if (typeof value !== "string" || !VAR_NAME.test(value)) this.d.error(C.VarName, path, `invalid variable name "${String(value)}"`);
        else this.writtenVars.add(value);
        return;
      case "actor":
        ref(isStr(value) && this.ix.actors.has(value), "actor");
        return;
      case "object":
        ref(isStr(value) && this.ix.objects.has(value), "object");
        return;
      case "entity":
        ref(isStr(value) && this.ix.variantsOf(value) !== undefined, "entity");
        return;
      case "scene":
        ref(isStr(value) && this.ix.scenes.has(value), "scene");
        return;
      case "portal":
        ref(isStr(value) && this.ix.portals.has(value), "portal");
        return;
      case "container":
        this.container(value, path);
        return;
      case "textKey":
        this.textKey(value, path);
        return;
      case "useKind":
        if (value !== "object" && value !== "actor" && value !== "inventory") bad("object|actor|inventory");
        return;
      case "delayMode":
        if (value !== "block" && value !== "background") bad("block|background");
        return;
      case "times":
        if (value !== "loop" && (typeof value !== "number" || !Number.isInteger(value) || value < 1)) bad("an integer >= 1 or \"loop\"");
        return;
      case "entryName": {
        if (!isStr(value)) {
          bad("an entry name");
          return;
        }
        if (this.ix.resolveEntry(value, ixn.graph.id) === undefined) this.d.error(C.Ref, path, `unknown dialog entry "${value}"`);
        return;
      }
    }
  }

  /** E-CHOICE-SET and W-CHOICE-EMPTY (spec 02 B7). */
  private choice(ixn: IndexedNode): void {
    let options = 0;
    let unguardedOptions = 0;
    const visited = new Set<string>();
    const stack: Array<{ id: string; guarded: boolean }> = ixn.edges.map((e) => ({ id: e.to, guarded: false })).reverse();
    while (stack.length > 0) {
      const { id, guarded } = stack.pop() as { id: string; guarded: boolean };
      const key = `${id}:${guarded}`;
      if (visited.has(key)) continue;
      visited.add(key);
      const n = this.ix.nodes.get(id);
      if (n === undefined) continue;
      if (n.node.type === "guard") {
        for (const e of [...n.edges].reverse()) stack.push({ id: e.to, guarded: true });
      } else if (n.node.type === "say") {
        options++;
        if (!guarded) unguardedOptions++;
      } else if (n.node.type === "set") {
        // A set that leads to an option (directly or through guards) sits "between" the choice and the option.
        const inner: string[] = n.edges.map((e) => e.to);
        const seen = new Set<string>();
        while (inner.length > 0) {
          const cur = inner.pop() as string;
          if (seen.has(cur)) continue;
          seen.add(cur);
          const m = this.ix.nodes.get(cur);
          if (m === undefined) continue;
          if (m.node.type === "say") {
            this.d.error(C.ChoiceSet, n.path, `set "${n.node.id}" sits between choice "${ixn.node.id}" and option "${cur}"`);
            break;
          }
          if (m.node.type === "guard" || m.node.type === "set") for (const e of m.edges) inner.push(e.to);
        }
      }
    }
    if (unguardedOptions === 0) {
      this.d.warn(
        C.ChoiceEmpty,
        ixn.path,
        options === 0 ? `choice "${ixn.node.id}" has no options` : `all options of choice "${ixn.node.id}" are guarded; the menu can end up empty`,
      );
    }
  }

  /** W-UNREACHABLE: nodes not reachable from any entry node. */
  private reachability(): void {
    const reached = new Set<string>();
    const stack: string[] = [];
    for (const [id, ixn] of this.ix.nodes) if (ixn.node.type === "entry") stack.push(id);
    while (stack.length > 0) {
      const id = stack.pop() as string;
      if (reached.has(id)) continue;
      reached.add(id);
      for (const e of this.ix.nodes.get(id)?.edges ?? []) stack.push(e.to);
    }
    for (const [id, ixn] of this.ix.nodes) {
      if (!reached.has(id)) this.d.warn(C.Unreachable, ixn.path, `node "${id}" cannot be reached from any entry`);
    }
  }
}

export const DEFAULT_VIEWPORT = { width: 1280, height: 720 } as const;

function positive(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

export function isValue(v: unknown): v is boolean | number | string {
  return typeof v === "boolean" || typeof v === "string" || (typeof v === "number" && Number.isFinite(v));
}
