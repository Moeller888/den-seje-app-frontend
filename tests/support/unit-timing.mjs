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

// UNIT_SHARD = "<i>/<n>" (1-based). Unset or empty = the whole suite in one job (local runs, and
// the label-verified step of the `test` job). Anything else throws — never a silent full or empty run.
export function parseShard(raw) {
  if (raw === undefined || raw === "") return null;
  const m = /^([1-9]\d?)\/([1-9]\d?)$/.exec(String(raw));
  if (!m) throw new Error(`UNIT_SHARD must look like "2/3" (got ${JSON.stringify(raw)})`);
  const index = Number(m[1]), count = Number(m[2]);
  if (index > count || count > 16) throw new Error(`UNIT_SHARD out of range (got ${JSON.stringify(raw)})`);
  return { index, count };
}

// Deterministic longest-processing-time partition: heaviest file first onto the lightest shard,
// ties broken by file name and then shard number. Weights only steer balance; every file lands in
// exactly one shard whatever the weights say (unknown files weigh the median of the known ones).
export function planShards(files, count, weights = {}) {
  if (!Array.isArray(files) || files.length === 0) throw new Error("planShards: no files");
  if (!Number.isInteger(count) || count < 1) throw new Error("planShards: invalid shard count");
  if (new Set(files).size !== files.length) throw new Error("planShards: duplicate file names");
  const known = files.map((f) => weights[f]).filter((w) => Number.isFinite(w) && w > 0).sort((a, b) => a - b);
  const fallback = known.length ? known[Math.floor(known.length / 2)] : 1;
  const weightOf = (f) => (Number.isFinite(weights[f]) && weights[f] > 0 ? weights[f] : fallback);
  const order = [...files].sort((a, b) => weightOf(b) - weightOf(a) || a.localeCompare(b));
  const shards = Array.from({ length: count }, () => ({ files: [], weight: 0 }));
  for (const f of order) {
    let best = 0;
    for (let i = 1; i < count; i++) if (shards[i].weight < shards[best].weight) best = i;
    shards[best].files.push(f);
    shards[best].weight += weightOf(f);
  }
  for (const s of shards) s.files.sort();
  // Self-check: a partition — every file exactly once.
  const flat = shards.flatMap((s) => s.files);
  if (flat.length !== files.length || new Set(flat).size !== files.length || !files.every((f) => flat.includes(f))) {
    throw new Error("planShards: partition check failed");
  }
  return shards;
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
