#!/usr/bin/env node
// Godkendelsesregister for Christophers GO'er — RÅDGIVENDE, ikke autoriserende.
// Dokumentation: docs/operations/agent-coordination.md (afsnit "Godkendelser").
//
// Formål: én hovedagent kan videregive et præcist afgrænset GO til en anden session, uden at nogen agent kan
// opfinde, udvide eller genbruge det. Et GO registreres KUN ud fra et ordret citat af en besked, som brugeren selv
// har TASTET i den registrerende session — genkendt i Claude Codes transskript på origin.kind "human",
// promptSource "typed" og turnOrigin "human". Beskeder fra andre sessioner ("peer"), notifikationer, accepterede
// forslag og modellens egne svar tæller aldrig.
//
// Afgrænsning: handling, repo, branch eller PR, forventet HEAD og eventuel udførende session er faste felter, og
// hvert felt skal stå bogstaveligt i det citerede GO. Et GO kan bruges én gang (atomisk forbrug) og udløber.
//
// GRÆNSE (bevidst): transskriptet er en fil på maskinen. En agent med skriveadgang dertil kan forfalske det. Derfor
// er registret rådgivende: det stopper fejl, glemsel og udvidelse, men erstatter aldrig LÆRLIG-GUARD's spørgsmål
// eller Christophers egen bekræftelse. Den stærkere, ikke-forfalskelige vej (en UserPromptSubmit-hook, som kun
// harnessen kan køre, der signerer GO'et) er beskrevet i dokumentationen og kræver ejerens GO til en hook.
//
// Exitkoder: 0 ok · 1 brugsfejl · 20 intet sådant GO · 21 handling/omfang matcher ikke · 22 udløbet ·
//            23 allerede brugt · 24 HEAD har ændret sig · 25 manipuleret (register eller transskript) ·
//            26 citatet findes ikke i en besked, brugeren selv har tastet · 27 forkert session
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, linkSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { git, repoKey, resolveSession, findSession, remoteHead, ABSENT, UsageError } from "./claim.mjs";

export const AEXIT = Object.freeze({
  OK: 0, USAGE: 1, NOT_FOUND: 20, SCOPE: 21, EXPIRED: 22, USED: 23, HEAD_CHANGED: 24, TAMPERED: 25, NOT_IN_TRANSCRIPT: 26, WRONG_SESSION: 27,
});
export const ADVISORY = "RÅDGIVENDE: registret erstatter ikke LÆRLIG-GUARD eller Christophers bekræftelse";
export const MAX_HOURS = 72;
const DEFAULT_HOURS = 24;
const SCHEMA = 1;

// Handlinger og de ord, der skal stå i brugerens GO for at dække dem.
export const ACTIONS = Object.freeze({
  merge: /\bmerge\b/i,
  push: /\bpush/i,
  commit: /\bcommit/i,
  "pr-create": /\b(?:opret\w*|create)\b[^.\n]{0,40}\bPR\b|\bny PR\b|\bnew PR\b/i,
});

const home = (env) => env.USERPROFILE || env.HOME || homedir();
const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const norm = (s) => String(s).replace(/\s+/g, " ").trim();

export function approvalsDir({ env = process.env, cwd = process.cwd(), run = git } = {}) {
  if (env.LAERLIG_APPROVALS_DIR) return resolve(env.LAERLIG_APPROVALS_DIR);
  return join(home(env), ".claude", "laerlig-approvals", repoKey(run(["config", "--get", "remote.origin.url"], cwd)));
}

export function transcriptPath(sessionId, { env = process.env } = {}) {
  const root = env.CLAUDE_PROJECTS_DIR ? resolve(env.CLAUDE_PROJECTS_DIR) : join(home(env), ".claude", "projects");
  if (!existsSync(root)) return null;
  for (const d of readdirSync(root)) {
    const p = join(root, d, `${sessionId}.jsonl`);
    if (existsSync(p)) return p;
  }
  return null;
}

