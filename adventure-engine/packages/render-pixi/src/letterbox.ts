/**
 * Responsive letterbox viewport (spec 06 F2.2): the logical resolution is scaled
 * uniformly to fit the container and centred; the remaining bands stay empty.
 *
 * Pure functions only. Coordinates:
 * - client: CSS pixels relative to the container's top-left corner
 * - logical: viewport pixels of the game (default 1280 × 720)
 */

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Letterbox {
  /** CSS pixels per logical pixel. */
  readonly scale: number;
  /** Top-left corner of the game area inside the container (CSS pixels). */
  readonly offsetX: number;
  readonly offsetY: number;
  /** Size of the game area (CSS pixels). */
  readonly width: number;
  readonly height: number;
}

const valid = (s: Size): boolean => Number.isFinite(s.width) && Number.isFinite(s.height) && s.width > 0 && s.height > 0;

/** Fit `logical` into `container`. A container without area gives scale 0 (nothing visible, no hits). */
export function letterbox(container: Size, logical: Size): Letterbox {
  if (!valid(logical)) throw new RangeError(`logical size must be positive, got ${logical.width}×${logical.height}`);
  if (!valid(container)) return { scale: 0, offsetX: 0, offsetY: 0, width: 0, height: 0 };
  const scale = Math.min(container.width / logical.width, container.height / logical.height);
  const width = logical.width * scale;
  const height = logical.height * scale;
  return { scale, offsetX: (container.width - width) / 2, offsetY: (container.height - height) / 2, width, height };
}

/** Tolerance in logical pixels for points on the edge of the game area (floating-point round-off). */
const EDGE_EPS = 1e-6;

const clampEdge = (v: number, max: number): number | null => (v < -EDGE_EPS || v > max + EDGE_EPS ? null : Math.min(max, Math.max(0, v)));

/** Client point → logical point, or null when it lies in a letterbox band (or nothing is visible). */
export function clientToLogical(p: readonly [number, number], box: Letterbox, logical: Size): [number, number] | null {
  if (box.scale <= 0) return null;
  const x = clampEdge((p[0] - box.offsetX) / box.scale, logical.width);
  const y = clampEdge((p[1] - box.offsetY) / box.scale, logical.height);
  return x === null || y === null ? null : [x, y];
}

/** Logical point → client point (inverse of `clientToLogical` inside the game area). */
export function logicalToClient(p: readonly [number, number], box: Letterbox): [number, number] {
  return [box.offsetX + p[0] * box.scale, box.offsetY + p[1] * box.scale];
}
