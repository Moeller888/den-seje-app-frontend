// tools/edge/gnq-deploy-preflight.mjs: the technical gate for the deploy ORDER of get-next-question (D-383).
// Its catalog query runs here, unmodified, against PGlite databases in the three rollout states — production's chain
// (DB0), after 20261120150000 (DB1), after both migrations (DB2) — and against DB2 with one thing changed. Only DB2 as
// reviewed passes; the receipt binds environment, candidate bytes, database facts and time, and is good for one deploy.
//
// HONEST LIMITS: PGlite is PostgreSQL 18.x as superuser; production's EXECUTE grantees may list more roles than PGlite
// (e.g. supabase_admin) — the check only REQUIRES and FORBIDS named roles, so extra roles pass and a missing or an
// unwanted one refuses. The environment binding is the operator's declared ref, the CLI's linked ref and the receipt:
// the database itself cannot name its project. Nothing here connects to Supabase.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { answerChainSql, extractFunction, readMigration } from "./helpers/answer-chain-schema.mjs";
import {
  ABSENT_FUNCTIONS, REQUIRED_FUNCTIONS, candidateHash, catalogSql, checkCatalog, checkReceipt, main, makeReceipt,
  parseCatalog, rolloutState,
} from "../../tools/edge/gnq-deploy-preflight.mjs";
import { graphFiles, workingTreeReader } from "../../tools/edge/gnq-release.mjs";

const REF = "abcdefghijklmnopqrst";
const OTHER_REF = "zyxwvutsrqponmlkjihg";
const D383 = "20261120150000_course_items_out_of_ordinary_quiz.sql";
const SCOPE = "20261123100000_course_scope_before_candidate_limit.sql";

async function database(state) {
  const db = new PGlite();
  for (const s of answerChainSql()) await db.exec(s);
  await db.exec(extractFunction("20261016160000_answer_keys_server_side_rpcs.sql", "get_unserved_questions_for_student"));
  await db.exec(`REVOKE ALL ON FUNCTION public.get_unserved_questions_for_student(uuid, smallint, text[]) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.get_unserved_questions_for_student(uuid, smallint, text[]) TO service_role;`);
  for (const f of ["20261031194600_mc_length_cue_answer_paths.sql", "20261102100000_release_open_rounds_on_inactive_questions.sql"]) await db.exec(readMigration(f));
  if (state >= 1) await db.exec(readMigration(D383));
  if (state >= 2) await db.exec(readMigration(SCOPE));
  return db;
}
async function catalogOf(db, ref = REF) {
  const r = await db.query(catalogSql(ref));
  assert.equal(r.rows.length, 1);
  return parseCatalog(r.rows); // the shape an operator copies from execute_sql: [{ preflight: … }]
}
const DBS = { 0: await database(0), 1: await database(1), 2: await database(2) };

test("the catalog query is one read-only SELECT over pg_proc: no table rows, no writes", () => {
  const sql = catalogSql(REF);
  const body = sql.replace(/^--.*$/m, "");
  assert.match(body.trim(), /^SELECT json_build_object\(/);
  assert.doesNotMatch(body, /\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|TRUNCATE|COPY|SET|DO)\b/);
  assert.doesNotMatch(body, /\b(question_instances|questions|profiles|auth\.users|student_)\w*\b(?!_)/i, "reads no table");
  for (const f of REQUIRED_FUNCTIONS) assert.ok(sql.includes(`'${f.sig}'`));
  for (const s of ABSENT_FUNCTIONS) assert.ok(sql.includes(`'${s}'`));
  assert.throws(() => catalogSql("x'; DROP TABLE x; --"), /invalid project ref/);
});

test("DB2 as the migrations leave it: ready; the expected facts are exactly what the two files create", async () => {
  const c = await catalogOf(DBS[2]);
  assert.equal(rolloutState(c), "DB2 (both migrations)");
  assert.deepEqual(checkCatalog(c, REF), []);
});

test("DB0 (production today) and DB1 (only D-383): NOT READY, and the state is named", async () => {
  const c0 = await catalogOf(DBS[0]);
  assert.equal(rolloutState(c0), "DB0 (neither migration)");
  const p0 = checkCatalog(c0, REF);
  assert.ok(p0.some((p) => /question_is_course_item\(jsonb\): missing/.test(p)));
  assert.ok(p0.some((p) => /still the body before D-383/.test(p)));
  const c1 = await catalogOf(DBS[1]);
  assert.equal(rolloutState(c1), "DB1 (20261120150000 only)");
  const p1 = checkCatalog(c1, REF);
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
      const problems = checkCatalog(await catalogOf(db), REF);
      assert.ok(problems.some((p) => expected.test(p)), `${label}: ${JSON.stringify(problems)}`);
    });
  }
});

