// tools/edge/edge-deploy-gate.mjs: the SHARED deployment gate for get-next-question and process-event.
// The catalog query runs, unmodified, against PGlite databases in the rollout states DB0, DB2 and DB3 (built from the
// real migration files). The `deploy` command runs end to end in a temporary git checkout against a SYNTHETIC
// Supabase that holds BOTH functions per project (version, status, verify_jwt, deployed source). The candidates and
// the live versions are real sources: this tree (F8) and the pinned commit 634b7282 (get-next-question #740, process-event before
// F8). Nothing connects to Supabase, and nothing is deployed anywhere.
//
// HONEST LIMITS: as gnq-deploy-preflight.test.mjs — PGlite is PostgreSQL as superuser, and the CLI's JSON shapes are
// modelled, not observed. The gate reads no rows: whether a round is parked, and the value of the Edge secret
// LAERLIGVERSE_COURSE_PARKING, stay outside it (docs/operations/edge-deploy-gate.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { answerChainSql, extractFunction, readMigration } from "./helpers/answer-chain-schema.mjs";
import { catalogSql, ledgerSql, candidateHash, lockPath } from "../../tools/edge/gnq-deploy-preflight.mjs";
import { gitReader, graphFiles, manifest, workingTreeReader } from "../../tools/edge/gnq-release.mjs";
import {
  FUNCTIONS, PE_F8_MARKERS, classify, cliTransport, deployArgsFor, graphFilesFor, main, manifestFor, pairRefusal,
  processEventClass, stateRefusal, treeReader,
} from "../../tools/edge/edge-deploy-gate.mjs";

const REF = "abcdefghijklmnopqrst";
const GNQ = "get-next-question";
const PE = "process-event";
const PE_INDEX = "functions/process-event/index.ts";

// ---- the sources: this tree (F8 for both) and a PINNED commit before F8 ----
// BEFORE_F8 is main right after #740 (get-next-question #740, process-event before F8); supabase/functions is unchanged
// from there to 9177e15d, so it is the pair production is planned to run during the transition. Pinned, never
// origin/main: main moves (F8 itself lands there), and CI checks out shallow, without old commits. The recorded fixture
// holds exactly the files in which BEFORE_F8 differs from this tree; every run reads the sources through it, and where
// the commit IS in the checkout, the first test proves the fixture equals the commit (as course-items-version-matrix).
// UPDATE_EDGE_GATE_FIXTURE=1 rewrites it from the commit.
const tree = workingTreeReader();
const BEFORE_F8 = "634b728262ecc1b81c0347a743e9b793d707374d";
const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "edge-gate-before-f8-634b7282.json");
let haveCommit = true;
try { execFileSync("git", ["cat-file", "-e", `${BEFORE_F8}^{commit}`], { stdio: "ignore" }); } catch { haveCommit = false; }
/** The files of both functions' graphs at BEFORE_F8 whose content differs from this tree (or is absent here). */
function pinnedDelta() {
  const pinned = gitReader(BEFORE_F8);
  const files = {};
  for (const slug of [GNQ, PE]) {
    for (const f of graphFilesFor(slug, pinned)) {
      let here = null;
      try { here = tree(f); } catch { /* absent in this tree */ }
      const then = pinned(f);
      if (here !== then) files[f] = then;
    }
  }
  return Object.fromEntries(Object.keys(files).sort().map((f) => [f, files[f]]));
}
if (process.env.UPDATE_EDGE_GATE_FIXTURE === "1") {
  assert.ok(haveCommit, `${BEFORE_F8} is not in this checkout: the fixture cannot be rewritten`);
  writeFileSync(FIXTURE, JSON.stringify({ source: `${BEFORE_F8} (main after #740: get-next-question #740, process-event before F8)`, files: pinnedDelta() }, null, 2) + "\n");
}
assert.ok(existsSync(FIXTURE), `${FIXTURE} is missing (UPDATE_EDGE_GATE_FIXTURE=1 writes it where ${BEFORE_F8} is available)`);
const fixture = JSON.parse(readFileSync(FIXTURE, "utf8"));

/** A reader with some files replaced. */
const overlay = (base, changes) => (p) => (p in changes ? changes[p] : base(p));
/** Both functions as at BEFORE_F8. */
const beforeF8 = overlay(tree, fixture.files);
/** process-event as at BEFORE_F8, everything else from this tree. */
const withOldPe = () => (p) => (p.startsWith("functions/process-event/") ? beforeF8(p) : tree(p));
/** get-next-question as at BEFORE_F8, everything else from this tree. */
const withOldGnq = () => (p) => (p.startsWith("functions/get-next-question/") ? beforeF8(p) : tree(p));

