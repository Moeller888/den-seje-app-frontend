/**
 * Format choice for audio and video assets (spec 06 F4/F6 "the asset manager
 * chooses the supported format"): the first listed format the browser can play
 * wins; a format without a type is assumed playable; `url` is the last resort.
 */

import type { ManifestEntry } from "@adventure-engine/content";

export interface ChosenFormat {
  readonly url: string;
  readonly type: string | null;
  readonly bytes: number;
}

/** `canPlay(type)` is e.g. `HTMLMediaElement.canPlayType(type) !== ""`. */
export function chooseFormat(entry: ManifestEntry, canPlay: (type: string) => boolean): ChosenFormat | null {
  for (const f of entry.formats ?? []) {
    if (f.type === undefined || canPlay(f.type)) return { url: f.url, type: f.type ?? null, bytes: f.bytes ?? entry.bytes ?? 0 };
  }
  return entry.url === undefined ? null : { url: entry.url, type: null, bytes: entry.bytes ?? 0 };
}
