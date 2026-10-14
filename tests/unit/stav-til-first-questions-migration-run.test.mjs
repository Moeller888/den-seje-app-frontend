// RUNTIME proof for migration 20261011094747_stav_til_first_questions. The SQL file is executed
// UNMODIFIED against a real PostgreSQL (PGlite, in-process WebAssembly — no Docker, no network), on
// a fixture that reproduces the LIVE state measured read-only on 2026-10-11:
//   - public.questions with the live columns and CHECK constraints;
//   - the two inactive text questions exactly as live (b88f169a Polen, d02db9bf Belgien);
//   - process_text_answer and request_repeat_question copied verbatim from pg_get_functiondef.
// The rollback is the block in the migration's own header comment, extracted and run as written.
//
// The answer journey mirrors process-event's short-text path with mock pupils: get-next-question
// stores content.correct as question_instances.correct_answer; process-event decides correctness
// with the REAL evaluator (_shared/answer-evaluation.ts) and passes the verdict to process_text_answer.
//
// HONEST LIMITS:
//   - PGlite is PostgreSQL 18.x; production is 17.6.
//   - update_streak and the two quest helpers are counting stubs; only their call count is checked.
//   - question_instances / student_progress carry only the columns the two functions touch.
//   - Passing here is not permission to apply. Applying needs its own owner authorisation (D-110).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { isTextAnswerCorrect } from "../../supabase/functions/_shared/answer-evaluation.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILE = "20261011094747_stav_til_first_questions.sql";
const MIGRATION = readFileSync(join(ROOT, "supabase", "migrations", FILE), "utf8");

// The rollback lives in the header comment so it travels with the migration. Extract it verbatim.
function extractRollback(sql) {
  const lines = sql.split(/\r?\n/);
  const start = lines.findIndex((l) => /^--\s+DO \$rollback\$/.test(l));
  const end = lines.findIndex((l, i) => i > start && /^--\s+\$rollback\$;/.test(l));
  assert.ok(start >= 0 && end > start, "rollback block present in the header");
  return lines.slice(start, end + 1).map((l) => l.replace(/^--\s{0,3}/, "")).join("\n");
}
const ROLLBACK = extractRollback(MIGRATION);

const POLEN = "b88f169a-f959-4d8b-bc9b-846fb36017fb";
const BELGIEN = "d02db9bf-6e42-44e4-ae35-39966b6a4f96";
const NORGE = "88b65a03-c2ea-428f-a5e6-80d5da83362f";
const MC = "00000000-0000-4000-8000-00000000c0de";      // stand-in for the 2,099 active MC questions
const P1 = "00000000-0000-4000-8000-000000000001";
const P2 = "00000000-0000-4000-8000-000000000002";

const POLEN_CONTENT = { correct: "Polen", question: "Hvilket land invaderede Tyskland 1. september 1939?", accepted_answers: ["Polen"] };
const BELGIEN_CONTENT = { correct: "Belgien", question: "Hvilket land blev invaderet af Tyskland i maj 1940 som en del af Vestoffensiven?", accepted_answers: ["Belgien"] };

