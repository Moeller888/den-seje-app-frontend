/**
 * Opening and saving projects (phase 6, docs/decisions/phase-6.md §9).
 *
 * - File System Access API (where the browser has it): open a project folder,
 *   save back into it, "save as" into another folder. Every file is written
 *   with createWritable(), which writes to a temporary swap file and replaces
 *   the target only on close() (atomic per file); project.json is written last
 *   and project files that no longer exist (a renamed scene) are removed.
 * - Fallback: open a folder through a file input, or a project ZIP; save and
 *   export download a ZIP.
 * - Recovery: a draft of the unsaved project in the editor's own IndexedDB
 *   database "adventure-editor-recovery" (never the game's save database).
 */

import { IMPORT_LIMITS, ImportLimitError, checkFileSet, readZip, writeZip } from "@adventure-engine/content-tools";

/** The parts of the File System Access API the editor uses (typed structurally). */
interface FsFileHandle {
  readonly kind: "file";
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: BufferSource | Blob | string): Promise<void>; close(): Promise<void>; abort(): Promise<void> }>;
}
export interface FsDirHandle {
  readonly kind: "directory";
  readonly name: string;
  values(): AsyncIterable<FsFileHandle | FsDirHandle>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FsDirHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FsFileHandle>;
  removeEntry(name: string): Promise<void>;
}

type PickerWindow = Window & { showDirectoryPicker?: (options?: { mode?: "read" | "readwrite"; id?: string }) => Promise<FsDirHandle> };

export const hasFsAccess = (): boolean => typeof (window as PickerWindow).showDirectoryPicker === "function";

export async function pickDirectory(): Promise<FsDirHandle> {
  const picker = (window as PickerWindow).showDirectoryPicker;
  if (picker === undefined) throw new Error("Browseren kan ikke åbne mapper direkte; brug filvalg eller ZIP.");
  return picker({ mode: "readwrite", id: "adventure-project" });
}

const SKIP = new Set([".git", "node_modules"]);

/** Read a project folder; refused as a whole when it exceeds the import limits. */
export async function readDirectory(dir: FsDirHandle): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>();
  let total = 0;
  const walk = async (d: FsDirHandle, prefix: string): Promise<void> => {
    for await (const entry of d.values()) {
      if (SKIP.has(entry.name) || entry.name.startsWith(".")) continue;
      if (entry.kind === "directory") {
        await walk(entry, `${prefix}${entry.name}/`);
        continue;
      }
      const file = await entry.getFile();
      total += file.size;
      if (out.size >= IMPORT_LIMITS.maxFiles || file.size > IMPORT_LIMITS.maxFileBytes || total > IMPORT_LIMITS.maxTotalBytes) {
        throw new ImportLimitError(`the folder is too large (at most ${IMPORT_LIMITS.maxFiles} files, ${IMPORT_LIMITS.maxFileBytes} bytes per file)`);
      }
      out.set(`${prefix}${entry.name}`, new Uint8Array(await file.arrayBuffer()));
    }
  };
  await walk(dir, "");
  checkFileSet(out);
  return new Map([...out].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
}

/** Whether a folder holds any entries (save-as into a non-empty folder asks first). */
export async function isEmptyDirectory(dir: FsDirHandle): Promise<boolean> {
  for await (const entry of dir.values()) {
    if (!entry.name.startsWith(".")) return false;
  }
  return true;
}

/** Project JSON files the editor owns (they may be removed when they are no longer part of the project). */
async function dirFor(root: FsDirHandle, path: string): Promise<{ dir: FsDirHandle; name: string }> {
  const parts = path.split("/");
  const name = parts.pop() as string;
  let dir = root;
  for (const p of parts) dir = await dir.getDirectoryHandle(p, { create: true });
  return { dir, name };
}

/**
 * Write a project into a folder. `previous` are the files the editor owns in
 * that folder (see `ownedFiles`); those that are gone from the project are
 * removed afterwards. No other file is ever deleted.
 */
