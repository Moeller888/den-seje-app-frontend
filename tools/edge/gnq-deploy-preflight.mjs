// Deployment preflight for the get-next-question Edge Function (D-383 + its follow-up). PROPOSAL, local only.
//
// Why: the version matrix (tests/unit/course-items-version-matrix.test.mjs) proved that deploying the new
// get-next-question BEFORE migrations 20261120150000 and 20261123100000 destroys course rounds (an old repeat body
// reopens an answered course round; the old release deletes an open one). Nothing technical stopped that order: Edge
// deploys are manual. This tool makes the order checkable, from what the DATABASE really runs — never from the
// migration ledger alone (apply_migration records its own timestamps, so a version number proves nothing).
//
//   node tools/edge/gnq-deploy-preflight.mjs sql --project-ref <ref>
//       prints ONE read-only SELECT (catalog only: pg_proc, no table rows, no pupil data). Running it against
//       production is a production read and needs the owner's separate GO; this tool never connects anywhere.
//   node tools/edge/gnq-deploy-preflight.mjs check --project-ref <ref> --catalog <result.json> --expect-candidate <sha256>
//          [--receipt <out.json>]
//       validates the catalog result and the working tree's candidate; writes a receipt only when everything holds.
//   node tools/edge/gnq-deploy-preflight.mjs verify --project-ref <ref> --receipt <receipt.json> [--max-age-min 15]
//       immediately before the deploy: same environment, same candidate bytes, receipt intact, fresh and unused.
//       On success it marks the receipt used (one deploy per receipt) and prints the one deploy command.
//
// Exit codes: 0 ok · 1 usage · 2 NOT READY (database state, signature, hash, grant) · 3 receipt or environment refused.
// Every unknown or unparsable input is a refusal, never a pass.
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { graphFiles, manifest, workingTreeReader } from "./gnq-release.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const TOOL_VERSION = 1;
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

const PROJECT_REF_RE = /^[a-z0-9]{20}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const quote = (s) => `'${String(s).replace(/'/g, "''")}'`;

