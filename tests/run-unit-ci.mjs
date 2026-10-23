// Runs the unit suite in CI: every tests/unit/*.test.mjs except the binary-dependent files
// listed in unit-ci-exclusions.mjs (D-094).
//
// A tiny runner rather than a shell glob, because the exclusion has to be expressed identically
// on Windows and Linux and has to live in ONE place a test can assert against. Any failing file
// (or a file that crashes, or whose result cannot be read) fails the job.
//
// TIMING. Each file runs as its own `node --test <file>` child — the same per-file process
// isolation `node --test a b c` already used — with the same default concurrency
// (availableParallelism - 1). Running them from here is what makes per-file wall time
// measurable: the runner prints a timing table at the end, and in GitHub Actions also writes it
// to the job summary. A file's output is printed in one block when it finishes, so parallel
// files never interleave; if the job is cancelled, the files still running are named.
import { readdirSync, existsSync, appendFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { BINARY_DEPENDENT } from "./unit-ci-exclusions.mjs";
import { parseCounts, timingTable, resolveConcurrency } from "./support/unit-timing.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const UNIT = join(HERE, "unit");

const all = readdirSync(UNIT).filter((f) => f.endsWith(".test.mjs")).sort();

// Fail loudly if the exclusion list names a file that no longer exists — a stale entry would
// silently shrink CI coverage, which is the exact failure mode this whole change exists to end.
const missing = BINARY_DEPENDENT.filter((f) => !existsSync(join(UNIT, f)));
if (missing.length > 0) {
  console.error("✖ unit-ci-exclusions.mjs names files that do not exist:\n  " + missing.join("\n  "));
  process.exit(1);
}

const run = all.filter((f) => !BINARY_DEPENDENT.includes(f));
const concurrency = resolveConcurrency(process.env.UNIT_CONCURRENCY, availableParallelism());
console.log(`unit suite in CI: ${run.length} of ${all.length} files ` +
  `(${BINARY_DEPENDENT.length} excluded — Windows-only vendored libwebp, see unit-ci-exclusions.mjs), ` +
  `concurrency ${concurrency}`);

const started = Date.now();
const running = new Map(); // file → start time
const results = [];

function runFile(file) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    running.set(file, t0);
    const chunks = [];
    const child = spawn(process.execPath, ["--test", "--test-reporter=spec", join(UNIT, file)], { stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (d) => chunks.push(d));
    child.stderr.on("data", (d) => chunks.push(d));
    child.on("error", (err) => chunks.push(Buffer.from(`runner: could not start ${file}: ${err.message}\n`)));
    child.on("close", (code, signal) => {
      running.delete(file);
      const output = Buffer.concat(chunks).toString("utf8");
      const ms = Date.now() - t0;
      const counts = parseCounts(output);
      const ok = code === 0 && counts !== null && counts.fail === 0;
      process.stdout.write(`\n── ${file} (${(ms / 1000).toFixed(1)} s, ${ok ? "ok" : "FAILED"}) ──\n` + output);
      if (code === 0 && counts === null) console.log(`✖ ${file}: exit 0 but no test summary could be read — treated as a failure`);
      results.push({ file, ms, code, signal, counts, ok });
      resolve();
    });
  });
}

function reportRunning(sig) {
  const now = Date.now();
  console.log(`\n✖ unit runner received ${sig}; files still running:`);
  for (const [file, t0] of running) console.log(`  ${file} (${((now - t0) / 1000).toFixed(0)} s)`);
  process.exit(1);
}
process.on("SIGINT", () => reportRunning("SIGINT"));
process.on("SIGTERM", () => reportRunning("SIGTERM"));

const queue = [...run];
await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
  while (queue.length > 0) await runFile(queue.shift());
}));

const wallMs = Date.now() - started;
const table = timingTable(results, wallMs, concurrency);
console.log("\n" + table.text);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, table.markdown + "\n");

const failed = results.filter((r) => !r.ok);
if (failed.length > 0 || results.length !== run.length) {
  console.log(`✖ ${failed.length} unit file(s) failed: ${failed.map((r) => r.file).join(", ")}`);
  process.exit(1);
}
process.exit(0);
