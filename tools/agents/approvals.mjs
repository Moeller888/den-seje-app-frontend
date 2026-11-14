#!/usr/bin/env node
// Godkendelsesregister for Christophers GO'er — RÅDGIVENDE, ikke autoriserende.
// Dokumentation: docs/operations/agent-coordination.md (afsnit "Godkendelser").
//
// Et GO registreres KUN fra en GO-KOMMANDO: én selvstændig linje med fast grammatik, som Christopher selv har
// tastet i den registrerende Claude Code-session:
//
//   GO-KOMMANDO <merge|push|commit|pr-create> repo=EJER/REPO branch=B [pr=N] head=<40 hex|ingen> [til=<sessions-id>] [timer=1–72]
//
// Fri tekst ("Før jeg giver merge-GO …", "Du har ikke GO til merge") er aldrig et GO. Linjen afvises, hvis den
// står i indsat tekst, i et citat (">"), i en kodeblok, hvis ordet GO-KOMMANDO forekommer mere end én gang i
// beskeden, eller hvis linjen indeholder noget som helst ud over grammatikken. Tvivl = afvisning.
// Omfanget (handling, repo, branch, PR, HEAD, udfører, udløb) læses KUN fra brugerens linje — agenten angiver det
// ikke selv. Registrering udfører aldrig handlingen.
//
// Engangsbrug: id'et er afledt af beskedens tidsstempel og indhold, så samme besked kun kan registreres én gang
// (atomisk, også ved samtidige forsøg), og hvert GO kan forbruges én gang (atomisk `used`-markør).
//
// GRÆNSE (bevidst): transskript, sessionsfiler og register er filer, som samme Windows-bruger — og dermed enhver
// agent — kan skrive. Identiteten (CLAUDE_CODE_SESSION_ID bundet til processens forfædre og Claude Codes
// sessionsfil) og beskedens oprindelse kan forfalskes af en agent, der bevidst ændrer de filer. En registreret
// GO-KOMMANDO er derfor IKKE kryptografisk bevis for, hvem der skrev den. Registret stopper fejl, glemsel,
// udvidelse og genbrug — det erstatter aldrig LÆRLIG-GUARD's spørgsmål eller Christophers bekræftelse.
//
// Exitkoder: 0 ok · 1 brugsfejl · 20 intet sådant GO · 21 handling/omfang matcher ikke · 22 udløbet ·
//            23 allerede brugt · 24 HEAD har ændret sig · 25 manipuleret (register eller transskript) ·
//            26 ingen gyldig GO-KOMMANDO i en besked, brugeren selv har tastet · 27 forkert session ·
//            28 beskeden er allerede registreret · 29 sessionens identitet kan ikke bekræftes
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, linkSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { git, repoKey, verifyIdentity, remoteHead, productionEnv, ABSENT, UsageError } from "./claim.mjs";

