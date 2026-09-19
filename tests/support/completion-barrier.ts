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
//
// WHY THE BASELINE EXISTS
// The audit table is shared by every test in the serial chain, and several tests deliberately
// leave rows behind: a seeded 'notified' row is how a student is put inside the cooldown without
// sending real mail, and the next test then relies on that cooldown still being in place. Judging
// EVERY row for the student made those deliberate rows look like outcomes of the call under test,
// so a test could fail for a row it never produced — which is exactly what happened on 1bcc70f9
// and again on a249de1.
//
// The caller therefore hands over the ids that existed BEFORE the call. A row whose id is not in
// that set is one THIS call produced, and only those rows are counted and status-checked. The
// full row set is still returned, so the caller's own assertions about the table as a whole keep
// their meaning.
//
// Identity is the row's primary key (`password_help_requests.id`, a UUID), never its position:
// the rows arrive newest-first, but nothing here depends on that order.

export const IN_PROGRESS_STATUSES: readonly string[] = ["reserved"];

export interface BarrierRow {
  // Primary key. The barrier refuses to guess when it is missing — see requireId().
  id: string;
  status: string;
}

export interface BarrierOptions {
  // Ids of the rows that already existed before the call under test. Every observed row whose id
  // is absent from this set is treated as produced BY that call.
  baselineIds: readonly string[];
  // How many NEW rows the call must produce. A count is a fine thing to WAIT for; it is not
  // evidence of WHICH rows are new, and it is never used as such.
  expectedNew: number;
  // The statuses the NEW rows are allowed to end in. Anything else is a contract violation.
  // Baseline rows are not judged by it — they are not this call's outcome.
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

// Ids are row identifiers for a real student's audit trail, so they are never put in an error
// message — the messages stay status-only, exactly like summarise().
function requireId(value: unknown, label: string, origin: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label}: ${origin} without a usable id — cannot tell new rows from existing ones`);
  }
  return value;
}

// Fail closed on a baseline that cannot be trusted: a duplicate or missing id there would silently
// mis-classify rows, which is the whole failure mode this barrier exists to prevent.
function baselineSet(ids: readonly string[], label: string): Set<string> {
  const set = new Set<string>();
  for (const raw of ids ?? []) {
    const id = requireId(raw, label, "baseline entry");
    if (set.has(id)) {
      throw new Error(`${label}: the baseline lists the same row id twice — it cannot be a reliable reference`);
    }
    set.add(id);
  }
  return set;
}

export interface BarrierDeps {
  // Must throw on a query error — a failed read is never a reason to keep waiting.
  readRows(): Promise<BarrierRow[]>;
  sleep(ms: number): Promise<void>;
  now(): number;
}

// Resolves with ALL observed rows, or throws with a non-sensitive message.
export async function awaitSettled(deps: BarrierDeps, options: BarrierOptions): Promise<BarrierRow[]> {
  const baseline = baselineSet(options.baselineIds, options.label);
  const deadline = deps.now() + options.timeoutMs;

  for (;;) {
    const rows = await deps.readRows(); // a throw here propagates immediately, by design

    // Split by identity, not by position or arrival order.
    const seen = new Set<string>();
    const fresh: BarrierRow[] = [];
    for (const row of rows) {
      const id = requireId(row?.id, options.label, "audit row");
      if (seen.has(id)) {
        throw new Error(`${options.label}: the same row id appeared twice in one read — the table cannot be read reliably`);
      }
      seen.add(id);
      if (!baseline.has(id)) fresh.push(row);
    }

    if (fresh.length > options.expectedNew) {
      throw new Error(
        `${options.label}: saw ${fresh.length} new rows, expected at most ${options.expectedNew} (new: ${summarise(fresh)})`,
      );
    }

    if (fresh.length === options.expectedNew) {
      const unfinished = fresh.filter((r) => !isTerminal(r?.status));

      if (unfinished.length === 0) {
        const disallowed = fresh.filter((r) => options.allowedTerminal.indexOf(r?.status) === -1);
        if (disallowed.length > 0) {
          throw new Error(
            `${options.label}: unexpected terminal status (${summarise(fresh)}); ` +
            `allowed: ${options.allowedTerminal.join(", ")}`,
          );
        }
        return rows;
      }
      // else: the count is right but something is still 'reserved' — keep waiting.
    }

    if (deps.now() >= deadline) {
      throw new Error(
        `${options.label}: timed out after ${options.timeoutMs}ms with ${fresh.length}/${options.expectedNew} ` +
        `new rows (new: ${summarise(fresh)}; all: ${summarise(rows)})`,
      );
    }

    await deps.sleep(options.pollMs);
  }
}
