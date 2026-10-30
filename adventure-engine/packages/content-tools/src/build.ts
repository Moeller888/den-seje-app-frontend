/**
 * Build and validation (phase 6): project → one deterministic bundle.json.
 *
 * The engine's loader (`loadContent`) and asset cross-check (`validateAssets`)
 * are the authority for every semantic rule. This module only adds what is
 * specific to projects (files, asset bytes) and maps the loader's package
 * paths back to the project file a problem lives in.
 */

import { ContentValidationError, loadContent, validateAssets, type ContentPackage, type Diagnostic, type ManifestEntry, type MediaManifest } from "@adventure-engine/content";
import { canonicalJson, sha256Bytes, sha256Hex } from "@adventure-engine/core";
import { validateSchema } from "./jsonschema.ts";
import { buildContent, ProjectCode, readProject, type Problem, type Project, type ProjectFiles } from "./project.ts";
import { BUNDLE_FORMAT, BUNDLE_FORMAT_VERSION, SCHEMAS } from "./schema.ts";
import { assetProblems } from "./assets.ts";

export interface Bundle {
  readonly format: typeof BUNDLE_FORMAT;
  readonly formatVersion: typeof BUNDLE_FORMAT_VERSION;
  /** sha256 of the canonical JSON of `content`. */
  readonly contentHash: string;
  readonly content: ContentPackage;
  /** Runtime manifest (spec 06 F8.1); urls are relative to the bundle ("assets/<file>"). */
  readonly manifest: MediaManifest;
}

/** Runtime manifest of a project: asset ids sorted, relative urls, sha256 hashes. Fonts are not runtime media. */
export function buildManifest(p: Project, urlPrefix = "assets/"): MediaManifest {
  const out: Record<string, ManifestEntry> = {};
  for (const id of Object.keys(p.assets).sort()) {
    const a = p.assets[id];
    if (a === undefined || a.kind === "font") continue;
    const base = { kind: a.kind, bytes: a.bytes, hash: `sha256:${a.sha256}`, ...(a.language !== undefined ? { language: a.language } : {}), ...(a.atlas !== undefined ? { atlas: a.atlas } : {}) };
    const alternatives = a.alternatives ?? [];
    out[id] =
      alternatives.length === 0
        ? { ...base, url: `${urlPrefix}${a.file}` }
        : {
            ...base,
            formats: [{ url: `${urlPrefix}${a.file}`, type: a.type, bytes: a.bytes, hash: `sha256:${a.sha256}` }, ...alternatives.map((x) => ({ url: `${urlPrefix}${x.file}`, type: x.type, bytes: x.bytes, hash: `sha256:${x.sha256}` }))],
          };
  }
  return out;
}

export function buildBundle(p: Project): { readonly bundle: Bundle; readonly json: string } {
  const content = buildContent(p);
  const bundle: Bundle = {
    format: BUNDLE_FORMAT,
    formatVersion: BUNDLE_FORMAT_VERSION,
    contentHash: sha256Hex(canonicalJson(content)),
    content,
    manifest: buildManifest(p),
  };
  return { bundle, json: `${canonicalJson(bundle)}\n` };
}

/** Map a loader path ("scenes[2].walkable[0]") of a built package to the project file and path. */
export function sourceLocation(p: Project, path: string): { readonly file: string; readonly path: string } {
  const m = /^(scenes|actors|objects|portals|graphs|animations|sounds|saveMigrations)(?:\[(\d+)\])?(?:\.(.*))?$/.exec(path);
  if (m !== null) {
    const [, list, index, rest = ""] = m;
    const i = index === undefined ? null : Number(index);
    const tail = (prefix: string): string => (rest === "" ? prefix : prefix === "" ? rest : `${prefix}.${rest}`);
    switch (list) {
      case "scenes":
        return i === null ? { file: "project.json", path: "order.scenes" } : { file: `scenes/${p.scenes[i]?.id ?? i}.json`, path: rest };
      case "graphs":
        return i === null ? { file: "project.json", path: "order.graphs" } : { file: `graphs/${p.graphs[i]?.id ?? i}.json`, path: rest };
      case "animations":
      case "sounds":
        return { file: "media.json", path: tail(i === null ? list : `${list}[${i}]`) };
      case "saveMigrations":
        return { file: "migrations.json", path: i === null ? rest : `[${i}]${rest === "" ? "" : `.${rest}`}` };
      default:
        return { file: `${list}.json`, path: i === null ? rest : `[${i}]${rest === "" ? "" : `.${rest}`}` };
    }
  }
  if (path.startsWith("game")) return { file: "game.json", path: path.replace(/^game\.?/, "") };
  const i18n = /^i18n\.([^.]+)\.?(.*)$/.exec(path);
  if (i18n !== null) return { file: `i18n/${i18n[1]}.json`, path: i18n[2] ?? "" };
  const asset = /^manifest\.([^.]+)\.?(.*)$/.exec(path);
  if (asset !== null) return { file: "assets.manifest.json", path: `${asset[1]}${asset[2] === "" ? "" : `.${asset[2]}`}` };
  return { file: "", path };
}

