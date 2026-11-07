// D-362 pilot content for F-07 Stimulus, F-04 Rækkefølge and F-05 Kategorisering (history: Grundloven 1849):
//   20261108090100_stimulus_pilot_content.sql           7 mc/number rows with content.stimulus
//   20261108090200_order_categorize_pilot_content.sql   4 order + 4 categorize rows
// Both are data only, NOT applied, every row inactive (docs/decisions/D-362.md).
//
// What this proves, for EVERY row of both files:
//   1. INACTIVE + MARKED: is_active is written as a literal false in the SQL (never read from the data), and
//      metadata.pilot = "D-362" with metadata.pilot_form naming the form, so the rows can be found and removed.
//   2. CONTRACT: the server's own TS contract accepts the row — publicStimulus/checkStimulus (no error, no
//      dropped field), validateOrderContent / validateCategorizeContent (no error; a warning only where the
//      row is a deliberate practice item), and the MC/number shape (correct among the options, no length cue).
//   3. NO LEAK: toPublicQuestion builds the browser payload, and it carries no grading field — no correct,
//      accepted_answers or review_text, no category of any item, and never the authored order of an order task.
//   4. ASSETS: every stimulus file exists in assets/stimulus/.
//   5. LEVEL: difficulty_level lies on the 1–10,000 scale and in the §4.1 cell of target_grade/difficulty_band.
//   6. TEXT: no mojibake, no ASCII-transliterated æ/ø/å in modern prose, no question text used elsewhere.
//   7. REPLAY: on the isolated replayed schema (PGlite), 20261108090100 stores all rows, inactive, and
//      get_level_questions_for_student serves none of them (and all of them once active — a positive control,
//      rolled back). 20261108090200 is refused before 20261108090000; after it (when that file exists and
//      applies) it stores all rows, inactive, and they are not served either.
// HONEST LIMITS: PGlite is PostgreSQL 18.x (production 17.6) and runs as superuser. The faglige claims are not
// machine-checkable; they are listed for the owner in docs/operations/task-forms-pilot-content-review.md.
// Passing is not permission to apply (D-110).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { replaySchema } from "../isolated/schema/replay.mjs";
import { bootstrapMarkerSql } from "../isolated/seed/seed-guard.mjs";
import { publicStimulus, checkStimulus } from "../../supabase/functions/_shared/stimulus.ts";
import { validateOrderContent, parseOrderContent, createOrderKey } from "../../supabase/functions/_shared/order-items.ts";
import {
  validateCategorizeContent, parseCategorizeContent, createCategorizeKey, categorizeGuessChance, CATEGORIZE_EVIDENCE_GUESS_LIMIT,
} from "../../supabase/functions/_shared/categorize.ts";
import { toPublicQuestion } from "../../supabase/functions/_shared/question-dto.ts";
import { findLengthCue } from "../../tools/question-quality/length-cue.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");
const STIMULUS_FILE = "20261108090100_stimulus_pilot_content.sql";
const OC_FILE = "20261108090200_order_categorize_pilot_content.sql";
const ACTIVATION_FILE = "20261108090000_order_categorize_activation.sql";
const read = (f) => readFileSync(join(MIGRATIONS, f), "utf8");
const STIMULUS_SQL = read(STIMULUS_FILE);
const OC_SQL = read(OC_FILE);

const GRADE = 7;
const OBJECTIVE = "revolutions_democracy";

// The row data exactly as the SQL hands it to jsonb_array_elements.
function rowsOf(sql) {
  const m = /\$pilot\$(\[[\s\S]*\])\$pilot\$::jsonb/.exec(sql);
  assert.ok(m, "the $pilot$ JSON array is missing");
  return JSON.parse(m[1]);
}
const STIMULUS_ROWS = rowsOf(STIMULUS_SQL);
const OC_ROWS = rowsOf(OC_SQL);
const ALL_ROWS = [...STIMULUS_ROWS, ...OC_ROWS];
const label = (r) => `${r.metadata?.pilot_form}/${r.answer_format} "${r.content?.question}"`;

// Every string anywhere in a value.
function strings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => strings(v, out));
  return out;
}

