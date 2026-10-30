/**
 * JSON Schemas for the project files and the runtime bundle (phase 6).
 *
 * Strategy (docs/decisions/phase-6.md §4):
 * - One source: the schemas are built here as data and are used both by the
 *   CLI/editor (structural validation, unknown fields) and by `content schema`
 *   (written out as draft-07 files).
 * - Node variants are generated from the loader's own `NODE_PARAMS`, so the
 *   parameter list of each node type cannot drift from the runtime validator.
 * - The rest is written here and tested against the loader (equivalence tests
 *   with valid and invalid synthetic fixtures, and with an independent JSON
 *   Schema implementation).
 * - The schema is structural only: references, graph rules, geometry and
 *   translations are checked by the engine validator (`loadContent`).
 */

import { FACINGS, NODE_PARAMS, SOUND_CHANNELS, VAR_NAME, type NodeType } from "@adventure-engine/content";

export type Schema = Readonly<Record<string, unknown>>;

export const PROJECT_FORMAT = "adventure-engine.project";
export const BUNDLE_FORMAT = "adventure-engine.bundle";
export const PROJECT_FORMAT_VERSION = 1;
export const BUNDLE_FORMAT_VERSION = 1;
/** Content package format version written into game.formatVersion (spec 07). */
export const CONTENT_FORMAT_VERSION = 1;

