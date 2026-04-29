import type { GlbAnalysisResult } from "./types.ts";

// GLB binary format constants (GLTF 2.0 spec, little-endian)
const GLB_MAGIC = 0x46546C67;    // "glTF"
const GLB_VERSION_2 = 2;
const CHUNK_TYPE_JSON = 0x4E4F534A; // "JSON"
const CHUNK_TYPE_BIN = 0x004E4942;  // "BIN\0"

// TRIANGLES is mode 4 in GLTF; mode is optional and defaults to 4 when absent.
const GLTF_PRIMITIVE_MODE_TRIANGLES = 4;

// PNG file signature (8 bytes)
const PNG_SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

// ── Public entry point ────────────────────────────────────────────────────────

// Parses a GLB binary and extracts all measured values.
// Throws a descriptive Error on any format violation — the caller maps this to a permanent failure.
export function analyzeGlb(bytes: Uint8Array): GlbAnalysisResult {
  const view = buildView(bytes);

  validateHeader(bytes, view);

  const { jsonChunkData, binChunkData } = parseChunks(bytes, view);

  let gltf: Record<string, unknown>;
  try {
    gltf = JSON.parse(new TextDecoder().decode(jsonChunkData));
  } catch {
    throw new Error("GLB JSON chunk could not be parsed as valid JSON");
  }

  if (gltf === null || typeof gltf !== "object" || Array.isArray(gltf)) {
    throw new Error("GLB JSON chunk did not parse to a JSON object");
  }

  const polyCount = countPolygons(gltf);
  const textureInfo = analyzeTextures(gltf, binChunkData);

  return {
    fileSizeBytes: bytes.length,
    polyCount,
    textureEmbedded: textureInfo.embedded,
    textureFormat: textureInfo.format,
    textureWidth: textureInfo.width,
    textureHeight: textureInfo.height,
    attachmentBones: extractNodeNames(gltf),
  };
}

// ── Header validation ─────────────────────────────────────────────────────────

