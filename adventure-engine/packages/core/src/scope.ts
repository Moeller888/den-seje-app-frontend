import type { Value } from "@adventure-engine/content";
import { EngineError, EngineErrorCode } from "./errors.ts";

/**
 * Global variables (spec 01 A3). Persisted. Reading an unknown name yields
 * `false` WITHOUT creating it.
 */
export class Globals {
  private readonly values = new Map<string, Value>();

  constructor(initial: Readonly<Record<string, Value>> = {}) {
    for (const [k, v] of Object.entries(initial)) this.values.set(k, v);
  }

  get(name: string): Value {
    const v = this.values.get(name);
    return v === undefined ? false : v;
  }

  has(name: string): boolean {
    return this.values.has(name);
  }

  set(name: string, value: Value): void {
    if (name.startsWith("$")) throw new EngineError(EngineErrorCode.CtxWrite, `cannot write context key "${name}" as a global`);
    this.values.set(name, value);
  }

  /** Forget a variable (devtools); reading it afterwards yields `false` again. */
  delete(name: string): boolean {
    return this.values.delete(name);
  }

  /** Written variables in insertion order. */
  entries(): Array<[string, Value]> {
    return [...this.values.entries()];
  }
}

/**
 * Read-only context frame chain (spec 02 B6.1). Keys always start with "$".
 */
export class ContextFrame {
  private readonly values: ReadonlyMap<string, Value>;
  readonly parent: ContextFrame | null;

  private constructor(values: ReadonlyMap<string, Value>, parent: ContextFrame | null) {
    this.values = values;
    this.parent = parent;
  }

  static root(values: Readonly<Record<string, Value | null>> = {}): ContextFrame {
    return new ContextFrame(ContextFrame.toMap(values), null);
  }

  extend(values: Readonly<Record<string, Value | null>>): ContextFrame {
    return new ContextFrame(ContextFrame.toMap(values), this);
  }

  get(key: string): Value | undefined {
    const own = this.values.get(key);
    if (own !== undefined) return own;
    for (let f = this.parent; f !== null; f = f.parent) {
      const v = f.values.get(key);
      if (v !== undefined) return v;
    }
    return undefined;
  }

  /** Flattened view (nearest frame wins), keys sorted for deterministic traces. */
  flatten(): Record<string, Value> {
    const out: Record<string, Value> = {};
    const frames: ContextFrame[] = [this];
    for (let f = this.parent; f !== null; f = f.parent) frames.push(f);
    for (const f of frames.reverse()) for (const [k, v] of f.values) out[k] = v;
    return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));
  }

  private static toMap(values: Readonly<Record<string, Value | null>>): Map<string, Value> {
    const m = new Map<string, Value>();
    for (const [k, v] of Object.entries(values)) {
      if (!k.startsWith("$")) throw new EngineError(EngineErrorCode.BadArgument, `context key "${k}" must start with "$"`);
      // null means "no value" (e.g. $from on the first scene) and reads as false.
      if (v !== null) m.set(k, v);
    }
    return m;
  }
}

/** Variable lookup for expressions: "$…" → context, otherwise globals; unknown → false. */
export function lookup(name: string, globals: Globals, ctx: ContextFrame): Value {
  if (name.startsWith("$")) {
    const v = ctx.get(name);
    return v === undefined ? false : v;
  }
  return globals.get(name);
}