export const AEXIT = Object.freeze({
  OK: 0, USAGE: 1, NOT_FOUND: 20, SCOPE: 21, EXPIRED: 22, USED: 23, HEAD_CHANGED: 24, TAMPERED: 25, NO_COMMAND: 26,
  WRONG_SESSION: 27, ALREADY_RECORDED: 28, IDENTITY: 29,
});
export const ADVISORY = "RÅDGIVENDE: registret erstatter ikke LÆRLIG-GUARD eller Christophers bekræftelse, og en registreret GO-KOMMANDO er ikke kryptografisk bevis for, hvem der skrev den";
export const TOKEN = "GO-KOMMANDO";
export const ACTIONS = Object.freeze(["merge", "push", "commit", "pr-create"]);
export const MAX_HOURS = 72;
const DEFAULT_HOURS = 24;
const SCHEMA = 2;
const SHA40 = /^[0-9a-f]{40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KEYS = ["repo", "branch", "pr", "head", "til", "timer"];

const home = (env) => env.USERPROFILE || homedir();
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

export function approvalsDir({ env = process.env, cwd = process.cwd(), run = git } = {}) {
  if (env.LAERLIG_APPROVALS_DIR) return resolve(env.LAERLIG_APPROVALS_DIR);
  return join(home(env), ".claude", "laerlig-approvals", repoKey(run(["config", "--get", "remote.origin.url"], cwd)));
}

export function transcriptPath(sessionId, { env = process.env } = {}) {
  const root = env.CLAUDE_PROJECTS_DIR ? resolve(env.CLAUDE_PROJECTS_DIR) : join(home(env), ".claude", "projects");
  if (!existsSync(root)) return null;
  const hits = readdirSync(root).map((d) => join(root, d, `${sessionId}.jsonl`)).filter((p) => existsSync(p));
  return hits.length === 1 ? hits[0] : null; // flere transskripter med samme id er tvetydigt → intet
}

// En besked er kun brugerens egen, når harnessen har registreret den som tastet af et menneske i netop den session.
export function isHumanTyped(o, sessionId) {
  return o?.type === "user" && o.sessionId === sessionId && o.isMeta !== true &&
    o.origin?.kind === "human" && o.promptSource === "typed" && o.turnOrigin === "human" &&
    typeof o.message?.content === "string" && typeof o.uuid === "string";
}

export function humanMessages(sessionId, { env = process.env } = {}) {
  const p = transcriptPath(sessionId, { env });
  if (!p) return [];
  const out = [];
  for (const line of readFileSync(p, "utf8").split("\n")) {
    if (!line.includes('"human"')) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    if (!isHumanTyped(o, sessionId)) continue;
    out.push({ uuid: o.uuid, timestamp: o.timestamp, content: o.message.content, sha256: sha256(o.message.content) });
  }
  return out;
}

// Indsat tekst: Claude Code pakker den ind i <pasted_content id="…"> … </pasted_content id="…">. En uafsluttet
// blok regnes som indsat til beskedens slutning.
const PASTED = /<pasted_content\b[^>]*>[\s\S]*?(?:<\/pasted_content\b[^>]*>|$)/gi;
const countToken = (s) => (String(s).match(/go-kommando/gi) ?? []).length;

// Fortolk beskeden. Returnerer { command } eller { error }. Enhver tvivl giver { error }.
export function parseGoCommand(content) {
  if (typeof content !== "string") return { error: "beskeden er ikke tekst" };
  const total = countToken(content);
  if (total === 0) return { error: `beskeden indeholder ingen ${TOKEN}-linje (fri tekst er aldrig et GO)` };
  if (total > 1) return { error: `${TOKEN} forekommer ${total} gange i beskeden — tvetydigt, afvist` };
  const typed = content.replace(PASTED, "");
  if (countToken(typed) === 0) return { error: `${TOKEN} står i indsat tekst (en log eller et tidligere GO) — afvist; skriv linjen selv` };
  let fence = false, line = null;
  for (const raw of typed.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(raw)) { fence = !fence; continue; }
    if (countToken(raw) === 0) continue;
    if (fence) return { error: `${TOKEN} står i en kodeblok — afvist` };
    if (/^\s*>/.test(raw)) return { error: `${TOKEN} står i et citat — afvist` };
    line = raw.trim();
  }
  if (line === null) return { error: `${TOKEN} står i en kodeblok — afvist` };
  const parts = line.split(/\s+/);
  if (parts[0] !== TOKEN) return { error: `linjen skal begynde med ${TOKEN} og må ikke indeholde andet end kommandoen` };
  const action = parts[1];
  if (!ACTIONS.includes(action)) return { error: `ukendt handling ${JSON.stringify(action ?? "")} (kendte: ${ACTIONS.join(", ")})` };
  const kv = {};
  for (const p of parts.slice(2)) {
    const m = /^([a-z]+)=(\S+)$/.exec(p);
    if (!m) return { error: `uventet tekst i kommandoen: ${JSON.stringify(p)} — kun nøgle=værdi er tilladt` };
    if (!KEYS.includes(m[1])) return { error: `ukendt nøgle ${m[1]}` };
    if (m[1] in kv) return { error: `nøglen ${m[1]} står to gange` };
    kv[m[1]] = m[2];
  }
  if (!kv.repo || !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]+$/.test(kv.repo)) return { error: "repo=EJER/REPO mangler eller er ugyldig" };
  if (!kv.branch || !/^[A-Za-z0-9._\/-]+$/.test(kv.branch) || kv.branch.includes("..")) return { error: "branch= mangler eller er ugyldig" };
  let pr = null;
  if (kv.pr !== undefined) {
    if (!/^#?[1-9]\d{0,6}$/.test(kv.pr)) return { error: "pr= skal være et PR-nummer" };
    pr = kv.pr.replace("#", "");
  }
  if (action === "merge" && !pr) return { error: "merge kræver pr=" };
  if (action === "pr-create" && pr) return { error: "pr-create kan ikke have pr= (PR'en findes ikke endnu)" };
  if (!kv.head) return { error: "head= mangler (forventet HEAD er obligatorisk)" };
  if (kv.head === "ingen") { if (action !== "push") return { error: "head=ingen (ny branch) gælder kun push" }; }
  else if (!SHA40.test(kv.head)) return { error: "head= skal være den fulde SHA med 40 små hex-tegn" };
  if (kv.til !== undefined && !UUID.test(kv.til)) return { error: "til= skal være et fuldt sessions-id" };
  let hours = DEFAULT_HOURS;
  if (kv.timer !== undefined) {
    if (!/^\d{1,2}$/.test(kv.timer) || Number(kv.timer) < 1 || Number(kv.timer) > MAX_HOURS) return { error: `timer= skal være 1–${MAX_HOURS}` };
    hours = Number(kv.timer);
  }
  let repo;
  try { repo = repoKey(`https://github.com/${kv.repo}.git`); } catch { return { error: "repo= er ugyldig" }; }
  return { command: { action, repo, repoName: kv.repo, branch: kv.branch, pr, head: kv.head, executor: kv.til ?? null, hours, line } };
}

