// tools/edge/gnq-deploy-preflight.mjs: the technical gate for the deploy ORDER of get-next-question (D-383).
// Its catalog query runs here, unmodified, against PGlite databases in the three rollout states — production's chain
// (DB0), after 20261120150000 (DB1), after both migrations (DB2) — and against DB2 with one thing changed. Only DB2 as
// reviewed passes.
//
// The `deploy` command is run end to end in a temporary git checkout against a SYNTHETIC transport that behaves like
// the Supabase CLI: each project ref has its own PGlite database (the Management API runs the SQL on the LINKED
// project), its own migration ledger and its own deployed function (version, status, verify_jwt, source files).
// Nothing here connects to Supabase, and nothing is deployed anywhere.
//
// HONEST LIMITS: PGlite is PostgreSQL 18.x as superuser; production's EXECUTE grantees may list more roles (e.g.
// supabase_admin) — the check only REQUIRES and FORBIDS named roles. The real CLI's JSON output shapes for
// `db query --linked`, `functions list` and `functions download` are modelled, not observed: the first real run
// checks them, and any unexpected shape fails closed (NOT READY or NOT VERIFIED), never open.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { answerChainSql, extractFunction, readMigration } from "./helpers/answer-chain-schema.mjs";
import {
  ABSENT_FUNCTIONS, F8_FUNCTIONS, F8_TABLE, REQUIRED_FUNCTIONS, candidateClass, candidateHash, catalogSql, checkCatalog,
  cliTransport, deployArgs, ledgerSql, lockPath, main, markerClass, parseCatalog, parseLedger, rolloutState, stateRefusal,
} from "../../tools/edge/gnq-deploy-preflight.mjs";
import { gitReader, graphFiles, workingTreeReader } from "../../tools/edge/gnq-release.mjs";
import { identify, loadRegistry, parseRegistry } from "../../tools/edge/edge-candidates.mjs";

const REF = "abcdefghijklmnopqrst";
const OTHER_REF = "zyxwvutsrqponmlkjihg";
const D383 = "20261120150000_course_items_out_of_ordinary_quiz.sql";
const SCOPE = "20261123100000_course_scope_before_candidate_limit.sql";
const F8 = "20261124160000_course_round_parking.sql";

async function database(state) {
  const db = new PGlite();
  for (const s of answerChainSql()) await db.exec(s);
  await db.exec(extractFunction("20261016160000_answer_keys_server_side_rpcs.sql", "get_unserved_questions_for_student"));
  await db.exec(`REVOKE ALL ON FUNCTION public.get_unserved_questions_for_student(uuid, smallint, text[]) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.get_unserved_questions_for_student(uuid, smallint, text[]) TO service_role;`);
  for (const f of ["20261031194600_mc_length_cue_answer_paths.sql", "20261102100000_release_open_rounds_on_inactive_questions.sql"]) await db.exec(readMigration(f));
  if (state >= 1) await db.exec(readMigration(D383));
  if (state >= 2) await db.exec(readMigration(SCOPE));
  if (state >= 3) await db.exec(readMigration(F8));
  // The ledger as Supabase keeps it (versions are apply_migration's own timestamps, not the file names).
  await db.exec(`CREATE SCHEMA supabase_migrations; CREATE TABLE supabase_migrations.schema_migrations (version text PRIMARY KEY, name text);
    INSERT INTO supabase_migrations.schema_migrations VALUES ('20261104095423', 'h5_bootstrap')${state >= 1 ? ", ('20261201000001', 'd383')" : ""}${state >= 2 ? ", ('20261201000002', 'course_scope')" : ""}${state >= 3 ? ", ('20261201000010', 'course_round_parking')" : ""};`);
  return db;
}
async function catalogOf(db) {
  const r = await db.query(catalogSql());
  assert.equal(r.rows.length, 1);
  return parseCatalog(r.rows); // the shape the Management API returns: [{ preflight: … }]
}
const DBS = { 0: await database(0), 1: await database(1), 2: await database(2), 3: await database(3) };

test("the two queries are read-only SELECTs: catalog over pg_proc, ledger over versions; no table rows, no writes", () => {
  for (const sql of [catalogSql(), ledgerSql()]) {
    const body = sql.replace(/^--.*$/m, "");
    assert.match(body.trim(), /^SELECT json_build_object\(/);
    // Statements only: SQL comments and string literals (privilege names such as 'UPDATE') are data, not statements;
    // what remains must hold no writing keyword, and it is one statement.
    const code = body.replace(/--[^\n]*/g, "").replace(/'(?:[^']|'')*'/g, "''");
    assert.doesNotMatch(code, /\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|TRUNCATE|COPY|SET|DO)\b/);
    assert.doesNotMatch(code, /;\s*\S/, "one statement");
    assert.doesNotMatch(body, /\b(FROM|JOIN)\s+(public\.)?(question_instances|questions|profiles|auth\.users|student_\w+)\b/i, "reads no table with pupil data");
    // D-384's table facts name question_instances ONLY as a catalog object: to_regclass('public.question_instances').
    assert.equal(body.replace(/to_regclass\('public\.question_instances'\)/g, "").match(/question_instances(?!_parked_guard|_activation|_parked_)/g), null,
      "question_instances appears only inside to_regclass() (catalog), never as a table that is read");
    assert.doesNotMatch(body, /\b(questions|profiles|auth\.users)\b/i);
  }
  for (const f of REQUIRED_FUNCTIONS) assert.ok(catalogSql().includes(`'${f.sig}'`));
  for (const s of ABSENT_FUNCTIONS) assert.ok(catalogSql().includes(`'${s}'`));
  assert.doesNotMatch(catalogSql(), /declared_project_ref/, "no self-declared project in the result: the CONNECTION names the project");
});