function buildView(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function validateHeader(bytes: Uint8Array, view: DataView): void {
  if (bytes.length < 12) {
    throw new Error(
      `GLB file is too short to contain a valid header (${bytes.length} bytes)`,
    );
  }

  const magic = view.getUint32(0, true);
  if (magic !== GLB_MAGIC) {
    throw new Error(
      `GLB magic mismatch: expected 0x${GLB_MAGIC.toString(16).toUpperCase()}, ` +
        `got 0x${magic.toString(16).toUpperCase()}`,
    );
  }

  const version = view.getUint32(4, true);
  if (version !== GLB_VERSION_2) {
    throw new Error(
      `GLB version mismatch: expected ${GLB_VERSION_2}, got ${version}`,
    );
  }

  const totalLength = view.getUint32(8, true);
  if (totalLength !== bytes.length) {
    throw new Error(
      `GLB length field (${totalLength}) does not match actual file size (${bytes.length})`,
    );
  }
}

// ── Chunk parsing ─────────────────────────────────────────────────────────────

function parseChunks(
  bytes: Uint8Array,
  view: DataView,
): { jsonChunkData: Uint8Array; binChunkData: Uint8Array | null } {
  if (bytes.length < 20) {
    throw new Error("GLB file too short to contain a JSON chunk header");
  }

  const jsonChunkLength = view.getUint32(12, true);
  const jsonChunkType = view.getUint32(16, true);

  if (jsonChunkType !== CHUNK_TYPE_JSON) {
    throw new Error(
      `First GLB chunk must be JSON (0x${CHUNK_TYPE_JSON.toString(16).toUpperCase()}), ` +
        `got 0x${jsonChunkType.toString(16).toUpperCase()}`,
    );
  }

  const jsonStart = 20;
  const jsonEnd = jsonStart + jsonChunkLength;

  if (jsonEnd > bytes.length) {
    throw new Error(
      `JSON chunk extends beyond end of file (chunk end ${jsonEnd}, file size ${bytes.length})`,
    );
  }

  const jsonChunkData = bytes.slice(jsonStart, jsonEnd);

  // BIN chunk is optional — parse it only if bytes remain after JSON chunk.
  const binChunkOffset = jsonEnd;
  let binChunkData: Uint8Array | null = null;

  if (binChunkOffset + 8 <= bytes.length) {
    const binChunkLength = view.getUint32(binChunkOffset, true);
    const binChunkType = view.getUint32(binChunkOffset + 4, true);

    if (binChunkType === CHUNK_TYPE_BIN) {
      const binStart = binChunkOffset + 8;
      const binEnd = binStart + binChunkLength;

      if (binEnd > bytes.length) {
        throw new Error(
          `BIN chunk extends beyond end of file (chunk end ${binEnd}, file size ${bytes.length})`,
        );
      }

      binChunkData = bytes.slice(binStart, binEnd);
    }
  }

  return { jsonChunkData, binChunkData };
}

// ── Polycount ────────────────────────────────────────────────────────────────

// Counts triangles across all mesh primitives.
// Only TRIANGLES mode (4) is counted; other primitive types are skipped.
function countPolygons(gltf: Record<string, unknown>): number {
  const meshes = Array.isArray(gltf["meshes"]) ? gltf["meshes"] : [];
  const accessors = Array.isArray(gltf["accessors"]) ? gltf["accessors"] : [];

  let total = 0;

  for (const mesh of meshes) {
    if (mesh === null || typeof mesh !== "object" || Array.isArray(mesh)) continue;
    const m = mesh as Record<string, unknown>;
    const primitives = Array.isArray(m["primitives"]) ? m["primitives"] : [];

    for (const prim of primitives) {
      if (prim === null || typeof prim !== "object" || Array.isArray(prim)) continue;
      const p = prim as Record<string, unknown>;

      const mode = typeof p["mode"] === "number" ? p["mode"] : GLTF_PRIMITIVE_MODE_TRIANGLES;
      if (mode !== GLTF_PRIMITIVE_MODE_TRIANGLES) continue;

      const attrs = p["attributes"];
      if (attrs === null || typeof attrs !== "object" || Array.isArray(attrs)) continue;
      const attrsObj = attrs as Record<string, unknown>;

      if (typeof p["indices"] === "number") {
        const idx = p["indices"] as number;
        if (idx >= 0 && idx < accessors.length) {
          const acc = accessors[idx] as Record<string, unknown>;
          if (typeof acc["count"] === "number") {
            total += Math.floor((acc["count"] as number) / 3);
          }
        }
      } else if (typeof attrsObj["POSITION"] === "number") {
        const idx = attrsObj["POSITION"] as number;
        if (idx >= 0 && idx < accessors.length) {
          const acc = accessors[idx] as Record<string, unknown>;
          if (typeof acc["count"] === "number") {
            total += Math.floor((acc["count"] as number) / 3);
          }
        }
      }
    }
  }

  return total;
}

// ── Texture analysis ──────────────────────────────────────────────────────────

interface TextureInfo {
  embedded: boolean;
  format: string | null;
  width: number | null;
  height: number | null;
}

// Analyses the first image in the GLTF images array.
// Returns embedded=false and nulls if no images are present.
function analyzeTextures(
  gltf: Record<string, unknown>,
  binChunk: Uint8Array | null,
): TextureInfo {
  const images = Array.isArray(gltf["images"]) ? gltf["images"] : [];
  const bufferViews = Array.isArray(gltf["bufferViews"]) ? gltf["bufferViews"] : [];

  if (images.length === 0) {
    return { embedded: false, format: null, width: null, height: null };
  }

  const firstImage = images[0];
  if (firstImage === null || typeof firstImage !== "object" || Array.isArray(firstImage)) {
    return { embedded: false, format: null, width: null, height: null };
  }

  const img = firstImage as Record<string, unknown>;

  // Embedded via bufferView reference
  if (typeof img["bufferView"] === "number") {
    const format = parseMimeType(
      typeof img["mimeType"] === "string" ? (img["mimeType"] as string) : null,
    );

    const bvIdx = img["bufferView"] as number;
    if (binChunk !== null && bvIdx >= 0 && bvIdx < bufferViews.length) {
      const bv = bufferViews[bvIdx] as Record<string, unknown>;
      const byteOffset = typeof bv["byteOffset"] === "number" ? (bv["byteOffset"] as number) : 0;
      const byteLength = typeof bv["byteLength"] === "number" ? (bv["byteLength"] as number) : 0;

      if (byteLength > 0 && byteOffset + byteLength <= binChunk.length) {
        const imageBytes = binChunk.slice(byteOffset, byteOffset + byteLength);
        const dims = tryParsePngDimensions(imageBytes);
        if (dims !== null) {
          return {
            embedded: true,
            format: format ?? "png",
            width: dims.width,
            height: dims.height,
          };
        }
      }
    }

    return { embedded: true, format, width: null, height: null };
  }

  // URI-referenced image (data URI = embedded, external URI = not embedded)
  if (typeof img["uri"] === "string") {
    const uri = img["uri"] as string;
    if (uri.startsWith("data:")) {
      let format: string | null = null;
      if (uri.startsWith("data:image/png")) format = "png";
      else if (uri.startsWith("data:image/jpeg")) format = "jpeg";
      return { embedded: true, format, width: null, height: null };
    }
    return { embedded: false, format: null, width: null, height: null };
  }

  return { embedded: false, format: null, width: null, height: null };
}

function parseMimeType(mimeType: string | null): string | null {
  if (mimeType === null) return null;
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") return "jpeg";
  const slashIdx = mimeType.indexOf("/");
  if (slashIdx !== -1) return mimeType.slice(slashIdx + 1);
  return null;
}

// ── PNG dimension parser ──────────────────────────────────────────────────────

// Reads width and height from a PNG IHDR chunk.
// Returns null if bytes are not a valid PNG or are too short.
function tryParsePngDimensions(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  // Minimum: 8-byte signature + 4 (IHDR length) + 4 (IHDR type) + 4 (width) + 4 (height) = 24
  if (bytes.length < 24) return null;

  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return null;
  }

  // IHDR chunk type must be bytes 12–15: 'I','H','D','R' = 0x49,0x48,0x44,0x52
  if (
    bytes[12] !== 0x49 || bytes[13] !== 0x48 ||
    bytes[14] !== 0x44 || bytes[15] !== 0x52
  ) {
    return null;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16, false);  // big-endian per PNG spec
  const height = view.getUint32(20, false);

  if (width === 0 || height === 0) return null;

  return { width, height };
}

