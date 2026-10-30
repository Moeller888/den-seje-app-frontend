/**
 * References inside a project (phase 6, docs/decisions/phase-6.md §7): every
 * field that names another element is listed once here, as a "slot". The
 * editor uses the slots to show all references of an element, to rename an
 * element together with its references, and to refuse deleting an element
 * that is still referenced.
 */

import type { ContainerRef, Expr, GraphDef, NodeDef } from "@adventure-engine/content";
import type { Project } from "./project.ts";

export type RefKind = "scene" | "entity" | "portal" | "graph" | "entry" | "node" | "textKey" | "asset" | "sound" | "animation" | "spot" | "variant" | "var";

export type Path = readonly (string | number)[];

export interface Slot {
  readonly kind: RefKind;
  /** The referenced id (for entries the full "<graph>#<name>"). */
  readonly value: string;
  /** Spots: the scene ("*" = any scene); variants: the entity or scene. */
  readonly scope?: string;
  /** Where the reference is. */
  readonly path: Path;
  /** "value": the field holds the id; "key": the id is a key of the object at `path`. */
  readonly at: "value" | "key" | "definition";
  /** dialog_push.entryName written without its graph: the graph it is relative to. */
  readonly localTo?: string;
  /** An "entity" parameter that may also name a scene (sounds, animations and variants of scenes). */
  readonly alsoScene?: boolean;
}

export interface RefTarget {
  readonly kind: RefKind;
  readonly id: string;
  readonly scope?: string;
}

const NODE_FIELDS: Readonly<Record<string, ReadonlyArray<readonly [string, RefKind]>>> = {
  move_object: [["object", "entity"]],
  move_actor: [["actor", "entity"], ["scene", "scene"]],
  set_variant: [["entity", "entity"]],
  rename: [["object", "entity"], ["nameKey", "textKey"]],
  portal_lock: [["portal", "portal"]],
  player_set: [["actor", "entity"]],
  interact: [["object", "entity"]],
  walk_to: [["actor", "entity"], ["scene", "scene"]],
  talk: [["actor", "entity"], ["target", "entity"]],
  use_item: [["item", "entity"], ["target", "entity"]],
  portal_use: [["portal", "portal"], ["toScene", "scene"], ["actor", "entity"]],
  stop_walk: [["actor", "entity"]],
  say: [["speaker", "entity"], ["textKey", "textKey"]],
  dialog_push: [["actor", "entity"]],
  dialog_pop: [["actor", "entity"]],
  play_animation: [["entity", "entity"], ["animation", "animation"]],
  sound_play: [["entity", "entity"], ["sound", "sound"]],
  sound_stop: [["entity", "entity"], ["sound", "sound"]],
};

const graphOfRef = (ref: string): string => ref.slice(0, ref.indexOf("#"));

