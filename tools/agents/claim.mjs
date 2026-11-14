#!/usr/bin/env node
// Ejerskab af branches mellem Claude-sessioner (én skrivende agent pr. branch).
// Dokumentation: docs/operations/agent-coordination.md. Procedurerne står i docs/CLAUDE_WORKFLOW.md §11
// (PR #604); dette værktøj håndhæver dem lokalt: før en agent skriver, committer eller pusher på en branch,
// spørger den `check`/`push-check`, og en anden sessions ejerskab stopper den.
//
// Låsene ligger i ~/.claude/laerlig-claims/<repo>/ — fælles for ALLE kloner og worktrees af samme GitHub-repo
// på samme maskine (trin 1, 2026-11-14), aldrig committet, uden hemmeligheder. Ældre låse i
// <git-common-dir>/laerlig-claims/ læses stadig: en gammel lås, der tilhører en anden session, stopper; en
// gammel og en ny lås med forskellige ejere er en KONFLIKT og stopper også. Intet slettes automatisk. En lås
// overtages ALDRIG automatisk: en gammel lås markeres FORÆLDET, men kun ejeren (eller Christopher, ved at
// slette filen efter afklaring) kan frigive den.
//
// Sessions-id tages fra harnessen (CLAUDE_CODE_SESSION_ID). Et --session, der afviger fra den, afvises: en
// agent kan ikke uforvarende optræde som en anden session. Låsen gemmer sessions-id (ikke PID), så en
// genstartet session med ny PID ejer stadig sine låse; `whois` finder den aktuelle PID og navn.
//
// Værktøjet kører ALDRIG selv `git push`, `git merge` eller andre skrivende git-kommandoer: de skal stå i
// agentens egen kommando, så LÆRLIG-GUARD ser dem. Det læser kun (ls-remote, rev-parse, merge-base, config).
//
// Exitkoder: 0 ok · 1 brugsfejl · 2 ejet af en anden session · 3 ingen lås · 4 mulig dublet-PR ·
//            5 remote har flyttet sig siden den verificerede SHA · 6 ødelagt låsefil ·
//            7 ingen verificeret remote-SHA (kør `verify`) · 8 ALARM efter push: serverens gamle værdi var
//            ikke den verificerede (en anden har ændret branchen i mellemtiden) ·
//            9 KONFLIKT: modstridende låse (ny og gammel placering har forskellige ejere)
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, readdirSync, unlinkSync, existsSync, renameSync, linkSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

export const EXIT = Object.freeze({
  OK: 0, USAGE: 1, OWNED_BY_OTHER: 2, UNCLAIMED: 3, DUPLICATE: 4, REMOTE_MOVED: 5, BROKEN: 6, NOT_VERIFIED: 7, PUSH_ALERT: 8,
  CONFLICT: 9,
});
export const DEFAULT_STALE_HOURS = 24;
export const ABSENT = "absent"; // verificeret: branchen findes ikke på remote
const SCHEMA = 1;
const SHA = /^[0-9a-f]{40}$/;

export function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

// "https://github.com/Moeller888/den-seje-app-frontend.git" og "git@github.com:Moeller888/…" giver samme nøgle:
// "github.com__moeller888__den-seje-app-frontend". Brugernavn/kodeord i URL'en indgår aldrig.
export function repoKey(url) {
  const s = String(url ?? "").trim();
  // Fejlbeskeder viser aldrig URL'ens brugernavn/kodeord eller en nøgle afledt af dem.
  const fail = () => new UsageError(`kan ikke udlede repo fra remote-URL ${JSON.stringify(s.replace(/^([a-z+]+:\/\/)?[^@\/]*@/i, "$1***@"))}`);
  const m = /^(?:[a-z+]+:\/\/)?(?:[^@\/]+@)?([^\/:@]+)[:\/]([^@]+?)(?:\.git)?\/?$/i.exec(s);
  if (!m) throw fail();
  const key = `${m[1]}/${m[2]}`.toLowerCase().replaceAll("/", "__");
  if (!/^[a-z0-9._-]+(?:__[a-z0-9._-]+)+$/.test(key)) throw fail();
  return key;
}

const home = (env) => env.USERPROFILE || env.HOME || homedir();

