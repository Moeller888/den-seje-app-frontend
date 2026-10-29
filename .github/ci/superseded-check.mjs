// Should this run still spend the shared E2E lock? Called by the `test` job right after it acquires
// the lock, before anything expensive runs. Two questions, both answered only on POSITIVE evidence:
//
//   1. SUPERSEDED — a pull_request run whose PR has since moved to a newer commit, or was closed.
//      Or a push run on main/master whose branch has since moved STRICTLY AHEAD of this commit, when
//      the newer head already has its own push run of this workflow: that run tests everything this
//      one would (it contains this commit), so only the newest main commit spends the lock.
//   2. CANCELLED  — this run was cancelled while it waited for the lock.
//
// Why here and not with `if: cancelled()`: `test` is `if: always()` (so the required check always
// reports), and GitHub runs always() jobs even after their run is cancelled. Inside such a job the
// `cancelled()` status function was measured FALSE after a queued cancel (2026-10-24, run
// 40079620782). LIMIT: the run's API record does not show it either — it stays status=pending,
// conclusion=null after a queued cancel (run 40083437376). Question 2 is therefore answered only when
// the cancel also cancelled a sibling job (within the first minutes, while the unit shards run).
//
// A stale run stops in seconds and FAILS (red), so its check can never read as green. It never
// cancels anything and never touches another run: it only decides about ITSELF. A superseded PR's
// newer commit has its own run queued.
//
// FAIL-OPEN TOWARDS TESTING: any doubt (API error, missing data, unexpected shape) → run the suite.
//
//   node .github/ci/superseded-check.mjs   (env: EVENT_NAME, PR_NUMBER, EVENT_HEAD_SHA, PUSH_REF, PUSH_SHA,
//                                           GITHUB_RUN_ID, GITHUB_REPOSITORY, GITHUB_TOKEN, GITHUB_OUTPUT)
//
// RACES (push): main may move after this check — then this run tests an older commit in full and the
// newer run decides for itself at its own lock acquisition. The newest commit is never superseded: no
// newer head exists to supersede it. A newer head WITHOUT its own push run (not created yet, or a
// [skip ci] commit) never supersedes, so no commit is left untested because of this check.
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

const MAIN_REF = /^refs\/heads\/(main|master)$/;
const REPO = /^[\w.-]+\/[\w.-]+$/;

// Pure decision about a push run on main/master. Positive evidence only: the branch head (read now)
// differs from this run's commit, GitHub's compare says the head is strictly AHEAD of this commit
// (contains it), and a push run of this same workflow exists for that head. Anything else → run.
export function decideMainSuperseded({ eventName, ref, sha, head, compare, newerRun, workflowId }) {
  if (eventName !== "push") return { superseded: false, reason: `event ${eventName || "unknown"}: not a push run` };
  if (typeof ref !== "string" || !MAIN_REF.test(ref)) return { superseded: false, reason: `push to ${ref || "unknown ref"}: not main/master → run` };
  if (typeof sha !== "string" || !SHA.test(sha)) return { superseded: false, reason: "this run's commit SHA unreadable → run" };
  if (typeof head !== "string" || !SHA.test(head)) return { superseded: false, reason: "branch head unreadable → run" };
  if (head === sha) return { superseded: false, reason: `current: this run tests the branch head ${sha.slice(0, 7)}` };
  if (!compare || typeof compare !== "object" || compare.status !== "ahead" || !(compare.ahead_by >= 1) || compare.behind_by !== 0) {
    return { superseded: false, reason: `branch head ${head.slice(0, 7)} is not strictly ahead of ${sha.slice(0, 7)} (compare: ${compare && compare.status}) → run` };
  }
  if (!Number.isInteger(workflowId) || !newerRun || typeof newerRun !== "object" || newerRun.head_sha !== head ||
      newerRun.event !== "push" || newerRun.workflow_id !== workflowId) {
    return { superseded: false, reason: `no push run of this workflow for the newer head ${head.slice(0, 7)} → run` };
  }
  return { superseded: true, reason: `superseded: ${ref.slice(11)} is now ${head.slice(0, 7)}, ${compare.ahead_by} commit(s) ahead of ${sha.slice(0, 7)}; run ${newerRun.id} tests it` };
}

export async function readBranchHead({ repository, ref, token, fetchImpl = fetch }) {
  if (!REPO.test(repository || "") || typeof ref !== "string" || !MAIN_REF.test(ref)) return null;
  const doc = await getJson(`https://api.github.com/repos/${repository}/git/ref/${ref.slice(5)}`, { token, fetchImpl });
  const sha = doc && doc.object && typeof doc.object.sha === "string" ? doc.object.sha : null;
  return sha && SHA.test(sha) ? sha : null;
}

export async function readCompare({ repository, base, head, token, fetchImpl = fetch }) {
  if (!REPO.test(repository || "") || !SHA.test(base || "") || !SHA.test(head || "")) return null;
  return getJson(`https://api.github.com/repos/${repository}/compare/${base}...${head}?per_page=1`, { token, fetchImpl });
}

// A push run of `workflowId` for `sha`, or null.
export async function readPushRun({ repository, workflowId, sha, token, fetchImpl = fetch }) {
  if (!REPO.test(repository || "") || !Number.isInteger(workflowId) || !SHA.test(sha || "")) return null;
  const doc = await getJson(`https://api.github.com/repos/${repository}/actions/workflows/${workflowId}/runs?event=push&head_sha=${sha}&per_page=5`, { token, fetchImpl });
  const runs = doc && Array.isArray(doc.workflow_runs) ? doc.workflow_runs : [];
  return runs.find((r) => r && r.head_sha === sha && r.event === "push" && r.workflow_id === workflowId) || null;
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
  const { run, jobs } = await readRun({ repository: env.GITHUB_REPOSITORY, runId: env.GITHUB_RUN_ID, token });
  let sup = decideSuperseded({ eventName: env.EVENT_NAME, eventHeadSha: env.EVENT_HEAD_SHA, pr });
  if (env.EVENT_NAME === "push") {
    const workflowId = run && Number.isInteger(run.workflow_id) ? run.workflow_id : null;
    const head = await readBranchHead({ repository: env.GITHUB_REPOSITORY, ref: env.PUSH_REF, token });
    const differs = head !== null && SHA.test(env.PUSH_SHA || "") && head !== env.PUSH_SHA;
    const compare = differs ? await readCompare({ repository: env.GITHUB_REPOSITORY, base: env.PUSH_SHA, head, token }) : null;
    const newerRun = differs && workflowId !== null ? await readPushRun({ repository: env.GITHUB_REPOSITORY, workflowId, sha: head, token }) : null;
    sup = decideMainSuperseded({ eventName: env.EVENT_NAME, ref: env.PUSH_REF, sha: env.PUSH_SHA, head, compare, newerRun, workflowId });
  }
  const can = decideCancelled({ run, jobs });
  console.log("superseded check: " + sup.reason);
  console.log("cancel check: " + can.reason);
  // Evidence for the record: what GitHub reports about this run at lock acquisition.
  console.log(`run record: status=${run?.status ?? "?"} conclusion=${run?.conclusion ?? "none"}; jobs: ` +
    (Array.isArray(jobs) ? jobs.map((j) => `${j.name}=${j.status}/${j.conclusion ?? "-"}`).join(", ") : "?"));
  const stale = sup.superseded || can.cancelled;
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `stale=${stale ? "true" : "false"}\n`);
}
