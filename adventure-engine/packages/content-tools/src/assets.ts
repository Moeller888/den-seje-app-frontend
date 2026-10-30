/**
 * Asset pipeline (phase 6, docs/decisions/phase-6.md §8): import of engine
 * media formats with kind, MIME type, size and SHA-256; de-duplication by hash;
 * checks of the stored files; references from content to assets.
 *
 * Never imported: Flash (SWF), XML documents other than SVG pictures, and saves
 * or other JSON; SVG pictures with scripts are refused as well, so a preview
 * can never run foreign script code (pictures are shown with <img> anyway).
 */

import { sha256Bytes } from "@adventure-engine/core";
import { ASSET_ID, IMPORT_LIMITS } from "./limits.ts";
import { ProjectCode, decodeText, type AssetKind, type Problem, type Project, type ProjectAsset, type ProjectFiles } from "./project.ts";

export interface Detected {
  readonly ext: string;
  readonly type: string;
  /** Kinds this file may be used as. */
  readonly kinds: readonly AssetKind[];
}

const IMAGE: readonly AssetKind[] = ["image", "atlas"];

const starts = (b: Uint8Array, sig: readonly number[], at = 0): boolean => sig.every((x, i) => b[at + i] === x);
const ascii = (b: Uint8Array, from: number, to: number): string => String.fromCharCode(...b.subarray(from, to));

const FORBIDDEN_EXT = new Set(["swf", "fla", "xml", "sav", "save", "json", "js", "mjs", "html", "htm", "exe", "dll"]);

