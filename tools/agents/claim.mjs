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
// Værktøjet kører ALDRIG selv `git push`, `git merge` eller andre skrivende git-kommandoer: de skal stå i
// agentens egen kommando, så LÆRLIG-GUARD ser dem. Det læser kun (ls-remote, rev-parse, merge-base).
//
// Exitkoder: 0 ok · 1 brugsfejl · 2 ejet af en anden session · 3 ingen lås · 4 mulig dublet-PR ·
//            5 remote har flyttet sig siden den verificerede SHA · 6 ødelagt låsefil ·
//            7 ingen verificeret remote-SHA (kør `verify`) · 8 ALARM efter push: serverens gamle værdi var
//            ikke den verificerede (en anden har ændret branchen i mellemtiden)
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, readdirSync, unlinkSync, existsSync, renameSync, linkSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const EXIT = Object.freeze({
  OK: 0, USAGE: 1, OWNED_BY_OTHER: 2, UNCLAIMED: 3, DUPLICATE: 4, REMOTE_MOVED: 5, BROKEN: 6, NOT_VERIFIED: 7, PUSH_ALERT: 8,
});
export const DEFAULT_STALE_HOURS = 24;
export const ABSENT = "absent"; // verificeret: branchen findes ikke på remote
const SCHEMA = 1;
const SHA = /^[0-9a-f]{40}$/;

export function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

export function claimsDir({ env = process.env, cwd = process.cwd() } = {}) {
  if (env.LAERLIG_CLAIMS_DIR) return resolve(env.LAERLIG_CLAIMS_DIR);
  return join(resolve(cwd, git(["rev-parse", "--git-common-dir"], cwd)), "laerlig-claims");
}

export class UsageError extends Error {}
// En låsefil, der ikke kan læses som en gyldig lås. Fejler altid lukket: ingen kan skrive på branchen,
// før et menneske har set på filen.
export class BrokenClaimError extends Error {
  constructor(file, why) { super(`ØDELAGT låsefil ${file} (${why}) — ret eller slet den manuelt efter afklaring; den overskrives aldrig automatisk`); this.file = file; }
}

// "ci/run-triage" → "ci__run-triage.json". Afviser navne, der kunne pege uden for mappen.
export function claimFile(dir, branch) {
  if (typeof branch !== "string" || !/^[A-Za-z0-9._\/-]+$/.test(branch) || branch.includes("..")) {
    throw new UsageError(`ugyldigt branchnavn: ${JSON.stringify(branch)}`);
  }
  return join(dir, branch.replaceAll("/", "__") + ".json");
}

function parseClaim(file, text, branch) {
  if (text.trim() === "") throw new BrokenClaimError(file, "tom fil");
  let c;
  try { c = JSON.parse(text); } catch { throw new BrokenClaimError(file, "ikke gyldig JSON"); }
  if (!c || typeof c !== "object" || typeof c.branch !== "string" || typeof c.session !== "string" || !c.session) {
    throw new BrokenClaimError(file, "mangler branch eller session");
  }
  if (branch !== undefined && c.branch !== branch) throw new BrokenClaimError(file, `branch ${JSON.stringify(c.branch)} ≠ ${JSON.stringify(branch)}`);
  return c;
}

export function readClaim(dir, branch) {
  const f = claimFile(dir, branch);
  if (!existsSync(f)) return null;
  return parseClaim(f, readFileSync(f, "utf8"), branch);
}

export function ageHours(claim, now = Date.now()) {
  const t = Date.parse(claim.lastActivity ?? claim.createdAt);
  return Number.isFinite(t) ? (now - t) / 3_600_000 : Infinity;
}

export function describe(claim, { now = Date.now(), staleHours = DEFAULT_STALE_HOURS } = {}) {
  if (claim.broken) return `${claim.file}: ${claim.error}`;
  const h = ageHours(claim, now);
  const stale = h > staleHours;
  return `${claim.branch}: ejet af session ${claim.session} (opgave ${claim.task ?? "—"}, worktree ${claim.worktree ?? "—"}` +
    `${claim.pr ? `, PR #${claim.pr}` : ""}), seneste aktivitet ${claim.lastActivity} (${h.toFixed(1)} t siden)` +
    `, verificeret remote ${claim.verifiedRemote ?? "INGEN"}` +
    (stale ? ` — FORÆLDET (> ${staleHours} t): afklar med ejeren eller Christopher; overtages ikke automatisk` : "");
}

