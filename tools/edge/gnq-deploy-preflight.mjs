// Deployment gate for the get-next-question Edge Function (D-383 + its follow-up 20261123100000).
//
// Why: the version matrix (tests/unit/course-items-version-matrix.test.mjs) proved that deploying the new
// get-next-question BEFORE migrations 20261120150000 and 20261123100000 destroys course rounds (an old repeat body
// reopens an answered course round; the old release deletes an open one). Edge deploys are manual, so nothing technical
// stopped that order. This tool makes the order checkable from what the DATABASE really runs — never from the
// migration ledger's version numbers alone (apply_migration records its own timestamps).
//
//   node tools/edge/gnq-deploy-preflight.mjs sql
//       prints the two read-only SELECTs the tool runs (catalog: pg_proc only; ledger: migration versions). Nothing
//       is connected.
//   node tools/edge/gnq-deploy-preflight.mjs deploy --project-ref <ref> --expect-candidate <sha256> [--execute --record <new file>]
//       ONE run: environment (declared ref = the CLI's linked ref), candidate (clean, committed tree whose manifest is
//       the runbook's), a local deploy lock, then the catalog and ledger read BY THE TOOL ITSELF over the Supabase
//       CLI's Management API connection to that project, and the live function's version and source. Without
//       --execute it stops there (dry run) and prints the one command. With --execute it deploys exactly that
//       command, then checks AFTER: the catalog and ledger are unchanged, the live version is exactly one higher,
//       ACTIVE, verify_jwt false, and the deployed source is the candidate. The record (--record, a new file) is
//       evidence of what was checked, never an authorisation for anything later.
//   node tools/edge/gnq-deploy-preflight.mjs check-offline --catalog <result.json>
//       WEAKER, diagnostic only: validates a catalog result someone ran by hand. It cannot know which database
//       produced the file, so it never writes anything and nothing accepts its output for a deploy.
//
// Exit codes: 0 ok (dry run passed / deployed and verified / already deployed) · 1 usage · 2 NOT READY (database
// state, signature, hash, grant) · 3 REFUSED (environment, candidate, lock, record) · 4 DEPLOYED BUT NOT VERIFIED
// (the after-check failed: stop, report, the runbook's rollback decision applies) · 5 the deploy command failed.
// Every unknown or unparsable input is a refusal, never a pass. Nothing here is atomic: see
// docs/operations/gnq-deploy-gate.md for the windows that remain.
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { graphFiles, manifest, workingTreeReader } from "./gnq-release.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const TOOL_VERSION = 2;
export const FUNCTION_SLUG = "get-next-question";
export const DEFAULT_MAX_AGE_MIN = 15;

