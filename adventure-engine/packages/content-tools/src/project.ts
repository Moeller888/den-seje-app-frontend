/**
 * Editor project format (phase 6, docs/decisions/phase-6.md §2).
 *
 *   project.json            format, formatVersion and the explicit content order
 *   game.json               GameDef
 *   scenes/<id>.json        one SceneDef per file (file name = id)
 *   actors.json             ActorDef[]          (array order = content order)
 *   objects.json            ObjectDef[]
 *   portals.json            PortalDef[]
 *   graphs/<id>.json        one GraphDef per file
 *   i18n/<lang>.json        key → text
 *   media.json              { animations, sounds }       (optional)
 *   migrations.json         SaveMigrationDef[]           (optional)
 *   assets.manifest.json    asset id → source asset (file, kind, type, bytes, sha256, …)
 *   assets/…                the source files
 *   editor.json             editor metadata (node positions, layers, panels): never built
 *
 * Files are a map of POSIX-style relative paths to bytes, so the same code runs
 * in Node (CLI), the browser (editor) and tests. Serialization is canonical
 * (sorted keys, two-space indent, "\n"), so the same document always gives the
 * same bytes; arrays keep their order because their order is content.
 */

import type {
  ActorDef,
  AnimationDef,
  AtlasSpec,
  ContentPackage,
  GameDef,
  GraphDef,
  ObjectDef,
  PortalDef,
  SaveMigrationDef,
  SceneDef,
  SoundDef,
} from "@adventure-engine/content";
import { ASSET_ID, FILE_ID } from "./limits.ts";
import { PROJECT_FORMAT, PROJECT_FORMAT_VERSION, SCHEMAS } from "./schema.ts";
import { validateSchema } from "./jsonschema.ts";

export type AssetKind = "image" | "atlas" | "audio" | "video" | "font";

export interface AssetAlternative {
  readonly file: string;
  readonly type: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface ProjectAsset {
  readonly kind: AssetKind;
  /** Path below assets/ (POSIX). */
  readonly file: string;
  /** MIME type. */
  readonly type: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly language?: string;
  readonly atlas?: AtlasSpec;
  /** Further encodings of the same audio/video, in order of preference. */
  readonly alternatives?: readonly AssetAlternative[];
  /** Provenance and optional licence metadata. */
  readonly source?: string;
  readonly license?: string;
  readonly author?: string;
}

export interface EditorMeta {
  /** Graph node id → canvas position. */
  readonly nodes?: Readonly<Record<string, { readonly x: number; readonly y: number }>>;
  /** "<scene>/<layer>" → visibility and lock. */
  readonly layers?: Readonly<Record<string, { readonly visible?: boolean; readonly locked?: boolean }>>;
  readonly panels?: Readonly<Record<string, unknown>>;
}

/** The editor's document: everything of a project except the asset bytes. */
export interface Project {
  readonly game: GameDef;
  readonly scenes: readonly SceneDef[];
  readonly actors: readonly ActorDef[];
  readonly objects: readonly ObjectDef[];
  readonly portals: readonly PortalDef[];
  readonly graphs: readonly GraphDef[];
  readonly i18n: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly animations: readonly AnimationDef[];
  readonly sounds: readonly SoundDef[];
  readonly migrations: readonly SaveMigrationDef[];
  readonly assets: Readonly<Record<string, ProjectAsset>>;
  readonly editor: EditorMeta;
}

export type ProjectFiles = ReadonlyMap<string, Uint8Array>;

export type ProblemLevel = "error" | "warning";

/** A validation problem: stable code, level, file and JSON path inside it. */
export interface Problem {
  readonly code: string;
  readonly level: ProblemLevel;
  /** Project-relative file ("" for the project as a whole). */
  readonly file: string;
  /** Dotted JSON path inside the file ("" for the whole file). */
  readonly path: string;
  readonly message: string;
}

export const ProjectCode = {
  Missing: "E-PROJECT-MISSING",
  Json: "E-PROJECT-JSON",
  Schema: "E-PROJECT-SCHEMA",
  Format: "E-PROJECT-FORMAT",
  /** An unknown field: an error with --strict, otherwise a warning. */
  Unknown: "E-PROJECT-UNKNOWN",
  FileName: "E-PROJECT-FILE",
  Order: "W-PROJECT-ORDER",
  StrayFile: "W-PROJECT-STRAY",
  AssetFile: "E-ASSET-FILE",
  AssetHash: "E-ASSET-HASH",
  AssetType: "E-ASSET-TYPE",
  AssetForbidden: "E-ASSET-FORBIDDEN",
  AssetDuplicate: "W-ASSET-DUPLICATE",
  AssetUnused: "W-ASSET-UNUSED",
} as const;

export interface ReadOptions {
  /** Unknown fields are errors (default: warnings). */
  readonly strict?: boolean;
}

export interface ReadResult {
  /**
   * Null when the project cannot be assembled safely: missing or unparsable
   * files, wrong shapes, schema errors, unsafe file names. Only warnings (such
   * as unknown fields without --strict) leave a project.
   */
  readonly project: Project | null;
  readonly problems: readonly Problem[];
}

const decoder = new TextDecoder("utf-8", { fatal: true });
const encoder = new TextEncoder();

export const encodeText = (text: string): Uint8Array => encoder.encode(text);

/** UTF-8 text of a file (a BOM is dropped). Throws on invalid UTF-8. */
export function decodeText(bytes: Uint8Array): string {
  const text = decoder.decode(bytes);
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Canonical, human-readable JSON: sorted keys, two spaces, "\n" line ends, final newline. */
export function prettyCanonical(value: unknown): string {
  return `${JSON.stringify(sortKeys(value), null, 2)}\n`;
}

/** Deep copy with object keys sorted; undefined members are dropped (as JSON.stringify would). */
export function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((v) => (v === undefined ? null : sortKeys(v)));
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[k];
      // defineProperty: a "__proto__" key stays a plain key and never becomes the prototype.
      if (v !== undefined) Object.defineProperty(out, k, { value: sortKeys(v), enumerable: true, writable: true, configurable: true });
    }
    return out;
  }
  return value;
}

