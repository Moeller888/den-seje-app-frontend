#!/usr/bin/env node
// Ejerskab af branches mellem Claude-sessioner (én skrivende agent pr. branch).
// Dokumentation: docs/operations/agent-coordination.md. Procedurerne står i docs/CLAUDE_WORKFLOW.md §11
// (PR #604); dette værktøj håndhæver dem lokalt: før en agent skriver, committer eller pusher på en branch,
// spørger den `check`/`push-check`, og en anden sessions ejerskab stopper den.
//
// Låsene ligger i <git-common-dir>/laerlig-claims/ — fælles for alle worktrees af SAMME klon på SAMME
// maskine, aldrig committet, uden hemmeligheder. De koordinerer ikke sessioner på andre maskiner eller i
// andre kloner (se dokumentationen). En lås overtages ALDRIG automatisk: en gammel lås markeres FORÆLDET,
// men kun ejeren (eller Christopher, ved at slette filen efter afklaring) kan frigive den.
//
// Exitkoder: 0 ok · 1 brugsfejl · 2 ejet af en anden session · 3 ingen lås · 4 mulig dublet-PR ·
//            5 remote har flyttet sig (push ville overskrive eller kræve integration)
import { execFileSync } from "node:child_process";
import { mkdirSync, openSync, writeSync, closeSync, readFileSync, writeFileSync, readdirSync, unlinkSync, existsSync, renameSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const EXIT = Object.freeze({ OK: 0, USAGE: 1, OWNED_BY_OTHER: 2, UNCLAIMED: 3, DUPLICATE: 4, REMOTE_MOVED: 5 });
export const DEFAULT_STALE_HOURS = 24;
const SCHEMA = 1;

export function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

export function claimsDir({ env = process.env, cwd = process.cwd() } = {}) {
  if (env.LAERLIG_CLAIMS_DIR) return resolve(env.LAERLIG_CLAIMS_DIR);
  return join(resolve(cwd, git(["rev-parse", "--git-common-dir"], cwd)), "laerlig-claims");
}

// "ci/run-triage" → "ci__run-triage.json". Afviser navne, der kunne pege uden for mappen.
export function claimFile(dir, branch) {
  if (typeof branch !== "string" || !/^[A-Za-z0-9._\/-]+$/.test(branch) || branch.includes("..")) {
    throw new UsageError(`ugyldigt branchnavn: ${JSON.stringify(branch)}`);
  }
  return join(dir, branch.replaceAll("/", "__") + ".json");
}

export class UsageError extends Error {}

export function readClaim(dir, branch) {
  const f = claimFile(dir, branch);
  if (!existsSync(f)) return null;
  const c = JSON.parse(readFileSync(f, "utf8"));
  if (!c || typeof c !== "object" || c.branch !== branch || typeof c.session !== "string") {
    throw new Error(`ødelagt låsefil ${f} — ret den manuelt; den bliver ikke overskrevet automatisk`);
  }
  return c;
}

export function ageHours(claim, now = Date.now()) {
  const t = Date.parse(claim.lastActivity ?? claim.createdAt);
  return Number.isFinite(t) ? (now - t) / 3_600_000 : Infinity;
}

export function describe(claim, { now = Date.now(), staleHours = DEFAULT_STALE_HOURS } = {}) {
  const h = ageHours(claim, now);
  const stale = h > staleHours;
  return `${claim.branch}: ejet af session ${claim.session} (opgave ${claim.task ?? "—"}, worktree ${claim.worktree ?? "—"}` +
    `${claim.pr ? `, PR #${claim.pr}` : ""}), seneste aktivitet ${claim.lastActivity} (${h.toFixed(1)} t siden)` +
    (stale ? ` — FORÆLDET (> ${staleHours} t): afklar med ejeren eller Christopher; overtages ikke automatisk` : "");
}

function writeAtomic(file, obj) {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(obj, null, 2) + "\n", "utf8");
  renameSync(tmp, file);
}

const FIELDS = ["task", "purpose", "worktree", "pr", "status", "next", "blockedBy", "needsApproval", "tests"];

// Opretter låsen atomisk (O_EXCL). Findes den: samme session = fornyelse, anden session = afvisning.
export function claim(dir, { branch, session, ...rest }, { now = Date.now() } = {}) {
  if (!session) throw new UsageError("--session mangler");
  mkdirSync(dir, { recursive: true });
  const f = claimFile(dir, branch);
  const stamp = new Date(now).toISOString();
  const fresh = { schema: SCHEMA, branch, session, createdAt: stamp, lastActivity: stamp };
  for (const k of FIELDS) if (rest[k] !== undefined) fresh[k] = rest[k];
  try {
    const fd = openSync(f, "wx");
    try { writeSync(fd, JSON.stringify(fresh, null, 2) + "\n"); } finally { closeSync(fd); }
    return { code: EXIT.OK, claim: fresh, created: true };
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
  }
  const existing = readClaim(dir, branch);
  if (existing.session !== session) return { code: EXIT.OWNED_BY_OTHER, claim: existing };
  const updated = { ...existing, lastActivity: stamp };
  for (const k of FIELDS) if (rest[k] !== undefined) updated[k] = rest[k];
  writeAtomic(f, updated);
  return { code: EXIT.OK, claim: updated, created: false };
}