export async function writeDirectory(root: FsDirHandle, files: ReadonlyMap<string, Uint8Array>, previous: ReadonlySet<string>): Promise<void> {
  const ordered = [...files.keys()].sort((a, b) => (a === "project.json" ? 1 : b === "project.json" ? -1 : a < b ? -1 : 1));
  for (const path of ordered) {
    const { dir, name } = await dirFor(root, path);
    const handle = await dir.getFileHandle(name, { create: true });
    const w = await handle.createWritable();
    try {
      await w.write(files.get(path) as Uint8Array as BufferSource);
      await w.close();
    } catch (err) {
      await w.abort();
      throw err;
    }
  }
  // On Windows and macOS "scenes/Attic.json" and "scenes/attic.json" are one file: a path that was
  // just written under another case is never deleted.
  const written = new Set([...files.keys()].map((p) => p.toLowerCase()));
  for (const path of previous) {
    if (written.has(path.toLowerCase())) continue;
    const { dir, name } = await dirFor(root, path);
    await dir.removeEntry(name).catch(() => undefined);
  }
}

/** Files chosen with <input webkitdirectory>; the chosen folder's own name is removed from the paths. */
export async function filesFromInput(list: FileList): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>();
  // Sizes are checked before anything is read.
  const all = [...list];
  if (all.length > IMPORT_LIMITS.maxFiles) throw new ImportLimitError(`too many files (${all.length})`);
  if (all.some((f) => f.size > IMPORT_LIMITS.maxFileBytes) || all.reduce((n, f) => n + f.size, 0) > IMPORT_LIMITS.maxTotalBytes) throw new ImportLimitError("the folder is too large");
  for (const f of all) {
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath ?? f.name;
    const path = rel.includes("/") ? rel.slice(rel.indexOf("/") + 1) : rel;
    if (path.split("/").some((p) => SKIP.has(p) || p.startsWith("."))) continue;
    out.set(path, new Uint8Array(await f.arrayBuffer()));
  }
  checkFileSet(out);
  return new Map([...out].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
}

/**
 * Inflate raw DEFLATE data with the browser's DecompressionStream (for ZIPs
 * made by other tools); stops as soon as more than `maxBytes` come out (ZIP bombs).
 */
async function inflateRaw(data: Uint8Array, maxBytes: number): Promise<Uint8Array> {
  const reader = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) {
      await reader.cancel();
      throw new ImportLimitError("a ZIP entry unpacks to more than its declared size");
    }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export async function filesFromZip(file: Blob): Promise<Map<string, Uint8Array>> {
  if (file.size > IMPORT_LIMITS.maxTotalBytes) throw new ImportLimitError("the ZIP file is too large");
  const files = await readZip(new Uint8Array(await file.arrayBuffer()), inflateRaw);
  checkFileSet(files);
  return files;
}

export const zipOf = (files: ReadonlyMap<string, Uint8Array>): Uint8Array => writeZip(files);

// ---------------------------------------------------------------------------
// Recovery draft (separate from game saves)
// ---------------------------------------------------------------------------

export const RECOVERY_DB = "adventure-editor-recovery";
const STORE = "drafts";
const KEY = "current";

export interface Draft {
  readonly name: string;
  readonly savedAt: string;
  readonly zip: Uint8Array;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(RECOVERY_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = f(t.objectStore(STORE));
      t.oncomplete = () => resolve(req.result);
      t.onerror = t.onabort = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

export async function saveDraft(d: Draft): Promise<void> {
  await tx("readwrite", (s) => s.put(d, KEY));
}

export async function loadDraft(): Promise<Draft | null> {
  const d = await tx<unknown>("readonly", (s) => s.get(KEY));
  if (typeof d !== "object" || d === null) return null;
  const r = d as Record<string, unknown>;
  return typeof r["name"] === "string" && typeof r["savedAt"] === "string" && r["zip"] instanceof Uint8Array ? (d as Draft) : null;
}

export async function clearDraft(): Promise<void> {
  await tx("readwrite", (s) => s.delete(KEY));
}
