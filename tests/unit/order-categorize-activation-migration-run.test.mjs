// F-04 Rækkefølge + F-05 Kategorisering (D-362) — the activation migration
// 20261108090000_order_categorize_activation.sql, run UNMODIFIED on PGlite over production's answer chain
// (helpers/answer-chain-schema.mjs: production's questions table with its constraints, question_is_servable
// with the live md5, process_question_attempt with the live md5) in each of the four states its guard
// accepts: production as it is today, F-02 (20261105120000) applied, F-03 (PR #615) applied on production,
// and F-03 applied on F-02.
//
// F-03 IS NOT ON MAIN. Its migration (20261105141500_match_pairs_activation.sql) lives on the PR #615 branch
// feat/f03-match-activation (3f2828c9). tests/fixtures/f03-match-pairs-activation-pr615.sql is that file
// copied VERBATIM (git blob a2012be9) and is executed unchanged to put the database into the F-03 states;
// once the real file exists in supabase/migrations, the fixture must be byte-identical to it (test below).
//
// What this proves (the file is NOT applied and must not be before production step Q-21 and the
// get-next-question deploy that makes order and categorize servable — see its header):
//   1. SERVABLE RULE: after the migration, question_is_servable equals the TS registry
//      (_shared/interaction-kinds.ts, order_items and categorize servable since D-362) on the format-mix
//      parity matrix in all four states (true_false servable only with F-02, match only with F-03, as
//      those files decide). Only "order" and "categorize" rows change.
//   2. CONSTRAINTS: contract rows (_shared/order-items.ts, _shared/categorize.ts) can be stored; every
//      contract break is refused by the database; the validators equal parseOrderContent /
//      parseCategorizeContent (+ normalizeContent's question check) on every case listed and on a
//      deterministic mutation sweep, so the database is never more lenient; every row production accepts
//      or refuses today is unchanged in every state.
//   3. GRADING + IDEMPOTENCY: a STORED order / categorize row (constraints intact, nothing dropped), served
//      with a key drawn as get-next-question draws it, is graded by canonicalOrderAnswer /
//      canonicalCategorizeAnswer + the live process_question_attempt exactly like MC (10 XP + 5 coins),
//      a second submit of the same instance pays nothing more, a wrong answer pays nothing; under
//      process_question_attempt_v2 (H5) a replay of the same submission is frozen and paid once.
//   4. GUARD: all four states are accepted; mixed states, an unreviewed body or constraint, and a
//      constraint naming only one of the two validators are refused and change nothing; a re-run is a
//      no-op in every state; F-02 and F-03 applied AFTER this file are refused by their own guards.
//   5. PRIVILEGES: question_is_servable stays EXECUTE for service_role only; both validators are executable
//      by every role that writes questions (a CHECK checks EXECUTE for the writer) and are not SECURITY
//      DEFINER.
//   6. INACTIVE: the file is in NOT_IN_PRODUCTION, so the isolated replay never applies it ahead of the
//      deploys.
// HONEST LIMITS: PGlite is PostgreSQL 18.x (production 17.6) and its database collation is C (production
// en_US.UTF-8); both fold "Æ" to "æ" with lower() (checked here; F-03 checked production read-only
// 2026-11-05). JavaScript's toLowerCase() and PostgreSQL's lower() may still differ on rare characters;
// get-next-question's parsers stay the final authority, which is why content is checked with the TS
// validators before it is stored.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { answerChainSql, LIVE_PROSRC_MD5, readMigration, ATTEMPTS_MIGRATION_FILE } from "./helpers/answer-chain-schema.mjs";
import { NOT_IN_PRODUCTION } from "../isolated/schema/replay-plan.mjs";
import { INTERACTION_KINDS, classifyQuestion, isServableKind } from "../../supabase/functions/_shared/interaction-kinds.ts";
import {
  canonicalOrderAnswer, createOrderKey, parseOrderContent, parseOrderKey, validateOrderContent,
} from "../../supabase/functions/_shared/order-items.ts";
import {
  canonicalCategorizeAnswer, createCategorizeKey, parseCategorizeContent, parseCategorizeKey, validateCategorizeContent,
} from "../../supabase/functions/_shared/categorize.ts";
import { toPublicQuestion } from "../../supabase/functions/_shared/question-dto.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILE = "20261108090000_order_categorize_activation.sql";
const F02_FILE = "20261105120000_true_false_activation.sql";
const F03_FILE = "20261105141500_match_pairs_activation.sql";
const MIGRATION = readMigration(FILE);
const F02 = readMigration(F02_FILE);
// PR #615's migration, verbatim (see the header).
const F03 = readFileSync(join(ROOT, "tests", "fixtures", "f03-match-pairs-activation-pr615.sql"), "utf8");

// The four states the guard accepts, with the question_is_servable md5 each has and the one this file
// leaves (the file's c_fn_base / c_fn_own, same order).
const STATES = Object.freeze([
  { name: "production", f02: false, f03: false, base: "1bca7ccb0321f665f3e747fec2599e67", own: "7ea8c0c28bf5168b4d38a6cb59f3565b" },
  { name: "F-02", f02: true, f03: false, base: "3027c287884e35f42afcd1a4818e3cd0", own: "e7826f70706caab80a68dd3379bcec78" },
  { name: "F-03 on production", f02: false, f03: true, base: "d0b1db4e2982aa8d281ff5e2a61f3552", own: "32e632205b2ef30abbe59269b4ec5979" },
  { name: "F-03 on F-02", f02: true, f03: true, base: "14a596e6611f1f500089a34be9b2bfb1", own: "095f3f0cfb912528de83fef012b288a4" },
]);

async function freshDb({ f02 = false, f03 = false } = {}) {
  const db = new PGlite();
  for (const sql of answerChainSql()) await db.exec(sql);
  if (f02) await db.exec(F02);
  if (f03) await db.exec(F03);
  return db;
}
const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const md5Fn = async (db) => (await one(db, "SELECT md5(prosrc) AS v FROM pg_proc WHERE oid = to_regprocedure('public.question_is_servable(text,text,jsonb)')")).v;
const prosrc = async (db) => (await one(db, "SELECT prosrc AS v FROM pg_proc WHERE oid = to_regprocedure('public.question_is_servable(text,text,jsonb)')")).v;
const constraintDef = async (db, name) => (await one(db, `SELECT pg_get_constraintdef(c.oid) AS v FROM pg_constraint c
  WHERE c.conrelid = 'public.questions'::regclass AND c.conname = $1`, [name])).v;