// The browser payload must hold none of these anywhere.
const GRADING_KEYS = ["correct", "accepted_answers", "review_text", "category", "facit", "tolerance", "criteria"];
function assertNoLeak(row, pub) {
  const json = JSON.stringify(pub);
  for (const key of GRADING_KEYS) assert.equal(json.includes(`"${key}"`), false, `${label(row)}: payload carries "${key}"`);
  assert.equal(json.includes(row.content.review_text), false, `${label(row)}: payload carries the review text`);
  assert.equal(json.includes('"pilot'), false, `${label(row)}: payload carries the pilot marker`);
  assert.equal(pub.content.items, undefined, `${label(row)}: payload carries content.items`);
}

test("the files hold the agreed rows: 7 stimulus (mc/number), 4 order, 4 categorize", () => {
  const count = (rows, form, fmt) => rows.filter((r) => r.metadata.pilot_form === form && r.answer_format === fmt).length;
  assert.equal(STIMULUS_ROWS.length, 7);
  assert.equal(count(STIMULUS_ROWS, "stimulus", "mc") + count(STIMULUS_ROWS, "stimulus", "number"), 7);
  assert.ok(count(STIMULUS_ROWS, "stimulus", "number") >= 1 && count(STIMULUS_ROWS, "stimulus", "mc") >= 1);
  assert.equal(OC_ROWS.length, 8);
  assert.equal(count(OC_ROWS, "order", "order"), 4);
  assert.equal(count(OC_ROWS, "categorize", "categorize"), 4);
  // Introduction → comprehension check → independent application, in that order of difficulty.
  const phases = STIMULUS_ROWS.map((r) => r.metadata.pilot_phase);
  assert.deepEqual([...new Set(phases)], ["introduktion", "forståelsestjek", "selvstændig anvendelse"]);
  const levels = STIMULUS_ROWS.map((r) => r.difficulty_level);
  assert.deepEqual(levels, [...levels].sort((a, b) => a - b), "the stimulus sequence rises in level");
});

test("inactive and marked: is_active is a literal false in both INSERTs; every row carries the D-362 marker", () => {
  for (const [file, sql] of [[STIMULUS_FILE, STIMULUS_SQL], [OC_FILE, OC_SQL]]) {
    const inserts = sql.match(/INSERT INTO public\.questions/g) ?? [];
    assert.equal(inserts.length, 1, `${file}: exactly one INSERT`);
    assert.match(sql, /is_active, learning_objective, target_grade, difficulty_band, difficulty_level\)\s*SELECT[\s\S]*?'auto',\s*\n\s*false,\s*\n\s*'revolutions_democracy', 7,/,
      `${file}: is_active must be the literal false, in its column position`);
    const code = sql.replace(/^--.*$/gm, "");
    assert.equal(/\b(UPDATE|DELETE|ALTER|DROP|CREATE|GRANT|REVOKE|TRUNCATE)\b/i.test(code), false, `${file}: data insert only`);
    assert.match(sql, /DELETE FROM public\.questions/, `${file}: the header says how to remove the rows`);
    assert.match(sql, /D-362/);
    assert.match(sql, /IKKE ANVENDT/);
  }
  assert.match(OC_SQL, /KAN IKKE ANVENDES FØR 20261108090000_order_categorize_activation\.sql/);
  for (const r of ALL_ROWS) {
    assert.equal("is_active" in r, false, `${label(r)}: is_active must not come from the data`);
    assert.equal(r.metadata.pilot, "D-362", label(r));
    assert.ok(["stimulus", "order", "categorize"].includes(r.metadata.pilot_form), label(r));
    assert.equal(r.metadata.domain, OBJECTIVE, label(r));
  }
  for (const r of OC_ROWS) assert.equal(r.metadata.pilot_form, r.answer_format, label(r));
});

test("level: every row is on the 1–10,000 scale and in its §4.1 cell (grade 7)", () => {
  for (const r of ALL_ROWS) {
    const { difficulty_band: band, difficulty_level: level } = r;
    assert.ok(Number.isInteger(level) && level >= 1 && level <= 10000, label(r));
    assert.ok(Number.isInteger(band) && band >= 1 && band <= 5, label(r));
    const cell = (GRADE - 3) * 5 + (band - 1);
    assert.ok(level > cell * 10000 / 35 && level <= (cell + 1) * 10000 / 35,
      `${label(r)}: level ${level} is not in the cell of grade ${GRADE} band ${band}`);
  }
});