const ref = (name: string): Schema => ({ $ref: `#/definitions/${name}` });
const str: Schema = { type: "string" };
const id: Schema = { type: "string", minLength: 1 };
/** Ids that become file names in a project (scenes, graphs, languages); see FILE_ID in limits.ts. */
const fileId: Schema = { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$" };
const bool: Schema = { type: "boolean" };
const num: Schema = { type: "number" };
const nonNeg: Schema = { type: "number", minimum: 0 };
const pos: Schema = { type: "number", exclusiveMinimum: 0 };
const int0: Schema = { type: "integer", minimum: 0 };
const arr = (items: Schema, extra: Schema = {}): Schema => ({ type: "array", items, ...extra });
const rec = (values: Schema): Schema => ({ type: "object", additionalProperties: values });
const nullable = (s: Schema): Schema => ({ anyOf: [s, { type: "null" }] });
const enumOf = (values: readonly (string | number)[]): Schema => ({ enum: [...values] });

/** A closed object: unknown fields are reported (strict: error, lenient: warning). */
export function obj(properties: Readonly<Record<string, Schema>>, required: readonly string[] = []): Schema {
  return { type: "object", properties, required: [...required], additionalProperties: false };
}

const value: Schema = { type: ["boolean", "number", "string"] };
const point: Schema = arr(num, { minItems: 2, maxItems: 2 });
const polygon: Schema = arr(ref("point"), { minItems: 3 });
const size: Schema = obj({ width: pos, height: pos }, ["width", "height"]);
const rect: Schema = obj({ x: num, y: num, width: pos, height: pos }, ["x", "y", "width", "height"]);

const binary = (op: string): Schema => obj({ [op]: arr(ref("expr"), { minItems: 2, maxItems: 2 }) }, [op]);
const expr: Schema = {
  oneOf: [
    obj({ const: value }, ["const"]),
    obj({ var: id }, ["var"]),
    binary("eq"),
    binary("neq"),
    obj({ and: arr(ref("expr")) }, ["and"]),
    obj({ or: arr(ref("expr")) }, ["or"]),
    obj({ not: ref("expr") }, ["not"]),
    binary("lt"),
    binary("lte"),
    binary("gt"),
    binary("gte"),
  ],
};

const container: Schema = {
  oneOf: [
    obj({ kind: { const: "scene" }, id }, ["kind", "id"]),
    obj({ kind: { const: "actor" }, id }, ["kind", "id"]),
    obj({ kind: { const: "none" } }, ["kind"]),
  ],
  discriminator: { propertyName: "kind" },
};

const edge: Schema = { oneOf: [id, obj({ to: id, order: num }, ["to"])] };

/** Schema of one node parameter kind (mirrors the loader's parameter checks). */
export function paramSchema(kind: string): Schema {
  switch (kind) {
    case "bool":
      return bool;
    case "num":
      return nonNeg;
    case "value":
      return value;
    case "expr":
      return ref("expr");
    case "var":
      return { type: "string", pattern: VAR_NAME.source };
    case "container":
      return ref("container");
    case "useKind":
      return enumOf(["object", "actor", "inventory"]);
    case "delayMode":
      return enumOf(["block", "background"]);
    case "times":
      return { oneOf: [{ type: "integer", minimum: 1 }, { const: "loop" }] };
    default:
      // str, spot, textKey, entryName and entity references: non-empty strings (references are semantic).
      return id;
  }
}

/** One closed object variant per node type, generated from NODE_PARAMS. */
export function nodeVariants(): Schema[] {
  return (Object.keys(NODE_PARAMS) as NodeType[]).map((type) => {
    const props: Record<string, Schema> = { id, type: { const: type }, next: arr(ref("edge")) };
    const required = ["id", "type"];
    for (const p of NODE_PARAMS[type]) {
      props[p.name] = paramSchema(p.kind);
      if (p.optional !== true) required.push(p.name);
    }
    return { title: type, ...obj(props, required) };
  });
}

const node: Schema = { oneOf: nodeVariants(), discriminator: { propertyName: "type" } };

const graph: Schema = obj(
  { id: fileId, kind: enumOf(["logic", "dialog"]), owner: id, actors: arr(id), nodes: arr(ref("node")) },
  ["id", "kind", "nodes"],
);

const spot: Schema = obj({ x: num, y: num, facing: enumOf(FACINGS), height: pos, scale: bool }, ["x", "y"]);
const variant: Schema = obj({ sprite: id, portrait: id, animations: rec(id) });
const timelineFrame: Schema = obj({ atMs: nonNeg, asset: id, textKey: id }, ["atMs"]);
const cutsceneVariant: Schema = obj({ video: id, timeline: arr(ref("timelineFrame")), durationMs: pos });
const cutscene: Schema = obj({ variants: rec(ref("cutsceneVariant")), skippable: bool, skipAfterMs: nonNeg, hold: bool }, ["variants"]);
const camera: Schema = obj({ focal: pos, height: pos, tilt: num, horizon: num, speed: pos, scale: pos }, ["focal", "height", "tilt", "horizon", "speed"]);
const layer: Schema = obj({ id, depth: num, assets: rec(id) }, ["id", "depth"]);

const scene: Schema = obj(
  {
    id: fileId,
    nameKey: id,
    size,
    entry: nullable(id),
    variants: arr(id),
    spots: rec(ref("spot")),
    defaultSpot: id,
    walkable: arr(ref("polygon")),
    blockers: arr(ref("polygon")),
    objectZones: arr(obj({ entity: id, variant: id, nameKey: id, priority: num, polygon: ref("polygon") }, ["entity", "polygon"])),
    actorZones: arr(obj({ actor: id, variant: id, talkSpot: id, priority: num, polygon: ref("polygon") }, ["actor", "polygon"])),
    triggerZones: arr(obj({ id, entry: nullable(id), polygon: ref("polygon") }, ["id", "entry", "polygon"])),
    speechRegions: rec(ref("rect")),
    portraitRegions: rec(ref("rect")),
    sounds: rec(id),
    cutscenes: rec(ref("cutscene")),
    camera: ref("camera"),
    walkSpeed: pos,
    layers: arr(ref("layer")),
  },
  ["id", "entry"],
);

const actor: Schema = obj(
  {
    id,
    nameKey: id,
    scene: nullable(id),
    spot: id,
    entry: nullable(id),
    dialog: id,
    variants: rec(ref("variant")),
    referenceHeight: pos,
    grounded: bool,
    triggersZones: bool,
    sounds: rec(id),
    hitBox: size,
  },
  ["id", "scene", "entry", "variants"],
);

const object: Schema = obj(
  { id, nameKey: id, container: ref("container"), spot: id, entry: nullable(id), icon: id, variants: rec(ref("variant")), sounds: rec(id) },
  ["id", "container", "entry", "variants"],
);

const portal: Schema = obj(
  {
    id,
    from: id,
    to: id,
    index: int0,
    nameKey: id,
    lockedKey: id,
    locked: bool,
    exitSpot: id,
    entrySpot: id,
    arrivalSpot: nullable(id),
    entry: nullable(id),
    polygon: ref("polygon"),
  },
  ["id", "from", "to", "entry"],
);

const animInstr: Schema = {
  oneOf: [
    obj({ op: { const: "frame" }, n: int0 }, ["op", "n"]),
    obj({ op: { const: "play" }, from: int0, to: int0 }, ["op", "from", "to"]),
    obj({ op: { const: "loopRange" }, from: int0, to: int0 }, ["op", "from", "to"]),
    obj({ op: { const: "wait" }, frames: int0 }, ["op", "frames"]),
    obj({ op: { const: "fps" }, n: pos }, ["op", "n"]),
    obj({ op: { const: "layer" }, name: id }, ["op", "name"]),
    obj({ op: { const: "layerPop" } }, ["op"]),
    obj({ op: { const: "signal" }, entity: id, name: id }, ["op", "entity", "name"]),
  ],
  discriminator: { propertyName: "op" },
};

const animation: Schema = obj(
  { id, atlas: id, instructions: arr(ref("animInstr")), loop: bool, maxDuration: pos, defaultFps: pos },
  ["id", "atlas", "instructions"],
);

const sound: Schema = obj(
  {
    id,
    asset: id,
    channel: enumOf(SOUND_CHANNELS),
    volume: { type: "number", minimum: 0, maximum: 1 },
    durationMs: pos,
    persistAcrossScenes: bool,
    loopStartMs: nonNeg,
    loopEndMs: nonNeg,
  },
  ["id", "asset", "channel"],
);

const ui: Schema = obj({
  inventorySlots: { type: "integer", minimum: 1 },
  inventoryHeight: pos,
  reactWhenNothingHappens: bool,
  playerLinesAsMenu: bool,
  cannotTextKeys: arr(id),
  fadeMs: nonNeg,
  clickFeedbackMs: nonNeg,
});

const game: Schema = obj(
  {
    id,
    version: id,
    formatVersion: { type: "integer", minimum: 1 },
    languages: arr(fileId, { minItems: 1 }),
    defaultLanguage: id,
    fallbackLanguage: id,
    player: obj({ actor: id }, ["actor"]),
    entry: nullable(id),
    globals: rec(value),
    ui: ref("ui"),
    viewport: size,
  },
  ["id", "version", "formatVersion", "languages", "defaultLanguage"],
);

const saveMigration: Schema = obj({ fromVersion: id, rename: rec(id), remove: arr(id), setGlobals: rec(value) }, ["fromVersion"]);

const i18nTable: Schema = rec(str);

const contentPackage: Schema = obj(
  {
    game: ref("game"),
    scenes: arr(ref("scene")),
    actors: arr(ref("actor")),
    objects: arr(ref("object")),
    portals: arr(ref("portal")),
    graphs: arr(ref("graph")),
    i18n: rec(ref("i18nTable")),
    animations: arr(ref("animation")),
    sounds: arr(ref("sound")),
    saveMigrations: arr(ref("saveMigration")),
  },
  ["game"],
);

const atlas: Schema = obj(
  {
    frameWidth: { type: "number", exclusiveMinimum: 0, maximum: 16384 },
    frameHeight: { type: "number", exclusiveMinimum: 0, maximum: 16384 },
    frames: { type: "integer", minimum: 1, maximum: 4096 },
    columns: { type: "integer", minimum: 1, maximum: 4096 },
    anchor: point,
    layers: rec(obj({ dx: num, dy: num }, ["dx", "dy"])),
  },
  ["frameWidth", "frameHeight", "frames"],
);

const assetKind = enumOf(["image", "atlas", "audio", "video", "font"]);
const sha = { type: "string", pattern: "^[0-9a-f]{64}$" };

/** Runtime manifest entry (spec 06 F8.1) as written into the bundle. */
const manifestEntry: Schema = obj(
  {
    kind: enumOf(["image", "atlas", "audio", "video"]),
    url: id,
    formats: arr(obj({ url: id, type: id, bytes: int0, hash: id }, ["url"])),
    language: id,
    bytes: int0,
    hash: id,
    atlas: ref("atlas"),
  },
  [],
);

/** One source asset of an editor project (assets.manifest.json). */
const projectAsset: Schema = obj(
  {
    kind: assetKind,
    file: id,
    type: id,
    bytes: int0,
    sha256: sha,
    language: id,
    atlas: ref("atlas"),
    alternatives: arr(obj({ file: id, type: id, bytes: int0, sha256: sha }, ["file", "type", "bytes", "sha256"])),
    source: str,
    license: str,
    author: str,
  },
  ["kind", "file", "type", "bytes", "sha256"],
);

export const DEFINITIONS: Readonly<Record<string, Schema>> = {
  point,
  polygon,
  rect,
  expr,
  container,
  edge,
  node,
  graph,
  spot,
  variant,
  timelineFrame,
  cutsceneVariant,
  cutscene,
  camera,
  layer,
  scene,
  actor,
  object,
  portal,
  animInstr,
  animation,
  sound,
  ui,
  game,
  saveMigration,
  i18nTable,
  contentPackage,
  atlas,
  manifestEntry,
  projectAsset,
};

const withDefs = (title: string, root: Schema): Schema => ({
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: `https://adventure-engine.invalid/schema/${title}.json`,
  title,
  ...root,
  definitions: DEFINITIONS,
});

/** Editor metadata (editor.json): free-form layout data that never reaches the bundle. */
const editorMeta: Schema = obj({
  nodes: rec(obj({ x: num, y: num }, ["x", "y"])),
  layers: rec(obj({ visible: bool, locked: bool })),
  panels: rec({}),
});

/** Schemas of every project file kind and of the bundle. */
export const SCHEMAS: Readonly<Record<string, Schema>> = {
  project: withDefs("project", obj({ format: { const: PROJECT_FORMAT }, formatVersion: { const: PROJECT_FORMAT_VERSION }, order: obj({ scenes: arr(id), graphs: arr(id) }, ["scenes", "graphs"]) }, ["format", "formatVersion", "order"])),
  game: withDefs("game", ref("game")),
  scene: withDefs("scene", ref("scene")),
  actors: withDefs("actors", arr(ref("actor"))),
  objects: withDefs("objects", arr(ref("object"))),
  portals: withDefs("portals", arr(ref("portal"))),
  graph: withDefs("graph", ref("graph")),
  i18n: withDefs("i18n", ref("i18nTable")),
  media: withDefs("media", obj({ animations: arr(ref("animation")), sounds: arr(ref("sound")) })),
  migrations: withDefs("migrations", arr(ref("saveMigration"))),
  assets: withDefs("assets", rec(ref("projectAsset"))),
  editor: withDefs("editor", editorMeta),
  content: withDefs("content", ref("contentPackage")),
  bundle: withDefs(
    "bundle",
    obj(
      { format: { const: BUNDLE_FORMAT }, formatVersion: { const: BUNDLE_FORMAT_VERSION }, contentHash: sha, content: ref("contentPackage"), manifest: rec(ref("manifestEntry")) },
      ["format", "formatVersion", "contentHash", "content", "manifest"],
    ),
  ),
};
