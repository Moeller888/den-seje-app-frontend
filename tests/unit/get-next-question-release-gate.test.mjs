// Release gate for get-next-question (docs/operations/level-engine-rollout.md §3.1).
//
// 1. Off-parity: the real index.ts, with LEVEL_ENGINE missing, empty, "false", "true", "0", "off", "V1"
//    or " v1", behaves exactly as the deployed version 179 (commit 21ec9ff): the same status, body,
//    backend calls with their arguments and log lines, for every QUESTION_MIX_ENGINE mode, both
//    subjects and five situations. The v179 side is tests/fixtures/gnq-v179-parity.json, written by
//    `node tools/edge/gnq-release.mjs golden` from 21ec9ff through the same harness.
//    The one reviewed difference is H5 PR 2's round_no (D-266): withoutRoundNo checks it is present and
//    right, removes exactly it, and everything else must still be identical to v179.
// 2. No floating import: every non-relative import in the deployed module graph names an exact version,
//    and supabase-js is the pinned release version.
// 3. The candidate manifest documented in the runbook is the manifest of this tree.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  B_FUNCTIONS, LEVEL_TABLES, MIX_VALUES, OFF_VALUES, SCENARIOS, SUBJECTS, caseKey, loadHandler, runCase,
} from "./helpers/gnq-parity-harness.mjs";
import {
  ENTRY, IMPORT_MAP, ROLLBACK_COMMIT, SUPABASE_JS_PINNED, SUPABASE_JS_VERSION, externalImports, graphFiles,
  isPinned, manifest, workingTreeReader,
} from "../../tools/edge/gnq-release.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GOLDEN = JSON.parse(readFileSync(join(ROOT, "tests", "fixtures", "gnq-v179-parity.json"), "utf8"));
const RUNBOOK = readFileSync(join(ROOT, "docs", "operations", "level-engine-rollout.md"), "utf8");
const read = workingTreeReader(ROOT);
// Loaded once for the parity tests; a load failure fails them, while the import guard below still runs.
const loaded = loadHandler(join(ROOT, "supabase", ENTRY));
loaded.catch(() => {});

// H5 PR 2 (D-266): every served question carries round_no = repeat_count + 1 of the row served (the
// harness rows: due-1 and new-inst 0, rep-1 1), and every question_instances read and the insert also
// select repeat_count. This asserts both, then removes exactly that and nothing else.
const ROUND_NO = Object.freeze({ "due-1": 1, "new-inst": 1, "rep-1": 2 });
function withoutRoundNo(r, label) {
  let body = r.body;
  if (r.status === 200 && body.includes('"question_instance_id"')) {
    const parsed = JSON.parse(body);
    assert.equal(parsed.round_no, ROUND_NO[parsed.question_instance_id], `${label}: round_no`);
    delete parsed.round_no;
    body = JSON.stringify(parsed);
  } else {
    assert.equal(body.includes("round_no"), false, `${label}: round_no only on a served question`);
  }
  const calls = r.calls.map((c) => {
    if (c.kind !== "from" || c.name !== "question_instances") return c;
    const ops = c.ops.map((o) => {
      // Only the reads that serve an instance (due, repeat) and the insert start with id; the format
      // mix's history read does not, and stays compared unchanged.
      if (o[0] !== "select" || !/^\s*id\b/.test(o[1])) return o;
      assert.match(o[1], /\brepeat_count\b/, `${label}: question_instances select without repeat_count`);
      const stripped = o[1] === "id, repeat_count" ? "id" : o[1].replace(/\n\s*repeat_count,/, "");
      assert.equal(/repeat_count/.test(stripped), false, `${label}: repeat_count once per select`);
      return [o[0], stripped];
    });
    return { ...c, ops };
  });
  return { ...r, body, calls };
}

const touchesLevelEngine = (r) => r.calls.some((c) => B_FUNCTIONS.includes(c.name) || LEVEL_TABLES.includes(c.name))
  || r.logs.some((l) => l.includes("LEVEL_ENGINE:"));

test("the golden file is v179's: 30 cases from 21ec9ff, covering every mix mode, subject and situation", () => {
  assert.match(GOLDEN.source, new RegExp(`^${ROLLBACK_COMMIT} `));
  assert.equal(Object.keys(GOLDEN.cases).length, MIX_VALUES.length * SUBJECTS.length * SCENARIOS.length);
  for (const r of Object.values(GOLDEN.cases)) assert.equal(touchesLevelEngine(r), false);
  // The golden cases are not vacuous: they serve a due, a new and a repeat question, say no_questions and fail loud.
  const bodies = Object.values(GOLDEN.cases).map((r) => `${r.status} ${r.body}`);
  for (const want of ["due-1", "new-inst", "rep-1", "no_questions", "500 "]) assert.ok(bodies.some((b) => b.includes(want)), want);
});

