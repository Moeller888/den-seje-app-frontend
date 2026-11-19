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
//      workflow's production lane, after the suite, inside the network lock group;
//   7. M1 (C2): the run title shows mode, slot, branch and SHA, and the job `describe` — no environment,
//      no secret, no variable, no lock — runs the summary script before `provision` (needs: describe);
//   8. M1: the summary script (.github/ci/e2e-prod-provision-summary.mjs) fails closed and never prints
//      the confirmation or an unvalidated input.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describeDispatch, main as summaryMain, confirmationFor as summaryConfirmation } from "../../.github/ci/e2e-prod-provision-summary.mjs";
import { confirmationFor as toolConfirmation } from "../../tools/e2e/provision-accounts.mjs";

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

// The text of one job (from "  <name>:" to the next job or the end).
const jobBlock = (name) => {
  const jobs = block(code, /\njobs:\n/);
  const start = jobs.indexOf(`  ${name}:\n`);
  assert.ok(start >= 0, `job ${name}`);
  const rest = jobs.slice(start + 1);
  const next = rest.search(/\n  [A-Za-z0-9_-]+:\n/);
  return next < 0 ? jobs.slice(start) : jobs.slice(start, start + 1 + next + 1);
};

test("2. two jobs: describe, then provision — main only, environment e2e-prod, shared lock, read-only token", () => {
  assert.match(code, /\npermissions:\n  contents: read\n/);
  const jobs = block(code, /\njobs:\n/);
  assert.deepEqual([...jobs.matchAll(/^  ([A-Za-z0-9_-]+):$/gm)].map((m) => m[1]), ["describe", "provision"]);
  assert.ok(jobBlock("provision").startsWith("  provision:\n    needs: describe\n    if: github.ref == 'refs/heads/main'\n"), "the job waits for describe and runs only from main");
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
  assert.deepEqual(runs, [
    "node .github/ci/e2e-prod-provision-summary.mjs",
    'node tools/e2e/provision-accounts.mjs --mode="$PROVISION_MODE" --confirm="$PROVISION_CONFIRM"',
  ]);
  // Inputs appear only in the run title (mode, slot — never confirm) and as env vars of the two steps.
  const titleLine = (code.match(/^run-name: .*$/m) ?? [""])[0];
  const exprs = [...code.replace(titleLine, "").matchAll(/\$\{\{[^}]*\binputs\.[^}]*\}\}/g)].map((m) => m[0]);
  assert.deepEqual(exprs.sort(), ["${{ inputs.confirm }}", "${{ inputs.confirm }}", "${{ inputs.mode }}", "${{ inputs.mode }}", "${{ inputs.slot }}", "${{ inputs.slot }}"]);
  for (const job of ["describe", "provision"]) {
    for (const [name, input] of [["PROVISION_MODE", "mode"], ["PROVISION_CONFIRM", "confirm"], ["E2E_SLOT", "slot"]]) {
      assert.match(jobBlock(job), new RegExp(`^          ${name}: \\$\\{\\{ inputs\\.${input} \\}\\}$`, "m"), `${job} ${name}`);
    }
  }
  assert.equal((code.match(/persist-credentials: false/g) ?? []).length, 2);
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
  const sparse = (job) => block(jobBlock(job), /\n          sparse-checkout: \|\n/).split("\n").map((l) => l.trim()).filter((l) => l !== "" && !l.includes(":"));
  const closure = [...importClosure("tools/e2e/provision-accounts.mjs")].map(decodeURIComponent).sort();
  assert.deepEqual(sparse("provision").sort(), closure);
  assert.ok(closure.includes("tests/e2e-accounts.mjs") && closure.includes(".github/ci/e2e-prod-key-check.mjs"));
  // describe checks out exactly the summary script, which imports nothing from the repository.
  assert.deepEqual(sparse("describe"), [".github/ci/e2e-prod-provision-summary.mjs"]);
  assert.deepEqual([...importClosure(".github/ci/e2e-prod-provision-summary.mjs")], [".github/ci/e2e-prod-provision-summary.mjs"]);
  assert.equal((code.match(/sparse-checkout-cone-mode: false/g) ?? []).length, 2);
});

test("7. M1: the run title and the describe job show what the approval is for, without any secret", () => {
  assert.match(code, /\nrun-name: "E2E-provisionering: \$\{\{ inputs\.mode \}\} · slot \$\{\{ inputs\.slot \}\} · \$\{\{ github\.ref_name \}\} @ \$\{\{ github\.sha \}\}"\n/);
  assert.doesNotMatch((code.match(/^run-name: .*$/m) ?? [""])[0], /confirm|secrets\.|vars\./);
  const d = jobBlock("describe");
  for (const banned of [/secrets\./, /vars\./, /environment:/, /concurrency:/, /permissions:/, /needs:/, /\bif:/, /continue-on-error/, /npm\s|npx\b|curl\b|\bgh\s/]) {
    assert.doesNotMatch(d, banned, `describe: ${banned}`);
  }
  assert.deepEqual([...d.matchAll(/^      - (?:uses|name): (.*)$/gm)].map((m) => m[1]),
    ["actions/checkout@v4", "actions/setup-node@v4", "Vis, hvad godkendelsen gælder (ingen secrets, intet netværk)"]);
  assert.match(d, /^    timeout-minutes: 5$/m);
});