const FIXTURE = `
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;

  CREATE TABLE public.questions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type text NOT NULL,
    content jsonb NOT NULL,
    difficulty integer NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz DEFAULT now(),
    deactivated_at timestamptz,
    deactivation_reason text,
    question_type text NOT NULL,
    learning_objective text,
    answer_format text NOT NULL,
    content_hash text,
    batch_id uuid,
    cognitive_level text,
    ai_model text,
    ai_prompt_version text,
    ai_generator text,
    answer_type text DEFAULT 'short',
    metadata jsonb,
    target_grade smallint,
    difficulty_band smallint,
    CONSTRAINT active_requires_auto CHECK ((NOT is_active) OR (question_type = 'auto')),
    CONSTRAINT auto_questions_require_objective CHECK ((question_type <> 'auto') OR (learning_objective IS NOT NULL)),
    CONSTRAINT auto_requires_correct CHECK ((question_type <> 'auto') OR ((content ->> 'correct') IS NOT NULL)),
    CONSTRAINT content_valid_check CHECK ((jsonb_typeof(content) = 'object') AND (content ? 'question') AND (content ? 'correct') AND ((((content ->> 'type') = 'mc') AND (content ? 'options') AND (jsonb_typeof((content -> 'options')) = 'array') AND (jsonb_array_length((content -> 'options')) > 0)) OR ((content ->> 'type') = ANY (ARRAY['text', 'number'])))),
    CONSTRAINT question_type_valid CHECK (question_type = ANY (ARRAY['auto', 'open'])),
    CONSTRAINT questions_answer_format_check CHECK ((((answer_format = 'mc') AND (content ? 'options') AND (jsonb_typeof((content -> 'options')) = 'array') AND (jsonb_array_length((content -> 'options')) >= 2)) OR ((answer_format = 'number') AND (content ? 'correct')) OR ((answer_format = 'text') AND (NOT (content ? 'options'))))),
    CONSTRAINT questions_difficulty_band_check CHECK ((difficulty_band IS NULL) OR ((difficulty_band >= 1) AND (difficulty_band <= 5))),
    CONSTRAINT questions_difficulty_check CHECK ((difficulty >= 1) AND (difficulty <= 1000)),
    CONSTRAINT questions_target_grade_check CHECK ((target_grade IS NULL) OR ((target_grade >= 3) AND (target_grade <= 9)))
  );

  INSERT INTO public.questions (id, type, content, difficulty, is_active, created_at, deactivated_at,
      deactivation_reason, question_type, learning_objective, answer_format, content_hash, batch_id,
      ai_generator, answer_type, metadata, target_grade, difficulty_band) VALUES
    ('${POLEN}', 'mc_single', '${JSON.stringify(POLEN_CONTENT)}', 1, false,
     '2026-02-25 12:19:07.473681+00', '2026-03-08 16:52:55.128162+00', 'legacy_cleanup', 'auto',
     'world_war_2', 'text', '9de8bd50901f90afe89a75e501a383c1e9ebc0966db8ae013ac72296366c5772',
     '43bec9cc-6b7d-4b0d-ae56-44912324d5f5', 'migration_seed', 'short',
     '{"domain":"world_war_2","insight_type":"conceptual_bridge","challenge_role":"reinforcement","cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association"}',
     7, 1),
    ('${BELGIEN}', 'mc_single', '${JSON.stringify(BELGIEN_CONTENT)}', 6, false,
     '2026-02-27 12:47:42.482801+00', '2026-03-08 16:52:55.128162+00', 'legacy_cleanup', 'auto',
     'world_war_2', 'text', '2421f9e39d6c5fbc2544d9c5b11dc8471046382668006416f5572bc05f9cb28d',
     'edaf29e5-c8d1-4639-99e8-762925ecb45c', 'migration_seed', 'short',
     '{"domain":"world_war_2","insight_type":"reframing","challenge_role":"reinforcement","cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"scope_confusion"}',
     7, 2),
    ('${MC}', 'mc_single', '{"question":"MC","options":["a","b"],"correct":"a","review_text":"r"}', 1, true,
     now(), NULL, NULL, 'auto', 'world_war_2', 'mc', NULL, NULL, NULL, 'short', NULL, 7, 1);

  CREATE TABLE public.question_instances (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid NOT NULL,
    question_id uuid NOT NULL,
    answered boolean NOT NULL DEFAULT false,
    correct_answer text,
    user_answer text,
    was_correct boolean,
    answered_at timestamptz,
    next_review_at timestamptz,
    teacher_score integer,
    repeat_count integer NOT NULL DEFAULT 0
  );

  CREATE TABLE public.student_progress (
    student_id uuid PRIMARY KEY,
    xp integer DEFAULT 0, coins integer DEFAULT 0,
    correct_answers integer DEFAULT 0, total_correct_answers integer DEFAULT 0
  );
  INSERT INTO public.student_progress (student_id) VALUES ('${P1}'), ('${P2}');

  -- Counting stubs for the helpers process_text_answer calls.
  CREATE TABLE public.helper_calls (fn text, user_id uuid, is_correct boolean);
  CREATE FUNCTION public.update_streak(p uuid) RETURNS void LANGUAGE sql AS
    $$ INSERT INTO public.helper_calls VALUES ('update_streak', p, NULL) $$;
  CREATE FUNCTION public.update_quest_progress_for_answer(p uuid, c boolean, x integer) RETURNS void LANGUAGE sql AS
    $$ INSERT INTO public.helper_calls VALUES ('quest', p, c) $$;
  CREATE FUNCTION public.update_weekly_quest_progress_for_answer(p uuid, c boolean, x integer) RETURNS void LANGUAGE sql AS
    $$ INSERT INTO public.helper_calls VALUES ('weekly', p, c) $$;

  -- process_text_answer: verbatim from production (pg_get_functiondef, 2026-10-11).
  CREATE OR REPLACE FUNCTION public.process_text_answer(p_instance_id uuid, p_user_id uuid, p_user_answer text, p_is_correct boolean)
   RETURNS text
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path TO 'public', 'pg_temp'
  AS $function$
  DECLARE
    v_rows_updated INTEGER;
    v_next_review  TIMESTAMPTZ;
  BEGIN
    v_next_review := CASE p_is_correct
      WHEN true THEN now() + INTERVAL '1 day'
      ELSE            now() + INTERVAL '10 minutes'
    END;

    UPDATE question_instances
    SET
      user_answer    = p_user_answer,
      was_correct    = p_is_correct,
      answered       = true,
      answered_at    = now(),
      next_review_at = v_next_review
    WHERE id         = p_instance_id
      AND student_id = p_user_id
      AND answered   = false;

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

    IF v_rows_updated = 0 THEN
      RETURN 'already_processed';
    END IF;

    IF p_is_correct THEN
      UPDATE student_progress
      SET
        xp                    = COALESCE(xp, 0) + 10,
        coins                 = COALESCE(coins, 0) + 5,
        correct_answers       = COALESCE(correct_answers, 0) + 1,
        total_correct_answers = COALESCE(total_correct_answers, 0) + 1
      WHERE student_id = p_user_id;
    END IF;

    PERFORM update_streak(p_user_id);
    PERFORM update_quest_progress_for_answer(
      p_user_id,
      p_is_correct,
      CASE WHEN p_is_correct THEN 10 ELSE 0 END
    );
    PERFORM public.update_weekly_quest_progress_for_answer(
      p_user_id,
      p_is_correct,
      CASE WHEN p_is_correct THEN 10 ELSE 0 END
    );

    RETURN CASE p_is_correct WHEN true THEN 'rewarded' ELSE 'recorded' END;
  END;
  $function$;

  -- request_repeat_question: verbatim from production (pg_get_functiondef, 2026-10-11).
  CREATE OR REPLACE FUNCTION public.request_repeat_question(p_grade smallint, p_domains text[])
   RETURNS uuid
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path TO 'public', 'pg_temp'
  AS $function$
  DECLARE
    v_uid         uuid := (SELECT auth.uid());
    v_instance_id uuid;
  BEGIN
    IF v_uid IS NULL THEN
      RETURN NULL;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.question_instances qi
      WHERE qi.student_id = v_uid AND qi.answered = false
    ) THEN
      RETURN NULL;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.questions q
      WHERE q.is_active
        AND (p_grade IS NULL OR q.target_grade IS NULL OR q.target_grade <= p_grade)
        AND (p_domains IS NULL OR q.learning_objective = ANY(p_domains))
        AND NOT EXISTS (
          SELECT 1 FROM public.question_instances qi
          WHERE qi.student_id = v_uid AND qi.question_id = q.id
        )
    ) THEN
      RETURN NULL;
    END IF;

    SELECT qi.id
    INTO v_instance_id
    FROM public.question_instances qi
      JOIN public.questions q ON q.id = qi.question_id
    WHERE qi.student_id  = v_uid
      AND qi.answered    = true
      AND qi.teacher_score IS NULL
      AND q.is_active
      AND q.answer_format <> 'text'
      AND coalesce(q.answer_type, 'short') <> 'long'
      AND (p_grade IS NULL OR q.target_grade IS NULL OR q.target_grade <= p_grade)
      AND (p_domains IS NULL OR q.learning_objective = ANY(p_domains))
    ORDER BY
      (qi.was_correct IS NOT FALSE),
      qi.answered_at ASC NULLS FIRST
    LIMIT 1;

    IF v_instance_id IS NULL THEN
      RETURN NULL;
    END IF;

    UPDATE public.question_instances
    SET answered       = false,
        user_answer    = NULL,
        was_correct    = NULL,
        answered_at    = NULL,
        next_review_at = now(),
        repeat_count   = repeat_count + 1
    WHERE id = v_instance_id
      AND student_id = v_uid
      AND answered = true;

    IF NOT FOUND THEN
      RETURN NULL;
    END IF;

    RETURN v_instance_id;
  END;
  $function$;
`;

