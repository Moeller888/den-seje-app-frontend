-- ============================================================================
-- Engelsk 5.000: rettelse af ni inaktive engelskopgaver fra pilot og batch 2-4 (ejerens godkendelse
-- 2026-11-13; runbookens §2.8, "Åbne punkter før aktivering" og "Til ejerens vurdering").
--
-- IKKE ANVENDT I PRODUKTIONEN. Anvendelse kræver særskilt ejergodkendelse (D-110,
-- docs/migration-workflow-policy.md): kun apply_migration, aldrig `supabase db push`. Intet aktiveres:
-- alle ni rækker er og forbliver is_active = false.
--
-- De anvendte INSERT-filer (pilot_2, batch2_2, batch3_2, batch3_3, batch4_1, batch4_2) er bevidst
-- uændrede, så de fortsat svarer til migrationsloggen og produktionslogsenes indholdsfingeraftryk.
-- Denne fil er rettelsen af både repoet og de levende rækker.
--
-- HVAD ÆNDRES (og intet andet): kun nøglerne review_text og question i questions.content for de ni
-- række-id'er nedenfor. Facit, svarmuligheder, accepted_answers, metadata, niveau og is_active er uændrede.
--   Forklaringen er rettet (syv fejl fra §2.8):
--     5a26a219-5e47-493b-871b-dca3ae781da0  pilot   "She has a ___ memory …"           (sharp)
--     3cf224e8-b08a-4ab3-b4d8-de4d72f09e6e  batch2  "Hvad betyder 'suppose' …"         (formoder)
--     bc9fddd1-bfc2-42c1-a25f-edca68d1df90  batch3  "Supposing he ___ the truth …"     (knew)
--     d5ed354d-186e-4ab2-9b8d-f5dd4dfd297a  batch3  "Hvad betyder 'unanimous'?"        (enstemmig)
--     aebc0b79-f77b-4621-a4ac-9ce3fa867522  batch4  "Hvad betyder 'Sounds good!'?"     (Det lyder godt!)
--     6668f28f-7951-4888-b7fa-5b7d274781f3  batch4  "… det modsatte af 'maximum'?"     (minimum)
--   Opgaven er omskrevet til et neutralt emne (ejerens vurdering af rygning og krig):
--     15372b8d-039e-4125-9f34-fe7900142433  batch4  krig → London, og forklaringen    (fem år)
--     214ebebf-2f13-4ec4-b7ff-03be35eb2d8a  batch3  "heavy smoker" → "heavy traffic"  (heavy)
--     29c46027-0fab-416f-b689-f444782e9a1f  batch4  "used to smoke" → "used to play football" (used)
--
-- VAGTER (hver afbryder hele migrationen, og intet ændres):
--   * alle ni rækker findes, er engelske, inaktive, i den forventede level_batch og har præcis det
--     gennemgåede indhold (md5 af content::text, læst i produktionen 2026-11-13);
--   * ingen af dem har en question_instances-række (de har aldrig været vist til en elev);
--   * præcis ni rækker ændres, og hver ender med præcis det forventede indhold (md5 nedenfor).
-- En anden kørsel finder ikke det gennemgåede indhold og afbryder uden at ændre noget.
--
-- Den samme rettelse af 'unanimous' er ført ind i den pauserede, uanvendte batch7_3 gennem
-- tools/questions/build-english-5000.mjs (REVIEW_TEXT_CORRECTIONS), ikke ved håndrettelse af filen.
--
-- TILBAGERULNING (kun med særskilt ejergodkendelse): sæt de gamle værdier af review_text og question
-- tilbage for de ni id'er; de står i runbookens §2.8 og i produktionslogsene for pilot og batch 2-4.
-- ============================================================================