test("DB2 as the migrations leave it: ready; the expected facts are exactly what the two files create", async () => {
  const c = await catalogOf(DBS[2]);
  assert.equal(rolloutState(c), "DB2 (both migrations)");
  assert.deepEqual(checkCatalog(c, { requiredState: "DB2" }), []);
  const l = parseLedger((await DBS[2].query(ledgerSql())).rows);
  assert.equal(l.count, 3);
});

test("DB0 (production today) and DB1 (only D-383): NOT READY, and the state is named", async () => {
  const c0 = await catalogOf(DBS[0]);
  assert.equal(rolloutState(c0), "DB0 (neither migration)");
  const p0 = checkCatalog(c0);
  assert.ok(p0.some((p) => /question_is_course_item\(jsonb\): missing/.test(p)));
  assert.ok(p0.some((p) => /still the body before D-383/.test(p)));
  const c1 = await catalogOf(DBS[1]);
  assert.equal(rolloutState(c1), "DB1 (20261120150000 only)");
  const p1 = checkCatalog(c1);
  assert.ok(p1.some((p) => /20261123100000 not applied/.test(p)));
  assert.ok(p1.some((p) => /get_unserved_questions_for_student\(uuid,smallint,text\[\],text\): missing/.test(p)));
});

test("DB2 with ONE change is refused: a different body, a widened grant, an extra overload, a changed config", async (t) => {
  const cases = [
    ["a body changed by a single character", `CREATE OR REPLACE FUNCTION public.question_is_course_item(p_metadata jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$ SELECT coalesce(jsonb_typeof(p_metadata) = 'object' AND p_metadata ? 'learning_step', true); $$;`, /question_is_course_item\(jsonb\): body md5/],
    ["anon may call a backend function", "GRANT EXECUTE ON FUNCTION public.get_unserved_questions_for_student(uuid, smallint, text[], text) TO anon;", /anon has EXECUTE/],
    ["the pupil can no longer release", "REVOKE EXECUTE ON FUNCTION public.release_open_question_outside(text[]) FROM authenticated;", /authenticated lacks EXECUTE/],
    ["a second function with the same name", "CREATE FUNCTION public.get_question_candidates_for_student(p uuid) RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;", /2 functions with this name/],
    ["SECURITY flipped", "ALTER FUNCTION public.request_repeat_question_for_student(uuid, smallint, text[]) SECURITY INVOKER;", /SECURITY INVOKER, expected DEFINER/],
    ["search_path changed", "ALTER FUNCTION public.get_unserved_questions_for_student(uuid, smallint, text[], text) SET search_path = public;", /config/],
  ];
  for (const [label, sql, expected] of cases) {
    await t.test(label, async () => {
      const db = await database(2);
      await db.exec(sql);
      const problems = checkCatalog(await catalogOf(db));
      assert.ok(problems.some((p) => expected.test(p)), `${label}: ${JSON.stringify(problems)}`);
    });
  }
});

test("DB3 (F8) as the three migrations leave it: ready for an F8 candidate; the F8 facts are exactly what the file creates", async () => {
  const c = await catalogOf(DBS[3]);
  assert.equal(rolloutState(c), "DB3 (all three migrations, F8)");
  assert.deepEqual(checkCatalog(c, { requiredState: "DB3" }), []);
  assert.deepEqual(c.table.pupil_column_privileges, [], "anon/authenticated: nothing on the three server-owned columns");
  assert.deepEqual(c.table.pupil_table_update, [], "no table-level UPDATE left for the pupil roles");
  for (const f of F8_FUNCTIONS) assert.equal(c.functions.find((x) => x.sig === f.sig)?.md5, f.md5, f.sig);
  assert.deepEqual(Object.keys(c.table.columns).sort(), Object.keys(F8_TABLE.columns).sort());
  // …and DB3 is NOT ready for a DB2 candidate, nor DB2 for an F8 candidate: the states are told apart by their facts.
  assert.ok(checkCatalog(c, { requiredState: "DB2" }).some((p) => /past DB2/.test(p)));
  const p2 = checkCatalog(await catalogOf(DBS[2]), { requiredState: "DB3" });
  assert.ok(p2.some((p) => /20261124160000 not applied/.test(p)), JSON.stringify(p2));
  assert.ok(p2.some((p) => /park_open_course_round\(uuid\): missing/.test(p)));
  assert.ok(p2.some((p) => /column activation_no: "absent"/.test(p)));
});