// Id = beskedens tidsstempel + indhold (+ repo). Samme besked — også kopieret ind i et genoptaget transskript med
// nyt uuid — giver samme id og kan derfor kun registreres én gang.
export const approvalId = ({ repo, transcriptTimestamp, messageSha256 }) => sha256(`${repo}\n${transcriptTimestamp}\n${messageSha256}`).slice(0, 24);

const fileOf = (dir, id) => join(dir, `${id}.json`);
const usedOf = (dir, id) => join(dir, "used", `${id}.json`);

function atomicCreate(file, obj) {
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  writeFileSync(tmp, JSON.stringify(obj, null, 2) + "\n", "utf8");
  try { linkSync(tmp, file); return true; } catch (e) { if (e.code === "EEXIST") return false; throw e; } finally { try { unlinkSync(tmp); } catch { /* væk */ } }
}

const SCOPE_FIELDS = ["action", "repo", "branch", "pr", "head", "executor", "hours"];

// Registrér den GO-KOMMANDO, brugeren har tastet i DENNE session (seneste besked med kommandoen, eller --message).
// Udfører intet: skriver kun registerfilen.
export function record(dir, { messageUuid = null, repo }, { env = process.env, now = Date.now(), identity = () => verifyIdentity({ env }) } = {}) {
  const id0 = identity();
  if (!id0.ok) return { code: id0.impersonation ? AEXIT.WRONG_SESSION : AEXIT.IDENTITY, reason: id0.reason };
  const session = id0.session;
  const msgs = humanMessages(session, { env });
  const msg = messageUuid ? msgs.find((m) => m.uuid === messageUuid) : msgs.filter((m) => countToken(m.content) > 0).at(-1);
  if (!msg) return { code: AEXIT.NO_COMMAND, reason: `ingen besked med ${TOKEN}, som brugeren selv har tastet i denne session (peer-beskeder, notifikationer og modellens tekst tæller ikke)` };
  const p = parseGoCommand(msg.content);
  if (p.error) return { code: AEXIT.NO_COMMAND, reason: p.error };
  const c = p.command;
  if (c.repo !== repo) return { code: AEXIT.SCOPE, reason: `GO'et gælder repo ${c.repoName}, ikke dette repo (${repo})` };
  const ts = Date.parse(msg.timestamp);
  if (!Number.isFinite(ts)) return { code: AEXIT.TAMPERED, reason: "beskeden har intet gyldigt tidsstempel" };
  const expiresAt = new Date(ts + c.hours * 3_600_000).toISOString();
  if (Date.parse(expiresAt) <= now) return { code: AEXIT.EXPIRED, reason: `GO'et udløb ${expiresAt} (regnet fra beskedens tidspunkt)` };
  const r = {
    schema: SCHEMA, action: c.action, repo: c.repo, repoName: c.repoName, branch: c.branch, pr: c.pr, head: c.head,
    executor: c.executor, hours: c.hours, issuedBySession: session, transcriptUuid: msg.uuid, transcriptTimestamp: msg.timestamp,
    messageSha256: msg.sha256, commandLine: c.line, createdAt: new Date(now).toISOString(), expiresAt, status: "RÅDGIVENDE",
  };
  r.id = approvalId(r);
  mkdirSync(join(dir, "used"), { recursive: true });
  if (!atomicCreate(fileOf(dir, r.id), r)) return { code: AEXIT.ALREADY_RECORDED, reason: `denne besked er allerede registreret (id ${r.id}); et nyt GO kræver en ny besked fra brugeren` };
  return { code: AEXIT.OK, approval: r };
}