test("the first request of a fresh isolate (key-source log included) matches v179's", async () => {
  const { warmup } = await loaded;
  assert.deepEqual(withoutRoundNo(warmup, "warmup"), GOLDEN.warmup);
  assert.ok(warmup.logs.some((l) => l.includes("[supabase-keys]")), "the once-per-isolate log is part of the comparison");
});

test("LEVEL_ENGINE off (missing, empty, false, true, 0, off, V1, \" v1\"): identical to v179 in status, body, calls and logs, apart from round_no", async () => {
  const { handler } = await loaded;
  let runs = 0;
  for (const level of OFF_VALUES) for (const mix of MIX_VALUES) for (const subject of SUBJECTS) for (const s of SCENARIOS) {
    const c = { mix, level, subject, scenario: s };
    const got = await runCase(handler, c);
    const label = `LEVEL_ENGINE=${level === undefined ? "<missing>" : JSON.stringify(level)} ${caseKey(c)}`;
    assert.deepEqual(withoutRoundNo(got, label), GOLDEN.cases[caseKey(c)], label);
    assert.ok(!got.calls.some((x) => B_FUNCTIONS.includes(x.name)), `${label}: a B function was called`);
    assert.ok(!got.calls.some((x) => LEVEL_TABLES.includes(x.name)), `${label}: a level table was read or written`);
    assert.ok(!got.logs.some((l) => l.includes("LEVEL_ENGINE:")), `${label}: level log line`);
    runs++;
  }
  assert.equal(runs, OFF_VALUES.length * MIX_VALUES.length * SUBJECTS.length * SCENARIOS.length);
});

test("negative control: LEVEL_ENGINE=\"v1\" is caught by the same comparison (B functions called, behaviour differs)", async () => {
  const { handler } = await loaded;
  const c = { mix: undefined, level: "v1", subject: "historie", scenario: "new" };
  const got = await runCase(handler, c);
  assert.notDeepEqual(got, GOLDEN.cases[caseKey(c)]);
  assert.deepEqual(got.calls.filter((x) => x.kind === "rpc").map((x) => x.name),
    ["release_open_question_outside", "advance_student_level", "get_level_questions_for_student"]);
  assert.ok(touchesLevelEngine(got));
});

test("no floating import: every external import in the deployed graph names an exact version", () => {
  const external = externalImports(read);
  assert.ok(external.length > 0);
  for (const { file, specifier } of external) assert.ok(isPinned(specifier), `${file}: floating import ${specifier}`);
  assert.deepEqual(
    external.filter((e) => e.specifier.includes("supabase-js")).map((e) => e.specifier),
    [SUPABASE_JS_PINNED],
  );
  // A bare specifier would resolve through deno.json; none is used, so its entries cannot float in.
  const map = JSON.parse(read(IMPORT_MAP)).imports ?? {};
  for (const { specifier } of external) assert.ok(!(specifier in map), `${specifier} resolves through deno.json`);
});

test("the guard itself: floating specifiers are rejected, exact ones accepted", () => {
  for (const s of [
    "https://esm.sh/@supabase/supabase-js@2", "https://esm.sh/@supabase/supabase-js@^2.1.0", "https://esm.sh/@supabase/supabase-js",
    "https://esm.sh/@supabase/supabase-js@latest", "https://deno.land/std/http/server.ts", "https://esm.sh/x@2.1",
    "npm:@supabase/supabase-js@2", "npm:@supabase/supabase-js@^2.118.0", "jsr:@supabase/functions-js@^2", "jsr:@std/assert",
    "@supabase/supabase-js",
  ]) assert.equal(isPinned(s), false, s);
  for (const s of [
    SUPABASE_JS_PINNED, "https://deno.land/std@0.168.0/http/server.ts", "npm:@supabase/supabase-js@2.118.0",
    "jsr:@supabase/functions-js@2.4.1",
  ]) assert.equal(isPinned(s), true, s);
});

test("the runbook records this tree's candidate manifest, the pinned supabase-js and the rollback source", () => {
  const m = manifest(read, graphFiles(read));
  assert.equal(m.files.length, 13);
  assert.ok(m.files.includes("functions/get-next-question/level-flow.ts"));
  assert.ok(m.files.includes("functions/_shared/match-pairs.ts"));
  assert.ok(RUNBOOK.includes(m.hash), `runbook §3.1 must name the candidate manifest ${m.hash}`);
  assert.ok(RUNBOOK.includes(`supabase-js@${SUPABASE_JS_VERSION}`));
  assert.ok(RUNBOOK.includes(`\`${ROLLBACK_COMMIT}\``));
});