test("DB3 with ONE change is refused: a pupil grant on a server-owned column, a dropped CHECK, another index, a disabled trigger, a callable trigger function, a widened RPC", async (t) => {
  const cases = [
    ["authenticated may UPDATE parked_at", "GRANT UPDATE (parked_at) ON public.question_instances TO authenticated;", /server-owned column: authenticated:parked_at:UPDATE/],
    ["anon may SELECT activation_no", "GRANT SELECT (activation_no) ON public.question_instances TO anon;", /anon:activation_no:SELECT/],
    ["the pupil got table UPDATE back", "GRANT UPDATE ON public.question_instances TO authenticated;", /whole of question_instances/],
    ["a CHECK dropped", "ALTER TABLE public.question_instances DROP CONSTRAINT question_instances_parked_is_open;", /check question_instances_parked_is_open/],
    ["the one-ACTIVE index widened back", "DROP INDEX public.idx_one_open_question; CREATE UNIQUE INDEX idx_one_open_question ON public.question_instances (student_id) WHERE answered = false;", /index idx_one_open_question/],
    ["the trigger disabled", "ALTER TABLE public.question_instances DISABLE TRIGGER question_instances_parked_guard;", /trigger question_instances_parked_guard/],
    ["the activation default changed", "ALTER TABLE public.question_instances ALTER COLUMN activation_no SET DEFAULT 1;", /column activation_no/],
    ["the pupil may park", "GRANT EXECUTE ON FUNCTION public.park_open_course_round(uuid) TO authenticated;", /park_open_course_round\(uuid\): authenticated has EXECUTE/],
    ["the trigger function is callable", "GRANT EXECUTE ON FUNCTION public.question_instances_parked_guard() TO service_role;", /parked_guard\(\): service_role has EXECUTE/],
    ["resume's body changed", "CREATE OR REPLACE FUNCTION public.resume_parked_course_round(p_student_id uuid, p_objective text, p_step text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $f$ BEGIN RETURN 'none'; END $f$;", /resume_parked_course_round\(uuid,text,text\): body md5/],
  ];
  for (const [label, sql, expected] of cases) {
    await t.test(label, async () => {
      const db = await database(3);
      await db.exec(sql);
      const c = await catalogOf(db);
      const problems = checkCatalog(c, { requiredState: "DB3" });
      assert.ok(problems.some((p) => expected.test(p)), `${label}: ${JSON.stringify(problems)}`);
    });
  }
});

test("the candidate's class is read from its OWN source: F8 needs DB3, #740/D-383 need DB2, a version before D-383 only DB0", () => {
  const tree = workingTreeReader();
  assert.deepEqual(candidateClass(tree, graphFiles(tree)), { kind: "F8 (D-384)", requires: "DB3" }, "this tree (reviewed: tools/edge/edge-candidates.json)");
  // The markers are evidence only (the register decides identity): what each historical version's CODE reads as.
  const at = (commit) => { const r = gitReader(commit, new URL("../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")); return markerClass(r, graphFiles(r)); };
  for (const [commit, want] of [["f51f39e4", "#740 (course scope)"], ["05a4a34f", "D-383 (#739)"], ["a7450b0f", "before D-383"]]) {
    let cls;
    try { cls = at(commit); } catch { continue; } // a shallow checkout lacks the commit: the synthetic cases below still run
    assert.equal(cls.kind, want, commit);
  }
  const synth = (text) => markerClass(() => text, ["functions/get-next-question/index.ts"]);
  assert.equal(synth("rpc('park_open_course_round')").requires, "DB3");
  assert.equal(synth("p_course_scope: 'exclude'").requires, "DB2");
  assert.equal(synth("if (isCourseItem(x))").requires, "DB2");
  assert.equal(synth("serve()").requires, "DB0");
  // A marker in a comment is not code: a version before F8 that only MENTIONS the parking call does not read as F8.
  assert.equal(synth("// park_open_course_round comes with F8\n/* p_course_scope */ serve()").requires, "DB0");
  assert.equal(synth("const u = 'https://x.dk'; rpc('park_open_course_round')").requires, "DB3", "the :// of a URL is no comment");
  // Lossy in ONE direction only: a // inside a string can hide a marker, which LOWERS the class — the register then
  // reports a reviewed manifest as CONFLICTING (refused); it can never raise a class.
  assert.equal(synth("const u = 'a//b'; rpc('park_open_course_round')").requires, "DB0");
  // The refusals say why, in both directions.
  assert.equal(stateRefusal({ kind: "F8 (D-384)", requires: "DB3" }, "DB3"), null);
  assert.match(stateRefusal({ kind: "F8 (D-384)", requires: "DB3" }, "DB2"), /needs DB3.*500/);
  assert.match(stateRefusal({ kind: "#740 (course scope)", requires: "DB2" }, "DB3"), /course unavailable.*safe rollback target on DB3 is F8/);
  assert.match(stateRefusal({ kind: "before D-383", requires: "DB0" }, "DB2"), /course items in the ordinary quiz/);
  assert.match(stateRefusal({ kind: "#740 (course scope)", requires: "DB2" }, "UNKNOWN"), /not in a reviewed state/);
});

