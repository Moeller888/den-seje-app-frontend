/**
 * Key-value storage for saves and settings (spec 05 E5, phase 5).
 *
 * The interface is synchronous so that the engine, the headless scenario runner
 * and the browser share one slot implementation:
 * - `MemoryStorage`: headless runs and tests (with fault injection, TS-E09);
 * - `WebStorage`: browser `localStorage` (the fallback store);
 * - `IndexedDbMirror`: the primary browser store. All records are read into
 *   memory once at start (async), reads are then synchronous, and every
 *   `transaction` is committed to IndexedDB as one atomic IDB transaction.
 *
 * Browser objects are typed structurally, so the package needs no DOM typings
 * and is unit-tested with fakes.
 */

export interface SaveStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  keys(prefix: string): string[];
  /**
   * Run several writes as one unit where the store supports it (IndexedDB). A store that commits later
   * resolves with that unit's own result; a synchronous store returns nothing (the writes are done).
   */
  transaction?(fn: () => void): Promise<boolean> | void;
}

/** In-memory store. `failAt` makes the n-th following write throw (fault injection for interrupted writes). */
export class MemoryStorage implements SaveStorage {
  readonly data = new Map<string, string>();
  private failCountdown: number | null = null;

  failAfterWrites(n: number): void {
    this.failCountdown = n;
  }

  get(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  set(key: string, value: string): void {
    if (this.failCountdown !== null) {
      if (this.failCountdown === 0) {
        this.failCountdown = null;
        throw new Error(`simulated interruption while writing "${key}"`);
      }
      this.failCountdown--;
    }
    this.data.set(key, value);
  }

  remove(key: string): void {
    this.data.delete(key);
  }

  keys(prefix: string): string[] {
    return [...this.data.keys()].filter((k) => k.startsWith(prefix)).sort();
  }
}

/** The subset of the Web Storage API used (`localStorage`). */
export interface WebStorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class WebStorage implements SaveStorage {
  private readonly s: WebStorageLike;

  constructor(storage: WebStorageLike) {
    this.s = storage;
  }

  get(key: string): string | null {
    return this.s.getItem(key);
  }

  set(key: string, value: string): void {
    this.s.setItem(key, value);
  }

  remove(key: string): void {
    this.s.removeItem(key);
  }