/** All reference slots of a project, in a fixed order. */
export function slots(p: Project): Slot[] {
  const out: Slot[] = [];
  const v = (kind: RefKind, value: unknown, path: Path, extra: Partial<Slot> = {}): void => {
    if (typeof value === "string" && value !== "") out.push({ kind, value, path, at: "value", ...extra });
  };
  const keys = (kind: RefKind, map: Readonly<Record<string, unknown>> | undefined, path: Path, scope?: string): void => {
    for (const k of Object.keys(map ?? {})) out.push({ kind, value: k, path, at: "key", ...(scope !== undefined ? { scope } : {}) });
  };
  const container = (c: ContainerRef | undefined, path: Path): void => {
    if (c === undefined) return;
    if (c.kind === "scene") v("scene", c.id, [...path, "id"]);
    if (c.kind === "actor") v("entity", c.id, [...path, "id"]);
  };
  const variants = (map: Readonly<Record<string, { sprite?: string; portrait?: string; animations?: Readonly<Record<string, string>> }>>, path: Path, owner: string): void => {
    for (const [name, def] of Object.entries(map ?? {})) {
      out.push({ kind: "variant", value: name, scope: owner, path, at: "definition" });
      v("asset", def.sprite, [...path, name, "sprite"]);
      v("asset", def.portrait, [...path, name, "portrait"]);
      for (const [anim, id] of Object.entries(def.animations ?? {})) v("animation", id, [...path, name, "animations", anim]);
    }
  };

  // Game
  v("entity", p.game.player?.actor, ["game", "player", "actor"]);
  keys("var", p.game.globals, ["game", "globals"]);
  v("entry", p.game.entry ?? undefined, ["game", "entry"]);
  (p.game.ui?.cannotTextKeys ?? []).forEach((k, i) => v("textKey", k, ["game", "ui", "cannotTextKeys", i]));

  // Scenes
  p.scenes.forEach((s, si) => {
    const base: Path = ["scenes", si];
    out.push({ kind: "scene", value: s.id, path: [...base, "id"], at: "definition" });
    v("textKey", s.nameKey, [...base, "nameKey"]);
    v("entry", s.entry ?? undefined, [...base, "entry"]);
    for (const name of s.variants ?? []) out.push({ kind: "variant", value: name, scope: s.id, path: [...base, "variants"], at: "definition" });
    for (const name of Object.keys(s.spots ?? {})) out.push({ kind: "spot", value: name, scope: s.id, path: [...base, "spots"], at: "definition" });
    v("spot", s.defaultSpot, [...base, "defaultSpot"], { scope: s.id });
    (s.objectZones ?? []).forEach((z, i) => {
      v("entity", z.entity, [...base, "objectZones", i, "entity"]);
      v("variant", z.variant, [...base, "objectZones", i, "variant"], { scope: z.entity });
      v("textKey", z.nameKey, [...base, "objectZones", i, "nameKey"]);
    });
    (s.actorZones ?? []).forEach((z, i) => {
      v("entity", z.actor, [...base, "actorZones", i, "actor"]);
      v("variant", z.variant, [...base, "actorZones", i, "variant"], { scope: z.actor });
      v("spot", z.talkSpot, [...base, "actorZones", i, "talkSpot"], { scope: s.id });
    });
    (s.triggerZones ?? []).forEach((z, i) => v("entry", z.entry ?? undefined, [...base, "triggerZones", i, "entry"]));
    keys("entity", s.speechRegions, [...base, "speechRegions"]);
    keys("entity", s.portraitRegions, [...base, "portraitRegions"]);
    for (const [name, id] of Object.entries(s.sounds ?? {})) v("sound", id, [...base, "sounds", name]);
    (s.layers ?? []).forEach((l, i) => {
      for (const [variant, id] of Object.entries(l.assets ?? {})) v("asset", id, [...base, "layers", i, "assets", variant]);
    });
    for (const [name, c] of Object.entries(s.cutscenes ?? {})) {
      for (const [lang, cv] of Object.entries(c.variants ?? {})) {
        const cp: Path = [...base, "cutscenes", name, "variants", lang];
        v("asset", cv.video, [...cp, "video"]);
        (cv.timeline ?? []).forEach((f, k) => {
          v("asset", f.asset, [...cp, "timeline", k, "asset"]);
          v("textKey", f.textKey, [...cp, "timeline", k, "textKey"]);
        });
      }
    }
  });

  // Actors and objects
  p.actors.forEach((a, i) => {
    const base: Path = ["actors", i];
    out.push({ kind: "entity", value: a.id, path: [...base, "id"], at: "definition" });
    v("textKey", a.nameKey, [...base, "nameKey"]);
    v("scene", a.scene ?? undefined, [...base, "scene"]);
    v("spot", a.spot, [...base, "spot"], { scope: a.scene ?? "*" });
    v("entry", a.entry ?? undefined, [...base, "entry"]);
    v("entry", a.dialog, [...base, "dialog"]);
    variants(a.variants, [...base, "variants"], a.id);
    for (const [name, id] of Object.entries(a.sounds ?? {})) v("sound", id, [...base, "sounds", name]);
  });
  p.objects.forEach((o, i) => {
    const base: Path = ["objects", i];
    out.push({ kind: "entity", value: o.id, path: [...base, "id"], at: "definition" });
    v("textKey", o.nameKey, [...base, "nameKey"]);
    container(o.container, [...base, "container"]);
    v("spot", o.spot, [...base, "spot"], { scope: o.container?.kind === "scene" ? o.container.id : "*" });
    v("entry", o.entry ?? undefined, [...base, "entry"]);
    v("asset", o.icon, [...base, "icon"]);
    variants(o.variants, [...base, "variants"], o.id);
    for (const [name, id] of Object.entries(o.sounds ?? {})) v("sound", id, [...base, "sounds", name]);
  });

  // Portals
  p.portals.forEach((pt, i) => {
    const base: Path = ["portals", i];
    out.push({ kind: "portal", value: pt.id, path: [...base, "id"], at: "definition" });
    v("scene", pt.from, [...base, "from"]);
    v("scene", pt.to, [...base, "to"]);
    v("textKey", pt.nameKey, [...base, "nameKey"]);
    v("textKey", pt.lockedKey, [...base, "lockedKey"]);
    v("spot", pt.exitSpot, [...base, "exitSpot"], { scope: pt.from });
    v("spot", pt.entrySpot, [...base, "entrySpot"], { scope: pt.to });
    v("spot", pt.arrivalSpot ?? undefined, [...base, "arrivalSpot"], { scope: pt.to });
    v("entry", pt.entry ?? undefined, [...base, "entry"]);
  });

  // Graphs
  p.graphs.forEach((g, gi) => graphSlots(g, gi, out, v));

  // Media
  p.animations.forEach((a, i) => {
    out.push({ kind: "animation", value: a.id, path: ["animations", i, "id"], at: "definition" });
    v("asset", a.atlas, ["animations", i, "atlas"]);
    a.instructions.forEach((ins, k) => {
      if (ins.op === "signal") v("entity", ins.entity, ["animations", i, "instructions", k, "entity"]);
    });
  });
  p.sounds.forEach((s, i) => {
    out.push({ kind: "sound", value: s.id, path: ["sounds", i, "id"], at: "definition" });
    v("asset", s.asset, ["sounds", i, "asset"]);
  });

  // Translations and assets (definitions)
  for (const lang of Object.keys(p.i18n).sort()) keys("textKey", p.i18n[lang], ["i18n", lang]);
  keys("asset", p.assets, ["assets"]);
  keys("node", p.editor.nodes, ["editor", "nodes"]);
  return out;
}