test("the catalog itself: too old, from the future, duplicated, incomplete, malformed — all refused", async () => {
  const c = await catalogOf(DBS[2]);
  const readAt = Date.parse(c.read_at);
  assert.ok(checkCatalog(c, { now: new Date(readAt + 16 * 60_000) }).some((p) => /older than 15 min/.test(p)));
  assert.ok(checkCatalog(c, { now: new Date(readAt - 5 * 60_000) }).some((p) => /future/.test(p)));
  assert.ok(checkCatalog({ ...c, functions: [...c.functions, c.functions[0]] }).some((p) => /twice/.test(p)));
  assert.ok(checkCatalog({ ...c, functions: c.functions.slice(1) }).some((p) => /not in the catalog result/.test(p)));
  assert.ok(checkCatalog({ ...c, tool_version: 1 }).some((p) => /tool version/.test(p)), "a v1 result (self-declared ref) is not accepted");
  for (const bad of ["", "[]", "{}", '[{"a":1},{"a":2}]', '{"preflight":{"functions":"x"}}']) assert.throws(() => parseCatalog(bad));
  for (const bad of ["[]", '{"ledger":{"count":"x"}}', '[{"ledger":{"count":1}}]']) assert.throws(() => parseLedger(bad));
});

test("the candidate is the manifest the runbook documents, and one changed byte is another candidate", () => {
  const doc = readFileSync(new URL("../../docs/operations/level-engine-rollout.md", import.meta.url), "utf8");
  const h = candidateHash();
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.ok(doc.includes(h.slice(0, 8)), `the working tree's candidate ${h.slice(0, 8)}… is the runbook's current candidate`);
  const read = workingTreeReader();
  const changed = (p) => (p.endsWith("scope.ts") ? read(p) + " " : read(p));
  assert.notEqual(candidateHash(changed), h);
});

// ---------------------------------------------------------------------------------------------------------------
// `deploy` end to end: a temporary git checkout of the candidate and a synthetic Supabase (per project ref).

const g = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

function checkout(read = workingTreeReader()) {
  const root = mkdtempSync(join(tmpdir(), "gnq-gate-"));
  for (const f of graphFiles(read)) {
    const out = join(root, "supabase", f);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, read(f));
  }
  g(root, "init", "-q");
  g(root, "config", "user.email", "gate-test@example.invalid");
  g(root, "config", "user.name", "gate test");
  g(root, "config", "core.autocrlf", "false");
  g(root, "add", "supabase");
  g(root, "commit", "-q", "-m", "candidate");
  mkdirSync(join(root, "supabase", ".temp"), { recursive: true });
  return root;
}
const link = (root, ref) => writeFileSync(join(root, "supabase", ".temp", "project-ref"), ref + "\n");
const fileMap = (read) => new Map(graphFiles(read).map((f) => [f, read(f)]));
const mapReader = (m) => (p) => { if (!m.has(p)) throw new Error(`ENOENT ${p}`); return m.get(p); };

/** A synthetic Supabase: project ref → { rows: { before, after }, fn: { version, status, verify_jwt, files } }.
 * The SQL "runs" on the project the checkout is LINKED to, as `supabase db query --linked` does. PGlite is async and
 * the CLI synchronous, so each project's catalog and ledger results are computed up front from real PGlite databases:
 * `before` is what the database returns until a deploy happened, `after` what it returns afterwards (equal unless a
 * case changes the database "during" the deploy). Hooks inject faults. */
async function rowsOf(db) {
  return { catalog: (await db.query(catalogSql())).rows, ledger: (await db.query(ledgerSql())).rows };
}
function fakeSupabase(root, projects, hooks = {}) {
  const calls = { catalog: 0, ledger: 0, deploy: 0, list: 0, download: 0 };
  const linked = () => {
    const p = join(root, "supabase", ".temp", "project-ref");
    const v = existsSync(p) ? readFileSync(p, "utf8").trim() : null;
    return /^[a-z0-9]{20}$/.test(v ?? "") ? v : null;
  };
  const phase = () => (calls.deploy > 0 ? "after" : "before");
  const transport = {
    kind: "synthetic",
    linkedRef: () => (hooks.linkedRef ? hooks.linkedRef(calls, linked()) : linked()),
    queryCatalog: () => { calls.catalog++; hooks.onCatalog?.(); return projects[linked()].rows[phase()].catalog; },
    queryLedger: () => { calls.ledger++; return projects[linked()].rows[phase()].ledger; },
    listFunctions: (ref) => {
      calls.list++;
      const f = projects[ref].fn;
      return [{ slug: "get-next-question", version: f.version, status: f.status, verify_jwt: f.verify_jwt }, { slug: "process-event", version: 9, status: "ACTIVE", verify_jwt: false }];
    },
    downloadFunction: (ref) => { calls.download++; return { read: mapReader(projects[ref].fn.files), cleanup: () => {} }; },
    deploy: (ref) => {
      calls.deploy++;
      if (hooks.deployFails) throw new Error("bundling failed");
      const f = projects[ref].fn;
      f.version += 1;
      f.files = fileMap(workingTreeReader(root));
      hooks.afterDeploy?.(projects[ref]);
    },
  };
  return { transport, calls };
}
const oldFn = () => {
  const files = fileMap(workingTreeReader());
  files.set("functions/get-next-question/scope.ts", files.get("functions/get-next-question/scope.ts") + "\n// the version production runs\n");
  return { version: 41, status: "ACTIVE", verify_jwt: false, files };
};
const ROWS = { 0: await rowsOf(DBS[0]), 1: await rowsOf(DBS[1]), 2: await rowsOf(DBS[2]), 3: await rowsOf(DBS[3]) };

