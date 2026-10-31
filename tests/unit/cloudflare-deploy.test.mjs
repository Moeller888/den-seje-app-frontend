// The Workers Builds deploy command: production deploys only with the read-aloud secrets in
// place, and no other branch uploads a version (an assets-only branch upload wiped them twice).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, posix } from "node:path";
import {
  main, planFor, secretNamesOf, missingSecrets, latestVersionId, deployedVersionIds,
  REQUIRED_SECRETS, WRANGLER, PRODUCTION_BRANCH,
} from "../../tools/cloudflare-deploy.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = join(REPO, "tools", "cloudflare-deploy.mjs");

// A fake Wrangler: records every call and answers the read commands from `state`. A secret binding
// carries a `text` value here on purpose, so the tests can prove no value ever reaches the log.
const LEAK = "do-not-print-this-value";
const full = () => ({ resources: { bindings: [
  { type: "assets", name: "ASSETS" },
  ...REQUIRED_SECRETS.map((name) => ({ type: "secret_text", name, text: LEAK })),
] } });
const assetsOnly = () => ({ resources: { bindings: [{ type: "assets", name: "ASSETS" }] } });
function fakeWrangler({ latest = full(), deployed = full() } = {}) {
  const calls = [];
  const run = (args) => {
    calls.push(args.join(" "));
    if (args[0] === "versions" && args[1] === "list") {
      return [{ id: "old", metadata: { created_on: "2026-10-01T00:00:00Z" } },
        { id: "latest", metadata: { created_on: "2026-10-30T00:00:00Z" } }];
    }
    if (args[0] === "versions" && args[1] === "view") return args[2] === "latest" ? latest : deployed;
    if (args[0] === "deployments") return { versions: [{ version_id: "served", percentage: 100 }] };
    return null;
  };
  return { run, calls };
}
function captureLog(fn) {
  const lines = [];
  const orig = console.log;
  console.log = (...a) => lines.push(a.join(" "));
  try { fn(); } finally { console.log = orig; }
  return lines.join("\n");
}

test("only main deploys; every other branch validates without uploading", () => {
  assert.equal(PRODUCTION_BRANCH, "main");
  assert.equal(planFor("main"), "production");
  assert.equal(planFor("fix-mc-correct-answer-not-in-options"), "validate-only");
  assert.equal(planFor("security/claude-code-permissions"), "validate-only");
  assert.equal(planFor("main-old"), "validate-only");
});

test("a missing branch is an error, never treated as production or preview", () => {
  for (const branch of [undefined, null, "", "   "]) {
    assert.throws(() => planFor(branch), /WORKERS_CI_BRANCH/);
  }
});

test("the three read-aloud secrets are required", () => {
  assert.deepEqual([...REQUIRED_SECRETS], ["AZURE_SPEECH_KEY", "AZURE_SPEECH_REGION", "TTS_ADMIN_TOKEN"]);
});

test("secret names are read from the bindings; other bindings are ignored", () => {
  const version = { resources: { bindings: [
    { type: "assets", name: "ASSETS" },
    { type: "plain_text", name: "SUPABASE_URL" },
    { type: "secret_text", name: "TTS_ADMIN_TOKEN" },
    { type: "secret_text", name: "AZURE_SPEECH_KEY" },
    { type: "r2_bucket", name: "TTS_BUCKET" },
  ] } };
  assert.deepEqual(secretNamesOf(version), ["AZURE_SPEECH_KEY", "TTS_ADMIN_TOKEN"]);
  assert.deepEqual(missingSecrets(secretNamesOf(version)), ["AZURE_SPEECH_REGION"]);
});

test("an assets-only version (the one that wiped production) fails the check", () => {
  const assetsOnly = { resources: { bindings: [{ type: "assets", name: "ASSETS" }] } };
  assert.deepEqual(missingSecrets(secretNamesOf(assetsOnly)), [...REQUIRED_SECRETS]);
});

test("a complete version passes", () => {
  const names = ["AZURE_SPEECH_KEY", "AZURE_SPEECH_REGION", "TTS_ADMIN_TOKEN"];
  assert.deepEqual(missingSecrets(names), []);
});

