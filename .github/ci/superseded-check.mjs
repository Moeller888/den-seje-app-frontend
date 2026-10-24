// Should this run still spend the shared E2E lock? Called by the `test` job right after it acquires
// the lock, before anything expensive runs. Two questions, both answered only on POSITIVE evidence:
//
//   1. SUPERSEDED — a pull_request run whose PR has since moved to a newer commit, or was closed.
//   2. CANCELLED  — this run was cancelled while it waited for the lock.
//
// Why here and not with `if: cancelled()`: `test` is `if: always()` (so the required check always
// reports), and GitHub runs always() jobs even after their run is cancelled. Inside such a job the
// `cancelled()` status function was measured FALSE after a queued cancel (2026-10-24, run
// 40079620782), so the workflow cannot see the cancel itself. The run's own API record can.
//
// A stale run stops in seconds and FAILS (red), so its check can never read as green. It never
// cancels anything and never touches another run: it only decides about ITSELF. A superseded PR's
// newer commit has its own run queued.
//
// FAIL-OPEN TOWARDS TESTING: any doubt (API error, missing data, unexpected shape) → run the suite.
//
//   node .github/ci/superseded-check.mjs   (env: EVENT_NAME, PR_NUMBER, EVENT_HEAD_SHA, GITHUB_RUN_ID,
//                                           GITHUB_REPOSITORY, GITHUB_TOKEN, GITHUB_OUTPUT)
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHA = /^[0-9a-f]{40}$/;

// Pure decision about supersession. `pr` is the API's pull request object (or null).
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

// Pure decision about cancellation, from the run's own record and its jobs. Positive evidence only:
// the run reports conclusion "cancelled", or a sibling job of THIS run was cancelled. (A sibling is
// only ever cancelled by a run cancel or its own timeout; either way this run cannot be green.)
export function decideCancelled({ run, jobs, selfJobName = "test" }) {
  if (run && typeof run === "object" && run.conclusion === "cancelled") return { cancelled: true, reason: "the run's own record says it was cancelled" };
  const list = Array.isArray(jobs) ? jobs : [];
  const sib = list.filter((j) => j && typeof j === "object" && j.name !== selfJobName && j.conclusion === "cancelled").map((j) => j.name);
  if (sib.length > 0) return { cancelled: true, reason: `sibling job(s) of this run were cancelled: ${sib.join(", ")}` };
  return { cancelled: false, reason: run ? `run status ${run.status}, conclusion ${run.conclusion ?? "none"}; no cancelled sibling` : "run record unreadable → run" };
}

export async function getJson(url, { token, fetchImpl = fetch, timeoutMs = 10000 } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
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

export async function readPullRequest({ repository, number, token, fetchImpl = fetch }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository || "") || !/^[1-9]\d*$/.test(String(number || ""))) return null;
  return getJson(`https://api.github.com/repos/${repository}/pulls/${number}`, { token, fetchImpl });
}

export async function readRun({ repository, runId, token, fetchImpl = fetch }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository || "") || !/^[1-9]\d*$/.test(String(runId || ""))) return { run: null, jobs: null };
  const base = `https://api.github.com/repos/${repository}/actions/runs/${runId}`;
  const run = await getJson(base, { token, fetchImpl });
  const jobsDoc = await getJson(`${base}/jobs?per_page=100`, { token, fetchImpl });
  return { run, jobs: jobsDoc && Array.isArray(jobsDoc.jobs) ? jobsDoc.jobs : null };
}

const invoked = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invoked) {
  const env = process.env;
  const token = env.GITHUB_TOKEN;
  const pr = env.EVENT_NAME === "pull_request"
    ? await readPullRequest({ repository: env.GITHUB_REPOSITORY, number: env.PR_NUMBER, token })
    : null;
  const sup = decideSuperseded({ eventName: env.EVENT_NAME, eventHeadSha: env.EVENT_HEAD_SHA, pr });
  const { run, jobs } = await readRun({ repository: env.GITHUB_REPOSITORY, runId: env.GITHUB_RUN_ID, token });
  const can = decideCancelled({ run, jobs });
  console.log("superseded check: " + sup.reason);
  console.log("cancel check: " + can.reason);
  // Evidence for the record: what GitHub reports about this run at lock acquisition.
  console.log(`run record: status=${run?.status ?? "?"} conclusion=${run?.conclusion ?? "none"}; jobs: ` +
    (Array.isArray(jobs) ? jobs.map((j) => `${j.name}=${j.status}/${j.conclusion ?? "-"}`).join(", ") : "?"));
  const stale = sup.superseded || can.cancelled;
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `stale=${stale ? "true" : "false"}\n`);
}
