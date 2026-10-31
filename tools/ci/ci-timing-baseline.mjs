// Reproducible CI timing baseline for the Playwright workflow (queue wait, execution, steps, lock
// load, avoidable runs). Read-only: it calls the GitHub API through the `gh` CLI and reads the local
// git history; it changes nothing.
//
//   node tools/ci/ci-timing-baseline.mjs [--since YYYY-MM-DD] [--repo owner/name] [--json out.json]
//
// Definitions (the numbers in the 2026-10-23 baseline use exactly these):
//   wait      = `test` job started_at − run created_at  (lock queue + runner pickup + classify)
//   run       = `test` job completed_at − started_at
//   full run  = the `Run Playwright tests` step actually ran (success, failure or cancelled); every other
//               `test` job is a fast mode (docs / unit-only / avatar-tool / label-verified)
//   lock time = sum of `run` over full runs (only full runs hold the shared E2E lock)
//   main after fast PR = a full push-to-main run whose merge commit's second parent had a
//               successful FAST pull_request run (the PR never ran Playwright itself)
//
// Output contains run ids, branch names, durations and step names only.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const PLAYWRIGHT_STEP = "Run Playwright tests";
export const INFERRED_FULL_MIN = 10;
const T = (s) => (s ? Date.parse(s) : NaN);
const minutes = (a, b) => (b - a) / 60000;

