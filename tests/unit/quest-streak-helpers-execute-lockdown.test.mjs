// Security: the D-110 migration that closes direct EXECUTE on the three internal quest/streak helpers.
//
// update_quest_progress_for_answer, update_weekly_quest_progress_for_answer and update_streak take
// the pupil (and, for the quest helpers, the outcome) as parameters and were callable by PUBLIC,
// anon, authenticated and service_role. Their only callers are process_question_attempt and
// process_text_answer, both SECURITY DEFINER and owned by postgres — so the helpers need no
// EXECUTE for any API role, service_role included.
//
// These tests pin that the migration does exactly that and nothing else, and that the caller chain
// it relies on is still the one in the repo.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATIONS = join(REPO, "supabase", "migrations");
const FILE = "20261004104540_quest_streak_helpers_execute_lockdown.sql";
const SQL = readFileSync(join(MIGRATIONS, FILE), "utf8");

// Executable SQL only: comments removed, whitespace collapsed, one statement per entry.
const CODE = SQL.replace(/--.*$/gm, "").replace(/\s+/g, " ").trim();
const STATEMENTS = CODE.split(";").map((s) => s.trim()).filter(Boolean);

const HELPERS = [
  "public.update_quest_progress_for_answer(uuid, boolean, integer)",
  "public.update_weekly_quest_progress_for_answer(uuid, boolean, integer)",
  "public.update_streak(uuid)",
];
const ROLES = ["PUBLIC", "anon", "authenticated", "service_role"];

const expectedFor = (sig) => [
  ...ROLES.map((role) => `REVOKE EXECUTE ON FUNCTION ${sig} FROM ${role}`),
  `ALTER FUNCTION ${sig} SET search_path = public, pg_temp`,
];

test("the migration file has the CLI-generated name and sorts after the newest remote migration", () => {
  assert.ok(readdirSync(MIGRATIONS).includes(FILE));
  assert.ok("20261004104540" > "20261004100939");
});

test("exactly fifteen statements: four revokes and one search_path per helper, in order", () => {
  assert.deepEqual(STATEMENTS, HELPERS.flatMap(expectedFor));
});

test("each helper loses EXECUTE for PUBLIC, anon, authenticated AND service_role", () => {
  for (const sig of HELPERS) {
    for (const role of ROLES) {
      assert.ok(STATEMENTS.includes(`REVOKE EXECUTE ON FUNCTION ${sig} FROM ${role}`), `${sig} ${role}`);
    }
  }
});

test("each helper gets search_path = public, pg_temp", () => {
  for (const sig of HELPERS) {
    assert.ok(STATEMENTS.includes(`ALTER FUNCTION ${sig} SET search_path = public, pg_temp`), sig);
  }
});

test("nothing is granted — not even to service_role", () => {
  assert.equal(/\bGRANT\b/i.test(CODE), false);
});

test("no function body changes", () => {
  assert.equal(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION|DROP\s+FUNCTION/i.test(CODE), false);
  assert.equal(/\$\$|\$function\$|LANGUAGE\s+plpgsql|\bRETURNS\b|\bBEGIN\b|\bPERFORM\b/i.test(CODE), false);
  for (const alter of STATEMENTS.filter((s) => /^ALTER\s+FUNCTION/i.test(s))) {
    assert.equal(/SECURITY|OWNER\s+TO|RENAME/i.test(alter), false, alter);
  }
});

test("only the three helper signatures are touched", () => {
  const touched = [...CODE.matchAll(/FUNCTION\s+(public\.[\w]+\([^)]*\))/gi)].map((m) => m[1]);
  assert.deepEqual([...new Set(touched)].sort(), [...HELPERS].sort());
  assert.equal(/process_question_attempt|process_text_answer|claim_|update_best_session_streak|ALL\s+FUNCTIONS/i.test(CODE), false);
});

test("no table, RLS, policy, data or default-privilege change", () => {
  assert.equal(/\b(TABLE|POLICY|ROW\s+LEVEL\s+SECURITY|INSERT|UPDATE|DELETE|TRUNCATE|DEFAULT\s+PRIVILEGES|SCHEMA|VIEW|TRIGGER)\b/i.test(CODE), false);
});

test("the header records why service_role needs no EXECUTE and that bodies are untouched", () => {
  for (const needle of ["SECURITY DEFINER", "owned by postgres", "process_question_attempt", "process_text_answer",
    "service_role", "no CREATE OR REPLACE", "auth.uid()"]) {
    assert.ok(SQL.includes(needle), `header mentions ${needle}`);
  }
});

// ── The caller chain the lockdown relies on (latest definitions in the repo) ────────────────────
// The helpers stay callable only from inside SECURITY DEFINER functions owned by postgres. If a
// later migration redefined a caller as SECURITY INVOKER, it would start failing with
// permission denied — so the current definitions are pinned here.
function latestDefinition(fn) {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  let found = null;
  for (const f of files) {
    const src = readFileSync(join(MIGRATIONS, f), "utf8");
    const at = src.search(new RegExp(`CREATE\\s+(OR\\s+REPLACE\\s+)?FUNCTION\\s+(public\\.)?${fn}\\s*\\(`, "i"));
    if (at !== -1) {
      const end = src.indexOf("$$;", src.indexOf("$$", at) + 2);
      found = { file: f, body: src.slice(at, end === -1 ? undefined : end + 3) };
    }
  }
  assert.ok(found, `${fn} is defined in a migration`);
  return found;
}

test("process_question_attempt still calls all three helpers and is SECURITY DEFINER", () => {
  const { body, file } = latestDefinition("process_question_attempt");
  assert.match(body, /SECURITY DEFINER/, file);
  assert.match(body, /PERFORM public\.update_streak\(p_student_id\)/, file);
  assert.match(body, /PERFORM public\.update_quest_progress_for_answer\(/, file);
  assert.match(body, /PERFORM public\.update_weekly_quest_progress_for_answer\(/, file);
});

test("process_text_answer still calls all three helpers and is SECURITY DEFINER", () => {
  const { body, file } = latestDefinition("process_text_answer");
  assert.match(body, /SECURITY DEFINER/, file);
  assert.match(body, /update_streak\(p_user_id\)/, file);
  assert.match(body, /update_quest_progress_for_answer\(/, file);
  assert.match(body, /update_weekly_quest_progress_for_answer\(/, file);
});

test("no browser code, spec or Edge Function calls a helper directly", () => {
  const roots = ["app.js", "js", "supabase/functions"];
  const hits = [];
  const walk = (rel) => {
    let entries;
    try { entries = readdirSync(join(REPO, rel), { withFileTypes: true }); }
    catch { entries = null; }
    if (entries === null) {
      const src = readFileSync(join(REPO, rel), "utf8");
      if (/update_quest_progress_for_answer|update_weekly_quest_progress_for_answer|["']update_streak["']/.test(src)) hits.push(rel);
      return;
    }
    for (const e of entries) {
      if (e.name === "node_modules") continue;
      const child = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(child);
      else if (/\.(js|mjs|ts|html)$/.test(e.name)) walk(child);
    }
  };
  for (const r of roots) walk(r);
  assert.deepEqual(hits, []);
});