// En besked er kun brugerens egen, når harnessen har registreret den som tastet af et menneske i netop den session.
export function isHumanTyped(o, sessionId) {
  return o?.type === "user" && o.sessionId === sessionId && o.isMeta !== true &&
    o.origin?.kind === "human" && o.promptSource === "typed" && o.turnOrigin === "human" &&
    typeof o.message?.content === "string";
}

export function findHumanMessage(sessionId, quote, { env = process.env, uuid = null } = {}) {
  const p = transcriptPath(sessionId, { env });
  if (!p) return null;
  const q = norm(quote);
  let hit = null;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    if (!line.includes('"human"')) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    if (!isHumanTyped(o, sessionId)) continue;
    if (uuid && o.uuid !== uuid) continue;
    if (!norm(o.message.content).includes(q)) continue;
    hit = { uuid: o.uuid, timestamp: o.timestamp, sha256: sha256(o.message.content) }; // den seneste vinder
  }
  return hit;
}

const FIELDS = ["schema", "repo", "action", "branch", "pr", "expectedHead", "executor", "issuedBySession", "transcriptUuid", "transcriptTimestamp", "messageSha256", "quote", "createdAt", "expiresAt", "nonce"];
const canonical = (r) => JSON.stringify(FIELDS.map((k) => [k, r[k] ?? null]));
export const approvalId = (r) => sha256(canonical(r)).slice(0, 24);

// Hvert felt i omfanget skal stå bogstaveligt i brugerens GO — ellers er det en udvidelse.
export function scopeProblems(quote, { action, branch, pr, expectedHead, executor, executorName }) {
  const q = norm(quote);
  const p = [];
  if (!/\bGO\b/.test(q)) p.push('citatet indeholder ikke "GO"');
  if (!ACTIONS[action]) p.push(`ukendt handling ${JSON.stringify(action)} (kendte: ${Object.keys(ACTIONS).join(", ")})`);
  else if (!ACTIONS[action].test(q)) p.push(`handlingen "${action}" står ikke i citatet`);
  if (!branch && !pr) p.push("hverken branch eller PR er angivet");
  if (branch && !q.includes(branch)) p.push(`branchen ${branch} står ikke i citatet`);
  if (pr && !new RegExp(`#${pr}\\b`).test(q)) p.push(`PR #${pr} står ikke i citatet`);
  if (expectedHead) {
    if (!/^[0-9a-f]{7,40}$/.test(expectedHead)) p.push("forventet HEAD skal være 7–40 hex-tegn");
    else if (!q.includes(expectedHead)) p.push(`HEAD ${expectedHead} står ikke i citatet`);
  }
  if (executor && !(q.includes(executor.slice(0, 8)) || (executorName && q.includes(executorName)))) {
    p.push(`den udførende session (${executorName ?? executor}) er ikke nævnt i citatet`);
  }
  return p;
}

const fileOf = (dir, id) => join(dir, `${id}.json`);
const usedOf = (dir, id) => join(dir, "used", `${id}.json`);

function atomicCreate(file, obj) {
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  writeFileSync(tmp, JSON.stringify(obj, null, 2) + "\n", "utf8");
  try { linkSync(tmp, file); return true; } catch (e) { if (e.code === "EEXIST") return false; throw e; } finally { try { unlinkSync(tmp); } catch { /* væk */ } }
}

