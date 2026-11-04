// Only the newest main commit spends the shared E2E lock (.github/ci/superseded-check.mjs,
// decideMainSuperseded). An older push run on main/master stops — red, never green — when, read at its
// lock acquisition, the branch has moved STRICTLY AHEAD of its commit to a head that already has its
// own push run of the same workflow. Everything else (pull requests, other branches, any read error,
// diverged history, no newer run) runs the suite.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  decideMainSuperseded, decideSuperseded, readBranchHead, readCompare, readPushRun,
} from "../../.github/ci/superseded-check.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => readFileSync(join(ROOT, f), "utf8");
const C1 = "1".repeat(40), C2 = "2".repeat(40), C3 = "3".repeat(40);
const WF = 4711;
const MAIN = "refs/heads/main";
const ahead = (n) => ({ status: "ahead", ahead_by: n, behind_by: 0 });
const runFor = (sha, over = {}) => ({ id: 900, head_sha: sha, event: "push", workflow_id: WF, ...over });
const base = { eventName: "push", ref: MAIN, sha: C1, head: C3, compare: ahead(2), newerRun: runFor(C3), workflowId: WF };

test("superseded only with all positive evidence", () => {
  const d = decideMainSuperseded(base);
  assert.equal(d.superseded, true, d.reason);
  assert.equal(decideMainSuperseded({ ...base, ref: "refs/heads/master" }).superseded, true);
});

test("pull request runs are never touched by the main logic", () => {
  for (const eventName of ["pull_request", "pull_request_target", "workflow_dispatch", "schedule", "", undefined, null]) {
    assert.equal(decideMainSuperseded({ ...base, eventName }).superseded, false, String(eventName));
  }
  // and the PR decision itself is unchanged: a push is never "superseded" by PR rules
  assert.equal(decideSuperseded({ eventName: "push", eventHeadSha: C1, pr: { state: "open", head: { sha: C2 } } }).superseded, false);
});

test("the newest commit always runs", () => {
  assert.equal(decideMainSuperseded({ ...base, sha: C3, head: C3 }).superseded, false);
});

test("any missing or doubtful evidence → run", () => {
  const cases = {
    "other branch": { ref: "refs/heads/feature" },
    "tag": { ref: "refs/tags/d-number/D-220" },
    "no ref": { ref: undefined },
    "bad sha": { sha: "abc" },
    "head unreadable": { head: null },
    "head not a sha": { head: "main" },
    "compare unreadable": { compare: null },
    "diverged": { compare: { status: "diverged", ahead_by: 2, behind_by: 1 } },
    "behind (main rewound)": { compare: { status: "behind", ahead_by: 0, behind_by: 2 } },
    "identical": { compare: { status: "identical", ahead_by: 0, behind_by: 0 } },
    "ahead without count": { compare: { status: "ahead" } },
    // each compare condition on its own (the others satisfied)
    "status not ahead, counts look ahead": { compare: { status: "diverged", ahead_by: 2, behind_by: 0 } },
    "status ahead but also behind": { compare: { status: "ahead", ahead_by: 2, behind_by: 1 } },
    "status ahead, behind_by missing": { compare: { status: "ahead", ahead_by: 2 } },
    "no newer run": { newerRun: null },
    "newer run for another sha": { newerRun: runFor(C2) },
    "newer run of another workflow": { newerRun: runFor(C3, { workflow_id: 1 }) },
    "newer run is a pull_request run": { newerRun: runFor(C3, { event: "pull_request" }) },
    "own workflow id unknown": { workflowId: null },
  };
  for (const [name, over] of Object.entries(cases)) {
    const d = decideMainSuperseded({ ...base, ...over });
    assert.equal(d.superseded, false, `${name}: ${d.reason}`);
  }
});

test("three quick merges: the two older push runs stop, the newest runs", () => {
  // Main is C1 → C2 → C3; all three push runs queue and reach the lock one after another while main = C3.
  const runs = { [C1]: runFor(C1, { id: 1 }), [C2]: runFor(C2, { id: 2 }), [C3]: runFor(C3, { id: 3 }) };
  const order = [C1, C2, C3];
  const compareOf = (b, h) => {
    const i = order.indexOf(b), j = order.indexOf(h);
    return i === j ? { status: "identical", ahead_by: 0, behind_by: 0 } : ahead(j - i);
  };
  const ran = [];
  for (const sha of order) {
    const head = C3;
    const d = decideMainSuperseded({ eventName: "push", ref: MAIN, sha, head, compare: sha === head ? null : compareOf(sha, head), newerRun: sha === head ? null : runs[head], workflowId: WF });
    if (!d.superseded) ran.push(sha);
  }
  assert.deepEqual(ran, [C3]);
});

test("race: a push whose newer head has no run yet (or [skip ci]) keeps testing", () => {
  assert.equal(decideMainSuperseded({ ...base, newerRun: null }).superseded, false);
});