// ── Attachment bone extraction ────────────────────────────────────────────────

// Returns all non-empty node names from the GLTF JSON.
// The validator rules check whether required slot bones are present in this list.
function extractNodeNames(gltf: Record<string, unknown>): string[] {
  const nodes = Array.isArray(gltf["nodes"]) ? gltf["nodes"] : [];
  const names: string[] = [];

  for (const node of nodes) {
    if (node === null || typeof node !== "object" || Array.isArray(node)) continue;
    const n = node as Record<string, unknown>;
    if (typeof n["name"] === "string" && (n["name"] as string).trim().length > 0) {
      names.push(n["name"] as string);
    }
  }

  return names;
}

// ── Thumbnail validation ──────────────────────────────────────────────────────

export interface ThumbnailValidationError {
  rule_id: string;
  field: string;
  message: string;
}

const THUMBNAIL_MIN_PX = 128;
const THUMBNAIL_MAX_PX = 512;

// Validates that bytes are a square, power-of-2, PNG thumbnail within allowed dimensions.
// Returns null on success, or a ThumbnailValidationError describing the violation.
export function validateThumbnailBytes(
  bytes: Uint8Array,
): ThumbnailValidationError | null {
  if (bytes.length < 24) {
    return {
      rule_id: "RULE-ING-THUMB-001",
      field: "staging_thumbnail_path",
      message: "Thumbnail file is too small to be a valid PNG",
    };
  }

  // Verify PNG signature
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) {
      return {
        rule_id: "RULE-ING-THUMB-002",
        field: "staging_thumbnail_path",
        message: "Thumbnail file is not a valid PNG (signature mismatch)",
      };
    }
  }

  const dims = tryParsePngDimensions(bytes);
  if (dims === null) {
    return {
      rule_id: "RULE-ING-THUMB-003",
      field: "staging_thumbnail_path",
      message: "Could not read dimensions from PNG IHDR chunk",
    };
  }

  if (dims.width !== dims.height) {
    return {
      rule_id: "RULE-ING-THUMB-004",
      field: "staging_thumbnail_path",
      message: `Thumbnail must be square (got ${dims.width}x${dims.height})`,
    };
  }

  if (!isPowerOfTwo(dims.width)) {
    return {
      rule_id: "RULE-ING-THUMB-005",
      field: "staging_thumbnail_path",
      message: `Thumbnail dimensions must be a power of 2 (got ${dims.width}x${dims.height})`,
    };
  }

  if (dims.width < THUMBNAIL_MIN_PX || dims.width > THUMBNAIL_MAX_PX) {
    return {
      rule_id: "RULE-ING-THUMB-006",
      field: "staging_thumbnail_path",
      message: `Thumbnail must be between ${THUMBNAIL_MIN_PX}x${THUMBNAIL_MIN_PX} and ${THUMBNAIL_MAX_PX}x${THUMBNAIL_MAX_PX} (got ${dims.width}x${dims.height})`,
    };
  }

  return null;
}

function isPowerOfTwo(n: number): boolean {
  if (n <= 0) return false;
  return (n & (n - 1)) === 0;
}