// ---- the databases ----
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
  await db.exec(`CREATE SCHEMA supabase_migrations; CREATE TABLE supabase_migrations.schema_migrations (version text PRIMARY KEY, name text);
    INSERT INTO supabase_migrations.schema_migrations VALUES ('20261104095423', 'h5_bootstrap')${state >= 1 ? ", ('20261201000001', 'd383')" : ""}${state >= 2 ? ", ('20261201000002', 'course_scope')" : ""}${state >= 3 ? ", ('20261201000010', 'course_round_parking')" : ""};`);
  return db;
}
const rowsOf = async (db) => ({ catalog: (await db.query(catalogSql())).rows, ledger: (await db.query(ledgerSql())).rows });
const ROWS = { 0: await rowsOf(await database(0)), 2: await rowsOf(await database(2)), 3: await rowsOf(await database(3)) };

// ---------------------------------------------------------------------------------------------------------------
// The pinned reference.

test("the pinned reference: the fixture is exactly where 634b7282 differs from this tree (where the commit is available)", { skip: !haveCommit && "shallow checkout: the recorded fixture stands in" }, () => {
  assert.match(fixture.source, new RegExp(`^${BEFORE_F8} `));
  assert.deepEqual(fixture.files, pinnedDelta(), "stale fixture: run with UPDATE_EDGE_GATE_FIXTURE=1 and review the diff");
  const pinned = gitReader(BEFORE_F8);
  for (const slug of [GNQ, PE]) {
    assert.deepEqual(graphFilesFor(slug, beforeF8), graphFilesFor(slug, pinned), `${slug}: the same graph as the commit`);
    assert.equal(manifestFor(beforeF8, graphFilesFor(slug, beforeF8)).hash, manifestFor(pinned, graphFilesFor(slug, pinned)).hash, `${slug}: the same manifest as the commit`);
  }
});

test("the pinned reference is a fixed commit, never a moving ref", () => {
  assert.match(BEFORE_F8, /^[0-9a-f]{40}$/);
  assert.ok(Object.keys(fixture.files).length > 0 && Object.keys(fixture.files).every((f) => f.startsWith("functions/")));
});

// ---------------------------------------------------------------------------------------------------------------
// The registry.

test("the deployed file set and manifest are gnq-release.mjs's for get-next-question, and the same rule for process-event", () => {
  assert.deepEqual(graphFilesFor(GNQ, tree), graphFiles(tree));
  assert.equal(manifestFor(tree, graphFilesFor(GNQ, tree)).hash, manifest(tree, graphFiles(tree)).hash);
  assert.equal(classify(GNQ, tree).hash, candidateHash(tree));
  const pe = graphFilesFor(PE, tree);
  assert.ok(pe.includes(PE_INDEX) && pe.includes("functions/process-event/deno.json"));
  assert.ok(pe.includes("functions/process-event/round-activation.ts") && pe.includes("functions/process-event/round-parked.ts"));
  assert.ok(pe.every((f) => !f.startsWith("functions/get-next-question/")), "the graph is the function's own");
  assert.deepEqual(Object.keys(FUNCTIONS).sort(), [GNQ, PE]);
});

test("process-event's class is read from its own source: this tree is F8, the pinned commit is before F8", () => {
  assert.deepEqual(classify(PE, tree).cls, { kind: "F8 (D-384)", f8: true, accepts: ["DB3"] });
  assert.deepEqual(classify(PE, withOldPe()).cls, { kind: "before F8", f8: false, accepts: ["DB0", "DB1", "DB2"] });
  assert.equal(classify(GNQ, tree).cls.kind, "F8 (D-384)");
  assert.equal(classify(GNQ, withOldGnq()).cls.kind, "#740 (course scope)");
});