async function db({ migrated = false, extra = "" } = {}) {
  const pg = new PGlite();
  await pg.exec(FIXTURE);
  if (extra) await pg.exec(extra);
  if (migrated) await pg.exec(MIGRATION);
  return pg;
}

const row = async (pg, id) =>
  (await pg.query("SELECT * FROM public.questions WHERE id = $1", [id])).rows[0] ?? null;
const allQuestions = async (pg) =>
  (await pg.query("SELECT * FROM public.questions ORDER BY id")).rows;
const progress = async (pg, uid) =>
  (await pg.query("SELECT xp, coins, correct_answers, total_correct_answers FROM public.student_progress WHERE student_id = $1", [uid])).rows[0];

// get-next-question: new instance with correct_answer = content.correct (normalizeContent).
async function serve(pg, uid, questionId) {
  const { rows } = await pg.query(
    `INSERT INTO public.question_instances (student_id, question_id, correct_answer, next_review_at)
     SELECT $1, q.id, q.content->>'correct', now() FROM public.questions q WHERE q.id = $2 AND q.is_active
     RETURNING id`, [uid, questionId]);
  assert.equal(rows.length, 1, "an active question can be served");
  return rows[0].id;
}

// process-event, short-text path: same guards and the same evaluator call as index.ts.
async function answer(pg, uid, instanceId, given) {
  if (!instanceId || !given) return { http: 400, rpc: null };   // "Missing required fields"
  const { rows } = await pg.query(
    `SELECT qi.correct_answer, qi.student_id, q.content FROM public.question_instances qi
       JOIN public.questions q ON q.id = qi.question_id WHERE qi.id = $1`, [instanceId]);
  const inst = rows[0];
  if (!inst) return { http: 500, rpc: null };
  if (inst.student_id !== uid) return { http: 403, rpc: null };
  const isCorrect = isTextAnswerCorrect(given, inst.correct_answer, inst.content?.accepted_answers);
  const rpc = (await pg.query("SELECT public.process_text_answer($1, $2, $3, $4) AS r",
    [instanceId, uid, given, isCorrect])).rows[0].r;
  return { http: 200, status: isCorrect ? "correct" : "incorrect", rpc };
}

