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
  /** Run several writes as one unit where the store supports it (IndexedDB); otherwise just run them. */
  transaction?(fn: () => void): void;
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

/**
 * IndexedDB with an in-memory mirror. `open` reads every record once; writes
 * update the mirror at once and are committed in order; a `transaction` is
 * committed as one IDB transaction. `flush()` resolves when every commit has
 * finished; a failed commit is reported through `onError`.
 */
export class IndexedDbMirror implements SaveStorage {
  private readonly db: IdbDatabaseLike;
  private readonly mirror: Map<string, string>;
  private batch: Array<["put", string, string] | ["delete", string]> | null = null;
  private chain: Promise<void> = Promise.resolve();
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
    this.queue([["put", key, value]]);
  }

  remove(key: string): void {
    this.mirror.delete(key);
    this.queue([["delete", key]]);
  }

  keys(prefix: string): string[] {
    return [...this.mirror.keys()].filter((k) => k.startsWith(prefix)).sort();
  }

  transaction(fn: () => void): void {
    const outer = this.batch;
    const ops: Array<["put", string, string] | ["delete", string]> = [];
    this.batch = ops;
    try {
      fn();
    } finally {
      this.batch = outer;
    }
    this.queue(ops);
  }

  private queue(ops: Array<["put", string, string] | ["delete", string]>): void {
    if (this.batch !== null && ops !== this.batch) {
      this.batch.push(...ops);
      return;
    }
    if (ops.length === 0) return;
    this.chain = this.chain.then(
      () =>
        new Promise<void>((resolve) => {
          const tx = this.db.transaction(IDB_STORE, "readwrite");
          const store = tx.objectStore(IDB_STORE);
          for (const op of ops) {
            if (op[0] === "put") store.put(op[2], op[1]);
            else store.delete(op[1]);
          }
          tx.oncomplete = () => resolve();
          tx.onerror = tx.onabort = () => {
            this.onError(new Error("IndexedDB transaction failed"));
            resolve();
          };
        }),
    );
  }

  /** Resolves when every queued commit has finished. */
  flush(): Promise<void> {
    return this.chain;
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
