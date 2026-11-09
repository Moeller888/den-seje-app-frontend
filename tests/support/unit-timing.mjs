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
//
// Each shard has `files` (sorted by name) and `order` (the same files, heaviest first, ties by
// name) — the order the runner STARTS them in. Starting the heaviest files first keeps one long
// file from starting last and running alone at the end of the shard (D-361).
export function planShards(files, count, weights = {}) {
  if (!Array.isArray(files) || files.length === 0) throw new Error("planShards: no files");
  if (!Number.isInteger(count) || count < 1) throw new Error("planShards: invalid shard count");
  if (new Set(files).size !== files.length) throw new Error("planShards: duplicate file names");
  const known = files.map((f) => weights[f]).filter((w) => Number.isFinite(w) && w > 0).sort((a, b) => a - b);
  const fallback = known.length ? known[Math.floor(known.length / 2)] : 1;
  const weightOf = (f) => (Number.isFinite(weights[f]) && weights[f] > 0 ? weights[f] : fallback);
  const order = [...files].sort((a, b) => weightOf(b) - weightOf(a) || a.localeCompare(b));
  const shards = Array.from({ length: count }, () => ({ files: [], order: [], weight: 0 }));
  for (const f of order) {
    let best = 0;
    for (let i = 1; i < count; i++) if (shards[i].weight < shards[best].weight) best = i;
    shards[best].files.push(f);
    shards[best].order.push(f);
    shards[best].weight += weightOf(f);
  }
  for (const s of shards) s.files.sort();
  // Self-check: a partition — every file exactly once.
  const flat = shards.flatMap((s) => s.files);
  if (flat.length !== files.length || new Set(flat).size !== files.length || !files.every((f) => flat.includes(f))) {
    throw new Error("planShards: partition check failed");
  }
  for (const s of shards) {
    if (s.order.length !== s.files.length || [...s.order].sort().some((f, i) => f !== s.files[i])) {
      throw new Error("planShards: run order is not the shard's own files");
    }
  }
  return shards;
}

// UNIT_SHARD_BUDGET_S = the seconds a shard is DESIGNED to finish within (D-361). Unset or empty =
// no budget (local runs). The budget never fails or stops anything: when it passes, the runner
// prints which files are still running and which have not started, so a shard that is then
// cancelled by the job timeout still leaves a diagnosis in its log.
export function parseBudget(raw) {
  if (raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 60 || n > 3600) throw new Error(`UNIT_SHARD_BUDGET_S must be an integer 60..3600 (got ${JSON.stringify(raw)})`);
  return n;
}

// The snapshot printed when the budget passes. Files and numbers only.
export function budgetReport({ budgetS, elapsedMs, finished, failed, running, pending }) {
  const lines = [
    `⚠ unit shard passed its time budget of ${budgetS} s (elapsed ${sec(elapsedMs)} s) — still running, NOT a test failure.`,
    `  finished ${finished} file(s), ${failed} failed so far; ${running.length} running; ${pending.length} not started.`,
    "  If this job is cancelled by its timeout, these files are why:",
    ...running.map(([f, ms]) => `    running ${sec(ms).padStart(7)} s  ${f}`),
    ...pending.map((f) => `    not started         ${f}`),
  ];
  return lines.join("\n");
}

