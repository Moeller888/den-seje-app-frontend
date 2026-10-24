// D-A4 (2026-10-24): what the `test` job does while it holds the shared E2E lock.
//
//   1. Browsers come from a pinned Playwright image — no `playwright install --with-deps`, no apt,
//      inside the lock (the apt mirror cost 5.7–47 min in 8 of 90 runs).
//   2. A cancelled run stops at lock acquisition and is RED, never green (the job is always(), and
//      GitHub runs always() jobs even after a cancel).
//   3. A pull_request run whose PR moved on stops at lock acquisition, red, and touches no other run.
//
// The step-outcome tests below do not trust prose: they evaluate the workflow's OWN `if:` strings
// with GitHub's rules (an `if` without a status function is implicitly `success() && …`) for each
// scenario, and check which steps run and whether the job ends red or green.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decideSuperseded, readPullRequest } from "../../.github/ci/superseded-check.mjs";

const read = (p) => readFileSync(new URL(p, new URL("../../", import.meta.url)), "utf8").split("\r\n").join("\n");
const WF = read(".github/workflows/playwright.yml");
const TEST_JOB = WF.slice(WF.indexOf("\n  test:\n"));
// The job without comment lines: assertions about what RUNS must not match explanations.
const stripComments = (t) => t.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
const TEST_JOB_CODE = stripComments(TEST_JOB);

// ── 1. pinned image, no apt inside the lock ─────────────────────────────────────────────────
test("the Playwright image version equals @playwright/test in package-lock and is pinned by digest", () => {
  const lock = JSON.parse(read("package-lock.json"));
  const version = lock.packages["node_modules/@playwright/test"].version;
  assert.equal(lock.packages["node_modules/playwright"].version, version);
  const m = /PLAYWRIGHT_IMAGE: mcr\.microsoft\.com\/playwright:v(\d+\.\d+\.\d+)-noble@sha256:([0-9a-f]{64})\n/.exec(TEST_JOB);
  assert.ok(m, "PLAYWRIGHT_IMAGE must be mcr.microsoft.com/playwright:v<version>-noble@sha256:<digest>");
  assert.equal(m[1], version, "bump the image together with @playwright/test");
});

test("no browser or apt installation happens in the locked test job", () => {
  assert.ok(!TEST_JOB_CODE.includes("playwright install"), "the image carries the browsers — never install them under the lock");
  assert.ok(!/\bapt(-get)?\s+install/.test(TEST_JOB_CODE));
  const pull = TEST_JOB.slice(TEST_JOB.indexOf("- name: Pull Playwright image"), TEST_JOB.indexOf("- name: Run Playwright tests"));
  assert.ok(pull.includes("timeout-minutes: 10"), "a slow registry must fail the step, not hold the lock");
  assert.ok(pull.includes('docker pull --quiet "$PLAYWRIGHT_IMAGE"'));
});

test("the suite runs in the image with the same command and every job env var passed by NAME only", () => {
  const run = TEST_JOB.slice(TEST_JOB.indexOf("- name: Run Playwright tests"), TEST_JOB.indexOf("- name: Fail a cancelled or superseded run"));
  assert.ok(run.includes('"$PLAYWRIGHT_IMAGE" \\\n          npx playwright test\n'), "same command, no extra flags (projects, retries, workers come from playwright.config.ts)");
  const envBlock = TEST_JOB.slice(TEST_JOB.indexOf("    env:\n"), TEST_JOB.indexOf("    permissions:\n"));
  const names = [...envBlock.matchAll(/^ {6}([A-Z][A-Z0-9_]*):/gm)].map((x) => x[1]).filter((n) => n !== "PLAYWRIGHT_IMAGE");
  assert.ok(names.length >= 9);
  for (const n of names) assert.ok(run.includes(`-e ${n} `) || run.includes(`-e ${n} \\`) || run.endsWith(`-e ${n}`), `${n} must reach the container`);
  const valued = [...run.matchAll(/-e ([A-Z_]+)=/g)].map((x) => x[1]);
  assert.deepEqual(valued, ["HOME"], "only the non-secret HOME=/tmp carries a value on the docker command line");
  assert.ok(!run.includes("secrets."), "secrets stay in the job env, never in the command");
  for (const n of ["CI", "GITHUB_STEP_SUMMARY"]) assert.ok(run.includes(`-e ${n} `), n);
});

