/**
 * The editable shapes of a scene as one list (walk areas, blockers, zones,
 * portal polygons, spots, speech/portrait regions) with getters and setters
 * that return a new project. Pure helpers for the scene tab.
 */

import type { Project } from "@adventure-engine/content-tools";
import type { SceneDef } from "@adventure-engine/content";
import type { ShapeRef } from "../store.ts";

export type Pt = readonly [number, number];
export type Poly = readonly Pt[];
export type Rect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

export type LayerName = ShapeRef["layer"];

export const LAYERS: ReadonlyArray<readonly [LayerName, string]> = [
  ["walkable", "Gangområder"],
  ["blockers", "Blokeringer"],
  ["objectZones", "Objektzoner"],
  ["actorZones", "Aktørzoner"],
  ["triggerZones", "Triggerzoner"],
  ["portals", "Portalzoner"],
  ["spots", "Spots"],
  ["speechRegions", "Taleregioner"],
  ["portraitRegions", "Portrætregioner"],
];

export const DRAWABLE: readonly LayerName[] = ["walkable", "blockers", "objectZones", "actorZones", "triggerZones", "portals"];

export interface Shape {
  readonly ref: ShapeRef;
  readonly label: string;
  readonly poly: Poly | null;
  readonly rect: Rect | null;
  readonly point: Pt | null;
}

export const sameRef = (a: ShapeRef | null, b: ShapeRef | null): boolean => a !== null && b !== null && JSON.stringify(a) === JSON.stringify(b);
export const refKey = (r: ShapeRef): string => ("index" in r ? `${r.layer}:${r.index}` : `${r.layer}:${r.id}`);

const rectOf = (v: unknown): Rect | null => {
  if (typeof v !== "object" || v === null) return null;
  const r = v as Record<string, unknown>;
  return [r["x"], r["y"], r["width"], r["height"]].every((n) => typeof n === "number") ? (v as Rect) : null;
};

export function sceneOf(p: Project, id: string | null): SceneDef | null {
  return p.scenes.find((s) => s.id === id) ?? null;
}

export function shapesOf(p: Project, scene: SceneDef): Shape[] {
  const out: Shape[] = [];
  const poly = (ref: ShapeRef, label: string, pl: Poly): void => void out.push({ ref, label, poly: pl, rect: null, point: null });
  (scene.walkable ?? []).forEach((pl, index) => poly({ layer: "walkable", index }, `Gangområde ${index + 1}`, pl));
  (scene.blockers ?? []).forEach((pl, index) => poly({ layer: "blockers", index }, `Blokering ${index + 1}`, pl));
  (scene.objectZones ?? []).forEach((z, index) => poly({ layer: "objectZones", index }, `Objekt: ${z.entity}`, z.polygon));
  (scene.actorZones ?? []).forEach((z, index) => poly({ layer: "actorZones", index }, `Aktør: ${z.actor}`, z.polygon));
  (scene.triggerZones ?? []).forEach((z, index) => poly({ layer: "triggerZones", index }, `Trigger: ${z.id}`, z.polygon));
  for (const pt of p.portals) if (pt.from === scene.id && pt.polygon !== undefined) poly({ layer: "portals", id: pt.id }, `Portal: ${pt.id} → ${pt.to}`, pt.polygon);
  for (const [name, s] of Object.entries(scene.spots ?? {})) out.push({ ref: { layer: "spots", id: name }, label: `Spot: ${name}`, poly: null, rect: null, point: [s.x, s.y] });
  for (const layer of ["speechRegions", "portraitRegions"] as const) {
    for (const [actor, r] of Object.entries(scene[layer] ?? {})) {
      const rect = rectOf(r);
      if (rect !== null) out.push({ ref: { layer, id: actor }, label: `${layer === "speechRegions" ? "Tale" : "Portræt"}: ${actor}`, poly: null, rect, point: null });
    }
  }
  return out;
}

