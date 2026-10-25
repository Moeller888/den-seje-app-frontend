// D-A4 (2026-10-24): what the `test` job does while it holds the shared E2E lock.
//
//   1. Browsers and apt packages come from the Actions cache — no slow apt mirror download
//      inside the lock (it cost 5.7–47 min in 8 of 90 runs); the runner environment is unchanged.
//   2. A STALE run — a pull_request run whose PR moved to a newer commit or was closed, or a run that
//      was cancelled while it waited — stops at lock acquisition and is RED, never green. The job is
//      always() and GitHub runs always() jobs even after a cancel; inside it `cancelled()` was measured
//      FALSE (run 40079620782), so staleness is read from the API (.github/ci/superseded-check.mjs).
//
// The step-outcome tests below do not trust prose: they evaluate the workflow's OWN `if:` strings
// with GitHub's rules (an `if` without a status function is implicitly `success() && …`) for each
// scenario, and check which steps run and whether the job ends red or green.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decideSuperseded, decideCancelled, readPullRequest, readRun } from "../../.github/ci/superseded-check.mjs";

const read = (p) => readFileSync(new URL(p, new URL("../../", import.meta.url)), "utf8").split("\r\n").join("\n");
const WF = read(".github/workflows/playwright.yml");
const TEST_JOB = WF.slice(WF.indexOf("\n  test:\n"));
// The job without comment lines: assertions about what RUNS must not match explanations.
const stripComments = (t) => t.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
const TEST_JOB_CODE = stripComments(TEST_JOB);

// ── 1. browsers + apt packages from the Actions cache, same runner environment ──────────────
const step = (name) => {
  const at = TEST_JOB.indexOf(`- name: ${name}\n`);
  assert.notEqual(at, -1, "step not found: " + name);
  return TEST_JOB.slice(at, TEST_JOB.indexOf("\n    - ", at + 10));
};

test("the suite still runs on the runner itself (goldens were made there), with the unchanged command", () => {
  assert.ok(!/docker (run|pull)|container:|PLAYWRIGHT_IMAGE/.test(TEST_JOB_CODE),
    "the Playwright image changes Chromium rendering (11 goldens, run 40079704807) — not without new owner-approved baselines");
  assert.ok(step("Run Playwright tests").includes("      run: npx playwright test"));
  assert.ok(step("Install Playwright Browsers").includes("        npx playwright install --with-deps\n"), "same installer, same browsers and system deps");
});

test("the cache key changes with the runner image and the Playwright version from package-lock", () => {
  const v = step("Playwright and runner image versions");
  assert.ok(v.includes(`require('./package-lock.json').packages['node_modules/playwright'].version`));
  assert.ok(v.includes('key=pw-browsers-apt-${ImageOS:-unknown}-${ImageVersion:-unknown}-playwright-${v}'));
  for (const name of ["Restore Playwright browser and apt cache", "Save Playwright browser and apt cache"]) {
    const s = step(name);
    assert.ok(s.includes("key: ${{ steps.pwver.outputs.key }}"), name);
    assert.ok(s.includes("~/.cache/ms-playwright") && s.includes("~/.cache/pw-apt"), name);
  }
  assert.ok(step("Restore Playwright browser and apt cache").includes("uses: actions/cache/restore@v4"));
  assert.ok(step("Save Playwright browser and apt cache").includes("uses: actions/cache/save@v4"));
  assert.ok(step("Save Playwright browser and apt cache").includes("steps.pwcache.outputs.cache-hit != 'true'"), "only a miss writes the cache");
  assert.ok(step("Save Playwright browser and apt cache").includes("&& github.event_name == 'push'\n"),
    "only main writes the ~557 MB entry; nine PRs saving their own would evict it from the 10 GB cache");
});

