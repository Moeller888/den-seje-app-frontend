import { LruCache } from "@adventure-engine/media";

/**
 * Fault-tolerant asset manager (spec 06 F8).
 *
 * - Content references asset ids; the manifest maps ids to URLs.
 * - Loads are deduplicated: a second request for an id in flight shares the promise.
 * - Loaded values are cached; failed ids get a placeholder and are not retried
 *   until `retry(id)` is called.
 * - `load` never rejects. Failures (unknown id, loader error) are reported once
 *   per id through `onWarning`, in the order of the requested ids, after the
 *   whole batch settled (deterministic regardless of network timing).
 *
 * The loader is injected, so the manager is independent of Pixi and the DOM.
 */

export interface AssetEntry {
  readonly url: string;
}

export type AssetManifest = Readonly<Record<string, AssetEntry>>;

export type AssetStatus = "unknown" | "loading" | "loaded" | "failed";

export interface AssetManagerOptions<T> {
  readonly manifest: AssetManifest;
  readonly loader: (id: string, url: string) => Promise<T>;
  /** Value used for an asset that could not be loaded. */
  readonly placeholder: (id: string) => T;
  readonly onWarning: (id: string, message: string) => void;
  /**
   * Bounded cache (phase 4, spec 06 F8.3): loaded assets beyond the byte budget
   * are evicted least recently used first, except pinned and acquired ones.
   * `release` frees the browser resource of an evicted asset.
   */
  readonly cache?: { readonly budgetBytes: number; bytes(id: string): number; release(id: string, value: T): void };
}

export interface LoadProgress {
  readonly done: number;
  readonly total: number;
}

export class AssetManager<T> {
  private readonly opts: AssetManagerOptions<T>;
  private readonly values = new Map<string, T>();
  private readonly failed = new Set<string>();
  private readonly inflight = new Map<string, Promise<void>>();
  private readonly failure = new Map<string, string>();
  private readonly lru: LruCache<T> | null;

  constructor(options: AssetManagerOptions<T>) {
    this.opts = options;
    const c = options.cache;
    this.lru =
      c === undefined
        ? null
        : new LruCache<T>(c.budgetBytes, (id, value) => {
            this.values.delete(id);
            c.release(id, value);
          });
  }

  /** Keep these assets loaded (current scene and its portal neighbours). */
  pin(ids: Iterable<string>): void {
    this.lru?.pin(ids);
  }

  /** Mark an asset as in use (never evicted until released). */
  acquire(id: string): void {
    this.lru?.acquire(id);
  }

  release(id: string): void {
    this.lru?.release(id);
  }

  /** Release every cached asset (app destroy). */
  clear(): void {
    this.lru?.clear();
    this.values.clear();
    this.failed.clear();
  }

  status(id: string): AssetStatus {
    if (this.failed.has(id)) return "failed";
    if (this.values.has(id)) return "loaded";
    return this.inflight.has(id) ? "loading" : "unknown";
  }

  /** The loaded value or placeholder; undefined while not requested, still loading or evicted. */
  get(id: string): T | undefined {
    this.lru?.get(id);
    return this.values.get(id);
  }

  /** Forget a failure so that the next `load` tries again. */
  retry(id: string): void {
    if (!this.failed.delete(id)) return;
    this.values.delete(id);
  }

  /** Load the ids (duplicates ignored). Resolves when every id is loaded or replaced by a placeholder. */
  async load(ids: readonly string[], onProgress?: (p: LoadProgress) => void): Promise<void> {
    const unique = [...new Set(ids)];
    const total = unique.length;
    let done = 0;
    const tick = (): void => {
      done += 1;
      onProgress?.({ done, total });
    };
    const fresh: string[] = [];
    const waits = unique.map((id) => {
      if (this.values.has(id)) {
        tick();
        return Promise.resolve();
      }
      let p = this.inflight.get(id);
      if (p === undefined) {
        p = this.fetch(id);
        this.inflight.set(id, p);
        fresh.push(id);
      }
      return p.then(tick);
    });
    onProgress?.({ done, total });
    await Promise.all(waits);
    for (const id of fresh) {
      const message = this.failure.get(id);
      if (message !== undefined) this.opts.onWarning(id, message);
    }
  }

  private async fetch(id: string): Promise<void> {
    const entry = this.opts.manifest[id];
    try {
      if (entry === undefined) throw new Error("not in the asset manifest");
      const value = await this.opts.loader(id, entry.url);
      this.values.set(id, value);
      if (this.lru !== null) this.lru.put(id, value, (this.opts.cache as NonNullable<AssetManagerOptions<T>["cache"]>).bytes(id));
    } catch (err) {
      this.failed.add(id);
      this.failure.set(id, `asset "${id}" could not be loaded (${err instanceof Error ? err.message : String(err)}); placeholder used`);
      this.values.set(id, this.opts.placeholder(id));
    } finally {
      this.inflight.delete(id);
    }
  }
}
