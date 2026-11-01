// PARITY (D-290, G1): the SQL twins in 20261101150000_grading_meaningful_characters.sql give exactly the
// results of supabase/functions/_shared/answer-normalize.ts on one corpus — real defect patterns, Danish
// letters in both cases, typographic apostrophes, no-break/thin spaces, tabs/newlines, numbers in every
// accepted and rejected form. The two SQL helpers are taken verbatim from the migration file.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { normalizeChoice, normalizeNumber, UPPER, LOWER } from "../../supabase/functions/_shared/answer-normalize.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SQL = readFileSync(join(ROOT, "supabase", "migrations", "20261101150000_grading_meaningful_characters.sql"), "utf8")
  .split("\r\n").join("\n");

function statement(name, tag) {
  const start = SQL.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.ok(start >= 0, name);
  const open = SQL.indexOf(tag, start);
  const close = SQL.indexOf(tag, open + tag.length);
  return SQL.slice(start, SQL.indexOf(";", close) + 1);
}

const CHOICES = [
  "'s", "s'", "s", "es", "My father's car is red.", "My fathers car is red.", "ø", "å", "æ", "ae", "Æ", "ØRESUND",
  "Ærø", "frø", "får", "Fisk", "  ice   cream ", "Ice\tCream\n", "Tom’s", "Tom‘s", "Tomʼs", "Tom`s", "Tom´s",
  "å", "Å", "Paris.", "Paris", "", "   ", " Paris ", "Paris by night", "ÉLÈVE", "Über",
  "ÑANDÚ", "Ça va", "1,5", "-5", "−5", "1/2", "Prinsessen", "MiXeD Case ÆØÅ æøå", "line1\r\nline2",
];
const NUMBERS = [
  "1,5", "15", "1.5", "-5", "−5", "–5", "—5", "5", "1 000", "1 000", "1 000", "12 345,50", "12345.5",
  "007", "7", "-0", "0", "2,50", "1/2", "5 kr", "fem", "", "  ", "1,2,3", "1 00", "--5", "1.", ".5", " 42 ",
  "\t3\n", "1 000 000", "١٢", "1e3", "+5", "0,0", "000", "-007,10",
];

let db;
test.before(async () => {
  db = new PGlite();
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;");
  await db.exec(statement("normalize_choice_answer", "$norm_choice$"));
  await db.exec(statement("normalize_number_answer", "$norm_number$"));
});

test("the explicit upper→lower table is identical in TS and SQL", () => {
  assert.equal(UPPER.length, LOWER.length);
  assert.ok(SQL.includes(`'${UPPER}'`) && SQL.includes(`'${LOWER}'`), "SQL uses the same two strings");
  for (let i = 0; i < UPPER.length; i++) assert.equal(UPPER[i].toLowerCase(), LOWER[i]);
});

test("normalize_choice_answer = normalizeChoice on the whole corpus", async () => {
  for (const s of CHOICES) {
    const sql = (await db.query("SELECT public.normalize_choice_answer($1) AS r", [s])).rows[0].r;
    assert.equal(sql, normalizeChoice(s), JSON.stringify(s));
  }
  assert.equal((await db.query("SELECT public.normalize_choice_answer(NULL) AS r")).rows[0].r, normalizeChoice(null));
});

test("normalize_number_answer = normalizeNumber on the whole corpus (NULL ⇔ null)", async () => {
  for (const s of NUMBERS) {
    const sql = (await db.query("SELECT public.normalize_number_answer($1) AS r", [s])).rows[0].r;
    assert.equal(sql, normalizeNumber(s), JSON.stringify(s));
  }
  assert.equal((await db.query("SELECT public.normalize_number_answer(NULL) AS r")).rows[0].r, null);
});

test("the defect patterns are fixed in SQL too", async () => {
  const n = async (s) => (await db.query("SELECT public.normalize_choice_answer($1) AS r", [s])).rows[0].r;
  assert.notEqual(await n("'s"), await n("s'"));
  assert.notEqual(await n("My father's car is red."), await n("My fathers car is red."));
  assert.equal(await n("ø"), "ø");
  assert.notEqual(await n("frø"), await n("får"));
});