test("API reads: exact GET URLs; errors and bad input → null", async () => {
  const urls = [];
  const ok = (body) => async (url, opt) => { urls.push(url); assert.equal(opt.method, undefined, "GET only"); return { ok: true, json: async () => body }; };
  assert.equal(await readBranchHead({ repository: "o/r", ref: MAIN, fetchImpl: ok({ object: { sha: C3 } }) }), C3);
  assert.equal(urls.pop(), "https://api.github.com/repos/o/r/git/ref/heads/main");
  assert.deepEqual(await readCompare({ repository: "o/r", base: C1, head: C3, fetchImpl: ok(ahead(2)) }), ahead(2));
  assert.equal(urls.pop(), `https://api.github.com/repos/o/r/compare/${C1}...${C3}?per_page=1`);
  const r = await readPushRun({ repository: "o/r", workflowId: WF, sha: C3, fetchImpl: ok({ workflow_runs: [runFor(C2), runFor(C3)] }) });
  assert.equal(r.head_sha, C3);
  assert.equal(urls.pop(), `https://api.github.com/repos/o/r/actions/workflows/${WF}/runs?event=push&head_sha=${C3}&per_page=5`);
  assert.equal(await readPushRun({ repository: "o/r", workflowId: WF, sha: C3, fetchImpl: ok({ workflow_runs: [runFor(C3, { event: "pull_request" })] }) }), null);

  const fail = async () => ({ ok: false });
  const boom = async () => { throw new Error("net"); };
  assert.equal(await readBranchHead({ repository: "o/r", ref: MAIN, fetchImpl: fail }), null);
  assert.equal(await readBranchHead({ repository: "o/r", ref: MAIN, fetchImpl: boom }), null);
  assert.equal(await readBranchHead({ repository: "o/r", ref: MAIN, fetchImpl: ok({ object: { sha: "zz" } }) }), null);
  assert.equal(await readBranchHead({ repository: "o/r", ref: "refs/heads/feature", fetchImpl: ok({ object: { sha: C3 } }) }), null);
  assert.equal(await readBranchHead({ repository: "bad repo", ref: MAIN, fetchImpl: ok({ object: { sha: C3 } }) }), null);
  assert.equal(await readCompare({ repository: "o/r", base: "x", head: C3, fetchImpl: ok(ahead(1)) }), null);
  assert.equal(await readCompare({ repository: "o/r", base: C1, head: C3, fetchImpl: fail }), null);
  assert.equal(await readPushRun({ repository: "o/r", workflowId: "1", sha: C3, fetchImpl: ok({ workflow_runs: [runFor(C3)] }) }), null);
  assert.equal(await readPushRun({ repository: "o/r", workflowId: WF, sha: C3, fetchImpl: boom }), null);
});

test("CLI: a push run whose lookups fail runs the suite (stale=false)", () => {
  const out = join(mkdtempSync(join(tmpdir(), "supersede-")), "out");
  const r = spawnSync(process.execPath, [join(ROOT, ".github/ci/superseded-check.mjs")], {
    env: { ...process.env, EVENT_NAME: "push", PUSH_REF: MAIN, PUSH_SHA: C1, GITHUB_REPOSITORY: "not a repo",
           GITHUB_RUN_ID: "x", GITHUB_TOKEN: "", GITHUB_OUTPUT: out },
    encoding: "utf8", timeout: 30000,
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(out, "utf8"), "stale=false\n");
  assert.match(r.stdout, /branch head unreadable → run/);
});

test("workflow passes the push ref and sha to the stale check; a stale run ends red", () => {
  const y = read(".github/workflows/playwright.yml");
  const at = y.indexOf("- name: Stale run check (superseded or cancelled)");
  assert.ok(at > 0);
  const step = y.slice(at, y.indexOf("- name: Install dependencies", at));
  assert.match(step, /PUSH_REF: \$\{\{ github\.ref \}\}/);
  assert.match(step, /PUSH_SHA: \$\{\{ github\.sha \}\}/);
  assert.match(step, /EVENT_HEAD_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
  const fail = y.slice(y.indexOf("- name: Fail a stale run"));
  assert.match(fail, /if: steps\.stale\.outputs\.stale == 'true'/);
  assert.match(fail, /exit 1/);
});

test("the main logic only runs for push events in the CLI", () => {
  const src = read(".github/ci/superseded-check.mjs");
  const cli = src.slice(src.indexOf("const invoked"));
  assert.match(cli, /if \(env\.EVENT_NAME === "push"\) \{[\s\S]*decideMainSuperseded/);
});

test("D-261: the main-push path is dormant — the test job no longer runs on push — but kept intact for a revert", () => {
  const y = read(".github/workflows/playwright.yml").split("\r\n").join("\n");
  const job = y.slice(y.indexOf("\n  test:\n"));
  assert.ok(job.startsWith("\n  test:\n    needs: classify\n    if: always() && github.event_name == 'workflow_dispatch'\n"),
    "no push run reaches the stale check any more");
  // The wiring a revert would need is still there (asserted in full by the test above).
  assert.match(job, /- name: Stale run check \(superseded or cancelled\)/);
  // A manual dispatch is never a main-push run: decideMainSuperseded keeps answering "run" for it.
  assert.equal(decideMainSuperseded({ ...base, eventName: "workflow_dispatch" }).superseded, false);
});
