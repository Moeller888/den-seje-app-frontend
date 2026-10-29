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
// Plain content changes. "changed" (a type change, e.g. file ↔ symlink), "copied" and anything
// unknown are not treated as plain → full.
const PLAIN_STATUSES = Object.freeze(["added", "modified", "removed", "renamed"]);
const NUL = String.fromCharCode(0);
const NEWLINE = String.fromCharCode(10);

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

// files: [{ filename, status, previous_filename? }]. expectedCount: an independent count of the same
// change set. Returns { scope, reason }.
export function scopeFor({ files, expectedCount } = {}) {
  const full = (reason) => ({ scope: FULL, reason });
  if (!Array.isArray(files) || files.length === 0) return full("no file list");
  if (!Number.isInteger(expectedCount) || expectedCount !== files.length) return full("file list incomplete or count unknown");
  if (files.length >= MAX_CHANGED_FILES) return full("file list at the classifier's cap — may be truncated");
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

// The pull_request checkout is GitHub's merge commit of the PR head into the current base, so
// `HEAD^1..HEAD` is exactly what the PR changes on top of main. No token and no API: plain git on the
// checkout (fetch-depth 2). git's --name-status letters map onto the statuses above; anything else
// stays unknown and therefore full.
const GIT_STATUS = Object.freeze({ A: "added", M: "modified", D: "removed", R: "renamed", C: "copied", T: "changed" });

// `git diff --name-status -z -M` output → [{ filename, status, previous_filename? }]. Throws on any
// record it cannot read completely.
export function parseNameStatus(z) {
  const parts = String(z ?? "").split(NUL);
  if (parts.length && parts[parts.length - 1] === "") parts.pop();
  const files = [];
  for (let i = 0; i < parts.length; ) {
    const code = parts[i++];
    const letter = code.charAt(0);
    const status = GIT_STATUS[letter] ?? `unknown:${code}`;
    if (letter === "R" || letter === "C") {
      const previous_filename = parts[i++], filename = parts[i++];
      if (previous_filename === undefined || filename === undefined) throw new Error("rename/copy record without both paths");
      files.push({ filename, status, previous_filename });
    } else {
      const filename = parts[i++];
      if (filename === undefined) throw new Error("record without a path");
      files.push({ filename, status });
    }
  }
  return files;
}

// git(args) → stdout. Returns { files, expectedCount } for the PR merge commit, or throws.
function changedFiles(git, headSha) {
  const parents = git(["rev-list", "--parents", "-n", "1", "HEAD"]).trim().split(/\s+/);
  if (parents.length !== 3) throw new Error("HEAD is not the pull request's merge commit");
  if (!/^[0-9a-f]{40}$/.test(String(headSha ?? "")) || parents[2] !== headSha) throw new Error("merge commit's second parent is not the PR head");
  const files = parseNameStatus(git(["diff", "--name-status", "-z", "-M", "--no-color", "HEAD^1", "HEAD"]));
  // Independent count of the same diff, so a parsing slip can never shorten the list unnoticed.
  const expectedCount = git(["diff", "--name-only", "-z", "-M", "--no-color", "HEAD^1", "HEAD"]).split(NUL).filter((x) => x !== "").length;
  return { files, expectedCount };
}

export function planScope({ event, headSha, git }) {
  if (event !== "pull_request") return { scope: FULL, reason: `event ${event}: always full`, files: [] };
  try {
    const { files, expectedCount } = changedFiles(git, headSha);
    return { ...scopeFor({ files, expectedCount }), files };
  } catch (e) {
    return { scope: FULL, reason: "changed files unreadable: " + String(e?.message ?? e).split(NEWLINE)[0], files: [] };
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const mode = process.argv[2];
  if (mode === "plan") {
    const git = (args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const r = planScope({ event: process.env.EVENT, headSha: process.env.HEAD_SHA, git });
    const b64 = r.scope === DOCS_MD ? Buffer.from(JSON.stringify(r.files)).toString("base64") : "";
    console.log(`isolated scope: ${r.scope} — ${r.reason}`);
    if (!process.env.GITHUB_OUTPUT) { console.error("GITHUB_OUTPUT not set"); process.exit(1); }
    appendFileSync(process.env.GITHUB_OUTPUT, `scope=${r.scope}${NEWLINE}files_b64=${b64}${NEWLINE}`);
  } else if (mode === "recheck") {
    const r = recheck(process.env.FILES_B64);
    console.log(`isolated scope re-check: ${r.ok ? "docs-md confirmed" : "REFUSED"} — ${r.reason}`);
    process.exit(r.ok ? 0 : 1);
  } else {
    console.error("usage: scope.mjs plan | recheck");
    process.exit(2);
  }
}