test("stimulus contract: every stimulus passes publicStimulus with nothing dropped, and its file exists", () => {
  const withStimulus = ALL_ROWS.filter((r) => r.content.stimulus !== undefined);
  assert.equal(withStimulus.length, 9, "7 stimulus rows + 1 order row + 1 categorize row");
  for (const r of STIMULUS_ROWS) assert.ok(r.content.stimulus, `${label(r)}: a stimulus row without a stimulus`);
  for (const r of withStimulus) {
    const { errors, warnings } = checkStimulus(r.content.stimulus);
    assert.deepEqual(errors, [], label(r));
    assert.deepEqual(warnings, [], label(r));
    const pub = publicStimulus(r.content.stimulus);
    assert.deepEqual(pub, r.content.stimulus, `${label(r)}: the stored stimulus is exactly its public form`);
    if (pub.kind === "image" || pub.kind === "audio") {
      assert.ok(existsSync(join(ROOT, "assets", "stimulus", pub.file)), `${label(r)}: assets/stimulus/${pub.file} is missing`);
    }
  }
});

test("mc/number contract: the shape production stores today, the answer among the options, no length cue", () => {
  for (const r of STIMULUS_ROWS) {
    const c = r.content;
    assert.ok(["mc", "number"].includes(r.answer_format), label(r));
    assert.equal(c.type, r.answer_format, `${label(r)}: content.type (content_valid_check)`);
    assert.ok(typeof c.question === "string" && c.question.trim().length > 0, label(r));
    assert.ok(typeof c.review_text === "string" && c.review_text.trim().length > 0, label(r));
    assert.deepEqual(c.accepted_answers, [c.correct], label(r));
    if (r.answer_format === "mc") {
      assert.equal(r.type, "mc_single", label(r));
      assert.equal(c.options.length, 4, label(r));
      assert.equal(new Set(c.options).size, 4, label(r));
      assert.ok(c.options.includes(c.correct), label(r));
      assert.equal(findLengthCue(c.options, c.correct), null, `${label(r)}: length cue`);
    } else {
      assert.equal(r.type, "number", label(r));
      assert.equal("options" in c, false, label(r));
      assert.match(c.correct, /^\d+$/, `${label(r)}: a number answer is digits`);
    }
  }
  // The browser shows MC options in the stored order, so the correct one must not always sit in one place.
  const positions = new Set(STIMULUS_ROWS.filter((r) => r.answer_format === "mc").map((r) => r.content.options.indexOf(r.content.correct)));
  assert.deepEqual([...positions].sort(), [0, 1, 2, 3]);
});

test("order contract: validateOrderContent accepts every row without a warning; chronological rows avoid causal wording", () => {
  for (const r of OC_ROWS.filter((x) => x.answer_format === "order")) {
    const { errors, warnings } = validateOrderContent(r.content, r.difficulty_band, r.content.review_text);
    assert.deepEqual(errors, [], label(r));
    assert.deepEqual(warnings, [], label(r));
    const parsed = parseOrderContent(r.content);
    assert.ok(parsed.items.length >= 4, `${label(r)}: 4+ items is the evidence size`);
    assert.ok(["chronological", "process"].includes(parsed.sequence), label(r));
    assert.equal(r.content.correct, "-", `${label(r)}: content.correct is a placeholder, never the facit`);
  }
});

test("categorize contract: validateCategorizeContent accepts every row; only the marked practice row is above 1 in 20", () => {
  for (const r of OC_ROWS.filter((x) => x.answer_format === "categorize")) {
    const { errors, warnings } = validateCategorizeContent(r.content, r.content.review_text);
    assert.deepEqual(errors, [], label(r));
    const parsed = parseCategorizeContent(r.content);
    assert.ok(parsed.categories.length >= 2 && parsed.categories.length <= 3, label(r));
    assert.ok(parsed.items.length >= 4 && parsed.items.length <= 8, label(r));
    const chance = categorizeGuessChance(parsed.items.length, parsed.categories.length).nonEmpty;
    if (r.metadata.pilot_practice === true) {
      assert.ok(chance > CATEGORIZE_EVIDENCE_GUESS_LIMIT, `${label(r)}: marked practice but is evidence size`);
      assert.equal(warnings.length, 1, label(r));
      assert.match(warnings[0], /practice/);
    } else {
      assert.ok(chance <= CATEGORIZE_EVIDENCE_GUESS_LIMIT, `${label(r)}: guess chance 1 in ${Math.round(1 / chance)}`);
      assert.deepEqual(warnings, [], label(r));
    }
    assert.equal(r.content.correct, "-", `${label(r)}: content.correct is a placeholder, never the facit`);
  }
  assert.equal(OC_ROWS.filter((r) => r.metadata.pilot_practice === true).length, 1, "exactly one deliberate practice row");
});