test("the lock itself is unchanged: always(), shared group fallback, FIFO queue, no cancel-in-progress", () => {
  const head = TEST_JOB.slice(0, TEST_JOB.indexOf("    steps:\n"));
  assert.ok(head.includes("    if: always()\n"), "the required check must always report");
  assert.ok(head.includes("|| 'e2e-shared-supabase'"));
  assert.ok(head.includes("cancel-in-progress: false") && head.includes("queue: max"));
  assert.ok(head.includes("    permissions:\n      contents: read\n      pull-requests: read\n"), "read-only token");
});

// ── 2/3. step outcomes, evaluated from the workflow text ────────────────────────────────────
function parseSteps(job) {
  const body = job.slice(job.indexOf("    steps:\n") + "    steps:\n".length);
  return body.split(/\n    - /).map((chunk, i) => {
    const text = i === 0 ? chunk.replace(/^    - /, "") : chunk;
    const name = (/^(?:name: (.+)|uses: (\S+)|id: (\S+))/.exec(text) || [])[0] || "?";
    const ifm = /\n      if: (.+)\n/.exec("\n" + text.replace(/^name: .*\n/, (s) => s));
    const iff = /(?:^|\n) {6}if: (.+)/.exec(text);
    const id = /(?:^|\n) {6}id: (\S+)/.exec(text) || /^id: (\S+)/.exec(text);
    return { name: name.replace(/^name: /, ""), cond: iff ? iff[1].trim() : null, id: id ? id[1] : null, text };
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
    .replace(/cancelled\(\)/g, String(ctx.cancelled))
    .replace(/always\(\)/g, "true")
    .replace(/==/g, "===").replace(/!===/g, "!==");
  assert.ok(/^[\s"'\w!=&|().\-:]*$/.test(js), "unexpected expression: " + cond);
  return Function(`return (${js});`)();
}

// Runs the job's steps. `scenario`: event, mode, cancelledBefore (cancel arrived while queued),
// cancelAfter (cancel arrives while that step runs), superseded ('true' / 'false').
function simulate(scenario) {
  const steps = parseSteps(TEST_JOB);
  const ctx = { event: scenario.event ?? "pull_request", failed: false, cancelled: !!scenario.cancelledBefore, outputs: {} };
  const ran = [];
  for (const s of steps) {
    if (!evaluate(s.cond, ctx)) continue;
    ran.push(s.name);
    if (s.id === "mode") ctx.outputs.mode = { mode: scenario.mode ?? "full" };
    if (s.id === "superseded") ctx.outputs.superseded = { superseded: scenario.superseded ?? "false" };
    // A refusal step: prints ::error:: and exits 1 unconditionally (comment lines of the next step
    // that the split leaves at the end of the chunk are ignored).
    const code = stripComments(s.text);
    if (/::error::/.test(code) && /\n\s+exit 1(\n|$)/.test(code)) ctx.failed = true;
    if (scenario.cancelAfter && s.name === scenario.cancelAfter) ctx.cancelled = true;
    if (scenario.failStep && s.name === scenario.failStep) ctx.failed = true;
  }
  return { ran, red: ctx.failed };
}

test("normal full run: pull + suite run, nothing refuses, job green", () => {
  const r = simulate({ mode: "full" });
  for (const n of ["Superseded check", "Install dependencies", "Pull Playwright image", "Run Playwright tests", "Summarise completion"]) assert.ok(r.ran.includes(n), n);
  assert.ok(!r.ran.includes("Refuse a cancelled run") && !r.ran.includes("Fail a cancelled or superseded run"));
  assert.equal(r.red, false);
});

test("cancelled while queued: refuses first, never pulls or runs the suite, job RED", () => {
  const r = simulate({ mode: "full", cancelledBefore: true });
  assert.equal(r.ran[0], "Refuse a cancelled run");
  for (const n of ["Install dependencies", "Pull Playwright image", "Run Playwright tests", "Summarise completion"]) assert.ok(!r.ran.includes(n), n + " must not run");
  assert.equal(r.red, true);
});

test("cancelled while the suite runs: the running step finishes, later steps skip, job RED", () => {
  const r = simulate({ mode: "full", cancelAfter: "Run Playwright tests" });
  assert.ok(r.ran.includes("Run Playwright tests"));
  assert.ok(r.ran.includes("Fail a cancelled or superseded run"));
  assert.ok(!r.ran.includes("Summarise completion"));
  assert.equal(r.red, true);
});

test("cancelled during the image pull: the suite never starts, job RED", () => {
  const r = simulate({ mode: "full", cancelAfter: "Pull Playwright image" });
  assert.ok(!r.ran.includes("Run Playwright tests"));
  assert.equal(r.red, true);
});

test("an earlier failed step (dispatch guard, mode) still blocks install/pull/suite — fail-closed kept", () => {
  for (const [event, failStep] of [["workflow_dispatch", "Manual dispatch guard"], ["pull_request", "Classifier unit tests"]]) {
    const r = simulate({ event, mode: "full", failStep });
    assert.ok(r.ran.includes(failStep), failStep + " must have run");
    for (const n of ["Superseded check", "Install dependencies", "Pull Playwright image", "Run Playwright tests", "Summarise completion"]) assert.ok(!r.ran.includes(n), n + " ran after " + failStep + " failed");
    assert.equal(r.red, true);
  }
});

test("superseded PR run: stops before install/pull/suite, job RED", () => {
  const r = simulate({ mode: "full", superseded: "true" });
  assert.ok(r.ran.includes("Superseded check"));
  for (const n of ["Install dependencies", "Pull Playwright image", "Run Playwright tests", "Summarise completion"]) assert.ok(!r.ran.includes(n), n);
  assert.ok(r.ran.includes("Fail a cancelled or superseded run"));
  assert.equal(r.red, true);
});

test("fast modes are untouched: no pull, no suite, no refusal, green", () => {
  for (const mode of ["docs", "unit-only", "avatar-tool"]) {
    const r = simulate({ mode });
    assert.ok(!r.ran.includes("Pull Playwright image") && !r.ran.includes("Run Playwright tests") && !r.ran.includes("Superseded check"), mode);
    assert.ok(!r.ran.includes("Fail a cancelled or superseded run"), mode);
    assert.equal(r.red, false, mode);
  }
});

test("push to main never consults the superseded check's verdict as a skip", () => {
  const r = simulate({ event: "push", mode: "full", superseded: "false" });
  assert.ok(r.ran.includes("Run Playwright tests"));
  assert.equal(r.red, false);
});

// ── superseded decision ──────────────────────────────────────────────────────────────────────
const A = "a".repeat(40), B = "b".repeat(40);
test("decideSuperseded: only positive evidence skips", () => {
  assert.equal(decideSuperseded({ eventName: "pull_request", eventHeadSha: A, pr: { number: 7, state: "open", head: { sha: A } } }).superseded, false);
  assert.equal(decideSuperseded({ eventName: "pull_request", eventHeadSha: A, pr: { number: 7, state: "open", head: { sha: B } } }).superseded, true);
  assert.equal(decideSuperseded({ eventName: "pull_request", eventHeadSha: A, pr: { number: 7, state: "closed", merged: false, head: { sha: A } } }).superseded, true);
  // any doubt → run
  for (const pr of [null, undefined, {}, { state: "open" }, { state: "open", head: { sha: "short" } }, { state: "weird", head: { sha: B } }]) {
    assert.equal(decideSuperseded({ eventName: "pull_request", eventHeadSha: A, pr }).superseded, false, JSON.stringify(pr));
  }
  assert.equal(decideSuperseded({ eventName: "pull_request", eventHeadSha: "", pr: { state: "open", head: { sha: B } } }).superseded, false);
  for (const ev of ["push", "workflow_dispatch", "", undefined]) {
    assert.equal(decideSuperseded({ eventName: ev, eventHeadSha: A, pr: { state: "open", head: { sha: B } } }).superseded, false, String(ev));
  }
});

test("readPullRequest: errors and bad input → null (which means: run)", async () => {
  assert.equal(await readPullRequest({ repository: "o/r", number: 5, fetchImpl: async () => ({ ok: false }) }), null);
  assert.equal(await readPullRequest({ repository: "o/r", number: 5, fetchImpl: async () => { throw new Error("net"); } }), null);
  assert.equal(await readPullRequest({ repository: "bad repo", number: 5, fetchImpl: async () => ({ ok: true, json: async () => ({}) }) }), null);
  assert.equal(await readPullRequest({ repository: "o/r", number: "5; rm", fetchImpl: async () => ({ ok: true, json: async () => ({}) }) }), null);
  let seen = null;
  const pr = await readPullRequest({ repository: "o/r", number: 5, token: "t", fetchImpl: async (url, opt) => { seen = { url, opt }; return { ok: true, json: async () => ({ state: "open" }) }; } });
  assert.deepEqual(pr, { state: "open" });
  assert.equal(seen.url, "https://api.github.com/repos/o/r/pulls/5");
  assert.equal(seen.opt.method, undefined, "GET only");
});

test("the superseded check only reads: no write calls, no cancel", () => {
  const src = read(".github/ci/superseded-check.mjs");
  for (const verb of ["method:", "POST", "PATCH", "DELETE", "/cancel", "force-cancel", "rerun"]) assert.ok(!src.includes(verb), verb);
});
