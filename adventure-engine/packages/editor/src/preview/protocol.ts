/**
 * Editor ↔ preview page protocol and the preview's save storage (phase 6, §10).
 * DOM-free so it can be unit-tested.
 *
 * Isolation: the preview runs in its own document, receives a JSON copy of the
 * bundle (it can never change the editor's document) and saves into memory
 * only, so it never reads or writes the player's saves or settings.
 */

import type { ContentPackage, MediaManifest } from "@adventure-engine/content";
import { MemoryStorage, type SaveStorage } from "@adventure-engine/save";

export type ToPreview = { readonly type: "load"; readonly bundle: { readonly content: ContentPackage; readonly manifest: MediaManifest }; readonly urls: Readonly<Record<string, string>> };

export type FromPreview =
  | { readonly type: "ready" }
  | { readonly type: "started" }
  | { readonly type: "warnings"; readonly list: ReadonlyArray<{ readonly code: string; readonly message: string }> }
  | { readonly type: "error"; readonly message: string };

/** The preview's save services: memory only, never the browser's persistent stores. */
export function previewServices(): { readonly storage: SaveStorage; readonly kind: string; flush(): Promise<void> } {
  return { storage: new MemoryStorage(), kind: "memory", flush: () => Promise.resolve() };
}

/** The bundle's manifest with every asset url replaced by the editor's object URL for that file. */
export function localManifest(manifest: MediaManifest, urls: Readonly<Record<string, string>>): MediaManifest {
  const swap = (url: string): string => urls[url] ?? url;
  return Object.fromEntries(
    Object.entries(manifest).map(([id, e]) => [id, { ...e, ...(e.url !== undefined ? { url: swap(e.url) } : {}), ...(e.formats !== undefined ? { formats: e.formats.map((f) => ({ ...f, url: swap(f.url) })) } : {}) }]),
  );
}
