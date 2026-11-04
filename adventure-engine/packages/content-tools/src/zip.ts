/**
 * Minimal ZIP container (phase 6, §9): the fallback for browsers without the
 * File System Access API (open/save a project as one file). Writing uses the
 * "stored" method with fixed timestamps, so the same files always give the
 * same archive. Reading accepts stored entries and, through an injected
 * `inflateRaw`, deflated ones (the browser passes DecompressionStream).
 *
 * Reading is bounded (limits.ts): number of entries, declared and actual size
 * per entry and in total (ZIP bombs), safe relative paths only (zip-slip), no
 * duplicate names. Any violation refuses the whole archive.
 */

import { IMPORT_LIMITS, ImportLimitError, isSafeRelativePath } from "./limits.ts";

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = (CRC_TABLE[(c ^ b) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** 1980-01-01 00:00 in DOS format: archives do not depend on the clock. */
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;
const UTF8_FLAG = 0x0800;

export function writeZip(files: ReadonlyMap<string, Uint8Array>): Uint8Array {
  const enc = new TextEncoder();
  const entries = [...files].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([name, data]) => ({ name: enc.encode(name), data, crc: crc32(data) }));
  const local = entries.reduce((n, e) => n + 30 + e.name.length + e.data.length, 0);
  const central = entries.reduce((n, e) => n + 46 + e.name.length, 0);
  const out = new Uint8Array(local + central + 22);
  const v = new DataView(out.buffer);
  let at = 0;
  const offsets: number[] = [];
  for (const e of entries) {
    offsets.push(at);
    v.setUint32(at, 0x04034b50, true);
    v.setUint16(at + 4, 20, true);
    v.setUint16(at + 6, UTF8_FLAG, true);
    v.setUint16(at + 8, 0, true);
    v.setUint16(at + 10, DOS_TIME, true);
    v.setUint16(at + 12, DOS_DATE, true);
    v.setUint32(at + 14, e.crc, true);
    v.setUint32(at + 18, e.data.length, true);
    v.setUint32(at + 22, e.data.length, true);
    v.setUint16(at + 26, e.name.length, true);
    v.setUint16(at + 28, 0, true);
    out.set(e.name, at + 30);
    out.set(e.data, at + 30 + e.name.length);
    at += 30 + e.name.length + e.data.length;
  }
  const cdStart = at;
  entries.forEach((e, i) => {
    v.setUint32(at, 0x02014b50, true);
    v.setUint16(at + 4, 20, true);
    v.setUint16(at + 6, 20, true);
    v.setUint16(at + 8, UTF8_FLAG, true);
    v.setUint16(at + 10, 0, true);
    v.setUint16(at + 12, DOS_TIME, true);
    v.setUint16(at + 14, DOS_DATE, true);
    v.setUint32(at + 16, e.crc, true);
    v.setUint32(at + 20, e.data.length, true);
    v.setUint32(at + 24, e.data.length, true);
    v.setUint16(at + 28, e.name.length, true);
    v.setUint32(at + 42, offsets[i] as number, true);
    out.set(e.name, at + 46);
    at += 46 + e.name.length;
  });
  v.setUint32(at, 0x06054b50, true);
  v.setUint16(at + 8, entries.length, true);
  v.setUint16(at + 10, entries.length, true);
  v.setUint32(at + 12, at - cdStart, true);
  v.setUint32(at + 16, cdStart, true);
  return out;
}

/** Inflate raw DEFLATE data; must stop with an error once more than `maxBytes` would be produced. */
export type InflateRaw = (data: Uint8Array, maxBytes: number) => Promise<Uint8Array>;

/**
 * Read a ZIP archive into a path → bytes map. Directories are skipped; a
 * common top folder (as created by "compress folder") is removed; paths with
 * ".." or absolute paths are refused.
 */
export async function readZip(bytes: Uint8Array, inflateRaw?: InflateRaw): Promise<Map<string, Uint8Array>> {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a ZIP archive");
  const count = v.getUint16(eocd + 10, true);
  if (count > IMPORT_LIMITS.maxFiles) throw new ImportLimitError(`too many entries in ZIP (${count}; at most ${IMPORT_LIMITS.maxFiles})`);
  // Pass 1: the whole central directory is checked (paths, duplicates, sizes) before anything is unpacked.
  interface Entry {
    readonly name: string;
    readonly method: number;
    readonly crc: number;
    readonly size: number;
    readonly declared: number;
    readonly start: number;
  }
  const entries: Entry[] = [];
  const seen = new Set<string>();
  let total = 0;
  let at = v.getUint32(eocd + 16, true);
  const dec = new TextDecoder("utf-8");
  for (let i = 0; i < count; i++) {
    if (at + 46 > bytes.length || v.getUint32(at, true) !== 0x02014b50) throw new Error("damaged ZIP directory");
    const method = v.getUint16(at + 10, true);
    const crc = v.getUint32(at + 16, true);
    const size = v.getUint32(at + 20, true);
    const declared = v.getUint32(at + 24, true);
    const nameLen = v.getUint16(at + 28, true);
    const extraLen = v.getUint16(at + 30, true);
    const commentLen = v.getUint16(at + 32, true);
    const offset = v.getUint32(at + 42, true);
    const name = dec.decode(bytes.subarray(at + 46, at + 46 + nameLen)).replace(/\\/g, "/");
    at += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith("/")) continue;
    if (!isSafeRelativePath(name)) throw new ImportLimitError(`unsafe path in ZIP: ${name}`);
    if (seen.has(name)) throw new ImportLimitError(`duplicate entry in ZIP: ${name}`);
    seen.add(name);
    if (declared > IMPORT_LIMITS.maxFileBytes) throw new ImportLimitError(`${name} is too large (${declared} bytes)`);
    total += declared;
    if (total > IMPORT_LIMITS.maxTotalBytes) throw new ImportLimitError("the archive is too large when unpacked");
    if (offset + 30 > bytes.length || start0(offset, v) + size > bytes.length) throw new Error(`damaged ZIP entry ${name}`);
    entries.push({ name, method, crc, size, declared, start: start0(offset, v) });
  }
  // Pass 2: unpack, each entry bounded by its declared size and checked against its CRC.
  const raw = new Map<string, Uint8Array>();
  for (const e of entries) {
    let data: Uint8Array;
    if (e.method === 0) data = bytes.slice(e.start, e.start + e.size);
    else if (e.method === 8 && inflateRaw !== undefined) data = await inflateRaw(bytes.slice(e.start, e.start + e.size), e.declared);
    else throw new Error(`unsupported ZIP compression (method ${e.method}) for ${e.name}`);
    if (data.length !== e.declared) throw new Error(`size mismatch for ${e.name}`);
    if (crc32(data) !== e.crc) throw new Error(`CRC mismatch for ${e.name}`);
    raw.set(e.name, data);
  }
  const names = [...raw.keys()];
  const top = names[0]?.split("/")[0];
  const shared = top !== undefined && names.every((n) => n.startsWith(`${top}/`)) && !names.includes("project.json");
  return new Map([...raw].map(([n, d]) => [shared ? n.slice((top as string).length + 1) : n, d] as const).sort((a, b) => (a[0] < b[0] ? -1 : 1)));
}

/** Start of an entry's data from its local header. */
function start0(offset: number, v: DataView): number {
  return offset + 30 + v.getUint16(offset + 26, true) + v.getUint16(offset + 28, true);
}