const tmpName = (file) => `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;

// Opdatering af en EKSISTERENDE lås: skriv hele indholdet til en midlertidig fil og omdøb den. En læser ser
// enten den gamle eller den nye fil, aldrig en halv.
function replaceClaim(file, obj) {
  const tmp = tmpName(file);
  writeFileSync(tmp, JSON.stringify(obj, null, 2) + "\n", "utf8");
  renameSync(tmp, file);
}

const FIELDS = ["task", "purpose", "worktree", "pr", "status", "next", "blockedBy", "needsApproval", "tests"];

// Opretter låsen atomisk MED indhold: den midlertidige fil skrives færdig og linkes derefter til det
// endelige navn (link fejler med EEXIST, hvis låsen findes). Et nedbrud før linket efterlader kun en .tmp-fil
// — aldrig en tom lås. Findes låsen: samme session = fornyelse, anden session = afvisning.
export function claim(dir, { branch, session, ...rest }, { now = Date.now() } = {}) {
  if (!session) throw new UsageError("--session mangler");
  mkdirSync(dir, { recursive: true });
  const f = claimFile(dir, branch);
  const stamp = new Date(now).toISOString();
  const fresh = { schema: SCHEMA, branch, session, createdAt: stamp, lastActivity: stamp };
  for (const k of FIELDS) if (rest[k] !== undefined) fresh[k] = rest[k];
  const tmp = tmpName(f);
  writeFileSync(tmp, JSON.stringify(fresh, null, 2) + "\n", "utf8");
  try {
    linkSync(tmp, f);
    return { code: EXIT.OK, claim: fresh, created: true };
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
  } finally {
    try { unlinkSync(tmp); } catch { /* allerede væk */ }
  }
  const existing = readClaim(dir, branch);
  if (existing.session !== session) return { code: EXIT.OWNED_BY_OTHER, claim: existing };
  return update(dir, f, existing, rest, now);
}

// Genlæser låsen umiddelbart før omdøbningen og opgiver, hvis ejeren er skiftet imens. Vinduet mellem
// genlæsning og rename er ikke nul (se dokumentationen), men et ejerskifte kræver, at et menneske har
// slettet låsen manuelt — værktøjet selv sletter kun sin egen.
export function update(dir, file, current, fields, now, extra = {}) {
  const next = { ...current, ...extra, lastActivity: new Date(now).toISOString() };
  for (const k of FIELDS) if (fields[k] !== undefined) next[k] = fields[k];
  const again = readClaim(dir, current.branch);
  if (!again || again.session !== current.session) {
    return { code: again ? EXIT.OWNED_BY_OTHER : EXIT.UNCLAIMED, claim: again };
  }
  replaceClaim(file, next);
  return { code: EXIT.OK, claim: next, created: false };
}

export function check(dir, { branch, session }) {
  const c = readClaim(dir, branch);
  if (!c) return { code: EXIT.UNCLAIMED, claim: null };
  return { code: c.session === session ? EXIT.OK : EXIT.OWNED_BY_OTHER, claim: c };
}

export function heartbeat(dir, { branch, session, ...rest }, { now = Date.now() } = {}) {
  const r = check(dir, { branch, session });
  if (r.code !== EXIT.OK) return r;
  return update(dir, claimFile(dir, branch), r.claim, rest, now);
}

export function release(dir, { branch, session }) {
  const r = check(dir, { branch, session });
  if (r.code !== EXIT.OK) return r;
  unlinkSync(claimFile(dir, branch));
  return { code: EXIT.OK, claim: r.claim };
}

// Alle låse. En ødelagt fil ødelægger ikke oversigten: den vises som { broken: true, file, error }.
export function list(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => {
    const file = join(dir, f);
    try { return parseClaim(file, readFileSync(file, "utf8")); } catch (e) {
      return { broken: true, file, error: e instanceof BrokenClaimError ? e.message : `ØDELAGT låsefil ${file} (${e.message})` };
    }
  });
}

export function remoteHead({ cwd, branch, remote = "origin", run = git }) {
  const line = run(["ls-remote", remote, `refs/heads/${branch}`], cwd);
  const sha = line ? line.split(/\s+/)[0] : null;
  if (sha !== null && !SHA.test(sha)) throw new Error(`uventet svar fra git ls-remote: ${JSON.stringify(line.slice(0, 80))}`);
  return sha ?? ABSENT;
}

// Agenten har hentet og gennemgået remote-HEAD (eller konstateret, at branchen ikke findes) og registrerer
// den SHA, den har set. Det er en bevidst handling: en ny fremmed commit kræver et nyt `verify`.
export function verify(dir, { cwd, branch, session, remote = "origin", run = git }, { now = Date.now() } = {}) {
  const r = check(dir, { branch, session });
  if (r.code !== EXIT.OK) return r;
  const seen = remoteHead({ cwd, branch, remote, run });
  return { ...update(dir, claimFile(dir, branch), r.claim, {}, now, { verifiedRemote: seen }), remoteSha: seen };
}

// Lige før push. Tre krav, alle skal holde:
//   1) ejerskab;  2) en verificeret remote-SHA findes, og remote er PRÆCIS den nu (ikke blot en forfader:
//   en tilbagerulning eller en fremmed commit, som agenten har trukket ind lokalt, ændrer remote-HEAD og
//   stoppes her);  3) den verificerede SHA er indeholdt i HEAD, så en almindelig push er en fast-forward.
export function pushCheck(dir, { cwd, branch, session, remote = "origin", run = git }) {
  const own = check(dir, { branch, session });
  if (own.code !== EXIT.OK) return { ...own, reason: own.claim ? "ejet af en anden session" : "ingen lås" };
  const verified = own.claim.verifiedRemote;
  if (!verified) return { code: EXIT.NOT_VERIFIED, reason: "ingen verificeret remote-SHA i låsen — hent, gennemgå og kør `verify` først" };
  const now = remoteHead({ cwd, branch, remote, run });
  const head = run(["rev-parse", "HEAD"], cwd);
  if (now !== verified) {
    return { code: EXIT.REMOTE_MOVED, remoteSha: now, head,
      reason: `remote er ${now}, verificeret var ${verified} — en anden har pushet eller rullet tilbage; stop, gennemgå forskellen, ingen force` };
  }
  if (now === ABSENT) return { code: EXIT.OK, remoteSha: now, head, reason: "ny branch på remote (verificeret fraværende)" };
  if (now !== head) {
    try { run(["merge-base", "--is-ancestor", now, head], cwd); } catch {
      return { code: EXIT.REMOTE_MOVED, remoteSha: now, head, reason: `verificeret remote ${now} er ikke indeholdt i HEAD ${head} — en almindelig push ville blive afvist; ingen force` };
    }
  }
  return { code: EXIT.OK, remoteSha: now, head, reason: "remote uændret siden verificering, fast-forward" };
}

// `git push --porcelain` skriver "<flag>\t<from>:<to>\t<gammel>..<ny>" (eller "[new branch]"). Den gamle
// værdi er SERVERENS — det eneste bevis for, hvad remote var i selve push-øjeblikket.
export function parsePorcelain(text, branch) {
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^(.)\t[^\t]*:refs\/heads\/(\S+)\t(.*)$/.exec(line);
    if (!m || m[2] !== branch) continue;
    if (m[1] === "!") return { rejected: true, summary: m[3] };
    if (m[1] === "*" || /\[new branch\]/.test(m[3])) return { old: ABSENT };
    const r = /^([0-9a-f]{7,40})\.\.\.?([0-9a-f]{7,40})/.exec(m[3]);
    if (r) return { old: r[1], forced: m[1] === "+" };
    if (m[1] === "=") return { old: "up-to-date" };
  }
  return null;
}

// Efter agentens egen `git push --porcelain` (uden force). Fanger det, et lokalt preflight ikke kan: at
// remote blev ændret MELLEM push-check og push. En almindelig push afvises af serveren, hvis den ville
// miste commits; den accepteres dog, hvis en anden har rullet branchen tilbage til en forfader af HEAD.
// Dét afsløres her — bagefter, ikke forhindret (se dokumentationen om serverhåndhævet beskyttelse).
export function afterPush(dir, { cwd, branch, session, porcelain, remote = "origin", run = git }, { now = Date.now() } = {}) {
  const own = check(dir, { branch, session });
  if (own.code !== EXIT.OK) return { ...own, reason: "ejerskab mangler" };
  const p = parsePorcelain(porcelain, branch);
  if (!p) return { code: EXIT.USAGE, reason: "fandt ingen linje for branchen i push-outputtet (brug `git push --porcelain`)" };
  if (p.rejected) return { code: EXIT.REMOTE_MOVED, reason: `push afvist af serveren: ${p.summary}` };
  if (p.forced) return { code: EXIT.PUSH_ALERT, reason: "push var en FORCE-opdatering — må aldrig ske; rapportér til ejeren" };
  const verified = own.claim.verifiedRemote;
  const head = run(["rev-parse", "HEAD"], cwd);
  if (p.old !== "up-to-date" && !(p.old === verified || (SHA.test(verified ?? "") && verified.startsWith(p.old)))) {
    return { code: EXIT.PUSH_ALERT, reason: `ALARM: serverens gamle værdi var ${p.old}, verificeret var ${verified ?? "INGEN"} — branchen blev ændret mellem kontrol og push; gennemgå historikken og rapportér` };
  }
  const nowRemote = remoteHead({ cwd, branch, remote, run });
  if (nowRemote !== head) return { code: EXIT.REMOTE_MOVED, reason: `remote er ${nowRemote}, ikke HEAD ${head} efter push` };
  return { ...update(dir, claimFile(dir, branch), own.claim, {}, now, { verifiedRemote: head }), reason: `push bekræftet; verificeret remote = ${head}` };
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
  check       --branch B --session S            (0 = din, 2 = en andens, 3 = ingen lås, 6 = ødelagt)
  heartbeat   --branch B --session S [--status …] [--next …] [--tests …]
  verify      --branch B --session S [--remote origin]   (registrér den remote-HEAD, du har gennemgået)
  push-check  --branch B --session S [--remote origin]   (0 = push uden force; 5/7 = stop)
  after-push  --branch B --session S --porcelain-file F  (output fra din egen git push --porcelain; 8 = ALARM)
  release     --branch B --session S
  list        [--stale-hours N]
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
      case "verify": {
        need("branch", "session");
        const r = verify(claimsDir({ env, cwd }), { cwd, branch: o.branch, session: o.session, remote: o.remote ?? "origin" });
        if (r.code === EXIT.OK) out(`verify: ok — verificeret remote ${r.remoteSha}`);
        else err(r.claim ? `verify: STOP — ${describe(r.claim, { staleHours })}` : `verify: ingen lås på ${o.branch}`);
        return r.code;
      }
      case "push-check": {
        need("branch", "session");
        const r = pushCheck(claimsDir({ env, cwd }), { cwd, branch: o.branch, session: o.session, remote: o.remote ?? "origin" });
        (r.code === EXIT.OK ? out : err)(`push-check: ${r.code === EXIT.OK ? "ok" : "STOP"} — ${r.reason}`);
        return r.code;
      }
      case "after-push": {
        need("branch", "session", "porcelain-file");
        const r = afterPush(claimsDir({ env, cwd }), { cwd, branch: o.branch, session: o.session, porcelain: readFileSync(o["porcelain-file"], "utf8"), remote: o.remote ?? "origin" });
        (r.code === EXIT.OK ? out : err)(`after-push: ${r.code === EXIT.OK ? "ok" : "STOP"} — ${r.reason}`);
        return r.code;
      }
      case "list": {
        const all = list(claimsDir({ env, cwd }));
        if (all.length === 0) out("ingen låse");
        for (const c of all) (c.broken ? err : out)(describe(c, { staleHours }));
        return all.some((c) => c.broken) ? EXIT.BROKEN : EXIT.OK;
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
        let info = null;
        try { const c = readClaim(claimsDir({ env, cwd }), o.branch); info = c ? describe(c, { staleHours }) : null; } catch (e) { info = e.message; }
        out(handover({ cwd, branch: o.branch, claimInfo: info }));
        return EXIT.OK;
      }
      default:
        err(USAGE);
        return EXIT.USAGE;
    }
  } catch (e) {
    if (e instanceof BrokenClaimError) { err(`${cmd}: STOP — ${e.message}`); return EXIT.BROKEN; }
    err(e instanceof UsageError ? e.message : `fejl: ${e.message}`);
    if (e instanceof UsageError) err(USAGE);
    return EXIT.USAGE;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
