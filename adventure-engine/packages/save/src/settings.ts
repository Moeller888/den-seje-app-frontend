/**
 * User settings (spec 05 E2: stored separately from saves): mute, volumes and
 * language under `engine:<contentId>:settings`. Malformed or missing values
 * fall back to the defaults field by field; unknown fields are ignored.
 */

import type { SaveStorage } from "./storage.ts";

export interface Settings {
  readonly muted: boolean;
  /** Master volume in [0, 1]. */
  readonly master: number;
  readonly language: string | null;
}

export const DEFAULT_SETTINGS: Settings = { muted: false, master: 1, language: null };

export class SettingsStore {
  private readonly storage: SaveStorage;
  private readonly key: string;

  constructor(storage: SaveStorage, contentId: string) {
    this.storage = storage;
    this.key = `engine:${contentId}:settings`;
  }

  load(): Settings {
    const raw = this.storage.get(this.key);
    if (raw === null) return DEFAULT_SETTINGS;
    let d: unknown;
    try {
      d = JSON.parse(raw);
    } catch {
      return DEFAULT_SETTINGS;
    }
    const o = typeof d === "object" && d !== null ? (d as Record<string, unknown>) : {};
    const master = o["master"];
    return {
      muted: typeof o["muted"] === "boolean" ? o["muted"] : DEFAULT_SETTINGS.muted,
      master: typeof master === "number" && master >= 0 && master <= 1 ? master : DEFAULT_SETTINGS.master,
      language: typeof o["language"] === "string" ? o["language"] : DEFAULT_SETTINGS.language,
    };
  }

  /** Store a change; returns the new settings. A failing store keeps playing (the settings are best effort). */
  update(change: Partial<Settings>): Settings {
    const next = { ...this.load(), ...change };
    try {
      this.storage.set(this.key, JSON.stringify(next));
    } catch {
      // Storage full or blocked: the setting applies for this session only.
    }
    return next;
  }
}
