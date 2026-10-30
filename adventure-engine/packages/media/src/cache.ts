/**
 * Bounded LRU cache for loaded media (spec 06 F8.3, phase 4).
 *
 * - Entries carry a byte size (from the manifest); the budget is configurable.
 * - Pinned keys (current scene, neighbour scenes) and keys in use (playing
 *   sounds, videos, animations on screen) are never evicted.
 * - Eviction runs after `put`, `unpin` and `release`, least recently used
 *   first, and calls `release(key, value)` so the owner frees the browser
 *   resource (texture, audio buffer, video element).
 * Nothing here allocates the media itself, so behaviour is testable with sizes only.
 */

export interface CacheStats {
  readonly bytes: number;
  readonly entries: number;
  readonly evictions: number;
}

export class LruCache<V> {
  readonly budgetBytes: number;
  private readonly onEvict: (key: string, value: V) => void;
  /** Insertion order = recency order (oldest first). */
  private readonly map = new Map<string, { value: V; bytes: number }>();
  private readonly users = new Map<string, number>();
  private pinned = new Set<string>();
  private bytes_ = 0;
  private evictions = 0;

  constructor(budgetBytes: number, onEvict: (key: string, value: V) => void) {
    if (!(budgetBytes >= 0)) throw new RangeError(`budget must be ≥ 0, got ${budgetBytes}`);
    this.budgetBytes = budgetBytes;
    this.onEvict = onEvict;
  }

  get stats(): CacheStats {
    return { bytes: this.bytes_, entries: this.map.size, evictions: this.evictions };
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  /** Read and mark as most recently used. */
  get(key: string): V | undefined {
    const e = this.map.get(key);
    if (e === undefined) return undefined;
    this.map.delete(key);
    this.map.set(key, e);
    return e.value;
  }

  put(key: string, value: V, bytes: number): void {
    const old = this.map.get(key);
    if (old !== undefined) {
      this.map.delete(key);
      this.bytes_ -= old.bytes;
      if (old.value !== value) this.onEvict(key, old.value);
    }
    const size = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
    this.map.set(key, { value, bytes: size });
    this.bytes_ += size;
    this.evict();
  }

  /** Replace the pinned set (e.g. current scene + portal neighbours). */
  pin(keys: Iterable<string>): void {
    this.pinned = new Set(keys);
    this.evict();
  }

  isPinned(key: string): boolean {
    return this.pinned.has(key);
  }

  /** Mark a key as in use (never evicted until released as often). */
  acquire(key: string): void {
    this.users.set(key, (this.users.get(key) ?? 0) + 1);
  }

  release(key: string): void {
    const n = (this.users.get(key) ?? 0) - 1;
    if (n > 0) this.users.set(key, n);
    else this.users.delete(key);
    this.evict();
  }

  private evict(): void {
    if (this.bytes_ <= this.budgetBytes) return;
    for (const [key, e] of [...this.map]) {
      if (this.bytes_ <= this.budgetBytes) break;
      if (this.pinned.has(key) || this.users.has(key)) continue;
      this.map.delete(key);
      this.bytes_ -= e.bytes;
      this.evictions++;
      this.onEvict(key, e.value);
    }
  }

  /** Release everything (app destroy). */
  clear(): void {
    for (const [key, e] of [...this.map]) this.onEvict(key, e.value);
    this.map.clear();
    this.users.clear();
    this.pinned.clear();
    this.bytes_ = 0;
  }
}
