// Guards the `e2e-prod` environment binding (fase 1A, docs/operations/e2e-prod-environment.md).
//
// What is pinned:
//   1. the ONLY jobs in any workflow that reference a production credential are playwright.yml
//      `test` and update-avatar-goldens.yml `update`, and both run in `environment: e2e-prod`;
//   2. no other job names an environment, and no workflow uses pull_request_target/workflow_run;
//   3. both jobs only run on a manual dispatch (push/pull_request never reach the environment, so
//      ordinary CI never waits for an approval);
//   4. both jobs run the e2e-prod preflight before npm ci or any Supabase call (in `test` right
//      after the dispatch guard), and vars.E2E_PROD_ENVIRONMENT is read nowhere else;
//   5. preflight() / the CLI: fail closed on a missing or wrong marker or a missing credential,
//      and never print a value;
//   6. no fallback to repository secrets (metode B): the two jobs read ONLY the environment's own
//      E2E_PROD_* secrets, each mapped exactly once to the name the programs read, every secret
//      expression in every workflow is a plain `${{ secrets.NAME }}` (no `||`, no toJSON(secrets)),
//      and no workflow references a production credential by its program name.
// The block reader is indentation-based (no YAML dependency) with its own negative controls.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  preflight, ENVIRONMENT_NAME, MARKER, REQUIRED_SECRETS, SECRET_PREFIX, SECRET_SOURCES,
} from "../../.github/ci/e2e-prod-environment.mjs";

const WF_DIR = new URL("../../.github/workflows/", import.meta.url);
const WORKFLOWS = Object.fromEntries(
  readdirSync(WF_DIR).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml")).sort()
    .map((f) => [f, readFileSync(new URL(f, WF_DIR), "utf8").replace(/\r\n/g, "\n")]),
);
const PROTECTED = [["playwright.yml", "test"], ["update-avatar-goldens.yml", "update"]];
const CLI = fileURLToPath(new URL("../../.github/ci/e2e-prod-preflight.mjs", import.meta.url));

// Jobs of a workflow: every key at two-space indentation under the top-level `jobs:` key, with its
// block up to the next such key (or the end of the file).
function jobsOf(text) {
  const start = text.indexOf("\njobs:\n");
  if (start < 0) return {};
  let body = text.slice(start + "\njobs:\n".length);
  // A top-level key after the jobs (column 0) ends the jobs section.
  const top = body.search(/\n[A-Za-z]/);
  if (top >= 0) body = body.slice(0, top + 1);
  const out = {};
  const re = /^  ([A-Za-z0-9_-]+):[ \t]*$/gm;
  const marks = [...body.matchAll(re)];
  marks.forEach((m, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].index : body.length;
    out[m[1]] = body.slice(m.index, end);
  });
  return out;
}
const stripComments = (block) => block.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
// Every secret a block names, in any expression shape: secrets.X and secrets['X'] (comments ignored).
const secretNames = (block) =>
  [...new Set([...stripComments(block).matchAll(/\bsecrets\s*(?:\.([A-Za-z0-9_]+)|\[\s*['"]([^'"]+)['"]\s*\])/g)]
    .map((m) => m[1] ?? m[2]))]
    .filter((n) => n !== "GITHUB_TOKEN").sort();
// Every `${{ … }}` expression that mentions `secrets` and is NOT exactly `${{ secrets.NAME }}` —
// a fallback (`secrets.A || secrets.B`), a default, toJSON(secrets), a bracket lookup, …
const unsafeSecretExpressions = (text) =>
  [...stripComments(text).matchAll(/\$\{\{([\s\S]*?)\}\}/g)].map((m) => m[0])
    .filter((e) => /\bsecrets\b/.test(e) && !/^\$\{\{\s*secrets\.[A-Za-z0-9_]+\s*\}\}$/.test(e));
const stepsOf = (block) => block.slice(block.indexOf("\n    steps:\n"));

test("block reader: negative controls", () => {
  const wf = "name: x\non:\n  push:\njobs:\n  a:\n    env:\n      K: ${{ secrets.S1 }}\n  b-c:\n    steps:\n    - run: x\n" +
    "other:\n  d:\n";
  const jobs = jobsOf(wf);
  assert.deepEqual(Object.keys(jobs), ["a", "b-c"]);
  assert.deepEqual(secretNames(jobs.a), ["S1"]);
  assert.ok(!jobs["b-c"].includes("other:"), "a top-level key ends the last job");
  assert.deepEqual(jobsOf("name: x\n"), {});
  assert.deepEqual(secretNames("${{ secrets.GITHUB_TOKEN }} ${{secrets.A_B}}"), ["A_B"]);
  assert.equal(stripComments("    # environment: e2e-prod\n    x: 1"), "    x: 1");
  assert.deepEqual(secretNames("x: ${{ secrets.E2E_PROD_A || secrets.A }}\ny: ${{ secrets['B'] }}\n# ${{ secrets.C }}"),
    ["A", "B", "E2E_PROD_A"]);
  assert.deepEqual(unsafeSecretExpressions("a: ${{ secrets.A }}\nb: ${{secrets.B}}\nc: ${{ vars.X || 'y' }}"), []);
  for (const bad of ["${{ secrets.E2E_PROD_A || secrets.A }}", "${{ secrets.A || 'x' }}", "${{ toJSON(secrets) }}",
    "${{ secrets['A'] }}", "${{ secrets.A && secrets.B }}", "${{ format('{0}', secrets.A) }}"]) {
    assert.deepEqual(unsafeSecretExpressions(`k: ${bad}\n`), [bad], bad);
  }
});