// This gate deploys only candidates WITHOUT a partner contract. F8's get-next-question (this tree) is safe only next to
// F8's process-event, which this gate does not read: it is REFUSED here and goes through tools/edge/edge-deploy-gate.mjs
// (tests/unit/edge-deploy-gate.test.mjs). The deploy tests therefore run a candidate of class #740 — this tree with F8's
// parking call renamed, deterministic and without an old commit — on its reviewed state DB2.
const PRE_F8 = (() => {
  const files = fileMap(workingTreeReader());
  for (const [p, v] of files) files.set(p, v.replaceAll("park_open_course_round", "parking_removed_in_this_synthetic_candidate"));
  return mapReader(files);
})();
// The synthetic candidate is no reviewed version, so the real register calls it UNKNOWN (tested below). The deploy tests
// register it explicitly, as #740, in a TEST register: the real one plus this one entry.
const REAL_REGISTRY = loadRegistry();
const PRE_F8_HASH = candidateHash(PRE_F8);
const TEST_REGISTRY = { ...REAL_REGISTRY, "get-next-question": { ...REAL_REGISTRY["get-next-question"],
  [PRE_F8_HASH]: { class: "#740 (course scope)", verified_by: "tree", reviewed: "synthetic test candidate (this file)" } } };
async function setup(hooks = {}, { state = 2, otherState = 2, changeDuringDeploy = null, read = PRE_F8, registry = TEST_REGISTRY } = {}) {
  const root = checkout(read);
  link(root, REF);
  let after = ROWS[state];
  if (changeDuringDeploy) {
    const db = await database(state);
    await db.exec(changeDuringDeploy);
    after = await rowsOf(db);
  }
  const projects = {
    [REF]: { rows: { before: ROWS[state], after }, fn: oldFn() },
    [OTHER_REF]: { rows: { before: ROWS[otherState], after: ROWS[otherState] }, fn: oldFn() },
  };
  const s = fakeSupabase(root, projects, hooks);
  const out = [];
  const candidate = candidateHash(workingTreeReader(root));
  const io = { root, transport: s.transport, log: (x) => out.push(String(x)), err: (x) => out.push(String(x)), registry };
  const deploy = (...extra) => main(["deploy", "--project-ref", REF, "--expect-candidate", candidate, ...extra], io);
  return { root, projects, ...s, out, candidate, io, deploy, record: join(root, "record.json") };
}

test("usage: only the documented flags; a catalog FILE can never reach a deploy; --execute needs a new record", async () => {
  const s = await setup();
  assert.equal(main(["check", "--project-ref", REF], s.io), 1, "the v1 receipt flow is gone");
  assert.equal(main(["verify", "--project-ref", REF], s.io), 1);
  assert.equal(s.deploy("--catalog", "x.json"), 1, "deploy takes no catalog: it reads the database itself");
  assert.equal(s.deploy("--receipt", "x.json"), 1);
  assert.equal(s.deploy("--execute"), 1, "--execute without --record");
  assert.equal(main(["check-offline", "--catalog", "x", "--project-ref", REF], s.io), 1);
  assert.equal(main(["check-offline", "--catalog", "x", "--execute"], s.io), 1);
  assert.equal(main(["sql"], s.io), 0);
  assert.equal(s.calls.catalog + s.calls.deploy, 0);
});

test("environment: no link or another project → REFUSED before any read; the catalog comes from the LINKED project", async () => {
  const s = await setup({}, { state: 0, otherState: 2 });
  writeFileSync(join(s.root, "supabase", ".temp", "project-ref"), "garbage\n");
  assert.equal(s.deploy(), 3, "no valid link");
  link(s.root, OTHER_REF);
  assert.equal(s.deploy(), 3, "linked to another project (whose database IS ready)");
  assert.equal(s.calls.catalog, 0, "refused before reading anything");
  link(s.root, REF);
  assert.equal(s.deploy(), 2, "the declared project's own database is DB0: a ready catalog elsewhere does not help");
  assert.ok(s.out.some((x) => /DB0/.test(x)));
  assert.equal(s.calls.deploy, 0);
});