function graphSlots(g: GraphDef, gi: number, out: Slot[], v: (kind: RefKind, value: unknown, path: Path, extra?: Partial<Slot>) => void): void {
  const base: Path = ["graphs", gi];
  out.push({ kind: "graph", value: g.id, path: [...base, "id"], at: "definition" });
  v("entity", g.owner, [...base, "owner"]);
  (g.actors ?? []).forEach((a, i) => v("entity", a, [...base, "actors", i]));
  g.nodes.forEach((n, ni) => {
    const np: Path = [...base, "nodes", ni];
    out.push({ kind: "node", value: n.id, path: [...np, "id"], at: "definition" });
    if (n.type === "entry") out.push({ kind: "entry", value: `${g.id}#${n.name}`, path: [...np, "name"], at: "definition", localTo: g.id });
    (n.next ?? []).forEach((e, ei) => v("node", typeof e === "string" ? e : e.to, typeof e === "string" ? [...np, "next", ei] : [...np, "next", ei, "to"]));
    for (const [field, kind] of NODE_FIELDS[n.type] ?? []) {
      v(kind, (n as unknown as Record<string, unknown>)[field], [...np, field], field === "entity" ? { alsoScene: true } : {});
    }
    nodeExtras(n, g, np, v);
  });
}

function nodeExtras(n: NodeDef, g: GraphDef, np: Path, v: (kind: RefKind, value: unknown, path: Path, extra?: Partial<Slot>) => void): void {
  switch (n.type) {
    case "move_object":
      for (const key of ["to", "from"] as const) {
        const c = n[key];
        if (c?.kind === "scene") v("scene", c.id, [...np, key, "id"]);
        if (c?.kind === "actor") v("entity", c.id, [...np, key, "id"]);
      }
      v("spot", n.spot, [...np, "spot"], { scope: n.to.kind === "scene" ? n.to.id : "*" });
      return;
    case "move_actor":
      v("spot", n.spot, [...np, "spot"], { scope: n.scene });
      return;
    case "walk_to":
      v("spot", n.spot, [...np, "spot"], { scope: n.scene ?? "*" });
      return;
    case "set_variant":
      v("variant", n.variant, [...np, "variant"], { scope: n.entity });
      return;
    case "dialog_push":
      if (n.entryName.includes("#")) v("entry", n.entryName, [...np, "entryName"]);
      else v("entry", `${g.id}#${n.entryName}`, [...np, "entryName"], { localTo: g.id });
      return;
    case "set":
      v("var", n.var, [...np, "var"]);
      return;
    case "guard":
      exprVars(n.expr, [...np, "expr"], v);
      return;
    default:
      return;
  }
}

