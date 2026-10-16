// Claude Code permission guard (offline: settings files and git only — no network, no Claude Code).
//
// The repository used to track `.claude/settings.local.json`, a personal file that had grown to 800+
// allow rules: `git *`, `rm *`, `node *`, `npm run *`, `npx supabase *`, `supabase db *` and the
// Supabase migration / deploy MCP tools all ran without a prompt, and one rule held a literal API key.
// The shared model now lives in the tracked `.claude/settings.json` (allow = read-only + known test
// entrypoints, ask = legitimate mutations, deny = destructive git, D-110 Supabase flows, recursive
// deletion, secret files). These tests keep the old shape from coming back:
//   1. settings.local.json is untracked and ignored;
//   2. the tracked settings parse, hold no secret literal and no personal absolute path;
//   3. no allow rule is broad (a wildcard mid-pattern, a wildcard on a dangerous command prefix, or a
//      mutating Supabase MCP tool);
//   4. the D-110 / Edge gates are ASK and the destructive core is DENY.
// Every detector has a NEGATIVE CONTROL built at runtime. Findings name the rule or the kind of
// secret, never a matched value.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHARED = ".claude/settings.json";
const LOCAL = ".claude/settings.local.json";

const git = (...args) => spawnSync("git", args, { cwd: REPO, encoding: "utf8" });

function loadShared() {
  const raw = readFileSync(join(REPO, SHARED), "utf8");
  const doc = JSON.parse(raw);
  assert.equal(typeof doc, "object", `${SHARED} must be a JSON object`);
  assert.ok(doc !== null && !Array.isArray(doc), `${SHARED} must be a JSON object`);
  const perms = doc.permissions;
  assert.ok(perms && typeof perms === "object", `${SHARED} must have a permissions object`);
  for (const kind of ["allow", "ask", "deny"]) {
    assert.ok(Array.isArray(perms[kind]), `permissions.${kind} must be an array`);
    for (const rule of perms[kind]) assert.equal(typeof rule, "string", `permissions.${kind} holds a non-string`);
  }
  return { doc, perms };
}

function allStrings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) allStrings(v, out);
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) { out.push(k); allStrings(v, out); }
  return out;
}

// ── detectors ───────────────────────────────────────────────────────────────────────────────────

const SECRET_SHAPES = [
  ["OpenAI/Anthropic-style key", /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{16,}/],
  ["JWT", /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ["Supabase secret key", /\bsb_secret_[A-Za-z0-9_-]{10,}/],
  ["Supabase personal access token", /\bsbp_[A-Za-z0-9]{20,}/],
  ["GitHub token", /\b(?:ghp|gho|ghs|ghu|github_pat)_[A-Za-z0-9_]{20,}/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["private key block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["credential assignment", /\b[A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASS)\s*=\s*["']?(?!\$)[^\s"'$)]{8,}/],
];
const secretFindings = (strings) =>
  strings.flatMap((s) => SECRET_SHAPES.filter(([, re]) => re.test(s)).map(([kind]) => kind));

const PERSONAL_PATH = /(?:^|[^A-Za-z])[A-Za-z]:[\\/]|\/(?:c|d)\/Users\/|\/Users\/[^/]+\/|\/home\/[^/]+\//i;

// A wildcard allow rule is broad when its fixed prefix is a whole dangerous command family.
const BROAD_PREFIXES = new Set([
  "", "git", "git push", "git checkout", "git switch", "git worktree", "git reset", "git clean",
  "git restore", "git branch", "git rebase", "git stash", "git config", "rm", "rmdir", "mv", "cp",
  "node", "npx", "npx supabase", "npm", "npm run", "npm install", "npm exec", "supabase",
  "supabase db", "supabase migration", "supabase functions", "supabase secrets", "gh", "gh pr",
  "gh run", "gh workflow", "gh api", "gh repo", "gh secret", "pip", "pip install", "winget",
  "remove-item", "move-item", "copy-item", "rename-item", "set-content", "add-content", "new-item",
  "out-file", "start-process", "invoke-item", "invoke-expression", "stop-process",
]);
const INTERPRETERS = /^(?:node|python3?|py|deno run|deno eval|bash|sh|zsh|cmd|cmd\.exe|powershell|pwsh|wsl)(?:\s|$)/i;
const MUTATING_MCP = /(?:apply_migration|execute_sql|deploy_edge_function|create_edge_function_secret|create_branch|delete_branch|merge_branch|rebase_branch|reset_branch|create_project|pause_project|restore_project)$/;

