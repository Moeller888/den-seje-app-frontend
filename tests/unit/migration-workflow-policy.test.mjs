// Guard for the TEMPORARY, API-only migration workflow (D-110).
//
// WHAT THIS IS: documentation protection. It pins the policy's load-bearing statements and checks
// that no package script or GitHub workflow wires a database-deploying command into automation.
//
// WHAT THIS IS NOT: an enforcement mechanism. It cannot stop a person typing `supabase db push`
// into a terminal, and it does not claim to. The database has no opinion about this file. What it
// catches is the policy being quietly weakened in review, or a forbidden command appearing where
// nobody would look for it — automation that runs without anyone watching.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const read = (...p) => readFileSync(join(ROOT, ...p), "utf8");

const POLICY = read("docs", "migration-workflow-policy.md");
const REGISTER = read("docs", "project-state.md");
const CLAUDE_MD = read("CLAUDE.md");

const D110 = REGISTER.split("\n").find((l) => l.startsWith("| **D-110**")) ?? "";
const STATUS = "MIGRATION_DIVERGENCE_ACCEPTED — NOT_RESOLVED — TEMPORARY_API_ONLY_WORKFLOW";

// The two versions applied to production with no local file of that version. If this list ever
// shrinks silently, the policy is describing a state that no longer exists.
const REMOTE_ONLY = [
  "20260823144030_docs_private_bucket",
  "20260827125327_avatar_jobs_cancelled_status",
];

// ── The decision ─────────────────────────────────────────────────────────────────────────────

test("D-110 exists and carries the exact agreed status", () => {
  assert.ok(D110, "D-110 is missing from the decision register");
  assert.ok(D110.includes(STATUS), `D-110 does not carry the agreed status:\n  expected: ${STATUS}`);
});

test("D-110 does not claim the divergence is resolved", () => {
  assert.ok(D110.includes("NOT_RESOLVED"), "the status no longer says NOT_RESOLVED");
  assert.ok(!/\bRESOLVED\b(?!_)/.test(D110.replace(/NOT_RESOLVED/g, "")),
    "D-110 claims the divergence is resolved somewhere in its body");
});

test("D-110 corrects the D-109 claim rather than rewriting D-109", () => {
  const d109 = REGISTER.split("\n").find((l) => l.startsWith("| **D-109**")) ?? "";
  assert.ok(d109, "D-109 has disappeared — the register convention is to keep it");
  assert.ok(d109.includes("neither resolved nor worsened"),
    "D-109 was edited; the correction belongs in D-110, not in D-109");
  assert.ok(/107/.test(D110) && /50/.test(D110), "D-110 does not state the measured standing");
});

// ── The policy ───────────────────────────────────────────────────────────────────────────────

test("the policy carries the same status as the decision", () => {
  assert.ok(POLICY.includes(STATUS), "the policy's status has drifted from D-110's");
});

test("every forbidden command is named in the policy", () => {
  for (const cmd of [
    "supabase db push",
    "supabase db push --include-all",
    "supabase migration up --linked",
    "supabase migration repair",
    "supabase db pull",
  ]) {
    assert.ok(POLICY.includes(cmd), `the policy no longer forbids \`${cmd}\``);
  }
  assert.match(POLICY, /schema_migrations/,
    "the policy no longer forbids editing the migration ledger by hand");
});

test("--include-all is called out as especially dangerous, with the reason", () => {
  assert.match(POLICY, /--include-all/);
  assert.match(POLICY, /especially dangerous|sharpest edge/i,
    "--include-all is listed but not flagged as the sharp edge");
  assert.match(POLICY, /already been applied under a different timestamp|already been applied/,
    "the policy does not say WHY --include-all is dangerous");
});

test("both remote-only versions are documented", () => {
  for (const v of REMOTE_ONLY) {
    assert.ok(POLICY.includes(v), `remote-only version ${v} is not documented in the policy`);
  }
  assert.ok(REMOTE_ONLY.every((v) => D110.includes(v)),
    "D-110 does not name both remote-only versions");
});

test("the policy grants no standing permission", () => {
  assert.match(POLICY, /no standing permission/i,
    "the policy must not read as blanket authorisation for future migrations");
  assert.match(POLICY, /own owner decision|separate, explicit owner authorisation/i);
});

test("the policy says the repo is not a reliable production history", () => {
  assert.match(POLICY, /cannot currently be treated as a safe, fully reproducible/i);
});

test("the long-term normalisation is recorded as NOT implemented", () => {
  assert.match(POLICY, /NOT implemented/i);
  assert.match(POLICY, /prestige\.sql/, "prestige.sql must be classified separately");
  assert.match(POLICY, /semantically/, "duplicate pairs must be compared semantically");
});

// ── The instruction an agent reads first ─────────────────────────────────────────────────────

test("CLAUDE.md no longer instructs anyone to run db push", () => {
  assert.ok(!/^Push database migrations:\s*$/m.test(CLAUDE_MD),
    "CLAUDE.md still presents `supabase db push` as the migration procedure");
  assert.match(CLAUDE_MD, /`supabase db push` is FORBIDDEN/,
    "CLAUDE.md does not state that db push is forbidden");
  assert.match(CLAUDE_MD, /migration-workflow-policy\.md/,
    "CLAUDE.md does not point at the policy");
});

// ── Automation must not deploy the database ──────────────────────────────────────────────────

const FORBIDDEN_IN_AUTOMATION = [
  /supabase\s+db\s+push/,
  /supabase\s+migration\s+up\b[^\n]*--linked/,
  /--include-all/,
  /supabase\s+migration\s+repair/,
];

test("no package.json script deploys the database", () => {
  const scripts = JSON.parse(read("package.json")).scripts ?? {};
  for (const [name, body] of Object.entries(scripts)) {
    for (const re of FORBIDDEN_IN_AUTOMATION) {
      assert.ok(!re.test(body),
        `script "${name}" runs a forbidden migration command: ${body}`);
    }
  }
});

test("no GitHub workflow deploys the database", () => {
  const dir = join(ROOT, ".github", "workflows");
  assert.ok(existsSync(dir), "the workflows directory has moved; this guard is looking in the wrong place");
  const files = readdirSync(dir).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
  assert.ok(files.length > 0, "no workflow files found — the guard would pass vacuously");

  for (const f of files) {
    // Comments are allowed to discuss the commands; only executable lines matter.
    const executable = readFileSync(join(dir, f), "utf8")
      .split("\n")
      .filter((l) => !/^\s*#/.test(l))
      .join("\n");
    for (const re of FORBIDDEN_IN_AUTOMATION) {
      assert.ok(!re.test(executable),
        `workflow ${f} contains a forbidden migration command matching ${re}`);
    }
  }
});