export function load(dir, id) {
  if (!/^[0-9a-f]{24}$/.test(String(id))) return { code: AEXIT.USAGE, reason: "ugyldigt id" };
  const f = fileOf(dir, id);
  if (!existsSync(f)) return { code: AEXIT.NOT_FOUND, reason: `intet GO med id ${id}` };
  let r;
  try { r = JSON.parse(readFileSync(f, "utf8")); } catch { return { code: AEXIT.TAMPERED, reason: "registerfilen kan ikke læses" }; }
  if (r?.id !== id || approvalId(r) !== id) return { code: AEXIT.TAMPERED, reason: "registerfilen er ændret efter oprettelsen (id passer ikke til beskeden)" };
  return { code: AEXIT.OK, approval: r };
}

export function prHead({ cwd, pr, remote = "origin", run = git }) {
  const line = run(["ls-remote", remote, `refs/pull/${pr}/head`], cwd);
  const sha = line ? line.split(/\s+/)[0] : null;
  return sha && SHA40.test(sha) ? sha : ABSENT;
}

// Kontrol uden forbrug. HEAD hentes ALTID fra remote (branchen og, for en PR, GitHubs refs/pull/N/head) — aldrig
// fra agenten. Et lokalt tjek kan ikke forhindre en ændring MELLEM kontrol og handling; se dokumentationen.
export function check(dir, id, { action, branch = null, pr = null, repo }, { env = process.env, now = Date.now(), cwd = process.cwd(), run = git, identity = () => verifyIdentity({ env }) } = {}) {
  const l = load(dir, id);
  if (l.code !== AEXIT.OK) return l;
  const r = l.approval;
  const id0 = identity();
  if (!id0.ok) return { code: id0.impersonation ? AEXIT.WRONG_SESSION : AEXIT.IDENTITY, reason: id0.reason, approval: r };
  // Den oprindelige besked skal stadig stå uændret i transskriptet, og posten skal svare PRÆCIS til den.
  const msg = humanMessages(r.issuedBySession, { env }).find((m) => m.uuid === r.transcriptUuid);
  if (!msg || msg.sha256 !== r.messageSha256 || msg.timestamp !== r.transcriptTimestamp) {
    return { code: AEXIT.TAMPERED, reason: "den citerede brugerbesked findes ikke længere uændret i transskriptet", approval: r };
  }
  const p = parseGoCommand(msg.content);
  const drift = p.error ? [p.error] : SCOPE_FIELDS.filter((k) => p.command[k] !== r[k]).map((k) => `${k}: ${JSON.stringify(r[k])} ≠ brugerens ${JSON.stringify(p.command[k])}`);
  const exp = new Date(Date.parse(r.transcriptTimestamp) + (p.command?.hours ?? 0) * 3_600_000).toISOString();
  if (!p.error && r.expiresAt !== exp) drift.push(`udløb ${r.expiresAt} ≠ ${exp}`);
  if (drift.length) return { code: AEXIT.TAMPERED, reason: `posten afviger fra brugerens GO-KOMMANDO: ${drift.join("; ")}`, approval: r };
  if (Date.parse(r.expiresAt) <= now) return { code: AEXIT.EXPIRED, reason: `udløb ${r.expiresAt}`, approval: r };
  if (existsSync(usedOf(dir, id))) return { code: AEXIT.USED, reason: "dette GO er allerede brugt", approval: r };
  const want = r.executor ?? r.issuedBySession;
  if (id0.session !== want) return { code: AEXIT.WRONG_SESSION, reason: `GO'et gælder session ${want}, ikke ${id0.session}`, approval: r };
  const mism = [];
  if (r.repo !== repo) mism.push(`repo ${repo} ≠ ${r.repo}`);
  if (action !== r.action) mism.push(`handling ${action} ≠ ${r.action}`);
  if ((branch ?? null) !== r.branch) mism.push(`branch ${branch ?? "—"} ≠ ${r.branch}`);
  if ((pr ? String(pr).replace("#", "") : null) !== r.pr) mism.push(`PR ${pr ?? "—"} ≠ ${r.pr ?? "—"}`);
  if (mism.length) return { code: AEXIT.SCOPE, reason: mism.join("; "), approval: r };
  const expected = r.head === "ingen" ? ABSENT : r.head;
  const current = remoteHead({ cwd, branch: r.branch, run });
  if (current !== expected) return { code: AEXIT.HEAD_CHANGED, reason: `remote-HEAD for ${r.branch} er ${current}, GO'et gjaldt ${r.head}`, approval: r };
  if (r.pr) {
    const ph = prHead({ cwd, pr: r.pr, run });
    if (ph !== r.head) return { code: AEXIT.HEAD_CHANGED, reason: `PR #${r.pr} peger på ${ph}, GO'et gjaldt ${r.head}`, approval: r };
  }
  return { code: AEXIT.OK, approval: r };
}