export function check(dir, { branch, session }) {
  const c = readClaim(dir, branch);
  if (!c) return { code: EXIT.UNCLAIMED, claim: null };
  return { code: c.session === session ? EXIT.OK : EXIT.OWNED_BY_OTHER, claim: c };
}

export function heartbeat(dir, { branch, session, ...rest }, { now = Date.now() } = {}) {
  const r = check(dir, { branch, session });
  if (r.code !== EXIT.OK) return r;
  const updated = { ...r.claim, lastActivity: new Date(now).toISOString() };
  for (const k of FIELDS) if (rest[k] !== undefined) updated[k] = rest[k];
  writeAtomic(claimFile(dir, branch), updated);
  return { code: EXIT.OK, claim: updated };
}

export function release(dir, { branch, session }) {
  const r = check(dir, { branch, session });
  if (r.code !== EXIT.OK) return r;
  unlinkSync(claimFile(dir, branch));
  return { code: EXIT.OK, claim: r.claim };
}

export function list(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".json")).sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));
}

// Lige før push: remote må kun have flyttet sig til noget, HEAD allerede indeholder.
export function pushCheck({ cwd, branch, remote = "origin", expect, run = git }) {
  const line = run(["ls-remote", remote, `refs/heads/${branch}`], cwd);
  const remoteSha = line ? line.split(/\s+/)[0] : null;
  const head = run(["rev-parse", "HEAD"], cwd);
  if (!remoteSha) return { code: EXIT.OK, remoteSha, head, reason: "ny branch på remote" };
  if (expect && remoteSha !== expect) {
    return { code: EXIT.REMOTE_MOVED, remoteSha, head, reason: `remote er ${remoteSha}, forventet ${expect}` };
  }
  let contained = remoteSha === head;
  if (!contained) {
    try { run(["merge-base", "--is-ancestor", remoteSha, head], cwd); contained = true; } catch { contained = false; }
  }
  return contained
    ? { code: EXIT.OK, remoteSha, head, reason: "fast-forward" }
    : { code: EXIT.REMOTE_MOVED, remoteSha, head, reason: `remote ${remoteSha} er ikke indeholdt i HEAD ${head} — stop, undersøg forskellen, ingen force` };
}

const STOP = new Set(["og", "i", "på", "til", "af", "for", "med", "the", "a", "of", "to", "and", "in", "fix", "feat", "docs", "test", "ci", "chore", "ops"]);
export function words(s) {
  return new Set(String(s).toLowerCase().normalize("NFC").split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2 && !STOP.has(w)));
}
export function similarity(a, b) {
  const A = words(a), B = words(b);
  if (A.size === 0 || B.size === 0) return 0;
  let n = 0;
  for (const w of A) if (B.has(w)) n++;
  return n / Math.min(A.size, B.size);
}

// Mulige dubletter blandt åbne PR'er: samme branch, eller ≥ threshold af de meningsbærende ord i titel+branch.
export function findDuplicates(prs, { title = "", branch = "", threshold = 0.6 } = {}) {
  const probe = `${title} ${branch.replaceAll(/[\/_-]/g, " ")}`;
  return prs
    .map((p) => ({ ...p, score: p.headRefName === branch ? 1 : similarity(probe, `${p.title} ${String(p.headRefName).replaceAll(/[\/_-]/g, " ")}`) }))
    .filter((p) => p.score >= threshold)
    .sort((x, y) => y.score - x.score);
}

export function handover({ cwd, branch, claimInfo, run = git }) {
  const head = run(["rev-parse", "HEAD"], cwd);
  const base = run(["merge-base", "HEAD", "origin/main"], cwd);
  const files = run(["diff", "--name-status", `${base}..HEAD`], cwd);
  const dirty = run(["status", "--porcelain"], cwd);
  let remote = "";
  try { remote = run(["ls-remote", "origin", `refs/heads/${branch}`], cwd).split(/\s+/)[0] ?? ""; } catch { remote = "(ukendt)"; }
  return [
    `## Overdragelse: ${branch}`,
    "",
    `- **Ejerskab:** ${claimInfo ?? "ingen lås registreret"}`,
    `- **Sidste verificerede SHA (lokal HEAD):** ${head}`,
    `- **Remote-HEAD:** ${remote || "ikke pushet"}`,
    `- **Grundlag (merge-base med origin/main):** ${base}`,
    `- **Arbejdstræ:** ${dirty ? `${dirty.split("\n").length} ikke-committede ændringer` : "rent"} (${cwd})`,
    "",
    "### Ændrede filer mod grundlaget",
    "```",
    files || "(ingen)",
    "```",
    "",
    "### Udfyldes af den afleverende agent",
    "- **Opgave og formål:** ",
    "- **Tests (lokalt / CI / simuleret / PGlite / rigtig PostgreSQL / ikke testet):** ",
    "- **Åbne fejl:** ",
    "- **Risici:** ",
    "- **Næste sikre handling:** ",
    "- **Godkendelsesstatus (hvilke GO'er er givet, hvilke mangler):** ",
    "",
  ].join("\n");
}