// ── The migration itself ─────────────────────────────────────────────────────────────────────

test("the file sorts after the newest live migration and is a single DO block", () => {
  const files = readdirSync(join(ROOT, "supabase", "migrations")).filter((f) => /^\d{14}_.+\.sql$/.test(f)).sort();
  assert.ok(files.includes(FILE));
  assert.ok(FILE.slice(0, 14) > "20261010100958", "after the newest remote version (profiles_select_caller_scope)");
  const code = MIGRATION.replace(/--.*$/gm, "").trim();
  assert.match(code, /^DO \$stav_til\$[\s\S]*\$stav_til\$;$/, "everything is one statement: all or nothing");
  assert.equal(/\b(CREATE|ALTER|DROP|GRANT|REVOKE|TRUNCATE|POLICY)\b/i.test(code), false, "no schema or privilege change");
  assert.equal(/\bDELETE\b/i.test(code), false, "the forward migration deletes nothing");
});

test("before: no active text question; after: exactly Polen and Norge are active text questions", async () => {
  const pg = await db();
  assert.equal((await pg.query("SELECT 1 FROM public.questions WHERE is_active AND answer_format = 'text'")).rows.length, 0);
  await pg.exec(MIGRATION);
  const active = (await pg.query(
    "SELECT id FROM public.questions WHERE is_active AND answer_format = 'text' AND answer_type = 'short' ORDER BY id")).rows.map((r) => r.id);
  assert.deepEqual(active, [NORGE, POLEN].sort());
});

test("Polen: activated, content unchanged apart from the added review_text, deactivation cleared", async () => {
  const pg = await db();
  const before = await row(pg, POLEN);
  await pg.exec(MIGRATION);
  const after = await row(pg, POLEN);
  assert.equal(after.is_active, true);
  assert.equal(after.deactivated_at, null);
  assert.equal(after.deactivation_reason, null);
  const { review_text, ...rest } = after.content;
  assert.deepEqual(rest, POLEN_CONTENT, "question, correct and accepted_answers are untouched");
  assert.match(review_text, /^Tyskland angreb Polen den 1\. september 1939\./);
  assert.ok(review_text.includes("Storbritannien") && review_text.includes("Anden Verdenskrig"));
  for (const col of ["type", "difficulty", "question_type", "learning_objective", "answer_format", "answer_type",
                     "metadata", "target_grade", "difficulty_band", "content_hash", "batch_id", "created_at"]) {
    assert.deepEqual(after[col], before[col], `${col} unchanged`);
  }
});

