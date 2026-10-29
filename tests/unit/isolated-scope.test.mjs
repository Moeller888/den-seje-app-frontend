// D-110 / D-241: the isolated E2E's docs-only fast path (tests/isolated/scope.mjs). "docs-md" only for
// pure Markdown under docs/; every other change, every doubt and every error → "full". The workflow
// keeps the check `isolated-e2e (run 1)` on both paths and gates every heavy step on the exact value.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { scopeFor, recheck, planScope, pathsOf, DOCS_MD, FULL } from "../isolated/scope.mjs";

const f = (filename, status = "modified", previous_filename) => ({ filename, status, ...(previous_filename ? { previous_filename } : {}) });
const scope = (files, expectedCount = files.length) => scopeFor({ files, expectedCount }).scope;

test("pure Markdown under docs/ — added, modified, removed, renamed within docs/ — is docs-md", () => {
  assert.equal(scope([f("docs/ROADMAP.md")]), DOCS_MD);
  assert.equal(scope([f("docs/decisions/D-999.md", "added"), f("docs/old.md", "removed")]), DOCS_MD);
  assert.equal(scope([f("docs/new-name.md", "renamed", "docs/old-name.md")]), DOCS_MD);
  assert.equal(scope([f("docs/Upper.MD")]), DOCS_MD, "extension case-insensitive");
});

test("mixed PRs are full: one non-docs file is enough", () => {
  assert.equal(scope([f("docs/ROADMAP.md"), f("app.js")]), FULL);
  assert.equal(scope([f("docs/ROADMAP.md"), f("tests/unit/x.test.mjs")]), FULL, "unit-only + docs is not docs-only");
  assert.equal(scope([f("docs/ROADMAP.md"), f("tools/avatar/x.mjs")]), FULL, "avatar-tool + docs is not docs-only");
  assert.equal(scope([f("docs/ROADMAP.md"), f("README.md")]), FULL, "Markdown outside docs/");
});

test("workflow, security, migration, function and executable-documentation changes are always full", () => {
  for (const p of [".github/workflows/isolated-e2e.yml", ".github/ci/classify-changes.mjs", ".claude/settings.json",
    "supabase/migrations/20990101000000_x.sql", "supabase/functions/process-event/index.ts", "tests/isolated/scope.mjs",
    "worker/index.js", "package.json", "docs/operations/rollback-danish-question-bank-text.sql", "docs/generate_avatar_spec.py",
    "docs/metadata.schema.json", "docs/Avatar_Creator_Production_Spec_v1.docx", "docs/page.html", "docs/notes.md.sh"]) {
    assert.equal(scope([f(p)]), FULL, p);
    assert.equal(scope([f("docs/ROADMAP.md"), f(p)]), FULL, `docs + ${p}`);
  }
});

test("renames: a move out of docs/, into docs/ from elsewhere, or of a non-Markdown file is full", () => {
  assert.equal(scope([f("app.md", "renamed", "docs/app.md")]), FULL, "moved out of docs/");
  assert.equal(scope([f("docs/app.md", "renamed", "app.js")]), FULL, "app.js renamed into docs/ — its removal matters");
  assert.equal(scope([f("docs/x.md", "renamed", "docs/x.sql")]), FULL, "the old path was not Markdown");
  assert.equal(scope([f("docs/x.md", "renamed")]), FULL, "a rename without its old path");
  assert.deepEqual(pathsOf([f("docs/b.md", "renamed", "docs/a.md")]), ["docs/b.md", "docs/a.md"]);
});

test("deletions count like any change: deleting a non-docs file is full", () => {
  assert.equal(scope([f("docs/x.md", "removed")]), DOCS_MD);
  assert.equal(scope([f("app.js", "removed")]), FULL);
  assert.equal(scope([f("docs/x.md", "removed"), f("supabase/migrations/2026_x.sql", "removed")]), FULL);
});

test("unknown or malformed file information is full", () => {
  assert.equal(scope([f("docs/x.md", "changed")]), FULL, "mode change (e.g. +x)");
  assert.equal(scope([f("docs/x.md", "copied")]), FULL);
  assert.equal(scope([f("docs/x.md", "weird")]), FULL);
  assert.equal(scope([{ status: "modified" }]), FULL, "no filename");
  assert.equal(scope([null]), FULL);
  assert.equal(scope(["docs/x.md"]), FULL, "a bare string is not a file entry");
  for (const p of ["docs/../app.js", "docs//x.md", " docs/x.md", "docs\\x.md", "docs/./x.md"]) assert.equal(scope([f(p)]), FULL, JSON.stringify(p));
});