export function record(dir, { quote, action, branch = null, pr = null, expectedHead = null, executor = null, hours = DEFAULT_HOURS, repo }, { env = process.env, now = Date.now() } = {}) {
  const session = resolveSession(undefined, env);
  if (!quote || norm(quote).length < 20) return { code: AEXIT.USAGE, reason: "citatet er for kort (mindst 20 tegn ordret fra brugerens besked)" };
  if (!(hours > 0 && hours <= MAX_HOURS)) return { code: AEXIT.USAGE, reason: `udløb skal være 0–${MAX_HOURS} timer` };
  const executorName = executor ? findSession(executor, { env })?.name ?? null : null;
  const problems = scopeProblems(quote, { action, branch, pr: pr ? String(pr) : null, expectedHead, executor, executorName });
  if (problems.length) return { code: AEXIT.SCOPE, reason: problems.join("; ") };
  const msg = findHumanMessage(session, quote, { env });
  if (!msg) return { code: AEXIT.NOT_IN_TRANSCRIPT, reason: "citatet findes ikke i en besked, brugeren selv har tastet i denne session (peer-beskeder, notifikationer og modellens tekst tæller ikke)" };
  const r = {
    schema: SCHEMA, repo, action, branch, pr: pr ? String(pr) : null, expectedHead, executor, issuedBySession: session,
    transcriptUuid: msg.uuid, transcriptTimestamp: msg.timestamp, messageSha256: msg.sha256, quote: norm(quote),
    createdAt: new Date(now).toISOString(), expiresAt: new Date(now + hours * 3_600_000).toISOString(),
    nonce: randomBytes(8).toString("hex"),
  };
  r.id = approvalId(r);
  mkdirSync(join(dir, "used"), { recursive: true });
  if (!atomicCreate(fileOf(dir, r.id), { ...r, status: "RÅDGIVENDE" })) return { code: AEXIT.USAGE, reason: "id-kollision; prøv igen" };
  return { code: AEXIT.OK, approval: r };
}

export function load(dir, id) {
  if (!/^[0-9a-f]{24}$/.test(String(id))) return { code: AEXIT.USAGE, reason: "ugyldigt id" };
  const f = fileOf(dir, id);
  if (!existsSync(f)) return { code: AEXIT.NOT_FOUND, reason: `intet GO med id ${id}` };
  let r;
  try { r = JSON.parse(readFileSync(f, "utf8")); } catch { return { code: AEXIT.TAMPERED, reason: "registerfilen kan ikke læses" }; }
  if (r?.id !== id || approvalId(r) !== id) return { code: AEXIT.TAMPERED, reason: "registerfilen er ændret efter oprettelsen (id passer ikke til indholdet)" };
  return { code: AEXIT.OK, approval: r };
}

// Kontrol uden forbrug. `head` er den aktuelle HEAD for branchen (hentes fra remote, hvis den ikke angives).
export function check(dir, id, { action, branch = null, pr = null, head = null, repo }, { env = process.env, now = Date.now(), cwd = process.cwd(), run = git } = {}) {
  const l = load(dir, id);
  if (l.code !== AEXIT.OK) return l;
  const r = l.approval;
  const session = resolveSession(undefined, env);
  const msg = findHumanMessage(r.issuedBySession, r.quote, { env, uuid: r.transcriptUuid });
  if (!msg || msg.sha256 !== r.messageSha256) return { code: AEXIT.TAMPERED, reason: "den citerede brugerbesked findes ikke længere uændret i transskriptet", approval: r };
  // Postens omfang skal STADIG stå i det ægte citat: en post med ændret handling/PR/branch/HEAD/udfører og
  // genberegnet id afvises her, selv om id'et passer til indholdet.
  const executorName = r.executor ? findSession(r.executor, { env })?.name ?? null : null;
  const drift = scopeProblems(r.quote, { action: r.action, branch: r.branch, pr: r.pr, expectedHead: r.expectedHead, executor: r.executor, executorName });
  if (drift.length) return { code: AEXIT.TAMPERED, reason: `posten dækker mere end brugerens GO: ${drift.join("; ")}`, approval: r };
  if (Date.parse(r.expiresAt) <= now) return { code: AEXIT.EXPIRED, reason: `udløb ${r.expiresAt}`, approval: r };
  if (existsSync(usedOf(dir, id))) return { code: AEXIT.USED, reason: "dette GO er allerede brugt", approval: r };
  const want = r.executor ?? r.issuedBySession;
  if (session !== want) return { code: AEXIT.WRONG_SESSION, reason: `GO'et gælder session ${want}, ikke ${session}`, approval: r };
  const mism = [];
  if (r.repo !== repo) mism.push(`repo ${repo} ≠ ${r.repo}`);
  if (action !== r.action) mism.push(`handling ${action} ≠ ${r.action}`);
  if ((branch ?? null) !== (r.branch ?? null)) mism.push(`branch ${branch ?? "—"} ≠ ${r.branch ?? "—"}`);
  if ((pr ? String(pr) : null) !== r.pr) mism.push(`PR ${pr ?? "—"} ≠ ${r.pr ?? "—"}`);
  if (mism.length) return { code: AEXIT.SCOPE, reason: mism.join("; "), approval: r };
  if (r.expectedHead) {
    let current = head;
    if (!current) {
      if (!r.branch) return { code: AEXIT.USAGE, reason: "angiv --head (GO'et har en forventet HEAD og ingen branch at slå op)", approval: r };
      current = remoteHead({ cwd, branch: r.branch, run });
    }
    if (current === ABSENT || !String(current).startsWith(r.expectedHead)) {
      return { code: AEXIT.HEAD_CHANGED, reason: `HEAD er ${current}, GO'et gjaldt ${r.expectedHead}`, approval: r };
    }
  }
  return { code: AEXIT.OK, approval: r };
}