// Kontrol + atomisk forbrug: præcis ét kald kan bruge et engangs-GO, også ved samtidige forsøg. GO'et er brugt
// fra dette øjeblik — afbrydes handlingen bagefter, kræver et nyt forsøg en NY GO-KOMMANDO (se dokumentationen).
export function use(dir, id, scope, opts = {}) {
  const c = check(dir, id, scope, opts);
  if (c.code !== AEXIT.OK) return c;
  const marker = { id, usedBy: c.approval.executor ?? c.approval.issuedBySession, usedAt: new Date(opts.now ?? Date.now()).toISOString(), head: c.approval.head };
  mkdirSync(join(dir, "used"), { recursive: true });
  if (!atomicCreate(usedOf(dir, id), marker)) return { code: AEXIT.USED, reason: "dette GO er allerede brugt", approval: c.approval };
  return { code: AEXIT.OK, approval: c.approval, marker };
}

export function list(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => /^[0-9a-f]{24}\.json$/.test(f)).sort().map((f) => {
    const id = f.slice(0, 24);
    const l = load(dir, id);
    return l.code === AEXIT.OK ? { ...l.approval, used: existsSync(usedOf(dir, id)) } : { id, broken: true, reason: l.reason };
  });
}

function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const o = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith("--")) throw new UsageError(`uventet argument: ${a}`);
    const v = rest[i + 1];
    if (v === undefined || v.startsWith("--")) o[a.slice(2)] = true; else { o[a.slice(2)] = v; i++; }
  }
  return { cmd, o };
}