test("no leak: toPublicQuestion builds a payload without any grading field, item category or authored order", () => {
  for (const r of ALL_ROWS) {
    const c = r.content;
    // Several instances per keyed row: every shuffle must hide the facit.
    const keys = r.answer_format === "order"
      ? Array.from({ length: 25 }, () => createOrderKey(parseOrderContent(c).items.length))
      : r.answer_format === "categorize"
        ? Array.from({ length: 25 }, () => createCategorizeKey(parseCategorizeContent(c)))
        : [undefined];
    for (const key of keys) {
      const pub = toPublicQuestion(c, r.answer_format, r.metadata, key);
      assertNoLeak(r, pub);
      assert.equal(pub.content.question, c.question, label(r));
      if (c.stimulus) assert.deepEqual(pub.content.stimulus, publicStimulus(c.stimulus), label(r));
      if (r.answer_format === "mc") assert.deepEqual(pub.content.options, c.options, label(r));
      if (r.answer_format === "number") assert.equal(pub.content.options, undefined, label(r));
      if (r.answer_format === "order") {
        assert.deepEqual(Object.keys(pub.content.order).sort(), ["items", "sequence"]);
        assert.deepEqual([...pub.content.order.items].sort(), [...c.items].sort(), label(r));
        assert.notDeepEqual(pub.content.order.items, c.items, `${label(r)}: shown in the authored (correct) order`);
      }
      if (r.answer_format === "categorize") {
        assert.deepEqual(Object.keys(pub.content.categorize).sort(), ["categories", "items"]);
        assert.deepEqual(pub.content.categorize.categories, c.categories, label(r));
        assert.ok(pub.content.categorize.items.every((t) => typeof t === "string"), `${label(r)}: an item is not plain text`);
        assert.deepEqual([...pub.content.categorize.items].sort(), c.items.map((i) => i.text).sort(), label(r));
      }
    }
    // The public metadata whitelist drops the pilot marker.
    const meta = toPublicQuestion(c, r.answer_format, r.metadata, keys[0]).metadata;
    assert.equal(meta?.pilot, undefined, label(r));
  }
});

test("text: no mojibake, no transliterated æ/ø/å in modern prose, no question text used in another migration", () => {
  for (const r of ALL_ROWS) {
    for (const s of strings(r)) {
      assert.equal(/Ã|Â|â€|\uFFFD/.test(s), false, `${label(r)}: mojibake in "${s}"`);
    }
    // Modern prose: everything except the quoted 1849 source text (historical spelling: Aar, Huusstand, …).
    const historical = r.content.stimulus?.kind === "source" && r.content.stimulus.credit.year === "1849" ? r.content.stimulus.text : null;
    for (const s of strings(r.content).filter((s) => s !== historical)) {
      // "boet" (has lived) is real Danish; any other ae/oe/aa in modern prose is a transliteration.
      // A quotation from the 1849 source keeps the source's spelling.
      const unquoted = s.replace(/"([^"]*)"/g, (m, q) => (historical !== null && historical.includes(q) ? "" : m));
      assert.equal(/(?:ae|oe|aa)/i.test(unquoted.replace(/\bboet\b/g, "")), false,
        `${label(r)}: ASCII-transliterated Danish in "${s}"`);
    }
  }
  const texts = ALL_ROWS.map((r) => r.content.question);
  assert.equal(new Set(texts).size, texts.length, "a question text is repeated");
  const others = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql") && f !== STIMULUS_FILE && f !== OC_FILE);
  for (const f of others) {
    const sql = read(f);
    for (const q of texts) {
      assert.equal(sql.includes(JSON.stringify(q).slice(1, -1)), false, `"${q}" already exists in ${f} (unique_question_text)`);
    }
  }
});

// ── Replay: the isolated replayed schema (production's schema, no question rows) ─────────────────────────

const PUPIL = "00000000-0000-4000-8000-0000000d3620";
let db;
before(async () => {
  db = new PGlite();
  await db.exec(readFileSync(join(ROOT, "tests", "isolated", "schema", "pglite-platform.sql"), "utf8"));
  await db.exec(bootstrapMarkerSql("0123456789abcdef0123456789abcdef"));
  const r = await replaySchema({ exec: (s) => db.exec(s), query: async (s) => (await db.query(s)).rows });
  assert.deepEqual(r.failures, []);
  await db.exec(`INSERT INTO auth.users (id, email) VALUES ('${PUPIL}', 'elev-d362@example.test');
                 INSERT INTO public.profiles (id, role, selected_grade) VALUES ('${PUPIL}', 'student', ${GRADE});`);
});
after(async () => { await db?.close(); });

