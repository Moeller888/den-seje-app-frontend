// Is this pull_request run still testing the PR's CURRENT head? Called by the `test` job right after
// it acquires the shared E2E lock, before anything expensive runs.
//
// Why: `test` has `if: always()` (so the required check always reports), and GitHub runs always()
// jobs even after their run is cancelled. A run queued behind the lock for a commit the PR has
// since moved past would therefore still spend ~40 lock-minutes testing code nobody will merge.
// Here such a run stops in seconds instead — and FAILS (red), so its check can never read as green.
//
// It never cancels anything and never touches another run: it only decides about ITSELF. The newer
// commit has its own run queued, which tests the code that will actually be merged.
//
// FAIL-OPEN TOWARDS TESTING: any doubt (API error, missing data, unexpected shape) → run the suite.
// Skipping is allowed only on positive evidence that the PR's head is a different commit or the PR
// is no longer open.
//
//   node .github/ci/superseded-check.mjs   (env: EVENT_NAME, PR_NUMBER, EVENT_HEAD_SHA,
//                                           GITHUB_REPOSITORY, GITHUB_TOKEN, GITHUB_OUTPUT)
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHA = /^[0-9a-f]{40}$/;

// Pure decision. `pr` is the GitHub API's pull request object (or null when it could not be read).
export function decideSuperseded({ eventName, eventHeadSha, pr }) {
  if (eventName !== "pull_request") return { superseded: false, reason: `event ${eventName || "unknown"}: not a pull request run` };
  if (typeof eventHeadSha !== "string" || !SHA.test(eventHeadSha)) return { superseded: false, reason: "event head SHA unreadable → run" };
  if (!pr || typeof pr !== "object") return { superseded: false, reason: "pull request could not be read → run" };
  const current = pr.head && typeof pr.head.sha === "string" ? pr.head.sha : null;
  if (pr.state === "closed") return { superseded: true, reason: `pull request #${pr.number} is closed${pr.merged ? " (merged)" : ""}; this commit will not be merged from this run` };
  if (pr.state !== "open") return { superseded: false, reason: `unexpected pull request state ${JSON.stringify(pr.state)} → run` };
  if (current === null || !SHA.test(current)) return { superseded: false, reason: "current head SHA unreadable → run" };
  if (current !== eventHeadSha) return { superseded: true, reason: `superseded: the pull request's head is now ${current.slice(0, 7)}, this run tests ${eventHeadSha.slice(0, 7)}` };
  return { superseded: false, reason: `current: this run tests the pull request's head ${current.slice(0, 7)}` };
}

export async function readPullRequest({ repository, number, token, fetchImpl = fetch, timeoutMs = 10000 }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository || "") || !/^[1-9]\d*$/.test(String(number || ""))) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`https://api.github.com/repos/${repository}/pulls/${number}`, {
      headers: { accept: "application/vnd.github+json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      signal: ctl.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const invoked = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invoked) {
  const env = process.env;
  const pr = env.EVENT_NAME === "pull_request"
    ? await readPullRequest({ repository: env.GITHUB_REPOSITORY, number: env.PR_NUMBER, token: env.GITHUB_TOKEN })
    : null;
  const verdict = decideSuperseded({ eventName: env.EVENT_NAME, eventHeadSha: env.EVENT_HEAD_SHA, pr });
  console.log("superseded check: " + verdict.reason);
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `superseded=${verdict.superseded ? "true" : "false"}\n`);
}