const snapshot = async (db) => [await md5Fn(db), await constraintDef(db, "questions_answer_format_check"), await constraintDef(db, "content_valid_check")];
const validatorsAbsent = async (db) => (await one(db, `SELECT to_regprocedure('public.order_items_content_is_valid(jsonb)') IS NULL
  AND to_regprocedure('public.categorize_content_is_valid(jsonb)') IS NULL AS v`)).v;

// unique_question_text: a stored question with visible text gets a unique suffix; anything else is kept.
let n = 0;
async function insert(db, { format, content, type = "short", active = false }) {
  n++;
  const stored = typeof content?.question === "string" && content.question.trim() !== ""
    ? { ...content, question: `${content.question} #${n}` } : content;
  return db.query(
    `INSERT INTO public.questions (type, content, difficulty, is_active, question_type, learning_objective, answer_format, answer_type)
     VALUES ($1, $2::jsonb, 1, $5, 'auto', 'geografi', $3, $4) RETURNING id`,
    [format, JSON.stringify(stored), format, type, active]);
}
const accepted = async (db, row) => { try { await insert(db, row); return true; } catch { return false; } };

// The TS side: the kind's parser (contract) + get-next-question normalizeContent's question check. The
// authoring validators agree with the parsers on errors (checked below).
const tsAcceptsOrder = (content) => {
  try {
    parseOrderContent(content);
    return typeof content.question === "string" && content.question.trim().length > 0;
  } catch { return false; }
};
const tsAcceptsCategorize = (content) => {
  try {
    parseCategorizeContent(content);
    return typeof content.question === "string" && content.question.trim().length > 0;
  } catch { return false; }
};
const sqlValid = async (db, fn, content) =>
  (await one(db, `SELECT public.${fn}($1::jsonb) AS v`, [JSON.stringify(content)])).v;

// ── Contract cases ───────────────────────────────────────────────────────────────────────────────
const C = "correct"; // every row keeps content.correct (content_valid_check, auto_requires_correct); never read
const ORDER_VALID = [
  { question: "Sæt begivenhederne i rækkefølge", [C]: "-", items: ["Enevælden indføres", "Stavnsbåndet ophæves", "Grundloven underskrives"], sequence: "chronological" },
  { question: "Seks trin", [C]: "-", items: ["a", "b", "c", "d", "e", "f"], sequence: "process" },
  { question: "Fra mindst til størst", [C]: "-", items: ["Æble", "Ø", "Ål", "Sø"], sequence: "logical" },
  { question: "Grænsen på 80 efter trim", [C]: "-", items: ["x".repeat(80), `  ${"y".repeat(80)}  `, "😀".repeat(40)], sequence: "process" },
  { question: "Hårde mellemrum trimmes som i JS", [C]: "-", items: [" a ", "　b﻿", "\tc\n"], sequence: "process" },
  { question: "Ekstra nøgler ignoreres", [C]: "-", items: ["a", "b", "c"], sequence: "logical", review_text: "fordi", note: 1 },
];
const ORDER_BREAKS = [
  { question: "Med options", [C]: "-", items: ["a", "b", "c"], sequence: "process", options: ["a", "b"] },
  { question: "options null", [C]: "-", items: ["a", "b", "c"], sequence: "process", options: null },
  { question: "Ingen items", [C]: "-", sequence: "process" },
  { question: "Items er ikke en liste", [C]: "-", items: { a: 1 }, sequence: "process" },
  { question: "To items", [C]: "-", items: ["a", "b"], sequence: "process" },
  { question: "Syv items", [C]: "-", items: ["a", "b", "c", "d", "e", "f", "g"], sequence: "process" },
  { question: "Tal som item", [C]: "-", items: ["a", 2, "c"], sequence: "process" },
  { question: "null som item", [C]: "-", items: ["a", null, "c"], sequence: "process" },
  { question: "Objekt som item", [C]: "-", items: ["a", { text: "b" }, "c"], sequence: "process" },
  { question: "Tomt item", [C]: "-", items: ["a", "   ", "c"], sequence: "process" },
  { question: "Kun hårde mellemrum", [C]: "-", items: ["a", "   ﻿", "c"], sequence: "process" },
  { question: "81 tegn", [C]: "-", items: ["x".repeat(81), "b", "c"], sequence: "process" },
  { question: "81 UTF-16-enheder", [C]: "-", items: ["😀".repeat(40) + "x", "b", "c"], sequence: "process" },
  { question: "Dobbelt efter trim", [C]: "-", items: ["Danmark", " danmark ", "c"], sequence: "process" },
  { question: "Dobbelt Æ", [C]: "-", items: ["Æble", "æble", "c"], sequence: "process" },
  { question: "Ingen sequence", [C]: "-", items: ["a", "b", "c"] },
  { question: "Ukendt sequence", [C]: "-", items: ["a", "b", "c"], sequence: "causal" },
  { question: "Sequence med stort", [C]: "-", items: ["a", "b", "c"], sequence: "Process" },
  { question: "Sequence med mellemrum", [C]: "-", items: ["a", "b", "c"], sequence: " process" },
  { question: "Sequence som liste", [C]: "-", items: ["a", "b", "c"], sequence: ["process"] },
  { question: "   ", [C]: "-", items: ["a", "b", "c"], sequence: "process" },
  { question: "　﻿", [C]: "-", items: ["a", "b", "c"], sequence: "process" },
  { question: 7, [C]: "-", items: ["a", "b", "c"], sequence: "process" },
  { [C]: "-", items: ["a", "b", "c"], sequence: "process" },
];