// Kontrol + atomisk forbrug: præcis ét kald kan bruge et engangs-GO, også ved samtidige forsøg.
export function use(dir, id, scope, opts = {}) {
  const c = check(dir, id, scope, opts);
  if (c.code !== AEXIT.OK) return c;
  const marker = { id, usedBy: resolveSession(undefined, opts.env ?? process.env), usedAt: new Date(opts.now ?? Date.now()).toISOString(), head: scope.head ?? null };
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
  record  --quote "<ordret fra brugerens tastede besked>" --action merge|push|commit|pr-create
          [--branch B] [--pr N] [--head SHA] [--executor <sessions-id>] [--hours H]
  check   --id ID --action A [--branch B] [--pr N] [--head SHA]   (kontrol uden forbrug)
  use     --id ID --action A [--branch B] [--pr N] [--head SHA]   (kontrol + engangsforbrug)
  list`;

export async function main(argv = process.argv.slice(2), { env = process.env, cwd = process.cwd(), out = console.log, err = console.error } = {}) {
  let p;
  try { p = parseArgs(argv); } catch (e) { err(e.message); err(USAGE); return AEXIT.USAGE; }
  const { cmd, o } = p;
  const str = (k) => (typeof o[k] === "string" ? o[k] : null);
  try {
    const dir = approvalsDir({ env, cwd });
    const repo = repoKey(git(["config", "--get", "remote.origin.url"], cwd));
    let r;
    switch (cmd) {
      case "record":
        r = record(dir, { quote: str("quote"), action: str("action"), branch: str("branch"), pr: str("pr"), expectedHead: str("head"), executor: str("executor"), hours: o.hours ? Number(o.hours) : DEFAULT_HOURS, repo }, { env });
        if (r.code === AEXIT.OK) { out(`record: ok — id ${r.approval.id} · ${r.approval.action} ${r.approval.branch ?? ""}${r.approval.pr ? ` #${r.approval.pr}` : ""} · udløber ${r.approval.expiresAt}`); out(ADVISORY); }
        else err(`record: STOP — ${r.reason}`);
        return r.code;
      case "check": case "use": {
        const scope = { action: str("action"), branch: str("branch"), pr: str("pr"), head: str("head"), repo };
        r = cmd === "use" ? use(dir, str("id"), scope, { env, cwd }) : check(dir, str("id"), scope, { env, cwd });
        (r.code === AEXIT.OK ? out : err)(`${cmd}: ${r.code === AEXIT.OK ? "ok" : "STOP"}${r.reason ? ` — ${r.reason}` : ""}`);
        out(ADVISORY);
        return r.code;
      }
      case "list": {
        const all = list(dir);
        if (!all.length) out("ingen GO'er registreret");
        for (const a of all) (a.broken ? err : out)(a.broken ? `${a.id}: MANIPULERET/ØDELAGT — ${a.reason}` : `${a.id}: ${a.action} ${a.branch ?? ""}${a.pr ? ` #${a.pr}` : ""} · ${a.used ? "BRUGT" : "ubrugt"} · udløber ${a.expiresAt} · til ${a.executor ?? a.issuedBySession}`);
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
  process.exitCode = await main();
}