test("a MISSING activation check is INCOMPLETE, never F8: one call removed, a call only in a comment, a module missing", () => {
  const index = tree(PE_INDEX);
  for (const m of PE_F8_MARKERS.filter((x) => x.call)) {
    const name = m.call.replace("(", "");
    // Every CALL of this marker replaced by a no-op name; the import stays (an import is not a check).
    const stripped = index.replace(new RegExp(`(^|[^\\w.])${name}\\s*\\(`, "gm"), "$1noCheck(");
    assert.notEqual(stripped, index, `${name} is called in index.ts`);
    const cls = processEventClass(overlay(tree, { [PE_INDEX]: stripped }), graphFilesFor(PE, tree));
    assert.equal(cls.kind, "INCOMPLETE", name);
    assert.deepEqual(cls.missing, [`${name}()`]);
    assert.match(stateRefusal(PE, cls, "DB3"), /INCOMPLETE.*refused on every database/);
    // …and as a comment only, it still does not count.
    const commented = stripped + `\n// ${name}(x) is documented here\n/* ${name}(y) */\n`;
    assert.equal(processEventClass(overlay(tree, { [PE_INDEX]: commented }), graphFilesFor(PE, tree)).kind, "INCOMPLETE");
  }
  const files = graphFilesFor(PE, tree).filter((f) => f !== "functions/process-event/round-parked.ts");
  assert.deepEqual(processEventClass(tree, files).missing, ["functions/process-event/round-parked.ts"]);
});

test("state rule: process-event F8 only on DB3; before F8 on DB0–DB2, refused on DB3 and on an unknown state", () => {
  const f8 = { kind: "F8 (D-384)", f8: true, accepts: ["DB3"] };
  const old = { kind: "before F8", f8: false, accepts: ["DB0", "DB1", "DB2"] };
  assert.equal(stateRefusal(PE, f8, "DB3"), null);
  for (const s of ["DB0", "DB1", "DB2"]) {
    assert.match(stateRefusal(PE, f8, s), /reads activation_no.*needs DB3/, s);
    assert.equal(stateRefusal(PE, old, s), null, s);
  }
  assert.match(stateRefusal(PE, old, "DB3"), /no activation check.*stale tab/);
  assert.match(stateRefusal(PE, old, "UNKNOWN"), /not in a reviewed state/);
  assert.match(stateRefusal(PE, f8, "UNKNOWN"), /not in a reviewed state/);
  // get-next-question keeps gnq-deploy-preflight's rule unchanged.
  assert.equal(stateRefusal(GNQ, { kind: "F8 (D-384)", f8: true, accepts: ["DB3"], requires: "DB3" }, "DB3"), null);
  assert.match(stateRefusal(GNQ, { kind: "#740 (course scope)", f8: false, accepts: ["DB2"], requires: "DB2" }, "DB3"), /safe rollback target on DB3 is F8/);
});

test("pair rule: F8's get-next-question only next to F8's process-event; process-event before F8 never next to F8's get-next-question", () => {
  const peF8 = { cls: { kind: "F8 (D-384)", f8: true } };
  const peOld = { cls: { kind: "before F8", f8: false } };
  const gnqF8 = { cls: { kind: "F8 (D-384)", f8: true } };
  const gnqOld = { cls: { kind: "#740 (course scope)", f8: false } };
  assert.match(pairRefusal(GNQ, { f8: true, kind: "F8 (D-384)" }, peOld), /Deploy F8's process-event FIRST/);
  assert.equal(pairRefusal(GNQ, { f8: true, kind: "F8 (D-384)" }, peF8), null);
  assert.equal(pairRefusal(GNQ, { f8: false, kind: "#740 (course scope)" }, peF8), null, "gnq rollback next to F8's process-event is fine");
  assert.equal(pairRefusal(PE, { f8: true, kind: "F8 (D-384)" }, gnqOld), null, "trin 5.2: F8's process-event next to #740");
  assert.equal(pairRefusal(PE, { f8: true, kind: "F8 (D-384)" }, gnqF8), null);
  assert.match(pairRefusal(PE, { f8: false, kind: "before F8" }, gnqF8), /removes the activation check/);
  assert.equal(pairRefusal(PE, { f8: false, kind: "before F8" }, gnqOld), null);
  assert.match(pairRefusal(PE, { f8: true }, { error: "deployed source unreadable" }), /unknown.*cannot be checked/);
  assert.match(pairRefusal(PE, { f8: true }, null), /unknown/);
  assert.match(pairRefusal(GNQ, { f8: true }, { cls: { kind: "INCOMPLETE", missing: ["activationVerdict()"] } }), /INCOMPLETE/);
});

// ---------------------------------------------------------------------------------------------------------------
// `deploy` end to end.

const g = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const filesOf = (read) => new Map([GNQ, PE].flatMap((s) => graphFilesFor(s, read).map((f) => [f, read(f)])));
const mapReader = (m) => (p) => { if (!m.has(p)) throw new Error(`ENOENT ${p}`); return m.get(p); };

function checkout(read) {
  const root = mkdtempSync(join(tmpdir(), "edge-gate-"));
  for (const [f, text] of filesOf(read)) {
    const out = join(root, "supabase", f);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, text);
  }
  g(root, "init", "-q");
  g(root, "config", "user.email", "gate-test@example.invalid");
  g(root, "config", "user.name", "gate test");
  g(root, "config", "core.autocrlf", "false");
  g(root, "add", "supabase");
  g(root, "commit", "-q", "-m", "candidate");
  mkdirSync(join(root, "supabase", ".temp"), { recursive: true });
  writeFileSync(join(root, "supabase", ".temp", "project-ref"), REF + "\n");
  return root;
}