test("the link changing DURING the read is refused (the catalog may then be another project's)", async () => {
  const s = await setup({ linkedRef: (calls, real) => (calls.catalog > 0 ? OTHER_REF : real) });
  assert.equal(s.deploy("--execute", "--record", s.record), 3);
  assert.ok(s.out.some((x) => /linked project changed during the read/.test(x)));
  assert.equal(s.calls.deploy, 0);
  assert.equal(existsSync(s.record), false);
});

test("candidate: another manifest, an uncommitted change, or a change during the check → REFUSED, nothing deployed", async () => {
  const s = await setup();
  assert.equal(main(["deploy", "--project-ref", REF, "--expect-candidate", "c".repeat(64)], s.io), 3);
  const scope = join(s.root, "supabase", "functions", "get-next-question", "scope.ts");
  const orig = readFileSync(scope, "utf8");
  writeFileSync(scope, orig + "\n// not committed\n");
  assert.equal(main(["deploy", "--project-ref", REF, "--expect-candidate", candidateHash(workingTreeReader(s.root))], s.io), 3, "dirty tree, even with the matching hash");
  assert.ok(s.out.some((x) => /differ from the commit/.test(x)));
  writeFileSync(scope, orig);
  let tRoot = null;
  const t = await setup({ onCatalog: () => writeFileSync(join(tRoot, "supabase", "functions", "get-next-question", "scope.ts"), orig + "\n// during\n") });
  tRoot = t.root;
  assert.equal(t.deploy("--execute", "--record", t.record), 3);
  assert.ok(t.out.some((x) => /changed during the check/.test(x)));
  assert.equal(t.calls.deploy + s.calls.deploy, 0);
});

test("concurrent use: a held lock refuses; the lock is released after every outcome", async () => {
  const s = await setup();
  const lock = lockPath(s.root);
  writeFileSync(lock, "another deploy\n");
  assert.equal(s.deploy(), 3);
  assert.ok(s.out.some((x) => /another deploy holds/.test(x)));
  assert.equal(s.calls.catalog, 0);
  unlinkSync(lock);
  assert.equal(s.deploy(), 0, "dry run");
  assert.equal(existsSync(lock), false, "released after a dry run");
  const t = await setup({}, { state: 1 });
  assert.equal(t.deploy(), 2);
  assert.equal(existsSync(lockPath(t.root)), false, "released after NOT READY");
});

