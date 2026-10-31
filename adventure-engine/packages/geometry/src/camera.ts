/**
 * Perspective camera over a floor plane (spec 03 C2.1), headless and pure.
 *
 * Coordinates:
 * - Scene coordinates (sx, sy): pixels, origin top-left of the scene.
 * - Floor coordinates (x, y, z): y is height above the floor (0 = on the floor),
 *   z is depth away from the camera. Following the specified formulas exactly,
 *   floor x is mirrored relative to screen x (screen right → negative x). The
 *   two formulas are mutual inverses, so the convention is internally consistent.
 *
 * screenToFloor(sx, sy):
 *   v  = (sx − W/2, −(sy − H·horizon), f);  v' = rotateX(v, tilt)
 *   v'.y ≥ 0 → above the horizon → null
 *   x = h·v'.x / v'.y;  z = −h·v'.z / v'.y
 * floorToScreen(x, y, z):
 *   q = rotateX((x, y − h, z), −tilt);  q.z ≤ 0 → behind the camera → null
 *   sx = −f·q.x/q.z + W/2;  sy = −f·q.y/q.z + H·horizon
 */
import { EPS, type Vec2 } from "./shapes.ts";

export type Vec3 = readonly [number, number, number];

export interface CameraParams {
  /** Focal length f (pixels). */
  readonly focal: number;
  /** Camera height h above the floor (world units). */
  readonly height: number;
  /** Tilt in degrees around the horizontal axis. */
  readonly tilt: number;
  /** Horizon reference as a fraction of the projection height. */
  readonly horizon: number;
  /** Projection plane width W (the scene width, spec 03 C2.1). */
  readonly width: number;
  /** Projection plane height H (the scene height). */
  readonly planeHeight: number;
  /** Extra scale applied to perspective heights (spec 03 C2.2). Default 1. */
  readonly scale?: number;
}

export interface CameraProblem {
  readonly field: string;
  readonly message: string;
}

export function cameraProblems(p: Partial<Record<keyof CameraParams, unknown>>): CameraProblem[] {
  const out: CameraProblem[] = [];
  const num = (field: keyof CameraParams, ok: (v: number) => boolean, rule: string): void => {
    const v = p[field];
    if (typeof v !== "number" || !Number.isFinite(v) || !ok(v)) out.push({ field, message: `${field} must be ${rule}` });
  };
  num("focal", (v) => v > 0, "a number > 0");
  num("height", (v) => v > 0, "a number > 0");
  num("tilt", (v) => v > -89 && v < 89, "a number in (-89, 89) degrees");
  num("horizon", (v) => v >= 0 && v <= 1, "a number in [0, 1]");
  num("width", (v) => v > 0, "a number > 0");
  num("planeHeight", (v) => v > 0, "a number > 0");
  if (p.scale !== undefined) num("scale", (v) => v > 0, "a number > 0");
  return out;
}

export class Camera {
  readonly params: CameraParams;
  private readonly cos: number;
  private readonly sin: number;

  constructor(params: CameraParams) {
    const problems = cameraProblems(params);
    if (problems.length > 0) throw new RangeError(`invalid camera: ${problems.map((p) => p.message).join("; ")}`);
    this.params = params;
    const t = (params.tilt * Math.PI) / 180;
    this.cos = Math.cos(t);
    this.sin = Math.sin(t);
  }

  /** Screen y of the true horizon line (rays at or above it never hit the floor). */
  get horizonY(): number {
    const { focal, planeHeight, horizon } = this.params;
    return planeHeight * horizon - (focal * this.sin) / this.cos;
  }

  screenToFloor(p: Vec2): Vec3 | null {
    const { focal: f, height: h, width: W, planeHeight: H, horizon } = this.params;
    const vx = p[0] - W / 2;
    const vy0 = -(p[1] - H * horizon);
    const vy = vy0 * this.cos - f * this.sin;
    const vz = vy0 * this.sin + f * this.cos;
    if (vy >= -EPS) return null;
    return [(h * vx) / vy + 0, 0, (-h * vz) / vy];
  }

  floorToScreen(p: Vec3): Vec2 | null {
    const { focal: f, height: h, width: W, planeHeight: H, horizon } = this.params;
    const y = p[1] - h;
    const qy = y * this.cos + p[2] * this.sin;
    const qz = -y * this.sin + p[2] * this.cos;
    if (qz <= EPS) return null;
    return [(-f * p[0]) / qz + W / 2, (-f * qy) / qz + H * horizon];
  }

  /** Floor depth z of a scene point on the floor, or null above the horizon. */
  depthAt(p: Vec2): number | null {
    const floor = this.screenToFloor(p);
    return floor === null ? null : floor[2];
  }

  /**
   * On-screen height in pixels of an object `worldHeight` tall standing on the
   * floor at scene point `p`, times the camera scale (spec 03 C2.2). Null above the horizon.
   */
  heightPx(p: Vec2, worldHeight: number): number | null {
    const floor = this.screenToFloor(p);
    if (floor === null) return null;
    const head = this.floorToScreen([floor[0], worldHeight, floor[2]]);
    if (head === null) return null;
    return (p[1] - head[1]) * (this.params.scale ?? 1);
  }
}