/** A synthetic Supabase with both functions; `live` = { gnq: reader, pe: reader }. */
function fakeSupabase(root, { state, live, after = null, hooks = {} }) {
  const calls = { catalog: 0, deploy: 0, download: {} };
  const fns = {
    [GNQ]: { version: 41, status: "ACTIVE", verify_jwt: false, files: filesOf(live.gnq) },
    [PE]: { version: 9, status: "ACTIVE", verify_jwt: false, files: filesOf(live.pe) },
  };
  const phase = () => (calls.deploy > 0 && after ? after : ROWS[state]);
  const transport = {
    kind: "synthetic",
    linkedRef: () => readFileSync(join(root, "supabase", ".temp", "project-ref"), "utf8").trim(),
    queryCatalog: () => { calls.catalog++; return hooks.catalog ? hooks.catalog(phase().catalog) : phase().catalog; },
    queryLedger: () => phase().ledger,
    listFunctions: () => Object.entries(fns).map(([slug, f]) => ({ slug, version: f.version, status: f.status, verify_jwt: f.verify_jwt })),
    downloadFunction: (_ref, slug) => {
      calls.download[slug] = (calls.download[slug] ?? 0) + 1;
      if (hooks.download) hooks.download(slug);
      return { read: mapReader(fns[slug].files), cleanup: () => {} };
    },
    deploy: (_ref, slug) => {
      calls.deploy++;
      fns[slug].version += 1;
      fns[slug].files = filesOf(treeReader(root));
      hooks.afterDeploy?.(fns);
    },
  };
  return { transport, calls, fns };
}

async function setup(slug, { candidate = tree, state = 3, live, after = null, hooks = {}, now } = {}) {
  const root = checkout(candidate);
  const s = fakeSupabase(root, { state, live, after, hooks });
  const out = [];
  const io = { root, transport: s.transport, log: (x) => out.push(String(x)), err: (x) => out.push(String(x)), ...(now ? { now } : {}) };
  const hash = classify(slug, treeReader(root)).hash;
  const run = (...extra) => main(["deploy", "--function", slug, "--project-ref", REF, "--expect-candidate", hash, ...extra], io);
  return { root, ...s, out, io, hash, run, record: join(root, "record.json"), text: () => out.join(" | ") };
}

test("usage: only the documented flags and the two functions", async () => {
  const s = await setup(PE, { live: { gnq: tree, pe: tree } });
  assert.equal(main(["deploy", "--function", "buy-item", "--project-ref", REF, "--expect-candidate", s.hash], s.io), 1);
  assert.equal(main(["deploy", "--project-ref", REF, "--expect-candidate", s.hash], s.io), 1, "--function is required");
  assert.equal(s.run("--execute"), 1, "--execute without --record");
  assert.equal(s.run("--catalog", "x.json"), 1, "the gate reads the database itself");
  assert.equal(main(["contracts"], s.io), 0);
  assert.equal(s.calls.catalog + s.calls.deploy, 0);
});

test("trin 5 in the planned order: F8's process-event first (next to #740), then F8's get-next-question — both verified", async () => {
  // 5.2 — process-event: DB3, live gnq #740, live process-event before F8.
  const s = await setup(PE, { live: { gnq: withOldGnq(), pe: withOldPe() } });
  assert.equal(s.run(), 0, s.text());
  assert.match(s.text(), /DRY RUN OK/);
  assert.equal(s.calls.deploy, 0, "a dry run deploys nothing");
  assert.equal(s.run("--execute", "--record", s.record), 0, s.text());
  const rec = JSON.parse(readFileSync(s.record, "utf8"));
  assert.equal(rec.verified, true);
  assert.equal(rec.function, PE);
  assert.equal(rec.before.other.class, "#740 (course scope)");
  assert.equal(rec.after.live.version, 10);
  assert.equal(rec.after.other.version, 41, "get-next-question untouched");
  // 5.3 — get-next-question, now that F8's process-event is live.
  const t = await setup(GNQ, { live: { gnq: withOldGnq(), pe: tree } });
  assert.equal(t.run("--execute", "--record", t.record), 0, t.text());
  assert.equal(JSON.parse(readFileSync(t.record, "utf8")).verified, true);
});