test("the install step seeds apt from the cache, keeps what it downloads, and is bounded", () => {
  const s = step("Install Playwright Browsers");
  assert.ok(s.includes("      timeout-minutes: 15\n"), "a miss on a slow mirror must not hold the lock for 47 minutes");
  assert.ok(s.includes("'APT::Keep-Downloaded-Packages \"true\";'"));
  assert.ok(s.includes("sudo cp ~/.cache/pw-apt/*.deb /var/cache/apt/archives/"));
  assert.ok(s.includes("find /var/cache/apt/archives -maxdepth 1 -name '*.deb' -exec cp {} ~/.cache/pw-apt/ \\;"));
  // order: versions → restore → install → save → suite
  const order = ["Playwright and runner image versions", "Restore Playwright browser and apt cache", "Install Playwright Browsers", "Save Playwright browser and apt cache", "Run Playwright tests"]
    .map((n) => TEST_JOB.indexOf(`- name: ${n}\n`));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
});

test("the lock itself is unchanged: always(), shared group fallback, FIFO queue, no cancel-in-progress", () => {
  const head = TEST_JOB.slice(0, TEST_JOB.indexOf("    steps:\n"));
  assert.ok(head.includes("    if: always()\n"), "the required check must always report");
  assert.ok(head.includes("|| 'e2e-shared-supabase'"));
  assert.ok(head.includes("cancel-in-progress: false") && head.includes("queue: max"));
  assert.ok(head.includes("    permissions:\n      contents: read\n      pull-requests: read\n      actions: read\n"), "read-only token");
});

test("no status function in the test job's steps: GitHub's implicit success() gating stays intact", () => {
  const steps = TEST_JOB_CODE.slice(TEST_JOB_CODE.indexOf("    steps:\n"));
  for (const fn of ["always()", "failure()", "cancelled()", "continue-on-error"]) {
    assert.ok(!steps.includes(fn), `test job steps must not use ${fn}: it would drop the implicit success() gate`);
  }
});

// ── 2. step outcomes, evaluated from the workflow text ──────────────────────────────────────
function parseSteps(job) {
  const body = job.slice(job.indexOf("    steps:\n") + "    steps:\n".length);
  return body.split(/\n    - /).map((chunk, i) => {
    const text = i === 0 ? chunk.replace(/^    - /, "") : chunk;
    const head = /^(?:name: (.+)|uses: (\S+)|id: (\S+))/.exec(text);
    const name = head ? (head[1] || head[2] || head[3]) : "?";
    const iff = /(?:^|\n) {6}if: (.+)/.exec(text);
    const id = /(?:^|\n) {6}id: (\S+)/.exec(text) || /^id: (\S+)/.exec(text);
    return { name, cond: iff ? iff[1].trim() : null, id: id ? id[1] : null, text };
  }).filter((s) => s.name !== "?" || s.cond);
}

