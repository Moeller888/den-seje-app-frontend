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
 */

import { saveIntegrity } from "@adventure-engine/core";
import type { SaveStorage } from "./storage.ts";

export type SlotStatus =
  | { readonly state: "empty" }
  | { readonly state: "ok"; readonly raw: string }
  | { readonly state: "corrupt"; readonly backup: string | null };

export type WriteResult = { readonly ok: true } | { readonly ok: false; readonly message: string };

export const SLOT_NAMES = ["auto", "slot1", "slot2", "slot3", "slot4", "slot5"] as const;

export class SlotManager {
  private readonly storage: SaveStorage;
  readonly prefix: string;

  constructor(storage: SaveStorage, contentId: string) {
    this.storage = storage;
    this.prefix = `engine:${contentId}:`;
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
        if (previous !== null && saveIntegrity(previous) === "ok") this.storage.set(bak, previous);
        else if (this.storage.get(bak) === null) this.storage.set(bak, raw);
        this.storage.set(main, raw);
        this.storage.remove(tmp);
      };
      if (this.storage.transaction !== undefined) this.storage.transaction(run);
      else run();
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  read(slot: string): SlotStatus {
    const raw = this.storage.get(this.key(slot));
    const bak = this.storage.get(this.key(slot, ".bak"));
    if (raw === null && bak === null) return { state: "empty" };
    if (raw !== null && saveIntegrity(raw) === "ok") return { state: "ok", raw };
    return { state: "corrupt", backup: bak !== null && saveIntegrity(bak) === "ok" ? bak : null };
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
      const run = (): void => {
        this.storage.set(this.key(slot), backup);
      };
      if (this.storage.transaction !== undefined) this.storage.transaction(run);
      else run();
      return { ok: true };
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

const order = (slot: string): number => {
  const i = (SLOT_NAMES as readonly string[]).indexOf(slot);
  return i < 0 ? SLOT_NAMES.length : i;
};