DO $fix$
DECLARE
  -- One object per question: the reviewed content (old_md5), the content after the fix (new_md5) and
  -- the new texts. question = null keeps the question text.
  v_fix jsonb := $j$[
    {"id": "5a26a219-5e47-493b-871b-dca3ae781da0", "level_batch": "pilot", "old_md5": "0e529d3d92ccf55691a1716b524e124b", "new_md5": "c804e426c28141d25fe2838cc60bf101", "question": null, "review_text": "Man siger 'a sharp memory' om en, der husker alt. 'Heavy', 'high' og 'wide' bruger man ikke om hukommelse."},
    {"id": "3cf224e8-b08a-4ab3-b4d8-de4d72f09e6e", "level_batch": "batch2", "old_md5": "4a81b562b2a186cd3bc14f1ebc2d7578", "new_md5": "cdd6784b81aa76e7986a4a57dc243144", "question": null, "review_text": "'Suppose' betyder formode eller tro. 'I suppose you're right' = Jeg formoder, du har ret."},
    {"id": "bc9fddd1-bfc2-42c1-a25f-edca68d1df90", "level_batch": "batch3", "old_md5": "ed10d888a9ed72f8954028e15ea36c5d", "new_md5": "0fa7429285cd02f6ee4ac205272bda94", "question": null, "review_text": "'Supposing' virker som 'if'. Når man forestiller sig noget, der ikke er sandt nu, bruger man datid: supposing he knew … what would you do?"},
    {"id": "d5ed354d-186e-4ab2-9b8d-f5dd4dfd297a", "level_batch": "batch3", "old_md5": "5b3e99f21a6242ad46c065ba21a6f290", "new_md5": "7770fbb43d7363ae31b6b5a43c737bbd", "question": null, "review_text": "'Unanimous' betyder enstemmig: alle er enige. Pas på, det ligner 'anonym', men anonym hedder 'anonymous' på engelsk."},
    {"id": "aebc0b79-f77b-4621-a4ac-9ce3fa867522", "level_batch": "batch4", "old_md5": "4e2a93beb361dcca5e1a8057b8aa36e4", "new_md5": "0b5f06c458405a383e53bde63cfe2b2a", "question": null, "review_text": "'Sounds good!' siger man, når man er med på et forslag: Det lyder godt!"},
    {"id": "6668f28f-7951-4888-b7fa-5b7d274781f3", "level_batch": "batch4", "old_md5": "4aadd3c8414ca694718093732ae14939", "new_md5": "8b54516d45fd3fc5f1545257525b57b1", "question": null, "review_text": "Det modsatte af 'maximum' (det højeste) er 'minimum' (det laveste). 'Maximal' betyder næsten det samme som maximum."},
    {"id": "15372b8d-039e-4125-9f34-fe7900142433", "level_batch": "batch4", "old_md5": "d1295c85ab5ceb7c3bc854d864306a2c", "new_md5": "adb22966c0f7b9cb67dd51053cc538e3", "question": "Læs: 'My grandfather was only eighteen when he moved to London, and he was twenty-three when he came back.' Hvor længe boede han i London?", "review_text": "Han var 18, da han flyttede, og 23, da han kom hjem: 23 − 18 = 5 år."},
    {"id": "214ebebf-2f13-4ec4-b7ff-03be35eb2d8a", "level_batch": "batch3", "old_md5": "3762601360a47b9c96bfb40e49f0704f", "new_md5": "504d78d618c1a2236f33e907b3320415", "question": "Hvilket ord passer: 'There was ___ traffic, so we were late.'", "review_text": "Man siger 'heavy traffic' om meget trafik, ikke 'strong' eller 'big traffic'."},
    {"id": "29c46027-0fab-416f-b689-f444782e9a1f", "level_batch": "batch4", "old_md5": "19b407cb3ff3fe57c0759af3b9a89961", "new_md5": "aa39fe1255237fa8a8d3edda4de891ba", "question": "Hvilket ord passer: 'My grandfather ___ to play football, but he stopped years ago.'", "review_text": "'Used to' = plejede at."}
  ]$j$;
  v_reviewed integer;
  v_used     integer;
  v_rows     integer;
  v_done     integer;
BEGIN
  PERFORM 1
    FROM public.questions q
    JOIN jsonb_to_recordset(v_fix) AS f(id uuid) ON f.id = q.id
     FOR UPDATE OF q;

  SELECT count(*) INTO v_reviewed
    FROM public.questions q
    JOIN jsonb_to_recordset(v_fix) AS f(id uuid, level_batch text, old_md5 text) ON f.id = q.id
   WHERE q.is_active = false
     AND q.learning_objective = 'english'
     AND q.metadata ->> 'level_batch' = f.level_batch
     AND md5(q.content::text) = f.old_md5;
  IF v_reviewed <> 9 THEN
    RAISE EXCEPTION 'english review fix: expected 9 inactive questions with the reviewed content, found %; nothing changed', v_reviewed;
  END IF;

  SELECT count(*) INTO v_used
    FROM public.question_instances i
    JOIN jsonb_to_recordset(v_fix) AS f(id uuid) ON f.id = i.question_id;
  IF v_used <> 0 THEN
    RAISE EXCEPTION 'english review fix: % question_instances row(s) on these questions; nothing changed', v_used;
  END IF;

  UPDATE public.questions q
     SET content = q.content
                   || jsonb_build_object('review_text', f.review_text)
                   || CASE WHEN f.question IS NULL THEN '{}'::jsonb
                           ELSE jsonb_build_object('question', f.question) END
    FROM jsonb_to_recordset(v_fix) AS f(id uuid, old_md5 text, question text, review_text text)
   WHERE q.id = f.id
     AND q.is_active = false
     AND md5(q.content::text) = f.old_md5;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 9 THEN
    RAISE EXCEPTION 'english review fix: changed % rows, expected 9', v_rows;
  END IF;

  SELECT count(*) INTO v_done
    FROM public.questions q
    JOIN jsonb_to_recordset(v_fix) AS f(id uuid, new_md5 text) ON f.id = q.id
   WHERE q.is_active = false
     AND md5(q.content::text) = f.new_md5;
  IF v_done <> 9 THEN
    RAISE EXCEPTION 'english review fix: % of 9 questions ended with the expected content', v_done;
  END IF;
END
$fix$;