function exprVars(e: Expr, path: Path, v: (kind: RefKind, value: unknown, path: Path) => void): void {
  if (typeof e !== "object" || e === null) return;
  if ("var" in e) {
    if (!e.var.startsWith("$")) v("var", e.var, [...path, "var"]);
    return;
  }
  if ("const" in e) return;
  if ("not" in e) {
    exprVars(e.not, [...path, "not"], v);
    return;
  }
  const [op, args] = Object.entries(e)[0] as [string, readonly Expr[]];
  args.forEach((a, i) => exprVars(a, [...path, op, i], v));
}

const matches = (s: Slot, t: RefTarget): boolean => {
  if (s.kind !== t.kind) {
    // A graph rename also touches every entry reference into it; scene renames touch entity parameters naming the scene.
    if (t.kind === "scene" && s.alsoScene === true) return s.value === t.id;
    return t.kind === "graph" && s.kind === "entry" && graphOfRef(s.value) === t.id;
  }
  if (s.value !== t.id) return false;
  if (t.scope === undefined || s.scope === undefined) return true;
  return s.scope === t.scope || s.scope === "*";
};

/** Every slot that refers to the target, without its own definition. */
export function references(p: Project, t: RefTarget): Slot[] {
  return slots(p).filter((s) => s.at !== "definition" && !(s.at === "key" && isDefinitionMap(s)) && matches(s, t));
}

/** Maps whose keys define the element (i18n tables, the asset manifest, editor node positions). */
const isDefinitionMap = (s: Slot): boolean => s.path[0] === "i18n" || s.path[0] === "assets" || s.path[0] === "editor" || (s.path[0] === "game" && s.path[1] === "globals");

/** Whether an id is defined in the project. */
export function isDefined(p: Project, t: RefTarget): boolean {
  return slots(p).some((s) => (s.at === "definition" || (s.at === "key" && isDefinitionMap(s))) && s.kind === t.kind && s.value === t.id && (t.scope === undefined || s.scope === undefined || s.scope === t.scope));
}

// ---------------------------------------------------------------------------
// Immutable updates
// ---------------------------------------------------------------------------

type Json = unknown;

function getIn(root: Json, path: Path): Json {
  let cur = root;
  for (const k of path) cur = (cur as Record<string | number, Json> | undefined)?.[k];
  return cur;
}

/** A copy of `root` with `path` set to `value` (copy-on-write along the path). */
export function setIn<T>(root: T, path: Path, value: Json): T {
  if (path.length === 0) return value as T;
  const [head, ...rest] = path as [string | number, ...(string | number)[]];
  const node = root as unknown as Record<string | number, Json> | Json[];
  const child = setIn((node as Record<string | number, Json>)[head], rest, value);
  if (Array.isArray(node)) {
    const copy = [...node];
    copy[head as number] = child;
    return copy as unknown as T;
  }
  return { ...(node as Record<string, Json>), [head]: child } as unknown as T;
}

/** A copy of `root` where the object at `path` has `from` renamed to `to`. */
export function renameKeyIn<T>(root: T, path: Path, from: string, to: string): T {
  const map = getIn(root, path) as Record<string, Json>;
  return setIn(root, path, Object.fromEntries(Object.entries(map).map(([k, val]) => [k === from ? to : k, val])));
}

export type RenameResult = { readonly ok: true; readonly project: Project; readonly changed: number } | { readonly ok: false; readonly message: string };

const ID_RULES: Partial<Record<RefKind, RegExp>> = {
  var: /^[a-z][a-z0-9_.]*$/,
};

/**
 * Rename an element and every reference to it in one step. Refuses an empty
 * id, an id that is already defined, and entry/var names that break the rules.
 */