const pilotRows = async (forms) => (await db.query(
  `SELECT * FROM public.questions WHERE metadata->>'pilot' = 'D-362' AND metadata->>'pilot_form' = ANY ($1::text[])
   ORDER BY difficulty_level`, [forms])).rows;
const served = async (level) => (await db.query(
  "SELECT id FROM public.get_level_questions_for_student($1::uuid, $2::integer, $3::text[], 100)", [PUPIL, level, [OBJECTIVE]])).rows.map((x) => x.id);

// Stored rows equal the file's data, all inactive; not served while inactive; all served once active
// (positive control, rolled back).
async function assertStoredInactiveAndUnserved(forms, expected) {
  const rows = await pilotRows(forms);
  assert.equal(rows.length, expected.length);
  const byQuestion = new Map(rows.map((x) => [x.content.question, x]));
  for (const e of expected) {
    const s = byQuestion.get(e.content.question);
    assert.ok(s, `not stored: ${label(e)}`);
    assert.equal(s.is_active, false, label(e));
    assert.deepEqual(s.content, e.content, label(e));
    assert.deepEqual(s.metadata, e.metadata, label(e));
    assert.equal(s.answer_format, e.answer_format, label(e));
    // The stimulus file states the type column per row; the order/categorize file uses the answer format.
    assert.equal(s.type, e.type ?? e.answer_format, label(e));
    assert.equal(s.answer_type, "short", label(e));
    assert.equal(s.question_type, "auto", label(e));
    assert.equal(s.learning_objective, OBJECTIVE, label(e));
    assert.equal(s.target_grade, GRADE, label(e));
    assert.equal(s.difficulty_band, e.difficulty_band, label(e));
    assert.equal(s.difficulty, e.difficulty_band, label(e));
    assert.equal(s.difficulty_level, e.difficulty_level, label(e));
  }
  const ids = rows.map((x) => x.id);
  for (const level of [5800, 6300, 6800]) {
    const got = await served(level);
    assert.deepEqual(got.filter((id) => ids.includes(id)), [], `an inactive pilot row is served at level ${level}`);
  }
  await db.exec("BEGIN");
  try {
    await db.query("UPDATE public.questions SET is_active = true WHERE id = ANY ($1::uuid[])", [ids]);
    const got = await served(6300);
    assert.deepEqual(ids.filter((id) => !got.includes(id)), [], "positive control: an active pilot row would be servable");
  } finally {
    await db.exec("ROLLBACK");
  }
  assert.equal((await pilotRows(forms)).every((x) => x.is_active === false), true);
}

test("replay: 20261108090100 stores the 7 stimulus rows inactive on production's schema; none is served", async () => {
  await db.exec(STIMULUS_SQL);
  await assertStoredInactiveAndUnserved(["stimulus"], STIMULUS_ROWS);
});

test("replay: 20261108090200 is refused before the activation migration, and nothing is stored", async () => {
  await assert.rejects(db.exec(OC_SQL), /20261108090000_order_categorize_activation\.sql is not applied/);
  assert.equal((await pilotRows(["order", "categorize"])).length, 0);
});

test("replay: after 20261108090000, 20261108090200 stores the 8 order/categorize rows inactive; none is served", async (t) => {
  if (!existsSync(join(MIGRATIONS, ACTIVATION_FILE))) {
    t.skip(`${ACTIVATION_FILE} does not exist yet — the order/categorize rows cannot be stored before it`);
    return;
  }
  try {
    await db.exec(read(ACTIVATION_FILE));
  } catch (e) {
    t.skip(`${ACTIVATION_FILE} does not apply on the replayed schema (${String(e?.message ?? e).split("\n")[0]}) — not this file's concern`);
    return;
  }
  await db.exec(OC_SQL);
  await assertStoredInactiveAndUnserved(["order", "categorize"], OC_ROWS);
  // The database's own validators agree with the TS contract on every stored row.
  for (const r of OC_ROWS) {
    const fn = r.answer_format === "order" ? "order_items_content_is_valid" : "categorize_content_is_valid";
    const { ok } = (await db.query(`SELECT public.${fn}($1::jsonb) AS ok`, [JSON.stringify(r.content)])).rows[0];
    assert.equal(ok, true, label(r));
  }
});
