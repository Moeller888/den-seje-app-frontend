// The Workers Builds deploy command: production deploys only with the read-aloud secrets in
// place, and no other branch uploads a version (an assets-only branch upload wiped them twice).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  planFor, secretNamesOf, missingSecrets, latestVersionId, deployedVersionIds,
  REQUIRED_SECRETS, WRANGLER, PRODUCTION_BRANCH,
} from "../../tools/cloudflare-deploy.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

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

test("HOSTING.md names this script as the deploy command for every branch", () => {
  const doc = readFileSync(join(REPO, "docs", "HOSTING.md"), "utf8");
  assert.match(doc, /^Deploy command:\s+node tools\/cloudflare-deploy\.mjs$/m);
  assert.match(doc, /^Non-production branch deploy command:\s+node tools\/cloudflare-deploy\.mjs$/m);
});