/** Engine diagnostics (loader + asset cross-check) of a package, never throwing. */
export function engineDiagnostics(content: ContentPackage, manifest: MediaManifest): Diagnostic[] {
  let list: Diagnostic[];
  try {
    list = [...loadContent(content, { mode: "strict" }).diagnostics];
  } catch (err) {
    if (!(err instanceof ContentValidationError)) throw err;
    list = [...err.diagnostics];
  }
  return [...list, ...validateAssets(content, manifest)];
}

export interface ValidateOptions {
  /** Unknown fields are errors. */
  readonly strict?: boolean;
}

export interface Validation {
  readonly project: Project | null;
  readonly problems: readonly Problem[];
  readonly ok: boolean;
}

const sortProblems = (list: readonly Problem[]): Problem[] =>
  [...list].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.path < b.path ? -1 : a.path > b.path ? 1 : a.code < b.code ? -1 : a.code > b.code ? 1 : a.message < b.message ? -1 : 1));

/** Validate a project: files and schema, assets, then the engine validator on the built package. */
export function validateProject(files: ProjectFiles, options: ValidateOptions = {}): Validation {
  const read = readProject(files, options);
  const problems: Problem[] = [...read.problems];
  const p = read.project;
  if (p !== null) {
    problems.push(...assetProblems(p, files));
    for (const d of engineDiagnostics(buildContent(p), buildManifest(p))) {
      const at = sourceLocation(p, d.path);
      problems.push({ code: d.code, level: d.level, file: at.file, path: at.path, message: d.message });
    }
  }
  const sorted = sortProblems(problems);
  return { project: p, problems: sorted, ok: !sorted.some((x) => x.level === "error") };
}

/** Validate a built bundle text: JSON, bundle schema, content hash and the engine validator. */
export function validateBundle(text: string, options: ValidateOptions = {}): { readonly problems: readonly Problem[]; readonly ok: boolean } {
  const problems: Problem[] = [];
  const add = (code: string, level: Problem["level"], path: string, message: string): void => void problems.push({ code, level, file: "bundle.json", path, message });
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (err) {
    add(ProjectCode.Json, "error", "", `not valid JSON: ${(err as Error).message}`);
    return { problems, ok: false };
  }
  const issues = validateSchema(SCHEMAS["bundle"] as Readonly<Record<string, unknown>>, value);
  for (const i of issues) add(i.kind === "unknown" ? ProjectCode.Unknown : ProjectCode.Schema, i.kind === "unknown" && options.strict !== true ? "warning" : "error", i.path, i.message);
  if (issues.some((i) => i.kind === "invalid")) return { problems, ok: false };
  const b = value as Bundle;
  if (b.contentHash !== sha256Hex(canonicalJson(b.content))) add(ProjectCode.AssetHash, "error", "contentHash", "contentHash does not match the content");
  for (const d of engineDiagnostics(b.content, b.manifest)) add(d.code, d.level, d.path.startsWith("manifest.") ? d.path : `content.${d.path}`, d.message);
  const sorted = sortProblems(problems);
  return { problems: sorted, ok: !sorted.some((x) => x.level === "error") };
}

export { sha256Bytes };
