// A4: the contract of .github/workflows/e2e-prod-provision.yml (docs/operations/e2e-prod-provisioning.md).
//
// Pinned:
//   1. manual dispatch only (no push, pull_request, schedule, workflow_call …), mode defaults to dry-run;
//   2. one job, main only, in environment e2e-prod, on the shared E2E lock, read-only token;
//   3. exactly five secrets — the URL, the service key and the three addresses — each mapped once to its
//      own name; no password, no anon key, no test-account password;
//   4. no dependencies, no Playwright, and the one run line passes the inputs only as quoted env vars
//      (an input is never interpolated into the script);
//   5. the sparse checkout is exactly the provisioning script's import closure;
//   6. no other workflow runs the provisioning script, and the isolated check runs only in the isolated
//      workflow's production lane, after the suite, inside the network lock group.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const ROOT = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), "utf8").replace(/\r\n/g, "\n");
const WF = ".github/workflows/e2e-prod-provision.yml";
const text = read(WF);
const code = text.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");

const SECRETS = ["E2E_PROD_SUPABASE_SERVICE_ROLE_KEY", "E2E_PROD_SUPABASE_URL", "E2E_PROD_TEST_STUDENT2_EMAIL",
  "E2E_PROD_TEST_STUDENT_EMAIL", "E2E_PROD_TEST_TEACHER_EMAIL"];

const block = (src, startRe) => {
  const m = startRe.exec(src);
  assert.ok(m, `block ${startRe}`);
  const rest = src.slice(m.index + m[0].length);
  const end = rest.search(/\n[A-Za-z]/);
  return end < 0 ? rest : rest.slice(0, end + 1);
};

test("1. manual dispatch only, with mode (default dry-run), slot and confirm inputs", () => {
  const on = block(code, /\non:\n/);
  assert.deepEqual([...on.matchAll(/^  ([a-z_]+):/gm)].map((m) => m[1]), ["workflow_dispatch"]);
  const inputs = [...on.matchAll(/^      ([a-z_]+):$/gm)].map((m) => m[1]);
  assert.deepEqual(inputs, ["mode", "slot", "confirm"]);
  assert.match(on, /      mode:\n(?:        .*\n)*?        type: choice\n        options:\n          - dry-run\n          - apply\n        default: dry-run\n/);
  assert.match(on, /      slot:\n(?:        .*\n)*?        options:\n          - "0"\n          - "1"\n          - "2"\n          - "3"\n        default: "0"\n/);
  assert.match(on, /      confirm:\n(?:        .*\n)*?        type: string\n        required: false\n        default: ""\n/);
  for (const t of ["push", "pull_request", "pull_request_target", "schedule", "workflow_call", "workflow_run", "repository_dispatch"]) {
    assert.ok(!new RegExp(`^\\s+${t}:`, "m").test(on), t);
  }
});

test("2. one job: main only, environment e2e-prod, shared lock, read-only token", () => {
  assert.match(code, /\npermissions:\n  contents: read\n/);
  const jobs = block(code, /\njobs:\n/);
  assert.deepEqual([...jobs.matchAll(/^  ([A-Za-z0-9_-]+):$/gm)].map((m) => m[1]), ["provision"]);
  assert.ok(jobs.startsWith("  provision:\n    if: github.ref == 'refs/heads/main'\n"), "the job runs only from main");
  assert.equal((jobs.match(/^    environment: e2e-prod$/gm) ?? []).length, 1);
  assert.equal((jobs.match(/environment:/g) ?? []).length, 1);
  assert.match(jobs, /    concurrency:\n      group: e2e-shared-supabase\n      cancel-in-progress: false\n      queue: max\n/);
  assert.ok(!/^\s+permissions:/m.test(jobs), "no job-level permissions");
  assert.ok(!/continue-on-error|secrets: inherit/.test(jobs));
});

test("3. exactly the five secrets, each mapped once to its own name — no password, no anon key", () => {
  const names = [...new Set([...code.matchAll(/\bsecrets\.([A-Za-z0-9_]+)/g)].map((m) => m[1]))].sort();
  assert.deepEqual(names, SECRETS);
  for (const n of SECRETS) {
    const defs = code.match(new RegExp(`^.*\\bsecrets\\.${n}\\b.*$`, "gm")) ?? [];
    assert.deepEqual(defs, [`          ${n}: \${{ secrets.${n} }}`], n);
  }
  assert.doesNotMatch(code, /PASSWORD|ANON_KEY|PUBLISHABLE/);
  assert.match(code, /^          E2E_PROD_ENVIRONMENT: \$\{\{ vars\.E2E_PROD_ENVIRONMENT \}\}$/m);
});

