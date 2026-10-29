// Which isolated-E2E path a pull request takes (D-110 / D-241): "docs-md" (a fast, re-validated
// pass) or "full" (the whole isolated suite). Fail-closed: "docs-md" ONLY when every changed path —
// including the old path of a rename — is Markdown under docs/, the existing classifier
// (.github/ci/classify-changes.mjs) independently says "docs", every file status is a known plain
// change, and the list is provably complete. Anything else, any doubt and any error → "full".
//
// The job `isolated-e2e (run 1)` runs on both paths, so the check reports on every pull request.
//
//   node tests/isolated/scope.mjs plan       (plan job)  → writes scope= and files_b64= to $GITHUB_OUTPUT
//   node tests/isolated/scope.mjs recheck    (fast path) → exit 1 unless files_b64 is still docs-md
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { classify, MODES, MAX_CHANGED_FILES, validateFastPayload } from "../../.github/ci/classify-changes.mjs";

export const DOCS_MD = "docs-md";
export const FULL = "full";
// GitHub's pull-request file statuses that are plain content changes. "changed" (e.g. a mode bit such
// as +x), "copied" and anything unknown are not treated as plain → full.
const PLAIN_STATUSES = Object.freeze(["added", "modified", "removed", "renamed"]);

const isDocsMarkdown = (p) => p.startsWith("docs/") && p.toLowerCase().endsWith(".md");

// Every path the PR touches: the file, and for a rename also the path it came from (a rename OUT of
// docs/ must not look like a docs change).
export function pathsOf(files) {
  const out = [];
  for (const f of files) {
    out.push(f?.filename);
    if (f?.status === "renamed") out.push(f?.previous_filename);
  }
  return out;
}

// files: GitHub's pull-request files (filename, status, previous_filename). expectedCount: the PR's
// own `changed_files`. Returns { scope, reason }.
export function scopeFor({ files, expectedCount } = {}) {
  const full = (reason) => ({ scope: FULL, reason });
  if (!Array.isArray(files) || files.length === 0) return full("no file list");
  if (!Number.isInteger(expectedCount) || expectedCount !== files.length) return full("file list incomplete or count unknown");
  if (files.length >= MAX_CHANGED_FILES) return full("file list at GitHub's cap — may be truncated");
  for (const f of files) {
    if (!f || typeof f !== "object") return full("malformed file entry");
    if (!PLAIN_STATUSES.includes(f.status)) return full(`file status ${JSON.stringify(f.status)} is not a plain change`);
    if (f.status === "renamed" && typeof f.previous_filename !== "string") return full("rename without its old path");
  }
  const paths = pathsOf(files);
  if (paths.some((p) => typeof p !== "string")) return full("malformed path");
  // The existing classifier must agree on its own terms (normalisation, malformed entries → full)…
  if (classify(paths) !== MODES.DOCS) return full("classifier: not docs-only");
  // …and the canonical-form guard it uses for fast payloads must accept the exact list.
  if (!validateFastPayload(MODES.DOCS, paths).ok) return full("classifier payload guard refused the list");
  // Stricter than the classifier: docs/ also holds .sql, .py, .json and .docx.
  if (!paths.every(isDocsMarkdown)) return full("not every path is Markdown under docs/");
  return { scope: DOCS_MD, reason: `${paths.length} Markdown path(s) under docs/ only` };
}

// The fast path re-validates the list the plan job used; a disagreement fails the job (red, never green).
export function recheck(b64) {
  let files;
  try { files = JSON.parse(Buffer.from(String(b64 ?? ""), "base64").toString("utf8")); } catch { return { ok: false, reason: "files_b64 unreadable" }; }
  const r = scopeFor({ files, expectedCount: Array.isArray(files) ? files.length : NaN });
  return r.scope === DOCS_MD ? { ok: true, reason: r.reason } : { ok: false, reason: r.reason };
}

// Read-only GitHub API calls through gh (GH_TOKEN). Any failure is thrown and becomes "full".
function fetchPr(repo, pr, gh) {
  const meta = JSON.parse(gh(["api", `repos/${repo}/pulls/${pr}`]));
  const files = [];
  for (let page = 1; page <= 31; page++) {
    const batch = JSON.parse(gh(["api", `repos/${repo}/pulls/${pr}/files?per_page=100&page=${page}`]));
    if (!Array.isArray(batch)) throw new Error("files page is not an array");
    files.push(...batch.map((f) => ({ filename: f.filename, status: f.status, previous_filename: f.previous_filename })));
    if (batch.length < 100) break;
  }
  return { files, expectedCount: meta.changed_files };
}

export function planScope({ event, repo, pr, gh }) {
  if (event !== "pull_request") return { scope: FULL, reason: `event ${event}: always full`, files: [] };
  if (!/^[\w.-]+\/[\w.-]+$/.test(String(repo ?? "")) || !/^\d+$/.test(String(pr ?? ""))) return { scope: FULL, reason: "repository or PR number missing", files: [] };
  try {
    const { files, expectedCount } = fetchPr(repo, pr, gh);
    return { ...scopeFor({ files, expectedCount }), files };
  } catch (e) {
    return { scope: FULL, reason: "GitHub API error: " + String(e?.message ?? e).split("\n")[0], files: [] };
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const mode = process.argv[2];
  if (mode === "plan") {
    const gh = (args) => execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const r = planScope({ event: process.env.EVENT, repo: process.env.REPO, pr: process.env.PR, gh });
    const b64 = r.scope === DOCS_MD ? Buffer.from(JSON.stringify(r.files)).toString("base64") : "";
    console.log(`isolated scope: ${r.scope} — ${r.reason}`);
    if (!process.env.GITHUB_OUTPUT) { console.error("GITHUB_OUTPUT not set"); process.exit(1); }
    appendFileSync(process.env.GITHUB_OUTPUT, `scope=${r.scope}\nfiles_b64=${b64}\n`);
  } else if (mode === "recheck") {
    const r = recheck(process.env.FILES_B64);
    console.log(`isolated scope re-check: ${r.ok ? "docs-md confirmed" : "REFUSED"} — ${r.reason}`);
    process.exit(r.ok ? 0 : 1);
  } else {
    console.error("usage: scope.mjs plan | recheck");
    process.exit(2);
  }
}
