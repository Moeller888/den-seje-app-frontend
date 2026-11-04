// Objective targeting in get-next-question (Lærligverse F4-B, D-329). Offline: the real module the Edge
// Function runs, plus source checks of index.ts. The behaviour against the real backend is tested in
// tests/isolated/laerligverse-objective.isolated.spec.mjs.
//
// What must hold:
//   * OFF by default — no flag, a wrong flag value, or no learning_objective: today's behaviour (the
//     release gate's v179 off-parity proves the calls are byte-identical; see get-next-question-release-gate).
//   * Targeting can only NARROW the server-derived scope; it can never widen it or reach another subject.
//   * A targeted request never reaches the repeat step (audit finding E2: no artificial mini-scope).
//   * An open instance of another objective is not served as this objective's question, and not released.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { OBJECTIVE_ID, openInstanceMatches, resolveObjectiveTargeting } from "../../supabase/functions/get-next-question/objective-target.ts";
import { deriveQuestionScope, HISTORY_DOMAINS } from "../../supabase/functions/get-next-question/scope.ts";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const INDEX_CODE = stripComments(readFileSync(join(REPO, "supabase/functions/get-next-question/index.ts"), "utf8"));

const historyScope = deriveQuestionScope({ active_domains: ["world_war_2", "cold_war"], selected_grade: 8 }, "historie");

test("off unless the flag is exactly \"on\": the field is ignored, whatever it holds", () => {
  for (const flag of [undefined, null, "", "off", "ON", "true", "1", " on"]) {
    assert.deepEqual(resolveObjectiveTargeting(flag, "world_war_2", historyScope.subjectDomains), { mode: "off" }, String(flag));
    assert.deepEqual(resolveObjectiveTargeting(flag, "anything; drop table", historyScope.subjectDomains), { mode: "off" });
  }
});

test("on, but no objective asked for: today's behaviour", () => {
  assert.deepEqual(resolveObjectiveTargeting("on", undefined, historyScope.subjectDomains), { mode: "off" });
  assert.deepEqual(resolveObjectiveTargeting("on", null, historyScope.subjectDomains), { mode: "off" });
});

test("a valid objective inside the pupil's server-derived scope narrows to exactly that objective", () => {
  assert.deepEqual(resolveObjectiveTargeting("on", "world_war_2", historyScope.subjectDomains), { mode: "on", objective: "world_war_2" });
});

test("malformed ids are refused with 400 (no injection, no arrays, no prototype names)", () => {
  for (const bad of ["", "World_War_2", "world war 2", "world_war_2;", "../x", "a".repeat(65), 7, true, ["world_war_2"], { id: "world_war_2" }, "__proto__x"]) {
    const r = resolveObjectiveTargeting("on", bad, historyScope.subjectDomains);
    if (typeof bad === "string" && OBJECTIVE_ID.test(bad)) assert.equal(r.mode, "error", String(bad));
    else assert.deepEqual(r, { mode: "error", status: 400, error: "invalid_learning_objective" }, JSON.stringify(bad));
  }
});

test("targeting never widens the scope: outside the teacher's domains, another subject, or unknown → 403", () => {
  // Valid history domain, but not among this pupil's assigned domains.
  assert.deepEqual(resolveObjectiveTargeting("on", "vikings", historyScope.subjectDomains), { mode: "error", status: 403, error: "learning_objective_not_allowed" });
  // Another subject's domain while the subject is history.
  assert.deepEqual(resolveObjectiveTargeting("on", "english", historyScope.subjectDomains), { mode: "error", status: 403, error: "learning_objective_not_allowed" });
  // A made-up objective id (LP-2 ids do not exist yet).
  assert.deepEqual(resolveObjectiveTargeting("on", "hist_besaettelsen_h4_kilde", historyScope.subjectDomains), { mode: "error", status: 403, error: "learning_objective_not_allowed" });
  // Unfiltered pupil: any history domain is allowed, English still is not.
  const all = deriveQuestionScope({ active_domains: null }, "historie").subjectDomains;
  assert.deepEqual([...all], [...HISTORY_DOMAINS]);
  assert.equal(resolveObjectiveTargeting("on", "vikings", all).mode, "on");
  assert.equal(resolveObjectiveTargeting("on", "english", all).mode, "error");
});