// What the database must run before this candidate may be deployed: the bodies of 20261120150000 (D-383) and
// 20261123100000 (course scope), measured on PGlite from the unmodified files (gnq-deploy-preflight.test.mjs proves
// these equal what the migrations leave). md5(prosrc) is the body text verbatim, the same on every PostgreSQL version.
const BACKEND_ONLY = { required: ["service_role"], forbidden: ["PUBLIC", "anon", "authenticated"] };
export const REQUIRED_FUNCTIONS = Object.freeze([
  { sig: "public.question_is_course_item(jsonb)", md5: "00cc41a03b3f5070789fe5442fddf5cc", definer: false, volatility: "i", config: ["search_path=public, pg_temp"], ...BACKEND_ONLY },
  { sig: "public.get_level_questions_for_student(uuid,integer,text[],integer)", md5: "8a48fc8ad4268eae0e4e9299d9f8be07", definer: false, volatility: "s", config: ["search_path=public, pg_temp", "plan_cache_mode=force_custom_plan"], ...BACKEND_ONLY },
  { sig: "public.request_repeat_question_for_student(uuid,smallint,text[])", md5: "c14b90ccd4d05e12473083b072eaefba", definer: true, volatility: "v", config: ["search_path=public, pg_temp"], ...BACKEND_ONLY },
  { sig: "public.request_repeat_question_servable_for_student(uuid,smallint,text[])", md5: "b23d72a1d167a94246e5b7243c25cdbd", definer: true, volatility: "v", config: ["search_path=public, pg_temp"], ...BACKEND_ONLY },
  { sig: "public.request_repeat_level_question_for_student(uuid,text[])", md5: "410d0ab6fb67c329a573cf3f73973921", definer: false, volatility: "v", config: ["search_path=public, pg_temp"], ...BACKEND_ONLY },
  // The pupil's own client calls this one (with the pupil's JWT): authenticated must keep EXECUTE, anon never.
  { sig: "public.release_open_question_outside(text[])", md5: "e52e69fa3374a5838293977f0057b34d", definer: true, volatility: "v", config: ["search_path=public"], required: ["authenticated"], forbidden: ["PUBLIC", "anon"] },
  { sig: "public.get_unserved_questions_for_student(uuid,smallint,text[],text)", md5: "395001c3deec3fb24408c3a769e0b5f5", definer: true, volatility: "s", config: ["search_path=public, pg_temp"], ...BACKEND_ONLY },
  { sig: "public.get_question_candidates_for_student(uuid,smallint,text[],integer,text)", md5: "1430439742fc272b1e372adc7761d2f5", definer: true, volatility: "s", config: ["search_path=public, pg_temp"], ...BACKEND_ONLY },
]);
// 20261123100000 drops these; if either still exists, PostgREST sees two candidates for one name.
export const ABSENT_FUNCTIONS = Object.freeze([
  "public.get_unserved_questions_for_student(uuid,smallint,text[])",
  "public.get_question_candidates_for_student(uuid,smallint,text[],integer)",
]);
// Exactly one function per name (PostgREST resolves by name and named arguments).
export const SINGLE_NAMES = Object.freeze([...new Set(REQUIRED_FUNCTIONS.map((f) => f.sig.replace(/^public\./, "").replace(/\(.*$/, "")))]);
// The bodies production runs today (the "before" of both migrations), only to NAME the state in a refusal.
const BEFORE = Object.freeze({
  "public.get_level_questions_for_student(uuid,integer,text[],integer)": "9e5862b287f6f41066eb876667c426a7",
  "public.request_repeat_question_for_student(uuid,smallint,text[])": "2ac19e786310b59051a44aed96b5bf46",
  "public.request_repeat_question_servable_for_student(uuid,smallint,text[])": "092555368551a096c29d6e60f58c17b1",
  "public.release_open_question_outside(text[])": "b80c1c7857ecc90bdbd7b6175b65c78f",
  "public.request_repeat_level_question_for_student(uuid,text[])": "db8280ddee20254e876be7fb1fc57e4d",
});

export const PROJECT_REF_RE = /^[a-z0-9]{20}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const quote = (s) => `'${String(s).replace(/'/g, "''")}'`;
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

/** The read-only catalog query (pg_proc only, no table rows, no pupil data). */
export function catalogSql() {
  const sigs = [...REQUIRED_FUNCTIONS.map((f) => f.sig), ...ABSENT_FUNCTIONS];
  return `-- gnq-deploy-preflight v${TOOL_VERSION}: READ-ONLY catalog check (pg_proc only, no table rows).
SELECT json_build_object(
  'tool_version', ${TOOL_VERSION},
  'read_at', now(),
  'server_version_num', current_setting('server_version_num'),
  'functions', (
    SELECT coalesce(json_agg(x ORDER BY x.sig), '[]'::json) FROM (
      SELECT s.sig,
             p.oid IS NOT NULL AS present,
             md5(p.prosrc) AS md5,
             p.prosecdef AS definer,
             p.provolatile::text AS volatility,
             p.proconfig AS config,
             (SELECT coalesce(array_agg(DISTINCT CASE WHEN e.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(e.grantee) END), '{}')
                FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) e
               WHERE e.privilege_type = 'EXECUTE') AS execute_grantees
        FROM unnest(ARRAY[${sigs.map(quote).join(", ")}]::text[]) AS s(sig)
        LEFT JOIN pg_catalog.pg_proc p ON p.oid = to_regprocedure(s.sig)
    ) x),
  'name_counts', (
    SELECT coalesce(json_object_agg(n.name, (SELECT count(*) FROM pg_catalog.pg_proc p
                                               WHERE p.pronamespace = 'public'::regnamespace AND p.proname = n.name)), '{}'::json)
      FROM unnest(ARRAY[${SINGLE_NAMES.map(quote).join(", ")}]::text[]) AS n(name))
) AS preflight;`;
}

/** The read-only migration-ledger query: only the version column, summarised. A migration applied between the
 * before- and the after-read changes it (count, latest or digest), whatever its timestamp. */
export function ledgerSql() {
  return `-- gnq-deploy-preflight v${TOOL_VERSION}: READ-ONLY migration ledger (versions only).
SELECT json_build_object(
  'count', count(*),
  'latest', max(version),
  'versions_md5', md5(coalesce(string_agg(version, ',' ORDER BY version), ''))
) AS ledger FROM supabase_migrations.schema_migrations;`;
}

/** One-row JSON results come back as the object, {col: …}, [{col: …}], or a JSON string of any of those. */
function unwrapOne(raw, column) {
  let v = raw;
  if (typeof v === "string") v = JSON.parse(v);
  if (v && !Array.isArray(v) && typeof v === "object" && Array.isArray(v.rows)) v = v.rows;
  if (Array.isArray(v)) {
    if (v.length !== 1) throw new Error(`expected exactly one row, got ${v.length}`);
    v = v[0];
  }
  if (v && typeof v === "object" && column in v) v = v[column];
  if (typeof v === "string") v = JSON.parse(v);
  return v;
}

export function parseCatalog(raw) {
  const v = unwrapOne(raw, "preflight");
  if (!v || typeof v !== "object" || !Array.isArray(v.functions) || !v.name_counts || typeof v.name_counts !== "object") {
    throw new Error("catalog: not a gnq-deploy-preflight result");
  }
  return v;
}

export function parseLedger(raw) {
  const v = unwrapOne(raw, "ledger");
  if (!v || typeof v !== "object" || !Number.isInteger(Number(v.count)) || typeof v.versions_md5 !== "string") {
    throw new Error("ledger: not a gnq-deploy-preflight ledger result");
  }
  return { count: Number(v.count), latest: v.latest ?? null, versions_md5: v.versions_md5 };
}

const sameSet = (a, b) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);