const cat = (text, category) => ({ text, category });
const TWO = ["Enevælden", "Efter 1849"];
const CAT_VALID = [
  { question: "Enevælde eller folkestyre?", [C]: "-", categories: TWO,
    items: [cat("Kongen giver love alene", TWO[0]), cat("Kongeloven 1665", TWO[0]), cat("Rigsdagen vedtager love", TWO[1]), cat("Domstolene dømmer", TWO[1])] },
  { question: "Tre kategorier, otte elementer, ulige fordeling", [C]: "-", categories: ["A", "B", "C"],
    items: [cat("1", "A"), cat("2", "A"), cat("3", "A"), cat("4", "A"), cat("5", "A"), cat("6", "A"), cat("7", "B"), cat("8", "C")] },
  { question: "Trim på labels og kategori", [C]: "-", categories: [" Før ", "Efter　"],
    items: [cat(" a ", "Før"), cat("b", " Før"), cat("c", "Efter"), cat("d", "﻿Efter ")] },
  { question: "Grænser 40 og 80 efter trim", [C]: "-", categories: ["x".repeat(40), "😀".repeat(20)],
    items: [cat("y".repeat(80), "x".repeat(40)), cat(`  ${"z".repeat(80)}  `, "x".repeat(40)), cat("😀".repeat(40), "😀".repeat(20)), cat("d", "😀".repeat(20))] },
  { question: "Æ, ø og å", [C]: "-", categories: ["Sø", "Å"],
    items: [cat("Ærø", "Sø"), cat("Øresund", "Sø"), cat("Gudenå", "Å"), cat("Skjern Å", "Å")], review_text: "ok" },
];
const catBase = CAT_VALID[0];
const CAT_BREAKS = [
  { ...catBase, options: ["a"] },
  { ...catBase, options: null },
  { ...catBase, categories: undefined },
  { ...catBase, categories: "Enevælden" },
  { ...catBase, categories: ["Enevælden"] },
  { ...catBase, categories: ["A", "B", "C", "D"] },
  { ...catBase, categories: [TWO[0], 2] },
  { ...catBase, categories: [TWO[0], "   "] },
  { ...catBase, categories: [TWO[0], "  "] },
  { ...catBase, categories: [TWO[0], "x".repeat(41)] },
  { ...catBase, categories: [TWO[0], "😀".repeat(20) + "x"] },
  { ...catBase, categories: [TWO[0], " enevælden "] },
  { ...catBase, categories: ["Æble", "æble"] },
  { ...catBase, items: undefined },
  { ...catBase, items: catBase.items.slice(0, 3) },
  { ...catBase, items: Array.from({ length: 9 }, (_, i) => cat(`e${i}`, TWO[i % 2])) },
  { ...catBase, items: [...catBase.items.slice(0, 3), "Domstolene dømmer"] },
  { ...catBase, items: [...catBase.items.slice(0, 3), ["Domstolene dømmer", TWO[1]]] },
  { ...catBase, items: [...catBase.items.slice(0, 3), null] },
  { ...catBase, items: [...catBase.items.slice(0, 3), { category: TWO[1] }] },
  { ...catBase, items: [...catBase.items.slice(0, 3), cat(5, TWO[1])] },
  { ...catBase, items: [...catBase.items.slice(0, 3), cat("  ", TWO[1])] },
  { ...catBase, items: [...catBase.items.slice(0, 3), cat("x".repeat(81), TWO[1])] },
  { ...catBase, items: [...catBase.items.slice(0, 3), cat("😀".repeat(40) + "x", TWO[1])] },
  { ...catBase, items: [...catBase.items.slice(0, 3), cat(" kongen giver love alene ", TWO[1])] },
  { ...catBase, items: [...catBase.items.slice(0, 3), cat("Domstolene dømmer", "efter 1849")] },  // label is exact
  { ...catBase, items: [...catBase.items.slice(0, 3), cat("Domstolene dømmer", "Folkestyre")] },
  { ...catBase, items: [...catBase.items.slice(0, 3), cat("Domstolene dømmer", 1)] },
  { ...catBase, items: [...catBase.items.slice(0, 3), { text: "Domstolene dømmer" }] },
  { ...catBase, items: catBase.items.map((i) => ({ ...i, category: TWO[0] })) },                    // a category is empty
  { ...catBase, question: "   " },
  { ...catBase, question: 7 },
  { ...catBase, question: undefined },
];

// A deterministic mutation sweep (no randomness): every single-field change from a small set, applied to
// every valid case. The database must agree with TS on each.
const MUTANTS = ["", " ", " ", "﻿", "a", "A", "x".repeat(80), "x".repeat(81), "😀".repeat(41), 0, null, true, [], {}, ["a"]];
function* orderMutations() {
  for (const base of ORDER_VALID) {
    for (const key of ["question", "items", "sequence", "options"]) for (const m of MUTANTS) yield { ...base, [key]: m };
    for (let i = 0; i < base.items.length; i++) for (const m of [...MUTANTS, base.items[(i + 1) % base.items.length]]) {
      const items = [...base.items]; items[i] = m; yield { ...base, items };
    }
  }
}
function* categorizeMutations() {
  for (const base of CAT_VALID) {
    for (const key of ["question", "categories", "items", "options"]) for (const m of MUTANTS) yield { ...base, [key]: m };
    for (let i = 0; i < base.categories.length; i++) for (const m of [...MUTANTS, base.categories[(i + 1) % base.categories.length]]) {
      const categories = [...base.categories]; categories[i] = m; yield { ...base, categories };
    }
    for (let i = 0; i < base.items.length; i++) {
      for (const m of MUTANTS) {
        const a = [...base.items]; a[i] = m; yield { ...base, items: a };
        const b = [...base.items]; b[i] = { ...b[i], text: m }; yield { ...base, items: b };
        const c = [...base.items]; c[i] = { ...c[i], category: m }; yield { ...base, items: c };
      }
      const d = [...base.items]; d[i] = { ...d[i], text: base.items[(i + 1) % base.items.length].text }; yield { ...base, items: d };
    }
  }
}

// ── 1. Servable rule ─────────────────────────────────────────────────────────────────────────────

// The format-mix parity matrix, with the two new formats.
const FORMATS = ["mc", "mc_single", "number", "numbers", "text", "match", "match_pairs", "true_false", "order", "categorize",
  "orders", "Order", " categorize", "MC", "Text", " mc", "longtext", "mc_number", "drag_drop", "", null];