export function pct(xs, p) {
  const s = [...xs].sort((a, b) => a - b);
  if (s.length === 0) return NaN;
  return s[Math.min(s.length - 1, Math.round(p * (s.length - 1)))];
}
export function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  if (s.length === 0) return NaN;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// runs: [{ id, event, branch, headSha, created, jobs: [{ name, conclusion, started_at, completed_at, steps: [...] }] }]
// parents: Map(mainSha → [p1, p2]) from the first-parent history of main.
export function analyze(runs, parents = new Map()) {
  const rows = [];
  for (const r of runs) {
    const test = (r.jobs ?? []).find((j) => j.name === "test");
    if (!test || !test.started_at || !test.completed_at) continue;
    const s = T(test.started_at), c = T(test.completed_at), cr = T(r.created);
    if (![s, c, cr].every(Number.isFinite)) continue;
    const pw = (test.steps ?? []).find((x) => x.name === PLAYWRIGHT_STEP);
    // A cancelled Playwright step held the lock too, for as long as it ran. The API returns NO
    // steps for a cancelled job, so a cancelled job of >= 10 min is inferred to have been in
    // Playwright (fast modes finish in about a minute; label-verified's unit suite in about six).
    const inferred = !pw && test.conclusion === "cancelled" && minutes(s, c) >= INFERRED_FULL_MIN;
    const full = inferred || (!!pw && !!pw.started_at && (pw.conclusion === "success" || pw.conclusion === "failure" || pw.conclusion === "cancelled"));
    const steps = {};
    for (const x of test.steps ?? []) {
      const a = T(x.started_at), b = T(x.completed_at);
      if (Number.isFinite(a) && Number.isFinite(b) && x.conclusion !== "skipped") steps[x.name] = minutes(a, b);
    }
    const unit = (r.jobs ?? []).find((j) => j.name === "unit");
    const unitRun = unit && unit.started_at && unit.completed_at ? minutes(T(unit.started_at), T(unit.completed_at)) : null;
    rows.push({ id: r.id, event: r.event, branch: r.branch, headSha: r.headSha, conclusion: test.conclusion,
      created: cr, start: s, end: c, wait: minutes(cr, s), run: minutes(s, c), full, inferred, steps, unitRun });
  }

  const stat = (xs) => ({ n: xs.length, median: median(xs), p90: pct(xs, 0.9), max: xs.length ? Math.max(...xs) : NaN });
  const byEvent = {};
  for (const ev of [...new Set(rows.map((x) => x.event))].sort()) {
    const sub = rows.filter((x) => x.event === ev);
    const full = sub.filter((x) => x.full);
    byEvent[ev] = {
      runs: sub.length, full: full.length,
      wait: stat(sub.map((x) => x.wait)),
      fullWait: stat(full.map((x) => x.wait)),
      // Durations only from runs that finished (a cancelled run's time says nothing about speed).
      fullRun: stat(full.filter((x) => x.conclusion !== "cancelled").map((x) => x.run)),
      fullTotal: stat(full.filter((x) => x.conclusion !== "cancelled").map((x) => x.wait + x.run)),
      conclusions: sub.reduce((o, x) => ((o[x.conclusion] = (o[x.conclusion] ?? 0) + 1), o), {}),
    };
  }

  const full = rows.filter((x) => x.full);
  const stepNames = [...new Set(full.flatMap((x) => Object.keys(x.steps)))];
  const steps = stepNames.map((name) => ({ name, ...stat(full.map((x) => x.steps[name]).filter((v) => v !== undefined)) }))
    .filter((s) => s.median >= 0.05).sort((a, b) => b.median - a.median);
  const unit = stat(rows.map((x) => x.unitRun).filter((v) => v !== null));

  const lockMin = full.reduce((s, x) => s + x.run, 0);
  const lockByEvent = {};
  for (const x of full) lockByEvent[x.event] = (lockByEvent[x.event] ?? 0) + x.run;
  const lockByDay = {};
  for (const x of full) { const d = new Date(x.start).toISOString().slice(0, 10); lockByDay[d] = (lockByDay[d] ?? 0) + x.run; }
  const span = full.length ? minutes(Math.min(...full.map((x) => x.start)), Math.max(...full.map((x) => x.end))) : 0;

  // Full main runs that followed a PR which never ran Playwright.
  const fastPrShas = new Set(rows.filter((x) => x.event === "pull_request" && !x.full && x.conclusion === "success").map((x) => x.headSha));
  const fullPrShas = new Set(rows.filter((x) => x.event === "pull_request" && x.full && x.conclusion === "success").map((x) => x.headSha));
  const mainAfterFast = full.filter((x) => {
    if (x.event !== "push") return false;
    const p = parents.get(x.headSha);
    return Array.isArray(p) && p.length === 2 && fastPrShas.has(p[1]) && !fullPrShas.has(p[1]);
  });

  // PR full runs that only got the lock after a newer run for the same branch already existed.
  const prs = rows.filter((x) => x.event === "pull_request");
  const supersededAtStart = full.filter((x) => x.event === "pull_request" && prs.some((o) => o.branch === x.branch && o.created > x.created && o.created < x.start));

  return {
    window: rows.length ? { from: new Date(Math.min(...rows.map((x) => x.created))).toISOString(), to: new Date(Math.max(...rows.map((x) => x.end))).toISOString() } : null,
    runs: rows.length, byEvent, steps, unit,
    lock: { hours: lockMin / 60, spanHours: span / 60, byEventHours: Object.fromEntries(Object.entries(lockByEvent).map(([k, v]) => [k, v / 60])), byDayHours: Object.fromEntries(Object.entries(lockByDay).sort().map(([k, v]) => [k, v / 60])) },
    mainAfterFastPr: { runs: mainAfterFast.length, hours: mainAfterFast.reduce((s, x) => s + x.run, 0) / 60, conclusions: mainAfterFast.reduce((o, x) => ((o[x.conclusion] = (o[x.conclusion] ?? 0) + 1), o), {}) },
    cancelledInLock: { runs: full.filter((x) => x.conclusion === "cancelled").length, inferred: full.filter((x) => x.inferred).length, hours: full.filter((x) => x.conclusion === "cancelled").reduce((s, x) => s + x.run, 0) / 60 },
    supersededAtStart: { runs: supersededAtStart.length, hours: supersededAtStart.reduce((s, x) => s + x.run, 0) / 60 },
    longestWaits: [...rows].sort((a, b) => b.wait - a.wait).slice(0, 10).map((x) => ({ id: x.id, event: x.event, branch: x.branch, wait: x.wait, run: x.run, full: x.full, conclusion: x.conclusion })),
  };
}

const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : "–");

