// Path-aware CI classifier for the Playwright workflow (see .github/workflows/playwright.yml, D-066).
//
// Given the list of files changed by a pull request, return exactly one mode:
//   "docs"        — every changed file is under docs/**
//   "avatar-tool" — at least one file under tools/avatar/**, and every file is under
//                   tools/avatar/**, docs/** or tests/unit/**
//   "unit-only"   — at least one file under tests/unit/**, and every file is under
//                   tests/unit/** or docs/** (D-144)
//   "full"        — everything else
//
// tests/unit/** can NEVER make a runtime-affecting PR fast: it is only ever an ADDITIONAL allowed
// prefix next to docs/** and tools/avatar/**. One file anywhere else (js/**, *.html, supabase/**,
// a Playwright spec, an asset, the workflow, this classifier, …) resolves to "full". The unit
// suite itself runs in the separate `unit` job on EVERY pull request, whatever the mode.
//
// FAIL-CLOSED: any non-array / empty / malformed input, or any path not provably inside
// the docs / unit-only / avatar-tool safe sets, resolves to "full" (run the whole suite). A path
// with an empty, "." or ".." segment is malformed (e.g. "tests/unit/../../js/app.js" must not pass
// as tests/unit/**). It is always safe to over-classify as "full"; it is never safe to
// under-classify. `push` events (e.g. to main) are forced to "full" by the workflow before this
// function is consulted.
//
// Pure, deterministic, no regex (simple prefix checks only), no side effects.

import { jobSlot, slotGroup } from "./e2e-slot.mjs";

const DOCS_PREFIX = "docs/";
const AVATAR_TOOL_PREFIX = "tools/avatar/";
const UNIT_TEST_PREFIX = "tests/unit/";

export const MODES = Object.freeze({
  DOCS: "docs",
  UNIT_ONLY: "unit-only",
  AVATAR_TOOL: "avatar-tool",
  FULL: "full",
});

// The modes that skip Playwright. Everything not listed here is treated as full.
export const FAST_MODES = Object.freeze([MODES.DOCS, MODES.UNIT_ONLY, MODES.AVATAR_TOOL]);

export function isFastMode(mode) {
  return typeof mode === "string" && FAST_MODES.includes(mode);
}

// The shared Supabase lock — full-mode and every fail-closed fallback take this group so
// the full Playwright suite stays serialized with update-avatar-goldens.yml (both mutate the
// same shared test-student profile). Fast modes (docs / unit-only / avatar-tool) never touch
// Supabase and get an isolated per-run group instead, so they don't queue behind it.
export const SHARED_LOCK = "e2e-shared-supabase";

// A run id is usable for an isolated fast group only if it is a positive integer (GitHub's
// github.run_id). Anything else → null → fail closed to the shared lock. No regex.
function normaliseRunId(runId) {
  if (typeof runId === "number") {
    return Number.isInteger(runId) && runId > 0 ? String(runId) : null;
  }
  if (typeof runId === "string") {
    const t = runId.trim();
    if (t === "") return null;
    for (const c of t) if (c < "0" || c > "9") return null;
    return t.length ? t : null;
  }
  return null;
}

// Pick the GitHub Actions concurrency group for a run. FAIL-CLOSED: only a fast mode
// with a valid run id gets an isolated `ci-fast-<runId>` group; full, unknown/empty mode, or a
// missing/invalid run id all take the shared Supabase lock. A full suite can therefore never
// run under a fast group — over-locking is safe, under-locking is not.
export function concurrencyGroup(mode, runId) {
  if (!isFastMode(mode)) return SHARED_LOCK;
  const id = normaliseRunId(runId);
  if (id === null) return SHARED_LOCK;
  return "ci-fast-" + id;
}