/** The one read-only catalog query. The declared project ref is embedded so the result names what it was run for. */
export function catalogSql(projectRef) {
  if (!PROJECT_REF_RE.test(String(projectRef ?? ""))) throw new Error("catalogSql: invalid project ref");
  const sigs = [...REQUIRED_FUNCTIONS.map((f) => f.sig), ...ABSENT_FUNCTIONS];
  return `-- gnq-deploy-preflight v${TOOL_VERSION}: READ-ONLY catalog check (pg_proc only, no table rows).
SELECT json_build_object(
  'tool_version', ${TOOL_VERSION},
  'declared_project_ref', ${quote(projectRef)},
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

/** Accepts the raw query result in the shapes an operator gets: the object, {preflight}, [{preflight}], or rows. */
export function parseCatalog(raw) {
  let v = raw;
  if (typeof v === "string") v = JSON.parse(v);
  if (Array.isArray(v)) {
    if (v.length !== 1) throw new Error(`catalog: expected exactly one row, got ${v.length}`);
    v = v[0];
  }
  if (v && typeof v === "object" && "preflight" in v) v = v.preflight;
  if (typeof v === "string") v = JSON.parse(v);
  if (!v || typeof v !== "object" || !Array.isArray(v.functions) || !v.name_counts || typeof v.name_counts !== "object") {
    throw new Error("catalog: not a gnq-deploy-preflight result");
  }
  return v;
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
export function checkCatalog(catalog, projectRef, { now = new Date(), maxAgeMin = DEFAULT_MAX_AGE_MIN } = {}) {
  const problems = [];
  if (catalog.tool_version !== TOOL_VERSION) problems.push(`catalog from tool version ${catalog.tool_version}, expected ${TOOL_VERSION}`);
  if (catalog.declared_project_ref !== projectRef) problems.push(`catalog was produced for ${catalog.declared_project_ref ?? "no project"}, not ${projectRef}`);
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

const canonical = (o) => JSON.stringify(Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]])));
const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const catalogDigest = (catalog) => sha256(JSON.stringify({ functions: [...catalog.functions].sort((a, b) => a.sig < b.sig ? -1 : 1), name_counts: catalog.name_counts }));

export function makeReceipt({ projectRef, candidate, catalog, now = new Date(), maxAgeMin = DEFAULT_MAX_AGE_MIN }) {
  const body = {
    tool_version: TOOL_VERSION,
    project_ref: projectRef,
    candidate_sha256: candidate,
    catalog_sha256: catalogDigest(catalog),
    database_state: rolloutState(catalog),
    catalog_read_at: new Date(Date.parse(catalog.read_at)).toISOString(),
    checked_at: now.toISOString(),
    expires_at: new Date(Math.min(now.getTime(), Date.parse(catalog.read_at)) + maxAgeMin * 60_000).toISOString(),
    nonce: randomUUID(),
  };
  return { ...body, receipt_sha256: sha256(canonical(body)) };
}

/** Every reason the receipt may NOT authorise this deploy; [] = it may (once). */
export function checkReceipt(receipt, { projectRef, candidate, now = new Date(), used = false }) {
  const problems = [];
  if (!receipt || typeof receipt !== "object") return ["receipt: unreadable"];
  const { receipt_sha256: claimed, ...body } = receipt;
  if (claimed !== sha256(canonical(body))) problems.push("receipt: edited or damaged (hash differs)");
  if (body.tool_version !== TOOL_VERSION) problems.push(`receipt: tool version ${body.tool_version}`);
  if (body.project_ref !== projectRef) problems.push(`receipt: made for ${body.project_ref}, not ${projectRef}`);
  if (body.candidate_sha256 !== candidate) problems.push("receipt: the candidate changed after the preflight (manifest differs)");
  if (body.database_state !== "DB2 (both migrations)") problems.push(`receipt: database state ${body.database_state}`);
  const exp = Date.parse(body.expires_at);
  if (!Number.isFinite(exp)) problems.push("receipt: no expiry");
  else if (now.getTime() > exp) problems.push("receipt: expired — run the catalog query and check again");
  if (used) problems.push("receipt: already used for a deploy — one receipt, one deploy");
  return problems;
}

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) throw new Error(`--${k} needs a value`);
      out[k] = v;
      i++;
    } else out._.push(a);
  }
  return out;
}

export function main(argv, { root = ROOT, now = () => new Date(), log = console.log, err = console.error } = {}) {
  let a;
  try { a = args(argv); } catch (e) { err(e.message); return 1; }
  const cmd = a._[0];
  const ref = a["project-ref"];
  if (!["sql", "check", "verify"].includes(cmd) || !PROJECT_REF_RE.test(String(ref ?? ""))) {
    err("usage: gnq-deploy-preflight.mjs sql|check|verify --project-ref <20-char ref> …");
    return 1;
  }
  if (cmd === "sql") { log(catalogSql(ref)); return 0; }
  // The environment: the ref given here, the ref the CLI deploys to, and (later) the receipt's must all agree.
  const linked = linkedProjectRef(root);
  if (linked !== ref) { err(`REFUSED: the Supabase CLI is linked to ${linked ?? "no project"}, not ${ref}`); return 3; }
  let candidate;
  try { candidate = candidateHash(workingTreeReader(root)); } catch (e) { err(`REFUSED: candidate unreadable (${e.message})`); return 3; }
  const maxAgeMin = a["max-age-min"] === undefined ? DEFAULT_MAX_AGE_MIN : Number(a["max-age-min"]);
  if (!Number.isInteger(maxAgeMin) || maxAgeMin < 1 || maxAgeMin > 60) { err("--max-age-min must be 1..60"); return 1; }
  if (cmd === "check") {
    if (!SHA256_RE.test(String(a["expect-candidate"] ?? ""))) { err("check needs --expect-candidate <sha256 from the runbook>"); return 1; }
    if (candidate !== a["expect-candidate"]) { err(`REFUSED: the working tree is candidate ${candidate}, not ${a["expect-candidate"]}`); return 3; }
    let catalog;
    try { catalog = parseCatalog(readFileSync(a.catalog, "utf8")); } catch (e) { err(`NOT READY: ${e.message}`); return 2; }
    const problems = checkCatalog(catalog, ref, { now: now(), maxAgeMin });
    log(`database state: ${rolloutState(catalog)}`);
    if (problems.length > 0) { err("NOT READY:\n  " + problems.join("\n  ")); return 2; }
    const receipt = makeReceipt({ projectRef: ref, candidate, catalog, now: now(), maxAgeMin });
    if (a.receipt) writeFileSync(a.receipt, JSON.stringify(receipt, null, 2) + "\n");
    log(`READY: receipt ${receipt.receipt_sha256} valid until ${receipt.expires_at}`);
    return 0;
  }
  // verify
  if (!a.receipt) { err("verify needs --receipt <file>"); return 1; }
  let receipt;
  try { receipt = JSON.parse(readFileSync(a.receipt, "utf8")); } catch { err("REFUSED: receipt unreadable"); return 3; }
  const usedMarker = `${a.receipt}.used`;
  const problems = checkReceipt(receipt, { projectRef: ref, candidate, now: now(), used: existsSync(usedMarker) });
  if (problems.length > 0) { err("REFUSED:\n  " + problems.join("\n  ")); return 3; }
  writeFileSync(usedMarker, `${now().toISOString()} ${receipt.receipt_sha256}\n`, { flag: "wx" });
  log(`VERIFIED: deploy now, and only this: supabase functions deploy get-next-question --project-ref ${ref}`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = main(process.argv.slice(2));