// Den fælles mappe for repoet (alle kloner). LAERLIG_CLAIMS_DIR overstyrer helt (tests og særtilfælde).
export function claimsDir({ env = process.env, cwd = process.cwd(), run = git } = {}) {
  if (env.LAERLIG_CLAIMS_DIR) return resolve(env.LAERLIG_CLAIMS_DIR);
  const base = env.LAERLIG_CLAIMS_HOME ? resolve(env.LAERLIG_CLAIMS_HOME) : join(home(env), ".claude", "laerlig-claims");
  return join(base, repoKey(run(["config", "--get", "remote.origin.url"], cwd)));
}

// Den gamle placering (før trin 1): kun den aktuelle klon. Læses, så ældre låse fortsat respekteres.
export function legacyClaimsDir({ env = process.env, cwd = process.cwd(), run = git } = {}) {
  if (env.LAERLIG_CLAIMS_DIR) return null;
  try { return join(resolve(cwd, run(["rev-parse", "--git-common-dir"], cwd)), "laerlig-claims"); } catch { return null; }
}

// Find branchens lås på tværs af ny og gammel placering. Modstridende ejere = KONFLIKT, aldrig et valg.
export function locate(dirs, branch) {
  const shared = readClaim(dirs.shared, branch);
  const legacy = dirs.legacy ? readClaim(dirs.legacy, branch) : null;
  if (shared && legacy && shared.session !== legacy.session) return { conflict: true, shared, legacy };
  if (shared) return { claim: shared, dir: dirs.shared };
  if (legacy) return { claim: legacy, dir: dirs.legacy };
  return { claim: null, dir: dirs.shared };
}

// Sessions-id fra harnessen. Et eksplicit --session skal være det samme.
export function resolveSession(given, env = process.env) {
  const harness = env.CLAUDE_CODE_SESSION_ID;
  if (given && given !== true && harness && given !== harness) {
    throw new UsageError(`--session ${given} afviger fra harnessens CLAUDE_CODE_SESSION_ID (${harness}) — en agent kan ikke optræde som en anden session`);
  }
  const s = (given && given !== true) ? given : harness;
  if (!s) throw new UsageError("intet sessions-id: hverken --session eller CLAUDE_CODE_SESSION_ID");
  return s;
}

// Claude Code skriver én fil pr. kørende session: ~/.claude/sessions/<pid>.json med sessionId, name, status.
// Matcher på sessions-id (ikke PID): en genstartet session har ny PID og ofte nyt navn, men samme id.
export function findSession(sessionId, { env = process.env, alive = pidAlive } = {}) {
  const dir = env.CLAUDE_SESSIONS_DIR ? resolve(env.CLAUDE_SESSIONS_DIR) : join(home(env), ".claude", "sessions");
  if (!existsSync(dir)) return null;
  const found = [];
  for (const f of readdirSync(dir)) {
    if (!/^\d+\.json$/.test(f)) continue;
    let o;
    try { o = JSON.parse(readFileSync(join(dir, f), "utf8")); } catch { continue; }
    if (o?.sessionId !== sessionId) continue;
    found.push({ pid: o.pid, name: o.name ?? null, status: o.status ?? null, cwd: o.cwd ?? null, updatedAt: o.updatedAt ?? null, alive: alive(o.pid) });
  }
  // Flere filer for samme session (genstart uden oprydning): den levende og nyeste vinder; resten er forældede.
  found.sort((x, y) => Number(y.alive) - Number(x.alive) || (y.updatedAt ?? 0) - (x.updatedAt ?? 0));
  return found.length ? { ...found[0], stalePids: found.slice(1).map((x) => x.pid) } : null;
}

export function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; }
}

