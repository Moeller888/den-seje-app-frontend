// fix-tests.ps1 Git-mutation guard (offline: parses the script — never runs it, no network, no git writes).
//
// `fix-tests.ps1` used to end its green path with `git add .`, `git commit` and `git push`: in this PUBLIC
// repository that swept every unignored file in the working tree (including a personal Claude settings
// file) into a commit and pushed it without review. The script now only runs tests, runs the Claude fix
// flow, re-runs tests and reports; the Git lifecycle is handled separately under the
// `.claude/settings.json` permission model. These tests keep it that way:
//   1. the script parses, and no command in it is a mutating git subcommand, any gh call, an indirect
//      invocation (Invoke-Expression, Start-Process, a nested shell) or a dynamic command name;
//   2. the script still runs Playwright, runs the Claude fix flow and re-runs Playwright.
// The script is parsed with PowerShell's own parser (System.Management.Automation.Language AST), so a
// call is found however it is spelled (`git add`, `& git add`, `git -C x add`, `git.exe add`), and
// strings or comments that merely mention git are not. Every detector has a NEGATIVE CONTROL.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = "fix-tests.ps1";
const readScript = () => readFileSync(join(REPO, SCRIPT), "utf8").replace(/^﻿/, "");

// Prints one line per CommandAst (elements joined by U+001F; non-literal elements as <dynamic>) and one
// `ERR:` line per parse error. The source comes in through an environment variable, never the command line.
const EXTRACT = String.raw`
$ErrorActionPreference = 'Stop'
$tokens = $null; $errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseInput($env:FIX_TESTS_AST_SOURCE, [ref]$tokens, [ref]$errors)
foreach ($e in $errors) { Write-Output ('ERR:' + $e.Message) }
$cmds = $ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.CommandAst] }, $true)
foreach ($c in $cmds) {
  $parts = foreach ($el in $c.CommandElements) {
    if ($el -is [System.Management.Automation.Language.StringConstantExpressionAst]) { $el.Value }
    elseif ($el -is [System.Management.Automation.Language.CommandParameterAst]) { '-' + $el.ParameterName }
    else { '<dynamic>' }
  }
  Write-Output ('CMD:' + [string]::Join([string][char]31, @($parts)))
}
`;

function parseCommands(source) {
  let res = null;
  for (const exe of ["pwsh", "powershell"]) {
    res = spawnSync(exe, ["-NoProfile", "-NonInteractive", "-Command", EXTRACT], {
      encoding: "utf8", env: { ...process.env, FIX_TESTS_AST_SOURCE: source },
    });
    if (!(res.error && res.error.code === "ENOENT")) break;
  }
  assert.ok(res && !res.error, `no PowerShell (pwsh or powershell) available to parse ${SCRIPT}: ${res?.error?.message}`);
  assert.equal(res.status, 0, `PowerShell AST extraction failed: ${res.stderr}`);
  const lines = res.stdout.split(/\r?\n/).filter(Boolean);
  return {
    errors: lines.filter((l) => l.startsWith("ERR:")).map((l) => l.slice(4)),
    commands: lines.filter((l) => l.startsWith("CMD:")).map((l) => l.slice(4).split("\u001f")),
  };
}

// ── policy ──────────────────────────────────────────────────────────────────────────────────────

const base = (name) => name.split(/[\\/]/).pop().toLowerCase().replace(/\.exe$/, "");
const MUTATING_GIT = new Set(["add", "commit", "push", "merge", "reset", "clean", "restore", "stash",
  "checkout", "switch", "branch", "worktree", "rebase", "pull", "tag", "cherry-pick", "revert", "rm",
  "mv", "am", "apply", "update-ref", "filter-branch", "filter-repo", "gc", "prune", "notes", "config"]);
const GIT_GLOBAL_WITH_VALUE = new Set(["-c", "-C", "--git-dir", "--work-tree", "--namespace"]);
const INDIRECT = new Set(["invoke-expression", "iex", "start-process", "saps", "start", "invoke-command",
  "icm", "cmd", "powershell", "pwsh", "bash", "sh", "wsl"]);

function gitSubcommand(args) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (GIT_GLOBAL_WITH_VALUE.has(a)) { i++; continue; }
    if (a.startsWith("-")) continue;
    return a;
  }
  return null;
}

function findings(commands) {
  const out = [];
  for (const [name, ...args] of commands) {
    if (name === undefined || name === "<dynamic>") { out.push("dynamic command name"); continue; }
    const cmd = base(name);
    if (cmd === "git") {
      const sub = gitSubcommand(args);
      if (sub === "<dynamic>") out.push("git with a dynamic subcommand");
      else if (sub && MUTATING_GIT.has(sub.toLowerCase())) out.push(`git ${sub}`);
    } else if (cmd === "gh") out.push(`gh ${args[0] ?? ""}`.trim());
    else if (INDIRECT.has(cmd)) out.push(`indirect invocation: ${cmd}`);
  }
  return out;
}

// ── 1. no Git mutation ──────────────────────────────────────────────────────────────────────────

test(`${SCRIPT} parses with no errors`, () => {
  const { errors } = parseCommands(readScript());
  assert.deepEqual(errors, []);
});

test(`${SCRIPT} never stages, commits, pushes, merges, resets, cleans, restores, stashes or calls gh`, () => {
  const { commands } = parseCommands(readScript());
  assert.deepEqual(findings(commands), []);
});

test("Git-mutation detector fires on every forbidden shape (negative control)", () => {
  const forbidden = [
    ["git add .", "git add"], ["git commit -m 'x'", "git commit"], ["git push", "git push"],
    ["git merge main", "git merge"], ["git reset --hard", "git reset"], ["git clean -fdx", "git clean"],
    ["git restore .", "git restore"], ["git stash", "git stash"], ["git -C sub push", "git push"],
    ["& git commit -m x", "git commit"], ["git.exe push", "git push"], ["& 'C:/Git/bin/git.exe' add .", "git add"],
    ["gh pr create --fill", "gh pr"], ["gh pr merge 1", "gh pr"], ["$g = 'git'; & $g push", "dynamic command name"],
    ["git $op", "git with a dynamic subcommand"], ["Invoke-Expression 'git push'", "indirect invocation: invoke-expression"],
    ["Start-Process git -ArgumentList push", "indirect invocation: start-process"], ["cmd /c git push", "indirect invocation: cmd"],
  ];
  for (const [src, expected] of forbidden) {
    const { errors, commands } = parseCommands(src);
    assert.deepEqual(errors, [], `control did not parse: ${src}`);
    assert.ok(findings(commands).includes(expected), `${JSON.stringify(src)} was not flagged as ${expected}`);
  }
  const allowed = 'git status\ngit diff --stat\nnpx playwright test\nWrite-Host "never git push here"\n# git add .';
  assert.deepEqual(findings(parseCommands(allowed).commands), []);
});

// ── 2. the test / fix loop is intact ────────────────────────────────────────────────────────────

test(`${SCRIPT} still runs Playwright, the Claude fix flow, and Playwright again`, () => {
  const { commands } = parseCommands(readScript());
  const playwright = commands.filter(([n, a, b]) => base(n) === "npx" && a === "playwright" && b === "test");
  assert.equal(playwright.length, 2, "expected the initial run and the re-run after the fix flow");
  assert.equal(commands.filter(([n]) => base(n) === "claude").length, 1, "expected exactly one Claude fix-flow call");
});