test("4. no dependencies; the inputs reach the script only as quoted env vars", () => {
  for (const banned of [/npm\s+(?:ci|install|i)\b/, /\bnpx\b/, /playwright/i, /global-setup/, /\bcurl\b/, /\bgh\s/]) assert.doesNotMatch(code, banned);
  const runs = [...code.matchAll(/^\s+run:\s*(.*)$/gm)].map((m) => m[1].trim());
  assert.deepEqual(runs, ['node tools/e2e/provision-accounts.mjs --mode="$PROVISION_MODE" --confirm="$PROVISION_CONFIRM"']);
  const exprs = [...code.matchAll(/\$\{\{[^}]*\binputs\.[^}]*\}\}/g)].map((m) => m[0]);
  assert.deepEqual(exprs.sort(), ["${{ inputs.confirm }}", "${{ inputs.mode }}", "${{ inputs.slot }}"]);
  for (const [name, input] of [["PROVISION_MODE", "mode"], ["PROVISION_CONFIRM", "confirm"], ["E2E_SLOT", "slot"]]) {
    assert.match(code, new RegExp(`^          ${name}: \\$\\{\\{ inputs\\.${input} \\}\\}$`, "m"));
  }
  assert.match(code, /persist-credentials: false/);
});

// The relative imports of a module, followed recursively (plain `from "./x"` / `from "../x"`).
function importClosure(path, seen = new Set()) {
  if (seen.has(path)) return seen;
  seen.add(path);
  for (const m of read(path).matchAll(/^\s*(?:import|export)[^;]*?from\s+"(\.{1,2}\/[^"]+)"/gms)) {
    importClosure(new URL(m[1], new URL(path, ROOT)).pathname.slice(new URL(ROOT).pathname.length), seen);
  }
  return seen;
}

test("5. the sparse checkout is exactly the provisioning script's import closure", () => {
  const listed = block(code, /\n          sparse-checkout: \|\n/).split("\n").map((l) => l.trim()).filter((l) => l !== "" && !l.includes(":"));
  const closure = [...importClosure("tools/e2e/provision-accounts.mjs")].map(decodeURIComponent).sort();
  assert.deepEqual(listed.sort(), closure);
  assert.ok(closure.includes("tests/e2e-accounts.mjs") && closure.includes(".github/ci/e2e-prod-key-check.mjs"));
  assert.match(code, /sparse-checkout-cone-mode: false/);
});

test("6. only this workflow runs the provisioning script; the isolated check is fenced", () => {
  const dir = new URL(".github/workflows/", ROOT);
  const runners = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f))
    .filter((f) => read(`.github/workflows/${f}`).includes("tools/e2e/provision-accounts.mjs"));
  assert.deepEqual(runners, ["e2e-prod-provision.yml"]);
  const iso = read(".github/workflows/isolated-e2e.yml");
  const users = readdirSync(dir).filter((f) => read(`.github/workflows/${f}`).includes("tools/e2e/isolated-provision-check.mjs"));
  assert.deepEqual(users, ["isolated-e2e.yml"]);
  const step = iso.slice(iso.indexOf("      - name: Provisioning (A4)"));
  const stepBlock = step.slice(0, step.indexOf("\n      - name:", 10));
  assert.match(stepBlock, /if: needs\.plan\.outputs\.scope != 'docs-md' && matrix\.profile == 'production'\n/);
  assert.match(stepBlock, /run: \|\n          sg "\$ISOLATED_GROUP" -c "node tools\/e2e\/isolated-provision-check\.mjs"\n/);
  assert.ok(iso.indexOf("      - name: Provisioning (A4)") > iso.indexOf("      - name: Existing Playwright suite against the isolated stack"), "after the suite");
  assert.doesNotMatch(stepBlock, /secrets\./);
  // The isolated check refuses a non-isolated environment before its first request, and never names production.
  const check = read("tools/e2e/isolated-provision-check.mjs").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
  const guard = check.indexOf("assertIsolated(process.env);");
  assert.ok(guard > 0 && guard < check.indexOf("fetch(") && guard < check.indexOf("await main("), "isolation guard first");
  assert.doesNotMatch(check, /E2E_PROD_|supabase\.co|tjzbehwfagiwpwodsgwg/);
});
