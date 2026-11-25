// tools/merge/merge-pr.ps1 — the owner's reusable SHA-locked merge preflight.
//
// Every case runs the REAL script in Windows PowerShell 5.1 and/or PowerShell 7 against a simulated gh client
// (tests/unit/fixtures/merge-pr/fake-gh.ps1). Nothing connects to GitHub. The fake logs the exact argv of every
// call, so the tests prove what reaches the merge command — not only that the dry-run prints the right text.
// The PR-number regression this guards against: `$Pr = 740` was overwritten by `$pr = ConvertFrom-Json …`
// (PowerShell variable names are case-insensitive) and gh pr merge received an object.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "..");
const SCRIPT = join(ROOT, "tools", "merge", "merge-pr.ps1");
const FAKE = join(ROOT, "tests", "unit", "fixtures", "merge-pr", "fake-gh.ps1");
const CHECKS = JSON.parse(readFileSync(join(ROOT, "tools", "merge", "expected-checks.json"), "utf8")).checks;

const REPO = "Moeller888/den-seje-app-frontend";
const HEAD = "1a".repeat(20);
const MAIN = "2b".repeat(20);
const MC = "3c".repeat(20);
const OTHER = "4d".repeat(20);

function available(shell) {
  const r = spawnSync(shell, ["-NoProfile", "-NonInteractive", "-Command", "exit 0"], { encoding: "utf8" });
  return r.status === 0;
}
const SHELLS = (process.platform === "win32" ? ["powershell.exe", "pwsh"] : ["pwsh"]).filter(available);

test("a PowerShell is present where CI requires it", { skip: !process.env.CI }, () => {
  assert.ok(SHELLS.length > 0, "CI must run these tests: no pwsh/powershell found on the runner");
});

function scenario(patch = {}) {
  const runs = Object.entries(CHECKS).map(([name, conclusion], i) => ({ id: i + 1, name, status: "completed", conclusion }));
  const base = {
    repo: REPO,
    mainShas: [MAIN],
    prView: {
      number: 741, state: "OPEN", isDraft: false, headRefOid: HEAD, headRefName: "ci/some-branch", baseRefName: "main",
      isCrossRepository: false, mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", reviewDecision: "",
    },
    checkRuns: { total_count: runs.length, check_runs: runs },
    repoSettings: { allow_merge_commit: true, delete_branch_on_merge: false },
    mergeExit: 0,
    prAfter: { number: 741, state: "MERGED", mergeCommit: { oid: MC } },
    mergeCommit: { sha: MC, parents: [{ sha: MAIN }, { sha: HEAD }] },
    branch: { commit: { sha: HEAD } },
    failKeys: [],
  };
  return typeof patch === "function" ? (patch(base), base) : { ...base, ...patch };
}

function run(shell, sc, { pr = "741", head = HEAD, main = MAIN, merge = false, extra = [], script = SCRIPT } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "merge-pr-"));
  try {
    const scFile = join(dir, "scenario.json");
    const log = join(dir, "calls.log");
    writeFileSync(scFile, JSON.stringify(sc));
    const args = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script,
      "-PrNumber", pr, "-ExpectedHead", head, "-ExpectedMain", main, "-GhCommand", FAKE, ...extra];
    if (merge) args.push("-Merge");
    const r = spawnSync(shell, args, { encoding: "utf8", env: { ...process.env, FAKE_GH_SCENARIO: scFile, FAKE_GH_LOG: log } });
    const calls = existsSync(log)
      ? readFileSync(log, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l.replace(/^﻿/, "")))
      : [];
    return { status: r.status, out: `${r.stdout}\n${r.stderr}`, calls };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const isMerge = (c) => c[0] === "pr" && c[1] === "merge";
const mergeCalls = (r) => r.calls.filter(isMerge);
const EXPECTED_MERGE_ARGV = ["pr", "merge", "741", "--repo", REPO, "--merge", "--match-head-commit", HEAD];

function stopsBeforeMerge(r, text) {
  assert.equal(r.status, 1, r.out);
  assert.equal(mergeCalls(r).length, 0, "nothing may reach gh pr merge");
  assert.match(r.out, /STOP: .*Intet er merget\./);
  if (text) assert.ok(r.out.includes(text), `expected «${text}» in:\n${r.out}`);
}