export function shapeOf(p: Project, scene: SceneDef, ref: ShapeRef | null): Shape | null {
  return ref === null ? null : (shapesOf(p, scene).find((s) => sameRef(s.ref, ref)) ?? null);
}

/** Update one scene of the project. */
export function withScene(p: Project, id: string, f: (s: SceneDef) => SceneDef): Project {
  return { ...p, scenes: p.scenes.map((s) => (s.id === id ? f(s) : s)) };
}

const replaceAt = (list: readonly Poly[] | undefined, i: number, v: Poly): Poly[] => (list ?? []).map((x, k) => (k === i ? v : x));

/** Set the polygon of a polygon shape. */
export function setPoly(p: Project, sceneId: string, ref: ShapeRef, poly: Poly): Project {
  const pl = poly.map((q) => [q[0], q[1]] as [number, number]);
  switch (ref.layer) {
    case "walkable":
    case "blockers":
      return withScene(p, sceneId, (s) => ({ ...s, [ref.layer]: replaceAt(ref.layer === "walkable" ? s.walkable : s.blockers, ref.index, pl) }));
    case "objectZones":
      return withScene(p, sceneId, (s) => ({ ...s, objectZones: (s.objectZones ?? []).map((z, k) => (k === ref.index ? { ...z, polygon: pl } : z)) }));
    case "actorZones":
      return withScene(p, sceneId, (s) => ({ ...s, actorZones: (s.actorZones ?? []).map((z, k) => (k === ref.index ? { ...z, polygon: pl } : z)) }));
    case "triggerZones":
      return withScene(p, sceneId, (s) => ({ ...s, triggerZones: (s.triggerZones ?? []).map((z, k) => (k === ref.index ? { ...z, polygon: pl } : z)) }));
    case "portals":
      return { ...p, portals: p.portals.map((x) => (x.id === ref.id ? { ...x, polygon: pl } : x)) };
    default:
      throw new RangeError(`${ref.layer} is not a polygon`);
  }
}

export function setSpotPos(p: Project, sceneId: string, name: string, pos: Pt): Project {
  return withScene(p, sceneId, (s) => {
    const spot = s.spots?.[name];
    if (spot === undefined) throw new RangeError(`no spot "${name}"`);
    return { ...s, spots: { ...s.spots, [name]: { ...spot, x: pos[0], y: pos[1] } } };
  });
}

export function setRegion(p: Project, sceneId: string, layer: "speechRegions" | "portraitRegions", actor: string, rect: Rect): Project {
  return withScene(p, sceneId, (s) => ({ ...s, [layer]: { ...(s[layer] ?? {}), [actor]: rect } }));
}

/** Remove a shape (spots are removed through the guarded delete instead). */
export function removeShape(p: Project, sceneId: string, ref: ShapeRef): Project {
  switch (ref.layer) {
    case "walkable":
    case "blockers":
    case "objectZones":
    case "actorZones":
    case "triggerZones":
      return withScene(p, sceneId, (s) => ({ ...s, [ref.layer]: ((s[ref.layer] ?? []) as unknown[]).filter((_, k) => k !== ref.index) }));
    case "portals":
      return { ...p, portals: p.portals.map((x) => (x.id === ref.id ? dropPolygon(x) : x)) };
    case "speechRegions":
    case "portraitRegions":
      return withScene(p, sceneId, (s) => ({ ...s, [ref.layer]: Object.fromEntries(Object.entries(s[ref.layer] ?? {}).filter(([k]) => k !== ref.id)) }));
    default:
      throw new RangeError("spots are deleted with their references checked");
  }
}

function dropPolygon<T extends { polygon?: unknown }>(x: T): T {
  const out = { ...x };
  delete out.polygon;
  return out;
}

