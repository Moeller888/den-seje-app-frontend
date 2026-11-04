/**
 * Deterministic event trace (spec 10 §4). One JSON object per line with
 * `t` and `kind` first; field order is fixed by the emitter.
 */
export interface TraceEvent {
  readonly t: number;
  readonly kind: string;
  readonly [field: string]: unknown;
}

export class Tracer {
  private readonly list: TraceEvent[] = [];
  private readonly clock: () => number;
  readonly enabled: boolean;

  constructor(clock: () => number, enabled = true) {
    this.clock = clock;
    this.enabled = enabled;
  }

  emit(kind: string, fields: Record<string, unknown> = {}): void {
    if (!this.enabled) return;
    this.list.push({ t: roundTime(this.clock()), kind, ...fields });
  }

  get events(): readonly TraceEvent[] {
    return this.list;
  }

  toJSONL(): string {
    return this.list.map((e) => JSON.stringify(e)).join("\n") + (this.list.length > 0 ? "\n" : "");
  }
}

/** Times are reported with at most 3 decimals so tick-based times stay byte-stable. */
export function roundTime(ms: number): number {
  return Math.round(ms * 1000) / 1000;
}