export function rename(p: Project, t: RefTarget, to: string): RenameResult {
  if (to === "" || /[#\s]/.test(to)) return { ok: false, message: `"${to}" is not a valid id` };
  const rule = ID_RULES[t.kind];
  if (rule !== undefined && !rule.test(to)) return { ok: false, message: `"${to}" does not match ${rule.source}` };
  if ((t.kind === "spot" || t.kind === "variant") && t.scope === undefined) return { ok: false, message: `renaming a ${t.kind} needs its scene or entity` };
  if (to === t.id) return { ok: true, project: p, changed: 0 };
  const newTarget = t.kind === "entry" ? `${graphOfRef(t.id)}#${to}` : to;
  if (isDefined(p, { ...t, id: newTarget })) return { ok: false, message: `"${to}" is already used` };
  let out: Project = p;
  let changed = 0;
  for (const s of slots(p)) {
    if (!matches(s, t)) continue;
    changed++;
    if (s.at === "key") {
      out = renameKeyIn(out, s.path, s.value, to);
      continue;
    }
    if (s.kind === "variant" && s.at === "definition") {
      out = Array.isArray(getIn(out, s.path))
        ? setIn(out, s.path, (getIn(out, s.path) as string[]).map((x) => (x === s.value ? to : x)))
        : renameKeyIn(out, s.path, s.value, to);
      continue;
    }
    if (s.kind === "spot" && s.at === "definition") {
      out = renameKeyIn(out, s.path, s.value, to);
      continue;
    }
    let next: string;
    if (t.kind === "graph" && s.kind === "entry") next = `${to}${s.value.slice(s.value.indexOf("#"))}`;
    else if (t.kind === "entry") next = s.at === "definition" || s.localTo !== undefined ? to : newTarget;
    else next = to;
    // Entry references written relative to their graph stay relative.
    if (t.kind === "graph" && s.localTo !== undefined) continue;
    out = setIn(out, s.path, next);
  }
  return { ok: true, project: out, changed };
}

/** References that block deleting an element (empty: it can be deleted). */
export function deleteBlockers(p: Project, t: RefTarget): Slot[] {
  return references(p, t);
}

export type DeleteResult = { readonly ok: true; readonly project: Project } | { readonly ok: false; readonly blockers: readonly Slot[]; readonly message: string };

const without = <T>(list: readonly T[], keep: (x: T) => boolean): T[] => list.filter(keep);
const omit = <T>(map: Readonly<Record<string, T>> | undefined, key: string): Record<string, T> => {
  return Object.fromEntries(Object.entries(map ?? {}).filter(([k]) => k !== key));
};

/**
 * Delete an element. A referenced element is never deleted silently: the
 * result lists the references that must be removed or changed first.
 */
export function deleteElement(p: Project, t: RefTarget): DeleteResult {
  const blockers = deleteBlockers(p, t);
  if (blockers.length > 0) return { ok: false, blockers, message: `"${t.id}" is still referenced ${blockers.length} time(s)` };
  if (!isDefined(p, t)) return { ok: false, blockers: [], message: `"${t.id}" does not exist` };
  switch (t.kind) {
    case "scene":
      return { ok: true, project: { ...p, scenes: without(p.scenes, (s) => s.id !== t.id) } };
    case "entity":
      return { ok: true, project: { ...p, actors: without(p.actors, (a) => a.id !== t.id), objects: without(p.objects, (o) => o.id !== t.id) } };
    case "portal":
      return { ok: true, project: { ...p, portals: without(p.portals, (x) => x.id !== t.id) } };
    case "graph":
      return { ok: true, project: { ...p, graphs: without(p.graphs, (g) => g.id !== t.id) } };
    case "node":
      return {
        ok: true,
        project: { ...p, graphs: p.graphs.map((g) => ({ ...g, nodes: g.nodes.filter((n) => n.id !== t.id) })), editor: { ...p.editor, nodes: omit(p.editor.nodes, t.id) } },
      };
    case "textKey":
      return { ok: true, project: { ...p, i18n: Object.fromEntries(Object.entries(p.i18n).map(([lang, table]) => [lang, omit(table, t.id)])) } };
    case "asset":
      return { ok: true, project: { ...p, assets: omit(p.assets, t.id) } };
    case "sound":
      return { ok: true, project: { ...p, sounds: without(p.sounds, (s) => s.id !== t.id) } };
    case "animation":
      return { ok: true, project: { ...p, animations: without(p.animations, (a) => a.id !== t.id) } };
    case "spot":
      return { ok: true, project: { ...p, scenes: p.scenes.map((s) => (s.id === t.scope ? { ...s, spots: omit(s.spots, t.id) } : s)) } };
    case "var":
      return { ok: true, project: { ...p, game: { ...p.game, globals: omit(p.game.globals, t.id) } } };
    default:
      return { ok: false, blockers: [], message: `${t.kind} elements are removed where they are defined` };
  }
}
