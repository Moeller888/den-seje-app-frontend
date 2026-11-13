#!/usr/bin/env node
// CI-triage: et kort dansk resumé af én GitHub Actions-kørsel — job for job, med fejltype, dokumenteret
// årsag (den loglinje, klassifikationen bygger på), mulig næste handling og om den kræver ejerens GO.
// Dokumentation: docs/operations/ci-triage.md.
//
//   node tools/ci/run-triage.mjs <run-id> [--repo owner/name]     (læser via gh; ændrer intet)
//   node tools/ci/run-triage.mjs --run-json run.json --log <jobnavn>=<fil> …   (offline, til tests)
//
// Reglerne er bevidst snævre: en kategori sættes kun på en konkret, genkendt loglinje fra projektets egne
// workflows (INFRA-INSTALL, INFRA-CACHE, browser-launch-check, Playwrights opsummering, node --test). Alt
// andet er UKENDT — hellere ukendt end en forkert diagnose. Værktøjet genkører aldrig noget.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CATEGORY = Object.freeze({
  OK: "OK",
  FLAKY: "OK-MED-FLAKY",
  SKIPPED: "SPRUNGET-OVER",
  SUPERSEDED: "CANCELLED-SUPERSEDED",
  TIMEOUT: "CANCELLED-TIMEOUT",
  CANCELLED: "CANCELLED-UKENDT",
  INFRA_RUNNER: "INFRA-RUNNER",
  INFRA_INSTALL: "INFRA-INSTALL",
  INFRA_BROWSER: "INFRA-BROWSER",
  INFRA_ARTIFACT: "INFRA-ARTIFACT",
  TEST_FAILURE: "TEST-FAILURE",
  UNKNOWN: "UKENDT",
});

// Hvad næste skridt er, og hvem der skal godkende det. "Genkør" står aldrig uden et GO (D4).
const ADVICE = {
  [CATEGORY.OK]: ["ingen", "nej"],
  [CATEGORY.FLAKY]: ["notér testen som overvågningskandidat; slet eller spring den aldrig over", "nej"],
  [CATEGORY.SKIPPED]: ["kontrollér at springet er tilsigtet (sprunget over er ikke bestået)", "nej"],
  [CATEGORY.SUPERSEDED]: ["intet: den nyere kørsel på samme branch er den, der gælder", "nej"],
  [CATEGORY.TIMEOUT]: ["læs hvilket trin der stoppede; ved installationstrinnet: INFRA (net/spejl)", "genkørsel kræver GO"],
  [CATEGORY.CANCELLED]: ["find ud af hvem/hvad der annullerede (manuel, kø, lås)", "genkørsel kræver GO"],
  [CATEGORY.INFRA_RUNNER]: ["lås jobbet til en understøttet runner (fx ubuntu-24.04)", "kodeændring + merge kræver GO"],
  [CATEGORY.INFRA_INSTALL]: ["Ubuntu-spejl/DNS/net: vent og genkør, eller undersøg cache-vejen", "genkørsel kræver GO"],
  [CATEGORY.INFRA_BROWSER]: ["browser kan ikke starte: tjek systempakker/image; ingen test kørte", "genkørsel kræver GO"],
  [CATEGORY.INFRA_ARTIFACT]: ["GitHubs artefakttjeneste: testene er dog afgjort i loggen ovenfor", "genkørsel kræver GO"],
  [CATEGORY.TEST_FAILURE]: ["læs den fejlede test: produktregression eller testfejl afgøres af en agent/et menneske, aldrig af værktøjet", "rettelse kræver GO"],
  [CATEGORY.UNKNOWN]: ["læs loggen manuelt; ingen genkendt årsag", "afklaring"],
};