function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const o = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith("--")) throw new UsageError(`uventet argument: ${a}`);
    const k = a.slice(2);
    const v = rest[i + 1];
    if (v === undefined || v.startsWith("--")) { o[k] = true; } else { o[k] = v; i++; }
  }
  return { cmd, o };
}

const USAGE = `Brug: node tools/agents/claim.mjs <kommando> [--flag værdi]
  claim       --branch B --session S --task ID --purpose "…" [--worktree W] [--pr N] [--status …] [--next …]
  check       --branch B --session S            (0 = din, 2 = en andens, 3 = ingen lås)
  heartbeat   --branch B --session S [--status …] [--next …] [--tests …]
  release     --branch B --session S
  list        [--stale-hours N]
  push-check  --branch B --session S [--expect SHA] [--remote origin]
  dupes       --title "…" [--branch B] [--prs-json fil]
  handover    --branch B [--session S]`;

export async function main(argv = process.argv.slice(2), { env = process.env, cwd = process.cwd(), out = console.log, err = console.error } = {}) {
  let parsed;
  try { parsed = parseArgs(argv); } catch (e) { err(e.message); err(USAGE); return EXIT.USAGE; }
  const { cmd, o } = parsed;
  const staleHours = o["stale-hours"] ? Number(o["stale-hours"]) : DEFAULT_STALE_HOURS;
  const need = (...ks) => { for (const k of ks) if (!o[k] || o[k] === true) throw new UsageError(`--${k} mangler`); };
  try {
    switch (cmd) {
      case "claim": case "check": case "heartbeat": case "release": {
        need("branch", "session");
        if (cmd === "claim") need("task", "purpose");
        const dir = claimsDir({ env, cwd });
        const args = { branch: o.branch, session: o.session, task: o.task, purpose: o.purpose, worktree: o.worktree ?? (cmd === "claim" ? cwd : undefined),
          pr: o.pr, status: o.status, next: o.next, tests: o.tests };
        const r = cmd === "claim" ? claim(dir, args) : cmd === "check" ? check(dir, args) : cmd === "heartbeat" ? heartbeat(dir, args) : release(dir, args);
        if (r.code === EXIT.OK) out(`${cmd}: ok — ${describe(r.claim, { staleHours })}`);
        else if (r.code === EXIT.UNCLAIMED) err(`${cmd}: ingen lås på ${o.branch} — kør 'claim' før du skriver`);
        else err(`${cmd}: STOP — ${describe(r.claim, { staleHours })}`);
        return r.code;
      }
      case "list": {
        const all = list(claimsDir({ env, cwd }));
        if (all.length === 0) out("ingen låse");
        for (const c of all) out(describe(c, { staleHours }));
        return EXIT.OK;
      }
      case "push-check": {
        need("branch", "session");
        const own = check(claimsDir({ env, cwd }), { branch: o.branch, session: o.session });
        if (own.code !== EXIT.OK) {
          err(own.claim ? `push-check: STOP — ${describe(own.claim, { staleHours })}` : `push-check: ingen lås på ${o.branch} — kør 'claim' først`);
          return own.code;
        }
        const r = pushCheck({ cwd, branch: o.branch, remote: o.remote ?? "origin", expect: o.expect });
        (r.code === EXIT.OK ? out : err)(`push-check: ${r.code === EXIT.OK ? "ok" : "STOP"} — ${r.reason}`);
        return r.code;
      }
      case "dupes": {
        need("title");
        const prs = o["prs-json"]
          ? JSON.parse(readFileSync(o["prs-json"], "utf8"))
          : JSON.parse(execFileSync("gh", ["pr", "list", "--state", "open", "--limit", "300", "--json", "number,title,headRefName"], { cwd, encoding: "utf8" }));
        const hits = findDuplicates(prs, { title: o.title, branch: typeof o.branch === "string" ? o.branch : "" });
        if (hits.length === 0) { out("dupes: ingen sandsynlige dubletter blandt åbne PR'er"); return EXIT.OK; }
        err("dupes: STOP — mulige dubletter (luk eller overtag dem ikke; rapportér):");
        for (const h of hits) err(`  #${h.number} ${h.headRefName} — ${h.title} (lighed ${h.score.toFixed(2)})`);
        return EXIT.DUPLICATE;
      }
      case "handover": {
        need("branch");
        const c = readClaim(claimsDir({ env, cwd }), o.branch);
        out(handover({ cwd, branch: o.branch, claimInfo: c ? describe(c, { staleHours }) : null }));
        return EXIT.OK;
      }
      default:
        err(USAGE);
        return EXIT.USAGE;
    }
  } catch (e) {
    err(e instanceof UsageError ? e.message : `fejl: ${e.message}`);
    if (e instanceof UsageError) err(USAGE);
    return EXIT.USAGE;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
