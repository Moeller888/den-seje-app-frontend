-- Fagskift: frigiv et åbent spørgsmål fra det andet fag.
--
-- PROBLEMET
-- idx_one_open_question tillader kun ÉT ubesvaret question_instance pr. elev. get-next-question
-- viser derfor altid det åbne spørgsmål først. Med fag-vælgeren (PR #275) betød det, at en elev,
-- der åbnede Engelsk, først fik sit gamle, åbne historiespørgsmål — nogle har ligget åbne siden juni.
--
-- LØSNINGEN
-- Når eleven er i ét fag, og det åbne spørgsmål hører til et andet fag, slettes det åbne
-- instance. Et ubesvaret instance uden gemt svar er kun en reservation: det bærer ingen XP, mønter,
-- svar eller lærervurdering. Spørgsmålet kommer tilbage i puljen (get_unserved_questions udelukker
-- kun spørgsmål, der har et instance) og dukker op igen senere i sit eget fag.
--
-- HVAD DER ALDRIG SLETTES
--   * besvarede instances (answered = true)
--   * åbne instances med et gemt svar (user_answer IS NOT NULL) — det er lange svar, der venter på
--     læreren, og de skal blive i lærerens kø
--   * åbne instances inden for de domæner, kalderen sender (samme fag)
--   * andre elevers rækker — kun auth.uid()'s egne
--
-- KALDER
-- get-next-question kalder funktionen med elevens JWT, før det åbne spørgsmål hentes, og sender
-- fagets domæner: ['english'] for engelsk, alle historiedomæner for historie (ikke lærerens filter —
-- kun fagskift frigiver, et lærerfilter-skift gør ikke).
--
-- question_instances har ingen DELETE-policy for elever, derfor SECURITY DEFINER.
-- Ingen andre tabeller refererer til question_instances (ingen FK), verificeret 2026-10-01.
-- search_path er låst til public. EXECUTE kun til authenticated.

CREATE OR REPLACE FUNCTION public.release_open_question_outside(p_domains text[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_count   INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_domains IS NULL OR array_length(p_domains, 1) IS NULL THEN
    RAISE EXCEPTION 'invalid_domains';
  END IF;

  DELETE FROM public.question_instances qi
  USING  public.questions q
  WHERE  qi.question_id = q.id
    AND  qi.student_id  = v_user_id
    AND  qi.answered    = false
    AND  qi.user_answer IS NULL
    AND  (q.learning_objective IS NULL OR NOT (q.learning_objective = ANY (p_domains)));

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.release_open_question_outside(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_open_question_outside(text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.release_open_question_outside(text[]) TO authenticated;

COMMENT ON FUNCTION public.release_open_question_outside(text[]) IS
  'Fagskift: sletter kalderens åbne, ubesvarede instance uden gemt svar, hvis spørgsmålet ligger uden for p_domains. Returnerer antal frigivne rækker (0 eller 1).';