test("the reader sees every workflow and the protected jobs", () => {
  assert.ok(Object.keys(WORKFLOWS).length >= 5, "all workflows are read");
  for (const [file, job] of PROTECTED) {
    assert.ok(WORKFLOWS[file], `${file} exists`);
    assert.ok(jobsOf(WORKFLOWS[file])[job], `${file} has job ${job}`);
  }
});

test("only the two protected jobs reference production credentials, and both run in e2e-prod", () => {
  const holders = [];
  for (const [file, text] of Object.entries(WORKFLOWS)) {
    for (const [job, block] of Object.entries(jobsOf(text))) {
      const prod = (n) => REQUIRED_SECRETS.includes(n) || n.startsWith(SECRET_PREFIX);
      if (secretNames(block).some(prod)) holders.push(`${file}:${job}`);
    }
  }
  assert.deepEqual(holders.sort(), PROTECTED.map(([f, j]) => `${f}:${j}`).sort());
  for (const [file, job] of PROTECTED) {
    const block = stripComments(jobsOf(WORKFLOWS[file])[job]);
    assert.equal((block.match(/^    environment: e2e-prod$/gm) ?? []).length, 1, `${file}:${job} runs in e2e-prod`);
    assert.deepEqual(secretNames(block), Object.values(SECRET_SOURCES).sort(), `${file}:${job} reads exactly the E2E_PROD_* secrets`);
  }
  assert.equal(ENVIRONMENT_NAME, "e2e-prod");
});

// Metode B. GitHub resolves a secret name at the lowest level that defines it, so a MISSING
// environment secret silently falls back to a repository secret of the same name, the preflight
// says "sat" and the run is green. The environment secrets therefore carry their own E2E_PROD_*
// names (never created at repository level), and these tests make any way back to a repository
// secret fail: a direct reference, a `||` default, a second definition, toJSON(secrets).
test("the source map: every credential comes from its own E2E_PROD_* environment secret", () => {
  assert.equal(SECRET_PREFIX, "E2E_PROD_");
  assert.ok(Object.isFrozen(SECRET_SOURCES));
  assert.deepEqual(Object.keys(SECRET_SOURCES), [...REQUIRED_SECRETS]);
  for (const name of REQUIRED_SECRETS) assert.equal(SECRET_SOURCES[name], `E2E_PROD_${name}`);
  assert.ok(!Object.values(SECRET_SOURCES).includes(MARKER), "the marker is a variable, not a secret");
});

test("no fallback: each protected job maps every credential exactly once from secrets.E2E_PROD_*", () => {
  for (const [file, job] of PROTECTED) {
    const block = stripComments(jobsOf(WORKFLOWS[file])[job]);
    for (const name of REQUIRED_SECRETS) {
      const defs = block.match(new RegExp(`^\\s+${name}\\s*:.*$`, "gm")) ?? [];
      assert.equal(defs.length, 1, `${file}:${job}: ${name} is defined exactly once (no step-level override)`);
      assert.match(defs[0], new RegExp(`^      ${name}:\\s+\\$\\{\\{ secrets\\.${SECRET_SOURCES[name]} \\}\\}$`),
        `${file}:${job}: ${name} comes only from secrets.${SECRET_SOURCES[name]}, in the job env`);
    }
  }
});

test("no fallback: every secret expression in every workflow is a plain ${{ secrets.NAME }}", () => {
  const offenders = [];
  for (const [file, text] of Object.entries(WORKFLOWS)) {
    for (const e of unsafeSecretExpressions(text)) offenders.push(`${file}: ${e}`);
  }
  assert.deepEqual(offenders, []);
});

test("no workflow reads a production credential by its program name (the repository-secret names)", () => {
  const offenders = [];
  for (const [file, text] of Object.entries(WORKFLOWS)) {
    for (const n of secretNames(text)) if (REQUIRED_SECRETS.includes(n)) offenders.push(`${file}: secrets.${n}`);
  }
  assert.deepEqual(offenders, []);
});