test("8. M1: the summary fails closed and never prints the confirmation or an unvalidated input", () => {
  const SHA = "260d759a9df1066e2bfc8620e3990a28f0a6a8c0";
  const base = { PROVISION_MODE: "dry-run", E2E_SLOT: "0", PROVISION_CONFIRM: "", GITHUB_REF: "refs/heads/main", GITHUB_SHA: SHA };
  for (const s of ["0", "1", "2", "3"]) assert.equal(summaryConfirmation(s), toolConfirmation(Number(s)), "same confirmation as the tool");

  const dry = describeDispatch(base);
  assert.equal(dry.ok, true);
  const text = dry.lines.join("\n");
  for (const want of ["| Mode | dry-run |", "| Slot | 0 |", "| Branch | main |", `| Commit | ${SHA} |`, "| Bekræftelse | tom |", "kun læsning", "særskilt godkendelse"]) {
    assert.ok(text.includes(want), want);
  }

  const ok = describeDispatch({ ...base, PROVISION_MODE: "apply", PROVISION_CONFIRM: "provision-accounts-slot-0" });
  assert.equal(ok.ok, true);
  assert.ok(ok.lines.includes("| Bekræftelse | matcher |") && ok.lines.join("\n").includes("højst de fire markerede E2E-konti"));

  const refused = [
    [{ PROVISION_MODE: "apply" }, "apply kræver"],
    [{ PROVISION_MODE: "apply", PROVISION_CONFIRM: "provision-accounts-slot-1" }, "matcher ikke"],
    [{ PROVISION_MODE: "apply", E2E_SLOT: "2", PROVISION_CONFIRM: "provision-accounts-slot-0" }, "matcher ikke"],
    [{ PROVISION_CONFIRM: "provision-accounts-slot-0" }, "dry-run skal have tom bekræftelse"],
    [{ GITHUB_REF: "refs/heads/feature" }, "ikke startet fra branchen main"],
    [{ GITHUB_REF: "refs/pull/1/merge" }, "ikke startet fra branchen main"],
    [{ GITHUB_SHA: "260d759a" }, "commit-SHA"],
    [{ GITHUB_SHA: undefined }, "commit-SHA"],
    [{ PROVISION_MODE: "Apply" }, "mode er hverken"],
    [{ E2E_SLOT: "4" }, "slot er ikke"],
    [{ E2E_SLOT: " 0" }, "slot er ikke"],
  ];
  for (const [over, why] of refused) {
    const r = describeDispatch({ ...base, ...over });
    assert.equal(r.ok, false, why);
    assert.ok(r.problems.some((p) => p.includes(why)), why);
    assert.ok(r.lines.join("\n").includes("**Stoppet:**"), why);
  }

  // Never echoed: the confirmation (even a wrong one), and inputs that fail validation.
  const secretish = "provision-accounts-slot-0-HEMMELIG";
  const wrong = describeDispatch({ ...base, PROVISION_MODE: "apply", PROVISION_CONFIRM: secretish });
  assert.ok(!wrong.lines.join("\n").includes(secretish) && wrong.lines.includes("| Bekræftelse | forkert |"));
  const injected = describeDispatch({ ...base, PROVISION_MODE: "apply | x\n## falsk", E2E_SLOT: "0 | y" });
  const out = injected.lines.join("\n");
  assert.ok(!out.includes("falsk") && !out.includes("| x") && !out.includes("| y"));
  assert.ok(injected.lines.includes("| Mode | UGYLDIG |") && injected.lines.includes("| Slot | UGYLDIG |"));
  assert.deepEqual(describeDispatch(undefined).ok, false);

  // The CLI: exit code 1 on any problem, and the summary file gets exactly the printed lines.
  const dir = mkdtempSync(join(tmpdir(), "m1-summary-"));
  const log = console.log;
  try {
    console.log = () => {};
    const file = join(dir, "summary.md");
    assert.equal(summaryMain({ ...base, GITHUB_STEP_SUMMARY: file }), 0);
    assert.equal(readFileSync(file, "utf8"), `${dry.lines.join("\n")}\n`);
    assert.equal(summaryMain({ ...base, PROVISION_MODE: "apply" }), 1);
  } finally {
    console.log = log;
    rmSync(dir, { recursive: true, force: true });
  }
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
