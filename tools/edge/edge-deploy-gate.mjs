// The SHARED deployment gate for the two Edge Functions whose versions must fit the database AND each other:
// get-next-question and process-event (D-383 / #740 / D-384 F8).
//
// Why a shared gate: tools/edge/gnq-deploy-preflight.mjs checks get-next-question against the database, but F8 adds a
// second dependency — between the two FUNCTIONS. F8's get-next-question parks course rounds and hands out
// `activation_no`; only F8's process-event refuses an answer from an earlier activation (409 stale_activation) and a
// parked round (409 round_parked). The rollout plan (docs/operations/laerligverse-rollout-plan.md, trin 5) therefore
// deploys process-event FIRST. Until now that order was manual. This gate makes it checkable from what really runs:
// the database's catalog (read by the tool itself) and the OTHER function's deployed source (downloaded, classified
// from its own code — never declared).
//
//   node tools/edge/edge-deploy-gate.mjs contracts
//       prints the contract registry: per function, every candidate class, the database states it is accepted on,
//       and the rules for the other function. Nothing is connected.
//   node tools/edge/edge-deploy-gate.mjs deploy --function <slug> --project-ref <ref> --expect-candidate <sha256> [--execute --record <new file>]
//       ONE run, in this order: environment (declared ref = the CLI's linked ref) → candidate (clean, committed, the
//       runbook's manifest, a COMPLETE class) → the shared local deploy lock (the same file as gnq-deploy-preflight's:
//       one Edge deploy at a time) → database (catalog + ledger, read by the tool; the state must be one the
//       candidate's class is accepted on) → the live function and the OTHER live function (version, status,
//       verify_jwt, classified source) → the pair rule. Without --execute it stops (dry run). With --execute it runs
//       the one deploy command, then checks AFTER: catalog and ledger unchanged, this function exactly one version
//       higher, ACTIVE, verify_jwt false, its source = the candidate, and the OTHER function unchanged (same version,
//       same source). The record (--record, a new file) is evidence, never an authorisation for anything later.
//
// Exit codes (as gnq-deploy-preflight): 0 ok · 1 usage · 2 NOT READY (database state, other function, class) ·
// 3 REFUSED (environment, candidate, lock, record) · 4 DEPLOYED BUT NOT VERIFIED · 5 the deploy command failed.
// Every unknown, unreadable or partial input is a refusal, never a pass. Nothing here is atomic; see
// docs/operations/edge-deploy-gate.md for what the gate cannot see.
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  DEFAULT_MAX_AGE_MIN, PROJECT_REF_RE, candidateClass as gnqClass, catalogDigest, checkCatalog, ledgerDigest,
  linkedProjectRef, lockPath, parseCatalog, parseLedger, rolloutState, stateKey, stateRefusal as gnqStateRefusal,
  catalogSql, ledgerSql, TOOL_VERSION as CATALOG_VERSION,
} from "./gnq-deploy-preflight.mjs";
import { specifiers } from "./gnq-release.mjs";
import { identify, loadRegistry } from "./edge-candidates.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const GATE_VERSION = 2;
const SHA256_RE = /^[0-9a-f]{64}$/;
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

// ---- the deployed file set: the module graph of index.ts over relative imports, plus deno.json ----

