// Path-aware CI classifier for the Playwright workflow (see .github/workflows/playwright.yml, D-066).
//
// Given the list of files changed by a pull request, return exactly one mode:
//   "docs"        — every changed file is under docs/**
//   "avatar-tool" — at least one file under tools/avatar/**, and every file is under
//                   tools/avatar/** or docs/**
//   "full"        — everything else
//
// FAIL-CLOSED: any non-array / empty / malformed input, or any path not provably inside
// the docs / avatar-tool safe sets, resolves to "full" (run the whole suite). It is always
// safe to over-classify as "full"; it is never safe to under-classify. `push` events (e.g.
// to main) are forced to "full" by the workflow before this function is consulted.
//
// Pure, deterministic, no regex (simple prefix checks only), no side effects.

const DOCS_PREFIX = "docs/";
const AVATAR_TOOL_PREFIX = "tools/avatar/";

export const MODES = Object.freeze({ DOCS: "docs", AVATAR_TOOL: "avatar-tool", FULL: "full" });

// The shared Supabase lock — full-mode and every fail-closed fallback take this group so
// the full Playwright suite stays serialized with update-avatar-goldens.yml (both mutate the
// same shared test-student profile). Fast modes (docs / avatar-tool) never touch Supabase and
// get an isolated per-run group instead, so they don't queue behind it.
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

// Pick the GitHub Actions concurrency group for a run. FAIL-CLOSED: only docs/avatar-tool
// with a valid run id get an isolated `ci-fast-<runId>` group; full, unknown/empty mode, or a
// missing/invalid run id all take the shared Supabase lock. A full suite can therefore never
// run under a fast group — over-locking is safe, under-locking is not.
export function concurrencyGroup(mode, runId) {
  if (mode !== MODES.DOCS && mode !== MODES.AVATAR_TOOL) return SHARED_LOCK;
  const id = normaliseRunId(runId);
  if (id === null) return SHARED_LOCK;
  return "ci-fast-" + id;
}

// The ACTUAL job lock for the `test` job. This mirrors the GitHub expression in
// .github/workflows/playwright.yml exactly and is the single source of truth for the lock —
// the classify `concurrency_group` OUTPUT is kept only for logging, never trusted as authority.
// A fast group is chosen ONLY when classify SUCCEEDED and the validated mode is docs/avatar-tool,
// and it is derived from the trusted github.run_id. Every other state — classify
// failure/cancelled/skipped, missing/invalid/full mode, partial outputs — takes the shared lock.
// (Note: github.run_id is always a positive integer, so this never emits a malformed group in CI.)
export function jobLockGroup(classifyResult, mode, runId) {
  const fast =
    classifyResult === "success" &&
    (mode === MODES.DOCS || mode === MODES.AVATAR_TOOL);
  return fast ? "ci-fast-" + String(runId) : SHARED_LOCK;
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

// Validate the decoded changed-files payload for a FAST mode before running its checks. Returns
// { ok: true } or { ok: false, error }. Full mode does not need the list → always ok. In fast
// mode the payload must be a NON-EMPTY array of non-empty strings, with every path inside the
// mode's safe set (nothing silently filtered). Fails closed so a fast job never runs hollow.
export function validateFastPayload(mode, files) {
  if (mode !== MODES.DOCS && mode !== MODES.AVATAR_TOOL) return { ok: true };
  if (!Array.isArray(files)) return { ok: false, error: "changed-files payload is not an array" };
  if (files.length === 0) return { ok: false, error: "changed-files payload is empty" };
  for (const f of files) {
    if (typeof f !== "string" || f.trim() === "") {
      return { ok: false, error: "changed-files contains a non-string/empty entry" };
    }
  }
  if (mode === MODES.DOCS) {
    if (!files.every((f) => f.startsWith(DOCS_PREFIX))) {
      return { ok: false, error: "docs mode but a path is outside docs/**" };
    }
    return { ok: true };
  }
  // avatar-tool
  const hasTool = files.some((f) => f.startsWith(AVATAR_TOOL_PREFIX));
  const onlyToolOrDocs = files.every(
    (f) => f.startsWith(AVATAR_TOOL_PREFIX) || f.startsWith(DOCS_PREFIX),
  );
  if (!hasTool) return { ok: false, error: "avatar-tool mode but no tools/avatar/** path" };
  if (!onlyToolOrDocs) {
    return { ok: false, error: "avatar-tool mode but a path is outside tools/avatar/** or docs/**" };
  }
  return { ok: true };
}

// Normalise a single path entry. Returns null for anything unusable (→ fail closed to full).
function normalise(p) {
  if (typeof p !== "string") return null;
  // Windows-style separators → POSIX, then trim. No regex: split/join on backslash.
  const t = p.split("\\").join("/").trim();
  if (t === "") return null;
  return t;
}

export function classify(files) {
  // Fail closed on any non-array or empty list.
  if (!Array.isArray(files) || files.length === 0) return MODES.FULL;

  const norm = [];
  for (const f of files) {
    const n = normalise(f);
    if (n === null) return MODES.FULL; // unknown / blank entry → full
    norm.push(n);
  }

  // MODE A — docs: every changed file under docs/**
  if (norm.every((f) => f.startsWith(DOCS_PREFIX))) return MODES.DOCS;

  // MODE B — avatar-tool: >=1 under tools/avatar/**, and all under tools/avatar/** or docs/**
  const hasAvatarTool = norm.some((f) => f.startsWith(AVATAR_TOOL_PREFIX));
  const onlyToolOrDocs = norm.every(
    (f) => f.startsWith(AVATAR_TOOL_PREFIX) || f.startsWith(DOCS_PREFIX),
  );
  if (hasAvatarTool && onlyToolOrDocs) return MODES.AVATAR_TOOL;

  // MODE C — full: everything else.
  return MODES.FULL;
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
