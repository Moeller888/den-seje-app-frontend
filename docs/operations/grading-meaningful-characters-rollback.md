# Bedømmelse med betydningsbærende tegn (D-290, G1): anvendelse og tilbagerulning

Gælder `supabase/migrations/20261101150000_grading_meaningful_characters.sql`
(D-290, baggrund i D-285).

**Status:** IKKE ANVENDT I PRODUKTIONEN. Både anvendelse og tilbagerulning kræver ejerens særskilte
godkendelse (D-110, [migration-workflow-policy.md](../migration-workflow-policy.md)).

## 1. Før anvendelse (kun læsning)

1. `process_question_attempt(uuid,uuid,text,bigint)` har `md5(prosrc)`
   `328ea8f9a4fd260407b582dcecb7dfdf`, `search_path=public, pg_temp`, `SECURITY DEFINER` og ACL
   `{postgres=X/postgres,service_role=X/postgres}`. Kontrolleret read-only 2026-11-01. Vagten afbryder
   selv ved en anden krop.
2. `normalize_choice_answer` og `normalize_number_answer` findes ikke.
3. Rapporten fra K5 (`tools/questions/validate-evidence.mjs --grading new`) på en read-only eksport
   af de aktive opgaver viser 0 `wrong_option_accepted`, 0 `key_empty_after_normalise` og 0
   `key_not_an_option`.
4. Testene er grønne på commit'en:
   - `tests/unit/grading-meaningful-characters-migration-run.test.mjs`;
   - `tests/unit/answer-normalize-sql-parity.test.mjs`.

## 2. Anvendelse

`apply_migration` med filens indhold ordret fra den godkendte commit, navn
`grading_meaningful_characters`. Ét kald. Fjern derefter filen fra `NOT_IN_PRODUCTION` i
`tests/isolated/schema/replay-plan.mjs`, når anvendelsen er verificeret.

## 3. Efter anvendelse (kun læsning)

1. `process_question_attempt`: `md5(prosrc)` `2e05e769a102f61ffef0ea4dd550c55b`. ACL, `search_path` og `SECURITY DEFINER`
   er uændrede.
2. Begge hjælpefunktioner findes. De er `IMMUTABLE`, har `search_path=""`, og ingen API-rolle har
   EXECUTE.
3. Production Smoke (særskilt godkendelse): et korrekt MC-svar giver stadig 10 XP og 5 mønter.
4. De to opgaver fra D-290 G2 kan derefter genaktiveres (særskilt godkendelse).

## 4. Tilbagerulning

Genskaber produktionens præcise krop (`md5(prosrc)` `328ea8f9…`) og fjerner de to hjælpefunktioner.
Ingen rækker ændres.