function broadAllowFindings(allow) {
  const found = [];
  for (const rule of allow) {
    if (/^mcp__/.test(rule)) {
      if (rule.includes("*")) found.push(`${rule}: wildcard MCP rule`);
      if (MUTATING_MCP.test(rule)) found.push(`${rule}: mutating MCP tool without a prompt`);
      continue;
    }
    if (rule === "Bash" || rule === "PowerShell") { found.push(`${rule}: whole tool`); continue; }
    const m = /^(Bash|PowerShell)\((.*)\)$/s.exec(rule);
    if (!m) continue;
    const spec = m[2].endsWith(":*") ? m[2].slice(0, -2) + " *" : m[2];
    const star = spec.indexOf("*");
    if (star === -1) continue;
    if (star !== spec.length - 1) { found.push(`${rule}: wildcard before the rest of the command`); continue; }
    const prefix = spec.slice(0, star).trim().toLowerCase();
    if (BROAD_PREFIXES.has(prefix)) found.push(`${rule}: wildcard over a whole command family`);
    else if (INTERPRETERS.test(prefix)) found.push(`${rule}: wildcard over an interpreter`);
  }
  return found;
}

// ── 1. the personal file stays personal ─────────────────────────────────────────────────────────

test(`${LOCAL} is not tracked`, () => {
  const out = execFileSync("git", ["ls-files", "--", LOCAL], { cwd: REPO, encoding: "utf8" });
  assert.equal(out.trim(), "", `${LOCAL} is tracked again — it is personal and must stay local`);
});

test(`${LOCAL} and local Claude backups are gitignored`, () => {
  for (const path of [LOCAL, ".claude/settings.local.json.bak-anything"]) {
    const res = git("check-ignore", "-q", "--no-index", path);
    assert.equal(res.status, 0, `${path} is not ignored by .gitignore`);
  }
  assert.notEqual(git("check-ignore", "-q", "--no-index", SHARED).status, 0, `${SHARED} must NOT be ignored`);
});

// ── 2. the shared file is clean ─────────────────────────────────────────────────────────────────

test(`${SHARED} exists and parses`, () => {
  assert.ok(existsSync(join(REPO, SHARED)), `${SHARED} is missing`);
  loadShared();
});

test(`${SHARED} holds no secret literal`, () => {
  const { doc } = loadShared();
  assert.deepEqual(secretFindings(allStrings(doc)), [], `${SHARED} holds a secret-shaped literal`);
});

test("secret detector fires on the shapes it guards (negative control)", () => {
  const fake = ["sk", "proj", "x".repeat(24)].join("-");
  assert.ok(secretFindings([`Bash(export OPENAI_API_KEY="${fake}")`]).length > 0);
  assert.ok(secretFindings([["gh", "p_", "a".repeat(30)].join("")]).length > 0);
  assert.ok(secretFindings([`SUPABASE_SERVICE_ROLE_KEY=${"z".repeat(20)}`]).length > 0);
  assert.deepEqual(secretFindings(["Bash(npm run test:unit)", "Read(./.env)", "Bash(echo $OPENAI_API_KEY)"]), []);
});