const TYPES = ["short", "long", "Long", "", null, "medium", " short"];
async function servableMatrix(db) {
  const out = new Map();
  for (const f of FORMATS) for (const t of TYPES) for (const force of [false, true]) {
    const content = force ? { question: "?", force_text: true } : { question: "?" };
    const { ok } = await one(db, "SELECT public.question_is_servable($1::text, $2::text, $3::jsonb) AS ok", [f, t, JSON.stringify(content)]);
    out.set(JSON.stringify([f, t, force]), { ok, row: { answer_format: f, answer_type: t, content } });
  }
  return out;
}

test("the base is production's: question_is_servable and process_question_attempt have the live md5; the registry flips both kinds", async () => {
  const db = await freshDb();
  assert.equal(await md5Fn(db), LIVE_PROSRC_MD5["public.question_is_servable(text,text,jsonb)"]);
  assert.equal(await md5Fn(db), STATES[0].base);
  const { v } = await one(db, "SELECT md5(prosrc) AS v FROM pg_proc WHERE oid = 'public.process_question_attempt(uuid,uuid,text,bigint)'::regprocedure");
  assert.equal(v, LIVE_PROSRC_MD5["public.process_question_attempt(uuid,uuid,text,bigint)"]);
  assert.equal(INTERACTION_KINDS.order_items.servable, true, "D-362 makes Rækkefølge servable in the registry");
  assert.equal(INTERACTION_KINDS.categorize.servable, true, "D-362 makes Kategorisering servable in the registry");
  // Match par and Sandt/falsk are decided by their own files, not by this one.
  assert.equal(INTERACTION_KINDS.match_pairs.servable, false);
  assert.equal(INTERACTION_KINDS.true_false.servable, false);
});

test("F-03 fixture: the verbatim copy of PR #615's migration (byte-identical to the real file once it exists)", () => {
  assert.match(F03, /F-03 Match par \(match_pairs, answer_format "match"\) — activation/);
  assert.match(F03, /DO \$mp_activation\$/);
  const real = join(ROOT, "supabase", "migrations", F03_FILE);
  if (existsSync(real)) assert.equal(readFileSync(real, "utf8"), F03, `${F03_FILE} differs from the fixture: refresh the fixture`);
});

for (const state of STATES) {
  test(`servable rule (${state.name}): before = the state's own rule, after = the TS registry; only "order" and "categorize" move`, async () => {
    const db = await freshDb(state);
    assert.equal(await md5Fn(db), state.base, "the state has the md5 the guard expects");
    const before = await servableMatrix(db);
    await db.exec(MIGRATION);
    assert.equal(await md5Fn(db), state.own, "this file's own body for the state");
    const after = await servableMatrix(db);
    let changed = 0;
    for (const [key, { ok, row }] of after) {
      const kind = classifyQuestion(row);
      let expected = isServableKind(kind);
      if (kind === "true_false") expected = state.f02;   // F-02 decides, not this file
      if (kind === "match_pairs") expected = state.f03;  // F-03 decides, not this file
      assert.equal(ok, expected, key);
      if (ok !== before.get(key).ok) {
        changed++;
        assert.ok(kind === "order_items" || kind === "categorize", `only Rækkefølge and Kategorisering may change: ${key}`);
        assert.equal(before.get(key).ok, false);
      }
    }
    assert.equal(after.size, FORMATS.length * TYPES.length * 2);
    // order and categorize with answer_type short, "" or null (all short), without force_text.
    assert.equal(changed, 6);
  });
}

// ── 2. Constraints ───────────────────────────────────────────────────────────────────────────────

test("validators = the TS parsers on every listed case and on the mutation sweep (never more lenient)", async () => {
  const db = await freshDb();
  await db.exec(MIGRATION);
  // lower() folds Æ/Ø/Å on this database, as on production.
  assert.deepEqual(await one(db, "SELECT lower('ÆØÅ') AS v"), { v: "æøå" });
  for (const content of ORDER_VALID) {
    assert.equal(tsAcceptsOrder(content), true, `TS accepts ${JSON.stringify(content)}`);
    assert.deepEqual(validateOrderContent(content).errors, []);
    assert.equal(await sqlValid(db, "order_items_content_is_valid", content), true, `SQL accepts ${JSON.stringify(content)}`);
  }
  for (const content of ORDER_BREAKS) {
    assert.equal(tsAcceptsOrder(content), false, `TS refuses ${JSON.stringify(content)}`);
    assert.equal(await sqlValid(db, "order_items_content_is_valid", content), false, `SQL refuses ${JSON.stringify(content)}`);
  }
  for (const content of CAT_VALID) {
    assert.equal(tsAcceptsCategorize(content), true, `TS accepts ${JSON.stringify(content)}`);
    assert.deepEqual(validateCategorizeContent(content).errors, []);
    assert.equal(await sqlValid(db, "categorize_content_is_valid", content), true, `SQL accepts ${JSON.stringify(content)}`);
  }
  for (const content of CAT_BREAKS) {
    assert.equal(tsAcceptsCategorize(content), false, `TS refuses ${JSON.stringify(content)}`);
    assert.equal(await sqlValid(db, "categorize_content_is_valid", content), false, `SQL refuses ${JSON.stringify(content)}`);
  }
  // Non-objects and SQL NULL.
  for (const fn of ["order_items_content_is_valid", "categorize_content_is_valid"]) {
    for (const v of ["[]", "\"x\"", "1", "null"]) assert.equal((await one(db, `SELECT public.${fn}($1::jsonb) AS v`, [v])).v, false, `${fn} ${v}`);
    assert.equal((await one(db, `SELECT public.${fn}(NULL) AS v`)).v, false, `${fn} NULL`);
  }
  // The sweep: the database equals TS on every mutation (JSON drops undefined, as storing does).
  let swept = 0;
  for (const m of orderMutations()) {
    const content = JSON.parse(JSON.stringify(m));
    assert.equal(await sqlValid(db, "order_items_content_is_valid", content), tsAcceptsOrder(content), JSON.stringify(content));
    swept++;
  }
  for (const m of categorizeMutations()) {
    const content = JSON.parse(JSON.stringify(m));
    assert.equal(await sqlValid(db, "categorize_content_is_valid", content), tsAcceptsCategorize(content), JSON.stringify(content));
    swept++;
  }
  assert.ok(swept > 1000, `the sweep covers ${swept} cases`);
});

