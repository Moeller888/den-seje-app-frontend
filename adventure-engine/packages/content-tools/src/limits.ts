/**
 * Bounds for everything a project import reads (release review, docs/release-readiness.md §6):
 * folders, ZIP archives and single assets. An import that exceeds a bound is
 * refused as a whole, never partially opened.
 */

export const IMPORT_LIMITS = {
  /** Files in one project (folder or ZIP). */
  maxFiles: 5000,
  /** One file (asset or JSON). */
  maxFileBytes: 64 * 1024 * 1024,
  /** All files of a project together (uncompressed). */
  maxTotalBytes: 512 * 1024 * 1024,
  /** Characters of a project-relative path. */
  maxPathLength: 260,
} as const;

export class ImportLimitError extends Error {
  readonly code = "E-IMPORT-LIMIT";

  constructor(message: string) {
    super(message);
    this.name = "ImportLimitError";
  }
}

/**
 * A project-relative POSIX path that stays inside the project: no absolute
 * paths (also not Windows drive or UNC paths), no "." or ".." segments, no
 * empty segments, no control characters, no backslashes.
 */
export function isSafeRelativePath(path: string): boolean {
  if (path === "" || path.length > IMPORT_LIMITS.maxPathLength) return false;
  if (path.startsWith("/") || path.includes("\\") || /^[a-zA-Z]:/.test(path)) return false;
  if (/[\u0000-\u001f]/.test(path)) return false;
  return path.split("/").every((seg) => seg !== "" && seg !== "." && seg !== "..");
}

/** Check a whole file set before it is opened; throws ImportLimitError. */
export function checkFileSet(files: ReadonlyMap<string, Uint8Array>): void {
  if (files.size > IMPORT_LIMITS.maxFiles) throw new ImportLimitError(`too many files (${files.size}; at most ${IMPORT_LIMITS.maxFiles})`);
  let total = 0;
  for (const [path, bytes] of files) {
    if (!isSafeRelativePath(path)) throw new ImportLimitError(`unsafe path "${path}"`);
    if (bytes.length > IMPORT_LIMITS.maxFileBytes) throw new ImportLimitError(`${path} is too large (${bytes.length} bytes; at most ${IMPORT_LIMITS.maxFileBytes})`);
    total += bytes.length;
    if (total > IMPORT_LIMITS.maxTotalBytes) throw new ImportLimitError(`the project is too large (more than ${IMPORT_LIMITS.maxTotalBytes} bytes)`);
  }
}

/** A file name for downloads: letters, digits, "._-" only (others become "-"), never empty. */
export function safeFileName(name: string, fallback = "download"): string {
  const s = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 120);
  return s === "" ? fallback : s;
}