test("the deploy candidates: #740 here; F8's candidate is REFUSED before any read (it needs the pair rule), on DB3 as on DB2", async () => {
  assert.equal(candidateClass(PRE_F8, graphFiles(PRE_F8), TEST_REGISTRY).kind, "#740 (course scope)", "the synthetic candidate is #740 (test register)");
  for (const state of [3, 2]) {
    const s = await setup({}, { state, read: workingTreeReader() });
    assert.equal(s.deploy("--execute", "--record", s.record), 3, s.out.join("\n"));
    assert.ok(s.out.some((x) => /F8 \(D-384\) needs F8's process-event live next to it/.test(x)), s.out.join(" | "));
    assert.ok(s.out.some((x) => /edge-deploy-gate\.mjs deploy --function get-next-question/.test(x)));
    assert.equal(s.deploy(), 3, "the dry run too: it would print a command without the pair check");
    assert.equal(s.calls.catalog + s.calls.deploy, 0, "refused before any read");
    assert.equal(existsSync(s.record), false);
    assert.equal(existsSync(lockPath(s.root)), false);
  }
});

test("an older candidate onto DB3 → NOT READY with the safe rollback target", async () => {
  let old;
  try { old = gitReader("f51f39e4", new URL("../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")); old(graphFiles(workingTreeReader())[0]); } catch { old = null; }
  const files = old ? null : fileMap(workingTreeReader());
  if (files) for (const [p, v] of files) files.set(p, v.replaceAll("park_open_course_round", "parking_removed_in_this_synthetic_candidate"));
  const t = await setup({}, { state: 3, read: old ?? mapReader(files) });
  assert.equal(t.deploy("--execute", "--record", t.record), 2, t.out.join("\n"));
  assert.ok(t.out.some((x) => /safe rollback target on DB3 is F8/.test(x)), t.out.join(" | "));
  assert.equal(t.calls.deploy, 0);
});

test("dry run: everything checked, nothing deployed, the one command printed", async () => {
  const s = await setup();
  assert.equal(s.deploy(), 0, s.out.join("\n"));
  assert.equal(s.calls.deploy, 0);
  assert.equal(s.projects[REF].fn.version, 41);
  assert.ok(s.out.some((x) => x.includes(`supabase ${deployArgs(REF).join(" ")}`)));
  assert.ok(s.out.some((x) => /Nothing was deployed/.test(x)));
});

test("execute: deploy, then the after-check proves version +1, ACTIVE, verify_jwt false, the candidate's source; once", async () => {
  const s = await setup();
  assert.equal(s.deploy("--execute", "--record", s.record), 0, s.out.join("\n"));
  assert.equal(s.calls.deploy, 1);
  const rec = JSON.parse(readFileSync(s.record, "utf8"));
  assert.equal(rec.verified, true);
  assert.equal(rec.kind, "evidence, not an authorisation");
  assert.equal(rec.before.live_version, 41);
  assert.equal(rec.after.live_version, 42);
  assert.equal(rec.after.live_manifest, s.candidate);
  assert.equal(rec.before.catalog_sha256, rec.after.catalog_sha256);
  // Reuse: the same record cannot be written again, and a second run deploys nothing (already live).
  assert.equal(s.deploy("--execute", "--record", s.record), 3);
  assert.equal(s.deploy("--execute", "--record", join(s.root, "record2.json")), 0);
  assert.ok(s.out.some((x) => /ALREADY DEPLOYED/.test(x)));
  assert.equal(s.calls.deploy, 1);
});

test("the after-check catches what happened DURING the deploy: migration, body, other deploy, other source, verify_jwt", async (t) => {
  const cases = [
    ["a migration applied meanwhile (ledger changes)", {}, "INSERT INTO supabase_migrations.schema_migrations VALUES ('20261201000003', 'meanwhile')", /migration ledger changed/],
    ["a function body changed meanwhile", {}, "ALTER FUNCTION public.request_repeat_question_for_student(uuid, smallint, text[]) SECURITY INVOKER", /database functions changed during the deploy/],
    ["another deploy landed too", { afterDeploy: (p) => { p.fn.version += 1; } }, null, /expected exactly 42/],
    ["the deployed source is not the candidate", { afterDeploy: (p) => { p.fn.files = oldFn().files; } }, null, /deployed source is/],
    ["verify_jwt came back true", { afterDeploy: (p) => { p.fn.verify_jwt = true; } }, null, /verify_jwt true/],
    ["the status is not ACTIVE", { afterDeploy: (p) => { p.fn.status = "THROTTLED"; } }, null, /status THROTTLED/],
    ["the deployed source cannot be read", { afterDeploy: (p) => { p.fn.files = new Map(); } }, null, /deployed source unreadable/],
  ];
  for (const [label, hooks, changeDuringDeploy, expected] of cases) {
    await t.test(label, async () => {
      const s = await setup(hooks, { changeDuringDeploy });
      assert.equal(s.deploy("--execute", "--record", s.record), 4, s.out.join("\n"));
      assert.ok(s.out.some((x) => expected.test(x)), `${label}: ${s.out.join(" | ")}`);
      const rec = JSON.parse(readFileSync(s.record, "utf8"));
      assert.equal(rec.verified, false);
      assert.equal(existsSync(lockPath(s.root)), false);
    });
  }
  await t.test("the deploy command fails → exit 5, no record claims success", async () => {
    const s = await setup({ deployFails: true });
    assert.equal(s.deploy("--execute", "--record", s.record), 5);
    assert.equal(existsSync(s.record), false);
    assert.equal(existsSync(lockPath(s.root)), false);
  });
});

test("check-offline is weaker by design: it reports, never writes, and says it is no deploy evidence", async () => {
  const root = mkdtempSync(join(tmpdir(), "gnq-offline-"));
  const out = [];
  const io = { root, log: (x) => out.push(String(x)), err: (x) => out.push(String(x)) };
  const f = join(root, "c.json");
  writeFileSync(f, JSON.stringify((await DBS[3].query(catalogSql())).rows));
  assert.equal(main(["check-offline", "--catalog", f], { ...io, root: undefined }), 0, out.join("\n"));
  writeFileSync(f, JSON.stringify((await DBS[2].query(catalogSql())).rows));
  assert.equal(main(["check-offline", "--catalog", f], { ...io, root: undefined }), 2, "this tree's candidate (F8) needs DB3");
  assert.ok(out.some((x) => /Which database produced it is unknown; this is no deploy evidence/.test(x)));
  writeFileSync(f, JSON.stringify((await DBS[0].query(catalogSql())).rows));
  assert.equal(main(["check-offline", "--catalog", f], { ...io, root: undefined }), 2);
  assert.deepEqual(readdirSync(root), ["c.json"], "check-offline writes nothing: no receipt, no marker");
});

test("the real transport is the Supabase CLI with explicit argument vectors: --linked for SQL, --project-ref elsewhere, no shell, no token", () => {
  const seen = [];
  const run = (bin, args, opts) => {
    seen.push({ bin, args, shell: opts.shell });
    if (args[0] === "db") return { status: 0, stdout: "[{\"preflight\":{}}]" };
    if (args[0] === "functions" && args[1] === "list") return { status: 0, stdout: "[]" };
    return { status: 0, stdout: "" };
  };
  const t = cliTransport("/some/root with space", { run });
  t.queryCatalog();
  t.listFunctions(REF);
  t.deploy(REF);
  const [q, l, d] = seen;
  assert.deepEqual(q.args.slice(0, 5), ["db", "query", "--linked", "--output", "json"]);
  assert.ok(q.args.includes("--file"));
  assert.deepEqual(l.args, ["functions", "list", "--project-ref", REF, "--output-format", "json"]);
  assert.deepEqual(d.args, [...deployArgs(REF), "--workdir", "/some/root with space"]);
  assert.deepEqual(deployArgs(REF), ["functions", "deploy", "get-next-question", "--project-ref", REF, "--no-verify-jwt", "--use-api"]);
  for (const c of seen) {
    assert.equal(c.shell, false);
    assert.doesNotMatch(c.args.join(" "), /token|password|key|secret/i);
  }
  const failing = cliTransport("/r", { run: () => ({ status: 1, stderr: "not linked" }) });
  assert.throws(() => failing.queryCatalog(), /db query failed \(exit 1\): not linked/);
});

// ---- identity (D-384, 2026-11-26): only a REVIEWED manifest whose code reads as its reviewed class ----

test("identity: an unreviewed candidate is UNKNOWN and REFUSED before the lock and any read, even with the runbook's hash", async () => {
  const s = await setup({}, { registry: REAL_REGISTRY });
  assert.equal(candidateClass(PRE_F8, graphFiles(PRE_F8)).kind, "UNKNOWN", "the synthetic #740 is no reviewed version");
  for (const extra of [[], ["--execute", "--record", s.record]]) {
    assert.equal(s.deploy(...extra), 3, s.out.join("\n"));
    assert.equal(s.calls.catalog, 0, "no catalog read");
    assert.equal(s.calls.deploy, 0, "nothing deployed");
    assert.ok(!existsSync(lockPath(s.root)), "no lock taken");
  }
  assert.match(s.out.join("\n"), /UNKNOWN: manifest [0-9a-f]{64} is not a reviewed get-next-question version \(its source reads as #740/);
});

test("identity: a registered manifest whose code reads as another class is CONFLICTING and REFUSED", async () => {
  // The register claims the synthetic candidate is F8 — its code reads as #740.
  const wrong = { ...REAL_REGISTRY, "get-next-question": { ...REAL_REGISTRY["get-next-question"],
    [PRE_F8_HASH]: { class: "F8 (D-384)", verified_by: "tree", reviewed: "deliberately wrong" } } };
  const cls = candidateClass(PRE_F8, graphFiles(PRE_F8), wrong);
  assert.equal(cls.kind, "CONFLICTING");
  assert.match(stateRefusal(cls, "DB2"), /registered as F8 \(D-384\), but its source reads as #740.*refused on every database/);
  for (const st of ["DB0", "DB2", "DB3", "UNKNOWN"]) assert.ok(stateRefusal(cls, st), st);
  const s = await setup({}, { registry: wrong });
  assert.equal(s.deploy(), 3);
  assert.equal(s.calls.catalog, 0);
});

test("identity: a renamed safety call, a marker only in a comment, one changed byte — each is UNKNOWN, never a known class", () => {
  const tree = workingTreeReader();
  const files = graphFiles(tree);
  const variants = {
    "F8's parking call renamed": (p) => tree(p).replaceAll("park_open_course_round", "park_round_v2"),
    "the parking call only in a comment": (p) => tree(p).replaceAll("park_open_course_round(", "noop(") + "\n// park_open_course_round()\n",
    "one byte added to a shared module": (p) => (p.startsWith("functions/_shared/") ? tree(p) + " " : tree(p)),
  };
  for (const [label, read] of Object.entries(variants)) {
    const cls = candidateClass(read, files);
    assert.ok(cls.kind === "UNKNOWN" || cls.kind === "CONFLICTING", `${label}: ${cls.kind}`);
    assert.equal(cls.requires, null, label);
  }
});

test("identity: the register itself fails loudly when malformed", () => {
  const ok = JSON.stringify({ "get-next-question": {}, "process-event": {} });
  assert.deepEqual(parseRegistry(ok), { "get-next-question": {}, "process-event": {} });
  for (const [text, re] of [
    ["{", /not JSON/],
    [JSON.stringify({ "get-next-question": {} }), /process-event must be an object/],
    [JSON.stringify({ "get-next-question": {}, "process-event": {}, "buy-item": {} }), /unknown key buy-item/],
    [JSON.stringify({ "get-next-question": { abc: { class: "x", verified_by: "tree", reviewed: "r" } }, "process-event": {} }), /not a sha256/],
    [JSON.stringify({ "get-next-question": { ["a".repeat(64)]: { verified_by: "tree", reviewed: "r" } }, "process-event": {} }), /class is required/],
    [JSON.stringify({ "get-next-question": { ["a".repeat(64)]: { class: "x", verified_by: "me", reviewed: "r" } }, "process-event": {} }), /verified_by/],
    [JSON.stringify({ "get-next-question": { ["a".repeat(64)]: { class: "x", verified_by: "tree", reviewed: " " } }, "process-event": {} }), /reviewed/],
  ]) assert.throws(() => parseRegistry(text), re, text);
  assert.equal(identify(parseRegistry(ok), "get-next-question", "a".repeat(64), "F8 (D-384)").verdict, "UNKNOWN");
});