test("malformed wrangler output fails loudly", () => {
  assert.throws(() => secretNamesOf(null), /bindings/);
  assert.throws(() => secretNamesOf({ resources: {} }), /bindings/);
  assert.deepEqual(missingSecrets(undefined), [...REQUIRED_SECRETS]);
  assert.throws(() => latestVersionId([]), /no versions/);
  assert.throws(() => latestVersionId(null), /no versions/);
  assert.throws(() => latestVersionId([{ id: "a" }]), /created_on/);
  assert.throws(() => deployedVersionIds({ versions: [] }), /no versions/);
  assert.throws(() => deployedVersionIds(null), /no versions/);
});

test("the latest version is chosen by creation time, not list order", () => {
  const list = [
    { id: "newest", metadata: { created_on: "2026-10-22T10:24:08.645Z" } },
    { id: "older", metadata: { created_on: "2026-10-22T10:20:09.682Z" } },
  ];
  assert.equal(latestVersionId(list), "newest");
});

test("deployed version ids come from the deployment status", () => {
  const status = { versions: [{ version_id: "v1", percentage: 100 }] };
  assert.deepEqual(deployedVersionIds(status), ["v1"]);
});

test("Wrangler stays pinned to the version the dashboard used", () => {
  assert.deepEqual(WRANGLER, ["--yes", "wrangler@4.118.0"]);
});