// The ACTUAL job lock for the `test` job. This mirrors the GitHub expression in
// .github/workflows/playwright.yml exactly and is the single source of truth for the lock —
// the classify `concurrency_group` OUTPUT is kept only for logging, never trusted as authority.
// A fast group is chosen ONLY when classify SUCCEEDED and the validated mode is a fast mode,
// and it is derived from the trusted github.run_id. Every other state — classify
// failure/cancelled/skipped, missing/invalid/full mode, partial outputs — takes the shared lock.
// (Note: github.run_id is always a positive integer, so this never emits a malformed group in CI.)
// The label-verified mode never runs Playwright either, so it takes the isolated fast group too.
// Every Playwright-running state takes its E2E account slot's lock (.github/ci/e2e-slot.mjs): slot
// 1..3 only when classify succeeded and its `slot` output is exactly "1".."3"; everything else —
// including an omitted slot — is slot 0, the legacy shared lock.
export function jobLockGroup(classifyResult, mode, runId, slotOutput) {
  const ok = classifyResult === "success";
  if (ok && (isFastMode(mode) || mode === LABEL_MODE)) return "ci-fast-" + String(runId);
  return slotGroup(Number(jobSlot(classifyResult, slotOutput)));
}

// GitHub's pulls.listFiles returns AT MOST 3000 files — a change set at that size may be
// truncated, so the classification is untrustworthy. Fail closed to full at the cap.
export const MAX_CHANGED_FILES = 3000;
export function fileCountForcesFull(count) {
  return typeof count !== "number" || !Number.isFinite(count) || count >= MAX_CHANGED_FILES;
}

// Conservative cap on the base64 changed-files job output (GitHub limits job-output size).
// Fast-mode lists are tiny, so this only ever trips on a huge full-mode PR (where the list is
// unused) — fail closed to full + shared and drop the payload.
export const MAX_OUTPUT_B64_LEN = 512 * 1024;
export function outputTooLarge(b64Length) {
  return typeof b64Length !== "number" || !Number.isFinite(b64Length) || b64Length > MAX_OUTPUT_B64_LEN;
}

// Normalise a single path entry. Returns null for anything unusable (→ fail closed to full).
function normalise(p) {
  if (typeof p !== "string") return null;
  // Windows-style separators → POSIX, then trim. No regex: split/join on backslash.
  const t = p.split("\\").join("/").trim();
  if (t === "") return null;
  // Every segment must be a real name: no leading/trailing/double slash, no "." or "..".
  for (const segment of t.split("/")) {
    if (segment === "" || segment === "." || segment === "..") return null;
  }
  return t;
}

// The ONE place the safe path sets are decided. Takes already-normalised paths. Both classify()
// and validateFastPayload() go through here, so the classifier and the fast-mode payload guard
// can never allow different paths.
function modeForPaths(paths) {
  if (paths.length === 0) return MODES.FULL;

  const isDocs = (f) => f.startsWith(DOCS_PREFIX);
  const isTool = (f) => f.startsWith(AVATAR_TOOL_PREFIX);
  const isUnit = (f) => f.startsWith(UNIT_TEST_PREFIX);

  // MODE A — docs: every changed file under docs/**
  if (paths.every(isDocs)) return MODES.DOCS;

  // MODE B — avatar-tool: >=1 under tools/avatar/**, and all under tools/avatar/**, docs/** or
  // tests/unit/**
  if (paths.some(isTool) && paths.every((f) => isTool(f) || isDocs(f) || isUnit(f))) {
    return MODES.AVATAR_TOOL;
  }

  // MODE C — unit-only: >=1 under tests/unit/**, and all under tests/unit/** or docs/**
  if (paths.some(isUnit) && paths.every((f) => isUnit(f) || isDocs(f))) {
    return MODES.UNIT_ONLY;
  }

  // MODE D — full: everything else.
  return MODES.FULL;
}

// Validate the decoded changed-files payload for a FAST mode before running its checks. Returns
// { ok: true } or { ok: false, error }. Full mode does not need the list → always ok. In fast
// mode the payload must be a NON-EMPTY array of non-empty strings already in canonical form
// (exactly as GitHub reports them: forward slashes, no surrounding whitespace, no empty/./..
// segment), and the list must resolve to exactly this mode through the same modeForPaths() the
// classifier uses (nothing silently filtered). Fails closed so a fast job never runs hollow.
export function validateFastPayload(mode, files) {
  if (!isFastMode(mode)) return { ok: true };
  if (!Array.isArray(files)) return { ok: false, error: "changed-files payload is not an array" };
  if (files.length === 0) return { ok: false, error: "changed-files payload is empty" };
  for (const f of files) {
    if (typeof f !== "string" || f.trim() === "") {
      return { ok: false, error: "changed-files contains a non-string/empty entry" };
    }
    if (normalise(f) !== f) {
      return { ok: false, error: "changed-files contains a non-canonical path: " + JSON.stringify(f) };
    }
  }
  const resolved = modeForPaths(files);
  if (resolved !== mode) {
    return {
      ok: false,
      error: mode + " mode but the changed files resolve to " + resolved,
    };
  }
  return { ok: true };
}