test("constraints: contract rows are stored; every contract break is refused; table rules on top", async () => {
  const db = await freshDb();
  assert.equal(await accepted(db, { format: "order", content: ORDER_VALID[0] }), false, "production refuses an order row today");
  assert.equal(await accepted(db, { format: "categorize", content: CAT_VALID[0] }), false, "production refuses a categorize row today");
  await db.exec(MIGRATION);
  for (const content of ORDER_VALID) {
    assert.equal(await accepted(db, { format: "order", content }), true, `stores ${JSON.stringify(content)}`);
    // get-next-question can build the instance and its public payload from what was stored.
    const key = createOrderKey(parseOrderContent(content).items.length);
    assert.equal(toPublicQuestion(content, "order", null, key).content.order.items.length, content.items.length);
  }
  for (const content of ORDER_BREAKS) assert.equal(await accepted(db, { format: "order", content }), false, `refuses ${JSON.stringify(content)}`);
  for (const content of CAT_VALID) {
    assert.equal(await accepted(db, { format: "categorize", content }), true, `stores ${JSON.stringify(content)}`);
    const key = createCategorizeKey(parseCategorizeContent(content));
    assert.deepEqual(toPublicQuestion(content, "categorize", null, key).content.categorize.categories, parseCategorizeContent(content).categories);
  }
  for (const content of CAT_BREAKS) assert.equal(await accepted(db, { format: "categorize", content }), false, `refuses ${JSON.stringify(content)}`);

  for (const [format, ok] of [["order", ORDER_VALID[0]], ["categorize", CAT_VALID[0]]]) {
    assert.equal(await accepted(db, { format, content: { ...ok, force_text: true } }), false, `${format}: force_text would be shown as free text`);
    assert.equal(await accepted(db, { format, content: ok, type: "long" }), false, `${format}: long would be teacher-graded`);
    assert.equal(await accepted(db, { format, content: ok, type: "Short" }), false, `${format}: a non-canonical answer_type`);
    assert.equal(await accepted(db, { format, content: ok, type: null }), true, `${format}: a NULL answer_type is short`);
    const { correct, ...noCorrect } = ok;
    assert.equal(correct, "-");
    assert.equal(await accepted(db, { format, content: noCorrect }), false, `${format}: every row keeps content.correct (content_valid_check)`);
    assert.equal(await accepted(db, { format, content: { ...ok, correct: null }, active: true }), false, `${format}: auto_requires_correct`);
    assert.equal(await accepted(db, { format, content: ok, active: true }), true, `${format}: an active contract row`);
  }
  // A row of one kind is checked by its own validator only.
  assert.equal(await accepted(db, { format: "order", content: CAT_VALID[0] }), false);
  assert.equal(await accepted(db, { format: "categorize", content: ORDER_VALID[0] }), false);
  // Other spellings of the kinds are still refused.
  for (const format of ["order_items", "Order", "categorise", "categorize "]) {
    assert.equal(await accepted(db, { format, content: format.startsWith("cat") ? CAT_VALID[0] : ORDER_VALID[0] }), false, format);
  }
});

test("constraints: what each state accepts and refuses is unchanged; true_false only with F-02, match only with F-03", async () => {
  const rows = [
    { format: "mc", content: { type: "mc", question: "MC?", options: ["a", "b"], correct: "a" } },
    { format: "number", content: { type: "number", question: "Tal?", correct: "1849" } },
    { format: "text", content: { type: "text", question: "Stav?", correct: "Polen" } },
    { format: "text", content: { type: "text", question: "Stav?", correct: "x", options: ["x"] } },  // refused
    { format: "mc", content: { type: "mc", question: "MC?", options: ["a"], correct: "a" } },         // refused
    { format: "number", content: { question: "Ingen type?", correct: "5" } },                          // refused
    { format: "true_false", content: { question: "Himlen er blå.", correct: "Sandt" } },               // F-02 only
    { format: "match", content: { question: "Forbind", correct: "par",
      pairs: [{ left: "Danmark", right: "København" }, { left: "Norge", right: "Oslo" }] } },          // F-03 only
  ];
  for (const state of STATES) {
    // One database per state: the verdicts before the migration, then after it (every stored question gets
    // a unique text, so earlier inserts never collide).
    const db = await freshDb(state);
    const before = [];
    for (const row of rows) before.push(await accepted(db, row));
    await db.exec(MIGRATION);
    const after = db;
    for (const [i, row] of rows.entries()) {
      assert.equal(await accepted(after, row), before[i], `${state.name}: ${JSON.stringify(row)}`);
    }
    assert.equal(await accepted(after, rows[6]), state.f02, `${state.name}: true_false is stored only with F-02`);
    assert.equal(await accepted(after, rows[7]), state.f03, `${state.name}: match is stored only with F-03`);
    assert.equal(await accepted(after, { format: "order", content: ORDER_VALID[0] }), true, `${state.name}: order`);
    assert.equal(await accepted(after, { format: "categorize", content: CAT_VALID[0] }), true, `${state.name}: categorize`);
  }
});

// ── 3. Grading and idempotency on a STORED row ─────────────────────────────────────────────────────

let nextPupil = 900;
async function addPupil(db) {
  const id = `00000000-0000-4000-8000-${String(nextPupil++).padStart(12, "0")}`;
  await db.exec(`INSERT INTO auth.users VALUES ('${id}');
    INSERT INTO public.profiles (id, role, selected_grade) VALUES ('${id}', 'student', 5);
    INSERT INTO public.student_progress (student_id, xp, coins, correct_answers, total_correct_answers,
      current_streak, longest_streak, last_activity_date) VALUES ('${id}', 100, 50, 7, 7, 1, 1, current_date - 1);`);
  return id;
}
async function asService(db, sql, params) {
  await db.exec("SET ROLE service_role");
  try { return (await db.query(sql, params)).rows[0]; } finally { await db.exec("RESET ROLE"); }
}
// The stored row read back, as get-next-question reads it.
const storedContent = async (db, questionId) =>
  (await one(db, "SELECT content FROM public.questions WHERE id = $1", [questionId])).content;
