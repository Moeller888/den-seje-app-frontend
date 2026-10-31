/**
 * Cursor presentation (spec 04 D1/D8): the visual mode and the tooltip.
 * Pure; the DOM layer only applies the result.
 */

import type { CursorResult } from "@adventure-engine/core";

export interface CursorView {
  readonly mode: CursorResult["mode"];
  /** Item whose icon is the cursor in `use` mode. */
  readonly item: string | null;
  /** Tooltip text key and, for `use` with a target, the target key. */
  readonly tooltipKey: string | null;
  readonly useItemKey: string | null;
}

export function cursorView(c: CursorResult, nameKeyOf: (id: string) => string | null): CursorView {
  switch (c.mode) {
    case "busy":
    case "walk":
      return { mode: c.mode, item: null, tooltipKey: null, useItemKey: null };
    case "idle":
      return { mode: "idle", item: null, tooltipKey: c.tooltipKey ?? null, useItemKey: null };
    case "use":
      return { mode: "use", item: c.item, tooltipKey: c.target === null ? null : c.tooltipKey, useItemKey: nameKeyOf(c.item) };
    default:
      return { mode: c.mode, item: null, tooltipKey: c.tooltipKey, useItemKey: null };
  }
}
