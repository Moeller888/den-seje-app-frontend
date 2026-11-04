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
 *
 * Rotation (follow-up review). The guarantee: the main file that an operation
 * displaces is never lost silently during that operation. It is not an
 * unlimited history. Before the main file is replaced, by a new save or by
 * restoring the backup:
 * - a loadable main file becomes `.bak`: one generation of ordinary backup,
 *   so the older `.bak` goes (even an intact one this content cannot load);
 * - an intact main file this content cannot load (e.g. written by a newer
 *   build) is copied byte for byte to `<slot>.held`, and `.bak` stays as it is;
 * - a damaged main file is not kept (its bytes are no save any more).
 * `.held` keeps only the most recently displaced such save; a later one
 * replaces it. The copy is read back before the main file is touched, and all
 * writes run as one unit where the store has them (an IndexedDB failure rolls
 * the mirror back), so an interruption at any step leaves the displaced save
 * in the main file or in `.held`. `.held` is not offered in the slot list and
 * has no restore button yet (this content cannot load it); it stays for a
 * build that can, and `remove` deletes it with the slot.
 *
 * Order (follow-up reviews): `write`, `restoreBackup` (also "continue from
 * backup") and `remove` on one slot run one after another, in call order;
 * each plans from what the store holds once the previous one has committed or
 * been rolled back. `remove` deletes main, `.tmp`, `.bak` and `.held` in one
 * unit, so once it has committed no earlier operation can bring the slot
 * back. A failed operation does not block later ones; other slots are
 * independent. `flush()` waits for every operation started or queued before
 * it, including its store commit.
 */

import { saveIntegrity } from "@adventure-engine/core";
import type { SaveStorage } from "./storage.ts";

export type SlotStatus =
  | { readonly state: "empty" }
  | { readonly state: "ok"; readonly raw: string }
  /** `reason`: "damaged" (missing, changed or unreadable bytes) or "unloadable" (intact, but this content cannot load it). */
  | { readonly state: "corrupt"; readonly backup: string | null; readonly reason: "damaged" | "unloadable" };

/**
 * Outcome of a slot operation. `ok: false` is a refusal or failure known at
 * once (with its message). `ok: true` means the operation was accepted: it
 * reached the in-memory view, or it waits behind an earlier operation on the
 * same slot. `committed` resolves when this very operation reached the store
 * (true) or failed or was refused there (false). Synchronous stores resolve
 * it with true at once.
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
  /** Per slot: the commit of its last operation that has not settled yet. */
  private readonly busy = new Map<string, Promise<boolean>>();
  /** Every operation that has not settled yet, queued or committing (for `flush`). */
  private readonly unsettled = new Set<Promise<boolean>>();

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

  /**
   * Run writes as one unit where the store has them. Returns the unit's commit result, or null when the
   * store committed synchronously. The promise never rejects (a rejected commit counts as failed).
   */
  private atomically(run: () => void): Promise<boolean> | null {
    if (this.storage.transaction === undefined) {
      run();
      return null;
    }
    const committed = this.storage.transaction(run);
    return committed === undefined ? null : committed.then(
      (ok) => ok,
      () => false,
    );
  }

  /**
   * Operations per slot run one after another (follow-up review): while a slot has a commit that has not
   * settled, the next operation on it waits, and only then reads main, `.bak` and `.held` and plans its
   * rotation — from what the store really holds, after a failed commit was rolled back. `plan` returns a
   * refusal message, or the writes to run. Other slots are independent; a synchronous store never waits.
   * A queued operation answers `ok` at once; its `committed` resolves false if it is refused or fails.
   */
  private operate(slot: string, plan: () => string | (() => void)): WriteResult {
    this.key(slot);
    const before = this.busy.get(slot);
    if (before === undefined) return this.execute(slot, plan, true);
    const committed = before.then(() => {
      const r = this.execute(slot, plan, false);
      return r.ok ? r.committed : false;
    });
    this.track(slot, committed);
    return { ok: true, committed };
  }

  /**
   * Resolves when every slot operation started or queued before this call has settled, including its
   * store commit: true when they all committed. Operations queued later are not waited for. Keeps no state.
   */
  async flush(): Promise<boolean> {
    const results = await Promise.all([...this.unsettled]);
    return results.every(Boolean);
  }

  private execute(slot: string, plan: () => string | (() => void), track: boolean): WriteResult {
    try {
      const step = plan();
      if (typeof step === "string") return { ok: false, message: step };
      const committed = this.atomically(step);
      if (committed === null) return { ok: true, committed: Promise.resolve(true) };
      if (track) this.track(slot, committed);
      return { ok: true, committed };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  /** The slot's last operation; it is forgotten once it settled and nothing newer was queued. */
  private track(slot: string, committed: Promise<boolean>): void {
    this.busy.set(slot, committed);
    this.unsettled.add(committed);
    // `committed` never rejects (see atomically); this only clears the entries.
    void committed.then(() => {
      this.unsettled.delete(committed);
      if (this.busy.get(slot) === committed) this.busy.delete(slot);
    });
  }

  private key(slot: string, suffix = ""): string {
    if (!/^[a-z0-9_-]+$/i.test(slot)) throw new RangeError(`invalid slot name "${slot}"`);
    return `${this.prefix}${slot}${suffix}`;
  }

  /** Copy an intact main file this content cannot load to `.held`, verified, before the main file is replaced. */
  private holdUnloadable(slot: string, previous: string | null): void {
    if (previous === null || this.validity(previous) !== "unloadable") return;
    const held = this.key(slot, ".held");
    if (this.storage.get(held) === previous) return;
    this.storage.set(held, previous);
    if (this.storage.get(held) !== previous) throw new Error("read-back of the held save differs");
  }

  /** Atomically store a (valid) save text in a slot. Never throws; a failed write keeps the old save. */
  write(slot: string, raw: string): WriteResult {
    if (saveIntegrity(raw) !== "ok") return { ok: false, message: "refusing to store a save that does not verify" };
    const main = this.key(slot);
    const tmp = this.key(slot, ".tmp");
    const bak = this.key(slot, ".bak");
    return this.operate(slot, () => () => {
      this.storage.set(tmp, raw);
      if (this.storage.get(tmp) !== raw) throw new Error("read-back of the temporary file differs");
      const previous = this.storage.get(main);
      if (previous !== null && this.validity(previous) === "ok") this.storage.set(bak, previous);
      else {
        this.holdUnloadable(slot, previous);
        if (this.storage.get(bak) === null) this.storage.set(bak, raw);
      }
      this.storage.set(main, raw);
      this.storage.remove(tmp);
    });
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

  /** Make the backup the main file again; an intact main file this content cannot load is kept in `.held` first. */
  restoreBackup(slot: string): WriteResult {
    const main = this.key(slot);
    return this.operate(slot, () => {
      const s = this.read(slot);
      if (s.state !== "corrupt" || s.backup === null) return "no backup to restore";
      const backup = s.backup;
      return () => {
        this.holdUnloadable(slot, this.storage.get(main));
        this.storage.set(main, backup);
      };
    });
  }

  /** Delete the slot: main, `.tmp`, `.bak` and `.held` as one unit, queued like `write` (see the order above). */
  remove(slot: string): WriteResult {
    const keys = ["", ".tmp", ".bak", ".held"].map((suffix) => this.key(slot, suffix));
    return this.operate(slot, () => () => {
      for (const k of keys) this.storage.remove(k);
    });
  }

  /** Raw main text (tests and export); null when empty. */
  rawMain(slot: string): string | null {
    return this.storage.get(this.key(slot));
  }

  /** The intact save kept in `.held` (see the rotation above); null when there is none. */
  held(slot: string): string | null {
    return this.storage.get(this.key(slot, ".held"));
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
        .map((k) => k.slice(this.prefix.length).replace(/\.(tmp|bak|held)$/, ""))
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