test("Norge: inserted with the fixed UUID, the agreed text, one accepted answer and Polen's placement", async () => {
  const pg = await db({ migrated: true });
  const n = await row(pg, NORGE);
  assert.ok(n);
  assert.equal(n.is_active, true);
  assert.equal(n.answer_format, "text");
  assert.equal(n.answer_type, "short");
  assert.equal(n.type, "text_input");
  assert.equal(n.question_type, "auto");
  assert.equal(n.learning_objective, "world_war_2");
  assert.equal(n.target_grade, 7);
  assert.equal(n.difficulty_band, 1);
  assert.equal(n.content.question, "Hvilket land besatte Tyskland samme dag som Danmark, den 9. april 1940?");
  assert.equal(n.content.correct, "Norge");
  assert.deepEqual(n.content.accepted_answers, ["Norge"]);
  assert.equal("options" in n.content, false);
  assert.match(n.content.review_text, /^Den 9\. april 1940 besatte Tyskland både Danmark og Norge\./);
  assert.deepEqual(n.metadata, (await row(pg, POLEN)).metadata, "same metadata pattern as Polen");
});

test("Belgien and every other question are byte-for-byte unchanged", async () => {
  const pg = await db();
  const before = (await allQuestions(pg)).filter((r) => r.id !== POLEN);
  await pg.exec(MIGRATION);
  const after = (await allQuestions(pg)).filter((r) => r.id !== POLEN && r.id !== NORGE);
  assert.deepEqual(after, before);
  assert.equal((await row(pg, BELGIEN)).is_active, false);
});

test("Danish characters survive: æ, ø and å are stored as real characters, never mojibake", async () => {
  const pg = await db({ migrated: true });
  const texts = [(await row(pg, POLEN)).content.review_text, (await row(pg, NORGE)).content.review_text,
                 (await row(pg, NORGE)).content.question];
  const joined = texts.join(" ");
  assert.ok(/[æøå]/.test(joined));
  assert.equal(/Ã|�|\bae\b|\boe\b|\baa\b/.test(joined), false);
});

// ── Preconditions: any drift stops the migration and changes nothing ─────────────────────────

const PRECONDITION_DRIFT = [
  ["Polen already active", `UPDATE public.questions SET is_active = true, deactivated_at = NULL, deactivation_reason = NULL WHERE id = '${POLEN}'`],
  ["Polen content changed", `UPDATE public.questions SET content = content || '{"correct":"Polen "}' WHERE id = '${POLEN}'`],
  ["Polen accepted_answers changed", `UPDATE public.questions SET content = jsonb_set(content, '{accepted_answers}', '["Polen","Poland"]') WHERE id = '${POLEN}'`],
  ["Polen moved to another format", `UPDATE public.questions SET answer_type = 'long' WHERE id = '${POLEN}'`],
  ["Polen missing", `DELETE FROM public.questions WHERE id = '${POLEN}'`],
  ["Norge UUID taken", `INSERT INTO public.questions (id, type, content, difficulty, is_active, question_type, learning_objective, answer_format) VALUES ('${NORGE}', 'text_input', '{"question":"x","correct":"x"}', 1, false, 'auto', 'world_war_2', 'text')`],
  ["another text question already active", `UPDATE public.questions SET is_active = true WHERE id = '${BELGIEN}'`],
];

for (const [label, drift] of PRECONDITION_DRIFT) {
  test(`precondition: ${label} → the migration raises and changes nothing`, async () => {
    const pg = await db({ extra: drift });
    const before = await allQuestions(pg);
    await assert.rejects(pg.exec(MIGRATION), /stav til:/);
    assert.deepEqual(await allQuestions(pg), before);
  });
}

test("a second run fails loudly and changes nothing", async () => {
  const pg = await db({ migrated: true });
  const before = await allQuestions(pg);
  await assert.rejects(pg.exec(MIGRATION), /stav til: Polen-spørgsmålet .* forventede udgangstilstand/);
  assert.deepEqual(await allQuestions(pg), before);
});