test("an incomplete or unverifiable list is full", () => {
  assert.equal(scope([]), FULL, "empty");
  assert.equal(scopeFor({}).scope, FULL, "nothing at all");
  assert.equal(scope([f("docs/x.md")], 2), FULL, "GitHub reports more changed files than were listed");
  assert.equal(scopeFor({ files: [f("docs/x.md")] }).scope, FULL, "count unknown");
  assert.equal(scopeFor({ files: [f("docs/x.md")], expectedCount: "1" }).scope, FULL, "count not an integer");
  const many = Array.from({ length: 3000 }, (_, i) => f(`docs/p${i}.md`));
  assert.equal(scope(many), FULL, "at GitHub's 3000-file cap the list may be truncated");
});

test("API errors and non-PR events are full; the plan never throws", () => {
  const broken = () => { throw new Error("HTTP 502: Bad Gateway"); };
  assert.equal(planScope({ event: "pull_request", repo: "o/r", pr: "7", gh: broken }).scope, FULL);
  assert.equal(planScope({ event: "pull_request", repo: "o/r", pr: "7", gh: () => "not json" }).scope, FULL);
  assert.equal(planScope({ event: "pull_request", repo: "o/r", pr: "7", gh: (a) => (a[1].includes("/files") ? '{"message":"x"}' : '{"changed_files":1}') }).scope, FULL, "files page is not an array");
  assert.equal(planScope({ event: "push", repo: "o/r", pr: "", gh: broken }).scope, FULL);
  assert.equal(planScope({ event: "workflow_dispatch", repo: "o/r", pr: "", gh: broken }).scope, FULL);
  assert.equal(planScope({ event: "pull_request", repo: "o/r", pr: "", gh: broken }).scope, FULL, "no PR number");
  // A working API with a docs-only PR → docs-md, and the list it returns is what the job re-checks.
  const ok = (a) => (a[1].includes("/files") ? JSON.stringify([{ filename: "docs/a.md", status: "modified", sha: "x" }]) : '{"changed_files":1}');
  const r = planScope({ event: "pull_request", repo: "o/r", pr: "7", gh: ok });
  assert.equal(r.scope, DOCS_MD);
  assert.deepEqual(r.files, [{ filename: "docs/a.md", status: "modified", previous_filename: undefined }]);
});

test("the fast-path re-check refuses anything but a valid docs-md list (red, never green)", () => {
  const b64 = (v) => Buffer.from(JSON.stringify(v)).toString("base64");
  assert.equal(recheck(b64([f("docs/a.md")])).ok, true);
  assert.equal(recheck(b64([f("docs/a.md"), f("app.js")])).ok, false);
  assert.equal(recheck(b64([])).ok, false);
  assert.equal(recheck("").ok, false);
  assert.equal(recheck("%%%not-base64%%%").ok, false);
  assert.equal(recheck(Buffer.from("{").toString("base64")).ok, false);
});

test("workflow: the check runs on both paths, only the exact value skips, the guard still runs first", () => {
  const wf = readFileSync(new URL("../../.github/workflows/isolated-e2e.yml", import.meta.url), "utf8");
  const job = wf.slice(wf.indexOf("\n  isolated-e2e:\n"));
  // No job-level `if:` — the matrix job (and so the check name) exists on every pull request.
  assert.doesNotMatch(job.slice(0, job.indexOf("    steps:")), /\n    if:/);
  assert.match(job, /name: isolated-e2e \(run \$\{\{ matrix\.run \}\}\)/);
  const steps = job.split("\n      - ").slice(1);
  const name = (s) => (s.match(/^(?:name|uses): (.*)/) ?? [])[1] ?? "";
  for (const s of steps) {
    const n = name(s);
    if (/^actions\/(checkout|setup-node)@/.test(n) || n.startsWith("Guard —")) { assert.doesNotMatch(s, /\n        if:/, n); continue; }
    if (n.startsWith("Docs-only fast path")) { assert.match(s, /\n        if: needs\.plan\.outputs\.scope == 'docs-md'\n/); continue; }
    // Every other step: skipped ONLY for the exact value "docs-md"; any other value runs it.
    assert.match(s, /\n        if: (?:(?:always|failure)\(\) && )?needs\.plan\.outputs\.scope != 'docs-md'\n/, n);
  }
  assert.ok(steps.findIndex((s) => name(s).startsWith("Guard —")) < steps.findIndex((s) => name(s).startsWith("Docs-only fast path")));
  // The plan lists PR files read-only, and its scope is computed by scope.mjs alone.
  assert.match(wf, /    permissions:\n      contents: read\n      pull-requests: read\n/);
  assert.match(wf, /run: node tests\/isolated\/scope\.mjs plan/);
  assert.match(wf, /scope: \$\{\{ steps\.scope\.outputs\.scope \}\}/);
});
