/**
 * Reference-counted modal locks with owner handles (spec 04 D7).
 * A lock is released exactly once; double release is a no-op that returns false.
 */
export interface ModalLock {
  readonly handle: number;
  readonly reason: string;
  readonly owner: string;
}

export class ModalLocks {
  private nextHandle = 1;
  private readonly active = new Map<number, ModalLock>();
  private readonly onChange: (event: "acquire" | "release", lock: ModalLock, count: number) => void;

  constructor(onChange: (event: "acquire" | "release", lock: ModalLock, count: number) => void = () => {}) {
    this.onChange = onChange;
  }

  acquire(reason: string, owner: string): number {
    const lock: ModalLock = { handle: this.nextHandle++, reason, owner };
    this.active.set(lock.handle, lock);
    this.onChange("acquire", lock, this.active.size);
    return lock.handle;
  }

  release(handle: number): boolean {
    const lock = this.active.get(handle);
    if (lock === undefined) return false;
    this.active.delete(handle);
    this.onChange("release", lock, this.active.size);
    return true;
  }

  get count(): number {
    return this.active.size;
  }

  get isModal(): boolean {
    return this.active.size > 0;
  }

  list(): ModalLock[] {
    return [...this.active.values()];
  }
}