// ── Rollback ─────────────────────────────────────────────────────────────────────────────────

test("rollback restores the exact pre-migration questions table when Norge was never served", async () => {
  const pg = await db();
  const before = await allQuestions(pg);
  await pg.exec(MIGRATION);
  await pg.exec(ROLLBACK);
  assert.deepEqual(await allQuestions(pg), before);
});

test("rollback keeps pupil history: a served Norge is deactivated, not deleted", async () => {
  const pg = await db({ migrated: true });
  const inst = await serve(pg, P1, NORGE);
  await answer(pg, P1, inst, "Norge");
  await pg.exec(ROLLBACK);
  const n = await row(pg, NORGE);
  assert.ok(n, "the row still exists");
  assert.equal(n.is_active, false);
  assert.equal(n.deactivation_reason, "stav_til_rollback");
  assert.equal((await row(pg, POLEN)).is_active, false);
  assert.equal("review_text" in (await row(pg, POLEN)).content, false);
  assert.equal((await pg.query("SELECT 1 FROM public.question_instances WHERE id = $1", [inst])).rows.length, 1);
});

test("rollback run twice fails loudly instead of silently doing nothing", async () => {
  const pg = await db({ migrated: true });
  await pg.exec(ROLLBACK);
  await assert.rejects(pg.exec(ROLLBACK), /rollback:/);
});

// ── The answer journey on the migrated questions (mock pupils, no production data) ───────────

test("correct answer: rewarded once with 10 XP and 5 coins", async () => {
  const pg = await db({ migrated: true });
  const inst = await serve(pg, P1, POLEN);
  const r = await answer(pg, P1, inst, "Polen");
  assert.deepEqual(r, { http: 200, status: "correct", rpc: "rewarded" });
  assert.deepEqual(await progress(pg, P1), { xp: 10, coins: 5, correct_answers: 1, total_correct_answers: 1 });
});

test("correct answer with case, spacing and end punctuation still counts (normalisation only)", async () => {
  const pg = await db({ migrated: true });
  for (const [uid, given] of [[P1, "  polen. "], [P2, "NORGE!"]]) {
    const inst = await serve(pg, uid, given.toLowerCase().includes("polen") ? POLEN : NORGE);
    assert.equal((await answer(pg, uid, inst, given)).status, "correct", given);
  }
});

test("wrong answers: recorded, no XP — including near-misses (no fuzzy, no substring)", async () => {
  const wrong = ["Tyskland", "Poland", "Pole", "Polenn", "Republikken Polen", "Norg", "Sverige", "Norway"];
  for (const given of wrong) {
    const pg = await db({ migrated: true });
    const q = /^(Nor|Sver)/.test(given) ? NORGE : POLEN;
    const inst = await serve(pg, P1, q);
    const r = await answer(pg, P1, inst, given);
    assert.deepEqual(r, { http: 200, status: "incorrect", rpc: "recorded" }, given);
    assert.deepEqual(await progress(pg, P1), { xp: 0, coins: 0, correct_answers: 0, total_correct_answers: 0 }, given);
  }
});

test("accepted alternative: a variant listed in accepted_answers counts; an unlisted one does not", async () => {
  // Mock question only (not part of the migration): proves the accepted_answers path end to end.
  const MOCK = "00000000-0000-4000-8000-00000000a1a1";
  const pg = await db({
    migrated: true,
    extra: `INSERT INTO public.questions (id, type, content, difficulty, is_active, question_type, learning_objective, answer_format, answer_type)
            VALUES ('${MOCK}', 'text_input', '{"question":"Mock","correct":"Holland","accepted_answers":["Holland","Nederlandene"]}',
                    1, false, 'auto', 'world_war_2', 'text', 'short')`,
  });
  await pg.exec(`UPDATE public.questions SET is_active = true WHERE id = '${MOCK}'`);
  const a = await serve(pg, P1, MOCK);
  assert.equal((await answer(pg, P1, a, "nederlandene")).rpc, "rewarded");
  const b = await serve(pg, P2, MOCK);
  assert.equal((await answer(pg, P2, b, "Nederland")).rpc, "recorded");
  // The real questions accept exactly their one answer.
  assert.deepEqual((await row(pg, POLEN)).content.accepted_answers, ["Polen"]);
  assert.deepEqual((await row(pg, NORGE)).content.accepted_answers, ["Norge"]);
});