test(`${SHARED} holds no personal absolute path`, () => {
  const { doc } = loadShared();
  const hits = allStrings(doc).filter((s) => !s.startsWith("https://") && PERSONAL_PATH.test(s));
  assert.deepEqual(hits, [], "personal absolute paths belong in settings.local.json");
  assert.ok(PERSONAL_PATH.test("Read(//c/Users/someone/x)") && PERSONAL_PATH.test("C:\\Users\\x"));
});

// ── 3. no broad allow rule ──────────────────────────────────────────────────────────────────────

test(`${SHARED} allow list has no broad rule`, () => {
  const { perms } = loadShared();
  assert.deepEqual(broadAllowFindings(perms.allow), []);
});

test("broad-allow detector fires on the old rules (negative control)", () => {
  const old = ["Bash(git *)", "PowerShell(git *)", "Bash(rm *)", "Bash(node *)", "Bash(npx supabase *)",
    "PowerShell(supabase db *)", "Bash(supabase functions:*)", "Bash(npm run *)", "PowerShell(gh *)",
    "PowerShell(Remove-Item *)", "Bash(node -e ' *)", "Bash(grep -nE 'a.*b' file)",
    "mcp__plugin_supabase_supabase__apply_migration", "mcp__plugin_supabase_supabase__execute_sql"];
  for (const rule of old) assert.equal(broadAllowFindings([rule]).length, 1, `${rule} was not flagged`);
  assert.deepEqual(broadAllowFindings(["Bash(git status *)", "Bash(npm run test:unit)",
    "PowerShell(git add -- *)", "mcp__plugin_supabase_supabase__list_tables"]), []);
});

// ── 4. the gates exist ──────────────────────────────────────────────────────────────────────────

test("D-110 / Edge tools are ASK, never allow", () => {
  const { perms } = loadShared();
  for (const tool of ["apply_migration", "execute_sql", "deploy_edge_function"]) {
    const name = `mcp__plugin_supabase_supabase__${tool}`;
    assert.ok(perms.ask.includes(name), `${name} must be ASK`);
    assert.ok(!perms.allow.includes(name), `${name} must not be allowed`);
  }
  for (const sh of ["Bash", "PowerShell"]) {
    assert.ok(perms.ask.includes(`${sh}(supabase functions deploy*)`), `${sh} Edge deploy must be ASK`);
    assert.ok(perms.ask.some((r) => r.startsWith(`${sh}(git push`)), `${sh} git push must be ASK`);
    assert.ok(perms.ask.includes(`${sh}(gh pr merge *)`), `${sh} gh pr merge must be ASK`);
  }
});

test("destructive core is DENY in both shells", () => {
  const { perms } = loadShared();
  const required = ["git reset --hard*", "git clean*", "git push *--force*", "git push -f*",
    "git branch -D*", "git checkout -- .", "git restore .", "git worktree remove *--force*",
    "gh repo delete*", "gh pr merge *--admin*", "gh pr merge *--delete-branch*",
    "supabase db push*", "npx supabase db push*", "supabase migration repair*",
    "supabase migration up*", "supabase db pull*", "supabase db reset*", "rm -rf *"];
  for (const sh of ["Bash", "PowerShell"]) {
    for (const spec of required) assert.ok(perms.deny.includes(`${sh}(${spec})`), `${sh}(${spec}) must be DENY`);
  }
  assert.ok(perms.deny.includes("PowerShell(Remove-Item * -r*)"), "Remove-Item -Recurse must be DENY");
  assert.ok(perms.deny.includes("Read(./.env)"), ".env reads must be DENY");
  assert.ok(!perms.deny.some((r) => r.includes(".env.example")), ".env.example is public and must stay readable");
});

test("no rule ends in a legacy `:*` where a literal colon was meant", () => {
  // `X :*` is Claude Code's legacy prefix syntax, so `git push * :*` would have denied EVERY push.
  const { perms } = loadShared();
  const hits = [...perms.allow, ...perms.ask, ...perms.deny].filter((r) => / :\*\)$/.test(r));
  assert.deepEqual(hits, []);
});
