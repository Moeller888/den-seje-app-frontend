// D-110 tooling for the isolated E2E database: the replay plan (which repository migrations the
// isolated database replays, and why not the others) and the synthetic question seed.
//
// Pinned: every non-replayed migration has a stated reason and exists; "content only" files really
// are INSERT-only; every skipped dual-timestamp twin is token-equivalent to the applied one (the one
// known difference is a comment and ";;"); a blocked migration keeps schema validation failing; the
// seed meets every global-setup health-check threshold and the question constraints, is
// deterministic, idempotent, synthetic-only and INSERT-only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import {
  planReplay, summarise, CONTENT_ONLY, DATA_PRECONDITION, NOT_IN_PRODUCTION, REPO_AHEAD_OF_PRODUCTION, BLOCKED, MANUALLY_APPLIED_IN_PRODUCTION, TIMESTAMPED,
  PRECONDITIONS, preconditionCheckSql,
} from "../isolated/schema/replay-plan.mjs";
import { forbiddenMigrationTokens } from "../../.github/ci/classify-changes.mjs";
import { syntheticQuestions, syntheticQuestionsSql, DOMAINS, PER_GRADE } from "../isolated/seed/synthetic-questions.mjs";

const MIG = new URL("../../supabase/migrations/", import.meta.url);
const files = readdirSync(MIG);
const read = (f) => readFileSync(new URL(f, MIG), "utf8");
const { plan, manual, notReplayed } = planReplay(files, read);
const code = (sql) => sql.split("\r\n").join("\n").split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const tokens = (sql) => code(sql).replace(/\/\*[\s\S]*?\*\//g, "").toLowerCase().match(/[a-z0-9_]+|'[^']*'|[^\s;a-z0-9_]/g) || [];

// ── replay plan ─────────────────────────────────────────────────────────────────────────────
test("every timestamped migration gets exactly one decision; every non-apply has a reason", () => {
  assert.equal(plan.length, files.filter((f) => TIMESTAMPED.test(f)).length);
  for (const p of plan) {
    assert.ok(["apply", "skip", "blocked"].includes(p.action), p.file);
    if (p.action !== "apply") assert.ok(p.reason.length > 10, `${p.file} needs a reason`);
  }
  const s = summarise(plan);
  assert.equal(s.apply + s.skip + s.blocked, s.total);
});

test("the empty base migration (D-110 root) is skipped as empty", () => {
  const p = plan.find((x) => x.file === "20260317165405_remote_schema.sql");
  assert.ok(p && p.action === "skip" && p.reason.startsWith("empty file"));
  assert.equal(read("20260317165405_remote_schema.sql").trim(), "");
});

test("every named list entry exists — a stale entry would silently change what CI replays", () => {
  for (const list of [CONTENT_ONLY, DATA_PRECONDITION, NOT_IN_PRODUCTION, REPO_AHEAD_OF_PRODUCTION, BLOCKED, MANUALLY_APPLIED_IN_PRODUCTION]) {
    for (const f of Object.keys(list)) assert.ok(existsSync(new URL(f, MIG)), `${f} listed but missing`);
  }
});

test("content-only files are INSERT-only: no schema statement is lost by skipping them", () => {
  for (const f of Object.keys(CONTENT_ONLY)) {
    const c = code(read(f));
    assert.ok(/insert\s+into\s+public\.questions/i.test(c), `${f} inserts questions`);
    assert.ok(!/^\s*(create|alter|drop|grant|revoke|comment)\s/im.test(c), `${f} must not contain a schema statement`);
  }
});

test("skipped dual-timestamp twins are token-equivalent to the applied first copy (schema twins)", () => {
  const knownCommentOnly = new Set(["20260608110000_fix_set_student_domains_null_grade.sql"]); // inline comment + ";;"
  for (const p of plan.filter((x) => x.reason.startsWith("dual-timestamp twin of "))) {
    const first = p.reason.slice("dual-timestamp twin of ".length);
    assert.ok(existsSync(new URL(first, MIG)), first);
    const a = read(first), b = read(p.file);
    const isContent = CONTENT_ONLY[first] || /insert\s+into\s+public\.questions/i.test(code(a));
    const isData = forbiddenMigrationTokens(a).length === 0 && forbiddenMigrationTokens(b).length === 0; // skipped as data anyway
    if (isContent || isData || knownCommentOnly.has(p.file)) continue;
    assert.equal(tokens(b).join(" "), tokens(a).join(" "), `${p.file} differs from ${first} beyond comments`);
  }
});

test("blocked migrations keep schema validation failing; none is silently skipped", () => {
  for (const f of Object.keys(BLOCKED)) {
    const p = plan.find((x) => x.file === f);
    assert.equal(p.action, "blocked", f);
  }
  assert.ok(summarise(plan).blocked > 0 === Object.keys(BLOCKED).length > 0);
});

test("a migration with preconditions is applied only after its objects are verified to exist", () => {
  const f = "20260919000000_review_answer_execute_lockdown.sql";
  const p = plan.find((x) => x.file === f);
  assert.equal(p.action, "apply");
  assert.deepEqual(p.requires, ["public.review_answer(uuid,integer,text,uuid)", "public.review_answer(uuid,integer,text)"]);
  const sql = preconditionCheckSql(f);
  assert.match(sql, /to_regprocedure\('public\.review_answer\(uuid,integer,text,uuid\)'\) IS NULL/);
  assert.match(sql, /to_regprocedure\('public\.review_answer\(uuid,integer,text\)'\) IS NULL/);
  assert.equal(preconditionCheckSql("20260101000000_none.sql"), null);
  // The file really does need them: it revokes on exactly these signatures.
  const src = read(f);
  for (const sig of ["review_answer(uuid, integer, text, uuid)", "review_answer(uuid, integer, text)"]) assert.ok(src.includes(sig), sig);
  for (const k of Object.keys(PRECONDITIONS)) assert.ok(existsSync(new URL(k, MIG)), k);
});

test("not-in-production and manual lists carry catalog evidence, manual files are idempotent", () => {
  for (const r of Object.values(NOT_IN_PRODUCTION)) assert.match(r, /not applied in production/);
  for (const r of Object.values(REPO_AHEAD_OF_PRODUCTION)) assert.match(r, /^repository ahead of production: .*open production task D-243/);
  assert.deepEqual(manual, Object.keys(MANUALLY_APPLIED_IN_PRODUCTION).sort());
  assert.deepEqual(notReplayed, []);
  for (const f of manual) {
    const c = code(read(f));
    assert.ok(!/create\s+(table|function|policy|index)\s+(?!if\s+not\s+exists)/i.test(c.replace(/create\s+or\s+replace\s+function/gi, "")), `${f} must be idempotent`);
    for (const m of c.matchAll(/add\s+column\s+(\S+)/gi)) assert.equal(m[1].toLowerCase(), "if", `${f}: ADD COLUMN must use IF NOT EXISTS`);
  }
});

// ── synthetic seed ──────────────────────────────────────────────────────────────────────────
const rows = syntheticQuestions();
const GRADE_MIN = { 3: 15, 4: 28, 5: 25, 6: 25, 7: 110, 8: 100, 9: 145 }; // tests/global-setup.ts

test("the seed meets every global-setup health-check threshold", () => {
  const src = readFileSync(new URL("../global-setup.ts", import.meta.url), "utf8");
  assert.ok(src.includes("const TOTAL_MIN = 450;") && src.includes("const DOMAIN_MIN = 35;"), "thresholds moved — update this test");
  const active = rows.filter((r) => r.is_active);
  assert.ok(active.length >= 450);
  for (const [g, m] of Object.entries(GRADE_MIN)) assert.ok(active.filter((r) => r.target_grade === Number(g)).length >= m, `grade ${g}`);
  for (const d of DOMAINS) assert.ok(active.filter((r) => r.learning_objective === d).length >= 35, d);
  for (const g of Object.keys(GRADE_MIN)) {
    const bands = {};
    for (const r of active.filter((x) => x.target_grade === Number(g))) bands[r.difficulty_band] = (bands[r.difficulty_band] ?? 0) + 1;
    assert.ok(Object.values(bands).filter((n) => n >= 3).length >= 2, `grade ${g} bands`);
  }
  assert.deepEqual(Object.keys(PER_GRADE).map(Number), [3, 4, 5, 6, 7, 8, 9]);
});

test("every row satisfies the question constraints the app relies on", () => {
  const texts = new Set();
  for (const r of rows) {
    assert.ok(r.question_type === "auto" && r.is_active && r.learning_objective, "active ⇒ auto ⇒ objective");
    assert.ok(typeof r.content.correct === "string" && r.content.correct.length > 0);
    assert.ok(r.difficulty >= 1 && r.difficulty <= 1000 && r.difficulty_band >= 1 && r.difficulty_band <= 5);
    assert.ok(r.target_grade >= 3 && r.target_grade <= 9);
    if (r.answer_format === "mc") { assert.ok(r.content.options.length >= 2 && r.content.options.includes(r.content.correct)); assert.equal(r.type, "mc_single"); }
    else if (r.answer_format === "text") { assert.ok(!("options" in r.content)); assert.equal(r.type, "text_input"); }
    else { assert.equal(r.answer_format, "number"); assert.match(r.content.correct, /^\d+$/); assert.equal(r.type, "number_input"); }
    assert.ok(!texts.has(r.content.question), "unique question text");
    texts.add(r.content.question);
    assert.equal(r.metadata.synthetic, true);
    assert.ok(r.content.question.startsWith("Syntetisk "), "synthetic by construction");
  }
  // Production's active pool: multiple choice plus exactly two typed questions, world_war_2 grade 7.
  const typed = rows.filter((r) => r.answer_format !== "mc");
  assert.deepEqual(typed.map((r) => [r.answer_format, r.learning_objective, r.target_grade]),
    [["text", "world_war_2", 7], ["text", "world_war_2", 7]]);
});

test("the seed is deterministic, idempotent and INSERT-only — no destructive SQL anywhere in the seed code", () => {
  assert.equal(JSON.stringify(syntheticQuestions()), JSON.stringify(rows));
  const sql = syntheticQuestionsSql();
  assert.ok(sql.startsWith("INSERT INTO public.questions") && sql.trimEnd().endsWith("ON CONFLICT DO NOTHING;"));
  assert.equal(syntheticQuestionsSql(), sql);
  assert.ok(!/\b(hotmail|@[a-z0-9-]+\.(dk|com))\b/i.test(sql), "no real address");
  for (const f of ["../isolated/seed/synthetic-questions.mjs", "../isolated/seed/seed-guard.mjs"]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    assert.ok(!/\b(TRUNCATE|DELETE\s+FROM)\b/i.test(src), `${f} must contain no TRUNCATE / DELETE`);
    assert.ok(!/\bDROP\s+(TABLE|SCHEMA|DATABASE)\b/i.test(src), `${f} must not drop tables/schemas/databases`);
  }
});