// Terminalens shell = forælderprocessen til claude-processen (i VS Code: den PID, der står i terminalfanens tooltip).
export function parentPid(pid) {
  try {
    if (process.platform === "win32") {
      const out = execFileSync("powershell.exe", ["-NoProfile", "-Command", `(Get-CimInstance Win32_Process -Filter "ProcessId=${Number(pid)}").ParentProcessId`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 15000 }).trim();
      return /^\d+$/.test(out) ? Number(out) : null;
    }
    const out = execFileSync("ps", ["-o", "ppid=", "-p", String(Number(pid))], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return /^\d+$/.test(out) ? Number(out) : null;
  } catch { return null; }
}

// Hvem ejer branchen, og hvor er den session nu? Ændrer intet.
export function whois(dirs, branch, { env = process.env, alive = pidAlive, parentOf = parentPid, now = Date.now(), staleHours = DEFAULT_STALE_HOURS } = {}) {
  const loc = locate(dirs, branch);
  if (loc.conflict) return { code: EXIT.CONFLICT, text: `KONFLIKT: ${branch} har to ejere — ny placering: ${loc.shared.session}, gammel placering: ${loc.legacy.session}. Stop; Christopher afklarer.` };
  if (!loc.claim) return { code: EXIT.UNCLAIMED, text: `${branch}: ingen lås` };
  const c = loc.claim;
  const s = findSession(c.session, { env, alive });
  const lines = [describe(c, { now, staleHours })];
  if (!s) {
    lines.push(`Ejersessionen ${c.session} kører ikke (ingen sessionsfil). Låsen er bevaret; den frigives kun af ejeren eller af Christopher efter afklaring.`);
    return { code: EXIT.OK, text: lines.join("\n"), owner: { session: c.session, running: false } };
  }
  const terminal = s.alive ? parentOf(s.pid) : null;
  lines.push(`Ejer nu: ${s.name ?? "(uden navn)"} · session ${c.session} · PID ${s.pid}${s.alive ? "" : " (PROCES VÆK — forældet sessionsfil)"} · status ${s.status ?? "ukendt"}` +
    (terminal ? ` · terminalens shell-PID ${terminal} (VS Code: hold musen over terminalfanen)` : ""));
  if (s.stalePids.length) lines.push(`Forældede sessionsfiler for samme session (genstart): PID ${s.stalePids.join(", ")}`);
  if (c.sessionName && s.name && c.sessionName !== s.name) lines.push(`Navnet er skiftet siden låsen blev taget: ${c.sessionName} → ${s.name}`);
  return { code: EXIT.OK, text: lines.join("\n"), owner: { session: c.session, running: s.alive, pid: s.pid, name: s.name, terminal } };
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

const FIELDS = ["task", "purpose", "worktree", "pr", "status", "next", "blockedBy", "needsApproval", "tests", "sessionName"];

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
  (--session er valgfri: harnessens CLAUDE_CODE_SESSION_ID bruges; et afvigende --session afvises)
  claim       --branch B --task ID --purpose "…" [--worktree W] [--pr N] [--status …] [--next …]
  check       --branch B            (0 = din, 2 = en andens, 3 = ingen lås, 6 = ødelagt, 9 = konflikt)
  heartbeat   --branch B [--status …] [--next …] [--tests …]
  verify      --branch B [--remote origin]   (registrér den remote-HEAD, du har gennemgået)
  push-check  --branch B [--remote origin]   (0 = push uden force; 5/7/9 = stop)
  after-push  --branch B --porcelain-file F  (output fra din egen git push --porcelain; 8 = ALARM)
  release     --branch B
  whois       --branch B                     (hvem ejer branchen, kører sessionen, hvilken terminal)
  list        [--stale-hours N]
  dupes       --title "…" [--branch B] [--prs-json fil]
  handover    --branch B`;

export async function main(argv = process.argv.slice(2), { env = process.env, cwd = process.cwd(), out = console.log, err = console.error, alive, parentOf } = {}) {
  let parsed;
  try { parsed = parseArgs(argv); } catch (e) { err(e.message); err(USAGE); return EXIT.USAGE; }
  const { cmd, o } = parsed;
  const staleHours = o["stale-hours"] ? Number(o["stale-hours"]) : DEFAULT_STALE_HOURS;
  const need = (...ks) => { for (const k of ks) if (!o[k] || o[k] === true) throw new UsageError(`--${k} mangler`); };
  const dirs = () => ({ shared: claimsDir({ env, cwd }), legacy: legacyClaimsDir({ env, cwd }) });
  // Find den mappe, hvor branchens lås ligger. En konflikt mellem ny og gammel placering stopper altid.
  const target = (d, branch) => {
    const loc = locate(d, branch);
    if (loc.conflict) {
      err(`${cmd}: KONFLIKT — ${branch} har to ejere: ny placering ${loc.shared.session}, gammel placering ${loc.legacy.session}. Stop; Christopher afklarer.`);
      return null;
    }
    return loc;
  };
  try {
    switch (cmd) {
      case "claim": case "check": case "heartbeat": case "release": {
        need("branch");
        if (cmd === "claim") need("task", "purpose");
        const session = resolveSession(o.session, env);
        const d = dirs();
        const loc = target(d, o.branch);
        if (!loc) return EXIT.CONFLICT;
        const args = { branch: o.branch, session, task: o.task, purpose: o.purpose, worktree: o.worktree ?? (cmd === "claim" ? cwd : undefined),
          pr: o.pr, status: o.status, next: o.next, tests: o.tests };
        let r;
        if (cmd === "claim") {
          // En lås i den gamle placering, der tilhører en anden, stopper — der skrives intet nyt.
          if (loc.claim && loc.claim.session !== session) r = { code: EXIT.OWNED_BY_OTHER, claim: loc.claim };
          else {
            const s = findSession(session, { env, alive: alive ?? pidAlive });
            r = claim(d.shared, { ...args, ...(s?.name ? { sessionName: s.name } : {}) });
            if (r.code === EXIT.OK && s?.name && r.claim.sessionName !== s.name) r = update(d.shared, claimFile(d.shared, o.branch), r.claim, {}, Date.now(), { sessionName: s.name });
          }
        } else if (cmd === "release") {
          r = release(loc.dir, args);
          // En gammel lås fra samme session frigives også; en andens røres ikke.
          if (r.code === EXIT.OK && d.legacy && loc.dir !== d.legacy) {
            const old = readClaim(d.legacy, o.branch);
            if (old && old.session === session) release(d.legacy, args);
          }
        } else {
          r = cmd === "check" ? check(loc.dir, args) : heartbeat(loc.dir, args);
        }
        if (r.code === EXIT.OK) out(`${cmd}: ok — ${describe(r.claim, { staleHours })}`);
        else if (r.code === EXIT.UNCLAIMED) err(`${cmd}: ingen lås på ${o.branch} — kør 'claim' før du skriver`);
        else err(`${cmd}: STOP — ${describe(r.claim, { staleHours })}`);
        return r.code;
      }
      case "verify": case "push-check": case "after-push": {
        need("branch");
        if (cmd === "after-push") need("porcelain-file");
        const session = resolveSession(o.session, env);
        const loc = target(dirs(), o.branch);
        if (!loc) return EXIT.CONFLICT;
        const base = { cwd, branch: o.branch, session, remote: o.remote ?? "origin" };
        if (cmd === "verify") {
          const r = verify(loc.dir, base);
          if (r.code === EXIT.OK) out(`verify: ok — verificeret remote ${r.remoteSha}`);
          else err(r.claim ? `verify: STOP — ${describe(r.claim, { staleHours })}` : `verify: ingen lås på ${o.branch}`);
          return r.code;
        }
        const r = cmd === "push-check" ? pushCheck(loc.dir, base) : afterPush(loc.dir, { ...base, porcelain: readFileSync(o["porcelain-file"], "utf8") });
        (r.code === EXIT.OK ? out : err)(`${cmd}: ${r.code === EXIT.OK ? "ok" : "STOP"} — ${r.reason}`);
        return r.code;
      }
      case "whois": {
        need("branch");
        const r = whois(dirs(), o.branch, { env, alive: alive ?? pidAlive, parentOf: parentOf ?? parentPid, staleHours });
        (r.code === EXIT.OK ? out : err)(r.text);
        return r.code;
      }
      case "list": {
        const d = dirs();
        const all = [...list(d.shared), ...(d.legacy ? list(d.legacy).map((c) => (c.broken ? c : { ...c, legacy: true })) : [])];
        if (all.length === 0) out("ingen låse");
        for (const c of all) (c.broken ? err : out)(`${c.legacy ? "[gammel placering] " : ""}${describe(c, { staleHours })}`);
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
        try {
          const loc = locate(dirs(), o.branch);
          info = loc.conflict ? `KONFLIKT: ${loc.shared.session} / ${loc.legacy.session}` : loc.claim ? describe(loc.claim, { staleHours }) : null;
        } catch (e) { info = e.message; }
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