```sql
-- ROLLBACK D-290 G1 — restores process_question_attempt (md5(prosrc) 328ea8f9…) and drops the helpers.
CREATE OR REPLACE FUNCTION public.process_question_attempt(p_student_id uuid, p_question_instance_id uuid, p_answer text, p_question_shown_at bigint)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_instance       record;
  v_correct        boolean := false;
  v_answer         text;
  v_correct_answer text;
  v_rows_updated   integer;
  v_is_repeat      boolean := false;
  v_xp             integer := 0;
  v_coins          integer := 0;
  v_orthography_aliases jsonb;
BEGIN

  SELECT qi.*, q.answer_format, q.content AS question_content, q.metadata AS question_metadata
  INTO v_instance
  FROM question_instances qi
  JOIN questions q ON q.id = qi.question_id
  WHERE qi.id         = p_question_instance_id
    AND qi.student_id = p_student_id;

  IF v_instance IS NULL THEN
    RAISE EXCEPTION 'Instance not found';
  END IF;

  -- Only reviewed earlier versions of this question's correct option are aliases: an old spelling
  -- and/or an earlier wording, two or more entries, always including the current content.correct.
  -- The stored answer key and all historical pupil answers/results remain unchanged.
  v_orthography_aliases := v_instance.question_metadata->'danish_orthography_correct_aliases';
  IF jsonb_typeof(v_orthography_aliases) IS DISTINCT FROM 'array' THEN
    v_orthography_aliases := '[]'::jsonb;
  END IF;
  IF jsonb_array_length(v_orthography_aliases) >= 2
     AND v_orthography_aliases ? v_instance.correct_answer
     AND v_orthography_aliases ? (v_instance.question_content->>'correct') THEN
    v_instance.correct_answer := v_instance.question_content->>'correct';
  ELSE
    v_orthography_aliases := '[]'::jsonb;
  END IF;

  IF v_instance.answered = true THEN
    RETURN json_build_object(
      'status', CASE
        WHEN v_instance.was_correct = true  THEN 'correct'
        WHEN v_instance.was_correct = false THEN 'incorrect'
        ELSE 'pending'
      END,
      'correct_answer', v_instance.correct_answer
    );
  END IF;

  v_is_repeat := coalesce(v_instance.repeat_count, 0) > 0;

  IF v_instance.answer_format = 'text' THEN
    UPDATE question_instances
    SET answered = true, answered_at = now(), user_answer = p_answer, was_correct = null
    WHERE id = v_instance.id AND answered = false;

    RETURN json_build_object('status', 'pending', 'correct_answer', null);
  END IF;

  v_answer         := trim(regexp_replace(lower(p_answer),                   '[^a-z0-9]', '', 'g'));
  v_correct_answer := trim(regexp_replace(lower(v_instance.correct_answer), '[^a-z0-9]', '', 'g'));

  IF v_answer = v_correct_answer OR v_orthography_aliases ? p_answer THEN
    v_correct := true;
  END IF;

  UPDATE question_instances
  SET
    answered    = true,
    answered_at = now(),
    user_answer = p_answer,
    was_correct = v_correct
  WHERE id       = v_instance.id
    AND answered = false;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  -- A concurrent call already scored this instance: award nothing, report the same result.
  IF v_rows_updated = 0 THEN
    RETURN json_build_object(
      'status',         CASE WHEN v_correct THEN 'correct' ELSE 'incorrect' END,
      'correct_answer', v_instance.correct_answer
    );
  END IF;

  IF v_correct THEN
    IF v_is_repeat THEN
      -- A repeat earns a token amount: 1 coin and 2 XP (D-211, owner decision 2026-10-26).
      -- correct_answers and total_correct_answers stay put: they feed the accuracy figure
      -- teachers read, and re-answers of already known material would inflate it.
      v_coins := 1;
      v_xp    := 2;
      UPDATE student_progress
      SET
        xp    = COALESCE(xp, 0) + v_xp,
        coins = COALESCE(coins, 0) + v_coins
      WHERE student_id = p_student_id;
    ELSE
      v_xp    := 10;
      v_coins := 5;
      UPDATE student_progress
      SET
        xp                    = COALESCE(xp, 0) + v_xp,
        coins                 = COALESCE(coins, 0) + v_coins,
        correct_answers       = COALESCE(correct_answers, 0) + 1,
        total_correct_answers = COALESCE(total_correct_answers, 0) + 1
      WHERE student_id = p_student_id;
    END IF;
  END IF;

  -- A streak measures showing up, which a pupil practising repeats has genuinely done.
  PERFORM public.update_streak(p_student_id);

  -- Quest progress is NOT advanced by repeats: quest rewards are coins, and the pool-exhausted
  -- pupil could otherwise complete quests indefinitely on questions they already know.
  IF NOT v_is_repeat THEN
    PERFORM public.update_quest_progress_for_answer(
      p_student_id,
      v_correct,
      CASE WHEN v_correct THEN 10 ELSE 0 END
    );
    PERFORM public.update_weekly_quest_progress_for_answer(
      p_student_id,
      v_correct,
      CASE WHEN v_correct THEN 10 ELSE 0 END
    );
  END IF;

  RETURN json_build_object(
    'status',         CASE WHEN v_correct THEN 'correct' ELSE 'incorrect' END,
    'correct_answer', v_instance.correct_answer
  );

END;
$function$;

DROP FUNCTION IF EXISTS public.normalize_choice_answer(text);
DROP FUNCTION IF EXISTS public.normalize_number_answer(text);
```