function evaluate(cond, ctx) {
  let c = (cond ?? "").replace(/^\$\{\{\s*|\s*\}\}$/g, "");
  const hasStatus = /\b(success|failure|cancelled|always)\(\)/.test(c);
  if (c === "") c = "success()";
  else if (!hasStatus) c = `success() && (${c})`;
  const js = c
    .replace(/steps\.([\w-]+)\.outputs\.([\w-]+)/g, (_, s, o) => JSON.stringify(ctx.outputs[s]?.[o] ?? ""))
    .replace(/github\.event_name/g, JSON.stringify(ctx.event))
    .replace(/success\(\)/g, String(!ctx.failed))
    .replace(/failure\(\)/g, String(ctx.failed))
    .replace(/cancelled\(\)/g, "false") // measured: false inside this always() job, even after a cancel
    .replace(/always\(\)/g, "true")
    .replace(/==/g, "===").replace(/!===/g, "!==");
  assert.ok(/^[\s"'\w!=&|().\-:]*$/.test(js), "unexpected expression: " + cond);
  return Function(`return (${js});`)();
}

// scenario: event, mode, stale ('true'/'false' from the stale check), failStep (that step fails).
function simulate(scenario) {
  const steps = parseSteps(TEST_JOB);
  const ctx = { event: scenario.event ?? "pull_request", failed: false, outputs: {} };
  const ran = [];
  for (const s of steps) {
    if (!evaluate(s.cond, ctx)) continue;
    ran.push(s.name);
    if (s.id === "mode") ctx.outputs.mode = { mode: scenario.mode ?? "full" };
    if (s.id === "stale") ctx.outputs.stale = { stale: scenario.stale ?? "false" };
    // A refusal step prints ::error:: and exits 1 unconditionally (comment lines of the next step,
    // which the split leaves at the end of the chunk, are ignored).
    const code = stripComments(s.text);
    if (/::error::/.test(code) && /\n\s+exit 1(\n|$)/.test(code)) ctx.failed = true;
    if (scenario.failStep && s.name === scenario.failStep) ctx.failed = true;
  }
  return { ran, red: ctx.failed };
}

const WORK = ["Install dependencies", "Restore Playwright browser and apt cache", "Install Playwright Browsers", "Run Playwright tests", "Summarise completion"];

test("normal full run: stale check, pull + suite run, no refusal, job green", () => {
  const r = simulate({ mode: "full" });
  for (const n of ["Stale run check (superseded or cancelled)", ...WORK]) assert.ok(r.ran.includes(n), n);
  assert.ok(!r.ran.includes("Fail a stale run"));
  assert.equal(r.red, false);
});

test("stale run (superseded, closed or cancelled): stops before install/pull/suite, job RED", () => {
  const r = simulate({ mode: "full", stale: "true" });
  assert.ok(r.ran.includes("Stale run check (superseded or cancelled)"));
  for (const n of WORK) assert.ok(!r.ran.includes(n), n + " must not run");
  assert.ok(r.ran.includes("Fail a stale run"));
  assert.equal(r.red, true);
});

test("an earlier failed step (dispatch guard, classifier tests) still blocks everything — fail-closed kept", () => {
  for (const [event, failStep] of [["workflow_dispatch", "Manual dispatch guard"], ["pull_request", "Classifier unit tests"]]) {
    const r = simulate({ event, mode: "full", failStep });
    assert.ok(r.ran.includes(failStep), failStep + " must have run");
    for (const n of ["Stale run check (superseded or cancelled)", ...WORK]) assert.ok(!r.ran.includes(n), n + " ran after " + failStep + " failed");
    assert.equal(r.red, true);
  }
});

test("a failing stale check itself fails the job before any work (never skips to green)", () => {
  const r = simulate({ mode: "full", failStep: "Stale run check (superseded or cancelled)" });
  for (const n of WORK) assert.ok(!r.ran.includes(n), n);
  assert.equal(r.red, true);
});

test("fast modes are untouched: no stale check, no pull, no suite, no refusal, green", () => {
  for (const mode of ["docs", "unit-only", "avatar-tool"]) {
    const r = simulate({ mode });
    for (const n of ["Stale run check (superseded or cancelled)", "Install Playwright Browsers", "Run Playwright tests", "Fail a stale run"]) assert.ok(!r.ran.includes(n), mode + ": " + n);
    assert.equal(r.red, false, mode);
  }
});

test("cache: a pull request restores but never saves; a push on a miss saves", () => {
  const pr = simulate({ event: "pull_request", mode: "full" });
  assert.ok(pr.ran.includes("Restore Playwright browser and apt cache") && !pr.ran.includes("Save Playwright browser and apt cache"));
  const push = simulate({ event: "push", mode: "full" });
  assert.ok(push.ran.includes("Save Playwright browser and apt cache"));
});

test("push to main runs the suite (the stale check never calls a push superseded)", () => {
  const r = simulate({ event: "push", mode: "full", stale: "false" });
  assert.ok(r.ran.includes("Run Playwright tests"));
  assert.equal(r.red, false);
  assert.equal(decideSuperseded({ eventName: "push", eventHeadSha: "a".repeat(40), pr: { state: "open", head: { sha: "b".repeat(40) } } }).superseded, false);
});

// ── 3. the stale decision ───────────────────────────────────────────────────────────────────
const A = "a".repeat(40), B = "b".repeat(40);
test("decideSuperseded: only positive evidence skips", () => {
  assert.equal(decideSuperseded({ eventName: "pull_request", eventHeadSha: A, pr: { number: 7, state: "open", head: { sha: A } } }).superseded, false);
  assert.equal(decideSuperseded({ eventName: "pull_request", eventHeadSha: A, pr: { number: 7, state: "open", head: { sha: B } } }).superseded, true);
  assert.equal(decideSuperseded({ eventName: "pull_request", eventHeadSha: A, pr: { number: 7, state: "closed", merged: false, head: { sha: A } } }).superseded, true);
  for (const pr of [null, undefined, {}, { state: "open" }, { state: "open", head: { sha: "short" } }, { state: "weird", head: { sha: B } }]) {
    assert.equal(decideSuperseded({ eventName: "pull_request", eventHeadSha: A, pr }).superseded, false, JSON.stringify(pr));
  }
  assert.equal(decideSuperseded({ eventName: "pull_request", eventHeadSha: "", pr: { state: "open", head: { sha: B } } }).superseded, false);
  for (const ev of ["push", "workflow_dispatch", "", undefined]) {
    assert.equal(decideSuperseded({ eventName: ev, eventHeadSha: A, pr: { state: "open", head: { sha: B } } }).superseded, false, String(ev));
  }
});

test("decideCancelled: the run's record or a cancelled sibling job — nothing else", () => {
  assert.equal(decideCancelled({ run: { status: "in_progress", conclusion: "cancelled" }, jobs: [] }).cancelled, true);
  assert.equal(decideCancelled({ run: { status: "in_progress", conclusion: null }, jobs: [{ name: "unit (shard 1/3)", conclusion: "cancelled" }] }).cancelled, true);
  // its own job being anything, success/failure siblings, unreadable data → run
  assert.equal(decideCancelled({ run: { status: "in_progress", conclusion: null }, jobs: [{ name: "test", conclusion: "cancelled" }, { name: "unit", conclusion: "failure" }, { name: "classify", conclusion: "success" }] }).cancelled, false);
  for (const [run, jobs] of [[null, null], [undefined, undefined], [{}, "x"], [{ conclusion: "failure" }, [null, 3]]]) {
    assert.equal(decideCancelled({ run, jobs }).cancelled, false, JSON.stringify([run, jobs]));
  }
});

test("API reads: errors and bad input → null (which means: run); GET only", async () => {
  const fail = async () => ({ ok: false });
  assert.equal(await readPullRequest({ repository: "o/r", number: 5, fetchImpl: fail }), null);
  assert.equal(await readPullRequest({ repository: "o/r", number: 5, fetchImpl: async () => { throw new Error("net"); } }), null);
  assert.equal(await readPullRequest({ repository: "bad repo", number: 5, fetchImpl: async () => ({ ok: true, json: async () => ({}) }) }), null);
  assert.equal(await readPullRequest({ repository: "o/r", number: "5; rm", fetchImpl: async () => ({ ok: true, json: async () => ({}) }) }), null);
  assert.deepEqual(await readRun({ repository: "o/r", runId: "x", fetchImpl: fail }), { run: null, jobs: null });
  const urls = [];
  const ok = async (url, opt) => { urls.push(url); assert.equal(opt.method, undefined, "GET only"); return { ok: true, json: async () => (url.endsWith("per_page=100") ? { jobs: [{ name: "unit" }] } : { status: "in_progress" }) }; };
  const r = await readRun({ repository: "o/r", runId: 42, token: "t", fetchImpl: ok });
  assert.deepEqual(r, { run: { status: "in_progress" }, jobs: [{ name: "unit" }] });
  assert.deepEqual(urls, ["https://api.github.com/repos/o/r/actions/runs/42", "https://api.github.com/repos/o/r/actions/runs/42/jobs?per_page=100"]);
});

test("the stale check only reads: no write calls, no cancel", () => {
  const src = stripComments(read(".github/ci/superseded-check.mjs")).split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  for (const verb of ["method:", "POST", "PATCH", "DELETE", "/cancel", "force-cancel", "rerun"]) assert.ok(!src.includes(verb), verb);
});