/** File kind from extension and content ("magic bytes"); null when the file is not a supported engine format. */
export function detectAsset(name: string, bytes: Uint8Array): Detected | { readonly forbidden: string } | null {
  const ext = (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? "").toLowerCase();
  if (starts(bytes, [0x46, 0x57, 0x53]) || starts(bytes, [0x43, 0x57, 0x53]) || starts(bytes, [0x5a, 0x57, 0x53])) return { forbidden: "Flash (SWF) files are never imported" };
  if (FORBIDDEN_EXT.has(ext)) return { forbidden: `.${ext} files are never imported (only pictures, sound, video and fonts)` };
  if (ext === "svg") {
    let text: string;
    try {
      text = decodeText(bytes);
    } catch {
      return null;
    }
    if (!/<svg[\s>]/i.test(text)) return null;
    // Character references are decoded and whitespace removed first, so "&#106;avascript:" or "java\tscript:" cannot hide.
    // A reference beyond U+10FFFF (or too long to be a number) becomes U+FFFD, as in a browser, and never throws.
    const char = (cp: number): string => (Number.isInteger(cp) && cp <= 0x10ffff ? String.fromCodePoint(cp) : "�");
    const plain = text.replace(/&#x([0-9a-f]+);?/gi, (_, h: string) => char(Number.parseInt(h, 16))).replace(/&#([0-9]+);?/g, (_, d: string) => char(Number(d)));
    const compact = plain.replace(/[\s\u0000-\u001f]+/g, "");
    if (/<([\w.-]+:)?script\b|\bon[a-z]+\s*=|<([\w.-]+:)?foreignObject\b/i.test(plain) || /(java|vb)script:|data:text\/html/i.test(compact)) {
      return { forbidden: "SVG pictures with scripts, event handlers or embedded HTML are not imported" };
    }
    // DOCTYPE/ENTITY declarations allow entity expansion ("billion laughs"); pictures never need them.
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) return { forbidden: "SVG pictures with DOCTYPE or ENTITY declarations are not imported" };
    return { ext, type: "image/svg+xml", kinds: IMAGE };
  }
  if (ext === "png" && starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { ext, type: "image/png", kinds: IMAGE };
  if ((ext === "jpg" || ext === "jpeg") && starts(bytes, [0xff, 0xd8, 0xff])) return { ext, type: "image/jpeg", kinds: IMAGE };
  if (ext === "webp" && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return { ext, type: "image/webp", kinds: IMAGE };
  if (ext === "wav" && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WAVE") return { ext, type: "audio/wav", kinds: ["audio"] };
  if ((ext === "ogg" || ext === "oga") && ascii(bytes, 0, 4) === "OggS") return { ext, type: "audio/ogg", kinds: ["audio"] };
  if (ext === "mp3" && (ascii(bytes, 0, 3) === "ID3" || (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0))) return { ext, type: "audio/mpeg", kinds: ["audio"] };
  if (ext === "webm" && starts(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return { ext, type: "video/webm", kinds: ["video"] };
  if (ext === "mp4" && ascii(bytes, 4, 8) === "ftyp") return { ext, type: "video/mp4", kinds: ["video"] };
  if (ext === "woff2" && ascii(bytes, 0, 4) === "wOF2") return { ext, type: "font/woff2", kinds: ["font"] };
  if (ext === "woff" && ascii(bytes, 0, 4) === "wOFF") return { ext, type: "font/woff", kinds: ["font"] };
  if (ext === "ttf" && starts(bytes, [0x00, 0x01, 0x00, 0x00])) return { ext, type: "font/ttf", kinds: ["font"] };
  if (ext === "otf" && ascii(bytes, 0, 4) === "OTTO") return { ext, type: "font/otf", kinds: ["font"] };
  return null;
}

export { ASSET_ID };

/** A stable asset id from a file name ("Tove Walk.PNG" → "tove-walk"). */
export function slugId(name: string): string {
  const stem = name.replace(/^.*[\\/]/, "").replace(/\.[^.]*$/, "");
  // Ids are code identifiers: Danish letters are transliterated here (never in prose).
  const slug = stem
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "oe")
    .replace(/å/g, "aa")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "");
  return slug === "" ? "asset" : slug;
}

export interface ImportRequest {
  readonly name: string;
  readonly bytes: Uint8Array;
  /** Author-chosen id; default: from the file name. */
  readonly id?: string;
  /** Default: the first kind the file allows. */
  readonly kind?: AssetKind;
  readonly atlas?: ProjectAsset["atlas"];
  readonly language?: string;
  readonly source?: string;
  readonly license?: string;
  readonly author?: string;
}

export type ImportResult =
  | { readonly ok: true; readonly project: Project; readonly files: Map<string, Uint8Array>; readonly id: string; readonly duplicateOf: string | null }
  | { readonly ok: false; readonly code: string; readonly message: string };

/**
 * Import one file. The bytes are kept unchanged under assets/; a file whose
 * SHA-256 is already in the project is not stored again (the existing id is
 * returned as `duplicateOf`).
 */
export function importAsset(p: Project, files: ProjectFiles, req: ImportRequest): ImportResult {
  if (req.bytes.length > IMPORT_LIMITS.maxFileBytes) return { ok: false, code: "E-IMPORT-LIMIT", message: `"${req.name}" is too large (${req.bytes.length} bytes; at most ${IMPORT_LIMITS.maxFileBytes})` };
  const det = detectAsset(req.name, req.bytes);
  if (det === null) return { ok: false, code: ProjectCode.AssetType, message: `"${req.name}" is not a supported picture, sound, video or font file` };
  if ("forbidden" in det) return { ok: false, code: ProjectCode.AssetForbidden, message: det.forbidden };
  const kind = req.kind ?? (det.kinds[0] as AssetKind);
  if (!det.kinds.includes(kind)) return { ok: false, code: ProjectCode.AssetType, message: `a ${det.type} file cannot be used as ${kind}` };
  if (kind === "atlas" && req.atlas === undefined) return { ok: false, code: ProjectCode.AssetType, message: "an atlas needs a frame grid (frameWidth, frameHeight, frames)" };
  const sha = sha256Bytes(req.bytes);
  const existing = Object.keys(p.assets).sort().find((k) => p.assets[k]?.sha256 === sha);
  if (existing !== undefined) return { ok: true, project: p, files: new Map(files), id: existing, duplicateOf: existing };
  if (req.id !== undefined && !ASSET_ID.test(req.id)) return { ok: false, code: ProjectCode.AssetType, message: `asset id "${req.id}" must match ${ASSET_ID.source}` };
  if (req.id !== undefined && p.assets[req.id] !== undefined) return { ok: false, code: ProjectCode.AssetType, message: `asset id "${req.id}" is already used` };
  let id = req.id ?? slugId(req.name);
  for (let n = 2; req.id === undefined && p.assets[id] !== undefined; n++) id = `${slugId(req.name)}-${n}`;
  let file = `${id}.${det.ext}`;
  for (let n = 2; files.has(`assets/${file}`); n++) file = `${id}-${n}.${det.ext}`;
  const asset: ProjectAsset = {
    kind,
    file,
    type: det.type,
    bytes: req.bytes.length,
    sha256: sha,
    ...(req.atlas !== undefined && kind === "atlas" ? { atlas: req.atlas } : {}),
    ...(req.language !== undefined ? { language: req.language } : {}),
    ...(req.source !== undefined ? { source: req.source } : {}),
    ...(req.license !== undefined ? { license: req.license } : {}),
    ...(req.author !== undefined ? { author: req.author } : {}),
  };
  const out = new Map(files);
  out.set(`assets/${file}`, req.bytes);
  return { ok: true, project: { ...p, assets: { ...p.assets, [id]: asset } }, files: out, id, duplicateOf: null };
}

/** Where content refers to assets: asset id → JSON paths in the built package. */
export function assetRefs(p: Project): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (id: string | undefined, path: string): void => {
    if (id === undefined) return;
    const list = out.get(id) ?? [];
    list.push(path);
    out.set(id, list);
  };
  const visual = (list: readonly { readonly variants: Readonly<Record<string, { sprite?: string; portrait?: string }>> }[], key: string): void =>
    list.forEach((e, i) => {
      for (const [v, def] of Object.entries(e.variants ?? {})) {
        add(def.sprite, `${key}[${i}].variants.${v}.sprite`);
        add(def.portrait, `${key}[${i}].variants.${v}.portrait`);
      }
    });
  visual(p.actors, "actors");
  visual(p.objects, "objects");
  p.objects.forEach((o, i) => add(o.icon, `objects[${i}].icon`));
  p.animations.forEach((a, i) => add(a.atlas, `animations[${i}].atlas`));
  p.sounds.forEach((s, i) => add(s.asset, `sounds[${i}].asset`));
  p.scenes.forEach((s, i) => {
    (s.layers ?? []).forEach((l, j) => {
      for (const [v, id] of Object.entries(l.assets ?? {})) add(id, `scenes[${i}].layers[${j}].assets.${v}`);
    });
    for (const [name, c] of Object.entries(s.cutscenes ?? {})) {
      for (const [lang, v] of Object.entries(c.variants ?? {})) {
        add(v.video, `scenes[${i}].cutscenes.${name}.variants.${lang}.video`);
        (v.timeline ?? []).forEach((f, k) => add(f.asset, `scenes[${i}].cutscenes.${name}.variants.${lang}.timeline[${k}].asset`));
      }
    }
  });
  return out;
}

/** Checks of the stored asset files (the content ↔ manifest match is checked by the engine's validateAssets). */
export function assetProblems(p: Project, files: ProjectFiles): Problem[] {
  const out: Problem[] = [];
  const add = (code: string, level: Problem["level"], file: string, path: string, message: string): void => void out.push({ code, level, file, path, message });
  const used = new Set<string>();
  const bySha = new Map<string, string>();
  const refs = assetRefs(p);
  for (const id of Object.keys(p.assets).sort()) {
    const a = p.assets[id] as ProjectAsset;
    for (const [i, entry] of [a, ...(a.alternatives ?? [])].entries()) {
      const at = i === 0 ? id : `${id}.alternatives[${i - 1}]`;
      used.add(`assets/${entry.file}`);
      const bytes = files.get(`assets/${entry.file}`);
      if (bytes === undefined) {
        add(ProjectCode.AssetFile, "error", "assets.manifest.json", `${at}.file`, `assets/${entry.file} is missing`);
        continue;
      }
      if (bytes.length !== entry.bytes || sha256Bytes(bytes) !== entry.sha256) {
        add(ProjectCode.AssetHash, "error", "assets.manifest.json", at, `assets/${entry.file} does not match its recorded size and SHA-256`);
      }
      const det = detectAsset(entry.file, bytes);
      if (det === null || "forbidden" in det) add(ProjectCode.AssetForbidden, "error", "assets.manifest.json", `${at}.file`, det === null ? `assets/${entry.file} is not a supported media file` : det.forbidden);
      else if (!det.kinds.includes(a.kind) || det.type !== entry.type) add(ProjectCode.AssetType, "error", "assets.manifest.json", at, `assets/${entry.file} is ${det.type}, recorded as ${a.kind} ${entry.type}`);
    }
    const twin = bySha.get(a.sha256);
    if (twin !== undefined) add(ProjectCode.AssetDuplicate, "warning", "assets.manifest.json", id, `same file content as asset "${twin}"`);
    else bySha.set(a.sha256, id);
    if (!refs.has(id) && a.kind !== "font") add(ProjectCode.AssetUnused, "warning", "assets.manifest.json", id, `asset "${id}" is not used by the content`);
  }
  for (const path of [...files.keys()].sort()) {
    if (path.startsWith("assets/") && !used.has(path)) add(ProjectCode.AssetUnused, "warning", path, "", "file is not registered in assets.manifest.json");
  }
  return out;
}