test("the script source never names a variable that collides with -PrNumber's old short form ($pr/$Pr)", () => {
  const src = readFileSync(SCRIPT, "utf8");
  assert.doesNotMatch(src, /\$pr\b/i);
  assert.match(src, /\$mergeArgs = @\('pr', 'merge', \$PrNumber,/);
});

for (const shell of SHELLS) {
  test(`[${shell}] dry-run: every check passes, only read-only calls, merge argv shown but not sent`, () => {
    const r = run(shell, scenario());
    assert.equal(r.status, 0, r.out);
    assert.equal(mergeCalls(r).length, 0);
    for (const c of r.calls) {
      assert.ok((c[0] === "pr" && c[1] === "view") || c[0] === "api", `unexpected call ${c.join(" ")}`);
      assert.ok(!c.some((a) => /^(-X|--method|-f|-F|--field|--raw-field|--input)$/.test(a)), `not a GET: ${c.join(" ")}`);
    }
    assert.ok(r.out.includes(`DRY-RUN BESTOD`), r.out);
    assert.ok(r.out.includes(EXPECTED_MERGE_ARGV.join(" ")), r.out);
  });

  test(`[${shell}] merge: the numeric PR number and the full head SHA reach gh pr merge, after the last main check`, () => {
    const r = run(shell, scenario(), { merge: true });
    assert.equal(r.status, 0, r.out);
    const m = mergeCalls(r);
    assert.equal(m.length, 1);
    assert.deepEqual(m[0], EXPECTED_MERGE_ARGV);
    assert.match(m[0][2], /^[1-9][0-9]*$/);
    const idx = r.calls.findIndex(isMerge);
    const mainBefore = r.calls.slice(0, idx).filter((c) => c[0] === "api" && c[1] === `repos/${REPO}/commits/main`);
    assert.equal(mainBefore.length, 2, "main is read at preflight and again immediately before the merge");
    assert.deepEqual(r.calls[idx - 1], ["api", `repos/${REPO}/commits/main`], "the merge follows the final main check directly");
    assert.ok(r.out.includes(`FÆRDIG: PR #741 merget med merge commit ${MC}`), r.out);
  });

  test(`[${shell}] wrong HEAD stops with expected and observed values`, () => {
    stopsBeforeMerge(run(shell, scenario((s) => { s.prView.headRefOid = OTHER; }), { merge: true }),
      `AFVIG PR head SHA: forventet '${HEAD}', observeret '${OTHER}'`);
  });

  test(`[${shell}] changed main stops — at preflight and between preflight and merge`, () => {
    stopsBeforeMerge(run(shell, scenario({ mainShas: [OTHER] }), { merge: true }), `AFVIG main SHA: forventet '${MAIN}', observeret '${OTHER}'`);
    const r = run(shell, scenario({ mainShas: [MAIN, OTHER] }), { merge: true });
    stopsBeforeMerge(r, `AFVIG main uændret lige før merge: forventet '${MAIN}', observeret '${OTHER}'`);
  });

  test(`[${shell}] missing, failing, pending, duplicate and unexpected checks all stop`, () => {
    stopsBeforeMerge(run(shell, scenario((s) => { s.checkRuns.check_runs = s.checkRuns.check_runs.filter((c) => c.name !== "unit"); s.checkRuns.total_count--; }), { merge: true }),
      "AFVIG check 'unit' antal kørsler: forventet '1', observeret '0'");
    stopsBeforeMerge(run(shell, scenario((s) => { s.checkRuns.check_runs[3].conclusion = "failure"; }), { merge: true }),
      `AFVIG check '${s4()}' conclusion: forventet 'success', observeret 'failure'`);
    stopsBeforeMerge(run(shell, scenario((s) => { s.checkRuns.check_runs[3].status = "in_progress"; s.checkRuns.check_runs[3].conclusion = null; }), { merge: true }),
      `AFVIG check '${s4()}' status: forventet 'completed', observeret 'in_progress'`);
    stopsBeforeMerge(run(shell, scenario((s) => { s.checkRuns.check_runs.push({ ...s.checkRuns.check_runs[0], id: 99 }); s.checkRuns.total_count++; }), { merge: true }),
      "AFVIG check 'classify' antal kørsler: forventet '1', observeret '2'");
    stopsBeforeMerge(run(shell, scenario((s) => { s.checkRuns.check_runs.push({ id: 98, name: "deploy-anything", status: "completed", conclusion: "success" }); s.checkRuns.total_count++; }), { merge: true }),
      "AFVIG uventede checks: forventet '(ingen)', observeret 'deploy-anything'");
    stopsBeforeMerge(run(shell, scenario((s) => { s.checkRuns.total_count = 130; }), { merge: true }),
      "AFVIG check-runs i alt ifølge GitHub (ingen ekstra side)");
  });

  test(`[${shell}] wrong PR number from GitHub stops; malformed arguments stop before any call`, () => {
    stopsBeforeMerge(run(shell, scenario((s) => { s.prView.number = 742; }), { merge: true }), "AFVIG PR nummer: forventet '741', observeret '742'");
    for (const [opt, value] of [["pr", "741abc"], ["pr", "7.5"], ["pr", "0741"], ["pr", " 741"], ["pr", "-741"], ["head", HEAD.toUpperCase()], ["head", HEAD.slice(0, 12)], ["main", ""]]) {
      const r = run(shell, scenario(), { merge: true, [opt]: value });
      assert.equal(r.status, 2, `${opt}=${JSON.stringify(value)}: ${r.out}`);
      assert.equal(r.calls.length, 0, `${opt}=${JSON.stringify(value)} must not call gh at all`);
    }
  });

  test(`[${shell}] failing GitHub calls stop before the merge`, () => {
    for (const k of ["prView", "main", "checkRuns", "repoSettings"]) {
      stopsBeforeMerge(run(shell, scenario({ failKeys: [k] }), { merge: true }), "(exitkode): forventet '0', observeret '1'");
    }
  });

  test(`[${shell}] PR state, review and repository settings are enforced`, () => {
    for (const [patch, text] of [
      [(s) => { s.prView.isDraft = true; }, "AFVIG PR isDraft: forventet 'False', observeret 'True'"],
      [(s) => { s.prView.mergeStateStatus = "BLOCKED"; }, "AFVIG PR mergeStateStatus: forventet 'CLEAN', observeret 'BLOCKED'"],
      [(s) => { s.prView.reviewDecision = "CHANGES_REQUESTED"; }, "AFVIG PR reviewDecision"],
      [(s) => { s.prView.baseRefName = "feat/other"; }, "AFVIG PR base: forventet 'main', observeret 'feat/other'"],
      [(s) => { s.prView.isCrossRepository = true; }, "AFVIG PR isCrossRepository"],
      [(s) => { s.repoSettings.delete_branch_on_merge = true; }, "AFVIG repo delete_branch_on_merge: forventet 'False', observeret 'True'"],
      [(s) => { s.repoSettings.allow_merge_commit = false; }, "AFVIG repo allow_merge_commit: forventet 'True', observeret 'False'"],
    ]) stopsBeforeMerge(run(shell, scenario(patch), { merge: true }), text);
  });

  test(`[${shell}] a failing merge call exits 3; deviating merge parents or a deleted branch exit 4`, () => {
    const failed = run(shell, scenario({ mergeExit: 1 }), { merge: true });
    assert.equal(failed.status, 3, failed.out);
    assert.equal(mergeCalls(failed).length, 1);
    const moved = run(shell, scenario((s) => { s.mergeCommit.parents = [{ sha: OTHER }, { sha: HEAD }]; }), { merge: true });
    assert.equal(moved.status, 4, moved.out);
    assert.ok(moved.out.includes(`AFVIG efter: forælder 1 (main): forventet '${MAIN}', observeret '${OTHER}'`), moved.out);
    const squash = run(shell, scenario((s) => { s.mergeCommit.parents = [{ sha: MAIN }]; }), { merge: true });
    assert.equal(squash.status, 4, squash.out);
    assert.ok(squash.out.includes("AFVIG efter: antal forældre: forventet '2', observeret '1'"), squash.out);
    const gone = run(shell, scenario({ failKeys: ["branch"] }), { merge: true });
    assert.equal(gone.status, 4, gone.out);
    assert.ok(gone.out.includes("AFVIG efter: branch bevaret på head"), gone.out);
  });
}

for (const shell of SHELLS) {
  test(`[${shell}] negative control: the #740 bug (the PR object instead of its number) is caught by the argv check`, () => {
    const dir = mkdtempSync(join(tmpdir(), "merge-pr-mut-"));
    try {
      const src = readFileSync(SCRIPT, "utf8");
      const mutated = src.replace("$mergeArgs = @('pr', 'merge', $PrNumber,", "$mergeArgs = @('pr', 'merge', $prView,");
      assert.notEqual(mutated, src, "the mutation must apply");
      const copy = join(dir, "merge-pr.ps1");
      writeFileSync(copy, mutated);
      const r = run(shell, scenario(), { merge: true, script: copy, extra: ["-ExpectedChecksFile", join(ROOT, "tools", "merge", "expected-checks.json")] });
      const m = mergeCalls(r);
      assert.equal(m.length, 1, r.out);
      assert.notDeepEqual(m[0], EXPECTED_MERGE_ARGV, "the argv assertion distinguishes the bug");
      assert.doesNotMatch(m[0][2], /^[1-9][0-9]*$/, `the mutated script sent ${JSON.stringify(m[0][2])}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

function s4() { return Object.keys(CHECKS)[3]; }
