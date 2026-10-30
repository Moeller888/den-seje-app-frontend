/**
 * Save slots (spec 05 E3/E5, phase 5).
 *
 * Keys: `<prefix><slot>`, `<prefix><slot>.tmp`, `<prefix><slot>.bak`, with the
 * prefix `engine:<contentId>:` (spec 05 E5).
 *
 * Atomic write: the new save goes to `.tmp`, is read back and verified, then the
 * previous valid main file becomes `.bak` and `.tmp` becomes the main file. An
 * interruption at any point leaves the previous main file (or `.bak`) intact
 * (TS-E09).
 *
 * Phase 5 decision: on the first save of a slot there is no previous version,
 * so `.bak` receives a verified copy of the new save. A slot whose main file is
 * damaged therefore always offers a valid `.bak` once it has been written once.
 *
 * Valid (follow-up: slot status) means more than a matching checksum: with a
 * `loadable` check (the app passes one that parses the save against the
 * current content) a save that no longer loads, e.g. after a content update,
 * is not shown as "ok", and its `.bak` is offered only when that loads. Each
 * verdict is cached by the stored text, so listing the slots again does not
 * parse or migrate the same save again.
 */

import { saveIntegrity } from "@adventure-engine/core";
import type { SaveStorage } from "./storage.ts";

export type SlotStatus =
  | { readonly state: "empty" }
  | { readonly state: "ok"; readonly raw: string }
  /** `reason`: "damaged" (missing, changed or unreadable bytes) or "unloadable" (intact, but this content cannot load it). */
  | { readonly state: "corrupt"; readonly backup: string | null; readonly reason: "damaged" | "unloadable" };

/**
 * Outcome of a slot write. `ok` means the write reached the in-memory view;
 * `committed` resolves when this very write reached the store (true) or
 * failed there (false). Synchronous stores resolve it with true at once.
 */
export type WriteResult = { readonly ok: true; readonly committed: Promise<boolean> } | { readonly ok: false; readonly message: string };

export interface SlotOptions {
  /** Whether an intact save can be loaded by the running content (default: every intact save can). */
  readonly loadable?: (raw: string) => boolean;
}

/** Verdicts kept per stored text; a slot listing needs at most 2 × 6. */
const VERDICT_CACHE = 32;

export const SLOT_NAMES = ["auto", "slot1", "slot2", "slot3", "slot4", "slot5"] as const;

export class SlotManager {
  private readonly storage: SaveStorage;
  readonly prefix: string;

  private readonly loadable: ((raw: string) => boolean) | undefined;
  private readonly verdicts = new Map<string, SlotValidity>();

  constructor(storage: SaveStorage, contentId: string, options: SlotOptions = {}) {
    this.storage = storage;
    this.prefix = `engine:${contentId}:`;
    this.loadable = options.loadable;
  }

  /** Intact (checksum) and loadable, cached by text: the same save is never parsed twice for a listing. */
  private validity(raw: string): SlotValidity {
    const known = this.verdicts.get(raw);
    if (known !== undefined) return known;
    const v: SlotValidity = saveIntegrity(raw) !== "ok" ? "damaged" : this.loadable !== undefined && !this.loadsSafely(raw, this.loadable) ? "unloadable" : "ok";
    if (this.verdicts.size >= VERDICT_CACHE) this.verdicts.clear();
    this.verdicts.set(raw, v);
    return v;
  }

  /** A check that throws (e.g. a migration bug) counts as "cannot load": the slot list and new saves keep working. */
  private loadsSafely(raw: string, loadable: (raw: string) => boolean): boolean {
    try {
      return loadable(raw);
    } catch {
      return false;
    }
  }

  /** Run writes as one unit where the store has them; the promise is this unit's commit result. */
  private atomically(run: () => void): Promise<boolean> {
    if (this.storage.transaction === undefined) {
      run();
      return Promise.resolve(true);
    }
    return this.storage.transaction(run) ?? Promise.resolve(true);
  }

  private key(slot: string, suffix = ""): string {
    if (!/^[a-z0-9_-]+$/i.test(slot)) throw new RangeError(`invalid slot name "${slot}"`);
    return `${this.prefix}${slot}${suffix}`;
  }

  /** Atomically store a (valid) save text in a slot. Never throws; a failed write keeps the old save. */
  write(slot: string, raw: string): WriteResult {
    if (saveIntegrity(raw) !== "ok") return { ok: false, message: "refusing to store a save that does not verify" };
    const main = this.key(slot);
    const tmp = this.key(slot, ".tmp");
    const bak = this.key(slot, ".bak");
    try {
      const run = (): void => {
        this.storage.set(tmp, raw);
        if (this.storage.get(tmp) !== raw) throw new Error("read-back of the temporary file differs");
        const previous = this.storage.get(main);
        if (previous !== null && this.validity(previous) === "ok") this.storage.set(bak, previous);
        else if (this.storage.get(bak) === null) this.storage.set(bak, raw);
        this.storage.set(main, raw);
        this.storage.remove(tmp);
      };
      return { ok: true, committed: this.atomically(run) };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  read(slot: string): SlotStatus {
    const raw = this.storage.get(this.key(slot));
    const bak = this.storage.get(this.key(slot, ".bak"));
    if (raw === null && bak === null) return { state: "empty" };
    const main = raw === null ? "damaged" : this.validity(raw);
    if (main === "ok") return { state: "ok", raw: raw as string };
    return { state: "corrupt", backup: bak !== null && this.validity(bak) === "ok" ? bak : null, reason: main };
  }

  /** A damaged main file with a valid `.bak` (spec 05 E5: "<slot>.bak tilbydes"). */
  offersBackup(slot: string): boolean {
    const s = this.read(slot);
    return s.state === "corrupt" && s.backup !== null;
  }

  /** Make the backup the main file again. */
  restoreBackup(slot: string): WriteResult {
    const s = this.read(slot);
    if (s.state !== "corrupt" || s.backup === null) return { ok: false, message: "no backup to restore" };
    const backup = s.backup;
    try {
      return { ok: true, committed: this.atomically(() => this.storage.set(this.key(slot), backup)) };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  remove(slot: string): void {
    for (const suffix of ["", ".tmp", ".bak"]) this.storage.remove(this.key(slot, suffix));
  }

  /** Raw main text (tests and export); null when empty. */
  rawMain(slot: string): string | null {
    return this.storage.get(this.key(slot));
  }

  /** Overwrite the main file with arbitrary bytes (fault injection in tests and scenarios). */
  damage(slot: string, bytes: string): void {
    this.storage.set(this.key(slot), bytes);
  }

  /** Slots with something stored (main or backup), in slot order. */
  used(): string[] {
    const names = new Set(
      this.storage
        .keys(this.prefix)
        .map((k) => k.slice(this.prefix.length).replace(/\.(tmp|bak)$/, ""))
        .filter((n) => n !== "settings"),
    );
    // `keys` is sorted and Array.prototype.sort is stable: equal ranks stay alphabetical.
    return [...names].sort((a, b) => order(a) - order(b));
  }
}

type SlotValidity = "ok" | "damaged" | "unloadable";

const order = (slot: string): number => {
  const i = (SLOT_NAMES as readonly string[]).indexOf(slot);
  return i < 0 ? SLOT_NAMES.length : i;
};