test("the catalog itself: wrong project, too old, from the future, duplicated, malformed — all refused", async () => {
  const c = await catalogOf(DBS[2]);
  const readAt = Date.parse(c.read_at);
  assert.ok(checkCatalog(c, OTHER_REF).some((p) => /produced for abcdefghijklmnopqrst, not zyxwvutsrqponmlkjihg/.test(p)));
  assert.ok(checkCatalog(c, REF, { now: new Date(readAt + 16 * 60_000) }).some((p) => /older than 15 min/.test(p)));
  assert.ok(checkCatalog(c, REF, { now: new Date(readAt - 5 * 60_000) }).some((p) => /future/.test(p)));
  assert.ok(checkCatalog({ ...c, functions: [...c.functions, c.functions[0]] }, REF).some((p) => /twice/.test(p)));
  assert.ok(checkCatalog({ ...c, functions: c.functions.slice(1) }, REF).some((p) => /not in the catalog result/.test(p)));
  assert.ok(checkCatalog({ ...c, tool_version: 0 }, REF).some((p) => /tool version/.test(p)));
  for (const bad of ["", "[]", "{}", '[{"a":1},{"a":2}]', '{"preflight":{"functions":"x"}}']) {
    assert.throws(() => parseCatalog(bad));
  }
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

test("the receipt: intact, same environment, same candidate, fresh, DB2, and only once", async () => {
  const catalog = await catalogOf(DBS[2]);
  const now = new Date(Date.parse(catalog.read_at) + 60_000);
  const candidate = "a".repeat(64);
  const r = makeReceipt({ projectRef: REF, candidate, catalog, now });
  assert.equal(r.database_state, "DB2 (both migrations)");
  const ok = { projectRef: REF, candidate, now };
  assert.deepEqual(checkReceipt(r, ok), []);
  assert.ok(checkReceipt({ ...r, project_ref: OTHER_REF }, { ...ok, projectRef: OTHER_REF }).some((p) => /edited or damaged/.test(p)), "an edited field breaks the hash");
  assert.ok(checkReceipt(r, { ...ok, projectRef: OTHER_REF }).some((p) => /made for/.test(p)));
  assert.ok(checkReceipt(r, { ...ok, candidate: "b".repeat(64) }).some((p) => /candidate changed/.test(p)));
  assert.ok(checkReceipt(r, { ...ok, now: new Date(Date.parse(catalog.read_at) + 16 * 60_000) }).some((p) => /expired/.test(p)), "expiry counts from the DATABASE read, not from the check");
  assert.ok(checkReceipt(r, { ...ok, used: true }).some((p) => /already used/.test(p)));
  assert.ok(checkReceipt(null, ok).length > 0);
  const r1 = makeReceipt({ projectRef: REF, candidate, catalog: await catalogOf(DBS[1]), now });
  assert.ok(checkReceipt(r1, ok).some((p) => /database state DB1/.test(p)), "a receipt can never carry a non-ready state");
});

test("the CLI end to end in a temporary checkout: refuses wrong link and wrong candidate; check → verify → used", async () => {
  const root = mkdtempSync(join(tmpdir(), "gnq-preflight-"));
  const read = workingTreeReader();
  for (const f of graphFiles(read)) {
    const out = join(root, "supabase", f);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, read(f));
  }
  const candidate = candidateHash(read);
  const catalog = await catalogOf(DBS[2]);
  const catalogFile = join(root, "catalog.json");
  writeFileSync(catalogFile, JSON.stringify([{ preflight: catalog }]));
  const receiptFile = join(root, "receipt.json");
  const out = [];
  const io = { root, now: () => new Date(Date.parse(catalog.read_at) + 60_000), log: (s) => out.push(s), err: (s) => out.push(s) };
  const check = (ref, expect = candidate) => main(["check", "--project-ref", ref, "--catalog", catalogFile, "--expect-candidate", expect, "--receipt", receiptFile], io);

  assert.equal(main(["deploy", "--project-ref", REF], io), 1, "unknown command");
  assert.equal(main(["sql", "--project-ref", REF], io), 0);
  assert.equal(check(REF), 3, "no linked project → refused");
  mkdirSync(join(root, "supabase", ".temp"), { recursive: true });
  writeFileSync(join(root, "supabase", ".temp", "project-ref"), OTHER_REF + "\n");
  assert.equal(check(REF), 3, "linked to another project → refused");
  writeFileSync(join(root, "supabase", ".temp", "project-ref"), REF + "\n");
  assert.equal(check(REF, "c".repeat(64)), 3, "not the runbook's candidate → refused");
  assert.equal(existsSync(receiptFile), false, "no receipt from a refusal");
  assert.equal(check(REF), 0);
  assert.ok(existsSync(receiptFile));

  const verify = () => main(["verify", "--project-ref", REF, "--receipt", receiptFile], io);
  assert.equal(verify(), 0);
  assert.ok(out.some((s) => /^VERIFIED: .*supabase functions deploy get-next-question --project-ref abcdefghijklmnopqrst$/.test(s)));
  assert.equal(verify(), 3, "a receipt authorises one deploy");

  // A new receipt, then the candidate changes after the preflight: refused.
  rmUsed(receiptFile);
  assert.equal(check(REF), 0);
  const scope = join(root, "supabase", "functions", "get-next-question", "scope.ts");
  writeFileSync(scope, readFileSync(scope, "utf8") + "\n// changed after the preflight\n");
  assert.equal(verify(), 3);
  assert.ok(out.some((s) => /candidate changed after the preflight/.test(s)));
});

// A NEW check in the same place: the old receipt and its marker are removed, as an operator would start over.
function rmUsed(receiptFile) {
  for (const f of [receiptFile, `${receiptFile}.used`]) if (existsSync(f)) unlinkSync(f);
}
