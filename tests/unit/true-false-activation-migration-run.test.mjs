// F-02 Sandt/falsk — the activation migration 20261105120000_true_false_activation.sql, run UNMODIFIED on
// PGlite over production's questions table (helpers/prod-base-schema.mjs) and production's
// question_is_servable (verbatim from 20261019150000; md5 = the live catalog's, helpers/answer-chain-schema.mjs).
//
// What this proves (the file is NOT applied and must not be before the get-next-question deploy that makes
// true_false servable — see its header and docs/ARCHITECTURE.md "Sandt/falsk"):
//   1. SERVABLE RULE: after the migration, question_is_servable equals the TS registry with ONLY
//      true_false flipped to servable, on the whole matrix the format-mix parity test uses; every other
//      combination is unchanged.
//   2. CONSTRAINTS: a contract row ({ question, correct: "Sandt" | "Falsk" }, no options) can be stored;
//      every contract break is refused by the database; every row production accepts today is still
//      accepted and every row it refuses is still refused.
//   3. GUARD: an unreviewed function body or constraint definition stops the migration; a re-run is a
//      no-op.
//   4. PRIVILEGES: question_is_servable stays EXECUTE for service_role only.
//   5. INACTIVE: while the TS registry says true_false is not servable, the file is in NOT_IN_PRODUCTION,
//      so the isolated replay never applies it ahead of the code.
// HONEST LIMITS: PGlite is PostgreSQL 18.x (production 17.6) and runs as superuser. The two constraint
// hashes in the guard are computed here from production's definitions as the helper holds them; a
// read-only check against production's catalog must confirm them before the migration is applied.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PROD_BASE_SQL } from "./helpers/prod-base-schema.mjs";
import { LIVE_PROSRC_MD5 } from "./helpers/answer-chain-schema.mjs";
import { NOT_IN_PRODUCTION } from "../isolated/schema/replay-plan.mjs";
import { INTERACTION_KINDS, classifyQuestion, isServableKind } from "../../supabase/functions/_shared/interaction-kinds.ts";
import { parseTrueFalseContent } from "../../supabase/functions/_shared/true-false.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILE = "20261105120000_true_false_activation.sql";
const MIGRATION = readFileSync(join(ROOT, "supabase", "migrations", FILE), "utf8");
const MIX = readFileSync(join(ROOT, "supabase", "migrations", "20261019150000_question_format_mix.sql"), "utf8");
const SERVABLE_FN = (() => {
  const m = MIX.match(/CREATE FUNCTION public\.question_is_servable\([\s\S]*?\n\$\$;\n[\s\S]*?GRANT EXECUTE ON FUNCTION public\.question_is_servable[^\n]*\n/);
  if (!m) throw new Error("question_is_servable not found in 20261019150000");
  return m[0];
})();

async function freshDb() {
  const db = new PGlite();
  await db.exec(PROD_BASE_SQL);
  await db.exec(SERVABLE_FN);
  return db;
}
const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const md5Fn = async (db) => (await one(db, "SELECT md5(prosrc) AS v FROM pg_proc WHERE oid = to_regprocedure('public.question_is_servable(text,text,jsonb)')")).v;

// unique_question_text: every stored statement gets a unique suffix; a non-string question is kept as is.
let n = 0;
async function insert(db, { format, content, type = "short" }) {
  n++;
  const stored = typeof content.question === "string" ? { ...content, question: `${content.question} #${n}` } : content;
  return db.query(
    `INSERT INTO public.questions (type, content, difficulty, is_active, question_type, learning_objective, answer_format, answer_type)
     VALUES ($1, $2::jsonb, 1, false, 'auto', 'world_war_2', $3, $4)`,
    [format, JSON.stringify(stored), format, type]);
}
const accepted = async (db, row) => { try { await insert(db, row); return true; } catch { return false; } };

// The same matrix as tests/unit/question-format-mix-migration-run.test.mjs.
const FORMATS = ["mc", "mc_single", "number", "numbers", "text", "match", "match_pairs", "true_false", "MC", "Text", " mc",
  "longtext", "mc_number", "drag_drop", "", null];
const TYPES = ["short", "long", "Long", "", null, "medium", " short"];
const servableAfterActivation = (row) => {
  const kind = classifyQuestion(row);
  return kind === "true_false" ? true : isServableKind(kind);
};

test("the base is production's: question_is_servable has the live md5 before the migration", async () => {
  const db = await freshDb();
  assert.equal(await md5Fn(db), LIVE_PROSRC_MD5["public.question_is_servable(text,text,jsonb)"]);
});

test("servable rule: after the migration SQL = the TS registry with only true_false flipped; nothing else moves", async () => {
  const db = await freshDb();
  const before = new Map();
  for (const f of FORMATS) for (const t of TYPES) for (const force of [false, true]) {
    const content = force ? { question: "?", force_text: true } : { question: "?" };
    before.set(JSON.stringify([f, t, force]), (await one(db, "SELECT public.question_is_servable($1::text, $2::text, $3::jsonb) AS ok", [f, t, JSON.stringify(content)])).ok);
  }
  await db.exec(MIGRATION);
  let checked = 0, changed = 0;
  for (const f of FORMATS) for (const t of TYPES) for (const force of [false, true]) {
    const content = force ? { question: "?", force_text: true } : { question: "?" };
    const { ok } = await one(db, "SELECT public.question_is_servable($1::text, $2::text, $3::jsonb) AS ok", [f, t, JSON.stringify(content)]);
    const key = JSON.stringify([f, t, force]);
    assert.equal(ok, servableAfterActivation({ answer_format: f, answer_type: t, content }), key);
    if (ok !== before.get(key)) {
      changed++;
      assert.equal(classifyQuestion({ answer_format: f, answer_type: t, content }), "true_false", `only true_false may change: ${key}`);
    }
    checked++;
  }
  assert.equal(checked, FORMATS.length * TYPES.length * 2);
  // true_false with answer_type short, "" or null (all short), without force_text.
  assert.equal(changed, 3);
});

test("constraints: a contract row is stored; every contract break is refused by the database", async () => {
  const db = await freshDb();
  const sandt = { format: "true_false", content: { question: "Jorden bevæger sig rundt om Solen.", correct: "Sandt" } };
  const falsk = { format: "true_false", content: { question: "Danmark erklærede Tyskland krig den 9. april 1940.", correct: "Falsk", review_text: "Tyskland besatte Danmark." } };
  assert.equal(await accepted(db, sandt), false, "production refuses a true_false row today");
  await db.exec(MIGRATION);
  for (const row of [sandt, falsk]) {
    parseTrueFalseContent(row.content); // the TS contract agrees it is valid
    assert.equal(await accepted(db, row), true, JSON.stringify(row.content));
  }
  const breaks = [
    { question: "Himlen er blå.", correct: "Sandt", options: ["Sandt", "Falsk"] },
    { question: "Himlen er blå.", correct: "sandt" },
    { question: "Himlen er blå.", correct: "true" },
    { question: "Himlen er blå.", correct: true },
    { question: "Himlen er blå." },
    { question: 7, correct: "Sandt" },
    { correct: "Sandt" },
  ];
  for (const content of breaks) {
    assert.throws(() => parseTrueFalseContent(content), undefined, `TS refuses ${JSON.stringify(content)}`);
    const ok = await accepted(db, { format: "true_false", content });
    assert.equal(ok, false, `the database refuses ${JSON.stringify(content)}`);
  }
});

test("constraints: what production accepts and refuses today is unchanged", async () => {
  const rows = [
    { format: "mc", content: { type: "mc", question: "MC?", options: ["a", "b"], correct: "a" } },
    { format: "number", content: { type: "number", question: "Tal?", correct: "1849" } },
    { format: "text", content: { type: "text", question: "Stav?", correct: "Polen" } },
    { format: "text", content: { type: "text", question: "Stav?", correct: "x", options: ["x"] } }, // refused
    { format: "mc", content: { type: "mc", question: "MC?", options: ["a"], correct: "a" } },        // refused
    { format: "match", content: { type: "text", question: "Par?", correct: "x", pairs: [["a", "b"]] } }, // refused
    { format: "number", content: { question: "Ingen type?", correct: "5" } },                         // refused
  ];
  const before = await freshDb();
  const after = await freshDb();
  await after.exec(MIGRATION);
  for (const row of rows) {
    assert.equal(await accepted(after, row), await accepted(before, row), JSON.stringify(row));
  }
});

test("guard: an unreviewed body or constraint stops the migration; a re-run is a no-op", async () => {
  const drifted = await freshDb();
  await drifted.exec(`CREATE OR REPLACE FUNCTION public.question_is_servable(p_answer_format text, p_answer_type text, p_content jsonb)
    RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$ SELECT true $$;`);
  await assert.rejects(drifted.exec(MIGRATION), /unreviewed body/);

  const driftedCheck = await freshDb();
  await driftedCheck.exec(`ALTER TABLE public.questions DROP CONSTRAINT questions_answer_format_check,
    ADD CONSTRAINT questions_answer_format_check CHECK (answer_format <> '')`);
  await assert.rejects(driftedCheck.exec(MIGRATION), /questions_answer_format_check is unreviewed/);

  const driftedContent = await freshDb();
  await driftedContent.exec(`ALTER TABLE public.questions DROP CONSTRAINT content_valid_check,
    ADD CONSTRAINT content_valid_check CHECK (jsonb_typeof(content) = 'object')`);
  await assert.rejects(driftedContent.exec(MIGRATION), /content_valid_check is unreviewed/);

  const db = await freshDb();
  await db.exec(MIGRATION);
  const once = await md5Fn(db);
  await db.exec(MIGRATION);
  assert.equal(await md5Fn(db), once);
  assert.match(MIGRATION, new RegExp(once), "the guard names this file's own body");
});

test("privileges: question_is_servable stays EXECUTE for service_role only", async () => {
  const db = await freshDb();
  await db.exec(MIGRATION);
  for (const [role, expected] of [["anon", false], ["authenticated", false], ["public", false], ["service_role", true]]) {
    const { ok } = await one(db, `SELECT has_function_privilege('${role}', 'public.question_is_servable(text, text, jsonb)', 'EXECUTE') AS ok`);
    assert.equal(ok, expected, role);
  }
});

test("inactive: while the registry keeps true_false unservable, the file is NOT_IN_PRODUCTION and never replayed", () => {
  if (INTERACTION_KINDS.true_false.servable === false) {
    assert.ok(Object.hasOwn(NOT_IN_PRODUCTION, FILE), `${FILE} must be in NOT_IN_PRODUCTION`);
  }
  assert.match(MIGRATION, /NOT APPLIED IN PRODUCTION/);
  assert.equal(/\bdb push\b/.test(MIGRATION.replace(/never db push/g, "")), false);
});