/** Which schema a project file is checked against, or null for files that are not project JSON. */
export function fileKind(path: string): keyof typeof SCHEMAS | null {
  if (path === "project.json") return "project";
  if (path === "game.json") return "game";
  if (path === "actors.json") return "actors";
  if (path === "objects.json") return "objects";
  if (path === "portals.json") return "portals";
  if (path === "media.json") return "media";
  if (path === "migrations.json") return "migrations";
  if (path === "assets.manifest.json") return "assets";
  if (path === "editor.json") return "editor";
  if (/^scenes\/[^/]+\.json$/.test(path)) return "scene";
  if (/^graphs\/[^/]+\.json$/.test(path)) return "graph";
  if (/^i18n\/[^/]+\.json$/.test(path)) return "i18n";
  return null;
}

const stem = (path: string): string => path.slice(path.lastIndexOf("/") + 1).replace(/\.json$/, "");

/**
 * Read a project from its files. Every JSON file is parsed and checked against
 * its schema; the content order comes from project.json (file system order
 * never matters).
 */
export function readProject(files: ProjectFiles, options: ReadOptions = {}): ReadResult {
  const problems: Problem[] = [];
  const add = (code: string, level: ProblemLevel, file: string, path: string, message: string): void =>
    void problems.push({ code, level, file, path, message });
  const parsed = new Map<string, unknown>();
  let broken = false;
  for (const path of [...files.keys()].sort()) {
    const kind = fileKind(path);
    if (kind === null) {
      if (!path.startsWith("assets/")) add(ProjectCode.StrayFile, "warning", path, "", "file is not part of the project format and is ignored");
      continue;
    }
    let value: unknown;
    try {
      value = JSON.parse(decodeText(files.get(path) as Uint8Array));
    } catch (err) {
      add(ProjectCode.Json, "error", path, "", `not valid UTF-8 JSON: ${(err as Error).message}`);
      broken = true;
      continue;
    }
    parsed.set(path, value);
    for (const issue of validateSchema(SCHEMAS[kind] as Readonly<Record<string, unknown>>, value)) {
      if (issue.kind === "unknown") add(ProjectCode.Unknown, options.strict === true ? "error" : "warning", path, issue.path, issue.message);
      else add(ProjectCode.Schema, "error", path, issue.path, issue.message);
    }
  }
  const project = parsed.get("project.json") as { format?: unknown; formatVersion?: unknown; order?: { scenes?: unknown; graphs?: unknown } } | undefined;
  if (project === undefined) {
    if (!files.has("project.json")) add(ProjectCode.Missing, "error", "project.json", "", "missing project.json");
    return { project: null, problems };
  }
  if (project.format !== PROJECT_FORMAT || typeof project.formatVersion !== "number") {
    add(ProjectCode.Format, "error", "project.json", "format", `not an ${PROJECT_FORMAT} file`);
    return { project: null, problems };
  }
  if (project.formatVersion > PROJECT_FORMAT_VERSION) {
    add(ProjectCode.Format, "error", "project.json", "formatVersion", `project format ${project.formatVersion} is newer than this tool (${PROJECT_FORMAT_VERSION})`);
    return { project: null, problems };
  }
  for (const f of ["game.json"]) if (!files.has(f)) add(ProjectCode.Missing, "error", f, "", `missing ${f}`);
  const arrayOr = <T>(path: string): T[] => {
    const v = parsed.get(path);
    if (v === undefined) return [];
    if (!Array.isArray(v)) {
      broken = true;
      return [];
    }
    return v as T[];
  };
  const objectOr = <T>(path: string, fallback: T): T => {
    const v = parsed.get(path);
    if (v === undefined) return fallback;
    if (typeof v !== "object" || v === null || Array.isArray(v)) {
      broken = true;
      return fallback;
    }
    return v as T;
  };
  const ordered = <T extends { readonly id: string }>(dir: "scenes" | "graphs"): T[] => {
    const byId = new Map<string, T>();
    for (const [path, value] of parsed) {
      if (!path.startsWith(`${dir}/`)) continue;
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        broken = true;
        continue;
      }
      const item = value as T;
      if (!FILE_ID.test(stem(path))) add(ProjectCode.FileName, "error", path, "", `"${stem(path)}" is not a valid file name id (${FILE_ID.source})`);
      if (item.id !== stem(path)) add(ProjectCode.FileName, "error", path, "id", `id "${String(item.id)}" must match the file name "${stem(path)}"`);
      byId.set(stem(path), item);
    }
    const order = Array.isArray(project.order?.[dir]) ? (project.order[dir] as unknown[]).filter((x): x is string => typeof x === "string") : [];
    const out: T[] = [];
    const seen = new Set<string>();
    order.forEach((name, i) => {
      if (seen.has(name)) {
        add(ProjectCode.Order, "warning", "project.json", `order.${dir}[${i}]`, `"${name}" is listed twice`);
        return;
      }
      seen.add(name);
      const item = byId.get(name);
      if (item === undefined) add(ProjectCode.Missing, "error", "project.json", `order.${dir}[${i}]`, `${dir}/${name}.json does not exist`);
      else out.push(item);
    });
    for (const name of [...byId.keys()].sort()) {
      if (seen.has(name)) continue;
      add(ProjectCode.Order, "warning", "project.json", `order.${dir}`, `${dir}/${name}.json is not listed in the order; it is added at the end`);
      out.push(byId.get(name) as T);
    }
    return out;
  };
  const scenes = ordered<SceneDef>("scenes");
  const graphs = ordered<GraphDef>("graphs");
  const i18n: Record<string, Record<string, string>> = {};
  for (const [path, value] of [...parsed].filter(([p]) => p.startsWith("i18n/")).sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      broken = true;
      continue;
    }
    if (!FILE_ID.test(stem(path))) {
      add(ProjectCode.FileName, "error", path, "", `"${stem(path)}" is not a valid language file name (${FILE_ID.source})`);
      continue;
    }
    Object.defineProperty(i18n, stem(path), { value: value as Record<string, string>, enumerable: true, writable: true, configurable: true });
  }
  const manifest = parsed.get("assets.manifest.json");
  if (typeof manifest === "object" && manifest !== null && !Array.isArray(manifest)) {
    for (const key of Object.keys(manifest).sort()) {
      if (!ASSET_ID.test(key)) add(ProjectCode.Schema, "error", "assets.manifest.json", key, `asset id "${key}" must match ${ASSET_ID.source}`);
    }
  }
  const media = objectOr<{ animations?: AnimationDef[]; sounds?: SoundDef[] }>("media.json", {});
  const game = objectOr<GameDef | null>("game.json", null);
  const result: Project | null =
    broken || game === null || problems.some((p) => p.level === "error")
      ? null
      : {
          game,
          scenes,
          actors: arrayOr<ActorDef>("actors.json"),
          objects: arrayOr<ObjectDef>("objects.json"),
          portals: arrayOr<PortalDef>("portals.json"),
          graphs,
          i18n,
          animations: Array.isArray(media.animations) ? media.animations : [],
          sounds: Array.isArray(media.sounds) ? media.sounds : [],
          migrations: arrayOr<SaveMigrationDef>("migrations.json"),
          assets: objectOr<Record<string, ProjectAsset>>("assets.manifest.json", {}),
          editor: objectOr<EditorMeta>("editor.json", {}),
        };
  return { project: broken ? null : result, problems };
}