/** The graph of one function (paths relative to supabase/, sorted) — gnq-release.mjs's rule, for any slug. */
export function graphFilesFor(slug, read) {
  const entry = `functions/${slug}/index.ts`;
  const seen = new Set([entry]);
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift();
    for (const spec of specifiers(read(file))) {
      if (!spec.startsWith("./") && !spec.startsWith("../")) continue;
      const next = posix.normalize(posix.join(posix.dirname(file), spec));
      if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  return [...seen, `functions/${slug}/deno.json`].sort();
}

/** One line "<sha256>  <path>" per file; the manifest hash is the sha256 of those lines (as gnq-release.mjs). */
export function manifestFor(read, files) {
  const lines = files.map((f) => `${sha256(Buffer.from(read(f), "utf8"))}  ${f}`);
  return { files, hash: sha256(lines.join("\n") + "\n") };
}

export const treeReader = (root) => (path) => readFileSync(join(root, "supabase", path), "utf8");

// ---- the contract registry: which class a source is, and where each class may run ----

// F8's process-event: the activation check and the parked-round refusal, each wired into index.ts. Every marker is a
// CALL in index.ts (an import alone is not a check) and both modules must be in the graph.
export const PE_F8_MARKERS = Object.freeze([
  { file: "functions/process-event/round-activation.ts" },
  { file: "functions/process-event/round-parked.ts" },
  { call: "activationVerdict(" },
  { call: "activationClientHeaders(" },
  { call: "isStaleActivationError(" },
  { call: "staleActivationReply(" },
  { call: "isRoundParkedError(" },
  { call: "roundParkedReply(" },
]);
const PRE_F8_STATES = Object.freeze(["DB0", "DB1", "DB2"]);

/** process-event's MARKER class from its own source: complete F8, before F8, or INCOMPLETE (some markers only). */
export function processEventMarkers(read, files) {
  const index = files.includes("functions/process-event/index.ts") ? read("functions/process-event/index.ts") : "";
  // Comments do not count: a marker that only appears in a comment is not wired.
  const code = index.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1")).join("\n");
  const have = PE_F8_MARKERS.map((m) => (m.file ? files.includes(m.file) : new RegExp(`(^|[^\\w.])${m.call.replace("(", "\\s*\\(")}`).test(code)));
  if (have.every(Boolean)) return { kind: "F8 (D-384)", f8: true, accepts: ["DB3"] };
  if (!have.some(Boolean)) return { kind: "before F8", f8: false, accepts: [...PRE_F8_STATES] };
  const missing = PE_F8_MARKERS.filter((_, i) => !have[i]).map((m) => m.file ?? m.call.replace("(", "()"));
  return { kind: "INCOMPLETE", f8: null, accepts: [], missing };
}

/** A class with no database: refused everywhere, also as the live partner. */
const UNUSABLE = Object.freeze(["INCOMPLETE", "UNKNOWN", "CONFLICTING"]);
export const isUnusable = (cls) => UNUSABLE.includes(cls?.kind);

/**
 * process-event's class: its markers (INCOMPLETE stays INCOMPLETE), then the REVIEWED identity of its manifest
 * (tools/edge/edge-candidates.json): not reviewed → UNKNOWN, reviewed as another class → CONFLICTING.
 */
export function processEventClass(read, files, registry = loadRegistry()) {
  const m = processEventMarkers(read, files);
  if (m.kind === "INCOMPLETE") return m;
  const id = identify(registry, "process-event", manifestFor(read, files).hash, m.kind);
  if (id.verdict === "KNOWN") return m;
  return { kind: id.verdict, f8: null, accepts: [], reason: id.reason, markers: m.kind };
}

/** get-next-question's class (gnq-deploy-preflight's rule: reviewed identity + markers), in the registry's shape. */
export function getNextQuestionClass(read, files, registry = loadRegistry()) {
  const c = gnqClass(read, files, registry);
  if (c.requires === null) return { kind: c.kind, f8: null, accepts: [], requires: null, reason: c.reason, markers: c.markers };
  return { kind: c.kind, f8: c.requires === "DB3", accepts: [c.requires], requires: c.requires };
}

export const FUNCTIONS = Object.freeze({
  "get-next-question": { other: "process-event", classify: getNextQuestionClass },
  "process-event": { other: "get-next-question", classify: processEventClass },
});

export function classify(slug, read, registry = loadRegistry()) {
  const files = graphFilesFor(slug, read);
  return { files, cls: FUNCTIONS[slug].classify(read, files, registry), hash: manifestFor(read, files).hash };
}

/** Why `cls` of `slug` may not go onto database `state` (null = accepted). */
export function stateRefusal(slug, cls, state) {
  if (cls.kind === "INCOMPLETE") {
    return `${slug} candidate is INCOMPLETE: F8's activation check is only partly wired (missing: ${cls.missing.join(", ")}) — refused on every database`;
  }
  if (cls.kind === "UNKNOWN" || cls.kind === "CONFLICTING") return `${slug} candidate is ${cls.kind}: ${cls.reason} — refused on every database`;
  if (slug === "get-next-question") return gnqStateRefusal({ kind: cls.kind, requires: cls.requires }, state);
  if (cls.accepts.includes(state)) return null;
  if (state === "UNKNOWN") return "the database is not in a reviewed state";
  if (cls.f8) return `process-event ${cls.kind} reads activation_no: on ${state} (20261124160000 not applied) every answer with LAERLIGVERSE_COURSE_PARKING=on fails — it needs DB3`;
  return `process-event ${cls.kind} has no activation check: on DB3 a parked and resumed course round would accept an answer from an earlier activation (stale tab) — on DB3 only F8's process-event is accepted (docs/operations/laerligverse-rollout-plan.md, trin 5)`;
}

/** The rule between the two functions: why deploying `cls` of `slug` next to the live `other` is refused (null = ok). */
export function pairRefusal(slug, cls, other) {
  const otherSlug = FUNCTIONS[slug].other;
  if (!other || other.error) return `the live ${otherSlug} is unknown (${other?.error ?? "not read"}) — the pair cannot be checked`;
  if (other.cls.kind === "INCOMPLETE") return `the live ${otherSlug} is INCOMPLETE (missing: ${other.cls.missing.join(", ")}) — fix that first`;
  if (isUnusable(other.cls)) return `the live ${otherSlug} is ${other.cls.kind}: ${other.cls.reason} — the pair cannot be checked (a read-only owner review decides whether to register it)`;
  if (slug === "get-next-question" && cls.f8 && other.cls.f8 !== true) {
    return `get-next-question ${cls.kind} parks course rounds and hands out activation_no, but the live process-event is ${other.cls.kind}: it would accept stale answers. Deploy F8's process-event FIRST (rollout plan, trin 5.2)`;
  }
  if (slug === "process-event" && cls.f8 === false && other.cls.f8 === true) {
    return `the live get-next-question is ${other.cls.kind}: replacing process-event by ${cls.kind} removes the activation check while rounds can be parked. Roll get-next-question back first, or keep F8's process-event`;
  }
  return null;
}

// ---- the transport: the ONLY way the gate talks to Supabase. Tests inject a synthetic one. ----

export const deployArgsFor = (slug, ref) => ["functions", "deploy", slug, "--project-ref", ref, "--no-verify-jwt", "--use-api"];

/** The Supabase CLI, with explicit argument vectors and no shell; no token passes through this tool. */
export function cliTransport(root = ROOT, { bin = "supabase", run = spawnSync } = {}) {
  const cli = (args, cwd = root) => {
    const r = run(bin, args, { cwd, encoding: "utf8", maxBuffer: 1 << 26, shell: false });
    if (r.error) throw r.error;
    if (r.status !== 0) throw new Error(`supabase ${args.slice(0, 2).join(" ")} failed (exit ${r.status}): ${String(r.stderr ?? "").trim().slice(0, 400)}`);
    return r.stdout;
  };
  const query = (sql) => {
    const dir = mkdtempSync(join(tmpdir(), "edge-gate-sql-"));
    try {
      const file = join(dir, "q.sql");
      writeFileSync(file, sql);
      return JSON.parse(cli(["db", "query", "--linked", "--output", "json", "--file", file, "--workdir", root]));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  };
  return {
    kind: "supabase-cli (Management API)",
    linkedRef: () => linkedProjectRef(root),
    queryCatalog: () => query(catalogSql()),
    queryLedger: () => query(ledgerSql()),
    listFunctions: (ref) => JSON.parse(cli(["functions", "list", "--project-ref", ref, "--output-format", "json"])),
    downloadFunction: (ref, slug) => {
      const dir = mkdtempSync(join(tmpdir(), "edge-gate-live-"));
      cli(["functions", "download", slug, "--project-ref", ref, "--use-api", "--workdir", dir], dir);
      return { read: treeReader(dir), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
    },
    deploy: (ref, slug) => { cli([...deployArgsFor(slug, ref), "--workdir", root]); },
  };
}

/** One live function: version, status, verify_jwt, manifest and CLASS of its deployed source (or why not). */
export function liveFunction(transport, ref, slug, registry = loadRegistry()) {
  let list;
  try { list = transport.listFunctions(ref); } catch (e) { return { error: `function list unreadable (${e.message})` }; }
  const rows = Array.isArray(list) ? list.filter((f) => f && (f.slug === slug || f.name === slug)) : [];
  if (rows.length !== 1) return { error: `expected exactly one function ${slug} in the project, found ${rows.length}` };
  const f = rows[0];
  const version = Number(f.version);
  if (!Number.isInteger(version) || version < 1) return { error: `${slug}: live version unknown` };
  const out = { version, status: f.status ?? null, verify_jwt: f.verify_jwt ?? null };
  let dl;
  try {
    dl = transport.downloadFunction(ref, slug);
    const c = classify(slug, dl.read, registry);
    out.manifest = c.hash;
    out.cls = c.cls;
  } catch (e) {
    return { ...out, error: `${slug}: deployed source unreadable (${e.message})` };
  } finally { dl?.cleanup?.(); }
  return out;
}

// ---- git: the candidate must be committed and clean ----

const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

export function candidateIdentity(root, slug, registry = loadRegistry()) {
  const read = treeReader(root);
  const c = classify(slug, read, registry);
  const head = git(root, ["rev-parse", "HEAD"]);
  const dirty = git(root, ["status", "--porcelain", "--untracked-files=all", "--", ...c.files.map((f) => `supabase/${f}`)]);
  return { ...c, head, dirty: dirty === "" ? [] : dirty.split("\n") };
}

function takeLock(path, now, slug) {
  try {
    writeFileSync(path, JSON.stringify({ pid: process.pid, at: now.toISOString(), function: slug, tool: "edge-deploy-gate" }) + "\n", { flag: "wx" });
    return true;
  } catch (e) {
    if (e.code === "EEXIST") return false;
    throw e;
  }
}

/** Catalog + ledger through the transport, the linked ref checked before AND after, and the state rule applied. */
function databaseRead(transport, ref, now, maxAgeMin, slug, cls) {
  if (transport.linkedRef() !== ref) return { refused: `the Supabase CLI is linked to ${transport.linkedRef() ?? "no project"}, not ${ref}` };
  let catalog, ledger;
  try {
    catalog = parseCatalog(transport.queryCatalog());
    ledger = parseLedger(transport.queryLedger());
  } catch (e) { return { notReady: [`database unreadable: ${e.message}`] }; }
  if (transport.linkedRef() !== ref) return { refused: `the CLI's linked project changed during the read (now ${transport.linkedRef() ?? "none"})` };
  const state = stateKey(rolloutState(catalog));
  const problems = [];
  if (catalog.tool_version !== CATALOG_VERSION) problems.push(`catalog from tool version ${catalog.tool_version}, expected ${CATALOG_VERSION}`);
  // The read time is checked on every path, also where no full catalog review follows.
  const readAt = Date.parse(catalog.read_at);
  if (!Number.isFinite(readAt)) problems.push("catalog has no read time");
  else if (now.getTime() - readAt > maxAgeMin * 60_000) problems.push(`catalog is older than ${maxAgeMin} min`);
  else if (readAt - now.getTime() > 60_000) problems.push("catalog read time lies in the future");
  const refusal = stateRefusal(slug, cls, state);
  if (refusal) problems.push(refusal);
  // DB2 and DB3 have a reviewed expectation: the full catalog check applies. DB0/DB1 are recognised by their facts.
  else if (state === "DB2" || state === "DB3") problems.push(...checkCatalog(catalog, { now, maxAgeMin, requiredState: state }));
  return { catalog, ledger, state, problems: [...new Set(problems)] };
}

// ---- the command line ----

const ALLOWED = { contracts: [], identity: [], deploy: ["function", "project-ref", "expect-candidate", "record", "max-age-min"] };
const FLAGS = new Set(["execute"]);

function args(argv) {
  const out = { _: [], execute: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      if (FLAGS.has(k)) { out[k] = true; continue; }
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) throw new Error(`--${k} needs a value`);
      if (k in out) throw new Error(`--${k} given twice`);
      out[k] = v;
      i++;
    } else out._.push(a);
  }
  return out;
}

const USAGE = "usage: edge-deploy-gate.mjs contracts | identity | deploy --function <get-next-question|process-event> --project-ref <ref> --expect-candidate <sha256> [--execute --record <new file>]";

export function contractsText() {
  return [
    `edge-deploy-gate v${GATE_VERSION}: contract registry. A class counts only for a REVIEWED manifest (tools/edge/edge-candidates.json) whose code reads as that class; otherwise UNKNOWN or CONFLICTING → nowhere`,
    "get-next-question:",
    "  before D-383 → DB0 · D-383 (#739) → DB2 · #740 (course scope) → DB2 · F8 (D-384) → DB3",
    "  F8 needs the live process-event to be F8 (its activation check exists before the first round is parked)",
    "process-event:",
    "  before F8 → DB0, DB1, DB2 · F8 (D-384, every activation marker wired) → DB3 · INCOMPLETE → nowhere",
    `  F8 markers: ${PE_F8_MARKERS.map((m) => m.file ?? m.call.replace("(", "()")).join(", ")}`,
    "  before F8 is refused while the live get-next-question is F8",
    "both: one Edge deploy at a time (the shared lock), the other function must be unchanged by the deploy",
  ].join("\n");
}

export function main(argv, { root = ROOT, now = () => new Date(), log = console.log, err = console.error, transport, registry: injected } = {}) {
  let a;
  try { a = args(argv); } catch (e) { err(e.message); return 1; }
  const cmd = a._[0];
  if (!(cmd in ALLOWED) || a._.length !== 1) { err(USAGE); return 1; }
  const unknown = Object.keys(a).filter((k) => k !== "_" && k !== "execute" && !ALLOWED[cmd].includes(k));
  if (unknown.length > 0 || (a.execute && cmd !== "deploy")) { err(`${cmd}: not accepted: ${[...unknown, ...(a.execute && cmd !== "deploy" ? ["execute"] : [])].map((k) => `--${k}`).join(", ")}`); return 1; }
  if (cmd === "contracts") { log(contractsText()); return 0; }
  if (cmd === "identity") {
    // This checkout's two candidates: manifest, marker class and register verdict — what a reviewer registers.
    let registry;
    try { registry = injected ?? loadRegistry(); } catch (e) { err(`REFUSED: ${e.message}`); return 3; }
    const read = treeReader(root);
    for (const s of Object.keys(FUNCTIONS)) {
      const c = classify(s, read, registry);
      const markers = c.cls.markers ?? c.cls.kind;
      log(`${s}: manifest ${c.hash} (${c.files.length} files), code reads as ${markers}, register: ${isUnusable(c.cls) ? c.cls.kind : "KNOWN"}`);
    }
    return 0;
  }

  const slug = a.function;
  if (!(slug in FUNCTIONS)) { err(`deploy needs --function ${Object.keys(FUNCTIONS).join(" | ")}`); return 1; }
  const otherSlug = FUNCTIONS[slug].other;
  const ref = a["project-ref"];
  if (!PROJECT_REF_RE.test(String(ref ?? ""))) { err("deploy needs --project-ref <20-char ref>"); return 1; }
  if (!SHA256_RE.test(String(a["expect-candidate"] ?? ""))) { err("deploy needs --expect-candidate <sha256 from the runbook>"); return 1; }
  if (a.execute && !a.record) { err("--execute needs --record <new file>"); return 1; }
  const maxAgeMin = a["max-age-min"] === undefined ? DEFAULT_MAX_AGE_MIN : Number(a["max-age-min"]);
  if (!Number.isInteger(maxAgeMin) || maxAgeMin < 1 || maxAgeMin > 60) { err("--max-age-min must be 1..60"); return 1; }
  if (a.record && existsSync(a.record)) { err(`REFUSED: ${a.record} exists — a record is written once, for one deploy`); return 3; }
  const t = transport ?? cliTransport(root);
  let registry;
  try { registry = injected ?? loadRegistry(); } catch (e) { err(`REFUSED: ${e.message}`); return 3; }

  // 1. Environment.
  if (t.linkedRef() !== ref) { err(`REFUSED: the Supabase CLI is linked to ${t.linkedRef() ?? "no project"}, not ${ref}`); return 3; }
  // 2. Candidate: committed, clean, the runbook's, and a complete class.
  let cand;
  try { cand = candidateIdentity(root, slug, registry); } catch (e) { err(`REFUSED: candidate unreadable (${e.message})`); return 3; }
  if (cand.dirty.length > 0) { err("REFUSED: the candidate's files differ from the commit:\n  " + cand.dirty.join("\n  ")); return 3; }
  if (cand.hash !== a["expect-candidate"]) { err(`REFUSED: the working tree's ${slug} is candidate ${cand.hash}, not ${a["expect-candidate"]}`); return 3; }
  log(`candidate ${slug} ${cand.hash} is ${cand.cls.kind}: accepted on ${cand.cls.accepts.join(", ") || "no database"}`);
  if (isUnusable(cand.cls)) { err(`REFUSED: ${stateRefusal(slug, cand.cls, "DB3")}`); return 3; }
  // 3. The shared lock.
  let lock;
  try { lock = lockPath(root); } catch (e) { err(`REFUSED: no git directory for the lock (${e.message})`); return 3; }
  if (!takeLock(lock, now(), slug)) { err(`REFUSED: another Edge deploy holds ${lock} — wait for it; remove the file only after checking that no deploy is running`); return 3; }
  try {
    // 4. Database.
    const before = databaseRead(t, ref, now(), maxAgeMin, slug, cand.cls);
    if (before.refused) { err(`REFUSED: ${before.refused}`); return 3; }
    log(`database (${t.kind}): ${before.catalog ? rolloutState(before.catalog) : "unreadable"}`);
    const dbProblems = before.notReady ?? before.problems;
    if (dbProblems.length > 0) { err("NOT READY:\n  " + dbProblems.join("\n  ")); return 2; }
    // 5. Both live functions.
    const live = liveFunction(t, ref, slug, registry);
    if (live.error) { err(`NOT READY: ${live.error}`); return 2; }
    const other = liveFunction(t, ref, otherSlug, registry);
    log(`live ${slug}: version ${live.version} (${live.cls.kind}); live ${otherSlug}: ${other.error ? other.error : `version ${other.version} (${other.cls.kind})`}`);
    const pair = pairRefusal(slug, cand.cls, other);
    if (pair) { err(`NOT READY: ${pair}`); return 2; }
    if (other.status !== "ACTIVE") { err(`NOT READY: the live ${otherSlug} is ${other.status}, not ACTIVE`); return 2; }
    if (live.manifest === cand.hash) { log(`ALREADY DEPLOYED: ${slug} version ${live.version} is candidate ${cand.hash}; nothing to do`); return 0; }
    // 6. The candidate once more, right before the deploy.
    const again = candidateIdentity(root, slug, registry);
    if (again.hash !== cand.hash || again.dirty.length > 0 || again.head !== cand.head) { err("REFUSED: the candidate changed during the check"); return 3; }
    const command = `supabase ${deployArgsFor(slug, ref).join(" ")}`;
    if (!a.execute) {
      log(`DRY RUN OK: ${slug} live version ${live.version} → the candidate would be deployed with: ${command}`);
      log("Nothing was deployed. Run the same command with --execute --record <new file> to deploy and verify.");
      return 0;
    }
    // 7. Deploy — the one command.
    log(`deploying: ${command}`);
    try { t.deploy(ref, slug); } catch (e) { err(`DEPLOY FAILED: ${e.message}`); return 5; }
    // 8. After.
    const after = databaseRead(t, ref, now(), maxAgeMin, slug, cand.cls);
    const liveAfter = liveFunction(t, ref, slug, registry);
    const otherAfter = liveFunction(t, ref, otherSlug, registry);
    const post = [];
    if (after.refused) post.push(after.refused);
    if (after.notReady) post.push(...after.notReady);
    if (after.problems?.length) post.push(...after.problems.map((p) => `catalog now: ${p}`));
    if (after.catalog && catalogDigest(after.catalog) !== catalogDigest(before.catalog)) post.push("the database functions changed during the deploy");
    if (after.ledger && ledgerDigest(after.ledger) !== ledgerDigest(before.ledger)) post.push(`the migration ledger changed during the deploy (${before.ledger.count} → ${after.ledger.count} versions)`);
    if (liveAfter.error) post.push(liveAfter.error);
    else {
      if (liveAfter.version !== live.version + 1) post.push(`${slug} live version ${liveAfter.version}, expected exactly ${live.version + 1} (another deploy, or none)`);
      if (liveAfter.status !== "ACTIVE") post.push(`${slug} status ${liveAfter.status}, expected ACTIVE`);
      if (liveAfter.verify_jwt !== false) post.push(`${slug} verify_jwt ${liveAfter.verify_jwt}, expected false`);
      if (liveAfter.manifest !== cand.hash) post.push(`the deployed ${slug} source is ${liveAfter.manifest}, not the candidate ${cand.hash}`);
    }
    if (otherAfter.error) post.push(otherAfter.error);
    else if (otherAfter.version !== other.version || otherAfter.manifest !== other.manifest) {
      post.push(`${otherSlug} changed during the deploy (version ${other.version} → ${otherAfter.version}): the pair was not checked for that version`);
    }
    const record = {
      gate_version: GATE_VERSION, kind: "evidence, not an authorisation", function: slug, project_ref: ref, transport: t.kind,
      candidate: { sha256: cand.hash, commit: cand.head, files: cand.files.length, class: cand.cls.kind }, command,
      before: { at: before.catalog.read_at, state: rolloutState(before.catalog), catalog_sha256: catalogDigest(before.catalog), ledger: before.ledger, live: { version: live.version, manifest: live.manifest, class: live.cls.kind }, other: { function: otherSlug, version: other.version, manifest: other.manifest, class: other.cls.kind } },
      after: { at: after.catalog?.read_at ?? null, catalog_sha256: after.catalog ? catalogDigest(after.catalog) : null, ledger: after.ledger ?? null, live: { version: liveAfter.version ?? null, manifest: liveAfter.manifest ?? null, status: liveAfter.status ?? null, verify_jwt: liveAfter.verify_jwt ?? null }, other: { version: otherAfter.version ?? null, manifest: otherAfter.manifest ?? null } },
      verified: post.length === 0, problems: post, finished_at: now().toISOString(),
    };
    writeFileSync(a.record, JSON.stringify(record, null, 2) + "\n", { flag: "wx" });
    if (post.length > 0) { err("DEPLOYED BUT NOT VERIFIED — stop, report, the runbook's rollback decision applies:\n  " + post.join("\n  ")); return 4; }
    log(`DEPLOYED AND VERIFIED: ${slug} version ${liveAfter.version} = candidate ${cand.hash}; ${otherSlug} unchanged; record ${a.record}`);
    return 0;
  } finally {
    try { unlinkSync(lock); } catch { /* already gone */ }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = main(process.argv.slice(2));
