// Section 173: completion barrier for backgrounded password-help requests.
//
// Extracted from password-help.spec.ts so its semantics can be exercised against fakes in
// tests/unit/password-help-barrier.test.mjs. The spec imports this same module.
//
// WHY COUNTING ROWS IS NOT ENOUGH ANY MORE
// The rate-limit decision now writes its row FIRST and the outcome is filled in afterwards:
//
//     RPC inserts 'reserved'  ->  mail attempted  ->  row finalised to notified/mail_failed
//
// So a row appearing proves only that the request started. A barrier that stopped at "the
// expected number of rows exists" would release while mail and finalisation were still running,
// and the next cleanup could then delete a row out from under a live write.
//
// This barrier therefore waits for COUNT **and** TERMINAL STATUS. 'reserved' is explicitly
// in-progress and never satisfies it.

export const IN_PROGRESS_STATUSES: readonly string[] = ["reserved"];

export interface BarrierRow {
  status: string;
}

export interface BarrierOptions {
  // Total number of rows expected for this student once the request has settled.
  expectedCount: number;
  // The statuses the new rows are allowed to end in. Anything else is a contract violation.
  allowedTerminal: readonly string[];
  timeoutMs: number;
  pollMs: number;
  label: string;
}

export function isTerminal(status: unknown): boolean {
  return typeof status === "string" && IN_PROGRESS_STATUSES.indexOf(status) === -1;
}

export function summarise(rows: BarrierRow[]): string {
  const counts: Record<string, number> = {};
  for (const r of rows) {
    const key = typeof r?.status === "string" ? r.status : "(no status)";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.keys(counts).sort().map((k) => `${k}=${counts[k]}`).join(", ") || "(none)";
}

export interface BarrierDeps {
  // Must throw on a query error — a failed read is never a reason to keep waiting.
  readRows(): Promise<BarrierRow[]>;
  sleep(ms: number): Promise<void>;
  now(): number;
}

// Resolves with the observed rows, or throws with a non-sensitive message.
export async function awaitSettled(deps: BarrierDeps, options: BarrierOptions): Promise<BarrierRow[]> {
  const deadline = deps.now() + options.timeoutMs;

  for (;;) {
    const rows = await deps.readRows(); // a throw here propagates immediately, by design

    if (rows.length > options.expectedCount) {
      throw new Error(
        `${options.label}: saw ${rows.length} rows, expected at most ${options.expectedCount} (${summarise(rows)})`,
      );
    }

    if (rows.length === options.expectedCount) {
      const unfinished = rows.filter((r) => !isTerminal(r?.status));

      if (unfinished.length === 0) {
        const disallowed = rows.filter((r) => options.allowedTerminal.indexOf(r?.status) === -1);
        if (disallowed.length > 0) {
          throw new Error(
            `${options.label}: unexpected terminal status (${summarise(rows)}); ` +
            `allowed: ${options.allowedTerminal.join(", ")}`,
          );
        }
        return rows;
      }
      // else: the count is right but something is still 'reserved' — keep waiting.
    }

    if (deps.now() >= deadline) {
      throw new Error(
        `${options.label}: timed out after ${options.timeoutMs}ms with ${rows.length}/${options.expectedCount} rows (${summarise(rows)})`,
      );
    }

    await deps.sleep(options.pollMs);
  }
}