/** Add a polygon shape in a layer; returns the project and the new shape's ref. */
export function addPolygon(p: Project, sceneId: string, layer: LayerName, poly: Poly): { project: Project; ref: ShapeRef } {
  const pl = poly.map((q) => [q[0], q[1]] as [number, number]);
  const scene = sceneOf(p, sceneId);
  if (scene === null) throw new RangeError(`no scene "${sceneId}"`);
  switch (layer) {
    case "walkable":
    case "blockers": {
      const list = scene[layer] ?? [];
      return { project: withScene(p, sceneId, (s) => ({ ...s, [layer]: [...list, pl] })), ref: { layer, index: list.length } };
    }
    case "objectZones": {
      const used = new Set((scene.objectZones ?? []).map((z) => z.entity));
      const entity = p.objects.find((o) => !used.has(o.id))?.id ?? p.objects[0]?.id ?? p.actors[0]?.id;
      if (entity === undefined) throw new RangeError("opret først et objekt");
      const list = scene.objectZones ?? [];
      return { project: withScene(p, sceneId, (s) => ({ ...s, objectZones: [...list, { entity, polygon: pl }] })), ref: { layer, index: list.length } };
    }
    case "actorZones": {
      const actor = p.actors.find((a) => a.id !== p.game.player?.actor)?.id ?? p.actors[0]?.id;
      if (actor === undefined) throw new RangeError("opret først en aktør");
      const list = scene.actorZones ?? [];
      return { project: withScene(p, sceneId, (s) => ({ ...s, actorZones: [...list, { actor, polygon: pl }] })), ref: { layer, index: list.length } };
    }
    case "triggerZones": {
      const list = scene.triggerZones ?? [];
      const taken = new Set(p.scenes.flatMap((s) => (s.triggerZones ?? []).map((z) => z.id)));
      let n = list.length + 1;
      while (taken.has(`trigger_${n}`)) n++;
      return { project: withScene(p, sceneId, (s) => ({ ...s, triggerZones: [...list, { id: `trigger_${n}`, entry: null, polygon: pl }] })), ref: { layer, index: list.length } };
    }
    case "portals": {
      const to = p.scenes.find((s) => s.id !== sceneId)?.id;
      if (to === undefined) throw new RangeError("en portal kræver mindst to scener");
      const ids = new Set(p.portals.map((x) => x.id));
      let n = 1;
      while (ids.has(`portal_${n}`)) n++;
      const id = `portal_${n}`;
      return { project: { ...p, portals: [...p.portals, { id, from: sceneId, to, entry: null, polygon: pl }] }, ref: { layer: "portals", id } };
    }
    default:
      throw new RangeError(`${layer} is not drawn as a polygon`);
  }
}

export function addSpot(p: Project, sceneId: string, pos: Pt): { project: Project; name: string } {
  const scene = sceneOf(p, sceneId);
  if (scene === null) throw new RangeError(`no scene "${sceneId}"`);
  let n = Object.keys(scene.spots ?? {}).length + 1;
  while (scene.spots?.[`spot_${n}`] !== undefined) n++;
  const name = `spot_${n}`;
  return { project: withScene(p, sceneId, (s) => ({ ...s, spots: { ...(s.spots ?? {}), [name]: { x: pos[0], y: pos[1] } } })), name };
}

/** Editor metadata key of a layer of a scene. */
export const layerKey = (scene: string, layer: LayerName): string => `${scene}/${layer}`;

export function layerState(p: Project, scene: string, layer: LayerName): { visible: boolean; locked: boolean } {
  const s = p.editor.layers?.[layerKey(scene, layer)];
  return { visible: s?.visible !== false, locked: s?.locked === true };
}

export function setLayerState(p: Project, scene: string, layer: LayerName, change: { visible?: boolean; locked?: boolean }): Project {
  const key = layerKey(scene, layer);
  const cur = layerState(p, scene, layer);
  return { ...p, editor: { ...p.editor, layers: { ...(p.editor.layers ?? {}), [key]: { ...cur, ...change } } } };
}
