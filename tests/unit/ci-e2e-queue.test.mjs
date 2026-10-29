// Guards the FIFO queue on the shared E2E lock (`e2e-shared-supabase`).
//
// WHY: with GitHub's default `queue: single`, a concurrency group holds one RUNNING and ONE
// PENDING job, and every newly queued job cancels the pending one. The full suite runs serially
// for 35–45 minutes, so whenever two runs were waiting behind a third, the older waiter was
// cancelled ("queue displacement") — 9 of 53 runs between 2026-10-09 and 2026-10-18, including
// PR runs and main-after-merge runs that had done nothing wrong.
//
// `queue: max` (GitHub, 2026-05-07) lets up to 100 jobs wait in the group and starts them one at
// a time, FIFO by when each began waiting. It changes only the waiting: the group itself is
// untouched, so at most one job RUNS against the shared Supabase test data at any time.
//
// What these tests pin, for every workflow in .github/workflows:
//   1. every concurrency block that can take the shared lock also sets `queue: max` and
//      `cancel-in-progress: false` — a block left on `single` would go on displacing waiters,
//      and GitHub rejects `max` together with `cancel-in-progress: true`;
//   2. every workflow that receives the Supabase service-role key (i.e. can mutate the shared
//      test data) takes the shared lock at all, so a new E2E workflow cannot bypass it;
//   3. the lock itself is unchanged: same group name in both E2E workflows, the `test` job keeps
//      its fail-closed expression.
// The block reader is deliberately tiny (indentation-based, no YAML dependency) and has its own
// negative controls below, so a parsing slip cannot turn into a silent pass.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const WF_DIR = new URL("../../.github/workflows/", import.meta.url);
const SHARED_LOCK = "e2e-shared-supabase";

const workflowFiles = () =>
  readdirSync(WF_DIR).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml")).sort();
const readWorkflow = (f) => readFileSync(new URL(f, WF_DIR), "utf8").split("\r\n").join("\n");

const indentOf = (line) => line.length - line.trimStart().length;

// Every `concurrency:` mapping in a workflow, as { text, cancelInProgress, queue }. A block is the
// `concurrency:` line plus every following line indented deeper (blank lines and comments
// included). Scalar values are read only from direct children of the block.
function concurrencyBlocks(source) {
  const lines = source.split("\n");
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trimStart().startsWith("#")) continue;
    if (line.trim() !== "concurrency:") continue;
    const base = indentOf(line);
    const body = [];
    let j = i + 1;
    for (; j < lines.length; j++) {
      const l = lines[j];
      if (l.trim() !== "" && indentOf(l) <= base) break;
      body.push(l);
    }
    const childIndent = Math.min(...body.filter((l) => l.trim() !== "" && !l.trimStart().startsWith("#")).map(indentOf));
    const scalar = (key) => {
      const hit = body.find((l) => indentOf(l) === childIndent && l.trimStart().startsWith(key + ":"));
      if (hit === undefined) return null;
      const value = hit.trimStart().slice(key.length + 1);
      const hash = value.indexOf(" #");
      return (hash === -1 ? value : value.slice(0, hash)).trim();
    };
    blocks.push({ text: body.join("\n"), cancelInProgress: scalar("cancel-in-progress"), queue: scalar("queue") });
    i = j - 1;
  }
  return blocks;
}

const sharedBlocks = (source) => concurrencyBlocks(source).filter((b) => b.text.includes(SHARED_LOCK));

// ── 1. Every shared-lock block queues FIFO and never cancels ─────────────────────────────────
test("every concurrency block on the shared E2E lock sets queue: max and cancel-in-progress: false", () => {
  const offenders = [];
  let seen = 0;
  for (const f of workflowFiles()) {
    for (const b of sharedBlocks(readWorkflow(f))) {
      seen++;
      if (b.queue !== "max") offenders.push(`${f}: queue is ${JSON.stringify(b.queue)}, must be "max"`);
      if (b.cancelInProgress !== "false") {
        offenders.push(`${f}: cancel-in-progress is ${JSON.stringify(b.cancelInProgress)}, must be "false"`);
      }
    }
  }
  assert.deepEqual(offenders, []);
  assert.equal(seen, 2, "expected exactly two shared-lock blocks (playwright.yml test job, update-avatar-goldens.yml)");
});

// ── 2. Nothing that can write the shared test data runs outside the lock ─────────────────────
test("every workflow that receives the service-role key takes the shared E2E lock", () => {
  const offenders = [];
  for (const f of workflowFiles()) {
    const src = readWorkflow(f);
    if (!src.includes("secrets.SUPABASE_SERVICE_ROLE_KEY")) continue;
    if (sharedBlocks(src).length === 0) offenders.push(f);
  }
  assert.deepEqual(offenders, []);
});

// ── 3. The lock itself is unchanged ──────────────────────────────────────────────────────────
test("both E2E workflows still take the same shared group", () => {
  assert.equal(sharedBlocks(readWorkflow("playwright.yml")).length, 1, "playwright.yml must take the shared lock once (test job)");
  const goldens = sharedBlocks(readWorkflow("update-avatar-goldens.yml"));
  assert.equal(goldens.length, 1, "update-avatar-goldens.yml must take the shared lock");
  assert.match(goldens[0].text, /^\s+group:\s*e2e-shared-supabase\s*$/m, "goldens must use the literal shared group");
});

test("the test job keeps its fail-closed lock expression next to the queue", () => {
  const [b] = sharedBlocks(readWorkflow("playwright.yml"));
  assert.ok(b.text.includes("format('ci-fast-{0}', github.run_id)"), "fast runs keep their isolated per-run group");
  assert.ok(b.text.includes("|| 'e2e-shared-supabase'"), "every non-fast state falls back to the shared lock");
  assert.ok(!b.text.includes("cancel-in-progress: true"), "a running E2E job must never be cancelled by a newer one");
});

// ── Negative controls: the reader must see what it is meant to catch ─────────────────────────
test("negative control: a shared-lock block without queue: max is reported as single/absent", () => {
  const [b] = sharedBlocks("concurrency:\n  group: e2e-shared-supabase\n  cancel-in-progress: false\njobs:\n");
  assert.equal(b.queue, null);
  assert.equal(b.cancelInProgress, "false");
});

test("negative control: explicit queue: single and cancel-in-progress: true are read as such", () => {
  const [b] = sharedBlocks("concurrency:\n  group: e2e-shared-supabase\n  cancel-in-progress: true\n  queue: single  # default\n");
  assert.equal(b.queue, "single");
  assert.equal(b.cancelInProgress, "true");
});

test("negative control: a job-level block with a folded group expression is read correctly", () => {
  const src = [
    "jobs:",
    "  test:",
    "    concurrency:",
    "      group: >-",
    "        ${{ cond && 'x' || 'e2e-shared-supabase' }}",
    "      cancel-in-progress: false",
    "      # a comment",
    "      queue: max",
    "    env:",
    "      queue: single",
  ].join("\n");
  const blocks = sharedBlocks(src);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].queue, "max", "a sibling key below the block must not leak in");
  assert.equal(blocks[0].cancelInProgress, "false");
});

test("negative control: a commented-out concurrency block is not counted", () => {
  assert.equal(sharedBlocks("# concurrency:\n#   group: e2e-shared-supabase\n").length, 0);
});

test("negative control: a block on another group is not treated as the shared lock", () => {
  assert.equal(sharedBlocks("concurrency:\n  group: deploy\n  cancel-in-progress: true\n").length, 0);
});