/** The rollout state the catalog shows, by the md5s alone (for the report); readiness is decided by checkCatalog. */
export function rolloutState(catalog) {
  const by = new Map(catalog.functions.map((f) => [f.sig, f]));
  const isAfter = (sig) => by.get(sig)?.present === true && by.get(sig).md5 === REQUIRED_FUNCTIONS.find((r) => r.sig === sig).md5;
  const d383Sigs = Object.keys(BEFORE);
  const d383After = d383Sigs.every(isAfter) && isAfter("public.question_is_course_item(jsonb)");
  const d383Before = d383Sigs.every((s) => by.get(s)?.present === true && by.get(s).md5 === BEFORE[s]) && by.get("public.question_is_course_item(jsonb)")?.present !== true;
  const scopeAfter = isAfter("public.get_unserved_questions_for_student(uuid,smallint,text[],text)")
    && isAfter("public.get_question_candidates_for_student(uuid,smallint,text[],integer,text)");
  const scopeBefore = ABSENT_FUNCTIONS.every((s) => by.get(s)?.present === true)
    && by.get("public.get_unserved_questions_for_student(uuid,smallint,text[],text)")?.present !== true;
  if (d383Before && scopeBefore) return "DB0 (neither migration)";
  if (d383After && scopeBefore) return "DB1 (20261120150000 only)";
  if (d383After && scopeAfter) return "DB2 (both migrations)";
  return "UNKNOWN (not a reviewed state)";
}