const TS = /^\uFEFF?\d{4}-\d\d-\d\dT[\d:.]+Z /;
// GitHub skriver hvert trins script ud f\u00F8r det k\u00F8rer, farvet cyan (ESC[36;1m). De linjer er KILDEKODE, ikke
// h\u00E6ndelser: `echo "::error title=INFRA-INSTALL::\u2026"` st\u00E5r i hver k\u00F8rsels log, ogs\u00E5 n\u00E5r intet fejlede
// (k\u00F8rsel 43089224884 fejlede i upload, ikke i installationen). De fjernes, f\u00F8r der klassificeres.
const SCRIPT_ECHO = /^\x1b\[36;1m/;
function logLines(text) {
  return text.split(/\r?\n/)
    .map((l) => l.replace(TS, ""))
    .filter((l) => !SCRIPT_ECHO.test(l))
    .map((l) => l.replace(/\x1b\[[0-9;]*m/g, ""));
}

function first(lines, re) {
  for (const l of lines) if (re.test(l)) return l.trim();
  return null;
}

// Fakta om installationen og testene, uanset om jobbet bestod — så en grøn kørsel også viser HVAD den dækkede.
export function facts(logText = "") {
  const lines = logLines(logText);
  const f = {};
  const image = first(lines, /^Image: /);
  if (image) f.image = image.slice(7);
  const hit = first(lines, /^Cache hit for: /);
  const miss = first(lines, /^Cache not found for input keys: /);
  if (hit) f.cache = "hit"; else if (miss) f.cache = "miss";
  const path = first(lines, /playwright install: system packages from the (cache|mirrors)/);
  if (path) f.installPath = path.endsWith("cache") ? "cache" : "spejle";
  f.mirrorFetches = lines.filter((l) => /^(Get|Hit|Ign):\d+ https?:\/\/\S*ubuntu\.com/.test(l)).length;
  f.launched = lines.filter((l) => /^browser-launch-check: \S+ .* launched$/.test(l)).map((l) => l.split(" ")[1]);
  const timing = first(lines, /^playwright timing: .*tests \d+ \(expected \d+, flaky \d+, unexpected \d+, skipped \d+\)/);
  if (timing) {
    const m = timing.match(/expected (\d+), flaky (\d+), unexpected (\d+), skipped (\d+)/);
    f.suite = { expected: +m[1], flaky: +m[2], unexpected: +m[3], skipped: +m[4] };
  }
  const passed = lines.filter((l) => /^\s*\d+ passed \(/.test(l)).map((l) => +l.trim().split(" ")[0]);
  const skipped = lines.filter((l) => /^\s*\d+ skipped$/.test(l)).map((l) => +l.trim().split(" ")[0]);
  if (passed.length) f.playwrightPassed = passed;
  if (skipped.length) f.playwrightSkipped = skipped;
  f.flakyTests = lines.filter((l) => /\] \S+\.spec\.\w+:\d+ flaky after \d+ attempt/.test(l)).map((l) => l.trim());
  const nodeFail = lines.map((l) => l.match(/^ℹ fail (\d+)$/)).filter(Boolean).reduce((s, m) => s + +m[1], 0);
  const nodePass = lines.map((l) => l.match(/^ℹ pass (\d+)$/)).filter(Boolean).reduce((s, m) => s + +m[1], 0);
  if (nodePass || nodeFail) f.nodeTest = { pass: nodePass, fail: nodeFail };
  const k1 = first(lines, /^replay profile \S+: K1 columns on question_attempts = \d+$/);
  if (k1) f.k1Columns = k1;
  return f;
}

// Klassificér ét job. `newerRunAt` = createdAt for en nyere kørsel af samme workflow på samme branch (hvis nogen).
export function classifyJob(job, logText = "", { newerRunAt = null } = {}) {
  const lines = logLines(logText);
  const f = facts(logText);
  const out = (category, evidence) => ({ name: job.name, conclusion: job.conclusion, category, evidence, facts: f });

  if (job.conclusion === "skipped") return out(CATEGORY.SKIPPED, null);
  if (job.conclusion === "success") {
    if (f.suite?.flaky > 0 || f.flakyTests.length) return out(CATEGORY.FLAKY, f.flakyTests.join(" | ") || `flaky ${f.suite.flaky}`);
    return out(CATEGORY.OK, null);
  }

  const timedOut = first(lines, /has timed out after \d+ minutes|exceeded the maximum execution time/);
  if (job.conclusion === "cancelled" || timedOut) {
    if (timedOut) {
      const installStep = (job.steps ?? []).find((s) => s.conclusion === "cancelled" || s.conclusion === "failure");
      const inInstall = installStep && /install playwright/i.test(installStep.name);
      return out(inInstall ? CATEGORY.INFRA_INSTALL : CATEGORY.TIMEOUT,
        inInstall ? `trin-timeout i "${installStep.name}": ${timedOut}` : timedOut);
    }
    if (newerRunAt && job.completedAt && Date.parse(newerRunAt) <= Date.parse(job.completedAt)) {
      return out(CATEGORY.SUPERSEDED, `nyere kørsel startet ${newerRunAt}, jobbet stoppet ${job.completedAt}`);
    }
    return out(CATEGORY.CANCELLED, null);
  }

  // failure — mest specifikke, projekt-egne markører først.
  const runner = first(lines, /Playwright does not support \S+ on \S+/);
  if (runner) return out(CATEGORY.INFRA_RUNNER, runner);
  const launch = first(lines, /^browser-launch-check: \S+ cannot launch/);
  const install = first(lines, /INFRA-INSTALL|failed or ran past \d+ min \(Ubuntu mirror|dpkg could not finish the interrupted cache install|a browser cannot start after the mirror install/);
  if (launch && !install) return out(CATEGORY.INFRA_BROWSER, launch);
  if (install) return out(CATEGORY.INFRA_INSTALL, launch ? `${install} — ${launch}` : install);
  if (f.suite?.unexpected > 0) return out(CATEGORY.TEST_FAILURE, `unexpected ${f.suite.unexpected} (expected ${f.suite.expected})`);
  const pwFailed = first(lines, /^\s*\d+ failed$/);
  if (pwFailed) return out(CATEGORY.TEST_FAILURE, `Playwright: ${pwFailed.trim()} failed`);
  if (f.nodeTest?.fail > 0) return out(CATEGORY.TEST_FAILURE, `node --test: ${f.nodeTest.fail} fejlet`);
  const failedStep = (job.steps ?? []).find((s) => s.conclusion === "failure");
  const artifact = first(lines, /Failed to CreateArtifact|Failed to make request after \d+ attempts/);
  if (artifact && failedStep && /upload/i.test(failedStep.name)) return out(CATEGORY.INFRA_ARTIFACT, artifact);
  return out(CATEGORY.UNKNOWN, failedStep ? `fejlet trin: "${failedStep.name}"` : null);
}

// Dækning: en grøn kørsel beviser kun, at de JOBS der kørte bestod. Her står, hvad der faktisk blev kørt.
export function coverage(jobs, results) {
  const notes = [];
  for (const j of jobs) {
    if (j.conclusion === "skipped") notes.push(`${j.name}: sprunget over — tæller ikke som bestået`);
  }
  for (const r of results) {
    if (r.facts.cache === "hit" && r.facts.installPath === "spejle") {
      notes.push(`${r.name}: cache-hit, men systempakkerne kom fra spejlene (fallback) — cache-vejen FEJLEDE i denne kørsel, uanset jobbets resultat`);
    } else if (r.facts.installPath === "spejle") {
      notes.push(`${r.name}: installeret fra spejlene (cache-miss) — cache-vejen er ikke afprøvet i denne kørsel`);
    }
    if (/^isolated-e2e \(run /.test(r.name) && r.conclusion === "success") {
      if (!r.facts.playwrightPassed) notes.push(`${r.name}: grøn, men ingen Playwright-opsummering i loggen — dækningen er ikke dokumenteret`);
      if (r.facts.launched.length && r.facts.launched.length < 3) notes.push(`${r.name}: kun ${r.facts.launched.join(", ")} startet`);
    }
  }
  return notes;
}

const cell = (s) => String(s ?? "—").replaceAll("|", "\\|").replaceAll("\n", " ");

export function report(run, results, { newerRun = null } = {}) {
  const lines = [
    `## CI-resumé: ${run.workflowName} · kørsel ${run.databaseId}`,
    "",
    `- **Branch/PR:** ${run.headBranch ?? "—"}${run.prNumber ? ` (#${run.prNumber})` : ""} · **event:** ${run.event ?? "—"}`,
    `- **HEAD:** ${run.headSha ?? "—"}`,
    `- **Resultat:** ${run.status ?? "—"} / ${run.conclusion || "—"}${newerRun ? ` · nyere kørsel: ${newerRun.databaseId} (${newerRun.createdAt})` : ""}`,
    "",
    "| Job | Resultat | Fejltype | Dokumenteret årsag | Mulig handling | Godkendelse |",
    "|---|---|---|---|---|---|",
  ];
  for (const r of results) {
    const [act, go] = ADVICE[r.category];
    lines.push(`| ${cell(r.name)} | ${cell(r.conclusion)} | ${r.category} | ${cell(r.evidence)} | ${cell(act)} | ${cell(go)} |`);
  }
  const det = results.filter((r) => r.facts.installPath || r.facts.suite || r.facts.nodeTest || r.facts.k1Columns);
  if (det.length) {
    lines.push("", "### Fakta fra loggene");
    for (const r of det) {
      const f = r.facts;
      const bits = [];
      if (f.image) bits.push(`image ${f.image}`);
      if (f.cache) bits.push(`cache ${f.cache}`);
      if (f.installPath) bits.push(`systempakker fra ${f.installPath}, ${f.mirrorFetches} hentninger fra Ubuntu-spejle`);
      if (f.launched.length) bits.push(`startet: ${f.launched.join(", ")}`);
      if (f.k1Columns) bits.push(f.k1Columns);
      if (f.playwrightPassed) bits.push(`Playwright bestået ${f.playwrightPassed.join(" + ")}, sprunget over ${(f.playwrightSkipped ?? []).join(" + ")}`);
      if (f.suite) bits.push(`suite: forventet ${f.suite.expected}, flaky ${f.suite.flaky}, unexpected ${f.suite.unexpected}, sprunget over ${f.suite.skipped}`);
      if (f.nodeTest) bits.push(`node --test: ${f.nodeTest.pass} bestået, ${f.nodeTest.fail} fejlet`);
      lines.push(`- **${r.name}:** ${bits.join("; ")}`);
    }
  }
  const cov = coverage(run.jobs ?? [], results);
  if (cov.length) lines.push("", "### Dækning", ...cov.map((n) => `- ${n}`));
  lines.push("", "_Ukendte forhold står som UKENDT. Værktøjet genkører intet; en genkørsel kræver ejerens GO (docs/operations/ci-triage.md)._", "");
  return lines.join("\n");
}

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
}

async function fromGitHub(runId, repo) {
  const R = repo ? ["--repo", repo] : [];
  const run = JSON.parse(gh(["run", "view", String(runId), ...R, "--json", "databaseId,workflowName,headBranch,headSha,event,status,conclusion,createdAt,jobs"]));
  const nameWithRepo = repo ?? JSON.parse(gh(["repo", "view", "--json", "nameWithOwner"])).nameWithOwner;
  const newer = JSON.parse(gh(["run", "list", ...R, "--workflow", run.workflowName, "--branch", run.headBranch, "--limit", "20",
    "--json", "databaseId,createdAt"])).filter((r) => Date.parse(r.createdAt) > Date.parse(run.createdAt))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))[0] ?? null;
  const results = run.jobs.map((job) => {
    let log = "";
    if (job.conclusion !== "skipped" && job.status === "completed") {
      try { log = gh(["api", "--allow-escape-sequences", `repos/${nameWithRepo}/actions/jobs/${job.databaseId}/logs`]); } catch { log = ""; }
    }
    return classifyJob(job, log, { newerRunAt: newer?.createdAt ?? null });
  });
  return { run, results, newer };
}

export async function main(argv = process.argv.slice(2), { out = console.log, err = console.error } = {}) {
  const o = { logs: {} };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--repo") o.repo = argv[++i];
    else if (argv[i] === "--run-json") o.runJson = argv[++i];
    else if (argv[i] === "--log") { const [k, ...v] = argv[++i].split("="); o.logs[k] = v.join("="); }
    else pos.push(argv[i]);
  }
  try {
    if (o.runJson) {
      const run = JSON.parse(readFileSync(o.runJson, "utf8"));
      const results = run.jobs.map((j) => classifyJob(j, o.logs[j.name] ? readFileSync(o.logs[j.name], "utf8") : ""));
      out(report(run, results));
      return 0;
    }
    if (!/^\d+$/.test(pos[0] ?? "")) { err("Brug: node tools/ci/run-triage.mjs <run-id> [--repo owner/name]"); return 1; }
    const { run, results, newer } = await fromGitHub(pos[0], o.repo);
    out(report(run, results, { newerRun: newer }));
    return 0;
  } catch (e) {
    err(`run-triage: ${e.message}`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