// The one known exception (fase 1A, decided separately): adventure-engine.yml `cr01` gives the eight
// clean-room denylist secrets to pull_request runs from branches in this repository. Any other
// secret in any other job fails here, so a new credential cannot appear outside e2e-prod unnoticed.
const DENYLIST = Array.from({ length: 8 }, (_, i) => `CLEAN_ROOM_DENYLIST_0${i + 1}`);

test("outside the protected jobs, only adventure-engine.yml:cr01 holds secrets — the eight denylist parts", () => {
  const found = {};
  for (const [file, text] of Object.entries(WORKFLOWS)) {
    for (const [job, block] of Object.entries(jobsOf(text))) {
      if (PROTECTED.some(([f, j]) => f === file && j === job)) continue;
      const names = secretNames(block);
      if (names.length > 0) found[`${file}:${job}`] = names;
    }
    // Workflow-level env could hand a secret to every job: not allowed anywhere.
    const head = text.slice(0, text.indexOf("\njobs:\n"));
    assert.deepEqual(secretNames(head), [], `${file}: no secret outside a job`);
  }
  assert.deepEqual(found, { "adventure-engine.yml:cr01": [...DENYLIST].sort() });
});

test("no other job names an environment, and no workflow runs base-branch code on PR events", () => {
  for (const [file, text] of Object.entries(WORKFLOWS)) {
    const code = stripComments(text);
    assert.ok(!/\bpull_request_target\b/.test(code), `${file}: no pull_request_target`);
    assert.ok(!/^\s+workflow_run:/m.test(code), `${file}: no workflow_run`);
    for (const [job, block] of Object.entries(jobsOf(text))) {
      if (PROTECTED.some(([f, j]) => f === file && j === job)) continue;
      assert.ok(!/^\s+environment:/m.test(stripComments(block)), `${file}:${job} must not name an environment`);
    }
  }
});

test("both protected jobs run only on a manual dispatch", () => {
  const goldens = WORKFLOWS["update-avatar-goldens.yml"];
  const on = goldens.slice(goldens.indexOf("\non:\n"), goldens.indexOf("\n", goldens.indexOf("\non:\n") + 6) + 1);
  assert.equal(on, "\non:\n  workflow_dispatch:\n");
  // The `on:` block ends at the next top-level key (here: concurrency).
  const afterOn = goldens.slice(goldens.indexOf("\non:\n") + "\non:\n".length);
  const triggers = stripComments(afterOn.slice(0, afterOn.search(/\n[A-Za-z]/) + 1));
  assert.deepEqual([...triggers.matchAll(/^  ([a-z_]+):/gm)].map((m) => m[1]), ["workflow_dispatch"]);
  const testJob = jobsOf(WORKFLOWS["playwright.yml"]).test;
  assert.ok(testJob.startsWith("  test:\n    needs: classify\n    if: always() && github.event_name == 'workflow_dispatch'\n"));
});

test("the preflight runs before npm ci and any Supabase call; in `test` right after the guard", () => {
  const step = "- name: e2e-prod preflight\n";
  // playwright.yml `test`: checkout → dispatch guard → preflight → everything else.
  const t = stripComments(stepsOf(jobsOf(WORKFLOWS["playwright.yml"]).test));
  const guard = t.indexOf("- name: Manual dispatch guard\n");
  const pre = t.indexOf(step);
  assert.ok(guard > 0 && pre > guard, "preflight after the guard");
  const between = t.slice(guard, pre);
  assert.equal(between.split("\n    - ").length - 1, 0, "no step between the guard and the preflight");
  assert.ok(pre < t.indexOf("npm ci"), "preflight before npm ci");
  assert.ok(pre < t.indexOf("- uses: actions/setup-node@v4"), "preflight before setup-node");
  // update-avatar-goldens.yml `update`: checkout → preflight → everything else.
  const g = stripComments(stepsOf(jobsOf(WORKFLOWS["update-avatar-goldens.yml"]).update));
  const gpre = g.indexOf(step);
  assert.ok(gpre > 0 && gpre < g.indexOf("npm ci") && gpre < g.indexOf("setup-node"), "goldens preflight first after checkout");
  assert.equal(g.slice(0, gpre).split("\n      - ").length - 1, 1, "only checkout before the goldens preflight");
  const RUN = "run: node .github/ci/e2e-prod-preflight.mjs";
  for (const s of [t.slice(pre), g.slice(gpre)]) {
    assert.ok(s.indexOf(RUN) > 0, "the preflight step runs the CLI");
    const block = s.slice(0, s.indexOf(RUN) + RUN.length);
    assert.equal(block.split("\n").length, 4, "name, env:, the marker, run — nothing else");
    assert.ok(block.includes("E2E_PROD_ENVIRONMENT: ${{ vars.E2E_PROD_ENVIRONMENT }}"));
    assert.ok(!/\b(if|continue-on-error):/.test(block), "the preflight is unconditional and never ignored");
  }
});