/** The JSON files of a project, canonical. Asset bytes are not included (see `withAssets`). */
export function projectToFiles(p: Project): Map<string, string> {
  // Ids that become file names are checked here as well, so no caller can write outside the project.
  for (const [what, ids] of [
    ["scene", p.scenes.map((s) => s.id)],
    ["graph", p.graphs.map((g) => g.id)],
    ["language", Object.keys(p.i18n)],
  ] as const) {
    for (const x of ids) if (!FILE_ID.test(x)) throw new RangeError(`${what} id "${x}" cannot be a file name (${FILE_ID.source})`);
  }
  const files = new Map<string, string>();
  files.set("project.json", prettyCanonical({ format: PROJECT_FORMAT, formatVersion: PROJECT_FORMAT_VERSION, order: { scenes: p.scenes.map((s) => s.id), graphs: p.graphs.map((g) => g.id) } }));
  files.set("game.json", prettyCanonical(p.game));
  for (const s of p.scenes) files.set(`scenes/${s.id}.json`, prettyCanonical(s));
  files.set("actors.json", prettyCanonical(p.actors));
  files.set("objects.json", prettyCanonical(p.objects));
  files.set("portals.json", prettyCanonical(p.portals));
  for (const g of p.graphs) files.set(`graphs/${g.id}.json`, prettyCanonical(g));
  for (const lang of Object.keys(p.i18n).sort()) files.set(`i18n/${lang}.json`, prettyCanonical(p.i18n[lang]));
  if (p.animations.length > 0 || p.sounds.length > 0) files.set("media.json", prettyCanonical({ animations: p.animations, sounds: p.sounds }));
  if (p.migrations.length > 0) files.set("migrations.json", prettyCanonical(p.migrations));
  files.set("assets.manifest.json", prettyCanonical(p.assets));
  if (Object.keys(p.editor).length > 0) files.set("editor.json", prettyCanonical(p.editor));
  return new Map([...files].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
}

/** All files of a project: the canonical JSON plus the asset bytes kept from `sources`. */
export function withAssets(p: Project, sources: ProjectFiles): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  for (const [path, text] of projectToFiles(p)) out.set(path, encodeText(text));
  for (const a of Object.values(p.assets)) {
    for (const file of [a.file, ...(a.alternatives ?? []).map((x) => x.file)]) {
      const bytes = sources.get(`assets/${file}`);
      if (bytes !== undefined) out.set(`assets/${file}`, bytes);
    }
  }
  return new Map([...out].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
}

/** A new, empty project that already validates (one scene, one player, two languages). */
export function newProject(id: string, languages: readonly string[] = ["da", "en"]): Project {
  const lang = languages[0] ?? "da";
  return {
    game: { id, version: "0.1.0", formatVersion: 1, languages: [...languages], defaultLanguage: lang, player: { actor: "player" }, entry: null, globals: {} },
    scenes: [
      {
        id: "start",
        entry: null,
        size: { width: 1280, height: 720 },
        spots: { begin: { x: 640, y: 600 } },
        defaultSpot: "begin",
        walkable: [[[0, 480], [1280, 480], [1280, 720], [0, 720]]],
      },
    ],
    actors: [{ id: "player", scene: "start", spot: "begin", entry: null, variants: { default: {} } }],
    objects: [],
    portals: [],
    graphs: [],
    i18n: Object.fromEntries(languages.map((l) => [l, {}])),
    animations: [],
    sounds: [],
    migrations: [],
    assets: {},
    editor: {},
  };
}

/** The content package of a project in its explicit order. */
export function buildContent(p: Project): ContentPackage {
  return {
    game: p.game,
    scenes: p.scenes,
    actors: p.actors,
    objects: p.objects,
    portals: p.portals,
    graphs: p.graphs,
    i18n: p.i18n,
    ...(p.animations.length > 0 ? { animations: p.animations } : {}),
    ...(p.sounds.length > 0 ? { sounds: p.sounds } : {}),
    ...(p.migrations.length > 0 ? { saveMigrations: p.migrations } : {}),
  };
}

/** Project JSON files the editor writes itself. */
const OWNED_JSON = /^(scenes|graphs|i18n)\/[^/]+\.json$|^(media|migrations|editor)\.json$/;

/**
 * Files of a project folder that the editor may later remove when they leave
 * the project: its own JSON files and the asset files registered in the
 * manifest. Anything else (notes, source artwork, unregistered files under
 * assets/) is never deleted.
 */
export function ownedFiles(project: Project, paths: Iterable<string>): Set<string> {
  const registered = new Set(Object.values(project.assets).flatMap((a) => [a.file, ...(a.alternatives ?? []).map((x) => x.file)].map((f) => `assets/${f}`)));
  return new Set([...paths].filter((path) => OWNED_JSON.test(path) || registered.has(path)));
}