const USAGE = `Brug: node tools/agents/approvals.mjs <kommando>   (${ADVISORY})
  record  [--message <uuid>]      (registrér brugerens seneste ${TOKEN} i denne session; omfanget læses fra linjen)
  check   --id ID --action A --branch B [--pr N]   (kontrol uden forbrug; HEAD hentes fra remote)
  use     --id ID --action A --branch B [--pr N]   (kontrol + engangsforbrug — lige før handlingen)
  list
Brugerens linje: ${TOKEN} <${ACTIONS.join("|")}> repo=EJER/REPO branch=B [pr=N] head=<40 hex|ingen> [til=<sessions-id>] [timer=1–${MAX_HOURS}]`;

export async function main(argv = process.argv.slice(2), { env = process.env, cwd = process.cwd(), out = console.log, err = console.error, identity } = {}) {
  let p;
  try { p = parseArgs(argv); } catch (e) { err(e.message); err(USAGE); return AEXIT.USAGE; }
  const { cmd, o } = p;
  const str = (k) => (typeof o[k] === "string" ? o[k] : null);
  const ident = identity ? { identity } : {};
  try {
    const dir = approvalsDir({ env, cwd });
    const repo = repoKey(git(["config", "--get", "remote.origin.url"], cwd));
    let r;
    switch (cmd) {
      case "record": {
        const extra = ["quote", "action", "branch", "pr", "head", "executor", "hours"].filter((k) => k in o);
        if (extra.length) { err(`record: STOP — --${extra.join(", --")} er ikke tilladt: omfanget læses KUN fra brugerens ${TOKEN}`); return AEXIT.USAGE; }
        r = record(dir, { messageUuid: str("message"), repo }, { env, ...ident });
        if (r.code === AEXIT.OK) out(`record: ok — id ${r.approval.id} · ${r.approval.action} ${r.approval.branch}${r.approval.pr ? ` #${r.approval.pr}` : ""} · HEAD ${r.approval.head} · til ${r.approval.executor ?? r.approval.issuedBySession} · udløber ${r.approval.expiresAt}`);
        else err(`record: STOP — ${r.reason}`);
        out(ADVISORY);
        return r.code;
      }
      case "check": case "use": {
        if ("head" in o) { err(`${cmd}: STOP — --head er ikke tilladt: HEAD hentes fra remote`); return AEXIT.USAGE; }
        const scope = { action: str("action"), branch: str("branch"), pr: str("pr"), repo };
        r = cmd === "use" ? use(dir, str("id"), scope, { env, cwd, ...ident }) : check(dir, str("id"), scope, { env, cwd, ...ident });
        (r.code === AEXIT.OK ? out : err)(`${cmd}: ${r.code === AEXIT.OK ? "ok" : "STOP"}${r.reason ? ` — ${r.reason}` : ""}`);
        out(ADVISORY);
        return r.code;
      }
      case "list": {
        const all = list(dir);
        if (!all.length) out("ingen GO'er registreret");
        for (const a of all) (a.broken ? err : out)(a.broken ? `${a.id}: MANIPULERET/ØDELAGT — ${a.reason}` : `${a.id}: ${a.action} ${a.branch}${a.pr ? ` #${a.pr}` : ""} · HEAD ${a.head} · ${a.used ? "BRUGT" : "ubrugt"} · udløber ${a.expiresAt} · til ${a.executor ?? a.issuedBySession}`);
        out(ADVISORY);
        return all.some((a) => a.broken) ? AEXIT.TAMPERED : AEXIT.OK;
      }
      default:
        err(USAGE);
        return AEXIT.USAGE;
    }
  } catch (e) {
    err(e instanceof UsageError ? e.message : `fejl: ${e.message}`);
    return AEXIT.USAGE;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2), { env: productionEnv(process.env, console.error) });
}