test("the script never prints or forwards secret values", () => {
  const src = readFileSync(join(REPO, "tools", "cloudflare-deploy.mjs"), "utf8");
  // No wrangler call touches the secret store or uploads a version; only names are ever read.
  assert.doesNotMatch(src, /wrangler\(\[\s*"secret"/);
  assert.doesNotMatch(src, /"upload"/);
  assert.doesNotMatch(src, /\.text\b|\.value\b/);
});

test("a non-main branch only runs a dry run: no version list, no upload, no deploy", () => {
  for (const branch of ["feat/x", "security/claude-code-permissions", "main-old", "Main"]) {
    const w = fakeWrangler();
    main({ WORKERS_CI_BRANCH: branch }, w.run);
    assert.deepEqual(w.calls, ["deploy --dry-run"], branch);
  }
});

test("a missing branch calls Wrangler not at all", () => {
  for (const branch of [undefined, "", "  "]) {
    const w = fakeWrangler();
    assert.throws(() => main({ WORKERS_CI_BRANCH: branch }, w.run), /WORKERS_CI_BRANCH/);
    assert.deepEqual(w.calls, []);
  }
});

test("main: a latest version without the secrets stops BEFORE deploy", () => {
  const w = fakeWrangler({ latest: assetsOnly() });
  assert.throws(() => main({ WORKERS_CI_BRANCH: "main" }, w.run), /latest .*missing secret\(s\): AZURE_SPEECH_KEY, AZURE_SPEECH_REGION, TTS_ADMIN_TOKEN/);
  assert.ok(!w.calls.includes("deploy"), "deploy must not run");
  assert.deepEqual(w.calls, ["versions list --name den-seje-app-frontend --json",
    "versions view latest --name den-seje-app-frontend --json"]);
});

test("main: a served version without the secrets fails the build after deploy", () => {
  const w = fakeWrangler({ deployed: assetsOnly() });
  assert.throws(() => main({ WORKERS_CI_BRANCH: "main" }, w.run), /deployed version served is missing secret/);
  assert.ok(w.calls.includes("deploy"));
});

test("main: Wrangler output that is not a version fails closed before deploy", () => {
  const w = fakeWrangler({ latest: null });
  assert.throws(() => main({ WORKERS_CI_BRANCH: "main" }, w.run), /bindings/);
  assert.ok(!w.calls.includes("deploy"));
});

test("main: the happy path is preflight, deploy, post-check, in that order", () => {
  const w = fakeWrangler();
  captureLog(() => main({ WORKERS_CI_BRANCH: "main" }, w.run));
  assert.deepEqual(w.calls, [
    "versions list --name den-seje-app-frontend --json",
    "versions view latest --name den-seje-app-frontend --json",
    "deploy",
    "deployments status --name den-seje-app-frontend --json",
    "versions view served --name den-seje-app-frontend --json",
  ]);
});

test("no secret value reaches the log or an error, on any path", () => {
  const ok = fakeWrangler();
  const log = captureLog(() => main({ WORKERS_CI_BRANCH: "main" }, ok.run));
  assert.doesNotMatch(log, new RegExp(LEAK));
  assert.match(log, /all 3 required secrets present/);
  const partial = { resources: { bindings: [{ type: "secret_text", name: "AZURE_SPEECH_KEY", text: LEAK }] } };
  const bad = fakeWrangler({ latest: partial });
  try { main({ WORKERS_CI_BRANCH: "main" }, bad.run); assert.fail("expected a throw"); }
  catch (e) { assert.doesNotMatch(e.message, new RegExp(LEAK)); }
});

test("CLI: without WORKERS_CI_BRANCH it exits 1 before starting Wrangler", () => {
  const env = { ...process.env };
  delete env.WORKERS_CI_BRANCH;
  env.PATH = ""; // a Wrangler start would fail differently; the branch check must come first
  const r = spawnSync(process.execPath, [SCRIPT], { env, encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /deploy failed: WORKERS_CI_BRANCH is not set/);
});

test("HOSTING.md names this script as the deploy command for every branch", () => {
  const doc = readFileSync(join(REPO, "docs", "HOSTING.md"), "utf8");
  assert.match(doc, /^Deploy command:\s+node tools\/cloudflare-deploy\.mjs$/m);
  assert.match(doc, /^Non-production branch deploy command:\s+node tools\/cloudflare-deploy\.mjs$/m);
});

test("HOSTING.md does not claim the dashboard change has already been made", () => {
  const doc = readFileSync(join(REPO, "docs", "HOSTING.md"), "utf8");
  assert.doesNotMatch(doc, /indført 2026-10-22/);
});

// Cloudflare runs the commands in docs/HOSTING.md's dashboard block on Linux, where file names are
// case-sensitive. A command pointing at a file the repository does not hold fails the build with
// "Cannot find module" before anything is checked or deployed. existsSync is case-insensitive on
// Windows, so every path segment is matched exactly against its directory listing.
function existsExactCase(relPath) {
  let dir = REPO;
  for (const part of relPath.split("/")) {
    if (!readdirSync(dir).includes(part)) return false;
    dir = join(dir, part);
  }
  return true;
}

test("every node command in the Cloudflare dashboard block names a file that exists (exact case)", () => {
  const doc = readFileSync(join(REPO, "docs", "HOSTING.md"), "utf8");
  const block = doc.split("CLOUDFLARE DASHBOARD")[1]?.split("```")[1] ?? "";
  const commands = [...block.matchAll(/^(Build command|Deploy command|Non-production branch deploy command):\s+(.+)$/gm)];
  assert.deepEqual(commands.map((m) => m[1]),
    ["Build command", "Deploy command", "Non-production branch deploy command"]);
  for (const [, label, command] of commands) {
    const node = /^node\s+(\S+)$/.exec(command.trim());
    assert.ok(node, `${label} is not a plain "node <file>" command: ${command}`);
    const file = posix.normalize(node[1]);
    assert.ok(!file.startsWith("..") && !posix.isAbsolute(file), `${label} points outside the repository: ${file}`);
    assert.ok(existsExactCase(file), `${label} names ${file}, which is not in the repository with that exact case`);
  }
});

test("the exact-case check rejects a wrong case and a missing file", () => {
  assert.equal(existsExactCase("tools/cloudflare-deploy.mjs"), true);
  assert.equal(existsExactCase("tools/Cloudflare-deploy.mjs"), false);
  assert.equal(existsExactCase("Tools/cloudflare-deploy.mjs"), false);
  assert.equal(existsExactCase("tools/cloudflare-deploy-missing.mjs"), false);
});