// As get-next-question creates the round: the key drawn once from the STORED content, kept server-side.
const serve = async (db, pupil, questionId, key) => (await asService(db, `INSERT INTO public.question_instances
  (student_id, question_id, correct_answer, repeat_count, answered, next_review_at) VALUES ($1, $2, $3, 0, false, now()) RETURNING id`,
  [pupil, questionId, key])).id;
const grade = async (db, pupil, instance, graded) => {
  assert.ok(graded, "process-event would refuse this shape");
  return (await asService(db, "SELECT public.process_question_attempt($1, $2, $3, 0) AS r", [pupil, instance, graded])).r;
};
const progress = async (db, pupil) => one(db, "SELECT xp, coins, correct_answers FROM public.student_progress WHERE student_id = $1", [pupil]);
const zeroDraws = () => 0; // deterministic Fisher–Yates draws

for (const state of [STATES[0], STATES[3]]) {
  test(`grading (${state.name}): a stored order row is paid like MC, once; a wrong order pays nothing (live process_question_attempt)`, async () => {
    const db = await freshDb(state);
    await db.exec(MIGRATION);
    const content = { question: "Sæt begivenhederne i den rækkefølge, de skete", correct: "-", sequence: "chronological",
      items: ["Enevælden indføres", "Stavnsbåndet ophæves", "Grundloven underskrives", "Kvinder får valgret"] };
    const { rows: [{ id: questionId }] } = await insert(db, { format: "order", content, active: true });
    const stored = await storedContent(db, questionId);
    const key = createOrderKey(parseOrderContent(stored).items.length, zeroDraws);
    const right = parseOrderKey(key, 4);
    assert.ok(right && right.some((pos, rank) => pos !== rank), "never shown solved");
    const shown = toPublicQuestion(stored, "order", null, key).content.order.items;
    assert.deepEqual(right.map((pos) => shown[pos]), content.items, "the right answer lists the authored order");
    const p = await addPupil(db);
    const qi = await serve(db, p, questionId, key);

    const r = await grade(db, p, qi, canonicalOrderAnswer(JSON.stringify(right), key));
    assert.equal(r.status, "correct");
    assert.equal(r.correct_answer, key);
    assert.deepEqual(await progress(db, p), { xp: 110, coins: 55, correct_answers: 8 });
    const again = await grade(db, p, qi, canonicalOrderAnswer(JSON.stringify(right), key));
    assert.equal(again.status, "correct", "the same verdict");
    assert.deepEqual(await progress(db, p), { xp: 110, coins: 55, correct_answers: 8 }, "nothing paid twice");

    const p2 = await addPupil(db);
    const wrong = await grade(db, p2, await serve(db, p2, questionId, key), canonicalOrderAnswer(JSON.stringify([...right].reverse()), key));
    assert.equal(wrong.status, "incorrect");
    assert.deepEqual(await progress(db, p2), { xp: 100, coins: 50, correct_answers: 7 });
    // A malformed order never reaches the RPC.
    assert.equal(canonicalOrderAnswer(JSON.stringify([0, 0, 1, 2]), key), null);
    assert.equal(canonicalOrderAnswer(JSON.stringify([0, 1, 2]), key), null);
  });

  test(`grading (${state.name}): a stored categorize row is paid like MC, once; a wrong placement pays nothing (live process_question_attempt)`, async () => {
    const db = await freshDb(state);
    await db.exec(MIGRATION);
    const content = CAT_VALID[0];
    const { rows: [{ id: questionId }] } = await insert(db, { format: "categorize", content, active: true });
    const stored = await storedContent(db, questionId);
    const key = createCategorizeKey(parseCategorizeContent(stored), zeroDraws);
    const pairs = parseCategorizeKey(key, 4, 2);
    assert.ok(pairs);
    const right = pairs.map((pr) => pr.category); // one category index per SHOWN position
    const layout = toPublicQuestion(stored, "categorize", null, key).content.categorize;
    assert.deepEqual(layout.items.map((t, i) => [t, layout.categories[right[i]]]).sort(),
      content.items.map((it) => [it.text, it.category]).sort(), "the right placement is the authored one");
    const p = await addPupil(db);
    const qi = await serve(db, p, questionId, key);

    const r = await grade(db, p, qi, canonicalCategorizeAnswer(JSON.stringify(right), key));
    assert.equal(r.status, "correct");
    assert.equal(r.correct_answer, key);
    assert.deepEqual(await progress(db, p), { xp: 110, coins: 55, correct_answers: 8 });
    const again = await grade(db, p, qi, canonicalCategorizeAnswer(JSON.stringify(right), key));
    assert.equal(again.status, "correct", "the same verdict");
    assert.deepEqual(await progress(db, p), { xp: 110, coins: 55, correct_answers: 8 }, "nothing paid twice");

    const p2 = await addPupil(db);
    const oneWrong = right.map((c, i) => (i === 0 ? 1 - c : c));
    const wrong = await grade(db, p2, await serve(db, p2, questionId, key), canonicalCategorizeAnswer(JSON.stringify(oneWrong), key));
    assert.equal(wrong.status, "incorrect", "all or nothing: one misplaced item is wrong");
    assert.deepEqual(await progress(db, p2), { xp: 100, coins: 50, correct_answers: 7 });
    // An incomplete or out-of-range placement never reaches the RPC.
    assert.equal(canonicalCategorizeAnswer(JSON.stringify(right.slice(0, 3)), key), null);
    assert.equal(canonicalCategorizeAnswer(JSON.stringify([2, 0, 1, 0]), key), null);
  });
}