/** Every reason this database may NOT receive the candidate; [] = ready. */
export function checkCatalog(catalog, { now = new Date(), maxAgeMin = DEFAULT_MAX_AGE_MIN } = {}) {
  const problems = [];
  if (catalog.tool_version !== TOOL_VERSION) problems.push(`catalog from tool version ${catalog.tool_version}, expected ${TOOL_VERSION}`);
  const readAt = Date.parse(catalog.read_at);
  if (!Number.isFinite(readAt)) problems.push("catalog has no read time");
  else if (now.getTime() - readAt > maxAgeMin * 60_000) problems.push(`catalog is older than ${maxAgeMin} min`);
  else if (readAt - now.getTime() > 60_000) problems.push("catalog read time lies in the future");
  const by = new Map();
  for (const f of catalog.functions) {
    if (by.has(f.sig)) problems.push(`catalog lists ${f.sig} twice`);
    by.set(f.sig, f);
  }
  for (const r of REQUIRED_FUNCTIONS) {
    const f = by.get(r.sig);
    if (!f) { problems.push(`${r.sig}: not in the catalog result`); continue; }
    if (f.present !== true) { problems.push(`${r.sig}: missing in the database`); continue; }
    if (f.md5 !== r.md5) problems.push(`${r.sig}: body md5 ${f.md5}, expected ${r.md5}${BEFORE[r.sig] === f.md5 ? " (still the body before D-383)" : ""}`);
    if (f.definer !== r.definer) problems.push(`${r.sig}: SECURITY ${f.definer ? "DEFINER" : "INVOKER"}, expected ${r.definer ? "DEFINER" : "INVOKER"}`);
    if (f.volatility !== r.volatility) problems.push(`${r.sig}: volatility ${f.volatility}, expected ${r.volatility}`);
    if (!Array.isArray(f.config) || !sameSet(f.config, r.config)) problems.push(`${r.sig}: config ${JSON.stringify(f.config)}, expected ${JSON.stringify(r.config)}`);
    const grantees = Array.isArray(f.execute_grantees) ? f.execute_grantees : null;
    if (!grantees) problems.push(`${r.sig}: EXECUTE grantees unknown`);
    else {
      for (const g of r.required) if (!grantees.includes(g)) problems.push(`${r.sig}: ${g} lacks EXECUTE`);
      for (const g of r.forbidden) if (grantees.includes(g)) problems.push(`${r.sig}: ${g} has EXECUTE`);
    }
  }
  for (const sig of ABSENT_FUNCTIONS) {
    const f = by.get(sig);
    if (!f) problems.push(`${sig}: not in the catalog result`);
    else if (f.present !== false) problems.push(`${sig}: still exists (20261123100000 not applied)`);
  }
  for (const name of SINGLE_NAMES) {
    const n = Number(catalog.name_counts[name]);
    if (n !== 1) problems.push(`public.${name}: ${Number.isFinite(n) ? n : "unknown"} functions with this name, expected exactly 1`);
  }
  return problems;
}

/** The facts of the catalog that must not change between the before- and the after-read (time excluded). */
export const catalogDigest = (catalog) => sha256(JSON.stringify({
  functions: [...catalog.functions].sort((a, b) => (a.sig < b.sig ? -1 : 1)),
  name_counts: Object.fromEntries(Object.keys(catalog.name_counts).sort().map((k) => [k, catalog.name_counts[k]])),
}));
export const ledgerDigest = (ledger) => sha256(JSON.stringify([ledger.count, ledger.latest, ledger.versions_md5]));

export function candidateHash(read = workingTreeReader(ROOT)) {
  return manifest(read, graphFiles(read)).hash;
}

/** The project the CLI is linked to (supabase/.temp/project-ref), or null. */
export function linkedProjectRef(root = ROOT) {
  const p = join(root, "supabase", ".temp", "project-ref");
  if (!existsSync(p)) return null;
  const v = readFileSync(p, "utf8").trim();
  return PROJECT_REF_RE.test(v) ? v : null;
}

/** The one deploy command (argument vector). verify_jwt false: the browser's OPTIONS preflight needs it. */
export const deployArgs = (ref) => ["functions", "deploy", FUNCTION_SLUG, "--project-ref", ref, "--no-verify-jwt", "--use-api"];

// ---- git: the candidate must be committed and clean, not merely "the bytes on disk right now" ----

const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/** The candidate's identity: HEAD commit, the graph files, and every graph path that differs from HEAD (must be none). */
export function candidateIdentity(root) {
  const read = workingTreeReader(root);
  const files = graphFiles(read);
  const hash = manifest(read, files).hash;
  const head = git(root, ["rev-parse", "HEAD"]);
  const dirty = git(root, ["status", "--porcelain", "--untracked-files=all", "--", ...files.map((f) => `supabase/${f}`)]);
  return { head, files, hash, dirty: dirty === "" ? [] : dirty.split("\n") };
}