export function renderMarkdown(a) {
  const L = [];
  L.push(`# CI timing baseline`, "", `Window: ${a.window?.from ?? "–"} → ${a.window?.to ?? "–"}; ${a.runs} runs with a \`test\` job.`, "");
  L.push("| event | runs | full | wait median / p90 / max (min) | full run median / p90 | full wait+run p90 / max |", "|---|---:|---:|---|---|---|");
  for (const [ev, e] of Object.entries(a.byEvent)) {
    L.push(`| ${ev} | ${e.runs} | ${e.full} | ${f1(e.wait.median)} / ${f1(e.wait.p90)} / ${f1(e.wait.max)} | ${f1(e.fullRun.median)} / ${f1(e.fullRun.p90)} | ${f1(e.fullTotal.p90)} / ${f1(e.fullTotal.max)} |`);
  }
  L.push("", `Unit job: median ${f1(a.unit.median)} min, p90 ${f1(a.unit.p90)}, max ${f1(a.unit.max)} (n=${a.unit.n}).`, "");
  L.push("| `test` step (full runs) | median min | p90 |", "|---|---:|---:|", ...a.steps.map((s) => `| ${s.name} | ${f1(s.median)} | ${f1(s.p90)} |`));
  L.push("", `Shared E2E lock busy ${f1(a.lock.hours)} h of ${f1(a.lock.spanHours)} h; by event: ${Object.entries(a.lock.byEventHours).map(([k, v]) => `${k} ${f1(v)} h`).join(", ")}.`);
  L.push(`Per day: ${Object.entries(a.lock.byDayHours).map(([k, v]) => `${k} ${f1(v)} h`).join(", ")}.`);
  L.push(`Full main runs after a PR that never ran Playwright: ${a.mainAfterFastPr.runs} (${f1(a.mainAfterFastPr.hours)} lock h; ${JSON.stringify(a.mainAfterFastPr.conclusions)}).`);
  L.push(`Cancelled while holding the lock: ${a.cancelledInLock.runs} runs (${a.cancelledInLock.inferred} inferred from duration), ${f1(a.cancelledInLock.hours)} lock h.`);
  L.push(`PR full runs already superseded when they got the lock: ${a.supersededAtStart.runs} (${f1(a.supersededAtStart.hours)} lock h).`, "");
  L.push("| longest waits: run | event | branch | wait | run | full |", "|---|---|---|---:|---:|---|", ...a.longestWaits.map((x) => `| ${x.id} | ${x.event} | ${x.branch} | ${f1(x.wait)} | ${f1(x.run)} | ${x.full ? "yes" : "no"} |`));
  return L.join("\n");
}

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
}

async function main() {
  const argv = process.argv.slice(2);
  const opt = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : dflt; };
  const since = opt("--since", new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) throw new Error("--since must be YYYY-MM-DD");
  const repo = opt("--repo", "Moeller888/den-seje-app-frontend");
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error("--repo must be owner/name");
  const out = opt("--json", null);

  const lines = gh(["api", "--paginate", `repos/${repo}/actions/workflows/playwright.yml/runs?per_page=100&created=>=${since}`,
    "-q", '.workflow_runs[] | select(.status=="completed") | [.id,.event,.head_branch,.head_sha,.created_at] | @tsv']).trim().split("\n").filter(Boolean);
  const runs = [];
  for (const l of lines) {
    const [id, event, branch, headSha, created] = l.split("\t");
    const jobs = JSON.parse(gh(["api", `repos/${repo}/actions/runs/${id}/jobs?per_page=50`])).jobs.map((j) => ({
      name: j.name, conclusion: j.conclusion, started_at: j.started_at, completed_at: j.completed_at,
      steps: (j.steps ?? []).map((s) => ({ name: s.name, conclusion: s.conclusion, started_at: s.started_at, completed_at: s.completed_at })),
    }));
    runs.push({ id: Number(id), event, branch, headSha, created, jobs });
  }
  const parents = new Map();
  try {
    for (const l of execFileSync("git", ["log", "--first-parent", "--format=%H %P", "origin/main", `--since=${since}`], { encoding: "utf8" }).trim().split("\n")) {
      const [sha, ...ps] = l.split(" ");
      if (sha) parents.set(sha, ps);
    }
  } catch (err) {
    console.error("git history unavailable (main-after-fast-PR count will be 0): " + err.message);
  }
  const a = analyze(runs, parents);
  if (out) writeFileSync(out, JSON.stringify({ since, repo, runs, analysis: a }, null, 1));
  console.log(renderMarkdown(a));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}