  keys(prefix: string): string[] {
    const out: string[] = [];
    for (let i = 0; i < this.s.length; i++) {
      const k = this.s.key(i);
      if (k !== null && k.startsWith(prefix)) out.push(k);
    }
    return out.sort();
  }
}

/** The subset of IndexedDB used, typed structurally. */
export interface IdbRequestLike<T> {
  result: T;
  error: unknown;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
}

export interface IdbDatabaseLike {
  readonly objectStoreNames: { contains(name: string): boolean };
  createObjectStore(name: string): unknown;
  transaction(store: string, mode: "readonly" | "readwrite"): IdbTransactionLike;
  close(): void;
}

export interface IdbTransactionLike {
  objectStore(name: string): IdbStoreLike;
  oncomplete: (() => void) | null;
  onerror: (() => void) | null;
  onabort: (() => void) | null;
  /** Browsers have it; a failure thrown while queueing calls it so no part of the batch is committed. */
  abort?(): void;
}

/** A write request: its `error` (e.g. quota) is reported like the transaction's. */
export interface IdbWriteRequestLike {
  onerror: (() => void) | null;
}

export interface IdbStoreLike {
  put(value: string, key: string): IdbWriteRequestLike | void;
  delete(key: string): IdbWriteRequestLike | void;
  getAllKeys(): IdbRequestLike<unknown[]>;
  getAll(): IdbRequestLike<unknown[]>;
}

export interface IdbFactoryLike {
  open(name: string, version: number): IdbRequestLike<IdbDatabaseLike> & { onupgradeneeded: (() => void) | null };
}

export const IDB_NAME = "engine-saves";
export const IDB_STORE = "slots";

type Op = ["put", string, string] | ["delete", string];

/** A commit not settled yet: its writes and, per key, the value before its first write (null: no record). */
interface Pending {
  readonly ops: Op[];
  readonly before: Map<string, string | null>;
}

/**
 * IndexedDB with an in-memory mirror. `open` reads every record once; writes
 * update the mirror at once and are committed in order; a `transaction` is
 * committed as one IDB transaction.
 *
 * Every commit has its own result (follow-up F4), so one failure is reported
 * exactly once and never to another operation:
 * - `transaction(fn)` resolves with the result of that batch; the caller
 *   reports a failure (a slot write), and `onError` is not called for it;
 * - a single `set`/`remove` outside a batch (settings) has no caller waiting,
 *   so its failure goes to `onError`;
 * - `flush()` keeps no state: it waits for the commits still pending when it
 *   is called and says whether they all succeeded, so ignoring its result
 *   hides nothing and moves nothing.
 * A browser fires `error` on the request, then on the transaction, then
 * `abort`; only the first counts. A failure (also one thrown synchronously,
 * e.g. a closed connection) never stops later commits.
 *
 * Rollback (follow-up review): the mirror changes at once, so a failed commit
 * (or a `transaction` whose `fn` throws) puts back, for every key it wrote,
 * the value from before its first write to that key — or removes a key that
 * did not exist. If a later commit that has not settled yet wrote the same
 * key, the mirror keeps that later value and the later commit inherits the
 * older value as its own "before": should it fail as well, the mirror goes
 * back to what the store really holds. So the mirror never shows a write the
 * store does not have once the commits have settled, and a slot write that
 * follows a failed one sees the store's real previous save (and keeps it in
 * `.held` when needed).
 */
export class IndexedDbMirror implements SaveStorage {
  private readonly db: IdbDatabaseLike;
  private readonly mirror: Map<string, string>;
  /** The batch being collected by `transaction`, with the promise its caller (and nested calls) receive. */
  private batch: { readonly pending: Pending; readonly result: Promise<boolean>; failed: boolean } | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private readonly pending = new Set<Promise<boolean>>();
  /** Commits not settled yet, in commit order (the order of the chain). */
  private readonly unsettled: Pending[] = [];
  /** Failures of commits no caller waits for (single writes outside a batch). */
  onError: (err: unknown) => void = () => {};

  private constructor(db: IdbDatabaseLike, mirror: Map<string, string>) {
    this.db = db;
    this.mirror = mirror;
  }