test("idempotency under H5: process_question_attempt_v2 replays the same order / placement frozen and pays once", async () => {
  const db = await freshDb();
  await db.exec(MIGRATION);
  await db.exec(readMigration(ATTEMPTS_MIGRATION_FILE));
  const cases = [
    { format: "order", content: { question: "Trin for trin", correct: "-", sequence: "process", items: ["Så", "Vande", "Høste"] },
      key: (c) => createOrderKey(parseOrderContent(c).items.length, zeroDraws),
      answer: (key) => canonicalOrderAnswer(JSON.stringify(parseOrderKey(key)), key) },
    { format: "categorize", content: CAT_VALID[4],
      key: (c) => createCategorizeKey(parseCategorizeContent(c), zeroDraws),
      answer: (key) => canonicalCategorizeAnswer(JSON.stringify(parseCategorizeKey(key).map((pr) => pr.category)), key) },
  ];
  for (const c of cases) {
    const { rows: [{ id: questionId }] } = await insert(db, { format: c.format, content: c.content, active: true });
    const key = c.key(await storedContent(db, questionId));
    const p = await addPupil(db);
    const qi = await serve(db, p, questionId, key);
    const sub = randomUUID();
    const answer = c.answer(key);
    const v2 = async () => (await asService(db, "SELECT public.process_question_attempt_v2($1, $2, $3, 1, $4, NULL, NULL) AS r", [p, qi, answer, sub])).r;
    const first = await v2();
    assert.equal(first.outcome, "recorded", c.format);
    assert.equal(first.status, "correct", c.format);
    assert.deepEqual([first.xp_awarded, first.coins_awarded], [10, 5], c.format);
    const afterFirst = await progress(db, p);
    const replay = await v2();
    assert.deepEqual({ ...replay, outcome: "recorded" }, first, `${c.format}: the frozen result`);
    assert.deepEqual(await progress(db, p), afterFirst, `${c.format}: paid once`);
    const { cnt } = await one(db, "SELECT count(*)::int AS cnt FROM public.question_attempts WHERE student_id = $1", [p]);
    assert.equal(cnt, 1, c.format);
  }
});

// ── 4. Guard ─────────────────────────────────────────────────────────────────────────────────────

test("guard: the file names exactly the four reviewed bodies and its own four results", () => {
  for (const s of STATES) {
    assert.match(MIGRATION, new RegExp(s.base), `${s.name}: base`);
    assert.match(MIGRATION, new RegExp(s.own), `${s.name}: own`);
  }
  for (const h of ["1fa36178e13a157349932e624ca12564", "99354021b5d249d8df797f077eba8788",
    "150eb5468576f3b3eb23a577bd9027e6", "af072e87b371ba58f9838d675006c3d8"]) assert.match(MIGRATION, new RegExp(h));
});