test("an open instance matches only its own objective when targeting; anything matches when off", () => {
  const on = { mode: "on", objective: "world_war_2" };
  assert.equal(openInstanceMatches(on, "world_war_2"), true);
  assert.equal(openInstanceMatches(on, "cold_war"), false);
  assert.equal(openInstanceMatches(on, undefined), false);
  assert.equal(openInstanceMatches({ mode: "off" }, "cold_war"), true);
});

test("index.ts: the objective is checked against scope.subjectDomains (server-derived) BEFORE the scope is used", () => {
  const resolve = INDEX_CODE.indexOf('resolveObjectiveTargeting(Deno.env.get("LAERLIGVERSE_OBJECTIVE_TARGETING"), body?.learning_objective, scope.subjectDomains)');
  const narrow = INDEX_CODE.indexOf("scope.subjectDomains = [targeting.objective];");
  const use = INDEX_CODE.indexOf("const subjectDomains = scope.subjectDomains;");
  assert.ok(resolve > 0 && narrow > resolve && use > narrow, "resolve → narrow → use");
  assert.match(INDEX_CODE, /if \(targeting\.mode === "error"\) \{\s*return new Response\(JSON\.stringify\(\{ error: targeting\.error \}\), \{[\s\S]{0,160}status: targeting\.status,/);
});

test("index.ts: a targeted request returns objective_exhausted BEFORE the repeat step (E2)", () => {
  const exhausted = INDEX_CODE.indexOf('if (!inserted && targeting.mode === "on") {');
  const repeat = INDEX_CODE.search(/if \(!inserted\) \{[\s\S]{0,600}request_repeat_question/);
  assert.ok(exhausted > 0 && repeat > exhausted, "the targeted early return comes first");
  const block = INDEX_CODE.slice(exhausted, repeat);
  assert.match(block, /step: "no_questions", reason: "objective_exhausted"/);
  // A lost race for the one open instance is a 409, checked BEFORE "exhausted" is claimed.
  assert.ok(block.indexOf('error: "open_question_exists"') > 0 && block.indexOf('error: "open_question_exists"') < block.indexOf("objective_exhausted"));
  assert.match(block, /\.from\("question_instances"\)\s*\.select\("id"\)\s*\.eq\("student_id", student_id\)\s*\.eq\("answered", false\)/);
});

test("index.ts: an open instance of another objective is a 409 with no release and no other side effect", () => {
  assert.match(INDEX_CODE, /if \(!openInstanceMatches\(targeting, q\.learning_objective\)\) \{\s*return new Response\(JSON\.stringify\(\{ error: "open_question_other_objective" \}\), \{[\s\S]{0,120}status: 409,/);
  // The objective of the open instance is read only when targeting, so the off-path query is unchanged.
  assert.match(INDEX_CODE, /questions \(\$\{targeting\.mode === "on" \? "\\n {10}learning_objective," : ""\}/);
  // The one release in the function is still the subject-level one.
  assert.equal((INDEX_CODE.match(/release_open_question_outside/g) ?? []).length, 1);
});

test("index.ts: the served objective is echoed only when targeting (so a client can detect a server that ignores it)", () => {
  const echoes = INDEX_CODE.match(/\.\.\.\(targeting\.mode === "on" \? \{ learning_objective: targeting\.objective \} : \{\}\),/g) ?? [];
  assert.equal(echoes.length, 3, "due, repeat and new-question responses");
});

test("index.ts (D-338): in targeting mode the targeted objective is added to the subject-switch release domains, so its open round is resumed, not released", () => {
  const narrow = INDEX_CODE.indexOf("scope.subjectDomains = [targeting.objective];");
  const keep = INDEX_CODE.indexOf("if (!scope.releaseDomains.includes(targeting.objective)) scope.releaseDomains = [...scope.releaseDomains, targeting.objective];");
  const release = INDEX_CODE.search(/"release_open_question_outside",\s*\{ p_domains: scope\.releaseDomains \}/);
  assert.ok(narrow > 0 && keep > narrow && release > keep, "narrow → keep the objective → release");
});