test("empty answer: rejected before evaluation (400) and the instance stays open", async () => {
  const pg = await db({ migrated: true });
  const inst = await serve(pg, P1, POLEN);
  assert.deepEqual(await answer(pg, P1, inst, ""), { http: 400, rpc: null });
  const { rows } = await pg.query("SELECT answered FROM public.question_instances WHERE id = $1", [inst]);
  assert.equal(rows[0].answered, false);
  assert.deepEqual(await progress(pg, P1), { xp: 0, coins: 0, correct_answers: 0, total_correct_answers: 0 });
  // The evaluator never treats blank text as correct, even against a blank-looking key.
  assert.equal(isTextAnswerCorrect("   ", "Polen", ["Polen"]), false);
});

test("reward exactly once: a retry or a second answer on the same instance pays nothing more", async () => {
  const pg = await db({ migrated: true });
  const inst = await serve(pg, P1, POLEN);
  assert.equal((await answer(pg, P1, inst, "Polen")).rpc, "rewarded");
  assert.equal((await answer(pg, P1, inst, "Polen")).rpc, "already_processed");
  assert.equal((await answer(pg, P1, inst, "polen")).rpc, "already_processed");
  assert.deepEqual(await progress(pg, P1), { xp: 10, coins: 5, correct_answers: 1, total_correct_answers: 1 });
  const calls = (await pg.query("SELECT fn, count(*)::int AS n FROM public.helper_calls GROUP BY fn ORDER BY fn")).rows;
  assert.deepEqual(calls, [{ fn: "quest", n: 1 }, { fn: "update_streak", n: 1 }, { fn: "weekly", n: 1 }]);
});

test("a wrong first answer cannot be overwritten by a correct retry", async () => {
  const pg = await db({ migrated: true });
  const inst = await serve(pg, P1, NORGE);
  assert.equal((await answer(pg, P1, inst, "Sverige")).rpc, "recorded");
  assert.equal((await answer(pg, P1, inst, "Norge")).rpc, "already_processed");
  const { rows } = await pg.query("SELECT was_correct, user_answer FROM public.question_instances WHERE id = $1", [inst]);
  assert.deepEqual(rows[0], { was_correct: false, user_answer: "Sverige" });
  assert.equal((await progress(pg, P1)).xp, 0);
});

test("another pupil cannot answer someone else's instance (403, nothing paid)", async () => {
  const pg = await db({ migrated: true });
  const inst = await serve(pg, P1, POLEN);
  assert.deepEqual(await answer(pg, P2, inst, "Polen"), { http: 403, rpc: null });
  assert.equal((await progress(pg, P2)).xp, 0);
});

test("text questions are never reopened by request_repeat_question, so no second reward that way", async () => {
  const pg = await db({ migrated: true });
  for (const q of [POLEN, NORGE, MC]) {
    const inst = await serve(pg, P1, q);
    if (q === MC) {
      await pg.query("UPDATE public.question_instances SET answered = true, was_correct = false, answered_at = now() WHERE id = $1", [inst]);
    } else {
      await answer(pg, P1, inst, "forkert");
    }
  }
  await pg.query("SELECT set_config('test.uid', $1, false)", [P1]);
  // Repeat three rounds: each time the only candidate handed back is the MC instance.
  for (let round = 0; round < 3; round++) {
    const reopened = (await pg.query("SELECT public.request_repeat_question(7::smallint, ARRAY['world_war_2']) AS id")).rows[0].id;
    assert.ok(reopened, `round ${round}: a repeat is offered`);
    const { rows } = await pg.query("SELECT question_id FROM public.question_instances WHERE id = $1", [reopened]);
    assert.equal(rows[0].question_id, MC, `round ${round}: only the MC instance is reopened`);
    await pg.query("UPDATE public.question_instances SET answered = true, was_correct = false, answered_at = now() WHERE id = $1", [reopened]);
  }
  const text = (await pg.query(
    "SELECT answered, repeat_count FROM public.question_instances qi JOIN public.questions q ON q.id = qi.question_id WHERE q.answer_format = 'text' ORDER BY qi.question_id")).rows;
  assert.deepEqual(text, [{ answered: true, repeat_count: 0 }, { answered: true, repeat_count: 0 }],
    "both text instances stay answered and are never reopened");
  assert.deepEqual(await progress(pg, P1), { xp: 0, coins: 0, correct_answers: 0, total_correct_answers: 0 });
});
