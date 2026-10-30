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
}

export interface IdbStoreLike {
  put(value: string, key: string): unknown;
  delete(key: string): unknown;
  getAllKeys(): IdbRequestLike<unknown[]>;
  getAll(): IdbRequestLike<unknown[]>;
}

export interface IdbFactoryLike {
  open(name: string, version: number): IdbRequestLike<IdbDatabaseLike> & { onupgradeneeded: (() => void) | null };
}

export const IDB_NAME = "engine-saves";
export const IDB_STORE = "slots";

type Op = ["put", string, string] | ["delete", string];

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
 * A browser fires both `error` and `abort` for a failed transaction; only the
 * first counts. A failure (also one thrown synchronously, e.g. a closed
 * connection) never stops later commits.
 */
export class IndexedDbMirror implements SaveStorage {
  private readonly db: IdbDatabaseLike;
  private readonly mirror: Map<string, string>;
  /** The batch being collected by `transaction`, with the promise its caller (and nested calls) receive. */
  private batch: { readonly ops: Op[]; readonly result: Promise<boolean> } | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private readonly pending = new Set<Promise<boolean>>();
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
    this.mirror.set(key, value);
    this.queue(["put", key, value]);
  }

  remove(key: string): void {
    this.mirror.delete(key);
    this.queue(["delete", key]);
  }

  keys(prefix: string): string[] {
    return [...this.mirror.keys()].filter((k) => k.startsWith(prefix)).sort();
  }

  /**
   * Run `fn` and commit its writes as one IDB transaction. Resolves with true
   * when that transaction completed, false when it failed (also when `fn`
   * throws: nothing is committed then). A nested call joins the outer batch
   * and receives its result.
   */
  transaction(fn: () => void): Promise<boolean> {
    if (this.batch !== null) {
      fn();
      return this.batch.result;
    }
    let settle!: (ok: boolean) => void;
    const batch = { ops: [] as Op[], result: new Promise<boolean>((resolve) => (settle = resolve)) };
    this.batch = batch;
    try {
      fn();
    } catch (err) {
      settle(false);
      throw err;
    } finally {
      this.batch = null;
    }
    void this.commit(batch.ops, false).then(settle);
    return batch.result;
  }

  private queue(op: Op): void {
    if (this.batch !== null) this.batch.ops.push(op);
    else void this.commit([op], true);
  }

  /** Commit `ops` after the previous commits; `report` sends a failure to `onError` (nobody else waits for it). */
  private commit(ops: readonly Op[], report: boolean): Promise<boolean> {
    if (ops.length === 0) return Promise.resolve(true);
    const run = (): Promise<boolean> =>
      new Promise<boolean>((resolve) => {
        let settled = false;
        const finish = (ok: boolean, err?: unknown): void => {
          // error and abort both fire for one failed transaction: only the first counts.
          if (settled) return;
          settled = true;
          resolve(ok);
          if (!ok && report) this.onError(err);
        };
        try {
          const tx = this.db.transaction(IDB_STORE, "readwrite");
          const store = tx.objectStore(IDB_STORE);
          for (const op of ops) {
            if (op[0] === "put") store.put(op[2], op[1]);
            else store.delete(op[1]);
          }
          tx.oncomplete = () => finish(true);
          tx.onerror = tx.onabort = () => finish(false, new Error("IndexedDB transaction failed"));
        } catch (err) {
          // Thrown synchronously (closed connection, uncloneable value): reported, and the chain goes on.
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

  /** Resolves when the commits pending at this call have finished: true when they all succeeded. Keeps no state. */
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