// Measured file times against tests/unit-ci-weights.json. `speed` = measured / planned seconds
// over the files that have a weight of at least 1 s: ~1.0 is a normal runner, 1.5 a runner half
// again as slow as the one the weights came from. `slower` = files more than twice their weight
// (+10 s), which a slow runner alone does not explain; `unweighted` = files of 10 s or more with
// no weight (they are planned at the median, so the shards drift until the weights are refreshed).
// Reporting only: it never changes the result.
export function driftReport(results, weights = {}) {
  const w = (f) => (Number.isFinite(weights[f]) && weights[f] > 0 ? weights[f] : null);
  let measured = 0, planned = 0;
  for (const r of results) if (w(r.file) !== null && w(r.file) >= 1) { measured += r.ms / 1000; planned += w(r.file); }
  const speed = planned > 0 ? measured / planned : null;
  const slower = results.filter((r) => w(r.file) !== null && r.ms / 1000 > 2 * w(r.file) + 10)
    .map((r) => ({ file: r.file, s: r.ms / 1000, weight: w(r.file) })).sort((a, b) => b.s - a.s);
  const unweighted = results.filter((r) => w(r.file) === null && r.ms / 1000 >= 10)
    .map((r) => ({ file: r.file, s: r.ms / 1000 })).sort((a, b) => b.s - a.s);
  const head = `unit drift: runner speed ${speed === null ? "n/a" : speed.toFixed(2) + "× the weights"}; ` +
    `${slower.length} file(s) over 2× their weight; ${unweighted.length} file(s) ≥ 10 s without a weight`;
  const text = [head,
    ...slower.map((x) => `  over 2× weight  ${x.s.toFixed(1).padStart(7)} s (weight ${x.weight})  ${x.file}`),
    ...unweighted.map((x) => `  no weight       ${x.s.toFixed(1).padStart(7)} s  ${x.file}`)].join("\n");
  const markdown = ["### Unit timing drift", "", head, "",
    ...(slower.length + unweighted.length > 0 ? ["| seconds | weight | file |", "|---:|---:|---|",
      ...slower.map((x) => `| ${x.s.toFixed(1)} | ${x.weight} | \`${x.file}\` |`),
      ...unweighted.map((x) => `| ${x.s.toFixed(1)} | — | \`${x.file}\` |`)] : [])].join("\n");
  return { speed, slower, unweighted, text, markdown };
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

// ── PostgreSQL lane (D-369) ──────────────────────────────────────────────────────────────────
// Each unit shard has ONE throwaway PostgreSQL service (max_connections 100). The files that use it
// open many sessions at once (minigame-breaks-concurrency: 64), so two of them side by side can hit
// "sorry, too many clients already". They therefore run ONE AT A TIME, while every other file keeps
// the normal concurrency.
//
// A file is a PG file when its source mentions PG_ENV — the only way a unit file reaches that
// server. Detection reads the file text, so a new PG test joins the lane without a list to maintain;
// ci-timing-metrics.test.mjs pins the result against `git grep` of the repository.
export const PG_ENV = "LEVEL_ENGINE_PG_URL";

export function detectPgFiles(files, readText) {
  if (!Array.isArray(files)) throw new Error("detectPgFiles: files must be an array");
  return files.filter((f) => {
    const text = readText(f);
    if (typeof text !== "string") throw new Error(`detectPgFiles: could not read ${f}`);
    return text.includes(PG_ENV);
  });
}

// The runner's scheduler. `order` is the start order (heaviest first). take() returns the files to
// start now, marking them running: the first queued files that fit in the free slots, skipping a PG
// file while another PG file runs — the skipped file keeps its place and is the first one taken when
// the lane frees. finish(file) frees its slot (and the lane).
//
// No deadlock: a worker never WAITS for the lane — it takes the next non-PG file instead. take()
// returns nothing only when every slot is busy, the queue is empty, or only PG files are queued while
// a PG file runs; in each case a running file will finish and the caller calls take() again. With
// nothing running, the lane is free, so the first queued file is always eligible.
export function pgLaneScheduler(order, concurrency, isPg) {
  if (!Array.isArray(order)) throw new Error("pgLaneScheduler: order must be an array");
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error("pgLaneScheduler: invalid concurrency");
  if (new Set(order).size !== order.length) throw new Error("pgLaneScheduler: duplicate file names");
  const queue = [...order];
  const running = new Set();
  let pgRunning = null;
  return {
    queue,
    running,
    get pgRunning() { return pgRunning; },
    take() {
      const started = [];
      while (running.size < concurrency) {
        const i = queue.findIndex((f) => !(pgRunning !== null && isPg(f)));
        if (i < 0) break;
        const [f] = queue.splice(i, 1);
        running.add(f);
        if (isPg(f)) pgRunning = f;
        started.push(f);
      }
      if (started.length === 0 && running.size === 0 && queue.length > 0) {
        throw new Error("pgLaneScheduler: stalled with nothing running"); // unreachable by the argument above
      }
      return started;
    },
    finish(f) {
      if (!running.delete(f)) throw new Error(`pgLaneScheduler: ${f} was not running`);
      if (pgRunning === f) pgRunning = null;
    },
    get done() { return queue.length === 0 && running.size === 0; },
  };
}

// Discrete-event run of a scheduler with fake durations (seconds): which file ran when. Used by the
// tests and to estimate the CI-time cost; `isPg = () => false` reproduces the pre-D-369 runner (each
// free slot takes the next file in order).
export function simulateSchedule(order, durationOf, concurrency, isPg) {
  const s = pgLaneScheduler(order, concurrency, isPg);
  const runs = [];
  const active = []; // { file, end }
  let now = 0;
  for (;;) {
    for (const f of s.take()) {
      const d = durationOf(f);
      if (!Number.isFinite(d) || d < 0) throw new Error(`simulateSchedule: bad duration for ${f}`);
      runs.push({ file: f, start: now, end: now + d });
      active.push({ file: f, end: now + d });
    }
    if (s.done) break;
    // Finish the earliest-ending file (ties by order of start).
    let k = 0;
    for (let i = 1; i < active.length; i++) if (active[i].end < active[k].end) k = i;
    const [next] = active.splice(k, 1);
    now = next.end;
    s.finish(next.file);
  }
  const wall = runs.reduce((m, r) => Math.max(m, r.end), 0);
  return { runs, wall };
}

// The most files of a kind that ran at the same time (intervals are half-open [start, end)).
export function maxOverlap(runs, pick = () => true) {
  const ev = [];
  for (const r of runs) if (pick(r.file) && r.end > r.start) ev.push([r.start, 1], [r.end, -1]);
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let cur = 0, max = 0;
  for (const [, d] of ev) { cur += d; max = Math.max(max, cur); }
  return max;
}