test("guard: an unreviewed body or constraint, a half-extended constraint or mixed states stop the migration and change nothing", async () => {
  const refused = async (db, pattern) => {
    const before = await snapshot(db);
    await assert.rejects(db.exec(MIGRATION), pattern);
    assert.deepEqual(await snapshot(db), before, "nothing changed");
    // The file runs as one transaction, so even the validators it creates before the guard are rolled back.
    assert.equal(await validatorsAbsent(db), true, "validators rolled back");
  };

  const drifted = await freshDb();
  await drifted.exec(`CREATE OR REPLACE FUNCTION public.question_is_servable(p_answer_format text, p_answer_type text, p_content jsonb)
    RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$ SELECT true $$;`);
  await refused(drifted, /F-04\/F-05: question_is_servable has an unreviewed body/);

  const driftedCheck = await freshDb();
  await driftedCheck.exec(`ALTER TABLE public.questions DROP CONSTRAINT questions_answer_format_check,
    ADD CONSTRAINT questions_answer_format_check CHECK (answer_format <> '')`);
  await refused(driftedCheck, /questions_answer_format_check is unreviewed/);

  const driftedContent = await freshDb();
  await driftedContent.exec(`ALTER TABLE public.questions DROP CONSTRAINT content_valid_check,
    ADD CONSTRAINT content_valid_check CHECK (jsonb_typeof(content) = 'object')`);
  await refused(driftedContent, /content_valid_check is unreviewed/);

  // Mixed: F-02's function with production's constraints.
  const f02Fn = F02.match(/CREATE OR REPLACE FUNCTION public\.question_is_servable\([\s\S]*?\n\$\$;/)[0];
  const mixedF02 = await freshDb();
  const prodSrc = await prosrc(mixedF02);
  await mixedF02.exec(f02Fn);
  await refused(mixedF02, /mixed states \(question_is_servable 2, answer_format_check 1, content_valid_check 1\)/);

  // Mixed: production's function with F-02's constraints.
  const mixedF02Constraints = await freshDb({ f02: true });
  await mixedF02Constraints.exec(`CREATE OR REPLACE FUNCTION public.question_is_servable(p_answer_format text, p_answer_type text, p_content jsonb)
    RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS ${"$q$"}${prodSrc}${"$q$"};`);
  assert.equal(await md5Fn(mixedF02Constraints), STATES[0].base);
  await refused(mixedF02Constraints, /mixed states \(question_is_servable 1, answer_format_check 2, content_valid_check 2\)/);

  // Mixed: F-03's constraints with F-02's function (F-03 on production, then F-02's body).
  const mixedF03 = await freshDb({ f03: true });
  const f03pSrc = await prosrc(mixedF03);
  await mixedF03.exec(f02Fn);
  await refused(mixedF03, /mixed states \(question_is_servable 2, answer_format_check 3, content_valid_check 3\)/);

  // Mixed: F-03-on-F-02 constraints with F-03-on-production's body — told apart by 'true_false'.
  const mixedF03Bases = await freshDb({ f02: true, f03: true });
  await mixedF03Bases.exec(`CREATE OR REPLACE FUNCTION public.question_is_servable(p_answer_format text, p_answer_type text, p_content jsonb)
    RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS ${"$q$"}${f03pSrc}${"$q$"};`);
  assert.equal(await md5Fn(mixedF03Bases), STATES[2].base);
  await refused(mixedF03Bases, /mixed states \(question_is_servable 3, answer_format_check 4, content_valid_check 4\)/);

  // Mixed: F-03 on production with only the function (constraints still production's).
  const mixedF03Fn = await freshDb();
  await mixedF03Fn.exec(`CREATE OR REPLACE FUNCTION public.question_is_servable(p_answer_format text, p_answer_type text, p_content jsonb)
    RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS ${"$q$"}${f03pSrc}${"$q$"};`);
  await refused(mixedF03Fn, /mixed states \(question_is_servable 3, answer_format_check 1, content_valid_check 1\)/);
});

test("guard: this file applied with one constraint later narrowed to a single validator is refused", async () => {
  const db = await freshDb();
  await db.exec(MIGRATION);
  await db.exec(`ALTER TABLE public.questions DROP CONSTRAINT questions_answer_format_check,
    ADD CONSTRAINT questions_answer_format_check CHECK (answer_format <> 'order' OR public.order_items_content_is_valid(content))`);
  const before = await snapshot(db);
  await assert.rejects(db.exec(MIGRATION), /questions_answer_format_check is unreviewed/);
  assert.deepEqual(await snapshot(db), before);
});

test("guard: a re-run is a no-op in all four states; the old definitions are kept verbatim inside the new ones", async () => {
  for (const state of STATES) {
    const db = await freshDb(state);
    const baseFmt = await constraintDef(db, "questions_answer_format_check");
    const baseCnt = await constraintDef(db, "content_valid_check");
    const baseSrc = await prosrc(db);
    await db.exec(MIGRATION);
    const once = await snapshot(db);
    assert.equal(once[0], state.own, state.name);
    await db.exec(MIGRATION);
    assert.deepEqual(await snapshot(db), once, `${state.name}: re-run`);
    for (const def of [once[1], once[2]]) {
      assert.equal((def.match(/order_items_content_is_valid/g) ?? []).length, 1, `${state.name}: extended exactly once`);
      assert.equal((def.match(/categorize_content_is_valid/g) ?? []).length, 1, `${state.name}: extended exactly once`);
      assert.equal((def.match(/match_pairs_content_is_valid/g) ?? []).length, state.f03 ? 1 : 0, `${state.name}: F-03's branch kept as it was`);
    }
    assert.ok(once[1].includes(baseFmt.slice(8, -2)), `${state.name}: format check old OR new`);
    assert.ok(once[2].includes(baseCnt.slice(8, -2)), `${state.name}: content check old OR new`);
    // The function body: the base body with exactly the inserted block, nothing else changed.
    const ownSrc = await prosrc(db);
    const anchor = '    -- Server tests "mc" first, the browser "number" first: a format containing both is ambiguous.\n';
    assert.equal(baseSrc.split(anchor).length, 2, `${state.name}: the anchor is in the base body once`);
    const at = baseSrc.indexOf(anchor);
    assert.equal(ownSrc.slice(0, at), baseSrc.slice(0, at), `${state.name}: unchanged before the block`);
    assert.ok(ownSrc.endsWith(baseSrc.slice(at)), `${state.name}: unchanged from the anchor on`);
    const block = ownSrc.slice(at, ownSrc.length - (baseSrc.length - at));
    assert.match(block, /^    -- order_items \(F-04\)[^\n]*\n    WHEN p_answer_format = 'order' THEN \(p_content -> 'force_text'\) IS DISTINCT FROM 'true'::jsonb\n    -- categorize \(F-05\)[^\n]*\n    WHEN p_answer_format = 'categorize' THEN \(p_content -> 'force_text'\) IS DISTINCT FROM 'true'::jsonb\n$/);
  }
});

test("guard: F-02 and F-03 applied AFTER this file are refused by their own guards (they go first)", async () => {
  const onProd = await freshDb();
  await onProd.exec(MIGRATION);
  const applied = await snapshot(onProd);
  await assert.rejects(onProd.exec(F02), /F-02: question_is_servable has an unreviewed body/);
  await assert.rejects(onProd.exec(F03), /F-03: question_is_servable has an unreviewed body/);
  const onF02 = await freshDb({ f02: true });
  await onF02.exec(MIGRATION);
  await assert.rejects(onF02.exec(F03), /F-03: question_is_servable has an unreviewed body/);
  // The refusals changed nothing.
  assert.deepEqual(await snapshot(onProd), applied);
});

// ── 5. Privileges ────────────────────────────────────────────────────────────────────────────────

test("privileges: question_is_servable stays service_role only; both validators run for every writer", async () => {
  const db = await freshDb();
  await db.exec(MIGRATION);
  for (const [role, expected] of [["anon", false], ["authenticated", false], ["public", false], ["service_role", true]]) {
    const { ok } = await one(db, `SELECT has_function_privilege('${role}', 'public.question_is_servable(text, text, jsonb)', 'EXECUTE') AS ok`);
    assert.equal(ok, expected, role);
  }
  for (const fn of ["order_items_content_is_valid", "categorize_content_is_valid"]) {
    for (const role of ["anon", "authenticated", "service_role"]) {
      const { ok } = await one(db, `SELECT has_function_privilege('${role}', 'public.${fn}(jsonb)', 'EXECUTE') AS ok`);
      assert.equal(ok, true, `${fn} ${role}`);
    }
    const row = await one(db, `SELECT prosecdef, provolatile FROM pg_proc WHERE oid = 'public.${fn}(jsonb)'::regprocedure`);
    assert.deepEqual(row, { prosecdef: false, provolatile: "i" }, `${fn}: never SECURITY DEFINER, IMMUTABLE`);
  }
  // A non-superuser writer: an MC row, an order row and a categorize row all pass the CHECKs.
  await db.exec("SET ROLE service_role");
  try {
    await insert(db, { format: "mc", content: { type: "mc", question: "MC efter D-362?", options: ["a", "b"], correct: "a" } });
    await insert(db, { format: "order", content: ORDER_VALID[0] });
    await insert(db, { format: "categorize", content: CAT_VALID[0] });
  } finally { await db.exec("RESET ROLE"); }
});

// ── 6. Inactive ──────────────────────────────────────────────────────────────────────────────────

test("inactive: the file is NOT_IN_PRODUCTION and never replayed; it says so and never mentions db push as a route", () => {
  assert.ok(Object.hasOwn(NOT_IN_PRODUCTION, FILE), `${FILE} must be in NOT_IN_PRODUCTION`);
  assert.ok(Object.hasOwn(NOT_IN_PRODUCTION, F02_FILE));
  assert.match(MIGRATION, /NOT APPLIED IN PRODUCTION/);
  assert.match(MIGRATION, /Q-21/);
  assert.match(MIGRATION, /D-362/);
  assert.equal(/\bdb push\b/.test(MIGRATION.replace(/never db push/g, "")), false);
});