test("vars.E2E_PROD_ENVIRONMENT is read only by the two preflight steps", () => {
  let count = 0;
  for (const text of Object.values(WORKFLOWS)) count += (stripComments(text).match(/vars\.E2E_PROD_ENVIRONMENT\b/g) ?? []).length;
  assert.equal(count, 2);
  assert.equal(MARKER, "E2E_PROD_ENVIRONMENT");
});

const SENTINEL = "SENTINEL-must-never-be-printed-7f3a";
const fullEnv = () => ({
  [MARKER]: ENVIRONMENT_NAME,
  ...Object.fromEntries(REQUIRED_SECRETS.map((n) => [n, `${SENTINEL}-${n}`])),
});

test("preflight(): ok only in e2e-prod with every credential set; never echoes a value", () => {
  const ok = preflight(fullEnv());
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.problems, []);
  assert.equal(ok.lines.length, REQUIRED_SECRETS.length + 1);
  for (const line of ok.lines) assert.ok(!line.includes(SENTINEL), "no value in the output");

  const cases = [
    [{ ...fullEnv(), [MARKER]: undefined }, /kører ikke i environmentet e2e-prod/],
    [{ ...fullEnv(), [MARKER]: "" }, /kører ikke i environmentet e2e-prod/],
    [{ ...fullEnv(), [MARKER]: "Production" }, /kører ikke i environmentet e2e-prod/],
    [{ ...fullEnv(), [MARKER]: "e2e-prod " }, /kører ikke i environmentet e2e-prod/],
    [{ ...fullEnv(), SUPABASE_SERVICE_ROLE_KEY: "" }, /manglende environment-secrets i e2e-prod: E2E_PROD_SUPABASE_SERVICE_ROLE_KEY$/],
    [{ ...fullEnv(), TEST_TEACHER_PASSWORD: undefined, TEST_STUDENT2_PASSWORD: undefined }, /: E2E_PROD_TEST_TEACHER_PASSWORD, E2E_PROD_TEST_STUDENT2_PASSWORD$/],
    // The preflight checks the mapped program names; E2E_PROD_* in the process env proves nothing.
    [{ [MARKER]: ENVIRONMENT_NAME, ...Object.fromEntries(Object.values(SECRET_SOURCES).map((n) => [n, SENTINEL])) }, /manglende environment-secrets/],
    [null, /kører ikke/],
    ["not an object", /kører ikke/],
  ];
  for (const [env, reason] of cases) {
    const v = preflight(env);
    assert.equal(v.ok, false, `rejected: ${JSON.stringify(env)?.slice(0, 80)}`);
    assert.ok(v.problems.some((p) => reason.test(p)), `reason ${reason} in ${JSON.stringify(v.problems)}`);
    for (const line of [...v.lines, ...v.problems]) assert.ok(!line.includes(SENTINEL));
  }
  const wrong = preflight({ ...fullEnv(), [MARKER]: `${SENTINEL}-marker` });
  assert.ok(wrong.lines.includes(`${MARKER}: forkert værdi`));
  assert.ok(ok.lines.includes("SUPABASE_SERVICE_ROLE_KEY (fra secrets.E2E_PROD_SUPABASE_SERVICE_ROLE_KEY): sat"));
  assert.deepEqual(Object.isFrozen(REQUIRED_SECRETS), true);
});

function runCli(extra) {
  // A minimal environment: never inherit this machine's own variables into the check.
  const base = { PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "" };
  return spawnSync(process.execPath, [CLI], { env: { ...base, ...extra }, encoding: "utf8" });
}

test("e2e-prod-preflight.mjs CLI: exit 0 only when complete, ::error:: otherwise, never a value", () => {
  const good = runCli(fullEnv());
  assert.equal(good.status, 0, good.stdout + good.stderr);
  assert.match(good.stdout, /e2e-prod preflight: ok/);
  assert.ok(!(good.stdout + good.stderr).includes(SENTINEL));

  const bad = runCli({ ...fullEnv(), [MARKER]: "" });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /::error::e2e-prod preflight: jobbet kører ikke i environmentet e2e-prod/);
  assert.ok(!(bad.stdout + bad.stderr).includes(SENTINEL));

  const none = runCli({});
  assert.equal(none.status, 1);
  assert.match(none.stdout, /manglende environment-secrets i e2e-prod: E2E_PROD_SUPABASE_URL, E2E_PROD_SUPABASE_ANON_KEY, E2E_PROD_SUPABASE_SERVICE_ROLE_KEY/);
});