test("the WRONG order is refused: F8's get-next-question while process-event is before F8 → NOT READY, nothing deployed", async () => {
  const s = await setup(GNQ, { live: { gnq: withOldGnq(), pe: withOldPe() } });
  assert.equal(s.run("--execute", "--record", s.record), 2);
  assert.match(s.text(), /Deploy F8's process-event FIRST/);
  assert.equal(s.calls.deploy, 0);
  assert.equal(existsSync(s.record), false);
});

test("mixed versions on rollback: process-event before F8 next to F8's get-next-question → NOT READY", async () => {
  const s = await setup(PE, { candidate: withOldPe(), state: 3, live: { gnq: tree, pe: tree } });
  assert.equal(s.run(), 2);
  assert.match(s.text(), /no activation check|removes the activation check/);
  assert.equal(s.calls.deploy, 0);
});

test("incompatible database states: F8's process-event on DB2 or DB0, process-event before F8 on DB3 → NOT READY", async () => {
  for (const state of [0, 2]) {
    const s = await setup(PE, { state, live: { gnq: withOldGnq(), pe: withOldPe() } });
    assert.equal(s.run(), 2, `DB${state}`);
    assert.match(s.text(), /reads activation_no.*needs DB3/);
  }
  const t = await setup(PE, { candidate: withOldPe(), state: 3, live: { gnq: withOldGnq(), pe: withOldPe() } });
  assert.equal(t.run(), 2);
  assert.match(t.text(), /on DB3 only F8's process-event is accepted/);
  // Ordinary teaching during the transition: before F8 on DB2 next to #740 is accepted (as production runs today).
  const u = await setup(PE, { candidate: withOldPe(), state: 2, live: { gnq: withOldGnq(), pe: withOldPe() } });
  assert.equal(u.run(), 0, u.text());
  assert.match(u.text(), /ALREADY DEPLOYED/, "the same source is recognised as deployed");
});

test("DB3 with one fact changed is refused for F8's process-event: an altered table is no reviewed state; a widened grant fails the full review", async () => {
  // A table fact changed: rolloutState no longer recognises DB3 at all.
  const db = await database(3);
  await db.exec("ALTER TABLE public.question_instances ALTER COLUMN activation_no DROP NOT NULL;");
  const changed = await rowsOf(db);
  const s = await setup(PE, { live: { gnq: withOldGnq(), pe: withOldPe() }, hooks: { catalog: () => changed.catalog } });
  assert.equal(s.run(), 2);
  assert.match(s.text(), /UNKNOWN \(not a reviewed state\)/);
  assert.equal(s.calls.deploy, 0);
  // Bodies and table as F8 leaves them (still recognised as DB3), but the pupil role may call F8's resume RPC: the full
  // catalog review (checkCatalog for DB3) refuses it.
  const db2 = await database(3);
  await db2.exec("GRANT EXECUTE ON FUNCTION public.resume_parked_course_round(uuid, text, text) TO anon;");
  const granted = await rowsOf(db2);
  const t = await setup(PE, { live: { gnq: withOldGnq(), pe: withOldPe() }, hooks: { catalog: () => granted.catalog } });
  assert.equal(t.run(), 2);
  assert.match(t.text(), /DB3 \(all three migrations, F8\)/);
  assert.match(t.text(), /resume_parked_course_round.*anon has EXECUTE/);
  assert.equal(t.calls.deploy, 0);
});

test("a missing activation check in the CANDIDATE is refused before any database read", async () => {
  const stripped = tree(PE_INDEX).replace(/(^|[^\w.])activationVerdict\s*\(/gm, "$1noCheck(");
  const s = await setup(PE, { candidate: overlay(tree, { [PE_INDEX]: stripped }), live: { gnq: tree, pe: tree } });
  assert.equal(s.run(), 3);
  assert.match(s.text(), /INCOMPLETE.*activationVerdict\(\)/);
  assert.equal(s.calls.catalog, 0);
});

test("wrong manifests and hashes: another expected hash, an uncommitted byte, an unreadable or INCOMPLETE live partner", async () => {
  const s = await setup(PE, { live: { gnq: withOldGnq(), pe: withOldPe() } });
  assert.equal(main(["deploy", "--function", PE, "--project-ref", REF, "--expect-candidate", "0".repeat(64)], s.io), 3);
  assert.match(s.text(), /is candidate [0-9a-f]{64}, not 0{64}/);
  writeFileSync(join(s.root, "supabase", "functions", PE, "round-parked.ts"), tree("functions/process-event/round-parked.ts") + "\n");
  assert.equal(s.run(), 3);
  assert.match(s.text(), /differ from the commit/);

  const u = await setup(PE, { live: { gnq: withOldGnq(), pe: withOldPe() }, hooks: { download: (slug) => { if (slug === GNQ) throw new Error("bundle missing"); } } });
  assert.equal(u.run(), 2);
  assert.match(u.text(), /live get-next-question is unknown.*bundle missing/);

  const stripped = tree(PE_INDEX).replace(/(^|[^\w.])isRoundParkedError\s*\(/gm, "$1noCheck(");
  const v = await setup(GNQ, { live: { gnq: withOldGnq(), pe: overlay(tree, { [PE_INDEX]: stripped }) } });
  assert.equal(v.run(), 2);
  assert.match(v.text(), /live process-event is INCOMPLETE/);
});

test("stale reads are refused: a catalog older than the limit, or from the future", async () => {
  const later = () => new Date(Date.now() + 20 * 60_000);
  const s = await setup(PE, { live: { gnq: withOldGnq(), pe: withOldPe() }, now: later });
  assert.equal(s.run(), 2);
  assert.match(s.text(), /older than 15 min/);
  const earlier = () => new Date(Date.now() - 5 * 60_000);
  const t = await setup(PE, { live: { gnq: withOldGnq(), pe: withOldPe() }, now: earlier });
  assert.equal(t.run(), 2);
  assert.match(t.text(), /lies in the future/);
});

test("one Edge deploy at a time: the lock is gnq-deploy-preflight's file, and it is released after every outcome", async () => {
  const s = await setup(PE, { live: { gnq: withOldGnq(), pe: withOldPe() } });
  const lock = lockPath(s.root);
  writeFileSync(lock, "{}\n");
  assert.equal(s.run(), 3);
  assert.match(s.text(), /another Edge deploy holds/);
  unlinkSync(lock);
  assert.equal(s.run(), 0);
  assert.equal(existsSync(lock), false);
});

test("the after-check: the OTHER function changing during the deploy, or this one not becoming the candidate → exit 4", async () => {
  const s = await setup(PE, { live: { gnq: withOldGnq(), pe: withOldPe() }, hooks: { afterDeploy: (fns) => { fns[GNQ].version += 1; fns[GNQ].files = filesOf(tree); } } });
  assert.equal(s.run("--execute", "--record", s.record), 4);
  assert.match(s.text(), /get-next-question changed during the deploy/);
  assert.equal(JSON.parse(readFileSync(s.record, "utf8")).verified, false);

  const t = await setup(PE, { live: { gnq: withOldGnq(), pe: withOldPe() }, hooks: { afterDeploy: (fns) => { fns[PE].files = filesOf(withOldPe()); fns[PE].verify_jwt = true; } } });
  assert.equal(t.run("--execute", "--record", t.record), 4);
  assert.match(t.text(), /not the candidate/);
  assert.match(t.text(), /verify_jwt true/);

  const u = await setup(PE, { live: { gnq: withOldGnq(), pe: withOldPe() }, after: ROWS[2] });
  assert.equal(u.run("--execute", "--record", u.record), 4);
  assert.match(u.text(), /database functions changed|migration ledger changed|needs DB3/);
});

test("the real transport is the Supabase CLI with explicit argument vectors, the slug passed through, no shell", () => {
  const seen = [];
  const run = (bin, args, opts) => { seen.push({ bin, args, shell: opts.shell }); return { status: 0, stdout: args[0] === "db" ? "[]" : "[]", stderr: "" }; };
  const t = cliTransport(mkdtempSync(join(tmpdir(), "edge-gate-cli-")), { run });
  t.listFunctions(REF);
  t.deploy(REF, PE);
  t.queryCatalog();
  assert.ok(seen.every((c) => c.bin === "supabase" && c.shell === false));
  assert.deepEqual(seen[1].args.slice(0, 7), deployArgsFor(PE, REF));
  assert.deepEqual(deployArgsFor(PE, REF), ["functions", "deploy", "process-event", "--project-ref", REF, "--no-verify-jwt", "--use-api"]);
  assert.ok(seen[2].args.includes("--linked"));
});