export function classify(files) {
  // Fail closed on any non-array or empty list.
  if (!Array.isArray(files) || files.length === 0) return MODES.FULL;

  const norm = [];
  for (const f of files) {
    const n = normalise(f);
    if (n === null) return MODES.FULL; // unknown / blank / malformed entry → full
    norm.push(n);
  }

  return modeForPaths(norm);
}

// ── Maintainer label `ci:e2e-not-required` → mode "label-verified" ─────────────────────────────
// A path-only fast mode can never cover a migration or tools/question-quality/**, yet the full
// suite runs against UNCHANGED production and cannot exercise a migration that merge does not
// apply. This label lets a maintainer skip Playwright for such a PR — but only when every condition
// below provably holds. Anything unclear resolves to { ok: false } → the full suite.
//
//   1. the label is on the PR and was applied by a user whose repository role is write, maintain
//      or admin (the workflow looks the role up; any API failure → role null → refused);
//   2. every changed file is inside LABEL_SAFE_PREFIXES (no frontend, Edge Function, auth/RLS
//      config, workflow, Playwright spec or runtime file can be in the list at all);
//   3. no changed tests/fixtures/** file is referenced by a Playwright spec;
//   4. every changed migration is a top-level supabase/migrations/<digits>_<name>.sql that exists,
//      is DATA-ONLY (no DDL, privileges, policies, roles, functions, dynamic SQL or auth/storage
//      schemas — see MIGRATION_FORBIDDEN_TOKENS), and has an executable migration test: a
//      tests/unit/*-migration(s)-run.test.mjs that runs on PGlite, names the migration file exactly,
//      is not excluded from CI and contains no skip/todo;
//   5. the unit suite is green — enforced by the `test` job, which runs the whole unit suite in this
//      mode and fails if it does not pass.
// The workflow re-checks 2–4 in the `test` job against the checked-out tree.

export const SKIP_LABEL = "ci:e2e-not-required";
export const LABEL_MODE = "label-verified";
export const LABEL_SAFE_PREFIXES = Object.freeze([
  "tests/unit/",
  "tests/fixtures/",
  "tools/question-quality/",
  "docs/",
  "supabase/migrations/",
]);
export const AUTHORISED_LABEL_ROLES = Object.freeze(["admin", "maintain", "write"]);

const MIGRATION_PREFIX = "supabase/migrations/";
const FIXTURE_PREFIX = "tests/fixtures/";

// Upper-cased whole tokens that make a migration more than a data change.
export const MIGRATION_FORBIDDEN_TOKENS = Object.freeze([
  "CREATE", "ALTER", "DROP", "TRUNCATE", "RENAME",
  "GRANT", "REVOKE", "POLICY", "POLICIES", "RLS", "SECURITY", "ROLE", "OWNER", "PRIVILEGES",
  "FUNCTION", "PROCEDURE", "TRIGGER", "LANGUAGE", "EXTENSION", "EXTENSIONS",
  "EXECUTE", "COPY", "IMPORT", "LISTEN", "NOTIFY", "VACUUM", "REINDEX", "CLUSTER",
  "AUTH", "STORAGE", "VAULT", "CRON", "REALTIME", "PGSODIUM", "SUPABASE_FUNCTIONS", "NET",
]);
const FORBIDDEN_SCHEMA_PREFIXES = Object.freeze([
  "AUTH.", "STORAGE.", "VAULT.", "CRON.", "REALTIME.", "PGSODIUM.", "SUPABASE_FUNCTIONS.", "NET.", "EXTENSIONS.",
]);

export function isAuthorisedLabelRole(role) {
  return typeof role === "string" && AUTHORISED_LABEL_ROLES.includes(role);
}

function isLabelSafePath(p) {
  return LABEL_SAFE_PREFIXES.some((prefix) => p.startsWith(prefix));
}