// ---- a local lock: one deploy at a time from this clone and its worktrees ----

export function lockPath(root) {
  const common = git(root, ["rev-parse", "--git-common-dir"]);
  return join(isAbsolute(common) ? common : join(root, common), "laerlig-gnq-deploy.lock");
}

function takeLock(path, now) {
  try {
    writeFileSync(path, JSON.stringify({ pid: process.pid, at: now.toISOString() }) + "\n", { flag: "wx" });
    return true;
  } catch (e) {
    if (e.code === "EEXIST") return false;
    throw e;
  }
}

// ---- the transport: the ONLY way the tool talks to Supabase. Tests inject a synthetic one. ----

/** The real transport is the Supabase CLI: `db query --linked` runs the SQL through the Management API on the
 * project the CLI is linked to; `functions list/download/deploy` take the ref explicitly. No token passes through
 * this tool. */
export function cliTransport(root = ROOT, { bin = "supabase", run = spawnSync } = {}) {
  const cli = (args, cwd = root) => {
    // No shell: paths may contain spaces, and nothing here may be re-parsed as a command line.
    const r = run(bin, args, { cwd, encoding: "utf8", maxBuffer: 1 << 26, shell: false });
    if (r.error) throw r.error;
    if (r.status !== 0) throw new Error(`supabase ${args.slice(0, 2).join(" ")} failed (exit ${r.status}): ${String(r.stderr ?? "").trim().slice(0, 400)}`);
    return r.stdout;
  };
  const query = (sql) => {
    const dir = mkdtempSync(join(tmpdir(), "gnq-gate-sql-"));
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
    downloadFunction: (ref) => {
      const dir = mkdtempSync(join(tmpdir(), "gnq-gate-live-"));
      cli(["functions", "download", FUNCTION_SLUG, "--project-ref", ref, "--use-api", "--workdir", dir], dir);
      return { read: workingTreeReader(dir), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
    },
    deploy: (ref) => { cli([...deployArgs(ref), "--workdir", root]); },
  };
}

/** The live function's facts: version, status, verify_jwt, and the manifest of its deployed source (or why not). */
function liveFunction(transport, ref) {
  let list;
  try { list = transport.listFunctions(ref); } catch (e) { return { error: `function list unreadable (${e.message})` }; }
  const rows = Array.isArray(list) ? list.filter((f) => f && (f.slug === FUNCTION_SLUG || f.name === FUNCTION_SLUG)) : [];
  if (rows.length !== 1) return { error: `expected exactly one function ${FUNCTION_SLUG} in the project, found ${rows.length}` };
  const f = rows[0];
  const out = { version: Number(f.version), status: f.status ?? null, verify_jwt: f.verify_jwt ?? null, manifest: null };
  let dl;
  try {
    dl = transport.downloadFunction(ref);
    out.manifest = manifest(dl.read, graphFiles(dl.read)).hash;
  } catch (e) {
    out.manifest_error = `deployed source unreadable (${e.message})`;
  } finally { dl?.cleanup?.(); }
  return out;
}

/** Reads catalog + ledger through the transport, with the linked ref checked before AND after the read. */
function authoritativeRead(transport, ref, now, maxAgeMin) {
  if (transport.linkedRef() !== ref) return { refused: `the Supabase CLI is linked to ${transport.linkedRef() ?? "no project"}, not ${ref}` };
  let catalog, ledger;
  try {
    catalog = parseCatalog(transport.queryCatalog());
    ledger = parseLedger(transport.queryLedger());
  } catch (e) { return { notReady: [`database unreadable: ${e.message}`] }; }
  if (transport.linkedRef() !== ref) return { refused: `the CLI's linked project changed during the read (now ${transport.linkedRef() ?? "none"})` };
  return { catalog, ledger, problems: checkCatalog(catalog, { now, maxAgeMin }) };
}

const ALLOWED = {
  sql: [],
  deploy: ["project-ref", "expect-candidate", "record", "max-age-min"],
  "check-offline": ["catalog"],
};
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

const USAGE = "usage: gnq-deploy-preflight.mjs sql | deploy --project-ref <ref> --expect-candidate <sha256> [--execute --record <new file>] | check-offline --catalog <file>";

export function main(argv, { root = ROOT, now = () => new Date(), log = console.log, err = console.error, transport } = {}) {
  let a;
  try { a = args(argv); } catch (e) { err(e.message); return 1; }
  const cmd = a._[0];
  if (!(cmd in ALLOWED) || a._.length !== 1) { err(USAGE); return 1; }
  const unknown = Object.keys(a).filter((k) => k !== "_" && k !== "execute" && !ALLOWED[cmd].includes(k));
  if (unknown.length > 0 || (a.execute && cmd !== "deploy")) { err(`${cmd}: not accepted: ${[...unknown, ...(a.execute && cmd !== "deploy" ? ["execute"] : [])].map((k) => `--${k}`).join(", ")}`); return 1; }

  if (cmd === "sql") { log(catalogSql()); log(ledgerSql()); return 0; }

  if (cmd === "check-offline") {
    let catalog;
    try { catalog = parseCatalog(readFileSync(a.catalog, "utf8")); } catch (e) { err(`NOT READY: ${e.message}`); return 2; }
    const problems = checkCatalog(catalog, { now: now(), maxAgeMin: 60 * 24 * 365 });
    log(`OFFLINE (weaker): the file's state is ${rolloutState(catalog)}. Which database produced it is unknown; this is no deploy evidence.`);
    if (problems.length > 0) { err("NOT READY:\n  " + problems.join("\n  ")); return 2; }
    log("the file shows a ready catalog — only `deploy` decides a deploy");
    return 0;
  }

  // ---- deploy ----
  const ref = a["project-ref"];
  if (!PROJECT_REF_RE.test(String(ref ?? ""))) { err("deploy needs --project-ref <20-char ref>"); return 1; }
  if (!SHA256_RE.test(String(a["expect-candidate"] ?? ""))) { err("deploy needs --expect-candidate <sha256 from the runbook>"); return 1; }
  if (a.execute && !a.record) { err("--execute needs --record <new file>"); return 1; }
  const maxAgeMin = a["max-age-min"] === undefined ? DEFAULT_MAX_AGE_MIN : Number(a["max-age-min"]);
  if (!Number.isInteger(maxAgeMin) || maxAgeMin < 1 || maxAgeMin > 60) { err("--max-age-min must be 1..60"); return 1; }
  if (a.record && existsSync(a.record)) { err(`REFUSED: ${a.record} exists — a record is written once, for one deploy`); return 3; }
  const t = transport ?? cliTransport(root);

  // 1. Environment (cheap, before anything else).
  if (t.linkedRef() !== ref) { err(`REFUSED: the Supabase CLI is linked to ${t.linkedRef() ?? "no project"}, not ${ref}`); return 3; }
  // 2. Candidate: committed and clean, and the runbook's.
  let cand;
  try { cand = candidateIdentity(root); } catch (e) { err(`REFUSED: candidate unreadable (${e.message})`); return 3; }
  if (cand.dirty.length > 0) { err("REFUSED: the candidate's files differ from the commit:\n  " + cand.dirty.join("\n  ")); return 3; }
  if (cand.hash !== a["expect-candidate"]) { err(`REFUSED: the working tree is candidate ${cand.hash}, not ${a["expect-candidate"]}`); return 3; }
  // 3. Lock.
  let lock;
  try { lock = lockPath(root); } catch (e) { err(`REFUSED: no git directory for the lock (${e.message})`); return 3; }
  if (!takeLock(lock, now())) { err(`REFUSED: another deploy holds ${lock} — wait for it; remove the file only after checking that no deploy is running`); return 3; }
  try {
    // 4. Before: the database, read by the tool itself through the project's own connection.
    const before = authoritativeRead(t, ref, now(), maxAgeMin);
    if (before.refused) { err(`REFUSED: ${before.refused}`); return 3; }
    log(`database (${t.kind}): ${before.catalog ? rolloutState(before.catalog) : "unreadable"}`);
    const notReady = before.notReady ?? before.problems;
    if (notReady.length > 0) { err("NOT READY:\n  " + notReady.join("\n  ")); return 2; }
    const live = liveFunction(t, ref);
    if (live.error) { err(`NOT READY: ${live.error}`); return 2; }
    if (!Number.isInteger(live.version) || live.version < 1) { err("NOT READY: the live version is unknown"); return 2; }
    if (live.manifest === cand.hash) { log(`ALREADY DEPLOYED: version ${live.version} is candidate ${cand.hash}; nothing to do`); return 0; }
    // 5. The candidate once more, right before the deploy (the files could have changed during the reads).
    const again = candidateIdentity(root);
    if (again.hash !== cand.hash || again.dirty.length > 0 || again.head !== cand.head) { err("REFUSED: the candidate changed during the check"); return 3; }
    const command = `supabase ${deployArgs(ref).join(" ")}`;
    if (!a.execute) {
      log(`DRY RUN OK: live version ${live.version} → the candidate would be deployed with: ${command}`);
      log("Nothing was deployed. Run the same command with --execute --record <new file> to deploy and verify.");
      return 0;
    }
    // 6. Deploy — the one command, nothing else.
    log(`deploying: ${command}`);
    try { t.deploy(ref); } catch (e) { err(`DEPLOY FAILED: ${e.message}`); return 5; }
    // 7. After.
    const after = authoritativeRead(t, ref, now(), maxAgeMin);
    const liveAfter = liveFunction(t, ref);
    const post = [];
    if (after.refused) post.push(after.refused);
    if (after.notReady) post.push(...after.notReady);
    if (after.problems?.length) post.push(...after.problems.map((p) => `catalog now: ${p}`));
    if (after.catalog && catalogDigest(after.catalog) !== catalogDigest(before.catalog)) post.push("the database functions changed during the deploy");
    if (after.ledger && ledgerDigest(after.ledger) !== ledgerDigest(before.ledger)) post.push(`the migration ledger changed during the deploy (${before.ledger.count} → ${after.ledger.count} versions)`);
    if (liveAfter.error) post.push(liveAfter.error);
    else {
      if (liveAfter.version !== live.version + 1) post.push(`live version ${liveAfter.version}, expected exactly ${live.version + 1} (another deploy, or none)`);
      if (liveAfter.status !== "ACTIVE") post.push(`status ${liveAfter.status}, expected ACTIVE`);
      if (liveAfter.verify_jwt !== false) post.push(`verify_jwt ${liveAfter.verify_jwt}, expected false`);
      if (liveAfter.manifest_error) post.push(liveAfter.manifest_error);
      else if (liveAfter.manifest !== cand.hash) post.push(`the deployed source is ${liveAfter.manifest}, not the candidate ${cand.hash}`);
    }
    const record = {
      tool_version: TOOL_VERSION, kind: "evidence, not an authorisation", project_ref: ref, transport: t.kind,
      candidate: { sha256: cand.hash, commit: cand.head, files: cand.files.length }, command,
      before: { at: before.catalog.read_at, state: rolloutState(before.catalog), catalog_sha256: catalogDigest(before.catalog), ledger: before.ledger, live_version: live.version, live_manifest: live.manifest },
      after: { at: after.catalog?.read_at ?? null, catalog_sha256: after.catalog ? catalogDigest(after.catalog) : null, ledger: after.ledger ?? null, live_version: liveAfter.version ?? null, live_manifest: liveAfter.manifest ?? null, status: liveAfter.status ?? null, verify_jwt: liveAfter.verify_jwt ?? null },
      verified: post.length === 0, problems: post, finished_at: now().toISOString(),
    };
    writeFileSync(a.record, JSON.stringify(record, null, 2) + "\n", { flag: "wx" });
    if (post.length > 0) { err("DEPLOYED BUT NOT VERIFIED — stop, report, the runbook's rollback decision applies:\n  " + post.join("\n  ")); return 4; }
    log(`DEPLOYED AND VERIFIED: version ${liveAfter.version} = candidate ${cand.hash}; record ${a.record}`);
    return 0;
  } finally {
    try { unlinkSync(lock); } catch { /* already gone: nothing to release */ }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = main(process.argv.slice(2));
