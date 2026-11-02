# D-316 — tilbagerulning af frigivelsen ved inaktive spørgsmål

Migration: `supabase/migrations/20261102100000_release_open_rounds_on_inactive_questions.sql`
([D-316](../decisions/D-316.md)).

**Status:** IKKE ANVENDT I PRODUKTIONEN. Både anvendelse og tilbagerulning kræver ejerens særskilte
godkendelse (D-110). Kør tilbagerulningen som ét `apply_migration`-kald.

Tilbagerulningen genskaber `release_open_question_outside` med den krop, som `20261002000000` gav den,
byte for byte. Det er md5 `7b7693b3bff869a113e8e97e16bb456a`, den samme som produktionen kørte før
D-316. Signatur, `SECURITY DEFINER`, `search_path`, EXECUTE og kommentar bliver som før. Ingen række
ændres.

Bagefter frigives en åben runde på et inaktivt spørgsmål igen kun ved et fagskift. Runder, der allerede
er frigivet, kommer ikke tilbage: slettede første runder er væk, og lukkede gentagelser forbliver
lukkede. H5-bootstrappen accepterer begge kroppe.

```sql
-- ROLLBACK D-316 — restores release_open_question_outside exactly as 20261002000000 created it.
DO $rollback$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_catalog.pg_proc
      WHERE oid = to_regprocedure('public.release_open_question_outside(text[])')) IS DISTINCT FROM 'ecbaa6bcce3940f4a8607526f5fd756a' THEN
    RAISE EXCEPTION 'ROLLBACK D-316: release_open_question_outside does not have D-316''s body; nothing changed';
  END IF;
END
$rollback$;

CREATE OR REPLACE FUNCTION public.release_open_question_outside(p_domains text[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_closed  INTEGER;
  v_deleted INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_domains IS NULL OR array_length(p_domains, 1) IS NULL THEN
    RAISE EXCEPTION 'invalid_domains';
  END IF;

  UPDATE public.question_instances qi
  SET    answered    = true,
         answered_at = now()
  FROM   public.questions q
  WHERE  qi.question_id  = q.id
    AND  qi.student_id   = v_user_id
    AND  qi.answered     = false
    AND  qi.user_answer IS NULL
    AND  qi.repeat_count > 0
    AND  (q.learning_objective IS NULL OR NOT (q.learning_objective = ANY (p_domains)));

  GET DIAGNOSTICS v_closed = ROW_COUNT;

  DELETE FROM public.question_instances qi
  USING  public.questions q
  WHERE  qi.question_id  = q.id
    AND  qi.student_id   = v_user_id
    AND  qi.answered     = false
    AND  qi.user_answer IS NULL
    AND  qi.repeat_count = 0
    AND  (q.learning_objective IS NULL OR NOT (q.learning_objective = ANY (p_domains)));

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN v_closed + v_deleted;
END;
$function$;

REVOKE ALL ON FUNCTION public.release_open_question_outside(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_open_question_outside(text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.release_open_question_outside(text[]) TO authenticated;

COMMENT ON FUNCTION public.release_open_question_outside(text[]) IS
  'Fagskift: frigiver kalderens åbne, ubesvarede instance uden gemt svar, hvis spørgsmålet ligger uden for p_domains. Et nyt spørgsmål slettes; et gensyn (repeat_count > 0) lukkes igen i stedet, så det aldrig kan serveres som nyt med fuld belønning. Returnerer antal frigivne rækker (0 eller 1).';
```

**Efterkontrol (kun læsning):** `release_open_question_outside` har md5
`7b7693b3bff869a113e8e97e16bb456a` og er `SECURITY DEFINER` med `search_path=public`. EXECUTE er kun
givet til `authenticated` og ejeren.
