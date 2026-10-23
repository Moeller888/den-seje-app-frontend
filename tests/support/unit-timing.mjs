// Pure helpers for tests/run-unit-ci.mjs: read a `node --test` summary, size the worker pool, and
// render the per-file timing table. No I/O here, so tests/unit/ci-timing-metrics.test.mjs can
// pin the behaviour without spawning anything.

// The summary node's spec reporter prints last ("ℹ tests 12" … "ℹ fail 0"); the TAP reporter
// prints the same counters as "# tests 12". Returns null when no complete summary is present —
// the runner treats that as a failure, so a crashed or truncated file can never pass silently.
export function parseCounts(output) {
  if (typeof output !== "string") return null;
  const read = (name) => {
    const re = new RegExp(`^(?:ℹ|#) ${name} (\\d+)\\s*$`, "gm");
    let last = null;
    for (const m of output.matchAll(re)) last = Number(m[1]);
    return last;
  };
  const tests = read("tests");
  const pass = read("pass");
  const fail = read("fail");
  if (tests === null || pass === null || fail === null) return null;
  const skipped = read("skipped") ?? 0;
  const cancelled = read("cancelled") ?? 0;
  const todo = read("todo") ?? 0;
  // A cancelled test is not a pass: count it as a failure.
  return { tests, pass, fail: fail + cancelled, skipped, todo };
}

// UNIT_CONCURRENCY overrides; otherwise the same default `node --test` uses for several files.
export function resolveConcurrency(raw, cpus) {
  if (raw !== undefined && raw !== "") {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > 64) throw new Error(`UNIT_CONCURRENCY must be an integer 1..64 (got ${JSON.stringify(raw)})`);
    return n;
  }
  const c = Number.isInteger(cpus) && cpus > 0 ? cpus : 1;
  return Math.max(1, c - 1);
}

const sec = (ms) => (ms / 1000).toFixed(1);

export function timingTable(results, wallMs, concurrency, top = 20) {
  const rows = [...results].sort((a, b) => b.ms - a.ms);
  const sumMs = rows.reduce((s, r) => s + r.ms, 0);
  const totals = rows.reduce((t, r) => {
    const c = r.counts ?? { tests: 0, pass: 0, fail: 0, skipped: 0 };
    return { tests: t.tests + c.tests, pass: t.pass + c.pass, fail: t.fail + c.fail, skipped: t.skipped + c.skipped };
  }, { tests: 0, pass: 0, fail: 0, skipped: 0 });
  const failedFiles = rows.filter((r) => !r.ok).length;
  const head = `unit timing: ${rows.length} files, wall ${sec(wallMs)} s, sum of file times ${sec(sumMs)} s, ` +
    `concurrency ${concurrency}; tests ${totals.tests} (pass ${totals.pass}, fail ${totals.fail}, skipped ${totals.skipped}); ` +
    `failed files ${failedFiles}`;
  const shown = rows.slice(0, top);
  const text = [head, `slowest ${shown.length}:`, ...shown.map((r) => `  ${sec(r.ms).padStart(7)} s  ${r.ok ? "  " : "✖ "}${r.file}`)].join("\n");
  const markdown = [
    "### Unit suite timing",
    "",
    head,
    "",
    "| seconds | file | result |",
    "|---:|---|---|",
    ...shown.map((r) => `| ${sec(r.ms)} | \`${r.file}\` | ${r.ok ? "ok" : "**failed**"} |`),
  ].join("\n");
  return { text, markdown, sumMs, totals, failedFiles };
}
