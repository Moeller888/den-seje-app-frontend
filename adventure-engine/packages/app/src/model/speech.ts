/**
 * Speech bubble placement (spec 06 F5, decision 04 D6.1, TS-D12): inside the
 * speaker's speech region when the scene defines one, otherwise centred above
 * the speaker's head. The bubble is always kept inside the viewport.
 */

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface BubbleInput {
  /** Speech region in scene coordinates (unvalidated content). */
  readonly region: unknown;
  /** Speaker feet in scene coordinates; null when the speaker is not in the scene. */
  readonly feet: readonly [number, number] | null;
  /** Speaker height in scene pixels (hit box height or rendered height). */
  readonly speakerHeight: number;
  readonly scrollX: number;
  readonly bubble: { readonly width: number; readonly height: number };
  readonly viewport: { readonly width: number; readonly height: number };
  /** Space kept free at the bottom (inventory edge). */
  readonly bottomInset?: number;
}

export interface BubblePlacement {
  readonly x: number;
  readonly y: number;
  readonly source: "region" | "head" | "centre";
}

const MARGIN = 8;
const HEAD_GAP = 16;

/** A speech region is usable when it has four finite numbers and a positive size. */
export function regionOf(v: unknown): Rect | null {
  if (typeof v !== "object" || v === null) return null;
  const r = v as Record<string, unknown>;
  const nums = [r["x"], r["y"], r["width"], r["height"]];
  if (!nums.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  const [x, y, width, height] = nums as [number, number, number, number];
  return width > 0 && height > 0 ? { x, y, width, height } : null;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), Math.max(lo, hi));

export function placeBubble(i: BubbleInput): BubblePlacement {
  const maxX = i.viewport.width - i.bubble.width - MARGIN;
  const maxY = i.viewport.height - (i.bottomInset ?? 0) - i.bubble.height - MARGIN;
  const region = regionOf(i.region);
  if (region !== null) {
    const x = region.x - i.scrollX + (region.width - i.bubble.width) / 2;
    const y = region.y + (region.height - i.bubble.height) / 2;
    return { x: clamp(x, MARGIN, maxX), y: clamp(y, MARGIN, maxY), source: "region" };
  }
  if (i.feet !== null) {
    const x = i.feet[0] - i.scrollX - i.bubble.width / 2;
    const y = i.feet[1] - i.speakerHeight - HEAD_GAP - i.bubble.height;
    return { x: clamp(x, MARGIN, maxX), y: clamp(y, MARGIN, maxY), source: "head" };
  }
  return { x: clamp((i.viewport.width - i.bubble.width) / 2, MARGIN, maxX), y: MARGIN * 4, source: "centre" };
}