// supabase/migrations/<digits>_<name>.sql, directly in the folder. Returns the basename or null.
function migrationBasename(p) {
  if (!p.startsWith(MIGRATION_PREFIX)) return null;
  const base = p.slice(MIGRATION_PREFIX.length);
  if (base.includes("/") || !base.endsWith(".sql")) return null;
  const us = base.indexOf("_");
  if (us < 1 || us === base.length - ".sql".length - 1) return null;
  for (const c of base.slice(0, us)) if (c < "0" || c > "9") return null;
  return base;
}

// Tokens of a SQL text: every run of [A-Za-z0-9_.] upper-cased. Only WHOLE-LINE `--` comments are
// dropped (a line whose first non-blank characters are `--`): such a line is a comment in SQL and
// PL/pgSQL alike, so dropping it can never hide code. Inline `--`, block comments and strings are NOT
// stripped — `'--'` inside a string would otherwise hide whatever follows on that line. A forbidden
// word in those places refuses the label (over-refusing is safe).
function sqlTokens(sql) {
  const code = sql.split("\r\n").join("\n").split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
  const tokens = [];
  let cur = "";
  for (const c of code) {
    const word = (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || (c >= "0" && c <= "9") || c === "_" || c === ".";
    if (word) { cur += c; continue; }
    if (cur !== "") tokens.push(cur.toUpperCase());
    cur = "";
  }
  if (cur !== "") tokens.push(cur.toUpperCase());
  return tokens;
}

export function forbiddenMigrationTokens(sql) {
  const hits = new Set();
  for (const t of sqlTokens(sql)) {
    for (const part of t.split(".")) if (MIGRATION_FORBIDDEN_TOKENS.includes(part)) hits.add(part);
    for (const prefix of FORBIDDEN_SCHEMA_PREFIXES) if (t.startsWith(prefix) || t.includes("." + prefix)) hits.add(prefix);
  }
  return [...hits].sort();
}

const UNIT_PREFIX = "tests/unit/";
function isMigrationRunTestName(name) {
  return (name.endsWith("-migration-run.test.mjs") || name.endsWith("-migrations-run.test.mjs"));
}

// Does an executable test for this migration exist? `unitTests` is [{ name, source }] for every
// file directly in tests/unit/; `ciExcluded` the basenames the CI unit run skips.
export function findMigrationRunTest(migrationBase, unitTests, ciExcluded) {
  if (!Array.isArray(unitTests) || !Array.isArray(ciExcluded)) return null;
  for (const t of unitTests) {
    if (!t || typeof t.name !== "string" || typeof t.source !== "string") continue;
    if (!isMigrationRunTestName(t.name) || ciExcluded.includes(t.name)) continue;
    const s = t.source;
    if (!s.includes("@electric-sql/pglite")) continue;
    if (!s.includes(migrationBase)) continue;
    if (s.includes(".skip(") || s.includes(".todo(") || s.includes("skip:") || s.includes("todo:")) continue;
    return UNIT_PREFIX + t.name;
  }
  return null;
}

// The whole decision. Pure: every input is passed in.
//   files        — the PR's changed paths (as GitHub reports them)
//   labelPresent — the label is currently on the PR
//   labelerRole  — repository role of the user who applied it (null if unknown)
//   readFile     — (path) => string | null   (null = missing/unreadable)
//   unitTests    — [{ name, source }] for tests/unit/*.mjs
//   ciExcluded   — basenames excluded from the CI unit run
//   specSources  — [string] the source of every Playwright spec/helper under tests/*.ts
// Returns { ok: true, mode: LABEL_MODE, reason } or { ok: false, reason }.
export function evaluateSkipLabel({ files, labelPresent, labelerRole, readFile, unitTests, ciExcluded, specSources } = {}) {
  if (labelPresent !== true) return { ok: false, reason: "label not present" };
  if (!isAuthorisedLabelRole(labelerRole)) {
    return {
      ok: false,
      reason: "label applied by a user without write/maintain/admin (role: " + JSON.stringify(labelerRole ?? null) + ")",
    };
  }
  const evidence = evaluateLabelEvidence({ files, readFile, unitTests, ciExcluded, specSources });
  if (!evidence.ok) return evidence;
  return {
    ok: true,
    mode: LABEL_MODE,
    reason: "label-verified — " + SKIP_LABEL + " by a " + labelerRole + "; " + evidence.reason,
  };
}

// Conditions 2–4 only (no label/role): used by evaluateSkipLabel and re-run by the `test` job on
// its own checkout. Returns { ok: true, reason } or { ok: false, reason }.
export function evaluateLabelEvidence({ files, readFile, unitTests, ciExcluded, specSources } = {}) {
  const no = (reason) => ({ ok: false, reason });
  if (!Array.isArray(files) || files.length === 0) return no("no changed files");
  if (fileCountForcesFull(files.length)) return no("changed-file list too large or truncated");
  if (typeof readFile !== "function" || !Array.isArray(specSources)) return no("evidence readers missing");

  const paths = [];
  for (const f of files) {
    const n = normalise(f);
    if (n === null || n !== f) return no("non-canonical path " + JSON.stringify(f));
    if (!isLabelSafePath(n)) return no("outside the label-safe set: " + n);
    paths.push(n);
  }

  for (const p of paths.filter((x) => x.startsWith(FIXTURE_PREFIX))) {
    const base = p.slice(p.lastIndexOf("/") + 1);
    for (const src of specSources) {
      if (typeof src !== "string") return no("unreadable Playwright source");
      if (src.includes(p) || src.includes(base)) return no("fixture used by a Playwright spec: " + p);
    }
  }

  const proofs = [];
  for (const p of paths.filter((x) => x.startsWith(MIGRATION_PREFIX))) {
    const base = migrationBasename(p);
    if (base === null) return no("not a top-level <digits>_<name>.sql migration: " + p);
    let sql;
    try { sql = readFile(p); } catch { sql = null; }
    if (typeof sql !== "string" || sql.trim() === "") return no("migration missing, deleted or empty: " + p);
    const bad = forbiddenMigrationTokens(sql);
    if (bad.length > 0) return no("migration is not data-only (" + bad.join(", ") + "): " + p);
    const proof = findMigrationRunTest(base, unitTests, ciExcluded);
    if (proof === null) return no("no executable PGlite migration test names " + base);
    proofs.push(base + " ← " + proof);
  }

  return {
    ok: true,
    reason: paths.length + " file(s) in the label-safe set"
      + (proofs.length ? "; migration proof: " + proofs.join("; ") : "; no migrations"),
  };
}

// Collect the evidence inputs from a checked-out tree. Used by both workflow jobs so they read the
// same things the same way. `fs`/`path` are passed in (the github-script sandbox provides them).
export function collectLabelEvidenceInputs(fs, path, root, ciExcluded) {
  const readFile = (p) => {
    const full = path.join(root, p);
    return fs.existsSync(full) ? fs.readFileSync(full, "utf8") : null;
  };
  const unitDir = path.join(root, "tests", "unit");
  const unitTests = fs.readdirSync(unitDir)
    .filter((n) => n.endsWith(".mjs"))
    .map((name) => ({ name, source: fs.readFileSync(path.join(unitDir, name), "utf8") }));
  const specSources = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "unit" && entry.name !== "fixtures") walk(full);
      } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".mjs") || entry.name.endsWith(".js")) {
        specSources.push(fs.readFileSync(full, "utf8"));
      }
    }
  };
  walk(path.join(root, "tests"));
  return { readFile, unitTests, ciExcluded: [...ciExcluded], specSources };
}

// Payload guard for the `test` job in label mode: canonical, non-empty, all label-safe.
export function validateLabelPayload(files) {
  if (!Array.isArray(files) || files.length === 0) return { ok: false, error: "changed-files payload is empty or not an array" };
  for (const f of files) {
    if (typeof f !== "string" || normalise(f) !== f) return { ok: false, error: "non-canonical path: " + JSON.stringify(f) };
    if (!isLabelSafePath(f)) return { ok: false, error: "outside the label-safe set: " + f };
  }
  return { ok: true };
}

// ── CLI: node .github/ci/classify-changes.mjs <file> [<file> ...]
//        or:  <newline-separated file list> | node .github/ci/classify-changes.mjs -
// Prints the resolved mode on a single line. Used for local verification; the workflow
// imports classify() directly via actions/github-script.
import { pathToFileURL } from "node:url";
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const emit = (files) => process.stdout.write(classify(files) + "\n");
  if (args.length === 1 && args[0] === "-") {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => emit(data.split("\n").map((l) => l.trim()).filter(Boolean)));
  } else {
    emit(args);
  }
}