  /** Open (and create) the database and read all records. Rejects when IndexedDB is unusable. */
  static async open(factory: IdbFactoryLike): Promise<IndexedDbMirror> {
    const db = await new Promise<IdbDatabaseLike>((resolve, reject) => {
      const req = factory.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction(IDB_STORE, "readonly");
    const store = tx.objectStore(IDB_STORE);
    const [keys, values] = await Promise.all([request(store.getAllKeys()), request(store.getAll())]);
    const mirror = new Map<string, string>();
    keys.forEach((k, i) => {
      const v = values[i];
      if (typeof k === "string" && typeof v === "string") mirror.set(k, v);
    });
    return new IndexedDbMirror(db, mirror);
  }

  get(key: string): string | null {
    return this.mirror.get(key) ?? null;
  }

  set(key: string, value: string): void {
    this.write(["put", key, value]);
  }

  remove(key: string): void {
    this.write(["delete", key]);
  }

  /** Record the value before the commit's first write to `key`, change the mirror, and queue the op. */
  private write(op: Op): void {
    const target = this.batch?.pending ?? this.open();
    const key = op[1];
    if (!target.before.has(key)) target.before.set(key, this.mirror.get(key) ?? null);
    if (op[0] === "put") this.mirror.set(key, op[2]);
    else this.mirror.delete(key);
    target.ops.push(op);
    if (this.batch === null) void this.commit(target, true);
  }

  /** A new commit, last in commit order. */
  private open(): Pending {
    const p: Pending = { ops: [], before: new Map() };
    this.unsettled.push(p);
    return p;
  }

  /** Settle a commit: on failure, undo its writes in the mirror unless a later unsettled commit wrote the key. */
  private settle(p: Pending, ok: boolean): void {
    const at = this.unsettled.indexOf(p);
    this.unsettled.splice(at, 1);
    if (ok) return;
    for (const [key, value] of p.before) {
      const later = this.unsettled.slice(at).find((q) => q.before.has(key));
      if (later !== undefined) later.before.set(key, value);
      else if (value === null) this.mirror.delete(key);
      else this.mirror.set(key, value);
    }
  }

  keys(prefix: string): string[] {
    return [...this.mirror.keys()].filter((k) => k.startsWith(prefix)).sort();
  }

  /**
   * Run `fn` and commit its writes as one IDB transaction. Resolves with true
   * when that transaction completed, false when it failed (also when `fn`
   * throws: nothing is committed then, and the mirror is rolled back). A
   * nested call joins the outer batch, shares its "before" values and
   * receives its result. If a nested callback throws, the whole outer batch
   * fails — even when the outer callback catches the error: it is rolled back
   * and never committed, so no half of an inner unit can reach the store.
   */
  transaction(fn: () => void): Promise<boolean> {
    const outer = this.batch;
    if (outer !== null) {
      try {
        fn();
      } catch (err) {
        outer.failed = true;
        throw err;
      }
      return outer.result;
    }
    let settle!: (ok: boolean) => void;
    const batch = { pending: this.open(), result: new Promise<boolean>((resolve) => (settle = resolve)), failed: false };
    this.batch = batch;
    try {
      fn();
    } catch (err) {
      this.batch = null;
      this.settle(batch.pending, false);
      settle(false);
      throw err;
    }
    this.batch = null;
    if (batch.failed) {
      this.settle(batch.pending, false);
      settle(false);
    } else void this.commit(batch.pending, false).then(settle);
    return batch.result;
  }

  /** Commit after the previous commits; `report` sends a failure to `onError` (nobody else waits for it). */
  private commit(p: Pending, report: boolean): Promise<boolean> {
    if (p.ops.length === 0) {
      this.settle(p, true);
      return Promise.resolve(true);
    }
    const run = (): Promise<boolean> =>
      new Promise<boolean>((resolve) => {
        let settled = false;
        const finish = (ok: boolean, err?: unknown): void => {
          // The request, the transaction's error and its abort all fire for one failure: only the first counts.
          if (settled) return;
          settled = true;
          this.settle(p, ok);
          resolve(ok);
          if (!ok && report) this.onError(err);
        };
        let tx: IdbTransactionLike | null = null;
        try {
          tx = this.db.transaction(IDB_STORE, "readwrite");
          const store = tx.objectStore(IDB_STORE);
          const failed = (): void => finish(false, new Error("IndexedDB transaction failed"));
          for (const op of p.ops) {
            const req = op[0] === "put" ? store.put(op[2], op[1]) : store.delete(op[1]);
            if (typeof req === "object" && req !== null) req.onerror = failed;
          }
          tx.oncomplete = () => finish(true);
          tx.onerror = tx.onabort = failed;
        } catch (err) {
          // Thrown synchronously (closed connection, uncloneable value): reported, and the chain goes on.
          // Abort what was queued already, so the store keeps none of this batch (the mirror is rolled back).
          try {
            tx?.abort?.();
          } catch {
            // Already finished or never started: nothing of the batch can commit then.
          }
          finish(false, err);
        }
      });
    // `run` never rejects, so the chain can never be poisoned.
    const result = this.chain.then(run);
    this.chain = result;
    this.pending.add(result);
    void result.then(() => this.pending.delete(result));
    return result;
  }

  /**
   * Resolves when the commits pending at this call have finished: true when they all succeeded. Keeps no state.
   * Narrower than `SlotManager.flush`: a slot operation still queued behind an earlier one on its slot has not
   * reached this store yet and is not waited for.
   */
  async flush(): Promise<boolean> {
    const results = await Promise.all([...this.pending]);
    return results.every(Boolean);
  }

  close(): void {
    this.db.close();
  }
}

function request<T>(req: IdbRequestLike<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
